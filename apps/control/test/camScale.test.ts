import { magnifySketch, type AnySketch } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import { holdFactor, magnified, magnifyRange, scaledShape } from '../src/lib/camScale';

/**
 * The factors a curved shape can be magnified by with every measure staying in its range: radii from 0.25 to
 * 2500 mm. The smallest radius gives the lowest factor (0.25 ÷ it), the largest the highest (2500 ÷ it).
 */
describe('the range of a shape to magnify', () => {
  it('is worked out from the smallest and the largest radius of each shape', () => {
    // star: inner 12, outer 30 → 0.25 / 12 and 2500 / 30
    expect(magnifyRange({ type: 'star', points: 5, outer: 30, inner: 12 })).toEqual({
      min: 0.25 / 12,
      max: 2500 / 30,
    });
    // gear: root 24, outer 30
    expect(magnifyRange({ type: 'gear', teeth: 16, outer: 30, root: 24 })).toEqual({
      min: 0.25 / 24,
      max: 2500 / 30,
    });
    // ellipse: 20 and 50 – the smaller radius decides below, the larger above, whichever axis it is on
    expect(magnifyRange({ type: 'ellipse', rx: 20, ry: 50 })).toEqual({
      min: 0.25 / 20,
      max: 2500 / 50,
    });
    expect(magnifyRange({ type: 'ellipse', rx: 50, ry: 20 })).toEqual({
      min: 0.25 / 20,
      max: 2500 / 50,
    });
    // spiral: the larger end carries it, the other may be 0
    expect(magnifyRange({ type: 'spiral', turns: 3, start: 0, end: 40 })).toEqual({
      min: 0.25 / 40,
      max: 2500 / 40,
    });
    expect(magnifyRange({ type: 'spiral', turns: 3, start: 40, end: 8 })).toEqual({
      min: 0.25 / 40,
      max: 2500 / 40,
    });
  });

  it('always holds 1 – a shape as it is drawn is within its own range', () => {
    for (const s of [
      { type: 'star', points: 5, outer: 2500, inner: 2500 },
      { type: 'star', points: 5, outer: 0.25, inner: 0.25 },
      { type: 'gear', teeth: 8, outer: 2500, root: 0.25 },
      { type: 'ellipse', rx: 0.25, ry: 2500 },
      { type: 'spiral', turns: 1, start: 2500, end: 0 },
    ] as AnySketch[]) {
      const range = magnifyRange(s)!;
      expect(range.min).toBeLessThanOrEqual(1);
      expect(range.max).toBeGreaterThanOrEqual(1);
    }
  });

  it('judges what is drawn, not what was typed beyond a range', () => {
    // inner 99 on an outer of 30 is drawn as 30 (a polygon on one circle)
    expect(magnifyRange({ type: 'star', points: 5, outer: 30, inner: 99 })).toEqual({
      min: 0.25 / 30,
      max: 2500 / 30,
    });
  });

  it('is for the curved shapes only – the older types are left as they always were', () => {
    for (const s of [
      { type: 'rect', w: 10, h: 10, r: 0 },
      { type: 'circle', d: 10 },
      { type: 'slot', l: 20, w: 5 },
      { type: 'grid', d: 5, nx: 2, ny: 2, px: 10, py: 10 },
      { type: 'text', text: 'a', height: 5, spacing: 0, lineSpacing: 1.6, align: 'left' },
    ] as AnySketch[]) {
      expect(magnifyRange(s)).toBeNull();
    }
  });
});

describe('holding a factor', () => {
  const star: AnySketch = { type: 'star', points: 5, outer: 2000, inner: 800 };

  it('brings it into what every shape can take, and leaves it where nothing is held', () => {
    expect(holdFactor([star], 10)).toBe(1.25);
    expect(holdFactor([star], 1.1)).toBe(1.1);
    expect(holdFactor([star], 0.0001)).toBe(0.25 / 800);
    expect(holdFactor([undefined, { type: 'circle', d: 10 }], 7)).toBe(7);
    expect(holdFactor([], 3)).toBe(3);
  });

  it('is held by the one that can take least, with several shapes', () => {
    const gear: AnySketch = { type: 'gear', teeth: 12, outer: 1000, root: 900 };
    // the star takes 1.25, the gear 2.5: 1.25 for both
    expect(holdFactor([star, gear], 10)).toBe(1.25);
    expect(holdFactor([gear, star], 10)).toBe(1.25);
  });
});

describe('magnifying', () => {
  it('keeps the ratio of a star where the library would flatten it – and is the library where it does not', () => {
    const star: AnySketch = { type: 'star', points: 5, outer: 2000, inner: 800 };
    // what the library does on its own: both radii at the limit
    expect(magnifySketch(star, 10)).toMatchObject({ outer: 2500, inner: 2500 });
    expect(magnified(star, holdFactor([star], 10))).toEqual({
      type: 'star',
      points: 5,
      outer: 2500,
      inner: 1000,
    });
    // within the range it is the library, to the last digit
    const small: AnySketch = { type: 'star', points: 5, outer: 30, inner: 12 };
    expect(magnified(small, 2)).toEqual(magnifySketch(small, 2));
    // an older type is magnified exactly as the library does it, however far
    const circle: AnySketch = { type: 'circle', d: 1 };
    expect(magnified(circle, 0.1)).toEqual(magnifySketch(circle, 0.1));
  });

  it('scales a shape for a handle: one size for a star, a gear and a spiral, two for an ellipse', () => {
    expect(scaledShape({ type: 'gear', teeth: 10, outer: 40, root: 30 }, 2, 5)).toEqual({
      type: 'gear',
      teeth: 10,
      outer: 80,
      root: 60,
    });
    expect(scaledShape({ type: 'ellipse', rx: 40, ry: 25 }, 2, 0.5)).toEqual({
      type: 'ellipse',
      rx: 80,
      ry: 12.5,
    });
    expect(scaledShape({ type: 'rect', w: 10, h: 10, r: 0 }, 2, 3)).toEqual({
      type: 'rect',
      w: 20,
      h: 30,
      r: 0,
    });
  });
});
