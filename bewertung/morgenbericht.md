# Morgenbericht – was in der Nacht geschah und was von dir offen ist

Stand: wird von mir Stufe für Stufe fortgeschrieben. **Alles, was unten als „Festlegung, bitte prüfen“ steht, habe ich nach deiner Regel 30 selbst festgelegt, weil es nur du entscheiden kannst – prüfe es, wenn du ausgeschlafen bist.** Gepusht ist nur, was alle drei E2E-Projekte und `pnpm check` grün bestanden hat; nie ein PR, nie Force-Push, nur dieser Branch (`claude/compassionate-edison-bb2m7p`).

## 1. Stand in einem Satz
Die Bereichs-Oberfläche ist in allen drei Stufen gebaut (sechs Reiter, im CAM nur das CAM, angedockte Hauptaktion), vier Prüf-Durchgänge mit Gegenprüfern haben Programm-Schloss, Start zwischen zwei Teilen, Schritt-Jog und Stream-Abbruch gehärtet, und die vier Gruppen der Änderungsliste sind bearbeitet (Update-Knopf und Farben nur als Entwurf bzw. Inventar – das sind deine Entscheidungen). Offen bleibt, was nur an der Maschine zu klären ist, und deine Festlegungen unter 3 und 5d.

## 2. Was gepusht ist (alle grün: 283 E2E bestanden/1 übersprungen, `pnpm check` mit 652 Tests)
| Commit | Inhalt |
|---|---|
| 39ebdea | Vierter Prüf-Durchgang: „Job unterwegs“ ist, was die Steuerung mit SD-Datei meldet (nicht jedes `Run`); eine Ansicht von Fräsen, solange ein Job wartet; Start zwischen den Teilen gesperrt und bestätigt wie in der Leiste |
| a6d005c | Zentrales Schloss auf dem Programm (`store/job.ts`): nichts wird geladen, ersetzt oder abgeräumt, solange ein Job unterwegs ist |
| b289d67 | Veraltetes `stepAt` nach Abbruch; Schritt-Jog zählt nicht von einem veralteten Positionsbericht |
| bb24995 / 20ed9bd / c72f295 | Korrekturen aus dem Review dazu: wartender Schritt-Jog stirbt bei „Jog stoppen“, NOT-HALT, PAUSE, neuer Fahrt; Stream-Abbruch während des Werkzeugwechsels schickt nichts mehr nach dem Reset; Abläufe prüfen das Schloss vor ihrem ersten Schritt |
| 5d0846d | Enger Durchgang über diese Korrekturen: Karten sperren, was die Speicher verweigern; Ladungen werden nach jedem `await` geprüft |

## 3. Festlegungen, bitte prüfen (ich habe sie nach Regel 30 selbst getroffen)
1. **Fund 5 und 6 des Prüf-Durchgangs 4** (Not-Halt während „Job fortsetzen“ und Abbruch im Werkzeugwechsel-Halt): behoben wie Entscheidung 34 (stale `stepAt`), weil das Programm-Schloss am Stream-Zustand hängt. Geändert in `store/machine.ts` (Prüfung „ist das noch derselbe laufende Stream“ nach jedem `await`).
2. **Schritt-Jog**: eigener Helfer `atRest()` statt `settled()`; ein Schritt wartet höchstens 1,5 s auf einen Bericht „Idle“, danach Hinweis `drive.notAtRest` (kein Toast, bleibt im Meldungszentrum – wie „Grenze erreicht“).
3. **Gesperrte Wege zwischen zwei Teilen**: SD-Liste, „Programm starten“ und „Ab Zeile fortsetzen“ sind dann gesperrt, mit Grund – nur die Werkzeugwechsel-Karte und die Leiste starten das nächste Teil.
4. **Meldungsgruppe `jobLocked`** für „Ein Job ist unterwegs …“ (Ausweg: „Job abbrechen“ / „Restliche Teile abbrechen“).

## 4. Offen, nur an der Maschine zu klären
- **Schritt-Jog**: nur im Simulator getestet. An der Maschine prüfen: ein Schritt direkt nach dem Loslassen einer Dauerfahrt (fährt nicht zurück?), und ob die schmale Lücke aus Fund 16/j (ein Bericht, der kurz vor dem Befehl entstand) real vorkommt.
- **Echte FluidNC**: bleibt `SD:` im Statusbericht in `Hold`/`Door` stehen? (Davon hängt ab, ob ein Job gezählt wird, den nur die Steuerung meldet.) Und: nach einem Alarm im SD-Job – bleibt `fileJob` hängen, und lässt sich dann entsperren (Fund 2)?
- **Relais-Übergabe** bei sichtbarem, aber ruhendem Steuer-Tab (10 s) – noch nicht geprüft.

## 4b. Testaufbau (Entscheidung 37 – erledigt)
React Testing Library und jsdom sind als Dev-Abhängigkeit installiert (`apps/control/package.json`, Lockfile); der erste Test ist `test/startHook.test.ts` (Docblock `// @vitest-environment jsdom`). Er schließt die Mutation `start.ts:108`, die seit der Bewertung überlebte. Die Release-Datei ändert sich dadurch nicht.

## 5. Offene Beobachtungen ohne Entscheidung
- Telefon-Monitor meldet „Läuft“, während ein Stream auf den Werkzeugwechsel wartet, und zeigt dazu keine Karte (vorher schon so).
- „Prüfen“ ist tippbar, aber ohne Wirkung, solange ein Job wartet, ohne Grund (Fund 12).
- `moveTo`/`moveZ` und das Zurücksetzen bei Reset/Alarm des Schritt-Jogs sind nicht einzeln getestet.

## 5b. Stufe 3 – angedockte Hauptaktion (gebaut, gepusht)
„Nullpunkt hier setzen“, das Antasten und im Werkzeugwechsel „Fortsetzen“/„Abbrechen“ sitzen jetzt am unteren Rand des Bedienfelds (bzw. des Streifens unter dem Bild bei „Großbild“), solange ihre Karte im Bild ist – der Knopf liegt nur einmal vor, in seiner Karte. Gemessen mit `e2e/dock.spec.ts` bei vier Fenstergrößen. Zählung neu: A 12 Eingaben (vorher 13), B 13 (vorher 14). **Festlegungen, bitte prüfen:** das CAM-„G-Code erzeugen“ bleibt absichtlich ungedockt (es ersetzt ein fremdes Programm mit einem Tipp); das Dock sitzt in der Karte, nicht am ganzen Bedienfeld (damit „Antasten starten“ nie sichtbar ist, bevor man die Werte der Karte gesehen hat); auf dem Maschinen-Bildschirm braucht das Blatt dafür die Stellung „ganz“. Screenshots: `bewertung/screenshots/Dock-*.png`.

## 5c. README
Die README ist komplett auf die sechs Bereiche umgeschrieben (Entscheidung 39): Bereich für Bereich aus dem Code und den deutschen Oberflächentexten, danach von drei Prüfern (Beschriftungen, Orte, Vollständigkeit) gegengelesen, ihre Korrekturen sind eingearbeitet. Sie ist länger geworden (110 statt 40 KB), weil sie jetzt je Bereich beschreibt, was dort wirklich steht – kürzen kannst du jederzeit.

## 5d. Änderungsliste (Entscheidung 38) – alle vier Gruppen bearbeitet
Einzelheiten und alle **Festlegungen, bitte prüfen** stehen im Entscheidungsprotokoll unter „Änderungsliste – Stand der Nacht“.

| Gruppe | Stand |
|---|---|
| 1 · Schnittwerte & Lauf-Richtung | gebaut und getestet: Laufrichtung je Teil, eigene Schnittwerte je Werkzeug |
| 2 · Merkpunkte & Werkzeugwechsel-Knopf | gebaut und getestet (vier Schnellaktionen bei 800 × 600 / 384-px-Feld noch nicht ausgemessen) |
| 3 · Projekte sichern | gebaut und getestet: Projektdatei `*.lowrider.json` speichern/öffnen; tägliche Datensicherung der Pi-Datenbank |
| 4 · Kleinkram | Messprotokoll Kamera (Dokument) · Update-Knopf **nur als Entwurf** (`docs/update-konzept.md`, braucht zuerst eine Anmeldung am Companion – deine Entscheidung) · Farben **nur Inventar und Vorschlag** (`bewertung/farben-inventar.md`, nichts geändert) · **Ausblend-Schalter gebaut** (Einstellungen → Maschine → Funktionen) |

**Die wichtigsten Festlegungen zum Prüfen:**
(a) Der Sicherungsordner der Pi-Datenbank liegt standardmäßig **auf derselben Karte** wie die Datenbank – für echte Sicherheit `LOWRIDER_BACKUP_DIR` auf einen USB-Stick.
(b) **Die SD-Liste, „Programm starten“ und „Ab Zeile fortsetzen“ zeigen die Startbestätigungen nicht** (Vorschlag und Begründung im Protokoll) – bewusst nicht allein geändert.
(c) Ein eingetippter Vorschub am Werkzeug wird vom Lernen nicht verändert; für gebohrte Löcher gibt es keine Richtungswahl.
(d) Das Projekt ist nur eine **Datei**, nicht auf dem Pi gesichert; der Projektname wird beim Rückgängig nicht zurückgesetzt.
(e) **Ausblend-Schalter:** wählbar sind nur Serie auf Rohlingen, Vorrichtungen mit Markern und Makros (Wenden und Abschnitte nicht, weil ihre Startklar-Punkte den Start sperren können; Material nicht, es liefert die Schnittwerte). Es verschwinden nur die **Einstiege** – die Hintergrunddienste laufen weiter (z. B. das Erkennen von Markern alle 0,7 s). Ein Ablauf, der für den geladenen Job läuft, **bleibt sichtbar**, auch wenn er ausgeblendet ist; die Suche führt eine ausgeblendete Funktion zur Karte „Funktionen“ zurück.
(f) Farben: Rot trägt mehr als Alarm und NOT-HALT (gesperrter Start, Fehler im G-Code, gefährliche Halten-Tasten) – das ist eine Gestaltungsentscheidung; im Inventar steht mein Rat dazu.

## 6. Reihenfolge der Nacht
Stufe 3 gebaut · die vier Gruppen der Änderungsliste (Schnittwerte & Lauf-Richtung · Merkpunkte & Werkzeugwechsel-Knopf · Projekte sichern · Kleinkram) · README (Entscheidung 39) · Prüf-Durchgang über Gruppe 1 bis 3.

**Was ich dir zum Entscheiden hinterlasse (kurz):** (1) Startbestätigungen auch für SD-Liste, „Programm starten“ und „Ab Zeile fortsetzen“? (2) Wie sollen Geräte am Companion angemeldet werden – davon hängt der Update-Knopf ab? (3) Soll Rot nur noch Notfall, Alarm und kritische Meldung tragen (Farben-Inventar)? (4) Sicherungsordner der Pi-Datenbank auf einen USB-Stick? (5) Sollen auch Wenden und Abschnitte ausblendbar sein (dann braucht ihr Startklar-Punkt einen anderen Weg)?
