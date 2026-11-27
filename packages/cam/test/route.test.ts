import { describe, expect, it } from 'vitest';
import {
  circle,
  distance,
  rapidLength,
  rectangle,
  toolpaths,
  type Contour,
  type CutSettings,
  type Move,
  type Operation,
  type Problem,
} from '../src';
import { improve, isAllowed, overridden, ROUTE_BUDGET, type RouteTask } from '../src/route';
import { generateDrawing, seeded, type Drawing } from './support';

/**
 * The order of the cuts: the route (`'nearest'`, `'short'`) and the operator's `seq`. A 6 mm cutter and
 * circles of 6 mm, which are drilled straight: the tool goes to the centre and nowhere else, so the rapid
 * travel is the sum of the distances between the centres – small cases can be added up by hand.
 */
const s: CutSettings = {
  toolDiameter: 6,
  depth: 6,
  stepdown: 3,
  stepover: 0.4,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 90,
  safeZ: 5,
  climb: true,
};
const holesAt = (xs: number[], y = 0) => xs.map((x) => circle(x, y, 6));
const drills = (n: number, extra: Partial<Operation>[] = []): Operation[] =>
  Array.from({ length: n }, (_, contour) => ({
    contour,
    kind: 'drill' as const,
    ...extra[contour],
  }));
const order = (r: { cuts: { op: number }[] }) => r.cuts.map((c) => c.op);
const line = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  closed: false,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ],
});

describe('rapidLength', () => {
  it('adds up the rapid moves in the plane, from where the tool begins', () => {
    const moves: Move[] = [
      { z: 5, feed: null },
      { x: 3, y: 4, feed: null },
      { x: 3, y: 10, feed: 100 },
      { y: 20, feed: null },
      { x: 3, y: 20, z: 2, feed: null },
      { x: 6, feed: null },
    ];
    // 5 (from the origin to 3, 4) + 10 (up 10 from 3, 10 to 3, 20) + 3
    expect(rapidLength(moves)).toBe(18);
    // From 3, 4: the first rapid is no way at all, the last is 3 again – and the rapid of 10 stays
    expect(rapidLength(moves, { x: 3, y: 4 })).toBe(13);
    expect(rapidLength([])).toBe(0);
  });
});

describe('where each operation lies in the program', () => {
  it('lists the operations in the order they were cut, with the moves they made', () => {
    const contours = [...holesAt([40, 60]), rectangle(0, 20, 20, 20), circle(0, 0, 4)];
    const operations: Operation[] = [
      { contour: 0, kind: 'drill' },
      { contour: 1, kind: 'none' },
      { contour: 2, kind: 'inside' },
      { contour: 3, kind: 'drill' },
      { contour: 9, kind: 'drill' },
    ];
    const { moves, problems, cuts } = toolpaths(contours, operations, s, { x: 50, y: 0 });
    // The operation without a kind and the one without a contour are not cut at all; the hole that is
    // too small has a span with no move
    expect(order({ cuts })).toEqual([0, 3, 2]);
    expect(problems).toEqual([{ contour: 3, code: 'hole-too-small' }]);
    expect(cuts[1]!.start).toBe(cuts[1]!.end);
    // The spans cover the program, one after the other
    expect(cuts[0]!.start).toBe(0);
    expect(cuts[0]!.end).toBe(cuts[1]!.start);
    expect(cuts[2]!.start).toBe(cuts[1]!.end);
    expect(cuts[2]!.end).toBe(moves.length);
    // The first is the drill of contour 0: up, to the spot, down to 1, down to the depth in steps, up
    expect(moves.slice(cuts[0]!.start, cuts[0]!.end)[1]).toEqual({ x: 40, y: 0, feed: null });
  });
});

describe('the route', () => {
  // The line of holes at 40, 60, 0 and 100, the tool at 50, 0. Nearest: 40 (7 to its edge – 60 is as
  // near and comes later in the list), then 60, 100, last 0: 10 + 20 + 40 + 100 = 170 mm. Shorter: 100,
  // 60, 40, 0: 50 + 40 + 20 + 40 = 150 mm (as is 40, 0, 60, 100: 10 + 40 + 60 + 40)
  const line4 = holesAt([40, 60, 0, 100]);
  const from = { x: 50, y: 0 };

  it('goes to the nearest next by default and has the same program with "nearest" said', () => {
    const plain = toolpaths(line4, drills(4), s, from);
    expect(order(plain)).toEqual([0, 1, 3, 2]);
    expect(rapidLength(plain.moves, from)).toBe(170);
    expect(JSON.stringify(toolpaths(line4, drills(4), s, from, { route: 'nearest' }))).toBe(
      JSON.stringify(plain),
    );
    expect(JSON.stringify(toolpaths(line4, drills(4), s, from, {}))).toBe(JSON.stringify(plain));
  });

  it('is shorter where the nearest route is not: 150 mm for the line of holes', () => {
    const plain = toolpaths(line4, drills(4), s, from);
    const short = toolpaths(line4, drills(4), s, from, { route: 'short' });
    expect(order(short)).toEqual([3, 1, 0, 2]);
    expect(rapidLength(short.moves, from)).toBe(150);
    // Both cut the same holes the same way: only where each begins differs, and a hole begins at its middle
    const key = (m: Move[]) =>
      JSON.stringify(m.filter((q) => q.feed !== null && q.x === undefined));
    expect(key(short.moves)).toBe(key(plain.moves));
    expect(short.problems).toEqual([]);
  });

  it('keeps a route that is the best already: four holes in a square, from the corner', () => {
    // Holes at 10/10, 30/10, 30/30, 10/30; from 0, 0 the nearest route walks round: 14.142 + 3 × 20
    const square = [circle(10, 10, 6), circle(30, 10, 6), circle(30, 30, 6), circle(10, 30, 6)];
    const tour = 10 * Math.SQRT2 + 60;
    for (const route of ['nearest', 'short'] as const) {
      const r = toolpaths(square, drills(4), s, undefined, { route });
      // Round the square from the nearest corner, either way (which of the two next ones is nearer is a
      // matter of the polygons' edges, not of the square): three sides of 20 and the way in
      expect(order(r)[0]).toBe(0);
      expect(rapidLength(r.moves)).toBeCloseTo(tour, 9);
    }
    // From the middle of the lower side (20, 0) of 40 × 40: 20 to a corner, then 3 sides of 40
    const corners = [circle(0, 0, 6), circle(40, 0, 6), circle(40, 40, 6), circle(0, 40, 6)];
    for (const route of ['nearest', 'short'] as const) {
      const r = toolpaths(corners, drills(4), s, { x: 20, y: 0 }, { route });
      expect(rapidLength(r.moves, { x: 20, y: 0 })).toBe(140);
    }
  });

  it('never leaves a rank: holes before pockets, whatever would be shorter', () => {
    // A hole far to the right, two pockets near the tool: the pockets (rank 1) wait for the hole (rank 0)
    const contours = [circle(200, 0, 6), rectangle(0, 0, 20, 20), rectangle(30, 0, 20, 20)];
    const operations: Operation[] = [
      { contour: 1, kind: 'pocket' },
      { contour: 2, kind: 'pocket' },
      { contour: 0, kind: 'drill' },
    ];
    for (const route of ['nearest', 'short'] as const) {
      const r = toolpaths(contours, operations, s, { x: 0, y: 0 }, { route });
      expect(order(r)[0]).toBe(2);
    }
  });

  it('cuts what lies inside a contour first, also when the contour is of a lower rank', () => {
    // A hole (cut-out, rank 3) around a disc (outline, rank 4): the disc goes first, as always
    const frame = rectangle(0, 0, 100, 100);
    const hole = circle(50, 50, 60);
    const disc = circle(50, 50, 30);
    const operations: Operation[] = [
      { contour: 0, kind: 'outside' },
      { contour: 1, kind: 'inside' },
      { contour: 2, kind: 'outside' },
    ];
    for (const route of ['nearest', 'short'] as const) {
      const r = toolpaths([frame, hole, disc], operations, s, undefined, { route });
      expect(order(r)).toEqual([2, 1, 0]);
      expect(r.problems).toEqual([]);
    }
  });

  it('takes the shorter program only if it is shorter by the moves themselves, else the nearest', () => {
    // A long frame entered at its nearest corner: the estimate (centres) and the moves (corners) differ.
    // Whatever the estimate says, the answer is never longer than the nearest route's
    const rand = seeded(11);
    for (let k = 0; k < 20; k++) {
      const contours = Array.from({ length: 6 }, () =>
        rectangle(rand() * 200, rand() * 200, 10 + rand() * 40, 10 + rand() * 40),
      );
      const operations: Operation[] = contours.map((_, contour) => ({ contour, kind: 'outside' }));
      const nearest = toolpaths(contours, operations, s);
      const short = toolpaths(contours, operations, s, undefined, { route: 'short' });
      expect(rapidLength(short.moves)).toBeLessThanOrEqual(rapidLength(nearest.moves) + 1e-9);
    }
  });
});

describe('the order by hand (seq)', () => {
  const from = { x: 50, y: 0 };
  const line4 = holesAt([40, 60, 0, 100]);

  it('cuts the numbered operations first, lowest number first, then the rest by route', () => {
    // 60 (1), 0 (2), 40 (3), then 100: 10 + 60 + 40 + 60 = 170 mm
    const r = toolpaths(line4, drills(4, [{ seq: 3 }, { seq: 1 }, { seq: 2 }]), s, from);
    expect(order(r)).toEqual([1, 2, 0, 3]);
    expect(rapidLength(r.moves, from)).toBe(170);
    expect(r.problems).toEqual([]);
    // 'short' leaves the numbered where they are (and has nothing to improve in one hole)
    const short = toolpaths(line4, drills(4, [{ seq: 3 }, { seq: 1 }, { seq: 2 }]), s, from, {
      route: 'short',
    });
    expect(order(short)).toEqual([1, 2, 0, 3]);
    // Numbers may be any numbers: negative, with decimals, far apart
    const odd = toolpaths(
      line4,
      drills(4, [{ seq: 0.5 }, { seq: -3 }, { seq: 1e6 }, { seq: 0 }]),
      s,
      from,
    );
    expect(order(odd)).toEqual([1, 3, 0, 2]);
  });

  it('takes equal numbers as the route goes: the nearest of them first', () => {
    const r = toolpaths(line4, drills(4, [{ seq: 1 }, { seq: 1 }, { seq: 1 }]), s, from);
    // 40 and 60 are equally near: the first of them, then 60, then 0; then the hole without a number
    expect(order(r)).toEqual([0, 1, 2, 3]);
    // From the other side the nearest of the three is 60
    const left = toolpaths(line4, drills(4, [{ seq: 1 }, { seq: 1 }, { seq: 1 }]), s, {
      x: 70,
      y: 0,
    });
    expect(order(left)).toEqual([1, 0, 2, 3]);
  });

  it('does not change the rank: a hole before a pocket, whatever the numbers', () => {
    const contours = [rectangle(0, 0, 20, 20), circle(100, 0, 6)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'pocket', seq: 1 },
        { contour: 1, kind: 'drill', seq: 9 },
      ],
      s,
    );
    expect(order(r)).toEqual([1, 0]);
    expect(r.problems).toEqual([]);
  });

  it('gives way to the contour that lies inside: the part before its frame, and says so once', () => {
    const frame = rectangle(0, 0, 100, 100);
    const parts = [rectangle(10, 10, 20, 20), rectangle(40, 10, 20, 20), rectangle(70, 10, 20, 20)];
    const run = (seqs: (number | undefined)[]) =>
      toolpaths(
        [frame, ...parts],
        [
          { contour: 0, kind: 'outside', seq: seqs[0] },
          ...parts.map((_, i) => ({ contour: i + 1, kind: 'outside' as const, seq: seqs[i + 1] })),
        ],
        s,
      );
    // The frame wanted first (1), the parts after (2, 3, 4): the parts come first all the same
    const wish = run([1, 2, 3, 4]);
    expect(order(wish)).toEqual([1, 2, 3, 0]);
    expect(wish.problems).toEqual([{ contour: 0, code: 'order-overridden' }]);
    // The frame wanted first, the parts with no number: the same
    const loose = run([1, undefined, undefined, undefined]);
    expect(order(loose)).toEqual([1, 2, 3, 0]);
    expect(loose.problems).toEqual([{ contour: 0, code: 'order-overridden' }]);
    // The parts first by their numbers, the frame with a later number or none: nothing is overridden
    expect(run([9, 3, 2, 1]).problems).toEqual([]);
    expect(order(run([9, 3, 2, 1]))).toEqual([3, 2, 1, 0]);
    expect(run([undefined, 3, 2, 1]).problems).toEqual([]);
    // Parts that wanted to come after the frame: each is overridden once, in the order found
    const reversed = run([1, 5, 3, 4]);
    expect(order(reversed)).toEqual([2, 3, 1, 0]);
    expect(reversed.problems).toEqual([{ contour: 0, code: 'order-overridden' }]);
  });

  it('is not overridden by a contour of another rank', () => {
    // The disc (outline, rank 4) lies in the hole (cut-out, rank 3): the hole waits for it by rank and by
    // its place – nothing of the hole's number is broken
    const operations: Operation[] = [
      { contour: 0, kind: 'inside', seq: 1 },
      { contour: 1, kind: 'outside', seq: 2 },
    ];
    const r = toolpaths([circle(50, 50, 60), circle(50, 50, 30)], operations, s);
    expect(order(r)).toEqual([1, 0]);
    expect(r.problems).toEqual([]);
  });

  it('takes a number that is none for no number', () => {
    const plain = toolpaths(line4, drills(4), s, from);
    for (const seq of [Number.NaN, Infinity, -Infinity]) {
      const r = toolpaths(line4, drills(4, [{ seq }, { seq }, { seq }, { seq }]), s, from);
      expect(JSON.stringify(r)).toBe(JSON.stringify(plain));
    }
  });
});

describe('the rules of the order (route.ts)', () => {
  const task = (
    rank: number[],
    over: { seq?: (number | undefined)[]; waits?: number[][]; anchor?: number[] } = {},
  ): RouteTask => ({
    rank,
    seq: over.seq ?? rank.map(() => undefined),
    waits: over.waits ?? rank.map(() => []),
    anchor: (over.anchor ?? rank.map((_, i) => i)).map((x) => ({ x, y: 0 })),
  });

  it('allows the lowest rank first, what is inside before the contour, the numbers first', () => {
    const ranks = task([0, 1, 2]);
    expect(isAllowed([0, 1, 2], ranks)).toBe(true);
    expect(isAllowed([1, 0, 2], ranks)).toBe(false);
    expect(isAllowed([0, 2, 1], ranks)).toBe(false);
    // The same rank: any order; a contour waits for what it holds
    const frame = task([4, 4], { waits: [[1], []] });
    expect(isAllowed([1, 0], frame)).toBe(true);
    expect(isAllowed([0, 1], frame)).toBe(false);
    // A hole of rank 3 waits for the disc in it, of rank 4: the disc is the lowest free rank then
    const ring = task([3, 4], { waits: [[1], []] });
    expect(isAllowed([1, 0], ring)).toBe(true);
    expect(isAllowed([0, 1], ring)).toBe(false);
    // Numbers: lowest first, equal numbers in any order, those without after all of them
    const numbered = task([0, 0, 0], { seq: [2, 1, undefined] });
    expect(isAllowed([1, 0, 2], numbered)).toBe(true);
    expect(isAllowed([0, 1, 2], numbered)).toBe(false);
    expect(isAllowed([1, 2, 0], numbered)).toBe(false);
    const tied = task([0, 0, 0], { seq: [1, 1, undefined] });
    expect(isAllowed([0, 1, 2], tied)).toBe(true);
    expect(isAllowed([1, 0, 2], tied)).toBe(true);
    expect(isAllowed([2, 0, 1], tied)).toBe(false);
    // An operation cut twice, or not free
    expect(isAllowed([0, 0], task([0, 0]))).toBe(false);
  });

  it('names the numbers that a contour took away, each once', () => {
    const frame = (seq: (number | undefined)[]) => task([4, 4], { seq, waits: [[1], []] });
    expect(overridden([1, 0], frame([1, 2]))).toEqual([0]);
    expect(overridden([1, 0], frame([1, undefined]))).toEqual([0]);
    expect(overridden([1, 0], frame([2, 1]))).toEqual([]);
    expect(overridden([1, 0], frame([undefined, 1]))).toEqual([]);
    expect(overridden([1, 0], frame([1, 1]))).toEqual([]);
    // Three parts cut while the frame waits: said once
    const three = task([4, 4, 4, 4], { seq: [1, 2, 3, 4], waits: [[1, 2, 3], [], [], []] });
    expect(overridden([1, 2, 3, 0], three)).toEqual([0]);
    // Another rank is no override
    expect(overridden([1, 0], task([3, 4], { seq: [1, 2], waits: [[1], []] }))).toEqual([]);
  });

  it('shortens the way only by orders the rules allow, and stops after its budget', () => {
    // Anchors on a line, the tool at 50: the order 0, 1, 3, 2 of the holes at 40, 60, 0, 100
    const holes = task([0, 0, 0, 0], { anchor: [40, 60, 0, 100] });
    const from = { x: 50, y: 0 };
    expect(improve([0, 1, 3, 2], from, holes)).toEqual([3, 1, 0, 2]);
    // A budget of nothing: the order given
    expect(improve([0, 1, 3, 2], from, holes, 0)).toEqual([0, 1, 3, 2]);
    expect(ROUTE_BUDGET).toBeGreaterThan(1_000_000);
    // A swap that would be shorter but puts a rank 1 before a rank 0 is not taken: the tool at 100,
    // rank 0 at 200 and rank 1 at 110
    const ranked = task([0, 1], { anchor: [200, 110] });
    expect(improve([0, 1], { x: 100, y: 0 }, ranked)).toEqual([0, 1]);
    // Nothing to do for one operation, none, or an order that is the best
    expect(improve([0], from, task([0]))).toEqual([0]);
    expect(improve([], from, task([]))).toEqual([]);
    expect(improve([0, 1], { x: -5, y: 0 }, task([0, 0], { anchor: [0, 10] }))).toEqual([0, 1]);
  });
});

/**
 * Whole drawings from a seeded generator: parts with holes, cut-outs (with a disc in some), pockets,
 * lines and closed engravings in them, and alone on the sheet. Every property is checked against what
 * the generator knows – which contour lies in which – and not against the library's own idea of it.
 */
describe('over many drawings', () => {
  const RANK: Record<string, number> = { drill: 0, pocket: 1, on: 2, inside: 3, outside: 4 };

  const settings = (rampAngle: number): CutSettings => ({
    toolDiameter: 3,
    depth: 3,
    stepdown: 1.5,
    stepover: 0.4,
    feed: 1200,
    plungeFeed: 300,
    rampAngle,
    safeZ: 5,
    climb: true,
  });

  /** What the generator knows: the operations that have to be cut before this one */
  const waitsOf = (d: Drawing, i: number): number[] => {
    const kind = d.operations[i]!.kind;
    if (kind !== 'inside' && kind !== 'outside') return [];
    const within = (j: number): boolean => {
      for (let p = d.parent[j]; p !== null && p !== undefined; p = d.parent[p])
        if (p === i) return true;
      return false;
    };
    return d.operations.flatMap((_, j) => (within(j) ? [j] : []));
  };

  /** Everything the order has to keep to, checked from the order alone. Returns the contours overridden by a number. */
  const verifyOrder = (d: Drawing, cuts: { op: number }[]): number[] => {
    const ops = cuts.map((c) => c.op);
    expect(new Set(ops).size).toBe(ops.length);
    expect(ops.length).toBe(d.operations.length);
    const place = new Map(ops.map((op, k) => [op, k]));
    const rank = (i: number) => RANK[d.operations[i]!.kind]!;
    const waits = d.operations.map((_, i) => waitsOf(d, i));
    const blockedAt = (x: number, step: number) => waits[x]!.some((w) => place.get(w)! >= step);
    // (c) what lies inside is cut before the contour
    waits.forEach((list, i) =>
      list.forEach((w) => expect(place.get(w)!).toBeLessThan(place.get(i)!)),
    );
    // (b) at every step the chosen operation has the lowest rank among those that do not wait
    ops.forEach((op, step) => {
      const free = d.operations.flatMap((_, j) =>
        place.get(j)! >= step && !blockedAt(j, step) ? [j] : [],
      );
      expect(rank(op)).toBe(Math.min(...free.map(rank)));
    });
    // (e) the numbers: of two in a rank the lower one is first unless it waited; those without a
    // number come after all with one, unless the one with the number waited
    const seq = (i: number) => d.operations[i]!.seq;
    const overridden = new Set<number>();
    for (const x of ops) {
      for (const y of ops) {
        if (x === y || rank(x) !== rank(y) || seq(x) === undefined) continue;
        const yFirst = place.get(y)! < place.get(x)!;
        const wished = seq(y) === undefined || seq(x)! < seq(y)!;
        if (yFirst && wished) {
          expect(blockedAt(x, place.get(y)!)).toBe(true);
          overridden.add(d.operations[x]!.contour);
        }
      }
    }
    return [...overridden].sort((a, b) => a - b);
  };

  /** The points a cut visits at the cutting feed with the depth it is at, per operation (what is cut, not where it begins) */
  const visited = (moves: Move[], cuts: { op: number; start: number; end: number }[]) => {
    const out = new Map<number, Set<string>>();
    let x = 0;
    let y = 0;
    let z = 5;
    const r = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
    for (const cut of cuts) {
      const set = new Set<string>();
      for (let k = cut.start; k < cut.end; k++) {
        const m = moves[k]!;
        x = m.x ?? x;
        y = m.y ?? y;
        z = m.z ?? z;
        if (m.feed !== null) set.add(`${r(x)},${r(y)},${r(z)}`);
      }
      out.set(cut.op, set);
    }
    return out;
  };
  /** How far each operation goes at the cutting feed in the plane */
  const cutLength = (moves: Move[], cuts: { op: number; start: number; end: number }[]) => {
    const out = new Map<number, number>();
    let x = 0;
    let y = 0;
    for (const cut of cuts) {
      let sum = 0;
      for (let k = cut.start; k < cut.end; k++) {
        const m = moves[k]!;
        const nx = m.x ?? x;
        const ny = m.y ?? y;
        if (m.feed !== null) sum += Math.hypot(nx - x, ny - y);
        x = nx;
        y = ny;
      }
      out.set(cut.op, sum);
    }
    return out;
  };

  const CASES = 260;

  it('keeps the rank, what lies inside, the numbers, and has the same cuts, whichever route', () => {
    const rand = seeded(2024);
    let shorter = 0;
    let numbered = 0;
    let overriddenCases = 0;
    for (let k = 0; k < CASES; k++) {
      const withNumbers = k % 2 === 1;
      const d = generateDrawing(rand, withNumbers);
      // With ramps (10°) every fourth drawing is enough: the length of the cuts is what is looked at
      for (const angle of [90, 10]) {
        if (angle === 10 && k % 4 !== 0) continue;
        const cut = settings(angle);
        const nearest = toolpaths(d.contours, d.operations, cut);
        const short = toolpaths(d.contours, d.operations, cut, undefined, { route: 'short' });
        const said = (p: Problem[]) =>
          p
            .filter((q) => q.code === 'order-overridden')
            .map((q) => q.contour)
            .sort((a, b) => a - b);
        // Only what the library was asked: nothing is too large, too small or open
        expect(nearest.problems.filter((q) => q.code !== 'order-overridden')).toEqual([]);
        expect(short.problems.filter((q) => q.code !== 'order-overridden')).toEqual([]);
        // The order keeps the rules, and the problems are exactly the numbers a contour took away
        for (const r of [nearest, short]) {
          expect(r.cuts.at(-1)!.end).toBe(r.moves.length);
          expect(said(r.problems)).toEqual(verifyOrder(d, r.cuts));
        }
        // (d) never longer by the program itself
        expect(rapidLength(short.moves)).toBeLessThanOrEqual(rapidLength(nearest.moves) + 1e-9);
        if (angle === 90 && rapidLength(short.moves) < rapidLength(nearest.moves) - 1e-6) shorter++;
        if (angle === 90 && withNumbers) numbered++;
        if (angle === 90 && said(nearest.problems).length > 0) overriddenCases++;
        // (a) the same cuts: the points at their depths with no ramps, the length of the cut with ramps
        if (angle === 90) {
          const a = visited(nearest.moves, nearest.cuts);
          const b = visited(short.moves, short.cuts);
          for (const [op, set] of a) expect([...b.get(op)!].sort()).toEqual([...set].sort());
        } else {
          const a = cutLength(nearest.moves, nearest.cuts);
          const b = cutLength(short.moves, short.cuts);
          // (not for a cut-out with relief: with ramps the walk ends part-way round a loop, and which corners
          // are in that part – whose detours are counted – depends on where the loop begins)
          for (const [op, length] of a) {
            if (d.operations[op]!.relief === undefined) expect(b.get(op)!).toBeCloseTo(length, 6);
          }
        }
        // (f) the same drawing twice is the same program
        if (angle !== 90) continue;
        expect(
          JSON.stringify(toolpaths(d.contours, d.operations, cut, undefined, { route: 'short' })),
        ).toBe(JSON.stringify(short));
        expect(JSON.stringify(toolpaths(d.contours, d.operations, cut))).toBe(
          JSON.stringify(nearest),
        );
      }
    }
    // The checks above are not empty: there were numbers, contours that took them away, and shorter routes
    expect(numbered).toBeGreaterThan(40);
    expect(overriddenCases).toBeGreaterThan(5);
    expect(shorter).toBeGreaterThan(40);
  }, 120_000);
});

/**
 * The rules of the order and the search for a shorter one, against a version written out the long way:
 * sets instead of counters, and every reversal asked of the whole order. The searched order must be the
 * same one, wherever the budget was not reached.
 */
describe('the rules of the order, written out the long way', () => {
  type Task = {
    rank: number[];
    seq: (number | undefined)[];
    waits: number[][];
    anchor: { x: number; y: number }[];
  };

  const allowedLong = (order: readonly number[], t: RouteTask): boolean => {
    const done = new Set<number>();
    for (const x of order) {
      const free = t.rank.flatMap((_, i) =>
        !done.has(i) && t.waits[i]!.every((j) => done.has(j)) ? [i] : [],
      );
      if (!free.includes(x)) return false;
      const lowest = Math.min(...free.map((i) => t.rank[i]!));
      if (t.rank[x] !== lowest) return false;
      const numbers = free.flatMap((i) =>
        t.rank[i] === lowest && t.seq[i] !== undefined ? [t.seq[i]!] : [],
      );
      if (numbers.length > 0 && t.seq[x] !== Math.min(...numbers)) return false;
      done.add(x);
    }
    return true;
  };

  /** The operations whose number a contour took away, by the definition in the comment of `overridden` */
  const overriddenLong = (order: readonly number[], t: RouteTask): number[] => {
    const found = new Set<number>();
    const done = new Set<number>();
    for (const x of order) {
      const waiting = t.rank
        .map((_, y) => y)
        .filter(
          (y) =>
            t.rank[y] === t.rank[x] &&
            t.seq[y] !== undefined &&
            !done.has(y) &&
            !t.waits[y]!.every((j) => done.has(j)),
        )
        .sort((a, b) => t.seq[a]! - t.seq[b]! || a - b);
      for (const y of waiting) {
        if (t.seq[x] === undefined || t.seq[y]! < t.seq[x]!) found.add(y);
      }
      done.add(x);
    }
    return [...found];
  };

  /** The search as it was before the rules were asked inside the turned stretch only: the whole order, every time */
  const improveLong = (order: readonly number[], from: { x: number; y: number }, t: RouteTask) => {
    let best = [...order];
    const n = best.length;
    const at = (i: number) => t.anchor[i]!;
    for (let improved = true; improved; ) {
      improved = false;
      for (let a = 0; a < n - 1; a++) {
        for (let b = a + 1; b < n; b++) {
          const before = a === 0 ? from : t.anchor[best[a - 1]!]!;
          let change = distance(before, at(best[b]!)) - distance(before, at(best[a]!));
          if (b < n - 1) {
            change +=
              distance(at(best[a]!), at(best[b + 1]!)) - distance(at(best[b]!), at(best[b + 1]!));
          }
          if (change >= -1e-9) continue;
          const next = [
            ...best.slice(0, a),
            ...best.slice(a, b + 1).reverse(),
            ...best.slice(b + 1),
          ];
          if (!allowedLong(next, t)) continue;
          best = next;
          improved = true;
        }
      }
    }
    return best;
  };

  /** A random task of `n` operations: ranks, numbers (small, so that equal ones happen), waits that cannot go round, anchors on a grid */
  const randomTask = (
    rand: () => number,
    n: number,
    share: { numbers: number; waits: number; ranks: number },
  ): Task => {
    const pick = (k: number) => Math.floor(rand() * k);
    // The waits are made towards lower numbers, then the operations are renamed by a shuffle
    const name = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = pick(i + 1);
      [name[i], name[j]] = [name[j]!, name[i]!];
    }
    const task: Task = { rank: [], seq: [], waits: [], anchor: [] };
    for (let i = 0; i < n; i++) {
      const rank = pick(share.ranks);
      const seq = rand() < share.numbers ? pick(4) : undefined;
      const waits = Array.from({ length: i }, (_, j) => j).filter(() => rand() < share.waits);
      const anchor = { x: pick(30), y: pick(30) };
      task.rank[name[i]!] = rank;
      task.seq[name[i]!] = seq;
      task.waits[name[i]!] = waits.map((j) => name[j]!);
      task.anchor[name[i]!] = anchor;
    }
    return task;
  };

  const shuffled = (rand: () => number, n: number): number[] => {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    return order;
  };

  /** An order the rules allow, one random step at a time among the operations allowed there */
  const allowedOrder = (rand: () => number, t: RouteTask): number[] => {
    const order: number[] = [];
    while (order.length < t.rank.length) {
      const next = t.rank
        .map((_, i) => i)
        .filter((i) => !order.includes(i) && allowedLong([...order, i], t));
      order.push(next[Math.floor(rand() * next.length)]!);
    }
    return order;
  };

  const shape = (rand: () => number) => ({
    numbers: rand(),
    waits: rand() * 0.4,
    ranks: 1 + Math.floor(rand() * 3),
  });

  it('allows the same orders', () => {
    const rand = seeded(5);
    let yes = 0;
    let no = 0;
    for (let k = 0; k < 4000; k++) {
      const n = 1 + Math.floor(rand() * 10);
      const t = randomTask(rand, n, shape(rand));
      const order = shuffled(rand, n);
      const expected = allowedLong(order, t);
      expect(isAllowed(order, t)).toBe(expected);
      if (expected) yes++;
      else no++;
    }
    // Both answers were given often
    expect(yes).toBeGreaterThan(500);
    expect(no).toBeGreaterThan(500);
  });

  it('names the same numbers that were taken away', () => {
    const rand = seeded(6);
    let said = 0;
    for (let k = 0; k < 4000; k++) {
      const n = 1 + Math.floor(rand() * 10);
      const t = randomTask(rand, n, shape(rand));
      // Any order that cuts what a contour holds before it – the ranks are not asked
      const order: number[] = [];
      while (order.length < n) {
        const next = shuffled(rand, n).filter(
          (i) => !order.includes(i) && t.waits[i]!.every((j) => order.includes(j)),
        );
        order.push(next[0]!);
      }
      const expected = overriddenLong(order, t);
      expect(overridden(order, t)).toEqual(expected);
      if (expected.length > 0) said++;
    }
    expect(said).toBeGreaterThan(500);
  });

  it('searches the same shorter order, from the same start', () => {
    const rand = seeded(99);
    let shorter = 0;
    let withWaits = 0;
    for (let k = 0; k < 1500; k++) {
      const n = 2 + Math.floor(rand() * 11);
      const t = randomTask(rand, n, shape(rand));
      const order = allowedOrder(rand, t);
      const from = { x: Math.floor(rand() * 30), y: Math.floor(rand() * 30) };
      const found = improve(order, from, t);
      expect(found).toEqual(improveLong(order, from, t));
      // Still an order the rules allow, and the same operations
      expect(allowedLong(found, t)).toBe(true);
      expect([...found].sort((a, b) => a - b)).toEqual(order.map((_, i) => i));
      if (found.some((v, i) => v !== order[i])) shorter++;
      if (found.some((v, i) => v !== order[i]) && t.waits.some((w) => w.length > 0)) withWaits++;
    }
    expect(shorter).toBeGreaterThan(300);
    expect(withWaits).toBeGreaterThan(100);
  });
});

describe('what a search for a shorter route may cost', () => {
  const task = (
    rank: number[],
    over: { seq?: (number | undefined)[]; waits?: number[][]; anchor?: number[] } = {},
  ): RouteTask => ({
    rank,
    seq: over.seq ?? rank.map(() => undefined),
    waits: over.waits ?? rank.map(() => []),
    anchor: (over.anchor ?? rank.map((_, i) => i)).map((x) => ({ x, y: 0 })),
  });
  const from = { x: 0, y: 0 };

  it('does not turn a stretch that lets a lower rank in between: a rank 3 freed by what was cut', () => {
    // Ranks 4, 4, 3; the rank 3 waits for operation 1. At 10, 0, 10 from 0 the order 0, 1, 2 is 30 mm and
    // 1, 0, 2 would be 10 mm (a change of 0 − 10 + 0 − 10 = −20) – but once 1 is cut the rank 3 is free and
    // goes before the rank 4 at 0: 1, 0, 2 breaks the rules. 0, 2, 1 (−10) cuts 2 before what it waits for.
    const t = task([4, 4, 3], { waits: [[], [], [1]], anchor: [10, 0, 10] });
    expect(isAllowed([0, 1, 2], t)).toBe(true);
    expect(isAllowed([1, 0, 2], t)).toBe(false);
    expect(isAllowed([0, 2, 1], t)).toBe(false);
    expect(improve([0, 1, 2], from, t)).toEqual([0, 1, 2]);
    // Without the wait the same turn is taken: and the order that is found is 10 mm
    expect(improve([0, 1, 2], from, task([4, 4, 4], { anchor: [10, 0, 10] }))).toEqual([1, 0, 2]);
  });

  it('returns an order that breaks the rules as it is, whatever it could be turned into', () => {
    // The rank 1 at 200 stands before the rank 0 at 110, the tool at 100: turned round it would be allowed
    // and 90 mm shorter – but an order that is not allowed is not the one to search from
    const t = task([0, 1], { anchor: [110, 200] });
    expect(isAllowed([1, 0], t)).toBe(false);
    expect(improve([1, 0], { x: 100, y: 0 }, t)).toEqual([1, 0]);
    expect(improve([0, 1], { x: 100, y: 0 }, t)).toEqual([0, 1]);
  });

  it('counts the work of testing the rules, not only the pairs it looks at', () => {
    // Anchors 0, 3, 1, 2 on a line, the tool at 0, the order 0, 1, 2, 3 (6 mm). The pairs, in the order
    // looked at: (0,1) (0,2) (0,3) (1,2) (1,3) (2,3), the first three change nothing. At the 4th, 1 and 2
    // are turned (−2: the way from 0 to 1 is 1 instead of 3, from 3 on to 2 it stays 1) – the test of that
    // takes the two operations and back: 5 steps of work in all (the one operation taken before it, the
    // two, the two back). Then (1,3) changes nothing (+1) and (2,3) turns 1 and 3 (−1) for 0, 2, 3, 1: 3 mm.
    const t = task([0, 0, 0, 0], { anchor: [0, 3, 1, 2] });
    const order = [0, 1, 2, 3];
    expect(improve(order, from, t, 3)).toEqual([0, 1, 2, 3]);
    expect(improve(order, from, t, 4)).toEqual([0, 2, 1, 3]);
    // The six pairs of a sweep are 6 units; the turn at the 4th pair cost 5 more, so the 6th pair is the
    // 11th unit: 10 stops before the last turn, which counted by pairs only would have been taken at 6
    expect(improve(order, from, t, 6)).toEqual([0, 2, 1, 3]);
    expect(improve(order, from, t, 10)).toEqual([0, 2, 1, 3]);
    expect(improve(order, from, t, 11)).toEqual([0, 2, 3, 1]);
    expect(improve(order, from, t)).toEqual([0, 2, 3, 1]);
  });

  it('does not stall where every operation has a number: no turn can be taken, and none is tried long', () => {
    // 1000 operations numbered in the order they stand: every turn breaks the numbers. Asking the whole
    // order about every turn took 40 s; asking the turned stretch and stopping at the first operation that
    // does not fit takes a fraction of a second
    const rand = seeded(8);
    const n = 1000;
    const anchor = Array.from({ length: n }, () => rand() * 1000);
    const order = Array.from({ length: n }, (_, i) => i);
    const t0 = performance.now();
    const same = improve(order, from, task(Array(n).fill(0), { seq: order, anchor }));
    // Numbers at random, the operations standing in the order of their numbers
    const numbers = anchor.map(() => rand());
    const byNumber = [...order].sort((a, b) => numbers[a]! - numbers[b]!);
    const again = improve(byNumber, from, task(Array(n).fill(0), { seq: numbers, anchor }));
    const ms = performance.now() - t0;
    expect(same).toEqual(order);
    expect(again).toEqual(byNumber);
    // 40 s before; a fraction of a second now – the limit is wide, the machine may be busy
    expect(ms).toBeLessThan(20_000);
  }, 60_000);

  it('stops after its work where every turn fits and is tried long: a thousand rows of frames', () => {
    // 200 frames, each cut after the five parts inside it: rank 4 all through, so the turns that keep the
    // parts before their frame are allowed, and the ones that do not are refused after a few steps
    const rand = seeded(9);
    const waits: number[][] = [];
    const order: number[] = [];
    for (let f = 0; f < 200; f++) {
      const first = 6 * f;
      for (let k = 0; k < 5; k++) waits[first + k] = [];
      waits[first + 5] = [0, 1, 2, 3, 4].map((k) => first + k);
      order.push(...[0, 1, 2, 3, 4, 5].map((k) => first + k));
    }
    const n = order.length;
    const t0 = performance.now();
    const found = improve(
      order,
      from,
      task(Array(n).fill(4), { waits, anchor: order.map(() => rand() * 1000) }),
    );
    const ms = performance.now() - t0;
    expect(isAllowed(found, task(Array(n).fill(4), { waits }))).toBe(true);
    expect(found.some((v, i) => v !== order[i])).toBe(true);
    expect(ms).toBeLessThan(20_000);
  }, 60_000);
});
