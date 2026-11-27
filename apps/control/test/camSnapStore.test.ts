import { rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { itemsBounds } from '../src/lib/camItems';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useWorkshop } from '../src/store/workshop';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const steps = () => cam().past.length;
/** The box of one group: left, bottom, right, top */
const boxOf = (group: number) => {
  const b = itemsBounds(items().filter((i) => i.group === group))!;
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1e6) / 1e6 + 0);
};

/**
 * Three parts by hand, each its own group (x from, y from, x to, y to):
 *   a: 0 0 10 10     b: 30 20 50 30     c: 100 5 130 45
 */
let a = 0;
let b = 0;
let c = 0;
function scene(stock: boolean | null = null) {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({
    stock: stock ? { min: { x: 0, y: 0, z: -18 }, max: { x: 200, y: 100, z: 0 } } : null,
    fixtures: [],
    fixtureFrame: 'machine',
  });
  cam().add([rectangle(0, 0, 10, 10)]);
  cam().add([rectangle(30, 20, 20, 10)]);
  cam().add([rectangle(100, 5, 30, 40)]);
  [a, b, c] = items().map((i) => i.group) as [number, number, number];
  cam().select(null);
}

describe('dragging a part with snapping', () => {
  beforeEach(() => scene());

  it('is the grid alone, exactly as before, where no assist is asked for', () => {
    cam().select(a);
    const drag = cam().drag()!;
    // A neighbour is 1.5 mm from a line – and nothing says to snap: only the grid
    expect(drag.move(28.5, 23.4, 1)).toBeUndefined();
    expect(boxOf(a)).toEqual([29, 23, 39, 33]);
    drag.end();
    // The old rule, word for word, on the start box of the drag (a at 29 23 now)
    cam().select(a);
    const again = cam().drag()!;
    again.move(0.7, -0.2, 0.5);
    expect(boxOf(a)).toEqual([29.5, 23, 39.5, 33]);
    again.end();
  });

  it('snaps to the lines of another part within the threshold, and lets go again when the finger moves on', () => {
    cam().select(a);
    const drag = cam().drag()!;
    // a's left edge at 28.5: 1.5 from b's (30); y has nothing within 3
    const hints = drag.move(28.5, 23.5, 0, { snap: 3 });
    expect(boxOf(a)).toEqual([30, 23.5, 40, 33.5]);
    expect(hints!.guides).toEqual([{ axis: 'x', at: 30, from: 20, to: 33.5 }]);
    // On from there: 4 mm away from the line is out of reach – the finger's own place again
    const away = drag.move(25, 23.5, 0, { snap: 3 });
    expect(boxOf(a)).toEqual([25, 23.5, 35, 33.5]);
    expect(away!.guides).toEqual([]);
    drag.end();
  });

  it('is one step of undo for the whole drag, however many moves it had', () => {
    cam().select(a);
    const was = steps();
    const drag = cam().drag()!;
    for (const dx of [5, 12, 20, 28.5]) drag.move(dx, 23.5, 1, { snap: 3 });
    expect(steps()).toBe(was);
    drag.end();
    expect(steps()).toBe(was + 1);
    // x on b's left edge, y on the grid (23.5 rounds up)
    expect(boxOf(a)).toEqual([30, 24, 40, 34]);
    cam().undo();
    expect(boxOf(a)).toEqual([0, 0, 10, 10]);
  });

  it('lets an object win over the grid on its own axis and leaves the other to the grid', () => {
    cam().select(a);
    const drag = cam().drag()!;
    // x: b's left edge (30) is 1.4 away – not the grid's 29; y: nothing near, the grid's whole mm
    drag.move(28.6, 60.4, 1, { snap: 3 });
    expect(boxOf(a)).toEqual([30, 60, 40, 70]);
    drag.end();
  });

  it('snaps a whole selection as one box and never to its own members', () => {
    cam().select([a, b]);
    const drag = cam().drag()!;
    // The box of both is 0 0 – 50 30; its left edge goes to c's (100): 2 away at dx 98
    drag.move(98, 40, 0, { snap: 3 });
    expect(boxOf(a)).toEqual([100, 40, 110, 50]);
    expect(boxOf(b)).toEqual([130, 60, 150, 70]);
    drag.end();
  });

  it('snaps to the stock where one was entered – and to nothing where none was', () => {
    scene(true);
    cam().select(a);
    let drag = cam().drag()!;
    // a's left edge to the stock's (0): 2 away
    drag.move(-2, 60.4, 0, { snap: 3 });
    expect(boxOf(a)).toEqual([0, 60.4, 10, 70.4]);
    drag.end();
    scene(false);
    cam().select(a);
    drag = cam().drag()!;
    drag.move(-2, 60.4, 0, { snap: 3 });
    expect(boxOf(a)).toEqual([-2, 60.4, 8, 70.4]);
    drag.end();
  });

  it('leaves out hidden parts, which are not on the table to snap to', () => {
    // b hidden: its line is no line any more
    const item = items().find((i) => i.group === b)!;
    cam().setHidden(item.id, true);
    cam().select(a);
    const drag = cam().drag()!;
    drag.move(28.5, 23.5, 0, { snap: 3 });
    expect(boxOf(a)).toEqual([28.5, 23.5, 38.5, 33.5]);
    drag.end();
  });

  it('measures from what is in sight: a hidden member of a group moves along but is no line and no edge', () => {
    // a (0 0 10 10) and a part d far to the right (200 0 – 210 10) are one group; d is hidden. The box of both
    // has its middle at 105 – at dx 10 on c's middle (115), where a, the one that is seen, is nowhere near
    cam().add([rectangle(200, 0, 10, 10)]);
    const d = items().at(-1)!;
    cam().select([a, d.group]);
    cam().group();
    const group = items().find((i) => i.id === d.id)!.group;
    cam().setHidden(d.id, true);
    cam().select(group);
    const drag = cam().drag()!;
    const hints = drag.move(10, 0, 0, { snap: 2, gaps: true })!;
    // Not snapped: the finger's own shift – and no guide to c
    expect(boxOf(group)).toEqual([10, 0, 220, 10]);
    expect(hints.guides).toEqual([]);
    // The gap is from a's right edge (20) to c's left edge (100): c lies where a's rows are, d's edge is 220
    expect(hints.gaps.map((g) => [g.side, g.gap])).toEqual([['right', 80]]);
    // What is seen snaps as ever: a's left edge to b's (30) at dx 30 – the hidden member goes along
    const snapped = drag.move(29, 23, 0, { snap: 2 })!;
    expect(snapped.guides.map((g) => [g.axis, g.at])).toEqual([['x', 30]]);
    expect(boxOf(group)).toEqual([30, 23, 240, 33]);
    drag.end();
  });

  it('keeps the grid on the box of the whole selection, hidden members and all – as the position fields show it', () => {
    // d hidden at −52 – −42, left of a: the box of both begins at −52. With a step of 5 its corner goes to −50
    cam().add([rectangle(-52, 0, 10, 10)]);
    const d = items().at(-1)!;
    cam().select([a, d.group]);
    cam().group();
    const group = items().find((i) => i.id === d.id)!.group;
    cam().setHidden(d.id, true);
    cam().select(group);
    const drag = cam().drag()!;
    drag.move(3.4, 0, 5, { snap: 2 });
    expect(boxOf(group)).toEqual([-50, 0, 10 + 2, 10]);
    drag.end();
  });

  it('snaps nothing and shows nothing for a selection with nothing of it in sight', () => {
    const item = items().find((i) => i.group === a)!;
    cam().setHidden(item.id, true);
    // A wholly hidden group can only be ticked in the list: it moves with the grid, and has no guides to show
    cam().toggleSelect(a);
    const drag = cam().drag()!;
    expect(drag.move(28.5, 23.5, 0, { snap: 3, gaps: true })).toBeUndefined();
    expect(boxOf(a)).toEqual([28.5, 23.5, 38.5, 33.5]);
    drag.end();
  });

  it('answers the gaps to the neighbours while the finger drags, when they are asked for', () => {
    cam().select(a);
    const drag = cam().drag()!;
    expect(drag.move(12, 22, 0, { gaps: false })!.gaps).toEqual([]);
    const hints = drag.move(12, 22, 0, { gaps: true })!;
    // a is now at 12 22 – 22 32: b's left edge is 8 to the right; c (100 5 – 130 45) lies further out
    expect(hints.gaps.map((g) => [g.side, g.gap])).toEqual([['right', 8]]);
    drag.end();
  });

  it('shows nothing and snaps to nothing for a registration hole dragged alone', () => {
    cam().setTwoSided({});
    const hole = items().find((i) => i.registration === 1)!;
    cam().select(hole.group);
    const drag = cam().drag()!;
    const before = boxOf(hole.group);
    // The hole's left edge is 1 from a's left edge (0) – not snapped, and no hints
    const dx = -before[0]! + 1;
    expect(drag.move(dx, 60, 0, { snap: 3, gaps: true })).toBeUndefined();
    expect(boxOf(hole.group)[0]).toBeCloseTo(1, 9);
    drag.end();
  });
});

describe('measuring, a mode of the screen', () => {
  beforeEach(() => scene());

  it('is off, with no points, until it is asked for – and a tap sets nothing before that', () => {
    expect(cam().measure).toBe(false);
    cam().measurePoint({ x: 1, y: 2 });
    expect(cam().measured).toEqual({ a: null, b: null });
  });

  it('sets A, then B, and a third tap starts again with A alone', () => {
    cam().setMeasure(true);
    cam().measurePoint({ x: 1, y: 2 });
    expect(cam().measured).toEqual({ a: { x: 1, y: 2 }, b: null });
    cam().measurePoint({ x: 4, y: 6 });
    expect(cam().measured).toEqual({ a: { x: 1, y: 2 }, b: { x: 4, y: 6 } });
    cam().measurePoint({ x: 9, y: 9 });
    expect(cam().measured).toEqual({ a: { x: 9, y: 9 }, b: null });
  });

  it('moves a point that is there, and only that one', () => {
    cam().setMeasure(true);
    cam().moveMeasure('b', { x: 5, y: 5 });
    expect(cam().measured.b).toBeNull();
    cam().measurePoint({ x: 1, y: 2 });
    cam().measurePoint({ x: 4, y: 6 });
    cam().moveMeasure('b', { x: 7, y: 8 });
    expect(cam().measured).toEqual({ a: { x: 1, y: 2 }, b: { x: 7, y: 8 } });
    cam().moveMeasure('a', { x: -1, y: 0 });
    expect(cam().measured).toEqual({ a: { x: -1, y: 0 }, b: { x: 7, y: 8 } });
  });

  it('takes the points away on "Messung löschen" and stays on – and ends with them when switched off', () => {
    cam().setMeasure(true);
    cam().measurePoint({ x: 1, y: 2 });
    cam().clearMeasure();
    expect(cam().measure).toBe(true);
    expect(cam().measured).toEqual({ a: null, b: null });
    cam().measurePoint({ x: 1, y: 2 });
    cam().setMeasure(false);
    expect(cam().measure).toBe(false);
    expect(cam().measured).toEqual({ a: null, b: null });
  });

  it('puts the points back as they were for a tap that was the first of a double tap', () => {
    cam().setMeasure(true);
    cam().measurePoint({ x: 1, y: 2 });
    const before = cam().measured;
    cam().measurePoint({ x: 4, y: 6 });
    cam().restoreMeasure(before);
    expect(cam().measured).toEqual({ a: { x: 1, y: 2 }, b: null });
  });

  it('changes nothing of the drawing: no selection, no step of undo, the same parts', () => {
    cam().select(b);
    const was = steps();
    const parts = items();
    cam().setMeasure(true);
    cam().measurePoint({ x: 1, y: 2 });
    cam().measurePoint({ x: 4, y: 6 });
    cam().moveMeasure('a', { x: 2, y: 2 });
    cam().clearMeasure();
    cam().setMeasure(false);
    expect(steps()).toBe(was);
    expect(cam().selected).toBe(b);
    expect(items()).toBe(parts);
  });

  it('ends the modes that give a tap or a drag another meaning – and is ended by them', () => {
    cam().setMulti(true);
    cam().setMarquee(true);
    cam().setMeasure(true);
    expect([cam().multi, cam().marquee, cam().measure]).toEqual([false, false, true]);
    cam().measurePoint({ x: 1, y: 2 });
    // Each of the three ends it, and takes the points with it
    cam().setMulti(true);
    expect([cam().multi, cam().measure, cam().measured.a]).toEqual([true, false, null]);
    cam().setMulti(false);
    cam().setMeasure(true);
    cam().measurePoint({ x: 1, y: 2 });
    cam().setMarquee(true);
    expect([cam().marquee, cam().measure, cam().measured.a]).toEqual([true, false, null]);
    cam().setMarquee(false);
    // Putting tabs by hand: it needs a selected part whose tabs are by hand
    const id = items().find((i) => i.group === a)!.id;
    cam().select(a);
    cam().setItem(id, { tabs: true });
    expect(cam().manualTabs(id)).toBe(true);
    cam().setMeasure(true);
    cam().setPlacing(id);
    expect([cam().placing, cam().measure]).toEqual([id, false]);
    cam().setMeasure(true);
    expect(cam().placing).toBeNull();
    // Switching one of them off leaves measuring alone
    cam().setMulti(false);
    cam().setMarquee(false);
    expect(cam().measure).toBe(true);
  });

  it('is off, with no points, when the drawing is closed', () => {
    cam().setMeasure(true);
    cam().measurePoint({ x: 1, y: 2 });
    cam().close();
    expect(cam().measure).toBe(false);
    expect(cam().measured).toEqual({ a: null, b: null });
  });
});
