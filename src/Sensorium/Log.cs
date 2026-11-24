namespace Sensorium;

/// <summary>Einfaches Datei-Log in %APPDATA%\Sensorium\logs.</summary>
internal static class Log
{
    private static readonly object Gate = new();
    private static readonly HashSet<string> Once = new(StringComparer.Ordinal);
    private static string? _file;

    public static void Init(string kind)
    {
        try
        {
            _file = Path.Combine(AppPaths.Logs, $"sensorium-{kind}.log");
            var info = new FileInfo(_file);
            if (info.Exists && info.Length > 1_000_000)
                info.Delete();
        }
        catch
        {
            _file = null;
        }
        Info($"Start: Version {Application.ProductVersion}, Admin={Elevation.IsElevated}, {Environment.OSVersion}");
    }

    public static void Info(string message) => Write("INFO ", message);
    public static void Warn(string message) => Write("WARN ", message);
    public static void Error(string context, Exception? ex) => Write("ERROR", $"{context}: {ex}");

    /// <summary>Schreibt eine Meldung pro Schlüssel nur einmal (gegen Log-Fluten im Sekundentakt).</summary>
    public static void WarnOnce(string key, string message)
    {
        lock (Gate)
        {
            if (!Once.Add(key))
                return;
        }
        Warn(message);
    }

    private static void Write(string level, string message)
    {
        if (_file == null)
            return;
        lock (Gate)
        {
            try
            {
                File.AppendAllText(_file, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} {level} {message}{Environment.NewLine}");
            }
            catch
            {
                // Logging darf nie die App stören.
            }
        }
    }
}
