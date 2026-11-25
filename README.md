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

Die Oberfläche folgt dem UX-/HMI-Guide [DESIGN.md](DESIGN.md): sechs Bereiche statt fester Schritte
(Stand des Umbaus und Zuordnung alt → neu in [docs/umbau-guide.md](docs/umbau-guide.md)). Die
Abschnitte folgen den Reitern – erst die Oberfläche im Überblick und die Schnellsuche, dann _Job_,
_CAM_, _Einrichten_ (mit dem Jog-Feld), die Abläufe, die über mehrere Bereiche gehen, _Fräsen_,
_Service_ und _Einstellungen_ –, danach das Menü, der Simulator und die App auf dem iPad.

### Oberfläche im Überblick

- **Statusleiste**, auf jedem Bildschirm gleich: Maschinenzustand als Marke mit Zeichen und Wort
  (_Nicht verbunden_ · _Verbinde …_ · _Bereit_ · _Läuft_ · _Pausiert_ · _Antasten_ · _Alarm –
  Klartext_, bei Alarm mit dem Code der Steuerung klein dahinter; an der simulierten Maschine
  daneben _Simulator_ bzw. _Demo_), Position X Y Z (A bei Drehachse; ein Tipp wechselt
  Werkstück/Maschine), Spindel (Drehzahl, mit Sensor die Last), Vorschub, Verbindung (_Verbunden_ ·
  _Verbinde …_ · _Getrennt_ · _Neuer Versuch …_), Meldungen ⚑ – und rechts **PAUSE** (Vorschub
  halten: ein Tipp, keine Rückfrage, nie verdeckt, nie gesperrt) und daneben mit Abstand
  **NOT-HALT**. Schmaler geben zuerst die Zahlen nach: unter 1500 px zeigen Verbindung und Meldungen
  nur ihr Zeichen, unter 1024 px steht die Leiste in zwei Zeilen; PAUSE und NOT-HALT werden nie zusammengedrückt oder verdeckt (unter 1280 px nur etwas schmaler).
- **Start** (_Start_ links in der Zeile): der Zustand groß mit Position, Maschinenprofil und
  Referenzstand; der aktuelle Job (Fortschritt bzw. geschätzte Laufzeit; dazu Job, Einrichten und
  Fräsen mit ihrem Zustand, je ein Sprung dorthin), ohne Programm der letzte gefräste; Werkzeug und
  Material; die letzte Meldung mit Handlungsbedarf; _Schnellzugriff_: _Neuer Job_ · _Zuletzt
  verwendet_ · _Jog_ · _Referenzfahrt_ (Halten). **Eine** Empfehlung „Als Nächstes“ steht unten in
  der Aktionsleiste, aus dem echten Zustand gelesen: _Alarm beheben_, _Maschine verbinden_,
  _Werkzeugwechsel wartet_, ein laufender oder pausierter Job, ein unterbrochener Job (_Job
  fortsetzen_ führt nach Fräsen), _Referenzfahrt nötig_, sonst weiter beim ersten offenen Bereich
  bzw. _Neuen Job beginnen_. Ihr Knopf ist ein Halten, wo er auf die Maschine wirkt (_Entsperren_,
  _Referenzfahrt starten_), sonst ein Weg zum Bereich (_Weiter: …_ mit dessen Namen).
- **Sechs Reiter**, frei anzuwählen: **Job** (Programm öffnen oder zeichnen, _Zuletzt verwendet_,
  Werkstück; mit Programm die Ansichten _Vorbereiten_ · _Extras_) · **CAM** (zeichnen) ·
  **Einrichten** (_Nullpunkte_ · _Antasten_ · _Kamera_ · _Ausrichten_) · **Fräsen** mit den
  Ansichten _Fräsen_ (Start, Fortschritt, Overrides, Pause, Fortsetzen; hier öffnet der Reiter) und
  _Prüfen_ (Startklar-Liste, _Werkzeuge des Jobs_, Simulation, Verfahrweg-Prüfung, Hinweise zum
  G-Code) · **Service** (_Diagnose_ · _Meldungen_ · _Historie_ · _Kalibrieren_) · **Einstellungen**
  (_Verbindung_ · _Maschine_ mit **Darstellung: dunkel oder hell** · _Kamera_ · _Experte_, der nur
  mit Expertenfunktionen erscheint). Job, Einrichten und Fräsen zeigen ihren Zustand ✓ ⚠ ✕ ○ aus der
  einen Startklar-Liste (ein Punkt zählt dort, wo man ihn behebt; Fräsen zeigt zusätzlich ✕, sobald
  irgendein Punkt den Start sperrt); CAM, Service und Einstellungen zeigen keinen. Der Start in
  Fräsen bleibt gesperrt, solange ein Punkt der Liste sperrt. Wartet ein Job auf den Bediener
  (Werkzeugwechsel, Einzelschritt, zwischen zwei Teilen), zeigt Fräsen die Ansicht _Fräsen_, bis es
  weitergeht. Bis 1100 px behält nur der aktuelle Reiter sein Wort (die anderen bleiben für Vorleser
  benannt).
- **Im CAM sind nur das CAM, die Zeile der Reiter und die Statusleiste zu sehen**: keine
  Aktionsleiste, kein Jog-Knopf, keine Bühnenwerkzeuge (_Einpassen_ und _Großbild_ bleiben). Alarm,
  Werkzeugwechsel-Karte und die kritische Meldung bleiben auch dort.
- Im **Menü** (rechts in der Zeile; mit offenem Bereich trägt der Knopf dessen Namen):
  _Werkzeugliste_ und _Konsole_ (nur mit Expertenfunktionen), siehe Abschnitt „Menü“. Was eine Liste
  ist (Werkzeugliste, Service außer _Kalibrieren_, Einstellungen außer _Kamera_, Konsole), bekommt
  die ganze Breite statt des Bildes; das Jog-Feld bringt das Bild zurück.
- **Jog / Manuell** öffnet sich aus jedem Bildschirm über _Jog_ unten links – außer im CAM; die
  Suche führt von dort über Einrichten ins Jog-Feld (siehe Abschnitt „Einrichten und Jog /
  Manuell“).
- **Meldungen** in fünf Stufen (⚑ in der Statusleiste öffnet das Meldungszentrum; dieselbe Liste
  steht unter _Service → Meldungen_): _Information_ (kurz eingeblendet), _Hinweis_ (bleibt ohne
  Einblendung im Zentrum), _Warnung_ (eingeblendet, zählt an der Flagge, bis sie bestätigt ist;
  sperrt nichts), _Störung_ (der Alarm der Steuerung: sperrt Fahren und Start, lässt sich nicht
  wegbestätigen, mit Lösungsweg: _Entsperren ($X)_ als Halten und _Jog öffnen: Referenzfahrt_) und
  _Kritisch_ (Verbindung im Job verloren: über die ganze Arbeitsfläche bis zur Quittierung, ohne
  Animation). Jede Meldung nennt Bezeichnung, Ursache, Auswirkung und nächste Maßnahme; der Code der
  Steuerung steht klein dahinter (`ALARM:1`, `error:20`).
- **Gesperrte Schaltflächen sagen bei Antippen, warum** (nicht verbunden, Alarm, pausiert, Maschine
  fährt, Voraussetzung fehlt …) – nie nur beim Darüberfahren mit der Maus.
- **Aktionsleiste** unten: links _Jog_ (in Fräsen daneben, solange ein Job läuft und das Jog-Feld zu ist, _Job abbrechen_ – mit Rückfrage; `Esc` fragt auch sonst), in der Mitte der Job auf einen Blick (Zeit bzw. Fortschritt, Zeile, Abweichung vom Weg), ab 1280 px zusätzlich sein Dateiname; mit Programm steht daneben immer, ob der Start frei ist; rechts die
  Hauptaktion, **wo der Bereich eine hat**: auf Start die Empfehlung „Als Nächstes“, im Job ohne
  Programm _G-Code öffnen_, in Fräsen der Start (_Fräsen starten_, ein Halten; bei gesperrtem Start
  _Prüfen_, ohne Programm _Zum Job_) – dann _Fräsen pausieren_ und _Fräsen fortsetzen_ (ein Halten),
  am Ende _Nächstes Teil: gleicher Job_. Einrichten, Service, Einstellungen und die Ansicht _Prüfen_
  (solange kein Job läuft oder wartet) haben keine Hauptaktion. Ein „Weiter“ von Bereich zu Bereich
  und eine Taste dafür gibt es nicht – die Reiter sind der Weg; nur der Knopf der Empfehlung auf
  Start trägt noch ein „Weiter: …“.
- **Die Hauptaktion einer Karte bleibt in Reichweite:** _Nullpunkt hier setzen_, das Antasten
  (_Antasten starten_, _Tastzyklus starten_) und im Werkzeugwechsel _Fortsetzen_ und _Abbrechen_
  sitzen beim Scrollen am unteren Rand des Bedienfelds (beim Werkzeugwechsel unter „Großbild“ am
  unteren Rand des Streifens unter dem Bild), solange ihre Karte im Bild ist – und liegen nur
  einmal vor, in ihrer Karte. Auf dem Maschinen-Bildschirm (800 × 600) braucht das Blatt dafür die
  Stellung _ganz_ (_Größer_). _G-Code erzeugen_ im CAM ist bewusst nicht angedockt: ein Tipp, der
  ein fremdes Programm ersetzt, soll nicht neben dem stehen, was man gerade zeichnet.
- Breiten: ab 1024 px (quer) Bild links und Bedienfeld rechts (zwischen 1024 und 1279 px schmaler);
  von 600 bis 1023 px und hochkant ab 600 px liegt das Bedienfeld als Blatt unten in drei Stellungen
  – zugeklappt, halb (so beginnt es: das Bild bleibt frei darüber) und ganz –, bewegt nur mit
  beschrifteten Tasten im Griff (_Zuklappen_ · _Aufklappen_ · _Kleiner_ · _Größer_; je Bereich
  gemerkt, nicht solange etwas gehalten wird); Ziele 48 px, mit dem Finger bis 1023 px 56 px; unter 600 px (Telefon) nur Überwachung (eingerichtet und gestartet wird dort nicht) ohne Reiter und Aktionsleiste: der Job mit Fortschritt groß,
  Restzeit, aktuelle Operation, „pausiert“, Position, das Bild (das Kamerabild, wo eine Kamera
  läuft), die wartende Meldung, _Job abbrechen …_ mit Rückfrage, ohne Verbindung außerdem _Verbinden_ (nur mit eingetragener Adresse) – und oben PAUSE und NOT-HALT.
- **Zahlen** tippt man mit Finger oder Stift in ein eigenes Zahlenfeld (±, Komma, Einheit); Maus und
  Tastatur schreiben weiter direkt ins Feld.

Die Bühne hat drei Ansichten; jeder Bereich bringt seine mit (Job und CAM den Tisch, Einrichten den
Tisch – oder das Livebild, wo eine kalibrierte Kamera läuft –, Fräsen 3D), und eine von Hand
gewählte bleibt die des Bereichs; das CAM öffnet immer auf dem Tisch. **Tisch** ist die Draufsicht
auf den Tisch: die Fotokarte (sobald die Kamera Bilder abgelegt hat) mit Raster, Verfahrweg,
Rohteil, Spannmitteln, Job, Fräser und dem Blickfeld der Kamera; das Livebild sitzt klein in der
Ecke. **Kamera** ist das Livebild groß mit Fadenkreuz und Werkzeugweg, die Übersicht in der Ecke
führt zurück zum Tisch. **3D** zeigt den Job mit Materialabtrag zum Prüfen. Unter dem Umschalter
liegt auf Tisch und Kamera eine Werkzeugleiste (_Hinfahren_, _Nullpunkt_, _Messen_, _Spannmittel_,
dazu der _Joystick_): ein Tipp auf den Tisch oder aufs Kamerabild gibt denselben Punkt, das Ergebnis
erscheint am Bildrand. Über dem Bild stehen _Einpassen_ (nicht auf der Kamera), auf dem Tisch
_Folgen_ und überall _Großbild_ (das Bedienfeld weg; ein Reiter bringt es zurück). Der Werkzeugweg
„im Material“ ist blau – Rot zeigt Störung, Fehler und Sperren (Alarm, NOT-HALT, kritische Meldung,
Fehler im G-Code, Punkte der Startklar-Liste, die den Start sperren), nie die Fräsbahn. Ein
laufender Job bleibt in jedem Bereich außer dem CAM mit Fortschritt und Restzeit sichtbar
(Aktionsleiste, Laufleiste, auf Start die Jobkarte) und mit Pause erreichbar; die Laufleiste führt
mit _Zum Job_ nach Fräsen. Hinweise bieten die Lösung direkt an: „Nicht referenziert“ in der
Startklar-Liste hat _Referenzfahrt_, ein Alarm _Entsperren_ (beides Halten). NOT-HALT und PAUSE sind
immer sichtbar – auch im CAM – und brauchen einen Tipp; alles Gefährliche (Start, Referenzfahrt,
Flashen, Konfiguration schreiben) braucht Halten.

### Schnellsuche und Tastenkürzel

In der Zeile der Reiter steht _Suchen_ (Lupe; mit Wort und Taste ab 1241 px; am Laptop auch
`Strg/Cmd+K` oder `/`). Ein Feld, in das man irgendein Wort tippt – auch das „falsche“ oder eines
mit Tippfehler: „Zwinge“ findet _Spannmittel_, „homing“ die _Referenzfahrt_, „nulpunkt“ den
_Nullpunkt_, „zu lang“ _In Abschnitten fräsen_, „Skizze“ _Zeichnen / DXF_. Jede Zeile sagt, wo die
Funktion wohnt („Einrichten · Nullpunkte“, „Fräsen · Prüfen“, „Jog / Manuell“ – oder „Bühne“,
„Statusleiste“, „Navigation“, „Aktionsleiste“ für das, was neben den Bereichen liegt); ein Tipp
(oder Enter) **führt dorthin**: Reiter und Ansicht wechseln, das Jog-Feld öffnet sich, ein
zugeklappter Abschnitt klappt auf, die Stelle rollt ins Bild und ist kurz umrandet. Ohne Eingabe
zeigt die Suche den _Schnellzugriff_ – was gerade ansteht (verbinden, Referenzfahrt, der nächste
offene Punkt der Startklar-Liste), dann das Übliche (_Nullpunkt_, _Zeichnen / DXF_, _G-Code öffnen_,
_Kamera_, _Einpassen_, _Referenzfahrt_, _Spannmittel_; höchstens sieben Zeilen) – und darunter
_Zuletzt benutzt_ (die letzten fünf). Die Suche **führt nur hin**: Sie fährt nichts, startet nichts
und ändert keinen Job – gefahren und gestartet wird weiter an den Tasten vor Ort (Halten). Nur
wenige Zeilen stellen die Ansicht um (Bühne _Tisch_ · _Kamera_ · _3D_, _Einpassen_, _Großbild_, die
Tastenübersicht). Was ein geladenes Programm oder Expertenfunktionen braucht, führt ohne sie zum Job
bzw. zum Expertenschalter (die Zeile sagt es). PAUSE und NOT-HALT bleiben über der Suche sichtbar.

Tasten am Laptop (sie ruhen, solange in ein Feld getippt wird oder ein Dialog offen ist; Ausnahmen:
die Leertaste, die bei Bewegung auch im Dialog pausiert, und `Strg/Cmd+K` aus einem Feld heraus):

| Taste             | Wirkung                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `Leertaste`       | **Pause** (Vorschub halten), solange sich etwas bewegt – auch im Dialog     |
| `Esc`             | Laufenden Job abbrechen – **mit Rückfrage**                                 |
| `Strg/Cmd+K`, `/` | Schnellsuche                                                                |
| `?`               | Übersicht aller Tastenkürzel                                                |
| `T` · `K` · `D`   | Bühne: Tisch · Kamera · 3D (im CAM ruhen sie; die Suche führt von dort hin) |
| `E`               | Einpassen                                                                   |
| Pfeile, `Bild↑/↓` | Jog X/Y und Z – nur bei offenem Jog-Feld                                    |
| `1` … `5`         | Jog-Schrittweite 0,01 · 0,1 · 1 · 10 mm · Dauerlauf – bei offenem Jog-Feld  |

Dazu die Tasten der Zeichnung im CAM (Entf, Pfeile – mit Umschalt 10 mm, mit Alt 0,1 mm –, Strg+Z,
Strg+D …) und bei offenem Jog-Feld `Esc` zum Anhalten der Fahrt; die Übersicht (`?`) listet alle.
Für NOT-HALT, Start und Referenzfahrt gibt es absichtlich keine Taste. Die Hinweise auf Tasten
erscheinen nur, wo eine Tastatur wahrscheinlich ist (mit Maus, oder nach der ersten Taste); auf dem
iPad ohne Tastatur zeigt die App keine Tastenkürzel an.

### Job

_Job_ – was mache ich? Das Programm und das Werkstück. Die Bühne zeigt dazu den _Tisch_ von oben mit
dem Job; der Reiter zeigt ○ ohne Programm, mit Programm ✓ ⚠ ✕ aus den Punkten der Startklar-Liste,
die hier erledigt werden (Fehler im G-Code, Stellen, die FluidNC anders ausführt, Serie). Ohne
Programm: Ablagefläche, _SD-Karte_ und _Vorrichtungen mit Markern_; mit Programm: die Karte des Jobs
und die Ansichten _Vorbereiten_ und _Extras_. Zeichnen ist ein eigener Reiter (_CAM_, auch über
_Zeichnen / DXF_ hier; siehe Abschnitt „CAM“), die Abläufe **Wenden**, **In Abschnitten** und **Vorrichtungen mit Markern** stehen im Abschnitt „Abläufe über mehrere Bereiche“.

- _Hauptaktion:_ Die Aktionsleiste bietet _G-Code öffnen_ – nur solange kein Programm geladen ist.
  Sie öffnet den Dateidialog (mehrere Dateien zugleich; `.nc`, `.gcode`, `.gc`, `.ngc`, `.tap`,
  `.cnc`, `.txt`, bis 50 MB; G-Code aus Fusion 360, Vectric, Estlcam …). Mit Programm hat Job keine
  Hauptaktion: Die Leiste nennt den Dateinamen und den Stand der Startklar-Liste (_Startklar_,
  _Startklar – n Hinweis(e)_ oder _Start gesperrt: n Punkt(e) offen_); gestartet wird in Fräsen.
- _Ablagefläche_ (nichts geladen): _Kein Programm geladen_, ein Satz („G-Code-Dateien hierher ziehen
  oder unten rechts öffnen – auch mehrere auf einmal“) und die Knöpfe _Zeichnen / DXF_ (öffnet das
  CAM) und _Beispiel laden_ (das Beispielprogramm der App). Ziehen geht an jeder Stelle der App,
  nicht nur auf der Karte. Bei mehreren Dateien wird die erste geladen und gezeigt, alle stehen
  unter _Zuletzt verwendet_ (eine Information sagt es). Eine Datei über 50 MB wird mit _Datei konnte
  nicht gelesen werden_ abgewiesen.
- _Programmkarte_ (geladen): Bahnvorschau von oben (nur die Schnittbewegungen), Name, _Größe_ („X ×
  Y mm, Z mm tief“, bei einem Programm ohne Schnittbewegung _fräst nichts_), _Laufzeit (geschätzt)_
  – rechnet sich neu, wenn sich das Maschinenprofil ändert, das Programm bleibt –, _Werkzeug_
  (T-Nummer · Ø des zugeordneten Werkzeugs aus der Werkzeugliste, „(+n)“ bei mehreren; dazu die
  Marke _n Werkzeuge – siehe Fräsen › Prüfen_) und _Nullpunkt_ (das aktive G54 … G59). Darunter
  _Andere Datei öffnen_ und _Zeichnen / DXF_.
- _Zuletzt verwendet:_ die letzten sechs Jobs, je mit Bahnvorschau, Größe, Laufzeit und dem zuletzt
  gemerkten Nullpunkt (_Nullpunkt zuletzt: G54 X … · Y …_, sonst _Noch nicht gefräst_); ein Tipp
  lädt den Job wieder. Die Liste steht oben, solange nichts geladen ist, sonst unter der Karte (ohne
  den geladenen Job). Gemerkt wird der Nullpunkt, wenn er in Einrichten mit _Nullpunkt setzen_
  gesetzt wird oder der Job startet (bei mehreren Teilen mit dem ersten); in Einrichten kommen die
  letzten fünf als _Nullpunkte dieses Jobs_ zurück (X/Y, mit einem Halten). Die Liste liegt im
  Browser, mit dem Programmtext bis 400 000 Zeichen: Ein größeres Programm wird ohne Text gemerkt,
  seine Karte ist gesperrt und sagt _Das Programm war zu groß zum Merken – die Datei bitte neu
  öffnen._; ist der Speicher des Browsers voll, verlieren zuerst die älteren Jobs ihren Text. Auf
  Start führen _Neuer Job_ und _Zuletzt verwendet_ hierher.
- _SD-Karte_ (nur ohne Programm und nur verbunden; dieselbe Liste liegt auch in Fräsen unter _Mehr
  Optionen_): die Dateien auf der Karte der Steuerung mit Größe, _Aktualisieren_ (gesperrt, solange
  ein Job von der Karte läuft) und je Datei _Starten_ – **von der SD-Karte wie mit der
  FluidNC-WebUI, aber mit einem Halten**. Gesperrt, solange die Maschine nicht bereit ist, ein Job
  von der Karte läuft oder ein Job zwischen zwei Teilen auf den Werkzeugwechsel wartet; _Maschine
  nicht referenziert._ steht als Hinweis darüber. Teile, die die App in dieser Sitzung selbst aus
  einem geladenen Job vorbereitet hat (_Extras_, Start in Fräsen), kennt sie: Mit Fehlern oder wenn
  sie von der jetzigen Lage aus den Verfahrweg verlassen würden, bleiben sie gesperrt (_Start
  gesperrt: Der Job hat Fehler oder verlässt den Verfahrweg._); beim Start wird ihr Programm
  geladen, damit das gezeigte das laufende ist – erlaubt die Programmsperre das nicht (unten),
  startet nichts. **Ehrlich:** Dieser Start geht nicht durch die Startklar-Liste und nicht durch die
  Bestätigungen des Starts in Fräsen (kein Nullpunkt, Z unter der Sicherheitshöhe, Messtaster).
  Andere Dateien trägt die Karte mit _Diese Datei wurde nicht in der App geprüft._ und startet sie
  trotzdem. Der Weg mit allen Sperren und Bestätigungen ist die Hauptaktion in Fräsen. Ein Job von
  der Karte läuft auch bei abgerissener Verbindung weiter; PAUSE und NOT-HALT der App erreichen die
  Maschine dann nicht (das sagt die kritische Meldung).
- _Vorbereiten_ (Ansicht, nur mit Programm; mit ihr öffnet Job): die Karte _Material_ – _Woraus wird
  gefräst?_ mit den Materialien der Materialbibliothek (Menü → _Werkzeugliste_) – und darunter
  _Rohteil_. Empfohlen ist die Größe aus dem Job (Schnittbereich plus 5 mm Rand, Oberkante bei Z0;
  _Aus dem Job abgeleitet: X … × Y … × Z … mm_); eigene Maße (_Länge X_, _Breite Y_, _Dicke Z_, dann
  _Maße übernehmen (Nullpunkt vorne links oben)_, zurück mit _Aus dem Job_) stehen unter _Mehr
  Optionen_ und sind als _Eingetragen:_ mit Punkt markiert. Das Material ist die Grundlage der
  Schnittwert-Vorschläge (Fräsen → _Prüfen_ → _Werkzeuge des Jobs_, und im CAM), das Rohteil die der
  Prüfungen _Z-Tiefe_ (Rohteildicke) und Kollision und des Rohteils auf Tisch und 3D-Bild.
  Spannmittel stehen in Einrichten → _Nullpunkte_ (Karte _Spannmittel_), der Nullpunkt ebenda, das
  Werkzeug je T-Nummer in Fräsen → _Prüfen_ – nicht mehr hier.
- _Extras_ (Ansicht, nur mit Programm):
  - _Auf die Maschine:_ macht aus dem Job Dateien für die SD-Karte. Sie setzt `G21 G90 G17 G94`
    voran, wo die Datei Einheit und Absolutmaß vor der ersten Bewegung nicht selbst setzt (Estlcam),
    entfernt `G43 … H` (FluidNC kennt keine Werkzeugtabelle; die Karte nennt die Zahl der Zeilen)
    und trennt bei jedem Werkzeugwechsel in Teile (_Werkzeugwechsel: in n Teile getrennt. Nach jedem
    Teil Werkzeug wechseln und Z neu antasten._; Dateien wie `schild_1of2_T1.nc`), weil FluidNC bei
    `M6` nicht anhält. Je Teil: Zeilen und ungefähre Laufzeit, _Herunterladen_ und _Auf SD laden_
    (gesperrt ohne Verbindung, während ein Job von der Karte läuft und bei einem Teil mit Fehlern).
    Hochgeladen wird per HTTP an die Steuerung (der Simulator hat seine Karte im Browser). Weil die
    HTTP-Antwort nicht lesbar ist, liest die App die Karte danach neu und vergleicht Name und Größe:
    erst dann steht _… liegt auf der SD-Karte._ da, sonst _Upload nicht bestätigt_ (am Knopf ✓ bzw.
    ✗).
  - _Vorrichtungen mit Markern:_ eingeklappte Karte (ihre Überschrift klappt sie auf) mit den
    angelernten Vorrichtungen (Name, Marker, Größe, Job, erwartete Genauigkeit „etwa ± … mm“, Marke
    _liegt auf dem Tisch_), _Vorrichtung anlernen_ und _Marker drucken_. Ohne Programm steht die
    Karte unter der SD-Karte (ohne Verbindung allein), mit Programm hier unter _Auf die Maschine_.
    Drucken, Anlernen, Erkennen, Einmessen und die Genauigkeit stehen im Abschnitt „Abläufe über
    mehrere Bereiche“ beim Ablauf **Vorrichtungen mit Markern**.
- _Abläufe und laufender Job:_ Unter dem Programm (mit Programm: unter dem Umschalter _Vorbereiten_
  / _Extras_) melden sich bei Bedarf die Abläufe **Wenden**, **In Abschnitten** und die erkannte
  Vorrichtung; dieselben Karten stehen in Einrichten und Fräsen, beschrieben sind sie im Abschnitt
  „Abläufe über mehrere Bereiche“. Läuft ein Job, steht dort eine Zeile mit Name, Fortschritt,
  Restzeit, _Pause_ bzw. _Fortsetzen_ und _Zum Job_ (führt nach Fräsen).
- **Das Programm ist geschützt, solange ein Job unterwegs ist.** Als unterwegs gilt
  (`store/underway.ts`): ein Teil läuft von der SD-Karte, wird gestreamt oder hochgeladen; ein Job
  mit mehreren Werkzeugen steht zwischen zwei Teilen und wartet auf den Wechsel; die Verbindung riss
  unter einem Job ab und der Bediener hat die Meldung noch nicht gesehen; oder die Steuerung selbst
  meldet eine laufende SD-Datei (Lauf, Halt oder Tür – etwa nach einem Neuladen der Seite oder einer
  von Hand neu aufgebauten Verbindung). Eigene Fahrten der App (Antasten, Messen, Hinfahren) sind
  kein Job. Dann lädt, ersetzt oder entfernt nichts das Programm auf dem Tisch: Eine zentrale Sperre
  in `store/job.ts` gilt für jeden Weg (Datei ziehen oder öffnen, ein Job aus _Zuletzt verwendet_,
  _Beispiel laden_, die abgeleiteten Programme der Abläufe). Eine gezogene Datei oder ein Tipp auf
  _Zuletzt verwendet_ wird abgewiesen, **bevor** etwas geschieht – nichts wird gelesen, die App
  wechselt nicht nach Job – mit einer Warnung: „Ein Job ist unterwegs: das Programm auf dem Tisch
  bleibt, wie es ist. Nach dem Job – oder wenn er in Fräsen beendet wird – lässt es sich ändern.“
  Sie nennt Ursache, die Auswirkung (nichts wurde verändert) und den Ausweg: den Job zu Ende laufen
  lassen oder in Fräsen beenden (_Job abbrechen_, zwischen zwei Teilen _Restliche Teile abbrechen_).
  Der Dateidialog öffnet sich trotzdem; die Wahl wird mit derselben Meldung abgewiesen. Das CAM
  ändert das Programm unter einem Job nie (siehe Abschnitt „CAM“).

### CAM

_CAM_ (der Reiter; lang „Zeichnen/CAM“) – ein einfaches CAM wie Estlcam: zeichnen oder DXF/SVG
laden, das Teil auf dem Tisch-Bild zurechtrücken, den G-Code daraus machen lassen. Im CAM ist nur
das CAM zu sehen.

- _Hinein und zurück:_ der Reiter _CAM_, der Knopf _Zeichnen / DXF_ auf der Programmkarte im Job
  (ohne Programm neben _Beispiel laden_, mit Programm neben _Andere Datei öffnen_), der Knopf
  _Zeichnen_ am Serien-Punkt der Startklar-Liste und die Schnellsuche öffnen alle denselben Bereich:
  eine leere Zeichnung, wo noch keine ist, und den Tisch von oben. Ein geladenes Programm oder ein
  laufender Job wird dabei nie abgenommen. Die Zeichnung bleibt stehen, wenn man die Reiter
  wechselt; _Zurück zum Job_ (oben links) führt in den Job.
- _Was der Bereich zeigt:_ nur das CAM (siehe „Oberfläche im Überblick“): den Tisch mit der
  Zeichnung und ihre Karten im Panel. Dazu fehlen hier die Laufleiste eines laufenden Jobs, die
  Programmkarte, die Kamera-Einblendung und die Ablauf-Karten (Wenden, Abschnitte, Vorrichtung – sie
  stehen in Job, Einrichten und Fräsen). Die Bühne zeigt nur den Tisch, ohne den Umschalter Tisch ·
  Kamera · 3D und ohne _Folgen_ und Joystick; Tipp-Werkzeuge und Spannmittel greift der Finger dort
  nicht, getippte Punkte und Messlinien der Bühnenwerkzeuge werden nicht gezeichnet. Wird von hier
  das Jog-Feld verlangt (etwa über die Suche), öffnet es sich über Einrichten.
- _Die Zeichnung in drei kurzen Schritten_ – drei Karten von oben nach unten; die Zeichnung liegt
  dabei auf dem Tisch und lässt sich dort wie in einem Zeichenprogramm anfassen. Oben stehen neben
  _Zurück zum Job_ die Knöpfe _Rückgängig_ und _Wiederholen_ (als Symbole).
  - _1 · Zeichnen_ – **ein Tipp** auf _Rechteck_, _Kreis_, _Langloch_, _Lochraster_ oder _Text_ legt
    die Form sofort auf das Tisch-Bild: in üblicher Größe, ausgewählt, dort wo man hinsieht (das
    erste Teil mit der Ecke auf dem Nullpunkt, jedes weitere mitten in das gewählte Teil, ohne
    Auswahl in die Zeichnung; liegt die Stelle nicht im Bild, in die Bildmitte). Kein Formular
    vorher. _Datei (DXF, SVG)_ lädt ASCII-DXF aus Fusion, LibreCAD … (Linien, Bögen, Kreise,
    Polylinien mit Bögen, Splines, Ellipsen; die Einheit aus `$INSUNITS`, ohne Angabe mm) oder SVG
    aus Inkscape, Illustrator … (Pfade mit allen Befehlen, Rechteck, Kreis, Ellipse, Linie,
    Polylinie, Polygon, Gruppen-Transformationen; Größe in mm aus `width`/`height`/`viewBox`). Was
    nicht übernommen wird (Text als Text, Bilder, Klone, unbekannte Elemente; bei DXF Text, Blöcke,
    Schraffuren), steht danach da, ebenso was nur zum Teil oder womöglich falsch gelesen wurde (ein
    Pfad mit Fehler – gelesen bis zur Stelle –, eine nicht lesbare Verschiebung oder Drehung, eine
    Datei ohne Größe in mm – dann 96 Punkte pro Zoll). Eine Datei, in der nichts zu fräsen ist, und
    eine unlesbare Datei sagen es auch.
    - **Auf dem Tisch:** Das gewählte Teil hat Griffe – Ecken und Seiten ändern die Größe (Rechteck
      Breite/Höhe, Kreis den Durchmesser, Langloch Länge/Breite, Text die Schrifthöhe, Lochraster
      den Lochabstand, eine Datei gleichmäßig), der Punkt darüber dreht (rastet in der Nähe von
      15°-Schritten ein), die Linie verschiebt. Solange man zieht, steht das Maß am Teil; die
      Fräsbahn kommt beim Loslassen. Tipp auf eine Linie wählt aus (ein Text lässt sich an seinem
      Rahmen greifen), Tipp daneben lässt los; innerhalb einer Form verschiebt der Finger die
      Ansicht, und ein zweiter Finger lässt das gegriffene Teil los.
    - **In Zahlen:** Unter den Formen stehen die Werte des gewählten Teils – seine eigenen Maße
      (Breite, Höhe, Eckenradius, Durchmesser, Länge, Löcher quer/hoch mit Lochabstand, Text und
      Schrifthöhe …), Lage (X links und Y unten, bei Kreis und Langloch die Mitte) und Winkel. Jede
      Zahl ändert das Bild sofort; gezeichnete Formen und Texte bleiben änderbar, bei einer Datei
      ändern sich Breite und Höhe zusammen. Daneben _Löschen_, _Duplizieren_, _↺ 90°_ und _↻ 90°_,
      _Spiegeln ↔_ und _Spiegeln ↕_ und unter _Mehrfach anordnen_ Spalten × Reihen mit Abstand; ohne
      Auswahl bietet die Karte _Alles auswählen_.
    - **Rückgängig / Wiederholen** (100 Schritte; Änderungen an einem Feld hintereinander sind ein
      Schritt) – Löschen fragt deshalb nicht nach.
    - **Tastatur (Laptop; alle Tasten zeigt `?`):** Entf/Rücktaste löscht, Esc hebt die Auswahl auf
      (läuft ein Job, fragt Esc stattdessen, ob er abgebrochen werden soll), Pfeiltasten schieben um
      1 mm (Umschalt 10 mm, Alt 0,1 mm), Strg/Cmd+Z und +Umschalt+Z bzw. Strg+Y, Strg/Cmd+D
      dupliziert, +C/+V kopiert in der Zeichnung, +A wählt alles. Nie, solange in einem Feld getippt
      wird – und nie an die Maschine. Die Bühnentasten `T` · `K` · `D` ruhen im CAM (die Suche führt
      von dort nach Einrichten); `E`, `?` und die Suche gelten weiter.
    - **Text:** Einlinien-Schrift mit ÄÖÜß, Ziffern und Satzzeichen, mehrere Zeilen; die Schrifthöhe
      ist die der Großbuchstaben, die Strichbreite kommt vom Werkzeug (V-Fräser oder dünner
      Schaftfräser). Ausrichtung, Buchstaben- und Zeilenabstand unter _Schrift: Ausrichtung und
      Abstände_; Zeichen, die die Schrift nicht kennt, bleiben frei und stehen in einem Hinweis.
  - _2 · Wie wird gefräst?_ – die Liste der Teile: je Teil _Außen_, _Innen_, _Linie gravieren_,
    _Tasche_, _Bohren_ oder _Nicht fräsen_ (Bohren: passend zum Fräser wird gepeckt, ein größeres
    Loch mit einer Helix gebohrt; offene Konturen lassen sich nur gravieren), eine eigene Tiefe und
    ein × zum Entfernen. Weitere Wahl nur, wo sie gilt: _Haltestege_ (bei Außen und Innen; an festen
    Stellen der gezeichneten Kontur, Schruppen und Schlichten heben an denselben Stellen), die Ecken
    – _Ecken rund_, _Ecken frei (diagonal)_ (Dogbone) oder _Ecken frei (längs)_ (T-Bone), damit ein
    eckiges Teil hineinpasst; nur bei Konturen mit Innenecken – und die Seite, _Vorderseite_ oder
    _Rückseite_ (nur bei beidseitigen Teilen). _Zeichnung leeren_ nimmt alles weg (auch das lässt
    sich zurücknehmen). Darunter Werkzeug (aus der Werkzeugliste), Tiefe und Vorschub; _Werte aus
    Werkzeug und Material vorschlagen_ braucht das Material aus Job → _Vorbereiten_; unter
    _Erweitert_ Gravurtiefe, Schlichtzugabe (0 = aus; schruppen, dann ein Schlichtgang in voller
    Tiefe), Zustellung, Eintauchen, Drehzahl, Rampe (90° = senkrecht), Bahnabstand Tasche, Sichere
    Höhe, Stegbreite, Steghöhe, Stege je Kontur und _Gleichlauf (sonst Gegenlauf)_. Jeder Wert
    ändert die Bahn auf dem Tisch sofort. Ein einzelnes Teil kann seine eigene _Laufrichtung_
    haben (_wie der Job_ · _Gleichlauf_ · _Gegenlauf_, auf der Zeile des Teils bei außen, innen und
    Tasche; für gebohrte Löcher gibt es die Wahl nicht). Hat das gewählte Werkzeug eigene
    Schnittwerte (_Werkzeugliste_), nimmt _Werte aus Werkzeug und Material vorschlagen_ sie auch ohne Material.
  - _3 · Ansehen und übergeben_ – die Bahnen stehen schon auf dem Tisch-Bild und werden bei jeder
    Änderung neu gemacht. Reihenfolge: Bohrungen, Taschen und Gravuren, Ausschnitte, die Außenkontur
    jedes Teils zuletzt – was in einer Kontur liegt, vor ihr; dazwischen kurze Wege. Was nicht geht
    (Werkzeug zu groß, Kontur offen, Bohren nur bei Kreisen ab Werkzeugdurchmesser) und was die
    beiden Seiten einander tun, steht hier in Klartext. _G-Code erzeugen_ legt das Programm auf den
    Tisch und führt in den Job (Ansicht _Vorbereiten_); geprüft und gefräst wird dann wie jeder Job:
    Startklar-Liste und Simulation in Fräsen → _Prüfen_, Start in _Fräsen_. Gesperrt ist der Knopf,
    solange nichts zu fräsen ist, ein Job läuft oder ein Hinweis zu den zwei Seiten ihn sperrt
    (siehe _Von beiden Seiten fräsen_). _Als .nc speichern_ lädt das eigene Programm herunter (bei
    zwei Seiten beide Dateien). Ein Programm, ein Werkzeug: Gravur mit V-Fräser und Ausschnitt mit
    Schaftfräser sind zwei Programme. _Projekt speichern_ schreibt die Zeichnung (Formen, wie jedes
    Teil geschnitten wird, die zwei Seiten, die Schnitteinstellungen – kein Programm) als Datei
    `*.lowrider.json`; _Projekt öffnen …_ (unter den Formen) liest sie wieder ein, ersetzt die
    Zeichnung in einem Schritt, den _Rückgängig_ zurücknimmt, und lädt nie selbst ein Programm. Eine
    Datei, die sich nicht lesen lässt, wird mit dem Grund abgelehnt, ohne etwas zu öffnen.

- **Zeichnung und Programm auf dem Tisch:** Liegt auf dem Tisch nichts oder das Programm dieser
  Zeichnung, folgt es jeder Änderung. Liegt ein anderes Programm dort (eine später geöffnete Datei,
  das ausgerichtete Programm der Demo, die Rückseite), sagt das ein Hinweis; die Zeichnung bleibt im
  CAM zu sehen und zu bearbeiten, aber das fremde Programm ersetzt nie eine Änderung, sondern erst
  ein Tipp: _Zeichnung auf den Tisch legen_ (der Knopf im Hinweis), _G-Code erzeugen_ oder die
  Serie, sobald sie Rohlinge gefunden hat – ein ausgerichtetes Programm danach neu ausrichten. Läuft
  ein Job (was als unterwegs gilt, steht im Abschnitt „Job“ unter „Das Programm ist geschützt“),
  ändert die Zeichnung sein Programm nie, und auch sonst nimmt kein Weg das Programm ab oder ersetzt
  es; ein Hinweis nennt den Stand, und _Zeichnung auf den Tisch legen_, _G-Code erzeugen_ und _Serie
  für … erzeugen_ sind gesperrt. Hat sich die Zeichnung während des Jobs geändert, kommt sie nach
  dem Job von selbst auf den Tisch, wo nichts geladen war und das Ende bei bestehender Verbindung zu
  sehen war; wo das Programm des Jobs noch liegt, bleibt es samt Zusammenfassung geladen, bis ein
  Tipp auf _Zeichnung auf den Tisch legen_ es ersetzt; hat sich die Zeichnung während des Jobs nicht
  geändert, folgt das Programm den Änderungen wie gewohnt.

- **Von beiden Seiten fräsen** ist ein Häkchen in der Karte _2 · Wie wird gefräst?_ (unter der Liste
  der Teile). Mit ihm bekommt jedes Teil mit einer Bearbeitung _Vorderseite_ oder _Rückseite_;
  gezeichnet wird alles so, wie es von vorn aussieht (die Rückseite liegt gestrichelt auf dem
  Tisch-Bild), gespiegelt wird beim Fräsen von selbst: Die Rückseite ist die gespiegelte Zeichnung,
  neu geschnitten – nie eine gespiegelte Bahn –, darum bleiben Gleich-/Gegenlauf und Haltestege, wie
  gewählt; ein Text für die Rückseite wird an Ort und Stelle gewendet. Dazu: wie das Teil gewendet
  wird (_Wie eine Buchseite_ oder _Über die Vorderkante_, mit Bild), die Materialdicke (leer = Höhe
  des Rohteils), wie es wiedergefunden wird (_Mit der Kamera_ oder _Mit Passstiften_ – die Wahl gibt
  es nur bei kalibrierter Kamera, sonst gilt _Mit Passstiften_) und zwei **Passlöcher** – Bohrungen
  neben dem Teil, nach denen die Rückseite ausgerichtet wird; mit der Kamera gehen sie durchs
  Material, mit Stiften 6 mm in die Opferplatte. Die App schlägt sie vor (weit auseinander, neben
  dem Teil, wo Rohteil und Spannmittel Platz lassen); mit dem Finger verschoben, rasten sie
  waagrecht oder senkrecht zueinander ein, _Neu vorschlagen_ holt sie zurück. Hinweise in Klartext:
  Vorder- und Rückseite schneiden zusammen durch, treffen sich absichtlich (dieselbe Form von beiden
  Seiten), lassen unter 1 mm stehen; der Umriss löst das Teil schon auf der Vorderseite; ein
  Passloch liegt auf einer Bahn, im Teil oder neben dem Rohteil; noch nichts auf der Rückseite (dann
  entsteht ein Job für eine Seite). _G-Code erzeugen_ ist gesperrt, sobald etwas auf der Rückseite
  liegt und die Materialdicke fehlt, ein Passloch auf einer Bahn liegt oder (mit Stiften) die
  Passlöcher schräg zueinander liegen. Es entstehen zwei Programme (`…_vorderseite.nc` mit den
  Passlöchern liegt auf dem Tisch, `…_rueckseite.nc` hält der Ablauf bereit); weiter geht es im
  Ablauf **Wenden** (Karte in Job, Einrichten und Fräsen; siehe Abschnitt „Abläufe über mehrere
  Bereiche“).

- **Serie: auf Rohlinge verteilen** (Karte _Viele gleiche Teile?_ unter _3 · Ansehen und übergeben_)
  bringt die Zeichnung als Motiv auf viele Rohlinge, die verstreut auf dem Tisch liegen –
  Untersetzer, Schlüsselanhänger, Brettchen –, ohne jeden einzeln auszurichten. Der Knopf _Serie:
  auf Rohlinge verteilen_ braucht ein Motiv mit einer Bearbeitung und ist bei _Von beiden Seiten
  fräsen_ aus; gefunden wird mit der eingerichteten Kamera, erzeugt nur bei bestehender Verbindung.
  Ein kurzer Ablauf anstelle der Karten der Zeichnung, mit _Zur Zeichnung_ zurück:
  1. _Rohlinge finden_ – _Auf dem Tisch-Bild suchen_, wie es ist, oder nach _Tisch scannen (halten)_
     (danach _Tisch neu scannen (halten)_; der Bereich steht unter _Bereich ändern_, mit
     Zeitschätzung). Die Rohlinge liegen mit etwas Abstand, alle gleich dick, mit Doppelklebeband
     festgeklebt oder an einem Anschlag. Gefunden wird jede helle Fläche auf dunkler Unterlage (oder
     umgekehrt) mit klarem Rand: Mitte, Größe und Drehung aus der Form (lange Seite eines Rechtecks,
     eine Seite eines Quadrats; rund = keine Drehung). Streng wie die anderen Sucher: Was am
     Bildrand liegt, sich berührt oder sich zu wenig abhebt, wird nicht übernommen – gelb
     gestrichelt im Bild, mit dem Grund und was zu tun ist (_Rohlinge berühren sich (oder die Form
     hat eine Einbuchtung) – etwas auseinanderlegen._).
  2. _Motiv prüfen_ – das Motiv steht als Fräsbahn auf jedem Rohling, auf dessen Mitte gelegt und
     mit ihm gedreht; die Nummern im Bild sind die Reihenfolge beim Fräsen (angefangen vorn links,
     danach immer der nächste). Ein Tipp auf einen Rohling im Bild (oder sein Häkchen in der Liste)
     lässt ihn aus oder nimmt ihn wieder dazu, _Drehen_ in der Liste stellt das Motiv auf den Kopf
     (bei quadratischen und runden: 90°). Unter _Was kommt auf jeden Rohling?_ steht statt _Das
     Motiv_ auf Wunsch **ein Name aus einer Liste** (_Ein Name je Rohling_, eine Zeile pro Rohling)
     oder eine **laufende Nummer** (_Laufende Nummer_ mit _Erste Nummer_) – sie ersetzen den Text
     der Zeichnung, gleiche Schrifthöhe, mittig an seiner Stelle, und brauchen deshalb einen Text in
     der Zeichnung. Ragt ein Motiv über den Rand (oder kommt ihm – mit der Breite des Fräsers –
     näher als 1 mm), steht der Rohling mit Nummer in einer Warnung; ebenso fehlende Namen, übrige
     Namen und Zeichen, die die Schrift nicht kennt. Genauigkeit: vom Tisch-Bild etwa 0,2–0,5 mm,
     bei dicken Rohlingen eher mehr; _Mit der Kamera nachmessen (halten)_ fährt die Kamera über
     jeden Rohling und misst ihn in der Bildmitte des Livebilds, etwa 0,1 mm. Rohlinge, die größer
     sind als ein Kamerabild, und solche, die im Livebild nicht sicher erkannt werden, behalten die
     Lage vom Tisch-Bild (ein Hinweis nennt sie).
  3. _Fräsen_ – _Serie für … erzeugen_ macht ein Programm (`…_serie_5x.nc`, die Zahl der Rohlinge
     steht im Namen und damit in _Service → Historie_) und führt in den Job (Ansicht _Vorbereiten_);
     Startklar-Liste und Spannmittel-Prüfung wie bei jedem Job in Fräsen → _Prüfen_, gefräst wird in
     _Fräsen_. Ein Nullpunkt je Rohling ist nicht nötig: Die Rohlinge liegen auf dem Tisch
     (Maschinenkoordinaten), das Programm zählt vom X/Y-Nullpunkt, wie er gerade ist – wird er
     danach neu gesetzt, rechnet die App das Programm neu (nicht unter einem laufenden Job), und die
     Startklar-Liste sperrt den Start, falls das nicht ging oder die Serie nachträglich gedreht
     wurde. Nur **Z0 muss auf der Oberfläche eines Rohlings** stehen (am besten schon vor dem
     Scannen: von dort zählt die Kamerahöhe); deshalb alle Rohlinge gleich dick. Jeder Rohling wird
     fertig, ehe der nächste kommt; dazwischen fährt der Fräser auf der Sicheren Höhe (unter
     _Erweitert_). Das Programm liegt nach jeder Wahl im Ablauf schon auf dem Tisch, das Bild ist
     also die Vorschau; _Zur Zeichnung_ legt das eigene Programm der Zeichnung dorthin zurück, wo
     das der Serie lag.

### Einrichten und Jog / Manuell

_Einrichten_ (Reiter) fragt „Wo liegt das Werkstück?“ und hat vier Ansichten: _Nullpunkte_ ·
_Antasten_ · _Kamera_ · _Ausrichten_. Die Bühne zeigt hier das Livebild, wo eine kalibrierte Kamera
läuft, sonst den Tisch. Der Reiter zeigt ✓ ⚠ ✕ ○ für Verbindung, Referenzfahrt, Nullpunkt,
Vorrichtung, Wenden und Abschnitte; wo einer dieser Abläufe läuft, steht seine Karte oben im
Bedienfeld. Eine Hauptaktion in der Aktionsleiste gibt es hier nicht.

- **Jog / Manuell:** _Jog_ unten links in der Aktionsleiste legt das Feld über das Bedienfeld jedes
  Bereichs außer dem CAM (wo das Bedienfeld ein Blatt ist, als Blatt unten); auch Start und
  Schnellsuche öffnen es, und wo es im CAM keinen Jog-Knopf gibt, landet es über _Einrichten_. _Jog
  schließen_ oder jeder Wechsel des Bereichs schließt es; über den Listen von Service und
  Einstellungen bringt es das Bild zurück. XY-Kreuz mit _Stopp_ in der Mitte, Z daneben (A−/A+ in
  Grad, wo das Profil eine Drehachse hat), Achsen in ihren Farben; Schrittweiten 0,01 · 0,1 · 1 · 10
  mm und _Dauer_. Unter dem Kreuz steht die Antwort der Steuerung auf den letzten Befehl (_ok_ oder
  _error:n_ mit Bedeutung). Gejoggt wird nur, wenn die Maschine steht oder joggt; was fehlt
  (Verbindung, Referenzfahrt, Software-Endschalter im Profil aus, Verfahrweg nur Platzhalter), sagt
  eine Zeile oben im Feld.
- _Schritt und Dauer:_ ein Tipp ist ein Schritt; schnelle Tipps addieren sich (jeder zählt vom Ziel
  der laufenden Fahrt). Läuft die Maschine noch aus (nach _Dauer_), wartet der Schritt, bis sie
  steht – und geht nicht hinaus, wenn sie nicht zur Ruhe kommt; eine Meldung sagt es. _Dauer_: Taste
  halten fährt, Loslassen, Abrutschen oder das Verlassen der App stoppt sofort – bis zur
  Verfahrweg-Grenze, wenn alle Achsen referenziert sind und die Software-Endschalter im Profil an
  sind, sonst höchstens 200 mm (Z 50 mm) je Halten.
- _Software-Endschalter:_ Sind alle Achsen referenziert und im Maschinenprofil an, wird jeder Jog
  (Schritt, _Dauer_, Joystick, _Hinfahren_) auf den Verfahrweg begrenzt: Jede Taste zeigt _noch …
  mm_ und sperrt an der Grenze, ein gekürzter Jog steht im Protokoll. Vorher begrenzt die App
  nichts.
- _Schnellaktionen_, jede ein Halten und jede mit ihrem Grund, wenn sie nicht geht: _Gehe zu Null_
  (X/Y zum Werkstück-Nullpunkt; Z fährt nie hinunter und hebt vorher nur an, wenn _Vorher auf
  sichere Höhe anheben_ an und die Maschine referenziert ist), _Parkposition_ (eine gemerkte Stelle
  in Maschinenkoordinaten; braucht die Referenzfahrt, geht erst auf Sicherheitshöhe, dann hin) und
  _Referenzfahrt_ (geht auch aus dem Alarm). Ist eine Werkzeugwechsel-Position gemerkt, kommt als vierte
  _Werkzeugwechsel_ dazu (hebt erst auf die Sicherheitshöhe, dann hin).
- _Tastatur, Maus, Gamepad_ (bei offenem Jog-Feld; die Tasten ruhen, solange ein Feld den Fokus hat
  oder ein Dialog offen ist): Pfeile X/Y, `Bild↑/↓` Z, `1`–`5` Schrittweite (`5` = _Dauer_, dann
  fährt die gehaltene Taste), `Esc` stoppt. _Mausrad-Feinjog_ (nur mit Maus): fährt die zuletzt
  bewegte Achse, höchstens 0,1 mm je Raste und nur solange die Maustaste auf dem Feld gehalten ist.
  Gamepad: linker Stick X/Y, rechter Stick Z als Dauerfahrt (ab starkem Ausschlag volle
  Geschwindigkeit), Steuerkreuz und Schultertasten ein Schritt, B stoppt.
- _Mehr Optionen_ im Jog-Feld: Schritt 100 mm; _Bedienart_ **Handrad** (Touch-Handrad: je 24°
  Drehung ein Schritt auf X, Y oder Z) und **Joystick** (nur X/Y; je weiter gezogen, desto schneller
  – die Geschwindigkeit wächst mit dem Quadrat des Ausschlags, in der Mitte liegt ein kleiner
  Totbereich; Loslassen stoppt sofort); _Parkposition_ (aktuelle Stelle merken oder vergessen);
  _Werkzeugwechsel-Position_ (ebenso; bei laufendem Job nicht zu ändern, denn der Job fährt dorthin);
  _Merkpunkte_ (bis zu 12 benannte Stellen in Maschinenkoordinaten: _Position merken_, _Anfahren:
  Name_ als Halten, das erst anhebt; derselbe Name verschiebt; nur bei referenzierter Maschine);
  _Einzelne Achsen und Entsperren_ (Eingänge live: Endschalter X/Y/Z und Tastplatte; _Ref. X_ ·
  _Ref. Y_ · _Ref. Z_ und _Entsperren ($X)_ als Halten; _Pause_ und _Fortsetzen_); _Makros_ (Halten;
  angelegt unter _Einstellungen → Maschine → Makros_).
- _Nullpunkte_ – **Nullpunkt setzen**, der eine Weg, in vier Schritten (ein Tipp bewegt nie die
  Maschine): _1 · Ziel im Bild antippen_ (zeigt nur das Ziel; X/Y in Werkstück-Koordinaten auch als
  Zahl korrigierbar) → _2 · Hinfahren_ (_Kamera hinfahren_ über das Fadenkreuz oder _Fräser
  hinfahren_ – die Wahl gibt es nur mit kalibrierter Kamera; Halten; steht Z unter der
  Sicherheitshöhe und _Vorher auf sichere Höhe anheben_ ist aus, muss erst „Der Weg ist frei“
  bestätigt werden) → _3 · Fein korrigieren_ (0,01 / 0,1 / 1 mm oder _Eigener Schritt_; darunter
  steht, wo Fadenkreuz oder Fräser jetzt steht) → _4 · Nullpunkt setzen_ (_Nullpunkt hier setzen_,
  Halten). Gesetzt werden **X/Y**; die Höhe kommt danach aus _Antasten_ oder _Z = 0_.
  - _Nullpunkte dieses Jobs_ (mit geladenem Programm): die letzten fünf Nullpunkte, mit denen der
    Job gestartet oder mit _4 · Nullpunkt setzen_ gesetzt wurde; _X/Y wiederherstellen_ (Halten)
    holt X/Y zurück, Z nicht – es hängt vom Werkzeug ab.
  - _Spannmittel_ als Liste (dieselben Zonen wie das Bühnenwerkzeug): _Auf dem Tisch antippen_, je
    Zeile _Maße_ und _Löschen_, eingeklappt _Maße von Hand_ (X/Y zählen ab dem Nullpunkt, die Höhe
    ab Z0).
  - _Mehr Optionen:_ _Nullpunkt (Werkstück)_ mit _X = 0_ · _Y = 0_ · _Z = 0_ · _XY = 0_ · _XYZ = 0_
    (ein Tipp: die aktuelle Position wird Nullpunkt des aktiven Systems) und _Koordinatensystem_
    G54–G59 (je Spannposition eins, der Job nutzt das aktive; mit Offset, Werkzeuglängenkorrektur
    und _Neu lesen_). _Alle Parameter:_ _Nullpunkt-Speicher_ – Nullpunkte wiederkehrender
    Aufspannungen mit Name und Foto, _Übernehmen_ und _Löschen_ als Halten.
- _Antasten:_ Kacheln mit Skizze und Bewegungsrichtung – _Z-Oberfläche_ · _Ecke_ · _Kante_ ·
  _Bohrungsmitte_ · _Werkzeuglänge_ · _Winkel ausrichten_; jeder Zyklus ist ein Halten.
  - _Z antasten_ (Tastplatte, Klemme am Fräser; Plattendicke, Suchweg, Vorschub, Rückzug; der
    Kontakt wird live angezeigt): setzt Z sofort und sagt, wie weit der Nullpunkt gewandert ist;
    _Verwerfen: zurück zum bisherigen Z-Nullpunkt_ nimmt es zurück.
  - _Ecke_ (X/Y/Z, eine der vier Ecken, mit _Ecken-Tastplatte_ oder – nur bei leitendem Werkstück –
    _Ohne Platte_), _Kante_ (X+ · X− · Y+ · Y−) und _Bohrungsmitte_ (X/Y der Mitte und Durchmesser
    in X und Y) **messen nur**: Das Ergebnis zeigt die Abweichung zum bisherigen Nullpunkt, dann
    _Nullpunkt übernehmen_ oder _Messung verwerfen_.
  - _Werkzeuglänge_ auf dem Werkzeuglängensensor: Sensorposition einmal speichern; erst das
    Referenzwerkzeug messen (_Als Referenz merken_), nach jedem Wechsel messen und _Längenkorrektur
    setzen_ (`G43.1`).
  - _Winkel ausrichten_ tastet nichts an: zwei Tipps im Bild entlang einer Kante, der Job wird
    gedreht statt des Bretts; _Winkel als Zahl eingeben_ führt zu _Ausrichten_.
- _Kamera:_ oben das Tägliche – _Bohrung zentrieren → Nullpunkt X/Y_ (Halten): die Kamera grob über
  eine Bohrung fahren, die App zentriert sie selbst und setzt den Nullpunkt X/Y, ohne Antasten (die
  Bohrung muss ganz im Bild sein; _Helle Bohrung auf dunklem Material_ schaltet um). Darunter eine
  Zeile mit Bildquelle und Kamerahöhe und _ändern_. Eingeklappt, was seltener gebraucht wird: _Zwei
  Bohrungen: Nullpunkt und Drehung_ (Lage beider Bohrungen im Job eintragen, jede zentrieren:
  Bohrung 1 legt den Nullpunkt fest, Bohrung 2 den Winkel, der Job wird passend gedreht; weicht der
  Lochabstand um mehr als 1 mm vom Job ab, wird nichts übernommen), _Fläche scannen_ (Fotokarte) und
  _Mitschnitt_ (der Pi nimmt die Fräser-Kamera während des Jobs auf). Ist das Kamerabild aus, steht
  oben _Kamera einschalten_; läuft es, ist aber nicht kalibriert, _Kamera einrichten_ – dann fehlen
  _Zwei Bohrungen_ und _Fläche scannen_. Bildquelle, Kalibrieren (Maßstab, Versatz), Kamerahöhe und
  Zeitraffer stehen einmalig unter _Einstellungen → Kamera_. Steht Z nicht auf Kamerahöhe, warnt die
  Bühne („angetippte Punkte am Bildrand ungenau“) und bietet _Auf Kamerahöhe fahren_ (Halten).
- _Ausrichten_ (braucht ein Programm; sonst ein Hinweis mit _Zum Job_), zwei eingeklappte Karten:
  _Ausrichten (Drehen/Verschieben)_ dreht und verschiebt den Job im G-Code, weil FluidNC kein `G68`
  kennt – Drehung (gegen den Uhrzeigersinn), X/Y-Versatz, Drehpunkt _Nullpunkt_ oder _Job-Mitte_,
  ein gemessener Kamerawinkel lässt sich übernehmen; _Ausgerichteten Job laden_ legt ein neues
  Programm an, _Original wiederherstellen_ geht zurück. _Autolevel (Höhenraster)_ für V-Carve auf
  welligen Platten: tastet ein Raster über dem Job ab (2–12 Punkte je Achse, Rand, Sicherheitshöhe,
  Suchweg; _Raster tasten_ ist ein Halten; Klemme an den Fräser, Oberfläche leitend oder Taster),
  zeigt die Höhen und führt mit _Auf den Job anwenden_ jede Bahn der Oberfläche nach.
- _Werkzeuge auf der Bühne_ (Ansichten _Tisch_ und _Kamera_ gleich, in jedem Bereich außer CAM;
  nicht in 3D): _Hinfahren_ – Stelle antippen, _Kamera hierhin_ (nur mit kalibrierter Kamera) oder
  _Fräser hierhin_ halten (vorher auf sichere Höhe, wenn referenziert, begrenzt auf den Verfahrweg;
  nicht referenziert fährt es relativ, ohne Anheben). _Nullpunkt_ in zwei Schritten – **1 · Ecke:**
  Werkstückecke antippen, in der Lupe ziehen oder mit den Pfeilen (0,1 / 1 mm) fein nachsetzen, die
  App zeigt, um wie viel der Nullpunkt wandert, _Nullpunkt X/Y setzen_ halten (die Maschine fährt
  dabei nicht; die Marke wird der Nullpunkt); **2 · Kante:** zwei Punkte entlang einer geraden
  Kante, _Job danach ausrichten_ (immer vom Job wie geladen aus, zweimal messen dreht also nicht
  doppelt) – ohne Job merkt _Winkel zum Ausrichten übernehmen_ den Winkel. Im Kamerabild rastet der
  Tipp auf Ecke bzw. Kante des Werkstücks ein, wenn es sich klar vom Tisch abhebt. _Messen_ – zwei
  Punkte: Abstand, ΔX, ΔY, Winkel und Maßlinie im Bild; ein dritter Tipp misst vom letzten Punkt
  weiter, Punkte lassen sich nachziehen; im Kamerabild rastet ein Tipp auf ein Loch in dessen Mitte
  ein und nennt den Durchmesser (Lochabstand = zwei Tipps). Genauigkeit: am Fadenkreuz genau, zum
  Bildrand hin und auf der Fotokarte etwa 0,2–0,5 mm. _Spannmittel_ – antippen, wo eine Zwinge (60 ×
  40 mm, 30 mm hoch) oder Schraube (Ø 12 mm, 5 mm hoch) sitzt; die Markierung ziehen, an den Ecken
  in der Größe ändern, Höhe einstellen (± 5 mm oder tippen), löschen. Spannmittel liegen fest auf
  dem Tisch (Maschinenkoordinaten) und bleiben dort, wenn der Nullpunkt wandert. _Joystick_ – ein
  Schalter am Ende der Werkzeugleiste legt denselben Joystick in die Ecke der Bühne.

### Abläufe über mehrere Bereiche: Wenden, In Abschnitten, Vorrichtungen mit Markern

Drei Aufgaben brauchen mehr als einen Handgriff und mehr als einen Reiter: ein Teil von beiden
Seiten, ein Teil länger als der Tisch, eine Vorrichtung, die immer wieder auf dem Tisch liegt. Jede
hat eine **Ablauf-Karte** (_Beidseitig: Name_, _In Abschnitten: Name_, _Vorrichtung „Name“
erkannt_). Sie steht in **Job** (unter der Programmkarte und, mit Programm, dem Umschalter
_Vorbereiten_ / _Extras_), in **Einrichten** (unter dem Umschalter der vier Ansichten, über deren
Inhalt) und in **Fräsen** (unter dem Umschalter, in beiden Ansichten, _Prüfen_ und _Fräsen_) – und
nur, solange der Ablauf läuft; die Karte der Vorrichtung nur, wenn es etwas zu sagen gibt. Im
**CAM**, in **Service**, in **Einstellungen**, auf dem Start-Bildschirm und auf dem Telefon (unter
600 px, nur Überwachung) steht keine. Die Karte sagt, wo der Ablauf steht und was jetzt zu tun ist;
das Fräsen jedes Teils bleibt, was es immer ist (_Fräsen → Prüfen_, dann _Fräsen_). Die Punkte der
Abläufe stehen in der Startklar-Liste (Karte _Startklar?_ in _Fräsen → Prüfen_), sperren dort den
Start, wo es nötig ist, und zählen für den Zustand ✓ ⚠ ✕ ○ des Reiters _Einrichten_. Ehrlich zum
Stand: Alle drei sind bisher nur am Simulator, an gerechneten Fällen und mit künstlichen Bildern
geprüft; an der echten Maschine ist nichts abgenommen (Prüfpunkte:
[docs/erste-schritte.md](docs/erste-schritte.md), 4b, 4d, 4e).

- **Beidseitig: der Ablauf „Wenden“** – entsteht im CAM mit _Von beiden Seiten fräsen_ (Rückseite,
  Wendeart, Passlöcher und die Wahl _Mit der Kamera_ / _Mit Passstiften_ – die gibt es nur mit
  eingerichteter Kamera – stehen dort); die Karte _Beidseitig: Name_ erscheint, sobald _G-Code
  erzeugen_ die zwei Programme gemacht hat. Es gibt ihn nur für eine Zeichnung aus dem CAM (nicht
  für fertigen G-Code aus anderen Programmen), und das Teil wird einmal gewendet. Die Karte zählt
  die Schritte _Vorderseite fräsen_ → _Teil wenden_ → _Passlöcher finden_ → _Rückseite fräsen_ (mit
  Passstiften entfällt _Passlöcher finden_, und der zweite Schritt heißt _Teil wenden, auf die
  Stifte_) und kommt von selbst ins Bild, wenn ein Schritt die Hände braucht.
  - **Vorderseite:** wie jeder Job; sie bohrt auch die zwei Passlöcher (Ø 6, 8, 10 oder 12 mm: der
    Fräser-Ø, wo er ein Stiftmaß ist, sonst das nächste Stiftmaß, dann als Helix). Ist sie bis zum
    Ende gelaufen, springt die Karte selbst zu _Teil wenden_. Wurde sie schon vorher mit dem
    jetzigen Nullpunkt gefräst, geht es über _Die Vorderseite ist schon gefräst_ → _Weiter zum
    Wenden_ (von diesem Nullpunkt aus kennt die App die Passlöcher). Liegt ein anderes Programm auf
    dem Tisch, bietet die Karte _Vorderseite laden_ oder _Verwerfen_ an.
  - **Teil wenden:** Bild der Wenderichtung und der Satz, welche Kante wohin kommt (_Wie eine
    Buchseite_ oder _Über die Vorderkante_); Spannmittel lösen, wenden, wieder festspannen. Die
    markierten Spannmittel bleiben auf dem Tisch stehen und werden unter _Fräsen → Prüfen_ gegen die
    Rückseite geprüft – umgesetzte mit dem Werkzeug _Spannmittel_ nachziehen. Z-Null bleibt, solange
    Fräser und Unterlage dieselben sind. _Teil ist gewendet und fest_ lädt die Rückseite.
  - **Wiederfinden mit der Kamera** (eingerichtet): Die Löcher gehen durchs Material (0,5 mm darüber
    hinaus), das Teil wird etwa an dieselbe Stelle gelegt – ein paar Millimeter oder Grad daneben
    macht nichts. _Passloch 1 anfahren und suchen_, dann _Passloch 2 …_ (je halten): Die Kamera
    fährt auf Kamerahöhe über die erwartete Stelle und zentriert sich auf das Loch. Aus beiden
    ergeben sich Nullpunkt und Drehung der Rückseite (die Zwei-Löcher-Ausrichtung). Liegen die
    gefundenen Löcher mehr als 1 mm anders auseinander als gebohrt (vermutlich ist eines ein anderes
    Loch), nimmt die App sie nicht. Kommt die Maschine nicht hin oder sieht die Kamera kein Loch,
    hilft _Passloch n hier suchen_, mit der Kamera per Joystick über das Loch gefahren.
  - **Wiederfinden mit Passstiften:** Die Löcher gehen 6 mm in die Opferplatte; zwei Stifte im
    Bohrdurchmesser kommen in die Löcher im Tisch, das Teil steckt darauf (die Karte sagt, ob die
    Löcher dabei die Plätze tauschen). _Teil sitzt auf den Stiften und ist fest_: Der Nullpunkt der
    Vorderseite gilt weiter (die App setzt ihn zurück, falls er verschoben wurde); das Teil sitzt so
    genau, wie die Stifte in die Löcher passen. Ohne eingerichtete Kamera ist das die einzige Art.
  - **Die Startklar-Liste trägt den Ablauf:** Die Rückseite startet erst, wenn die Vorderseite
    gefräst, das Teil gewendet und – mit Kamera – wiedergefunden ist (_Rückseite: Erst die
    Vorderseite fräsen_ · _… noch nicht gewendet_ · _… die Passlöcher sind noch nicht gefunden_);
    eine Seite, die schon gefräst ist, meldet das als Warnung. _Zum Wenden_ führt zur Karte. Eine
    Vorderseite, die an einer Kante ausgerichtet gefräst wurde, nimmt die Rückseite mit. Auf der
    Karte außerdem _Zurück zum Wenden_ und _Teil neu suchen_ (das Teil ist verrutscht),
    _Beidseitigen Job abbrechen_ (halten – ohne den Ablauf müsste die Rückseite von Hand gefunden
    werden) und am Ende _Abschließen_. Das Ende jeder Seite erkennt die App selbst.
  - **Bleibt:** Beide Programme und ob die Vorderseite gefräst ist, überstehen ein Neuladen; die
    Löcher werden neu gesucht. Ändert sich die Zeichnung, bevor etwas gefräst ist, beginnt der
    Ablauf von vorn; ist die Vorderseite gefräst und unverändert, wird eine geänderte Rückseite neu
    auf das Teil gelegt (zurück zu _Teil wenden_).
- **Teile länger als der Tisch: der Ablauf „In Abschnitten“** – eine Regalseite von 2 m, ein langes
  Schild, eine Banklatte auf einer Maschine, die kürzer fährt. Verlässt ein Job den Verfahrweg nur
  in X oder nur in Y (nicht zugleich zu hoch oder zu tief, nicht in beiden Richtungen), sperrt die
  Startklar-Liste nicht bloß: Der Punkt zum Verfahrweg (in _Fräsen → Prüfen_) sagt _Teil ist länger
  als der Tisch_ und hat die Taste **In Abschnitten fräsen**. Was dann passiert:
  - **Teilen:** so wenige Abschnitte, wie der Verfahrweg zulässt, alle um denselben runden Betrag
    (ganze 10 mm) weitergeschoben – immer in Richtung −X bzw. −Y; der erste Abschnitt liegt, wie
    Teil und X/Y-Nullpunkt gerade liegen. Jeder Abschnitt ist ein eigenes Programm
    (`name_abschnitt_2von3.nc`) – SD-Start, Startklar-Liste und Spannmittel-Prüfung bleiben, wie sie
    sind. **Was zusammengehört, bleibt zusammen:** Schnitte, die sich berühren (näher beieinander
    als der Fräserdurchmesser: eine Tasche samt Schlichtgang, eine Kontur mit allen Zustellungen),
    gelten als ein Stück; passt es ganz in die Reichweite eines Abschnitts, wird es dort ganz
    gefräst – eine Bohrung, ein Buchstabe, eine kleine Tasche wird nie geteilt. Nur was länger ist
    als ein Abschnitt, endet an der **Naht**: Fräser hoch, und der nächste Abschnitt taucht 1 mm vor
    der Naht in die schon gefräste Nut wieder ein, Zustellung für Zustellung. Das eine Millimeter
    Überlappung lässt bei ein paar Zehnteln Lagefehler keinen Steg stehen. Die Naht liegt dort, wo
    sie am wenigsten teilt, nie in einem Haltesteg; das Tisch-Bild zeigt sie als Strichpunktlinie
    mit der Zahl der geteilten Schnitte. Kreisbögen werden als Bögen geteilt. Was ein Abschnitt
    nicht vom Original übernimmt, fährt er selbst: hoch auf die höchste Z des Programms, dort
    hinüber, mit dem langsamsten Eintauch-Vorschub des Programms hinunter – nie im Eilgang darunter.
  - **Wiederfinden mit Passmarken** (braucht die eingerichtete Kamera): Nach jedem Abschnitt klebst
    du zwei gedruckte Marker (die von den Vorrichtungen; _Marker drucken_ in der Karte führt zu _Job
    → Extras_) flach und auf saubere Fläche aufs Teil – in den gelben Streifen auf dem Tisch-Bild,
    den die Kamera vor und nach dem Schieben erreicht, möglichst weit auseinander. _Passmarken
    einmessen_ (halten): Die Kamera fährt den Streifen ab, bis sie die Marker sieht (sind es mehr
    als zwei, gelten die zwei am weitesten auseinander), und misst sie in der Bildmitte. Dann sagt
    die Karte, **wohin und wie weit** zu schieben ist („Teil etwa 690 mm nach links schieben
    (Richtung −X). Auf ein paar Zentimeter genau reicht – die Kamera misst nach.“), mit Bild. Nach
    dem Festspannen (_Teil ist weitergeschoben und fest_) _Passmarken finden_ (halten): Die Kamera
    fährt dorthin, wo die Marker liegen müssten (und sucht sonst ringsum), misst sie, setzt den
    X/Y-Nullpunkt dorthin, wo der Nullpunkt des Teils jetzt liegt, und lädt den nächsten Abschnitt
    so gedreht, wie das Teil liegt; hilft das nicht, _Hier suchen_ mit der Kamera über einem Marker.
    Marker tragen Nummer und Richtung – nach dem Schieben kann keiner mit einem anderen oder mit
    einer Bohrung des Jobs verwechselt werden; deshalb Marker und keine Passlöcher. Liegen die zwei
    Marker mehr als 0,5 mm anders auseinander als vorher, oder klebt einer um mehr als 3° anders auf
    dem Teil (verrutscht, anderes Teil), wird nicht weitergefräst. Marker, die als Passmarken
    dienen, bietet die App nicht zum Anlernen einer Vorrichtung an.
  - **Ehrlich zur Genauigkeit:** An der Naht, nahe bei den Markern, treffen sich die Schnitte auf
    etwa 0,2 mm – an der echten Maschine noch nicht gemessen. Der Simulator-Test (die
    Beispiel-Regalseite in drei Abschnitten, auf einer Maschine mit absichtlichen Fehlern: 0,15 % zu
    weit in X, Brett 0,3° schief) verlangt an den Nähten weniger als 0,15 mm seitlichen Versatz,
    nach dem Wiederfinden weniger als 0,5 mm Abweichung bei den Bohrungen und lange Kanten, die
    weniger als 0,5 mm neben der Linie liegen. Die Richtung ist die schwache Stelle: Sie ruht auf
    zwei Punkten im Abstand der Marker, der Fehler wächst mit der Entfernung (0,1 mm + Entfernung ×
    0,2 / Markerabstand). Die App nennt die erwartete Abweichung am fernen Ende des nächsten
    Abschnitts, bevor geschoben wird, und warnt ab 0,5 mm („Das ist viel für ein Teil, das passen
    soll“) mit dem Rat zu weiter auseinander geklebten Markern oder zu einem **geraden Anschlag**
    längs der Schieberichtung. Mit Anschlag (_Das Teil liegt an einem geraden Anschlag_ ankreuzen)
    übernimmt die App nur die Verschiebung, die Richtung hält der Anschlag; dann genügt ein Marker
    (erwartet: etwa ± 0,1 mm – „und so gerade, wie der Anschlag ist“), und zwei prüfen, ob das Teil
    wirklich anliegt (ab etwa 0,2° Verdrehung sagt die App nein). Beim Schieben ist die Hand bis auf
    etwa 3 cm genau gefragt – genauer misst die Kamera nach. **Z-Null prüft die App nach dem
    Schieben nicht:** liegt das Teil anders auf (durchhängendes Ende), neu setzen.
  - **Der Ablauf:** Die Karte zählt _Abschnitt 1_ → _Schieben_ → _Abschnitt 2_ → … Das Ende jedes
    Abschnitts erkennt die App selbst (bei mehreren Werkzeugen nach dem letzten). Die
    Startklar-Liste trägt ihn (_Zum Ablauf_ führt zur Karte): Ein Abschnitt startet erst, wenn die
    davor gefräst sind und das Teil wiedergefunden ist; ist es weitergeschoben, lässt sich der alte
    Abschnitt nicht mehr starten; wird danach der Nullpunkt oder das Programm verändert, ist neu zu
    suchen. Das Tisch-Bild zeigt das ganze Teil um den aktuellen Abschnitt: grün, was gefräst ist,
    blass, was noch kommt. Welche Abschnitte gefräst sind, übersteht ein Neuladen. Solange Abschnitt
    1 nicht gefräst ist, teilt die App neu, wenn der Nullpunkt versetzt wird; passt der Job danach
    in den Verfahrweg, liegt er wieder am Stück auf dem Tisch. Wege zurück: _Doch nicht in
    Abschnitten_ (bis Abschnitt 1 gefräst ist), danach _Abschnitte abbrechen_ (halten; der ganze Job
    kommt auf den Tisch zurück, solange nicht alle gefräst sind), _Abschnitt n ist schon gefräst_ →
    _Weiter zum Schieben_ für einen Abschnitt, der mit dem jetzigen Nullpunkt schon gefräst wurde,
    und _Passmarken neu einmessen_ bzw. _Zurück: Das Teil ist noch nicht geschoben_.
  - **Geht nicht:** Programme mit Zeilen mit Fehlern, Kettenmaßen in Fahrbewegungen (G91), G93,
    absoluten Kreismittelpunkten (G90.1), Bögen außerhalb der XY-Ebene (G18/G19), G92/G10/G43.1,
    mehreren Nullpunkten (G55–G59), Antasten (G38), Drehachse oder ohne eine Höhe über dem Schnitt,
    auf der sich fahren ließe – die Karte _In Abschnitten fräsen geht so nicht_ sagt, woran es liegt
    (`G28 G91 Z0` am Ende, wie Fusion es schreibt, ist kein Hindernis). Ebenso, wenn der Anfang des
    Jobs außerhalb des Verfahrwegs liegt (das Ende darf überstehen), der Verfahrweg zu kurz zum
    Weiterschieben ist, es keine Stelle für eine Naht gibt, die nicht durch einen Haltesteg ginge,
    oder der Job nichts fräst. Teilen in beide Richtungen zugleich gibt es nicht, geschoben wird
    immer zum kleinen Ende der Achse hin. Bei einem Job mit mehreren Werkzeugen enthält jeder
    Abschnitt alle Werkzeuge – es wird also je Abschnitt gewechselt.
- **Vorrichtungen mit Markern** – eine Vorrichtung, die immer wieder benutzt wird (Rahmen für
  Untersetzer, Anschlag für Brettchen, Halter für ein 3D-Druck-Teil), bekommt einen **Marker**: ein
  gedrucktes Kennzeichen, das die Kamera lesen kann. Die Marker sind eigene (kein ArUco): ein
  dunkler Rahmen um 5 × 5 Felder, 48 Nummern, je zwei in mindestens 8 Feldern verschieden, wie herum
  sie auch liegen – eine falsch gelesene Zelle verzeiht der Leser, mehr nicht; ein Marker würde erst
  mit sieben falschen Zellen für einen anderen gehalten.
  - **Drucken:** _Job → Extras → Vorrichtungen mit Markern → Marker drucken_ (ohne geladenes
    Programm steht die Karte im Job unter der SD-Karte; sie ist zugeklappt, ihre Überschrift klappt
    sie auf). Die Druckseite ist in echten Millimetern, mit einer Linie „muss 50 mm lang sein“ gegen
    heimliches Skalieren (mit 100 % drucken), in 20/30/40/60 mm (40 mm passt für die meisten), 1, 2,
    4 oder 6 Marker ab einer wählbaren Nummer (_Ab Nummer_ beginnt bei der ersten freien), mit
    Nummer und einem freien Namen darunter; jeder Marker lässt sich auch als SVG für einen
    Etikettendrucker speichern. Matt drucken, mit dem weißen Rand ausschneiden, flach aufkleben –
    möglichst auf Höhe der Werkstück-Oberfläche, wo weder Fräser noch Spannmittel hinkommen und
    keine Späne liegen bleiben; kein glänzendes Klebeband darüber.
  - **Anlernen** (einmal, drei kurze Schritte: _Einrichten_ · _Marker einmessen_ · _Benennen_):
    alles einrichten wie immer – Vorrichtung auf den Tisch, Job laden, Nullpunkt setzen, Spannmittel
    markieren –, _Marker einmessen_ halten (die Kamera fährt über jeden Marker, höchstens zwei, und
    misst ihn in der Bildmitte), benennen, _Vorrichtung speichern_. Gemerkt werden der Job und wo
    sein X/Y-Nullpunkt und seine Richtung auf der Vorrichtung liegen, dazu die markierten
    Spannmittel. Die Liste zeigt je Vorrichtung Marker, Job und erwartete Abweichung und bietet _Job
    laden_ (ohne Einmessen: die Startklar-Liste verlangt es dann), _Umbenennen_ und _Löschen_
    (halten). Gespeichert wird bei den anderen Bibliotheken (Browser, mit Companion auch dort –
    _Einstellungen → Verbindung → Companion-Rechner → Bibliotheken abgleichen_ bringt die Liste aufs
    zweite Gerät; ein älterer Companion ohne Vorrichtungen lässt sie im Browser).
  - **Benutzen:** Vorrichtung irgendwo auf den Tisch legen. Sobald die Kamera ihren Marker sieht –
    im Livebild (die Maschine steht, die Kamera ist an) oder nach einem Scan auf dem Tisch-Bild –,
    steht oben in Job, Einrichten und Fräsen _Vorrichtung „Name“ erkannt_ mit einer einzigen Taste:
    **Einmessen und Job laden** (halten). Die Kamera fährt über den oder die Marker, misst nach,
    setzt den X/Y-Nullpunkt und lädt den Job so gedreht, wie die Vorrichtung liegt; die Spannmittel
    wandern mit. **Z kennt ein Marker nicht** – die Karte führt danach mit _Z-Nullpunkt setzen_ zum
    gewohnten Z-Nullpunkt (_Einrichten → Nullpunkte_). Die Startklar-Liste trägt die Vorrichtung
    (grün: _Vorrichtung „Name“ erkannt – Nullpunkt aus Marker_; bei einem offenen Punkt steht
    _Einmessen_ (halten) gleich daneben, solange die Kamera die Vorrichtung gesehen hat, sonst
    _Zeigen_) und sperrt den Start, wenn sie in dieser Sitzung nicht eingemessen wurde, der
    Nullpunkt oder der Job danach verändert wurde oder die Kamera die Vorrichtung inzwischen
    woanders sieht. Ein unbekannter Marker führt mit _Vorrichtung anlernen_ (oder _Nicht jetzt_) zum
    Anlernen.
  - **Ehrlich zur Genauigkeit:** Die Lage eines Markers stimmt in der Bildmitte auf etwa 0,1 mm,
    sein Winkel ist die schwache Stelle – ein einzelner 40-mm-Marker gibt ihn auf etwa 0,3°, das
    sind 300 mm entfernt schon etwa 1,5 mm (die App rechnet die 0,1 mm Lage dazu). Deshalb darf eine
    Vorrichtung **zwei Marker weit auseinander** tragen (Winkel aus der Linie durch beide, wie beim
    Ausrichten an zwei Bohrungen; ihr Abstand wird gegen das Anlernen geprüft, bei mehr als 1 mm
    Unterschied wird nicht eingemessen). Die App nennt vor dem Speichern und nach jedem Einmessen
    die erwartete Abweichung am fernsten Punkt des Jobs und rät bei mehr als 0,5 mm zum zweiten
    Marker. Was wie ein Marker aussieht, aber nicht genommen wird, steht mit Grund im Livebild:
    abgeschnitten, unscharf, zu blass, schräg, falsche Größe, Muster nicht lesbar. Nicht korrigiert
    sind die Verzeichnung der Linse und ein Marker, der deutlich höher oder tiefer liegt als die
    Kamerahöhe (deshalb wird in der Bildmitte gemessen); mit echtem Druck, Licht und Linse ist es
    noch nicht erprobt.

Solange ein **Job unterwegs** ist (was das heißt, steht im Abschnitt „Job“ unter „Das Programm ist
geschützt“), ändert **kein Ablauf** das Programm auf dem Tisch oder den Nullpunkt. **Wenden** hält vor seinem ersten Schritt an und sagt es einmal („Ein Job ist unterwegs: das Programm auf dem Tisch
bleibt, wie es ist …“, mit dem Ausweg: zu Ende laufen lassen oder in _Fräsen_ beenden); **In Abschnitten** und die Vorrichtungen messen, laden und setzen in dieser Zeit nichts (ihre Tasten sind
gesperrt oder wirkungslos, ein Einmessen scheitert mit „Einmessen geht gerade nicht …“); und alles,
was doch ein Programm laden, ersetzen oder abräumen will, hält die zentrale Programm-Sperre auf –
mit derselben Meldung.

### Fräsen

_Fräsen_ – passt es, und läuft es gut? Der Reiter hat zwei Ansichten, oben im Feld umschaltbar:
_Fräsen_ (so öffnet der Reiter) und _Prüfen_. Das Bild ist zunächst 3D mit Materialabtrag und folgt
dem Werkzeug; wo eine Kamera läuft, sitzt ihr Bild klein in der Ecke (ein Tipp macht es groß). Bei
einem beidseitigen Job, einem Teil in Abschnitten oder einer erkannten Vorrichtung liegt die Karte
des Ablaufs (**Wenden**, **In Abschnitten**, **Vorrichtungen**) über beiden Ansichten (siehe Abschnitt
„Abläufe über mehrere Bereiche“); ohne geladenes Programm steht dort ein Hinweis mit _Zum Job_. Der
Reiter zeigt ✕, solange irgendein Punkt der Startklar-Liste den Start sperrt – gleich, wo er zu
beheben ist („Maschine ist nicht bereit“ zählt dabei nicht) –, ⚠ bei Hinweisen aus Prüfen und Werkzeugen
und ✓, wenn der Job in dieser Sitzung zu Ende gefräst ist.

**Ansicht _Prüfen_** – hier steht unten rechts nichts, solange kein Job läuft oder wartet; die
Aktionsleiste nennt links davon nur den Stand der Startklar-Liste (wie im Job). Läuft ein Job,
bietet sie auch hier die Pause.

- _Startklar?_ – eine Liste mit ✓ (_in Ordnung_), ⚠ (_Hinweis_) und ✕ (_sperrt den Start_); jedes
  Zeichen trägt sein Wort, nie nur Farbe. Bei jedem offenen Punkt steht die Lösung daneben
  (_Verbinden_, _Referenzfahrt_ als Halten, _Nullpunkt_, _Zeigen_, _Rohteil_, _Werkzeuge_, _Profil_,
  _Zum Wenden_, _In Abschnitten fräsen_, _Einmessen_ …). Geprüft werden Verbindung, Referenzfahrt,
  Fehler im G-Code, Verfahrweg, Nullpunkt, Kollisionen, Spannmittel, Maschinenprofil, Z-Tiefe,
  Werkzeuge, Drehzahl/Vorschub und – bei solchen Jobs – der Stand von Wenden, In Abschnitten, Serie
  und Vorrichtung. **Sperren** (✕) tun nur: keine Verbindung, Maschine nicht bereit (läuft, Pause,
  Alarm), Fehler im G-Code (nach dem Bereinigen, s. u.), ein Verfahrweg, den der Job verlässt, und
  der Stand der Abläufe (Rückseite vor der Vorderseite, Passmarken nicht gefunden, Serie oder
  Vorrichtung verschoben …). Alles andere ist ein Hinweis (⚠), der den Start nicht sperrt: nicht
  referenziert, Nullpunkt noch im Maschinennullpunkt, Kollision, ein Spannmittel im Weg, Verfahrweg
  im Profil noch ein Platzhalter, Z-Tiefe, Werkzeuge, Drehzahl/Vorschub, Stellen, die FluidNC anders
  ausführt. **Z-Tiefe** wird gegen die Rohteildicke gelesen (_Job → Vorbereiten_, Abschnitt _Rohteil_ der Karte _Material_):
  mehr als 1 mm tiefer als das Rohteil dick ist heißt „in die Opferplatte“. **Drehzahl/Vorschub:**
  der schnellste Vorschub des Programms gegen die Höchstgeschwindigkeit der Achsen, die Drehzahlen
  gegen den Bereich der Spindel (_Einstellungen → Maschine → Werkstatt und Benachrichtigungen_; nur
  bei einer Spindel, die die Steuerung schaltet).
- _Spannmittel und Kollisionen:_ jedes Spannmittel, in das die Fräsbahn läuft, steht mit Namen in
  der Liste – „Zwinge 2 liegt in der Fräsbahn – versetzen oder Job verschieben“ –, ebenso Eilgang
  hinein oder weniger als 2 mm Luft darüber; der Fräserradius zählt mit. Die betroffenen Bahnen und
  das Spannmittel sind auf dem Tisch gelb (Bernstein); _Zeigen_ wählt das Spannmittel dort aus. Dazu
  prüft die App Halter gegen Rohteil und Spannmittel und das Portal darüber (60 mm über der
  Auskraglänge als vorsichtiger Vorgabewert, bis er gemessen ist).
- _Werkzeuge des Jobs_ – je Werkzeug des Programms eine Zeile in der Reihenfolge des Jobs: T-Nummer,
  Name, Art, Ø, Schneidenlänge, wie tief der Job damit fräst, Zustand ✓ _passt_ · ⚠ _prüfen_ · ✕
  _fehlt_ (Werkzeugliste leer). Geprüft wird gegen die Werkzeugliste: steht das Werkzeug nicht
  selbst darin (gezeigt wird das nächstliegende, ein Tipp übernimmt es), ist die Schneide kürzer als
  die Frästiefe, weicht der Ø von dem ab, den das CAM nennt, ist es als Messtaster markiert. _Passt
  aus der Werkzeugliste:_ bis zu drei Alternativen (gleicher Ø, lang genug, kein Messtaster, gleiche
  Art zuerst) mit einem Tipp; die Zuordnung je T-Nummer ist eine Auswahl in der Zeile. Mit gewähltem
  Material (_Job → Vorbereiten_) steht darunter der Schnittwert-Vorschlag, als _empfohlen_ markiert,
  mit Punkt bei stark abweichendem Vorschub und einer Warnung (_Der Job fährt bis zu … % schneller
  als vorgeschlagen – Override bereithalten._), wenn der schnellste Vorschub des Programms mehr als
  30 % über dem Vorschlag liegt. _Länge messen_ (Halten) sitzt in der Zeile, wenn ein
  Werkzeuglängensensor eingerichtet ist (Ergebnis: _Als Referenz merken_ oder _Längenkorrektur
  setzen_); sonst ist die Taste gesperrt, sagt warum und führt mit _Sensor einrichten_ nach
  _Einrichten → Antasten_. _Werkzeugliste öffnen_ springt in die _Werkzeugliste_ (sonst über das Menü erreichbar).
- _Simulation:_ das 3D-Bild mit Materialabtrag, darunter die Zeitleiste: Abspielen/Anhalten, _Zum
  Anfang_, der Schieber (Scrubber) mit einer Marke je Operation und die Operationen als Tasten, die
  dorthin springen. Operationen sind nur, was das Programm selbst nennt (eine Kommentarzeile vor den
  Fräsbahnen, wie Fusion sie schreibt), sonst die Werkzeugwechsel – nichts wird geraten. Steht das
  Bild auf Tisch oder Kamera (etwa um ein Spannmittel zu versetzen), liegt die Zeitleiste unter
  _Mehr Optionen → Simulation_. Dort auch: _Zeitfaktor_ 1× · 10× · 50× · 200×, die Ansicht
  _Draufsicht_ · _Seite_ (die Tiefe der Bahnen; beide zeigen den Tisch; _Abwicklung_ nur bei einem
  Job mit Drehachse), der Schalter _Eilgänge_ zum Ausblenden der Eilgänge, die aktuelle Zeile,
  während die Maschine fräst _Live (Maschine)_ mit _Fortschritt zurücksetzen_ – und eine Karte mit
  Name, geschätzter Laufzeit, Zeilen, Bewegungen, Werkzeugen, Bereich, Vorschüben, Weg
  (Vorschub/Eilgang) und dem Werkzeug-Ø für das Bild.
- _Laufzeit_ („Job-Zwilling“): gerechnet aus Planer-Blöcken mit Trapezprofil – Beschleunigung und
  Höchstgeschwindigkeit je Achse, Eckenabweichung und Bogentoleranz des Maschinenprofils, Bögen in
  Sehnen zerlegt wie in der Firmware. Das Profil beginnt mit den LowRider-v4-Werten; nach dem Import
  der `config.yaml` sind es die der Steuerung. Wie weit die Schätzung danebenlag, zeigt _Service →
  Historie_ aus den aufgezeichneten Jobs (an der echten Maschine noch nicht gemessen).
- _Verfahrweg-Prüfung_ (_Mehr Optionen_): der Job gegen den Verfahrweg des Maschinenprofils, mit dem
  Nullpunkt, wie die Steuerung ihn gerade hat – deshalb erst nach dem Verbinden; je Achse und Seite
  steht, um wie viel und ab welcher Zeile. Hinweise, solange nicht referenziert
  (Software-Endschalter in der Steuerung inaktiv) oder der Verfahrweg noch der Platzhalter ist.
  Verlässt der Job den Verfahrweg nur in X oder nur in Y, steht in der Liste _Teil ist länger als
  der Tisch_ mit _In Abschnitten fräsen_.
- FluidNC-Fallen fängt die App an drei Stellen ab: `G43 … H` (FluidNC kennt keine Werkzeugtabelle)
  streicht sie beim Vorbereiten für SD-Karte und Streamen selbst, und wo die Datei Einheit und
  Absolutmaß nicht setzt, stellt sie `G21 G90 G17 G94` voran (so geht es auch in Job → _Extras_ → _Auf die
  Maschine_); beides sagt sie in der Ansicht _Fräsen_. `M6` mitten im Job führt FluidNC nicht als
  Halt aus (ohne Werkzeugwechsler oder `m6_macro`): auf der SD-Karte wird der Job je Werkzeug
  geteilt, beim Streamen hält die App an – in der Liste ein ⚠ („… die App hält dort an“). `M1`
  ignoriert FluidNC; es steht wie der `M6` mit Zeilennummer unter _Alle Parameter → Hinweise zum
  G-Code_, nicht in der Liste.
- _Tiefe:_ offen stehen _Startklar?_ und _Werkzeuge des Jobs_; _Mehr Optionen_ hält Simulation,
  Verfahrweg-Prüfung und _Schnittwerte_ (dieselbe Karte wie in der _Werkzeugliste_: Drehzahl,
  Vorschub, Eintauchen, Zustellung, Bahnabstand, Zahnvorschub je Werkzeug und Material, vom
  Gelernten korrigiert); _Alle Parameter_ die _Hinweise zum G-Code_ – Fehler und Warnungen des
  G-Code-Lesers mit Zeilennummer. Führt ein Punkt der Liste dorthin (_Zeigen_), klappt sie auf.

**Ansicht _Fräsen_** – hier liegt die Hauptaktion unten rechts, und die Karten beantworten, was
jetzt läuft.

- **Der Start ist die Hauptaktion und ein Halten** (1 s, _Fräsen starten_; bei mehreren Werkzeugen
  _Teil 1/2 starten (T1)_). Antippen, Doppeltipp, zu kurzes Halten und Abrutschen starten nichts;
  eine Taste gibt es nicht. Solange ein Punkt der Startklar-Liste sperrt – auch „Keine Verbindung zur Maschine“ oder „Maschine ist nicht bereit“ –, steht dort statt des Starts _Prüfen_ und führt zur Liste; ist nur
  gerade etwas unterwegs (Upload), ist das Halten gesperrt und nennt bei Antippen den Grund.
- **Vor dem Start bestätigen** (_Vor dem Start bestätigen_, Start aus der Aktionsleiste und Start
  des nächsten Teils): Drei Dinge sperren den Start nicht, werden aber nie übergangen. Das Halten
  öffnet dann die Frage statt zu starten; gestartet wird mit einem **zweiten Halten** (_Trotzdem
  starten_; _Zurück, nicht starten_ bricht ab): _Kein Nullpunkt gesetzt_ (der Nullpunkt liegt im
  Maschinennullpunkt), _Z steht unter der Sicherheitshöhe_ (mehr als 0,5 mm darunter, referenziert,
  und das Programm fährt zuerst seitlich, statt anzuheben – ein Programm, das zuerst anhebt, ist von
  jeder Höhe aus sicher) und _Messtaster als Werkzeug_ (ein Werkzeug des Jobs ist in der
  Werkzeugliste als Messtaster markiert, und das Programm schaltet die Spindel ein). Nullpunkt und Z
  werden je Job einmal bestätigt, der Messtaster bei jedem Start; er sperrt die Spindel nicht hart,
  denn die App weiß nicht, was wirklich in der Spindel steckt. **Nicht gefragt wird** bei _Programm
  starten_ (Streamen), _Ab Zeile … starten_ und _Starten_ in der Liste der SD-Karte.
- _Fräsen_ (die Karte vor dem Start): Programm, geschätzte Laufzeit, die Teile je Werkzeug mit ihrer
  Laufzeit, was sperrt (_Start gesperrt: n Punkt(e) offen_ mit dem ersten Grund und _Prüfen_), und
  Hinweise: bereinigte `G43 … H`-Zeilen, vorangestelltes `G21 G90`, ein Messtaster im Job
  (_Spindelstart gesperrt …_ – der Start fragt jedes Mal), eine Spindel, die die Steuerung nicht
  schaltet (_Fräsmotor von Hand einschalten_). Dazu _Rahmen abfahren_ (Halten): der Umriss der
  Fräsbahn wird auf sicherer Höhe – nach der Referenzfahrt in Maschinen-Z, sonst 5 mm über dem
  höchsten Punkt des Jobs – mit der Tippgeschwindigkeit der App abgefahren.
- **Von der SD-Karte wie mit der FluidNC-WebUI, aber mit einem Halten** (der Standard): Die App
  bereitet das Programm für FluidNC vor, lädt es über HTTP auf die SD-Karte (_Lade auf die SD-Karte
  …_; ein Teil, das unverändert schon dort liegt, nicht noch einmal), liest die Karte zurück und
  prüft Name und Größe – stimmt etwas nicht, startet nichts – und startet es an der Steuerung. WLAN
  und iPad dürfen danach ausfallen. Den Nullpunkt merkt sich die App dabei für _Zuletzt verwendet_
  (siehe Job).
- **Mehrere Werkzeuge:** FluidNC führt `M6` nicht als Halt aus, darum teilt die App den Job für die
  SD-Karte je Werkzeug (die Dateien beschreibt Job → _Extras_). Nach jedem Teil: Spindel aus (`M5`),
  Z hoch (Maschinen-Z der sicheren Höhe, ohne Referenzfahrt 20 mm hoch) und – mit eingetragener
  Werkzeugwechsel-Position (_Einstellungen → Maschine → Werkstatt und Benachrichtigungen_) und
  Referenzfahrt – dorthin. Dann steht die Karte _Werkzeugwechsel_ im Feld: das nächste Werkzeug mit
  Name und Ø aus der Werkzeugliste, die drei Schritte (Spindel steht, Z ist oben · Werkzeug
  wechseln, Spannzange anziehen · Länge messen), _Mit Sensor messen_ (Halten; mit
  Werkzeuglängensensor und Referenzlänge, wo das Teil die Längenkorrektur nicht mit `G49` aufhebt;
  setzt `G43.1`) oder _Z mit Platte antasten_ (Halten), dann _Teil 2/2 starten (T2)_ als Halten –
  mit derselben Sperre und denselben Rückfragen wie der Start in der Aktionsleiste – und _Restliche
  Teile abbrechen_ (Halten).
- **Streamen vom iPad** ist die zweite Startart (_Mehr Optionen → Vom iPad streamen_): _Programm
  starten_ (Halten, 1 s; gesperrt, solange ein Punkt der Startklar-Liste sperrt) sendet den Job
  Zeile für Zeile – das Gerät muss die ganze Zeit verbunden bleiben, für lange Jobs ist die SD-Karte
  der Weg. _Einzelschritt_ hält vor jedem Satz, _Nächster Satz_ sendet genau eine Zeile
  (_Einzelschritt aus_ lässt laufen). An jedem `M6` hält der Job: Spindel aus, Z hoch, zur
  Wechselposition, die Karte _Werkzeugwechsel_ (sie liegt über jedem Bereich, bei _Großbild_ unter
  dem Bild); _Job fortsetzen_ (Halten) hebt noch einmal an, stellt den Spindelzustand von vorher
  wieder her und gibt frei, _Job abbrechen_ (Halten) beendet ihn. Mit Companion: _Im Companion
  ablegen_.
- _Wiederaufnahme ab Zeile_ (_Mehr Optionen → Alle Parameter_): nach einem Abbruch baut die App ein
  Programm, das die Modalzustände der Zeile wiederherstellt, die Spindel wie vorher einschaltet, auf
  sichere Höhe hebt, über den Startpunkt fährt und dort eintaucht. Die Zeile ist vorbelegt (zuletzt
  bestätigte bzw. verfolgte Zeile + 1), die ersten Zeilen stehen zur Ansicht da, _Herunterladen_
  speichert das Programm, _Ab Zeile N starten_ (Halten) **streamt** es und braucht die
  Referenzfahrt. Eine Warnung nennt `G92`/`G10` vor der Zeile (diese Verschiebungen werden nicht
  wiederhergestellt). Ebenfalls unter _Mehr Optionen_: die Liste der _SD-Karte_ – dieselbe wie im
  Job, mit denselben Sperren und derselben Einschränkung (siehe dort).
- **Während der Job läuft:** Das Feld ist aus 2 m lesbar – Fortschritt in 72 px, Restzeit in 48 px,
  die aktuelle Operation in 24 px mit der Zeile darunter und ein Balken. Darunter die **Overrides**
  _Vorschub_ und _Spindel_: 50–150 % (FluidNC selbst nähme 10–200 %), je −10, Schieber, +10 und _100
  %_; der Schieber sendet erst beim Loslassen, ein Punkt zeigt die Abweichung von 100 %. Wo der
  Companion Sensoren meldet, kommen Spindellast, eine Rattern-Warnung und der Schalter für den
  adaptiven Vorschub dazu. Unter _Mehr Optionen_: _Eilgang_ 25 · 50 · 100 %, Laufzeit (beim Streamen
  die Zeilen) und der Abweichungs-Trend (_Abweichung über den Job_, mit Linie bei 0,5 mm).
- **Pause, Fortsetzen, Abbruch:** PAUSE oben rechts (oder `Leertaste`) hält den Vorschub, ein Tipp,
  keine Rückfrage. Die Hauptaktion unten rechts ist dann _Fräsen pausieren_ (ein Tipp), im Halt
  _Fräsen fortsetzen_ als kurzes Halten (0,5 s), damit ein Doppeltipp auf Pause nie fortsetzt; die
  Laufleiste in anderen Bereichen setzt mit einem Tipp fort. Links in der Leiste steht – bei geschlossenem Jog-Feld – _Job abbrechen_ (ebenso `Esc`, auch bei offenem Jog-Feld) – erst die Frage _Job abbrechen?_: Die Maschine hält an, die Steuerung
  wird zurückgesetzt, der Job lässt sich danach ab einer Zeile fortsetzen. Während die Frage steht,
  läuft der Job weiter (_Job weiterlaufen lassen_).
- **Am Ende** eines Jobs von der SD-Karte (bei mehreren Werkzeugen nach dem letzten Teil) steht die
  Karte _Job fertig_: Programm, Laufzeit vom ersten Start an (mit den Werkzeugwechseln), Zahl der
  Teile (Werkzeuge), die größte Abweichung des Werkzeugs von der Bahn (wenn verfolgt) und _Stück in
  dieser Sitzung_. Die Hauptaktion heißt _Nächstes Teil: gleicher Job_ (ein Tipp): Sie bringt nur
  den Start zurück und startet nichts – fertiges Teil abnehmen, neuen Rohling an dieselbe Stelle
  spannen, der Nullpunkt bleibt. Ein gestreamter Job und eine Datei aus der Liste der SD-Karte haben
  diese Zusammenfassung nicht.
- **Wartet der Job auf dich** – gestreamt an einem `M6` oder im Einzelschritt, oder bei einem SD-Job
  zwischen zwei Teilen –, bleibt Fräsen in der Ansicht _Fräsen_: Der Umschalter nimmt keine Wahl an,
  und auch die Schnellsuche oder ein Link in einer Karte kann _Prüfen_ nicht für später merken –
  nach dem Weitergehen stehen Zahlen und Overrides da, nicht eine zuvor gewählte Liste. Das Feld mit
  dem Weg weiter liegt im Panel, bei _Großbild_ unter dem Bild. Die Pause unten rechts ist gesperrt
  (_Der Job wartet auf dich: im Feld oben geht es weiter._), solange die Maschine ruht; fährt sie
  für den Wechsel, ist sie da. Die übrigen Starts (_Programm starten_, _Starten_ in der SD-Liste,
  _Ab Zeile … starten_) sind mit demselben Grund gesperrt: Der nächste Teil startet nur in der Karte
  _Werkzeugwechsel_.
- **Verbindung im Job verloren** ist die eine _kritische_ Meldung: rot über der ganzen
  Arbeitsfläche, nicht animiert, bis sie quittiert wird (_Meldung quittieren_ oder _Quittieren und
  zur Verbindung_). Sie nennt Job, Ursache, Auswirkung – bei einem SD-Job: die Maschine fräst von
  der Karte weiter, PAUSE und NOT-HALT der App erreichen sie nicht; beim Streamen: sie bekommt keine
  Zeilen mehr und bleibt stehen, sobald ihr Puffer leer ist – und die Maßnahme: zur Maschine gehen,
  im Notfall den Not-Aus an der Maschine drücken, von Hand neu verbinden. Die App verbindet sich
  danach nicht von selbst und setzt nichts von selbst fort.
- **In den anderen Bereichen** bleibt ein laufender Job als Laufleiste erreichbar (Name,
  Fortschritt, Restzeit, _Pause_ bzw. _Fortsetzen_, _Zum Job_ führt in die Ansicht _Fräsen_): in Job, Einrichten, Service, Einstellungen, Werkzeugliste, in der Ansicht _Prüfen_ und über dem Jog-Feld. Auf Start zeigt die Karte des Jobs Fortschritt und Restzeit (die Pause bleibt oben rechts in der Statusleiste). Im CAM nicht – dort bleiben nur das CAM und die Statusleiste, mit PAUSE, NOT-HALT
  und der kritischen Meldung.

### Service

_Service_ – was sagt die Maschine? Vier Ansichten: _Diagnose_ · _Meldungen_ · _Historie_ ·
_Kalibrieren_ (der Reiter heißt _Service_, die Schnellsuche und das Blatt unten nennen ihn _Service
& Diagnose_). Keine Hauptaktion in der Aktionsleiste; die Karten liegen über die ganze Breite, nur
_Kalibrieren_ behält das Bild.

- _Diagnose:_ Verbindungsdaten der Steuerung (Zustand, Adresse, Firmware, referenziert – alle
  Achsen, nur einzelne oder keine –, Koordinatensystem, Alarm; was die Steuerung nicht gesagt hat,
  steht als „nicht bekannt“ da), die _Eingänge_ live (Endschalter X, Y, Z und Tastplatte; leuchtet,
  solange der Schalter gedrückt ist), der **Achstest** und das _Protokoll_. Der Achstest fährt eine
  Achse 1, 10 oder 50 mm in eine Richtung, jede Fahrt ein Halten, durch dieselbe Jog-Schicht wie
  alles andere (die Grenzen des Maschinenprofils gelten); danach steht da, was die Steuerung als
  gefahren meldet – das ist ihre eigene Zählung, ob die Achse wirklich so weit fuhr, misst erst
  _Kalibrieren_.
- _Meldungen:_ die **Meldungshistorie** – dieselbe Liste wie im Meldungszentrum (⚑ in der
  Statusleiste) – mit Filter nach Stufe (_Alle_ · _Kritisch_ · _Störung_ · _Warnung_ · _Hinweis_ ·
  _Information_, je mit Zähler), _Alle Warnungen bestätigen_ und _Erledigte Meldungen löschen_; an
  der Ansicht steht, wie viele Meldungen noch auf dich warten. Die Liste übersteht einen Neustart.
  **Diagnosebericht speichern:** eine Textdatei (`lowrider-diagnose-<Datum>-<Zeit>.txt`) mit den
  Meldungen dieser Sitzung samt Umfeld (Zustand der Maschine, Weg zu ihr, die Zeilen des Protokolls
  davor), den früheren Meldungen aus dem Verlauf, der Verbindung, dem Pi, einer Auswahl der
  Einstellungen und den letzten 200 Zeilen des Protokolls der Steuerung – zum Weitergeben bei der
  Fehlersuche. Der Bericht liest nur, was die App schon weiß: er schickt nichts an die Maschine und
  nichts an den Pi, funktioniert auch während eines Jobs und ohne Pi und enthält keine Zugangsdaten
  (Passwörter – bei WLAN-Einstellungen die ganze Zeile hinter dem `=` –, Tokens und Adressen mit
  Benutzer werden geschwärzt). Lässt sich die SD-Karte nicht einbinden (`error:60`),
  steht das als Kartenfehler da – mit dem, was es für Jobs von der SD-Karte bedeutet; die übrigen
  Dateifehler der Steuerung (`error:61` bis `70`, `82`, `83`) als Dateizugriff, ohne die Karte zu
  beschuldigen.
- _Historie:_ die _Laufzeit_ der aufgezeichneten Jobs (die Steuerung zählt keine Spindelstunden – es
  steht nichts Erfundenes da, und wer die Historie löscht, löscht auch diese Zahl) und die
  **Job-Historie**: je Job Dauer gegen Schätzung, Werkzeuge, Material, mittlerer Override, Alarme
  und Abweichung mit Verlauf; darüber die Abweichung über alle Jobs (Riemenverschleiß! – der Trend
  braucht mindestens 5 gemessene Jobs und warnt, wenn die Abweichung steigt) und die
  Treffgenauigkeit der Zeitschätzung. Exportieren als JSON; _Historie löschen_ ist ein Halten.
- _Kalibrieren:_ die Maschine vermessen und die Korrektur in die `config.yaml` schreiben – siehe
  unten **Kalibrieren**.

**Kalibrieren** (_Service → Kalibrieren_, mit dem Kamerabild auf der Bühne) – zwei Wege, die
Maschine zu vermessen und zu korrigieren; Anleitung: [`docs/kalibrierung.md`](docs/kalibrierung.md).

- _Genauigkeits-Check mit Lineal_ (ohne Kamera): Die Maschine fräst vier Markierungen in ein
  Rechteck (Breite, Höhe und Tiefe wählbar – groß wählen, etwa 500 × 400 mm auf einer planen Platte,
  Nullpunkt vorne links); _Als Job laden_, er läuft wie jeder andere. Seiten und Diagonalen misst
  man mit Stahllineal, Maßband oder Messschieber und trägt sie ein; _Auswerten_ gibt Maßstab X/Y und
  Rechtwinkligkeit. Unterscheiden sich gegenüberliegende Seiten, verwindet sich das Portal oder ein
  Riemen ist anders gespannt – dann zuerst mechanisch prüfen; passen die Messungen schlecht
  zusammen, ist es vermutlich ein Messfehler. Mit der eigenen Kamera nachmessen ginge nicht: Die
  Markierungen tragen die Fehler der Maschine schon in sich.
- _Maschine vermessen (Kamera)_: Die Kamera am Fräskopf dient als Zielfernrohr – die App fährt jede
  Marke einer Punktetafel genau ins Bildzentrum und misst dabei, wie weit die Maschine wirklich
  fährt: **Maßstab X/Y**, **Rechtwinkligkeit** (Winkel X zu Y), **Umkehrspiel** und **Z-Schiefe**.
  Vorher: Kamera eingerichtet (_Einstellungen → Kamera_, ein grober Maßstab genügt) und das Bild auf
  der Bühne (_Kamerabild zeigen_), Maschine referenziert, Tafel flach und möglichst parallel zu X
  (±1°), Fräser über der Tafeloberfläche (gemessen wird in der aktuellen Höhe), Kamera mit dem
  Joystick über den Eckpunkt unten links (kleinster X- und Y-Wert) – die Anzeige meldet „Marke
  erkannt“. Tafel: _Ausdruck_ (voreingestellt:
  [`docs/kalibriertafel.svg`](docs/kalibriertafel.svg); nur der Winkel, dafür wird sie einmal
  normal und einmal um 90° gedreht gemessen: _Gedrehte Tafel messen_) oder _Präzisionsplatte_
  (Maßstab und Winkel – nur für eine Platte, deren äußere Punkte nachgemessen und als Messfeld
  eingetragen sind). Rastermaß, Punkte je Seite und Punktdurchmesser der Platte sind Felder der Karte
  (voreingestellt: die Tafel dieses Repositorys, 19 × 19 Punkte, 10 mm, Ø 3 mm); das Messfeld folgt
  ihnen und die Karte bietet nur Punktzahlen an, bei denen jeder Messpunkt auf einem Punkt der Platte
  liegt (bei 180 mm: 2 × 2, 3 × 3, 4 × 4, 7 × 7). Passt das Messfeld nicht in den Verfahrweg, sagt die
  Karte es und _Raster messen_ lehnt vor der ersten Fahrt ab. _Raster messen_, _Umkehrspiel messen_ und _Z-Schiefe messen_ sind Halten-Tasten;
  _Abbrechen_ beendet die Messung zwischen zwei Fahrten.
- **Korrektur** (beide Wege): Der Maßstab geht in `steps_per_mm` (X, Y), die Rechtwinkligkeit in
  `pulloff_mm` je Y-Motor – das Portal richtet sich bei der Referenzfahrt an zwei Y-Endschaltern
  aus; dazu den Abstand der Y-Schienen und die Seite von Y-Motor 1 (Anschluss A) angeben. _Korrektur
  in config.yaml schreiben (mit Sicherung)_ ist ein Halten; danach Steuerung neu starten,
  referenzieren und zur Kontrolle erneut messen. Unter 0,03 % Maßstab bzw. 0,05 mm Portalversatz
  schlägt die App nichts vor. Umkehrspiel und Z-Schiefe zeigt sie nur an – Riemen spannen, Z-Platten
  bzw. die Höhe der beiden Z-Motoren nachstellen (Z-Schiefe lässt sich nicht per Config
  korrigieren).
- Grenzen: Gemessen wird im Stand – wie genau die Maschine unter Last fräst, zeigt nur ein
  Probeschnitt. **Die Grenze ist die Tafel**; sie deckt nur einen Ausschnitt ab, für den Maßstab
  über die ganze Y-Länge an mehreren Stellen messen oder eine längere Referenz nehmen.
- **Messprotokoll** (darunter, in _Service → Kalibrieren_): jede Messung und jede Korrektur der
  Maschine mit Zeit und Werten – Kamera-Maßstab und -Versatz, Raster, Umkehrspiel, Z-Schiefe,
  Genauigkeits-Check mit Lineal, Referenz-Werkzeug und **jede Korrektur, die in die `config.yaml`
  geschrieben wurde** (aus der Kalibrierung, dem Konfigurations-Editor und den Grenzen der Steuerung;
  alter und neuer Wert). Mit einem Pi als Companion liegen die Einträge auch dort und sind auf jedem
  Gerät da; was im Simulator gemessen wird, steht nicht darin. Die Karte zeigt die letzten 30 und
  sagt, wie viele es sind. Noch nicht darin: Ergebnisse der Antast-Assistenten, der Lochsuche, der
  Marker und der Werkzeuglängen-Messung.

### Einstellungen

_Einstellungen_ – wie ist alles eingerichtet? Vier Ansichten: _Verbindung_ · _Maschine_ · _Kamera_ ·
_Experte_ (die letzte nur mit eingeschalteten Expertenfunktionen). Tägliches vorn, Einmaliges
eingeklappt, Experten-Werkzeuge nur auf Wunsch. Keine Hauptaktion; die Karten liegen über die ganze
Breite, nur _Kamera_ behält das Bild.

- _Verbindung:_
  - Karte _Verbindung_: über den Pi (Companion) mit einem Knopf, _Über den Pi verbinden_ (darüber steht die Zeile _Weg: dieses Gerät → Pi (…) → Jackpot (…)_ mit den beiden Adressen), sonst direkt mit der IP des Jackpot (Port 81 wird
    ergänzt) und _Verbinden_; die Adresse, _Simulator starten_ und _Demo: eingerichtete Maschine_
    liegen bei einem weiterleitenden Pi unter _Andere Verbindung_. „Verbunden“ heißt: FluidNC hat
    geantwortet (Statusabfrage beim Öffnen, bis zu 8 s). Leitet der Pi FluidNC an mehrere Browser
    weiter, steuert immer nur einer; die anderen zeigen an und dürfen nur den Status abfragen,
    pausieren und anhalten.
  - Wenn es nicht geht, sagt die Karte, welches Gerät fehlt – _Pi nicht erreichbar_ · _Pi erreicht
    den Jackpot nicht_ · _Jackpot nicht erreichbar_ –, mit Ursache und nächstem Schritt (FluidNC
    wählt sich nur beim Einschalten ins WLAN ein: erst der Router, dann der Jackpot). Außerhalb
    eines Jobs versucht die App es von selbst wieder (2, 4, 8, 16 s, dann alle 30 s; _Jetzt
    versuchen_, _Aufhören_ und der Schalter _Von selbst neu verbinden, solange kein Job läuft_, der
    gemerkt wird); während eines Jobs und nach einem Verbindungsverlust im Job nie, bis von Hand
    verbunden wurde. Ein neuer Versuch fragt nur nach dem Zustand (`?`, `$I`, `$G`, `$#`) und bewegt
    nichts; der Pi verwirft Befehle, die vor FluidNC bei ihm ankommen (nur die Statusabfrage
    wartet).
  - Karte _Companion-Rechner_ (optional): Adresse, _Verbindung testen_, _Bibliotheken abgleichen_
    (Werkzeuge, Materialien, gespeicherte Nullpunkte, Historie und Vorrichtungen werden mit dem
    Companion zusammengeführt), Version, Weiterleitung und Kamera-Stream des Companion; _Pi
    herunterfahren_ (Halten, nur bei stehender Maschine; die Fräse bleibt an) vor dem Ausstecken. Der
    Companion sichert seine Datenbank einmal am Tag (die letzten 7 Kopien, neben der Datenbank oder
    in `LOWRIDER_BACKUP_DIR`); die Karte zeigt die letzte Sicherung oder den Fehler. **Einstellungen
    und Messwerte liegen auf dem Pi:** alles, was zur Maschine gehört (Kamera-Maßstab und -Versatz,
    Kamerahöhe, Parkposition, Werkzeugwechsel-Position, Merkpunkte, Kalibrierwerte, Spindelgrenzen,
    Klemmen auf dem Tisch, Makros, ausgeblendete Funktionen, Lernwerte, Maschinenwerte und das
    _Messprotokoll_), wird kurz nach jeder Änderung auf dem Pi abgelegt und ist auf jedem Gerät da,
    das den Pi erreicht; eine Zeile der Karte sagt, wie es steht und wann es zuletzt geklappt hat.
    Der Browser behält eine Kopie für den Fall, dass der Pi weg ist, und holt es nach. Am Gerät
    bleiben die Adresse des Pi, die Benachrichtigungen dieses Browsers, die Sprache und die
    Expertenfunktionen, die Bildquelle der Kamera, das Aussehen, die Fotokarte und die zuletzt
    benutzten Jobs. Neue Werte vom Pi übernimmt die App nur, solange nichts fährt, kein Job läuft und
    kein Messlauf unterwegs ist; im Simulator wird nichts abgeglichen (und was dort eingestellt
    wurde, ist danach wieder weg). Ein Pi mit alter Version wird erkannt (die Karte sagt es), alles
    andere geht weiter. Liegt auf dem Pi ein Dokument, das die App nicht lesen kann, sagt sie es
    einmal und überschreibt nichts; ein langes Drücken auf _Stand dieses Geräts auf den Pi
    schreiben_ ersetzt es.
  - Karte _Anmeldung am Pi_: Das Aktualisieren und das Herunterfahren des Pi und die Verwaltung der
    Anmeldung brauchen ein angemeldetes Gerät (alles andere – Bibliotheken, Einstellungen, die
    Weiterleitung zur Fräse – bleibt offen wie bisher). Einmal pro Gerät den **Pi-Code** eingeben
    (`ABCD-EFGH-JKLM`; er steht am Ende der Einrichtung auf dem Pi und, auf einem Gerät, das schon
    angemeldet ist, hier); die Karte zeigt die angemeldeten Geräte (einzeln entfernen), den Code
    (anzeigen, erneuern, alle anderen Geräte abmelden – jeweils Halten). Fünf falsche Versuche
    sperren die Adresse für bis zu fünf Minuten. Code und Anmeldung gehen unverschlüsselt durchs WLAN: das
    hält andere Webseiten und Gäste-Geräte fern, nicht jemanden, der den Funkverkehr mitliest.
  - Karte _Update des Pi_: `lowrider-pi.zip` wählen (optional die Prüfsumme eintippen, die man getrennt von der
    Datei genannt bekommen hat), der Pi prüft die Datei und zeigt, was drin ist; ein **Halten** spielt sie
    ein – nach einer frischen Kopie der Datenbank und einem Probelauf der neuen Version. Die App wartet
    auf den Neustart und sagt, welcher Stand läuft; startet die neue Version nicht, kehrt der Pi
    von selbst zur alten zurück (und die Karte sagt es). _Zur vorherigen Version zurück_ (Halten)
    tut dasselbe von Hand. Ein Update aus der App ändert nie die Einrichtung selbst (`setup.sh`,
    Dienste, Rechte): braucht eine Version mehr, lehnt der Pi ab, und `update-pi.bat` (Doppelklick
    auf dem PC, liegt in `lowrider-pi.zip` neben dem Ordner `pi`) spielt sie ein – so auch beim
    allerersten Mal. Einzelheiten und Grenzen: `docs/update-konzept.md`, `docs/companion.md`.
  - Karte _Simulator_ nur, solange der Simulator verbunden ist – siehe **Simulator**.
- _Maschine:_ _Darstellung_ (_Dunkel_ oder _Hell_, wird gemerkt), danach eingeklappt
  _Maschinenprofil_, _Werkstatt und Benachrichtigungen_ und _Makros_, die Karte _Funktionen_ (je ein
  Schalter für _Serie auf Rohlingen_, _Vorrichtungen mit Markern_ und _Makros_: ausgeblendet
  verschwinden nur ihre Karten und Knöpfe, ein Ablauf, der für den geladenen Job läuft, bleibt
  sichtbar, und die Schnellsuche führt zum Schalter zurück), zuletzt der Schalter
  _Expertenfunktionen anzeigen_ (schaltet die Ansicht _Experte_ und die _Konsole_ im Menü frei).
  - _Maschinenprofil_ enthält:
    - Den **Verfahrweg** je Achse (min/max in Maschinenkoordinaten, _Aktuelle Position als min/max_)
      – der Software-Endschalter der App: Sind alle Achsen referenziert und ist
      _Software-Endschalter beim Joggen_ an, stoppt jeder Jog an der Grenze (siehe Abschnitt
      „Einrichten und Jog / Manuell“); Jobs werden dagegen geprüft; solange das Profil nur
      Platzhalterwerte trägt, sagt das eine Warnung. Die _Tippgeschwindigkeit der App_ (XY und Z)
      hat die Grenze der Steuerung daneben („Z: 4000 eingestellt, fährt max. 1200 mm/min“).
    - **Grenzen der Steuerung (FluidNC):** Höchstgeschwindigkeit (60–20 000 mm/min) und
      Beschleunigung (10–2000 mm/s²) je Achse, gelesen aus der laufenden Konfiguration (`$CD`),
      geschrieben nur bei stehender Maschine und ohne Alarm, per Halten, mit `$/axes/<a>/<item>=<v>`
      (FluidNC prüft, sein Planer nimmt den Wert sofort) und zurückgelesen. Jede Erhöhung warnt
      (Schritte können verloren gehen; empfohlen: höchstens 20 % auf einmal, danach die
      Wiederholprobe unter _Service → Kalibrieren_). Das Häkchen _Auch in der config.yaml speichern_
      (vorgewählt) gibt es nur dort, wo die App die `config.yaml` Byte für Byte lesen kann – über
      den Pi (Companion) oder im Simulator: Die alte Datei geht als `<name>.bak` daneben, geändert
      werden nur diese Schlüssel, beides wird hochgeladen und verglichen. Sonst steht da „gilt bis
      zum nächsten Neustart der Steuerung“ – nie, es sei gespeichert. An der echten Maschine noch
      nicht geprüft ([docs/erste-schritte.md](docs/erste-schritte.md): zuerst mit Vergleich und
      Neustart prüfen).
    - **Steuerung (config.yaml):** Verfahrweg, Geschwindigkeiten und Beschleunigungen aus einer
      `config.yaml` übernehmen – _config.yaml laden_ (Datei) oder _Von der Maschine lesen ($CD)_;
      die Karte sagt, ob `soft_limits` an sind, und warnt, wenn FluidNC bei `M6` nicht anhält.
    - **Profil teilen:** Maschinenprofil, Werkzeuge, Materialien und Makros als JSON-Datei
      exportieren und importieren; ein LowRider-v4-Profil liegt bei ([profiles/](profiles)) und
      lässt sich mit _Mitgeliefertes Profil laden_ übernehmen.
  - _Werkstatt und Benachrichtigungen:_ _Werkstatt-Einstellungen_ (Sprache Deutsch/English,
    _Bildschirm anlassen, solange verbunden_, Spindel mit Drehzahl min/max und maximalem
    Fräsvorschub, Sichere Höhe Z – leer = automatisch –, Werkzeugwechsel-Position),
    _Benachrichtigungen_ (im Browser; über den Companion ans Handy per ntfy; mit Testnachricht) und
    die Werte für den adaptiven Vorschub (Abschnitt _Adaptiver Vorschub_ in der Karte _Benachrichtigungen_: Ziel-Last und höchster
    Override; geregelt wird im laufenden Job, die Sensordaten kommen vom Companion).
  - _Makros:_ _Makros bearbeiten_ (Name und G-Code, ein Befehl pro Zeile); ausgeführt werden sie im
    Jog-Feld unter _Mehr Optionen_.
- _Kamera:_ **Kamera einrichten**, einmalig, mit dem Bild auf der Bühne: _Bildquelle_
  (_Gerätekamera_ · _Companion-Stream_ mit MJPEG-Adresse · _Simulator-Kamera_, die erst erscheint,
  wenn der Simulator verbunden ist), _Kalibrieren_ (_Maßstab_: ein Merkmal antippen, X um 10 mm
  joggen, dasselbe Merkmal erneut antippen; _Versatz_: mit dem Fräser eine kleine Markierung setzen,
  die Position merken, die Kamera darüber fahren – die App findet die Markierung selbst),
  _Kamerahöhe_ (der Maßstab gilt bei dieser Z-Höhe über dem Nullpunkt; _Auf Kamerahöhe fahren_,
  _Aktuelle Höhe übernehmen_) und _Zeitraffer_ (bei jedem Job Bilder aufnehmen, ein Bild alle …
  Sekunden). Das ist die Kalibrierung der Kamera für Fadenkreuz, Antippen und Fotokarte; die
  Maschine vermessen heißt _Service → Kalibrieren_.
- _Experte_ (einschalten mit _Expertenfunktionen anzeigen_ unter _Maschine_): _config.yaml ändern_
  (von der Maschine lesen, Original herunterladen; die wichtigsten Werte per Formular –
  `soft_limits`, `max_travel_mm`, `use_line_numbers`, `must_home`; vor dem Schreiben legt die App
  eine Sicherung auf der Maschine ab, _Sichern und schreiben_ ist ein Halten; FluidNC schreibt die
  Datei neu, Kommentare des Originals gehen verloren – darum zuerst das Original herunterladen),
  _config.yaml komplett bearbeiten (Experten)_ (die ganze Datei mit Kommentaren; Prüfung auf
  Tabulator, Einrückung, doppelte Schlüssel, fehlende Achse und Zahlen; Diff gegen die Maschine;
  Sicherung; _Sichern und hochladen_ als Halten, bei einem Fehler, mit dem FluidNC nicht startete,
  gesperrt), _Neustart ($Bye)_ (Halten), _$-Einstellungen_ (mit Erklärung, `$S` lesen, suchen und
  setzen; was das WLAN trennen kann, warnt und verlangt ein Halten) und _Firmware flashen (USB)_
  (Web Serial, Chrome/Edge, aus dem FluidNC-Release-ZIP, Funk-Variante WLAN · Bluetooth · ohne Funk;
  die `config.yaml` bleibt erhalten und lässt sich vorher sichern; Flashen ist ein Halten).

### Menü

Der Knopf _Menü_ in der Reiterzeile (Dialog _Hauptmenü_) hält, was zu keinem Bereich gehört: die
_Werkzeugliste_ und, nur mit eingeschalteten Expertenfunktionen, die _Konsole_. Solange eine von
beiden offen ist, trägt der Knopf ihren Namen. Beide liegen über die ganze Breite ohne Bild.

- _Werkzeugliste_ („Werkzeuge und Materialien anlegen und pflegen“): die _Werkzeugbibliothek_ (Art –
  Schaftfräser, Kugelfräser, V-Nut, Bohrer, Fase –, T-Nummer, Ø, Schneiden, Winkel, Schneidenlänge,
  Auskraglänge, Halter und Halter-Ø, Notiz, Foto und – wahlweise – eigene _Schnittwerte_ (Drehzahl,
  Vorschub, Eintauchvorschub, Zustellung, Bahnabstand), die den Vorschlag aus Material und Lernen
  ersetzen, auch ganz ohne Material; ein Werkzeug lässt sich als _Messtaster_ markieren
  – der Start fragt dann jedes Mal nach, bevor die Spindel dreht), die _Materialbibliothek_ (Holz ·
  Platte · Kunststoff · Metall; Schnittgeschwindigkeit vc, Zahnvorschub fz bei Ø 6, Zustellung,
  Bahnabstand, Eintauchen) und die _Schnittwerte_ zu einem Werkzeug und Material (Drehzahl,
  Vorschub, Eintauchen, Zustellung, Bahnabstand, Zahnvorschub; ein Hinweis nennt, wo Spindel oder
  Maschine sie begrenzen). Der Vorschub **lernt** je Werkzeug und Material aus beendeten Jobs: aus
  dem Override, mit dem gefräst wurde, aus einem Abbruch und – mit Sensordaten vom Companion – aus
  Rattern und Spindellast (zwischen 50 und 150 % des Tabellenwerts; „Aus n Job(s) gelernt …“,
  _Gelerntes zurücksetzen_ ist ein Halten). Die Werkzeuge des Jobs (_Fräsen → Prüfen_) bedienen sich
  aus dieser Liste.
- _Konsole_ („G-Code von Hand senden, Rohlog“): das Protokoll mit Filter (_Alles_ · _Gesendet und
  empfangen_ · _Meldungen der App_) und eine Zeile für G-Code oder `$`-Befehle; ↑/↓ im Feld oder ein
  Tipp auf eine der zuletzt gesendeten Zeilen holt sie zurück (ein Tipp füllt nur das Feld, gesendet
  wird mit _Senden_), darunter steht die Antwort der Steuerung – `ok` oder `error:n` mit Bedeutung.
  **Was hier gesendet wird, führt die Steuerung sofort aus – ohne die Prüfungen der App.** Ohne
  Expertenfunktionen gibt es die Konsole nicht.

### Simulator

- _Einstellungen → Verbindung → Simulator starten_ (bei einem weiterleitenden Pi unter _Andere
  Verbindung_): eine LowRider mit Jackpot/FluidNC und Kamera am Fräskopf, im Browser simuliert – zum
  Ausprobieren ohne Hardware (Referenzfahrt, Joggen, Jobs, Antasten, Kalibrieren, Bohrungen); die
  Statusleiste trägt dazu die Marke _Simulator_. Die Mechanik hat absichtlich kleine Fehler
  (Maßstab, Rechtwinkligkeit, Umkehrspiel, Z-Schiefe), die die Kalibrierung finden soll; die Karte
  _Simulator_ nennt sie zum Vergleich, dazu die wahre Lage von Kalibriertafel und Bohrungen.
- _Kamera:_ Über `…#simulator` und in der Demo ist die Simulator-Kamera von selbst an. Nach
  _Simulator starten_ schaltet _Kamera einschalten_ (im Kamerabild der Bühne) sie ein, solange unter
  _Einstellungen → Kamera_ nicht die Gerätekamera oder ein Stream gewählt ist; dort lässt sich
  _Simulator-Kamera_ auch von Hand wählen.
- Jobs starten wie an der echten Steuerung von der (simulierten) SD-Karte; ein _Zeitraffer_ (1×,
  10×, 50×) auf der Simulator-Karte kürzt das Zuschauen ab. Der Fräser hinterlässt Spuren in seiner
  Breite und Tiefe, und bei einem beidseitigen Job wendet sich das 12 mm dicke Brett im Schritt
  _Teil wenden_ des Ablaufs **Wenden** von selbst – von Hand etwas verschoben und verdreht, auf
  Passstiften genau.
- _Auf dem Tisch_ räumt den Tisch um (die Fotokarte wird dabei geleert, in der Demo neu angelegt):
  statt _Brett und Kalibriertafel_ liegen dort
  - _Rohlinge für eine Serie_: acht kleine, nämlich drei Anhänger in schiefen Winkeln, ein runder
    und ein quadratischer Untersetzer, ein langes Schild und zwei Anhänger, von denen einer mit
    einer Ecke auf dem anderen liegt – weiter im **CAM** mit _Serie: auf Rohlinge verteilen_;
  - eine _Vorrichtung mit Markern_: ein Rahmen mit einem Untersetzer und zwei gedruckten Markern
    (Nr. 1 und 2, 40 mm), der bei jedem Auflegen und mit _Vorrichtung woanders hinlegen_ anders
    liegt – verschoben und verdreht, zuletzt um eine Viertel- und um eine halbe Drehung;
  - ein _Langes Brett_: 2,6 m Kiefer auf einer Maschine, die in X 1,22 m fährt; _Beispiel
    „Regalseite“ laden und Nullpunkt setzen_ (Halten) lädt den Beispieljob (2,48 m), den die
    Startklar-Liste in _Fräsen → Prüfen_ als _Teil ist länger als der Tisch_ mit **In Abschnitten
    fräsen** anbietet. Im Ablauf klebt der Simulator die Marker selbst auf und schiebt das Brett
    weiter, jedes Mal etwas ungenau und leicht verdreht.
- _Tisch zurücksetzen (Spuren und Nullpunkte löschen)_ lässt liegen, was auf dem Tisch ist; danach
  neu referenzieren.
- `pnpm bundle` legt neben `release/lowrider-control.html` auch `release/lowrider-simulator.html`
  (startet direkt im Simulator, wie `…#simulator`) und `release/lowrider-demo.html` ab.
- _Demo: eingerichtete Maschine_ (an derselben Stelle, `…#demo` oder `release/lowrider-demo.html`
  per Doppelklick): der Simulator wie fertig eingerichtet – referenziert, Nullpunkt auf Bohrung 1,
  Kamera kalibriert, Fläche als Fotokarte gescannt, Beispieljob ausgerichtet auf dem Brett, eine
  Zwinge markiert, eine Vorrichtung angelernt, Parkposition gesetzt. Sie beginnt auf dem
  Start-Bildschirm; ein Tipp auf den Reiter _Job_ zeigt den Tisch auf der Bühne. Zum Vorführen: Die
  Statusleiste trägt die Marke _Demo_, nichts wird gespeichert (nach dem Neuladen ist sie wieder im
  Ausgangszustand), echte Einstellungen und der Companion bleiben unberührt; über `…#demo` geöffnet,
  beendet _Demo beenden_ (Karte _Simulator_) sie.

### Als App auf dem iPad

- Vom Pi ausgeliefert und in Safari über _Teilen → Zum Home-Bildschirm_ abgelegt, startet die
  Steuerung im Vollbild mit eigenem Symbol (Symbol, Manifest und Startbilder liegen als Dateien
  neben der Seite; aus `file://` läuft die App wie bisher, nur ohne Symbol).
- Fingergesten auf der Bühne (schieben, mit zwei Fingern zoomen, Doppeltipp passt ein); seitliches
  Wischen auf dem Bedienfeld wechselt die Ansicht des Bereichs (etwa _Vorbereiten_ ↔ _Extras_ im Job
  – die Bereiche selbst wechseln nur in der Reiterzeile); _Großbild_ für die Bühne über die ganze
  Breite (ein Reiter in der Leiste holt das Bedienfeld zurück). **Keine Geste bewegt die Maschine**;
  was gehalten wird, lässt los, sobald der Finger abrutscht, ein zweiter aufsetzt, iPadOS die
  Berührung übernimmt oder die App in den Hintergrund geht.
- Die Home-Bildschirm-App hat einen eigenen Speicher: Was in Safari eingestellt wurde, ist dort
  nicht da – Werkzeuge, Materialien, Nullpunkte, Historie und Vorrichtungen kommen über
  _Einstellungen → Verbindung → Companion-Rechner → Bibliotheken abgleichen_, das Maschinenprofil
  über _Profil teilen_ (_Einstellungen → Maschine → Maschinenprofil_).
- Ohne https gibt es kein offizielles „Bildschirm anlassen“: Solange die Maschine verbunden ist,
  spielt die App ein stilles, unsichtbares Video ab (_Einstellungen → Verbindung_ sagt, was gerade
  gilt; abschalten unter _Einstellungen → Maschine → Werkstatt und Benachrichtigungen → Bildschirm
  anlassen, solange verbunden_).
- Anleitung: [`docs/ipad.md`](docs/ipad.md); eine native Hülle ist in
  [`apps/ios`](apps/ios/README.md) beschrieben, nicht gebaut.

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
pnpm bundle         # release/: lowrider-control.html, companion.mjs, pi/ und lowrider-pi.zip (mit update-pi.bat) samt .sha256
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
