import type { Contour, Point } from '@lowrider/cam';
import type { CamItem } from './camItems';

/**
 * Measuring in the drawing ("Messen"): two points on the table and what lies between them. Pure maths in table
 * coordinates (mm, y up, angles counter-clockwise from the X axis – as everywhere in the app). A point snaps to
 * what is clearly there: the corners of a part, the middle of its straight edges and the centres of its circles –
 * and to nothing otherwise, so a point that is not near such a feature stays exactly where it was put.
 */

/** How near a point must be to a feature to snap to it, CSS px – the caller turns it into mm with the view's scale */
export const MEASURE_SNAP_PX = 12;

/** A contour turns by at least this at a vertex for it to be a corner, degrees: a polygon that stands for a curve has none */
export const CORNER_DEGREES = 30;

/** A straight piece between a curve's short segments is an edge when it is this many times as long as theirs */
const EDGE_RATIO = 4;

export type FeatureKind = 'corner' | 'edge' | 'centre';

/** A place a measurement point can snap to. */
export interface Feature extends Point {
  kind: FeatureKind;
}

const length = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** How far the line turns at `b`, coming from `a` and going on to `c`, degrees (0 = straight on); null for no direction */
function turn(a: Point, b: Point, c: Point): number | null {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  if (Math.hypot(ux, uy) < 1e-9 || Math.hypot(vx, vy) < 1e-9) return null;
  const angle = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  return Math.abs((angle * 180) / Math.PI);
}

/** The features of one contour: a circle has its centre, a polyline its corners and the middles of its edges. */
export function contourFeatures(contour: Contour): Feature[] {
  if (contour.circle) return [{ x: contour.circle.cx, y: contour.circle.cy, kind: 'centre' }];
  const pts = contour.points.filter((p, i) => i === 0 || length(contour.points[i - 1]!, p) > 1e-9);
  // A closed contour does not repeat its first point, but a file may
  if (contour.closed && pts.length > 1 && length(pts[0]!, pts[pts.length - 1]!) < 1e-9) pts.pop();
  const n = pts.length;
  if (n === 0) return [];
  const closed = contour.closed && n > 2;
  const corner = pts.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return true;
    const t = turn(pts[(i + n - 1) % n]!, p, pts[(i + 1) % n]!);
    // (a turn of exactly the corner angle is a corner, whichever way the last float digit falls)
    return t !== null && t >= CORNER_DEGREES - 1e-9;
  });
  const out: Feature[] = pts.flatMap((p, i) =>
    corner[i] ? [{ ...p, kind: 'corner' as const }] : [],
  );
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % n;
    const here = length(pts[i]!, pts[j]!);
    // Between two corners it is an edge; one that goes over into a curve at an end (a rounded corner, the
    // side of a slot) is one if it is much longer than the curve's own segments
    const longer = (end: number, next: number) =>
      corner[end]! || here >= EDGE_RATIO * length(pts[end]!, pts[next]!);
    const before = closed ? (i + n - 1) % n : i - 1;
    const after = closed ? (j + 1) % n : j + 1;
    const startOk = corner[i]! || (before >= 0 && longer(i, before));
    const endOk = corner[j]! || (after < n && longer(j, after));
    if (startOk && endOk) {
      out.push({
        x: (pts[i]!.x + pts[j]!.x) / 2,
        y: (pts[i]!.y + pts[j]!.y) / 2,
        kind: 'edge',
      });
    }
  }
  return out;
}

/** The features of the parts of the drawing that are in sight: every contour of every item that is not hidden. */
export const measureFeatures = (items: readonly CamItem[]): Feature[] =>
  items.filter((i) => i.hidden !== true).flatMap((i) => i.contours.flatMap(contourFeatures));

/**
 * The feature a point at `p` snaps to: the nearest one within `reach` mm (a tie keeps the first), or null –
 * where nothing is clearly there the point stays free.
 */
export function snapMeasure(p: Point, features: readonly Feature[], reach: number): Feature | null {
  let best: Feature | null = null;
  let bestDistance = reach;
  for (const f of features) {
    const d = length(p, f);
    if (d <= bestDistance && (best === null || d < bestDistance)) {
      best = f;
      bestDistance = d;
    }
  }
  return best;
}

/** Two points and what lies between them. */
export interface Measurement {
  /** The distance, mm */
  distance: number;
  /** B − A, mm (y up: dy is positive towards the back of the table) */
  dx: number;
  dy: number;
  /** The direction from A to B, degrees counter-clockwise from the X axis, −180 < angle ≤ 180; 0 where A is B */
  angle: number;
}

export function measurement(a: Point, b: Point): Measurement {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // −0 is no angle, and the half turn is 180 whichever way the float noise falls
  const angle = deg <= -180 ? deg + 360 : deg + 0;
  return { distance: Math.hypot(dx, dy), dx: dx + 0, dy: dy + 0, angle };
}
