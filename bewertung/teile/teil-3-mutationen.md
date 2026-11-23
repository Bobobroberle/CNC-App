# Teil 3 – Code-Qualität und Tests: Mutationstest von Hand

Arbeitskopie: `/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/mut/cnc-steuerung` (Original unberührt).
Blindregel eingehalten: `CLAUDE.md`, `DESIGN.md`, `docs/umbau-guide.md` nicht geöffnet (ein Kommentar im Quellcode verweist auf DESIGN.md, der Verweis wurde nicht verfolgt).

## 1. Plan (festgelegt VOR dem ersten Testlauf, ausgewählt aus dem Quellcode, ohne Tests gesehen zu haben)

Zeilennummern beziehen sich auf den Stand "baseline".

| # | Paket | Datei:Zeile | Geplante Änderung | Warum dieses Ziel |
|---|---|---|---|---|
| 1 | gcode-core | `src/analyze.ts:106` | `value > limit` (max-Seite) → `value >= limit` | Verfahrweg-Grenze (Sicherheitsgrenze): exakt auf dem Limit darf nicht als Verletzung gelten; Randfall, den reine Abdeckung nicht prüft |
| 2 | gcode-core | `src/collision.ts:91` | `holderZ = p.z + setup.stickout` → `holderZ = p.z` | Kollision Halter gegen Rohteil/Spannpratze: Werkzeug-Überstand ist die zentrale Größe der Prüfung |
| 3 | gcode-core | `src/resume.ts:81` | `lineIndex >= raw.length` → `lineIndex > raw.length` | Zeilenzählung beim Wiederaufnehmen eines abgebrochenen Jobs: Off-by-one an der Obergrenze |
| 4 | fluidnc-client | `src/streamer.ts:196` | `this.buffered + size > this.rxBufferSize` → `>=` | Zeichenzählendes Streaming: Off-by-one beim RX-Puffer (Überlauf vs. Unterauslastung) |
| 5 | fluidnc-client | `src/streamer.ts:104` | `l.text.length + 1 > this.rxBufferSize` → `>=` | Zu lange Zeile wird abgewiesen: Randfall genau Puffergröße |
| 6 | fluidnc-client | `src/jog.ts:32-34` | `Math.max(base, Math.min(wanted, range.max))` → `Math.min(wanted, range.max)` (Absicherung "nie gegen die Wunschrichtung") | Software-Endschalter beim Jog: Maschine steht schon außerhalb des Bereichs |
| 7 | cam | `src/toolpath.ts:80` | `Math.ceil(depth / stepdown - 1e-9)` → `Math.floor(depth / stepdown - 1e-9)` | Tiefenzustellung: Durchgänge dürfen nicht tiefer als `stepdown` sein |
| 8 | cam | `src/toolpath.ts:434` | `(op.kind === 'outside') === s.climb` → `!==` | Gleich-/Gegenlauf (Werkzeugweg-Richtung, Schnittqualität/Sicherheit) |
| 9 | cam | `src/toolpath.ts:419` | `c.circle.r < r - 0.1` → `c.circle.r < r` | Werkzeug passt nicht in Bohrung: Toleranzgrenze 0,1 mm (Randfall) |
| 10 | workshop | `src/probing.ts:112` | `down = p.retract + o.depth + o.plateThickness` → ohne `+ o.plateThickness` | Koordinatenrechnung beim Eck-Antasten: Absenktiefe im Messablauf (Kollision mit Platte) |
| 11 | workshop | `src/cutting.ts:54` | `Math.min(tool.flutes, 2)` → `tool.flutes` (V-Fräser/Fase) | Vorschubberechnung (Schneidenzahl) – falsche Zahl liefert zu hohen Vorschub |
| 12 | workshop | `src/zeros.ts:89` | `z.wcs! > 6` → `z.wcs! > 7` | Wertebereichsprüfung G54–G59 (G10 L2 P7 wäre ungültig); Validierung gespeicherter Nullpunkte |
| 13 | control (Wächter) | `src/lib/readiness.ts:163` | `r.errors > 0` → `r.errors > 1` | Start-Sperre: ein einzelner G-Code-Fehler muss den Start blockieren |
| 14 | control (Wächter) | `src/store/machine.ts:1168` | Prüfzweig `|| v > range.max + 0.001` entfernen | Bewegungsfreigabe `moveMachine`: Verfahrweg-Obergrenze bei Referenzfahrt/Softlimits |

Vorgehen pro Mutation: Datei ändern, nur das betroffene Paket testen (`pnpm exec vitest run`), Ergebnis notieren, `git checkout -- <datei>`.

## 2. Ergebnistabelle (14 vorab festgelegte Mutationen)

Basislauf vor den Mutationen: gcode-core 160, fluidnc-client 86, cam 112, workshop 100, apps/control 555 Tests, alle grün (je ein Lauf, 1–8 s).
Werkzeug: kleines Skript `scratchpad/skripte-agent/mut.py` (ersetzt genau eine Textstelle, startet `pnpm exec vitest run` im betroffenen Paket, setzt per `git checkout -- <datei>` zurück und gibt `git status --short` aus; nach jeder Mutation "git clean").

| # | Datei:Zeile | Änderung (vorher → nachher) | Ergebnis | Töter (Testdatei > Name) | Revert |
|---|---|---|---|---|---|
| 1 | gcode-core `analyze.ts:106` | `value < limit : value > limit` → `value < limit : value >= limit` | GETÖTET (2 Tests) | `analyze.test.ts` > checkWorkspace > "passes a job inside the travel"; "reports the first crossing segment and the furthest value per limit" | ja |
| 2 | gcode-core `collision.ts:91` | `holderZ = p.z + setup.stickout` → `holderZ = p.z` | GETÖTET (4) | `machining.test.ts` > checkCollisions > "accepts a job that stays clear", "finds holder in stock, tool and holder in clamps and the gantry", "only checks the gantry when configured…", "takes a round fixture as a circle…" | ja |
| 3 | gcode-core `resume.ts:81` | `lineIndex >= raw.length` → `lineIndex > raw.length` | **ÜBERLEBT** | – (160/160 grün) | ja |
| 4 | fluidnc-client `streamer.ts:196` | `this.buffered + size > this.rxBufferSize` → `>=` | GETÖTET (1, zufällig) | `streamer.test.ts` > "stops after an error by default" (der dafür vorgesehene Test "fills the buffer without overflowing it" schlägt NICHT an) | ja |
| 5 | fluidnc-client `streamer.ts:104` | `l.text.length + 1 > this.rxBufferSize` → `>=` | **ÜBERLEBT** | – (86/86 grün) | ja |
| 6 | fluidnc-client `jog.ts:32` | `? Math.max(base, Math.min(wanted, range.max))` → `? Math.min(wanted, range.max)` | GETÖTET (1) | `jog.test.ts` > clampJogTarget > "never moves the other way when already outside" | ja |
| 7 | cam `toolpath.ts:80` | `Math.ceil(depth / stepdown - 1e-9)` → `Math.floor(…)` | GETÖTET (10) | u. a. `cam.test.ts` > "divides the depth into equal passes"; `golden.test.ts` > "a sign: engraved text, …" | ja |
| 8 | cam `toolpath.ts:434` | `(op.kind === 'outside') === s.climb` → `!== s.climb` | GETÖTET (6) | `cam.test.ts` > "runs outside counter-clockwise for climb and clockwise conventional; inside the other way"; `flip.test.ts` > "keeps climb and conventional milling as chosen"; `golden.test.ts` u. a. | ja |
| 9 | cam `toolpath.ts:419` | `c.circle.r < r - 0.1` → `c.circle.r < r` | **ÜBERLEBT** | – (112/112 grün) | ja |
| 10 | workshop `probing.ts:112` | `down = p.retract + o.depth + o.plateThickness` → ohne `+ o.plateThickness` | GETÖTET (1) | `probing.test.ts` > "probes through an XYZ corner plate" | ja |
| 11 | workshop `cutting.ts:54` | `Math.min(tool.flutes, 2)` → `tool.flutes` | GETÖTET (1) | `library.test.ts` > cutting values > "uses at most two flutes for V-bits" | ja |
| 12 | workshop `zeros.ts:89` | `z.wcs! > 6` → `z.wcs! > 7` | GETÖTET (1) | `share.test.ts` > zero memory > "validates stored zeros" | ja |
| 13 | control `lib/readiness.ts:163` | `r.errors > 0` → `r.errors > 1` | **ÜBERLEBT** | – (555/555 grün) | ja |
| 14 | control `store/machine.ts:1168` | `(v < range.min - 0.001 \|\| v > range.max + 0.001)` → `(v < range.min - 0.001)` | **ÜBERLEBT** | – (555/555 grün) | ja |

**Summe: 9 getötet, 5 überlebt (36 % Überlebensrate).** Je Paket: gcode-core 2/3 getötet, fluidnc-client 2/3, cam 2/3, workshop 3/3, Wächter in apps/control 0/2.

Zusatz-Mutationen (NICHT im Vorab-Plan, nachträglich zur Einordnung der Wächter; bitte als solche lesen):

| Z | Datei:Zeile | Änderung | Ergebnis |
|---|---|---|---|
| Z1 | gcode-core `kinematics.ts:41` | X `maxRate: 9000` → `900` | GETÖTET, aber nur durch 7 `golden.test.ts`-Dateifälle, nicht durch `time.test.ts` |
| Z2 | control `store/machine.ts:655` | `!homed \|\| !profile.softLimits` → `!homed && !profile.softLimits` (Jog-Softlimit-Zweig) | ÜBERLEBT |
| Z3 | control `store/start.ts:108` | `else if (!idle) reason = t('ready.busy')` entfernt (Startsperre bei nicht-Idle, z. B. Alarm) | ÜBERLEBT |
| Z4 | control `lib/reason.ts:310` | Alarm-Zeile entfernt | GETÖTET (`reason.test.ts` > "names what the machine has against it, most basic first") |
| Z5 | control `lib/readiness.ts:154` | Busy-Item `level: 'block'` → `'warn'` | GETÖTET (`readiness.test.ts` > "blocks on what would go wrong at the machine, …") |

Alle Zusatz-Mutationen ebenfalls zurückgesetzt (Skript: "git clean").

### Bewertung der Überlebenden (Test erst nach dem Lauf gelesen)

- **#13 `readiness.ts:163` (Start-Sperre bei G-Code-Fehlern) – fachlich relevant, wichtigster Überlebender.** Kein Äquivalent: bei genau einem Fehler wird der Start nicht mehr blockiert. Der einzige Test (`apps/control/test/readiness.test.ts:29`) benutzt `errors: 2` bzw. `0` (Zeile 8), der Wert 1 fehlt. Es fehlt: `jobReadiness({...base, errors: 1})` muss `errors` in `blockers()` liefern.
- **#14 `machine.ts:1168` (Obergrenze der Verfahrweg-Prüfung in `moveMachine`) – relevant.** `moveMachine` wird in keinem Unit-Test aufgerufen (grep nach `moveMachine` in `apps/control/test`: kein Treffer). Gemessene Abdeckung von `store/machine.ts` im Unit-Lauf: 32,7 % Anweisungen / 29,9 % Zweige (Ad-hoc-Lauf mit `--coverage.include='src/store/**/*.ts'`, Bericht im Scratchpad, nicht im Projekt). Es fehlt: Test mit simulierter Verbindung (`limits.test.ts:103` zeigt, dass `connect()` gegen `'simulator'` möglich ist) für Ziel > `travel.max` → `false` und Log `calibration.outside`.
- **#3 `resume.ts:81`** – kein Äquivalent: Ich habe die Mutation mit `resumeFrom('G0 X1', 1, …)` geprüft, es kommt dann ein `TypeError` (Zugriff auf `result.lines[1]!.stateBefore`) statt der dokumentierten `RangeError`. Der Test (`machining.test.ts:80-82`) prüft nur Index 3 und -1, nicht die Grenze `raw.length`. Fehlt: `expect(() => resumeFrom('G0 X1', 1, …)).toThrow(RangeError)`. Auswirkung gering bis mittel (Fehlerart, kein Fehlfahren).
- **#5 `streamer.ts:104`** – kein Äquivalent (Zeile mit exakt Puffergröße wird zu Unrecht abgewiesen bzw. umgekehrt). Der Test `streamer.test.ts:124` nutzt eine Zeile weit über der Grenze. Fehlt: Zeile mit `text.length + 1 === rxBufferSize` (muss passen) und `+1` (muss RangeError werfen). Auswirkung: Randfall.
- **#9 `toolpath.ts:419` (Werkzeug passt in Bohrung)** – kein Äquivalent: Die 0,1-mm-Toleranz entfällt; ein Fräser bis 0,2 mm Durchmesser über Lochgröße wird nicht mehr akzeptiert. Der Test (`cam.test.ts:269-270`) hat nur Löcher weit außerhalb der Toleranz. Fehlt: Kreis mit `r_loch = r_werkzeug - 0,05` (akzeptiert) und `- 0,15` (`hole-too-small`). Relevanz mittel (Bearbeitungsgenauigkeit).
- **#4 (getötet, aber nur zufällig):** Der Zweck-Test `streamer.test.ts:37` ("fills the buffer without overflowing it", Puffer 12, Zeilen je 5 Byte) füllt nie bis genau zur Grenze; erst der Fehler-Test (Puffer 10, zwei Zeilen à 5 Byte) trifft die Grenze zufällig. Wird der Fehler-Test geändert, bleibt der Off-by-one im Kernstück des Streamings ungeschützt.

## 3. Stichproben

### 3.1 Aufbau, Kopplung, Duplikate, tote Pfade

Skript: `scratchpad/skripte-agent/graph.py` (Ausgabe `graph.out`); `npx madge` ist offline nicht verfügbar (`npx --no-install madge` → fehlendes Paket), daher eigenes Skript. Grenzen: nur `import … from` mit relativen Pfaden bzw. `@lowrider/*`, `import type` ausgenommen, Namensabgleich per Wort (Namenskollisionen führen zu zu wenig gemeldeten toten Symbolen).

- **Zyklische Importe:** 324 Quelldateien (apps/control/src und alle `packages/*/src`), 1876 Wert-Importkanten, **0 Zyklen** (Tarjan-SCC). Typ-Importzyklen nicht geprüft.
- **`apps/control/src/store/machine.ts` (1267 Zeilen):** ein einziger zustand-Store `MachineStore` (Interface ab Zeile ~136, `create` ab ~370) mit rund 50 Aktionen, u. a.: Verbindung samt Wiederverbindungslogik (`connect` Zeile 382–560, etwa 180 Zeilen in einer Funktion), Echtzeitbefehle (`emergencyStop`/`feedHold`/`cycleStart` 600–615), Jog in fünf Varianten (`jog` 650, `jogStart` 866, `stick` 1207, `moveTo` 1133, `moveMachine` 1159, `moveZ` 1192), Referenzfahrt, Nullpunkte/WCS/Antasten (`zero`, `setWcs`, `runProbeRoutine`, `setZeroAt`, `restoreZero`), Overrides, SD-Dateien (`uploadToSd`, `runSdFile`), Makros, Konfiguration lesen/schreiben (`readConfigFile`, `applyConfigChanges`, `uploadConfigFile`), Streaming mit Werkzeugwechsel-Haltepunkten (`streamJob` 948, `continueAfterToolChange` 1022), Einzelschritt, Log. Mehrere Verantwortlichkeiten, klar abgrenzbar; 107 Importzeilen im App-Quellcode referenzieren `store/machine` (grep `from './machine'|'../store/machine'`).
- **`store/cam.ts` (1154 Zeilen):** CAM-Projekt-Store (`useCam` ab Zeile 419, etwa 735 Zeilen in einer Closure): SVG/DXF/Skizze, Text, Operationen, Stock, zweiseitige Bearbeitung (Flip), Werkzeugwege; liest direkt andere Stores per `getState()` (`cam.ts:376` `useMachine`, `:390`, `:439` `useJob`); 19 Treffer auf `useJob|useWorkshop|useMachine`.
- **Duplikate/Namenskollisionen (Beleg: Skript + Einzelprüfung):**
  - Zahlformatierer `String(Number(n.toFixed(3)))` mindestens 8-mal lokal neu definiert: `workshop/src/probing.ts:33`, `zeros.ts:36`, `tags.ts:143`, `apps/control/src/lib/motion.ts:4`, `lib/probe.ts:3`, `components/AutolevelCard.tsx:15`, `render/draw.ts:293`, dazu `round` in `store/jigs.ts:115`, `store/sections.ts:183`, `store/holes.ts:42`; `fluidnc-client/src/jog.ts:19` hat eine weitere Variante.
  - `signedArea`: `packages/cam/src/geometry.ts` und `apps/control/src/lib/tagFinder.ts:105` (echtes Duplikat); `fitLine` in `lib/tagFinder.ts:182`, `lib/blanks.ts:212`, `lib/corner.ts:82` (drei Varianten); `distance` in vier Dateien.
  - Gleicher Name, verschiedene Bedeutung (Verwechslungsrisiko, keine Duplikate): `zeroCommand` in `workshop/src/probing.ts:202` (`G10 L2 P0 …`) und `apps/control/src/lib/probe.ts:20` (`G10 L20 P0 …`); `formatNumber` in `gcode-core/src/transform.ts:66` (G-Code, 4/5 Stellen) und `apps/control/src/lib/format.ts:31` (Locale-Anzeige).
- **Tote/ungenutzte Exporte:** 1605 Exporte (ohne `index.ts`). 26 ohne Verwendung irgendwo und ohne Eigennutzung, davon 22 UI-Baukasten-Komponenten (`ui/card.tsx` CardAction/CardContent/…, `ui/field.tsx` Field*, `ui/tabs.tsx` TabsContent/TabsList/TabsTrigger, `ui/progress.tsx`, `ui/collapsible.tsx`), außerdem `fluidnc-client/src/flash.ts` `LITTLEFS_ADDRESS` und `realtime.ts` `RealtimeCommand`. 281 weitere werden nur in der eigenen Datei benutzt (Überexport). **137 Exporte werden nur von Tests benutzt**, im Produktivcode nirgends (per `grep -w` in allen `src` bestätigt für): `workshop/src/chatter.ts` `detectChatter`/`fft`/`spectrum` (Rattererkennung, im App-Code nicht angeschlossen), `probing.ts` `zRoutine`, `fluidnc-client/src/flash.ts` `flashLayout`, `workshop/src/tools.ts` `toolByNumber`, `adaptive.ts` `overrideSteps`, `calibration.ts` `fitAffine`. Das sind geprüfte Funktionen ohne Aufrufer in der App (Vermutung: für spätere Funktionen vorgesehen oder Reste).

### 3.2 Qualität der Tests (Beispiele)

Zählung per grep: rund 1000 `it(`, rund 4365 `expect(`, `toBeDefined` 4×, `toBeTruthy` 0×, Snapshots 0×, `.skip/.todo/.only` 0×.

Gut (prüfen Verhalten mit konkreten Erwartungswerten, haben Mutationen getötet):
1. `packages/gcode-core/test/analyze.test.ts:49-61`: erwartet vollständige Verletzungsobjekte (Achse, Seite, Wert, Limit, Segment- und Zeilenindex) und den Bogenüberstand 1205; tötet #1.
2. `packages/cam/test/cam.test.ts:85-89` und `:104`: `passDepths` mit exakten Arrays (auch Nicht-Teiler `5/3, 10/3, 5`), Umlaufrichtung für Gleich-/Gegenlauf; töten #7 und #8.
3. `apps/control/test/sections.test.ts:360-366`: Erwartungswerte per Hand mit unabhängiger Trigonometrie berechnet (Kommentar "By hand: −374 + 758 cos 0.35° …", `toBeCloseTo(383.7415, 3)`), unabhängiges Orakel statt Abschrift der Implementierung. (Zusätzlich gut: `fluidnc-client/test/jog.test.ts:22-27`, Grenzfälle des Endschalters.)

Schwach:
1. `packages/gcode-core/test/time.test.ts:125-128` ("ships placeholder LowRider kinematics"): `maxRate > 0` und `total > 6`; fast jeder Wert besteht. Die Kinematik-Konstanten sind nur über die `golden.test.ts`-Dateien geschützt (Z1).
2. `apps/control/test/jog.test.ts:126-175` ("the one action layer of jogging"): ersetzt die Store-Aktionen `jog`, `jogStart`, `stick`, `moveTo` … durch `vi.fn()` und prüft nur Aufrufe an diese Mocks; die echten Implementierungen in `store/machine.ts` bleiben ungeprüft (Z2 überlebt). Das Gating in `lib/jog.ts` wird dabei durchaus geprüft.
3. `packages/cam/test/cam.test.ts:125`: `expect(firstCut.x).toBeDefined()` – prüft nur, dass irgendein Wert da ist (daneben schwache Bereichsprüfung `> -3`). Ähnlich dünn: `gcode-core/test/analyze.test.ts:27` (`timeline!.total > 0`) und `golden.test.ts:17` (`files.length > 0`).

### 3.3 Erzwingt `pnpm coverage` die Schwellwerte? Was ist ausgeschlossen?

- **Konfiguration der vier Pakete** (`packages/{gcode-core,fluidnc-client,cam,workshop}/vitest.config.ts`, alle identisch): Provider v8, `include: ['src/**/*.ts']`, `thresholds: {lines, functions, statements, branches: 100}`. **Kein `coverage.exclude`**, in keinem der vier Pakete. Keine `v8 ignore`/`istanbul ignore`/`c8 ignore`-Kommentare in `packages/*/src` und `apps/control/src` (grep: 0 Treffer).
- **Erzwingung belegt:** `pnpm coverage` = `pnpm -r coverage` = `vitest run --coverage` je Paket. Experiment in der Arbeitskopie: (a) neue ungenutzte Datei `packages/cam/src/zz_unused.ts` mit einer Funktion → Exit-Code 1, vier "ERROR: Coverage for … does not meet global threshold (100%)"-Zeilen (Datei wird also mitgezählt, auch wenn kein Test sie importiert); (b) ein ungenommener Zweig in `cam/src/gcode.ts` → ebenfalls Fehler. Beides zurückgesetzt. In CI erzwungen: `package.json` `check` = `typecheck && coverage && build`, `.github/workflows/ci.yml` ruft `pnpm check` auf (nicht ausgeführt, nur gelesen).
- **Die "100 %" sind echt gemessen, aber nur Ausführungsabdeckung:** 9 von 14 Mutationen getötet, 5 überlebt, obwohl jede mutierte Zeile abgedeckt war. Zeilen-, Zweig- und Funktionsabdeckung sagen nichts über Randwerte (alle fünf Überlebenden sind Grenzwert- bzw. Einzelwertfälle).
- **apps/control ist anders:** `apps/control/vite.config.ts`: `coverage: { provider: 'v8', include: ['src/lib/**/*.ts', 'src/i18n/**/*.ts'] }`, **keine Schwellwerte** – `pnpm coverage` dort kann nicht an der Abdeckung scheitern. Von der Messung ausgeschlossen sind `src/store/**` (inkl. `machine.ts`, `start.ts`, `readiness.ts`, `run.ts`) und `src/components/**`. Gemessen (Basislauf, `src/lib`+`src/i18n`): 93,6 % Anweisungen / 92,6 % Zweige / 91,95 % Funktionen / 94,8 % Zeilen. Ad-hoc-Messung für `src/store/**`: 30,2 % Anweisungen / 28,2 % Zweige; `store/machine.ts` 32,7 %/29,9 %; `store/readiness.ts`, `store/start.ts`, `store/run.ts` 0 % (die Hook-Verdrahtung der Startsperre, Z3 überlebt). Vermutung: Diese Teile werden von den Playwright-Tests (`apps/control/e2e`, 13 Spec-Dateien, rund 144 `test(`-Treffer) geprüft; z. B. behandelt `areas.spec.ts:465` einen Alarm, der "blockiert, was zu blockieren ist". Nicht ausgeführt, daher nicht belegt.

## 4. Nicht geprüft

- Playwright/e2e (`apps/control/e2e`) nicht ausgeführt; ob dort #13, #14, Z2, Z3 getötet würden, ist unbekannt.
- Typ-Importzyklen, dynamische Importe und `madge`-Ergebnis; tote Exporte nur per Namensabgleich (kann Kollisionen übersehen).
- Mutationen in `apps/control/src/components`, in `store/cam.ts`, in `fluidnc-client/src/connection.ts` (445 Zeilen), `gcode-core/src/interpreter.ts`/`sections.ts`/`time.ts`; keine automatisierte Mutationsbibliothek (Stryker) verwendet, nur 14 + 5 handverlesene Mutationen. Aussagen zur Gesamtqualität der Tests sind Stichproben.
- Jeder Test nur einmal ausgeführt (keine Prüfung auf Flakiness); Laufzeit-/Zufallsabhängigkeit unbekannt.
- `pnpm check` insgesamt (typecheck, build) und der CI-Lauf selbst nicht ausgeführt.
- Inhalte von `CLAUDE.md`, `DESIGN.md`, `docs/umbau-guide.md` wurden nicht gelesen (Blindregel).

## 5. Bestätigung

`git status --short` in der Arbeitskopie `/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/mut/cnc-steuerung` nach dem letzten Revert: **leer (sauber)**; HEAD weiterhin `85a443d baseline`. Das Original unter `scratchpad/src/` wurde nicht angefasst. Die Coverage-Berichte der Ad-hoc-Läufe liegen im Scratchpad (`skripte-agent/cov-control`), nicht im Projektbaum.
