import { IDENTITY, circle, rectangle, type Contour } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import { isSelected, place, type CamItem } from '../src/lib/camItems';
import {
  groupsOf,
  invertGroups,
  normalise,
  pruneSelection,
  toggleGroup,
  unitsSelected,
} from '../src/lib/camSelect';

const make = (id: number, group: number, source: Contour[], registration?: 1 | 2): CamItem => ({
  id,
  group,
  source,
  placement: IDENTITY,
  contours: place(source, IDENTITY),
  kind: registration ? 'drill' : 'outside',
  tabs: false,
  relief: null,
  side: 'front',
  ...(registration ? { registration } : {}),
});

const box = (x: number) => [rectangle(x, 0, 10, 10)];
/** Groups 1 (two contours: ids 1 and 2), 2 and 3, and the two registration holes in groups 8 and 9 */
const items: CamItem[] = [
  make(1, 1, box(0)),
  make(2, 1, box(20)),
  make(3, 2, box(40)),
  make(4, 3, box(60)),
  make(5, 8, [circle(0, 0, 6)], 1),
  make(6, 9, [circle(5, 0, 6)], 2),
];

describe('the selection as a set of groups', () => {
  it('is a number for one group, a list for several, nothing for none', () => {
    expect(normalise([])).toBeNull();
    expect(normalise([4])).toBe(4);
    expect(normalise([4, 4])).toBe(4);
    expect(normalise([4, 2, 4, 9])).toEqual([4, 2, 9]);
    expect(groupsOf(items)).toEqual([1, 2, 3, 8, 9]);
  });

  it('knows which things a selection holds, whatever its shape', () => {
    const ids = (sel: Parameters<typeof isSelected>[1]) =>
      items.filter((i) => isSelected(i, sel)).map((i) => i.id);
    expect(ids(null)).toEqual([]);
    expect(ids(2)).toEqual([3]);
    expect(ids(1)).toEqual([1, 2]);
    expect(ids([1, 3])).toEqual([1, 2, 4]);
    expect(ids('all')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids([])).toEqual([]);
  });

  it('counts only the groups of the parts as units – never a registration hole', () => {
    expect(unitsSelected(items, 'all')).toEqual([1, 2, 3]);
    expect(unitsSelected(items, [1, 3])).toEqual([1, 3]);
    expect(unitsSelected(items, 8)).toEqual([]);
    expect(unitsSelected(items, null)).toEqual([]);
  });

  it('takes a group in and lets go of it, step by step', () => {
    let sel = toggleGroup(null, 2, items);
    expect(sel).toBe(2);
    sel = toggleGroup(sel, 3, items);
    expect(sel).toEqual([2, 3]);
    sel = toggleGroup(sel, 1, items);
    // always in the order of the drawing's list, not of the picking
    expect(sel).toEqual([1, 2, 3]);
    sel = toggleGroup(sel, 3, items);
    expect(sel).toEqual([1, 2]);
    sel = toggleGroup(sel, 2, items);
    expect(sel).toBe(1);
    sel = toggleGroup(sel, 1, items);
    expect(sel).toBeNull();
  });

  it('turns "everything" into the list of its groups before taking one out', () => {
    expect(toggleGroup('all', 2, items)).toEqual([1, 3]);
    // already everything: the group that is in is let go of, the registration holes are not kept
    expect(toggleGroup('all', 1, items)).toEqual([2, 3]);
  });

  it('keeps a registration hole alone, and a group the drawing lacks out of it', () => {
    expect(toggleGroup(null, 8, items)).toBe(8);
    expect(toggleGroup([1, 2], 8, items)).toBe(8);
    expect(toggleGroup('all', 9, items)).toBe(9);
    // from a hole to a part: the hole is not carried along
    expect(toggleGroup(8, 2, items)).toBe(2);
    expect(toggleGroup([1, 2], 77, items)).toEqual([1, 2]);
    expect(toggleGroup(null, 77, items)).toBeNull();
  });

  it('inverts to the parts that are not selected, never the registration holes', () => {
    expect(invertGroups(2, items)).toEqual([1, 3]);
    expect(invertGroups([1, 3], items)).toBe(2);
    expect(invertGroups([1, 2, 3], items)).toBeNull();
    expect(invertGroups('all', items)).toBeNull();
    expect(invertGroups(null, items)).toEqual([1, 2, 3]);
    // a selected hole is no part: everything else is what is left
    expect(invertGroups(8, items)).toEqual([1, 2, 3]);
  });

  it('drops the groups that are gone, and normalises what is left', () => {
    expect(pruneSelection(null, items)).toBeNull();
    expect(pruneSelection('all', items)).toBe('all');
    expect(pruneSelection(2, items)).toBe(2);
    expect(pruneSelection(7, items)).toBeNull();
    expect(pruneSelection([1, 7, 3], items)).toEqual([1, 3]);
    expect(pruneSelection([1, 7], items)).toBe(1);
    expect(pruneSelection([6, 7], items)).toBeNull();
  });
});
