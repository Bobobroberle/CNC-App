# Plan: Bereichs-Oberfläche (zur Freigabe – es ist noch nichts gebaut)

Grundlage: Entscheidungen 1 und 4 (`entscheidungen.md`), der Advisor-Plan und die Antworten des Betreibers:
**sechs Bereiche**, im CAM-Bereich **nur CAM und Statusleiste**, **Startbildschirm bleibt, Kette „Weiter: …“ entfällt**.
Form nach `DESIGN.md` §11.3: erst Layout und Elementliste, Freigabe, dann bauen; danach Screenshots bei 1280 und 800 px.

## Die sechs Bereiche (Reiter statt der fünf Schritte)

| Reiter | Platz-Kennung | Inhalt (Karten, wie heute, nur umgezogen) | vorher |
|---|---|---|---|
| **Job** | `job` (bleibt) | Programm-Karte, Zuletzt verwendet, SD-Karte, Vorrichtungen (`JigsCard`), Werkstück (`WorkpieceCard`), Extras (`PrepareCard`) | ① Job |
| **Zeichnen/CAM** | `cam` (neu, ersetzt `ui.drawing`) | `CamCard` mit `CamAdd`/`CamArrange`/`CamSides`, Werkzeugwahl der Zeichnung; **sonst nichts** | ① Job (Zeichnen-Ansicht) |
| **Einrichten & Fahren** | `setup` (bleibt) | Ansichten Nullpunkt · Antasten · Kamera · Ausrichten, Spannmittel, Jog-Knopf | ③ Einrichten |
| **Fräsen** | `run` (bleibt) | Ansicht **Prüfen** (Startklar-Liste `ReadinessCard`, Simulation + Zeitleiste, `WorkspaceCheck`, Werkzeuge des Jobs `JobToolsCard`) und Ansicht **Fräsen** (`RunScreen`, Start, Overrides, Pause/Abbruch) | ② Werkzeuge, ④ Prüfen, ⑤ Fräsen |
| **Service** | `service` (bleibt) | Diagnose · Meldungen · Historie · Kalibrieren | Nebenbereich |
| **Einstellungen** | `settings` (bleibt) | Verbindung · Maschine · Kamera · Experte | Nebenbereich |

Bleibt im Menü (kein Reiter): Werkzeugliste (`toollist`, mit `CuttingAdvisor`), Konsole (nur Expertenmodus).
Entfallen als Plätze: `tools`, `check` (gespeicherter Platz `tools`/`check` fällt auf `run` zurück, ein unbekannter auf `start`).

## Was in jedem Bereich bleibt (Ausnahmen, nicht verhandelbar)
Statusleiste mit Zustand, Position, Spindel, Vorschub, **PAUSE und NOT-HALT**, Alarm-Banner, die kritische Meldung bei Verbindungsverlust,
die Werkzeugwechsel-Karte eines gehaltenen Jobs. Die Start-Sperre (Entscheidung 4) bleibt; die Startklar-Liste und ihre Zuordnung „wo man es behebt“
(`lib/readiness.ts` → `lib/steps.ts`) bleiben, nur ihr Zuhause wechselt: ein Punkt gehört zum Bereich, in dem man ihn behebt.

## Was im CAM-Bereich verschwindet (Wunsch des Betreibers: nur CAM)
Jog-Knopf, Laufleiste eines laufenden Jobs, Kamera-Einblendung, Karten der Abläufe (Wenden, Abschnitte, Vorrichtung) und die Bühnenwerkzeuge
(Hinfahren, Nullpunkt, Messen, Spannmittel, Joystick). Die Bühne zeigt nur den Tisch mit der Zeichnung. Ein laufender Job bleibt trotzdem über die Statusleiste und die kritische Meldung bedienbar.

## Aktionsleiste ohne Kette
Die Empfehlung „Weiter: …“ entfällt (`lib/next.ts`, `Strg+→`). Der Startbildschirm bleibt (Zustand, aktueller Job, Schnellzugriffe).
Hauptaktion rechts unten nur dort, wo es eine gibt: Job „G-Code öffnen“, Fräsen „Fräsen starten“ bzw. „Fortsetzen“; Einrichten, CAM, Service, Einstellungen haben keine.
Das ändert die Regel „genau eine Primäraktion“ aus `DESIGN.md` §4 (siehe Stufe 0).

## ASCII-Layout (1280 px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Bereit] [X Y Z]  Spindel / Vorschub            ⚑   [ PAUSE ] [ NOT-HALT ]   │  Statusleiste, überall gleich
├──────────────────────────────────────────────────────────────────────────────┤
│ Start │ Job │ ▌Zeichnen/CAM▐ │ Einrichten & Fahren │ Fräsen │  Suchen  Menü  │  Reiter (aktiver markiert)
├────────────────────────────────────────────┬─────────────────────────────────┤
│ TISCH (nur Zeichnung, Raster, Griffe)      │ CAM-Panel: Zeichnen → Wie → Ansehen │
│                                            │ (keine weiteren Karten)         │
├────────────────────────────────────────────┴─────────────────────────────────┤
│                                           (keine Aktionsleiste im CAM)       │
└──────────────────────────────────────────────────────────────────────────────┘
Fräsen: Reiter-Ansichten  [ Prüfen | Fräsen ]  – Prüfen: Bühne 3D + Zeitleiste, Panel Startklar-Liste, Werkzeuge des Jobs
```

## Betroffene Stellen (gemessen, `grep`)
- `STEPS` in 10 Quelldateien, `isStep` in 6, `STEP_STAGE` in 2, `stageViews` in 2, `useSteps` in 4, `STEP_OF` in 1 (+2 Tests), `lib/next` in 4 (+1 Test), `drawing` in 13 (+1 Test, +1 e2e).
- Test-Kennungen `step-*` in 8 e2e-Dateien (12 Stellen); `goTo(page, '<Schritt>')` an 92 Stellen in den e2e-Tests. Das ist die Größe von Stufe 1.
- `commands.test.ts` erzwingt Eintrag, Anker und Stichwörter je Ort und je Ansicht: wird **angepasst, nicht gelockert**.

## Stufen (je eine Freigabe, je ein Commit, alle e2e-Projekte grün)
0. **Text:** `DESIGN.md` §3.2/§3.3/§4/§5/§11, `CLAUDE.md` (Abschnitt Navigation und Schritte), Zuordnungstabelle in `umbau-guide.md` auf die sechs Bereiche; „genau eine Primäraktion“ und „⑤ startet erst wenn nichts blockiert“ umformulieren (Sperre bleibt).
1. **Nur Plätze:** `cam` ersetzt `ui.drawing`; Reihe aus sechs Reitern ersetzt den Stepper; Karten ziehen um, ohne sich innen zu ändern; `tools`/`check` gehen in `run` auf (Ansichten Prüfen/Fräsen); Platz-Fallback für gespeicherte Werte; Schnellsuche und Tests nachgezogen; Kette „Weiter“ aus der Aktionsleiste.
2. **CAM-Fokus:** Bühnenwerkzeuge, Ablauf-Karten, Jog-Knopf, Laufleiste und Kamera-Einblendung im CAM-Bereich aus (Änderungsliste 20).
3. **Angedockte Hauptaktion** je Panel, die untere Knöpfe nicht mehr unter dem Rand (Änderungsliste 19).
Getrennte Punkte: Ausblend-Schalter (7), Farben und Schriftgrößen (22).

## Abnahme
- Alle drei e2e-Projekte (desktop, tablet, ipad) grün, `pnpm check` grün, Screenshots bei 1280 und 800 px je Bereich.
- Meine Zählung A (10 Tipps/Halten) und B (12) neu gemessen und **nicht schlechter**; neue Zahl in `bericht.md` ergänzt.
- `usability.spec.ts` („bekannter Job“, 6 Interaktionen) angepasst an die neuen Wege und weiter grün.

## Risiken
- Die Zählung wird sich ändern, weil „Einrichten“ und „Fräsen“ (mit Prüfen) andere Wege haben; zu messen, nicht zu hoffen.
- 92 `goTo`-Stellen: der Helfer `goTo` wird die Reiter benennen, die Aufrufe bleiben stabil, wo der Name der Reiter gleich bleibt (`Job`, `Einrichten`, `Fräsen`); `Werkzeuge`/`Prüfen` werden Ansichten von `Fräsen` und brauchen Anpassung.
- Hintergrunddienste laufen unabhängig von Bereichen (`main.tsx`); Ausblenden eines Bereichs stoppt sie nicht (eigener Punkt 7).
