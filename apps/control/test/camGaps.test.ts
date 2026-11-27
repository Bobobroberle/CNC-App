import { IDENTITY, circle, rectangle, rotation, type Bounds, type Contour } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import { place, type CamItem } from '../src/lib/camItems';
import { EQUAL_GAP, gapsAround } from '../src/lib/camGaps';
import { snapTargets } from '../src/lib/camSnap';

const box = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({
  minX,
  minY,
  maxX,
  maxY,
});

/** The dragged box: 40 40 – 60 60 */
const BOX = box(40, 40, 60, 60);

const find = (gaps: ReturnType<typeof gapsAround>, side: string) =>
  gaps.find((g) => g.side === side);

describe('the gaps around a dragged box', () => {
  it('measures the room to the nearest neighbour on each side, in the middle of what they share', () => {
    const left = box(0, 30, 30, 70); // right edge at 30: 10 away; shares y 40–60
    const right = box(80, 45, 100, 100); // 20 away; shares y 45–60
    const up = box(45, 75, 55, 90); // 15 above; shares x 45–55
    const down = box(0, 0, 200, 25); // 15 below; shares x 40–60
    const gaps = gapsAround(BOX, [right, down, up, left]);
    // In the order left, right, up, down whatever order the boxes come in
    expect(gaps.map((g) => g.side)).toEqual(['left', 'right', 'up', 'down']);
    expect(find(gaps, 'left')).toMatchObject({
      gap: 10,
      from: { x: 40, y: 50 },
      to: { x: 30, y: 50 },
    });
    expect(find(gaps, 'right')).toMatchObject({
      gap: 20,
      from: { x: 60, y: 52.5 },
      to: { x: 80, y: 52.5 },
    });
    expect(find(gaps, 'up')).toMatchObject({
      gap: 15,
      from: { x: 50, y: 60 },
      to: { x: 50, y: 75 },
    });
    expect(find(gaps, 'down')).toMatchObject({
      gap: 15,
      from: { x: 50, y: 40 },
      to: { x: 50, y: 25 },
    });
  });

  it('shows only the sides that have a neighbour across from them', () => {
    expect(gapsAround(BOX, [])).toEqual([]);
    // A box that lies diagonally – no shared range on either axis – is nobody's neighbour
    expect(gapsAround(BOX, [box(70, 70, 90, 90), box(0, 0, 30, 30)])).toEqual([]);
    // One that shares only a corner point is none either
    expect(gapsAround(BOX, [box(60, 60, 80, 80)])).toEqual([]);
  });

  it('takes the nearest of several on a side', () => {
    const near = box(0, 40, 30, 60);
    const far = box(10, 40, 20, 60);
    expect(find(gapsAround(BOX, [far, near]), 'left')!.gap).toBe(10);
  });

  it('counts boxes that touch as a gap of 0', () => {
    const gaps = gapsAround(BOX, [box(60, 40, 80, 60)]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      side: 'right',
      gap: 0,
      from: { x: 60, y: 50 },
      to: { x: 60, y: 50 },
    });
    // A hair of float noise below 0 is still touching
    expect(gapsAround(BOX, [box(60 - 1e-12, 40, 80, 60)])[0]!.gap).toBe(0);
  });

  it('has no gap on any side to a box it overlaps', () => {
    expect(gapsAround(BOX, [box(50, 40, 80, 60)])).toEqual([]);
    expect(gapsAround(BOX, [box(45, 45, 55, 55)])).toEqual([]);
    expect(gapsAround(BOX, [box(30, 30, 70, 70)])).toEqual([]);
  });

  it('does not let a box that is across the line and overlapping hide a neighbour behind it', () => {
    // The overlapping one is no neighbour on the right; the one behind it is
    const gaps = gapsAround(BOX, [box(50, 40, 80, 60), box(100, 45, 120, 55)]);
    expect(gaps.map((g) => [g.side, g.gap])).toEqual([['right', 40]]);
  });

  it('marks the two gaps of an axis that are equal – and only those', () => {
    const left = box(0, 30, 30, 70);
    const equal = gapsAround(BOX, [left, box(70, 30, 100, 70)]);
    expect(equal.map((g) => [g.side, g.gap, g.equal])).toEqual([
      ['left', 10, true],
      ['right', 10, true],
    ]);
    // Up and down count together too
    const vertical = gapsAround(BOX, [box(40, 70, 60, 80), box(40, 20, 60, 30)]);
    expect(vertical.map((g) => g.equal)).toEqual([true, true]);
    // A left gap equal to an upper one is nothing to mark
    const crossed = gapsAround(BOX, [left, box(40, 70, 60, 80)]);
    expect(crossed.map((g) => g.equal)).toEqual([false, false]);
    // Different gaps, or only one side
    expect(gapsAround(BOX, [left, box(80, 30, 100, 70)]).map((g) => g.equal)).toEqual([
      false,
      false,
    ]);
    expect(gapsAround(BOX, [left]).map((g) => g.equal)).toEqual([false]);
  });

  it('calls two gaps equal when they differ by less than half the last digit that is shown', () => {
    expect(EQUAL_GAP).toBe(0.05);
    const left = box(0, 30, 30, 70);
    const within = gapsAround(BOX, [left, box(70.04, 30, 100, 70)]);
    expect(within.map((g) => g.equal)).toEqual([true, true]);
    const beyond = gapsAround(BOX, [left, box(70.06, 30, 100, 70)]);
    expect(beyond.map((g) => g.equal)).toEqual([false, false]);
  });

  it('measures a turned part by its box and a selection as the one box it is', () => {
    // The caller hands over boxes: a part turned 45° has the box of its turned outline
    const turned = box(-14.14, 40, 14.14, 60);
    expect(find(gapsAround(BOX, [turned]), 'left')!.gap).toBeCloseTo(25.86, 9);
    // Two parts selected make the box 40 40 – 90 60: the gap to the right is measured from its edge
    expect(find(gapsAround(box(40, 40, 90, 60), [box(100, 40, 120, 60)]), 'right')!.gap).toBe(10);
  });
});

describe('the gaps of a part among the parts of a drawing', () => {
  const make = (
    id: number,
    group: number,
    source: Contour[],
    more: Partial<CamItem> = {},
    placement = IDENTITY,
  ): CamItem => ({
    id,
    group,
    source,
    placement,
    contours: place(source, placement),
    kind: 'outside',
    tabs: false,
    relief: null,
    side: 'front',
    ...more,
  });

  it('count the visible parts of the others, not the selection, a hidden part or a registration hole', () => {
    // The dragged part is group 1 (0 0 – 20 20); on its right a hidden part, then a hole, then a plate
    const moved = make(1, 1, [rectangle(0, 0, 20, 20)]);
    const hidden = make(2, 2, [rectangle(30, 0, 10, 20)], { hidden: true });
    const hole = make(3, 3, [circle(45, 10, 6)], { registration: 1 });
    const plate = make(4, 4, [rectangle(60, 0, 20, 20)]);
    const others = snapTargets([moved, hidden, hole, plate], 1);
    expect(
      gapsAround({ minX: 0, minY: 0, maxX: 20, maxY: 20 }, others).map((g) => [g.side, g.gap]),
    ).toEqual([['right', 40]]);
    // The part of the selection that lies beside it is the moved box itself, never a neighbour
    const second = make(5, 5, [rectangle(30, 0, 10, 20)]);
    const both = snapTargets([moved, second, plate], [1, 5]);
    expect(
      gapsAround({ minX: 0, minY: 0, maxX: 40, maxY: 20 }, both).map((g) => [g.side, g.gap]),
    ).toEqual([['right', 20]]);
  });

  it('measure a turned part by the box of its turned outline', () => {
    // A 10 × 10 plate turned by 45° about its lower left corner reaches 7.07 to either side of x = 0 (and 14.14 up)
    const turned = make(1, 1, [rectangle(0, 0, 10, 10)], {}, rotation(45, { x: 0, y: 0 }));
    const others = snapTargets([turned], null);
    const r = Math.SQRT1_2 * 10;
    const [left] = gapsAround({ minX: 30, minY: 0, maxX: 40, maxY: 10 }, others);
    expect(left!.side).toBe('left');
    expect(left!.gap).toBeCloseTo(30 - r, 9);
  });
});
