namespace Sensorium;

/// <summary>Alle Ordner und Dateien, die Sensorium benutzt.</summary>
internal static class AppPaths
{
    public static string AppDir { get; } = AppContext.BaseDirectory;
    public static string WebDir => Path.Combine(AppDir, "Web");
    public static string BuiltInProfiles => Path.Combine(AppDir, "Profiles");

    /// <summary>%APPDATA%\Sensorium: Einstellungen, Zuordnungen, eigene Profile, Logs.</summary>
    public static string Data { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sensorium");
    public static string UserProfiles => Path.Combine(Data, "profiles");
    public static string Logs => Path.Combine(Data, "logs");
    public static string SettingsFile => Path.Combine(Data, "settings.json");
    public static string AliasFile => Path.Combine(Data, "aliases.json");
    /// <summary>Liegt diese Datei vor, beendet sich Sensorium (für Updates ohne Klick im Tray).</summary>
    public static string ExitRequestFile => Path.Combine(Data, "exit.request");
    /// <summary>Legt jemand diese Datei an (z. B. „Sensorium.exe --editor“), öffnet die laufende Instanz den Editor.</summary>
    public static string EditorRequestFile => Path.Combine(Data, "editor.request");
    /// <summary>Wie <see cref="EditorRequestFile"/>, öffnet aber den Einrichtungsassistenten.</summary>
    public static string SetupRequestFile => Path.Combine(Data, "setup.request");

    /// <summary>Getrennte WebView2-Daten für Starts mit und ohne Adminrechte (sonst Rechtekonflikte).</summary>
    public static string WebViewData => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sensorium",
        Elevation.IsElevated ? "WebView2-admin" : "WebView2");

    public static void EnsureCreated()
    {
        Directory.CreateDirectory(Data);
        Directory.CreateDirectory(UserProfiles);
        Directory.CreateDirectory(Logs);
    }

    /// <summary>Pfad des Profils: die eigene Kopie in %APPDATA% hat Vorrang vor der mitgelieferten Datei.</summary>
    public static string ResolveProfile(string name)
    {
        string file = name.EndsWith(".json", StringComparison.OrdinalIgnoreCase) ? name : name + ".json";
        if (Path.IsPathRooted(file))
            return file;
        string user = Path.Combine(UserProfiles, file);
        return File.Exists(user) ? user : Path.Combine(BuiltInProfiles, file);
    }
}
