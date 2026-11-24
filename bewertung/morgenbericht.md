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

## 6. Reihenfolge der Nacht und was noch kommt
Stufe 3 (angedockte Hauptaktion je Panel) in drei Teilen · dann die vier Gruppen der Änderungsliste (Schnittwerte & Lauf-Richtung · Merkpunkte & Werkzeugwechsel-Knopf · Projekte sichern · Kleinkram) · README (Entscheidung 39).

*(wird fortgeschrieben)*
