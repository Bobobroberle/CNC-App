import {
  applyToPoint,
  compose,
  distanceToPath,
  pointInPolygon,
  rotation,
  textContours,
  transformContour,
  translation,
  type Contour,
  type Matrix,
  type Operation,
  type OperationKind,
  type TextOptions,
} from '@lowrider/cam';
import type { BlankKind, BlankShape } from './blanks';
import type { Point } from './camera';

/**
 * A series on scattered blanks: the same motif (or a name each) engraved on
 * every blank the camera found on the table, laid on its middle and turned
 * with it. Pure geometry – where a blank of the picture lies on the table,
 * the order they are cut in, where the motif goes on each and whether it
 * fits. Machine millimetres, y up, angles counter-clockwise, unless said
 * otherwise.
 */

/** A blank on the table. */
export interface TableBlank {
  /** Stable while the blanks lie as they were found */
  id: number;
  kind: BlankKind;
  /** Centre, machine XY */
  x: number;
  y: number;
  /** Long and short side (a round blank: its diameter twice), mm */
  length: number;
  width: number;
  /**
   * Direction of the long side against machine +X, degrees in (−90, 90]; of
   * a side of a square in (−45, 45]; null when the shape gives none.
   */
  angle: number | null;
  /** Outline, machine XY (convex) */
  outline: Point[];
  /** Measured at the crosshair in the live picture, not only on the photo map */
  measured: boolean;
}

/** Degrees folded into (−period/2, period/2]. */
export function foldAngle(deg: number, period: number): number {
  let a = deg % period;
  if (a > period / 2) a -= period;
  if (a <= -period / 2) a += period;
  return a;
}

/**
 * A blank found in a picture, on the table. `toTable` says where a picture
 * pixel lies (machine XY) – for the photo map `mapPixel`, for the live
 * picture the camera calibration; any map that keeps shapes (shift, turn,
 * one scale). The direction is carried over through two points, so the
 * picture's y running down is taken care of in one place.
 */
export function blankOnTable(
  shape: BlankShape,
  toTable: (pixel: Point) => Point,
): Omit<TableBlank, 'id' | 'measured'> {
  const centre = toTable(shape);
  // As seen with y up, `angle` counter-clockwise: in pixels the long side runs along (cos, −sin).
  const a = ((shape.angle ?? 0) * Math.PI) / 180;
  const along = toTable({ x: shape.x + 100 * Math.cos(a), y: shape.y - 100 * Math.sin(a) });
  const dx = along.x - centre.x;
  const dy = along.y - centre.y;
  const scale = Math.hypot(dx, dy) / 100;
  const turned = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    kind: shape.kind,
    x: centre.x,
    y: centre.y,
    length: shape.length * scale,
    width: shape.width * scale,
    angle: shape.angle === null ? null : foldAngle(turned, shape.kind === 'square' ? 90 : 180),
    outline: shape.outline.map(toTable),
  };
}

/**
 * Where a pixel of a picture of the photo map lies on the table: the picture
 * starts at machine X `left` / Y `top` (its upper left corner) and has
 * `pxPerMm` pixels to the millimetre; Y runs up on the table, down in the picture.
 */
export const mapPixel =
  (left: number, top: number, pxPerMm: number) =>
  (pixel: Point): Point => ({ x: left + pixel.x / pxPerMm, y: top - pixel.y / pxPerMm });

/**
 * The order the blanks are cut in: the one nearest to `from` first (the
 * front left of the table), then always the nearest that is left.
 */
export function cutOrder<T extends Point>(blanks: readonly T[], from: Point = { x: 0, y: 0 }): T[] {
  const left = [...blanks];
  const out: T[] = [];
  let at = from;
  while (left.length > 0) {
    let best = 0;
    left.forEach((b, i) => {
      const nearer =
        Math.hypot(b.x - at.x, b.y - at.y) < Math.hypot(left[best]!.x - at.x, left[best]!.y - at.y);
      if (nearer) best = i;
    });
    at = left.splice(best, 1)[0]!;
    out.push(at as T);
  }
  return out;
}

/**
 * How far one tap turns the motif on a blank: a rectangle looks the same
 * both ways round (half a turn), a square or a round blank four ways (a
 * quarter turn).
 */
export function turnStep(blank: Pick<TableBlank, 'kind' | 'angle'>): 90 | 180 {
  return blank.kind === 'square' || blank.kind === 'round' || blank.angle === null ? 90 : 180;
}

/** How the motif is turned on a blank: with the blank, plus the taps on "turn". */
export function motifAngle(blank: Pick<TableBlank, 'kind' | 'angle'>, turns = 0): number {
  return foldAngle((blank.angle ?? 0) + turns * turnStep(blank), 360);
}

/**
 * The map that lays the motif onto a blank: its middle (`centre`, in the
 * drawing) onto the blank's middle, turned with the blank. `zero` is the
 * machine XY of the work zero the program is written against (0, 0 for
 * machine coordinates).
 */
export function motifPlacement(
  blank: Pick<TableBlank, 'kind' | 'angle' | 'x' | 'y'>,
  turns: number,
  centre: Point,
  zero: Point = { x: 0, y: 0 },
): Matrix {
  return compose(
    translation(blank.x - zero.x, blank.y - zero.y),
    compose(rotation(motifAngle(blank, turns)), translation(-centre.x, -centre.y)),
  );
}

/** One thing of the motif: its contours in the drawing and how they are cut. */
export interface MotifPart extends Omit<Operation, 'contour'> {
  contours: Contour[];
  /**
   * A text that can be set anew for every blank: how it was set, the middle
   * of its block where it was added, and how it has been arranged since.
   */
  text?: { options: TextOptions; centre: Point; placement: Matrix };
}

/** The middle of the motif as drawn: the middle of the box around everything that is cut. */
export function motifCentre(parts: readonly MotifPart[]): Point | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const part of parts) {
    for (const c of part.contours) {
      for (const p of c.points) take(p.x, p.y);
      if (c.circle) {
        take(c.circle.cx - c.circle.r, c.circle.cy - c.circle.r);
        take(c.circle.cx + c.circle.r, c.circle.cy + c.circle.r);
      }
    }
  }
  return Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null;
}

/**
 * The middle of a text's block as `textContours` lays it out around its
 * anchor (0, 0): between the top of the first line's capitals and the last
 * baseline, and in the middle of the widest line (`width`).
 */
export function textBlockCentre(text: string, options: TextOptions, width: number): Point {
  const lines = text.split(/\r?\n/).length;
  const pitch = (options.lineSpacing ?? 1.6) * options.height;
  const align = options.align ?? 'left';
  return {
    x: align === 'left' ? width / 2 : align === 'center' ? 0 : -width / 2,
    y: (options.height - (lines - 1) * pitch) / 2,
  };
}

/** The first text of the motif that can be set anew, or undefined. */
export const replaceableText = (parts: readonly MotifPart[]) => parts.find((p) => p.text);

/**
 * The motif with other words in its (first) text: set like the text of the
 * drawing, with its middle where the middle of that text's block is. Also
 * says which characters the font does not have.
 */
export function withText(
  parts: readonly MotifPart[],
  words: string,
): { parts: MotifPart[]; missing: string[] } {
  const target = replaceableText(parts);
  if (!target?.text) return { parts: [...parts], missing: [] };
  const { options, centre, placement } = target.text;
  const layout = textContours(words, {
    ...options,
    align: 'center',
    vertical: 'middle',
    x: centre.x,
    y: centre.y,
    angle: 0,
  });
  const contours = layout.contours.map((c) => transformContour(c, placement));
  return {
    parts: parts.map((p) => (p === target ? { ...p, contours } : p)),
    missing: layout.missing,
  };
}

/** What stands on each blank: the motif as drawn, a name from a list, or a running number. */
export type SeriesText =
  | { mode: 'same' }
  | { mode: 'names'; names: readonly string[] }
  | { mode: 'numbers'; start: number };

/** The names of a typed list: one per line, empty lines left out. */
export const parseNames = (typed: string): string[] =>
  typed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

/**
 * The words for the `index`-th blank that is cut (0-based): undefined
 * leaves the motif as drawn, null means there is no name left for it.
 */
export function wordsFor(text: SeriesText, index: number): string | null | undefined {
  if (text.mode === 'names') return text.names[index] ?? null;
  if (text.mode === 'numbers') return String(Math.round(text.start) + index);
  return undefined;
}

/**
 * How far the cutter takes material beyond the drawn line: a cut outside
 * goes a whole cutter out, an engraving or a hole half of one.
 */
export function reachOf(kind: OperationKind, toolDiameter: number): number {
  if (kind === 'outside') return toolDiameter;
  return kind === 'on' || kind === 'drill' ? toolDiameter / 2 : 0;
}

/** Room kept between a cut and the edge of a blank, mm: the photo map is good to about half of that */
export const EDGE_ROOM = 1;

/**
 * Whether the motif, laid onto the table by `placement` (machine XY), stays
 * on the blank with `EDGE_ROOM` to spare. The blank's outline is convex, so
 * the corner points of the contours decide.
 */
export function motifFits(
  parts: readonly MotifPart[],
  placement: Matrix,
  blank: Pick<TableBlank, 'outline'>,
  toolDiameter: number,
  room = EDGE_ROOM,
): boolean {
  for (const part of parts) {
    if (part.kind === 'none') continue;
    const need = reachOf(part.kind, toolDiameter) + room;
    for (const c of part.contours) {
      for (const p of transformContour(c, placement).points) {
        if (!pointInPolygon(p, blank.outline)) return false;
        if (distanceToPath(p, blank.outline, true) < need) return false;
      }
    }
  }
  return true;
}

/** What happens to a blank of the series. */
export type BlankState =
  /** It is engraved */
  | 'cut'
  /** The operator left it out by a tap */
  | 'excluded'
  /** The list of names has no line for it */
  | 'unnamed';

export interface SeriesEntry {
  blank: TableBlank;
  state: BlankState;
  /** Its number in the order of cutting, 1-based; null when it is left out by a tap */
  n: number | null;
  /** The words on it when every blank gets its own */
  words?: string;
  /** The motif for this blank, in the drawing's coordinates */
  parts: MotifPart[];
  /** Lays the motif onto the blank, machine XY */
  placement: Matrix;
  /** The motif stays on the blank */
  fits: boolean;
  /** Characters of its words the font does not have */
  missing: string[];
}

export interface SeriesPlan {
  entries: SeriesEntry[];
  /** How many names of the list are left without a blank */
  spare: number;
}

/**
 * The series as it will be cut: every blank in the order of cutting with
 * its number, its words and the motif laid onto it. Blanks the operator
 * left out keep their place but get no number, so the names of a list
 * always go to the blanks numbered on the picture.
 */
export function planSeries(
  blanks: readonly TableBlank[],
  motif: readonly MotifPart[],
  options: {
    excluded?: ReadonlySet<number>;
    turns?: Readonly<Record<number, number>>;
    text?: SeriesText;
    toolDiameter: number;
  },
): SeriesPlan {
  const text = options.text ?? { mode: 'same' };
  // Names and numbers only where the drawing has a text to take their place.
  const own = text.mode !== 'same' && replaceableText(motif) !== undefined;
  const only = motif.filter((p) => p.kind !== 'none');
  // A text alone is laid by the middle of its block, so every name sits the same way.
  const target = replaceableText(only);
  const block =
    own && only.length === 1 && target?.text
      ? applyToPoint(target.text.placement, target.text.centre)
      : null;
  const centre = block ?? motifCentre(only) ?? { x: 0, y: 0 };
  let n = 0;
  const entries = blanks.map((blank): SeriesEntry => {
    const out = options.excluded?.has(blank.id) ?? false;
    const index = out ? null : n++;
    const words = own && index !== null ? wordsFor(text, index) : undefined;
    const made = typeof words === 'string' ? withText(motif, words) : null;
    const parts = made?.parts ?? [...motif];
    const placement = motifPlacement(blank, options.turns?.[blank.id] ?? 0, centre);
    const state: BlankState = out ? 'excluded' : words === null ? 'unnamed' : 'cut';
    return {
      blank,
      state,
      n: index === null ? null : index + 1,
      ...(typeof words === 'string' ? { words } : {}),
      parts,
      placement,
      fits: state !== 'cut' || motifFits(parts, placement, blank, options.toolDiameter),
      missing: made?.missing ?? [],
    };
  });
  const named = entries.filter((e) => e.state !== 'excluded').length;
  return {
    entries,
    spare: own && text.mode === 'names' ? Math.max(0, text.names.length - named) : 0,
  };
}

/** The contours of one blank's motif where they are cut, with their operations (work XY). */
export function entryCuts(
  entry: Pick<SeriesEntry, 'parts' | 'placement'>,
  zero: Point,
): { contours: Contour[]; operations: Operation[] } {
  const toWork = compose(translation(-zero.x, -zero.y), entry.placement);
  const contours: Contour[] = [];
  const operations: Operation[] = [];
  for (const { contours: drawn, text: _text, ...how } of entry.parts) {
    for (const c of drawn) {
      operations.push({ ...how, contour: contours.length });
      contours.push(transformContour(c, toWork));
    }
  }
  return { contours, operations };
}

/** The file name of a series: it says what it is and how many blanks it engraves. */
export const seriesFileName = (name: string, count: number) => `${name}_serie_${count}x.nc`;

/**
 * Whether a blank fits into one camera picture with `room` mm to spare when
 * the camera stands over its middle. `picture` is the picture's size on the
 * table (mm), `turned` how the camera is turned against the machine (degrees).
 */
export function fitsPicture(
  blank: Pick<TableBlank, 'x' | 'y' | 'outline'>,
  picture: { width: number; height: number },
  turned = 0,
  room = 3,
): boolean {
  const r = (-turned * Math.PI) / 180;
  return blank.outline.every((p) => {
    const dx = p.x - blank.x;
    const dy = p.y - blank.y;
    const u = dx * Math.cos(r) - dy * Math.sin(r);
    const v = dx * Math.sin(r) + dy * Math.cos(r);
    return Math.abs(u) <= picture.width / 2 - room && Math.abs(v) <= picture.height / 2 - room;
  });
}
