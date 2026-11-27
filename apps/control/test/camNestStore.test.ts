import { circle, nestParts, rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { holeCentre, itemsBounds } from '../src/lib/camItems';
import { defaultNestGap } from '../src/lib/camNest';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useWorkshop } from '../src/store/workshop';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const steps = () => cam().past.length;
/** The box of every thing in the list: left, bottom, right, top */
const boxes = () =>
  items().map((i) => {
    const b = itemsBounds([i])!;
    return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1e6) / 1e6 + 0);
  });
const holes = () =>
  items()
    .filter((i) => i.registration !== undefined)
    .map((i) => ({ n: i.registration, ...holeCentre(i) }));

/** The stock of the Job room: from (x, y), w × h – the work zero at the front left top corner as the app enters it */
function stock(x: number, y: number, w: number, h: number) {
  useWorkshop.getState().setSetup({
    stock: { min: { x, y, z: -18 }, max: { x: x + w, y: y + h, z: 0 } },
    fixtures: [],
    fixtureFrame: 'machine',
  });
}

function scene() {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  // the 6 mm cutter: the gap that is meant unless one is typed is 8 mm
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
}

/** What the library says for these boxes on this stock, in the stock's own coordinates, by the order of the parts */
const libraryPlaces = (
  sizes: [number, number][],
  w: number,
  h: number,
  gap: number,
  rotate = false,
) =>
  nestParts(
    sizes.map(([width, height], id) => ({ id, width, height })),
    { width: w, height: h },
    { gap, rotate },
  );

describe('packing parts onto the stock', () => {
  beforeEach(scene);

  it('puts the parts where the library places their boxes – shifted to where the stock lies – in one step', () => {
    // three plates, far from the stock: 60 × 40 each. The stock is 150 × 100 and starts at (20, 30)
    cam().add([rectangle(500, 500, 60, 40)]);
    cam().add([rectangle(700, 520, 60, 40)]);
    cam().add([rectangle(900, 540, 60, 40)]);
    stock(20, 30, 150, 100);
    cam().selectAll();
    const was = steps();
    const before = program();
    const report = cam().nest({ gap: 10 });
    const want = libraryPlaces(
      [
        [60, 40],
        [60, 40],
        [60, 40],
      ],
      150,
      100,
      10,
    );
    expect(want.unplaced).toEqual([]);
    expect(report).toMatchObject({ unplaced: [], moved: 3, rotate: false, gap: 10 });
    expect(report!.placed).toHaveLength(3);
    // exactly the library's places, in the stock's coordinates shifted by its corner
    expect(boxes()).toEqual(
      want.placed.map((p) => [20 + p.x, 30 + p.y, 20 + p.x + 60, 30 + p.y + 40]),
    );
    // one step of undo, the selection stays, the program follows the new places
    expect(steps()).toBe(was + 1);
    expect(cam().selected).toBe('all');
    expect(program()).not.toBe(before);
    // all inside the stock, and at least the gap between any two
    const all = boxes();
    for (const [l, b, r, t] of all) {
      expect(l!).toBeGreaterThanOrEqual(20);
      expect(b!).toBeGreaterThanOrEqual(30);
      expect(r!).toBeLessThanOrEqual(170);
      expect(t!).toBeLessThanOrEqual(130);
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [al, ab, ar, at] = all[i]!;
        const [bl, bb, br, bt] = all[j]!;
        const apart = Math.max(bl! - ar!, al! - br!, bb! - at!, ab! - bt!);
        expect(apart, `parts ${i} and ${j}`).toBeGreaterThanOrEqual(10 - 1e-9);
      }
    }
    // undone as one: every part where it was
    cam().undo();
    expect(boxes()).toEqual([
      [500, 500, 560, 540],
      [700, 520, 760, 560],
      [900, 540, 960, 580],
    ]);
    expect(program()).toBe(before);
    expect(steps()).toBe(was);
  });

  it('is worked out by hand for two parts that fit side by side exactly', () => {
    // 60 + 10 + 60 = 130 wide on a stock 130 × 40: one way only – the first at the corner, the second beside it
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    stock(0, 0, 130, 40);
    cam().selectAll();
    cam().nest({ gap: 10 });
    expect(boxes()).toEqual([
      [0, 0, 60, 40],
      [70, 0, 130, 40],
    ]);
  });

  it('names what finds no place, and leaves it where it was', () => {
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    cam().add([rectangle(700, 100, 60, 40)]);
    stock(0, 0, 130, 40);
    const [a, b, c] = items().map((i) => i.group) as [number, number, number];
    cam().selectAll();
    const report = cam().nest({ gap: 10 })!;
    // the third is the one without a place (the order of the list decides among equals)
    expect(report.unplaced).toEqual([c]);
    expect(report.placed).toEqual([a, b]);
    expect(boxes()).toEqual([
      [0, 0, 60, 40],
      [70, 0, 130, 40],
      [700, 100, 760, 140],
    ]);
    expect(cam().nested).toBe(report);
  });

  it('puts nothing on the stock where no part is larger than it allows, and says so for every part', () => {
    cam().add([rectangle(10, 10, 200, 100)]);
    cam().add([rectangle(300, 10, 200, 100)]);
    stock(0, 0, 50, 50);
    cam().selectAll();
    const was = steps();
    const before = boxes();
    const report = cam().nest({ gap: 5 })!;
    expect(report.placed).toEqual([]);
    expect(report.unplaced).toHaveLength(2);
    expect(report.moved).toBe(0);
    // nothing moved, so nothing remembered
    expect(steps()).toBe(was);
    expect(boxes()).toEqual(before);
  });

  it('holds a typed gap to the longer side of the stock: a part larger than the stock is never reported as placed', () => {
    // 1e20 used to be absorbed by the library's float arithmetic and put the 200 × 200 plate at the stock's origin
    cam().add([rectangle(300, 300, 200, 200)]);
    cam().add([rectangle(600, 300, 50, 50)]);
    stock(0, 0, 100, 100);
    cam().selectAll();
    const before = boxes();
    const report = cam().nest({ gap: 1e20 })!;
    expect(report.gap).toBe(100);
    expect(report.unplaced).toHaveLength(1);
    // the plate that does not fit stays where it was
    expect(boxes()[0]).toEqual(before[0]);
    // the small one is on the stock
    expect(boxes()[1]!.every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it('turns a part by 90° where that is allowed and the part is long: the box after the turn, about its own corner', () => {
    // 100 × 20 on a stock 30 wide and 200 high that starts at (50, 20): only turned does it fit – 20 × 100
    cam().add([rectangle(400, 400, 100, 20)]);
    stock(50, 20, 30, 200);
    cam().selectAll();
    expect(cam().nest({ gap: 0 })!.placed).toEqual([]);
    expect(boxes()).toEqual([[400, 400, 500, 420]]);
    const report = cam().nest({ gap: 0, rotate: true })!;
    expect(report.rotate).toBe(true);
    expect(report.unplaced).toEqual([]);
    // turned 90° counter-clockwise: 20 wide, 100 high, its lower left corner at the stock's corner
    expect(boxes()).toEqual([[50, 20, 70, 120]]);
    // it was turned by composing a matrix: the contour points are the ones it was drawn with
    expect(items()[0]!.source[0]).toEqual(rectangle(400, 400, 100, 20));
    expect(items()[0]!.placement.a).toBe(0);
    expect(items()[0]!.placement.b).toBe(1);
    // and one step of undo gives it back as it lay
    cam().undo();
    expect(boxes()).toEqual([[400, 400, 500, 420]]);
  });

  it('keeps a part that already stands where it is placed untouched – no step, no noise', () => {
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    stock(0, 0, 130, 40);
    cam().selectAll();
    cam().nest({ gap: 10 });
    const was = steps();
    const list = items();
    const before = program();
    // the same again (without turning: nothing is asked of a layout that is the layout) – nothing moves
    const again = cam().nest({ gap: 10 })!;
    expect(again.moved).toBe(0);
    expect(again.placed).toHaveLength(2);
    expect(steps()).toBe(was);
    expect(items()).toBe(list);
    expect(program()).toBe(before);
    // the answer is for this drawing as it is
    expect(cam().nested).toBe(again);
    expect(again.items).toBe(items());
  });

  it('takes the default gap of the cutter and 2 mm where none is typed – and a bad number is none', () => {
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    // the 6 mm cutter: 8 mm between the parts
    expect(defaultNestGap(6)).toBe(8);
    stock(0, 0, 128, 40);
    cam().selectAll();
    const report = cam().nest()!;
    expect(report.gap).toBe(8);
    expect(boxes()).toEqual([
      [0, 0, 60, 40],
      [68, 0, 128, 40],
    ]);
    cam().undo();
    for (const bad of [NaN, -3, Infinity]) {
      expect(cam().nest({ gap: bad })!.gap).toBe(8);
      cam().undo();
    }
    // a gap of 0 is a gap of 0
    expect(cam().nest({ gap: 0 })!.gap).toBe(0);
  });

  it('does nothing without a stock, and nothing without a selection', () => {
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    cam().selectAll();
    const was = steps();
    const before = boxes();
    expect(cam().nest()).toBeNull();
    stock(0, 0, 130, 40);
    cam().select(null);
    expect(cam().nest()).toBeNull();
    expect(cam().nested).toBeNull();
    expect(steps()).toBe(was);
    expect(boxes()).toEqual(before);
  });

  it('packs only what is selected, and leaves the rest where it is', () => {
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    cam().add([rectangle(900, 900, 60, 40)]);
    stock(0, 0, 130, 40);
    const [a, b] = items().map((i) => i.group) as [number, number, number];
    cam().select([a, b]);
    cam().nest({ gap: 10 });
    expect(boxes()).toEqual([
      [0, 0, 60, 40],
      [70, 0, 130, 40],
      [900, 900, 960, 940],
    ]);
  });
});

describe('a part that stays where it is and a packed part that lands on it', () => {
  beforeEach(scene);

  it('is said: the packer knows no obstacles, so the card names what is cut into what', () => {
    // stock 200 × 100 from the origin; A and B (60 × 40) are selected and far away; C lies on the stock, not selected
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    cam().add([rectangle(10, 10, 60, 40)]);
    stock(0, 0, 200, 100);
    const [a, b, c] = items().map((i) => i.group) as [number, number, number];
    cam().select([a, b]);
    const report = cam().nest({ gap: 8 })!;
    // A is put at the corner of the stock – on C, which stays where it was
    expect(boxes()[0]).toEqual([0, 0, 60, 40]);
    expect(boxes()[2]).toEqual([10, 10, 70, 50]);
    expect(report.overlapped).toEqual([c]);
    // the report is the card's: it names the part (and goes with the drawing it was made for)
    expect(cam().nested).toBe(report);
    // moving the part that stays out of the way clears it: the report is of an older drawing, and not shown any more
    cam().select(c);
    cam().nudge(300, 300);
    expect(cam().nested!.items).not.toBe(items());
    // packed again, there is nothing left to overlap
    cam().select([a, b]);
    expect(cam().nest({ gap: 8 })!.overlapped).toEqual([]);
  });

  it('is not said for a part that stays clear, a hidden one, or a hole that goes with its plate', () => {
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    // a part far outside the stock, one lying on it but hidden, and one lying on the stock beside the packed ones
    cam().add([rectangle(900, 900, 60, 40)]);
    cam().add([rectangle(10, 10, 60, 40)]);
    stock(0, 0, 200, 100);
    const [a, b, far, hiddenOne] = items().map((i) => i.group) as [number, number, number, number];
    cam().setHidden(items()[3]!.id, true);
    cam().select([a, b]);
    const report = cam().nest({ gap: 8 })!;
    expect(report.overlapped).toEqual([]);
    expect(far).toBeGreaterThan(0);
    expect(hiddenOne).toBeGreaterThan(0);
  });

  it('names a selected part that found no place and stays where it is, if a packed one lands on it', () => {
    // the stock takes one 60 × 40 plate only; the second selected plate lies on the stock too, at (10, 10)
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(10, 10, 60, 40)]);
    stock(0, 0, 70, 45);
    const [a, b] = items().map((i) => i.group) as [number, number];
    cam().select([a, b]);
    const report = cam().nest({ gap: 5 })!;
    // one is packed, the other has no place: whichever stays lies where it did, and a packed one covers it
    expect(report.placed).toHaveLength(1);
    expect(report.unplaced).toHaveLength(1);
    expect(report.overlapped).toEqual(report.unplaced);
  });
});

describe('what lies inside the box of a packed part goes with it', () => {
  beforeEach(scene);

  /** A plate 100 × 60 with a hole of 10 at its (20, 30) – each its own group – and a second plate 50 × 50 */
  function plateWithHole() {
    cam().add([rectangle(500, 500, 100, 60)]);
    cam().add([circle(520, 530, 10)]);
    cam().add([rectangle(300, 0, 50, 50)]);
    stock(0, 0, 200, 100);
    return items().map((i) => i.group) as [number, number, number];
  }

  it('carries the hole of a plate with the plate, though it is a group of its own and not selected', () => {
    const [plate, hole, small] = plateWithHole();
    expect(new Set([plate, hole, small]).size).toBe(3);
    // only the two plates are selected: the hole is not
    cam().select([plate, small]);
    const report = cam().nest({ gap: 5 })!;
    expect(report.riders).toBe(1);
    expect(report.placed).toEqual([plate, small]);
    // the plate (the larger) comes first, at the corner; the hole is where it was in the plate: 20, 30 from its corner
    const [plateBox, holeBox, smallBox] = boxes();
    expect(plateBox).toEqual([0, 0, 100, 60]);
    expect(holeBox).toEqual([15, 25, 25, 35]);
    // the small plate is beside it with 5 mm between – not on top of anything
    expect(smallBox![0]).toBeGreaterThanOrEqual(105 - 1e-9);
    // the hole is still a hole in the plate, as a program: one cut-out inside the plate
    expect(items()[1]!.kind).toBe('inside');
    // three groups moved: the plate, its hole and the small plate
    expect(report.moved).toBe(3);
  });

  it('carries it along when the plate is turned – by the plate’s own map, so the hole stays in its place', () => {
    cam().add([rectangle(500, 500, 100, 20)]);
    cam().add([circle(520, 510, 6)]);
    stock(50, 20, 30, 200);
    const [plate] = items().map((i) => i.group) as [number, number];
    cam().select(plate);
    cam().nest({ gap: 0, rotate: true });
    // the plate stands 20 × 100 at the stock's corner; its hole, 20 along it from the end, is 20 up from the corner
    expect(boxes()[0]).toEqual([50, 20, 70, 120]);
    const [x, y] = [holeCentre(items()[1]!).x, holeCentre(items()[1]!).y];
    // (520, 510) was 20 along the plate and 10 across: turned counter-clockwise about the plate's lower left
    // corner it is 10 across to the left of … which puts it at (70 − 10, 20 + 20)
    expect(x).toBeCloseTo(60, 9);
    expect(y).toBeCloseTo(40, 9);
  });

  it('carries a hidden hole too, so it is where it belongs when it is shown again', () => {
    const [plate, , small] = plateWithHole();
    cam().setHidden(items()[1]!.id, true);
    cam().select([plate, small]);
    cam().nest({ gap: 5 });
    expect(boxes()[1]).toEqual([15, 25, 25, 35]);
    cam().setHidden(items()[1]!.id, false);
    expect(boxes()[1]).toEqual([15, 25, 25, 35]);
  });

  it('packs a hole selected with its plate as part of it – two units, one box', () => {
    const [plate, hole, small] = plateWithHole();
    cam().select([plate, hole, small]);
    const report = cam().nest({ gap: 5 })!;
    // the hole is no part of its own to pack: two carriers, one rider
    expect(report.placed).toEqual([plate, small]);
    expect(report.riders).toBe(1);
    expect(boxes()[1]).toEqual([15, 25, 25, 35]);
  });

  it('does not take what lies beside the plate', () => {
    cam().add([rectangle(500, 500, 100, 60)]);
    cam().add([circle(700, 530, 10)]);
    stock(0, 0, 200, 100);
    const [plate] = items().map((i) => i.group) as [number, number];
    cam().select(plate);
    const report = cam().nest({ gap: 5 })!;
    expect(report.riders).toBe(0);
    expect(boxes()).toEqual([
      [0, 0, 100, 60],
      [695, 525, 705, 535],
    ]);
  });
});

describe('where the rule that carries what lies inside a box stops', () => {
  beforeEach(scene);

  it('packs a feature that only reaches into the box of a plate as a part of its own – it does not go with the plate', () => {
    // a plate 100 × 60 at (500, 500) and a notch 20 × 20 across its right edge (x 590…610): its box is not inside the
    // plate's, so under "Alles auswählen" it is a part like the plate – the hint says to group such a thing first
    cam().add([rectangle(500, 500, 100, 60)]);
    cam().add([rectangle(590, 520, 20, 20)]);
    stock(0, 0, 300, 100);
    const [plate, notch] = items().map((i) => i.group) as [number, number];
    cam().selectAll();
    const report = cam().nest({ gap: 10 })!;
    expect(report.riders).toBe(0);
    expect(report.placed).toEqual([plate, notch]);
    const [p, n] = boxes() as [number[], number[]];
    expect(p).toEqual([0, 0, 100, 60]);
    // beside the plate with the gap – no longer across its edge
    expect(n[0]! - p[2]!).toBeGreaterThanOrEqual(10 - 1e-9);
    // grouped first it is one unit, and the notch stays where it cuts the plate
    cam().undo();
    cam().select([plate, notch]);
    cam().group();
    const grouped = cam().nest({ gap: 10 })!;
    expect(grouped.placed).toHaveLength(1);
    expect(boxes()[1]![0]! - boxes()[0]![0]!).toBe(90);
  });

  it('pulls holes out of their plate when they are selected and the plate is not', () => {
    // a frame drawn round two holes selects exactly that: they are the parts to pack, the plate is not
    cam().add([rectangle(500, 500, 100, 60)]);
    cam().add([circle(520, 530, 10)]);
    cam().add([circle(560, 530, 10)]);
    stock(0, 0, 200, 100);
    const [, h1, h2] = items().map((i) => i.group) as [number, number, number];
    cam().select([h1, h2]);
    const report = cam().nest({ gap: 5 })!;
    expect(report.placed).toEqual([h1, h2]);
    expect(report.riders).toBe(0);
    // the plate stays; the holes are on the stock now, no longer in the plate
    expect(boxes()[0]).toEqual([500, 500, 600, 560]);
    for (const [l, b, r, t] of boxes().slice(1)) {
      expect(l!).toBeGreaterThanOrEqual(0);
      expect(b!).toBeGreaterThanOrEqual(0);
      expect(r!).toBeLessThanOrEqual(200);
      expect(t!).toBeLessThanOrEqual(100);
    }
  });
});

describe('the registration holes of a two-sided part when it is packed', () => {
  beforeEach(() => {
    scene();
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    cam().setTwoSided({});
  });

  it('are put anew beside the parts while they follow the drawing – and come back with undo', () => {
    stock(0, 0, 400, 100);
    const before = holes();
    cam().selectAll();
    cam().nest({ gap: 10 });
    expect(cam().project!.twoSided!.autoHoles).toBe(true);
    // the parts moved, the holes were proposed again beside them (not where they were)
    expect(holes()).not.toEqual(before);
    expect(items().filter((i) => i.registration === undefined)).toHaveLength(2);
    expect(boxes().slice(0, 2)).toEqual([
      [0, 0, 60, 40],
      [70, 0, 130, 40],
    ]);
    cam().undo();
    expect(holes()).toEqual(before);
  });

  it('stay where a finger put them', () => {
    stock(0, 0, 400, 100);
    const hole = items().find((i) => i.registration === 1)!;
    cam().select(hole.group);
    cam().nudge(-4, 0);
    expect(cam().project!.twoSided!.autoHoles).toBe(false);
    const put = holes();
    cam().selectAll();
    cam().nest({ gap: 10 });
    expect(boxes().slice(0, 2)).toEqual([
      [0, 0, 60, 40],
      [70, 0, 130, 40],
    ]);
    expect(holes()).toEqual(put);
  });

  it('are never packed as parts, whatever is selected', () => {
    stock(0, 0, 400, 100);
    const hole = items().find((i) => i.registration === 1)!;
    cam().select(hole.group);
    const was = steps();
    expect(cam().nest({ gap: 10 })).toBeNull();
    expect(steps()).toBe(was);
  });
});
