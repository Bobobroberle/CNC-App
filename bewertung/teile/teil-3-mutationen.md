# Teil 3 – Code-Qualität und Tests: Mutationstest von Hand

Arbeitskopie: `/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/mut/cnc-steuerung` (Original unberührt).
Blindregel eingehalten: `CLAUDE.md`, `DESIGN.md`, `docs/umbau-guide.md` nicht geöffnet (ein Kommentar im Quellcode verweist auf DESIGN.md, der Verweis wurde nicht verfolgt).

## 1. Plan (festgelegt VOR dem ersten Testlauf, ausgewählt aus dem Quellcode, ohne Tests gesehen zu haben)

Zeilennummern beziehen sich auf den Stand "baseline".

| # | Paket | Datei:Zeile | Geplante Änderung | Warum dieses Ziel |
|---|---|---|---|---|
| 1 | gcode-core | `src/analyze.ts:106` | `value > limit` (max-Seite) → `value >= limit` | Verfahrweg-Grenze (Sicherheitsgrenze): exakt auf dem Limit darf nicht als Verletzung gelten; Randfall, den reine Abdeckung nicht prüft |
| 2 | gcode-core | `src/collision.ts:91` | `holderZ = p.z + setup.stickout` → `holderZ = p.z` | Kollision Halter gegen Rohteil/Spannpratze: Werkzeug-Überstand ist die zentrale Größe der Prüfung |
| 3 | gcode-core | `src/resume.ts:81` | `lineIndex >= raw.length` → `lineIndex > raw.length` | Zeilenzählung beim Wiederaufnehmen eines abgebrochenen Jobs: Off-by-one an der Obergrenze |
| 4 | fluidnc-client | `src/streamer.ts:196` | `this.buffered + size > this.rxBufferSize` → `>=` | Zeichenzählendes Streaming: Off-by-one beim RX-Puffer (Überlauf vs. Unterauslastung) |
| 5 | fluidnc-client | `src/streamer.ts:104` | `l.text.length + 1 > this.rxBufferSize` → `>=` | Zu lange Zeile wird abgewiesen: Randfall genau Puffergröße |
| 6 | fluidnc-client | `src/jog.ts:32-34` | `Math.max(base, Math.min(wanted, range.max))` → `Math.min(wanted, range.max)` (Absicherung "nie gegen die Wunschrichtung") | Software-Endschalter beim Jog: Maschine steht schon außerhalb des Bereichs |
| 7 | cam | `src/toolpath.ts:80` | `Math.ceil(depth / stepdown - 1e-9)` → `Math.floor(depth / stepdown - 1e-9)` | Tiefenzustellung: Durchgänge dürfen nicht tiefer als `stepdown` sein |
| 8 | cam | `src/toolpath.ts:434` | `(op.kind === 'outside') === s.climb` → `!==` | Gleich-/Gegenlauf (Werkzeugweg-Richtung, Schnittqualität/Sicherheit) |
| 9 | cam | `src/toolpath.ts:419` | `c.circle.r < r - 0.1` → `c.circle.r < r` | Werkzeug passt nicht in Bohrung: Toleranzgrenze 0,1 mm (Randfall) |
| 10 | workshop | `src/probing.ts:112` | `down = p.retract + o.depth + o.plateThickness` → ohne `+ o.plateThickness` | Koordinatenrechnung beim Eck-Antasten: Absenktiefe im Messablauf (Kollision mit Platte) |
| 11 | workshop | `src/cutting.ts:54` | `Math.min(tool.flutes, 2)` → `tool.flutes` (V-Fräser/Fase) | Vorschubberechnung (Schneidenzahl) – falsche Zahl liefert zu hohen Vorschub |
| 12 | workshop | `src/zeros.ts:89` | `z.wcs! > 6` → `z.wcs! > 7` | Wertebereichsprüfung G54–G59 (G10 L2 P7 wäre ungültig); Validierung gespeicherter Nullpunkte |
| 13 | control (Wächter) | `src/lib/readiness.ts:163` | `r.errors > 0` → `r.errors > 1` | Start-Sperre: ein einzelner G-Code-Fehler muss den Start blockieren |
| 14 | control (Wächter) | `src/store/machine.ts:1168` | Prüfzweig `|| v > range.max + 0.001` entfernen | Bewegungsfreigabe `moveMachine`: Verfahrweg-Obergrenze bei Referenzfahrt/Softlimits |

Vorgehen pro Mutation: Datei ändern, nur das betroffene Paket testen (`pnpm exec vitest run`), Ergebnis notieren, `git checkout -- <datei>`.
