# Fläche scannen: in Fahrt oder mit Halt

Unter **Einrichten → Kamera → Fläche scannen** gibt es zwei Arten, den Tisch zu fotografieren:

- **Mit Halt (genau)**: die Kamera fährt von Punkt zu Punkt, hält an, wartet, bis das Bild ruhig ist, und nimmt eines auf. Langsam
  (pro Bild etwa 2–3 s), aber jedes Bild entsteht im Stillstand. Die Serie auf Rohlingen und alles, was auf den Millimeter ankommt,
  scannt immer so.
- **In Fahrt (schnell)** – nur auf Wunsch, nicht voreingestellt: die Kamera fährt in Streifen (längere Strecken in Abschnitten von
  höchstens 400 mm) ohne anzuhalten und nimmt unterwegs Bilder auf. Am Anfang und am Ende jedes Abschnitts steht sie kurz still und
  nimmt ein Bild im Stillstand auf – das sind die Ankerbilder. Vor dem ersten Streifen fährt die Kamera einmal langsam (bis 110 mm),
  um die Verzögerung ihres Bildes zu messen; die App merkt sich das, bis die Kamera gewechselt wird. Die Bilder dazwischen werden nicht
  nach der Uhr abgelegt (das Kamerabild kommt später, als die Steuerung die Position meldet, und ungleichmäßig), sondern **an ihrer
  Überlappung eingepasst**: von beiden Ankern aus, Bild für Bild. Was sich nicht klar einpassen lässt (zu wenig Struktur, ein
  Tisch mit regelmäßigem Muster), wird weggelassen und nach der Fahrt **mit Halt nachgeholt**. Lässt sich ein ganzer Abschnitt
  nicht einpassen, **gibt die App die Fahrt auf**: der Rest wird mit Halt gescannt, und die nächsten Scans gehen mit Halt, bis du
  „In Fahrt“ neu wählst. Ein Tisch ohne sichtbare Struktur (glatte Platte, ein glattes Blatt) kostet so nur den Probelauf und einen
  Abschnitt.

Die Karte ist in beiden Fällen **nahtlos**: Die Bilder werden überblendet, die Helligkeit angeglichen und die Randabdunkelung der
Kamera herausgerechnet. Es gibt keine sichtbaren Kachelränder mehr.

## Wie viel schneller?

Die App zeigt beide Zeiten nebeneinander („12 Streifen, etwa 4 min – mit Halt wären es 81 Bilder, etwa 9 min“). Der Gewinn kommt aus
dem Wegfall von Halt, Beruhigungszeit und Bildverzögerung je Bild; er wächst mit der Fläche und mit dem **Tempo**
(Sanft 40 % / Normal 80 % / Schnell 140 % des Jog-Vorschubs unter Einstellungen → Maschine, höchstens 90 % der Maschinengrenze). Mit den
Werten einer Standard-LowRider (Jog 50 mm/s, Beschleunigung 200 mm/s²) und einem Sichtfeld von 120 × 90 mm rechnet die App etwa so:

| Fläche | Mit Halt | In Fahrt, Normal | In Fahrt, Schnell |
| --- | --- | --- | --- |
| 300 × 300 mm | 1,4 min | 1,1 min (×1,2) | 0,9 min (×1,5) |
| 600 × 400 mm | 3,7 min | 2,5 min (×1,5) | 1,7 min (×2,1) |
| 1200 × 600 mm | 11 min | 6,6 min (×1,7) | 4,2 min (×2,7) |

„Sanft“ ist nicht schneller als mit Halt. Je schneller, desto mehr Bewegungsunschärfe: bei wenig Licht oder feiner Struktur langsamer
fahren. Ein Vielfaches im Sinn von ×5 bis ×10 gibt dieses Verfahren nicht her; die Streifen liegen so eng wie die Zeilen beim Scan mit
Halt, damit die Fläche lückenlos ist.

## So prüfst du es an der Maschine (einmal, mit deiner Kamera)

Der Simulator kann eine verspätete Kamera nachmachen, aber nicht deine: Verzögerung, Rolling Shutter und Belichtungszeit deiner
Kamera lassen sich nur an der Maschine messen.

1. Einen Bereich mit der Referenztafel (oder einem Blatt mit klaren Punkten/Kreuzen) scannen – **mit Halt**. Die Karte ansehen: Tafel
   → Bereich, Maßstab, wie bisher.
2. Denselben Bereich **in Fahrt** scannen (zuerst „Sanft“, dann „Normal“).
3. Auf der Karte im Tisch-Bild an mehreren Stellen (auch dort, wo zwei Abschnitte aneinanderstoßen und an den Enden) ein klares Merkmal
   antippen, mit „Kamera hierhin“ hinfahren und prüfen, ob das Fadenkreuz auf dem Merkmal liegt. Die Abweichung zwischen den beiden
   Scans sollte unter etwa 0,5 mm bleiben.
4. Unter **Service → Diagnose** steht im Protokoll, ob die Fahrt aufgegeben wurde („Die Fahrt hat auf diesem Tisch nicht getaugt …“)
   oder ob nach der Fahrt Bilder mit Halt nachgeholt wurden („Nach der Fahrt fehlen Stellen …“). Wird aufgegeben oder werden viele
   nachgeholt, passt das Tempo (Unschärfe) oder der Tisch (zu wenig Struktur, oder ein Muster, das sich alle paar Millimeter
   wiederholt) nicht – dann „Mit Halt“ lassen.

Bei Abweichungen über 0,5 mm bitte den Diagnosebericht speichern (Service → Meldungen) und mit dem Tempo, der Fläche und dem
Befund aus Schritt 3 weitergeben. (Der Bericht enthält die Zeilen des Protokolls, nicht die Zahlen des Scans.)

## Aufzeichnung für die Auswertung

Was deine Kamera wirklich tut – Verzögerung, Unschärfe bei Tempo, die Struktur deines Tisches –, lässt sich nur an der Maschine messen. Dafür
kann die App einen Scan **aufzeichnen**; ausgewertet wird die Datei danach, ohne Verbindung zur Maschine.

1. Unter **Einrichten → Kamera → Fläche scannen** das Häkchen **„Scan für die Auswertung aufzeichnen“** setzen. Es merkt sich, bis du es
   wieder abschaltest. Solange es an ist, gibt die Fahrt nicht auf, auch wenn sich die Bilder schlecht einpassen lassen – gerade das will
   man ja sehen.
2. Denselben Bereich nacheinander scannen: **einmal „Mit Halt“** (die Bilder im Stillstand sind die Messlatte) und danach **„In Fahrt“** in
   „Sanft“, „Normal“ und „Schnell“. Ein kleiner Bereich genügt (etwa 300 × 200 mm), am besten mit einer klaren Struktur darauf (die
   Referenztafel, ein bedrucktes Blatt) und danach noch einmal ohne.
3. **„Aufzeichnung speichern“** (nach dem Verpacken, das Panel zeigt den Fortschritt). Die Datei ist ein Zip von bis zu etwa 40 MB und
   **enthält Fotos deines Tisches**; sie enthält keine Adresse und keine Anmeldung.
4. Die Datei weitergeben (hier im Chat hochladen) – oder selbst auswerten:

```bash
python3 scripts/analyze-scan.py lowrider-scan-….zip
```

Die Auswertung (Python mit numpy und Pillow) nennt die Verzögerung der Bilder hinter den Meldungen der Steuerung und ihr Zeitrauschen, den
Takt der Bilder und der Meldungen, Aussetzer der Seite, wie viele Bilder der Fahrt sich einpassen ließen und wie weit die eingepassten Bilder
von den Bildern im Stillstand abweichen. Die Seite selbst kostet beim Aufzeichnen etwas Zeit (Aussetzer von 30–50 ms stehen in der Auswertung);
das ist bei der Deutung zu berücksichtigen.

## Wie ein Kamerabild seinen Zeitstempel bekommt

**Stand dieser Stufe:** die Bausteine sind gebaut und getestet (gegen erfundene Ströme, nicht gegen ein echtes ustreamer), der Scan benutzt sie
noch nicht. Was unten im Präsens von der App steht, ist das, was die Bausteine können; das Einhängen in den Scan folgt in der nächsten Stufe.

Ein Bild aus der Fahrt soll dorthin auf die Karte kommen, wo die Kamera war, als es aufgenommen wurde. Die Uhr des Browsers weiß das nicht
(das Bild wird spät gesehen, um eine unbekannte und schwankende Zeit). Deshalb kann die App den Kamera-Stream des Pi (ustreamer,
Port 8081) **selbst** lesen, als zweite Verbindung neben dem Bild auf dem Schirm, mit `…/stream?extra_headers=1`, und den Zeitstempel
aus dem Kopf jedes Bildes nehmen. Die Positionsmeldungen der Steuerung stempelt das Relais des Companions mit der Uhr des Pi
(`docs/companion.md`); beide zusammen liegen dann auf **einer** Zeitachse – sofern es dieselbe Uhr ist. Die Prüfung dafür (`domainFits`) ist
gebaut; der Scan ruft sie erst in der nächsten Stufe auf.

Gebaut ist das so: `lib/mjpeg.ts` zerlegt den endlosen Strom (`multipart/x-mixed-replace`) in Bilder mit ihren Köpfen, `lib/frameStamp.ts`
wählt aus den Köpfen den Zeitstempel und prüft ihn gegen den der Positionsmeldung, `store/stampedFrames.ts` sammelt die Bilder. **Während der
Fahrt werden nur Bytes und Stempel kopiert** – in einen Ring mit festen Grenzen (höchstens 300 Bilder und 64 MB; Bilder, die näher als
50 ms am zuletzt behaltenen liegen, bleiben weg; dasselbe Bild zweimal wird nur einmal behalten; ein langsamer Streifen von 400 mm hätte bei 50 ms Abstand 400 Bilder – darum soll der Scan den Abstand selbst setzen und danach nachsehen, ob vom Anfang etwas herausgefallen ist). Dekodiert wird erst nach der Fahrt, ein
Bild nach dem anderen.

**Was ustreamer pro Bild schickt** – gelesen in `server.c` von v4.13, v5.0, v5.41, v6.0, v6.20 und des Master-Zweigs (Stand 2026-11), nicht
ausprobiert. Jedes Bild beginnt mit `--boundarydonotcross`, hat Kopfzeilen, dann die JPEG-Bytes, dann `CRLF --boundarydonotcross CRLF`:

| Kopfzeile                     | ab                                     | Einheit und Uhr                                           | Bedeutung                                                                                   |
| ----------------------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `X-Timestamp`                 | v4.13 bis Master, immer                | Sekunden, Echtzeituhr (CLOCK_REALTIME)                    | der Moment, in dem der Kopf zum Senden geschrieben wurde: **Sendezeit**, nicht Aufnahmezeit |
| `X-UStreamer-Grab-Time`       | v4.13 bis v6.20, mit `extra_headers=1` | Sekunden, CLOCK_MONOTONIC, soweit es die des Treibers ist | `grab_ts` des Bildes                                                                        |
| `X-UStreamer-Grab-Begin-Time` | Master, mit `extra_headers=1`          | wie oben                                                  | `grab_begin_ts`, der Zeitstempel des V4L2-Puffers                                           |
| `X-UStreamer-Grab-End-Time`   | Master, mit `extra_headers=1`          | Sekunden, CLOCK_MONOTONIC von ustreamer selbst            | gleich nach dem Holen des Puffers genommen, also später als die Aufnahme                    |
| `X-UStreamer-Online`          | v4.13 bis Master                       | `true` / `false`                                          | `false`: ein Platzhalterbild, nicht das der Kamera                                          |

Die App nimmt in dieser Reihenfolge: `Grab-Begin-Time`, `Grab-Time`, `Grab-End-Time`, zuletzt `X-Timestamp` (Sendezeit, die schlechteste Wahl). Sie
sagt dabei, welche Kopfzeile es war, und mischt nie zwei: das erste Bild entscheidet für den ganzen Strom.

Was daran sicher ist, und was nicht:

- Alle Zahlen sind Sekunden mit sechs Nachkommastellen, aber von ustreamer **auf Millisekunden gerundet** (gelesen im Master-Zweig; für die
  älteren Versionen lag die Zeitfunktion nicht vor). Die Auflösung jedes Stempels ist 1 ms.
- Die Grab-Zeit ist in v6.20 und im Master der **Zeitstempel des V4L2-Puffers** (`buf.timestamp`, gelesen im Quelltext), also die Uhr des
  Kameratreibers. Welche Uhr das ist, steht nicht in ustreamer: nach allgemeinem V4L2-Wissen (nicht aus dem Quelltext) meist CLOCK_MONOTONIC,
  bei manchen Treibern die Echtzeituhr. Für v4.13 bis v6.0 lag die Quelle des Aufnahmeteils nicht vor: **dort ist nicht bekannt**, was
  `grab_ts` ist. Darum soll zur Laufzeit geprüft werden, ob der Stempel eines Bildes höchstens 3 s neben dem der letzten Positionsmeldung in
  derselben Uhr liegt (`domainFits`, gebaut); wenn nicht, ist es nicht dieselbe Uhr, und der Scan soll die Uhr des Browsers nehmen
  (kommt mit der nächsten Stufe).
- ustreamer schickt dasselbe Bild **noch einmal**, wenn länger als eine Sekunde kein neues kam – mit derselben Grab-Zeit, aber neuem `X-Timestamp`.
  Darum erkennt die App eine Wiederholung an der Grab-Zeit, und bei der Sendezeit an den Bytes.
- `advance_headers=1` (schickt keine `Content-Length` und keine `X-UStreamer-*`-Zeilen, und der `X-Timestamp` ist der des _nächsten_ Bildes) fordert die App nie an.
- Welche ustreamer-Version auf deinem Pi läuft, weiß die App nicht; sie nimmt, was da ist. Und ob ein Safari auf dem iPad den Stream
  stückweise lesen lässt (`fetch` mit Datenstrom), ist hier nicht geprüft – wenn nicht, meldet der Baustein „nicht verfügbar“ mit einem Grund (`no-body-stream`, `unreachable` …); die Fahrt soll
  dann wie bisher gehen und das im Panel sagen (kommt mit der nächsten Stufe).

**Zwei Befehle auf dem Pi** (per SSH), die sagen, was deine Kamera wirklich schickt:

```bash
curl -s 'http://127.0.0.1:8081/stream?extra_headers=1' | head -c 3000 | strings
curl -sD- -o /dev/null http://127.0.0.1:8081/snapshot
```

Worauf du achtest:

- Beim ersten Befehl: Zeilen `X-Timestamp: 17…` (eine Zahl um 1,7 Milliarden: Echtzeit) und `X-UStreamer-Grab-Time:` oder `X-UStreamer-Grab-Begin-Time:`
  (eine **kleine** Zahl, etwa `123456.789000`: Sekunden seit dem Start des Pi, also CLOCK_MONOTONIC). Fehlen alle `X-UStreamer-…`-Zeilen,
  kennt dein ustreamer `extra_headers` nicht, und es bleibt die Sendezeit. Steht bei der Grab-Zeit eine Zahl um 1,7 Milliarden, stempelt
  der Treiber mit der Echtzeituhr (das erkennt `domainFits`; der Rückfall im Scan kommt mit der nächsten Stufe); steht dort `0.000000`, gibt der
  Treiber keine Zeit an.
- Zum Vergleich der Uhren: `python3 -c "import time; print(time.monotonic())"` auf dem Pi. Die Grab-Zeit muss in derselben Größenordnung liegen und
  um höchstens wenige Sekunden von dieser Zahl abweichen; steht dort etwas ganz anderes, ist es nicht dieselbe Uhr.
- Beim zweiten Befehl (die Köpfe eines Einzelbilds): Heißen die Zeilen `X-UStreamer-Grab-Begin-Timestamp` und `…Grab-End-Timestamp`, ist es der
  Master-Zweig; heißt eine `X-UStreamer-Grab-Timestamp`, ist es v4.13 bis v6.20. `X-UStreamer-Send-Timestamp` ist die Zeit von ustreamer
  selbst (CLOCK_MONOTONIC) beim Senden – auch sie mit `time.monotonic()` vergleichen. `ustreamer --version` nennt die Version.
