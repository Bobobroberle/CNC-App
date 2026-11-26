import { isSelected, partsOf, type CamItem, type Selection } from './camItems';

/**
 * The selection of the drawing as a set of groups. A group is the unit of arranging: the things that
 * came in together (a file's contours, a copy of them) or were grouped by hand are picked, moved and
 * aligned as one. Pure; the store keeps the result.
 *
 * Shapes of a selection: `null` (nothing), a number (one group), `'all'`, or – for two groups or more –
 * the list of the groups, in the order of the drawing's list. One group is never an array, none is never `[]`, so the
 * places that read a single group (`typeof selected === 'number'`) keep their meaning.
 */

/** The groups of some items, once each, in the order of the list. */
export const groupsOf = (items: readonly CamItem[]): number[] => [
  ...new Set(items.map((i) => i.group)),
];

/** One selection from a list of groups: none is nothing, one is that group, more are the set. */
export function normalise(groups: readonly number[]): Selection {
  const once = [...new Set(groups)];
  return once.length === 0 ? null : once.length === 1 ? once[0]! : once;
}

/**
 * The groups of the parts a selection holds – the registration holes are never one of them: the two
 * holes of a two-sided part are only ever moved, alone.
 */
export const unitsSelected = (items: readonly CamItem[], selected: Selection): number[] =>
  groupsOf(partsOf(items).filter((i) => isSelected(i, selected)));

/**
 * A group taken into the selection, or let go of if it is in: what a tap does while several are
 * being picked. `'all'` becomes the list of every group before one is taken out. A registration hole
 * is not one of several: touching it selects it alone; a group the drawing does not have changes nothing.
 */
export function toggleGroup(
  selected: Selection,
  group: number,
  items: readonly CamItem[],
): Selection {
  if (items.some((i) => i.registration !== undefined && i.group === group)) return group;
  if (!items.some((i) => i.group === group)) return selected;
  const next = new Set(unitsSelected(items, selected));
  if (!next.delete(group)) next.add(group);
  // Whatever the way of picking: the groups in the order of the drawing's list
  return normalise(groupsOf(partsOf(items)).filter((g) => next.has(g)));
}

/** Every group of the parts that is not selected – and none of those that are. Nothing selected: all of them. */
export function invertGroups(selected: Selection, items: readonly CamItem[]): Selection {
  const now = new Set(unitsSelected(items, selected));
  return normalise(groupsOf(partsOf(items)).filter((g) => !now.has(g)));
}

/**
 * The selection without the groups the items no longer have (a part removed, a step undone): none
 * left is nothing, one left is that group. `'all'` stays – it means whatever there is.
 */
export function pruneSelection(selected: Selection, items: readonly CamItem[]): Selection {
  if (selected === null || selected === 'all') return selected;
  const have = new Set(items.map((i) => i.group));
  return typeof selected === 'number'
    ? have.has(selected)
      ? selected
      : null
    : normalise(selected.filter((g) => have.has(g)));
}
