namespace Sensorium.Host;

/// <summary>Einrichtungsassistent: Bildschirm, Sensoren, Home Assistant (optional), Autostart.</summary>
internal sealed class SetupWindow : WebWindow
{
    public SetupWindow(Options options) : base("setup.html", options)
    {
        Text = "Sensorium – Einrichtung";
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1180, 800);
        MinimumSize = new Size(980, 680);
    }
}

/// <summary>Zeigt auf jedem Bildschirm kurz eine große Nummer, damit man sie im Assistenten zuordnen kann.</summary>
internal static class ScreenIdentifier
{
    /// <summary>Bildschirme in der Reihenfolge, in der der Assistent sie nummeriert (von links nach rechts).</summary>
    public static Screen[] Ordered() =>
        Screen.AllScreens.OrderBy(s => s.Bounds.X).ThenBy(s => s.Bounds.Y).ToArray();

    public static void Show()
    {
        var screens = Ordered();
        for (int i = 0; i < screens.Length; i++)
        {
            var screen = screens[i];
            var form = new Form
            {
                FormBorderStyle = FormBorderStyle.None,
                StartPosition = FormStartPosition.Manual,
                ShowInTaskbar = false,
                TopMost = true,
                BackColor = Color.FromArgb(10, 16, 26),
                Opacity = 0.94,
            };
            var size = new Size(Math.Min(460, screen.Bounds.Width / 2), Math.Min(300, screen.Bounds.Height / 2));
            form.Bounds = new Rectangle(
                screen.Bounds.X + (screen.Bounds.Width - size.Width) / 2,
                screen.Bounds.Y + (screen.Bounds.Height - size.Height) / 2,
                size.Width, size.Height);
            var number = new Label
            {
                Text = (i + 1).ToString(),
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Bahnschrift Light", 120f, FontStyle.Regular, GraphicsUnit.Pixel),
                ForeColor = Color.FromArgb(56, 210, 239),
            };
            var caption = new Label
            {
                Text = $"{screen.DeviceName.Replace(@"\\.\", "")} · {screen.Bounds.Width} × {screen.Bounds.Height}",
                Dock = DockStyle.Bottom,
                Height = 54,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = new Font("Segoe UI", 18f, FontStyle.Regular, GraphicsUnit.Pixel),
                ForeColor = Color.FromArgb(160, 176, 196),
            };
            form.Controls.Add(number);
            form.Controls.Add(caption);
            var timer = new System.Windows.Forms.Timer { Interval = 3000 };
            timer.Tick += (_, _) => { timer.Dispose(); form.Close(); form.Dispose(); };
            form.Show();
            timer.Start();
        }
    }
}
