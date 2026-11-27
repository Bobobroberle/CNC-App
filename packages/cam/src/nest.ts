import type { Bounds, Point } from './geometry';
import { compose, rotation, translation, type Matrix } from './transform';

/**
 * Packing parts on a sheet of material – by their BOUNDING BOXES. This places rectangles. It does not
 * interlock shapes: an L, a ring or a part with a notch takes the whole box around it, and what lies in
 * its corners stays unused. That is what makes the result safe – boxes that keep a gap keep it between
 * whatever lies inside them – and it is why the saving is that of boxes, not of outlines. A part is given
 * by the size of its box alone; no outline is looked at.
 *
 * The packer is MaxRects (Jylänki 2010): a list of the largest free rectangles, the part goes to a corner
 * of the free rectangle that suits it best, and every free rectangle it touches is cut round it. It is a
 * greedy heuristic – a good layout, not the best one. Four runs are made (the parts ordered by area or by
 * their longer side, two rules for the best place) and the best result is kept: the most area placed, then
 * the smallest box round the placed parts (a compact layout tends to leave the free material in one piece
 * at the far side – tends to, not always), then the earlier run. Everything is deterministic: the same input gives the same output, and equal choices are
 * decided by the order of the input.
 */

export interface NestPart<Id = number> {
  /** Names the part in the result; ids should be different from each other */
  id: Id;
  /** The part's box, mm: along x as it lies now */
  width: number;
  /** The part's box, mm: along y as it lies now */
  height: number;
}

export interface NestStock {
  width: number;
  height: number;
}

export interface NestOptions {
  /** The least room between two boxes, mm (default 0): the cutter's diameter and what the cut-outs need */
  gap?: number;
  /** The least room between a box and the rim of the stock, mm (default 0) */
  margin?: number;
  /** A part may be turned by 90° counter-clockwise (default false); a part that is square never is */
  rotate?: boolean;
}

export interface NestPlacement<Id = number> {
  id: Id;
  /** The lower left corner of the placed box, mm, in the stock's own coordinates (its lower left corner is 0, 0; y up) */
  x: number;
  y: number;
  /** The box is turned 90° counter-clockwise: it is `height` wide and `width` high where it stands */
  turned: boolean;
}

export interface NestResult<Id = number> {
  /** The parts that have a place, in the order of the input */
  placed: NestPlacement<Id>[];
  /** The ids of the parts that have none (too large, or no room left; a box of no size or no number), in the order of the input */
  unplaced: Id[];
  /** The area of the placed boxes as a share of the stock's whole area, 0…1 (margin and gaps count as unused); 0 for a stock of no area */
  used: number;
}

/** What a fit test lets pass, mm: float noise must not lose a part that fits exactly. Boxes are at least `gap` − this apart. */
const SLACK = 1e-9;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Slot extends Rect {
  turned: boolean;
}

/** How a run orders the parts and how it chooses among the places that fit */
interface Strategy {
  order: 'area' | 'long-side';
  fit: 'short-side' | 'bottom-left';
}

const STRATEGIES: readonly Strategy[] = [
  { order: 'area', fit: 'short-side' },
  { order: 'area', fit: 'bottom-left' },
  { order: 'long-side', fit: 'short-side' },
  { order: 'long-side', fit: 'bottom-left' },
];

const clean = (v = 0) => (Number.isFinite(v) && v > 0 ? v : 0);

const inside = (a: Rect, b: Rect) =>
  a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

/** The free rectangles after `used` was put down: every one it touches is cut into what lies beside it */
function without(free: readonly Rect[], used: Rect): Rect[] {
  const out: Rect[] = [];
  for (const f of free) {
    const apart =
      used.x >= f.x + f.w ||
      used.x + used.w <= f.x ||
      used.y >= f.y + f.h ||
      used.y + used.h <= f.y;
    if (apart) {
      out.push(f);
      continue;
    }
    if (used.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h) {
      out.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - (used.y + used.h) });
    }
    if (used.x > f.x) out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w) {
      out.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - (used.x + used.w), h: f.h });
    }
  }
  // A free rectangle that lies inside another adds nothing (of two equal ones the earlier stays); the
  // list keeps the order in which the rectangles that remain were made
  let kept: Rect[] = [];
  for (const a of out) {
    if (kept.some((b) => inside(a, b))) continue;
    kept = kept.filter((b) => !inside(b, a));
    kept.push(a);
  }
  return kept;
}

/** One run: where each part (by its index) goes in the stock inflated by the gap, null where it does not fit */
function pack(
  parts: readonly NestPart<unknown>[],
  usable: readonly number[],
  bin: Rect,
  gap: number,
  rotate: boolean,
  strategy: Strategy,
): (Slot | null)[] {
  const slots: (Slot | null)[] = parts.map(() => null);
  const key = (i: number) => {
    const p = parts[i]!;
    const size = p.width * p.height;
    const longer = Math.max(p.width, p.height);
    return strategy.order === 'area' ? [size, longer] : [longer, size];
  };
  const order = [...usable].sort((a, b) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return b1! - a1! || b2! - a2! || a - b;
  });
  let free: Rect[] = [bin];
  for (const i of order) {
    const p = parts[i]!;
    let best: Slot | undefined;
    let bestScore: number[] = [];
    for (const f of free) {
      for (const turned of rotate && p.width !== p.height ? [false, true] : [false]) {
        const w = (turned ? p.height : p.width) + gap;
        const h = (turned ? p.width : p.height) + gap;
        // (written so that a size that is no number does not fit)
        if (!(w <= f.w + SLACK && h <= f.h + SLACK)) continue;
        const short = Math.min(f.w - w, f.h - h);
        const long = Math.max(f.w - w, f.h - h);
        const score = strategy.fit === 'short-side' ? [short, long, f.y, f.x] : [f.y + h, f.x];
        // The first of equal scores stays: unturned before turned, then the older free rectangle
        if (!best || before(score, bestScore)) {
          best = { x: f.x, y: f.y, w, h, turned };
          bestScore = score;
        }
      }
    }
    if (!best) continue;
    slots[i] = best;
    free = without(free, best);
  }
  return slots;
}

/** Whether the scores `a` come before `b`, compared number by number */
function before(a: readonly number[], b: readonly number[]): boolean {
  for (let k = 0; k < a.length; k++) {
    if (a[k]! !== b[k]!) return a[k]! < b[k]!;
  }
  return false;
}

/**
 * Places the boxes of `parts` on `stock`, each at least `options.gap` from every other and
 * `options.margin` from the rim; whatever finds no place is listed in `unplaced`. Never throws: a part whose
 * box has no size or no number, and every part on a stock that has none, is unplaced. See the top of this
 * file for what it does and does not do. A part of 100 × 20 on a stock of 30 × 200 is placed only with
 * `rotate`, turned.
 *
 * ```ts
 * nestParts(
 *   [{ id: 1, width: 40, height: 40 }, { id: 2, width: 40, height: 40 }],
 *   { width: 100, height: 50 },
 *   { gap: 5, margin: 5 },
 * );
 * // placed: id 1 at (5, 5), id 2 at (50, 5); unplaced: []; used: 3200 / 5000 = 0.64
 * ```
 *
 * Where the box goes is the lower left corner of a free rectangle. With the gap added to the sizes of the
 * boxes and to the stock inside its margin, boxes that do not overlap are boxes with a gap between them.
 * Of the runs (see the top of the file) the one that placed the most area wins; in a tie the smaller box
 * round the placed parts; in a tie the earlier. Inside a run a part goes where its free rectangle is left
 * with the shortest side over (then the longest, the lower y, the lower x), or – in the other rule – where
 * its top edge is lowest (then the lower x); a tie of all of it is decided for the unturned part and the
 * older free rectangle. Parts are taken largest first (by area, or by the longer
 * side); equal ones in the order of the input.
 */
export function nestParts<Id = number>(
  parts: readonly NestPart<Id>[],
  stock: NestStock,
  options: NestOptions = {},
): NestResult<Id> {
  const gap = clean(options.gap);
  const margin = clean(options.margin);
  const rotate = options.rotate === true;
  const bin: Rect = {
    x: 0,
    y: 0,
    w: stock.width - 2 * margin + gap,
    h: stock.height - 2 * margin + gap,
  };
  const usable: number[] = [];
  parts.forEach((p, i) => {
    if (Number.isFinite(p.width) && Number.isFinite(p.height) && p.width > 0 && p.height > 0) {
      usable.push(i);
    }
  });
  let best: (Slot | null)[] = parts.map(() => null);
  let bestArea = -1;
  let bestExtent = Infinity;
  for (const strategy of STRATEGIES) {
    const slots = pack(parts, usable, bin, gap, rotate, strategy);
    // Summed in the order of the input: the same parts give the same number whichever way they were placed
    let placedArea = 0;
    let right = 0;
    let top = 0;
    slots.forEach((s, i) => {
      if (!s) return;
      placedArea += parts[i]!.width * parts[i]!.height;
      right = Math.max(right, s.x + s.w - gap);
      top = Math.max(top, s.y + s.h - gap);
    });
    const extent = right * top;
    if (placedArea > bestArea || (placedArea === bestArea && extent < bestExtent)) {
      best = slots;
      bestArea = placedArea;
      bestExtent = extent;
    }
  }
  const placed: NestPlacement<Id>[] = [];
  const unplaced: Id[] = [];
  parts.forEach((p, i) => {
    const s = best[i]!;
    if (s) placed.push({ id: p.id, x: margin + s.x, y: margin + s.y, turned: s.turned });
    else unplaced.push(p.id);
  });
  const total = stock.width * stock.height;
  return { placed, unplaced, used: total > 0 ? bestArea / total : 0 };
}

/**
 * The map that takes a part's box to where `nestParts` put it – the shift, and the turn by 90°
 * counter-clockwise for a turned part – so that the drawing can compose it with the part's own map instead
 * of rewriting points. `box` is the part's box in the plane where it lies now, the one whose `width` and
 * `height` were given to `nestParts`; `origin` is where the stock's lower left corner lies in that plane
 * (default 0, 0). A turned box ends up `height` wide and `width` high with its lower left corner at the
 * placement: its own lower left corner goes to the lower right, its lower right to the upper right.
 *
 * ```ts
 * // a box from (10, 20) to (40, 35), placed turned at (100, 200): it then spans (100, 200)–(115, 230)
 * nestMatrix({ x: 100, y: 200, turned: true }, { minX: 10, minY: 20, maxX: 40, maxY: 35 });
 * // (10, 20) → (115, 200), (40, 20) → (115, 230), (10, 35) → (100, 200)
 * ```
 */
export function nestMatrix(
  placement: Pick<NestPlacement<unknown>, 'x' | 'y' | 'turned'>,
  box: Bounds,
  origin: Point = { x: 0, y: 0 },
): Matrix {
  const lowerLeft = translation(-box.minX, -box.minY);
  if (!placement.turned) {
    return compose(translation(origin.x + placement.x, origin.y + placement.y), lowerLeft);
  }
  const height = box.maxY - box.minY;
  return compose(
    translation(origin.x + placement.x + height, origin.y + placement.y),
    compose(rotation(90), lowerLeft),
  );
}
