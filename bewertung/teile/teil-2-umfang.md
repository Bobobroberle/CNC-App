# Teil 2 – Umfang: was die Ziele nicht oder selten brauchen

Stand: gelesen wurde `apps/control`, `packages/*`, `apps/companion`, `apps/ios` im Projekt
`…/scratchpad/src/cnc-steuerung` (nur lesen). Vorgaben: `docs/bewertung/02-ziele.md` (Zeilen unten als `Z:nn`
zitiert), `docs/bewertung/01-fakten.md` (`F:nn`). Nicht geöffnet: `CLAUDE.md`, `DESIGN.md`, `docs/umbau-guide.md`.
Alle Pfade unten relativ zu `apps/control/` (Abkürzung `src/` = `apps/control/src/`), Pakete als `packages/…`,
außer wo anders angegeben. Zeilenzahlen sind `wc -l`. „Vermutung“ = nicht belegt.

Zählweise: „exklusiv“ = Datei dient nur diesem Kandidaten; „geteilt“ = wird auch von anderem Code gebraucht und
steht deshalb nicht in der Summe. Die Spalte „Ziele“ stuft den Kandidaten gegen `02-ziele.md` ein.

## Wichtigste Befunde (Kurzfassung)

1. **Sensor/Rattern und Spannmittel/Kollision stehen auf der Kandidatenliste, werden von den Zielen aber verlangt** (`Z:85`, `Z:78-79`). Beide taugen nicht zum Ausblenden; offen ist nur ihr Ort (Spannmittel in ③, Prüfung in ④).
2. **Material ausblenden nimmt die einzige Quelle von Schnittwerten weg**: `Tool` hat keine Schnittwerte (`packages/workshop/src/tools.ts:5-29`), Vorschläge entstehen nur aus Werkzeug und Material (`cutting.ts:37-70`, `store/cam.ts:1019-1033`); die Oberfläche verweist darauf (`JobTools.tsx:254`, `CamCard.tsx:384-391`). Die Start-Prüfung berührt Material nicht.
3. **Die vier Abläufe Serie, Jig, Wenden, Abschnitte sind 8953 Quellzeilen, rund 14 %** des Quellcodes (4120 Unit-Test-, 1610 e2e-Zeilen), und sie wirken an der Start-Prüfung mit (Zustände `block`, `lib/readiness.ts:54-80,199-216`). Sie hängen im selben Ordner aneinander (`store/jigs.ts:35,39`, `store/sections.ts:38,47`, `store/series.ts:28`) und Wenden steckt im CAM-Modell (`store/cam.ts:104-113`): Ausblenden ist billig (ein Eingriff in `Steps.tsx:44-55` plus Einstieg in `CamCard.tsx`), Entfernen nicht.
4. **Der vorhandene Schalter `expertMode` blendet nur Konsole, Konfigurationseditoren und Firmware aus** (`Areas.tsx:133-148`, `App.tsx:125-127`); alles andere ist offen. Ein zweiter Schalter braucht einen dritten Wert in der Suchtabelle (`commands.ts:99,376-383`) und Anpassungen in `commands.test.ts`.
5. **Ausblenden stoppt keine Hintergrundarbeit** (`main.tsx:31-50`): u. a. fragt `startJigs` alle 700 ms das Kamerabild ab (`store/jigs.ts:628-640`), sobald Kamera und Kalibrierung da sind, ohne zu prüfen, ob es Vorrichtungen gibt.

## 1. Gesamtgröße der Oberfläche

| Größe | Wert | Befehl |
|---|---|---|
| Komponenten-Dateien (`src/components`, inkl. `places/`, Hooks `.ts`) | 120 Dateien, 20 662 Zeilen | `find src/components -name '*.ts' -o -name '*.tsx' \| xargs cat \| wc -l` |
| davon die zwei Orts-Dateien | `places/Steps.tsx` 269, `places/Areas.tsx` 202 | `wc -l src/components/places/*` |
| `apps/control/src` gesamt (ts/tsx, mit i18n und `sim/`) | 262 Dateien, 51 915 Zeilen | `find src -name '*.ts' -o -name '*.tsx' \| xargs cat \| wc -l` |
| i18n | `de.ts` 3202, `en.ts` 3131 Zeilen | `wc -l src/i18n/*.ts` |
| CSS | 5151 Zeilen | `cat src/styles/*.css \| wc -l` |
| Stores / lib / ui | 9816 / 9581 / 2063 Zeilen | `cat src/store/*.ts \| wc -l` usw. |
| Pakete (src) | cam 2942, fluidnc-client 1748, gcode-core 3397, workshop 2199; Companion 1527 | `find packages/X/src -name '*.ts' \| xargs cat \| wc -l` |
| Quellcode gesamt (control + Pakete + Companion) | 63 728 Zeilen | Summe der Zeilen oben |
| Tests control | 55 Dateien, 10 697 Zeilen; e2e 14 Dateien, 8964 Zeilen (13 Specs, 144 `test(`) | `cat test/*.ts \| wc -l`; `grep -cE "^\s*test\(" e2e/*.spec.ts` |
| Karten-Marker im JSX | `<Card` 68, `<Fold` 12, `<Section` 6, `<Depth` 7, `data-find=` 104 | `grep -rE '<Card[ >]' src/components \| wc -l` usw. |
| Funktionseinträge der Schnellsuche | 138 Zeilen `^  name(` in `src/lib/commands.ts` (496 Zeilen) | `grep -nE "^  [a-zA-Z]+\(" src/lib/commands.ts \| wc -l` |

Orte: Start + 5 Schritte (`src/store/ui.ts:6` `STEPS`) + 4 Nebenbereiche (`ui.ts:9` `AREAS`: Werkzeugliste, Service,
Einstellungen, Konsole) + Jog-Panel (`ui.ts:113-115`). Zweite Ebene (`ui.ts:28-33` `VIEWS`): Job 2, Einrichten 4,
Service 4, Einstellungen 4 Ansichten.

### Was ein Bediener sieht (Stichprobe aus `Steps.tsx`, `Areas.tsx`)

Statische Zählung der JSX-Zeilen je Ort (Python-Zählung `<Card`, `<Button|HoldButton`, `<Input|NativeSelect|NumberField`,
`<SegmentedControlItem|Checkbox` über die in `Steps.tsx`/`Areas.tsx` eingebundenen Dateien). Das ist eine Näherung:
`.map()`-Schleifen zählen einmal, Dateien wie `ServiceCards.tsx`, `CheckCards.tsx`, `ConnectionCard.tsx` enthalten
mehrere Karten. Die Zeilen „Job“, „Werkzeuge“, „Einrichten“, „Prüfen“ enthalten je einmal `RunBar` (47 Zeilen, 3 Buttons,
`Steps.tsx:62`), die Zeile „Fräsen“ nicht. Gerenderte Zahlen: siehe „Nicht geprüft“.

| Ort | Karten/Bereiche, die rendern (Beleg) | Zeilen der Dateien | Buttons | Eingaben | Schalter |
|---|---|---|---|---|---|
| Job, ohne Programm | JobDashboard, SdCard, JigsCard, RunBar (`Steps.tsx:100-128`) | 790 | 24 | 2 | 0 |
| Job, Programm | JobDashboard, 2-fach-SubNav, WorkpieceCard; Extras: PrepareCard, JigsCard (`Steps.tsx:107-136`) | 401 / 793 | 9 / 24 | 1 / 2 | 1 / 0 |
| Job, Zeichnen (CAM) | JobDashboard, CamCard samt CamAdd, CamArrange, CamSides, Serien-Einstieg (`Steps.tsx:97-105`; `CamCard.tsx:238-253,356,527`) | 1995 | 41 | 36 | 7 |
| Werkzeuge | JobToolsCard, „Mehr Optionen“ mit CuttingAdvisor (`Steps.tsx:147-148`) | 437 | 13 | 3 | 0 |
| Einrichten (4 Ansichten) | Null: SetZeroCard, ZeroHistory, Spannmittel-Karte, „Mehr Optionen“ (ZeroCard, WcsCard, Alle: SavedZeros); Antasten; Kamera (+Löcher, Photomap, Aufzeichnung); Ausrichten (+Autolevel) (`Steps.tsx:177-219`) | 773 / 219 / 740 / 347 | 18 / 6 / 19 / 8 | 5 / 0 / 5 / 4 | 5 / 0 / 5 / 1 |
| Prüfen | ReadinessCard, „Mehr Optionen“ (Simulation, WorkspaceCheck), „Alle Parameter“ (Diagnose) (`Steps.tsx:234-247`) | 561 | 23 | 0 | 2 |
| Fräsen | RunScreen, „Mehr Optionen“ (RunCard, SdCard), „Alle“ (ResumeCard) (`RunScreen.tsx:263,392`) | 681 | 11 | 1 | 1 |
| Werkzeugliste | ToolLibrary, MaterialLibrary, CuttingAdvisor (`Areas.tsx:40-44`) | 513 | 12 | 6 | 3 |
| Service (4 Ansichten) | Diagnose 4 Karten, Meldungen, Verlauf 2, Kalibrieren 2 (`Areas.tsx:77-97`) | 695 / 350 / 619 | 16 / 5 / 10 | 4 / 0 / 8 | 4 / 1 / 3 |
| Einstellungen | Verbindung 3 Karten (`Areas.tsx:151-157`); Maschine: Darstellung, Profil (4 Karten), Werkstatt (2), Makros, Experten-Schalter (`:158-180`); Kamera; Experte 4 (`:182-189`) | 753 / 944 / 209 / 635 | 18 / 19 / 5 / 16 | 3 / 8 / 3 / 4 | 5 / 6 / 3 / 4 |
| Konsole | ConsoleCard (`Areas.tsx:196-201`) | – | – | – | – |

Fazit Umfang: „Einrichten“ hat 4 Ansichten mit zusammen 39 Buttons, 14 Eingaben und 11 Schaltern (statisch, ohne
RunBar, 1891 Zeilen in 12 Dateien); „Zeichnen“ ist mit 1995 Zeilen und 36 Eingabefeldern (statisch) der dichteste Ort. Das Ziel „zu viele Karten und Optionen“ (`Z:28-29`) lässt
sich an den Zahlen nachvollziehen, ist aber nicht an der Maschine gemessen.

### Ziele ausdrücklich verlangt, aber als Karte in einem anderen Bereich

| Verlangt (Ziele) | Wo es liegt | Beleg |
|---|---|---|
| Kamera ausschaltbar (`Z:60`) | nur Einstellungen → Kamera; in Einrichten → Kamera gibt es nur „Kamera einschalten“ | `components/CameraSetupCard.tsx:52` (`setSource(on ? null : next)`), `CameraCard.tsx:45`; `rg -n "setSource\(\|source: null" src`: sonst nur Demo und Anfangswerte (`store/demo.ts:56,190`, `store/camera.ts:111`, `store/workshop.ts:139`) |
| Rattern warnen (`Z:85`) | Schritt Fräsen (`SensorPanel`), unsichtbar ohne Pi-Sensor; Einstellungen (Zielwerte) in Maschine → Werkstatt, gemischt mit Benachrichtigungen | `RunScreen.tsx:261-262`, `SensorPanel.tsx:15`, `NotifySettingsCard.tsx:91-110` |
| Spannmittel/Kollision-Prüfung (`Z:78-79`) | Spannmittel setzen in Schritt ③ Einrichten → Null; angezeigt als Warnung in ④ Prüfen | `Steps.tsx:193-195`, `lib/readiness.ts:217-233` |
| Simulation, Verfahrweg als Prüfungen (`Z:78-79`) | hinter „Mehr Optionen“ in ④ Prüfen | `Steps.tsx:237-246` |
| Sprache, hell/dunkel (`Z:31`) | Einstellungen → Maschine (Darstellung `Areas.tsx:160`; Sprache in WorkshopSettingsCard) | `Areas.tsx:106-122`, `WorkshopSettingsCard.tsx:71-79` |
| Park-Position, Nullpunkt anfahren (`Z:71-72`) | Schnellaktionen im Jog-Panel (Null, Park, Referenz); Park setzen hinter „Mehr Optionen“ des Jog-Panels | `JogCard.tsx:374-376`, `JogPanel.tsx:88-96` |
| Werkzeugwechsel-Position (`Z:71`) | nur als Einstellung (Werkstatt), kein Knopf in den Schnellaktionen | `WorkshopSettingsCard.tsx:25-26,144`, `JogCard.tsx:374-376` |
| eigene Merkpunkte (`Z:72`) | nicht gefunden: `rg -n -i "merkpunkt\|bookmark\|waypoint" src` ohne Treffer | – |
| Referenzfahrt empfehlen (`Z:16`) | Warnung in der Prüfliste (`homed` = warn, nie block) und Knopf in „Mehr Optionen“ des Jog-Panels | `lib/readiness.ts:155-161`, `JogPanel.tsx:93` |
| Gleich-/Gegenlauf je Bearbeitung (`Z:53`) | ein Schalter für die ganze Zeichnung, im Einklapper „Erweitert“ | `CamCard.tsx:393,465-468`, `store/cam.ts:295`, `F:60` |
| Schnittwerte je Werkzeug (`Z:54`) | gibt es nicht: `Tool` hat keine Vorschub-/Drehzahl-/Zustellfelder; Vorschlag nur aus Werkzeug x Material | `packages/workshop/src/tools.ts:5-29`, `cutting.ts:37-70` |
| Update-Knopf für den Pi (`Z:92`) | in `CompanionCard` nichts dergleichen: `grep -n -i "update\|setup.sh\|scp" src/components/CompanionCard.tsx` ohne Treffer; `rg -n -i "aktualisier\|update\|setup\.sh" src/components src/i18n/de.ts` findet nur Firmware-Texte und Hinweise auf Neuinstallation per `setup.sh` (`i18n/de.ts:894,897,2872`) | kein Update-Knopf gefunden |

## 2. Vorhandene Ausblend-Mechanismen

| Mechanismus | Wo | Was er ausblendet | Was nicht |
|---|---|---|---|
| `expertMode` (Einstellung, Standard aus) | Feld `src/store/workshop.ts:91`, Default `:145`; Schalter `ConnectionCard.tsx:349-364`; Auswertung `App.tsx:125-127`, `NavRow.tsx:22-25`, `Areas.tsx:133-148,182-189`, `Find.tsx:98`, `store/find.ts:85`, `lib/commands.ts:356-360` | Konsole (Ort), Ansicht „Experte“ in Einstellungen (ConfigEditor, ConfigFileEditor, SettingsBrowser, FirmwareCard), zugehörige Suchtreffer | alles andere: Material, Serie, Vorrichtung, Wenden, Abschnitte, Kalibrierung, Autolevel, Makros, Benachrichtigungen, Aufzeichnung. `LogCard` (rohes Protokoll) steht ohne Schalter in Service → Diagnose (`Areas.tsx:82`) |
| `Depth` („Mehr Optionen“/„Alle Parameter“) | `src/components/Depth.tsx:13-47`, Zustand `store/ui.ts:71-80`, je Ort gemerkt; verwendet an 7 Stellen: `Steps.tsx:148,196,237`, `RunScreen.tsx:263,392`, `WorkpieceCard.tsx:60`, `JogPanel.tsx:88` | klappt Teile einer Karte zu (Standard „simple“) | ist kein Schalter für Funktionen, nur Faltung; andere Karten (JigsCard, FlipCard, Recording, Material) liegen offen |
| `Fold` | 12 Stellen, z. B. `CamCard.tsx:393`, `SeriesCard.tsx:181`, `FlipCard.tsx:119` | Einzelnes zuklappen | – |
| Selbst-Ausblenden bei Nichtgebrauch | `FlipCard.tsx:63` (kein Plan), `SectionsCard.tsx:166` (kein Job/keine Ablehnung), `JigCard.tsx:130`, `SensorPanel.tsx:15` (kein Sensor), `Readiness` zeigt Zeilen nur wenn die Eingabe gesetzt ist (`lib/readiness.ts:199-216`) | die Ablauf-Karten Wenden/Abschnitte/Vorrichtung sowie Sensoranzeige, solange nichts davon läuft | `JigsCard` (immer: `Steps.tsx:126,133`), Serien-Einstieg (`CamCard.tsx:527-545`), CamSides-Häkchen (`CamCard.tsx:356`, `CamSides.tsx:46-53`), `RecordingPanel` (`CameraCard.tsx:77-79`), MaterialLibrary (`Areas.tsx:42`), WorkpieceCard-Materialwahl (`WorkpieceCard.tsx:34-48`) |
| `panelHidden` (Großbild), `jogOpen` | `ui.ts:136-138`, `:113` | nur Panel/Jog | – |
| Schnellsuche-`needs` | `CommandNeed` = `program`/`expert` (`commands.ts:99`, `NEED_FALLBACK` `:376-383`, `needMet` `:447-449`) | leitet bei fehlender Voraussetzung auf eine Ersatzstelle | ein weiterer Schalter bräuchte hier einen dritten Wert plus Eintrag in `store/find.ts:85-95` und die Prüfung `commands.test.ts:230-253,363-376` |
| Standard „aus“ bei Hintergrunddiensten | `settings.recording.auto:false` (`workshop.ts:158`), `notifyBrowser:false` (`:130`), `adaptive.enabled:false` (`:132`), Browser-Zeitraffer `enabled:false` (`store/timelapse.ts:19`) | Funktion läuft nicht, die Oberfläche zeigt sie trotzdem | – |

Hintergrund-Dienste laufen unabhängig von jeder Oberfläche: `main.tsx:31-50` startet `startNotifications`,
`startSensorLink`, `startTimelapseRecorder`, `startRecordingLink`, `startClamps`, `startSeries`, `startJigs`,
`startSections`, `startFind`. Auffällig: `startJigs` fragt alle 700 ms das Kamerabild auf Marker ab, sobald die Kamera an,
kalibriert und die Maschine ruhig ist (`store/jigs.ts:628-640`, `liveTags` `:164-186`). Dort gibt es keine Prüfung auf
vorhandene Vorrichtungen (Beleg: Zeilen 164-186 und 631-640 enthalten keine). Ein reines Ausblenden der Karten
würde diese Hintergrundarbeit also nicht abstellen (Vermutung zur Last: nicht gemessen).

Wie Start-Prüfung und Schritt-Zustände an den Kandidaten hängen: `ReadinessId` (`lib/readiness.ts:13-30`) enthält
`flip`, `sections`, `series`, `jig`, `clamp`, `collisions`; `STEP_OF` ist ein erschöpfender `Record<ReadinessId, StepId>`
(`lib/steps.ts:15-33`), `useReadiness` (`store/readiness.ts:43-191`) liest dafür die Stores flip, jigs, sections, series;
`useStart` sperrt den Start bei `blockers(...)` (`store/start.ts:91,105-108`). `material` kommt in
`lib/readiness.ts`, `lib/startChecks.ts`, `store/readiness.ts`, `store/start.ts`, `store/steps.ts`, `lib/steps.ts`,
`lib/jobChecks.ts` nicht vor (`rg -n -i material` über diese sieben Dateien: keine Treffer).

## 3. Kandidatentabelle

Spalte „Ziele“: **verlangt** = ausdrücklich gewünscht; **selten** = Ziele sagen selten/versteckbar; **nicht verlangt** =
ausdrücklich nicht; **nicht erwähnt** = steht nicht in den Zielen (Einordnung ist Vermutung).

### 3a. Umfang

| # | Kandidat | Ziele | Quellcode exklusiv (Zeilen) | Tests: Unit / e2e (Zeilenbereich) | i18n de/en (Zeilen) |
|---|---|---|---|---|---|
| 1 | Material, Material-Vorschläge, Lernmodell | nicht verlangt (`Z:11-12`) | `components/MaterialLibrary.tsx` 181, `CuttingAdvisor.tsx` 88, `packages/workshop/src/materials.ts` 118, `cutting.ts` 112 = 499 (in `cutting.ts` ist `SpindleLimits` `:4-10` geteilt: `store/workshop.ts:18,75`, Prüfliste `limits`) | `packages/workshop/test/library.test.ts:69-162` (Material, Schnittwerte, Lernen, 14 Tests in der Datei); e2e `control.spec.ts:790-812`, `:838-890` (Werkstück-Assistent, gemischt mit Maß), `steps.spec.ts:362-363,494-499`; Unit `test/cam.test.ts:274-295` (suggest) | `materials` 21/21, `cutting` 19/19, `assistant` 23/22 (gemischt) |
| 2 | Serien auf Rohlingen | indirekt: Jobs sind Einzelstücke (`Z:13`) | `lib/series.ts` 414, `lib/blanks.ts` 779, `store/series.ts` 462, `components/SeriesCard.tsx` 514 = 2169 | `test/series.test.ts` 398 (15), `test/blanks.test.ts` 325 (17); e2e `series.spec.ts` 336 (2), `ipad.spec.ts:1156-1232` | `series` 115/115 |
| 3 | Vorrichtungen mit Markern, Jigs | nicht erwähnt (Einordnung laut Auftrag; `Z:13` nur indirekt) | `lib/jigs.ts` 230, `lib/tagFinder.ts` 720, `store/jigs.ts` 673, `JigCard.tsx` 225, `JigsCard.tsx` 393, `TagSheet.tsx` 193, `packages/workshop/src/jigs.ts` 361, `tags.ts` 234 = 3029 (geteilt: `lib/markers.ts` 144, siehe unten) | `test/jigs.test.ts` 324 (16), `tagFinder.test.ts` 238 (16), `tagPicture.ts` 126 (Hilfsdatei), `packages/workshop/test/jigs.test.ts` 384 (15), `tags.test.ts` 189 (13); e2e `jigs.spec.ts` 502 (4); `test/i18n.test.ts:171-187` | `jigs` 150/146 |
| 4 | Wenden, beidseitig | nicht erwähnt (Einordnung laut Auftrag; `Z:13` nur indirekt) | `lib/flip.ts` 89, `store/flip.ts` 354, `FlipCard.tsx` 275, `FlipPicture.tsx` 74, `CamSides.tsx` 131, `packages/cam/src/flip.ts` 332 = 1255 | `test/flip.test.ts` 158 (9), `packages/cam/test/flip.test.ts` 475 (18); e2e `flip.spec.ts` 340 (2); `i18n.test.ts:215-222` | `flip` 131/130 |
| 5 | Abschnitte für Teile länger als der Tisch | nicht erwähnt (Einordnung laut Auftrag; `Z:13` nur indirekt) | `lib/sections.ts` 340, `store/sections.ts` 669, `SectionsCard.tsx` 464, `useSectionsOverlay.ts` 132, `packages/gcode-core/src/sections.ts` 707, `packages/workshop/src/sections.ts` 188 = 2500 | `test/sections.test.ts` 482 (16), `packages/gcode-core/test/sections.test.ts` 839 (15), `packages/workshop/test/sections.test.ts` 182 (10); e2e `sections.spec.ts` 432 (2); `i18n.test.ts:188-214` | `sections` 138/135 |
| 6 | Einmessen der Maschine (Wiederholprobe, Kalibriertafel) | selten, darf versteckt sein (`Z:85-86`) | `CalibrationWizard.tsx` 242, `AccuracyCheck.tsx` 236, `CorrectionPanel.tsx` 141 = 619; Dokument `docs/kalibrierung.md` 97, `docs/kalibriertafel.svg` 19. Geteilt: `store/calibration.ts` 422, `packages/workshop/src/calibration.ts` 326 | `test/calibration.test.ts` 183 (8), `packages/workshop/test/calibration.test.ts` 260 (14) – beide teils geteilt; e2e `control.spec.ts:2067-2122`, `:2210-2257` (Simulator, gemischt), `:2693-2734` | `calibration` 79/77, `accuracy` 37/37 |
| 7 | Sensor/Rattern (Chatter) | **verlangt** (`Z:85`) | `store/sensors.ts` 99, `SensorPanel.tsx` 51, `packages/workshop/src/chatter.ts` 115, Companion `apps/companion/src/sensors.ts` 108 = 373 | `test/sensors.test.ts` 45 (1), `packages/workshop/test/sensors.test.ts` 103 (10); e2e `control.spec.ts:1207-1256` | `sensors` 10/10 |
| 7b | Adaptiver Vorschub nach Spindellast | nicht verlangt (Spindel nur Ein/Aus `Z:15`; Last braucht Sensor am Spindelumrichter, Vermutung) | `packages/workshop/src/adaptive.ts` 74; Teile in `SensorPanel.tsx:36-48`, `NotifySettingsCard.tsx:91-110`, `store/sensors.ts:40-47` | e2e `control.spec.ts:1207` (gemischt mit Chatter); Teil von `workshop/test/sensors.test.ts` | in `sensors`/`notify` |
| 8 | Firmware-Flash (esptool) | nicht erwähnt; nur der Abruf der Release-Liste braucht Internet (`lib/firmware.ts:32-34`, `FirmwareCard.tsx:143`), eine lokal gewählte Zip nicht (`FirmwareCard.tsx:136-160`); Werkstatt ohne Internet (`Z:10`) | `FirmwareCard.tsx` 241, `lib/firmware.ts` 51, `packages/fluidnc-client/src/flash.ts` 55 = 347; Abhängigkeiten `esptool-js` 0.7.0, `fflate` 0.8.3 (`package.json:27-28`; `fflate` nur in `lib/firmware.ts`: `rg -l fflate apps/*/src packages/*/src`) | `packages/fluidnc-client/test/extras.test.ts:156-189` (Flash-Layout); e2e `control.spec.ts:891-921` | `firmware` 33/32 |
| 9 | Timelapse/Aufzeichnung | nicht erwähnt (live zuschauen ist verlangt, `Z:58`; Aufzeichnen nicht) | `store/recording.ts` 150, `store/timelapse.ts` 67, `lib/timelapse.ts` 75, `RecordingPanel.tsx` 267 = 559; Companion `apps/companion/src/recorder.ts` 563 | `test/recording.test.ts` 121 (4); Companion `test/recorder.test.ts` 346, `recorderRig.ts` 126; e2e `control.spec.ts:1639-1759`, `:1760-1774` | `recording` 52/52 |
| 10 | Spannmittel/Clamps | **verlangt** als Prüfung (`Z:78-79`) | `ClampTool.tsx` 133, `FixturesEditor.tsx` 189, `store/clamps.ts` 84, `lib/clamps.ts` 208 = 614 (geteilt: `packages/gcode-core/src/collision.ts` 269, allgemeine Kollisionsprüfung) | `test/clamps.test.ts` 139 (7), `packages/gcode-core/test/machining.test.ts:168-332` (Kollision + Spannmittel); e2e `control.spec.ts:2990-3105`, `ipad.spec.ts:472-560` | `fixtures` 24/24, `collision` 7 |
| 11 | Autolevel (Höhenkarte) | nicht erwähnt | `AutolevelCard.tsx` 154, `packages/gcode-core/src/autolevel.ts` 154 = 308 (`HeightMap`, nur von `AutolevelCard.tsx:1` und Tests benutzt; `heightfield.ts` ist die Abtrag-Simulation und gehört nicht dazu, `Stage3D.tsx:1,321`) | `packages/gcode-core/test/machining.test.ts:333-` (describe `autolevel`); e2e `control.spec.ts:990-1033` | `autolevel` 15/15 |
| 12 | Konsole/Expertenmodus | nicht erwähnt als Konsole; allgemein gilt „selten → Schalter“ (`Z:30`) | `ConsoleCard` (`ConnectionCard.tsx:261-347`) 87, `ExpertSwitch` (`:349-364`) 16, `ConfigEditor.tsx` 146, `ConfigFileEditor.tsx` 124, `SettingsBrowser.tsx` 124, `lib/configChanges.ts` 56, `lib/configCheck.ts` 88 = 641. Geteilt: `LogView.tsx` 42, `LogCard`, `packages/fluidnc-client/src/configEdit.ts` 125 (auch `store/machine.ts`, `store/limits.ts`, `store/calibration.ts`) | `test/config.test.ts` 144 (8), `test/configChanges.test.ts` 50 (3); e2e `control.spec.ts:490,695,750,2225` (je mit `expert()`-Helfer `:74-82`) | `console` 7/7, `config` 25/24, `configFile` 21/21, `settingsBrowser` 10/10, `settingsHelp` 37/36 |
| 13 | Makros | nicht erwähnt | `store/macros.ts` 18, `lib/macros.ts` 49, `MacroButtons.tsx` 26, `MacroEditor.tsx` 76 = 169 (geteilt: `store/machine.ts:53,214,799-806` `runMacro`; `ProfileShareCard`/`share.ts`) | `test/prepare.test.ts:55-` (macros-Block); e2e `control.spec.ts:447` (**gemischt**: Nullpunkt, Z-Antasten, Makros) | `macros` 13/13 |
| 14 | Schnellsuche (Find) | nicht erwähnt (die Leertaste-Pause ist verlangt, `Z:81`; ihr Code liegt aber getrennt in `store/keys.ts:41-66`, nur ihr Test in `find.spec.ts:395`) | `Find.tsx` 377, `store/find.ts` 178, `lib/search.ts` 154, `lib/commandSearch.ts` 63, `lib/commands.ts` 496, `styles/find.css` 168 = 1436. Geteilt: `lib/reveal.ts` 90 (auch `Readiness.tsx:3`, `StartScreen.tsx`, `Fold.tsx`), `lib/shortcuts.ts` 392 (auch `store/keys.ts:3`). Im Find-Paket stecken außerdem das „?“-Blatt der Tastenkürzel (`Find.tsx:329-337`) und die Ansichtstasten (`store/find.ts:142-173`) | `test/search.test.ts` 148 (16), `test/commands.test.ts` 513 (24); e2e `find.spec.ts` 563 (8, davon `:280,395,515,543` Tastenkürzel/PAUSE), `ipad.spec.ts:1233` | `find` 325/293 |
| 15 | iOS-App (nativ) | nicht erwähnt (`Z:8` nennt nur das iPad als Gerät; Einordnung laut Auftrag) | `apps/ios/README.md` 48 Zeilen, kein Code | keine | – |
| 16 | Benachrichtigungen | nicht erwähnt (Meldungen nur Störungen, `Z:84` meint Oberfläche) | `store/notify.ts` 62, `NotifySettingsCard.tsx` 142 (enthält auch Adaptiv, siehe 7b), Companion `notify.ts` 71 = 275 | Companion `units.test.ts`; `test/motion.test.ts:85-95` (Client) | `notify` 16/16 |
| 17 | Handy-Ansicht (Monitor) | nicht verlangt (`Z:8-9`) | `Monitor.tsx` 150; Zweig `App.tsx:40-41,131,181-183` | e2e `ipad.spec.ts:1132-1155` | `monitor` 8 (`de.ts:286-293`) |
| 18 | Gamepad und Bildschirm-Handrad | Handrad/Gamepad „nicht verlangt“ (`Z:69`, gemeint ist Hardware); Bildschirm-Handrad nicht erwähnt (Einordnung laut Auftrag) | `useGamepadJog` (`JogCard.tsx:216-276`) ca. 60, `JogWheel.tsx` 122 | keine Treffer: `rg -i "gamepad\|jogwheel" e2e test` zeigt nur Mausrad/Kürzel (`test/jog.test.ts:47`, `shortcuts.test.ts:42`) | `drive.gamepad` `de.ts:747` |
| 19 | Rotations-Jog (A-Achse) | nicht erwähnt in den Zielen; die Maschine hat keine A-Achse (`F:22`) | `RotaryJog` (`JogCard.tsx:128-150`), Zweig `:490` (`profile.hasRotary`) | e2e `control.spec.ts:237-247` (A-Achsen-Bewegung wird gemeldet) | – |
| 20 | Simulator-Karte / Demo | nicht erwähnt (Entwicklungshilfe) | `SimulatorCard.tsx` 220 (`Areas.tsx:154`), `sim/index.ts` 633, `sim/simulator.ts` 1135, `store/demo.ts` 302, `demoMap.ts` 23, `lib/demo.ts` 152 | Unit `simulator.test.ts` 504, `demo.test.ts` 85; **die e2e laufen gegen den Simulator** (`F:47`) | `sim` 41, `demo` 12 |
| 21 | Profil teilen (Community-Datei) | nicht erwähnt | `ProfileShareCard.tsx` 94, `packages/workshop/src/share.ts` 110 | `packages/workshop/test/share.test.ts` 147, `test/profiles.test.ts` 52; e2e `control.spec.ts:813-837` | `share` 19/19 |
| 22 | Antast-Assistenten für Ecke/Kante und Eckplatte | Z-Antasten ist verlangt (`Z:63-64`); XY-Ecke nicht erwähnt | `ProbeWizard.tsx` 415, `ProbeCard.tsx` 138, `lib/corner.ts` 294; `cornerPlate` in `workshop.ts:98,147`; `ProbeTiles.tsx` 172 ist die Einrichten-Ansicht | `test/corner.test.ts` 173 (7); e2e `control.spec.ts:618-649`, `:1373-1400` | `probe` 22, `probeWizard` 65, `probeTiles` 16 |

Summe der vier Ablauf-Funktionen Serie, Jig, Wenden, Abschnitte (Kandidaten 2 bis 5; die Ziele erwähnen sie nicht, die Einordnung als „nicht gebraucht“ folgt dem Auftrag und dem Hinweis „Einzelstücke“, `Z:13`): Quellcode exklusiv 2169 + 3029 +
1255 + 2500 = **8953 Zeilen**, das sind rund 14 % der 63 728 Quellzeilen; Unit-Tests 723 + 1261 + 633 + 1503 = 4120
Zeilen; e2e 336 + 502 + 340 + 432 = 1610 Zeilen (2 + 4 + 2 + 2 = 10 Tests in vier Specs); i18n de 534 / en 526 Zeilen.
Befehle: `wc -l` der genannten Dateien; Summen von Hand.

### 3b. Berührungspunkte

| # | Importer / geteilte Zustände | Start-Prüfung („Start gesperrt“) | Sichtbarkeit, wenn ungenutzt |
|---|---|---|---|
| 1 Material | `MaterialLibrary` ← `Areas.tsx:42`; `CuttingAdvisor` ← `Areas.tsx:43`, `Steps.tsx:148`; `suggestCutting` in `JobTools.tsx:154-159`, `store/cam.ts:1019-1033`; Zustand `setup.materialId` (`workshop.ts:163,223,368`), `materials`, `learning` (`:236-241,351,360-365`); `recorder.ts:86-88`, `HistoryCard.tsx:17,79`, `StartScreen.tsx:146-159`, `ProfileShareCard.tsx:22-67`, Suche `commands.ts:234,308` | nein (keine Treffer, siehe §2) | Karte `setup-material` immer, wenn ein Programm geladen (`Steps.tsx:129`); Werkzeugliste immer. **Erzwingen**: ohne Material zeigt die Werkzeugzeile „Für einen Vorschlag erst das Material wählen“ (`JobTools.tsx:254`) und der CAM-Knopf ist gesperrt (`CamCard.tsx:384-391`); der Start bleibt frei |
| 2 Serie | `SeriesCard` ← `CamCard.tsx:27,282`; `lib/series` ← `store/cam.ts:81` (`textBlockCentre`), `store/jigs.ts`; `store/series` ← `CamCard`, `SimulatorCard`, `TableView`, `main.tsx:19,42`, `store/jigs.ts:39`, `store/readiness.ts:19` (gleicher Ordner); `store/series.ts` selbst importiert `./flip` (`:28`), `./calibration`, `./photomap`, `./settle`, `../sim`; `lib/blanks.ts` ← nur `lib/series.ts`; Zustände `useSeries.made` (readiness), `useCalibration.grabFrame` (`store/series.ts:25`) | **ja**: `seriesMoved`/`seriesTurned` blockieren (`readiness.ts:206-214`, Eingabe `store/readiness.ts:164-178`), `STEP_OF.series` = job (`lib/steps.ts:18`) | Einstiegskarte `series-entry` immer in der Zeichnung (`CamCard.tsx:527-545`) |
| 3 Jig | `JigCard` ← `Steps.tsx:52`, `JigsCard.tsx`, `Readiness.tsx`, `SectionsCard.tsx`; `JigsCard` ← `Steps.tsx:126,133`; `store/jigs` ← `CameraView`, `TableView`, `Readiness`, `SectionsCard`, `main.tsx:43`, `store/readiness.ts:15`, `store/sections.ts:47` (gleicher Ordner); `lib/jigs` ← auch `lib/readiness.ts:3` und `lib/sections.ts:21` (nur Typen), `store/sections.ts`; `lib/tagFinder` ← nur `lib/jigs.ts`; `store/jigs.ts` importiert `./flip` (`:35`) und `./series` (`:39`); `lib/markers.ts` (144) ← `lib/blanks.ts`, `lib/corner.ts`, `lib/measure.ts`, `store/camera.ts`, `store/calibration.ts`, `store/jigs.ts` (geteilt mit Messen und Antasten); `store/jigs.ts` nutzt `calibration`, `photomap`, `series`; Persistenz `workshop.ts:186,353`, Companion-Sammlung `jigs` (`apps/companion/src/server.ts:26`) | **ja**: `jigUnmeasured/jigMoved/jigZeroMoved/jigTurned` blockieren (`readiness.ts:64-70,216`), `STEP_OF.jig` = setup | `JigsCard` immer sichtbar (`Steps.tsx:126,133`); `JigCard` nur bei erkanntem Marker (`JigCard.tsx:130`); Hintergrundabfrage 700 ms (`store/jigs.ts:628-640`) |
| 4 Wenden | `FlipCard` ← `Steps.tsx:48`; `store/flip` ← `CamCard.tsx:16`, `FlipCard`, und im gleichen Ordner `store/cam.ts:85`, `store/jigs.ts:35`, `store/sections.ts:38`, `store/series.ts:28`, `store/readiness.ts:14`; `store/flip.ts:17` importiert `./holes`; `lib/flip` ← `store/cam.ts:83`, `store/readiness.ts:4`, `lib/readiness.ts:1` (Typ); **im CAM-Modell**: `TwoSided` (`store/cam.ts:104-113,133,161`), `setTwoSided` (`:261,983-1015`), `flipNotes` (`:176`), Hinweise `CamCard.tsx:45-62,486-501`; Persistenz `lowrider-control.flip` (`store/flip.ts:24`) | **ja**: `flipFront/Turn/Locate` blockieren (`readiness.ts:54-61,199`), `STEP_OF.flip` = setup; `blocksFlip` hält die Übergabe an (`CamCard.tsx:501`) | Häkchen „beidseitig“ immer in „Wie“ der Zeichnung (`CamCard.tsx:356`, `CamSides.tsx:47-53`); `FlipCard` nur mit Plan (`FlipCard.tsx:63`) |
| 5 Abschnitte | `SectionsCard` ← `Steps.tsx:50`; `useSectionsOverlay` ← `TableView`; `store/sections` ← `JigCard`, `Readiness`, `SectionsCard`, `main.tsx:44`, `store/readiness.ts:18`; `store/sections.ts` importiert `./flip` (`:38`), `./jigs` (`:47`), `../sim` (`:35`); `lib/sections` ← `lib/readiness.ts:4` (Typ); Persistenz `lowrider-control.sections` (`store/sections.ts:56`); Angebot in der Prüfliste (`Readiness.tsx:85-99`) | **ja**: `sections*` blockieren (`readiness.ts:73-80,201-204`); der Verfahrweg-Block nennt sogar den Ausweg (`outsideLong`, `:184`), Wahl über `store/readiness.ts:119-129` | `SectionsCard` nur mit Job (`SectionsCard.tsx:166`); Hinweis erscheint nur, wenn das Teil über den Tisch ragt |
| 6 Kalibrierung | `CalibrationWizard`, `AccuracyCheck` ← `Areas.tsx:94-95`; `CorrectionPanel` ← beide; `store/calibration.ts` ← `store/holes.ts`, `store/jigs.ts`, `store/series.ts` (gleicher Ordner), `HolePanel`, `JigCard`, `FlipCard`, `useLiveMarker` (`centreLoop`, `grabFrame`, `detectMarker` = Weg der Kamera-Nullung auf Loch/Marker); `store/settle.ts` (38 Zeilen) ← `store/calibration`, `flip`, `jigs`, `photomap`, `sections`, `series`, `ServiceCards`; `packages/workshop/src/calibration.ts`: `twoHoleAlignment` (`:255`) ← `lib/flip.ts`, `store/holes.ts`, `HolePanel` | nein | eigene Ansicht „Kalibrieren“ in Service (`Areas.tsx:73,92-97`) |
| 7 Sensor | `SensorPanel` ← `RunScreen.tsx:28,262`; `store/sensors` ← `StatusBar.tsx:25`, `LiveTiles.tsx:6`, `NotifySettingsCard.tsx:6`, `main.tsx:8,36`; `observeSensors` → `store/recorder.ts:42-48`; WebSocket-Wiederholung alle 5 s (`sensors.ts:81-88`) | nein | `SensorPanel` rendert nichts ohne Sensorverbindung (`SensorPanel.tsx:15`) |
| 8 Firmware | `FirmwareCard` ← `Areas.tsx:187` (nur Experte); dynamischer Import `esptool-js` (`FirmwareCard.tsx:74`); Release-Abruf `https://api.github.com/…` (`lib/firmware.ts:32-34`, `FirmwareCard.tsx:143`) – nur dieser Knopf braucht Internet, die lokale Zip-Wahl nicht (`FirmwareCard.tsx:136-160`) | nein | schon hinter `expertMode` (`Areas.tsx:182-189`) |
| 9 Aufzeichnung | `RecordingPanel` ← `CameraCard.tsx:77-79` (Abschnitt in Einrichten → Kamera); `store/recording` ← `RecordingPanel`, `main.tsx:18,40`; `timelapse` ← `CameraSetupCard`, `RecordingPanel`, `main.tsx:20,38`; `store/timelapse.ts` importiert `./recording` (gleicher Ordner); Einstellung `recording` (`workshop.ts:64-72,158`) | nein | Abschnitt immer sichtbar (`CameraCard.tsx:77-79`, ohne Bedingung), die Funktion selbst standardmäßig aus (`workshop.ts:158`, `timelapse.ts:19`) |
| 10 Clamps | `store/clamps` ← `CameraView`, `ClampTool`, `FixturesEditor`, `Stage3D`, `StageTools`, `TableView`, `main.tsx:9,41`, `store/readiness.ts:13`; `lib/clamps` ← `store/cam.ts:80`, `store/demo.ts`, `store/tools.ts`, `store/workshop.ts:30`; `setup.fixtures` (`workshop.ts:171`) | **ja, als Warnung**: `clamp`, `collisions` (`readiness.ts:217-233`), `STEP_OF.clamp` = check | `FixturesEditor` immer in Einrichten → Null (`Steps.tsx:193-195`) |
| 11 Autolevel | `AutolevelCard` ← `Steps.tsx:214`; Suche `commands.ts:276`; Companion-Sammlung `heightmaps` (`server.ts:31`) | nein | nur Ansicht „Ausrichten“ mit Programm (`Steps.tsx:210-219`) |
| 12 Konsole/Experte | siehe §2; Schnellsuche `commands.ts:356-372` | nein | **bereits ausgeblendet** |
| 13 Makros | `MacroButtons` ← `JogPanel.tsx:94` (in „Mehr Optionen“), `MacroEditor` ← `Areas.tsx:176`; `store/machine.ts:799-806`; Standardmakros „Z hoch“, „Zum Nullpunkt XY“ (`lib/macros.ts:10-13`) wiederholen teils die Schnellaktionen Null/Park (`JogCard.tsx:374-376`) | nein | im Jog-Panel gefaltet, in Einstellungen offen |
| 14 Schnellsuche | `FindButton` ← `NavRow.tsx:19,68`; `FindLayer` ← `App.tsx:9,251`; `store/find` ← `main.tsx:11,45`; die „?“-Tastenhilfe wird in `Find.tsx:329-337` gezeichnet (Eintrag `shortcuts`: `commands.ts:199-202`, `store/find.ts:71`); die globalen Tastenkürzel (Strg+K, „/“, Ansichten, nächster Schritt) laufen in `store/find.ts:142-173`; Leertaste = PAUSE und Esc = Abbrechen-Frage liegen **nicht** hier, sondern in `store/keys.ts:41-66` (mit `lib/shortcuts.ts`); 104 `data-find`-Anker in Komponenten; Prüfungen `test/commands.test.ts:119-150` (jeder Anker braucht einen Eintrag und umgekehrt), `:84-100` (je Eintrag Stichwörter in de und en) | nein | immer sichtbar (Knopf in der Navigation) |
| 15 iOS | keine Importer | – | – |
| 16 Benachrichtigung | `NotifySettingsCard` ← `Areas.tsx:173`; `startNotifications` (`main.tsx:6,35`) hört auf Jobende, Alarm, Werkzeugwechsel (`store/notify.ts:29-57`); Companion-Weg ntfy oder Webhook (`companion/src/notify.ts:2-3`) | nein | Karte immer in Einstellungen → Maschine → Werkstatt; Standard aus (`workshop.ts:130-131`) |
| 17 Monitor | `Monitor` ← `App.tsx:12,181-183` (Breite ≤ 599 px, `:41`) | – | greift nur auf kleinen Bildschirmen |
| 18 Gamepad/Handrad | `JogWheel` ← `JogCard.tsx:40,494`; zeigt sich nur über die Eingabeumschaltung, die hinter „Mehr Optionen“ liegt (`JogCard.tsx:409,424`) | nein | bereits tief verschachtelt |
| 20 Simulator | `SimulatorCard` ← `Areas.tsx:154`; `store/series` ← `SimulatorCard`; `sim/` wird von Produktivcode statisch importiert: `StatusBar.tsx:20`, `ConnectionCard.tsx:7`, `CameraSetupCard.tsx:3`, `SeriesCard.tsx:6`, `store/camera.ts:8`, `store/limits.ts:13`, `store/sections.ts:35`, `store/demo.ts:29`, `store/demoMap.ts:3` (`rg -n "from '../sim" src`); die Release-Dateien `lowrider-control.html` und `lowrider-demo.html` sind 2 650 135 bzw. 2 650 187 Byte groß (`ls -la`); dass `sim/` im Produktivstand steckt, folgt aus der Importkette (Vermutung, nicht an der Datei belegt) | nein | Karte immer in Einstellungen → Verbindung |
| 21 Profil teilen | `ProfileShareCard` ← `Areas.tsx:169`; Formatzwang: ein Profil ohne `materials`-Liste wird abgelehnt (`share.ts:77-78`) | nein | immer in Einstellungen → Maschine → Profil |
| 22 Antasten | `ProbeTiles` ← `Steps.tsx:208`; `lib/corner.ts` ← Probe-Komponenten | nein | eine von vier Ansichten in Einrichten |

Abhängigkeiten der vier Abläufe untereinander (gleicher Ordner, `rg -n "from '\./(flip|series|jigs|sections|holes)'" src/store src/lib`): `store/jigs.ts` importiert `./flip` und `./series` (`:35,39`), `store/sections.ts` importiert `./flip` und `./jigs` (`:38,47`), `store/series.ts` importiert `./flip` (`:28`), `store/flip.ts` importiert `./holes` (`:17`), `store/readiness.ts` importiert alle fünf (`:13-19`), `store/cam.ts` importiert `./flip` (`:85`). Eine Entfernreihenfolge wäre Abschnitte, Jig, Serie, dann Wenden. `store/settle.ts` (38 Zeilen) ist allen gemeinsam (außerdem `photomap`, `calibration`, `ServiceCards`). Zeilen- und Importzahlen stammen aus den genannten Befehlen; ob das Entfernen im Einzelnen sauber kompiliert, wurde nicht ausprobiert.

### 3c. Urteil

Der Betreiber sagt „selten → per Schalter ausblenden, nicht löschen“ (`Z:30`) und „Verzichten: auf nichts“ (`Z:41`).
Die Ausblend-Zeile gilt daher als Standardurteil; „Entfernen“ ist nur als Option für den Betreiber aufgeführt.

Gemeinsame Aufwandsbasis für (a): Ein neues Flag gehört in `WorkshopSettings` (`workshop.ts:74-101`, Default
`:122-159`); `validateSettings` (`:202-216`) füllt fehlende Felder aus den Defaults, ein altes Speicherformat bricht also
nicht. Pro Einstiegsstelle genügt ein Selektor wie in `NavRow.tsx:22-25`. Reicht `expertMode` nicht (vermischt „Experte“
mit „selten“), braucht jedes weitere Flag zusätzlich einen dritten `CommandNeed` (`commands.ts:99,376-383,447-449`),
den Zweig in `store/find.ts:85-95` und Anpassung von `commands.test.ts:230-253,363-376`. Der Ausblendeffekt endet
an der Oberfläche: Hintergrunddienste (`main.tsx:31-50`) laufen weiter.

Gemeinsame Bruchstellen für (b): erschöpfender `Record<ReadinessId, StepId>` (`lib/steps.ts:15-33`) und die Union
`ReadinessId` (`lib/readiness.ts:13-30`); Schnellsuche-Tests, die Anker, Stichwörter und Orte gegenseitig erzwingen
(`test/commands.test.ts:70-150`); i18n-Tests (`test/i18n.test.ts:171-224`, Schlüsselgleichheit de/en `:266-274`);
Abdeckung 100 % per Schwellwert in den Paketen `cam`, `fluidnc-client`, `gcode-core`, `workshop`
(je `packages/*/vitest.config.ts:10-15`), d. h. Tests des entfernten Codes müssen mit entfernt werden;
gespeicherte Daten (`workshop.ts:182-192`, `store/flip.ts:24`, `store/sections.ts:56`) und Companion-Sammlungen
(`apps/companion/src/server.ts:22-33`).

| # | (a) Ausblenden per Schalter: Aufwand / Risiko | (b) Entfernen (nur Option): was bricht |
|---|---|---|
| 1 Material | Einstiegsstellen: `WorkpieceCard.tsx:33-48`, `JobTools.tsx:150-159,246-255`, `Areas.tsx:42-43`, `Steps.tsx:148`, `CamCard.tsx:384-392`, `StartScreen.tsx:146-160`, `HistoryCard.tsx:78-79`, `commands.ts:234,308`. Aufwand klein bis mittel (acht Stellen in acht Dateien), Risiko niedrig, weil Material nirgends die Start-Prüfung berührt. **Aber** ausgeblendet gibt es keinerlei Schnittwert-Vorschlag mehr (Vorschlag braucht Material, `store/cam.ts:1023-1025`) und das Lernmodell lernt nie, weil es ein gewähltes Material voraussetzt (`workshop.ts:431`). Siehe §4. `SpindleLimits` (`cutting.ts:4-10`) bleibt in jedem Fall nötig (Einstellungen, Prüfliste `limits`) | `suggestCutting` und `Material`-Typ (`cutting.ts:37`, `materials.ts:3`), Typen in `workshop.ts`, Persistenz `lowrider-control.materials/learning`, Companion-Sammlungen `materials`, `learning` (`server.ts:24,29`), **Profilformat**: Datei ohne `materials` wird abgelehnt (`share.ts:77-78`); Tests `library.test.ts:69-162`, e2e `control.spec.ts:790,838`, `steps.spec.ts:363,494-499`, `cam.test.ts:274-295`, `stageTools.test.ts:184`, `profiles.test.ts:5,33` |
| 2 Serie | Einstieg `CamCard.tsx:282,527-545` plus Readiness-Zeile `Readiness.tsx:126-137` (erscheint nur, wenn eine Serie gemacht wurde). Aufwand klein; Risiko niedrig. Nebenwirkung: `startSeries` (`main.tsx:42`) bleibt aktiv | `ReadinessId.series`, `STEP_OF.series`, `useSeries` in `store/readiness.ts:69,164-178`, `store/jigs.ts`/`TableView`/`SimulatorCard` importieren `store/series` bzw. `lib/series`; `textBlockCentre` aus `lib/series` wird vom CAM gebraucht (`store/cam.ts:81`, Vermutung: also nicht ganz löschbar); Tests `series.test.ts`, `blanks.test.ts`, `series.spec.ts`, `ipad.spec.ts:1156-1232`, `i18n.test.ts` (Serien-Texte; Fundstelle nicht einzeln geprüft) |
| 3 Jig | Einstieg `Steps.tsx:51-52,126,133` (drei Zeilen). Aufwand klein; Risiko niedrig, solange `startJigs` weiterläuft; **stoppt man es nicht, bleibt die 700-ms-Bildanalyse** (`store/jigs.ts:628-640`). `lib/markers.ts` bleibt, weil Kamera und Kalibrierung es nutzen | `store/jigs.ts` hängt an `calibration`, `photomap`, `series` (`SectionsCard.tsx`, `JigCard.tsx`, `Readiness.tsx`, `TableView`, `CameraView` importieren `store/jigs`; `store/sections.ts` und `useSectionsOverlay.ts` importieren `lib/jigs`); `ReadinessId.jig`, `STEP_OF.jig`; Companion-Sammlung `jigs` (`server.ts:26`); gespeicherte Vorrichtungen (`workshop.ts:186`); Tests `jigs.test.ts` (2 Stellen), `tagFinder.test.ts`, `tags.test.ts`, `jigs.spec.ts` |
| 4 Wenden | Einstieg `Steps.tsx:48` und Häkchen `CamCard.tsx:356`. Aufwand klein; **aber** `twoSided` ist Teil des CAM-Projektmodells (`store/cam.ts:104-113,133,161`), ein Ausblenden lässt das Modell unangetastet, ein bereits beidseitig gespeichertes Projekt zeigt trotzdem Hinweise (`CamCard.tsx:486-501`) | `packages/cam/src/flip.ts` (gebraucht von `store/cam.ts:10-11`); `store/flip` wird von `store/jigs`, `store/sections`, `store/series` importiert, Wenden lässt sich also erst nach den drei anderen lösen, `store/cam.ts` an 59 Zeilen (`grep -n -i "twoSided\|flip" src/store/cam.ts \| wc -l`), `CamCard.tsx`, `store/readiness.ts:4,65-66,162`; Tests `flip.test.ts` (zwei), `flip.spec.ts`, `i18n.test.ts:215-222`, Teile von `cam.test.ts` (Vermutung) |
| 5 Abschnitte | Einstieg `Steps.tsx:50`, Angebot `Readiness.tsx:85-99`. Aufwand klein; offene Frage: der Verfahrweg-Block bleibt eine Sperre und verweist weiter auf Abschnitte (`readiness.ts:179-189`); ohne Angebot wäre er eine Sackgasse, außer die Meldung wird auf die Standardmeldung umgestellt (Wahl in `store/readiness.ts:119-129`) | `packages/gcode-core/src/sections.ts` (707 Zeilen, 100 %-Abdeckung), `workshop/src/sections.ts`; `ReadinessId.sections`, Verfahrweg-Schlüssel `outsideLong`; Companion-/lokale Persistenz `lowrider-control.sections`; Tests 482 + 839 + 182 + e2e 432 Zeilen; `i18n.test.ts:188-214` |
| 6 Kalibrierung | Ansicht „Kalibrieren“ aus `VIEWS.service` (`ui.ts:31`) plus `Areas.tsx:73,92-97`; die Schalter-Kopplung ist hier am einfachsten, weil es die einzige Ansicht des Kandidaten ist. Aufwand klein; Risiko: `VIEWS`/`SubNav`-Test `commands.test.ts:152-183` (jede Ansicht braucht einen Suchtreffer und einen Button) | nur die zwei Karten und `CorrectionPanel` ließen sich lösen; `store/calibration.ts` und `workshop/src/calibration.ts` bleiben, weil `grabFrame`/`detectMarker`/`twoHoleAlignment` die Kamera-Nullung tragen (siehe 3b); Tests teils gemischt (`control.spec.ts:2210`) |
| 7 Sensor | **nicht ausblenden**, verlangt (`Z:85`); das Panel zeigt sich ohnehin nur mit Sensor (`SensorPanel.tsx:15`) | – |
| 7b Adaptiv | Häkchen `SensorPanel.tsx:36-48` und Karte `NotifySettingsCard.tsx:91-110`: klein; Standard aus (`workshop.ts:132`) | `adaptive.ts` 74 Zeilen (100 %-Abdeckung, Teil von `sensors.test.ts`), `settings.adaptive`, Zweig `sensors.ts:40-47`, e2e `control.spec.ts:1207` gemischt mit Chatter |
| 8 Firmware | schon hinter Experte; offen ist nur, ob die Release-Datei `esptool-js` mitschleppen soll (Bündelgröße nicht gemessen) | Karte, Bibliothek, zwei Abhängigkeiten, `flash.ts`, `extras.test.ts:156-189`, e2e `:891-921`, Suche `commands.ts:359` |
| 9 Aufzeichnung | Abschnitt `CameraCard.tsx:77-79` ausblenden: eine Zeile; Funktion und Dienste bleiben aus (Standard); Risiko niedrig | `RecordingPanel`, drei Stores, `lib/timelapse`, `CameraSetupCard` (importiert `timelapse`), Companion `recorder.ts` (563 Zeilen) und dessen Tests (346 + 126 Zeilen); Einstellungstyp `RecordingSettings` (`workshop.ts:64-72`) |
| 10 Clamps | **nicht ausblenden**: Spannmittel-/Kollisionsprüfung ist verlangt (`Z:78-79`). Offene Frage für den Betreiber: die Karte liegt in ③, die Prüfung in ④ | in vielen Stellen verankert (`store/cam.ts:80,366-380` Löcher weichen Spannmitteln aus, `Stage3D`, `TableView`, `CameraView`, `StageTools`) |
| 11 Autolevel | Karte `Steps.tsx:214`: klein; Risiko niedrig, weil nur dort benutzt | `AutolevelCard`, `autolevel.ts` (154), Tests `machining.test.ts:333-`, e2e `control.spec.ts:990-1033`, Suche `commands.ts:276`, Companion-Sammlung `heightmaps` (`server.ts:31`) |
| 12 Konsole | **vorhanden** | – |
| 13 Makros | `JogPanel.tsx:94` und `Areas.tsx:175-177`; Aufwand klein; Risiko: die Standardmakros ersetzen den Knopf „Werkzeugwechsel-Position“ nicht (gibt es nicht), Makros bleiben als einzige freie Knöpfe | `lib/macros.ts` (Storage `lowrider-control.macros`), `machine.runMacro`, Profil-Format (`share.ts:5`), `prepare.test.ts:55-`, `control.spec.ts:447` |
| 14 Schnellsuche | `NavRow.tsx:68` und `App.tsx:251` plus die Tastenkürzel Strg+K und `/` (`find.spec.ts:46`): klein, **aber** die Anker-Prüfung läuft weiter (die Suchtabelle bleibt Pflicht), und `reveal` wird auch von `Readiness`/`StartScreen` gebraucht; **Nebenwirkung**: wer `FindLayer` (`App.tsx:251`) und den Knopf entfernt, verliert auch das „?“-Blatt mit den Tastenkürzeln (`Find.tsx:329-337`) und die globalen Ansichtstasten (`store/find.ts:142-173`); Leertaste-Pause und Esc bleiben (`store/keys.ts`) | `Find.tsx`, `store/find.ts`, `lib/search.ts`, `commandSearch.ts`, `commands.ts`, `find.css`, `find.spec.ts` (8 Tests, darunter PAUSE/Leertaste `:395`; der Test liegt hier, der Code der Leertaste-Pause liegt in `store/keys.ts:41-66` und bliebe), `commands.test.ts`, `search.test.ts`, de/en-`find` 325/293 Zeilen |
| 15 iOS | nichts zu tun | `apps/ios/README.md` (kein Code); `docs/ipad.md` bleibt, da iPad verlangt ist |
| 16 Benachrichtigung | `Areas.tsx:173`: klein; wenn ausgeblendet, bleibt `startNotifications` hören (Standard aus, `notify.ts:14`) | `store/notify.ts`, Companion-Route und `notify.ts`, `main.tsx:6,35` |
| 17 Monitor | greift nur bei ≤ 599 px; kein Karten-Rauschen; Aufwand für Schalter nicht sinnvoll | `Monitor.tsx`, Zweig `App.tsx:181-183`, e2e `ipad.spec.ts:1132` |
| 18 Gamepad/Handrad | bereits hinter „Mehr Optionen“ (`JogCard.tsx:424`); nichts nötig | `useGamepadJog`, `JogWheel`; keine Tests betroffen (siehe 3a) |
| 19 Rotations-Jog | nur bei `profile.hasRotary` (`JogCard.tsx:490`); nichts nötig | `RotaryJog`, Profilfeld; Tests `control.spec.ts:237` |
| 20 Simulator | Karte `Areas.tsx:154` ausblenden: klein. Entfernen ist **nicht** realistisch (die e2e-Prüfung läuft dagegen) | alle e2e-Tests, `simulator.test.ts`, Demo-Release |
| 21 Profil teilen | Karte `Areas.tsx:169`: klein | `ProfileShareCard`, `share.ts` (100 %-Abdeckung); wenn Material fällt, hängt das Format daran (`share.ts:77-78`) |
| 22 Antasten | nur mit Vorsicht: Z-Antasten ist verlangt; XY-Ecke/Eckplatte wäre ein Teilausblenden in `ProbeTiles` (Vermutung, Aufteilung nicht geprüft) | `ProbeWizard`, `corner.ts`, `cornerPlate` in den Einstellungen (`workshop.ts:98,147`), Tests `corner.test.ts`, `control.spec.ts:618,1373` |

## 4. Zusatz: Material und Schnittwerte entkoppeln

**Ist-Stand.**
- Material ist im Datenmodell ein eigener Typ (`packages/workshop/src/materials.ts:3-18`, Vorgabeliste `:25-98`: vier Gruppen, auch Kunststoff und Aluminium) mit den Faktoren `vc`, `fz6`, `depthFactor`, `stepoverFactor`, `plungeFactor`.
- `Tool` hat keine Schnittwerte (`packages/workshop/src/tools.ts:5-29`: Nummer, Name, Art, Durchmesser, Schneiden, Schneidenlänge, Auskragung, Halter, Notizen, Tastkopf-Marke, Bild).
- Schnittwerte (Drehzahl, Vorschub, Eintauchvorschub, Zustellung, Überlappung) entstehen nur in `suggestCutting(tool, material, spindle, lernfaktor)` (`cutting.ts:37-70`). Die CAM-Einstellungen halten die aktuellen Werte projektweit, nicht je Werkzeug: `CamSettings` mit `toolId`, `rpm` (`store/cam.ts:93-101`) und `feed`, `plungeFeed`, `stepdown`, `stepover` aus `CutSettings` (`packages/cam/src/toolpath.ts:27-42`). Nur der Knopf „Vorschlag“ befüllt sie aus Werkzeug und Material (`store/cam.ts:1019-1033`).
- Ziele (`Z:54`, `Z:103`): Schnittwerte **je Werkzeug**, Material ohne Rolle. Beides ist im Ist-Stand nur über Material erreichbar; „Material ausblenden“ nimmt gleichzeitig die einzige Quelle von Schnittwerten weg.

**Wo die Oberfläche Material anbietet oder erzwingt** (Datei:Zeile):

| Ort | Beleg | Art |
|---|---|---|
| Schritt Job: Materialwahl als Knopfreihe („Woraus wird gefräst?“), im selben Karten-Block wie die Werkstückmaße | `components/WorkpieceCard.tsx:30-48`; eingebunden `Steps.tsx:129` | **bietet an**, nicht verpflichtend (`materialId` Standard null, `workshop.ts:368`) |
| Schritt Werkzeuge: Vorschlag je Werkzeugzeile; ohne Material der Satz „Für einen Vorschlag erst das Material wählen“ | `JobTools.tsx:154-159,246-255` | **verweist darauf** |
| Schritt Werkzeuge, „Mehr Optionen“: Schnittwert-Rechner mit Materialauswahl | `Steps.tsx:148`, `CuttingAdvisor.tsx:46-57` | bietet an |
| CAM-Karte: Knopf „Vorschlag“ gesperrt ohne Material, Text „erst unter ‚Vorbereiten‘ das Material wählen“ | `CamCard.tsx:273,384-391`, `i18n/de.ts:2200` | **erzwingt** für Vorschläge |
| Werkzeugliste (eigener Ort): MaterialLibrary als zweite Karte | `Areas.tsx:42` | bietet an |
| Startseite: Zeile „Material: noch nicht gewählt“ | `StartScreen.tsx:146-159`, `de.ts:210` | zeigt an |
| Service → Verlauf: Material je Auftrag | `HistoryCard.tsx:17,78-79`, `store/recorder.ts:86-88` | zeigt an |
| Suche | `lib/commands.ts:234,308` | bietet an |
| Profil teilen: Zähler und Pflichtfeld | `ProfileShareCard.tsx:22-67`, `share.ts:77-78` | Formatzwang |

**Start-Prüfung:** keine Beteiligung (siehe §2). **Entkopplung technisch:**
- Das Paket `workshop` ist in sich klar getrennt (`index.ts:1-13`); `materials.ts` importiert nichts, `cutting.ts` importiert nur `Material` und `Tool` (`cutting.ts:1-2`). Die Kopplungen nach außen sind genau die oben genannten Stellen plus `store/workshop.ts` (`:236-241,351,390-401,426-450,474-481,483-536`) und die Companion-Sammlungen `materials`/`learning` (`apps/companion/src/server.ts:24,29`).
- Um „Schnittwerte je Werkzeug“ zu speichern, müsste `Tool` neue optionale Felder bekommen (`validateTool`, `tools.ts:74-`, bleibt abwärtskompatibel, wenn sie optional sind) und `CamSettings` bräuchte das Übernehmen aus dem gewählten Werkzeug (`store/cam.ts:266,1019-1033`). Das ist eine neue Funktion, keine Entkopplung; Aufwand mittel (Vermutung: Tool-Editor in `ToolLibrary.tsx` 244 Zeilen, Übernahme in CamCard, Tests im Paket mit 100 %-Abdeckung).
- Bleibt `Material` im Code und wird nur die Oberfläche ausgeblendet (Schalter), bleiben Profilformat, Persistenz und Companion unberührt; verloren geht die Vorschlagsfunktion, solange nichts an die Stelle tritt.

## 5. Beobachtungen am Rand

- Der Verfahrweg-Check blockiert den Start (`lib/readiness.ts:176-190`, `block`), obwohl die Ziele die Prüfungen als „zur Verfügung stellen, nicht zwangsweise“ beschreiben (`Z:78-80`). Nicht Teil dieses Auftrags, aber berührt dieselbe Start-Prüfliste, in die auch Serie/Jig/Wenden/Abschnitte eingreifen.
- Die Ablauf-Karten `FlipCard`, `SectionsCard`, `JigCard` werden in jedem der fünf Schritte vor dem eigentlichen Inhalt eingehängt (`Steps.tsx:44-65`, Aufrufe `:122,146,188,233,264`); ein einziger Eingriff in `FlowCards` (`:44-55`) deckt alle ab.
- Die fünf Schritte und vier Nebenbereiche sind in Tests fest verdrahtet (`commands.test.ts:161-162`: `STEPS` und `AREAS` per `toEqual`). „Keine vorgegebenen Schritte“ (`Z:21-22`) trifft damit auf Testpflichten, nicht nur auf Oberfläche.

## Nicht geprüft

- Gerenderte Zahl von Karten und Bedienelementen im Browser (nur statische JSX-Zählung, Näherung); keine Screenshots, kein Lauf der e2e.
- Ob `liveTags` (`store/jigs.ts:164-186`) ohne Vorrichtung spürbar Rechenzeit kostet; keine Messung.
- Anteil von `esptool-js`, `fflate`, Simulator und `sim/` an den 2,65 MB der Release-Datei (`lowrider-control.html`); `du -sk` von `node_modules/.pnpm/esptool-js@0.7.0/node_modules/esptool-js` = 1060 kB ist kein Bündelmaß.
- Ob Projekte (Zeichnungen) mit `twoSided` oder Serie gespeichert werden und ob ein altes Projektformat bei Entfernen brechen würde: `store/cam.ts` hat kein `saveJson`; Speicherform von „Projekte speichern“ nicht untersucht.
- Wo die Tastenkürzel (Leertaste = PAUSE) implementiert sind (vermutlich `store/keys.ts`, `lib/shortcuts.ts`); nur der Test in `find.spec.ts:395` wurde gesehen.
- Inhalt und Eignung der Companion-Seite (`apps/companion`, Pi-Setup `scripts/pi`) über die Sammlungsliste, `sensors.ts`, `notify.ts`, `recorder.ts` hinaus; ob ein Companion die Sammlungen `materials`, `learning`, `jigs`, `heightmaps` nach Entfernen noch akzeptiert (Vermutung: ablehnen unbekannter Sammlungen nicht geprüft).
- CSS-Anteile der Kandidaten (`styles/*.css`, 5151 Zeilen), z. B. `find.css` 168 Zeilen, `.flip-*`, `.series-*`.
- `apps/control/src/render/*`, `components/Stage*.tsx`, `TableView.tsx`, `CameraView.tsx`: Anteile der Kandidaten (Overlays für Serie, Jig, Abschnitte, Spannmittel) nicht ausgezählt.
- Ob `docs/*.md` (außer `kalibrierung.md`) die Kandidaten beschreiben; `docs/umbau-guide.md` bewusst nicht gelesen.
- Befehle der Zählungen sind einfache `wc -l`, `grep -c`, `rg -n`, `find … | xargs cat | wc -l`; die Tabelle in §1 „Was ein Bediener sieht“ stammt aus einem einmaligen Python-Zählskript (reguläre Ausdrücke über die genannten Dateien).
