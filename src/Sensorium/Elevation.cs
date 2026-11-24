using System.ComponentModel;
using System.Diagnostics;
using System.Security.Principal;

namespace Sensorium;

/// <summary>Adminrechte prüfen und bei Bedarf per UAC neu starten.</summary>
internal static class Elevation
{
    public static bool IsElevated { get; } = Check();

    private static bool Check()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Startet Sensorium mit Adminrechten neu. Liefert false, wenn die UAC-Abfrage abgelehnt wurde.</summary>
    public static bool RelaunchElevated(IEnumerable<string> args)
    {
        try
        {
            var psi = new ProcessStartInfo(Environment.ProcessPath!)
            {
                UseShellExecute = true,
                Verb = "runas",
                WorkingDirectory = AppContext.BaseDirectory,
                Arguments = string.Join(" ", args.Select(Quote)),
            };
            Process.Start(psi);
            return true;
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == 1223)
        {
            Log.Info("Adminabfrage abgelehnt.");
            return false;
        }
        catch (Exception ex)
        {
            Log.Error("Neustart mit Adminrechten", ex);
            return false;
        }
    }

    private static string Quote(string arg) =>
        arg.Length > 0 && !arg.Any(c => char.IsWhiteSpace(c) || c == '"')
            ? arg
            : "\"" + arg.Replace("\"", "\\\"") + "\"";
}
