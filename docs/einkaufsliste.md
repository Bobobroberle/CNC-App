# Einkaufsliste

Stand 2026-10-25. Preise sind grobe Richtwerte und nicht bei jedem Händler geprüft; vor dem Kauf
vergleichen. AliExpress ist oft günstiger, braucht aber 2–4 Wochen.

Ausgangslage: Raspberry Pi 4 B (1 GB) sitzt mit auf der Maschine (Companion + Kamera in einem), die
Kamera am Fräskopf hängt per USB-Kabel am Pi, das iPad bedient die App.

## 1. Grundausstattung (Companion + Kamera)

| ✓   | Teil                                                                                      | Wofür                                                           | Wo kaufen                                      | ca. €   |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- | ------- |
|     | Raspberry Pi 4 B, 1 GB                                                                    | Companion, Kamera-Stream                                        | vorhanden                                      | –       |
|     | microSD 32 GB „High Endurance“ (SanDisk / Samsung PRO Endurance)                          | Dauerbetrieb, Datenbank                                         | Berrybase, Reichelt, Amazon                    | 10–15   |
|     | Passives Alu-Kühlgehäuse für den Pi 4                                                     | Wärme, Schutz vor Spänen                                        | Berrybase                                      | 10–20   |
|     | Mean Well DDR-15G-5 (9–36 V → 5 V / 3 A, Hutschiene)                                      | Strom für den Pi aus dem Netzteil der Maschine                  | Reichelt, RS, TME, Distrelec                   | 25–30   |
|     | Feinsicherungshalter + Sicherung 1 A träge                                                | Absicherung vor dem Wandler                                     | Reichelt                                       | 3–5     |
|     | USB-C-Stecker mit Schraubklemmen + Litze 0,75 mm²                                         | 5 V vom Wandler in den Pi                                       | Berrybase, Amazon                              | 5–10    |
|     | Arducam B0438 (2 MP AR0230, USB, M12, manueller Fokus)                                    | Kamera am Fräskopf                                              | Arducam-Shop, Amazon, welectron                | 40–60   |
|     | M12-Objektiv 6 mm, „low distortion“ (am besten auch 8 mm)                                 | weniger Verzerrung, feinere Auflösung als das 2,8-mm-Weitwinkel | Berrybase (M12-Objektive), Arducam, AliExpress | 5–15 je |
|     | USB-Kabel hochflexibel, 3 m (Silikon oder schleppkettenfähig), Stecker passend zur Kamera | Kamera → Pi über die Achse                                      | Amazon; igus (chainflex, teurer)               | 10–25   |
|     | LED-Ringlicht 5 V (USB), 40–60 mm                                                         | gleichmäßiges Licht für Kanten                                  | Amazon (Mikroskop-Ringlicht)                   | 10–15   |
|     | Kamerahalter aus PETG/ASA, M3-Schrauben, Einschmelzmuttern                                | starr an der Fräserhalterung                                    | selbst drucken, Baumarkt                       | 5       |
|     | Gewebe- oder Spiralschlauch, Kabelbinder, Zugentlastung                                   | Kabelführung                                                    | Baumarkt, Amazon                               | 10      |

Vorher prüfen: Spannung des Maschinennetzteils (12 oder 24 V – der Wandler kann beides) und welchen
USB-Stecker die Kamera hat.

### Bestellung bei Berrybase (Artikelnummern)

Aus dem Suchindex von Berrybase zusammengestellt; Verfügbarkeit und Preis vor der Bestellung auf der
Produktseite prüfen. Berrybase führt keine Arducam-USB-Kamera – die Waveshare IMX335 (A) ersetzt sie.

| Artikel-Nr.    | Artikel                                          | Hinweis                                                              |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `WS-18584`     | Waveshare IMX335 5MP USB Camera (A)              | Kamera: USB, MJPEG 1080p30, manueller Fokus, ca. 4 mm / 106°         |
| `M12LENS-8`    | 8mm Objektiv, M12-Mount                          | nur, wenn der Objektivhalter der Kamera M12 ist (nach Erhalt prüfen) |
| `619659173067` | SanDisk High Endurance microSDHC 32GB + Adapter  | Systemkarte für den Pi                                               |
| `RPI4-FLIRC`   | FLIRC Case, Aluminium, Raspberry Pi 4            | passiv gekühlt, das ganze Gehäuse ist Kühlkörper                     |
| `125467`       | USB 2.0 Typ C Stecker, gerade, für DIY USB Kabel | 5 V vom Wandler in den Pi (zum Anlöten)                              |

Zur Kamera (Vergleich November 2026): Die App rechnet die Verzeichnung des Objektivs nicht heraus.
Besser als die IMX335 (A) passt deshalb die **Waveshare OS05A10 5MP USB Camera (A)** (SKU 33123,
Verzeichnung unter 0,2 %, fester Fokus, 96°; günstig mit demselben Objektiv: OV2735 2MP (A), SKU 33122).
Die IMX335 (A) bleibt brauchbar – genau gemessen wird in der Bildmitte –, wenn die Linse nach dem
Scharfstellen mit einem Tropfen Lack gesichert wird (sie ist nicht verklebt). Nicht nehmen: IMX378 12MP
(Autofokus verändert den Maßstab).

Nicht nehmen: die IMX335-Variante mit 175° Fischauge und Fixfokus, die OV5640-Kamera mit Autofokus
(`WS-21635`) und die IMX179-Kamera mit 145° – zu weitwinklig bzw. Autofokus.

Nicht bei Berrybase: Mean Well DDR-15G-5 und Sicherungshalter (Reichelt), LSM6DSO (Eckstein),
flexibles USB-Kabel, LED-Ring, Tastplatten (Amazon/AliExpress).

## 2. Antasten

| ✓   | Teil                                                                         | Wofür                                                                                                                                                           | Wo kaufen                          | ca. €  |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------ |
|     | Z-Tastplatte mit Klemme                                                      | Z antasten                                                                                                                                                      | vermutlich vorhanden (WebUI-Werte) | –      |
|     | XYZ-Ecken-Tastplatte aus Alu                                                 | Ecke/Kante bei Holz – Holz leitet nicht, die Platte schon                                                                                                       | Amazon, AliExpress                 | 20–35  |
|     | Werkzeuglängensensor, Schließer (NO) – optional                              | Werkzeugwechsel ohne Platte                                                                                                                                     | Amazon, AliExpress                 | 20–40  |
|     | Glas-Kalibrierplatte mit Punkteraster, ca. 200 × 200 mm, ±0,01 mm – optional | Maßstab und Winkel der Maschine mit der Kamera (_Reiter Service → Kalibrieren_); für den Winkel allein genügt der Ausdruck `docs/kalibriertafel.svg` | AliExpress, Optik-Händler          | 30–100 |

Tastplatte und Längensensor kommen parallel an den Probe-Eingang des Jackpot (`gpio.36` laut
`machine/config.yaml`). Für die XYZ-Platte im Tastassistenten _Ecken-Tastplatte_ wählen und
Plattendicke oben und Wandstärke seitlich eintragen (Maße der Platte, mit dem Messschieber).

## 3. Sensoren (optional, Stufe 5)

| ✓   | Teil                                                                                                                                   | Wofür                                             | Wo kaufen                                   | ca. € |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------- | ----- |
|     | SparkFun 6DoF LSM6DSO (Qwiic) + Qwiic-Kabel bzw. 4-adriges geschirmtes Kabel ≤ 1 m – Alternativen: Adafruit LSM6DSOX, ADXL345 (GY-291) | Rattererkennung (I²C am Pi)                       | Eckstein; Adafruit-Händler; eBay/AliExpress | 8–25  |
|     | Stromzange SCT-013-030 + ADS1115-Breakout                                                                                              | Last des Fräsmotors (Makita o. ä.) ohne Umrichter | Amazon, Eckstein                            | 20–30 |
|     | Leitungstrenner („AC Line Splitter“) für die Stromzange                                                                                | Messen, ohne die Netzleitung zu öffnen            | Amazon                                      | 10–15 |
|     | USB-RS485-Adapter – nur bei späterer VFD-Spindel                                                                                       | Spindellast über Modbus                           | Berrybase, Amazon                           | 10    |

Netzspannung: Die Stromzange wird nur um eine Ader des Leitungstrenners gelegt; keine
Netzleitung aufschneiden.

## 4. Bedienung (optional)

| ✓   | Teil                                   | Wofür                | Wo kaufen  | ca. € |
| --- | -------------------------------------- | -------------------- | ---------- | ----- |
|     | Tablet-Halterung (Klemme/Schwanenhals) | iPad an der Maschine | Amazon     | 20–40 |
|     | Gamepad (Xbox/PlayStation, Bluetooth)  | Joggen per Gamepad   | vorhanden? | –     |

## Summe (grob)

- Grundausstattung: etwa 150–220 €
- Antasten: etwa 20–75 €
- Sensoren: etwa 40–65 €
