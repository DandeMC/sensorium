using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;
using System.Text;

namespace Sensorium.Sensors;

/// <summary>
/// Framerate aus dem RivaTuner Statistics Server (RTSS) über dessen Shared Memory.
/// Gezählt wird nur das Programm im Vordergrund – und nur, wenn es nicht auf der
/// Ignorierliste steht (iCUE, Browser, Discord …, siehe Settings.FpsIgnore).
/// Liefert fps.current = 0, wenn kein Spiel läuft, und null, wenn RTSS nicht läuft.
/// </summary>
public sealed class RtssProvider(IEnumerable<string> ignore) : ISensorProvider
{
    private const uint Signature = 0x52545353; // 'RTSS'
    private const int EntryMinimum = 284;
    private readonly HashSet<string> _ignore = new(ignore, StringComparer.OrdinalIgnoreCase);
    private readonly byte[] _nameBuffer = new byte[260];
    private readonly List<SensorInfo> _catalog = new();
    private MemoryMappedFile? _file;
    private MemoryMappedViewAccessor? _view;
    private long _nextTry;

    /// <summary>
    /// So lange gilt ein Spiel nach dem letzten gültigen Messwert noch als aktiv. Verhindert das
    /// Hin- und Herspringen bei kurzen Aussetzern (RTSS schreibt gerade, Fokuswechsel, Ladebildschirm).
    /// </summary>
    private const int HoldMs = 5000;
    private double _heldFps, _heldFrametime;
    private string _heldApp = "";
    private long _heldUntil;

    // Für das Log: Beginn und Ende einer Spielsitzung, überbrückte Aussetzer.
    private bool _gameActive;
    private long _gameStart;
    private int _bridged, _pending;

    public string Name => "RTSS";
    public bool Available { get; private set; }
    public IReadOnlyList<SensorInfo> Catalog => _catalog;
    public bool TakeCatalogChange() => false;

    public void Start()
    {
        const string hw = "RivaTuner Statistics Server";
        _catalog.Add(new SensorInfo("fps.current", "Framerate", hw, "rtss", "Fps", "Fps", "FPS", "rtss"));
        _catalog.Add(new SensorInfo("fps.frametime", "Frametime", hw, "rtss", "Fps", "TimeSpan", "ms", "rtss"));
        _catalog.Add(new SensorInfo("fps.app", "Anwendung", hw, "rtss", "Fps", "Text", "", "rtss"));
    }

    public void Update(Dictionary<string, object?> values)
    {
        double fps = 0, frametime = 0;
        string app = "";
        if (Open())
        {
            try
            {
                Read(ref fps, ref frametime, ref app);
            }
            catch (Exception ex)
            {
                Log.WarnOnce("rtss-read", "RTSS lesen: " + ex.Message);
                Close();
            }
        }
        long now = Environment.TickCount64;
        bool measured = fps > 0;
        if (fps > 0)
        {
            _heldFps = fps;
            _heldFrametime = frametime;
            _heldApp = app;
            _heldUntil = now + HoldMs;
        }
        else if (now < _heldUntil)
        {
            fps = _heldFps;
            frametime = _heldFrametime;
            app = _heldApp;
        }
        LogSession(fps > 0, measured, now, app, fps);

        values["fps.current"] = Available ? fps : null;
        values["fps.frametime"] = Available && fps > 0 ? frametime : null;
        values["fps.app"] = app;
    }

    private void LogSession(bool active, bool measured, long now, string app, double fps)
    {
        // Ein Aussetzer zählt erst, wenn danach wieder Messwerte kommen (sonst war es das Spielende).
        if (active && !measured)
        {
            _pending++;
        }
        else if (active && _pending > 0)
        {
            _bridged++;
            _pending = 0;
        }
        if (active == _gameActive)
            return;
        _gameActive = active;
        if (active)
        {
            _gameStart = now;
            _bridged = 0;
            _pending = 0;
            Log.Info($"Spiel erkannt: {app} ({fps:0} FPS).");
        }
        else
        {
            long seconds = Math.Max(0, now - _gameStart - HoldMs) / 1000;
            Log.Info($"Spiel nicht mehr im Vordergrund: {_heldApp}, {seconds} s, {_bridged} kurze Aussetzer überbrückt.");
            _pending = 0;
        }
    }

    private void Read(ref double fps, ref double frametime, ref string app)
    {
        var view = _view!;
        if (view.ReadUInt32(0) != Signature)
        {
            Close(); // RTSS beendet (Signatur 'DEAD') – später neu verbinden
            return;
        }
        uint version = view.ReadUInt32(4);
        uint entrySize = view.ReadUInt32(8);
        uint arrayOffset = view.ReadUInt32(12);
        uint arraySize = view.ReadUInt32(16);
        if (version < 0x00020000 || entrySize < EntryMinimum || arraySize == 0 || arraySize > 4096)
            return;

        long capacity = view.Capacity;
        uint now = unchecked((uint)Environment.TickCount);
        uint foreground = ForegroundProcessId();
        if (foreground == 0)
            return;

        // Ein Programm kann mehrere Einträge haben (z. B. Startfenster und Spiel). Den aktivsten nehmen.
        for (uint i = 0; i < arraySize; i++)
        {
            long offset = arrayOffset + (long)i * entrySize;
            if (offset + EntryMinimum > capacity)
                break;
            if (view.ReadUInt32(offset) != foreground)
                continue;
            if (!ReadPeriod(view, offset, out uint time0, out uint time1, out uint frames))
                continue; // RTSS schreibt den Eintrag gerade oder es gibt noch keine Messung
            int age = unchecked((int)(now - time1));
            if (age > 3000)
                continue; // veraltet: dieser Eintrag rendert gerade nicht

            view.ReadArray(offset + 4, _nameBuffer, 0, _nameBuffer.Length);
            int length = Array.IndexOf(_nameBuffer, (byte)0);
            string name = Path.GetFileNameWithoutExtension(
                Encoding.Latin1.GetString(_nameBuffer, 0, length < 0 ? _nameBuffer.Length : length));
            if (_ignore.Contains(name))
                return; // kein Spiel (z. B. iCUE, Browser)

            double current = 1000.0 * frames / (time1 - time0);
            if (current > fps)
            {
                fps = current;
                frametime = view.ReadUInt32(offset + 280) / 1000.0; // Mikrosekunden -> ms
                app = name;
            }
        }
    }

    /// <summary>
    /// Liest Messzeitraum und Bildanzahl so lange, bis zwei Lesungen übereinstimmen –
    /// RTSS aktualisiert die Felder einzeln, ein Lesen mittendrin ergäbe Unsinn.
    /// </summary>
    private static bool ReadPeriod(MemoryMappedViewAccessor view, long offset, out uint time0, out uint time1, out uint frames)
    {
        for (int attempt = 0; attempt < 3; attempt++)
        {
            time0 = view.ReadUInt32(offset + 268);
            time1 = view.ReadUInt32(offset + 272);
            frames = view.ReadUInt32(offset + 276);
            bool stable = view.ReadUInt32(offset + 268) == time0
                       && view.ReadUInt32(offset + 272) == time1
                       && view.ReadUInt32(offset + 276) == frames;
            if (stable)
                return frames > 0 && time1 > time0 && time1 - time0 < 10_000;
        }
        time0 = time1 = frames = 0;
        return false;
    }

    private bool Open()
    {
        if (_view != null)
            return true;
        long now = Environment.TickCount64;
        if (now < _nextTry)
            return false;
        _nextTry = now + 5000;
        try
        {
            _file = MemoryMappedFile.OpenExisting("RTSSSharedMemoryV2", MemoryMappedFileRights.Read);
            _view = _file.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read);
            Available = true;
            return true;
        }
        catch (FileNotFoundException)
        {
            Close();
            return false;
        }
        catch (Exception ex)
        {
            Log.WarnOnce("rtss-open", "RTSS: " + ex.Message);
            Close();
            return false;
        }
    }

    private void Close()
    {
        _view?.Dispose();
        _view = null;
        _file?.Dispose();
        _file = null;
        Available = false;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    private static uint ForegroundProcessId()
    {
        IntPtr window = GetForegroundWindow();
        if (window == IntPtr.Zero)
            return 0;
        GetWindowThreadProcessId(window, out uint pid);
        return pid;
    }

    public void Dispose() => Close();
}
