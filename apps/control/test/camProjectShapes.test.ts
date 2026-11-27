import { readFileSync } from 'node:fs';
import { tidySketch, type AnySketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { START } from '../src/lib/camStart';
import { parseProject } from '../src/lib/camProject';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { useWorkshop } from '../src/store/workshop';
import '../src/store/underway';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** A rectangle with a radius for each corner, and each of the further shapes */
const SHAPES: Record<string, AnySketch> = {
  'a rectangle with a radius for each corner': {
    type: 'rect',
    w: 100,
    h: 60,
    r: 15,
    radii: [15, 0, 8, 3],
  },
  ellipse: { type: 'ellipse', rx: 45, ry: 20 },
  star: { type: 'star', points: 7, outer: 33, inner: 14 },
  gear: { type: 'gear', teeth: 18, outer: 40, root: 33 },
  spiral: { type: 'spiral', turns: 3.5, start: 1.5, end: 28 },
};

function scene() {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  useRun.getState().reset();
  useMachine.setState({ fileJob: null, stream: null, lostInJob: null });
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1, climb: true });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
}

/** The saved file with one item's sketch replaced – to read what a damaged or unusual file does */
function withSketch(sketch: unknown): string {
  const file = JSON.parse(cam().saveProject()!);
  file.items[0].sketch = sketch;
  return JSON.stringify(file);
}

describe('the further shapes and the radii of the corners in a project file', () => {
  beforeEach(scene);

  for (const [name, sketch] of Object.entries(SHAPES)) {
    it(`keeps ${name}: saved, read, and the same program – byte for byte`, () => {
      cam().addSketch(sketch);
      const before = program();
      expect(before).not.toBe('');
      const text = cam().saveProject()!;
      const saved = JSON.parse(text).items[0].sketch;
      expect(saved).toEqual(sketch);
      const was = items()[0]!;
      cam().close();
      useJob.getState().unload();
      expect(cam().openProject(text)).toEqual({ toolMissing: false });
      expect(items()).toHaveLength(1);
      // the sketch, what is made from it and where it lies are what they were
      expect(items()[0]!.sketch).toEqual(sketch);
      expect(items()[0]!.source).toEqual(was.source);
      expect(items()[0]!.placement).toEqual(was.placement);
      expect(program()).toBe(before);
      // and the measures are still the item's own: a typed one makes it anew
      const id = items()[0]!.id;
      cam().setSketch(id, items()[0]!.sketch!);
      expect(items()[0]!.source).toEqual(was.source);
    });
  }

  it('keeps all of them in one drawing, in the order of the list', () => {
    for (const sketch of Object.values(SHAPES)) cam().addSketch(sketch);
    const before = program();
    const text = cam().saveProject()!;
    cam().close();
    useJob.getState().unload();
    cam().openProject(text);
    expect(items().map((i) => i.sketch)).toEqual(Object.values(SHAPES));
    expect(program()).toBe(before);
  });

  it('writes a shape as it is drawn: what was typed beyond a range is not what the file says', () => {
    cam().addSketch(START.star);
    // 99 tips are 32, an inner radius of 99 on an outer of 30 is 30: the fields keep what was typed
    cam().setSketch(items()[0]!.id, { type: 'star', points: 99, outer: 30, inner: 99 });
    expect(items()[0]!.sketch).toEqual({ type: 'star', points: 99, outer: 30, inner: 99 });
    const saved = JSON.parse(cam().saveProject()!).items[0].sketch;
    expect(saved).toEqual({ type: 'star', points: 32, outer: 30, inner: 30 });
    // a radius beyond 2500 would be refused when the file is read – so it is written as 2500, and the file
    // keeps the sketch of the thing
    cam().addSketch({ type: 'ellipse', rx: 3000, ry: 20 });
    const ellipse = JSON.parse(cam().saveProject()!).items[1].sketch;
    expect(ellipse).toEqual({ type: 'ellipse', rx: 2500, ry: 20 });
    const text = cam().saveProject()!;
    cam().close();
    useJob.getState().unload();
    cam().openProject(text);
    expect(items()[1]!.sketch).toEqual({ type: 'ellipse', rx: 2500, ry: 20 });
    expect(items()[0]!.sketch).toEqual({ type: 'star', points: 32, outer: 30, inner: 30 });
  });

  it('writes four equal radii as the one radius it is, and a rectangle without radii as it always was', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    cam().setSketch(items()[0]!.id, { type: 'rect', w: 100, h: 60, r: 9, radii: [9, 9, 9, 9] });
    expect(JSON.parse(cam().saveProject()!).items[0].sketch).toEqual({
      type: 'rect',
      w: 100,
      h: 60,
      r: 9,
    });
    // a plain rectangle is written exactly as stored: its key order and its numbers
    cam().setSketch(items()[0]!.id, { type: 'rect', w: 100, h: 60, r: 4 });
    expect(JSON.stringify(JSON.parse(cam().saveProject()!).items[0].sketch)).toBe(
      '{"type":"rect","w":100,"h":60,"r":4}',
    );
  });

  describe('a file that is damaged or unusual', () => {
    beforeEach(() => {
      cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    });
    const dropped = (sketch: unknown) => {
      const opened = parseProject(withSketch(sketch));
      expect('error' in opened).toBe(false);
      if ('error' in opened) return false;
      expect(opened.project.items).toHaveLength(1);
      // the item itself is there, with its contours
      expect(opened.project.items[0]!.source).toHaveLength(1);
      return opened.project.items[0]!.sketch === undefined;
    };

    it('drops the sketch of a measure that cannot be trusted and keeps the item with its contours', () => {
      // not a number, not above 0, not finite, missing
      expect(dropped({ type: 'ellipse', rx: '40', ry: 25 })).toBe(true);
      expect(dropped({ type: 'ellipse', rx: 0, ry: 25 })).toBe(true);
      expect(dropped({ type: 'ellipse', rx: -4, ry: 25 })).toBe(true);
      expect(dropped({ type: 'ellipse', rx: 40 })).toBe(true);
      expect(dropped({ type: 'star', points: 'five', outer: 30, inner: 12 })).toBe(true);
      expect(dropped({ type: 'star', points: 5, outer: 30, inner: null })).toBe(true);
      expect(dropped({ type: 'gear', teeth: 0, outer: 30, root: 24 })).toBe(true);
      expect(dropped({ type: 'spiral', turns: 3, start: -1, end: 30 })).toBe(true);
      expect(dropped({ type: 'spiral', turns: 3, start: 1 })).toBe(true);
      // a shape this app does not know
      expect(dropped({ type: 'heart', size: 30 })).toBe(true);
      expect(dropped('star')).toBe(true);
      expect(dropped([])).toBe(true);
    });

    it('drops a measure beyond what a shape can be – nobody draws it, and it would make a huge polygon', () => {
      expect(dropped({ type: 'ellipse', rx: 2501, ry: 25 })).toBe(true);
      expect(dropped({ type: 'star', points: 5, outer: 1e9, inner: 12 })).toBe(true);
      expect(dropped({ type: 'spiral', turns: 3, start: 1, end: 5000 })).toBe(true);
      // the largest there is is no limit's victim
      expect(dropped({ type: 'ellipse', rx: 2500, ry: 25 })).toBe(false);
    });

    it('brings a count into its range as the fields do, and does not refuse the file', () => {
      const opened = parseProject(withSketch({ type: 'star', points: 99, outer: 30, inner: 12 }));
      expect('error' in opened).toBe(false);
      if (!('error' in opened)) {
        expect(opened.project.items[0]!.sketch).toEqual({
          type: 'star',
          points: 32,
          outer: 30,
          inner: 12,
        });
      }
    });

    it('drops the radii of a rectangle that are not four numbers – the rest of the sketch is not trusted either', () => {
      const rect = { type: 'rect', w: 100, h: 60, r: 5 };
      expect(dropped({ ...rect, radii: [1, 2, 3] })).toBe(true);
      expect(dropped({ ...rect, radii: [1, 2, 3, 4, 5] })).toBe(true);
      expect(dropped({ ...rect, radii: [1, 2, 3, '4'] })).toBe(true);
      expect(dropped({ ...rect, radii: 'all' })).toBe(true);
      expect(dropped({ ...rect, radii: [1, 2, 3, null] })).toBe(true);
      // four numbers: kept, each held to half the shorter side, r the largest
      const opened = parseProject(withSketch({ ...rect, radii: [1, 2, 3, 99] }));
      expect('error' in opened).toBe(false);
      if (!('error' in opened)) {
        expect(opened.project.items[0]!.sketch).toEqual({
          type: 'rect',
          w: 100,
          h: 60,
          r: 30,
          radii: [1, 2, 3, 30],
        });
      }
    });
  });
});

describe('a file an older app wrote opens as it did', () => {
  beforeEach(scene);

  for (const name of ['oldSingle', 'oldTwoSided']) {
    it(`reads the sketches of ${name} as the reader before the shapes did`, () => {
      const text = fixture(`${name}.lowrider.json`);
      const raw = JSON.parse(text) as { items: { sketch?: unknown }[] };
      const opened = parseProject(text);
      expect('error' in opened).toBe(false);
      if ('error' in opened) return;
      expect(opened.project.items).toHaveLength(raw.items.length);
      let counted = 0;
      raw.items.forEach((entry, i) => {
        const read = opened.project.items[i]!.sketch;
        if (entry.sketch === undefined) {
          expect(read).toBeUndefined();
          return;
        }
        counted += 1;
        // what the reader before did: the sketch of that type brought into its ranges, nothing more
        expect(read).toEqual(tidySketch(entry.sketch as AnySketch));
      });
      // (the fixtures are real drawings: they do hold sketches)
      expect(counted).toBeGreaterThan(0);
    });
  }

  it('keeps the sketch of an older type that is larger than the shapes are allowed to be', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    cam().addSketch({ type: 'circle', d: 20 });
    const file = JSON.parse(cam().saveProject()!);
    // a plate of 6 m and a circle of 5.001 m, as an older app took them (nothing was ever held to an upper limit)
    file.items[0].sketch = { type: 'rect', w: 6000, h: 60, r: 4 };
    file.items[1].sketch = { type: 'circle', d: 5001 };
    const opened = parseProject(JSON.stringify(file));
    expect('error' in opened).toBe(false);
    if ('error' in opened) return;
    expect(opened.project.items[0]!.sketch).toEqual({ type: 'rect', w: 6000, h: 60, r: 4 });
    expect(opened.project.items[1]!.sketch).toEqual({ type: 'circle', d: 5001 });
  });

  it('still drops a damaged sketch of an older type, as it did', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    const file = JSON.parse(cam().saveProject()!);
    for (const bad of [
      { type: 'rect', w: -1, h: 60, r: 0 },
      { type: 'rect', w: 100, h: 60 },
      { type: 'circle', d: 'big' },
      { type: 'grid', d: 5, nx: 2, ny: 2, px: 10 },
      { type: 'text', text: 'a', height: 5, spacing: 0, lineSpacing: 1.6, align: 'justify' },
    ]) {
      file.items[0].sketch = bad;
      const opened = parseProject(JSON.stringify(file));
      expect('error' in opened).toBe(false);
      if (!('error' in opened)) expect(opened.project.items[0]!.sketch).toBeUndefined();
    }
  });
});
