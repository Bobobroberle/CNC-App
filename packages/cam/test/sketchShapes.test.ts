import { describe, expect, it } from 'vitest';
import {
  CURVE_TOLERANCE,
  SKETCH_LIMITS,
  SKETCH_MAX,
  SKETCH_MIN,
  contourBounds,
  cornerWays,
  defaultOperations,
  ellipse,
  gear,
  magnifySketch,
  rectangle,
  scaleSketch,
  signedArea,
  sketchBox,
  sketchContours,
  sketchKeepsProportions,
  sketchSize,
  spiral,
  star,
  tidySketch,
  toolpaths,
  validateSketch,
  type AnySketch,
  type AnySketchType,
  type ShapeSketch,
  type Sketch,
} from '../src';

/**
 * The curved and toothed sketches and the per-corner radii of a rectangle: what the measures are brought
 * to, which contours they make, their boxes, scaling, and the reading of a sketch from a file. The numbers are
 * the ones of `shapes.test.ts` worked out by hand; here it is the bookkeeping that is held.
 */

const NEW: ShapeSketch[] = [
  { type: 'ellipse', rx: 30, ry: 20 },
  { type: 'star', points: 5, outer: 20, inner: 8 },
  { type: 'gear', teeth: 8, outer: 20, root: 15 },
  { type: 'spiral', turns: 2, start: 0, end: 20 },
];
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

describe('tidying the new measures', () => {
  it('brings an ellipse into its limits: radii of 0.25 to 2500 mm', () => {
    expect(tidySketch({ type: 'ellipse', rx: 0, ry: NaN })).toEqual({
      type: 'ellipse',
      rx: 0.25,
      ry: 0.25,
    });
    expect(tidySketch({ type: 'ellipse', rx: -4, ry: Infinity })).toMatchObject({
      rx: 0.25,
      ry: 0.25,
    });
    expect(tidySketch({ type: 'ellipse', rx: 1e9, ry: 30 })).toEqual({
      type: 'ellipse',
      rx: 2500,
      ry: 30,
    });
  });

  it('makes a star whole in its tips and keeps the notches inside the tips', () => {
    expect(tidySketch({ type: 'star', points: 2, outer: 20, inner: 30 })).toEqual({
      type: 'star',
      points: 3,
      outer: 20,
      inner: 20,
    });
    expect(tidySketch({ type: 'star', points: 99.4, outer: 20, inner: 0 })).toEqual({
      type: 'star',
      points: 32,
      outer: 20,
      inner: 0.25,
    });
    // Half a tip is rounded up; a measure that is no number is the smallest
    expect(tidySketch({ type: 'star', points: 5.5, outer: 20, inner: 8 })).toMatchObject({
      points: 6,
    });
    expect(tidySketch({ type: 'star', points: NaN, outer: NaN, inner: NaN })).toEqual({
      type: 'star',
      points: 3,
      outer: 0.25,
      inner: 0.25,
    });
  });

  it('makes a gear whole in its teeth and keeps the root inside the tips', () => {
    expect(tidySketch({ type: 'gear', teeth: 1, outer: 20, root: 25 })).toEqual({
      type: 'gear',
      teeth: 6,
      outer: 20,
      root: 20,
    });
    expect(tidySketch({ type: 'gear', teeth: 200, outer: 5000, root: 0 })).toEqual({
      type: 'gear',
      teeth: 80,
      outer: 2500,
      root: 0.25,
    });
    expect(tidySketch({ type: 'gear', teeth: 8.4, outer: 20, root: 15 })).toMatchObject({
      teeth: 8,
    });
  });

  it('keeps a spiral between its limits and never lets both ends be nothing', () => {
    expect(tidySketch({ type: 'spiral', turns: 0, start: 5, end: 0 })).toEqual({
      type: 'spiral',
      turns: 0.25,
      start: 5,
      end: 0,
    });
    expect(tidySketch({ type: 'spiral', turns: 1000, start: -3, end: 1e9 })).toEqual({
      type: 'spiral',
      turns: 50,
      start: 0,
      end: 2500,
    });
    // Both ends at nothing, or too small to cut: the end is the smallest radius
    expect(tidySketch({ type: 'spiral', turns: 3, start: 0, end: 0 })).toMatchObject({
      start: 0,
      end: 0.25,
    });
    expect(tidySketch({ type: 'spiral', turns: 3, start: 0.1, end: 0.1 })).toMatchObject({
      start: 0.1,
      end: 0.25,
    });
    expect(tidySketch({ type: 'spiral', turns: NaN, start: NaN, end: NaN })).toEqual({
      type: 'spiral',
      turns: 0.25,
      start: 0,
      end: 0.25,
    });
    // A start of the smallest radius lets the end be what it is
    expect(tidySketch({ type: 'spiral', turns: 1, start: 0.25, end: 0.1 })).toMatchObject({
      start: 0.25,
      end: 0.1,
    });
  });

  it('holds each corner radius of a rectangle to half the shorter side', () => {
    const rect = { type: 'rect' as const, w: 100, h: 60, r: 3 };
    // Four radii of their own: `r` becomes the largest and `radii` stays
    expect(tidySketch({ ...rect, radii: [1, 2, 3, 4] })).toEqual({
      ...rect,
      r: 4,
      radii: [1, 2, 3, 4],
    });
    // 99 is held to 30, a negative one and NaN are 0
    expect(tidySketch({ ...rect, radii: [-1, NaN, 99, 5] })).toEqual({
      ...rect,
      r: 30,
      radii: [0, 0, 30, 5],
    });
    // 10 × 100: half the shorter side is 5
    expect(tidySketch({ type: 'rect', w: 10, h: 100, r: 0, radii: [50, 0, 0, 0] })).toEqual({
      type: 'rect',
      w: 10,
      h: 100,
      r: 5,
      radii: [5, 0, 0, 0],
    });
  });

  it('gives the plain rectangle back where the four radii are equal, and never a `radii` where there are none', () => {
    const plain = tidySketch({ type: 'rect', w: 100, h: 60, r: 7, radii: [5, 5, 5, 5] });
    expect(plain).toStrictEqual({ type: 'rect', w: 100, h: 60, r: 5 });
    // Equal only after being held to half the shorter side
    expect(
      tidySketch({ type: 'rect', w: 100, h: 60, r: 0, radii: [40, 50, 60, 99] }),
    ).toStrictEqual({
      type: 'rect',
      w: 100,
      h: 60,
      r: 30,
    });
    // The sketch of today, key for key
    expect(tidySketch({ type: 'rect', w: 100, h: 60, r: 99 })).toStrictEqual({
      type: 'rect',
      w: 100,
      h: 60,
      r: 30,
    });
    expect('radii' in tidySketch({ type: 'rect', w: 1, h: 1, r: 0, radii: undefined })).toBe(false);
  });

  it('is its own fixed point', () => {
    const messy: AnySketch[] = [
      ...NEW,
      { type: 'ellipse', rx: -1, ry: 1e9 },
      { type: 'star', points: 1, outer: 3, inner: 9 },
      { type: 'gear', teeth: 999, outer: 1, root: 9 },
      { type: 'spiral', turns: 77, start: 0, end: 0 },
      { type: 'rect', w: 100, h: 60, r: 3, radii: [1, 99, -2, 4] },
      { type: 'rect', w: 100, h: 60, r: 3, radii: [4, 4, 4, 4] },
    ];
    for (const s of messy) expect(tidySketch(tidySketch(s))).toEqual(tidySketch(s));
  });

  it('keeps the types: a narrow sketch comes back narrow', () => {
    // (compiles only if the overloads hold)
    const a: Sketch = tidySketch({ type: 'rect', w: 1, h: 1, r: 0 });
    const b: ShapeSketch = tidySketch({ type: 'star', points: 5, outer: 5, inner: 2 });
    const c: AnySketch = tidySketch(NEW[0]! as AnySketch);
    const d: Sketch = scaleSketch({ type: 'circle', d: 4 }, 2, 2);
    const e: ShapeSketch = scaleSketch(NEW[0]!, 2, 2);
    const f: Sketch = magnifySketch({ type: 'circle', d: 4 }, 2);
    const g: ShapeSketch = magnifySketch(NEW[1]!, 2);
    expect([a, b, c, d, e, f, g]).toHaveLength(7);
  });
});

describe('the contours of the new sketches', () => {
  it('makes what the shapes make, around the sketch origin', () => {
    expect(sketchContours({ type: 'ellipse', rx: 30, ry: 20 })).toEqual({
      contours: [ellipse(0, 0, 30, 20)],
      missing: [],
    });
    expect(sketchContours({ type: 'star', points: 5, outer: 20, inner: 8 }).contours).toEqual([
      star(0, 0, 5, 20, 8),
    ]);
    expect(sketchContours({ type: 'gear', teeth: 8, outer: 20, root: 15 }).contours).toEqual([
      gear(0, 0, 8, 20, 15),
    ]);
    expect(sketchContours({ type: 'spiral', turns: 2, start: 0, end: 20 }).contours).toEqual([
      spiral(0, 0, 2, 0, 20),
    ]);
  });

  it('tidies first: nothing to draw becomes the smallest thing that can be', () => {
    const [c] = sketchContours({ type: 'star', points: 1, outer: -1, inner: 99 }).contours;
    // 3 tips of 0.25 mm and notches of 0.25: a hexagon
    expect(c!.points).toHaveLength(6);
    expect(Math.abs(signedArea(c!.points))).toBeCloseTo((3 * Math.sqrt(3) * 0.25 ** 2) / 2, 9);
  });

  it('draws an exact circle only where it is one', () => {
    const circles = (s: AnySketch) => sketchContours(s).contours.filter((c) => c.circle).length;
    expect(circles({ type: 'circle', d: 20 })).toBe(1);
    expect(circles({ type: 'grid', d: 6, nx: 2, ny: 2, px: 10, py: 10 })).toBe(4);
    expect(circles({ type: 'ellipse', rx: 20, ry: 20 })).toBe(1);
    expect(sketchContours({ type: 'ellipse', rx: 20, ry: 20 }).contours[0]!.circle).toEqual({
      cx: 0,
      cy: 0,
      r: 20,
    });
    for (const s of [
      { type: 'ellipse', rx: 20, ry: 20.5 },
      { type: 'rect', w: 20, h: 20, r: 10 },
      { type: 'slot', l: 20, w: 20 },
      ...NEW.slice(1),
    ] as AnySketch[]) {
      expect(circles(s)).toBe(0);
    }
  });

  it('makes a rectangle of corner radii that differ, and the plain one as ever', () => {
    expect(
      sketchContours({ type: 'rect', w: 100, h: 60, r: 0, radii: [0, 0, 10, 10] }).contours,
    ).toEqual([rectangle(-50, -30, 100, 60, [0, 0, 10, 10])]);
    // With the four equal – before or after tidying – nothing but `r` counts
    expect(
      sketchContours({ type: 'rect', w: 100, h: 60, r: 0, radii: [8, 8, 8, 8] }).contours,
    ).toEqual(sketchContours({ type: 'rect', w: 100, h: 60, r: 8 }).contours);
    expect(sketchContours({ type: 'rect', w: 100, h: 60, r: 8 }).contours).toEqual([
      rectangle(-50, -30, 100, 60, 8),
    ]);
  });

  it('cuts a spiral as an engraving line and the others as parts', () => {
    const open = sketchContours(NEW[3]!).contours;
    const ops = defaultOperations(open, 3, { count: 4, width: 4, height: 1 });
    expect(ops).toEqual([{ contour: 0, kind: 'on' }]);
    // ... and a program is made of it
    const program = toolpaths(open, ops, {
      toolDiameter: 3,
      depth: 1,
      stepdown: 1,
      stepover: 0.4,
      feed: 600,
      plungeFeed: 200,
      rampAngle: 90,
      safeZ: 5,
      climb: true,
    });
    expect(program.problems).toEqual([]);
    // 215 points of the line: every one is reached by a cut at the feed of 600
    expect(
      program.moves.filter((m) => m.feed === 600 && m.x !== undefined).length,
    ).toBeGreaterThanOrEqual(214);
  });
});

describe('the box of the new sketches', () => {
  it('is centred for an ellipse and holds its radii', () => {
    expect(sketchBox({ type: 'ellipse', rx: 30, ry: 20 })).toEqual({
      minX: -30,
      minY: -20,
      maxX: 30,
      maxY: 20,
    });
    expect(sketchSize({ type: 'ellipse', rx: 30, ry: 20 })).toEqual({ w: 60, h: 40 });
  });

  it('is the true bounds for a star, a gear and a spiral – and not centred', () => {
    // 5 tips: up 20, down 20 · cos 36° = 16.1803, sideways 20 · sin 72° = 19.0211
    const star5 = sketchBox({ type: 'star', points: 5, outer: 20, inner: 8 })!;
    expect([star5.minX, star5.minY, star5.maxX, star5.maxY].map(r6)).toEqual([
      -19.02113, -16.18034, 19.02113, 20,
    ]);
    const size5 = sketchSize({ type: 'star', points: 5, outer: 20, inner: 8 })!;
    expect(size5.w).toBeCloseTo(38.04226, 5);
    expect(size5.h).toBeCloseTo(36.18034, 5);
    const gear8 = sketchBox({ type: 'gear', teeth: 8, outer: 20, root: 15 })!;
    expect([gear8.minX, gear8.minY, gear8.maxX, gear8.maxY].map(r6)).toEqual([-20, -20, 20, 20]);
    // A spiral of one turn from 10 to 30: ends at (30, 0), has the radius 20 at its half turn
    const spin = sketchBox({ type: 'spiral', turns: 1, start: 10, end: 30 })!;
    expect(spin.maxX).toBeCloseTo(30, 9);
    // (at the half turn the radius is 20: −20; a little further on x = r · cos θ is still falling, to
    // about −20.25 where the heading is vertical)
    expect(spin.minX).toBeLessThan(-19.9);
    expect(spin.minX).toBeGreaterThan(-20.5);
    expect(spin.maxY).toBeGreaterThan(14.9);
    expect(spin.maxY).toBeLessThan(15.5);
    // Whatever the box, it is the box of the contours, to the last digit
    for (const s of NEW) {
      const made = contourBounds(sketchContours(s).contours)!;
      const b = sketchBox(s)!;
      if (s.type !== 'ellipse') expect(b).toEqual(made);
      expect(b.maxX).toBeGreaterThanOrEqual(made.maxX - 1e-9);
      expect(b.minX).toBeLessThanOrEqual(made.minX + 1e-9);
      expect(b.maxY).toBeGreaterThanOrEqual(made.maxY - 1e-9);
      expect(b.minY).toBeLessThanOrEqual(made.minY + 1e-9);
    }
  });

  it('says which sketches keep their proportions when a handle changes the size', () => {
    expect(NEW.map((s) => [s.type, sketchKeepsProportions(s)])).toEqual([
      ['ellipse', false],
      ['star', true],
      ['gear', true],
      ['spiral', true],
    ]);
  });
});

describe('scaling the new sketches', () => {
  it('scales an ellipse by its two radii and the rest by the first factor', () => {
    expect(scaleSketch({ type: 'ellipse', rx: 30, ry: 20 }, 2, 0.5)).toEqual({
      type: 'ellipse',
      rx: 60,
      ry: 10,
    });
    expect(scaleSketch({ type: 'star', points: 5, outer: 20, inner: 8 }, 2, 7)).toEqual({
      type: 'star',
      points: 5,
      outer: 40,
      inner: 16,
    });
    expect(scaleSketch({ type: 'gear', teeth: 8, outer: 20, root: 15 }, 0.5, 7)).toEqual({
      type: 'gear',
      teeth: 8,
      outer: 10,
      root: 7.5,
    });
    expect(scaleSketch({ type: 'spiral', turns: 2, start: 0, end: 20 }, 3, 1)).toEqual({
      type: 'spiral',
      turns: 2,
      start: 0,
      end: 60,
    });
    // Never past the limits, never to nothing
    expect(scaleSketch({ type: 'ellipse', rx: 30, ry: 20 }, 1e9, 0)).toEqual({
      type: 'ellipse',
      rx: 2500,
      ry: 0.25,
    });
  });

  it('magnifies every measure, the counts excepted', () => {
    expect(magnifySketch({ type: 'ellipse', rx: 30, ry: 20 }, 0.5)).toEqual({
      type: 'ellipse',
      rx: 15,
      ry: 10,
    });
    expect(magnifySketch({ type: 'star', points: 5, outer: 20, inner: 8 }, 2)).toEqual({
      type: 'star',
      points: 5,
      outer: 40,
      inner: 16,
    });
    expect(magnifySketch({ type: 'gear', teeth: 8, outer: 20, root: 15 }, 2)).toEqual({
      type: 'gear',
      teeth: 8,
      outer: 40,
      root: 30,
    });
    expect(magnifySketch({ type: 'spiral', turns: 2, start: 0, end: 20 }, 2)).toEqual({
      type: 'spiral',
      turns: 2,
      start: 0,
      end: 40,
    });
  });

  it('carries the corner radii of a rectangle along: kept when it is stretched, scaled when it is magnified', () => {
    const rect: Sketch = { type: 'rect', w: 100, h: 60, r: 10, radii: [0, 2, 10, 4] };
    // Stretched: the radii stay what they are
    expect(scaleSketch(rect, 2, 1)).toEqual({ ...rect, w: 200 });
    // ... and are held to half the shorter side where it gets shorter: 60 → 6, half is 3
    expect(scaleSketch(rect, 1, 0.1)).toEqual({ ...rect, h: 6, r: 3, radii: [0, 2, 3, 3] });
    // Magnified: they grow with it
    expect(magnifySketch(rect, 2)).toEqual({
      type: 'rect',
      w: 200,
      h: 120,
      r: 20,
      radii: [0, 4, 20, 8],
    });
    // A rectangle without them stays without
    expect(magnifySketch({ type: 'rect', w: 100, h: 60, r: 10 }, 2)).toStrictEqual({
      type: 'rect',
      w: 200,
      h: 120,
      r: 20,
    });
  });
});

describe('the limits', () => {
  it('lists the ranges the sketches keep', () => {
    expect(SKETCH_LIMITS.length).toEqual({ min: SKETCH_MIN, max: SKETCH_MAX });
    expect(SKETCH_LIMITS.radius).toEqual({ min: 0.25, max: 2500 });
    expect(SKETCH_LIMITS.starPoints).toEqual({ min: 3, max: 32 });
    expect(SKETCH_LIMITS.gearTeeth).toEqual({ min: 6, max: 80 });
    expect(SKETCH_LIMITS.spiralTurns).toEqual({ min: 0.25, max: 50 });
    expect(SKETCH_LIMITS.gridCount).toEqual({ min: 1, max: 50 });
  });

  it('holds: no sketch within them has more vertices than `vertices`', () => {
    const r = SKETCH_LIMITS.radius;
    const most = (s: AnySketch) =>
      sketchContours(s).contours.reduce((n, c) => n + c.points.length, 0);
    // The spiral of 50 turns out to the largest radius is the largest of all: 55 714 points
    expect(most({ type: 'spiral', turns: 50, start: 0, end: r.max })).toBe(55714);
    for (const s of [
      { type: 'spiral', turns: 50, start: r.max, end: r.max },
      { type: 'spiral', turns: 50, start: 0, end: r.min },
      { type: 'spiral', turns: 0.25, start: 0, end: r.max },
      { type: 'ellipse', rx: r.max, ry: r.min },
      { type: 'ellipse', rx: r.max, ry: r.max - 1 },
      { type: 'star', points: 32, outer: r.max, inner: r.max },
      { type: 'gear', teeth: 6, outer: r.max, root: r.max },
      { type: 'gear', teeth: 80, outer: r.max, root: r.min },
    ] as AnySketch[]) {
      expect(most(s)).toBeLessThanOrEqual(SKETCH_LIMITS.vertices);
    }
    // The curves are within the tolerance of the library, which is within the 0.05 mm asked for
    expect(CURVE_TOLERANCE).toBeLessThanOrEqual(0.05);
  });

  it('keeps every vertex of an ellipse within the limits a curve, never a corner', () => {
    const r = SKETCH_LIMITS.radius;
    for (const [rx, ry] of [
      [r.max, r.max / 100],
      [r.min, r.min * 1.2],
      [r.max, r.max - 1],
      [20, 0.25],
    ]) {
      const c = sketchContours({ type: 'ellipse', rx: rx!, ry: ry! }).contours[0]!;
      expect(cornerWays(c)).toEqual([]);
    }
  });
});

describe('reading a sketch from a file', () => {
  it('accepts every sketch the app makes and brings it into its ranges', () => {
    for (const s of [
      ...NEW,
      { type: 'rect', w: 100, h: 60, r: 5 },
      { type: 'rect', w: 100, h: 60, r: 5, radii: [0, 1, 2, 3] },
      { type: 'circle', d: 20 },
      { type: 'slot', l: 60, w: 10 },
      { type: 'grid', d: 6, nx: 3, ny: 2, px: 30, py: 20 },
      { type: 'text', text: 'AB', height: 20, spacing: 0, lineSpacing: 1.6, align: 'left' },
    ] as AnySketch[]) {
      // through a file: JSON and back
      expect(validateSketch(JSON.parse(JSON.stringify(s)))).toEqual(tidySketch(s));
    }
    // A rectangle's `r` is any number (a negative one is 0), as the app has always read it
    expect(validateSketch({ type: 'rect', w: 100, h: 60, r: -4 })).toEqual({
      type: 'rect',
      w: 100,
      h: 60,
      r: 0,
    });
    // Counts that are too large or small are brought in, as a grid always was
    expect(validateSketch({ type: 'grid', d: 6, nx: 999, ny: 0.2, px: 10, py: 10 })).toMatchObject({
      nx: 50,
      ny: 1,
    });
    expect(validateSketch({ type: 'star', points: 99, outer: 20, inner: 50 })).toEqual({
      type: 'star',
      points: 32,
      outer: 20,
      inner: 20,
    });
    expect(validateSketch({ type: 'gear', teeth: 2, outer: 20, root: 15 })).toMatchObject({
      teeth: 6,
    });
    expect(validateSketch({ type: 'spiral', turns: 1, start: 0, end: 20 })).toEqual({
      type: 'spiral',
      turns: 1,
      start: 0,
      end: 20,
    });
    // An end of 0 for a spiral that begins somewhere is a spiral into the middle
    expect(validateSketch({ type: 'spiral', turns: 1, start: 20, end: 0 })).toMatchObject({
      end: 0,
    });
  });

  it('drops what is not a measure', () => {
    expect(validateSketch({ type: 'circle', d: 20, evil: 1, __proto__: { x: 1 } })).toStrictEqual({
      type: 'circle',
      d: 20,
    });
  });

  it('refuses what cannot be trusted: the item then keeps its contours', () => {
    const bad: unknown[] = [
      null,
      undefined,
      7,
      'circle',
      [],
      [{ type: 'circle', d: 20 }],
      {},
      { type: 'hexagon', d: 20 },
      { type: 'circle' },
      { type: 'circle', d: '20' },
      { type: 'circle', d: NaN },
      { type: 'circle', d: Infinity },
      { type: 'circle', d: 0 },
      { type: 'circle', d: -3 },
      { type: 'circle', d: SKETCH_MAX + 1 },
      { type: 'rect', w: 100, h: 60 },
      { type: 'rect', w: 100, h: 60, r: NaN },
      { type: 'rect', w: 100, h: 0, r: 0 },
      { type: 'rect', w: 100, h: 60, r: 0, radii: [1, 2, 3] },
      { type: 'rect', w: 100, h: 60, r: 0, radii: [1, 2, 3, 4, 5] },
      { type: 'rect', w: 100, h: 60, r: 0, radii: [1, 2, 3, '4'] },
      { type: 'rect', w: 100, h: 60, r: 0, radii: [1, 2, 3, NaN] },
      { type: 'rect', w: 100, h: 60, r: 0, radii: 'round' },
      { type: 'rect', w: 100, h: 60, r: 0, radii: null },
      { type: 'slot', l: 60 },
      { type: 'slot', l: -60, w: 10 },
      { type: 'grid', d: 6, nx: 0, ny: 2, px: 30, py: 20 },
      { type: 'grid', d: 6, nx: 2, ny: 2, px: 30 },
      { type: 'text', text: 7, height: 20, spacing: 0, lineSpacing: 1.6, align: 'left' },
      { type: 'text', text: 'A', height: 20, spacing: 0, lineSpacing: 1.6, align: 'justify' },
      { type: 'text', text: 'A', height: 0, spacing: 0, lineSpacing: 1.6, align: 'left' },
      { type: 'text', text: 'A', height: 20, spacing: NaN, lineSpacing: 1.6, align: 'left' },
      { type: 'text', text: 'A', height: 20, spacing: 0, lineSpacing: Infinity, align: 'left' },
      { type: 'ellipse', rx: 30 },
      { type: 'ellipse', rx: 0, ry: 20 },
      { type: 'ellipse', rx: 30, ry: SKETCH_LIMITS.radius.max + 1 },
      { type: 'star', points: 0, outer: 20, inner: 8 },
      { type: 'star', points: 5, outer: 20 },
      { type: 'star', points: 5, outer: -20, inner: 8 },
      { type: 'star', points: NaN, outer: 20, inner: 8 },
      { type: 'gear', teeth: 8, outer: 20 },
      { type: 'gear', teeth: -8, outer: 20, root: 15 },
      { type: 'gear', teeth: 8, outer: 1e9, root: 15 },
      { type: 'spiral', turns: 0, start: 0, end: 20 },
      { type: 'spiral', turns: 2, start: -1, end: 20 },
      { type: 'spiral', turns: 2, start: 0, end: SKETCH_LIMITS.radius.max + 1 },
      { type: 'spiral', turns: 2, start: 0 },
      { type: 'spiral', turns: 2, start: 0, end: NaN },
    ];
    for (const v of bad) expect(validateSketch(v), JSON.stringify(v)).toBeNull();
  });

  it('knows every type: the table of types and the validator agree', () => {
    const types: AnySketchType[] = [
      'rect',
      'circle',
      'slot',
      'grid',
      'text',
      'ellipse',
      'star',
      'gear',
      'spiral',
    ];
    // (`Record` over the union: a type added without a line here does not compile)
    const sample: Record<AnySketchType, AnySketch> = {
      rect: { type: 'rect', w: 10, h: 10, r: 1 },
      circle: { type: 'circle', d: 10 },
      slot: { type: 'slot', l: 10, w: 5 },
      grid: { type: 'grid', d: 2, nx: 2, ny: 2, px: 5, py: 5 },
      text: { type: 'text', text: 'A', height: 5, spacing: 0, lineSpacing: 1.6, align: 'left' },
      ellipse: { type: 'ellipse', rx: 5, ry: 3 },
      star: { type: 'star', points: 5, outer: 5, inner: 2 },
      gear: { type: 'gear', teeth: 8, outer: 5, root: 4 },
      spiral: { type: 'spiral', turns: 1, start: 0, end: 5 },
    };
    for (const t of types) expect(validateSketch(sample[t])).toEqual(sample[t]);
  });
});
