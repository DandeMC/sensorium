using System.Globalization;

namespace Sensorium.Sensors;

/// <summary>
/// Kleine Formelsprache für Zuordnungen.
/// <list type="bullet">
/// <item><c>{lhm:/intelcpu/0/temperature/6}</c> – Sensor über seine ID</item>
/// <item><c>cpu.power</c> – andere Zuordnung oder Windows-Wert (sys.*)</item>
/// <item>Zahlen, <c>+ - * /</c>, Klammern</item>
/// <item>Funktionen: avg, min, max, sum, list, first, round, abs, pos (nie unter 0)</item>
/// </list>
/// </summary>
public abstract class Formula
{
    public delegate object? Resolver(string name, bool raw);

    public abstract object? Eval(Resolver resolve);

    public static Formula Parse(string text) => new FormulaParser(text).ParseAll();

    internal static double? Num(object? value) => value switch
    {
        double d when double.IsFinite(d) => d,
        float f when float.IsFinite(f) => f,
        int i => i,
        long l => l,
        _ => null,
    };
}

internal sealed class NumberNode(double value) : Formula
{
    public override object? Eval(Resolver resolve) => value;
}

internal sealed class RefNode(string name, bool raw) : Formula
{
    public override object? Eval(Resolver resolve) => resolve(name, raw);
}

internal sealed class NegateNode(Formula inner) : Formula
{
    public override object? Eval(Resolver resolve) => Num(inner.Eval(resolve)) is double d ? -d : null;
}

internal sealed class BinaryNode(char op, Formula left, Formula right) : Formula
{
    public override object? Eval(Resolver resolve)
    {
        if (Num(left.Eval(resolve)) is not double a || Num(right.Eval(resolve)) is not double b)
            return null;
        return op switch
        {
            '+' => a + b,
            '-' => a - b,
            '*' => a * b,
            '/' => b == 0 ? (object?)null : a / b,
            _ => (object?)null,
        };
    }
}

internal sealed class CallNode(string name, Formula[] args) : Formula
{
    public override object? Eval(Resolver resolve)
    {
        switch (name)
        {
            case "first":
                foreach (var arg in args)
                {
                    object? v = arg.Eval(resolve);
                    if (v is not null && !(v is string s && s.Length == 0))
                        return v;
                }
                return null;

            case "list":
            {
                var array = new double[args.Length];
                for (int i = 0; i < args.Length; i++)
                    array[i] = Num(args[i].Eval(resolve)) ?? double.NaN;
                return array;
            }

            case "round":
            {
                if (args.Length == 0 || Num(args[0].Eval(resolve)) is not double x)
                    return null;
                int digits = args.Length > 1 ? (int)(Num(args[1].Eval(resolve)) ?? 0) : 0;
                return Math.Round(x, Math.Clamp(digits, 0, 6));
            }

            case "abs":
                return args.Length > 0 && Num(args[0].Eval(resolve)) is double y ? Math.Abs(y) : (object?)null;

            case "pos": // nie unter 0, z. B. für Differenzen aus Messungen mit leicht versetztem Zeitpunkt
                return args.Length > 0 && Num(args[0].Eval(resolve)) is double z ? Math.Max(0, z) : (object?)null;
        }

        var numbers = new List<double>();
        foreach (var arg in args)
            Flatten(arg.Eval(resolve), numbers);
        if (numbers.Count == 0)
            return null;
        return name switch
        {
            "avg" => numbers.Average(),
            "min" => numbers.Min(),
            "max" => numbers.Max(),
            "sum" => numbers.Sum(),
            _ => (object?)null,
        };
    }

    private static void Flatten(object? value, List<double> into)
    {
        if (value is double[] array)
        {
            foreach (double x in array)
                if (double.IsFinite(x)) into.Add(x);
        }
        else if (Num(value) is double d)
        {
            into.Add(d);
        }
    }
}

internal sealed class FormulaParser(string text)
{
    private static readonly HashSet<string> Functions = new(StringComparer.Ordinal) { "avg", "min", "max", "sum", "list", "first", "round", "abs", "pos" };
    private readonly string _s = text ?? "";
    private int _i;

    public Formula ParseAll()
    {
        var result = ParseSum();
        SkipSpace();
        if (_i < _s.Length)
            throw new FormatException($"Unerwartetes Zeichen „{_s[_i]}“ an Position {_i + 1}.");
        return result;
    }

    private Formula ParseSum()
    {
        var left = ParseProduct();
        while (true)
        {
            SkipSpace();
            if (_i < _s.Length && (_s[_i] == '+' || _s[_i] == '-'))
            {
                char op = _s[_i++];
                left = new BinaryNode(op, left, ParseProduct());
            }
            else
            {
                return left;
            }
        }
    }

    private Formula ParseProduct()
    {
        var left = ParseUnary();
        while (true)
        {
            SkipSpace();
            if (_i < _s.Length && (_s[_i] == '*' || _s[_i] == '/'))
            {
                char op = _s[_i++];
                left = new BinaryNode(op, left, ParseUnary());
            }
            else
            {
                return left;
            }
        }
    }

    private Formula ParseUnary()
    {
        SkipSpace();
        if (_i < _s.Length && _s[_i] == '-')
        {
            _i++;
            return new NegateNode(ParseUnary());
        }
        return ParsePrimary();
    }

    private Formula ParsePrimary()
    {
        SkipSpace();
        if (_i >= _s.Length)
            throw new FormatException("Die Formel ist unvollständig.");

        char c = _s[_i];
        if (c == '(')
        {
            _i++;
            var inner = ParseSum();
            Expect(')');
            return inner;
        }
        if (c == '{')
        {
            int end = _s.IndexOf('}', _i + 1);
            if (end < 0)
                throw new FormatException("Es fehlt die schließende Klammer „}“.");
            string id = _s.Substring(_i + 1, end - _i - 1).Trim();
            _i = end + 1;
            if (id.Length == 0)
                throw new FormatException("Leere Sensor-ID „{}“.");
            return new RefNode(id, true);
        }
        if (char.IsDigit(c) || c == '.')
        {
            int start = _i;
            while (_i < _s.Length && (char.IsDigit(_s[_i]) || _s[_i] == '.'))
                _i++;
            if (!double.TryParse(_s.AsSpan(start, _i - start), NumberStyles.Float, CultureInfo.InvariantCulture, out double number))
                throw new FormatException($"Ungültige Zahl an Position {start + 1}.");
            return new NumberNode(number);
        }
        if (char.IsLetter(c) || c == '_')
        {
            int start = _i;
            while (_i < _s.Length && (char.IsLetterOrDigit(_s[_i]) || _s[_i] == '_' || _s[_i] == '.'))
                _i++;
            string name = _s.Substring(start, _i - start);
            SkipSpace();
            if (_i < _s.Length && _s[_i] == '(')
            {
                string function = name.ToLowerInvariant();
                if (!Functions.Contains(function))
                    throw new FormatException($"Unbekannte Funktion „{name}“.");
                _i++;
                var args = new List<Formula>();
                SkipSpace();
                if (_i < _s.Length && _s[_i] == ')')
                {
                    _i++;
                    return new CallNode(function, args.ToArray());
                }
                while (true)
                {
                    args.Add(ParseSum());
                    SkipSpace();
                    if (_i < _s.Length && _s[_i] == ',')
                    {
                        _i++;
                        continue;
                    }
                    Expect(')');
                    return new CallNode(function, args.ToArray());
                }
            }
            return new RefNode(name, false);
        }
        throw new FormatException($"Unerwartetes Zeichen „{c}“ an Position {_i + 1}.");
    }

    private void Expect(char expected)
    {
        SkipSpace();
        if (_i >= _s.Length || _s[_i] != expected)
            throw new FormatException($"„{expected}“ erwartet an Position {_i + 1}.");
        _i++;
    }

    private void SkipSpace()
    {
        while (_i < _s.Length && char.IsWhiteSpace(_s[_i]))
            _i++;
    }
}
