using System.Buffers;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Sensorium.Sensors;

namespace Sensorium.Host;

/// <summary>Die laufende App: Symbol im Infobereich mit Menü, Panel-Fenster, Sensorliste, Editor, Einrichtung.</summary>
internal sealed class TrayApp : ApplicationContext
{
    private readonly Options _options;
    private readonly Settings _settings;
    private readonly AppSession _session;
    private readonly NotifyIcon _tray;
    private readonly System.Windows.Forms.Timer _exitWatch = new() { Interval = 2000 };
    private PanelWindow? _panel;
    private SensorsWindow? _sensors;
    private EditorWindow? _editor;
    private SetupWindow? _setup;

    public TrayApp(Options options, Settings settings)
    {
        _options = options;
        _settings = settings;

        // Bestehende Installation (Einstellungen schon vorhanden): kein Einrichtungsassistent beim Start.
        if (!settings.SetupDone && settings.LoadedFromFile && (settings.Screen != null || settings.HomeAssistantUrl != null))
        {
            settings.SetupDone = true;
            settings.Save();
        }

        // Update-Skript: legt exit.request an, Sensorium beendet sich dann von selbst.
        // editor.request / setup.request: „Sensorium.exe --editor“ bzw. „--setup“ öffnet das Fenster in dieser Instanz.
        TryDelete(AppPaths.ExitRequestFile);
        TryDelete(AppPaths.EditorRequestFile);
        TryDelete(AppPaths.SetupRequestFile);
        _exitWatch.Tick += (_, _) =>
        {
            if (File.Exists(AppPaths.EditorRequestFile))
            {
                TryDelete(AppPaths.EditorRequestFile);
                ShowEditor();
            }
            if (File.Exists(AppPaths.SetupRequestFile))
            {
                TryDelete(AppPaths.SetupRequestFile);
                ShowSetup();
            }
            if (!File.Exists(AppPaths.ExitRequestFile))
                return;
            TryDelete(AppPaths.ExitRequestFile);
            Log.Info("Beenden auf Anfrage (exit.request).");
            ExitThread();
        };
        _exitWatch.Start();
        _session = new AppSession(options, settings);
        _session.SensorsRequested += ShowSensors;

        _tray = new NotifyIcon
        {
            Icon = AppIcon.Get(),
            Text = "Sensorium",
            Visible = true,
            ContextMenuStrip = BuildMenu(),
        };
        _tray.MouseDoubleClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
                TogglePanel();
        };

        if (settings.PanelVisible)
            ShowPanel();
        if (options.Editor)
            ShowEditor();
        if (options.Setup || (!settings.SetupDone && _session.Hub != null))
            ShowSetup();
        else
            ShowStartupHint();
    }

    // ---------- Einrichtungsassistent ----------

    private void ShowSetup()
    {
        if (_setup is { IsDisposed: false })
        {
            if (_setup.WindowState == FormWindowState.Minimized)
                _setup.WindowState = FormWindowState.Normal;
            _setup.Activate();
            return;
        }
        var window = new SetupWindow(_options);
        _session.Attach(window);
        window.MessageReceived += OnSetupMessage;
        window.FormClosed += (_, _) =>
        {
            if (ReferenceEquals(_setup, window))
                _setup = null;
        };
        _setup = window;
        window.Show();
        window.Activate();
    }

    private void OnSetupMessage(WebWindow window, JsonElement message)
    {
        string? Str(string name) =>
            message.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

        switch (Str("type"))
        {
            case "setupState":
                window.Post(SetupStateJson());
                break;
            case "identifyScreens":
                ScreenIdentifier.Show();
                break;
            case "setScreen" when Str("id") is { } id:
                var screen = Screen.AllScreens.FirstOrDefault(s => s.DeviceName == id);
                if (screen != null)
                {
                    _settings.Screen = screen.DeviceName;
                    _settings.ScreenBounds = [screen.Bounds.X, screen.Bounds.Y, screen.Bounds.Width, screen.Bounds.Height];
                    _settings.Save();
                    if (PanelOpen) _panel!.ApplyScreen();
                    else ShowPanel();
                }
                window.Post(SetupStateJson());
                break;
            case "restartElevated":
                if (Elevation.RelaunchElevated(["--restart", "--setup"]))
                    ExitThread();
                break;
            case "openPawnIo":
                Shell.OpenUrl("https://pawnio.eu/");
                break;
            case "haTest" when Str("url") is { } url && Str("token") is { } token:
                _ = HaTestAsync(window, url, token);
                break;
            case "haConnect" when Str("url") is { } url && Str("token") is { } token:
                try
                {
                    _settings.HomeAssistantUrl = url.Trim();
                    _settings.Save();
                    TokenStore.Save(token);
                    _session.Hub?.Ha.Configure(_settings.HomeAssistantUrl, token);
                    Log.Info("Home Assistant im Assistenten eingerichtet: " + _settings.HomeAssistantUrl);
                }
                catch (Exception ex)
                {
                    Log.Error("Home Assistant einrichten", ex);
                    window.Post(Protocol.Toast("Speichern fehlgeschlagen: " + ex.Message));
                }
                window.Post(SetupStateJson());
                break;
            case "setAutostart":
                try
                {
                    if (message.TryGetProperty("on", out var on) && on.ValueKind == JsonValueKind.True) Autostart.Enable();
                    else Autostart.Disable();
                }
                catch (Exception ex)
                {
                    Log.Error("Autostart", ex);
                    window.Post(Protocol.Toast("Autostart ließ sich nicht ändern: " + ex.Message));
                }
                window.Post(SetupStateJson());
                break;
            case "openEditor":
                ShowEditor();
                break;
            case "finish":
                _settings.SetupDone = true;
                _settings.Save();
                Log.Info("Einrichtung abgeschlossen.");
                window.Close();
                break;
        }
    }

    private static async Task HaTestAsync(WebWindow window, string url, string token)
    {
        bool ok = false;
        string? version = null, error = null;
        try
        {
            version = await HomeAssistantProvider.TestAsync(url, token, CancellationToken.None);
            ok = true;
        }
        catch (HaAuthException)
        {
            error = "Home Assistant hat den Token abgelehnt. Ist er vollständig eingefügt?";
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }
        if (!window.IsDisposed)
            window.Post(JsonMessage(w =>
            {
                w.WriteString("type", "haTestResult");
                w.WriteBoolean("ok", ok);
                w.WriteString("version", version);
                w.WriteString("error", error);
            }));
    }

    private string SetupStateJson() => JsonMessage(w =>
    {
        var hub = _session.Hub;
        var screens = ScreenIdentifier.Ordered();
        var current = _panel?.TargetScreen ?? ScreenPicker.Resolve(_settings);
        bool autostart = false;
        try { autostart = Autostart.IsEnabled(); } catch { /* egal */ }
        w.WriteString("type", "setupState");
        w.WriteString("version", Application.ProductVersion);
        w.WriteBoolean("elevated", Elevation.IsElevated);
        w.WriteBoolean("pawnio", hub?.Status.PawnIo ?? false);
        w.WriteBoolean("rtss", hub?.Status.Rtss ?? false);
        w.WriteString("cooler", hub?.Catalog.FirstOrDefault(s => s.HardwareType == "Cooler")?.Hardware);
        w.WriteBoolean("autostart", autostart);
        w.WriteBoolean("canAutostart", Elevation.IsElevated);
        w.WriteStartArray("screens");
        for (int i = 0; i < screens.Length; i++)
        {
            var s = screens[i];
            w.WriteStartObject();
            w.WriteNumber("nr", i + 1);
            w.WriteString("id", s.DeviceName);
            w.WriteString("name", s.DeviceName.Replace(@"\\.\", ""));
            w.WriteNumber("x", s.Bounds.X);
            w.WriteNumber("y", s.Bounds.Y);
            w.WriteNumber("w", s.Bounds.Width);
            w.WriteNumber("h", s.Bounds.Height);
            w.WriteBoolean("primary", s.Primary);
            w.WriteBoolean("selected", s.DeviceName == current.DeviceName);
            w.WriteEndObject();
        }
        w.WriteEndArray();
        w.WriteStartObject("ha");
        w.WriteString("url", _settings.HomeAssistantUrl);
        w.WriteBoolean("hasToken", TokenStore.Exists);
        w.WriteBoolean("connected", hub?.Ha.Connected ?? false);
        w.WriteString("status", hub?.Ha.StatusText ?? "");
        w.WriteString("version", hub?.Ha.Version);
        w.WriteEndObject();
    });

    private static string JsonMessage(Action<Utf8JsonWriter> body)
    {
        var buffer = new ArrayBufferWriter<byte>(4096);
        using (var w = new Utf8JsonWriter(buffer, new JsonWriterOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
        {
            w.WriteStartObject();
            body(w);
            w.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.WrittenSpan);
    }

    private void ShowStartupHint()
    {
        if (_session.Hub == null)
            return;
        if (!Elevation.IsElevated)
        {
            _tray.ShowBalloonTip(8000, "Sensorium läuft ohne Adminrechte",
                "Einige Sensoren fehlen. Rechtsklick auf das Symbol → „Mit Adminrechten neu starten“.", ToolTipIcon.Warning);
        }
        else if (!_session.Hub.Status.PawnIo)
        {
            _tray.ShowBalloonTip(8000, "PawnIO-Treiber fehlt",
                "Ohne PawnIO fehlen CPU-Temperatur, CPU-Takt, CPU-Leistung, Lüfter und Pumpe.", ToolTipIcon.Info);
        }
    }

    private bool PanelOpen => _panel is { IsDisposed: false };

    private void TogglePanel()
    {
        if (PanelOpen) HidePanel();
        else ShowPanel();
    }

    private void ShowPanel()
    {
        if (!PanelOpen)
        {
            var panel = new PanelWindow(_settings, _options);
            _session.Attach(panel);
            panel.FormClosed += (_, _) =>
            {
                if (ReferenceEquals(_panel, panel))
                    _panel = null;
            };
            _panel = panel;
        }
        _panel!.Show();
        if (!_settings.PanelVisible)
        {
            _settings.PanelVisible = true;
            _settings.Save();
        }
    }

    private void HidePanel()
    {
        _panel?.Close();
        _panel = null;
        _settings.PanelVisible = false;
        _settings.Save();
    }

    private void ShowSensors()
    {
        if (_sensors is { IsDisposed: false })
        {
            if (_sensors.WindowState == FormWindowState.Minimized)
                _sensors.WindowState = FormWindowState.Normal;
            _sensors.Activate();
            return;
        }
        var window = new SensorsWindow(_options);
        _session.Attach(window);
        window.FormClosed += (_, _) =>
        {
            if (ReferenceEquals(_sensors, window))
                _sensors = null;
        };
        _sensors = window;
        window.Show();
    }

    private void ShowEditor()
    {
        if (_editor is { IsDisposed: false })
        {
            if (_editor.WindowState == FormWindowState.Minimized)
                _editor.WindowState = FormWindowState.Maximized;
            _editor.Activate();
            return;
        }
        var window = new EditorWindow(_options);
        _session.Attach(window);
        window.FormClosed += (_, _) =>
        {
            if (ReferenceEquals(_editor, window))
                _editor = null;
        };
        _editor = window;
        window.Show();
        window.Activate();
    }

    private void EditProfile()
    {
        try
        {
            string path = _session.Profile.EnsureUserCopy();
            Shell.OpenPath(path);
            _session.SendProfile();
        }
        catch (Exception ex)
        {
            Log.Error("Profil bearbeiten", ex);
            MessageBox.Show("Das Profil konnte nicht geöffnet werden:\n" + ex.Message, "Sensorium", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void ToggleAutostart()
    {
        try
        {
            if (Autostart.IsEnabled()) Autostart.Disable();
            else Autostart.Enable();
        }
        catch (Exception ex)
        {
            Log.Error("Autostart", ex);
            MessageBox.Show("Der Autostart konnte nicht geändert werden:\n" + ex.Message, "Sensorium", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private HomeAssistantDialog? _haDialog;

    private void ConfigureHomeAssistant()
    {
        if (_session.Hub is not { } hub)
            return;
        if (_haDialog is { IsDisposed: false })
        {
            _haDialog.Activate();
            return;
        }
        using var dialog = new HomeAssistantDialog(_settings.HomeAssistantUrl, TokenStore.Exists);
        _haDialog = dialog;
        try
        {
            if (dialog.ShowDialog() != DialogResult.OK)
                return;
            _settings.HomeAssistantUrl = dialog.Url;
            _settings.Save();
            if (dialog.NewToken != null)
                TokenStore.Save(dialog.NewToken);
            hub.Ha.Configure(_settings.HomeAssistantUrl, TokenStore.Load());
            Log.Info("Home Assistant eingerichtet: " + dialog.Url);
        }
        catch (Exception ex)
        {
            Log.Error("Home Assistant einrichten", ex);
            MessageBox.Show("Die Einstellungen konnten nicht gespeichert werden:\n" + ex.Message, "Sensorium", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally
        {
            _haDialog = null;
        }
    }

    private void RestartElevated()
    {
        if (Elevation.RelaunchElevated(new[] { "--restart" }))
            ExitThread();
    }

    private string StatusText()
    {
        var parts = new List<string> { Elevation.IsElevated ? "Adminrechte: ja" : "Adminrechte: nein" };
        if (_session.Hub is { } hub)
        {
            parts.Add(hub.Status.PawnIo ? "PawnIO: installiert" : "PawnIO: fehlt");
            parts.Add(hub.Status.Rtss ? "RTSS: verbunden" : "RTSS: aus");
            parts.Add("Home Assistant: " + hub.Ha.StatusText);
        }
        else
        {
            parts.Add("Demo-Modus");
        }
        return string.Join(" · ", parts);
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        var title = new ToolStripMenuItem("Sensorium") { Enabled = false };
        title.Font = new Font(title.Font, FontStyle.Bold);
        var status = new ToolStripMenuItem("") { Enabled = false };
        var pawnIo = new ToolStripMenuItem("PawnIO-Treiber herunterladen …", null, (_, _) => Shell.OpenUrl("https://pawnio.eu/"));
        var restartAdmin = new ToolStripMenuItem("Mit Adminrechten neu starten", null, (_, _) => RestartElevated());
        var showPanel = new ToolStripMenuItem("Panel anzeigen", null, (_, _) => TogglePanel());
        var screens = new ToolStripMenuItem("Monitor");
        var topMost = new ToolStripMenuItem("Immer im Vordergrund", null, (_, _) =>
        {
            _settings.TopMost = !_settings.TopMost;
            _settings.Save();
            if (_panel != null)
                _panel.TopMost = _settings.TopMost;
        });
        var editor = new ToolStripMenuItem("Panel bearbeiten …", null, (_, _) => ShowEditor());
        editor.Font = new Font(editor.Font, FontStyle.Bold);
        var sensors = new ToolStripMenuItem("Sensoren und Zuordnung …", null, (_, _) => ShowSensors());
        var homeAssistant = new ToolStripMenuItem("Home Assistant verbinden …", null, (_, _) => ConfigureHomeAssistant());
        var setup = new ToolStripMenuItem("Einrichtung …", null, (_, _) => ShowSetup());
        var edit = new ToolStripMenuItem("Profil bearbeiten (JSON) …", null, (_, _) => EditProfile());
        var reload = new ToolStripMenuItem("Profil neu laden", null, (_, _) => _session.SendProfile());
        var data = new ToolStripMenuItem("Datenordner öffnen", null, (_, _) => Shell.OpenPath(AppPaths.Data));
        var autostart = new ToolStripMenuItem("Mit Windows starten", null, (_, _) => ToggleAutostart());
        var exit = new ToolStripMenuItem("Beenden", null, (_, _) => ExitThread());

        menu.Items.AddRange(new ToolStripItem[]
        {
            title, status, pawnIo, restartAdmin, new ToolStripSeparator(),
            showPanel, screens, topMost, new ToolStripSeparator(),
            editor, sensors, homeAssistant, setup, edit, reload, data, new ToolStripSeparator(),
            autostart, new ToolStripSeparator(),
            exit,
        });

        menu.Opening += (_, _) =>
        {
            status.Text = StatusText();
            pawnIo.Visible = _session.Hub is { Status.PawnIo: false };
            restartAdmin.Visible = !Elevation.IsElevated;
            homeAssistant.Visible = _session.Hub != null;
            homeAssistant.Text = _session.Hub is { Ha.Connected: true } ? "Home Assistant (verbunden) …" : "Home Assistant verbinden …";
            showPanel.Checked = PanelOpen;
            topMost.Checked = _settings.TopMost;
            autostart.Enabled = Elevation.IsElevated;
            autostart.Checked = Autostart.IsEnabled();
            autostart.ToolTipText = Elevation.IsElevated ? "" : "Nur mit Adminrechten änderbar";

            screens.DropDownItems.Clear();
            var current = _panel?.TargetScreen ?? ScreenPicker.Resolve(_settings);
            foreach (var screen in Screen.AllScreens)
            {
                var item = new ToolStripMenuItem(ScreenPicker.Describe(screen)) { Checked = screen.DeviceName == current.DeviceName };
                item.Click += (_, _) =>
                {
                    _settings.Screen = screen.DeviceName;
                    _settings.ScreenBounds = new[] { screen.Bounds.X, screen.Bounds.Y, screen.Bounds.Width, screen.Bounds.Height };
                    _settings.Save();
                    _panel?.ApplyScreen();
                };
                screens.DropDownItems.Add(item);
            }
        };
        return menu;
    }

    private static void TryDelete(string file)
    {
        try { File.Delete(file); }
        catch { /* egal */ }
    }

    protected override void ExitThreadCore()
    {
        _exitWatch.Stop();
        _exitWatch.Dispose();
        _tray.Visible = false;
        _panel?.Close();
        _sensors?.Close();
        _setup?.Close();
        if (_editor is { IsDisposed: false })
        {
            _editor.Dirty = false; // kein Nachfragen beim Beenden (Entwurf liegt im Editor-Speicher)
            _editor.Close();
        }
        _session.Dispose();
        _tray.Dispose();
        base.ExitThreadCore();
    }
}
