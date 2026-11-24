using System.Buffers;
using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Sensorium.Sensors;

/// <summary>Baut die JSON-Nachrichten, die an die Weboberfläche gehen.</summary>
public static class Protocol
{
    private static readonly JsonWriterOptions WriterOptions = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public static string Values(IReadOnlyDictionary<string, object?> values) => Write(w =>
    {
        w.WriteString("type", "values");
        w.WriteNumber("t", DateTimeOffset.Now.ToUnixTimeMilliseconds());
        w.WriteStartObject("v");
        foreach (var (key, value) in values)
        {
            w.WritePropertyName(key);
            WriteValue(w, value);
        }
        w.WriteEndObject();
    });

    public static string Catalog(IReadOnlyList<SensorInfo> sensors, IReadOnlyList<AliasEntry> aliases, HubStatus status) => Write(w =>
    {
        w.WriteString("type", "catalog");
        w.WriteStartArray("sensors");
        foreach (var s in sensors)
        {
            w.WriteStartObject();
            w.WriteString("id", s.Id);
            w.WriteString("name", s.Name);
            w.WriteString("hw", s.Hardware);
            w.WriteString("hwId", s.HardwareId);
            w.WriteString("hwType", s.HardwareType);
            w.WriteString("type", s.Type);
            w.WriteString("unit", s.Unit);
            w.WriteString("src", s.Source);
            w.WriteEndObject();
        }
        w.WriteEndArray();

        w.WriteStartArray("aliases");
        foreach (var a in aliases)
        {
            w.WriteStartObject();
            w.WriteString("name", a.Name);
            w.WriteString("label", a.Label);
            w.WriteString("group", a.Group);
            w.WriteString("expr", a.Expr);
            w.WriteBoolean("auto", a.Auto);
            w.WriteString("error", a.Error);
            w.WriteEndObject();
        }
        w.WriteEndArray();

        w.WriteStartObject("status");
        w.WriteBoolean("elevated", status.Elevated);
        w.WriteBoolean("pawnio", status.PawnIo);
        w.WriteBoolean("rtss", status.Rtss);
        w.WriteBoolean("ready", status.Ready);
        w.WriteString("hardwareError", status.HardwareError);
        w.WriteBoolean("haConnected", status.HaConnected);
        w.WriteString("ha", status.Ha);
        w.WriteEndObject();
    });

    public static string Profile(JsonElement profile, string name, string path) => Write(w =>
    {
        w.WriteString("type", "profile");
        w.WriteString("name", name);
        w.WriteString("path", path);
        w.WritePropertyName("profile");
        profile.WriteTo(w);
    });

    public static string Error(string message) => Write(w =>
    {
        w.WriteString("type", "error");
        w.WriteString("message", message);
    });

    public static string Toast(string message) => Write(w =>
    {
        w.WriteString("type", "toast");
        w.WriteString("message", message);
    });

    public static string HaDirectoryError(string message) => Write(w =>
    {
        w.WriteString("type", "haDirectory");
        w.WriteString("error", message);
    });

    public static string Saved(string path) => Write(w =>
    {
        w.WriteString("type", "saved");
        w.WriteString("path", path);
    });

    public static string FormulaResult(string expr, object? value, string? error) => Write(w =>
    {
        w.WriteString("type", "formulaResult");
        w.WriteString("expr", expr);
        w.WritePropertyName("value");
        WriteValue(w, value);
        w.WriteString("error", error);
    });

    private static string Write(Action<Utf8JsonWriter> body)
    {
        var buffer = new ArrayBufferWriter<byte>(16 * 1024);
        using (var w = new Utf8JsonWriter(buffer, WriterOptions))
        {
            w.WriteStartObject();
            body(w);
            w.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.WrittenSpan);
    }

    private static void WriteValue(Utf8JsonWriter w, object? value)
    {
        switch (value)
        {
            case null:
                w.WriteNullValue();
                break;
            case double d:
                if (double.IsFinite(d)) w.WriteNumberValue(Math.Round(d, 3));
                else w.WriteNullValue();
                break;
            case float f:
                if (float.IsFinite(f)) w.WriteNumberValue(Math.Round((double)f, 3));
                else w.WriteNullValue();
                break;
            case int i:
                w.WriteNumberValue(i);
                break;
            case long l:
                w.WriteNumberValue(l);
                break;
            case bool b:
                w.WriteBooleanValue(b);
                break;
            case string s:
                w.WriteStringValue(s);
                break;
            case double[] array:
                w.WriteStartArray();
                foreach (double x in array)
                {
                    if (double.IsFinite(x)) w.WriteNumberValue(Math.Round(x, 2));
                    else w.WriteNullValue();
                }
                w.WriteEndArray();
                break;
            case IReadOnlyDictionary<string, object?> map: // z. B. ein Tag der Wettervorhersage
                w.WriteStartObject();
                foreach (var (key, item) in map)
                {
                    w.WritePropertyName(key);
                    WriteValue(w, item);
                }
                w.WriteEndObject();
                break;
            case System.Collections.IEnumerable list: // z. B. die Wettervorhersage
                w.WriteStartArray();
                foreach (object? item in list)
                    WriteValue(w, item);
                w.WriteEndArray();
                break;
            default:
                w.WriteStringValue(Convert.ToString(value, CultureInfo.InvariantCulture));
                break;
        }
    }
}
