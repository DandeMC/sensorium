using System.Text;
using HidSharp;

namespace Sensorium.Sensors;

/// <summary>
/// Corsair-AIO-Kühler der Serien Hydro Platinum, Pro XT und iCUE Elite RGB direkt per USB:
/// Kühlmitteltemperatur, Pumpe und Radiatorlüfter. Sensorium liest nur den Status und schreibt
/// nie eine Einstellung. Läuft parallel zu iCUE, so wie AIDA64.
/// Das Protokoll ist der Dokumentation von liquidctl (Treiber „hydro_platinum“) entnommen.
/// </summary>
public sealed class CorsairPlatinumProvider : ISensorProvider
{
    private const int VendorId = 0x1b1c;
    private const int ReportLength = 64;

    private static readonly Dictionary<int, (string Name, int Fans)> Models = new()
    {
        [0x0c18] = ("Corsair H100i Platinum", 2),
        [0x0c19] = ("Corsair H100i Platinum SE", 2),
        [0x0c17] = ("Corsair H115i Platinum", 2),
        [0x0c29] = ("Corsair H60i Pro XT", 2),
        [0x0c20] = ("Corsair H100i Pro XT", 2),
        [0x0c21] = ("Corsair H115i Pro XT", 2),
        [0x0c22] = ("Corsair H150i Pro XT", 3),
        [0x0c35] = ("Corsair iCUE H100i Elite RGB", 2),
        [0x0c36] = ("Corsair iCUE H115i Elite RGB", 2),
        [0x0c37] = ("Corsair iCUE H150i Elite RGB", 3),
        [0x0c40] = ("Corsair iCUE H100i Elite RGB (weiß)", 2),
        [0x0c41] = ("Corsair iCUE H150i Elite RGB (weiß)", 3),
    };

    private readonly List<Cooler> _coolers = new();
    private readonly List<SensorInfo> _catalog = new();

    public string Name => "Corsair";
    public IReadOnlyList<SensorInfo> Catalog => _catalog;
    public bool TakeCatalogChange() => false;

    public void Start()
    {
        foreach (var cooler in FindCoolers())
        {
            _coolers.Add(cooler);
            AddToCatalog(cooler);
            Log.Info($"Corsair-Kühler gefunden: {cooler.Name}.");
        }
    }

    public void Update(Dictionary<string, object?> values)
    {
        foreach (var c in _coolers)
        {
            c.Poll();
            string p = c.Prefix;
            values[p + "#name"] = c.Name;
            values[p + "/liquid"] = c.Liquid;
            values[p + "/pump"] = c.PumpRpm;
            values[p + "/pump.duty"] = c.PumpDuty;
            for (int i = 0; i < c.Fans; i++)
            {
                values[$"{p}/fan{i + 1}"] = c.FanRpm[i];
                values[$"{p}/fan{i + 1}.duty"] = c.FanDuty[i];
            }
        }
    }

    public void Dispose()
    {
        foreach (var c in _coolers)
            c.Close();
    }

    private void AddToCatalog(Cooler c)
    {
        string hwId = c.Prefix.Replace("corsair:", "corsair/", StringComparison.Ordinal);
        void Add(string suffix, string name, string type, string unit) =>
            _catalog.Add(new SensorInfo(c.Prefix + suffix, name, c.Name, hwId, "Cooler", type, unit, "corsair"));

        Add("#name", "Name", "Text", "");
        Add("/liquid", "Kühlmittel", "Temperature", "°C");
        Add("/pump", "Pumpe", "Fan", "RPM");
        for (int i = 1; i <= c.Fans; i++)
            Add($"/fan{i}", $"Lüfter {i}", "Fan", "RPM");
        Add("/pump.duty", "Pumpe (Leistung)", "Control", "%");
        for (int i = 1; i <= c.Fans; i++)
            Add($"/fan{i}.duty", $"Lüfter {i} (Leistung)", "Control", "%");
    }

    private static List<Cooler> FindCoolers()
    {
        var result = new List<Cooler>();
        try
        {
            var counts = new Dictionary<int, int>();
            foreach (var device in DeviceList.Local.GetHidDevices(VendorId))
            {
                if (!Models.TryGetValue(device.ProductID, out var model))
                    continue;
                int input, output;
                try
                {
                    input = device.GetMaxInputReportLength();
                    output = device.GetMaxOutputReportLength();
                }
                catch
                {
                    continue;
                }
                if (input < ReportLength + 1 || output < ReportLength + 1)
                    continue; // andere Schnittstelle desselben Geräts
                int n = counts.TryGetValue(device.ProductID, out int seen) ? seen + 1 : 1;
                counts[device.ProductID] = n;
                string prefix = "corsair:" + device.ProductID.ToString("x4") + (n > 1 ? "-" + n : "");
                result.Add(new Cooler(device, model.Name, model.Fans, prefix));
            }
        }
        catch (Exception ex)
        {
            Log.Error("Corsair-Geräte suchen", ex);
        }
        return result;
    }

    /// <summary>Diagnose: fragt jeden gefundenen Kühler mehrmals ab und schreibt die Rohdaten in eine Datei.</summary>
    public static int Dump(string file)
    {
        var text = new StringBuilder();
        try
        {
            foreach (var d in DeviceList.Local.GetHidDevices(VendorId))
            {
                string lengths;
                try { lengths = $"in={d.GetMaxInputReportLength()} out={d.GetMaxOutputReportLength()}"; }
                catch (Exception ex) { lengths = "Längen unbekannt: " + ex.Message; }
                text.AppendLine($"HID {d.VendorID:x4}:{d.ProductID:x4} {lengths} {d.DevicePath}");
            }
            var coolers = FindCoolers();
            text.AppendLine($"Passende Kühler: {coolers.Count}");
            foreach (var c in coolers)
            {
                text.AppendLine($"--- {c.Name} ({c.Prefix})");
                c.Trace = text;
                for (int i = 0; i < 8; i++)
                {
                    c.Poll();
                    text.AppendLine($"Ergebnis {i + 1}: Kühlmittel={c.Liquid:0.00} °C, Pumpe={c.PumpRpm} RPM ({c.PumpDuty} %), " +
                                    string.Join(", ", Enumerable.Range(0, c.Fans).Select(f => $"Lüfter {f + 1}={c.FanRpm[f]} RPM ({c.FanDuty[f]} %)")));
                    Thread.Sleep(1000);
                }
                c.Close();
            }
        }
        catch (Exception ex)
        {
            text.AppendLine("Fehler: " + ex);
        }
        File.WriteAllText(file, text.ToString());
        return 0;
    }

    /// <summary>CRC-8 (Polynom 0x07, Startwert 0) wie beim SMBus-PEC.</summary>
    private static byte Crc8(byte[] data, int offset, int count)
    {
        byte crc = 0;
        for (int i = offset; i < offset + count; i++)
        {
            crc ^= data[i];
            for (int bit = 0; bit < 8; bit++)
                crc = (byte)((crc & 0x80) != 0 ? (crc << 1) ^ 0x07 : crc << 1);
        }
        return crc;
    }

    private sealed class Cooler(HidDevice device, string name, int fans, string prefix)
    {
        // Positionen im Eingangsbericht. Byte 0 ist die Report-ID, deshalb +1 gegenüber liquidctl.
        private static readonly int[] FanDutyAt = { 15, 22, 43 };
        private static readonly int[] FanSpeedAt = { 16, 23, 44 };
        private const int PumpDutyAt = 29, PumpSpeedAt = 30, LiquidFractionAt = 8, LiquidIntegerAt = 9;

        private readonly byte[] _out = new byte[ReportLength + 1];
        private readonly byte[] _in = new byte[ReportLength + 1];
        private HidStream? _stream;
        private int _sequence;
        private int _misses;
        private long _retryAt;

        public string Name { get; } = name;
        public int Fans { get; } = fans;
        public string Prefix { get; } = prefix;
        public double? Liquid { get; private set; }
        public double? PumpRpm { get; private set; }
        public double? PumpDuty { get; private set; }
        public double?[] FanRpm { get; } = new double?[fans];
        public double?[] FanDuty { get; } = new double?[fans];
        public StringBuilder? Trace { get; set; }

        public void Poll()
        {
            if (_stream == null && !TryOpen())
            {
                ClearValues();
                return;
            }
            try
            {
                if (Exchange())
                {
                    Parse();
                    _misses = 0;
                }
                else if (++_misses >= 5)
                {
                    ClearValues(); // mehrere Sekunden keine Antwort: lieber „–“ als alte Werte
                }
            }
            catch (Exception ex)
            {
                Log.WarnOnce("corsair-io-" + Prefix, $"{Name}: {ex.Message}");
                Trace?.AppendLine("Ausnahme: " + ex.Message);
                Close();
                ClearValues();
            }
        }

        private bool TryOpen()
        {
            long now = Environment.TickCount64;
            if (now < _retryAt)
                return false;
            _retryAt = now + 10_000;
            try
            {
                if (device.TryOpen(out HidStream stream))
                {
                    stream.WriteTimeout = 500;
                    _stream = stream;
                    return true;
                }
                Log.WarnOnce("corsair-open-" + Prefix, $"{Name}: USB-Gerät lässt sich nicht öffnen.");
                Trace?.AppendLine("Öffnen fehlgeschlagen.");
            }
            catch (Exception ex)
            {
                Log.WarnOnce("corsair-open-" + Prefix, $"{Name}: {ex.Message}");
                Trace?.AppendLine("Öffnen fehlgeschlagen: " + ex.Message);
            }
            return false;
        }

        /// <summary>Schickt „Status lesen“ und wartet auf eine gültige Antwort.</summary>
        private bool Exchange()
        {
            var stream = _stream!;

            // Liegengebliebene Antworten verwerfen (auch solche, die iCUE angefordert hat).
            stream.ReadTimeout = 1;
            for (int i = 0; i < 32; i++)
            {
                try { stream.Read(_in); }
                catch (TimeoutException) { break; }
            }

            _sequence = _sequence % 31 + 1;
            Array.Clear(_out);
            _out[1] = 0x3F;                      // Kennung für Befehle an den Kühler
            _out[2] = (byte)(_sequence << 3);    // Sequenznummer, Funktionsbereich „Kühlung“
            _out[3] = 0xFF;                      // Befehl „Status lesen“
            _out[ReportLength] = Crc8(_out, 2, ReportLength - 2);
            stream.Write(_out);

            long deadline = Environment.TickCount64 + 400;
            while (true)
            {
                long left = deadline - Environment.TickCount64;
                if (left <= 0)
                {
                    Trace?.AppendLine($"seq={_sequence}: keine gültige Antwort");
                    return false;
                }
                stream.ReadTimeout = (int)Math.Max(1, left);
                int count;
                try { count = stream.Read(_in); }
                catch (TimeoutException) { continue; }

                bool crcOk = count >= ReportLength + 1 && Crc8(_in, 2, ReportLength - 1) == 0;
                bool plausible = crcOk && Plausible();
                Trace?.AppendLine($"seq={_sequence} n={count} crc={(crcOk ? "ok" : "falsch")} plausibel={plausible} " +
                                  Convert.ToHexString(_in, 0, Math.Min(count, 48)));
                if (plausible)
                    return true;
            }
        }

        private int U16(int at) => _in[at] | (_in[at + 1] << 8);

        private bool Plausible()
        {
            double liquid = _in[LiquidIntegerAt] + _in[LiquidFractionAt] / 255.0;
            if (liquid < 5 || liquid > 90)
                return false;
            if (U16(PumpSpeedAt) > 6000)
                return false;
            for (int i = 0; i < Fans; i++)
                if (U16(FanSpeedAt[i]) > 6000)
                    return false;
            return true;
        }

        private void Parse()
        {
            Liquid = Math.Round(_in[LiquidIntegerAt] + _in[LiquidFractionAt] / 255.0, 2);
            PumpRpm = U16(PumpSpeedAt);
            PumpDuty = Math.Round(_in[PumpDutyAt] / 255.0 * 100);
            for (int i = 0; i < Fans; i++)
            {
                FanRpm[i] = U16(FanSpeedAt[i]);
                FanDuty[i] = Math.Round(_in[FanDutyAt[i]] / 255.0 * 100);
            }
        }

        private void ClearValues()
        {
            Liquid = PumpRpm = PumpDuty = null;
            Array.Clear(FanRpm);
            Array.Clear(FanDuty);
        }

        public void Close()
        {
            try { _stream?.Dispose(); } catch { }
            _stream = null;
        }
    }
}
