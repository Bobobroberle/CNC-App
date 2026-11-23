# Erste Schritte an der Maschine – Prüfliste

Reihenfolge laut Projektbeschreibung: erst leerer Jackpot auf dem Tisch, dann Maschine mit Spindel
aus, dann im Material. Hand am Hardware-Not-Aus. Jeden Punkt abhaken; was anders läuft als
beschrieben, mit Protokoll-Auszug (_Reiter Service → Diagnose_) notieren.

**Etwas nicht gefunden?** Oben _Suchen_ antippen (am Laptop `Strg+K`) und ein Wort tippen – auch
ein anderes als das auf dem Bildschirm („Zwinge“, „homing“, „zu lang“). Die Suche führt zur Stelle
und umrandet sie kurz; sie fährt und startet nichts.

## 1. Verbinden und sichern

**WLAN – erst der Router, dann der Jackpot.** FluidNC wählt sich nur beim Einschalten ins WLAN ein.
Läuft der Router da noch nicht (Stromausfall, alles an einer Steckdosenleiste), bleibt der Jackpot
draußen, bis er neu startet. Die App sagt das so: „Pi erreicht den Jackpot nicht (192.168.0.200:81)“ –
dann den Jackpot aus- und wieder einschalten. Solange kein Job läuft, versucht die App es von selbst
weiter (alle 2 s bis 30 s) und verbindet, sobald er antwortet; während eines Jobs nie.

- [ ] Mit dem Pi: Browser auf `http://<Pi>:8080`, _Reiter Einstellungen → Verbindung → Über den Pi
      verbinden_. Die Karte zeigt den Weg (dieses Gerät → Pi → Jackpot) und was sie gerade tut.
- [ ] Ohne Pi: `lowrider-control.html` per Doppelklick öffnen (nicht über https), _Reiter
      Einstellungen → Verbindung:_ IP des Jackpot, _Verbinden_.
- [ ] Probe: Jackpot ausschalten – die Karte sagt, welches Gerät fehlt, und zählt den nächsten Versuch
      herunter; Jackpot wieder an – die App verbindet von selbst. _Aufhören_ beendet die Versuche.
- [ ] Konsole: `$I` – Ausgabe notieren.
- [ ] _Reiter Einstellungen → Maschine → Maschinenprofil → Von der Maschine lesen ($CD)_: Verfahrweg und Geschwindigkeiten
      übernehmen.
- [ ] _Maschinenprofil → Grenzen der Steuerung:_ Höchstgeschwindigkeit und Beschleunigung je Achse
      stehen da (aus der config.yaml). Die _Tippgeschwindigkeit der App_ darüber ist die eigene der
      App – sie fährt höchstens so schnell, wie die Steuerung erlaubt („Z: 4000 eingestellt, fährt
      max. 1200“). Erhöhen nur in kleinen Schritten (etwa 20 %), schreiben (halten), danach die
      Wiederholprobe (_Service & Diagnose → Kalibrieren_). Über den Pi wird die config.yaml dabei mit
      Sicherung `config.yaml.bak` gespeichert – **erst an der Maschine prüfen:** nach dem Schreiben
      _Experte → config.yaml komplett bearbeiten → Von der Maschine lesen_ und vergleichen, dann den
      Jackpot neu starten und die Werte erneut lesen.
- [ ] _Reiter Einstellungen → Experte → config.yaml komplett bearbeiten → Von der Maschine lesen →
      Original herunterladen_ und aufheben.
- [ ] _Reiter Einstellungen → Experte → $-Einstellungen → Von der Maschine lesen ($S)_: Liste und
      Erklärungen ansehen (nichts ändern).
- [ ] Zwei Browserfenster verbinden: siehe [offene-fragen.md](offene-fragen.md) („mehrere Clients“).

## 2. Ohne Last: Fahren und Grenzen

- [ ] _Jog → Referenzfahrt alle_ (halten): Protokoll „Referenzfahrt abgeschlossen“.
- [ ] Schrittweiten 0,01 / 0,1 / 1 / 10 mm, Restweg-Anzeige prüfen; an der Grenze sperrt die Taste.
- [ ] _Dauer:_ Taste halten → fährt, loslassen → stoppt sofort. Bis an die Grenze halten → stoppt dort.
      Ohne Referenzfahrt fährt ein Halten höchstens 200 mm (Z 50 mm); danach neu halten.
- [ ] _Jog-Abbruch im Relais:_ Dauerfahrt halten und am iPad/PC die Seite schließen oder das WLAN trennen:
      die Maschine muss anhalten (das Relais schickt `0x85`). Danach prüfen, dass `0x85` einen laufenden
      SD-Job **nicht** stört: Job von der SD-Karte starten, ein zweites Gerät schließen (oder das steuernde
      Gerät): der Job muss weiterlaufen. (Nach der Grbl-Dokumentation wirkt `0x85` nur im Jog-Zustand –
      für FluidNC ungeprüft.)
- [ ] _Zwei Geräte:_ PC und iPad gleichzeitig verbinden: das zweite darf nichts senden außer Status,
      PAUSE und NOT-HALT; PC schließen: das iPad steuert danach. Das zweite Gerät zeigt bei „Fräsen starten“
      den Grund „Nur Ansicht“ (Start gesperrt); Befehle, Uploads und Jobs lehnt der Store ab.
      (e2e `connection.spec.ts`: „a device that only watches …“, gegen den Simulator – am echten Pi offen.)
- [ ] Tastatur (Pfeile, Bild↑/↓), ggf. Gamepad, Handrad. `?` zeigt alle Tastenkürzel; solange die
      Übersicht oder die Suche offen ist, joggen die Pfeiltasten nicht.
- [ ] Falsche Grenzen? _Reiter Einstellungen → Experte_: `max_travel_mm` (vor allem Z!) und `soft_limits`
      setzen, _Sichern und schreiben_, Neustart, neu referenzieren.

## 3. Nullpunkte und Antasten

- [ ] _Einrichten → Nullpunkte:_ G54 und G55 wählen, Anzeige der Offsets; _XY = 0_.
- [ ] Nullpunkt-Speicher: Name + Foto speichern, anderes System wählen, _Übernehmen_ (halten).
- [ ] _Einrichten → Antasten → Z antasten:_ Plattendicke messen und eintragen, Kontakt prüfen, antasten.
- [ ] _Tastzyklen → Ecke:_ an einem Klotz testen; Ergebnis mit Messschieber vergleichen.
- [ ] _Kante_ und _Bohrungsmitte_ (Bohrung mit bekanntem Ø).
- [ ] Werkzeuglängensensor (falls vorhanden): Position speichern, Referenzwerkzeug messen, anderes
      Werkzeug messen, _Längenkorrektur setzen_ – Z-Anzeige muss passen.

## 4. Erster Job, Spindel aus

- [ ] _Job → G-Code öffnen_ (einen der Fusion-Jobs).
- [ ] _Vorbereiten:_ Material, Werkzeug je T, Nullpunkt.
- [ ] _Prüfen:_ Liste ist grün oder gelb; rote Punkte mit dem Knopf daneben beheben. Die Startleiste
      unten zeigt „Startklar“.
- [ ] _Fräsen → Rahmen abfahren_ (halten): fährt in sicherer Höhe um den Job.
- [ ] _Fräsen → Teil 1/2 starten_ bzw. _Starten_ (halten), Spindel aus, Z-Nullpunkt 20 mm über dem
      Tisch. Die Datei landet auf der SD-Karte und startet dort (wie mit der WebUI):
  - [ ] Bühne verfolgt live, Abweichung plausibel; Laufleiste auf der Startseite, im Jog-Feld und in den Nebenbereichen sichtbar.
  - [ ] WLAN am iPad kurz aus: der Job läuft weiter.
  - [ ] Pause / Fortsetzen, Override ±10/±1, Eilgang 25/50/100 %.
  - [ ] Teil fertig: Spindel aus, Z hoch, nächstes Werkzeug wird angezeigt; _Z mit Platte antasten_
        bzw. _Mit Sensor messen_; _Teil 2/2 starten_ (halten).
  - [ ] _Abbrechen_ (halten): Maschine hält an, danach kein Neu-Referenzieren nötig.
- [ ] _Wiederaufnahme ab Zeile:_ abgebrochenen Job ab einer Zeile fortsetzen.
- [ ] Zweite Startart: _Vom iPad streamen_ mit _Einzelschritt_ (ein Satz pro Tipp).
- [ ] _Reiter Service → Historie:_ der Job steht mit Dauer, Abweichung und Ergebnis drin.

## 4a. Eigenes Teil zeichnen (CAM)

- [ ] _Reiter CAM:_ unter _1 · Zeichnen_ auf _Rechteck_ tippen – es liegt sofort auf dem
      Tisch (100 × 60, Ecke auf dem Nullpunkt). Dann _Kreis_: er landet mitten im Rechteck.
- [ ] Das gewählte Teil auf dem Tisch an einem Griff größer ziehen, am Punkt darüber drehen, an der
      Linie verschieben – oder seine Maße und _X_ / _Y_ unter den Formen eintippen. _Rückgängig_
      (oben rechts, am Laptop Strg+Z) nimmt jeden Schritt zurück; _Löschen_ oder Entf entfernt es.
- [ ] _2 · Wie:_ Rechteck _Außen_ mit Haltestegen, Kreis _Innen_ oder _Tasche_; Werkzeug und Tiefe
      einstellen, _Werte aus Werkzeug und Material vorschlagen_.
- [ ] Ein Schild: auf _Text_ tippen und gleich das Wort schreiben – er landet mittig und wird 1 mm
      tief graviert (Tiefe steht in seiner Zeile); die Schrifthöhe steht darunter oder am Griff.
- [ ] Bühne zeigt die Bahnen; _G-Code erzeugen_, dann _Fräsen → Prüfen_ und _Fräsen_ wie oben – zuerst in der
      Luft.
- [ ] Eine DXF- oder SVG-Datei aus Fusion oder Inkscape laden; nicht Übernommenes (Text, Bilder,
      Blöcke) wird genannt. Bei SVG ein Maß nachmessen: Die Größe kommt aus der Datei.
- [ ] Für eine Steckverbindung: Schlitz _Innen_, _Ecken frei_ – in der Bahn sind die kleinen Ausfahrten
      in die Ecken zu sehen.

## 4b. Ein Teil von beiden Seiten (zuerst im Simulator, dann in Restholz)

- [ ] In _Zeichnen_ unter _2 · Wie_ den Schalter **Von beiden Seiten fräsen** setzen, die Wenderichtung
      wählen (Bild), die Materialdicke eintragen und bei einer Bearbeitung _Rückseite_ wählen. Auf dem
      Tisch erscheinen zwei Passlöcher (Kreise mit Kreuz) und die Wendeachse (Strichpunktlinie).
- [ ] Hinweise unter _3 · Ansehen_ lesen: Schneiden Vorder- und Rückseite zusammen durch? Löst der
      Umriss das Teil schon vorn? Liegt ein Passloch auf einer Bahn?
- [ ] _G-Code erzeugen_: Jeder Schritt zeigt oben den Ablauf. Vorderseite wie gewohnt fräsen (sie
      bohrt die Passlöcher).
- [ ] **Teil wenden** wie im Bild, wieder spannen, bestätigen. Mit Kamera: _Passloch 1/2 anfahren und
      suchen_ halten – danach liegt die Rückseite gedreht und verschoben richtig. Mit Passstiften: zwei
      Stifte im Bohrdurchmesser in die Löcher im Tisch, Teil daraufstecken.
- [ ] Unter _Fräsen → Prüfen_ die Spannmittel gegen die Rückseite ansehen, dann _Fräsen_. Am ersten Teil
      nachmessen, ob eine Bohrung von vorn und hinten sich trifft – erst dann etwas Wertvolles.

## 4c. Eine Serie auf verstreuten Rohlingen (zuerst im Simulator, dann in Restholz)

- [ ] Im Simulator: _Einstellungen → Verbindung → Auf dem Tisch → Rohlinge für eine Serie_. An der
      Maschine: Rohlinge mit Abstand auf die Opferplatte legen (Doppelklebeband oder Anschlag), alle
      gleich dick, **Z0 auf die Oberfläche eines Rohlings** setzen.
- [ ] In _Zeichnen_ das Motiv anlegen (ein Text, 8–10 mm hoch, reicht) und unten _Serie: auf Rohlinge
      verteilen_ wählen.
- [ ] _Tisch scannen_ halten (oder _Auf dem Tisch-Bild suchen_, wenn das Bild aktuell ist). Stimmen
      Zahl, Umrisse und Nummern der Rohlinge? Was gelb gestrichelt ist, wurde nicht übernommen –
      der Grund steht daneben.
- [ ] Liegt das Motiv auf jedem Rohling richtig herum? Sonst _Drehen_; einen Rohling antippen lässt
      ihn aus. Für Namen: _Ein Name je Rohling_ und die Liste in der Reihenfolge der Nummern.
- [ ] _Mit der Kamera nachmessen_ halten, dann _Serie erzeugen_ – weiter wie bei jedem Job: Prüfen,
      Fräsen. Beim ersten Mal mit Stift statt Fräser oder 0,2 mm tief: Sitzt jede Gravur mittig?

## 4d. Eine Vorrichtung mit Marker (zuerst im Simulator)

- [ ] Im Simulator: _Einstellungen → Verbindung → Auf dem Tisch → Vorrichtung mit Markern_, dann in den
      Reiter _Job_: Die Demo kennt die Vorrichtung schon – _Einmessen und Job laden_ halten, zusehen.
      Mit _Vorrichtung woanders hinlegen_ (Simulator-Karte) liegt sie anders; wieder einmessen.
- [ ] Für die eigene Vorrichtung: _Job → Extras → Vorrichtungen mit Markern → Marker drucken_. Mit
      100 % drucken und die 50-mm-Linie nachmessen. Für kleine Vorrichtungen reicht ein Marker
      (40 mm), für große zwei mit verschiedenen Nummern, so weit auseinander wie möglich.
- [ ] Marker mit weißem Rand ausschneiden und flach aufkleben: mattes Papier, kein glänzendes
      Klebeband darüber, möglichst auf Höhe der Werkstück-Oberfläche, außerhalb von Fräsbahn,
      Spannmitteln und Spänen.
- [ ] Einmal einrichten wie immer (Job laden, X/Y- und Z-Nullpunkt, Spannmittel markieren), die
      Kamera über den Marker fahren, dann _Vorrichtung anlernen_: _Marker einmessen_ halten, Namen
      geben, speichern. Steht dort „Ein einzelner kleiner Marker gibt den Winkel nur grob“: zweiten
      Marker aufkleben.
- [ ] Probe: Vorrichtung wegnehmen, verdreht wieder auflegen, Kamera über den Marker fahren (oder
      Tisch scannen). _Einmessen und Job laden_ halten – der Fräser muss frei über die Vorrichtung
      kommen. Danach **Z-Nullpunkt setzen** (den kennt der Marker nicht), _Fräsen → Prüfen_, und beim ersten
      Mal mit Stift statt Fräser oder 0,2 mm tief: Sitzt der Job, wo er beim Anlernen saß?

## 4e. Ein Teil, das länger ist als der Tisch (zuerst im Simulator, dann in Restholz)

- [ ] Im Simulator: _Einstellungen → Verbindung → Auf dem Tisch → Langes Brett_, _Beispiel
      „Regalseite“ laden und Nullpunkt setzen_ halten, Zeitraffer 50×. In _Fräsen → Prüfen_
      steht bei „Liegt im Verfahrweg“ _Teil ist länger als der Tisch_ – **In Abschnitten fräsen**.
- [ ] Der Karte folgen: Abschnitt 1 prüfen und fräsen, _Passmarken einmessen_ halten, _Teil ist
      weitergeschoben und fest_, _Passmarken finden_ halten, nächster Abschnitt. Auf dem Tisch-Bild
      ansehen: Naht (Strichpunkt), gelber Streifen für die Marker, grün das schon Gefräste.
- [ ] An der Maschine zuerst in Restholz und mit einer Gravur statt eines Durchschnitts: zwei
      Marker drucken (wie für Vorrichtungen, 40 mm), ein Brett nehmen, das etwa anderthalbmal so
      lang ist wie der Verfahrweg, und eine lange Linie mit ein paar Bohrungen fräsen. An der Naht
      mit dem Fingernagel fühlen und mit dem Messschieber messen, wie weit die zwei Hälften
      seitlich versetzt sind – das ist die Zahl, auf die es ankommt.
- [ ] Marker flach und auf saubere Fläche kleben, nicht über Späne; beim Schieben nicht daran
      hängen bleiben. Für lange gerade Teile eine gerade Latte als Anschlag längs der
      Schieberichtung festspannen und _Das Teil liegt an einem geraden Anschlag_ ankreuzen.
- [ ] Z-Null nach dem Schieben prüfen, wenn das Teil anders aufliegt (durchhängendes Ende
      unterstützen!): Ein überstehendes Ende, das nach unten zieht, hebt das Teil auf dem Tisch an.

## 5. Im Material

- [ ] Weichholz, ein Werkzeug, Schnittwert-Vorschlag aus _Menü → Werkzeugliste_.
- [ ] 3D-Ansicht vor dem Start: Materialabtrag und Kollisionspunkte ansehen.
- [ ] Nach einigen Jobs: Lernfaktor im Schnittwert-Vorschlag, Verschleiß-Trend in der Historie.

## 6. Kamera, Ausrichten, Autolevel (wenn vorhanden)

- [ ] Kamera kalibrieren: _Maßstab_ (Merkmal, X +10 mm, Merkmal) und _Versatz_ (Markierung).
- [ ] _Hinfahren:_ auf eine Bohrung tippen, _Kamera hierhin_ – die Bohrung muss im Fadenkreuz
      landen; _Fräser hierhin_ – der Fräser muss genau darüber stehen.
- [ ] Joystick auf der Bühne (in der Werkzeugleiste einschalten): langsam und schnell ziehen,
      loslassen stoppt sofort.
- [ ] Fadenkreuz mit 0,01 mm auf eine Werkstückecke, _Nullpunkt X/Y = Fadenkreuz_; mit dem Fräser
      kontrollieren.
- [ ] Nullpunkt per Tipp aufs Bild; mit dem Fräser kontrollieren.
- [ ] Versatz automatisch: mit dem Fräser einen kleinen Punkt bohren, _Position der Markierung
      merken_, Kamera grob darüber, _Markierung automatisch finden_.
- [ ] _Bohrung zentrieren → Nullpunkt X/Y_ an einer Testbohrung; mit dem Fräser kontrollieren.
- [ ] Zwei Bohrungen: Lage im Job eintragen, beide zentrieren, _Nullpunkt und Drehung übernehmen_,
      ausgerichteten Job simulieren.
- [ ] Bühne _Tisch_, Werkzeug _Hinfahren_: auf eine Stelle tippen, _Fräser hierhin_ (halten).
- [ ] Werkzeug _Nullpunkt_: Werkstückecke antippen, in der Lupe prüfen, _Nullpunkt X/Y setzen_
      (halten); dann _2 · Kante_: zwei Punkte entlang der Kante, _Job danach ausrichten_,
      ausgerichteten Job simulieren. Im Kamerabild prüfen, ob der Tipp wirklich auf Ecke und Kante
      einrastet (helles Brett auf dunklerem Tisch) – sonst von Hand in der Lupe nachsetzen.
- [ ] Werkzeug _Messen_: zwei Löcher mit bekanntem Abstand im Kamerabild antippen, Abstand und
      Durchmesser mit dem Messschieber vergleichen.
- [ ] Werkzeug _Spannmittel_: jede Zwinge antippen, Höhe über dem Werkstück eintragen; unter
      _Fräsen → Prüfen_ darf kein Spannmittel in der Fräsbahn stehen.
- [ ] _Reiter Service → Kalibrieren_ mit Punktetafel: Maßstab, Rechtwinkligkeit, Umkehrspiel, Z-Schiefe
      ([Anleitung](kalibrierung.md)); Korrektur schreiben, neu starten, referenzieren, nachmessen.
- [ ] Autolevel auf einer Platte mit Alufolie: Raster 3 × 3, Höhenunterschiede plausibel.
- [ ] Fotokarte: auf Kamerahöhe ein paar Stellen anfahren – auf der Bühne _Tisch_ erscheinen die
      Bilder an ihrem Ort, unter Job und Fräser. _Einrichten → Kamera → Fläche scannen_ (halten) über
      den Job; ohne Y-Achse _Y von_ = _Y bis_ setzen (ein Streifen entlang X). Auf den Tisch
      tippen, _Kamera hierhin_ – die Stelle muss im Fadenkreuz landen.
- [ ] Ecke der Bühne: auf dem Tisch das Livebild klein (antippen → _Kamera_), im Kamerabild die
      Übersicht mit Tisch, Job und Blickfeld der Kamera (antippen → _Tisch_).
- [ ] Mitschnitt (mit Companion): _Einrichten → Kamera → Mitschnitt_ – _Jetzt aufnehmen_, eine Minute
      warten, _Aufnahme beenden_, _Zeitraffer ansehen_. Danach _Bei jedem Job automatisch
      aufnehmen_ einschalten; bei einem Luftjob muss die Aufnahme mit dem Job beginnen und enden.

## 7. Firmware (nur wenn nötig)

- [ ] _Reiter Einstellungen → Experte → Firmware:_ config.yaml herunterladen, Release-ZIP wählen, Variante WLAN,
      USB verbinden, _Flashen_ (halten). Danach muss die Config unverändert sein.

## 8. Feierabend: Pi ausschalten (mit Companion)

- [ ] _Einstellungen → Verbindung → Companion → Pi herunterfahren_ halten; warten bis „Pi ist aus – du
      kannst den Stecker jetzt ziehen“ erscheint und die grüne LED am Pi dunkel ist. Erst dann den
      Strom trennen ([Companion](companion.md)).
