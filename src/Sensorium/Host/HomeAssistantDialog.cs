using Sensorium.Sensors;

namespace Sensorium.Host;

/// <summary>Adresse und Zugriffstoken für Home Assistant eingeben, testen und speichern.</summary>
internal sealed class HomeAssistantDialog : Form
{
    private readonly TextBox _url = new() { Width = 440 };
    private readonly TextBox _token = new() { Width = 440, UseSystemPasswordChar = true };
    private readonly Label _status = new() { AutoSize = true, MaximumSize = new Size(440, 0), Margin = new Padding(3, 10, 3, 3) };
    private readonly Button _test = new() { Text = "Verbindung testen", AutoSize = true };
    private readonly Button _save = new() { Text = "Speichern", AutoSize = true };
    private readonly Button _cancel = new() { Text = "Abbrechen", AutoSize = true, DialogResult = DialogResult.Cancel };
    private readonly bool _hasToken;

    public HomeAssistantDialog(string? url, bool hasToken)
    {
        _hasToken = hasToken;
        Text = "Home Assistant verbinden";
        Icon = AppIcon.Get();
        Font = new Font("Segoe UI", 9.75f);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = true;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(14);

        _url.Text = string.IsNullOrWhiteSpace(url) ? "http://homeassistant.local:8123" : url;
        _token.PlaceholderText = hasToken ? "gespeichert – leer lassen, um ihn zu behalten" : "Token hier einfügen (Strg+V)";

        var help = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(440, 0),
            ForeColor = SystemColors.GrayText,
            Margin = new Padding(3, 6, 3, 3),
            Text = "So bekommst du den Token: In Home Assistant links unten auf deinen Namen klicken → Reiter „Sicherheit“ → " +
                   "ganz unten „Langlebige Zugriffstoken“ → „Token erstellen“, Name zum Beispiel „Sensorium“. " +
                   "Den angezeigten Token kopieren und hier einfügen. Sensorium speichert ihn verschlüsselt.",
        };

        var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Dock = DockStyle.Fill, Margin = new Padding(0, 12, 0, 0) };
        buttons.Controls.AddRange([_cancel, _save, _test]);

        var layout = new TableLayoutPanel { ColumnCount = 1, AutoSize = true, Dock = DockStyle.Fill };
        layout.Controls.Add(new Label { Text = "Adresse von Home Assistant", AutoSize = true });
        layout.Controls.Add(_url);
        layout.Controls.Add(new Label { Text = "Langlebiger Zugriffstoken", AutoSize = true, Margin = new Padding(3, 14, 3, 3) });
        layout.Controls.Add(_token);
        layout.Controls.Add(help);
        layout.Controls.Add(_status);
        layout.Controls.Add(buttons);
        Controls.Add(layout);

        AcceptButton = _save;
        CancelButton = _cancel;
        _test.Click += async (_, _) => await CheckAsync(save: false);
        _save.Click += async (_, _) => await CheckAsync(save: true);
    }

    public string Url => _url.Text.Trim();

    /// <summary>Neu eingegebener Token oder null, wenn der gespeicherte bleiben soll.</summary>
    public string? NewToken { get; private set; }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        Activate();
        (_hasToken ? _url : _token).Focus();
    }

    private async Task CheckAsync(bool save)
    {
        string url = Url;
        string typed = _token.Text.Trim();
        string? token = typed.Length > 0 ? typed : _hasToken ? TokenStore.Load() : null;
        if (url.Length == 0 || string.IsNullOrEmpty(token))
        {
            ShowStatus("Bitte Adresse und Token eintragen.", false);
            return;
        }

        SetBusy(true);
        ShowStatus("Verbinde …", null);
        try
        {
            string version = await HomeAssistantProvider.TestAsync(url, token, CancellationToken.None);
            ShowStatus($"Verbunden mit Home Assistant {version}.", true);
            if (save)
                Accept(typed);
        }
        catch (HaAuthException)
        {
            ShowStatus("Home Assistant hat den Token abgelehnt. Ist er vollständig eingefügt?", false);
        }
        catch (Exception ex)
        {
            ShowStatus("Keine Verbindung: " + ex.Message, false);
            if (save && MessageBox.Show(this, "Home Assistant ist gerade nicht erreichbar. Trotzdem speichern?", Text,
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                Accept(typed);
        }
        finally
        {
            if (!IsDisposed)
                SetBusy(false);
        }
    }

    private void Accept(string typed)
    {
        NewToken = typed.Length > 0 ? typed : null;
        DialogResult = DialogResult.OK;
        Close();
    }

    private void SetBusy(bool busy)
    {
        _test.Enabled = !busy;
        _save.Enabled = !busy;
        UseWaitCursor = busy;
    }

    private void ShowStatus(string text, bool? ok)
    {
        _status.Text = text;
        _status.ForeColor = ok switch
        {
            true => Color.FromArgb(0, 128, 64),
            false => Color.FromArgb(190, 30, 45),
            null => SystemColors.ControlText,
        };
    }
}
