using LibreHardwareMonitor.Hardware;
using Microsoft.Win32;

namespace Sensorium.Sensors;

/// <summary>
/// Hardwaresensoren über LibreHardwareMonitor: CPU, Grafikkarte, Mainboard (Lüfter, Pumpe),
/// Arbeitsspeicher und Laufwerke. CPU-Temperatur, -Takt, -Leistung und Mainboard-Lüfter
/// brauchen den PawnIO-Treiber und Adminrechte.
/// </summary>
public sealed class HardwareProvider : ISensorProvider
{
    private readonly object _gate = new();
    private readonly UpdateVisitor _visitor = new();
    private readonly HashSet<string> _knownHardware = new(StringComparer.Ordinal);
    private readonly List<(ISensor Sensor, string Id)> _sensors = new();
    private readonly List<(string Id, string Name)> _names = new();
    private readonly List<SensorInfo> _catalog = new();
    /// <summary>CPU-Leistungssensoren liefern ohne PawnIO-Zugriff 0 statt „unbekannt“.</summary>
    private readonly HashSet<string> _needsDriver = new(StringComparer.Ordinal);
    /// <summary>PawnIO lässt sich nur mit Adminrechten nutzen.</summary>
    private readonly bool _pawnIo = IsPawnIoInstalled() && Elevation.IsElevated;
    private Computer? _computer;
    private bool _changed;

    public string Name => "LibreHardwareMonitor";

    public IReadOnlyList<SensorInfo> Catalog
    {
        get { lock (_gate) return _catalog.ToList(); }
    }

    public static bool IsPawnIoInstalled()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\PawnIO");
            if (key != null)
                return true;
        }
        catch
        {
            // ignorieren, Dateiprüfung folgt
        }
        return File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "PawnIO", "PawnIOLib.dll"));
    }

    public void Start()
    {
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsMotherboardEnabled = true,
            IsControllerEnabled = true,
            IsStorageEnabled = true,
            IsNetworkEnabled = false, // Netzwerk liefert der SystemProvider
            IsPsuEnabled = false,
            IsBatteryEnabled = false,
        };
        _computer.HardwareAdded += hardware =>
        {
            lock (_gate) { AddHardware(hardware); _changed = true; }
        };
        _computer.HardwareRemoved += hardware =>
        {
            lock (_gate) { RemoveHardware(hardware); _changed = true; }
        };
        _computer.Open();
        _computer.Accept(_visitor);
        lock (_gate)
        {
            foreach (var hardware in _computer.Hardware)
                AddHardware(hardware);
        }
        Log.Info($"LibreHardwareMonitor: {_knownHardware.Count} Geräte, {_sensors.Count} Sensoren.");
    }

    public void Update(Dictionary<string, object?> values)
    {
        if (_computer == null)
            return;
        _computer.Accept(_visitor);
        lock (_gate)
        {
            foreach (var (sensor, id) in _sensors)
            {
                float? f = sensor.Value;
                bool unknown = !f.HasValue || !float.IsFinite(f.Value) || (!_pawnIo && _needsDriver.Contains(id));
                values[id] = unknown ? null : (double)f!.Value;
            }
            foreach (var (id, name) in _names)
                values[id] = name;
        }
    }

    public bool TakeCatalogChange()
    {
        lock (_gate)
        {
            bool changed = _changed;
            _changed = false;
            return changed;
        }
    }

    private void AddHardware(IHardware hardware)
    {
        string hwId = hardware.Identifier.ToString();
        if (!_knownHardware.Add(hwId))
            return;

        string nameId = "lhm:" + hwId + "#name";
        _names.Add((nameId, hardware.Name));
        _catalog.Add(new SensorInfo(nameId, "Name", hardware.Name, hwId, hardware.HardwareType.ToString(), "Text", "", "lhm"));

        foreach (var sensor in hardware.Sensors)
            AddSensor(hardware, sensor);
        hardware.SensorAdded += sensor =>
        {
            lock (_gate) { AddSensor(hardware, sensor); _changed = true; }
        };
        hardware.SensorRemoved += sensor =>
        {
            lock (_gate) { RemoveSensor(sensor); _changed = true; }
        };

        foreach (var sub in hardware.SubHardware)
            AddHardware(sub);
    }

    private void AddSensor(IHardware hardware, ISensor sensor)
    {
        string id = "lhm:" + sensor.Identifier;
        if (_sensors.Any(x => x.Id == id))
            return;
        _sensors.Add((sensor, id));
        string type = sensor.SensorType.ToString();
        if (hardware.HardwareType == HardwareType.Cpu && sensor.SensorType == SensorType.Power)
            _needsDriver.Add(id);
        _catalog.Add(new SensorInfo(id, sensor.Name, hardware.Name, hardware.Identifier.ToString(),
            hardware.HardwareType.ToString(), type, UnitFor(type), "lhm"));
    }

    private void RemoveSensor(ISensor sensor)
    {
        string id = "lhm:" + sensor.Identifier;
        _sensors.RemoveAll(x => x.Id == id);
        _catalog.RemoveAll(x => x.Id == id);
    }

    private void RemoveHardware(IHardware hardware)
    {
        string hwId = hardware.Identifier.ToString();
        _knownHardware.Remove(hwId);
        _names.RemoveAll(x => x.Id == "lhm:" + hwId + "#name");
        _catalog.RemoveAll(x => x.HardwareId == hwId);
        _sensors.RemoveAll(x => x.Sensor.Hardware.Identifier.ToString() == hwId);
        foreach (var sub in hardware.SubHardware)
            RemoveHardware(sub);
    }

    private static string UnitFor(string sensorType) => sensorType switch
    {
        "Voltage" => "V",
        "Current" => "A",
        "Power" => "W",
        "Clock" => "MHz",
        "Temperature" => "°C",
        "Load" => "%",
        "Frequency" => "Hz",
        "Fan" => "RPM",
        "Flow" => "L/h",
        "Control" => "%",
        "Level" => "%",
        "Data" => "GB",
        "SmallData" => "MB",
        "Throughput" => "B/s",
        "TimeSpan" => "s",
        "Energy" => "mWh",
        "Noise" => "dBA",
        "Humidity" => "%",
        _ => "",
    };

    public void Dispose()
    {
        try { _computer?.Close(); } catch { }
    }

    private sealed class UpdateVisitor : IVisitor
    {
        public void VisitComputer(IComputer computer) => computer.Traverse(this);

        public void VisitHardware(IHardware hardware)
        {
            hardware.Update();
            foreach (var sub in hardware.SubHardware)
                sub.Accept(this);
        }

        public void VisitSensor(ISensor sensor) { }

        public void VisitParameter(IParameter parameter) { }
    }
}
