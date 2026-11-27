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

/**
 * How much work `improve` does before it gives up, the same on every run whatever the speed of the machine:
 * every pair of places it looks at counts one, and so does every step it takes to test the rules (see
 * `Walker.work`) – a test of the rules is not free, and a drawing in which every row has a number would
 * otherwise spend minutes on reversals that all break the numbers.
 */
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
 * The rules of the order as a state that moves along an order, one operation at a time and back: at every
 * step one of the operations that are not waiting for anything, of the lowest rank among them, and among
 * those the ones with a `seq` first (the lowest number; equal numbers are all allowed).
 */
interface Walker {
  /**
   * What the walker has done so far: every `take` and `untake` (and the operations that wait for the one
   * moved) and every number it looked past. This is what `improve` counts against its budget.
   */
  readonly work: number;
  /** Whether the rules allow `x` as the next operation */
  allows(x: number): boolean;
  /** The operations of `x`'s rank that have a number and still wait for another */
  blocked(x: number): number[];
  /** `x` is cut now: what waits for it is freed */
  take(x: number): void;
  /** Takes back the latest `take(x)` that is not yet taken back (in the reverse order of the takes) */
  untake(x: number): void;
}

function walker(task: RouteTask): Walker {
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
  /** Where an operation with a number stands in the list of its rank (Infinity: it has none) */
  const place = new Array<number>(n).fill(Infinity);
  for (const list of numbered) {
    list.sort((a, b) => task.seq[a]! - task.seq[b]!);
    list.forEach((i, p) => (place[i] = p));
  }
  /** Per rank, how far its list is done from the start: nothing before it needs looking at */
  const head = new Array<number>(levels).fill(0);
  let work = 0;
  const pastDone = (rank: number) => {
    const list = numbered[rank]!;
    while (head[rank]! < list.length && done[list[head[rank]!]!]) {
      head[rank]!++;
      work++;
    }
  };
  return {
    get work() {
      return work;
    },
    allows(x) {
      const rank = task.rank[x]!;
      let lowest = 0;
      while (free[lowest] === 0) lowest++;
      if (done[x] || left[x] !== 0 || rank !== lowest) return false;
      pastDone(rank);
      // The first number that is free: what an operation of this rank has to match
      const list = numbered[rank]!;
      let first = head[rank]!;
      while (first < list.length && (done[list[first]!] || left[list[first]!] !== 0)) {
        first++;
        work++;
      }
      return first === list.length || task.seq[x] === task.seq[list[first]!];
    },
    blocked(x) {
      const rank = task.rank[x]!;
      pastDone(rank);
      return numbered[rank]!.slice(head[rank]).filter((i) => !done[i] && left[i]! > 0);
    },
    take(x) {
      done[x] = true;
      free[task.rank[x]!]!--;
      work += 1 + waiters[x]!.length;
      for (const w of waiters[x]!) {
        left[w]!--;
        if (left[w] === 0) free[task.rank[w]!]!++;
      }
    },
    untake(x) {
      const rank = task.rank[x]!;
      done[x] = false;
      free[rank]!++;
      // What was passed as done may be this one
      head[rank] = Math.min(head[rank]!, place[x]!);
      work += 1 + waiters[x]!.length;
      for (const w of waiters[x]!) {
        if (left[w] === 0) free[task.rank[w]!]!--;
        left[w]!++;
      }
    },
  };
}

/**
 * Walks an order the way the rules choose. `step` is told, before each operation, the operation, whether
 * it is allowed and the operations of its rank that wait; it stops the walk by returning false.
 */
function walk(
  order: readonly number[],
  task: RouteTask,
  step: (x: number, ok: boolean, blocked: () => number[]) => boolean,
): void {
  const way = walker(task);
  for (const x of order) {
    if (!step(x, way.allows(x), () => way.blocked(x))) return;
    way.take(x);
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
 * the estimate – `toolpaths` makes sure of it with the real moves. An order that does not keep the rules
 * itself is returned as it is. Gives up after `budget` units of work (see `ROUTE_BUDGET`; the best order
 * so far), the same on every machine.
 *
 * The rules are asked only inside the stretch that is turned round: what stands before it is cut with
 * the same operations done already, and what stands after it with the same operations done as before
 * (the stretch holds the same ones, only in another order), so for an order that keeps the rules the
 * answer there cannot change. The state after what stands before the stretch is carried along, a test
 * takes the stretch's operations one by one from it and then back – a test costs the length of the
 * stretch, not that of the whole order.
 */
export function improve(
  order: readonly number[],
  from: Point,
  task: RouteTask,
  budget = ROUTE_BUDGET,
): number[] {
  const best = [...order];
  if (!isAllowed(best, task)) return best;
  const n = best.length;
  const to = (i: number, j: number) => distance(task.anchor[i]!, task.anchor[j]!);
  let used = 0;
  for (let improved = true; improved; ) {
    improved = false;
    // The state after `best[0..a)`: the stretch from `a` on is turned round, never what stands before it
    const way = walker(task);
    let counted = 0;
    /** Whether the rules still allow the order with `best[a..b]` turned round; the state is left as it was */
    const fits = (a: number, b: number): boolean => {
      let k = b;
      for (; k >= a && way.allows(best[k]!); k--) way.take(best[k]!);
      const ok = k < a;
      for (k++; k <= b; k++) way.untake(best[k]!);
      return ok;
    };
    for (let a = 0; a < n - 1; a++) {
      for (let b = a + 1; b < n; b++) {
        if (++used > budget) return best;
        const head = best[a]!;
        const tail = best[b]!;
        const before = a === 0 ? from : task.anchor[best[a - 1]!]!;
        let change = distance(before, task.anchor[tail]!) - distance(before, task.anchor[head]!);
        if (b < n - 1) change += to(head, best[b + 1]!) - to(tail, best[b + 1]!);
        if (change >= -GAIN) continue;
        const allowed = fits(a, b);
        used += way.work - counted;
        counted = way.work;
        if (!allowed) continue;
        for (let i = a, j = b; i < j; i++, j--) [best[i], best[j]] = [best[j]!, best[i]!];
        improved = true;
      }
      way.take(best[a]!);
    }
  }
  return best;
}
