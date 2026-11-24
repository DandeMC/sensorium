namespace Sensorium.Sensors;

/// <summary>Beschreibung eines Sensors für Katalog, Sensorliste und Zuordnung.</summary>
public sealed record SensorInfo(
    string Id,
    string Name,
    string Hardware,
    string HardwareId,
    string HardwareType,
    string Type,
    string Unit,
    string Source);

/// <summary>Eine Datenquelle (LibreHardwareMonitor, Windows, RTSS …).</summary>
public interface ISensorProvider : IDisposable
{
    string Name { get; }
    IReadOnlyList<SensorInfo> Catalog { get; }
    void Start();
    void Update(Dictionary<string, object?> values);
    /// <summary>true, wenn seit dem letzten Aufruf Sensoren dazugekommen oder weggefallen sind.</summary>
    bool TakeCatalogChange();
}

public sealed class HubStatus
{
    public bool Elevated { get; init; }
    public bool PawnIo { get; init; }
    public bool Rtss { get; set; }
    public bool Ready { get; set; }
    public string? HardwareError { get; set; }
    public bool HaConnected { get; set; }
    public string Ha { get; set; } = "nicht eingerichtet";
}

/// <summary>Ein Messdurchlauf: alle Werte plus fertig serialisiertes JSON für die Weboberfläche.</summary>
public sealed record HubFrame(IReadOnlyDictionary<string, object?> Values, string Json);

/// <summary>
/// Fragt alle Datenquellen im festen Takt ab, wertet die Zuordnungen (cpu.temp usw.) aus
/// und verteilt das Ergebnis. Läuft komplett auf einem Hintergrund-Thread.
/// </summary>
public sealed class SensorHub : IDisposable
{
    private readonly List<ISensorProvider> _providers = new();
    private readonly RtssProvider _rtss;
    private readonly CancellationTokenSource _cts = new();
    private readonly int _intervalMs;
    private Task? _loop;
    private int _profileChanged;

    internal SensorHub(Settings settings)
    {
        _intervalMs = Math.Clamp(settings.IntervalMs, 250, 5000);
        Status = new HubStatus { Elevated = Elevation.IsElevated, PawnIo = HardwareProvider.IsPawnIoInstalled() };
        _rtss = new RtssProvider(settings.FpsIgnore);
        _providers.Add(new HardwareProvider());
        _providers.Add(new SystemProvider());
        _providers.Add(_rtss);
        if (settings.CorsairUsb)
            _providers.Add(new CorsairPlatinumProvider());
        _providers.Add(Ha);
        _providers.Add(Tasmota);
        Aliases.Changed += () => CatalogChanged?.Invoke();
    }

    public AliasStore Aliases { get; } = new();
    public HomeAssistantProvider Ha { get; } = new();
    public TasmotaProvider Tasmota { get; } = new();

    /// <summary>Rechnet eine Formel einmal mit den aktuellen Werten aus (Editor: „Testen“).</summary>
    public (object? Value, string? Error) EvaluateFormula(string expr)
    {
        try
        {
            var formula = Formula.Parse(expr);
            var values = Last?.Values ?? new Dictionary<string, object?>();
            return (formula.Eval((name, _) => values.GetValueOrDefault(name)), null);
        }
        catch (FormatException ex)
        {
            return (null, ex.Message);
        }
    }

    /// <summary>Das Profil (neu) auswerten: benötigte Home-Assistant-Werte, Steckdosen und Formeln.</summary>
    public void ApplyProfile(ProfileRefs refs)
    {
        Ha.SetReferences(refs.HaKeys);
        Tasmota.SetHosts(refs.TasmotaHosts);
        Aliases.SetProfileFormulas(refs.Formulas);
        Interlocked.Exchange(ref _profileChanged, 1);
    }
    public HubStatus Status { get; }
    public IReadOnlyList<SensorInfo> Catalog { get; private set; } = Array.Empty<SensorInfo>();
    public HubFrame? Last { get; private set; }

    /// <summary>Wird nach jedem Durchlauf auf dem Hintergrund-Thread ausgelöst.</summary>
    public event Action<HubFrame>? FrameReady;
    /// <summary>Sensorliste oder Zuordnungen haben sich geändert.</summary>
    public event Action? CatalogChanged;

    public void Start() => _loop = Task.Run(() => RunAsync(_cts.Token));

    private async Task RunAsync(CancellationToken ct)
    {
        foreach (var provider in _providers)
        {
            try
            {
                provider.Start();
            }
            catch (Exception ex)
            {
                Log.Error($"Start {provider.Name}", ex);
                if (provider is HardwareProvider)
                    Status.HardwareError = ex.Message;
            }
        }

        bool first = true;
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(_intervalMs));
        try
        {
            do
            {
                var values = new Dictionary<string, object?>(1024, StringComparer.Ordinal);
                foreach (var provider in _providers)
                {
                    try
                    {
                        provider.Update(values);
                    }
                    catch (Exception ex)
                    {
                        Log.WarnOnce($"update-{provider.Name}-{ex.GetType().Name}", $"Update {provider.Name}: {ex}");
                    }
                }

                bool catalogChanged = first | Interlocked.Exchange(ref _profileChanged, 0) == 1;
                foreach (var provider in _providers)
                    catalogChanged |= provider.TakeCatalogChange();
                if (catalogChanged)
                {
                    Catalog = _providers.SelectMany(p => p.Catalog).ToList();
                    Aliases.Initialize(Catalog, values, reloadFile: first);
                }

                Aliases.Evaluate(values);
                Status.Rtss = _rtss.Available;
                Status.HaConnected = Ha.Connected;
                Status.Ha = Ha.StatusText;
                Status.Ready = true;

                var frame = new HubFrame(values, Protocol.Values(values));
                Last = frame;
                if (catalogChanged)
                    CatalogChanged?.Invoke();
                FrameReady?.Invoke(frame);
                first = false;
            }
            while (await timer.WaitForNextTickAsync(ct).ConfigureAwait(false));
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            Log.Error("Sensor-Schleife", ex);
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _loop?.Wait(3000); } catch { }
        foreach (var provider in _providers)
        {
            try { provider.Dispose(); } catch { }
        }
        _cts.Dispose();
    }
}
