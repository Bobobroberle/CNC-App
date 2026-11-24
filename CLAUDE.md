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
  while the start is blocked; **nothing in the Prüfen view** while no job runs or waits; a job that *waits* – a tool change, a single
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
  `control.spec.ts` measure (`inReach` in `e2e/helpers.ts`: the control's box lies inside the scroll box *and* a touch at
  its middle reaches it – `toBeVisible` cannot see clipping). A `.panel-body` that holds a dock has `scroll-padding-bottom` (`:has(.dock)` – a padding elsewhere would scroll things that are in view, which `e2e/areas.spec.ts` caught in the jog panel) so a control
  brought into view stops above the dock (`.stage-prompt:has(.dock)` too). **What a docked action leaves behind** (a result, a
  warning) lies in the card's flow below the stuck dock: put it in `<Result>` (`ui/dock.tsx`), which brings it into view once when it
  shows. Two actions side by side are `<Dock className="dock-row">` (24 px apart, as low as one button's – the tool change).
  **Deliberately not docked:** the CAM hand-over (one tap that replaces a
  program that is not the drawing's own – next to content that is being edited it would invite a slip), and anything
  in the action bar. On the machine's small screen the sheet at "half" is too short for a card and its dock beside the
  row above it (800 × 600: ~100 px of body): the sheet's "Größer" is the way (the spec measures at that rest).
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
  **Every other way to load, replace or take off the program goes through the central lock**
  in `store/job.ts` (`setProgramLock`, set by `store/underway.ts`): `load`, `loadDerived`, `unload` and
  `restoreOriginal` do nothing while a job is under way, say why (`job.locked`, its own message group `jobLocked`)
  and **return `false`** – a caller never reports "loaded" after that; a dropped file or a job of the recent list is
  turned away with one message before anything else happens. **A flow that does more than load** (the two-hole
  alignment, turning the board, the long example, the jigs, the sections) asks `programRefused()`
  (`store/underway.ts`) *before its first step* – a zero moved or a plan changed must not outlive a refused load;
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
  measuring runs (points 2–5 …), the corner plate and the recording to the ranges the cards allow; the profile needs real
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
  accepted:** the companion has no login and answers CORS `*` (as before this feature – the workshop network is trusted), so any
  page the operator opens could write the state; probe, hole, tag and tool-length results are not in the log yet.
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
  commands sent before FluidNC is there (only a status query waits). With a companion relaying,
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
- After a measuring move, read the position and take pictures only after `settled()`
  (`store/settle.ts`): the status report in the store may be older than the move.
- No safety function lives in the browser; the app triggers and displays, FluidNC enforces.
