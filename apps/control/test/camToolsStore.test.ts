import {
  circle,
  operationTabSites,
  rectangle,
  toGcode,
  toolpaths,
  type Contour,
  type Operation,
} from '@lowrider/cam';
import { splitLines } from '@lowrider/gcode-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { itemTabs } from '../src/lib/camTabs';
import { diameterOfItem, drawnTabMarks, planCutters } from '../src/lib/camTools';
import { prepareJob } from '../src/lib/prepare';
import { itemOperation, useCam } from '../src/store/cam';
import { useJob } from '../src/store/job';
import { useWorkshop } from '../src/store/workshop';
import {
  cam,
  changes,
  items,
  LIST,
  program,
  resetTools,
  scene,
  SMALL,
  VBIT,
} from './camToolsFixtures';

/** A plate (outside, 40 × 30, tabs) and a text "Hi" (engraved): the two parts every case starts from */
let plate = 0;
let text = 0;
function drawing() {
  scene();
  cam().add([rectangle(0, 0, 40, 30)]);
  cam().addText('Hi', { height: 8 });
  [plate, text] = items().map((i) => i.id) as [number, number];
  cam().select(null);
}
const item = (id: number) => items().find((i) => i.id === id)!;
const notes = () => cam().toolNotes.map((n) => n.code);
const loaded = () => useJob.getState().fileName;

describe('one cutter: the program of every drawing is the one it always was', () => {
  beforeEach(drawing);

  it('a drawing whose parts all name the drawing’s own tool is cut exactly as one that names none', () => {
    const none = program();
    expect(none).not.toBe('');
    expect(changes(none)).toEqual([]);
    for (const i of items()) cam().setItem(i.id, { toolId: 't3' });
    expect(items().every((i) => i.toolId === 't3')).toBe(true);
    expect(program()).toBe(none);
    // and clearing the choice brings the key back off the part: nothing stays behind
    for (const i of items()) cam().setItem(i.id, { toolId: undefined });
    expect(items().some((i) => 'toolId' in i)).toBe(false);
    expect(program()).toBe(none);
  });

  it('is the program the code before several tools made: plain toolpaths, plain toGcode, the drawing’s own rpm', () => {
    const { settings } = cam();
    const contours = items().flatMap((i) => i.contours);
    const operations: Operation[] = [];
    items().forEach((i) =>
      i.contours.forEach((_, k) =>
        operations.push({ contour: operations.length, ...itemOperation(i, settings, k) }),
      ),
    );
    const moves = toolpaths(contours, operations, { ...settings, toolDiameter: 6 }, undefined, {
      route: settings.routeShort ? 'short' : 'nearest',
    }).moves;
    const before = toGcode(moves, { name: 'zeichnung', rpm: settings.rpm, safeZ: settings.safeZ });
    // (the job holds the lines of the text: no empty last line)
    expect(program()).toBe(splitLines(before).join('\n'));
    // naming the drawing's tool changes nothing of it
    for (const i of items()) cam().setItem(i.id, { toolId: 't3' });
    expect(program()).toBe(splitLines(before).join('\n'));
  });

  it('a drawing whose cutter is not in the tool list is cut as a 6 mm cutter, with no T word – as ever', () => {
    const before = program();
    useWorkshop.getState().removeTool('t3');
    // (the drawing's own cutter is gone: 6 mm, no note, nothing refused – a drawing with one cutter never was)
    expect(program()).toBe(before);
    expect(cam().toolNotes).toEqual([]);
    resetTools();
  });

  it('a hidden part, a part that is not cut and a registration hole count for no cutter', () => {
    cam().setItem(text, { toolId: 'v1' });
    expect(changes()).toHaveLength(2);
    cam().setHidden(text, true);
    expect(changes()).toEqual([]);
    cam().setHidden(text, false);
    expect(changes()).toHaveLength(2);
    cam().setItem(text, { kind: 'none' });
    expect(changes()).toEqual([]);
    expect(item(text).toolId).toBeUndefined();
  });
});

describe('two cutters: one program with a tool change between the runs', () => {
  beforeEach(drawing);

  it('the V-bit engraves the text, the 6 mm cutter cuts the plate: two blocks, T and M6, each with its own values', () => {
    cam().setItem(text, { toolId: 'v1' });
    const text2 = program();
    expect(changes(text2)).toEqual(['T4 M6', 'T3 M6']);
    // the header names the cutters (the app reads it: `camInfo`) in the order they are used, with their diameters
    expect(text2).toContain('(T4 D=3 V-Fräser 60°)');
    expect(text2).toContain('(T3 D=6 Schaftfräser 6 mm)');
    // the V-bit's own values: its speed, its feed and plunge feed; the plate's are the drawing's
    const lines = text2.split('\n');
    const at = (word: string) => lines.findIndex((l) => l === word);
    expect(lines[at('T4 M6') + 3]).toBe('S12000 M3');
    expect(lines[at('T3 M6') + 1]).toBe('S18000 M3');
    expect(lines.slice(at('T4 M6'), at('T3 M6')).some((l) => /F600$/.test(l))).toBe(true);
    expect(lines.slice(at('T4 M6'), at('T3 M6')).some((l) => /F200$/.test(l))).toBe(true);
    expect(lines.slice(at('T3 M6')).some((l) => /F1500$/.test(l))).toBe(true);
    expect(lines.slice(at('T3 M6')).some((l) => /F400$/.test(l))).toBe(true);
    // the tool circle on the stage is the cutter the program starts with
    expect(useJob.getState().toolDiameter).toBe(3);
    expect(notes()).toEqual([]);
  });

  it('what is made is a program the app can run: as many parts as blocks, no error, the first-used tool first', () => {
    cam().setItem(text, { toolId: 'v1' });
    const { analysis, profile, fileName } = useJob.getState();
    const prepared = prepareJob(program(), fileName!, profile.kinematics);
    expect(prepared.parts.map((p) => p.tool)).toEqual([4, 3]);
    expect(prepared.parts.map((p) => p.errors)).toEqual([0, 0]);
    expect(prepared.parts).toHaveLength(changes().length);
    expect(analysis!.toolOrder).toEqual([4, 3]);
    // (the sorted list is the other order – which is why "the first tool" is `toolOrder[0]`)
    expect(analysis!.tools).toEqual([3, 4]);
  });

  it('three runs, the first cutter wanted again: T3, T4, T3 – three parts, no error, the program starts with T3', () => {
    // a hole in the plate (drilled by the drawing's cutter first), the text with the V-bit, the plate last
    cam().add([circle(20, 15, 6)]);
    const hole = items()[items().length - 1]!;
    expect(hole.kind).toBe('drill');
    cam().setItem(text, { toolId: 'v1' });
    expect(changes()).toEqual(['T3 M6', 'T4 M6', 'T3 M6']);
    const { analysis, profile, fileName } = useJob.getState();
    const prepared = prepareJob(program(), fileName!, profile.kinematics);
    expect(prepared.parts.map((p) => p.tool)).toEqual([3, 4, 3]);
    expect(prepared.parts.every((p) => p.errors === 0)).toBe(true);
    expect(analysis!.toolOrder).toEqual([3, 4]);
    expect(analysis!.tools).toEqual([3, 4]);
  });

  it('one part back to the drawing’s tool: one block, the plain program, byte for byte as before', () => {
    const before = program();
    cam().setItem(text, { toolId: 'v1' });
    expect(changes()).toHaveLength(2);
    cam().setItem(text, { toolId: undefined });
    expect(program()).toBe(before);
    expect(changes()).toEqual([]);
  });

  it('a second cutter whose only cut is not made leaves a program of one block – with the speed of that cutter', () => {
    // a 1.5 mm square cut out of the sheet with a 3 mm cutter: too large, nothing is cut there
    cam().setItem(plate, { kind: 'none' });
    cam().add([rectangle(100, 0, 1.5, 1.5)]);
    const tiny = items()[items().length - 1]!;
    cam().setItem(tiny.id, { kind: 'inside' });
    cam().setItem(text, { toolId: 'v1' });
    // two cutters are in the plan (the V-bit for the text, the drawing's for the tiny square) …
    expect(
      planCutters(items(), cam().settings, LIST, useWorkshop.getState().settings.spindle).cutters,
    ).toHaveLength(2);
    // … the tiny square is not cut (a cutter of 6 mm for 1.5 mm), so the program has one block: the plain form,
    // with the V-bit's speed, and the stage's tool circle is the V-bit's
    expect(cam().problems.map((p) => p.code)).toContain('tool-too-large');
    expect(changes()).toEqual([]);
    expect(program()).toContain('M3 S12000');
    expect(useJob.getState().toolDiameter).toBe(3);
  });

  it('a cutter without values of its own cuts with the drawing’s', () => {
    // the small flat cutter T5 (Ø 2) has none; the text is engraved with it at the drawing's feed
    cam().setItem(text, { toolId: 'f2' });
    const lines = program().split('\n');
    const from = lines.indexOf('T5 M6');
    expect(from).toBeGreaterThan(-1);
    expect(lines.slice(from, from + 4)).toContain('S18000 M3');
    expect(lines.slice(from).some((l) => /F1500$/.test(l))).toBe(true);
    expect(lines.slice(from).some((l) => /F400$/.test(l))).toBe(true);
  });

  it('one cutter that is not the drawing’s cuts with its own values and no T word', () => {
    cam().setItem(plate, { kind: 'none' });
    cam().setItem(text, { toolId: 'v1' });
    const t = program();
    expect(changes(t)).toEqual([]);
    expect(t).not.toMatch(/\bT\d/);
    expect(t).toContain('M3 S12000');
    expect(t).toMatch(/F600/);
    expect(useJob.getState().toolDiameter).toBe(3);
  });

  it('a V-bit, a ball cutter or a drill is offered for engraving and drilling only', () => {
    // for the outline the V-bit is not a cutter: its choice does not stand (the drawing's is used) and the card says so
    cam().setItem(plate, { toolId: 'v1' });
    expect(notes()).toEqual(['kind']);
    expect(changes()).toEqual([]);
    expect(cam().toolNotes[0]).toMatchObject({ rows: [0], tool: VBIT.name });
    // the same drawing without the choice
    const without = program();
    cam().setItem(plate, { toolId: undefined });
    expect(program()).toBe(without);
    expect(notes()).toEqual([]);
    // and a choice made for engraving does not go along to a cut it cannot make
    cam().setItem(text, { toolId: 'v1' });
    cam().setItem(text, { kind: 'outside' });
    expect(item(text).toolId).toBeUndefined();
  });

  it('the cutter of a part goes along with copies, pastes, arrays and undo – and is one step', () => {
    cam().setItem(text, { toolId: 'v1' });
    const steps = cam().past.length;
    cam().select(item(text).group);
    cam().duplicate();
    const copy = items().find((i) => i.text !== undefined && i.id !== text)!;
    expect(copy.toolId).toBe('v1');
    cam().copy();
    cam().paste();
    expect(items().filter((i) => i.toolId === 'v1')).toHaveLength(3);
    cam().array(2, 1, 5);
    expect(items().filter((i) => i.toolId === 'v1').length).toBeGreaterThan(3);
    expect(changes()).toEqual(['T4 M6', 'T3 M6']);
    // undo takes the choice back in one step
    cam().setItem(plate, { depth: 3 });
    cam().undo();
    expect(item(text).toolId).toBe('v1');
    while (cam().past.length > steps) cam().undo();
    cam().undo();
    expect(item(text).toolId).toBeUndefined();
    cam().redo();
    expect(item(text).toolId).toBe('v1');
  });
});

describe('what the tool list says: problems, never a throw', () => {
  beforeEach(drawing);

  it('a T number twice in the list: no program, the notes name both – and it is there again once fixed', () => {
    cam().setItem(text, { toolId: 'v1' });
    expect(changes()).toHaveLength(2);
    // the small cutter (not used) takes the V-bit's number: the controller could not tell which is meant
    expect(() => useWorkshop.getState().saveTool({ ...SMALL, number: 4 })).not.toThrow();
    expect(notes()).toEqual(['clash']);
    expect(cam().toolNotes[0]).toMatchObject({
      number: 4,
      tool: VBIT.name,
      other: SMALL.name,
      rows: [1],
    });
    expect(loaded()).toBeNull();
    expect(program()).toBe('');
    // fixed in the list: the program is made anew by itself
    useWorkshop.getState().saveTool({ ...SMALL, number: 5 });
    expect(notes()).toEqual([]);
    expect(changes()).toEqual(['T4 M6', 'T3 M6']);
  });

  it('a cutter with no number (0, or not whole): no program', () => {
    cam().setItem(text, { toolId: 'v1' });
    for (const number of [0, 2.5, -1]) {
      expect(() => useWorkshop.getState().saveTool({ ...VBIT, number })).not.toThrow();
      expect(notes(), String(number)).toEqual(['number']);
      expect(loaded()).toBeNull();
    }
    useWorkshop.getState().saveTool({ ...VBIT, number: 4 });
    expect(changes()).toHaveLength(2);
  });

  it('two cutters of one name with a bad number are one note naming both parts – and the rows of each cutter stay its own', () => {
    cam().add([circle(30, 20, 6)]);
    const third = items()[2]!;
    cam().setItem(third.id, { kind: 'on' });
    cam().setItem(text, { toolId: 'v1' });
    cam().setItem(third.id, { toolId: 'f2' });
    useWorkshop.getState().saveTool({ ...VBIT, name: 'Gleich', number: 0 });
    useWorkshop.getState().saveTool({ ...SMALL, name: 'Gleich', number: 0 });
    expect(cam().toolNotes).toEqual([{ code: 'number', rows: [1, 2], tool: 'Gleich', number: 0 }]);
    const plan = planCutters(
      items(),
      cam().settings,
      useWorkshop.getState().tools,
      useWorkshop.getState().settings.spindle,
    );
    expect(plan.cutters.map((c) => [c.id, c.rows])).toEqual([
      ['t3', [0]],
      ['v1', [1]],
      ['f2', [2]],
    ]);
    resetTools();
  });

  it('a T number is checked only where a program with several cutters names them: one cutter keeps its program', () => {
    const before = program();
    // the drawing's own cutter has number 0 – and is the only one: no T word, nothing refused (as ever)
    useWorkshop.getState().saveTool({ ...LIST.find((x) => x.id === 't3')!, number: 0 });
    expect(notes()).toEqual([]);
    expect(program()).toBe(before);
    resetTools();
  });

  it('the drawing’s own cutter gone from the list beside others: no program, until a cutter is chosen', () => {
    cam().setItem(text, { toolId: 'v1' });
    useWorkshop.getState().removeTool('t3');
    expect(notes()).toEqual(['gone']);
    expect(cam().toolNotes[0]).toMatchObject({ tool: 't3', rows: [0] });
    expect(loaded()).toBeNull();
    useWorkshop.getState().saveTool(LIST.find((x) => x.id === 't3')!);
    expect(notes()).toEqual([]);
    expect(changes()).toHaveLength(2);
  });

  it('a part whose cutter was deleted from the list is cut with the drawing’s – and says so, like a missing project tool', () => {
    const before = program();
    cam().setItem(text, { toolId: 'v1' });
    expect(changes()).toHaveLength(2);
    expect(() => useWorkshop.getState().removeTool('v1')).not.toThrow();
    expect(notes()).toEqual(['missing']);
    expect(cam().toolNotes[0]).toMatchObject({ rows: [1], tool: 'v1' });
    // the program is the one of the drawing without a choice – byte for byte
    expect(program()).toBe(before);
    // the part still asks for it: it is cut with it again as soon as the list has it
    expect(item(text).toolId).toBe('v1');
    useWorkshop.getState().saveTool(VBIT);
    expect(notes()).toEqual([]);
    expect(changes()).toEqual(['T4 M6', 'T3 M6']);
  });

  it('a cutter marked as a probe never turns: the part is cut with the drawing’s and the card says so', () => {
    const before = program();
    cam().setItem(text, { toolId: 'v1' });
    useWorkshop.getState().saveTool({ ...VBIT, probe: true });
    expect(notes()).toEqual(['probe']);
    expect(program()).toBe(before);
    expect(program()).not.toContain('T4');
  });

  it('a tool edited to another diameter, number, name or value makes the program anew – a stale one is never left on the table', () => {
    cam().setItem(text, { toolId: 'v1' });
    expect(program()).toContain('(T4 D=3 V-Fräser 60°)');
    useWorkshop.getState().saveTool({ ...VBIT, diameter: 4 });
    expect(program()).toContain('(T4 D=4 V-Fräser 60°)');
    useWorkshop.getState().saveTool({ ...VBIT, diameter: 4, number: 7 });
    expect(changes()).toEqual(['T7 M6', 'T3 M6']);
    useWorkshop.getState().saveTool({ ...VBIT, diameter: 4, number: 7, name: 'Gravur' });
    expect(program()).toContain('(T7 D=4 Gravur)');
    useWorkshop.getState().saveTool({
      ...VBIT,
      diameter: 4,
      number: 7,
      name: 'Gravur',
      cutting: { ...VBIT.cutting, feed: 750, rpm: 10000 },
    });
    expect(program()).toContain('F750');
    expect(program()).toContain('S10000 M3');
    // the cutter of the drawing itself: its diameter changes where the outline runs
    const outline = program();
    useWorkshop.getState().saveTool({ ...LIST.find((x) => x.id === 't3')!, diameter: 7 });
    expect(program()).toContain('(T3 D=7 ');
    expect(program()).not.toBe(outline);
    resetTools();
  });

  it('a tool of no interest to the drawing changes nothing: the program on the table is left alone', () => {
    cam().setItem(text, { toolId: 'v1' });
    const lines = useJob.getState().lines;
    useWorkshop.getState().saveTool({ ...SMALL, name: 'Anderer Name', diameter: 2.5 });
    expect(useJob.getState().lines).toBe(lines);
  });
});

describe('every reader of a cutter asks the same plan', () => {
  beforeEach(drawing);

  it('the cutter of a part is its own, the drawing’s where it is not cut', () => {
    cam().setItem(text, { toolId: 'v1' });
    const plan = planCutters(
      items(),
      cam().settings,
      useWorkshop.getState().tools,
      useWorkshop.getState().settings.spindle,
    );
    expect(diameterOfItem(plan, item(text))).toBe(3);
    expect(diameterOfItem(plan, item(plate))).toBe(6);
    cam().setHidden(text, true);
    const hidden = planCutters(
      items(),
      cam().settings,
      useWorkshop.getState().tools,
      useWorkshop.getState().settings.spindle,
    );
    expect(diameterOfItem(hidden, item(text))).toBe(6);
  });

  it('the gap of "Verschachteln" leaves room for the widest cutter of the program', () => {
    cam().setSettings({ toolId: 'f2' });
    cam().remake();
    cam().add([rectangle(100, 0, 20, 20)]);
    cam().setItem(plate, { toolId: 't3' });
    useWorkshop.getState().setSetup({
      stock: { min: { x: 0, y: 0, z: -18 }, max: { x: 400, y: 300, z: 0 } },
      fixtures: [],
      fixtureFrame: 'machine',
    });
    cam().selectAll();
    // the drawing's cutter alone is 2 mm: a gap of 4; the plate's 6 mm cutter asks for 8
    expect(cam().nest()!.gap).toBe(8);
  });
});

describe('a registration hole has no cutter of its own: it is drilled with the drawing’s', () => {
  beforeEach(drawing);

  it('a choice made for it is not kept', () => {
    cam().setTwoSided({ thickness: 12 });
    cam().setItem(text, { side: 'back' });
    const hole = items().find((i) => i.registration !== undefined)!;
    expect(hole).toBeDefined();
    cam().setItem(hole.id, { toolId: 'v1' });
    expect(items().find((i) => i.id === hole.id)!.toolId).toBeUndefined();
    expect(cam().toolNotes).toEqual([]);
    expect(cam().flipNotes.map((n) => n.code)).not.toContain('tools');
  });
});

/** An L: its tab places keep off the corners of the cutter's loop, and that depends on the cutter */
const lshape = (): Contour => ({
  closed: true,
  points: [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 20 },
    { x: 30, y: 20 },
    { x: 30, y: 50 },
    { x: 0, y: 50 },
  ],
});

/** Where the cutter is lifted over a tab in a program (z −4: tabs 2 high in a cut 6 deep in one pass) */
function lifts(text = program(), z = -4): number[][] {
  let x = 0;
  let y = 0;
  let at = 0;
  let from: number[] = [];
  const out: number[][] = [];
  for (const line of text.split('\n')) {
    const m = /^(?:G[01]\s+)?((?:[XYZ]-?\d+(?:\.\d+)?\s*)+)(?:F\d+)?$/.exec(line);
    if (!m) continue;
    const was = at;
    for (const w of m[1]!.trim().split(/\s+/)) {
      const v = Number(w.slice(1));
      if (w[0] === 'X') x = v;
      else if (w[0] === 'Y') y = v;
      else at = v;
    }
    if (at === z && was !== z) from = [x, y];
    else if (was === z && at !== z && (x !== from[0] || y !== from[1])) out.push([...from, x, y]);
  }
  return out;
}

describe('what is drawn is what is cut, for the cutter of each part', () => {
  beforeEach(() => {
    scene();
    cam().setSettings({
      stepdown: 6,
      rampAngle: 90,
      tabs: { count: 3, width: 6, height: 2, avoidCorners: true },
    });
    cam().add([lshape()]);
  });
  const part = () => items()[0]!;
  const sites = (diameter: number) =>
    operationTabSites(
      part().contours[0]!,
      { kind: 'outside', tabs: itemTabs(part(), 0, cam().settings.tabs) },
      { toolDiameter: diameter },
    ).map((s) => s.u);
  const plan = () =>
    planCutters(
      items(),
      cam().settings,
      useWorkshop.getState().tools,
      useWorkshop.getState().settings.spindle,
    );

  it('the table draws the places of the part’s own cutter, the places by hand start there, and the cut lifts there', () => {
    // premise: the 6 mm cutter of the drawing and the 8 mm one of the part keep the tabs at other places of this L
    expect(sites(6)).not.toEqual(sites(8));
    const six = lifts();
    expect(six.length).toBeGreaterThan(0);
    cam().setItem(part().id, { toolId: 't1' });
    // drawn: the marks of the table are the sites of the 8 mm cutter – not of the drawing's 6 mm one
    const marks = drawnTabMarks(items(), cam().settings.tabs, plan());
    expect(marks.map((m) => m.u)).toEqual(sites(8));
    // by hand: "Stege von Hand" starts from the places the cut lifts at
    const auto = lifts();
    expect(auto).not.toEqual(six);
    expect(cam().manualTabs(part().id)).toBe(true);
    expect(part().tabSpec!.at!.map((p) => p.u)).toEqual(sites(8));
    // cut: the program of the places by hand is the program of the automatic ones
    expect(lifts()).toEqual(auto);
  });

  it('with two cutters the part cut with the one that is not the drawing’s is drawn and cut with that one', () => {
    cam().addText('Hi', { height: 8 });
    const word = items()[1]!;
    cam().setItem(word.id, { toolId: 'v1' });
    cam().setItem(part().id, { toolId: 't1' });
    expect(changes()).toHaveLength(2);
    const marks = drawnTabMarks(items(), cam().settings.tabs, plan());
    expect(marks.map((m) => m.u)).toEqual(sites(8));
    // the L is cut in the second block (the outline frees the part): its lifts are where the marks are
    expect(lifts().length).toBeGreaterThan(0);
    const auto = lifts();
    expect(cam().manualTabs(part().id)).toBe(true);
    expect(lifts()).toEqual(auto);
  });
});

describe('the tool blocks and the registration holes drilled in front of a program', () => {
  beforeEach(drawing);

  /** The moves and blocks of the drawing with its text cut by a second cutter, and the moves of one hole */
  function calls() {
    const { settings } = cam();
    const a = { ...settings, toolDiameter: 6 };
    const b = { ...settings, toolDiameter: 3 };
    const contours = items().flatMap((i) => i.contours);
    const operations: Operation[] = [];
    items().forEach((i) =>
      i.contours.forEach((_, k) =>
        operations.push({ contour: operations.length, ...itemOperation(i, settings, k) }),
      ),
    );
    const two = toolpaths(
      contours,
      operations.map((op, k) => ({ ...op, tool: k === operations.length - 1 ? 1 : 0 })),
      [
        { number: 3, cut: a },
        { number: 4, cut: b },
      ],
    );
    const one = toolpaths(contours, operations, [{ number: 3, cut: a }]);
    const hole = toolpaths(
      [circle(10, 10, 6)],
      [{ contour: 0, kind: 'drill', depth: 12 }],
      a,
    ).moves;
    return { two, one, hole, settings };
  }

  it('a program of ONE block is written as it always was: holes in front of its moves cannot trip the tiling check', () => {
    const { one, hole, settings } = calls();
    expect(one.blocks).toHaveLength(1);
    const text = toGcode([...hole, ...one.moves], {
      name: 'x',
      rpm: settings.rpm,
      safeZ: settings.safeZ,
      blocks: one.blocks,
    });
    expect(text).toBe(
      toGcode([...hole, ...one.moves], { name: 'x', rpm: settings.rpm, safeZ: settings.safeZ }),
    );
    expect(text).not.toMatch(/\bM6\b/);
  });

  it('with two blocks the library refuses holes put in front of them – which is why the program never has both', () => {
    const { two, hole, settings } = calls();
    expect(two.blocks!.length).toBeGreaterThanOrEqual(2);
    expect(() =>
      toGcode([...hole, ...two.moves], {
        name: 'x',
        rpm: settings.rpm,
        safeZ: settings.safeZ,
        blocks: two.blocks,
      }),
    ).toThrow(RangeError);
    // (a two-sided drawing with a second cutter makes no program at all: the flip note, never a throw – `camToolsFlip`)
    cam().setTwoSided({ thickness: 12 });
    expect(() => cam().setItem(text, { toolId: 'v1' })).not.toThrow();
    expect(useJob.getState().fileName).toBeNull();
  });
});

describe('what a cutter cuts with: the drawing’s values for its own, the tool’s own values over them for another', () => {
  beforeEach(drawing);
  const plan = () =>
    planCutters(
      items(),
      cam().settings,
      useWorkshop.getState().tools,
      useWorkshop.getState().settings.spindle,
    );

  it('the drawing’s cutter takes the drawing’s values as they stand – the tool’s own are not laid over them', () => {
    // the drawing's own cutter has own values too: they are for "Werte vorschlagen", not for the cut
    useWorkshop.getState().saveTool({
      ...LIST.find((x) => x.id === 't3')!,
      cutting: { rpm: 9000, feed: 999, plungeFeed: 99, stepdown: 0.3, stepover: 0.2 },
    });
    cam().setItem(text, { toolId: 'v1' });
    const mine = plan().drawing;
    expect(mine.rpm).toBe(18000);
    expect(mine.cut).toMatchObject({
      toolDiameter: 6,
      feed: 1500,
      plungeFeed: 400,
      stepdown: 2,
      stepover: 0.4,
    });
    resetTools();
  });

  it('another cutter: its own feed, plunge feed, stepdown, speed – and the stepover as the share of ITS diameter (0.3 stays 0.3)', () => {
    cam().setItem(text, { toolId: 'v1' });
    const v = plan().cutters.find((c) => c.id === 'v1')!;
    expect(v.rpm).toBe(12000);
    expect(v.ownValues).toBe(true);
    // (the tool says 30 % of its diameter; the CAM wants a fraction: a straight pass-through of the millimetres would
    // be a stepover of 0.9 – nearly the full width of a 3 mm cutter in every pocket pass)
    expect(v.cut).toMatchObject({
      toolDiameter: 3,
      feed: 600,
      plungeFeed: 200,
      stepdown: 0.5,
      stepover: 0.3,
      // what the tool does not say is the drawing's
      depth: 6,
      safeZ: 5,
    });
    // a tool whose stepover is another share and another diameter
    useWorkshop.getState().saveTool({ ...VBIT, diameter: 4, cutting: { stepover: 0.25 } });
    expect(plan().cutters.find((c) => c.id === 'v1')!.cut.stepover).toBe(0.25);
    expect(plan().cutters.find((c) => c.id === 'v1')!.rpm).toBe(18000);
    resetTools();
  });

  it('a speed beyond the spindle is held to it, as the suggestion holds it', () => {
    cam().setItem(text, { toolId: 'v1' });
    useWorkshop.getState().saveTool({ ...VBIT, cutting: { rpm: 90000 } });
    const { rpmMax } = useWorkshop.getState().settings.spindle;
    expect(plan().cutters.find((c) => c.id === 'v1')!.rpm).toBe(rpmMax);
    expect(program()).toContain(`S${rpmMax} M3`);
    resetTools();
  });
});
