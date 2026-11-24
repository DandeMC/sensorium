using System.Security.Cryptography;
using System.Text;

namespace Sensorium.Host;

/// <summary>
/// Bewahrt den Zugriffstoken für Home Assistant verschlüsselt auf (Windows-DPAPI): Nur dieses
/// Windows-Benutzerkonto kann ihn wieder lesen. Er steht nie in settings.json oder einem Profil.
/// </summary>
internal static class TokenStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Sensorium.HomeAssistant.v1");

    private static string FilePath => Path.Combine(AppPaths.Data, "ha-token.bin");

    public static bool Exists => File.Exists(FilePath);

    public static string? Load()
    {
        try
        {
            if (!File.Exists(FilePath))
                return null;
            byte[] plain = ProtectedData.Unprotect(File.ReadAllBytes(FilePath), Entropy, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plain);
        }
        catch (Exception ex)
        {
            Log.Error("Token für Home Assistant lesen", ex);
            return null;
        }
    }

    public static void Save(string token)
    {
        byte[] data = ProtectedData.Protect(Encoding.UTF8.GetBytes(token.Trim()), Entropy, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(FilePath, data);
    }
}
