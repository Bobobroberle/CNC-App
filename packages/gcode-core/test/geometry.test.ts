import { describe, expect, it } from 'vitest';
import {
  arcChordCount,
  closestPoint,
  emptyBounds,
  includeSegment,
  interpret,
  isEmptyBounds,
  nearestSegment,
  pointAt,
  programBounds,
  segmentPoints,
} from '../src';

const segs = (text: string) => interpret(text).segments;

describe('pointAt and segmentPoints', () => {
  it('interpolates lines including A', () => {
    const [s] = segs('G1 X10 Y20 Z-4 A90 F100');
    expect(pointAt(s!, 0.5)).toEqual({ x: 5, y: 10, z: -2, a: 45 });
    expect(segmentPoints(s!)).toEqual([s!.from, s!.to]);
  });

  it('follows the arc and keeps exact end points', () => {
    const s = segs('G0 X10\nG3 X-10 Y0 Z-2 I-10 F100')[1]!;
    const mid = pointAt(s, 0.5);
    expect(mid.x).toBeCloseTo(0);
    expect(mid.y).toBeCloseTo(10);
    expect(mid.z).toBeCloseTo(-1);
    expect(pointAt(s, 1)).toEqual(s.to);
    const points = segmentPoints(s, 0.01);
    expect(points.length).toBeGreaterThan(10);
    for (const p of points) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 6);
  });

  it('maps arcs in other planes back to XYZ', () => {
    const s = segs('G18 G0 X10\nG3 X-10 Z0 I-10 F100')[1]!;
    const mid = pointAt(s, 0.5);
    expect(Math.abs(mid.z)).toBeCloseTo(10);
    expect(mid.y).toBe(0);
  });

  it('computes the chord count like the firmware', () => {
    expect(arcChordCount(0.001, Math.PI, 0.002)).toBe(1);
    expect(arcChordCount(10, 0.001, 0.002)).toBe(1);
    expect(arcChordCount(10, 2 * Math.PI, 0.002)).toBe(157);
  });
});

describe('bounds', () => {
  it('starts empty', () => {
    expect(isEmptyBounds(emptyBounds())).toBe(true);
    expect(isEmptyBounds(programBounds([]))).toBe(true);
  });

  it('includes arc extremes, not only end points', () => {
    const s = segs('G0 X10\nG3 X-10 Y0 I-10 F100')[1]!;
    const b = emptyBounds();
    includeSegment(b, s);
    expect(b.max.y).toBeCloseTo(10);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.min.x).toBe(-10);
    const cw = segs('G0 X10\nG2 X-10 Y0 I-10 F100')[1]!;
    const b2 = emptyBounds();
    includeSegment(b2, cw);
    expect(b2.min.y).toBeCloseTo(-10);
    const full = segs('G0 X10\nG2 X10 I-10 F100')[1]!;
    const b3 = emptyBounds();
    includeSegment(b3, full);
    expect(b3.min.x).toBeCloseTo(-10);
    expect(b3.max.y).toBeCloseTo(10);
  });

  it('can exclude rapids and G53 moves', () => {
    const s = segs('G53 G0 Z-1\nG53 G0 Z0\nG0 X50\nG1 X10 F100');
    expect(programBounds(s).max.x).toBe(50);
    expect(programBounds(s).min.z).toBe(0);
    expect(programBounds(s, { includeRapids: false }).max.x).toBe(50);
    expect(programBounds(s, { includeRapids: false }).min.x).toBe(10);
    expect(programBounds(s, { excludeMachineMoves: false }).min.z).toBe(-1);
  });
});

describe('closestPoint', () => {
  it('projects onto lines and clamps to the ends', () => {
    const [s] = segs('G1 X10 Z-10 F100');
    expect(closestPoint(s!, { x: 5, y: 3, z: 0, a: 0 })).toMatchObject({ t: 0.5, distance: 3 });
    expect(closestPoint(s!, { x: -5, y: 0, z: 0, a: 0 }).t).toBe(0);
    expect(closestPoint(s!, { x: 15, y: 0, z: 0, a: 0 }).t).toBe(1);
    const xyz = closestPoint(s!, { x: 5, y: 0, z: 0, a: 0 }, 'xyz');
    expect(xyz).toMatchObject({ t: 0.25 });
    expect(xyz.distance).toBeCloseTo(Math.hypot(2.5, 2.5));
  });

  it('handles zero-length segments', () => {
    const [s] = segs('G1 Z0 F100');
    expect(closestPoint(s!, { x: 3, y: 4, z: 0, a: 0 })).toMatchObject({ t: 0, distance: 5 });
  });

  it('projects analytically onto XY arcs', () => {
    const s = segs('G0 X10\nG3 X-10 Y0 I-10 F100')[1]!;
    const c = closestPoint(s, { x: 0, y: 12, z: 0, a: 0 });
    expect(c.t).toBeCloseTo(0.5);
    expect(c.distance).toBeCloseTo(2);
    // outside of the sweep → nearest end point
    expect(closestPoint(s, { x: 11, y: -1, z: 0, a: 0 }).t).toBe(0);
    expect(closestPoint(s, { x: -11, y: -1, z: 0, a: 0 }).t).toBe(1);
    const cw = segs('G0 X10\nG2 X-10 Y0 I-10 F100')[1]!;
    expect(closestPoint(cw, { x: 0, y: -9, z: 0, a: 0 }).distance).toBeCloseTo(1);
  });

  it('falls back to a polyline for other planes and XYZ distance', () => {
    const s = segs('G0 X10\nG3 X-10 Y0 Z-5 I-10 F100')[1]!;
    const c = closestPoint(s, { x: 0, y: 10, z: -2.5, a: 0 }, 'xyz');
    expect(c.distance).toBeLessThan(0.01);
    expect(c.t).toBeCloseTo(0.5, 2);
    const zx = segs('G18 G0 X10\nG3 X-10 Z0 I-10 F100')[1]!;
    expect(closestPoint(zx, { x: 0, y: 0, z: 0, a: 0 }).distance).toBeLessThan(0.01);
  });
});

describe('nearestSegment', () => {
  const s = segs('G0 X0 Y0\nG1 X10 F100\nG1 Y10\nG0 X50');
  it('finds the nearest segment', () => {
    expect(nearestSegment(s, { x: 10.5, y: 5, z: 0, a: 0 })).toMatchObject({
      index: 2,
      distance: 0.5,
    });
  });
  it('respects the search window and rapids option', () => {
    expect(nearestSegment(s, { x: 30, y: 10, z: 0, a: 0 })?.index).toBe(3);
    expect(nearestSegment(s, { x: 30, y: 10, z: 0, a: 0 }, { includeRapids: false })?.index).toBe(
      2,
    );
    expect(nearestSegment(s, { x: 10.5, y: 5, z: 0, a: 0 }, { from: -3, to: 2 })?.index).toBe(1);
    expect(nearestSegment(s, { x: 0, y: 0, z: 0, a: 0 }, { from: 9 })).toBeNull();
  });
});
