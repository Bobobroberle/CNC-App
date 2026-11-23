import type { Point } from './geometry';

/** Curves as polylines that stay within a tolerance of the true curve. */

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Length of p0 − 2·p1 + p2: how far a Bézier's control polygon bends. */
const bend = (p0: Point, p1: Point, p2: Point) =>
  Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y);

/** Segments needed so that the chords stay within `tolerance` of a curve with this second derivative. */
const segments = (secondDerivative: number, tolerance: number) =>
  Math.max(1, Math.min(10_000, Math.ceil(Math.sqrt(secondDerivative / (8 * tolerance)))));

/** A quadratic Bézier from p0 over the control point p1 to p2; the points after p0. */
export function quadraticPoints(p0: Point, p1: Point, p2: Point, tolerance: number): Point[] {
  const n = segments(2 * bend(p0, p1, p2), tolerance);
  const out: Point[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    out.push(lerp(lerp(p0, p1, t), lerp(p1, p2, t), t));
  }
  return out;
}

/** A cubic Bézier from p0 with the control points p1 and p2 to p3; the points after p0. */
export function cubicPoints(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
): Point[] {
  const n = segments(6 * Math.max(bend(p0, p1, p2), bend(p1, p2, p3)), tolerance);
  const out: Point[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const a = lerp(p0, p1, t);
    const b = lerp(p1, p2, t);
    const c = lerp(p2, p3, t);
    out.push(lerp(lerp(a, b, t), lerp(b, c, t), t));
  }
  return out;
}

/** An arc of an ellipse, by its centre: turned by `rotation`, from angle a0 sweeping by `sweep` (radians). */
export interface EllipseArc {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
  a0: number;
  sweep: number;
}

/**
 * Points along an arc of an ellipse, the first one included. `stretch` is
 * how much larger the arc gets before it is cut (the tolerance holds there).
 */
export function ellipsePoints(arc: EllipseArc, tolerance: number, stretch = 1): Point[] {
  const r = Math.max(arc.rx, arc.ry) * stretch;
  const step = r > tolerance ? 2 * Math.acos(1 - tolerance / r) : Math.PI / 2;
  const n = Math.max(1, Math.ceil(Math.abs(arc.sweep) / step));
  const cos = Math.cos(arc.rotation);
  const sin = Math.sin(arc.rotation);
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const a = arc.a0 + (arc.sweep * k) / n;
    const x = arc.rx * Math.cos(a);
    const y = arc.ry * Math.sin(a);
    out.push({ x: arc.cx + x * cos - y * sin, y: arc.cy + x * sin + y * cos });
  }
  return out;
}

/**
 * An SVG arc (from → to with radii, x-axis rotation in degrees and the two
 * flags) by its centre, after the SVG implementation notes. Null where SVG
 * draws a straight line instead (a radius of zero) or nothing (same ends).
 */
export function svgArc(
  from: Point,
  rx: number,
  ry: number,
  degrees: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): EllipseArc | null {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0 || (from.x === to.x && from.y === to.y)) return null;
  const rotation = (degrees * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  // Radii too small to span the ends are scaled up until they just do.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const a0 = Math.atan2((y1 - cy1) / ry, (x1 - cx1) / rx);
  const a1 = Math.atan2((-y1 - cy1) / ry, (-x1 - cx1) / rx);
  let delta = a1 - a0;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  return {
    cx: cos * cx1 - sin * cy1 + (from.x + to.x) / 2,
    cy: sin * cx1 + cos * cy1 + (from.y + to.y) / 2,
    rx,
    ry,
    rotation,
    a0,
    sweep: delta,
  };
}
