namespace Sensorium.Host;

/// <summary>Testmodus: rendert das Panel (oder die Sensorliste), speichert ein PNG und beendet sich.</summary>
internal sealed class ScreenshotContext : ApplicationContext
{
    private readonly AppSession _session;
    private readonly WebWindow _window;
    private readonly System.Windows.Forms.Timer _timer = new();

    public ScreenshotContext(Options options, Settings settings)
    {
        _session = new AppSession(options, settings);
        _window = options.Page == "sensors"
            ? new SensorsWindow(options)
            : new PanelWindow(settings, options) { TopMost = true };
        _session.Attach(_window);
        _window.Show();

        _timer.Interval = options.DelaySeconds * 1000;
        _timer.Tick += async (_, _) =>
        {
            _timer.Stop();
            try
            {
                ExitCode = await _window.CaptureAsync(options.Screenshot!) ? 0 : 2;
            }
            catch (Exception ex)
            {
                Log.Error("Screenshot", ex);
                ExitCode = 3;
            }
            ExitThread();
        };
        _timer.Start();
    }

    public int ExitCode { get; private set; } = 1;

    protected override void ExitThreadCore()
    {
        _timer.Dispose();
        _window.Close();
        _session.Dispose();
        base.ExitThreadCore();
    }
}
