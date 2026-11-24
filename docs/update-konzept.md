# Entwurf: Update aus der App („Update-Knopf“)

**Stand: nur ein Entwurf, nichts davon ist gebaut.** Grund: Ein Update-Knopf lädt Code hoch, der auf dem Pi läuft – das ist
die gefährlichste Funktion, die der Companion haben könnte. Sie ohne den Betreiber zu bauen, wäre falsch; dieses Blatt sagt, was
sie sein müsste, damit sie sicher ist, und was heute dafür fehlt. Änderungsliste Nr. 14.

## Was heute ist

- Der Pi bekommt eine neue Fassung so: Ordner `release/pi` (aus `pnpm bundle`) auf den Pi kopieren, `bash setup.sh …` ausführen.
  Das Skript ist wiederholbar („Running it again updates the files and keeps the database“).
- Der Companion hat **keine Anmeldung**: Wer im Werkstattnetz ist, darf alles (`apps/companion/src/server.ts`: offene
  CORS-Kopfzeilen, kein Login). Das ist für die Bibliotheken vertretbar, für das Hochladen ausführbaren Codes nicht.
- Das Archiv `lowrider-pi.zip`, das eine frühere Fassung dieses Entwurfs voraussetzte, wird nicht gebaut.

## Bedrohungen, die der Entwurf abdecken muss

1. **Fremder Code im Werkstattnetz:** Ohne Anmeldung könnte jedes Gerät im WLAN ein „Update“ hochladen und damit den Pi übernehmen.
2. **Beschädigte oder unvollständige Datei:** Ein abgerissener Upload darf nie zu einem halb ersetzten Companion führen.
3. **Eine Fassung, die nicht startet:** Der Pi hängt an der Maschine; ein kaputter Companion bedeutet keine Weiterleitung, keine
   Aufnahmen, keine Sensoren – und in der Werkstatt niemand mit Tastatur am Pi.
4. **Downgrade auf eine alte, unsichere Fassung.**

## Der kleinste sichere Weg (Vorschlag)

1. **Anmeldung zuerst.** Ein Companion-Login (ein Gerätecode/PIN, einmal am Pi angezeigt, im Browser gemerkt) für _alle_
   schreibenden Wege – nicht nur für das Update. Ohne Login kein Update-Knopf.
2. **Ein Archiv, eine Summe.** Der Upload ist ein ZIP aus `pnpm bundle`; daneben die SHA-256-Summe, die der Betreiber **auf
   einem zweiten Weg** bekommt (vom eigenen Rechner abgelesen, nicht aus demselben Upload). Der Pi vergleicht, bevor er etwas
   entpackt. (Eine Signatur mit einem öffentlichen Schlüssel auf dem Pi wäre stärker, braucht aber Schlüsselverwaltung –
   erst, wenn mehrere Leute Fassungen bauen.)
3. **Erst daneben entpacken, dann tauschen.** Entpacken in `~/lowrider/next/`, prüfen (`node companion.mjs --check` startet,
   öffnet die Datenbank schreibgeschützt, beantwortet `/api/health` und beendet sich), dann `current` → `previous`,
   `next` → `current` (ein Umbenennen), Neustart des Dienstes.
4. **Zurück von selbst.** Der Dienst meldet nach dem Start innerhalb von 60 s „gesund“ (eine Datei); fehlt sie, tauscht ein
   kleiner Wächter (systemd `ExecStartPre`/Timer) `previous` zurück. So bleibt ein kaputtes Update ein Fehlversuch.
5. **Datenbank zuerst sichern.** Vor dem Tausch macht der Companion die tägliche Sicherung außer der Reihe
   (`apps/companion/src/backup.ts`), damit eine Migration rückgängig zu machen ist.
6. **Nur vorwärts.** Die Versionsnummer muss höher sein als die laufende (außer mit ausdrücklichem Haken „ältere Fassung
   einspielen“, mit Rückfrage).
7. **In der App:** ein eigener Kasten unter Einstellungen → Verbindung → Companion: aktuelle Fassung, Datei wählen, Summe
   eintippen, „Prüfen“, dann ein **Halten** zum Einspielen; währenddessen die Meldung „Der Pi startet neu – Weiterleitung ist
   kurz weg“. **Nicht, solange ein Job läuft oder der Pi eine Weiterleitung hält**, die Maschine bewegt wird (derselbe Schutz wie
   beim „Pi herunterfahren“).

## Was dafür gebaut werden müsste

| Teil                                                                       | Aufwand (Schätzung) | Hängt ab von                                              |
| -------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------- |
| Login/Gerätecode im Companion und in der App                               | M                   | Entscheidung des Betreibers, wie Geräte angemeldet werden |
| Archiv und Summe bauen (`pnpm bundle` erzeugt das ZIP, dazu `SHA256SUMS`)  | S                   | –                                                         |
| Entpacken, Prüfen, Tauschen, Wächter, Zurückrollen im Companion/`setup.sh` | M–L                 | Test auf einem **echten Pi** (nicht im Simulator machbar) |
| Kasten in der App mit Halten und Sperre unter einem Job                    | S–M                 | Login                                                     |

**Empfehlung:** erst Login, dann der Rest; und den Wächter (4) auf dem echten Pi ausprobieren, bevor irgendjemand ein Update
aus der App einspielt. Bis dahin bleibt es beim bewährten Weg: Ordner kopieren, `setup.sh`.
