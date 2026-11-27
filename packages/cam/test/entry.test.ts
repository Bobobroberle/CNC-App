import { describe, expect, it } from 'vitest';
import {
  circle,
  HELIX_CLEARANCE,
  PROBLEM_EFFECT,
  rectangle,
  toolpaths,
  type Contour,
  type CutSettings,
  type Move,
  type Operation,
  type Problem,
} from '../src';
import { heightAt, simulate, type Stock } from './support';

/**
 * How a pocket is entered: the helix and the straight plunge. Pocket 60 × 40, a 6 mm cutter, stepover
 * 0.4: the rings of the cutter's centre run 2.4 mm apart from the wall inwards, 3, 5.4, 7.8, … 19.8 mm
 * from the edge; the innermost is a sliver 20.4 × 0.4 whose corners are (19.8, 19.8), (40.2, 19.8),
 * (40.2, 20.2) and (19.8, 20.2) – the first ring walked.
 */
const s: CutSettings = {
  toolDiameter: 6,
  depth: 6,
  stepdown: 3,
  stepover: 0.4,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 10,
  safeZ: 5,
  climb: true,
};
const pocket = rectangle(0, 0, 60, 40);
const pocketOp: Operation = { contour: 0, kind: 'pocket' };
const run = (op: Partial<Operation>, settings: CutSettings = s, contours: Contour[] = [pocket]) =>
  toolpaths(contours, [{ ...pocketOp, ...op }], settings);
const arcs = (moves: Move[]) => moves.filter((m) => m.arc);
/** The moves that go straight down at the plunge feed (z only) */
const plunges = (moves: Move[]) =>
  moves.filter((m) => m.x === undefined && m.feed === s.plungeFeed).map((m) => m.z);

describe('helix entry', () => {
  it('bores 1.5 × the cutter by default: a 9 mm hole, the cutter on a circle of radius 1.5, two turns a pass', () => {
    const { moves, problems } = run({ entry: 'helix' });
    expect(problems).toEqual([]);
    // The first ring's corner nearest to the work zero is (19.8, 19.8); the helix starts 1.5 beside it
    const head = moves.slice(0, 4).map((m) => ({ ...m, x: m.x && Math.round(m.x * 100) / 100 }));
    expect(head).toEqual([
      { z: 5, feed: null },
      { x: 21.3, y: expect.closeTo(19.8, 2), feed: null },
      { z: 1, feed: null },
      { z: 0, feed: 300 },
    ]);
    // 10° on a circle of 2π · 1.5 = 9.42 mm: 1.66 mm a turn at most, so 3 mm take two turns (1.5 each),
    // then a flat turn at the pass depth; again for the second pass (−3 → −6)
    const turns = arcs(moves.filter((m, i) => i < 40));
    expect(turns.slice(0, 6).map((m) => m.z)).toEqual([-1.5, -3, -3, -4.5, -6, -6]);
    expect(turns.slice(0, 6).every((m) => m.arc!.cw && m.arc!.i === -1.5 && m.arc!.j === 0)).toBe(
      true,
    );
    // Every turn ends where it began
    expect(new Set(turns.slice(0, 6).map((m) => `${m.x},${m.y}`)).size).toBe(1);
    // Nothing of the helix is beyond the walls: the cutter centre stays 3 mm inside, the hole 9 across
    for (const m of turns) {
      expect(Math.hypot(m.x! + m.arc!.i - 19.8, m.y! - 19.8)).toBeLessThan(0.01);
    }
  });

  it('goes to the middle and once round the ring in each pass, and ends at its start', () => {
    const { moves } = run({ entry: 'helix' });
    const first = moves.findIndex((m) => m.arc);
    // After the three arcs of the first pass: to the middle (19.8, 19.8), round the sliver, back
    const after = moves.slice(first + 3, first + 9).map((m) => [m.x, m.y, m.z, m.feed]);
    expect(after.map(([x, y]) => [Math.round(x! * 10) / 10, Math.round(y! * 10) / 10])).toEqual([
      [19.8, 19.8],
      [19.8, 20.2],
      [40.2, 20.2],
      [40.2, 19.8],
      [19.8, 19.8],
      [21.3, 19.8],
    ]);
    // Everything there is at the cutting feed, at the depth of the pass (no z in the moves)
    expect(after.slice(0, 5).every(([, , z, feed]) => z === undefined && feed === 1200)).toBe(true);
    // The next pass goes out to the helix's start again at the depth it has (through what is cleared)
    expect(after[5]![3]).toBe(1200);
  });

  it('replaces the entry of the first ring only: the same eight walks, the cutter never beyond the wall', () => {
    const helix = run({ entry: 'helix' }).moves;
    const ramp = run({}).moves;
    // Each walk of a ring drops to the surface at the plunge feed once: the helix's own is the first
    const surface = (moves: Move[]) => plunges(moves).filter((z) => z === 0).length;
    expect(surface(ramp)).toBe(8);
    expect(surface(helix)).toBe(8);
    // Where the cutter goes: the cutter's centre stays 3 mm inside the 60 × 40 pocket
    for (const m of helix.filter((q) => q.feed !== null && q.x !== undefined)) {
      expect(m.x!).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(m.x!).toBeLessThanOrEqual(57 + 1e-6);
      expect(m.y!).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(m.y!).toBeLessThanOrEqual(37 + 1e-6);
    }
    // And the program ends as the ramp's does: up to the clearance plane
    expect(helix.at(-1)).toEqual({ z: 5, feed: null });
  });

  it('turns once a pass where the ramp angle is 90, and the other way for conventional milling', () => {
    const steep = run({ entry: 'helix' }, { ...s, rampAngle: 90 });
    expect(arcs(steep.moves).map((m) => m.z)).toEqual([-3, -3, -6, -6]);
    const conventional = run({ entry: 'helix' }, { ...s, climb: false });
    expect(arcs(conventional.moves).every((m) => m.arc!.cw === false)).toBe(true);
    // A flat ramp angle is held at 0.5°, and never a pitch below 0.05 mm: 3 mm in 60 turns
    const flat = run({ entry: 'helix' }, { ...s, rampAngle: 0, stepdown: 3 });
    const flatArcs = arcs(flat.moves);
    expect(flatArcs.length).toBeGreaterThan(20);
    expect(flatArcs.at(-1)!.z).toBe(-6);
  });

  it('takes the width asked for, between the cutter + 0.5 and twice the cutter, else 1.5 × the cutter', () => {
    const radius = (op: Partial<Operation>, settings = s) =>
      Math.abs(arcs(run(op, settings).moves)[0]!.arc!.i);
    // The cutter's path is the hole minus the cutter, halved: 8 → 1; 12 → 3 (the cutter's own radius)
    expect(radius({ entry: 'helix', helixDiameter: 8 })).toBe(1);
    expect(radius({ entry: 'helix', helixDiameter: 12 })).toBe(3);
    // More than twice the cutter would leave a post in the middle: held at 12
    expect(radius({ entry: 'helix', helixDiameter: 15 })).toBe(3);
    // Below the cutter + 0.5 (6.5): held there, the cutter's path radius 0.25
    expect(HELIX_CLEARANCE).toBe(0.5);
    expect(radius({ entry: 'helix', helixDiameter: 6.2 })).toBe(0.25);
    expect(radius({ entry: 'helix', helixDiameter: 1 })).toBe(0.25);
    for (const wrong of [0, -4, Number.NaN, Infinity]) {
      expect(radius({ entry: 'helix', helixDiameter: wrong })).toBe(1.5);
    }
    expect(radius({ entry: 'helix' })).toBe(1.5);
    // A cutter finer than the clearance: 0.4 → 0.9 wide (path radius 0.25), not the 0.8 twice would be
    expect(radius({ entry: 'helix' }, { ...s, toolDiameter: 0.4 })).toBe(0.25);
  });

  it('falls back to the ramp and says so where the hole does not fit', () => {
    const ramp = run({}, s, [rectangle(0, 0, 12, 12)]);
    // 12 × 12: a 12 mm hole is the pocket itself
    const wide = run({ entry: 'helix', helixDiameter: 12 }, s, [rectangle(0, 0, 12, 12)]);
    expect(wide.problems).toEqual([{ contour: 0, code: 'helix-too-big' }]);
    expect(JSON.stringify(wide.moves)).toBe(JSON.stringify(ramp.moves));
    // 8 × 30: the 9 mm hole of the default is wider than the pocket – and the cutter's rings end after one
    const slot = [rectangle(0, 0, 8, 30)];
    const narrow = run({ entry: 'helix' }, s, slot);
    expect(narrow.problems).toEqual([{ contour: 0, code: 'helix-too-big' }]);
    expect(JSON.stringify(narrow.moves)).toBe(JSON.stringify(run({}, s, slot).moves));
    // The same hole fits in 12 × 12 with the width at its default (9 < 12)
    expect(run({ entry: 'helix' }, s, [rectangle(0, 0, 12, 12)]).problems).toEqual([]);
  });

  it('keeps the finishing allowance: a hole that fits without it does not with it', () => {
    // 16 × 16: rings 3, 5.4, 7.8 from the edge; the widest hole, 12, needs 6.05 from the edge – the sliver at 7.8 has it
    const square = [rectangle(0, 0, 16, 16)];
    const fits = run({ entry: 'helix', helixDiameter: 12 }, s, square);
    expect(fits.problems).toEqual([]);
    expect(arcs(fits.moves)[0]!.arc!.i).toBe(-3);
    // With 1 mm left on the wall the rings are 4 and 6.4 from the edge and the hole needs 1 + 6 + 0.05
    const left = run({ entry: 'helix', helixDiameter: 12 }, { ...s, allowance: 1 }, square);
    expect(left.problems).toEqual([{ contour: 0, code: 'helix-too-big' }]);
    expect(arcs(left.moves)).toEqual([]);
    // A smaller hole fits with the allowance, too: 9 needs 1 + 4.5 + 0.05 = 5.55, the ring at 6.4 has it
    const small = run({ entry: 'helix', helixDiameter: 9 }, { ...s, allowance: 1 }, square);
    expect(small.problems).toEqual([]);
    expect(arcs(small.moves).length).toBeGreaterThan(0);
  });

  it('keeps the hole off the islands of the pocket', () => {
    // A round island (radius 5) in the middle: the clearing falls into two areas, left and right of it.
    // The hole is made at a corner of the first area walked – wherever Clipper starts – and never reaches the island
    const island = circle(30, 20, 10);
    const helix = toolpaths([pocket, island], [{ ...pocketOp, entry: 'helix' }], s);
    expect(helix.problems).toEqual([]);
    const turns = arcs(helix.moves);
    expect(turns.length).toBeGreaterThan(0);
    const centres = new Set(
      turns.map((m) => `${Math.round((m.x! + m.arc!.i) * 10)},${Math.round(m.y! * 10)}`),
    );
    expect(centres.size).toBe(1);
    for (const m of turns) {
      const c = { x: m.x! + m.arc!.i, y: m.y! + m.arc!.j };
      // The hole, 4.5 round the centre, lies in the pocket and clear of the island
      expect(c.x - 4.5).toBeGreaterThan(0);
      expect(c.x + 4.5).toBeLessThan(60);
      expect(c.y - 4.5).toBeGreaterThan(0);
      expect(c.y + 4.5).toBeLessThan(40);
      expect(Math.hypot(c.x - 30, c.y - 20)).toBeGreaterThan(5 + 4.5);
    }
    // An island that leaves corners only: the rings end at the wall's, nothing for a 9 mm hole – the ramp it is
    const ring = [rectangle(0, 0, 40, 40), circle(20, 20, 34)];
    const none = toolpaths(ring, [{ contour: 0, kind: 'pocket', entry: 'helix' }], s);
    expect(none.problems).toEqual([{ contour: 0, code: 'helix-too-big' }]);
    expect(JSON.stringify(none.moves)).toBe(
      JSON.stringify(toolpaths(ring, [{ contour: 0, kind: 'pocket' }], s).moves),
    );
  });

  it('enters only a pocket: other kinds ignore it, and "ramp" is the default', () => {
    const part = rectangle(0, 0, 60, 40);
    for (const kind of ['outside', 'inside', 'on'] as const) {
      const asked = toolpaths([part], [{ contour: 0, kind, entry: 'helix', helixDiameter: 9 }], s);
      const plain = toolpaths([part], [{ contour: 0, kind }], s);
      expect(asked.problems).toEqual([]);
      expect(JSON.stringify(asked.moves)).toBe(JSON.stringify(plain.moves));
    }
    expect(JSON.stringify(run({ entry: 'ramp' }).moves)).toBe(JSON.stringify(run({}).moves));
    expect(JSON.stringify(run({ entry: undefined }).moves)).toBe(JSON.stringify(run({}).moves));
    // A value that is none of the three is the ramp
    expect(JSON.stringify(run({ entry: 'screw' as unknown as 'helix' }).moves)).toBe(
      JSON.stringify(run({}).moves),
    );
  });
});

describe('plunge entry', () => {
  it('goes straight down at the start of the first ring and ramps the others', () => {
    const ramp = run({}).moves;
    const plunge = run({ entry: 'plunge' }).moves;
    // The ring walks start with a drop to the surface at the plunge feed (the ramp does the rest); with
    // 'plunge' the first ring drops to −3, and to −6 at the start of its second pass
    expect(plunges(ramp)).toEqual(Array(8).fill(0));
    expect(plunges(plunge).slice(0, 2)).toEqual([-3, -6]);
    // Seven other rings (and the wall) begin at 0 as before
    const surface = (moves: Move[]) => plunges(moves).filter((z) => z === 0).length;
    expect(surface(ramp)).toBe(8);
    expect(surface(plunge)).toBe(7);
    // Both end at the same place
    expect(plunge.at(-1)).toEqual(ramp.at(-1));
  });

  it('is the same where the job plunges already', () => {
    const steep = { ...s, rampAngle: 90 };
    expect(JSON.stringify(run({ entry: 'plunge' }, steep).moves)).toBe(
      JSON.stringify(run({}, steep).moves),
    );
  });

  it('plunges the wall when there is no ring inside it', () => {
    // 8 × 30: the cutter's centre has one ring, the wall
    const slot = [rectangle(0, 0, 8, 30)];
    const ramp = run({}, s, slot).moves;
    const plunge = run({ entry: 'plunge' }, s, slot).moves;
    expect(plunges(ramp)).toEqual([0]);
    expect(plunges(plunge)).toEqual([-3, -6]);
  });
});

describe('what the entries cut (a stock of cells, a cutter of 6 mm)', () => {
  const area = { minX: -5, minY: -5, maxX: 65, maxY: 45 };
  const island = circle(30, 20, 10);
  /** The cells a program changed, against the ramp's: only the rim of the pocket, a step across, may differ */
  const differences = (a: Stock, b: Stock) => {
    let n = 0;
    for (let j = 0; j < a.ny; j++) {
      for (let i = 0; i < a.nx; i++) {
        const x = a.x0 + i * a.res;
        const y = a.y0 + j * a.res;
        if (x < 0.75 || x > 59.25 || y < 0.75 || y > 39.25) continue;
        if (Math.abs(a.height[j * a.nx + i]! - b.height[j * a.nx + i]!) > 1e-6) n++;
      }
    }
    return n;
  };
  const untouchedOutside = (stock: Stock) => {
    for (let j = 0; j < stock.ny; j++) {
      for (let i = 0; i < stock.nx; i++) {
        const x = stock.x0 + i * stock.res;
        const y = stock.y0 + j * stock.res;
        if (x <= -0.25 || x >= 60.25 || y <= -0.25 || y >= 40.25) {
          expect(stock.height[j * stock.nx + i]).toBe(0);
        }
      }
    }
  };

  it('a helix clears what the ramp clears, nowhere beyond the walls, never takes more than a step at once', () => {
    const reference = simulate(run({}).moves, 6, area);
    expect(reference.thickest).toBeLessThanOrEqual(3 + 1e-6);
    // The pocket is cut to −6 in the middle and the corners the cutter cannot reach stay
    expect(heightAt(reference, 30, 20)).toBe(-6);
    expect(heightAt(reference, 0.25, 0.25)).toBe(0);
    for (const width of [undefined, 12, 7]) {
      const helix = simulate(run({ entry: 'helix', helixDiameter: width }).moves, 6, area);
      expect(helix.collisions).toEqual([]);
      expect(helix.outside).toBe(0);
      expect(helix.thickest).toBeLessThanOrEqual(3 + 1e-6);
      untouchedOutside(helix);
      expect(differences(helix, reference)).toBe(0);
    }
  });

  it('the same round an island, and for a conventional cut', () => {
    const asked = (op: Partial<Operation>, settings = s) =>
      toolpaths([pocket, island], [{ ...pocketOp, ...op }], settings).moves;
    for (const settings of [s, { ...s, climb: false }]) {
      const reference = simulate(asked({}, settings), 6, area);
      const helix = simulate(asked({ entry: 'helix' }, settings), 6, area);
      expect(helix.collisions).toEqual([]);
      expect(helix.thickest).toBeLessThanOrEqual(3 + 1e-6);
      untouchedOutside(helix);
      expect(differences(helix, reference)).toBe(0);
      // The island stands: its middle is at the surface
      expect(heightAt(helix, 30, 20)).toBe(0);
    }
  });

  it('a plunge takes a step at once at most, and does not leave anything either', () => {
    const reference = simulate(run({}).moves, 6, area);
    const plunge = simulate(run({ entry: 'plunge' }).moves, 6, area);
    expect(plunge.collisions).toEqual([]);
    expect(plunge.thickest).toBeLessThanOrEqual(3 + 1e-6);
    untouchedOutside(plunge);
    expect(differences(plunge, reference)).toBe(0);
  });

  it('the stock sees what is wrong: a rapid into material, a plunge too deep for the step', () => {
    const buried = simulate(
      [
        { x: 10, y: 10, feed: null },
        { z: -2, feed: null },
      ],
      6,
      area,
    );
    expect(buried.collisions.length).toBeGreaterThan(0);
    // A plunge goes down a little at a time; the sideways move at the bottom is what meets the material
    const deep = simulate(
      [
        { x: 10, y: 10, feed: null },
        { z: -6, feed: 300 },
        { x: 20, y: 10, feed: 1200 },
      ],
      6,
      area,
    );
    expect(deep.thickest).toBeCloseTo(6, 9);
    const out = simulate(
      [
        { x: -4, y: 10, feed: null },
        { z: -1, feed: 300 },
      ],
      6,
      { ...area, minX: 0 },
    );
    expect(out.outside).toBeGreaterThan(0);
  });
});

describe('what each problem means for the contour it names', () => {
  it('says "not cut" where nothing of the contour is cut and "cut differently" where it is, for every code', () => {
    const open: Contour = {
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
    };
    const frame = rectangle(0, 0, 100, 100);
    // Each case: the contours, the operations, the contour the problem names – and the code it must be
    const cases: [Contour[], Operation[], number, Problem['code']][] = [
      [[rectangle(0, 0, 4, 4)], [{ contour: 0, kind: 'inside' }], 0, 'tool-too-large'],
      [[open], [{ contour: 0, kind: 'outside' }], 0, 'open-contour'],
      [[circle(0, 0, 4)], [{ contour: 0, kind: 'drill' }], 0, 'hole-too-small'],
      // A pocket of 12 × 12 and a hole of 12: the hole is the pocket itself
      [
        [rectangle(0, 0, 12, 12)],
        [{ ...pocketOp, entry: 'helix', helixDiameter: 12 }],
        0,
        'helix-too-big',
      ],
      [[circle(0, 0, 20)], [{ contour: 0, kind: 'on', peck: 2 }], 0, 'peck-not-possible'],
      // The frame wanted first, the part inside it second: the part goes first and the frame is overridden
      [
        [frame, rectangle(10, 10, 20, 20)],
        [
          { contour: 0, kind: 'outside', seq: 1 },
          { contour: 1, kind: 'outside', seq: 2 },
        ],
        0,
        'order-overridden',
      ],
    ];
    const seen = new Set<string>();
    for (const [contours, operations, named, code] of cases) {
      const r = toolpaths(contours, operations, s);
      const problem = r.problems.find((q) => q.code === code)!;
      expect(problem, code).toEqual({ contour: named, code });
      // The span of the operation that cuts the contour: empty where nothing is cut
      const span = r.cuts.find((c) => operations[c.op]!.contour === problem.contour)!;
      expect(span.end > span.start, code).toBe(PROBLEM_EFFECT[code] === 'cut-differently');
      seen.add(code);
    }
    // No code without a case, and none in the table that is not a code
    expect([...seen].sort()).toEqual(Object.keys(PROBLEM_EFFECT).sort());
    expect(PROBLEM_EFFECT).toEqual({
      'tool-too-large': 'not-cut',
      'open-contour': 'not-cut',
      'hole-too-small': 'not-cut',
      'helix-too-big': 'cut-differently',
      'peck-not-possible': 'cut-differently',
      'order-overridden': 'cut-differently',
    });
  });
});
