# Entscheidungen des Betreibers zur Bewertung

Getroffen im Chat per Auswahl, nach `bericht.md`. Was hier steht, gilt; offene Punkte stehen unten.

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Bereichs-Oberfläche statt fester Schritte (DESIGN.md vs. 02-ziele.md) | **Ja, Schritte ersetzen** (DESIGN.md wird angepasst) |
| 2 | 3D-Bearbeitung in dieser App | **Ja, früh**, und zwar **parallel als eigener Strang** (XL, kein Teilcode vorhanden) |
| 3 | Fortsetzen nach Pause | **Überall Halten** (Aktionsleiste und Laufleiste vereinheitlichen) |
| 4 | Start-Sperre „Verlässt den Verfahrweg“ | **Sperre bleibt, bis `soft_limits` in FluidNC an sind**; danach Hinweis + Bestätigung |
| 5 | Schnittwerte/Material | **Je Werkzeug speichern, Material optional** |
| 6 | Werkzeugwechsel mitten im Job | **Teile mit eigenem Start genügen** (SD-Weg bleibt) |
| 7 | Kamera-Abnahme (±0,2 mm, < 30 s) | **Messprotokoll an der Maschine** (Protokoll schreibt Claude, Betreiber führt aus) |
| 8 | Zwei Geräte gleichzeitig am Pi | **Selten, nur zum Zuschauen** (Relay-Fehler beheben, aber nicht vorrangig) |
| 9 | „Wirbelfräsen“ | **= adaptives Ausräumen** (eine Strategie) |
| 10 | Reihenfolge 2D-CAM | 1. Gleich-/Gegenlauf je Bearbeitung + Schnittwerte · 2. Polylinie/Freihand + Booleans · 3. Ebenen/Gruppen + Nesting · 4. Strategien (adaptiv, Restmaterial) |
| 11 | Update-Knopf Pi | **PIN + Prüfsumme + Rückfall** (keine Signatur zunächst) |
| 12 | Umsetzungsreihenfolge | **Sicherheitspunkte zuerst** (Meldung/Leertaste B1/W1/W3, Randwerttests, Relay-Zuordnung B2, Dauerfahrt begrenzen/Relais-Wächter B3), **dann Bereichs-Oberfläche** |
| 13 | Arbeitsweise bei der Umsetzung | **Vor jedem neuen Programmierpunkt Advisor-Planung (Fable)**; ist er nicht erreichbar, vorher beim Betreiber nachfragen. Vorher nach „Stop“ immer erst fragen, wenn es so weit ist. |
| 14 | B2 Relais, zwei Geräte | **Zweites Gerät nur Ansicht** (Relais lässt Befehlszeilen nur vom ersten Gerät durch; PAUSE, NOT-HALT und `?` für alle) |
| 15 | B3 Dauerfahrt ohne Referenz | **Fahrt auf 200 mm begrenzen und Jog-Abbruch (0x85) im Pi-Relais bei Verbindungsende** |
| 16 | B2 Zuschauer-Sperre in der App | **Zentrale Stelle im Store** (umgesetzt) |
| 17 | Bereiche der Oberfläche | **Sechs Bereiche:** Job · Zeichnen/CAM · Einrichten & Fahren · Fräsen (mit Prüfen) · Service · Einstellungen |
| 18 | Im CAM-Bereich sichtbar | **Nur CAM und Statusleiste** (PAUSE und NOT-HALT bleiben) |
| 19 | Startbildschirm und „Weiter“-Kette | **Start bleibt, „Weiter“-Kette entfällt** |
| 20 | Empfehlung „Als Nächstes“ auf dem Start | **Alles bleibt**, auch „weiter bei …“; die Kette entfällt nur aus der Aktionsleiste der Bereiche |

Plan: `plan-bereichs-oberflaeche.md` (wartet auf Freigabe von Stufe 0).

## Stand der Umsetzung
Erledigt und gepusht: B1 (rote Meldung bei Stream-Abbruch), W1 (Leertaste), W3 (PAUSE/NOT-HALT ohne stille Ausnahme), Randwerttests (6 von 7 Mutationen; `start.ts:108` offen, braucht Test mit Rendering). B2 (Relais und Bibliothek) und B3 (200 mm / Z 50 mm, Jog-Abbruch im Relais) sind gebaut und getestet (desktop-e2e 119/119, `pnpm check` grün). B2 App-Seite (Entscheidung des Betreibers: zentrale Stelle im Store): Befehle, Uploads, Jobs und Streaming lehnt der Store im Zuschauer-Gerät ab, der Start zeigt den Grund „Nur Ansicht“ (Prüfskript `bewertung/skripte/sicherheit/viewer.spec.ts` hatte vorher Start nicht gesperrt und einen Upload vorbei an der Sperre gefunden; jetzt e2e `connection.spec.ts`). Als Nächstes: Bereichs-Oberfläche (nach Advisor-Plan und deiner Freigabe).

B2/B3-Antworten des Betreibers: Steuerung geht nach 10 s Funkstille weiter; Z-Grenze 50 mm, X/Y 200 mm.

## Folgen
- Die Entscheidungen 1 und 4 ändern Vorgaben aus `DESIGN.md` (§3.2, §6.4) und `usability.spec.ts`; beides wird mit angepasst.
- Die Konfiguration `soft_limits`/`hard_limits` in FluidNC schaltet der Betreiber an der Maschine (nicht Teil des Codes); bis dahin bleibt die Start-Sperre.
- Entscheidung 3 widerspricht dem Ziel „Fortsetzen: ein Tipp“ (02-ziele §7) bewusst; zu streichen oder zu ändern, falls der Betreiber das ändert.
- Nicht entschieden und nicht begonnen: Messprotokoll-Inhalt, Projekte speichern/Sicherung auf dem Pi, Merkpunkte, Werkzeugwechsel-Knopf, Aufräumen.

## Weitere Entscheidungen während der Umsetzung (Stufe 1 und 2)
| Nr. | Frage | Entscheidung |
|---|---|---|
| 21 | Reiterzeile | **Kurze Namen:** Job · CAM · Einrichten · Fräsen · Service · Einstellungen (`nav.tabs`); unter 1100 px behalten nur der aktuelle Reiter seinen Namen und der Rest sein Zeichen |
| 22 | Prüfen-Ansicht, unten rechts | **Nichts.** Keine Primäraktion; zum Fräsen wechselt der Unterreiter oben im Bereich |
| 23 | Zeichnen, während ein Job läuft | **Erlaubt.** Die Zeichnung und der Serien-Ablauf ändern das Programm, das läuft (oder zwischen zwei Teilen wartet oder dem die Verbindung weggebrochen ist), nie; andere Wege, ein Programm zu laden, sind seit Entscheidung 33 über die zentrale Sperre in `store/job.ts` ebenfalls gesperrt |
| 24 | Fremdes Programm geladen (geöffnete Datei, ausgerichtete Rückseite) | **Nur über den Knopf** „Zeichnung auf den Tisch legen“; eine Änderung in der Zeichnung ersetzt es nie von selbst |
| 25 | Bild im CAM bei fremdem Programm | **Die Zeichnung ist im CAM immer zu sehen und mit dem Finger zu bearbeiten**, auch wenn ein fremdes Programm geladen ist oder läuft (zweiter Prüf-Durchgang, vom Betreiber entschieden) |
| 26 | Nach dem Job | **Per Tipp, nichts geht verloren:** das fertige Programm samt Zusammenfassung bleibt geladen (auch wenn die Zeichnung danach geleert wird), solange die Zeichnung während des Jobs geändert wurde; ein Hinweis im CAM bietet „Zeichnung auf den Tisch legen“ an. Wurde sie nicht geändert, folgt das Programm den Änderungen wie immer. Von selbst geht die Zeichnung nur dorthin, wo gar nichts geladen ist und das Ende bei stehender Verbindung gesehen wurde. (Das ist enger als der Wortlaut aus der ersten Bestätigung; der Betreiber hat die Fassung „per Tipp“ gewählt.) |
| 27 | Tasten und Suche für die Bühnenansichten im CAM | **Die Tasten T · K · D ruhen im CAM** (ein verirrter Buchstabe führt nirgends hin und setzt nichts); die **Einträge** „Tisch/Kamera/3D“ und „Jog / Manuell“ der Suche führen von dort nach Einrichten, wie die Werkzeug-Einträge (Festlegung bei der Umsetzung, bitte prüfen) |
| 28 | Was als „Job unterwegs“ gilt | **Auch ein Job, den nur die Steuerung meldet** (Statusbericht mit `SD:`-Datei bei Lauf, Halt oder Tür – Seite neu geladen, Verbindung von Hand neu aufgebaut). **Eigene Fahrten der App (Antasten, Messen, Hinfahren) sind kein Job:** FluidNC meldet dafür zwar `Run`, aber ohne SD-Datei. (Festlegung bei der Umsetzung, nach Prüf-Durchgang geändert: die erste Fassung zählte jedes `Run` und musste Aufräum-Regeln nachschieben) |
| 29 | Zwischen zwei Teilen und die Prüfen-Ansicht | Wartet ein Job (Werkzeugwechsel, Einzelschritt, zwischen zwei Teilen), zeigen Panel, Aktionsleiste **und** Bühne die Fräsen-Ansicht (ein Selektor, `useRunView`), und der gespeicherte Stand bleibt `cut`, wer auch immer „Prüfen“ verlangt (Tipp, Suche, Link); die Werkzeugwechsel-Karten (Stream und zwischen den Teilen) bleiben auch bei „Großbild“ unter dem Bild |
| 30 | Nachtmodus (Betreiber schläft) | **Bei einer Entscheidung nur für den Betreiber: sichere Empfehlung nehmen, hier als „Festlegung, bitte prüfen“ notieren, weiterarbeiten.** Nie ein PR, nie Force-Push, nur dieser Branch, nur grüne Stände (alle drei E2E-Projekte und `pnpm check`) |
| 31 | Stufe 3 | **Freigegeben, komplett mit Prüfung:** Advisor-Plan, Bau in Teilen, je Teil eigener Commit, Prüf-Durchgang mit Gegenprüfern |
| 32 | Start im Werkzeugwechsel-Feld (zwischen zwei Teilen) | **Gleiche Sperre und gleiche Bestätigung wie die Leiste** (gesperrt bei blockierender Bereitschaftsliste, mit Grund; Start über `requestStart`) |
| 33 | Programm unter einem laufenden Job tauschen (Datei ablegen, Zuletzt verwendet, Beispiel, Vorderseite laden, Ausrichten übernehmen …) | **Zentrale Sperre in `store/job.ts`, Grund zeigen;** nichts geht verloren, die Datei kann nach dem Job geöffnet werden |
| 34 | Veraltetes `stepAt` nach Abbruch | **Erst Test, bei Bestätigung beheben** (wie `toolChange` leeren) |
| 35 | Absolute Schritt-Jog-Ziele aus altem Positionswert | **Vor dem Schritt auf frischen Statusbericht warten (`settled()`)**; im Simulator getestet, an der Maschine noch zu prüfen |
| 36 | Lauf im CAM | **Bleibt:** im CAM nur CAM und Statusleiste, keine Laufleiste |
| 37 | Testaufbau für `start.ts:108` | **React Testing Library + jsdom nur als Dev-Abhängigkeit;** scheitert die Installation am Netz, wird der Punkt übersprungen |
| 38 | Änderungsliste nach Stufe 3 | **Alle vier Gruppen, in dieser Reihenfolge:** Schnittwerte & Lauf-Richtung · Merkpunkte & Werkzeugwechsel-Knopf · Projekte sichern · Kleinkram (Messprotokoll, Update-Knopf, Ausblend-Schalter, Farben); bei offenen Einzelheiten die einfachste, sichere Fassung |
| 39 | README | **Komplett auf den Stand der sechs Bereiche umschreiben** (nur Text; Abgleich mit der Oberfläche) |
| 40 | Festlegungen 27–29 | **Bestätigt** |

## Abnahme Stufe 1 (nach Teil 3)
- **Tests:** alle drei E2E-Projekte grün (272 bestanden, 1 übersprungen; `usability.spec.ts` unverändert grün), `pnpm check` grün (control 579 Tests).
- **Zählung (1180×820, wie im Bericht):** Aufgabe A (G-Code laden und fräsen) **13 Eingaben** (10 Tipps/Halten, 3 Zusätze: Dateiauswahl, 2× Scrollen), Aufgabe B (zeichnen und fräsen, über den Reiter CAM) **14 Eingaben** (12 + 2× Scrollen) – gleich wie vor dem Umbau. Der Umbau ändert die Wege, nicht die Zahl; die Gewinne kommen mit Stufe 2 und 3 (Scrollen, angedockte Aktion).
- **Aktionsleiste (1280×800, 800×600, 820×1180, `skripte/aktionsleiste.cjs`):** Job leer „G-Code öffnen“; Job geladen, CAM, Einrichten, Prüfen, Service: keine Primäraktion; Fräsen (Start gesperrt): „Prüfen“. Screenshots in `screenshots/Aktionsleiste-*`.
- **Reviews:** Teil 2: 19 Funde, 9 bestätigt (6 Sachfehler: laufendes Programm unter der Zeichnung, Reiter ohne Namen, Überlappung bei schmaler Zeile, Menü-Knopf mit langem Namen, CAM öffnet auf 3D, nextStep im CAM) – behoben, nextStep durch Teil 3 erledigt. Teil 3 (zweiter Durchgang): 22 Funde, 17 bestätigt. Behoben: Umbenennung beim ersten Import (das eigene Programm galt als fremd – eine Regression des ersten Fixes), Zeichnung im CAM bei fremdem Programm unsichtbar, Verbindungsabbruch unter dem Job, Serie nahm fremdes Programm mit `take`, veralteter Download, „geändert“ ohne Änderung, Name des aktuellen Reiters unter 620 px, Reiterstreifen bei großer Schrift (jetzt scrollbar), 761–775 px mit Werkzeugliste, Werkzeugwechsel-Empfehlung „Weiter: “ ohne Ziel, Prüfen-Ansicht zwischen zwei Teilen, README/Docs/UI-Texte (Strg+→, Menü-Wege, ③/⑤, „Raum“), verwaiste Texte, Taste „Leertaste“ im Tastenblatt. Nicht angefasst (siehe unten): andere Wege, ein Programm unter einem Job zu laden; veraltetes `stepAt` nach Abbruch.

## Abnahme Stufe 2 (Prüf-Durchgänge 3 bis 5)
- **Stand der Tests bei 5d0846d (letzter gepushter Stand):** alle drei E2E-Projekte grün (283 bestanden, 1 übersprungen), `pnpm check` grün (control 652 Tests); jeder Stand ist nur nach grünem Lauf gepusht (39ebdea, b289d67, bb24995, 5d0846d).
- **Prüf-Durchgang 4** (nach der Korrekturrunde, Bereich 01ba42a..HEAD, 3 Blickwinkel mit je 2 Gegenprüfern, 27 Funde, **23 bestätigt**, 4 widerlegt). Umgang mit jedem bestätigten Fund (Nummern wie im Prüfbericht; Spalte „Stand“ wird beim Abarbeiten nachgeführt):

| Nr | Fund | Neu durch uns? | Stand |
|---|---|---|---|
| 13 | Schritt-Jog wartet auf Ruhe und fährt nach „Jog stoppen“ noch (`jogCancel` verwarf ihn nicht) | ja, b289d67 | **behoben** (Epochenzähler: Abbruch, Not-Halt, neue Fahrt, Reset, Alarm verwerfen den wartenden Schritt), getestet mit Mutationen |
| 14 | `jogStale`-Test unterschied „in Ruhe“ nicht von „irgendeinem Bericht“ | ja | **behoben** (Zwischenbericht „Jog“, Abbruch, zwei wartende Taps, Zeitablauf, Fahrt gerade gesendet) |
| 15 | Schritt-Tap, der nach 1,5 s verworfen wird, blieb stumm | ja | **behoben** (Hinweis `drive.notAtRest`) |
| 16 | Schritt-Jog zählt von einem Idle-Bericht, der älter ist als die gerade gesendete Fahrt | nein (schmal) | **verengt, nicht geschlossen:** nach einer gesendeten Fahrt oder einem Stopp gilt der gespeicherte Bericht nicht mehr; ein Bericht, der schon unterwegs war, kann das Fenster noch öffnen – **an der Maschine prüfen** |
| 1, 22 | Abläufe (Löcher, Wenden, Vorrichtung, Abschnitte, Prüfmuster, Autolevel, Demo) laufen nach einer vom zentralen Schloss verweigerten Ladung weiter (Nullpunkt gesetzt, „angewendet“ gemeldet) | ja, a6d005c | **behoben:** `load`/`loadDerived`/`unload`/`restoreOriginal` melden Erfolg, jeder Ablauf fragt `programRefused()` vor seinem ersten Schritt (Löcher, Wenden, lange Demo; Vorrichtungen und Abschnitte über `jobUnderWay()`); tabellarischer Test `programLockFlows.test.ts` mit Mutationen. Der Wächter in `align` (Wenden) ist doppelt gesichert und von keinem Test einzeln erfasst |
| 3, 21 | Profiländerung stößt die Neuberechnung über die Sperre an (Fehlmeldung); `job.locked` nennt keinen Ausweg und hat den Folgeschritt „Vorgang wiederholen“ | ja | **behoben:** Profiländerung berechnet die Schätzung direkt, ohne Sperre; `job.locked` hat eine eigene Meldungsgruppe (`jobLocked`) mit Ausweg („Job abbrechen“ / „Restliche Teile abbrechen“) |
| 0, 8 | SD-Liste und „Programm starten“ zwischen zwei Teilen umgehen die Start-Sperre (Entscheidung 32) | 0: Lock macht es sichtbar; 8: vorher schon | **behoben:** SD-Liste, „Programm starten“ und „Ab Zeile fortsetzen“ sind zwischen zwei Teilen gesperrt, mit Grund (`run5.waitingInPanel`); die SD-Liste fährt nach einer abgewiesenen Ladung nicht mehr los |
| 4 | Serie: Übergabe gesperrt ohne Grund | ja | **behoben** (Grund `cam.jobRuns`) |
| 9 | Leere Bühnenzeile bei jedem Großbild (8 px) | ja | **behoben** (leere Zeile verschwindet per `:empty`) |
| 19, 20 | Testlücken (`offStage(take)` im Fall „keine Fahrten“, wirkungslose Prüfung in `programLock.test.ts`) | ja | **behoben** (zwei neue Tests, beide durch Mutation geprüft) |
| 17, 18 | Entscheidungsprotokoll nicht auf Stand | ja | mit diesem Eintrag behoben |
| 5 | Not-Halt während „Job fortsetzen“ stellt den Stream wieder auf „läuft“, Programm bleibt bis Neuladen gesperrt | nein | **behoben** (**Festlegung, bitte prüfen**: wie Entscheidung 34, weil die Programmsperre daran hängt): nach jedem `await` wird geprüft, dass es noch derselbe laufende Stream ist; vier Tests, durch Mutation geprüft |
| 6 | Abbruch während des M6-Halts lässt `toolChange` stehen und sendet danach noch M5 / `G91 G0 Z20` | nein | **behoben** (**Festlegung, bitte prüfen**, wie 5): nach einem Abbruch geht keine Hebebewegung mehr nach dem Reset hinaus |
| 2 | Alarm im SD-Job lässt `fileJob` und die Sperre bis Not-Halt stehen; Entsperren wird verweigert | nein (Bibliothek) | **offen:** Verhalten der echten FluidNC unbekannt, Änderung läge in `fluidnc-client`; an der Maschine prüfen |
| 7 | Einzelschritt mit Großbild: Weiter-Knopf nur im Panel | nein | **offen**, geht in den Plan für Stufe 3 (angedockte Aktion) ein |
| 10 | Karte im Bühnenfeld bei Großbild unten abgeschnitten (Scrollkasten) | ja | **offen**, wie 7 (Stufe 3) |
| 11 | Bestätigungshälfte von `BetweenParts` ungetestet | nein | **offen**, E2E in Stufe 3 |
| 12 | „Prüfen“ tippbar, aber wirkungslos, solange ein Job wartet (ohne Grund) | nein | **offen** |

- **Prüf-Durchgang 5** (enger Durchgang nur über die drei Korrektur-Commits 20ed9bd, c72f295, bb24995; zwei Blickwinkel, je Fund zwei Gegenprüfer; 10 Funde, **10 bestätigt, keiner „wichtig“**):

| Nr | Fund | Stand |
|---|---|---|
| a | Wartender Schritt wird beim Trennen oder Verbindungsverlust nicht verworfen und meldet danach fälschlich „kommt nicht zur Ruhe“ | **behoben** (Trennen und Verbindungsverlust zählen den Verwerfungszähler hoch), Test |
| b | Neuer 20-ms-Zeitablauf im Jog-Test ließ die Statusabfrage des Simulators (alle 200 ms) dazwischenfunken, phasenabhängig | **behoben** (nur Microtasks, kein Zeitfenster) |
| c | `drive.notAtRest`: Hinweis ohne Toast, Gruppe „allgemein“, ungeprüft | **gepinnt** (Stufe und Gruppe im Test; ohne Toast wie `drive.atLimit`, Absicht) |
| d | Testlücken: `moveMachine`, Stopp-Wege (nur die „Bericht ist älter“-Hälfte), Spindel-Wiederanlauf nach NOT-HALT, `result === 'running'` der Wartebedingung | **geschlossen** bis auf `moveTo`/`moveZ` (gleiche Zeile wie `moveMachine`, nicht einzeln getestet) und das Zurücksetzen bei Reset und Alarm |
| e | Karten (Abschnitte, Vorrichtungen, Wenden) sperrten nur bei Datei-Job/Stream, die Speicher aber bei jedem „Job unterwegs“: Schaltflächen blieben frei und taten dann nichts, ohne Grund | **behoben** (Karten fragen `useJobUnderWay()`, gesperrte Knöpfe nennen den Grund `cam.jobRuns`) |
| f | „Abschnitte abbrechen“ zwischen zwei Teilen leerte den Ablauf, ließ aber den Abschnitt auf dem Tisch, still | **behoben** (verweigert mit Meldung, Test) |
| g | Schritte nach einem `await` ignorierten das Ergebnis von `load`/`loadDerived` (Zuletzt verwendet, Löcher, lange Demo, Abschnitt finden, Vorrichtung messen) | **behoben** (jeder prüft das Ergebnis; `loadPart` und `loadJigJob` melden Erfolg); getestet ist nur der Fall „Datei lesen“, die Fenster nach `setZeroAt` sind klein und ungetestet |
| h | Testlücken in `programLockFlows`: wirkungslose Prüfung, Profil-Test zu schwach, `sections`/`jigs` ungeprüft | **behoben** (Schätzung wird mit dem neuen Wert verglichen; Tests für Abschnitte und Vorrichtung; die Zwischen-Teile-Sperren von SD-Liste, „Programm starten“ und „Ab Zeile fortsetzen“ bleiben ohne Test, weil sie ein React-Rendern brauchen – kommt mit Entscheidung 37) |
| i | Englischer Hinweis nannte „Abort remaining parts“, die Taste heißt „Cancel the remaining parts“ | **behoben** |
| j | `reportOld` wird vom ersten späteren Bericht gelöscht, auch von einem, den FluidNC vor dem Befehl erzeugte; Fahrten über Referenzfahrt, Makros, Rahmen, Antasten setzen ihn nicht | **offen, schmal, bekannt** – **an der Maschine prüfen** |

- Widerlegt (je zwei Gegenprüfer): Großbild-Karte zwischen den Teilen in jedem Bereich; `stepAt`-Zweig unbelegt; veralteter Kommentar „Bewegung zählt als unterwegs“; CLAUDE.md/Tastenblatt ohne T·K·D im CAM.
- **Regel für den Rest der Nacht** (Rat des Advisors): Stufe 2 gilt als abgenommen, wenn alle von uns neu eingeführten Funde und 5/6 behoben sind und der Rest hier mit Grund steht; danach nur ein enger Prüf-Durchgang über die Korrektur-Commits.

## Abnahme Stufe 3 (angedockte Hauptaktion)
- **Gebaut** (`ui/dock.tsx`, `.dock` in `rooms.css`): ein klebender Fuß der Karte am unteren Rand des Bedienfelds, der eine Knopf bleibt in seiner Karte (nie eine Kopie). Angedockt sind: „Nullpunkt hier setzen“ (`SetZeroCard`), das Antasten (`ProbeCard`, `ProbeWizard`), im Werkzeugwechsel „Fortsetzen“ und „Abbrechen“ (`ToolChangePanel`, unter „Großbild“ am unteren Rand des Streifens unter dem Bild). Dazu: der Einzelschritt-Knopf („Nächster Satz“) steht unter „Großbild“ ebenfalls unter dem Bild (`SingleStepPanel`), die Bestätigungshälfte des Starts zwischen zwei Teilen hat einen Hook-Test.
- **Festlegungen, bitte prüfen** (Regel 30): (1) **Das CAM-„G-Code erzeugen“ ist bewusst nicht angedockt** – ein Tipp, der ein fremdes Programm ersetzt, soll nicht dauernd neben dem stehen, was man gerade zeichnet. (2) **Das Dock sitzt in der Karte, nicht am Bedienfeld:** erst wenn die Karte im Bild ist, steht ihre Aktion da – sonst wäre „Antasten starten“ schon über den Kacheln sichtbar, bevor man die Werte darunter gesehen hat. (3) **Auf dem Maschinen-Bildschirm (800 × 600) ist das Blatt in „halb“ zu kurz** (~100 px Körper) für Karte und Dock; dort ist „Größer“ der Weg (das Blatt hat seine drei Stellungen dafür).
- **Messung statt Sichtprüfung:** `e2e/dock.spec.ts` (16 Fälle) und die Prüfungen in `control.spec.ts` messen mit `inReach` (Kasten im sichtbaren Bereich *und* ein Tipp in der Mitte trifft den Knopf); die Fälle schlugen vor dem Bau alle fehl (Knopf bei y≈1127–1900 bei einem Bedienfeld bis y=714). Fehler unterwegs: ein globales `scroll-padding-bottom` verschob den Inhalt des Jog-Felds um 50 px (der Test „bewegt sich nicht unter einem gehaltenen Knopf“ fing es) – jetzt nur noch in Bedienfeldern mit Dock (`:has(.dock)`).
- **Zählung neu:** Aufgabe A **12** (vorher 13), Aufgabe B **13** (vorher 14), je ein Scroll weniger; siehe `bericht.md`, Nachtrag in Aufgabe 1.
- **Tests:** alle drei E2E-Projekte grün (299 bestanden, 1 übersprungen), `pnpm check` grün (control 659 Tests); `usability.spec.ts` unverändert grün.
- **Fund 7, 10 und 11 des Prüf-Durchgangs 4** damit erledigt (Einzelschritt unter „Großbild“, Weiter/Abbrechen im Streifen erreichbar, Bestätigung zwischen Teilen getestet). **Offen:** Fund 12 („Prüfen“ tippbar, aber wirkungslos, solange ein Job wartet).

## Stand der Bereichs-Oberfläche
Stufe 1 (sechs Reiter, kein „Weiter“, nichts unten rechts in Prüfen) und Stufe 2 (im CAM nur das CAM und die Statusleiste) sind gebaut, getestet und gepusht (Abnahme siehe oben). **Stufe 3** (angedockte Hauptaktion je Panel) ist mit Entscheidung 31 freigegeben und kommt nach der Korrekturrunde.
**Regeln des Betreibers:** vor jedem neuen Programmierpunkt Advisor-Plan; offene Fragen als Auswahl zum Anklicken – in der Nacht gilt Entscheidung 30; nie ein PR, nur grüne Stände.
Erledigt (Entscheidung 37): die Mutation `start.ts:108` („Maschine nicht in Ruhe“) wird jetzt von `test/startHook.test.ts` erfasst (React Testing Library + jsdom, nur als Dev-Abhängigkeit; die drei Nachbarzweige auch). Offen: Wächter gegen Funkstille bei sichtbarem, aber ruhendem Steuer-Tab (10 s Übergabe, noch nicht geprüft).

## Offene Beobachtungen (nicht behoben, Betreiber informieren)
**README:** beschreibt an mehreren Stellen noch die Job-Ansichten Vorbereiten/Prüfen/Fertigen/Extras (vor dem Umbau); wird mit Entscheidung 39 komplett umgeschrieben.
**Schritt-Jog nach einer Dauerfahrt (Entscheidung 35):** ein Schritt wartet, wenn die Maschine noch fährt, auf den ersten Statusbericht „Idle“ (höchstens 1,5 s, sonst Hinweis); gebaut wurde ein eigener Helfer `atRest()` statt `settled()`. Nur im Simulator getestet; **an der Maschine prüfen**, besonders das schmale Fenster aus Fund 16.
**Phone-Monitor:** meldet „Läuft“, während ein Stream auf den Werkzeugwechsel wartet, und zeigt dazu keine Karte (vorher schon so).
