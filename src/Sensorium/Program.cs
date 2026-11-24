using Sensorium.Host;

namespace Sensorium;

internal static class Program
{
    private const string MutexName = @"Local\Sensorium.SingleInstance";

    [STAThread]
    private static int Main(string[] args)
    {
        var options = Options.Parse(args);
        AppPaths.EnsureCreated();
        Log.Init(options.Probe != null ? "probe" : options.Screenshot != null ? "screenshot" : "app");

        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Log.Error("UI-Thread", e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Error("Unbehandelte Ausnahme", e.ExceptionObject as Exception);
        ApplicationConfiguration.Initialize();

        var settings = Settings.Load();

        // Diagnose: alle Sensoren und Zuordnungen als JSON-Datei ausgeben.
        if (options.Probe != null)
            return Probe.Run(options);

        // Diagnose: Corsair-Kühler per USB abfragen und Rohdaten speichern.
        if (options.CorsairDump != null)
            return Sensors.CorsairPlatinumProvider.Dump(options.CorsairDump);

        // Testbild: Panel (oder Sensorliste) rendern, als PNG speichern, beenden.
        if (options.Screenshot != null)
        {
            var shot = new ScreenshotContext(options, settings);
            Application.Run(shot);
            return shot.ExitCode;
        }

        if (options.Restart)
            WaitForPreviousInstance();

        if (InstanceRunning())
        {
            if (options.Editor || options.Setup)
            {
                // Die laufende Instanz (oft mit Adminrechten) öffnet das Fenster selbst.
                File.WriteAllText(options.Setup ? AppPaths.SetupRequestFile : AppPaths.EditorRequestFile, "");
                return 0;
            }
            if (!options.Autostart)
                MessageBox.Show("Sensorium läuft bereits. Das Symbol findest du im Infobereich der Taskleiste.",
                    "Sensorium", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        if (!options.NoElevate && settings.RunAsAdmin && !Elevation.IsElevated)
        {
            if (Elevation.RelaunchElevated(args))
                return 0;
            Log.Info("Läuft ohne Adminrechte weiter.");
        }

        using var mutex = new Mutex(true, MutexName, out bool created);
        if (!created)
            return 0;

        Application.Run(new TrayApp(options, settings));
        return 0;
    }

    private static bool InstanceRunning()
    {
        try
        {
            if (!Mutex.TryOpenExisting(MutexName, out var existing))
                return false;
            existing.Dispose();
            return true;
        }
        catch (UnauthorizedAccessException)
        {
            return true; // existiert, gehört aber einem Prozess mit Adminrechten
        }
    }

    private static void WaitForPreviousInstance()
    {
        var until = DateTime.UtcNow.AddSeconds(10);
        while (InstanceRunning() && DateTime.UtcNow < until)
            Thread.Sleep(200);
    }
}
