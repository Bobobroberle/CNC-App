# Erstes Urteil (blind) – vor dem Lesen von CLAUDE.md, DESIGN.md, docs/umbau-guide.md

Stand: nach Lesen von 01-fakten, 02-ziele, 03-auftrag, nach dem Zählen in der Demo und nach der Größenmessung des
Quelltexts. Die drei gesperrten Dateien waren zu diesem Zeitpunkt nicht geöffnet (kein Lesen, kein Treffer in einem grep).
Dieser Text wird nach dem Lesen **nicht umgeschrieben**; Änderungen stehen im Bericht unter „Was sich nach dem Lesen geändert hat“.

## Was ich beim Zählen selbst gesehen habe (Belege: Skripte und Screenshots in diesem Ordner)

- Frischer Start (`lowrider-control.html#simulator`, nicht referenziert, nichts vorbelegt):
  Aufgabe A (G-Code laden → Job gestartet) **14 Eingaben**, Aufgabe B (Rechteck zeichnen → Job gestartet) **15 Eingaben**;
  gleiche Zahlen im iPad-Fenster (1180 × 820).
- Die mitgelieferte `lowrider-demo.html` startet „wie eingerichtet“ (referenziert, Job geladen, Nullpunkt gesetzt, Werkzeug
  gesetzt). Dort sind es 2 Eingaben bis „Läuft“. Das ist **kein Maß** für die Bedienung, sondern ein Vorführzustand.
- Die Schritte Prüfen/Fräsen sperren den Start hart („Start gesperrt: Verlässt den Verfahrweg (3×)“). Die Ziele wollen
  Prüfungen „zur Verfügung stellen, nicht erzwingen“.
- Fortsetzen nach Pause ist **Halten**, nicht „ein Tipp“. Pause per Leertaste geht (ein Tastendruck).
- Der Knopf „Nullpunkt hier setzen“ und „Fräsen starten“ liegen im 1440 × 900-Fenster unter dem sichtbaren Rand (Scrollen nötig).
- Nach dem Zeichnen schluckt der erste Tipp aufs Bild nur die Auswahl der Form; erst der zweite setzt das Ziel.

## Erste Einschätzung zu den sechs Aufgaben

1. **Bedienbarkeit:** Die Schrittzahl ist für das Zielbild „schnell“ hoch (14/15), aber die Ziele sagen „Schritte egal, solange nichts
   schiefgeht“ – maßgeblich ist daher eher die Zahl der Entscheidungen und Karten. Die Oberfläche zeigt je Schritt sehr viele
   Elemente (Material-Auswahl, Rohteil, Spannmittel, Kamera, Joystick, Messen ... gleichzeitig). Die geforderte „Bereichs-Oberfläche“
   (nur ein Bereich sichtbar) ist **nicht** das, was ich sehe: die fünf Schritte sind genau die „vorgegebenen Schritte“, die die
   Ziele ablehnen, auch wenn sie frei anwählbar sind.
2. **Umfang:** Über 93 000 Zeilen TypeScript; die Oberfläche allein 52 000 Zeilen in 262 Dateien, davon 3 200 Zeilen deutsche
   Texte. Vieles zielt auf Fälle, die laut Zielen selten sind (Serien auf Rohlingen, Vorrichtungen mit Markern, Teile länger als
   der Tisch, Wenden, Kalibrierung, Firmware-Flash, Aufzeichnung). Vermutung: Ausblenden ist machbar, Entfernen ist teuer, weil
   Start-Prüfung und Stores darauf zugreifen.
3. **Code und Tests:** Die Tests laufen (alle Zahlen aus 01-fakten stimmen: 555/86/112/160/100/49), `tsc` ist sauber, der Bau
   ergibt dieselbe `lowrider-control.html` wie die mitgelieferte. Ob die Tests Verhalten prüfen, ist offen (Teilprüfung läuft).
4. **Sicherheit:** Offene Frage ist, wer den Job streamt. Im Quelltext gibt es einen Zeichen-zählenden Streamer im Browser
   (`store/machine.ts` streamJob) **und** die SD-Karte. Falls der Browser streamt, gilt „Verbindung bricht ab → Maschine läuft
   weiter“ nicht. (Teilprüfung läuft.)
5. **Lücken:** Vermutlich größte Lücken: CAM („reicht nicht“: kein Nesting, keine Booleans, keine Bemaßung, keine 3D-Bahnen, laut
   01-fakten auch kein Wirbelfräsen/adaptiv/Restmaterial), Updates ohne Internet (laut 02-ziele nur `scp` + `setup.sh`),
   Kamera ±0,2 mm (laut 01-fakten an der echten Maschine nichts abgenommen).
6. **Spannungen:** Die Spannung „vollwertiges CAM, verzichte auf nichts“ gegen „schnell und übersichtlich“ lässt sich nur durch
   echte Bereichstrennung lösen; ohne diese wächst jede neue Funktion die Oberfläche weiter.

## Ausdrücklich Vermutung (noch nicht belegt)

- Kamera: ±0,2 mm ist mit einer Pi-Kamera über dem ganzen Tisch nur bei guter Kalibrierung und kleinem Ausschnitt erreichbar.
- „Fortschritt 100 % bei Zeile 8 von 23“ im Simulator (Bild `A8-14.png`): vermutlich Streamer-Fortschritt = gesendet, nicht
  ausgeführt; an der echten Maschine nicht prüfbar.
