import { circle, rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultNestGap, planNest } from '../src/lib/camNest';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useWorkshop } from '../src/store/workshop';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const STOCK = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
const plan = (selected = cam().selected, gap = 5, rotate = false, stock = STOCK) =>
  planNest(items(), selected, stock, { gap, rotate });

/** What lies where, drawn by hand: the boxes below are (x from, y from, x to, y to) */
describe('which groups are packed and which ride along', () => {
  beforeEach(() => {
    cam().close();
    useJob.getState().unload();
    useFlip.getState().cancel();
    useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  });

  it('has nothing to pack for nothing selected, and for a selection with nothing in sight', () => {
    cam().add([rectangle(0, 0, 10, 10)]);
    expect(plan(null)).toBeNull();
    cam().setHidden(items()[0]!.id, true);
    expect(plan('all')).toBeNull();
    // (a group that is hidden is selected only by tick in the list: nothing of it is packed)
    expect(plan(items()[0]!.group)).toBeNull();
  });

  it('packs every selected group, and carries what lies in the box of a larger one with it', () => {
    // A 100 × 60 at 500, a hole in it, a dot in the hole's box (inside A too), B 50 × 50 apart
    cam().add([rectangle(500, 500, 100, 60)]);
    cam().add([circle(520, 530, 10)]);
    cam().add([circle(560, 540, 4)]);
    cam().add([rectangle(900, 0, 50, 50)]);
    const [a, hole, dot, b] = items().map((i) => i.group) as [number, number, number, number];
    const found = plan('all')!;
    expect(found.placed).toEqual([a, b]);
    expect(found.unplaced).toEqual([]);
    expect(found.riders).toBe(2);
    // the hole and the dot go by the very map of their plate; the small plate has its own
    expect(found.moves.get(hole)).toBe(found.moves.get(a));
    expect(found.moves.get(dot)).toBe(found.moves.get(a));
    expect(found.moves.get(b)).not.toBe(found.moves.get(a));
    // A (6000) before B (2500): A at the corner of the stock – from (500, 500) by (−500, −500)
    expect(found.moves.get(a)).toMatchObject({ a: 1, b: 0, c: 0, d: 1, e: -500, f: -500 });
  });

  it('puts what is inside several boxes with the smallest of them', () => {
    // a big plate 0…200 × 0…100, a smaller one 20…80 × 20…80 inside it – and a hole in the smaller
    cam().add([rectangle(300, 300, 200, 100)]);
    cam().add([rectangle(320, 320, 60, 60)]);
    cam().add([circle(350, 350, 10)]);
    const [big, small, hole] = items().map((i) => i.group) as [number, number, number];
    // only the big and the small plate are selected: the small one is no carrier, it rides with the big one
    const found = plan([big, small])!;
    expect(found.placed).toEqual([big]);
    expect(found.riders).toBe(2);
    expect(found.moves.has(small)).toBe(true);
    expect(found.moves.has(hole)).toBe(true);
  });

  it('lets two groups with the same box be one unit – the earlier carries the later', () => {
    cam().add([rectangle(300, 300, 50, 50)]);
    cam().add([rectangle(300, 300, 50, 50)]);
    const [first, second] = items().map((i) => i.group) as [number, number];
    const found = plan('all')!;
    expect(found.placed).toEqual([first]);
    expect(found.riders).toBe(1);
    expect(found.moves.get(second)).toBe(found.moves.get(first));
  });

  it('leaves what is neither selected nor inside a packed box where it is', () => {
    cam().add([rectangle(500, 500, 100, 60)]);
    cam().add([rectangle(900, 900, 20, 20)]);
    const [a, other] = items().map((i) => i.group) as [number, number];
    const found = plan(a)!;
    expect(found.placed).toEqual([a]);
    expect(found.moves.has(other)).toBe(false);
  });

  it('takes the box of what is in sight for a group that holds hidden parts too', () => {
    // one group: a plate and – hidden – a part far out; the plate alone is the box it is packed by
    cam().add([rectangle(500, 500, 100, 60), rectangle(2000, 2000, 10, 10)]);
    cam().setHidden(items()[1]!.id, true);
    const found = plan('all')!;
    // 100 × 60 at (500, 500) goes to the corner: the hidden part moves with it (a group is rigid)
    expect(found.moves.get(items()[0]!.group)).toMatchObject({ e: -500, f: -500 });
  });

  it('moves nothing for a group that already stands where it is placed', () => {
    cam().add([rectangle(0, 0, 100, 60)]);
    const found = plan('all')!;
    expect(found.placed).toHaveLength(1);
    expect(found.moves.size).toBe(0);
  });

  it('reports what finds no place, and the share the boxes take', () => {
    cam().add([rectangle(0, 0, 100, 60)]);
    cam().add([rectangle(300, 0, 300, 300)]);
    const [a, big] = items().map((i) => i.group) as [number, number];
    const found = plan('all')!;
    expect(found.placed).toEqual([a]);
    expect(found.unplaced).toEqual([big]);
    // 100 × 60 of 200 × 100
    expect(found.used).toBeCloseTo(0.3, 12);
  });

  it('names what stays and is covered by a packed part – and not what only touches it, or rides along', () => {
    // A (60 × 40, far away) is packed to the corner (0, 0)–(60, 40) of the 200 × 100 stock
    cam().add([rectangle(500, 500, 60, 40)]);
    // beside it, touching at x = 60: not covered
    cam().add([rectangle(60, 0, 30, 40)]);
    // on it, covered – with a hole in it: both are cut through A, both are named (each is a group of its own)
    cam().add([rectangle(20, 20, 50, 50)]);
    cam().add([circle(35, 35, 10)]);
    const [a, touching, plate, hole] = items().map((i) => i.group) as [
      number,
      number,
      number,
      number,
    ];
    const found = plan(a)!;
    expect(found.placed).toEqual([a]);
    expect(found.overlapped).toEqual([plate, hole]);
    expect(found.overlapped).not.toContain(touching);
    // selected with the plate, the hole rides with it and is not named on its own; the plate is packed too
    const both = plan([a, plate])!;
    expect(both.riders).toBe(1);
    expect(both.overlapped).toEqual([]);
  });

  it('LIMIT, pinned: a staying part wholly inside the box of a packed one rides along and is not named – a plate on a plate cannot be told from a hole in a plate by boxes', () => {
    // A and B (60 × 40) are packed, far from the stock (0…200 × 0…100)
    cam().add([rectangle(500, 500, 60, 40)]);
    cam().add([rectangle(800, 500, 60, 40)]);
    // a plate that lies on A, wholly inside its box: the same to the packer as a hole in the plate – it goes with A
    cam().add([rectangle(510, 510, 40, 20)]);
    // a plate that lies on the stock and reaches across where A will stand: a part that stays, and is named
    cam().add([rectangle(20, 20, 60, 40)]);
    const [a, b, inside, across] = items().map((i) => i.group) as [number, number, number, number];
    const found = plan([a, b])!;
    expect(found.riders).toBe(1);
    expect(found.moves.has(inside)).toBe(true);
    expect(found.moves.get(inside)).toBe(found.moves.get(a));
    expect(found.overlapped).toEqual([across]);
    // (a plate that stays and lies wholly inside a packed part's box is carried with it and is never named – the card
    // says "Mitgenommen" for it; only a part that reaches out of every packed box, or lies beside it, can be named)
  });

  it('does not name a part that is not in sight', () => {
    cam().add([rectangle(500, 500, 60, 40)]);
    cam().add([rectangle(20, 20, 50, 50)]);
    const [a] = items().map((i) => i.group) as [number, number];
    cam().setHidden(items()[1]!.id, true);
    expect(plan(a)!.overlapped).toEqual([]);
  });

  it('has the default gap of the cutter and 2 mm', () => {
    expect(defaultNestGap(0)).toBe(2);
    expect(defaultNestGap(3.175)).toBeCloseTo(5.175, 12);
  });
});
