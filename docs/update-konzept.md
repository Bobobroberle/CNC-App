# Update aus der App und Anmeldung am Pi

**Stand: gebaut** (Entscheidung 41; vorher nur ein Entwurf). Was hier steht, ist das, was im Code ist – und am Ende, was
**nur an einem echten Pi** geprüft werden kann. Bedienung: `docs/companion.md`, Abschnitt „Anmeldung und Update“.

## Die Bedrohungen, gegen die es gebaut ist

1. **Fremder Code im Werkstattnetz:** Der Companion hatte keine Anmeldung. Jetzt braucht das Hochladen von Code, das
   Herunterfahren und die Verwaltung der Anmeldung selbst ein **Gerät mit Token** (`apps/companion/src/auth.ts`). Bibliotheken,
   Zustand (`/api/state`) und die Weiterleitung zur Fräse bleiben offen wie vorher – sie hinter die Anmeldung zu legen hieße, dass
   jedes Gerät, das nie angemeldet wurde, seine Einstellungen nicht mehr sichern könnte.
2. **Beschädigte oder unvollständige Datei:** Der Upload wird im Speicher gelesen und geprüft (`zip.ts`: Größen vor dem
   Entpacken begrenzt, jede Datei gegen ihre CRC, nur schlichte Namen, kein zip64, keine Verschlüsselung, keine Verknüpfungen, keine
   doppelten Namen), dann gegen eine Positivliste auf feste Zielnamen abgebildet (`release.ts`). Auf die Platte kommt erst etwas,
   wenn alles stimmt – in ein Verzeichnis **neben** der laufenden Version.
3. **Eine Fassung, die nicht startet:** drei Stufen. (a) `node companion.mjs --check` läuft auf der neuen Datei: sie muss laden,
   ihren Server bauen und antworten – ohne Port, ohne die echte Datenbank – und sagen, dass sie genau der Build ist, den ihre
   `release.json` nennt. (b) Erst dann zeigt `current` (ein Symlink, atomar umgehängt) auf die neue Version. (c) Startet sie
   trotzdem nicht oder stirbt sie sofort, zählt `guard.sh` (vor jedem Start, `ExecStartPre`) die Starts ohne Bestätigung und stellt
   beim dritten `current` auf `previous` zurück. Eine Fassung, die startet, aber nie antwortet (eine Endlosschleife), fängt
   `health-gate.sh` (`ExecStartPost`): solange eine Probezeit läuft, wartet es 30 s auf die Antwort des Companions (und geht sofort, wenn der Companion schon beendet ist) und beendet sich
   sonst mit Fehler – systemd stoppt ihn dann und startet neu, der Wächter zählt den Start. Fehlt der neuen Version die Programmdatei oder ist sie leer (ein Stromausfall
   gleich nach dem Update kann das hinterlassen – die Dateien werden deshalb vor dem Umhängen auf den Datenträger geschrieben),
   geht der Wächter sofort zurück. Eine Version, die eine halbe Minute gelaufen ist, bestätigt sich selbst (`trial` verschwindet,
   alte Versionen werden aufgeräumt); ein Update, das gerade läuft, hält die Bestätigung an, bis es fertig oder abgelehnt ist.
4. **Downgrade:** nur auf ausdrücklichen Haken („gleiche oder ältere Version“). Der Build ist die Zeit des Commits.

## Was dabei nie passiert

- Das Update aus der App ersetzt **nie** `setup.sh`, `guard.sh`, `health-gate.sh`, `lib.sh`, Dienste, sudoers-Regel oder Pakete. Braucht eine Version
  davon mehr, steht in ihrer `release.json` ein höheres `setupLevel` als das, was `setup.sh` auf dem Pi hinterlassen hat
  (`~/lowrider/setup-level`) – das Update wird abgelehnt („update-pi.bat“).
- Er läuft nicht, solange ein Browser über den Pi an der Maschine hängt oder eine Aufnahme läuft (der Pi lehnt ab; die App trennt
  ihre eigene Verbindung zuerst und fragt ein paar Mal nach).
- Vor jedem Update wird die Datenbank **jetzt** kopiert (nicht die von heute früh; `lowrider-update-JJJJMMTTHHMMSS.db`, die letzten
  zwei bleiben). Gelingt die Kopie nicht (zu wenig Platz), wird nichts geändert.

## Die Anmeldung

Einmal pro Gerät der **Pi-Code** (12 Zeichen aus einem Alphabet ohne Verwechslungen, beim ersten Start erzeugt, in
`~/lowrider/data/pi-code.txt`, nur für den Dienst-Benutzer lesbar; `setup.sh` zeigt ihn zuletzt). Dafür bekommt das Gerät einen
Token (32 Zufallsbytes, der Pi behält nur den SHA-256), den die App unter einem eigenen Schlüssel des Browsers hält – nie in den
Einstellungen, die zum Pi und zu den anderen Geräten gehen – und nur an die Adresse schickt, bei der er entstanden ist. Fünf
falsche Versuche je Adresse in fünf Minuten sperren diese Adresse, 40 von überall alle. Geräte lassen sich einzeln entfernen; der
Code lässt sich erneuern (mit „alle anderen abmelden“).

**Grenze, offen gesagt:** Code und Token gehen im Klartext über http durchs WLAN. Das hält andere Webseiten und Gäste-Geräte
fern, nicht jemanden, der den Funkverkehr mitliest. Wer den Pi-Code kennt, kann Code auf dem Pi ausführen – und wo der Benutzer am
Pi ohne Passwort `sudo` darf (Standard bei Raspberry Pi OS), ist das Root. Das war vorher nicht anders: wer im WLAN ist und das
SSH-Passwort des Pi errät, hat denselben Zugriff. Neu ist ein zweiter Weg zum selben Ziel, geschützt durch den Pi-Code.

## Was nur am echten Pi zu prüfen ist

Hier laufen die Bausteine gegeneinander (`apps/companion/test/pi.test.ts`: echtes Bundle, echte `lib.sh`, `guard.sh` und
`health-gate.sh`, die echten Routen, eine Schleife, die systemd spielt: Wächter, Programm, Neustart) – gute Fassung, Zurückstellen
von Hand, Ablehnung im Probelauf, eine Fassung, die sofort stirbt, und eine, die startet und nie antwortet (Rückfall beim dritten
Start). **Nicht geprüft werden konnte** (eine Liste, dieselbe in `CLAUDE.md` und in Entscheidung 41): `systemd` selbst (`ExecStartPre`,
`ExecStartPost` – dass systemd nach dessen Fehler wirklich neu startet und was `systemctl restart` dann zurückgibt –,
`Restart=always` mit `RestartSec=3`, `TimeoutStopSec`); der Ablauf von `setup.sh` zwischen den ersten Fragen und dem Ende (Pakete,
`sudo`, `visudo`, `raspi-config`, NodeSource, die Dienste, das Warten auf die Antwort und der Rückfall) – von `setup.sh` laufen im
Test nur die Hilfsfunktionen (`lib.sh`), die Fragen vor der ersten Änderung (Jackpot-Adresse, ein Browser an der Maschine) und der
Text der Dienst-Dateien; ein Prüfer ließ den ganzen Ablauf gegen Stubs und ein selbstgebautes Pseudo-systemd laufen, mehr nicht;
`scp`/`ssh` und `cmd.exe` beim Lesen der `update-pi.bat` (sie ist nur als Text geprüft); die Pi-Hardware; die App gegen einen echten
Companion (das e2e benutzt einen von Hand gebauten Pseudo-Pi). Die erste echte Prüfung ist das erste Einspielen.

## Wenn etwas schiefgeht

- **Der Pi antwortet nicht mehr:** Zwei bis drei Minuten warten (der Wächter braucht bis zum dritten Start: eine abgestürzte Fassung ist nach etwa 10 s zurück, eine, die nur nicht antwortet, nach etwa zwei Minuten). Dann
  `update-pi.bat` auf dem PC – es stellt immer wieder auf.
- **Von Hand zurück** (per `ssh pi@lowrider.local`):
  ```bash
  cd ~/lowrider
  ln -sfn "$(readlink previous)" current.tmp && mv -T current.tmp current
  sudo systemctl restart lowrider-companion
  ```
  `previous` nennt die Version, die davor lief (`ls -l` zeigt es; `ls releases` die ganze Liste). Danach zeigen `previous` und
  `current` auf dieselbe Version: die Karte bietet kein „Zurück“ mehr an, und ihre Zeile „Letztes Update“ kann hinterherhinken.
  Nach dem ersten Einspielen auf einen Pi mit alter, flacher Einrichtung heißt die alte Version `legacy-…` und hat keine
  `release.json`: auch dann bietet die Karte kein „Zurück“ an – dieser Befehl ist dort der Weg.
- **Log:** `journalctl -u lowrider-companion -n 80`; der Wächter schreibt dort, wenn er zurückstellt, und in
  `~/lowrider/update-last.json`.
