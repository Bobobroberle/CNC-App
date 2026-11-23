# LowRider Control als App auf dem iPad

Die Steuerung ist eine Web-App. Auf dem iPad wird sie zur **Home-Bildschirm-App**: eigenes Symbol,
Vollbild ohne Safari-Leisten, bedient mit den Fingern. Dafür braucht es keinen Mac, kein
Apple-Entwicklerkonto und kein Internet – nur den Raspberry Pi an der Maschine, der die App
ausliefert (siehe [companion.md](companion.md)).

## Einrichten (einmal)

1. Pi wie gewohnt aktualisieren: am PC `pnpm bundle`, den Ordner `release/pi` auf den Pi kopieren,
   dort `bash ~/pi/setup.sh --fluidnc …`. Neu im Ordner ist `app/` mit Symbol, Startbildern und
   `manifest.webmanifest`; das Skript legt sie neben die Seite.
2. Am iPad **Safari** öffnen (nicht Chrome): `http://192.168.0.198:8080`.
3. Oben erscheint einmal die Zeile _Als App aufs iPad …_. **Teilen** antippen (Quadrat mit Pfeil
   nach oben), dann **Zum Home-Bildschirm** → _Hinzufügen_. Falls ein Schalter _Als Web-App öffnen_
   angeboten wird: eingeschaltet lassen.
4. Ab jetzt über das Symbol **LowRider** starten. Die App füllt den ganzen Bildschirm; oben bleibt
   nur die Statusleiste des iPad (Uhr, WLAN, Akku).

Die Home-Bildschirm-App hat ihren **eigenen Speicher**: Einstellungen, die vorher in Safari gemacht
wurden, sind dort nicht automatisch vorhanden. Mit dem Pi ist das kein Problem – Werkzeuge,
Materialien und Nullpunkte kommen über _Einstellungen → Verbindung → Companion → Bibliotheken
abgleichen_; das Maschinenprofil über _Profil teilen_.

## Bedienen mit den Fingern

| Wo                         | Geste                                                                          |
| -------------------------- | ------------------------------------------------------------------------------ |
| Tisch                      | ein Finger schiebt, zwei Finger zoomen und schieben, Doppeltipp passt ein      |
|                            | (aus der eingepassten Ansicht: Doppeltipp zoomt auf die Stelle)                |
| Kamera                     | zwei Finger zoomen ins Bild, Doppeltipp zoomt auf die Stelle und zurück        |
| 3D                         | ein Finger dreht, zwei Finger schieben und zoomen, Doppeltipp zeigt alles      |
| Zeichnung (Job → Zeichnen) | ein Teil an seiner Linie fassen und schieben (Text: irgendwo im Schriftzug);   |
|                            | Tipp wählt aus, Tipp daneben lässt los; in einer Fläche schiebt der Finger     |
|                            | wie immer die Ansicht. Das gewählte Teil hat Griffe: Ecke/Seite ändert die     |
|                            | Größe, der Punkt darüber dreht; ein zweiter Finger lässt den Griff los         |
| Bedienfeld rechts / unten  | hoch/runter rollt, seitlich wischen wechselt die Ansicht im Schritt            |
| _Großbild_ (über dem Bild) | Bühne über die ganze Breite; ein Raum in der Leiste holt das Bedienfeld zurück |
| _Suchen_ (oben, Lupe)      | Schnellsuche: ein Wort tippen, eine Zeile antippen – die App geht zur Stelle   |

Ein kurzer Tipp gibt dem gewählten Werkzeug (_Hinfahren_, _Nullpunkt_, _Messen_, _Spannmittel_)
einen Punkt – nie das Ende eines Schiebens oder Zoomens. Was schon auf dem Bild liegt, lässt sich
mit dem Finger nehmen: ein Messpunkt, die Nullpunkt-Marke, eine Spannmittel-Markierung (Fläche
verschiebt, Ecke ändert die Größe). Daneben schiebt derselbe Finger wie immer die Ansicht. In der
Lupe des Nullpunkt-Werkzeugs verschiebt Ziehen die Marke fein (12-fach untersetzt).

Die **Schnellsuche** liegt unter der Kopfzeile, nicht darüber: NOT-HALT bleibt sichtbar und ein
Tipp. Mit der Bildschirmtastatur schrumpft sie auf den freien Teil, die Treffer bleiben über der
Tastatur. Hochkant zeigt die Kopfzeile nur die Lupe. Tastenkürzel zeigt die App erst, wenn eine
Tastatur da ist (Maus oder erster Tastendruck einer angesteckten Tastatur) – dann gelten `Cmd+K`,
`1`/`2`/`3`, `T`/`K`/`D`, `E` und `?` wie am Laptop.

**Keine Geste bewegt die Maschine.** Bewegung gibt es nur über die Jog-Tasten, den Joystick und
Halten-Tasten. Alles, was gehalten wird, lässt los, sobald der Finger abrutscht, ein zweiter Finger
aufsetzt, iPadOS die Berührung übernimmt (z. B. Wischen vom Rand) oder die App in den Hintergrund
geht. NOT-HALT reagiert beim Aufsetzen des Fingers und bleibt auch mit Bildschirmtastatur sichtbar.

## Bildschirm anlassen

Browser bieten das offizielle „Bildschirm anlassen“ nur auf https-Seiten an; die App kommt vom Pi
aber über http. Deshalb spielt sie, solange die Maschine verbunden ist, ein **stilles, unsichtbares
Video** ab – das hält das iPad wach. Es startet mit der ersten Berührung nach dem Verbinden.
_Reiter Einstellungen → Verbindung_ zeigt, was gerade gilt.

- Läuft Musik oder ein Hörbuch auf dem iPad, kann das stille Video sie unterbrechen.
- Sicher und ohne Trick: am iPad _Einstellungen → Anzeige & Helligkeit → Automatische Sperre → Nie_
  (für die Werkstattzeit).
- Abschalten: _Reiter Einstellungen → Maschine → Werkstatt → Bildschirm anlassen, solange verbunden_.

## Was die App ohne https nicht kann – und was https kosten würde

Ohne https gibt es zwei Dinge nicht: das offizielle „Bildschirm anlassen“ (ersetzt durch das Video)
und den **Start ohne Netz** (ein „Service Worker“ dürfte die App auf dem iPad zwischenspeichern).
Ohne Pi und WLAN lässt sich die Maschine aber ohnehin nicht bedienen; ein eingebauter Service
Worker, der nie laufen darf, wäre nur toter Code. Deshalb gibt es ihn nicht.

https auf dem Pi wäre ein eigener, späterer Schritt:

1. Eigene Zertifizierungsstelle anlegen (z. B. mit [mkcert](https://github.com/FiloSottile/mkcert)
   am PC) und damit ein Zertifikat für `lowrider.local` **und** die IP-Adresse des Pi ausstellen
   (gültig höchstens 825 Tage, dann erneuern).
2. Das Stammzertifikat aufs iPad bringen (AirDrop oder Download), unter _Einstellungen → Profil
   geladen_ installieren und unter _Allgemein → Info → Zertifikatsvertrauenseinstellungen_
   einschalten.
3. Der Companion müsste https/wss sprechen – und **alles** durchreichen, was heute direkt per http
   läuft: den Kamera-Stream (Port 8081), das Hochladen auf die SD-Karte des Jackpot und die
   direkte Verbindung zum Jackpot. Von einer https-Seite aus blockiert der Browser jede
   http/ws-Verbindung ins Werkstattnetz; „direkt mit dem Jackpot verbinden“ ginge dann nicht mehr.

Gewinn: garantiertes Wachbleiben, Start der Oberfläche ohne Netz, die iPad-Kamera als Bildquelle.
**Empfehlung: vorerst nicht.** Der Aufwand (Zertifikate pflegen, Durchreichen bauen) und das
Risiko, sich bei abgelaufenem Zertifikat an der Maschine auszusperren, stehen in keinem Verhältnis
zum Gewinn. Wer das garantierte Wachbleiben braucht, bekommt es einfacher über die iPad-Einstellung
oder später über die native Hülle ([apps/ios](../apps/ios/README.md)).

## Technik in Kürze

- Symbol: `apps/control/icons/icon.svg`; `pnpm icons` erzeugt daraus die PNGs und Startbilder in
  `apps/control/public/` (eingecheckt). Safari holt Symbol und Manifest als **Dateien neben der
  Seite** – sie stecken nicht in der einen HTML-Datei. Aus `file://` geöffnet funktioniert die App
  wie bisher, nur ohne Symbol.
- Gesten: `apps/control/src/lib/gesture.ts` (eine Schicht für Tisch und Kamera, getestet in
  `test/gesture.test.ts`), Halten-Register `lib/holds.ts`, Tastatur/Standalone `lib/platform.ts`.
- Schnellsuche: Tabelle `lib/commands.ts`, Vergleich `lib/search.ts`, Tasten `lib/shortcuts.ts`,
  Oberfläche `components/Find.tsx` (eine Zelle im Raster der App, deshalb folgt sie der Tastatur).
- Touch-Tests: `apps/control/e2e/ipad.spec.ts` (Playwright-Projekt `ipad`, Chromium mit echter
  Mehrfinger-Eingabe). Safari selbst wird dort nicht getestet.
