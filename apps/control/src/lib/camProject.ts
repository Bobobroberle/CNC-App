import {
  tidySketch,
  type Contour,
  type Matrix,
  type Sketch,
  type TextOptions,
} from '@lowrider/cam';
import type { CamItem } from './camItems';
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

export type SavedItem = Omit<CamItem, 'contours'>;

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  name: string;
  twoSided: TwoSided | null;
  items: SavedItem[];
  settings: CamSettings;
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
}

/** The drawing as it is saved: without what is made from it (`contours`), with how it is cut. */
export function projectToFile(
  project: CamProject,
  settings: CamSettings,
  now: Date = new Date(),
): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: now.toISOString(),
    name: project.name,
    twoSided: project.twoSided,
    items: project.items.map(({ contours: _made, ...kept }) => kept),
    settings,
  };
}

export const projectToText = (project: CamProject, settings: CamSettings, now?: Date) =>
  `${JSON.stringify(projectToFile(project, settings, now), null, 1)}\n`;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => num(v) && v > 0;
const whole = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

const isMatrix = (v: unknown): v is Matrix =>
  isObject(v) && ['a', 'b', 'c', 'd', 'e', 'f'].every((k) => num(v[k]));
const isPoint = (v: unknown): v is { x: number; y: number } => isObject(v) && num(v.x) && num(v.y);

function isContour(v: unknown): v is Contour {
  if (!isObject(v) || !Array.isArray(v.points) || typeof v.closed !== 'boolean') return false;
  if (!v.points.every(isPoint)) return false;
  if (v.circle !== undefined) {
    const c = v.circle;
    if (!isObject(c) || !num(c.cx) || !num(c.cy) || !positive(c.r)) return false;
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

/** One item as the file has it – or null when it is no item. */
function itemOf(v: unknown): SavedItem | null {
  if (!isObject(v) || !whole(v.id) || !whole(v.group)) return null;
  if (!Array.isArray(v.source) || !v.source.every(isContour) || !isMatrix(v.placement)) return null;
  if (typeof v.kind !== 'string' || !KINDS.includes(v.kind) || typeof v.tabs !== 'boolean') {
    return null;
  }
  if (v.relief !== null && v.relief !== 'dogbone' && v.relief !== 'tbone') return null;
  if (v.side !== 'front' && v.side !== 'back') return null;
  if (v.depth !== undefined && !positive(v.depth)) return null;
  if (v.climb !== undefined && typeof v.climb !== 'boolean') return null;
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

const SETTING_NUMBERS = [
  'rpm',
  'depth',
  'stepdown',
  'stepover',
  'feed',
  'plungeFeed',
  'rampAngle',
  'safeZ',
  'engraveDepth',
] as const;

/** The cutting settings of the file that make sense; what does not is left out, not guessed. */
function settingsOf(v: unknown): Partial<CamSettings> {
  if (!isObject(v)) return {};
  const out: Partial<CamSettings> = {};
  for (const key of SETTING_NUMBERS) if (positive(v[key])) out[key] = v[key];
  if (num(v.allowance) && v.allowance >= 0) out.allowance = v.allowance;
  if (typeof v.climb === 'boolean') out.climb = v.climb;
  if (typeof v.toolId === 'string' && v.toolId !== '') out.toolId = v.toolId;
  const t = v.tabs;
  if (isObject(t) && whole(t.count) && positive(t.width) && positive(t.height)) {
    out.tabs = { count: t.count, width: t.width, height: t.height };
  }
  return out;
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
    typeof raw.name !== 'string' ||
    raw.name.trim() === '' ||
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
  return {
    project: {
      name: raw.name.trim(),
      // The contours where they lie are made from the source and the placement: filled in by the store
      items: items.map((i) => ({ ...i, contours: [] })),
      twoSided,
      skipped: {},
      notes: [],
    },
    settings: settingsOf(raw.settings),
    highestId: Math.max(0, ...ids),
  };
}
