import { rectangle } from '@lowrider/cam';
import { splitLines } from '@lowrider/gcode-core';
import { prepareJob } from '../src/lib/prepare';
import { beforeEach, describe, expect, it } from 'vitest';
import { blocksFlip } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { seriesOwnToolRows, useSeries } from '../src/store/series';
import { useMachine } from '../src/store/machine';
import { cam, changes, items, program, scene } from './camToolsFixtures';

let plate = 0;
let text = 0;
function drawing() {
  scene();
  cam().add([rectangle(0, 0, 60, 40)]);
  cam().addText('Hi', { height: 8 });
  [plate, text] = items().map((i) => i.id) as [number, number];
  cam().select(null);
}
const notes = () => cam().flipNotes.map((n) => n.code);
const plan = () => useFlip.getState().plan;

/** Both sides, a thick enough board entered: the text on the back – a drawing that makes a job for two sides */
function twoSided() {
  cam().setTwoSided({ thickness: 12 });
  cam().setItem(text, { side: 'back' });
}

describe('a two-sided job is one cutter’s: a part’s own cutter is refused, in either order', () => {
  beforeEach(drawing);

  it('the drawing without cutters of its own makes a job for two sides (the premise)', () => {
    twoSided();
    expect(plan()).not.toBeNull();
    expect(notes()).not.toContain('tools');
    expect(changes()).toEqual([]);
  });

  it('a second cutter added to a two-sided drawing: no program, no plan, the note names the part – and it is blocking', () => {
    twoSided();
    expect(plan()).not.toBeNull();
    cam().setItem(text, { toolId: 'v1' });
    expect(cam().flipNotes).toEqual([{ code: 'tools', rows: [1] }]);
    expect(blocksFlip(cam().flipNotes[0]!)).toBe(true);
    expect(plan()).toBeNull();
    expect(useJob.getState().fileName).toBeNull();
    expect(program()).toBe('');
    // taken back, the job for two sides is there again – the same one
    cam().setItem(text, { toolId: undefined });
    expect(notes()).not.toContain('tools');
    expect(plan()).not.toBeNull();
  });

  it('the two-sided state switched on while two cutters are in use: the same, no matter the order', () => {
    cam().setItem(text, { toolId: 'v1' });
    expect(changes()).toHaveLength(2);
    cam().setTwoSided({ thickness: 12 });
    expect(cam().flipNotes).toEqual([{ code: 'tools', rows: [1] }]);
    expect(plan()).toBeNull();
    expect(useJob.getState().fileName).toBeNull();
    // switched off again: the program with its tool change is back, byte for byte
    cam().setTwoSided(null);
    expect(cam().flipNotes).toEqual([]);
    expect(changes()).toEqual(['T4 M6', 'T3 M6']);
  });

  it('a single cutter that is not the drawing’s is refused as well: a two-sided job drills its holes with the drawing’s', () => {
    // every part with the V-bit is one cutter – but not the one the registration holes are drilled with
    twoSided();
    cam().setItem(plate, { kind: 'none' });
    cam().setItem(text, { toolId: 'f2' });
    expect(cam().flipNotes).toEqual([{ code: 'tools', rows: [1] }]);
    expect(plan()).toBeNull();
  });

  it('every part that has a cutter of its own is named, in the order of the list', () => {
    twoSided();
    cam().add([rectangle(100, 0, 20, 20)]);
    const third = items()[2]!;
    cam().setItem(third.id, { toolId: 't1' });
    cam().setItem(text, { toolId: 'f2' });
    expect(cam().flipNotes).toEqual([{ code: 'tools', rows: [1, 2] }]);
  });

  it('a job that is under way keeps its program: the drawing is ahead, nothing is loaded over it', () => {
    twoSided();
    const lines = useJob.getState().lines;
    const name = useJob.getState().fileName;
    useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
    cam().setItem(text, { toolId: 'v1' });
    expect(cam().flipNotes).toEqual([{ code: 'tools', rows: [1] }]);
    expect(useJob.getState().fileName).toBe(name);
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    useMachine.setState({ fileJob: null });
  });
});

describe('a series cuts every blank with the drawing’s cutter', () => {
  beforeEach(drawing);

  it('names the parts that have one of their own', () => {
    expect(seriesOwnToolRows()).toEqual([]);
    cam().setItem(text, { toolId: 'v1' });
    expect(seriesOwnToolRows()).toEqual([1]);
    cam().setItem(plate, { toolId: 't1' });
    expect(seriesOwnToolRows()).toEqual([0, 1]);
    // the drawing's own tool, named, is no cutter of its own
    cam().setItem(plate, { toolId: 't3' });
    cam().setItem(text, { toolId: 't3' });
    expect(seriesOwnToolRows()).toEqual([]);
  });

  it('does not begin with one – a single cutter that is not the drawing’s included', () => {
    cam().setItem(plate, { kind: 'none' });
    cam().setItem(text, { toolId: 'v1' });
    expect(changes()).toEqual([]);
    useSeries.getState().begin();
    expect(useSeries.getState().open).toBe(false);
    // …and begins with the drawing's own
    cam().setItem(text, { toolId: undefined });
    useSeries.getState().begin();
    expect(useSeries.getState().open).toBe(true);
    useSeries.setState({ open: false });
  });

  it('makes no program with one either (the flow is open, a part is given a cutter, the card is hidden – the store says no)', () => {
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
    cam().setItem(text, { toolId: 'v1' });
    const before = useJob.getState().lines;
    expect(useSeries.getState().make()).toBe(false);
    expect(useJob.getState().lines).toBe(before);
    useSeries.setState({ open: false, blanks: [], made: null });
    useMachine.setState({ status: null });
  });
});

describe('what the sections make of a program with a tool change', () => {
  it('keeps its T and M6 lines in every section: it works on the text', async () => {
    // a long program with two tools: the sections are pieces of the text, a change of tool stays where it was
    const { planSections, splitSections } = await import('@lowrider/gcode-core');
    const lines = [
      'G21 G90 G17 G94',
      'T1 M6',
      'S18000 M3',
      'G0 Z5',
      'G0 X0 Y0',
      'G1 Z-1 F300',
      'G1 X300 F1200',
      'G0 Z5',
      'M5',
      'T2 M6',
      'S12000 M3',
      'G0 Z5',
      'G0 X300 Y10',
      'G1 Z-1 F300',
      'G1 X0 F1200',
      'G0 Z5',
      'M5',
      'M30',
    ];
    const text = lines.join('\n');
    const plan = planSections(text, {
      axis: 'x',
      reach: { min: 0, max: 200 },
      zone: 40,
      tolerance: 2,
    });
    expect('problem' in plan, JSON.stringify(plan)).toBe(false);
    const parts = splitSections(text, plan as Exclude<typeof plan, { problem: string }>);
    expect(Array.isArray(parts), JSON.stringify(parts)).toBe(true);
    const sections = parts as { text: string }[];
    expect(sections.length).toBeGreaterThan(1);
    for (const part of sections) {
      const own = splitLines(part.text);
      // every section carries the change of tool it was cut from: the program is still a program of two tools
      expect(own.filter((l) => /\bT[12] M6\b/.test(l)).length).toBeGreaterThan(0);
      expect(own.filter((l) => /^M5$/.test(l)).length).toBeGreaterThan(0);
      // …and every section can be started: the app splits it at the change into parts and none of them has an error
      // (a feed rate that went missing at the split would block the start)
      const prepared = prepareJob(part.text, 'section.nc', useJob.getState().profile.kinematics);
      expect(prepared.parts.length).toBeGreaterThan(0);
      expect(prepared.parts.map((p) => p.errors)).toEqual(prepared.parts.map(() => 0));
    }
  });
});
