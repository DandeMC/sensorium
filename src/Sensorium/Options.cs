namespace Sensorium;

/// <summary>Kommandozeilen-Optionen.</summary>
internal sealed class Options
{
    public bool NoElevate { get; private set; }
    public bool Autostart { get; private set; }
    public bool Restart { get; private set; }
    public bool DevTools { get; private set; }
    /// <summary>Editor öffnen (läuft Sensorium schon, öffnet die laufende Instanz ihn).</summary>
    public bool Editor { get; private set; }
    /// <summary>Einrichtungsassistent öffnen.</summary>
    public bool Setup { get; private set; }
    /// <summary>"normal" oder "gaming": simulierte Werte statt echter Sensoren.</summary>
    public string? Demo { get; private set; }
    public string? Probe { get; private set; }
    public string? Screenshot { get; private set; }
    public string? CorsairDump { get; private set; }
    public string Page { get; private set; } = "panel";
    public int DelaySeconds { get; private set; } = 6;

    public static Options Parse(string[] args)
    {
        var o = new Options();
        for (int i = 0; i < args.Length; i++)
        {
            string arg = args[i].ToLowerInvariant();
            string? next = i + 1 < args.Length && !args[i + 1].StartsWith("--", StringComparison.Ordinal) ? args[i + 1] : null;
            switch (arg)
            {
                case "--no-elevate": o.NoElevate = true; break;
                case "--autostart": o.Autostart = true; break;
                case "--restart": o.Restart = true; break;
                case "--devtools": o.DevTools = true; break;
                case "--editor": o.Editor = true; break;
                case "--setup": o.Setup = true; break;
                case "--demo":
                    o.Demo = next ?? "normal";
                    if (next != null) i++;
                    break;
                case "--probe":
                    o.Probe = next ?? Path.Combine(AppPaths.Data, "probe.json");
                    o.NoElevate = true;
                    if (next != null) i++;
                    break;
                case "--screenshot":
                    o.Screenshot = next ?? Path.Combine(AppPaths.Data, "screenshot.png");
                    o.NoElevate = true;
                    if (next != null) i++;
                    break;
                case "--corsair-dump":
                    o.CorsairDump = next ?? Path.Combine(AppPaths.Data, "corsair.txt");
                    if (next != null) i++;
                    break;
                case "--page":
                    if (next != null) { o.Page = next.ToLowerInvariant(); i++; }
                    break;
                case "--delay":
                    if (next != null && int.TryParse(next, out int d)) { o.DelaySeconds = Math.Clamp(d, 1, 120); i++; }
                    break;
            }
        }
        return o;
    }
}
