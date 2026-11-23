import { describe, expect, it } from 'vitest';
import { boxBlur, crossing, findEdges, nearestOnLine, snapToEdges } from '../src/lib/corner';

/** Same noise on every run. */
function noise(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296 - 0.5;
  };
}

interface Scene {
  /** Tone of the table and of the workpiece, grey levels */
  table?: number;
  board?: number;
  /** ± grey levels of speckle */
  grain?: number;
  /** Dark round holes in the board */
  holes?: { x: number; y: number; r: number }[];
}

/**
 * A picture of `size` × `size` px: a workpiece on a table. `inside(x, y)`
 * says where the workpiece is; edges are anti-aliased by 4 × 4 supersampling.
 */
function picture(size: number, inside: (x: number, y: number) => boolean, scene: Scene = {}) {
  const { table = 158, board = 215, grain = 10, holes = [] } = scene;
  const rnd = noise(42);
  const gray = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let on = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) on++;
        }
      }
      let v = table + ((board - table) * on) / 16 + rnd() * 2 * grain;
      if (holes.some((h) => (x + 0.5 - h.x) ** 2 + (y + 0.5 - h.y) ** 2 <= h.r * h.r)) v = 35;
      gray[y * size + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return gray;
}

/** A board whose corner lies at (cx, cy), turned by `deg`; it fills the quarter towards +x, −y (up right). */
const quarter = (cx: number, cy: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return (x: number, y: number) => {
    const dx = x - cx;
    const dy = cy - y;
    const u = dx * Math.cos(a) + dy * Math.sin(a);
    const v = -dx * Math.sin(a) + dy * Math.cos(a);
    return u >= 0 && v >= 0;
  };
};

describe('workpiece edges in the camera picture', () => {
  it('finds the corner of a light board on a darker table to a fraction of a pixel', () => {
    for (const [cx, cy, deg] of [
      [118.3, 131.6, 1.5],
      [90.5, 150.2, -4],
      [140, 100, 12],
    ] as const) {
      const edges = findEdges(picture(240, quarter(cx, cy, deg)), 240, 240)!;
      expect(edges.lines.length).toBe(2);
      expect(edges.corner!.x).toBeCloseTo(cx, 0);
      expect(edges.corner!.y).toBeCloseTo(cy, 0);
      expect(Math.hypot(edges.corner!.x - cx, edges.corner!.y - cy)).toBeLessThan(0.6);
    }
  });

  it('works the other way round (dark workpiece, light table) and beside a hole', () => {
    const dark = findEdges(
      picture(240, quarter(120, 120, 2), { table: 210, board: 120 }),
      240,
      240,
    )!;
    expect(Math.hypot(dark.corner!.x - 120, dark.corner!.y - 120)).toBeLessThan(0.6);
    // A hole of the board reaches into the picture: round, so it is no border.
    const holed = findEdges(
      picture(240, quarter(100, 140, 1.5), { holes: [{ x: 215, y: 30, r: 40 }] }),
      240,
      240,
    )!;
    expect(Math.hypot(holed.corner!.x - 100, holed.corner!.y - 140)).toBeLessThan(0.8);
  });

  it('gives one border for a straight edge, and its direction', () => {
    // The lower edge of a board turned by 1.5°: the picture's y runs down.
    const a = (1.5 * Math.PI) / 180;
    const edge = (x: number, y: number) => 130 - y - (x - 120) * Math.tan(a) >= 0;
    const edges = findEdges(picture(240, edge), 240, 240)!;
    expect(edges.lines.length).toBe(1);
    expect(edges.corner).toBeNull();
    const line = edges.lines[0]!;
    const angle = (Math.atan2(-line.dy, line.dx) * 180) / Math.PI;
    const folded = ((angle + 270) % 180) - 90;
    expect(folded).toBeCloseTo(1.5, 1);
    expect(nearestOnLine(line, { x: 120, y: 200 }).y).toBeCloseTo(130, 0);
  });

  it('finds nothing where there is nothing clear to find', () => {
    // Plain wood with grain.
    expect(
      findEdges(
        picture(240, () => true),
        240,
        240,
      ),
    ).toBeNull();
    // Too little contrast between table and board.
    expect(
      findEdges(picture(240, quarter(120, 120, 0), { table: 200, board: 212 }), 240, 240),
    ).toBeNull();
    // Only a sliver of table in the picture.
    expect(findEdges(picture(240, quarter(6, 236, 0)), 240, 240)).toBeNull();
    // Round things only: the dots of the calibration plate.
    const dots = (x: number, y: number) =>
      [40, 120, 200].some((cx) =>
        [40, 120, 200].some((cy) => (x - cx) ** 2 + (y - cy) ** 2 <= 30 * 30),
      );
    expect(findEdges(picture(240, dots, { table: 235, board: 30 }), 240, 240)).toBeNull();
    // A short step in the border is not an edge of its own.
    const step = (x: number, y: number) => y < (x < 120 ? 100 : 140);
    const stepped = findEdges(picture(240, step), 240, 240)!;
    expect(stepped.corner).toBeNull();
  });

  it('does not call a pointed or blunt meeting of two borders a corner', () => {
    // A wedge of 40°.
    const a = (40 * Math.PI) / 180;
    const wedge = (x: number, y: number) => {
      const dx = x - 60;
      const dy = 180 - y;
      return dy >= 0 && dy <= dx * Math.tan(a);
    };
    const edges = findEdges(picture(240, wedge), 240, 240)!;
    expect(edges.lines.length).toBe(2);
    expect(edges.corner).toBeNull();
  });

  it('snaps a tap to the corner or to the nearest edge within reach, else leaves it', () => {
    const edges = findEdges(picture(240, quarter(120, 120, 0)), 240, 240)!;
    const corner = snapToEdges({ x: 140, y: 100 }, edges, 'corner', 60)!;
    expect(corner.x).toBeCloseTo(120, 0);
    expect(corner.y).toBeCloseTo(120, 0);
    expect(snapToEdges({ x: 200, y: 40 }, edges, 'corner', 60)).toBeNull();
    // The vertical edge x = 120 (above the corner) and the horizontal one y = 120 (right of it).
    const onVertical = snapToEdges({ x: 131, y: 40 }, edges, 'edge', 40)!;
    expect(onVertical.x).toBeCloseTo(120, 0);
    expect(onVertical.y).toBeCloseTo(40, 0);
    const onHorizontal = snapToEdges({ x: 200, y: 112 }, edges, 'edge', 40)!;
    expect(onHorizontal.x).toBeCloseTo(200, 0);
    expect(onHorizontal.y).toBeCloseTo(120, 0);
    expect(snapToEdges({ x: 200, y: 40 }, edges, 'edge', 40)).toBeNull();
    expect(snapToEdges({ x: 120, y: 120 }, null, 'corner', 40)).toBeNull();
    expect(snapToEdges({ x: 120, y: 120 }, { lines: [], corner: null }, 'corner', 40)).toBeNull();
  });

  it('has the helpers it is built from', () => {
    const flat = boxBlur(new Uint8Array(25).fill(100), 5, 5);
    expect([...flat].every((v) => v === 100)).toBe(true);
    const spike = new Uint8Array(25);
    spike[12] = 250;
    expect(boxBlur(spike, 5, 5)[12]).toBe(10);
    const h = { x: 0, y: 5, dx: 1, dy: 0, support: 0 };
    const v = { x: 3, y: 0, dx: 0, dy: 1, support: 0 };
    expect(crossing(h, v)).toEqual({ x: 3, y: 5 });
    expect(crossing(h, { ...h, y: 9 })).toBeNull();
  });
});
