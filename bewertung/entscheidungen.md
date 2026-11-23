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
| 23 | Zeichnen, während ein Job läuft | **Erlaubt.** Die Zeichnung und der Serien-Ablauf ändern das Programm, das läuft (oder zwischen zwei Teilen wartet oder dem die Verbindung weggebrochen ist), nie; andere Wege, ein Programm zu laden, sind noch nicht gesperrt (siehe „Offene Beobachtungen“) |
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

## Stand der Bereichs-Oberfläche
Stufe 1 (sechs Reiter, kein „Weiter“, nichts unten rechts in Prüfen) und Stufe 2 (im CAM nur das CAM und die Statusleiste) sind gebaut, getestet und gepusht; die Abnahme steht unten. **Offen: Stufe 3** (angedockte Hauptaktion je Panel) – wartet auf dein Go.
**Regeln des Betreibers:** nicht programmieren, bevor er es freigibt; vor jedem neuen Programmierpunkt Advisor-Plan, sonst nachfragen; offene Fragen immer als Auswahl zum Anklicken stellen.
Offen: Mutation `start.ts:108` (braucht Test mit React-Rendering), Wächter gegen Funkstille bei sichtbarem, aber ruhendem Steuer-Tab (10 s Übergabe, noch nicht geprüft).

## Offene Beobachtungen (nicht behoben, Betreiber informieren)
**Programm unter einem laufenden Job tauschen – nur das CAM und die Serie sind gesperrt.** Dateien öffnen oder ablegen (`openJobFiles`), „Zuletzt verwendet“, das Beispiel, die Genauigkeitsprobe, der Knopf „Vorderseite laden“ im Wenden, `loadLongDemo`, „Ausrichten übernehmen“ und die abgeleiteten Programme (`loadDerived`: Autolevel, Nullpunkt, Löcher; nur bei Zustand ≠ Idle gesperrt) fragen `jobUnderWay()` nicht. Wer während eines Teils eine Datei ablegt, ersetzt das angezeigte Programm; der Job läuft auf der SD-Karte unverändert weiter, die Anzeige (Name, Vorschau, „Nächstes Teil“) stimmt dann nicht mehr. Eine zentrale Sperre in `store/job.ts` wäre möglich; braucht deine Entscheidung (was soll mit einer abgelegten Datei während des Jobs geschehen?).
**Veraltetes `stepAt` nach Abbruch** (`store/machine.ts`, Streaming): beim Abbruch wird `toolChange` geleert, `stepAt` nicht; „wartet“ bleibt wahr, Prüfen ist gesperrt, bis ein neuer Stream beginnt. Vorher schon so; nicht geprüft, ob der Streamer beim Anhalten im Einzelschritt „aborted“ meldet.
**README:** beschreibt an mehreren Stellen noch die Job-Ansichten Vorbereiten/Prüfen/Fertigen/Extras (vor dem Umbau); die Bereichsliste, die Aktionsleiste, die Tasten und die Menü-Wege sind angepasst, der Rest nicht.
**Absolute Jog-Ziele aus einem bis zu 200 ms alten Positionswert:** Ein Schritt-Jog (`store/machine.ts jog`, Weg „referenziert + Softlimits“) rechnet `Ziel = zuletzt gelesene Position + Schritt` und sendet es als absolute Fahrt (`$J=G53 …`). Tippt man unmittelbar nach dem Loslassen einer Dauerfahrt auf dieselbe Achse, kann die gelesene Position (Statusabfrage alle 200 ms) hinter der wirklichen liegen; die Maschine fährt dann um den Nachlaufweg zurück (bei 3000 mm/min höchstens in der Größenordnung von 10 mm). Der unter Last wackelnde Test `jogs continuously while held` (Tablet und Desktop) war ein Rennen im Test, das dieselbe Eigenschaft sichtbar machte; im Test wird jetzt auf die gelesene Position gewartet. Mögliche Abhilfe: vor dem Schritt-Jog auf einen frischen Statusbericht warten (`settled()`), oder relativ fahren. Entscheidung offen; nur an der Maschine prüfbar.

