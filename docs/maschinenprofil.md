# Maschinenprofil der LowRider v4 erfassen

Grundlage ist die `config.yaml` der Maschine ([`machine/config.yaml`](../machine/config.yaml)).
Die App liest sie ein (_Menü → Einstellungen → Maschine → Maschinenprofil_: Datei laden oder per `$CD` von der Maschine) und
übernimmt daraus Verfahrweg, Geschwindigkeiten, Beschleunigungen und das Verhalten der Steuerung
(Soft-Limits, M6, Zeilennummern). Ohne Import gelten die Werte der V1E-Standard-Config.

Der **Verfahrweg** ist der Software-Endschalter der App: Nach der Referenzfahrt kürzt sie jeden Jog
an der Grenze und prüft Jobs dagegen. Er lässt sich auch von Hand korrigieren: jede Achse
vorsichtig an ihr Ende joggen und mit „Aktuelle Position als min/max“ übernehmen. Wichtig: Der
Standardwert Z 300 mm ist zu groß. Den echten Z-Weg messen und auch in der `config.yaml` als
`max_travel_mm` eintragen.

Die Maschine hat **keine A-Achse**. G-Code mit A-Wörtern wird als Fehler markiert.

| Wert                                             | Quelle                                                                 | Wofür                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Verfahrweg X/Y/Z (min/max, Maschinenkoordinaten) | `config.yaml` → `axes.*.max_travel_mm`, Homing-Richtung; nachmessen    | Arbeitsraum-Grenze in der Ansicht, Soft-Limit-Prüfung |
| Max. Geschwindigkeit je Achse                    | `axes.*.max_rate_mm_per_min`                                           | Eilgang-Zeit, Vorschub-Begrenzung                     |
| Beschleunigung je Achse                          | `axes.*.acceleration_mm_per_sec2`                                      | Zeitschätzung                                         |
| Junction Deviation                               | `planner.junction_deviation_mm` (falls gesetzt, sonst Default)         | Kurvengeschwindigkeit                                 |
| Bogen-Toleranz                                   | `arc_tolerance_mm`                                                     | Bogenzerlegung wie in der Firmware                    |
| Tastblock-Dicke                                  | messen (Messschieber) → _Einrichten → Antasten → Z antasten_           | Z-Antasten, Ecken-Tastzyklus                          |
| Position Werkzeuglängensensor                    | anfahren → _Einrichten → Antasten → Werkzeuglänge → Aktuelle Position_ | Werkzeugwechsel mit Längenkorrektur                   |
| Werkzeugwechsel-Position, sichere Höhe           | _Menü → Einstellungen → Maschine_                                      | Werkzeugwechsel, Rahmen, Wiederaufnahme               |
| Spindel-Drehzahlbereich                          | Typenschild des Fräsmotors → _Menü → Einstellungen → Maschine_         | Schnittwert-Vorschlag                                 |
| Portal-Unterkante über der Werkzeugspitze        | messen (siehe offene Fragen, Punkt 11)                                 | Kollisionsprüfung                                     |
| Spindel-Anlauf/Auslauf                           | `spinup_ms` / `spindown_ms` der Spindel                                | Zeitschätzung                                         |

Noch zu messen: Tastblock-Dicke, Position des Werkzeuglängensensors (falls vorhanden), echter Z-Weg,
Portal-Unterkante.
