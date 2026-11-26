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

## Mit Halt: warten, bis Maschine und Bild ruhig sind

Beim Scan **mit Halt** wartete die App nach jedem Halt eine feste Zeit: die Beruhigungszeit (Voreinstellung 600 ms, unter Service → Kalibrieren)
und 250 ms für die Verzögerung des Bildes. Jetzt nimmt sie das Bild, **sobald die Maschine ruht und das Bild ruhig ist** – aber nur, wo die Bilder
selbst belegen, dass sie frisch sind. Wo nicht, bleibt es bei der festen Zeit, genau wie bisher. Die Uhr spielt dabei keine Rolle: nichts hier hängt davon ab,
wie spät die Kamera ist, nur davon, was das Bild zeigt.

**Was „belegt“ heißt – alles zusammen, sonst die feste Zeit:**

1. **Neue Bilder.** Die App sieht alle 25 ms in das Kamerabild (fünf Ausschnitte von 48 × 48 Pixeln in der Auflösung der Kamera, in Blöcken von 4 × 4 gemittelt –
   `lib/calm.ts`). Nur ein Bild zählt, das sich vom vorigen überhaupt unterscheidet: Ein Sensor rauscht, ein noch einmal gezeigtes oder
   stehengebliebenes Bild ist gleich. Eine Kamera **ohne Rauschen** (der Simulator, wie er bisher war) lässt sich von einem stehengebliebenen Strom nicht unterscheiden – dort gibt es keinen Beleg.
2. **Die Fahrt war im Bild zu sehen.** Ein Bild, das sich nie geändert hat, sagt nicht, ob es aktuell ist (ein Tisch ohne Struktur, eine Kamera, die steht).
3. **Das Bild ist ruhig.** In den letzten 150 ms (bei einer langsamen Kamera vier Bildabstände) liegen mindestens drei neue Bilder, die sich vom neuesten nur um das
   Rauschen unterscheiden, und das neueste ist frisch (nicht älter als 100 ms oder 2,5 Bildabstände). Ein Strom, der steht, liefert keine neuen Bilder; das
   Fenster wird dann nie voll.
4. **Nicht vor der gelernten Zeit.** Die ersten drei Punkte eines Scans laufen mit der festen Zeit und werden dabei beobachtet: Wie lange nach der Ruhemeldung der Maschine
   hat sich das Bild noch verändert, bis es das endgültige war? Für die folgenden Punkte gilt ein hohes Quantil (0,9) dieser Zeiten plus 100 ms (oder drei Bildabstände) als Mindestwartezeit; jeder weitere Punkt lernt mit,
   eine Kamera, die langsamer wird, verlängert sie also.
5. **Die Maschine ruht:** zwei Statusmeldungen hintereinander „Idle“, auf 0,02 mm gleich – dasselbe wie `settled()`, nur über zwei Meldungen. Wie lange die Maschine
   nachschwingt, sagt keine Meldung; das sagt nur das Bild – dafür ist das ruhige Fenster da, an Stelle der Beruhigungszeit.

Steht das Bild bei der festen Zeit noch in Bewegung – oder steht es nach der Bewegung still, obwohl die Kamera schon Rauschen gezeigt hat (ein Strom, der aussetzt) –,
**wartet die App**: höchstens 1,5 s je Punkt über die feste Zeit hinaus. Eine Kamera, die einfach später ist als die feste Zeit, wird auf jedem Punkt abgewartet und kostet das
Guthaben nicht; was bei einem Bild, das nie ruhig wird, über die feste Zeit hinaus gewartet wird (`ScanStats.rest.unsure`), zählt zusammen höchstens 15 s je Scan. Enden zwei Punkte
hintereinander so, vergisst die App, was sie gelernt hat, und lernt neu (feste Zeit). Ein Bild, das auch dann noch nicht ruhig ist, wird – wie bisher – trotzdem genommen und liegt auf der Karte;
**am Ende des Scans meldet die App es einmal** (Warnung: „n von m Bildern wurden aufgenommen, während sich das Kamerabild noch veränderte“), damit es nicht unbemerkt bleibt. Nicht aufgelegt und neu aufgenommen wird es nicht
(Merkliste `tim-i`). Ein **Abbruch** oder eine abgerissene Verbindung mitten in der Wartezeit legt kein Bild auf – das Bild von vor dem Ende der Wartezeit wäre keines, für das die Wartezeit bürgt.

Das Rauschen wird aus den letzten zwölf neuen Bildern bestimmt (dem mittleren Abstand zweier aufeinanderfolgender Bilder); ein Flackern des Lichts, das jedes fünfte Bild heller macht,
verfälscht es nicht, und ein Bild, dessen Abstände sich nicht so beschreiben lassen (`noiseOf` sagt null), wird nicht für ruhig erklärt: die Kamera wird nicht gelernt, jeder Punkt
wartet die feste Zeit und – solange das Guthaben reicht – bis zu 1,5 s mehr (Test mit einem Flackern in `test/restWait.test.ts`: kein Bild vorzeitig, höchstens 15 s mehr im Scan). Bei einem häufigeren
Flackern (etwa jedes dritte Bild) ist der mittlere Abstand selbst groß; die Schwelle wäre dann grob und ein Kriechen unter ihr bliebe unbemerkt – aus der Bauart gefolgert, nicht getestet.

**Unverändert, mit fester Zeit:** die Serie auf Rohlingen (`precise`: dort kommt es auf die Lage jedes Bildes an; sie ist neben dem Panel der einzige Aufrufer des Scans, die Vorrichtungen scannen nicht), die Ankerbilder der Fahrt in Streifen
(`restPicture`), Bilder eines `<video>`-Elements (dort wartet die App auf das nächste Bild der Kamera), ein Bild, das sich nicht lesen lässt, und ein Tisch ohne Struktur. Es gibt
keine neue Einstellung; die Beruhigungszeit bleibt die feste Zeit der ersten Punkte und der Fälle ohne Beleg.

**Die Zeitschätzung** über dem Scan rechnet nach einem Scan mit der Pause, die er angewendet hat (die ersten drei Bilder mit der festen Zeit, die übrigen mit dem Mittel der Bilder, die der letzte Scan nach dem Lernen genommen hat);
vor dem ersten Scan und nach einem Kamerawechsel rechnet sie mit der festen Zeit. Das ist eine Schätzung: wo das Lernen lange dauert (auf dem Tisch unten erst nach 25 Bildern), stimmt sie nur ungefähr – dort versprach sie 176 s für einen Scan, der 170 s dauerte, und die Fehler heben sich zum Teil auf.

**Der Test, der das entscheidet** (`e2e/restwait.spec.ts`, Simulator): Die Kamera zeigt den Tisch 0, 0,15, 0,4 und 0,8 s zu spät (plus 40 ms Schwanken) und rauscht (`lowriderCameraLag`:
`ms`, `jitterMs`, `noise`); jedes Bild wird in dem Augenblick, in dem die App es liest, mit dem verglichen, was der Simulator wirklich unter der Spindel hat (`shown` gegen
`physical()`): keines darf mehr als 0,02 mm daneben liegen. Dazu: eine Verzögerung, die in dem Moment auf 1 s springt, in dem die Maschine hält, nachdem sie bei 0,15 s gelernt wurde;
eine Kamera, die bei jedem Halt 0,4 s lang nichts Neues liefert (`frozen`); ein Tisch ohne Struktur (`flat`); eine Kamera, die von Anfang an nichts liefert; eine Kamera ohne Rauschen. Die
Simulator-Kamera kann dabei nur **Stillstände** zeigen: ein Sprung der Verzögerung hält die Bilder an (das Bild eines Zeitpunkts wird nie früher als das davor), sie liefert nie ein stehendes Bild von vor der Fahrt mit frischem Rauschen. Die Wächter, die das
verhindern sollen (die Fahrt im Bild gesehen, die Maschine ruht nach zwei Meldungen auf 0,02 mm, nicht vor der gelernten Zeit), prüfen deshalb die Einzeltests in `test/restWait.test.ts` an einem Modell mit stehendem Vorbild, langsamen und
schwingenden Meldungen; jeder wurde einmal herausgenommen, und ein Test schlug fehl. **Eine naive Wartezeit** (350 ms nach der Ruhemeldung bei 0,4 s Verzögerung) **und ein „ruhig“ nach der Uhr ohne neue Bilder** nehmen am selben Modell ein Bild von vor
dem Halt (`shows what the shortcuts it does not take would have done`). Die Millimeter, die hier früher standen (0,925 mm bei 350 ms; 5,7 und 7,2 mm bei der springenden Verzögerung und beim Aussetzen), stammen aus einem einmaligen Versuch am Simulator,
der nicht aufbewahrt ist – kein Test im Baum wiederholt sie.

**Gemessen im Simulator** (Projekt „desktop“, neben einem anderen Testlauf; Fläche 240 × 100 mm, acht Bilder; die Pause ist die Zeit von der letzten Bewegung der Maschine bis zum Lesen des Bildes, Mittel über alle acht Bilder – die ersten drei haben die feste Zeit; alles Rauschen 2 Graustufen):

| Verzögerung der Kamera | feste Zeit | mit Wartezeit | davon ab dem vierten Bild | Bilder: adaptiv / fest / unsicher / verlängert | schlechtestes Bild |
| --- | --- | --- | --- | --- | --- |
| 0 s | 1041 ms (19,9 s) | 547 ms (15,9 s) | 203 ms | 5 / 3 / 0 / 0 | 0,000 mm |
| 0,15 s | 1018 ms (19,8 s) | 620 ms (16,6 s) | 239 ms | 5 / 3 / 0 / 0 | 0,000 mm |
| 0,4 s | 1021 ms (19,7 s) | 786 ms (17,9 s) | 503 ms | 5 / 3 / 0 / 0 | 0,000 mm |
| 0,8 s | 1002 ms (19,6 s) | 1112 ms (20,4 s) | 937 ms | 0 / 8 / 0 / 7 | 0,000 mm |

Ein Lauf; ein zweiter, später, auf dem endgültigen Stand: mit Wartezeit 572 / 625 / 784 / 1097 ms, ab dem vierten Bild 217 / 254 / 531 / 880 ms, bei 0,8 s 4 Bilder verlängert – die Zahlen streuen von Lauf zu Lauf um einige Prozent.

**Gemessen auf der ganzen Tischfläche** (derselbe Simulator, Fläche 725 × 290 mm = 66 Bilder, jedes Mal von derselben Ecke aus gestartet; `MEASURE_REST=1 pnpm exec playwright test e2e/restwait -g measuring`, 19 Minuten, neben einem anderen Testlauf; die feste Zeit nur bei 0 und 0,8 s, weil ihre Pause von der Verzögerung nicht abhängt – 1002 bis 1041 ms in allen Läufen oben):

| Verzögerung der Kamera | Scan mit fester Zeit | Scan mit Wartezeit | Pause je Bild (fest → adaptiv) | Bilder: adaptiv / fest / unsicher / verlängert | schlechtestes Bild (fest / adaptiv) |
| --- | --- | --- | --- | --- | --- |
| 0 s | 203,8 s | 170,1 s (−17 %) | 1003 → 624 ms | 33 / 33 / 0 / 0 | 0,000 / 0,000 mm |
| 0,15 s | – | 175,4 s | – → 706 ms | 33 / 33 / 0 / 0 | – / 0,000 mm |
| 0,4 s | – | 183,3 s | – → 823 ms | 34 / 32 / 0 / 0 | – / 0,000 mm |
| 0,8 s | 194,8 s | 197,3 s (+1 %) | 987 → 1032 ms | 0 / 66 / 0 / 25 | **1,766** / 0,000 mm |

Der Gewinn ist kleiner als die Pause je Bild vermuten lässt, weil **nur dort Beleg da ist, wo er sich bilden lässt**: Bei 0 s Verzögerung (ein eigener Lauf mit Protokoll jedes Bildes, `ScanStats.rest.points`)
blieben die ersten **25 Bilder** bei der festen Zeit (854–880 ms nach der Ruhemeldung), erst beim 26. war die Kamera gelernt. Danach kamen 33 von 41 Bildern nach
183–234 ms und 8 nach der festen Zeit. **Warum** das so ist, ist nicht gemessen: protokolliert sind nur Art und Zeit je Bild, nicht, ob die Fahrt im Bild gesehen wurde. Wahrscheinlich liegen die ersten Reihen dieses Scans über blanker Spanplatte (zu wenig Struktur für den Beleg „die Fahrt war im Bild zu sehen“, der eine Änderung von mehr als dem Achtfachen der Schwelle verlangt), die späteren acht an Stellen mit wenig Struktur. Die Schätzung über dem Scan zeigte vor dem Scan 209 s (feste Zeit, noch nichts gelernt) und danach 176 s; der nächste Scan dauerte 170 s.
**Bei 0,8 s liegt die feste Zeit zu knapp:** im Scan der ganzen Fläche lag ein Bild mit fester Zeit **1,766 mm** neben dem, was der Simulator wirklich unter der Spindel hatte (in den acht Bildern oben nie) – das ist das Verhalten vor dieser Änderung. Mit Wartezeit
wurde bei 25 Bildern über die feste Zeit hinaus gewartet, und kein Bild lag daneben; das kostet 1 % Zeit.

**Die Grenzen der Tests.** Sie decken Verzögerungen von 0 bis 1 s ab (die springende bis 1 s, im Test für die Wartezeit bis 1,5 s). Eine Kamera, die um mehr als die **Dauer der Fahrt plus die feste Zeit** zu spät ist (die Fahrt zum Punkt dauert je nach Weg und Tempo verschieden lang; die 1,5 s Wartezeit spielen dabei keine Rolle: sie gelten nur für ein Bild, das sich
ändert), zeigt bei der festen Zeit noch den vorigen Halt: ruhig und mit neuen Bildern, die Fahrt ist im Bild noch nicht zu sehen – dann gibt es keinen Beleg (zweite Bedingung), und das Bild wird wie bisher bei der festen Zeit genommen, ohne als
unsicher gezählt zu werden. **Dieses Bild kann von vor dem Halt sein** (`test/restWait.test.ts`, „takes no shortcut on a picture that shows nothing of the move“ legt es fest). Die App hat die Fahrt auf früheren Punkten gesehen und könnte hier
mehr erwarten, aber sie kann ein stehendes Bild von vor der Fahrt nicht von einer blanken Stelle des Tisches unterscheiden, die nie etwas zeigt (Merkliste `tim-j`: nur mit einem Maß für die Struktur im Bild, das an der echten Kamera zu messen wäre). Das ist das
Verhalten vor dieser Änderung, nicht besser.

**Was das nicht zeigt.** Der Gewinn ergibt sich aus der Bauweise des Simulators: seine Kamera ist genau so spät, wie der Test sie einstellt, sein Rauschen ist gleichmäßig (2 Graustufen je Pixel,
für jedes Bild neu), die Maschine schwingt nicht nach, und die Beruhigungszeit von 600 ms wurde dort nie gebraucht. Bei 0,8 s Verzögerung – nahe an der festen Zeit – gibt es keinen Gewinn, und die Pause ist 11 % länger, weil
das Bild bei der festen Zeit noch ein wenig in Bewegung war und abgewartet wurde (7 von 8 Punkten). **Unbekannt bleibt an einer echten Kamera:** wie stark sie rauscht und ob ihr Rauschen
von Bild zu Bild wirklich neu ist (Kompression, Belichtungsregelung und Flackern des Lichts machen aus Rauschen etwas anderes); ob ein Bild, das ein Stück weit verrutscht ist, die Schwelle (1,5-faches Rauschen plus 0,05 Graustufen) überschreitet – die
Empfindlichkeit für ein langsames Kriechen unter etwa 0,1 mm ist nur im Simulator gesehen, nicht an einer Maschine; ob eine Maschine nachschwingt und in welchem Takt (das ruhige Fenster von 150 ms sieht Schwingungen unter etwa 7 Hz nicht
sicher); wie sich der Strom bei Aussetzern verhält (das Bild bleibt stehen oder kommt als Stoß nach). Wo eine dieser Annahmen nicht stimmt, kostet das Zeit (das Bild ist nie ruhig: die feste Zeit plus höchstens 1,5 s) oder – im
ungünstigen Fall, den der Test nicht kennt – ein Bild von kurz vor dem Halt. Einen Schalter dafür gibt es nicht (keine neue Einstellung); die Serie scannt weiter mit der festen Zeit. Auch ein **aufgezeichneter** Scan mit Halt (die Vergleichsfahrt für den Auswerter) nimmt die Wartezeit mit Beleg – wer dafür Bilder streng nach der festen Zeit will, hat dazu keinen Schalter.

## Belichtung eintragen: wie schnell ein Bild unscharf wird

Bei „In Fahrt“ steht unter dem Tempo das Feld **Belichtung (ms)**. Trag dort ein, **wie lange deine Kamera ein Bild belichtet – wenn du es
weißt** (aus dem Datenblatt der Kamera oder den Einstellungen ihres Treibers oder Kamera-Servers). Die App rechnet daraus das schnellste
Tempo, bei dem ein Bild nicht mehr als **0,3 mm** verwischt:

> v ≤ 0,3 mm ÷ Belichtungszeit  (20 ms → 15 mm/s, 55 ms → 5,45 mm/s)

und fährt nie schneller, auch wenn „Normal“ oder „Schnell“ mehr wollten. Darunter steht, wie unscharf ein Bild bei dem Tempo wird („Unschärfe
bei diesem Tempo etwa 0,30 mm“), und wo die Belichtung das Tempo begrenzt, steht auch das.

- **0 heißt „unbekannt“** und ist die Voreinstellung: dann gibt es keine Begrenzung – so lief es, bevor man die Belichtung eintragen konnte. Eine negative
  Zahl wird zu 0; mehr als 1000 ms werden auf 1000 ms gekappt.
- Die Zahl wird **nur auf diesem Gerät** gemerkt (zusammen mit Art und Tempo des Scans) und nicht zum Pi und nicht zu anderen Geräten übertragen: jedes
  Gerät, mit dem du scannst, hat sein eigenes Feld, die Kamera aber nur eine Belichtung.
- Käme das Tempo **unter 5 mm/s** (bei mehr als etwa 60 ms Belichtung), lohnt die Fahrt nicht mehr: langsamer lässt sich die Verzögerung der Kamera
  nicht messen, und mit Halt geht es dann schneller. Der Scan läuft dann **mit Halt für jedes Bild**; das Panel sagt es in der Zeile unter dem Feld, die
  Zeitschätzung oben zeigt die Zeit mit Halt (nicht „N Streifen“, die nicht gefahren würden), und im Protokoll steht „Bei dieser Belichtung wäre die
  Fahrt langsamer als 5 mm/s …“.
- Weiß man die Belichtung nicht, bleibt das Feld bei 0. Die Aufzeichnung (übernächster Abschnitt) zeigt in der Auswertung die Schärfe der Bilder je Tempo
  (`Sharpness by speed`) – sie hängt vom Tisch ab und ist ein Hinweis, kein Messwert der Belichtung.

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
von den Bildern im Stillstand abweichen. Lief ein Scan auf der **Uhr des Pi**, enthält die Datei zu jeder Meldung **zwei Zeiten**, die der Seite und
den Stempel des Relais, und zu jedem Bild ebenso zwei: die Seite hat auf dieser Uhr nicht auf den Bildschirm geschaut, ihre Zeit für ein Bild ist
also, **wann sie das Stück des Stroms las, das es abschloss** (die Ankunft der Bytes; ohne `Content-Length` im Kopf erst mit der nächsten Trennzeile) – nicht, wann der Bildschirm es zuerst zeigte, was ein Scan auf der
Uhr des Browsers dafür nimmt –, und für eine Meldung, wann sie bei ihr ankam. Die Auswertung rechnet Verzögerung und Zeitrauschen einmal aus diesen
**Ankunftszeiten der Seite** und einmal aus den **Stempeln des Pi**, aus denselben eingepassten Bildern, und sagt, welche von beiden weniger streut. Die
Zeile vergleicht also **Ankunft von Bytes mit Stempeln** – nicht die Uhr eines ganzen Scans im Browser: deren Bildzeiten kämen vom Bildschirm (Raster, Dekodieren),
und das steckt in der Zahl nicht. Dazu nennt sie, wie ungleichmäßig die Seite Meldungen und Bilder gegenüber ihren Stempeln bekam (die Streuung der
Differenz – das Schwanken auf dem Weg zur Seite, das im Stempel nicht steckt). Dateien ohne Stempel (ältere, oder ein Scan auf der Uhr des Browsers) wertet sie
wie bisher aus; dort sind die Bildzeiten die des Bildschirms, und die Zeilen heißen „browser clock“.
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
letzten Scans in Fahrt“, im Protokoll und in der Aufzeichnung). Im Panel steht der Grund **in Worten** – beim Stream auch die Ursache, z. B. „dieser Browser liest einen
Datenstrom nicht stückweise“ –, der Code (`stream`, der Fehlercode) nur klein dahinter; die Kopfzeile, aus der die Stempel kommen, heißt „Aufnahmezeit des Kameratreibers“
o. ä., mit dem Namen der Kopfzeile klein dahinter. Fällt die Uhr erst mitten im Scan weg, sind es andere Sätze als vor dem Start („die Meldungen kommen nicht
mehr mit dem Zeitstempel des Pi“, nicht „nicht über den Pi verbunden“):

| Grund | heißt |
| --- | --- |
| *die Meldungen kommen ohne Zeitstempel des Pi* | die Steuerung ist nicht über den Pi verbunden, oder der Companion ist älter und stempelt nicht (`relay`) |
| *die Kamera ist kein Stream des Pi* | Gerätekamera, oder keine Stream-Adresse eingestellt (`device`) |
| *der Stream lässt sich nicht mit Zeitstempeln lesen* | der Server antwortet nicht, lässt die Seite nicht lesen (CORS), liefert nichts oder nichts mit Stempel, dieser Browser liest keinen Datenstrom, oder er kann aus den Bildern keine Pixel machen (`stream`, dahinter der Fehlercode, bei Letzterem `no-decode` – das Panel sagt dann „die Bilder … lassen sich in diesem Browser nicht in Pixel verwandeln“) |
| *die Stempel der Bilder liegen in einer anderen Uhr* | der Stempel des Bildes liegt mehr als 3 s neben dem der letzten Meldung in derselben Uhr, z. B. weil der Kameratreiber mit einer anderen Uhr stempelt (`window`) |

Wo gar kein Pi zur Verbindung gehört (Steuerung direkt, kein Companion eingestellt), steht kein Grund da: es gibt nichts zu erklären. Fällt die Uhr
des Pi **während** des Scans weg (der Strom reißt ab, die Stempel laufen aus dem Fenster), hört die Fahrt vor dem nächsten Streifen auf, ohne
zu fahren; der Rest wird mit Halt gescannt, und die Fahrt gilt deswegen nicht als „auf diesem Tisch ungeeignet“. Das gilt auch für den ersten,
langsamen Probelauf: reißt der Strom in ihm ab oder verlieren die Meldungen ihren Stempel, bleibt „Fahrt ungeeignet“ (`stripsBad`) aus, und der ganze
Bereich wird mit Halt gescannt. Ein Bild wird schon bei der Wahl der Uhr einmal in Pixel verwandelt – klappt das nicht, bleibt es bei der Uhr
des Browsers, bevor sich etwas bewegt (sonst bekäme der Probelauf keine Bilder und der Tisch bekäme die Schuld). „Scan abbrechen“ beendet auch das Öffnen
des Streams sofort (eine Kamera, die nur einen Client bedient, lässt es sonst Sekunden warten); danach fährt der Scan nichts mehr.

Was gelernt wird (die Verzögerung der Bilder), gehört zur Uhr, auf der es gelernt wurde: ein Scan auf einer anderen Uhr als der davor misst neu (ein
kurzer, langsamer Probelauf, wie bei einem Kamerawechsel). Auf der Uhr des Pi ist die Verzögerung klein und kann **negativ** sein: die Meldung
wird gestempelt, wenn der Pi sie *bekommt*, ein wenig nach dem Messen in FluidNC, das Bild bei der Aufnahme.

Gebaut ist das so: `lib/mjpeg.ts` zerlegt den endlosen Strom (`multipart/x-mixed-replace`) in Bilder mit ihren Köpfen, `lib/frameStamp.ts`
wählt aus den Köpfen den Zeitstempel und prüft ihn gegen den der Positionsmeldung (`domainFits`), `store/stampedFrames.ts` sammelt die Bilder,
`lib/scanClock.ts` entscheidet die Uhr und wählt die Bilder eines Streifens, `store/photomap.ts` fährt. **Während der Fahrt werden nur Bytes
und Stempel kopiert** – in einen Ring mit festen Grenzen (höchstens 300 Bilder und 64 MB; der Scan setzt den Abstand der Bilder auf den, den der Löser
braucht – etwa alle 30 % des Sichtfelds –, und nimmt nur Bilder, die zwischen dem ersten und dem letzten „Jog“-Bericht aufgenommen wurden und mindestens 3 mm vom
Start liegen); dasselbe Bild zweimal wird nur einmal behalten. Bei diesen Abständen bleibt ein Streifen weit unter dem Ring (400 mm sind etwa
400 ÷ (0,3 × Sichtfeld) Bilder, bei 64 mm Sichtfeld 21). Würde er doch voll – sehr große Bilder, oder ein langes Warten im Stillstand nach der Fahrt –,
gehen die **ältesten** Bilder zuerst, also der Anfang des Streifens: die App gibt den Streifen dann nicht auf und legt ihn nicht anders ab, der Löser
passt die Bilder ein, die da sind (so ist er gebaut: von beiden Ankern aus, hier bleibt der am Ende), und was fehlt, wird mit Halt nachgeholt –
getestet ist das nicht, weil der Fall im Simulator nicht vorkommt. Die Zahl der verdrängten Bilder steht in der
Aufzeichnung (`stamped-pictures`, `evicted`). Dekodiert wird erst nach der Fahrt, ein Bild nach dem anderen, mit Luft für
Bedienung und PAUSE dazwischen. Auf der Uhr des Pi fragt die App den Status während des Streifens alle 100 ms ab (zusätzlich zur Abfrage alle
200 ms), nur während der Fahrt; danach ist es wieder wie vorher. **Der Strom bleibt nur für die Fahrten offen**: zwischen zwei Streifen läuft er weiter
(die nächste Prüfung der Uhr braucht ein frisches Bild), und sobald der letzte Streifen gefahren ist – und wo die Fahrt aufgegeben wird oder die Uhr
wegfällt, sobald klar ist, dass es mit Halt weitergeht – wird er geschlossen, vor dem Auswerten des letzten Streifens, vor dem Nachholen mit Halt, und
bei jedem Ende des Scans (Abbruch, Halt, Alarm, Verbindung weg). Die Bilder, die er geholt hat, bleiben lesbar und werden danach noch dekodiert. Sonst
kopierte er bis zu 20 Bilder in der Sekunde in den Speicher und über das WLAN, während die Maschine nur noch Bilder mit Halt aufnimmt. Alles Weitere –
Anker im Stillstand, Einpassen der Bilder an ihrer Überlappung, Aufgeben, Nachholen mit Halt – ist unverändert.

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
- Geprüft wird bei der Wahl der Uhr **ein** Bild: lässt es sich in Pixel verwandeln? Ein Strom, dessen erstes Bild sich dekodieren lässt und die späteren nicht,
  fällt dabei nicht auf – der Probelauf bekommt dann wenige Bilder und gilt als „Tisch ungeeignet“ (`stripsBad`), wie bei einem Tisch ohne Struktur.
  Ob echte JPEGs von ustreamer in diesem Browser über `createImageBitmap` laufen, ist hier nur am Simulator (`undecodable`) geprüft, nicht mit einem
  echten Browser und Strom.

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
die Millisekunde (± 2 ms), und die Kamera zeigt der Seite ihr Bild 0,30 bis 0,34 s zu spät (300 ms plus 0–40 ms, ungleichmäßig) – was **nicht** im Stempel steckt. Die Zahlen sind also nur so
gut wie diese Annahmen: das Schwanken, das der Stempel wegnimmt, ist genau das, das der Simulator auf dem Weg zur Seite hineingelegt hat; was er
im Stempel lässt, haben wir selbst festgelegt.

**Der Vergleich**, Tempo „Normal“ (40 mm/s), Weg vom Pi zur Seite 60–180 ms ungleichmäßig (im Mittel 120 ms), Kamera 0,30–0,34 s zu spät, dieselbe Fläche, einmal auf
der Uhr des Browsers (der Pi stempelt nichts) und einmal auf der des Pi. „Zeitrauschen“ ist die Streuung dessen, was die einzelnen Bilder der Fahrt für die
Verzögerung ergeben (`ScanStats.timingNoiseMs`: nach dem Einpassen gegen die Uhr gemessen), also das, was keine gelernte Konstante wegnimmt. Die Läufe 1 bis 7 sind
die der ersten Fassung dieser Arbeit (wo das Projekt notiert wurde, steht es dabei), auf einem Rechner, auf dem zeitweise noch ein anderer Testlauf rechnete; die Läufe 8 und 9
sind die nach der Überarbeitung (Projekt „desktop“, ebenfalls neben einem anderen Testlauf; 9 ist der der Endkontrolle). Die Spalte „Pi ÷ Browser“ ist die zweite durch die erste, gerundet:

| Lauf | Zeitrauschen Browser-Uhr | Zeitrauschen Pi-Uhr | Pi ÷ Browser | Verzögerung Pi-Uhr |
| --- | --- | --- | --- | --- |
| 1 (desktop) | 25,5 ms | 1,7 ms | 0,07 | −12 ms |
| 2 (tablet) | 19,7 ms | 1,5 ms | 0,08 | −12 ms |
| 3 | 25,2 ms | 1,9 ms | 0,08 | −12 ms |
| 4 | 11,1 ms | 1,4 ms | 0,13 | −12 ms |
| 5 | 33,1 ms | 1,6 ms | 0,05 | −13 ms |
| 6 (desktop) | 17,6 ms | 1,8 ms | 0,10 | −13 ms |
| 7 (tablet) | 20,4 ms | 2,4 ms | 0,12 | −13 ms |
| 8 (desktop) | 21,6 ms | 1,7 ms | 0,08 | −12 ms |
| 9 (desktop) | 26,1 ms | 1,0 ms | 0,04 | −12 ms |

- Die **Uhr ist messbar enger**: in den neun Läufen 11–33 ms gegen 1,0–2,4 ms. Das Verhältnis liegt zwischen 0,04 (Lauf 9) und 0,13 (Lauf 4): in acht von neun Läufen
  unter einem Achtel (0,125), in Lauf 4 knapp darüber, in allen unter einem Siebtel (0,14). Der Test verlangt nur weniger als 0,4. Bei 40 mm/s sind das für die
  Browser-Uhr 0,4–1,3 mm Streuung, für die Pi-Uhr 0,04–0,10 mm.
- **Die fertige Karte ist bei diesem Weg nicht messbar enger.** Die Bilder werden an ihrer Überlappung eingepasst; die Uhr gibt nur den Startwert und das
  Suchfenster (±(2 + 0,06 · Tempo) mm entlang des Streifens, bei 40 mm/s ±4,4 mm). Solange der Fehler der Uhr darin bleibt – hier die Streuung der Browser-Uhr von 0,4–1,3 mm –,
  ist das Ergebnis dasselbe. Belegt ist das mit den Läufen 8 und 9, den einzigen Zahlen dazu, die hier stehen: beide Karten fanden alle Punkte der Tafel wieder, eingepasst wurden
  jedes Mal 17 von 17 (Browser-Uhr) und 18 von 18 Bildern (Pi-Uhr), nichts musste nachgeholt werden. Gegen die Karte eines Scans mit Halt lagen die Punkte der Browser-Karte im
  Mittel 0,033 mm (Lauf 9: 0,025 mm) daneben, schlimmstenfalls 0,093 mm (0,079 mm), die der Pi-Karte 0,020 (0,020) und 0,051 mm (0,048 mm). Der Unterschied (Lauf 8: 0,013 mm im Mittel, 0,042 mm im
  schlechtesten Punkt; Lauf 9: 0,005 und 0,031 mm) liegt unter dem, was die Einpassung auflöst (etwa 0,1 mm), und ist aus zwei Läufen kein Beleg für eine genauere Pi-Karte. Für die Läufe 1 bis 7 steht in den
  Protokollen von damals, beide Karten lagen gleich nah (im Mittel 0,02–0,04 mm, schlimmstenfalls 0,11 mm); diese Zahlen sind nicht in der Tabelle und nicht
  noch einmal nachgeprüft. Der Test verlangt für beide Uhren: mindestens 90 % der Punkte wiedergefunden, schlimmstenfalls unter 0,5 mm, im Mittel unter 0,2 mm, mindestens
  75 % der Bilder eingepasst – er prüft nicht, dass die Pi-Karte besser wäre.
- Wo die Uhr zählt, ist **ein Weg, der so ungleichmäßig ist, dass das Suchfenster nicht mehr reicht**: Tempo „Schnell“ (56 mm/s), Weg 100–500 ms – 400 ms
  Unterschied sind bei dem Tempo bis zu 22 mm, das Fenster ist ±5,4 mm. Die zwei Läufe dieser Überarbeitung (8, 9): Browser-Uhr 73 und 80 ms Zeitrauschen, 16 von 17 und 15 von 18 Bildern eingepasst, nicht aufgegeben,
  schlechtester Punkt 0,108 und 0,128 mm (im zweiten Lauf wurde einer der Punkte der Tafel nicht wiedergefunden: 99 %); Pi-Uhr 2,2 ms in beiden, jedes Mal 18 von 18 eingepasst, schlechtester Punkt
  0,069 und 0,073 mm. In den früheren Läufen (nach den Protokollen von damals, nicht
  noch einmal nachgeprüft) hatte die Browser-Uhr in drei Läufen 78, 123 und 79 ms Zeitrauschen und gab einmal die Fahrt auf (5 von 12 Bildern eingepasst, der Rest
  mit Halt nachgeholt), die Pi-Uhr 2 ms mit 18 von 18 Bildern; ein vierter früher Lauf („tablet“, vor einer Änderung am Test): die Browser-Uhr gab auf, 136 ms. Das sind
  wenige Läufe; sie zeigen die Richtung – die Browser-Uhr streut hier 73–136 ms, die Pi-Uhr etwa 2 ms –, keine Zahl, auf die man sich stützt.
- Die **Verzögerung** auf der Uhr des Pi ist klein und **negativ**: −12 bis −13 ms in der Tabelle. Das sind die 12 ms, die der Simulator der Meldung zwischen Messen und
  Stempel zugibt (± 4 ms Rauschen), plus höchstens 1 ms. Auf der Uhr des Browsers ist sie keine feste Zahl, sie hängt vom Weg ab: 213 ms bei dem Weg von 60–180 ms
  (Lauf 8, „Normal“; Lauf 9: 211 ms) und 30 ms bei dem Weg von 100–500 ms (der Lauf 8 im Test darüber, „Schnell“; Lauf 9: 0 ms) – die Kamera ist 0,30–0,34 s zu spät, und der Weg der Meldungen (im Mittel
  120 bzw. 300 ms) zieht das ab. Auf der Uhr des Pi steckt weder das eine noch das andere darin. Deshalb darf die Verzögerung auf der Uhr des Pi unter null gelernt
  werden (`PI_LAG_LIMITS`).
- Die Auswertung (`scripts/analyze-scan.py`) einer bei dieser Überarbeitung aufgezeichneten Fahrt auf der Uhr des Pi (Weg 60–180 ms, „Normal“; drei Läufe in der Datei: der Probelauf mit 12 mm/s und zwei Streifen) sagt aus der Datei: Verzögerung aus den
  **Ankunftszeiten der Seite** (eine Meldung, wenn sie ankam; ein Bild, wenn die Seite das Stück des Stroms las, das es abschloss – nicht, wenn der Bildschirm es zeigte)
  188 ms mit Zeitrauschen 28 ms, aus den **Stempeln des Pi** −12 ms mit 2 ms; die Seite bekam die Meldungen 33,6 ms (Streuung) ungleichmäßig gegenüber ihrem
  Stempel, die Bilder 14,2 ms. Die Zeile „welche weniger streut“ vergleicht also Ankunft von Bytes mit Stempeln, nicht die Browser-Uhr eines ganzen Scans: die 21,6 ms
  der Tabelle (Lauf 8) kommen aus einem Scan auf der Browser-Uhr, mit den Bildzeiten des Bildschirms.
- Eine **langsame** Fahrt (Belichtung 55 ms: 5,45 mm/s; ein Bild alle 4,6 s = 0,3 × 84 mm Sichtfeld ÷ 5,45 mm/s – mehr als das Fenster von 3 s zwischen den Stempeln)
  wird auf der Uhr des Pi nicht für eine weggefallene Uhr gehalten (`e2e`: ein Lauf, beide Streifen gefahren). Das Fenster wird mit dem neuesten Bild geprüft; die App
  hält den Abstand der Bilder zwischen den Fahrten kurz, damit das neueste frisch ist.
- **Der Strom wird nach den Fahrten geschlossen** (`e2e`, ein Scan mit zwei Streifen auf der Uhr des Pi): die Seite sah im Test alle 10 ms nach, ob der Strom des simulierten Pi offen ist.
  Er war offen, solange Streifen zu fahren waren (2606 von 2606 Blicken; im zweiten Durchlauf 2594 von 2594), und in den 31 (32) Blicken danach – die Auswertung des letzten Streifens, und ein Nachholen mit Halt, falls es eines gab (ob in diesen Läufen, ist nicht festgehalten) – geschlossen; wo die Uhr
  im ersten Lauf wegfiel und der ganze Bereich mit Halt ging, war er in allen 733 (746) Blicken während der Bilder mit Halt geschlossen.

**Was damit nicht gezeigt ist.** Das Versprechen, die Uhr des Pi bringe die Bilder auf „wenige Millisekunden“ genau, ist nicht gemessen und wird hier nicht
gemacht: gemessen ist nur, dass das Zeitrauschen auf der Uhr des Pi (1,0–2,4 ms) bei einem Weg zur Seite von 60–180 ms und einer Kamera, die 0,30–0,34 s zu spät
zeigt, um das 8- bis 26-Fache unter dem der Browser-Uhr liegt (11–33 ms) – im Simulator, mit angenommenen Zahlen, und weil der Simulator genau diese Anteile in die Zeit
der Seite gelegt und aus dem Stempel herausgehalten hat; das Raster des Bildschirms (16 ms = 0,8 mm bei 50 mm/s) liegt auf der Uhr des Pi nicht mehr in der Zeit
(so ist es gebaut), ist aber nicht einzeln gemessen. Auf einer echten Maschine bleibt stehen, **was im Stempel selbst steckt**:

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
