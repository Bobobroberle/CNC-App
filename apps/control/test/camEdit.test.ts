import { compose, IDENTITY, rectangle, rotation, sketchContours, translation } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import {
  frameAngle,
  frameCorners,
  frameHandles,
  framePoint,
  frameSize,
  handleAt,
  handleCursor,
  insideFrame,
  resizeTo,
  selectionFrame,
  turnTo,
  type Frame,
} from '../src/lib/camEdit';
import { place, type CamItem } from '../src/lib/camItems';
import { camKey, typingInto } from '../src/lib/camKeys';
import { inViewSpot, provideTableBox, tableBox } from '../src/lib/tableBox';

let id = 1;
const item = (source: CamItem['source'], placement = IDENTITY, more: Partial<CamItem> = {}) =>
  ({
    id: id++,
    group: 1,
    source,
    placement,
    contours: place(source, placement),
    kind: 'outside',
    tabs: false,
    relief: null,
    side: 'front',
    ...more,
  }) satisfies CamItem;

/** A 100 × 60 rectangle drawn around its middle, lying with its corner on the work zero. */
const plate = (placement = translation(50, 30)) =>
  item(sketchContours({ type: 'rect', w: 100, h: 60, r: 0 }).contours, placement, {
    sketch: { type: 'rect', w: 100, h: 60, r: 0 },
  });
const near = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe('the frame of a selection', () => {
  it('is the own box of one shape, turned with it', () => {
    expect(selectionFrame([])).toBeNull();
    const f = selectionFrame([plate()])!;
    expect(f.own).toBe(true);
    expect(f.box).toEqual({ minX: -50, minY: -30, maxX: 50, maxY: 30 });
    expect(frameSize(f)).toEqual({ w: 100, h: 60 });
    expect(frameAngle(f)).toBe(0);
    near(frameCorners(f)[0]!, 0, 0);
    near(frameCorners(f)[2]!, 100, 60);
    // Turned a quarter around the work zero: the frame turns, its measures stay.
    const turned = selectionFrame([plate(compose(rotation(90), translation(50, 30)))])!;
    expect(frameAngle(turned)).toBe(90);
    expect(frameSize(turned)).toEqual({ w: 100, h: 60 });
    near(framePoint(turned, 1, 0), 0, 100);
    expect(frameAngle(selectionFrame([plate(rotation(180))])!)).toBe(180);
    expect(frameAngle(selectionFrame([plate(rotation(-30))])!)).toBe(-30);
  });

  it('is the box of the sources where everything lies the same way, else the upright box', () => {
    const m = compose(translation(10, 0), rotation(90));
    const file = [item([rectangle(0, 0, 40, 20)], m), item([rectangle(50, 0, 10, 10)], m)];
    const f = selectionFrame(file)!;
    expect(f.own).toBe(true);
    expect(f.box).toEqual({ minX: 0, minY: 0, maxX: 60, maxY: 20 });
    // Each its own way: only the box around all of it is left.
    const mixed = [item([rectangle(0, 0, 40, 20)]), item([rectangle(0, 0, 10, 10)], rotation(90))];
    const g = selectionFrame(mixed)!;
    expect(g.own).toBe(false);
    expect(g.m).toBe(IDENTITY);
    expect(g.box).toEqual({ minX: -10, minY: 0, maxX: 40, maxY: 20 });
    // Nothing with a point in it has no frame; a map squeezed flat is not used.
    expect(selectionFrame([item([])])).toBeNull();
    const flat = { a: 1, b: 0, c: 1, d: 0, e: 0, f: 0 };
    expect(selectionFrame([item([rectangle(0, 0, 4, 2)], flat)])!.own).toBe(false);
  });
});

describe('handles', () => {
  const f = selectionFrame([plate()])!;

  it('sit on the corners, on sides long enough, and beyond the upper side for turning', () => {
    // 2 px per mm: 200 × 120 px on the screen.
    const all = frameHandles(f, 2);
    expect(all.map((h) => h.id)).toEqual(['sw', 's', 'se', 'e', 'ne', 'n', 'nw', 'w', 'turn']);
    near(all.find((h) => h.id === 'e')!.at, 100, 30);
    // 30 px beyond the middle of the upper side.
    near(all.find((h) => h.id === 'turn')!.at, 50, 75);
    // 0.6 px per mm: 60 × 36 px – no room for a handle on the short sides.
    expect(frameHandles(f, 0.6, false).map((h) => h.id)).toEqual([
      'sw',
      's',
      'se',
      'ne',
      'n',
      'nw',
    ]);
    expect(frameHandles(f, 0.2, false).map((h) => h.id)).toEqual(['sw', 'se', 'ne', 'nw']);
    // A flat frame (a line) turns its handle to its own upper side.
    const line: Frame = {
      m: rotation(90),
      box: { minX: 0, minY: 0, maxX: 50, maxY: 0 },
      own: true,
    };
    near(frameHandles(line, 1).find((h) => h.id === 'turn')!.at, -30, 25);
  });

  it('are taken from outside as a full target; inside a small frame they give way', () => {
    expect(handleAt(f, { x: 105, y: 65 }, 2)).toBe('ne');
    expect(handleAt(f, { x: 50, y: 78 }, 2)).toBe('turn');
    expect(handleAt(f, { x: 50, y: 78 }, 2, false)).toBeNull();
    expect(handleAt(f, { x: 50, y: 30 }, 2)).toBeNull();
    // 11 px outside the corner is a hit, 30 px is not.
    expect(handleAt(f, { x: -4, y: -4 }, 2)).toBe('sw');
    expect(handleAt(f, { x: -20, y: -20 }, 2)).toBeNull();
    // At 0.3 px per mm the frame is 30 × 18 px: inside it only 8 px around a handle count.
    expect(handleAt(f, { x: 30, y: 20 }, 0.3)).toBeNull();
    expect(handleAt(f, { x: 2, y: 2 }, 0.3)).toBe('sw');
    expect(handleAt(f, { x: -30, y: -30 }, 0.3)).toBe('sw');
  });

  it('show the mouse which way they pull, as the frame is turned', () => {
    expect(handleCursor(f, 'e')).toBe('ew-resize');
    expect(handleCursor(f, 'w')).toBe('ew-resize');
    expect(handleCursor(f, 'n')).toBe('ns-resize');
    expect(handleCursor(f, 'ne')).toBe('nesw-resize');
    expect(handleCursor(f, 'sw')).toBe('nesw-resize');
    expect(handleCursor(f, 'nw')).toBe('nwse-resize');
    expect(handleCursor(f, 'turn')).toBe('grab');
    const quarter = selectionFrame([plate(rotation(90))])!;
    expect(handleCursor(quarter, 'e')).toBe('ns-resize');
    expect(handleCursor(quarter, 'ne')).toBe('nwse-resize');
    const tilted = selectionFrame([plate(rotation(45))])!;
    expect(handleCursor(tilted, 'e')).toBe('nesw-resize');
    expect(handleCursor(tilted, 'ne')).toBe('ns-resize');
  });

  it('know what lies in the frame', () => {
    expect(insideFrame(f, { x: 50, y: 30 })).toBe(true);
    expect(insideFrame(f, { x: 103, y: 30 })).toBe(false);
    expect(insideFrame(f, { x: 103, y: 30 }, 5)).toBe(true);
    expect(insideFrame(f, { x: 50, y: -6 }, 5)).toBe(false);
  });
});

describe('pulling a size handle', () => {
  const f = selectionFrame([plate()])!;

  it('changes the measure along the handle, the other side staying', () => {
    // The right side pulled to x = 150: one and a half times as wide, the left side stays.
    expect(resizeTo(f, 'e', { x: 150, y: 999 }, false)).toEqual({ kx: 1.5, ky: 1, fx: 0, fy: 0.5 });
    expect(resizeTo(f, 'w', { x: 50, y: 0 }, false)).toEqual({ kx: 0.5, ky: 1, fx: 1, fy: 0.5 });
    expect(resizeTo(f, 'n', { x: 0, y: 90 }, false)).toEqual({ kx: 1, ky: 1.5, fx: 0.5, fy: 0 });
    expect(resizeTo(f, 'sw', { x: -100, y: -60 }, false)).toEqual({ kx: 2, ky: 2, fx: 1, fy: 1 });
    // On a grid of whole millimetres, and never smaller than can be drawn.
    expect(resizeTo(f, 'e', { x: 120.4, y: 0 }, false, 1).kx).toBeCloseTo(1.2);
    expect(resizeTo(f, 'e', { x: -80, y: 0 }, false, 1).kx).toBeCloseTo(0.005);
  });

  it('keeps the proportions where the thing has only one size', () => {
    // The corner pulled further in x than in y: the larger pull counts for both.
    expect(resizeTo(f, 'ne', { x: 200, y: 70 }, true)).toEqual({ kx: 2, ky: 2, fx: 0, fy: 0 });
    expect(resizeTo(f, 's', { x: 0, y: 30 }, true)).toEqual({ kx: 0.5, ky: 0.5, fx: 0.5, fy: 1 });
    // A flat frame has no height to pull at.
    const line: Frame = { m: IDENTITY, box: { minX: 0, minY: 0, maxX: 50, maxY: 0 }, own: true };
    expect(resizeTo(line, 'n', { x: 0, y: 40 }, true)).toEqual({ kx: 1, ky: 1, fx: 0.5, fy: 0 });
    expect(resizeTo(line, 'ne', { x: 100, y: 40 }, false)).toEqual({ kx: 2, ky: 1, fx: 0, fy: 0 });
  });

  it('works along the axes of a turned frame', () => {
    const turned = selectionFrame([plate(rotation(90))])!;
    // Its "right" side now points up: pulled 25 mm further up.
    expect(resizeTo(turned, 'e', { x: 0, y: 75 }, false).kx).toBeCloseTo(1.25);
  });
});

describe('pulling the turn handle', () => {
  const f = selectionFrame([plate()])!;
  const from = { x: 50, y: 75 };

  it('turns around the middle, on whole degrees, catching the steps of 15°', () => {
    // From straight up to straight left: a quarter turn to the left.
    expect(turnTo(f, from, { x: 0, y: 30 })).toBe(90);
    expect(turnTo(f, from, { x: 100, y: 30 })).toBe(-90);
    // 43° comes close enough to 45°; 38° stays what it is.
    const at = (deg: number) => ({
      x: 50 - 45 * Math.sin((deg * Math.PI) / 180),
      y: 30 + 45 * Math.cos((deg * Math.PI) / 180),
    });
    expect(turnTo(f, from, at(43))).toBe(45);
    expect(turnTo(f, from, at(38.2))).toBe(38);
    // A frame that already stands at 10° ends on a whole step, too.
    const tilted = selectionFrame([
      plate(compose(rotation(10, { x: 50, y: 30 }), translation(50, 30))),
    ])!;
    expect(turnTo(tilted, from, at(19))).toBeCloseTo(20);
  });
});

describe('the keys of the drawing', () => {
  const key = (k: string, mods: Partial<Parameters<typeof camKey>[0]> = {}) =>
    camKey({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods });

  it('deletes, lets go and nudges', () => {
    expect(key('Delete')).toEqual({ do: 'delete' });
    expect(key('Backspace')).toEqual({ do: 'delete' });
    expect(key('Escape')).toEqual({ do: 'deselect' });
    expect(key('ArrowLeft')).toEqual({ do: 'nudge', dx: -1, dy: 0 });
    expect(key('ArrowUp', { shiftKey: true })).toEqual({ do: 'nudge', dx: 0, dy: 10 });
    expect(key('ArrowDown', { altKey: true })).toEqual({ do: 'nudge', dx: 0, dy: -0.1 });
    expect(key('ArrowRight')).toEqual({ do: 'nudge', dx: 1, dy: 0 });
    expect(key('a')).toBeNull();
    expect(key('Enter')).toBeNull();
  });

  it('undoes, redoes, copies – with Ctrl or Cmd', () => {
    expect(key('z', { ctrlKey: true })).toEqual({ do: 'undo' });
    expect(key('Z', { metaKey: true, shiftKey: true })).toEqual({ do: 'redo' });
    expect(key('y', { ctrlKey: true })).toEqual({ do: 'redo' });
    expect(key('d', { metaKey: true })).toEqual({ do: 'duplicate' });
    expect(key('c', { ctrlKey: true })).toEqual({ do: 'copy' });
    expect(key('v', { ctrlKey: true })).toEqual({ do: 'paste' });
    expect(key('a', { ctrlKey: true })).toEqual({ do: 'all' });
    // What the browser keeps: reload, a new window, the developer tools.
    expect(key('r', { ctrlKey: true })).toBeNull();
    expect(key('C', { ctrlKey: true, shiftKey: true })).toBeNull();
    expect(key('z', { ctrlKey: true, altKey: true })).toBeNull();
    expect(key('ArrowLeft', { ctrlKey: true })).toBeNull();
  });

  it('knows when the keys are typed into something', () => {
    expect(typingInto({ tagName: 'INPUT' })).toBe(true);
    expect(typingInto({ tagName: 'textarea' })).toBe(true);
    expect(typingInto({ tagName: 'SELECT' })).toBe(true);
    expect(typingInto({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(typingInto({ tagName: 'BUTTON' })).toBe(false);
    expect(typingInto(null)).toBe(false);
  });
});

describe('where a new thing is seen', () => {
  it('asks the table view while there is one', () => {
    expect(tableBox()).toBeNull();
    const view = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const stop = provideTableBox(() => view);
    expect(tableBox()).toBe(view);
    // A later view takes over; the earlier one going away does not take it back.
    const other = provideTableBox(() => null);
    stop();
    expect(tableBox()).toBeNull();
    other();
    expect(tableBox()).toBeNull();
  });

  it('keeps the wanted place when it is in view, else takes the middle of the view', () => {
    const view = { minX: 100, minY: 50, maxX: 301, maxY: 150 };
    const wanted = { x: 20, y: 20 };
    expect(inViewSpot(null, wanted)).toBe(wanted);
    expect(inViewSpot(view, wanted)).toEqual({ x: 201, y: 100 });
    const seen = { x: 120, y: 60 };
    expect(inViewSpot(view, seen)).toBe(seen);
    expect(inViewSpot(view, { x: 120, y: 200 })).toEqual({ x: 201, y: 100 });
  });
});
