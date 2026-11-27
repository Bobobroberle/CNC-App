import { rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { blocksFlip } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { seriesMotif, seriesOwnToolRows, useSeries } from '../src/store/series';
import { cam, items, program, scene } from './camToolsFixtures';

const notes = () => cam().flipNotes.map((n) => n.code);
const plan = () => useFlip.getState().plan;

describe('what the two sides are checked against is what is cut: the depth of a colour', () => {
  let front = 0;
  let back = 0;
  /** The same 40 × 30 pocket from the front and from the back, in a board 10 mm thick, 3 mm deep each (the drawing's) */
  function pockets() {
    scene();
    cam().setSettings({ depth: 3 });
    cam().add([rectangle(0, 0, 40, 30)]);
    cam().add([rectangle(0, 0, 40, 30)]);
    [front, back] = items().map((i) => i.id) as [number, number];
    for (const id of [front, back]) cam().setItem(id, { kind: 'pocket' });
    cam().setTwoSided({ thickness: 10 });
    cam().setItem(back, { side: 'back' });
    cam().select(null);
  }
  beforeEach(pockets);

  it('the premise: 3 and 3 mm in a board of 10 leave 4 mm – no note about the two sides', () => {
    expect(plan()).not.toBeNull();
    expect(notes()).toEqual([]);
  });

  it('a colour that makes both 5 mm deep makes them meet: the note is there, and it is the very check of the depths cut', () => {
    cam().setColor('a', [front, back]);
    expect(notes()).toEqual([]);
    cam().setColorValue('a', { depth: 5 });
    expect(notes()).toContain('meet');
    // 5 + 5 = 10: nothing left between them
    const note = cam().flipNotes.find((n) => n.code === 'meet')!;
    expect(note).toMatchObject({ front: 0, back: 1 });
    expect('left' in note && note.left).toBe(0);
    // taking the colour back brings the check back to 4 mm left
    cam().setColor(null, [front, back]);
    expect(notes()).toEqual([]);
  });

  it('a colour on the back only: 3 and 7 mm leave nothing (3 + 7 = 10) – and the part’s own depth goes over the colour’s', () => {
    cam().setColor('b', [back]);
    cam().setColorValue('b', { depth: 7 });
    expect(notes()).toContain('meet');
    cam().setItem(back, { depth: 3 });
    expect(notes()).toEqual([]);
    cam().setItem(back, { depth: undefined });
    expect(notes()).toContain('meet');
  });

  it('the depth of an engraving: a colour’s engraving depth is the one that is checked for an engraved part', () => {
    cam().setItem(front, { kind: 'on' });
    cam().setItem(back, { kind: 'on' });
    expect(notes()).toEqual([]);
    cam().setColor('c', [front, back]);
    // (an engraving of the colour that is deep enough to meet the other one)
    cam().setColorValue('c', { engraveDepth: 5 });
    expect(notes()).toContain('meet');
    // its depth for cuts does not reach an engraving
    cam().setColorValue('c', { engraveDepth: undefined, depth: 5 });
    expect(notes()).toEqual([]);
  });

  it('a part cut free without tabs is "loose": the tabs of its colour decide whether it has any', () => {
    // (the front is cut through – its depth is the board's – and the back is used: the two sides are checked)
    cam().setItem(front, { kind: 'outside', depth: 10 });
    expect(notes()).not.toContain('loose');
    // the same part with a colour that sets no tab by default: held by nothing
    cam().setColor('d', [front]);
    cam().setColorValue('d', { tabs: { count: 0 } });
    expect(notes()).toContain('loose');
    cam().setColorValue('d', { tabs: { count: 3 } });
    expect(notes()).not.toContain('loose');
  });
});

describe('a cutter of a colour is another cutter: a two-sided job and a series refuse it', () => {
  let plate = 0;
  let text = 0;
  beforeEach(() => {
    scene();
    cam().add([rectangle(0, 0, 60, 40)]);
    cam().addText('Hi', { height: 8 });
    [plate, text] = items().map((i) => i.id) as [number, number];
    cam().select(null);
  });

  it('a two-sided job: the colour with a V-bit on the text blocks it, naming the part; taken back it is there again', () => {
    cam().setTwoSided({ thickness: 12 });
    cam().setItem(text, { side: 'back' });
    expect(plan()).not.toBeNull();
    cam().setColor('a', [text]);
    cam().setColorValue('a', { toolId: 'v1' });
    expect(cam().flipNotes).toEqual([{ code: 'tools', rows: [1] }]);
    expect(blocksFlip(cam().flipNotes[0]!)).toBe(true);
    expect(plan()).toBeNull();
    expect(program()).toBe('');
    cam().setColorValue('a', { toolId: undefined });
    expect(notes()).not.toContain('tools');
    expect(plan()).not.toBeNull();
  });

  it('the two-sided state switched on while a colour’s cutter is in use: the same, whichever comes first', () => {
    cam().setColor('a', [text]);
    cam().setColorValue('a', { toolId: 'v1' });
    cam().setTwoSided({ thickness: 12 });
    expect(cam().flipNotes).toEqual([{ code: 'tools', rows: [1] }]);
    expect(useJob.getState().fileName).toBeNull();
    cam().setTwoSided(null);
    expect(cam().flipNotes).toEqual([]);
    expect(program()).toContain('T4 M6');
  });

  it('a series: the parts of such a colour are named, and it does not begin', () => {
    expect(seriesOwnToolRows()).toEqual([]);
    cam().setColor('a', [text]);
    cam().setColorValue('a', { toolId: 'v1' });
    expect(seriesOwnToolRows()).toEqual([1]);
    cam().setItem(plate, { kind: 'none' });
    useSeries.getState().begin();
    expect(useSeries.getState().open).toBe(false);
    // the part's own choice of the drawing's cutter takes it out of the colour: nothing of its own any more
    cam().setItem(text, { toolId: 't3' });
    expect(seriesOwnToolRows()).toEqual([]);
    useSeries.getState().begin();
    expect(useSeries.getState().open).toBe(true);
    useSeries.setState({ open: false });
  });

  it('makes no program with one either, whoever asks (the flow open, the colour given meanwhile)', () => {
    useMachine.setState({
      status: { state: 'Idle', mpos: [0, 0, 0], wco: [100, 100, 0] } as never,
    });
    useSeries.setState({
      open: true,
      blanks: [
        {
          id: 0,
          kind: 'rect',
          x: 300,
          y: 300,
          length: 100,
          width: 80,
          angle: 0,
          outline: [
            { x: 250, y: 260 },
            { x: 350, y: 260 },
            { x: 350, y: 340 },
            { x: 250, y: 340 },
          ],
          measured: false,
        },
      ],
    });
    cam().setColor('a', [text]);
    cam().setColorValue('a', { toolId: 'v1' });
    const before = useJob.getState().lines;
    expect(useSeries.getState().make()).toBe(false);
    expect(useJob.getState().lines).toBe(before);
    useSeries.setState({ open: false, blanks: [], made: null });
    useMachine.setState({ status: null });
  });
});

describe('a series carries what a colour sets: its depth and its direction are in the motif', () => {
  let plate = 0;
  let text = 0;
  beforeEach(() => {
    scene();
    cam().add([rectangle(0, 0, 60, 40)]);
    cam().addText('Hi', { height: 8 });
    [plate, text] = items().map((i) => i.id) as [number, number];
    cam().select(null);
  });

  it('is the motif of a drawing without colours, exactly, while no colour sets anything', () => {
    const before = seriesMotif();
    cam().setColor('a', [plate]);
    cam().setColor('b', [text]);
    expect(seriesMotif()).toEqual(before);
  });

  it('the depth, the direction and the tabs of the colour go with every part of it', () => {
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 3, climb: false, tabs: { count: 2, width: 9 } });
    cam().setColor('b', [text]);
    cam().setColorValue('b', { engraveDepth: 0.4 });
    const [outline, words] = seriesMotif();
    expect(outline).toMatchObject({ kind: 'outside', depth: 3, climb: false });
    expect(outline!.tabs).toMatchObject({ count: 2, width: 9, height: 2 });
    expect(words).toMatchObject({ kind: 'on', depth: 0.4 });
    // a part with a depth of its own keeps it
    cam().setItem(plate, { depth: 4 });
    expect(seriesMotif()[0]).toMatchObject({ depth: 4, climb: false });
  });
});
