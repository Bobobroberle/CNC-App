# Farben-Inventar (Änderungsliste Nr. 22, „Design-Kritik 4“)

**Auftrag aus der Liste:** „Violett nur für Antasten (Auswahl neutral), Rot nur für Notfall (✕ der Schritte in Orange/neutral mit Wort),
Mindestgröße für Beschriftungen.“ Der Betreiber hat „Farben“ als Teil der vierten Gruppe freigegeben, mit der einfachsten, sicheren Fassung
bei offenen Einzelheiten (Entscheidung 38). **Weil die Liste selbst sagt, dass die rote ✕ eine bewusste Abweichung ist
(`umbau-guide.md`) und weil Farben Bedeutung tragen, habe ich in der Nacht nur nachgesehen und das Geänderte auf das Sichere
beschränkt:** ein Inventar und einen Vorschlag; geändert ist nichts.

## Violett (`--probe`): schon nur fürs Antasten

Gesucht in `apps/control/src` (CSS und Komponenten, `probe`-Farbe/-Token):

| Wo | Wofür |
|---|---|
| `components/ProbeTiles.tsx` | Strichzeichnungen der Antast-Kacheln (Pfeile, Messpunkte) |
| `ui/status-badge.tsx` (`probe`) | die Zustandsmarke „Antasten“ der Statusleiste |
| `styles/theme.css` | die Token selbst (beide Themen) |

**Ergebnis:** Violett kommt außerhalb des Antastens nirgends vor; eine Auswahl (`pressed`, Reiter, Kacheln) ist `primary`/neutral. Die Forderung
„Violett nur für Antasten (Auswahl neutral)“ ist damit **schon erfüllt – nichts zu ändern.**

## Rot (`--destructive`): mehr als Alarm und NOT-HALT

`CLAUDE.md` sagt: Rot = Störung, Alarm, Kritisch und NOT-HALT – nirgends sonst. Im Code ist es mehr (Auswahl nach Gruppen):

| Gruppe | Wo | Warum es rot ist |
|---|---|---|
| **Soll so sein** | `NOT-HALT` (`controls.css`), Alarm-Banner (`AlarmBanner`, `stage.css` `.alarm`), kritische Meldung (`CriticalLayer`), Meldungsstufe „Störung“ (`ui/toast.tsx` `fault`) | Notfall/Störung |
| **Soll so sein** | Zustandsmarke „Alarm“ (`ui/status-badge.tsx` `alarm`) | Störung |
| **Gefährliche Halten-Tasten** (`HoldButton variant="danger"`) | „Job abbrechen“ im Werkzeugwechsel (`ToolChangeCard`), Firmware flashen (`FirmwareCard`), Werkzeug/Material/Einstellung löschen (`ToolLibrary`, `MaterialLibrary`, `SettingsBrowser`), Pi herunterfahren (`CompanionCard`) | etwas, das sich nicht zurücknehmen lässt (das Halten ist neutral laut `CLAUDE.md` „a hold for something that cannot be taken back is neutral“ – hier weicht der Code ab) |
| **Fehler im G-Code und sperrende Punkte** | `ui/alert.tsx` `error` (Fehler im G-Code `CheckCards`, `job.issuesFound`), ✕ im Stepper (`ui/stepper.tsx` `block`), Zeilen der Startklar-Liste mit ✕ (`rooms.css`), Kollisions-Marke im 3D-Bild (`Stage3D`) | „so nicht starten“: sperrt den Start |
| **Werkzeugweg im Material** | `Stage3D.tsx`: der Schlüssel `danger` der Farbpalette ist nur ein alter Name – gelesen wird `--stage-cut`, der blaue Akzent (`theme.css`: „in the material: the accent, never red“); rot ist im 3D-Bild nur die Kollisions-Marke (`Badge variant="destructive"`) | der Weg ist nie rot (README: „blau“), die Marke warnt vor einer Kollision |

## Vorschlag (nicht umgesetzt – Betreiberentscheidung)

1. **Rot auf „Start gesperrt“ behalten.** Eine gesperrte Startklar-Liste ist die wichtigste Auskunft vor dem Fräsen; Orange (`warning`) bleibt
   den Hinweisen (⚠). Das Wort steht immer dabei (nie nur Farbe). Wenn der Betreiber trotzdem nur Notfall-Rot will: die ✕ der Punkte
   (`ui/stepper.tsx` `block`, `rooms.css` ✕-Zeilen) auf Orange mit dem Wort „gesperrt“ und das Rot dem NOT-HALT, Alarm und der kritischen
   Meldung lassen – etwa 6 Zeilen CSS, aber `theme.test.ts` und die Bildschirmfotos der Abnahme ändern sich.
2. **Gefährliche Halten-Tasten** (Löschen, Flashen, Herunterfahren): die Regel in `CLAUDE.md` („neutral“) und der Code (rot) widersprechen
   sich – entweder die Regel anpassen (Rot für „nicht rückgängig“, Beschriftung nennt es) oder die Tasten neutral machen. **Mein Rat:** die Regel
   anpassen: ein Halten für etwas Unwiderrufliches soll sich vom Üblichen abheben.
3. **Mindestgrößen von Beschriftungen:** nicht gemessen; ein Test, der jede sichtbare Beschriftung ≥ 12 px verlangt (`getComputedStyle`),
   würde die Frage beantworten (nur Statusleiste, Bühnenknöpfe, Legende, Z-Skala sind genannt). Vorschlag für die nächste Runde.

*Screenshot-Paare (vorher/nachher) gibt es nicht, weil nichts geändert wurde.*
