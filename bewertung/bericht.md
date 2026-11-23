# Unabhängige Bewertung – LowRider Control (Stand `cnc-steuerung-stand.zip`)

Erstellt nach `03-auftrag.md`. **Am Code des Betreibers wurde nichts geändert**; die Mutationen liefen in einer
Wegwerf-Kopie mit eigenem Git (Ausgangs-Commit „baseline“, am Ende `git status` leer). Dieser Bericht wartet auf Freigabe der
Änderungsliste (Teil 4).

Herkunft der Aussagen – jede trägt eine Marke:

- **[selbst]** von mir im Quelltext gelesen oder in der App/den Tests beobachtet (Datei:Zeile, Screenshot, Skript).
- **[Teilbericht]** aus einem der vier Teilberichte unter `bewertung/teile/` (Subagenten, mit Datei:Zeile). Von mir nur stichprobenhaft nachgeprüft; die nachgeprüften Stellen sind unten benannt.
- **[Vermutung]** nicht belegt.

Reihenfolge der Arbeit: erst `00-erstes-urteil-blind.md` (festgeschrieben und gepusht), **danach** erst `CLAUDE.md`, `DESIGN.md`
und `docs/umbau-guide.md` gelesen. Die Teilprüfer durften die drei Dateien ebenfalls nicht öffnen.

---

## Teil 1 – Ergebnisse

### Die fünf wichtigsten Aussagen

1. **Die Oberfläche folgt noch der alten Vorgabe, nicht den Zielen.** Die fünf festen Schritte, die Sperre des Starts durch die
   Schrittlogik und die „Tiefe pro Bereich“ stammen aus `DESIGN.md` (dort „verbindlich“). `02-ziele.md` verlangt das Gegenteil
   („keine vorgegebenen Schritte“, „im CAM-Bereich nur CAM“). Das ist kein Programmierfehler, sondern ein Widerspruch zwischen
   zwei Vorgaben des Betreibers. `DESIGN.md` verlangt selbst: „erst nachfragen“. **Das muss der Betreiber entscheiden** (Teil 3).
2. **Bedienschritte, frischer Start, Simulator:** G-Code laden und fräsen **14 Eingaben**, Rechteck zeichnen und fräsen **15**
   [selbst]. Die 6 aus dem Projekt-Test gelten nur für einen *bekannten, wiederholten* Job. Bei „Einzelstücken“ trifft das nicht zu.
3. **An der Maschine ist nichts abgenommen** (Fakten, `umbau-guide.md` Etappe 14). Das gilt auch für Kamera ±0,2 mm und
   < 30 s: es gibt **keine einzige Messung**; mit der vorhandenen Technik ist ±0,2 mm nur im „Fadenkreuz in Bildmitte“-Weg
   plausibel, nicht beim Tipp am Bildrand [Teilbericht, Vermutung].
4. **Sicherheit:** Die Vorgabe „Verbindung bricht ab → Maschine läuft weiter, rote Meldung“ gilt für den Standardweg (SD-Karte),
   **nicht für gestreamte Jobs**; bei Streaming fehlt außerdem die rote Meldung (Fehler in der Reihenfolge, [selbst] geprüft).
   Dazu kommen zwei Fälle, in denen die App etwas bewegt, das niemand ausgelöst hat (Dauerfahrt ohne Referenz über den ganzen
   Weg; zwei Geräte am Relay). Details in Aufgabe 4.
5. **Die Tests sind in den Bibliotheken ehrlicher als die Oberfläche:** 100 % Abdeckung wird wirklich erzwungen, aber 5 von 14
   handgemachten Mutationen überlebten, darunter die Start-Sperre bei einem einzelnen G-Code-Fehler [selbst nachgeprüft].
   Die Wächter im Store (`machine.ts`, `start.ts`) sind von Unit-Tests praktisch nicht gedeckt.

### Aufgabe 1 – Bedienbarkeit

**Zählregel (vorher festgelegt):** 1 Klick/Tipp = 1; 1 Halten = 1; 1 Tastendruck = 1; Dateiauswahl im Systemdialog = +1 (zusätzlich
zum Klick, der ihn öffnet); Scrollen, weil ein Knopf unter dem sichtbaren Rand liegt = +1; Warten zählt nicht. Frischer Zustand
(`lowrider-control.html#simulator`, Speicher leer, **nicht referenziert**), keine Abkürzung über den Store (`skripte/stepper.cjs`).
Fenster: Desktop 1440 × 900 und iPad-Fenster 1180 × 820 (Chromium, kein Safari). Ergebnis in beiden Fenstern gleich.

**A – fertigen G-Code laden und fräsen: 14 Eingaben** (Testdatei `testdaten/rechteck-aussen.nc`, 60 × 40 mm Außenkontur):

| # | Eingabe | Belegbild |
|---|---|---|
| 1 | „Neuer Job“ | `A8-1440x900-01` |
| 2–3 | „G-Code öffnen“ + Auswahl im Systemdialog | `A8-1440x900-03` (Job geladen; Schritte ③–⑤ noch gesperrt: `A-frasen-gesperrt.png`) |
| 4 | Schritt „Einrichten“ | `A8-1440x900-04` |
| 5 | Ziel im Bild antippen | `A8-1440x900-05` |
| 6 | „Fräser hierhin“ (Halten) | `A8-1440x900-06` |
| 7–8 | Scrollen + „Nullpunkt hier setzen“ (Halten) – XY-Nullpunkt gesetzt | `A8-1440x900-08` |
| 9 | Reiter „Antasten“ | `A8-1440x900-09` |
| 10–11 | Scrollen + „Antasten starten“ (Halten) – Z-Nullpunkt | `A8-1440x900-11` |
| 12 | Schritt „Fräsen“ | `A8-1440x900-12` (Text: „Startklar“) |
| 13–14 | Scrollen + „Fräsen starten“ (Halten) – Status „Läuft“ | `A8-1440x900-14` |

**B – in der App zeichnen und fräsen: 15 Eingaben** (Rechteck 100 × 60 mm, Standardwerte, „Außen“): „Neuer Job“, „Zeichnen / DXF“,
„Rechteck“ (der Job liegt sofort auf dem Tisch, kein „G-Code erzeugen“ nötig) = 3; danach wie A, aber **ein zusätzlicher Tipp**,
weil der erste Tipp aufs Bild nur die Auswahl der gezeichneten Form aufhebt (`B3-1440x900-05` zeigt noch keine Zielmarke,
`-06` ja). Belege: `B3-1440x900-NN`, Endzustand `-15`; gleiche Reihe mit `1180x820`.

**Was die Zahlen nicht sind:**
- Die mitgelieferte `lowrider-demo.html` startet *vorbefüllt* (referenziert, Job geladen, Nullpunkt, Werkzeug gesetzt): bis „Läuft“
  nur 2 Eingaben (`D-demo-1/2.png`). Sie ist ein Vorführzustand, **kein Maß**. `lowrider-control.html` ist byte-identisch mit einem
  frischen Bau [selbst: `cmp`]; `lowrider-demo.html` = dieselbe Datei plus ein Skript-Flag.
- Der Projekt-Test `e2e/usability.spec.ts` („6 Interaktionen“, Ziel ≤ 8) misst: *Zuletzt verwendet* → Karte → Einrichten →
  „X/Y wiederherstellen“ → Fräsen → Halten, an einer bereits angetasteten Maschine. `umbau-guide.md` nennt selbst „neun“, wenn Z neu
  angetastet werden muss (nicht gemessen) – das passt zu meiner Zählung. **Für Einzelstücke gibt es keine Messung im Projekt.**
- Echte Maschine, echte Kamera, echtes Z-Antasten mit Tastplatte: nicht gezählt (kein „Papier/von Hand“-Weg gezählt).

**Bewertung gegen die Ziele.** Die Ziele sagen: Schrittzahl ist egal, solange nichts schiefgeht; entscheidend ist „schnell und
übersichtlich“, und „zu viele Karten und Optionen“ wurde bemängelt. Dazu:
- Sichtbare Bedienelemente im ersten Bildschirm (1440 × 900, Job geladen): ① 37, ② 31, ③ 41, ④ 29, ⑤ 24 [selbst, `z1.cjs`,
  `Z-*.png`]. Knapp die Hälfte ist in jedem Schritt gleich (Statusleiste, Zeile der Schritte, 12 Bühnenwerkzeuge, Jog). Der Teilbericht
  zählt statisch 41 Buttons und 36 Eingaben allein im Zeichnen-Ort (`teil-2-umfang.md`, Tabelle „Was ein Bediener sieht“).
- Im Job-Schritt stehen nach dem Laden **Material-Auswahl und Rohteil** (`A8-1440x900-03`) – die Ziele wollen Material zunächst nicht.
- **Der Start ist hart gesperrt**, z. B. „Start gesperrt: 1 Punkt(e) offen: Verlässt den Verfahrweg (3×)“ (`A-frasen-gesperrt.png`;
  Code `lib/readiness.ts:176-190`, `block`). Die Ziele wollen Prüfungen anbieten, nicht erzwingen; **nur Bestätigungen** des Wichtigsten.
- Die Referenzfahrt wird empfohlen, aber nicht erzwungen (`readiness.ts:155-161`, nur `warn`; im Lauf kein Zwang) – das passt zu den Zielen.
- Zwei Knöpfe der Hauptstrecke („Nullpunkt hier setzen“, „Fräsen starten“) liegen im 1440 × 900-Fenster unter dem Rand: je 1 Scroll mehr.
- **Pause:** ein Tipp oder die Leertaste (`P1-15.png`, „Pausiert“) [selbst]. **Fortsetzen:** in der unteren Aktionsleiste ein 500-ms-Halten
  (`ActionBar.tsx:143`), in der Laufleiste ein Tipp (`RunBar.tsx:36`) [selbst] – uneinheitlich; zur Begründung siehe „Nach dem Lesen“.
- Beobachtung im Simulator ohne Erklärung (nicht an der Maschine prüfbar): „Fortschritt 100 %“ bei „Zeile 8“ von 23 (`A8-1440x900-14`);
  im Zeichnen-Lauf dagegen plausibel (11 % bei Zeile 65). [Vermutung: Fortschritt = gesendete Zeilen.]

### Aufgabe 2 – Umfang (Auszug; Vollständiges in `teile/teil-2-umfang.md`)

[Teilbericht] Größe: `apps/control/src` 51 915 Zeilen in 262 Dateien; 120 Komponenten (20 662 Zeilen); 68 `<Card`; 138 Suchbefehle;
de.ts 3 202 Zeilen. Quellcode gesamt (Control + Pakete + Companion) 63 728 Zeilen; Tests 10 697 (Unit, Control) und 8 964 (e2e).

| Kandidat | Ziele | Größe (Quelle) | Berührung | Ausblenden | Entfernen (nur als Entscheidung) |
|---|---|---|---|---|---|
| Serie auf Rohlingen, Vorrichtungen/Marker, Wenden, Abschnitte (zusammen) | selten / nicht erwähnt | 8 953 Quellzeilen (≈ 14 %), 4 120 Unit- und 1 610 e2e-Zeilen | sperren den Start (`readiness.ts:54-80,199-216`), Wenden steckt im CAM-Modell (`store/cam.ts:104-113`) | billig: Einstiege in `Steps.tsx:44-55`, `CamCard.tsx:356,527` | teuer: Start-Prüfung, Stores, `commands.test.ts`, Formate |
| Material, Schnittwert-Vorschläge, Lernmodell | „zunächst keine Rolle“ | ≈ 500 Zeilen exklusiv | Start-Prüfung berührt Material **nicht**; Profilformat verlangt `materials` (`share.ts:77-78`); `suggest()` bricht ohne Material ab (`store/cam.ts:1024`) | möglich, **aber** es ist die einzige Quelle für Schnittwerte | – |
| Sensor/Rattern; Spannmittel/Kollision-Prüfung | **verlangt** (Z:85, Z:78-79) | – | – | nicht ausblenden (nur Ort klären) | nicht entfernen |
| Kalibrierung, Aufzeichnung, Makros, Benachrichtigungen, Autolevel | selten (Kalibrierung) / nicht erwähnt | siehe Teilbericht | `startJigs` fragt alle 700 ms das Kamerabild ab (`store/jigs.ts:628-640`) – läuft auch ohne Vorrichtung | Karten ausblenden stoppt **keine** Hintergrundarbeit (`main.tsx:31-50`) | – |

Vorhandene Schalter [Teilbericht]: nur `expertMode` (blendet Konsole, Konfig-Editoren, Firmware aus; `Areas.tsx:133-148`) und die Faltung
`Depth` („Mehr Optionen“). Ein zweiter Schalter braucht einen dritten Wert in der Suchtabelle (`commands.ts:99,376-383`) und Änderungen
in `commands.test.ts`, der Anker und Stichwörter je Karte erzwingt. `apps/ios` ist nur eine README.

### Aufgabe 3 – Code und Tests (Auszug; Vollständiges in `teile/teil-3-mutationen.md`)

**Basis [selbst]:** `pnpm typecheck` grün; `pnpm coverage`: control 555, fluidnc-client 86, cam 112, gcode-core 160, workshop 100, companion 49 –
alle Zahlen aus den Fakten stimmen; `pnpm build` grün; desktop-e2e **119/119 bestanden** (7,1 min). Tablet (118) und iPad (25) nicht gelaufen.

**Mutationen [Teilbericht, Plan vorher in der Datei]:** 14 Ziele, **9 getötet, 5 überlebt**; drei Zusatz-Mutationen (2 überlebt).

| Überlebende Mutation | Befund |
|---|---|
| `lib/readiness.ts:163` `errors > 0` → `> 1` [selbst bestätigt: Zeile und Testwerte `errors: 0`/`2`, `readiness.test.ts:8,29`] | Ein einzelner G-Code-Fehler sperrt den Start dann nicht mehr; kein Test an der Grenze 1 |
| `store/machine.ts:1168` Obergrenzen-Prüfung in `moveMachine` entfernt | `moveMachine` wird von keinem Unit-Test aufgerufen |
| `store/machine.ts:655` (Jog-Softlimit), `store/start.ts:108` (Startsperre bei nicht-Idle) | beide überlebt |
| `resume.ts:81`, `streamer.ts:104`, `toolpath.ts:419` | Randwerte ohne Test (Bohrung 0,1-mm-Toleranz, Puffergrenze, Index = Zeilenzahl) |

- Die 100 % der vier Pakete sind **echt erzwungen** (Schwellwert greift, kein `exclude`, keine `v8 ignore`), messen aber nur Ausführung, keine Randwerte.
- **apps/control ist deutlich schwächer geschützt:** Abdeckung nur für `src/lib` und `src/i18n`, ohne Schwellwert (93,6 %); `src/store` nicht gemessen
  (ad hoc: `machine.ts` 32,7 %, `start.ts`/`readiness.ts`/`run.ts` 0 %). Die e2e-Tests füllen das vermutlich teilweise [Vermutung].
- Struktur: keine Importzyklen (324 Dateien); `store/machine.ts` 1 267 Zeilen, rund 50 Aktionen, `connect` allein ≈ 180 Zeilen; 8× lokal
  neu definierter Zahlformatierer; 137 Exporte werden nur von Tests benutzt (z. B. `detectChatter`, `fft`, `zRoutine`, `flashLayout`) – geprüft, aber in der App nicht angeschlossen (26 gar nicht benutzt, 22 davon UI-Bausteine).
- Gute Tests / schwache Tests mit Datei:Zeile: `teil-3-mutationen.md`.

### Aufgabe 4 – Sicherheit am Gerät (Vollständiges und Aufrufer-Tabelle in `teile/teil-4-sicherheit.md`)

Antwort auf die Leitfrage [Teilbericht]: **Ja, in zwei Fällen** bewegt die App etwas, das der Bediener nicht (mehr) will. Tipp aufs Bild, Wiederverbinden und
Tastenkürzel bewegen nichts. Der Standardstart läuft über die SD-Karte (Halten → Upload → `$SD/Run`), die Maschine fräst dann ohne App weiter.

| ID | Befund | Stufe | Geprüft |
|---|---|---|---|
| B1 | **Streaming-Job, Verbindung bricht:** Maschine fährt nur den Puffer leer (Test: 12 Zeilen, 121 Byte) und steht; die App sendet weder `!` noch `0x18` noch `M5`. Die **rote Meldung fehlt**, weil `streamer.abort()` (`connection.ts:361`) vor `setState('disconnected')` (`:364`) läuft und der Store nur bei noch laufendem Stream `lostInJob` setzt (`machine.ts:460-467`) | wichtig (Vorgabe „läuft weiter“ nur für SD erfüllt; Meldungsfehler widerspricht der eigenen Doku) | Reihenfolge **[selbst]**; Wirkung [Teilbericht, Test] |
| B2 | **Zwei Geräte am Relay:** `ok`/`error` gehen an alle Clients (`relay.ts:82-85,100-104`), der Client ordnet nur nach Reihenfolge zu (`connection.ts:415-426`). Verbindet sich das Zweitgerät neu (`$I`, `$G`, `$#`), kann dessen `ok` im Erstgerät einen SD-Job „beenden“; danach sendet das Erstgerät bei Mehrwerkzeug-Jobs `M5`, Anheben und `G53 G0 X Y` an die laufende Maschine (`run.ts:121-152`) | **blockierend** vor dem Zwei-Geräte-Betrieb | Test mit echtem Store und Relay [Teilbericht]; ob FluidNC die Zeilen im Job annimmt: nicht geprüft |
| B3 | **Dauerfahrt ohne Referenz:** eine einzige relative Fahrt über den ganzen Verfahrweg (`$J=G91 G21 Y2440 F3000`, ≈ 49 s); `soft_limits`/`hard_limits` sind in `machine/config.yaml` aus; geht der Link verloren, kommt `0x85` nicht an; es gibt keinen Verbindungswächter (120 s Funkstille bleibt „verbunden“) | **blockierend** für die Maschine ohne Referenz/Limits | Zielberechnung **[selbst]** (`lib/motion.ts` `continuousJogTarget`, `limited=false` → relativ über `range.max − range.min`); Rest [Teilbericht] |
| W1 | Leertaste pausiert nicht bei Fokus in Eingabefeld/Auswahl/Schieberegler (`store/keys.ts:46`, `typingInto`) – der Kommentar zwei Zeilen darunter und CLAUDE.md sagen das Gegenteil („whatever has the focus“) | wichtig | Zeile **[selbst]**, UI-Test [Teilbericht] |
| W2 | NOT-HALT beendet Mehrschritt-Abläufe nicht (Foto-Scan, Kalibrierung, Serie, Jig, Wenden) | wichtig | Code-Lektüre [Teilbericht], Wirkung Vermutung |
| W3–W6 | `feedHold`/`emergencyStop` werfen bei schließendem Socket ohne Meldung; Wiederaufnahme ab Zeile nimmt quittierte statt gefahrene Zeilen und `M3` vor dem Anheben; Gamepad-Abziehen lässt Dauerlauf bestehen; `$H` läuft in 10-s-Timeout | wichtig | [Teilbericht] |

Weitere Hinweise [Teilbericht]: Pi-Shutdown ohne Anmeldung, CORS `*`; die Konsole (MDI) prüft den Zustand nicht; PAUSE und NOT-HALT sind immer gerendert und nie gesperrt, auch über Dialogen.
Die Doku sagt selbst: der Software-NOT-HALT ersetzt keinen Hardware-NOT-AUS (`docs/projektbeschreibung.md:132`); wie der Not-Aus verdrahtet ist, steht offen in `docs/ideen.md:224`.

### Aufgabe 5 – Lücken zu den Anforderungen

Stand: **vorhanden** / **teilweise** / **fehlt** / **nicht geprüft**. Belege: wenn nur Datei angegeben, steht die Zeile im Teilbericht (`teil-5-luecken.md` bzw. `teil-2-umfang.md`).

| Abschn. | Anforderung | Stand | Beleg |
|---|---|---|---|
| 1 | PC (Maus/Tastatur) und iPad gleichwertig | teilweise | beide Fenster gleiche Schrittzahl [selbst]; echtes iPad/Safari **nicht geprüft** |
| 1 | Verbindung immer über den Pi | teilweise | `Über den Pi verbinden` ist der eine Weg bei Companion (`umbau-guide.md` Etappe 14); an echtem Pi nicht geprüft |
| 1 | Material zunächst ohne Rolle | **fehlt** (UI bietet Material an) | `A8-1440x900-03`; `WorkpieceCard.tsx:34-48` |
| 1 | G-Code laden schnell und sicher | vorhanden | 3 Eingaben bis geladen [selbst] |
| 1 | Spindel nur Ein/Aus; Hinweis „von Hand einschalten“ | vorhanden | Meldung im Schritt Fräsen (`A-frasen-gesperrt.png`) |
| 1 | Referenzfahrt empfehlen, nicht erzwingen | vorhanden | `readiness.ts:155-161`; Start unreferenziert möglich [selbst] |
| 2 | Keine vorgegebenen Schritte, Reiter/Bereiche je Absicht | **fehlt / teilweise** | `store/ui.ts:6` `STEPS`; Schritte frei anspringbar, aber ⑤ nur über die Schrittlogik; Nebenbereiche (Liste ohne Bühne) existieren |
| 2 | Konzentration auf den Bereich (CAM-Bereich: nur CAM) | teilweise | CAM liegt als Arbeitsfläche **in** ① Job mit Bühne, Statusleiste, 12 Bühnenwerkzeugen (`B3-…-03`) |
| 2 | „Alles schnell und übersichtlich“ | nicht erfüllt, nicht gemessen | 24–41 sichtbare Bedienelemente je Ort [selbst]; keine Messung von „schnell“ |
| 2 | Rückmeldung bei Tasten | vorhanden | `e2e/feedback.spec.ts` (grün im Desktop-Lauf) [selbst], `data-press` |
| 2 | Selten Genutztes per Schalter ausblenden | teilweise | nur `expertMode` + Faltung (Teil 2) |
| 2 | Dunkel/Hell, DE/EN, Ansichten 2D/3D | vorhanden | `theme.test.ts`, e2e „switches the interface to English and back“ (`control.spec.ts:1257`); 2D/3D [selbst] |
| 2 | Statusleiste: Zustand, X Y Z, Spindel, Vorschub | vorhanden | alle Screenshots |
| 3 | Reihenfolge: ① G-Code fräsen, ② zeichnen+fräsen; Bereichs-Oberfläche zuerst | – | Ordnung der Änderungsliste (Teil 4) |
| 4 | Einfache Formen / Text / SVG-DXF | teilweise | nur 4 Formen + Einstrichschrift; SVG/DXF ohne `use`/`INSERT`/Text (`teil-5` A1) |
| 4 | Freie Kurven/Skizzen | **fehlt** | kein Polylinien-/Freihand-/Bezier-Werkzeug (nur Import) |
| 4 | Nesting | **fehlt** | `nestingDepths` = Enthaltensein (`geometry.ts:66`) |
| 4 | Boolesche Operationen | **fehlt im Werkzeug** | Clipper vorhanden (`offset.ts:63-73`), nur vom Wenden benutzt |
| 4 | Maße und Abhängigkeiten | teilweise | nur Zahlenfelder; keine Bemaßung/Constraints |
| 4 | Ebenen und Gruppen | teilweise | Gruppen nur aus Import; `Contour.layer` gelesen, nirgends benutzt |
| 4 | Wirbelfräsen, adaptives Ausräumen, Restmaterial, 3D | **fehlt** | `adaptive.ts` = Vorschub-Override; STL = nur Anzeige |
| 4 | Gleich-/Gegenlauf je Bearbeitung | teilweise | ein Schalter für die Zeichnung (`toolpath.ts:42`, benutzt `:275,:434,:460`) |
| 4 | Werkzeugverwaltung mit Schnittwerten je Werkzeug | **fehlt im Datenmodell** | `Tool` ohne Feed/Zustellung/Drehzahl (`tools.ts:5-29`) |
| 5 | Kamera: Nullpunkt per Tipp / live / Job aufs Material / Messen | vorhanden bzw. teilweise, **ungemessen** | `teil-5` B1 |
| 5 | Kamera ausschaltbar, App ohne Kamera | vorhanden | `CameraView.tsx:407-413`; Ausschalten nur über erneutes Tippen der Quelle (`CameraSetupCard.tsx:49-53`) |
| 5 | **±0,2 mm** | **nicht gemessen** | Modell: 1 Maßstab, 1 Drehung, 1 Versatz, keine Verzeichnung/Neigung (`lib/camera.ts`); Rechnung unten |
| 5 | **< 30 s** | **nicht gemessen** | Technik begrenzt es nicht; Schritte tun es eher (Kamera beim Start aus) |
| 5 | Z-Nullpunkt: Antasten und Papier | teilweise | Antasten gezählt [selbst]; „Papier“-Weg nicht gezählt |
| 6 | Schritte 0,01–100 mm, Dauerfahrt, Joystick, Tastatur | vorhanden | `lib/jog.ts:11-14` u. a.; nur Simulator getestet |
| 6 | Park, Nullpunkt anfahren | vorhanden | `JogCard.tsx:371-380` |
| 6 | Werkzeugwechsel-Position anfahren (Knopf) | **fehlt** | nur automatisch beim M6-Halt (`machine.ts:1010`) |
| 6 | Eigene Merkpunkte | **fehlt** | kein Treffer; Makros als Umweg (nur Browser) |
| 6 | Werkzeugwechsel von Hand im Job | teilweise | nur beim Streamen (`streamer.ts:70-75`); SD-Job läuft durch |
| 7 | Start per Halten | vorhanden | `ActionBar.tsx:192-201` [selbst: Halten 1 s nötig] |
| 7 | Prüfungen anbieten, nicht erzwingen | **teilweise** | harte Sperre (`readiness.ts:176-190`) |
| 7 | Nur das Wichtigste bestätigen | vorhanden | `StartConfirm` nur bei fehlendem Nullpunkt/Z tief/Messtaster (`umbau-guide.md`); in meinen Läufen keine Rückfrage |
| 7 | PAUSE ein Tipp, nie gesperrt; Leertaste | vorhanden, mit Lücke W1 | `PauseButton.tsx`, e2e `find.spec.ts:395`; Leertaste aus Feldern heraus: nein |
| 7 | Fortsetzen ein Tipp | teilweise | Halten 500 ms in der Aktionsleiste, Tipp in der `RunBar` |
| 7 | Verbindungsabbruch: Maschine läuft weiter, rote Meldung | SD: ja (Pi-Seite nicht an Hardware); **Streaming: nein** | B1 |
| 7 | Nur Störungen/Warnungen aufdringlich | vorhanden | Meldungsstufen (`umbau-guide.md` Etappe 13) |
| 7 | Rattern erkennen | vorhanden, **ohne Hardwaretest** | `chatter.ts:77`, `companion.md` |
| 8 | Zuletzt verwendet | vorhanden | `store/recent.ts` (nur Browser, 6 Jobs) |
| 8 | Projekte speichern | **fehlt** | CAM-Zeichnung nirgends gespeichert (`store/cam.ts`) |
| 8 | Export | teilweise | nur G-Code (`CamCard.tsx:519-523`) |
| 8 | Ablage auf dem Pi, mit automatischer Sicherung | teilweise / **fehlt** | Werkzeuge, Materialien, Nullpunkte, Historie auf dem Pi; Einstellungen, Makros, Zuletzt im Browser; keine Sicherung |
| 8 | Update der Pi-Software per Knopf, ohne Internet | **fehlt** | keine Update-Route (`server.ts:104-372`), kein Knopf; `lowrider-pi.zip` wird von keinem Skript im Archiv erzeugt |

**Kamera ±0,2 mm – Rechnung (alles Vermutung, Annahmen offen):** Kameramodell laut Einkaufsliste IMX335 (`einkaufsliste.md:36`; **verbaut? nicht belegt**),
Stream 1920 px, Abstand Linse–Werkstück **unbekannt**. Weil „4 mm / 106°“ in sich nicht stimmt, zwei Fälle: A (106° diagonal) 0,12 / 0,24 / 0,36 mm/px bei
100 / 200 / 300 mm Abstand; B (f = 4 mm) 0,05 / 0,10 / 0,15 mm/px. Maßstab aus 2 Tipps über 10 mm: Fehler ≈ 1,4–3,4 % → am Bildrand (40 mm) 0,6–1,4 mm.
Höhentoleranz 0,5 mm kostet ≈ 0,13 mm am Rand, 1° Neigung bei 10 mm Dickenwechsel ≈ 0,17 mm. **Gemessen wurde nichts**; alle Prüfpunkte in
`erste-schritte.md` stehen offen. Schluss: im Fadenkreuz-Weg plausibel erreichbar, im Tipp-Weg am Rand mit der vorhandenen Technik nicht.

**Updates ohne Internet [Teilbericht]:** Internet brauchen nur die Erstinstallation (apt `setup.sh:55`, NodeSource-curl `:71`) und der PC zum Bauen. Ein Update der Dateien läuft über das
Router-WLAN (`scp` + `setup.sh`). Ein Knopf bräuchte einen Upload-Endpunkt, Prüfsumme/Signatur, Rollback und eine PIN – heute ist der Companion offen (kein Login, CORS `*`,
Shutdown für jeden im WLAN). **Antwort auf die Betreiberfrage: Weder Netzwerkwechsel noch USB noch Bluetooth sind für den Weg zum Pi nötig** (Vermutung, mit obigen Belegen);
der Netzwechsel betrifft nur das Besorgen oder Bauen des Pakets am PC.

### Aufgabe 6 – Spannungen (Abschnitt 9)

| Spannung | Lösbar? | Kosten der Lösung | Entscheidung des Betreibers |
|---|---|---|---|
| **Vollwertiges CAM inkl. 3D, Nesting, Booleans, Bemaßung, Ebenen** gegen „schnell und übersichtlich“ und „im CAM nur CAM“ | **Ja, aber nur durch echte Bereichstrennung**; ohne sie wächst die Oberfläche mit jeder Funktion weiter. Funktionsumfang selbst ist ein Mehrjahresprojekt | Oberfläche: M (die Orte sind reine Zusammenstellungen von Karten: `Steps.tsx` 269, `Areas.tsx` 202 Zeilen). CAM-Funktionen (Schätzung Teilbericht): climb je Bearbeitung S; Schnittwerte je Werkzeug S–M; Booleans M; Polylinie M; Bezier-Bearbeitung L; Ebenen M; Nesting M–L; Restmaterial M–L; Wirbelfräsen M; adaptiv L–XL; Constraints XL; 3D XL | Reihenfolge der CAM-Funktionen; **ob 3D überhaupt in dieser App** gebaut oder ein anderes CAM dafür weiter genutzt wird; was „Wirbelfräsen“ genau meint (trochoidal?); ob „verzichte auf nichts“ „ausblenden statt löschen“ (so umgesetzt) oder „alles bauen“ heißt |
| **Kamera ±0,2 mm und < 30 s bei kleinerer Oberfläche** | Die Oberfläche beeinflusst nur die Zeit, die Genauigkeit hängt an Hardware und Kalibrierung. Beides ist **ungemessen** | Messkampagne mit Messmittel an der Maschine: S–M. Längere Kalibrierbasis, Verzeichnungs-/Höhenmodell: M–L [Vermutung] | Definition des Abnahmetests (Messmittel, Anzahl, welcher Weg: Fadenkreuz in Bildmitte oder Tipp am Rand), Kamerahöhe/Objektiv festlegen, ob die Kamera beim Start automatisch an sein soll (heute aus) |
| **„Fortsetzen: ein Tipp“** gegen Halten; **„nur das Wichtigste bestätigen“** gegen Prüfungen, die nur angeboten werden | Ja. Fortsetzen: bewusste Sicherheitsentscheidung des Entwurfs (Doppeltipp auf PAUSE soll nie fortsetzen, `ActionBar.tsx:141-143`); als Tipp mit kurzer Sperre nach dem Pausieren lösbar. Prüfungen: Sperre durch Hinweis plus Bestätigung ersetzen | S (Fortsetzen vereinheitlichen), S–M (Verfahrweg-Sperre → Bestätigung) | **Risikoentscheidung:** wie viel Schutz ist die Sperre wert, solange `soft_limits` in FluidNC aus sind? Empfehlung: Bestätigung statt Sperre erst, wenn die Endschalter aktiv sind |
| **Material ausblenden, aber Schnittwerte je Werkzeug speichern** | Ja | Optionale Felder im `Tool` (S–M, ≈ 1–2 Tage); `suggest()` ohne Material; `share.ts` darf `materials` nicht mehr verlangen | ob Material später zurückkommt (dann Daten nicht wegwerfen); Standardwerte je Fräser |
| **PC als Hauptgerät, iPad gleichwertig** | Ja; die Zählung ist in beiden Fenstern gleich | klein; **echtes iPad/Safari muss getestet werden** (nicht möglich in dieser Umgebung) | ob Maus-/Tastatur-Funktionen (Leertaste, Mausrad-Feinjog) auf dem iPad entfallen dürfen |

**Reihenfolge, die zu „Bereichs-Oberfläche zuerst“ passt:**
0. *Parallel und klein, unabhängig von der Oberfläche:* Sicherheitsfehler (B1-Meldungsreihenfolge, W1 Leertaste, B2 Zuordnung der Antworten je Client) und `soft_limits` in der FluidNC-Konfiguration vor dem ersten Fräsen.
1. **Bereichs-Oberfläche** in drei Stufen: (a) Ortsmodell von „Schritten“ zu Bereichen (z. B. Job laden · Zeichnen/CAM · Einrichten & Fahren · Fräsen · Service · Einstellungen), die Karten bleiben; (b) CAM als eigener Bereich ohne Bühnenwerkzeuge und Zusatzkarten; (c) ein generalisierter Ausblend-Schalter (Serie, Vorrichtung, Wenden, Abschnitte, Material, Aufzeichnung, Makros …).
2. Start-Prüfung: Hinweis plus Bestätigung statt harter Sperre; Fortsetzen vereinheitlichen.
3. Schnittwerte je Werkzeug und Gleich-/Gegenlauf je Bearbeitung (beide klein, aber der neue CAM-Bereich braucht sie).
4. Projekte speichern, Sicherung und Ablage auf dem Pi.
5. Update-Knopf (mit PIN, Prüfsumme, Rollback).
6. CAM-Ausbau in dieser Reihenfolge: Polylinie, Booleans, Ebenen, einfaches Nesting; später adaptiv/Restmaterial/Wirbelfräsen; 3D zuletzt und nur nach der Entscheidung oben.
7. Kamera-Messkampagne **parallel** zur Maschinenabnahme (nicht erst am Ende).

---

## Nach dem Lesen von CLAUDE.md, DESIGN.md, umbau-guide.md: was sich geändert hat

Das erste Urteil steht unverändert in `00-erstes-urteil-blind.md`. Folgendes hat sich durch das Lesen verschoben:

1. **Ursache des Hauptproblems.** Ich hatte die fünf Schritte und die Start-Sperre als Mangel gegenüber den Zielen gelesen. Tatsächlich sind sie die *ausdrückliche, verbindliche* Vorgabe aus `DESIGN.md` (dort §3.2, §6.4, „erst nachfragen, nicht eigenmächtig abweichen“) und wurden in drei Etappen umgesetzt. Die späteren Antworten in `02-ziele.md` widersprechen ihr, und dort gilt „die spätere Antwort gewinnt“. Es ist also **eine veraltete Spezifikation, kein Umsetzungsfehler**. Die Umsetzung folgt dem Guide gewissenhaft (Abnahme je Bildschirm, Tabelle in `umbau-guide.md`).
2. **Aufwand der Bereichs-Oberfläche kleiner als vermutet.** `CLAUDE.md` beschreibt ein vorhandenes Ortsmodell (`Place`, `VIEWS`, `placeHasStage`, `Depth`); Listenbereiche zeigen schon heute *nur sich selbst* ohne Bühne. Die Orte sind „plain compositions of the cards“. Ich hatte das offen gelassen; jetzt schätze ich die Oberfläche auf **M statt L** [Vermutung, gestützt auf `Steps.tsx` 269 und `Areas.tsx` 202 Zeilen].
3. **Zwei Gestaltungsregeln, die den Zielen direkt widersprechen:** `DESIGN.md` §2 „keine globalen Benutzerstufen“ gegenüber „selten Genutztes per Schalter ausblenden“ (Lösung: Schalter je Funktion/Bereich, nicht je Rolle); `DESIGN.md` §3.2 „⑤ startet erst, wenn nichts blockiert“ gegenüber „Prüfungen nicht erzwingen“.
4. **Streaming ist bewusst der zweite Weg.** `CLAUDE.md`: „jobs start from the SD card by default, streaming is the second way“; `umbau-guide.md` nennt als Auswirkung „SD-Job läuft weiter / Stream bleibt stehen“. B1 ist damit **kein verstecktes** Verhalten, sondern dokumentiert. Herabgestuft von „blockierend“ auf „wichtig“. Nicht entschärft bleibt: (a) die Vorgabe der Ziele („Maschine läuft weiter“) ist für Streaming nicht erfüllt, (b) die rote Meldung fehlt dort, obwohl `CLAUDE.md` sie zusagt, (c) „Wiederaufnahme ab Zeile“ streamt immer.
5. **B3 ist teils eine Konfigurationsfrage.** `CLAUDE.md` sagt: „No safety function lives in the browser; the app triggers and displays, FluidNC enforces.“ Dieser Grundsatz hält nur, wenn FluidNC Grenzen durchsetzt – `soft_limits` ist laut Fakten in der `config.yaml` aus, und es gibt noch keine Referenzfahrt. Ich stufe B3 weiter hoch, aber die Abhilfe liegt zuerst bei Konfiguration und Referenzfahrt, dann in der App (Dauerfahrt ohne Referenz begrenzen, Verbindungswächter).
6. **Der Usability-Test misst das Falsche für Einzelstücke.** `DESIGN.md` §11 setzt „bekannter Job von Start bis Fräsen starten ≤ 8“ als Ziel; das ist ein Wiederholjob. Ziele §1 nennen Einzelstücke. Meine Zahlen (14/15) widersprechen dem Projekt-Test nicht, sie messen den anderen Fall.
7. **Fortsetzen = Halten ist Absicht** (`umbau-guide.md` Etappe 12: „damit ein Doppeltipp auf Pause nie fortsetzt“). Die RunBar mit Tipp ist dann die Abweichung. Das macht aus einem „Fehler“ eine *Sicherheitsabwägung*, die der Betreiber entscheiden muss (Teil 3, Spannungen).
8. **Leertaste (W1)**: Dokument, Kommentar und Code widersprechen sich (`CLAUDE.md`/Kommentar: „whatever has the focus“; Code `keys.ts:46`: bei `typingInto` kein Effekt). Bleibt ein Fehler; nur schlimmer, weil die Doku etwas anderes zusagt als gebaut ist.
9. **Unverändert:** Zählung (14/15), Mutationsbefunde, Lücken CAM/Kamera/Update, B2, die Lage „an der Maschine nichts abgenommen“ (bestätigt in `umbau-guide.md`, Etappe 14).
10. **Kleinigkeit:** `01-fakten.md` nennt `sim/` im Wurzelverzeichnis; im Archiv liegt der Simulator unter `apps/control/src/sim`. `e2e/` ist ebenfalls `apps/control/e2e`. Beides vermutlich nur Beschreibungsfehler.

---

## Teil 4 – Änderungsliste (geordnet nach Aufwand und Nutzen, **wartet auf Freigabe**)

Aufwandsangaben sind Schätzungen (Vermutung), Bezug: ein Entwickler, der den Code kennt, Tests im Projektstil. **Nichts davon ist begonnen.**

| # | Änderung | Nutzen | Aufwand | Abhängigkeit / Risiko |
|---|---|---|---|---|
| 1 | **Sicherheit klein:** Meldungsreihenfolge bei Streaming-Abbruch (B1), Leertaste aus Feldern/Schiebern (W1), `feedHold`/`emergencyStop` ohne stille Ausnahme (W3) | hoch (Sicherheit, Zusage der Doku) | S je Punkt | Randwerttests ergänzen (siehe 2) |
| 2 | **Randwerttests** für die 5 überlebenden Mutationen (`errors == 1`, `moveMachine`-Grenze, `start.ts:108`, `resume.ts:81`, `streamer.ts:104`, `toolpath.ts:419`) | hoch | S–M | – |
| 3 | **FluidNC-Konfiguration:** `soft_limits`/Endschalter nach der ersten Referenzfahrt aktivieren; Dauerfahrt ohne Referenz begrenzen; Verbindungswächter (Funkstille → Stopp-Befehl/Meldung) (B3) | sehr hoch (Sicherheit) | Konfiguration S; App M | **Betreiberentscheidung**; nur an der Maschine prüfbar |
| 4 | **Relay-Zuordnung je Client** (B2): `ok`/`error` nur an den auslösenden Client, oder Befehlswarteschlange je Client | hoch, wenn je zwei Geräte benutzt werden | M | Test mit zwei Clients |
| 5 | **Fortsetzen vereinheitlichen** (Tipp mit kurzer Sperre nach Pause oder überall Halten) | mittel | S | **Risikoentscheidung des Betreibers** |
| 6 | **Start-Sperre bei Verfahrweg → Hinweis + Bestätigung** (`readiness.ts:176-190`) | mittel | S–M | erst sinnvoll, wenn Nr. 3 steht |
| 7 | **Ausblend-Schalter je Funktion/Bereich** (Serie, Vorrichtung, Wenden, Abschnitte, Material, Aufzeichnung, Makros, Kalibrierung) einschließlich Abschalten der Hintergrunddienste (`startJigs` u. a.) | hoch (Ziel „zu viele Karten“) | M | Suchtabelle `commands.ts` und `commands.test.ts` mit anpassen |
| 8 | **Bereichs-Oberfläche** (Ortsmodell, CAM als eigener Bereich, kein Stepper-Zwang) | sehr hoch (Betreiber-Priorität 1) | M–L [Vermutung nach Lesen: eher M] | Betreiberentscheidung zu `DESIGN.md` (Spannungen); Tests `steps.spec.ts`, `areas.spec.ts`, `usability.spec.ts` ändern sich |
| 9 | **Schnittwerte je Werkzeug** im Datenmodell, Material optional | hoch | S–M (1–2 Tage) | `share.ts`-Format, Migration |
| 10 | **Gleich-/Gegenlauf je Bearbeitung** | mittel | S | – |
| 11 | **Knöpfe fehlender Positionen:** Werkzeugwechsel-Position anfahren, eigene Merkpunkte | mittel | S–M | – |
| 12 | **Projekte speichern/öffnen** (CAM-Zeichnung als JSON auf dem Pi) und **automatische Sicherung** (z. B. täglich `VACUUM INTO`, letzte N, besser auf zweites Medium) | hoch | M | Sicherung nicht auf der SD-Karte des Pi allein |
| 13 | **Messung der Kamera** (±0,2 mm, Dauer) an der Maschine nach definiertem Protokoll; erst danach Ausbau der Kalibrierung | hoch (offenes Risiko) | S–M | Hardware, Betreiber definiert den Test |
| 14 | **Update-Knopf** (Upload, SHA-256/Signatur, Rollback, PIN) und Companion-Login | hoch (Anforderung, auch Sicherheit) | M–L | `lowrider-pi.zip`-Bau fehlt im Archiv |
| 15 | **Zeichnen:** Polylinie, Booleans (Clipper ist da), Ebenen, einfaches Nesting | hoch (Ziel „CAM reicht nicht“) | M je Funktion | Offset-Tests erweitern (Inseln, Selbstüberschneidung) |
| 16 | **Strategien:** Wirbelfräsen M, Restmaterial M–L, adaptiv L–XL, 3D XL | mittel–hoch | siehe links | Begriffe klären; 3D nur nach Betreiberentscheidung |
| 17 | **Aufräumen:** 26 ungenutzte und 137 nur-test-benutzte Exporte prüfen, Zahlformatierer zusammenführen, `store/machine.ts` teilen | niedrig–mittel | M | nach der Oberfläche, nicht vorher |
| 18 | **Kleinkram:** zwei lose PNGs `apps/control/after-*.png`, Dokumentationsfehler in `01-fakten.md` (`sim/`, `e2e/`, `lowrider-pi.zip`) | niedrig | S | – |

---

## Nicht geprüft

- **Alles, was echte Hardware braucht:** Jackpot/FluidNC 3.9.1, echte Referenzfahrt, Antasten mit Tastplatte, Dauerfahrt am echten Link-Abriss, ob FluidNC `M5`/Fahrbefehle mitten im Job annimmt (B2), ob `!` im Homing wirkt, Spindel, Sensor (Rattern), Pi-Kamera (Auflösung, Abstand, Schärfe, Latenz), Kamera-Genauigkeit und -Dauer.
- **`setup.sh` auf einem Pi**, Pi-OS-Verhalten (Node-Version, sudo), `lowrider-pi.zip` (nicht im Archiv).
- **Echtes iPad/Safari**, Touch-Gesten (nur Chromium-Fenster 1180 × 820), Handschuhe/Staub/Licht.
- **CI-Lauf 85 und Commit `5d3f2e0`** (Git-Verlauf nicht im Archiv). Tablet- (118) und iPad-e2e (25) nicht gelaufen; Desktop 119/119 gelaufen.
- Mutationen in `components`, `store/cam.ts`, `connection.ts`, `interpreter.ts`; keine automatisierte Mutationsbibliothek; keine Flakiness-Prüfung.
- Bedienung der CAM-Oberfläche per Hand (nur Rechteck-Weg gezählt); Bahngeometrie bei Selbstüberschneidung (nur „wirft nicht“).
- „Papier/von Hand“-Z-Nullpunkt, Referenzfahrt-Weg und Wiederholjob in der Zählung; Zählung mit Kamera-Weg (Kamera war aus).
- Details der Teilberichte, die ich nicht selbst nachgeprüft habe (alle Marken [Teilbericht]); nachgeprüft: `readiness.ts:163`, `connection.ts:361-364`, `machine.ts:460-467`, `motion.ts` (Dauerfahrt), `ActionBar.tsx:143`/`RunBar.tsx:36`, `keys.ts:46`.
- Aufwandsschätzungen sind Schätzungen, nicht durch Probearbeit gedeckt.
