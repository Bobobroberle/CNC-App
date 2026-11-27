import { describe, expect, it } from 'vitest';
import {
  circle,
  cornerWays,
  pathLength,
  rectangle,
  tabSites,
  toGcode,
  toolpaths,
  type Contour,
  type CutSettings,
  type Move,
  type Point,
} from '../src';

/**
 * Tabs off the corners (`Tabs.avoidCorners`). Every number below was worked out by hand from the
 * rule: a tab lifts the cutter over `width + tool` mm of the line, so `reach` = half of that must lie
 * between two corners; a tab that does not moves to the nearest clear way along the line (the earlier
 * of two that are equally near), keeping its order and `width + tool` from its neighbours.
 */

const poly = (...pairs: [number, number][]): Contour => ({
  closed: true,
  points: pairs.map(([x, y]) => ({ x, y })),
});
/** Ways along the line, to nine decimals */
const r9 = (v: number) => Math.round(v * 1e9) / 1e9 + 0;
const waysOf = (
  c: Contour,
  tabs: { count: number; width?: number; avoidCorners?: boolean; at?: number[] },
  tool: number,
) => {
  const length = pathLength(c.points, true);
  return tabSites(c, tabs, tool).map((t) => r9(t.u * length));
};

// 100 × 50: the way is 0–100 below, 100–150 right, 150–250 above, 250–300 left; corners at 0, 100, 150, 250.
const plate = rectangle(0, 0, 100, 50);

describe('the corners of a contour', () => {
  it('are the vertices that turn 20° or more – the start included', () => {
    expect(cornerWays(plate)).toEqual([0, 100, 150, 250]);
    // L: 60 + 20 + 40 + 40 + 20 + 60 = 240, every vertex turns 90°
    const l = poly([0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]);
    expect(cornerWays(l)).toEqual([0, 60, 80, 120, 160, 180]);
    // The triangle turns 90°, 126.87° and 143.13°
    expect(cornerWays(poly([0, 0], [30, 0], [0, 40]))).toEqual([0, 30, 80]);
  });

  it('count the closing vertex, a point drawn twice and the start drawn again at the end as one', () => {
    // A lens: tips at 0, 0 and 100, 0 turn 168.6°, the points between turn 11.4°
    const lens = poly([0, 0], [50, -5], [100, 0], [50, 5]);
    const half = 2 * Math.hypot(50, 5);
    const ways = cornerWays(lens);
    expect(ways).toHaveLength(2);
    expect(ways[0]).toBe(0);
    expect(ways[1]).toBeCloseTo(half, 9);
    const pts = lens.points;
    expect(cornerWays({ ...lens, points: [...pts, pts[0]!] })).toEqual(ways);
    expect(
      cornerWays({ ...lens, points: [pts[0]!, pts[0]!, pts[1]!, pts[1]!, pts[2]!, pts[3]!] }),
    ).toEqual(ways);
    // Drawn from the other tip, the first vertex is the corner and the last is not
    const turned = poly([100, 0], [50, 5], [0, 0], [50, -5]);
    expect(cornerWays(turned)[0]).toBe(0);
    expect(cornerWays(turned)).toHaveLength(2);
  });

  it('tell a chord of a curve from a corner at 20°, inclusive', () => {
    const ngon = (n: number): Contour => ({
      closed: true,
      points: Array.from({ length: n }, (_, k) => ({
        x: 10 * Math.cos((2 * Math.PI * k) / n),
        y: 10 * Math.sin((2 * Math.PI * k) / n),
      })),
    });
    // 18 vertices turn 20° each: all corners; 19 turn 18.9°: none
    expect(cornerWays(ngon(18))).toHaveLength(18);
    expect(cornerWays(ngon(19))).toEqual([]);
    // One vertex of 19° and one of 21° among straight ones
    const bent = (degrees: number): Contour => {
      const a = (degrees * Math.PI) / 180;
      return poly([0, 0], [100, 0], [100 + 100 * Math.cos(a), 100 * Math.sin(a)], [50, 120]);
    };
    expect(cornerWays(bent(19)).includes(100)).toBe(false);
    expect(cornerWays(bent(21)).includes(100)).toBe(true);
  });

  it('are none on a circle, on an open line or on a line of no length; a coarse circle polygon has them all', () => {
    expect(cornerWays(circle(0, 0, 20))).toEqual([]);
    // The same points without the exact circle: every vertex turns 5°
    expect(cornerWays({ closed: true, points: circle(0, 0, 20).points })).toEqual([]);
    // A circle of 1 mm: 16 chords of 22.5° – corners without the exact circle, none with it
    expect(cornerWays(circle(0, 0, 1))).toEqual([]);
    expect(cornerWays({ closed: true, points: circle(0, 0, 1).points })).toHaveLength(16);
    expect(cornerWays({ ...plate, closed: false })).toEqual([]);
    const dot = { x: 3, y: 3 };
    expect(cornerWays({ closed: true, points: [dot, dot] })).toEqual([]);
  });
});

describe('tabs off the corners', () => {
  // 8 wide, a 6 mm cutter: a lifted stretch of 14, reach 7: clear runs [7, 93], [107, 143], [157, 243], [257, 293]
  const tab = { width: 8, avoidCorners: true };

  it('leave the even spread alone where it is clear, and move the rest to the nearest clear way', () => {
    const ways = (count: number) => waysOf(plate, { count, ...tab }, 6);
    // One tab in the middle of the line, on the corner at 150: 143 and 157 are equally near – the earlier
    expect(ways(1)).toEqual([143]);
    expect(ways(2)).toEqual([75, 225]);
    // 50, 150, 250: the second goes to 143; the third, with 143 now before it, to 243 (257 is as near)
    expect(ways(3)).toEqual([50, 143, 243]);
    // 112.5 is 12.5 from the corner at 100 and 262.5 12.5 from the one at 250: both clear
    expect(ways(4)).toEqual([37.5, 112.5, 187.5, 262.5]);
    expect(ways(5)).toEqual([30, 90, 143, 210, 270]);
    expect(ways(6)).toEqual([25, 75, 125, 175, 225, 275]);
    const seven = ways(7);
    [
      (0.5 * 300) / 7,
      (1.5 * 300) / 7,
      (2.5 * 300) / 7,
      143,
      (4.5 * 300) / 7,
      (5.5 * 300) / 7,
      (6.5 * 300) / 7,
    ].forEach((expected, k) => expect(seven[k]).toBeCloseTo(expected, 6));
    // 93.75 is 6.25 from the corner at 100: to 93; 243.75 to 243
    expect(ways(8)).toEqual([18.75, 56.25, 93, 131.25, 168.75, 206.25, 243, 281.25]);
    // Without the switch nothing moves – whatever the width given
    expect(waysOf(plate, { count: 8, width: 8 }, 6)).toEqual([
      18.75, 56.25, 93.75, 131.25, 168.75, 206.25, 243.75, 281.25,
    ]);
    expect(waysOf(plate, { count: 8, width: 8, avoidCorners: false }, 6)).toEqual(
      waysOf(plate, { count: 8 }, 6),
    );
  });

  it('keep the place of a tab that moved: the point on the line and the way it runs', () => {
    const sites = tabSites(plate, { count: 4, width: 20, avoidCorners: true }, 6);
    // Reach 13: 112.5 and 262.5 are blocked, they go to 113 (13 up the right side) and 263 (13 down the left)
    const at = (t: (typeof sites)[number]) =>
      [t.u * 300, t.point.x, t.point.y, t.tangent.x, t.tangent.y].map(r9);
    expect(sites.map(at)).toEqual([
      [37.5, 37.5, 0, 1, 0],
      [113, 100, 13, 0, 1],
      [187.5, 62.5, 50, -1, 0],
      [263, 0, 37, 0, -1],
    ]);
    expect(sites.map((t) => r9(t.u))).toEqual([0.125, r9(113 / 300), 0.625, r9(263 / 300)]);
  });

  it('take the longer reach of a wider tab or a bigger cutter, and give up where no stretch is long enough', () => {
    // 40 wide + 6 = 46: reach 23, the right side (50 long) keeps [123, 127]
    expect(waysOf(plate, { count: 1, width: 40, avoidCorners: true }, 6)).toEqual([127]);
    // The cutter's diameter counts as much as the width: 34 + 12
    expect(waysOf(plate, { count: 1, width: 34, avoidCorners: true }, 12)).toEqual([127]);
    // 56: the sides of 50 are too short, the middle of the top (178 – 222) is the nearest clear way, 28 away
    expect(waysOf(plate, { count: 1, width: 50, avoidCorners: true }, 6)).toEqual([178]);
    const top = tabSites(plate, { count: 1, width: 50, avoidCorners: true }, 6)[0]!;
    expect([top.point.x, top.point.y, top.tangent.x, top.tangent.y]).toEqual([72, 50, -1, 0]);
    // 106: no side is long enough: all four stay where the spread put them, corners or not
    expect(waysOf(plate, { count: 4, width: 100, avoidCorners: true }, 6)).toEqual([
      37.5, 112.5, 187.5, 262.5,
    ]);
    // A part smaller than a tab: 4 × 4, a stretch of 14
    const small = rectangle(0, 0, 4, 4);
    expect(waysOf(small, { count: 1, ...tab }, 6)).toEqual([8]);
    expect(waysOf(small, { count: 2, ...tab }, 6)).toEqual([4, 12]);
  });

  it('keep a place that has no room between its neighbours, and respect the neighbours that moved', () => {
    // Triangle 30 / 50 / 40: corners at 0, 30, 80. Tabs of 10 + 4: reach 7, 14 apart
    const triangle = poly([0, 0], [30, 0], [0, 40]);
    const t = { width: 10, avoidCorners: true };
    // Six tabs, 20 apart: the one on the corner at 30 has no clear way left between 10 and 50
    expect(waysOf(triangle, { count: 6, ...t }, 4)).toEqual([10, 30, 50, 70, 90, 110]);
    // Four tabs: 75 is 5 from the corner at 80 – to 73, between 59 and 91
    expect(waysOf(triangle, { count: 4, ...t }, 4)).toEqual([15, 45, 73, 105]);
    // Two tabs of 6 + 4 (reach 5): 30 is on a corner, 25 and 35 are as near, the earlier is taken
    expect(waysOf(triangle, { count: 2, width: 6, avoidCorners: true }, 4)).toEqual([25, 90]);
    const sites = tabSites(triangle, { count: 2, width: 6, avoidCorners: true }, 4);
    expect(sites.map((s) => [s.point.x, s.point.y, s.tangent.x, s.tangent.y])).toEqual([
      [25, 0, 1, 0],
      [0, 30, 0, -1],
    ]);
  });

  it('on an L: the tab on a reflex corner goes to the nearest straight run', () => {
    const l = poly([0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]);
    // 8 + 2: reach 5. Corners 0, 60, 80, 120, 160, 180: the tab at 120 is 5 from 115 and 125
    const sites = tabSites(l, { count: 3, width: 8, avoidCorners: true }, 2);
    expect(sites.map((s) => r9(s.u * 240))).toEqual([40, 115, 200]);
    expect(sites[1]!.point).toEqual({ x: 25, y: 20 });
    expect(sites[1]!.tangent).toEqual({ x: -1, y: 0 });
  });

  it('leave a circle alone, however small the cutter makes the stretch', () => {
    const round = circle(0, 0, 20);
    expect(tabSites(round, { count: 4, width: 8, avoidCorners: true }, 6)).toEqual(
      tabSites(round, { count: 4 }),
    );
    // A circle of 1 mm has chords of 22.5°: as a polygon without the exact circle every vertex is a
    // corner and no stretch between two is long enough – nothing moves either
    const coarse = { closed: true, points: circle(0, 0, 1).points };
    expect(tabSites(coarse, { count: 3, width: 1, avoidCorners: true }, 0.5)).toEqual(
      tabSites(coarse, { count: 3 }),
    );
  });

  it('never move a place that is told by hand', () => {
    const at = [0.5, 0.25, 0.9166666666666666];
    const hand = tabSites(plate, { count: 4, width: 20, avoidCorners: true, at }, 6);
    expect(hand.map((t) => t.u)).toEqual([0.25, 0.5, 0.9166666666666666]);
    expect(hand).toEqual(tabSites(plate, { count: 4, at }));
    expect(tabSites(plate, { count: 0, width: 20, avoidCorners: true }, 6)).toEqual([]);
    expect(
      tabSites({ ...plate, closed: false }, { count: 4, width: 20, avoidCorners: true }, 6),
    ).toEqual([]);
  });

  it('use the clear stretch that runs over the start of the line, and put the order right', () => {
    // 100 × 50 drawn from the middle of the lower side: corners at 40, 90, 190, 240, the start is none
    const turned = poly([60, 0], [100, 0], [100, 50], [0, 50], [0, 0]);
    expect(cornerWays(turned)).toEqual([40, 90, 190, 240]);
    // Four tabs, 20 + 6: reach 13, runs [53, 77], [103, 177], [203, 227] and [253, 327] across the start.
    // 37.5 is 2.5 before the corner at 40: its nearest clear way is 27 (13 before it, in the last run, 327 − 300)
    // 187.5 is 2.5 before the corner at 190: 177 (13 before it); 112.5 and 262.5 are clear
    expect(waysOf(turned, { count: 4, width: 20, avoidCorners: true }, 6)).toEqual([
      27, 112.5, 177, 262.5,
    ]);
  });

  it('count the cutter alone where no width is given', () => {
    // The tab on the corner at 150, reach 3 (a 6 mm cutter): 147 and 153 are equally near
    expect(waysOf(plate, { count: 1, avoidCorners: true }, 6)).toEqual([147]);
  });

  it('read the width and the cutter as numbers: a diameter that is no number is none', () => {
    const base = waysOf(plate, { count: 1, width: 8, avoidCorners: true }, 0);
    // Reach 4 without a cutter: runs [4, 96], [104, 146], [154, 246], [254, 296]: 146 and 154 are equally near
    expect(base).toEqual([146]);
    // A cutter that is no number leaves no reach: nothing is in the way of anything, and nothing moves
    expect(waysOf(plate, { count: 1, width: 8, avoidCorners: true }, Number.NaN)).toEqual([150]);
  });
});

describe('tabs off the corners, on the side the cutter runs', () => {
  // The cutter's loop has a sharp corner where the line turns towards the cutter's side: at the corners of a
  // part for an inside cut, at its notches for an outline. There the straight run of the loop is the drawn
  // side less radius · tan(turn / 2) short at that end, so that much more must be clear: 3 for a 6 mm cutter
  // at a corner of 90°. On the other side the loop goes round the corner on an arc and the run is the whole side.
  const ways = (
    c: Contour,
    count: number,
    width: number,
    tool: number,
    kind: 'inside' | 'outside' | 'on',
  ) => {
    const length = pathLength(c.points, true);
    return tabSites(c, { count, width, avoidCorners: true }, tool, kind).map((t) =>
      r9(t.u * length),
    );
  };
  const plate = rectangle(0, 0, 100, 50);

  it('keep 16 clear (13 + 3) at the corners of a part cut inside, 13 outside and on the line', () => {
    // Four tabs of 20 + 6: reach 13; for an inside cut 16 at all four corners, the runs [16, 84], [116, 134], …
    expect(ways(plate, 4, 20, 6, 'inside')).toEqual([37.5, 116, 187.5, 266]);
    expect(ways(plate, 4, 20, 6, 'outside')).toEqual([37.5, 113, 187.5, 263]);
    expect(ways(plate, 4, 20, 6, 'on')).toEqual([37.5, 113, 187.5, 263]);
    // The kind is 'on' unless said
    expect(waysOf(plate, { count: 4, width: 20, avoidCorners: true }, 6)).toEqual([
      37.5, 113, 187.5, 263,
    ]);
    // Without a cutter all three are the same
    expect(ways(plate, 4, 20, 0, 'inside')).toEqual(ways(plate, 4, 20, 0, 'outside'));
  });

  it('are the other way round at a notch: an L has one, its inner corner', () => {
    // 60 + 20 + 40 + 40 + 20 + 60: the corner at (20, 20), 120 along, turns the other way than the rest.
    // Tabs of 8 + 2: reach 5, a 2 mm cutter: 1 more at a sharp corner of the loop
    const l = poly([0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]);
    // Outline: the notch is sharp – 114 and 126 are equally far from 120 (6) – the lower is taken
    expect(ways(l, 3, 8, 2, 'outside')).toEqual([40, 114, 200]);
    // Inside cut: the notch is round, the other five corners are sharp: 115 and 125, as on the line itself
    expect(ways(l, 3, 8, 2, 'inside')).toEqual([40, 115, 200]);
    expect(ways(l, 3, 8, 2, 'on')).toEqual([40, 115, 200]);
  });

  it('read the side from the way the line is drawn: the same L drawn clockwise', () => {
    // The same L, drawn the other way round: the notch is at 60 along, and two tabs stand on 60 and 180
    const cw = poly([0, 60], [20, 60], [20, 20], [60, 20], [60, 0], [0, 0]);
    expect(cornerWays(cw)).toEqual([0, 20, 60, 100, 120, 180]);
    // Outline: the notch at 60 keeps 6 (54 and 66: the lower), the corner at 180 keeps 5 (175)
    expect(ways(cw, 2, 8, 2, 'outside')).toEqual([54, 175]);
    // Inside cut: the notch is round (55 and 65), the corner at 180 is sharp: 6 (174)
    expect(ways(cw, 2, 8, 2, 'inside')).toEqual([55, 174]);
  });

  it('keep a line that turns back on itself clear altogether, and never make a number of nothing', () => {
    // Two points are a line there and back: both turn 180°, the loop's corner is infinitely far away
    const spike: Contour = {
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    };
    // Sharp for an outline: nothing is clear, the tab stays (on a corner, at 10)
    expect(ways(spike, 1, 2, 2, 'outside')).toEqual([10]);
    // Not sharp for an inside cut: reach 2, runs [2, 8] and [12, 18]: 8 and 12 are equally near
    expect(ways(spike, 1, 2, 2, 'inside')).toEqual([8]);
    // No cutter: 0 · ∞ is nothing, the reach is the tab's alone (1): runs [1, 9], [11, 19]
    expect(ways(spike, 1, 2, 0, 'outside')).toEqual([9]);
  });
});

describe('the tabs off the corners in a toolpath', () => {
  const s: CutSettings = {
    toolDiameter: 6,
    depth: 6,
    stepdown: 3,
    stepover: 0.4,
    feed: 1200,
    plungeFeed: 300,
    rampAngle: 90,
    safeZ: 5,
    climb: true,
  };
  const cutting = (moves: Move[]) => moves.filter((m) => m.feed !== null && m.x !== undefined);
  /** Where the cutter is up at the tabs' height (−4): the end points of the stretches */
  const lifted = (moves: Move[]) =>
    cutting(moves).filter((m) => Math.abs(m.z! - -4) < 1e-9) as (Move & Point)[];
  /** On the straight sides of the loop 3 mm round the plate (and not on its round corners) */
  const straight = (m: Point) => {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const between = (v: number, lo: number, hi: number) => v >= lo - 0.01 && v <= hi + 0.01;
    return (
      ((near(m.x, -3) || near(m.x, 103)) && between(m.y, 0, 50)) ||
      ((near(m.y, -3) || near(m.y, 53)) && between(m.x, 0, 100))
    );
  };

  it('lift the cutter on straight stretches only, and cut as drawn: the same tabs the sites say', () => {
    const tabs = { count: 4, width: 20, height: 2, avoidCorners: true };
    const { moves, problems } = toolpaths([plate], [{ contour: 0, kind: 'outside', tabs }], s);
    expect(problems).toEqual([]);
    // Four tabs of 26 mm of path: 37.5 → 0 … 26 on the lower side; 113 → 0 … 26 up the right side;
    // 187.5 and 263 the same. Every end of a stretch is on a straight side
    const high = lifted(moves);
    expect(high.length).toBeGreaterThan(0);
    expect(high.every(straight)).toBe(true);
    // The tab at 113 begins where the lower round corner ends (103, 0) and ends at (103, 26)
    expect(high.some((m) => Math.abs(m.x - 103) < 0.01 && Math.abs(m.y - 26) < 0.01)).toBe(true);
    // Without the switch the tab at 112.5 reaches round the corner: 0.5 below it, onto the arc
    const plain = toolpaths(
      [plate],
      [{ contour: 0, kind: 'outside', tabs: { count: 4, width: 20, height: 2 } }],
      s,
    );
    expect(lifted(plain.moves).every(straight)).toBe(false);
  });

  /** The stretches the cutter is lifted over at the tabs' height (−4), as where it lifts and where it comes down */
  const stretches = (moves: Move[]) => {
    const out: { from: Point; to: Point }[] = [];
    let x = 0;
    let y = 0;
    let z = 5;
    let from: Point | undefined;
    for (const m of moves) {
      const was = z;
      x = m.x ?? x;
      y = m.y ?? y;
      z = m.z ?? z;
      if (m.x === undefined && m.y === undefined && m.z !== undefined) {
        if (Math.abs(z - -4) < 1e-9 && was < -4) from = { x, y };
        else if (was === -4 && z < -4 && from) out.push({ from, to: { x, y } });
      }
    }
    return out;
  };
  const near = (p: Point, x: number, y: number) =>
    Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01;
  /** Both ends on one side of the loop: the stretch does not go round a corner */
  const oneSide = (a: { from: Point; to: Point }) =>
    Math.abs(a.from.x - a.to.x) < 0.01 || Math.abs(a.from.y - a.to.y) < 0.01;

  it('lift the cutter along one side only, cutting inside as well as outside', () => {
    const run = (kind: 'inside' | 'outside' | 'on', tabs: object) =>
      stretches(
        toolpaths(
          [plate],
          [{ contour: 0, kind, tabs: { count: 4, width: 20, height: 2, ...tabs } }],
          s,
        ).moves,
      );
    for (const kind of ['inside', 'outside', 'on'] as const) {
      const lifted = run(kind, { avoidCorners: true });
      expect(lifted).toHaveLength(4);
      expect(lifted.every(oneSide)).toBe(true);
    }
    // Inside (cut clockwise): the loop is the plate 3 mm in, with sharp corners, and the tab at 116 runs down
    // the right side from (97, 29) and ends at its corner (97, 3)
    const inside = run('inside', { avoidCorners: true });
    expect(inside.some((a) => near(a.to, 97, 3) && near(a.from, 97, 29))).toBe(true);
    // A tab put by hand at 113 – what an even spread without regard for the loop's corners would give –
    // goes round the corner of the loop: from (97, 26) down to the corner, then 3 mm along the lower side
    const byHand = run('inside', { at: [113 / 300] });
    expect(byHand).toHaveLength(1);
    expect(oneSide(byHand[0]!)).toBe(false);
    expect(near(byHand[0]!.from, 97, 26)).toBe(true);
    expect(near(byHand[0]!.to, 94, 3)).toBe(true);
    // The L as an outline: the notch is sharp, and no tab goes round it – nor any other corner
    const l = poly([0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]);
    const outline = stretches(
      toolpaths(
        [l],
        [
          {
            contour: 0,
            kind: 'outside',
            tabs: { count: 3, width: 8, height: 2, avoidCorners: true },
          },
        ],
        { ...s, toolDiameter: 2 },
      ).moves,
    );
    expect(outline).toHaveLength(3);
    expect(outline.every(oneSide)).toBe(true);
  });

  it('are what the drawing shows: the one function gives both', () => {
    const tabs = { count: 4, width: 20, height: 2, avoidCorners: true };
    const named = { ...tabs, avoidCorners: false, at: tabSites(plate, tabs, 6).map((t) => t.u) };
    const code = (t: typeof tabs) =>
      toGcode(toolpaths([plate], [{ contour: 0, kind: 'outside', tabs: t }], s).moves, {
        name: 'x',
        rpm: 1000,
        safeZ: 5,
      });
    expect(code(named)).toBe(code(tabs));
  });
});
