using System.Text.Json;
using System.Text.RegularExpressions;

namespace Sensorium.Sensors;

/// <summary>Eine Formel, die das Profil selbst mitbringt (Abschnitt „formulas“).</summary>
public sealed record ProfileFormula(string Expr, string Label);

/// <summary>
/// Was ein Profil an Daten von außen braucht: Home-Assistant-Entitäten, Tasmota-Steckdosen,
/// Geräte, die das Panel schalten darf, und eigene Formeln. Wird beim Laden und nach jeder
/// Änderung des Profils neu ermittelt, damit nur das abgefragt wird, was auch angezeigt wird.
/// </summary>
public sealed partial class ProfileRefs
{
    /// <summary>Schlüssel ohne „ha:“, z. B. „sensor.x“, „climate.y@temperature“, „climate.y@*“ (alle Attribute), „weather.z#forecast“.</summary>
    public HashSet<string> HaKeys { get; } = new(StringComparer.Ordinal);
    /// <summary>Entitäten, die das Panel per Klick umschalten darf (Kacheln mit "toggle": true).</summary>
    public HashSet<string> HaToggle { get; } = new(StringComparer.Ordinal);
    /// <summary>Adressen von Tasmota-Steckdosen aus „tasmota:&lt;adresse&gt;/…“.</summary>
    public HashSet<string> TasmotaHosts { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, ProfileFormula> Formulas { get; } = new(StringComparer.Ordinal);

    [GeneratedRegex(@"ha:([a-z0-9_]+\.[a-z0-9_]+)((?:@|#)[a-z0-9_]+)?")]
    private static partial Regex HaRx();

    [GeneratedRegex(@"tasmota:([A-Za-z0-9][A-Za-z0-9.\-]*)/")]
    private static partial Regex TasmotaRx();

    [GeneratedRegex(@"^[a-z0-9_]+\.[a-z0-9_]+$")]
    private static partial Regex EntityRx();

    /// <summary>
    /// Gespeichertes Profil plus Entwurf aus dem Editor: abgefragt wird beides, damit der Editor
    /// neue Werte sofort zeigt. Formeln und Schalter gelten nur aus dem gespeicherten Profil.
    /// </summary>
    public ProfileRefs Merge(ProfileRefs draft)
    {
        var merged = new ProfileRefs();
        merged.HaKeys.UnionWith(HaKeys);
        merged.HaKeys.UnionWith(draft.HaKeys);
        merged.TasmotaHosts.UnionWith(TasmotaHosts);
        merged.TasmotaHosts.UnionWith(draft.TasmotaHosts);
        merged.HaToggle.UnionWith(HaToggle);
        foreach (var (name, formula) in Formulas)
            merged.Formulas[name] = formula;
        return merged;
    }

    public static ProfileRefs From(JsonElement root)
    {
        var refs = new ProfileRefs();
        refs.Walk(root);
        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("formulas", out var formulas) && formulas.ValueKind == JsonValueKind.Object)
        {
            foreach (var f in formulas.EnumerateObject())
            {
                string? expr = null, label = null;
                if (f.Value.ValueKind == JsonValueKind.String)
                {
                    expr = f.Value.GetString();
                }
                else if (f.Value.ValueKind == JsonValueKind.Object)
                {
                    if (f.Value.TryGetProperty("expr", out var e) && e.ValueKind == JsonValueKind.String)
                        expr = e.GetString();
                    if (f.Value.TryGetProperty("label", out var l) && l.ValueKind == JsonValueKind.String)
                        label = l.GetString();
                }
                if (!string.IsNullOrWhiteSpace(expr))
                    refs.Formulas[f.Name] = new ProfileFormula(expr!, label ?? f.Name);
            }
        }
        return refs;
    }

    private void Walk(JsonElement e)
    {
        switch (e.ValueKind)
        {
            case JsonValueKind.Object:
                // Bausteine mit "entity" brauchen die ganze Entität samt Attributen (Wetter, Heizung, Kacheln).
                if (e.TryGetProperty("entity", out var entity) && entity.ValueKind == JsonValueKind.String
                    && entity.GetString() is { } id && EntityRx().IsMatch(id))
                {
                    HaKeys.Add(id);
                    HaKeys.Add(id + "@*");
                    if (id.StartsWith("weather.", StringComparison.Ordinal))
                        HaKeys.Add(id + "#forecast");
                    if (e.TryGetProperty("toggle", out var toggle) && toggle.ValueKind == JsonValueKind.True)
                        HaToggle.Add(id);
                }
                foreach (var p in e.EnumerateObject())
                    Walk(p.Value);
                break;
            case JsonValueKind.Array:
                foreach (var item in e.EnumerateArray())
                    Walk(item);
                break;
            case JsonValueKind.String:
                string s = e.GetString() ?? "";
                foreach (Match m in HaRx().Matches(s))
                {
                    HaKeys.Add(m.Groups[1].Value);
                    if (m.Groups[2].Success)
                        HaKeys.Add(m.Groups[1].Value + m.Groups[2].Value);
                }
                foreach (Match m in TasmotaRx().Matches(s))
                    TasmotaHosts.Add(m.Groups[1].Value);
                break;
        }
    }
}
