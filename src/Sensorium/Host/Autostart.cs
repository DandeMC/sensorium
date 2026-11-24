using System.Diagnostics;
using System.Security;
using System.Security.Principal;
using System.Text;

namespace Sensorium.Host;

/// <summary>
/// Autostart über die Windows-Aufgabenplanung mit höchsten Rechten:
/// Sensorium startet beim Anmelden ohne UAC-Abfrage und ohne Laufzeitbegrenzung.
/// </summary>
internal static class Autostart
{
    private const string TaskName = "Sensorium";

    public static bool IsEnabled() => Run("/Query", "/TN", TaskName) == 0;

    public static void Enable()
    {
        string exe = Environment.ProcessPath ?? throw new InvalidOperationException("Programmpfad unbekannt.");
        string user = SecurityElement.Escape(WindowsIdentity.GetCurrent().Name);
        string command = SecurityElement.Escape(exe);
        string folder = SecurityElement.Escape(Path.GetDirectoryName(exe) ?? "");
        string xml = $"""
            <?xml version="1.0" encoding="UTF-16"?>
            <Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
              <RegistrationInfo><Description>Startet Sensorium beim Anmelden.</Description></RegistrationInfo>
              <Triggers>
                <LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId><Delay>PT5S</Delay></LogonTrigger>
              </Triggers>
              <Principals>
                <Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal>
              </Principals>
              <Settings>
                <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
                <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
                <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
                <AllowHardTerminate>true</AllowHardTerminate>
                <StartWhenAvailable>false</StartWhenAvailable>
                <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
                <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
                <AllowStartOnDemand>true</AllowStartOnDemand>
                <Enabled>true</Enabled>
                <Hidden>false</Hidden>
                <RunOnlyIfIdle>false</RunOnlyIfIdle>
                <WakeToRun>false</WakeToRun>
                <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
                <Priority>6</Priority>
              </Settings>
              <Actions Context="Author">
                <Exec><Command>"{command}"</Command><Arguments>--autostart</Arguments><WorkingDirectory>{folder}</WorkingDirectory></Exec>
              </Actions>
            </Task>
            """;
        string file = Path.Combine(Path.GetTempPath(), "sensorium-task.xml");
        File.WriteAllText(file, xml, Encoding.Unicode);
        try
        {
            int code = Run("/Create", "/TN", TaskName, "/XML", file, "/F");
            if (code != 0)
                throw new InvalidOperationException($"Die Aufgabenplanung meldet Fehler {code}.");
        }
        finally
        {
            File.Delete(file);
        }
    }

    public static void Disable() => Run("/Delete", "/TN", TaskName, "/F");

    private static int Run(params string[] args)
    {
        var psi = new ProcessStartInfo("schtasks.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (string arg in args)
            psi.ArgumentList.Add(arg);
        using var process = Process.Start(psi)!;
        process.StandardOutput.ReadToEnd();
        process.StandardError.ReadToEnd();
        process.WaitForExit(10_000);
        return process.ExitCode;
    }
}
