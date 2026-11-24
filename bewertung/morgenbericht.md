# Morgenbericht – was in der Nacht geschah und was von dir offen ist

Stand: wird von mir Stufe für Stufe fortgeschrieben. **Alles, was unten als „Festlegung, bitte prüfen“ steht, habe ich nach deiner Regel 30 selbst festgelegt, weil es nur du entscheiden kannst – prüfe es, wenn du ausgeschlafen bist.** Gepusht ist nur, was alle drei E2E-Projekte und `pnpm check` grün bestanden hat; nie ein PR, nie Force-Push, nur dieser Branch (`claude/compassionate-edison-bb2m7p`).

## 1. Stand in einem Satz
Die Bereichs-Oberfläche ist in allen drei Stufen gebaut (sechs Reiter, im CAM nur das CAM, angedockte Hauptaktion), vier Prüf-Durchgänge mit Gegenprüfern haben Programm-Schloss, Start zwischen zwei Teilen, Schritt-Jog und Stream-Abbruch gehärtet, und die vier Gruppen der Änderungsliste sind bearbeitet (Update-Knopf und Farben nur als Entwurf bzw. Inventar – das sind deine Entscheidungen). Offen bleibt, was nur an der Maschine zu klären ist, und deine Festlegungen unter 3 und 5d.

## 2. Was gepusht ist (Stand 519173e; alle drei E2E-Projekte grün: 309 bestanden/1 übersprungen, `pnpm check` grün)
| Commit | Inhalt |
|---|---|
| 39ebdea … 5d0846d | Vierter und fünfter Prüf-Durchgang: Programm-Schloss auf dem Programm, Start zwischen den Teilen gesperrt und bestätigt, Schritt-Jog mit frischem Bericht, Stream-Abbruch im Werkzeugwechsel |
| 76bd254, 58d7bf6, d0954eb | Stufe 3: angedockte Hauptaktion (Nullpunkt, Antasten, Werkzeugwechsel) |
| f56d6c9, eb7fc47 | README komplett für die sechs Bereiche; Abnahme Stufe 3 |
| 6214646, 08e1c05 | Änderungsliste 1: Laufrichtung je Teil; eigene Schnittwerte je Werkzeug |
| c1c7353, b620a39 | Änderungsliste 2: Schnellaktion „Werkzeugwechsel“, Karte „Merkpunkte“ (nach Prüfung nachgebessert) |
| cc06185 | Änderungsliste 3: tägliche Datensicherung der Pi-Datenbank |
| 567b3a6 | Änderungsliste 3: Projektdateien `*.lowrider.json`; Messprotokoll Kamera und Entwurf Update-Knopf als Dokumente |
| e3bb791 | Spec der Merkpunkte (strict-Locator) und Farben-Inventar |
| 43e2bb6 | Änderungsliste 4: Ausblend-Schalter (Einstellungen → Maschine → Funktionen) |
| 519173e | Grenzen der Projektdatei wie die Felder im CAM; weggelassene Einstellungen werden beim Öffnen genannt; Messung des Ergebnisses nach dem Antasten bei 800 × 600 |
| b255b2d, 28f33dd, e099100 | **Prüf-Durchgang 6** (drei Linsen über Stufe 3 und die Änderungsliste): Dock-Ergebnisse und Werkzeugwechsel-Zeile, Projektdatei streng und ganz-oder-gar-nicht, Vorschub folgt der Drehzahl, Lösch-Kreuz der Merkpunkte, Datensicherung (fremde Dateien, Uhr, Platz, Fehlertext, fehlendes Medium) – Einzelheiten im Entscheidungsprotokoll |

## 3. Festlegungen, bitte prüfen (ich habe sie nach Regel 30 selbst getroffen)
1. **Fund 5 und 6 des Prüf-Durchgangs 4** (Not-Halt während „Job fortsetzen“ und Abbruch im Werkzeugwechsel-Halt): behoben wie Entscheidung 34 (stale `stepAt`), weil das Programm-Schloss am Stream-Zustand hängt. Geändert in `store/machine.ts` (Prüfung „ist das noch derselbe laufende Stream“ nach jedem `await`).
2. **Schritt-Jog**: eigener Helfer `atRest()` statt `settled()`; ein Schritt wartet höchstens 1,5 s auf einen Bericht „Idle“, danach Hinweis `drive.notAtRest` (kein Toast, bleibt im Meldungszentrum – wie „Grenze erreicht“).
3. **Gesperrte Wege zwischen zwei Teilen**: SD-Liste, „Programm starten“ und „Ab Zeile fortsetzen“ sind dann gesperrt, mit Grund – nur die Werkzeugwechsel-Karte und die Leiste starten das nächste Teil.
4. **Meldungsgruppe `jobLocked`** für „Ein Job ist unterwegs …“ (Ausweg: „Job abbrechen“ / „Restliche Teile abbrechen“).

## 4. Offen, nur an der Maschine zu klären
- **Schritt-Jog**: nur im Simulator getestet. An der Maschine prüfen: ein Schritt direkt nach dem Loslassen einer Dauerfahrt (fährt nicht zurück?), und ob die schmale Lücke aus Fund 16/j (ein Bericht, der kurz vor dem Befehl entstand) real vorkommt.
- **Echte FluidNC**: bleibt `SD:` im Statusbericht in `Hold`/`Door` stehen? (Davon hängt ab, ob ein Job gezählt wird, den nur die Steuerung meldet.) Und: nach einem Alarm im SD-Job – bleibt `fileJob` hängen, und lässt sich dann entsperren (Fund 2)?
- **Relais-Übergabe** bei sichtbarem, aber ruhendem Steuer-Tab (10 s) – noch nicht geprüft.
- **Am Pi:** Datensicherung mit `LOWRIDER_BACKUP_DIR` auf einem Stick, **Stick gezogen** (es muss ein Fehler im Kasten Companion stehen, keine heimliche Kopie auf der Karte); danach Stick stecken und prüfen, dass die Kopie von heute dort liegt; Uhr falsch gestellt (die Kopie von heute darf nicht gleich wieder verschwinden). Wie lange dauert die Kopie auf der echten Karte, und ruckelt die Weiterleitung dabei?
- **Am Berührungsbildschirm der Maschine (800 × 600):** das Ergebnis nach dem Antasten (Warnung „Platte und Klemme entfernen“) steht im Bild und die Köpfe (PAUSE, NOT-HALT) bleiben stehen (im Browser gemessen, nicht am Gerät); der Werkzeugwechsel (Fortsetzen und Abbrechen nebeneinander – bricht „Restliche Teile abbrechen“ im schmalen Feld um?); das Lösch-Kreuz der Merkpunkte; die vier Schnellaktionen (im schmalen Feld zwei mal zwei).
- **Kamera:** das Messprotokoll (`docs/messprotokoll-kamera.md`) ist nicht ausgefüllt – die Zahlen der README für die Kamera sind weiter Annahmen.

## 4b. Testaufbau (Entscheidung 37 – erledigt)
React Testing Library und jsdom sind als Dev-Abhängigkeit installiert (`apps/control/package.json`, Lockfile); der erste Test ist `test/startHook.test.ts` (Docblock `// @vitest-environment jsdom`). Er schließt die Mutation `start.ts:108`, die seit der Bewertung überlebte. Die Release-Datei ändert sich dadurch nicht.

## 5. Offene Beobachtungen ohne Entscheidung
- Telefon-Monitor meldet „Läuft“, während ein Stream auf den Werkzeugwechsel wartet, und zeigt dazu keine Karte (vorher schon so).
- „Prüfen“ ist tippbar, aber ohne Wirkung, solange ein Job wartet, ohne Grund (Fund 12).
- `moveTo`/`moveZ` und das Zurücksetzen bei Reset/Alarm des Schritt-Jogs sind nicht einzeln getestet.
- Der Werkzeugprüfer (`JobTools`, `CuttingAdvisor`) kennt eigene Werkzeugwerte ohne Material nicht und rechnet mit dem gelernten Faktor, das CAM nicht – beide können verschiedene Vorschübe nennen (vorher schon so).
- Das Blatt mit den Passmarken für „In Abschnitten“ wird nur im Kasten „Vorrichtungen mit Markern“ gedruckt; wer ihn ausblendet, erreicht es nur über den Schalter „Funktionen“ (Vorschlag im Protokoll).

## 5b. Stufe 3 – angedockte Hauptaktion (gebaut, gepusht)
„Nullpunkt hier setzen“, das Antasten und im Werkzeugwechsel „Fortsetzen“/„Abbrechen“ sitzen jetzt am unteren Rand des Bedienfelds (bzw. des Streifens unter dem Bild bei „Großbild“), solange ihre Karte im Bild ist – der Knopf liegt nur einmal vor, in seiner Karte. Gemessen mit `e2e/dock.spec.ts` bei vier Fenstergrößen. Zählung neu: A 12 Eingaben (vorher 13), B 13 (vorher 14). **Festlegungen, bitte prüfen:** das CAM-„G-Code erzeugen“ bleibt absichtlich ungedockt (es ersetzt ein fremdes Programm mit einem Tipp); das Dock sitzt in der Karte, nicht am ganzen Bedienfeld (damit „Antasten starten“ nie sichtbar ist, bevor man die Werte der Karte gesehen hat); auf dem Maschinen-Bildschirm braucht das Blatt dafür die Stellung „ganz“. Screenshots: `bewertung/screenshots/Dock-*.png`.

## 5c. README
Die README ist komplett auf die sechs Bereiche umgeschrieben (Entscheidung 39): Bereich für Bereich aus dem Code und den deutschen Oberflächentexten, danach von drei Prüfern (Beschriftungen, Orte, Vollständigkeit) gegengelesen, ihre Korrekturen sind eingearbeitet. Sie ist länger geworden (110 statt 40 KB), weil sie jetzt je Bereich beschreibt, was dort wirklich steht – kürzen kannst du jederzeit.

## 5e. Einstellungen und Messwerte auf dem Pi (Entscheidung 40) – gebaut, geprüft
Auf deinen Wunsch („unbedingt alle Messwerte und Einstellungen auf dem Pi speichern“): Kamera-Maßstab und -Versatz, Orte, Kalibrierwerte, Spindelgrenzen, Klemmen, Makros, Lernwerte und Maschinenwerte liegen auf dem Pi und sind auf jedem Gerät da; dazu das **Messprotokoll** (Service → Kalibrieren). Alles Weitere – was am Gerät bleibt, die Regel bei der ersten Verbindung, der Simulator, was dem Pi nicht geglaubt wird, was **noch nicht** im Protokoll steht, und die 45 Funde des Prüf-Durchgangs 7 (44 bestätigt, alle behoben außer den dort genannten Festlegungen) – steht im Entscheidungsprotokoll unter „Einstellungen und Messwerte auf dem Pi (Entscheidung 40)“. **Zum Einspielen:** den Pi mit der neuen Version aktualisieren (neue `lowrider-pi.zip`, dann `setup.sh`) – vorher sagt die Karte „kennt diesen Speicher noch nicht“. **Bitte prüfen:** (1) wer den Pi in ein fremdes Netz stellt, braucht eine Anmeldung (der Companion hat keine); (2) Sprache und Expertenfunktionen bleiben am Gerät; (3) Makros vom Pi werden nur gemeldet, nicht gesperrt.

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
