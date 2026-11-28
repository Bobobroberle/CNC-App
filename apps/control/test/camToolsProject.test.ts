import { rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseProject,
  PROJECT_VERSION,
  PROJECT_VERSION_MAX,
  projectToFile,
  projectToText,
  projectVersion,
} from '../src/lib/camProject';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
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

let plate = 0;
let text = 0;
function drawing() {
  scene();
  cam().add([rectangle(0, 0, 40, 30)]);
  cam().addText('Hi', { height: 8 });
  [plate, text] = items().map((i) => i.id) as [number, number];
  cam().select(null);
}
const saved = () => JSON.parse(cam().saveProject()!);
const textOf = (file: unknown) => `${JSON.stringify(file, null, 1)}\n`;
const error = (file: unknown) => {
  const parsed = parseProject(typeof file === 'string' ? file : JSON.stringify(file));
  return 'error' in parsed ? parsed.error : null;
};

describe('the version of a project file is a function of what is in it', () => {
  beforeEach(drawing);

  it('a drawing in which no part names a cutter is written as version 1 – exactly the file it always was', () => {
    const file = saved();
    expect(file.version).toBe(1);
    expect(file.version).toBe(PROJECT_VERSION);
    // no key of the cutters of parts: the keys are those of the first version, in the order they were written
    expect(Object.keys(file)).toEqual([
      'format',
      'version',
      'savedAt',
      'name',
      'twoSided',
      'items',
      'settings',
      'toolDiameter',
    ]);
    expect(file.items.some((i: object) => 'toolId' in i)).toBe(false);
    expect(file.toolDiameter).toBe(6);
    // the helper says the same of the project
    expect(projectVersion(cam().project!)).toBe(1);
    // and a file that names the drawing's own tool for a part is a version 2: the key is there
    cam().setItem(text, { toolId: 't3' });
    expect(saved().version).toBe(2);
  });

  it('a part with a cutter of its own makes it version 2, with the diameters of the cutters it names', () => {
    cam().setItem(text, { toolId: 'v1' });
    const file = saved();
    expect(file.version).toBe(2);
    expect(file.items.find((i: { id: number }) => i.id === text).toolId).toBe('v1');
    expect(file.items.find((i: { id: number }) => i.id === plate)).not.toHaveProperty('toolId');
    expect(file.toolDiameters).toEqual({ v1: 3 });
    expect(file.toolDiameter).toBe(6);
    expect(projectVersion(cam().project!)).toBe(2);
    // taking the choice back makes it version 1 again, with nothing left of the second
    cam().setItem(text, { toolId: undefined });
    const back = saved();
    expect(back.version).toBe(1);
    expect(back).not.toHaveProperty('toolDiameters');
  });

  it('an older build – one that reads only version 1 – refuses a version 2 file, and this one reads both and refuses above', () => {
    cam().setItem(text, { toolId: 'v1' });
    const file = saved();
    // the check an older build makes is `version > its newest`: this file is above it
    expect(file.version).toBeGreaterThan(PROJECT_VERSION);
    expect(PROJECT_VERSION_MAX).toBe(2);
    expect(error(file)).toBeNull();
    expect(error({ ...file, version: 1 })).toBeNull();
    expect(error({ ...file, version: PROJECT_VERSION_MAX + 1 })).toBe('newer-version');
  });

  it('round trips: opened again it is the same drawing and the same program, byte for byte', () => {
    cam().setItem(text, { toolId: 'v1' });
    const made = program();
    expect(changes()).toHaveLength(2);
    const file = cam().saveProject()!;
    drawing();
    expect(program()).not.toBe(made);
    expect(cam().openProject(file)).toEqual({ toolMissing: false });
    expect(items().find((i) => i.text !== undefined)!.toolId).toBe('v1');
    expect(program()).toBe(made);
    // saved again it is the same file, but for the time
    const again = saved();
    const first = JSON.parse(file);
    delete again.savedAt;
    delete first.savedAt;
    expect(again).toEqual(first);
  });

  it('a version 1 file that carries a cutter (no build writes one) is read like version 2: harmless', () => {
    cam().setItem(text, { toolId: 'v1' });
    const file = { ...saved(), version: 1 };
    expect(error(file)).toBeNull();
  });
});

describe('a project file with the cutters of parts is read strictly', () => {
  beforeEach(drawing);
  const base = () => {
    cam().setItem(text, { toolId: 'v1' });
    return saved();
  };
  const withItem = (patch: object) => {
    const file = base();
    file.items = file.items.map((i: { id: number }) => (i.id === text ? { ...i, ...patch } : i));
    return file;
  };

  it('refuses a cutter that is no tool id: wrong type, empty, endless, with control characters', () => {
    for (const toolId of [
      7,
      null,
      true,
      {},
      [],
      '',
      'x'.repeat(121),
      'a\nb',
      'a\u0000b',
      'a\u007fb',
    ]) {
      expect(error(withItem({ toolId })), JSON.stringify(toolId)).toBe('invalid-project');
    }
    expect(error(withItem({ toolId: 'x'.repeat(120) }))).toBeNull();
    expect(error(withItem({ toolId: 'Ä-Fräser 1' }))).toBeNull();
  });

  it('refuses a registration hole with a cutter of its own: it is drilled with the drawing’s', () => {
    cam().setTwoSided({});
    const file = base();
    const hole = file.items.find((i: { registration?: number }) => i.registration !== undefined);
    expect(hole).toBeDefined();
    file.items = file.items.map((i: object) => (i === hole ? { ...i, toolId: 'v1' } : i));
    expect(error(file)).toBe('invalid-project');
  });

  it('refuses diameters that are not a map of ids to diameters', () => {
    for (const toolDiameters of [
      [],
      'x',
      5,
      null,
      { v1: 'big' },
      { v1: -1 },
      { v1: 0 },
      { v1: 1000 },
      { '': 3 },
      { 'a\nb': 3 },
    ]) {
      const file = { ...base(), toolDiameters };
      expect(error(file), JSON.stringify(toolDiameters)).toBe('invalid-project');
    }
    const many = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`t${i}`, 3]));
    expect(error({ ...base(), toolDiameters: many })).toBe('invalid-project');
    // none at all is fine (the diameters say only what a tool list that has changed would not)
    const file = base();
    delete file.toolDiameters;
    expect(error(file)).toBeNull();
  });

  it('an id like "__proto__" is only a key: it poisons nothing', () => {
    const file = base();
    file.toolDiameters = JSON.parse('{"__proto__": 3, "v1": 3}');
    const parsed = parseProject(JSON.stringify(file));
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(Object.keys(parsed.toolDiameters).sort()).toEqual(['__proto__', 'v1']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(parsed.toolDiameters)).toBe(Object.prototype);
  });

  it('is whole or nothing: a file with one broken part opens nothing and leaves the drawing as it was', () => {
    const file = base();
    const before = program();
    const steps = cam().past.length;
    file.items.push({ ...file.items[0], id: 999, group: 999, toolId: 7 });
    expect(cam().openProject(JSON.stringify(file))).toEqual({ error: 'invalid-project' });
    expect(items().map((i) => i.id)).toEqual([plate, text]);
    expect(program()).toBe(before);
    expect(cam().past.length).toBe(steps);
  });
});

describe('a cutter that this workshop does not have, or has differently', () => {
  beforeEach(drawing);

  it('stays chosen and is said: the part is cut with the drawing’s until the tool is there – then with it', () => {
    cam().setItem(text, { toolId: 'v1' });
    const file = cam().saveProject()!;
    const plain = (() => {
      cam().setItem(text, { toolId: undefined });
      return program();
    })();
    useWorkshop.getState().removeTool('v1');
    const opened = cam().openProject(file);
    expect(opened).toEqual({ toolMissing: false, partTools: { missing: ['v1'], differ: [] } });
    expect(items().find((i) => i.text !== undefined)!.toolId).toBe('v1');
    expect(cam().toolNotes.map((n) => n.code)).toEqual(['missing']);
    expect(program()).toBe(plain);
    // saved again it still names the tool (it is not lost by opening in a workshop that lacks it) – without a diameter
    // for it, which is not known here
    const again = saved();
    expect(again.version).toBe(2);
    expect(again.items.find((i: { text?: string }) => i.text !== undefined).toolId).toBe('v1');
    expect(again).not.toHaveProperty('toolDiameters');
    // the tool comes (an import of the library): the program is made with it
    useWorkshop.getState().saveTool(VBIT);
    expect(changes()).toHaveLength(2);
    expect(cam().toolNotes).toEqual([]);
  });

  it('with another diameter here than in the file is said, with both numbers, and the paths follow the one that is here', () => {
    cam().setItem(text, { toolId: 'v1' });
    const file = cam().saveProject()!;
    useWorkshop.getState().saveTool({ ...VBIT, diameter: 4 });
    const opened = cam().openProject(file);
    expect(opened).toEqual({
      toolMissing: false,
      partTools: { missing: [], differ: [{ id: 'v1', name: VBIT.name, file: 3, now: 4 }] },
    });
    expect(program()).toContain('(T4 D=4 V-Fräser 60°)');
    resetTools();
  });

  it('a cutter above 100 mm is written without a diameter – the reader refuses one, so the file opens again and the part keeps its cutter', () => {
    // a 4-inch face mill: a real tool, but above the 0.001 … 100 mm a diameter in a file may have
    const BIG = { ...SMALL, id: 'big', number: 6, name: 'Planfräser 101,6 mm', diameter: 101.6 };
    useWorkshop.getState().saveTool(BIG);
    cam().setItem(text, { toolId: 'big' });
    // …beside one that is within them: its diameter is written
    cam().setItem(plate, { toolId: 'f2' });
    const file = cam().saveProject()!;
    const written = JSON.parse(file);
    expect(written.version).toBe(2);
    expect(written.toolDiameters).toEqual({ f2: 2 });
    expect(written.items.find((i: { id: number }) => i.id === text).toolId).toBe('big');
    expect(error(file)).toBeNull();
    // a new drawing in the same workshop, the file opened: whole, and the part is cut with the cutter it named
    drawing();
    useWorkshop.getState().saveTool(BIG);
    const opened = cam().openProject(file);
    expect(opened).toEqual({ toolMissing: false });
    expect(items().find((i) => i.text !== undefined)!.toolId).toBe('big');
    expect(cam().toolNotes).toEqual([]);
    // the cutter alone: no diameter left to write, so no key of them – the version is still 2 (a part names a cutter)
    cam().setItem(items().find((i) => i.text === undefined)!.id, { toolId: undefined });
    const alone = saved();
    expect(alone.version).toBe(2);
    expect(alone).not.toHaveProperty('toolDiameters');
    expect(cam().openProject(textOf(alone))).toEqual({ toolMissing: false });
    resetTools();
  });

  it('the drawing’s own cutter is said as ever, beside those of the parts', () => {
    cam().setItem(text, { toolId: 'v1' });
    const file = JSON.parse(cam().saveProject()!);
    file.settings.toolId = 'gone-from-the-list';
    const opened = cam().openProject(JSON.stringify(file));
    expect(opened).toMatchObject({ toolMissing: true });
    expect(opened).not.toHaveProperty('partTools');
    // (the chosen cutter stays the one set now)
    expect(cam().settings.toolId).toBe('t3');
    expect(LIST.some((t) => t.id === 't3')).toBe(true);
  });
});

describe('a file that carries two cutters and a two-sided part', () => {
  beforeEach(drawing);

  it('opens whole – and makes no program: the card says why, and one step of undo brings the old drawing back', () => {
    // both at once cannot be made in the app (the card refuses the second); a file may still carry them
    cam().setItem(text, { toolId: 'v1' });
    const file = JSON.parse(cam().saveProject()!);
    file.twoSided = { axis: 'x', pins: false, autoHoles: true };
    file.items = file.items.map((i: { id: number }) =>
      i.id === text ? { ...i, side: 'front' } : i,
    );
    drawing();
    const before = program();
    useFlip.getState().cancel();
    expect(cam().openProject(JSON.stringify(file))).toEqual({ toolMissing: false });
    expect(cam().project!.twoSided).not.toBeNull();
    expect(cam().flipNotes).toEqual([{ code: 'tools', rows: [1] }]);
    expect(useJob.getState().fileName).toBeNull();
    expect(useFlip.getState().plan).toBeNull();
    cam().undo();
    expect(cam().project!.twoSided).toBeNull();
    expect(program()).toBe(before);
  });

  it('the text of a project is the same as the file it was made from (the writer takes the helper)', () => {
    cam().setItem(text, { toolId: 'v1' });
    const at = new Date(0);
    const file = projectToFile(cam().project!, cam().settings, at, 6, { v1: 3 });
    expect(file.version).toBe(2);
    expect(projectToText(cam().project!, cam().settings, at, 6, { v1: 3 })).toBe(textOf(file));
    // without diameters the key is left off, and so it is for an empty list
    expect(projectToFile(cam().project!, cam().settings, at, 6, {})).not.toHaveProperty(
      'toolDiameters',
    );
  });
});
