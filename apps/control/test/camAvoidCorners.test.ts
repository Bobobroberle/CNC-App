import { circle, operationTabSites, rectangle, type Contour } from '@lowrider/cam';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { itemTabMarks, itemTabs, tabValues, tidySpec } from '../src/lib/camTabs';
import { parseProject } from '../src/lib/camProject';
import { camToolDiameter, itemOperation, useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useWorkshop } from '../src/store/workshop';
import '../src/store/underway';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const first = () => items()[0]!;
const program = () => useJob.getState().lines.join('\n');
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** What a new drawing starts with: tabs kept off the corners, travel kept short */
const NEW_DRAWING = {
  toolId: 't2',
  depth: 6,
  stepdown: 6,
  rampAngle: 90,
  allowance: 0,
  engraveDepth: 1,
  climb: true,
  routeShort: true,
} as const;

/**
 * The stretches the cutter is lifted over tabs in the program on the table: where it goes up to the
 * height of the tabs and where it comes down again (x, y, x, y). Tabs 2 mm high of a cut 6 deep in
 * one pass: they stand at z −4.
 */
function lifts(z = -4, text = program()): number[][] {
  let x = 0;
  let y = 0;
  let at = 0;
  let from: number[] | null = null;
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
    // (a lift that ends where it began is no lift: the library may make one where a stretch ends on a vertex)
    else if (was === z && at !== z && (x !== from![0] || y !== from![1]))
      out.push([...from!, x, y]);
  }
  return out;
}

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
/** A six-sided plate, not quite regular (a regular one puts tabs exactly on the corners of the cutter's loop – see below) */
const hexagon = (): Contour => ({
  closed: true,
  points: Array.from({ length: 6 }, (_, k) => ({
    x: 30 + 30 * Math.cos((k * Math.PI) / 3) + (k === 2 ? 1.7 : 0),
    y: 30 + 30 * Math.sin((k * Math.PI) / 3) - (k === 4 ? 2.3 : 0),
  })),
});

beforeEach(() => {
  cam().close();
  cam().setPlacing(null);
  useJob.getState().unload();
  useFlip.getState().cancel();
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  cam().setSettings({
    ...NEW_DRAWING,
    tabs: { count: 3, width: 6, height: 2, avoidCorners: true },
  });
  cam().open();
});

describe('a project that an older app wrote is cut as it was', () => {
  it('a drawing of one side: the same program, byte for byte, in a session that starts with the new defaults', () => {
    const before = fixture('oldSingle.nc');
    expect(cam().settings.routeShort).toBe(true);
    expect(cam().settings.tabs.avoidCorners).toBe(true);
    // the file has neither key
    const file = JSON.parse(fixture('oldSingle.lowrider.json'));
    expect(file.settings).not.toHaveProperty('routeShort');
    expect(file.settings.tabs).not.toHaveProperty('avoidCorners');
    expect(cam().openProject(fixture('oldSingle.lowrider.json'))).toEqual({ toolMissing: false });
    expect(program()).toBe(before);
    // what the file does not say is off – not what the session had
    expect(cam().settings.routeShort).toBe(false);
    expect(cam().settings.tabs).toEqual({ count: 3, width: 6, height: 2 });
    // …and the test is no empty one: with the new defaults the same drawing is cut differently
    cam().setSettings({ routeShort: true, tabs: { ...cam().settings.tabs, avoidCorners: true } });
    cam().remake();
    expect(program()).not.toBe(before);
    // each on its own does it (a tab stood on a corner; the holes were set in a bad order)
    cam().setSettings({ routeShort: false });
    cam().remake();
    const cornersOnly = program();
    expect(cornersOnly).not.toBe(before);
    cam().setSettings({ routeShort: true, tabs: { count: 3, width: 6, height: 2 } });
    cam().remake();
    const routeOnly = program();
    expect(routeOnly).not.toBe(before);
    expect(routeOnly).not.toBe(cornersOnly);
  });

  it('a drawing of two sides: the front and the back are the programs they were', () => {
    cam().openProject(fixture('oldTwoSided.lowrider.json'));
    expect(program()).toBe(fixture('oldTwoSided.nc'));
    expect(useFlip.getState().plan?.back.text).toBe(fixture('oldTwoSidedBack.nc'));
    expect(cam().settings.routeShort).toBe(false);
  });

  it('leaves the settings as the file made them for the next drawing of the session – like every other setting', () => {
    cam().openProject(fixture('oldSingle.lowrider.json'));
    expect(cam().settings.routeShort).toBe(false);
    cam().close();
    cam().open();
    // (a fresh session starts with both on; one that has opened an older file goes on with that file's)
    expect(cam().settings.routeShort).toBe(false);
    expect(cam().settings.tabs.avoidCorners).toBeUndefined();
  });

  it('keeps nothing of the session when the file has no settings at all', () => {
    const file = JSON.parse(fixture('oldSingle.lowrider.json'));
    delete file.settings;
    expect(cam().openProject(JSON.stringify(file))).toEqual({ toolMissing: false });
    expect(cam().settings.routeShort).toBe(false);
    expect(cam().settings.tabs.avoidCorners).toBeUndefined();
  });

  it('reads a file that says what it wants: on, and off', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    cam().setSettings({
      routeShort: false,
      tabs: { count: 3, width: 6, height: 2, avoidCorners: true },
    });
    const text = cam().saveProject()!;
    const file = JSON.parse(text);
    expect(file.settings.routeShort).toBe(false);
    expect(file.settings.tabs.avoidCorners).toBe(true);
    cam().close();
    cam().setSettings({ routeShort: true, tabs: { count: 4, width: 6, height: 2 } });
    cam().openProject(text);
    expect(cam().settings.routeShort).toBe(false);
    expect(cam().settings.tabs).toEqual({ count: 3, width: 6, height: 2, avoidCorners: true });
    // an explicit "off" is the same as none
    file.settings.tabs.avoidCorners = false;
    cam().openProject(JSON.stringify(file));
    expect(cam().settings.tabs).toEqual({ count: 3, width: 6, height: 2 });
  });
});

describe('the strict reading of the new keys', () => {
  const good = () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    return JSON.parse(cam().saveProject()!);
  };

  it('refuses an item whose tabs have a wrong "Ecken meiden"', () => {
    const file = good();
    file.items[0].tabSpec = { mode: 'auto', count: 2, avoidCorners: 'yes' };
    expect(parseProject(JSON.stringify(file))).toEqual({ error: 'invalid-project' });
    file.items[0].tabSpec = { mode: 'auto', count: 2, avoidCorners: 1 };
    expect(parseProject(JSON.stringify(file))).toEqual({ error: 'invalid-project' });
    file.items[0].tabSpec = { mode: 'auto', count: 2, avoidCorners: false };
    const read = parseProject(JSON.stringify(file)) as Exclude<
      ReturnType<typeof parseProject>,
      { error: string }
    >;
    expect(read.project.items[0]!.tabSpec).toEqual({ mode: 'auto', count: 2, avoidCorners: false });
  });

  it('leaves out the drawing’s default that is no boolean – and says so', () => {
    const file = good();
    file.settings.tabs.avoidCorners = 'on';
    const read = parseProject(JSON.stringify(file)) as Exclude<
      ReturnType<typeof parseProject>,
      { error: string }
    >;
    expect(read.settings.tabs).toBeUndefined();
    expect(read.dropped).toContain('tabs');
    // "Fahrwege kürzen" the same: the wrong value is left out, and the file is read as off
    const other = good();
    other.settings.routeShort = 'short';
    const r = parseProject(JSON.stringify(other)) as Exclude<
      ReturnType<typeof parseProject>,
      { error: string }
    >;
    expect(r.dropped).toContain('routeShort');
    expect(r.settings.routeShort).toBe(false);
  });
});

describe('"Ecken meiden" as a value of the tabs', () => {
  it('is the drawing’s default until the part says otherwise – and off where nobody said', () => {
    const on = { count: 4, width: 6, height: 2, avoidCorners: true };
    const off = { count: 4, width: 6, height: 2 };
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    expect(tabValues(first(), on).avoidCorners).toBe(true);
    expect(tabValues(first(), off).avoidCorners).toBe(false);
    expect(tabValues({ tabSpec: { mode: 'auto', avoidCorners: false } }, on).avoidCorners).toBe(
      false,
    );
    expect(tabValues({ tabSpec: { mode: 'auto', avoidCorners: true } }, off).avoidCorners).toBe(
      true,
    );
    // the tabs the cut gets carry it where it is on, and nowhere else
    expect(itemTabs(first(), 0, on)).toBe(on);
    expect(itemTabs({ ...first(), tabSpec: { mode: 'auto', count: 2 } }, 0, on)).toEqual({
      count: 2,
      width: 6,
      height: 2,
      avoidCorners: true,
    });
    expect(itemTabs({ ...first(), tabSpec: { mode: 'auto', count: 2 } }, 0, off)).toEqual({
      count: 2,
      width: 6,
      height: 2,
    });
    // places put by hand are never moved: nothing of it in the tabs the cut gets
    expect(
      itemTabs(
        { ...first(), tabSpec: { mode: 'manual', at: [{ c: 0, u: 0.5 }], avoidCorners: true } },
        0,
        on,
      ),
    ).toEqual({ count: 1, width: 6, height: 2, at: [0.5] });
  });

  it('is kept in a spec when it says something, and a spec of nothing else is none', () => {
    expect(tidySpec({ mode: 'auto', avoidCorners: false })).toEqual({
      mode: 'auto',
      avoidCorners: false,
    });
    expect(tidySpec({ mode: 'auto', avoidCorners: true })).toEqual({
      mode: 'auto',
      avoidCorners: true,
    });
    expect(tidySpec({ mode: 'auto' })).toBeUndefined();
    expect(tidySpec({ mode: 'auto', avoidCorners: undefined })).toBeUndefined();
    expect(tidySpec({ mode: 'manual', avoidCorners: true })).toEqual({
      mode: 'manual',
      avoidCorners: true,
      at: [],
    });
  });

  it('is a choice of the part only where it says other than the default – and one step each', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    const id = first().id;
    const steps = () => cam().past.length;
    const was = steps();
    // what the default says is no choice of the part's
    cam().setTabs(id, { avoidCorners: true });
    expect(first().tabSpec).toBeUndefined();
    cam().setTabs(id, { avoidCorners: false });
    expect(first().tabSpec).toEqual({ mode: 'auto', avoidCorners: false });
    cam().setTabs(id, { avoidCorners: true });
    expect(first().tabSpec).toBeUndefined();
    cam().setTabs(id, { avoidCorners: false });
    // a switch is a step of its own each time – never merged like a number being typed
    expect(steps() - was).toBe(3);
    // the other values do not touch it
    cam().setTabs(id, { count: 2 });
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 2, avoidCorners: false });
    // undefined: the default again
    cam().setTabs(id, { avoidCorners: undefined });
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 2 });
    // and with the default the other way round
    cam().setSettings({ tabs: { count: 4, width: 6, height: 2 } });
    cam().setTabs(id, { avoidCorners: false });
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 2 });
    cam().setTabs(id, { avoidCorners: true });
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 2, avoidCorners: true });
    cam().undo();
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 2 });
  });
});

describe('what is drawn is what is cut, with the tabs kept off the corners and without', () => {
  it('a plate, by hand-checked numbers: the tab on a corner steps aside to the nearest clear place', () => {
    // 100 × 60 round is 320 mm: three tabs at 53⅓, 160 and 266⅔. The corner (100/60) is at 160.
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    const id = first().id;
    // off: the middle tab stands on the corner – the cutter is up over the corner, round the arc it makes there
    // (where on that arc the lift begins is for the library to say: every point of the arc is as near to the corner)
    cam().setTabs(id, { avoidCorners: false });
    const marksOff = itemTabMarks(first(), cam().settings.tabs, camToolDiameter(cam().settings));
    expect(marksOff.map((m) => [m.x, m.y])).toEqual([
      [expect.closeTo(53.333, 3), 0],
      [100, 60],
      [0, expect.closeTo(53.333, 3)],
    ]);
    const around = lifts();
    expect(around).toHaveLength(3);
    // one lift begins on the right side of the plate and ends beyond its upper edge: it goes round the corner
    expect(around.filter((l) => l[0] === 103 && l[3]! > 60.5)).toHaveLength(1);
    // on (the drawing's default): the same tab stands 6 mm below the corner, on the straight side –
    // the lifted stretch (width 6 + the cutter 6) ends where the cutter's arc round the corner begins
    cam().setTabs(id, { avoidCorners: undefined });
    const marksOn = itemTabMarks(first(), cam().settings.tabs, camToolDiameter(cam().settings));
    expect(marksOn[1]!.x).toBeCloseTo(100, 6);
    expect(marksOn[1]!.y).toBeCloseTo(54, 6);
    expect(lifts()).toContainEqual([103, 48, 103, 60]);
    expect(lifts()).toHaveLength(3);
    // the two that stood clear did not move
    expect(marksOn[0]!.x).toBeCloseTo(53.333, 3);
    expect(marksOn[2]!.y).toBeCloseTo(53.333, 3);
  });

  it('every mark is a place the cut lifts at: the program of the places by hand is the program of the automatic ones', () => {
    const shapes: { name: string; draw: () => void }[] = [
      { name: 'a plate', draw: () => cam().add([rectangle(0, 0, 100, 60)]) },
      { name: 'an L', draw: () => cam().add([lshape()]) },
      { name: 'a hexagon', draw: () => cam().add([hexagon()]) },
      { name: 'a small square', draw: () => cam().add([rectangle(0, 0, 14, 14)]) },
      { name: 'a round plate', draw: () => cam().add([circle(30, 30, 50)]) },
      {
        name: 'a plate with a hole',
        draw: () => cam().add([rectangle(0, 0, 100, 60), circle(50, 30, 12)]),
      },
    ];
    for (const shape of shapes) {
      for (const kind of ['outside', 'inside'] as const) {
        for (const count of [1, 2, 3, 5, 8]) {
          for (const avoid of [false, true]) {
            cam().close();
            useJob.getState().unload();
            cam().setSettings({ tabs: { count, width: 6, height: 2 } });
            cam().open();
            shape.draw();
            const part = items().find((i) => i.kind === 'outside') ?? first();
            cam().setItem(part.id, { kind, tabs: true });
            cam().setTabs(part.id, { avoidCorners: avoid ? true : false });
            if (avoid) cam().setSettings({ tabs: { count, width: 6, height: 2 } });
            // (with the default off, an explicit "on" is the part's own: the spec says so either way)
            const now = items().find((i) => i.id === part.id)!;
            expect(tabValues(now, cam().settings.tabs).avoidCorners).toBe(avoid);
            const tool = camToolDiameter(cam().settings);
            const marks = itemTabMarks(now, cam().settings.tabs, tool);
            // the drawing asks the function the cut asks, with the operation the cut uses
            const op = itemOperation(now, cam().settings, 0);
            const sites = operationTabSites(
              now.contours[0]!,
              { kind: op.kind, tabs: op.tabs },
              { toolDiameter: tool },
            );
            expect(
              marks.filter((m) => m.c === 0).map((m) => m.u),
              `${shape.name} ${kind} ${count} ${avoid}`,
            ).toEqual(sites.map((s) => s.u));
            // by hand at those places gives the program the automatic spread gave – the places are the cut's
            const auto = lifts();
            expect(program(), `${shape.name} ${kind} ${count} ${avoid}`).not.toBe('');
            // (a part of 14 mm all round is lifted over everywhere with some tabs: no stretch to tell apart)
            if (shape.name !== 'a small square') expect(auto.length).toBeGreaterThan(0);
            expect(cam().manualTabs(part.id)).toBe(true);
            expect(lifts(), `${shape.name} ${kind} ${count} ${avoid}`).toEqual(auto);
          }
        }
      }
    }
  });

  it('a part on the back of a two-sided drawing, cut from the mirrored geometry: the same places', () => {
    cam().close();
    cam().setSettings({ tabs: { count: 3, width: 6, height: 2, avoidCorners: true } });
    cam().open();
    cam().add([lshape()]);
    const id = first().id;
    cam().setItem(id, { kind: 'outside', tabs: true });
    cam().setTwoSided({ thickness: 12 });
    cam().setItem(id, { side: 'back' });
    const plan = () => useFlip.getState().plan;
    expect(plan()).not.toBeNull();
    const auto = plan()!.back.text;
    expect(auto).toContain('G');
    expect(cam().manualTabs(id)).toBe(true);
    // the places by hand (read from the drawing, as seen from the front) give the very program of the back
    expect(plan()!.back.text).toBe(auto);
    // and the other way is another program: with the default off the tabs stand elsewhere
    cam().spreadTabs(id);
    cam().setTabs(id, { avoidCorners: false });
    expect(plan()!.back.text).not.toBe(auto);
  });

  it('a hand-placed tab is never moved by "Ecken meiden"', () => {
    cam().add([rectangle(0, 0, 100, 60)]);
    const id = first().id;
    cam().manualTabs(id);
    // 0.5 of the line: way 160, the corner
    cam().moveTab(id, 0, 0.5);
    const where = first().tabSpec!.at!;
    const withOn = program();
    cam().setTabs(id, { avoidCorners: false });
    cam().setTabs(id, { avoidCorners: true });
    expect(first().tabSpec!.at).toEqual(where);
    expect(program()).toBe(withOn);
    const marks = itemTabMarks(first(), cam().settings.tabs, 6);
    expect(marks.find((m) => m.u === 0.5)!.y).toBeCloseTo(60, 6);
  });

  it('an edit of the chosen cutter’s diameter in the tool list makes the program anew: the picture and the program agree', () => {
    const tool = useWorkshop.getState().tools.find((x) => x.id === 't2')!;
    try {
      cam().add([lshape()]);
      const id = first().id;
      cam().setItem(id, { kind: 'inside', tabs: true });
      const six = program();
      const marksSix = itemTabMarks(first(), cam().settings.tabs, camToolDiameter(cam().settings));
      // the diameter of the cutter in use is edited in the tool list (not another cutter chosen)
      useWorkshop.getState().saveTool({ ...tool, diameter: 14 });
      expect(camToolDiameter(cam().settings)).toBe(14);
      const marksFourteen = itemTabMarks(first(), cam().settings.tabs, 14);
      // the picture follows the diameter – the places differ from the 6 mm cutter's …
      expect(marksFourteen.map((m) => m.u)).not.toEqual(marksSix.map((m) => m.u));
      // … and so does the program on the table: it was made anew, nothing of the old diameter is left in it
      const fourteen = program();
      expect(fourteen).not.toBe(six);
      cam().remake();
      expect(program()).toBe(fourteen);
      // what is drawn is what is cut: the places by hand, seeded from the same sites the picture shows, give the very program
      expect(cam().manualTabs(id)).toBe(true);
      expect(program()).toBe(fourteen);
      // an edit of another tool, or of this one that leaves the diameter, makes nothing anew
      cam().spreadTabs(id);
      const other = useWorkshop.getState().tools.find((x) => x.id !== 't2')!;
      const lying = useJob.getState().lines;
      useWorkshop.getState().saveTool({ ...other, diameter: other.diameter + 1 });
      expect(useJob.getState().lines).toBe(lying);
      useWorkshop
        .getState()
        .saveTool({ ...useWorkshop.getState().tools.find((x) => x.id === 't2')! });
      expect(useJob.getState().lines).toBe(lying);
      useWorkshop.getState().saveTool(other);
    } finally {
      useWorkshop.getState().saveTool(tool);
    }
  });

  it('a program on the table that is not the drawing’s own (a file, a series, a part of a section) is left alone when the cutter is edited', () => {
    const tool = useWorkshop.getState().tools.find((x) => x.id === 't2')!;
    try {
      cam().add([lshape()]);
      cam().setItem(first().id, { kind: 'inside', tabs: true });
      // another program replaces it on the table (the operator opened a file; a series or a section does the same)
      useJob.getState().load('fremd.nc', 'G0 X1 Y1\nG1 Z-1 F100\nM2');
      const lying = useJob.getState().lines;
      useWorkshop.getState().saveTool({ ...tool, diameter: 14 });
      expect(useJob.getState().fileName).toBe('fremd.nc');
      expect(useJob.getState().lines).toBe(lying);
    } finally {
      useWorkshop.getState().saveTool(tool);
    }
  });

  it('a job that is under way keeps its program when the cutter is edited – the drawing is ahead of it', () => {
    const tool = useWorkshop.getState().tools.find((x) => x.id === 't2')!;
    try {
      cam().add([lshape()]);
      cam().setItem(first().id, { kind: 'inside', tabs: true });
      const lying = program();
      useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
      useWorkshop.getState().saveTool({ ...tool, diameter: 14 });
      expect(program()).toBe(lying);
      expect(cam().ahead).toBe(true);
    } finally {
      useMachine.setState({ fileJob: null });
      useWorkshop.getState().saveTool(tool);
    }
  });

  it('follows the cutter: another diameter, another place – the picture asks for it', () => {
    cam().add([rectangle(0, 0, 100, 60)]);
    const marks = (tool: number) =>
      itemTabMarks(first(), cam().settings.tabs, tool).map((m) => Math.round(m.u * 1e6));
    const six = marks(6);
    const twelve = marks(12);
    // (a wider cutter lifts over more: the clear stretches are shorter, and the tab on the corner steps further)
    expect(twelve).not.toEqual(six);
    // the same picture comes back for the same cutter – and not the other cutter's
    expect(marks(6)).toEqual(six);
    expect(itemTabMarks(first(), cam().settings.tabs, 6)).toBe(
      itemTabMarks(first(), cam().settings.tabs, 6),
    );
  });
});
