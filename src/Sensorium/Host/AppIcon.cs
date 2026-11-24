using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace Sensorium.Host;

/// <summary>Das Programmsymbol wird zur Laufzeit gezeichnet (Verlauf Cyan → Blau mit Pulslinie).</summary>
internal static class AppIcon
{
    private static Icon? _icon;

    public static Icon Get() => _icon ??= Create();

    private static Icon Create()
    {
        using var bitmap = new Bitmap(64, 64, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using var shape = RoundedRect(new RectangleF(2, 2, 60, 60), 15);
            using var fill = new LinearGradientBrush(new PointF(0, 0), new PointF(64, 64), Color.FromArgb(56, 210, 239), Color.FromArgb(109, 140, 255));
            g.FillPath(fill, shape);
            using var pen = new Pen(Color.White, 6f) { LineJoin = LineJoin.Round, StartCap = LineCap.Round, EndCap = LineCap.Round };
            g.DrawLines(pen, new[]
            {
                new PointF(11, 35), new PointF(21, 35), new PointF(27, 21),
                new PointF(36, 46), new PointF(42, 31), new PointF(53, 31),
            });
        }
        IntPtr handle = bitmap.GetHicon();
        try
        {
            using var temporary = Icon.FromHandle(handle);
            return (Icon)temporary.Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    private static GraphicsPath RoundedRect(RectangleF r, float radius)
    {
        var path = new GraphicsPath();
        float d = radius * 2;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr handle);
}
