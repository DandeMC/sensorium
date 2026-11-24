using System.Diagnostics;

namespace Sensorium.Host;

/// <summary>Öffnet Links, Dateien und Ordner – immer ohne Adminrechte.</summary>
internal static class Shell
{
    private static readonly string[] AllowedHosts = { "pawnio.eu", "github.com", "learn.microsoft.com" };

    public static void OpenUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            return;
        bool allowed = AllowedHosts.Any(h =>
            uri.Host.Equals(h, StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith("." + h, StringComparison.OrdinalIgnoreCase));
        if (!allowed)
        {
            Log.Warn("Link nicht erlaubt: " + url);
            return;
        }
        Open(uri.AbsoluteUri);
    }

    public static void OpenPath(string path) => Open(path);

    /// <summary>
    /// Läuft Sensorium mit Adminrechten, würde ein direkter Start Browser oder Editor ebenfalls
    /// mit Adminrechten öffnen. Über explorer.exe startet das Ziel im normalen Benutzerkontext.
    /// </summary>
    private static void Open(string target)
    {
        try
        {
            if (Elevation.IsElevated)
            {
                var psi = new ProcessStartInfo("explorer.exe") { UseShellExecute = false };
                psi.ArgumentList.Add(target);
                Process.Start(psi);
            }
            else
            {
                Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
            }
        }
        catch (Exception ex)
        {
            Log.Error("Öffnen von " + target, ex);
        }
    }
}
