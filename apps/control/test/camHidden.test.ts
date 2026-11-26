import { IDENTITY, circle, rectangle, rotation, type Contour } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import { itemAt, place, type CamItem } from '../src/lib/camItems';
import { parseProject, projectToText } from '../src/lib/camProject';
import {
  addGroups,
  everything,
  groupsInRect,
  invertGroups,
  itemsInRect,
  pruneSelection,
  shownGroups,
} from '../src/lib/camSelect';
import { itemTabMarks, looseContours, tabsMissing } from '../src/lib/camTabs';
import { unitsOf } from '../src/lib/camArrange';

const make = (
  id: number,
  group: number,
  source: Contour[],
  extra: Partial<CamItem> = {},
  placement = IDENTITY,
): CamItem => ({
  id,
  group,
  source,
  placement,
  contours: place(source, placement),
  kind: extra.registration ? 'drill' : 'outside',
  tabs: false,
  relief: null,
  side: 'front',
  ...extra,
});

const box = (x: number, y = 0, w = 10, h = 10) => [rectangle(x, y, w, h)];

/**
 * Groups 1 (two parts: ids 1 and 2, the second one hidden), 2, 3 (hidden) and 4, and the two registration
 * holes in groups 8 and 9:
 *   1: 0 0 10 10 and (hidden) 20 0 30 10     2: 40 0 50 10     3 (hidden): 60 0 70 10     4: 80 0 90 10
 */
const items: CamItem[] = [
  make(1, 1, box(0)),
  make(2, 1, box(20), { hidden: true }),
  make(3, 2, box(40)),
  make(4, 3, box(60), { hidden: true }),
  make(5, 4, box(80)),
  make(6, 8, [circle(0, 20, 6)], { registration: 1 }),
  make(7, 9, [circle(5, 20, 6)], { registration: 2 }),
];

describe('what hiding leaves of the selection', () => {
  it('counts a group as shown while one of its parts is – only a wholly hidden group is out', () => {
    expect(shownGroups(items)).toEqual([1, 2, 4]);
    expect(shownGroups([])).toEqual([]);
  });

  it('keeps "everything" as it is while nothing is wholly hidden – a group with a hidden part is shown', () => {
    expect(everything([])).toBe('all');
    expect(everything(items.filter((i) => i.group !== 3))).toBe('all');
    expect(everything([make(1, 1, box(0)), make(2, 1, box(20), { hidden: true })])).toBe('all');
  });

  it('is the list of the groups in sight – with the registration holes – once a group is wholly hidden', () => {
    expect(everything(items)).toEqual([1, 2, 4, 8, 9]);
    // one group in sight (and a wholly hidden one beside it) and the two holes
    const one = [items[0]!, items[3]!, items[5]!, items[6]!];
    expect(everything(one)).toEqual([1, 8, 9]);
    // the holes alone are no drawing: nothing in sight is nothing
    expect(everything([make(4, 3, box(60), { hidden: true }), items[5]!, items[6]!])).toBeNull();
    expect(everything([make(4, 3, box(60), { hidden: true })])).toBeNull();
  });

  it('never keeps "everything" beside a wholly hidden group, and keeps it where all can be reached', () => {
    expect(pruneSelection('all', items)).toEqual([1, 2, 4, 8, 9]);
    expect(
      pruneSelection(
        'all',
        items.filter((i) => i.group !== 3),
      ),
    ).toBe('all');
    // a group ticked in the list stays selected, hidden or not
    expect(pruneSelection([2, 3], items)).toEqual([2, 3]);
    expect(pruneSelection(3, items)).toBe(3);
  });

  it('inverts to the groups in sight, never into a hidden one', () => {
    expect(invertGroups(2, items)).toEqual([1, 4]);
    expect(invertGroups([1, 4], items)).toBe(2);
    expect(invertGroups(null, items)).toEqual([1, 2, 4]);
    // a hidden group that was ticked is a selected thing: inverted away, and not brought back
    expect(invertGroups(3, items)).toEqual([1, 2, 4]);
    expect(invertGroups([1, 2, 4], items)).toBeNull();
  });

  it('takes found groups into a selection in the order of the list, and nothing changes nothing', () => {
    expect(addGroups(4, [1], items)).toEqual([1, 4]);
    expect(addGroups([2, 4], [1, 2], items)).toEqual([1, 2, 4]);
    expect(addGroups(null, [2], items)).toBe(2);
    expect(addGroups('all', [1], items)).toEqual([1, 2, 3, 4]);
    expect(addGroups(2, [], items)).toBe(2);
    expect(addGroups(8, [], items)).toBe(8);
    // a registration hole is never one of several: it goes when something joins it
    expect(addGroups(8, [1], items)).toBe(1);
  });

  it('is left out of aligning: the units of what is in sight, a group by its parts in sight', () => {
    const sight = items.filter((i) => !i.hidden);
    // group 1 is the part at 0…10 alone, the hidden one beside it does not widen it; group 3 is no unit
    expect(unitsOf(sight).map((u) => [u.group, u.box.minX, u.box.maxX])).toEqual([
      [1, 0, 10],
      [2, 40, 50],
      [4, 80, 90],
    ]);
    // the whole group, hidden part and all, is wider
    expect(unitsOf(items).find((u) => u.group === 1)!.box.maxX).toBe(30);
  });
});

describe('a finger and a hidden part', () => {
  it('finds a line, a text box and the inside of a shape – not of a hidden part', () => {
    const rect = make(1, 1, box(0, 0, 40, 40));
    const hiddenOne = make(2, 2, box(10, 10, 10, 10), { hidden: true });
    // the small hidden part lies inside the large one: the finger on its line finds the large part
    expect(itemAt([rect, hiddenOne], { x: 10, y: 15 }, 1)).toBe(rect);
    expect(itemAt([rect, hiddenOne], { x: 15, y: 15 }, 1)).toBe(rect);
    // taking hold needs a line: none is near, so nothing – the hidden outline does not count
    expect(itemAt([rect, hiddenOne], { x: 15, y: 15 }, 1, false)).toBeNull();
    // alone it cannot be found anywhere
    expect(itemAt([hiddenOne], { x: 10, y: 15 }, 1)).toBeNull();
    expect(itemAt([hiddenOne], { x: 15, y: 15 }, 1, false)).toBeNull();
    // shown again, it is found by its line
    expect(itemAt([rect, { ...hiddenOne, hidden: undefined }], { x: 10, y: 15 }, 1)).toMatchObject({
      id: 2,
    });
  });
});

describe('the tabs of a hidden part', () => {
  const tabbed = (extra: Partial<CamItem> = {}) =>
    make(1, 1, box(0, 0, 60, 40), { tabs: true, ...extra });
  const defaults = { count: 4, width: 6, height: 2 };

  it('are drawn only while the part is cut', () => {
    expect(itemTabMarks(tabbed(), defaults)).toHaveLength(4);
    expect(itemTabMarks(tabbed({ hidden: true }), defaults)).toEqual([]);
  });

  it('are never missing from a part that is not cut – hidden, it has nothing loose', () => {
    const none = { count: 0, width: 6, height: 2 };
    expect(looseContours(tabbed(), none)).toEqual([0]);
    expect(tabsMissing(tabbed(), none)).toBe(true);
    expect(looseContours(tabbed({ hidden: true }), none)).toEqual([]);
    expect(tabsMissing(tabbed({ hidden: true }), none)).toBe(false);
  });
});

describe('a rectangle on the table and the parts it takes', () => {
  const tool = (
    lines: readonly CamItem[],
    rect: [number, number, number, number],
    mode?: 'touch' | 'inside',
  ) =>
    itemsInRect(lines, { minX: rect[0], minY: rect[1], maxX: rect[2], maxY: rect[3] }, mode).map(
      (i) => i.id,
    );
  /** Parts in sight: 1 at 0…10, 3 at 40…50, 5 at 80…90 (all 0…10 high) */
  const sight = items.filter((i) => !i.hidden);

  it('takes what it touches – an edge counts – and what it holds whole in the other mode', () => {
    expect(tool(sight, [5, 5, 45, 8])).toEqual([1, 3]);
    // touching by an edge: x = 10 is the right edge of part 1
    expect(tool(sight, [10, 0, 20, 10])).toEqual([1]);
    // a hair beside it: nothing
    expect(tool(sight, [10.001, 0, 20, 10])).toEqual([]);
    // inside: only the whole ones
    expect(tool(sight, [5, -5, 55, 15], 'inside')).toEqual([3]);
    expect(tool(sight, [-1, -1, 51, 11], 'inside')).toEqual([1, 3]);
    // touching is the default
    expect(tool(sight, [5, 5, 45, 8], 'touch')).toEqual(tool(sight, [5, 5, 45, 8]));
  });

  it('does not mind which two corners it was drawn from', () => {
    expect(tool(sight, [45, 8, 5, 5])).toEqual([1, 3]);
    expect(tool(sight, [51, 11, -1, -1], 'inside')).toEqual([1, 3]);
  });

  it('never takes a hidden part or a registration hole', () => {
    // all around: the hidden parts (2 and 4) and the holes (6, 7, at y 14…26) are in it, none is taken
    expect(tool(items, [-50, -50, 150, 50])).toEqual([1, 3, 5]);
    expect(tool(items, [-50, 12, 150, 30])).toEqual([]);
    expect(tool(items, [-50, -50, 150, 50], 'inside')).toEqual([1, 3, 5]);
  });

  it('holds a circle to its true radius, not to the corners of its polygon', () => {
    const disc = make(1, 1, [circle(50, 50, 20)]);
    // the circle reaches x = 60 (radius 10); the polygon of a circle has points on it as well, but the
    // box is the circle's: a rectangle ending at 59.9 misses nothing it should touch
    expect(tool([disc], [59.9, 49, 70, 51])).toEqual([1]);
    expect(tool([disc], [60.1, 49, 70, 51])).toEqual([]);
    expect(tool([disc], [40, 40, 60, 60], 'inside')).toEqual([1]);
    expect(tool([disc], [40.1, 40, 60, 60], 'inside')).toEqual([]);
  });

  it('holds a turned part to its turned outline', () => {
    // a 100 × 10 bar turned by 90° about its first corner stands on x −10…0, y 0…100
    const turn = rotation(90, { x: 0, y: 0 });
    const bar = make(1, 1, box(0, 0, 100, 10), {}, turn);
    expect(tool([bar], [-5, 90, 5, 110])).toEqual([1]);
    // where the bar lay before it was turned, there is nothing now
    expect(tool([bar], [50, 0, 60, 10])).toEqual([]);
    expect(tool([bar], [1, 0, 60, 10])).toEqual([]);
  });

  it('takes a group by a part of it that the rectangle meets – not by the box of the group', () => {
    // group 1: a part at 0…10 and one at 20…30 (hidden above, in sight here), the gap between them is empty
    const pair = [make(1, 1, box(0)), make(2, 1, box(20)), make(3, 2, box(40))];
    expect(groupsInRect(pair, { minX: 12, minY: 0, maxX: 18, maxY: 10 })).toEqual([]);
    expect(groupsInRect(pair, { minX: 12, minY: 0, maxX: 22, maxY: 10 })).toEqual([1]);
    expect(groupsInRect(pair, { minX: 5, minY: 0, maxX: 45, maxY: 10 })).toEqual([1, 2]);
    // a hidden member does not make its group be taken
    const mixed = [make(1, 1, box(0)), make(2, 1, box(20), { hidden: true })];
    expect(groupsInRect(mixed, { minX: 15, minY: 0, maxX: 25, maxY: 10 })).toEqual([]);
    expect(groupsInRect(mixed, { minX: 5, minY: 0, maxX: 25, maxY: 10 })).toEqual([1]);
  });

  it('takes nothing from an empty drawing, and nothing that has no point', () => {
    expect(itemsInRect([], { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([]);
    expect(itemsInRect([make(1, 1, [])], { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toEqual([]);
  });
});

describe('the project file and the eye', () => {
  const base = (items: object[]) =>
    JSON.stringify({
      format: 'lowrider-cam-project',
      version: 1,
      savedAt: '2026-11-26T10:00:00.000Z',
      name: 'platte',
      twoSided: null,
      items,
      settings: {},
    });
  const entry = (extra: object = {}) => ({
    id: 1,
    group: 1,
    source: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        closed: true,
      },
    ],
    placement: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    kind: 'outside',
    tabs: false,
    relief: null,
    side: 'front',
    ...extra,
  });

  it('writes the key only for a hidden part, and reads it back', () => {
    const shown = make(1, 1, box(0));
    const hide = make(2, 2, box(20), { hidden: true });
    const project = {
      name: 'platte',
      items: [shown, hide],
      twoSided: null,
      skipped: {},
      notes: [],
    };
    const settings = {} as Parameters<typeof projectToText>[1];
    const file = JSON.parse(projectToText(project, settings, new Date(0)));
    expect('hidden' in file.items[0]).toBe(false);
    expect(file.items[1].hidden).toBe(true);
    expect(file.version).toBe(1);
    const read = parseProject(projectToText(project, settings, new Date(0)));
    if ('error' in read) throw new Error(read.error);
    expect(read.project.items.map((i) => i.hidden)).toEqual([undefined, true]);
    expect('hidden' in read.project.items[0]!).toBe(false);
  });

  it('opens an older file, with no key, as it was – and reads false as no key at all', () => {
    const old = parseProject(base([entry()]));
    if ('error' in old) throw new Error(old.error);
    expect('hidden' in old.project.items[0]!).toBe(false);
    const no = parseProject(base([entry({ hidden: false })]));
    if ('error' in no) throw new Error(no.error);
    expect('hidden' in no.project.items[0]!).toBe(false);
    const yes = parseProject(base([entry({ hidden: true })]));
    if ('error' in yes) throw new Error(yes.error);
    expect(yes.project.items[0]!.hidden).toBe(true);
  });

  it('refuses a key that is no boolean, and a hidden registration hole', () => {
    for (const bad of ['yes', 1, 0, null, {}, []]) {
      expect(parseProject(base([entry({ hidden: bad })]))).toEqual({ error: 'invalid-project' });
    }
    expect(parseProject(base([entry({ hidden: true, registration: 1, kind: 'drill' })]))).toEqual({
      error: 'invalid-project',
    });
    // not hidden, a hole is as before
    expect('error' in parseProject(base([entry({ registration: 1, kind: 'drill' })]))).toBe(false);
  });
});
