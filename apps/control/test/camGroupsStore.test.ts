import { rectangle, circle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { tabDefaultsOf } from '../src/lib/camGroups';
import { drawnTabMarks, planCutters } from '../src/lib/camTools';
import { itemOperation } from '../src/store/cam';
import { useWorkshop } from '../src/store/workshop';
import { cam, changes, items, program, resetTools, scene, VBIT } from './camToolsFixtures';

/** The deepest Z of a program, mm (negative) */
const deepest = (text = program()) =>
  Math.min(...[...text.matchAll(/\bZ(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])));

let plate = 0;
let text = 0;
/** A plate (outside, 40 × 30, tabs) and a text "Hi" (engraved): the two parts every case starts from */
function drawing() {
  scene();
  cam().add([rectangle(0, 0, 40, 30)]);
  cam().addText('Hi', { height: 8 });
  [plate, text] = items().map((i) => i.id) as [number, number];
  cam().select(null);
}
const item = (id: number) => items().find((i) => i.id === id)!;
const colors = () => cam().project!.colors;
const steps = () => cam().past.length;
const notes = () => cam().toolNotes.map((n) => n.code);

describe('giving parts a colour', () => {
  beforeEach(drawing);

  it('is one step for the whole selection – every part of the groups selected – and nothing where it is so already', () => {
    cam().selectAll();
    const before = steps();
    cam().setColor('a');
    expect(items().map((i) => i.color)).toEqual(['a', 'a']);
    expect(steps()).toBe(before + 1);
    const same = items();
    cam().setColor('a');
    // nothing to do: no step, and the very same parts
    expect(steps()).toBe(before + 1);
    expect(items()).toBe(same);
    cam().setColor('b');
    expect(items().map((i) => i.color)).toEqual(['b', 'b']);
    expect(steps()).toBe(before + 2);
    // taken away: the key is off the part, not `undefined`
    cam().setColor(null);
    expect(items().some((i) => 'color' in i)).toBe(false);
    cam().setColor(null);
    expect(steps()).toBe(before + 3);
  });

  it('can name the parts instead of taking the selection, and leaves the others as they are', () => {
    cam().setColor('c', [text]);
    expect(item(text).color).toBe('c');
    expect(item(plate).color).toBeUndefined();
    cam().setColor('d', [text, plate, 9999]);
    expect(items().map((i) => i.color)).toEqual(['d', 'd']);
    // nothing selected and nothing named: nothing happens
    cam().select(null);
    const before = steps();
    cam().setColor('a');
    expect(steps()).toBe(before);
    expect(items().map((i) => i.color)).toEqual(['d', 'd']);
  });

  it('is its own step each time, like the eye: two in a row are two steps, each brought back by one undo', () => {
    cam().setColor('a', [plate]);
    cam().setColor('b', [plate]);
    expect(item(plate).color).toBe('b');
    cam().undo();
    expect(item(plate).color).toBe('a');
    cam().undo();
    expect(item(plate).color).toBeUndefined();
    cam().redo();
    cam().redo();
    expect(item(plate).color).toBe('b');
  });

  it('is nothing of the drawing’s geometry: moving, turning and the order of the list stay as they were', () => {
    const before = items().map((i) => ({ id: i.id, p: i.placement, c: i.contours }));
    cam().selectAll();
    cam().setColor('a');
    expect(items().map((i) => ({ id: i.id, p: i.placement, c: i.contours }))).toEqual(before);
  });

  it('a new part gets none – not the colour of the selection – and what is drawn after goes on as ever', () => {
    cam().setColor('a', [plate]);
    cam().select(item(plate).group);
    cam().addSketch({ type: 'circle', d: 10 });
    const made = items().at(-1)!;
    expect(made.id).not.toBe(plate);
    expect(made.color).toBeUndefined();
    expect(item(plate).color).toBe('a');
  });

  it('a copy carries the colour: duplicate, array and paste', () => {
    cam().setColor('b', [plate]);
    cam().select(item(plate).group);
    cam().duplicate();
    expect(items().filter((i) => i.color === 'b')).toHaveLength(2);
    cam().array(2, 1, 5);
    expect(items().filter((i) => i.color === 'b').length).toBeGreaterThanOrEqual(3);
    const count = items().length;
    cam().select(item(plate).group);
    cam().copy();
    cam().paste();
    expect(items()).toHaveLength(count + 1);
    expect(items().at(-1)!.color).toBe('b');
    // (the copy is no part with a place of its own among the cuts – that rule of the order is untouched)
    expect(items().at(-1)!.seq).toBeUndefined();
  });

  it('grouping and taking a group apart change no colour', () => {
    cam().setColor('a', [plate]);
    cam().setColor('c', [text]);
    cam().selectAll();
    cam().group();
    expect(items().map((i) => i.color)).toEqual(['a', 'c']);
    expect(new Set(items().map((i) => i.group)).size).toBe(1);
    cam().ungroup();
    expect(items().map((i) => i.color)).toEqual(['a', 'c']);
    expect(colors()).toBeUndefined();
  });

  it('is refused for a registration hole: "everything" of a two-sided drawing colours the parts alone', () => {
    cam().setTwoSided({ thickness: 12 });
    cam().setItem(text, { side: 'back' });
    const holes = items().filter((i) => i.registration !== undefined);
    expect(holes).toHaveLength(2);
    cam().selectAll();
    cam().setColor('a');
    expect(items().filter((i) => i.registration !== undefined && i.color !== undefined)).toEqual(
      [],
    );
    expect(items().filter((i) => i.color === 'a')).toHaveLength(2);
    // named by id, a hole is left alone – and nothing is remembered for it
    const before = steps();
    cam().setColor(
      'b',
      holes.map((h) => h.id),
    );
    expect(steps()).toBe(before);
    expect(items().some((i) => i.registration !== undefined && i.color !== undefined)).toBe(false);
  });

  it('a hidden part keeps its colour and is still counted: the colour is not unused while a part is only out of sight', () => {
    cam().setColor('a', [plate, text]);
    cam().setColorValue('a', { depth: 3 });
    cam().setHidden(plate, true);
    expect(item(plate).color).toBe('a');
    expect(colors()).toEqual({ a: { depth: 3 } });
    cam().setHidden(plate, false);
    expect(item(plate).color).toBe('a');
    // (a part that is hidden stays in the table's count: the colour is not "unused" while it is only out of sight)
    cam().setHidden(plate, true);
    cam().setHidden(text, true);
    expect(colors()).toEqual({ a: { depth: 3 } });
  });
});

describe('what a colour sets reaches the program', () => {
  beforeEach(drawing);

  it('a colour with no values changes nothing: the program is the one of a drawing without colours, byte for byte', () => {
    // a richer drawing: an outline with a cut-out and two drilled holes in it, a pocket and an engraving – the kinds of
    // cut a colour may meet (the holes are as wide as the 6 mm cutter: smaller ones are not cut at all)
    cam().add([rectangle(60, 0, 40, 30)]);
    cam().add([circle(10, 10, 6)]);
    cam().add([circle(30, 20, 6)]);
    cam().add([circle(20, 10, 12)]);
    cam().setItem(items()[2]!.id, { kind: 'pocket' });
    expect(items().map((i) => i.kind)).toEqual([
      'outside',
      'on',
      'pocket',
      'drill',
      'drill',
      'inside',
    ]);
    // …and every part of it is cut: the byte-for-byte check would hold for a program that leaves a part out
    expect(cam().problems).toEqual([]);
    const none = program();
    const ops = items().map((i) => itemOperation(i, cam().settings, 0));
    expect(none).not.toBe('');
    const ids = items().map((i) => i.id);
    ids.forEach((id, k) => cam().setColor('abcd'[k % 4] as 'a', [id]));
    expect(items().every((i) => i.color !== undefined)).toBe(true);
    expect(colors()).toBeUndefined();
    expect(program()).toBe(none);
    // …also for the operation each part hands the library
    expect(items().map((i) => itemOperation(i, cam().settings, 0, colors()))).toEqual(ops);
    // a value set and taken away again is the same
    cam().setColorValue('a', { depth: 3, tabs: { count: 2 } });
    expect(program()).not.toBe(none);
    cam().setColorValue('a', { depth: undefined, tabs: { count: undefined } });
    expect(colors()).toBeUndefined();
    expect(program()).toBe(none);
  });

  it('a depth of the colour is the Z the parts are cut to – and a part with a depth of its own keeps it', () => {
    expect(deepest()).toBe(-6);
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 3 });
    expect(deepest()).toBe(-3);
    // a part of the colour with its own depth: that
    cam().setItem(plate, { depth: 4 });
    expect(deepest()).toBe(-4);
    // …and taking its own away brings the colour's back
    cam().setItem(plate, { depth: undefined });
    expect(deepest()).toBe(-3);
    // the colour is what the program says: the same as the part saying it itself
    const viaColor = program();
    cam().setColor(null, [plate]);
    expect(deepest()).toBe(-6);
    cam().setItem(plate, { depth: 3 });
    expect(program()).toBe(viaColor);
  });

  it('the engraving depth of a colour is for the engraved parts, the depth for the cuts', () => {
    // the engraving alone: 1 mm (the drawing's)
    cam().setHidden(plate, true);
    expect(deepest()).toBe(-1);
    cam().setColor('a', [text]);
    // a colour's depth does not reach an engraving …
    cam().setColorValue('a', { depth: 3 });
    expect(deepest()).toBe(-1);
    // … its engraving depth does
    cam().setColorValue('a', { engraveDepth: 0.5 });
    expect(deepest()).toBe(-0.5);
    cam().setColorValue('a', { engraveDepth: undefined });
    expect(deepest()).toBe(-1);
  });

  it('the direction of a colour is a part saying it: the same program', () => {
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { climb: false });
    const viaColor = program();
    cam().setColor(null, [plate]);
    const climbing = program();
    expect(viaColor).not.toBe(climbing);
    cam().setItem(plate, { climb: false });
    expect(program()).toBe(viaColor);
    // the part's own direction goes over its colour's
    cam().setItem(plate, { climb: true });
    cam().setColor('a', [plate]);
    expect(program()).toBe(climbing);
  });

  it('the tab defaults of a colour: its parts get them, a part’s own spec still wins value by value', () => {
    const marks = () =>
      drawnTabMarks(
        items(),
        (i) => tabDefaultsOf(i, colors(), cam().settings.tabs),
        planCutters(
          items(),
          cam().settings,
          useWorkshop.getState().tools,
          useWorkshop.getState().settings.spindle,
          colors(),
        ),
      ).filter((m) => m.item === plate);
    expect(marks()).toHaveLength(4);
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { tabs: { count: 2, width: 9 } });
    expect(marks()).toHaveLength(2);
    expect(marks().every((m) => m.w === 9)).toBe(true);
    // what is drawn is what is cut: the program is the one the part's own spec of the same values makes
    const viaColor = program();
    cam().setColor(null, [plate]);
    expect(program()).not.toBe(viaColor);
    cam().setTabs(plate, { count: 2, width: 9 });
    expect(program()).toBe(viaColor);
    // the part's own count goes over the colour's, its width stays the colour's
    cam().setTabs(plate, { count: undefined, width: undefined });
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { tabs: { count: 2, width: 9 } });
    cam().setTabs(plate, { count: 3 });
    expect(marks()).toHaveLength(3);
    expect(marks().every((m) => m.w === 9)).toBe(true);
    // a manual placing starts from the places the cut lifts at – the colour's
    cam().setTabs(plate, { count: undefined });
    expect(cam().manualTabs(plate)).toBe(true);
    expect(item(plate).tabSpec?.at).toHaveLength(2);
  });

  it('a count of 0 for the colour leaves its parts without a tab on the table', () => {
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { tabs: { count: 0 } });
    expect(marksOf(plate)).toBe(0);
  });

  it('the cutter of a colour is the cutter of its parts: the same program as a part naming it', () => {
    cam().setColor('a', [text]);
    cam().setColorValue('a', { toolId: 'v1' });
    expect(changes()).toHaveLength(2);
    const viaColor = program();
    cam().setColor(null, [text]);
    expect(changes()).toEqual([]);
    cam().setItem(text, { toolId: 'v1' });
    expect(program()).toBe(viaColor);
  });

  it('the part’s own cutter goes over its colour’s – and its own can be the drawing’s', () => {
    cam().setColor('a', [text]);
    cam().setColorValue('a', { toolId: 'v1' });
    expect(changes()).toHaveLength(2);
    cam().setItem(text, { toolId: 't3' });
    expect(changes()).toEqual([]);
    cam().setItem(text, { toolId: undefined });
    expect(changes()).toHaveLength(2);
  });

  it('a V-bit chosen for a colour cuts only what it can: an outline of that colour is cut with the drawing’s cutter and says so', () => {
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { toolId: 'v1' });
    expect(notes()).toEqual(['kind']);
    expect(changes()).toEqual([]);
    // the part is cut with the drawing's cutter: the program is the one without a colour
    const noted = program();
    cam().setColor(null, [plate]);
    expect(program()).toBe(noted);
  });

  it('a cutter of the colour that is gone from the list: said, the parts are cut with the drawing’s – and again with it back', () => {
    cam().setColor('a', [text]);
    cam().setColorValue('a', { toolId: 'v1' });
    const withBit = program();
    useWorkshop.getState().removeTool('v1');
    expect(notes()).toEqual(['missing']);
    expect(changes()).toEqual([]);
    useWorkshop.getState().saveTool(VBIT);
    expect(notes()).toEqual([]);
    expect(program()).toBe(withBit);
    resetTools();
  });

  it('an edit of the colour’s cutter in the tool list makes the program anew (its T number is in it)', () => {
    cam().setColor('a', [text]);
    cam().setColorValue('a', { toolId: 'v1' });
    expect(changes()).toEqual(['T4 M6', 'T3 M6']);
    useWorkshop.getState().saveTool({ ...VBIT, number: 8 });
    expect(changes()).toEqual(['T8 M6', 'T3 M6']);
    resetTools();
  });
});

/** How many tab marks a part has on the table right now */
function marksOf(id: number): number {
  return drawnTabMarks(
    items(),
    (i) => tabDefaultsOf(i, colors(), cam().settings.tabs),
    planCutters(
      items(),
      cam().settings,
      useWorkshop.getState().tools,
      useWorkshop.getState().settings.spindle,
      colors(),
    ),
  ).filter((m) => m.item === id).length;
}

describe('the table of colours is part of the drawing’s steps', () => {
  beforeEach(drawing);

  it('a value edit is a step, and going back brings the table back – also past the first edit, where there was none', () => {
    cam().setColor('a', [plate]);
    expect(colors()).toBeUndefined();
    cam().setColorValue('a', { depth: 3 });
    expect(colors()).toEqual({ a: { depth: 3 } });
    expect(deepest()).toBe(-3);
    cam().undo();
    // the table is replaced, never overlaid: not even an empty entry is left
    expect(colors()).toBeUndefined();
    expect('colors' in cam().project!).toBe(false);
    expect(deepest()).toBe(-6);
    expect(item(plate).color).toBe('a');
    cam().redo();
    expect(colors()).toEqual({ a: { depth: 3 } });
    expect(deepest()).toBe(-3);
    // and the step of the colour itself takes its values with it, whichever way it goes
    cam().undo();
    cam().undo();
    expect(item(plate).color).toBeUndefined();
    cam().redo();
    cam().redo();
    expect(colors()).toEqual({ a: { depth: 3 } });
  });

  it('a number being typed is one step with the next of the same value; another value is another step', () => {
    cam().setColor('a', [plate]);
    const before = steps();
    cam().setColorValue('a', { depth: 3 });
    cam().setColorValue('a', { depth: 3.5 });
    cam().setColorValue('a', { depth: 4 });
    expect(steps()).toBe(before + 1);
    cam().setColorValue('a', { engraveDepth: 0.4 });
    expect(steps()).toBe(before + 2);
    cam().setColorValue('a', { tabs: { count: 2 } });
    cam().setColorValue('a', { tabs: { count: 3 } });
    expect(steps()).toBe(before + 3);
    cam().setColorValue('a', { tabs: { width: 7 } });
    expect(steps()).toBe(before + 4);
    cam().undo();
    expect(colors()).toEqual({ a: { depth: 4, engraveDepth: 0.4, tabs: { count: 3 } } });
    cam().undo();
    cam().undo();
    expect(colors()).toEqual({ a: { depth: 4 } });
    cam().undo();
    expect(colors()).toBeUndefined();
  });

  it('a value that is there already, and one for a colour no part carries, are nothing: no step, no table', () => {
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 3 });
    const before = steps();
    const table = colors();
    cam().setColorValue('a', { depth: 3 });
    cam().setColorValue('a', { engraveDepth: undefined });
    cam().setColorValue('b', { depth: 2 });
    expect(steps()).toBe(before);
    expect(colors()).toBe(table);
  });

  it('numbers are brought into their ranges', () => {
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 9999, tabs: { count: 2.6, height: 0 } });
    expect(colors()).toEqual({ a: { depth: 500, tabs: { count: 3, height: 0.1 } } });
  });

  it('a colour no part carries has no values: the last part leaving it – taken away, removed, deleted – takes them', () => {
    cam().setColor('a', [plate, text]);
    cam().setColorValue('a', { depth: 3 });
    // one part leaves: the other still has the colour, and so its values
    cam().setColor(null, [plate]);
    expect(colors()).toEqual({ a: { depth: 3 } });
    // the last one leaves: the values go
    cam().setColor(null, [text]);
    expect(colors()).toBeUndefined();
    cam().undo();
    expect(colors()).toEqual({ a: { depth: 3 } });
    expect(item(text).color).toBe('a');
    // removing the last part of the colour
    cam().removeItem(text);
    expect(colors()).toBeUndefined();
    cam().undo();
    expect(colors()).toEqual({ a: { depth: 3 } });
    // another colour for the last one
    cam().setColor('b', [text]);
    expect(colors()).toBeUndefined();
    // …and a colour that a part is given again starts without values: it changes nothing
    cam().setColor('a', [text]);
    expect(colors()).toBeUndefined();
    expect(deepest()).toBe(-6);
  });

  it('emptying the drawing takes the colours with its parts; undo brings the parts and the colours back', () => {
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 3 });
    cam().clear();
    expect(items()).toEqual([]);
    expect(colors()).toBeUndefined();
    // a part drawn now starts with none, and no value waits for it
    cam().addSketch({ type: 'rect', w: 20, h: 20, r: 0 });
    expect(items().at(-1)!.color).toBeUndefined();
    cam().undo();
    cam().undo();
    expect(items()).toHaveLength(2);
    expect(item(plate).color).toBe('a');
    expect(colors()).toEqual({ a: { depth: 3 } });
    expect(deepest()).toBe(-3);
  });

  it('closing the drawing forgets the colours', () => {
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 3 });
    cam().close();
    cam().open();
    expect(cam().project?.colors).toBeUndefined();
  });
});
