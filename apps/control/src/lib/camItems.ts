import {
  bounds,
  distanceToPath,
  pointInPolygon,
  signedArea,
  transformContour,
  type Bounds,
  type Contour,
  type Matrix,
  type OperationKind,
  type Point,
  type Relief,
  type Side,
  type Sketch,
  type TextOptions,
} from '@lowrider/cam';

/**
 * One thing of the drawing: a shape, a text, a contour of an imported file.
 * It keeps what was added (`source`) and where that lies now (`placement`),
 * so moving, turning and mirroring never wear the geometry out.
 */
export interface CamItem {
  id: number;
  /** Items that came in together (a file, a copy of it) are picked and moved together */
  group: number;
  /** The words of an engraved text */
  text?: string;
  /**
   * How that text was set and where the middle of its block lies in
   * `source`: a series sets other words in its place on every blank.
   */
  textStyle?: { options: TextOptions; centre: Point };
  /**
   * What was drawn, by its own measures (a rectangle's width, a text's
   * words): `source` is made from it, around the sketch's own origin, and
   * made anew when a measure changes. A contour from a file has none.
   */
  sketch?: Sketch;
  source: Contour[];
  placement: Matrix;
  /** `source` where it lies now, work mm */
  contours: Contour[];
  kind: OperationKind;
  /** Holding tabs (outside and inside cuts) */
  tabs: boolean;
  /** Relief of the inside corners (contours and pockets) */
  relief: Relief | null;
  /** Depth of this cut, mm; undefined takes the job's depth (engraving: the engraving depth) */
  depth?: number;
  /** Climb (true) or conventional (false) milling of this part; undefined takes the job's setting */
  climb?: boolean;
  /**
   * The side it is cut from when the part is machined from both; the
   * drawing shows either as seen from the front.
   */
  side: Side;
  /** One of the two registration holes of a part machined from both sides (hole 1 or 2) */
  registration?: 1 | 2;
}

/** The things to be made, without the registration holes that help to make them. */
export const partsOf = (items: readonly CamItem[]): CamItem[] =>
  items.filter((i) => i.registration === undefined);

/** Where a registration hole is drilled (work XY). */
export const holeCentre = (item: CamItem): Point => {
  const c = item.contours[0]!.circle!;
  return { x: c.cx, y: c.cy };
};

/** What is selected for arranging: a group, everything, or nothing. */
export type Selection = number | 'all' | null;

export const place = (source: readonly Contour[], placement: Matrix): Contour[] =>
  source.map((c) => transformContour(c, placement));

export const isSelected = (item: CamItem, selected: Selection): boolean =>
  selected === 'all' || item.group === selected;

/** The box around contours, or null when they hold no point. */
export function contoursBox(contours: readonly Contour[]): Bounds | null {
  const b = bounds(
    contours.flatMap((c) => {
      if (!c.circle) return c.points;
      // A circle is as wide as it is, not as its polygon happens to be.
      const { cx, cy, r } = c.circle;
      return [...c.points, { x: cx - r, y: cy - r }, { x: cx + r, y: cy + r }];
    }),
  );
  return Number.isFinite(b.minX) ? b : null;
}

/** The box around items, or null when they hold no point. */
export const itemsBounds = (items: readonly CamItem[]): Bounds | null =>
  contoursBox(items.flatMap((i) => i.contours));

const inBox = (p: Point, b: Bounds, grow: number) =>
  p.x >= b.minX - grow && p.x <= b.maxX + grow && p.y >= b.minY - grow && p.y <= b.maxY + grow;

/**
 * What a finger at `p` means: the item whose line is nearest within the
 * finger's radius; else a text whose box it is in (letters are mostly gaps);
 * else – for a tap, not for taking hold (`inside`) – the smallest closed
 * shape it is inside of. Taking hold needs a line: the inside of a large
 * part stays free for moving the view.
 */
export function itemAt(
  items: readonly CamItem[],
  p: Point,
  tolerance: number,
  inside = true,
): CamItem | null {
  let best: CamItem | null = null;
  let bestDistance = tolerance;
  for (const item of items) {
    for (const c of item.contours) {
      const d = distanceToPath(p, c.points, c.closed);
      if (d <= bestDistance) {
        best = item;
        bestDistance = d;
      }
    }
  }
  if (best) return best;
  for (const item of items) {
    const b = item.text === undefined ? null : itemsBounds([item]);
    if (b && inBox(p, b, tolerance / 2)) return item;
  }
  if (!inside) return null;
  let bestArea = Infinity;
  for (const item of items) {
    for (const c of item.contours) {
      const area = Math.abs(signedArea(c.points));
      if (c.closed && area < bestArea && pointInPolygon(p, c.points)) {
        best = item;
        bestArea = area;
      }
    }
  }
  return best;
}
