import { describe, expect, it } from 'vitest';
import {
  applyToPoint,
  circle,
  compose,
  contourBounds,
  cubicPoints,
  distanceToPath,
  distanceToSegment,
  ellipsePoints,
  gridOffsets,
  IDENTITY,
  largestScale,
  mirror,
  quadraticPoints,
  rectangle,
  rotation,
  scaling,
  svgArc,
  transformContour,
  translation,
  uniformScale,
  type Point,
} from '../src';

const near = (p: Point, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 9);
  expect(p.y).toBeCloseTo(y, 9);
};

describe('moving, turning and mirroring', () => {
  it('maps points: shift, turn around a point, mirror, scale', () => {
    near(applyToPoint(IDENTITY, { x: 3, y: 4 }), 3, 4);
    near(applyToPoint(translation(10, -5), { x: 3, y: 4 }), 13, -1);
    // A quarter turn counter-clockwise: +x becomes +y.
    near(applyToPoint(rotation(90), { x: 10, y: 0 }), 0, 10);
    near(applyToPoint(rotation(-90), { x: 10, y: 0 }), 0, -10);
    near(applyToPoint(rotation(180), { x: 10, y: 5 }), -10, -5);
    near(applyToPoint(rotation(90, { x: 10, y: 10 }), { x: 20, y: 10 }), 10, 20);
    near(applyToPoint(rotation(30), { x: 10, y: 0 }), 8.660254037844387, 5);
    near(applyToPoint(mirror('x', 50), { x: 10, y: 7 }), 90, 7);
    near(applyToPoint(mirror('y'), { x: 10, y: 7 }), 10, -7);
    near(applyToPoint(scaling(2), { x: 3, y: 4 }), 6, 8);
    near(applyToPoint(scaling(2, 3), { x: 3, y: 4 }), 6, 12);
  });

  it('keeps quarter turns exact, so four of them are no change at all', () => {
    let m = IDENTITY;
    for (let i = 0; i < 4; i++) m = compose(rotation(90, { x: 12.5, y: 40 }), m);
    expect(applyToPoint(m, { x: 3.3, y: 7.1 })).toEqual({ x: 3.3, y: 7.1 });
    expect(rotation(450).b).toBe(1);
    expect(rotation(-270).a).toBe(0);
  });

  it('applies the first map first', () => {
    // Turned on the spot, then pushed away – not the other way round.
    const m = compose(translation(100, 0), rotation(90));
    near(applyToPoint(m, { x: 10, y: 0 }), 100, 10);
    const n = compose(rotation(90), translation(100, 0));
    near(applyToPoint(n, { x: 10, y: 0 }), 0, 110);
  });

  it('knows whether a map keeps circles round', () => {
    expect(uniformScale(rotation(37))).toBeCloseTo(1, 12);
    expect(uniformScale(compose(mirror('x'), scaling(2.5)))).toBeCloseTo(2.5, 12);
    expect(uniformScale(scaling(2, 3))).toBeNull();
    // A shear keeps the lengths of the axes but not the angle between them.
    expect(uniformScale({ a: 1, b: 0, c: 1, d: 1, e: 0, f: 0 })).toBeNull();
    expect(largestScale(scaling(3, 4))).toBe(5);
  });

  it('moves contours and keeps exact circles exact', () => {
    const moved = transformContour(circle(10, 20, 8), compose(translation(5, 5), rotation(90)));
    expect(moved.circle!.cx).toBeCloseTo(-15);
    expect(moved.circle!.cy).toBeCloseTo(15);
    expect(moved.circle!.r).toBe(4);
    expect(moved.closed).toBe(true);
    near(moved.points[0]!, -15, 19);
    const stretched = transformContour(circle(0, 0, 8), scaling(2, 1));
    expect(stretched.circle).toBeUndefined();
    expect(contourBounds([stretched])!.maxX).toBe(8);
    expect(contourBounds([stretched])!.maxY).toBeCloseTo(4, 1);
    const plate = transformContour({ ...rectangle(0, 0, 10, 5), layer: 'A' }, mirror('x', 0));
    expect(plate.layer).toBe('A');
    expect(plate.circle).toBeUndefined();
    expect(contourBounds([plate])).toEqual({ minX: -10, minY: 0, maxX: 0, maxY: 5 });
    expect(contourBounds([])).toBeNull();
  });

  it('lists the places of a grid of copies, row by row, without the original', () => {
    expect(gridOffsets(3, 2, 30, 20)).toEqual([
      { x: 30, y: 0 },
      { x: 60, y: 0 },
      { x: 0, y: 20 },
      { x: 30, y: 20 },
      { x: 60, y: 20 },
    ]);
    expect(gridOffsets(1, 1, 30, 20)).toEqual([]);
    expect(gridOffsets(0, -2, 30, 20)).toEqual([]);
  });

  it('measures how far a point is from a line', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
    const square = rectangle(0, 0, 10, 10).points;
    // The left edge only exists when the square is closed.
    expect(distanceToPath({ x: -1, y: 5 }, square, true)).toBe(1);
    expect(distanceToPath({ x: -1, y: 5 }, square, false)).toBeCloseTo(Math.hypot(1, 5));
    expect(distanceToPath({ x: 3, y: 4 }, [a], false)).toBe(5);
    expect(distanceToPath({ x: 3, y: 4 }, [], true)).toBe(Infinity);
  });
});

/** Largest distance of the true curve (sampled finely) from a polyline. */
function deviation(curve: (t: number) => Point, polyline: Point[]): number {
  let worst = 0;
  for (let k = 0; k <= 2000; k++) {
    worst = Math.max(worst, distanceToPath(curve(k / 2000), polyline, false));
  }
  return worst;
}

describe('curves as polylines', () => {
  it('cuts a quadratic curve finely enough for the tolerance, and no finer than needed', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: 100 };
    const p2 = { x: 100, y: 0 };
    const curve = (t: number) => ({
      x: (1 - t) ** 2 * p0.x + 2 * t * (1 - t) * p1.x + t * t * p2.x,
      y: (1 - t) ** 2 * p0.y + 2 * t * (1 - t) * p1.y + t * t * p2.y,
    });
    const fine = quadraticPoints(p0, p1, p2, 0.01);
    expect(fine.at(-1)).toEqual(p2);
    // The apex of this parabola lies half way up to the control point.
    expect(curve(0.5)).toEqual({ x: 50, y: 50 });
    expect(deviation(curve, [p0, ...fine])).toBeLessThanOrEqual(0.01);
    const coarse = quadraticPoints(p0, p1, p2, 1);
    expect(deviation(curve, [p0, ...coarse])).toBeLessThanOrEqual(1);
    expect(coarse.length).toBeLessThan(fine.length / 5);
    // Control point on the line: one straight segment.
    expect(quadraticPoints(p0, { x: 50, y: 0 }, p2, 0.01)).toEqual([p2]);
  });

  it('cuts a cubic curve within the tolerance', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 100, y: -40 },
      { x: 100, y: 40 },
    ] as const;
    const curve = (t: number) => {
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      return {
        x: p.reduce((s, q, i) => s + q.x * w[i]!, 0),
        y: p.reduce((s, q, i) => s + q.y * w[i]!, 0),
      };
    };
    const points = cubicPoints(p[0], p[1], p[2], p[3], 0.01);
    expect(points.at(-1)).toEqual(p[3]);
    expect(deviation(curve, [p[0], ...points])).toBeLessThanOrEqual(0.01);
    // By symmetry the curve passes through the middle.
    expect(curve(0.5)).toEqual({ x: 50, y: 20 });
    expect(points.length).toBeGreaterThan(40);
  });

  it('cuts an arc of an ellipse within the tolerance', () => {
    const arc = { cx: 10, cy: 20, rx: 40, ry: 15, rotation: 0, a0: 0, sweep: Math.PI };
    const points = ellipsePoints(arc, 0.01);
    near(points[0]!, 50, 20);
    near(points.at(-1)!, -30, 20);
    const curve = (t: number) => ({
      x: 10 + 40 * Math.cos(Math.PI * t),
      y: 20 + 15 * Math.sin(Math.PI * t),
    });
    expect(deviation(curve, points)).toBeLessThanOrEqual(0.01);
    // Cut for a drawing that is shown ten times larger: finer.
    expect(ellipsePoints(arc, 0.01, 10).length).toBeGreaterThan(points.length * 3);
    // Smaller than the tolerance: quarter steps are enough.
    expect(ellipsePoints({ ...arc, rx: 0.005, ry: 0.005 }, 0.01)).toHaveLength(3);
    // Turned by 90°: the long axis stands upright.
    const turned = ellipsePoints({ ...arc, rotation: Math.PI / 2, sweep: Math.PI / 2 }, 0.01);
    near(turned[0]!, 10, 60);
    near(turned.at(-1)!, -5, 20);
  });

  it('finds the centre of an SVG arc from its ends, radii and flags', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 0 };
    // A quarter circle of radius 10 has its centre 10 below or above the chord's end.
    const short = svgArc(from, 10, 10, 0, false, true, { x: 10, y: 10 })!;
    near({ x: short.cx, y: short.cy }, 0, 10);
    expect(short.sweep).toBeCloseTo(Math.PI / 2);
    const long = svgArc(from, 10, 10, 0, true, true, { x: 10, y: 10 })!;
    near({ x: long.cx, y: long.cy }, 10, 0);
    expect(long.sweep).toBeCloseTo(1.5 * Math.PI);
    const back = svgArc(from, 10, 10, 0, false, false, { x: 10, y: 10 })!;
    near({ x: back.cx, y: back.cy }, 10, 0);
    expect(back.sweep).toBeCloseTo(-Math.PI / 2);
    const longBack = svgArc(from, 10, 10, 0, true, false, { x: 10, y: 10 })!;
    expect(longBack.sweep).toBeCloseTo(-1.5 * Math.PI);
    // Radii too small for the distance grow until the arc is a half circle.
    const grown = svgArc(from, 1, 1, 0, false, true, to)!;
    expect(grown.rx).toBeCloseTo(5);
    near({ x: grown.cx, y: grown.cy }, 5, 0);
    expect(Math.abs(grown.sweep)).toBeCloseTo(Math.PI);
    // Negative radii count by their size; a turned ellipse keeps its ends.
    const turned = svgArc(from, -20, 10, 90, false, true, { x: 0, y: 40 })!;
    expect(turned.rx).toBe(20);
    const ends = ellipsePoints(turned, 0.01);
    near(ends[0]!, 0, 0);
    near(ends.at(-1)!, 0, 40);
    expect(svgArc(from, 0, 10, 0, false, true, to)).toBeNull();
    expect(svgArc(from, 10, 0, 0, false, true, to)).toBeNull();
    expect(svgArc(from, 10, 10, 0, false, true, from)).toBeNull();
  });
});
