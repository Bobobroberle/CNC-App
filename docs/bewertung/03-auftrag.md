# 03 – Prüfauftrag für die unabhängige Bewertung

Du bewertest eine bestehende Software, ohne ihre Entstehungsgeschichte zu kennen. Lies zuerst
`01-fakten.md` und `02-ziele.md`. **Lies `CLAUDE.md`, `DESIGN.md` und `docs/umbau-guide.md` erst, nachdem
du dein erstes Urteil notiert hast**, und halte fest, was sich danach geändert hat.

## Aufgaben

1. **Bedienbarkeit.** Zähle die Bedienschritte (Tipps/Klicks) für die zwei wichtigsten Aufgaben aus
   `02-ziele.md`, jeweils vom Start der App bis zum gestarteten Job. Starte dazu die Demo
   (`lowrider-demo.html` oder `pnpm build` + Vorschau) mit Playwright und belege jede Zahl mit einem
   Screenshot oder Testlauf. Vergleiche mit den Zielen (Geschwindigkeit vor Funktionsfülle).
2. **Umfang.** Liste Funktionen, die laut Zielen nicht oder selten gebraucht werden, mit Größe
   (Dateien, Zeilen) und Berührungspunkten zum Rest. Sage, was man ausblenden, was entfernen kann und
   was dabei brechen würde.
3. **Code-Qualität und Tests.** Stichproben in `packages/*` und `apps/control/src/store`: Aufbau,
   Kopplung, Duplikate, tote Pfade. Prüfe, ob die Tests das Verhalten prüfen oder nur Abdeckung
   erzeugen (Mutationen von Hand: eine Bedingung umdrehen, schlägt ein Test fehl?).
4. **Sicherheit am Gerät** (nur soweit nicht in 1–3 abgedeckt): Gibt es einen Pfad, auf dem die App
   etwas bewegt, das der Bediener nicht ausgelöst hat?
5. **Lücke zu den Anforderungen.** Gehe `02-ziele.md` Abschnitt für Abschnitt durch und führe eine Tabelle:
   Anforderung · vorhanden / teilweise / fehlt · Belegstelle. Besonders für das CAM (Abschnitt 4), die
   Kamera (5: Genauigkeit ±0,2 mm, Dauer unter 30 s – ist das mit der vorhandenen Technik erreichbar und
   was ist dazu gemessen?), die Bereichs-Oberfläche (2) und die Updates ohne Internet (8).
6. **Spannungen (Abschnitt 9).** Bewerte jede einzeln: Ist sie lösbar, was kostet die Lösung, was
   müsste der Betreiber entscheiden? Nenne eine Reihenfolge, die zu „Bereichs-Oberfläche zuerst“ passt.

## Form der Antwort

- Zu jeder Aussage eine Belegstelle (Datei:Zeile, Testname oder Screenshot). Ohne Beleg: als
  Vermutung kennzeichnen.
- Zuerst die Ergebnisse, dann eine nach Aufwand und Nutzen geordnete Liste von Änderungen.
- Nenne ausdrücklich, was du **nicht** geprüft hast (zum Beispiel alles, was echte Hardware braucht).
- Ändere nichts am Code, bis der Betreiber die Liste freigegeben hat.
