using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Sensorium.Host;

/// <summary>
/// Fenster mit WebView2, das eine Seite aus dem Web-Ordner anzeigt und Nachrichten austauscht.
/// Heilt sich selbst: Fällt der Browser-Prozess weg oder meldet sich die Seite nicht mehr,
/// wird die Anzeige komplett neu aufgebaut.
/// </summary>
internal abstract class WebWindow : Form
{
    private const string Origin = "https://app.sensorium/";
    private const int SilentLimitMs = 45_000;   // Seite meldet sich alle 5 s – so lange darf sie schweigen
    private const int StartLimitMs = 60_000;    // so lange darf das erste „ready“ dauern

    private static Task<CoreWebView2Environment>? _environment;
    private readonly string _page;
    private readonly System.Windows.Forms.Timer _watchdog = new() { Interval = 10_000 };
    private WebView2 _web;
    private bool _ready;
    private bool _recreating;
    private long _initStarted;
    private long _lastMessage;

    protected WebWindow(string page, Options options)
    {
        _page = page;
        Options = options;
        BackColor = Color.FromArgb(5, 9, 15);
        Icon = AppIcon.Get();
        _web = CreateWebView();
        Controls.Add(_web);
        _watchdog.Tick += (_, _) => CheckAlive();
    }

    protected WebView2 Web => _web;
    protected Options Options { get; }

    /// <summary>Die Seite hat sich gemeldet und kann Nachrichten empfangen.</summary>
    public event Action<WebWindow>? Ready;
    public event Action<WebWindow, JsonElement>? MessageReceived;

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        _watchdog.Start();
        await InitializeWebAsync();
    }

    private static WebView2 CreateWebView() =>
        new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(5, 9, 15) };

    private static Task<CoreWebView2Environment> GetEnvironmentAsync() =>
        _environment ??= CoreWebView2Environment.CreateAsync(null, AppPaths.WebViewData, new CoreWebView2EnvironmentOptions(
            // Das Panel soll auch weiterlaufen, wenn es verdeckt ist oder ein Spiel im Vordergrund ist.
            "--disable-features=CalculateNativeWinOcclusion --disable-background-timer-throttling " +
            "--disable-renderer-backgrounding --disable-backgrounding-occluded-windows"));

    private async Task InitializeWebAsync()
    {
        _initStarted = Environment.TickCount64;
        var web = _web;
        try
        {
            await web.EnsureCoreWebView2Async(await GetEnvironmentAsync());
            if (!ReferenceEquals(web, _web))
                return; // inzwischen ersetzt
            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping("app.sensorium", AppPaths.WebDir, CoreWebView2HostResourceAccessKind.Allow);

            var settings = core.Settings;
            settings.AreDevToolsEnabled = Options.DevTools;
            settings.AreDefaultContextMenusEnabled = Options.DevTools;
            settings.AreBrowserAcceleratorKeysEnabled = Options.DevTools;
            settings.IsZoomControlEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsPinchZoomEnabled = false;
            settings.IsSwipeNavigationEnabled = false;
            settings.IsGeneralAutofillEnabled = false;
            settings.IsPasswordAutosaveEnabled = false;

            core.WebMessageReceived += OnWebMessage;
            core.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                Shell.OpenUrl(args.Uri);
            };
            core.NavigationStarting += (_, args) =>
            {
                if (!args.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase))
                {
                    args.Cancel = true;
                    Shell.OpenUrl(args.Uri);
                }
            };
            core.ProcessFailed += OnProcessFailed;

            web.Source = new Uri(Origin + PageUrl());
        }
        catch (WebView2RuntimeNotFoundException ex)
        {
            Log.Error("WebView2-Laufzeit fehlt", ex);
            MessageBox.Show("Die Microsoft Edge WebView2-Laufzeit fehlt. Bitte installiere sie von microsoft.com.",
                "Sensorium", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch (Exception ex)
        {
            // Häufigster Fall: Der Browser-Prozess einer gerade beendeten Instanz war noch nicht weg.
            Log.Error("WebView2 starten", ex);
            _environment = null;
            ScheduleRecreate("Start fehlgeschlagen");
        }
    }

    private void OnProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs args)
    {
        Log.Warn($"WebView2-Prozess ausgefallen: {args.ProcessFailedKind}");
        switch (args.ProcessFailedKind)
        {
            case CoreWebView2ProcessFailedKind.BrowserProcessExited:
                // Der ganze Browser ist weg: Umgebung und Anzeige müssen neu erstellt werden.
                _environment = null;
                ScheduleRecreate("Browser-Prozess beendet");
                break;
            case CoreWebView2ProcessFailedKind.RenderProcessExited:
            case CoreWebView2ProcessFailedKind.RenderProcessUnresponsive:
                BeginInvoke(new Action(() =>
                {
                    _ready = false;
                    try { _web.Reload(); }
                    catch { ScheduleRecreate("Neu laden fehlgeschlagen"); }
                }));
                break;
        }
    }

    /// <summary>Wächter: Seite schweigt zu lange oder wurde nie fertig → komplett neu aufbauen.</summary>
    private void CheckAlive()
    {
        if (_recreating || IsDisposed)
            return;
        long now = Environment.TickCount64;
        if (_ready && now - _lastMessage > SilentLimitMs)
            ScheduleRecreate("Seite meldet sich nicht mehr");
        else if (!_ready && _initStarted > 0 && now - _initStarted > StartLimitMs)
            ScheduleRecreate("Seite wurde nicht fertig geladen");
    }

    private void ScheduleRecreate(string reason)
    {
        if (_recreating || IsDisposed || !IsHandleCreated)
            return;
        _recreating = true;
        _ready = false;
        Log.Warn($"Anzeige wird neu aufgebaut: {reason}.");
        BeginInvoke(new Action(async () =>
        {
            try
            {
                var old = _web;
                old.Visible = false;
                Controls.Remove(old);
                try { old.Dispose(); } catch { /* Prozess ist ohnehin weg */ }
                await Task.Delay(1500); // alten Browser-Prozess ausklingen lassen
                _web = CreateWebView();
                Controls.Add(_web);
                await InitializeWebAsync();
            }
            catch (Exception ex)
            {
                Log.Error("Anzeige neu aufbauen", ex);
            }
            finally
            {
                _recreating = false;
            }
        }));
    }

    private string PageUrl() =>
        Options.Demo == null ? _page : $"{_page}?demo={Uri.EscapeDataString(Options.Demo)}";

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        _lastMessage = Environment.TickCount64;
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var root = document.RootElement;
            string? type = root.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            switch (type)
            {
                case "heartbeat":
                    break;
                case "ready":
                    _ready = true;
                    Ready?.Invoke(this);
                    break;
                case "open":
                    if (root.TryGetProperty("url", out var url) && url.ValueKind == JsonValueKind.String)
                        Shell.OpenUrl(url.GetString() ?? "");
                    break;
                default:
                    MessageReceived?.Invoke(this, root.Clone());
                    break;
            }
        }
        catch (Exception ex)
        {
            Log.Error("Nachricht aus der Weboberfläche", ex);
        }
    }

    /// <summary>Schickt eine JSON-Nachricht an die Seite (nur im UI-Thread aufrufen).</summary>
    public void Post(string json)
    {
        if (!_ready || IsDisposed || _web.CoreWebView2 == null)
            return;
        try
        {
            _web.CoreWebView2.PostWebMessageAsJson(json);
        }
        catch (Exception ex)
        {
            Log.WarnOnce("post-" + GetType().Name, "Senden an die Weboberfläche: " + ex.Message);
        }
    }

    /// <summary>Speichert den aktuellen Inhalt als PNG.</summary>
    public async Task<bool> CaptureAsync(string file)
    {
        if (_web.CoreWebView2 == null)
            return false;
        await using var stream = File.Create(file);
        await _web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
        return true;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _watchdog.Stop();
            _watchdog.Dispose();
        }
        base.Dispose(disposing);
    }
}
