/** Plane geometry for the CAM: points, closed or open polylines, and what lies inside what. */

export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  /** Polyline; for a closed contour the last point is not repeated */
  points: Point[];
  closed: boolean;
  /** Set for exact circles (DXF CIRCLE, drawn circles): drilled or cut with G2/G3 */
  circle?: { cx: number; cy: number; r: number };
  layer?: string;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Signed area: positive for counter-clockwise points. */
export function signedArea(points: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function bounds(points: readonly Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Even-odd test; points on the edge count as either. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * How many closed contours each contour lies in: 0 for outer outlines,
 * 1 for holes and cut-outs in them, 2 for islands in those, …
 */
export function nestingDepths(contours: readonly Contour[]): number[] {
  return contours.map((c, i) => {
    if (c.points.length === 0) return 0;
    const probe = c.points[0]!;
    const area = Math.abs(signedArea(c.points));
    let depth = 0;
    contours.forEach((other, j) => {
      if (j === i || !other.closed || other.points.length < 3) return;
      // A contour can only lie in a larger one.
      if (Math.abs(signedArea(other.points)) <= area) return;
      if (pointInPolygon(probe, other.points)) depth++;
    });
    return depth;
  });
}

/** Points along an arc from angle a0 sweeping by `sweep` (radians, sign = direction). */
export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  sweep: number,
  tolerance: number,
): Point[] {
  const step = r > tolerance ? 2 * Math.acos(1 - tolerance / r) : Math.PI / 2;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / step));
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (sweep * k) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Length of an open polyline, or the closed loop. */
export function pathLength(points: readonly Point[], closed: boolean): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += distance(points[i - 1]!, points[i]!);
  if (closed && points.length > 1) l += distance(points[points.length - 1]!, points[0]!);
  return l;
}

/** Distance from a point to the segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Smallest distance from a point to a polyline (with the closing segment of a loop). */
export function distanceToPath(p: Point, points: readonly Point[], closed: boolean): number {
  if (points.length === 0) return Infinity;
  let best = distance(p, points[0]!);
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    best = Math.min(best, distanceToSegment(p, points[i]!, points[(i + 1) % points.length]!));
  }
  return best;
}

/** The box around several contours; null when they hold no point. */
export function contourBounds(contours: readonly Contour[]): Bounds | null {
  const b = bounds(contours.flatMap((c) => c.points));
  return Number.isFinite(b.minX) ? b : null;
}
