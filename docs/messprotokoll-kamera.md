# Messprotokoll: wie genau ist die Kamera an der Maschine?

**Warum:** Die App rechnet mit „am Fadenkreuz gut, am Bildrand und auf der Fotokarte etwa 0,2–0,5 mm“. Das ist eine
Annahme aus dem Simulator und aus Berechnungen, **an der echten Maschine nicht gemessen**. Bevor die Kalibrierung weiter
ausgebaut wird (Änderungsliste Nr. 13), soll eine Messung sagen, ob die Zahl stimmt – und wovon sie abhängt. Dieses Blatt
ist das Protokoll dafür. Es ist ein Vorschlag; der Betreiber bestimmt, was gilt.

**Was nicht dabei ist:** Die App ändert sich dafür nicht. Gemessen wird mit dem, was da ist: Kalibriertafel
([`kalibriertafel.svg`](kalibriertafel.svg), gedruckt auf **100 %**, mit Lineal geprüft), Kamera, Messschieber.

## Vorbereitung (einmal)

1. Tafel plan auf den Tisch, mit Klebeband gegen Verrutschen; Z-Nullpunkt auf die Tafeloberfläche.
2. Kamera eingerichtet und kalibriert (Service → Kalibrieren, Anleitung: [`kalibrierung.md`](kalibrierung.md)). Datum, Kamerahöhe,
   Auflösung, Beleuchtung notieren.
3. Die Maschine **referenziert**, Spindel steht, Fräser ist raus oder die Kamera ist als Werkzeug-Vergleich unbenutzt.
4. Messschieber oder Lineal mit 0,05 mm Ablesegenauigkeit bereitlegen; die Punkteabstände der Tafel mit ihm **vorher
   nachmessen** (Druckfehler!): `Soll_wahr = gemessener Abstand`.

## Messung A – Maßstab und Randverzerrung (je 3 Wiederholungen)

Auf der Fotokarte (Fläche scannen) **und** im Livebild:

| Punktepaar auf der Tafel | Lage im Bild | Soll (mm, mit dem Messschieber) | In der App gemessen (mm) | Abweichung (mm) |
| ------------------------ | ------------ | ------------------------------- | ------------------------ | --------------- |
| nahe beieinander         | Mitte        |                                 |                          |                 |
| weit auseinander in X    | Mitte        |                                 |                          |                 |
| weit auseinander in Y    | Mitte        |                                 |                          |                 |
| weit auseinander in X    | Rand         |                                 |                          |                 |
| weit auseinander in Y    | Rand         |                                 |                          |                 |
| Diagonale                | Ecken        |                                 |                          |                 |

Gemessen wird mit dem Messwerkzeug der Bühne (zwei Tipps: Abstand, ΔX, ΔY). **Bestanden**, wenn die Abweichung in der
Mitte ≤ 0,2 mm und am Rand ≤ 0,5 mm bleibt (die Annahme der App) – sonst die Zahl im Text der App und in
`docs/kalibrierung.md` ehrlich ändern.

## Messung B – Wiederholbarkeit des Zentrierens (je 5 Wiederholungen)

Kamera grob über eine Tafelbohrung fahren, **Zentrieren** (die App zentriert das Fadenkreuz selbst), Position ablesen,
wegfahren, wieder von einer anderen Richtung heranfahren.

| Lauf               | X (mm) | Y (mm) |
| ------------------ | ------ | ------ |
| 1                  |        |        |
| 2                  |        |        |
| 3                  |        |        |
| 4                  |        |        |
| 5                  |        |        |
| Spanne (max − min) |        |        |

**Bestanden**, wenn die Spanne ≤ 0,1 mm ist (so wird es im README für markerbasierte Abläufe angenommen).

## Messung C – Kamera gegen Fräser (Versatz)

Mit dem Fräser eine kleine Marke ritzen (0,2 mm tief in eine Opferplatte), die Kamera über die Marke fahren, den
Versatz (X/Y) aus der App mit der Kamera-Einrichtung vergleichen (Einstellungen → Kamera → Versatz).

| Lauf | Versatz laut Einrichtung | Versatz gemessen | Unterschied |
| ---- | ------------------------ | ---------------- | ----------- |
| 1    |                          |                  |             |
| 2    |                          |                  |             |
| 3    |                          |                  |             |

## Dauer

Stoppuhr: Fläche scannen (Größe der Fläche in mm), Zentrieren einer Bohrung, Einmessen eines Markers – je einmal. Die
Zahlen gehören in `docs/offene-fragen.md`, damit „dauert die Kamera zu lange?“ eine Zahl hat.

## Auswerten und eintragen

- Alle Rohwerte in diese Tabellen, dazu **Datum, Kamerahöhe, Auflösung, Licht, Temperatur der Werkstatt**.
- Danach: die Zahlen der README („etwa 0,1 mm in der Bildmitte“, „0,2–0,5 mm auf der Fotokarte“) und der Texte in der App
  (`de.ts`: `jigs.accuracy`, `sections…`) an das anpassen, was gemessen wurde – nicht umgekehrt.
- Erst wenn A und B bestanden sind, lohnt der Ausbau der Kalibrierung (Verzeichnung, Mehrpunkt-Kalibrierung).
