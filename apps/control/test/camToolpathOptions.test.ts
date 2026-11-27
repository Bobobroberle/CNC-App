import { circle, PROBLEM_EFFECT, rectangle, type Contour } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject } from '../src/lib/camProject';
import { itemOperation, useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { seriesMotif } from '../src/store/series';
import { useWorkshop } from '../src/store/workshop';
import '../src/store/underway';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const first = () => items()[0]!;
const program = () => useJob.getState().lines.join('\n');
const codes = () => cam().problems.map((p) => `${p.row}:${p.code}`);

/** The cutter is the 6 mm ball cutter of the workshop, one pass of 6 mm, a ramp of 5° */
const BASE = {
  toolId: 't2',
  depth: 6,
  stepdown: 3,
  rampAngle: 5,
  allowance: 0,
  engraveDepth: 1,
  climb: true,
  routeShort: false,
  tabs: { count: 4, width: 6, height: 2 },
} as const;

beforeEach(() => {
  cam().close();
  cam().setPlacing(null);
  useJob.getState().unload();
  useFlip.getState().cancel();
  useRun.getState().reset();
  useMachine.setState({ fileJob: null, stream: null, lostInJob: null });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  cam().setSettings({ ...BASE });
  cam().open();
});

/** The rapid travel of a program in the plane, mm: every move made at G0 (modal, as the writer sets it). */
function rapidTravel(text: string): number {
  let x = 0;
  let y = 0;
  let rapid = true;
  let total = 0;
  for (const line of text.split('\n')) {
    const g = /^G(\d+)\b/.exec(line);
    if (g) rapid = g[1] === '0';
    const mx = /X(-?\d+(?:\.\d+)?)/.exec(line);
    const my = /Y(-?\d+(?:\.\d+)?)/.exec(line);
    if (!/^(G[0-3]\b|[XYZ])/.test(line)) continue;
    const nx = mx ? Number(mx[1]) : x;
    const ny = my ? Number(my[1]) : y;
    if (rapid) total += Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
  }
  return total;
}

/** The XY of every place the cutter is plunged to the depth (a hole is drilled there), in the order of the program. */
function drilled(text: string): string[] {
  const out: string[] = [];
  let x = '';
  let y = '';
  for (const line of text.split('\n')) {
    x = /X(-?\d+(?:\.\d+)?)/.exec(line)?.[1] ?? x;
    y = /Y(-?\d+(?:\.\d+)?)/.exec(line)?.[1] ?? y;
    if (/^(G1 )?Z-6\b/.test(line)) out.push(`${x},${y}`);
  }
  return out;
}

describe('how a pocket is entered', () => {
  beforeEach(() => {
    cam().add([rectangle(0, 0, 60, 40)]);
    cam().setItem(first().id, { kind: 'pocket', tabs: false });
  });

  it('is the ramp until the part says otherwise – and a ramp is no key at all', () => {
    const ramp = program();
    expect(ramp).not.toMatch(/\bG[23]\b/);
    expect(first().entry).toBeUndefined();
    expect(itemOperation(first(), cam().settings).entry).toBeUndefined();
    cam().setPath(first().id, { entry: 'ramp' });
    expect(program()).toBe(ramp);
    expect('entry' in first()).toBe(false);
    // no step was made for a thing that changes nothing
    expect(cam().past.length).toBe(2);
  });

  it('bores a helix: arcs in the program, the hole as wide as asked within what the cutter allows', () => {
    const ramp = program();
    cam().setPath(first().id, { entry: 'helix' });
    expect(first().entry).toBe('helix');
    expect(itemOperation(first(), cam().settings).entry).toBe('helix');
    const helix = program();
    expect(helix).toMatch(/\bG[23] /);
    expect(helix).not.toBe(ramp);
    expect(codes()).toEqual([]);
    // a wider hole is another program; typed above what the cutter takes it is the widest it takes
    cam().setPath(first().id, { helixDiameter: 8 });
    expect(first().helixDiameter).toBe(8);
    expect(itemOperation(first(), cam().settings).helixDiameter).toBe(8);
    const wide = program();
    expect(wide).not.toBe(helix);
    cam().setPath(first().id, { helixDiameter: 1000 });
    // brought into the range of a file (200), then held by the library to twice the cutter (12 mm)
    expect(first().helixDiameter).toBe(200);
    const widest = program();
    cam().setPath(first().id, { helixDiameter: 12 });
    expect(program()).toBe(widest);
    // emptied: the default again – the very program of the helix without a number
    cam().setPath(first().id, { helixDiameter: undefined });
    expect('helixDiameter' in first()).toBe(false);
    expect(program()).toBe(helix);
    // back to the ramp: the hole's width goes with the helix, and the program is the ramp's
    cam().setPath(first().id, { helixDiameter: 8 });
    cam().setPath(first().id, { entry: 'ramp' });
    expect('helixDiameter' in first()).toBe(false);
    expect(program()).toBe(ramp);
  });

  it('plunges straight down – at the plunge feed, where the ramp went down slowly along the ring', () => {
    const ramp = program();
    cam().setPath(first().id, { entry: 'plunge' });
    expect(first().entry).toBe('plunge');
    const straight = program();
    expect(straight).not.toBe(ramp);
    expect(codes()).toEqual([]);
    // (a helix width means nothing to it: not kept)
    cam().setPath(first().id, { helixDiameter: 8 });
    expect(first().helixDiameter).toBeUndefined();
    expect(program()).toBe(straight);
  });

  it('says a helix that does not fit as a note: the pocket is cut, entered by ramp – never as "not cut"', () => {
    cam().clear();
    cam().add([rectangle(0, 0, 10, 10)]);
    cam().setItem(first().id, { kind: 'pocket', tabs: false });
    const ramp = program();
    expect(ramp).not.toBe('');
    cam().setPath(first().id, { entry: 'helix' });
    expect(codes()).toEqual(['0:helix-too-big']);
    expect(PROBLEM_EFFECT['helix-too-big']).toBe('cut-differently');
    // the pocket is cut as the ramp cuts it
    expect(program()).toBe(ramp);
  });

  it('is a step to undo, and the other kinds of cut have none of it', () => {
    const was = cam().past.length;
    cam().setPath(first().id, { entry: 'helix' });
    cam().setPath(first().id, { helixDiameter: 8 });
    cam().setPath(first().id, { helixDiameter: 9 });
    // a number being typed is one step with the next; a choice is a step of its own
    expect(cam().past.length - was).toBe(2);
    cam().undo();
    expect(first().entry).toBe('helix');
    expect(first().helixDiameter).toBeUndefined();
    cam().undo();
    expect(first().entry).toBeUndefined();
    cam().redo();
    cam().redo();
    expect(first().helixDiameter).toBe(9);
    // a kind that is not entered in a way of its own takes nothing – and a kind change drops what it cannot use
    cam().setItem(first().id, { kind: 'outside' });
    expect(first().entry).toBeUndefined();
    expect(first().helixDiameter).toBeUndefined();
    cam().setPath(first().id, { entry: 'helix', helixDiameter: 8, peck: 2 });
    expect(first().entry).toBeUndefined();
    expect(first().peck).toBeUndefined();
    cam().setPath(999, { entry: 'helix' });
    cam().setPath(first().id, {});
  });
});

describe('how a hole is drilled', () => {
  beforeEach(() => {
    cam().add([circle(30, 20, 6)]);
    cam().setItem(first().id, { kind: 'drill', tabs: false });
  });

  it('goes through in one go until there is a step – then in steps, with the retract between them', () => {
    const through = program();
    expect(through).not.toBe('');
    cam().setPath(first().id, { peck: 2 });
    expect(first().peck).toBe(2);
    const stepped = program();
    expect(stepped).not.toBe(through);
    // 6 mm in steps of 2: 2, 4, 6
    expect(stepped).toMatch(/Z-2/);
    expect(stepped).toMatch(/Z-4/);
    expect(stepped).toMatch(/Z-6/);
    expect(codes()).toEqual([]);
    // chip breaking: only a little way up between the steps
    cam().setPath(first().id, { peckRetract: 1 });
    expect(first().peckRetract).toBe(1);
    expect(itemOperation(first(), cam().settings)).toMatchObject({ peck: 2, peckRetract: 1 });
    expect(program()).not.toBe(stepped);
    // no step, no retract: the straight drill again
    cam().setPath(first().id, { peck: undefined });
    expect(first().peck).toBeUndefined();
    expect(first().peckRetract).toBeUndefined();
    expect(program()).toBe(through);
  });

  it('brings a typed step into the range of a file', () => {
    cam().setPath(first().id, { peck: 0.001 });
    expect(first().peck).toBe(0.05);
    cam().setPath(first().id, { peck: 99999 });
    expect(first().peck).toBe(500);
    cam().setPath(first().id, { peck: 2, peckRetract: -3 });
    expect(first().peckRetract).toBe(0.05);
  });

  it('says a hole that is larger than the cutter as a note: it is bored, not pecked – never as "not cut"', () => {
    cam().clear();
    cam().add([circle(30, 20, 12)]);
    cam().setItem(first().id, { kind: 'drill', tabs: false });
    const bored = program();
    expect(bored).not.toBe('');
    cam().setPath(first().id, { peck: 2 });
    expect(codes()).toEqual(['0:peck-not-possible']);
    expect(PROBLEM_EFFECT['peck-not-possible']).toBe('cut-differently');
    expect(program()).toBe(bored);
    // a step too small is the same – and undoing it is quiet again
    cam().undo();
    expect(codes()).toEqual([]);
  });

  it('is not carried to another kind: a peck on a part that becomes an outline is gone', () => {
    cam().setPath(first().id, { peck: 2, peckRetract: 1 });
    cam().setItem(first().id, { kind: 'outside' });
    expect(first().peck).toBeUndefined();
    expect(first().peckRetract).toBeUndefined();
    expect(codes().filter((c) => c.endsWith('peck-not-possible'))).toEqual([]);
  });
});

describe('the shorter route', () => {
  /** Six holes in a bad order for "nearest first": the way is 447.5 mm that way and 388 mm shorter */
  const HOLES = [
    [130, 50],
    [120, 130],
    [140, 70],
    [180, 120],
    [20, 130],
    [50, 30],
  ];

  it('is on for a new drawing, and orders the holes so that the rapid travel is shorter', () => {
    cam().add(
      HOLES.map(([x, y]) => circle(x!, y!, 6)),
      { single: true },
    );
    cam().setItem(first().id, { kind: 'drill', tabs: false });
    const nearest = program();
    cam().setSettings({ routeShort: true });
    cam().remake();
    const short = program();
    expect(short).not.toBe(nearest);
    expect(rapidTravel(short)).toBeLessThan(rapidTravel(nearest) - 1);
    // the same holes, each once: only the order differs
    expect([...drilled(short)].sort()).toEqual([...drilled(nearest)].sort());
    expect(drilled(short)).toHaveLength(6);
    // and off again: the nearest-first program, byte for byte
    cam().setSettings({ routeShort: false });
    cam().remake();
    expect(program()).toBe(nearest);
  });

  it('never makes the program longer, whatever is drawn', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let trial = 0; trial < 12; trial++) {
      cam().close();
      cam().open();
      const n = 3 + Math.floor(rnd() * 9);
      const contours: Contour[] = Array.from({ length: n }, () =>
        circle(10 + Math.round(rnd() * 20) * 10, 10 + Math.round(rnd() * 12) * 10, 6),
      );
      cam().add(contours, { single: true });
      cam().setItem(first().id, { kind: 'drill', tabs: false });
      cam().setSettings({ routeShort: false });
      cam().remake();
      const nearest = rapidTravel(program());
      cam().setSettings({ routeShort: true });
      cam().remake();
      expect(rapidTravel(program()), `trial ${trial}`).toBeLessThanOrEqual(nearest + 1e-6);
    }
  });
});

describe('the order of the cuts by hand', () => {
  /** Four holes in a row, far apart; the nearest-first order from the zero is left to right */
  const row = () => {
    cam().add([circle(20, 20, 6), circle(80, 20, 6), circle(140, 20, 6), circle(200, 20, 6)]);
    cam().ungroup();
    for (const i of items()) cam().setItem(i.id, { kind: 'drill', tabs: false });
  };
  const place = (i: number) => cam().cutOrder[items()[i]!.id];
  const holes = () => drilled(program()).map((s) => Number(s.split(',')[0]));

  it('says where each part comes among the parts cut the same way, as the program was made', () => {
    row();
    expect(items().map((_, i) => place(i))).toEqual([
      { n: 1, of: 4, kind: 'drill' },
      { n: 2, of: 4, kind: 'drill' },
      { n: 3, of: 4, kind: 'drill' },
      { n: 4, of: 4, kind: 'drill' },
    ]);
    expect(holes()).toEqual([20, 80, 140, 200]);
  });

  it('moves a part one place earlier or later, numbers the rank, and undo takes it back in one step', () => {
    row();
    const was = cam().past.length;
    expect(cam().moveInOrder(items()[2]!.id, -1)).toBe(true);
    expect(cam().past.length - was).toBe(1);
    // the whole rank is numbered by the place it was in, the moved one and its neighbour swapped
    expect(items().map((i) => i.seq)).toEqual([0, 2, 1, 3]);
    expect(holes()).toEqual([20, 140, 80, 200]);
    expect(place(2)).toEqual({ n: 2, of: 4, kind: 'drill' });
    expect(place(1)).toEqual({ n: 3, of: 4, kind: 'drill' });
    // later: the hole at 20 goes behind the one at 140
    expect(cam().moveInOrder(items()[0]!.id, 1)).toBe(true);
    expect(holes()).toEqual([140, 20, 80, 200]);
    cam().undo();
    expect(holes()).toEqual([20, 140, 80, 200]);
    cam().undo();
    expect(items().map((i) => i.seq)).toEqual([undefined, undefined, undefined, undefined]);
    expect(holes()).toEqual([20, 80, 140, 200]);
    cam().redo();
    expect(items().map((i) => i.seq)).toEqual([0, 2, 1, 3]);
  });

  it('cannot go before the first or after the last – and nothing is made of it', () => {
    row();
    const was = cam().past.length;
    expect(cam().moveInOrder(items()[0]!.id, -1)).toBe(false);
    expect(cam().moveInOrder(items()[3]!.id, 1)).toBe(false);
    expect(cam().moveInOrder(999, 1)).toBe(false);
    expect(cam().past.length).toBe(was);
  });

  it('gives a part back to the route, or every part – each one step', () => {
    row();
    cam().moveInOrder(items()[3]!.id, -1);
    expect(items().every((i) => i.seq !== undefined)).toBe(true);
    // the part without a number follows the numbered ones
    cam().clearOrder(items()[0]!.id);
    expect(items()[0]!.seq).toBeUndefined();
    expect(holes()).toEqual([80, 200, 140, 20]);
    const steps = cam().past.length;
    cam().clearOrder();
    expect(items().every((i) => i.seq === undefined)).toBe(true);
    expect(cam().past.length - steps).toBe(1);
    expect(holes()).toEqual([20, 80, 140, 200]);
    // nothing to clear: nothing remembered
    cam().clearOrder();
    cam().clearOrder(items()[0]!.id);
    expect(cam().past.length - steps).toBe(1);
  });

  it('keeps the kinds in their order and what lies inside a contour before it – and says so', () => {
    cam().add([rectangle(0, 0, 100, 100), rectangle(30, 30, 20, 20)]);
    cam().ungroup();
    const [outer, inner] = items();
    for (const i of [outer!, inner!]) cam().setItem(i.id, { kind: 'outside', tabs: false });
    const before = program();
    // the inner one is cut first, as it lies inside
    expect(cam().cutOrder[inner!.id]!.n).toBe(1);
    expect(cam().cutOrder[outer!.id]!.n).toBe(2);
    cam().moveInOrder(outer!.id, -1);
    expect(items().map((i) => i.seq)).toEqual([0, 1]);
    // the wish could not be met: the outline of the plate still waits for what lies inside it
    expect(codes()).toEqual(['0:order-overridden']);
    expect(PROBLEM_EFFECT['order-overridden']).toBe('cut-differently');
    expect(program()).toBe(before);
    expect(cam().cutOrder[inner!.id]!.n).toBe(1);
  });

  it('forgets the place when the kind of cut changes – it meant something in the old kind only', () => {
    row();
    cam().moveInOrder(items()[1]!.id, -1);
    expect(items()[1]!.seq).toBe(0);
    cam().setItem(items()[1]!.id, { kind: 'on' });
    expect(items()[1]!.seq).toBeUndefined();
    expect(items()[0]!.seq).toBe(1);
    // the part is not in the rank of the holes any more
    expect(cam().cutOrder[items()[1]!.id]).toEqual({ n: 1, of: 1, kind: 'on' });
    expect(cam().cutOrder[items()[0]!.id]).toEqual({ n: 1, of: 3, kind: 'drill' });
  });

  it('leaves out what is hidden and what is not cut', () => {
    row();
    cam().setHidden(items()[1]!.id, true);
    expect(cam().cutOrder[items()[1]!.id]).toBeUndefined();
    expect(items().map((_, i) => place(i)?.of)).toEqual([3, undefined, 3, 3]);
    expect(cam().moveInOrder(items()[1]!.id, 1)).toBe(false);
    cam().setItem(items()[3]!.id, { kind: 'none' });
    expect(place(3)).toBeUndefined();
    expect(items().map((_, i) => place(i)?.of)).toEqual([2, undefined, 2, undefined]);
  });

  it('counts each side of a part turned over among itself', () => {
    cam().add([rectangle(0, 0, 100, 60)]);
    cam().ungroup();
    cam().add([circle(20, 20, 6), circle(80, 20, 6)]);
    cam().ungroup();
    cam().setTwoSided({ thickness: 12 });
    const [, hole1, hole2] = items();
    cam().setItem(hole1!.id, { kind: 'drill', tabs: false });
    cam().setItem(hole2!.id, { kind: 'drill', tabs: false, side: 'back' });
    expect(cam().cutOrder[hole1!.id]).toEqual({ n: 1, of: 1, kind: 'drill' });
    expect(cam().cutOrder[hole2!.id]).toEqual({ n: 1, of: 1, kind: 'drill' });
    // each is alone on its side: neither can be moved
    expect(cam().moveInOrder(hole1!.id, 1)).toBe(false);
    expect(cam().moveInOrder(hole2!.id, -1)).toBe(false);
  });

  it('is not kept by a copy – a copy has no place of its own and follows the route', () => {
    row();
    cam().moveInOrder(items()[1]!.id, -1);
    expect(items()[1]!.seq).toBe(0);
    cam().select(items()[1]!.group);
    cam().duplicate();
    expect(items()).toHaveLength(5);
    // (the original keeps its number; the copy would otherwise share it and be cut ahead of every part without one)
    expect(items()[1]!.seq).toBe(0);
    expect(items()[4]!.seq).toBeUndefined();
    // (moving one part numbered the whole rank: the four originals have a number, the copy none)
    expect(items().map((i) => i.seq !== undefined)).toEqual([true, true, true, true, false]);
    // an array of it, and a paste of everything – the same: the copies follow the route
    cam().select(items()[1]!.group);
    cam().array(3, 1, 10);
    expect(
      items()
        .slice(0, 4)
        .every((i) => i.seq !== undefined),
    ).toBe(true);
    expect(
      items()
        .slice(4)
        .every((i) => i.seq === undefined),
    ).toBe(true);
    const have = items().length;
    cam().selectAll();
    cam().copy();
    cam().paste();
    expect(items().length).toBeGreaterThan(have);
    expect(
      items()
        .slice(0, 4)
        .every((i) => i.seq !== undefined),
    ).toBe(true);
    expect(
      items()
        .slice(have)
        .every((i) => i.seq === undefined),
    ).toBe(true);
  });

  it('forgets the place when the part goes to the other side – its rank is the side’s', () => {
    cam().add([rectangle(0, 0, 100, 60)]);
    cam().ungroup();
    cam().add([circle(20, 20, 6), circle(80, 20, 6)]);
    cam().ungroup();
    cam().setTwoSided({ thickness: 12 });
    const [, hole1, hole2] = items();
    for (const h of [hole1!, hole2!]) cam().setItem(h.id, { kind: 'drill', tabs: false });
    expect(cam().moveInOrder(hole1!.id, 1)).toBe(true);
    expect(items().find((i) => i.id === hole1!.id)!.seq).toBe(1);
    cam().setItem(hole2!.id, { side: 'back' });
    cam().setItem(hole1!.id, { side: 'back' });
    expect(items().find((i) => i.id === hole1!.id)!.seq).toBeUndefined();
    expect(items().find((i) => i.id === hole2!.id)!.seq).toBeUndefined();
  });

  it('remembers nothing for a wish the library overrides, once it has been written – a second tap is none', () => {
    // two plates, the inner one inside the outer: whatever the numbers, the inner is cut first
    cam().add([rectangle(0, 0, 100, 100), rectangle(30, 30, 20, 20)]);
    cam().ungroup();
    const [outer, inner] = items();
    for (const i of [outer!, inner!]) cam().setItem(i.id, { kind: 'outside', tabs: false });
    expect(cam().moveInOrder(outer!.id, -1)).toBe(true);
    expect(items().map((i) => i.seq)).toEqual([0, 1]);
    expect(codes()).toEqual(['0:order-overridden']);
    const steps = cam().past.length;
    const lying = useJob.getState().lines;
    // the same numbers again: not a step of undo, not a program made anew
    expect(cam().moveInOrder(outer!.id, -1)).toBe(false);
    expect(cam().moveInOrder(outer!.id, -1)).toBe(false);
    expect(cam().past.length).toBe(steps);
    expect(useJob.getState().lines).toBe(lying);
    // (the one place it could still go – the inner plate later – writes the numbers that are there: nothing either)
    expect(cam().moveInOrder(inner!.id, 1)).toBe(false);
    expect(cam().past.length).toBe(steps);
    // taking a number away is a real change – and one step
    cam().clearOrder(outer!.id);
    expect(cam().past.length).toBe(steps + 1);
    expect(items().map((i) => i.seq)).toEqual([undefined, 1]);
  });
});

describe('a job that is under way keeps its program', () => {
  it('whatever is changed in the order and the way of cutting – the drawing is ahead of it', () => {
    cam().add([circle(20, 20, 6), circle(80, 20, 6), circle(140, 20, 6)]);
    cam().ungroup();
    for (const i of items()) cam().setItem(i.id, { kind: 'drill', tabs: false });
    const lying = program();
    useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
    expect(cam().ahead).toBe(false);
    cam().moveInOrder(items()[0]!.id, 1);
    expect(program()).toBe(lying);
    expect(cam().ahead).toBe(true);
    cam().setPath(items()[1]!.id, { peck: 2 });
    cam().clearOrder();
    cam().setSettings({ routeShort: true });
    cam().remake();
    expect(program()).toBe(lying);
    // and the order says what the drawing would cut (not what lies on the table)
    expect(items()).toHaveLength(3);
    useMachine.setState({ fileJob: null });
  });
});

describe('the new keys of an item in a project file', () => {
  const file = () => {
    cam().add([rectangle(0, 0, 60, 40), circle(80, 20, 6)]);
    cam().ungroup();
    cam().setItem(items()[0]!.id, { kind: 'pocket', tabs: false });
    cam().setItem(items()[1]!.id, { kind: 'drill', tabs: false });
    cam().setPath(items()[0]!.id, { entry: 'helix', helixDiameter: 9 });
    cam().setPath(items()[1]!.id, { peck: 2, peckRetract: 1 });
    cam().moveInOrder(items()[0]!.id, 1);
    return JSON.parse(cam().saveProject()!);
  };
  const read = (f: unknown) => parseProject(JSON.stringify(f));
  const ok = (f: unknown) => read(f) as Exclude<ReturnType<typeof parseProject>, { error: string }>;

  it('are written and read back: the same drawing, the same program', () => {
    const f = file();
    expect(f.items[0]).toMatchObject({ entry: 'helix', helixDiameter: 9 });
    expect(f.items[1]).toMatchObject({ peck: 2, peckRetract: 1 });
    // (a rank of one needs no number: none is written for a part that has none)
    const lying = program();
    cam().close();
    useJob.getState().unload();
    expect(cam().openProject(JSON.stringify(f))).toEqual({ toolMissing: false });
    expect(items()[0]).toMatchObject({ entry: 'helix', helixDiameter: 9 });
    expect(items()[1]).toMatchObject({ peck: 2, peckRetract: 1 });
    expect(program()).toBe(lying);
  });

  it('are left off where they say nothing: a ramp, a number that means nothing without another', () => {
    const f = file();
    f.items[0].entry = 'ramp';
    f.items[1].peckRetract = 1;
    delete f.items[1].peck;
    f.items[0].helixDiameter = 9;
    const items2 = ok(f).project.items;
    expect('entry' in items2[0]!).toBe(false);
    expect('helixDiameter' in items2[0]!).toBe(false);
    expect('peckRetract' in items2[1]!).toBe(false);
  });

  it('keeps nothing that its kind of cut does not take: the drawing never holds it either', () => {
    const f = file();
    // a hand-written file: a peck on a pocket, a way in on a hole, a place in the order of a part that is not cut
    f.items[0].peck = 2;
    f.items[0].peckRetract = 1;
    f.items[1].entry = 'helix';
    f.items[1].helixDiameter = 9;
    f.items[1].kind = 'none';
    f.items[1].seq = 3;
    const [pocket, none] = ok(f).project.items;
    expect(pocket).toMatchObject({ entry: 'helix', helixDiameter: 9 });
    expect('peck' in pocket!).toBe(false);
    expect('peckRetract' in pocket!).toBe(false);
    expect('entry' in none!).toBe(false);
    expect('helixDiameter' in none!).toBe(false);
    expect('seq' in none!).toBe(false);
    // …and the values themselves are still read strictly, whatever the kind
    f.items[1].peck = 0.01;
    expect(read(f)).toEqual({ error: 'invalid-project' });
  });

  it('refuses a value of the wrong kind or outside what the fields take', () => {
    for (const [key, bad] of [
      ['entry', 'spiral'],
      ['entry', 3],
      ['helixDiameter', 0.1],
      ['helixDiameter', 201],
      ['helixDiameter', 'wide'],
      ['helixDiameter', Number.NaN],
      ['peck', 0.04],
      ['peck', 501],
      ['peck', '2'],
      ['peckRetract', 0],
      ['peckRetract', -1],
      ['peckRetract', 501],
      ['seq', -1],
      ['seq', 10000],
      ['seq', 1.5],
      ['seq', '3'],
      ['seq', Number.MAX_SAFE_INTEGER + 2],
    ] as const) {
      const f = file();
      f.items[0][key] = bad;
      expect(read(f), `${key} ${String(bad)}`).toEqual({ error: 'invalid-project' });
    }
  });

  it('takes the edges of what the fields take, and a whole place in the order', () => {
    const f = file();
    f.items[0].helixDiameter = 0.5;
    f.items[1].peck = 0.05;
    f.items[1].peckRetract = 500;
    f.items[0].seq = 0;
    f.items[1].seq = 9999;
    const i = ok(f).project.items;
    expect(i[0]).toMatchObject({ helixDiameter: 0.5, seq: 0 });
    expect(i[1]).toMatchObject({ peck: 0.05, peckRetract: 500, seq: 9999 });
    f.items[0].helixDiameter = 200;
    expect(ok(f).project.items[0]!.helixDiameter).toBe(200);
  });
});

describe('a drawing of many parts', () => {
  /** A project file of `n` small circles made into holes (built as a file: one program is made when it is opened) */
  function many(n: number, numbered: boolean, kind: 'drill' | 'outside' = 'drill') {
    const items = Array.from({ length: n }, (_, i) => ({
      id: 2 * i + 1,
      group: 2 * i + 2,
      source: [
        kind === 'drill'
          ? circle(
              10 + (i % 25) * 12 + ((i * 7) % 5),
              10 + Math.floor(i / 25) * 12 + ((i * 3) % 4),
              6,
            )
          : rectangle(
              10 + (i % 25) * 30 + ((i * 7) % 5),
              10 + Math.floor(i / 25) * 30 + ((i * 3) % 4),
              20,
              20,
            ),
      ],
      placement: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      kind,
      tabs: kind === 'outside',
      relief: null,
      side: 'front',
      ...(numbered ? { seq: (i * 7) % n } : {}),
    }));
    return JSON.stringify({
      format: 'lowrider-cam-project',
      version: 1,
      savedAt: '2026-01-01T00:00:00.000Z',
      name: 'viele',
      twoSided: null,
      items,
      settings: { toolId: 't2' },
    });
  }

  it('is made on release in well under a second per program – with the short route and with every part numbered', () => {
    const times: Record<string, number> = {};
    for (const [name, numbered, kind] of [
      ['300 holes, short route', false, 'drill'],
      ['300 holes, short route, every part numbered', true, 'drill'],
      ['300 outlines with tabs, short route', false, 'outside'],
      ['300 outlines with tabs, short route, every part numbered', true, 'outside'],
    ] as const) {
      cam().close();
      cam().open();
      expect(cam().openProject(many(300, numbered, kind))).toEqual({ toolMissing: false });
      // the file says off (it does not say): switch it on and make the program again, as a tap on the box does
      expect(cam().settings.routeShort).toBe(false);
      cam().setSettings({ routeShort: true });
      const t0 = performance.now();
      cam().remake();
      times[name] = Math.round(performance.now() - t0);
      expect(items()).toHaveLength(300);
      expect(program()).not.toBe('');
      expect(Object.keys(cam().cutOrder)).toHaveLength(300);
      expect(items().every((i) => (i.seq !== undefined) === numbered)).toBe(true);
    }
    console.info(`generate(), 300 parts: ${JSON.stringify(times)} ms`);
    for (const ms of Object.values(times)) expect(ms).toBeLessThan(3000);
  });
});

describe('a series on blanks', () => {
  it('takes the way a pocket is entered, the peck and the place in the order along – its program keeps only the moves, so a helix that falls back to the ramp is not said there', () => {
    cam().close();
    cam().open();
    cam().add([rectangle(0, 0, 60, 40), circle(80, 20, 6)]);
    cam().ungroup();
    cam().setItem(items()[0]!.id, { kind: 'pocket', tabs: false });
    cam().setItem(items()[1]!.id, { kind: 'drill', tabs: false });
    cam().setPath(items()[0]!.id, { entry: 'helix', helixDiameter: 9 });
    cam().setPath(items()[1]!.id, { peck: 2, peckRetract: 1 });
    cam().moveInOrder(items()[1]!.id, 1);
    const [pocket, drill] = seriesMotif();
    expect(pocket).toMatchObject({ kind: 'pocket', entry: 'helix', helixDiameter: 9 });
    expect(drill).toMatchObject({ kind: 'drill', peck: 2, peckRetract: 1 });
    // (a rank of one needs no number: none is made for it)
    expect(pocket!.seq).toBeUndefined();
  });
});
