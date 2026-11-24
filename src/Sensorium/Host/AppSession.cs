using System.Text.Json;
using Sensorium.Sensors;

namespace Sensorium.Host;

/// <summary>Verbindet Sensor-Hub, Profil und alle offenen Fenster.</summary>
internal sealed class AppSession : IDisposable
{
    private readonly Control _ui = new();
    private readonly List<WebWindow> _windows = new();
    private ProfileRefs _refs = new();
    private ProfileRefs? _draftRefs;   // Entwurf im Editor/Assistenten: dessen Werte werden zusätzlich abgefragt
    private WebWindow? _draftWindow;   // Fenster, das den Entwurf geschickt hat
    private string? _previewJson;      // Entwurf, der gerade zur Probe auf dem Panel zu sehen ist
    private readonly Settings _settings;

    public AppSession(Options options, Settings settings)
    {
        _settings = settings;
        _ = _ui.Handle; // Handle erzeugen, damit Hintergrund-Threads per BeginInvoke in den UI-Thread wechseln können
        Profile = new ProfileSource(settings);
        Profile.Changed += () =>
        {
            ApplyProfileRefs();
            Ui(SendProfile);
        };

        if (options.Demo == null)
        {
            Hub = new SensorHub(settings);
            Hub.Ha.Configure(settings.HomeAssistantUrl, TokenStore.Load());
            ApplyProfileRefs();
            Hub.FrameReady += frame => Ui(() => Broadcast(frame.Json));
            Hub.CatalogChanged += () => Ui(() => Broadcast(CatalogJson()));
            Hub.Start();
        }
    }

    /// <summary>Liest aus dem Profil (und dem Entwurf im Editor), welche Werte, Steckdosen und Formeln gebraucht werden.</summary>
    private void ApplyProfileRefs()
    {
        if (Hub == null)
            return;
        var refs = Profile.ReadRefs();
        _refs = refs;
        var draft = _draftRefs;
        Hub.ApplyProfile(draft == null ? refs : refs.Merge(draft));
    }

    /// <summary>null im Demo-Modus (dann simuliert die Weboberfläche die Werte).</summary>
    public SensorHub? Hub { get; }
    public ProfileSource Profile { get; }

    public event Action? SensorsRequested;

    public void Attach(WebWindow window)
    {
        _windows.Add(window);
        window.Ready += OnReady;
        window.MessageReceived += OnMessage;
        window.FormClosed += (_, _) =>
        {
            _windows.Remove(window);
            WindowClosed(window);
        };
    }

    /// <summary>Editor oder Assistent zu: Entwurf vergessen, Panel zeigt wieder das gespeicherte Profil.</summary>
    private void WindowClosed(WebWindow window)
    {
        if (ReferenceEquals(window, _draftWindow))
        {
            _draftWindow = null;
            _draftRefs = null;
            ApplyProfileRefs();
        }
        if (window is EditorWindow && _previewJson != null)
            SendProfile();
    }

    private static bool WantsProfile(WebWindow w) => w is PanelWindow or EditorWindow or SetupWindow;

    /// <summary>Schickt das gespeicherte Profil an Panel, Editor und Assistent (beendet eine laufende Vorschau).</summary>
    public void SendProfile()
    {
        _previewJson = null;
        string json = Profile.BuildMessage();
        foreach (var window in _windows.Where(WantsProfile).ToList())
            window.Post(json);
    }

    private string CatalogJson() =>
        Hub == null ? "" : Protocol.Catalog(Hub.Catalog, Hub.Aliases.Snapshot(), Hub.Status);

    private void Broadcast(string json)
    {
        if (json.Length == 0)
            return;
        foreach (var window in _windows.ToList())
            window.Post(json);
    }

    private void OnReady(WebWindow window)
    {
        if (window is PanelWindow)
            window.Post(_previewJson ?? Profile.BuildMessage());
        else if (WantsProfile(window))
            window.Post(Profile.BuildMessage());
        if (Hub == null)
            return;
        if (Hub.Status.Ready)
            window.Post(CatalogJson());
        if (Hub.Last is { } last)
            window.Post(last.Json);
    }

    private void OnMessage(WebWindow window, JsonElement message)
    {
        string? Str(string name) =>
            message.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

        switch (Str("type"))
        {
            case "setAlias" when Hub != null && Str("alias") is { } alias && Str("expr") is { } expr:
                if (Hub.Aliases.SetManual(alias, expr) is { } error)
                    window.Post(Protocol.Toast("Formel fehlerhaft: " + error));
                break;
            case "resetAlias" when Hub != null && Str("alias") is { } name:
                Hub.Aliases.ResetAuto(name);
                break;
            case "openSensors":
                SensorsRequested?.Invoke();
                break;
            case "haToggle" when Hub != null && Str("entity") is { } entity:
                _ = ToggleAsync(window, entity);
                break;

            // ---------- Editor ----------
            case "saveProfile" when Str("json") is { } json:
                SaveProfile(window, json);
                break;
            case "previewProfile" when Str("json") is { } json:
                PreviewProfile(window, json);
                break;
            case "endPreview":
                if (_previewJson != null)
                    SendProfile();
                break;
            case "draftRefs" when Hub != null && Str("json") is { } json:
                try
                {
                    using var document = JsonDocument.Parse(json);
                    _draftRefs = ProfileRefs.From(document.RootElement);
                    _draftWindow = window;
                    ApplyProfileRefs();
                }
                catch (JsonException)
                {
                    // halbfertiger Entwurf – beim nächsten Mal
                }
                break;
            case "haDirectory" when Hub != null:
                // Der Assistent schickt Adresse und Token mit (noch nicht gespeichert), der Editor nimmt die gespeicherten.
                _ = SendDirectoryAsync(window, Str("url") ?? _settings.HomeAssistantUrl, Str("token") ?? TokenStore.Load());
                break;
            case "evalFormula" when Hub != null && Str("expr") is { } formula:
                var (value, problem) = Hub.EvaluateFormula(formula);
                window.Post(Protocol.FormulaResult(formula, value, problem));
                break;
            case "dirty" when window is EditorWindow editor:
                editor.Dirty = message.TryGetProperty("value", out var dirty) && dirty.ValueKind == JsonValueKind.True;
                break;
            case "importProfile" when window is EditorWindow editor:
                ImportProfile(editor);
                break;
            case "exportProfile" when window is EditorWindow editor && Str("json") is { } json:
                ExportProfile(editor, json, Str("name"));
                break;
        }
    }

    private const long MaxProfileBytes = 2_000_000;

    /// <summary>Datei wählen und dem Editor übergeben. Er zeigt vor dem Übernehmen, was drin steckt.</summary>
    private static void ImportProfile(EditorWindow editor)
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Profil importieren",
            Filter = "Sensorium-Profil (*.json)|*.json|Alle Dateien (*.*)|*.*",
            CheckFileExists = true,
            RestoreDirectory = true,
        };
        if (dialog.ShowDialog(editor) != DialogResult.OK)
            return;
        try
        {
            var info = new FileInfo(dialog.FileName);
            if (info.Length > MaxProfileBytes)
            {
                editor.Post(Protocol.Toast("Die Datei ist zu groß für ein Profil."));
                return;
            }
            string json = File.ReadAllText(dialog.FileName);
            editor.Post(Protocol.ImportedProfile(json, info.Name));
        }
        catch (Exception ex)
        {
            Log.Error("Profil importieren", ex);
            editor.Post(Protocol.Toast("Die Datei ließ sich nicht lesen: " + ex.Message));
        }
    }

    private static void ExportProfile(EditorWindow editor, string json, string? name)
    {
        try
        {
            using (JsonDocument.Parse(json)) { } // nur gültiges JSON schreiben
        }
        catch (JsonException)
        {
            editor.Post(Protocol.Toast("Das Profil ist kein gültiges JSON."));
            return;
        }
        string fileName = string.Concat((name ?? "sensorium-profil.json").Where(c => !Path.GetInvalidFileNameChars().Contains(c)));
        using var dialog = new SaveFileDialog
        {
            Title = "Profil exportieren",
            Filter = "Sensorium-Profil (*.json)|*.json",
            FileName = string.IsNullOrWhiteSpace(fileName) ? "sensorium-profil.json" : fileName,
            OverwritePrompt = true,
            RestoreDirectory = true,
        };
        if (dialog.ShowDialog(editor) != DialogResult.OK)
            return;
        try
        {
            File.WriteAllText(dialog.FileName, json, new System.Text.UTF8Encoding(false));
            Log.Info("Profil exportiert: " + dialog.FileName);
            editor.Post(Protocol.Toast("Exportiert: " + dialog.FileName));
        }
        catch (Exception ex)
        {
            Log.Error("Profil exportieren", ex);
            editor.Post(Protocol.Toast("Export fehlgeschlagen: " + ex.Message));
        }
    }

    private void SaveProfile(WebWindow window, string json)
    {
        try
        {
            string path = Profile.Save(json);
            if (window is EditorWindow editor)
                editor.Dirty = false;
            window.Post(Protocol.Saved(path));
        }
        catch (Exception ex)
        {
            Log.Error("Profil speichern", ex);
            window.Post(Protocol.Toast("Speichern fehlgeschlagen: " + ex.Message));
        }
    }

    private void PreviewProfile(WebWindow window, string json)
    {
        var panels = _windows.OfType<PanelWindow>().ToList();
        if (panels.Count == 0)
        {
            window.Post(Protocol.Toast("Das Panel ist gerade ausgeblendet."));
            return;
        }
        try
        {
            using var document = JsonDocument.Parse(json);
            _previewJson = Protocol.Profile(document.RootElement, "Vorschau", Profile.FilePath);
            foreach (var panel in panels)
                panel.Post(_previewJson);
            window.Post(Protocol.Toast("Der Entwurf ist jetzt auf dem Panel zu sehen (noch nicht gespeichert)."));
        }
        catch (JsonException ex)
        {
            window.Post(Protocol.Toast("Entwurf fehlerhaft: " + ex.Message));
        }
    }

    private async Task SendDirectoryAsync(WebWindow window, string? url, string? token)
    {
        string json;
        try
        {
            if (string.IsNullOrWhiteSpace(url) || string.IsNullOrEmpty(token))
                throw new InvalidOperationException("Home Assistant ist noch nicht eingerichtet.");
            json = await HomeAssistantProvider.DirectoryJsonAsync(url, token);
        }
        catch (Exception ex)
        {
            Log.Warn("Liste aus Home Assistant: " + ex.Message);
            json = Protocol.HaDirectoryError(ex.Message);
        }
        Ui(() => window.Post(json));
    }

    /// <summary>Schaltet ein Gerät um – nur, wenn das Profil es als schaltbare Kachel enthält.</summary>
    private async Task ToggleAsync(WebWindow window, string entity)
    {
        string? error = _refs.HaToggle.Contains(entity)
            ? await Hub!.Ha.ToggleAsync(entity)
            : "Dieses Gerät ist im Profil nicht zum Schalten freigegeben.";
        if (error != null)
        {
            Log.Warn($"Schalten {entity}: {error}");
            Ui(() => window.Post(Protocol.Toast(error)));
        }
    }

    private void Ui(Action action)
    {
        if (_ui.IsDisposed || !_ui.IsHandleCreated)
            return;
        try
        {
            _ui.BeginInvoke(action);
        }
        catch (InvalidOperationException)
        {
            // Programm wird gerade beendet.
        }
    }

    public void Dispose()
    {
        Hub?.Dispose();
        Profile.Dispose();
        _ui.Dispose();
    }
}
