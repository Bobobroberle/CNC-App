import { describe, expect, it } from 'vitest';
import {
  circle,
  rectangle,
  toolpaths,
  type Contour,
  type CutSettings,
  type Move,
  type Operation,
  type ToolSettings,
} from '../src';

/**
 * Where the second cutter differs from the first in exactly one value – and the operation is cut by the second.
 * `tools.test.ts` and the property test cover most of what an operation takes from its cutter; these are the places
 * where a cut that took the value from the FIRST cutter of the list instead would have gone unnoticed: the relief of
 * a pocket, a hole too small for a cutter and a hole too wide to be pecked, the direction, the allowance, the
 * stepdown and the roughing walk of a cut along a line. Each case is checked against numbers worked out by hand,
 * and against the cutter's own program: one operation of the second cutter in a list is exactly what the same
 * operation makes with that cutter alone (and is not what the first cutter makes of it).
 */
const cut = (over: Partial<CutSettings> = {}): CutSettings => ({
  toolDiameter: 6,
  depth: 6,
  stepdown: 3,
  stepover: 0.5,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 90,
  safeZ: 5,
  climb: true,
  ...over,
});
/** T1, an end mill of 6 mm, with the values everything above has */
const mill: ToolSettings = { number: 1, name: 'Mill', cut: cut() };
/** T2, a cutter of 3 mm that differs from the mill in what `over` says */
const small = (over: Partial<CutSettings> = {}): ToolSettings => ({
  number: 2,
  name: 'Small',
  cut: cut({ toolDiameter: 3, ...over }),
});

/** One operation with the second cutter of the list, its program, and the programs of the same operation with either cutter alone */
const run = (contours: Contour[], op: Omit<Operation, 'contour'>, second: ToolSettings) => {
  const listed = toolpaths(contours, [{ contour: 0, ...op, tool: 1 }], [mill, second]);
  const alone = (t: ToolSettings) => toolpaths(contours, [{ contour: 0, ...op }], t.cut);
  return { listed, second: alone(second), first: alone(mill) };
};

/** The cutting moves that go somewhere in the plane, at a depth if one is asked for */
const cutting = (moves: Move[], z?: number) =>
  moves.filter((m) => m.feed !== null && m.x !== undefined && (z === undefined || m.z === z));
/** The extent of what is cut at a depth, to a micrometre */
const extentAt = (moves: Move[], z?: number) => {
  const xs = cutting(moves, z).map((m) => m.x!);
  const ys = cutting(moves, z).map((m) => m.y!);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    minX: r(Math.min(...xs)),
    maxX: r(Math.max(...xs)),
    minY: r(Math.min(...ys)),
    maxY: r(Math.max(...ys)),
  };
};
/** Twice the area the cutting moves go round (positive: counter-clockwise, y up) */
const turning = (moves: Move[]) => {
  const p = cutting(moves);
  let sum = 0;
  p.forEach((m, i) => {
    const n = p[(i + 1) % p.length]!;
    sum += m.x! * n.y! - n.x! * m.y!;
  });
  return sum;
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;

describe('where the second cutter differs from the first, the operation takes what is the second’s', () => {
  it('gives a pocket the relief of the radius of its own cutter', () => {
    // A pocket of 30 × 20 with dogbones. The 3 mm cutter turns in each corner at 1.5 from both walls and runs on
    // along the diagonal until it reaches the corner: its centre then stands 1.5 from the corner, 1.5 / √2 = 1.061
    // along each axis. (With the 6 mm radius the corners would be looked for at 3 from the walls: no cutter turns
    // there, and no relief is cut at all.)
    const pocket = [rectangle(0, 0, 30, 20)];
    const { listed, second, first } = run(pocket, { kind: 'pocket', relief: 'dogbone' }, small());
    expect(listed.problems).toEqual([]);
    const reached = new Set(
      cutting(listed.moves).flatMap((m) =>
        [1.061, 28.939].includes(r3(m.x!)) && [1.061, 18.939].includes(r3(m.y!))
          ? [`${r3(m.x!)},${r3(m.y!)}`]
          : [],
      ),
    );
    expect([...reached].sort()).toEqual([
      '1.061,1.061',
      '1.061,18.939',
      '28.939,1.061',
      '28.939,18.939',
    ]);
    expect(listed.moves).toEqual(second.moves);
    expect(listed.moves).not.toEqual(first.moves);
  });

  it('refuses a hole for the cutter that does not fit it and drills it for the one that does', () => {
    // A hole of 3 mm drilled by the 3 mm cutter, with a peck of 1 mm: down in six steps of 1 mm (the 6 mm cutter
    // would find it too small: its radius is 3, the hole's 1.5)
    const hole = [circle(10, 10, 3)];
    const { listed, second, first } = run(hole, { kind: 'drill', peck: 1 }, small());
    expect(first.problems).toEqual([{ contour: 0, code: 'hole-too-small' }]);
    expect(listed.problems).toEqual([]);
    const plunges = listed.moves.filter((m) => m.x === undefined && m.feed === 300).map((m) => m.z);
    expect(plunges).toEqual([-1, -2, -3, -4, -5, -6]);
    expect(listed.moves).toEqual(second.moves);

    // A hole of 4 mm: too small for the 6 mm cutter, wider than the 3 mm one by 0.5 on the radius – it is bored on a
    // helix of 2 − 1.5 = 0.5 mm radius, and a helix cannot be pecked (the 6 mm radius would have drilled it straight
    // down and pecked it, without a word)
    const wider = [circle(10, 10, 4)];
    const bored = run(wider, { kind: 'drill', peck: 1 }, small());
    expect(bored.first.problems).toEqual([{ contour: 0, code: 'hole-too-small' }]);
    expect(bored.listed.problems).toEqual([{ contour: 0, code: 'peck-not-possible' }]);
    const arcs = bored.listed.moves.filter((m) => m.arc);
    expect(arcs.length).toBeGreaterThan(0);
    expect(new Set(arcs.map((m) => -m.arc!.i))).toEqual(new Set([0.5]));
    expect(bored.listed.moves).toEqual(bored.second.moves);
  });

  it('goes round in the direction of its own cutter, and the operation’s own direction beats it', () => {
    // Climb milling: counter-clockwise round the outside of a part, clockwise round the inside of a cut-out and a
    // hole. The mill climbs; the 3 mm cutter is set to cut conventionally, the other way round
    const square = [rectangle(0, 0, 20, 20)];
    const conventional = small({ climb: false });
    const outside = run(square, { kind: 'outside' }, conventional);
    expect(turning(outside.first.moves)).toBeGreaterThan(0);
    expect(turning(outside.listed.moves)).toBeLessThan(0);
    expect(outside.listed.moves).toEqual(outside.second.moves);
    const inside = run(square, { kind: 'inside' }, conventional);
    expect(turning(inside.first.moves)).toBeLessThan(0);
    expect(turning(inside.listed.moves)).toBeGreaterThan(0);
    expect(inside.listed.moves).toEqual(inside.second.moves);
    // A pocket the other way round from what the mill makes of it
    const pocket = run(square, { kind: 'pocket' }, conventional);
    expect(Math.sign(turning(pocket.listed.moves))).toBe(-Math.sign(turning(pocket.first.moves)));
    expect(pocket.listed.moves).toEqual(pocket.second.moves);
    // A bored hole: clockwise (G2) for the climbing mill, counter-clockwise (G3) for the other
    const bore = run([circle(10, 10, 5)], { kind: 'drill' }, conventional);
    expect(bore.listed.moves.filter((m) => m.arc).every((m) => m.arc!.cw === false)).toBe(true);
    expect(bore.listed.moves.filter((m) => m.arc).length).toBeGreaterThan(0);
    expect(bore.listed.moves).toEqual(bore.second.moves);
    // The operation that says its own direction keeps it, whatever the cutter is set to
    const own = run(square, { kind: 'outside', climb: true }, conventional);
    expect(turning(own.listed.moves)).toBeGreaterThan(0);
    expect(own.listed.moves).toEqual(own.second.moves);
  });

  it('leaves the allowance of its own cutter, and none where its own cutter has none', () => {
    // A 20 mm square cut round the outside in two passes of 3 mm: with an allowance of 0.3 the cutter goes round at
    // 1.5 + 0.3 = 1.8 mm out, at 3 and at 6 mm deep, and takes the last 0.3 off in one pass at the full depth at
    // 1.5 mm
    const square = [rectangle(0, 0, 20, 20)];
    const left = run(square, { kind: 'outside' }, small({ allowance: 0.3 }));
    expect(left.listed.problems).toEqual([]);
    expect(extentAt(left.listed.moves, -3)).toEqual({
      minX: -1.8,
      maxX: 21.8,
      minY: -1.8,
      maxY: 21.8,
    });
    expect(extentAt(left.listed.moves, -6)).toEqual({
      minX: -1.8,
      maxX: 21.8,
      minY: -1.8,
      maxY: 21.8,
    });
    const finishing = new Set(cutting(left.listed.moves, -6).map((m) => r3(m.x!)));
    expect(finishing.has(-1.5) && finishing.has(21.5)).toBe(true);
    expect(left.listed.moves).toEqual(left.second.moves);
    // A mill with an allowance, a 3 mm cutter without: nothing is left standing, one loop at 1.5 mm in every pass
    const heavy: ToolSettings = { ...mill, cut: cut({ allowance: 0.3 }) };
    const listed = toolpaths(square, [{ contour: 0, kind: 'outside', tool: 1 }], [heavy, small()]);
    expect(extentAt(listed.moves, -3)).toEqual({ minX: -1.5, maxX: 21.5, minY: -1.5, maxY: 21.5 });
    expect(extentAt(listed.moves, -6)).toEqual({ minX: -1.5, maxX: 21.5, minY: -1.5, maxY: 21.5 });
    expect(listed.moves).toEqual(
      toolpaths(square, [{ contour: 0, kind: 'outside' }], small().cut).moves,
    );
  });

  it('goes down in the steps of its own cutter', () => {
    // 6 mm deep: the 3 mm cutter's steps of 2 mm are 2, 4 and 6 (the mill's of 3 mm: 3 and 6), for an engraved line
    // as for a cut round a contour
    const line: Contour = {
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    };
    const engraved = run([line], { kind: 'on' }, small({ stepdown: 2 }));
    const plunges = (moves: Move[]) =>
      moves.filter((m) => m.x === undefined && m.feed === 300).map((m) => m.z);
    expect(plunges(engraved.listed.moves)).toEqual([-2, -4, -6]);
    expect(plunges(engraved.first.moves)).toEqual([-3, -6]);
    expect(engraved.listed.moves).toEqual(engraved.second.moves);
    const around = run([rectangle(0, 0, 20, 20)], { kind: 'outside' }, small({ stepdown: 2 }));
    expect([...new Set(cutting(around.listed.moves).map((m) => m.z))]).toEqual([-2, -4, -6]);
    expect(around.listed.moves).toEqual(around.second.moves);
  });

  it('cuts the roughing of a cut with tabs with the feeds, the heights and the tab width of its own cutter', () => {
    // A plate of 100 × 40 with two tabs of 4 mm on the long sides, 6 mm deep, tabs 1 mm high (5 mm below the top).
    // The 3 mm cutter leaves 0.3 mm and cuts at its own feeds (700 along, 150 down) and with its own safe height
    // (6 mm): it goes round twice, roughing and finishing, and lifts over 4 + 3 = 7 mm of each loop at each of the
    // two tabs – 28 mm in all (the 6 mm cutter's 10 mm a tab would make 20 mm of the roughing and 34 in all)
    const plate = [rectangle(0, 0, 100, 40)];
    const tabs = { count: 2, width: 4, height: 1 };
    const fine = small({ allowance: 0.3, feed: 700, plungeFeed: 150, safeZ: 6 });
    const { listed, second, first } = run(plate, { kind: 'outside', tabs }, fine);
    expect(listed.problems).toEqual([]);
    const feeds = new Set(listed.moves.flatMap((m) => (m.feed === null ? [] : [m.feed])));
    expect(feeds).toEqual(new Set([700, 150]));
    // The heights it goes up to: the safe height, and the 1 mm above the work where the plunge begins
    const lifts = new Set(
      listed.moves.filter((m) => m.x === undefined && m.feed === null).map((m) => m.z),
    );
    expect(lifts).toEqual(new Set([6, 1]));
    let x = 0;
    let y = 0;
    let z = 6;
    let along = 0;
    for (const m of listed.moves) {
      const nx = m.x ?? x;
      const ny = m.y ?? y;
      const nz = m.z ?? z;
      if (m.feed !== null && z === -5 && nz === -5) along += Math.hypot(nx - x, ny - y);
      x = nx;
      y = ny;
      z = nz;
    }
    expect(r3(along)).toBe(28);
    expect(extentAt(listed.moves, -3)).toEqual({ minX: -1.8, maxX: 101.8, minY: -1.8, maxY: 41.8 });
    expect(listed.moves).toEqual(second.moves);
    expect(listed.moves).not.toEqual(first.moves);
  });
});
