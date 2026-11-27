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
  mirror,
  onStock,
  operationTabSites,
  proposeRegistration,
  readDxf,
  readSvg,
  registrationDepth,
  registrationDiameter,
  registrationLayout,
  rotation,
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
  wrapUnit,
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
  type AnySketch,
  type SvgNote,
  type Tabs,
  type TextOptions,
} from '@lowrider/cam';
import { splitLines } from '@lowrider/gcode-core';
import { suggestFor, toolOwnValues } from '@lowrider/workshop';
import { create } from 'zustand';
import {
  alignDeltas,
  distributeDeltas,
  MOVES,
  movesAnything,
  unitsOf,
  type Axis,
  type Edge,
  type Shifts,
  type Spread,
} from '../lib/camArrange';
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
import { gapsAround, type Gap } from '../lib/camGaps';
import { snapMove, snapTargets, type SnapGuide } from '../lib/camSnap';
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
  type TabSpec,
} from '../lib/camItems';
import {
  clampTab,
  carryTabs,
  itemHasTabs,
  itemTabs,
  pruneTabs,
  samePlace,
  TAB_LIMITS,
  tabsOn,
  tidySpec,
  tabValues,
  type TabValue,
} from '../lib/camTabs';
import {
  addGroups,
  everything,
  groupsInRect,
  groupsOf,
  invertGroups,
  normalise,
  pruneSelection,
  toggleGroup,
} from '../lib/camSelect';
import { cutPlaces, movedSeqs, rankOf, type CutPlace } from '../lib/camOrder';
import { defaultNestGap, planNest } from '../lib/camNest';
import { holdFactor, magnified, scaledShape } from '../lib/camScale';
import { clampPath, takesEntry, takesPeck, type Entry, type PathValue } from '../lib/camPath';
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
  /**
   * "Fahrwege kürzen": the order of the cuts of one kind is made shorter (`toolpaths` option `route: 'short'`).
   * Only the order, so where each cut begins – never other cuts. On for a new drawing; a project file that
   * does not say is read as off, so no stored drawing changes its program.
   */
  routeShort: boolean;
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

/** The points of a measurement: none yet, A alone, or both */
export interface Measured {
  a: Point | null;
  b: Point | null;
}
const NOTHING_MEASURED: Measured = { a: null, b: null };

/** What helps a finger that drags a part: how near a line must come to snap (mm; 0 = off) and whether the gaps show */
export interface DragAssist {
  snap?: number;
  gaps?: boolean;
}

/** What the table shows while a part is dragged: the lines it snapped to and the room to its neighbours */
export interface DragHints {
  guides: SnapGuide[];
  gaps: Gap[];
}

/** What "Verschachteln" is asked for: both left out take the defaults (the cutter and 2 mm between parts, no turning) */
export interface NestRequest {
  /** The least room between two parts, mm */
  gap?: number;
  /** Parts may be turned by 90° */
  rotate?: boolean;
}

/** What the last "Verschachteln" did, for the card that asked – until anything else changes the drawing. */
export interface NestReport {
  /**
   * The `project.items` this report is about: undo, redo and every other change of the drawing make a new
   * list, and a report of an older one is not shown any more.
   */
  items: readonly CamItem[];
  /** What was selected when it was made: another selection is another question, and the report is not shown for it */
  selected: Selection;
  /** The groups that found a place, and the ones that found none (they stay where they were) */
  placed: number[];
  unplaced: number[];
  /** How many groups lie inside the box of a packed one and went with it */
  riders: number;
  /** The groups that stay and whose box a packed part now overlaps (they are cut through each other until one is moved) */
  overlapped: number[];
  /** How many groups of those moved – a part that already stood where it was put does not */
  moved: number;
  /** The share of the stock's area the boxes take, 0…1 */
  used: number;
  /** The room that was kept between two parts, mm */
  gap: number;
  rotate: boolean;
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
  /**
   * Where each part (by its id) comes among the parts cut the same way, in the program that was made last:
   * the order the library really cut in, so the route decides for the parts without a number of their own.
   * A part that is not cut (hidden, a cutter too large for it, "nicht fräsen") has none.
   */
  cutOrder: Readonly<Record<number, CutPlace>>;
  /** For a part machined from both sides: what to know before it is handed over */
  flipNotes: CamFlipNote[];
  /** What the arranging acts on */
  selected: Selection;
  /**
   * "Mehrfachauswahl" is on: a tap on a part takes its group into the selection or lets go of it, and a
   * tap beside everything keeps the selection. A mode of the screen, not a step of the drawing.
   */
  multi: boolean;
  setMulti(on: boolean): void;
  /**
   * "Rahmen aufziehen" is on: a finger or the mouse drawn across the table draws a rectangle that takes the
   * parts it touches on release. A mode of the screen like `multi` – not a step of the drawing – and it is
   * off when the drawing is closed. It adds to the selection like `multi` does (or Shift/Ctrl held).
   */
  marquee: boolean;
  setMarquee(on: boolean): void;
  /**
   * "Messen" is on: a tap on the table sets the point A, the next one the point B (a third starts again), and
   * the distance between them is read off – a mode of the screen like `multi` and `marquee`, never a step of the
   * drawing: nothing is selected, changed or remembered by it. It clashes with the three modes that give a tap
   * or a drag another meaning, so it ends them when it starts and any of them ends it; it is off when the
   * drawing is closed.
   */
  measure: boolean;
  /** The two points of the measurement, work mm – places on the table, not fastened to any part */
  measured: Measured;
  setMeasure(on: boolean): void;
  /** The next tap: the first sets A, the second B, a third starts again with A */
  measurePoint(p: Point): void;
  /** A finger moves one of the two points */
  moveMeasure(which: 'a' | 'b', p: Point): void;
  /** Takes the points away ("Messung löschen"); the mode stays on */
  clearMeasure(): void;
  /** Puts the points back as they were (a tap that turns out to be the first of a double tap) */
  restoreMeasure(before: Measured): void;
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
  openProject(text: string):
    | {
        toolMissing: boolean;
        toolDiffers?: { file: number; now: number };
        /** Settings of the file that no machine would have – left out, what is set now stays */
        dropped?: string[];
      }
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
  addSketch(sketch: AnySketch, view?: Bounds | null, at?: Point): string[];
  /**
   * Other measures (or words) for a drawn thing: its contours are made anew
   * where it lies. Changes of the same `field` in a row are one step to undo.
   * Returns the characters a text's font does not have.
   */
  setSketch(id: number, sketch: AnySketch, field?: string): string[];
  removeItem(id: number): void;
  /** Empties the drawing */
  clear(): void;
  setItem(id: number, patch: ItemPatch): void;
  /**
   * The eye of a part: hidden, it is not cut (the program does not mention it), drawn faint and dashed,
   * out of a finger's reach and out of "everything" – and the drawing is made anew. Each switch is its
   * own step of undo. A registration hole cannot be hidden; nothing happens where it is so already.
   */
  setHidden(id: number, hidden: boolean): void;
  /** Every hidden part shown again, as one step */
  showAll(): void;
  /**
   * Own values for the holding tabs of a thing – a number, or undefined to take the drawing's default
   * again; a number is brought into its range (the count into whole numbers). Changes of one value
   * in a row are one step to undo.
   */
  setTabs(
    id: number,
    patch: Partial<Record<TabValue, number | undefined>> & { avoidCorners?: boolean },
  ): void;
  /** The tabs automatic again: the thing's count spread evenly; the places put by hand are forgotten */
  spreadTabs(id: number): void;
  /**
   * The tabs by hand from now on, starting with the places the automatic spread makes right now –
   * so one starts from the even distribution and moves them. False where that cannot be (more
   * places than a thing may have, tabs off).
   */
  manualTabs(id: number): boolean;
  /** A tab at a place (fraction `u` of its contour `c`) of a thing whose tabs are by hand; false: not possible */
  addTab(id: number, c: number, u: number): boolean;
  /** Puts the tab `index` of the thing's places at another place of its contour; one step per tab in a row */
  moveTab(id: number, index: number, u: number): void;
  /**
   * A finger takes the tab `index`: `move` shows it at a place of its contour (the toolpath waits),
   * `end` makes the job anew – one step to undo for the whole drag. Null where there is no such tab.
   */
  dragTab(id: number, index: number): { move(u: number): void; end(): void } | null;
  removeTab(id: number, index: number): void;
  /**
   * The thing whose tabs a finger is putting on the table ("Stege setzen"), or null. It ends by itself
   * when the thing is no longer selected, no longer has its tabs by hand, or is gone.
   */
  placing: number | null;
  /** Starts ("Stege setzen") or ends putting tabs; starting it opens the thing's panel of tabs */
  setPlacing(id: number | null): void;
  /**
   * The thing whose panel of tabs is open in the list, or null. The panel opens only on demand
   * (`openTabs`: "Stege einstellen", the box of the tabs ticked on, putting tabs by hand) and
   * ends by itself like `placing`: when the thing is no longer the one selected, has no tabs any
   * more, or is gone. Opening it never changes the height of any other row.
   */
  tabsOpen: number | null;
  /**
   * How a pocket is entered ('ramp': as ever; 'helix', 'plunge') and how a hole is drilled (a peck step,
   * and for chip breaking how far the cutter comes up between the steps), per part: a number is brought
   * into its range, undefined takes the default (no value) again. The values of the other kind of cut are
   * not kept – a peck means nothing on a pocket – and a value that means nothing without another goes with
   * it (the hole of a helix without the helix, the retract without a peck). Changes of one number in a row
   * are one step to undo.
   */
  setPath(
    id: number,
    patch: { entry?: Entry } & Partial<Record<PathValue, number | undefined>>,
  ): void;
  /**
   * Moves a part one place earlier (−1) or later (1) among the parts cut the same way: every part of that
   * kind gets the number of its place in the order it is cut in now, so what is seen is what is asked for. One
   * step to undo. False where it cannot move (the first cannot go earlier) or is not cut.
   */
  moveInOrder(id: number, by: -1 | 1): boolean;
  /** Takes the number away from one part (it follows the numbered ones, by route) or from every part */
  clearOrder(id?: number): void;
  /** Selects the thing's group alone and opens its panel of tabs, in one step; nothing for a thing without tabs */
  openTabs(id: number): void;
  /** Closes the panel of tabs – and ends putting tabs by hand with it */
  closeTabs(): void;
  select(selected: Selection): void;
  /**
   * Everything selected (the registration holes of a two-sided part with it) – except the parts that are
   * hidden, which it leaves out (`everything`).
   */
  selectAll(): void;
  /**
   * What a rectangle on the table (work mm) takes: the groups of the visible parts whose box it touches
   * – replacing the selection, or (`add`) added to it. A rectangle that touches nothing lets go of the
   * selection; an added one changes nothing. Not a step of undo: only the selection changes.
   */
  selectRect(rect: Bounds, add: boolean): void;
  /** Every group of the parts that is not selected, and none of those that are */
  invertSelection(): void;
  /**
   * A group taken into the selection, or let go of if it is in it (a registration hole is selected
   * alone: it is never one of several).
   */
  toggleSelect(group: number): void;
  /**
   * A finger on the drawing at a work point: selects what lies there – for a
   * tap also the shape it is inside of, for taking hold (`inside` false) only
   * what has a line under the finger. What is selected already stays selected
   * (everything, or the several that are picked: a finger on one takes them all);
   * with "Mehrfachauswahl" on, a tap on a part takes it in or lets go of it.
   * Returns whether there was something. `additive` is Shift or Ctrl held on a computer: the tap
   * behaves as with "Mehrfachauswahl" on, without touching the switch.
   */
  pick(
    point: { x: number; y: number },
    tolerance: number,
    inside?: boolean,
    additive?: boolean,
  ): boolean;
  /**
   * The selection follows a finger: `move` shifts it by a distance from where
   * it lay – its lower left corner landing on a grid of `step` mm, if given, or its box snapping to the lines
   * of the other parts and of the stock where `assist.snap` says how near that must be (mm; 0 or left out: no
   * object snap, the grid alone, exactly as before) – and `end` makes the job anew. `move` answers what the
   * table shows meanwhile (the guides of what snapped, the gaps to the neighbours if `assist.gaps`) – only
   * where `assist` is given. A registration hole that is dragged alone is never snapped, and a hidden part of
   * the selection is no line and no edge: snapping, guides and gaps go by the box of what is in sight (the grid
   * by the box of all of it, as the position fields show). Null when nothing is selected.
   */
  drag(): {
    move(dx: number, dy: number, step?: number, assist?: DragAssist): DragHints | undefined;
    end(): void;
  } | null;
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
  /**
   * Moves the units of the selection – each group by its own shift, rigid – as one step of undo, and
   * the selection stays. Nothing happens, and nothing is remembered, when no shift moves anything.
   * The registration holes are never moved by it: they follow the drawing, where they are meant to.
   */
  arrangeBy(shifts: Shifts): void;
  /** The units of the selection on one edge or middle line of the selection's whole box */
  align(edge: Edge): void;
  /** The units of the selection spread evenly along an axis, the two outermost ones staying */
  distribute(axis: Axis, mode: Spread): void;
  /**
   * The selected groups packed onto the entered stock by their boxes (`lib/camNest.ts`: what lies inside a
   * packed group's box goes with it; the registration holes, hidden groups and everything not selected stay).
   * One step of undo and one `update`, so a job under way and the program on the table are as for any other
   * change; nothing is remembered where nothing moves. A part without a place stays where it was and is in the
   * report. Null – and nothing done – without an entered stock or with nothing in sight selected.
   */
  nest(options?: NestRequest): NestReport | null;
  /** The report of the last `nest`, while the drawing is as it left it (compare `NestReport.items`) */
  nested: NestReport | null;
  /** The parts of two or more selected groups become one group, selected */
  group(): void;
  /** Every part of the selected groups becomes a group of its own, all of them selected */
  ungroup(): void;
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
    // A new drawing keeps its tabs off the corners and its rapid travel short; a stored project says its own
    // (the file's missing keys are read as off – `openProject`)
    tabs: { ...TABS, avoidCorners: true },
    routeShort: true,
  };
}

/** What a drawing is cut with when its cutter is not in the tool list (any more), mm */
const DEFAULT_TOOL = 6;
const toolDiameter = (settings: CamSettings) =>
  useWorkshop.getState().tools.find((t) => t.id === settings.toolId)?.diameter ?? DEFAULT_TOOL;

/** The cutter of the program made last: its id and diameter, mm (see `afterToolEdit`) */
let cutWith: { id: string; diameter: number } | null = null;

/** Steps the drawing can go back */
const HISTORY = 100;
/** A pasted copy lies this far from what it was copied from, mm */
const PASTE_SHIFT = 10;

let nextId = 1;
/** What Ctrl+C took, and how often it was pasted since */
let clipboard: CamItem[] = [];
let pasted = 0;

/** What a sketch makes: its contours, and for a text how it was set. */
function fromSketch(sketch: AnySketch) {
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
const ownBox = (sketch: AnySketch, source: readonly Contour[]) =>
  sketchBox(sketch) ?? contoursBox(source);

/** Where a new sketch keeps still when a measure is typed: a corner, or its own origin. */
const typedAnchor = (sketch: AnySketch): readonly [number, number] | null =>
  sketch.type === 'rect' || sketch.type === 'grid' ? [0, 0] : null;
const EMPTY: CamProject = { name: 'zeichnung', items: [], twoSided: null, skipped: {}, notes: [] };

const through = (kind: OperationKind) => kind === 'outside' || kind === 'inside';

/**
 * How an item of the drawing is cut: its operation without the contour it belongs to – `contour`
 * names which of the item's contours it is for (its tabs may stand at places of their own).
 */
export function itemOperation(
  item: CamItem,
  settings: CamSettings,
  contour = 0,
): Omit<Operation, 'contour'> {
  return {
    kind: item.kind,
    depth: item.depth ?? (item.kind === 'on' ? settings.engraveDepth : undefined),
    tabs: itemTabs(item, contour, settings.tabs),
    relief: (through(item.kind) || item.kind === 'pocket') && item.relief ? item.relief : undefined,
    // its own direction, where it has one to choose (a stale one from another kind does not count);
    // else the job's (the library falls back)
    climb: through(item.kind) || item.kind === 'pocket' ? item.climb : undefined,
    // how a pocket is entered and a hole drilled: only where the kind takes it (a peck on anything else is
    // a problem the library would say)
    entry: takesEntry(item.kind) ? item.entry : undefined,
    helixDiameter: takesEntry(item.kind) && item.entry === 'helix' ? item.helixDiameter : undefined,
    peck: takesPeck(item.kind) ? item.peck : undefined,
    peckRetract: takesPeck(item.kind) && item.peck !== undefined ? item.peckRetract : undefined,
    seq: item.seq,
  };
}

/** The cutter of the drawing: its diameter, mm. */
export const camToolDiameter = (settings: CamSettings) => toolDiameter(settings);

/**
 * The cutter of the drawing as a hook: what is drawn depends on it (the places of tabs kept off the corners
 * are the cutter's), so a picture must follow a change of the cutter, or of its diameter in the tool list.
 */
export function useCamToolDiameter(): number {
  const toolId = useCam((s) => s.settings.toolId);
  return useWorkshop((s) => s.tools.find((t) => t.id === toolId)?.diameter ?? DEFAULT_TOOL);
}

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

/** The items that are not hidden. */
const inSight = (items: readonly CamItem[]) => items.filter((i) => i.hidden !== true);

/** The item hidden or shown: the key is only ever there as `true`. */
function withHidden(item: CamItem, hidden: boolean): CamItem {
  const { hidden: _was, ...rest } = item;
  return hidden ? { ...rest, hidden: true } : rest;
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
    // The holes follow what is cut: a hidden part proposes none. With every part hidden they stay beside
    // the parts as they were (an empty box would take hand-placed holes away, and showing a part again
    // would not bring them back)
    const seen = parts.filter((i) => i.hidden !== true);
    const box = itemsBounds(seen.length > 0 ? seen : parts);
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
    // Places by hand on a contour the thing no longer has (a grid made smaller) go with it
    const held = withHoles(items.map(pruneTabs), p.twoSided);
    set({
      project: {
        ...p,
        items: held.items,
        twoSided: p.twoSided && { ...p.twoSided, autoHoles: held.auto },
      },
      // A group the drawing no longer has is no longer selected
      selected: pruneSelection(selected, held.items),
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
    // One hole taken on its own (never both, as with everything selected: they move together)
    const holes = items.filter((i) => i.registration !== undefined && isSelected(i, selected));
    const hole = holes.length === 1 ? holes[0] : undefined;
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
      // (a star, a gear and a spiral keep their proportions where a measure reaches the end of its range)
      const sketch = scaledShape(one.sketch, r.kx, r.ky);
      return [reshaped(one, sketch, [r.fx, r.fy])];
    }
    // The curved shapes cannot follow beyond the end of their range without changing their proportions: the
    // factor is held once for everything that is scaled, so nothing in it grows (or shrinks) out of step
    const k = holdFactor(
      starts.map((i) => i.sketch),
      r.kx,
    );
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
      const sketch = magnified(i.sketch, k);
      const placement = compose(compose(grow, i.placement), scaling(1 / k));
      const { missing: _missing, ...made } = fromSketch(sketch);
      // The places of tabs by hand follow the measures (a uniform scale keeps them where they are)
      return carryTabs(i, {
        ...i,
        ...made,
        sketch,
        placement,
        contours: place(made.source, placement),
      });
    });
  };
  /**
   * A drawn thing with other measures. `keep` names the point of its box
   * that stays where it is (shares of the width and height); without it the
   * thing's own origin stays – the middle of a shape, the anchor of a text.
   */
  const reshaped = (
    item: CamItem,
    sketch: AnySketch,
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
    // The places of tabs by hand are fractions of a contour whose length has changed: they follow it
    return carryTabs(item, {
      ...item,
      ...rest,
      sketch,
      placement,
      contours: place(made.source, placement),
    });
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
      for (const { seq: _place, ...i } of partsOf(from)) {
        if (!groups.has(i.group)) groups.set(i.group, nextId++);
        const placement = compose(translation(o.x, o.y), i.placement);
        // (a copy has no place of its own among the parts cut the same way: the one the original was given was its
        // wish, and a copy that shared it would be cut ahead of every part without a number – it follows the route)
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
    // (a hidden part is not cut: a circle inside its outline is no hole of anything)
    const before = p.items.filter((i) => i.hidden !== true).flatMap((i) => i.contours);
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

  /**
   * Changes how one thing's tabs are made, as one step to undo (steps of one `field` in a row are
   * one). `change` gives the new spec – `undefined` for none –, or null where there is nothing to do.
   */
  const respec = (
    id: number,
    field: string | null,
    change: (item: CamItem) => TabSpec | undefined | null,
  ): boolean => {
    const p = get().project;
    const item = p?.items.find((i) => i.id === id);
    if (!p || !item) return false;
    const next = change(item);
    if (next === null) return false;
    remember(snap(), field);
    const tidy = next && tidySpec(next);
    update(
      p.items.map((i) => {
        if (i.id !== id) return i;
        const { tabSpec: _was, ...rest } = i;
        return tidy ? { ...rest, tabSpec: tidy } : rest;
      }),
    );
    return true;
  };
  /** The places of a thing whose tabs are by hand; null for any other. */
  const placesOf = (item: CamItem | undefined) =>
    item && tabsOn(item) && item.tabSpec?.mode === 'manual' ? (item.tabSpec.at ?? []) : null;

  return {
    project: null,
    past: [],
    future: [],
    placing: null,
    tabsOpen: null,
    settings: initialSettings(),
    problems: [],
    cutOrder: {},
    flipNotes: [],
    selected: null,
    multi: false,
    marquee: false,
    measure: false,
    measured: NOTHING_MEASURED,
    ahead: false,
    table: null,
    nested: null,
    open() {
      if (!get().project) set({ project: EMPTY, selected: null, ahead: false, table: null });
    },
    close: () =>
      set({
        project: null,
        problems: [],
        cutOrder: {},
        flipNotes: [],
        selected: null,
        multi: false,
        marquee: false,
        measure: false,
        measured: NOTHING_MEASURED,
        tabsOpen: null,
        nested: null,
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
        set((s) => {
          const merged = { ...s.settings, ...(toolMissing ? rest : parsed.settings) };
          // What the file does not say is off, not what is set now: a stored drawing is cut as it was made
          // (`routeShort` is always in what is read; "Ecken meiden" is the file's own, or off)
          const { avoidCorners: _now, ...tabs } = merged.tabs;
          return {
            project: { ...parsed.project, items },
            settings: {
              ...merged,
              tabs:
                parsed.settings.tabs?.avoidCorners === true
                  ? { ...tabs, avoidCorners: true }
                  : tabs,
            },
            selected: null,
            problems: [],
            cutOrder: {},
            flipNotes: [],
          };
        });
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
          cutOrder: kept.cutOrder,
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
      return {
        toolMissing,
        ...(toolDiffers ? { toolDiffers } : {}),
        ...(parsed.dropped.length > 0 ? { dropped: parsed.dropped } : {}),
      };
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
      // What it goes on is what is in sight: a hidden part is not the drawing
      const parts = partsOf(get().project!.items).filter((i) => i.hidden !== true);
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
        cutOrder: {},
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
          // The place among the parts cut the same way meant something in the old kind – and on the old side – only
          if (
            (patch.kind !== undefined && patch.kind !== i.kind) ||
            (patch.side !== undefined && patch.side !== i.side)
          ) {
            delete next.seq;
          }
          if (patch.kind !== undefined && patch.kind !== i.kind) {
            // … and a way to enter a pocket or to drill a hole means nothing on any other cut
            if (!takesEntry(next.kind)) {
              delete next.entry;
              delete next.helixDiameter;
            }
            if (!takesPeck(next.kind)) {
              delete next.peck;
              delete next.peckRetract;
            }
          }
          // A text put on the other side is flipped in place: it reads right there.
          const turned = patch.side !== undefined && patch.side !== i.side && i.text !== undefined;
          return turned && two ? mirrored(next, two.axis) : next;
        }),
      );
    },
    setHidden(id, hidden) {
      const p = get().project;
      const item = p?.items.find((i) => i.id === id);
      if (!p || !item || item.registration !== undefined || (item.hidden === true) === hidden)
        return;
      // Its own step each time: hiding, showing and hiding again are three steps (no `field` merges them)
      remember();
      update(p.items.map((i) => (i.id === id ? withHidden(i, hidden) : i)));
    },
    showAll() {
      const p = get().project;
      if (!p?.items.some((i) => i.hidden === true)) return;
      remember();
      update(p.items.map((i) => withHidden(i, false)));
    },
    setTabs(id, patch) {
      const keys = (['count', 'width', 'height'] as const).filter((k) => k in patch);
      const corners = 'avoidCorners' in patch;
      if (keys.length === 0 && !corners) return;
      // A number being typed is one step with the next of the same kind; a switch is a step of its own
      respec(id, keys.length > 0 ? `tabs:${id}:${keys.join()}` : null, (item) => {
        const spec: TabSpec = { ...(item.tabSpec ?? { mode: 'auto' }) };
        for (const key of keys) {
          const v = patch[key];
          // Not a number (an emptied field): the drawing's default again
          if (v === undefined || !Number.isFinite(v)) delete spec[key];
          else spec[key] = clampTab(key, v);
        }
        if (corners) {
          // What the drawing's default says is no choice of the part's: it follows the default
          if (typeof patch.avoidCorners !== 'boolean') delete spec.avoidCorners;
          else if (patch.avoidCorners === (get().settings.tabs.avoidCorners === true)) {
            delete spec.avoidCorners;
          } else spec.avoidCorners = patch.avoidCorners;
          // The same as it was (a switch put where it already stands): nothing to change, no step to undo
          if (
            keys.length === 0 &&
            JSON.stringify(tidySpec(spec)) === JSON.stringify(item.tabSpec)
          ) {
            return null;
          }
        }
        return spec;
      });
    },
    spreadTabs(id) {
      respec(id, null, (item) => {
        if (item.tabSpec?.mode !== 'manual') return null;
        const { at: _put, ...rest } = item.tabSpec;
        return { ...rest, mode: 'auto' };
      });
    },
    manualTabs(id) {
      const { project, settings } = get();
      const item = project?.items.find((i) => i.id === id);
      if (!item || !tabsOn(item)) return false;
      if (item.tabSpec?.mode === 'manual') return true;
      // What the automatic spread makes now, contour by contour, is where one starts
      // – the very places the cut lifts at (`operationTabSites` with the operation it is cut with)
      const tool = toolDiameter(settings);
      const at = item.contours.flatMap((contour, c) => {
        const tabs = itemTabs(item, c, settings.tabs);
        return tabs
          ? operationTabSites(contour, { kind: item.kind, tabs }, { toolDiameter: tool }).map(
              (site) => ({ c, u: site.u }),
            )
          : [];
      });
      if (at.length > TAB_LIMITS.places) return false;
      return respec(id, null, (it) => ({ ...(it.tabSpec ?? {}), mode: 'manual', at }));
    },
    addTab(id, c, u) {
      return respec(id, null, (item) => {
        const at = placesOf(item);
        const contour = item.contours[c];
        if (!at || !contour?.closed || !Number.isFinite(u) || at.length >= TAB_LIMITS.places) {
          return null;
        }
        const here = wrapUnit(u);
        // Not onto a tab that stands there
        if (at.some((p) => p.c === c && samePlace(p.u, here))) return null;
        return { ...item.tabSpec!, at: [...at, { c, u: here }] };
      });
    },
    moveTab(id, index, u) {
      respec(id, `tab:${id}:${index}`, (item) => {
        const at = placesOf(item);
        const was = at?.[index];
        if (!at || !was || !Number.isFinite(u) || samePlace(was.u, u)) return null;
        // Not onto another tab of the same contour (it would stand there twice, one of them unseen)
        if (at.some((p, i) => i !== index && p.c === was.c && samePlace(p.u, u))) return null;
        return {
          ...item.tabSpec!,
          at: at.map((p, i) => (i === index ? { c: p.c, u: wrapUnit(u) } : p)),
        };
      });
    },
    dragTab(id, index) {
      const item = get().project?.items.find((i) => i.id === id);
      const at = placesOf(item);
      const was = at?.[index];
      if (!item || !at || !was) return null;
      const before = snap();
      let to = was.u;
      let moved = false;
      return {
        move(u) {
          if (!Number.isFinite(u)) return;
          moved = true;
          to = wrapUnit(u);
          // Only the picture follows the finger; the toolpath is made when it lets go.
          show([
            {
              ...item,
              tabSpec: {
                ...item.tabSpec!,
                at: at.map((p, i) => (i === index ? { c: p.c, u: to } : p)),
              },
            },
          ]);
        },
        end() {
          const p = get().project;
          // Never moved (a tap, a second finger): nothing was shown, nothing to make or remember
          if (!p || !moved) return;
          // Let go where it was taken (or put back there), or onto another tab of the same contour
          // (it would stand there twice): it is put back, nothing changed, nothing to remember
          if (
            samePlace(was.u, to) ||
            at.some((q, i) => i !== index && q.c === was.c && samePlace(q.u, to))
          ) {
            show([item]);
            return;
          }
          remember(before);
          update(p.items);
        },
      };
    },
    removeTab(id, index) {
      respec(id, null, (item) => {
        const at = placesOf(item);
        if (!at || !at[index]) return null;
        return { ...item.tabSpec!, at: at.filter((_, i) => i !== index) };
      });
    },
    setPath(id, patch) {
      const p = get().project;
      const item = p?.items.find((i) => i.id === id);
      if (!p || !item) return;
      // Only what the kind of cut takes: an entry for a pocket, a peck for a hole
      const entry = 'entry' in patch && takesEntry(item.kind);
      const numbers = (['helixDiameter', 'peck', 'peckRetract'] as const).filter(
        (k) => k in patch && (k === 'helixDiameter' ? takesEntry(item.kind) : takesPeck(item.kind)),
      );
      if (!entry && numbers.length === 0) return;
      const next: CamItem = { ...item };
      if (entry) {
        if (patch.entry === 'helix' || patch.entry === 'plunge') next.entry = patch.entry;
        else delete next.entry;
      }
      for (const key of numbers) {
        const v = patch[key];
        // Not a number (an emptied field): the default again
        if (v === undefined || !Number.isFinite(v)) delete next[key];
        else next[key] = clampPath(key, v);
      }
      // What means nothing without another goes with it: the hole of a helix, the retract of a peck
      if (next.entry !== 'helix') delete next.helixDiameter;
      if (next.peck === undefined) delete next.peckRetract;
      if (JSON.stringify(next) === JSON.stringify(item)) return;
      // A number being typed is one step with the next of the same kind; a choice is a step of its own
      remember(snap(), entry ? null : `path:${id}:${numbers.join()}`);
      update(p.items.map((i) => (i.id === id ? next : i)));
    },
    moveInOrder(id, by) {
      const { project, cutOrder } = get();
      const item = project?.items.find((i) => i.id === id);
      if (!project || !item || item.registration !== undefined) return false;
      const seqs = movedSeqs(rankOf(item, project.items, cutOrder), id, by);
      if (!seqs) return false;
      // Nothing remembered where nothing changes: a wish the library overrides (a part inside a contour cannot come
      // after it) writes the same numbers on the second tap – no step of undo, no program made anew for them
      if (!project.items.some((i) => seqs.has(i.id) && i.seq !== seqs.get(i.id))) return false;
      remember();
      update(project.items.map((i) => (seqs.has(i.id) ? { ...i, seq: seqs.get(i.id)! } : i)));
      return true;
    },
    clearOrder(id) {
      const p = get().project;
      if (!p) return;
      const has = (i: CamItem) => i.seq !== undefined && (id === undefined || i.id === id);
      if (!p.items.some(has)) return;
      remember();
      update(
        p.items.map((i) => {
          if (!has(i)) return i;
          const { seq: _number, ...rest } = i;
          return rest;
        }),
      );
    },
    // Putting tabs by hand happens in the panel of the thing: it is open then; a tap puts a tab, so it ends measuring
    setPlacing: (placing) =>
      set(
        placing === null
          ? { placing }
          : { placing, tabsOpen: placing, measure: false, measured: NOTHING_MEASURED },
      ),
    openTabs(id) {
      const { project, placing } = get();
      const item = project?.items.find((i) => i.id === id);
      if (!item || !tabsOn(item)) return;
      lastField = null;
      // One step: the selection and the open panel must not be seen apart (the thing ends the panel as soon as it
      // is no longer the selected one). Putting tabs on another thing ends with the panel that held it.
      set({
        selected: item.group,
        tabsOpen: id,
        placing: placing === id ? placing : null,
      });
    },
    closeTabs: () => set({ tabsOpen: null, placing: null }),
    // A tap that takes a part in or out and a drag that draws a frame are other uses of the finger than measuring
    setMulti: (multi) =>
      set(multi ? { multi, measure: false, measured: NOTHING_MEASURED } : { multi }),
    setMarquee: (marquee) =>
      set(marquee ? { marquee, measure: false, measured: NOTHING_MEASURED } : { marquee }),
    // Measuring takes the finger for itself: the modes that give a tap or a drag another meaning end, and the
    // tabs that were being put by hand with them; ending it takes the points away (they are places on the table
    // that nothing keeps in step with the drawing)
    setMeasure: (measure) =>
      set(
        measure
          ? { measure, multi: false, marquee: false, placing: null, measured: NOTHING_MEASURED }
          : { measure, measured: NOTHING_MEASURED },
      ),
    measurePoint(p) {
      const { measure, measured } = get();
      if (!measure) return;
      set({
        measured: !measured.a
          ? { a: p, b: null }
          : !measured.b
            ? { a: measured.a, b: p }
            : { a: p, b: null },
      });
    },
    moveMeasure(which, p) {
      const { measure, measured } = get();
      if (measure && measured[which]) set({ measured: { ...measured, [which]: p } });
    },
    clearMeasure: () => set({ measured: NOTHING_MEASURED }),
    restoreMeasure: (measured) => set({ measured }),
    select(selected) {
      lastField = null;
      // A list of groups is one selection like any other: none is nothing, one is that group; everything
      // leaves out what is hidden
      const items = get().project?.items;
      set({
        selected: Array.isArray(selected)
          ? normalise(selected)
          : selected === 'all' && items
            ? everything(items)
            : selected,
      });
    },
    selectRect(rect, add) {
      const { project, selected } = get();
      if (!project) return;
      const found = groupsInRect(project.items, rect);
      lastField = null;
      set({ selected: add ? addGroups(selected, found, project.items) : normalise(found) });
    },
    selectAll() {
      get().select('all');
    },
    invertSelection() {
      const { project, selected } = get();
      if (!project) return;
      lastField = null;
      set({ selected: invertGroups(selected, project.items) });
    },
    toggleSelect(group) {
      const { project, selected } = get();
      if (!project) return;
      lastField = null;
      set({ selected: toggleGroup(selected, group, project.items) });
    },
    pick(point, tolerance, inside = true, additive = false) {
      const { project, selected } = get();
      // The switch and the keys are the one way: Shift or Ctrl on a tap does what the switch does
      const multi = get().multi || additive;
      const hit = project && itemAt(project.items, point, tolerance, inside);
      if (!hit) return false;
      if (multi) {
        lastField = null;
        set({ selected: toggleGroup(selected, hit.group, project.items) });
      } else if (!isSelected(hit, selected)) {
        set({ selected: hit.group });
      }
      // What is selected already stays: with everything or several selected, a finger on any
      // of them takes all of it.
      return true;
    },
    drag() {
      const { project } = get();
      const box = itemsBounds(chosen());
      if (!project || !box) return null;
      const from = new Map(project.items.map((i) => [i.id, i.placement]));
      const before = snap();
      let dragged = false;
      // What of it is in sight: a hidden member moves along (it is in the box the position fields show, which the
      // grid rounds) but is no line to snap by and nothing to measure a gap from – it is not cut, and a hidden
      // part is left out of aligning and of what is snapped to alike.
      const seen = itemsBounds(inSight(chosen()));
      // The others and the stock hold still while the finger moves: seen once. A registration hole that is
      // dragged alone has nothing to snap to (a hole put on a line of a part cuts into it), and nothing in
      // sight has no lines to snap.
      const alone = !seen || chosen().every((i) => i.registration !== undefined);
      const targets = alone ? [] : snapTargets(project.items, get().selected);
      const stock = alone ? null : (enteredStock()?.box ?? null);
      return {
        move(dx, dy, step = 0, assist) {
          const p = get().project;
          if (!p) return;
          dragged = true;
          // Always from the finger's own shift: the snap lets go again when the finger moves on. Round numbers
          // for the corner of the grid, so the position can be read and typed again.
          const snapped = snapMove(
            seen ?? box,
            { dx, dy },
            targets,
            stock,
            assist?.snap ?? 0,
            step,
            box,
          );
          dx = snapped.dx;
          dy = snapped.dy;
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
          if (!assist || !seen || alone) return undefined;
          return {
            guides: snapped.guides,
            gaps: assist.gaps
              ? gapsAround(
                  {
                    minX: seen.minX + dx,
                    minY: seen.minY + dy,
                    maxX: seen.maxX + dx,
                    maxY: seen.maxY + dy,
                  },
                  targets,
                )
              : [],
          };
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
      // What was pasted is selected: its group, or the several groups that were copied – and what
      // was "everything" stays so (the copies are part of it)
      update([...p.items, ...made], get().selected === 'all' ? 'all' : normalise(groupsOf(made)));
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
      const made = copies([{ x: b.maxX - b.minX + COPY_GAP, y: 0 }]);
      // Nothing to copy: only a registration hole is selected (there are two, and they are not copied)
      if (made.length === 0) return;
      remember();
      const { selected } = get();
      // The copy is selected in place of what it was made from: its group, or the groups of the copies
      update([...p.items, ...made], selected === 'all' ? 'all' : normalise(groupsOf(made)));
    },
    array(columns, rows, gap) {
      const p = get().project;
      const b = itemsBounds(chosen());
      if (!p || !b) return;
      const offsets = gridOffsets(columns, rows, b.maxX - b.minX + gap, b.maxY - b.minY + gap);
      remember();
      const made = copies(offsets.slice(0, MAX_COPIES));
      const { selected } = get();
      // One group stays selected (the original, as ever); several groups: the groups of the copies
      update([...p.items, ...made], Array.isArray(selected) ? normalise(groupsOf(made)) : selected);
    },
    arrangeBy(shifts) {
      const p = get().project;
      if (!p || !movesAnything(shifts)) return;
      remember();
      update(
        p.items.map((i) => {
          const s = i.registration === undefined ? shifts.get(i.group) : undefined;
          // A unit that stays is left as it is: no rounding noise in its placement
          if (!s || (Math.abs(s.dx) <= MOVES && Math.abs(s.dy) <= MOVES)) return i;
          const placement = compose(translation(s.dx, s.dy), i.placement);
          return { ...i, placement, contours: place(i.source, placement) };
        }),
      );
    },
    // A hidden part is left out of aligning and spreading: a group is arranged by the box of its parts in
    // sight (a group of hidden parts alone stays where it is), and moves rigidly with its hidden parts
    align(edge) {
      get().arrangeBy(alignDeltas(unitsOf(inSight(chosen())), edge));
    },
    distribute(axis, mode) {
      get().arrangeBy(distributeDeltas(unitsOf(inSight(chosen())), axis, mode));
    },
    nest(options = {}) {
      const { project, selected, settings } = get();
      const stock = enteredStock();
      if (!project || !stock) return null;
      const typed = options.gap;
      // A gap beyond the stock's longer side leaves room for no part: it is held there, so a huge number (the
      // fields take 1e20) cannot make the library's float arithmetic place a part that lies outside the stock
      const reach = Math.max(stock.box.maxX - stock.box.minX, stock.box.maxY - stock.box.minY);
      const gap = Math.min(
        typed !== undefined && Number.isFinite(typed) && typed >= 0
          ? typed
          : defaultNestGap(toolDiameter(settings)),
        reach,
      );
      const rotate = options.rotate === true;
      const plan = planNest(project.items, selected, stock.box, { gap, rotate });
      if (!plan) return null;
      // One step, and only where something moves: the part that already stands where it is put stays untouched
      if (plan.moves.size > 0) {
        remember();
        update(
          project.items.map((i) => {
            const m = i.registration === undefined ? plan.moves.get(i.group) : undefined;
            if (!m) return i;
            const placement = compose(m, i.placement);
            return { ...i, placement, contours: place(i.source, placement) };
          }),
        );
      }
      const report: NestReport = {
        items: get().project!.items,
        selected: get().selected,
        placed: plan.placed,
        unplaced: plan.unplaced,
        riders: plan.riders,
        overlapped: plan.overlapped,
        moved: plan.moves.size,
        used: plan.used,
        gap,
        rotate,
      };
      set({ nested: report });
      return report;
    },
    group() {
      const p = get().project;
      const units = unitsOf(chosen()).map((u) => u.group);
      if (!p || units.length < 2) return;
      remember();
      const group = nextId++;
      // The list keeps its order, so the program is the same one: grouping changes nothing at the machine
      update(
        p.items.map((i) =>
          i.registration === undefined && units.includes(i.group) ? { ...i, group } : i,
        ),
        group,
      );
    },
    ungroup() {
      const p = get().project;
      const units = new Set(unitsOf(chosen()).map((u) => u.group));
      // Only a group of several things can be taken apart
      const several = p?.items.some(
        (i) =>
          i.registration === undefined &&
          units.has(i.group) &&
          p.items.some((o) => o !== i && o.registration === undefined && o.group === i.group),
      );
      if (!p || !several) return;
      remember();
      const fresh: number[] = [];
      const items = p.items.map((i) => {
        if (i.registration !== undefined || !units.has(i.group)) return i;
        const group = nextId++;
        fresh.push(group);
        return { ...i, group };
      });
      update(items, normalise(fresh));
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
      // The cutter this program is made for (and the picture of the drawing – `useCamToolDiameter` – follows the
      // same one): `afterToolEdit` asks it again when the tool list changes
      cutWith = { id: settings.toolId, diameter: toolDiameter(settings) };
      // What is cut: a hidden part is not (the program does not mention it – not even as a part without work)
      const parts = project ? inSight(partsOf(project.items)) : [];
      if (!project || parts.length === 0) {
        set({ problems: [], cutOrder: {}, flipNotes: [] });
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
          if (item.registration !== undefined || item.hidden === true) return;
          if (which && item.side !== which) return;
          lay(item.contours).forEach((c, k) => {
            operations.push({ contour: contours.length, ...itemOperation(item, settings, k) });
            contours.push(c);
            rows.push(row);
          });
        });
        // The route of the cuts of one kind: shorter, where the drawing asks for it (`operations` and `contours`
        // go in step, so an operation's index is its contour's)
        const path = toolpaths(contours, operations, cut, undefined, {
          route: settings.routeShort ? 'short' : 'nearest',
        });
        return {
          moves: path.moves,
          problems: path.problems.map((q) => ({ row: rows[q.contour]!, code: q.code })),
          // What was really cut, in the order it was cut in: the part and the kind of each
          cuts: path.cuts
            .filter((c) => c.end > c.start)
            .map((c) => ({ item: project.items[rows[c.op]!]!.id, kind: operations[c.op]!.kind })),
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
          // Held only where a tab is cut: none by hand, or none by count, leaves the part loose
          tabs: itemHasTabs(item, settings.tabs),
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
      // Each side is a program of its own: a part is counted among the parts of its side
      const places = new Map([...cutPlaces(front.cuts), ...cutPlaces(back?.cuts ?? [])]);
      set({
        problems: [...front.problems, ...(back?.problems ?? [])].filter(
          (p) => !seen.has(`${p.row}|${p.code}`) && seen.add(`${p.row}|${p.code}`),
        ),
        cutOrder: Object.fromEntries(places),
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

// Putting tabs on the table is a mode: it ends when its conditions go – the thing is no longer the
// selected one, no longer has its tabs by hand, or is gone (a project closed, undo, a removal). The panel
// of tabs that is open in the list ends the same way: with the thing no longer the one selected, its tabs
// off, or the thing gone – it is never left open on a part that is not in the finger's hand.
useCam.subscribe((s) => {
  if (s.placing !== null) {
    const item = s.project?.items.find((i) => i.id === s.placing);
    if (
      !(
        item &&
        // One thing alone: with several or everything selected the tabs are not put by hand
        s.selected === item.group &&
        tabValues(item, s.settings.tabs).mode === 'manual' &&
        tabsOn(item) &&
        // (a hidden part has no tabs on the table to put by hand)
        item.hidden !== true
      )
    ) {
      useCam.setState({ placing: null });
    }
  }
  if (s.tabsOpen !== null) {
    const item = s.project?.items.find((i) => i.id === s.tabsOpen);
    if (!(item && s.selected === item.group && tabsOn(item) && item.hidden !== true)) {
      useCam.setState({ tabsOpen: null });
    }
  }
});

// The program is cut with the diameter of the chosen cutter as the tool list has it, and what the table draws of it –
// the places of tabs kept off the corners are the cutter's – follows the tool list at once (`useCamToolDiameter`). So
// where the diameter of that cutter is edited in the tool list the program is made anew: otherwise the picture would
// show the places of the new diameter while the program on the table still lifts at the old ones. `remake` keeps every
// rule of the program lock (a job under way keeps its program – the drawing is `ahead` – and a program that is not the
// drawing's own is left alone). Choosing another cutter in the drawing is `set` + `remake` already.
function afterToolEdit(): void {
  const { project, settings, remake } = useCam.getState();
  if (!project || !cutWith || cutWith.id !== settings.toolId) return;
  if (Math.abs(toolDiameter(settings) - cutWith.diameter) < 1e-9) return;
  remake();
}
useWorkshop.subscribe(afterToolEdit);

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
