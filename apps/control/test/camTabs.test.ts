import { circle, rectangle, type Contour, type Sketch, type Tabs } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import { IDENTITY } from '@lowrider/cam';
import type { CamItem, TabSpec } from '../src/lib/camItems';
import {
  carryTabs,
  clampTab,
  itemHasTabs,
  itemTabMarks,
  itemTabs,
  looseContours,
  placeNear,
  pruneTabs,
  samePlace,
  tabNear,
  TAB_LIMITS,
  tabsMissing,
  tabsOn,
  tabValues,
  takesTabs,
  tidySpec,
} from '../src/lib/camTabs';
import { MAX_DEPTH } from '../src/lib/camProject';

const defaults: Tabs = { count: 4, width: 8, height: 2 };
const plate = rectangle(0, 0, 100, 50);

/** A thing of the drawing with what the tabs look at; the rest is as it comes. */
function thing(over: Partial<CamItem> = {}, contours: Contour[] = [plate]): CamItem {
  return {
    id: 1,
    group: 1,
    source: contours,
    placement: IDENTITY,
    contours,
    kind: 'outside',
    tabs: true,
    relief: null,
    side: 'front',
    ...over,
  };
}
const manual = (at: { c: number; u: number }[], rest: Partial<TabSpec> = {}): TabSpec => ({
  mode: 'manual',
  at,
  ...rest,
});

describe('the ranges of a tab', () => {
  it('are the ones the project file reads, and a typed value is brought into them', () => {
    expect(TAB_LIMITS.height.max).toBe(MAX_DEPTH);
    expect(clampTab('count', 2.6)).toBe(3);
    expect(clampTab('count', 99)).toBe(50);
    expect(clampTab('count', -3)).toBe(0);
    expect(clampTab('width', 0)).toBe(0.1);
    expect(clampTab('width', 1000)).toBe(100);
    expect(clampTab('width', 7.25)).toBe(7.25);
    expect(clampTab('height', 9999)).toBe(500);
    expect(clampTab('height', 0.01)).toBe(0.1);
  });

  it('only outside and inside cuts take tabs, and only with the box on', () => {
    expect(['outside', 'inside'].every((k) => takesTabs(k as never))).toBe(true);
    expect(['on', 'pocket', 'drill', 'none'].some((k) => takesTabs(k as never))).toBe(false);
    expect(tabsOn(thing())).toBe(true);
    expect(tabsOn(thing({ tabs: false }))).toBe(false);
    expect(tabsOn(thing({ kind: 'pocket' }))).toBe(false);
  });
});

describe('the tabs a part has', () => {
  it('are the drawing’s defaults until the part has values of its own', () => {
    expect(itemTabs(thing(), 0, defaults)).toBe(defaults);
    expect(tabValues(thing(), defaults)).toEqual({
      mode: 'auto',
      count: 4,
      width: 8,
      height: 2,
      avoidCorners: false,
    });
    // Own values override one by one; what is not set stays the default.
    const own = thing({ tabSpec: { mode: 'auto', count: 2, width: 5 } });
    expect(itemTabs(own, 0, defaults)).toEqual({ count: 2, width: 5, height: 2 });
    expect(itemTabs(own, 7, defaults)).toEqual({ count: 2, width: 5, height: 2 });
  });

  it('are by hand only at the places put on each contour, whatever the count says', () => {
    const item = thing(
      {
        tabSpec: manual(
          [
            { c: 0, u: 0.5 },
            { c: 1, u: 0.2 },
            { c: 0, u: 0.1 },
          ],
          { count: 9, height: 3 },
        ),
      },
      [plate, plate],
    );
    expect(itemTabs(item, 0, defaults)).toEqual({ count: 2, width: 8, height: 3, at: [0.5, 0.1] });
    expect(itemTabs(item, 1, defaults)).toEqual({ count: 1, width: 8, height: 3, at: [0.2] });
    expect(itemTabs(item, 2, defaults)).toEqual({ count: 0, width: 8, height: 3, at: [] });
  });

  it('are none for a cut that has none, and for a box that is off', () => {
    expect(itemTabs(thing({ tabs: false }), 0, defaults)).toBeUndefined();
    expect(itemTabs(thing({ kind: 'pocket' }), 0, defaults)).toBeUndefined();
    expect(itemTabs(thing({ kind: 'drill', tabSpec: manual([]) }), 0, defaults)).toBeUndefined();
  });

  it('hold the part only where a tab is cut', () => {
    expect(itemHasTabs(thing(), defaults)).toBe(true);
    expect(itemHasTabs(thing(), { ...defaults, count: 0 })).toBe(false);
    expect(itemHasTabs(thing({ tabSpec: { mode: 'auto', count: 0 } }), defaults)).toBe(false);
    expect(
      itemHasTabs(thing({ tabSpec: { mode: 'auto', count: 3 } }), { ...defaults, count: 0 }),
    ).toBe(true);
    expect(itemHasTabs(thing({ tabSpec: manual([]) }), defaults)).toBe(false);
    expect(itemHasTabs(thing({ tabSpec: manual([{ c: 0, u: 0.3 }]) }), defaults)).toBe(true);
    // A place on a contour the part no longer has holds nothing.
    expect(itemHasTabs(thing({ tabSpec: manual([{ c: 3, u: 0.3 }]) }), defaults)).toBe(false);
    expect(itemHasTabs(thing({ tabs: false }), defaults)).toBe(false);
    expect(itemHasTabs(thing({ kind: 'pocket' }), defaults)).toBe(false);
  });

  it('hold a part of several contours only where every closed one has a tab', () => {
    const three = [plate, plate, plate];
    const some = thing(
      {
        tabSpec: manual([
          { c: 0, u: 0.3 },
          { c: 1, u: 0.3 },
        ]),
      },
      three,
    );
    // The third is cut free without one – the part is not held, and the third is the one that is said
    expect(looseContours(some, defaults)).toEqual([2]);
    expect(itemHasTabs(some, defaults)).toBe(false);
    expect(tabsMissing(some, defaults)).toBe(true);
    const all = thing(
      {
        tabSpec: manual([
          { c: 0, u: 0.3 },
          { c: 1, u: 0.3 },
          { c: 2, u: 0.9 },
        ]),
      },
      three,
    );
    expect(looseContours(all, defaults)).toEqual([]);
    expect(itemHasTabs(all, defaults)).toBe(true);
    // No place at all: every one is loose; places on a contour that is no more hold nothing
    expect(looseContours(thing({ tabSpec: manual([]) }, three), defaults)).toEqual([0, 1, 2]);
    expect(looseContours(thing({ tabSpec: manual([{ c: 7, u: 0.3 }]) }, three), defaults)).toEqual([
      0, 1, 2,
    ]);
    // Spread by count: all or none
    expect(looseContours(thing({}, three), defaults)).toEqual([]);
    expect(looseContours(thing({ tabSpec: { mode: 'auto', count: 0 } }, three), defaults)).toEqual([
      0, 1, 2,
    ]);
    // An open line is not cut free: it needs no tab; and without the box on nothing is loose
    const line: Contour = { closed: false, points: plate.points };
    const lines = thing({ tabSpec: manual([{ c: 0, u: 0.3 }]) }, [plate, line]);
    expect(looseContours(lines, defaults)).toEqual([]);
    expect(looseContours(thing({ tabs: false, tabSpec: manual([]) }, three), defaults)).toEqual([]);
  });

  it('are missing where they are on and none is cut – the warning of the panel', () => {
    expect(tabsMissing(thing(), defaults)).toBe(false);
    expect(tabsMissing(thing({ tabSpec: manual([]) }), defaults)).toBe(true);
    expect(tabsMissing(thing({ tabSpec: { mode: 'auto', count: 0 } }), defaults)).toBe(true);
    expect(tabsMissing(thing({ tabs: false, tabSpec: manual([]) }), defaults)).toBe(false);
  });
});

describe('a spec that says nothing the defaults would not', () => {
  it('is no spec; what is no number goes, and so do the places of an automatic one', () => {
    expect(tidySpec({ mode: 'auto' })).toBeUndefined();
    expect(tidySpec({ mode: 'auto', width: Number.NaN, count: Infinity })).toBeUndefined();
    expect(tidySpec({ mode: 'auto', count: 3 })).toEqual({ mode: 'auto', count: 3 });
    expect(tidySpec({ mode: 'auto', height: 3, at: [{ c: 0, u: 0.5 }] })).toEqual({
      mode: 'auto',
      height: 3,
    });
    expect(tidySpec({ mode: 'auto', width: 4, height: 1 })).toEqual({
      mode: 'auto',
      width: 4,
      height: 1,
    });
    // By hand is a spec of its own, even with no place yet
    expect(tidySpec({ mode: 'manual' })).toEqual({ mode: 'manual', at: [] });
    expect(tidySpec(manual([{ c: 0, u: 0.5 }], { width: 3 }))).toEqual(
      manual([{ c: 0, u: 0.5 }], { width: 3 }),
    );
  });

  it('loses the places of contours the part no longer has – and nothing else', () => {
    const plain = thing();
    expect(pruneTabs(plain)).toBe(plain);
    const auto = thing({ tabSpec: { mode: 'auto', count: 2 } });
    expect(pruneTabs(auto)).toBe(auto);
    const fine = thing({ tabSpec: manual([{ c: 0, u: 0.5 }]) });
    expect(pruneTabs(fine)).toBe(fine);
    const cut = thing({
      tabSpec: manual([
        { c: 0, u: 0.5 },
        { c: 1, u: 0.2 },
        { c: 0, u: 0.9 },
      ]),
    });
    expect(pruneTabs(cut).tabSpec).toEqual(
      manual([
        { c: 0, u: 0.5 },
        { c: 0, u: 0.9 },
      ]),
    );
    expect(cut.tabSpec!.at).toHaveLength(3);
  });

  it('loses a place that stands where another one does – the later one, on the same contour only', () => {
    const doubled = thing(
      {
        tabSpec: manual([
          { c: 0, u: 0.5 },
          { c: 1, u: 0.5 },
          { c: 0, u: 0.5 + 1e-10 },
          { c: 0, u: 1.5 },
          { c: 0, u: 0.6 },
          { c: 1, u: 0.5 },
        ]),
      },
      [plate, plate],
    );
    expect(pruneTabs(doubled).tabSpec!.at).toEqual([
      { c: 0, u: 0.5 },
      { c: 1, u: 0.5 },
      { c: 0, u: 0.6 },
    ]);
    expect(doubled.tabSpec!.at).toHaveLength(6);
  });

  it('takes places for one when they lie together, the way the library does', () => {
    expect(samePlace(0.1, 0.1 + 1e-10)).toBe(true);
    expect(samePlace(0, 1 - 1e-10)).toBe(true);
    expect(samePlace(1.5, 0.5)).toBe(true);
    expect(samePlace(0.1, 0.2)).toBe(false);
  });
});

describe('the tabs as the table draws them', () => {
  it('are bars of their true width along the line, at the places the toolpath is cut with', () => {
    // 100 × 50 is 300 round: 75 along the lower side, and 225 along – 75 from the right end of the upper.
    const item = thing({
      tabSpec: manual(
        [
          { c: 0, u: 0.75 },
          { c: 0, u: 0.25 },
        ],
        { width: 8 },
      ),
    });
    const marks = itemTabMarks(item, defaults, 6);
    expect(marks.map((m) => [m.item, m.c, m.u, m.x, m.y, m.w, m.index])).toEqual([
      [1, 0, 0.25, 75, 0, 8, 1],
      [1, 0, 0.75, 25, 50, 8, 0],
    ]);
    expect(marks[0]!.span).toEqual([
      { x: 71, y: 0 },
      { x: 79, y: 0 },
    ]);
    // Across the line at both ends: up from the lower side, down from the upper (it runs the other way).
    expect(marks[0]!.ends).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 1 },
    ]);
    expect(marks[1]!.span).toEqual([
      { x: 29, y: 50 },
      { x: 21, y: 50 },
    ]);
    expect(marks[1]!.ends).toEqual([
      { x: 0, y: -1 },
      { x: 0, y: -1 },
    ]);
  });

  it('are spread evenly where the part is automatic, and have no place in a list then', () => {
    const marks = itemTabMarks(thing(), defaults, 6);
    expect(marks.map((m) => [m.u, m.x, m.y, m.index])).toEqual([
      [0.125, 37.5, 0, -1],
      [0.375, 100, 12.5, -1],
      [0.625, 62.5, 50, -1],
      [0.875, 0, 37.5, -1],
    ]);
    expect(itemTabMarks(thing({ tabs: false }), defaults, 6)).toEqual([]);
    expect(itemTabMarks(thing({ tabSpec: manual([]) }), defaults, 6)).toEqual([]);
  });

  it('follow the line round a corner, each end across its own side', () => {
    const square = rectangle(0, 0, 100, 100);
    // The corner 100/0 lies 100 along the 400: a tab of 6 covers 3 mm to either side of it.
    const item = thing({ tabSpec: manual([{ c: 0, u: 0.25 }], { width: 6 }) }, [square]);
    const [mark] = itemTabMarks(item, defaults, 6);
    expect(mark!.span).toEqual([
      { x: 97, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 3 },
    ]);
    expect(mark!.ends).toEqual([
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ]);
  });

  it('are drawn once for a part and its defaults – what a finger moves is one part, not all', () => {
    const item = thing();
    const marks = itemTabMarks(item, defaults, 6);
    expect(itemTabMarks(item, { ...defaults }, 6)).toBe(marks);
    // Other defaults or another part: made anew
    expect(itemTabMarks(item, { ...defaults, count: 2 }, 6)).not.toBe(marks);
    expect(itemTabMarks(item, { ...defaults, width: 3 }, 6)[0]!.w).toBe(3);
    expect(itemTabMarks(item, { ...defaults, height: 1 }, 6)).toHaveLength(4);
    expect(itemTabMarks({ ...item }, defaults, 6)).not.toBe(marks);
  });

  it('take the way the line runs where a bar has no length', () => {
    const [mark] = itemTabMarks(thing(), { count: 1, width: 0, height: 2 }, 6);
    expect(mark!.span).toEqual([
      { x: 100, y: 50 },
      { x: 100, y: 50 },
    ]);
    // A single tab sits in the middle of the line: the corner 100/50, where the upper side begins.
    expect(mark!.ends).toEqual([
      { x: 0, y: -1 },
      { x: 0, y: -1 },
    ]);
  });
});

describe('what a finger finds', () => {
  it('takes the nearest tab of the part within reach, no other part’s', () => {
    const item = thing({
      tabSpec: manual([
        { c: 0, u: 0.25 },
        { c: 0, u: 0.75 },
      ]),
    });
    const marks = [
      ...itemTabMarks(item, defaults, 6),
      ...itemTabMarks(thing({ id: 2 }), defaults, 6),
    ];
    expect(tabNear(marks, 1, { x: 78, y: 3 }, 5)?.u).toBe(0.25);
    expect(tabNear(marks, 1, { x: 26, y: 49 }, 5)?.u).toBe(0.75);
    expect(tabNear(marks, 1, { x: 50, y: 25 }, 5)).toBeNull();
    // Nearer to a tab of another part (37.5/0) – but that one is not this part's
    expect(tabNear(marks, 1, { x: 40, y: 0 }, 5)).toBeNull();
    expect(tabNear(marks, 2, { x: 40, y: 0 }, 5)?.u).toBe(0.125);
  });

  it('puts a tab at the nearest place of a line within reach, and none beside it', () => {
    const item = thing({}, [plate, rectangle(200, 0, 40, 40)]);
    const near = placeNear(item, { x: 30, y: -2 }, 5)!;
    expect([near.c, Math.round(near.u * 1e6) / 1e6, near.point]).toEqual([0, 0.1, { x: 30, y: 0 }]);
    // On the second contour
    expect(placeNear(item, { x: 202, y: 20 }, 5)).toMatchObject({ c: 1, point: { x: 200, y: 20 } });
    // Between the two, inside the plate: out of reach of every line
    expect(placeNear(item, { x: 50, y: 25 }, 5)).toBeNull();
    // An open line takes none
    const open = thing({}, [{ closed: false, points: [...plate.points] }]);
    expect(placeNear(open, { x: 30, y: 0 }, 5)).toBeNull();
  });
});

describe('the places by hand when the measures of a shape change', () => {
  const box = (w: number, h: number, r = 0) => {
    const sketch: Sketch = { type: 'rect', w, h, r };
    const contours = [rectangle(0, 0, w, h, r)];
    return thing({ sketch, source: contours, contours, tabSpec: manual([]) }, contours);
  };
  const withPlaces = (item: CamItem, at: { c: number; u: number }[]): CamItem => ({
    ...item,
    tabSpec: manual(at),
  });
  const pointOf = (item: CamItem, p: { c: number; u: number }) =>
    itemTabMarks({ ...item, tabSpec: manual([p]) }, defaults, 6)[0]!;

  it('go to the same share of the box: the middle of a side stays the middle of that side', () => {
    // 100 × 50: the middle of the lower side is 50 along (1/6 of 300), the middle of the right one at 125
    const before = withPlaces(box(100, 50), [
      { c: 0, u: 50 / 300 },
      { c: 0, u: 125 / 300 },
    ]);
    // 200 × 50 is 500 round: 100 along the lower side, 200 + 25 along
    const after = carryTabs(before, box(200, 50));
    expect(after.tabSpec!.at![0]!.u).toBeCloseTo(100 / 500, 12);
    expect(after.tabSpec!.at![1]!.u).toBeCloseTo(225 / 500, 12);
    expect(pointOf(after, after.tabSpec!.at![0]!)).toMatchObject({
      x: expect.closeTo(100, 9),
      y: 0,
    });
    // the rest of the thing is the new one's
    expect(after.sketch).toEqual({ type: 'rect', w: 200, h: 50, r: 0 });
    // Round corners: the line starts on the lower right arc, the tab on a side stays on its side
    const round = carryTabs(before, box(100, 50, 10));
    const mark = pointOf(round, round.tabSpec!.at![0]!);
    expect(mark.x).toBeCloseTo(50, 9);
    expect(mark.y).toBeCloseTo(0, 9);
  });

  it('stay as they are where nothing changed, to the last digit', () => {
    const before = withPlaces(box(100, 50), [{ c: 0, u: 0.123456789012 }]);
    expect(carryTabs(before, box(100, 50)).tabSpec!.at).toEqual([{ c: 0, u: 0.123456789012 }]);
    // a plain item without places, or an automatic one, is returned as it is
    const after = box(30, 30);
    expect(carryTabs(thing(), after)).toBe(after);
    expect(carryTabs(box(100, 50), after)).toBe(after);
    const auto = { ...box(100, 50), tabSpec: { mode: 'auto' as const, count: 3 } };
    expect(carryTabs(auto, after)).toBe(after);
  });

  it('follow a hole of a grid to its cell, and let go of the ones that are gone', () => {
    const grid = (nx: number, ny: number): CamItem => {
      const sketch: Sketch = { type: 'grid', d: 5, nx, ny, px: 30, py: 20 };
      const contours = Array.from({ length: nx * ny }, (_, k) =>
        circle((k % nx) * 30, Math.floor(k / nx) * 20, 5),
      );
      return thing({ sketch, source: contours, contours }, contours);
    };
    const before = withPlaces(grid(2, 3), [
      { c: 1, u: 0.25 },
      { c: 2, u: 0.5 },
      { c: 5, u: 0.75 },
    ]);
    // 3 × 2: cell (1, 0) is 1, (0, 1) is 3 now, and row 2 is no more
    const after = carryTabs(before, grid(3, 2));
    expect(after.tabSpec!.at!.map((p) => p.c)).toEqual([1, 3]);
    // each on the same side of its hole, a hole's own box being what counts (a quarter and a half round)
    expect(after.tabSpec!.at![0]!.u).toBeCloseTo(0.25, 9);
    expect(after.tabSpec!.at![1]!.u).toBeCloseTo(0.5, 9);
    // wider than a column is: nothing to carry to
    expect(carryTabs(before, grid(1, 3)).tabSpec!.at!.map((p) => p.c)).toEqual([1]);
  });

  it('drop what cannot be carried: no contour to go to, an open or empty line, two on one place', () => {
    const before = withPlaces(box(100, 50), [
      { c: 0, u: 0.2 },
      { c: 3, u: 0.2 },
    ]);
    // a place on a contour the thing has not
    expect(carryTabs(before, box(100, 50)).tabSpec!.at).toEqual([{ c: 0, u: 0.2 }]);
    // another number of contours with no grid to say which is which: none
    const two = thing({ source: [plate, plate], contours: [plate, plate] }, [plate, plate]);
    expect(carryTabs(before, two).tabSpec!.at).toEqual([]);
    // a line that is open now, or has no points, or no length
    const open: Contour = { closed: false, points: plate.points };
    const flat: Contour = { closed: true, points: [{ x: 1, y: 1 }] };
    const bare: Contour = { closed: true, points: [] };
    for (const now of [open, flat, bare]) {
      const was = box(100, 50);
      const to = { ...was, source: [now], contours: [now] };
      expect(carryTabs(withPlaces(was, [{ c: 0, u: 0.2 }]), to).tabSpec!.at).toEqual(
        now === flat ? [{ c: 0, u: 0 }] : [],
      );
    }
    // and one that was open or had no length
    const was = thing({ source: [flat], contours: [flat] }, [flat]);
    expect(carryTabs(withPlaces(was, [{ c: 0, u: 0.2 }]), box(100, 50)).tabSpec!.at).toEqual([]);
    // two places that come to one are one
    const narrow = {
      ...box(100, 50),
      source: [rectangle(0, 0, 100, 0)],
      contours: [rectangle(0, 0, 100, 0)],
    };
    const squeezed = carryTabs(
      withPlaces(box(100, 50), [
        { c: 0, u: 50 / 300 },
        { c: 0, u: 50 / 300 + 1e-12 },
      ]),
      narrow,
    );
    expect(squeezed.tabSpec!.at).toHaveLength(1);
  });
});
