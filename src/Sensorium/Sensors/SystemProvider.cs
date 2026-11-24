using System.Globalization;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;

namespace Sensorium.Sensors;

/// <summary>
/// Werte direkt aus Windows: Arbeitsspeicher, Netzwerk, Laufwerke (Belegung, Lesen/Schreiben),
/// Laufzeit sowie Infos zu CPU, RAM und Mainboard. Funktioniert ohne Adminrechte.
/// </summary>
public sealed partial class SystemProvider : ISensorProvider
{
    private static readonly CultureInfo German = CultureInfo.GetCultureInfo("de-DE");
    private readonly List<SensorInfo> _catalog = new();
    private readonly List<Drive> _drives = new();

    private string _cpuName = "", _ramInfo = "", _board = "";
    private int _cores, _threads;

    private NetworkInterface? _nic;
    private long _nicPickedAt, _netTicks, _rx = -1, _tx = -1;
    private string _nicName = "", _nicSpeed = "", _nicIp = "";
    private double? _down, _up;

    private long _spaceCheckedAt = -1;

    public string Name => "Windows";
    public IReadOnlyList<SensorInfo> Catalog => _catalog;
    public bool TakeCatalogChange() => false;

    public void Start()
    {
        ReadWmi();
        PickNetworkInterface();
        InitDrives();
        BuildCatalog();
    }

    public void Update(Dictionary<string, object?> v)
    {
        v["sys.cpu.name"] = _cpuName;
        v["sys.cpu.cores"] = _cores;
        v["sys.cpu.threads"] = _threads > 0 ? _threads : Environment.ProcessorCount;
        v["sys.board"] = _board;
        v["sys.ram.info"] = _ramInfo;
        v["sys.uptime"] = Environment.TickCount64 / 1000.0;
        UpdateMemory(v);
        UpdateNetwork(v);
        UpdateDrives(v);
    }

    // ---------- Statische Infos (WMI) ----------

    private void ReadWmi()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Name, NumberOfCores, NumberOfLogicalProcessors FROM Win32_Processor");
            using var results = searcher.Get();
            foreach (ManagementBaseObject o in results)
            {
                _cpuName = CleanCpuName(o["Name"] as string ?? "");
                _cores += Convert.ToInt32(o["NumberOfCores"] ?? 0, CultureInfo.InvariantCulture);
                _threads += Convert.ToInt32(o["NumberOfLogicalProcessors"] ?? 0, CultureInfo.InvariantCulture);
            }
        }
        catch (Exception ex) { Log.Error("WMI Prozessor", ex); }

        try
        {
            ulong total = 0;
            int speed = 0, type = 0;
            using var searcher = new ManagementObjectSearcher("SELECT Capacity, ConfiguredClockSpeed, Speed, SMBIOSMemoryType FROM Win32_PhysicalMemory");
            using var results = searcher.Get();
            foreach (ManagementBaseObject o in results)
            {
                total += Convert.ToUInt64(o["Capacity"] ?? 0UL, CultureInfo.InvariantCulture);
                int configured = Convert.ToInt32(o["ConfiguredClockSpeed"] ?? 0, CultureInfo.InvariantCulture);
                int rated = Convert.ToInt32(o["Speed"] ?? 0, CultureInfo.InvariantCulture);
                speed = Math.Max(speed, configured > 0 ? configured : rated);
                type = Convert.ToInt32(o["SMBIOSMemoryType"] ?? 0, CultureInfo.InvariantCulture);
            }
            string ddr = type switch { 20 => "DDR", 21 => "DDR2", 24 => "DDR3", 26 => "DDR4", 34 => "DDR5", 35 => "LPDDR5", _ => "" };
            int gb = (int)Math.Round(total / 1073741824.0);
            _ramInfo = gb <= 0 ? "" : ddr.Length > 0 && speed > 0 ? $"{gb} GB · {ddr}-{speed}" : $"{gb} GB";
        }
        catch (Exception ex) { Log.Error("WMI Arbeitsspeicher", ex); }

        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Manufacturer, Product FROM Win32_BaseBoard");
            using var results = searcher.Get();
            foreach (ManagementBaseObject o in results)
            {
                string vendor = ShortVendor((o["Manufacturer"] as string ?? "").Trim());
                string product = (o["Product"] as string ?? "").Trim();
                _board = $"{vendor} {product}".Trim();
            }
        }
        catch (Exception ex) { Log.Error("WMI Mainboard", ex); }
    }

    private static Dictionary<int, string> DiskModels()
    {
        var models = new Dictionary<int, string>();
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Index, Model FROM Win32_DiskDrive");
            using var results = searcher.Get();
            foreach (ManagementBaseObject o in results)
                models[Convert.ToInt32(o["Index"] ?? -1, CultureInfo.InvariantCulture)] = (o["Model"] as string ?? "").Trim();
        }
        catch (Exception ex) { Log.Error("WMI Laufwerke", ex); }
        return models;
    }

    private static string CleanCpuName(string name)
    {
        name = TrademarkRx().Replace(name, "");
        name = GenerationRx().Replace(name, "");
        name = FrequencyRx().Replace(name, "");
        name = CoreCountRx().Replace(name, "");
        name = CpuWordRx().Replace(name, "");
        return SpacesRx().Replace(name, " ").Trim();
    }

    private static string ShortVendor(string vendor)
    {
        string v = vendor.ToUpperInvariant();
        if (v.StartsWith("ASUS", StringComparison.Ordinal)) return "ASUS";
        if (v.StartsWith("MICRO-STAR", StringComparison.Ordinal) || v.StartsWith("MSI", StringComparison.Ordinal)) return "MSI";
        if (v.StartsWith("GIGABYTE", StringComparison.Ordinal)) return "Gigabyte";
        if (v.StartsWith("ASROCK", StringComparison.Ordinal)) return "ASRock";
        return vendor.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? vendor;
    }

    [GeneratedRegex(@"\((R|TM)\)", RegexOptions.IgnoreCase)] private static partial Regex TrademarkRx();
    [GeneratedRegex(@"\b\d+(st|nd|rd|th) Gen\b", RegexOptions.IgnoreCase)] private static partial Regex GenerationRx();
    [GeneratedRegex(@"\s*@.*$")] private static partial Regex FrequencyRx();
    [GeneratedRegex(@"\b\d+-Core\b", RegexOptions.IgnoreCase)] private static partial Regex CoreCountRx();
    [GeneratedRegex(@"\b(CPU|Processor)\b", RegexOptions.IgnoreCase)] private static partial Regex CpuWordRx();
    [GeneratedRegex(@"\s+")] private static partial Regex SpacesRx();

    // ---------- Arbeitsspeicher ----------

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatusEx
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhys, AvailPhys, TotalPageFile, AvailPageFile, TotalVirtual, AvailVirtual, AvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx status);

    private static void UpdateMemory(Dictionary<string, object?> v)
    {
        var m = new MemoryStatusEx { Length = (uint)Marshal.SizeOf<MemoryStatusEx>() };
        if (!GlobalMemoryStatusEx(ref m))
            return;
        const double GiB = 1024d * 1024 * 1024;
        double total = m.TotalPhys / GiB, free = m.AvailPhys / GiB, used = total - free;
        v["sys.ram.total"] = total;
        v["sys.ram.free"] = free;
        v["sys.ram.used"] = used;
        v["sys.ram.pct"] = total > 0 ? used / total * 100 : null;
    }

    // ---------- Netzwerk ----------

    private void PickNetworkInterface()
    {
        _nicPickedAt = Environment.TickCount64;
        try
        {
            var candidates = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up
                         && n.NetworkInterfaceType != NetworkInterfaceType.Loopback
                         && n.NetworkInterfaceType != NetworkInterfaceType.Tunnel)
                .ToList();
            var pick = candidates.Where(HasIpv4Gateway).OrderByDescending(n => n.Speed).FirstOrDefault()
                       ?? candidates.OrderByDescending(n => n.Speed).FirstOrDefault();
            if (pick?.Id != _nic?.Id)
            {
                _nic = pick;
                _rx = _tx = -1;
                _down = _up = null;
            }
            if (_nic != null)
            {
                _nicName = _nic.Name;
                _nicSpeed = FormatLinkSpeed(_nic.Speed);
                _nicIp = _nic.GetIPProperties().UnicastAddresses
                    .FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork)?.Address.ToString() ?? "";
            }
        }
        catch (Exception ex)
        {
            Log.WarnOnce("nic", "Netzwerk: " + ex.Message);
        }
    }

    private static bool HasIpv4Gateway(NetworkInterface n)
    {
        try
        {
            return n.GetIPProperties().GatewayAddresses.Any(g =>
                g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any));
        }
        catch
        {
            return false;
        }
    }

    private static string FormatLinkSpeed(long bitsPerSecond) => bitsPerSecond switch
    {
        >= 1_000_000_000 => (bitsPerSecond / 1e9).ToString("0.#", German) + " Gbit/s",
        >= 1_000_000 => (bitsPerSecond / 1e6).ToString("0", German) + " Mbit/s",
        > 0 => (bitsPerSecond / 1e3).ToString("0", German) + " kbit/s",
        _ => "",
    };

    private void UpdateNetwork(Dictionary<string, object?> v)
    {
        if (_nic == null || Environment.TickCount64 - _nicPickedAt > 30_000)
            PickNetworkInterface();
        if (_nic != null)
        {
            try
            {
                var stats = _nic.GetIPStatistics();
                long rx = stats.BytesReceived, tx = stats.BytesSent, now = Environment.TickCount64;
                if (_rx >= 0 && now > _netTicks)
                {
                    double seconds = (now - _netTicks) / 1000.0;
                    _down = Math.Max(0, (rx - _rx) / seconds);
                    _up = Math.Max(0, (tx - _tx) / seconds);
                }
                _rx = rx;
                _tx = tx;
                _netTicks = now;
            }
            catch
            {
                _nic = null;
                _down = _up = null;
            }
        }
        v["sys.net.down"] = _down;
        v["sys.net.up"] = _up;
        v["sys.net.name"] = _nicName;
        v["sys.net.speed"] = _nicSpeed;
        v["sys.net.ip"] = _nicIp;
    }

    // ---------- Laufwerke ----------

    private sealed class Drive
    {
        public required string Letter { get; init; }
        public string Label = "", Model = "";
        public int Disk = -1;
        public SafeFileHandle? Handle;
        public long PrevRead = -1, PrevWrite = -1, PrevTicks;
        public double? Read, Write;
        public long Total, Free;
    }

    private void InitDrives()
    {
        var models = DiskModels();
        foreach (var info in DriveInfo.GetDrives())
        {
            try
            {
                if (info.DriveType != DriveType.Fixed || !info.IsReady)
                    continue;
                var drive = new Drive { Letter = info.Name.Substring(0, 1).ToUpperInvariant(), Label = info.VolumeLabel };
                drive.Handle = OpenVolume(drive.Letter);
                if (drive.Handle != null)
                    drive.Disk = DiskNumber(drive.Handle);
                if (models.TryGetValue(drive.Disk, out var model))
                    drive.Model = model;
                _drives.Add(drive);
            }
            catch (Exception ex)
            {
                Log.WarnOnce("drive-" + info.Name, $"Laufwerk {info.Name}: {ex.Message}");
            }
        }
    }

    private void UpdateDrives(Dictionary<string, object?> v)
    {
        long now = Environment.TickCount64;
        bool checkSpace = _spaceCheckedAt < 0 || now - _spaceCheckedAt > 5000;
        if (checkSpace)
            _spaceCheckedAt = now;

        foreach (var d in _drives)
        {
            if (checkSpace)
            {
                try
                {
                    var info = new DriveInfo(d.Letter);
                    d.Total = info.TotalSize;
                    d.Free = info.TotalFreeSpace;
                }
                catch
                {
                    d.Total = d.Free = 0;
                }
            }
            if (d.Handle != null && DiskCounters(d.Handle, out long read, out long write))
            {
                if (d.PrevRead >= 0 && now > d.PrevTicks)
                {
                    double seconds = (now - d.PrevTicks) / 1000.0;
                    d.Read = Math.Max(0, (read - d.PrevRead) / seconds);
                    d.Write = Math.Max(0, (write - d.PrevWrite) / seconds);
                }
                d.PrevRead = read;
                d.PrevWrite = write;
                d.PrevTicks = now;
            }

            string p = "sys.drive." + d.Letter + ".";
            bool known = d.Total > 0;
            v[p + "total"] = known ? d.Total : null;
            v[p + "free"] = known ? d.Free : null;
            v[p + "used"] = known ? d.Total - d.Free : null;
            v[p + "pct"] = known ? (d.Total - d.Free) * 100.0 / d.Total : null;
            v[p + "read"] = d.Read;
            v[p + "write"] = d.Write;
            v[p + "label"] = d.Label;
            v[p + "model"] = d.Model;
            v[p + "disk"] = d.Disk;
        }
    }

    private const uint IoctlVolumeGetVolumeDiskExtents = 0x00560000;
    private const uint IoctlDiskPerformance = 0x00070020;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DeviceIoControl(SafeFileHandle device, uint code, IntPtr inBuffer, uint inSize, IntPtr outBuffer, uint outSize, out uint returned, IntPtr overlapped);

    private static SafeFileHandle? OpenVolume(string letter)
    {
        // Zugriff 0 reicht für die Abfragen unten und braucht keine Adminrechte.
        var handle = CreateFileW($@"\\.\{letter}:", 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
        if (!handle.IsInvalid)
            return handle;
        handle.Dispose();
        return null;
    }

    private static int DiskNumber(SafeFileHandle handle)
    {
        IntPtr buffer = Marshal.AllocHGlobal(256);
        try
        {
            if (DeviceIoControl(handle, IoctlVolumeGetVolumeDiskExtents, IntPtr.Zero, 0, buffer, 256, out _, IntPtr.Zero)
                && Marshal.ReadInt32(buffer) > 0)
                return Marshal.ReadInt32(buffer, 8);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
        return -1;
    }

    private static bool DiskCounters(SafeFileHandle handle, out long read, out long write)
    {
        read = write = 0;
        IntPtr buffer = Marshal.AllocHGlobal(256);
        try
        {
            if (!DeviceIoControl(handle, IoctlDiskPerformance, IntPtr.Zero, 0, buffer, 256, out _, IntPtr.Zero))
            {
                Log.WarnOnce("diskperf", "Lese-/Schreibraten nicht verfügbar (IOCTL_DISK_PERFORMANCE, Fehler " + Marshal.GetLastWin32Error() + ").");
                return false;
            }
            read = Marshal.ReadInt64(buffer, 0);
            write = Marshal.ReadInt64(buffer, 8);
            return true;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    // ---------- Katalog ----------

    private void BuildCatalog()
    {
        void Add(string id, string name, string hardware, string hwType, string type, string unit) =>
            _catalog.Add(new SensorInfo(id, name, hardware, "sys/" + hwType.ToLowerInvariant(), hwType, type, unit, "sys"));

        Add("sys.cpu.name", "CPU-Name", "Windows", "System", "Text", "");
        Add("sys.cpu.cores", "CPU-Kerne", "Windows", "System", "Count", "");
        Add("sys.cpu.threads", "CPU-Threads", "Windows", "System", "Count", "");
        Add("sys.board", "Mainboard", "Windows", "System", "Text", "");
        Add("sys.uptime", "Laufzeit seit Start", "Windows", "System", "TimeSpan", "s");
        Add("sys.ram.used", "Arbeitsspeicher belegt", "Windows", "System", "Data", "GB");
        Add("sys.ram.free", "Arbeitsspeicher frei", "Windows", "System", "Data", "GB");
        Add("sys.ram.total", "Arbeitsspeicher gesamt", "Windows", "System", "Data", "GB");
        Add("sys.ram.pct", "Arbeitsspeicher belegt (%)", "Windows", "System", "Load", "%");
        Add("sys.ram.info", "Arbeitsspeicher (Typ)", "Windows", "System", "Text", "");

        string nic = string.IsNullOrEmpty(_nicName) ? "Netzwerk" : "Netzwerk · " + _nicName;
        Add("sys.net.down", "Download", nic, "Network", "Throughput", "B/s");
        Add("sys.net.up", "Upload", nic, "Network", "Throughput", "B/s");
        Add("sys.net.name", "Adapter", nic, "Network", "Text", "");
        Add("sys.net.speed", "Verbindung", nic, "Network", "Text", "");
        Add("sys.net.ip", "IP-Adresse (lokal)", nic, "Network", "Text", "");

        foreach (var d in _drives)
        {
            string hw = $"Laufwerk {d.Letter}:";
            string p = "sys.drive." + d.Letter + ".";
            Add(p + "pct", "Belegt (%)", hw, "Drive", "Load", "%");
            Add(p + "used", "Belegt", hw, "Drive", "Data", "B");
            Add(p + "free", "Frei", hw, "Drive", "Data", "B");
            Add(p + "total", "Größe", hw, "Drive", "Data", "B");
            Add(p + "read", "Lesen", hw, "Drive", "Throughput", "B/s");
            Add(p + "write", "Schreiben", hw, "Drive", "Throughput", "B/s");
            Add(p + "label", "Bezeichnung", hw, "Drive", "Text", "");
            Add(p + "model", "Modell", hw, "Drive", "Text", "");
            Add(p + "disk", "Datenträger-Nr.", hw, "Drive", "Count", "");
        }
    }

    public void Dispose()
    {
        foreach (var d in _drives)
            d.Handle?.Dispose();
    }
}
