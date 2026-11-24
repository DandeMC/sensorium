namespace Sensorium.Host;

/// <summary>
/// Fenster „Panel bearbeiten“: Seiten, Karten und Elemente mit der Maus gestalten, Sensoren und
/// Home-Assistant-Werte zuordnen, Formeln und Design ändern. Gespeichert wird als eigenes Profil.
/// </summary>
internal sealed class EditorWindow : WebWindow
{
    public EditorWindow(Options options) : base("editor.html", options)
    {
        Text = "Sensorium – Panel bearbeiten";
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        StartPosition = FormStartPosition.Manual;
        MinimumSize = new Size(1280, 760);
        var area = (Screen.PrimaryScreen ?? Screen.AllScreens[0]).WorkingArea;
        Bounds = new Rectangle(area.X + area.Width / 10, area.Y + area.Height / 20, area.Width * 8 / 10, area.Height * 9 / 10);
        WindowState = FormWindowState.Maximized;
    }

    /// <summary>Der Editor meldet, ob es ungespeicherte Änderungen gibt.</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public bool Dirty { get; set; }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (Dirty && e.CloseReason == CloseReason.UserClosing &&
            MessageBox.Show(this, "Es gibt ungespeicherte Änderungen. Trotzdem schließen und die Änderungen verwerfen?",
                "Sensorium", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
        {
            e.Cancel = true;
        }
        base.OnFormClosing(e);
    }
}
