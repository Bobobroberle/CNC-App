import { describe, expect, it } from 'vitest';
import {
  applyToPoint,
  compose,
  contourBounds,
  invert,
  magnifySketch,
  rotation,
  scaleSketch,
  scalingAbout,
  sketchBox,
  sketchContours,
  sketchSize,
  sketchKeepsProportions,
  tidySketch,
  translation,
  type Sketch,
} from '../src';

const box = (s: Sketch) => {
  const b = contourBounds(sketchContours(s).contours)!;
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Number(v.toFixed(3)));
};

describe('drawn things by their measures', () => {
  it('makes every shape around its own middle', () => {
    expect(box({ type: 'rect', w: 100, h: 60, r: 0 })).toEqual([-50, -30, 50, 30]);
    // Rounded corners: more points, the same box.
    const round = sketchContours({ type: 'rect', w: 100, h: 60, r: 10 }).contours[0]!;
    expect(round.points.length).toBeGreaterThan(8);
    expect(box({ type: 'rect', w: 100, h: 60, r: 10 })).toEqual([-50, -30, 50, 30]);
    const hole = sketchContours({ type: 'circle', d: 20 }).contours[0]!;
    expect(hole.circle).toEqual({ cx: 0, cy: 0, r: 10 });
    const long = box({ type: 'slot', l: 60, w: 10 });
    expect(long[2]).toBeCloseTo(30, 1);
    expect(long[3]).toBeCloseTo(5, 1);
    // The measures themselves are exact, whatever the polygon makes of an arc.
    expect(sketchBox({ type: 'slot', l: 60, w: 10 })).toEqual({
      minX: -30,
      minY: -5,
      maxX: 30,
      maxY: 5,
    });
    expect(sketchSize({ type: 'rect', w: 100, h: 60, r: 0 })).toEqual({ w: 100, h: 60 });
    expect(sketchSize({ type: 'circle', d: 20 })).toEqual({ w: 20, h: 20 });
    expect(sketchSize({ type: 'grid', d: 6, nx: 3, ny: 2, px: 30, py: 20 })).toEqual({
      w: 66,
      h: 26,
    });
    // 3 × 2 holes of 6 mm, 30 and 20 mm apart: centres at ±30/0 and ±10.
    const grid = sketchContours({ type: 'grid', d: 6, nx: 3, ny: 2, px: 30, py: 20 }).contours;
    expect(grid.map((c) => [c.circle!.cx, c.circle!.cy])).toEqual([
      [-30, -10],
      [0, -10],
      [30, -10],
      [-30, 10],
      [0, 10],
      [30, 10],
    ]);
  });

  it('sets a text from its anchor on the baseline and names what the font lacks', () => {
    const left: Sketch = {
      type: 'text',
      text: 'AB',
      height: 20,
      spacing: 0,
      lineSpacing: 1.6,
      align: 'left',
    };
    const [minX, minY, , maxY] = box(left);
    expect(minX).toBeGreaterThanOrEqual(0);
    expect(minY).toBeCloseTo(0, 1);
    expect(maxY).toBeCloseTo(20, 1);
    const centred = box({ ...left, align: 'center' });
    expect(centred[0]! + centred[2]!).toBeCloseTo(0, 0);
    expect(sketchContours({ ...left, text: 'A☺' }).missing).toEqual(['☺']);
    expect(sketchSize(left)).toBeNull();
    expect(sketchBox(left)).toBeNull();
  });

  it('keeps measures that can be drawn', () => {
    expect(tidySketch({ type: 'rect', w: -5, h: 10, r: 99 })).toEqual({
      type: 'rect',
      w: 0.5,
      h: 10,
      r: 0.25,
    });
    expect(tidySketch({ type: 'rect', w: NaN, h: 10, r: -1 })).toMatchObject({ w: 0.5, r: 0 });
    expect(tidySketch({ type: 'circle', d: 0 })).toEqual({ type: 'circle', d: 0.5 });
    // A long hole is never wider than long.
    expect(tidySketch({ type: 'slot', l: 10, w: 30 })).toEqual({ type: 'slot', l: 10, w: 10 });
    expect(tidySketch({ type: 'grid', d: 6, nx: 2.4, ny: 0, px: 0, py: 20 })).toEqual({
      type: 'grid',
      d: 6,
      nx: 2,
      ny: 1,
      px: 0.5,
      py: 20,
    });
    expect(tidySketch({ type: 'grid', d: 6, nx: 999, ny: 1, px: 10, py: 10 })).toMatchObject({
      nx: 50,
    });
    const text = {
      type: 'text',
      text: 'A',
      height: 0,
      spacing: NaN,
      lineSpacing: 0,
      align: 'left',
    };
    expect(tidySketch(text as Sketch)).toMatchObject({ height: 0.5, spacing: 0, lineSpacing: 0.1 });
  });

  it('changes the size along its own axes', () => {
    expect(scaleSketch({ type: 'rect', w: 100, h: 60, r: 5 }, 1.5, 0.5)).toEqual({
      type: 'rect',
      w: 150,
      h: 30,
      r: 5,
    });
    expect(scaleSketch({ type: 'circle', d: 20 }, 2, 7)).toEqual({ type: 'circle', d: 40 });
    expect(scaleSketch({ type: 'slot', l: 60, w: 10 }, 2, 1.5)).toEqual({
      type: 'slot',
      l: 120,
      w: 15,
    });
    // A grid 66 mm from rim to rim made 96 mm: the holes stay, the pitch grows to 45.
    const grid: Sketch = { type: 'grid', d: 6, nx: 3, ny: 1, px: 30, py: 20 };
    expect(scaleSketch(grid, 96 / 66, 3)).toMatchObject({ px: 45, py: 20, d: 6 });
    // The holes never run into each other.
    expect(scaleSketch(grid, 0.01, 1)).toMatchObject({ px: 6 });
    const text: Sketch = {
      type: 'text',
      text: 'A',
      height: 20,
      spacing: 0,
      lineSpacing: 1.6,
      align: 'left',
    };
    expect(scaleSketch(text, 0.5, 9)).toMatchObject({ height: 10 });
    expect(sketchKeepsProportions(text)).toBe(true);
    expect(sketchKeepsProportions({ type: 'circle', d: 1 })).toBe(true);
    expect(sketchKeepsProportions(grid)).toBe(false);
  });

  it('magnifies a sketch as a whole', () => {
    expect(magnifySketch({ type: 'rect', w: 100, h: 60, r: 5 }, 2)).toEqual({
      type: 'rect',
      w: 200,
      h: 120,
      r: 10,
    });
    expect(magnifySketch({ type: 'circle', d: 20 }, 0.5)).toEqual({ type: 'circle', d: 10 });
    expect(magnifySketch({ type: 'slot', l: 60, w: 10 }, 2)).toEqual({
      type: 'slot',
      l: 120,
      w: 20,
    });
    expect(magnifySketch({ type: 'grid', d: 6, nx: 3, ny: 2, px: 30, py: 20 }, 2)).toEqual({
      type: 'grid',
      d: 12,
      nx: 3,
      ny: 2,
      px: 60,
      py: 40,
    });
    const text: Sketch = {
      type: 'text',
      text: 'A',
      height: 20,
      spacing: 0.1,
      lineSpacing: 1.6,
      align: 'right',
    };
    expect(magnifySketch(text, 1.5)).toEqual({ ...text, height: 30 });
  });
});

describe('maps undone and scaling about a point', () => {
  it('inverts a map and refuses a flat one', () => {
    const m = compose(translation(30, -5), rotation(30, { x: 4, y: 9 }));
    const back = invert(m)!;
    const p = applyToPoint(back, applyToPoint(m, { x: 12.5, y: -3 }));
    expect(p.x).toBeCloseTo(12.5, 9);
    expect(p.y).toBeCloseTo(-3, 9);
    expect(invert({ a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 })).toBeNull();
  });

  it('scales and leaves one point where it is', () => {
    const m = scalingAbout(2, 3, { x: 10, y: 10 });
    expect(applyToPoint(m, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
    expect(applyToPoint(m, { x: 11, y: 12 })).toEqual({ x: 12, y: 16 });
  });
});
