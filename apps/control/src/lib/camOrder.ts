import type { OperationKind } from '@lowrider/cam';
import { partsOf, type CamItem } from './camItems';

/**
 * The order the parts are cut in, as the operator can look at it and change it. The library cuts the
 * kinds in one fixed sequence – holes, pockets, engraving, inside cuts, outlines – and what lies inside a
 * contour before the contour; within a kind (a "rank") the operator's numbers (`CamItem.seq`) come first,
 * lowest first, then the rest as the route goes. Nothing here changes the sequence of the kinds or the rule
 * for what lies inside: a number that would break either is overridden by the library (`order-overridden`).
 * What the operator reads – "Schnitt 2 von 5" – is taken from the program that was made (`Toolpath.cuts`),
 * never worked out a second time: the route decides where the parts without a number come.
 */

/** The highest number a part may carry (what a project file may hold; far more than any drawing has parts) */
export const MAX_SEQ = 9999;

/** The kinds that are cut, in the order the library cuts them – each is a rank of its own. */
export const CUT_KINDS = ['drill', 'pocket', 'on', 'inside', 'outside'] as const;
export type CutKind = (typeof CUT_KINDS)[number];

export const isCutKind = (kind: OperationKind): kind is CutKind => kind !== 'none';

/** Where a part comes among the parts cut the same way: the `n`-th of `of` (counted from 1). */
export interface CutPlace {
  n: number;
  of: number;
  kind: CutKind;
}

/**
 * The places of the parts, from the order the operations were cut in: one entry per operation that was
 * really cut, with the part (`item`, whatever the caller names a part by) and its kind. A part with
 * several contours takes the place of the first of them; every kind is counted among itself.
 */
export function cutPlaces(
  cuts: readonly { item: number; kind: OperationKind }[],
): Map<number, CutPlace> {
  const byKind = new Map<CutKind, number[]>();
  for (const { item, kind } of cuts) {
    if (!isCutKind(kind)) continue;
    const list = byKind.get(kind) ?? [];
    if (!list.includes(item)) list.push(item);
    byKind.set(kind, list);
  }
  const places = new Map<number, CutPlace>();
  for (const [kind, list] of byKind) {
    list.forEach((item, i) => places.set(item, { n: i + 1, of: list.length, kind }));
  }
  return places;
}

/**
 * The parts cut the same way as `item` (its kind, from the same side), in the order they are cut in –
 * only those that are cut at all (a part that has no place was not cut: a cutter too large for it).
 */
export function rankOf(
  item: CamItem,
  items: readonly CamItem[],
  places: Readonly<Record<number, CutPlace>>,
): CamItem[] {
  return partsOf(items)
    .filter(
      (i) =>
        i.hidden !== true &&
        i.kind === item.kind &&
        i.side === item.side &&
        places[i.id] !== undefined,
    )
    .sort((a, b) => places[a.id]!.n - places[b.id]!.n);
}

/**
 * The numbers the parts of a rank get when `id` moves one place earlier (−1) or later (1) in the order
 * they are cut in: every part of the rank is numbered by its place (0, 1, 2 …), so what the operator
 * sees is what is asked of the library. Null where it cannot move – the first one cannot go earlier,
 * the last not later – or where the part is not in the rank.
 */
export function movedSeqs(
  rank: readonly CamItem[],
  id: number,
  by: -1 | 1,
): Map<number, number> | null {
  const from = rank.findIndex((i) => i.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= rank.length) return null;
  const order = rank.map((i) => i.id);
  [order[from], order[to]] = [order[to]!, order[from]!];
  // (a drawing of more parts than a file may number: the last ones share the last number)
  return new Map(order.map((item, i) => [item, Math.min(i, MAX_SEQ)]));
}

/**
 * The place a part's number asks for among the parts cut the same way: one more than the numbered parts of its rank
 * (kind and side, in sight, really cut) that have a lower number – undefined for a part without a number. The number
 * itself is only a key to sort by (gaps are fine: "Automatisch" on one part leaves the others' numbers as they were),
 * so it is *this* place the library would give the part where nothing overrides it and no other part shares its number –
 * and what the row's badge compares the real place with.
 */
export function wishedPlace(
  item: CamItem,
  items: readonly CamItem[],
  places: Readonly<Record<number, CutPlace>>,
): number | undefined {
  if (item.seq === undefined) return undefined;
  let before = 0;
  for (const other of partsOf(items)) {
    if (
      other.id !== item.id &&
      other.seq !== undefined &&
      other.seq < item.seq &&
      other.hidden !== true &&
      other.kind === item.kind &&
      other.side === item.side &&
      places[other.id] !== undefined
    ) {
      before++;
    }
  }
  return before + 1;
}

/** Whether any part of the drawing has a number of its own. */
export const hasOrder = (items: readonly CamItem[]): boolean =>
  items.some((i) => i.seq !== undefined);
