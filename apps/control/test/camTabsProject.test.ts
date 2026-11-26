import { type Sketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseProject,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  projectToText,
} from '../src/lib/camProject';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import '../src/store/underway';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const RECT: Sketch = { type: 'rect', w: 100, h: 60, r: 0 };
const GRID: Sketch = { type: 'grid', d: 5, nx: 2, ny: 1, px: 30, py: 10 };

beforeEach(() => {
  cam().close();
  cam().setPlacing(null);
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().setSettings({
    toolId: 't2',
    depth: 6,
    allowance: 0,
    engraveDepth: 1,
    tabs: { count: 4, width: 6, height: 2 },
  });
});

describe('the tabs of a part in a project file', () => {
  it('come back as they were put – the places, the values, and the program byte for byte', () => {
    cam().addSketch(GRID);
    const id = items()[0]!.id;
    cam().manualTabs(id);
    cam().moveTab(id, 0, 0.31);
    cam().removeTab(id, 5);
    cam().setTabs(id, { width: 4.5, height: 1.5 });
    const saved = items().map(({ contours: _made, ...kept }) => kept);
    const before = program();
    const text = cam().saveProject()!;
    const file = JSON.parse(text);
    expect(file.format).toBe(PROJECT_FORMAT);
    expect(file.version).toBe(PROJECT_VERSION);
    expect(file.items[0].tabSpec.mode).toBe('manual');
    expect(file.items[0].tabSpec.at).toHaveLength(7);
    expect(file.items[0].tabSpec.width).toBe(4.5);
    cam().close();
    useJob.getState().unload();
    expect(cam().openProject(text)).toEqual({ toolMissing: false });
    expect(items().map(({ contours: _made, ...kept }) => kept)).toEqual(saved);
    expect(program()).toBe(before);
    // and undoing the opening brings the empty drawing back, tabs and all
    cam().undo();
    expect(items()).toEqual([]);
  });

  it('are written only where a part has them, and an old file without them opens as it was', () => {
    cam().addSketch(RECT);
    const before = program();
    const file = JSON.parse(cam().saveProject()!);
    expect('tabSpec' in file.items[0]).toBe(false);
    expect(cam().saveProject()).not.toContain('tabSpec');
    cam().close();
    useJob.getState().unload();
    expect(cam().openProject(JSON.stringify(file))).toEqual({ toolMissing: false });
    expect(items()[0]!.tabSpec).toBeUndefined();
    expect(program()).toBe(before);
    // Back to automatic with nothing of its own: no spec is saved either
    const id = items()[0]!.id;
    cam().setTabs(id, { count: 2 });
    cam().setTabs(id, { count: undefined });
    expect(cam().saveProject()).not.toContain('tabSpec');
  });

  it('are nothing when the spec says nothing the defaults would not', () => {
    cam().addSketch(RECT);
    const file = JSON.parse(cam().saveProject()!);
    file.items[0].tabSpec = { mode: 'auto' };
    const parsed = parseProject(JSON.stringify(file));
    expect('error' in parsed).toBe(false);
    expect(
      (parsed as { project: { items: { tabSpec?: unknown }[] } }).project.items[0]!.tabSpec,
    ).toBeUndefined();
    // The places of an automatic spec are left out, a manual one without any is a spec (no tab)
    file.items[0].tabSpec = { mode: 'auto', height: 3, at: [{ c: 0, u: 0.5 }] };
    const auto = parseProject(JSON.stringify(file)) as {
      project: { items: { tabSpec: unknown }[] };
    };
    expect(auto.project.items[0]!.tabSpec).toEqual({ mode: 'auto', height: 3 });
    file.items[0].tabSpec = { mode: 'manual' };
    const none = parseProject(JSON.stringify(file)) as {
      project: { items: { tabSpec: unknown }[] };
    };
    expect(none.project.items[0]!.tabSpec).toEqual({ mode: 'manual', at: [] });
  });
});

describe('what a spec of tabs must be to be opened', () => {
  const good = () => {
    cam().addSketch(RECT);
    return JSON.parse(projectToText(cam().project!, cam().settings));
  };
  const error = (spec: unknown) => {
    const file = good();
    file.items[0].tabSpec = spec;
    const r = parseProject(JSON.stringify(file));
    return 'error' in r ? r.error : null;
  };
  const places = (n: number) => Array.from({ length: n }, (_, i) => ({ c: 0, u: i / 100 }));

  it('takes the ends of every range, and 50 places', () => {
    for (const spec of [
      { mode: 'auto', count: 0 },
      { mode: 'auto', count: 50 },
      { mode: 'auto', width: 0.1, height: 0.1 },
      { mode: 'auto', width: 100, height: 500 },
      { mode: 'manual', at: [] },
      { mode: 'manual', at: [{ c: 0, u: 0 }] },
      { mode: 'manual', at: [{ c: 0, u: 0.999999 }] },
      { mode: 'manual', at: places(50) },
    ]) {
      expect(error(spec), JSON.stringify(spec).slice(0, 60)).toBeNull();
      cam().close();
    }
  });

  it('refuses the file for a spec that is no spec, a value outside its range or a place that is none', () => {
    for (const spec of [
      'x',
      5,
      null,
      [],
      {},
      { mode: 'sideways' },
      { mode: 'auto', count: 1.5 },
      { mode: 'auto', count: -1 },
      { mode: 'auto', count: 51 },
      { mode: 'auto', count: 'a' },
      { mode: 'auto', count: null },
      { mode: 'auto', width: 0.09 },
      { mode: 'auto', width: 100.1 },
      { mode: 'auto', width: null },
      { mode: 'auto', width: '6' },
      { mode: 'auto', height: 0.09 },
      { mode: 'auto', height: 501 },
      { mode: 'manual', at: 'x' },
      { mode: 'manual', at: places(51) },
      { mode: 'manual', at: [5] },
      { mode: 'manual', at: [null] },
      { mode: 'manual', at: [{ u: 0.5 }] },
      { mode: 'manual', at: [{ c: -1, u: 0.5 }] },
      { mode: 'manual', at: [{ c: 1.5, u: 0.5 }] },
      // the part has one contour: the places lie on contour 0
      { mode: 'manual', at: [{ c: 1, u: 0.5 }] },
      { mode: 'manual', at: [{ c: 0 }] },
      { mode: 'manual', at: [{ c: 0, u: 1 }] },
      { mode: 'manual', at: [{ c: 0, u: -0.1 }] },
      { mode: 'manual', at: [{ c: 0, u: null }] },
      { mode: 'manual', at: [{ c: 0, u: '0.5' }] },
    ]) {
      expect(error(spec), JSON.stringify(spec).slice(0, 60)).toBe('invalid-project');
      cam().close();
    }
  });

  it('holds the places to the contours the part has: a grid of two has two', () => {
    cam().addSketch(GRID);
    const file = JSON.parse(projectToText(cam().project!, cam().settings));
    file.items[0].tabSpec = { mode: 'manual', at: [{ c: 1, u: 0.5 }] };
    expect('error' in parseProject(JSON.stringify(file))).toBe(false);
    file.items[0].tabSpec = { mode: 'manual', at: [{ c: 2, u: 0.5 }] };
    expect(parseProject(JSON.stringify(file))).toEqual({ error: 'invalid-project' });
  });
});
