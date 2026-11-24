using System.Text.Encodings.Web;
using System.Text.Json;

namespace Sensorium.Sensors;

/// <summary>Eine Zuordnung wie „cpu.temp“ → Sensor-ID oder Formel.</summary>
public sealed class AliasEntry
{
    public string Name { get; init; } = "";
    public string Label { get; set; } = "";
    public string Group { get; set; } = "Sonstiges";
    public string? Expr { get; set; }
    /// <summary>true = automatisch erkannt, false = von Hand festgelegt.</summary>
    public bool Auto { get; set; } = true;
    public string? Error { get; set; }
    internal Formula? Compiled { get; set; }
}

/// <summary>
/// Verwaltet die Zuordnungen. Automatisch erkannte werden bei jedem Start neu ermittelt,
/// von Hand gesetzte bleiben in aliases.json erhalten. Profile nutzen nur diese Namen,
/// dadurch funktionieren sie auch auf anderer Hardware.
/// </summary>
public sealed class AliasStore
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly object _gate = new();
    private readonly Dictionary<string, AliasEntry> _map = new(StringComparer.Ordinal);
    private IReadOnlyList<SensorInfo> _catalog = Array.Empty<SensorInfo>();
    private IReadOnlyDictionary<string, object?> _lastValues = new Dictionary<string, object?>();
    private Dictionary<string, ProfileFormula> _profile = new(StringComparer.Ordinal);

    /// <summary>Eine Zuordnung wurde von Hand geändert oder zurückgesetzt.</summary>
    public event Action? Changed;

    /// <summary>
    /// Formeln aus dem Profil (Abschnitt „formulas“). Sie gelten wie automatisch erkannte Zuordnungen
    /// (Gruppe „Profil“), gehen diesen aber vor; von Hand gesetzte Zuordnungen gehen beiden vor.
    /// Wirksam beim nächsten <see cref="Initialize"/>.
    /// </summary>
    public void SetProfileFormulas(IReadOnlyDictionary<string, ProfileFormula> formulas)
    {
        lock (_gate)
            _profile = new Dictionary<string, ProfileFormula>(formulas, StringComparer.Ordinal);
    }

    public void Initialize(IReadOnlyList<SensorInfo> catalog, IReadOnlyDictionary<string, object?> values, bool reloadFile)
    {
        lock (_gate)
        {
            _catalog = catalog;
            _lastValues = values;

            Dictionary<string, StoredAlias> manual = reloadFile
                ? LoadFile().Where(kv => !kv.Value.Auto).ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.Ordinal)
                : _map.Values.Where(e => !e.Auto).ToDictionary(
                    e => e.Name,
                    e => new StoredAlias { Expr = e.Expr, Auto = false, Label = e.Label, Group = e.Group },
                    StringComparer.Ordinal);

            _map.Clear();
            foreach (var detected in AliasRules.Detect(catalog, values))
            {
                var entry = new AliasEntry { Name = detected.Name, Label = detected.Label, Group = detected.Group, Expr = detected.Expr, Auto = true };
                if (manual.Remove(detected.Name, out var stored))
                {
                    entry.Expr = stored.Expr;
                    entry.Auto = false;
                }
                _map[detected.Name] = entry;
            }
            foreach (var (name, formula) in _profile)
            {
                if (_map.TryGetValue(name, out var existing) && !existing.Auto)
                    continue; // von Hand festgelegt
                var entry = new AliasEntry { Name = name, Label = formula.Label, Group = "Profil", Expr = formula.Expr, Auto = true };
                if (manual.Remove(name, out var stored))
                {
                    entry.Expr = stored.Expr;
                    entry.Auto = false;
                }
                _map[name] = entry;
            }
            foreach (var (name, stored) in manual) // eigene Formeln ohne Erkennungsregel
            {
                _map[name] = new AliasEntry { Name = name, Label = stored.Label ?? name, Group = stored.Group ?? "Eigene", Expr = stored.Expr, Auto = false };
            }
            foreach (var entry in _map.Values)
                Compile(entry);
            Save();
        }
    }

    /// <summary>Rechnet alle Zuordnungen aus und schreibt sie unter ihrem Namen in <paramref name="values"/>.</summary>
    public void Evaluate(Dictionary<string, object?> values)
    {
        lock (_gate)
        {
            _lastValues = values;
            var memo = new Dictionary<string, object?>(StringComparer.Ordinal);
            var visiting = new HashSet<string>(StringComparer.Ordinal);

            object? Resolve(string name, bool raw)
            {
                if (raw)
                    return values.GetValueOrDefault(name);
                if (!_map.TryGetValue(name, out var entry))
                    return values.GetValueOrDefault(name);
                if (memo.TryGetValue(name, out var cached))
                    return cached;
                if (!visiting.Add(name))
                    return null; // Zirkelbezug
                object? result = null;
                try { result = entry.Compiled?.Eval(Resolve); }
                catch (Exception ex) { Log.WarnOnce("alias-" + name, $"Zuordnung {name}: {ex.Message}"); }
                visiting.Remove(name);
                memo[name] = result;
                return result;
            }

            foreach (string name in _map.Keys)
                values[name] = Resolve(name, false);
        }
    }

    public IReadOnlyList<AliasEntry> Snapshot()
    {
        lock (_gate)
        {
            return _map.Values.Select(e => new AliasEntry
            {
                Name = e.Name, Label = e.Label, Group = e.Group, Expr = e.Expr, Auto = e.Auto, Error = e.Error,
            }).ToList();
        }
    }

    /// <summary>Legt eine Zuordnung von Hand fest. Liefert eine Fehlermeldung, wenn die Formel ungültig ist.</summary>
    public string? SetManual(string name, string expr)
    {
        string? error;
        lock (_gate)
        {
            if (!_map.TryGetValue(name, out var entry))
            {
                entry = new AliasEntry { Name = name, Label = name, Group = "Eigene" };
                _map[name] = entry;
            }
            entry.Expr = expr;
            entry.Auto = false;
            Compile(entry);
            error = entry.Error;
            Save();
        }
        Changed?.Invoke();
        return error;
    }

    /// <summary>Setzt eine Zuordnung auf die automatische Erkennung zurück.</summary>
    public void ResetAuto(string name)
    {
        lock (_gate)
        {
            if (!_map.TryGetValue(name, out var entry))
                return;
            string? expr = _profile.TryGetValue(name, out var formula)
                ? formula.Expr
                : AliasRules.Detect(_catalog, _lastValues).FirstOrDefault(d => d.Name == name)?.Expr;
            if (expr == null)
            {
                _map.Remove(name); // eigene Formel ohne Regel: entfernen
            }
            else
            {
                entry.Expr = expr;
                entry.Auto = true;
                Compile(entry);
            }
            Save();
        }
        Changed?.Invoke();
    }

    private static void Compile(AliasEntry entry)
    {
        entry.Error = null;
        entry.Compiled = null;
        if (string.IsNullOrWhiteSpace(entry.Expr))
            return;
        try
        {
            entry.Compiled = Formula.Parse(entry.Expr);
        }
        catch (FormatException ex)
        {
            entry.Error = ex.Message;
        }
    }

    private static Dictionary<string, StoredAlias> LoadFile()
    {
        try
        {
            if (File.Exists(AppPaths.AliasFile))
                return JsonSerializer.Deserialize<AliasFile>(File.ReadAllText(AppPaths.AliasFile), Json)?.Aliases
                       ?? new Dictionary<string, StoredAlias>();
        }
        catch (Exception ex)
        {
            Log.Error("Zuordnungen laden", ex);
        }
        return new Dictionary<string, StoredAlias>();
    }

    private void Save()
    {
        try
        {
            var file = new AliasFile
            {
                Aliases = _map.Values.ToDictionary(
                    e => e.Name,
                    e => new StoredAlias { Expr = e.Expr, Auto = e.Auto, Label = e.Label, Group = e.Group },
                    StringComparer.Ordinal),
            };
            File.WriteAllText(AppPaths.AliasFile, JsonSerializer.Serialize(file, Json));
        }
        catch (Exception ex)
        {
            Log.Error("Zuordnungen speichern", ex);
        }
    }

    internal sealed class AliasFile
    {
        public string Hinweis { get; set; } = "auto=true wird bei jedem Start neu erkannt. Eigene Zuordnungen mit auto=false bleiben erhalten.";
        public Dictionary<string, StoredAlias> Aliases { get; set; } = new();
    }

    internal sealed class StoredAlias
    {
        public string? Expr { get; set; }
        public bool Auto { get; set; } = true;
        public string? Label { get; set; }
        public string? Group { get; set; }
    }
}
