# Teil 4 – Sicherheit am Gerät

Frage: Gibt es einen Pfad, auf dem die App etwas bewegt, das der Bediener nicht ausgelöst hat – und halten PAUSE,
NOT-HALT und "Maschine läuft weiter" die Vorgaben aus `docs/bewertung/02-ziele.md` (Abschn. 6 und 7) ein?

Methode: Quelltext gelesen (nur `/…/src/cnc-steuerung`, ohne die gesperrten Dateien), Belege als `Datei:Zeile`.
Ausgeführt wurden eigene Tests im Scratchpad (nicht im Projektbaum):

- `/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/skripte-sicherheit/sicherheit.test.ts`
  (vitest, 11 Tests, alle grün; das echte `FluidNCConnection`, der echte `useMachine`-Store und das echte
  Pi-`FluidNCRelay` gegen ein FluidNC-Double)
- `…/skripte-sicherheit/ui.spec.ts` (Playwright gegen das gebaute `apps/control/dist`: 3 Tests im Projekt `desktop`, 1 im Projekt `phone`, alle grün)

Start der Tests (vom Scratchpad-Verzeichnis aus; `$P` = Projektwurzel):

- `$P/apps/control/node_modules/.bin/vitest run --config ./vitest.config.ts`
- `$P/apps/control/node_modules/.bin/playwright test --config ./playwright.config.ts --project=desktop` (die Leertasten-Tests brauchen das Menü, es gibt es im
  Telefon-Layout nicht; das Projekt `phone` ist nur für `-g "PAUSE und"` gedacht)

Kürzel unten: `T:` = Test aus `sicherheit.test.ts` (Name nennt den Fall), `UI:` = `ui.spec.ts`.
Pfade ohne Präfix liegen unter `apps/control/src/`, Paketpfade unter `packages/…`.
An echter Hardware wurde nichts geprüft (siehe "Nicht geprüft").

## Kurzantwort

1. Der **Standard-Start** (Halten → `startPart` → Upload → `$SD/Run`) lässt die Maschine ohne die App weiterfräsen und
   zeigt bei Verbindungsverlust die rote kritische Meldung. Das erfüllt die Vorgabe.
2. Das **Streaming** aus dem Browser (RunCard unter "Mehr Optionen" und "Wiederaufnahme ab Zeile", samt M6-Haltepunkt) erfüllt sie **nicht**:
   die Maschine läuft nur den Puffer leer und steht dann mitten im Schnitt; eine rote Meldung kommt **nicht**, nur eine
   Warnung "Job … abgebrochen".
3. Ob die App etwas bewegt, das niemand ausgelöst hat: **ja, in zwei Fällen** – die Fremd-`ok`-Verwechslung bei zwei Geräten
   (B2, ohne Handlung am Erstgerät) und die Dauerfahrt nach Linkverlust (B3). Alle übrigen automatischen Folgeschritte sind Fortsetzungen
   eines vom Bediener gestarteten Ablaufs. Ein einzelner Tipp aufs Bild, ein Wiederverbinden und die Tastenkürzel
   bewegen nichts.

## Befunde nach Schweregrad

### BLOCKIEREND

**B1 – Streaming-Job + Verbindungsabbruch: Vorgabe "Maschine läuft weiter, rote Meldung" nicht erfüllt (Bug in der Meldung, Grenze im Modus).**

- Es gibt beide Modi. Standard: SD-Karte (`store/run.ts:90-153`, `components/ActionBar.tsx:189-203`,
  `store/machine.ts:767-783`, `packages/fluidnc-client/src/connection.ts:282-303`). Streaming: Browser sendet Zeile für
  Zeile mit Zeichenzählung (`packages/fluidnc-client/src/streamer.ts:84-203`, `store/machine.ts:948-1020`), erreichbar
  nur unter "Mehr Optionen" (`components/RunScreen.tsx:393-401`, `components/RunCard.tsx:50-62`) – **und
  "Wiederaufnahme ab Zeile" streamt immer** (`components/ResumeCard.tsx:85-92`).
- Mechanismus beim Abbruch: `connection.ts:361` ruft `streamer.abort()`, dadurch hört das Senden auf
  (`streamer.ts:165-171`). Das, was die Steuerung schon im Puffer hat (≤ 127 Byte RX-Puffer, `streamer.ts:8`, plus
  Planer), läuft zu Ende. Danach steht die Maschine. Es wird **nichts** gesendet: kein `!`, kein `0x18`, kein `M5`
  (`T: Browser-Streaming: Abbruch …`: 12 Zeilen / 121 Byte waren in der Steuerung; `s.realtime() == []`; keine `M5`-Zeile).
  Die Spindel behält ihren Zustand (Vermutung: FluidNC schaltet beim WebSocket-Abbruch nichts ab; nicht an Hardware geprüft).
- Pi-Seite: sendet bei Client-Abbruch **nichts** an die Maschine. `apps/companion/src/relay.ts:72-75, 129-135`
  (`detach` schließt nur den Upstream, wenn kein Client mehr da ist); der Recorder sendet nur `?`
  (`apps/companion/src/recorder.ts:335-336`); `T: Jeder Client darf …`: nach Abbruch des streamenden Clients gehen 0 Bytes
  an FluidNC.
- Die **rote Meldung fehlt**: `connection.ts:361` (`streamer.abort()`) läuft **vor** `connection.ts:364`
  (`setState('disconnected')`). Der Store setzt `stream.result = 'aborted'` schon im `progress`-Handler
  (`store/machine.ts:974-979`). Beim State-Handler (`store/machine.ts:460-467`) ist `stream?.result === 'running'` deshalb
  schon falsch, `lostInJob` bleibt `null`, `CriticalLayer` (`components/CriticalLayer.tsx:15-20`) und der Text
  `critical.lost.effectStream` (`i18n/de.ts:533-534`: "bleibt stehen, sobald ihr Puffer leer ist") erscheinen nie.
  Stattdessen nur `addLog('error', 'stream.aborted')` → Stufe "Warnung" (`lib/messages.ts:133`). Das Latch
  `link.lostDuringJob` wird dagegen richtig gesetzt (`store/machine.ts:449-457`), also kein Auto-Reconnect.
  `T: Browser-Streaming …`: `result = aborted | lostInJob = null | link.lostDuringJob = true | Log: "Job t.nc abgebrochen."`
  Der bestehende e2e-Test deckt nur den SD-Fall ab (`e2e/steps.spec.ts:289-331`).
- Der Text `effectStream` zeigt, dass die Entwickler den Fall kannten; das Verdrahten (Reihenfolge) ist nicht gelungen.
- Folge für die Vorgabe: für Streaming ist "läuft weiter" **technisch nicht erfüllbar** (die Gegenstelle fehlt); erfüllbar
  ist nur: gut sichtbar melden und das Streaming nicht als Standard anbieten. Empfehlung (nicht umgesetzt): Reihenfolge
  im Client ändern (`lostInJob` vor `abort()` bestimmen), Streaming-Hinweistext benutzen, Wiederaufnahme ab Zeile als SD-Datei
  hochladen statt zu streamen.

**B2 – Zwei Geräte am Relay: Antworten (`ok`/`error`) gehen an alle; ein Zweitgerät, das sich von selbst wieder verbindet, beendet im Erstgerät den SD-Job – und der Erstgerät-Ablauf sendet dann Fahrbefehle.**

- Das Relay leitet jede Zeile jedes Clients unverändert an FluidNC und jede Antwort an **alle** Clients
  (`apps/companion/src/relay.ts:82-85, 100-104`; `apps/companion/src/server.ts:372-386`). Ein Pro-Client-Routing gibt es nicht.
- Der Client ordnet `ok`/`error` rein nach Reihenfolge zu (`packages/fluidnc-client/src/connection.ts:415-426`): das erste wartende
  Kommando bekommt es, bei laufendem SD-Job ist das der Job selbst (`connection.ts:282-303`, `job: true`).
- **Auslöser ohne jede Handlung am Erstgerät**: das Zweitgerät (z. B. das iPad nach dem Aufwachen) verbindet sich per Auto-Reconnect-Timer
  neu (`store/machine.ts:437-440`, erlaubt, weil dort kein Job läuft: `lib/link.ts:77-79`); `connect()` fragt sofort `$I`, dann `$G`, `$#`
  (`store/machine.ts:545-546, 848-857`). FluidNC antwortet, das Relay verteilt die Antwort an alle. Auch ein Neuladen/Öffnen der App am
  zweiten Gerät mit Klick auf "Verbinden" löst es aus. Das Zweitgerät muss keinen Befehl "für die Maschine" geben.
- Belege:
  - `T: Fremd-"ok" beendet in Client A den SD-Job …` (echtes Pi-`FluidNCRelay`, zwei echte `FluidNCConnection`): B sendet `$I`, A meldet
    `runFile` als beendet, obwohl die Maschine weiter `Run` meldet.
  - `T: runSdFile: ein fremdes ok beendet den Job im Store`: `fileJob = null`, `lastFileResult = 'done'`, `status.state = 'Run'`.
  - `T: startPart mit 2-Werkzeug-Job: nach Fremd-ok sendet die App M5, Anheben und G53 G0 an die laufende Maschine`: nach dem fremden `ok`
    gehen von A aus `M5`, `G53 G0 Z1`, `G53 G0 X12 Y34` (Wechselposition) hinaus, während die Maschine als `Run` gemeldet bleibt
    (`store/run.ts:121-152`). Das ist der **einzige Pfad**, auf dem die App von selbst Fahrbefehle schickt, die niemand ausgelöst hat.
    Bei der letzten Teil-Datei erscheint fälschlich "fertig" (`store/run.ts:126-139`), die Aufzeichnung endet als "done" (`store/recorder.ts:115-116`).
  - `T: Fremd-"ok" in A verschiebt die Puffer-Buchführung …`: beim Streaming lässt ein fremdes `ok` A eine Zeile zu viel senden (nach B's `$G`:
    16 statt 12 Zeilen = 167 Byte ohne eine einzige echte Quittung bei Puffer 127) → Überlauf des Steuerungspuffers möglich.
- Firmwareabhängig (nicht geprüft): ob FluidNC während `$SD/Run` die `$`-Abfragen mit `ok` oder `error:` beantwortet und ob es G-Code-Zeilen eines
  zweiten Kanals mitten im Job annimmt (dann würde `G53 G0 …` wirklich fahren; sonst `error:`). Die App-Seite ist unabhängig davon falsch
  (falsches "fertig", Folgebefehle gesendet); bei `error:` bricht A den Job-Eintrag mit "aborted" ab.
- Weiteres: B sieht keinen laufenden Browser-Stream von A (`useStart` prüft nur den eigenen `fileJob`/`stream`, `store/start.ts:53`); bei "Idle" zwischen
  Zeilen/Werkzeugwechsel (`stream.toolChange`) könnte B einen SD-Start halten (`$SD/Run`) – dafür braucht es eine bewusste Haltegeste von B.
  PAUSE/NOT-HALT von B wirken auf A (gewollt, `relay.ts:1-5`).
- Gut: Befehle vor offenem Upstream werden verworfen statt später ausgeführt (`relay.ts:82-85`); fällt A (streamt gerade) weg, bleibt B
  verbunden und nichts geht an FluidNC (`T: Jeder Client darf …`, `relay.clientCount == 1`).
- Einstufung: BLOCKIEREND für den vom Betreiber gewünschten Betrieb "PC + iPad gleichwertig" (`02-ziele.md` Abschn. 1). Der App-Fehler ist
  deterministisch bewiesen; die Auswirkung an der Maschine hängt von der Firmware ab.
- Empfehlung: einen "Besitzer" für Job/Befehle festlegen (zweites Gerät nur lesend + PAUSE/NOT-HALT, und keine `$`-Abfragen beim Verbinden, solange
  `Run`), oder im Relay `ok`/`error` nur an den Absender des zugehörigen Befehls geben. Bis dahin: nur **ein** Gerät verbunden.

**B3 – Dauerfahrt (Taste halten) nach Verbindungsverlust: kein Totmann an der Steuerung, kein Verbindungswächter.**

- Nicht referenziert (aktueller Zustand: Y noch nicht fertig, keine Referenzfahrt) sendet die Dauerfahrt eine einzige
  **relative Fahrt über den ganzen Verfahrweg**: `store/machine.ts:866-884` mit `lib/motion.ts:55-61`
  (`value = direction * (range.max - range.min)`). Mit dem mitgelieferten Profil heißt das `$J=G91 G21 Y2440 F3000` – etwa 49 s
  Fahrt (`T: Dauerfahrt nicht referenziert …`; `profiles/lowrider-v4.json:9-27`). Referenziert und mit Softlimit fährt sie bis zum
  Ende des Profil-Verfahrwegs (`lib/motion.ts:62-63`).
- FluidNC begrenzt das nicht: `machine/config.yaml:29,72,143` `soft_limits: false`, `:44,87,115,158,186` `hard_limits: false`
  (die Endschalter sind nur zum Referenzieren da; `docs/bewertung/01-fakten.md`: "`soft_limits` ist in der `config.yaml` aus").
- Das Loslassen sendet ein Jog-Cancel (0x85) (`store/jog.ts:53-67`, `store/machine.ts:682-685`). Bricht der Link in diesem
  Moment weg, kommt das Byte nicht an, und FluidNC fährt zu Ende. Die App sendet **nichts** zusätzlich (`T: Dauerfahrt …`:
  `realtime() == []` nach dem Abbruch).
- Es gibt **keinen Verbindungswächter**: `connection.ts:340-345` sendet `?` alle 200 ms, prüft aber nie, ob Antworten kommen.
  Bleibt ein WLAN-Abriss ohne `close`-Ereignis (Vermutung: Browser merken das erst nach Sekunden bis Minuten; nicht gemessen), zeigt die App weiter
  "Verbunden/Idle", und PAUSE/NOT-HALT melden "gesendet", ohne dass etwas ankommt (`T: Stiller Linkausfall`: nach 120 s
  Funkstille `connection = connected`, Log "Not-Halt gesendet (Vorschub-Halt + Soft-Reset)").
- Einstufung: BLOCKIEREND für den ersten Test an der Maschine, weil die Y-Achse nicht fertig ist, nicht referenziert wird und FluidNC keine
  Grenzen erzwingt; die Gegenmaßnahme (kurze Schritte wie beim Joystick) ist klein.
- Vergleich: Der Joystick fährt in 100-ms-Häppchen (`store/machine.ts:1207-1233`, `lib/motion.ts:113-133`) und ist davon nicht
  betroffen; Schrittfahrten ebenfalls nicht.
- Empfehlung: Dauerfahrt als Folge kurzer `$J`-Schritte (wie der Joystick) oder Länge begrenzen; Statuswächter (z. B.
  > 1 s ohne Status → "Verbindung unsicher", Fahrt-Tasten sperren).

### WICHTIG

**W1 – Leertaste (PAUSE) wirkt nicht, wenn ein Eingabefeld, eine Auswahlliste oder ein Schieberegler den Fokus hat.**

- `store/keys.ts:46` (`typingInto`) / `lib/shortcuts.ts:375-381` (`INPUT`, `TEXTAREA`, `SELECT`, editierbarer Text) verwirft die Taste vor
  dem Pause-Zweig. Die Vorgabe lautet "PAUSE … nie gesperrt, zusätzlich per Leertaste".
- Besonders wirksam: Der Vorschub-/Spindel-Override ist ein `<input type="range">` (`components/Override.tsx:58-70`); nach dem Bedienen
  bleibt der Fokus dort. `UI: Leertaste nach Bedienung des Vorschub-Schiebereglers …`: Fokus = `INPUT.range`, 0 Feed-Holds.
  `T: Leertaste bei Fokus in Eingabefeld/Auswahlliste …`: 0 von 3 (INPUT/TEXTAREA/SELECT). Der e2e-Test legt das so fest
  (`e2e/find.spec.ts:311-326` für Textfelder), den Slider-Fall prüft er nicht.
- Der PAUSE-Knopf selbst ist nie gesperrt (`components/PauseButton.tsx:12-40`, kein `disabled`, Kopfkommentar Z. 7).
- Empfehlung: für Bereichs-Eingaben (`type=range`, Checkbox, Radio) die Leertaste nicht abfangen lassen; nur Textfelder ausnehmen.

**W2 – NOT-HALT stoppt keine laufenden App-Abläufe zwischen zwei Fahrten (nach Code-Lektüre; nicht ausgeführt).**

- `emergencyStop` (`connection.ts:323-328`, `store/machine.ts:600-607`) sendet `!`, `0x18`, bricht den Streamer ab und weist offene
  Befehle zurück. Das stoppt jede Fahrt, die gerade auf ihr `G4 P0`/`ok` wartet (der Aufruf kommt mit Fehler zurück).
- Die Mehrschritt-Abläufe haben aber **Pausen ohne offenen Befehl** (`wait(settleMs)`, Kamerabild abwarten, `settled()`):
  Foto-Scan (`store/photomap.ts:263-317`), Kalibrier-Messungen (`store/calibration.ts:340-390`), Serien-/Vorrichtungs-/Wende-/Abschnitts-Abläufe
  (`store/series.ts:278-325`, `store/jigs.ts:244-294`, `store/flip.ts:262-287`, `store/sections.ts:284`). Sie kennen nur ihr eigenes
  `cancelled` (gesetzt nur über "Abbrechen", z. B. `store/photomap.ts:319-321`, `store/calibration.ts:414-416`); ein Reset
  (`'reset'`/`'alarm'`-Ereignis, `store/machine.ts:487-500`) bricht sie nicht ab. Trifft der Reset in so eine Pause und geht die Steuerung
  danach auf `Idle` (`machine/config.yaml:273` `must_home: false`), schickt der Ablauf die nächste `G90 G53 G1 …`-Fahrt.
  Gestartet werden alle per Halten; der Fehler ist, dass NOT-HALT sie nicht beendet. Der "Abbrechen"-Knopf des Foto-Scans stoppt die
  laufende Fahrt auch nicht (nur die nächste), `store/photomap.ts:319-321`.
- Verwandt (Vermutung, nicht getestet): fällt der Link in so einer Pause kurz weg, verbindet der Auto-Reconnect nach 2 s neu (`lib/link.ts:77-79` zählt nur
  `fileJob`/`stream` als Job, `store/machine.ts:437-440`), und der Ablauf nutzt über das modulweite `connection` (`store/machine.ts:1159-1161`) die neue
  Verbindung für seine nächste Fahrt, falls die Pause (`settleMs`, `settled()` bis 5 s) länger dauert als das Wiederverbinden.
- Empfehlung: `emergencyStop`/`welcome`/`alarm`/Verbindungsverlust setzt global ein "Abgebrochen"-Flag (Generation), das jeder Ablauf vor jedem
  Befehl prüft.

**W3 – Stiller oder halb toter Socket: PAUSE/NOT-HALT melden Erfolg oder werfen.**

- Fall "Funkstille" siehe B3 (`T: Stiller Linkausfall`). Der Bediener sieht "Not-Halt gesendet" und glaubt, die Maschine halte.
- Fall "Socket schließt gerade" (`readyState ≠ 1`, `onclose` noch nicht gefeuert): `connection.ts:330-333` wirft `Not connected` aus
  `realtime()`; `store/machine.ts:609-611` (`feedHold`) und `:600-607` (`emergencyStop`) fangen das nicht ab → unbehandelte Ausnahme
  im Klick-Handler, **keine** Meldung (nicht einmal `estop.notConnected` mit "Hardware-Not-Aus benutzen!", `i18n/de.ts:660`).
  `T: Socket tot, aber onclose noch nicht gefeuert`: alle drei werfen; `releaseAllHolds()` bricht dabei mit einer Ausnahme ab, die
  übrigen Halte werden nicht mehr gelöst (`lib/holds.ts:23-28`).
- Der Zeitraum ist kurz, aber genau der Moment, in dem man bremsen will. Empfehlung: `try/catch` um `realtime()` und bei Fehler sofort
  die rote Meldung "nicht gesendet – Hardware-Not-Aus!".

**W4 – Wiederaufnahme ab Zeile: Startzeile wird aus *quittierten* Zeilen vorgeschlagen; Programm schaltet die Spindel vor dem Anheben ein.**

- Der Vorschlag nimmt `lastAcknowledgedSource + 1` (`components/ResumeCard.tsx:23,33`, `packages/fluidnc-client/src/streamer.ts:111`). `ok` heißt "im Planer", nicht
  "gefahren". Nach NOT-HALT/Reset sind bis zu etwa 15 quittierte Blöcke nie gefahren → Vorschlag zu spät, Schnittstücke werden stillschweigend
  übersprungen (Vermutung zum Planer-Umfang; der Mechanismus ist im Code sichtbar).
- `resumeFrom` erzeugt zuerst `S… M3`, dann `G53 G0 Z<sicher>`, rapid XY, Eintauchen (`packages/gcode-core/src/resume.ts:57-65`): die Spindel
  läuft an, bevor der Fräser angehoben ist. Ein Vergleich des aktuellen Nullpunkts mit dem des abgebrochenen Jobs findet nicht statt
  (nur G92/G10 im Programm werden gewarnt, `resume.ts:44-47`). Schutz: Halten 1000 ms, `homed` Pflicht (`components/ResumeCard.tsx:85-91`).

**W5 – Gamepad: kein Loslassen beim Abziehen/Ausfall des Pads.**

- `components/JogCard.tsx:224-240`: das Loslassen hängt an `if (gp)` (Zeile 227). Verschwindet das Pad mit ausgelenktem Stick, bleibt `held`
  gesetzt; das Cancel kommt nie (kein `blur`, kein `visibilitychange`). Folge wie B3 (volle relative Fahrt). Der Betreiber verlangt
  kein Gamepad (`02-ziele.md` Abschn. 6), der Code ist aktiv, sobald das Jog-Panel online offen ist (`JogCard.tsx:414-415`).
  Empfehlung: Gamepad-Eingabe ausblenden/abschaffen oder `gp == null` als Loslassen behandeln.

**W6 – `$H` und andere lange Befehle laufen in den 10-s-Timeout; PAUSE während der Referenzfahrt wirkt vermutlich nicht.**

- `home()` → `command('$H')` mit Standard-Timeout 10 s (`store/machine.ts:635-639`, `connection.ts:251-259`); eine Referenzfahrt dauert länger,
  der Aufruf meldet Fehler, der Eintrag verschwindet aus der Warteschlange, das spätere `ok` landet beim nächsten wartenden Befehl
  (falsche Zuordnung). Gleiches für `homeAxis` (`store/machine.ts:687-689`). Schaden: falsche Rückmeldung, im Einzelfall verschobene
  Quittungen (nicht ausgeführt, nur Code).
- Der Space-Pfad zählt `Home` als "bewegt sich" (`store/keys.ts:19-29`) und sendet `!`. Ob FluidNC `!` im Homing annimmt, ist nicht geprüft
  (Vermutung: nein, nur Reset hilft; dann ist NOT-HALT der einzige Weg).

### HINWEIS

- **H1** Einmal-Fortsetzen ist uneinheitlich: Statusleiste/Fräsen-Schritt verlangt 500 ms Halten (`components/ActionBar.tsx:139-147`), `RunBar`
  und Referenz-Karte fortsetzen mit einem einfachen Klick (`components/RunBar.tsx:36`, `components/HomingCard.tsx:84-92`). Die Vorgabe
  ("Fortsetzen: ein Tipp") passt zu Letzterem; Einheitlichkeit herstellen. Fortsetzen ist **kein** Tastenkürzel.
- **H6** Einzelsatz: `Nächster Satz` und `Einzelsatz aus` sind einfache Klicks (`components/RunScreen.tsx:237-241`); "Einzelsatz aus" setzt den Stream am Haltepunkt
  fort und sendet dann den **ganzen Rest** des Jobs (`store/machine.ts:1243-1256`, `streamer.ts:150-157`) – ein Klick statt Halten. Gilt nur im Streaming-Modus.
- **H7** Pi herunterfahren (`components/CompanionCard.tsx:107-135`) ist ein Halten, gesperrt nur in den `BUSY`-Zuständen; ein Stream, der an einem Werkzeugwechsel
  hält (Zustand `Idle`), wird damit beendet, ohne dass die App warnt. Die Pi-API hat keine Anmeldung und `Access-Control-Allow-Origin: *`
  (`apps/companion/src/server.ts:89-94, 124`): jedes Gerät im Werkstattnetz kann `POST /api/system/shutdown` senden (das Netz ist ohne Internet).
- **H8** Weitere Transporte: HTTP nur als Upload auf die SD-Karte/den Flash (`packages/fluidnc-client/src/http.ts:12,49-58`; kein `/command`), Firmware-Flashen über USB-Seriell
  (`components/FirmwareCard.tsx`, Halten). `apps/ios` enthält nur eine Beschreibung (`apps/ios/README.md`), keinen Code.
- **H2** Adaptiver Vorschub (Sensor, aus): ändert bei `Run` selbständig den Override 30–120 % in ±5-%-Schritten (`store/sensors.ts:35-48`,
  `packages/workshop/src/adaptive.ts:21-44`). Standard aus (`store/workshop.ts:132`). Mit zwei Clients, die beide das Sensor-WebSocket
  hören, würden beide stellen (Vermutung; Einstellung liegt im geteilten Workshop-Store?). Nicht in den Vorgaben des Betreibers.
- **H3** Konsole (MDI) sendet beliebige Zeilen ohne Zustandsprüfung und ohne Halten (`components/ConnectionCard.tsx:262-273`); das ist Experten-Bereich,
  der Bediener tippt und bestätigt mit Enter. Dasselbe für das Schreiben von `$key=value` im Einstellungs-Browser (`components/SettingsBrowser.tsx:36-38`).
- **H4** `command()` blockiert nur Aufträge des eigenen Clients (`connection.ts:244-250`); ein SD-Job, der von einem anderen Gerät läuft, hindert
  einen MDI-Befehl hier nicht.
- **H5** Die Dokumentation sagt es selbst: "Keine Sicherheitsfunktion im Browser. Not-Halt, Soft-Limits und Endschalter sind Sache der Steuerung und der
  Hardware" (`docs/projektbeschreibung.md:132`), die Meldung ohne Verbindung sagt "Hardware-Not-Aus benutzen!" (`i18n/de.ts:660`), und `docs/erste-schritte.md:4`
  verlangt "Hand am Hardware-Not-Aus". Ein Software-NOT-HALT (WLAN → Pi → FluidNC, `!` + `0x18`) ist **kein Ersatz** für einen Hardware-NOT-AUS (offen:
  Verdrahtung, `docs/ideen.md:224`).

## Bestätigt gut (Auszug der Prüfungen)

- **(a) Wiederverbinden**: Nach einem Reconnect geht nur `?`, `$I`, `$G`, `$#` (und `$SD/List`, wenn die SD-Karte sichtbar ist) hinaus
  (`store/machine.ts:545-546, 848-857`, `components/SdCard.tsx:27`; `apps/control/test/link.test.ts:178-181`). Nichts Bewegendes, nichts
  setzt einen Job fort. Auto-Reconnect nur außerhalb eines Jobs und nie nach einem Verlust im Job, bis von Hand verbunden wird
  (`lib/link.ts:77-79`, `store/machine.ts:449-457`; `link.test.ts`: "never reconnects by itself during a job…"). Ein abgebrochener Stream bleibt "aborted".
- **(b) Jog**: Dauerfahrt: Pointer-Capture, `pointerup`/`pointercancel`/`lostpointercapture`, Gleiten über den Rand, `disabled` unter dem Finger
  (`components/JogCard.tsx:75-110`), Fensterverlust/Tab-Wechsel/`pagehide` (`lib/holds.ts:39-54`, gestartet in `store/platform.ts:26`),
  Tastatur: `keyup`, Fensterverlust, Dialog (`JogCard.tsx:158-209`), Joystick/Wheel mit eigenem Loslassen (`JogStick.tsx:58-103`, `JogCard.tsx:277-360`).
  Jog-Cancel = 0x85 (`machine.ts:682-685`), keine Verbindung → `connection?.` ist ein Nichtstun (`T: Dauerfahrt…`: danach kein Fehler).
  Der e2e-Bestand prüft `0x85` für blur/visibility/pointercancel (`e2e/ipad.spec.ts:238-302`, `e2e/areas.spec.ts:194-315`; von mir nicht neu ausgeführt).
  Ausnahmen: B3, W3, W5.
- **(c) Tippen aufs Bild**: ein Tipp setzt nur einen Punkt (`lib/gesture.ts`, `components/StageTools.tsx:195-222`); gefahren wird erst mit
  Halten 800 ms (`StageTools.tsx:134-149`, `components/SetZeroCard.tsx:210-212`), Nullpunkt setzen ebenso (`SetZeroCard.tsx:280`,
  `components/ZeroTool.tsx:82`); `moveTo` fährt als `$J=` (abbrechbar) und nur im Zustand `Idle` (`StageTools.tsx:106`).
  Doppeltipp zoomt nur (`components/TableView.tsx:652-665`).
- **(d) Tasten**: nur zwei Maschinentasten: Leertaste (Feed-Hold) und Esc (nur eine Frage "Job abbrechen?", `store/keys.ts:58-62`); keine Taste für Start,
  Fortsetzen, Referenzfahrt, NOT-HALT (`lib/shortcuts.ts:111-133`, `store/keys.ts:6-11`). Pfeiltasten/Bild-auf/ab jogen, solange das Jog-Panel offen ist, die
  Maschine verbunden ist und nichts getippt wird; mit Strg/Alt nie (`JogCard.tsx:169-193`); `1–5` ändern nur die Schrittweite. Leertaste in Eingabefeldern: W1.
- **(f)/(g) Auslöser und Schutz** siehe Tabelle: Start, Referenzfahrt, Nullpunkt-Fahren, Antasten, Wende/Serie/Abschnitte/Vorrichtungen, Werkzeugwechsel-Weiter und
  Makros laufen über `HoldButton` (`components/HoldButton.tsx`: 500–1000 ms Halten, löst bei Zweitfinger, Pointer-Verlust, Blur, Tab-Wechsel). Fast alle sind zusätzlich auf `Idle`
  gesperrt (`HoldButton.tsx:88-91`, jeweils `disabled={!idle}`). **Ausnahme Referenzfahrt**: `components/ActionBar.tsx:76-82`, `components/Readiness.tsx:68` und
  `components/HomingCard.tsx:62` sind nur auf `online` gesperrt (die Schnellaktion `JogCard.tsx:365-400` und `StartScreen.tsx:252` prüfen `Idle`/`Alarm`); `$H` ist
  nicht mit Jog-Cancel abbrechbar (W6). Einfache Klicks (kein Halten) gibt es für Schritt-Jogs, `ZeroCard.tsx:24` (Nullpunkt, `G10 L20`, keine Fahrt), `WcsCard.tsx:32`
  (Arbeitssystem G54–G59 wählen, keine Fahrt, aber der nächste Job nutzt es) und die Einzelsatz-Tasten (H6). Es gibt **keinen** Auto-Start eines SD-Jobs, keinen Auto-Resume, keine Makros bei Ereignissen
  (`store/macros.ts` nur über `MacroButtons.tsx:19`). Automatische Folgeschritte nur: (1) nach einem Teil eines Mehr-Werkzeug-SD-Jobs: `M5`, Anheben, ggf. `G53 G0` zur Wechselposition
  (`store/run.ts:141-152`), das nächste Teil startet nicht von selbst; (2) im Stream bei `M6`: `M5`, Anheben, Wechselposition (`store/machine.ts:993-1015`); Weiter-Taste = Halten,
  danach Anheben, `M3 …` (`spindleRestore`), `release()` (`machine.ts:1022-1033`, `components/ToolChangeCard.tsx:138`) – die Spindel läuft nach "Weiter" von selbst wieder an, ohne weitere Rückfrage.
- **(e) Zwei Clients, Verbindungsabbruch des streamenden Clients**: siehe B2 – das Relay und der Pi tun dabei nichts Gefährliches (`T: Jeder Client darf …`).
- **Pi-Seite** (`apps/companion/src/*`): der Pi sendet an die Maschine nur durchgereichte Client-Daten und den Recorder-Status `?`. Kein Reset, kein Feed-Hold, kein `M5` bei Client-Abbruch.
  Solange eine Aufzeichnung läuft, hält der Recorder den Upstream offen (`server.ts:256-281`), sonst schließt `relay.ts:129-135` ihn.
- **PAUSE/NOT-HALT**: PAUSE = `!` (`store/machine.ts:609-611`, `packages/fluidnc-client/src/realtime.ts:5`), wirkt beim Aufsetzen des Fingers (`PauseButton.tsx:25-34`);
  NOT-HALT = `!` dann `0x18` (`connection.ts:323-328`), ebenso beim Aufsetzen (`components/EStopButton.tsx:17-26`). Beide sind **immer gerendert**
  (`components/StatusBar.tsx:203-204`), nie `disabled`, liegen außerhalb der Dialogflächen (Dialoge sind `absolute inset-0` im Arbeitsbereich: `ui/dialog.tsx:63,78`;
  e2e `find.spec.ts:268-276, 395-520`), im Telefon-Layout sichtbar (`UI: PAUSE und NOT-HALT … phone`, 390 px, beide im Viewport und treffbar). Einzige Lücken: ohne Verbindung
  tut PAUSE nichts und sagt nichts (`machine.ts:610`, nur NOT-HALT meldet das, `machine.ts:601-604`); im Zustand "connecting" gilt die Verbindung noch nicht als bestehend
  (`machine.ts:601`); W1, W3.
- **Demo/Simulator**: `startFullDemo` fährt nur auf einer frischen Seite an (`store/demo.ts:44-59`); mit bestehender echter Verbindung wäre `connect()` ein No-op
  (`machine.ts:383`) und die Demo würde auf der echten Maschine `home()`/`moveMachine()` aufrufen – über die Oberfläche nicht erreichbar (nur URL `#demo`/`#simulator` beim Laden;
  Vermutung, nicht ausgeführt).

## Aufrufer-Tabelle: alles, was zum Transport geht

Alle Sendewege laufen über genau drei Funktionen in `packages/fluidnc-client/src/connection.ts`: `sendLine` (:229), `realtime` (:235) und intern `sendLine` aus dem Streamer (:316).
`apps/control` greift nur über `store/machine.ts` zu (kein Aufruf von `sendLine`/`realtime` in Komponenten). Der Pi (`apps/companion/src/relay.ts:82-85`) reicht unverändert durch.

Spalten: Auslöser = Benutzer (Klick/Halten/Taste), Timer/Effect, Netzwerk (Maschine/Relay/anderer Client), Ablauf (Skript/Makro/Warteschlange). "bewegt?" = kann eine Achse/Spindel in Gang setzen.

| Aufrufer (Datei:Zeile) | Befehl(e) | Auslöser | bewegt? | Schutz |
|---|---|---|---|---|
| `connection.ts:205,343` Status-Poll | `?` (alle 200 ms) | Timer | nein | nur Statusabfrage; **ohne** Antwortprüfung (B3) |
| `machine.ts:545-546,848-857` nach Verbinden/`refreshState` | `$I`, `$G`, `$#` | Netzwerk (Verbunden), Karten öffnen | nein | nur Lesen; Zuordnung leidet bei zwei Clients (B2) |
| `SdCard.tsx:27` → `machine.ts:736-743` | `$SD/List` | Effect (Karte sichtbar) | nein | nur Lesen |
| `PauseButton.tsx:25-34`, `ActionBar.tsx:159`, `RunBar.tsx:38`, `HomingCard.tsx:80`, `keys.ts:55` (Leertaste), `AbortDialog`→`stopJob` | `!` (0x21) | Benutzer (Tipp/Taste) | hält an | nie gesperrt (außer Leertaste im Feld, W1) |
| `ActionBar.tsx:143`, `RunBar.tsx:36`, `HomingCard.tsx:89` → `machine.ts:613-615` | `~` (0x7E) | Benutzer: Halten 500 ms (ActionBar) / Klick (RunBar, Referenz-Karte) | **ja** (setzt Hold fort) | uneinheitlich (H1); kein Tastenkürzel |
| `EStopButton.tsx:17-26` → `machine.ts:600-607` → `connection.ts:323-328` | `!`, `0x18` | Benutzer (Aufsetzen) | stoppt | nie gesperrt; ohne Verbindung nur Hinweis; Abläufe laufen weiter (W2) |
| `machine.ts:785-797` `stopJob` (AbortDialog, ToolChangeCard) | `!`, warten bis Hold, `!`+`0x18` | Benutzer: Rückfrage-Dialog | stoppt | Rückfrage (Esc/Knopf); Job läuft während der Frage weiter |
| `JogCard.tsx:95-110` JogButton | `$J=…` (Schritt) / Dauerfahrt `$J=` ganzer Weg | Benutzer (Klick / Halten) | **ja** | nur Zustand `Idle`/`Jog` (`lib/jog.ts:17-21`), `jogHold` registriert Halt; B3 |
| `JogCard.tsx:169-209` Tastatur | wie oben | Benutzer (Pfeile/Bild) | **ja** | nicht in Feldern/Dialogen, `keyup`/Blur lösen; B3 |
| `JogCard.tsx:216-264` Gamepad | wie oben | Benutzer (Pad) | **ja** | Pad-Ausfall löst nicht (W5) |
| `JogStick.tsx:58-103` → `machine.ts:1207-1241` | `$J=` (100-ms-Schritte), `0x85` | Benutzer (Ziehen) | **ja** | kleine Schritte; Loslassen = Cancel; `blur`/Seitenverlust |
| `JogWheel.tsx:86`, `ServiceCards.tsx:52`, `SetZeroCard.tsx:262`, `CameraSetupCard.tsx:131` | `$J=` Schritt (`jog`) | Benutzer (Klick/Rad) | **ja** | `Idle`; Softlimit nur referenziert |
| `JogCard.tsx:365-400` Schnellaktionen | `moveTo` (`$J=`), `home` (`$H`) | Benutzer: Halten 800 ms | **ja** | `quickReason` (Idle, Verbindung, Park/Null gesetzt) |
| `StageTools.tsx:134-149`, `SetZeroCard.tsx:89-97` | `moveTo` → `$J=` (Anheben, dann XY) | Benutzer: Tipp setzt Punkt, **Halten 800 ms fährt** | **ja** | `Idle`; mit "tief"-Bestätigung (`SetZeroCard.tsx:76-77,122`) |
| `ZeroTool.tsx:82`, `SetZeroCard.tsx:110,320`, `holes.ts`, `demo.ts` | `G10 L20/L2 …` (`setZeroAt`) | Benutzer: Halten | nein (Nullpunkt) | `Idle` |
| `StartScreen/ActionBar/Readiness/HomingCard` | `$H`, `$HX/Y/Z`, `$X` | Benutzer: Halten 800 ms | **ja** (Referenzfahrt) / nein (`$X`) | `Idle`/`Alarm`; **10-s-Timeout** (W6) |
| `ActionBar.tsx:189-203` → `start.ts:134-152` → `run.ts:90-153` | HTTP-Upload, `$SD/Run=…` | Benutzer: Halten 1000 ms + ggf. Warnbestätigung (Halten) | **ja** (Job) | `blocking`/`idle`/`busy` (`start.ts:101-108`); Maschine läuft ohne App weiter |
| `SdCard.tsx:76-85` | `$SD/Run=…` | Benutzer: Halten 800 ms | **ja** | `idle`, `fileJob === null`, nicht gesperrt |
| `run.ts:141-152` nach Teil | `M5`, Anheben, `G53 G0 X Y` | **Ablauf** (nach `ok` auf `$SD/Run`) | **ja** | nur nach regulärem Ende eigenen Jobs; mit Fremd-`ok` fälschlich mitten im Job (B2) |
| `RunCard.tsx:50-62` → `machine.ts:948-1020` (`connection.ts:306-320`) | Programmzeilen (Streamer) | Benutzer: Halten 1000 ms | **ja** | `idle`, `!busy`; Abbruch: B1 |
| `ResumeCard.tsx:85-92` → `streamJob` | `S… M3`, `G53 G0 Z`, `G0 XY`, `G1 Z`, Programm | Benutzer: Halten 1000 ms | **ja** | `ready` + `homed`; W4 |
| `machine.ts:993-1015` Hold bei `M6` | `$G`, `$#`, `M5`, Anheben, `G53 G0 XY` | **Ablauf** (Stream hält vor M6) | **ja** | Teil des vom Bediener gestarteten Streams |
| `machine.ts:1022-1033` ← `ToolChangeCard.tsx:138` | Anheben, `M3 S…` (`spindleRestore`), `release()` | Benutzer: Halten | **ja** (Spindel an, Job weiter) | nur nach dem Wechsel-Dialog |
| `machine.ts:699-718` `probeZ`, `:886-913` Wizard/`JobTools`/`Autolevel`/`ToolChangeCard:117` | `G38.2 …`, `G10 L20`, `G0`/`G1` (abs.) | Benutzer: Halten | **ja** (Antasten) | `Idle`; Weg `maxTravel`; `G90` nach Fehler im Wizard |
| `RunScreen.tsx:134-139` → `machine.ts:1035-1053` `frame` | Rahmen abfahren (Anheben, Eckfahrten, `frameLines`) | Benutzer: Halten 800 ms | **ja** | `HoldButton`, gesperrt ohne Verbindung/`Idle`/bei laufendem Job/leeren Grenzen (`RunScreen.tsx:135`); `G53`-Anheben erst bei referenziert |
| `RunScreen.tsx:237` → `machine.ts:1251-1256` `stepNext` | die nächste Programmzeile (Streamer `release()`) | Benutzer: **Klick** | **ja** (ein Satz) | nur im Einzelsatz-Haltepunkt eines laufenden Streams |
| `RunScreen.tsx:240` → `machine.ts:1243-1249` `setSingleStep(false)` | Rest des Jobs (Streamer `release()`) | Benutzer: **Klick** | **ja** (Rest des Jobs) | nur im Haltepunkt eines laufenden Streams (H6) |
| `ZeroCard.tsx:24`, `WcsCard.tsx:32` | `G10 L20 …`, `G54…G59` | Benutzer: Klick | nein | `Idle`; ändert Nullpunkt/Arbeitssystem |
| `machine.ts:745-765`, `store/limits.ts`, `FirmwareCard.tsx` | HTTP-Upload (SD/Flash), Konfig, USB-Flash | Benutzer: Halten | nein | Rücklesen/Backup, Halten |
| `machine.ts:1159-1205` `moveMachine/moveZ` (`photomap.ts:263`, `calibration.ts:283,384`, `series.ts:278-325`, `jigs.ts:244-294`, `flip.ts:262-287`, `sections.ts:284`) | `G90 G53 G1 …`, `G4 P0`, `$J=` | Benutzer: Halten; danach **Ablauf** in Schleifen | **ja** | `Idle`; Softlimit nur referenziert; NOT-HALT beendet Pausen nicht (W2) |
| `MacroButtons.tsx:19` → `machine.ts:799-809` | beliebige Makrozeilen | Benutzer: Halten 500 ms | **ja** | `idle`; bricht bei erster Fehlermeldung ab |
| `ConnectionCard.tsx:262-273` Konsole | beliebige Zeile (MDI) | Benutzer: Eingabe + Enter | **ja** | nur `online` (H3) |
| `SettingsBrowser.tsx:36-38`, `ConfigEditor.tsx:132`, `limits.ts:121`, `calibration.ts:405`, `machine.ts:825-846` | `$key=value`, `$CD=…` | Benutzer: Halten/Bestätigen | nein (Konfiguration) | Backup + Rücklesen, Halten |
| `Override.tsx` → `machine.ts:720-734` | 0x90–0x9D | Benutzer (Klick/Schieber) | ändert Tempo | Bereich 10–200 % (`packages/fluidnc-client/src/realtime.ts:29-30`) |
| `sensors.ts:35-48` → `machine.ts:720-723` | 0x91–0x94 | **Timer/Netz** (Sensorwert vom Pi) | ändert Tempo | Standard aus; nur bei `Run`; 30–120 % (H2) |
| Relay `relay.ts:82-85` (jeder Client) | alles, was ein Client sendet | Netzwerk/anderer Client | je nach Inhalt | keine Zuordnung/Besitzer (B2); vor offenem Upstream verworfen |
| Pi `recorder.ts:335-336` | `?` (1 Hz) | Timer (Aufzeichnung) | nein | nur Status |

Nicht in der Tabelle, weil sie nichts senden: Schnellsuche (`lib/commands.ts`: nur Navigation/Ansicht; einzig `drive.feedHold` = `!`), Serien-/Abschnitts-Abonnements
(`store/series.ts:457-463`, `store/sections.ts:623-660` erzeugen nur neue Programme), `startNotifications`, `startWake`.

## Nicht geprüft (braucht echte Hardware)

- Ob FluidNC bei WebSocket-Abbruch wirklich nichts tut (kein Auto-Hold, keine Spindelabschaltung), und wie lange der Puffer (RX 127 + Planer) noch fährt.
- Ob FluidNC `!` im Homing und in `G38.2` annimmt; ob `0x85` eine laufende relative Fahrt über 2440 mm sofort stoppt; Verhalten von `$J=` bei `soft_limits: false`.
- Wie FluidNC ein Fremd-`$G`/`$I` während `$SD/Run` beantwortet (`ok`, `error:` oder Blockieren) und was ein überfüllter RX-Puffer macht (B2).
- Zustand der Steuerung nach `0x18` (Idle oder Alarm) auf der echten Platine, damit W2 praktisch wirksam wird; Spindel nach Reset.
- Echte Latenz WLAN → Pi → FluidNC für NOT-HALT/PAUSE; Erkennungszeit eines stillen Linkausfalls im iPad-Safari und im Windows-Browser; Verhalten bei iPad-Standby.
- Ob die Not-Aus-Verdrahtung die Versorgung trennt (offen: `docs/ideen.md:224`).
- Mit echtem Gamepad: Abziehen im Betrieb (W5 nur per Code gezeigt).
- Nicht per Test belegt (nur Code): W2 (Pausen zwischen Fahrten), W4 (Startzeilen-Vorschlag), W6 (Timeout-Zuordnung), H2.
- Die bestehenden e2e-Tests (`pnpm e2e`) habe ich nicht neu ausgeführt; zitiert werden sie nur als Fundstelle.

## Zusammenfassung in einem Satz

Der Standardweg (Halten → SD-Karte) ist sicher aufgebaut; vor dem ersten Test an der Maschine sollten **B3** (Dauerfahrt über den ganzen Verfahrweg ohne
Verbindungswächter, `soft_limits`/`hard_limits` aus) und **B1** (Streaming-Abbruch ohne rote Meldung) behoben werden; **B2** (zwei Geräte am Relay: Fremd-`ok`
beendet den SD-Job im Erstgerät, danach sendet es von selbst Fahrbefehle) ist ein Grund, bis dahin nur mit **einem** Gerät verbunden zu sein.
