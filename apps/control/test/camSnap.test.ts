import {
  IDENTITY,
  circle,
  rectangle,
  rotation,
  type Bounds,
  type Contour,
  type Matrix,
} from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import { contoursBox, itemsBounds, place, type CamItem } from '../src/lib/camItems';
import { snapMove, snapTargets, SNAP_PX } from '../src/lib/camSnap';

const box = (minX: number, minY: number, maxX: number, maxY: number): Bounds => ({
  minX,
  minY,
  maxX,
  maxY,
});

/** What moves, from where it lies: 0 0 – 10 10. A neighbour P (30 0 – 50 20) and another one Q (70 40 – 90 60). */
const BOX = box(0, 0, 10, 10);
const P = box(30, 0, 50, 20);
const Q = box(70, 40, 90, 60);

describe('snapping a box to the lines of the others', () => {
  it('has a threshold in screen pixels, and nothing but the finger’s move where nothing is near', () => {
    expect(SNAP_PX).toBe(8);
    const r = snapMove(BOX, { dx: 3.3, dy: 4.4 }, [], null, 5, 0);
    expect(r).toEqual({ dx: 3.3, dy: 4.4, x: false, y: false, guides: [] });
    // Neighbours that are too far away change nothing either
    expect(snapMove(BOX, { dx: 12, dy: 30 }, [P, Q], null, 5, 0).guides).toEqual([]);
  });

  it('keeps the grid exactly as it was: the lower left corner on a multiple of the step', () => {
    // The old rule, word for word: round((corner + move) / step) · step − corner
    const old = (corner: number, move: number, step: number) =>
      Math.round((corner + move) / step) * step - corner;
    for (const [minX, dx, step] of [
      [0, 3.3, 1],
      [2.5, 3.3, 1],
      [-7.3, 11.77, 0.5],
      [41.123, -9.4, 0.1],
      [0.1, 0.2, 0.1],
    ] as const) {
      const r = snapMove(
        box(minX, minX + 1, minX + 5, minX + 7),
        { dx, dy: dx },
        [],
        null,
        0,
        step,
      );
      expect(r.dx).toBe(old(minX, dx, step));
      expect(r.dy).toBe(old(minX + 1, dx, step));
    }
    // The same with a neighbour far away
    const far = snapMove(box(2.5, 0, 12.5, 10), { dx: 3.3, dy: 4.4 }, [Q], null, 2, 1);
    expect(far.dx).toBe(Math.round(5.8) - 2.5);
    expect(far.dy).toBe(4);
  });

  it('snaps the left edge to the left edge of a neighbour and draws a guide from one to the other', () => {
    // 4 mm away from P's left edge (30); y is far from every line
    const r = snapMove(BOX, { dx: 26, dy: 30 }, [P, Q], null, 5, 0);
    expect(r).toMatchObject({ dx: 30, dy: 30, x: true, y: false });
    // The moved box then stands at 30 40 x 30 40; the guide runs from P's foot (0) to the box's top (40)
    expect(r.guides).toEqual([{ axis: 'x', at: 30, from: 0, to: 40 }]);
  });

  it('snaps the middle to the middle and the right edge to the right edge', () => {
    // Middle: the box's middle is 5 from its edge; P's middle is 40
    const mid = snapMove(BOX, { dx: 34.2, dy: 30 }, [P], null, 5, 0);
    expect(mid).toMatchObject({ dx: 35, x: true });
    expect(mid.guides).toEqual([{ axis: 'x', at: 40, from: 0, to: 40 }]);
    // Right: 38 puts the right edge at 48, P's is at 50
    const right = snapMove(BOX, { dx: 38, dy: 30 }, [P], null, 5, 0);
    expect(right).toMatchObject({ dx: 40, x: true });
    expect(right.guides).toEqual([{ axis: 'x', at: 50, from: 0, to: 40 }]);
  });

  it('snaps top, middle and bottom the same way', () => {
    // Bottom to P's bottom (0): 1 above it
    expect(snapMove(BOX, { dx: 120, dy: 1 }, [P], null, 5, 0)).toMatchObject({ dy: 0, y: true });
    // Top to P's top (20): the box's top is at 10 + 18.5
    expect(snapMove(BOX, { dx: 120, dy: 8.5 }, [P], null, 5, 0)).toMatchObject({ dy: 10 });
    // Middle to P's middle (10): the box's middle is at 5 + 4.2
    const mid = snapMove(BOX, { dx: 120, dy: 4.2 }, [P], null, 5, 0);
    expect(mid).toMatchObject({ dy: 5, y: true, x: false });
    expect(mid.guides).toEqual([{ axis: 'y', at: 10, from: 30, to: 130 }]);
  });

  it('snaps x to one neighbour and y to another, each axis on its own', () => {
    // x to P's left edge (30), y to Q's bottom (40: 1.5 away)
    const r = snapMove(BOX, { dx: 26, dy: 38.5 }, [P, Q], null, 5, 0);
    expect(r).toMatchObject({ dx: 30, dy: 40, x: true, y: true });
    expect(r.guides).toEqual([
      { axis: 'x', at: 30, from: 0, to: 50 },
      { axis: 'y', at: 40, from: 30, to: 90 },
    ]);
  });

  it('takes the nearest line when several are in reach, and the first of the targets on a tie', () => {
    const R = box(33, 70, 43, 80);
    // The box's left edge is at 31: P's line (30) is 1 away, R's (33) 2
    expect(snapMove(BOX, { dx: 31, dy: 200 }, [P, R], null, 5, 0).dx).toBe(30);
    expect(snapMove(BOX, { dx: 32, dy: 200 }, [P, R], null, 5, 0).dx).toBe(33);
    // 1.5 from each: the one that comes first in the list
    expect(snapMove(BOX, { dx: 31.5, dy: 200 }, [P, R], null, 5, 0).dx).toBe(30);
    expect(snapMove(BOX, { dx: 31.5, dy: 200 }, [R, P], null, 5, 0).dx).toBe(33);
    // An edge comes before a middle at the same distance: the left edge is 2.5 from P's (30), the middle
    // 2.5 from P's (40 – the box's own middle is 5 from its edge, so a move of 35)
    expect(snapMove(BOX, { dx: 32.5, dy: 200 }, [P], null, 5, 0).dx).toBe(30);
  });

  it('draws one guide for the neighbours that share a line, spanning all of them', () => {
    const S = box(30, 100, 45, 120); // the same left line as P
    const r = snapMove(BOX, { dx: 27, dy: 60 }, [P, S], null, 5, 0);
    expect(r.dx).toBe(30);
    expect(r.guides).toEqual([{ axis: 'x', at: 30, from: 0, to: 120 }]);
    // A neighbour as wide as the box meets all three lines at once: left 30, right 40, middle 35
    const both = snapMove(BOX, { dx: 31, dy: 60 }, [box(30, 0, 40, 20)], null, 5, 0);
    expect(both.guides).toEqual([
      { axis: 'x', at: 30, from: 0, to: 70 },
      { axis: 'x', at: 40, from: 0, to: 70 },
      { axis: 'x', at: 35, from: 0, to: 70 },
    ]);
  });

  it('lets a line exactly at the threshold snap and one a hair beyond it not', () => {
    expect(snapMove(BOX, { dx: 26, dy: 30 }, [P], null, 4, 0)).toMatchObject({ dx: 30, x: true });
    const out = snapMove(BOX, { dx: 25.99, dy: 30 }, [P], null, 4, 0);
    expect(out).toMatchObject({ dx: 25.99, x: false });
  });

  it('snaps to the stock – its edges and its middle – and to nothing when none was entered', () => {
    const stock = box(0, 0, 200, 100);
    expect(snapMove(BOX, { dx: -3, dy: 52 }, [], stock, 5, 0)).toMatchObject({ dx: 0, dy: 52 });
    // Right edge to the stock's (200): 190 puts the box's right edge there
    expect(snapMove(BOX, { dx: 192, dy: 52 }, [], stock, 5, 0)).toMatchObject({ dx: 190 });
    // Middle of the stock (100 across, 50 up)
    const mid = snapMove(BOX, { dx: 96, dy: 46 }, [], stock, 5, 0);
    expect(mid).toMatchObject({ dx: 95, dy: 45, x: true, y: true });
    expect(mid.guides).toEqual([
      { axis: 'x', at: 100, from: 0, to: 100 },
      { axis: 'y', at: 50, from: 0, to: 200 },
    ]);
    // Not entered: the move is the finger's
    expect(snapMove(BOX, { dx: -3, dy: 52 }, [], null, 5, 0)).toMatchObject({ dx: -3, dy: 52 });
  });

  it('snaps a whole selection as one box, however wide', () => {
    // Two parts selected: their box is 0 0 – 60 30; its right edge goes to the stock's right edge
    const stock = box(0, 0, 100, 100);
    const r = snapMove(box(0, 0, 60, 30), { dx: 37, dy: 60 }, [], stock, 5, 0);
    expect(r).toMatchObject({ dx: 40, x: true });
  });

  it('keeps a box that is aligned already aligned – and shows the guide', () => {
    const r = snapMove(box(30, 30, 40, 40), { dx: 0, dy: 0 }, [P], null, 5, 0);
    expect(r).toMatchObject({ dx: 0, x: true });
    expect(r.guides).toEqual([{ axis: 'x', at: 30, from: 0, to: 40 }]);
  });

  it('rounds the corner of the grid box, while the lines that snap are the box’s own', () => {
    // What is seen lies at 0 0 – 10 10; the whole of it (a hidden member moves along) reaches out to −52. The grid
    // is the whole one's: (−52 + 3.4) / 5 → −10 · 5 + 52 = 2 – the seen box's own corner would have said 5
    const whole = box(-52, 0, 10, 10);
    expect(snapMove(BOX, { dx: 3.4, dy: 0 }, [], null, 0, 5, whole).dx).toBe(2);
    expect(snapMove(BOX, { dx: 3.4, dy: 0 }, [], null, 0, 5).dx).toBe(5);
    // The lines that snap are the seen box's: its left edge (0) goes to P's (30) at dx 30 – the whole box's left
    // edge (−52) would have needed dx 82, and its middle (−21) is a line of nothing
    const r = snapMove(BOX, { dx: 29, dy: 0 }, [P], null, 2, 5, whole);
    // (y: the bottoms of both lie on 0 already)
    expect(r).toMatchObject({ dx: 30, x: true, y: true });
    expect(r.guides).toEqual([
      { axis: 'x', at: 30, from: 0, to: 20 },
      { axis: 'y', at: 0, from: 30, to: 50 },
    ]);
  });

  it('lets an object win over the grid on its axis, and the grid work on the other', () => {
    const above = box(30, 100, 50, 120);
    // x snaps to 30 – not to the grid's 26 – while y has nothing near and falls to the grid
    const r = snapMove(BOX, { dx: 26.4, dy: 4.4 }, [above], null, 5, 1);
    expect(r).toMatchObject({ dx: 30, dy: 4, x: true, y: false });
  });

  it('works in negative coordinates', () => {
    const left = box(-50, -40, -30, -5);
    // The right edge of the box (−10) goes to −30: dx −18 puts it at −28, 2 away. y has nothing within 4.
    const r = snapMove(box(-20, -20, -10, -10), { dx: -18, dy: 0 }, [left], null, 4, 0);
    expect(r).toMatchObject({ dx: -20, dy: 0, x: true, y: false });
    expect(r.guides).toEqual([{ axis: 'x', at: -30, from: -40, to: -5 }]);
  });

  it('is no object snap with a threshold of 0 or less, and ignores boxes that are not numbers', () => {
    expect(snapMove(BOX, { dx: 26, dy: 30 }, [P], null, 0, 0).x).toBe(false);
    expect(snapMove(BOX, { dx: 26, dy: 30 }, [P], null, -3, 0).x).toBe(false);
    const broken = box(NaN, 0, 5, 5);
    expect(snapMove(BOX, { dx: 26, dy: 30 }, [broken], null, 5, 0).x).toBe(false);
    expect(snapMove(broken, { dx: 26, dy: 30 }, [P], null, 5, 0).x).toBe(false);
  });
});

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

describe('what a moved selection may snap to', () => {
  const a = make(1, 1, [rectangle(0, 0, 40, 20)]);
  const b = make(2, 2, [rectangle(100, 40, 30, 30)]);
  const c = make(3, 3, [rectangle(60, 100, 50, 10)]);

  it('is the box of every other group, in the order of the list', () => {
    expect(snapTargets([a, b, c], 1)).toEqual([box(100, 40, 130, 70), box(60, 100, 110, 110)]);
    expect(snapTargets([a, b, c], null)).toHaveLength(3);
  });

  it('leaves out every member of the selection – one group, several, or everything', () => {
    expect(snapTargets([a, b, c], [1, 3])).toEqual([box(100, 40, 130, 70)]);
    expect(snapTargets([a, b, c], 'all')).toEqual([]);
  });

  it('takes a group as one box around its parts', () => {
    const second = make(4, 2, [rectangle(100, 0, 20, 10)]);
    expect(snapTargets([a, b, second], 1)).toEqual([box(100, 0, 130, 70)]);
  });

  it('leaves out hidden parts – and only the hidden part of a group – and registration holes', () => {
    const hidden = make(5, 5, [rectangle(0, 200, 10, 10)], IDENTITY, { hidden: true });
    const half = make(6, 2, [rectangle(100, 300, 10, 10)], IDENTITY, { hidden: true });
    const hole = make(7, 7, [circle(5, 5, 4)], IDENTITY, { registration: 1 });
    expect(snapTargets([a, b, hidden, half, hole], 1)).toEqual([box(100, 40, 130, 70)]);
    expect(snapTargets([hidden, hole], null)).toEqual([]);
  });

  it('takes a circle by its true radius and a turned part by its turned outline', () => {
    const round = make(8, 8, [circle(100, 50, 20)]);
    // The polygon of the circle may lie inside its true size: the box is 90 40 – 110 60
    expect(snapTargets([round], null)).toEqual([box(90, 40, 110, 60)]);
    expect(contoursBox(round.contours)).toEqual(box(90, 40, 110, 60));
    // 10 × 10 plate turned by 45° about its lower left corner: the box is as wide as the diagonal
    const turned = make(9, 9, [rectangle(0, 0, 10, 10)], rotation(45, { x: 0, y: 0 }));
    const [t] = snapTargets([turned], null);
    const r = Math.SQRT1_2 * 10;
    expect(t!.minX).toBeCloseTo(-r, 9);
    expect(t!.maxX).toBeCloseTo(r, 9);
    expect(t!.minY).toBeCloseTo(0, 9);
    expect(t!.maxY).toBeCloseTo(2 * r, 9);
    expect(t).toEqual(itemsBounds([turned]));
  });

  it('snaps a part to the true edge of a circle', () => {
    const [target] = snapTargets([make(8, 8, [circle(100, 50, 20)])], null);
    // The box's right edge to the circle's right edge (110): the box is 10 wide, so it moves to 100
    const r = snapMove(box(0, 0, 10, 10), { dx: 98, dy: 0 }, [target!], null, 5, 0);
    expect(r.dx).toBe(100);
  });
});
