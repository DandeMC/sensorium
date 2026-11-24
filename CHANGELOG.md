# Änderungen

Alle nennenswerten Änderungen an Sensorium. Die Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [0.2.0] – 2026-11-24

### Neu

- **Looks:** sieben fertige Themes – Aurora, Mitternacht (für OLED), Neon, Terminal, Glut, Gold und das helle Polar. Ein Klick im Editor (Reiter „Design“) oder im neuen Schritt „Look“ des Assistenten, die Anordnung bleibt.
- **Mehr Gestaltung:** neue Hintergründe (Lichtschein, Horizont, Raster), drei Kartenstile (Glas, flach, nur Rahmen) und helle Themes.
- **Vorlagen für andere Bildschirme:** Streifen (1920 × 480), Kompakt (1024 × 600) und Hochkant (1080 × 1920). Passt das Layout nicht zum Panel-Bildschirm, schlägt der Assistent die passende Vorlage vor.
- **Profile importieren und exportieren** (Editor, Reiter „Design“). Vor dem Import zeigt Sensorium, was in der Datei steckt: anderes Format, fehlende Home-Assistant-Werte und Kacheln, die Geräte schalten würden. Schalten ist erst nach ausdrücklicher Zustimmung erlaubt.
- Laufwerk-Element: „Lesen und Schreiben zeigen“ lässt sich für schmale Karten abschalten.

### Geändert

- Alle Farben des Panels folgen jetzt dem Theme, auch Seitenknöpfe, Trennlinien, Wettersymbole und das Leuchten im Hintergrund.
- Sicherheit: Die Fenster laden nur noch Inhalte aus dem Programmordner (Content Security Policy). Ein Profil kann nichts aus dem Internet nachladen, beim Import werden solche Verweise zusätzlich entfernt.
- Die automatische Seite „Zuhause“ im Assistenten gibt es für das Format 1920 × 1080; bei anderen Formaten verweist der Assistent auf den Editor.

## [0.1.0] – 2026-11-24

Erste öffentliche Version.

### Neu

- **PC-Seite:** CPU, Grafikkarte, Arbeitsspeicher, Laufwerke, Netzwerk, Lüfter und Pumpe über LibreHardwareMonitor, mit automatischer Zuordnung der Sensoren.
- **FPS** über RTSS; beim Spielstart wechselt die Leistungskachel auf die Framerate.
- **Corsair-AIO** (Hydro Platinum, Pro XT, iCUE Elite RGB) direkt per USB, nur lesend und parallel zu iCUE.
- **Home Assistant** (optional): WebSocket-Verbindung mit Zugriffstoken (verschlüsselt per DPAPI), Seite „Zuhause“ mit Wetter, Personen, Haustür, Fenstern, Energie, Heizung und Kacheln zum Schalten per Mausklick.
- **Tasmota-Steckdosen** (optional): direkte Abfrage jede Sekunde.
- **Einrichtungsassistent** beim ersten Start: Bildschirm, Sensoren, Home Assistant (freiwillig, mit Vorschlägen, Etagenfilter und Live-Vorschau) und Autostart.
- **Editor:** Panel mit der Maus gestalten, mit Live-Werten, Raster, Rückgängig, Formeln, Seiten, Design und „Auf dem Panel testen“.
- **Mehrere Seiten** mit Umschalter, Mausrad und automatischem Wechsel; Klicks nehmen dem Spiel nicht den Fokus.
- **Formelsprache** für eigene Werte (`sum`, `avg`, `first`, `pos` …) und Platzhalter in Texten.
- Autostart über die Aufgabenplanung (ohne UAC-Abfrage beim Anmelden).

[0.2.0]: https://github.com/DandeMC/sensorium/releases/tag/v0.2.0
[0.1.0]: https://github.com/DandeMC/sensorium/releases/tag/v0.1.0
