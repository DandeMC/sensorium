<#
  Baut das Release-Paket: eigenständig (ohne installiertes .NET), win-x64, als ZIP.
    artifacts\Sensorium-<Version>-win-x64.zip
    artifacts\release-notes.md   (Abschnitt aus CHANGELOG.md plus Kurzanleitung)
  Die Version steht in src\Sensorium\Sensorium.csproj. Läuft das Skript in GitHub Actions für ein Tag,
  muss das Tag zur Version passen (v0.1.0 ↔ 0.1.0).
#>
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'src\Sensorium\Sensorium.csproj'
$artifacts = Join-Path $root 'artifacts'
$utf8 = New-Object System.Text.UTF8Encoding $false

[xml]$csproj = [IO.File]::ReadAllText($project, $utf8)
$version = ($csproj.Project.PropertyGroup | ForEach-Object { $_.Version } | Where-Object { $_ } | Select-Object -First 1)
if (-not $version) { throw 'Keine <Version> in Sensorium.csproj gefunden.' }

if ($env:GITHUB_REF_TYPE -eq 'tag' -and $env:GITHUB_REF_NAME -ne "v$version") {
  throw "Das Tag $($env:GITHUB_REF_NAME) passt nicht zur Version $version in Sensorium.csproj."
}

$name = "Sensorium-$version-win-x64"
$out = Join-Path $artifacts $name
$zip = Join-Path $artifacts "$name.zip"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Force $out | Out-Null

dotnet publish $project -c Release -r win-x64 --self-contained true -o $out --nologo -v q -p:DebugType=none -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { throw 'Der Build ist fehlgeschlagen.' }

Copy-Item (Join-Path $root 'LICENSE') (Join-Path $out 'LICENSE.txt')
Copy-Item (Join-Path $root 'THIRD-PARTY-NOTICES.md') $out
Copy-Item (Join-Path $root 'README.md') $out
Copy-Item (Join-Path $root 'CHANGELOG.md') $out

Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($out, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)

# Release-Text: der Abschnitt dieser Version aus CHANGELOG.md und eine Kurzanleitung.
$changelog = [IO.File]::ReadAllLines((Join-Path $root 'CHANGELOG.md'), $utf8)
$section = New-Object System.Collections.Generic.List[string]
$inside = $false
foreach ($line in $changelog) {
  if ($line -match '^## \[') { if ($inside) { break }; $inside = $line.StartsWith("## [$version]"); continue }
  if ($inside -and $line -match '^\[[^\]]+\]: ') { break }
  if ($inside) { $section.Add($line) }
}
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$notes = @"
$(($section -join "`n").Trim())

### Installation

1. **$name.zip** unten herunterladen.
2. Rechtsklick auf die ZIP → Eigenschaften → **Zulassen** anhaken → OK.
3. Entpacken, z. B. nach ``%LOCALAPPDATA%\Programs\Sensorium``, und ``Sensorium.exe`` starten.
4. Fragt SmartScreen nach: **Weitere Informationen** → **Trotzdem ausführen** (das Programm ist nicht signiert). Adminrechte mit **Ja** bestätigen.
5. Der Einrichtungsassistent führt durch den Rest. Empfohlen: der [PawnIO-Treiber](https://pawnio.eu/) für CPU-Temperatur und Lüfter.

Ein installiertes .NET ist nicht nötig. Alles Weitere steht in der [Anleitung](https://github.com/DandeMC/sensorium#readme).

**English:** Download the ZIP, unblock it (Properties → Unblock), extract it and run ``Sensorium.exe``. The setup wizard does the rest. The user interface is in German.

SHA-256: ``$hash``
"@
[IO.File]::WriteAllText((Join-Path $artifacts 'release-notes.md'), $notes.Replace("`r`n", "`n"), $utf8)

$size = [Math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Paket: $zip ($size MB)"
Write-Host "SHA-256: $hash"
