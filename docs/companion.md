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
   Während die Maschine fährt, ist der Knopf gesperrt. Das Skript erlaubt dem Companion dafür
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

| Variable                           | Bedeutung                                                              | Standard                                    |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| `PORT`, `HOST`                     | Adresse des Servers                                                    | `8080`, `0.0.0.0`                           |
| `LOWRIDER_DB`                      | SQLite-Datei                                                           | `data/lowrider.db`                          |
| `LOWRIDER_APP`                     | Ordner mit `index.html` der App                                        | –                                           |
| `FLUIDNC_URL`                      | WebSocket des Jackpot für die Weiterleitung `/fluidnc`                 | – (aus)                                     |
| `CAMERA_URL`                       | Kamera-Stream für die App; `:8081/stream` = Port auf demselben Rechner | –                                           |
| `SENSOR_SIMULATOR`                 | `1` = simulierte Spindellast und gelegentliches Rattern                | aus                                         |
| `LOWRIDER_SHUTDOWN`                | `0` = _Pi herunterfahren_ aus der App abschalten                       | an                                          |
| `LOWRIDER_RECORDINGS`              | `0` = Mitschnitt abschalten                                            | an (braucht ffmpeg)                         |
| `RECORD_STREAM`, `RECORD_SNAPSHOT` | ustreamer auf diesem Rechner für den Mitschnitt                        | `http://127.0.0.1:8081/stream`, `/snapshot` |
| `LOWRIDER_BACKUP`                  | `0` = die tägliche Datensicherung der Datenbank abschalten             | an                                          |
| `LOWRIDER_BACKUP_DIR`              | Ordner der Sicherungen – **besser ein zweites Medium (USB-Stick)**     | `backups/` neben der Datenbank              |
| `LOWRIDER_BACKUP_KEEP`             | Wie viele Tagessicherungen bleiben                                     | `7`                                         |

**Datensicherung:** einmal am Tag (und beim Start, wenn die von heute fehlt) macht der Companion eine vollständige Kopie der
Datenbank (`lowrider-JJJJ-MM-TT.db`: Werkzeuge, Materialien, Nullpunkte, Historie, abgelegte Jobs …) in einem eigenen Prozess,
damit Weiterleitung, PAUSE und NOT-HALT nicht darauf warten. Er beginnt keine Kopie, die nicht auf die Platte passt (Platz für
das 1,25-Fache der Datenbank muss frei sein, und danach müssen noch 1 GB bleiben, weil der Mitschnitt darunter aufhört) und meldet das; die App zeigt im Kasten _Companion_ die letzte Datei oder den
Grund des Fehlschlags. **Liegt der Ordner auf derselben Karte wie die Datenbank, schützt das vor einer beschädigten oder
versehentlich geleerten Datenbank – nicht vor dem Tod der Karte.** Ist `LOWRIDER_BACKUP_DIR` gesetzt, wird nur der letzte Ordner angelegt, nie sein Weg: fehlt das Medium (der Stick steckt nicht), meldet der Kasten einen Fehler, statt die Kopien heimlich auf die Karte zu schreiben. Zurückspielen: Companion anhalten, die Datei als
`lowrider.db` an die Stelle von `LOWRIDER_DB` kopieren (die Dateien `…-wal` und `…-shm` daneben löschen), Companion starten.

## Schnittstelle

| Methode und Pfad                            | Zweck                                                                |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/health`                           | Version, Weiterleitung, Sensorquelle, Kamera-Stream                  |
| `POST /api/system/shutdown`                 | Pi herunterfahren (antwortet erst, fährt dann nach 0,5 s)            |
| `GET/PUT/DELETE /api/library/:sammlung/:id` | tools, materials, zeros, jigs, macros, history, learning, profiles … |
| `POST /api/library/:sammlung`               | mehrere Einträge auf einmal (Import)                                 |
| `GET/PUT/DELETE /api/jobs/:name`            | Job-Puffer (G-Code als Text)                                         |
| `GET/PUT /api/notify`, `POST /api/notify`   | Benachrichtigung einstellen bzw. senden                              |
| `GET/POST /api/sensors`                     | letzter Sensorwert bzw. neuen Wert melden                            |
| `WS /api/sensors/stream`                    | Sensorwerte live                                                     |
| `WS /fluidnc`                               | Weiterleitung zum Jackpot                                            |
| `GET /api/recordings`                       | Aufnahmen, laufende Aufnahme, ffmpeg/Video-Chip vorhanden            |
| `POST /api/recordings/start`, `/stop`       | Mitschnitt starten (`mode`, `intervalSeconds`, …) bzw. beenden       |
| `GET /api/recordings/:id/file?kind=…`       | `video` oder `timelapse` als MP4 (mit Range, für iPad/Safari)        |
| `DELETE /api/recordings/:id`                | Aufnahme löschen                                                     |

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
`~/lowrider` kopiert) liest den FIFO des Sensors mit 3,33 kHz, ±8 g, und meldet alle 250 ms einen
Block an den Companion. Erst prüfen:

```sh
i2cdetect -y 1                          # 6b (SparkFun) oder 6a muss erscheinen
python3 ~/lowrider/lsm6dso.py --selftest # Schwerkraft ≈ 1,000 g
sudo systemctl enable --now lowrider-sensor
```

Das Programm ist noch nicht am echten Sensor getestet. Kommen keine Werte, hilft `--no-burst`
(FIFO Wort für Wort lesen); bei „FIFO overran“ `--rate 1667`. Die Optionen stehen in
`python3 lsm6dso.py --help`; geändert werden sie in `/etc/systemd/system/lowrider-sensor.service`.

Die LowRider mit Fräsmotor (Makita o. ä.) hat keinen Lastausgang; dann bleibt der Lastbalken aus,
Rattererkennung funktioniert trotzdem mit dem Beschleunigungssensor.

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
