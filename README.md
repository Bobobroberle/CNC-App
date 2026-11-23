# LowRider Control

Web-Oberfläche für die **V1E LowRider v4** mit **Jackpot-Board (FluidNC)**: Ist/Soll-Pfadverfolgung
live, Simulation in 2D und 3D vor dem Start, geführte Nullpunkt-, Tast- und Werkzeugwechsel-Zyklen,
Werkzeug- und Materialbibliothek mit lernenden Schnittwerten, FluidNC-Konfiguration und Firmware an
einem Ort. FluidNC bleibt der Motion-Controller; die App löst Sicherheitsfunktionen aus und zeigt sie
an, ersetzt aber keine. Vision, Ausbaustufen und Leitplanken:
[docs/projektbeschreibung.md](docs/projektbeschreibung.md).

> **Stand:** Alle fünf Ausbaustufen sind umgesetzt und automatisch getestet (Unit-Tests, Golden-Files,
> Playwright gegen eine simulierte FluidNC). **An der echten Maschine ist noch nichts abgenommen.**
> Die Prüfliste dafür steht in [docs/erste-schritte.md](docs/erste-schritte.md), offene Punkte in
> [docs/offene-fragen.md](docs/offene-fragen.md).

## Was die App kann

Die Oberfläche folgt dem UX-/HMI-Guide [DESIGN.md](DESIGN.md) (Umbau in Etappen, Stand und
Zuordnung alt → neu in [docs/umbau-guide.md](docs/umbau-guide.md)):

- **Statusleiste**, auf jedem Bildschirm gleich: Maschinenzustand als Marke mit Zeichen und Wort
  (_Nicht verbunden_ · _Bereit_ · _Läuft_ · _Pausiert_ · _Antasten_ · _Alarm – Klartext_), Position
  X Y Z (A bei Drehachse; ein Tipp wechselt Werkstück/Maschine), Spindel, Vorschub, Verbindung,
  Meldungen ⚑ – und rechts **PAUSE** (Vorschub halten: ein Tipp, keine Rückfrage, nie verdeckt,
  nie gesperrt) und daneben mit Abstand **NOT-HALT**.
- **Start**: der Zustand groß, **eine** Empfehlung „Als Nächstes“ aus dem echten Zustand (verbinden,
  Alarm beheben, Referenzfahrt, unterbrochenen Job fortsetzen, weiter beim offenen Bereich), der
  aktuelle oder letzte Job, Werkzeug und Material, die letzte Meldung, Schnellzugriffe.
- **Sechs Reiter**, frei anzuwählen: **Job** (Programm öffnen, Zuletzt verwendet, Werkstück) ·
  **CAM** (zeichnen) · **Einrichten** (Nullpunkte, Antasten, Kamera, Ausrichten) · **Fräsen** mit
  den Ansichten _Prüfen_ (Startklar-Liste, Werkzeuge des Jobs, Simulation, Verfahrweg, Diagnose) und
  _Fräsen_ (Start, Fortschritt, Pause, Fortsetzen) · **Service** (Diagnose · Meldungen · Historie ·
  Kalibrieren) · **Einstellungen** (Verbindung · Maschine mit **Darstellung: dunkel oder hell** ·
  Kamera · Experte). Job, Einrichten und Fräsen zeigen ihren Zustand ✓ ⚠ ✕ ○ aus der einen
  Startklar-Liste. Unter 1100 px behält nur der aktuelle Reiter sein Wort.
- Im **Menü**: _Werkzeugliste_ und _Konsole_ (nur mit Expertenfunktionen). Was eine Liste ist,
  bekommt die ganze Breite; nur Kalibrieren und die Kamera-Einrichtung behalten das Bild.
  **Jog / Manuell** öffnet sich aus jedem Bildschirm über _Jog_ unten links (nicht im CAM).
- **Meldungen** in fünf Stufen (⚑ in der Statusleiste öffnet das Meldungszentrum): _Information_
  (kurz eingeblendet), _Hinweis_ (bleibt im Zentrum), _Warnung_ (bestätigen, sperrt nichts),
  _Störung_ (Alarm: sperrt Fahren und Start, mit Lösungsweg) und _Kritisch_ (Verbindung im Job
  verloren: über die ganze Arbeitsfläche bis zur Quittierung). Jede Meldung nennt Ursache,
  Auswirkung und nächste Maßnahme; der Code der Steuerung steht klein dahinter.
- **Gesperrte Schaltflächen sagen bei Antippen, warum** (nicht verbunden, Alarm, Maschine fährt …).
- **Aktionsleiste** unten: links _Jog_, rechts die Hauptaktion, **wo der Bereich eine hat**: auf
  Start die Empfehlung „Als Nächstes“, im Job ohne Programm _G-Code öffnen_, in Fräsen der Start
  (ein Halten) – dann Pause und Fortsetzen. Einrichten, CAM, Service, Einstellungen und die
  Ansicht _Prüfen_ haben keine; ein „Weiter“ von Bereich zu Bereich gibt es nicht.
- Breiten: ab 1024 px Bild links und Bedienfeld rechts; 600–1023 px (Touchscreen an der Maschine)
  Bedienfeld als Blatt unten in drei Stellungen – zugeklappt, halb (so beginnt es: das Bild bleibt
  frei darüber) und ganz –, 56-px-Ziele; unter 600 px (Telefon) nur Überwachung: Zustand,
  Fortschritt groß, Restzeit, Position, Bild, PAUSE, Abbruch mit Rückfrage – und NOT-HALT.
- **Zahlen** tippt man auf dem Touchscreen in ein eigenes Zahlenfeld (±, Komma, Einheit); eine
  Tastatur schreibt weiter direkt ins Feld.

Die Bühne hat drei Ansichten. **Tisch** ist die Draufsicht auf den Tisch: die
Fotokarte (sobald die Kamera Bilder abgelegt hat) mit Raster, Verfahrweg, Rohteil, Spannmitteln,
Job, Fräser und dem Blickfeld der Kamera; das Livebild sitzt klein in der Ecke. **Kamera** ist das
Livebild groß mit Fadenkreuz und Werkzeugweg, die Übersicht in der Ecke führt zurück zum Tisch.
**3D** zeigt den Job mit Materialabtrag zum Prüfen. Unter dem Umschalter liegt eine Werkzeugleiste
(_Hinfahren_, _Nullpunkt_, _Messen_, _Spannmittel_, dazu der Joystick): ein Tipp auf den Tisch oder
aufs Kamerabild gibt denselben Punkt, das Ergebnis erscheint am Bildrand. Der Werkzeugweg „im
Material“ ist blau (Rot gehört allein Störung, Alarm und NOT-HALT). Ein laufender Job bleibt
überall mit Fortschritt, Restzeit und Pause erreichbar; Hinweise bieten die Lösung direkt an
(„Nicht referenziert“ → _Referenzfahrt_). NOT-HALT und PAUSE sind immer sichtbar
und brauchen einen Tipp; alles Gefährliche (Start, Referenzfahrt, Flashen, Konfiguration schreiben)
braucht Halten.

**Schnellsuche und Tastenkürzel.** In der Reiterzeile steht _Suchen_ (Lupe; am
Laptop auch `Strg/Cmd+K` oder `/`). Ein Feld, in das man irgendein Wort tippt – auch das „falsche“
oder eines mit Tippfehler: „Zwinge“ findet _Spannmittel_, „homing“ die _Referenzfahrt_, „nulpunkt“
den _Nullpunkt_, „zu lang“ _In Abschnitten fräsen_, „Skizze“ das Zeichnen. Jede Zeile sagt, wo die
Funktion wohnt („Einrichten · Nullpunkte“); ein Tipp (oder Enter) **führt dorthin**: Schritt oder
Bereich wechseln, das Jog-Feld öffnet sich, ein zugeklappter Abschnitt klappt auf, die Stelle rollt
ins Bild und ist kurz hell umrandet. Ohne Eingabe zeigt die Suche den _Schnellzugriff_ – was gerade
ansteht (verbinden, Referenzfahrt, der nächste offene Punkt der Startklar-Liste), dann das Übliche
(_Nullpunkt_, _Zeichnen_, _G-Code öffnen_, _Kamera_, _Einpassen_) und darunter _Zuletzt benutzt_.
Die Suche **führt nur hin**: Sie fährt nichts, startet nichts und ändert keinen Job – gefahren
und gestartet wird weiter an den Tasten vor Ort (Halten). PAUSE und NOT-HALT bleiben über der
Suche sichtbar.

Tasten am Laptop (nie, solange in ein Feld getippt wird):

| Taste             | Wirkung                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `Leertaste`       | **Pause** (Vorschub halten), solange sich etwas bewegt – auch im Dialog    |
| `Esc`             | Laufenden Job abbrechen – **mit Rückfrage**                                |
| `Strg/Cmd+K`, `/` | Schnellsuche                                                               |
| `?`               | Übersicht aller Tastenkürzel                                               |
| `T` · `K` · `D`   | Bühne: Tisch · Kamera · 3D                                                 |
| `E`               | Einpassen                                                                  |
| Pfeile, `Bild↑/↓` | Jog X/Y und Z – nur bei offenem Jog-Feld                                   |
| `1` … `5`         | Jog-Schrittweite 0,01 · 0,1 · 1 · 10 mm · Dauerlauf – bei offenem Jog-Feld |

Dazu wie bisher die Tasten der Zeichnung (Entf, Pfeile, Strg+Z …); die Übersicht (`?`) listet alle.
Für NOT-HALT, Start und Referenzfahrt gibt es absichtlich keine Taste. Auf dem iPad ohne Tastatur
zeigt die App keine Tastenkürzel an.

**Jog / Manuell und Einrichten** (früher „Fahren“)

- _Joggen:_ XY-Kreuz mit _Stopp_ in der Mitte, Z daneben (A bei Drehachse), Achsen in ihren Farben;
  Schrittweiten 0,01 · 0,1 · 1 · 10 mm und _Dauer_ (Halten, bis zur Verfahrweg-Grenze). Darunter
  drei Schnellaktionen, jede ein Halten: _Gehe zu Null_ (X/Y zum Werkstück-Nullpunkt, Z hebt nur
  an), _Parkposition_ (eine gemerkte Stelle, erst auf Sicherheitshöhe) und _Referenzfahrt_. Mit
  der Maus: _Mausrad-Feinjog_ der zuletzt bewegten Achse – nur solange die Maustaste auf dem Feld
  gehalten ist. Tastatur (Pfeile, Bild↑/↓, 1–5), Gamepad. Unter _Mehr Optionen_: 100-mm-Schritt,
  Handrad und Joystick, einzelne Achsen referenzieren, Entsperren, Parkposition merken, Makros.
  Die Position in der Statusleiste zeigt per Tipp Werkstück- oder Maschinenkoordinaten.
  Software-Endschalter aus dem Maschinenprofil: nach der Referenzfahrt stoppt jeder Jog an der
  Grenze.
- _Nullpunkte:_ X/Y/Z setzen, G54–G59 wählen, Nullpunkt-Speicher je Aufspannung mit Name und Foto.
- _Antasten:_ Z mit Tastplatte, Außenecke (X/Y/Z), Kante, Bohrungsmitte (mit Durchmesser),
  Werkzeuglängensensor mit automatischer Längenkorrektur (`G43.1`).
- _Kamera:_ oben das Tägliche – Fadenkreuz mit 0,01-mm-Schritten auf Kante oder Ecke bringen und
  dort den Nullpunkt setzen, oder die Kamera grob über eine Bohrung fahren: die App zentriert sie
  selbst und setzt den Nullpunkt X/Y (ohne Antasten, auch bei Holz). Darunter eingeklappt, was
  seltener gebraucht wird: _Zwei Bohrungen_ (Nullpunkt und Drehung, der Job wird passend gedreht),
  _Fläche scannen_ (Fotokarte) und _Mitschnitt_. Bildquelle, Kamerahöhe und Kalibrierung stehen
  einmalig unter _Reiter Einstellungen → Maschine → Kamera einrichten_; eine Zeile mit _ändern_ führt
  dorthin. Ohne eingerichtete Kamera gibt es genau einen Knopf: _Kamera einrichten_.
- _Werkzeuge auf der Bühne_ (Tisch und Kamera gleich): _Hinfahren_ – Stelle antippen, _Kamera
  hierhin_ oder _Fräser hierhin_ halten (vorher auf sichere Höhe, begrenzt auf den Verfahrweg);
  _Nullpunkt_ in zwei Schritten – **1 · Ecke:** Werkstückecke antippen, unter der Lupe fein
  nachsetzen (im Bild ziehen oder Pfeile, 0,1 / 1 mm), die App zeigt, um wie viel der Nullpunkt
  wandert, _Nullpunkt X/Y setzen_ halten; **2 · Kante:** zwei Punkte entlang einer geraden
  Kante, _Job danach ausrichten_. Im Kamerabild rastet der Tipp auf Ecke bzw. Kante des Werkstücks
  ein, wenn es sich klar vom Tisch abhebt. _Messen_ – zwei Punkte: Abstand, ΔX, ΔY, Winkel und
  Maßlinie im Bild; ein dritter Tipp misst vom letzten Punkt weiter, Punkte lassen sich nachziehen;
  im Kamerabild rastet ein Tipp auf ein Loch in dessen Mitte ein und nennt den Durchmesser
  (Lochabstand = zwei Tipps). Genauigkeit: am Fadenkreuz gut, am Bildrand und auf der Fotokarte etwa
  0,2–0,5 mm. _Spannmittel_ – antippen, wo eine Zwinge (60 × 40 mm, 30 mm hoch) oder Schraube
  (Ø 12 mm, 5 mm hoch) sitzt; die Markierung ziehen, an den Ecken in der Größe ändern, Höhe
  einstellen, löschen. Spannmittel liegen fest auf dem Tisch (Maschinenkoordinaten) und bleiben
  dort, wenn der Nullpunkt wandert.
- _Joystick:_ auf der Bühne zuschaltbar (Werkzeugleiste) und unter _Joggen_ – je weiter gezogen,
  desto schneller; loslassen stoppt sofort.

**Simulator**

- _Einstellungen → Verbindung → Simulator starten:_ eine LowRider mit Jackpot/FluidNC und Kamera, im
  Browser simuliert – zum Ausprobieren ohne Hardware (Referenzfahrt, Joggen, Jobs, Antasten,
  Kalibrieren, Bohrungen). Die Mechanik hat absichtlich kleine Fehler, die Kalibrierung findet sie.
  Jobs starten wie an der echten Steuerung von der (simulierten) SD-Karte; ein _Zeitraffer_ (10×,
  50×) auf der Simulator-Karte kürzt das Zuschauen ab. Der Fräser hinterlässt Spuren in seiner
  Breite und Tiefe, und bei einem beidseitigen Job wendet sich das 12 mm dicke Brett im Schritt
  _Teil wenden_ von selbst – von Hand etwas verschoben und verdreht, auf Passstiften genau.
  Unter _Auf dem Tisch_ lässt sich der Tisch umräumen: statt Brett und Kalibriertafel liegen dann
  acht kleine **Rohlinge für eine Serie** dort (Anhänger in schiefen Winkeln, ein runder und ein
  quadratischer Untersetzer, ein langes Schild, zwei Anhänger aufeinander) – oder eine
  **Vorrichtung mit Markern**: ein Rahmen mit einem Untersetzer und zwei gedruckten Markern, der
  bei jedem Auflegen (und mit _Vorrichtung woanders hinlegen_) anders liegt, verschoben und
  verdreht bis zu einer Vierteldrehung – oder ein **langes Brett**: 2,6 m Kiefer auf einer
  Maschine, die in X 1,22 m fährt, mit dem Beispieljob „Regalseite“ (2,48 m). Im Ablauf _In
  Abschnitten_ klebt der Simulator die Marker selbst auf und schiebt das Brett weiter, jedes Mal
  etwas ungenau und leicht verdreht.
  `pnpm bundle` erzeugt zusätzlich `release/lowrider-simulator.html`, die direkt im Simulator startet
  (auch über `…#simulator`).
- _Demo: eingerichtete Maschine_ (gleicher Ort, `…#demo` oder `release/lowrider-demo.html` per
  Doppelklick): der Simulator wie fertig eingerichtet – referenziert, Nullpunkt auf Bohrung 1, Kamera
  kalibriert, Fläche als Fotokarte gescannt, Beispieljob ausgerichtet auf dem Brett; sie beginnt im
  Startseite; ein Tipp auf den Reiter Job zeigt den Tisch auf der Bühne. Zum Vorführen;
  die Demo speichert nichts und lässt echte Einstellungen und den Companion unberührt.

**Als App auf dem iPad**

- Vom Pi ausgeliefert und in Safari über _Teilen → Zum Home-Bildschirm_ abgelegt, startet die
  Steuerung im Vollbild mit eigenem Symbol. Fingergesten auf der Bühne (schieben, mit zwei Fingern
  zoomen, Doppeltipp passt ein), seitliches Wischen zwischen den Ansichten eines Schritts, _Großbild_
  für die Bühne über die ganze Breite, hochkant mit Tab-Leiste unten. Keine Geste bewegt die
  Maschine. Anleitung: [`docs/ipad.md`](docs/ipad.md); eine native Hülle ist in
  [`apps/ios`](apps/ios/README.md) beschrieben, nicht gebaut.

**Reiter Service → Kalibrieren**

- Maschine mit Kamera und Punktetafel vermessen: Maßstab X/Y, Rechtwinkligkeit, Umkehrspiel,
  Z-Schiefe; Korrektur von `steps_per_mm` und Portal-Ausrichtung (`pulloff_mm` je Y-Motor) direkt
  in `config.yaml`. Anleitung: [`docs/kalibrierung.md`](docs/kalibrierung.md).

**Job** – oben die Programmkarte, darunter ein Ablauf in vier Schritten, unten immer die Startleiste
(„Startklar“ oder was noch offen ist)

- _Programmkarte:_ G-Code öffnen (Fusion 360, Vectric, Estlcam …) oder **Zeichnen / DXF**; zeigt
  Name, Laufzeit, Werkzeug und Nullpunkt.
- _Vorbereiten:_ Material und Rohteil, Spannmittel (_Auf dem Tisch antippen_ oder Maße von Hand –
  dieselbe Liste, die Zahlen zählen ab dem Nullpunkt), Werkzeug je T mit Schnittwert-Vorschlag,
  Nullpunkt.
- _Zeichnen / DXF (einfaches CAM wie Estlcam):_ ein eigener Arbeitsbereich anstelle der Schritte,
  mit _Zurück zum Job_; die Zeichnung liegt dabei auf dem Tisch und lässt sich dort wie in einem
  Zeichenprogramm anfassen. Drei kurze Schritte von oben nach unten:
  1. _Zeichnen_ – **ein Tipp** auf _Rechteck_, _Kreis_, _Langloch_, _Lochraster_ oder _Text_ legt die
     Form sofort auf das Tisch-Bild: in üblicher Größe, ausgewählt, dort wo man hinsieht (das erste
     Teil mit der Ecke auf dem Nullpunkt, ein Loch mitten im gewählten Teil). Kein Formular vorher.
     _Datei_ lädt DXF aus Fusion, LibreCAD … (Linien, Bögen, Kreise, Polylinien, Splines, Ellipsen)
     oder SVG aus Inkscape, Illustrator … (Pfade mit allen Befehlen, Rechteck, Kreis, Ellipse, Linie,
     Polygon, Gruppen-Transformationen, Größe in mm aus `width`/`height`/`viewBox`); was nicht
     übernommen wird (Text als Text, Bilder, Klone), steht danach da.
     - **Auf dem Tisch:** Das gewählte Teil hat Griffe – Ecken und Seiten ändern die Größe (Rechteck
       Breite/Höhe, Kreis den Durchmesser, Text die Schrifthöhe, Lochraster den Lochabstand, eine
       Datei gleichmäßig), der Punkt darüber dreht (rastet auf 15°), die Linie verschiebt. Solange
       man zieht, steht das Maß am Teil; die Fräsbahn kommt beim Loslassen. Tipp auf eine Linie
       wählt aus, Tipp daneben lässt los.
     - **In Zahlen:** Unter den Formen stehen die Werte des gewählten Teils – seine eigenen Maße
       (Breite, Höhe, Eckenradius, Durchmesser, Text und Schrifthöhe …), Lage (Ecke links unten, bei
       Kreis und Langloch die Mitte) und Winkel. Jede Zahl ändert das Bild sofort; gezeichnete
       Formen und Texte bleiben änderbar. Daneben _Löschen_, _Duplizieren_, um 90° drehen, spiegeln,
       _Mehrfach anordnen_ (Reihen × Spalten).
     - **Rückgängig / Wiederholen** oben neben _Zurück zum Job_ (100 Schritte) – Löschen fragt
       deshalb nicht nach.
     - **Tastatur (Laptop; alle Tasten zeigt `?`):** Entf/Rücktaste löscht, Esc hebt die Auswahl auf, Pfeiltasten schieben
       um 1 mm (Umschalt 10 mm, Alt 0,1 mm), Strg/Cmd+Z und +Umschalt+Z bzw. Strg+Y, Strg/Cmd+D
       dupliziert, +C/+V kopiert in der Zeichnung, +A wählt alles. Nie, solange in einem Feld
       getippt wird – und nie an die Maschine.
     - Text: Einlinien-Schrift mit ÄÖÜß, Ziffern und Satzzeichen, mehrere Zeilen; Ausrichtung,
       Buchstaben- und Zeilenabstand unter _Schrift_.
     - Liegt auf dem Tisch gerade ein anderes Programm (etwa das ausgerichtete der Demo), sagt das
       ein Hinweis; die Zeichnung bleibt trotzdem im CAM zu sehen und zu bearbeiten, aber das fremde
       Programm ersetzt nie eine Änderung, sondern erst ein Tipp auf _Zeichnung auf den Tisch legen_.
       Läuft gerade ein Job (oder wartet er zwischen zwei Teilen), ändert die Zeichnung sein Programm
       nie; ein Hinweis nennt dann den Stand, und nach dem Job bleibt das fertige Programm samt
       Zusammenfassung geladen, bis dieser Tipp es ersetzt.
  2. _Wie wird gefräst?_ – je Teil _Außen_, _Innen_, _Linie gravieren_, _Tasche_ oder _Bohren_
     (passend: Peck, größer: Helix), eine eigene Tiefe, Haltestege und – wo es Innenecken gibt –
     _Ecken frei_ (Dogbone diagonal oder T-Bone längs, damit ein eckiges Teil hineinpasst). Darunter
     Werkzeug, Tiefe und Vorschub; unter _Erweitert_ Gravurtiefe, Schlichtzugabe (schruppen, dann ein
     Schlichtgang in voller Tiefe), Zustellung, Rampe, Gleich-/Gegenlauf, Stege.
  3. _Ansehen und übergeben_ – die Bahnen stehen schon auf dem Tisch; _G-Code erzeugen_ führt zurück
     in den Job. Reihenfolge: Bohrungen, Taschen und Gravuren, Ausschnitte, die Außenkontur jedes
     Teils zuletzt – was in einer Kontur liegt, vor ihr; dazwischen kurze Wege. Der G-Code geht
     durch dieselbe Prüfung, Simulation und Fertigung wie jeder andere Job. Ein Programm, ein
     Werkzeug: Gravur mit V-Fräser und Ausschnitt mit Schaftfräser sind zwei Programme.

  **Von beiden Seiten fräsen** ist ein Schalter in Schritt 2. Mit ihm bekommt jede Bearbeitung
  _Vorderseite_ oder _Rückseite_; gezeichnet wird alles so, wie es von vorn aussieht (die Rückseite
  liegt gestrichelt auf dem Tisch-Bild), gespiegelt wird beim Fräsen von selbst – Gleich-/Gegenlauf
  und Haltestege bleiben, wie gewählt, Text für die Rückseite wird an Ort und Stelle gewendet.
  Dazu: wie das Teil gewendet wird (_wie eine Buchseite_ oder _über die Vorderkante_, mit Bild),
  die Materialdicke (leer = Höhe des Rohteils) und zwei **Passlöcher** – Bohrungen neben dem Teil,
  nach denen die Rückseite ausgerichtet wird. Die App schlägt sie vor (weit auseinander, neben dem
  Teil, wo Rohteil und Spannmittel Platz lassen); mit dem Finger verschoben, rasten sie waagrecht
  oder senkrecht zueinander ein. Hinweise in Klartext: Vorder- und Rückseite schneiden zusammen
  durch, treffen sich absichtlich (dieselbe Form von beiden Seiten), lassen unter 1 mm stehen; der
  Umriss löst das Teil schon auf der Vorderseite; ein Passloch liegt auf einer Bahn. Es entstehen
  zwei Programme (`…_vorderseite.nc` mit den Passlöchern, `…_rueckseite.nc`).

  **Serie: auf Rohlinge verteilen** (unter Schritt 3, _Viele gleiche Teile?_) bringt die Zeichnung
  als Motiv auf viele Rohlinge, die verstreut auf dem Tisch liegen – Untersetzer, Schlüsselanhänger,
  Brettchen –, ohne jeden einzeln auszurichten. Ein kurzer Ablauf anstelle der Zeichnen-Karten:
  1. _Rohlinge finden_ – auf dem Tisch-Bild, wie es ist, oder nach einem neuen Scan des Bereichs
     (halten). Gefunden wird jede helle Fläche auf dunkler Unterlage (oder umgekehrt) mit klarem
     Rand: Mitte, Größe und Drehung aus der Form (lange Seite eines Rechtecks, eine Seite eines
     Quadrats; rund = keine Drehung). Streng wie die anderen Sucher: Was am Bildrand liegt, sich
     berührt oder sich zu wenig abhebt, wird nicht übernommen – gelb gestrichelt im Bild, mit dem
     Grund und was zu tun ist (_Rohlinge berühren sich – etwas auseinanderlegen_).
  2. _Motiv prüfen_ – das Motiv steht als Fräsbahn auf jedem Rohling, auf dessen Mitte gelegt und
     mit ihm gedreht; die Nummern im Bild sind die Reihenfolge beim Fräsen (immer der nächste). Ein
     Tipp auf einen Rohling lässt ihn aus oder nimmt ihn wieder dazu, _Drehen_ in der Liste stellt
     das Motiv auf den Kopf (bei quadratischen und runden: 90°). Statt desselben Motivs bekommt
     jeder Rohling auf Wunsch **einen Namen aus einer Liste** (eine Zeile pro Rohling) oder eine
     **laufende Nummer** – sie ersetzen den Text der Zeichnung, gleiche Schrifthöhe, mittig an
     seiner Stelle. Ragt ein Motiv über den Rand (oder kommt ihm näher als 1 mm), steht der
     Rohling mit Nummer in einer Warnung. Genauigkeit: vom Tisch-Bild etwa 0,2–0,5 mm; _Mit der
     Kamera nachmessen_ (halten) fährt die Kamera über jeden Rohling und misst ihn in der Bildmitte
     des Livebilds, etwa 0,1 mm. Rohlinge, die größer sind als ein Kamerabild, behalten die Lage
     vom Tisch-Bild.
  3. _Serie erzeugen_ – ein Programm (`…_serie_5x.nc`, die Zahl der Rohlinge steht im Namen und
     damit in der Historie) für den Ablauf (Job → Fräsen), mit Prüfliste und Spannmittel-Prüfung wie jeder Job.
     Ein Nullpunkt je Rohling ist nicht nötig: Die Rohlinge liegen auf dem Tisch
     (Maschinenkoordinaten), das Programm zählt vom X/Y-Nullpunkt, wie er gerade ist – wird er
     danach neu gesetzt, rechnet die App das Programm neu, und die Prüfliste sperrt den Start,
     falls das nicht ging. Nur **Z0 muss auf der Oberfläche eines Rohlings** stehen (am besten
     schon vor dem Scannen: von dort zählt die Kamerahöhe); deshalb alle Rohlinge gleich dick.

- _Beidseitig: der Ablauf „Wenden“_ – oben in jedem Schritt des Ablaufs steht bei einem solchen Job,
  wo er steht und was als Nächstes zu tun ist: Vorderseite fräsen → **Teil wenden** (Bild der
  Wenderichtung, welche Kante wohin kommt, Spannmittel umsetzen) → Passlöcher finden → Rückseite
  fräsen. Wiedergefunden wird das Teil **mit der Kamera** (eingerichtet: Die Löcher gehen durchs
  Material, die Kamera fährt per Halten zu jedem Loch und zentriert sich; Nullpunkt und Drehung der
  Rückseite kommen aus beiden – ein paar Millimeter oder Grad daneben gelegt macht nichts) oder
  **mit Passstiften** (die Löcher gehen 6 mm in die Opferplatte, das Teil steckt auf zwei Stiften im
  Bohrdurchmesser; der Nullpunkt der Vorderseite gilt weiter). Die Prüfliste trägt den Ablauf: Die
  Rückseite startet erst, wenn die Vorderseite gefräst, das Teil gewendet und wiedergefunden ist.
  Eine Vorderseite, die an einer Kante ausgerichtet gefräst wurde, nimmt die Rückseite mit.
- _Teile länger als der Tisch: der Ablauf „In Abschnitten“_ – eine Regalseite von 2 m, ein langes
  Schild, eine Banklatte auf einer Maschine, die kürzer fährt. Verlässt ein Job den Verfahrweg nur
  in X oder nur in Y, sperrt die Prüfliste nicht bloß: Bei „Liegt im Verfahrweg“ steht dann _Teil
  ist länger als der Tisch_ mit der Taste **In Abschnitten fräsen**. Was dann passiert:
  - **Teilen:** so wenige Abschnitte, wie der Verfahrweg zulässt, alle um denselben runden Betrag
    weitergeschoben (immer in Richtung −X bzw. −Y; der erste Abschnitt liegt, wie Teil und
    Nullpunkt gerade liegen). Jeder Abschnitt ist ein eigenes Programm
    (`name_abschnitt_2von3.nc`) – SD-Start, Prüfliste und Spannmittel-Prüfung bleiben, wie sie
    sind. **Was zusammengehört, bleibt zusammen:** Schnitte, die sich berühren (eine Tasche samt
    Schlichtgang, eine Kontur mit allen Zustellungen), gelten als ein Stück; passt es ganz in die
    Reichweite eines Abschnitts, wird es dort ganz gefräst – eine Bohrung, ein Buchstabe, eine
    kleine Tasche wird nie geteilt. Nur was länger ist als ein Abschnitt, endet an der **Naht**:
    Fräser hoch, und der nächste Abschnitt taucht 1 mm vor der Naht in die schon gefräste Nut
    wieder ein, Zustellung für Zustellung, mit dem langsamsten Eintauch-Vorschub des Programms. Das
    eine Millimeter Überlappung lässt bei ein paar Zehnteln Lagefehler keinen Steg stehen. Die Naht
    liegt dort, wo sie am wenigsten teilt, nie in einem Haltesteg; das Tisch-Bild zeigt sie als
    Strichpunktlinie mit der Zahl der geteilten Schnitte. Kreisbögen werden als Bögen geteilt.
  - **Wiederfinden mit Passmarken** (braucht die eingerichtete Kamera): Nach jedem Abschnitt klebst
    du zwei gedruckte Marker (die von den Vorrichtungen) aufs Teil – in den gelben Streifen auf dem Tisch-Bild, den die Kamera vor und
    nach dem Schieben erreicht, möglichst weit auseinander. _Passmarken einmessen_ (halten): Die
    Kamera fährt den Streifen ab, bis sie die Marker sieht, und misst sie in der Bildmitte. Dann
    sagt die Karte, **wohin und wie weit** zu schieben ist („etwa 690 mm nach links – auf ein paar
    Zentimeter genau reicht“), mit Bild. Nach dem Festspannen _Passmarken finden_ (halten): Die
    Kamera fährt dorthin, wo die Marker liegen müssten (und sucht sonst ringsum), misst sie, setzt
    den X/Y-Nullpunkt dorthin, wo der Nullpunkt des Teils jetzt liegt, und lädt den nächsten
    Abschnitt so gedreht, wie das Teil liegt. Marker tragen Nummer und Richtung – nach dem
    Schieben kann keiner mit einem anderen oder mit einer Bohrung des Jobs verwechselt werden;
    deshalb Marker und keine Passlöcher. Liegen die zwei Marker mehr als 0,5 mm anders auseinander
    als vorher (verrutscht, anderes Teil), wird nicht weitergefräst.
  - **Ehrlich zur Genauigkeit:** An der Naht, nahe bei den Markern, treffen sich die Schnitte auf
    etwa 0,2 mm (im Simulator mit seiner idealen Kamera: 0,01 mm an der Naht, 0,05 mm am fernen
    Ende – an der echten Maschine noch nicht gemessen). Die Richtung ist die schwache Stelle: Sie ruht auf zwei Punkten im Abstand der
    Marker, der Fehler wächst mit der Entfernung (0,1 mm + Entfernung × 0,2 / Markerabstand). Die
    App nennt die erwartete Abweichung am fernen Ende des nächsten Abschnitts, bevor geschoben
    wird, und rät ab 0,5 mm zu weiter auseinander geklebten Markern oder zu einem **geraden
    Anschlag** längs der Schieberichtung. Mit Anschlag (ankreuzen) übernimmt die App nur die
    Verschiebung, die Richtung hält der Anschlag; dann genügt ein Marker, und zwei prüfen, ob das
    Teil wirklich anliegt.
  - **Der Ablauf** steht wie beim Wenden oben in jedem Schritt des Ablaufs: Abschnitt 1 → Schieben
    → Abschnitt 2 → … Die Prüfliste trägt ihn: Ein Abschnitt startet erst, wenn die davor gefräst
    sind und das Teil wiedergefunden ist; ist es weitergeschoben, lässt sich der alte Abschnitt
    nicht mehr starten; wird danach der Nullpunkt verändert, ist neu zu suchen. Das Tisch-Bild
    zeigt das ganze Teil um den aktuellen Abschnitt: grün, was gefräst ist, blass, was noch kommt.
    Welche Abschnitte gefräst sind, übersteht ein Neuladen. Solange Abschnitt 1 nicht gefräst ist,
    teilt die App neu, wenn der Nullpunkt versetzt wird.
  - **Geht nicht:** Programme mit Kettenmaßen in Fahrbewegungen (G91), G93, G92/G10, mehreren
    Nullpunkten, Antasten, Drehachse oder Bögen außerhalb der XY-Ebene – die Karte sagt, woran es
    liegt (`G28 G91 Z0` am Ende, wie Fusion es schreibt, ist kein Hindernis). Teilen in beide
    Richtungen zugleich gibt es nicht. Bei einem Job mit mehreren Werkzeugen enthält jeder
    Abschnitt alle Werkzeuge – es wird also je Abschnitt gewechselt.
- _Vorrichtungen mit Markern_ – eine Vorrichtung, die immer wieder benutzt wird (Rahmen für
  Untersetzer, Anschlag für Brettchen, Halter für ein 3D-Druck-Teil), bekommt einen **Marker**: ein
  gedrucktes Kennzeichen, das die Kamera lesen kann. Die Marker sind eigene (kein ArUco): ein
  dunkler Rahmen um 5 × 5 Felder, 48 Nummern, je zwei in mindestens 8 Feldern verschieden, wie
  herum sie auch liegen – ein falsch gelesener Marker wird abgelehnt und nie für einen anderen
  gehalten.
  - **Drucken:** _Job → Extras → Vorrichtungen mit Markern → Marker drucken_ (ohne geladenen Job
    steht die Karte unter der SD-Karte). Die Druckseite ist in echten Millimetern, mit einer Linie
    „muss 50 mm lang sein“ gegen heimliches Skalieren, in 20/30/40/60 mm, mit Nummer und einem
    freien Namen daneben; jeder Marker lässt sich auch als SVG für einen Etikettendrucker speichern.
    Matt drucken, mit dem weißen Rand ausschneiden, flach aufkleben – möglichst auf Höhe der
    Werkstück-Oberfläche, wo weder Fräser noch Spannmittel hinkommen und keine Späne liegen bleiben;
    kein glänzendes Klebeband darüber.
  - **Anlernen** (einmal, drei kurze Schritte): alles einrichten wie immer – Vorrichtung auf den
    Tisch, Job laden, Nullpunkt setzen, Spannmittel markieren –, _Marker einmessen_ halten (die
    Kamera fährt über jeden Marker und misst ihn in der Bildmitte), benennen, speichern. Gemerkt
    werden der Job und wo sein X/Y-Nullpunkt und seine Richtung auf der Vorrichtung liegen, dazu die
    markierten Spannmittel. Gespeichert wird bei den anderen Bibliotheken (Browser, mit Companion
    auch dort – _Synchronisieren_ bringt die Liste aufs zweite Gerät).
  - **Benutzen:** Vorrichtung irgendwo auf den Tisch legen. Sobald die Kamera ihren Marker sieht –
    im Livebild oder nach einem Scan auf dem Tisch-Bild –, steht oben in jedem Schritt des Ablaufs
    _Vorrichtung „Name“ erkannt_ mit einer einzigen Taste: **Einmessen und Job laden** (halten). Die
    Kamera fährt über den oder die Marker, misst nach, setzt den X/Y-Nullpunkt und lädt den Job so
    gedreht, wie die Vorrichtung liegt; die Spannmittel wandern mit. **Z kennt ein Marker nicht** –
    die Karte führt danach zum gewohnten Z-Nullpunkt. Die Prüfliste trägt die Vorrichtung (grün:
    _erkannt – Nullpunkt aus Marker_) und sperrt den Start, wenn sie in dieser Sitzung nicht
    eingemessen wurde, der Nullpunkt oder der Job danach verändert wurde oder die Kamera die
    Vorrichtung inzwischen woanders sieht. Ein unbekannter Marker führt zum Anlernen.
  - **Ehrlich zur Genauigkeit:** Die Lage eines Markers stimmt in der Bildmitte auf etwa 0,1 mm,
    sein Winkel ist die schwache Stelle – ein einzelner 40-mm-Marker gibt ihn auf etwa 0,3°, das
    sind 300 mm entfernt schon 1,5 mm. Deshalb darf eine Vorrichtung **zwei Marker weit
    auseinander** tragen (Winkel aus der Linie durch beide, wie beim Ausrichten an zwei Bohrungen;
    ihr Abstand wird gegen das Anlernen geprüft). Die App nennt vor dem Speichern und nach jedem
    Einmessen die erwartete Abweichung am fernsten Punkt des Jobs und rät bei mehr als 0,5 mm zum
    zweiten Marker. Was wie ein Marker aussieht, aber nicht genommen wird, steht mit Grund im
    Livebild: abgeschnitten, unscharf, zu blass, schräg, falsche Größe, Muster nicht lesbar.
- _Prüfen:_ eine Liste grün/gelb/rot mit der Lösung daneben (Verbindung, Referenzfahrt, Fehler im
  G-Code, Verfahrweg, Nullpunkt, Kollision Halter/Spannmittel/Portal, jedes Spannmittel im Weg mit
  Namen – „Zwinge 2 liegt in der Fräsbahn – versetzen oder Job verschieben“, Eilgang hinein oder
  weniger als 2 mm Luft darüber, der Fräserradius zählt mit; die betroffenen Bahnen sind auf dem
  Tisch gelb –, FluidNC-Fallen wie `G43 H`,
  `M6`, `M1`), Laufzeit aus den echten Beschleunigungen („Job-Zwilling“), Simulation mit Scrubber;
  hier lässt sich der Tisch auch von der _Seite_ ansehen (Tiefe der Bahnen) und die Eilgänge
  ausblenden.
- _Fertigen:_ **von der SD-Karte wie mit der FluidNC-WebUI, aber mit einem Halten**: hochladen,
  prüfen, starten – WLAN und iPad dürfen danach ausfallen. Mehrwerkzeug-Jobs werden je Werkzeug
  geteilt; nach jedem Teil Spindel aus, Z hoch, geführter Werkzeugwechsel (Sensor oder Platte), dann
  der nächste Teil. Rahmen abfahren, Wiederaufnahme ab Zeile N, Overrides, Abweichungs-Trend. Streamen
  vom iPad (Einzelschritt, Halt bei jedem `M6`) gibt es weiterhin als zweite Startart.
- _Extras:_ Teile für die SD-Karte herunterladen, Ausrichten (Drehen/Verschieben im G-Code, weil
  FluidNC kein `G68` kennt), Autolevel per Tastraster, Vorrichtungen mit Markern (Liste, Anlernen,
  Marker drucken).

**Menü: Werkzeugliste, Service & Diagnose, Einstellungen** – Tägliches vorn, Einmaliges
eingeklappt, Experten-Werkzeuge nur auf Wunsch

- _Service & Diagnose:_ Verbindungsdaten der Steuerung (Adresse, Firmware, Zustand, referenziert),
  Eingänge live, **Achstest** (jede Achse ein bekanntes Stück per Halten; danach steht da, was die
  Steuerung gemeldet hat), Protokoll; **Meldungshistorie** mit Filter nach Stufe; Laufzeit der
  aufgezeichneten Jobs (die Steuerung zählt keine Spindelstunden – es steht nichts Erfundenes da).

- _Werkzeuge:_ Werkzeug- und Materialbibliothek, Schnittwerte, die aus Override, Last und Rattern
  lernen.
- _Historie:_ Job-Historie mit Abweichungs-Historie über alle Jobs (Riemenverschleiß!) und
  Treffgenauigkeit der Zeitschätzung.
- _Verbindung:_ über den Pi (Companion) mit einem Knopf, sonst direkt; Simulator, Protokoll. Die
  Karte sagt, was sie tut und welches Gerät fehlt (Pi nicht erreichbar · Pi erreicht den Jackpot
  nicht · Jackpot nicht erreichbar), mit nächstem Schritt. Außerhalb eines Jobs versucht die App es
  von selbst wieder (2 s bis 30 s, abschaltbar), während und nach einem Verbindungsverlust im Job nie.
- _Einrichtung:_ Maschinenprofil (Verfahrweg = Software-Endschalter, Tippgeschwindigkeit der App mit
  der Grenze der Steuerung daneben, **Grenzen der Steuerung** – Höchstgeschwindigkeit und
  Beschleunigung je Achse lesen und schreiben, über den Pi mit Sicherung in die `config.yaml`, sonst
  bis zum Neustart –, `config.yaml` importieren, Profile als JSON teilen; ein LowRider-v4-Profil
  liegt bei, [profiles/](profiles)),
  Kalibrieren, Kamera einrichten (Bildquelle, Stream, Maßstab, Versatz, Kamerahöhe, Zeitraffer),
  Werkstatt-Einstellungen,
  Benachrichtigungen (Browser, ntfy über den Companion), Makros, Sprache Deutsch/Englisch.
- _Experte_ (einschalten unter _Einrichtung_): `config.yaml` per Formular oder als ganze Datei mit
  Prüfung, Diff, Sicherung und Neustart; `$`-Einstellungen mit Erklärung; Firmware flashen über USB
  (Web Serial, Chrome/Edge) aus dem Release-ZIP; Konsole.

## Aufbau

| Teil                                                 | Inhalt                                                                                                                                                                                                                                                                                  | Tests                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| [`packages/gcode-core`](packages/gcode-core)         | Parser, Interpreter, Geometrie, Laufzeit, Transformation, Reparatur/Teilen, Wiederaufnahme, Rahmen, Höhenfeld-Abtrag, Kollision, Autolevel, lange Teile in Abschnitte teilen (Naht, ganze Stücke)                                                                                       | 100 % Zeilen/Zweige, Golden    |
| [`packages/fluidnc-client`](packages/fluidnc-client) | WebSocket, Status/Meldungen, Echtzeitbefehle, Streamer mit Haltepunkten, HTTP-Upload, Jog-Begrenzung, `config.yaml`, `$G`/`$S`, Flash-Layout                                                                                                                                            | 100 %, Session-Replay          |
| [`packages/workshop`](packages/workshop)             | Werkzeuge, Materialien, Schnittwerte und Lernen, Historie und Verschleiß-Trend, Tastzyklen, adaptiver Vorschub, Rattererkennung (FFT), Nullpunkt-Speicher, Community-Profile, Marker für Vorrichtungen (Code, Druck-SVG, Nullpunkt und Drehung aus Markern), Passmarken für lange Teile | 100 %                          |
| [`packages/cam`](packages/cam)                       | Einfaches 2,5D-CAM: DXF und SVG lesen, Formen, Einlinien-Schrift, Anordnen, Versatz (Clipper), Kontur/Tasche/Bohren/Helix/Gravur, Haltestege, Eckenfreischnitt, Schlichtgang, Reihenfolge, G-Code, beidseitig (Wenden, Passlöcher, Vorder-/Rückseite gegeneinander prüfen)              | 100 %, Golden                  |
| [`apps/control`](apps/control)                       | React-UI, eine Datei (`index.html`)                                                                                                                                                                                                                                                     | Vitest + Playwright (3 Geräte) |
| [`apps/companion`](apps/companion)                   | Optionaler Server für Raspberry Pi/Mini-PC: liefert die App aus, SQLite für Bibliotheken und Historie, Job-Puffer, FluidNC-Weiterleitung, Sensoren, Benachrichtigungen ([Anleitung](docs/companion.md))                                                                                 | Vitest                         |

Die Oberfläche folgt [coss ui](https://coss.com/ui) (Komponenten zum Kopieren auf Base UI, gestaltet
mit Tailwind CSS): Die Bausteine liegen als eigener Quelltext in `apps/control/src/ui/`, das Thema in
`apps/control/src/styles/theme.css`, alles auf Fingergröße (≥ 48 px) gebracht. Die App bleibt **eine
HTML-Datei ohne Netzbedarf** – auch die Schrift (Inter) steckt darin, nichts wird zur Laufzeit
nachgeladen. Herkunft und Lizenzen: [THIRD-PARTY.md](THIRD-PARTY.md).

## Loslegen

Voraussetzung: Node ≥ 22 und pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev            # UI unter http://localhost:5173 (auch im WLAN erreichbar)
pnpm check          # Typecheck, Tests mit Coverage, Build
pnpm e2e            # Playwright-Tests der UI
pnpm bundle         # release/lowrider-control.html und release/companion.mjs
```

`lowrider-control.html` ist **eine einzige Datei**: per Doppelklick (`file://`), von jedem Webserver
oder vom Companion. Nicht über `https` ausliefern – Browser blockieren dann `ws://` zum Jackpot.

Verbinden: _Reiter Einstellungen → Verbindung_ → IP des Jackpot (z. B. `192.168.178.40`, Port 81 wird ergänzt)
→ _Verbinden_.

## Struktur

```
packages/gcode-core      geteilte G-Code-Bibliothek (eine Wahrheit für alles, was G-Code liest)
packages/fluidnc-client  alles, was mit FluidNC spricht
packages/workshop        Werkstatt-Logik ohne UI
packages/cam             einfaches CAM (DXF/SVG, Formen, Text, Werkzeugbahnen)
apps/control             Browser-Oberfläche
apps/companion           Companion-Server
apps/ios                 native iPad-Hülle – nur beschrieben
profiles/                Community-Profile (LowRider v4)
docs/                    Projektbeschreibung, erste Schritte, offene Fragen, Companion, iPad, Maschinenprofil
machine/                 Sicherungen von config.yaml und $-Settings des Jackpot
```

Code und Kommentare auf Englisch, Oberfläche auf Deutsch (`apps/control/src/i18n/de.ts`) mit
englischer Übersetzung (`en.ts`).
