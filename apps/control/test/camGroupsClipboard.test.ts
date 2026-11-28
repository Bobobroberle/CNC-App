import { rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { cam, items, scene } from './camToolsFixtures';

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
const saved = () => JSON.parse(cam().saveProject()!);

/** The plate is colour A with a depth and a direction; it is copied */
function copyColoured() {
  cam().setColor('a', [plate]);
  cam().setColorValue('a', { depth: 3, climb: false });
  cam().select(item(plate).group);
  cam().copy();
}

describe('a pasted part brings what its colour sets', () => {
  beforeEach(drawing);

  it('in the same drawing nothing changes in the table: the colour is the one it was', () => {
    copyColoured();
    const table = colors();
    cam().paste();
    expect(items().at(-1)!.color).toBe('a');
    expect(colors()).toEqual({ a: { depth: 3, climb: false } });
    expect(colors()).toBe(table);
  });

  it('in the same drawing after the original is gone: the colour comes back with the copy', () => {
    copyColoured();
    cam().select(item(plate).group);
    cam().removeSelection();
    // no part carries A any more: its values went with it
    expect(colors()).toBeUndefined();
    cam().paste();
    expect(items().some((i) => i.color === 'a')).toBe(true);
    expect(colors()).toEqual({ a: { depth: 3, climb: false } });
  });

  it('in another drawing that has no such colour: its values come along – the copy is cut as it was, and the file says version 2 with them', () => {
    copyColoured();
    // another drawing: nothing in its table
    drawing();
    expect(colors()).toBeUndefined();
    cam().paste();
    const pasted = items().at(-1)!;
    expect(pasted.color).toBe('a');
    expect(colors()).toEqual({ a: { depth: 3, climb: false } });
    const file = saved();
    expect(file.version).toBe(2);
    expect(file.colors).toEqual({ a: { depth: 3, climb: false } });
  });

  it('in another drawing where the letter is defined: the drawing’s own definition wins, nothing is overlaid', () => {
    copyColoured();
    drawing();
    cam().setColor('a', [text]);
    cam().setColorValue('a', { depth: 9, tabs: { count: 2 } });
    const mine = colors();
    cam().paste();
    expect(items().at(-1)!.color).toBe('a');
    // the target keeps A as it is: depth 9, its tabs, and the pasted copy's direction does not come in
    expect(colors()).toEqual({ a: { depth: 9, tabs: { count: 2 } } });
    expect(colors()).toBe(mine);
  });

  it('brings only the colours the pasted parts carry, and only those the drawing lacks', () => {
    // plate A (depth 3), text B (engraving depth 0.4): copy both, paste into a drawing that has B of its own
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 3 });
    cam().setColor('b', [text]);
    cam().setColorValue('b', { engraveDepth: 0.4 });
    cam().selectAll();
    cam().copy();
    drawing();
    cam().setColor('b', [text]);
    cam().setColorValue('b', { engraveDepth: 0.8 });
    cam().paste();
    expect(colors()).toEqual({ a: { depth: 3 }, b: { engraveDepth: 0.8 } });
    // a colour the copied parts do not carry never comes: copy only the text (B) now
    drawing();
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 3 });
    cam().setColor('b', [text]);
    cam().setColorValue('b', { engraveDepth: 0.4 });
    cam().select(item(text).group);
    cam().copy();
    drawing();
    cam().paste();
    expect(colors()).toEqual({ b: { engraveDepth: 0.4 } });
  });

  it('is one step of undo: the part and the colours it brought go together', () => {
    copyColoured();
    drawing();
    const before = steps();
    const count = items().length;
    cam().paste();
    expect(steps()).toBe(before + 1);
    expect(colors()).toEqual({ a: { depth: 3, climb: false } });
    cam().undo();
    expect(items()).toHaveLength(count);
    expect(colors()).toBeUndefined();
    cam().redo();
    expect(items()).toHaveLength(count + 1);
    expect(colors()).toEqual({ a: { depth: 3, climb: false } });
  });

  it('a colour that sets nothing brings nothing: the copy carries the letter, the table stays empty', () => {
    cam().setColor('c', [plate]);
    cam().select(item(plate).group);
    cam().copy();
    drawing();
    cam().paste();
    expect(items().at(-1)!.color).toBe('c');
    expect(colors()).toBeUndefined();
  });
});
