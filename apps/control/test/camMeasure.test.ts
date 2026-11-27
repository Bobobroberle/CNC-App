import { IDENTITY, circle, rectangle, type Contour } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import { place, type CamItem } from '../src/lib/camItems';
import {
  CORNER_DEGREES,
  contourFeatures,
  MEASURE_SNAP_PX,
  measureFeatures,
  measurement,
  snapMeasure,
  type Feature,
} from '../src/lib/camMeasure';

const poly = (closed: boolean, ...pts: [number, number][]): Contour => ({
  closed,
  points: pts.map(([x, y]) => ({ x, y })),
});
const at = (f: Feature[]) => f.map((p) => [p.kind, p.x, p.y]);

describe('the places a measurement point snaps to', () => {
  it('has a reach in screen pixels and a corner angle', () => {
    expect(MEASURE_SNAP_PX).toBe(12);
    expect(CORNER_DEGREES).toBe(30);
  });

  it('gives a rectangle its four corners and the middles of its four edges', () => {
    expect(at(contourFeatures(rectangle(0, 0, 40, 20)))).toEqual([
      ['corner', 0, 0],
      ['corner', 40, 0],
      ['corner', 40, 20],
      ['corner', 0, 20],
      ['edge', 20, 0],
      ['edge', 40, 10],
      ['edge', 20, 20],
      ['edge', 0, 10],
    ]);
  });

  it('gives a circle its centre – and nothing of its polygon', () => {
    expect(at(contourFeatures(circle(100, 50, 20)))).toEqual([['centre', 100, 50]]);
  });

  it('gives a polygon that stands for a curve no corners and no edges', () => {
    const curve = { ...circle(0, 0, 40), circle: undefined };
    expect(curve.points.length).toBeGreaterThan(16);
    expect(contourFeatures(curve)).toEqual([]);
  });

  it('gives a rounded rectangle the middles of its straight edges and no corners – the curves have none', () => {
    const features = contourFeatures(rectangle(0, 0, 40, 20, 5));
    expect(features.filter((f) => f.kind === 'corner')).toEqual([]);
    // (in the order the contour runs: it starts on the first arc, so the edge at the bottom comes last)
    expect(at(features).sort()).toEqual(
      [
        ['edge', 20, 0],
        ['edge', 40, 10],
        ['edge', 20, 20],
        ['edge', 0, 10],
      ].sort(),
    );
    expect(features).toHaveLength(4);
  });

  it('counts the ends of an open line as corners, and a turn of 30° or more as one', () => {
    expect(at(contourFeatures(poly(false, [0, 0], [10, 0], [10, 10])))).toEqual([
      ['corner', 0, 0],
      ['corner', 10, 0],
      ['corner', 10, 10],
      ['edge', 5, 0],
      ['edge', 10, 5],
    ]);
    // 29° is not a corner, 30° is (a 10 mm piece, then one that turns by the angle)
    const bent = (deg: number) =>
      poly(
        false,
        [0, 0],
        [10, 0],
        [10 + 10 * Math.cos((deg * Math.PI) / 180), 10 * Math.sin((deg * Math.PI) / 180)],
      );
    expect(contourFeatures(bent(29)).filter((f) => f.kind === 'corner')).toHaveLength(2);
    expect(contourFeatures(bent(30)).filter((f) => f.kind === 'corner')).toHaveLength(3);
  });

  it('works for a triangle, wherever it starts', () => {
    expect(at(contourFeatures(poly(true, [0, 0], [10, 0], [0, 10])))).toEqual([
      ['corner', 0, 0],
      ['corner', 10, 0],
      ['corner', 0, 10],
      ['edge', 5, 0],
      ['edge', 5, 5],
      ['edge', 0, 5],
    ]);
  });

  it('does not count a repeated closing point twice, nor a point that lies twice in a row', () => {
    const closing = poly(true, [0, 0], [10, 0], [10, 10], [0, 10], [0, 0]);
    expect(contourFeatures(closing).filter((f) => f.kind === 'corner')).toHaveLength(4);
    const twice = poly(true, [0, 0], [10, 0], [10, 0], [10, 10], [0, 10]);
    expect(contourFeatures(twice).filter((f) => f.kind === 'corner')).toHaveLength(4);
  });

  it('offers nothing for a line that is straight through a vertex – a middle that is no edge', () => {
    const features = contourFeatures(poly(true, [0, 0], [5, 0], [10, 0], [10, 10], [0, 10]));
    expect(features.filter((f) => f.kind === 'corner')).toHaveLength(4);
    expect(features.filter((f) => f.kind === 'edge').map((f) => [f.x, f.y])).toEqual([
      [10, 5],
      [5, 10],
      [0, 5],
    ]);
  });

  it('has nothing for no points, and for a single point only itself', () => {
    expect(contourFeatures(poly(false))).toEqual([]);
    expect(at(contourFeatures(poly(false, [3, 4])))).toEqual([['corner', 3, 4]]);
    // A closed contour of two points is a line
    expect(at(contourFeatures(poly(true, [0, 0], [10, 0])))).toEqual([
      ['corner', 0, 0],
      ['corner', 10, 0],
      ['edge', 5, 0],
    ]);
  });

  it('takes the parts that are in sight – holes and the back included, hidden ones left out', () => {
    const make = (id: number, source: Contour[], more: Partial<CamItem> = {}): CamItem => ({
      id,
      group: id,
      source,
      placement: IDENTITY,
      contours: place(source, IDENTITY),
      kind: 'outside',
      tabs: false,
      relief: null,
      side: 'front',
      ...more,
    });
    const features = measureFeatures([
      make(1, [rectangle(0, 0, 10, 10)]),
      make(2, [circle(50, 50, 4)], { registration: 1 }),
      make(3, [rectangle(100, 100, 10, 10)], { hidden: true }),
      make(4, [rectangle(200, 0, 10, 10)], { side: 'back' }),
    ]);
    expect(features.filter((f) => f.kind === 'centre').map((f) => [f.x, f.y])).toEqual([[50, 50]]);
    expect(features.some((f) => f.x >= 100 && f.x <= 110 && f.y >= 100)).toBe(false);
    expect(features.some((f) => f.x === 200 && f.y === 0 && f.kind === 'corner')).toBe(true);
  });
});

describe('snapping a measurement point', () => {
  const features: Feature[] = [
    { x: 0, y: 0, kind: 'corner' },
    { x: 10, y: 0, kind: 'corner' },
    { x: 5, y: 0, kind: 'edge' },
  ];

  it('takes the nearest feature within the reach and nothing beyond it – the point stays free', () => {
    expect(snapMeasure({ x: 4, y: 1 }, features, 3)).toEqual({ x: 5, y: 0, kind: 'edge' });
    expect(snapMeasure({ x: 1, y: 1 }, features, 3)).toEqual({ x: 0, y: 0, kind: 'corner' });
    // Nothing clear: 3.2 from the nearest, reach 3
    expect(snapMeasure({ x: 5, y: 3.2 }, features, 3)).toBeNull();
    expect(snapMeasure({ x: 50, y: 50 }, features, 3)).toBeNull();
    expect(snapMeasure({ x: 0, y: 0 }, [], 3)).toBeNull();
  });

  it('takes a feature exactly at the reach, and the first of two at the same distance', () => {
    expect(snapMeasure({ x: 0, y: 5 }, features, 5)).toEqual({ x: 0, y: 0, kind: 'corner' });
    // The point (2.5, 0) is 2.5 from both the corner (0,0) and the edge middle (5,0)
    expect(snapMeasure({ x: 2.5, y: 0 }, features, 3)).toEqual({ x: 0, y: 0, kind: 'corner' });
    expect(snapMeasure({ x: 2.5, y: 0 }, [...features].reverse(), 3)).toEqual({
      x: 5,
      y: 0,
      kind: 'edge',
    });
  });
});

describe('what lies between two points', () => {
  it('reads the distance, ΔX, ΔY and the angle – y up, counter-clockwise', () => {
    const m = measurement({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(m.distance).toBe(50);
    expect([m.dx, m.dy]).toEqual([30, 40]);
    expect(m.angle).toBeCloseTo(53.13010235415598, 10);
    // Towards the back is up: +90; towards the front −90
    expect(measurement({ x: 5, y: 0 }, { x: 5, y: 10 }).angle).toBe(90);
    expect(measurement({ x: 5, y: 10 }, { x: 5, y: 0 })).toMatchObject({
      angle: -90,
      dy: -10,
      dx: 0,
    });
    // To the left is 180, whichever way the sign of a zero falls
    expect(measurement({ x: 0, y: 0 }, { x: -5, y: 0 }).angle).toBe(180);
    expect(measurement({ x: 0, y: 0 }, { x: -5, y: -0 }).angle).toBe(180);
    expect(measurement({ x: 0, y: 0 }, { x: -5, y: 5 }).angle).toBe(135);
    expect(measurement({ x: 0, y: 0 }, { x: -5, y: -5 }).angle).toBe(-135);
  });

  it('is the same distance from either end, with the angle turned half a turn', () => {
    const ab = measurement({ x: 10, y: 20 }, { x: 40, y: -20 });
    const ba = measurement({ x: 40, y: -20 }, { x: 10, y: 20 });
    expect(ab.distance).toBe(ba.distance);
    expect([ab.dx, ab.dy]).toEqual([30, -40]);
    expect([ba.dx, ba.dy]).toEqual([-30, 40]);
    expect(ab.angle - ba.angle).toBeCloseTo(-180, 10);
  });

  it('is nothing at all where the points are one', () => {
    expect(measurement({ x: 7, y: 7 }, { x: 7, y: 7 })).toEqual({
      distance: 0,
      dx: 0,
      dy: 0,
      angle: 0,
    });
    // no negative zero
    expect(Object.is(measurement({ x: 1, y: 1 }, { x: 1, y: 1 }).dx, 0)).toBe(true);
  });
});
