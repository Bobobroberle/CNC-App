import { describe, expect, it } from 'vitest';
import {
  alignRegistration,
  checkRegistrationHole,
  checkSides,
  circle,
  clearOfBoxes,
  compose,
  cutFootprint,
  distanceToPath,
  flipContours,
  flipFor,
  flipMatrix,
  flippedOnTable,
  flippedRegistration,
  flipPoint,
  IDENTITY,
  onStock,
  polygonsArea,
  poseOf,
  proposeRegistration,
  rectangle,
  registrationDepth,
  registrationDiameter,
  registrationLayout,
  rotation,
  signedArea,
  tabPoints,
  tabSites,
  toolpaths,
  translation,
  type Contour,
  type CutSettings,
  type Move,
  type Point,
  type SidedCut,
} from '../src';

const s: CutSettings = {
  toolDiameter: 6,
  depth: 6,
  stepdown: 6,
  stepover: 0.4,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 90,
  safeZ: 5,
  climb: true,
};

const near = (p: Point, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 9);
  expect(p.y).toBeCloseTo(y, 9);
};

/** The XY places the cutter goes through while cutting, in order. */
const cutPath = (moves: Move[]): Point[] =>
  moves
    .filter((m) => m.feed !== null && m.x !== undefined && m.y !== undefined)
    .map((m) => ({ x: m.x!, y: m.y! }));

/** An L: 100 wide, 60 high, with the upper right 60 × 30 missing. Nothing about it is symmetric. */
const L: Contour = {
  closed: true,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 30 },
    { x: 40, y: 30 },
    { x: 40, y: 60 },
    { x: 0, y: 60 },
  ],
};

describe('turning a part over', () => {
  it('mirrors a point about the flip line and brings it back on the second turn', () => {
    // Like a page of a book around x = 100: 70 left of the line becomes 70 right of it.
    near(flipPoint({ axis: 'x', at: 100 }, { x: 30, y: 40 }), 170, 40);
    // Over the front edge around y = 50: 10 before the line becomes 10 behind it.
    near(flipPoint({ axis: 'y', at: 50 }, { x: 30, y: 40 }), 30, 60);
    for (const flip of [
      { axis: 'x', at: 12.5 },
      { axis: 'y', at: -7 },
    ] as const) {
      const once = flipPoint(flip, { x: 3, y: 4 });
      near(flipPoint(flip, once), 3, 4);
    }
    expect(flipMatrix({ axis: 'x', at: 100 })).toEqual({ a: -1, b: 0, c: 0, d: 1, e: 200, f: 0 });
  });

  it('mirrors the back-side geometry, circles staying circles', () => {
    const [l, hole] = flipContours([L, circle(20, 45, 8)], { axis: 'x', at: 50 });
    expect(l!.points).toEqual([
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 30 },
      { x: 60, y: 30 },
      { x: 60, y: 60 },
      { x: 100, y: 60 },
    ]);
    expect(hole!.circle).toEqual({ cx: 80, cy: 45, r: 4 });
    const [over] = flipContours([circle(20, 45, 8)], { axis: 'y', at: 30 });
    expect(over!.circle).toEqual({ cx: 20, cy: 15, r: 4 });
  });

  it('puts the flip line through the middle between the registration holes', () => {
    const holes = { a: { x: -12, y: 40 }, b: { x: 212, y: 44 } };
    expect(flipFor('x', holes)).toEqual({ axis: 'x', at: 100 });
    expect(flipFor('y', holes)).toEqual({ axis: 'y', at: 42 });
  });

  it('tells how the holes lie to the flip line', () => {
    const level = { a: { x: -12, y: 40 }, b: { x: 212, y: 40 } };
    const upright = { a: { x: 100, y: -12 }, b: { x: 100, y: 92 } };
    const askew = { a: { x: 0, y: 0 }, b: { x: 100, y: 30 } };
    expect(registrationLayout('x', level)).toBe('across');
    expect(registrationLayout('x', upright)).toBe('along');
    expect(registrationLayout('y', level)).toBe('along');
    expect(registrationLayout('y', upright)).toBe('across');
    expect(registrationLayout('x', askew)).toBe('askew');
    expect(registrationLayout('y', askew)).toBe('askew');
    // A hair off is still level.
    expect(registrationLayout('x', { a: level.a, b: { x: 212, y: 40.005 } })).toBe('across');
  });

  it('holes across the line swap places, holes on it stay', () => {
    const level = { a: { x: -12, y: 40 }, b: { x: 212, y: 40 } };
    const turned = flippedRegistration(flipFor('x', level), level);
    near(turned.a, 212, 40);
    near(turned.b, -12, 40);
    const upright = { a: { x: 100, y: -12 }, b: { x: 100, y: 92 } };
    const kept = flippedRegistration(flipFor('x', upright), upright);
    near(kept.a, 100, -12);
    near(kept.b, 100, 92);
    // Over the front edge it is the other way round.
    const over = flippedRegistration(flipFor('y', upright), upright);
    near(over.a, 100, 92);
    near(over.b, 100, -12);
  });

  it('knows where the holes of a turned part lie on the table', () => {
    // Holes left and right of a 200 mm part, the work zero at 500/300 on the table.
    const holes = { a: { x: -15, y: 40 }, b: { x: 215, y: 40 } };
    const flip = flipFor('x', holes);
    const zero = { x: 500, y: 300 };
    // Turned on the spot, hole 1 lies where hole 2 was drilled.
    const on = flippedOnTable(flip, holes, zero, IDENTITY);
    near(on.a, 715, 340);
    near(on.b, 485, 340);
    // A front that had been turned by 90° about its zero drilled −15/40 at −40/−15; the flip
    // line turned with it, and hole 1 (215/40 in the back program) now lies at −40/215.
    const turned = flippedOnTable(flip, holes, zero, rotation(90));
    near(turned.a, 460, 515);
    near(turned.b, 460, 285);
    // … and shifted by 3/−4 on top.
    const shifted = flippedOnTable(flip, holes, zero, compose(translation(3, -4), rotation(90)));
    near(shifted.a, 463, 511);
    expect(poseOf(rotation(90)).rotation).toBeCloseTo(90, 9);
    expect(poseOf({ ...IDENTITY, e: 3, f: -4 })).toEqual({ rotation: 0, offset: { x: 3, y: -4 } });
  });

  it('brings a moved hole in line with the other one', () => {
    const other = { x: 200, y: 40 };
    // Nearly level: level.
    expect(alignRegistration({ x: -10, y: 47 }, other)).toEqual({ x: -10, y: 40 });
    // Nearly above: straight above.
    expect(alignRegistration({ x: 195, y: 140 }, other)).toEqual({ x: 200, y: 140 });
  });

  it('proposes holes beside the part, far apart, where the stock has room', () => {
    const part = { minX: 0, minY: 0, maxX: 200, maxY: 80 };
    expect(proposeRegistration(part, 'x', 15)).toEqual({
      a: { x: -15, y: 40 },
      b: { x: 215, y: 40 },
    });
    expect(proposeRegistration(part, 'y', 15)).toEqual({
      a: { x: 100, y: -15 },
      b: { x: 100, y: 95 },
    });
    // No room left and right, but in front and behind: on the flip line.
    const on = (box: { minX: number; minY: number; maxX: number; maxY: number }) => {
      return (h: { a: Point; b: Point }) => onStock(h.a, 3, box) && onStock(h.b, 3, box);
    };
    const narrow = { minX: -10, minY: -40, maxX: 210, maxY: 120 };
    expect(proposeRegistration(part, 'x', 15, on(narrow))).toEqual({
      a: { x: 100, y: -15 },
      b: { x: 100, y: 95 },
    });
    // Room where they are wanted, or nowhere: across the line.
    const wide = { minX: -40, minY: -5, maxX: 240, maxY: 85 };
    const tight = { minX: -5, minY: -5, maxX: 205, maxY: 85 };
    for (const stock of [wide, tight]) {
      expect(proposeRegistration(part, 'x', 15, on(stock)).a).toEqual({ x: -15, y: 40 });
    }
    // Each edge of the stock counts, with the rim of the hole.
    expect(onStock({ x: 0, y: 0 }, 3, { minX: -3, minY: -3, maxX: 3, maxY: 3 })).toBe(true);
    for (const box of [
      { minX: -2.9, minY: -3, maxX: 3, maxY: 3 },
      { minX: -3, minY: -2.9, maxX: 3, maxY: 3 },
      { minX: -3, minY: -3, maxX: 2.9, maxY: 3 },
      { minX: -3, minY: -3, maxX: 3, maxY: 2.9 },
    ]) {
      expect(onStock({ x: 0, y: 0 }, 3, box)).toBe(false);
    }
  });

  it('keeps holes off the clamps', () => {
    const clamp = { minX: 100, minY: 20, maxX: 140, maxY: 50 };
    // Beside it on every side, the rim just touching: clear.
    for (const hole of [
      { x: 96, y: 35 },
      { x: 144, y: 35 },
      { x: 120, y: 16 },
      { x: 120, y: 54 },
    ]) {
      expect(clearOfBoxes(hole, 4, [clamp])).toBe(true);
    }
    // On it, or with the rim over its edge.
    expect(clearOfBoxes({ x: 120, y: 35 }, 4, [clamp])).toBe(false);
    expect(clearOfBoxes({ x: 97, y: 35 }, 4, [clamp])).toBe(false);
    expect(clearOfBoxes({ x: 97, y: 35 }, 4, [])).toBe(true);
    // A clamp where the right hole would go sends both to the ends of the flip line.
    const part = { minX: 0, minY: 0, maxX: 200, maxY: 80 };
    const inTheWay = { minX: 205, minY: 20, maxX: 245, maxY: 60 };
    const clear = (h: { a: Point; b: Point }) =>
      clearOfBoxes(h.a, 4, [inTheWay]) && clearOfBoxes(h.b, 4, [inTheWay]);
    expect(proposeRegistration(part, 'x', 15, clear)).toEqual({
      a: { x: 100, y: -15 },
      b: { x: 100, y: 95 },
    });
  });

  it('drills the holes for dowel pins the cutter can make', () => {
    expect(registrationDiameter(6)).toBe(6);
    expect(registrationDiameter(5.98)).toBe(6);
    expect(registrationDiameter(3.175)).toBe(6);
    expect(registrationDiameter(6.35)).toBe(8);
    expect(registrationDiameter(8)).toBe(8);
    expect(registrationDiameter(12)).toBe(12);
    expect(registrationDiameter(16)).toBe(16);
    // Through 12 mm for the camera, 6 mm into the spoilboard for pins.
    expect(registrationDepth(12, 'camera')).toBe(12.5);
    expect(registrationDepth(12, 'pins')).toBe(18);
  });
});

describe('cutting the mirrored side', () => {
  const loopArea = (contour: Contour, kind: 'outside' | 'inside', climb: boolean) => {
    const { moves } = toolpaths([contour], [{ contour: 0, kind }], { ...s, climb });
    return signedArea(cutPath(moves));
  };

  it('keeps climb and conventional milling as chosen', () => {
    const back = flipContours([L], { axis: 'x', at: 50 })[0]!;
    // The mirror image runs the other way round as drawn …
    expect(Math.sign(signedArea(L.points))).toBe(1);
    expect(Math.sign(signedArea(back.points))).toBe(-1);
    // … but the cutter goes round both the same way: outside counter-clockwise for climb,
    // clockwise for conventional, and the reverse inside.
    for (const contour of [L, back]) {
      expect(loopArea(contour, 'outside', true)).toBeGreaterThan(0);
      expect(loopArea(contour, 'outside', false)).toBeLessThan(0);
      expect(loopArea(contour, 'inside', true)).toBeLessThan(0);
      expect(loopArea(contour, 'inside', false)).toBeGreaterThan(0);
    }
    // Pockets and helix-bored holes too.
    const ring = (contour: Contour, climb: boolean) => {
      const { moves } = toolpaths([contour], [{ contour: 0, kind: 'pocket' }], { ...s, climb });
      return Math.sign(signedArea(cutPath(moves).slice(-8)));
    };
    const plate = rectangle(0, 0, 40, 30);
    const plateBack = flipContours([plate], { axis: 'y', at: 100 })[0]!;
    expect(ring(plateBack, true)).toBe(ring(plate, true));
    expect(ring(plateBack, false)).toBe(-ring(plate, true));
    const bore = (contour: Contour) =>
      toolpaths([contour], [{ contour: 0, kind: 'drill' }], s).moves.find((m) => m.arc)!.arc!.cw;
    const hole = circle(20, 20, 20);
    expect(bore(flipContours([hole], { axis: 'x', at: 50 })[0]!)).toBe(bore(hole));
  });

  it('the cut itself is the mirror image: the same places of the part', () => {
    const flip = { axis: 'x', at: 50 } as const;
    const back = flipContours([L], flip)[0]!;
    const front = cutPath(toolpaths([L], [{ contour: 0, kind: 'outside' }], s).moves);
    const mirrored = cutPath(toolpaths([back], [{ contour: 0, kind: 'outside' }], s).moves);
    // Every place the cutter visits on the back is the mirror of a place on the front's path.
    for (const p of mirrored) {
      expect(distanceToPath(flipPoint(flip, p), front, true)).toBeLessThan(0.03);
    }
    // The inside corner of the L (40/30 as drawn) is at 60/30 on the turned part.
    const corner = (path: Point[], x: number) =>
      path.some((p) => Math.hypot(p.x - x, p.y - 33) < 3.01 && Math.abs(p.y - 33) < 0.02);
    expect(corner(front, 40)).toBe(true);
    expect(corner(mirrored, 60)).toBe(true);
    expect(corner(mirrored, 40)).toBe(false);
  });

  it('tabs stand at the same places of the part', () => {
    const plate = rectangle(0, 0, 100, 60);
    // Along 320 mm of outline from 0/0: at 40, 120, 200 and 280 mm.
    expect(tabPoints(plate.points, 4)).toEqual([
      { x: 40, y: 0 },
      { x: 100, y: 20 },
      { x: 60, y: 60 },
      { x: 0, y: 40 },
    ]);
    const flip = { axis: 'x', at: 50 } as const;
    const back = flipContours([plate], flip)[0]!;
    expect(tabPoints(back.points, 4)).toEqual([
      { x: 60, y: 0 },
      { x: 0, y: 20 },
      { x: 40, y: 60 },
      { x: 100, y: 40 },
    ]);
    // And the cutter lifts there: over the tab at 60/0 it is up, beside it down.
    const tabs = { count: 4, width: 6, height: 2 };
    const { moves } = toolpaths([back], [{ contour: 0, kind: 'outside', tabs }], s);
    // Along the front edge (y = −3 for the cutter's centre) it is up only over the tab:
    // 6 mm of tab and half the cutter to either side of x = 60.
    let at = { x: 0, y: 0, z: 0 };
    const front: { from: number; to: number; z: number }[] = [];
    for (const m of moves) {
      const next = { x: m.x ?? at.x, y: m.y ?? at.y, z: m.z ?? at.z };
      if (m.feed !== null && Math.abs(at.y + 3) < 0.01 && Math.abs(next.y + 3) < 0.01) {
        if (next.x !== at.x) front.push({ from: at.x, to: next.x, z: next.z });
      }
      at = next;
    }
    const up = front.filter((f) => f.z === -4);
    expect(up).toHaveLength(1);
    expect(Math.min(up[0]!.from, up[0]!.to)).toBeCloseTo(54, 6);
    expect(Math.max(up[0]!.from, up[0]!.to)).toBeCloseTo(66, 6);
    expect(front.filter((f) => f.z === -6).length).toBeGreaterThan(0);
  });

  it('tabs put by hand stand at the same places of the part on the back, mirrored', () => {
    const plate = rectangle(0, 0, 100, 60);
    // 0.1 and 0.6 of the 320 mm: 32 along the lower side, and 192 along – 32 along the upper side
    // from its right end (the way runs 100 below, 60 right, 100 above, 60 left).
    const at = [0.1, 0.6];
    const placed = (c: Contour) =>
      tabSites(c, { count: 4, at }).map((t) => [t.u, Math.round(t.point.x * 1e6) / 1e6, t.point.y]);
    expect(placed(plate)).toEqual([
      [0.1, 32, 0],
      [0.6, 68, 60],
    ]);
    const flip = { axis: 'x', at: 50 } as const;
    const back = flipContours([plate], flip)[0]!;
    // The same fractions, the mirror image of the same places: x ↦ 100 − x.
    expect(placed(back)).toEqual([
      [0.1, 68, 0],
      [0.6, 32, 60],
    ]);
    // And the cutter on the back lifts there: along the lower side (3 below the line) it is up
    // only over 68 – 6 mm of tab and the cutter's width, from 62 to 74 – and down beyond.
    const tabs = { count: 4, width: 6, height: 2, at };
    const { moves } = toolpaths([back], [{ contour: 0, kind: 'outside', tabs }], s);
    let now = { x: 0, y: 0, z: 0 };
    const lower: { from: number; to: number; z: number }[] = [];
    for (const m of moves) {
      const next = { x: m.x ?? now.x, y: m.y ?? now.y, z: m.z ?? now.z };
      if (m.feed !== null && Math.abs(now.y + 3) < 0.01 && Math.abs(next.y + 3) < 0.01) {
        if (next.x !== now.x) lower.push({ from: now.x, to: next.x, z: next.z });
      }
      now = next;
    }
    const up = lower.filter((f) => f.z === -4);
    expect(up).toHaveLength(1);
    expect(Math.min(up[0]!.from, up[0]!.to)).toBeCloseTo(62, 6);
    expect(Math.max(up[0]!.from, up[0]!.to)).toBeCloseTo(74, 6);
    expect(lower.filter((f) => f.z === -6).length).toBeGreaterThan(0);
  });
});

describe('what the two sides do to each other', () => {
  const area = (kind: Parameters<typeof cutFootprint>[0], contours: Contour[], tool = 6) =>
    polygonsArea(cutFootprint(kind, contours, tool));
  const plate = rectangle(0, 0, 40, 30);
  const line: Contour = {
    closed: false,
    points: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ],
  };

  it('knows what each kind of cut takes away', () => {
    // A pocket takes its area.
    expect(area('pocket', [plate])).toBeCloseTo(1200, 3);
    // A hole its circle, at least as large as the cutter.
    expect(area('drill', [circle(10, 10, 10)])).toBeCloseTo(Math.PI * 25, 0);
    expect(area('drill', [circle(10, 10, 4)])).toBeCloseTo(Math.PI * 9, 0);
    // A cut-out the band inside the line: 40 × 30 less 28 × 18.
    expect(area('inside', [plate])).toBeCloseTo(1200 - 28 * 18, 1);
    // An outline the band outside it: 140 mm of line 6 wide, plus four quarter circles of r = 6.
    expect(area('outside', [plate])).toBeCloseTo(140 * 6 + Math.PI * 36, 0);
    // Engraving on the line: 3 mm to either side.
    expect(area('on', [plate])).toBeCloseTo(140 * 3 + Math.PI * 9 + (1200 - 34 * 24), 0);
    expect(area('on', [line])).toBeCloseTo(50 * 6 + Math.PI * 9, 0);
    // What cannot be cut takes nothing.
    expect(cutFootprint('none', [plate], 6)).toEqual([]);
    expect(cutFootprint('outside', [line], 6)).toEqual([]);
    expect(cutFootprint('drill', [plate], 6)).toEqual([]);
    expect(cutFootprint('pocket', [{ closed: true, points: [{ x: 1, y: 1 }] }], 6)).toEqual([]);
    // Several contours are one area: two pockets sharing 20 × 30.
    expect(area('pocket', [plate, rectangle(20, 0, 40, 30)])).toBeCloseTo(1800, 3);
  });

  const cut = (
    row: number,
    side: 'front' | 'back',
    kind: SidedCut['kind'],
    contour: Contour,
    depth: number,
    tabs = false,
  ): SidedCut => ({ row, side, kind, contours: [contour], depth, tabs });

  it('adds the depths where front and back overlap', () => {
    const front = (depth: number) => cut(0, 'front', 'pocket', plate, depth);
    const back = (depth: number) => cut(1, 'back', 'pocket', rectangle(30, 10, 40, 30), depth);
    // 8 + 6 in 12 mm: 2 mm too much.
    expect(checkSides([front(8), back(6)], 12, 6)).toEqual([
      { code: 'through', front: 0, back: 1, left: -2 },
    ]);
    // 6 + 5.5: half a millimetre stays.
    expect(checkSides([front(6), back(5.5)], 12, 6)).toEqual([
      { code: 'thin', front: 0, back: 1, left: 0.5 },
    ]);
    // 4 + 4, or 5.5 + 5.5 with a millimetre left: fine.
    expect(checkSides([front(4), back(4)], 12, 6)).toEqual([]);
    expect(checkSides([front(5.5), back(5.5)], 12, 6)).toEqual([]);
    // Beside each other, or only touching: nothing to add.
    expect(
      checkSides([front(8), cut(1, 'back', 'pocket', rectangle(60, 0, 20, 20), 8)], 12, 6),
    ).toEqual([]);
    expect(
      checkSides([front(8), cut(1, 'back', 'pocket', rectangle(39.99, 0, 20, 20), 8)], 12, 6),
    ).toEqual([]);
    // What is switched off is not there.
    expect(checkSides([front(8), cut(1, 'back', 'none', plate, 8)], 12, 6)).toEqual([]);
  });

  it('says when the two sides meet on purpose', () => {
    const hole = circle(20, 20, 10);
    // The same hole from both sides, 7 mm each in 12 mm.
    expect(
      checkSides([cut(0, 'front', 'drill', hole, 7), cut(1, 'back', 'drill', hole, 7)], 12, 6),
    ).toEqual([{ code: 'meet', front: 0, back: 1, left: -2 }]);
    // The same outline half from each side.
    expect(
      checkSides(
        [cut(0, 'front', 'outside', plate, 6, true), cut(1, 'back', 'outside', plate, 6.5, true)],
        12,
        6,
      ),
    ).toEqual([{ code: 'meet', front: 0, back: 1, left: -0.5 }]);
    // A small hole from the back into a large pocket on the front is something else.
    expect(
      checkSides([cut(0, 'front', 'pocket', plate, 7), cut(1, 'back', 'drill', hole, 7)], 12, 6),
    ).toEqual([{ code: 'through', front: 0, back: 1, left: -2 }]);
    expect(
      checkSides([cut(0, 'front', 'drill', hole, 7), cut(1, 'back', 'pocket', plate, 7)], 12, 6),
    ).toEqual([{ code: 'through', front: 0, back: 1, left: -2 }]);
  });

  it('leaves alone what goes through on its own, but not a part cut loose before the turn', () => {
    const outline = rectangle(-10, -10, 60, 50);
    // A cut-out through the front and a pocket on the back that overlaps its band.
    expect(
      checkSides(
        [cut(0, 'front', 'inside', plate, 12.5), cut(1, 'back', 'pocket', plate, 3)],
        12,
        6,
      ),
    ).toEqual([]);
    expect(
      checkSides(
        [cut(0, 'front', 'pocket', plate, 3), cut(1, 'back', 'inside', plate, 12.5)],
        12,
        6,
      ),
    ).toEqual([]);
    // The outline through on the front: with tabs the part stays, without it is loose.
    expect(checkSides([cut(0, 'front', 'outside', outline, 12.5, true)], 12, 6)).toEqual([]);
    expect(checkSides([cut(3, 'front', 'outside', outline, 12.5)], 12, 6)).toEqual([
      { code: 'loose', front: 3 },
    ]);
    // Not through, or cut free on the back as the last thing: fine.
    expect(checkSides([cut(0, 'front', 'outside', outline, 6)], 12, 6)).toEqual([]);
    expect(checkSides([cut(0, 'back', 'outside', outline, 12.5)], 12, 6)).toEqual([]);
  });

  it('checks where a registration hole lies', () => {
    const part = cut(0, 'front', 'outside', rectangle(0, 0, 200, 80), 12.5, true);
    const window = cut(1, 'back', 'inside', rectangle(60, 20, 80, 40), 12.5);
    const groove = cut(2, 'front', 'on', line, 1);
    const cuts = [part, window, groove, cut(3, 'front', 'outside', line, 3)];
    // Beside the part with room to its cut: fine, with or without the stock known.
    expect(checkRegistrationHole({ x: -15, y: 40 }, 6, cuts, 6)).toBeNull();
    const stock = { minX: -30, minY: -20, maxX: 230, maxY: 100 };
    expect(checkRegistrationHole({ x: -15, y: 40 }, 6, cuts, 6, stock)).toBeNull();
    // In the band the outline cut takes (6 mm outside the line), or closer than 2 mm to it.
    expect(checkRegistrationHole({ x: -5, y: 40 }, 6, cuts, 6)).toBe('on-cut');
    expect(checkRegistrationHole({ x: -10.5, y: 40 }, 6, cuts, 6)).toBe('on-cut');
    expect(checkRegistrationHole({ x: -11.5, y: 40 }, 6, cuts, 6)).toBeNull();
    // In the part itself.
    expect(checkRegistrationHole({ x: 30, y: 40 }, 6, cuts, 6)).toBe('in-part');
    // In the window that is cut out of it: waste, fine. The order of the cuts does not matter.
    expect(checkRegistrationHole({ x: 100, y: 40 }, 6, cuts, 6)).toBeNull();
    expect(checkRegistrationHole({ x: 100, y: 40 }, 6, [window, part], 6)).toBeNull();
    // Off the stock.
    expect(checkRegistrationHole({ x: -28, y: 40 }, 6, cuts, 6, stock)).toBe('off-stock');
  });
});
