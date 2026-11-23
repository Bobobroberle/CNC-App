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
  parts cut in sections on the simulator's long board in `e2e/sections.spec.ts`, the five steps –
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
- Navigation (`store/ui.ts`): a `Place` is `start`, one of the five steps `job → tools → setup →
check → run` (① Job, ② Werkzeuge, ③ Einrichten, ④ Prüfen, ⑤ Fräsen) or a side area (`toollist`,
  `service`, `settings`, `console` – the console only with the expert switch). At most two levels:
  a place may have views (`VIEWS`; `SubNav` – Service & Diagnose: Diagnose · Meldungen · Historie ·
  Kalibrieren; Einstellungen: Verbindung · Maschine · Kamera · Experte). The jog panel is no place:
  `jogOpen` lays it over the context panel of any place. **A side area that is a list has no
  picture** (`placeHasStage`): its cards lie in a grid across the main area (`.area-panel`; a grid,
  not CSS columns – a card that unfolds must not make its neighbours jump); only calibrating and
  the camera's settings keep the stage, and the jog panel brings it back over any list. Whatever
  must show everywhere (the alarm banner) is therefore not a child of the stage alone. Steps can be jumped to freely; each shows ✓ ⚠ ✕ ○ read from the one
  readiness list (`lib/readiness.ts` → `lib/steps.ts`: a point belongs to the step it is dealt with
  on), and ⑤ starts only when nothing blocks. The place contents are plain compositions of the
  cards: `components/places/Steps.tsx`, `places/Areas.tsx`, `JogPanel.tsx`.
- The five steps (DESIGN.md §5; `docs/umbau-guide.md` says what each shows and where it deviates):
  each answers one question and brings its stage view (`STEP_STAGE` in `store/ui.ts`: ①② table,
  ③ the live picture where a calibrated camera runs, ④⑤ 3D; a view chosen by hand stays that
  step's, `stageViews`). **Depth per area** (§2) is `components/Depth.tsx`: what is needed every
  time stands open, the rest goes under "Mehr Optionen" / "Alle Parameter" (`useUi.depth`,
  remembered); a recommended value carries `Recommended`, one that differs `Deviation`.
  - **⑤ Fräsen** (`RunScreen.tsx`): **the start is the action bar's primary action and a hold**
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
  - **③ Einrichten**: `SetZeroCard` is the one way to the zero (tap shows the target → hold to
    drive → fine steps → hold to set); `ZeroHistoryCard` restores X/Y of the zeros a job was cut
    with; `ProbeTiles` are the probing assistants (a sketch with the direction each) – a cycle
    only measures, the result shows the deviation and is applied or discarded.
  - **① Job**: `JobDashboard` (loaded job as a card, `lib/preview.ts` for its picture, the drop
    zone as the empty state), `store/recent.ts` ("Zuletzt verwendet", `openJobFiles` for one or
    several files, the zeros a job was started with), `WorkpieceCard` (material, stock).
  - **② Werkzeuge**: `JobTools.tsx` over `useJobTools` (`store/jobTools.ts`) and the pure
    `lib/jobTools.ts` (state, issues, alternatives). `Tool.probe` marks a probe.
  - **④ Prüfen**: `Timeline.tsx` under the 3D picture (in the panel while the stage shows
    something else), operations from `lib/operations.ts` – only what the program itself names,
    nothing guessed; the checklist is the readiness list (`depth`, `tools`, `limits` are its
    checks of this step).
- Shell (`App.tsx`, DESIGN.md §4): `StatusBar` (the same on every screen: state badge with icon and
  word, X Y Z (A), spindle, feed, connection, messages flag, PAUSE, NOT-HALT) · `NavRow` (Start,
  stepper, quick search, the menu with the side areas – its button carries the open area's name) ·
  main area with the stage and the context panel ("Großbild" puts the panel away; 600–1023 px or
  upright: the panel is a `Sheet` along the bottom with three rests – `peek` (its handle), `half`
  (where it starts: below the picture, never over it) and `full` – moved by labelled buttons in the
  handle only, remembered per place (`useUi.sheet`), and refused while anything is held
  (`holdCount()`); < 600 px: `Monitor`, watching only: progress, state, position, the picture,
  abort through `AbortDialog`) ·
  `ActionBar` (left: Jog; right: **exactly one** primary action that names its target – on Start
  the "Als Nächstes" recommendation of `lib/next.ts` with its action, in ⑤ the start itself). The status bar must fit at
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
  (one of `VIEW_ACTIONS`: stage view, Einpassen, Großbild, key sheet, next step). The search never moves the
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
  (search, Ctrl/Cmd+→ next step, stage views, Einpassen, `?`) only run a command of the search;
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
  Optionen"), quick actions as holds with their reasons (`quickReason`). **Every way of jogging
  goes through the one action layer `store/jog.ts`** (`jogStep`, `jogHold`, `jogStop`, `jogFine`,
  `jogStick`…): buttons, keys, gamepad, handwheel, joystick and the mouse wheel never call the
  machine's jog functions themselves. The layer sends a jog only while the machine takes one,
  remembers the axis moved last and registers whatever is held in `lib/holds.ts`. The mouse wheel
  jogs fine (never coarser than 0.1 mm) only while the mouse button is held on its field
  (`WheelFine`) – a wheel that just turns moves nothing.
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
