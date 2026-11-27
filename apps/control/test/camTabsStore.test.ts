import { circle, rectangle, type Sketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { carryTabs, itemHasTabs, itemTabMarks, looseContours } from '../src/lib/camTabs';
import { parseProject } from '../src/lib/camProject';
import { itemOperation, useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { seriesMotif } from '../src/store/series';
import '../src/store/underway';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const first = () => items()[0]!;
const program = () => useJob.getState().lines.join('\n');
const RECT: Sketch = { type: 'rect', w: 100, h: 60, r: 0 };
const GRID: Sketch = { type: 'grid', d: 5, nx: 2, ny: 1, px: 30, py: 10 };

/**
 * The stretches the cutter is lifted over tabs in the program on the table: where it goes up to the
 * height of the tabs and where it comes down again (x, y, x, y). Tabs 2 mm high of a cut 6 deep in
 * one pass: they stand at z −4.
 */
function lifts(z = -4, lines: readonly string[] = useJob.getState().lines): number[][] {
  let x = 0;
  let y = 0;
  let at = 0;
  let from: number[] | null = null;
  const out: number[][] = [];
  for (const line of lines) {
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
    else if (was === z && at !== z) out.push([...from!, x, y]);
  }
  return out;
}

const steps = () => cam().past.length;

describe('the tabs of a part, in the drawing', () => {
  beforeEach(() => {
    cam().close();
    cam().setPlacing(null);
    useJob.getState().unload();
    useFlip.getState().cancel();
    cam().setSettings({
      toolId: 't2',
      depth: 6,
      stepdown: 6,
      rampAngle: 90,
      allowance: 0,
      engraveDepth: 1,
      climb: true,
      tabs: { count: 4, width: 6, height: 2 },
    });
    openCam();
    cam().addSketch(RECT);
  });

  it('are the drawing’s four, 6 wide, until the part has values of its own', () => {
    expect(first().tabSpec).toBeUndefined();
    // 100 × 60 is 320 round: tabs at 40, 120, 200 and 280 mm – the cutter, 3 mm outside, lifts 12 over each
    expect(lifts()).toEqual([
      [34, -3, 46, -3],
      [103, 14, 103, 26],
      [66, 63, 54, 63],
      [-3, 46, -3, 34],
    ]);
    expect(itemOperation(first(), cam().settings).tabs).toBe(cam().settings.tabs);
  });

  it('have a count of their own, spread evenly', () => {
    const before = program();
    cam().setTabs(first().id, { count: 2 });
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 2 });
    // at 80 mm along the lower side and 240 along: 80 along the upper side, 20 from its left end
    expect(lifts()).toEqual([
      [74, -3, 86, -3],
      [26, 63, 14, 63],
    ]);
    // Empty again: the default – and the very program it was
    cam().setTabs(first().id, { count: undefined });
    expect(first().tabSpec).toBeUndefined();
    expect(program()).toBe(before);
  });

  it('have a width and a height of their own', () => {
    cam().setTabs(first().id, { width: 10 });
    expect(lifts()[0]).toEqual([32, -3, 48, -3]);
    cam().setTabs(first().id, { width: undefined, height: 3 });
    expect(first().tabSpec).toEqual({ mode: 'auto', height: 3 });
    expect(lifts(-3)).toHaveLength(4);
    expect(lifts(-4)).toHaveLength(0);
    // The drawing's defaults, changed, move the part along that has none of its own
    cam().setTabs(first().id, { height: undefined });
    cam().setSettings({ tabs: { count: 1, width: 6, height: 2 } });
    cam().remake();
    expect(lifts()).toHaveLength(1);
  });

  it('are brought into their ranges, and a value that is no number goes', () => {
    const id = first().id;
    cam().setTabs(id, { count: 99.6, width: 1000, height: 9999 });
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 50, width: 100, height: 500 });
    cam().setTabs(id, { count: 2.6, width: 0, height: 0.01 });
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 3, width: 0.1, height: 0.1 });
    cam().setTabs(id, { count: Number.NaN, width: Infinity });
    expect(first().tabSpec).toEqual({ mode: 'auto', height: 0.1 });
    cam().setTabs(id, {});
    cam().setTabs(999, { count: 2 });
    expect(first().tabSpec).toEqual({ mode: 'auto', height: 0.1 });
  });

  it('take a value typed in several steps as one step to undo', () => {
    const id = first().id;
    const before = steps();
    cam().setTabs(id, { width: 7 });
    cam().setTabs(id, { width: 8 });
    cam().setTabs(id, { width: 9 });
    expect(steps()).toBe(before + 1);
    // Another value is another step
    cam().setTabs(id, { height: 3 });
    expect(steps()).toBe(before + 2);
    cam().undo();
    expect(first().tabSpec).toEqual({ mode: 'auto', width: 9 });
    cam().undo();
    expect(first().tabSpec).toBeUndefined();
  });

  it('start by hand from the even spread, and cut as before until a tab is moved', () => {
    const auto = program();
    const id = first().id;
    expect(cam().manualTabs(id)).toBe(true);
    expect(first().tabSpec).toEqual({
      mode: 'manual',
      at: [
        { c: 0, u: 0.125 },
        { c: 0, u: 0.375 },
        { c: 0, u: 0.625 },
        { c: 0, u: 0.875 },
      ],
    });
    expect(program()).toBe(auto);
    // Again: already by hand – no second step
    const before = steps();
    expect(cam().manualTabs(id)).toBe(true);
    expect(steps()).toBe(before);
    // Its own values stay when it goes by hand and back
    cam().setTabs(id, { width: 10, count: 3 });
    cam().spreadTabs(id);
    expect(first().tabSpec).toEqual({ mode: 'auto', width: 10, count: 3 });
    cam().spreadTabs(id);
    expect(steps()).toBe(before + 2);
  });

  it('put a tab where it is told, move it, and take it away', () => {
    const id = first().id;
    const start = steps();
    // Not before the part is by hand
    expect(cam().addTab(id, 0, 0.9)).toBe(false);
    cam().manualTabs(id);
    expect(steps()).toBe(start + 1);
    // 0.7 of 320 is 224 along: the upper side, 64 from its right end – x = 36
    expect(cam().addTab(id, 0, 0.7)).toBe(true);
    expect(first().tabSpec!.at).toHaveLength(5);
    expect(lifts()).toContainEqual([42, 63, 30, 63]);
    // Not onto a tab that stands there (1.7 is round once: 0.7), not on a contour the part has not,
    // not a number
    expect(cam().addTab(id, 0, 0.7 + 1e-10)).toBe(false);
    expect(cam().addTab(id, 0, 1.7)).toBe(false);
    expect(cam().addTab(id, 5, 0.1)).toBe(false);
    expect(cam().addTab(id, 0, Number.NaN)).toBe(false);
    expect(cam().addTab(999, 0, 0.1)).toBe(false);
    expect(steps()).toBe(start + 2);
    // Moved: the same tab in a row is one step
    cam().moveTab(id, 4, 0.95);
    cam().moveTab(id, 4, 0.96);
    expect(steps()).toBe(start + 3);
    expect(first().tabSpec!.at![4]).toEqual({ c: 0, u: 0.96 });
    // To where it is, to nowhere, to something that is no number: nothing
    cam().moveTab(id, 4, 0.96);
    cam().moveTab(id, 9, 0.5);
    cam().moveTab(id, 4, Number.NaN);
    expect(steps()).toBe(start + 3);
    cam().undo();
    expect(first().tabSpec!.at![4]).toEqual({ c: 0, u: 0.7 });
    cam().removeTab(id, 4);
    expect(first().tabSpec!.at).toHaveLength(4);
    cam().removeTab(id, 9);
    expect(first().tabSpec!.at).toHaveLength(4);
    expect(lifts()).toHaveLength(4);
  });

  it('never stand twice: a tab moved or dragged onto another is put back where it was', () => {
    const id = first().id;
    cam().manualTabs(id);
    const places = () => first().tabSpec!.at!.map((p) => p.u);
    const start = steps();
    const text = program();
    // onto the second (0.375), also across the end of the line (0.375 + 1) and to within a hair
    cam().moveTab(id, 0, 0.375);
    cam().moveTab(id, 0, 1.375);
    cam().moveTab(id, 0, 0.375 + 1e-10);
    expect(places()).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(steps()).toBe(start);
    expect(program()).toBe(text);
    // a little way off the other is a place of its own
    cam().moveTab(id, 0, 0.375 + 1e-3);
    expect(places()).toEqual([0.376, 0.375, 0.625, 0.875]);
    cam().undo();
    // A finger lets go on another tab: the picture shows it there while it moves, and then not
    const drag = cam().dragTab(id, 2)!;
    drag.move(0.375);
    drag.end();
    expect(places()).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(steps()).toBe(start);
    expect(program()).toBe(text);
    expect(itemTabMarks(first(), cam().settings.tabs, 6)).toHaveLength(4);
    // Not asking for more than there are: every place has its mark
    expect(itemTabMarks(first(), cam().settings.tabs, 6).map((m) => m.index)).toEqual([0, 1, 2, 3]);
  });

  it('follow the measures of the shape: a place is the same share of the contour’s box', () => {
    const id = first().id;
    cam().manualTabs(id);
    // (by place, not by their order along the line: a rounded corner moves where the line begins)
    const marks = () =>
      itemTabMarks(first(), cam().settings.tabs, 6)
        .map((m) => [Math.round(m.x * 1e6) / 1e6 + 0, Math.round(m.y * 1e6) / 1e6 + 0])
        .sort((p, q) => p[0]! - q[0]! || p[1]! - q[1]!);
    // 100 × 60 from the lower left corner: 40 along the lower side, 20 up the right side, 40 along
    // the upper side from the right, 20 down the left side from the top
    expect(marks()).toEqual([
      [0, 40],
      [40, 0],
      [60, 60],
      [100, 20],
    ]);
    // Twice as wide, the left side stays: the same shares – the length of the line (320 → 520) changes
    cam().setSketch(id, { ...RECT, w: 200 });
    expect(marks()).toEqual([
      [0, 40],
      [80, 0],
      [120, 60],
      [200, 20],
    ]);
    expect(first().tabSpec!.at!.every((p) => p.c === 0)).toBe(true);
    // The same tab as a fraction would be at 65 on the lower side: it is not
    expect(first().tabSpec!.at![0]!.u).not.toBeCloseTo(0.125, 3);
    // Round corners leave the middle of a side where it is
    cam().setSketch(id, { ...RECT, w: 200, r: 10 });
    expect(marks()).toEqual([
      [0, 40],
      [80, 0],
      [120, 60],
      [200, 20],
    ]);
    // and the program follows: the cutter lifts round x = 80 on the lower side
    expect(lifts()[0]).toEqual([74, -3, 86, -3]);
    // One step back each time
    cam().undo();
    cam().undo();
    expect(marks()[1]).toEqual([40, 0]);
  });

  it('are not moved by a size that is only a scale, whatever the way it is made', () => {
    const id = first().id;
    cam().manualTabs(id);
    cam().moveTab(id, 0, 0.1);
    const was = first().tabSpec!.at!.map((p) => ({ ...p }));
    // A second thing: scaling more than one takes every measure by the same factor
    cam().addSketch({ type: 'circle', d: 20 });
    cam().select('all');
    cam().scale(2);
    expect(first().sketch).toEqual({ ...RECT, w: 200, h: 120, r: 0 });
    expect(first().tabSpec!.at).toEqual(was);
  });

  it('stay on the holes they were put on when a grid gets other columns or rows', () => {
    cam().clear();
    const grid = (nx: number, ny: number): Sketch => ({
      type: 'grid',
      d: 5,
      nx,
      ny,
      px: 30,
      py: 20,
    });
    cam().addSketch(grid(2, 2));
    const id = first().id;
    const tabs = cam().settings.tabs;
    cam().manualTabs(id);
    /** Takes the places of every hole but the ones named */
    const keep = (...cs: number[]) => {
      for (
        let at = first().tabSpec!.at!;
        at.some((p) => !cs.includes(p.c));
        at = first().tabSpec!.at!
      ) {
        cam().removeTab(
          id,
          at.findIndex((p) => !cs.includes(p.c)),
        );
      }
    };
    /** Where each tab stands on its hole: the hole and the way from its middle, to 1 µm */
    const onHoles = () =>
      itemTabMarks(first(), tabs, 6).map((m) => {
        const hole = first().contours[m.c]!.circle!;
        return [
          m.c,
          Math.round((m.x - hole.cx) * 1e6) / 1e6 + 0,
          Math.round((m.y - hole.cy) * 1e6) / 1e6 + 0,
        ];
      });
    // Contour 2 is the hole in the first column of the second row
    keep(2);
    expect(onHoles().map(([c]) => c)).toEqual([2, 2, 2, 2]);
    const there = onHoles().map((h) => h.slice(1));
    // A third column: that hole is contour 3 now, and keeps its tabs – the other five have none
    cam().setSketch(id, grid(3, 2));
    expect(first().contours).toHaveLength(6);
    expect(onHoles().map(([c]) => c)).toEqual([3, 3, 3, 3]);
    expect(onHoles().map((h) => h.slice(1))).toEqual(there);
    expect(looseContours(first(), tabs)).toEqual([0, 1, 2, 4, 5]);
    expect(itemHasTabs(first(), tabs)).toBe(false);
    // Back to two columns: where it was
    cam().setSketch(id, grid(2, 2));
    expect(onHoles().map(([c]) => c)).toEqual([2, 2, 2, 2]);
    expect(onHoles().map((h) => h.slice(1))).toEqual(there);
    // 2 columns × 3 rows turned into 3 × 2 keeps the number of holes and moves every one of them:
    // (column 1, row 0) stays contour 1, (column 0, row 1) goes from 2 to 3, (column 1, row 2) is gone
    cam().setSketch(id, grid(2, 3));
    cam().spreadTabs(id);
    cam().manualTabs(id);
    keep(1, 2, 5);
    expect([...new Set(first().tabSpec!.at!.map((p) => p.c))].sort()).toEqual([1, 2, 5]);
    cam().setSketch(id, grid(3, 2));
    expect(first().contours).toHaveLength(6);
    expect([...new Set(first().tabSpec!.at!.map((p) => p.c))].sort()).toEqual([1, 3]);
    expect(first().tabSpec!.at).toHaveLength(8);
    expect(looseContours(first(), tabs)).toEqual([0, 2, 4, 5]);
  });

  it('drop the places when a drawing that is not a grid has another number of contours', () => {
    const id = first().id;
    cam().manualTabs(id);
    // A rectangle always has one: the places stay (checked above). Made with fewer contours by a
    // hand-made change of the sketch's type, they have nowhere to go.
    const item = first();
    const circleSketch: Sketch = { type: 'circle', d: 40 };
    const other = { ...item, sketch: circleSketch, source: [...item.source, ...item.source] };
    expect(carryTabs(item, other).tabSpec!.at).toEqual([]);
  });

  it('are none by hand until one is put – nothing holds the part', () => {
    const id = first().id;
    cam().manualTabs(id);
    for (let i = 0; i < 4; i++) cam().removeTab(id, 0);
    expect(first().tabSpec).toEqual({ mode: 'manual', at: [] });
    expect(itemHasTabs(first(), cam().settings.tabs)).toBe(false);
    expect(lifts()).toEqual([]);
    expect(program()).not.toContain('Z-4');
    cam().addTab(id, 0, 0.1);
    expect(lifts()).toEqual([[26, -3, 38, -3]]);
  });

  it('follow a finger along the line without remaking the toolpath, and are one step to undo', () => {
    const id = first().id;
    cam().manualTabs(id);
    const before = steps();
    const text = program();
    const drag = cam().dragTab(id, 0)!;
    // 0.2 of 320 is 64 along the lower side
    drag.move(0.2);
    drag.move(0.21);
    drag.move(0.2);
    expect(first().tabSpec!.at![0]).toEqual({ c: 0, u: 0.2 });
    // The picture follows, the program waits for the finger to let go
    expect(itemTabMarks(first(), cam().settings.tabs, 6)[0]!.x).toBeCloseTo(64, 9);
    expect(program()).toBe(text);
    expect(steps()).toBe(before);
    drag.end();
    expect(steps()).toBe(before + 1);
    expect(lifts()[0]).toEqual([58, -3, 70, -3]);
    cam().undo();
    expect(first().tabSpec!.at![0]).toEqual({ c: 0, u: 0.125 });
    expect(program()).toBe(text);
  });

  it('are left as they were when a finger takes one and lets go where it was – or never moved it', () => {
    const id = first().id;
    cam().manualTabs(id);
    const before = steps();
    const text = program();
    const idle = cam().dragTab(id, 1)!;
    idle.end();
    const back = cam().dragTab(id, 1)!;
    back.move(0.5);
    back.move(0.375);
    back.end();
    expect(steps()).toBe(before);
    expect(first().tabSpec!.at![1]).toEqual({ c: 0, u: 0.375 });
    expect(program()).toBe(text);
    // Nothing to take: another tab, or a part that is not by hand
    expect(cam().dragTab(id, 9)).toBeNull();
    cam().spreadTabs(id);
    expect(cam().dragTab(id, 0)).toBeNull();
    expect(cam().dragTab(999, 0)).toBeNull();
    // A drag that ends after the drawing is gone changes nothing
    cam().manualTabs(id);
    const late = cam().dragTab(id, 0)!;
    late.move(0.3);
    cam().close();
    expect(() => late.end()).not.toThrow();
    expect(cam().project).toBeNull();
  });

  it('are the same places of the part wherever it is moved, turned or mirrored', () => {
    const id = first().id;
    cam().manualTabs(id);
    cam().moveTab(id, 0, 0.1);
    const places = () => itemTabMarks(first(), cam().settings.tabs, 6).map((m) => [m.u, m.x, m.y]);
    expect(places()[0]).toEqual([0.1, 32, 0]);
    cam().select(first().group);
    cam().nudge(10, 5);
    expect(places()[0]).toEqual([0.1, 42, 5]);
    // Mirrored left to right about the middle of the part (x = 60): the tab goes with the part
    cam().mirror('x');
    const [mirrored] = places();
    expect(mirrored![0]).toBe(0.1);
    expect(mirrored![1]).toBeCloseTo(78, 9);
    expect(mirrored![2]).toBeCloseTo(5, 9);
  });

  it('go along when the part is copied, laid out in a grid or pasted', () => {
    const id = first().id;
    cam().manualTabs(id);
    cam().moveTab(id, 0, 0.1);
    cam().setTabs(id, { width: 9 });
    cam().select(first().group);
    cam().duplicate();
    expect(items()).toHaveLength(2);
    expect(items()[1]!.tabSpec).toEqual(first().tabSpec);
    cam().array(2, 1, 5);
    cam().copy();
    cam().paste();
    const specs = items().map((i) => i.tabSpec);
    expect(specs.length).toBeGreaterThanOrEqual(4);
    for (const spec of specs) expect(spec).toEqual(first().tabSpec);
  });

  it('lose the places of contours that are no more, and a drawing with too many is not taken by hand', () => {
    cam().clear();
    cam().addSketch(GRID);
    const id = first().id;
    expect(first().contours).toHaveLength(2);
    expect(cam().manualTabs(id)).toBe(true);
    expect(first().tabSpec!.at).toHaveLength(8);
    expect(first().tabSpec!.at!.filter((p) => p.c === 1)).toHaveLength(4);
    // One hole fewer: the places on the second go with it, and what is saved can be opened again
    cam().setSketch(id, { ...GRID, nx: 1 });
    expect(first().contours).toHaveLength(1);
    expect(first().tabSpec!.at).toHaveLength(4);
    expect(first().tabSpec!.at!.every((p) => p.c === 0)).toBe(true);
    expect('error' in parseProject(cam().saveProject()!)).toBe(false);
    // 4 × 4 holes with 4 tabs each are more places than a part may have: it stays as it is
    cam().clear();
    cam().addSketch({ ...GRID, nx: 4, ny: 4 });
    expect(first().contours).toHaveLength(16);
    expect(cam().manualTabs(first().id)).toBe(false);
    expect(first().tabSpec).toBeUndefined();
    // A part without tabs on, or one that does not exist, cannot be taken by hand either
    cam().setItem(first().id, { tabs: false });
    expect(cam().manualTabs(first().id)).toBe(false);
    expect(cam().manualTabs(999)).toBe(false);
  });

  it('stop being put on the table when the part is no longer the selected one by hand', () => {
    const id = first().id;
    cam().select(first().group);
    cam().setPlacing(id);
    // Automatic: nothing to put
    expect(cam().placing).toBeNull();
    cam().manualTabs(id);
    cam().setPlacing(id);
    expect(cam().placing).toBe(id);
    cam().setPlacing(null);
    expect(cam().placing).toBeNull();
    cam().setPlacing(id);
    cam().select(null);
    expect(cam().placing).toBeNull();
    cam().select(first().group);
    cam().setPlacing(id);
    cam().setItem(id, { tabs: false });
    expect(cam().placing).toBeNull();
    cam().setItem(id, { tabs: true });
    cam().setPlacing(id);
    cam().select('all');
    expect(cam().placing).toBeNull();
    cam().select(first().group);
    cam().setPlacing(id);
    cam().spreadTabs(id);
    expect(cam().placing).toBeNull();
    cam().manualTabs(id);
    cam().setPlacing(id);
    cam().removeItem(id);
    expect(cam().placing).toBeNull();
    cam().setPlacing(7);
    expect(cam().placing).toBeNull();
  });

  it('say that a part cut through is loose when no tab is cut, front side turned over or not', () => {
    cam().clear();
    cam().add([rectangle(0, 0, 200, 80), circle(60, 40, 30)]);
    cam().setTwoSided({ thickness: 12 });
    const [plate, hole] = items();
    cam().setItem(plate!.id, { depth: 12.5 });
    cam().setItem(hole!.id, { kind: 'pocket', depth: 6, side: 'back' });
    const loose = () => cam().flipNotes.some((n) => n.code === 'loose');
    expect(loose()).toBe(false);
    cam().manualTabs(plate!.id);
    for (let i = 0; i < 4; i++) cam().removeTab(plate!.id, 0);
    expect(loose()).toBe(true);
    cam().addTab(plate!.id, 0, 0.3);
    expect(loose()).toBe(false);
    cam().spreadTabs(plate!.id);
    cam().setTabs(plate!.id, { count: 0 });
    expect(loose()).toBe(true);
    cam().setTabs(plate!.id, { count: 2 });
    expect(loose()).toBe(false);
  });

  it('say that a part is loose when only some of its contours have a tab', () => {
    cam().clear();
    cam().addSketch({ type: 'grid', d: 40, nx: 2, ny: 1, px: 100, py: 10 });
    cam().add([circle(300, 40, 30)]);
    cam().setTwoSided({ thickness: 12 });
    const [discs, hole] = items();
    cam().setItem(discs!.id, { depth: 12.5 });
    cam().setItem(hole!.id, { kind: 'pocket', depth: 6, side: 'back' });
    const loose = () => cam().flipNotes.some((n) => n.code === 'loose');
    expect(discs!.contours).toHaveLength(2);
    expect(loose()).toBe(false);
    cam().manualTabs(discs!.id);
    expect(loose()).toBe(false);
    // The tabs of the first disc go: it is cut free, the second still has its own
    while (first().tabSpec!.at!.some((p) => p.c === 0)) {
      cam().removeTab(
        discs!.id,
        first().tabSpec!.at!.findIndex((p) => p.c === 0),
      );
    }
    expect(first().tabSpec!.at!.length).toBeGreaterThan(0);
    expect(loose()).toBe(true);
    cam().addTab(discs!.id, 0, 0.2);
    expect(loose()).toBe(false);
  });

  it('are cut at the same places on the back as on the front', () => {
    cam().clear();
    cam().add([rectangle(0, 0, 100, 60), circle(40, 30, 10)]);
    cam().setTwoSided({ thickness: 12 });
    const [plate, hole] = items();
    cam().setItem(hole!.id, { kind: 'pocket', depth: 3 });
    cam().setItem(plate!.id, { side: 'back' });
    cam().manualTabs(plate!.id);
    cam().moveTab(plate!.id, 0, 0.1);
    // The outline is cut from the back. The registration holes lie 15 mm beside the 100 wide part: the
    // flip line is x = 50. The tab at 0.1 – 32 along the lower side as drawn – is at 68 on the part
    // turned over: the cutter is up from 62 to 74 (6 of tab and the 6 of the cutter)
    const plan = useFlip.getState().plan!;
    expect(plan.flip.at).toBe(50);
    const onBack = lifts(-4, plan.back.text.split('\n')).filter((l) => l[1] === -3);
    expect(onBack.map((l) => [Math.min(l[0]!, l[2]!), Math.max(l[0]!, l[2]!)])).toEqual([[62, 74]]);
  });
});

describe('the tabs of a part in a series', () => {
  beforeEach(() => {
    cam().close();
    cam().setPlacing(null);
    useJob.getState().unload();
    cam().setSettings({
      toolId: 't2',
      depth: 6,
      stepdown: 6,
      tabs: { count: 4, width: 6, height: 2 },
    });
    openCam();
  });

  it('go onto every blank: one part per contour where the places differ, else the part as it was', () => {
    cam().addSketch(GRID);
    const auto = seriesMotif();
    expect(auto).toHaveLength(1);
    expect(auto[0]!.tabs).toBe(cam().settings.tabs);
    const id = first().id;
    cam().manualTabs(id);
    cam().moveTab(id, 4, 0.9);
    const motif = seriesMotif();
    expect(motif).toHaveLength(2);
    expect(motif.map((p) => p.contours.length)).toEqual([1, 1]);
    expect(motif[0]!.tabs!.at).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(motif[1]!.tabs!.at).toEqual([0.9, 0.375, 0.625, 0.875]);
    expect(motif[0]!.kind).toBe('outside');
  });

  it('leave a text as one part: its words are set anew on each blank', () => {
    cam().addText('Hallo', { height: 10 });
    const text = first();
    // Tabs belong to cuts through – an engraved text is none; a spec on it changes nothing
    expect(seriesMotif()).toHaveLength(1);
    expect(text.kind).toBe('on');
  });
});
