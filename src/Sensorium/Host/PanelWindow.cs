using Microsoft.Win32;

namespace Sensorium.Host;

/// <summary>Randloses Vollbildfenster mit dem Panel auf dem gewählten Monitor.</summary>
internal sealed class PanelWindow : WebWindow
{
    private const int WsExToolWindow = 0x00000080;
    private const int WsExNoActivate = 0x08000000;
    private const int WmMouseActivate = 0x0021;
    private const int MaNoActivate = 3;
    private readonly Settings _settings;

    public PanelWindow(Settings settings, Options options) : base("panel.html", options)
    {
        _settings = settings;
        Text = "Sensorium";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = settings.TopMost;
        ApplyScreen();
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
    }

    public Screen TargetScreen { get; private set; } = Screen.PrimaryScreen!;

    /// <summary>Das Panel soll beim Erscheinen keinem anderen Fenster den Fokus nehmen.</summary>
    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WsExToolWindow;  // nicht in Alt+Tab
            cp.ExStyle |= WsExNoActivate;  // Klicks (Seitenwechsel, Schalter) nehmen dem Spiel nicht den Fokus
            return cp;
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmMouseActivate)
        {
            m.Result = MaNoActivate;
            return;
        }
        base.WndProc(ref m);
    }

    public void ApplyScreen()
    {
        TargetScreen = ScreenPicker.Resolve(_settings);
        Bounds = TargetScreen.Bounds;
    }

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        // Größe nicht von Windows skalieren lassen: das Fenster soll immer genau den Monitor füllen.
        e.Cancel = true;
        base.OnDpiChanged(e);
        BeginInvoke(new Action(() => Bounds = TargetScreen.Bounds));
    }

    private void OnDisplaySettingsChanged(object? sender, EventArgs e)
    {
        if (IsDisposed || !IsHandleCreated)
            return;
        BeginInvoke(new Action(ApplyScreen));
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
        base.Dispose(disposing);
    }
}

/// <summary>Findet den Monitor für das Panel.</summary>
internal static class ScreenPicker
{
    public static Screen Resolve(Settings settings)
    {
        var screens = Screen.AllScreens;
        if (!string.IsNullOrEmpty(settings.Screen))
        {
            var byName = screens.FirstOrDefault(s => s.DeviceName.Equals(settings.Screen, StringComparison.OrdinalIgnoreCase));
            if (byName != null)
                return byName;
        }
        if (settings.ScreenBounds is { Length: 4 } b)
        {
            var bySize = screens.FirstOrDefault(s => s.Bounds.Width == b[2] && s.Bounds.Height == b[3] && !s.Primary)
                         ?? screens.FirstOrDefault(s => s.Bounds.Width == b[2] && s.Bounds.Height == b[3]);
            if (bySize != null)
                return bySize;
        }
        // Standard: der kleinste Zusatzmonitor, sonst der einzige Monitor.
        return screens.Where(s => !s.Primary).OrderBy(s => s.Bounds.Width * s.Bounds.Height).FirstOrDefault()
               ?? Screen.PrimaryScreen
               ?? screens[0];
    }

    public static string Describe(Screen screen) =>
        $"{screen.DeviceName.Replace(@"\\.\", "")} · {screen.Bounds.Width} × {screen.Bounds.Height}" +
        (screen.Primary ? " · Hauptbildschirm" : "");
}
