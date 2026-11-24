using System.Text.Json;

namespace Sensorium;

/// <summary>Programmeinstellungen (settings.json in %APPDATA%\Sensorium).</summary>
internal sealed class Settings
{
    /// <summary>Gerätename des Panel-Monitors, z. B. \\.\DISPLAY2.</summary>
    public string? Screen { get; set; }
    /// <summary>Position und Größe des Monitors als Ersatz, falls sich der Gerätename ändert.</summary>
    public int[]? ScreenBounds { get; set; }
    public bool TopMost { get; set; }
    public bool PanelVisible { get; set; } = true;
    public string Profile { get; set; } = "standard";
    public bool RunAsAdmin { get; set; } = true;
    public int IntervalMs { get; set; } = 1000;
    /// <summary>Corsair-AIO (Hydro Platinum, Pro XT, Elite RGB) direkt per USB auslesen.</summary>
    public bool CorsairUsb { get; set; } = true;
    /// <summary>
    /// Adresse von Home Assistant, z. B. http://homeassistant.local:8123. Der Zugriffstoken liegt
    /// verschlüsselt in ha-token.bin, nie hier.
    /// </summary>
    public string? HomeAssistantUrl { get; set; }
    /// <summary>Einrichtung abgeschlossen; sonst erscheint beim Start der Einrichtungsassistent.</summary>
    public bool SetupDone { get; set; }

    /// <summary>true, wenn die Einstellungen aus einer vorhandenen Datei stammen (also kein Erststart).</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public bool LoadedFromFile { get; private set; }

    /// <summary>
    /// Programme, die RTSS zwar erfasst, die aber keine Spiele sind (Prozessname ohne .exe).
    /// Die Framerate zählt nur für das Programm im Vordergrund, das hier nicht steht.
    /// </summary>
    public string[] FpsIgnore { get; set; } =
    {
        "iCUE", "Discord", "chrome", "msedge", "firefox", "opera", "brave", "vivaldi", "msedgewebview2",
        "steam", "steamwebhelper", "EpicGamesLauncher", "EADesktop", "Battle.net", "upc", "UbisoftConnect",
        "Playnite.DesktopApp", "explorer", "Claude", "Code", "devenv", "Spotify", "obs64", "Teams", "ms-teams",
        "Telegram", "WhatsApp", "Taskmgr", "SystemSettings", "ApplicationFrameHost", "Sensorium", "aida64",
        "MSIAfterburner", "RTSS", "NVIDIA app", "NVIDIA Overlay",
    };

    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static Settings Load()
    {
        try
        {
            if (File.Exists(AppPaths.SettingsFile))
            {
                var loaded = JsonSerializer.Deserialize<Settings>(File.ReadAllText(AppPaths.SettingsFile), Json) ?? new Settings();
                loaded.LoadedFromFile = true;
                return loaded;
            }
        }
        catch (Exception ex)
        {
            Log.Error("Einstellungen laden", ex);
        }
        return new Settings();
    }

    public void Save()
    {
        try
        {
            File.WriteAllText(AppPaths.SettingsFile, JsonSerializer.Serialize(this, Json));
        }
        catch (Exception ex)
        {
            Log.Error("Einstellungen speichern", ex);
        }
    }
}
