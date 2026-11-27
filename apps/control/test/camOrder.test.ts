import { circle, rectangle, toolpaths, type Contour, type CutSettings } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import type { CamItem } from '../src/lib/camItems';
import {
  CUT_KINDS,
  cutPlaces,
  hasOrder,
  isCutKind,
  MAX_SEQ,
  movedSeqs,
  rankOf,
  wishedPlace,
  type CutPlace,
} from '../src/lib/camOrder';

const item = (id: number, over: Partial<CamItem> = {}): CamItem => ({
  id,
  group: id,
  source: [],
  placement: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  contours: [],
  kind: 'drill',
  tabs: false,
  relief: null,
  side: 'front',
  ...over,
});

describe('the order the parts are cut in', () => {
  it('names the kinds in the order the library cuts them – checked against a program', () => {
    // one thing of each kind, put to the library in the reverse of the order it cuts them in
    const s: CutSettings = {
      toolDiameter: 2,
      depth: 1,
      stepdown: 1,
      stepover: 0.4,
      feed: 1000,
      plungeFeed: 300,
      rampAngle: 90,
      safeZ: 5,
      climb: true,
    };
    const contours: Contour[] = [
      rectangle(0, 0, 100, 100),
      rectangle(10, 10, 30, 30),
      rectangle(50, 50, 20, 20),
      rectangle(75, 75, 10, 10),
      circle(90, 20, 2),
    ];
    const kinds = ['outside', 'inside', 'on', 'pocket', 'drill'] as const;
    const path = toolpaths(
      contours,
      contours.map((_, i) => ({ contour: i, kind: kinds[i]! })),
      s,
    );
    expect(path.cuts.map((c) => kinds[c.op])).toEqual([...CUT_KINDS]);
    expect(CUT_KINDS.every(isCutKind)).toBe(true);
    expect(isCutKind('none')).toBe(false);
  });

  it('counts the parts of a kind among themselves, a part with several contours once', () => {
    const places = cutPlaces([
      { item: 7, kind: 'drill' },
      { item: 3, kind: 'outside' },
      { item: 9, kind: 'drill' },
      { item: 7, kind: 'drill' },
      { item: 5, kind: 'drill' },
      { item: 4, kind: 'none' },
      { item: 8, kind: 'pocket' },
    ]);
    expect(Object.fromEntries(places)).toEqual({
      7: { n: 1, of: 3, kind: 'drill' },
      9: { n: 2, of: 3, kind: 'drill' },
      5: { n: 3, of: 3, kind: 'drill' },
      3: { n: 1, of: 1, kind: 'outside' },
      8: { n: 1, of: 1, kind: 'pocket' },
    });
    expect(cutPlaces([]).size).toBe(0);
  });

  it('lists the rank of a part: its kind, its side, in the order cut – and only what is cut', () => {
    const items = [
      item(1),
      item(2),
      item(3, { side: 'back' }),
      item(4, { hidden: true }),
      item(5, { kind: 'pocket' }),
      item(6, { registration: 1 }),
      item(7),
    ];
    const places: Record<number, CutPlace> = {
      1: { n: 3, of: 3, kind: 'drill' },
      2: { n: 1, of: 3, kind: 'drill' },
      3: { n: 1, of: 1, kind: 'drill' },
      4: { n: 2, of: 3, kind: 'drill' },
      5: { n: 1, of: 1, kind: 'pocket' },
      6: { n: 1, of: 3, kind: 'drill' },
      // 7 is not cut: it has no place
    };
    expect(rankOf(items[0]!, items, places).map((i) => i.id)).toEqual([2, 1]);
    expect(rankOf(items[2]!, items, places).map((i) => i.id)).toEqual([3]);
    expect(rankOf(items[4]!, items, places).map((i) => i.id)).toEqual([5]);
  });

  it('moves a part one place and numbers the whole rank by place', () => {
    const rank = [item(10), item(11), item(12), item(13)];
    expect(movedSeqs(rank, 12, -1)).toEqual(
      new Map([
        [10, 0],
        [12, 1],
        [11, 2],
        [13, 3],
      ]),
    );
    expect(movedSeqs(rank, 11, 1)).toEqual(
      new Map([
        [10, 0],
        [12, 1],
        [11, 2],
        [13, 3],
      ]),
    );
    // the first cannot go earlier, the last not later, a stranger not at all
    expect(movedSeqs(rank, 10, -1)).toBeNull();
    expect(movedSeqs(rank, 13, 1)).toBeNull();
    expect(movedSeqs(rank, 99, 1)).toBeNull();
    expect(movedSeqs([], 1, 1)).toBeNull();
  });

  it('never numbers beyond what a project file may hold', () => {
    const rank = Array.from({ length: MAX_SEQ + 20 }, (_, i) => item(i + 1));
    const moved = movedSeqs(rank, MAX_SEQ + 19, -1)!;
    expect(Math.max(...moved.values())).toBe(MAX_SEQ);
    expect(moved.get(MAX_SEQ + 19)).toBe(MAX_SEQ);
  });

  it('says the place a number asks for – among the numbered parts of the rank, never the number as it stands', () => {
    // six holes numbered 0…5, then the one with the number 2 given back to the route: the numbers have a gap
    const items = [0, 1, undefined, 3, 4, 5].map((seq, i) =>
      item(i + 1, seq === undefined ? {} : { seq }),
    );
    const places: Record<number, CutPlace> = {
      1: { n: 1, of: 6, kind: 'drill' },
      2: { n: 2, of: 6, kind: 'drill' },
      3: { n: 6, of: 6, kind: 'drill' },
      4: { n: 3, of: 6, kind: 'drill' },
      5: { n: 4, of: 6, kind: 'drill' },
      6: { n: 5, of: 6, kind: 'drill' },
    };
    // the parts with the numbers 3, 4, 5 ask for places 3, 4, 5 – not 4, 5, 6 – and are cut there: nothing to say
    expect(items.map((i) => wishedPlace(i, items, places))).toEqual([1, 2, undefined, 3, 4, 5]);
    expect(items.map((i) => wishedPlace(i, items, places) === places[i.id]?.n)).toEqual([
      true,
      true,
      false,
      true,
      true,
      true,
    ]);
    // numbers that are shared ask for the same place: whichever the route puts second is not where it asked
    const tie = [item(1, { seq: 0 }), item(2, { seq: 0 }), item(3, { seq: 1 })];
    expect(tie.map((i) => wishedPlace(i, tie, {}))).toEqual([1, 1, 1]);
    const cut: Record<number, CutPlace> = {
      1: { n: 1, of: 3, kind: 'drill' },
      2: { n: 2, of: 3, kind: 'drill' },
      3: { n: 3, of: 3, kind: 'drill' },
    };
    expect(tie.map((i) => wishedPlace(i, tie, cut))).toEqual([1, 1, 3]);
  });

  it('counts only what is cut the same way: not another kind or side, not a hidden part, not one that is not cut', () => {
    const here = item(1, { seq: 5 });
    const items = [
      here,
      item(2, { seq: 0 }),
      item(3, { seq: 1, kind: 'pocket' }),
      item(4, { seq: 2, side: 'back' }),
      item(5, { seq: 3, hidden: true }),
      item(6, { seq: 4 }),
      item(7, { seq: 4, registration: 1 }),
    ];
    const places: Record<number, CutPlace> = {
      1: { n: 3, of: 3, kind: 'drill' },
      2: { n: 1, of: 3, kind: 'drill' },
      6: { n: 2, of: 3, kind: 'drill' },
    };
    // only parts 2 and 6 come before it – and when part 6 is not cut (no place), it is no part of the rank
    expect(wishedPlace(here, items, places)).toBe(3);
    delete places[6];
    expect(wishedPlace(here, items, places)).toBe(2);
    // a part without a number asks for nothing
    expect(wishedPlace(item(9), items, places)).toBeUndefined();
  });

  it('knows whether any part has a number', () => {
    expect(hasOrder([item(1), item(2)])).toBe(false);
    expect(hasOrder([item(1), item(2, { seq: 0 })])).toBe(true);
  });
});
