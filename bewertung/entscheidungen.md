# Entscheidungen des Betreibers zur Bewertung

Getroffen im Chat per Auswahl, nach `bericht.md`. Was hier steht, gilt; offene Punkte stehen unten.

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Bereichs-Oberfläche statt fester Schritte (DESIGN.md vs. 02-ziele.md) | **Ja, Schritte ersetzen** (DESIGN.md wird angepasst) |
| 2 | 3D-Bearbeitung in dieser App | **Ja, früh**, und zwar **parallel als eigener Strang** (XL, kein Teilcode vorhanden) |
| 3 | Fortsetzen nach Pause | **Überall Halten** (Aktionsleiste und Laufleiste vereinheitlichen) |
| 4 | Start-Sperre „Verlässt den Verfahrweg“ | **Sperre bleibt, bis `soft_limits` in FluidNC an sind**; danach Hinweis + Bestätigung |
| 5 | Schnittwerte/Material | **Je Werkzeug speichern, Material optional** |
| 6 | Werkzeugwechsel mitten im Job | **Teile mit eigenem Start genügen** (SD-Weg bleibt) |
| 7 | Kamera-Abnahme (±0,2 mm, < 30 s) | **Messprotokoll an der Maschine** (Protokoll schreibt Claude, Betreiber führt aus) |
| 8 | Zwei Geräte gleichzeitig am Pi | **Selten, nur zum Zuschauen** (Relay-Fehler beheben, aber nicht vorrangig) |
| 9 | „Wirbelfräsen“ | **= adaptives Ausräumen** (eine Strategie) |
| 10 | Reihenfolge 2D-CAM | 1. Gleich-/Gegenlauf je Bearbeitung + Schnittwerte · 2. Polylinie/Freihand + Booleans · 3. Ebenen/Gruppen + Nesting · 4. Strategien (adaptiv, Restmaterial) |
| 11 | Update-Knopf Pi | **PIN + Prüfsumme + Rückfall** (keine Signatur zunächst) |
| 12 | Umsetzungsreihenfolge | **Sicherheitspunkte zuerst** (Meldung/Leertaste B1/W1/W3, Randwerttests, Relay-Zuordnung B2, Dauerfahrt begrenzen/Relais-Wächter B3), **dann Bereichs-Oberfläche** |
| 13 | Arbeitsweise bei der Umsetzung | **Vor jedem neuen Programmierpunkt Advisor-Planung (Fable)**; ist er nicht erreichbar, vorher beim Betreiber nachfragen. Vorher nach „Stop“ immer erst fragen, wenn es so weit ist. |
| 14 | B2 Relais, zwei Geräte | **Zweites Gerät nur Ansicht** (Relais lässt Befehlszeilen nur vom ersten Gerät durch; PAUSE, NOT-HALT und `?` für alle) |
| 15 | B3 Dauerfahrt ohne Referenz | **Fahrt auf 200 mm begrenzen und Jog-Abbruch (0x85) im Pi-Relais bei Verbindungsende** |
| 16 | B2 Zuschauer-Sperre in der App | **Zentrale Stelle im Store** (umgesetzt) |
| 17 | Bereiche der Oberfläche | **Sechs Bereiche:** Job · Zeichnen/CAM · Einrichten & Fahren · Fräsen (mit Prüfen) · Service · Einstellungen |
| 18 | Im CAM-Bereich sichtbar | **Nur CAM und Statusleiste** (PAUSE und NOT-HALT bleiben) |
| 19 | Startbildschirm und „Weiter“-Kette | **Start bleibt, „Weiter“-Kette entfällt** |
| 20 | Empfehlung „Als Nächstes“ auf dem Start | **Alles bleibt**, auch „weiter bei …“; die Kette entfällt nur aus der Aktionsleiste der Bereiche |

Plan: `plan-bereichs-oberflaeche.md` (wartet auf Freigabe von Stufe 0).

## Stand der Umsetzung
Erledigt und gepusht: B1 (rote Meldung bei Stream-Abbruch), W1 (Leertaste), W3 (PAUSE/NOT-HALT ohne stille Ausnahme), Randwerttests (6 von 7 Mutationen; `start.ts:108` offen, braucht Test mit Rendering). B2 (Relais und Bibliothek) und B3 (200 mm / Z 50 mm, Jog-Abbruch im Relais) sind gebaut und getestet (desktop-e2e 119/119, `pnpm check` grün). B2 App-Seite (Entscheidung des Betreibers: zentrale Stelle im Store): Befehle, Uploads, Jobs und Streaming lehnt der Store im Zuschauer-Gerät ab, der Start zeigt den Grund „Nur Ansicht“ (Prüfskript `bewertung/skripte/sicherheit/viewer.spec.ts` hatte vorher Start nicht gesperrt und einen Upload vorbei an der Sperre gefunden; jetzt e2e `connection.spec.ts`). Als Nächstes: Bereichs-Oberfläche (nach Advisor-Plan und deiner Freigabe).

B2/B3-Antworten des Betreibers: Steuerung geht nach 10 s Funkstille weiter; Z-Grenze 50 mm, X/Y 200 mm.

## Folgen
- Die Entscheidungen 1 und 4 ändern Vorgaben aus `DESIGN.md` (§3.2, §6.4) und `usability.spec.ts`; beides wird mit angepasst.
- Die Konfiguration `soft_limits`/`hard_limits` in FluidNC schaltet der Betreiber an der Maschine (nicht Teil des Codes); bis dahin bleibt die Start-Sperre.
- Entscheidung 3 widerspricht dem Ziel „Fortsetzen: ein Tipp“ (02-ziele §7) bewusst; zu streichen oder zu ändern, falls der Betreiber das ändert.
- Nicht entschieden und nicht begonnen: Messprotokoll-Inhalt, Projekte speichern/Sicherung auf dem Pi, Merkpunkte, Werkzeugwechsel-Knopf, Aufräumen.

## Übergabe (Stopp für Modellwechsel)
Letzter Stand: Stufe 1, Teil 1 der Bereichs-Oberfläche ist committet und gepusht (Werkzeuge und Prüfen sind die Ansicht „Prüfen“ von Fräsen; Plätze `job`, `setup`, `run`; Unit-Tests grün: control 564).
**Offen:**
1. Der Desktop-E2E-Lauf dieses Stands lief beim Stopp noch; Fehlschläge beheben (Kandidaten: `find.spec.ts:150` und `:425`, Tests mit „Weiter: …“ in `control.spec.ts`, Nennungen von Schritt ②/④ in Texten). Danach tablet und ipad laufen lassen. **Bekannt vorher schon rot (auch auf dem unveränderten Import):** Tablet `control.spec.ts:650` „jogs continuously while held“ (3 von 4 Läufen).
2. Stufe 1, Teil 2: Reiter statt Stepper in `NavRow`, `cam` als Platz (ersetzt `ui.drawing`, ca. 18 Stellen), Service und Einstellungen als Reiter. Teil 3: Kette „Weiter“ aus der Aktionsleiste (`ActionBar`, `Strg+→`, `find.ts nextStep`), Empfehlung auf dem Start bleibt (Entscheidung 20). Danach Stufe 2 (CAM-Fokus) und 3 (angedockte Hauptaktion).
3. Offene Mutation `start.ts:108` (braucht Test mit React-Rendering), Wächter gegen Funkstille bei sichtbarem, aber ruhendem Steuer-Tab (10 s Übergabe, noch nicht geprüft).
**Regeln des Betreibers:** nicht programmieren, bevor er es freigibt; vor jedem neuen Programmierpunkt Advisor-Plan, sonst nachfragen; offene Fragen immer als Auswahl zum Anklicken stellen.

## Offene Beobachtung (nicht behoben, Betreiber informieren)
**Absolute Jog-Ziele aus einem bis zu 200 ms alten Positionswert:** Ein Schritt-Jog (`store/machine.ts jog`, Weg „referenziert + Softlimits“) rechnet `Ziel = zuletzt gelesene Position + Schritt` und sendet es als absolute Fahrt (`$J=G53 …`). Tippt man unmittelbar nach dem Loslassen einer Dauerfahrt auf dieselbe Achse, kann die gelesene Position (Statusabfrage alle 200 ms) hinter der wirklichen liegen; die Maschine fährt dann um den Nachlaufweg zurück (bei 3000 mm/min höchstens in der Größenordnung von 10 mm). Der unter Last wackelnde Test `jogs continuously while held` (Tablet und Desktop) war ein Rennen im Test, das dieselbe Eigenschaft sichtbar machte; im Test wird jetzt auf die gelesene Position gewartet. Mögliche Abhilfe: vor dem Schritt-Jog auf einen frischen Statusbericht warten (`settled()`), oder relativ fahren. Entscheidung offen; nur an der Maschine prüfbar.

