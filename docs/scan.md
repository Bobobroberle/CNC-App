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
