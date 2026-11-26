# Companion-Rechner einrichten

Der Companion ist **optional**. Ohne ihn läuft die App direkt gegen den Jackpot; alle Daten liegen
dann im Browser des Tablets. Mit Companion (Raspberry Pi 4/5 oder Mini-PC an der Maschine) kommen
dazu:

- Die App wird von dort ausgeliefert (`http://lowrider.local:8080`) – kein Datei-Kopieren aufs
  Tablet. So geöffnet findet die App den Companion und seinen Kamera-Stream selbst.
- Werkzeuge, Materialien, Nullpunkte und Job-Historie liegen in einer SQLite-Datei und sind auf
  jedem Gerät gleich (_Einstellungen → Verbindung → Companion → Bibliotheken abgleichen_).
- Job-Puffer: G-Code-Dateien ablegen (_Fräsen → Im Companion ablegen_).
- FluidNC-Weiterleitung: mehrere Tablets sehen dieselbe Maschine, FluidNC sieht nur einen Client.
  **Es steuert nur ein Gerät** (das zuerst verbundene); jedes weitere zeigt nur an („Nur Ansicht“) und darf
  nur den Status abfragen, pausieren (`!`) und anhalten (Reset). Das Relais meldet jedem Gerät seine Rolle
  als Textrahmen `ROLE:controller` bzw. `ROLE:viewer`. Geht das steuernde Gerät, schickt das Relais einen
  Jog-Abbruch (`0x85`) an FluidNC und das nächste Gerät steuert; schweigt es 10 s, übernimmt das nächste,
  das sich meldet. Die Aufzeichnung hängt als reiner Beobachter am Relais und steuert nie. HTTP-Uploads
  gehen am Relais vorbei direkt zu FluidNC.
- Sensoren: Spindellast und Vibration → Lastbalken, Rattererkennung, adaptiver Vorschub.
- Benachrichtigungen ans Handy über [ntfy](https://ntfy.sh) (selbst gehostet oder ntfy.sh).

## Raspberry Pi 4 an der Maschine einrichten (Schritt für Schritt)

Ziel: Pi 4 sitzt auf der Maschine, die USB-Kamera am Fräskopf hängt am Pi, optional der LSM6DSO
am I²C. Alles startet beim Einschalten von selbst.

**Vorher bereithalten:** den Namen des Pi und den Benutzer (Schritt 1), die Adresse der Fräsensteuerung (Jackpot, z. B.
`192.168.178.40`), und der Pi braucht beim allerersten Mal **Internet** (LAN-Kabel zum Router – das Skript lädt Pakete und Node
nach; ohne sie bricht es ab, bevor etwas geändert ist). Am Ende zeigt das Skript einmal den **Pi-Code** (zwischen den `====`-Linien):
aufschreiben. Ging das Fenster zu: das Skript noch einmal laufen lassen (zeigt ihn wieder), oder an einem angemeldeten Gerät
_Pi-Code anzeigen_.

1. **Karte beschreiben** – am PC den [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
   öffnen: Gerät _Raspberry Pi 4_, System _Raspberry Pi OS (other) → Raspberry Pi OS Lite (64-bit)_,
   Karte wählen. Bei _Einstellungen bearbeiten_:
   - Hostname `lowrider`
   - Benutzer `pi` mit eigenem Passwort
   - WLAN der Werkstatt (Land `DE`)
   - unter _Dienste_ SSH aktivieren
2. **Pi starten** – Karte einsetzen, Kamera per USB anstecken, Strom an. Nach etwa zwei Minuten
   ist er im WLAN: `ping lowrider.local`.
3. **Dateien bauen und kopieren** – am PC im Projekt:

   ```sh
   pnpm install && pnpm bundle
   scp -r release/pi pi@lowrider.local:~/
   ```

4. **Einrichten** – auf dem Pi (IP-Adresse des Jackpot eintragen, mit LSM6DSO `--sensor` anhängen):

   ```sh
   ssh pi@lowrider.local
   bash ~/pi/setup.sh --fluidnc 192.168.178.40
   sudo reboot
   ```

   Am Ende steht der **Pi-Code**: damit meldet sich jedes Gerät einmal an (_Einstellungen → Verbindung → Anmeldung am Pi_) – die
   Home-Bildschirm-App des iPad und Safari sind dabei zwei Geräte. Ohne Anmeldung gehen das Aktualisieren und das Herunterfahren nicht.

   Das Skript installiert Node 22, [ustreamer](https://github.com/pikvm/ustreamer), smbus2 und
   i2c-tools, schaltet I²C mit 400 kHz ein und legt drei Dienste an:

   | Dienst               | Aufgabe                                                  |
   | -------------------- | -------------------------------------------------------- |
   | `lowrider-companion` | App, Bibliotheken, FluidNC-Weiterleitung, Sensoren :8080 |
   | `lowrider-camera`    | MJPEG der USB-Kamera unverändert weiterreichen :8081     |
   | `lowrider-sensor`    | LSM6DSO auslesen (nur mit `--sensor`)                    |

   Einstellungen stehen in `/etc/lowrider.env`. Erneut ausführen aktualisiert die Dateien; die
   Datenbank in `~/lowrider/data` bleibt.

5. **iPad** – Safari: `http://lowrider.local:8080`, _Teilen → Zum Home-Bildschirm_ (eigenes
   Symbol, Vollbild, Fingergesten: [ipad.md](ipad.md)). Die App
   trägt den Companion und die Kamera-Adresse selbst ein. _Einstellungen → Verbindung → Companion →
   Verbindung testen_ zeigt Weiterleitung und Kamera-Stream; _Maschine über Companion verbinden_
   nutzt die Weiterleitung.
6. **Kamera prüfen** – `v4l2-ctl --list-formats-ext` zeigt, welche MJPEG-Auflösungen die Kamera
   kann. Ohne 1080p: `bash ~/pi/setup.sh --fluidnc … --resolution 1280x720`. Bild im Browser:
   `http://lowrider.local:8081/stream`.

7. **Ausschalten** – den Pi nie einfach ausstecken, sonst kann die SD-Karte beschädigt werden.
   _Einstellungen → Verbindung → Companion → Pi herunterfahren_ gedrückt halten. Die App meldet
   „Pi fährt herunter“, dann einen Countdown, sobald er nicht mehr antwortet, und zum Schluss
   „Pi ist aus – du kannst den Stecker jetzt ziehen“ (die grüne LED am Pi ist dann dunkel). Die
   Fräse bleibt dabei an; eine Verbindung über die Weiterleitung trennt die App vorher selbst.
   Während die Maschine fährt, ist der Knopf gesperrt, und ohne Anmeldung am Pi (s. u.) geht er nicht. Das Skript erlaubt dem Companion dafür
   genau einen Befehl als root (`/etc/sudoers.d/lowrider-power`: `systemctl poweroff`). Ohne
   App: `ssh pi@lowrider.local` (bzw. dein Benutzer) und `sudo poweroff`.

8. **Mitschnitt der Fräser-Kamera** – der Companion nimmt während eines Jobs auf, auch wenn das
   Tablet schläft: _Einrichten → Kamera → Mitschnitt_. Arten: _Zeitraffer_ (ein Bild alle N Sekunden,
   am Ende als MP4; klein), _Video_ (H.264 mit dem Video-Chip des Pi, etwa 1–2 GB pro Stunde) oder
   _Beides_. _Bei jedem Job automatisch aufnehmen_ startet die Aufnahme mit dem Job und beendet sie
   am Ende. Ist die Maschine über den Companion verbunden (Weiterleitung), erkennt er das Job-Ende
   selbst (10 s Idle nach dem Lauf) und kann den Zeitraffer _nur auf Sicherheitshöhe_ aufnehmen
   (gleich scharf, gleich groß). Die Aufnahmen liegen in `~/lowrider/data/recordings/`; in der App
   ansehen, herunterladen, löschen. Unter 1 GB freiem Platz startet keine Aufnahme, eine laufende
   endet dann; spätestens nach 8 Stunden ist Schluss. Das Video bleibt auch nach einem
   Stromausfall abspielbar, ein angefangener Zeitraffer wird beim nächsten Start fertig gemacht.
   Dafür braucht der Pi **ffmpeg**: `setup.sh` installiert es, dazu muss der Pi **einmal Internet**
   haben (LAN-Kabel an den Heim-Router, dann `bash ~/pi/setup.sh --fluidnc …` erneut). Ohne
   Internet richtet das Skript alles andere ein und sagt, was fehlt; bis dahin nimmt der Browser
   einen Zeitraffer auf (Tablet muss wach bleiben).

Fehlersuche: `journalctl -u lowrider-companion -u lowrider-camera -f`, Status mit
`systemctl status lowrider-camera`. Meldet die App beim Herunterfahren „abgelehnt“, fehlt die
sudo-Regel: `setup.sh` erneut ausführen.

### Von Hand starten (ohne Skript)

```sh
FLUIDNC_URL=ws://192.168.178.40:81 LOWRIDER_APP=./app SENSOR_SIMULATOR=1 node companion.mjs
```

| Variable                           | Bedeutung                                                                                   | Standard                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `PORT`, `HOST`                     | Adresse des Servers                                                                         | `8080`, `0.0.0.0`                           |
| `LOWRIDER_DB`                      | SQLite-Datei                                                                                | `data/lowrider.db`                          |
| `LOWRIDER_APP`                     | Ordner mit `index.html` der App                                                             | –                                           |
| `FLUIDNC_URL`                      | WebSocket des Jackpot für die Weiterleitung `/fluidnc`                                      | – (aus)                                     |
| `CAMERA_URL`                       | Kamera-Stream für die App; `:8081/stream` = Port auf demselben Rechner                      | –                                           |
| `CAMERA_DEVICE`                    | Gerät der USB-Kamera für Belichtung und Bild (dasselbe, das `ustreamer` streamt)            | `/dev/video0`                               |
| `LOWRIDER_CAMERA_CONTROLS`         | `0` = Belichtung und Bild aus der App abschalten (`/api/camera/controls` antwortet 501)     | an (braucht `v4l2-ctl`)                     |
| `SENSOR_SIMULATOR`                 | `1` = simulierte Spindellast und gelegentliches Rattern                                     | aus                                         |
| `LOWRIDER_SHUTDOWN`                | `0` = _Pi herunterfahren_ aus der App abschalten                                            | an                                          |
| `LOWRIDER_RECORDINGS`              | `0` = Mitschnitt abschalten                                                                 | an (braucht ffmpeg)                         |
| `RECORD_STREAM`, `RECORD_SNAPSHOT` | ustreamer auf diesem Rechner für den Mitschnitt                                             | `http://127.0.0.1:8081/stream`, `/snapshot` |
| `LOWRIDER_BACKUP`                  | `0` = die tägliche Datensicherung der Datenbank abschalten                                  | an                                          |
| `LOWRIDER_BACKUP_DIR`              | Ordner der Sicherungen – **besser ein zweites Medium (USB-Stick)**                          | `backups/` neben der Datenbank              |
| `LOWRIDER_BACKUP_KEEP`             | Wie viele Tagessicherungen bleiben                                                          | `7`                                         |
| `LOWRIDER_DIR`                     | Ordner der Einrichtung (`releases/`, `current`, `data/`) – nötig für das Update aus der App | –                                           |
| `LOWRIDER_UPDATE`                  | `1` = Update aus der App erlauben (`setup.sh` setzt es)                                     | aus                                         |
| `LOWRIDER_CODE_FILE`               | Datei des Pi-Codes                                                                          | `pi-code.txt` neben der Datenbank           |
| `LOWRIDER_CONFIRM_MS`              | Wie lange eine neue Version laufen muss, bis sie sich bestätigt                             | `30000`                                     |
| `LOWRIDER_GATE_SECONDS`            | Wie lange `health-gate.sh` auf die Antwort einer Version in der Probezeit wartet            | `30`                                        |

**Datensicherung:** einmal am Tag (und beim Start, wenn die von heute fehlt) macht der Companion eine vollständige Kopie der
Datenbank (`lowrider-JJJJ-MM-TT.db`: Werkzeuge, Materialien, Nullpunkte, Historie, abgelegte Jobs …) in einem eigenen Prozess,
damit Weiterleitung, PAUSE und NOT-HALT nicht darauf warten. Er beginnt keine Kopie, die nicht auf die Platte passt (Platz für
das 1,25-Fache der Datenbank muss frei sein, und danach müssen noch 1 GB bleiben, weil der Mitschnitt darunter aufhört) und meldet das; die App zeigt im Kasten _Companion_ die letzte Datei oder den
Grund des Fehlschlags. **Liegt der Ordner auf derselben Karte wie die Datenbank, schützt das vor einer beschädigten oder
versehentlich geleerten Datenbank – nicht vor dem Tod der Karte.** Ist `LOWRIDER_BACKUP_DIR` gesetzt, wird nur der letzte Ordner angelegt, nie sein Weg: fehlt das Medium (der Stick steckt nicht), meldet der Kasten einen Fehler, statt die Kopien heimlich auf die Karte zu schreiben. Zurückspielen: Companion anhalten, die Datei als
`lowrider.db` an die Stelle von `LOWRIDER_DB` kopieren (die Dateien `…-wal` und `…-shm` daneben löschen), Companion starten.

## Einstellungen und Messwerte auf dem Pi

Die App legt alles, was zur **Maschine** gehört – Kamera (Maßstab, Versatz, Kamerahöhe), Orte (Parkposition, Werkzeugwechsel,
Merkpunkte), Kalibrierwerte, Spindelgrenzen, ausgeblendete Funktionen, Klemmen auf dem Tisch, Makros, Lernwerte, die Werte des
Maschinenprofils und das **Messprotokoll** – auf dem Pi ab, damit jedes Gerät (PC, iPad, Telefon) dasselbe findet. Im Browser bleibt
eine Kopie (sie gilt, wenn der Pi weg ist, und wird nachgeholt).

- **Wie:** `GET /api/state` liefert alle Dokumente, `PUT /api/state/<Schlüssel>` schreibt eines (`{baseRev, data}`). Der Companion zählt
  die Version; schreibt ein Gerät aus einer alten Version, antwortet er mit 409 und dem aktuellen Stand, die App führt beides zusammen
  und schreibt noch einmal. Ändern zwei Geräte **verschiedene** Dinge (auch in derselben Kamera-Einstellung), bleibt beides; haben
  beide **dasselbe** geändert, gilt das Gerät, das zuletzt abgleicht, und es sagt, was es ersetzt hat. Die Uhr des Pi spielt keine
  Rolle. Das Messprotokoll ist die Sammlung `measurements` (ein Eintrag je Messung, höchstens 5000 – die ältesten gehen zuerst).
  Eine Anfrage an `/api/state` darf höchstens 1 MB groß sein, ein Dokument 512 KB.
- **Was am Gerät bleibt:** die Adresse des Pi, die Benachrichtigungen dieses Browsers, „Bildschirm anlassen“, die Sprache und die
  Expertenfunktionen (wer am PC Englisch liest, dreht das Tablet an der Maschine nicht um), die Bildquelle der Kamera und ihre
  Stream-Adresse, das Aussehen der App, die Fotokarte, die zuletzt benutzten Jobs.
- **Wann:** kurz nach jeder Änderung, alle 30 s, wenn die Seite wieder sichtbar wird und wenn der Pi antwortet. Neue Werte vom Pi
  übernimmt die App nur, solange nichts fährt, kein Job läuft und kein Messlauf der Kalibrierung unterwegs ist. Läuft der
  **Simulator**, wird nichts abgeglichen; was darin eingestellt wurde, ist danach wieder weg – auch wenn die Seite im Simulator
  geschlossen wurde (dann beim nächsten Start). Das Messprotokoll wird beim ersten Abgleich, nach einem Eintrag, der den Pi nicht
  erreicht hat, und sonst alle zehn Minuten abgeglichen.
- **Der Pi bekommt etwas Älteres** (Datensicherung zurückgespielt, neue Karte): die App vergleicht, was auf dem Pi steht – nicht die
  Versionsnummer –, übernimmt den älteren Stand und sagt es.
- **Ein Dokument auf dem Pi ist unbrauchbar** (zum Beispiel von Hand falsch geschrieben): die App übernimmt es nicht, überschreibt es
  nicht und sagt es einmal. Unter _Einstellungen → Verbindung_ ersetzt ein langes Drücken auf „Stand dieses Geräts auf den Pi
  schreiben“ es durch den Stand dieses Geräts.
- **Vertrauen:** die Dokumente (`/api/state`), die Bibliotheken und die Weiterleitung zur Fräse brauchen **keine** Anmeldung und
  der Companion antwortet jeder Webseite im Netz (CORS `*`) – das Werkstattnetz gilt als vertrauenswürdig; würde man sie
  schützen, könnte jedes Gerät ohne Anmeldung seine Einstellungen nicht mehr sichern. Die Anmeldung (s. unten) schützt nur, was
  Code auf den Pi lädt, ihn herunterfährt und sie selbst. Was vom Companion kommt, prüft die App trotzdem: Zahlen im Rahmen
  dessen, was die Karten zulassen, ein echtes Maschinenprofil, Makros nur mit Hinweis (sie laufen als Text an der Maschine).
- **Erste Verbindung eines Geräts:** hat der Pi schon einen Stand, gilt er dort, wo beide verschieden sind; die App sagt, was sie
  ersetzt hat. Ein Pi **ohne** diese Schnittstelle (alte Version) wird erkannt; der Kasten Companion sagt es, alles andere geht weiter.
- **Sicherung:** die Dokumente liegen in derselben Datenbank wie die Bibliotheken; die tägliche Sicherung deckt sie mit.

## Anmeldung und Update aus der App

**Anmeldung.** Das Aktualisieren, das Herunterfahren und die Verwaltung der Anmeldung brauchen ein angemeldetes Gerät; alles andere
(Bibliotheken, Einstellungen, Weiterleitung zur Fräse) bleibt offen wie vorher. Der **Pi-Code** (`ABCD-EFGH-JKLM`) steht am Ende
von `setup.sh`, in `~/lowrider/data/pi-code.txt` und – auf einem Gerät, das schon angemeldet ist – in der App. _Einstellungen →
Verbindung → Anmeldung am Pi_: Code eingeben, dem Gerät einen Namen geben, anmelden. Dort lassen sich Geräte entfernen, der Code
anzeigen und erneuern und alle anderen Geräte abmelden. Fünf falsche Versuche innerhalb von fünf Minuten sperren die Adresse, bis der älteste älter als fünf Minuten ist (die App nennt die Wartezeit); höchstens 20 Geräte sind angemeldet.
Details und Grenzen: `docs/update-konzept.md`.

**Update.** _Einstellungen → Verbindung → Update des Pi_: die Datei `lowrider-pi.zip` wählen (optional die Prüfsumme, die du mit der
Datei bekommen hast, eintippen), der Pi prüft sie und zeigt, was drin ist; ein **Halten** spielt sie ein. Der Pi sichert die
Datenbank, probiert die neue Version aus, hängt sie ein und startet neu; die App wartet und sagt, welcher Stand läuft – oder dass
der Pi von selbst zur alten Version zurückgekehrt ist. Dasselbe in die andere Richtung: „Zur vorherigen Version zurück“.

- **Das erste Mal** geht noch über den PC: `lowrider-pi.zip` entpacken, **`update-pi.bat`** doppelklicken (Windows; fragt beim
  ersten Mal nach dem Namen des Pi, dem Benutzer und der Adresse der Fräsensteuerung – Jackpot –, danach zweimal nach dem
  Passwort des Pi, kopiert den Ordner `pi` und führt dort `setup.sh` aus). Name und Benutzer stehen danach in
  `update-pi.einstellungen.txt` neben dem Skript (erst nach einem erfolgreichen Kopieren geschrieben; ein neuer Name:
  `update-pi.bat neu` oder die Datei löschen); die Jackpot-Adresse behält der Pi selbst und wird nur in dem Lauf mitgegeben, in dem sie
  eingegeben wurde. Nach einem Fehler fragt das Skript auf Wunsch noch einmal. Das Fenster während der Einrichtung nicht schließen. Erst nach diesem ersten Mal kennt der Pi die Anmeldung und das Update aus der App.
  `update-pi.bat` bleibt der sichere Weg, wenn etwas nicht mehr antwortet. `setup.sh` verweigert den Neustart, solange ein
  Browser über den Pi mit der Fräse verbunden ist (ein darüber gestreamter Auftrag würde abbrechen; `--force` geht trotzdem), und
  stellt jede Version, die es einspielt, wie ein Update aus der App unter Beobachtung (`trial`) – wo schon eine Version läuft, zu der es
  zurückgehen kann; bei der allerersten Einrichtung gibt es keine.
- **Aufbau auf dem Pi:** `~/lowrider/releases/<Name>/` (je Version `companion.mjs`, `app/`, `lsm6dso.py`, `release.json`), `current`
  (was läuft) und `previous` (was davor lief) sind Symlinks, `data/` (Datenbank, Aufnahmen, Sicherungen) gehört keiner Version.
  `setup.sh` legt das an (eine ältere, flache Einrichtung wird als Version kopiert, die flachen Dateien gehen erst, wenn die neue
  antwortet), schreibt `LOWRIDER_DIR`, `LOWRIDER_UPDATE=1` und `LOWRIDER_APP=…/current/app` in `/etc/lowrider.env` (Zeilen, die es nicht
  kennt, bleiben) und nimmt beim erneuten Lauf die Adresse der Fräse und die Kameraeinstellungen aus dieser Datei – ein Update
  braucht keine Angaben.
- **Der Wächter** (`~/lowrider/guard.sh`, `ExecStartPre` des Dienstes): eine neue Version, die sich nicht bestätigt (30 s laufen),
  wird beim dritten Start ohne Bestätigung durch die vorherige ersetzt. `~/lowrider/update-last.json` sagt, wie das letzte Update
  ausging.
- **Was ein Update aus der App nie ändert:** `setup.sh`, den Wächter, die Dienste, die sudoers-Regel, Pakete. Braucht eine Version
  mehr, lehnt der Pi ab („update-pi.bat“).
- **Prüfsumme:** `pnpm bundle` schreibt `release/lowrider-pi.zip.sha256`; die Summe bekommst du auf einem zweiten Weg (in der
  Nachricht, nicht in der Datei). Der Pi rechnet sie selbst nach.

## Schnittstelle

| Methode und Pfad                                              | Zweck                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                             | Version, Build, Weiterleitung, Sensorquelle, Kamera-Stream, Anmeldung/Update an, `stamps`, `cameraControls` |
| `GET /api/state`, `PUT /api/state/:key`                       | Einstellungen der Maschine (Dokumente mit Version, s. oben)                                                 |
| `POST /api/auth/login`, `GET/POST/DELETE /api/auth/…`         | Anmeldung: mit dem Pi-Code anmelden, Geräte, Code anzeigen/erneuern                                         |
| `GET /api/update`, `POST /api/update/{upload,apply,rollback}` | Update aus der App (mit Anmeldung, s. oben)                                                                 |
| `DELETE /api/update/staged`                                   | Eine hochgeladene Datei verwerfen (sie bleibt sonst 30 Minuten im Speicher des Pi)                          |
| `POST /api/system/shutdown`                                   | Pi herunterfahren (mit Anmeldung; antwortet erst, fährt dann nach 0,5 s)                                    |
| `GET/PUT/DELETE /api/library/:sammlung/:id`                   | tools, materials, zeros, jigs, macros, history, learning, profiles …                                        |
| `POST /api/library/:sammlung`                                 | mehrere Einträge auf einmal (Import)                                                                        |
| `GET/PUT/DELETE /api/jobs/:name`                              | Job-Puffer (G-Code als Text)                                                                                |
| `GET/PUT /api/notify`, `POST /api/notify`                     | Benachrichtigung einstellen bzw. senden                                                                     |
| `GET/POST /api/sensors`                                       | letzter Sensorwert bzw. neuen Wert melden                                                                   |
| `WS /api/sensors/stream`                                      | Sensorwerte live                                                                                            |
| `WS /fluidnc`                                                 | Weiterleitung zum Jackpot (`?stamp=1`: mit Zeitstempeln des Pi, s. u.)                                      |
| `GET/PUT /api/camera/controls`                                | Belichtung und Bild der USB-Kamera lesen bzw. setzen (offen, s. „Belichtung und Bild …“)                    |
| `GET /api/recordings`                                         | Aufnahmen, laufende Aufnahme, ffmpeg/Video-Chip vorhanden                                                   |
| `POST /api/recordings/start`, `/stop`                         | Mitschnitt starten (`mode`, `intervalSeconds`, …) bzw. beenden                                              |
| `GET /api/recordings/:id/file?kind=…`                         | `video` oder `timelapse` als MP4 (mit Range, für iPad/Safari)                                               |
| `DELETE /api/recordings/:id`                                  | Aufnahme löschen                                                                                            |

### Zeitstempel der Weiterleitung (`?stamp=1`)

Für den Scan „In Fahrt“ muss die App wissen, **wann** FluidNC eine Position gemeldet hat – auf derselben Uhr, auf der
später das Kamerabild gestempelt wird. Der Browser kann das nicht: er sieht einen Bericht erst, wenn er durch das
WLAN, den Pi und wieder das WLAN gelaufen ist. Darum stempelt das Relais auf dem Pi.

- **Nur auf Wunsch.** Wer sich mit `ws://<pi>:8080/fluidnc?stamp=1` verbindet, bekommt **vor jeder Nachricht von
  FluidNC** einen Textrahmen `STAMP:<mono>:<wall>`; jeder andere Browser sieht **genau dieselben Rahmen wie bisher**
  (eine ältere App würde einen Textrahmen, den sie nicht kennt, an die nächste Zeile kleben und den Bericht
  verlieren – deshalb ist es nie vorgegeben). Jeder andere Wert von `stamp` (oder gar keiner) ist ein Browser ohne
  Stempel; die Aufzeichnung am Relais bekommt nie einen.
- **`mono`** sind Millisekunden mit drei Nachkommastellen auf der **monotonen Uhr** des Pi (`process.hrtime`, unter Linux
  `CLOCK_MONOTONIC` – die Uhr, in der ustreamer seine eigenen Zeiten angibt; die Aufnahmezeit eines Bildes nimmt er aus dem V4L2-Treiber, meist
  dieselbe Uhr – ob das auf diesem Pi stimmt, ist ungeprüft), **`wall`** die Uhrzeit des Pi in
  Millisekunden seit 1970 (`Date.now()`). Beides wird beim Eintreffen der Nachricht am Pi **einmal** gelesen und gilt für
  alle Browser, die Stempel wollen. Der Stempel gehört zur Nachricht direkt dahinter – auch zu einer Meldung, die keine
  Position ist; die App wirft ihn dann weg.
- **Die App** (`fluidnc-client`) nimmt `STAMP:` mit streng geprüften Zahlen an, merkt ihn bis zum nächsten Rahmen und gibt
  ihn dem Bericht mit, der in diesem Rahmen steht (steht ein Bericht auf zwei Rahmen verteilt, gilt der Stempel des
  Rahmens, in dem er anfing). Ein fehlerhafter Stempel gilt als Meta-Meldung und wird verworfen; ein Stempel, auf
  dessen Rahmen die Verbindung nicht mehr wartet, geht mit der Verbindung. Im Speicher der App steht er als
  `useMachine.statusStamp` – im selben Schritt wie `status`, und `null` für einen Bericht ohne Stempel (Simulator, FluidNC
  direkt, ein älterer Companion, der den unbekannten Parameter ignoriert).
- **`GET /api/health`** meldet `stamps: true` (diese Version stempelt auf Wunsch). Ein älterer Companion hat das Feld nicht; die App
  bleibt dann bei der Uhr des Browsers. Die Uhr des Pi selbst steht **nicht** in der Antwort (sie ist ohne Anmeldung für jede Seite
  lesbar, und die Betriebszeit des Pi braucht keine Seite): der Scan prüft die Uhren gegen den Stempel des neuesten Berichts
  (`domainFits`, `docs/scan.md`), nicht gegen eine Zeit aus `/api/health`.
- **Was das nicht kann:** der Stempel sagt, wann der **Pi** die Nachricht bekam. Der Weg Jackpot → Pi (WLAN, jitternd), die
  Zeit, die FluidNC für Messen und Senden braucht, und die Verzögerung der Kamera bleiben unbekannt (die letzte lernt der
  Scan selbst).

## Sensoren anschließen

Der Companion rechnet nicht selbst mit der Hardware; ein kleines Skript liest die Sensoren und
meldet die Werte per HTTP. Format:

```json
{ "load": 63.5, "rpm": 18000, "accel": [0.01, -0.02, …], "sampleRate": 2000 }
```

Alle Felder sind optional. `load` in Prozent, `accel` ein Block Beschleunigungswerte (mindestens 64,
eine Achse oder Betrag) mit `sampleRate` in Hz. Der Companion erkennt Rattern per FFT (starke Spitze
außerhalb der Drehzahl- und Zahneingriffs-Harmonischen).

**Spindellast über RS485 (VFD-Spindel, Modbus):** Beispiel mit Python und `minimalmodbus` für einen
Huanyang-kompatiblen Umrichter – Register und Skalierung stehen im Handbuch des Umrichters:

```python
import time, requests, minimalmodbus
vfd = minimalmodbus.Instrument('/dev/ttyUSB0', 1)
vfd.serial.baudrate = 9600
while True:
    current = vfd.read_register(0x0003, 1)  # Ausgangsstrom in A (Beispiel)
    load = current / 4.5 * 100              # Nennstrom der Spindel eintragen
    requests.post('http://localhost:8080/api/sensors', json={'load': load}, timeout=1)
    time.sleep(0.25)
```

**Vibration (Rattern) mit LSM6DSO:** SparkFun-Platine per Qwiic-Kabel (oder 4 Adern, ≤ 1 m) an den
Pi: 3,3 V → Pin 1, SDA → Pin 3, SCL → Pin 5, GND → Pin 6. Die Platine starr an der Z-Achse bzw.
der Fräserhalterung verschrauben. `scripts/pi/lsm6dso.py` (vom Einrichtungsskript nach
`~/lowrider/current/` abgelegt) liest den FIFO des Sensors mit 3,33 kHz, ±8 g, und meldet alle 250 ms einen
Block an den Companion. Erst prüfen:

```sh
i2cdetect -y 1                          # 6b (SparkFun) oder 6a muss erscheinen
python3 ~/lowrider/current/lsm6dso.py --selftest # Schwerkraft ≈ 1,000 g
sudo systemctl enable --now lowrider-sensor
```

Das Programm ist noch nicht am echten Sensor getestet. Kommen keine Werte, hilft `--no-burst`
(FIFO Wort für Wort lesen); bei „FIFO overran“ `--rate 1667`. Die Optionen stehen in
`python3 lsm6dso.py --help`; geändert werden sie in `/etc/systemd/system/lowrider-sensor.service`.

Die LowRider mit Fräsmotor (Makita o. ä.) hat keinen Lastausgang; dann bleibt der Lastbalken aus,
Rattererkennung funktioniert trotzdem mit dem Beschleunigungssensor.

## Belichtung und Bild der Kamera aus der App

_Einstellungen → Kamera → Belichtung und Bild_ stellt die USB-Kamera am Pi ein – Belichtung, Verstärkung, Helligkeit, Weißabgleich,
Fokus –, statt per SSH `v4l2-ctl` zu tippen. Der Companion ruft dafür `v4l2-ctl` auf dem Gerät auf, das auch `ustreamer` streamt
(`CAMERA_DEVICE`, Standard `/dev/video0`). Die Karte erscheint nur, wenn ein Companion antwortet, der es kann (`cameraControls: true` in
`/api/health`; ein älterer zeigt keine Karte – _Einstellungen → Verbindung → Update des Pi_). `v4l2-ctl` selbst bringt `setup.sh` mit dem
Paket `v4l-utils` mit.

**Was gilt, steht auf der Kamera, nicht in der App.** Namen, Wertebereiche, Schrittweiten und Auswahllisten liest der Companion bei
jeder Anfrage von der Kamera (`v4l2-ctl -d <Gerät> --list-ctrls-menus`); nichts davon ist fest eingebaut, sie unterscheiden sich von
Kamera zu Kamera. Die App zeigt, was die Kamera meldet, und nach jedem Setzen **den Wert, den die Kamera zurückliest** – rundet oder
begrenzt sie, steht dort ihr Wert, und die Karte sagt es.

| Methode und Pfad           | Zweck                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/camera/controls` | `{controls: […]}`: je Regler `name`, `type` (`int`, `bool`, `menu`), `min`, `max`, `step`, `default`, `value`, `inactive`, `readOnly`, bei `menu` die `menu`-Einträge `{value, label}`              |
| `PUT /api/camera/controls` | `{controls: {name: Zahl}}` → `{controls: […], results: {name: {ok, value} \| {ok: false, error: "refused:<warum>"}}}` – die Liste ist **nach dem Setzen neu gelesen**, `value` ist der Rücklesewert |

**Was gesetzt werden darf – und nur das:** `auto_exposure`, `exposure_time_absolute`, `exposure_dynamic_framerate`, `gain`, `brightness`,
`contrast`, `saturation`, `sharpness`, `white_balance_automatic`, `white_balance_temperature`, `focus_automatic_continuous`,
`focus_absolute`, `backlight_compensation`, `power_line_frequency` – dazu die alten Namen derselben Regler (`exposure_auto`,
`exposure_absolute`, `exposure_auto_priority`, `white_balance_temperature_auto`, `focus_auto`), weil ältere Kerne sie so nennen.
Ein Name muss auf dieser Liste **und** in dem stehen, was die Kamera eben gemeldet hat. Alles andere (`hue`, `gamma`, Schwenken,
Zoom …) wird gemeldet, aber nie gesetzt und nicht angezeigt.

**Jeder Wert wird geprüft, nie zurechtgerückt:** ganze Zahl im Bereich `min…max` auf dem Raster von `step` (vom Minimum aus), ein
Schalter 0 oder 1, eine Auswahl nur mit einem Wert ihrer Einträge (die Einträge liegen oft weit auseinander: bei `auto_exposure` meist
nur 1 und 3). Ein Regler, der gerade **inaktiv** ist, wird abgelehnt (`refused:inactive`): die Belichtungszeit, solange die
Belichtungsautomatik an ist, die Farbtemperatur bei automatischem Weißabgleich, der Fokus bei Autofokus. Darum setzt der Companion in
einer Anfrage zuerst die **Schalter** (`auto_exposure`, `white_balance_automatic`, `focus_automatic_continuous` und ihre alten Namen),
liest die Liste neu und erst dann den Rest. Gründe einer Ablehnung (`refused:<warum>`): `not-allowed`, `unknown` (die Kamera meldet ihn
nicht), `read-only`, `inactive`, `range`, `step`, `menu`, `driver` (die Kamera hat den Wert nicht angenommen).

**Einheit:** `exposure_time_absolute` (alt `exposure_absolute`) zählt nach der V4L2-Beschreibung in Einheiten von **100 µs** – 10 sind
1 ms. Nur dieser Regler wird in der App in **Millisekunden** gezeigt und eingegeben; bei jedem anderen steht die Zahl der Kamera, ohne
Umrechnung. Die Belichtungszeit gilt nur bei manueller Belichtung (`auto_exposure` = _Manuell_, Wert 1); die Kamera kann sie durch die
Bildrate begrenzen.

**Grenzen:** eine Anfrage trägt höchstens 12 Regler und 4 KB (die Strecke prüft das, bevor sie den Rumpf liest); höchstens ein
Schreibvorgang je 500 ms (sonst `429 rate-limited`, die App wartet 0,6 s zwischen zwei und versucht es einmal neu); jeder
`v4l2-ctl`-Aufruf höchstens 3 s und nur einer zur selben Zeit (Leseanfragen, die zusammen warten, teilen sich einen Aufruf). Aufgerufen wird es mit `execFile` und festen Argumenten
(`-d <Gerät> --list-ctrls-menus`, `-d <Gerät> --set-ctrl <name>=<ganze Zahl>`), nie über eine Shell; das Gerät kommt nur aus der
Umgebung (`CAMERA_DEVICE`), aus der Anfrage nur Name und Zahl eines geprüften Reglers.

**Offen, wie die Weiterleitung und die Bibliotheken – keine Anmeldung nötig.** Die Anmeldung schützt nur das Aufspielen von Code, das
Herunterfahren und sich selbst. Diese Regler ändern nur, wie die Kamera ihr Bild macht, nichts an der Maschine; **die Liste und die
Bereiche, die die Kamera meldet, sind die Grenze.** Wer im Werkstattnetz eine Seite öffnet, könnte also Belichtung und Verstärkung
verstellen – die Kamera bliebe unbeschädigt, das Bild dunkler oder heller.

**Wann was gilt:**

- **Sofort** nach dem Setzen, auch für den laufenden Stream: `v4l2-ctl` greift ein zweites Mal auf das Gerät zu, das `ustreamer` hält –
  UVC-Treiber erlauben das üblicherweise; **an einer Kamera nicht geprüft**.
- **Neustart von `ustreamer`:** UVC-Kameras behalten die Regler meist; das wurde hier **nicht an einer Kamera geprüft**.
- **Abziehen der Kamera oder Neustart des Pi:** die Kamera fällt auf ihre Werte zurück. Der Companion merkt sich dafür **die zuletzt
  angewendeten Werte** (in der eigenen Datenbank, Tabelle `settings`, Schlüssel `cameraControls` – kein Dokument des Abgleichs, die
  tägliche Sicherung deckt es ab; gemerkt wird der **Rücklesewert**, nur von erfolgreich gesetzten Reglern) und setzt sie **beim Start
  des Companion** wieder – nach 2 s, bei fehlender Kamera noch zweimal im Abstand von 10 s –, nur Regler, die die Kamera noch meldet,
  noch annimmt und die abweichen. Ein Fehler kommt ins Log (`journalctl -u lowrider-companion`) und hält den Start nie auf.
- **Abziehen ohne Neustart des Pi:** nicht von allein zurückgesetzt – _Companion neu starten_ (`sudo systemctl restart lowrider-companion`)
  oder die Werte in der App noch einmal setzen.

**Fehler, die die App in Worten sagt** (`error` im Körper der Antwort): `no-v4l2` (501: `v4l2-ctl` fehlt – `sudo apt-get install
v4l-utils`, dafür braucht der Pi einmal Internet; `setup.sh` läuft ohne Internet weiter, wenn nur Nebenpakete fehlen), `no-device`
(503: das Gerät gibt es nicht – angesteckt? `CAMERA_DEVICE` in `/etc/lowrider.env`), `no-permission` (403, s. u.), `timeout` (504),
`failed` (502: `v4l2-ctl` meldet einen anderen Fehler, der Text steht in `detail`), `bad-request` (400), `rate-limited` (429, mit
`Retry-After`), `not-supported` (501: mit `LOWRIDER_CAMERA_CONTROLS=0` abgeschaltet). Ob der Companion die Kamera öffnen darf, wird am
Gerät selbst entschieden (Lesen und Schreiben), **nicht** aus einer Meldung beim Setzen: der Treiber antwortet auf das Setzen eines
inaktiven Reglers ebenfalls mit „Permission denied“ – das ist dann `refused:driver`, kein Rechteproblem.

**Rechte (`no-permission`):** Der Dienst `lowrider-companion` läuft als der Benutzer, der `setup.sh` gestartet hat (`User=$USER_NAME`
in der Unit, das ist `$SUDO_USER`, sonst `$USER`; meist `pi`). `setup.sh` trägt genau diesen Benutzer in die Gruppen `i2c` und `video`
ein (`sudo usermod -aG i2c,video`) – schon die erste Fassung tat das –, und startet den Dienst danach neu, denn eine Gruppe gilt erst
für einen **neuen** Prozess. Meldet die App trotzdem `no-permission` (Setup als `root` ohne `sudo` gelaufen, ein anderes Gerät mit
`--camera`, ein von Hand angelegter Benutzer), am Pi einmal:

```sh
systemctl show -p User lowrider-companion     # der Benutzer des Dienstes, z. B. User=pi
ls -l /dev/video0                              # gehört der Gruppe video, Gruppe darf lesen und schreiben (crw-rw----)
sudo usermod -aG video pi                      # statt pi: der Benutzer von oben
sudo systemctl restart lowrider-companion      # die Gruppe gilt erst für den neuen Prozess
```

(Der Kamera-Dienst `lowrider-camera` läuft als eigener `DynamicUser` mit `SupplementaryGroups=video` – der ist nicht gemeint.)
Aufgespielte Updates ändern weder `setup.sh` noch eine Unit; fehlen einem Pi, der nur über die App aktualisiert wurde, `v4l-utils`
oder die Gruppe, bleibt es bei diesen zwei Handgriffen.

**Nicht geprüft:** an einer echten Kamera. Auf dem Rechner, auf dem das gebaut wurde, war `v4l2-ctl` nicht installiert; die Beispielausgabe
in `apps/companion/test/camera.test.ts` ist nach dem Format von v4l-utils 1.22 aufgeschrieben, **nicht** von einer Kamera mitgeschnitten, und
dass `--list-ctrls-menus` die Einträge der Auswahllisten ausgibt, ist aus der Beschreibung des Programms gelesen. Beim ersten Mal an der
Maschine: `v4l2-ctl -d /dev/video0 --list-ctrls-menus` am Pi und mit der Karte vergleichen; was die Kamera dort an Namen und Bereichen
meldet, ist maßgeblich.

## Kamera am Fräskopf

Die Kamera fährt mit der Z-Achse mit; ihr Bild kommt per WLAN als MJPEG-Stream. Zwei Wege:

**ESP32-CAM** (wenige Euro, eigenes WLAN-Modul, 5 V vom Jackpot oder einem kleinen Netzteil): Das
Beispielprogramm „CameraWebServer“ der Arduino-ESP32-Bibliothek liefert den Stream unter
`http://<ip>:81/stream` und erlaubt den Zugriff von anderen Seiten. Ein ESP32-CAM bedient nur
einen Betrachter gleichzeitig – die App öffnet deshalb nur eine Verbindung.

**USB-Kamera am Companion-Pi** (z. B. Waveshare IMX335 5MP USB Camera (A)): Das Einrichtungsskript
startet [ustreamer](https://github.com/pikvm/ustreamer) als Dienst `lowrider-camera`; er reicht das
MJPEG der Kamera ohne Umrechnen weiter, der Pi 4 bleibt kühl. Von Hand:

```sh
ustreamer --device=/dev/video0 --format=MJPEG --encoder=HW --resolution=1920x1080 \
  --host 0.0.0.0 --port 8081 --allow-origin '*'
```

In der App: _Einrichten → Kamera → Stream-Adresse_ (`http://<esp32-ip>:81/stream` bzw.
`http://lowrider.local:8081/stream` – vom Companion ausgeliefert steht sie schon drin), dann
_Companion-Stream_. Das Bild erscheint auf der Bühne.
Danach einmal kalibrieren: _Maßstab_ (Merkmal antippen, X +10 mm, Merkmal erneut antippen) und
_Versatz_ (mit dem Fräser eine kleine Markierung setzen, _Position merken_, Kamera darüberfahren,
Markierung antippen). Der Maßstab gilt für die Höhe, in der er kalibriert wurde: die App merkt sie
sich (_Kamerahöhe_, bezogen auf Z0 auf der Werkstückoberfläche), warnt bei mehr als 0,5 mm
Abweichung und fährt auf Wunsch dorthin. `--allow-origin`
ist nötig, damit Zeitraffer-Bilder gespeichert werden dürfen. Eine Kamera direkt am Tablet
(_Gerätekamera_) funktioniert nur, wenn die App per Datei, `localhost` oder `https` geöffnet ist.

## Benachrichtigungen

ntfy-Server auf dem Pi (oder ntfy.sh), App „ntfy“ auf dem Handy, Thema abonnieren. In der App:
_Reiter Einstellungen → Maschine → Werkstatt und Benachrichtigungen → Über den Companion_ → Thema-Adresse eintragen,
_Im Companion speichern_, _Testnachricht senden_.
