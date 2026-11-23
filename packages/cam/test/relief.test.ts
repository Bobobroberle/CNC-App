import { describe, expect, it } from 'vitest';
import { circle, rectangle, reliefCorners, type Point } from '../src';

const r3 = (points: Point[]) =>
  points.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]);

describe('relief for inside corners', () => {
  it('runs a dogbone diagonally into each corner of a hole until the cutter reaches it', () => {
    const corners = reliefCorners(rectangle(0, 0, 40, 20).points, 'inside', 3, 'dogbone');
    expect(corners).toHaveLength(4);
    // Without relief the cutter (radius 3) turns 3 mm from both walls …
    expect(r3(corners.map((c) => c.turn))).toEqual([
      [3, 3],
      [37, 3],
      [37, 17],
      [3, 17],
    ]);
    // … with it, its centre goes on along the diagonal until it is 3 mm from the corner itself.
    const d = 3 / Math.SQRT2;
    expect(r3(corners.map((c) => c.reach))).toEqual(
      r3([
        { x: d, y: d },
        { x: 40 - d, y: d },
        { x: 40 - d, y: 20 - d },
        { x: d, y: 20 - d },
      ]),
    );
    for (const c of corners) {
      expect(Math.hypot(c.reach.x - c.corner.x, c.reach.y - c.corner.y)).toBeCloseTo(3, 9);
    }
  });

  it('runs a T-bone along the longer edge, so that edge stays straight', () => {
    const corners = reliefCorners(rectangle(0, 0, 40, 10).points, 'inside', 3, 'tbone');
    // The cutter stays 3 mm from the long edges and goes on until it stands over the short one.
    expect(r3(corners.map((c) => c.reach))).toEqual([
      [0, 3],
      [40, 3],
      [40, 7],
      [0, 7],
    ]);
    expect(r3(corners.map((c) => c.turn))).toEqual([
      [3, 3],
      [37, 3],
      [37, 7],
      [3, 7],
    ]);
    // Upright slot: the long edges are the vertical ones.
    const upright = reliefCorners(rectangle(0, 0, 10, 40).points, 'inside', 3, 'tbone');
    expect(r3(upright.map((c) => c.reach))).toEqual([
      [3, 0],
      [7, 0],
      [7, 40],
      [3, 40],
    ]);
    // A square has no longer edge: the notch goes into the edge before the corner.
    const square = reliefCorners(rectangle(0, 0, 20, 20).points, 'inside', 3, 'tbone');
    expect(r3(square.map((c) => c.reach))).toEqual([
      [0, 3],
      [17, 0],
      [20, 17],
      [3, 20],
    ]);
  });

  it('frees the notches of an outline when the cutter runs outside', () => {
    // An L: the only corner the cutter cannot reach from outside is the inner one at 10, 10.
    const l = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    const outside = reliefCorners(l, 'outside', 3, 'dogbone');
    expect(outside).toHaveLength(1);
    expect(outside[0]!.corner).toEqual({ x: 10, y: 10 });
    expect(r3([outside[0]!.turn])).toEqual([[13, 13]]);
    expect(r3([outside[0]!.reach])).toEqual([[12.121, 12.121]]);
    // From inside it is the other five. Drawn clockwise makes no difference.
    expect(reliefCorners(l, 'inside', 3, 'dogbone')).toHaveLength(5);
    const clockwise = reliefCorners([...l].reverse(), 'outside', 3, 'dogbone');
    expect(r3(clockwise.map((c) => c.reach))).toEqual([[12.121, 12.121]]);
  });

  it('reaches into corners that are not square', () => {
    // An equilateral triangle: the cutter turns 2 radii from each corner and goes on for one.
    const h = 30 * Math.sin(Math.PI / 3);
    const corners = reliefCorners(
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 15, y: h },
      ],
      'inside',
      3,
      'dogbone',
    );
    expect(Math.hypot(corners[0]!.turn.x, corners[0]!.turn.y)).toBeCloseTo(6, 9);
    expect(r3([corners[0]!.reach])).toEqual([[2.598, 1.5]]);
    const t = reliefCorners(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 15, y: h },
      ],
      'inside',
      3,
      'tbone',
    );
    // Tangent to the long bottom edge at the corner: straight above it.
    expect(r3([t[0]!.reach])).toEqual([[0, 3]]);
  });

  it('leaves curves, slits and doubled points alone', () => {
    expect(reliefCorners(circle(0, 0, 40).points, 'inside', 3, 'dogbone')).toEqual([]);
    expect(reliefCorners(rectangle(0, 0, 40, 20, 5).points, 'inside', 3, 'dogbone')).toEqual([]);
    // A slit of 2°: no cutter gets in there.
    const slit = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 3.5 },
    ];
    expect(reliefCorners(slit, 'inside', 3, 'dogbone').map((c) => c.corner)).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 3.5 },
    ]);
    const doubled = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ];
    // A corner drawn twice is still one corner.
    expect(reliefCorners(doubled, 'inside', 3, 'dogbone').map((c) => c.corner)).toEqual(
      rectangle(0, 0, 20, 20).points,
    );
  });
});
