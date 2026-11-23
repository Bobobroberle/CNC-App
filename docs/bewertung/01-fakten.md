# 01 – Fakten zur Software (ohne Wertung)

Nur Beschreibung: was es ist, woran es hängt, wie man es startet und testet. Keine Begründungen, keine
Geschichte.

## Was es ist

Eine Web-Oberfläche (TypeScript, React, Tailwind CSS v4, three.js, Canvas 2D) zur Bedienung einer
**V1E LowRider v4** (Portalfräse) mit **Jackpot-Board und FluidNC 3.9.1**. Die Release-Datei ist eine
einzelne HTML-Datei ohne Nachladen aus dem Internet. Ein Dienst auf einem Raspberry Pi 4 („Companion“)
leitet die Verbindung zu FluidNC weiter und liefert Kamerabild, Historie und Sensordaten.

## Hardware und Netz

| Gerät                     | Adresse                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| Jackpot (FluidNC)         | 192.168.0.200, WebSocket Port 81, Web-Oberfläche Port 80         |
| Raspberry Pi (`lowrider`) | 192.168.0.198, App Port 8080, Relay `/fluidnc`, Kamera Port 8081 |
| Windows-PC                | 192.168.0.199                                                    |
| Router                    | 192.168.0.1, WLAN „FluidNC_Keller“, ohne Internetzugang          |

- Achsen X, Y (mit Y2), Z (mit Z2), Endschalter vorhanden, keine A-Achse. Die Y-Achse ist mechanisch
  noch nicht fertig; Referenzfahrt wurde nicht ausgeführt.
- FluidNC arbeitet im Station-Modus und tritt dem WLAN nur beim Einschalten bei.
- Grenzen in FluidNC: X/Y 9000 mm/min, Z 1200 mm/min; Beschleunigung X/Y 200, Z 80 mm/s².
  `soft_limits` ist in der `config.yaml` aus.
- Konfigurationen: `machine/config.yaml`, `machine/config-ist-jackpot1.yaml`, `profiles/lowrider-v4.json`.

## Repository

pnpm-Workspace. `apps/control` (Oberfläche), `apps/companion` (Pi-Dienst), `apps/ios`,
`packages/gcode-core`, `packages/fluidnc-client`, `packages/workshop`, `packages/cam`, `sim/`
(Simulator), `scripts/` (Bündelung, Pi-Setup), `docs/`, `e2e/`.

## Befehle

- `pnpm install`
- `pnpm check` – Typprüfung, Tests mit Abdeckung, Bau aller Pakete
- `pnpm e2e` – Playwright-Tests (Projekte `tablet`, `desktop`, `ipad`); vorher `pnpm build`
- Release-Dateien: `lowrider-control.html`, `lowrider-demo.html` (mit Simulator), `lowrider-pi.zip`

## Prüfstand

- Unit-Tests: control 555, fluidnc-client 86, cam 112, gcode-core 160, workshop 100, companion 49.
- Die vier Bibliotheken `gcode-core`, `fluidnc-client`, `workshop`, `cam` haben 100 % Abdeckung
  (per Schwellwert erzwungen).
- E2E gegen den Simulator: desktop 119, tablet 118 (1 übersprungen), ipad 25.
- CI auf GitHub, Lauf 85 auf Commit `5d3f2e0`: erfolgreich.
- **An der echten Maschine ist keine Funktion abgenommen.**

## Funktionsumfang (Auflistung)

- Statusleiste, PAUSE (Vorschub halten), NOT-HALT, Meldungszentrum.
- Fünf Schritte: Job · Werkzeuge · Einrichten · Prüfen · Fräsen; Nebenbereiche Werkzeugliste, Service &
  Diagnose, Einstellungen, Konsole; Jog-Feld; Schnellsuche; dunkles und helles Theme.
- G-Code laden, prüfen, simulieren (2D/3D), von der SD-Karte oder per Streaming starten, pausieren,
  fortsetzen, abbrechen, Wiederaufnahme ab Zeile.
- Nullpunkte, Antasten, Werkzeuglänge, Kamera (Tisch-Foto, Messen, Spannmittel, Bohrungen).
- Eingebautes CAM: Formen, Text, SVG/DXF, Außen-/Innenkontur, Tasche, Bohren, Gravur, Haltestege,
  Gleich-/Gegenlauf (Schalter für die ganze Zeichnung), Rampe, Helix-Bohren, Schlichtzugabe;
  Wenden (beidseitig), Serien auf Rohlingen, Vorrichtungen mit gedruckten Markern, Abschnitte für
  Teile länger als der Tisch.
- Nicht vorhanden: Wirbelfräsen, adaptives Ausräumen, Restmaterial mit zweitem Fräser.
- Werkzeug- und Materialverwaltung mit Schnittwert-Vorschlägen.
- Verbindung über den Pi oder direkt; automatisches Neuverbinden außerhalb eines Jobs; Karte für
  FluidNC-Grenzen (Höchstgeschwindigkeit, Beschleunigung).

## Wo steht was

`README.md` (Überblick), `docs/projektbeschreibung.md`, `docs/erste-schritte.md` (Prüfliste für die
Maschine), `docs/offene-fragen.md`, `docs/ideen.md`, `docs/maschinenprofil.md`, `docs/companion.md`,
`docs/kalibrierung.md`, `docs/ipad.md`. `CLAUDE.md`, `DESIGN.md` und `docs/umbau-guide.md` enthalten
Begründungen zu Entwurfsentscheidungen.
