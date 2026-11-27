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
