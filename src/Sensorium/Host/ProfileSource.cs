using System.Text.Json;
using Sensorium.Sensors;

namespace Sensorium.Host;

/// <summary>Lädt das aktive Profil und meldet Änderungen an eigenen Profilen sofort (Live-Neuladen).</summary>
internal sealed class ProfileSource : IDisposable
{
    private static readonly JsonDocumentOptions ParseOptions = new()
    {
        CommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    private readonly Settings _settings;
    private readonly FileSystemWatcher _watcher;
    private System.Threading.Timer? _debounce;

    public ProfileSource(Settings settings)
    {
        _settings = settings;
        _watcher = new FileSystemWatcher(AppPaths.UserProfiles, "*.json")
        {
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size,
            EnableRaisingEvents = true,
        };
        _watcher.Changed += OnFileEvent;
        _watcher.Created += OnFileEvent;
        _watcher.Renamed += OnFileEvent;
        _watcher.Deleted += OnFileEvent;
    }

    /// <summary>Wird (auf einem Hintergrund-Thread) ausgelöst, wenn ein eigenes Profil gespeichert wurde.</summary>
    public event Action? Changed;

    public string FilePath => AppPaths.ResolveProfile(_settings.Profile);

    private void OnFileEvent(object sender, FileSystemEventArgs e)
    {
        _debounce?.Dispose();
        _debounce = new System.Threading.Timer(_ => Changed?.Invoke(), null, 350, Timeout.Infinite);
    }

    /// <summary>Was das Profil an Daten von außen braucht (Home Assistant, Steckdosen, Formeln).</summary>
    public ProfileRefs ReadRefs()
    {
        try
        {
            using var document = JsonDocument.Parse(ReadText(FilePath), ParseOptions);
            return ProfileRefs.From(document.RootElement);
        }
        catch (Exception ex)
        {
            Log.WarnOnce("profile-refs-" + ex.GetType().Name, "Profil auswerten: " + ex.Message);
            return new ProfileRefs();
        }
    }

    private static string ReadText(string path)
    {
        for (int attempt = 0; ; attempt++)
        {
            try
            {
                return File.ReadAllText(path);
            }
            catch (IOException) when (attempt < 5)
            {
                Thread.Sleep(80); // Editor schreibt die Datei gerade
            }
        }
    }

    /// <summary>Nachricht für die Weboberfläche: das Profil oder eine verständliche Fehlermeldung.</summary>
    public string BuildMessage()
    {
        string path = FilePath;
        try
        {
            using var document = JsonDocument.Parse(ReadText(path), ParseOptions);
            return Protocol.Profile(document.RootElement, Path.GetFileNameWithoutExtension(path), path);
        }
        catch (JsonException ex)
        {
            return Protocol.Error($"Das Profil „{Path.GetFileName(path)}“ ist kein gültiges JSON (Zeile {ex.LineNumber + 1}): {ex.Message}");
        }
        catch (Exception ex)
        {
            return Protocol.Error($"Das Profil „{Path.GetFileName(path)}“ konnte nicht geladen werden: {ex.Message}");
        }
    }

    /// <summary>
    /// Speichert das Profil aus dem Editor als eigenes Profil. Die vorige Fassung wandert vorher in
    /// „profiles\Sicherungen“ (die letzten 30 bleiben). Liefert den Pfad der gespeicherten Datei.
    /// </summary>
    public string Save(string json)
    {
        using (JsonDocument.Parse(json, ParseOptions)) { } // nur gültiges JSON speichern
        string file = Path.GetFileName(AppPaths.ResolveProfile(_settings.Profile));
        string target = Path.Combine(AppPaths.UserProfiles, file);
        if (File.Exists(target))
        {
            string backups = Path.Combine(AppPaths.UserProfiles, "Sicherungen");
            Directory.CreateDirectory(backups);
            File.Copy(target, Path.Combine(backups, $"{Path.GetFileNameWithoutExtension(file)}-{DateTime.Now:yyyy-MM-dd-HHmmss}.json"), overwrite: true);
            foreach (var old in new DirectoryInfo(backups).GetFiles("*.json").OrderByDescending(f => f.LastWriteTimeUtc).Skip(30))
            {
                try { old.Delete(); } catch { /* egal */ }
            }
        }
        string temp = target + ".tmp";
        File.WriteAllText(temp, json, new System.Text.UTF8Encoding(false));
        File.Move(temp, target, overwrite: true);
        Log.Info("Profil gespeichert: " + target);
        return target;
    }

    /// <summary>Legt eine bearbeitbare Kopie des mitgelieferten Profils an und gibt ihren Pfad zurück.</summary>
    public string EnsureUserCopy()
    {
        string file = Path.GetFileName(AppPaths.ResolveProfile(_settings.Profile));
        string user = Path.Combine(AppPaths.UserProfiles, file);
        if (!File.Exists(user))
            File.Copy(Path.Combine(AppPaths.BuiltInProfiles, file), user);
        return user;
    }

    public void Dispose()
    {
        _watcher.Dispose();
        _debounce?.Dispose();
    }
}
