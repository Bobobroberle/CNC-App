import { arcPoints, distance, type Contour, type Point } from './geometry';

const TOL = 0.01;

/**
 * How far a curve made of straight pieces may lie from the true curve, mm. Every arc and curve of this
 * file (circle, rounded corners, ellipse, gear, spiral) is held to it: no chord is further from its curve.
 */
export const CURVE_TOLERANCE = TOL;

/**
 * The corner radii of a rectangle, mm: lower left, lower right, upper right, upper left – counter-clockwise
 * from the lower left, y up, the way the contours run (`[0, 0, 10, 10]` rounds the two upper corners).
 */
export type Radii = readonly [number, number, number, number];

/**
 * Rectangle from its lower left corner, with an optional corner radius – one number for all four corners,
 * or four (`Radii`). A radius is held between 0 and half the shorter side, so the arcs of two corners never
 * run into each other along a side. A corner of radius 0 is one point; the contour of rounded corners
 * starts where the lower right corner's arc starts (the end of the bottom side) and runs counter-clockwise;
 * four equal radii are that one radius, point for point.
 */
export function rectangle(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number | Radii = 0,
): Contour {
  if (typeof radius !== 'number' && radius.some((v) => v !== radius[0])) {
    return roundedCorners(x, y, w, h, radius);
  }
  const r = Math.max(0, Math.min(typeof radius === 'number' ? radius : radius[0], w / 2, h / 2));
  if (r === 0) {
    return {
      closed: true,
      points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
    };
  }
  const q = Math.PI / 2;
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -q],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, q],
    [x + r, y + r, 2 * q],
  ];
  const points: Point[] = corners.flatMap(([cx, cy, a]) => arcPoints(cx, cy, r, a, q, TOL));
  return { closed: true, points };
}

/** A rectangle whose corners differ in their radii (see `rectangle`) */
function roundedCorners(x: number, y: number, w: number, h: number, radii: Radii): Contour {
  const limit = Math.min(w, h) / 2;
  const [ll, lr, ur, ul] = radii.map((v) => Math.max(0, Math.min(v, limit))) as [
    number,
    number,
    number,
    number,
  ];
  const q = Math.PI / 2;
  // The corner, the way from it to the arc's centre (in radii), the radius and the angle its arc starts at
  const corners: [number, number, number, number, number, number][] = [
    [x + w, y, -1, 1, lr, -q],
    [x + w, y + h, -1, -1, ur, 0],
    [x, y + h, 1, -1, ul, q],
    [x, y, 1, 1, ll, 2 * q],
  ];
  const made = corners.flatMap(([px, py, sx, sy, r, a]) =>
    r === 0 ? [{ x: px, y: py }] : arcPoints(px + sx * r, py + sy * r, r, a, q, TOL),
  );
  // Radii that fill a side leave no straight piece: the arcs then meet in one point, kept once
  const points = made.filter(
    (p, i) => distance(p, made[(i + made.length - 1) % made.length]!) > 1e-9,
  );
  return { closed: true, points };
}

/** Circle around its centre. */
export function circle(cx: number, cy: number, diameter: number): Contour {
  const r = diameter / 2;
  const points = arcPoints(cx, cy, r, 0, 2 * Math.PI, TOL);
  points.pop();
  return { closed: true, points, circle: { cx, cy, r } };
}

/** Slot (long hole) from centre, length end to end, width, angle in degrees. */
export function slot(cx: number, cy: number, length: number, width: number, angle = 0): Contour {
  const r = width / 2;
  const half = Math.max(0, length / 2 - r);
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a) * half;
  const dy = Math.sin(a) * half;
  const points = [
    ...arcPoints(cx + dx, cy + dy, r, a - Math.PI / 2, Math.PI, TOL),
    ...arcPoints(cx - dx, cy - dy, r, a + Math.PI / 2, Math.PI, TOL),
  ];
  return { closed: true, points };
}

/** The most the line of an ellipse turns at one of its points, degrees (the points of a curve, not corners) */
export const ELLIPSE_TURN = 15;
/** Most points of an ellipse that the turn asks for – the chord tolerance may ask for more, never less */
const ELLIPSE_POINTS = 4096;

/**
 * Ellipse around its centre, the radii along x and y – a CURVE made of straight pieces: it has no corners.
 * The points are evenly spread in the angle round the middle and a multiple of four, so the polygon has the
 * ellipse's own box and is mirror-symmetric about both axes; it starts at the right end of the x axis and
 * runs counter-clockwise. Two things bound the step. No chord lies further than `CURVE_TOLERANCE` from the
 * ellipse (the step of a circle of the larger radius: an ellipse is a circle squeezed along one axis, so
 * its chords sag no more). And the line turns by at most `ELLIPSE_TURN` degrees at any point – the turn is
 * greatest at the ends of the long axis, 2·atan((long / short) · tan(step / 2)) – so that a vertex of it is
 * never mistaken for a corner (`cornerWays` asks for 20°, the measuring tool for 30°). The turn costs
 * points only up to 4096 (the chord tolerance alone never needs more than about 1100, at the largest
 * radius the sketch allows): an ellipse thinner than about
 * 1 : 170 has tips tighter than that and turns by more than `ELLIPSE_TURN` there, from about 1 : 230 by 20° or
 * more – then `cornerWays` does report the two tips as corners, and rightly so for a cutter (the radius of a
 * tip is short² / long: 0.25 mm × 0.25 mm / 2500 mm is a needle). Equal radii are a circle: the exact one,
 * with `circle` set.
 */
export function ellipse(cx: number, cy: number, rx: number, ry: number): Contour {
  if (rx === ry) return circle(cx, cy, 2 * rx);
  const big = Math.max(rx, ry);
  const small = Math.min(rx, ry);
  const round = 2 * Math.PI;
  const chordStep = big > TOL ? 2 * Math.acos(1 - TOL / big) : Math.PI / 2;
  const turnStep = 2 * Math.atan(Math.tan((ELLIPSE_TURN * Math.PI) / 360) * (small / big));
  const wanted = Math.max(
    Math.ceil(round / chordStep),
    Math.min(Math.ceil(round / turnStep), ELLIPSE_POINTS),
  );
  const n = 4 * Math.ceil(wanted / 4);
  const points: Point[] = [];
  for (let k = 0; k < n; k++) {
    const t = (round * k) / n;
    points.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return { closed: true, points };
}

/**
 * Star with `points` tips on the circle of radius `outer` and as many notches on the circle of radius
 * `inner`, counted round from the first tip, which points up (+y): 2 · `points` corners, counter-clockwise
 * from that tip. Its area is points · outer · inner · sin(π / points).
 */
export function star(
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number,
): Contour {
  const made: Point[] = [];
  for (let k = 0; k < 2 * points; k++) {
    const r = k % 2 === 0 ? outer : inner;
    const a = (k * Math.PI) / points;
    made.push({ x: cx - r * Math.sin(a), y: cy + r * Math.cos(a) });
  }
  return { closed: true, points: made };
}

/**
 * A toothed wheel, NOT an involute gear: the teeth are plain trapezoids – a flat side from the root
 * circle (radius `root`) up to the tip circle (radius `outer`), a base of half the pitch at the root and a tip
 * of a quarter of it – with the tips and the floors between the teeth as arcs of their circles. Such teeth
 * look like gear teeth and cut as a toothed wheel, a sprocket or a knob; they do not roll on each other,
 * so two of them are not a gear train. The first tooth stands up (+y); the contour runs counter-clockwise
 * from the right end of that tip (the one at the smaller angle). Needs `teeth` ≥ 1 and `root` ≤ `outer`.
 */
export function gear(cx: number, cy: number, teeth: number, outer: number, root: number): Contour {
  const pitch = (2 * Math.PI) / teeth;
  const points: Point[] = [];
  for (let k = 0; k < teeth; k++) {
    // Where the tooth's middle lies, round from the +x axis
    const middle = Math.PI / 2 + k * pitch;
    points.push(
      ...arcPoints(cx, cy, outer, middle - pitch / 8, pitch / 4, TOL),
      ...arcPoints(cx, cy, root, middle + pitch / 4, pitch / 2, TOL),
    );
  }
  return { closed: true, points };
}

/** The most a spiral's angle advances from one point to the next, radians (7.5°) */
const SPIRAL_STEP = Math.PI / 24;

/**
 * An Archimedean spiral – the radius grows evenly with the angle – as an OPEN contour (an engraving line):
 * `turns` turns counter-clockwise from the +x axis, from the radius `start` at the first point to `end` at
 * the last (a larger `start` is a spiral inwards). The steps are as long as the tolerance allows: the line
 * is never further than `CURVE_TOLERANCE` from the spiral (a chord strays at most step² · |p''| / 8 and
 * |p''| ≤ the larger radius + 2 · the growth per radian) – and never more than 7.5° of angle, so that the
 * heading changes by at most 15° from one chord to the next (it turns twice as fast as the angle in the
 * middle).
 */
export function spiral(cx: number, cy: number, turns: number, start: number, end: number): Contour {
  const total = 2 * Math.PI * turns;
  const growth = Math.abs(end - start) / total;
  const far = Math.max(start, end);
  const step = Math.min(Math.sqrt((8 * TOL) / (far + 2 * growth)), SPIRAL_STEP);
  const n = Math.ceil(total / step);
  const points: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const angle = (total * k) / n;
    const r = start + ((end - start) * k) / n;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return { closed: false, points };
}

/** Holes in a grid: columns × rows with a pitch, starting at the first hole's centre. */
export function holeGrid(
  x: number,
  y: number,
  diameter: number,
  columns: number,
  rows: number,
  pitchX: number,
  pitchY: number,
): Contour[] {
  const out: Contour[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) out.push(circle(x + i * pitchX, y + j * pitchY, diameter));
  }
  return out;
}
