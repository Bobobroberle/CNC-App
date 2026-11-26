# Merkliste (Ideen, Zurückgestelltes, Offenes)

Die lebende Fassung zum Abhaken ist die Artifact-Seite **LowRider Ideenliste** (Adresse und Pflege: CLAUDE.md, Abschnitt „Merkliste“). Diese Datei ist der Stand im Projekt, erzeugt aus `docs/merkliste.katalog.mjs` mit `node scripts/merkliste.mjs md`. ★ = will ich haben, ✓ = erledigt, „in Arbeit“ = wird gerade gebaut. Ältere Ausführungen zu den Ideen: [ideen.md](ideen.md).

22 von 154 erledigt.

## Scan & Kamera

_Position und Schärfe der Aufnahmen, Kamera und Licht._

### Position der Aufnahmen (Timing)

- [x] **Eine Uhr für Bild und Position** (kleiner Schritt) – Der Pi stempelt Kamerabild und Statusbericht mit derselben Uhr. Im Simulator sank die Streuung der Zeit von 11–33 ms auf 1–2 ms, die fertige Karte wurde dort nicht genauer; bei sehr schlechtem Link gab der Browser-Takt auf, der Pi-Takt nicht. An der echten Maschine ist die Genauigkeit ungemessen.
- [ ] **Hardware-Trigger statt Uhr** (größeres Projekt) – Eine Global-Shutter-Kamera wird von einem FluidNC-Ausgang ausgelöst (M62/M63); die Position des Bildes ist die befohlene Position, es gibt keine Uhr. Ob M62/M63 auf der Jackpot bewegungssynchron schaltet, ist ungeprüft.
- [ ] **Absolute Referenz im Bild** (größeres Projekt) – Ein Streifen mit gedruckten Marken am Tischrand gibt die Position aus dem Bild selbst; wirkt gegen jede Verzögerung, aber nur nahe am Streifen.
- [ ] **Adaptives Warten im Stopp-Modus** (kleiner Schritt) – Das Bild wird gemacht, sobald Position und Bild ruhig sind, nicht nach fester Pause. Schneller, ohne Uhr.
- [ ] **Verzögerung an der Maschine messen** (Aufgabe) – Einen Streifen-Scan mit Aufzeichnung fahren und mit dem Auswerter die Verzögerung der Kamera bestimmen (Anleitung in docs/scan.md).
- [ ] **Zeitstempel von ustreamer prüfen** (Aufgabe) – Am Pi mit curl nachsehen, welche Kopfzeilen der Stream pro Bild sendet und was der Stempel bedeutet (Aufnahme, Kodierung oder Senden).
- [ ] **M62/M63 an der Jackpot prüfen** (Aufgabe) – Pulst der Ausgang wirklich in der Bewegung, ohne sie anzuhalten? Mit einer LED oder dem Oszilloskop messen.
- [ ] **Verstreute Tischmarken als Ankerpunkte** (größeres Projekt) – Kleine gedruckte Marken (wie die der Vorrichtungen) fest auf der Opferplatte verteilen, einmal einmessen und speichern. Im Scan kennt jedes Bild mit einer Marke seine Position absolut: die Verzögerung lässt sich mitten im Lauf lernen, Maßstabsfehler werden korrigiert, und auf einem Brett ohne Maserung hat die Bildzuordnung einen Halt. Dünn halten (Papier), weil die App die Höhe der Marke nicht herausrechnet; es gibt nur 48 Nummern, nicht in jedem Bild muss eine liegen.

### Bewegungsunschärfe

- [ ] **Belichtung von Hand kurz stellen** (kleiner Schritt) – Automatik aus, Belichtung ≤ 2 ms, dafür mehr Licht. Unschärfe = Geschwindigkeit × Belichtungszeit: 50 mm/s und 10 ms sind 0,5 mm, bei 1 ms nur 0,05 mm.
- [ ] **Belichtung aus der App einstellen** (kleiner Schritt) – Der Companion setzt Belichtung und Verstärkung über v4l2 (Karte in den Kameraeinstellungen), statt per SSH.
- [x] **Tempo aus der Belichtung ableiten** (kleiner Schritt) – Die größte Scan-Geschwindigkeit folgt aus der erlaubten Unschärfe (v ≤ 0,3 mm / Belichtungszeit): Feld „Belichtung (ms)“ im Scan-Panel, 0 heißt unbekannt; unter 5 mm/s wird in Stopps gescannt.
- [ ] **Schärfstes Bild wählen** (kleiner Schritt) – Bei mehreren Bildern derselben Stelle das mit dem größten Kontrast nehmen (Varianz des Laplace-Filters).
- [ ] **Unschärfe herausrechnen** (Forschung) – Richtungs-Entfaltung bei bekannter Fahrtrichtung und Länge. Hilft begrenzt und verstärkt das Rauschen.
- [ ] **Blitz oder gepulste LED im Takt der Belichtung** (Hardware) – Ein Blitz von 100 µs macht die Unschärfe praktisch null und legt den Zeitpunkt fest. Braucht Trigger oder Strobe-Ausgang der Kamera.

### Kamera & Licht (Hardware)

- [ ] **Global-Shutter-Kamera mit USB (UVC)** (Hardware) – Arducam OV9782 (Farbe, 1 MP, Trigger über F/G-Pads) oder OV2311 (Mono, 2 MP, Trigger und Strobe). Rolling Shutter schert das Bild in der Fahrt; Global Shutter nicht. Details im Chat vom 26.11.
- [ ] **Objektiv mit geringer Verzeichnung** (Hardware) – M12-Objektiv 4–6 mm, Blickfeld auf die Montagehöhe abgestimmt. Die App rechnet keine Verzeichnung heraus.
- [ ] **Licht vom Pi schaltbar** (Hardware) – LED-Ring oder Streifen, gestreut, über einen GPIO-Schalttransistor; später als Blitz nutzbar.
- [ ] **Kamerahalterung als Druckteil** (Hardware) – Fest verschraubt, senkrecht nach unten, ohne Spiel, mit Anschlag. Fokusring fixieren, Späneschutz vor der Linse.
- [ ] **Zweite Kamera für den Fräser** (Hardware) – Waveshare OV4689 USB (MJPEG, 720p@120) plus M12-Objektiv 6–8 mm für Makro, als zweiter Stream im Mitschnitt.

### Scan-Bedienung

- [ ] **Scan-Geschwindigkeit vorab messen** (kleiner Schritt) – Vor dem ersten großen Scan ein kurzer Probelauf, der Verzögerung und Schärfe an dieser Maschine ermittelt und das Tempo vorschlägt.
- [ ] **Scan mit Pause und Fortsetzen** (kleiner Schritt) – Ein abgebrochener Scan macht an der Stelle weiter, statt von vorn.

## CAM / Zeichnen

_Wunschliste für den Zeichenbereich. ★ = will ich haben, ✓ = gebaut._

### Auswählen & Anordnen

- [x] **Mehrfachauswahl** (kleiner Schritt) – Schalter „Mehrfachauswahl“: ein Tipp auf dem Tisch nimmt ein Teil in die Auswahl oder heraus, ein Tipp daneben lässt sie, wie sie ist; ein Häkchen vor jeder Zeile der Liste tut dasselbe; „Alles auswählen“ und „Auswahl umkehren“ stehen bei der Auswahl. Umschalt/Strg+Tipp und Rahmen aufziehen sind nicht gebaut (cam-sel8, cam-sel9).
- [x] **Ausrichten** (kleiner Schritt) – Sechs Knöpfe: links, waagerecht mittig, rechts, oben, senkrecht mittig, unten – an der Auswahl (das äußerste Teil bleibt); eine Gruppe zählt als ein Teil. Am Rohteil oder am Tisch ausrichten ist nicht gebaut (cam-sel11, cam-sel12).
- [x] **Gleichmäßig verteilen** (kleiner Schritt) – Waagerecht und senkrecht, mit gleichen Abständen oder gleichen Mitten; ab drei Teilen, die beiden äußeren bleiben stehen.
- [x] **Gruppieren und auflösen** (kleiner Schritt) – Gruppieren verbindet die gewählten Teile zu einer Gruppe, die sich gemeinsam wählen, schieben, drehen, skalieren und ausrichten lässt; „Gruppierung aufheben“ macht aus jeder Kontur wieder ein eigenes Teil (so lassen sich auch die einzelnen Konturen einer DXF- oder SVG-Datei wählen).
- [ ] **Teile sperren** (kleiner Schritt) – Ein gesperrtes Teil lässt sich nicht versehentlich schieben.
- [ ] **Teile ausblenden** (kleiner Schritt) – Auge je Teil: ausgeblendete Teile werden nicht gefräst und stören nicht beim Anordnen.
- [ ] **Gleiche Art auswählen** (kleiner Schritt) – Alle Bohrungen, alle Taschen oder alle Teile mit demselben Werkzeug mit einem Tipp wählen.
- [ ] **Umschalt/Strg+Tipp** (kleiner Schritt) – Am Rechner mit Umschalt oder Strg auf ein Teil tippen nimmt es in die Auswahl, ohne den Schalter „Mehrfachauswahl“ anzufassen. Braucht die Modifier-Tasten in der Gestenschicht (usePanZoom).
- [ ] **Rahmen aufziehen** (kleiner Schritt) – Mit Finger oder Maus einen Rahmen über mehrere Teile ziehen; alles, was er berührt, wird gewählt.
- [ ] **Tasten für Gruppieren und Ausrichten** (kleiner Schritt) – Strg+G gruppiert, Strg+Umschalt+G löst auf, Tasten zum Ausrichten – jede mit Zeile in der Tastenliste und in der Schnellsuche.
- [ ] **Am Rohteil ausrichten** (kleiner Schritt) – Links, mittig, rechts … am eingegebenen Rohteil statt an der Auswahl, etwa zum Mittigsetzen auf der Platte. Der Speicher kennt das Rohteil schon (enteredStock), es fehlt die Wahl in der Oberfläche.
- [ ] **Am Tisch ausrichten** (kleiner Schritt) – Dasselbe am Arbeitsbereich der Maschine. Der Zeichen-Speicher kennt die Tischgröße noch nicht; sie wird nur im Tischbild aus dem Maschinenprofil abgeleitet.
- [ ] **Fangen an Kanten, Mitten und Rohteil** (kleiner Schritt) – Beim Schieben rastet ein Teil an Kanten und Mitten anderer Teile und am Rohteil ein, mit sichtbarer Hilfslinie.
- [ ] **Abstände zwischen Teilen anzeigen** (kleiner Schritt) – Beim Schieben erscheinen die Maße zu den Nachbarn (wie bei Illustrator).
- [ ] **Raster und Hilfslinien** (kleiner Schritt) – Raster mit einstellbarem Maß, Lineale, Hilfslinien aus dem Lineal ziehen.
- [ ] **Anordnen im Kreis** (kleiner Schritt) – Kreisförmige Anordnung (Polar-Array) mit Anzahl und Winkel.
- [ ] **Automatisch verschachteln (Nesting)** (größeres Projekt) – Teile so auf dem Rohteil verteilen, dass möglichst wenig Material übrig bleibt.
- [ ] **Reihenfolge der Bearbeitung von Hand** (kleiner Schritt) – Teile in der Liste ziehen, um die Fräsreihenfolge festzulegen (statt automatisch innen vor außen).
- [ ] **Beziehungen festhalten** (größeres Projekt) – Teile an Regeln binden, die beim Ändern bestehen bleiben: ein Loch bleibt mittig im Teil, ein Abstand bleibt 10 mm, zwei Teile bleiben bündig, auch wenn eines größer wird (wie Einschränkungen in CAD).
- [ ] **Haltestege-Feld schiebt die Liste beim Abhaken** (kleiner Schritt) – Das Feld der Haltestege klappt unter dem ersten abgehakten Teil auf und schiebt die Zeilen darunter um etwa 380 px. Lösung: das Feld erst auf Wunsch öffnen oder aus der Zeile herausnehmen.

### Zeichnen & Formen

- [ ] **Freie Linie und Vieleck zeichnen** (kleiner Schritt) – Punkte antippen, schließen, fertig. Mit Eingabe von Länge und Winkel.
- [ ] **Bögen und Kurven** (größeres Projekt) – Bogen und Bézier-Kurven zeichnen und ihre Griffe ziehen.
- [ ] **Knoten bearbeiten** (größeres Projekt) – Punkte einer Kontur verschieben, einfügen, löschen; Linie in Kurve wandeln. Auch für geladene Konturen.
- [ ] **Weitere Grundformen** (kleiner Schritt) – Rechteck mit Eckenradius je Ecke, Langloch, Ellipse, Stern, Zahnrad, Spirale.
- [ ] **Eigene Schriften** (größeres Projekt) – TTF/OTF-Schriften in Konturen umwandeln; Zeilenabstand, Buchstabenabstand, Text auf Linie oder Kreis.
- [ ] **Maße als Formel** (größeres Projekt) – Eine Tabelle mit Maßen (Breite = 2 × Höhe), die das Teil neu zeichnet.
- [ ] **Bild nachzeichnen** (größeres Projekt) – PNG/JPG in Konturen umwandeln (Vektorisieren), mit Schwelle und Glättung.
- [ ] **Foto des Tisches als Vorlage** (kleiner Schritt) – Die Fotokarte liegt hinter der Zeichnung und kann zum Abpausen genutzt werden (Kontur der Vorlage nachfahren).
- [ ] **Seitenverhältnis sperren** (kleiner Schritt) – Beim Ziehen am Griff bleibt das Verhältnis; Schloss neben den Maßen.
- [ ] **Anmerkungen und Maße** (kleiner Schritt) – Maßpfeile und Texte, die auf dem Tisch stehen, aber nicht gefräst werden.
- [ ] **Verbindungen erzeugen** (größeres Projekt) – Zinken, Schlitz und Zapfen, Nut und Feder als Vorlage mit Maßen: erzeugt beide Teile passend zur Materialstärke und zum Fräserdurchmesser.

### Konturen bearbeiten

- [ ] **Boolesche Operationen** (größeres Projekt) – Vereinigen, Abziehen, Schneiden, Ausschließen zweier Teile zu einer neuen Kontur.
- [ ] **Versatzkontur** (kleiner Schritt) – Eine Kontur um ein Maß nach innen oder außen kopieren (zum Beispiel für Rand oder Rille).
- [ ] **Ecken verrunden und anfasen** (kleiner Schritt) – Rundung oder Fase an gewählten Ecken oder an allen.
- [ ] **Konturen schließen und verbinden** (kleiner Schritt) – Offene Konturen schließen, Lücken bis zu einem Maß überbrücken, Linien zu einer Kontur verbinden.
- [ ] **Trimmen und Verlängern** (größeres Projekt) – Linien an einer anderen Linie abschneiden oder bis dahin verlängern.
- [ ] **Vereinfachen und aufräumen** (kleiner Schritt) – Doppelte Punkte und Linien entfernen, zu viele Punkte ausdünnen, Richtung umkehren, Selbstüberschneidungen anzeigen.
- [ ] **Neigen (Scheren)** (kleiner Schritt) – Zusätzlich zu Drehen und Spiegeln: ein Teil neigen.

### Haltestege

- [x] **Haltestege je Teil einstellen** (kleiner Schritt) – Anzahl, Breite und Höhe für jedes Teil einzeln (statt einer globalen Einstellung).
- [x] **Automatisch verteilen oder von Hand setzen** (kleiner Schritt) – Gleichmäßig verteilen oder Stege per Tipp setzen, verschieben und löschen.
- [x] **Stege auf dem Tisch anzeigen** (kleiner Schritt) – Markierungen in echter Breite an der Stelle, wo der Steg stehen bleibt.
- [ ] **Stege meiden Ecken** (kleiner Schritt) – Beim automatischen Verteilen wandern Stege in die Mitte gerader Stücke und nie auf eine Ecke.
- [ ] **Verteilen nach Abstand** (kleiner Schritt) – Ein Steg alle X mm statt einer festen Anzahl.
- [ ] **Keilförmige Stege** (kleiner Schritt) – Dreieckige Stege, die sich leichter abschneiden lassen und weniger Reststeg lassen.
- [ ] **Stege nachträglich entfernen** (größeres Projekt) – Ein kleines Programm, das die Stege nach dem Herauslösen glatt fräst.
- [ ] **Steg-Vorlagen merken** (kleiner Schritt) – Zuletzt benutzte Steg-Maße je Material und Werkzeug vorschlagen.
- [ ] **Angehobene Strecken im Werkzeugweg zeigen** (kleiner Schritt) – In der Vorschau des Werkzeugwegs (Tisch und 3D) die Strecken anders zeichnen, auf denen der Fräser über einem Steg angehoben ist. Bisher zeigt nur die Zeichnung die Stege.

### Bahnen & Strategien

- [ ] **Taschenmuster** (größeres Projekt) – Spirale oder Zickzack für Taschen; Boden und Wand getrennt schlichten.
- [ ] **Restmaterial mit kleinerem Fräser** (größeres Projekt) – Dort nachfräsen, wo der große Fräser nicht hinkam (Ecken, enge Stellen).
- [ ] **Anfahrbögen** (kleiner Schritt) – Tangentiales Ein- und Ausfahren an Konturen, damit keine Marke im Schnitt bleibt.
- [ ] **Helix zum Eintauchen und Vorbohren** (kleiner Schritt) – Eintauchen in Taschen mit einer Helix; Vorbohren an einem Punkt.
- [ ] **Bohren mit Spanbrechen** (kleiner Schritt) – Tiefe Bohrungen in Stufen mit Rückzug; Zentrieren vor dem Bohren.
- [ ] **Gewindefräsen** (größeres Projekt) – Innengewinde mit einem Gewindefräser als Helix.
- [ ] **V-Carving** (größeres Projekt) – Schrift und Formen mit V-Fräser, Tiefe folgt der Breite (Füllung).
- [ ] **Mehrere Werkzeuge in einem Programm** (größeres Projekt) – Zum Beispiel V-Fräser für die Schrift und Schaftfräser für den Ausschnitt, mit Werkzeugwechsel.
- [ ] **Trochoidal schruppen** (größeres Projekt) – Kreisende Bahn mit kleiner Eingriffsbreite für Hartholz und Metall.
- [ ] **Fläche planfräsen** (kleiner Schritt) – Opferplatte oder Rohteil planen, mit Muster und Überlappung.
- [ ] **Fahrwege kürzen** (kleiner Schritt) – Reihenfolge der Teile so wählen, dass die Eilgänge möglichst kurz werden.
- [ ] **Tiefe und Materialdicke je Teil** (kleiner Schritt) – Jedes Teil mit eigener Materialdicke und eigenem Z-Versatz (Stufen im Rohteil).
- [ ] **Einstieg nur außerhalb des Teils** (kleiner Schritt) – Bei Ausschnitten außerhalb der Kontur einstechen, wo der Verschnitt liegt.
- [ ] **Flächen schraffieren** (kleiner Schritt) – Eine geschlossene Form mit Linien füllen (Gravur mit kleinem Fräser oder V-Fräser), mit Abstand und Winkel.
- [ ] **Fase mit V-Fräser entlang der Kontur** (kleiner Schritt) – Eine Kante anfasen: der V-Fräser fährt die Kontur ab, die Tiefe bestimmt die Fasenbreite.

### Prüfen & Simulieren

- [ ] **Abtrag simulieren** (größeres Projekt) – 3D-Vorschau des Ergebnisses: was bleibt stehen, wo liegen Stege, was wird zu tief.
- [ ] **Zeit und Materialverbrauch** (kleiner Schritt) – Geschätzte Fräszeit je Teil und für alles, Länge der Schnitte, Anzahl der Werkzeugwechsel.
- [ ] **Warnung, wenn ein Teil über das Rohteil ragt** (kleiner Schritt) – Rot markieren, mit Maß, wie weit es herausragt.
- [ ] **Eilgang gestrichelt zeigen** (kleiner Schritt) – In der Vorschau Eilgänge anders zeichnen als Schnitte.

### Import, Export, Projekt

- [ ] **Zeichnung als SVG oder DXF ausgeben** (kleiner Schritt) – Die aktuelle Zeichnung für andere Programme speichern.
- [ ] **Weitere Formate lesen** (größeres Projekt) – PDF-Vektoren, HPGL und Konturen aus STL-Schnitten.
- [ ] **Vorlagen-Bibliothek** (größeres Projekt) – Häufige Teile (Untersetzer, Schlüsselbrett, Schilder) als Vorlage mit Maßen zum Einstellen.
- [ ] **Mehrere Zeichnungen gleichzeitig** (größeres Projekt) – Zeichnungen in Reitern, Teile zwischen ihnen kopieren.
- [ ] **Benannte Teile und Nummern** (kleiner Schritt) – Jedes Teil bekommt einen Namen; auf Wunsch eine Nummer im Bild und im Programmkopf.

### Komfort

- [ ] **Kontextmenü** (kleiner Schritt) – Langes Tippen oder Rechtsklick auf ein Teil: Kopieren, Löschen, Gruppieren, Ausrichten.
- [ ] **Zoom auf Auswahl** (kleiner Schritt) – Ansicht passt sich dem gewählten Teil an.
- [ ] **Messen in der Zeichnung** (kleiner Schritt) – Abstand zwischen zwei Punkten der Zeichnung ablesen, ohne etwas zu verändern.
- [ ] **Farben als Bearbeitungsgruppen** (kleiner Schritt) – Teile einer Farbe teilen sich Tiefe, Werkzeug und Reihenfolge (wie die Farbzuordnung in Estlcam).
- [ ] **Verlauf der Änderungen** (kleiner Schritt) – Rückgängig-Liste mit Namen der Schritte, Sprung zu einem früheren Stand.
- [ ] **Kopieren zwischen Projekten** (kleiner Schritt) – Teile in die Zwischenablage legen und in einem anderen Projekt einfügen.

### Schon da

- [x] **Formen, Text, SVG, DXF; Griffe, Drehen, Spiegeln, Reihen und Spalten** (vorhanden) – Zeichnen wie in einem Zeichenprogramm, mit Maßen als Zahlen, Rückgängig/Wiederholen und Tasten.
- [x] **Dogbone und T-Bone, Schlichtzugabe, innen vor außen** (vorhanden) – Ecken freischneiden, Schruppen und Schlichten, sinnvolle Reihenfolge.
- [x] **Beidseitig fräsen, Serien auf Rohlingen, Teile in Abschnitten** (vorhanden) – Abläufe, die die Kamera nutzen.
- [x] **Projekt speichern und öffnen** (vorhanden) – Zeichnung als Datei sichern, strikt gelesen, in einem Schritt rückgängig.

## Ideen mit Kamera

_Was sich aus dem kalibrierten Auge machen lässt._

### Im Werkstattalltag

- [ ] **Job aufs Material schieben** (kleiner Schritt) – Tisch scannen, Job auf dem Foto schieben und drehen: Reststücke nutzen, Astlöcher und Schrauben umgehen, Maserung ausrichten. Für Gezeichnetes geht es schon; offen ist fertiger G-Code aus anderen Programmen.
- [x] ★ **Nullpunkt per Fingertipp** (vorhanden) – Werkzeug „Nullpunkt“ auf Tisch und Kamera: Ecke antippen, Lupe mit Feinschritten, zwei Punkte an der Kante richten eine schiefe Platte aus.
- [x] ★ **Messen per Fingertipp** (vorhanden) – Zwei Punkte antippen, Abstand, ΔX/ΔY und Winkel; im Livebild rastet der Tipp auf Löcher ein. Etwa 0,2–0,5 mm genau.
- [x] ★ **Spannmittel markieren** (vorhanden) – Antippen, schieben, Größe und Höhe; Warnung mit Namen, wenn Fräsbahn oder Eilfahrt darüber oder hindurch geht.
- [x] **Auf vorhandene Teile weiterarbeiten** (vorhanden) – Zwei Bohrungen finden, der Job dreht sich passend.
- [x] ★ **Beidseitig fräsen** (vorhanden) – In „Zeichnen“ der Schalter „Von beiden Seiten fräsen“; der Job-Raum führt durchs Wenden. Braucht die Y-Achse; an der Maschine noch erproben.
- [ ] **Nachricht mit Foto** (kleiner Schritt) – „Job fertig“ oder „Alarm“ kommt mit Kamerabild aufs Handy.
- [ ] **Job-Tagebuch** (kleiner Schritt) – Foto vorher und nachher, Zeitraffer und Werte zu jedem Job in der Historie.

### Die Kuh fliegt

- [ ] **Vorlage abfräsen** (größeres Projekt) – Schablone, kaputtes Teil oder Edding-Skizze scannen, Kontur erkennen lassen, als Fräsbahn ins CAM, Kopie fräsen.
- [x] ★ **Seriengravur auf verstreuten Rohlingen** (vorhanden) – In „Zeichnen“ „Serie: auf Rohlinge verteilen“: scannen, Rohlinge finden, Motiv oder Namensliste auf alle.
- [x] ★ **Vorrichtungen mit Markern** (vorhanden) – Extras → „Vorrichtungen mit Markern“: Marker drucken, Vorrichtung einmal anlernen; danach erkennt die Kamera sie, misst ein und lädt den Job.
- [ ] **Höhe messen mit Laserlinie** (größeres Projekt) – Schräger Linienlaser neben der Kamera: Materialdicke, Höhenkarte für Gravuren auf welligem Holz, Reliefs scannen.
- [x] ★ **Teile länger als der Tisch** (vorhanden) – Die Prüfliste bietet „In Abschnitten fräsen“ an: Abschnitt fräsen, zwei Marker aufkleben, schieben, Kamera findet das Teil wieder.
- [ ] **Optischer Werkzeugcheck** (Forschung) – Makrokamera prüft vor dem Job: Fräser gebrochen, Durchmesser, Länge.
- [ ] **Soll-Ist-Vergleich** (Forschung) – Nach dem Job scannen und mit dem Plan vergleichen: fehlende Schnitte, abgebrochene Haltestege.

## Bedienung & Oberfläche

_Abläufe glatt machen, bevor neue Funktionen kommen._

### Abläufe

- [ ] **Die 5 häufigsten Abläufe festlegen** (Aufgabe) – Was wird wirklich oft gefräst? Jeden Ablauf durchgehen und die Schritte zählen.
- [x] ★ **Tisch-Ansicht statt vieler Umschalter** (vorhanden) – Bühne mit Tisch / Kamera / 3D; die Draufsicht ist die Fotokarte mit Job und Fräser.
- [ ] **Nur zeigen, was gerade geht** (kleiner Schritt) – Ohne Pi kein Mitschnitt, ohne Sensor kein Lastbalken, ohne kalibrierte Kamera nur „Kamera einrichten“.
- [ ] **Job-Raum nur als Ablauf** (kleiner Schritt) – Material und Nullpunkt → Prüfen → Fräsen. Kamera als Werkzeug im ersten Schritt.
- [ ] **Experimentelles ausblenden** (kleiner Schritt) – Spindellast, Rattererkennung, adaptiver Vorschub, Autolevel unsichtbar, bis die Hardware da ist.
- [ ] **Feature-Stopp** (Aufgabe) – Keine neuen Funktionen, bis die Kernabläufe sich selbstverständlich anfühlen.
- [ ] **Mehrere Dateien auf einmal laden** (kleiner Schritt) – Aus dem Umbau-Guide, noch nicht gebaut.
- [ ] **Nach Operation pausieren** (kleiner Schritt) – Das Programm hält nach einer gewählten Operation an.
- [ ] **Probelauf in der Luft (Z-Versatz)** (kleiner Schritt) – Das Programm einmal mit angehobenem Z durchfahren.
- [ ] **Overrides für die Spindel** (kleiner Schritt) – Spindeldrehzahl während des Laufs verändern.
- [ ] **Eigene Tastenbelegung** (kleiner Schritt) – Tasten selbst festlegen.
- [ ] **Schnellsuche: Treffer in Inhalten** (kleiner Schritt) – Werkzeuge, Materialien, SD-Dateien, Makros und $-Einstellungen mit der Schnellsuche finden.
- [ ] **Nullpunkt hat fünf Eingänge** (kleiner Schritt) – Einen Weg wählen, die anderen zeigen dorthin.

## Pi & Betrieb

_Der Pi beobachtet und meldet, er schützt nicht._

### Pi und Betrieb

- [ ] **Pi per USB-Kabel am Jackpot** (größeres Projekt) – Robuste Verbindung zur Maschine statt WLAN; das Tablet hängt nur noch an der Anzeige.
- [ ] **Pi überwacht jeden Job** (kleiner Schritt) – Nachricht und Historie auch, wenn Tablet oder PC schlafen.
- [ ] **Streaming vom Pi statt vom Browser** (größeres Projekt) – Zeilenweises Senden so zuverlässig wie der SD-Start.
- [ ] **Automatische Sicherungen** (kleiner Schritt) – FluidNC-Konfiguration, Datenbank und Jobs regelmäßig sichern, vor jeder Config-Änderung.
- [ ] **Wartungszähler** (kleiner Schritt) – Betriebsstunden und gefahrene Meter pro Achse, mit Erinnerung an Riemen und Lager.
- [ ] **Mikrofon für Rattern und Bruch** (Forschung) – USB-Mikrofon als Ergänzung zum Vibrationssensor.
- [ ] **Zweiter Kamera-Stream** (kleiner Schritt) – Makrokamera am Fräser als zweite Ansicht, im Mitschnitt mit Zeitlupe.
- [ ] **Jackpot vom Pi aus neu starten** (kleiner Schritt) – Relais in der 24-V-Leitung, wenn er nach einem Stromausfall nicht im WLAN ist.

## Hardware & Aufbau

_Was gebaut oder gekauft werden muss._

### Hardware

- [ ] **Licht an der Kamera** (Hardware) – LED-Ring oder Streifen, gestreut. Hilft Bilderkennung und Video, verkürzt die Belichtung.
- [ ] **Linienlaser für Höhenmessung** (Hardware) – Eine einzelne Linie, 1–5 mW, 5 V, fokussierbar, 12 mm. Schräg zur Kamera montiert, vom Pi schaltbar.
- [ ] **Tastplatte für Z0** (Hardware) – Für den genauen Z-Nullpunkt bleibt die Tastplatte die beste und günstigste Lösung.
- [ ] **Pi am 24-V-Netzteil** (Hardware) – Step-Down 24 V → 5,1 V, USB-C, mindestens 3 A, mit Sicherung 1–2 A in der Plusleitung.
- [ ] **Y-Achse fertig bauen** (Hardware) – Erst dann gehen Scan als Fläche, Bohrungen zentrieren und „hierhin“ abseits der Linie.

## Testen & offene Punkte

_Kleine Dinge, die noch zu klären oder an der Maschine zu prüfen sind._

### An der Maschine

- [ ] **Not-Halt-Verdrahtung klären** (Aufgabe) – Trennt er die Netzteilspannung oder ist er nur ein Signal an FluidNC? Entscheidet, wo der Pi seinen Strom bekommt.
- [ ] **Netzteil-Leistung notieren** (Aufgabe) – Wie viel Ampere hat das 24-V-Netzteil?
- [ ] **Kamera genau kalibrieren** (Aufgabe) – Nach fester Halterung: Kamerahöhe, Maßstab, Versatz, dann Kurztest „Fräser hierhin“.
- [ ] **Fotokarte als Streifen testen** (Aufgabe) – Nach der Kalibrierung: Lineal-Zahlen müssen über die Bildgrenzen durchlaufen.
- [ ] **Mitschnitt am echten Job testen** (Aufgabe) – Zeitraffer und Video, Abspielen auf dem iPad.
- [ ] **VMware-Adressbereich ändern** (Aufgabe) – VMnet8 nutzt 192.168.178.1, denselben Bereich wie die Fritzbox. Bei Netzproblemen umstellen.
- [ ] **Streifen-Scan an der Maschine erproben** (Aufgabe) – Mit Aufzeichnung fahren, Verzögerung und Unschärfe messen, Ergebnis auswerten (docs/scan.md).
- [ ] **Genauigkeits-Check mit Lineal fahren** (Aufgabe) – Vier Punkte bohren, sechs Abstände messen, Korrektur schreiben, Kontrollmessung (README, Abschnitt Genauigkeit).
- [ ] **Messprotokoll der Kamera ausfüllen** (Aufgabe) – docs/messprotokoll-kamera.md: Maßstab, Wiederholbarkeit, Versatz.
- [ ] **Scan mit Pi-Takt an der Maschine erproben** (Aufgabe) – Mit dem Pi als Weiterleitung scannen und im Panel nachsehen, welche Uhr lief und warum nicht die des Pi, falls nicht. Offen sind die echte ustreamer-Version, der iPad-Safari mit dem Kamerastrom und die echte Streuung (die beiden curl-Befehle stehen in docs/scan.md).
- [ ] **Aufzeichnung: einmal fehlten Ankerbilder im Zip** (Aufgabe) – In einem von etwa sieben Läufen fehlten drei Ankerbilder in der Aufzeichnung, obwohl nichts verworfen wurde; Ursache offen, nicht wieder aufgetreten. Wenn es an der Maschine passiert: die Aufzeichnung behalten und melden.
