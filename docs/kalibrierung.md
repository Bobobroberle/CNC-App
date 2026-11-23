# Maschine mit der Kamera vermessen

_Menü → Service & Diagnose → Kalibrieren_ misst mit der Kamera am Fräskopf und einer Punktetafel:

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

## Ablauf

1. Kamera einschalten, kalibrieren (_Einrichten → Kamera_: Maßstab, grob genügt), Kamerabild auf der
   Bühne.
2. Maschine referenzieren. Tafel flach auflegen, möglichst parallel zu X (±1°). Fräser über der
   Tafeloberfläche – gemessen wird in der aktuellen Höhe, Z bewegt sich dabei nicht.
3. _Menü → Service & Diagnose → Kalibrieren_: Art der Tafel, Messfeld (Abstand der äußeren Punkte; die
   mitgelieferte Tafel: 180 × 180 mm) und Anzahl der Punkte wählen.
4. Kamera mit dem Joystick über den **Punkt unten links** fahren – die Anzeige meldet „Marke
   erkannt“. _Raster messen_ (halten). Die App fährt alle Punkte ab und kehrt zum ersten zurück.
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
