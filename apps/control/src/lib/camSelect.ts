import type { Bounds } from '@lowrider/cam';
import { contoursBox, isSelected, partsOf, type CamItem, type Selection } from './camItems';

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

/**
 * The groups of the parts that have something in sight: a group is out of sight only where every part
 * of it is hidden (a group that holds hidden and visible parts is one thing, and shown).
 */
export const shownGroups = (items: readonly CamItem[]): number[] =>
  groupsOf(partsOf(items).filter((i) => i.hidden !== true));

/**
 * What "everything" is. While no group is wholly hidden it is `'all'` – with the registration holes of
 * a two-sided part. A wholly hidden group is left out of everything, and `'all'` cannot say that, so
 * then it is the list of the groups that have a part in sight (and the holes with them): the store never
 * keeps `'all'` beside such a group, or a move, a delete or a copy would reach what the operator cannot see.
 * Nothing in sight is nothing.
 */
export function everything(items: readonly CamItem[]): Selection {
  const shown = shownGroups(items);
  if (shown.length === groupsOf(partsOf(items)).length) return 'all';
  if (shown.length === 0) return null;
  const holes = items.filter((i) => i.registration !== undefined);
  return normalise([...shown, ...groupsOf(holes)]);
}

/**
 * Every group of the parts in sight that is not selected – and none of those that are. Nothing selected: all
 * of them. A wholly hidden group is not inverted into the selection (it can be ticked in the list).
 */
export function invertGroups(selected: Selection, items: readonly CamItem[]): Selection {
  const now = new Set(unitsSelected(items, selected));
  return normalise(shownGroups(items).filter((g) => !now.has(g)));
}

/**
 * The groups of `found` taken into the selection (the parts of it stay selected), in the order of the
 * drawing's list. Nothing found changes nothing. A registration hole is never one of several: it goes
 * when something is added to it.
 */
export function addGroups(
  selected: Selection,
  found: readonly number[],
  items: readonly CamItem[],
): Selection {
  if (found.length === 0) return selected;
  const next = new Set([...unitsSelected(items, selected), ...found]);
  return normalise(groupsOf(partsOf(items)).filter((g) => next.has(g)));
}

/** Which parts a rectangle takes: those whose box it touches (even by an edge), or only those it holds whole. */
export type RectMode = 'touch' | 'inside';

/**
 * The parts a rectangle on the table (work mm, any two corners) takes – each by its own true outline box
 * (`contoursBox`: a circle by its radius, a turned part by its turned outline), in the order of the list.
 * Registration holes and hidden parts are never taken. Not a group's union box: a group is taken by a
 * part of it that the rectangle meets – the finger sees parts, the selection is made of their groups.
 */
export function itemsInRect(
  items: readonly CamItem[],
  rect: Bounds,
  mode: RectMode = 'touch',
): CamItem[] {
  const x0 = Math.min(rect.minX, rect.maxX);
  const x1 = Math.max(rect.minX, rect.maxX);
  const y0 = Math.min(rect.minY, rect.maxY);
  const y1 = Math.max(rect.minY, rect.maxY);
  return partsOf(items).filter((item) => {
    if (item.hidden === true) return false;
    const b = contoursBox(item.contours);
    if (!b) return false;
    return mode === 'inside'
      ? b.minX >= x0 && b.maxX <= x1 && b.minY >= y0 && b.maxY <= y1
      : b.maxX >= x0 && b.minX <= x1 && b.maxY >= y0 && b.minY <= y1;
  });
}

/** The groups the rectangle takes, once each, in the order of the list. */
export const groupsInRect = (items: readonly CamItem[], rect: Bounds, mode?: RectMode): number[] =>
  groupsOf(itemsInRect(items, rect, mode));

/**
 * The selection without the groups the items no longer have (a part removed, a step undone): none
 * left is nothing, one left is that group. `'all'` stays – it means whatever there is – unless a group
 * is wholly hidden, which everything leaves out (`everything`).
 */
export function pruneSelection(selected: Selection, items: readonly CamItem[]): Selection {
  if (selected === 'all') return everything(items);
  if (selected === null) return selected;
  const have = new Set(items.map((i) => i.group));
  return typeof selected === 'number'
    ? have.has(selected)
      ? selected
      : null
    : normalise(selected.filter((g) => have.has(g)));
}
