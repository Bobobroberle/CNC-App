# Maschine mit der Kamera vermessen

_Reiter Service → Kalibrieren_ misst mit der Kamera am Fräskopf und einer Punktetafel:

- **Maßstab X und Y**: Fährt die Maschine 1000 mm, wenn 1000 mm befohlen sind?
- **Rechtwinkligkeit**: Stehen X und Y im rechten Winkel zueinander?
- **Umkehrspiel**: Wie viel Spiel haben die Riemen beim Richtungswechsel?
- **Z-Schiefe**: Steht Z senkrecht zum Tisch?

Maßstab und Rechtwinkligkeit korrigiert die App in `config.yaml` (mit Sicherung). Umkehrspiel und
Z-Schiefe zeigt sie nur an – dagegen helfen Riemen spannen bzw. Mechanik nachstellen.

## So misst die App

Die Kamera ist nur ein Zielfernrohr: Die App fährt jeden Punkt der Tafel genau ins Bildzentrum und
merkt sich, wo die Maschine dabei steht. Verzeichnung des Objektivs und ein ungenauer
Kamera-Maßstab spielen dadurch kaum eine Rolle. Jede Marke wird von derselben Seite angefahren,
damit das Umkehrspiel nicht ins Ergebnis rutscht. Aus allen Punkten rechnet die App Maßstab und
Winkel, unabhängig davon, wie schräg die Tafel liegt.

Genauigkeit der Erkennung: wenige Hundertstel Millimeter – feiner, als die LowRider wiederholt
fährt. **Die Grenze ist die Tafel.**

## Die Tafel

| Tafel                                                          | Maßstab | Winkel                         |
| -------------------------------------------------------------- | ------- | ------------------------------ |
| Glas-Kalibrierplatte mit Punkteraster (±0,01 mm)               | ja      | ja                             |
| Ausdruck [`kalibriertafel.svg`](kalibriertafel.svg) auf Platte | nein    | ja, nach Drehen um 90° (s. u.) |

Ausdruck: in **tatsächlicher Größe** drucken, die 100-mm-Linie nachmessen, plan auf eine steife
Platte (Alu-Verbund, Glas) kleben. Ein Drucker verzieht um einige Zehntel Prozent – für den
Maßstab taugt das nicht, für den Winkel schon: Der Assistent misst die Tafel einmal normal und
einmal um 90° gedreht; dabei hebt sich der Winkelfehler der Tafel selbst heraus.

Dunkle Punkte auf hellem Grund, gleichmäßiges Licht (LED-Ring), Kamera scharf auf die Tafel.

### Die App kennt die Platte

Die Karte hat die Zahlen der Platte als eigene Felder – **Rastermaß** (mm zwischen zwei Punkten),
**Punkte je Seite** und **Punktdurchmesser** (mm). Voreingestellt ist die Tafel dieses Repositorys
([`kalibriertafel.svg`](kalibriertafel.svg)): 19 × 19 Punkte, 10 mm, Ø 3 mm. Eine andere Platte
(zum Beispiel ein 3D-Druck mit Ø 3,2 mm) trägt man dort einmal ein; die Werte bleiben auf der Karte
stehen und liegen – wie die übrigen Einstellungen der Maschine – auch auf dem Pi.

- **Messfeld** ist der Abstand der äußeren Punkte, voreingestellt `(Punkte − 1) × Rastermaß`
  (180 mm). Solange man es nicht von Hand ändert, folgt es der Platte; ein von Hand eingetragener
  Wert (eine nachgemessene Platte) bleibt, wie er ist.
- **Messpunkte** (ein Messfeld gilt als ganzes Vielfaches des Rastermaßes, wenn es höchstens ein Viertel
  Rastermaß daneben liegt – eine geschrumpfte Platte, nachgemessen zu 178,6 mm, ist noch die
  180-mm-Platte): Die Kamera rastet auf den Punkt ein, der der Bildmitte am nächsten liegt. Liegt
  ein Messpunkt zwischen zwei Punkten, kann sie den Nachbarn nehmen – bis zu ein halbes Rastermaß
  Fehler in der Anpassung. Deshalb bietet die Karte nur Anzahlen an, bei denen
  `Messfeld ÷ (n − 1)` ein ganzes Vielfaches des Rastermaßes ist (bei 180 mm: 2, 3, 4 und 7; **5 × 5
  nicht**: 45 mm lägen zwischen den Punkten) **und zwischen zwei Messpunkten höchstens etwa 25
  Rastermaße liegen**: Der zweite Punkt wird aus dem ersten nur verschoben vorhergesagt; steht die
  Tafel um 1° schief, liegt er bei mehr Rastermaßen schon neben dem richtigen Punkt – bei einer feinen
  Platte (2,5 mm Rastermaß auf 200 mm) fallen deshalb 2 × 2 und 3 × 3 weg. Ein gespeicherter Wert
  außerhalb der Liste bleibt
  stehen und wird gemeldet. Ein von Hand geändertes Messfeld wird nur **gewarnt** (kein Vielfaches
  des Rastermaßes, Messpunkte neben den Punkten, Feld größer als die Platte), nie gesperrt.
- **Punktgröße**: „Marke erkannt: Ø d mm“ ist der gesehene Durchmesser (Pixel ÷ Kamera-Maßstab).
  Weicht er um mehr als etwa 10 % vom eingetragenen Punktdurchmesser ab, weist die Karte auf den
  Kamera-Maßstab hin. Das ist ein Hinweis, keine Sperre – gemessen wird trotzdem. (Bei Ø 3,2 mm
  liegt die Toleranz bei ±0,3 mm; ein Ø 3,4-mm-Bild gilt dort noch als passend.)
- **Verfahrweg**: Die Messung startet am **Eckpunkt unten links** (kleinster X- und Y-Wert) und
  fährt das Messfeld nach **+X und +Y**, jeden Punkt von 0,3 mm darunter angefahren. Ist die
  Maschine referenziert und stehen die Soft-Limits an, prüft die Karte das gegen den Verfahrweg
  (an beiden Enden jeder Achse mit Spiel für die schiefe Tafel – bei 1° liegt die ferne Ecke um 1,7 %
  des Feldes daneben, auch quer zur anderen Achse –, für den Abstand des ersten Punkts vom Fadenkreuz
  und für den Maßstabsfehler, den die Messung ja erst bestimmt: mindestens 5 mm, bei großen Feldern
  5 % des größeren Messfeldes, also 9 mm bei 180 mm): reicht er nicht, nennt sie Achse, Seite und
  fehlende Millimeter, und „Raster messen“ lehnt **vor der ersten Fahrt** ab. Ohne Referenz kennt
  die App den Nullpunkt nicht – dann wird nichts geprüft und die Karte sagt das.
- **Präzisionsplatte** ist standardmäßig **aus**: Der Maßstab einer gedruckten Platte wird nicht
  übernommen, nur der Winkel (nach dem Drehen um 90°). Einschalten nur bei einer Platte, deren
  äußere Punkte nachgemessen und als Messfeld eingetragen sind – sonst schriebe die Korrektur den
  Fehler der Platte in `steps_per_mm`. Ein Stand aus der Zeit vor den Plattenfeldern (im Browser
  oder auf dem Pi) steht **einmal** auf „aus“, auch wenn er „an“ hatte; wer eine vermessene Platte
  hat, schaltet sie wieder ein.
- Die Fingertipp-Prüfung des Kamera-Maßstabs („X +10 mm“) sieht auf einem 10-mm-Raster nach der
  Fahrt genau gleich aus – man tippt leicht den Nachbarpunkt. Ein Merkmal nehmen, das es nur einmal
  gibt (Ecke der Platte, Aufkleber, Kratzer). Der Sprungweg bleibt 10 mm.

## Ablauf

1. Kamera einschalten, kalibrieren (_Einstellungen → Kamera_: Maßstab, grob genügt), Kamerabild auf der
   Bühne.
2. Maschine referenzieren. Tafel flach auflegen, möglichst parallel zu X (±1°). Fräser über der
   Tafeloberfläche – gemessen wird in der aktuellen Höhe, Z bewegt sich dabei nicht.
3. _Reiter Service → Kalibrieren_: Art der Tafel, Rastermaß, Punkte je Seite und Punktdurchmesser
   (die mitgelieferte Tafel ist voreingestellt), Messfeld (Abstand der äußeren Punkte; 180 × 180 mm)
   und Anzahl der Punkte (nur die angebotenen) wählen.
4. Kamera mit dem Joystick über den **Eckpunkt unten links** (kleinster X- und Y-Wert) fahren – die
   Anzeige meldet „Marke erkannt“. _Raster messen_ (halten). Die App fährt alle Punkte ab und kehrt zum ersten zurück.
5. Nur mit Ausdruck: Tafel um 90° drehen, Kamera über den neuen Punkt unten links, _Gedrehte Tafel
   messen_.
6. Optional: _Umkehrspiel messen_ (fährt ±0,5 mm um die Marke) und _Z-Schiefe messen_ (fährt Z um
   den eingestellten Weg nach oben und zurück).
7. Korrektur: Abstand der beiden Y-Schienen und die Seite von Y-Motor 1 (Anschluss A am Jackpot)
   angeben, Vorschlag prüfen, _Korrektur schreiben_ (halten).
8. Steuerung neu starten, referenzieren und erneut messen – die Abweichungen sollten jetzt
   innerhalb der Messgenauigkeit liegen.

_Abbrechen_ hält nach der laufenden Fahrt an; NOT-HALT wirkt wie immer sofort.

## Was korrigiert wird

- **Maßstab:** `axes/x/steps_per_mm` und `axes/y/steps_per_mm` – neuer Wert = alter Wert / gemessener
  Weg je befohlenem Millimeter. Typisch für Riemen: einige Zehntel Prozent.
- **Rechtwinkligkeit:** Die LowRider richtet das Portal bei der Referenzfahrt an zwei
  Y-Endschaltern aus. Der Rückzugsweg nach dem Schalter (`pulloff_mm`) ist je Motor einstellbar;
  die App verteilt die nötige Differenz auf beide Motoren, sodass die X+-Seite des Portals um
  _Schienenabstand × tan(Winkelfehler)_ verschoben wird. Wirksam nach der nächsten Referenzfahrt.
  Stimmt die Richtung nicht (Fehler nach der Kontrollmessung doppelt so groß), ist die Seite von
  Motor 1 falsch angegeben.

Unterhalb von 0,03 % Maßstab bzw. 0,05 mm Portalversatz schlägt die App nichts vor.

## Grenzen

- Gemessen wird im Stand. Wie genau die Maschine unter Last fräst, zeigt nur ein Probeschnitt.
- Die Tafel deckt nur einen Ausschnitt ab. Für den Maßstab über die ganze Y-Länge (2440 mm) die
  Messung an mehreren Stellen wiederholen oder eine längere Referenz (Stahllineal) verwenden.
- Z-Schiefe lässt sich nicht per Config korrigieren: Z-Platten bzw. die Höhe der beiden
  Z-Motoren nachstellen.

## Bohrungen als Referenz (Einrichten → Kamera)

Dieselbe Erkennung findet auch Bohrungen im Werkstück:

- **Kamera-Versatz automatisch:** Mit dem Fräser einen kleinen Punkt bohren (z. B. Ø 1 mm, 0,5 mm
  tief), _Position der Markierung merken_, Fräser hochfahren, Kamera grob über den Punkt,
  _Markierung automatisch finden_. Genauer als Antippen – und die Grundlage für alles Folgende.
- **Bohrung → Nullpunkt X/Y:** Kamera grob über die Bohrung, _Bohrung zentrieren → Nullpunkt X/Y_.
- **Zwei Bohrungen → Nullpunkt und Drehung:** Lage beider Bohrungen im Job eintragen, beide
  zentrieren. Bohrung 1 legt den Nullpunkt fest, Bohrung 2 den Winkel; die App dreht den Job
  passend (immer vom Original aus, mehrfaches Ausrichten addiert sich nicht). Weicht der gemessene
  Abstand mehr als 1 mm vom Job ab, verweigert die App – dann ist es die falsche Bohrung oder ein
  Tippfehler.

Die Bohrung muss ganz ins Bild passen und sich vom Material abheben: dunkle Bohrung auf hellem
Holz (Durchgangsbohrung über dunkler Opferplatte, tiefe Bohrung mit Schatten) oder, mit dem
Schalter _Helle Bohrung auf dunklem Material_, umgekehrt. Ausgefranste Ränder verschieben die
Mitte etwas; die Erkennung mittelt über die ganze Fläche.
