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
    'Das Bild wird gemacht, sobald Position und Bild ruhig sind, nicht nach fester Pause. Schneller, ohne Uhr. Gebaut mit Beleg: nur wo die Bilder selbst zeigen, dass sie frisch sind (Rauschen der Kamera, die Fahrt im Bild gesehen, ruhig über mindestens 150 ms, nicht vor der auf den ersten drei Punkten gelernten Zeit), sonst die feste Zeit wie bisher; die Serie bleibt bei der festen Zeit. Im Simulator fiel die Pause je Bild bei einer Kamera ohne Verzögerung von etwa 1,0 s auf 0,2 s, wo ein Beleg da ist (auf dem Tisch des Simulators kam er erst beim 26. Bild, vermutlich weil die ersten Reihen über blanker Fläche lagen – nicht gemessen; der Scan eines 725 × 290 mm großen Tisches dauerte statt 204 s noch 170 s); bei 0,8 s Verzögerung lag mit fester Zeit ein Bild 1,8 mm daneben, mit Wartezeit keines. An der echten Kamera ist weder der Gewinn noch die Empfindlichkeit gemessen. Grenzen: Ein Bild, das bei der festen Zeit die Fahrt nicht zeigt, wird bei der festen Zeit genommen (und kann von vor dem Halt sein); eine Kamera, die mehrere Sekunden zu spät ist, kann einen älteren Halt als Beleg zeigen (im Simulator bei 5 s: 2 von 8 Bildern 52 mm daneben) – beides tim-j; ein Bild, das bei der längsten Wartezeit noch im Wandel war, wird aufgelegt und einmal je Scan gemeldet (tim-i).',
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
    'Der Companion setzt Belichtung und Verstärkung über v4l2 (Karte in den Kameraeinstellungen), statt per SSH. Gebaut und gegen eine nachgebaute Kamera getestet (eine Attrappe von v4l2-ctl, die Ausgabe nach dem Format von v4l-utils 1.22 geschrieben, nicht von einer Kamera aufgenommen); an einer echten Kamera und mit einem echten v4l2-ctl nicht geprüft – ob ein zweiter Prozess Regler setzen darf, während ustreamer das Gerät hält, und ob die Werte einen Neustart von ustreamer überstehen, ist offen (blur-g).',
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
    'Schalter „Mehrfachauswahl“: ein Tipp auf dem Tisch nimmt ein Teil in die Auswahl oder heraus, ein Tipp daneben lässt sie, wie sie ist; ein Häkchen vor jeder Zeile der Liste tut dasselbe; „Alles auswählen“ und „Auswahl umkehren“ stehen bei der Auswahl. Umschalt/Strg+Tipp und Rahmen aufziehen: cam-sel8, cam-sel9.',
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
    'Auge je Teil: ausgeblendete Teile werden nicht gefräst und stören nicht beim Anordnen. Gebaut: Das Programm erwähnt ein ausgeblendetes Teil nicht (eingeblendet ist es wieder dasselbe Programm, Byte für Byte); auf dem Tisch steht es gestrichelt und blass, lässt sich dort nicht antippen und fehlt bei „Alles auswählen“, „Auswahl umkehren“ und beim Ausrichten; in der Liste bleibt es, abgeblendet, und lässt sich dort wählen und wieder einblenden („Alle einblenden“ steht unter der Liste). Eine Gruppe ist starr: Ein ausgeblendetes Teil einer Gruppe mit sichtbaren Teilen rückt mit. Die Projektdatei merkt es sich (optionales „hidden“, Version 1). Kein ausgeblendetes Teil schlägt Passlöcher vor oder zählt bei den Hinweisen zum Wenden.',
    'klein',
    { want: true, done: true },
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
    'Am Rechner mit Umschalt oder Strg (Cmd) auf ein Teil tippen nimmt es in die Auswahl oder heraus, ohne den Schalter „Mehrfachauswahl“ anzufassen; Umschalt/Strg und Ziehen auf einem Teil der Auswahl nimmt die ganze Auswahl mit. Gebaut: Die Gestenschicht gibt die Tasten an Tippen und Greifen weiter, aber nur wo eine gehalten ist; der Schalter selbst wird nie umgelegt. Die Tastenliste führt es. Das Mausrad mit Strg (Pinch) bleibt Zoom.',
    'klein',
    { want: true, done: true },
  ],
  [
    'cam-sel9',
    'Rahmen aufziehen',
    'Mit Finger oder Maus einen Rahmen über mehrere Teile ziehen; alles, was er berührt, wird gewählt. Gebaut als Schalter „Rahmen aufziehen“: Beim Loslassen kommen die Gruppen aller sichtbaren Teile in die Auswahl, deren eigener Umriss den Rahmen berührt (Passlöcher und ausgeblendete Teile nie); mit „Mehrfachauswahl“ oder gehaltener Umschalt-/Strg-Taste kommen sie dazu, sonst ersetzen sie die Auswahl. Ein zweiter Finger und ein verlorener Finger nehmen nichts in die Auswahl (am iPad-Lauf mit echten Berührungen geprüft). Solange der Schalter an ist, zieht ein Finger oder die Maus nie ein Teil, sondern immer einen Rahmen; die Ansicht verschieben geht dann mit zwei Fingern, das Doppeltippen zum Einpassen fällt weg („Einpassen“ bleibt).',
    'klein',
    { want: true, done: true },
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
    'Beim Schieben rastet ein Teil an Kanten und Mitten anderer Teile und am Rohteil ein, mit sichtbarer Hilfslinie. Gebaut als Schalter „Fangen“ (an, das Gerät merkt es sich): Das Teil – oder die ganze Auswahl als ein Kasten – rastet mit links, rechts und mittig (unten, oben, mittig) an der gleichen Linie des Kastens einer anderen Gruppe oder des eingegebenen Rohteils ein, wenn sie näher als 8 Bildschirmpunkte kommt (bei jedem Zoom gleich); x und y getrennt, das nächste gewinnt. Wo nichts nahe ist, gilt das Raster Bit für Bit wie bisher (eine einzige Rundung, in snapMove). Ziel sind nie Passlöcher, ausgeblendete Teile oder Teile der Auswahl; ein ausgeblendetes Teil der bewegten Gruppe zählt nicht mit (gemessen wird der Kasten der Teile, die nicht ausgeblendet sind; das Raster behält den Kasten der ganzen Gruppe); ein Passloch allein rastet nirgends ein. Der Schalter steht zusammen mit „Abstände zeigen“ eingeklappt unter „Fangen und Abstände“. Die gestrichelte Hilfslinie in der Auswahlfarbe steht nur, solange der Finger unten ist. Am Rechner schaltet die Alt-Taste (Option) das Einrasten für einen Zug aus (auch mitten im Zug). Bewusst nur gleiche Linien (links an links, Mitte an Mitte): Kante an Gegenkante würde Teile ohne Fräserraum aneinanderlegen – cam-snap5. Fangen beim Ändern der Größe und Drehen mit den Griffen: cam-snap4. Im Browser mit Maus und mit echten Berührungen geprüft; nicht an der Maschine.',
    'klein',
    { want: true, done: true },
  ],
  [
    'cam-snap2',
    'Abstände zwischen Teilen anzeigen',
    'Beim Schieben erscheinen die Maße zu den Nachbarn (wie bei Illustrator). Gebaut als eigener Schalter „Abstände zeigen“ (an, das Gerät merkt es sich; unabhängig von „Fangen“): Beim Ziehen steht auf jeder Seite, wo ein Nachbarteil gegenüberliegt (er überlappt in der anderen Achse), eine Maßlinie mit der Zahl in Millimetern („12,3 mm“, Monoschrift, neben der Linie, nicht unter dem Finger). Berührende Kästen haben 0, überlappende keinen Abstand; Teile, die sich nur an einer Ecke treffen, sind keine Nachbarn. Sind zwei Abstände gegenüber gleich (auf 0,05 mm), stehen beide in der Auswahlfarbe und tragen ein „=“. Nicht gebaut: der Abstand zum Rohteilrand (cam-snap6).',
    'klein',
    { want: true, done: true },
  ],
  [
    'cam-snap4',
    'Fangen auch beim Ändern der Größe und Drehen',
    'Die Griffe der Auswahl rasten an denselben Linien ein wie das Schieben (Größe an Kanten und Mitten, Drehen an den Winkeln anderer Teile). Bisher rastet nur das Schieben; die Griffe nutzen weiter ihr Raster und die 15°-Schritte.',
    'klein',
  ],
  [
    'cam-snap5',
    'Fangen mit Abstand (Kante an Gegenkante)',
    'Teile nebeneinanderlegen: Eine Kante rastet an der Gegenkante eines Nachbarn ein, aber nicht auf 0, sondern mit einem einstellbaren Abstand (zum Beispiel Fräserdurchmesser + 2 mm). Bisher rasten nur gleiche Linien; Kante an Gegenkante würde ohne Abstand Teile aneinanderlegen, die der Fräser nicht trennen kann.',
    'klein',
  ],
  [
    'cam-snap6',
    'Abstand zum Rohteilrand beim Ziehen',
    'Beim Ziehen auch das Maß zu den vier Rändern des Rohteils zeigen (der Rand, der stehen bleibt), wo ein Rohteil eingegeben ist. Die Abstände zeigen bisher nur Nachbarteile.',
    'klein',
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
    'Der Knopf „Verschachteln“ im Feld „Ausrichten und verteilen“ packt die ausgewählten Teile auf das Rohteil – nach ihren RECHTECKIGEN RAHMEN, nicht nach ihren Umrissen: Formen greifen nicht ineinander, ein L oder ein Ring nimmt den ganzen Rahmen, und was in den Ecken bleibt, bleibt frei. Das Verfahren ist ein einfaches Packen (MaxRects), ein gutes Ergebnis, nicht das beste; es probiert vier Reihenfolgen und nimmt, was am meisten Fläche unterbringt. Es braucht ein eingegebenes Rohteil (Job → Rohteil; ohne ist der Knopf zu, mit Grund) und einen Abstand zwischen den Teilen (ohne Eingabe: Fräserdurchmesser + 2 mm). Drehen ist freiwillig und nur um 90°; erlaubt, ist das Ergebnis nie schlechter als ohne. Zum Rand des Rohteils bleibt kein Abstand, ein Fräser, der außen um ein Teil am Rand läuft, geht um seinen Radius über das Rohteil hinaus. Was ganz im Rahmen eines gepackten Teils liegt (ein Loch in der Platte), geht mit ihm, auch wenn es nicht ausgewählt oder ausgeblendet ist. Wo die Regel aufhört (im Test festgehalten): ein Teil, das nur in den Rahmen hineinragt (eine Kerbe quer über den Rand der Platte), zählt als eigenes Teil und wird getrennt gepackt – vorher mit der Platte gruppieren; Löcher, die ohne ihre Platte ausgewählt sind, werden aus ihr herausgepackt. Was nicht ausgewählt ist und in keinem Rahmen liegt, bleibt, wo es ist – und kann dann unter gepackten Teilen liegen. Ein Teil ohne Platz bleibt liegen und steht mit Namen in der Antwort der Karte. Ein Schritt zum Rückgängigmachen; ändert sich nichts, wird nichts gemerkt. Bei zwei Seiten gehören Vorder- und Rückseite eines Teils vorher in eine Gruppe.',
    'gross',
    { want: true, done: true },
  ],
  [
    'cam-arr3',
    'Reihenfolge der Bearbeitung von Hand',
    'Für ein ausgewähltes Teil: Früher, Später, Automatisch und für alle „Reihenfolge zurücksetzen“; die Karte sagt „Schnitt 2 von 5 (Bohrungen)“, in der Liste trägt jedes Teil mit Nummer ein kleines „Nr. n“. Die Nummer gilt nur unter Teilen, die gleich gefräst werden (Bohrungen, Taschen, Gravuren, Innenkonturen, Außenkonturen): Teile mit Nummer kommen zuerst, die übrigen danach nach Fahrweg. Die Reihenfolge der Arten und „was in einer Kontur liegt, kommt vor ihr“ bleiben immer; wo eine Nummer das bräche, kommt das Teil später und ein Hinweis sagt es. Eine Nummer wird in der Projektdatei gespeichert (0 bis 9999). Ziehen in der Liste ist nicht gebaut (cam-arr4).',
    'klein',
    { want: true, done: true },
  ],
  [
    'cam-arr4',
    'Reihenfolge durch Ziehen in der Liste',
    'Teile in der Liste mit dem Finger verschieben, statt „Früher“ und „Später“ zu tippen. Ein Griff in der Zeile, der die Zeilenhöhe nicht ändert und beim Ziehen nichts Falsches anfasst.',
    'klein',
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
    'Das Langloch gab es schon vorher. Neu: ein Rechteck mit einem Radius je Ecke (vier Felder unter „Ecken einzeln“; das Feld „Eckenradius“ setzt alle vier gleich und sagt „verschieden“, wenn sie es nicht sind; ein Radius ist höchstens die halbe kürzere Seite), Ellipse (zwei Radien; zwei gleiche sind ein Kreis), Stern (3 bis 32 Spitzen, Außen- und Innenradius), Zahnrad (6 bis 80 Zähne, Außen- und Fußradius) und Spirale (archimedisch, 0,25 bis 50 Windungen, eine offene Linie). Das Zahnrad hat Trapezzähne und KEIN Evolventenprofil: es sieht aus wie ein Zahnrad und fräst sich als Zahnscheibe, Kettenrad oder Knauf – die Zähne rollen nicht aufeinander ab, zwei davon sind kein Getriebe (cam-draw12). Alle Kurven sind Streckenzüge höchstens 0,01 mm von der wahren Kurve. Ellipse, Stern und Zahnrad werden wie jede Außenkontur geschnitten (außen, mit Stegen); die Spirale wird graviert (auf der Linie, ohne Stege). Die vier Formen stehen zugeklappt unter „Weitere Grundformen“ in der Karte „Zeichnen“. Stern, Zahnrad und Spirale behalten beim Ziehen am Griff ihr Seitenverhältnis und hören auf zu wachsen oder zu schrumpfen, wo ein Maß das Ende seines Bereichs (Radius 0,25 bis 2500 mm) erreicht – sie bleiben, was sie sind. Bekannte Grenze: Gibt man ein Maß ein zweites Mal hintereinander jenseits seines Bereichs ein, bleibt die getippte Zahl im Feld stehen, obwohl Zeichnung, Beschriftung und Datei den Wert des Bereichs haben. Die Projektdatei speichert und liest alle (ein Maß außerhalb des Bereichs wird so gespeichert, wie es gezeichnet ist; ein Maß, das keine Zahl ist oder jenseits des Bereichs liegt, lässt die Skizze weg, die Konturen bleiben). Ein Rechteck mit Eckenradien über 5 m verliert beim Öffnen seine Skizze; die fünf älteren Arten behalten sie wie bisher auch über 5 m.',
    'klein',
    { want: true, done: true },
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
    'Beim automatischen Verteilen rückt ein Steg, der den Fräser über eine Ecke heben würde, auf den nächsten freien Platz zwischen zwei Ecken (gemessen an der Bahn des Fräsers, nicht an der gezeichneten Linie). Kleine Teile ohne ein langes genug gerades Stück und Rundungen behalten ihre gleichmäßigen Plätze; verschoben wird nur die gleichmäßige Verteilung, ein von Hand gesetzter Steg nie. Ein Haken im Stegfeld des Teils und der Standard der Zeichnung unter „Erweitert“; beim Start der Anwendung an (wer eine ältere Datei öffnet, behält deren Werte für die nächsten Zeichnungen der Sitzung, wie bei jeder anderen Einstellung); eine gespeicherte Datei ohne die Angabe wird wie bisher gefräst (aus). Die Markierung auf dem Tisch und der Schnitt fragen dieselbe Funktion der Bibliothek.',
    'klein',
    { want: true, done: true },
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
    'Helix zum Eintauchen',
    'Eintauchen in eine Tasche je Teil: Rampe (wie bisher), Helix oder gerade. Die Helix bohrt in jeder Zustellung ein Loch von 1,5 × Fräser (einstellbar von Fräser + 0,5 mm bis 2 × Fräser), das mit der Schlichtzugabe in die Tasche und außerhalb ihrer Inseln liegen muss; passt es nicht, wird mit der Rampe eingetaucht und ein Hinweis („gefräst, aber anders“) sagt es. „Gerade“ sticht mit der ganzen Fräserbreite ins volle Material und gehört nur zu einem Fräser, der in der Mitte schneidet. Vorbohren an einem Punkt ist nicht gebaut (cam-path16).',
    'klein',
    { want: true, done: true },
  ],
  [
    'cam-path5',
    'Bohren mit Spanbrechen',
    'Tiefe Bohrungen in Stufen (ab 0,05 mm): ohne Rückzug fährt der Fräser nach jeder Stufe ganz hoch und mit Eilgang in sein Loch zurück, mit „Rückzug“ nur so weit hoch (Spanbrechen). Nur für Löcher im Werkzeugdurchmesser; ein größeres Loch wird in einer Helix gefräst und sagt es als Hinweis. Zentrieren vor dem Bohren ist nicht gebaut (cam-path17).',
    'klein',
    { want: true, done: true },
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
    'Die Reihenfolge der Teile einer Art (etwa aller Bohrungen) wird mit einem 2-opt-Verfahren verkürzt, wo die Regeln es erlauben (Art vor Art, Inneres vor der Kontur, nummerierte Teile zuerst); benutzt wird sie nur, wenn der Eilgang im fertigen Programm wirklich kürzer ist als bei „nächstes zuerst“ – nie länger. Das Suchen hat ein festes Budget und hört bei sehr vielen Teilen früher auf. Ein Haken unter „Erweitert“; beim Start der Anwendung an (wer eine ältere Datei öffnet, behält deren Werte für die nächsten Zeichnungen der Sitzung), eine gespeicherte Datei ohne die Angabe wird wie bisher gefräst (aus). Gemessen im Test (vitest auf diesem Rechner, kein Browser, kein iPad): ein Programm aus 300 Löchern 37 ms, aus 300 Außenkonturen mit Stegen 256 ms.',
    'klein',
    { want: true, done: true },
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
    'Abstand zwischen zwei Punkten der Zeichnung ablesen, ohne etwas zu verändern. Gebaut als Betriebsart „Messen“ (Schalter wie „Mehrfachauswahl“ und „Rahmen aufziehen“, aus beim Schließen der Zeichnung, kein Schritt für „Rückgängig“): Ein Tipp auf den Tisch setzt Punkt A, der nächste Punkt B, ein dritter beginnt neu. Die Punkte rasten nur an klaren Merkmalen ein – Ecken (Abknick ab 30°), Mitten gerader Kanten, Kreismitten, auch von Passlöchern und der Rückseite, nicht von ausgeblendeten Teilen – sonst bleiben sie, wo sie gesetzt wurden; mit der Alt-Taste (Option) sind sie frei. Ein Finger auf einem Punkt verschiebt ihn; ein Doppeltipp setzt keine zwei Punkte, sondern nimmt den ersten Tipp zurück und passt die Ansicht an. Auf dem Tisch stehen Linie, Abstand, ΔX, ΔY und der Winkel (gegen den Uhrzeigersinn von der X-Achse, Y nach hinten), in der Karte dieselben Zahlen und „Messung löschen“. Es wird nichts ausgewählt oder verändert; die Betriebsart beendet Mehrfachauswahl, Rahmen und Stege setzen und wird von ihnen beendet, mit ihrem Ende gehen die Punkte weg. Das Messen der Einrichtung (Messpunkte für den Nullpunkt) bleibt, wie es war. Nicht gebaut: Ecken und Kantenmitten des Rohteils als Ziel (cam-ux7).',
    'klein',
    { want: true, done: true },
  ],
  [
    'cam-ux7',
    'Messen: Rohteil als Ziel',
    'Die Ecken und Kantenmitten des eingegebenen Rohteils rasten beim Messen mit ein – der Abstand eines Teils zur Rohteilecke wäre damit ein Tipp. Bisher sind nur Teile Ziel.',
    'klein',
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
  [
    'cam-tab10',
    'Stegfeld: Wechsel zwischen Automatisch und Von Hand verschiebt die Knöpfe darunter',
    'Gemessen im Browser: Beim Wechsel schrumpft das Feld der Werte (das Feld „Anzahl“ fällt weg und die Felder rücken zusammen), die Knöpfe darunter wandern bei 1280 px Breite um 82 px. Gefunden, als „Ecken meiden“ dazukam (dessen Kasten steht jetzt in beiden Arten, damit er nichts zusätzlich verschiebt); der Wechsel selbst ist unverändert und nicht behoben. Behebung: das Feld „Anzahl“ von Hand gesperrt stehen lassen, mit Grund.',
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
    'Das Feld der Haltestege klappte unter dem ersten abgehakten Teil auf und schob die Zeilen darunter um etwa 380 px. Behoben: Das Feld öffnet nur noch auf Wunsch – mit „Stege einstellen“ in jeder Zeile, die Stege hat (ob sie gewählt ist oder nicht), mit dem Häkchen „Haltestege“ oder mit „Stege setzen“ – und schließt mit „Schließen“. Auswählen, Abhaken, Antippen auf dem Tisch, Zeichnen und die Mehrfachauswahl ändern keine Zeilenhöhe mehr (im Browser an drei Zeilen gemessen, jede an einem Platz getippt, der vor dem ersten Haken berechnet war). Dafür wird jede Zeile mit Stegen um den Knopf höher.',
    'klein',
    { want: true, done: true },
  ],
  [
    'cam-sel15',
    'Rahmen: Treffer schon beim Ziehen zeigen',
    'Während der Rahmen aufgezogen wird, die Teile hervorheben, die er beim Loslassen nimmt – bisher ändert sich die Auswahl erst beim Loslassen und der Rahmen ist die einzige Rückmeldung.',
    'klein',
  ],
]);
add('cam', 'Zeichnen & Formen', [
  [
    'cam-draw11',
    'Verbindungen erzeugen',
    'Zinken, Schlitz und Zapfen, Nut und Feder als Vorlage mit Maßen: erzeugt beide Teile passend zur Materialstärke und zum Fräserdurchmesser.',
    'gross',
  ],
  [
    'cam-draw12',
    'Zahnrad mit Evolventenzahn',
    'Ein Zahnrad, dessen Zähne aufeinander abrollen: Evolventenprofil nach Modul, Zähnezahl und Eingriffswinkel, mit Wellenloch. Das Zahnrad von „Weitere Grundformen“ hat Trapezzähne und ist keine Zahnradstufe.',
    'gross',
  ],
]);
add('cam', 'Auswählen & Anordnen', [
  [
    'cam-arr5',
    'Verschachteln nach dem Umriss',
    'Teile nach ihrem Umriss ineinander schieben statt nach ihren Rahmen (ein L in die Ecke eines anderen). Heute packt „Verschachteln“ nur Rahmen. Braucht Geometrie auf Polygonen (No-Fit-Polygon) und wiegt schwerer für die Sicherheit: ein Abstand zwischen Umrissen muss auch für die Bahn des Fräsers gelten.',
    'forschung',
  ],
  [
    'cam-arr6',
    'Verschachteln: Rand zum Rohteil einstellbar',
    'Ein Abstand zum Rand des Rohteils, damit ein Fräser, der außen um ein Teil am Rand läuft, nicht über das Rohteil hinausfährt. Heute ist der Rand 0.',
    'klein',
  ],
  [
    'cam-arr7',
    'Verschachteln auf mehrere Platten',
    'Teile, die auf das Rohteil nicht mehr passen, auf eine zweite Platte legen (eine zweite Zeichnung oder ein zweites Programm), statt sie liegen zu lassen.',
    'gross',
  ],
  [
    'cam-arr8',
    'Verschachteln: nicht Ausgewähltes meiden',
    'Teile, die nicht ausgewählt sind und liegen bleiben, als belegte Fläche behandeln, damit die gepackten Teile nicht darauf kommen. Heute bleiben sie liegen und können unter gepackten Teilen liegen – die Karte nennt diese Teile und warnt davor (nicht aber ein Teil, das ganz im Rahmen eines gepackten liegt: das geht mit, wie ein Loch in einer Platte).',
    'klein',
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
  [
    'cam-path18',
    'Hinweise der Bahnen auch in der Serie',
    'Die Serie auf Rohlingen nimmt Eintauchen, Spanbrechen und die Nummer der Reihenfolge aus der Zeichnung mit, ihr Programm behält aber nur die Fahrten: passt eine Helix nicht und wird mit der Rampe eingetaucht, sagt die Serie das nicht (die Zeichnung sagt es). Kein Test setzt in der Serie eine dieser Wahlen und fräst es – nur dass sie mitkommen.',
    'klein',
  ],
  [
    'cam-path16',
    'Vorbohren an einem Punkt',
    'Vor dem Fräsen einer Tasche an einem Punkt (etwa dem Einstieg) bohren, mit dem Bohrer oder dem Fräser. Braucht einen eigenen Schritt im Programm und gehört zu „mehrere Werkzeuge in einem Programm“, wenn ein anderer Bohrer dafür gedacht ist.',
    'klein',
  ],
  [
    'cam-path17',
    'Zentrieren vor dem Bohren',
    'Ein Loch vor dem Bohren flach ankörnen (Zentrierbohrer oder Gravur-Fräser), damit der Bohrer nicht wandert. Ein zusätzlicher Schritt je Bohrung, meist mit einem anderen Werkzeug.',
    'klein',
  ],
]);

// Reste aus dem Review der Fräsbahnen (Tranche C): gefunden, nicht gebaut
add('cam', 'Bahnen & Strategien', [
  [
    'cam-path19',
    'Helix: das Feld zeigt auch eine Zahl, die nicht gefräst wird',
    'Wer eine Helixbreite außerhalb von „Fräser + 0,5 mm bis 2 × Fräser“ tippt, sieht im Feld, in der Datei und im Speicher diese Zahl; gefräst wird der nächste erlaubte Wert, und der Hinweis darunter nennt das. Besser: die tatsächliche Breite neben dem Feld zeigen („gefräst mit 12 mm“) oder die getippte Zahl auf den Bereich des Fräsers setzen (die Datei muss die äußeren Grenzen behalten).',
    'klein',
  ],
  [
    'cam-path20',
    'Reihenfolge: Verschieben kann Teile ohne Nummer anderer Arten umordnen',
    'Früher/Später auf einem Teil verspricht nur die Reihenfolge seiner Art. In einer Reihe von Zufallsläufen änderte sich in etwa 13 von 1000 Verschiebungen auch die Reihenfolge einer anderen Art; wahrscheinlich, weil die Bibliothek die kürzere Route nur nimmt, wenn der ganze Eilgang wirklich kürzer ist, und eine Nummer diese Entscheidung kippen kann (nicht weiter verfolgt). Behebung: im Hinweis sagen oder die verdrängten Teile mit nummerieren.',
    'klein',
  ],
]);

add('cam', 'Auswählen & Anordnen', [
  [
    'cam-arr9',
    'Verschachteln in einem eigenen, zugeklappten Feld',
    'Der Block „Verschachteln“ (Titel, Hinweis, Abstand, Drehen, Knopf, Ergebnis) steht aufgeklappt im Feld „Ausrichten und verteilen“ und macht die Karte ab zwei ausgewählten Teilen etwa 300 px höher – für eine Funktion, die ein eingegebenes Rohteil braucht. DESIGN.md §2 und das Vorbild „Fangen und Abstände“ sprechen für ein eigenes Feld, bis zum ersten Öffnen zu, mit der Suche über registerFold.',
    'klein',
  ],
  [
    'cam-ux8',
    'Teilnamen in der Liste am Touchgerät ganz lesbar',
    'Der Name jeder Zeile ist eine Zeile lang und wird abgeschnitten (damit kein Kürzel die Zeilenhöhe ändert); der ganze Name steht nur im Titel der Zeile, den ein Finger nicht lesen kann. Die neuen Formen haben die längsten Namen („Zahnrad mit 16 Zähnen, Ø 60 mm“). Der ganze Name steht in der Karte der Auswahl, sobald die Zeile angetippt ist; besser wäre eine zweite, kleinere Zeile mit fester Höhe oder ein längerer Fingerdruck.',
    'klein',
  ],
]);

add('cam', 'Import, Export, Projekt', [
  [
    'cam-io6',
    'Projektdatei: Rechteck mit Eckenradien über 5 m verliert die Skizze',
    'Ein Rechteck mit einzelnen Eckenradien, breiter als 5000 mm, wird so gespeichert, wie es getippt wurde, und verliert beim Öffnen still seine Skizze (die Konturen bleiben und sind schneidbar). Dasselbe Rechteck ohne Radien behält die Skizze. Für eine LowRider unrealistisch; die Behebung wäre, beim Schreiben auf die Grenze zu setzen.',
    'klein',
  ],
  [
    'cam-io7',
    'Projektdatei Version 1: eine ältere App liest neue Felder ohne Meldung',
    'Die Version bleibt 1 (wie bei „hidden“ und „tabSpec“), also öffnet eine ältere App eine Datei mit Eckenradien, neuen Formen, Nummer, Eintauchen, Spanbrechen oder „Ecken meiden“, ohne zu warnen: die Skizzen und Felder fallen weg, die Teile bleiben schneidbar, schneiden aber bei „Ecken meiden“ anders. Gemessen mit dem Stand vor der Tranche. Die Antwort ist die Dokumentation – oder künftig Version 2 nur dann, wenn eines dieser Felder vorkommt.',
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

add('scan', 'Position der Aufnahmen (Timing)', [
  [
    'tim-i',
    'Unsichere Bilder beim Scan mit Halt nicht auflegen',
    'Ein Bild, das bei der längsten Wartezeit noch im Wandel war, liegt auf der Karte und wird nur einmal je Scan gemeldet. Besser wäre, es nicht aufzulegen und einmal neu aufzunehmen. Offen, weil es beim Scan mit Halt keinen Weg gibt, eine Lücke nachzufüllen (beim Scan in Fahrt tut das die Nachholrunde).',
    'klein',
  ],
  [
    'tim-j',
    'Frühere Fahrt als Beleg erkennen',
    'Zeigt das Bild bei der festen Zeit die Fahrt nicht (eine blanke Stelle des Tisches, oder eine Kamera, die um mehr als Fahrt plus feste Zeit zu spät ist), nimmt die App es bei der festen Zeit, auch wenn frühere Punkte die Fahrt gezeigt haben; beides sieht für sie gleich aus. Eine Kamera, die mehrere Sekunden zu spät ist, zeigt dazu ältere Halte: im Simulator (5 s Verzögerung, vorher bei 0,15 s gelernt) lagen 2 von 8 Bildern 52 mm daneben, früh genommen, weil ein älterer Halt als Beleg galt – nicht schlechter als die feste Zeit, die dort ebenso daneben läge, aber ohne den Beleg, den die Regel verspricht, und er geht in das Gelernte ein. Denkbar: die Änderung im Bild an diese Fahrt binden (das Bild muss sich so lange bewegen, wie die Maschine gefahren ist); nicht gebaut, die Schwellen sind an einer echten Kamera zu messen.',
    'forschung',
  ],
  [
    'tim-k',
    'Adaptives Warten an der echten Kamera prüfen',
    'Einen Scan mit Halt an der Maschine fahren und die Pausen je Punkt ansehen (ScanStats.rest.points): Rauscht die Kamera von Bild zu Bild neu? Für wie viele Punkte kommt der Beleg zustande? Meldet die App unsichere Bilder? Liegt ein Bild neben seinem Platz (Karte mit dem Scan bei fester Zeit vergleichen)?',
    'aufgabe',
  ],
]);
add('scan', 'Bewegungsunschärfe', [
  [
    'blur-g',
    'Belichtung und Bild an der echten Kamera prüfen',
    'Am Pi die Ausgabe von v4l2-ctl -d /dev/video0 --list-ctrls-menus mit der Karte in den Kameraeinstellungen vergleichen; die Belichtung setzen, während ustreamer läuft, und im Bild nachsehen, ob sie wirkt; ustreamer neu starten und prüfen, ob der Companion die Werte zurückschreibt; „Aus der Kamera übernehmen“ im Scan-Panel gegen den Wert halten, den v4l2-ctl zeigt. Offene Fragen stehen in docs/offene-fragen.md (12).',
    'aufgabe',
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
