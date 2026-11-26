import {
  tidySketch,
  type Contour,
  type Matrix,
  type Sketch,
  type TextOptions,
} from '@lowrider/cam';
import type { CamItem, TabSpec } from './camItems';
import { TAB_LIMITS, tidySpec } from './camTabs';
import type { CamProject, CamSettings, TwoSided } from '../store/cam';

/**
 * A drawing of the CAM as a file (the drawing, how it is cut, how the part is turned over): what
 * the operator can keep, copy to the Pi or a stick, and open again. Nothing else is in it – no
 * program (that is made anew from the drawing, the same bytes), no state of the machine.
 */
export const PROJECT_FORMAT = 'lowrider-cam-project';
export const PROJECT_VERSION = 1;
/** Larger is no drawing of a LowRider: refused before it is read */
export const PROJECT_MAX_BYTES = 20 * 1024 * 1024;
const MAX_ITEMS = 2000;
const MAX_POINTS = 400_000;
/** A name longer than this is no name of a drawing */
const MAX_NAME = 120;

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
  /** Settings of the file that were left out because no machine would have them (their names) */
  dropped: string[];
}

/** The drawing as it is saved: without what is made from it (`contours`), with how it is cut. */
export function projectToFile(
  project: CamProject,
  settings: CamSettings,
  now: Date = new Date(),
  toolDiameter?: number,
): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: now.toISOString(),
    name: project.name,
    twoSided: project.twoSided,
    items: project.items.map(({ contours: _made, ...kept }) => kept),
    settings,
    ...(toolDiameter !== undefined ? { toolDiameter } : {}),
  };
}

export const projectToText = (
  project: CamProject,
  settings: CamSettings,
  now?: Date,
  toolDiameter?: number,
) => `${JSON.stringify(projectToFile(project, settings, now, toolDiameter), null, 1)}\n`;

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

const isMatrix = (v: unknown): v is Matrix =>
  isObject(v) && ['a', 'b', 'c', 'd', 'e', 'f'].every((k) => num(v[k]));
const isPoint = (v: unknown): v is { x: number; y: number } => isObject(v) && num(v.x) && num(v.y);

function isContour(v: unknown): v is Contour {
  if (!isObject(v) || !Array.isArray(v.points) || typeof v.closed !== 'boolean') return false;
  if (!v.points.every(isPoint)) return false;
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

/** A sketch the drawing program can make anew – or null: the item then keeps its contours as they are. */
function sketchOf(v: unknown): Sketch | null {
  if (!isObject(v)) return null;
  switch (v.type) {
    case 'rect':
      return positive(v.w) && positive(v.h) && num(v.r)
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
      return typeof v.text === 'string' &&
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
  return { options: o as unknown as TextOptions, centre: { x: v.centre.x, y: v.centre.y } };
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
  const tabSpec = v.tabSpec === undefined ? undefined : tabSpecOf(v.tabSpec, v.source.length);
  if (tabSpec === null) return null;
  if (v.registration !== undefined && v.registration !== 1 && v.registration !== 2) return null;
  if (v.text !== undefined && typeof v.text !== 'string') return null;
  const sketch = v.sketch === undefined ? null : sketchOf(v.sketch);
  const textStyle = v.textStyle === undefined ? null : textStyleOf(v.textStyle);
  return {
    id: v.id,
    group: v.group,
    ...(v.text !== undefined ? { text: v.text } : {}),
    ...(textStyle ? { textStyle } : {}),
    ...(sketch ? { sketch } : {}),
    source: v.source,
    placement: v.placement,
    kind: v.kind as CamItem['kind'],
    tabs: v.tabs,
    ...(tabSpec ? { tabSpec } : {}),
    relief: v.relief,
    ...(v.depth !== undefined ? { depth: v.depth } : {}),
    ...(v.climb !== undefined ? { climb: v.climb } : {}),
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
  if (typeof v.toolId === 'string' && v.toolId !== '') out.toolId = v.toolId;
  const t = v.tabs;
  if (
    isObject(t) &&
    whole(t.count) &&
    t.count <= TAB_LIMITS.count.max &&
    within(t.width, TAB_LIMITS.width.min, TAB_LIMITS.width.max) &&
    within(t.height, TAB_LIMITS.height.min, MAX_DEPTH)
  ) {
    out.tabs = { count: t.count, width: t.width, height: t.height };
  } else if (t !== undefined) {
    dropped.push('tabs');
  }
  return { settings: out, dropped };
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
  if (!whole(raw.version) || raw.version > PROJECT_VERSION) return { error: 'newer-version' };
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
  const ids = items.flatMap((i) => [i.id, i.group]);
  if (new Set(items.map((i) => i.id)).size !== items.length) return { error: 'invalid-project' };
  // A side that is cut from the back needs the two-sided state that turns it over
  if (twoSided === null && items.some((i) => i.side === 'back'))
    return { error: 'invalid-project' };
  const read = settingsOf(raw.settings);
  const { settings, dropped } = read;
  // So many passes is no way to cut (and would stall the drawing): this stepdown is left out
  const deepest = Math.max(settings.depth ?? 0, ...items.map((i) => i.depth ?? 0));
  if (settings.stepdown !== undefined && Math.ceil(deepest / settings.stepdown) > MAX_PASSES) {
    delete settings.stepdown;
    dropped.push('stepdown');
  }
  return {
    project: {
      name: raw.name.trim(),
      // The contours where they lie are made from the source and the placement: filled in by the store
      items: items.map((i) => ({ ...i, contours: [] })),
      twoSided,
      skipped: {},
      notes: [],
    },
    settings,
    dropped,
    highestId: Math.max(0, ...ids),
    ...(within(raw.toolDiameter, 0.001, 100) ? { toolDiameter: raw.toolDiameter } : {}),
  };
}
