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
 * How the holding tabs of one thing are made, where it differs from the drawing's defaults
 * (Einstellungen of the CAM): its own width, height and count, and – by hand – the places.
 * `CamItem.tabs` stays the switch; without a spec the defaults are spread evenly.
 */
export interface TabSpec {
  /** `auto`: `count` tabs evenly along every contour; `manual`: only the places in `at` */
  mode: 'auto' | 'manual';
  /** Own number of tabs per contour (automatic only); undefined takes the default */
  count?: number;
  /** Own width on the part, mm – the material that stays; undefined takes the default */
  width?: number;
  /** Own height above the bottom of the cut, mm; undefined takes the default */
  height?: number;
  /**
   * The places of a manual spec: `c` is the contour of the item (its index in `source` and
   * `contours`), `u` the fraction 0 ≤ u < 1 of that drawn contour's length from its first point –
   * so it names the same spot of the part when it is moved, turned, mirrored, copied or cut from the
   * back. When the measures of a drawn shape change the length changes with them: `carryTabs` takes
   * each place to the same share of the contour's box. In the order they were put.
   */
  at?: { c: number; u: number }[];
}

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
  /** How they are made when that differs from the drawing's defaults: own values, the places by hand */
  tabSpec?: TabSpec;
  /** Relief of the inside corners (contours and pockets) */
  relief: Relief | null;
  /** Depth of this cut, mm; undefined takes the job's depth (engraving: the engraving depth) */
  depth?: number;
  /** Climb (true) or conventional (false) milling of this part; undefined takes the job's setting */
  climb?: boolean;
  /**
   * The eye of the list: a hidden part is not cut (the program does not even mention it), is drawn
   * faint and dashed on the table, cannot be picked by a finger there and is left out of "everything"
   * – it stays in the list, where it can be selected and shown again. Only ever `true` (the key is
   * left off otherwise, so a project file stays as an older app wrote it); never on a registration hole.
   */
  hidden?: boolean;
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

/**
 * What is selected for arranging: a group, several groups (two or more – `lib/camSelect.ts` keeps one
 * of them a plain number), everything, or nothing.
 */
export type Selection = number | 'all' | readonly number[] | null;

export const place = (source: readonly Contour[], placement: Matrix): Contour[] =>
  source.map((c) => transformContour(c, placement));

export const isSelected = (item: CamItem, selected: Selection): boolean =>
  selected === 'all' ||
  (typeof selected === 'number'
    ? item.group === selected
    : selected?.includes(item.group) === true);

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
 * part stays free for moving the view. Hidden parts are never found.
 */
export function itemAt(
  all: readonly CamItem[],
  p: Point,
  tolerance: number,
  inside = true,
): CamItem | null {
  // A hidden part is out of a finger's reach: it can only be selected in the list
  const items = all.some((i) => i.hidden) ? all.filter((i) => !i.hidden) : all;
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
