using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sensorium.Sensors;

namespace Sensorium.Host;

/// <summary>Diagnose: liest drei Durchläufe und schreibt alle Sensoren, Werte und Zuordnungen als JSON.</summary>
internal static class Probe
{
    public static int Run(Options options)
    {
        using var hub = new SensorHub(Settings.Load());
        using var done = new ManualResetEventSlim();
        int frames = 0;
        hub.FrameReady += _ =>
        {
            if (Interlocked.Increment(ref frames) >= 3)
                done.Set();
        };
        hub.Start();
        bool complete = done.Wait(TimeSpan.FromSeconds(90));

        var values = hub.Last?.Values;
        object? Value(string key) => values != null && values.TryGetValue(key, out var v) ? v : null;
        var report = new
        {
            elevated = Elevation.IsElevated,
            pawnio = hub.Status.PawnIo,
            rtss = hub.Status.Rtss,
            hardwareError = hub.Status.HardwareError,
            complete,
            aliases = hub.Aliases.Snapshot().Select(a => new { a.Name, a.Group, a.Expr, a.Auto, a.Error, value = Value(a.Name) }),
            sensors = hub.Catalog.Select(s => new { s.Id, s.Name, s.Hardware, s.HardwareType, s.Type, s.Unit, value = Value(s.Id) }),
        };
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
        });
        File.WriteAllText(options.Probe!, json);
        return complete ? 0 : 1;
    }
}
