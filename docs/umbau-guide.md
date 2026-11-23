# Umbau nach DESIGN.md – Stand und Zuordnung

## Umbau 2 (beschlossen, in Stufen): sechs Bereiche statt fünf Schritte

Entscheidung des Betreibers nach der unabhängigen Bewertung (`bewertung/`): Die fünf festen Schritte werden durch sechs
Bereiche ersetzt, im Zeichnen/CAM ist nur das CAM zu sehen, die Kette „Weiter: …“ entfällt, der Startbildschirm bleibt.
Plan, Layout und Risiken: `bewertung/plan-bereichs-oberflaeche.md`. **Stand: Stufe 0 (nur Text) erledigt; Stufe 1 (Plätze) bis 3 stehen aus –
solange zeigt der Code noch die fünf Schritte; die Tabellen weiter unten beschreiben diesen Code-Stand.**

| Bisher (Code) | Künftig | Hinweis |
|---|---|---|
| ① Job | **Job** | Programm, Zuletzt verwendet, SD-Karte, Werkstück, Extras |
| ① Job, Ansicht Zeichnen (`ui.drawing`) | **Zeichnen/CAM** (`cam`) | nur CAM und Statusleiste |
| ② Werkzeuge | **Fräsen**, Ansicht Prüfen | Werkzeuge des Jobs |
| ③ Einrichten | **Einrichten & Fahren** (`setup`) | Nullpunkt · Antasten · Kamera · Ausrichten |
| ④ Prüfen | **Fräsen**, Ansicht Prüfen | Startklar-Liste, Simulation, Zeitleiste |
| ⑤ Fräsen | **Fräsen**, Ansicht Fräsen (`run`) | Start bleibt Halten, Sperre bleibt |
| Service & Diagnose, Einstellungen (Nebenbereiche) | **Service**, **Einstellungen** (Reiter) | Ansichten wie bisher |
| Werkzeugliste, Konsole | Hauptmenü | unverändert |

Stufen: **0** Text (diese Änderung) · **1** Plätze (`cam` neu, Reiter statt Stepper, `tools`/`check` in `run`, gespeicherter Platz mit Rückfall,
Kette „Weiter“ aus der Aktionsleiste, Schnellsuche und Tests nachgezogen) · **2** CAM-Fokus (Bühnenwerkzeuge, Ablauf-Karten, Jog-Knopf, Laufleiste, Kamera-Einblendung im CAM aus) ·
**3** angedockte Hauptaktion je Panel. Jede Stufe nur nach Freigabe, mit eigenem Commit; alle e2e-Projekte (desktop, tablet, ipad) und `pnpm check` grün; Screenshots bei 1280 und 800 px.

Abweichungen vom Guide, die damit entfallen oder sich ändern: „genau eine Primäraktion unten rechts“ (jetzt: wo es eine gibt), „⑤ startet erst, wenn nichts blockiert“
(jetzt: der Start in Fräsen bleibt gesperrt, solange etwas blockiert), „Leertaste/Strg+→ nächster Schritt“ (die Taste entfällt mit der Kette).

Die Oberfläche wird nach dem UX-/HMI-Guide [`DESIGN.md`](../DESIGN.md) umgebaut. Stores, Bibliotheken
und Pakete bleiben; umgebaut werden Informationsarchitektur, Rahmen (Shell) und Designsystem. Der
Umbau lief in drei Etappen (11, 12 und 13 – alle gebaut). Dieses Dokument sagt, **wo jede bisherige
Karte jetzt liegt**, wo vom Guide abgewichen wurde, wie die Abnahme je Bildschirm ausfiel und was
noch aussteht.

## Etappe 11 (erledigt): Designsystem, Shell, Start

Schritte 1–3 der Reihenfolge aus §11.2 des Guides.

- **Tokens und Themes** (`apps/control/src/styles/theme.css`): die Farben aus §7 (Blau als Akzent,
  Grün/Amber/Rot/Violett mit fester Bedeutung, Achsfarben), Radius 8 px (Bedienelemente) und 12 px
  (Karten), Tiefe über Flächenhelligkeit statt Schatten, Inter für die Oberfläche und JetBrains Mono
  (im Bundle, offline) für G-Code und Konsole, Tabellenziffern. **Dunkel** ist Standard, **Hell**
  kommt dazu (_Einstellungen → Maschine → Darstellung_, wird gemerkt). Die Bühnenbilder (Canvas,
  three.js) haben ihre `--stage-*`-Farben je Theme. Ein Test rechnet die Kontraste beider Themes
  nach (Text ≥ 7:1, Bedienelemente ≥ 4,5:1).
- **Komponenten** (`apps/control/src/ui/`, coss ui bleibt die Basis): neu sind `stepper`,
  `status-badge`, `dro`, `toast`, `tooltip` (Tipp-Hinweis mit dem Grund an gesperrten
  Schaltflächen), `sheet` (Bottom Sheet), `numpad`. Der Button hat die Varianten des Guides
  (primär blau, sekundär neutral; Rot nur für NOT-HALT und Störung).
- **Shell** (`App.tsx`): Statusleiste (`StatusBar.tsx`) · Zeile der Schritte (`NavRow.tsx`) ·
  Hauptfläche mit einklappbarem Kontext-Panel · Aktionsleiste (`ActionBar.tsx`) mit genau einer
  Primäraktion unten rechts.
- **Start** (`StartScreen.tsx`): Zustand groß, eine Empfehlung „Als Nächstes“ (`lib/next.ts`),
  aktueller/letzter Job mit den fünf Schritten, Werkzeug und Material, letzte Meldung,
  Schnellzugriffe.
- **PAUSE und NOT-HALT** oben rechts, mit Abstand. PAUSE = Vorschub halten, ein Tipp, nie gesperrt;
  Leertaste pausiert, solange sich etwas bewegt; Esc fragt, ob der laufende Job abgebrochen wird.
- **Eigenes Zahlenfeld** (`NumpadLayer.tsx`, `lib/numpad.ts`) für alle Zahlenfelder unter dem
  Finger; mit Maus und Tastatur ändert sich nichts.
- **Schnellsuche und Tasten** folgen den neuen Orten (`lib/commands.ts`, `lib/shortcuts.ts`).

## Wo liegt was? (alt → neu)

Zwei Ebenen, mehr nicht: der Ort (Start, Schritt ①–⑤, Nebenbereich) und – wo nötig – eine Ansicht
darin. Das Jog-Feld ist kein Ort: es legt sich aus jedem Bildschirm über das Kontext-Panel.

### Raum „Fahren“

| Bisher                                           | Jetzt                                           |
| ------------------------------------------------ | ----------------------------------------------- |
| Joggen: Steuerkreuz, Handrad, Joystick (JogCard) | **Jog / Manuell** (unten links _Jog_)           |
| Joggen: Referenzfahrt                            | **Jog / Manuell** (Schnellaktion)               |
| Joggen: Handrad, Joystick, 100-mm-Schritt,       | **Jog / Manuell → Mehr Optionen**; Eingänge     |
| einzelne Achsen, Entsperren, Eingänge, Makros    | auch unter Service & Diagnose                   |
| Nullpunkte: Nullpunkt setzen, G54–G59, Speicher  | **③ Einrichten → Nullpunkte** („Mehr Optionen“) |
| Antasten: Z antasten, Antast-Assistent           | **③ Einrichten → Antasten** (Kacheln)           |
| Kamera: Nullpunkt am Fadenkreuz, Feinschritte    | **③ Einrichten → Nullpunkte** (der eine Weg)    |
| Kamera: Bohrung, zwei Bohrungen, Fläche scannen, | **③ Einrichten → Kamera**                       |
| Mitschnitt                                       |                                                 |

### Raum „Job“

| Bisher                                                   | Jetzt                                            |
| -------------------------------------------------------- | ------------------------------------------------ |
| Programmkarte (G-Code öffnen, Zeichnen, Beispiel)        | **① Job**                                        |
| Zeichnen/CAM (CamCard, Serie, beide Seiten)              | **① Job** (Arbeitsfläche statt der Karten)       |
| SD-Karte, Vorrichtungen (ohne Programm)                  | **① Job**; SD-Karte außerdem **⑤ Fräsen**        |
| Vorbereiten: Material, Rohteil                           | **① Job → Vorbereiten** (Werkstück)              |
| Vorbereiten: Werkzeug je T-Nummer, Schnittvorschlag      | **② Werkzeuge** (Zeile je Werkzeug)              |
| Vorbereiten: Spannmittel als Zahlen                      | **③ Einrichten → Nullpunkte**                    |
| Vorbereiten: Nullpunkt (Wege zu Antasten/Nullpunkt)      | **③ Einrichten → Nullpunkte** (Nullpunkt setzen) |
| Extras: Auf SD vorbereiten, Vorrichtungen/Marker drucken | **① Job → Extras**                               |
| Extras: Ausrichten, Autolevel                            | **③ Einrichten → Ausrichten**                    |
| Prüfen: Startklar-Liste                                  | **④ Prüfen** (Checkliste)                        |
| Prüfen: Simulation (Zeitleiste)                          | **④ Prüfen**, unter dem 3D-Bild                  |
| Prüfen: Programm-Daten, Verfahrweg                       | **④ Prüfen → Mehr Optionen**                     |
| Prüfen: Diagnose (Fehler im G-Code)                      | **④ Prüfen → Alle Parameter**                    |
| Fertigen: Start (SD)                                     | **Aktionsleiste** in ⑤ (Halten unten rechts)     |
| Fertigen: Rahmen abfahren                                | **⑤ Fräsen**                                     |
| Fertigen: Streamen, Einzelschritt, SD-Karte              | **⑤ Fräsen → Mehr Optionen**                     |
| Fertigen: Fortsetzen ab Zeile                            | **⑤ Fräsen → Alle Parameter**                    |
| Laufender Job: Fortschritt, Overrides                    | **⑤ Fräsen** (sonst Laufleiste mit Weg dorthin)  |
| Laufender Job: Pause / Fortsetzen / Abbrechen            | **Aktionsleiste** in ⑤ (und PAUSE oben rechts)   |
| Abläufe über den Schritten: Wenden, In Abschnitten,      | oben in **jedem** der Schritte ①–⑤               |
| Vorrichtung erkannt                                      |                                                  |
| Startleiste unten („Start gesperrt: n Punkte“)           | **Aktionsleiste** (Text) und Zustände im Stepper |
| Werkzeugwechsel (gehaltener Job)                         | über jedem Ort, wie bisher                       |

### Raum „Maschine“

| Bisher                                                        | Jetzt                                             |
| ------------------------------------------------------------- | ------------------------------------------------- |
| Werkzeuge: Werkzeug- und Materialbibliothek, Schnittwerte     | **Menü → Werkzeugliste** (Schnittwerte auch in ②) |
| Historie                                                      | **Menü → Service & Diagnose → Historie**          |
| – (neu) Laufzeit der aufgezeichneten Jobs                     | **Menü → Service & Diagnose → Historie**          |
| – (neu) Achstest, Verbindungsdaten                            | **Menü → Service & Diagnose → Diagnose**          |
| – (neu) Meldungshistorie                                      | **Menü → Service & Diagnose → Meldungen**         |
| Verbindung: Verbinden, Simulator, Companion                   | **Menü → Einstellungen → Verbindung**             |
| Verbindung: Protokoll                                         | **Menü → Service & Diagnose → Diagnose**          |
| Verbindung: Konsole (Experten)                                | **Menü → Konsole** (nur mit Expertenfunktionen)   |
| Einrichtung: Maschinenprofil, Steuerung, Profil teilen        | **Menü → Einstellungen → Maschine**               |
| Einrichtung: Kalibrieren (Genauigkeit, Kamera-Kalibrierung)   | **Menü → Service & Diagnose → Kalibrieren**       |
| Einrichtung: Kamera einrichten                                | **Menü → Einstellungen → Kamera**                 |
| Einrichtung: Werkstatt, Benachrichtigungen, Makros            | **Menü → Einstellungen → Maschine**               |
| Einrichtung: Expertenfunktionen anzeigen                      | **Menü → Einstellungen → Maschine**               |
| Experte: config.yaml, Datei-Editor, $-Einstellungen, Firmware | **Menü → Einstellungen → Experte**                |
| – (neu)                                                       | **Menü → Einstellungen → Maschine → Darstellung** |

### Rund um die Bühne

| Bisher                                           | Jetzt                                               |
| ------------------------------------------------ | --------------------------------------------------- |
| Kopfzeile: Zustand mit Punkt                     | Statusleiste: Zustandsmarke mit Zeichen und Wort    |
| Kopfzeile: Dateiname, Uhr                        | Dateiname in der Aktionsleiste; Uhr entfallen       |
| Kopfzeile: Suchen                                | Zeile der Schritte, rechts                          |
| Kacheln unter der Bühne: Position, Vorschub,     | Statusleiste                                        |
| Spindel                                          |                                                     |
| Kachel Job (Zeit/Fortschritt, Zeile, Abweichung) | Aktionsleiste                                       |
| Laufleiste (Job läuft, anderer Raum)             | auf Start, im Jog-Feld und in den Nebenbereichen    |
| Bühne, Werkzeuge, Großbild, Alarm-Banner         | unverändert; jeder Schritt bringt seine Ansicht mit |

### Der Zustand der Schritte

Die fünf Schritte lesen ihren Zustand aus der **einen** Startklar-Liste (`lib/readiness.ts` →
`lib/steps.ts`): jeder Punkt gehört zu dem Schritt, auf dem man ihn behebt.

| Schritt      | Punkte der Liste                                                      |
| ------------ | --------------------------------------------------------------------- |
| ① Job        | Fehler im G-Code, FluidNC-Fallen, Serie                               |
| ② Werkzeuge  | Werkzeuge des Jobs gegen die Werkzeugliste (Warnung)                  |
| ③ Einrichten | Verbindung, Referenzfahrt, Nullpunkt, Vorrichtung, Wenden, Abschnitte |
| ④ Prüfen     | Verfahrweg, Z-Tiefe, Drehzahl/Vorschub, Kollisionen, Spannmittel,     |
|              | Maschinenprofil                                                       |
| ⑤ Fräsen     | ✕ solange irgendein Punkt sperrt; ✓ wenn der Job gefräst ist          |

### Tasten

| Bisher                         | Jetzt                                             |
| ------------------------------ | ------------------------------------------------- |
| `1` `2` `3` wechseln den Raum  | entfallen; `Strg/Cmd+→` = nächster Schritt        |
| –                              | `Leertaste` = Pause, solange sich etwas bewegt    |
| –                              | `Esc` = laufenden Job abbrechen, mit Rückfrage    |
| –                              | `1`–`5` = Jog-Schrittweite (bei offenem Jog-Feld) |
| Pfeile/Bild↑↓ im Raum Fahren   | bei offenem Jog-Feld                              |
| `T` `K` `D` `E` `?` `/` Strg+K | unverändert                                       |

## Abweichungen vom Guide (bewusst)

- **NOT-HALT bleibt** als Software-Taste neben PAUSE (Entscheidung des Besitzers). Der Guide nennt
  Not-Halt reine Hardware; die Taste ersetzt keinen Not-Aus und sagt das ohne Verbindung auch.
- **Einstellungen stehen im Menü**, nicht hinter einem eigenen Zahnrad in der Zeile: bei 1024 px
  hätten Start, fünf Schritte, Suche und vier Bereiche mit Beschriftung nicht nebeneinander gepasst,
  und Icons ohne Beschriftung schließt der Guide aus. Der Menüknopf trägt den Namen des offenen
  Bereichs.
- **Start: die Empfehlung liegt in der Aktionsleiste** („Als Nächstes“ + Text + die eine Aktion
  unten rechts) statt als Karte mit eigenem Knopf – sonst gäbe es zwei Primäraktionen.
- **Statusleiste unter 1280 px**: die Positionsziffern werden kleiner (22 px statt 28 px), damit
  Zustand, PAUSE und NOT-HALT ihre Größe behalten; unter 1024 px steht die Leiste in zwei Zeilen.
  Unter 1500 px zeigen Verbindung und Meldungen nur ihr Zeichen (das Wort steht für Vorleser im
  Namen; „Nicht verbunden“ steht ohnehin in der Zustandsmarke).
- **Schrift 16 px** überall (der Guide nennt 14 px am Desktop): Felder brauchen auf dem iPad 16 px,
  und die Bedienelemente sind auf 48 px ausgelegt.
- **56-px-Ziele nur auf dem Maschinen-Touchscreen** (Finger **und** unter 1024 px Breite); Tablet
  und Desktop bleiben bei 48 px, wie §8 es trennt.
- **Leertaste** pausiert nur, **solange sich etwas bewegt**; im Stillstand behält sie ihre
  Bedeutung für die Schaltfläche mit dem Fokus (sonst wäre die Tastaturbedienung der Halteknöpfe weg).
- **Esc** pausiert nicht von selbst, sondern fragt; der Job läuft weiter, bis bestätigt ist (PAUSE
  bleibt über der Frage erreichbar).
- **„Im Material“ ist Blau** (Akzent, wie „Läuft“), nicht mehr Rot. Was auf dem Bild ausgewählt
  ist (Zwinge, Marke, Fadenkreuz der Kamera), war blau und ist jetzt hell-violett, damit es sich
  von der Fräsbahn abhebt – der Guide gibt Violett sonst dem Antasten; wer lieber die Bahn violett
  und die Auswahl blau hätte, tauscht zwei Zeilen in `styles/theme.css` (`--stage-cut`,
  `--stage-select`).
  Halteknöpfe für „nicht rückholbare“ Dinge (Job stoppen, Löschen) sind neutral; Rot tragen nur
  NOT-HALT, Alarm, Störung, sperrende Punkte der Startklar-Liste und Fehler im G-Code.
- **Sprachausgabe**: nicht gebaut (`docs/ideen.md`). Ein USB-Handrad gibt es nicht; Tastatur,
  Maus, Gamepad, Bildschirm-Handrad und Joystick laufen seit Etappe 13 über eine Aktionsschicht.
- **Drehachse A**: nur vorbereitet – die Statusleiste zeigt A, und das Jog-Feld bekommt A−/A+
  (Schritte in Grad, ohne Dauerlauf und ohne Grenzen), sobald das Maschinenprofil eine Drehachse
  hat. Mehr nicht.

## Etappe 12 (erledigt): die fünf Schritte im Einzelnen

Reihenfolge nach §11.2: ⑤ Fräsen → ③ Einrichten → ① Job → ② Werkzeuge → ④ Prüfen. Jeder Schritt
beantwortet seine Leitfrage, hat **eine** Primäraktion unten rechts und bringt seine Ansicht der
Bühne mit (①② Tisch, ③ Kamerabild – wo eine eingerichtete Kamera läuft, sonst Tisch –, ④⑤ 3D; wer
in einem Schritt von Hand umschaltet, behält dort seine Wahl).

- **⑤ Fräsen** (`RunScreen.tsx`, `store/start.ts`, `store/run.ts`):
  - **Der Start ist die Primäraktion der Aktionsleiste – und bleibt ein Halten** (1 s, „Fräsen
    starten“ bzw. „Teil 1/2 starten (T1)“). Antippen, Doppeltipp, zu kurzes Halten und Abrutschen
    starten nichts; eine Taste gibt es nicht. Solange ein Punkt der Startklar-Liste sperrt, steht
    dort kein Start, sondern der Weg zu „Prüfen“; ist die Maschine nur gerade nicht bereit, ist das
    Halten gesperrt und sagt bei Antippen, warum. Gestartet wird wie bisher von der SD-Karte.
  - **Bestätigungen nach §6.4** (`lib/startChecks.ts`, `StartConfirm.tsx`): Start ohne gesetzten
    Nullpunkt, Z unter der Sicherheitshöhe (nur wenn das Programm zuerst seitlich fährt, statt
    anzuheben) und Spindelstart mit einem als Messtaster markierten Werkzeug. Das Halten öffnet
    dann die Frage statt zu starten; gestartet wird mit einem **zweiten Halten in der Frage**.
    Nullpunkt und Z werden je Job einmal bestätigt, der Messtaster bei jedem Start.
  - **Vor dem Start:** was laufen wird (Programm, geschätzte Zeit, Teile je Werkzeug), was sperrt,
    Hinweise (bereinigte Zeilen, Fräsmotor von Hand), „Rahmen abfahren“ (Halten).
  - **Während des Jobs:** Fortschritt in 72 px, Restzeit in 48 px, aktuelle Operation in 24 px;
    Overrides für Vorschub und Spindel, 50–150 %, Schieber mit −10/+10 und „100 %“; PAUSE oben
    rechts und „Fräsen pausieren“ unten rechts, „Fräsen fortsetzen“ als kurzes Halten (damit ein
    Doppeltipp auf Pause nie fortsetzt), „Job abbrechen“ links mit Rückfrage. Eilgang-Override,
    Laufzeit, Abweichungsverlauf unter „Mehr Optionen“. 3D-Bild mit Werkzeug, Kamerabild als Bild
    im Bild (Antippen tauscht).
  - **Am Ende:** Zusammenfassung (Dauer, Teile, größte Abweichung, Stückzahl der Sitzung) und
    „Nächstes Teil: gleicher Job“ – das bringt nur den Start zurück, es startet nichts.
  - **Verbindungsverlust im Job** (`CriticalLayer.tsx`): kritische Meldung über der ganzen
    Arbeitsfläche mit Ursache, Auswirkung (SD-Job läuft weiter / Stream bleibt stehen) und
    Maßnahme, bis sie quittiert ist. Die App verbindet sich nie von selbst neu.
  - Streamen, Einzelschritt und die Dateien der SD-Karte: „Mehr Optionen“; Fortsetzen ab Zeile:
    „Alle Parameter“.
- **③ Einrichten** (`SetZeroCard.tsx`, `ProbeTiles.tsx`):
  - **Ein Weg zum Nullpunkt** in vier Schritten: Ziel im Bild antippen (zeigt nur das Ziel; als
    Zahl korrigierbar) → „Hinfahren“ (Halten; Fadenkreuz oder Fräser) → fein korrigieren
    (Schritte 0,01/0,1/1 mm oder ein eigener) → „Nullpunkt hier setzen“ (Halten). Steht Z unter
    der Sicherheitshöhe und „vorher anheben“ ist aus, muss der freie Weg erst bestätigt werden.
  - **Nullpunkte dieses Jobs:** die letzten fünf, mit denen der Job gestartet wurde; X/Y kommen mit
    einem Halten zurück (Z nicht: es hängt vom Werkzeug ab).
  - **Antast-Assistenten als Kacheln** mit Skizze und Bewegungsrichtung: Z-Oberfläche, Ecke,
    Kante, Bohrungsmitte, Werkzeuglänge, Winkel ausrichten. Ecke, Kante und Bohrung **messen nur**;
    das Ergebnis zeigt die Abweichung zum bisherigen Nullpunkt → übernehmen oder verwerfen.
  - Spannmittel als Zahlen liegen jetzt hier; X=0/Y=0/Z=0, G54–G59 („Mehr Optionen“) und der
    Nullpunkt-Speicher („Alle Parameter“) darunter.
- **① Job** (`JobDashboard.tsx`, `store/recent.ts`, `WorkpieceCard.tsx`): Karte des geladenen Jobs
  mit Bahnvorschau, Größe, Laufzeit, Werkzeug; „Zuletzt verwendet“ (sechs Jobs, mit dem zuletzt
  benutzten Nullpunkt; ein Tipp lädt wieder); mehrere Dateien auf einmal (Ziehen oder Auswählen:
  die erste wird geladen, alle stehen in der Liste); leer = Ablagefläche mit einem Satz, die
  Primäraktion heißt dann „G-Code öffnen“. Werkstück: Material und Rohteil (die Größe aus dem Job
  ist die Empfehlung; eigene Maße unter „Mehr Optionen“).
- **② Werkzeuge** (`JobTools.tsx`, `lib/jobTools.ts`): je Werkzeug des Jobs eine Zeile mit
  Typ-Zeichen, Ø, Schneidenlänge, Frästiefe und Zustand ✓ passt / ⚠ prüfen / ✕ fehlt (nicht in der
  Liste, Schneide kürzer als die Frästiefe, anderer Ø als im CAM, Messtaster); passende Werkzeuge
  aus der Liste mit einem Tipp; Schnittvorschlag als „empfohlen“ markiert, Punkt bei abweichendem
  Vorschub; „Länge messen“ (Halten) in der Zeile, wenn ein Werkzeuglängensensor eingerichtet ist –
  sonst gesperrt mit Grund und Weg dorthin. Ein Werkzeug lässt sich in der Werkzeugliste als
  **Messtaster** markieren: Zeile und ⑤ zeigen „Spindelstart gesperrt“, der Start fragt jedes Mal.
- **④ Prüfen** (`Timeline.tsx`, `lib/operations.ts`, `lib/readiness.ts`): 3D-Simulation als
  Hauptfläche, darunter die Zeitleiste mit Abspielen, Schieber, Marken und Sprungtasten der
  Operationen; Checkliste aus der Startklar-Liste, jetzt auch mit **Z-Tiefe plausibel** (gegen die
  Rohteildicke), **Werkzeuge** und **Drehzahl/Vorschub in Grenzen** – jeder Punkt mit eigenem
  Zeichen, nie nur Farbe. Programm-Daten, Wiedergabe-Optionen und Verfahrweg: „Mehr Optionen“;
  Fehlerliste des G-Codes: „Alle Parameter“ (die Checkliste klappt sie auf, wenn ein Punkt dahin
  führt).
- **Über alle Schritte:** Bedientiefe §2 je Bereich (`Depth.tsx`, gemerkt in `useUi.depth`),
  „empfohlen“-Marke und Punkt bei Abweichung, Gründe an gesperrten Schaltflächen der neuen Teile.

### Abweichungen und Auslassungen der Etappe 12

- **„Nach Operation pausieren“ gibt es nicht.** FluidNC kennt keine Operationen und kann einen
  SD-Job nur sofort anhalten (Vorschub halten). Ehrlich wäre es nur für gestreamte Jobs zu bauen;
  der Standardweg ist die SD-Karte. Jobs mit mehreren Werkzeugen halten ohnehin zwischen den
  Teilen an (Werkzeugwechsel).
- **„Probelauf in der Luft“ (Z-Offset) fehlt.** Es gab ihn nicht, und sicher wäre er nur mit einer
  geprüften Umrechnung des Programms (alle Z-Wörter, Spindel aus) – das ist ein eigenes Stück in
  `gcode-core` mit vollständigen Tests, kein Nebenbei. Steht in `docs/ideen.md`.
- **Operationen** sind, was das Programm selbst nennt (Kommentarzeile vor den Fräsbahnen, wie
  Fusion sie schreibt) plus die Werkzeugwechsel. Programme aus dem eigenen „Zeichnen“ nennen noch
  keine – dort stehen nur die Werkzeuge. Nichts wird geraten.
- **Die kritische Meldung pulsiert nicht** (der Guide nennt „pulsierend“): Alarme werden in dieser
  App nie animiert (Sicherheitsregel aus CLAUDE.md). Sie ist rot, vollflächig und bleibt bis zur
  Quittierung.
- **Der Messtaster sperrt nicht hart, sondern verlangt bei jedem Start die Bestätigung** – so, wie
  §6.4 es nennt. Die App weiß nicht, was wirklich in der Spindel steckt.
- **Z unter der Sicherheitshöhe** wird beim Start nur gefragt, wenn das Programm zuerst seitlich
  fährt. Nach dem Z-Antasten steht der Fräser immer tief; ein Programm, das zuerst anhebt, ist von
  jeder Höhe aus sicher – sonst käme die Frage bei jedem Start.
- **Z-Antasten setzt den Nullpunkt weiterhin sofort** (der Rückzug danach fährt schon in
  Werkstückkoordinaten); die Abweichung steht danach da, und „Verwerfen“ stellt den alten
  Z-Nullpunkt wieder her.
- **Nullpunkt-Historie:** gemerkt wird der Nullpunkt, mit dem ein Job gestartet wurde (und der im
  neuen Ablauf gesetzte), nicht jede Zwischenstellung. Wiederhergestellt werden nur X und Y.
- **„Zuletzt verwendet“** merkt sich Programme bis rund 400 KB im Browser-Speicher; größere stehen
  mit Bild und Daten in der Liste, müssen aber neu geöffnet werden. Was in „Zeichnen“ entsteht,
  steht (noch) nicht in der Liste.
- **Zeitleiste nur unter dem 3D-Bild.** Steht die Bühne in ④ auf Tisch oder Kamera (etwa um eine
  Zwinge zu versetzen), liegt die Zeitleiste im Feld unter „Mehr Optionen“ – der Platz gehört dann
  den Tipp-Werkzeugen.
- **Drehachse:** keine Kachel „Drehachse Mitte“, keine abgewickelte Mantelansicht als eigene
  Prüfansicht (A bleibt nur vorbereitet).
- **Tastenkürzel für die Hauptaktion:** `Strg/Cmd+→` führt zum nächsten Schritt; für den Start
  gibt es bewusst keine Taste.
- **Gründe an gesperrten Schaltflächen** trugen in Etappe 12 nur die neuen Teile; seit Etappe 13
  sagt jede gesperrte Schaltfläche bei Antippen etwas (siehe dort).

## Etappe 13 (erledigt): Nebenbereiche und Abschluss

- **Blatt unten (600–1023 px)** (`ui/sheet.tsx`): drei Stellungen – _zugeklappt_ (nur der Griff),
  _halb_ (so beginnt es: unter dem Bild, nie darüber) und _ganz_ (die Arbeitsfläche). Beschriftete
  Tasten im Griff („Zuklappen“, „Kleiner“, „Größer“) statt einer Geste; die Stellung wird je Ort
  gemerkt. Das Blatt reicht nie über Statusleiste oder Aktionsleiste, und es ändert seine Größe
  nicht, solange etwas gehalten wird. Das Jog-Feld nennt seinen Namen nur noch einmal (im Griff,
  mit „Jog schließen“ daneben).
- **Jog-Feld** (`JogPanel.tsx`, `JogCard.tsx`, `lib/jog.ts`): XY-Kreuz mit _Stopp_ in der Mitte, Z
  daneben, A bei Drehachse; die Achsen tragen die Farben der Tokens (wie Positionsanzeige und
  3D-Achsen). Schrittweiten 0,01 · 0,1 · 1 · 10 mm · Dauer. Schnellaktionen, jede ein Halten und
  jede mit ihrem Grund, wenn sie nicht geht: _Gehe zu Null_ (X/Y zum Werkstück-Nullpunkt; Z hebt
  höchstens an, fährt nie hinunter), _Parkposition_ (eine unter „Mehr Optionen“ gemerkte Stelle
  in Maschinenkoordinaten; erst auf Sicherheitshöhe, dann hin) und _Referenzfahrt_. **Mausrad-
  Feinjog** der zuletzt bewegten Achse (höchstens 0,1 mm je Raste), aber nur solange die Maustaste
  auf seinem Feld gehalten ist – es lässt los wie jedes Halten. Im breiten Blatt liegt das Kreuz
  flach in zwei Reihen (wie die Pfeiltasten), damit es unter das Bild passt.
  **Eine Aktionsschicht** (`store/jog.ts`): Tasten, Tastatur, Mausrad, Gamepad, Bildschirm-Handrad
  und Joystick rufen dieselben wenigen Aktionen; nur sie sprechen mit der Maschine.
  „Mehr Optionen“: 100-mm-Schritt, Handrad und Joystick, Parkposition merken, einzelne Achsen
  referenzieren, Entsperren, Eingänge, Makros.
- **Service & Diagnose** (`ServiceCards.tsx`, `lib/service.ts`): _Diagnose_ – Verbindungsdaten der
  Steuerung, Eingänge live, **Achstest** (1/10/50 mm je Achse und Richtung, per Halten; danach
  steht da, was die Steuerung als gefahren meldet), Protokoll. _Meldungen_ – die Historie mit
  Filter nach Stufe. _Historie_ – Laufzeit der aufgezeichneten Jobs und die Job-Historie.
  _Kalibrieren_ – Genauigkeitsprüfung und Kamera-Kalibrierung (mit Bild).
- **Listen in voller Breite:** Werkzeugliste, Service & Diagnose (außer Kalibrieren),
  Einstellungen (außer Kamera) und Konsole brauchen kein Bild; ihre Karten liegen als Raster über
  die Hauptfläche. Das Jog-Feld bringt das Bild über jeder Liste zurück.
- **Einstellungen:** Verbindung · Maschine (Darstellung, Maschinenprofil, Werkstatt und
  Benachrichtigungen, Makros, Expertenschalter) · Kamera (eigene Ansicht, mit Bild) · Experte.
  Schaltflächen in den Karten sind sekundär – die eine Primäraktion steht unten rechts.
- **Konsole** (nur mit Expertenfunktionen): JetBrains Mono, Protokoll mit Filter (alles · gesendet
  und empfangen · Meldungen der App), Befehlszeile mit Verlauf (↑/↓ oder Antippen einer Zeile –
  das füllt nur das Feld).
- **Meldungszentrum** (§6.3; `lib/messages.ts`, `store/messages.ts`, `Messages.tsx`): öffnet sich
  über die Flagge der Statusleiste, unter der Statusleiste (PAUSE und NOT-HALT bleiben frei).
  _Information_ – kurz eingeblendet, verschwindet. _Hinweis_ – bleibt im Zentrum, ohne
  Einblendung. _Warnung_ – eingeblendet, zählt in der Flagge, bis sie bestätigt ist; sperrt
  nichts. _Störung_ – der Alarm der Steuerung: sperrt Fahren und Starten (das tut FluidNC, die
  App zeigt es), lässt sich nicht wegbestätigen und bietet den Ausweg an (Entsperren als Halten,
  Weg zur Referenzfahrt). _Kritisch_ – Verbindung im Job verloren: über die ganze Arbeitsfläche,
  bis quittiert. Jede Meldung: Bezeichnung · Ursache · Auswirkung · nächste Maßnahme, der Code der
  Steuerung klein dahinter (`ALARM:1`, `error:20`). Die Liste bleibt über einen Neustart erhalten.
- **Telefon** (unter 600 px, `Monitor.tsx`): Fortschritt in 72 px, Restzeit, aktuelle Operation,
  „pausiert“, Position, das Bild (das Kamerabild, wo eine Kamera läuft), die wartende Meldung mit
  Weg ins Meldungszentrum, „Job abbrechen …“ mit Rückfrage. PAUSE und NOT-HALT oben, wie überall.
- **Gründe an gesperrten Schaltflächen** (`lib/reason.ts`, `ReasonLayer.tsx`): jede gesperrte
  Schaltfläche sagt bei Antippen, warum. Halteknöpfe nennen von selbst, was der Zustand der
  Maschine dagegen hat (nicht verbunden, Verbindung im Aufbau, Alarm, pausiert, fährt gerade);
  die übrigen den Maschinenzustand oder – wo die Ursache in der Karte liegt – „Voraussetzung
  fehlt – steht in dieser Karte“.
- **Aufgeräumt:** 78 ungenutzte Wörterbuch-Schlüssel (alte Räume, alter Assistent, alte Kopfzeile)
  aus beiden Sprachen entfernt, eine tote Klasse aus `rooms.css`, 22 eigene Icon-Pfade durch
  Lucide ersetzt (geblieben sind die Zeichen der Werkstatt: Fräser, Zwinge, Rahmenfahrt, Langloch
  …). „Zuletzt verwendet“ auf Start führt jetzt zu den zuletzt verwendeten Jobs.

### Abweichungen und Auslassungen der Etappe 13

- **800 × 600:** Statusleiste (zwei Zeilen), Schritte und Aktionsleiste lassen rund 300 px für
  Bild und Blatt. In der Stellung „halb“ teilen sie sich diese Höhe; das Bild zeigt dann nur sich
  selbst (seine Schalter und Werkzeuge kommen mit „Zuklappen“ zurück), und der Bereichswechsel
  eines Schritts rollt mit, statt oben zu kleben. Beim Jog-Feld macht die Zeile der Schritte Platz
  (der Griff sagt, wo man ist, und schließt es), damit Kreuz und Bild zusammen passen.
- **Die kritische Meldung pulsiert nicht** (wie in Etappe 12): Alarme werden nie animiert.
- **Störung = Alarm der Steuerung.** Andere Fehler der App (Upload gescheitert, Taster ohne
  Kontakt …) sind Warnungen: Sie sperren danach nichts, also wäre „Störung“ für sie gelogen.
- **Ursache · Auswirkung · Maßnahme je Gruppe:** Alarme und abgelehnte Befehle haben ihren
  eigenen Text je Code; die übrigen Meldungen der App bekommen die drei Angaben aus ihrer Gruppe
  (Verbindung, SD-Karte, Kamera, Datei …). Informationen und Hinweise tragen sie auch, obwohl dort
  wenig zu sagen ist („Keine Maßnahme nötig“).
- **Betriebsstunden der Spindel** zählt FluidNC nicht. Gezeigt wird die Laufzeit der Jobs aus der
  Historie – ausdrücklich als das, was sie ist.
- **Der Achstest misst nicht.** Er zeigt, was die Steuerung als gefahren meldet (und damit
  Richtung, Grenzen, Abbruch). Den wirklichen Weg misst die Genauigkeitsprüfung.
- **Mausrad-Feinjog nur gehalten**, nicht frei laufend wie bei Estlcam: ein Rad dreht sich zu
  leicht aus Versehen. Auf Geräten ohne Maus gibt es das Feld nicht.
- **Parkposition** ist neu und eine gemerkte Stelle (X/Y in Maschinenkoordinaten); ohne
  Referenzfahrt ist sie gesperrt, weil die Koordinaten dann nichts bedeuten.
- **Eine Primäraktion:** In den Nebenbereichen ist es der Weg zurück in den Ablauf („Weiter: …“).
  Dialoge (Meldungszentrum, Rückfragen) haben ihre eigene.
- **Tastenkürzel für die Hauptaktion:** `Strg/Cmd+→` (nächster Schritt) überall, wo die
  Hauptaktion ein Weg ist; für Start, Referenzfahrt und NOT-HALT bewusst keine.
- **Nicht in dieser Etappe** (bleiben in `docs/ideen.md`): Probelauf in der Luft, „Nach Operation
  pausieren“, Operationsnamen aus dem eigenen CAM, Ansichten der Drehachse, Sprachausgabe,
  USB-Handrad.

## Etappe 14 (erledigt): erste Nutzung an der Maschine

Was der erste Abend an der echten Maschine (Pi 192.168.0.198 → Jackpot 192.168.0.200, FluidNC
3.9.1) gezeigt hat, und was daraus wurde:

- **Verbinden über den Pi.** Mit einem Companion, der weiterleitet, steht in der Verbindungskarte
  genau ein Weg: _Über den Pi verbinden_ (verbindet wirklich), darüber der Weg „dieses Gerät → Pi →
  Jackpot“. Adresse, Simulator und Demo liegen unter _Andere Verbindung_. Der alte Knopf in der
  Companion-Karte (schrieb nur die Adresse ins Feld) ist weg; die Karte nennt nur noch das Ziel.
- **Warum es nicht geht.** „Verbunden“ heißt jetzt: FluidNC hat geantwortet (Statusabfrage beim
  Öffnen, 8 s Frist) – ein Socket, der auf- und gleich wieder zugeht, ist kein „Verbunden“ mehr.
  Drei Fälle mit Bezeichnung · Ursache · Auswirkung · nächstem Schritt (Meldungszentrum, Karte,
  Statusleiste): _Pi nicht erreichbar_ · _Pi erreicht den Jackpot nicht (Adresse)_ – der Pi schließt
  mit 1011 und nennt die Adresse, die er versucht – · _Jackpot nicht erreichbar (Adresse)_. Der
  nächste Schritt sagt die WLAN-Lehre: FluidNC wählt sich nur beim Einschalten ein.
- **Von selbst wieder – nur ohne Job.** 2 s, 4 s, 8 s, 16 s, dann alle 30 s; _Jetzt versuchen_,
  _Aufhören_ (gemerkt, Schalter in der Karte). Nie während eines Jobs und nie nach einem
  Verbindungsverlust im Job, bis von Hand verbunden wurde (`CriticalLayer` bleibt, wie er war).
  Ein neuer Versuch fragt nur (`?`, `$I`, `$G`, `$#`). Der Pi verwirft Befehle, die kommen, bevor
  FluidNC da ist.
- **Grenzen der Steuerung.** Eigene Karte unter _Maschine → Maschinenprofil_: Höchstgeschwindigkeit
  und Beschleunigung je Achse, gelesen per `$CD`, geschrieben per `$/axes/<a>/<item>=<v>` (halten,
  nur im Stillstand, Bereich 60–20 000 mm/min und 10–2000 mm/s², Warnung bei jeder Erhöhung,
  +20 %-Schritt empfohlen), zurückgelesen und angezeigt. Dauerhaft nur über den Pi: config.yaml
  byteweise lesen (`/api/fluidnc/files/…` des Companion), Sicherung `config.yaml.bak`, nur die
  geänderten Schlüssel ersetzen, beides hochladen und vergleichen. Ohne Pi: „gilt bis zum
  Neustart“. Die Tippgeschwindigkeit der App heißt jetzt so und zeigt die Grenze daneben.
- **Rückmeldung auf jede Taste.** Gedrückt-Zustand auf jedem Bedienelement (`data-press` ab
  `pointerdown`, Tönung über jede Fläche, beide Themes – vorher sah ein gedrückter Umriss-Knopf mit
  der Maus aus wie ein überfahrener, Segmente, Tabs und Schritte hatten gar keinen). Ergebnis, wo es
  nicht von selbst zu sehen ist: Haken/Kreuz/Kreisel am Knopf (Halten-Knöpfe mit Promise, Übernehmen,
  Companion testen/abgleichen, Von der Maschine lesen) und die Antwort der Steuerung auf den letzten
  Befehl unter dem Jog-Kreuz und in der Konsole (ok oder `error:n` mit Bedeutung).

### Abweichungen und Auslassungen der Etappe 14

- Der Companion versucht FluidNC nicht selbst weiter, während Browser warten: die Versuche macht
  die App (jeder Versuch öffnet den Weg zum Pi neu, der Pi versucht dabei FluidNC). Ein Weg statt
  zwei, gleiches Verhalten direkt und über den Pi.
- Dauerhaftes Speichern der Grenzen ohne Pi gibt es nicht: über den WebSocket kommt die Datei ohne
  Leerzeilen zurück, und FluidNCs eigenes `$CD=config.yaml` schriebe die ganze Datei ohne
  Kommentare neu. Lieber „bis zum Neustart“ als eine veränderte Datei.
- An der echten Maschine ist nichts davon geprüft; das Speichern in die config.yaml zuerst mit
  Vergleich und Neustart prüfen (docs/erste-schritte.md).

## Abnahme je Bildschirm (DESIGN.md §11)

Jeder Bildschirm wurde bei 1280 × 800 und 800 × 600 (dazu iPad quer 1180 × 820 und Telefon
390 × 780, einmal im hellen Theme) gegen die Liste „Abnahme je Screen“ geprüft – an den Bildern und
durch die Tests in `apps/control/e2e` (`areas.spec.ts`, `steps.spec.ts`, `control.spec.ts`,
`ipad.spec.ts`, `usability.spec.ts`).

Die Kriterien:

1. **Primär** – eine Primäraktion unten rechts; Statusleiste und PAUSE sichtbar
2. **Zustände** – leer · lädt · Fehler · Warnung · Erfolg umgesetzt
3. **Rückmeldung** – nach §6.2 (jede Aktion zeigt ihr Ergebnis, gesperrte Schaltflächen sagen
   warum), Meldungen nach §6.3
4. **Tokens** – nur Tokens und vorhandene Komponenten
5. **Touch/Typo** – Ziele ≥ 48 px (56 px am Maschinen-Touchscreen), Typografie nach §7; geprüft bei
   1280 und 800 px
6. **Taste** – Tastenkürzel für die Hauptaktion
7. **Bewegung** – keine Bewegung ohne ausdrückliche Bestätigung

✓ erfüllt · ◐ erfüllt mit einer Abweichung (Nummer unter der Tabelle) · – trifft nicht zu

| Bildschirm         | 1 Primär | 2 Zustände | 3 Rückmeldung | 4 Tokens | 5 Touch/Typo | 6 Taste | 7 Bewegung |
| ------------------ | -------- | ---------- | ------------- | -------- | ------------ | ------- | ---------- |
| Start              | ✓        | ✓          | ✓             | ✓        | ◐ (e)        | ✓       | ✓          |
| ① Job              | ✓        | ✓          | ◐ (c)         | ✓        | ◐ (e)        | ✓       | –          |
| ② Werkzeuge        | ✓        | ✓          | ✓             | ✓        | ◐ (e)        | ✓       | ✓          |
| ③ Einrichten       | ✓        | ✓          | ◐ (c)         | ◐ (d)    | ◐ (e)        | ✓       | ✓          |
| ④ Prüfen           | ✓        | ✓          | ✓             | ◐ (d)    | ◐ (e)        | ✓       | –          |
| ⑤ Fräsen           | ✓        | ✓          | ✓             | ◐ (d)    | ◐ (e)        | ◐ (f)   | ✓          |
| Jog / Manuell      | ◐ (a)    | ✓          | ✓             | ✓        | ◐ (e)        | ✓       | ✓          |
| Werkzeugliste      | ◐ (a)    | ✓          | ◐ (c)         | ✓        | ✓            | ◐ (g)   | –          |
| Service & Diagnose | ◐ (a)    | ✓          | ✓             | ✓        | ✓            | ◐ (g)   | ✓          |
| Einstellungen      | ◐ (a)    | ✓          | ◐ (c)         | ✓        | ✓            | ◐ (g)   | ✓          |
| Konsole (Experten) | ◐ (a)    | ✓          | ✓             | ✓        | ✓            | ✓       | ◐ (h)      |
| Meldungszentrum    | ◐ (b)    | ✓          | ◐ (i)         | ✓        | ✓            | ✓       | ✓          |
| Telefon (< 600 px) | ◐ (b)    | ✓          | ✓             | ✓        | ✓            | ✓       | ✓          |

Die Abweichungen und ihr Grund:

- **(a) Primäraktion der Nebenbereiche und des Jog-Felds** ist der Weg zurück in den Ablauf
  („Weiter: Fräsen“ bzw. der nächste offene Schritt). Sie haben keine eigene Hauptaktion – ihre
  Schaltflächen sind sekundär, was die Maschine bewegt, ist ein Halten.
- **(b) Kein „unten rechts“ der Aktionsleiste:** Das Meldungszentrum ist ein Dialog mit seiner
  eigenen Primäraktion unten rechts („Meldungen schließen“). Das Telefon hat keine Aktionsleiste
  und keine Primäraktion: es überwacht nur; PAUSE und NOT-HALT stehen oben.
- **(c) Allgemeiner Grund statt des genauen:** Jede gesperrte Schaltfläche sagt bei Antippen etwas.
  In den älteren Karten (Zeichnen, Abläufe, Kamera, Bibliotheken, Formulare) ist das der Zustand
  der Maschine oder „Voraussetzung fehlt – steht in dieser Karte“, nicht immer der genaue Grund.
- **(d) Bilder mit eigenen Farbwerten:** Tisch, Kamera und 3D zeichnen auf Canvas/WebGL und können
  `oklch`/`color-mix` nicht lesen; sie nehmen die festen `--stage-*`-Farben je Theme (neben den
  Tokens in `theme.css`). Schwarz hinter dem Kamerabild und Weiß auf NOT-HALT stehen als Wert da.
- **(e) 800 × 600:** alle Ziele sind dort 56 px, die Schrift 16 px. Aber die Höhe reicht nicht für
  Bild und Feld zugleich: in der Stellung „halb“ zeigt das Bild nur sich selbst, das Feld zwei bis
  drei Zeilen; „Größer“ gibt dem Feld die Fläche, „Zuklappen“ dem Bild. Auf Start laufen die
  Karten dort als rollende Seite. Die Positionsziffern der Statusleiste sind unter 1280 px 22 px
  hoch (Guide: 28–40 px) und weichen bei sehr langen Werten zuerst – damit PAUSE und NOT-HALT
  nie schrumpfen.
- **(f) Kein Tastenkürzel für den Start:** „Fräsen starten“ ist ein Halten (Finger, Maus oder –
  mit dem Fokus darauf – die Eingabetaste). `Leertaste` pausiert, `Esc` fragt nach dem Abbruch.
- **(g) Hauptaktion = Weg:** `Strg/Cmd+→` führt aus den Nebenbereichen in den Ablauf; eigene
  Tasten haben sie nicht (die Schnellsuche `Strg/Cmd+K` erreicht jede Funktion).
- **(h) Die Konsole schickt, was man tippt** – das ist ihr Zweck (MDI). Sie steht nur mit
  eingeschalteten Expertenfunktionen da und sagt es darunter; ein Antippen des Verlaufs füllt nur
  das Feld.
- **(i) Meldungen der App teilen sich Ursache · Auswirkung · Maßnahme je Gruppe**; die kritische
  Meldung pulsiert nicht (Alarme werden nie animiert).

### Usability-Ziele (§11), gemessen

| Kriterium                                    | Ziel | Gemessen                                      |
| -------------------------------------------- | ---- | --------------------------------------------- |
| Bekannter Job von Start bis „Fräsen starten“ | ≤ 8  | **6 Interaktionen** (`e2e/usability.spec.ts`) |
| Pause                                        | 1    | **1** (PAUSE oben rechts, oder die Leertaste) |

Der Weg mit sechs Interaktionen: _Zuletzt verwendet_ auf Start → Karte des Jobs → ③ Einrichten →
„X/Y wiederherstellen“ (Halten) → ⑤ Fräsen → „Fräsen starten“ (Halten). Gezählt ist jeder Tipp und
jedes Halten an einer verbundenen Maschine, deren Z-Nullpunkt noch stimmt. Muss Z neu angetastet
werden, kommen der Wechsel nach „Antasten“, die Kachel und das Halten des Tastzyklus dazu (neun,
gezählt am Ablauf, nicht im Test gemessen);
ohne Verbindung noch der Weg zur Verbindung und „Verbinden“.

## Was noch offen ist

Steht mit Grund in [`docs/ideen.md`](ideen.md) („Umbau nach DESIGN.md – nach Etappe 13 offen“):
Probelauf in der Luft, „Nach Operation pausieren“, Operationsnamen aus dem eigenen CAM, genaue
Gründe und eigene Meldungstexte je Fall, echte Spindelstunden, USB-Handrad, Sprachausgabe, die
Ansichten der Drehachse.
