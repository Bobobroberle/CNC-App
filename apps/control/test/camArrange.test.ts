import {
  IDENTITY,
  circle,
  rectangle,
  rotation,
  sketchContours,
  translation,
  type Contour,
  type Matrix,
} from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import {
  alignDeltas,
  distributeDeltas,
  movesAnything,
  unitsOf,
  type Edge,
  type Shifts,
  type Unit,
} from '../src/lib/camArrange';
import { itemsBounds, place, type CamItem } from '../src/lib/camItems';

const make = (
  id: number,
  group: number,
  source: Contour[],
  placement: Matrix = IDENTITY,
  more: Partial<CamItem> = {},
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

const unit = (group: number, minX: number, minY: number, maxX: number, maxY: number): Unit => ({
  group,
  box: { minX, minY, maxX, maxY },
});
const shift = (s: Shifts, group: number) => s.get(group);
const deltas = (s: Shifts) => [...s].map(([g, d]) => [g, d.dx, d.dy]);

/**
 * Three parts side by side, boxes by hand (x from, y from, x to, y to):
 *   1: 0 0 10 10     2: 30 20 50 30     3: 100 5 130 45
 * together 0 0 130 45, middle lines x 65 and y 22.5.
 */
const THREE = [unit(1, 0, 0, 10, 10), unit(2, 30, 20, 50, 30), unit(3, 100, 5, 130, 45)];

describe('aligning the units of a selection', () => {
  it('puts every unit on the selection’s own edge or middle line – the one furthest out stays', () => {
    const at = (edge: Edge) => deltas(alignDeltas(THREE, edge));
    expect(at('left')).toEqual([
      [1, 0, 0],
      [2, -30, 0],
      [3, -100, 0],
    ]);
    expect(at('right')).toEqual([
      [1, 120, 0],
      [2, 80, 0],
      [3, 0, 0],
    ]);
    // middle line x = 65: centres 5, 40, 115
    expect(at('centre')).toEqual([
      [1, 60, 0],
      [2, 25, 0],
      [3, -50, 0],
    ]);
    expect(at('bottom')).toEqual([
      [1, 0, 0],
      [2, 0, -20],
      [3, 0, -5],
    ]);
    expect(at('top')).toEqual([
      [1, 0, 35],
      [2, 0, 15],
      [3, 0, 0],
    ]);
    // middle line y = 22.5: centres 5, 25, 25
    expect(at('middle')).toEqual([
      [1, 0, 17.5],
      [2, 0, -2.5],
      [3, 0, -2.5],
    ]);
  });

  it('has nothing to align with fewer than two units, and gives no negative zero', () => {
    expect(alignDeltas([], 'left').size).toBe(0);
    expect(alignDeltas([THREE[0]!], 'centre').size).toBe(0);
    const s = alignDeltas([unit(1, 0, 0, 10, 10), unit(2, 0, 20, 10, 30)], 'left');
    // already in place: a shift of exactly nothing
    expect(Object.is(shift(s, 1)!.dx, 0)).toBe(true);
    expect(Object.is(shift(s, 2)!.dx, 0)).toBe(true);
    expect(movesAnything(s)).toBe(false);
    expect(movesAnything(alignDeltas(THREE, 'left'))).toBe(true);
    expect(movesAnything(new Map())).toBe(false);
  });
});

describe('distributing the units of a selection', () => {
  it('gives equal gaps between the boxes, the outermost two staying', () => {
    // widths 10 + 20 + 30 = 60 in a span of 130: gaps of 35. The middle unit starts at 10 + 35 = 45.
    const s = distributeDeltas(THREE, 'h', 'gaps');
    expect(deltas(s)).toEqual([
      [1, 0, 0],
      [2, 15, 0],
      [3, 0, 0],
    ]);
  });

  it('gives equal distances between the middles', () => {
    // centres 5 and 115: the middle one belongs at 60, it is at 40
    const s = distributeDeltas(THREE, 'h', 'centres');
    expect(deltas(s)).toEqual([
      [1, 0, 0],
      [2, 20, 0],
      [3, 0, 0],
    ]);
  });

  it('works along y the same way: bottom to top, only dy', () => {
    const column = [
      unit(1, 0, 0, 10, 10),
      unit(2, 5, 12, 15, 32),
      unit(3, 0, 70, 10, 100),
      unit(4, 3, 40, 9, 46),
    ];
    // sorted by middle: 1 (5), 2 (22), 4 (43), 3 (85). Heights 10 + 20 + 6 + 30 = 66 in a span of 100: gaps of 34/3.
    const gaps = distributeDeltas(column, 'v', 'gaps');
    expect(shift(gaps, 1)).toEqual({ dx: 0, dy: 0 });
    expect(shift(gaps, 3)).toEqual({ dx: 0, dy: 0 });
    expect(shift(gaps, 2)!.dx).toBe(0);
    expect(shift(gaps, 2)!.dy).toBeCloseTo(10 + 34 / 3 - 12, 9);
    expect(shift(gaps, 4)!.dy).toBeCloseTo(10 + 34 / 3 + 20 + 34 / 3 - 40, 9);
    // centres 5 and 85 of the outer two, 26⅔ apart: 31⅔ and 58⅓ for the others, 22 and 43 now
    const centres = distributeDeltas(column, 'v', 'centres');
    expect(shift(centres, 2)!.dy).toBeCloseTo(5 + 80 / 3 - 22, 9);
    expect(shift(centres, 4)!.dy).toBeCloseTo(5 + 160 / 3 - 43, 9);
    expect(shift(centres, 2)!.dx).toBe(0);
  });

  it('orders by position, whatever order the list is in, and by the list where the middles tie', () => {
    const shuffled = [THREE[2]!, THREE[0]!, THREE[1]!];
    expect(shift(distributeDeltas(shuffled, 'h', 'gaps'), 2)).toEqual({ dx: 15, dy: 0 });
    // 2 and 3 have the same middle in y (25): the list says 2 comes first, so 3 is the last and stays,
    // 2 is in the middle – at 15, halfway between the middles 5 and 25, so it moves down by 10
    const tied = distributeDeltas(THREE, 'v', 'centres');
    expect(shift(tied, 1)).toEqual({ dx: 0, dy: 0 });
    expect(shift(tied, 3)).toEqual({ dx: 0, dy: 0 });
    expect(shift(tied, 2)).toEqual({ dx: 0, dy: -10 });
    // the other way round the list, the other one is in the middle and moves
    const swapped = distributeDeltas([THREE[0]!, THREE[2]!, THREE[1]!], 'v', 'centres');
    expect(shift(swapped, 2)).toEqual({ dx: 0, dy: 0 });
    expect(shift(swapped, 3)).toEqual({ dx: 0, dy: -10 });
    // and the answer is listed in the order the units were given
    expect([...swapped.keys()]).toEqual([1, 3, 2]);
  });

  it('keeps units that already stand evenly where they are, and lets boxes overlap with a negative gap', () => {
    const even = [unit(1, 0, 0, 10, 10), unit(2, 20, 0, 30, 10), unit(3, 40, 0, 50, 10)];
    expect(movesAnything(distributeDeltas(even, 'h', 'gaps'))).toBe(false);
    expect(movesAnything(distributeDeltas(even, 'h', 'centres'))).toBe(false);
    // overlapping boxes: widths 20 + 20 + 20 in a span of 50 – the gap is −5, equal between all
    const crowded = [unit(1, 0, 0, 20, 5), unit(2, 14, 0, 34, 5), unit(3, 30, 0, 50, 5)];
    expect(shift(distributeDeltas(crowded, 'h', 'gaps'), 2)).toEqual({ dx: 1, dy: 0 });
  });

  it('needs three units', () => {
    expect(distributeDeltas([], 'h', 'gaps').size).toBe(0);
    expect(distributeDeltas(THREE.slice(0, 2), 'v', 'centres').size).toBe(0);
  });
});

describe('the units of a drawing', () => {
  it('measures a turned part by its turned outline', () => {
    // 40 × 20 turned a quarter about the origin: x from −20 to 0, y from 0 to 40
    const turned = make(1, 1, [rectangle(0, 0, 40, 20)], rotation(90, { x: 0, y: 0 }));
    const [u] = unitsOf([turned]);
    expect(u!.box.minX).toBeCloseTo(-20, 9);
    expect(u!.box.maxX).toBeCloseTo(0, 9);
    expect(u!.box.minY).toBeCloseTo(0, 9);
    expect(u!.box.maxY).toBeCloseTo(40, 9);
    // 20 × 20 turned 45° about its middle: as wide as its diagonal
    const diamond = make(2, 2, [rectangle(0, 0, 20, 20)], rotation(45, { x: 10, y: 10 }));
    const [d] = unitsOf([diamond]);
    expect(d!.box.maxX - d!.box.minX).toBeCloseTo(20 * Math.SQRT2, 9);
    expect(d!.box.minX).toBeCloseTo(10 - 10 * Math.SQRT2, 9);
  });

  it('measures a circle by its true radius, a text by its strokes and a group as one unit', () => {
    const round = make(1, 1, [circle(50, 50, 20)]);
    expect(unitsOf([round])[0]!.box).toEqual({ minX: 40, minY: 40, maxX: 60, maxY: 60 });
    const words = sketchContours({
      type: 'text',
      text: 'Hi',
      height: 10,
      spacing: 0,
      lineSpacing: 1.6,
      align: 'left',
    }).contours;
    const text = make(2, 2, words, translation(100, 0), { text: 'Hi', kind: 'on' });
    expect(unitsOf([text])[0]!.box).toEqual(itemsBounds([text]));
    // two contours that came in together are one unit: the box around both
    const a = make(3, 3, [rectangle(0, 0, 10, 10)]);
    const b = make(4, 3, [rectangle(30, 5, 10, 10)]);
    const units = unitsOf([a, round, b]);
    expect(units.map((u) => u.group)).toEqual([3, 1]);
    expect(units[0]!.box).toEqual({ minX: 0, minY: 0, maxX: 40, maxY: 15 });
  });

  it('leaves out the registration holes, and a thing without a single point', () => {
    const part = make(1, 1, [rectangle(0, 0, 10, 10)]);
    const hole = make(2, 2, [circle(30, 5, 6)], IDENTITY, { registration: 1, kind: 'drill' });
    const empty = make(3, 3, []);
    expect(unitsOf([part, hole, empty]).map((u) => u.group)).toEqual([1]);
    expect(unitsOf([hole])).toEqual([]);
  });

  it('aligns a mixed set: a turned part, a circle, a text and a group, to the left and by the middle', () => {
    const turned = make(1, 1, [rectangle(0, 0, 40, 20)], rotation(90, { x: 0, y: 0 }));
    const round = make(2, 2, [circle(50, 50, 20)]);
    const group = [
      make(3, 3, [rectangle(100, 0, 10, 10)]),
      make(4, 3, [rectangle(130, 20, 10, 10)]),
    ];
    const units = unitsOf([turned, round, ...group]);
    // boxes: turned −20…0 × 0…40, circle 40…60 × 40…60, group 100…140 × 0…30
    const left = alignDeltas(units, 'left');
    expect(shift(left, 1)!.dx).toBeCloseTo(0, 9);
    expect(shift(left, 2)!.dx).toBeCloseTo(-60, 9);
    expect(shift(left, 3)!.dx).toBeCloseTo(-120, 9);
    // all in y between 0 and 60: the middle line is 30
    const middle = alignDeltas(units, 'middle');
    expect(shift(middle, 1)!.dy).toBeCloseTo(30 - 20, 9);
    expect(shift(middle, 2)!.dy).toBeCloseTo(30 - 50, 9);
    expect(shift(middle, 3)!.dy).toBeCloseTo(30 - 15, 9);
  });
});
