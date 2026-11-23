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

## Weitere Entscheidungen während der Umsetzung (Stufe 1)
| Nr. | Frage | Entscheidung |
|---|---|---|
| 21 | Reiterzeile | **Kurze Namen:** Job · CAM · Einrichten · Fräsen · Service · Einstellungen (`nav.tabs`); unter 1100 px behalten nur der aktuelle Reiter seinen Namen und der Rest sein Zeichen |
| 22 | Prüfen-Ansicht, unten rechts | **Nichts.** Keine Primäraktion; zum Fräsen wechselt der Unterreiter oben im Bereich |
| 23 | Zeichnen, während ein Job läuft | **Erlaubt.** Das Programm, das läuft (oder zwischen zwei Teilen wartet), wird nie angefasst; die Zeichnung zeigt „Ein Job läuft …“ und liegt erst danach auf dem Tisch (per Knopf; von selbst nur dort, wo nichts geladen war) |
| 24 | Fremdes Programm geladen (geöffnete Datei, ausgerichtete Rückseite) | **Nur über den Knopf** „Zeichnung auf den Tisch legen“; eine Änderung in der Zeichnung ersetzt es nie von selbst |

Zu 23: Abweichung vom Wortlaut, den du bestätigt hast („legt die App die geänderte Zeichnung erst auf den Tisch, wenn der Job zu Ende ist“): läuft das Programm der Zeichnung selbst, bleibt es nach dem Job zunächst geladen (die Zusammenfassung und „Nächstes Teil“ gehen nicht still verloren) und der Hinweis bietet den Knopf an. Von selbst geht die Zeichnung nur dorthin, wo nach dem Job nichts geladen ist. Ändern, falls du es anders willst.

## Stand der Bereichs-Oberfläche
Stufe 1, Teile 1 und 2 (+ Review-Korrekturen) sind gebaut, getestet und gepusht. Teil 3 (Weiter-Kette und Strg+→ entfernen) wird als Nächstes gemacht, danach Stufe 2 (CAM-Fokus) und Stufe 3 (angedockte Hauptaktion).
**Regeln des Betreibers:** nicht programmieren, bevor er es freigibt; vor jedem neuen Programmierpunkt Advisor-Plan, sonst nachfragen; offene Fragen immer als Auswahl zum Anklicken stellen.
Offen: Mutation `start.ts:108` (braucht Test mit React-Rendering), Wächter gegen Funkstille bei sichtbarem, aber ruhendem Steuer-Tab (10 s Übergabe, noch nicht geprüft).

## Offene Beobachtung (nicht behoben, Betreiber informieren)
**Absolute Jog-Ziele aus einem bis zu 200 ms alten Positionswert:** Ein Schritt-Jog (`store/machine.ts jog`, Weg „referenziert + Softlimits“) rechnet `Ziel = zuletzt gelesene Position + Schritt` und sendet es als absolute Fahrt (`$J=G53 …`). Tippt man unmittelbar nach dem Loslassen einer Dauerfahrt auf dieselbe Achse, kann die gelesene Position (Statusabfrage alle 200 ms) hinter der wirklichen liegen; die Maschine fährt dann um den Nachlaufweg zurück (bei 3000 mm/min höchstens in der Größenordnung von 10 mm). Der unter Last wackelnde Test `jogs continuously while held` (Tablet und Desktop) war ein Rennen im Test, das dieselbe Eigenschaft sichtbar machte; im Test wird jetzt auf die gelesene Position gewartet. Mögliche Abhilfe: vor dem Schritt-Jog auf einen frischen Statusbericht warten (`settled()`), oder relativ fahren. Entscheidung offen; nur an der Maschine prüfbar.

