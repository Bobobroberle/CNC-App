import type { Contour, Point } from './geometry';

/**
 * An affine map of the plane, written like SVG and canvas do:
 * x' = a·x + c·y + e, y' = b·x + d·y + f.
 */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** The map that applies `first` and then `then`. */
export function compose(then: Matrix, first: Matrix): Matrix {
  return {
    a: then.a * first.a + then.c * first.b,
    b: then.b * first.a + then.d * first.b,
    c: then.a * first.c + then.c * first.d,
    d: then.b * first.c + then.d * first.d,
    e: then.a * first.e + then.c * first.f + then.e,
    f: then.b * first.e + then.d * first.f + then.f,
  };
}

export const translation = (dx: number, dy: number): Matrix => ({ ...IDENTITY, e: dx, f: dy });

/** Rotation by `degrees` counter-clockwise around a point. */
export function rotation(degrees: number, about: Point = { x: 0, y: 0 }): Matrix {
  // Quarter turns stay exact: a part turned four times is back where it was.
  const quarter = (((degrees / 90) % 4) + 4) % 4;
  const exact = Number.isInteger(quarter);
  const rad = (degrees * Math.PI) / 180;
  const cos = exact ? [1, 0, -1, 0][quarter]! : Math.cos(rad);
  const sin = exact ? [0, 1, 0, -1][quarter]! : Math.sin(rad);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: about.x - cos * about.x + sin * about.y,
    f: about.y - sin * about.x - cos * about.y,
  };
}

/** Scaling around the origin. */
export const scaling = (sx: number, sy: number = sx): Matrix => ({ ...IDENTITY, a: sx, d: sy });

/**
 * Mirror image: `'x'` flips left and right across the vertical line x = at,
 * `'y'` flips up and down across the horizontal line y = at.
 */
export function mirror(axis: 'x' | 'y', at = 0): Matrix {
  return axis === 'x' ? { ...IDENTITY, a: -1, e: 2 * at } : { ...IDENTITY, d: -1, f: 2 * at };
}

/** The map that undoes `m`; null when `m` squeezes the plane flat. */
export function invert(m: Matrix): Matrix | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** Scaling by `kx`, `ky` that leaves the point `about` where it is. */
export const scalingAbout = (kx: number, ky: number, about: Point): Matrix => ({
  ...IDENTITY,
  a: kx,
  d: ky,
  e: about.x * (1 - kx),
  f: about.y * (1 - ky),
});

export function applyToPoint(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** The factor by which the map stretches lengths, if it stretches all of them alike; else null. */
export function uniformScale(m: Matrix): number | null {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  const square = Math.abs(m.a * m.c + m.b * m.d) <= 1e-9 * sx * sy;
  return square && Math.abs(sx - sy) <= 1e-9 * Math.max(sx, sy) ? sx : null;
}

/** The largest factor by which the map stretches a length (an upper bound is enough for tolerances). */
export function largestScale(m: Matrix): number {
  return Math.hypot(m.a, m.b, m.c, m.d);
}

/**
 * A contour moved, turned, mirrored or scaled. An exact circle stays one as
 * long as the map keeps it round.
 */
export function transformContour(c: Contour, m: Matrix): Contour {
  const k = uniformScale(m);
  const centre = c.circle && applyToPoint(m, { x: c.circle.cx, y: c.circle.cy });
  const { circle: _circle, ...rest } = c;
  return {
    ...rest,
    points: c.points.map((p) => applyToPoint(m, p)),
    ...(c.circle && centre && k !== null
      ? { circle: { cx: centre.x, cy: centre.y, r: c.circle.r * k } }
      : {}),
  };
}

/**
 * Offsets of the copies in a grid of `columns` × `rows` with the given
 * pitch: every cell but the first, row by row.
 */
export function gridOffsets(
  columns: number,
  rows: number,
  pitchX: number,
  pitchY: number,
): Point[] {
  const out: Point[] = [];
  for (let j = 0; j < Math.max(1, Math.round(rows)); j++) {
    for (let i = 0; i < Math.max(1, Math.round(columns)); i++) {
      if (i + j > 0) out.push({ x: i * pitchX, y: j * pitchY });
    }
  }
  return out;
}
