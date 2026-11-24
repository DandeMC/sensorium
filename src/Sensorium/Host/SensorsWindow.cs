namespace Sensorium.Host;

/// <summary>Fenster „Sensoren und Zuordnung“: alle Sensoren mit Live-Werten, Zuordnungen ändern.</summary>
internal sealed class SensorsWindow : WebWindow
{
    public SensorsWindow(Options options) : base("sensors.html", options)
    {
        Text = "Sensorium – Sensoren und Zuordnung";
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1400, 880);
        MinimumSize = new Size(900, 560);
    }
}
