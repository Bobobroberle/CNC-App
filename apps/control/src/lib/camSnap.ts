import type { Bounds } from '@lowrider/cam';
import { itemsBounds, isSelected, type CamItem, type Selection } from './camItems';

/**
 * Snapping a part to the lines of the others while a finger drags it (the table of the drawing workspace):
 * pure maths on boxes in table coordinates (mm, y up). The moved thing – a part, or the whole selection as
 * ONE box – has three lines on each axis (left, centre, right; bottom, middle, top); each snaps to the same
 * line of another part's box or of the stock, when it comes within the threshold. The two axes are
 * independent: a part can snap in x to one neighbour and in y to another. Where nothing is near on an axis
 * the grid keeps working exactly as it always did.
 */

/** How near a line must come to snap to another, CSS px – the caller turns it into mm with the view's scale */
export const SNAP_PX = 8;

/** What counts as lying on a line: the float noise of a snap that was made, mm */
const ON_LINE = 1e-6;

/** A line exactly at the threshold still snaps: float noise, mm */
const EDGE = 1e-9;

/**
 * A guide: the line a snapped box lies on. `axis` 'x' is a vertical line at x = `at` running from y = `from`
 * to y = `to`; 'y' a horizontal one at y = `at` from x = `from` to x = `to`. It spans the moved box and every
 * box that has the line.
 */
export interface SnapGuide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

export interface SnapMove {
  /** The shift to apply, mm */
  dx: number;
  dy: number;
  /** Which axes snapped to an object (the grid is no object) */
  x: boolean;
  y: boolean;
  guides: SnapGuide[];
}

type Axis = 'x' | 'y';

const low = (b: Bounds, axis: Axis) => (axis === 'x' ? b.minX : b.minY);
const high = (b: Bounds, axis: Axis) => (axis === 'x' ? b.maxX : b.maxY);
/** The three lines of a box on an axis, in the order edges first, then the middle: low, high, middle */
const lines = (b: Bounds, axis: Axis): [number, number, number] => [
  low(b, axis),
  high(b, axis),
  (low(b, axis) + high(b, axis)) / 2,
];

const finite = (b: Bounds) =>
  Number.isFinite(b.minX) &&
  Number.isFinite(b.minY) &&
  Number.isFinite(b.maxX) &&
  Number.isFinite(b.maxY);

/**
 * The shift of the moved box along one axis: the nearest line within the threshold (`target − own`), or null.
 * `from` is where the box lies before it moves, `shift` the raw shift. A tie keeps the first of the targets
 * in the order given – the other parts, then the stock; edges before the middle.
 */
function nearest(
  from: Bounds,
  shift: number,
  targets: readonly Bounds[],
  axis: Axis,
  threshold: number,
): number | null {
  const own = lines(from, axis);
  let best: number | null = null;
  let bestDistance = threshold + EDGE;
  for (const target of targets) {
    const theirs = lines(target, axis);
    for (let k = 0; k < 3; k++) {
      const wanted = theirs[k]! - own[k]!;
      const distance = Math.abs(wanted - shift);
      if (distance < bestDistance) {
        best = wanted;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** The guides of one axis for the box where it ended up: one per line that something else has too */
function guidesOf(moved: Bounds, targets: readonly Bounds[], axis: Axis): SnapGuide[] {
  const across: Axis = axis === 'x' ? 'y' : 'x';
  const own = lines(moved, axis);
  const found = new Map<number, SnapGuide>();
  for (const target of targets) {
    const theirs = lines(target, axis);
    for (let k = 0; k < 3; k++) {
      if (Math.abs(theirs[k]! - own[k]!) > ON_LINE) continue;
      const key = Math.round(theirs[k]! / ON_LINE);
      const known = found.get(key);
      found.set(key, {
        axis,
        at: theirs[k]!,
        from: Math.min(known?.from ?? Infinity, low(moved, across), low(target, across)),
        to: Math.max(known?.to ?? -Infinity, high(moved, across), high(target, across)),
      });
    }
  }
  return [...found.values()];
}

/**
 * Where a box goes when a finger has moved it by (`dx`, `dy`) from where it lies in `box`: each axis snaps
 * to the nearest line of `others` or of the `stock` within `threshold` mm (an object snap), else – when
 * `grid` is above 0 – the lower left corner lands on a grid of that many mm, as before there were objects to
 * snap to; with neither the move is the finger's. Starting from the raw shift every time, the snap lets go
 * again as soon as the finger moves on. `threshold` 0 is no object snap. Returns the shift to apply and the
 * guides of what snapped. `box` is what the operator sees of the moved thing – the lines that snap, the guides
 * and the gaps are its; `gridBox` (default: the same) is the box whose lower left corner lands on the grid – the
 * one the position fields show, which also holds what is hidden and moves along.
 */
export function snapMove(
  box: Bounds,
  move: { dx: number; dy: number },
  others: readonly Bounds[],
  stock: Bounds | null,
  threshold: number,
  grid: number,
  gridBox: Bounds = box,
): SnapMove {
  const targets = [...others, ...(stock ? [stock] : [])].filter(finite);
  const near = threshold > 0 && targets.length > 0 && finite(box);
  const sx = near ? nearest(box, move.dx, targets, 'x', threshold) : null;
  const sy = near ? nearest(box, move.dy, targets, 'y', threshold) : null;
  // Round numbers for the corner, so the position can be read and typed again
  const dx =
    sx ?? (grid > 0 ? Math.round((gridBox.minX + move.dx) / grid) * grid - gridBox.minX : move.dx);
  const dy =
    sy ?? (grid > 0 ? Math.round((gridBox.minY + move.dy) / grid) * grid - gridBox.minY : move.dy);
  const moved: Bounds = {
    minX: box.minX + dx,
    minY: box.minY + dy,
    maxX: box.maxX + dx,
    maxY: box.maxY + dy,
  };
  return {
    dx,
    dy,
    x: sx !== null,
    y: sy !== null,
    guides: [
      ...(sx !== null ? guidesOf(moved, targets, 'x') : []),
      ...(sy !== null ? guidesOf(moved, targets, 'y') : []),
    ],
  };
}

/**
 * The boxes the moved selection may snap to and be measured against: one per group of the other parts –
 * the group is the unit that is arranged – around what of it is in sight. Registration holes and hidden
 * parts are none, and neither is anything that is selected (a moved selection never snaps to itself).
 */
export function snapTargets(items: readonly CamItem[], selected: Selection): Bounds[] {
  const groups = new Map<number, CamItem[]>();
  for (const item of items) {
    if (item.registration !== undefined || item.hidden === true || isSelected(item, selected)) {
      continue;
    }
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  const boxes: Bounds[] = [];
  for (const list of groups.values()) {
    const box = itemsBounds(list);
    if (box) boxes.push(box);
  }
  return boxes;
}
