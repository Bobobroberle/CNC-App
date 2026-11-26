import { circle, rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { holeCentre, itemsBounds, partsOf } from '../src/lib/camItems';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useWorkshop } from '../src/store/workshop';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const selected = () => cam().selected;
/** The box of every thing in the list: left, bottom, right, top */
const boxes = () =>
  items().map((i) => {
    const b = itemsBounds([i])!;
    return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1e6) / 1e6 + 0);
  });
const holes = () =>
  items()
    .filter((i) => i.registration !== undefined)
    .map((i) => ({ n: i.registration, ...holeCentre(i) }));
const steps = () => cam().past.length;

/**
 * Three parts by hand, each its own group (x from, y from, x to, y to):
 *   a: 0 0 10 10     b: 30 20 50 30     c: 100 5 130 45
 */
let a = 0;
let b = 0;
let c = 0;
function scene() {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  cam().add([rectangle(0, 0, 10, 10)]);
  cam().add([rectangle(30, 20, 20, 10)]);
  cam().add([rectangle(100, 5, 30, 40)]);
  [a, b, c] = items().map((i) => i.group) as [number, number, number];
  cam().select(null);
}

describe('selecting several things of the drawing', () => {
  beforeEach(scene);

  it('keeps a set of groups, and a lone group as the number it always was', () => {
    cam().select([a, b]);
    expect(selected()).toEqual([a, b]);
    cam().select([b]);
    expect(selected()).toBe(b);
    cam().select([]);
    expect(selected()).toBeNull();
    cam().toggleSelect(a);
    cam().toggleSelect(c);
    expect(selected()).toEqual([a, c]);
    cam().toggleSelect(a);
    expect(selected()).toBe(c);
    cam().toggleSelect(c);
    expect(selected()).toBeNull();
    // a group the drawing does not have changes nothing
    cam().toggleSelect(999);
    expect(selected()).toBeNull();
  });

  it('selects everything, and inverts to what was left out', () => {
    cam().selectAll();
    expect(selected()).toBe('all');
    cam().invertSelection();
    expect(selected()).toBeNull();
    cam().invertSelection();
    expect(selected()).toEqual([a, b, c]);
    cam().select(b);
    cam().invertSelection();
    expect(selected()).toEqual([a, c]);
    cam().invertSelection();
    expect(selected()).toBe(b);
    // taking one out of "everything" leaves the others
    cam().selectAll();
    cam().toggleSelect(b);
    expect(selected()).toEqual([a, c]);
  });

  it('takes a tap on the table in or out while "Mehrfachauswahl" is on, and keeps the others otherwise', () => {
    // the bottom lines of the three parts
    const onA = { x: 5, y: 0 };
    const onB = { x: 40, y: 20 };
    const onC = { x: 115, y: 5 };
    cam().setMulti(true);
    expect(cam().pick(onA, 1)).toBe(true);
    expect(selected()).toBe(a);
    cam().pick(onB, 1);
    cam().pick(onC, 1);
    expect(selected()).toEqual([a, b, c]);
    cam().pick(onB, 1);
    expect(selected()).toEqual([a, c]);
    // beside everything: nothing to pick
    expect(cam().pick({ x: 70, y: 70 }, 1)).toBe(false);
    expect(selected()).toEqual([a, c]);
    // inside a shape, a tap means the shape too
    cam().pick({ x: 40, y: 25 }, 1);
    expect(selected()).toEqual([a, b, c]);

    // without it, a finger on a part of the set takes the set; on another part it takes that alone
    cam().setMulti(false);
    cam().select([a, b]);
    expect(cam().pick(onA, 1, false)).toBe(true);
    expect(selected()).toEqual([a, b]);
    cam().pick(onC, 1, false);
    expect(selected()).toBe(c);
    // and nothing happens to the mode when the selection goes
    cam().setMulti(true);
    cam().select(null);
    expect(cam().multi).toBe(true);
    cam().close();
    expect(cam().multi).toBe(false);
  });
});

describe('aligning and distributing in the drawing', () => {
  beforeEach(scene);

  it('aligns the selection as one step of undo, keeps the selection and the program follows', () => {
    cam().select([a, b, c]);
    const before = program();
    const was = steps();
    cam().align('left');
    expect(boxes()).toEqual([
      [0, 0, 10, 10],
      [0, 20, 20, 30],
      [0, 5, 30, 45],
    ]);
    expect(steps()).toBe(was + 1);
    expect(selected()).toEqual([a, b, c]);
    expect(program()).not.toBe(before);
    cam().undo();
    expect(boxes()).toEqual([
      [0, 0, 10, 10],
      [30, 20, 50, 30],
      [100, 5, 130, 45],
    ]);
    expect(program()).toBe(before);
    expect(selected()).toEqual([a, b, c]);

    // The same again is no step: nothing moves
    cam().align('left');
    const aligned = steps();
    cam().align('left');
    expect(steps()).toBe(aligned);
    // Two in a row are two steps, never one
    cam().align('top');
    expect(steps()).toBe(aligned + 1);
    cam().align('bottom');
    expect(steps()).toBe(aligned + 2);
    // all at the top (45) first, then on the lowest bottom edge that was left: the big one's, 5
    expect(boxes().map((box) => box[1])).toEqual([5, 5, 5]);
    cam().undo();
    expect(boxes().map((box) => box[3])).toEqual([45, 45, 45]);
  });

  it('aligns by the middle lines', () => {
    cam().select([a, c]);
    cam().align('centre');
    // 0…130 has the middle 65: a (5) moves 60, c (115) moves −50
    expect(boxes()).toEqual([
      [60, 0, 70, 10],
      [30, 20, 50, 30],
      [50, 5, 80, 45],
    ]);
    cam().align('middle');
    // 0…45 has the middle 22.5: a (5) moves 17.5, c (25) moves −2.5
    expect(boxes()[0]).toEqual([60, 17.5, 70, 27.5]);
    expect(boxes()[2]).toEqual([50, 2.5, 80, 42.5]);
  });

  it('leaves what is not selected where it is, and does nothing with one unit or none', () => {
    cam().select([a, c]);
    cam().align('right');
    expect(boxes()[1]).toEqual([30, 20, 50, 30]);
    const was = steps();
    cam().select(a);
    cam().align('left');
    cam().distribute('h', 'gaps');
    cam().select(null);
    cam().align('top');
    cam().distribute('v', 'centres');
    expect(steps()).toBe(was);
  });

  it('spreads three units evenly: gaps or middles, the outer two staying', () => {
    cam().select([a, b, c]);
    cam().distribute('h', 'gaps');
    expect(boxes()[1]).toEqual([45, 20, 65, 30]);
    expect(boxes()[0]).toEqual([0, 0, 10, 10]);
    expect(boxes()[2]).toEqual([100, 5, 130, 45]);
    cam().undo();
    cam().distribute('h', 'centres');
    expect(boxes()[1]).toEqual([50, 20, 70, 30]);
    cam().undo();
    expect(boxes()[1]).toEqual([30, 20, 50, 30]);
    // two units: nothing to spread
    const was = steps();
    cam().select([a, b]);
    cam().distribute('h', 'gaps');
    expect(steps()).toBe(was);
  });

  it('moves a group as one rigid unit, and the things alone as units', () => {
    cam().add([rectangle(200, 0, 10, 10), rectangle(220, 0, 10, 10)]);
    const group = items()[3]!.group;
    expect(items()[4]!.group).toBe(group);
    cam().select([a, group]);
    cam().align('right');
    // 0…230: a moves 220; the group, already at the right, stays – both contours
    expect(boxes()[0]).toEqual([220, 0, 230, 10]);
    expect(boxes()[3]).toEqual([200, 0, 210, 10]);
    expect(boxes()[4]).toEqual([220, 0, 230, 10]);
    cam().undo();
    cam().align('left');
    // the group moves by −200 as a whole: the gap between its two contours stays
    expect(boxes()[3]).toEqual([0, 0, 10, 10]);
    expect(boxes()[4]).toEqual([20, 0, 30, 10]);
  });
});

describe('grouping', () => {
  beforeEach(scene);

  it('makes one group of several, selected – and the program stays the same', () => {
    cam().select([a, b]);
    const before = program();
    const was = steps();
    cam().group();
    expect(steps()).toBe(was + 1);
    const g = items()[0]!.group;
    expect(g).toBeGreaterThan(c);
    expect(items().map((i) => i.group)).toEqual([g, g, c]);
    expect(selected()).toBe(g);
    expect(program()).toBe(before);
    expect(cam().ahead).toBe(false);
    // it is one unit now: picked, moved, aligned together
    cam().select([g, c]);
    cam().align('left');
    expect(boxes()).toEqual([
      [0, 0, 10, 10],
      [30, 20, 50, 30],
      [0, 5, 30, 45],
    ]);
    cam().undo();
    cam().undo();
    expect(items().map((i) => i.group)).toEqual([a, b, c]);
    expect(selected()).toEqual([a, b]);
    cam().redo();
    expect(items().map((i) => i.group)).toEqual([g, g, c]);
  });

  it('needs two units', () => {
    const was = steps();
    cam().group();
    cam().select(a);
    cam().group();
    cam().select(null);
    expect(steps()).toBe(was);
    expect(items().map((i) => i.group)).toEqual([a, b, c]);
    // two contours of one group are one unit: nothing to join
    cam().add([rectangle(200, 0, 10, 10), rectangle(220, 0, 10, 10)]);
    const group = items()[3]!.group;
    const after = steps();
    cam().select(group);
    cam().group();
    expect(steps()).toBe(after);
  });

  it('takes a group apart into a group per contour, which makes single contours pickable', () => {
    cam().add([rectangle(200, 0, 10, 10), rectangle(220, 0, 10, 10), circle(250, 5, 6)]);
    const file = items()[3]!.group;
    expect(
      items()
        .slice(3)
        .map((i) => i.group),
    ).toEqual([file, file, file]);
    // the file as one group: a finger on any contour takes all of them
    cam().pick({ x: 225, y: 0 }, 1, false);
    expect(selected()).toBe(file);
    const before = program();
    const was = steps();
    cam().ungroup();
    expect(steps()).toBe(was + 1);
    const fresh = items()
      .slice(3)
      .map((i) => i.group);
    expect(new Set(fresh).size).toBe(3);
    expect(fresh.every((g) => g > file)).toBe(true);
    expect(selected()).toEqual(fresh);
    expect(program()).toBe(before);
    // now a contour alone can be picked and moved
    cam().pick({ x: 225, y: 0 }, 1, false);
    expect(selected()).toEqual(fresh);
    cam().select(null);
    cam().pick({ x: 225, y: 0 }, 1, false);
    expect(selected()).toBe(fresh[1]);
    cam().nudge(0, 40);
    expect(boxes()[3]).toEqual([200, 0, 210, 10]);
    expect(boxes()[4]).toEqual([220, 40, 230, 50]);
    cam().undo();
    cam().undo();
    expect(
      items()
        .slice(3)
        .map((i) => i.group),
    ).toEqual([file, file, file]);
    expect(selected()).toBe(file);
  });

  it('has nothing to take apart in single things', () => {
    const was = steps();
    cam().select([a, b]);
    cam().ungroup();
    cam().select(null);
    cam().ungroup();
    expect(steps()).toBe(was);
    expect(items().map((i) => i.group)).toEqual([a, b, c]);
  });

  it('puts the copies of a selection of several groups in a selection of their own', () => {
    cam().select([a, b]);
    cam().duplicate();
    const copies = items().slice(3);
    expect(copies).toHaveLength(2);
    expect(copies[0]!.group).not.toBe(copies[1]!.group);
    expect(selected()).toEqual(copies.map((i) => i.group));
    // pasted the same way
    cam().select([b, c]);
    cam().copy();
    cam().paste();
    const pasted = items().slice(5);
    expect(selected()).toEqual(pasted.map((i) => i.group));
    expect(pasted).toHaveLength(2);
    // an array of one group stays on the original, of several it selects the copies
    cam().select(a);
    cam().array(2, 1, 5);
    expect(selected()).toBe(a);
    cam().select([a, b]);
    const count = items().length;
    cam().array(2, 1, 5);
    expect(items().length).toBe(count + 2);
    expect(selected()).toEqual(
      items()
        .slice(count)
        .map((i) => i.group),
    );
    // a hole alone has nothing to copy
    expect(cam().project!.twoSided).toBeNull();
  });
});

describe('the registration holes of a two-sided part', () => {
  beforeEach(() => {
    scene();
    cam().setTwoSided({});
  });

  const holeGroups = () =>
    items()
      .filter((i) => i.registration !== undefined)
      .map((i) => i.group);

  it('are never one of several, never a unit and never moved by arranging', () => {
    expect(holes()).toEqual([
      { n: 1, x: -15, y: 22.5 },
      { n: 2, x: 145, y: 22.5 },
    ]);
    const [h1, h2] = holeGroups() as [number, number];
    // a hole is selected alone
    cam().toggleSelect(a);
    cam().toggleSelect(h1);
    expect(selected()).toBe(h1);
    cam().toggleSelect(b);
    expect(selected()).toBe(b);
    // "everything" has them; the set made from it has not
    cam().selectAll();
    cam().toggleSelect(c);
    expect(selected()).toEqual([a, b]);
    cam().selectAll();
    cam().invertSelection();
    expect(selected()).toBeNull();
    cam().select(h2);
    cam().invertSelection();
    expect(selected()).toEqual([a, b, c]);
    // a hole alone: no units, so nothing to align, group or take apart; and nothing to copy
    cam().select(h1);
    const was = steps();
    cam().align('left');
    cam().group();
    cam().ungroup();
    cam().duplicate();
    expect(steps()).toBe(was);
    expect(items()).toHaveLength(5);
  });

  it('follow the parts after an alignment while they follow the drawing', () => {
    cam().select([a, b, c]);
    cam().align('left');
    // the parts now lie in 0…30 × 0…45: the holes are proposed anew, level with its middle
    expect(boxes().slice(0, 3)).toEqual([
      [0, 0, 10, 10],
      [0, 20, 20, 30],
      [0, 5, 30, 45],
    ]);
    expect(holes()).toEqual([
      { n: 1, x: -15, y: 22.5 },
      { n: 2, x: 45, y: 22.5 },
    ]);
    expect(partsOf(items())).toHaveLength(3);
    expect(cam().project!.twoSided!.autoHoles).toBe(true);
    // one step takes the holes back with the parts
    cam().undo();
    expect(holes()[1]).toEqual({ n: 2, x: 145, y: 22.5 });
  });

  it('stay where a finger put them, whatever the parts do', () => {
    const [h1] = holeGroups() as [number, number];
    cam().select(h1);
    cam().nudge(-4, 0);
    expect(cam().project!.twoSided!.autoHoles).toBe(false);
    expect(holes()).toEqual([
      { n: 1, x: -19, y: 22.5 },
      { n: 2, x: 145, y: 22.5 },
    ]);
    cam().select([a, b, c]);
    cam().align('left');
    expect(holes()).toEqual([
      { n: 1, x: -19, y: 22.5 },
      { n: 2, x: 145, y: 22.5 },
    ]);
    cam().group();
    expect(holes()).toEqual([
      { n: 1, x: -19, y: 22.5 },
      { n: 2, x: 145, y: 22.5 },
    ]);
    // put back beside the parts on request
    cam().proposeHoles();
    expect(holes()).toEqual([
      { n: 1, x: -15, y: 22.5 },
      { n: 2, x: 45, y: 22.5 },
    ]);
  });

  it('moves a hole selected with a part by its own alignment: only one hole is ever taken alone', () => {
    const [h1] = holeGroups() as [number, number];
    // both holes in a selection (everything): they move together, nothing to line up
    cam().selectAll();
    cam().nudge(0, 5);
    expect(holes().map((h) => h.y)).toEqual([27.5, 27.5]);
    // one hole alone is lined up with the other
    cam().select(h1);
    cam().nudge(3, 7);
    expect(holes()[0]!.y).toBe(holes()[1]!.y);
    expect(holes()[0]!.x).toBe(-12);
  });
});
