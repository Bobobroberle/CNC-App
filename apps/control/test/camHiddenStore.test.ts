import { rectangle, type Sketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { holeCentre, itemsBounds } from '../src/lib/camItems';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { seriesMotif } from '../src/store/series';
import { useWorkshop } from '../src/store/workshop';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const boxOf = (id: number) => {
  const b = itemsBounds(items().filter((i) => i.id === id))!;
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1e6) / 1e6 + 0);
};
/** Every X a program goes to */
const xs = (text: string) => [...text.matchAll(/X(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
const holes = () =>
  items()
    .filter((i) => i.registration !== undefined)
    .map((i) => holeCentre(i));

/**
 * Three plates by hand, each its own group (x from, y from, x to, y to):
 *   a: 0 0 10 10     b: 100 0 130 30     c: 200 0 220 10
 * The eye of b hides it: the program is then the one of a drawing with a and c alone.
 */
let a = 0;
let b = 0;
let c = 0;
let gb = 0;
function scene() {
  cam().close();
  cam().setPlacing(null);
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  cam().add([rectangle(0, 0, 10, 10)]);
  cam().add([rectangle(100, 0, 30, 30)]);
  cam().add([rectangle(200, 0, 20, 10)]);
  [a, b, c] = items().map((i) => i.id) as [number, number, number];
  gb = items()[1]!.group;
  cam().select(null);
}

describe('a hidden part of the drawing', () => {
  beforeEach(scene);

  it('is not cut: the program is the one of a drawing without it – and shown again it is back, byte for byte', () => {
    const all = program();
    expect(Math.max(...xs(all))).toBeGreaterThan(200);
    cam().setHidden(b, true);
    expect(items().find((i) => i.id === b)!.hidden).toBe(true);
    const without = program();
    expect(without).not.toBe(all);
    // nothing of b: it lay at x 100…130, and the cutter went there in the program before
    expect(xs(all).some((x) => x > 100 && x < 130)).toBe(true);
    expect(xs(without).some((x) => x > 100 && x < 130)).toBe(false);
    // exactly the program of a drawing that never had it
    cam().close();
    useJob.getState().unload();
    cam().add([rectangle(0, 0, 10, 10)]);
    cam().add([rectangle(200, 0, 20, 10)]);
    expect(program()).toBe(without);
    // and the program of the drawing with b shown again is the first one
    scene();
    cam().setHidden(b, true);
    expect(program()).toBe(without);
    cam().setHidden(b, false);
    expect(program()).toBe(all);
    // the key is only ever `true`: shown again, it is not there at all
    expect('hidden' in items().find((i) => i.id === b)!).toBe(false);
    expect(items().some((i) => 'hidden' in i)).toBe(false);
  });

  it('does nothing twice, and nothing for a registration hole', () => {
    const steps = cam().past.length;
    cam().setHidden(b, false);
    expect(cam().past.length).toBe(steps);
    cam().setHidden(b, true);
    cam().setHidden(b, true);
    expect(cam().past.length).toBe(steps + 1);
    cam().setHidden(999, true);
    expect(cam().past.length).toBe(steps + 1);
    cam().showAll();
    cam().showAll();
    expect(cam().past.length).toBe(steps + 2);
    cam().setTwoSided({});
    const hole = items().find((i) => i.registration === 1)!;
    const before = cam().past.length;
    cam().setHidden(hole.id, true);
    expect('hidden' in items().find((i) => i.id === hole.id)!).toBe(false);
    expect(cam().past.length).toBe(before);
  });

  it('is one step of undo each time it is switched – hiding, showing, hiding are three', () => {
    const steps = cam().past.length;
    cam().setHidden(b, true);
    cam().setHidden(b, false);
    cam().setHidden(b, true);
    expect(cam().past.length).toBe(steps + 3);
    const hiddenOf = () => items().find((i) => i.id === b)!.hidden === true;
    expect(hiddenOf()).toBe(true);
    cam().undo();
    expect(hiddenOf()).toBe(false);
    cam().undo();
    expect(hiddenOf()).toBe(true);
    cam().undo();
    expect(hiddenOf()).toBe(false);
    cam().redo();
    expect(hiddenOf()).toBe(true);
    // "Alle einblenden" is one step for as many as there are
    cam().setHidden(a, true);
    const before = cam().past.length;
    cam().showAll();
    expect(cam().past.length).toBe(before + 1);
    expect(items().some((i) => i.hidden)).toBe(false);
    cam().undo();
    expect(
      items()
        .filter((i) => i.hidden)
        .map((i) => i.id),
    ).toEqual([a, b]);
  });

  it('cannot be picked by a finger on the table, and can be picked in the list', () => {
    const line = { x: 115, y: 0 };
    cam().select(null);
    expect(cam().pick(line, 2)).toBe(true);
    expect(cam().selected).toBe(gb);
    cam().select(null);
    cam().setHidden(b, true);
    expect(cam().pick(line, 2)).toBe(false);
    // inside it, for a tap, too
    expect(cam().pick({ x: 115, y: 15 }, 2)).toBe(false);
    expect(cam().selected).toBeNull();
    // in the list it is a part like any: ticked, and it is selected
    cam().toggleSelect(gb);
    expect(cam().selected).toBe(gb);
  });

  it('is left out of "Alles auswählen" and "Auswahl umkehren" – a group in the list can still be ticked', () => {
    const [ga, , gc] = items().map((i) => i.group) as [number, number, number];
    cam().setHidden(b, true);
    cam().selectAll();
    expect(cam().selected).toEqual([ga, gc]);
    cam().select(ga);
    cam().invertSelection();
    expect(cam().selected).toBe(gc);
    cam().select(null);
    cam().invertSelection();
    expect(cam().selected).toEqual([ga, gc]);
    // ticked in the list, it is a member like any: Ctrl+A leaves it again
    cam().toggleSelect(gb);
    expect(cam().selected).toEqual([ga, gb, gc]);
    cam().selectAll();
    expect(cam().selected).toEqual([ga, gc]);
    // without anything hidden "everything" is what it always was
    cam().showAll();
    cam().selectAll();
    expect(cam().selected).toBe('all');
  });

  it('takes "everything" with it: hidden while it was selected, it is no longer part of it', () => {
    const [ga, , gc] = items().map((i) => i.group) as [number, number, number];
    cam().selectAll();
    expect(cam().selected).toBe('all');
    cam().setHidden(b, true);
    expect(cam().selected).toEqual([ga, gc]);
    // so a move, a copy or a delete of everything does not reach it
    cam().nudge(5, 0);
    expect(boxOf(a)).toEqual([5, 0, 15, 10]);
    expect(boxOf(b)).toEqual([100, 0, 130, 30]);
    expect(boxOf(c)).toEqual([205, 0, 225, 10]);
    cam().selectAll();
    cam().duplicate();
    expect(items()).toHaveLength(5);
    expect(items().filter((i) => i.hidden)).toHaveLength(1);
    cam().selectAll();
    cam().removeSelection();
    expect(items().map((i) => i.id)).toEqual([b]);
  });

  it('is left out of aligning and spreading – and does not move with a selection that holds it only by "all"', () => {
    cam().setHidden(b, true);
    cam().select([items()[0]!.group, gb, items()[2]!.group]);
    // b is ticked (selected) but hidden: the two parts in sight are aligned to each other, b stays
    cam().align('top');
    expect(boxOf(a)).toEqual([0, 0, 10, 10]);
    expect(boxOf(b)).toEqual([100, 0, 130, 30]);
    expect(boxOf(c)).toEqual([200, 0, 220, 10]);
    cam().align('right');
    expect(boxOf(a)).toEqual([210, 0, 220, 10]);
    expect(boxOf(b)).toEqual([100, 0, 130, 30]);
    expect(boxOf(c)).toEqual([200, 0, 220, 10]);
    // three groups, one of them hidden, are two units: nothing to spread
    const steps = cam().past.length;
    cam().distribute('h', 'gaps');
    expect(cam().past.length).toBe(steps);
  });

  it('moves with its group, which is rigid – a group that holds a hidden part and a visible one', () => {
    cam().add([rectangle(300, 0, 10, 10), rectangle(340, 0, 10, 10)]);
    const [first, second] = items().slice(3);
    expect(first!.group).toBe(second!.group);
    cam().setHidden(second!.id, true);
    // the group is selected: both parts move, the hidden one stays hidden
    cam().select(first!.group);
    cam().nudge(0, 7);
    expect(boxOf(first!.id)).toEqual([300, 7, 310, 17]);
    expect(boxOf(second!.id)).toEqual([340, 7, 350, 17]);
    expect(items().find((i) => i.id === second!.id)!.hidden).toBe(true);
    // aligned against another part, the group counts by the part in sight – 300…310, not 300…350
    cam().select([items()[0]!.group, first!.group]);
    cam().align('right');
    expect(boxOf(a)).toEqual([300, 0, 310, 10]);
    expect(boxOf(first!.id)).toEqual([300, 7, 310, 17]);
    expect(boxOf(second!.id)).toEqual([340, 7, 350, 17]);
    // an alignment that moves the group takes the hidden part along, by the same shift
    cam().select([items()[2]!.group, first!.group]);
    cam().align('left');
    expect(boxOf(first!.id)).toEqual([200, 7, 210, 17]);
    expect(boxOf(second!.id)).toEqual([240, 7, 250, 17]);
  });

  it('takes a hidden part that was ticked along when everything of it is moved, copied or deleted by hand', () => {
    cam().setHidden(b, true);
    cam().toggleSelect(gb);
    cam().nudge(0, 4);
    expect(boxOf(b)).toEqual([100, 4, 130, 34]);
    expect(items().find((i) => i.id === b)!.hidden).toBe(true);
    // a copy of it is hidden too, and is what is selected now
    cam().duplicate();
    expect(items().filter((i) => i.hidden)).toHaveLength(2);
    cam().removeSelection();
    expect(items().map((i) => i.id)).toContain(b);
    expect(items()).toHaveLength(3);
    // ticked again, it is deleted like any part
    cam().toggleSelect(gb);
    cam().removeSelection();
    expect(items().map((i) => i.id)).not.toContain(b);
  });

  it('takes the job off the stage when every part is hidden – and brings it back, byte for byte', () => {
    const all = program();
    const name = useJob.getState().fileName;
    expect(name).not.toBeNull();
    cam().setHidden(a, true);
    cam().setHidden(b, true);
    expect(useJob.getState().fileName).toBe(name);
    cam().setHidden(c, true);
    // like an empty drawing: nothing to cut, nothing on the stage, nothing to complain of
    expect(useJob.getState().fileName).toBeNull();
    expect(program()).toBe('');
    expect(cam().problems).toEqual([]);
    expect(cam().flipNotes).toEqual([]);
    cam().selectAll();
    expect(cam().selected).toBeNull();
    cam().showAll();
    expect(useJob.getState().fileName).toBe(name);
    expect(program()).toBe(all);
  });

  it('proposes no problem of its own: a part that cannot be cut is no problem while it is hidden', () => {
    // a 2 mm hole is too small for the cutter – drilling asks for a hole at least the tool's diameter
    cam().addSketch({ type: 'circle', d: 2 } as Sketch);
    const hole = items()[3]!;
    cam().setItem(hole.id, { kind: 'drill' });
    expect(cam().problems.map((p) => p.code)).toContain('hole-too-small');
    cam().setHidden(hole.id, true);
    expect(cam().problems).toEqual([]);
    cam().setHidden(hole.id, false);
    expect(cam().problems.map((p) => p.code)).toContain('hole-too-small');
  });

  it('is out of the series motif and of the next drawing sketch’s surroundings', () => {
    const before = seriesMotif().length;
    cam().setHidden(b, true);
    expect(seriesMotif()).toHaveLength(before - 1);
    cam().setHidden(a, true);
    cam().setHidden(c, true);
    expect(seriesMotif()).toEqual([]);
    cam().showAll();
    expect(seriesMotif()).toHaveLength(before);
  });

  it('ends the tab panel and putting tabs on the table – the part has no tabs on the table now', () => {
    cam().openTabs(b);
    expect(cam().tabsOpen).toBe(b);
    cam().setHidden(b, true);
    expect(cam().tabsOpen).toBeNull();
    cam().showAll();
    cam().openTabs(b);
    cam().manualTabs(b);
    cam().setPlacing(b);
    expect(cam().placing).toBe(b);
    cam().setHidden(b, true);
    expect(cam().placing).toBeNull();
    expect(cam().tabsOpen).toBeNull();
  });

  it('takes a rectangle on the table: what it touches replaces the selection, or is added to it', () => {
    cam().setHidden(b, true);
    const frame = { minX: 5, minY: 5, maxX: 150, maxY: 8 };
    // a and the hidden b are in it; only a is taken
    cam().selectRect(frame, false);
    expect(cam().selected).toBe(items()[0]!.group);
    cam().selectRect({ minX: 190, minY: 0, maxX: 230, maxY: 20 }, true);
    expect(cam().selected).toEqual([items()[0]!.group, items()[2]!.group]);
    // replacing: only what it touches now
    cam().selectRect({ minX: 190, minY: 0, maxX: 230, maxY: 20 }, false);
    expect(cam().selected).toBe(items()[2]!.group);
    // a rectangle that touches nothing lets go of the selection – added, it changes nothing
    cam().selectRect({ minX: 50, minY: 50, maxX: 60, maxY: 60 }, true);
    expect(cam().selected).toBe(items()[2]!.group);
    cam().selectRect({ minX: 50, minY: 50, maxX: 60, maxY: 60 }, false);
    expect(cam().selected).toBeNull();
    // only the selection changes: the drawing and its history stay as they are
    const steps = cam().past.length;
    cam().selectRect({ minX: -1, minY: -1, maxX: 300, maxY: 40 }, false);
    expect(cam().past.length).toBe(steps);
    expect(cam().selected).toEqual([items()[0]!.group, items()[2]!.group]);
  });
});

describe('a hidden part of a drawing that is turned over', () => {
  beforeEach(scene);

  it('proposes no registration holes of its own – and leaves hand-placed ones where they are', () => {
    cam().setTwoSided({});
    const together = holes();
    expect(together).toHaveLength(2);
    cam().setHidden(c, true);
    cam().setHidden(b, true);
    // only a is in sight: the holes lie beside it, no longer beside what reaches to x = 220
    const beside = holes();
    expect(Math.max(...beside.map((h) => h.x))).toBeLessThan(100);
    expect(Math.max(...together.map((h) => h.x))).toBeGreaterThan(100);
    cam().showAll();
    expect(holes()).toEqual(together);
    // by hand the holes stay: the proposal is no more (autoHoles is off) – hiding every part keeps them too
    cam().select(items().find((i) => i.registration === 1)!.group);
    cam().nudge(0, -3);
    expect(cam().project!.twoSided!.autoHoles).toBe(false);
    const placed = holes();
    cam().setHidden(a, true);
    cam().setHidden(b, true);
    cam().setHidden(c, true);
    expect(holes()).toEqual(placed);
    cam().showAll();
    expect(holes()).toEqual(placed);
  });

  it('is no side of the job: a part cut from the back that is hidden leaves the job without a back', () => {
    cam().setTwoSided({});
    cam().setItem(b, { side: 'back' });
    expect(cam().flipNotes.map((n) => n.code)).toContain('no-thickness');
    expect(cam().flipNotes.map((n) => n.code)).not.toContain('no-back');
    cam().setHidden(b, true);
    expect(cam().flipNotes).toEqual([{ code: 'no-back' }]);
    cam().setHidden(b, false);
    expect(cam().flipNotes.map((n) => n.code)).toContain('no-thickness');
  });
});

describe('a hidden part in a project file', () => {
  beforeEach(scene);

  it('comes back hidden, and the drawing makes the same program', () => {
    cam().setHidden(b, true);
    const program1 = program();
    const text = cam().saveProject()!;
    const file = JSON.parse(text);
    expect(file.items.map((i: { hidden?: boolean }) => i.hidden)).toEqual([
      undefined,
      true,
      undefined,
    ]);
    expect(file.version).toBe(1);
    cam().close();
    useJob.getState().unload();
    expect('error' in cam().openProject(text)).toBe(false);
    expect(items().map((i) => i.hidden)).toEqual([undefined, true, undefined]);
    // saved again it is the same file (the time it was saved aside)
    expect({ ...JSON.parse(cam().saveProject()!), savedAt: '' }).toEqual({ ...file, savedAt: '' });
    // the program of the file is made from it: the same, hidden part and all
    cam().remake({ take: true });
    expect(program()).toBe(program1);
    cam().showAll();
    expect(program()).not.toBe(program1);
  });
});
