using System.Buffers;
using System.Collections.Concurrent;
using System.Globalization;
using System.Net.WebSockets;
using System.Text.Json;

namespace Sensorium.Sensors;

/// <summary>Home Assistant hat den Token abgelehnt.</summary>
public sealed class HaAuthException(string message) : Exception(message);

/// <summary>
/// Verbindung zu Home Assistant über die WebSocket-API (mit langlebigem Zugriffstoken).
/// Abonniert nur die Entitäten, die das Profil verwendet, und liefert sie als Werte:
/// <list type="bullet">
/// <item><c>ha:&lt;entity_id&gt;</c> – Zustand als Zahl oder Text (null, wenn nicht erreichbar)</item>
/// <item><c>ha:&lt;entity_id&gt;#state</c> – Zustand im Original, z. B. „unavailable“</item>
/// <item><c>ha:&lt;entity_id&gt;#changed</c> – letzte Änderung (Unix-Sekunden)</item>
/// <item><c>ha:&lt;entity_id&gt;@&lt;attribut&gt;</c> – ein Attribut, z. B. „@current_temperature“</item>
/// <item><c>ha:&lt;weather&gt;#forecast</c> – Tagesvorhersage als Liste</item>
/// </list>
/// Schalten (light/switch/fan/input_boolean umschalten) geht nur über <see cref="ToggleAsync"/>.
/// </summary>
public sealed class HomeAssistantProvider : ISensorProvider
{
    private static readonly HashSet<string> ToggleDomains = new(StringComparer.Ordinal) { "light", "switch", "fan", "input_boolean" };

    private sealed class Entity
    {
        public string State = "";
        public readonly Dictionary<string, JsonElement> Attributes = new(StringComparer.Ordinal);
        public double LastChanged;
    }

    private readonly object _gate = new();
    private readonly Dictionary<string, Entity> _entities = new(StringComparer.Ordinal);
    private readonly Dictionary<string, List<Dictionary<string, object?>>> _forecasts = new(StringComparer.Ordinal);
    private readonly Dictionary<int, string> _subscriptions = new();
    private readonly ConcurrentDictionary<int, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private HashSet<string> _keys = new(StringComparer.Ordinal);
    private HashSet<string> _entityIds = new(StringComparer.Ordinal);
    private HashSet<string> _allAttributes = new(StringComparer.Ordinal);
    private HashSet<string> _forecastIds = new(StringComparer.Ordinal);
    private List<SensorInfo> _catalog = new();
    private bool _catalogChanged = true;
    private bool _started;
    private string? _url, _token;
    private CancellationTokenSource? _cts;
    private ClientWebSocket? _socket;
    private int _nextId;
    private long _lastPong;

    public string Name => "Home Assistant";

    public IReadOnlyList<SensorInfo> Catalog
    {
        get { lock (_gate) return _catalog; }
    }

    /// <summary>„verbunden“, „nicht eingerichtet“, „Token ungültig“, „keine Verbindung“ …</summary>
    public string StatusText { get; private set; } = "nicht eingerichtet";
    public bool Connected { get; private set; }
    public string? Version { get; private set; }

    public void Start()
    {
        lock (_gate)
            _started = true;
        Restart();
    }

    /// <summary>Neue Adresse oder neuer Token: Verbindung neu aufbauen.</summary>
    public void Configure(string? url, string? token)
    {
        lock (_gate)
        {
            _url = string.IsNullOrWhiteSpace(url) ? null : url.Trim();
            _token = string.IsNullOrWhiteSpace(token) ? null : token.Trim();
        }
        Restart();
    }

    /// <summary>Schlüssel aus dem Profil (ohne „ha:“). Bei Änderungen wird neu abonniert.</summary>
    public void SetReferences(IEnumerable<string> keys)
    {
        var set = new HashSet<string>(keys, StringComparer.Ordinal);
        lock (_gate)
        {
            if (set.SetEquals(_keys))
                return;
            _keys = set;
            _entityIds = set.Select(EntityOf).ToHashSet(StringComparer.Ordinal);
            _allAttributes = set.Where(k => k.EndsWith("@*", StringComparison.Ordinal)).Select(EntityOf).ToHashSet(StringComparer.Ordinal);
            _forecastIds = set.Where(k => k.EndsWith("#forecast", StringComparison.Ordinal)).Select(EntityOf).ToHashSet(StringComparer.Ordinal);
            RebuildCatalog();
        }
        Restart();
    }

    private static string EntityOf(string key)
    {
        int i = key.IndexOfAny(['@', '#']);
        return i < 0 ? key : key[..i];
    }

    // ---------- Verbindung ----------

    private void Restart()
    {
        CancellationTokenSource? old;
        lock (_gate)
        {
            if (!_started)
                return;
            old = _cts;
            _cts = null;
            if (_url == null || _token == null)
            {
                SetStatus(false, "nicht eingerichtet");
            }
            else if (_entityIds.Count == 0)
            {
                SetStatus(false, "nicht benötigt");
            }
            else
            {
                var cts = new CancellationTokenSource();
                _cts = cts;
                string url = _url, token = _token;
                _ = Task.Run(() => RunAsync(url, token, cts.Token));
            }
        }
        old?.Cancel();
    }

    private void SetStatus(bool connected, string text)
    {
        if (Connected == connected && StatusText == text)
            return;
        Connected = connected;
        StatusText = text;
        lock (_gate)
            _catalogChanged = true; // Status steht im Katalog der Sensorliste
    }

    private async Task RunAsync(string url, string token, CancellationToken ct)
    {
        int delay = 2000;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await SessionAsync(url, token, ct).ConfigureAwait(false);
                delay = 2000;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (HaAuthException ex)
            {
                SetStatus(false, "Token ungültig");
                Log.Warn("Home Assistant hat den Token abgelehnt: " + ex.Message);
                return; // erst mit einem neuen Token wieder versuchen
            }
            catch (Exception ex)
            {
                SetStatus(false, "keine Verbindung");
                Log.WarnOnce("ha-" + ex.GetType().Name, "Home Assistant: " + ex.Message);
            }
            try
            {
                await Task.Delay(delay, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            delay = Math.Min(delay * 2, 30_000);
        }
    }

    private async Task SessionAsync(string url, string token, CancellationToken ct)
    {
        var (ws, version) = await OpenAsync(url, token, ct).ConfigureAwait(false);
        using var socket = ws;
        using var session = CancellationTokenSource.CreateLinkedTokenSource(ct);
        Version = version;
        lock (_gate)
        {
            _socket = socket;
            _subscriptions.Clear();
        }
        SetStatus(true, "verbunden");
        Log.Info($"Home Assistant verbunden (Version {version}).");
        try
        {
            var reader = ReadLoopAsync(socket, session.Token);
            await SubscribeAsync(socket, session.Token).ConfigureAwait(false);
            _lastPong = Environment.TickCount64;
            while (!reader.IsCompleted)
            {
                var done = await Task.WhenAny(reader, Task.Delay(30_000, session.Token)).ConfigureAwait(false);
                if (done == reader)
                    break;
                if (Environment.TickCount64 - _lastPong > 75_000)
                    throw new IOException("Home Assistant antwortet nicht mehr.");
                int id = NextId();
                await SendAsync(socket, w => { w.WriteNumber("id", id); w.WriteString("type", "ping"); }, session.Token).ConfigureAwait(false);
            }
            await reader.ConfigureAwait(false);
        }
        finally
        {
            session.Cancel();
            lock (_gate)
            {
                if (ReferenceEquals(_socket, socket))
                    _socket = null;
            }
            foreach (var pending in _pending.Values)
                pending.TrySetCanceled();
            if (!ct.IsCancellationRequested)
                SetStatus(false, "getrennt");
        }
    }

    private async Task SubscribeAsync(ClientWebSocket socket, CancellationToken ct)
    {
        string[] entities, forecasts;
        int entitiesId = NextId();
        lock (_gate)
        {
            entities = _entityIds.ToArray();
            forecasts = _forecastIds.ToArray();
            _subscriptions[entitiesId] = "";
        }
        await SendAsync(socket, w =>
        {
            w.WriteNumber("id", entitiesId);
            w.WriteString("type", "subscribe_entities");
            w.WriteStartArray("entity_ids");
            foreach (string e in entities)
                w.WriteStringValue(e);
            w.WriteEndArray();
        }, ct).ConfigureAwait(false);

        foreach (string weather in forecasts)
        {
            int id = NextId();
            lock (_gate)
                _subscriptions[id] = weather;
            await SendAsync(socket, w =>
            {
                w.WriteNumber("id", id);
                w.WriteString("type", "weather/subscribe_forecast");
                w.WriteString("entity_id", weather);
                w.WriteString("forecast_type", "daily");
            }, ct).ConfigureAwait(false);
        }
    }

    private async Task ReadLoopAsync(ClientWebSocket socket, CancellationToken ct)
    {
        var buffer = new byte[64 * 1024];
        using var message = new MemoryStream();
        while (socket.State == WebSocketState.Open)
        {
            message.SetLength(0);
            WebSocketReceiveResult result;
            do
            {
                result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                    return;
                message.Write(buffer, 0, result.Count);
            }
            while (!result.EndOfMessage);

            try
            {
                using var document = JsonDocument.Parse(message.GetBuffer().AsMemory(0, (int)message.Length));
                var root = document.RootElement;
                if (root.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in root.EnumerateArray())
                        Handle(item);
                }
                else
                {
                    Handle(root);
                }
            }
            catch (Exception ex) when (ex is JsonException or InvalidOperationException or KeyNotFoundException)
            {
                Log.WarnOnce("ha-parse", "Home Assistant: Nachricht nicht lesbar – " + ex.Message);
            }
        }
    }

    private void Handle(JsonElement m)
    {
        string? type = m.TryGetProperty("type", out var t) ? t.GetString() : null;
        int id = m.TryGetProperty("id", out var i) && i.TryGetInt32(out int n) ? n : -1;
        switch (type)
        {
            case "event":
            {
                string? subscription;
                lock (_gate)
                    _subscriptions.TryGetValue(id, out subscription);
                if (subscription == null || !m.TryGetProperty("event", out var ev))
                    return;
                if (subscription.Length == 0)
                    ApplyEntities(ev);
                else
                    ApplyForecast(subscription, ev);
                break;
            }
            case "result":
                if (_pending.TryRemove(id, out var waiting))
                {
                    waiting.TrySetResult(m.Clone());
                }
                else if (m.TryGetProperty("success", out var ok) && ok.ValueKind == JsonValueKind.False)
                {
                    string what;
                    lock (_gate)
                        what = _subscriptions.TryGetValue(id, out var s) ? (s.Length == 0 ? "Entitäten" : "Vorhersage " + s) : "Anfrage";
                    Log.Warn($"Home Assistant lehnt {what} ab: {(m.TryGetProperty("error", out var error) ? error.ToString() : "?")}");
                }
                break;
            case "pong":
                _lastPong = Environment.TickCount64;
                break;
        }
    }

    /// <summary>Kompakte Zustandsmeldungen von subscribe_entities: a = neu, c = geändert, r = entfernt.</summary>
    private void ApplyEntities(JsonElement ev)
    {
        lock (_gate)
        {
            bool added = false;
            if (ev.TryGetProperty("a", out var all) && all.ValueKind == JsonValueKind.Object)
            {
                foreach (var p in all.EnumerateObject())
                {
                    var entity = new Entity();
                    ApplyState(entity, p.Value);
                    _entities[p.Name] = entity;
                    added = true;
                }
            }
            if (ev.TryGetProperty("c", out var changed) && changed.ValueKind == JsonValueKind.Object)
            {
                foreach (var p in changed.EnumerateObject())
                {
                    if (!_entities.TryGetValue(p.Name, out var entity))
                        continue;
                    if (p.Value.TryGetProperty("+", out var plus))
                        ApplyState(entity, plus);
                    if (p.Value.TryGetProperty("-", out var minus) && minus.TryGetProperty("a", out var gone) && gone.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var name in gone.EnumerateArray())
                            if (name.GetString() is { } attribute)
                                entity.Attributes.Remove(attribute);
                    }
                }
            }
            if (ev.TryGetProperty("r", out var removed) && removed.ValueKind == JsonValueKind.Array)
            {
                foreach (var r in removed.EnumerateArray())
                    if (r.GetString() is { } id && _entities.Remove(id))
                        added = true;
            }
            if (added)
                RebuildCatalog();
        }
    }

    private static void ApplyState(Entity entity, JsonElement s)
    {
        if (s.TryGetProperty("s", out var state))
            entity.State = state.ValueKind == JsonValueKind.String ? state.GetString() ?? "" : state.ToString();
        if (s.TryGetProperty("a", out var attributes) && attributes.ValueKind == JsonValueKind.Object)
        {
            foreach (var a in attributes.EnumerateObject())
                entity.Attributes[a.Name] = a.Value.Clone();
        }
        if (s.TryGetProperty("lc", out var lc))
        {
            if (lc.ValueKind == JsonValueKind.Number)
                entity.LastChanged = lc.GetDouble();
            else if (lc.ValueKind == JsonValueKind.String && DateTimeOffset.TryParse(lc.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
                entity.LastChanged = time.ToUnixTimeMilliseconds() / 1000.0;
        }
    }

    private void ApplyForecast(string entityId, JsonElement ev)
    {
        if (!ev.TryGetProperty("forecast", out var forecast) || forecast.ValueKind != JsonValueKind.Array)
            return;
        var list = new List<Dictionary<string, object?>>();
        foreach (var day in forecast.EnumerateArray())
        {
            if (day.ValueKind != JsonValueKind.Object)
                continue;
            var item = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var p in day.EnumerateObject())
                item[p.Name] = Scalar(p.Value);
            list.Add(item);
        }
        lock (_gate)
            _forecasts[entityId] = list;
    }

    // ---------- Werte und Katalog ----------

    public void Update(Dictionary<string, object?> values)
    {
        lock (_gate)
        {
            values["ha.connected"] = Connected ? 1.0 : 0.0;
            values["ha.status"] = StatusText;
            foreach (string id in _entityIds)
            {
                _entities.TryGetValue(id, out var e);
                string key = "ha:" + id;
                values[key] = e == null ? null : ParseState(e.State);
                values[key + "#state"] = e?.State;
                values[key + "#changed"] = e == null || e.LastChanged <= 0 ? null : e.LastChanged;
                if (e != null && _allAttributes.Contains(id))
                {
                    foreach (var (name, value) in e.Attributes)
                        if (Scalar(value) is { } v)
                            values[key + "@" + name] = v;
                }
            }
            foreach (string k in _keys)
            {
                int at = k.IndexOf('@');
                if (at > 0 && !k.EndsWith("@*", StringComparison.Ordinal))
                {
                    object? v = null;
                    if (_entities.TryGetValue(k[..at], out var e) && e.Attributes.TryGetValue(k[(at + 1)..], out var a))
                        v = Scalar(a);
                    values["ha:" + k] = v;
                }
                else if (k.EndsWith("#forecast", StringComparison.Ordinal))
                {
                    values["ha:" + k] = _forecasts.TryGetValue(k[..^9], out var list) ? list : null;
                }
            }
        }
    }

    private static object? ParseState(string? state)
    {
        if (string.IsNullOrEmpty(state) || state is "unavailable" or "unknown")
            return null;
        if (double.TryParse(state, NumberStyles.Float, CultureInfo.InvariantCulture, out double d) && double.IsFinite(d))
            return d;
        return state;
    }

    private static object? Scalar(JsonElement v) => v.ValueKind switch
    {
        JsonValueKind.Number => v.GetDouble(),
        JsonValueKind.String => v.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => null,
    };

    private void RebuildCatalog()
    {
        var list = new List<SensorInfo>();
        foreach (string id in _entityIds.Order(StringComparer.Ordinal))
        {
            _entities.TryGetValue(id, out var e);
            string name = e != null && e.Attributes.TryGetValue("friendly_name", out var fn) && fn.ValueKind == JsonValueKind.String ? fn.GetString() ?? id : id;
            string unit = e != null && e.Attributes.TryGetValue("unit_of_measurement", out var u) && u.ValueKind == JsonValueKind.String ? u.GetString() ?? "" : "";
            list.Add(new SensorInfo("ha:" + id, name, "Home Assistant", "ha", "HomeAssistant", TypeOf(e), unit, "ha"));
        }
        _catalog = list;
        _catalogChanged = true;
    }

    private static string TypeOf(Entity? e)
    {
        string? deviceClass = e != null && e.Attributes.TryGetValue("device_class", out var d) && d.ValueKind == JsonValueKind.String ? d.GetString() : null;
        return deviceClass switch
        {
            "temperature" => "Temperature",
            "power" => "Power",
            "energy" => "Energy",
            "voltage" => "Voltage",
            "current" => "Current",
            "humidity" or "battery" => "Level",
            _ => e != null && ParseState(e.State) is double ? "Value" : "State",
        };
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

    // ---------- Schalten ----------

    /// <summary>Schaltet ein Gerät um. Liefert eine Fehlermeldung oder null.</summary>
    public async Task<string?> ToggleAsync(string entityId)
    {
        int dot = entityId.IndexOf('.');
        if (dot <= 0 || !ToggleDomains.Contains(entityId[..dot]))
            return "Dieses Gerät kann das Panel nicht schalten.";
        try
        {
            await CallAsync(w =>
            {
                w.WriteString("type", "call_service");
                w.WriteString("domain", entityId[..dot]);
                w.WriteString("service", "toggle");
                w.WriteStartObject("target");
                w.WriteString("entity_id", entityId);
                w.WriteEndObject();
            }, 5000).ConfigureAwait(false);
            Log.Info($"Geschaltet: {entityId}");
            return null;
        }
        catch (Exception ex)
        {
            return "Schalten fehlgeschlagen: " + ex.Message;
        }
    }

    /// <summary>Schickt einen Befehl und wartet auf das Ergebnis („result“). Wirft bei Fehlern.</summary>
    private async Task<JsonElement> CallAsync(Action<Utf8JsonWriter> body, int timeoutMs)
    {
        ClientWebSocket? socket;
        lock (_gate)
            socket = _socket;
        if (socket is not { State: WebSocketState.Open })
            throw new InvalidOperationException("Home Assistant ist nicht verbunden.");

        int id = NextId();
        var waiting = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = waiting;
        try
        {
            using var timeout = new CancellationTokenSource(timeoutMs);
            await SendAsync(socket, w =>
            {
                w.WriteNumber("id", id);
                body(w);
            }, timeout.Token).ConfigureAwait(false);
            var finished = await Task.WhenAny(waiting.Task, Task.Delay(timeoutMs)).ConfigureAwait(false);
            if (finished != waiting.Task)
                throw new TimeoutException("Home Assistant hat nicht geantwortet.");
            var answer = await waiting.Task.ConfigureAwait(false);
            if (answer.TryGetProperty("success", out var ok) && ok.ValueKind == JsonValueKind.True)
                return answer.TryGetProperty("result", out var result) ? result : default;
            string message = answer.TryGetProperty("error", out var error) && error.TryGetProperty("message", out var text) ? text.GetString() ?? "" : "";
            throw new InvalidOperationException(message.Length > 0 ? message : "Anfrage abgelehnt.");
        }
        finally
        {
            _pending.TryRemove(id, out _);
        }
    }

    /// <summary>
    /// Alle Entitäten mit Name, Zustand, Einheit, Raum und Etage – für die Auswahl im Editor und im
    /// Einrichtungsassistenten. Nutzt eine eigene, kurze Verbindung (klappt also auch, wenn das Profil
    /// noch nichts aus Home Assistant verwendet). Liefert die fertige Nachricht „haDirectory“.
    /// </summary>
    public static async Task<string> DirectoryJsonAsync(string url, string token)
    {
        var (socket, _) = await OpenAsync(url, token, CancellationToken.None).ConfigureAwait(false);
        JsonElement states;
        JsonElement? registry, devices, areas, floors;
        using (socket)
        {
            int nextId = 0;
            async Task<JsonElement?> Ask(string type, bool required)
            {
                int id = ++nextId;
                using var timeout = new CancellationTokenSource(30_000);
                await SendRawAsync(socket, w => { w.WriteNumber("id", id); w.WriteString("type", type); }, timeout.Token).ConfigureAwait(false);
                while (true)
                {
                    var m = await ReceiveOneAsync(socket, timeout.Token).ConfigureAwait(false);
                    if (TypeOf(m) != "result" || !m.TryGetProperty("id", out var mid) || !mid.TryGetInt32(out int n) || n != id)
                        continue;
                    if (m.TryGetProperty("success", out var ok) && ok.ValueKind == JsonValueKind.True && m.TryGetProperty("result", out var r))
                        return r;
                    string message = m.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var t) ? t.GetString() ?? "" : "";
                    if (required)
                        throw new InvalidOperationException(message.Length > 0 ? message : "Anfrage abgelehnt.");
                    Log.WarnOnce("ha-dir-" + type, $"Home Assistant {type}: {message}");
                    return null;
                }
            }
            states = await Ask("get_states", true).ConfigureAwait(false) ?? default;
            registry = await Ask("config/entity_registry/list_for_display", false).ConfigureAwait(false);
            devices = await Ask("config/device_registry/list", false).ConfigureAwait(false);
            areas = await Ask("config/area_registry/list", false).ConfigureAwait(false);
            floors = await Ask("config/floor_registry/list", false).ConfigureAwait(false);
            try
            {
                using var bye = new CancellationTokenSource(2000);
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", bye.Token).ConfigureAwait(false);
            }
            catch
            {
                // egal
            }
        }

        static string? Str(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        var floorNames = new Dictionary<string, string>(StringComparer.Ordinal);
        if (floors is { ValueKind: JsonValueKind.Array } f)
            foreach (var x in f.EnumerateArray())
                if (Str(x, "floor_id") is { } id)
                    floorNames[id] = Str(x, "name") ?? id;

        var areaInfo = new Dictionary<string, (string Name, string? Floor)>(StringComparer.Ordinal);
        if (areas is { ValueKind: JsonValueKind.Array } a)
            foreach (var x in a.EnumerateArray())
                if (Str(x, "area_id") is { } id)
                    areaInfo[id] = (Str(x, "name") ?? id, Str(x, "floor_id") is { } fl && floorNames.TryGetValue(fl, out var fn) ? fn : null);

        var deviceArea = new Dictionary<string, string>(StringComparer.Ordinal);
        if (devices is { ValueKind: JsonValueKind.Array } d)
            foreach (var x in d.EnumerateArray())
                if (Str(x, "id") is { } id && Str(x, "area_id") is { } area)
                    deviceArea[id] = area;

        var entityArea = new Dictionary<string, string>(StringComparer.Ordinal);
        if (registry is { ValueKind: JsonValueKind.Object } r && r.TryGetProperty("entities", out var list) && list.ValueKind == JsonValueKind.Array)
        {
            foreach (var x in list.EnumerateArray())
            {
                if (Str(x, "ei") is not { } id)
                    continue;
                string? area = Str(x, "ai") ?? (Str(x, "di") is { } dev && deviceArea.TryGetValue(dev, out var da) ? da : null);
                if (area != null)
                    entityArea[id] = area;
            }
        }

        var buffer = new ArrayBufferWriter<byte>(512 * 1024);
        using (var w = new Utf8JsonWriter(buffer, new JsonWriterOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
        {
            w.WriteStartObject();
            w.WriteString("type", "haDirectory");
            w.WriteStartArray("floors");
            foreach (string name in floorNames.Values.Order(StringComparer.CurrentCulture))
                w.WriteStringValue(name);
            w.WriteEndArray();
            w.WriteStartArray("entities");
            if (states.ValueKind == JsonValueKind.Array)
            {
                foreach (var s in states.EnumerateArray())
                {
                    if (Str(s, "entity_id") is not { } id)
                        continue;
                    var attributes = s.TryGetProperty("attributes", out var at) && at.ValueKind == JsonValueKind.Object ? at : default;
                    w.WriteStartObject();
                    w.WriteString("id", id);
                    w.WriteString("name", Str(attributes, "friendly_name") ?? id);
                    w.WriteString("state", Str(s, "state") ?? "");
                    if (Str(attributes, "unit_of_measurement") is { } unit)
                        w.WriteString("unit", unit);
                    if (Str(attributes, "device_class") is { } deviceClass)
                        w.WriteString("dc", deviceClass);
                    if (entityArea.TryGetValue(id, out var areaId) && areaInfo.TryGetValue(areaId, out var info))
                    {
                        w.WriteString("area", info.Name);
                        if (info.Floor != null)
                            w.WriteString("floor", info.Floor);
                    }
                    w.WriteStartArray("attrs");
                    if (attributes.ValueKind == JsonValueKind.Object)
                        foreach (var p in attributes.EnumerateObject())
                            if (p.Value.ValueKind is JsonValueKind.Number or JsonValueKind.String or JsonValueKind.True or JsonValueKind.False && p.Name != "friendly_name")
                                w.WriteStringValue(p.Name);
                    w.WriteEndArray();
                    w.WriteEndObject();
                }
            }
            w.WriteEndArray();
            w.WriteEndObject();
        }
        return System.Text.Encoding.UTF8.GetString(buffer.WrittenSpan);
    }

    // ---------- Senden, Empfangen, Anmelden ----------

    private int NextId() => Interlocked.Increment(ref _nextId);

    private async Task SendAsync(ClientWebSocket socket, Action<Utf8JsonWriter> body, CancellationToken ct)
    {
        await _sendLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await SendRawAsync(socket, body, ct).ConfigureAwait(false);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private static async Task SendRawAsync(ClientWebSocket socket, Action<Utf8JsonWriter> body, CancellationToken ct)
    {
        var buffer = new ArrayBufferWriter<byte>(512);
        using (var w = new Utf8JsonWriter(buffer))
        {
            w.WriteStartObject();
            body(w);
            w.WriteEndObject();
        }
        await socket.SendAsync(buffer.WrittenMemory, WebSocketMessageType.Text, true, ct).ConfigureAwait(false);
    }

    private static async Task<JsonElement> ReceiveOneAsync(ClientWebSocket socket, CancellationToken ct)
    {
        var buffer = new byte[16 * 1024];
        using var message = new MemoryStream();
        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
                throw new IOException("Home Assistant hat die Verbindung geschlossen.");
            message.Write(buffer, 0, result.Count);
        }
        while (!result.EndOfMessage);
        using var document = JsonDocument.Parse(message.GetBuffer().AsMemory(0, (int)message.Length));
        return document.RootElement.Clone();
    }

    private static string? TypeOf(JsonElement message) =>
        message.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;

    /// <summary>Verbindet und meldet sich an. Liefert die offene Verbindung und die Version von Home Assistant.</summary>
    private static async Task<(ClientWebSocket Socket, string Version)> OpenAsync(string url, string token, CancellationToken ct)
    {
        var socket = new ClientWebSocket();
        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(10_000);
            await socket.ConnectAsync(SocketUri(url), timeout.Token).ConfigureAwait(false);
            if (TypeOf(await ReceiveOneAsync(socket, timeout.Token).ConfigureAwait(false)) != "auth_required")
                throw new IOException("Unerwartete Antwort – ist das wirklich Home Assistant?");
            await SendRawAsync(socket, w =>
            {
                w.WriteString("type", "auth");
                w.WriteString("access_token", token);
            }, timeout.Token).ConfigureAwait(false);
            var auth = await ReceiveOneAsync(socket, timeout.Token).ConfigureAwait(false);
            switch (TypeOf(auth))
            {
                case "auth_ok":
                    return (socket, auth.TryGetProperty("ha_version", out var v) ? v.GetString() ?? "" : "");
                case "auth_invalid":
                    throw new HaAuthException(auth.TryGetProperty("message", out var m) ? m.GetString() ?? "" : "");
                default:
                    throw new IOException("Unerwartete Antwort bei der Anmeldung.");
            }
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            socket.Dispose();
            throw new TimeoutException("Zeitüberschreitung – Home Assistant ist unter dieser Adresse nicht erreichbar.");
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }

    /// <summary>Prüft Adresse und Token (für den Einstellungsdialog). Liefert die Version von Home Assistant.</summary>
    public static async Task<string> TestAsync(string url, string token, CancellationToken ct)
    {
        var (socket, version) = await OpenAsync(url, token, ct).ConfigureAwait(false);
        using (socket)
        {
            try
            {
                using var timeout = new CancellationTokenSource(2000);
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", timeout.Token).ConfigureAwait(false);
            }
            catch
            {
                // egal
            }
        }
        return version;
    }

    /// <summary>„http://homeassistant.local:8123“ → „ws://homeassistant.local:8123/api/websocket“.</summary>
    internal static Uri SocketUri(string url)
    {
        string text = url.Trim();
        if (!text.Contains("://", StringComparison.Ordinal))
            text = "http://" + text;
        var builder = new UriBuilder(text);
        builder.Scheme = builder.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase) || builder.Scheme.Equals("wss", StringComparison.OrdinalIgnoreCase) ? "wss" : "ws";
        builder.Path = "/api/websocket";
        builder.Query = "";
        builder.Fragment = "";
        return builder.Uri;
    }

    public void Dispose()
    {
        CancellationTokenSource? cts;
        lock (_gate)
        {
            _started = false;
            cts = _cts;
            _cts = null;
        }
        cts?.Cancel();
    }
}
