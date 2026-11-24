import {
  alignRegistration,
  checkRegistrationHole,
  checkSides,
  circle,
  clearOfBoxes,
  compose,
  contourBounds,
  defaultOperations,
  flipContours,
  flipFor,
  gridOffsets,
  IDENTITY,
  invert,
  magnifySketch,
  mirror,
  onStock,
  proposeRegistration,
  readDxf,
  readSvg,
  registrationDepth,
  registrationDiameter,
  registrationLayout,
  rotation,
  scaleSketch,
  scaling,
  scalingAbout,
  sketchBox,
  sketchContours,
  sketchKeepsProportions,
  sketchTextOptions,
  textContours,
  toGcode,
  toolpaths,
  translation,
  type Contour,
  type CutSettings,
  type FlipAxis,
  type FlipNote,
  type Matrix,
  type Move,
  type Operation,
  type OperationKind,
  type Problem,
  type Registration,
  type Relief,
  type Bounds,
  type Point,
  type Side,
  type SidedCut,
  type Sketch,
  type SvgNote,
  type Tabs,
  type TextOptions,
} from '@lowrider/cam';
import { splitLines } from '@lowrider/gcode-core';
import { suggestFor, toolOwnValues } from '@lowrider/workshop';
import { create } from 'zustand';
import {
  framePoint,
  resizeTo,
  selectionFrame,
  turnTo,
  frameAngle,
  frameSize,
  type Frame,
  type HandleId,
  type Resize,
} from '../lib/camEdit';
import {
  contoursBox,
  holeCentre,
  isSelected,
  itemAt,
  itemsBounds,
  partsOf,
  place,
  type CamItem,
  type Selection,
} from '../lib/camItems';
import { fixturesInWork } from '../lib/clamps';
import { textBlockCentre } from '../lib/series';
import { inViewSpot } from '../lib/tableBox';
import type { FlipMethod, FlipPlan } from '../lib/flip';
import { isSimulatorAddress, SIM_BOARD } from '../sim';
import { useFlip } from './flip';
import { useJob } from './job';
import { useMachine } from './machine';
import { cameraCalibrated } from './photomap';
import { useRun } from './run';
import { jobUnderWay } from './underway';
import { useWorkshop } from './workshop';
import { parseProject, projectToText, type ProjectError } from '../lib/camProject';

export type { CamItem, Selection } from '../lib/camItems';

export interface CamSettings extends Omit<CutSettings, 'toolDiameter' | 'allowance'> {
  toolId: string;
  rpm: number;
  tabs: Tabs;
  /** Depth of engraved lines and text unless the item says otherwise, mm */
  engraveDepth: number;
  /** Finishing allowance, mm; 0 = cut to size at once */
  allowance: number;
}

/** A part machined from both sides: how it is turned over and found again. */
export interface TwoSided {
  /** Turned like a page (`x`: left and right swap) or over its front edge (`y`) */
  axis: FlipAxis;
  /** Pins are wanted although the camera could find the holes */
  pins: boolean;
  /** Material thickness entered in the drawing, mm; undefined takes the stock's height */
  thickness?: number;
  /** The registration holes follow the drawing until a finger moves one */
  autoHoles: boolean;
}

/**
 * What stands in the way of a two-sided job or is worth knowing about it:
 * what the two sides do to each other (rows of the list), a missing
 * thickness, nothing on the back, registration holes in a bad place.
 */
export type CamFlipNote =
  | FlipNote
  | { code: 'no-thickness' | 'no-back' | 'askew' }
  | { code: 'hole-on-cut' | 'hole-in-part' | 'hole-off-stock'; hole: 1 | 2 };

/** Notes that keep the job from being handed over: it would not come out right. */
export const blocksFlip = (note: CamFlipNote) =>
  note.code === 'no-thickness' || note.code === 'askew' || note.code === 'hole-on-cut';

export interface CamProject {
  name: string;
  items: CamItem[];
  /** Machined from both sides; null = from the front only */
  twoSided: TwoSided | null;
  /** Entity types the DXF reader skipped at the last import, with their count */
  skipped: Record<string, number>;
  /** What the SVG reader left out or assumed at the last import */
  notes: SvgNote[];
}

/** Something that cannot be cut, by the row of the list (0-based). */
export interface CamProblem {
  row: number;
  code: Problem['code'];
}

/** What can be set per item of the list. */
export type ItemPatch = Partial<
  Pick<CamItem, 'kind' | 'tabs' | 'relief' | 'depth' | 'side' | 'climb'>
>;

interface AddOptions {
  /** All contours are one item with one operation (a text, a hole grid) */
  single?: boolean;
  /** The contours are the strokes of this text: engraved */
  text?: string;
  /** How that text was set and where the middle of its block lies (for a series) */
  textStyle?: CamItem['textStyle'];
}

/** One state of the drawing to go back to. */
interface Snapshot {
  items: CamItem[];
  twoSided: TwoSided | null;
  selected: Selection;
  /**
   * Only the step that opening a project makes carries these (and the step back from it): the
   * name and the cutting settings come with the drawing – going back brings them back too.
   */
  name?: string;
  settings?: CamSettings;
}

/** A text as `addText` takes it: its height and how its lines are set. */
export type TextSetting = Pick<TextOptions, 'height' | 'spacing' | 'lineSpacing' | 'align'>;

interface CamStore {
  project: CamProject | null;
  /** States of the drawing to go back to (the last is the latest) and forward again */
  past: Snapshot[];
  future: Snapshot[];
  settings: CamSettings;
  problems: CamProblem[];
  /** For a part machined from both sides: what to know before it is handed over */
  flipNotes: CamFlipNote[];
  /** What the arranging acts on */
  selected: Selection;
  /** Starts an empty drawing (or keeps the open one) */
  open(): void;
  close(): void;
  /** Adds the contours of a DXF or SVG file to the drawing; throws when it cannot be read */
  importFile(name: string, text: string): void;
  /** The drawing as a project file (text), or null while there is none */
  saveProject(): string | null;
  /**
   * Opens a project file in place of the drawing – one step of undo brings the old one back. Never
   * puts a program on the table by itself: it goes through the drawing's own update, so a job under
   * way and a program that is not the drawing's own are left as they are. Refused files change nothing.
   */
  openProject(
    text: string,
  ):
    | { toolMissing: boolean; toolDiffers?: { file: number; now: number } }
    | { error: ProjectError };
  /** Adds contours as new items, selected for arranging */
  add(contours: Contour[], options?: AddOptions): void;
  /**
   * Adds text for engraving: centred on the drawing, or with its lower left
   * corner on the work zero when it is the first thing. Returns the
   * characters the font does not have.
   */
  addText(text: string, options: TextSetting): string[];
  /**
   * Adds a drawn thing by its measures, selected: in the middle of the
   * selection or of the drawing – the first thing with its lower left corner
   * on the work zero. If that place is not in `view` (the work box the table
   * shows), it goes to the middle of the view instead. Returns the
   * characters a text's font does not have. With `at`, its own origin (the
   * middle of a shape, the anchor of a text) lies exactly there.
   */
  addSketch(sketch: Sketch, view?: Bounds | null, at?: Point): string[];
  /**
   * Other measures (or words) for a drawn thing: its contours are made anew
   * where it lies. Changes of the same `field` in a row are one step to undo.
   * Returns the characters a text's font does not have.
   */
  setSketch(id: number, sketch: Sketch, field?: string): string[];
  removeItem(id: number): void;
  /** Empties the drawing */
  clear(): void;
  setItem(id: number, patch: ItemPatch): void;
  select(selected: Selection): void;
  /**
   * A finger on the drawing at a work point: selects what lies there – for a
   * tap also the shape it is inside of, for taking hold (`inside` false) only
   * what has a line under the finger. Returns whether there was something.
   */
  pick(point: { x: number; y: number }, tolerance: number, inside?: boolean): boolean;
  /**
   * The selection follows a finger: `move` shifts it by a distance from where
   * it lay – its lower left corner landing on a grid of `step` mm, if given –
   * and `end` makes the job anew. Null when nothing is selected.
   */
  drag(): { move(dx: number, dy: number, step?: number): void; end(): void } | null;
  /**
   * A handle of the selection follows a finger from the work point `from`:
   * a corner or side changes the size (a drawn shape by its measures,
   * everything else evenly), the turn handle turns it. `move` shows the
   * outline, `end` makes the job anew. Null when there is nothing to change.
   */
  edit(handle: HandleId, from: Point): { move(to: Point, step?: number): void; end(): void } | null;
  /** Puts the selection's lower left corner at a work point */
  moveTo(x: number, y: number): void;
  /** Puts the selection's middle at a work point */
  centreTo(x: number, y: number): void;
  /** Shifts the selection by a distance, mm */
  nudge(dx: number, dy: number): void;
  /** Turns the selection until it stands at this angle, degrees counter-clockwise */
  setAngle(degrees: number): void;
  /** Makes the selection `k` times as large, its lower left corner staying */
  scale(k: number): void;
  /** Takes the last change of the drawing back, and makes it again */
  undo(): void;
  redo(): void;
  /** Remembers the selection, and adds what was remembered beside where it came from */
  copy(): void;
  paste(): void;
  /** Turns the selection around its middle, degrees counter-clockwise */
  rotate(degrees: number): void;
  /** Flips the selection left–right (`x`) or up–down (`y`) around its middle */
  mirror(axis: 'x' | 'y'): void;
  /** A copy beside the selection, selected in its place */
  duplicate(): void;
  /** Copies of the selection in a grid of columns × rows, `gap` mm apart */
  array(columns: number, rows: number, gap: number): void;
  removeSelection(): void;
  /**
   * Machines the part from both sides (a patch; `{}` switches it on with
   * the usual choices) or from the front only (null). Two registration
   * holes come and go with it.
   */
  setTwoSided(patch: Partial<TwoSided> | null): void;
  /** Puts the registration holes back beside the parts, where they follow the drawing */
  proposeHoles(): void;
  setSettings(patch: Partial<CamSettings>): void;
  /** Cutting values from the tool and material libraries */
  suggest(): void;
  /**
   * Turns the drawing into G-code and loads it as the job (after every change to the drawing) –
   * where it may: never under a job that is under way, and over a program that is not the
   * drawing's own (a file opened since, the aligned back) only with `take`, the operator's tap.
   */
  generate(opts?: TakeOptions): boolean;
  /**
   * Like `generate`, after something outside the drawing changed that the
   * registration holes depend on (the cutter, the stock); false without a job.
   */
  remake(opts?: TakeOptions): boolean;
  /**
   * The drawing has changed while a job was under way and its program is not on the table yet:
   * what lies there is the one from before. Only a tap puts the drawing there (`take`) – unless
   * nothing was loaded, then it goes there by itself when the job ends.
   */
  ahead: boolean;
  /**
   * The file name of the program the drawing itself last put on the table (`ownsTable`): the
   * drawing can be renamed by its first import while its program is still loaded under the old name.
   */
  table: string | null;
}

/** `take`: the operator asked for the drawing to be on the table, whatever lies there now */
export interface TakeOptions {
  take?: boolean;
}

const TABS: Tabs = { count: 4, width: 6, height: 2 };
/** Room between a copy and its original, mm */
const COPY_GAP = 10;
/** Most copies one array makes: enough for a sheet, not enough to hang the tablet */
const MAX_COPIES = 400;

function initialSettings(): CamSettings {
  const tool = useWorkshop.getState().tools[0];
  return {
    toolId: tool?.id ?? '',
    depth: 6,
    engraveDepth: 1,
    stepdown: 2,
    stepover: 0.4,
    feed: 1500,
    plungeFeed: 400,
    rpm: 18000,
    rampAngle: 5,
    safeZ: 5,
    climb: true,
    allowance: 0,
    tabs: TABS,
  };
}

const toolDiameter = (settings: CamSettings) =>
  useWorkshop.getState().tools.find((t) => t.id === settings.toolId)?.diameter ?? 6;

/** Steps the drawing can go back */
const HISTORY = 100;
/** A pasted copy lies this far from what it was copied from, mm */
const PASTE_SHIFT = 10;

let nextId = 1;
/** What Ctrl+C took, and how often it was pasted since */
let clipboard: CamItem[] = [];
let pasted = 0;

/** What a sketch makes: its contours, and for a text how it was set. */
function fromSketch(sketch: Sketch) {
  const made = sketchContours(sketch);
  if (sketch.type !== 'text') return { source: made.contours, missing: made.missing };
  const options = sketchTextOptions(sketch);
  const { width } = textContours(sketch.text, options);
  return {
    source: made.contours,
    missing: made.missing,
    text: sketch.text.trim(),
    textStyle: { options, centre: textBlockCentre(sketch.text, options, width) },
  };
}

/** The box of a drawn thing in its own coordinates: by its measures, a text by its strokes. */
const ownBox = (sketch: Sketch, source: readonly Contour[]) =>
  sketchBox(sketch) ?? contoursBox(source);

/** Where a new sketch keeps still when a measure is typed: a corner, or its own origin. */
const typedAnchor = (sketch: Sketch): readonly [number, number] | null =>
  sketch.type === 'rect' || sketch.type === 'grid' ? [0, 0] : null;
const EMPTY: CamProject = { name: 'zeichnung', items: [], twoSided: null, skipped: {}, notes: [] };

const through = (kind: OperationKind) => kind === 'outside' || kind === 'inside';

/** How an item of the drawing is cut: its operation without the contour it belongs to. */
export function itemOperation(item: CamItem, settings: CamSettings): Omit<Operation, 'contour'> {
  return {
    kind: item.kind,
    depth: item.depth ?? (item.kind === 'on' ? settings.engraveDepth : undefined),
    tabs: through(item.kind) && item.tabs ? settings.tabs : undefined,
    relief: (through(item.kind) || item.kind === 'pocket') && item.relief ? item.relief : undefined,
    // its own direction, where it has one to choose (a stale one from another kind does not count);
    // else the job's (the library falls back)
    climb: through(item.kind) || item.kind === 'pocket' ? item.climb : undefined,
  };
}

/** The cutter of the drawing: its diameter, mm. */
export const camToolDiameter = (settings: CamSettings) => toolDiameter(settings);

/** Room between the cut around a part and the rim of a registration hole beside it, mm */
const HOLE_ROOM = 6;

/** The stock as the Job room knows it: its box on the table and its height; null if not entered. */
function enteredStock() {
  const stock = useWorkshop.getState().setup.stock;
  return stock
    ? {
        box: { minX: stock.min.x, minY: stock.min.y, maxX: stock.max.x, maxY: stock.max.y },
        height: stock.max.z - stock.min.z,
      }
    : null;
}

/** Room kept between a registration hole and a clamp, mm */
const CLAMP_ROOM = 5;

/**
 * Whether there is room for two registration holes of radius `r` (work XY):
 * on the stock, if that was entered, and clear of the clamps marked on the table.
 */
function holesFit(holes: Registration, r: number): boolean {
  const stock = enteredStock();
  const { fixtures, fixtureFrame } = useWorkshop.getState().setup;
  const wco = useMachine.getState().status?.wco;
  const clamps = fixturesInWork(fixtures, fixtureFrame, wco ? [wco[0] ?? 0, wco[1] ?? 0] : null);
  const boxes = clamps.map((f) => ({ minX: f.min.x, minY: f.min.y, maxX: f.max.x, maxY: f.max.y }));
  return [holes.a, holes.b].every(
    (p) => (!stock || onStock(p, r, stock.box)) && clearOfBoxes(p, r + CLAMP_ROOM, boxes),
  );
}

/**
 * How thick the material on the table is, as far as the app knows: the
 * height of the stock entered in the Job room – or, on the simulator, of
 * its board.
 */
export function knownThickness(): number | undefined {
  const { url, connection } = useMachine.getState();
  const simulated = connection === 'connected' && isSimulatorAddress(url);
  return enteredStock()?.height ?? (simulated ? SIM_BOARD.thickness : undefined);
}

/** Thickness of the material of a two-sided part: entered in the drawing, else what is known. */
export const flipThickness = (two: TwoSided): number | undefined =>
  two.thickness ?? knownThickness();

/** How the turned part is found again: by the camera once it is set up, else on pins. */
export const flipMethod = (two: TwoSided): FlipMethod =>
  !two.pins && cameraCalibrated(useWorkshop.getState().settings.camera) ? 'camera' : 'pins';

/** The file names of the job a drawing makes: one program, or front and back. */
export const jobNames = (name: string) => ({
  single: `${name}.nc`,
  front: `${name}_vorderseite.nc`,
  back: `${name}_rueckseite.nc`,
});

export const sameLines = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((line, i) => line === b[i]);

/**
 * Is this program the drawing's own – the one it put on the table last, or one under the names it
 * has now (its program, or its front)? Nothing loaded is nobody's.
 */
export function ownsTable(fileName: string | null): boolean {
  if (fileName === null) return false;
  const { project, table } = useCam.getState();
  if (fileName === table) return true;
  const names = project && jobNames(project.name);
  return names !== null && (fileName === names.single || fileName === names.front);
}

/** A text flipped in place, so it reads right on the other side. */
function mirrored(item: CamItem, axis: FlipAxis): CamItem {
  const b = itemsBounds([item]);
  if (!b) return item;
  const at = axis === 'x' ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
  const placement = compose(mirror(axis, at), item.placement);
  return { ...item, placement, contours: place(item.source, placement) };
}

export const useCam = create<CamStore>((set, get) => {
  /** What the last remembered step changed: the same thing again is the same step */
  let lastField: string | null = null;
  const snap = (): Snapshot | null => {
    const { project, selected } = get();
    return project && { items: project.items, twoSided: project.twoSided, selected };
  };
  /**
   * Keeps the drawing as it was (by default: as it is now, before a change)
   * as a step to go back to. Changes of one `field` in a row – a number
   * being typed, a part nudged along – are one step.
   */
  const remember = (before = snap(), field: string | null = null) => {
    if (!before || (field !== null && field === lastField)) return;
    lastField = field;
    set((s) => ({ past: [...s.past, before].slice(-HISTORY), future: [] }));
  };
  /**
   * May the drawing's program go on the table now? Never under a job that is under way (the
   * drawing is then ahead of the table – if its program would differ from what lies there –, to be
   * put there afterwards); over a program that is not its own – a file opened since, the aligned
   * back – only when the operator asked (`take`).
   */
  const mayLoad = (take: boolean, texts: { front: string; back: string | null }): boolean => {
    const { fileName, lines } = useJob.getState();
    const mine = fileName === null || ownsTable(fileName);
    const underWay = jobUnderWay();
    // The drawing's program is what lies there already (nothing to put anywhere)?
    const plan = useFlip.getState().plan;
    const same =
      fileName !== null &&
      mine &&
      sameLines(lines, splitLines(texts.front)) &&
      (texts.back === null || plan?.back.text === texts.back);
    if (underWay) {
      const ahead = mine && !same;
      if (get().ahead !== ahead) set({ ahead });
      return false;
    }
    // A job has ended while the drawing was ahead of its program: that program stays – with its
    // summary – until the tap (`take`), however often the drawing is worked on meanwhile.
    if (!take && mine && fileName !== null && get().ahead) {
      if (same) set({ ahead: false });
      return false;
    }
    return mine || take;
  };
  /**
   * Takes the job of this drawing off the stage: there is nothing to cut. Not the program of a job
   * that is under way, and not that of a job that has ended while the drawing was ahead of it – it
   * stays, with its summary, until the tap (`take`).
   */
  const offStage = (take = false) => {
    const { fileName } = useJob.getState();
    if (!ownsTable(fileName)) {
      if (get().ahead) set({ ahead: false });
      return;
    }
    // The program that runs, or waits for its next part, stays where it is.
    if (jobUnderWay()) {
      set({ ahead: true });
      return;
    }
    if (!take && get().ahead) return;
    set({ ahead: false, table: null });
    useJob.getState().unload();
    useFlip.getState().setPlan(null);
  };
  /**
   * The two registration holes of a two-sided part, last in the list: put
   * beside the parts (as long as no finger has moved one), as large as the
   * cutter makes them. Without parts, or from one side only, there are none.
   */
  const withHoles = (items: CamItem[], two: TwoSided | null) => {
    const parts = partsOf(items);
    const box = itemsBounds(parts);
    if (!two || !box) return { items: parts, auto: true };
    const tool = toolDiameter(get().settings);
    const d = registrationDiameter(tool);
    const old = ([1, 2] as const).map((n) => items.find((i) => i.registration === n));
    const auto = two.autoHoles || old.some((h) => !h);
    const proposed = proposeRegistration(box, two.axis, tool + d / 2 + HOLE_ROOM, (h) =>
      holesFit(h, d / 2),
    );
    const holes = ([1, 2] as const).map((n): CamItem => {
      const before = old[n - 1];
      const at = auto || !before ? proposed[n === 1 ? 'a' : 'b'] : holeCentre(before);
      const source = [circle(0, 0, d)];
      const placement = translation(at.x, at.y);
      return {
        id: before?.id ?? nextId++,
        group: before?.group ?? nextId++,
        source,
        placement,
        contours: place(source, placement),
        kind: 'drill',
        tabs: false,
        relief: null,
        side: 'front',
        registration: n,
      };
    });
    return { items: [...parts, ...holes], auto };
  };
  /** Replaces the items and makes the job anew; false when there is nothing to cut. */
  const update = (
    items: CamItem[],
    selected: Selection = get().selected,
    take = false,
  ): boolean => {
    const p = get().project;
    if (!p) return false;
    const held = withHoles(items, p.twoSided);
    const gone = typeof selected === 'number' && !held.items.some((i) => i.group === selected);
    set({
      project: {
        ...p,
        items: held.items,
        twoSided: p.twoSided && { ...p.twoSided, autoHoles: held.auto },
      },
      selected: gone ? null : selected,
    });
    return get().generate({ take });
  };
  /**
   * After the selection has been moved: a registration hole taken on its own
   * stays where it was put, brought in line with the other one (level with
   * it or straight above it), so the turned part still fits.
   */
  const moved = (items: CamItem[]) => {
    const { selected, project } = get();
    const hole =
      typeof selected === 'number'
        ? items.find((i) => i.registration !== undefined && i.group === selected)
        : undefined;
    const other = hole && items.find((i) => i.registration !== undefined && i !== hole);
    if (!project?.twoSided || !hole || !other) {
      update(items);
      return;
    }
    const at = alignRegistration(holeCentre(hole), holeCentre(other));
    const placement = translation(at.x, at.y);
    set({ project: { ...project, twoSided: { ...project.twoSided, autoHoles: false } } });
    update(
      items.map((i) =>
        i === hole ? { ...i, placement, contours: place(i.source, placement) } : i,
      ),
    );
  };
  const chosen = () => {
    const { project, selected } = get();
    return project?.items.filter((i) => isSelected(i, selected)) ?? [];
  };
  /** Moves, turns or mirrors the selection. */
  const transform = (m: Matrix, field: string | null = null) => {
    const { project, selected } = get();
    if (!project) return;
    remember(snap(), field && `${field}:${selected}`);
    moved(
      project.items.map((i) => {
        if (!isSelected(i, selected)) return i;
        const placement = compose(m, i.placement);
        return { ...i, placement, contours: place(i.source, placement) };
      }),
    );
  };
  const middle = () => {
    const b = itemsBounds(chosen());
    return b && { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  };
  /**
   * The items as a size handle or a typed size leaves them: a drawn shape
   * alone gets other measures and keeps the point across from the handle
   * where it is; everything else is scaled evenly about that point – and a
   * drawn shape among it takes the scale into its measures.
   */
  const resized = (starts: readonly CamItem[], frame: Frame, r: Resize): CamItem[] => {
    const one = starts.length === 1 ? starts[0]! : null;
    if (one?.sketch) {
      const sketch = scaleSketch(one.sketch, r.kx, r.ky);
      return [reshaped(one, sketch, [r.fx, r.fy])];
    }
    const k = r.kx;
    const about = {
      x: frame.box.minX + r.fx * (frame.box.maxX - frame.box.minX),
      y: frame.box.minY + r.fy * (frame.box.maxY - frame.box.minY),
    };
    const grow = compose(compose(frame.m, scalingAbout(k, k, about)), invert(frame.m)!);
    return starts.map((i) => {
      if (!i.sketch) {
        const placement = compose(grow, i.placement);
        return { ...i, placement, contours: place(i.source, placement) };
      }
      // The measures grow, the placement only moves: the numbers stay true.
      const sketch = magnifySketch(i.sketch, k);
      const placement = compose(compose(grow, i.placement), scaling(1 / k));
      const { missing: _missing, ...made } = fromSketch(sketch);
      return { ...i, ...made, sketch, placement, contours: place(made.source, placement) };
    });
  };
  /**
   * A drawn thing with other measures. `keep` names the point of its box
   * that stays where it is (shares of the width and height); without it the
   * thing's own origin stays – the middle of a shape, the anchor of a text.
   */
  const reshaped = (
    item: CamItem,
    sketch: Sketch,
    keep: readonly [number, number] | null,
  ): CamItem => {
    const made = fromSketch(sketch);
    const before = keep && ownBox(item.sketch!, item.source);
    const after = keep && ownBox(sketch, made.source);
    let { placement } = item;
    if (keep && before && after) {
      const at = (b: typeof before) => framePoint({ m: IDENTITY, box: b }, keep[0], keep[1]);
      placement = compose(
        placement,
        translation(at(before).x - at(after).x, at(before).y - at(after).y),
      );
    }
    const { missing: _missing, ...rest } = made;
    return { ...item, ...rest, sketch, placement, contours: place(made.source, placement) };
  };
  /** Replaces the chosen items by their changed selves (same ids), without making the job. */
  const show = (changed: readonly CamItem[]) => {
    const p = get().project;
    if (!p) return;
    const by = new Map(changed.map((i) => [i.id, i]));
    set({ project: { ...p, items: p.items.map((i) => by.get(i.id) ?? i) } });
  };
  /** Copies of the selection, each shifted by one of the offsets; one new group per copy and group. */
  const copies = (
    offsets: readonly { x: number; y: number }[],
    from: readonly CamItem[] = chosen(),
  ): CamItem[] => {
    const out: CamItem[] = [];
    for (const o of offsets) {
      const groups = new Map<number, number>();
      // The registration holes are not copied: there are two of them.
      for (const i of partsOf(from)) {
        if (!groups.has(i.group)) groups.set(i.group, nextId++);
        const placement = compose(translation(o.x, o.y), i.placement);
        out.push({
          ...i,
          id: nextId++,
          group: groups.get(i.group)!,
          placement,
          contours: place(i.source, placement),
        });
      }
    }
    return out;
  };

  /**
   * Adds items in one group, each from its own contours; how they are cut
   * is first chosen with the whole drawing in view. The group is selected.
   */
  const insert = (
    made: readonly (Pick<CamItem, 'source' | 'placement'> &
      Partial<Pick<CamItem, 'sketch' | 'text' | 'textStyle'>>)[],
  ) => {
    const p = get().project;
    if (!p || made.length === 0) return;
    remember();
    const { settings } = get();
    const before = p.items.flatMap((i) => i.contours);
    const placed = made.map((m) => place(m.source, m.placement));
    // The first choices look at the whole drawing: a circle in an outline is a hole.
    const fresh = defaultOperations(
      [...before, ...placed.flat()],
      toolDiameter(settings),
      settings.tabs,
    );
    const group = nextId++;
    let at = before.length;
    const items = made.map((m, k): CamItem => {
      const op = fresh[at]!;
      at += placed[k]!.length;
      return {
        id: nextId++,
        group,
        ...m,
        contours: placed[k]!,
        kind: m.text === undefined ? op.kind : 'on',
        tabs: m.text === undefined && op.tabs !== undefined,
        relief: null,
        side: 'front',
      };
    });
    update([...p.items, ...items], group);
  };
  const restore = (to: Snapshot) => {
    const p = get().project!;
    lastField = null;
    set({
      project: { ...p, twoSided: to.twoSided, ...(to.name !== undefined ? { name: to.name } : {}) },
      ...(to.settings ? { settings: to.settings } : {}),
    });
    update(to.items, to.selected);
  };
  /** The state to come back to from a step that carries the name and the settings carries them too */
  const alongWith = (now: Snapshot | null, step: Snapshot): Snapshot | null =>
    now && (step.name !== undefined || step.settings !== undefined)
      ? { ...now, name: get().project!.name, settings: get().settings }
      : now;

  return {
    project: null,
    past: [],
    future: [],
    settings: initialSettings(),
    problems: [],
    flipNotes: [],
    selected: null,
    ahead: false,
    table: null,
    open() {
      if (!get().project) set({ project: EMPTY, selected: null, ahead: false, table: null });
    },
    close: () =>
      set({
        project: null,
        problems: [],
        flipNotes: [],
        selected: null,
        past: [],
        future: [],
        ahead: false,
        table: null,
      }),
    saveProject() {
      const { project, settings } = get();
      return project ? projectToText(project, settings, new Date(), toolDiameter(settings)) : null;
    },
    openProject(text) {
      const parsed = parseProject(text);
      if ('error' in parsed) return parsed;
      // A tool this workshop has not: the cutter stays the one that is chosen now (and it is said)
      const { toolId, ...rest } = parsed.settings;
      const toolMissing =
        toolId !== undefined && !useWorkshop.getState().tools.some((t) => t.id === toolId);
      get().open();
      // Whatever the file does not go well with leaves the drawing as it was: nothing is half taken
      const kept = { ...get(), nextId, lastField };
      try {
        remember({ ...snap()!, name: get().project!.name, settings: get().settings });
        // What is made from now on starts above every id and group of the file
        nextId = Math.max(nextId, parsed.highestId + 1);
        const items = parsed.project.items.map((i) => ({
          ...i,
          contours: place(i.source, i.placement),
        }));
        set((s) => ({
          project: { ...parsed.project, items },
          settings: { ...s.settings, ...(toolMissing ? rest : parsed.settings) },
          selected: null,
          problems: [],
          flipNotes: [],
        }));
        update(items, null, false);
      } catch {
        nextId = kept.nextId;
        lastField = kept.lastField;
        set({
          project: kept.project,
          settings: kept.settings,
          selected: kept.selected,
          past: kept.past,
          future: kept.future,
          problems: kept.problems,
          flipNotes: kept.flipNotes,
        });
        return { error: 'invalid-project' as const };
      }
      // The cutter has the id of the file's, but another diameter here: the toolpaths follow this one
      const library = useWorkshop.getState().tools.find((x) => x.id === toolId);
      const file = parsed.toolDiameter;
      const toolDiffers =
        library && file !== undefined && Math.abs(library.diameter - file) > 1e-6
          ? { file, now: library.diameter }
          : undefined;
      return toolDiffers ? { toolMissing, toolDiffers } : { toolMissing };
    },
    importFile(name, text) {
      const svg = /\.svg$/i.test(name) || /<svg[\s>]/i.test(text.slice(0, 2000));
      const drawing = svg
        ? { ...readSvg(text), skipped: {} }
        : { ...readDxf(text), notes: [] as SvgNote[] };
      get().open();
      const p = get().project!;
      // The first file gives the drawing its name.
      const named = p.items.length === 0 || p.name === EMPTY.name;
      set({
        project: {
          ...p,
          name: named ? name.replace(/\.[^.]*$/, '') : p.name,
          skipped: drawing.skipped,
          notes: drawing.notes,
        },
      });
      get().add(drawing.contours);
    },
    add(added, options = {}) {
      get().open();
      if (added.length === 0) return;
      const extra = {
        ...(options.text !== undefined ? { text: options.text } : {}),
        ...(options.textStyle ? { textStyle: options.textStyle } : {}),
      };
      insert(
        options.single || options.text !== undefined
          ? [{ source: added, placement: IDENTITY, ...extra }]
          : added.map((c) => ({ source: [c], placement: IDENTITY })),
      );
    },
    addText(text, options) {
      return get().addSketch({
        type: 'text',
        text,
        height: options.height,
        spacing: options.spacing ?? 0,
        lineSpacing: options.lineSpacing ?? 1.6,
        align: options.align ?? 'left',
      });
    },
    addSketch(sketch, view = null, at) {
      const { missing, ...made } = fromSketch(sketch);
      const b = ownBox(sketch, made.source);
      if (!b) return missing;
      get().open();
      const parts = partsOf(get().project!.items);
      const picked = partsOf(chosen());
      // In the middle of what it goes on (the selected part, else the drawing), or at the work zero.
      const on = itemsBounds(picked.length > 0 ? picked : parts);
      // A text by the middle of its block: other words typed into it stay in the middle.
      const middle = made.textStyle?.centre ?? {
        x: (b.minX + b.maxX) / 2,
        y: (b.minY + b.maxY) / 2,
      };
      const zero = { x: 0, y: 0 };
      const to = on
        ? inViewSpot(view, { x: (on.minX + on.maxX) / 2, y: (on.minY + on.maxY) / 2 })
        : inViewSpot(view, zero) === zero
          ? { x: middle.x - b.minX, y: middle.y - b.minY }
          : inViewSpot(view, zero);
      let placement = at ? translation(at.x, at.y) : translation(to.x - middle.x, to.y - middle.y);
      // Never exactly on its twin, where it could not be seen: a little beside it.
      const same = JSON.stringify(sketch);
      const hidden = (m: Matrix) =>
        parts.some(
          (i) =>
            JSON.stringify(i.sketch) === same &&
            Math.hypot(i.placement.e - m.e, i.placement.f - m.f) < 0.5,
        );
      while (!at && hidden(placement)) {
        placement = compose(translation(PASTE_SHIFT, -PASTE_SHIFT), placement);
      }
      insert([{ ...made, sketch, placement }]);
      return missing;
    },
    setSketch(id, sketch, field) {
      const item = get().project?.items.find((i) => i.id === id);
      if (!item?.sketch) return [];
      const { missing, source } = fromSketch(sketch);
      // A text without a stroke (no words yet) keeps what it shows.
      if (source.length === 0) return missing;
      remember(snap(), field ? `sketch:${id}:${field}` : null);
      const changed = reshaped(item, sketch, typedAnchor(sketch));
      update(get().project!.items.map((i) => (i.id === id ? changed : i)));
      return missing;
    },
    removeItem(id) {
      const p = get().project;
      if (!p) return;
      const items = p.items.filter((i) => i.id !== id);
      if (items.length === p.items.length) return;
      remember();
      const { selected } = get();
      update(items, items.some((i) => isSelected(i, selected)) ? selected : null);
    },
    clear() {
      const p = get().project;
      // The name stays: the job on the stage is still this drawing's.
      if (!p) return;
      if (p.items.length > 0) remember();
      const twoSided = p.twoSided && { ...p.twoSided, autoHoles: true };
      set({
        project: { ...EMPTY, name: p.name, twoSided },
        problems: [],
        flipNotes: [],
        selected: null,
      });
      offStage();
    },
    setItem(id, patch) {
      const p = get().project;
      if (!p) return;
      remember(snap(), `item:${id}:${Object.keys(patch).join()}`);
      const two = p.twoSided;
      update(
        p.items.map((i) => {
          if (i.id !== id) return i;
          const next = { ...i, ...patch };
          // A text put on the other side is flipped in place: it reads right there.
          const turned = patch.side !== undefined && patch.side !== i.side && i.text !== undefined;
          return turned && two ? mirrored(next, two.axis) : next;
        }),
      );
    },
    select(selected) {
      lastField = null;
      set({ selected });
    },
    pick(point, tolerance, inside = true) {
      const { project, selected } = get();
      const hit = project && itemAt(project.items, point, tolerance, inside);
      if (!hit) return false;
      // With everything selected, a finger on any part takes all of it.
      if (selected !== 'all') set({ selected: hit.group });
      return true;
    },
    drag() {
      const { project } = get();
      const box = itemsBounds(chosen());
      if (!project || !box) return null;
      const from = new Map(project.items.map((i) => [i.id, i.placement]));
      const before = snap();
      let dragged = false;
      return {
        move(dx, dy, step = 0) {
          const p = get().project;
          if (!p) return;
          dragged = true;
          if (step > 0) {
            // Round numbers for the corner, so the position can be read and typed again.
            dx = Math.round((box.minX + dx) / step) * step - box.minX;
            dy = Math.round((box.minY + dy) / step) * step - box.minY;
          }
          const { selected } = get();
          // Only the outline follows the finger; the toolpath is made when it lets go.
          set({
            project: {
              ...p,
              items: p.items.map((i) => {
                const start = from.get(i.id);
                if (!start || !isSelected(i, selected)) return i;
                const placement = compose(translation(dx, dy), start);
                return { ...i, placement, contours: place(i.source, placement) };
              }),
            },
          });
        },
        end() {
          if (!dragged || !get().project) return;
          remember(before);
          moved(get().project!.items);
        },
      };
    },
    edit(handle, from) {
      const starts = chosen();
      const frame = selectionFrame(starts);
      // The registration holes are only moved: two round holes that stay in line.
      if (!frame || starts.some((i) => i.registration !== undefined)) return null;
      const before = snap();
      const one = starts.length === 1 ? starts[0]! : null;
      const uniform = !one?.sketch || sketchKeepsProportions(one.sketch);
      const centre = framePoint(frame, 0.5, 0.5);
      let changed = false;
      return {
        move(to, step = 0) {
          changed = true;
          if (handle !== 'turn') {
            show(resized(starts, frame, resizeTo(frame, handle, to, uniform, step)));
            return;
          }
          const turn = rotation(turnTo(frame, from, to), centre);
          show(
            starts.map((i) => {
              const placement = compose(turn, i.placement);
              return { ...i, placement, contours: place(i.source, placement) };
            }),
          );
        },
        end() {
          if (!changed || !get().project) return;
          remember(before);
          moved(get().project!.items);
        },
      };
    },
    moveTo(x, y) {
      const b = itemsBounds(chosen());
      if (b) transform(translation(x - b.minX, y - b.minY), 'move');
    },
    centreTo(x, y) {
      const b = itemsBounds(chosen());
      if (b) transform(translation(x - (b.minX + b.maxX) / 2, y - (b.minY + b.maxY) / 2), 'move');
    },
    nudge(dx, dy) {
      if (chosen().length > 0) transform(translation(dx, dy), 'nudge');
    },
    setAngle(degrees) {
      const frame = selectionFrame(chosen());
      const c = middle();
      if (frame && c) transform(rotation(degrees - frameAngle(frame), c), 'angle');
    },
    scale(k) {
      const starts = chosen();
      const frame = selectionFrame(starts);
      if (!frame || !(k > 0) || starts.some((i) => i.registration !== undefined)) return;
      remember(snap(), `scale:${get().selected}`);
      show(resized(starts, frame, { kx: k, ky: k, fx: 0, fy: 0 }));
      moved(get().project!.items);
    },
    undo() {
      const { past, future } = get();
      const to = past[past.length - 1];
      const now = to && alongWith(snap(), to);
      if (!now || !to) return;
      set({ past: past.slice(0, -1), future: [...future, now] });
      restore(to);
    },
    redo() {
      const { past, future } = get();
      const to = future[future.length - 1];
      const now = to && alongWith(snap(), to);
      if (!now || !to) return;
      set({ past: [...past, now], future: future.slice(0, -1) });
      restore(to);
    },
    copy() {
      const taken = partsOf(chosen());
      if (taken.length === 0) return;
      clipboard = taken;
      pasted = 0;
    },
    paste() {
      const p = get().project;
      if (!p || clipboard.length === 0) return;
      remember();
      pasted += 1;
      const made = copies([{ x: pasted * PASTE_SHIFT, y: -pasted * PASTE_SHIFT }], clipboard);
      const one = made.every((i) => i.group === made[0]!.group);
      update([...p.items, ...made], one ? made[0]!.group : get().selected);
    },
    rotate(degrees) {
      const c = middle();
      if (c) transform(rotation(degrees, c));
    },
    mirror(axis) {
      const c = middle();
      if (c) transform(mirror(axis, axis === 'x' ? c.x : c.y));
    },
    duplicate() {
      const p = get().project;
      const b = itemsBounds(chosen());
      if (!p || !b) return;
      remember();
      const made = copies([{ x: b.maxX - b.minX + COPY_GAP, y: 0 }]);
      const { selected } = get();
      update([...p.items, ...made], selected === 'all' ? 'all' : made[0]!.group);
    },
    array(columns, rows, gap) {
      const p = get().project;
      const b = itemsBounds(chosen());
      if (!p || !b) return;
      const offsets = gridOffsets(columns, rows, b.maxX - b.minX + gap, b.maxY - b.minY + gap);
      remember();
      update([...p.items, ...copies(offsets.slice(0, MAX_COPIES))]);
    },
    removeSelection() {
      const p = get().project;
      if (!p) return;
      const { selected } = get();
      const left = p.items.filter((i) => !isSelected(i, selected));
      if (left.length === p.items.length) return;
      remember();
      update(left, null);
    },
    setTwoSided(patch) {
      const p = get().project;
      if (!p) return;
      if (patch === null) {
        const { twoSided } = p;
        if (!twoSided) return;
        remember();
        // From the front only again: everything is cut there, texts read as they were written.
        const items = p.items.map((i) =>
          i.side === 'back'
            ? { ...(i.text === undefined ? i : mirrored(i, twoSided.axis)), side: 'front' as Side }
            : i,
        );
        set({ project: { ...p, twoSided: null } });
        update(items);
        return;
      }
      remember(snap(), `two:${Object.keys(patch).join()}`);
      const twoSided = {
        axis: 'x' as FlipAxis,
        pins: false,
        autoHoles: true,
        ...p.twoSided,
        ...patch,
      };
      set({ project: { ...p, twoSided } });
      update(p.items);
    },
    proposeHoles() {
      const p = get().project;
      if (!p?.twoSided) return;
      remember();
      set({ project: { ...p, twoSided: { ...p.twoSided, autoHoles: true } } });
      update(p.items);
    },
    setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    suggest() {
      const { tools, materials, setup, settings: ws } = useWorkshop.getState();
      const { settings } = get();
      const tool = tools.find((t) => t.id === settings.toolId);
      const material = materials.find((m) => m.id === setup.materialId);
      if (!tool) return;
      // The material's suggestion with the tool's own values over it – or, without a material,
      // just what the tool says (what it leaves empty stays as it is).
      const s = material
        ? suggestFor(tool, material, ws.spindle)
        : { ...toolOwnValues(tool, ws.spindle) };
      const patch: Partial<CamSettings> = {};
      if (s.rpm !== undefined) patch.rpm = Math.round(s.rpm);
      if (s.feed !== undefined) patch.feed = Math.round(s.feed);
      if (s.plunge !== undefined) patch.plungeFeed = Math.round(s.plunge);
      // What the tool says itself is taken as it is (the CAM takes 0.01 mm); the material's is rounded
      const own = toolOwnValues(tool, ws.spindle);
      if (s.depthPerPass !== undefined) {
        patch.stepdown =
          own.depthPerPass !== undefined
            ? own.depthPerPass
            : Math.max(0.01, Number(s.depthPerPass.toFixed(1)));
      }
      if (s.stepover !== undefined) {
        const share = s.stepover / tool.diameter;
        patch.stepover = Math.min(
          1,
          Math.max(0.01, Number(share.toFixed(own.stepover !== undefined ? 3 : 2))),
        );
      }
      if (Object.keys(patch).length > 0) get().setSettings(patch);
    },
    remake(opts) {
      const p = get().project;
      return p ? update(p.items, get().selected, opts?.take === true) : false;
    },
    generate(opts) {
      const take = opts?.take === true;
      const { project, settings } = get();
      const parts = project ? partsOf(project.items) : [];
      if (!project || parts.length === 0) {
        set({ problems: [], flipNotes: [] });
        offStage(take);
        return false;
      }
      const tool = toolDiameter(settings);
      const cut: CutSettings = { ...settings, toolDiameter: tool };
      const depthOf = (item: CamItem) =>
        item.depth ?? (item.kind === 'on' ? settings.engraveDepth : settings.depth);
      /** The toolpath of one side (null: of everything), its contours laid as they are cut. */
      const side = (which: Side | null, lay = (contours: Contour[]) => contours) => {
        const contours: Contour[] = [];
        const operations: Operation[] = [];
        const rows: number[] = [];
        project.items.forEach((item, row) => {
          if (item.registration !== undefined || (which && item.side !== which)) return;
          for (const c of lay(item.contours)) {
            operations.push({ contour: contours.length, ...itemOperation(item, settings) });
            contours.push(c);
            rows.push(row);
          }
        });
        const path = toolpaths(contours, operations, cut);
        return {
          moves: path.moves,
          problems: path.problems.map((q) => ({ row: rows[q.contour]!, code: q.code })),
        };
      };

      const two = project.twoSided;
      const holes = project.items.filter((i) => i.registration !== undefined);
      const notes: CamFlipNote[] = [];
      let front = side(two ? 'front' : null);
      let back: ReturnType<typeof side> | null = null;
      let plan: Omit<FlipPlan, 'front' | 'back'> | null = null;
      let drilled: Move[] = [];
      if (two && holes.length === 2) {
        const thickness = flipThickness(two);
        const method = flipMethod(two);
        const pair = { a: holeCentre(holes[0]!), b: holeCentre(holes[1]!) };
        const flip = flipFor(two.axis, pair);
        const d = registrationDiameter(tool);
        const cuts: SidedCut[] = parts.map((item) => ({
          row: project.items.indexOf(item),
          side: item.side,
          kind: item.kind,
          contours: item.contours,
          depth: depthOf(item),
          tabs: through(item.kind) && item.tabs,
        }));
        const backUsed = parts.some((i) => i.side === 'back' && i.kind !== 'none');
        if (!backUsed) notes.push({ code: 'no-back' });
        else {
          if (thickness === undefined) notes.push({ code: 'no-thickness' });
          if (method === 'pins' && registrationLayout(two.axis, pair) === 'askew') {
            notes.push({ code: 'askew' });
          }
          ([1, 2] as const).forEach((n) => {
            const at = n === 1 ? pair.a : pair.b;
            const trouble = checkRegistrationHole(at, d, cuts, tool, enteredStock()?.box);
            if (trouble) notes.push({ code: `hole-${trouble}`, hole: n });
          });
          if (thickness !== undefined) notes.push(...checkSides(cuts, thickness, tool));
          back = side('back', (contours) => flipContours(contours, flip));
        }
        if (back && back.moves.length > 0 && thickness !== undefined) {
          const depth = registrationDepth(thickness, method);
          drilled = toolpaths(
            holes.map((h) => h.contours[0]!),
            holes.map((_, k) => ({ contour: k, kind: 'drill', depth })),
            cut,
          ).moves;
          plan = { name: project.name, flip, holes: pair, holeDiameter: d, method, thickness };
        } else {
          // Not (yet) a job for two sides: everything that can be cut from the front.
          front = side('front');
          back = null;
        }
      }

      // A text is many strokes but one row: each trouble once.
      const seen = new Set<string>();
      set({
        problems: [...front.problems, ...(back?.problems ?? [])].filter(
          (p) => !seen.has(`${p.row}|${p.code}`) && seen.add(`${p.row}|${p.code}`),
        ),
        flipNotes: notes,
      });
      const moves = [...drilled, ...front.moves];
      if (moves.length === 0) {
        offStage(take);
        return false;
      }
      const program = (m: readonly Move[], name: string) =>
        toGcode(m, { name, rpm: settings.rpm, safeZ: settings.safeZ });
      const names = jobNames(project.name);
      const sides = plan && back ? { plan, back } : null;
      const frontCode = program(moves, sides ? `${project.name} Vorderseite` : project.name);
      const backCode = sides ? program(sides.back.moves, `${project.name} Rueckseite`) : null;
      if (!mayLoad(take, { front: frontCode, back: backCode })) return false;
      if (sides) {
        useJob.getState().load(names.front, frontCode);
        useFlip.getState().setPlan({
          ...sides.plan,
          front: { fileName: names.front, text: frontCode },
          back: { fileName: names.back, text: backCode! },
        });
      } else {
        useJob.getState().load(names.single, frontCode);
        useFlip.getState().setPlan(null);
      }
      set({ table: sides ? names.front : names.single });
      // The tool circle on the stage is the drawing's cutter.
      useJob.getState().setToolDiameter(tool);
      set({ ahead: false });
      return true;
    },
  };
});

// A job that ends – seen while connected, not lost with the link: where nothing lies on the table (a
// file run from the SD card list) a drawing that is ahead goes there by itself. Where the job's own
// program still lies there it stays – the operator may still want the summary or the same piece
// again – until the tap on "Zeichnung auf den Tisch legen".
let wasUnderWay = false;
function afterJob(): void {
  const now = jobUnderWay();
  if (wasUnderWay && !now) {
    const { ahead, project, remake } = useCam.getState();
    const machine = useMachine.getState();
    const seen = machine.connection === 'connected' && machine.lostInJob === null;
    if (seen && ahead && project && useJob.getState().fileName === null) remake();
  }
  wasUnderWay = now;
}
useMachine.subscribe(afterJob);
useRun.subscribe(afterJob);
useJob.subscribe(afterJob);
