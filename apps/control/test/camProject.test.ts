import { circle, rectangle, type Sketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseProject,
  PROJECT_FORMAT,
  PROJECT_MAX_BYTES,
  PROJECT_VERSION,
  projectToFile,
  projectToText,
} from '../src/lib/camProject';
import { jobNames, useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { useWorkshop } from '../src/store/workshop';
import '../src/store/underway';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const RECT: Sketch = { type: 'rect', w: 100, h: 60, r: 0 };

/** A drawing with a plate, a hole, a text and a pocket of its own direction. */
function drawing() {
  cam().addSketch(RECT);
  cam().addSketch({ type: 'circle', d: 20 });
  cam().addText('Hallo', { height: 10 });
  cam().setItem(items()[0]!.id, { climb: false });
}

describe('a drawing as a project file', () => {
  beforeEach(() => {
    cam().close();
    useJob.getState().unload();
    useFlip.getState().cancel();
    useRun.getState().reset();
    useMachine.setState({ fileJob: null, stream: null, lostInJob: null });
    cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1, climb: true });
    useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  });

  it('is saved, read and made into the program it was – byte for byte', () => {
    drawing();
    const before = program();
    expect(before).not.toBe('');
    const text = cam().saveProject()!;
    expect(JSON.parse(text)).toMatchObject({ format: PROJECT_FORMAT, version: PROJECT_VERSION });
    // the contours where they lie are made from the source: they are not in the file
    expect(text).not.toContain('"contours"');
    cam().close();
    useJob.getState().unload();
    expect(cam().openProject(text)).toEqual({ toolMissing: false });
    expect(items()).toHaveLength(3);
    expect(program()).toBe(before);
    // the part with its own direction kept it
    expect(items()[0]!.climb).toBe(false);
  });

  it('keeps the sketches and the texts changeable, and what was made from them', () => {
    drawing();
    const sketches = items().map((i) => i.sketch);
    const text = cam().saveProject()!;
    cam().close();
    cam().openProject(text);
    expect(items().map((i) => i.sketch)).toEqual(sketches);
    expect(items().find((i) => i.text === 'Hallo')?.textStyle).toBeDefined();
  });

  it('puts new things above every number the file already uses', () => {
    drawing();
    const text = cam().saveProject()!;
    const used = new Set(items().flatMap((i) => [i.id, i.group]));
    cam().close();
    cam().openProject(text);
    cam().addSketch({ type: 'circle', d: 8 });
    const added = items().at(-1)!;
    expect(used.has(added.id)).toBe(false);
    expect(used.has(added.group)).toBe(false);
    expect(new Set(items().map((i) => i.id)).size).toBe(items().length);
  });

  it('opens in place of the drawing, and one step of undo brings the old drawing back', () => {
    drawing();
    const text = cam().saveProject()!;
    cam().clear();
    cam().addSketch({ type: 'circle', d: 5 });
    expect(items()).toHaveLength(1);
    cam().openProject(text);
    expect(items()).toHaveLength(3);
    cam().undo();
    expect(items()).toHaveLength(1);
    expect(items()[0]!.sketch).toEqual({ type: 'circle', d: 5 });
  });

  it('keeps the cutter that is chosen when the workshop has not the one of the file – and says so', () => {
    drawing();
    const parsed = JSON.parse(cam().saveProject()!);
    parsed.settings.toolId = 'a-tool-from-another-workshop';
    parsed.settings.feed = 777;
    cam().close();
    expect(cam().openProject(JSON.stringify(parsed))).toEqual({ toolMissing: true });
    expect(cam().settings.toolId).toBe('t2');
    // the rest of the settings came along
    expect(cam().settings.feed).toBe(777);
  });

  it('never changes the program under a job that is under way – the drawing is ahead of it', () => {
    drawing();
    const text = cam().saveProject()!;
    const name = useJob.getState().fileName;
    const lines = useJob.getState().lines;
    // the job runs from the SD card; the drawing is emptied (the program stays) and the project opened
    useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
    cam().clear();
    // a deeper cut than the one that runs: the program of this drawing would differ
    const deeper = JSON.parse(text);
    deeper.settings.depth = 3;
    expect(cam().openProject(JSON.stringify(deeper))).toEqual({ toolMissing: false });
    expect(items()).toHaveLength(3);
    expect(useJob.getState().fileName).toBe(name);
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    useMachine.setState({ fileJob: null });
  });

  it('does not take a program that is not the drawing’s own', () => {
    drawing();
    const text = cam().saveProject()!;
    cam().close();
    // another program lies on the table, under a name the project does not have
    useJob.getState().unload();
    useJob.getState().load('fremd.nc', 'G21\nG0 X1\n');
    cam().openProject(text);
    expect(useJob.getState().fileName).toBe('fremd.nc');
    expect(useJob.getState().lines.join('\n')).toBe('G21\nG0 X1');
    // a project named like the file that lies there is the same job: its program goes on the table
    const named = JSON.parse(text);
    named.name = 'fremd';
    cam().openProject(JSON.stringify(named));
    expect(useJob.getState().fileName).toBe(jobNames('fremd').single);
    expect(useJob.getState().lines.join('\n')).not.toBe('G21\nG0 X1');
  });
});

describe('what a project file must be to be opened', () => {
  const good = () => {
    cam().close();
    cam().addSketch(RECT);
    cam().addSketch({ type: 'circle', d: 20 });
    return JSON.parse(projectToText(cam().project!, cam().settings));
  };
  const error = (value: unknown) => {
    const r = parseProject(typeof value === 'string' ? value : JSON.stringify(value));
    return 'error' in r ? r.error : null;
  };

  it('accepts what was saved, and nothing is left over of what was derived', () => {
    const file = good();
    expect(error(file)).toBeNull();
    const parsed = parseProject(JSON.stringify(file)) as Exclude<
      ReturnType<typeof parseProject>,
      { error: string }
    >;
    expect(parsed.project.notes).toEqual([]);
    expect(parsed.project.skipped).toEqual({});
    expect(parsed.highestId).toBe(
      Math.max(...file.items.flatMap((i: { id: number; group: number }) => [i.id, i.group])),
    );
  });

  it('refuses with a stable reason: not JSON, not ours, newer, too large, broken', () => {
    expect(error('{')).toBe('invalid-json');
    expect(error(null)).toBe('wrong-format');
    expect(error([])).toBe('wrong-format');
    expect(error({ format: 'something-else' })).toBe('wrong-format');
    expect(error({ ...good(), version: PROJECT_VERSION + 1 })).toBe('newer-version');
    expect(error({ ...good(), version: 'one' })).toBe('newer-version');
    expect(error('x'.repeat(PROJECT_MAX_BYTES + 1))).toBe('too-large');
    for (const patch of [
      { name: ' ' },
      { name: 5 },
      { items: 'x' },
      { items: Array.from({ length: 2001 }, () => ({})) },
      { twoSided: 'yes' },
      { twoSided: { axis: 'z', pins: false, autoHoles: true } },
      { twoSided: { axis: 'x', pins: 1, autoHoles: true } },
      { twoSided: { axis: 'x', pins: false, autoHoles: 'y' } },
      { twoSided: { axis: 'x', pins: false, autoHoles: true, thickness: -2 } },
    ]) {
      expect(error({ ...good(), ...patch }), JSON.stringify(patch)).toBe('invalid-project');
    }
  });

  it('refuses items that are no items: numbers that are not finite, a kind that does not exist …', () => {
    const base = good();
    const broken: Array<(item: Record<string, unknown>) => void> = [
      (i) => (i.id = -1),
      (i) => (i.id = 1.5),
      (i) => (i.group = 'a'),
      (i) => (i.kind = 'saw'),
      (i) => (i.tabs = 'yes'),
      (i) => (i.relief = 'round'),
      (i) => (i.side = 'top'),
      (i) => (i.depth = 0),
      (i) => (i.depth = Number.NaN),
      (i) => (i.climb = 'yes'),
      (i) => (i.registration = 3),
      (i) => (i.text = 5),
      (i) => (i.placement = { a: 1 }),
      (i) => (i.placement = { a: 1, b: 0, c: 0, d: 1, e: Number.POSITIVE_INFINITY, f: 0 }),
      (i) => (i.source = 'x'),
      (i) => (i.source = [{ points: 'x', closed: true }]),
      (i) => (i.source = [{ points: [{ x: 0, y: 'a' }], closed: true }]),
      (i) => (i.source = [{ points: [{ x: 0, y: 0 }], closed: 'yes' }]),
      (i) =>
        (i.source = [{ points: [{ x: 0, y: 0 }], closed: true, circle: { cx: 0, cy: 0, r: 0 } }]),
      (i) => (i.source = [{ points: [{ x: 0, y: 0 }], closed: true, layer: 3 }]),
    ];
    for (const [n, change] of broken.entries()) {
      const file = structuredClone(base);
      change(file.items[0]);
      expect(error(file), `change ${n}`).toBe('invalid-project');
    }
    const twice = structuredClone(base);
    twice.items[1].id = twice.items[0].id;
    expect(error(twice)).toBe('invalid-project');
    // far too many points for any drawing
    const heavy = structuredClone(base);
    heavy.items[0].source = [
      { points: Array.from({ length: 400_001 }, () => ({ x: 0, y: 0 })), closed: true },
    ];
    expect(error(heavy)).toBe('invalid-project');
  });

  it('drops a sketch or a text style that cannot be trusted – the item keeps its contours', () => {
    const file = good();
    file.items[0].sketch = { type: 'rect', w: -1, h: 5, r: 0 };
    file.items[1].sketch = { type: 'blob' };
    const parsed = parseProject(JSON.stringify(file)) as Exclude<
      ReturnType<typeof parseProject>,
      { error: string }
    >;
    expect(parsed.project.items.every((i) => i.sketch === undefined)).toBe(true);
    expect(parsed.project.items[0]!.source).toEqual(file.items[0].source);
    // and every kind of sketch that is fine passes (and is tidied: nothing too small)
    const kinds = [
      { type: 'rect', w: 10, h: 5, r: 1 },
      { type: 'circle', d: 4 },
      { type: 'slot', l: 20, w: 5 },
      { type: 'grid', d: 4, nx: 3, ny: 2, px: 10, py: 10 },
      { type: 'text', text: 'A', height: 8, spacing: 0, lineSpacing: 1.6, align: 'left' },
    ];
    for (const sketch of kinds) {
      const f = good();
      f.items[0].sketch = sketch;
      const p = parseProject(JSON.stringify(f)) as Exclude<
        ReturnType<typeof parseProject>,
        { error: string }
      >;
      expect(p.project.items[0]!.sketch?.type, sketch.type).toBe(sketch.type);
    }
    // wrong fields of each kind
    for (const sketch of [
      { type: 'rect', w: 10, h: 5 },
      { type: 'circle', d: 'x' },
      { type: 'slot', l: 20 },
      { type: 'grid', d: 4, nx: 3, ny: 2, px: 10 },
      { type: 'text', text: 'A', height: 8, spacing: 0, lineSpacing: 1.6, align: 'justify' },
      null,
      'rect',
    ]) {
      const f = good();
      f.items[0].sketch = sketch;
      const p = parseProject(JSON.stringify(f)) as Exclude<
        ReturnType<typeof parseProject>,
        { error: string }
      >;
      expect(p.project.items[0]!.sketch, JSON.stringify(sketch)).toBeUndefined();
    }
    const style = (v: unknown) => {
      const f = good();
      f.items[0].textStyle = v;
      const p = parseProject(JSON.stringify(f)) as Exclude<
        ReturnType<typeof parseProject>,
        { error: string }
      >;
      return p.project.items[0]!.textStyle;
    };
    expect(style({ options: { height: 8 }, centre: { x: 1, y: 2 } })).toEqual({
      options: { height: 8 },
      centre: { x: 1, y: 2 },
    });
    expect(
      style({
        options: { height: 8, spacing: 0.1, lineSpacing: 1.6, align: 'center', vertical: 'middle' },
        centre: { x: 1, y: 2 },
      }),
    ).toBeDefined();
    for (const bad of [
      null,
      { options: { height: 8 } },
      { options: { height: 0 }, centre: { x: 1, y: 2 } },
      { options: { height: 8, spacing: 'x' }, centre: { x: 1, y: 2 } },
      { options: { height: 8, lineSpacing: 'x' }, centre: { x: 1, y: 2 } },
      { options: { height: 8, align: 'justify' }, centre: { x: 1, y: 2 } },
      { options: { height: 8, vertical: 'top' }, centre: { x: 1, y: 2 } },
      { options: 'x', centre: { x: 1, y: 2 } },
    ]) {
      expect(style(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('takes the settings that make sense and leaves the others as they are', () => {
    const file = good();
    file.settings = {
      toolId: 't2',
      rpm: 12000,
      depth: -3,
      feed: 'fast',
      stepdown: 2,
      allowance: 0.2,
      climb: false,
      tabs: { count: 3, width: 4, height: 1 },
      unknown: 1,
    };
    const parsed = parseProject(JSON.stringify(file)) as Exclude<
      ReturnType<typeof parseProject>,
      { error: string }
    >;
    expect(parsed.settings).toEqual({
      toolId: 't2',
      rpm: 12000,
      stepdown: 2,
      allowance: 0.2,
      climb: false,
      tabs: { count: 3, width: 4, height: 1 },
    });
    for (const settings of [
      null,
      'x',
      { tabs: { count: -1, width: 4, height: 1 } },
      { tabs: 3 },
      { toolId: '' },
      { allowance: -1 },
      { climb: 'y' },
    ]) {
      const f = good();
      f.settings = settings;
      const p = parseProject(JSON.stringify(f)) as Exclude<
        ReturnType<typeof parseProject>,
        { error: string }
      >;
      expect(p.settings, JSON.stringify(settings)).toEqual({});
    }
  });

  it('writes a file of its own: format, version, time, name and the two-sided state', () => {
    cam().close();
    cam().add([rectangle(0, 0, 200, 80), circle(60, 40, 30)]);
    cam().setTwoSided({ thickness: 12 });
    const file = projectToFile(cam().project!, cam().settings, new Date('2026-01-02T03:04:05Z'));
    expect(file).toMatchObject({
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      savedAt: '2026-01-02T03:04:05.000Z',
      name: 'zeichnung',
    });
    expect(file.twoSided).toMatchObject({ thickness: 12 });
    // the registration holes are part of the drawing and stay in it
    expect(file.items.some((i) => i.registration !== undefined)).toBe(true);
    const back = parseProject(JSON.stringify(file)) as Exclude<
      ReturnType<typeof parseProject>,
      { error: string }
    >;
    expect(back.project.twoSided).toMatchObject({ thickness: 12 });
  });
});
