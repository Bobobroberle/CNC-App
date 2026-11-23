# LowRider Control – Projektbeschreibung

Oct 23, 2026 · @Bobo

## Vision

LowRider Control ist eine Web-Oberfläche für die V1E LowRider v4 mit Jackpot-Board (FluidNC), die den Komfort einer Datron Neo auf eine Hobby-Steuerung bringt: Ist/Soll-Pfadverfolgung live, Simulation vor dem Start, geführte Nullpunkt- und Tastzyklen, Maschinenparameter und FluidNC-Konfiguration an einem Ort. FluidNC bleibt der Motion-Controller; alle Intelligenz läuft im Browser oder auf einem Companion-Rechner neben der Maschine.

Zielgruppe ist zuerst der Betreiber selbst (Tischler, Industriedesigner, Elektrofachkraft), später die V1E-Community. Jede Funktion muss am Bildschirm neben der laufenden Fräse mit Handschuhen bedienbar sein: große Ziele, wenige Modi, kein Menü tiefer als zwei Ebenen.

## Zielsystem

Die Software wird für genau eine Maschine gebaut und erst danach verallgemeinert.

| Komponente | Stand | Relevanz für die Software |
| --- | --- | --- |
| Maschine | V1E LowRider v4, Standard-BOM | Portal mit zwei Y-Motoren (Auto-Squaring), zwei Z-Motoren, großer Verfahrweg, geringe Steifigkeit → Vorschub-Override und Lastanzeige sind wichtiger als bei einer Stahlmaschine |
| Controller | V1E Jackpot (ESP32, FluidNC), 6 TMC2209-Treiber | WebSocket Port 81, HTTP-API, SD-Karte, `$`-Settings, `config.yaml`; keine G68-Rotation, Makros über FluidNC-Makrosystem |
| 4. Achse | VEVOR K11-100 Rotary an Achse A | Rotary-Visualisierung (abgewickelte Ansicht), Grad/min-Vorschub, Inverse-Time-Feed (G93) |
| Spindel | Oberfräse ohne Drehzahlsteuerung (Ausbau: VFD-Spindel über RS485) | Spindel-Relais heute, Drehzahl und Last morgen |
| Netzwerk | Jackpot im Werkstatt-WLAN, Bedienung per Laptop/Tablet | App läuft als lokale Webseite (http oder file://), weil Browser kein `ws://` aus einer https-Seite erlauben |
| Companion-Rechner | geplant: Raspberry Pi 5 oder Mini-PC an der Maschine | Hostet die App, puffert Jobs, später Kamera und Sensorik |

CAM bleibt extern (Fusion 360, Vectric, später Estlcam-Import); die Steuerung nimmt G-Code entgegen und macht ihn sicher, sichtbar und korrigierbar.

## Architektur und Tech-Stack

Drei Schichten, klar getrennt: Echtzeit bleibt auf dem ESP32, Zustand und Dienste liegen auf dem Companion, die Darstellung im Browser. Die Oberfläche muss auch ohne Companion direkt gegen den Jackpot laufen (Stufe 1), damit die Maschine nie von einem zweiten Rechner abhängt.

&#91;embedded content: Systemarchitektur · 4 Schichten, CAM extern\]

Die UI spricht in Stufe 1 direkt mit FluidNC; der Companion schiebt sich später dazwischen, ohne dass sich die UI ändert.

| Schicht | Technik | Begründung |
| --- | --- | --- |
| UI | React + TypeScript, Vite, Canvas 2D für die Draufsicht, three.js für 3D, Zustand über einen zentralen Store (zustand/Redux) | Vertraute Werkzeuge, läuft als statische Seite, auch auf dem Tablet |
| Maschinen-Anbindung | FluidNC-WebSocket (Port 81) für Status und Streaming, HTTP für Dateien und `config.yaml`, Web Serial API für Flashen über USB | Alles, was FluidNC heute schon anbietet; kein eigener Firmware-Fork |
| Companion-Dienste | Node (Fastify) oder Python (FastAPI) auf Raspberry Pi 5; SQLite für Werkzeuge, Materialien, Job-Historie | Leicht, offline, ohne Cloud; Kamera und Sensorik docken hier an |
| G-Code-Kern | Eigener Parser/Interpreter als geteilte Bibliothek (Vorschau, Simulation, Transformation, Zeit-Schätzung) | Eine Wahrheit für alles, was G-Code liest; der Parser der Demo ist der Ausgangspunkt |
| Tests | Vitest für den Kern, Playwright für UI-Flows, Golden-Files aus echten Fusion-/Vectric-Posts | Parser-Fehler sind Crash-Fehler an der Maschine |

## Funktionsmodule nach Ausbaustufen

Jede Stufe ist für sich benutzbar und wird an der Maschine abgenommen, bevor die nächste beginnt. Stufe 1 ist die bestehende Demo (`lowrider-live.html`), sauber in Module zerlegt.

**Stufe 1 – Sehen (Live-Ansicht und Simulation)**

- Verbindung zu FluidNC per WebSocket, Statusabfrage 5–10 Hz, Zustände Idle/Run/Hold/Alarm/Door, Alarm-Codes in Klartext mit Handlungsvorschlag.
- G-Code-Parser: G0–G3 (I/J/K und R), G17–19, G20/21, G90/91, G90.1/91.1, G53, G54–59, G92, M3/M4/M5, M6/T, Vorschub F und S; Rotary-Achse A; Zeilennummern N.
- Draufsicht XY: Pfade nach Tiefe eingefärbt, Eilgänge gestrichelt, Werkzeugkreis im echten Durchmesser, gefahrene Strecke, aktuelles Segment, Abweichung Werkzeug ↔ Kontur in mm (Ist/Soll wie Estlcam).
- Z-Pegel und Seitenansicht XZ; Rotary-Jobs als abgewickelte Ansicht.
- Simulation vor dem Start: Scrubber, Abspielen mit Zeitfaktor, Vorschau der Bearbeitungszeit aus Vorschub, Beschleunigung und Eilgang der echten Maschine.
- Zeilen-Tracking über `Ln:` aus dem Statusreport, geometrisches Fallback über nächstes Segment.

**Stufe 2 – Steuern (vollwertiger Sender)**

- Jog: Tastenkreuz, Schrittweiten 0,01/0,1/1/10 mm, Dauerjog, Tastatur- und Gamepad-Steuerung, Jog-Rad am Touchscreen.
- Nullpunkte: XYZ setzen, alle sechs WCS, Nullpunkt-Speicher pro Spannmittel mit Name und Foto.
- Job-Streaming mit Zeichenzähler-Protokoll, Pause/Resume, Vorschub- und Drehzahl-Override 10–200 %, Not-Halt-Button mit Soft-Reset.
- Rahmen abfahren (Bounding-Box in sicherer Höhe) vor dem Start; Check Soft-Limits gegen den geladenen Job mit Warnung, bevor gestartet wird.
- Tastzyklen als Assistenten: Z-Tastblock, XYZ-Eckentaster, Werkstückmitte, Kante, Werkzeuglängensensor mit automatischer Längenkorrektur bei Werkzeugwechsel.
- Werkzeugwechsel-Dialog: Job hält an sicherer Position, zeigt nächstes Werkzeug mit Bild, führt durch Tasten und setzt fort.
- Job-Wiederaufnahme ab Zeile N nach Abbruch, mit Nachfahren der Modalzustände.

**Stufe 3 – Konfigurieren (Maschine und Firmware)**

- Maschinenprofil: physische Parameter (Verfahrwege XYZ, Rotary ja/nein, Spindeltyp, Werkzeuglängensensor-Position, Tastblock-Dicke) → generiert Soft-Limits, Homing-Verhalten und sichere Höhen; Arbeitsraum wird in Live-Ansicht und Simulation als Grenze gezeichnet.
- `config.yaml`-Editor mit Schema-Validierung, Diff gegen den aktuellen Stand, Backup vor jedem Upload, Upload über FluidNC-HTTP und Neustart.
- `$`-Settings-Browser mit Erklärungen in Klartext (statt `$Report/Interval`).
- Firmware flashen aus dem Browser per Web Serial API (esptool-js), Auswahl der Release-Version, Sicherung der vorhandenen Konfiguration vorher.
- Werkzeugbibliothek (Durchmesser, Schneiden, Länge, Halter) und Materialbibliothek mit Schnittwerten; Vorschlag für Vorschub und Drehzahl, der mit jedem gefahrenen Job verfeinert wird.
- Job-Historie mit Dauer, Werkzeugen, Material, Abbrüchen und Alarmen.

**Stufe 4 – Sehen in 3D (Maschine und Werkstück)**

- 3D-Ansicht in three.js: Opfertisch, Werkstück-Rohteil aus Maßen oder STL, Werkzeug und Halter, Portal und Z-Achse als vereinfachtes LowRider-Modell.
- Simulation mit Materialabtrag (Höhenfeld-Verfahren) und animierter Maschine; Kollisionscheck Halter/Portal gegen Rohteil und Spannmittel vor dem Start.
- Live-Ansicht in 3D mit dem Bewegungsmodell synchronisiert zur echten Position.

**Stufe 5 – Optik und Sensorik (Companion-Rechner)**

- Kamera an der Z-Achse mit kalibriertem Offset: Nullpunkt per Klick aufs Livebild, Kantenerkennung für Werkstückwinkel, Pfad-Overlay auf dem Kamerabild.
- Ausrichten des Jobs an das Werkstück: Verschiebung und Rotation im G-Code vor dem Streaming, weil FluidNC kein G68 kennt.
- Spindellast über VFD/RS485 als Balken, adaptive Vorschubregelung nach Last; Rattererkennung über Beschleunigungssensor.
- Benachrichtigung ans Handy bei Job-Ende, Alarm oder Werkzeugwechsel; Timelapse.

## UI-Prinzipien

> **Abgelöst durch [`DESIGN.md`](../DESIGN.md)** (verbindlicher UX-/HMI-Guide, neuer als dieser
> Abschnitt): Start + Ablauf in fünf Schritten statt der drei Räume, dunkles und helles Theme, Blau
> als Akzent, PAUSE neben NOT-HALT. Wo beide sich widersprechen, gilt der Guide; was hier über
> Sicherheit, Halten und Touch steht, gilt weiter. Stand des Umbaus: [umbau-guide.md](umbau-guide.md).

Die Oberfläche wird für den Blick aus zwei Metern Entfernung auf ein Tablet neben einer laufenden Fräse gestaltet, nicht für den Schreibtisch.

- **Eine Bühne, drei Räume.** Die Live-Ansicht ist immer die Bühne. Daneben genau drei Bereiche: *Fahren* (Jog, Nullpunkte, Tasten), *Job* (Datei, Simulation, Start/Stopp, Override), *Maschine* (Profil, Konfiguration, Werkzeuge). Kein viertes Hauptmenü.
- **Zustand vor Dekoration.** Maschinenstatus, Position, Vorschub und Abweichung sind immer sichtbar, in großen tabellarischen Ziffern. Farbe bedeutet etwas: grün gefahren, gelb aktuell, rot im Material oder Alarm, sonst neutral.
- **Dunkel, flach, ruhig.** Anthrazit-Grundton, eine Akzentfarbe (Orange wie V1E), keine Schatten, keine Verläufe, keine Icons ohne Beschriftung. Typografie: eine Systemschrift, drei Größen.
- **Touch zuerst.** Mindestens 48 px Zielgröße, Dauerjog per Halten, Zoom per Pinch, keine Hover-Zustände als einzige Rückmeldung. Tastatur und Gamepad als Beschleuniger, nie als Voraussetzung.
- **Assistenten statt Formulare.** Nullpunkt setzen, Werkzeug wechseln, Konfiguration ändern laufen als Schritt-für-Schritt-Dialog mit einer Frage pro Schritt und einer Rückfahrt-Option. Experten erreichen die Rohdaten (G-Code-Konsole, `config.yaml`) über einen zweiten Weg, nie im Hauptpfad.
- **Gefährliches braucht zwei Gesten.** Start, Homing, Flashen und Konfigurations-Upload sind Bestätigen-Buttons mit Halten oder Zweitklick. Not-Halt ist überall erreichbar, groß, rot, einmal tippen.
- **Nichts verschwindet.** Jede Aktion erzeugt eine Zeile im Protokoll; Fehlermeldungen nennen Ursache und nächsten Schritt in einem Satz.

## Anleihen und Innovationen

Abgeschaut wird gezielt: pro Vorbild die eine Idee, die es besser macht als alle anderen.

| Vorbild | Übernommene Idee | Umsetzung bei LowRider Control |
| --- | --- | --- |
| Estlcam | Ist/Soll-Anzeige: Werkzeug im Verhältnis zur Kontur, Abweichung sofort sichtbar | Kern von Stufe 1; zusätzlich Abweichung als Zahl und als Trend über den Job |
| Datron Neo / Next | Werkstück-Assistent: Material → Werkzeug → Nullpunkt → Simulation → Start als eine geführte Strecke; Spindellast als Balken | Assistent als Startpfad für jeden Job; Lastbalken ab VFD-Spindel |
| gSender | Rahmen abfahren, Job-Wiederaufnahme ab Zeile, Gamepad-Jog, Werkzeugwechsel-Strategien | Stufe 2 komplett |
| OpenBuilds CONTROL | Firmware flashen und Konfiguration aus derselben Oberfläche | Stufe 3 über Web Serial statt Desktop-App |
| bCNC | Kamera-Offset-Kalibrierung und Autolevel per Tastraster | Stufe 5; Autolevel für V-Carve auf welligen Platten |
| LinuxCNC | Saubere Trennung Interpreter / Motion; Tastzyklen als parametrierte Routinen | Eigener G-Code-Kern als geteilte Bibliothek, Tastzyklen als Makro-Vorlagen |
| Mach3/4 | Werkzeugtabelle mit Längen- und Radiuskorrektur | Werkzeugbibliothek mit TLS-Abgleich |

**Was es so noch nicht gibt**

- **Abweichungs-Historie:** Ist/Soll pro Job aufzeichnen und über die Zeit vergleichen; steigende Abweichung zeigt Riemenverschleiß oder lose Schrauben, bevor ein Teil Schrott wird.
- **Soft-Limits aus dem Maschinenprofil, nicht aus Zahlen:** Verfahrwege, Spannmittel und Rohteil ergeben den Arbeitsraum; der Job wird vor dem Start dagegen geprüft, in 2D und 3D.
- **Job-Zwilling:** Jede Simulation läuft mit den echten Beschleunigungswerten aus `config.yaml`; die Zeitschätzung trifft auf wenige Prozent.
- **Kamera-Overlay als Ausrichthilfe:** Pfade auf dem Livebild sehen, Werkstück schief auflegen, Job dreht sich mit.
- **Lernende Schnittwerte:** Vorschlag aus Material und Werkzeug, korrigiert durch Override-Verhalten und Spindellast der letzten Jobs.
- **Community-Profile:** Maschinenprofil, Werkzeuge und Materialien als JSON teilbar; ein LowRider-v4-Profil liegt bei.

## Nicht-Ziele und Leitplanken

- Kein eigenes CAM. Pfade kommen aus Fusion 360, Vectric oder Estlcam; die Steuerung transformiert G-Code (Verschieben, Drehen, Skalieren, Autolevel), erzeugt ihn aber nicht aus Geometrie.
- Kein Firmware-Fork. Alles, was FluidNC nicht kann, wird im G-Code vor dem Streaming gelöst oder als FluidNC-Makro abgelegt; Beiträge gehen upstream.
- Keine Cloud, kein Konto. Alles läuft im Werkstattnetz; Updates kommen als Release-ZIP oder `git pull` auf dem Companion.
- Keine Sicherheitsfunktion im Browser. Not-Halt, Soft-Limits und Endschalter sind Sache der Steuerung und der Hardware; die App löst sie aus und zeigt sie an, ersetzt sie aber nie.
- Jede Stufe wird zuerst gegen den FluidNC-Simulator oder einen leeren Jackpot auf dem Tisch getestet, dann an der Maschine mit Spindel aus, dann im Material.
- Code-Sprache Englisch, Oberfläche Deutsch mit i18n-Struktur, damit Englisch später eine Übersetzungsdatei ist.

## Startpunkt und erste Aufgaben für Claude Code

Der Prototyp `lowrider-live.html` (ein File, Vanilla JS, \~570 Zeilen) ist die Referenz für Stufe 1 und wird nicht weitergepflegt, sondern in das neue Projekt überführt.

1. Repository anlegen: `pnpm`-Monorepo mit `packages/gcode-core` (Parser, Interpreter, Transformation, Zeitschätzung, 100 % getestet), `packages/fluidnc-client` (WebSocket, HTTP, Statusparser, Streaming-Protokoll) und `apps/control` (React-UI).
2. Parser aus dem Prototyp in `gcode-core` übernehmen, mit Golden-Files aus echten Fusion-360- und Vectric-Posts für die LowRider absichern; Rotary-Achse A ergänzen.
3. `fluidnc-client` gegen eine aufgezeichnete Statusreport-Session testen; offene Frage klären, ob FluidNC `Ln:` ohne weitere Einstellung meldet und ob mehrere WebSocket-Clients parallel erlaubt sind.
4. UI-Gerüst nach den UI-Prinzipien: Bühne (Live-Ansicht) plus die drei Räume Fahren, Job, Maschine; Dark Theme, Design-Tokens, Komponentenbibliothek klein halten.
5. Stufe 1 fertigstellen und an der Maschine abnehmen, danach Stufe 2 mit Jog, Nullpunkten und Streaming.

- [ ] Maschinenprofil der konkreten LowRider v4 erfassen: Verfahrwege, Beschleunigungen, Tastblock-Dicke, Position des Werkzeuglängensensors
- [ ] `config.yaml` und `$`-Settings des Jackpot sichern und ins Repository legen
- [ ] Zwei bis drei echte G-Code-Jobs (Fusion, Vectric, einer mit Rotary) als Testdaten sammeln
- [ ] Entscheidung Companion: Raspberry Pi 5 oder vorhandener Mini-PC
