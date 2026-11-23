# Teil 5 – Lücke zu den Anforderungen (Abschnitte 4, 5, 8, 6 und 7 von `02-ziele.md`)

Prüfgrundlage: Code im Projektordner `cnc-steuerung/` (Pfade unten relativ dazu). Gelesen wurden nur Quellcode, Tests,
`docs/bewertung/*` sowie die Dokumente `companion.md`, `kalibrierung.md`, `erste-schritte.md`, `offene-fragen.md`,
`einkaufsliste.md`, `ideen.md`, `ipad.md`. Die gesperrten Dateien wurden nicht geöffnet.
Stand-Spalte: **vorhanden** / **teilweise** / **fehlt**. Aufwand S/M/L/XL ist meine Schätzung (Vermutung), Bezugsgröße: ein
Entwickler, der den Code kennt, mit Tests im Stil des Projekts (100 % Abdeckung der Bibliotheken ist erzwungen, Fakten).
„eigener Versuch" = ein von mir geschriebener Wegwerf-Test außerhalb des Projekts (nichts im Projekt geändert).

---

## A) CAM (Abschnitt 4)

### A1 Zeichnen, Import, Bearbeiten

| Anforderung | Stand | Beleg im Code | Lücke / Aufwand |
|---|---|---|---|
| Einfache Formen | vorhanden (nur 4) | `packages/cam/src/sketch.ts:10-26` (rect mit Eckenradius, circle, slot, grid, text); Schaltflächen `apps/control/src/components/CamAdd.tsx:12-24,52-73`; Test `cam.test.ts:42`, `sketch.test.ts` | Kein Vieleck, keine Ellipse, kein Bogen/Linie. S je neue Form (parametrische `Sketch`-Variante + Griffe). |
| Text / Schilder | teilweise | `packages/cam/src/font.ts:5-8`: **eigene Einstrich-Schrift** (Linien/Bögen, Umlaute, Ziffern) – nur Gravur entlang der Linie (`kind 'on'`). Test `font.test.ts` (11) | Keine Konturschrift (TTF/OTF): Text kann nicht ausgefräst/ausgetascht werden, keine Schriftwahl. M–L (Font-Parser + Glyph-Konturen → Polygone mit Löchern; Clipper vorhanden). |
| SVG-Import | teilweise | `svg.ts:373-515`: path (alle Befehle inkl. Bezier/Bogen, `svg.ts:147`), rect, circle, ellipse, line, polyline, polygon; Gruppen/`transform` werden eingerechnet (`GROUPS` `svg.ts:341`). **Nicht**: `text`, `use`, `image` (nur Hinweis `svg-text/svg-use/svg-image`, `svg.ts:24-31,362`), `clipPath/mask/pattern/symbol/defs` bewusst stumm (`svg.ts:342-360`). Tests `svg.test.ts` (15) | Text in SVG muss vorher in Pfade gewandelt werden; `use` fehlt (S). Kein Unterschied Füllung/Strich. Gut abgedeckt. |
| DXF-Import | teilweise | `dxf.ts:260-330`: LINE, CIRCLE, ARC, LWPOLYLINE (mit Bulge), POLYLINE/VERTEX (alt), SPLINE (Kontrollnetz oder Fit-Punkte), ELLIPSE; `$INSUNITS`; Linien werden zu Konturen verkettet (`joinPieces` `dxf.ts:220`). **Nur** Abschnitt ENTITIES (`dxf.ts:61`) → Blöcke/`INSERT` werden nicht aufgelöst; TEXT, MTEXT, HATCH, DIMENSION u. a. landen in `skipped` und werden dem Bediener gemeldet (`CamAdd.tsx:76-82`, Test `dxf.test.ts:259`). Nur ASCII-DXF (`dxf.ts:255`) | `INSERT`/Blöcke: S–M (rekursiv mit Transform; `transform.ts` hat Matrizen). Binär-DXF fehlt (Vermutung: selten). |
| Freie Kurven / Skizzen | **fehlt** | Es gibt kein Zeichnen mit Maus/Finger: `CamAdd.tsx` bietet nur die 4 Formen, Text, Datei. Kein Polylinien-, Freihand-, Bezier-Werkzeug in `store/cam.ts` oder `Cam*.tsx` (Suche nach polylin/bezier/freehand ohne Treffer). Kurven kommen nur aus Importdateien (`curves.ts`: quadratische/kubische Bezier, Ellipse → Polylinie). | Polylinie mit Klick-Punkten: M. Bezier/Knoten bearbeiten (Griffe, Hinzufügen/Löschen, Undo): L. Wichtigster Grund für „reicht nicht" (Vermutung). |
| Verschachteln (Nesting) | **fehlt** | `nestingDepths` (`geometry.ts:66`) ist **Enthaltensein** (Loch/Insel), kein Nesting. Vorhanden: Kopien im Raster (`store/cam.ts` `array`, `duplicate`) und „Serie auf Rohlinge" per Kamera (`lib/series.ts`, `SeriesCard.tsx`) – das platziert ein Motiv auf gefundenen Rohlingen, packt keine Teile auf eine Platte. | Einfaches Packen nach Bounding-Box (Regalverfahren, Drehung 0/90°): M. Formtreues Nesting: L (kein Bibliothekscode im Projekt; Clipper liefert Offset/Boolean, aber keine No-Fit-Polygone). |
| Boolesche Operationen | **fehlt im Werkzeug**, Bibliothek da | Clipper-Booleans existieren: `offset.ts:63-73` (`intersectPolygons`, `subtractPolygons`, `unitePolygons`, `polygonsArea`), aber **nur `flip.ts:223-312`** (Wenden/Passlöcher) benutzt sie. In `Cam*.tsx`/`store/cam.ts` kein Aufruf (Suche). Überlappende Konturen werden einzeln versetzt, nicht vereinigt (`toolpath.ts:426-427`). | UI-Werkzeug Vereinigen/Abziehen/Schneiden: M (Items → `region()`, Ergebnis → neue Items, Kreis-Metadaten gehen verloren, Undo). Algorithmus ist **nicht** zu bauen – Clipper 6.4.2 ist Abhängigkeit (`packages/cam/package.json`). |
| Maße & Abhängigkeiten | teilweise (nur Zahlenfelder) | Formen haben Maße als Felder (`sketch.ts` `scaleSketch`, `tidySketch`; Eingabe w/h/r/d in `CamArrange.tsx`), Bewegen/Drehen/Spiegeln/Kopien per Zahl (e2e `arranges the drawing by numbers`). **Keine** Bemaßungsobjekte, keine Beziehungen (gleich, parallel, Abstand). | Anzeige-Bemaßung: M. Echte Abhängigkeiten (Constraint-Löser): XL. |
| Ebenen & Gruppen | teilweise | `CamItem.group` (`lib/camItems.ts:27`) = Dinge, die zusammen kamen (eine Datei, ein Text); Auswahl/Verschieben je Gruppe. **Keine** Ebenen: DXF-Ebenenname wird gelesen (`Contour.layer`, `dxf.ts:76`), aber in `apps/control/src` nirgends benutzt (Suche). Kein vom Bediener bildbares Gruppieren/Auflösen. | Ebenen mit Sichtbarkeit/Sperre und Zuordnung zur Bearbeitung: M. Frei gruppieren: S–M. |

### A2 Frässtrategien

Datenmodell der Bearbeitung: `OperationKind = 'outside' | 'inside' | 'on' | 'pocket' | 'drill' | 'none'`
(`toolpath.ts:17`), je Zeichnungsobjekt wählbar (`CamCard.tsx:37`).

| Strategie | Stand | Beleg | Lücke / Aufwand |
|---|---|---|---|
| Kontur außen / innen | vorhanden | `toolpath.ts:424-447`; Haltestege (`tabs`, `:19-25`, `loopWalk`), Rampe, Schlichtzugabe (`allowance` `:47`), Eckenentlastung Dogbone/T-Bone (`relief.ts`, Tests `relief.test.ts` 5, `cam.test.ts:512`) | – |
| Tasche | vorhanden | `pocketRings` `toolpath.ts:290-304` (konzentrische Ringe von der Wand nach innen, Inseln = enthaltene Konturen `:449-451`); Test `cam.test.ts:186` | Nur Konturparallel. Insel-in-Insel wird nicht als Tasche behandelt (alles Enthaltene ist Insel; eigener Versuch). |
| Bohren | vorhanden | `toolpath.ts:249-284` (Pecken passender Fräser, sonst Helix); `plan.ts:23-27` wählt Bohren automatisch bei Kreis ≤ 1,2 × Fräser | – |
| Gravur | vorhanden | `kind 'on'`: `toolpath.ts:412-415`, offene Linien hin und zurück `openWalk :229` | – |
| Wirbelfräsen | **fehlt** | keine Treffer im Code (Suche nach trochoid/wirbel). Begriff mit dem Betreiber klären (Vermutung: trochoidales Fräsen / Schleifenbahn). | M (Schleifen entlang einer Mittellinie, Eingriffswinkel begrenzen). |
| Adaptives Ausräumen | **fehlt** | `packages/workshop/src/adaptive.ts` ist **Vorschub-Override nach Spindellast**, kein Ausräumen. Tasche nur wie oben. | L–XL (gleichbleibender Eingriffswinkel; Clipper-Offset als Baustein vorhanden, Algorithmus nicht). |
| Restmaterial / zweiter Fräser | **fehlt** | **Ein Fräser je Zeichnung**: `CamSettings.toolId` (`store/cam.ts:94`), `generate()` nimmt einen Durchmesser (`store/cam.ts:1038,1046`); `toolpaths()` bekommt ein `CutSettings` (`toolpath.ts:392-397`). Der Streamer hält an M6 (`packages/fluidnc-client/src/streamer.ts:70`), Werkzeugwechsel mitten im Job ist also nachgelagert vorhanden. | M–L: Fräser je Bearbeitung, Restfläche = Taschenfläche − Offset(Vorfräser) (Clipper), Werkzeugwechsel (M6) im erzeugten Programm. |
| 3D-Schlichten / Reliefs | **fehlt** | Keine 3D-Bearbeitung. `relief.ts` ist **Eckenentlastung**, kein Relief. Der STL-Import in `Stage3D.tsx:6,549-568` ist **nur Anzeige des Rohteils**. Kugelfräser existiert als Werkzeugart (`tools.ts:3`) und als Form für die Abtrags-Simulation, nicht für Bahnen. | XL: STL/Höhenkarte einlesen, Drop-Cutter mit Fräserform, Raster-/Konturbahnen, Schruppen, Simulationsabgleich. Kein Teilcode vorhanden. |
| Gleich-/Gegenlauf **je Bearbeitung** | **teilweise (ein Schalter für alles)** | `CutSettings.climb` (`toolpath.ts:42`) gilt für die ganze Zeichnung: Schalter `CamCard.tsx:465-468`, Vorgabe `store/cam.ts:295`. `Operation` (`toolpath.ts:50-58`) kennt kein `climb`; benutzt wird `s.climb` an drei Stellen (`:275` Helix, `:434` Kontur, `:460` Tasche). Test `cam.test.ts:104`. `ItemPatch` (`store/cam.ts:147`) ohne climb. | **S**: `climb?: boolean` in `Operation` + `CamItem` + `ItemPatch`, die drei Stellen auf `op.climb ?? s.climb`, Schalter im Objektbereich, 2-3 Tests (≈ 0,5–1 Tag, Vermutung). |
| Werkzeugverwaltung mit Schnittwerten je Werkzeug | **fehlt im Datenmodell** | `Tool` (`packages/workshop/src/tools.ts:5-31`) hat Maße, Zähne, Halter – **keine** Felder für Vorschub, Zustellung, Drehzahl. Schnittwerte entstehen aus **Werkzeug × Material** (`suggestCutting`, `cutting.ts:32`; `Material.vc/fz6/…` `materials.ts`), mit Lernfaktor je Paar (`learningKey` = Werkzeug|Material). Die CAM-Werte (`feed, stepdown, stepover, rpm`) sind **ein Satz je Zeichnung**, Vorgabe fest 1500/2/0,4/18000 (`store/cam.ts:283-299`) und werden beim Fräserwechsel nicht umgeschaltet. `suggest()` bricht ohne gewähltes Material ab (`store/cam.ts:1024`) – das steht im Widerspruch zu „Material spielt keine Rolle". | **S–M**: optionale Felder `feed, plunge, stepdown, stepover, rpm` im `Tool` (`validateTool` lässt Zusatzfelder durch, Companion speichert JSON ohne Schema, `db.ts`), Werkzeugliste um Felder erweitern, `setSettings` beim Fräserwechsel aus dem Werkzeug füllen, Material nur als Option. ≈ 1–2 Tage. |

### A3 Polygon-Offset: Umsetzung, Robustheit, Teststärke

- **Umsetzung:** Bibliothek, nicht selbst gebaut: `clipper-lib` 6.4.2 (JS-Port von Clipper 1), `packages/cam/src/offset.ts:1`.
  Ganzzahlraster 1 µm (`SCALE = 1000`, `:5`), runde Ecken (`jtRound`, `etClosedPolygon`, `:22-27`), Toleranz 0,01 mm
  (`:20`). Boolesche Operationen mit `pftNonZero` (`:58`). Außen/Innen/Tasche rufen `offsetPolygons` (`toolpath.ts:427,435,452,298,301`).
- **Orientierung:** `region()` (`offset.ts:34`) legt außen gegen den Uhrzeigersinn, Löcher im Uhrzeigersinn fest. Die Insel-Erkennung ist
  grob: „Mittelpunkt liegt im Umriss und Fläche kleiner" (`toolpath.ts:332-339`), nicht Kantenschnitt.
- **Robustheit (eigener Versuch, Vitest außerhalb des Projekts, `toolpaths()` mit Ø 6):**
  - Schleife aus Linien 8-förmig („Schleife/Bow-Tie") als Tasche und als Außenkontur: wirft nicht, meldet **kein** `Problem`
    (72 bzw. 176 Bewegungen). Ob die Bahn geometrisch richtig ist, habe ich **nicht** geprüft.
  - Insel in Insel (100er Tasche, 60er Insel, 20er Innen-Insel): kein Schnitt im Inneren der Inseln (`0` Punkte); die innerste Fläche wird nicht ausgeräumt – gewollt oder nicht, ist Auslegungssache.
  - Überlappende Außenkonturen werden einzeln versetzt (`toolpath.ts:426-427`): Der Fräser schneidet durch das jeweils andere Teil; keine Vereinigung.
  - Abdeckung der Taschenringe (Fläche der Tasche minus Vereinigung aller Ringbänder, per Clipper): Rechteck 60×40, Ø 6, Bahnabstand 40 % → 7,8 mm² unberührt (0,33 %). Das entspricht der Rechnung 4·(1−π/4)·r² ≈ 7,7 mm² (Innenecken, die ein runder Fräser nie erreicht) – **kein Fehler**. L-Form 0,35 %, Rechteck mit Rundinsel 0,34 %. Bei Bahnabstand 90 % bleiben ≈ 2 mm² mehr stehen (0,41 %). Es bleibt also kein Mittelgrat. Nicht geprüft: ob die Oberfläche (`CamCard.tsx:430-433`, in Prozent) den Bahnabstand begrenzt.
  - Zeit: Tasche 1200×800 mm mit Ø 6 → 3819 Bewegungen in etwa 10 ms.
- **Teststärke:** Direkter Test des Versatzes ist **dünn**: `cam.test.ts:72-83` (Quadrat wächst um 1 mm, Fläche 140+π; schrumpft bis es verschwindet; Orientierung von `region`). Tasche mit **einer** runden Insel (`cam.test.ts:186-203`) und mit quadratischer Insel (~`:238`) prüft „nie in die Insel" und die linke Kante, nicht die **Vollständigkeit** der Ausräumung. Nicht getestet: Selbstüberschneidung, entartete/doppelte Punkte, Engstellen, die den Ring teilen, verschachtelte Inseln, sehr große Koordinaten, Offset von Kreis-Konturen mit `circle`-Metadaten. Die 100 %-Abdeckung (Fakten) sagt darüber nichts.
- **Aufwand-Folgerung:** Offset-Bibliothek ist vorhanden → Booleans, Restmaterial, Wirbelfräsen, Nesting-Hilfen sparen den Kern; der Aufwand liegt in Oberfläche, Datenmodell (mehrere Werkzeuge) und Tests.

---

## B) Kamera (Abschnitt 5)

### B1 Anforderungstabelle

| Anforderung | Stand | Beleg |
|---|---|---|
| Nullpunkt per Fingertipp | vorhanden, **ungemessen** | Zwei Wege: (a) Tipp aufs Bild/Tisch → Punkt (mit Lupe, Einrasten auf Ecke/Kante `store/camera.ts` `edgeAt`, Loch `holeAt`) → „Nullpunkt X/Y setzen" (Halten) setzt die Koordinaten **des getippten, umgerechneten Punkts** (`ZeroTool.tsx:~82` `setZeroAt({x: point.x, y: point.y})`); (b) „Hinfahren", Fadenkreuz auf die Ecke, „Nullpunkt = Fadenkreuz" (`SetZeroCard.tsx:57-71`, `crosshairPoint` `store/camera.ts`). e2e `sets the zero by tapping the camera picture or the table`, `…on a tapped corner under the loupe…`, `…the zero snaps to the corner of the board…` (alle gegen den Simulator). |
| Live beim Fräsen zuschauen | vorhanden | Stream als `<img>` MJPEG (`store/camera.ts:117-122`); Livebild klein in der Ecke (`LiveInset.tsx`); Mitschnitt auf dem Pi (`apps/companion/src/recorder.ts`, `docs/companion.md` Punkt 8). Bildrate/Latenz nicht gemessen. |
| Job aufs Material legen | teilweise | Fotokarte: Bilder an Maschinenposition abgelegt, Auflösung der Karte 4 px/mm = 0,25 mm/px (`lib/photomap.ts:181`), nur 70 % der Bildmitte genutzt, weil die Ränder verzeichnet sind (`photomap.ts:21`). Für selbst Gezeichnetes folgt das Teil dem Finger; für fertigen G-Code **offen** (`docs/ideen.md`, Punkt 1). |
| Messen / Teile wiederfinden | vorhanden, ungemessen | `lib/measure.ts`, `lib/markers.ts` (Ränder/Löcher mit Subpixel), Passlöcher/Marker (`jigs.ts`, `flip.ts`), Serie auf Rohlinge (`series.ts`, `blanks.ts`). Genauigkeitsangaben in `ideen.md` sind **Behauptungen aus Simulator/künstlichen Bildern** (dort selbst so gesagt). |
| Kamerabild ausschaltbar, App läuft ohne Kamera | vorhanden | Vorgabe aus: `settings.camera.source: null` (`store/workshop.ts:139`), `useCamera.source: null` (`store/camera.ts` Start). Anzeige „Die Kamera ist aus" mit Knopf „Kamera einschalten" (`CameraView.tsx:407-413`, `CameraCard.tsx:42-46`). Ausschalten: erneutes Tippen auf die gewählte Quelle in `CameraSetupCard.tsx:49-53` (`setSource(on ? null : next)`) – **versteckter Umschalter, kein eigener „Aus"-Knopf**. Companion ohne Kamera: `CAMERA_URL` optional (`main.ts`). Ein e2e-Test „ohne Kamera" wurde nicht gefunden (Vermutung: indirekt durch alle Tests ohne Einschalten). |
| ±0,2 mm | **nicht gemessen** | siehe B3 |
| < 30 s | **nicht gemessen** | siehe B4 |
| Z-Nullpunkt Antasten und Papier | vorhanden (außerhalb der Kamera) | `ProbeWizard.tsx`, `SetZeroCard.tsx`; e2e `sets zero, touches off Z and runs macros`. |

### B2 Aufbau der Kamera-Geometrie (Befund)

- Kamera am Fräskopf (fährt mit X/Y/Z), Bild über USB an den Pi, MJPEG von `ustreamer` (`scripts/pi/setup.sh:148-151`,
  Vorgabe `1920x1080` bei 30 fps `setup.sh:16-17`; Pi liefert die Datenrate unverändert weiter, `docs/companion.md`).
- Empfohlenes Modell: Waveshare IMX335 5MP USB Camera (A), „MJPEG 1080p30, manueller Fokus, ca. 4 mm / 106°" (`docs/einkaufsliste.md:36`); zwei
  Alternativen genannt (OS05A10, OV2735, `:42-50`). **Dass genau diese Kamera verbaut ist, belegt nichts im Repo.** Kameraabstand zur Werkstückoberfläche steht nirgends.
- Modell in `lib/camera.ts:1-65`: **ein** Maßstab `pxPerMm`, **eine** Drehung, **ein** Versatz (offsetX/Y Fadenkreuz↔Spindelachse). Keine Verzeichnungskorrektur,
  keine Homographie, keine Neigung (Suche `homograph|distort|undistort|perspective` ohne Treffer außer dem Kommentar `photomap.ts:21`;
  `einkaufsliste.md:42`: „Die App rechnet die Verzeichnung des Objektivs nicht heraus").
- Kalibrierablauf (`store/camera.ts` `tap`, `docs/companion.md`, `erste-schritte.md:176`): **Maßstab** = Merkmal antippen, Maschine X +10 mm, Merkmal erneut antippen (**2 Punkte, 10 mm Basis**); speichert dabei die Kamerahöhe (`focusHeight`). **Versatz** = mit dem Fräser Markierung setzen, Position merken, Markierung antippen (oder automatisch finden, `markers.ts`). Defaultwerte `pxPerMm: 10`, `offset 0` (`store/workshop.ts:133-137`) sind Platzhalter (Simulatorkamera `sim/index.ts:116`).
- Höhenbindung: Maßstab gilt nur auf Kamerahöhe; Warnung ab 0,5 mm Abweichung (`FOCUS_TOLERANCE`, `store/camera.ts`), Fotokarte nimmt dann keine Bilder auf (`de.ts:2807`).
- Zusätzlich: Maschinenkalibrierung mit Punktetafel (`CalibrationWizard.tsx`, `docs/kalibrierung.md`): dort ist die Kamera „nur Zielfernrohr" (Punkt ins Bildzentrum fahren), Verzeichnung und Kamera-Maßstab fallen heraus; das ist **Maschinenmessung**, nicht die Tipp-Genauigkeit.

### B3 Rechnung: Millimeter pro Pixel und was ±0,2 mm verlangt (alles Vermutung, Annahmen offen gelegt)

Annahmen: Stream 1920 px Breite; Abstand Linse–Werkstückoberfläche *h* **unbekannt** → 100/200/300 mm als Beispiele; die Angabe „4 mm / 106°"
(`einkaufsliste.md:36`) ist in sich nicht stimmig (Sensor IMX335 ≈ 2592×1944 bei 2 µm Pixeln, Diagonale ≈ 6,5 mm – das sind Datenblattwerte aus meinem Wissen, **nicht im Repo**: f = 4 mm ergäbe ≈ 78° diagonal, 106° passt zu f ≈ 2,4 mm). Daher zwei Fälle:

- Fall A: 106° diagonal bei 16:9 → horizontal ≈ 98°, Bildbreite *W* = 2·h·tan 49° ≈ 2,31·h → mm/px = *W*/1920:
  h = 100 / 200 / 300 mm → **0,12 / 0,24 / 0,36 mm/px**.
- Fall B: f = 4 mm, 1920 px × 2 µm = 3,84 mm Sensorbreite → horizontal ≈ 51,5°, *W* ≈ 0,96·h:
  h = 100 / 200 / 300 mm → **0,05 / 0,10 / 0,15 mm/px**.

Was für ±0,2 mm gelten müsste (Fehlerbudget, Vermutung):

1. **Pixelgröße:** ein Pixel ist nur im günstigsten Fall (Fall B, h ≤ 200) deutlich kleiner als 0,2 mm; bei Fall A ist ein Pixel schon 0,12–0,36 mm. Ohne Subpixel-Auswertung geht es nicht; mit Subpixel (Kante/Ecke/Loch: Tests `corner.test.ts:68-70` < 0,6 px, `markers.test.ts:37` ≈ 0,05 px – **synthetische, kantenweichgezeichnete Bilder ohne Linse, JPEG, Licht, Rauschen** über ±5 Graustufen) rechne ich 0,3–0,6 px → 0,02–0,2 mm.
2. **Maßstabsfehler aus der Kalibrierung:** 10-mm-Basis, Tipp ±1 px je Punkt (Handtipp ohne Zoom) → relativ √2·1 px / (10 mm / (mm/px)). Bei 0,10 mm/px ≈ 1,4 %, bei 0,24 mm/px ≈ 3,4 %. Ein getippter Punkt 40 mm neben der Mitte hätte dann 0,6–1,4 mm Fehler. Für ±0,2 mm bei 40 mm Abstand wären ≈ 0,5 % nötig → Basis ≥ 100 mm oder Mittelung.
3. **Höhe (Parallaxe):** Maßstab ∝ 1/h. Toleranz 0,5 mm bei h = 150 mm → 0,33 % → 0,13 mm bei 40 mm Abstand von der Mitte. Wechselt die Werkstückdicke um mehr, ist neu zu kalibrieren bzw. Z auf Kamerahöhe zu fahren (`companion.md` Z. ~199-200: Bezug Z0 auf der Werkstückoberfläche). Seitenflächen dicker Bretter erscheinen am Rand: Versatz ≈ Dicke · Abstand/h (18 mm · 40/150 ≈ 4,8 mm) – das Einrasten könnte die Unterkante statt der Oberkante nehmen (Vermutung).
4. **Neigung der Kamera:** nicht modelliert. Versatzfehler ≈ Höhenänderung · tan(Neigung): 10 mm · tan 1° ≈ 0,17 mm.
5. **Verzeichnung:** unkorrigiert, am Bildrand bei Weitwinkel (Fall A) im Prozentbereich (Vermutung) → nur in der Mitte genau; die App selbst nutzt für die Fotokarte nur 70 % des Bildes.
6. **Spindel↔Fadenkreuz-Versatz:** geht 1:1 in jeden Nullpunkt ein; Kalibrierung per Markierung, Genauigkeit der Tipp-Position (±0,5 px ≈ 0,03–0,1 mm) plus Fräserlauf. Maschine: 50 Schritte/mm (`machine/config.yaml`) = 0,02 mm Schritt; Wiederholgenauigkeit der Riemenmaschine: nicht gemessen (`kalibrierung.md` sagt nur, die Erkennung sei „feiner, als die LowRider wiederholt fährt").
7. **Rolling Shutter / Autofokus:** Autofokus ist ausgeschlossen (manueller Fokus, `einkaufsliste.md:36,49-50`: „Autofokus verändert den Maßstab"); Rolling Shutter spielt beim Tippen im Stand keine Rolle (Vermutung). Der Spindelstand wird beim Tippen gespeichert (`CameraTap.spindle`), nicht zum Bildzeitpunkt: bei fahrender Maschine falsch (Vermutung, im Stand unkritisch).

**Bewertung (jeweils Vermutung, keine Messung):**

- **Weg (b) Hinfahren + Fadenkreuz in der Bildmitte:** Verzeichnung, Maßstabs- und Höhenfehler fallen weitgehend heraus; übrig bleiben Versatz-Kalibrierung, Erkennung (Subpixel an Kante/Loch) und Maschinenwiederholung. **±0,2 mm ist mit der vorhandenen Technik plausibel erreichbar**, sofern Kamera scharf, starr montiert, Versatz sorgfältig kalibriert (besser automatisch an einer Bohrung, `docs/kalibrierung.md`) und die Kamera auf Kamerahöhe steht. Belegt ist es nicht.
- **Weg (a) Tipp außerhalb der Mitte:** wegen Zwei-Punkt-Maßstab über 10 mm, fehlender Verzeichnungskorrektur und fehlendem Neigungsmodell halte ich ±0,2 mm für **nicht erreichbar ohne Zusatzmaßnahmen** (Maßstab über lange Basis aus dem Kalibrierassistenten, Verzeichnungsmodell, sicherer Kamerahöhenbezug). Die Dokumente nennen selbst „etwa 0,2–0,5 mm am Bildrand" (`ideen.md`) – Behauptung, nicht gemessen.
- Feinster Schritt im Tipp-Weg ist 0,1 mm (`Loupe.tsx` `NUDGE_STEPS = [0.1, 1]`), im Fadenkreuz-Weg 0,01 mm per Joystick-Schritt.

**Aufgezeichnete Messungen (Suche in `docs/*` außer den gesperrten, Tests, Fixtures, e2e, Kommentare):** Es gibt **keine** Messung an der echten Kamera. Alle
Prüfpunkte in `erste-schritte.md` Abschnitt 6 (Z. 174-208) stehen als `[ ]`; Fakten: „An der echten Maschine ist keine Funktion abgenommen". Zahlen mit
„mm" in Dokumenten (`ideen.md` „0,2–0,5 mm", „etwa 0,1 mm", „Lage etwa 0,1 mm", `kalibrierung.md` „wenige Hundertstel Millimeter") sind **Schätzungen/Behauptungen**,
`ideen.md` sagt selbst „bisher nur Simulator und künstliche Bilder". Tests prüfen Subpixel an synthetischen Bildern (`corner.test.ts`, `markers.test.ts`,
`sections.test.ts:432` „camera reads each mark a tenth off"). → **Genauigkeit: nicht gemessen. Dauer: nicht gemessen.**

### B4 Dauer < 30 s (nur technische Seite)

- Technische Zeiten sind klein: Halten-Knopf 0,8 s (`HoldButton.tsx:53` Vorgabe 800 ms), Hinfahren mit Joggeschwindigkeit XY 3000 mm/min (`profiles/lowrider-v4.json` `jogFeed.xy`), Beschleunigung 200 mm/s²: 150 mm ≈ 3-4 s (Rechnung). Autofokus entfällt (manuell/fest).
- Unbekannt/nicht gemessen: Bildlatenz und Bildrate des MJPEG-Streams über WLAN (`<img>`, nominell 1080p30), Einschwingzeit nach dem Fahren.
- Nicht kamerabedingt, aber in der Kette: Die Kamera ist beim App-Start **aus** (`source: null`), jedes Mal ein Tipp „Kamera einschalten" (Vermutung: nirgends automatisch, `setSource` wird nur von der Oberfläche und der Demo gerufen). Da der Maßstab an Z0 der Werkstückoberfläche hängt (`companion.md` ~199), kommt bei wechselnder Dicke erst Z-Nullpunkt (Antasten/Papier) und Kamerahöhe fahren (Schlussfolgerung, keine Messung). Der Bedienablauf wurde vom Hauptagenten gezählt; die Technik begrenzt die 30 s nicht, die Schritte tun es eher.

---

## C) Updates ohne Internet und Ablage (Abschnitt 8)

### C1 Welche Schritte brauchen Internet? (`scripts/pi/setup.sh`)

| Schritt | Zeile | Internet? |
|---|---|---|
| Pakete `ustreamer v4l-utils python3-smbus2 i2c-tools curl ca-certificates ffmpeg` | `:47-69` | Nur wenn **nicht alles installiert** ist: `dpkg -s` zuerst (`:53`) → sonst `online()`-Probe auf `deb.debian.org` (`:49-52`) → `apt-get update/install` (`:55`). Wiederholter Lauf auf eingerichtetem Pi: **offline möglich** (Kommentar `:45-46`). Fehlt `ustreamer`, bricht das Skript ab (`:60-64`); fehlt nur `ffmpeg`, läuft es weiter (Mitschnitt entfällt). |
| Node 22 | `:69-73` | Wenn Node fehlt oder < 22: `curl … deb.nodesource.com … | sudo bash` (`:71`) + `apt-get install nodejs` (`:72`) – **ohne** Online-Probe, bricht unter `set -e` (`:12`) ab. Raspberry Pi OS Bookworm liefert Node 18 (Vermutung: daher nötig; Companion braucht `node:sqlite`, `db.ts:1`). |
| I²C, Dateien kopieren, sudoers, systemd-Dienste | `:75-178` | nein |

Fazit: **Erste Einrichtung braucht Internet einmal** (apt + NodeSource). **Updates von `companion.mjs` und App brauchen keines**, solange `setup.sh` nur die Dateien ersetzt – so schreibt es `docs/companion.md` und `docs/ipad.md:10` vor (`pnpm bundle` am PC, Ordner `release/pi` per `scp`, `bash setup.sh`). Der PC braucht Internet (oder vorhandene `node_modules`) nur zum **Bauen** (`pnpm install && pnpm bundle`, `scripts/bundle.mjs`).

Hinweis: `lowrider-pi.zip` (Fakten) wird von **keinem** Skript im Repo erzeugt (Suche `zip` in `scripts/**`, `package.json`, `.github/**`, `apps/*/package.json`: keine Treffer; `bundle.mjs:5-16` legt den Ordner `release/pi/` an). Woher das Zip stammt, ist unbelegt.

### C2 Gibt es Upload/Update im Companion oder einen Knopf?

- **Companion:** keine Update-Route. Routen: `/api/health`, `/api/system/shutdown`, `/api/library/*`, `/api/jobs/*`, `/api/notify`, `/api/sensors*`, `/api/recordings*`, `/api/fluidnc/files/:name`, `/fluidnc` (`apps/companion/src/server.ts:104-372`; Liste `docs/companion.md` „Schnittstelle"). Beschreibbar ist nur die Bibliothek (JSON) und der Job-Puffer.
- **Oberfläche:** kein Update-Knopf für den Pi. Treffer für „Update/aktualisieren" in `de.ts` sind das **FluidNC-Firmware-Flashen per USB/Web Serial** (`FirmwareCard.tsx`, `de.ts:1474`) und „Aktualisieren" von Listen. Die Companion-Karte (`CompanionCard.tsx`) bietet Test, Bibliotheken abgleichen, Herunterfahren (Halten); sie zeigt `health.version` (`:84`), aber `VERSION` ist eine **Konstante `'0.1.0'`** (`server.ts:17`), nicht aus dem Bau.
- **Sicherheit heute:** keine Anmeldung, `Access-Control-Allow-Origin: *`, Kommentar „the workshop network is trusted" (`server.ts:89-94`); `POST /api/system/shutdown` ist für jeden im WLAN offen. Anfragekörper bis 64 MB erlaubt (`server.ts:86`) – App-Datei 2,65 MB, `companion.mjs` 2,1 MB (gemessen an den vorhandenen Build-Dateien).

### C3 Was ein „Ein-Knopf-Update im Werkstatt-Netz" braucht

Befund, der es leicht macht (Beleg): Dateien in `~/lowrider` gehören dem Dienstbenutzer (`setup.sh:84-93`), der Dienst hat `Restart=always`, `RestartSec=3` (`setup.sh:133-134`). **Der Companion kann seine eigenen Dateien (`companion.mjs`, `app/index.html`) ersetzen und sich beenden; systemd startet ihn neu – ohne root.** Nur neue Pakete, neue Unit-Dateien oder eine neue Node-Version bräuchten `setup.sh` bzw. Internet.

| Baustein | Inhalt | Aufwand (Vermutung) |
|---|---|---|
| Paketformat | Aus `bundle.mjs` ein einzelnes `lowrider-update.tgz`/`.json` mit `companion.mjs`, `index.html`, `app/*`, `manifest` (Version, SHA-256 je Datei, Fähigkeiten). **Zip eignet sich schlecht:** `unzip` steht nicht in `PACKAGES` (`setup.sh:47`), Node hat `zlib`, aber kein Zip-Leser. | S |
| Endpunkt | `POST /api/system/update` (Oktettstrom, schon erlaubt `server.ts:80-83,86`), nur wenn Maschine **Ruhe** und kein Streaming-Job über das Relais läuft (ein Neustart des Companion bricht einen gestreamten Job ab; SD-Jobs laufen in FluidNC weiter, Vermutung). Schreiben in Temp-Datei, `rename`, alte Fassung als `.prev` behalten, dann beenden. | S–M |
| Prüfsumme/Signatur | SHA-256 genügt gegen Übertragungsfehler. Gegen fremden Code im WLAN: Ed25519-Signatur (`node:crypto`, öffentlicher Schlüssel im Companion, privater beim Betreiber, beim Bündeln signieren). | M |
| Rückfall | Dienst startet mit neuer Datei nicht → alte zurück (z. B. `ExecStartPre`-Skript, das nach N Fehlstarts `.prev` zurückkopiert) und App fragt `/api/health` ab, bis die neue Version antwortet. | M |
| Berechtigung | Wer darf hochladen? Heute jeder im WLAN (kein Login). Mindestens: Update nur mit PIN/Einmalcode, der auf dem Pi angezeigt oder in `/etc/lowrider.env` steht, plus Signatur; Hochladen = Programmcode auf dem Pi ausführen → ohne Schutz ist das Fernausführung für alle im Netz. | M |
| Oberfläche | Karte in `CompanionCard`: Datei wählen (PC und iPad können das über den Dateidialog), Version alt/neu, „Einspielen" (Halten), Fortschritt, Wiederverbindung, Fehlertext. | S–M |
| Tests | Endpunkt, Prüfsumme, Fehlpfade, Zustandsmaschine; Pi-Skripte sind nicht automatisch testbar (nur Hardware). | M |

Gesamt grob **M–L (etwa 3–6 Tage, Vermutung)**; ohne Signatur und Rückfall S–M.

### C4 Betreiberfrage „Netzwerkwechsel, USB oder Bluetooth?"

**Antwort (teils Vermutung):** Nein. Pi und PC hängen im selben Router-WLAN (`01-fakten.md` Hardware und Netz); `scp` läuft heute schon darüber (`docs/companion.md` Punkt 3). Ein Browser-Upload an den Companion nutzt dasselbe Netz, ist für PC **und** iPad (Dateidialog) möglich und braucht weder USB noch Bluetooth. Internet brauchen nur (1) die erste Einrichtung des Pi (apt, NodeSource) und (2) der PC, **wenn** er die Release-Datei erst bauen/herunterladen muss – das ist der eigentliche Netzwechsel, nicht der Weg zum Pi. Ein vorab gebautes Paket kann per USB-Stick oder beim Besuch in einem Netz mit Internet auf den PC kommen (Vermutung).

### C5 Ablage von Projekten und Einstellungen, Sicherung

| Was | Wo liegt es heute | Beleg |
|---|---|---|
| Werkzeuge, Materialien, gespeicherte Nullpunkte, Historie, Vorrichtungen, Lernmodell | Browser (localStorage) **und** Pi (SQLite `documents`), Abgleich/Mischen per Knopf „Bibliotheken abgleichen" und bei Änderung (`store/workshop.ts:382-449,484-540`; `apps/companion/src/db.ts`). Lernmodell wird nur hochgeladen, nicht beim Abgleich zurückgelesen (`:449` vs `:489-495`). | siehe links |
| Job-Puffer (G-Code-Dateien) | Pi (`/api/jobs`, Tabelle `jobs`), Knopf „Im Companion ablegen" | `server.ts:192-204`, `lib/companion.ts:209-221` |
| Aufnahmen (Zeitraffer/Video) | Pi, `~/lowrider/data/recordings/` | `main.ts`, `recorder.ts` |
| **CAM-Zeichnung („Projekt")** | **nirgends gespeichert**: kein Speichern/Laden in `store/cam.ts` (keine Persistenz-Aufrufe, `grep persist|localStorage` ohne Treffer), nur Rückgängig-Verlauf im Speicher (`HISTORY = 100`). Einziger Ausgang: G-Code-Datei herunterladen (`CamCard.tsx:519-523`). | **Projekte speichern: fehlt** |
| Zuletzt verwendet | Browser: 6 Jobs, Programmtext bis 400 kB (`store/recent.ts:36-41`), nicht auf dem Pi | |
| Einstellungen (inkl. Kamerakalibrierung, Park, Werkzeugwechsel-Position), Aufbau (Rohteil, Spannmittel), Makros, Wenden-/Abschnitts-Zustand | **nur Browser** (`workshop.ts` `KEYS.settings/setup`, `store/macros.ts:3-5`, `flip.ts`, `sections.ts`) – nicht mit dem Pi abgeglichen. `docs/companion.md` nennt `macros`/`profiles` als mögliche Sammlungen; der App-Code schreibt sie nicht (Suche in `store/`, `lib/`, `components/`). | |
| Fotokarte | nur im Speicher, keine Speicherung gefunden (`store/photomap.ts`, keine Treffer für storage/persist) | |
| **Automatische Kopie/Sicherung auf dem Pi** | **fehlt**. Suche `backup|sicherung|cron|.bak` in `apps/companion/src/**`, `scripts/**`, `docs/companion.md`: keine Treffer. Die einzigen „Sicherungen" sind `config.yaml.bak` auf der **FluidNC**-Seite (`MachineLimitsCard.tsx`, `ConfigFileEditor.tsx`). SQLite im WAL-Betrieb (`db.ts`), einfach zu kopieren. | |

**Wie eine automatische Kopie aussehen könnte (Vorschlag, Vermutung):** Companion schreibt täglich und nach jedem Abgleich `VACUUM INTO 'backup/lowrider-JJJJMMTT.db'` (SQLite, eine Datei, konsistent), behält die letzten N (z. B. 14), plus Download-Knopf; zusätzlich Projekt-Ablage: neue Sammlung `cam-projects` (CAM-Zeichnung als JSON: `items`, `placement`, `settings`) mit „Speichern/Öffnen", dazu Einstellungen und Aufbau als Sammlung, damit ein Browserwechsel/iPad-Löschen nichts kostet. Aufwand: Sicherung S–M, Projekte speichern/öffnen M (Datenmodell `CamItem` ist bereits eine reine JSON-Struktur mit `source` und `placement`, `lib/camItems.ts:19-60`), Einstellungen auf den Pi M. Auf SD-Karte schreiben: Verschleiß beachten (Vermutung); die Sicherung gehört auch auf USB-Stick oder ein anderes Gerät, sonst fällt sie mit der Karte aus.

---

## D) Fahren, Steuerung, Start (Abschnitte 6 und 7)

| Anforderung | Stand | Beleg (Code / Test) |
|---|---|---|
| Schrittweiten 0,01 · 0,1 · 1 · 10 · 100 mm | vorhanden | `lib/jog.ts:11-14` (`JOG_STEPS`, `JOG_STEP_FAR = 100`), `store/jog.ts`; e2e `jogs continuously while held and stops on release` (control.spec.ts:650) |
| Dauerfahrt (Taste halten) | vorhanden | `store/jog.ts` `jogHold`; e2e dasselbe; verlorener Fokus lässt los (`lib/holds.ts`) |
| Joystick in der App | vorhanden | `components/JogStick.tsx`, eingebunden `JogCard.tsx:498`; Joystick auf der Bühne umschaltbar (`erste-schritte.md:179`); nur Simulator getestet |
| Tastatur | vorhanden | Pfeile X/Y, Bild↑/↓ Z, Ziffern = Schrittweite, Esc stoppt (`JogCard.tsx:161-196`, `lib/shortcuts.ts:258-308`) |
| Tasten am Bildschirm, Tippen aufs Bild | vorhanden | `JogCard.tsx`; „Hinfahren" aufs Kamera-/Tischbild, e2e `drives to a tapped point on the camera picture and on the table` |
| Park-Position | vorhanden (eine) | `JogPanel.tsx:18-60`, Schnellknopf Halten `JogCard.tsx:371-380` (`goToPark`) |
| Nullpunkt anfahren | vorhanden | `JogCard.tsx:374` (`goToZero`, Halten) |
| Werkzeugwechsel-Position | teilweise | Position einstellbar (`WorkshopSettingsCard.tsx`, `store/workshop.ts:79`), wird **nur automatisch** beim M6-Halt angefahren (`store/machine.ts:1010`, `store/run.ts:148`); **kein Knopf** „Werkzeugwechsel-Position anfahren" (`JogCard.tsx:371-380` hat nur Nullpunkt/Park/Referenz) |
| Eigene Merkpunkte | **fehlt** (Umweg) | `SavedZero` (`packages/workshop/src/zeros.ts:16`) sind **Arbeitsnullpunkte** (G54–G59-Offsets mit Foto), kein „Fahre dorthin". Umweg: Makros mit G-Code (`MacroEditor.tsx`); die Makros bleiben im Browser. S–M für benannte Positionen (Liste in Einstellungen + Haltenknopf `moveTo`). |
| Werkzeugwechsel von Hand mitten im Job | vorhanden (nur Streaming) | Streamer hält an jedem M6 (`fluidnc-client/src/streamer.ts:70-75`), `ToolChangeCard.tsx` (Spindel aus, Z hoch, Wechsel, Länge messen, weiter, Halten); e2e `streams a job and holds at each tool change` (control.spec.ts:553). Von der SD-Karte gestartet läuft M6 durch (`offene-fragen.md`, „M6 und M1"). CAM erzeugt nur einen Fräser je Programm. |
| Start per Halten | vorhanden | `ActionBar.tsx:192-201` (HoldButton, 1000 ms); e2e `⑤ the start is the one action bottom right, a hold – never a stray tap` (steps.spec.ts:59) |
| Pause per Tipp, nie gesperrt | vorhanden | `PauseButton.tsx` (reagiert beim Aufsetzen, nie deaktiviert); e2e `PAUSE: on every screen, one tap holds the feed…` (find.spec.ts:395) |
| Pause per Leertaste | vorhanden | `store/keys.ts:48`, `lib/shortcuts.ts:115-117`; derselbe e2e-Test (Leertaste hält den Vorschub, solange etwas fährt) |
| Fortsetzen „ein Tipp" | **teilweise / uneinheitlich** | Hauptknopf: **Halten 500 ms** (`ActionBar.tsx:143`, Kommentar „never the second half of a double tap"); in der `RunBar` (Seitenbereiche) ein **einfacher Tipp** (`RunBar.tsx:36`, `onClick={cycleStart}`). S, wenn der Betreiber überall Tipp will. |
| Sprache DE/EN | vorhanden | `WorkshopSettingsCard.tsx:71-74` (Umschalter), `i18n/language.ts`; e2e `switches the interface to English and back` (control.spec.ts:1257) |
| Rattern-Warnung (Sensor) | vorhanden, **ohne Hardwaretest** | FFT-Erkennung `packages/workshop/src/chatter.ts:77`, `apps/companion/src/sensors.ts:72`; Warnung `SensorPanel.tsx:31-35`; Skript `scripts/pi/lsm6dso.py` mit 6 Tests; `docs/companion.md`: „noch nicht am echten Sensor getestet" |
| Zuletzt verwendet | vorhanden | `store/recent.ts` (6 Jobs, nur Browser) |
| Projekte speichern | **fehlt** (CAM-Zeichnung), siehe C5 | |
| Export | teilweise | G-Code-Download (`CamCard.tsx:519-523`, `lib/download.ts`); kein Export der Zeichnung (DXF/SVG/Projektdatei) – Vermutung aus fehlenden Treffern |
| Verbindungsabbruch im Job: Maschine läuft weiter, rote Meldung | nicht geprüft | Abschnitt 7 liegt außerhalb meines Auftrags (Sicherheitsteil) |

---

## Wichtigste Lücken je Abschnitt (zusammengefasst)

- **CAM (4):** kein Freihand/Polylinie/Bezier, kein Nesting, keine Boolean-Bedienung (Clipper-Algorithmen **vorhanden**, nur nicht angebunden), keine Bemaßung/Abhängigkeiten, keine Ebenen, Text nur Einstrichschrift; Strategien Wirbelfräsen, adaptiv, Restmaterial, 3D alle **fehlend** (3D = XL, adaptiv L–XL); Gleich-/Gegenlauf nur global (S-Aufwand je Bearbeitung); Schnittwerte nicht im Werkzeug (S–M).
- **Kamera (5):** ±0,2 mm und < 30 s **nicht gemessen**; Technik trägt es höchstens im Fadenkreuz-Weg, nicht beim Tipp am Bildrand.
- **Updates (8):** kein Update-Endpunkt, kein Knopf; Technik für Selbstaustausch ohne root vorhanden; Projekte/Einstellungen nicht auf dem Pi, keine Sicherung.
- **Fahren (6, 7):** Merkpunkte fehlen, Werkzeugwechsel-Knopf fehlt, Fortsetzen uneinheitlich (Halten/Tipp).

## Nicht geprüft

- Alles, was echte Hardware braucht: Kamera (Auflösung, Abstand, Schärfe, Latenz, Bildrate über WLAN), Genauigkeit, Dauer an der Maschine, Sensor, Jog an der echten Steuerung, `setup.sh` auf einem Pi (nur gelesen, nicht ausgeführt), Raspberry-Pi-OS-Verhalten (Node-Version, `sudo`).
- Abschnitt 2 (Bereichs-Oberfläche), Abschnitt 3, 9 und der Sicherheitsteil von 7 (Verbindungsabbruch, Prüfungen vor dem Start).
- Tatsächliche Bedienbarkeit der CAM-Oberfläche (nur Code/Tests gelesen, App nicht bedient); Grenzen der Bahnabstand-Eingabe im CAM.
- Geometrische Richtigkeit der Bahnen bei Selbstüberschneidung (nur: wirft nicht, kein `Problem`); G-Code-Ausgabe (`gcode.ts`) und Simulation.
- Test-Läufe der Projekt-Testsuite habe ich nicht angestoßen (nur eigene Wegwerf-Tests); 112/555/… Tests aus den Fakten sind nicht nachgezählt.
- `docs/projektbeschreibung.md` und weitere Dokumente nur punktuell per Suche; Aussagen zu Kameratyp stützen sich auf `einkaufsliste.md`, nicht auf eine Bestätigung, was verbaut ist.
- Aufwandsschätzungen sind Schätzungen, nicht durch Probearbeit gedeckt.
