import { describe, expect, it } from 'vitest';
import {
  applyToPoint,
  contourBounds,
  nestMatrix,
  nestParts,
  rectangle,
  rotation,
  transformContour,
  type NestOptions,
  type NestPart,
  type NestResult,
  type NestPlacement,
  type NestStock,
} from '../src';

/**
 * Nesting of boxes. The small cases were worked out by hand from the rules of `nestParts` (the gap is added
 * to the boxes and to the stock inside its margin; a part goes to the lower left corner of a free rectangle;
 * four runs, the best kept); the properties are held over seeded random inputs.
 */

const part = (id: number, width: number, height: number): NestPart => ({ id, width, height });
const at = (r: NestResult, id: number) => r.placed.find((p) => p.id === id);
const spot = (p: NestPlacement | undefined) => p && [p.x, p.y, p.turned];

describe('nesting boxes by hand', () => {
  it('puts two boxes side by side, with the gap and the margin: the example of the documentation', () => {
    // Stock 100 × 50, margin 5, gap 5: the boxes of 40 × 40 stand at x = 5 and 5 + 40 + 5 = 50
    const r = nestParts(
      [part(1, 40, 40), part(2, 40, 40)],
      { width: 100, height: 50 },
      { gap: 5, margin: 5 },
    );
    expect(r.placed).toEqual([
      { id: 1, x: 5, y: 5, turned: false },
      { id: 2, x: 50, y: 5, turned: false },
    ]);
    expect(r.unplaced).toEqual([]);
    expect(r.used).toBeCloseTo(3200 / 5000, 12);
  });

  it('lists what has no room: the third of three boxes of 50 × 50 on 100 × 50', () => {
    const r = nestParts([part(1, 50, 50), part(2, 50, 50), part(3, 50, 50)], {
      width: 100,
      height: 50,
    });
    expect(r.placed.map((p) => [p.id, p.x, p.y])).toEqual([
      [1, 0, 0],
      [2, 50, 0],
    ]);
    expect(r.unplaced).toEqual([3]);
    expect(r.used).toBe(1);
  });

  it('counts the margin and the gap: four of 40 × 40 on 110 × 110 (margin 10, gap 5) and not on 100 × 100', () => {
    // usable 90 × 90, boxes of 40 + 5 + 40 = 85 each way: two by two, in the order of the input
    const four = [part(1, 40, 40), part(2, 40, 40), part(3, 40, 40), part(4, 40, 40)];
    const roomy = nestParts(four, { width: 110, height: 110 }, { gap: 5, margin: 10 });
    expect(roomy.placed.map((p) => [p.id, p.x, p.y])).toEqual([
      [1, 10, 10],
      [2, 55, 10],
      [3, 10, 55],
      [4, 55, 55],
    ]);
    // usable 80 × 80 < 85: one is all that fits
    const tight = nestParts(four, { width: 100, height: 100 }, { gap: 5, margin: 10 });
    expect(tight.placed.map((p) => [p.id, p.x, p.y])).toEqual([[1, 10, 10]]);
    expect(tight.unplaced).toEqual([2, 3, 4]);
    // A box that is exactly as large as the usable stock fits
    expect(
      nestParts([part(1, 80, 80)], { width: 100, height: 100 }, { margin: 10 }).placed,
    ).toEqual([{ id: 1, x: 10, y: 10, turned: false }]);
  });

  it('turns a box only when it may, and then only by 90°: 100 × 20 on 30 × 200', () => {
    const stock = { width: 30, height: 200 };
    const flat = nestParts([part(1, 100, 20)], stock);
    expect(flat.placed).toEqual([]);
    expect(flat.unplaced).toEqual([1]);
    expect(flat.used).toBe(0);
    const turned = nestParts([part(1, 100, 20)], stock, { rotate: true });
    expect(turned.placed).toEqual([{ id: 1, x: 0, y: 0, turned: true }]);
    expect(turned.used).toBeCloseTo(2000 / 6000, 12);
    // A square is never turned, and what fits as it is stays as it is
    expect(nestParts([part(1, 20, 20)], stock, { rotate: true }).placed[0]!.turned).toBe(false);
    expect(nestParts([part(1, 20, 100)], stock, { rotate: true }).placed[0]!.turned).toBe(false);
  });

  it('has the run that places the most area win: the boxes are taken by area or by their longer side', () => {
    // 60 × 50. By area the 30 × 40 goes first and spoils the room for the two 50 × 20 (1200 placed);
    // by the longer side the two 50 × 20 stack at the bottom (2000 placed), and 30 × 40 has no room
    const r = nestParts([part(1, 30, 40), part(2, 50, 20), part(3, 50, 20)], {
      width: 60,
      height: 50,
    });
    expect(r.placed).toEqual([
      { id: 2, x: 0, y: 0, turned: false },
      { id: 3, x: 0, y: 20, turned: false },
    ]);
    expect(r.unplaced).toEqual([1]);
    expect(r.used).toBeCloseTo(2000 / 3000, 12);
  });

  it('chooses where a box goes by the rule that places most: 30 × 10, 20 × 30 and 20 × 20 on 40 × 50', () => {
    // Taken by area: 20 × 30 first, at (0, 0). The best-short-side rule then puts the 20 × 20 on top of it
    // and the 30 × 10 has no room (1000 placed). Bottom-left puts it beside the 20 × 30, at (20, 0), and
    // the 30 × 10 fits on top of both: all three (1300)
    const r = nestParts([part(1, 30, 10), part(2, 20, 30), part(3, 20, 20)], {
      width: 40,
      height: 50,
    });
    expect([spot(at(r, 1)), spot(at(r, 2)), spot(at(r, 3))]).toEqual([
      [0, 30, false],
      [0, 0, false],
      [20, 0, false],
    ]);
    expect(r.unplaced).toEqual([]);
    expect(r.used).toBeCloseTo(1300 / 2000, 12);
  });

  it('takes the layout with the smaller box round the placed parts where the same area is placed', () => {
    // 10 × 10 and 30 × 10 on 60 × 30. Best short side puts the small one on top of the large one at
    // (0, 10): the box round them is 30 × 20 = 600. Bottom-left puts it beside it at (30, 0): 40 × 10 = 400
    const r = nestParts([part(1, 10, 10), part(2, 30, 10)], { width: 60, height: 30 });
    expect([spot(at(r, 1)), spot(at(r, 2))]).toEqual([
      [30, 0, false],
      [0, 0, false],
    ]);
    expect(r.used).toBeCloseTo(400 / 1800, 12);
  });

  it('keeps the earlier run where nothing tells them apart, and the input order of equal boxes', () => {
    const r = nestParts([part(7, 10, 10), part(5, 10, 10), part(6, 10, 10)], {
      width: 20,
      height: 20,
    });
    expect(r.placed.map((p) => [p.id, p.x, p.y])).toEqual([
      [7, 0, 0],
      [5, 10, 0],
      [6, 0, 10],
    ]);
  });

  it('does not lose a box that fits exactly to the rounding of decimals', () => {
    // 0.1 + 0.1 + 0.1 is 0.30000000000000004 and 0.3 − 0.2 is 0.09999999999999998
    const r = nestParts([part(1, 0.1, 0.1), part(2, 0.1, 0.1), part(3, 0.1, 0.1)], {
      width: 0.3,
      height: 0.1,
    });
    expect(r.unplaced).toEqual([]);
    // 76.2 mm (three inches): three boxes with 2 mm between on 3 · 76.2 + 4 + 2 · 3.1
    const inches = [part(1, 76.2, 40), part(2, 76.2, 40), part(3, 76.2, 40)];
    const wide = nestParts(
      inches,
      { width: 3 * 76.2 + 4 + 6.2, height: 40 + 6.2 },
      { gap: 2, margin: 3.1 },
    );
    expect(wide.unplaced).toEqual([]);
  });

  it('takes any kind of id', () => {
    const r = nestParts(
      [
        { id: 'a', width: 50, height: 50 },
        { id: 'b', width: 50, height: 50 },
        { id: 'c', width: 50, height: 50 },
      ],
      { width: 100, height: 50 },
    );
    expect(r.placed.map((p) => p.id)).toEqual(['a', 'b']);
    expect(r.unplaced).toEqual(['c']);
  });

  it('does not throw for what cannot be placed, and says where it went', () => {
    const stock = { width: 100, height: 100 };
    const nothing = [
      part(1, NaN, 10),
      part(2, 10, NaN),
      part(3, 0, 10),
      part(4, 10, 0),
      part(5, -10, 10),
      part(6, 10, -10),
      part(7, Infinity, 10),
      part(8, 10, Infinity),
      part(9, 200, 10),
      part(10, 10, 10),
    ];
    const r = nestParts(nothing, stock);
    expect(r.placed).toEqual([{ id: 10, x: 0, y: 0, turned: false }]);
    expect(r.unplaced).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.used).toBeCloseTo(0.01, 12);
    // A stock that is no stock: nothing is placed, and the share of nothing is 0, not NaN
    for (const bad of [
      { width: NaN, height: 100 },
      { width: 100, height: 0 },
      { width: 0, height: 0 },
      { width: -5, height: -5 },
      { width: Infinity, height: 100 },
    ]) {
      const none = nestParts([part(1, 10, 10)], bad);
      expect(none.used).toBe(0);
      if (bad.width === Infinity) expect(none.placed).toHaveLength(1);
      else expect(none.unplaced).toEqual([1]);
    }
    // Nothing to place
    expect(nestParts([], stock)).toEqual({ placed: [], unplaced: [], used: 0 });
    // A margin that leaves no stock
    expect(nestParts([part(1, 10, 10)], stock, { margin: 50 }).unplaced).toEqual([1]);
    expect(nestParts([part(1, 10, 10)], stock, { margin: 60 }).unplaced).toEqual([1]);
  });

  it('takes a gap or a margin that is no number, or negative, for none', () => {
    const parts = [part(1, 50, 50), part(2, 50, 50)];
    const stock = { width: 100, height: 50 };
    const plain = nestParts(parts, stock);
    for (const options of [
      { gap: NaN, margin: NaN },
      { gap: -5, margin: -5 },
      { gap: Infinity, margin: -Infinity },
      { gap: undefined, margin: undefined },
    ] as NestOptions[]) {
      expect(nestParts(parts, stock, options)).toEqual(plain);
    }
    expect(plain.unplaced).toEqual([]);
  });
});

/** A small deterministic generator (mulberry32): the cases of the properties are the same on every run */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('nesting boxes: the properties, over 300 random cases', () => {
  const tol = 1e-9;

  for (const rotate of [false, true]) {
    it(`never overlaps, keeps the gap and the margin, loses nothing (rotate: ${rotate})`, () => {
      let placedTotal = 0;
      let unplacedTotal = 0;
      let turnedTotal = 0;
      for (let c = 0; c < 300; c++) {
        const next = random(1000 * (rotate ? 2 : 1) + c);
        const pick = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
        const half = (lo: number, hi: number) => pick(lo * 2, hi * 2) / 2;
        const margin = [0, 0, 2.5, 5][pick(0, 3)]!;
        const gap = [0, 1, 2.5, 6][pick(0, 3)]!;
        const stock: NestStock = { width: half(40, 300), height: half(40, 300) };
        // Some cases are crowded, some roomy, and a part now and then is larger than the stock
        const size = Math.max(4, Math.floor(Math.min(stock.width, stock.height) / pick(2, 12)));
        const parts: NestPart[] = Array.from({ length: pick(1, 40) }, (_, i) => ({
          id: i * 7 + 3,
          width: next() < 0.03 ? stock.width + half(1, 20) : half(3, size),
          height: half(3, size),
        }));
        const options = { gap, margin, rotate };
        const copy = JSON.parse(JSON.stringify(parts)) as NestPart[];
        const r = nestParts(parts, stock, options);
        const note = `case ${c}`;

        // The input is left as it was, and the same input gives the same answer
        expect(parts, note).toEqual(copy);
        expect(nestParts(copy, stock, options), note).toEqual(r);

        // Every part is placed or listed – once
        const ids = [...r.placed.map((p) => p.id), ...r.unplaced].sort((a, b) => a - b);
        expect(ids, note).toEqual(parts.map((p) => p.id));
        // ... in the order of the input
        const order = (list: number[]) => list.map((id) => parts.findIndex((p) => p.id === id));
        expect(order(r.placed.map((p) => p.id)), note).toEqual(
          [...order(r.placed.map((p) => p.id))].sort((a, b) => a - b),
        );

        const box = r.placed.map((p) => {
          const q = parts.find((o) => o.id === p.id)!;
          return {
            x: p.x,
            y: p.y,
            w: p.turned ? q.height : q.width,
            h: p.turned ? q.width : q.height,
          };
        });
        r.placed.forEach((p, i) => {
          // Inside the stock, the margin from its rim
          expect(box[i]!.x, note).toBeGreaterThanOrEqual(margin - tol);
          expect(box[i]!.y, note).toBeGreaterThanOrEqual(margin - tol);
          expect(box[i]!.x + box[i]!.w, note).toBeLessThanOrEqual(stock.width - margin + tol);
          expect(box[i]!.y + box[i]!.h, note).toBeLessThanOrEqual(stock.height - margin + tol);
          // Nothing is turned that may not be, and a square never is
          if (!rotate) expect(p.turned, note).toBe(false);
          if (box[i]!.w === box[i]!.h) expect(p.turned, note).toBe(false);
          if (p.turned) turnedTotal++;
        });
        // No two boxes closer than the gap: apart by at least that along x or along y
        for (let i = 0; i < box.length; i++) {
          for (let j = i + 1; j < box.length; j++) {
            const a = box[i]!;
            const b = box[j]!;
            const apartX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
            const apartY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
            expect(Math.max(apartX, apartY), `${note}: ${i} and ${j}`).toBeGreaterThanOrEqual(
              gap - tol,
            );
          }
        }

        // A part that cannot be inside the usable stock any way it may lie is not placed
        const usableW = stock.width - 2 * margin;
        const usableH = stock.height - 2 * margin;
        for (const p of parts) {
          const fits =
            (p.width <= usableW && p.height <= usableH) ||
            (rotate && p.height <= usableW && p.width <= usableH);
          if (!fits) expect(r.unplaced, note).toContain(p.id);
        }

        // The share of the stock: the placed boxes over all of it
        const sum = box.reduce((a, b) => a + b.w * b.h, 0);
        expect(r.used, note).toBeCloseTo(sum / (stock.width * stock.height), 9);
        expect(r.used).toBeLessThanOrEqual(1);
        placedTotal += r.placed.length;
        unplacedTotal += r.unplaced.length;
      }
      // The cases are not all easy and not all hopeless (seeded: 5649 placed and 442 not without turning, 5936 and 504 with)
      expect(placedTotal).toBeGreaterThan(5000);
      expect(unplacedTotal).toBeGreaterThan(300);
      if (rotate) expect(turnedTotal).toBeGreaterThan(1000);
      else expect(turnedTotal).toBe(0);
    });
  }

  it('places a grid of equal boxes completely, with a gap and a margin', () => {
    for (const [w, h] of [
      [10, 10],
      [12.5, 7.5],
    ]) {
      for (const gap of [0, 2.5]) {
        for (const margin of [0, 5]) {
          for (const rotate of [false, true]) {
            for (const columns of [1, 2, 5, 8]) {
              for (const rows of [1, 3, 6]) {
                const width = 2 * margin + columns * w! + (columns - 1) * gap;
                const height = 2 * margin + rows * h! + (rows - 1) * gap;
                const parts = Array.from({ length: columns * rows }, (_, i) => part(i, w!, h!));
                const r = nestParts(parts, { width, height }, { gap, margin, rotate });
                expect(
                  r.unplaced,
                  JSON.stringify({ w, h, gap, margin, rotate, columns, rows }),
                ).toEqual([]);
                // ... and as the grid it is: the boxes lie where the cells of the grid do
                const xs = new Set(r.placed.map((p) => p.x));
                if (!rotate) expect(xs.size).toBe(columns);
                expect(r.used).toBeCloseTo((columns * rows * w! * h!) / (width * height), 9);
              }
            }
          }
        }
      }
    }
  });

  it('is deterministic whatever the numbers look like: the same parts in the same order give the same answer', () => {
    const next = random(42);
    const parts = Array.from({ length: 25 }, (_, i) => part(i, 5 + next() * 90, 5 + next() * 90));
    const stock = { width: 250.3, height: 190.7 };
    const first = nestParts(parts, stock, { gap: 3.3, margin: 1.7, rotate: true });
    for (let k = 0; k < 3; k++)
      expect(nestParts(parts, stock, { gap: 3.3, margin: 1.7, rotate: true })).toEqual(first);
  });
});

describe('the map that takes a box to its place', () => {
  const box = { minX: 10, minY: 20, maxX: 40, maxY: 35 };
  const corners = [
    { x: 10, y: 20 },
    { x: 40, y: 20 },
    { x: 10, y: 35 },
    { x: 40, y: 35 },
  ];
  const through = (m: ReturnType<typeof nestMatrix>) => corners.map((p) => applyToPoint(m, p));

  it('shifts a box that stays: (10, 20)–(40, 35) placed at (100, 200)', () => {
    expect(through(nestMatrix({ x: 100, y: 200, turned: false }, box))).toEqual([
      { x: 100, y: 200 },
      { x: 130, y: 200 },
      { x: 100, y: 215 },
      { x: 130, y: 215 },
    ]);
  });

  it('turns a box 90° counter-clockwise and puts its lower left corner at the place: it then spans (100, 200)–(115, 230)', () => {
    const m = nestMatrix({ x: 100, y: 200, turned: true }, box);
    // The box is 30 wide and 15 high; turned it is 15 wide and 30 high. Its lower left corner goes to the
    // lower right, its lower right to the upper right, its upper left to the lower left
    expect(through(m)).toEqual([
      { x: 115, y: 200 },
      { x: 115, y: 230 },
      { x: 100, y: 200 },
      { x: 100, y: 230 },
    ]);
    // An exact quarter turn: x' = −y + e, y' = x + f
    expect([m.a, m.b, m.c, m.d].map((v) => v + 0)).toEqual([0, 1, -1, 0]);
  });

  it('puts the stock where it lies: the origin is added', () => {
    const origin = { x: 1000, y: 2000 };
    expect(through(nestMatrix({ x: 100, y: 200, turned: false }, box, origin))[0]).toEqual({
      x: 1100,
      y: 2200,
    });
    expect(through(nestMatrix({ x: 100, y: 200, turned: true }, box, origin))[1]).toEqual({
      x: 1115,
      y: 2230,
    });
  });

  it('puts a part of any pose into the box that was found for it', () => {
    // A rectangle of 30 × 15 turned by 30°: its box is the upright one round it. Nest it with the 100 × 20
    // that is too long for the stock the other way round; the map takes the part's contour onto the box.
    const lying = rotation(30, { x: 5, y: 5 });
    const part0 = transformContour(rectangle(0, 0, 30, 15), lying);
    const b = contourBounds([part0])!;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const stock = { width: h + 2, height: w + 2 };
    const r = nestParts([{ id: 1, width: w, height: h }], stock, { margin: 1, rotate: true });
    expect(r.placed).toEqual([{ id: 1, x: 1, y: 1, turned: true }]);
    const m = nestMatrix(r.placed[0]!, b);
    const moved = contourBounds([transformContour(part0, m)])!;
    // Turned it is h wide and w high, with its lower left corner at (1, 1)
    expect(moved.minX).toBeCloseTo(1, 9);
    expect(moved.minY).toBeCloseTo(1, 9);
    expect(moved.maxX).toBeCloseTo(1 + h, 9);
    expect(moved.maxY).toBeCloseTo(1 + w, 9);
  });
});
