# Offene und geklärte Fragen zu FluidNC

Stand 2026-10-24. Geklärt am FluidNC-Quellcode (`bdring/FluidNC`, Branch `main`) und an der
`config.yaml` der Maschine ([`machine/config.yaml`](../machine/config.yaml), V1E-Standard für
Jackpot 2 / LowRider). Dateiangaben beziehen sich auf `FluidNC/src/`.

## Geklärt

### `Ln:` im Statusreport

- Nur mit `use_line_numbers: true` in der `config.yaml` **und** N-Nummern im G-Code
  (`Report.cpp`, `config->_useLineNumbers`). Beides ist bei dir aus bzw. fehlt: Die Fusion-Posts
  haben keine N-Nummern.
- **Folge:** Die UI verfolgt geometrisch über die Position. Für exakte Zeilen: in Fusion
  „Sequence numbers“ einschalten und `use_line_numbers: true` setzen. Beim Streamen aus der App
  (Stufe 2) sind die Zeilen ohnehin aus den `ok`-Quittungen bekannt.

### Software-Endschalter in FluidNC

- `soft_limits: true` je Achse: Jogs werden **auf den Verfahrweg begrenzt** („Jog constrained to axis
  range“, `Kinematics/Cartesian.cpp`, `constrain_jog`), G-Code-Bewegungen außerhalb lösen Alarm 2
  aus. Das ist genau das gewünschte Verhalten – in der Steuerung, nicht nur in der App.
- Verfahrweg (`Limit.cpp`, `limitsMinPosition`/`limitsMaxPosition`): Referenzfahrt Richtung minus →
  `[mpos_mm, mpos_mm + max_travel_mm]`, Richtung plus → `[mpos_mm − max_travel_mm, mpos_mm]`.
  Mit deiner Config: **X 3 … 1223, Y 3 … 2443, Z −297 … 3** (Maschinenkoordinaten).
- In deiner Config steht überall `soft_limits: false` → siehe Empfehlungen unten.

### Referenziert-Zustand

- Nach erfolgreicher Referenzfahrt sendet FluidNC `[MSG:Homed:XYZ]` (`Machine/Homing.cpp`). Die App
  wertet das aus – egal, ob aus der App, der WebUI oder per Makro referenziert wurde.
- Ein Abfragebefehl für „referenziert“ existiert nicht. Nach Neuverbinden gilt die Maschine für die
  App als nicht referenziert, bis die nächste `Homed`-Meldung kommt.

### `G43 H…` (Werkzeuglängenkorrektur aus Tabelle)

- FluidNC kennt nur `G43.1` und `G49`; `G43` liefert `error:20`, das H-Wort ist nicht vorgesehen
  (`GCode.cpp`). Deine Fusion-Posts schreiben `G0 G43 Z4. H1` – diese Zeile wird abgelehnt.
- Die App markiert das als Fehler „G43 mit H-Wort“.

### `M6` und `M1`

- `M1` (optionaler Halt) wird ignoriert (`GCode.cpp`, „Optional Stop not supported“).
- `M6` wartet nur, bis der Bewegungspuffer leer ist, und fährt dann **ohne Halt** weiter – außer eine
  Spindel hat einen Werkzeugwechsler (`atc:`) oder ein `m6_macro:` (`Spindles/Spindle.cpp`). Deine
  Config hat keine Spindel-Sektion, also auch kein Makro.
- **Folge für die Jobs 1001/1003/1006:** Der Wechsel T1 → T2 läuft ohne Halt weiter, das Schlichten
  liefe mit dem 8-mm-Schaftfräser statt dem 6-mm-Kugelfräser, ohne Längenkorrektur. Die App
  markiert das als Fehler. Abhilfe: Job pro Werkzeug posten (siehe unten).

### Alarm- und Fehlernummern

- Abgeglichen mit `Alarm.h` und `Error.h`: Alarm 11 heißt jetzt „StartupPin“, neu sind 16–18
  (ExpanderReset, GCodeError, ProbeHardLimit); `error:130` = Jog abgebrochen.

### Dateien, SD-Jobs und Einstellungen

- Upload per HTTP: `POST /upload` (SD) bzw. `/files` (Flash) im WebUI-Format (`path`, `myfile[]`,
  Größe in `<name>S`), `WebUI/WebUIServer.cpp`. FluidNC sendet **keine CORS-Header**; die App lädt
  daher als `no-cors`-Anfrage hoch und prüft das Ergebnis mit `$SD/List` über den WebSocket.
- `$SD/List` liefert `[FILE: name|SIZE:n]`, `$SD/Run=/name` startet einen Job. FluidNC quittiert
  `$SD/Run` erst am **Ende des Jobs** (`Job.cpp`); die App sperrt bis dahin weitere Befehle.
- `$HX`, `$HY`, `$HZ` referenzieren einzelne Achsen; `$Bye` startet neu.
- Laufzeit-Einstellungen: `$/axes/x/soft_limits=true` usw. (`Configuration/RuntimeSetting.cpp`),
  `$CD=<datei>` schreibt die laufende Konfiguration, `$Config/Filename` nennt die Startdatei,
  `$LocalFS/Show=<datei>` liest die Originaldatei mit Kommentaren.

### Konfiguration auslesen

- `$CD` (Config/Dump) gibt die laufende Konfiguration als YAML aus (`ProcessSettings.cpp`). Die App
  liest sie damit direkt von der Maschine (_Reiter Einstellungen → Maschine → Maschinenprofil → Von der Maschine lesen_).

### Planer-Werte

- Ohne Eintrag gelten `junction_deviation_mm: 0.01` und `arc_tolerance_mm: 0.002`
  (`Machine/MachineConfig.cpp`). Die Zeitschätzung nutzt diese Werte und die Achswerte aus der Config.

## Empfehlungen für die config.yaml

Nur nach eigener Prüfung an der Maschine übernehmen; vorher die aktuelle Datei sichern.

1. `soft_limits: true` bei `x`, `y` und `z`.
2. `max_travel_mm` auf den **echten** Verfahrweg setzen: 1220 × 2440 ist der V1E-Standard für eine
   4 × 8-ft-Platte, und Z 300 mm ist weit mehr als die LowRider tatsächlich hat. Ein zu großer Wert
   macht die Soft-Limits wirkungslos.
3. Optional `use_line_numbers: true` (mit N-Nummern aus Fusion) für exakte Zeilenverfolgung.
4. `start: must_home: false` bedeutet: Die Maschine fährt auch unreferenziert. Mit Soft-Limits ist
   die Referenzfahrt vor jedem Job Pflicht – entweder diszipliniert oder `must_home: true`.

## Empfehlungen für Fusion 360

- Einen Postprozessor ohne Werkzeuglängenkorrektur (`G43 H`) verwenden, z. B. den Autodesk-Post
  „Grbl“, oder im aktuellen Post die Ausgabe der Längenkorrektur abschalten.
- **Pro Werkzeug eine Datei** posten (T1: Adaptiv + Kontur, T2: Parallel). Dazwischen Werkzeug
  wechseln und Z neu antasten. Stufe 2 bringt dafür den geführten Werkzeugwechsel in der App.

## Noch offen

1. **Mehrere WebSocket-Clients parallel** (App und WebUI gleichzeitig): Test mit zwei
   Browserfenstern, siehe unten.
2. **Upload an der echten Maschine:** Format und Endpunkt sind aus dem Quellcode übernommen; ob der
   `no-cors`-Upload aus einer `file://`-Seite ankommt, zeigt der erste Versuch (die App meldet
   „Upload nicht bestätigt“, wenn die Datei danach nicht auf der SD-Karte liegt).
3. **WebSocket-Port:** 81 (WebUI v2). Prüfen, ob dein Jackpot die WebUI v2 oder v3 hat; die Adresse
   ist in der App frei einstellbar. `$I` zeigt die Version.
4. **Abbrechen eines SD-Jobs:** Die App hält an, wartet auf „Hold:0“ und setzt dann zurück, damit
   die Position erhalten bleibt. An der Maschine prüfen, dass danach kein Alarm „Abort Cycle“ kommt.

5. **Streamen mit Werkzeugwechsel-Halt:** Die App hält vor jedem `M6`, sendet `M5`, fährt Z hoch
   und setzt nach dem Wechsel mit `release()` fort. Prüfen: Wird `M6` danach von FluidNC ohne
   Fehler angenommen (ohne `atc`/`m6_macro` nur Werkzeugnummer)?
6. **`$G` und `$#`:** Formate `[GC:…]` und `[G54:x,y,z]` / `[TLO:z]` sind aus Grbl übernommen und
   im FluidNC-Quellcode so zu erwarten; an der Maschine gegenprüfen (Anzeige unter
   _Einrichten → Nullpunkte_).
7. **`[PRB:…]` vor dem `ok`:** Die Tastzyklen erwarten die Tastmeldung als Antwort auf `G38.2`.
   Bei der ersten Ecke im Protokoll nachsehen.
8. **`$S`-Ausgabe:** Der Einstellungs-Browser erwartet `$Name=Wert` je Zeile.
9. **Upload nach `/files`** (ganze `config.yaml`): Die App prüft per `$LocalFS/Show`, ob die Datei
   angekommen ist; die Sicherung wird vorher genauso geprüft.
10. **Flashen über Web Serial:** Adressen aus den Installationsskripten des Releases (Bootloader
    0x1000, Partitionen 0x8000, boot_app0 0xe000, Firmware 0x10000, 230400 Baud). `littlefs` wird
    nie geschrieben. Erst testen, wenn ein USB-Kabel und die gesicherte Config bereitliegen.
11. **Kollisionsprüfung:** Die Portal-Unterkante ist mit Auskraglänge + 60 mm angenommen
    (`apps/control/src/lib/setup.ts`). An der Maschine messen und eintragen.

### Test „mehrere Clients“

Zwei Browserfenster mit der App verbinden. In einem `$I` in die Konsole schreiben und im anderen das
Protokoll beobachten: Erscheint die Antwort in beiden, teilen sich die Clients die Ausgabe.
