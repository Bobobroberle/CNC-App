import type { Bounds, Point } from '@lowrider/cam';

/**
 * The room between a part that is dragged and its neighbours, as a drawing program shows it: on each of
 * the four sides the nearest box that lies across from the dragged one – that overlaps it in the other
 * axis – and the distance to it, mm. Pure maths on boxes in table coordinates (y up). Boxes that touch
 * have a gap of 0; boxes that overlap on both axes have none on any side; two boxes that only meet at a
 * corner are no neighbours.
 */

/** Left and right of the dragged box, above it (larger y) and below it */
export type GapSide = 'left' | 'right' | 'up' | 'down';

export interface Gap {
  side: GapSide;
  /** The room between the two boxes, mm (0 where they touch) */
  gap: number;
  /** The dimension line from the dragged box to the neighbour, work mm, in the middle of what they share */
  from: Point;
  to: Point;
  /** The gap on the opposite side is as large (within `EQUAL_GAP`): the part stands in the middle */
  equal: boolean;
}

/** Two gaps count as equal when they differ by less than half of the last digit that is shown, mm */
export const EQUAL_GAP = 0.05;

/** Overlap and float noise below this is no overlap, mm */
const NOISE = 1e-9;

const SIDES: readonly GapSide[] = ['left', 'right', 'up', 'down'];
const OPPOSITE: Record<GapSide, GapSide> = { left: 'right', right: 'left', up: 'down', down: 'up' };

/** The gap on one side of `box`, or null where nothing lies across from it there. */
function nearestOn(
  box: Bounds,
  others: readonly Bounds[],
  side: GapSide,
): Omit<Gap, 'equal'> | null {
  const horizontal = side === 'left' || side === 'right';
  let best: { gap: number; other: Bounds; at: number } | null = null;
  for (const other of others) {
    // What they share across the line of sight
    const lo = horizontal ? Math.max(box.minY, other.minY) : Math.max(box.minX, other.minX);
    const hi = horizontal ? Math.min(box.maxY, other.maxY) : Math.min(box.maxX, other.maxX);
    if (!(hi - lo > NOISE)) continue;
    const gap =
      side === 'right'
        ? other.minX - box.maxX
        : side === 'left'
          ? box.minX - other.maxX
          : side === 'up'
            ? other.minY - box.maxY
            : box.minY - other.maxY;
    // A box that overlaps this one is no neighbour on this side
    if (gap < -NOISE) continue;
    if (!best || gap < best.gap) best = { gap: Math.max(0, gap), other, at: (lo + hi) / 2 };
  }
  if (!best) return null;
  const { gap, other, at } = best;
  const edge =
    side === 'right' ? box.maxX : side === 'left' ? box.minX : side === 'up' ? box.maxY : box.minY;
  const far =
    side === 'right'
      ? other.minX
      : side === 'left'
        ? other.maxX
        : side === 'up'
          ? other.minY
          : other.maxY;
  return {
    side,
    gap,
    from: horizontal ? { x: edge, y: at } : { x: at, y: edge },
    to: horizontal ? { x: far, y: at } : { x: at, y: far },
  };
}

/**
 * The gaps around `box`, in the order left, right, up, down – only the sides that have a neighbour.
 * Where the two gaps of an axis are equal both are marked.
 */
export function gapsAround(box: Bounds, others: readonly Bounds[]): Gap[] {
  const found = new Map<GapSide, Omit<Gap, 'equal'>>();
  for (const side of SIDES) {
    const gap = nearestOn(box, others, side);
    if (gap) found.set(side, gap);
  }
  return SIDES.filter((side) => found.has(side)).map((side) => {
    const gap = found.get(side)!;
    const across = found.get(OPPOSITE[side]);
    return { ...gap, equal: across !== undefined && Math.abs(across.gap - gap.gap) < EQUAL_GAP };
  });
}
