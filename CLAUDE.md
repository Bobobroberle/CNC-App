# LowRider Control – Notes for Claude Code

Browser UI for a V1E LowRider v4 CNC on a Jackpot board (FluidNC). Project brief (German):
`docs/projektbeschreibung.md`. **Binding UX/HMI guide (German): `DESIGN.md`** – it applies to every new or
changed screen and wins where an older rule here says otherwise. Open hardware questions: `docs/offene-fragen.md`. Ideas backlog: `docs/ideen.md`.

## Commands

- `pnpm install` – workspace install (pnpm 10)
- `pnpm check` – typecheck + coverage + build for all packages; run before every commit
- `pnpm --filter @lowrider/gcode-core test -u` – accept intended golden-file changes (the same for
  `@lowrider/cam`: `test/golden/schild.nc` is a whole program; read the diff before accepting it)
- `pnpm e2e` – Playwright UI tests (builds and previews `apps/control`); projects `tablet`, `desktop` and
  `ipad` (touch tests in `e2e/ipad.spec.ts`, real multi-touch through CDP; the two-sided flow on the
  simulator in `e2e/flip.spec.ts`, series and jigs in `e2e/series.spec.ts` / `e2e/jigs.spec.ts`, the quick search in
  `e2e/find.spec.ts`,
  parts cut in sections on the simulator's long board in `e2e/sections.spec.ts`, the areas of the work –
  the start, its confirmations, the overrides, a lost connection – in `e2e/steps.spec.ts`, the jog
  panel, the bottom sheet at 800 × 600, Service & Diagnose, the message centre and the phone in
  `e2e/areas.spec.ts`, the measured usability goal of DESIGN.md §11 in `e2e/usability.spec.ts`,
  connecting through the Pi, why it fails and coming back by itself in `e2e/connection.spec.ts`,
  FluidNC's limits on the simulator in `e2e/limits.spec.ts`, press and result feedback in
  `e2e/feedback.spec.ts`). A test
  holds a button with `hold`/`pressAndHold` (`e2e/helpers.ts`): they keep it down until its bar
  is full, never for a fixed time only; `goTo` unfolds the deeper levels of a step's panel).
  The preview server serves `dist` as it is: after a change run `pnpm build` (or `pnpm check`)
  before a single spec, and never build while a run is going
- `pnpm icons` – rasterise `apps/control/icons/icon.svg` into `apps/control/public/` (checked in)

## Conventions

- Code, identifiers and comments in English; all UI text in German via `apps/control/src/i18n/de.ts`
  (no literal UI strings in components).
- `gcode-core`, `fluidnc-client`, `workshop` and `cam` must stay at 100 % coverage (enforced by vitest
  thresholds): parser errors and wrong toolpaths are crash risks at the machine.
- Libraries are consumed as TypeScript source (`exports` → `src/index.ts`); there is no library build.
- Diagnostics use stable `DiagnosticCode`s; the UI translates them. New codes need a German text
  (checked by `apps/control/test/i18n.test.ts`).
- **`DESIGN.md` is binding and newer than the brief**: where it and an older rule disagree, the
  guide wins (it replaced "one stage + exactly three rooms" and "dark only"). What this file says
  about safety, holds, gestures, strict snapping, the offline single-file release, i18n, the 100 %
  coverage of the four libraries, the quick-search registry and `settled()` stays in force. The
  rebuild ran in three stages (11–13, done); `docs/umbau-guide.md` says where every old card lives
  now, where the app deviates from the guide and why, the acceptance per screen (§11) and what is left.
- **"Umbau 2" (`docs/umbau-guide.md`): six areas instead of the five steps – stages 1, 2 and 3 are in the code.**
  Tabs: Job · CAM (`cam`) · Einrichten (`setup`) · Fräsen (`run`, with the views Prüfen and Fräsen; the job's tools
  and the readiness list live in Prüfen) · Service · Einstellungen. Tool list and console stay in the menu. `tools` and
  `check` are no places any more (a stored one falls back to `run`). There is **no "Weiter: …" chain and no
  Ctrl+→**; the start screen stays and keeps its "Als Nächstes" recommendation (`lib/next.ts`). The primary action sits
  only where an area has one: Job without a program ("G-Code öffnen"), Fräsen (the start, pause, going on; "Prüfen"
  while the start is blocked; **nothing in the Prüfen view** while no job runs or waits; a job that _waits_ – a tool change, a single
  step, between two parts – forces the cutting view for everything that depends on the view (panel, action bar, the
  picture's timeline: one selector, `useRunView` in `store/runView.ts`; while a job waits the stored view of Fräsen is held at `cut` by one subscription – a tap, the search or a link
  inside a card cannot store the check then; a waiting job's tool-change card, the streamed one and the one between
  parts (`BetweenParts`, whose start is locked and confirmed like the bar's), stays under the picture with
  "Großbild"), while
  a job that merely runs can be looked at from Prüfen, where the action bar still offers the pause); Einrichten, CAM, Service, Einstellungen and the lists have
  none. The start lock stays: the readiness list and its "dealt with here" mapping stay. **In the CAM only the CAM and
  the status bar are shown** (no action bar and so no jog button, no run bar, no program card, no camera inset, no
  mode switch or stage tools; Einpassen and Großbild stay): `shellParts(place)` in `store/ui.ts` is the one predicate
  every piece of the shell asks (`App`, `Stage`, `setJogOpen` – which from the CAM opens the jog panel over Einrichten –,
  the search's `goTo`, `TableView`: no tap tool and no clamp reaches the finger there, no tool marks are drawn). The
  PAUSE and NOT-HALT, the alarm banner, the tool-change card and the critical message stay everywhere. **Stage 3 – the
  docked main action** (`ui/dock.tsx`, `.dock` in `rooms.css`): the card that has a main action puts it in a `Dock`, a
  sticky footer of the card at the bottom of the panel that scrolls – the one button stays in its card (never a second
  copy: `hold(page, /name/)` and screen readers find one). It is in `SetZeroCard` ("Nullpunkt hier setzen"),
  `ProbeCard`/`ProbeWizard` (the probing start) and `ToolChangePanel` (going on and giving up – so they stay in reach in
  the strip under the picture with "Großbild", where `SingleStepPanel` also lies). Sticky stops silently if any ancestor
  between the button and `.panel-body` clips (`overflow`); `e2e/dock.spec.ts` and the geometry checks in
  `control.spec.ts` measure (`inReach` in `e2e/helpers.ts`: the control's box lies inside the scroll box _and_ a touch at
  its middle reaches it – `toBeVisible` cannot see clipping). A `.panel-body` that holds a dock has `scroll-padding-bottom` (`:has(.dock)` – a padding elsewhere would scroll things that are in view, which `e2e/areas.spec.ts` caught in the jog panel) so a control
  brought into view stops above the dock (`.stage-prompt:has(.dock)` too). **What a docked action leaves behind** (a result, a
  warning) lies in the card's flow below the stuck dock: put it in `<Result>` (`ui/dock.tsx`), which brings it into view once when it
  shows. Two actions side by side are `<Dock className="dock-row">` (24 px apart, as low as one button's – the tool change).
  **Deliberately not docked:** the CAM hand-over (one tap that replaces a
  program that is not the drawing's own – next to content that is being edited it would invite a slip), and anything
  in the action bar. On the machine's small screen the sheet at "half" is too short for a card and its dock beside the
  row above it (800 × 600: ~100 px of body): the sheet's "Größer" is the way (the spec measures at that rest).
- **Merkliste** (the living checklist of what is deferred or wished for: the artifact "LowRider Ideenliste",
  <https://claude.ai/artifact/EC2LME1AYPN14P4B6ZXNmi>, a page with the `db` capability; the operator ticks it too): the page is data-driven –
  collections `cats` (`title`, `note`, `order`) and `items`, one document per entry (`cat`, `grp`, `title`, `text`, `kind` =
  vorhanden | klein | gross | forschung | hardware | aufgabe, `done`, `want` = the ★ "will ich haben", `building` = "in Arbeit", `src`
  = claude | migriert | user, `added`, `doneAt`, `order`). **Content goes through the `ArtifactData` tool (set / update / batch), never by
  republishing the page.** The catalog and a markdown copy live in the project: `docs/merkliste.katalog.mjs` (source),
  `docs/merkliste.md` (generated: `node scripts/merkliste.mjs md`; `seed <dir>` writes one JSON file per document for a new database).
  Rules: **a recommendation that is not built now becomes an entry** (catalog + db, `src: 'claude'`, honest `kind`); when something lands,
  set `done` and clear `building` (never leave `building` on what did not land); **at the start of a session that plans work or touches
  the list, read the db (`ArtifactData list items`) – the operator's ★ and ✓ are decisions** – fold changes back into the catalog flags
  and regenerate the md; an entry says only what was measured or read (no promised accuracy); `u…`/`k…`/`p…`/`h…`/`o…` ids are the
  older Ideenliste, `src: 'user'` entries are the operator's own.
- Navigation (`store/ui.ts`): a `Place` is `start`, one of the three areas of the work `job`, `setup`, `run`
  (Job, Einrichten, Fräsen), the drawing workspace `cam`, or an area `toollist`, `service`, `settings`, `console`
  (the console only with the expert switch). **The one way into the CAM is `openCam()`** (`store/camPlace.ts`: an
  empty drawing where there is none, the table from above – it never unloads a loaded program or a running job;
  tab, "Zeichnen" button, quick search and the series flow all use it); `leaveCam()` goes back to the Job. The tab
  row (`NavRow`) holds Job · CAM · Einrichten · Fräsen · Service · Einstellungen with the short names `nav.tabs`;
  below 1100 px only the current tab keeps its name, the others keep theirs in the markup, clipped, so they stay
  named for assistive technology; with an area of the menu open the menu button is wider and the quick search and the
  names give way sooner. `e2e/areas.spec.ts` measures the row at 640–1400 px (no overlap, tappable, named). Fräsen has
  the views Prüfen (`check`) and Fräsen (`cut`); `go('run')` without a view opens `cut`. At most two levels:
  a place may have views (`VIEWS`; `SubNav` – Service: Diagnose · Meldungen · Historie ·
  Kalibrieren; Einstellungen: Verbindung · Maschine · Kamera · Experte). The jog panel is no place:
  `jogOpen` lays it over the context panel of any place. **A side area that is a list has no
  picture** (`placeHasStage`): its cards lie in a grid across the main area (`.area-panel`; a grid,
  not CSS columns – a card that unfolds must not make its neighbours jump); only calibrating and
  the camera's settings keep the stage, and the jog panel brings it back over any list. Whatever
  must show everywhere (the alarm banner) is therefore not a child of the stage alone. Areas can be jumped to freely;
  Job, Einrichten and Fräsen show ✓ ⚠ ✕ ○ read from the one readiness list (`lib/readiness.ts` → `lib/steps.ts`: a
  point belongs to the area it is dealt with in – the check points, the tools and `busy` belong to `run`); CAM and
  the side areas show no state. The start in Fräsen is possible only when nothing blocks. The place contents are plain
  compositions of the cards: `components/places/Steps.tsx` (`JobStep`, `CamStep`, `SetupStep`, `RunStep`),
  `places/Areas.tsx`, `JogPanel.tsx`.
- The areas of the work (DESIGN.md §5; `docs/umbau-guide.md` says what each shows and where it deviates):
  each answers one question and brings its stage view (`STEP_STAGE` in `store/ui.ts`: Job and CAM table,
  Einrichten the live picture where a calibrated camera runs, Fräsen 3D; a view chosen by hand stays that
  area's, `stageViews` – except the CAM, which always opens on the table). **Depth per area** (§2) is `components/Depth.tsx`: what is needed every
  time stands open, the rest goes under "Mehr Optionen" / "Alle Parameter" (`useUi.depth`,
  remembered); a recommended value carries `Recommended`, one that differs `Deviation`.
  - **Fräsen, view Fräsen** (`RunScreen.tsx`): **the start is the action bar's primary action and a hold**
    (`ActionBar` → `requestStart`); everything it hangs on is `useStart()` (`store/start.ts`), so
    bar, panel and confirmation never disagree. What must be confirmed before a start (§6.4: no
    zero, tool below the safe height while the program travels first, a probe as the tool) is
    pure in `lib/startChecks.ts`; the hold then opens `StartConfirm` instead of starting, and the
    start is a second hold in there (zero and Z once per job, a probe every time). While a job
    runs: figures in 48–72 px, `Override` (50–150 %, `clampOverride`; a slider never without ±
    and "100 %"), pause as the primary action, going on as a hold, abort through `AbortDialog`.
    At the end `useRun.summary` and "Nächstes Teil: gleicher Job" (`nextPiece` – it starts
    nothing). A connection lost during a job sets `useMachine.lostInJob` → `CriticalLayer`
    (acknowledged by the operator; **after a connection lost during a job the app never reconnects by
    itself** – not until the operator has connected by hand; outside a job it may, see Connecting).
  - **Einrichten**: `SetZeroCard` is the one way to the zero (tap shows the target → hold to
    drive → fine steps → hold to set); `ZeroHistoryCard` restores X/Y of the zeros a job was cut
    with; `ProbeTiles` are the probing assistants (a sketch with the direction each) – a cycle
    only measures, the result shows the deviation and is applied or discarded.
  - **Job**: `JobDashboard` (loaded job as a card, `lib/preview.ts` for its picture, the drop
    zone as the empty state), `store/recent.ts` ("Zuletzt verwendet", `openJobFiles` for one or
    several files, the zeros a job was started with), `WorkpieceCard` (material, stock).
  - **Fräsen, view Prüfen – the job's tools**: `JobTools.tsx` over `useJobTools` (`store/jobTools.ts`) and the pure
    `lib/jobTools.ts` (state, issues, alternatives). `Tool.probe` marks a probe.
  - **Fräsen, view Prüfen – the check**: `Timeline.tsx` under the 3D picture (in the panel while the stage shows
    something else), operations from `lib/operations.ts` – only what the program itself names,
    nothing guessed; the checklist is the readiness list (`depth`, `tools`, `limits` are its
    its checks).
- Shell (`App.tsx`, DESIGN.md §4): `StatusBar` (the same on every screen: state badge with icon and
  word, X Y Z (A), spindle, feed, connection, messages flag, PAUSE, NOT-HALT) · `NavRow` (Start,
  the six tabs, quick search, the menu with the tool list and the console – its button carries the open area's name) ·
  main area with the stage and the context panel ("Großbild" puts the panel away; 600–1023 px or
  upright: the panel is a `Sheet` along the bottom with three rests – `peek` (its handle), `half`
  (where it starts: below the picture, never over it) and `full` – moved by labelled buttons in the
  handle only, remembered per place (`useUi.sheet`), and refused while anything is held
  (`holdCount()`); < 600 px: `Monitor`, watching only: progress, state, position, the picture,
  abort through `AbortDialog`) ·
  `ActionBar` (left: Jog; right: the primary action where the area has one, never more than one – on Start
  the "Als Nächstes" recommendation of `lib/next.ts` with its action, in Fräsen the start itself; no "Weiter" and no
  key for a next step). The status bar must fit at
  every width without squeezing PAUSE or NOT-HALT: the numbers give way first.
- **PAUSE and NOT-HALT** sit top right in the status bar, ≥ 24 px apart. PAUSE (`PauseButton`) is
  feed hold: one tap, no question, never disabled, never covered; like NOT-HALT it acts on
  `pointerdown` and carries `aria-live="off"`. It only holds – going on is a deliberate step in ⑤.
- Principles kept from the brief: jobs start from the SD card by default (`store/run.ts`),
  streaming is the second way; ≥ 48 px targets (56 px on the machine's own touch screen: coarse
  pointer **and** < 1024 px), dangerous actions via `HoldButton`, colour only with meaning.
- Look: **coss ui** (<https://coss.com/ui>, copy-and-own components on Base UI, styled with
  Tailwind CSS v4) stays the technical base; **the look is DESIGN.md §7**: its tokens in
  `apps/control/src/styles/theme.css` (the guide's names map onto the coss names there – note that
  coss's `--accent` is the hover surface, the guide's blue accent is `--primary`), radius 8 px for
  controls and 12 px for cards, depth from the lightness of a surface (no shadows), Inter for the
  interface and JetBrains Mono for G-code/console, tabular figures. **Two themes**: dark (default,
  `class="dark"` on `<html>`) and light, chosen under Einstellungen → Maschine → Darstellung and
  remembered (`useUi.theme`, `applyTheme`); the app re-mounts on a change so the stage pictures
  read their colours anew. `test/theme.test.ts` holds both themes to the guide's contrasts.
  Colour keeps its meaning: `primary` (blue) = the one primary action, selection, "runs";
  `success` = done; `warning` = attention, paused; `probe` (violet) = probing; **`destructive`
  (red) = fault, alarm, critical and NOT-HALT – nowhere else** (a toolpath in the material is the
  accent, a hold for something that cannot be taken back is neutral). A state never shows by
  colour alone: icon and/or word. The stage pictures (canvas 2D, three.js) cannot parse
  `color-mix`/`oklch`, so they read the plain `--stage-*` colours defined per theme beside the
  tokens. Icons of the shell are Lucide (`lucide-react`), always with a label.
- Components (`apps/control/src/ui/`, owned source, licence note in `THIRD-PARTY.md`): Button, Card,
  Alert, Badge, Field/Label/Input/Textarea, Checkbox, SegmentedControl, Tabs, Collapsible
  (through `components/Fold.tsx`: `Section` and every folded part; it unfolds at once, so a control inside never moves under the finger), Dialog, ScrollArea, Progress,
  Kbd – plus our own: `NativeSelect` (a native `<select>` in the Input's look: the iPad's own picker
  is the better list) and the guide's components `Stepper`, `StatusBadge`, `Dro`, `Toast`,
  `Reason` (`tooltip.tsx`: why a control is disabled, on tap – never hover alone), `Sheet` (bottom
  sheet with three rests and labelled buttons in its handle) and `Numpad`. **To add one:** fetch `https://coss.com/ui/r/<name>.json`, put its file into
  `src/ui/` with relative imports, format it with prettier, and give it the app's touch size there
  – never per use. **Touch first:** every control is ≥ 48 px (`--target`, utilities `min-h-target`,
  `size-target`; 56 px on the machine's touch screen); the dense `sm:` desktop sizes of coss are removed in the owned files, text in
  fields is ≥ 16 px. **Offline:** the release is one HTML file for a network without internet – no
  CDN, no font or script fetched at run time; Inter and JetBrains Mono (latin) are bundled from
  `@fontsource-variable/*`. Use the components instead of new classes; the old vocabulary
  (`btn`, `card`, `notice`, `field`, `row`, `muted` …) is gone – layout is Tailwind utilities.
- What stays hand-written lives in small named files under `src/styles/` (unlayered, so they can
  size a coss component in its context): `shell.css` (app grid, status bar, row of the steps,
  action bar, Start, sheet, phone),
  `stage.css` (stage head, tool panels, insets, gauges, camera), `controls.css` (NOT-HALT, PAUSE,
  hold, jog pad, joystick, wheel – controls with their own event handling, never library buttons),
  `rooms.css` (rows and lists inside cards), `find.css`, `print.css` (the tag page: black on white,
  millimetres).
- NOT-HALT, PAUSE and dialogs: a dialog never covers them and never makes them inert.
  `ui/dialog.tsx` forces `modal="trap-focus"` and portals every dialog into the `DialogLayer`, a
  cell of the app's grid below the status bar; `EStopButton` and `PauseButton` carry
  `aria-live="off"` because Base UI hides everything outside an open dialog from assistive
  technology except live regions. At most one dialog at a time. `HoldButton`, the jog buttons,
  PAUSE and NOT-HALT are native `<button>`s with their own pointer handling that only take the
  look (`buttonVariants`). A folded part unfolds for the quick search through `registerFold`
  (`lib/reveal.ts`), never through a click or an event sent for the operator.
- Motion (Apple fluid-interface rules): springs from `apps/control/src/lib/spring.ts`, starting from
  the on-screen value so every motion can be grabbed; press feedback instant, release eased; honour
  `prefers-reduced-motion` / `-transparency` / `-contrast`. Never animate NOT-HALT or alarms, never
  delay a machine command for an animation, momentum only for the view, never for machine motion.
- Touch (iPad home-screen app, `docs/ipad.md`): the stage views share one gesture layer
  (`lib/gesture.ts` + `components/usePanZoom.ts`: pan, pinch, double tap, momentum, soft limits) –
  gestures move views, never the machine. Anything held to move or confirm registers in
  `lib/holds.ts` and must let go on slide-off, `pointercancel`, a second finger (HoldButton) and
  when the app is left. NOT-HALT acts on `pointerdown`. Numbers are typed into text fields with
  `inputMode="decimal"` and read with `parseNumber` (`lib/format.ts`, comma or point); touched
  with a finger or pen such a field gets the app's own number pad instead of the system keyboard
  (`components/NumpadLayer.tsx`, `lib/numpad.ts`: ±, decimal sign, unit from the label) – the
  field keeps the focus, so a hardware keyboard still types into it; a new number field needs
  nothing but `inputMode`. Layout keeps
  clear of the safe-area insets and of the on-screen keyboard (`lib/platform.ts`); typed text is
  ≥ 16 px. Icons and manifest are files beside `index.html`, shipped by `scripts/bundle.mjs` and
  `scripts/pi/setup.sh`.
- Stage tools (`components/StageTools.tsx`, state in `store/tools.ts`): a tap on Tisch or Kamera
  arrives as a machine XY point; a thing already on the picture (a tapped point, a clamp) is taken
  through the view's `grab` (`usePanZoom`) and then follows the finger instead of the view. A tool
  with choices shows them before the first tap (`always`), small and tap-through. Clamps are
  `setup.fixtures`: X/Y in machine coordinates (they stay on the table when the work zero moves),
  Z as height above the work zero; everything that checks or draws them goes through
  `lib/clamps.ts` / `store/clamps.ts`. Snapping on the live picture (`lib/markers.ts` holes,
  `lib/corner.ts` workpiece corner/edge) must stay strict: no clear feature, no snap.
- CAM (`packages/cam`; workspace `components/CamCard.tsx` with `CamAdd` and `CamArrange`, state in
  `store/cam.ts`): the workspace is a direct drawing tool in one short sequence – Zeichnen (one tap
  adds a shape, a text or a file; the selection's numbers and actions right below) → Wie (operation,
  depth, tool) → Ansehen und übergeben – and a new option goes on the item's row only where it
  applies (the corner choice shows only for contours that have such corners). No form before
  adding: `addSketch` puts the thing on the table at once, selected, where it is seen
  (`lib/tableBox.ts`); the table picture is the preview. A drawing is a list of items
  (`lib/camItems.ts`); each keeps its `source` contours and a `placement` matrix, and arranging
  composes matrices, never rewrites points. A drawn item also keeps its `sketch` (its own measures,
  `packages/cam/src/sketch.ts`): `source` is made anew from it around the sketch's own origin, so a
  measure changes the shape, not the placement's scale; contours from a file have none and scale
  evenly. The selected item's frame, its handles (corners and sides for the size, a dot to turn)
  and what a pulled handle means are pure in `lib/camEdit.ts`; handles are taken through the
  view's `grab` before anything else (48 px target, drawn small), and a grab of the drawing `yields`: a
  second finger lets go of it (clamps and tapped points keep ignoring further fingers). Every change of the drawing goes through `remember` in the store (undo/redo;
  changes of one field in a row are one step) – so nothing asks for confirmation. The keys
  (`lib/camKeys.ts`, hook in `CamCard`) act only while the workspace shows and no field has the
  focus, and never reach the machine. All geometry lives in
  the library with hand-checked numbers: `textContours` (our own single-line font, glyph data in
  `font.ts`), `readSvg`/`readDxf` (what they skip comes back as stable codes, German texts under
  `cam.notes`), `reliefCorners`, and `toolpaths`, which orders the cuts itself (holes, pockets,
  engraving, cut-outs, outlines last; what lies inside a contour before it) and puts tabs at fixed
  places of the drawn contour (`tabPoints`), so roughing and finishing lift at the same spots. On
  the table a finger takes a part by its line (a text by its box, a small selected part anywhere in
  its frame) and a tap selects; inside a shape the finger moves the view. The toolpath is made anew
  when the finger lets go, not while it moves; a drawing with nothing to cut takes its job off the
  stage (`useJob.unload`).
  **The drawing never changes the program under a job that is under way** (`jobUnderWay()` in
  `store/underway.ts`, pure `underwayOf`: a part running from the SD card, a stream, an upload, a multi-tool job
  waiting between its parts, a job the link was lost under until the operator has seen it, **or the controller itself
  reporting an SD file running** (`status.sd` with Run/Hold/Door – a page reloaded under a job, a link made again by
  hand; a move of the app's own is `Run` too, but has no SD file and is no job) – the series flow uses the same answer):
  `generate()` and `offStage()` leave the table alone and set `useCam.ahead` (only if the program would differ); the
  drawing can be worked on meanwhile, and `TableView` draws and edits it whatever program lies on the table. **What
  is "its own" program** is `ownsTable()` (the file the drawing last put there – `useCam.table`, which survives the
  rename its first import gives it – or its names now); **a program that is not its own** (a file opened since, the
  aligned back) is replaced only by `generate({ take: true })` / `remake({ take: true })` – the tap on "Zeichnung auf
  den Tisch legen", the hand-over, the series closing over its own program – never by an edit. When a job ends, a
  drawing that is `ahead` goes on the table by itself only where nothing is loaded and the end was seen while
  connected; the program of a finished job stays – with its summary, also when the drawing is emptied (`offStage`) –
  until that tap, **as long as the drawing was ahead of it**; a drawing that did not change during the job follows
  the edits as always. **Project files** (`lib/camProject.ts`, `saveProject`/`openProject` in `store/cam.ts`, buttons "Projekt
  speichern" in "Ansehen und übergeben" and "Projekt öffnen …" under the shapes): the drawing (sketches, contours as `source` +
  `placement` – never the derived `contours` –, how each part is cut, the two-sided state, the cutting settings) as
  `*.lowrider.json`, format `lowrider-cam-project` version 1. Reading is strict and refuses with stable codes (`too-large`,
  `invalid-json`, `wrong-format`, `newer-version`, `invalid-project`; non-finite numbers, duplicate ids, 2000 items / 400 000
  points; a name with control characters or over 120 characters – it goes into the program header and the file name –, ids that
  are no safe integers, a circle that is not where its polygon is, a back side without the two-sided state, a part deeper than
  100 mm); the cutting settings are held to fixed ranges (`SETTING_RANGES`: stepdown ≥ 0.05, tabs ≤ 50 …) and **one outside is
  left out, not refused** (what is set now stays); a sketch or text style that cannot be trusted is dropped (the item keeps its
  contours); a cutter the workshop lacks stays the chosen one and is said, and so is one of the same id with another
  diameter (`toolDiameter` is in the file). Opening is **whole or not at all** (it catches what `generate` throws and puts
  everything back), replaces the drawing in one step of undo that carries the **name and the settings** too (`Snapshot.name`/
  `settings`, `alongWith` for the way forward), raises the id counter above the file's,
  and **never loads a program itself** – it goes through the drawing's own `update`, so the job lock and the "not its own
  program" rule hold. A part may have its own direction (`CamItem.climb` → `Operation.climb`, falling back to the job's).
  **Holding tabs** (`Tabs` with optional `at`, `tabSites`/`nearestOnContour`/`contourSpan` in `packages/cam/src/toolpath.ts`; app side
  `lib/camTabs.ts`, `CamItem.tabSpec`, `components/CamTabs.tsx`): **one function gives the sites – `tabSites(contour, tabs)` – and both the
  toolpath (`cut` → `loopWalk`) and the table's drawing ask it, so what is drawn is what is cut.** A site is a fraction `0 ≤ u < 1` of the
  *drawn* contour's length from its first point (in the order of its points – so it names the same spot of the part after a move, turn,
  mirror and on the back of a two-sided part, which `flipContours` cuts anew with the point order kept; **other measures of a drawn shape
  change the length, so `carryTabs` (`lib/camTabs.ts`, called from `reshaped` and the magnify path of `resized`) takes each place to the same
  share of its contour's own box in the sketch's coordinates – a grid hole by its cell (column, row) when the grid gets other columns or rows –
  and drops places that find no contour; never "the same fraction"**); without `at` they are `count` places
  evenly, `((k + 0.5) · length) / count` exactly as before (the schild golden is untouched), `at: []` is no tab, an open contour has none.
  `width` is **the material that stays on the part** – the cutter lifts over `width + toolDiameter`, and the table's marker is the bar of the
  true width. `CamItem.tabs` stays the switch; `tabSpec` (`mode` auto | manual, own `count`/`width`/`height`, `at: {c, u}[]` with `c` the
  contour of the item) overrides the drawing's defaults (`settings.tabs`, "Standard-…" under Erweitert) value by value;
  `itemTabs(item, c, defaults)` is the one way to the effective `Tabs` of a contour (`itemOperation(item, settings, c)`, the two-sided
  `loose` note through `itemHasTabs`: **a part is held only where every closed contour of it has a tab – by hand a place on each (a grid of
  holes needs one per hole), spread a count above 0; `looseContours` names the ones that have none and the panel says how many**),
  `tidySpec` drops a spec that says nothing. The cutter walks beside the drawn line, so the toolpath lifts at the nearest place of the loop
  (a slot narrower than the cutter puts the tab a little away: **a limit, not drawn**); a hole whose cut falls into several loops
  (`tabsPerLoop`, only for places told by hand) gives each place to the loop it is nearest to and a loop with none the nearest one – never a
  loop cut free; a tab across the start of a loop is lifted over its whole width (the walk's marks start at the lap before).
  Store: `setTabs` (clamps
  to `TAB_LIMITS` – the project file's ranges: count 0–50, width 0.1–100, height 0.1–500, 50 places), `spreadTabs`, `manualTabs` (seeded with
  the current even sites; refused above 50 places), `addTab`, `moveTab`, `removeTab`, `dragTab` (the picture follows, the toolpath is made
  when the finger lets go, one step of undo), `placing` (the mode "Stege setzen": ends by itself when the part is no longer the selected
  one, no longer by hand, or gone) – all through `remember` + `update`, so the job lock holds; `update` prunes places on contours a part no
  longer has (a grid made smaller) and places that stand on another's (`pruneTabs`) so the store never holds what the file reader refuses,
  `moveTab`/`dragTab` put a tab dropped on another back. In the list of a drawing **only one row of a selected group holds the tab panel**
  (a file's contours come in as one group): the first with tabs on, or the one asked for by ticking its box or "Stege einstellen". Gesture (only while `placing`; otherwise the
  table behaves as ever): a tap within 24 px of the part's line sets a tab at the nearest place (and returns its undo, being a tap), a tab is
  taken through the view's `grab` (`yields`), dragged along the line, and **`ViewGrab.tap` – called after `end`, only for a finger that went
  down and up on the spot – removes it**; the part's handles and its own dragging step aside meanwhile. The table shows `data-drawing-tabs`
  (JSON per part: sites `{c,u,x,y,w,index}`), `data-drawing-placing`. A series takes manual places along (`seriesMotif`: one part per
  contour). **Project file:** optional `tabSpec` per item, read strictly like `climb` (wrong type or range → `invalid-project`, `c` below the
  item's contour count, `u` finite in [0, 1)), written only when present; format and version unchanged.
  **Selecting several, aligning, distributing, grouping** (`lib/camSelect.ts`, `lib/camArrange.ts`, `store/cam.ts`, `CamArrange.tsx`, the rows
  in `CamCard.tsx`): `Selection` is `null` · a group number · `'all'` · `readonly number[]` (two or more groups, in the order of the list;
  `normalise`: none is null, one is the number – so every reader of a single group, `typeof selected === 'number'`, keeps its meaning).
  `isSelected` is the one test "is this thing selected"; `toggleGroup` (**a registration hole is never one of several: touching it selects it
  alone; `'all'` becomes the list of the part groups before one is taken out**), `invertGroups` (parts only), `unitsSelected` and `pruneSelection`
  (what `update` uses to drop groups that are gone – the one place) are pure. **Input needs no modifier key:** `useCam.multi` is the
  "Mehrfachauswahl" checkbox in `CamArrange` (a mode of the screen – not a step of undo, off at `close`); while on, a tap (`host.tap` →
  `pick`) takes the part's group in or out and a tap beside everything keeps the set; in `TableView.grab` a press on a part's line **never goes
  through `pick` then** – on a member it takes the whole selection along (`ViewGrab.tap`, only for a finger that never moved, lets go of that
  part), on a non-member a tap takes it in and a drag takes it in on its first move and carries all. Without the mode `pick` leaves a part of the
  current set (or of `'all'`) as it is, so a finger takes the whole set; a tap beside everything still lets go. A row of the list has a checkbox
  (`cam-pick`, its label is the 48 px target; `toggleSelect`) that works with or without the mode; the row's name still picks that part alone;
  "Alles auswählen" (`selectAll`, Ctrl/Cmd+A) and "Auswahl umkehren" (`invertSelection`) are in the selection state. **Not built, on purpose**
  (in `docs/merkliste.katalog.mjs` as `cam-sel8`…`cam-sel12`): Umschalt/Strg+Tipp (no modifiers in `usePanZoom`), a rubber band, keys for
  group and align, aligning to the stock or the table. **The unit of arranging is a group, rigid**: `unitsOf(items)` (registration holes
  left out) gives group + the box of all its parts (`itemsBounds`: a circle by its true radius, a turned part by its turned outline).
  `alignDeltas(units, edge)` moves every unit to the box of the whole selection (left, centre, right, top, middle, bottom; y up, so top is the
  larger y; the unit furthest out stays; fewer than two units: nothing); `distributeDeltas(units, axis, mode)` needs three, orders by the
  middle of the boxes (a tie keeps the list's order), keeps the two outermost where they are and gives equal **gaps** (boxes that overlap
  more than they are wide get an equal negative gap) or equal **centre** distances; both return `Map<group, {dx, dy}>` in the order of the units
  given, a shift under `MOVES` (10⁻⁹ mm: float noise) moves nothing. Store actions, each **one `remember()` and one `update()`** (so the job lock, `ahead` and
  the holes follow): `arrangeBy(shifts)` – no field, so two aligns in a row are two steps, `update` not `moved` (holes are never touched by it:
  with `autoHoles` they are proposed anew for the moved parts, put by hand they stay) and nothing remembered when nothing moves –, `align`,
  `distribute`, `group` (two or more units: the parts of the selected groups get **one new id from `nextId++`**, the list keeps its order, so the
  program is the same one and `ahead` stays as it was), `ungroup` (every part of the selected groups gets a group of its own, all of them
  selected; nothing when no selected group has several parts – this is what makes the single contours of an import pickable). Copies:
  `duplicate` and `paste` select the groups of the copies (`'all'` stays), `array` of one group stays on the original, of several selects the
  copies. In `CamArrange`: the checkbox, all/invert, "Gruppieren"/"Gruppierung aufheben" (**the row is there only where one of the two can
  act** – two units or more, or a group of several contours; a single plain part has none – and a `Reason` says why the other is disabled) and the fold
  "Ausrichten und verteilen" (`data-find="cam-align"`, shown from two units; open until it is folded once and then as it was left, `useUi.depth.camAlign`)
  with six align buttons and four distribute buttons (disabled with a reason below three). **The header counts what the buttons count**: units, a group
  is one ("2 Teile"), and where a group holds several contours says so ("2 Teile, 3 Konturen", "Gruppe aus 3 Konturen") – never contours as "Teile";
  registration holes are no part: "everything" of a two-sided drawing counts its parts only, one part with its holes is named as that part, and nothing
  but holes counts them.
  **A ticked row stays where the finger put it** (`ItemRow`, `useLayoutEffect` on `selected`: the row's place on the screen is read before the
  toggle and, after the commit, `.panel-body.scrollTop` is moved by the difference – assigned, not `scrollTo({ behavior: 'instant' })`, whose value an older Safari rejects; nothing in the styles makes a scroll smooth – the small card of "nothing selected" becoming the
  whole one and the align panel coming and going would otherwise take the next box from under the finger; Safari has no scroll anchoring, and
  Chrome's did not hold it either, measured). What is still moved is whatever lies _below_ the ticked row: the tab panel of a part picked alone
  opens under its row (the tabs work) and goes with the second tick. **Quick search** entries `camMulti`, `camSelectAll`, `camInvert`, `camAlign`,
  `camDistribute`, `camGroup`, `camUngroup` each carry a chain ending in `cam-draw`, the card that is there with nothing drawn (`cam-select-all`
  and `cam-invert` are the buttons themselves; `test/camArrangePanel.test.tsx` and `e2e/find.spec.ts` follow the chain in an empty drawing,
  with one part and with several). **Project file: no change** – the group is a whole number per thing and `openProject` raises the counter above the file's
  (`test/camArrangeProject.test.ts`). Tests: `camSelect`, `camArrange` (hand-checked boxes), `camArrangeStore` (steps, two-sided holes),
  `camArrangeRunning` (a job under way), `camArrangePanel` (the buttons, the header, the held row, the folded panel, the search chains), `e2e/arrange.spec.ts` (the row measured on the screen at tablet size and in the 800 × 600 sheet), one touch case in `e2e/ipad.spec.ts`.
  **Every other way to load, replace or take off the program goes through the central lock**
  in `store/job.ts` (`setProgramLock`, set by `store/underway.ts`): `load`, `loadDerived`, `unload` and
  `restoreOriginal` do nothing while a job is under way, say why (`job.locked`, its own message group `jobLocked`)
  and **return `false`** – a caller never reports "loaded" after that; a dropped file or a job of the recent list is
  turned away with one message before anything else happens. **A flow that does more than load** (the two-hole
  alignment, turning the board, the long example, the jigs, the sections) asks `programRefused()`
  (`store/underway.ts`) _before its first step_ – a zero moved or a plan changed must not outlive a refused load;
  `jigs.ts` and `sections.ts` use `jobUnderWay()` as their `running()`. Changing the machine profile re-analyses the
  loaded program directly (it is no other program) and so is not refused. **Between two parts** the next part starts
  only in the tool change card or the action bar (decision 32): the SD list, "Programm starten" and "Ab Zeile
  fortsetzen" are disabled with the reason `run5.waitingInPanel`.
- Two-sided parts ("Wenden"): the drawing shows both sides as seen from the front; the pure maths
  (flip line, mirrored back, registration holes, what the sides do to each other) is
  `packages/cam/src/flip.ts`, the plan and its hand-checked chain to the table `lib/flip.ts`, the
  flow `store/flip.ts` + `components/FlipCard.tsx`. The back is always the mirrored geometry cut
  anew (`flipContours` → `toolpaths`), never a mirrored toolpath – that keeps climb/conventional and
  tabs right. The flip line runs through the middle between the two registration holes. A derived
  program says how it lies against the job as loaded (`useJob().pose`, third argument of
  `loadDerived`); the back follows the front's pose. The readiness list carries the flow
  (`flip` item). After a move, wait for the status report to show it before centring the camera.
- The simulator (`sim/`) runs files from its own SD card, cuts as wide and deep as the job's cutter
  and turns its board over (`flipBoard`); `window.lowriderSimulator` is there for the e2e tests,
  which check two-sided jobs against what was really cut (`e2e/flip.spec.ts`).
- Series on scattered blanks (`components/SeriesCard.tsx`, `store/series.ts`, `lib/series.ts`,
  finder `lib/blanks.ts`): blanks are things on the table – machine XY, like clamps; the program is
  written against the X/Y work zero as it is and made anew when that zero moves (`startSeries`,
  readiness item `series`). Angles are counter-clockwise with y up everywhere; a picture's y-down
  is turned over in one place (`blankOnTable`, through two mapped points). The finder stays strict
  like the others (cut off, touching, faint → refused with a reason the operator can act on). The
  flow takes the place of the drawing's cards (no new settings area) and keeps the program on the
  table up to date after every choice, so the picture is the preview.
- Jigs with printed markers (`components/JigCard.tsx` offer at the top of the Job room,
  `JigsCard.tsx` list/teach/print under Extras, `TagSheet.tsx` print page, `store/jigs.ts`,
  `lib/jigs.ts`): the printed codes are called **tags** in the code ("Marker" to the operator – the
  round dots of `lib/markers.ts` had that name first). Dictionary, SVG and pose from corners are
  `packages/workshop/src/tags.ts` (the dictionary is pinned by a test: printed tags must stay
  readable for ever); the jig's frame, what teaching keeps and zero + rotation from measured tags
  `packages/workshop/src/jigs.ts` (origin: first tag; x axis: towards the second tag, else the
  tag's own). The finder `lib/tagFinder.ts` is strict like the others and silent about dark things
  that are no tag at all (no dark frame with paper around it). A tag is measured at the crosshair
  (`measureTag`: drive over it, re-centre once) – only its middle and angle are used, so a wrong
  picture scale does not move the zero. Sightings (`seen`) come from the live picture while the
  machine rests and from the table picture after a scan; a jig's job is tracked by the program it
  was loaded from (`loaded`), what was measured by `placed`, and the readiness item `jig` blocks
  when zero, pose or place changed since. The simulator's jig scene (`SIM_JIG`, `moveJig`,
  `jigCuts`) lies differently every time; `e2e/jigs.spec.ts` checks the cuts on its coaster.
- Parts longer than the table ("In Abschnitten", `components/SectionsCard.tsx` under the steps of
  the Job room, `store/sections.ts`, `lib/sections.ts`, overlay `components/useSectionsOverlay.ts`):
  the readiness item `travel` offers it when a job leaves the travel along X or Y only
  (`sectionAxis`); the readiness item `sections` carries the flow. Dividing is pure
  `packages/gcode-core/src/sections.ts`: `planSections` (as few sections as the travel allows,
  equal slides, each seam where it divides least and never through a tab) and `splitSections` (one
  program per section). Cuts that touch are one feature and stay whole when a section's window
  holds them; only what is too long ends at the seam, and the later section starts `overlap` (1 mm)
  before it. A section program follows the original move for move while that stays its own;
  whatever it does itself goes up to the program's highest Z, across there and down at the
  program's slowest plunge feed – never at rapid below that height. Lines that do not move are in
  every section. Finding the part again is `packages/workshop/src/sections.ts`: register marks are
  printed tags kept in the part's (the program's) coordinates (`marksOnPart`), `locatePart` gives
  the part's pose from them (two marks: direction and place; `fence`: place only) and refuses a
  changed distance. The flow sets the X/Y work zero where the part's zero lies now and loads the
  section turned about it (`loadPart`); the part is always slid towards the low end of the axis.
  Tag measuring is shared with the jigs (`measureTag`, `liveTags`, `toCameraHeight` in
  `store/jigs.ts`). The simulator's long board (`SIM_LONG`, `stickTags`, `slideLong`, `longCuts`)
  is slid a little off and turned, differently each time; its example job is `DEMO_LONG`
  (`loadLongDemo`). The simulated machine travels 0.15 % too far in X: `e2e/sections.spec.ts`
  compares the cuts with the job as that machine makes it (`onBoard`), not as drawn.
- Quick search and keys ("Schnellsuche", `components/Find.tsx`: button in the row of the steps, palette,
  key sheet; state and what a chosen entry does `store/find.ts`): **a new function gets an entry
  in `lib/commands.ts`** – the label it has on screen (`title` is that label's message key, never
  a second wording), where it lives, the `data-find="…"` anchor of the element to show – **and
  keywords** under `find.words.<id>` in `de.ts` and `en.ts` (other names, wrong-but-plausible
  names, jargon; both lists are searched in either language). `test/commands.test.ts` holds the
  table against the app: every place, every view of a place and every stage tool has an entry,
  every card a place shows carries an anchor, every anchor exists and is used, every entry has
  keywords. The
  rule that keeps it harmless: an entry is `go` (lead to the place, unfold it, scroll to it,
  outline it for a moment – `lib/reveal.ts`; the operator then uses the control there) or `view`
  (one of `VIEW_ACTIONS`: stage view, Einpassen, Großbild, key sheet). The search never moves the
  machine, never starts, stops or changes a job, never clicks for the operator, and never puts
  the focus on a control; `store/find.ts` does not import the machine store (tested), and
  `e2e/find.spec.ts` checks that nothing reaches FluidNC. Matching is pure in `lib/search.ts`
  (umlauts folded, whole word > beginning > inside > typing mistake scaled to the word's length;
  title > keywords > place; every word of the query must match; equal hits keep the table's
  order), the quick access of the empty search `quickAccess` in `lib/commands.ts`. Palette and key
  sheet are coss dialogs in the dialog layer below the status bar: PAUSE and NOT-HALT stay above them, and the
  layer shrinks with the on-screen keyboard. The list keeps our own matcher and rows (not the
  Autocomplete of coss's Command).
- Keys (DESIGN.md §8): all of them are listed in `lib/shortcuts.ts`, by scope – `global` keys
  (search, stage views, Einpassen, `?` – there is no key for a next step) only run a command of the search;
  the two `machine` keys reach the machine and only to make it safer (`store/keys.ts`, kept apart
  from the search): **Space** = feed hold while something moves (whatever has the focus, dialog or
  not; at rest it keeps its meaning for the focused control), **Esc** = asks whether to abort the
  running job (`AbortDialog`; never by itself); the drawing's keys (`lib/camKeys.ts`) and the jog
  panel's keys (`JogCard`: arrows/Page keys while the panel is open, **1–5** = step width) keep
  their handlers and are listed for the overview (the mouse wheel is listed without a key); a test holds the table against all of them and
  against clashes. Keys act only through `keysFree` (nothing is typed, no dialog open – the search
  and the key sheet are dialogs, so jog and drawing keys rest while they show). **No key for
  NOT-HALT, a start or homing.** Key caps are shown only where a keyboard is likely (`.kbd-hint`:
  fine pointer, or after the first key).
- Jog panel (DESIGN.md §5, `JogPanel.tsx`, `JogCard.tsx`): cross with Z (and A) in the axis
  colours of the tokens, step widths 0,01 · 0,1 · 1 · 10 mm · Dauer (`lib/jog.ts`; 100 mm, the
  handwheel, the joystick, single axes, unlocking, the park position and the macros are "Mehr
  Optionen"), quick actions as holds with their reasons (`quickReason`; "Werkzeugwechsel" is a fourth one
  that exists only while a tool change position is stored – `goToChange`, up to the safe height first, like the park
  place; the cards "Parkposition", "Werkzeugwechsel-Position" – the same `settings.toolChangePosition` as Einstellungen →
  Werkstatt – and **"Merkpunkte"** (`WaypointsCard`, `lib/spots.ts`: up to 12 named machine X/Y places in
  `settings.waypoints`, the same name moves the place, `goToWaypoint` lifts first) are "Mehr Optionen" of the jog panel). **Every way of jogging
  goes through the one action layer `store/jog.ts`** (`jogStep`, `jogHold`, `jogStop`, `jogFine`,
  `jogStick`…): buttons, keys, gamepad, handwheel, joystick and the mouse wheel never call the
  machine's jog functions themselves. The layer sends a jog only while the machine takes one,
  remembers the axis moved last and registers whatever is held in `lib/holds.ts`. The mouse wheel
  jogs fine (never coarser than 0.1 mm) only while the mouse button is held on its field
  (`WheelFine`) – a wheel that just turns moves nothing. **A step jog counts its absolute target from a report
  that is not older than the last move** (`store/machine.ts` `jog`): where the machine still moves, or a move or stop
  of the app's own went out after the last report (`reportOld`), the step waits for the next report at rest
  (`atRest`, 1.5 s, then the hint `drive.notAtRest`); `jogEpoch` makes "Jog stoppen", NOT-HALT, PAUSE, stopping the
  job, a goto, a reset and an alarm drop a step that waits.
- Messages (DESIGN.md §6.3; pure `lib/messages.ts`, `store/messages.ts`, `components/Messages.tsx`):
  five levels. An `error` line of the log is a **warning** (toast, acknowledged in the centre,
  blocks nothing); a few `info` lines are an **information** (a toast that goes) or a **hint**
  (stays in the centre, no toast); the machine's alarm state is a **fault** (it cannot be
  acknowledged, it goes when the alarm goes, and offers its way out); a connection lost during a
  job is the one **critical** message (`CriticalLayer`: red, over the whole work area, **not
  animated**, acknowledged where it shows). Every message has name · cause · effect · next step and
  the controller's code small behind it: `addLog(kind, text, key, code)` passes the message key,
  and the key's group (`groupOf`) gives cause, effect and step from `messages.groups.*` – **a new
  `addLog('error', t('x.y'))` passes `'x.y'` as its key** and gets a group if none fits. The centre
  opens from the status bar's flag as a dialog in the dialog layer (never over an open dialog:
  `openCentre`); the same list is the history under Service & Diagnose → Meldungen. A toast never
  takes a tap (`pointer-events: none`).
- **Diagnostic report and what is kept with a message** (Service → Meldungen, "Diagnosebericht speichern"; pure `lib/diagnostics.ts`,
  collectors `store/context.ts` and `store/diagnostics.ts`): one text file (`lowrider-diagnose-<date>-<time>.txt`, `REPORT_FORMAT`) with the
  device, the Pi's last health answer, the machine and the way to it, a **picked** list of settings (never the document), the messages
  of this session and – apart – the ones the history kept from before a reload, and the last 200 lines of the machine's log
  (`>` sent, `<` received). **It only reads the stores** – no command, no request to the Pi (it works during a job and without the Pi, and says
  what it does not know, e.g. the free space of the SD card). **It is always German** (a log file, not UI) and holds no credentials: `redact`
  takes the value out of `name=value`/`name: value` for password, psk, secret, token, credential, authorization, api key, user:password in
  front of a host (with or without a scheme) and every string the app holds itself (`heldSecrets()`: the login token of the Pi); the value of
  a **setting that holds a credential** (`$Sta/Password`, `$AP/Password`, `$Notification/T1|T2` …) is the rest of the line, because FluidNC
  takes a passphrase of several words as one value (also the other spellings: `[ESP101]…`, `$ESP106=…`, `$Notification/Setup=…`, `[ESP401]P=…
V=…`); the login of an address ends at its **last** `@`; a name counts as a word of its own (`Passmarken` and `compass` stay); **no look-behind**
  in these patterns (an iPad with a Safari before 16.4 could not parse the single script of the app; a test reads the source for it) and a log
  line is cut to 2000 characters before it is redacted (the patterns grow with a line that has no spaces) – an allow-list
  for what is collected, a deny-list as the last pass over the whole text, applied to a log line _before_ it is cut;
  `test/diagnostics*.test.ts` and `e2e/diagnose.spec.ts` put a token and a passphrase into the log and look for them.
  **What it still cannot know:** a credential that is typed in a form that names it nothing (`$Hostname=…` is no secret, a password sent as
  plain G-code text would be) – the report is read by a person before it is passed on. Each warning, fault and critical message keeps its **`context`** (`Message.context`: facts about the machine and
  the way to it, the last lines of the log before it, ≤ 8 + 6 lines of ≤ 120 characters; `validMessages` drops a broken one and loads old
  messages without it) – the log is gone after a reload, the message is not. "Letzter Bedienbefehl" is only what `command()` sent (screens,
  console): the app's own `$SD/List` and the status stand in the log lines, because routing them through `command()` would show them as the
  jog panel's result; the message made from an `error:n` line says nothing of how the command ended (the line that answers it is only now
  arriving – the lines before it show it). **A rejected command that is the controller's file system** (`error:60`–`70`, `82`, `83` =
  `isFileSystemError`; `errorClass` in `lib/messages.ts` says `card` for 60 – listing the card fails at mounting it – and `file` for the rest (62 is
  raised when a directory is made; the others happen to one file, also in the controller's flash through `$LocalFS/…`)) is not told as a bad line:
  the card has its own effect and next step (`messages.rejectedSd.*`: jobs from the SD card do not start, streaming goes on; FAT32, not exFAT /
  reseat / config.yaml `sdcard`), a file the neutral `messages.rejectedFile.*`. **A failed listing of the card is one warning, not two**:
  the warning made from `error:60` is about the card already, so `refreshSdFiles` adds `files.listFailed` only where
  `sdListNeedsWarning` says so (no answer at all, or an error that names no card – a file error, a rejected line). `FluidNCConnection`
  takes a **text** frame that starts with `error:` for a WebUI meta message and drops it – the controller's output comes in binary frames
  (the e2e fake and the scripted socket's `replies` in `test/link.test.ts` do the same); only the controller's answer or its silence counts – a
  refusal on this side (a device that only watches, a job that runs) sent nothing and says nothing of the card, and keeps the list that was read
  before, while a failed listing **forgets** it (`sdFiles` null: a stale list would show files that cannot start, and the upload check would
  trust it). A card-less Jackpot still warns **once per listing** – every time the SD card card shows (it lists on every mount: opening Job
  or Fräsen, "Aktualisieren", after an upload), not once per connect; messages are not deduplicated. The error table `ERROR_CODES` follows FluidNC's `Error.h`
  (read from its main branch on 2026-11-25: no 71, 81 is a setting string, 82/83 are file system). A move that was not carried out
  (`photomap.scanFailed`, `calibration.moveFailed`) is group `motion`, not `camera` (`calibration.noRoom` and `.outside` are the reasons themselves and
  stay with the measuring). The message about a failed link is made _after_ the link state is set, and the connection is set to `disconnected` in
  the same step as `lostInJob` – a message keeps the state as it is when it is made. A link lost after it was up names the
  Pi (`viaFor`: the series is cleared by a successful connection, the address typed is the fallback).
- Why a control is disabled (§6.2): the new parts wrap it in `Reason` (`ui/tooltip.tsx`); everywhere
  else a disabled `Button` carries `reason` (a text, or the two general ones `machine` / `missing`)
  and a disabled `HoldButton` says what the machine's state has against it by itself
  (`lib/reason.ts`). `ReasonLayer` shows the reason on a tap, without wrapping anything.
- Hiding rare functions ("Funktionen", `components/FeaturesCard.tsx` under Einstellungen → Maschine; pure `lib/features.ts`,
  gate `components/Feature.tsx`, setting `settings.hiddenFeatures`): the series on blanks, jigs with printed tags and the macros
  can be hidden – **their entry points only** (the series card in the CAM, the jig offer and list in the Job, the macro buttons
  of the jog panel and the macro editor); the code, the stores and **the background services keep running** (the tag poll of
  `startJigs` included). Not on the list on purpose: flipping and sections (their readiness points can block the start) and the
  material (the source of the cutting values). **A hidden function is shown anyway while its flow is under way** – read from the
  one readiness list (`series`/`jig` points, `featureShown`) – so a locked start always has its card. In the quick search every
  entry that leads to such a function has `needs: '<id>'`: while it is hidden `goTo` lands on the switch (`NEED_FALLBACK`,
  anchor `features`) and the row says so (`find.needs.*`); `runCommand(id, features)` takes the shown set from the palette
  (`store/find.ts` stays free of the machine store). A new rare function: add it to `FEATURES` and `UNDER_WAY`, wrap its entry
  points in `<Feature id>`, give its search entries the need – `test/features.test.ts` holds the entries against their anchors.
- **State on the Pi** (settings, calibration, places, macros … – "Einstellungen und Messwerte auf dem Pi"): the app keeps
  what belongs to the machine in the browser as before **and**, while a companion answers, in one document per key on the Pi, so
  every device finds the same. Companion: `src/state.ts` + `/api/state` (GET all, `PUT /api/state/:key` with `{baseRev, data}`; the
  companion counts the revision – never the Pi's clock – and refuses a write from an old one with 409 and the current document;
  the document is bounded to 512 KB and the request to 1 MB _before_ it is parsed (`bodyLimit` of the route; the rest of the API
  takes uploads); `state: true` in `/api/health`; the daily backup covers it, it lives in the `documents` table). App: pure
  merge in `lib/stateSync.ts` (`merge3` by top-level key: what only one side changed goes to the other; both changed → the
  winner's, **but inside a document of fixed keys one level deeper** – the camera's calibration of one device is not lost to the
  other's switch; **a key the Pi's copy lacks is unchanged, not removed** – an older app wrote it; only a document of free keys,
  the learning, loses one), the engine `store/stateSync.ts` (`syncOnce`, `startStateSync`: a change goes out after 0.8 s, the Pi
  is asked every 30 s, when the page comes back and when the companion answers; offline everything goes on and is caught up) and
  the documents `store/stateSlices.ts` – a `Slice` each: `settings`, `clamps` (fixtures and their frame, not the job's setup),
  `toolReference`, `macros`, `learning`, `profile`. **The companion's `STATE_KEYS` and the slices are one list** (a test compares
  them). Rules that hold: **a slice has `keys`** – of a Pi document only these are looked at, **any other key (a newer app wrote
  it) is carried along untouched** (`split`; the base and the comparison use the same projection, or every round would write);
  **what the Pi has is compared by content, never by its revision number** (a Pi restored from a backup counts again – an older
  state is taken and said, `sync.rewound`); **what belongs to a device alone is not synced** (`LOCAL_SETTINGS`: address of the Pi,
  browser notifications, screen keeping, **language and expert functions** – a change of the language restarts the whole screen,
  not something to happen under another's finger; `LOCAL_CAMERA`: picture source and stream address); **first contact** (no common
  base) merges against the defaults – the Pi's value wins where both differ and is said (`sync.replacedLocal`), a state that is
  still the defaults is not written; **the Pi's values are taken only where nothing moves** (`safeToApply`: no job under way, no
  hold, no measuring run of the calibration, machine Idle or not connected – otherwise they wait, as long as the Pi's values are
  needed; this device's own changes go out when they need nothing of the Pi's), **and never over an edit made while the Pi was
  written** (the slice is read again before `apply`; the next round merges); a failed `apply` puts this device back and records
  nothing; **nothing from the Pi is trusted**: `accepts` runs before a document goes in or out – the settings must be of the
  right kind per part (`shaped`: no camera that is null), have a camera with its numbers (or the defaults would fill a gap and
  throw a calibration away), and `insane()` holds places, the safe height (upper half of the Z travel), spindle, camera, the
  measuring runs (points 2–8 = `POINTS_MAX`, the plate's pitch, dots and dot diameter …), the corner plate and the recording to the ranges the cards allow; the profile needs real
  kinematics and controller (`parseKinematics`/`parseController` – a `kinematics: {}` crashed every screen that reads
  `axes.x.maxRate`); the learning factor 0.5–1.5; **macros from the Pi run as text on the machine, so they are said**
  (`Slice.announce` → `sync.macrosFromPi`, a hint that stays in the centre). **A document that stays refused** is said once per
  revision (`sync.refused`), blocks no other document and not the log, and has a way out: in the connection card a hold writes this
  device's state over it (`overwritePi`) – only where the Pi's document is refused and this device's own is fine. **Per window**
  the note of what is known (`createMetaStore`: revision and what both had) is read from the browser once and then kept in memory
  and written through – two windows of one browser each follow the Pi instead of passing one note back and forth, and a browser
  that stores nothing still remembers until the page closes. **A simulator is no machine**: nothing is exchanged while it runs;
  the state from before is kept in the browser (`createKeep`) and put back when it ends **and at the next start if the page was
  closed in it** (`Slice.restore`: the profile goes back to the placeholder), taken only where a Pi is configured. **How a round
  ends** is the worst of its documents (refused › failed › deferred › ok); a Pi that answers with an error is `failed`, not
  `offline`; a log of measurements that did not come through is no `ok`. The **log of measurements**
  (`lib/measurements.ts`, `store/measurements.ts`, card `MeasurementLog` under Service → Kalibrieren, companion library
  `measurements`): `record(kind, values)` at every calibration, camera scale and offset (also the one set by a tap on the picture),
  grid, backlash, tilt, ruler check, tool reference and **every correction written to config.yaml** (the calibration, the config
  editor, the limits card: old and new value – the only trace of a change to the machine, except a write that failed half-way);
  the same numbers of the same kind within a minute are one entry; not while a simulator is the machine; a time is only what
  `toISOString` writes; union by id with the Pi (`syncMeasurementsDue`: at the first round, when an entry did not reach the Pi,
  and every ten minutes – the Pi is asked every 30 s, the log not; what the Pi lacks is **sent before** its entries are taken in;
  every request has a time limit); the companion checks an entry (`validateMeasurement`: a few names with numbers, texts or
  flags) and keeps the latest 5000. Per device stay: the photo map, the recent jobs, running flip and sections flows, the look of
  the app. A new setting of the machine needs nothing (it is in the settings document – but give a number a range in `insane`); one
  of the device goes into the local lists; a new document is a `Slice` (with `keys`) plus its key at the companion. **Known and
  accepted:** the state, the libraries and the relay need no login and the companion answers CORS `*` (as before this feature – the workshop network is trusted; the login protects only update, power-off and itself), so any
  page the operator opens could write the state – and, the same way, set the camera's exposure and gain (`/api/camera/controls`: the whitelist of
  picture controls and the ranges the camera reports are the limit); probe, hole, tag and tool-length results are not in the log yet.
- **Login and update of the Pi** (`docs/update-konzept.md`; companion `src/auth.ts`, `zip.ts`, `release.ts`, `updater.ts`, `version.ts`,
  `scripts/pi/{setup.sh,lib.sh,guard.sh,update-pi.bat}`; app `store/piLogin.ts`, `store/piUpdate.ts`, `lib/piUpdate.ts`,
  `components/PiAccessCard.tsx`, `PiUpdateCard.tsx`, under Einstellungen → Verbindung). **What the login protects** – and only this:
  loading code onto the Pi (`/api/update/*`), powering it down, and the login's own administration; libraries, `/api/state` and
  the FluidNC relay stay open (protecting them would stop every device that has not logged in from saving its settings). A device
  types the **Pi code** (12 characters, made at the first start into `data/pi-code.txt`, mode 600, shown by `setup.sh`) once and keeps a
  **token** (the Pi keeps only its SHA-256); the app holds it under its own storage key `lowrider-control.piLogin`, **never in the
  settings** (they sync to the Pi and every device), bound to the companion's address and sent to no other (`tokenFor`,
  `companion()`). Five wrong tries per address in five minutes lock that address, 40 from anywhere lock all. **The update**: the zip of
  `release/pi` (what `pnpm bundle` also writes as `release/lowrider-pi.zip` with its `.sha256` – deterministic, the build is the
  _time of the commit_, never a counter; a tree with uncommitted changes gets the time of the build and `+dirty`, and then is not reproducible) is read strictly (`zip.ts`: sizes bounded before inflating, CRC, plain names, no
  zip64/encryption/links/duplicates), mapped by a whitelist onto fixed names (`release.ts`; `setup.sh`, `lib.sh`, `guard.sh`, `health-gate.sh` are
  **never applied from an upload**), put beside the running version under `releases/`, **tried** (`node companion.mjs --check`: loads,
  builds its server, answers – no port, no real database – and must be the build its `release.json` names), and only then
  `current` is swapped atomically (symlink + rename); `previous` is the way back. Before: a copy of the database _now_
  (`runUpdateBackup`; refuses when it cannot), `busy()` (a browser on the relay – the app closes its own connection first and asks again –
  or a recording), the setup level (`SETUP_LEVEL` in `setup.sh` = `version.ts` – a test holds them together; a version that needs
  more is refused: that one goes through `update-pi.bat`). The new version confirms itself after 30 s up (`LOWRIDER_CONFIRM_MS`);
  until then `trial` exists and **`guard.sh` (ExecStartPre, must always exit 0)** counts starts and, at the third without a
  confirmation, points `current` back at `previous` (**`health-gate.sh`**, `ExecStartPost`, exits 1 while a trial exists and the companion does not answer in 30 s, so systemd restarts it and the guard counts that start too – the hang case; whether systemd restarts after a failed `ExecStartPost` is **not tested here**) – at once when `current/companion.mjs` is missing or empty (a power cut; the updater
  writes files with fsync and swaps `current` first when rolling back, and the confirmation takes the same lock as an apply, so a
  half-made `.incoming-*` is never cleared under it). The app waits (`waitForRestart`: the process must go away – it answers with the
  old build for a moment – and then answer with the new one; another build after that means the guard took it away). **Layout is
  `scripts/pi/lib.sh`** (shell functions, tested under `set -euo pipefail`): `setup.sh` migrates a flat setup into a release
  (a copy; the flat files go only after the health check passes), keeps the Jackpot and camera values and unknown lines of
  `/etc/lowrider.env`, switches back and says so loudly when the new version does not answer, and prints the Pi code last. **What
  could not be tested here (one list, the same in `docs/update-konzept.md` and decision 41):** systemd itself (`ExecStartPre`,
  `ExecStartPost`, `Restart=always`, the exit code of `systemctl restart` after a failed `ExecStartPost`, `TimeoutStopSec`), the
  flow of `setup.sh` between its early questions and its end (packages, `sudo`, `visudo`, `raspi-config`, NodeSource, the services,
  the health wait and the switch-back – a reviewer ran it against stubs and a self-made fake systemd, no more), `scp`/`ssh` and
  `cmd.exe` reading the bat (the bat is only checked as text), the Pi, and the app's client against a real companion (the e2e uses
  a hand-written fake Pi, `pi.test.ts` plain `fetch`). `apps/companion/test/pi.test.ts` plays systemd with the real bundle, `lib.sh`,
  `guard.sh` and `health-gate.sh`. The code and the token travel in
  clear over http: they keep other web pages and guests out, not someone who reads the WLAN; where the service user may `sudo`
  without a password, the Pi code is root on the Pi. `update-pi.bat` is plain ASCII with CRLF (the bundle makes it so), runs
  `scp` + `ssh -t`, and stays the way when the Pi no longer answers.
- **The camera's picture settings from the app** (Einstellungen → Kamera → "Belichtung und Bild", `CameraControlsCard`, `store/cameraControls.ts`, pure
  `lib/cameraControls.ts`; companion `src/camera.ts` + `GET/PUT /api/camera/controls`, `cameraControls: true` in `/api/health` – the card shows only
  where that is said; `docs/companion.md`): the companion runs `v4l2-ctl -d $CAMERA_DEVICE --list-ctrls-menus` / `--set-ctrl name=int` (`execFile`,
  fixed arguments, no shell, 3 s, one call at a time, ≤ 12 controls and 4 KB per request, one write batch per 500 ms, `access(R|W)` on the device decides
  `no-device`/`no-permission` – never the message of a set, because uvcvideo answers a set of an inactive control with "Permission denied" =
  `refused:driver`). **Names, ranges, steps and menus are read from the camera, never wired in**; only the whitelist `ALLOWED_CONTROLS` (both old and
  new kernel names) may be set, a value is **refused, never clamped** (`refusal`: range, step grid from `min`, menu entries – sparse –, bool 0/1,
  inactive, read-only), the switches (`MODE_CONTROLS`: auto exposure, auto white balance, autofocus) go first and the list is read again, and the
  answer is the list read again with a result per control – **the read-back is the truth** and what is kept (`store.setSetting('cameraControls')`,
  the companion's own table, **not** a `STATE_KEYS` slice) and put back best-effort at the companion's start (`restoreAtStart`, never awaited, retries
  while the device is missing). The exposure time is shown in ms **only** for `exposure_time_absolute`/`exposure_absolute` (V4L2: 100 µs units);
  every other control shows the camera's own number. In the scan panel "Aus der Kamera übernehmen" reads the camera **at that tap** and fills the
  field only for manual exposure with an active time (`takeover`), only where this device's picture is the companion's stream
  (`streamIsPis`), never silently and never from a typed value. The e2e fake Pi (`installFakeCameraPi` in `e2e/helpers.ts`) runs the companion's own
  `CameraControls` over `apps/companion/test/cameraRig.ts`. **Not verified:** a real camera, `v4l2-ctl` and the permission case on a Pi (the sample
  output is written from the format of v4l-utils 1.22, not captured).
- Rotary axis A: prepared only – the DRO shows A and the jog panel gets A−/A+ (steps in degrees)
  when the machine profile has a rotary axis; nothing else.
- Connecting (`store/machine.ts` `connect`/`link`, pure `lib/link.ts`): a connection is up only once
  FluidNC answered (the library sends `?` at open and waits up to 8 s; `ConnectError` says
  unreachable / closed with code and reason / silent). A failure names the missing device: the Pi
  (`pi`), FluidNC behind the Pi (`relay` – the companion closes with 1011 `FluidNC unreachable: <url>`)
  or FluidNC typed in directly (`direct`); one warning per series (`link.*`, groups `linkPi` …).
  Outside a job the app tries again by itself (2 s → 30 s, `retryDelay`) while `autoRetry` is on
  ("Aufhören" switches it off, remembered); `mayRetry` refuses during a job and while
  `link.lostDuringJob` is set. A reconnect only asks (`?`, `$I`, `$G`, `$#`). The relay drops
  commands sent before FluidNC is there (only a status query waits). **Relay stamps are opt-in per client**: the socket
  through the Pi is opened with `?stamp=1` (`socketUrl`; the typed address stays what `isRelayUrl` compares), and only
  then the companion sends a `STAMP:<mono>:<wall>` text frame (the Pi's CLOCK_MONOTONIC and real time in ms) right before
  each message of FluidNC – every other client sees byte-identical frames as before, because an older app glues an unknown
  text frame onto the next line and loses the report (pinned frame-list tests in `apps/companion/test`). The library
  consumes the frame (`STAMP` is in its meta list, parsed strictly, a malformed one is dropped as meta), keeps it for the
  very next frame only and gives it to the reports that frame holds – the one a line began in, if it is split – as the
  second argument of `status` (`RelayStamp`); the store keeps it as `statusStamp`, set in the same step as `status`, `null`
  for a report without one (simulator, FluidNC direct, an older companion that ignores the parameter). `/api/health` says
  `stamps: true` – and nothing of the Pi's clock (the answer is open to every page; the app compares stamps with the newest
  report's, never with a time from the health answer). The strip scan uses the stamps (one clock per scan, see the photo map below); `docs/companion.md`. With a companion relaying,
  "Über den Pi verbinden" is the one way in the connection card; HTTP uploads go to FluidNC's own
  host (`fluidncHttpBase`), not the Pi.
- FluidNC's limits ("Grenzen der Steuerung", `MachineLimitsCard`, `store/limits.ts`, pure
  `lib/limits.ts`): max rate and acceleration per axis, read from `$CD`; written only at rest, by a
  hold, with `$/axes/<a>/<item>=<v>` (FluidNC validates; its planner uses the value at once), each
  read back. Kept beyond a restart only where config.yaml can be read byte for byte – through the
  companion (`/api/fluidnc/files/<name>`, `readFlashFile`) or the simulator: the old file goes to
  `<name>.bak`, the new one is `setConfigValues` (fluidnc-client: only the touched keys change,
  golden test) – both uploaded to `/files` and compared. Otherwise the card says "gilt bis zum
  Neustart"; never claim it is saved. The app's jog speed is its own and shows the cap
  (`effectiveFeed`). The simulator caps every move by its max rates like FluidNC's planner.
- Feedback (DESIGN.md §6.2): every control shows a press – `lib/press.ts` puts `data-press` on it at
  pointerdown (capture, passive) and `controls.css` lays `--press-tint` over its surface (both themes;
  NOT-HALT and PAUSE keep their own); `e2e/feedback.spec.ts` checks every visible control. Where the
  effect does not show by itself, the control carries a result mark (`components/Ack.tsx`:
  `useAck` + `AckMark` – busy · done · not possible, shape and word, no toast); a `HoldButton` whose
  `onConfirm` returns a promise shows it by itself (`false` = not possible). Commands sent with
  `useMachine.command` set `lastCommand`; `CommandAck` (jog panel, console) shows FluidNC's ok or
  `error:n` with its meaning.
- The reference plate of the camera calibration (`docs/kalibrierung.md`; pure `lib/calibrationPlate.ts`, card `CalibrationWizard`,
  settings `calibration.pitch/dots/dotDiameter`, defaults = `docs/kalibriertafel.svg`: 19 × 19, 10 mm, Ø 3): the plate is counted **in
  dots, not in mm** (`pitchSteps`: a field is a whole number of pitches within a quarter of one – a print that shrank, measured at 178.6 mm, is still the 18-pitch plate; a quarter is the budget _along_ the move, _across_ it the budget is the tilt: `stepsClear` offers a count only where the first step, predicted as a pure translation, stays nearer the right dot than a neighbour at the card's ±1° – below about 25 pitches between points, which matters for fine-pitch plates; `offeredPoints` offers 2…8 points
  where `n − 1` divides both fields in pitches – a stored count that is not offered stays shown and warned, never changed silently;
  hand-made fields are **warned, never blocked**). The field follows `(dots − 1) × pitch` only while it still is the plate's – and
  only while that is a place of a table (`PLACE`). **`precise` defaults to false** (a print is trusted for its angle only); a stored
  calibration **without `pitch`** (older browser state or Pi document) is flipped to false **once** (`normalizeCalibration`) – the safe
  direction, the operator can switch it on again. `normalizeCalibration(…, heal)`: the device's own storage is healed, **a Pi document
  is not** (`settingsFrom` passes `false`: only what it lacks is filled in, an out-of-range value stays for `insane` to refuse – the
  card's ranges are exactly `insane`'s, a test holds them together). The dot-size hint ("Kamera-Maßstab prüfen", > 10 % off) and the
  room hint **never gate a button**; the run itself refuses _before the first move_ where the machine is homed with soft limits and the
  field does not fit the travel (`gridShortfall`, from the corner dot towards +X/+Y, 0.3 mm approach, **room at both ends of both axes** = max(5 mm, 5 % of the larger field): a plate askew by 1° puts points below the first dot too, and the first dot is not under the crosshair – the log says
  `calibration.noRoom`, not "no marker"); not homed means not checked, and the card says so. The room hint hides while a task runs (the machine then stands wherever the run is).
  **A settings document from before the plate is read the way this app reads its own storage – on both sides of the merge:**
  `Slice.upgrade` (`store/stateSync.ts`; the settings slice maps `calibration` through `normalizeCalibration(…, false)`) is applied to the
  base and the Pi's copy _before_ `merge3`, so the one-time flip of `precise` is no edit of this device's that could override what another
  device set on the Pi meanwhile (the early-exit comparisons stay on the raw documents, which is what writes the flip back once). And
  `merge3` takes a sub-key the other copy lacks, inside a part both sides changed, as unchanged (as it does one level up) – a device with
  its own plate numbers does not lose them to a copy that predates them. The e2e rig believes 18 px/mm while it
  really is 20, which is why the size hint is exercised with explicit diameters there.
- **The photo map and scanning** (`store/photomap.ts`; pure `lib/mosaic.ts`, `lib/register.ts`, `lib/strips.ts`; the tests lay pictures
  of a made-up table, `test/synthetic.ts`, and compare with it): the map is **blended, not cut and pasted** – `Mosaic` keeps RGBA per
  chunk plus the summed weight per pixel; a frame counts 1 over its trusted middle (`CROP`, 70 % – what `planScan` plans its overlap
  with) and falls smoothly to 0 over the rim outside it (`edgeWeight`, `RAMP`), pixels where frames meet are the weighted mean, a frame's
  brightness is matched to what lies there (`matchGain`, ±20 %) and the camera's vignette is taken out (`FlatField`: radial and
  monotone, never a gain per cell – an edge of the board in every frame must not become a gradient). **A pixel is "covered" (alpha 255, the
  only kind `mapPicture` trusts) from `COVERED` of summed weight, and a test holds every pixel inside a scanned area – turned camera,
  vignette – to it**: tie the planning crop, the weight profile and `COVERED` together or the finders lose the rim of the scan (the series
  spec found it). `MEMORY` caps how much earlier pictures weigh, so a newer picture of a place takes over within a few frames. The chunk
  canvases only show the pixels (`putImageData`); a stream that cannot be read (another origin without permission) falls back to the old
  hard crop and cannot be scanned in strips (`stripsNeedPixels`).
  **Two ways to scan an area** (`scanArea(area, { precise })`, this device's choice in the panel `mode` · `tempo`, kept under
  `lowrider-control.scan`, never synced; **the default is by stops** – "In Fahrt" is opt-in): **by stops** (one picture at rest per
  point – `planScan`; what the series flow always uses, `precise: true`) and **in strips** (`planStrips` along the longer side, side by
  side as the rows of a scan by stops so the same coverage holds, a row run in segments of at most `MAX_STRIP_MM` = 400 so a scale error,
  the pictures waiting in memory and what one failed link can cost stay small; null – and then by stops – where the area is shorter
  than `MIN_STRIP_FRAMES` pictures). A strip: hop to its start, a **picture at rest** (the start anchor), a **`$J=` jog** (`jogMachine`:
  ends cleanly with `jogCancel`, a G1 move could not be stopped without a reset) along it, a picture at rest at its end.
  **The clock is no ruler**: the reports come every 200 ms, the camera's picture is late by an unknown time and the network jitters –
  10 ms is 0.5 mm at 50 mm/s – so `PositionTrack` (a line through the nearest reports at the time a picture was *first seen*,
  `FrameWatch` on every screen frame; lag `stripLag`, learned from the strips with `lagFromCorrections`) is only the first guess, and
  `solveStripSteps` places the pictures by what they show: each is registered (`registerShift`: normalised correlation of grey windows
  on the map raster, ±(2 + 0.06·speed) mm along the strip, 0.5 mm across, texture taken out by `highPassFrame` once per frame – **not**
  per window: a per-window mean moved with the edge of the valid region and biased every link by 1–4 %) against the one before it, **in
  both directions** – from the start anchor and from the end anchor. **Strict, in the order of what can go wrong:** two pictures are
  compared only where the clock already puts `LINK_MIN_OVERLAP` (35 %) of their trusted middles on one another and at the shift found
  (two that hardly meet agree on any repeating texture, wherever the shift that makes them meet is), the window holds both pictures
  *and* the room to move one against the other, shifts that leave little overlap still count as *other answers* (`weak`) so a repeating
  texture cannot win by having the true shift just below the floor, and a link needs a peak clear of the edge of the search, a second
  peak `minMargin` below it, enough texture and a correlation of `LINK_MIN_SCORE` (0.8 – a fainter link may be right but its shift is
  noisy, and a wrong place on the map costs more than a picture taken again). A picture both chains reach is placed at their blend by the
  distance along the strip, judged on how far it is from the chains' **common offset** (a scale error of the camera or the machine drifts
  both alike by error × length – the blend takes that out exactly; `MAX_SCALE_ERROR` 0.5 % is what a calibration may have, beyond it
  nothing both chains vouch for is placed; 0.5 mm from the common offset); one only one chain reaches is placed by that chain. **The
  lag is measured first**: until it is known (`lagKnown`; reset when the camera's source or stream changes) a short slow probe (≤ 110 mm
  at `PROBE_SPEED` 12 mm/s, where the clock's error is smaller than half a dot of the precision plate) runs before anything else; if it
  cannot be fitted – or a later segment's predecessor could not (`poor`: ≥ 6 pictures, fewer than half placed) – the run is **given up
  before the next jog** (`gaveUp`, store `stripsBad`: the panel says so, the estimate switches to stops, the next scan goes by stops
  until "In Fahrt" is chosen again), so a table without texture costs the probe and one segment, not the scan. **A segment is laid down
  only when its end anchor is in** (blended pixels cannot be taken back) – `solveAndLay` runs in slices (`turn()` after every link
  *and* every laid picture: PAUSE and NOT-HALT must never wait for it) while the machine hops to the next segment – and **what the strips
  left out is scanned by stops afterwards** (`holesIn`, `stripsRefill`; not for an area the map cannot hold – more chunks than
  `MAX_CHUNKS`), so a table with too little texture ends as a slow scan, not a wrong one. A scan ends on `cancelScan` (jog cancel), on a
  hold or an alarm (`held`: nothing more is sent, the operator decides – a resume finishes the jog) and on a lost connection; `ScanStats`
  (`scanStats()`, also `window.lowriderMap` for the tests) says what a scan did, per segment. The simulator's camera can be made late,
  unsteady and out of focus unseen by the app (`window.lowriderCameraLag`: `ms`, `jitterMs`, `blurPx`); `e2e/strips.spec.ts` scans the plate
  in strips with a lag of 0.3 s ± 40 ms and holds each dot to where a scan by stops puts it, in both directions, ends a scan by cancel and
  by PAUSE, and gives up on a board out of focus. **Measured on the simulator** (stock LowRider values): the time model
  (`scanEstimate`: trapezoid times with the machine's acceleration, one rule for both ways) reproduces a scan by stops of the demo's
  725 × 290 mm area to 2 % (202 s against 198 s); in strips it forecasts about ×1.5 at "Normal", ×2 at "Schnell" there, nothing at
  "Sanft" or for areas under about 300 × 300 mm. **What the code cannot do and the tests cannot show (one list):** a table that
  repeats itself with a pitch the clock's error can cover (a pattern of about 10 mm or less seen through a search of ±5 mm) – one
  picture off by a period is placed a period away, and both chains agree, because they share the clock; a plain board with no
  texture (the simulator's board in the demo scene: the run is given up there); a real camera's lag and its jitter, rolling shutter,
  exposure time and the motion blur at speed, a real controller's report timing and its feed hold during a jog (Grbl-family firmware
  ends a jog on a hold as Idle, the simulator as Hold – both end the scan), a real table's texture. Hence "In Fahrt" is opt-in with both
  estimates side by side, the series flow stays by stops, and `docs/scan.md` says how to check a strip scan on the machine.
  **One clock per scan, the Pi's or the browser's – never a mixture** (`lib/scanClock.ts` pure, `chooseScanClock` in `store/photomap.ts`,
  decided once per scan before the probe run): on **`pi`** the reports are put on the line with the relay's stamp (`statusStamp`, in the
  domain the pictures are stamped in: `mono` for a grab time, `wall` for `X-Timestamp`) and the pictures are the **stamped stream's**
  (`store/stampedFrames.ts`, opened once per scan and **closed as soon as the runs are over** – `closeStream` in `scanArea`: where the probe ends
  the strips (the clock went away, the table gave too little) because the area then goes by stops, after the strip loop – before the last strip
  is solved and before the refill by stops – whichever way the loop ended, and in `finally` for every other way out; between two strips it keeps
  running, because the clock check before the next strip needs a fresh picture; the pictures it kept stay readable and are decoded after the
  close; `e2e/strips.spec.ts` looks every 10 ms at how many simulated streams are open, `lowriderMap.streams()`; `lib/mjpeg.ts`, `lib/frameStamp.ts`) instead of the page's `FrameWatch`
  sampling – during the run only bytes and stamps are copied, `pickStripFrames` chooses the pictures after it (those inside the span of the
  `Jog` reports with the lag allowed for, ≥ 3 mm from the start, `MAX_STRIP_PICTURES`) and `decodeStamped` makes pixels of them one at a
  time with `turn()` in between; the status is asked for every `STRIP_POLL_MS` (100 ms) on top of the regular poll (`useMachine.pollStatus`,
  only a `?`) for the run only. Everything after that – anchors at rest, `registerShift`, `solveStripSteps`, the give-up gate, the
  refill by stops – is unchanged. **`browser` is the old path and its code did not change** (`browserCollector` is the moved sampler).
  The Pi's clock is used only if the reports carry a stamp (`relay`), the camera is a stream of the Pi (`device`), the stamped stream opened
  and gave a picture (`stream`, with the failure code in `clockDetail` – never an address) **and** one picture of it can be made into pixels by this
  browser (`picturesDecode` in `store/photomap.ts`, asked once at the choice before anything moves, `decodable` in `clockFromStream`; else `stream` /
  `no-decode` – or the probe would get no pictures and `stripsBad` would blame the table) **and** the newest picture's stamp lies within
  `STAMP_WINDOW_S` (3 s) of the newest report's in the same clock (`window`: a driver that stamps with another clock); otherwise the scan
  runs on the browser's clock and says why (`ScanStats.clockReason`, the log, the panel) – and no reason where no Pi is part of the
  connection. A stream that dies or leaves the window **during** the scan stops the runs before the next strip moves (`clockLost` in
  `lib/scanClock.ts`, asked at the start of every strip **and, where the probe run could not be fitted, once more before that is blamed on the table** –
  a stream that dropped or reports that lost their stamp during the probe are `clockLost`, not `gaveUp`; the refill by stops covers the rest, `stripsBad` is not set).
  **Cancel**: `cancelScan` also closes a stamped stream that is still being opened (`opening`, handed out by `openStampedStream`'s `onCreate`), the
  clock choice then says nothing (no log, no `lastClock`), and neither the probe nor `runStrip` sends the hop of a scan that is cancelled. **It compares the newest
  kept picture, so that one must be fresh**: a run keeps pictures `every` seconds apart (0.3 × field ÷ speed: 5 s at 5 mm/s for a field of 84 mm, the demo's – more than the 3 s window), so when
  the run is over the stream's spacing goes back to `MIN_FRAME_SPACING_S` (**`evicted`** – pictures pushed out of the 300-picture ring – is a
  note in the recording, `stamped-pictures`, and refuses nothing: a run keeps ~21 pictures, so it needs a huge frame or a long wait at rest
  to overflow, and then the solver places what is there and the refill by stops covers the start; untested, the simulator never overflows);
  a newest picture older than `STALE_PICTURE_MS` is a stopped
  stream (`stream`), not a clock that left (`window`). **The lag is per clock** (`lagClock`): a scan on another clock than the last
  one forgets it and measures again (also on a change of camera source or stream, as before); the Pi's first guess is 0 and its limits
  are `PI_LAG_LIMITS` (−0.5 … 1.5 s) because a report is stamped when the Pi *received* it, a little after FluidNC measured, so the lag
  between the two stamps can be below zero. `ScanStats` says `clock`, `clockReason`, `clockLost`, `stamp`, and `timingNoiseMs` – the spread
  of what the single pictures imply for the lag around its median, which no constant takes out (`timingNoiseMs` in `lib/strips.ts`). **The
  panel** names the clock of the last scan in strips and why not the Pi's (`lastClock`) **in words** (`lib/clockText.ts`: a German sentence for
  each reason at the choice, other sentences for a clock that went away mid-scan – "not connected through the Pi" is not true then –, the
  stream's failure code as a cause, `no-decode` as "the pictures cannot be made into pixels", the stamp's header as "capture time of the camera
  driver" …; the raw code or header is shown only beside it, in the mono face at the panel's own 14 px – DESIGN.md §7 knows no smaller text; `test/clockText.test.ts` reads `StampedFailure` from the source so a new code
  needs a sentence), and has the exposure of the camera (this device's, kept with mode and tempo under `lowrider-control.scan`, 0 = unknown):
  `maxSpeedForBlur` caps `stripSpeed` at 0.3 mm of blur, and where that is below 5 mm/s (the lag cannot be learned slower) the scan goes by
  stops and says so – **and the panel's estimate is then the by-stops one** (the same test, `stripSpeed(tempo) < MIN_LAG_SPEED`, in `scanArea`
  and in `PhotoMapPanel`), not "N Streifen" that will not be run. **The simulator's Pi** is
  `window.lowriderPiClock` (`PiClockSetup` in `sim/index.ts`; undefined by default = the simulator as it was): a Pi clock `offsetMs`
  hours ahead of the page's (7.2 million ms in the tests, so any mixing fails loudly), every message of the simulated controller late and
  uneven on its way to the page (`linkMs`, `linkJitterMs`, in order), a `STAMP:` frame before each (`stampLagMs`, `stampNoiseMs` are what
  stays in the stamp), `stamps: false` for a companion that stamps nothing (switchable while a scan runs: the stamps are lost mid-run), `undecodable: true` for pictures this
  browser cannot make pixels of, and `simulatorFrameSource()` – the camera's pictures at the true
  moment (the machine is caught up to it), stamped to the millisecond with `frameStampNoiseMs`, `frameClockOffsetMs` for a driver with its
  own clock; the camera's browser-side lag (`lowriderCameraLag`) touches neither stamp nor picture (`window.lowriderMap.stamp()` is the newest report's stamp, for the tests to wait for). `test/stampedPath.test.ts` drives the real chain end to end – a synthetic ustreamer stream with the header names of several versions through
  `openStampedStream` (fake `fetch` body, the real parser), the real `stampedCollector` (exported for it: its store subscription, the span of
  `Jog` reports, `pickStripFrames`) and `decode` with a fake `createImageBitmap` and a fake canvas – and says what it does not reach: a real
  browser's `fetch`/CORS, a real JPEG through a real `createImageBitmap`, the pixels of `readFrame`, the recording branch. `e2e/strips.spec.ts` holds the Pi's
  clock to the plate like a scan by stops, compares it with the browser's on a bad link and camera (numbers in `docs/scan.md`), and
  checks the fallback. **What stays and cannot be tested here:** the jitter of the Jackpot→Pi WLAN hop and FluidNC's own sampling and
  send time (both in the report's stamp), the V4L2 driver's buffer timestamp semantics, ustreamer's 1 ms resolution, a Safari on the iPad
  that may not stream a fetch body (then `stream`/`no-body-stream`, the browser's clock), the camera's own constant latency (learned),
  and which ustreamer version the Pi runs – `docs/scan.md` gives the two commands that tell. **Not told apart:** a stream whose first picture decodes and
  whose later ones do not (the probe then gets few pictures and sets `stripsBad`, as for a table with nothing to fit by) – only the picture the choice decodes is checked.
- **Recording a scan for analysis** (`lib/scanTrace.ts`, `store/scanTrace.ts`, the checkbox and the buttons in the photo map panel,
  `scripts/analyze-scan.py`): the lag of the camera, its blur at speed and what the real table gives to fit pictures by cannot be
  tested here, so a scan can be **recorded** and the file worked through away from the machine (`python3 scripts/analyze-scan.py
  file.zip`, needs numpy and Pillow). Off unless asked for, hooked into `scanArea` only – **no motion code of its own**; one recording
  spans several scans until it is saved or discarded (a scan by stops over the same area is the ground truth of the strip scan). One
  zip: `trace.json` and JPEGs (`TraceFile`; 40 MB cap, `dropped` counts what did not fit) holding every status report and every new
  picture of the camera with its arrival time on the page, the jog's send / ok / end, every picture as it was taken (**raw – before
  gain and vignette**, also the ones the solver refuses), the pictures at rest with where the machine reported itself, a dense grey
  series (320 × 240, up to 400 per run) and, per run, what the solver was given and answered (`solved`: anchors, predicted positions,
  both chains). Rules: **during a jog only pixels and stamps are copied** – encoding (`toBlob`) happens after the run, a picture at a
  time with `setTimeout(0)` in between; rAF gaps over `GAP_MS` are logged so stalls show up in the file (they are the recorder's own
  footprint too); **while recording, the run is not given up** (`keepGoing`: the give-up gate would empty the file on exactly the table
  it is wanted for – refused pictures stay off the map, holes are still refilled); the meta holds calibration, picture size, speeds, the
  lag as known, `viaCompanion` – **never an address or a login** (the e2e greps the whole text of `trace.json` – reports, pictures, solved events – and the names in the zip for addresses and login words) – and the user agent; the file contains photos of the
  table and the panel says so. The analyzer reports the rhythm of reports and pictures, stalls, how long a jog takes to start, the
  **lag of the pictures behind the reports from the registered (placed) pictures** – a lag cannot be found from positions that are
  relative within stretches, a steady speed hides it; absolute positions need the anchors, which is what the solver's placements are,
  checked against the pictures at rest – its timing noise, the sharpness by speed (content dependent), what the app could place and
  where the placed pictures really lie against the pictures at rest. `e2e/strips.spec.ts` records a stops and a strip scan with a lag
  of 0.3 s ± 40 ms and the pair was proven on it: lag found 342 ms (0.3 s + the mean of the jitter + the frame), timing noise 21 ms,
  placement against rest 0.03 mm mean, 0.12 mm worst. **A scan on the Pi's clock records both clocks** (still `TRACE_VERSION` 1, the new
  fields optional): `meta.clock` (`pi`, `browser`, `mixed`) and `options.clock` per scan, `stamp` on a report (the relay's mono/wall),
  `pictures` (every picture the stream kept in a run: when the page got it and the Pi's stamp), `stamp` on a `run` picture, and on a
  `solved` event the clock and per picture its stamp and its arrival – so one file gives the analyzer the lag and the timing noise of the
  page's *arrival* times (a report when the page received it, a picture when the page read the stream chunk that completed it – **not** when
  `<img>`/the screen first showed it, which is what a scan on the browser's clock uses) and of the Pi's stamps from the same placed pictures,
  says which scatters less – arrival of bytes against stamps, not a whole browser-clock scan – and reports how unevenly the page got reports and
  pictures against their stamps. An older file, or a run on the browser's clock, has none of it and is read as before.
- **The accuracy check with a rule and the squaring of the gantry** (`components/AccuracyCheck.tsx`, `AccuracySketch.tsx`,
  `CorrectionPanel.tsx`, pure `lib/squaring.ts`): frame of reference everywhere – the same as the test pattern's labels – origin
  at the **front left**, X to the right, Y to the back (Y is the long axis, rails left and right), the gantry's ends **X− and X+**,
  "vorne" is where the operator stands. The correction is **electronic**: the pull-off (`pulloff_mm`) of the two Y motors, the
  same as moving a limit switch (`squaringPulloff` in the workshop library: the X+ end runs ahead by W·tan γ, a larger pull-off
  leaves a motor further +Y when homing towards −Y). **Where the direction is decided is `proposeCorrections` – the words are
  made from its `squareness` and `shift` (`squaringStory`), never from a second calculation**, and `test/squaring.test.ts` holds
  the sentence to the geometry (marks laid with the X+ end ahead by a known angle, measured, corrected: both motor sides ×
  both homing directions × both signs; a swapped motor side doubles the error). **What can go wrong is after the write**:
  the six values and the result are cleared when the correction is written (a second "Auswerten" on them would correct the
  corrected config again); the first measurement is kept as `before` in `lowrider-control.accuracy` (a restart, a homing and a
  whole job lie between the write and its control) and survives a reload; **steps tick only from what is seen** – "restart
  and homing" from a homing run (`Home`) or a dropped link followed by a homed machine, watched at module level because homing is
  done from the jog panel which covers the card; before that a pattern's values may be entered, but the correction is **blocked**
  (it would show the old error); the control measurement is judged per metre (`compareSquaring`: good within the ruler's 0.3 mm/m ·
  better · unchanged – did not act · **doubled – the side of motor 1 is the other** · overshot – the rail distance too large).
  Drawings: lines are told apart by **number and line style**, the one being typed is thick as well as blue, every field has a
  small drawing of its own line beside it (so the reference is in view with the number pad open at 800 × 600), motor 1 is filled
  and numbered. The simulator's gantry answers to the pull-offs (`SIM_GANTRY`: rails 1400 mm apart, motor 1 on the right,
  homing −Y; the lean after every homing of Y is its own `SIM_ERRORS.gamma` plus atan(Δpull-off / width)), so
  `e2e/squaring.spec.ts` runs write → homing → control measurement and the wrong-side case on it. **Not covered:** the real
  machine's mechanics (which side motor 1 is on is the operator's answer, the drawing and the doubling verdict are the
  safeguards), and that the simulator does not change its scale when `steps_per_mm` is written (only the lean follows).
- After a measuring move, read the position and take pictures only after `settled()`
  (`store/settle.ts`): the status report in the store may be older than the move.
- No safety function lives in the browser; the app triggers and displays, FluidNC enforces.
