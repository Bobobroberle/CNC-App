// Source of the "Merkliste": categories, groups, items. One line per item: [id, group, title, text, kind, flags?]
// kind: vorhanden | klein | gross | forschung | hardware | aufgabe
// flags: { done, want, building }
export const NEW = '2026-11-26';

export const CATS = [
  {
    id: 'scan',
    title: 'Scan & Kamera',
    note: 'Position und Schärfe der Aufnahmen, Kamera und Licht.',
  },
  {
    id: 'cam',
    title: 'CAM / Zeichnen',
    note: 'Wunschliste für den Zeichenbereich. ★ = will ich haben, ✓ = gebaut.',
  },
  {
    id: 'ideen',
    title: 'Ideen mit Kamera',
    note: 'Was sich aus dem kalibrierten Auge machen lässt.',
  },
  {
    id: 'bed',
    title: 'Bedienung & Oberfläche',
    note: 'Abläufe glatt machen, bevor neue Funktionen kommen.',
  },
  { id: 'pi', title: 'Pi & Betrieb', note: 'Der Pi beobachtet und meldet, er schützt nicht.' },
  { id: 'hw', title: 'Hardware & Aufbau', note: 'Was gebaut oder gekauft werden muss.' },
  {
    id: 'test',
    title: 'Testen & offene Punkte',
    note: 'Kleine Dinge, die noch zu klären oder an der Maschine zu prüfen sind.',
  },
];

const A = [];
const add = (cat, grp, rows) =>
  rows.forEach(([id, title, text, kind, flags = {}]) =>
    A.push({ id, cat, grp, title, text, kind, ...flags }),
  );

// ───────────────────────── Scan & Kamera
add('scan', 'Position der Aufnahmen (Timing)', [
  [
    'tim-a',
    'Eine Uhr für Bild und Position',
    'Der Pi stempelt Kamerabild und Statusbericht mit derselben Uhr. Im Simulator sank die Streuung der Zeit von 11–33 ms auf 1–2 ms, die fertige Karte wurde dort nicht genauer; bei sehr schlechtem Link gab der Browser-Takt auf, der Pi-Takt nicht. An der echten Maschine ist die Genauigkeit ungemessen.',
    'klein',
    { done: true },
  ],
  [
    'tim-b',
    'Hardware-Trigger statt Uhr',
    'Eine Global-Shutter-Kamera wird von einem FluidNC-Ausgang ausgelöst (M62/M63); die Position des Bildes ist die befohlene Position, es gibt keine Uhr. Ob M62/M63 auf der Jackpot bewegungssynchron schaltet, ist ungeprüft.',
    'gross',
  ],
  [
    'tim-c',
    'Absolute Referenz im Bild',
    'Ein Streifen mit gedruckten Marken am Tischrand gibt die Position aus dem Bild selbst; wirkt gegen jede Verzögerung, aber nur nahe am Streifen.',
    'gross',
  ],
  [
    'tim-d',
    'Adaptives Warten im Stopp-Modus',
    'Das Bild wird gemacht, sobald Position und Bild ruhig sind, nicht nach fester Pause. Schneller, ohne Uhr. Gebaut mit Beleg: nur wo die Bilder selbst zeigen, dass sie frisch sind (Rauschen der Kamera, die Fahrt im Bild gesehen, ruhig über mindestens 150 ms, nicht vor der auf den ersten drei Punkten gelernten Zeit), sonst die feste Zeit wie bisher; die Serie bleibt bei der festen Zeit. Im Simulator fiel die Pause je Bild bei einer Kamera ohne Verzögerung von etwa 1,0 s auf 0,2 s, wo ein Beleg da ist (auf dem Tisch des Simulators kam er erst beim 26. Bild, vermutlich weil die ersten Reihen über blanker Fläche lagen – nicht gemessen; der Scan eines 725 × 290 mm großen Tisches dauerte statt 204 s noch 170 s); bei 0,8 s Verzögerung lag mit fester Zeit ein Bild 1,8 mm daneben, mit Wartezeit keines. An der echten Kamera ist weder der Gewinn noch die Empfindlichkeit gemessen.',
    'klein',
    { want: true, done: true },
  ],
  [
    'tim-e',
    'Verzögerung an der Maschine messen',
    'Einen Streifen-Scan mit Aufzeichnung fahren und mit dem Auswerter die Verzögerung der Kamera bestimmen (Anleitung in docs/scan.md).',
    'aufgabe',
  ],
  [
    'tim-f',
    'Zeitstempel von ustreamer prüfen',
    'Am Pi mit curl nachsehen, welche Kopfzeilen der Stream pro Bild sendet und was der Stempel bedeutet (Aufnahme, Kodierung oder Senden).',
    'aufgabe',
  ],
  [
    'tim-g',
    'M62/M63 an der Jackpot prüfen',
    'Pulst der Ausgang wirklich in der Bewegung, ohne sie anzuhalten? Mit einer LED oder dem Oszilloskop messen.',
    'aufgabe',
  ],
]);
add('scan', 'Bewegungsunschärfe', [
  [
    'blur-a',
    'Belichtung von Hand kurz stellen',
    'Automatik aus, Belichtung ≤ 2 ms, dafür mehr Licht. Unschärfe = Geschwindigkeit × Belichtungszeit: 50 mm/s und 10 ms sind 0,5 mm, bei 1 ms nur 0,05 mm.',
    'klein',
  ],
  [
    'blur-b',
    'Belichtung aus der App einstellen',
    'Der Companion setzt Belichtung und Verstärkung über v4l2 (Karte in den Kameraeinstellungen), statt per SSH.',
    'klein',
    { want: true, done: true },
  ],
  [
    'blur-c',
    'Tempo aus der Belichtung ableiten',
    'Die größte Scan-Geschwindigkeit folgt aus der erlaubten Unschärfe (v ≤ 0,3 mm / Belichtungszeit): Feld „Belichtung (ms)“ im Scan-Panel, 0 heißt unbekannt; unter 5 mm/s wird in Stopps gescannt.',
    'klein',
    { done: true },
  ],
  [
    'blur-d',
    'Schärfstes Bild wählen',
    'Bei mehreren Bildern derselben Stelle das mit dem größten Kontrast nehmen (Varianz des Laplace-Filters).',
    'klein',
  ],
  [
    'blur-e',
    'Unschärfe herausrechnen',
    'Richtungs-Entfaltung bei bekannter Fahrtrichtung und Länge. Hilft begrenzt und verstärkt das Rauschen.',
    'forschung',
  ],
  [
    'blur-f',
    'Blitz oder gepulste LED im Takt der Belichtung',
    'Ein Blitz von 100 µs macht die Unschärfe praktisch null und legt den Zeitpunkt fest. Braucht Trigger oder Strobe-Ausgang der Kamera.',
    'hardware',
  ],
]);
add('scan', 'Kamera & Licht (Hardware)', [
  [
    'cam-hw1',
    'Global-Shutter-Kamera mit USB (UVC)',
    'Arducam OV9782 (Farbe, 1 MP, Trigger über F/G-Pads) oder OV2311 (Mono, 2 MP, Trigger und Strobe). Rolling Shutter schert das Bild in der Fahrt; Global Shutter nicht. Details im Chat vom 26.11.',
    'hardware',
  ],
  [
    'cam-hw2',
    'Objektiv mit geringer Verzeichnung',
    'M12-Objektiv 4–6 mm, Blickfeld auf die Montagehöhe abgestimmt. Die App rechnet keine Verzeichnung heraus.',
    'hardware',
  ],
  [
    'cam-hw3',
    'Licht vom Pi schaltbar',
    'LED-Ring oder Streifen, gestreut, über einen GPIO-Schalttransistor; später als Blitz nutzbar.',
    'hardware',
  ],
  [
    'cam-hw4',
    'Kamerahalterung als Druckteil',
    'Fest verschraubt, senkrecht nach unten, ohne Spiel, mit Anschlag. Fokusring fixieren, Späneschutz vor der Linse.',
    'hardware',
  ],
  [
    'cam-hw5',
    'Zweite Kamera für den Fräser',
    'Waveshare OV4689 USB (MJPEG, 720p@120) plus M12-Objektiv 6–8 mm für Makro, als zweiter Stream im Mitschnitt.',
    'hardware',
  ],
]);
add('scan', 'Scan-Bedienung', [
  [
    'scan-a',
    'Scan-Geschwindigkeit vorab messen',
    'Vor dem ersten großen Scan ein kurzer Probelauf, der Verzögerung und Schärfe an dieser Maschine ermittelt und das Tempo vorschlägt.',
    'klein',
  ],
  [
    'scan-b',
    'Scan mit Pause und Fortsetzen',
    'Ein abgebrochener Scan macht an der Stelle weiter, statt von vorn.',
    'klein',
  ],
]);

// ───────────────────────── CAM
add('cam', 'Auswählen & Anordnen', [
  [
    'cam-sel1',
    'Mehrfachauswahl',
    'Schalter „Mehrfachauswahl“: ein Tipp auf dem Tisch nimmt ein Teil in die Auswahl oder heraus, ein Tipp daneben lässt sie, wie sie ist; ein Häkchen vor jeder Zeile der Liste tut dasselbe; „Alles auswählen“ und „Auswahl umkehren“ stehen bei der Auswahl. Umschalt/Strg+Tipp und Rahmen aufziehen sind nicht gebaut (cam-sel8, cam-sel9).',
    'klein',
    { done: true },
  ],
  [
    'cam-sel2',
    'Ausrichten',
    'Sechs Knöpfe: links, waagerecht mittig, rechts, oben, senkrecht mittig, unten – an der Auswahl (das äußerste Teil bleibt); eine Gruppe zählt als ein Teil. Am Rohteil oder am Tisch ausrichten ist nicht gebaut (cam-sel11, cam-sel12).',
    'klein',
    { done: true },
  ],
  [
    'cam-sel3',
    'Gleichmäßig verteilen',
    'Waagerecht und senkrecht, mit gleichen Abständen oder gleichen Mitten; ab drei Teilen, die beiden äußeren bleiben stehen.',
    'klein',
    { done: true },
  ],
  [
    'cam-sel4',
    'Gruppieren und auflösen',
    'Gruppieren verbindet die gewählten Teile zu einer Gruppe, die sich gemeinsam wählen, schieben, drehen, skalieren und ausrichten lässt; „Gruppierung aufheben“ macht aus jeder Kontur wieder ein eigenes Teil (so lassen sich auch die einzelnen Konturen einer DXF- oder SVG-Datei wählen).',
    'klein',
    { done: true },
  ],
  [
    'cam-sel5',
    'Teile sperren',
    'Ein gesperrtes Teil lässt sich nicht versehentlich schieben.',
    'klein',
  ],
  [
    'cam-sel6',
    'Teile ausblenden',
    'Auge je Teil: ausgeblendete Teile werden nicht gefräst und stören nicht beim Anordnen.',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-sel7',
    'Gleiche Art auswählen',
    'Alle Bohrungen, alle Taschen oder alle Teile mit demselben Werkzeug mit einem Tipp wählen.',
    'klein',
  ],
  [
    'cam-sel8',
    'Umschalt/Strg+Tipp',
    'Am Rechner mit Umschalt oder Strg auf ein Teil tippen nimmt es in die Auswahl, ohne den Schalter „Mehrfachauswahl“ anzufassen. Braucht die Modifier-Tasten in der Gestenschicht (usePanZoom).',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-sel9',
    'Rahmen aufziehen',
    'Mit Finger oder Maus einen Rahmen über mehrere Teile ziehen; alles, was er berührt, wird gewählt.',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-sel10',
    'Tasten für Gruppieren und Ausrichten',
    'Strg+G gruppiert, Strg+Umschalt+G löst auf, Tasten zum Ausrichten – jede mit Zeile in der Tastenliste und in der Schnellsuche.',
    'klein',
  ],
  [
    'cam-sel11',
    'Am Rohteil ausrichten',
    'Links, mittig, rechts … am eingegebenen Rohteil statt an der Auswahl, etwa zum Mittigsetzen auf der Platte. Der Speicher kennt das Rohteil schon (enteredStock), es fehlt die Wahl in der Oberfläche.',
    'klein',
  ],
  [
    'cam-sel12',
    'Am Tisch ausrichten',
    'Dasselbe am Arbeitsbereich der Maschine. Der Zeichen-Speicher kennt die Tischgröße noch nicht; sie wird nur im Tischbild aus dem Maschinenprofil abgeleitet.',
    'klein',
  ],
  [
    'cam-snap1',
    'Fangen an Kanten, Mitten und Rohteil',
    'Beim Schieben rastet ein Teil an Kanten und Mitten anderer Teile und am Rohteil ein, mit sichtbarer Hilfslinie.',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-snap2',
    'Abstände zwischen Teilen anzeigen',
    'Beim Schieben erscheinen die Maße zu den Nachbarn (wie bei Illustrator).',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-snap3',
    'Raster und Hilfslinien',
    'Raster mit einstellbarem Maß, Lineale, Hilfslinien aus dem Lineal ziehen.',
    'klein',
  ],
  [
    'cam-arr1',
    'Anordnen im Kreis',
    'Kreisförmige Anordnung (Polar-Array) mit Anzahl und Winkel.',
    'klein',
  ],
  [
    'cam-arr2',
    'Automatisch verschachteln (Nesting)',
    'Teile so auf dem Rohteil verteilen, dass möglichst wenig Material übrig bleibt.',
    'gross',
    { want: true, building: true },
  ],
  [
    'cam-arr3',
    'Reihenfolge der Bearbeitung von Hand',
    'Teile in der Liste ziehen, um die Fräsreihenfolge festzulegen (statt automatisch innen vor außen).',
    'klein',
    { want: true, building: true },
  ],
]);
add('cam', 'Zeichnen & Formen', [
  [
    'cam-draw1',
    'Freie Linie und Vieleck zeichnen',
    'Punkte antippen, schließen, fertig. Mit Eingabe von Länge und Winkel.',
    'klein',
  ],
  [
    'cam-draw2',
    'Bögen und Kurven',
    'Bogen und Bézier-Kurven zeichnen und ihre Griffe ziehen.',
    'gross',
  ],
  [
    'cam-draw3',
    'Knoten bearbeiten',
    'Punkte einer Kontur verschieben, einfügen, löschen; Linie in Kurve wandeln. Auch für geladene Konturen.',
    'gross',
  ],
  [
    'cam-draw4',
    'Weitere Grundformen',
    'Rechteck mit Eckenradius je Ecke, Langloch, Ellipse, Stern, Zahnrad, Spirale.',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-draw5',
    'Eigene Schriften',
    'TTF/OTF-Schriften in Konturen umwandeln; Zeilenabstand, Buchstabenabstand, Text auf Linie oder Kreis.',
    'gross',
  ],
  [
    'cam-draw6',
    'Maße als Formel',
    'Eine Tabelle mit Maßen (Breite = 2 × Höhe), die das Teil neu zeichnet.',
    'gross',
  ],
  [
    'cam-draw7',
    'Bild nachzeichnen',
    'PNG/JPG in Konturen umwandeln (Vektorisieren), mit Schwelle und Glättung.',
    'gross',
  ],
  [
    'cam-draw8',
    'Foto des Tisches als Vorlage',
    'Die Fotokarte liegt hinter der Zeichnung und kann zum Abpausen genutzt werden (Kontur der Vorlage nachfahren).',
    'klein',
  ],
  [
    'cam-draw9',
    'Seitenverhältnis sperren',
    'Beim Ziehen am Griff bleibt das Verhältnis; Schloss neben den Maßen.',
    'klein',
  ],
  [
    'cam-draw10',
    'Anmerkungen und Maße',
    'Maßpfeile und Texte, die auf dem Tisch stehen, aber nicht gefräst werden.',
    'klein',
  ],
]);
add('cam', 'Konturen bearbeiten', [
  [
    'cam-cont1',
    'Boolesche Operationen',
    'Vereinigen, Abziehen, Schneiden, Ausschließen zweier Teile zu einer neuen Kontur.',
    'gross',
  ],
  [
    'cam-cont2',
    'Versatzkontur',
    'Eine Kontur um ein Maß nach innen oder außen kopieren (zum Beispiel für Rand oder Rille).',
    'klein',
  ],
  [
    'cam-cont3',
    'Ecken verrunden und anfasen',
    'Rundung oder Fase an gewählten Ecken oder an allen.',
    'klein',
  ],
  [
    'cam-cont4',
    'Konturen schließen und verbinden',
    'Offene Konturen schließen, Lücken bis zu einem Maß überbrücken, Linien zu einer Kontur verbinden.',
    'klein',
  ],
  [
    'cam-cont5',
    'Trimmen und Verlängern',
    'Linien an einer anderen Linie abschneiden oder bis dahin verlängern.',
    'gross',
  ],
  [
    'cam-cont6',
    'Vereinfachen und aufräumen',
    'Doppelte Punkte und Linien entfernen, zu viele Punkte ausdünnen, Richtung umkehren, Selbstüberschneidungen anzeigen.',
    'klein',
  ],
  ['cam-cont7', 'Neigen (Scheren)', 'Zusätzlich zu Drehen und Spiegeln: ein Teil neigen.', 'klein'],
]);
add('cam', 'Haltestege', [
  [
    'cam-tab1',
    'Haltestege je Teil einstellen',
    'Anzahl, Breite und Höhe für jedes Teil einzeln (statt einer globalen Einstellung).',
    'klein',
    { done: true },
  ],
  [
    'cam-tab2',
    'Automatisch verteilen oder von Hand setzen',
    'Gleichmäßig verteilen oder Stege per Tipp setzen, verschieben und löschen.',
    'klein',
    { done: true },
  ],
  [
    'cam-tab3',
    'Stege auf dem Tisch anzeigen',
    'Markierungen in echter Breite an der Stelle, wo der Steg stehen bleibt.',
    'klein',
    { done: true },
  ],
  [
    'cam-tab4',
    'Stege meiden Ecken',
    'Beim automatischen Verteilen wandern Stege in die Mitte gerader Stücke und nie auf eine Ecke.',
    'klein',
    { want: true, building: true },
  ],
  ['cam-tab5', 'Verteilen nach Abstand', 'Ein Steg alle X mm statt einer festen Anzahl.', 'klein'],
  [
    'cam-tab6',
    'Keilförmige Stege',
    'Dreieckige Stege, die sich leichter abschneiden lassen und weniger Reststeg lassen.',
    'klein',
  ],
  [
    'cam-tab7',
    'Stege nachträglich entfernen',
    'Ein kleines Programm, das die Stege nach dem Herauslösen glatt fräst.',
    'gross',
  ],
  [
    'cam-tab8',
    'Steg-Vorlagen merken',
    'Zuletzt benutzte Steg-Maße je Material und Werkzeug vorschlagen.',
    'klein',
  ],
]);
add('cam', 'Bahnen & Strategien', [
  [
    'cam-path1',
    'Taschenmuster',
    'Spirale oder Zickzack für Taschen; Boden und Wand getrennt schlichten.',
    'gross',
  ],
  [
    'cam-path2',
    'Restmaterial mit kleinerem Fräser',
    'Dort nachfräsen, wo der große Fräser nicht hinkam (Ecken, enge Stellen).',
    'gross',
  ],
  [
    'cam-path3',
    'Anfahrbögen',
    'Tangentiales Ein- und Ausfahren an Konturen, damit keine Marke im Schnitt bleibt.',
    'klein',
  ],
  [
    'cam-path4',
    'Helix zum Eintauchen und Vorbohren',
    'Eintauchen in Taschen mit einer Helix; Vorbohren an einem Punkt.',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-path5',
    'Bohren mit Spanbrechen',
    'Tiefe Bohrungen in Stufen mit Rückzug; Zentrieren vor dem Bohren.',
    'klein',
    { want: true, building: true },
  ],
  ['cam-path6', 'Gewindefräsen', 'Innengewinde mit einem Gewindefräser als Helix.', 'gross'],
  [
    'cam-path7',
    'V-Carving',
    'Schrift und Formen mit V-Fräser, Tiefe folgt der Breite (Füllung).',
    'gross',
  ],
  [
    'cam-path8',
    'Mehrere Werkzeuge in einem Programm',
    'Zum Beispiel V-Fräser für die Schrift und Schaftfräser für den Ausschnitt, mit Werkzeugwechsel.',
    'gross',
    { want: true, building: true },
  ],
  [
    'cam-path9',
    'Trochoidal schruppen',
    'Kreisende Bahn mit kleiner Eingriffsbreite für Hartholz und Metall.',
    'gross',
  ],
  [
    'cam-path10',
    'Fläche planfräsen',
    'Opferplatte oder Rohteil planen, mit Muster und Überlappung.',
    'klein',
  ],
  [
    'cam-path11',
    'Fahrwege kürzen',
    'Reihenfolge der Teile so wählen, dass die Eilgänge möglichst kurz werden.',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-path12',
    'Tiefe und Materialdicke je Teil',
    'Jedes Teil mit eigener Materialdicke und eigenem Z-Versatz (Stufen im Rohteil).',
    'klein',
  ],
  [
    'cam-path13',
    'Einstieg nur außerhalb des Teils',
    'Bei Ausschnitten außerhalb der Kontur einstechen, wo der Verschnitt liegt.',
    'klein',
  ],
]);
add('cam', 'Prüfen & Simulieren', [
  [
    'cam-sim1',
    'Abtrag simulieren',
    '3D-Vorschau des Ergebnisses: was bleibt stehen, wo liegen Stege, was wird zu tief.',
    'gross',
  ],
  [
    'cam-sim2',
    'Zeit und Materialverbrauch',
    'Geschätzte Fräszeit je Teil und für alles, Länge der Schnitte, Anzahl der Werkzeugwechsel.',
    'klein',
  ],
  [
    'cam-sim3',
    'Warnung, wenn ein Teil über das Rohteil ragt',
    'Rot markieren, mit Maß, wie weit es herausragt.',
    'klein',
  ],
  [
    'cam-sim4',
    'Eilgang gestrichelt zeigen',
    'In der Vorschau Eilgänge anders zeichnen als Schnitte.',
    'klein',
  ],
]);
add('cam', 'Import, Export, Projekt', [
  [
    'cam-io1',
    'Zeichnung als SVG oder DXF ausgeben',
    'Die aktuelle Zeichnung für andere Programme speichern.',
    'klein',
  ],
  [
    'cam-io2',
    'Weitere Formate lesen',
    'PDF-Vektoren, HPGL und Konturen aus STL-Schnitten.',
    'gross',
  ],
  [
    'cam-io3',
    'Vorlagen-Bibliothek',
    'Häufige Teile (Untersetzer, Schlüsselbrett, Schilder) als Vorlage mit Maßen zum Einstellen.',
    'gross',
  ],
  [
    'cam-io4',
    'Mehrere Zeichnungen gleichzeitig',
    'Zeichnungen in Reitern, Teile zwischen ihnen kopieren.',
    'gross',
  ],
  [
    'cam-io5',
    'Benannte Teile und Nummern',
    'Jedes Teil bekommt einen Namen; auf Wunsch eine Nummer im Bild und im Programmkopf.',
    'klein',
  ],
]);
add('cam', 'Komfort', [
  [
    'cam-ux1',
    'Kontextmenü',
    'Langes Tippen oder Rechtsklick auf ein Teil: Kopieren, Löschen, Gruppieren, Ausrichten.',
    'klein',
  ],
  ['cam-ux2', 'Zoom auf Auswahl', 'Ansicht passt sich dem gewählten Teil an.', 'klein'],
  [
    'cam-ux3',
    'Messen in der Zeichnung',
    'Abstand zwischen zwei Punkten der Zeichnung ablesen, ohne etwas zu verändern.',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-ux4',
    'Farben als Bearbeitungsgruppen',
    'Teile einer Farbe teilen sich Tiefe, Werkzeug und Reihenfolge (wie die Farbzuordnung in Estlcam).',
    'klein',
    { want: true, building: true },
  ],
  [
    'cam-ux5',
    'Verlauf der Änderungen',
    'Rückgängig-Liste mit Namen der Schritte, Sprung zu einem früheren Stand.',
    'klein',
  ],
  [
    'cam-ux6',
    'Kopieren zwischen Projekten',
    'Teile in die Zwischenablage legen und in einem anderen Projekt einfügen.',
    'klein',
  ],
]);
add('cam', 'Schon da', [
  [
    'cam-have1',
    'Formen, Text, SVG, DXF; Griffe, Drehen, Spiegeln, Reihen und Spalten',
    'Zeichnen wie in einem Zeichenprogramm, mit Maßen als Zahlen, Rückgängig/Wiederholen und Tasten.',
    'vorhanden',
    { done: true },
  ],
  [
    'cam-have2',
    'Dogbone und T-Bone, Schlichtzugabe, innen vor außen',
    'Ecken freischneiden, Schruppen und Schlichten, sinnvolle Reihenfolge.',
    'vorhanden',
    { done: true },
  ],
  [
    'cam-have3',
    'Beidseitig fräsen, Serien auf Rohlingen, Teile in Abschnitten',
    'Abläufe, die die Kamera nutzen.',
    'vorhanden',
    { done: true },
  ],
  [
    'cam-have4',
    'Projekt speichern und öffnen',
    'Zeichnung als Datei sichern, strikt gelesen, in einem Schritt rückgängig.',
    'vorhanden',
    { done: true },
  ],
]);

// ───────────────────────── Ideen mit Kamera
add('ideen', 'Im Werkstattalltag', [
  [
    'k1',
    'Job aufs Material schieben',
    'Tisch scannen, Job auf dem Foto schieben und drehen: Reststücke nutzen, Astlöcher und Schrauben umgehen, Maserung ausrichten. Für Gezeichnetes geht es schon; offen ist fertiger G-Code aus anderen Programmen.',
    'klein',
  ],
  [
    'k2',
    'Nullpunkt per Fingertipp',
    'Werkzeug „Nullpunkt“ auf Tisch und Kamera: Ecke antippen, Lupe mit Feinschritten, zwei Punkte an der Kante richten eine schiefe Platte aus.',
    'vorhanden',
    { done: true, want: true },
  ],
  [
    'k3',
    'Messen per Fingertipp',
    'Zwei Punkte antippen, Abstand, ΔX/ΔY und Winkel; im Livebild rastet der Tipp auf Löcher ein. Etwa 0,2–0,5 mm genau.',
    'vorhanden',
    { done: true, want: true },
  ],
  [
    'k4',
    'Spannmittel markieren',
    'Antippen, schieben, Größe und Höhe; Warnung mit Namen, wenn Fräsbahn oder Eilfahrt darüber oder hindurch geht.',
    'vorhanden',
    { done: true, want: true },
  ],
  [
    'k5',
    'Auf vorhandene Teile weiterarbeiten',
    'Zwei Bohrungen finden, der Job dreht sich passend.',
    'vorhanden',
    { done: true },
  ],
  [
    'k6',
    'Beidseitig fräsen',
    'In „Zeichnen“ der Schalter „Von beiden Seiten fräsen“; der Job-Raum führt durchs Wenden. Braucht die Y-Achse; an der Maschine noch erproben.',
    'vorhanden',
    { done: true, want: true },
  ],
  [
    'k7',
    'Nachricht mit Foto',
    '„Job fertig“ oder „Alarm“ kommt mit Kamerabild aufs Handy.',
    'klein',
  ],
  [
    'k8',
    'Job-Tagebuch',
    'Foto vorher und nachher, Zeitraffer und Werte zu jedem Job in der Historie.',
    'klein',
  ],
]);
add('ideen', 'Die Kuh fliegt', [
  [
    'k9',
    'Vorlage abfräsen',
    'Schablone, kaputtes Teil oder Edding-Skizze scannen, Kontur erkennen lassen, als Fräsbahn ins CAM, Kopie fräsen.',
    'gross',
  ],
  [
    'k10',
    'Seriengravur auf verstreuten Rohlingen',
    'In „Zeichnen“ „Serie: auf Rohlinge verteilen“: scannen, Rohlinge finden, Motiv oder Namensliste auf alle.',
    'vorhanden',
    { done: true, want: true },
  ],
  [
    'k11',
    'Vorrichtungen mit Markern',
    'Extras → „Vorrichtungen mit Markern“: Marker drucken, Vorrichtung einmal anlernen; danach erkennt die Kamera sie, misst ein und lädt den Job.',
    'vorhanden',
    { done: true, want: true },
  ],
  [
    'k12',
    'Höhe messen mit Laserlinie',
    'Schräger Linienlaser neben der Kamera: Materialdicke, Höhenkarte für Gravuren auf welligem Holz, Reliefs scannen.',
    'gross',
  ],
  [
    'k13',
    'Teile länger als der Tisch',
    'Die Prüfliste bietet „In Abschnitten fräsen“ an: Abschnitt fräsen, zwei Marker aufkleben, schieben, Kamera findet das Teil wieder.',
    'vorhanden',
    { done: true, want: true },
  ],
  [
    'k14',
    'Optischer Werkzeugcheck',
    'Makrokamera prüft vor dem Job: Fräser gebrochen, Durchmesser, Länge.',
    'forschung',
  ],
  [
    'k15',
    'Soll-Ist-Vergleich',
    'Nach dem Job scannen und mit dem Plan vergleichen: fehlende Schnitte, abgebrochene Haltestege.',
    'forschung',
  ],
]);

// ───────────────────────── Bedienung
add('bed', 'Abläufe', [
  [
    'u1',
    'Die 5 häufigsten Abläufe festlegen',
    'Was wird wirklich oft gefräst? Jeden Ablauf durchgehen und die Schritte zählen.',
    'aufgabe',
  ],
  [
    'u2',
    'Tisch-Ansicht statt vieler Umschalter',
    'Bühne mit Tisch / Kamera / 3D; die Draufsicht ist die Fotokarte mit Job und Fräser.',
    'vorhanden',
    { done: true, want: true },
  ],
  [
    'u3',
    'Nur zeigen, was gerade geht',
    'Ohne Pi kein Mitschnitt, ohne Sensor kein Lastbalken, ohne kalibrierte Kamera nur „Kamera einrichten“.',
    'klein',
  ],
  [
    'u4',
    'Job-Raum nur als Ablauf',
    'Material und Nullpunkt → Prüfen → Fräsen. Kamera als Werkzeug im ersten Schritt.',
    'klein',
  ],
  [
    'u5',
    'Experimentelles ausblenden',
    'Spindellast, Rattererkennung, adaptiver Vorschub, Autolevel unsichtbar, bis die Hardware da ist.',
    'klein',
  ],
  [
    'u6',
    'Feature-Stopp',
    'Keine neuen Funktionen, bis die Kernabläufe sich selbstverständlich anfühlen.',
    'aufgabe',
  ],
  ['u7', 'Mehrere Dateien auf einmal laden', 'Aus dem Umbau-Guide, noch nicht gebaut.', 'klein'],
  [
    'u8',
    'Nach Operation pausieren',
    'Das Programm hält nach einer gewählten Operation an.',
    'klein',
  ],
  [
    'u9',
    'Probelauf in der Luft (Z-Versatz)',
    'Das Programm einmal mit angehobenem Z durchfahren.',
    'klein',
  ],
  ['u10', 'Overrides für die Spindel', 'Spindeldrehzahl während des Laufs verändern.', 'klein'],
  ['u11', 'Eigene Tastenbelegung', 'Tasten selbst festlegen.', 'klein'],
  [
    'u12',
    'Schnellsuche: Treffer in Inhalten',
    'Werkzeuge, Materialien, SD-Dateien, Makros und $-Einstellungen mit der Schnellsuche finden.',
    'klein',
  ],
  ['u13', 'Nullpunkt hat fünf Eingänge', 'Einen Weg wählen, die anderen zeigen dorthin.', 'klein'],
]);

// ───────────────────────── Pi
add('pi', 'Pi und Betrieb', [
  [
    'p1',
    'Pi per USB-Kabel am Jackpot',
    'Robuste Verbindung zur Maschine statt WLAN; das Tablet hängt nur noch an der Anzeige.',
    'gross',
  ],
  [
    'p2',
    'Pi überwacht jeden Job',
    'Nachricht und Historie auch, wenn Tablet oder PC schlafen.',
    'klein',
  ],
  [
    'p3',
    'Streaming vom Pi statt vom Browser',
    'Zeilenweises Senden so zuverlässig wie der SD-Start.',
    'gross',
  ],
  [
    'p4',
    'Automatische Sicherungen',
    'FluidNC-Konfiguration, Datenbank und Jobs regelmäßig sichern, vor jeder Config-Änderung.',
    'klein',
  ],
  [
    'p5',
    'Wartungszähler',
    'Betriebsstunden und gefahrene Meter pro Achse, mit Erinnerung an Riemen und Lager.',
    'klein',
  ],
  [
    'p6',
    'Mikrofon für Rattern und Bruch',
    'USB-Mikrofon als Ergänzung zum Vibrationssensor.',
    'forschung',
  ],
  [
    'p7',
    'Zweiter Kamera-Stream',
    'Makrokamera am Fräser als zweite Ansicht, im Mitschnitt mit Zeitlupe.',
    'klein',
  ],
  [
    'p8',
    'Jackpot vom Pi aus neu starten',
    'Relais in der 24-V-Leitung, wenn er nach einem Stromausfall nicht im WLAN ist.',
    'klein',
  ],
]);

// ───────────────────────── Hardware
add('hw', 'Hardware', [
  [
    'h1',
    'Licht an der Kamera',
    'LED-Ring oder Streifen, gestreut. Hilft Bilderkennung und Video, verkürzt die Belichtung.',
    'hardware',
  ],
  [
    'h2',
    'Linienlaser für Höhenmessung',
    'Eine einzelne Linie, 1–5 mW, 5 V, fokussierbar, 12 mm. Schräg zur Kamera montiert, vom Pi schaltbar.',
    'hardware',
  ],
  [
    'h3',
    'Tastplatte für Z0',
    'Für den genauen Z-Nullpunkt bleibt die Tastplatte die beste und günstigste Lösung.',
    'hardware',
  ],
  [
    'h4',
    'Pi am 24-V-Netzteil',
    'Step-Down 24 V → 5,1 V, USB-C, mindestens 3 A, mit Sicherung 1–2 A in der Plusleitung.',
    'hardware',
  ],
  [
    'h5',
    'Y-Achse fertig bauen',
    'Erst dann gehen Scan als Fläche, Bohrungen zentrieren und „hierhin“ abseits der Linie.',
    'hardware',
  ],
]);

// ───────────────────────── Testen & offen
add('test', 'An der Maschine', [
  [
    'o1',
    'Not-Halt-Verdrahtung klären',
    'Trennt er die Netzteilspannung oder ist er nur ein Signal an FluidNC? Entscheidet, wo der Pi seinen Strom bekommt.',
    'aufgabe',
  ],
  ['o2', 'Netzteil-Leistung notieren', 'Wie viel Ampere hat das 24-V-Netzteil?', 'aufgabe'],
  [
    'o3',
    'Kamera genau kalibrieren',
    'Nach fester Halterung: Kamerahöhe, Maßstab, Versatz, dann Kurztest „Fräser hierhin“.',
    'aufgabe',
  ],
  [
    'o4',
    'Fotokarte als Streifen testen',
    'Nach der Kalibrierung: Lineal-Zahlen müssen über die Bildgrenzen durchlaufen.',
    'aufgabe',
  ],
  [
    'o5',
    'Mitschnitt am echten Job testen',
    'Zeitraffer und Video, Abspielen auf dem iPad.',
    'aufgabe',
  ],
  [
    'o6',
    'VMware-Adressbereich ändern',
    'VMnet8 nutzt 192.168.178.1, denselben Bereich wie die Fritzbox. Bei Netzproblemen umstellen.',
    'aufgabe',
  ],
  [
    'o7',
    'Streifen-Scan an der Maschine erproben',
    'Mit Aufzeichnung fahren, Verzögerung und Unschärfe messen, Ergebnis auswerten (docs/scan.md).',
    'aufgabe',
  ],
  [
    'o8',
    'Genauigkeits-Check mit Lineal fahren',
    'Vier Punkte bohren, sechs Abstände messen, Korrektur schreiben, Kontrollmessung (README, Abschnitt Genauigkeit).',
    'aufgabe',
  ],
  [
    'o9',
    'Messprotokoll der Kamera ausfüllen',
    'docs/messprotokoll-kamera.md: Maßstab, Wiederholbarkeit, Versatz.',
    'aufgabe',
  ],
]);

add('cam', 'Haltestege', [
  [
    'cam-tab9',
    'Angehobene Strecken im Werkzeugweg zeigen',
    'In der Vorschau des Werkzeugwegs (Tisch und 3D) die Strecken anders zeichnen, auf denen der Fräser über einem Steg angehoben ist. Bisher zeigt nur die Zeichnung die Stege.',
    'klein',
  ],
]);

add('cam', 'Auswählen & Anordnen', [
  [
    'cam-sel13',
    'Beziehungen festhalten',
    'Teile an Regeln binden, die beim Ändern bestehen bleiben: ein Loch bleibt mittig im Teil, ein Abstand bleibt 10 mm, zwei Teile bleiben bündig, auch wenn eines größer wird (wie Einschränkungen in CAD).',
    'gross',
  ],
  [
    'cam-sel14',
    'Haltestege-Feld schiebt die Liste beim Abhaken',
    'Das Feld der Haltestege klappt unter dem ersten abgehakten Teil auf und schiebt die Zeilen darunter um etwa 380 px. Lösung: das Feld erst auf Wunsch öffnen oder aus der Zeile herausnehmen.',
    'klein',
    { want: true, building: true },
  ],
]);
add('cam', 'Zeichnen & Formen', [
  [
    'cam-draw11',
    'Verbindungen erzeugen',
    'Zinken, Schlitz und Zapfen, Nut und Feder als Vorlage mit Maßen: erzeugt beide Teile passend zur Materialstärke und zum Fräserdurchmesser.',
    'gross',
  ],
]);
add('cam', 'Bahnen & Strategien', [
  [
    'cam-path14',
    'Flächen schraffieren',
    'Eine geschlossene Form mit Linien füllen (Gravur mit kleinem Fräser oder V-Fräser), mit Abstand und Winkel.',
    'klein',
  ],
  [
    'cam-path15',
    'Fase mit V-Fräser entlang der Kontur',
    'Eine Kante anfasen: der V-Fräser fährt die Kontur ab, die Tiefe bestimmt die Fasenbreite.',
    'klein',
  ],
]);

add('test', 'An der Maschine', [
  [
    'o10',
    'Scan mit Pi-Takt an der Maschine erproben',
    'Mit dem Pi als Weiterleitung scannen und im Panel nachsehen, welche Uhr lief und warum nicht die des Pi, falls nicht. Offen sind die echte ustreamer-Version, der iPad-Safari mit dem Kamerastrom und die echte Streuung (die beiden curl-Befehle stehen in docs/scan.md).',
    'aufgabe',
  ],
  [
    'o11',
    'Aufzeichnung: einmal fehlten Ankerbilder im Zip',
    'In einem von etwa sieben Läufen fehlten drei Ankerbilder in der Aufzeichnung, obwohl nichts verworfen wurde; Ursache offen, nicht wieder aufgetreten. Wenn es an der Maschine passiert: die Aufzeichnung behalten und melden.',
    'aufgabe',
  ],
]);

add('scan', 'Position der Aufnahmen (Timing)', [
  [
    'tim-h',
    'Verstreute Tischmarken als Ankerpunkte',
    'Kleine gedruckte Marken (wie die der Vorrichtungen) fest auf der Opferplatte verteilen, einmal einmessen und speichern. Im Scan kennt jedes Bild mit einer Marke seine Position absolut: die Verzögerung lässt sich mitten im Lauf lernen, Maßstabsfehler werden korrigiert, und auf einem Brett ohne Maserung hat die Bildzuordnung einen Halt. Dünn halten (Papier), weil die App die Höhe der Marke nicht herausrechnet; es gibt nur 48 Nummern, nicht in jedem Bild muss eine liegen.',
    'gross',
  ],
]);

add('cam', 'CAM Funktionen', [
  [
    'u-mwxlpobg',
    'Schrift',
    'Überarbeiteter Texteditor, Auswahlmöglichkeiten verschiedener Schriftarten (Eintrag des Betreibers).',
    'klein',
    { want: true, building: true },
  ],
]);

export const ITEMS = A.map((it, i) => ({ ...it, order: i }));
export const KINDS = {
  vorhanden: 'vorhanden',
  klein: 'kleiner Schritt',
  gross: 'größeres Projekt',
  forschung: 'Forschung',
  hardware: 'Hardware',
  aufgabe: 'Aufgabe',
};
