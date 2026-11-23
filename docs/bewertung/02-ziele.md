# 02 – Anforderungen des Betreibers (Antworten aus dem Fragenkatalog)

Alles hier stammt vom Betreiber selbst, aus zwei Fragerunden. Wo die zweite Runde eine frühere Antwort
ändert, gilt die spätere. Nichts davon ist geprüft oder umgesetzt; es sind Vorgaben.

## 1. Nutzung und Umgebung

- Bediengerät: **Windows-PC/Laptop** (Maus, Tastatur); **iPad gleichwertig** nutzbar. Handy, Touchscreen an
  der Maschine: nicht verlangt.
- Verbindung: **immer über den Pi.** In der Werkstatt gibt es nur den Router, **ohne Internet**.
- Material: **Holz**; das Material soll in der Software zunächst **keine Rolle** spielen (keine
  Materialauswahl, keine Material-Vorschläge).
- Jobs: **Einzelstücke.** G-Code kommt **direkt aus der App** (zeichnen, Bahnen erzeugen); fertigen G-Code
  laden soll ebenfalls schnell und sicher gehen.
- Maschine: Spindel **nur Ein/Aus** per Steuerung (Drehzahl von Hand). Kein Zubehör zu schalten
  (Absaugung, Licht, Kühlung: nein). Y-Achse noch nicht gebaut; Referenzfahrt danach **empfehlen,
  nicht erzwingen**.

## 2. Aufbau der Oberfläche

- **Keine vorgegebenen Schritte.** Einzelne **Reiter/Karten/Funktionsbereiche**, die man je nach Absicht
  aufruft.
- **Konzentration auf den Bereich:** Wer im CAM-Bereich ist, sieht nur das CAM; alle anderen Funktionen der
  Software sind dort ausgeblendet.
- Wichtigste Messlatte: **„Alles ist schnell und übersichtlich.“** Bei Widerspruch gewinnt die
  Geschwindigkeit der Bedienung. Anzahl der Bedienschritte bis zum Start: egal, solange nichts
  schiefgeht.
- Beanstandet am bisherigen Stand: zu viele Karten und Optionen; zu viele Tipps bis zum Start; keine
  sichtbare Rückmeldung bei Tasten.
- Selten genutzte Funktionen: **per Schalter ausblenden**, nicht löschen.
- Darstellung: **dunkel und hell wählbar**; **Sprache umschaltbar** (Deutsch/Englisch); Ansichten:
  **Tisch von oben (2D)** und **3D**.
- Statusleiste, immer sichtbar: **Zustand** (Bereit/Läuft/Alarm), **Position X Y Z**, **Spindel und
  Vorschub**.

## 3. Aufgaben und Reihenfolge der Wünsche

1. Fertigen G-Code laden und fräsen.
2. In der App zeichnen und fräsen.

**Als Erstes umzusetzen:** die Bereichs-Oberfläche (Abschnitt 2). **Verzichten:** auf nichts. Der
Test an der Maschine läuft parallel zur Bewertung.

## 4. CAM

- Rolle langfristig: **vollwertiges CAM**; es soll andere CAM-Programme für die eigenen Teile ersetzen,
  auch mit 3D. Der Betreiber bewertet das bisherige Zeichnen/Bahnen-Erzeugen als **„reicht nicht“**.
- Inhalt: einfache Formen, Text und Schilder, importierte Vektoren (SVG/DXF), freie Kurven und Skizzen.
- Zeichenwerkzeuge: **Verschachteln (Nesting)**, **boolesche Operationen**, **Maße und Abhängigkeiten**,
  **Ebenen und Gruppen**.
- Frässtrategien zusätzlich zu Kontur, Tasche, Bohren, Gravur: **Wirbelfräsen**, **adaptives
  Ausräumen**, **Restmaterial/zweiter Fräser**, **3D-Schlichten/Reliefs**.
- **Gleichlauf/Gegenlauf je Bearbeitung** einstellbar.
- Werkzeugverwaltung **mit Schnittwerten je Werkzeug** (Vorschub, Zustellung, Drehzahl je Fräser).

## 5. Kamera

- Zwecke, alle gewünscht: **Nullpunkt per Fingertipp**, **live beim Fräsen zuschauen**, **Job aufs
  Material legen** (Foto vom Tisch, Job schieben/drehen), **Messen und Teile wiederfinden**.
- Das Kamerabild muss **ausschaltbar** sein; die App muss ohne Kamera sauber laufen.
- Genauigkeit des Nullpunkts per Kamera: **±0,2 mm oder besser.**
- Dauer von aufgelegtem Werkstück bis gesetztem Nullpunkt: **unter 30 Sekunden.**
- XY-Nullpunkt wird am häufigsten **per Kamera aufs Bild tippen** gesetzt; Z-Nullpunkt: **Antasten und
  Papier/von Hand, beides.**

## 6. Fahren und Steuerung

- Eingaben: **Tasten am Bildschirm**, **Tastatur**, **Tippen aufs Bild**, dazu der **Joystick in der
  App**. Handrad/Gamepad: nicht verlangt.
- Schrittweiten: 0,01 · 0,1 · 1 · 10 · 100 mm und **Dauerfahrt** (Taste halten).
- Gespeicherte Positionen per Knopf: **Park-Position**, **Werkzeugwechsel-Position**, **Nullpunkt
  anfahren**, **eigene Merkpunkte**.
- Werkzeugwechsel: **von Hand mitten im Job** (Job hält an, Wechsel, Z neu messen, weiter).

## 7. Start, Prüfung, Pause, Sicherheit

- Start: **Halten** (Knopf gedrückt halten).
- Vor dem Start soll die App **nicht zwangsweise** selbst prüfen, aber die Prüfungen **zur Verfügung
  stellen**: Verfahrweg, Werkzeug, Spannmittel/Kollision, Simulation. Bestätigen vor dem Start: nur das
  Wichtigste.
- PAUSE: **ein Tipp, sofort, nie gesperrt**, zusätzlich **per Leertaste.**
- Fortsetzen nach einer Pause: **ein Tipp.**
- Verbindung bricht im Job ab: **Maschine läuft weiter, rote Meldung.**
- Meldungen: **nur Störungen und Warnungen** aufdringlich; sonst ruhig.
- Sensor (Pi): **Rattern erkennen und warnen.** Einmessen der Maschine (Wiederholprobe, Kalibriertafel):
  **selten**, darf versteckt sein.

## 8. Dateien, Betrieb, Updates

- Dateien: **Zuletzt verwendet**, **Projekte speichern**, **Export.**
- Ablage von Projekten und Einstellungen: **auf dem Pi, mit Sicherung** (automatische Kopie).
- Updates der Pi-Software: gewünscht ist **ein Knopf in der App**; das Update muss **ohne Internet**
  im Werkstatt-Netz möglich sein. Der Betreiber fragte, ob dafür Netzwerkwechsel, USB oder Bluetooth
  nötig wären (offene Frage; bisher: Paket kopieren per `scp` und `setup.sh`).

## 9. Spannungen zwischen den Angaben (zur Klärung, nicht gelöst)

- „Vollwertiges CAM inkl. 3D, Nesting, Booleans, Bemaßung, Ebenen, alle Strategien“ und „verzichte auf
  nichts“ stehen neben „schnell und übersichtlich“ und „im CAM-Bereich nur CAM sichtbar“.
- Kamera: ±0,2 mm und unter 30 s Dauer bei gleichzeitig kleinerer Oberfläche.
- „Fortsetzen: ein Tipp“ gegenüber dem heutigen Halten; „nur das Wichtigste bestätigen“ gegenüber
  Prüfungen, die nur angeboten werden.
- Material ausblenden, aber Schnittwerte je Werkzeug speichern.
- PC als Hauptgerät, iPad gleichwertig.
