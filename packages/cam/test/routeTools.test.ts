import { describe, expect, it } from 'vitest';
import { improve, isAllowed, type RouteTask } from '../src/route';
import { seeded } from './support';

/**
 * The search for a shorter route when the operations have different cutters (`RouteTask.tool`): it takes a
 * reversal only if the tool is changed no more often afterwards. Anchors on a line, the tool at 0: the way is
 * what can be added up by hand.
 */
const task = (
  rank: number[],
  anchor: number[],
  tool?: number[],
  waits?: number[][],
): RouteTask => ({
  rank,
  seq: rank.map(() => undefined),
  waits: waits ?? rank.map(() => []),
  anchor: anchor.map((x) => ({ x, y: 0 })),
  tool,
});
const changes = (order: readonly number[], tool: readonly number[]) =>
  order.filter((x, k) => k > 0 && tool[x] !== tool[order[k - 1]!]).length;
const length = (order: readonly number[], anchor: readonly number[]) =>
  order.reduce(
    (sum, x, k) => sum + Math.abs(anchor[x]! - (k === 0 ? 0 : anchor[order[k - 1]!]!)),
    0,
  );

describe('a shorter route with several tools', () => {
  it('does not turn a stretch round that makes the tool change more often', () => {
    // Holes at 10, 40, 30, 60 in this order, A A B B: 80 mm, one change. Turning 40 and 30 round gives 60 mm, but
    // A B A B – three changes. Turning 40, 30, 10 round (B A A B, two changes) or any other stretch is longer or
    // changes more. Without the tools it is the short way
    const anchor = [10, 40, 30, 60];
    const tool = [0, 0, 1, 1];
    expect(length([0, 1, 2, 3], anchor)).toBe(80);
    expect(improve([0, 1, 2, 3], { x: 0, y: 0 }, task([0, 0, 0, 0], anchor))).toEqual([0, 2, 1, 3]);
    expect(length([0, 2, 1, 3], anchor)).toBe(60);
    expect(improve([0, 1, 2, 3], { x: 0, y: 0 }, task([0, 0, 0, 0], anchor, tool))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('takes a turn that needs no more changes: the same tool all through, or a stretch of one tool turned round', () => {
    // 10, 40, 30, 60: with one tool for all there is nothing to change and the short way is taken; with A B B A the
    // two B holes (40 and 30) are turned round, and the joins A–B and B–A stay as they were
    const anchor = [10, 40, 30, 60];
    const way = (tool: number[]) =>
      improve([0, 1, 2, 3], { x: 0, y: 0 }, task([0, 0, 0, 0], anchor, tool));
    expect(way([0, 0, 0, 0])).toEqual([0, 2, 1, 3]);
    expect(way([0, 1, 1, 0])).toEqual([0, 2, 1, 3]);
    // A B B B turned the same way: the join of 10 and 30 is a change as the join of 10 and 40 was
    expect(way([0, 1, 1, 1])).toEqual([0, 2, 1, 3]);
  });

  it('is never longer, never needs more changes, never breaks the rules – for any task', () => {
    const rand = seeded(31);
    let turned = 0;
    let held = 0;
    for (let k = 0; k < 400; k++) {
      const n = 3 + Math.floor(rand() * 7);
      const rank = Array.from({ length: n }, () => Math.floor(rand() * 3));
      const anchor = Array.from({ length: n }, () => Math.floor(rand() * 100));
      const tool = Array.from({ length: n }, () => Math.floor(rand() * 3));
      // Some operations wait for an earlier one
      const waits = Array.from({ length: n }, (_, i) =>
        Array.from({ length: i }, (_, j) => j).filter(() => rand() < 0.15),
      );
      const t = task(rank, anchor, tool, waits);
      // An order the rules allow: the first of the free operations of the lowest rank, each time
      const left = new Set(rank.keys());
      const start: number[] = [];
      while (left.size > 0) {
        const free = [...left].filter((i) => waits[i]!.every((j) => !left.has(j)));
        const lowest = Math.min(...free.map((i) => rank[i]!));
        const next = free.find((i) => rank[i] === lowest)!;
        start.push(next);
        left.delete(next);
      }
      expect(isAllowed(start, t)).toBe(true);
      const better = improve(start, { x: 0, y: 0 }, t);
      expect(isAllowed(better, t)).toBe(true);
      expect([...better].sort((a, b) => a - b)).toEqual(start.slice().sort((a, b) => a - b));
      expect(changes(better, tool)).toBeLessThanOrEqual(changes(start, tool));
      expect(length(better, anchor)).toBeLessThanOrEqual(length(start, anchor));
      // The same task without the tools finds at least as short a way: the tools only forbid
      const free = improve(start, { x: 0, y: 0 }, { ...t, tool: undefined });
      expect(length(free, anchor)).toBeLessThanOrEqual(length(start, anchor));
      if (better.some((x, i) => x !== start[i])) turned++;
      if (length(free, anchor) < length(better, anchor)) held++;
    }
    // Neither the turns nor the ones the tools held back were rare
    expect(turned).toBeGreaterThan(100);
    expect(held).toBeGreaterThan(10);
  });
});
