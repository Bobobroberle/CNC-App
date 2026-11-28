import { circle, rectangle, type Sketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseProject,
  PROJECT_FORMAT,
  PROJECT_MAX_BYTES,
  PROJECT_VERSION,
  PROJECT_VERSION_MAX,
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

  it('keeps all of what a drawing is: both sides, its own depth and relief, the holes, every setting', () => {
    cam().setSettings({
      toolId: 't2',
      depth: 9,
      stepdown: 1.5,
      stepover: 0.3,
      feed: 1200,
      plungeFeed: 250,
      rpm: 16000,
      rampAngle: 3,
      safeZ: 7,
      engraveDepth: 0.5,
      allowance: 0.4,
      climb: false,
      tabs: { count: 3, width: 5, height: 1.5 },
    });
    cam().add([rectangle(0, 0, 200, 80), circle(60, 40, 30)]);
    cam().setTwoSided({ thickness: 12, pins: true, axis: 'y' });
    const pocket = items()[1]!;
    cam().setItem(pocket.id, { kind: 'pocket', depth: 3.5, side: 'back', relief: 'dogbone' });
    const settings = cam().settings;
    const twoSided = cam().project!.twoSided;
    const saved = items().map(({ contours: _made, ...kept }) => kept);
    const text = cam().saveProject()!;
    expect(saved.some((i) => i.registration !== undefined)).toBe(true);
    cam().close();
    useJob.getState().unload();
    useFlip.getState().cancel();
    cam().setSettings({ depth: 1, stepdown: 3, feed: 99, rpm: 5000, climb: true });
    expect(cam().openProject(text)).toEqual({ toolMissing: false });
    expect(cam().settings).toEqual(settings);
    expect(cam().project!.twoSided).toEqual(twoSided);
    expect(items().map(({ contours: _made, ...kept }) => kept)).toEqual(saved);
  });

  it('says which settings of the file it did not take – and takes the rest', () => {
    drawing();
    const file = JSON.parse(cam().saveProject()!);
    cam().close();
    cam().setSettings({ stepdown: 2, feed: 1500 });
    file.settings.stepdown = 1e-9;
    file.settings.feed = 800;
    expect(cam().openProject(JSON.stringify(file))).toEqual({
      toolMissing: false,
      dropped: ['stepdown'],
    });
    // the one that is no setting stays as it was, the other came along
    expect(cam().settings.stepdown).toBe(2);
    expect(cam().settings.feed).toBe(800);
  });

  it('says when the cutter of the file has another diameter here – the toolpaths follow this one', () => {
    drawing();
    const text = cam().saveProject()!;
    const file = JSON.parse(text);
    const t2 = useWorkshop.getState().tools.find((x) => x.id === 't2')!;
    // the diameter of the cutter it was made with is in the file
    expect(file.toolDiameter).toBe(t2.diameter);
    cam().close();
    expect(cam().openProject(text)).toEqual({ toolMissing: false });
    // the same id, another cutter now
    const tools = useWorkshop.getState().tools;
    useWorkshop.setState({ tools: tools.map((x) => (x.id === 't2' ? { ...x, diameter: 3 } : x)) });
    try {
      cam().close();
      expect(cam().openProject(text)).toEqual({
        toolMissing: false,
        toolDiffers: { file: t2.diameter, now: 3 },
      });
      // a file from before the diameter was written, or with a diameter that makes no sense, says nothing
      for (const toolDiameter of [undefined, -1, 'six', 0, 1000]) {
        cam().close();
        const old = { ...file, toolDiameter };
        expect(cam().openProject(JSON.stringify(old)), String(toolDiameter)).toEqual({
          toolMissing: false,
        });
      }
      // no cutter of that id here: that is said already, not a difference
      cam().close();
      const other = { ...file, settings: { ...file.settings, toolId: 'elsewhere' } };
      expect(cam().openProject(JSON.stringify(other))).toEqual({ toolMissing: true });
    } finally {
      useWorkshop.setState({ tools });
    }
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

  it('brings back with one step of undo the name, the settings and so the program – and forward again', () => {
    cam().setSettings({ depth: 6, rpm: 18000, feed: 1500, climb: true });
    cam().addSketch(RECT);
    cam().addSketch({ type: 'circle', d: 20 });
    const oldName = cam().project!.name;
    const before = program();
    const text = JSON.stringify({
      ...JSON.parse(cam().saveProject()!),
      name: 'andere',
      settings: { ...cam().settings, depth: 18, rpm: 9000, feed: 800, climb: false },
    });
    cam().openProject(text);
    expect(cam().project!.name).toBe('andere');
    expect(cam().settings).toMatchObject({ depth: 18, rpm: 9000, feed: 800, climb: false });
    const opened = program();
    expect(opened).not.toBe(before);
    cam().undo();
    expect(cam().project!.name).toBe(oldName);
    expect(cam().settings).toMatchObject({ depth: 6, rpm: 18000, feed: 1500, climb: true });
    expect(program()).toBe(before);
    cam().redo();
    expect(cam().project!.name).toBe('andere');
    expect(cam().settings).toMatchObject({ depth: 18, rpm: 9000, feed: 800, climb: false });
    expect(program()).toBe(opened);
    // an ordinary step back changes neither the name nor the settings
    cam().addSketch({ type: 'circle', d: 5 });
    cam().setSettings({ depth: 4 });
    cam().undo();
    expect(cam().project!.name).toBe('andere');
    expect(cam().settings.depth).toBe(4);
  });

  it('opens or does not at all: a drawing that cannot be made leaves everything as it was', () => {
    drawing();
    const text = cam().saveProject()!;
    cam().clear();
    cam().addSketch({ type: 'circle', d: 5 });
    const pastBefore = cam().past.length;
    const settingsBefore = cam().settings;
    const itemsBefore = items();
    const nameBefore = cam().project!.name;
    const load = useJob.getState().load;
    useJob.setState({
      load: () => {
        throw new Error('the drawing cannot be made');
      },
    });
    try {
      const other = {
        ...JSON.parse(text),
        name: 'andere',
        settings: { ...cam().settings, depth: 20 },
      };
      expect(cam().openProject(JSON.stringify(other))).toEqual({ error: 'invalid-project' });
    } finally {
      useJob.setState({ load });
    }
    expect(items()).toBe(itemsBefore);
    expect(cam().project!.name).toBe(nameBefore);
    expect(cam().settings).toBe(settingsBefore);
    expect(cam().past).toHaveLength(pastBefore);
    expect(cam().future).toEqual([]);
    // and the drawing still works afterwards
    cam().addSketch({ type: 'circle', d: 8 });
    expect(new Set(items().map((i) => i.id)).size).toBe(items().length);
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
    // (emptying the drawing under a running job already says it is ahead: start from nothing)
    useCam.setState({ ahead: false });
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
    // (version 2 is read since the cutters of single parts; what is above the newest this build knows is refused)
    expect(error({ ...good(), version: PROJECT_VERSION_MAX + 1 })).toBe('newer-version');
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
      // A closed contour without any length has nothing to cut along (the walk round it would never end)
      (i) => (i.source = [{ points: [{ x: 1, y: 1 }], closed: true }]),
      (i) =>
        (i.source = [
          {
            points: [
              { x: 1, y: 1 },
              { x: 1, y: 1 },
            ],
            closed: true,
          },
        ]),
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
      { points: Array.from({ length: 400_001 }, (_, k) => ({ x: k, y: 0 })), closed: true },
    ];
    expect(error(heavy)).toBe('invalid-project');
    // An open line of one spot is still read: only a closed contour needs a length
    const dot = structuredClone(base);
    dot.items[0].source = [{ points: [{ x: 1, y: 1 }], closed: false }];
    expect(error(dot)).toBeNull();
  });

  it('leaves out the peck of a hole of more steps than any drilling has – the hole is drilled in one go, and the file says which hole', () => {
    type Opened = Exclude<ReturnType<typeof parseProject>, { error: string }>;
    const read = (value: unknown) => parseProject(JSON.stringify(value)) as Opened;
    const file = good();
    file.items[1].kind = 'drill';
    file.items[1].depth = 20;
    file.items[1].peck = 2;
    file.items[1].peckRetract = 1;
    const kept = read(file);
    expect(kept.dropped).toEqual([]);
    expect(kept.project.items[1]).toMatchObject({ peck: 2, peckRetract: 1 });
    // 20 mm in steps of 0.05 is 400 pecks: still fine; 2001 pecks is not
    file.items[1].peck = 0.05;
    expect(read(file).dropped).toEqual([]);
    expect(read(file).project.items[1]).toMatchObject({ peck: 0.05, peckRetract: 1 });
    file.items[1].depth = 100.1;
    const dropped = read(file);
    expect(error(file)).toBeNull();
    // the hole is the second part of the list: named so; the peck and its retract are gone, the rest of the hole is not
    expect(dropped.dropped).toEqual(['peck.2']);
    expect(dropped.project.items[1]).not.toHaveProperty('peck');
    expect(dropped.project.items[1]).not.toHaveProperty('peckRetract');
    expect(dropped.project.items[1]).toMatchObject({ kind: 'drill', depth: 100.1 });
    // the other part is as it was
    expect(dropped.project.items[0]).toEqual(kept.project.items[0]);
    // exactly 2000 pecks is still a way to drill
    file.items[1].depth = 100;
    expect(read(file).dropped).toEqual([]);
    // Without a depth of its own the drawing's depth counts
    delete file.items[1].depth;
    file.settings.depth = 500;
    expect(read(file).dropped).toEqual(['peck.2']);
    file.settings.depth = 50;
    expect(read(file).dropped).toEqual([]);
    // a peck on a registration hole is never read by the generator and no part of the list: it is left as it is
    file.items[1].registration = 1;
    file.settings.depth = 500;
    expect(read(file).dropped).toEqual([]);
  });

  it('a hole whose peck was left out makes a program with no peck in it: the generator never sees more passes than the bound', () => {
    cam().close();
    cam().addSketch({ type: 'circle', d: 20 });
    const hole = items()[0]!;
    cam().setItem(hole.id, { kind: 'drill', depth: 40 });
    cam().setPath(hole.id, { peck: 0.05, peckRetract: 1 });
    // what the store can write: 800 pecks (a peck down to 0.05 is allowed, a depth up to 500 mm too)
    const file = JSON.parse(cam().saveProject()!);
    file.items[0].depth = 500;
    const text = JSON.stringify(file);
    cam().close();
    useJob.getState().unload();
    const result = cam().openProject(text);
    expect(result).toEqual({ toolMissing: false, dropped: ['peck.1'] });
    expect(items()[0]).not.toHaveProperty('peck');
    // one plunge to the depth, not ten thousand lines of pecks
    const moves = program()
      .split('\n')
      .filter((l) => l.startsWith('G1')).length;
    expect(moves).toBeLessThan(40);
    expect(program()).toContain('Z-500');
  });

  it('refuses a name that could put lines into the program or the file name', () => {
    for (const name of [
      'x\nG0 X5000 Y5000',
      'x\r(',
      'a\u0000b',
      'a\tb',
      'a\u007fb',
      'n'.repeat(121),
    ]) {
      expect(error({ ...good(), name }), JSON.stringify(name)).toBe('invalid-project');
    }
    for (const name of ['Schild', 'Türschild Ø 8', 'n'.repeat(120)]) {
      expect(error({ ...good(), name }), name).toBeNull();
    }
  });

  it('leaves out a setting no machine would have – a damaged file cannot stall the drawing', () => {
    const settings = (patch: Record<string, unknown>) => {
      const parsed = parseProject(
        JSON.stringify({ ...good(), settings: { ...good().settings, ...patch } }),
      );
      return 'error' in parsed ? null : parsed.settings;
    };
    // out of range, not a number, not finite: not taken (what is there stays as it is)
    const out = settings({
      stepdown: 1e-9,
      depth: 1e6,
      feed: 0,
      plungeFeed: 1e9,
      rpm: -5,
      rampAngle: 120,
      safeZ: -1,
      engraveDepth: 'deep',
      stepover: 50,
      allowance: 99,
      tabs: { count: 1e9, width: 6, height: 2 },
    })!;
    for (const key of [
      'stepdown',
      'depth',
      'feed',
      'plungeFeed',
      'rpm',
      'rampAngle',
      'safeZ',
      'engraveDepth',
      'stepover',
      'allowance',
      'tabs',
    ]) {
      expect(out, key).not.toHaveProperty(key);
    }
    // the edges are fine
    expect(
      settings({
        stepdown: 0.05,
        depth: 100,
        feed: 20000,
        rpm: 1,
        rampAngle: 90,
        stepover: 1,
        allowance: 0,
        tabs: { count: 0, width: 0.1, height: 100 },
      }),
    ).toMatchObject({
      stepdown: 0.05,
      depth: 100,
      feed: 20000,
      rpm: 1,
      rampAngle: 90,
      stepover: 1,
      allowance: 0,
      tabs: { count: 0, width: 0.1, height: 100 },
    });
    // a depth of one part that no cutter reaches
    const deep = good();
    deep.items[0].depth = 501;
    expect(error(deep)).toBe('invalid-project');
    deep.items[0].depth = 500;
    expect(error(deep)).toBeNull();
  });

  it('says which settings it left out, and takes what the fields of the CAM take', () => {
    const read = (settings: Record<string, unknown>, depth?: number) => {
      const file = good();
      if (depth !== undefined) file.items[0].depth = depth;
      return parseProject(JSON.stringify({ ...file, settings: { ...file.settings, ...settings } }));
    };
    const ok = (r: ReturnType<typeof parseProject>) =>
      r as Exclude<ReturnType<typeof parseProject>, { error: string }>;
    // what the app saved has nothing left out
    expect(ok(read({})).dropped).toEqual([]);
    // the fields of the CAM take 0.01 mm of stepdown, 1 % of stepover, any speed above 0, a safe height of 0
    const edge = ok(read({ stepdown: 0.01, stepover: 0.01, rpm: 1, safeZ: 0, depth: 6 }));
    expect(edge.dropped).toEqual([]);
    expect(edge.settings).toMatchObject({ stepdown: 0.01, stepover: 0.01, rpm: 1, safeZ: 0 });
    // a bahn distance over the cutter's width: the field takes it, so the file does
    expect(ok(read({ stepover: 1.5 })).settings.stepover).toBe(1.5);
    expect(ok(read({ stepover: 10.5 })).dropped).toEqual(['stepover']);
    // what no machine has is named, in the order of the settings
    const bad = ok(
      read({ feed: 0, stepdown: 1e-9, tabs: { count: 1e9, width: 6, height: 2 }, allowance: 99 }),
    );
    expect(bad.dropped).toEqual(['stepdown', 'feed', 'allowance', 'tabs']);
    // a stepdown that would make thousands of passes is left out as well (and said)
    const passes = ok(read({ stepdown: 0.01, depth: 100 }));
    expect(passes.settings).not.toHaveProperty('stepdown');
    expect(passes.dropped).toEqual(['stepdown']);
    // … also by the deepest single part
    const part = ok(read({ stepdown: 0.05, depth: 6 }, 200));
    expect(part.dropped).toEqual(['stepdown']);
    // 2000 passes exactly is still a way to cut
    expect(ok(read({ stepdown: 0.05, depth: 100 })).dropped).toEqual([]);
  });

  it('refuses numbers that are whole but no ids, a circle that is not where its polygon is, a back without turning', () => {
    const file = good();
    for (const id of [Number.MAX_SAFE_INTEGER + 2, 1e300]) {
      const big = structuredClone(file);
      big.items[0].id = id;
      big.items[0].group = id;
      expect(error(big), String(id)).toBe('invalid-project');
    }
    // the hole drills where the circle is: the polygon that is drawn must lie on it
    const hole = structuredClone(file);
    const circleItem = hole.items.find(
      (i: { source: { circle?: object }[] }) => i.source[0]!.circle,
    )!;
    circleItem.source[0].points = circleItem.source[0].points.map(
      (p: { x: number; y: number }) => ({
        x: p.x + 500,
        y: p.y + 500,
      }),
    );
    expect(error(hole)).toBe('invalid-project');
    // a back side that no two-sided state turns over
    const back = structuredClone(file);
    back.items[0].side = 'back';
    expect(back.twoSided).toBeNull();
    expect(error(back)).toBe('invalid-project');
    back.twoSided = { axis: 'x', pins: false, autoHoles: true };
    expect(error(back)).toBeNull();
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
      // a file that does not say is read as off, whatever a new drawing starts with
      routeShort: false,
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
      expect(p.settings, JSON.stringify(settings)).toEqual({ routeShort: false });
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
