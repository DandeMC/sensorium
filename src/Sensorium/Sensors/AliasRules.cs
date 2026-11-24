using System.Globalization;
using System.Text.RegularExpressions;

namespace Sensorium.Sensors;

internal sealed record DetectedAlias(string Name, string Label, string Group, string? Expr);

/// <summary>
/// Erkennt automatisch, welcher Sensor zu welchem Namen gehört (cpu.temp, gpu.load …).
/// Die Regeln kennen die Bezeichnungen von LibreHardwareMonitor für Intel, AMD und NVIDIA.
/// </summary>
internal static partial class AliasRules
{
    private const string GroupCpu = "Prozessor";
    private const string GroupGpu = "Grafikkarte";
    private const string GroupSystem = "System";
    private const string GroupDrives = "Laufwerke";
    private const string GroupCooling = "Kühlung";
    private static readonly string[] BoardTypes = { "Motherboard", "SuperIO", "Cooler", "EmbeddedController" };
    private static readonly string[] GpuTypes = { "GpuNvidia", "GpuAmd", "GpuIntel" };

    [GeneratedRegex(@"^(CPU )?Core #\d+$")]
    private static partial Regex CoreRx();

    [GeneratedRegex(@"^(CPU )?Core #\d+ Thread #\d+$")]
    private static partial Regex ThreadRx();

    [GeneratedRegex(@"pump|aio|wasser|water", RegexOptions.IgnoreCase)]
    private static partial Regex PumpRx();

    public static List<DetectedAlias> Detect(IReadOnlyList<SensorInfo> catalog, IReadOnlyDictionary<string, object?> values)
    {
        var list = new List<DetectedAlias>();
        void Add(string name, string label, string group, string? expr) => list.Add(new DetectedAlias(name, label, group, expr));

        // ---------- Prozessor ----------
        string? cpuHw = catalog.FirstOrDefault(s => s.HardwareType == "Cpu")?.HardwareId;
        var cpu = catalog.Where(s => cpuHw != null && s.HardwareId == cpuHw).ToList();
        var cpuTemps = OfType(cpu, "Temperature");
        var cpuLoads = OfType(cpu, "Load");

        // Der bereinigte Windows-Name („Intel Core i7-11700K“) ist kürzer als der von LibreHardwareMonitor.
        Add("cpu.name", "CPU-Name", GroupCpu,
            cpuHw != null ? $"first(sys.cpu.name, {{lhm:{cpuHw}#name}})" : "sys.cpu.name");
        Add("cpu.temp", "CPU-Temperatur", GroupCpu,
            Ref(ByName(cpuTemps, "CPU Package", "Core (Tctl/Tdie)", "Core (Tctl)", "Tctl/Tdie", "Tdie", "Core Max", "Core Average")
                ?? cpuTemps.FirstOrDefault()));

        var coreTemps = cpuTemps.Where(s => CoreRx().IsMatch(s.Name)).ToList();
        var coreMax = ByName(cpuTemps, "Core Max");
        Add("cpu.temp.max", "Heißester Kern", GroupCpu,
            coreMax != null ? Ref(coreMax) : coreTemps.Count > 0 ? $"max({Join(coreTemps)})" : null);

        Add("cpu.load", "CPU-Auslastung", GroupCpu, Ref(ByName(cpuLoads, "CPU Total")));

        var coreClocks = OfType(cpu, "Clock").Where(s => CoreRx().IsMatch(s.Name)).ToList();
        Add("cpu.clock", "CPU-Takt (Durchschnitt)", GroupCpu, coreClocks.Count > 0 ? $"avg({Join(coreClocks)})" : null);

        Add("cpu.power", "CPU-Leistung", GroupCpu, Ref(ByName(OfType(cpu, "Power"), "CPU Package", "Package")));

        var threads = cpuLoads.Where(s => ThreadRx().IsMatch(s.Name)).ToList();
        if (threads.Count == 0)
            threads = cpuLoads.Where(s => CoreRx().IsMatch(s.Name)).ToList();
        Add("cpu.threads", "CPU-Threads (Liste)", GroupCpu, threads.Count > 0 ? $"list({Join(threads)})" : null);

        Add("cpu.pump", "Pumpe", GroupCpu, Ref(FindPump(catalog, values)));

        // ---------- Kühlung (AIO per USB, z. B. Corsair) ----------
        string? coolerHw = catalog.FirstOrDefault(s => s.HardwareType == "Cooler")?.HardwareId;
        var cooler = catalog.Where(s => coolerHw != null && s.HardwareId == coolerHw).ToList();
        var coolerName = cooler.FirstOrDefault(s => s.Type == "Text" && s.Id.EndsWith("#name", StringComparison.Ordinal));
        Add("cooler.name", "Kühler (Name)", GroupCooling, coolerName != null ? $"first({Ref(coolerName)}, sys.board)" : "sys.board");
        Add("cooler.liquid", "Kühlmitteltemperatur", GroupCooling, Ref(OfType(cooler, "Temperature").FirstOrDefault()));

        // ---------- Grafikkarte ----------
        string? gpuHw = GpuTypes
            .Select(t => catalog.FirstOrDefault(s => s.HardwareType == t)?.HardwareId)
            .FirstOrDefault(id => id != null);
        var gpu = catalog.Where(s => gpuHw != null && s.HardwareId == gpuHw).ToList();
        var gpuTemps = OfType(gpu, "Temperature");
        var gpuClocks = OfType(gpu, "Clock");
        var gpuPowers = OfType(gpu, "Power");
        var gpuFans = OfType(gpu, "Fan");
        var gpuData = OfType(gpu, "SmallData");
        var vramUsed = ByName(gpuData, "GPU Memory Used", "D3D Dedicated Memory Used");
        var vramTotal = ByName(gpuData, "GPU Memory Total");

        Add("gpu.name", "GPU-Name", GroupGpu, gpuHw != null ? $"{{lhm:{gpuHw}#name}}" : null);
        Add("gpu.temp", "GPU-Temperatur", GroupGpu, Ref(ByName(gpuTemps, "GPU Core") ?? gpuTemps.FirstOrDefault()));
        Add("gpu.hotspot", "GPU-Hotspot", GroupGpu, Ref(ByName(gpuTemps, "GPU Hot Spot", "GPU Hotspot")));
        Add("gpu.load", "GPU-Auslastung", GroupGpu, Ref(ByName(OfType(gpu, "Load"), "GPU Core", "D3D 3D")));
        Add("gpu.clock", "GPU-Takt", GroupGpu, Ref(ByName(gpuClocks, "GPU Core")));
        Add("gpu.memclock", "GPU-Speichertakt", GroupGpu, Ref(ByName(gpuClocks, "GPU Memory")));
        Add("gpu.power", "GPU-Leistung", GroupGpu,
            Ref(ByName(gpuPowers, "GPU Package", "GPU Power", "GPU Board Power", "GPU Core") ?? gpuPowers.FirstOrDefault()));
        Add("gpu.fan", "GPU-Lüfter", GroupGpu, Ref(ByName(gpuFans, "GPU Fan", "GPU Fan 1", "GPU Fan #1") ?? gpuFans.FirstOrDefault()));
        Add("gpu.vram.used", "Grafikspeicher belegt (GB)", GroupGpu, vramUsed != null ? $"{Ref(vramUsed)} / 1024" : null);
        Add("gpu.vram.total", "Grafikspeicher gesamt (GB)", GroupGpu, vramTotal != null ? $"{Ref(vramTotal)} / 1024" : null);
        Add("gpu.voltage", "GPU-Spannung", GroupGpu, Ref(ByName(OfType(gpu, "Voltage"), "GPU Core Voltage", "GPU Core")));

        // ---------- System ----------
        Add("power.total", "Leistung CPU + GPU", GroupSystem, "cpu.power + gpu.power");

        // ---------- Laufwerke (je Laufwerksbuchstabe) ----------
        var storages = catalog
            .Where(s => s.HardwareType == "Storage" && s.Id.EndsWith("#name", StringComparison.Ordinal))
            .Select(s => (HwId: s.HardwareId, Name: s.Hardware))
            .ToList();
        var diskKeys = values.Keys
            .Where(k => k.StartsWith("sys.drive.", StringComparison.Ordinal) && k.EndsWith(".disk", StringComparison.Ordinal))
            .OrderBy(k => k, StringComparer.Ordinal)
            .ToList();
        foreach (string key in diskKeys)
        {
            string letter = key.Split('.')[2];
            int disk = values.GetValueOrDefault(key) is int n ? n : -1;
            string model = values.GetValueOrDefault($"sys.drive.{letter}.model") as string ?? "";
            string? hwId = MatchStorage(storages, disk, model);
            var temps = hwId == null ? new List<SensorInfo>() : catalog.Where(s => s.HardwareId == hwId && s.Type == "Temperature").ToList();
            Add($"drive.{letter}.temp", $"Laufwerk {letter}: Temperatur", GroupDrives, Ref(temps.FirstOrDefault()));
            Add($"drive.{letter}.model", $"Laufwerk {letter}: Modell", GroupDrives,
                hwId != null ? $"first({{lhm:{hwId}#name}}, sys.drive.{letter}.model)" : $"sys.drive.{letter}.model");
        }

        return list;
    }

    private static List<SensorInfo> OfType(IEnumerable<SensorInfo> sensors, string type) =>
        sensors.Where(s => s.Type == type).ToList();

    private static SensorInfo? ByName(IReadOnlyList<SensorInfo> sensors, params string[] names)
    {
        foreach (string name in names)
        {
            var hit = sensors.FirstOrDefault(s => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
            if (hit != null)
                return hit;
        }
        return null;
    }

    private static string? Ref(SensorInfo? sensor) => sensor == null ? null : "{" + sensor.Id + "}";

    private static string Join(IEnumerable<SensorInfo> sensors) => string.Join(", ", sensors.Select(s => "{" + s.Id + "}"));

    private static SensorInfo? FindPump(IReadOnlyList<SensorInfo> catalog, IReadOnlyDictionary<string, object?> values)
    {
        var fans = catalog.Where(s => s.Type == "Fan" && BoardTypes.Contains(s.HardwareType)).ToList();
        // Eine AIO, die direkt ausgelesen wird, liefert den echten Pumpenwert. Mainboard-Anschlüsse
        // bekommen von manchen AIOs nur ein Ersatzsignal (bei der H115i Platinum fast doppelt so hoch).
        var named = fans
            .Where(s => PumpRx().IsMatch(s.Name))
            .OrderBy(s => s.HardwareType == "Cooler" ? 0 : 1)
            .FirstOrDefault();
        if (named != null)
            return named;
        // Ohne passende Bezeichnung: AIO-Pumpen laufen meist konstant über 1800 U/min, Gehäuselüfter darunter.
        return fans
            .Select(s => (Sensor: s, Rpm: Formula.Num(values.GetValueOrDefault(s.Id)) ?? 0))
            .Where(x => x.Rpm > 1800)
            .OrderByDescending(x => x.Rpm)
            .Select(x => x.Sensor)
            .FirstOrDefault();
    }

    private static string? MatchStorage(List<(string HwId, string Name)> storages, int disk, string model)
    {
        bool NameMatch((string HwId, string Name) s) =>
            model.Length > 0 && s.Name.Trim().Equals(model.Trim(), StringComparison.OrdinalIgnoreCase);
        bool IndexMatch((string HwId, string Name) s) =>
            disk >= 0 && s.HwId.EndsWith("/" + disk.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal);

        var both = storages.Where(s => NameMatch(s) && IndexMatch(s)).ToList();
        if (both.Count == 1) return both[0].HwId;
        var byName = storages.Where(NameMatch).ToList();
        if (byName.Count == 1) return byName[0].HwId;
        var byIndex = storages.Where(IndexMatch).ToList();
        if (byIndex.Count == 1) return byIndex[0].HwId;
        return null;
    }
}
