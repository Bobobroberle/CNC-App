# Ideenliste (Stand November 2026)

Gesammelte Ideen aus dem Live-Aufbau: was aus Kamera, Pi und Software werden kann, dazu Hardware und
offene Punkte. Zum Abhaken gibt es eine Artifact-Seite („LowRider Ideenliste“); diese Datei ist die
Fassung im Projekt, damit nichts verloren geht.

Stand: ✅ vorhanden · 🟡 kleiner Schritt · 🟠 größeres Projekt · 🔴 Forschung

Grundidee: Die Kamera ist ein kalibriertes Auge mit bekannter Position. Fast alles passiert auf einem
Bild, dem Tisch, wie er wirklich aussieht (Fotokarte). Daraus folgt auch die Vereinfachung der
Bedienung: eine Tisch-Ansicht statt vieler Kamera-Modi.

## Kamera im Werkstattalltag

1. 🟡 **Job aufs Material schieben** – Tisch scannen, Job auf dem Foto schieben und drehen: Reststücke,
   Holzfehler umgehen, Maserung ausrichten. Für selbst Gezeichnetes geht es schon: Im Arbeitsbereich
   _Zeichnen_ folgt ein Teil dem Finger auf dem Tisch-Bild, drehen und spiegeln daneben. Offen: fertigen
   G-Code aus anderen Programmen so schieben.
2. ✅ **Nullpunkt per Fingertipp** – Werkstückecke antippen, Lupe mit Feinschritten, im Kamerabild rastet der
   Tipp auf Ecke und Kante ein; zwei Punkte an der Kante korrigieren die Drehung.
3. ✅ **Messen per Fingertipp** – zwei Punkte, Abstand, ΔX/ΔY, Winkel; im Kamerabild rastet der Tipp auf
   Löcher ein (Lochabstand in zwei Tipps). Etwa 0,2–0,5 mm am Bildrand und auf der Fotokarte.
4. ✅ **Spannmittel markieren** – Zwingen/Schrauben antippen, verschieben, Größe und Höhe; Warnung mit Namen
   bei Fräsbahn, Eilgang hinein oder zu wenig Luft darüber. Noch offen: Spannmittel selbst im Bild erkennen.
5. ✅ **Auf vorhandene Teile weiterarbeiten** – zwei Bohrungen finden, Job dreht sich passend.
6. ✅ **Beidseitig fräsen** – im Arbeitsbereich _Zeichnen_ ein Schalter: jede Bearbeitung auf
   Vorder- oder Rückseite, die App spiegelt selbst und bohrt zwei Passlöcher. Der Job-Raum führt
   durchs _Wenden_; wiedergefunden wird das Teil mit der Kamera (Löcher suchen, Nullpunkt und Drehung
   daraus) oder auf zwei Passstiften. Offen: an der echten Maschine erproben; ein drittes Loch, das
   falsch herum gewendete Teile erkennt; mehr als einmal wenden; beidseitig auch für fertigen G-Code
   aus anderen Programmen.
7. 🟡 **Nachricht mit Foto** – „Job fertig“/„Alarm“ mit Kamerabild (ntfy-Anhang).
8. 🟡 **Job-Tagebuch** – Foto vorher/nachher, Zeitraffer und Werte in der Historie.

## Die Kuh fliegt

9. 🟠 **Vorlage abfräsen** – Schablone oder Edding-Skizze scannen, Kontur erkennen, ins CAM, Kopie fräsen.
10. ✅ **Seriengravur auf verstreuten Rohlingen** – in _Zeichnen_ „Serie: auf Rohlinge verteilen“: Die
    App findet die Rohlinge auf dem Tisch-Bild (Lage, Größe, Drehung aus der Form), legt das Motiv
    auf jeden, auf Wunsch je einen Namen aus einer Liste oder eine laufende Nummer, und macht ein
    Programm daraus. Antippen lässt einen Rohling aus, „Drehen“ stellt das Motiv auf den Kopf; was
    sich berührt, am Bildrand liegt oder sich kaum abhebt, wird mit Grund abgelehnt. Vom Tisch-Bild
    etwa 0,2–0,5 mm, mit der Kamera nachgemessen etwa 0,1 mm. Offen: an der echten Maschine mit
    echtem Licht erproben (bisher nur Simulator und künstliche Bilder); zwei Rohlinge, die bündig
    Kante an Kante liegen, sieht die Kamera als einen; Rohlinge mit Einbuchtung (Herz, Stern);
    Schrift automatisch verkleinern, wenn ein Name nicht passt; Winkel für runde Rohlinge frei
    wählen (Maserung).
11. ✅ **Vorrichtungen mit Markern** – eine Vorrichtung trägt einen oder zwei gedruckte Marker
    (eigener Code, 48 Nummern, Druckseite in echten Millimetern unter _Job → Extras_). Einmal
    anlernen (Job, Nullpunkt, Spannmittel wie sie stehen); danach erkennt die Kamera die Vorrichtung
    im Livebild oder auf dem Tisch-Bild, und ein Halten misst die Marker in der Bildmitte nach,
    setzt den X/Y-Nullpunkt und lädt den Job passend gedreht. Die Prüfliste trägt es und sperrt,
    wenn Nullpunkt, Job oder Lage sich danach ändern. Lage etwa 0,1 mm; der Winkel eines einzelnen
    40-mm-Markers nur etwa 0,3° (1,5 mm auf 300 mm) – deshalb zwei Marker weit auseinander für
    große Vorrichtungen, und die App nennt die erwartete Abweichung. Offen: an der echten Maschine
    mit echtem Druck, Licht und Linse erproben (bisher nur Simulator und künstliche Bilder);
    Z aus dem Marker gibt es nicht (wie gewohnt antasten); den Job einer Vorrichtung austauschen
    heißt bisher: neu anlernen (mehrere Jobs je Vorrichtung gehen, jeder wird einzeln angeboten);
    die Zeichnung selbst wird nicht gespeichert, nur ihr Programm; Verzeichnung der Linse und ein
    Marker, der deutlich höher oder tiefer liegt als die Kamerahöhe, sind nicht korrigiert (die
    Lage wird deshalb in der Bildmitte gemessen).
12. 🟠 **Höhe messen mit Laserlinie** – Triangulation: Materialdicke, Höhenkarte, Reliefs scannen.
13. ✅ **Teile länger als der Tisch** – verlässt ein Job den Verfahrweg nur in X oder nur in Y,
    bietet die Prüfliste „In Abschnitten fräsen“ an. Der Job wird in so wenige Abschnitte geteilt,
    wie der Verfahrweg zulässt (je ein eigenes Programm); was zusammengehört und in einen
    Abschnitt passt – Bohrung, Buchstabe, Tasche samt Schlichtgang – bleibt ganz, nur Langes endet
    an der Naht und geht im nächsten Abschnitt 1 mm überlappend weiter, nie in einem Haltesteg.
    Wiedergefunden wird das Teil an zwei gedruckten Markern (Passmarken), die vor dem Schieben
    aufgeklebt und vor und nach dem Schieben in der Bildmitte gemessen werden: Daraus setzt die
    App den X/Y-Nullpunkt neu und dreht den nächsten Abschnitt mit. Ein gerader Anschlag hält die
    Richtung mechanisch, dann genügt ein Marker. An der Naht etwa 0,2 mm; am fernen Ende wächst
    der Fehler mit Entfernung durch Markerabstand – die App nennt ihn vorher. Offen: an der
    echten Maschine erproben (bisher nur Simulator und gerechnete Fälle); Passlöcher statt Marker
    gibt es nicht (verwechselbar mit Bohrungen des Jobs); geschoben wird immer zum kleinen Ende
    der Achse hin; ein Teil, das beim Schieben anders aufliegt (durchhängendes Ende), braucht
    einen neuen Z-Nullpunkt, den die App nicht prüft; bei mehreren Werkzeugen wird je Abschnitt
    gewechselt; Programme mit G91-Fahrbewegungen, G93, G92/G10 oder Bögen außerhalb XY werden
    abgelehnt; Kacheln in beide Richtungen gibt es nicht.
14. 🔴 **Optischer Werkzeugcheck** – Makrokamera: Bruch, Durchmesser, Länge.
15. 🔴 **Soll-Ist-Vergleich** – nach dem Job scannen und mit dem Plan vergleichen.

Grenzen: Karte etwa 0,2–0,5 mm, zentriert auf Bohrung etwa 0,05 mm; die Kamera sieht nur 2D; Licht
entscheidet.

## Zeichnen (CAM)

- ✅ Text gravieren (Einlinien-Schrift mit Umlauten, mehrere Zeilen) und _Linie gravieren_ als Bearbeitung.
- ✅ SVG neben DXF laden; was nicht übernommen wird, steht da.
- ✅ Anordnen: schieben (Finger oder Zahlen), drehen, spiegeln, duplizieren, Reihen × Spalten.
- ✅ Zeichnen wie in einem Zeichenprogramm: ein Tipp legt die Form auf den Tisch, Griffe für Größe
  und Drehen, Maße des gewählten Teils als Zahlen, Rückgängig/Wiederholen, Tasten (Entf, Pfeile,
  Strg+Z/D/C/V). Formen und Text bleiben änderbar.
- 🟡 Mehrere Teile einzeln zusammen auswählen (Umschalt+Tipp, Rahmen aufziehen); bisher: eines oder alles.
- 🟡 Fangen beim Schieben: an Kanten und Mitten anderer Teile, am Rohteil.
- 🟡 Freie Linie / Vieleck zeichnen, Punkte einer geladenen Kontur verschieben.
- ✅ Innenecken freischneiden (Dogbone, T-Bone), Schlichtzugabe, Reihenfolge innen vor außen.
- 🟡 Mehrere Werkzeuge in einem Programm (V-Fräser für die Schrift, Schaftfräser für den Ausschnitt).
- 🟡 Schrift mit Füllung (V-Carving).

## Bedienung vereinfachen

- Die 5 häufigsten Abläufe festlegen, durchgehen, Schritte zählen.
- ✅ Tisch-Ansicht: Draufsicht = Fotokarte mit Job und Fräser, Livebild klein in der Ecke; Bühne nur
  noch Tisch / Kamera / 3D, eine Werkzeugleiste für das Antippen in beiden Ansichten.
- 🟡 Nur zeigen, was gerade geht (ohne Pi kein Mitschnitt, ohne Sensor kein Lastbalken, ohne
  kalibrierte Kamera nur „Kamera einrichten“).
- ✅ Umbau nach `DESIGN.md`, Etappe 11: Statusleiste mit PAUSE und NOT-HALT, Start mit einer
  Empfehlung, Ablauf ① Job → ② Werkzeuge → ③ Einrichten → ④ Prüfen → ⑤ Fräsen, Nebenbereiche im
  Menü, Jog-Feld aus jedem Bildschirm, helles Theme, eigenes Zahlenfeld. Was wohin gewandert ist und
  was Etappe 12 und 13 noch bringen: [umbau-guide.md](umbau-guide.md).
- Aus dem Guide, noch nicht gebaut (über die Etappen 12/13 hinaus offen oder bewusst später):
  mehrere Dateien auf einmal laden; Nullpunkt-Historie je Job (letzte 5); „Nach Operation
  pausieren“; Overrides für die Spindel; Probelauf in der Luft (Z-Offset); abgewickelte
  Mantelansicht und _Drehachse Mitte_ antasten (Drehachse A ist nur vorbereitet: Anzeige und
  Schritt-Jog); Sprachausgabe für Schlüsselereignisse; USB-Handrad; Wartungszähler und
  Betriebsstunden der Spindel; Achstest; Messtaster als Werkzeug, der den Spindelstart sperrt;
  eigenes Zahnrad für die Einstellungen ab 1280 px; 14-px-Schrift am Desktop.
- 🟡 Job-Raum nur als Ablauf: Material und Nullpunkt → Prüfen → Fräsen; Kamera als Werkzeug im ersten Schritt
  (mit dem Ablauf in fünf Schritten begonnen, `JobSetup` ist noch ungeteilt).
- 🟡 Experimentelles (Spindellast, Rattern, adaptiver Vorschub, Autolevel) ausblenden, bis Hardware da ist.
- ✅ Schnellsuche (_Suchen_ oben, `Strg/Cmd+K`, `/`): jede Funktion per Stichwort, auch mit dem
  falschen Wort oder Tippfehler; Schnellzugriff nach Lage, zuletzt benutzt; führt hin und zeigt die
  Stelle, tut selbst nichts an der Maschine. Tastenkürzel für den nächsten Schritt und die Ansichten,
  Übersicht mit `?`.
- Schnellsuche, noch offen: Stichwörter aus dem Alltag nachtragen (welche Wörter fand die Suche
  nicht? – ein kleines Protokoll „nichts gefunden für …“ im Browser würde es zeigen); Treffer in
  Inhalten (Werkzeuge und Materialien der Bibliothek, Dateien auf der SD-Karte, Makros beim Namen,
  $-Einstellungen); Ziele, die es nur zeitweise gibt (Wenden-Ablauf, erkannte Vorrichtung), direkt
  anspringen; „Rückgängig“ und andere harmlose Dinge der Zeichnung aus der Suche auslösen statt nur
  zeigen; eigene Tastenbelegung.
- Aufräumen, beim Durchgehen für die Suche aufgefallen (nicht umgebaut): Der Nullpunkt hat fünf
  Eingänge (Werkzeug _Nullpunkt_ auf der Bühne, _Fahren → Nullpunkte_, _Job → Vorbereiten →
  Nullpunkt_, Kamera-Fadenkreuz, Bohrung) – einer sollte der Weg sein, die anderen dorthin zeigen.
  _Spannmittel_ gibt es als Werkzeug und als Liste unter _Vorbereiten_ (die Liste könnte in das
  Werkzeug wandern). _Makros_ (Tasten unter _Joggen_) und _Makros bearbeiten_ (Einrichtung) liegen
  weit auseinander. _Kalibrieren_ heißt sowohl der Abschnitt der Maschine als auch der Schritt der
  Kamera. _Pause/Fortsetzen_ steht in der Karte _Referenzfahrt_, wo es keiner sucht. _Maschine →
  Verbindung_ trägt Simulator, Companion, Protokoll und Konsole – vier Themen in einer Ansicht.
  `docs/erste-schritte.md` nennt noch alte Wege (_Maschine → Konfiguration_, _Maschine → Profil_).
- Feature-Stopp, bis die Kernabläufe glatt sind.

## Oberfläche (coss ui)

- ✅ Oberfläche neu auf coss ui (Base UI + Tailwind): Bausteine als eigener Quelltext, dunkles
  Thema, alles ≥ 48 px, eine HTML-Datei ohne Netz.
- 🟡 Helles Thema (Werkstatt im Sonnenlicht): Die Farbwerte von coss liegen bereit; die Bilder der
  Bühne (Tisch, Kamera-Überlagerung, 3D, Lupe) sind aber für dunklen Grund gezeichnet.
- 🟡 Auswahllisten als coss-Select statt des Auswahlrads vom iPad; Zahlenfelder als NumberField mit
  ±-Tasten (heute Textfeld mit Komma oder Punkt – `parseNumber`).
- 🟡 Schnellsuche mit dem Autocomplete von coss (Command) statt der eigenen Liste; Kurzmeldungen
  (Toast) statt Protokollzeilen; Tooltips an den Werkzeugen der Bühne.
- 🟡 Die Symbole der App (eigene Linien-Symbole) auf Lucide umstellen, wie coss sie nutzt.
- 🟡 Bundle verkleinern: Tailwind und Base UI kosten rund 0,3 MB mehr; three.js bleibt der größte Brocken.

## Umbau nach DESIGN.md – nach Etappe 13 offen

Der Umbau ist durch (Etappen 11–13, Abnahme je Bildschirm in `docs/umbau-guide.md`). Was der Guide
nennt und (noch) nicht gebaut ist – mit dem Grund:

- 🟡 **Probelauf in der Luft** (④): das Programm um einen Z-Versatz angehoben und ohne Spindel
  fahren. Sicher nur als geprüfte Umrechnung in `gcode-core` (alle Z-Wörter in G90, G53 und G91
  unberührt, M3/M4 heraus, Verfahrweg neu geprüft) – nicht über G92, das nach einem Abbruch
  stehen bliebe.
- 🟡 **„Nach Operation pausieren“** (⑤): FluidNC kennt keine Operationen; ein SD-Job lässt sich nur
  sofort anhalten. Möglich wäre es für gestreamte Jobs (Halt an der nächsten Operationsgrenze,
  wie der Halt am Werkzeugwechsel) – oder indem „Zeichnen“ seine Jobs je Operation als eigenes
  Teil auf die SD-Karte legt.
- 🟡 **Operationen aus „Zeichnen“ benennen:** Der eigene CAM schreibt noch keine Kommentare je
  Operation (Bohrungen, Taschen, Gravur, Ausschnitte, Außenkontur). Mit ihnen hätten Zeitleiste
  (④) und „aktuelle Operation“ (⑤) auch für gezeichnete Jobs Namen.
- 🟡 **„Zuletzt verwendet“ für Zeichnungen** und für große Programme (über 400 KB: heute nur Bild
  und Daten, das Programm muss neu geöffnet werden) – z. B. über den Companion.
- 🟡 **Nullpunkt-Historie mit Z**, sobald Werkzeuglängen sauber geführt werden (heute nur X/Y).
- 🟡 **Tastzyklus Z-Oberfläche erst messen, dann übernehmen** (heute: sofort gesetzt, „Verwerfen“
  stellt zurück) – braucht einen Rückzug in Maschinenkoordinaten.
- 🟡 **Eigene Gründe statt der allgemeinen:** Jede gesperrte Schaltfläche sagt jetzt bei Antippen
  etwas – die Halteknöpfe und viele Karten den Zustand der Maschine (nicht verbunden, Alarm,
  fährt), der Rest das allgemeine „Voraussetzung fehlt – steht in dieser Karte“. Schöner wäre
  überall der genaue Grund („erst einen Punkt im Bild antippen“).
- 🟡 **Meldungen mit eigenem Text je Fall:** Ursache, Auswirkung und Maßnahme kommen bei Meldungen
  der App aus einer Gruppe (Verbindung, SD-Karte, Kamera …), nur Alarme und abgelehnte Befehle
  haben ihren eigenen Text je Code. Je Meldung ein eigener Dreisatz wäre genauer.
- 🟡 **Betriebsstunden der Spindel:** FluidNC zählt keine. Heute steht die Laufzeit der Jobs aus
  der Historie da. Echte Stunden bräuchten einen Zähler im Companion (läuft der Fräsmotor? – z. B.
  über die geschaltete Steckdose oder den Stromsensor).
- 🟡 **Achstest mit Messung:** der Achstest zeigt, was die Steuerung meldet. Mit der Kamera über
  einem Marker ließe sich der wirklich gefahrene Weg gleich mitmessen (das macht heute die
  Genauigkeitsprüfung unter „Kalibrieren“).
- 🟡 **USB-Handrad** (ein echtes, als HID-Gerät) über die Aktionsschicht des Jog-Felds
  (`store/jog.ts`) – Tastatur, Maus, Gamepad, Bildschirm-Handrad und Joystick laufen schon darüber.
- 🟡 **Sprachausgabe** für Schlüsselereignisse (Nullpunkt gesetzt, Werkzeugwechsel, Job fertig).
- 🟡 **800 × 600:** Statusleiste, Schritte und Aktionsleiste lassen dort rund 300 px für Bild und
  Blatt. Eine einzeilige Statusleiste (Spindel/Vorschub nur im Schritt ⑤) gäbe dem Bild 60 px mehr.
- 🔴 **Drehachse:** Kachel „Drehachse Mitte“ und abgewickelte Mantelansicht als Prüfansicht – erst
  wenn die Achse gebaut ist.

## Pi und Betrieb

- 🟠 Pi per USB-Kabel am Jackpot (robuste Verbindung, Tablet nur Anzeige).
- 🟡 Pi überwacht jeden Job (Nachricht, Historie auch bei schlafendem Tablet).
- 🟠 Streaming vom Pi statt vom Browser.
- 🟡 Automatische Sicherungen (Config, Datenbank, Jobs).
- 🟡 Wartungszähler (Betriebsstunden, Meter pro Achse).
- 🔴 USB-Mikrofon für Rattern und Bruch.
- 🟡 Zweiter Kamera-Stream (Makro am Fräser, Zeitlupe im Mitschnitt).
- 🟡 Jackpot vom Pi aus neu starten (Relais in der 24-V-Leitung), wenn er nach einem Stromausfall
  nicht im WLAN ist – heute muss man selbst aus- und einschalten (Etappe 14 sagt es nur an).
- 🟡 Grenzen der Steuerung auch ohne Pi dauerhaft speichern (dafür müsste die App die config.yaml
  byteweise lesen können – etwa wenn sie von FluidNCs eigenem Webserver ausgeliefert wird).

## Hardware

- Kamerahalterung als Druckteil: fest, senkrecht, Anschlag, Fokusring fixiert, Späneschutz.
- Licht an der Kamera: LED-Ring oder Streifen, gestreut.
- Zweite Kamera: Waveshare OV4689 USB (MJPEG, 720p@120) plus M12-Objektiv 6–8 mm für Makro.
- Linienlaser für Höhenmessung: **eine** Linie, 1–5 mW (Laserklasse 2 bis 3R), 5 V, fokussierbar,
  12 mm, schräg (30–45°) zur Kamera, vom Pi schaltbar. Kein Mehrlinien-DOE, keine 30 mW.
- Tastplatte für Z0 (genauer und günstiger als jede Kameralösung).
- Pi am 24-V-Netzteil: Step-Down auf 5,1 V USB-C, ≥ 3 A, Sicherung 1–2 A.
- Y-Achse fertig bauen (Flächenscan, Bohrungen zentrieren).

## Offene Punkte

- Not-Halt-Verdrahtung klären (trennt er die Versorgung oder nur Signal an FluidNC?).
- Ampere des 24-V-Netzteils notieren.
- Kamera nach fester Halterung genau kalibrieren (Kamerahöhe, Maßstab, Versatz), Test „Fräser hierhin“.
- Fotokarte als Streifen testen (Lineal-Zahlen laufen über Bildgrenzen durch).
- Mitschnitt am echten Job testen, Abspielen auf dem iPad.
- Etappe 14 an der echten Maschine prüfen: Verbinden über den Pi bei Jackpot aus/an, Grenzen
  schreiben mit Speichern in config.yaml (Vergleich, Neustart, erneut lesen), Rückmeldung der Tasten
  mit Handschuh am Touchscreen.
- VMware VMnet8 nutzt 192.168.178.1 wie die Fritzbox; bei Netzproblemen umstellen.

## Netz (Stand)

Tenda „FluidNC_Keller“ 192.168.0.x ohne Internet. Feste Zuordnung per IP-MAC-Bindung:
Jackpot `192.168.0.200` (20:43:A8:E0:CA:54), Pi `192.168.0.198` (98:FE:54:74:97:78).
Companion-Weiterleitung: `setup.sh --fluidnc 192.168.0.200`.
