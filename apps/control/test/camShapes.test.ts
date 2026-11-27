import { contourBounds, sketchContours, tidySketch, type AnySketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { describeItem } from '../src/components/camParts';
import { framePoint, selectionFrame } from '../src/lib/camEdit';
import { itemsBounds } from '../src/lib/camItems';
import { START } from '../src/lib/camStart';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useWorkshop } from '../src/store/workshop';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const steps = () => cam().past.length;
/** Whether a contour has a vertex at a place (the ends of an arc are made with sine and cosine: to a billionth) */
const has = (points: readonly { x: number; y: number }[], x: number, y: number) =>
  points.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);
/** The box of a thing as it lies on the table: left, bottom, right, top (rounded to a millionth of a mm) */
const box = (i = 0) => {
  const b = itemsBounds([items()[i]!])!;
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1e6) / 1e6 + 0);
};

function scene() {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
}

/**
 * The boxes of the shapes at the size a tap puts them, worked out by hand:
 *  - ellipse 40 × 25 radii: 80 × 50;
 *  - star of 5 tips, outer 30, inner 12: the tips lie at 0°, 72°, 144°, 216°, 288° from straight up, so it
 *    reaches 30 sin 72° = 28.531695 to each side, 30 up and 30 cos 36° = 24.270510 down (the notches lie inside);
 *  - gear of 16 teeth on 30: a tooth stands on each axis, the box is ±30 on both;
 *  - spiral of 4 turns from 2 to 30: x from 30 (the last point, at 8π) to −26.52 (round 7π, where the radius
 *    is 2 + 28 · 7 / 8 = 26.5, a hair more for the chord's sampling).
 */
const EXPECT = {
  ellipse: { size: [80, 50] },
  star: { size: [2 * 28.531695, 30 + 24.27051] },
  gear: { size: [60, 60] },
  spiral: { size: [30 + 26.52075, 24.77361 + 28.27011] },
} as const;

describe('the further basic shapes', () => {
  beforeEach(scene);

  for (const shape of ['ellipse', 'star', 'gear', 'spiral'] as const) {
    it(`puts a ${shape} on the table at once, selected, at its usual size – the first thing at the work zero`, () => {
      cam().addSketch(START[shape]);
      expect(items()).toHaveLength(1);
      const item = items()[0]!;
      expect(item.sketch).toEqual(START[shape]);
      expect(cam().selected).toBe(item.group);
      expect(item.contours).toHaveLength(1);
      // the same contour the library draws from its own measures
      expect(item.source).toEqual(sketchContours(START[shape]).contours);
      const [left, bottom, right, top] = box();
      expect(left).toBeCloseTo(0, 6);
      expect(bottom).toBeCloseTo(0, 6);
      expect(right).toBeCloseTo(EXPECT[shape].size[0], 4);
      expect(top).toBeCloseTo(EXPECT[shape].size[1], 4);
      // …and a program is made of it
      expect(program()).not.toBe('');
    });
  }

  it('cuts a star, a gear and an ellipse as the other closed shapes: outside, with tabs – and the spiral as a line', () => {
    for (const shape of ['ellipse', 'star', 'gear', 'spiral'] as const)
      cam().addSketch(START[shape]);
    const [ellipse, star, gear, spiral] = items();
    for (const closed of [ellipse!, star!, gear!]) {
      expect(closed.kind).toBe('outside');
      expect(closed.tabs).toBe(true);
      expect(closed.relief).toBeNull();
      expect(closed.contours[0]!.closed).toBe(true);
    }
    // an open contour is engraved: no tabs, no relief, and nothing the program would call a problem
    expect(spiral!.contours[0]!.closed).toBe(false);
    expect(spiral!.kind).toBe('on');
    expect(spiral!.tabs).toBe(false);
    expect(spiral!.relief).toBeNull();
    expect(cam().problems).toEqual([]);
    // engraved at the engraving depth (1 mm): the program goes down to Z-1 for it
    expect(program()).toContain('Z-1');
  });

  it('puts a shape inside a plate where a hole is made – a star in a plate is cut out of it', () => {
    cam().addSketch({ type: 'rect', w: 200, h: 120, r: 0 });
    cam().addSketch(START.star);
    // the second thing lies inside the first: a cut-out of the plate, inside
    expect(items()[1]!.kind).toBe('inside');
    expect(items()[1]!.tabs).toBe(false);
  });

  it('changes a measure by the number fields: the contour is made anew, the origin stays, undo brings it back', () => {
    cam().addSketch(START.ellipse);
    const id = items()[0]!.id;
    const origin = items()[0]!.placement;
    const was = steps();
    cam().setSketch(id, { type: 'ellipse', rx: 50, ry: 25 }, 'rx');
    expect(box()[2]! - box()[0]!).toBeCloseTo(100, 6);
    expect(box()[3]! - box()[1]!).toBeCloseTo(50, 6);
    // the middle of the ellipse stays where it was: a shape typed bigger grows round its own origin
    expect(items()[0]!.placement).toEqual(origin);
    // the same field again is the same step of undo
    cam().setSketch(id, { type: 'ellipse', rx: 55, ry: 25 }, 'rx');
    expect(steps()).toBe(was + 1);
    cam().setSketch(id, { type: 'ellipse', rx: 55, ry: 30 }, 'ry');
    expect(steps()).toBe(was + 2);
    cam().undo();
    expect(box()[2]! - box()[0]!).toBeCloseTo(110, 6);
    expect(box()[3]! - box()[1]!).toBeCloseTo(50, 6);
    cam().undo();
    expect(box()[2]! - box()[0]!).toBeCloseTo(80, 6);
    cam().redo();
    expect(box()[2]! - box()[0]!).toBeCloseTo(110, 6);
  });

  it('holds a typed measure to its range in the drawing but keeps what was typed in the fields', () => {
    cam().addSketch(START.star);
    const id = items()[0]!.id;
    // 99 tips: the star is drawn with the most there are (32 – 64 vertices), the label says what is drawn
    cam().setSketch(id, { type: 'star', points: 99, outer: 30, inner: 12 }, 'points');
    expect(items()[0]!.contours[0]!.points).toHaveLength(64);
    expect(items()[0]!.sketch).toEqual({ type: 'star', points: 99, outer: 30, inner: 12 });
    expect(describeItem(items()[0]!)).toBe('Stern mit 32 Spitzen, Ø 60 mm');
    // an inner radius beyond the outer one is a polygon on one circle: drawn so, never wider than the outer
    cam().setSketch(id, { type: 'star', points: 6, outer: 30, inner: 50 }, 'inner');
    expect(items()[0]!.contours[0]!.points).toHaveLength(12);
    const [left, , right] = box();
    expect(right! - left!).toBeCloseTo(60, 6);
    expect(describeItem(items()[0]!)).toBe('Stern mit 6 Spitzen, Ø 60 mm');
  });

  it('names each shape by what it is drawn as', () => {
    for (const shape of ['ellipse', 'star', 'gear', 'spiral'] as const)
      cam().addSketch(START[shape]);
    expect(items().map((i) => describeItem(i))).toEqual([
      'Ellipse 80 × 50 mm',
      'Stern mit 5 Spitzen, Ø 60 mm',
      'Zahnrad mit 16 Zähnen, Ø 60 mm',
      'Spirale, 4 Windungen',
    ]);
    cam().setSketch(items()[3]!.id, { type: 'spiral', turns: 2.5, start: 2, end: 30 });
    expect(describeItem(items()[3]!)).toBe('Spirale, 2,5 Windungen');
  });

  it('has no new shape without a sketch of its own: the item can be made anew from it', () => {
    for (const shape of ['ellipse', 'star', 'gear', 'spiral'] as const)
      cam().addSketch(START[shape]);
    for (const item of items()) {
      const again = sketchContours(item.sketch!).contours;
      expect(contourBounds(again)).toEqual(contourBounds(item.source));
    }
  });
});

describe('a rectangle with a radius for each corner', () => {
  beforeEach(scene);
  const RECT: AnySketch = { type: 'rect', w: 100, h: 60, r: 0 };

  it('is made with its own arcs: only the corners that have a radius are rounded', () => {
    cam().addSketch(RECT);
    const id = items()[0]!.id;
    const plain = items()[0]!.source[0]!.points;
    expect(plain).toHaveLength(4);
    // lower left (index 0) 10 mm, the others sharp
    cam().setSketch(id, { type: 'rect', w: 100, h: 60, r: 10, radii: [10, 0, 0, 0] }, 'radius-ll');
    const points = items()[0]!.source[0]!.points;
    expect(points.length).toBeGreaterThan(4);
    const at = (x: number, y: number) => has(points, x, y);
    // own origin: the middle of the rectangle – so its corners are (±50, ±30)
    expect(at(50, 30)).toBe(true);
    expect(at(-50, 30)).toBe(true);
    expect(at(50, -30)).toBe(true);
    expect(at(-50, -30)).toBe(false);
    // the arc starts 10 mm from the corner on each side
    expect(at(-40, -30)).toBe(true);
    expect(at(-50, -20)).toBe(true);
    // the box is still the whole rectangle
    expect(box()).toEqual([0, 0, 100, 60]);
  });

  it('rounds each corner by its own number, one step of undo for a number typed in a row', () => {
    cam().addSketch(RECT);
    const id = items()[0]!.id;
    const was = steps();
    // upper right 20, lower right 5 (the places are lower left, lower right, upper right, upper left)
    cam().setSketch(id, { type: 'rect', w: 100, h: 60, r: 20, radii: [0, 0, 20, 0] }, 'radius-ur');
    cam().setSketch(id, { type: 'rect', w: 100, h: 60, r: 20, radii: [0, 5, 20, 0] }, 'radius-lr');
    expect(steps()).toBe(was + 2);
    const points = items()[0]!.source[0]!.points;
    expect(has(points, 30, 30)).toBe(true);
    expect(has(points, 50, 10)).toBe(true);
    expect(has(points, 45, -30)).toBe(true);
    cam().undo();
    expect(has(items()[0]!.source[0]!.points, 45, -30)).toBe(false);
    cam().undo();
    expect(items()[0]!.source[0]!.points).toHaveLength(4);
  });

  it('is cut like any plate: outside, with tabs, a pocket as well', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 8, radii: [8, 0, 8, 0] });
    expect(items()[0]!.kind).toBe('outside');
    expect(items()[0]!.tabs).toBe(true);
    expect(cam().problems).toEqual([]);
    expect(program()).not.toBe('');
  });

  it('holds each radius to half of the shorter side', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    cam().setSketch(items()[0]!.id, {
      type: 'rect',
      w: 100,
      h: 60,
      r: 500,
      radii: [500, 0, 0, 0],
    });
    // 30 mm, not 500: the arc of the lower left corner ends 30 mm from the corner
    const points = items()[0]!.source[0]!.points;
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(-50, 9);
    expect(has(points, -20, -30)).toBe(true);
    expect(tidySketch(items()[0]!.sketch!)).toEqual({
      type: 'rect',
      w: 100,
      h: 60,
      r: 30,
      radii: [30, 0, 0, 0],
    });
  });
});

describe('a shape made larger or smaller by a handle or a typed size', () => {
  beforeEach(scene);

  it('keeps the proportions of a star at the end of the range: it stops where a measure reaches its limit', () => {
    // a star of outer 2000 and inner 800 – a size the fields take: ten times larger would be 20000 and 8000
    cam().addSketch({ type: 'star', points: 5, outer: 2000, inner: 800 });
    cam().scale(10);
    // the factor is held to 2500 / 2000 = 1.25: both radii by the same factor, the ratio stays 0.4
    expect(items()[0]!.sketch).toEqual({ type: 'star', points: 5, outer: 2500, inner: 1000 });
  });

  it('does the same for the handle of the frame – the proportions hold where the finger asks for more', () => {
    cam().addSketch({ type: 'star', points: 5, outer: 2000, inner: 800 });
    const frame = selectionFrame(items());
    const edit = cam().edit('ne', framePoint(frame!, 1, 1))!;
    // a finger ten widths beyond the corner asks for ten times the size
    edit.move(framePoint(frame!, 10, 10));
    edit.end();
    expect(items()[0]!.sketch).toEqual({ type: 'star', points: 5, outer: 2500, inner: 1000 });
    // one step of undo for the whole gesture
    cam().undo();
    expect(items()[0]!.sketch).toEqual({ type: 'star', points: 5, outer: 2000, inner: 800 });
  });

  it('holds the smallest end alike: a star of inner 0.5 stops at an inner radius of 0.25', () => {
    cam().addSketch({ type: 'star', points: 5, outer: 1, inner: 0.5 });
    cam().scale(0.1);
    // 0.25 / 0.5 = 0.5: outer 0.5, inner 0.25 – not both at 0.25, which would be no star
    expect(items()[0]!.sketch).toEqual({ type: 'star', points: 5, outer: 0.5, inner: 0.25 });
  });

  it('keeps a gear and a spiral in proportion too', () => {
    cam().addSketch({ type: 'gear', teeth: 20, outer: 1000, root: 800 });
    cam().scale(10);
    // 2500 / 1000 = 2.5: root 2000
    expect(items()[0]!.sketch).toEqual({ type: 'gear', teeth: 20, outer: 2500, root: 2000 });
    cam().addSketch({ type: 'spiral', turns: 3, start: 0, end: 100 });
    cam().scale(100);
    // the larger end carries it: 2500 / 100 = 25 – the end that is 0 stays 0
    expect(items()[1]!.sketch).toEqual({ type: 'spiral', turns: 3, start: 0, end: 2500 });
  });

  it('holds the factor once for everything that is scaled together: nothing grows out of step', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    cam().addSketch({ type: 'star', points: 5, outer: 2000, inner: 800 });
    cam().selectAll();
    cam().scale(2);
    // k = 1.25 for the whole selection (the star can take no more): the plate is 125 wide, the star 2500
    expect(items()[1]!.sketch).toEqual({ type: 'star', points: 5, outer: 2500, inner: 1000 });
    expect(items()[0]!.sketch).toMatchObject({ type: 'rect', w: 125, h: 75 });
  });

  it('leaves what is within its range exactly as the library scales it', () => {
    cam().addSketch({ type: 'star', points: 5, outer: 30, inner: 12 });
    cam().scale(2);
    expect(items()[0]!.sketch).toEqual({ type: 'star', points: 5, outer: 60, inner: 24 });
    cam().addSketch({ type: 'ellipse', rx: 40, ry: 25 });
    // an ellipse takes its two measures from the two factors: the handles of its sides change only one
    const frame = selectionFrame([items()[1]!])!;
    const edit = cam().edit('e', framePoint(frame, 1, 0.5))!;
    edit.move(framePoint(frame, 1.5, 0.5));
    edit.end();
    expect(items()[1]!.sketch).toEqual({ type: 'ellipse', rx: 60, ry: 25 });
  });
});
