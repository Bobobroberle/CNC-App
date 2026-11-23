import { pointInPolygon, signedArea, type Bounds, type Contour, type Point } from './geometry';
import {
  intersectPolygons,
  offsetPolygons,
  polygonsArea,
  region,
  strokeLine,
  subtractPolygons,
  unitePolygons,
} from './offset';
import { circle } from './shapes';
import type { OperationKind } from './toolpath';
import { applyToPoint, mirror, transformContour, type Matrix } from './transform';

/**
 * Machining a part from both sides. The drawing shows everything as seen
 * from the front, like looking through glass; the part is then turned over
 * a line on the table (the flip line) and what belongs to the back is cut
 * as its mirror image about that line.
 */

export type Side = 'front' | 'back';

/**
 * How the part is turned over, named like `mirror`: `'x'` like the page of
 * a book (left and right swap, the flip line runs front to back), `'y'` over
 * its front edge (front and back swap, the flip line runs left to right).
 */
export type FlipAxis = 'x' | 'y';

export interface Flip {
  axis: FlipAxis;
  /** Where the flip line lies: its x for `'x'`, its y for `'y'`, work mm */
  at: number;
}

/** The two registration holes, where they are drilled from the front (work mm). */
export interface Registration {
  a: Point;
  b: Point;
}

/** Where a point of the part lies on the table once the part is turned over (and back again). */
export const flipMatrix = (flip: Flip): Matrix => mirror(flip.axis, flip.at);

export const flipPoint = (flip: Flip, p: Point): Point => applyToPoint(flipMatrix(flip), p);

/** Contours drawn as seen from the front, as they lie on the table with the back up. */
export const flipContours = (contours: readonly Contour[], flip: Flip): Contour[] =>
  contours.map((c) => transformContour(c, flipMatrix(flip)));

/** The flip line runs through the middle between the two holes. */
export function flipFor(axis: FlipAxis, holes: Registration): Flip {
  return { axis, at: axis === 'x' ? (holes.a.x + holes.b.x) / 2 : (holes.a.y + holes.b.y) / 2 };
}

/**
 * How the holes lie to the flip line: `across` (one on each side, they swap
 * places when the part is turned), `along` (both on the line, each stays) or
 * `askew` – then the turned part does not fit onto two pins.
 */
export function registrationLayout(
  axis: FlipAxis,
  holes: Registration,
  tolerance = 0.01,
): 'across' | 'along' | 'askew' {
  const dx = Math.abs(holes.a.x - holes.b.x);
  const dy = Math.abs(holes.a.y - holes.b.y);
  const [onLine, offLine] = axis === 'x' ? [dx, dy] : [dy, dx];
  if (offLine <= tolerance) return 'across';
  return onLine <= tolerance ? 'along' : 'askew';
}

/**
 * A hole that was moved, brought in line with the other one: level with it
 * or straight above it, whichever is nearer. Either way the pair fits the
 * flip line through its middle.
 */
export function alignRegistration(moved: Point, other: Point): Point {
  return Math.abs(moved.y - other.y) <= Math.abs(moved.x - other.x)
    ? { x: moved.x, y: other.y }
    : { x: other.x, y: moved.y };
}

/** The holes as the back program sees them: where they lie once the part is turned in place. */
export function flippedRegistration(flip: Flip, holes: Registration): Registration {
  return { a: flipPoint(flip, holes.a), b: flipPoint(flip, holes.b) };
}

/** Counter-clockwise turn (degrees) and shift of a map that only turns and shifts. */
export function poseOf(m: Matrix): { rotation: number; offset: Point } {
  return { rotation: (Math.atan2(m.b, m.a) * 180) / Math.PI, offset: { x: m.e, y: m.f } };
}

/**
 * Where the two holes lie on the table (machine XY) once the part has been
 * turned over on the spot: hole 1 is the one the front drilled first.
 * `zero` is the machine XY of the work zero the front was cut with, `pose`
 * how its program had been turned and shifted on the table before it ran
 * (aligned to an edge): the flip line turned with it.
 */
export function flippedOnTable(
  flip: Flip,
  holes: Registration,
  zero: Point,
  pose: Matrix,
): Registration {
  const onTable = (p: Point) => {
    const q = applyToPoint(pose, p);
    return { x: zero.x + q.x, y: zero.y + q.y };
  };
  const back = flippedRegistration(flip, holes);
  return { a: onTable(back.a), b: onTable(back.b) };
}

const inBounds = (p: Point, r: number, b: Bounds) =>
  p.x - r >= b.minX && p.x + r <= b.maxX && p.y - r >= b.minY && p.y + r <= b.maxY;

/**
 * Two registration holes for a part with the box `part`: far apart, beside
 * the part with `clearance` between its box and the hole centres, one on
 * each side of the flip line through the middle of the part. If there is no
 * room for them there (`fits`: on the stock, clear of the clamps) but there
 * is at the ends of the flip line, they go there.
 */
export function proposeRegistration(
  part: Bounds,
  axis: FlipAxis,
  clearance: number,
  fits: (holes: Registration) => boolean = () => true,
): Registration {
  const cx = (part.minX + part.maxX) / 2;
  const cy = (part.minY + part.maxY) / 2;
  const sideways: Registration = {
    a: { x: part.minX - clearance, y: cy },
    b: { x: part.maxX + clearance, y: cy },
  };
  const lengthways: Registration = {
    a: { x: cx, y: part.minY - clearance },
    b: { x: cx, y: part.maxY + clearance },
  };
  const [across, along] = axis === 'x' ? [sideways, lengthways] : [lengthways, sideways];
  return !fits(across) && fits(along) ? along : across;
}

/** Whether a round hole lies in none of the boxes (clamps, with the room they need around them). */
export function clearOfBoxes(hole: Point, radius: number, boxes: readonly Bounds[]): boolean {
  return boxes.every(
    (b) =>
      hole.x + radius <= b.minX ||
      hole.x - radius >= b.maxX ||
      hole.y + radius <= b.minY ||
      hole.y - radius >= b.maxY,
  );
}

/** Whether a round hole lies on the stock with all of its rim. */
export const onStock = (hole: Point, radius: number, stock: Bounds): boolean =>
  inBounds(hole, radius, stock);

/** Dowel pins come in these diameters, mm */
const PIN_SIZES = [6, 8, 10, 12];

/**
 * Diameter of the registration holes for a cutter: the cutter's own where
 * that is a pin size (plunged), else the next pin size up (bored in a helix).
 */
export function registrationDiameter(toolDiameter: number): number {
  return PIN_SIZES.find((d) => d >= toolDiameter - 0.05) ?? toolDiameter;
}

/** How far the holes are drilled past the material: just through it, mm */
export const REGISTRATION_THROUGH = 0.5;
/** How deep the holes go into the spoilboard for pins, mm */
export const PIN_DEPTH = 6;

/**
 * Depth of the registration holes from the front surface: through the
 * material so the camera sees them from the back, or on into the spoilboard
 * where the pins stand.
 */
export function registrationDepth(thickness: number, method: 'camera' | 'pins'): number {
  return thickness + (method === 'pins' ? PIN_DEPTH : REGISTRATION_THROUGH);
}

// ---------- what the two sides do to each other ----------

/** One cut of the drawing, as drawn (seen from the front). */
export interface SidedCut {
  /** For naming it: its row in the drawing's list */
  row: number;
  side: Side;
  kind: OperationKind;
  contours: readonly Contour[];
  /** From the surface of its side, mm */
  depth: number;
  tabs: boolean;
}

/**
 * What the cutter takes away, seen from above: the hole, the pocket, or the
 * band along a contour (inside it, outside it, on it). Contours that cannot
 * be cut that way take nothing away.
 */
export function cutFootprint(
  kind: OperationKind,
  contours: readonly Contour[],
  toolDiameter: number,
): Point[][] {
  const r = toolDiameter / 2;
  const parts = contours.flatMap((c): Point[][] => {
    if (kind === 'none' || c.points.length < 2) return [];
    if (!c.closed) return kind === 'on' ? strokeLine(c.points, r) : [];
    const outline = region(c.points, []);
    switch (kind) {
      case 'drill':
        return c.circle
          ? [circle(c.circle.cx, c.circle.cy, 2 * Math.max(c.circle.r, r)).points]
          : [];
      case 'pocket':
        return outline;
      case 'inside':
        return subtractPolygons(outline, offsetPolygons(outline, -toolDiameter));
      case 'outside':
        return subtractPolygons(offsetPolygons(outline, toolDiameter), outline);
      default:
        return subtractPolygons(offsetPolygons(outline, r), offsetPolygons(outline, -r));
    }
  });
  return parts.length > 1 ? unitePolygons(parts) : parts;
}

export type FlipNote =
  /** Front and back meet on purpose (the same shape from both sides), `left` ≤ 0 */
  | { code: 'meet'; front: number; back: number; left: number }
  /** Front and back together cut through where they overlap, `left` ≤ 0 */
  | { code: 'through'; front: number; back: number; left: number }
  /** Less than a millimetre is left between them */
  | { code: 'thin'; front: number; back: number; left: number }
  /** The outline is cut free on the front without tabs: the part leaves the registration holes */
  | { code: 'loose'; front: number };

/** Less material than this between front and back is worth a warning, mm */
export const THIN_FLOOR = 1;
/** Overlaps smaller than this are a touch, not a cut, mm² */
const TOUCH = 0.5;
/** Two cuts are the same shape when they share this much of each */
const SAME = 0.8;

/**
 * What the cuts of the two sides do to each other in material of the given
 * thickness: where a front and a back cut overlap, their depths are added.
 * A cut that goes through on its own is the operator's plain choice and not
 * compared.
 */
export function checkSides(
  cuts: readonly SidedCut[],
  thickness: number,
  toolDiameter: number,
): FlipNote[] {
  const notes: FlipNote[] = [];
  const shaped = cuts
    .filter((c) => c.kind !== 'none')
    .map((c) => {
      const footprint = cutFootprint(c.kind, c.contours, toolDiameter);
      return { ...c, footprint, area: polygonsArea(footprint) };
    });
  for (const f of shaped) {
    if (f.side !== 'front') continue;
    if (f.kind === 'outside' && f.depth >= thickness && !f.tabs) {
      notes.push({ code: 'loose', front: f.row });
    }
    if (f.depth >= thickness) continue;
    for (const b of shaped) {
      if (b.side !== 'back' || b.depth >= thickness) continue;
      const left = thickness - f.depth - b.depth;
      if (left >= THIN_FLOOR) continue;
      const shared = polygonsArea(intersectPolygons(f.footprint, b.footprint));
      if (shared < TOUCH) continue;
      const same = shared >= SAME * f.area && shared >= SAME * b.area;
      notes.push({
        code: left > 0 ? 'thin' : same ? 'meet' : 'through',
        front: f.row,
        back: b.row,
        left,
      });
    }
  }
  return notes;
}

/** Why a registration hole is in a bad place. */
export type HoleTrouble = 'on-cut' | 'in-part' | 'off-stock';

/** Room kept between a registration hole and any cut, mm */
export const HOLE_CLEARANCE = 2;

/**
 * Whether a registration hole (as drawn, with its diameter) lies well: clear
 * of every cut of both sides, not inside a part, and on the stock if that is
 * known. Null when it does.
 */
export function checkRegistrationHole(
  hole: Point,
  diameter: number,
  cuts: readonly SidedCut[],
  toolDiameter: number,
  stock?: Bounds | null,
): HoleTrouble | null {
  const disc = [circle(hole.x, hole.y, diameter + 2 * HOLE_CLEARANCE).points];
  for (const c of cuts) {
    const hit = intersectPolygons(disc, cutFootprint(c.kind, c.contours, toolDiameter));
    if (polygonsArea(hit) > 0) return 'on-cut';
  }
  // The smallest outline around the hole decides: a part, or a cut-out in one (waste).
  let around: { kind: OperationKind; area: number } | null = null;
  for (const c of cuts) {
    if (c.kind !== 'outside' && c.kind !== 'inside') continue;
    for (const contour of c.contours) {
      const area = Math.abs(signedArea(contour.points));
      if (
        contour.closed &&
        pointInPolygon(hole, contour.points) &&
        area < (around?.area ?? Infinity)
      ) {
        around = { kind: c.kind, area };
      }
    }
  }
  if (around?.kind === 'outside') return 'in-part';
  return stock && !inBounds(hole, diameter / 2, stock) ? 'off-stock' : null;
}
