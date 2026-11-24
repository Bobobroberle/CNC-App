# Morgenbericht – was in der Nacht geschah und was von dir offen ist

Stand: wird von mir Stufe für Stufe fortgeschrieben. **Alles, was unten als „Festlegung, bitte prüfen“ steht, habe ich nach deiner Regel 30 selbst festgelegt, weil es nur du entscheiden kannst – prüfe es, wenn du ausgeschlafen bist.** Gepusht ist nur, was alle drei E2E-Projekte und `pnpm check` grün bestanden hat; nie ein PR, nie Force-Push, nur dieser Branch (`claude/compassionate-edison-bb2m7p`).

## 1. Stand in einem Satz
Stufe 1 und 2 der Bereichs-Oberfläche (sechs Reiter, im CAM nur das CAM) sind gebaut, geprüft und abgenommen; vier Prüf-Durchgänge mit Gegenprüfern haben das Programm-Schloss, den Start zwischen zwei Teilen, den Schritt-Jog und den Stream-Abbruch gehärtet. Stufe 3 (angedockte Hauptaktion) und die Änderungsliste folgen.

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

## 5d. Änderungsliste (Entscheidung 38) – bis jetzt
Gruppe 1 (Lauf-Richtung je Teil, eigene Schnittwerte je Werkzeug), Gruppe 2 (Werkzeugwechsel-Knopf, Merkpunkte) und die automatische Datensicherung der Pi-Datenbank sind gebaut und getestet; Einzelheiten und alle **Festlegungen, bitte prüfen** stehen im Entscheidungsprotokoll unter „Änderungsliste – Stand der Nacht“. Die wichtigsten zum Prüfen: (a) der Sicherungsordner liegt standardmäßig **auf derselben Karte** wie die Datenbank – für echte Sicherheit `LOWRIDER_BACKUP_DIR` auf einen USB-Stick; (b) **die SD-Liste, „Programm starten“ und „Ab Zeile fortsetzen“ zeigen die Startbestätigungen nicht** (Vorschlag und Begründung im Protokoll) – das habe ich bewusst nicht allein geändert; (c) ein eingetippter Vorschub am Werkzeug wird vom Lernen nicht verändert.

## 6. Reihenfolge der Nacht und was noch kommt
Stufe 3 ist gebaut · jetzt die vier Gruppen der Änderungsliste (Schnittwerte & Lauf-Richtung · Merkpunkte & Werkzeugwechsel-Knopf · Projekte sichern · Kleinkram) · README (Entscheidung 39).

*(wird fortgeschrieben)*
