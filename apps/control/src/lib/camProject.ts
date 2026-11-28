import {
  DEFAULT_FONT,
  isFontId,
  tidySketch,
  validateSketch,
  type AnySketch,
  type Contour,
  type Matrix,
  type Sketch,
  type TextOptions,
} from '@lowrider/cam';
import {
  COLOR_LIMITS,
  isColorId,
  ownedDepth,
  tidyColors,
  type ColorTable,
  type ColorValues,
} from './camGroups';
import type { CamItem, TabSpec } from './camItems';
import { MAX_SEQ } from './camOrder';
import { PATH_LIMITS, takesEntry, takesPeck } from './camPath';
import { TAB_LIMITS, tidySpec } from './camTabs';
import type { CamProject, CamSettings, TwoSided } from '../store/cam';

/**
 * A drawing of the CAM as a file (the drawing, how it is cut, how the part is turned over): what
 * the operator can keep, copy to the Pi or a stick, and open again. Nothing else is in it – no
 * program (that is made anew from the drawing, the same bytes), no state of the machine.
 */
export const PROJECT_FORMAT = 'lowrider-cam-project';
/** The first version of the format: what a drawing is written as while nothing in it needs a newer reader (`projectVersion`) */
export const PROJECT_VERSION = 1;
/** The newest version this build reads: a file of a version above it is refused (`newer-version`) */
export const PROJECT_VERSION_MAX = 2;
/** Larger is no drawing of a LowRider: refused before it is read */
export const PROJECT_MAX_BYTES = 20 * 1024 * 1024;
const MAX_ITEMS = 2000;
const MAX_POINTS = 400_000;
/** A name longer than this is no name of a drawing */
const MAX_NAME = 120;
/** … and an id longer than this is no id of a tool */
const MAX_TOOL_ID = 120;
/** A drawing names at most as many cutters as it has parts */
const MAX_TOOLS = 2000;

export type SavedItem = Omit<CamItem, 'contours'>;

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  name: string;
  twoSided: TwoSided | null;
  items: SavedItem[];
  settings: CamSettings;
  /** Diameter of the cutter the drawing was made with, mm: a cutter of the same id that is another now is said */
  toolDiameter?: number;
  /**
   * Version 2, with `toolId` on a part: the diameters of the cutters the parts name (their tool-list ids) – and the
   * colours' –, mm: as `toolDiameter` for the drawing's own, one of the same id that is another now is said.
   */
  toolDiameters?: Record<string, number>;
  /**
   * Version 2, with colour groups: what each colour a part carries sets (depth, engraving depth, direction, cutter,
   * defaults of the tabs). Left off where no colour sets anything.
   */
  colors?: ColorTable;
}

/** Why a file is not opened – stable codes, the app has a German text for each. */
export type ProjectError =
  | 'too-large'
  | 'invalid-json'
  | 'wrong-format'
  | 'newer-version'
  | 'invalid-project';

export interface OpenedProject {
  project: CamProject;
  /** The cutting settings that were in the file and make sense (the rest stays as it is) */
  settings: Partial<CamSettings>;
  /** The highest id or group number in the file: new things must start above it */
  highestId: number;
  /** The diameter of the cutter it was saved with, if the file says */
  toolDiameter?: number;
  /** The diameters of the cutters the parts name, by tool-list id (empty where the file says none) */
  toolDiameters: Readonly<Record<string, number>>;
  /** Settings of the file that were left out because no machine would have them (their names) */
  dropped: string[];
}

/**
 * Whether a sketch is written as it is stored. The five older types always were (what was typed beyond a range
 * stays in the file, as it did). The curved shapes and a rectangle with a radius for each corner are written as
 * they are drawn: what the fields hold while a number is being typed (a star of 99 tips is a star of 32) would
 * be refused by `validateSketch` on opening, and the file would lose the sketch of a shape that is still there.
 */
const drawnAsTyped = (s: AnySketch): boolean =>
  s.type === 'circle' ||
  s.type === 'slot' ||
  s.type === 'grid' ||
  s.type === 'text' ||
  (s.type === 'rect' && !s.radii);

/**
 * The oldest version of the format that holds this drawing. 1 as long as nothing in it needs a newer reader – such
 * a file is written exactly as it always was, and an older build opens it as ever. 2 once a part names a cutter of
 * its own (`toolId`) or a colour group is in use (a part carries a colour, or the table sets something): an older
 * build would ignore the keys and cut every part with one cutter and the drawing's depths – a colour that sets
 * a depth would come back as the drawing's – so it must refuse the file (`newer-version`) instead. **The one place
 * that decides:** a later addition to the format extends this condition, never writes a version by itself.
 */
export function projectVersion(project: Pick<CamProject, 'items' | 'colors'>): number {
  const named = project.items.some((i) => i.toolId !== undefined || i.color !== undefined);
  return named || tidyColors(project.colors) !== undefined ? 2 : PROJECT_VERSION;
}

/** The drawing as it is saved: without what is made from it (`contours`), with how it is cut. */
export function projectToFile(
  project: CamProject,
  settings: CamSettings,
  now: Date = new Date(),
  toolDiameter?: number,
  toolDiameters?: Readonly<Record<string, number>>,
): ProjectFile {
  // Only the diameters the reader takes: it refuses the WHOLE file for one outside 0.001 … 100 mm, so a cutter above that
  // (a face mill) is named by its id alone – the part keeps it, and the diameter is a hint only ("differs here")
  const readable = Object.entries(toolDiameters ?? {}).filter(([id, d]) => toolDiameterOk(id, d));
  const named = readable.length > 0;
  const colors = tidyColors(project.colors);
  return {
    format: PROJECT_FORMAT,
    version: projectVersion(project),
    savedAt: now.toISOString(),
    name: project.name,
    twoSided: project.twoSided,
    items: project.items.map(({ contours: _made, ...kept }) =>
      kept.sketch && !drawnAsTyped(kept.sketch)
        ? { ...kept, sketch: tidySketch(kept.sketch) }
        : kept,
    ),
    settings,
    ...(colors ? { colors } : {}),
    ...(toolDiameter !== undefined ? { toolDiameter } : {}),
    ...(named ? { toolDiameters: Object.fromEntries(readable) } : {}),
  };
}

export const projectToText = (
  project: CamProject,
  settings: CamSettings,
  now?: Date,
  toolDiameter?: number,
  toolDiameters?: Readonly<Record<string, number>>,
) =>
  `${JSON.stringify(projectToFile(project, settings, now, toolDiameter, toolDiameters), null, 1)}\n`;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => num(v) && v > 0;
const whole = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
/** A number inside a range – a value a drawing program never produces is no setting */
const within = (v: unknown, min: number, max: number): v is number =>
  num(v) && v >= min && v <= max;
/** The name goes into the program's header and its file name: no line breaks, no control characters */
const plainName = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.trim() !== '' &&
  v.length <= MAX_NAME &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u001f\u007f]/.test(v);

/** A tool-list id: it goes into the file and is looked up in the list – no control characters, no endless string */
const toolIdOf = (v: unknown): v is string =>
  typeof v === 'string' &&
  v !== '' &&
  v.length <= MAX_TOOL_ID &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u001f\u007f]/.test(v);

const isMatrix = (v: unknown): v is Matrix =>
  isObject(v) && ['a', 'b', 'c', 'd', 'e', 'f'].every((k) => num(v[k]));
const isPoint = (v: unknown): v is { x: number; y: number } => isObject(v) && num(v.x) && num(v.y);

function isContour(v: unknown): v is Contour {
  if (!isObject(v) || !Array.isArray(v.points) || typeof v.closed !== 'boolean') return false;
  const points = v.points as unknown[];
  if (!points.every(isPoint)) return false;
  // A closed contour whose points all lie on one spot has no length to cut along – refused here, as nothing
  // the importers or the shapes make looks like it
  const [first] = points as { x: number; y: number }[];
  if (
    v.closed &&
    points.every((p) => (p as { x: number }).x === first!.x && (p as { y: number }).y === first!.y)
  ) {
    return false;
  }
  if (v.circle !== undefined) {
    const c = v.circle;
    if (!isObject(c) || !num(c.cx) || !num(c.cy) || !positive(c.r)) return false;
    // A hole is drilled where the circle says: the polygon that is drawn must lie on it
    const { cx, cy, r } = c as { cx: number; cy: number; r: number };
    const slack = Math.max(0.01, 0.02 * r);
    if (!v.points.every((p) => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) <= slack)) {
      return false;
    }
  }
  return v.layer === undefined || typeof v.layer === 'string';
}

/**
 * What an app before the curved shapes and the radius of each corner wrote – the five older types, a length
 * being any number above 0, as it was read until then. A sketch that is stretched beyond what `validateSketch`
 * takes (5 m) is read this way and keeps its sketch, as it always did: an older file opens as it did. A rectangle
 * that carries `radii` is never read here – a damaged one is no trustworthy sketch.
 */
function olderSketchOf(v: Record<string, unknown>): Sketch | null {
  switch (v.type) {
    case 'rect':
      return positive(v.w) && positive(v.h) && num(v.r) && v.radii === undefined
        ? tidySketch({ type: 'rect', w: v.w, h: v.h, r: v.r })
        : null;
    case 'circle':
      return positive(v.d) ? tidySketch({ type: 'circle', d: v.d }) : null;
    case 'slot':
      return positive(v.l) && positive(v.w) ? tidySketch({ type: 'slot', l: v.l, w: v.w }) : null;
    case 'grid':
      return positive(v.d) && positive(v.nx) && positive(v.ny) && positive(v.px) && positive(v.py)
        ? tidySketch({ type: 'grid', d: v.d, nx: v.nx, ny: v.ny, px: v.px, py: v.py })
        : null;
    case 'text':
      // An app before the faces never wrote a `font`: a text that has one is read by `validateSketch` or not at all
      // (the older reading would drop the key and take an unknown face for the standard one)
      return v.font === undefined &&
        typeof v.text === 'string' &&
        positive(v.height) &&
        num(v.spacing) &&
        num(v.lineSpacing) &&
        (v.align === 'left' || v.align === 'center' || v.align === 'right')
        ? tidySketch({
            type: 'text',
            text: v.text,
            height: v.height,
            spacing: v.spacing,
            lineSpacing: v.lineSpacing,
            align: v.align,
          })
        : null;
    default:
      return null;
  }
}

/**
 * A sketch the drawing program can make anew – or null: the item then keeps its contours as they are. The
 * library decides (`validateSketch`: the shapes it knows with their ranges, a rectangle with its radii for each
 * corner); where it refuses one of the five older types only for being larger than 5 m, the older reading takes it
 * (see `olderSketchOf`). Anything else that cannot be trusted – a measure that is no number, an unknown shape, a
 * damaged `radii`, a text whose `font` is no face this app knows – drops the sketch and the item keeps its
 * contours, as before.
 */
function sketchOf(v: unknown): AnySketch | null {
  if (!isObject(v)) return null;
  return validateSketch(v) ?? olderSketchOf(v);
}

function textStyleOf(v: unknown): CamItem['textStyle'] | null {
  if (!isObject(v) || !isPoint(v.centre) || !isObject(v.options)) return null;
  const o = v.options;
  if (!positive(o.height)) return null;
  if (o.spacing !== undefined && !num(o.spacing)) return null;
  if (o.lineSpacing !== undefined && !num(o.lineSpacing)) return null;
  if (o.align !== undefined && o.align !== 'left' && o.align !== 'center' && o.align !== 'right') {
    return null;
  }
  if (o.vertical !== undefined && o.vertical !== 'baseline' && o.vertical !== 'middle') return null;
  // The face is one of the faces this app has – a text set in another (a newer app's) cannot be set anew here, so the
  // style is dropped and the item keeps its contours; the standard face is no key, as everywhere
  if (o.font !== undefined && !isFontId(o.font)) return null;
  const { font, ...rest } = o;
  const options = font === undefined || font === DEFAULT_FONT ? rest : { ...rest, font };
  return { options: options as unknown as TextOptions, centre: { x: v.centre.x, y: v.centre.y } };
}

const KINDS = ['outside', 'inside', 'on', 'pocket', 'drill', 'none'];

/**
 * How the tabs of an item are made – null when the file's spec is no spec this app writes, undefined
 * when it says nothing the defaults would not (it is then no spec). Read like everything else of an item:
 * a value of the wrong kind or outside the ranges of the fields refuses the file, and a place must name a
 * contour the item has (`contours`) and lie on its line (0 ≤ u < 1).
 */
function tabSpecOf(v: unknown, contours: number): TabSpec | null | undefined {
  if (!isObject(v) || (v.mode !== 'auto' && v.mode !== 'manual')) return null;
  const { count, width, height } = TAB_LIMITS;
  if (
    v.count !== undefined &&
    !(Number.isSafeInteger(v.count) && within(v.count, count.min, count.max))
  ) {
    return null;
  }
  if (v.width !== undefined && !within(v.width, width.min, width.max)) return null;
  if (v.height !== undefined && !within(v.height, height.min, height.max)) return null;
  if (v.avoidCorners !== undefined && typeof v.avoidCorners !== 'boolean') return null;
  let places: { c: number; u: number }[] | undefined;
  if (v.at !== undefined) {
    if (!Array.isArray(v.at) || v.at.length > TAB_LIMITS.places) return null;
    places = [];
    for (const p of v.at as unknown[]) {
      if (!isObject(p) || !whole(p.c) || p.c >= contours || !num(p.u) || p.u < 0 || p.u >= 1) {
        return null;
      }
      places.push({ c: p.c, u: p.u });
    }
  }
  return tidySpec({
    mode: v.mode,
    ...(v.count !== undefined ? { count: v.count as number } : {}),
    ...(v.width !== undefined ? { width: v.width as number } : {}),
    ...(v.height !== undefined ? { height: v.height as number } : {}),
    ...(v.avoidCorners !== undefined ? { avoidCorners: v.avoidCorners as boolean } : {}),
    ...(places ? { at: places } : {}),
  });
}

/** One item as the file has it – or null when it is no item. */
function itemOf(v: unknown): SavedItem | null {
  if (!isObject(v) || !whole(v.id) || !whole(v.group)) return null;
  if (!Array.isArray(v.source) || !v.source.every(isContour) || !isMatrix(v.placement)) return null;
  if (typeof v.kind !== 'string' || !KINDS.includes(v.kind) || typeof v.tabs !== 'boolean') {
    return null;
  }
  if (v.relief !== null && v.relief !== 'dogbone' && v.relief !== 'tbone') return null;
  if (v.side !== 'front' && v.side !== 'back') return null;
  if (v.depth !== undefined && !within(v.depth, 0.01, MAX_DEPTH)) return null;
  if (v.climb !== undefined && typeof v.climb !== 'boolean') return null;
  // The cutter of a part: the id of a tool of the list (the file does not know the list: a tool this workshop lacks stays
  // chosen and is said when the file is opened). A registration hole is drilled with the drawing's cutter, never its own
  if (v.toolId !== undefined && (!toolIdOf(v.toolId) || v.registration !== undefined)) return null;
  // The colour group of a part: one of the four, and never on a registration hole (there are two, drilled with the
  // drawing's cutter)
  if (v.color !== undefined && (!isColorId(v.color) || v.registration !== undefined)) return null;
  // How a pocket is entered, how a hole is drilled, the place among the parts cut the same way: a value of
  // the wrong kind or outside what the fields take refuses the file (the cutter and the depth of a part are not
  // known here, so the bounds are the outer ones of the fields – the library holds a value to its cutter)
  if (v.entry !== undefined && v.entry !== 'ramp' && v.entry !== 'helix' && v.entry !== 'plunge') {
    return null;
  }
  const { helixDiameter, peck, peckRetract } = PATH_LIMITS;
  if (
    v.helixDiameter !== undefined &&
    !within(v.helixDiameter, helixDiameter.min, helixDiameter.max)
  ) {
    return null;
  }
  if (v.peck !== undefined && !within(v.peck, peck.min, peck.max)) return null;
  if (v.peckRetract !== undefined && !within(v.peckRetract, peckRetract.min, peckRetract.max)) {
    return null;
  }
  if (v.seq !== undefined && !(Number.isSafeInteger(v.seq) && within(v.seq, 0, MAX_SEQ))) {
    return null;
  }
  // Hidden is only ever true, and no registration hole is hidden (they are two, and never in the way)
  if (v.hidden !== undefined && typeof v.hidden !== 'boolean') return null;
  if (v.hidden === true && v.registration !== undefined) return null;
  const kind = v.kind as CamItem['kind'];
  const tabSpec = v.tabSpec === undefined ? undefined : tabSpecOf(v.tabSpec, v.source.length);
  if (tabSpec === null) return null;
  if (v.registration !== undefined && v.registration !== 1 && v.registration !== 2) return null;
  if (v.text !== undefined && typeof v.text !== 'string') return null;
  let sketch = v.sketch === undefined ? null : sketchOf(v.sketch);
  let textStyle = v.textStyle === undefined ? null : textStyleOf(v.textStyle);
  // A text's sketch and the style a series sets other words in say the same face – or neither is kept (the item
  // keeps its words and contours): a series must never write names in a face the drawing does not show. The face
  // of the sketch is read from the FILE's own text sketch, whether or not the sketch survived its reader: a sketch
  // whose face was refused (unknown, null, a number …) still says the strokes are in a face this app does not know –
  // only a key that is absent is the standard face, never a value that is there but wrong.
  const written = isObject(v.sketch) && v.sketch.type === 'text' ? v.sketch : null;
  if (
    written &&
    textStyle &&
    (written.font === undefined ? DEFAULT_FONT : written.font) !==
      (textStyle.options.font ?? DEFAULT_FONT)
  ) {
    sketch = null;
    textStyle = null;
  }
  return {
    id: v.id,
    group: v.group,
    ...(v.text !== undefined ? { text: v.text } : {}),
    ...(textStyle ? { textStyle } : {}),
    ...(sketch ? { sketch } : {}),
    source: v.source,
    placement: v.placement,
    kind,
    tabs: v.tabs,
    ...(tabSpec ? { tabSpec } : {}),
    relief: v.relief,
    ...(v.depth !== undefined ? { depth: v.depth } : {}),
    ...(v.climb !== undefined ? { climb: v.climb } : {}),
    ...(v.color !== undefined ? { color: v.color as CamItem['color'] } : {}),
    ...(v.toolId !== undefined ? { toolId: v.toolId as string } : {}),
    // The ramp is the absence of an entry; what means nothing without another – or in another kind of cut – is not kept
    // (the drawing never holds it either: `setItem` drops it with the kind)
    ...(takesEntry(kind) && (v.entry === 'helix' || v.entry === 'plunge')
      ? { entry: v.entry }
      : {}),
    ...(takesEntry(kind) && v.entry === 'helix' && v.helixDiameter !== undefined
      ? { helixDiameter: v.helixDiameter as number }
      : {}),
    ...(takesPeck(kind) && v.peck !== undefined ? { peck: v.peck as number } : {}),
    ...(takesPeck(kind) && v.peck !== undefined && v.peckRetract !== undefined
      ? { peckRetract: v.peckRetract as number }
      : {}),
    ...(kind !== 'none' && v.seq !== undefined ? { seq: v.seq as number } : {}),
    ...(v.hidden === true ? { hidden: true } : {}),
    side: v.side,
    ...(v.registration !== undefined ? { registration: v.registration } : {}),
  };
}

function twoSidedOf(v: unknown): TwoSided | null | undefined {
  if (v === null) return null;
  if (!isObject(v)) return undefined;
  if ((v.axis !== 'x' && v.axis !== 'y') || typeof v.pins !== 'boolean') return undefined;
  if (typeof v.autoHoles !== 'boolean') return undefined;
  if (v.thickness !== undefined && !positive(v.thickness)) return undefined;
  return {
    axis: v.axis,
    pins: v.pins,
    autoHoles: v.autoHoles,
    ...(v.thickness !== undefined ? { thickness: v.thickness } : {}),
  };
}

/**
 * What the settings of a LowRider can be. The lower bounds are those of the fields in the CAM (what
 * the app itself lets you type must come back from a file it wrote); the upper ones only keep a damaged
 * file from stalling the drawing.
 */
export const MAX_DEPTH = 500;
/** More passes than this is no way to cut: the stepdown of such a file is left out */
const MAX_PASSES = 2000;
const SETTING_RANGES = {
  rpm: [1, 1_000_000],
  depth: [0.01, MAX_DEPTH],
  stepdown: [0.01, MAX_DEPTH],
  stepover: [0.01, 10],
  feed: [1, 1_000_000],
  plungeFeed: [1, 1_000_000],
  rampAngle: [0.1, 90],
  safeZ: [0, 500],
  engraveDepth: [0.01, MAX_DEPTH],
} as const;

/**
 * The cutting settings of the file that make sense; what does not is left out, not guessed – and
 * said (`dropped`: the names of the settings, as the file had them).
 */
function settingsOf(v: unknown): { settings: Partial<CamSettings>; dropped: string[] } {
  if (!isObject(v)) return { settings: {}, dropped: [] };
  const out: Partial<CamSettings> = {};
  const dropped: string[] = [];
  for (const key of Object.keys(SETTING_RANGES) as (keyof typeof SETTING_RANGES)[]) {
    if (v[key] === undefined) continue;
    const [min, max] = SETTING_RANGES[key];
    if (within(v[key], min, max)) out[key] = v[key];
    else dropped.push(key);
  }
  if (v.allowance !== undefined) {
    if (within(v.allowance, 0, 20)) out.allowance = v.allowance;
    else dropped.push('allowance');
  }
  if (typeof v.climb === 'boolean') out.climb = v.climb;
  if (typeof v.routeShort === 'boolean') out.routeShort = v.routeShort;
  else if (v.routeShort !== undefined) dropped.push('routeShort');
  if (typeof v.toolId === 'string' && v.toolId !== '') out.toolId = v.toolId;
  const t = v.tabs;
  if (
    isObject(t) &&
    whole(t.count) &&
    t.count <= TAB_LIMITS.count.max &&
    within(t.width, TAB_LIMITS.width.min, TAB_LIMITS.width.max) &&
    within(t.height, TAB_LIMITS.height.min, MAX_DEPTH) &&
    (t.avoidCorners === undefined || typeof t.avoidCorners === 'boolean')
  ) {
    out.tabs = {
      count: t.count,
      width: t.width,
      height: t.height,
      ...(t.avoidCorners === true ? { avoidCorners: true } : {}),
    };
  } else if (t !== undefined) {
    dropped.push('tabs');
  }
  return { settings: out, dropped };
}

/**
 * What the colour groups of a file set, read like the cutting settings: a value outside its field's range, of the
 * wrong kind or for a colour there is not is left out, not guessed – and said (`dropped`, as `colors.a.depth` or
 * `colors` for the whole table). The table that is left says only what it holds: no entry that says nothing. A tool
 * id is only a well-formed id here: the file does not know the tool list (a tool this workshop lacks is said when the
 * file is opened, like those of single parts).
 */
function colorsOf(v: unknown): { colors: ColorTable | undefined; dropped: string[] } {
  if (v === undefined) return { colors: undefined, dropped: [] };
  if (!isObject(v)) return { colors: undefined, dropped: ['colors'] };
  const out: ColorTable = {};
  const dropped: string[] = [];
  let foreign = false;
  for (const [id, raw] of Object.entries(v)) {
    if (!isColorId(id)) {
      foreign = true;
      continue;
    }
    if (!isObject(raw)) {
      dropped.push(`colors.${id}`);
      continue;
    }
    const values: ColorValues = {};
    for (const key of ['depth', 'engraveDepth'] as const) {
      if (raw[key] === undefined) continue;
      const { min, max } = COLOR_LIMITS[key];
      if (within(raw[key], min, max)) values[key] = raw[key];
      else dropped.push(`colors.${id}.${key}`);
    }
    if (raw.climb !== undefined) {
      if (typeof raw.climb === 'boolean') values.climb = raw.climb;
      else dropped.push(`colors.${id}.climb`);
    }
    if (raw.toolId !== undefined) {
      if (toolIdOf(raw.toolId)) values.toolId = raw.toolId;
      else dropped.push(`colors.${id}.toolId`);
    }
    if (raw.tabs !== undefined) {
      if (!isObject(raw.tabs)) dropped.push(`colors.${id}.tabs`);
      else {
        const tabs: NonNullable<ColorValues['tabs']> = {};
        for (const key of ['count', 'width', 'height'] as const) {
          const n = raw.tabs[key];
          if (n === undefined) continue;
          const { min, max } = COLOR_LIMITS[key];
          if (within(n, min, max) && (key !== 'count' || Number.isSafeInteger(n))) tabs[key] = n;
          else dropped.push(`colors.${id}.tabs.${key}`);
        }
        if (Object.keys(tabs).length > 0) values.tabs = tabs;
      }
    }
    if (Object.keys(values).length > 0) out[id] = values;
  }
  if (foreign) dropped.push('colors');
  return { colors: tidyColors(out), dropped };
}

/** A tool id and a diameter (mm) the file may carry: the reader refuses the file for one that is not – the writer leaves it out */
const toolDiameterOk = (id: unknown, d: unknown): boolean => toolIdOf(id) && within(d, 0.001, 100);

/** The diameters of the cutters the parts name: an object of tool ids and diameters (mm) – null where it is anything else */
function toolDiametersOf(v: unknown): Record<string, number> | null {
  if (v === undefined) return {};
  if (!isObject(v)) return null;
  const entries = Object.entries(v);
  if (entries.length > MAX_TOOLS) return null;
  if (!entries.every(([id, d]) => toolDiameterOk(id, d))) return null;
  // (`fromEntries` makes plain own properties: an id like "__proto__" is only a key)
  return Object.fromEntries(entries as [string, number][]);
}

/** Reads a project file strictly: a wrong one is refused with its reason, nothing is half taken. */
export function parseProject(text: string): OpenedProject | { error: ProjectError } {
  if (text.length > PROJECT_MAX_BYTES) return { error: 'too-large' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'invalid-json' };
  }
  if (!isObject(raw) || raw.format !== PROJECT_FORMAT) return { error: 'wrong-format' };
  if (!whole(raw.version) || raw.version > PROJECT_VERSION_MAX) return { error: 'newer-version' };
  const twoSided = twoSidedOf(raw.twoSided);
  if (
    !plainName(raw.name) ||
    twoSided === undefined ||
    !Array.isArray(raw.items) ||
    raw.items.length > MAX_ITEMS
  ) {
    return { error: 'invalid-project' };
  }
  const items: SavedItem[] = [];
  let points = 0;
  for (const entry of raw.items) {
    const item = itemOf(entry);
    if (!item) return { error: 'invalid-project' };
    points += item.source.reduce((n, c) => n + c.points.length, 0);
    if (points > MAX_POINTS) return { error: 'invalid-project' };
    items.push(item);
  }
  // The diameters of the cutters the parts name (version 2): a map of tool-list ids to diameters, or the file is refused
  const diameters = toolDiametersOf(raw.toolDiameters);
  if (!diameters) return { error: 'invalid-project' };
  const ids = items.flatMap((i) => [i.id, i.group]);
  if (new Set(items.map((i) => i.id)).size !== items.length) return { error: 'invalid-project' };
  // A side that is cut from the back needs the two-sided state that turns it over
  if (twoSided === null && items.some((i) => i.side === 'back'))
    return { error: 'invalid-project' };
  const read = settingsOf(raw.settings);
  const { settings, dropped } = read;
  // What the colours of the drawing set (a part's own value, and a colour's, both count for the bounds below)
  const groups = colorsOf(raw.colors);
  dropped.push(...groups.dropped);
  const { colors } = groups;
  // A file that does not say is read as off – not as what a new drawing starts with: the stored drawing keeps
  // the program it made (the "Ecken meiden" of the tabs is read the same way, in `settingsOf` and `openProject`)
  settings.routeShort ??= false;
  // So many passes is no way to cut (and would stall the drawing): this stepdown is left out
  const deepest = Math.max(settings.depth ?? 0, ...items.map((i) => ownedDepth(i, colors) ?? 0));
  if (settings.stepdown !== undefined && Math.ceil(deepest / settings.stepdown) > MAX_PASSES) {
    delete settings.stepdown;
    dropped.push('stepdown');
  }
  // A hole of so many pecks is no way to drill and would stall the drawing (the generator must never see more than
  // MAX_PASSES): its peck and the retract that goes with it are left out – the hole is drilled in one go, as a hole
  // with no peck is – and said, by the hole's number in the list, like a stepdown above. The store can write such a
  // file (a peck down to 0.05 mm, a depth up to MAX_DEPTH), so refusing the whole file would lose a drawing the app
  // itself saved. A registration hole is no part of the list and its peck is never read: it is left as it is.
  let number = 0;
  const kept = items.map((i) => {
    if (i.registration !== undefined) return i;
    number += 1;
    if (
      i.peck === undefined ||
      Math.ceil((ownedDepth(i, colors) ?? settings.depth ?? 0) / i.peck) <= MAX_PASSES
    ) {
      return i;
    }
    dropped.push(`peck.${number}`);
    const { peck: _peck, peckRetract: _retract, ...plain } = i;
    return plain;
  });
  return {
    project: {
      name: raw.name.trim(),
      // The contours where they lie are made from the source and the placement: filled in by the store
      items: kept.map((i) => ({ ...i, contours: [] })),
      twoSided,
      skipped: {},
      notes: [],
      ...(colors ? { colors } : {}),
    },
    settings,
    dropped,
    toolDiameters: diameters,
    highestId: Math.max(0, ...ids),
    ...(within(raw.toolDiameter, 0.001, 100) ? { toolDiameter: raw.toolDiameter } : {}),
  };
}
