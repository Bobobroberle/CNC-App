import { describe, expect, it } from 'vitest';
import {
  clampColor,
  colorCount,
  colorOf,
  colorsInUse,
  COLOR_IDS,
  COLOR_LIMITS,
  effective,
  isColorId,
  ownedDepth,
  pruneColors,
  tabDefaultsOf,
  tidyColors,
  withColorsOf,
  withColorValues,
  type ColorTable,
  type EffectiveItem,
} from '../src/lib/camGroups';
import { MAX_DEPTH } from '../src/lib/camProject';
import { TAB_LIMITS } from '../src/lib/camTabs';

/** The drawing: 6 mm deep, 1 mm engraved, climb, the 6 mm cutter T3, four tabs of 6 × 2 kept off the corners */
const drawing = {
  depth: 6,
  engraveDepth: 1,
  climb: true,
  toolId: 't3',
  tabs: { count: 4, width: 6, height: 2, avoidCorners: true },
};

/** Colour A sets everything it can – the numbers are hand-picked so that no two of them are alike */
const A = {
  depth: 3,
  engraveDepth: 0.5,
  climb: false,
  toolId: 'v1',
  tabs: { count: 2, width: 8 },
};
const table: ColorTable = { a: A };

const part = (own: Partial<EffectiveItem> = {}): EffectiveItem => ({ kind: 'outside', ...own });

describe('effective: part over colour over drawing, value by value', () => {
  it('without a colour every value is the drawing’s – the same Tabs object, nothing "from" the part or a colour', () => {
    for (const colors of [undefined, {}, table]) {
      const e = effective(part(), colors, drawing);
      expect(e).toMatchObject({
        depth: 6,
        inherited: 6,
        engraveDepth: 1,
        climb: true,
        toolId: 't3',
      });
      // identity, not equality: the drawing's tabs object itself (the table's cache and the byte-identity rest on it)
      expect(e.tabDefaults).toBe(drawing.tabs);
      expect(Object.values(e.from).every((s) => s === 'drawing')).toBe(true);
    }
  });

  it('an engraving takes the drawing’s engraving depth, everything else its depth', () => {
    expect(effective(part({ kind: 'on' }), undefined, drawing).depth).toBe(1);
    for (const kind of ['outside', 'inside', 'pocket', 'drill'] as const) {
      expect(effective(part({ kind }), undefined, drawing).depth, kind).toBe(6);
    }
  });

  it('the colour’s depth is for cuts and drills, its engraving depth for engravings – each from "color"', () => {
    const cut = effective(part({ color: 'a' }), table, drawing);
    expect(cut).toMatchObject({ depth: 3, inherited: 3 });
    expect(cut.from.depth).toBe('color');
    for (const kind of ['inside', 'pocket', 'drill'] as const) {
      expect(effective(part({ kind, color: 'a' }), table, drawing).depth, kind).toBe(3);
    }
    const engraved = effective(part({ kind: 'on', color: 'a' }), table, drawing);
    expect(engraved).toMatchObject({ depth: 0.5, inherited: 0.5 });
    expect(engraved.from.depth).toBe('color');
  });

  it('a colour that sets only one of the two depths leaves the other kind to the drawing', () => {
    const only: ColorTable = { b: { depth: 2 } };
    expect(effective(part({ kind: 'on', color: 'b' }), only, drawing)).toMatchObject({
      depth: 1,
      from: { depth: 'drawing' },
    });
    const engraving: ColorTable = { b: { engraveDepth: 0.2 } };
    expect(effective(part({ color: 'b' }), engraving, drawing)).toMatchObject({
      depth: 6,
      from: { depth: 'drawing' },
    });
  });

  it('the part’s own depth goes over its colour’s, and `inherited` is what it would have without it', () => {
    const own = effective(part({ color: 'a', depth: 9 }), table, drawing);
    expect(own.depth).toBe(9);
    expect(own.inherited).toBe(3);
    expect(own.from.depth).toBe('part');
    // (an engraving with its own depth, too)
    expect(effective(part({ kind: 'on', color: 'a', depth: 0.1 }), table, drawing)).toMatchObject({
      depth: 0.1,
      inherited: 0.5,
    });
  });

  it('the engraving depth of the colour is the colour’s whatever the kind – the part’s own depth does not change it', () => {
    expect(effective(part({ color: 'a', depth: 9 }), table, drawing).engraveDepth).toBe(0.5);
    expect(effective(part({ color: 'a' }), table, drawing).from.engraveDepth).toBe('color');
    expect(effective(part(), table, drawing).engraveDepth).toBe(1);
    expect(effective(part({ color: 'b' }), table, drawing).from.engraveDepth).toBe('drawing');
  });

  it('the direction: its own, its colour’s, the drawing’s', () => {
    expect(effective(part({ color: 'a' }), table, drawing)).toMatchObject({
      climb: false,
      from: { climb: 'color' },
    });
    // the part's own, even where it says what the drawing says
    expect(effective(part({ color: 'a', climb: true }), table, drawing)).toMatchObject({
      climb: true,
      from: { climb: 'part' },
    });
    expect(effective(part({ color: 'a' }), { a: { depth: 3 } }, drawing)).toMatchObject({
      climb: true,
      from: { climb: 'drawing' },
    });
    // a colour that says climb is as much a choice as one that says conventional
    expect(
      effective(part({ color: 'a' }), { a: { climb: true } }, { ...drawing, climb: false }),
    ).toMatchObject({ climb: true, from: { climb: 'color' } });
  });

  it('the cutter: its own, its colour’s, the drawing’s', () => {
    expect(effective(part({ color: 'a' }), table, drawing)).toMatchObject({
      toolId: 'v1',
      from: { toolId: 'color' },
    });
    expect(effective(part({ color: 'a', toolId: 'f2' }), table, drawing)).toMatchObject({
      toolId: 'f2',
      from: { toolId: 'part' },
    });
    expect(effective(part({ color: 'b' }), table, drawing)).toMatchObject({
      toolId: 't3',
      from: { toolId: 'drawing' },
    });
  });

  it('the tab defaults: the drawing’s with the colour’s count and width – avoidCorners and height stay the drawing’s', () => {
    const e = effective(part({ color: 'a' }), table, drawing);
    expect(e.tabDefaults).toEqual({ count: 2, width: 8, height: 2, avoidCorners: true });
    expect(e.from).toMatchObject({ count: 'color', width: 'color', height: 'drawing' });
    // the part's own spec is looked at value by value – it goes over the colour's, and `from` says so
    const spec = effective(
      part({ color: 'a', tabSpec: { mode: 'auto', count: 5 } }),
      table,
      drawing,
    );
    expect(spec.from).toMatchObject({ count: 'part', width: 'color', height: 'drawing' });
    // …but the defaults stay the colour's (the part's values are `tabValues`' to apply)
    expect(spec.tabDefaults).toEqual({ count: 2, width: 8, height: 2, avoidCorners: true });
    expect(tabDefaultsOf(part({ color: 'a' }), table, drawing.tabs)).toEqual(e.tabDefaults);
    expect(tabDefaultsOf(part(), table, drawing.tabs)).toBe(drawing.tabs);
  });

  it('a count of 0 is a value of the colour like any other (no tab by default for its parts)', () => {
    const none: ColorTable = { c: { tabs: { count: 0 } } };
    expect(effective(part({ color: 'c' }), none, drawing)).toMatchObject({
      tabDefaults: { count: 0, width: 6 },
      from: { count: 'color' },
    });
  });

  it('a registration hole has no colour: nothing of the table reaches it', () => {
    const hole = part({ kind: 'drill', color: 'a', registration: 1 });
    expect(colorOf(hole)).toBeUndefined();
    const e = effective(hole, table, drawing);
    expect(e).toMatchObject({ depth: 6, climb: true, toolId: 't3' });
    expect(e.tabDefaults).toBe(drawing.tabs);
    expect(ownedDepth(hole, table)).toBeUndefined();
    expect(colorsInUse([hole])).toEqual([]);
  });
});

describe('ownedDepth: the depth the part or its colour sets – none where the drawing’s is the one', () => {
  it('is the part’s own first, then the colour’s by the kind, else nothing', () => {
    expect(ownedDepth({ kind: 'outside', depth: 9, color: 'a' }, table)).toBe(9);
    expect(ownedDepth({ kind: 'outside', color: 'a' }, table)).toBe(3);
    expect(ownedDepth({ kind: 'on', color: 'a' }, table)).toBe(0.5);
    expect(ownedDepth({ kind: 'on', color: 'a' }, { a: { depth: 3 } })).toBeUndefined();
    expect(ownedDepth({ kind: 'outside' }, table)).toBeUndefined();
    expect(ownedDepth({ kind: 'outside', color: 'a' }, undefined)).toBeUndefined();
    expect(ownedDepth({ kind: 'outside', color: 'b' }, table)).toBeUndefined();
  });
});

describe('the table: tidy, changed, pruned', () => {
  it('the ids and the limits are what the reader and the fields use', () => {
    expect(COLOR_IDS).toEqual(['a', 'b', 'c', 'd']);
    expect(['a', 'd', 'e', '', 'A', 3, null].map(isColorId)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    // the depth is held to what the project file holds, the tabs to the tab panel's ranges
    expect(COLOR_LIMITS.depth.max).toBe(MAX_DEPTH);
    expect(COLOR_LIMITS.engraveDepth.max).toBe(MAX_DEPTH);
    expect(COLOR_LIMITS.count).toBe(TAB_LIMITS.count);
    expect(COLOR_LIMITS.width).toBe(TAB_LIMITS.width);
    expect(COLOR_LIMITS.height).toBe(TAB_LIMITS.height);
  });

  it('clamps a number into its range, the count into whole numbers – and takes what is no number away', () => {
    expect(clampColor('depth', 0)).toBe(0.01);
    expect(clampColor('depth', 9999)).toBe(500);
    expect(clampColor('depth', 3.25)).toBe(3.25);
    expect(clampColor('engraveDepth', -4)).toBe(0.01);
    expect(clampColor('count', 2.6)).toBe(3);
    expect(clampColor('count', -1)).toBe(0);
    expect(clampColor('count', 99)).toBe(50);
    expect(clampColor('width', 0.01)).toBe(0.1);
    expect(clampColor('height', 1e6)).toBe(500);
    expect(clampColor('depth', undefined)).toBeUndefined();
    expect(clampColor('depth', Number.NaN)).toBeUndefined();
    expect(clampColor('depth', Infinity)).toBeUndefined();
  });

  it('tidies: no entry that says nothing, no value that is not one – and no table of nothing', () => {
    expect(tidyColors(undefined)).toBeUndefined();
    expect(tidyColors({})).toBeUndefined();
    expect(tidyColors({ a: {} })).toBeUndefined();
    expect(tidyColors({ a: { tabs: {} } })).toBeUndefined();
    expect(tidyColors({ a: { toolId: '' } })).toBeUndefined();
    expect(tidyColors({ a: { depth: Number.NaN } })).toBeUndefined();
    expect(tidyColors({ b: { depth: 2, climb: undefined }, a: { climb: false } })).toEqual({
      a: { climb: false },
      b: { depth: 2 },
    });
    expect(tidyColors({ a: { tabs: { count: 0, width: Infinity, height: undefined } } })).toEqual({
      a: { tabs: { count: 0 } },
    });
    // (a value is kept as it is – ranges are for the setters and the reader)
    expect(tidyColors({ a: { depth: 0.001 } })).toEqual({ a: { depth: 0.001 } });
  });

  it('changes a value: clamped, removable with undefined, the table itself where nothing changes', () => {
    const one = withColorValues(undefined, 'a', { depth: 3 });
    expect(one).toEqual({ a: { depth: 3 } });
    // the same number again: the very same table (the caller sees nothing to do)
    expect(withColorValues(one, 'a', { depth: 3 })).toBe(one);
    expect(withColorValues(one, 'a', { engraveDepth: undefined })).toBe(one);
    expect(withColorValues(undefined, 'a', {})).toBeUndefined();
    // the number is brought into its range
    expect(withColorValues(one, 'a', { depth: 9999 })).toEqual({ a: { depth: 500 } });
    expect(withColorValues(one, 'a', { depth: -2 })).toEqual({ a: { depth: 0.01 } });
    // another value beside it, another colour beside the first
    expect(withColorValues(one, 'a', { climb: false })).toEqual({ a: { depth: 3, climb: false } });
    expect(withColorValues(one, 'd', { toolId: 'v1' })).toEqual({
      a: { depth: 3 },
      d: { toolId: 'v1' },
    });
    // taking the last value away leaves no entry – and no table
    expect(withColorValues(one, 'a', { depth: undefined })).toBeUndefined();
    expect(withColorValues(one, 'a', { depth: Number.NaN })).toBeUndefined();
  });

  it('changes the tabs value by value: the others stay, an emptied one goes, the count is whole', () => {
    let t = withColorValues(undefined, 'b', { tabs: { count: 2.4 } });
    expect(t).toEqual({ b: { tabs: { count: 2 } } });
    t = withColorValues(t, 'b', { tabs: { width: 7 } });
    expect(t).toEqual({ b: { tabs: { count: 2, width: 7 } } });
    expect(withColorValues(t, 'b', { tabs: { width: 7 } })).toBe(t);
    t = withColorValues(t, 'b', { tabs: { count: undefined } });
    expect(t).toEqual({ b: { tabs: { width: 7 } } });
    expect(withColorValues(t, 'b', { tabs: { width: undefined } })).toBeUndefined();
    // (a patch that touches no tab key changes nothing)
    expect(withColorValues(t, 'b', { tabs: {} })).toBe(t);
    // the other values of the colour survive a change of the tabs
    const both = withColorValues({ b: { depth: 2 } }, 'b', { tabs: { height: 1 } });
    expect(both).toEqual({ b: { depth: 2, tabs: { height: 1 } } });
  });

  it('a colour’s cutter is kept as an id; an empty id is none', () => {
    expect(withColorValues(undefined, 'c', { toolId: 'v1' })).toEqual({ c: { toolId: 'v1' } });
    expect(withColorValues({ c: { toolId: 'v1' } }, 'c', { toolId: '' })).toBeUndefined();
    expect(withColorValues({ c: { toolId: 'v1' } }, 'c', { toolId: undefined })).toBeUndefined();
  });

  it('counts the colours that parts carry, in the order A to D, and how many are hidden', () => {
    const parts = [
      { color: 'c' as const },
      { color: 'a' as const, hidden: true as const },
      { color: 'a' as const },
      {},
      { color: 'a' as const, registration: 2 as const },
    ];
    expect(colorsInUse(parts)).toEqual(['a', 'c']);
    expect(colorCount(parts, 'a')).toEqual({ parts: 2, hidden: 1 });
    expect(colorCount(parts, 'c')).toEqual({ parts: 1, hidden: 0 });
    expect(colorCount(parts, 'd')).toEqual({ parts: 0, hidden: 0 });
    expect(colorsInUse([])).toEqual([]);
  });

  it('prunes what no part carries – the table itself where nothing goes', () => {
    const full: ColorTable = { a: { depth: 3 }, b: { depth: 2 }, d: { climb: true } };
    expect(pruneColors(undefined, [{ color: 'a' }])).toBeUndefined();
    expect(pruneColors(full, [{ color: 'a' }, { color: 'b' }, { color: 'd' }])).toBe(full);
    expect(pruneColors(full, [{ color: 'a' }, { color: 'd' }])).toEqual({
      a: { depth: 3 },
      d: { climb: true },
    });
    expect(pruneColors(full, [{}, {}])).toBeUndefined();
    expect(pruneColors(full, [])).toBeUndefined();
    // a hole's colour counts for nothing; an entry that says nothing goes with it
    expect(pruneColors({ a: { depth: 3 } }, [{ color: 'a', registration: 1 }])).toBeUndefined();
    expect(pruneColors({ a: {} }, [{ color: 'a' }])).toBeUndefined();
  });
  it('takes over what a copy’s colours set only for the letters the table has no entry for', () => {
    const from: ColorTable = { a: { depth: 3 }, b: { depth: 2 }, c: { climb: true } };
    // the table has no A: it comes; B is the table's own and wins; C is carried by nothing that is pasted
    const table: ColorTable = { b: { depth: 9 } };
    const out = withColorsOf(table, from, [{ color: 'a' }, { color: 'b' }, {}]);
    expect(out).toEqual({ a: { depth: 3 }, b: { depth: 9 } });
    // …the very table where nothing is added, and none where the copy had none
    expect(withColorsOf(table, from, [{ color: 'b' }])).toBe(table);
    expect(withColorsOf(table, undefined, [{ color: 'a' }])).toBe(table);
    expect(withColorsOf(undefined, undefined, [{ color: 'a' }])).toBeUndefined();
    expect(withColorsOf(undefined, from, [{ color: 'c' }])).toEqual({ c: { climb: true } });
    // a colour on a registration hole counts for nothing
    expect(withColorsOf(undefined, from, [{ color: 'a', registration: 1 }])).toBeUndefined();
    // a letter the copy had no entry for brings none
    expect(withColorsOf(undefined, { b: { depth: 2 } }, [{ color: 'a' }])).toBeUndefined();
  });
});
