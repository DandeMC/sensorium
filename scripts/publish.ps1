<#
  Baut Sensorium (Release) und installiert es nach %LOCALAPPDATA%\Programs\Sensorium.
    -Shortcut  legt eine Verknüpfung im Startmenü an
    -Run       startet Sensorium danach. Ist der Autostart eingerichtet, über die Aufgabenplanung
               (mit Adminrechten, ohne Abfrage), sonst normal (Windows fragt nach Adminrechten).
  Läuft Sensorium bereits, wird es über die Datei exit.request zum Beenden aufgefordert.
#>
param([switch]$Shortcut, [switch]$Run)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'src\Sensorium\Sensorium.csproj'
$target = Join-Path $env:LOCALAPPDATA 'Programs\Sensorium'
$exitRequest = Join-Path $env:APPDATA 'Sensorium\exit.request'

if (Get-Process Sensorium -ErrorAction SilentlyContinue) {
  New-Item -ItemType File -Force $exitRequest | Out-Null
  $until = (Get-Date).AddSeconds(15)
  while ((Get-Process Sensorium -ErrorAction SilentlyContinue) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 300 }
  if (Get-Process Sensorium -ErrorAction SilentlyContinue) {
    try { Get-Process Sensorium | Stop-Process -Force -ErrorAction Stop; Start-Sleep -Milliseconds 800 }
    catch { throw 'Sensorium läuft noch. Bitte über das Tray-Symbol beenden und das Skript erneut starten.' }
  }
  Remove-Item $exitRequest -ErrorAction SilentlyContinue
  # WebView2 braucht nach dem Beenden noch einen Moment; sonst hängt sich die neue Instanz
  # an den gerade endenden Browser-Prozess der alten.
  Start-Sleep -Seconds 3
}

dotnet publish $project -c Release -r win-x64 --self-contained false -o $target --nologo -v q
if ($LASTEXITCODE -ne 0) { throw 'Der Build ist fehlgeschlagen.' }

if ($Shortcut) {
  $link = Join-Path ([Environment]::GetFolderPath('Programs')) 'Sensorium.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $shortcutFile = $shell.CreateShortcut($link)
  $shortcutFile.TargetPath = Join-Path $target 'Sensorium.exe'
  $shortcutFile.WorkingDirectory = $target
  $shortcutFile.Description = 'Sensor-Panel'
  $shortcutFile.Save()
  Write-Host "Startmenü-Verknüpfung: $link"

  $editorLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Sensorium – Panel bearbeiten.lnk'
  $editorFile = $shell.CreateShortcut($editorLink)
  $editorFile.TargetPath = Join-Path $target 'Sensorium.exe'
  $editorFile.Arguments = '--editor'
  $editorFile.WorkingDirectory = $target
  $editorFile.Description = 'Panel von Sensorium bearbeiten'
  $editorFile.Save()
  Write-Host "Startmenü-Verknüpfung: $editorLink"
}

Write-Host "Installiert nach: $target"
if ($Run) {
  $taskExists = $false
  try { $null = schtasks /Query /TN Sensorium 2>&1; $taskExists = ($LASTEXITCODE -eq 0) } catch { $taskExists = $false }
  if ($taskExists) {
    schtasks /Run /TN Sensorium | Out-Null
    Write-Host 'Gestartet über die Aufgabenplanung.'
  }
  else {
    Start-Process (Join-Path $target 'Sensorium.exe')
  }
}
