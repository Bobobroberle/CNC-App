import { distance, type Point } from './geometry';
import type { Move } from './toolpath';

/**
 * The order of the cuts, apart from the cuts themselves: what the rules allow, where the operator's
 * wish was not followed and how a route is made shorter. Pure – `toolpaths` turns a task into moves.
 * Not part of the package's interface (`index.ts` does not export it); `rapidLength` is, through `toolpath.ts`.
 */

/**
 * What the order of the operations of one drawing depends on, one entry per operation (by its place in
 * the list of operations to cut).
 */
export interface RouteTask {
  /** What comes first when several could: the lower rank first */
  rank: readonly number[];
  /** Where the operator wants it among those of its rank; undefined: by route */
  seq: readonly (number | undefined)[];
  /** The operations that must be cut before this one (what lies inside a contour that is cut free) */
  waits: readonly (readonly number[])[];
  /** A point standing for the operation, to estimate the way from one to the next */
  anchor: readonly Point[];
}

/** A change of the estimated length smaller than this is none (mm) */
const GAIN = 1e-9;

/** How many pairs of places `improve` looks at before it gives up – the same on every run, whatever the speed of the machine */
export const ROUTE_BUDGET = 3_000_000;

/** The rapid travel of a program in the XY plane, mm: every rapid move from where the tool stood (`from`: where it begins). */
export function rapidLength(moves: readonly Move[], from: Point = { x: 0, y: 0 }): number {
  let x = from.x;
  let y = from.y;
  let total = 0;
  for (const m of moves) {
    const nx = m.x ?? x;
    const ny = m.y ?? y;
    if (m.feed === null) total += Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
  }
  return total;
}

/**
 * Walks an order the way the rules choose: at every step one of the operations that are not waiting
 * for anything, of the lowest rank among them, and among those the ones with a `seq` first (the lowest
 * number; equal numbers are all allowed). `step` is told, before each, the operation, whether it is
 * allowed and the operations of its rank that wait; it stops the walk by returning false.
 */
function walk(
  order: readonly number[],
  task: RouteTask,
  step: (x: number, ok: boolean, blocked: () => number[]) => boolean,
): void {
  const n = task.rank.length;
  const left = task.waits.map((w) => w.length);
  const waiters: number[][] = Array.from({ length: n }, () => []);
  task.waits.forEach((w, i) => w.forEach((j) => waiters[j]!.push(i)));
  const levels = Math.max(-1, ...task.rank) + 1;
  /** Operations that are free to be cut, per rank */
  const free = new Array<number>(levels).fill(0);
  const done = new Array<boolean>(n).fill(false);
  left.forEach((l, i) => {
    if (l === 0) free[task.rank[i]!]!++;
  });
  // With a number: by rank and then by number, to find the one that must come first
  const numbered: number[][] = Array.from({ length: levels }, () => []);
  task.seq.forEach((q, i) => {
    if (q !== undefined) numbered[task.rank[i]!]!.push(i);
  });
  for (const list of numbered) list.sort((a, b) => task.seq[a]! - task.seq[b]!);

  for (const x of order) {
    const rank = task.rank[x]!;
    const ready = !done[x] && left[x] === 0;
    let lowest = 0;
    while (free[lowest] === 0) lowest++;
    // The first number that is free: what an operation of this rank has to match
    const first = numbered[rank]!.find((i) => !done[i] && left[i] === 0);
    const ok = ready && rank === lowest && (first === undefined || task.seq[x] === task.seq[first]);
    const blocked = () => numbered[rank]!.filter((i) => !done[i] && left[i]! > 0);
    if (!step(x, ok, blocked)) return;
    done[x] = true;
    free[rank]!--;
    for (const w of waiters[x]!) {
      left[w]!--;
      if (left[w] === 0) free[task.rank[w]!]!++;
    }
  }
}

/**
 * Whether the rules allow this order of all the operations: lowest rank first among the operations that
 * do not wait, what lies inside a contour before the contour, and the operator's numbers first within a rank.
 */
export function isAllowed(order: readonly number[], task: RouteTask): boolean {
  let allowed = true;
  walk(order, task, (_, ok) => (allowed = ok));
  return allowed;
}

/**
 * The operations whose place the operator asked for but a contour they wait for took away: while an
 * operation of the same rank was cut that the wish would have put later (or that has no number), they
 * were not yet free. Each once, in the order it was found.
 */
export function overridden(order: readonly number[], task: RouteTask): number[] {
  const found = new Set<number>();
  walk(order, task, (x, _, blocked) => {
    for (const y of blocked()) {
      if (task.seq[x] === undefined || task.seq[y]! < task.seq[x]!) found.add(y);
    }
    return true;
  });
  return [...found];
}

/**
 * A shorter order of the same operations: 2-opt on the length of the way through the operations' anchor
 * points, from `from`, that takes a reversal of a stretch of the order only if it shortens that way
 * *and* the rules still allow the result. So it is never longer than the order it started from, by
 * the estimate – `toolpaths` makes sure of it with the real moves. Gives up after `budget` pairs
 * (the best order so far), the same on every machine.
 */
export function improve(
  order: readonly number[],
  from: Point,
  task: RouteTask,
  budget = ROUTE_BUDGET,
): number[] {
  let best = [...order];
  const n = best.length;
  const to = (i: number, j: number) => distance(task.anchor[i]!, task.anchor[j]!);
  let looked = 0;
  for (let improved = true; improved; ) {
    improved = false;
    for (let a = 0; a < n - 1; a++) {
      for (let b = a + 1; b < n; b++) {
        if (++looked > budget) return best;
        const head = best[a]!;
        const tail = best[b]!;
        const before = a === 0 ? from : task.anchor[best[a - 1]!]!;
        let change = distance(before, task.anchor[tail]!) - distance(before, task.anchor[head]!);
        if (b < n - 1) change += to(head, best[b + 1]!) - to(tail, best[b + 1]!);
        if (change >= -GAIN) continue;
        const next = [...best.slice(0, a), ...best.slice(a, b + 1).reverse(), ...best.slice(b + 1)];
        if (!isAllowed(next, task)) continue;
        best = next;
        improved = true;
      }
    }
  }
  return best;
}
