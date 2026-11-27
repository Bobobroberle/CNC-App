import { describe, expect, it } from 'vitest';
import {
  CURVE_TOLERANCE,
  ELLIPSE_TURN,
  circle,
  contourBounds,
  cornerWays,
  distanceToPath,
  ellipse,
  gear,
  pathLength,
  rectangle,
  signedArea,
  slot,
  spiral,
  star,
  tabSites,
  type Contour,
  type Point,
} from '../src';

/**
 * The shapes of the library, checked against numbers worked out by hand: areas and perimeters from
 * formulas, vertex counts from the chord step of an arc (`2·acos(1 − tolerance / radius)`, 0.01 mm), boxes
 * from the angles. A polygon made of chords lies inside its curve, so its area is a little below the curve's:
 * never by more than the tolerance times the length of the curved part.
 */

const area = (c: Contour) => Math.abs(signedArea(c.points));
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
const key = (p: Point) => `${r6(p.x)},${r6(p.y)}`;
const keys = (c: Contour) => new Set(c.points.map(key));
const box = (c: Contour) => contourBounds([c])!;
/** How far the line turns at a point, degrees: the point's own neighbours, round a closed line */
const turns = (pts: readonly Point[], closed: boolean) =>
  pts.flatMap((b, i) => {
    const a = pts[(i + pts.length - 1) % pts.length]!;
    const c = pts[(i + 1) % pts.length]!;
    if (!closed && (i === 0 || i === pts.length - 1)) return [];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    return [Math.abs((Math.atan2(cross, dot) * 180) / Math.PI)];
  });
const mirrored = (c: Contour, f: (p: Point) => Point) => {
  const own = keys(c);
  return c.points.every((p) => own.has(key(f(p))));
};

describe('a rectangle with a radius for each corner', () => {
  it('is the single radius, point for point, where the four are equal', () => {
    expect(rectangle(0, 0, 100, 60, [8, 8, 8, 8])).toEqual(rectangle(0, 0, 100, 60, 8));
    // Four radii of 0 are the plain rectangle, from its lower left corner
    expect(rectangle(0, 0, 100, 60, [0, 0, 0, 0])).toEqual(rectangle(0, 0, 100, 60));
    expect(rectangle(0, 0, 100, 60).points[0]).toEqual({ x: 0, y: 0 });
    // The single radius is as it always was: starts where the lower right arc starts
    expect(rectangle(0, 0, 100, 60, 10).points[0]).toEqual({ x: 90, y: 0 });
  });

  it('rounds the two upper corners: [0, 0, 10, 10] on 100 × 60', () => {
    const c = rectangle(0, 0, 100, 60, [0, 0, 10, 10]);
    // An arc of 10 mm over a quarter turn: step 2·acos(1 − 0.001) = 0.0894 rad, 18 steps, 19 points. The two
    // sharp corners are one point each: 1 + 19 + 19 + 1.
    expect(c.points).toHaveLength(40);
    // From the lower right corner, counter-clockwise: up its side to where the upper right arc starts
    expect(c.points[0]).toEqual({ x: 100, y: 0 });
    expect(c.points[1]!.x).toBeCloseTo(100, 9);
    expect(c.points[1]!.y).toBeCloseTo(50, 9);
    expect(c.points[19]!.x).toBeCloseTo(90, 9);
    expect(c.points[19]!.y).toBeCloseTo(60, 9);
    expect(c.points[20]!.x).toBeCloseTo(10, 9);
    expect(c.points[20]!.y).toBeCloseTo(60, 9);
    expect(c.points[38]!.x).toBeCloseTo(0, 9);
    expect(c.points[38]!.y).toBeCloseTo(50, 9);
    expect(c.points[39]).toEqual({ x: 0, y: 0 });
    const b = box(c);
    expect([b.minX, b.minY, b.maxX, b.maxY].map(r6)).toEqual([0, 0, 100, 60]);
    // 6000 − 2 · (10² − π · 10² / 4) = 5957.0796; the chords leave out at most 0.01 × the two arcs' 31.4 mm
    expect(signedArea(c.points)).toBeLessThanOrEqual(5957.0796327 + 1e-9);
    expect(signedArea(c.points)).toBeGreaterThan(5957.0796327 - 0.01 * 31.42);
    expect(c.circle).toBeUndefined();
  });

  it('holds each radius to half the shorter side', () => {
    // 100 × 20: 50 is held to 10. The lower left arc then runs from (0, 10) round to (10, 0).
    const c = rectangle(0, 0, 100, 20, [50, 0, 0, 0]);
    expect(c.points).toHaveLength(1 + 1 + 1 + 19);
    expect(c.points.slice(0, 3)).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 20 },
      { x: 0, y: 20 },
    ]);
    expect(c.points[3]!.x).toBeCloseTo(0, 9);
    expect(c.points[3]!.y).toBeCloseTo(10, 9);
    expect(c.points[21]!.x).toBeCloseTo(10, 9);
    expect(c.points[21]!.y).toBeCloseTo(0, 9);
    // Never negative: a negative radius is a sharp corner. The one arc of 5 mm: step 0.1265 rad, 13 steps,
    // 14 points, and three sharp corners
    expect(rectangle(0, 0, 100, 20, [-5, 0, 0, 5]).points).toHaveLength(3 + 14);
  });

  it('keeps an arc that meets the next one in a point once', () => {
    // 20 × 40, radii 10 at the two lower corners: the arcs meet at (10, 0) – the end of the last one is
    // the start of the first, which is then dropped: 19 + 1 + 1 + 19 − 1
    const wrap = rectangle(0, 0, 20, 40, [10, 10, 0, 0]);
    expect(wrap.points).toHaveLength(39);
    // 40 × 20, radii 10 at the two right corners: they meet at (40, 10): 19 + 19 + 1 + 1 − 1
    const side = rectangle(0, 0, 40, 20, [0, 10, 10, 0]);
    expect(side.points).toHaveLength(39);
    for (const c of [wrap, side]) {
      const n = c.points.length;
      c.points.forEach((p, i) => {
        const q = c.points[(i + 1) % n]!;
        expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(1e-9);
      });
      // The two upper corners of `wrap` are sharp, the two lower ones round: area 800 − 2 · 21.46
      expect(signedArea(c.points)).toBeGreaterThan(0);
    }
    expect(signedArea(wrap.points)).toBeLessThanOrEqual(
      800 - 2 * (100 - (Math.PI * 100) / 4) + 1e-9,
    );
    expect(signedArea(wrap.points)).toBeGreaterThan(800 - 2 * 21.4602 - 0.01 * 31.42);
  });
});

describe('the slot', () => {
  it('is two half circles and two straight sides: l = 60, w = 10', () => {
    const c = slot(0, 0, 60, 10);
    // Area (60 − 10) · 10 + π · 5² = 578.5398; the perimeter 2 · 50 + π · 10 = 131.4159
    expect(area(c)).toBeLessThanOrEqual(578.5398163 + 1e-9);
    expect(area(c)).toBeGreaterThan(578.5398163 - 0.01 * 31.42);
    expect(pathLength(c.points, true)).toBeLessThanOrEqual(131.4159265 + 1e-9);
    expect(pathLength(c.points, true)).toBeGreaterThan(131.4159265 - 0.1);
    // A half circle of 5 mm: step 2·acos(1 − 0.002) = 0.1265 rad, π / 0.1265 → 25 steps, 26 points each
    expect(c.points).toHaveLength(52);
    const b = box(c);
    // The ends of the straight sides are on the box (±5), the ends of the arcs fall between two points: they
    // are short of ±30 by less than the tolerance
    expect([b.minY, b.maxY].map(r6)).toEqual([-5, 5]);
    expect(b.maxX).toBeLessThanOrEqual(30);
    expect(b.maxX).toBeGreaterThan(30 - CURVE_TOLERANCE - 1e-9);
    expect(b.minX).toBeCloseTo(-b.maxX, 9);
    // Symmetric about both axes, and never an exact circle
    expect(mirrored(c, (p) => ({ x: -p.x, y: p.y }))).toBe(true);
    expect(mirrored(c, (p) => ({ x: p.x, y: -p.y }))).toBe(true);
    expect(c.circle).toBeUndefined();
  });

  it('as long as it is wide is round but no circle contour (the limit of the sketch)', () => {
    const c = slot(0, 0, 10, 10);
    expect(c.circle).toBeUndefined();
    expect(area(c)).toBeLessThanOrEqual(Math.PI * 25 + 1e-9);
    expect(area(c)).toBeGreaterThan(Math.PI * 25 - 0.01 * 31.42);
  });
});

describe('the ellipse', () => {
  /** The largest distance of the true ellipse from the polygon, each chord against its own stretch of it */
  const sag = (rx: number, ry: number) => {
    const c = ellipse(0, 0, rx, ry);
    const n = c.points.length;
    let worst = 0;
    for (let j = 0; j < n * 9; j++) {
      const t = (2 * Math.PI * j) / (n * 9);
      const at = { x: rx * Math.cos(t), y: ry * Math.sin(t) };
      const i = Math.floor(j / 9);
      worst = Math.max(worst, distanceToPath(at, [c.points[i]!, c.points[(i + 1) % n]!], false));
    }
    return worst;
  };

  it('has the points of 30 × 20 radii that its steps ask for: 124', () => {
    // Chord step 2·acos(1 − 0.01 / 30) = 0.05164 rad → 2π / 0.05164 = 121.7 → 122 steps; the turn bound
    // 2·atan(tan 7.5° · 20 / 30) = 0.1751 rad asks for only 36; 122 rounded up to a multiple of four is 124
    const c = ellipse(0, 0, 30, 20);
    expect(c.points).toHaveLength(124);
    expect(c.closed).toBe(true);
    expect(c.circle).toBeUndefined();
    // It starts at the right end of the x axis and runs counter-clockwise
    expect(c.points[0]).toEqual({ x: 30, y: 0 });
    expect(signedArea(c.points)).toBeGreaterThan(0);
    // Its own box, exactly: the points include the four ends of the axes
    const b = box(c);
    expect([b.minX, b.minY, b.maxX, b.maxY].map(r6)).toEqual([-30, -20, 30, 20]);
    // π · 30 · 20 = 1884.9556; the chords leave out at most 0.01 × the perimeter (158.7)
    expect(area(c)).toBeLessThanOrEqual(1884.9556 + 1e-9);
    expect(area(c)).toBeGreaterThan(1884.9556 - 0.01 * 158.7);
    // Mirror-symmetric about both axes; moved by its centre
    expect(mirrored(c, (p) => ({ x: -p.x, y: p.y }))).toBe(true);
    expect(mirrored(c, (p) => ({ x: p.x, y: -p.y }))).toBe(true);
    expect(box(ellipse(100, -50, 30, 20))).toMatchObject({ minX: 70, maxX: 130 });
  });

  it('never lies further from the ellipse than the tolerance', () => {
    expect(CURVE_TOLERANCE).toBeLessThanOrEqual(0.05);
    // 30 × 20 worst: 0.0095 mm. (Measured by sampling the true ellipse nine times in every chord.)
    for (const [rx, ry] of [
      [30, 20],
      [50, 5],
      [2500, 25],
      [5, 0.25],
      [1.2, 0.3],
      [100, 0.5],
      [0.25, 0.3],
    ] as const) {
      expect(sag(rx, ry)).toBeLessThanOrEqual(CURVE_TOLERANCE + 1e-9);
      expect(sag(ry, rx)).toBeLessThanOrEqual(CURVE_TOLERANCE + 1e-9);
    }
  });

  it('is a curve: no vertex of it is a corner, up to the proportions of the limits', () => {
    // The turn is greatest at the ends of the long axis: 2·atan((long / short) · tan(step / 2)). For the
    // slender 100 × 25 mm (ratio 4) at the chord tolerance alone it would be 9°, for 100 × 10 (ratio 10)
    // 22.6° – so the step is cut until no vertex turns by more than 15°.
    expect(ELLIPSE_TURN).toBe(15);
    for (const [rx, ry] of [
      [30, 20],
      [50, 12.5],
      [50, 5],
      [50, 1],
      [5, 1.25],
      [1, 0.5],
      [0.25, 0.3],
      [2500, 25],
      [5, 0.25],
      [2500, 1250],
    ] as const) {
      const c = ellipse(0, 0, rx, ry);
      expect(Math.max(...turns(c.points, true))).toBeLessThanOrEqual(ELLIPSE_TURN + 1e-6);
      // What the tabs ask when they keep off the corners finds none, so no tab moves for a vertex of a curve
      expect(cornerWays(c)).toEqual([]);
      const tabs = { count: 4, width: 4 };
      expect(tabSites(c, { ...tabs, avoidCorners: true }, 3, 'outside')).toEqual(
        tabSites(c, tabs, 3, 'outside'),
      );
    }
  });

  it('has tips that are corners when it is thinner than the points allow', () => {
    // 2500 × 0.25: the tip's radius of curvature is 0.25² / 2500 = 0.000025 mm. 4096 points are the most
    // the turn asks for, and there the two tips turn by 165°
    const c = ellipse(0, 0, 2500, 0.25);
    expect(c.points).toHaveLength(4096);
    expect(Math.max(...turns(c.points, true))).toBeGreaterThan(160);
    expect(cornerWays(c)).toHaveLength(2);
    // At the cap the turn is 2·atan(ratio · tan(π / 4096)): for 200 : 1 that is 17.4° – still no corner,
    // for 250 : 1 it is 21.7°
    expect(cornerWays(ellipse(0, 0, 100, 0.5))).toEqual([]);
    expect(cornerWays(ellipse(0, 0, 125, 0.5))).toHaveLength(2);
  });

  it('keeps the circle flag where it is a circle: equal radii', () => {
    const c = ellipse(5, 6, 20, 20);
    expect(c.circle).toEqual({ cx: 5, cy: 6, r: 20 });
    expect(c).toEqual(circle(5, 6, 40));
    // Nearly equal is an ellipse and has none
    expect(ellipse(5, 6, 20, 20.0001).circle).toBeUndefined();
  });

  it('needs at least a rhombus where the radii are below the tolerance', () => {
    // 0.005 × 0.004: the chord step of an arc this small is a quarter turn (4 steps); the turn bound
    // 2·atan(tan 7.5° · 0.8) = 0.2096 rad asks for 30, rounded up to 32
    const c = ellipse(0, 0, 0.005, 0.004);
    expect(c.points).toHaveLength(32);
    expect(area(c)).toBeGreaterThan(0);
  });
});

describe('the star', () => {
  it('has the area, the box and the corners of five tips: outer 20, inner 8', () => {
    const c = star(0, 0, 5, 20, 8);
    expect(c.points).toHaveLength(10);
    expect(c.closed).toBe(true);
    expect(c.circle).toBeUndefined();
    // The first tip points up and the line runs counter-clockwise: the next point is a notch on the left
    expect(c.points[0]).toEqual({ x: 0, y: 20 });
    expect(c.points[1]!.x).toBeCloseTo(-8 * Math.sin(Math.PI / 5), 12);
    expect(c.points[1]!.y).toBeCloseTo(8 * Math.cos(Math.PI / 5), 12);
    // Ten triangles of ½ · 20 · 8 · sin 36°: 5 · 20 · 8 · 0.587785 = 470.2282
    expect(signedArea(c.points)).toBeCloseTo(470.2282, 4);
    // Ten sides of √(20² + 8² − 2 · 20 · 8 · cos 36°) = √205.115 = 14.3218
    expect(pathLength(c.points, true)).toBeCloseTo(143.218, 3);
    // Five tips: up, and 72° apart. Left and right ± 20 · sin 72° = 19.0211; the two lower tips 20 · cos 36°
    // = 16.1803 below the middle – the box is not centred
    const b = box(c);
    expect([b.minX, b.minY, b.maxX, b.maxY].map(r6)).toEqual([-19.02113, -16.18034, 19.02113, 20]);
    // Mirror-symmetric about the y axis, and turned by 72° it is itself
    expect(mirrored(c, (p) => ({ x: -p.x, y: p.y }))).toBe(true);
    const a = (72 * Math.PI) / 180;
    expect(
      mirrored(c, (p) => ({
        x: p.x * Math.cos(a) - p.y * Math.sin(a),
        y: p.x * Math.sin(a) + p.y * Math.cos(a),
      })),
    ).toBe(true);
    // Every vertex is a corner: the tips turn by 141.7° (2 · atan(13.528 / 4.702)), the notches by −69.7°
    expect(cornerWays(c)).toHaveLength(10);
  });

  it('is centred when it has an even number of tips: four', () => {
    const b = box(star(0, 0, 4, 20, 8));
    expect([b.minX, b.minY, b.maxX, b.maxY].map(r6)).toEqual([-20, -20, 20, 20]);
  });

  it('is a regular polygon of twice the tips where inner equals outer', () => {
    const c = star(3, -2, 6, 10, 10);
    expect(c.points).toHaveLength(12);
    c.points.forEach((p) => expect(Math.hypot(p.x - 3, p.y + 2)).toBeCloseTo(10, 12));
    // 12 sides: ½ · 12 · 10² · sin 30° = 300
    expect(signedArea(c.points)).toBeCloseTo(300, 9);
  });
});

describe('the toothed wheel', () => {
  // 8 teeth between the circles 15 and 20. Pitch P = 45°. Per tooth: the floor is a sector of 22.5° at 15,
  // the tip a sector of 11.25° at 20, and each flank a triangle from the middle over an angle of P / 8
  const P = (2 * Math.PI) / 8;
  const exact = 8 * (0.5 * 15 * 15 * (P / 2) + 0.5 * 20 * 20 * (P / 4) + 15 * 20 * Math.sin(P / 8));

  it('has the area of trapezoid teeth on two circles: 902.83', () => {
    const c = gear(0, 0, 8, 20, 15);
    expect(exact).toBeCloseTo(902.83, 2);
    // The chords of the arcs leave out at most 0.01 × the arcs' length: 8 · (20 · P / 4 + 15 · P / 2) = 78.5
    expect(area(c)).toBeLessThanOrEqual(exact + 1e-9);
    expect(area(c)).toBeGreaterThan(exact - 0.01 * 78.54);
    expect(signedArea(c.points)).toBeGreaterThan(0);
    expect(c.circle).toBeUndefined();
  });

  it('has the points its arcs ask for: 5 on a tip, 7 on a floor, 12 a tooth', () => {
    // A tip: 11.25° at 20 mm, step 2·acos(1 − 0.0005) = 0.0632 rad, 0.19635 / 0.0632 → 4 steps. A floor:
    // 22.5° at 15 mm, step 0.0730 rad, 0.3927 / 0.0730 → 6 steps.
    const c = gear(0, 0, 8, 20, 15);
    expect(c.points).toHaveLength(8 * 12);
    // Only two radii, the tip circle and the root circle
    for (const p of c.points) {
      const r = Math.hypot(p.x, p.y);
      expect(Math.min(Math.abs(r - 20), Math.abs(r - 15))).toBeLessThan(1e-9);
    }
    // The first tooth stands up and the line starts at the right end of its tip: 90° − 5.625°
    const a = ((90 - 5.625) * Math.PI) / 180;
    expect(c.points[0]!.x).toBeCloseTo(20 * Math.cos(a), 9);
    expect(c.points[0]!.y).toBeCloseTo(20 * Math.sin(a), 9);
    // A tip, then a floor: 5 points at 20, then 7 at 15 (the tooth's right flank lies between them)
    expect(Math.hypot(c.points[4]!.x, c.points[4]!.y)).toBeCloseTo(20, 9);
    expect(Math.hypot(c.points[5]!.x, c.points[5]!.y)).toBeCloseTo(15, 9);
    expect(Math.hypot(c.points[11]!.x, c.points[11]!.y)).toBeCloseTo(15, 9);
    expect(Math.hypot(c.points[12]!.x, c.points[12]!.y)).toBeCloseTo(20, 9);
  });

  it('is symmetric: eightfold, and mirrored about the y axis', () => {
    const c = gear(0, 0, 8, 20, 15);
    const a = Math.PI / 4;
    expect(
      mirrored(c, (p) => ({
        x: p.x * Math.cos(a) - p.y * Math.sin(a),
        y: p.x * Math.sin(a) + p.y * Math.cos(a),
      })),
    ).toBe(true);
    expect(mirrored(c, (p) => ({ x: -p.x, y: p.y }))).toBe(true);
    // The tips at the four points of the compass reach 20: the box is centred
    const b = box(c);
    expect([b.minX, b.minY, b.maxX, b.maxY].map(r6)).toEqual([-20, -20, 20, 20]);
    // Four corners a tooth: where a tip ends and a floor begins, on both flanks. The line turns by 75.2°
    // at the end of a tip (from the arc's 185.6° less half a step to the flank's 259.5°) and by −66.3°
    // where the floor begins; the arcs' own vertices turn by 2.8° and less.
    expect(cornerWays(c)).toHaveLength(32);
  });

  it('is not centred with an odd number of teeth, and the first tooth stands up', () => {
    const c = gear(0, 0, 7, 20, 15);
    const b = box(c);
    expect(b.maxY).toBeCloseTo(20, 9);
    // The lowest point is the end of the tip nearest 270°: tooth 3 stands at 90° + 3 · 360° / 7, its tip
    // ends at + 360° / 56 – 250.714°, sin = −0.94388
    const end = Math.PI / 2 + (3 * 2 * Math.PI) / 7 + (2 * Math.PI) / 7 / 8;
    expect(b.minY).toBeCloseTo(20 * Math.sin(end), 9);
    expect(b.minY).toBeCloseTo(-18.8776, 3);
  });

  it('is a polygon on one circle where the root is as large as the tips, and a lone tooth is a shape', () => {
    const flat = gear(0, 0, 8, 20, 20);
    flat.points.forEach((p) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(20, 9));
    expect(flat.circle).toBeUndefined();
    // One tooth: a tip of 90° (P / 4 of 360°) and a floor of 180°
    const one = gear(0, 0, 1, 20, 15);
    expect(area(one)).toBeGreaterThan(0);
    expect(area(one)).toBeLessThan(Math.PI * 400);
  });
});

describe('the spiral', () => {
  const sagOf = (turnsCount: number, from: number, to: number) => {
    const c = spiral(0, 0, turnsCount, from, to);
    const total = 2 * Math.PI * turnsCount;
    const n = c.points.length - 1;
    let worst = 0;
    for (let j = 0; j <= n * 7; j++) {
      const t = (total * j) / (n * 7);
      const r = from + ((to - from) * t) / total;
      const at = { x: r * Math.cos(t), y: r * Math.sin(t) };
      const i = Math.min(Math.floor(j / 7), n - 1);
      worst = Math.max(worst, distanceToPath(at, [c.points[i]!, c.points[i + 1]!], false));
    }
    return worst;
  };

  it('is an open line from the start radius to the end radius: 2 turns from 0 to 20', () => {
    const c = spiral(0, 0, 2, 0, 20);
    expect(c.closed).toBe(false);
    expect(c.circle).toBeUndefined();
    // growth 20 / 4π = 1.5915 per radian; step √(0.08 / (20 + 3.183)) = 0.05875 rad; 4π / 0.05875 → 214 steps
    expect(c.points).toHaveLength(215);
    expect(c.points[0]).toEqual({ x: 0, y: 0 });
    // After two turns it is back on the x axis, at the end radius
    expect(c.points[214]!.x).toBeCloseTo(20, 9);
    expect(c.points[214]!.y).toBeCloseTo(0, 9);
    // The radius grows evenly: halfway round (1 turn) it is 10, on the x axis again
    expect(c.points[107]!.x).toBeCloseTo(10, 9);
    expect(c.points[107]!.y).toBeCloseTo(0, 9);
    // The length of r = bθ: (1 / 2b) · [r · √(r² + b²) + b² · asinh(r / b)] from 0 to 20 = 128.628; the
    // chords are a little shorter
    const b = 20 / (4 * Math.PI);
    const exact = (20 * Math.sqrt(400 + b * b) + b * b * Math.asinh(20 / b)) / (2 * b);
    expect(exact).toBeCloseTo(128.628, 3);
    expect(pathLength(c.points, false)).toBeLessThanOrEqual(exact);
    expect(pathLength(c.points, false)).toBeGreaterThan(exact - 0.05);
    // The box: it reaches 20 at its end; the lowest and highest points lie where the radius is 15 and 5
    // round the clock – no further than the radius grows
    const box2 = box(c);
    expect(box2.maxX).toBeCloseTo(20, 9);
    expect(box2.minX).toBeGreaterThan(-20);
  });

  it('never lies further from the spiral than the tolerance, also at the centre and out to the largest radius', () => {
    for (const [t, s, e] of [
      [2, 0, 20],
      [3, 0, 0.5],
      [10, 0, 1],
      [0.25, 0, 2500],
      [50, 0, 2500],
      [3, 20, 20],
      [5, 20, 0],
      [1, 0.25, 0.25],
    ] as const) {
      expect(sagOf(t, s, e)).toBeLessThanOrEqual(CURVE_TOLERANCE + 1e-9);
    }
  });

  it('turns by at most 15° from one chord to the next, also at the centre where it turns twice as fast', () => {
    // 3 turns from 0 to 0.5 mm: the chord step is 7.5° (π / 24), heading changes by up to 2 · 7.5° = 15°
    for (const [t, s, e] of [
      [3, 0, 0.5],
      [10, 0, 1],
      [2, 0, 20],
      [5, 20, 0],
      [1, 0.25, 0.25],
    ] as const) {
      const c = spiral(0, 0, t, s, e);
      expect(Math.max(...turns(c.points, false))).toBeLessThanOrEqual(15);
    }
    // A spiral is open: no corners, whatever the turn
    expect(cornerWays(spiral(0, 0, 3, 0, 0.5))).toEqual([]);
  });

  it('is a circle that goes round again where start and end are equal, and inwards where start is larger', () => {
    const rings = spiral(0, 0, 3, 20, 20);
    rings.points.forEach((p) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(20, 9));
    // 3 turns of 20 mm: 3 · 2π · 20 = 377.0, the chords a little less
    expect(pathLength(rings.points, false)).toBeLessThanOrEqual(3 * 2 * Math.PI * 20);
    expect(pathLength(rings.points, false)).toBeGreaterThan(3 * 2 * Math.PI * 20 - 0.1);
    const inward = spiral(0, 0, 5, 20, 0);
    expect(inward.points[0]).toEqual({ x: 20, y: 0 });
    const end = inward.points[inward.points.length - 1]!;
    expect(Math.hypot(end.x, end.y)).toBeCloseTo(0, 9);
    // Moved by its centre
    expect(spiral(10, -4, 1, 5, 5).points[0]).toEqual({ x: 15, y: -4 });
  });
});
