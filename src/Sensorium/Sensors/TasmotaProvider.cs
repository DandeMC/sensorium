using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sensorium.Sensors;

/// <summary>
/// Fragt Tasmota-Steckdosen direkt über ihre Weboberfläche ab – jede Sekunde, nur lesend (Befehl „Status 8“).
/// Home Assistant bekommt die Werte einer Steckdose oft nur alle 30 Sekunden; für die Leistungsanzeige
/// des PCs ist das zu träge. Abgefragt werden nur Adressen, die das Profil verwendet.
/// Sensoren: tasmota:&lt;adresse&gt;/power, /today, /yesterday, /total, /voltage, /current, /factor.
/// </summary>
public sealed partial class TasmotaProvider : ISensorProvider
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(2) };

    private static readonly (string Key, string Name, string Type, string Unit)[] Fields =
    [
        ("Power", "Leistung", "Power", "W"),
        ("Today", "Heute", "Energy", "kWh"),
        ("Yesterday", "Gestern", "Energy", "kWh"),
        ("Total", "Gesamt", "Energy", "kWh"),
        ("Voltage", "Spannung", "Voltage", "V"),
        ("Current", "Strom", "Current", "A"),
        ("Factor", "Leistungsfaktor", "Factor", ""),
    ];

    private sealed class Plug(string host)
    {
        public string Host { get; } = host;
        public double?[] Values { get; } = new double?[Fields.Length];
        public long Updated { get; set; }
        public CancellationTokenSource Cts { get; } = new();
    }

    private readonly object _gate = new();
    private readonly Dictionary<string, Plug> _plugs = new(StringComparer.OrdinalIgnoreCase);
    private List<SensorInfo> _catalog = new();
    private bool _catalogChanged;
    private bool _started;

    [GeneratedRegex(@"^[A-Za-z0-9][A-Za-z0-9.\-]*$")]
    private static partial Regex HostRx();

    public string Name => "Tasmota";

    public IReadOnlyList<SensorInfo> Catalog
    {
        get { lock (_gate) return _catalog; }
    }

    public void Start()
    {
        lock (_gate)
        {
            _started = true;
            foreach (var plug in _plugs.Values)
                Launch(plug);
        }
    }

    /// <summary>Adressen aus dem Profil. Neue werden abgefragt, nicht mehr benutzte nicht mehr.</summary>
    public void SetHosts(IEnumerable<string> hosts)
    {
        var wanted = hosts.Where(h => HostRx().IsMatch(h)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        lock (_gate)
        {
            bool changed = false;
            foreach (string host in _plugs.Keys.Where(h => !wanted.Contains(h)).ToList())
            {
                _plugs[host].Cts.Cancel();
                _plugs.Remove(host);
                changed = true;
            }
            foreach (string host in wanted.Where(h => !_plugs.ContainsKey(h)))
            {
                var plug = new Plug(host);
                _plugs[host] = plug;
                if (_started)
                    Launch(plug);
                changed = true;
            }
            if (!changed)
                return;
            _catalog = _plugs.Values
                .SelectMany(p => Fields.Select(f => new SensorInfo(
                    Id(p.Host, f.Key), f.Name, "Tasmota " + p.Host, "tasmota/" + p.Host, "Plug", f.Type, f.Unit, "tasmota")))
                .ToList();
            _catalogChanged = true;
        }
    }

    private static string Id(string host, string key) => $"tasmota:{host}/{key.ToLowerInvariant()}";

    private void Launch(Plug plug) => _ = Task.Run(() => PollAsync(plug, plug.Cts.Token));

    private async Task PollAsync(Plug plug, CancellationToken ct)
    {
        string url = $"http://{plug.Host}/cm?cmnd=Status%208";
        Log.Info($"Steckdose {plug.Host} wird direkt abgefragt.");
        while (!ct.IsCancellationRequested)
        {
            long started = Environment.TickCount64;
            try
            {
                using var response = await Http.GetAsync(url, ct).ConfigureAwait(false);
                response.EnsureSuccessStatusCode();
                await using var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
                using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct).ConfigureAwait(false);
                var root = document.RootElement;
                if (root.TryGetProperty("StatusSNS", out var sns) && sns.TryGetProperty("ENERGY", out var energy))
                {
                    lock (_gate)
                    {
                        for (int i = 0; i < Fields.Length; i++)
                            plug.Values[i] = energy.TryGetProperty(Fields[i].Key, out var v) ? Number(v) : null;
                        plug.Updated = Environment.TickCount64;
                    }
                }
                else if (root.TryGetProperty("WARNING", out _))
                {
                    Log.WarnOnce("tasmota-pw-" + plug.Host, $"Steckdose {plug.Host} verlangt ein Passwort. Die Werte kommen dann nur über Home Assistant.");
                }
                else
                {
                    Log.WarnOnce("tasmota-energy-" + plug.Host, $"Steckdose {plug.Host} liefert keine Messwerte.");
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                Log.WarnOnce("tasmota-" + plug.Host, $"Steckdose {plug.Host} nicht erreichbar: {ex.Message}");
            }

            int wait = 1000 - (int)(Environment.TickCount64 - started);
            try
            {
                await Task.Delay(Math.Max(wait, 250), ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private static double? Number(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.Number => v.GetDouble(),
        JsonValueKind.Array => v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Number).Select(x => (double?)x.GetDouble()).FirstOrDefault(),
        _ => null,
    };

    public void Update(Dictionary<string, object?> values)
    {
        long now = Environment.TickCount64;
        lock (_gate)
        {
            foreach (var plug in _plugs.Values)
            {
                bool fresh = plug.Updated > 0 && now - plug.Updated < 5000;
                for (int i = 0; i < Fields.Length; i++)
                    values[Id(plug.Host, Fields[i].Key)] = fresh ? plug.Values[i] : null;
            }
        }
    }

    public bool TakeCatalogChange()
    {
        lock (_gate)
        {
            bool changed = _catalogChanged;
            _catalogChanged = false;
            return changed;
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            foreach (var plug in _plugs.Values)
                plug.Cts.Cancel();
            _plugs.Clear();
        }
    }
}
