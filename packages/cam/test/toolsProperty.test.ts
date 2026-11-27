import { describe, expect, it } from 'vitest';
import {
  rapidLength,
  toolpaths,
  type CutSettings,
  type Move,
  type Operation,
  type Problem,
  type ToolSettings,
} from '../src';
import { generateDrawing, seeded, type Drawing } from './support';

/**
 * Whole drawings from the seeded generator of `route.test.ts` – parts with holes, cut-outs, pockets and engravings –
 * with every operation given one of three cutters, checked against what the generator knows (which contour lies in
 * which), not against the library's idea of it: the same cuts as every cutter's own program, the rank and what lies
 * inside a contour first across all the cutters, the cutter that is mounted preferred, the blocks, the same program
 * twice, and a shorter route that never needs more changes.
 */
const RANK: Record<string, number> = { drill: 0, pocket: 1, on: 2, inside: 3, outside: 4 };
const cut = (toolDiameter: number): CutSettings => ({
  toolDiameter,
  depth: 3,
  stepdown: 1.5,
  stepover: 0.4,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 90,
  safeZ: 5,
  climb: true,
});
/** Numbers that are not in the order of the list, so that nothing can lean on it */
const tools: ToolSettings[] = [
  { number: 5, name: 'A', cut: cut(3) },
  { number: 2, name: 'B', cut: cut(2) },
  { number: 7, name: 'C', cut: cut(2.5) },
];

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

/** The points a cut visits at the cutting feed with the depth it is at, per operation (what is cut, not where it begins) */
const visited = (moves: Move[], cuts: { op: number; start: number; end: number }[]) => {
  const out = new Map<number, string[]>();
  let x = 0;
  let y = 0;
  let z = 5;
  const r = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
  for (const c of cuts) {
    const set = new Set<string>();
    for (let k = c.start; k < c.end; k++) {
      const m = moves[k]!;
      x = m.x ?? x;
      y = m.y ?? y;
      z = m.z ?? z;
      if (m.feed !== null) set.add(`${r(x)},${r(y)},${r(z)}`);
    }
    out.set(c.op, [...set].sort());
  }
  return out;
};

/** The tool changes of an order of operations, given the number of the cutter of each */
const changesOf = (ops: number[], number: (op: number) => number) =>
  ops.filter((op, k) => k > 0 && number(op) !== number(ops[k - 1]!)).length;

const CASES = 240;

describe('over many drawings with three cutters', () => {
  it('cuts what every cutter cuts alone, in an order that keeps the rank, what lies inside, and the mounted cutter', () => {
    const rand = seeded(8842);
    let changes = 0;
    let comesBack = 0;
    let fewerThanBlind = 0;
    let shorter = 0;
    let usesAll = 0;
    for (let k = 0; k < CASES; k++) {
      const d = generateDrawing(rand, false);
      // Some drawings with two cutters, most with three
      const cutters = k % 4 === 0 ? 2 : 3;
      const ops: Operation[] = d.operations.map((o) => ({
        ...o,
        tool: Math.floor(rand() * cutters),
      }));
      const numberOf = (op: number) => tools[ops[op]!.tool!]!.number;

      const r = toolpaths(d.contours, ops, tools);
      const short = toolpaths(d.contours, ops, tools, undefined, { route: 'short' });
      const said = (p: Problem[]) => p.filter((q) => q.code !== 'order-overridden');
      expect(said(r.problems)).toEqual([]);
      expect(said(short.problems)).toEqual([]);
      for (const x of [r, short]) {
        expect(x.cuts.map((c) => c.op).sort((a, b) => a - b)).toEqual(ops.map((_, i) => i));
        expect(x.cuts.at(-1)!.end).toBe(x.moves.length);
      }

      // The order: at every step the lowest rank among the operations that do not wait; what lies inside a contour
      // is cut before it – for the order of the short route too
      for (const x of [r, short]) {
        const seq = x.cuts.map((c) => c.op);
        const place = new Map(seq.map((op, step) => [op, step]));
        const waits = ops.map((_, i) => waitsOf(d, i));
        waits.forEach((list, i) =>
          list.forEach((w) => expect(place.get(w)!).toBeLessThan(place.get(i)!)),
        );
        seq.forEach((op, step) => {
          const free = ops.flatMap((_, j) =>
            place.get(j)! >= step && !waits[j]!.some((w) => place.get(w)! >= step) ? [j] : [],
          );
          const lowest = Math.min(...free.map((j) => RANK[ops[j]!.kind]!));
          expect(RANK[ops[op]!.kind]).toBe(lowest);
          // The nearest route also prefers the cutter that is mounted: of what is free at that rank, an operation of
          // it, if there is one (a shorter route is only held to the number of changes, below)
          if (x === r && step > 0) {
            const mounted = numberOf(seq[step - 1]!);
            const mine = free.filter(
              (j) => RANK[ops[j]!.kind] === lowest && numberOf(j) === mounted,
            );
            if (mine.length > 0) expect(numberOf(op)).toBe(mounted);
          }
        });
      }

      // The blocks: the runs of one cutter, the cuts of a run, without a gap, from the first move to the last
      for (const x of [r, short]) {
        const seq = x.cuts.map((c) => c.op);
        const runs: { number: number; first: number; last: number; n: number }[] = [];
        seq.forEach((op, step) => {
          const run = runs.at(-1);
          if (run && run.number === numberOf(op)) {
            run.last = step;
            run.n++;
          } else runs.push({ number: numberOf(op), first: step, last: step, n: 1 });
        });
        expect(x.blocks!.map((b) => [b.number, b.operations])).toEqual(
          runs.map((q) => [q.number, q.n]),
        );
        x.blocks!.forEach((b, i) => {
          expect(b.start).toBe(x.cuts[runs[i]!.first]!.start);
          expect(b.end).toBe(x.cuts[runs[i]!.last]!.end);
          expect(b.diameter).toBe(tools[b.tool]!.cut.toolDiameter);
        });
        expect(x.blocks![0]!.start).toBe(0);
      }

      // The same cuts as each cutter's own program of its operations (the others are `none`: still in the
      // drawing, so what is an island of a pocket stays one)
      const mine = visited(r.moves, r.cuts);
      const theirs = visited(short.moves, short.cuts);
      for (let t = 0; t < tools.length; t++) {
        const own = ops.map((o) =>
          o.tool === t
            ? { ...o, tool: undefined }
            : { ...o, tool: undefined, kind: 'none' as const },
        );
        const alone = toolpaths(d.contours, own, tools[t]!.cut);
        const aloneVisited = visited(alone.moves, alone.cuts);
        for (const [op, points] of aloneVisited) {
          expect(mine.get(op), `drawing ${k}, operation ${op}`).toEqual(points);
          expect(theirs.get(op), `drawing ${k}, operation ${op}, short`).toEqual(points);
        }
      }

      // The tool changes: the shorter route needs no more of them and is not longer; the program is the same twice
      expect(short.blocks!.length).toBeLessThanOrEqual(r.blocks!.length);
      expect(rapidLength(short.moves)).toBeLessThanOrEqual(rapidLength(r.moves) + 1e-9);
      expect(JSON.stringify(toolpaths(d.contours, ops, tools))).toBe(JSON.stringify(r));
      expect(JSON.stringify(toolpaths(d.contours, ops, tools, undefined, { route: 'short' }))).toBe(
        JSON.stringify(short),
      );

      // Against the order the same drawing gets without a preference for the mounted cutter (all of it the first
      // cutter's: the same ranks and waits, the same nearest): the preference never needs more changes
      const blind = toolpaths(
        d.contours,
        ops.map((o) => ({ ...o, tool: 0 })),
        tools,
      );
      const needed = changesOf(
        blind.cuts.map((c) => c.op),
        numberOf,
      );
      expect(r.blocks!.length - 1).toBeLessThanOrEqual(needed);

      changes += r.blocks!.length - 1;
      if (r.blocks!.length - 1 < needed) fewerThanBlind++;
      if (new Set(r.blocks!.map((b) => b.number)).size < r.blocks!.length) comesBack++;
      if (rapidLength(short.moves) < rapidLength(r.moves) - 1e-6) shorter++;
      if (new Set(ops.map((o) => o.tool)).size === 3) usesAll++;
    }
    // The checks above are not empty: tools were changed, changed back, grouped better than without the
    // preference, and a shorter route was found while they held
    expect(usesAll).toBeGreaterThan(100);
    expect(changes).toBeGreaterThan(500);
    expect(comesBack).toBeGreaterThan(100);
    expect(fewerThanBlind).toBeGreaterThan(30);
    expect(shorter).toBeGreaterThan(20);
  }, 240_000);
});
