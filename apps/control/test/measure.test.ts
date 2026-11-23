import { describe, expect, it } from 'vitest';
import { findMarker } from '../src/lib/markers';
import { cropAround, measure, nearestPoint, snapsTo } from '../src/lib/measure';

describe('measuring by tapping', () => {
  it('gives distance, the parts along X and Y and the angle against X', () => {
    const m = measure({ x: 10, y: 20 }, { x: 13, y: 24 });
    expect(m.distance).toBe(5);
    expect(m.dx).toBe(3);
    expect(m.dy).toBe(4);
    expect(m.angle).toBeCloseTo(53.13, 2);
    // Two holes of the simulated board, 200 mm apart on a board turned by 1.5°.
    const a = (1.5 * Math.PI) / 180;
    const holes = measure({ x: 0, y: 0 }, { x: 200 * Math.cos(a), y: 200 * Math.sin(a) });
    expect(holes.distance).toBeCloseTo(200, 9);
    expect(holes.angle).toBeCloseTo(1.5, 9);
    // The order of the taps turns the signs, not the angle of the line.
    const back = measure({ x: 13, y: 24 }, { x: 10, y: 20 });
    expect([back.dx, back.dy]).toEqual([-3, -4]);
    expect(back.angle).toBeCloseTo(53.13, 2);
  });

  it('finds the tapped point a finger takes hold of', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(nearestPoint(points, { x: 1, y: 1 }, 3)).toBe(0);
    expect(nearestPoint(points, { x: 8, y: 0 }, 3)).toBe(1);
    // Both within reach: the nearer one.
    expect(nearestPoint(points, { x: 6, y: 0 }, 8)).toBe(1);
    expect(nearestPoint(points, { x: 5, y: 5 }, 3)).toBe(-1);
    expect(nearestPoint([], { x: 0, y: 0 }, 3)).toBe(-1);
  });

  it('cuts the picture around a tap, clipped at its edges', () => {
    const size = { width: 1200, height: 900 };
    expect(cropAround({ x: 600.4, y: 450.6 }, size, 200)).toEqual({
      x: 400,
      y: 250,
      width: 401,
      height: 401,
    });
    expect(cropAround({ x: 50, y: 880 }, size, 200)).toEqual({
      x: 0,
      y: 680,
      width: 250,
      height: 220,
    });
    // Nothing useful left right in a corner.
    expect(cropAround({ x: 0, y: 0 }, size, 5)).toBeNull();
    expect(cropAround({ x: 600, y: 899 }, size, 6)).toBeNull();
  });

  /** A light board with dark holes, 10 px per mm. */
  function board(width: number, height: number, holes: { x: number; y: number; r: number }[]) {
    const gray = new Uint8Array(width * height).fill(215);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (holes.some((h) => (x + 0.5 - h.x) ** 2 + (y + 0.5 - h.y) ** 2 <= h.r * h.r)) {
          gray[y * width + x] = 35;
        }
      }
    }
    return gray;
  }

  it('snaps a tap on or right beside a hole to its centre, and leaves other taps alone', () => {
    // An Ø 8 mm hole (r = 40 px) a little off the middle of a 400 px crop.
    const hole = { x: 215.5, y: 190.5, r: 40 };
    const marker = findMarker(board(400, 400, [hole]), 400, 400, { maxShare: 0.7 });
    expect(marker).not.toBeNull();
    expect(marker!.x).toBeCloseTo(hole.x, 0);
    expect(marker!.y).toBeCloseTo(hole.y, 0);
    expect(marker!.diameter / 10).toBeCloseTo(8, 1);
    const reach = 30;
    // The tap in the middle of the crop lies on the hole.
    expect(snapsTo({ x: 200, y: 200 }, marker, reach)).toBe(true);
    // On its rim, and 2 mm beside it.
    expect(snapsTo({ x: 255, y: 190 }, marker, reach)).toBe(true);
    expect(snapsTo({ x: 275, y: 190 }, marker, reach)).toBe(true);
    // 5 mm beside the rim is a point of its own.
    expect(snapsTo({ x: 310, y: 190 }, marker, reach)).toBe(false);
    // Nothing round in the crop: nothing to snap to.
    expect(findMarker(board(400, 400, []), 400, 400)).toBeNull();
    expect(snapsTo({ x: 200, y: 200 }, null, reach)).toBe(false);
  });
});
