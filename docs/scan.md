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
von den Bildern im Stillstand abweichen. Lief ein Scan auf der **Uhr des Pi**, enthält die Datei **beide** Zeiten jeder Meldung (wann die
Seite sie sah, und der Stempel des Relais) und jedes Bildes (wann die Seite es bekam, und der Stempel des Kamera-Servers); die Auswertung
rechnet dann Verzögerung und Zeitrauschen für **beide Uhren** aus denselben eingepassten Bildern, sagt, welche weniger streut, und nennt, wie
ungleichmäßig die Seite Meldungen und Bilder gegenüber ihren Stempeln sah (die Streuung der Differenz – das ist das Schwanken auf dem Weg zur
Seite, das im Stempel nicht steckt). Dateien ohne Stempel (ältere, oder ein Scan auf der Uhr des Browsers) wertet sie wie bisher aus.
`meta.clock` in der Datei sagt, auf welcher Uhr die Scans liefen (`pi`, `browser`, `mixed`). Die Seite selbst kostet beim Aufzeichnen etwas Zeit (Aussetzer von 30–50 ms stehen in der Auswertung);
das ist bei der Deutung zu berücksichtigen.

## Eine Uhr für den Scan: die des Pi, oder die des Browsers

In einer Fahrt wird jedes Bild dorthin auf die Karte gelegt, wo die Kamera war, als es aufgenommen wurde – und das sagt eine **Uhr**: die
Position der Maschine zu einer Zeit. Die Positionsmeldungen der Steuerung und die Kamerabilder müssen dazu auf **derselben** Uhr stehen.
Es gibt zwei Möglichkeiten, und ein Scan nimmt **genau eine** – nie eine Mischung (ein Pi-Stempel gegen die Ankunftszeit in diesem Browser
wäre um den Unterschied der Uhren daneben: Stunden oder Jahrzehnte):

- **Uhr des Pi.** Das Relais des Companions stempelt jede Meldung der Steuerung mit der Uhr des Pi, wenn sie dort ankommt
  (`docs/companion.md`), und der Kamera-Server des Pi (ustreamer) stempelt jedes Bild. Die App liest dazu den Stream des Pi **selbst**, als
  zweite Verbindung neben dem Bild auf dem Schirm (`…/stream?extra_headers=1`), und nimmt den Stempel aus dem Kopf jedes Bildes. Weder die
  Verzögerung noch das Schwanken auf dem Weg zum Browser steckt dann in einer der beiden Zeiten, und die Bilder der Fahrt kommen aus
  diesem Strom, nicht aus dem, was der Schirm gerade zeigt.
- **Uhr des Browsers** (wie bisher): Meldung und Bild bekommen die Zeit, zu der **diese Seite** sie zum ersten Mal sah. Das Bild kommt spät, um eine
  unbekannte und schwankende Zeit; der gleichbleibende Teil wird gelernt (der Probelauf), das Schwanken bleibt.

Die App nimmt die Uhr des Pi nur, wenn **alle** vier Bedingungen stimmen – sonst die des Browsers, und sie sagt, warum (im Panel unter „Uhr des
letzten Scans in Fahrt“, im Protokoll und in der Aufzeichnung):

| Grund | heißt |
| --- | --- |
| *die Meldungen kommen ohne Zeitstempel des Pi* | die Steuerung ist nicht über den Pi verbunden, oder der Companion ist älter und stempelt nicht (`relay`) |
| *die Kamera ist kein Stream des Pi* | Gerätekamera, oder keine Stream-Adresse eingestellt (`device`) |
| *der Stream lässt sich nicht mit Zeitstempeln lesen* | der Server antwortet nicht, lässt die Seite nicht lesen (CORS), liefert nichts oder nichts mit Stempel, oder dieser Browser liest keinen Datenstrom (`stream`, dahinter der Fehlercode) |
| *die Stempel der Bilder liegen in einer anderen Uhr* | der Stempel des Bildes liegt mehr als 3 s neben dem der letzten Meldung in derselben Uhr, z. B. weil der Kameratreiber mit einer anderen Uhr stempelt (`window`) |

Wo gar kein Pi zur Verbindung gehört (Steuerung direkt, kein Companion eingestellt), steht kein Grund da: es gibt nichts zu erklären. Fällt die Uhr
des Pi **während** des Scans weg (der Strom reißt ab, die Stempel laufen aus dem Fenster), hört die Fahrt vor dem nächsten Streifen auf, ohne
zu fahren; der Rest wird mit Halt gescannt, und die Fahrt gilt deswegen nicht als „auf diesem Tisch ungeeignet“.

Was gelernt wird (die Verzögerung der Bilder), gehört zur Uhr, auf der es gelernt wurde: ein Scan auf einer anderen Uhr als der davor misst neu (ein
kurzer, langsamer Probelauf, wie bei einem Kamerawechsel). Auf der Uhr des Pi ist die Verzögerung klein und kann **negativ** sein: die Meldung
wird gestempelt, wenn der Pi sie *bekommt*, ein wenig nach dem Messen in FluidNC, das Bild bei der Aufnahme.

Gebaut ist das so: `lib/mjpeg.ts` zerlegt den endlosen Strom (`multipart/x-mixed-replace`) in Bilder mit ihren Köpfen, `lib/frameStamp.ts`
wählt aus den Köpfen den Zeitstempel und prüft ihn gegen den der Positionsmeldung (`domainFits`), `store/stampedFrames.ts` sammelt die Bilder,
`lib/scanClock.ts` entscheidet die Uhr und wählt die Bilder eines Streifens, `store/photomap.ts` fährt. **Während der Fahrt werden nur Bytes
und Stempel kopiert** – in einen Ring mit festen Grenzen (höchstens 300 Bilder und 64 MB; der Scan setzt den Abstand der Bilder auf den, den der Löser
braucht – etwa alle 30 % des Sichtfelds –, und nimmt nur Bilder, die zwischen dem ersten und dem letzten „Jog“-Bericht aufgenommen wurden und mindestens 3 mm vom
Start liegen); dasselbe Bild zweimal wird nur einmal behalten. Dekodiert wird erst nach der Fahrt, ein Bild nach dem anderen, mit Luft für
Bedienung und PAUSE dazwischen. Auf der Uhr des Pi fragt die App den Status während des Streifens alle 100 ms ab (zusätzlich zur Abfrage alle
200 ms), nur während der Fahrt; danach ist es wieder wie vorher. Alles Weitere – Anker im Stillstand, Einpassen der Bilder an ihrer Überlappung,
Aufgeben, Nachholen mit Halt – ist unverändert.

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
  `grab_ts` ist. Darum prüft der Scan zur Laufzeit, ob der Stempel eines Bildes höchstens 3 s neben dem der letzten Positionsmeldung in
  derselben Uhr liegt (`domainFits`); wenn nicht, ist es nicht dieselbe Uhr, und der Scan nimmt die Uhr des Browsers und sagt es im Panel
  („die Stempel der Bilder liegen in einer anderen Uhr“).
- ustreamer schickt dasselbe Bild **noch einmal**, wenn länger als eine Sekunde kein neues kam – mit derselben Grab-Zeit, aber neuem `X-Timestamp`.
  Darum erkennt die App eine Wiederholung an der Grab-Zeit, und bei der Sendezeit an den Bytes.
- `advance_headers=1` (schickt keine `Content-Length` und keine `X-UStreamer-*`-Zeilen, und der `X-Timestamp` ist der des _nächsten_ Bildes) fordert die App nie an.
- Welche ustreamer-Version auf deinem Pi läuft, weiß die App nicht; sie nimmt, was da ist. Und ob ein Safari auf dem iPad den Stream
  stückweise lesen lässt (`fetch` mit Datenstrom), ist hier nicht geprüft – wenn nicht, meldet der Baustein „nicht verfügbar“ mit einem Grund (`no-body-stream`, `unreachable` …); die Fahrt geht
  dann wie bisher mit der Uhr des Browsers, und das Panel sagt es („der Stream lässt sich nicht mit Zeitstempeln lesen“, mit dem Fehlercode).

**Zwei Befehle auf dem Pi** (per SSH), die sagen, was deine Kamera wirklich schickt:

```bash
curl -s 'http://127.0.0.1:8081/stream?extra_headers=1' | head -c 3000 | strings
curl -sD- -o /dev/null http://127.0.0.1:8081/snapshot
```

Worauf du achtest:

- Beim ersten Befehl: Zeilen `X-Timestamp: 17…` (eine Zahl um 1,7 Milliarden: Echtzeit) und `X-UStreamer-Grab-Time:` oder `X-UStreamer-Grab-Begin-Time:`
  (eine **kleine** Zahl, etwa `123456.789000`: Sekunden seit dem Start des Pi, also CLOCK_MONOTONIC). Fehlen alle `X-UStreamer-…`-Zeilen,
  kennt dein ustreamer `extra_headers` nicht, und es bleibt die Sendezeit. Steht bei der Grab-Zeit eine Zahl um 1,7 Milliarden, stempelt
  der Treiber mit der Echtzeituhr (das erkennt `domainFits`; der Scan nimmt dann die Uhr des Browsers); steht dort `0.000000`, gibt der
  Treiber keine Zeit an.
- Zum Vergleich der Uhren: `python3 -c "import time; print(time.monotonic())"` auf dem Pi. Die Grab-Zeit muss in derselben Größenordnung liegen und
  um höchstens wenige Sekunden von dieser Zahl abweichen; steht dort etwas ganz anderes, ist es nicht dieselbe Uhr.
- Beim zweiten Befehl (die Köpfe eines Einzelbilds): Heißen die Zeilen `X-UStreamer-Grab-Begin-Timestamp` und `…Grab-End-Timestamp`, ist es der
  Master-Zweig; heißt eine `X-UStreamer-Grab-Timestamp`, ist es v4.13 bis v6.20. `X-UStreamer-Send-Timestamp` ist die Zeit von ustreamer
  selbst (CLOCK_MONOTONIC) beim Senden – auch sie mit `time.monotonic()` vergleichen. `ustreamer --version` nennt die Version.

## Was der Simulator über die Uhr des Pi gemessen hat – und was nicht

Die Zahlen unten stammen aus `e2e/strips.spec.ts` auf dem Simulator (Demo, Referenztafel), nicht von einer echten Maschine. Der Simulator hat einen
nachgemachten Pi: seine Uhr geht **zwei Stunden** vor der der Seite (damit jede Vermischung der beiden Uhren laut scheitert), jede Meldung der
Steuerung kommt auf einem Weg an, der spät und ungleichmäßig ist, der Pi stempelt jede Meldung 12 ms nach dem Messen (± 4 ms) und jedes Kamerabild auf
die Millisekunde (± 2 ms), und die Kamera zeigt der Seite ihr Bild 0,3 s ± 40 ms zu spät – was **nicht** im Stempel steckt. Die Zahlen sind also nur so
gut wie diese Annahmen: das Schwanken, das der Stempel wegnimmt, ist genau das, das der Simulator auf dem Weg zur Seite hineingelegt hat; was er
im Stempel lässt, haben wir selbst festgelegt.

**Der Vergleich**, Tempo „Normal“ (40 mm/s), Weg vom Pi zur Seite 60–180 ms ungleichmäßig, Kamera 0,3 s ± 40 ms, dieselbe Fläche, einmal auf der Uhr des
Browsers (der Pi stempelt nichts) und einmal auf der des Pi. „Zeitrauschen“ ist die Streuung dessen, was die einzelnen Bilder der Fahrt für die
Verzögerung ergeben (`ScanStats.timingNoiseMs`: nach dem Einpassen gegen die Uhr gemessen), also das, was keine gelernte Konstante wegnimmt. Sechs Läufe
(drei Wiederholungen von `--repeat-each=3` und drei Läufe der ganzen Datei, auf einem Rechner, auf dem zeitweise noch ein anderer Testlauf rechnete):

| Lauf | Zeitrauschen Browser-Uhr | Zeitrauschen Pi-Uhr | Verzögerung Pi-Uhr |
| --- | --- | --- | --- |
| 1 | 24,1 ms | 1,5 ms | −12 ms |
| 2 | 28,2 ms | 2,3 ms | −12 ms |
| 3 | 15,4 ms | 1,8 ms | −12 ms |
| 4 | 18,1 ms | 1,7 ms | −12 ms |
| 5 | 18,3 ms | 1,5 ms | −12 ms |
| 6 | 19,9 ms | 1,9 ms | −12 ms |

- Die **Uhr ist messbar enger**: 15–28 ms gegen 1,5–2,3 ms, also ein Achtel bis ein Fünfzehntel (der Test verlangt weniger als 0,4).
- **Die fertige Karte ist nicht enger.** In allen sechs Läufen lagen beide Karten gleich nah an der Karte eines Scans mit Halt (Punkte der Tafel: im Mittel
  0,02–0,03 mm daneben, schlimmstenfalls 0,08 mm; alle Bilder der Fahrt eingepasst). Die Bilder werden an ihrer Überlappung eingepasst; die Uhr gibt nur den
  Startwert und das Suchfenster. Solange der Fehler der Uhr (hier ± 2 mm bei 40 mm/s) darin bleibt, ist das Ergebnis dasselbe.
- Wo die Uhr zählt, ist **ein Weg, der so ungleichmäßig ist, dass das Suchfenster nicht mehr reicht**: Tempo „Schnell“ (56 mm/s), Weg 100–500 ms. Browser-Uhr: Zeitrauschen
  86 bzw. 96 ms, 14 von 17 Bildern eingepasst, Punkte bis 0,16 mm daneben; Pi-Uhr: 2 ms, alle Bilder eingepasst, Punkte bis 0,08 mm daneben. (Zwei Läufe.)
- Die **Verzögerung** auf der Uhr des Pi ist klein und **negativ** (−12 ms – genau die 12 ms, die der Simulator dem Stempel der Meldung zugibt), auf der Uhr des
  Browsers etwa 0,2–0,35 s. Deshalb darf sie auf der Uhr des Pi unter null gelernt werden (`PI_LAG_LIMITS`).
- Die Auswertung (`scripts/analyze-scan.py`) einer aufgezeichneten Fahrt auf der Uhr des Pi sagt dasselbe aus der Datei: Verzögerung Browser-Uhr 200 ms (Zeitrauschen 25 ms),
  Pi-Uhr −12 ms (2 ms); die Seite sah die Meldungen 34 ms (Streuung) ungleichmäßig gegenüber ihrem Stempel, die Kamerabilder 14 ms.

**Was damit nicht gezeigt ist.** Das Versprechen, die Uhr des Pi bringe die Bilder auf „wenige Millisekunden“ genau, ist nicht gemessen und wird hier nicht
gemacht: gemessen ist nur, dass der Weg zur Seite, die Verzögerung der Kamera in der Seite und das Raster des Bildschirms (16 ms = 0,8 mm bei 50 mm/s) aus der
Zeit herausfallen – im Simulator, mit angenommenen Zahlen. Auf einer echten Maschine bleibt stehen, **was im Stempel selbst steckt**:

- das Schwanken des Wegs **von der Steuerung (Jackpot) zum Pi** (WLAN) – die Meldung wird gestempelt, wenn der Pi sie bekommt;
- FluidNCs eigenes Abtasten und die Zeit, bis die Meldung losgeschickt wird (nicht bekannt);
- was der Zeitstempel des V4L2-Puffers bei deinem Kameratreiber bedeutet (Anfang oder Ende der Belichtung, Auslesen, welche Uhr);
- die Auflösung der Stempel von ustreamer, 1 ms;
- ob ein Safari auf dem iPad den Stream stückweise lesen lässt (`fetch` mit Datenstrom) – hier nicht prüfbar; wenn nicht, geht der Scan auf der Uhr des Browsers und sagt es;
- die gleichbleibende Verzögerung der Kamera selbst (wird gelernt, im Probelauf);
- welche Version von ustreamer auf deinem Pi läuft (die zwei Befehle oben sagen es);
- eine Kamera, die nur einen Zuschauer bedient (ESP32-CAM): die zweite Verbindung kommt nicht zustande, der Scan nimmt die Uhr des Browsers.

**So misst du es an der Maschine:** den Scan aufzeichnen („Scan für die Auswertung aufzeichnen“), erst **mit Halt** und dann **in Fahrt** über dieselbe Fläche, die Datei speichern und
`python3 scripts/analyze-scan.py datei.zip` aufrufen. Steht im Panel „Pi“ als Uhr des letzten Scans, nennt die Auswertung Verzögerung und Zeitrauschen **beider** Uhren aus
denselben eingepassten Bildern und sagt, welche weniger streut – das ist die Zahl, die für deine Kamera gilt. Steht dort „Browser“, steht im Panel auch der Grund.

**Nicht gebaut:** ein Abgleich des Pi mit sich selbst (`clockCheck` in `/api/health`: der Companion vergleicht den Stempel eines Einzelbilds von ustreamer mit seiner eigenen Uhr) – er hätte nur die
Uhr von ustreamer, nicht die des Kameratreibers geprüft; die Prüfung zur Laufzeit gegen die Meldungen (`window`) tut das, worauf es ankommt.
