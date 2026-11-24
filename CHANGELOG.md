# Änderungen

Alle nennenswerten Änderungen an Sensorium. Die Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

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

[0.1.0]: https://github.com/DandeMC/sensorium/releases/tag/v0.1.0
