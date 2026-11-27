import { nestMatrix, nestParts, type Bounds, type Matrix } from '@lowrider/cam';
import { MOVES } from './camArrange';
import { isSelected, itemsBounds, partsOf, type CamItem, type Selection } from './camItems';

/**
 * "Verschachteln": the selected parts packed onto the entered stock by their BOXES. The pure part – which
 * unit goes where, and what rides along – so the store only has to apply the maps (`store/cam.ts` `nest`).
 *
 * The packer itself is the library's `nestParts` (MaxRects over bounding boxes): it places rectangles and does
 * not interlock shapes, which is why it is safe and why it saves what boxes save. What this file adds is the
 * choice of the rectangles.
 *
 * **The unit is a group, rigid – and what lies inside a unit's box goes with it.** Every `add` of the drawing
 * is a group of its own, so a hole drawn into a plate is another group than the plate: packed on its own it
 * would land beside the plate and the program would drill the stock there. A group whose box lies wholly inside
 * the box of a selected group is therefore a *rider*: it moves with that group by the same map (selected or
 * not, hidden or not – a hidden hole that is shown again must still be in its plate). Only the groups that
 * carry riders or ride nowhere are packed (*carriers*). A group inside the boxes of several carriers goes with
 * the smallest. What is neither selected nor inside a carrier stays where it is.
 */

/** Room kept between two parts unless the operator says another, beyond the cutter's diameter, mm */
export const NEST_EXTRA_GAP = 2;

/** The room between two parts that is meant when none is typed: the cutter and a little more, mm */
export const defaultNestGap = (toolDiameter: number): number => toolDiameter + NEST_EXTRA_GAP;

/** A box lies inside another (to float noise, mm) */
const SLACK = 1e-6;
const within = (inner: Bounds, outer: Bounds) =>
  inner.minX >= outer.minX - SLACK &&
  inner.minY >= outer.minY - SLACK &&
  inner.maxX <= outer.maxX + SLACK &&
  inner.maxY <= outer.maxY + SLACK;
const area = (b: Bounds) => (b.maxX - b.minX) * (b.maxY - b.minY);
/** Two boxes share some area (boxes that only touch, or lie a hair apart, do not) */
const overlaps = (a: Bounds, b: Bounds) =>
  a.minX < b.maxX - SLACK &&
  b.minX < a.maxX - SLACK &&
  a.minY < b.maxY - SLACK &&
  b.minY < a.maxY - SLACK;

export interface NestSettings {
  /** The least room between two parts, mm */
  gap: number;
  /** Parts may be turned by 90° */
  rotate: boolean;
}

export interface NestPlan {
  /**
   * The map of every group that moves: a placed carrier that is not already where it is placed, and the groups
   * that ride with it – each by the carrier's own map (a rigid shift, and the turn of 90° about the box).
   */
  moves: Map<number, Matrix>;
  /** The carriers that found a place, and the ones that found none – by group, in the order of the list */
  placed: number[];
  unplaced: number[];
  /** How many groups ride along with the carriers (placed or not) */
  riders: number;
  /**
   * The groups that stay where they are and whose box a placed carrier now overlaps: a part that is not selected,
   * or one that found no place – in the order of the list. The packer knows no obstacles, so these are cut through
   * each other in the program until one of them is moved. A part that rides along is not one of them (it is
   * inside its carrier's box, and moves with it), nor is a hidden one (it is not cut).
   */
  overlapped: number[];
  /** The share of the stock's area that the boxes of the placed carriers take, 0…1 */
  used: number;
}

/** The box of a group as the drawing sees it: of its parts in sight – or, where none is, of all of them. */
function boxOf(parts: readonly CamItem[]): Bounds | null {
  return itemsBounds(parts.filter((i) => i.hidden !== true)) ?? itemsBounds(parts);
}

/**
 * Where the selected groups of `items` go on `stock` (work mm), or null where nothing in the selection can
 * be packed (no part of it is in sight). Nothing moves in the plan of a part that already stands where it is
 * placed – within `MOVES`, and never one that is turned.
 */
export function planNest(
  items: readonly CamItem[],
  selected: Selection,
  stock: Bounds,
  settings: NestSettings,
): NestPlan | null {
  const groups = new Map<number, CamItem[]>();
  for (const part of partsOf(items))
    groups.set(part.group, [...(groups.get(part.group) ?? []), part]);
  const boxes = new Map<number, Bounds>();
  for (const [group, parts] of groups) {
    const box = boxOf(parts);
    if (box) boxes.set(group, box);
  }
  // What can be packed: the selected groups with a part in sight, by the box of what is in sight
  const candidates = [...groups]
    .filter(
      ([group, parts]) =>
        boxes.has(group) &&
        parts.some((i) => i.hidden !== true) &&
        parts.every((i) => isSelected(i, selected)),
    )
    .map(([group]) => ({ group, box: boxes.get(group)! }));
  // A candidate that lies inside a larger one (or an equal one that comes before it) rides with it
  const dominated = (x: (typeof candidates)[number], index: number) =>
    candidates.some(
      (y, j) =>
        j !== index &&
        within(x.box, y.box) &&
        (area(y.box) > area(x.box) || (area(y.box) === area(x.box) && j < index)),
    );
  const carriers = candidates.filter((c, i) => !dominated(c, i));
  if (carriers.length === 0) return null;
  const carrying = new Set(carriers.map((c) => c.group));
  // Everything else that lies inside a carrier's box goes with the smallest such carrier
  const ridersOf = new Map<number, number[]>(carriers.map((c) => [c.group, []]));
  for (const [group, box] of boxes) {
    if (carrying.has(group)) continue;
    let home: (typeof carriers)[number] | undefined;
    for (const c of carriers) {
      if (within(box, c.box) && (!home || area(c.box) < area(home.box))) home = c;
    }
    if (home) ridersOf.get(home.group)!.push(group);
  }
  const result = nestParts(
    carriers.map((c) => ({
      id: c.group,
      width: c.box.maxX - c.box.minX,
      height: c.box.maxY - c.box.minY,
    })),
    { width: stock.maxX - stock.minX, height: stock.maxY - stock.minY },
    { gap: settings.gap, rotate: settings.rotate },
  );
  const moves = new Map<number, Matrix>();
  // Where the box of each placed carrier ends up: the placement's corner, turned or not
  const ends: Bounds[] = [];
  for (const placement of result.placed) {
    const carrier = carriers.find((c) => c.group === placement.id)!;
    const m = nestMatrix(placement, carrier.box, { x: stock.minX, y: stock.minY });
    const w = carrier.box.maxX - carrier.box.minX;
    const h = carrier.box.maxY - carrier.box.minY;
    const minX = stock.minX + placement.x;
    const minY = stock.minY + placement.y;
    ends.push({
      minX,
      minY,
      maxX: minX + (placement.turned ? h : w),
      maxY: minY + (placement.turned ? w : h),
    });
    // Already there: a shift of nothing – and a part that is turned always moves
    if (!placement.turned && Math.abs(m.e) <= MOVES && Math.abs(m.f) <= MOVES) continue;
    moves.set(carrier.group, m);
    for (const rider of ridersOf.get(carrier.group)!) moves.set(rider, m);
  }
  // What stays – not selected, or without a place – and is in sight: a part that rides along is inside its carrier's
  // box (it moves with it) and is not looked at on its own; a hole in a plate that stays goes with that plate
  const placedGroups = new Set(result.placed.map((p) => p.id));
  const riding = new Set([...ridersOf.values()].flat());
  const overlapped: number[] = [];
  for (const [group, box] of boxes) {
    if (placedGroups.has(group) || riding.has(group)) continue;
    if (!groups.get(group)!.some((i) => i.hidden !== true)) continue;
    if (ends.some((end) => overlaps(box, end))) overlapped.push(group);
  }
  return {
    moves,
    placed: result.placed.map((p) => p.id),
    unplaced: result.unplaced,
    riders: [...ridersOf.values()].reduce((sum, list) => sum + list.length, 0),
    overlapped,
    used: result.used,
  };
}
