import { describe, expect, it } from 'vitest';
import {
  bounds,
  circle,
  contourSpan,
  defaultOperations,
  holeGrid,
  nearestOnContour,
  nestingDepths,
  offsetPolygons,
  passDepths,
  pathLength,
  pocketRings,
  rectangle,
  region,
  signedArea,
  slot,
  tabPoints,
  tabSites,
  textContours,
  toGcode,
  toolpaths,
  type Contour,
  type CutSettings,
  type Move,
  type Operation,
  type Point,
} from '../src';

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
const lowest = (moves: Move[]) => Math.min(...moves.map((m) => m.z ?? 0));

describe('shapes and geometry', () => {
  it('draws rectangles, rounded ones, circles, slots and hole grids', () => {
    const r = rectangle(0, 0, 100, 50);
    expect(signedArea(r.points)).toBe(5000);
    const rounded = rectangle(0, 0, 100, 50, 10);
    expect(signedArea(rounded.points)).toBeCloseTo(5000 - (400 - Math.PI * 100), 0);
    expect(rectangle(0, 0, 10, 10, 50).points.length).toBeGreaterThan(8);
    const c = circle(10, 10, 20);
    expect(c.circle).toEqual({ cx: 10, cy: 10, r: 10 });
    expect(signedArea(c.points)).toBeCloseTo(Math.PI * 100, 0);
    const sl = slot(0, 0, 40, 10, 90);
    expect(bounds(sl.points).maxY).toBeCloseTo(20, 1);
    expect(bounds(sl.points).maxX).toBeCloseTo(5);
    expect(slot(0, 0, 4, 10).points.length).toBeGreaterThan(4);
    const grid = holeGrid(10, 10, 5, 3, 2, 20, 30);
    expect(grid).toHaveLength(6);
    expect(grid[5]!.circle).toEqual({ cx: 50, cy: 40, r: 2.5 });
    expect(pathLength(r.points, true)).toBe(300);
    expect(pathLength(r.points, false)).toBe(250);
    expect(pathLength([], true)).toBe(0);
  });

  it('finds what lies inside what', () => {
    const outer = rectangle(0, 0, 100, 100);
    const hole = circle(50, 50, 30);
    const island = circle(50, 50, 10);
    const beside = rectangle(200, 0, 10, 10);
    const open = { closed: false, points: [] };
    expect(nestingDepths([outer, hole, island, beside, open])).toEqual([0, 1, 2, 0, 0]);
  });

  it('offsets polygons outwards with round corners and inwards until they vanish', () => {
    const square = rectangle(0, 0, 10, 10).points;
    const grown = offsetPolygons([square], 1);
    expect(grown).toHaveLength(1);
    expect(Math.abs(signedArea(grown[0]!))).toBeCloseTo(100 + 40 + Math.PI, 1);
    expect(offsetPolygons([square], -6)).toEqual([]);
    const [outer, hole] = region([...square].reverse(), [rectangle(4, 4, 2, 2).points]);
    expect(signedArea(outer!)).toBeGreaterThan(0);
    expect(signedArea(hole!)).toBeLessThan(0);
    const [, cwHole] = region(square, [[...rectangle(4, 4, 2, 2).points].reverse()]);
    expect(signedArea(cwHole!)).toBeLessThan(0);
  });

  it('divides the depth into equal passes', () => {
    expect(passDepths(6, 3)).toEqual([-3, -6]);
    expect(passDepths(5, 2)).toEqual([-5 / 3, -10 / 3, -5]);
    expect(passDepths(1, 3)).toEqual([-1]);
  });
});

describe('toolpaths', () => {
  it('cuts an outline outside, with the cutter radius beside the part', () => {
    const part = rectangle(0, 0, 100, 50);
    const { moves, problems } = toolpaths([part], [{ contour: 0, kind: 'outside' }], s);
    expect(problems).toEqual([]);
    const b = bounds(cutting(moves).map((m) => ({ x: m.x!, y: m.y! })));
    expect(b.minX).toBeCloseTo(-3);
    expect(b.maxY).toBeCloseTo(53);
    expect(lowest(moves)).toBeCloseTo(-6);
    expect(moves.at(-1)).toEqual({ z: 5, feed: null });
  });

  it('runs outside counter-clockwise for climb and clockwise conventional; inside the other way', () => {
    const part = rectangle(0, 0, 100, 50);
    const turn = (settings: CutSettings, kind: 'outside' | 'inside') => {
      const pts = cutting(toolpaths([part], [{ contour: 0, kind }], settings).moves)
        .slice(0, 40)
        .map((m) => ({ x: m.x!, y: m.y! }));
      return Math.sign(signedArea(pts));
    };
    expect(turn(s, 'outside')).toBe(1);
    expect(turn({ ...s, climb: false }, 'outside')).toBe(-1);
    expect(turn(s, 'inside')).toBe(-1);
    expect(turn({ ...s, climb: false }, 'inside')).toBe(1);
  });

  it('takes the direction of the operation over the job’s: contours, pockets and bored holes', () => {
    const part = rectangle(0, 0, 100, 50);
    const turn = (op: Parameters<typeof toolpaths>[1][number], settings: CutSettings) => {
      const pts = cutting(toolpaths([part], [op], settings).moves)
        .slice(0, 40)
        .map((m) => ({ x: m.x!, y: m.y! }));
      return Math.sign(signedArea(pts));
    };
    // a job that runs climb, a part that runs conventional – and the other way round
    expect(turn({ contour: 0, kind: 'outside', climb: false }, s)).toBe(-1);
    expect(turn({ contour: 0, kind: 'outside', climb: true }, { ...s, climb: false })).toBe(1);
    expect(turn({ contour: 0, kind: 'inside', climb: false }, s)).toBe(1);
    expect(turn({ contour: 0, kind: 'inside', climb: true }, { ...s, climb: false })).toBe(-1);
    // pockets: the same as the job's setting would have done
    const pocket = (op: { climb?: boolean }, settings: CutSettings) =>
      JSON.stringify(toolpaths([part], [{ contour: 0, kind: 'pocket', ...op }], settings).moves);
    expect(pocket({ climb: false }, s)).toBe(pocket({}, { ...s, climb: false }));
    expect(pocket({ climb: true }, { ...s, climb: false })).toBe(pocket({}, s));
    expect(pocket({ climb: false }, s)).not.toBe(pocket({ climb: true }, s));
    // bored holes: the helix runs clockwise for climb
    const bore = (op: { climb?: boolean }, settings: CutSettings) =>
      toolpaths([circle(0, 0, 20)], [{ contour: 0, kind: 'drill', ...op }], settings).moves.find(
        (m) => m.arc,
      )!.arc!.cw;
    expect(bore({ climb: false }, s)).toBe(false);
    expect(bore({ climb: true }, { ...s, climb: false })).toBe(true);
  });

  it('without a direction of its own an operation follows the job: nothing changes', () => {
    const part = rectangle(0, 0, 100, 50);
    for (const kind of ['outside', 'inside', 'pocket'] as const) {
      for (const climb of [true, false]) {
        expect(
          JSON.stringify(toolpaths([part], [{ contour: 0, kind }], { ...s, climb }).moves),
        ).toBe(
          JSON.stringify(
            toolpaths([part], [{ contour: 0, kind, climb: undefined }], { ...s, climb }).moves,
          ),
        );
      }
    }
  });

  it('ramps into the material instead of plunging', () => {
    const part = rectangle(0, 0, 100, 50);
    const { moves } = toolpaths([part], [{ contour: 0, kind: 'outside' }], { ...s, rampAngle: 5 });
    const plunge = moves.findIndex((m) => m.feed === 300 && m.z !== undefined && m.x === undefined);
    // Straight down only to the surface, then sideways and down together.
    expect(moves[plunge]!.z).toBe(0);
    const firstCut = moves[plunge + 1]!;
    expect(firstCut.x).toBeDefined();
    expect(firstCut.z!).toBeLessThan(0);
    expect(firstCut.z!).toBeGreaterThan(-3);
  });

  it('leaves tabs standing on the last passes', () => {
    const part = rectangle(0, 0, 100, 50);
    const tabs = { count: 4, width: 8, height: 2 };
    const { moves } = toolpaths([part], [{ contour: 0, kind: 'outside', tabs }], s);
    const atTab = cutting(moves).filter((m) => Math.abs(m.z! - -4) < 1e-9);
    expect(atTab).toHaveLength(4);
    // Up onto each tab and down again behind it, slowly.
    const lifts = moves.filter((m) => m.x === undefined && m.feed === 300 && m.z === -4);
    expect(lifts).toHaveLength(4);
  });

  it('engraves open lines back and forth and closed ones on the line', () => {
    const line = {
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
    };
    const { moves } = toolpaths(
      [line, rectangle(0, 10, 20, 20)],
      [
        { contour: 0, kind: 'on' },
        { contour: 1, kind: 'on' },
      ],
      s,
    );
    const xs = cutting(moves)
      .slice(0, 2)
      .map((m) => m.x);
    expect(xs).toEqual([50, 0]);
    expect(Math.max(...cutting(moves).map((m) => m.y!))).toBeCloseTo(30);
  });

  it('drills holes that fit the cutter and bores larger ones in a helix', () => {
    const { moves } = toolpaths(
      [circle(10, 10, 6), circle(50, 10, 20)],
      [
        { contour: 0, kind: 'drill' },
        { contour: 1, kind: 'drill', depth: 4 },
      ],
      { ...s, rampAngle: 3 },
    );
    const pecks = moves.filter((m) => m.x === undefined && m.feed === 300);
    expect(pecks.map((m) => m.z)).toContain(-6);
    const arcs = moves.filter((m) => m.arc);
    expect(arcs.length).toBeGreaterThan(2);
    expect(arcs[0]!.arc).toEqual({ cw: true, i: -7, j: 0 });
    expect(arcs.at(-1)!.z).toBe(-4);
    const conventional = toolpaths([circle(0, 0, 20)], [{ contour: 0, kind: 'drill' }], {
      ...s,
      climb: false,
    });
    expect(conventional.moves.find((m) => m.arc)!.arc!.cw).toBe(false);
  });

  it('clears a pocket ring by ring around an island', () => {
    const pocket = rectangle(0, 0, 60, 40);
    const island = circle(30, 20, 10);
    const levels = pocketRings(pocket.points, [island.points], s);
    expect(levels.length).toBeGreaterThan(2);
    const { moves, problems } = toolpaths([pocket, island], [{ contour: 0, kind: 'pocket' }], s);
    expect(problems).toEqual([]);
    const cut = cutting(moves);
    // Never into the island: every point stays at least the radius away from it.
    const near = cut.filter((m) => Math.hypot(m.x! - 30, m.y! - 20) < 5 + 3 - 0.05);
    expect(near).toEqual([]);
    expect(Math.min(...cut.map((m) => m.x!))).toBeCloseTo(3, 1);
    const conventional = toolpaths([pocket], [{ contour: 0, kind: 'pocket' }], {
      ...s,
      climb: false,
    });
    expect(cutting(conventional.moves).length).toBeGreaterThan(0);
  });

  it('starts each loop near where the last one ended, whatever the drawing order', () => {
    const square = rectangle(0, 0, 10, 10);
    const reversed = { ...square, points: [...square.points].reverse() };
    const doubled = {
      closed: true,
      points: [
        { x: 20, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 0 },
      ],
    };
    const { moves } = toolpaths(
      [reversed, doubled],
      [
        { contour: 0, kind: 'outside' },
        { contour: 1, kind: 'on' },
      ],
      s,
    );
    const rapids = moves.filter((m) => m.feed === null && m.x !== undefined);
    // Engraving first (from its first corner), then the outline from its point nearest to there.
    expect(rapids[0]).toMatchObject({ x: 20, y: 0 });
    expect(rapids[1]!.x).toBeCloseTo(13, 0);
    expect(Math.abs(rapids[1]!.y!)).toBeLessThan(0.5);
    const pocket = toolpaths(
      [rectangle(0, 0, 60, 40), rectangle(25, 15, 10, 10)],
      [{ contour: 0, kind: 'pocket' }],
      s,
    );
    const cut = cutting(pocket.moves);
    // At least the cutter radius from the square island everywhere.
    const gap = (m: Move) =>
      Math.hypot(Math.max(25 - m.x!, 0, m.x! - 35), Math.max(15 - m.y!, 0, m.y! - 25));
    expect(cut.filter((m) => gap(m) < 2.95)).toEqual([]);
    expect(circle(0, 0, 0.01).points.length).toBe(4);
  });

  it('lets a cutter into a hole up to 0.1 mm narrower than itself, no further', () => {
    const drill = (diameter: number) =>
      toolpaths([circle(0, 0, diameter)], [{ contour: 0, kind: 'drill' }], s).problems;
    expect(drill(5.9)).toEqual([]); // 6 mm cutter, radius 0.05 short: still taken
    expect(drill(5.7)).toEqual([{ contour: 0, code: 'hole-too-small' }]);
  });

  it('reports what it cannot cut and skips "none"', () => {
    const tiny = rectangle(0, 0, 4, 4);
    const open = {
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
    };
    const { moves, problems } = toolpaths(
      [tiny, open, circle(0, 0, 4), rectangle(0, 0, 10, 10)],
      [
        { contour: 0, kind: 'inside' },
        { contour: 0, kind: 'pocket' },
        { contour: 1, kind: 'outside' },
        { contour: 2, kind: 'drill' },
        { contour: 3, kind: 'drill' },
        { contour: 3, kind: 'none' },
        { contour: 9, kind: 'outside' },
      ],
      s,
    );
    // In the order they would be cut: holes (both at the work zero: as listed), pocket, then the cuts.
    expect(problems).toEqual([
      { contour: 2, code: 'hole-too-small' },
      { contour: 3, code: 'hole-too-small' },
      { contour: 0, code: 'tool-too-large' },
      { contour: 1, code: 'open-contour' },
      { contour: 0, code: 'tool-too-large' },
    ]);
    expect(moves).toEqual([]);
  });

  it('chooses Estlcam-like defaults', () => {
    const tabs = { count: 4, width: 6, height: 2 };
    const ops = defaultOperations(
      [
        rectangle(0, 0, 100, 100),
        circle(20, 20, 6),
        circle(50, 50, 30),
        circle(50, 50, 10),
        {
          closed: false,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      6,
      tabs,
    );
    expect(ops.map((o) => o.kind)).toEqual(['outside', 'drill', 'inside', 'outside', 'on']);
    expect(ops[0]!.tabs).toBe(tabs);
  });
});

/** The rapid moves to a new place: where each cut begins. */
const starts = (moves: Move[]) =>
  moves
    .filter((m) => m.feed === null && m.x !== undefined)
    .map((m) => [Math.round(m.x! * 100) / 100, Math.round(m.y! * 100) / 100]);
const at = (m: Move, x: number, y: number) =>
  m.x !== undefined && Math.abs(m.x - x) < 1e-3 && Math.abs(m.y! - y) < 1e-3;
const line = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  closed: false,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ],
});

describe('order of the cuts', () => {
  it('drills first, then pockets, engraving, cut-outs, and the outline last – however they are listed', () => {
    const contours = [
      rectangle(0, 0, 200, 100),
      rectangle(120, 20, 60, 60),
      line(20, 80, 100, 80),
      rectangle(20, 20, 40, 40),
      circle(100, 50, 6),
    ];
    const operations: Operation[] = [
      { contour: 0, kind: 'outside' },
      { contour: 1, kind: 'inside' },
      { contour: 2, kind: 'on' },
      { contour: 3, kind: 'pocket' },
      { contour: 4, kind: 'drill' },
    ];
    const { moves, problems } = toolpaths(contours, operations, s);
    expect(problems).toEqual([]);
    const first = starts(moves);
    // The hole, the pocket (innermost ring first), the line, the cut-out, the outline.
    expect(first[0]).toEqual([100, 50]);
    expect(first[1]![0]).toBeGreaterThan(20);
    expect(first[1]![0]).toBeLessThan(60);
    // The line is entered at the end nearer to the pocket.
    expect(first.at(-3)).toEqual([20, 80]);
    expect(first.at(-2)![0]).toBeGreaterThan(120);
    expect(first.at(-2)![0]).toBeLessThan(180);
    // The outline starts at its corner nearest to where the cut-out ended.
    expect(first.at(-1)![0]).toBeGreaterThan(190);
  });

  it('takes the nearest next, starting from the work zero', () => {
    const holes = [circle(100, 10, 6), circle(10, 10, 6), circle(50, 10, 6), circle(140, 10, 6)];
    const { moves } = toolpaths(
      holes,
      holes.map((_, i) => ({ contour: i, kind: 'drill' as const })),
      s,
    );
    expect(starts(moves).map((p) => p[0])).toEqual([10, 50, 100, 140]);
    // From where an earlier toolpath left the tool (a series: the blank before).
    const on = toolpaths(
      holes,
      holes.map((_, i) => ({ contour: i, kind: 'drill' as const })),
      s,
      { x: 150, y: 10 },
    );
    expect(starts(on.moves).map((p) => p[0])).toEqual([140, 100, 50, 10]);
  });

  it('engraves an open line from its nearer end', () => {
    const { moves } = toolpaths(
      [line(100, 0, 10, 0), line(110, 10, 200, 10), line(300, 20, 210, 20)],
      [0, 1, 2].map((contour) => ({ contour, kind: 'on' as const })),
      s,
    );
    // 10 → 100, on to 110 → 200, on to 210 → 300: never back across the sheet.
    expect(starts(moves).map((p) => p[0])).toEqual([10, 110, 210]);
    const ends = cutting(moves).filter((m) => m.z === undefined || m.z === -6);
    expect(ends.at(-1)).toMatchObject({ x: 210 });
  });

  it('cuts what lies inside a contour before that contour comes free', () => {
    // A ring: the disc in the middle is a part of its own, inside the hole of the frame.
    const frame = rectangle(0, 0, 100, 100);
    const hole = circle(50, 50, 60);
    const disc = circle(50, 50, 30);
    const mark = line(45, 50, 55, 50);
    const { moves } = toolpaths(
      [frame, hole, disc, mark],
      [
        { contour: 0, kind: 'outside' },
        { contour: 1, kind: 'inside' },
        { contour: 2, kind: 'outside' },
        { contour: 3, kind: 'on' },
      ],
      s,
    );
    const radius = starts(moves).map((p) => Math.round(Math.hypot(p[0]! - 50, p[1]! - 50)));
    // The mark on the disc, the disc (15 + 3), the hole around it (30 − 3), the frame.
    expect(radius[0]).toBe(5);
    expect(radius[1]).toBe(18);
    expect(radius[2]).toBe(27);
    expect(radius[3]).toBeGreaterThan(50);
  });

  it('finishes each part with its own outline when parts lie side by side', () => {
    const contours = [
      rectangle(0, 0, 50, 50),
      rectangle(100, 0, 50, 50),
      rectangle(10, 10, 30, 30),
      rectangle(110, 10, 30, 30),
    ];
    const { moves } = toolpaths(
      contours,
      [
        { contour: 0, kind: 'outside' },
        { contour: 1, kind: 'outside' },
        { contour: 2, kind: 'inside' },
        { contour: 3, kind: 'inside' },
      ],
      s,
    );
    const xs = starts(moves).map((p) => p[0]!);
    // Both cut-outs before any outline; then the outline nearest to the last cut-out.
    expect(xs[0]).toBeCloseTo(13);
    expect(xs[1]).toBeCloseTo(113);
    expect(xs[2]).toBeGreaterThan(95);
    expect(xs[3]).toBeLessThan(55);
  });

  it('skips contours without points and operations without a contour', () => {
    const { moves, problems } = toolpaths(
      [{ closed: false, points: [] }],
      [
        { contour: 0, kind: 'on' },
        { contour: 5, kind: 'on' },
      ],
      s,
    );
    expect(moves).toEqual([]);
    expect(problems).toEqual([]);
  });
});

describe('holding tabs', () => {
  it('stand at fixed places of the drawn contour', () => {
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    expect(tabPoints(rectangle(0, 0, 100, 50).points, 4).map((p) => [r3(p.x), r3(p.y)])).toEqual([
      [37.5, 0],
      [100, 12.5],
      [62.5, 50],
      [0, 37.5],
    ]);
  });

  it('lie where they were put, wherever the cut happens to begin', () => {
    const part = rectangle(0, 0, 100, 50);
    const tabs = { count: 4, width: 8, height: 2 };
    const lifted = (before: Contour[]) => {
      const contours = [...before, part];
      const ops: Operation[] = [
        ...before.map((_, i) => ({ contour: i, kind: 'drill' as const })),
        { contour: before.length, kind: 'outside', tabs },
      ];
      // Where the cutter crosses a tab: the stretches cut at the tabs' height.
      return cutting(toolpaths(contours, ops, s).moves)
        .filter((m) => Math.abs(m.z! - -4) < 1e-9)
        .map((m) => [Math.round(m.x! * 100) / 100, Math.round(m.y! * 100) / 100])
        .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    };
    // Each tab is 8 mm plus the cutter: 14 mm of path, ending 7 mm behind the tab's middle.
    const fromZero = lifted([]);
    expect(fromZero).toEqual([
      [-3, 30.5],
      [44.5, -3],
      [55.5, 53],
      [103, 19.5],
    ]);
    // Coming from a hole at the far corner, the loop starts elsewhere – the tabs do not move.
    expect(lifted([circle(120, 70, 6)])).toEqual(fromZero);
  });

  it('may lie across the point where the loop begins', () => {
    // Drawn from the middle of the lower edge; the cut starts at the corner 0, 0.
    const loop: Contour = {
      closed: true,
      points: [
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
        { x: 0, y: 0 },
      ],
    };
    // Two tabs of 54 mm (60 with the cutter): around 100, 25 and around 0, 25.
    const tabs = { count: 2, width: 54, height: 2 };
    const { moves } = toolpaths([loop], [{ contour: 0, kind: 'on', tabs }], s);
    const high = cutting(moves).filter((m) => Math.abs(m.z! - -4) < 1e-9);
    // The tab at 0, 25 reaches 5 mm round the corner where the loop starts and ends.
    expect(high.some((m) => at(m, 5, 0))).toBe(true);
    expect(high.some((m) => at(m, 0, 50))).toBe(true);
    expect(high.some((m) => at(m, 0, 0))).toBe(true);
    // Beyond the tab the cut is at full depth again.
    const deep = cutting(moves).filter((m) => m.z === -6);
    expect(deep.some((m) => at(m, 50, 0))).toBe(true);
    // A point drawn twice does not confuse the places of the tabs.
    const doubled = { ...loop, points: [loop.points[0]!, ...loop.points] };
    const again = toolpaths([doubled], [{ contour: 0, kind: 'on', tabs }], s);
    expect(cutting(again.moves).filter((m) => Math.abs(m.z! - -4) < 1e-9)).toEqual(high);
    // No tabs at all when their count is zero.
    const none = toolpaths([loop], [{ contour: 0, kind: 'on', tabs: { ...tabs, count: 0 } }], s);
    expect(cutting(none.moves).some((m) => Math.abs(m.z! - -4) < 1e-9)).toBe(false);
  });

  it('lift the cutter over their whole width where the walk begins inside a tab', () => {
    // One pass of 6; the tab, 0.3 mm before the start of the loop at 0, 0 (u 0.999 of 300 round, on
    // the left side going down): 8 wide plus the cutter is 7 mm to either side of 0, 0.3.
    const one = { ...s, depth: 6, stepdown: 6 };
    const part = rectangle(0, 0, 100, 50);
    const tabs = { count: 0, width: 8, height: 2, at: [0.999] };
    const { moves } = toolpaths([part], [{ contour: 0, kind: 'on', tabs }], one);
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    const way = cutting(moves).map((m) => [r(m.x!), r(m.y!), m.z]);
    // It begins at the height of the tab (−4) and keeps it 6.7 mm along the lower side – 7 behind
    // the tab's middle, which lies 0.3 before the start – and only there goes down to −6 …
    expect(moves.find((m) => m.x === undefined && m.z === -4)).toBeDefined();
    expect(way[0]).toEqual([6.7, 0, -4]);
    expect(moves[moves.indexOf(cutting(moves)[0]!) + 1]).toEqual({ z: -6, feed: 300 });
    // … round the part at full depth, and lifts again 7.3 before the start: the tab's other side.
    expect(way.slice(1)).toEqual([
      [100, 0, -6],
      [100, 50, -6],
      [0, 50, -6],
      [0, 7.3, -6],
      [0, 0, -4],
    ]);
    // 6.7 + 7.3 = 14 mm of the path are lifted: the tab's 8 and the cutter's 6.
  });
});

describe('the places of the tabs', () => {
  // 100 × 50, drawn from 0/0 to the right: the way along it is 0–100 below, 100–150 right,
  // 150–250 above (towards the left) and 250–300 on the left (downwards).
  const plate = rectangle(0, 0, 100, 50);
  // To nine decimals, and never −0
  const r9 = (v: number) => Math.round(v * 1e9) / 1e9 + 0;
  const where = (c: Contour, tabs: { count: number; at?: number[] }) =>
    tabSites(c, tabs).map((t) => [t.u, t.point.x, t.point.y, t.tangent.x, t.tangent.y].map(r9));
  const us = (c: Contour, at: number[]) => tabSites(c, { count: 1, at }).map((t) => r9(t.u));

  it('spreads count tabs evenly, each in the middle of its share, with the way the line runs', () => {
    expect(where(plate, { count: 4 })).toEqual([
      [0.125, 37.5, 0, 1, 0],
      [0.375, 100, 12.5, 0, 1],
      [0.625, 62.5, 50, -1, 0],
      [0.875, 0, 37.5, 0, -1],
    ]);
    // One tab sits in the middle of the whole line: 150 along, the corner at 100/50.
    expect(where(plate, { count: 1 })).toEqual([[0.5, 100, 50, -1, 0]]);
    // `tabPoints` is its places only
    expect(tabPoints(plate.points, 4)).toEqual(tabSites(plate, { count: 4 }).map((t) => t.point));
  });

  it('has none for count 0, for no places, for an open line and for a line of no length', () => {
    expect(tabSites(plate, { count: 0 })).toEqual([]);
    expect(tabSites(plate, { count: 4, at: [] })).toEqual([]);
    expect(tabSites({ ...plate, closed: false }, { count: 4 })).toEqual([]);
    const dot = { x: 5, y: 5 };
    expect(tabSites({ closed: true, points: [dot, dot, dot] }, { count: 4 })).toEqual([]);
    expect(tabSites({ closed: true, points: [dot] }, { count: 4 })).toEqual([]);
    expect(tabSites({ closed: true, points: [] }, { count: 4 })).toEqual([]);
    expect(tabPoints([], 4)).toEqual([]);
  });

  it('puts a tab where it is told: sorted, wrapped round, count ignored', () => {
    // 0.5 is the corner 150 along (100/50), where the next side begins: the way goes on to the left.
    expect(where(plate, { count: 9, at: [0.5, 0.1] })).toEqual([
      [0.1, 30, 0, 1, 0],
      [0.5, 100, 50, -1, 0],
    ]);
    // 1.25, −0.25 and 1 are 0.25, 0.75 and 0: one lap, three places.
    expect(where(plate, { count: 1, at: [1.25, -0.25, 1] })).toEqual([
      [0, 0, 0, 1, 0],
      [0.25, 75, 0, 1, 0],
      [0.75, 25, 50, -1, 0],
    ]);
    // A hair below the start is the start, not the end; −0 is 0.
    expect(us(plate, [-1e-20, -0])).toEqual([0]);
    // What is no number is no place.
    expect(where(plate, { count: 1, at: [Number.NaN, Infinity, 0.25] })).toEqual([
      [0.25, 75, 0, 1, 0],
    ]);
  });

  it('takes places that lie together as one – also across the start of the line', () => {
    expect(us(plate, [0.3, 0.3 + 1e-10, 0.6])).toEqual([0.3, 0.6]);
    // Just beyond the start and just before the end of the line: the same place (the first stays).
    expect(tabSites(plate, { count: 1, at: [1e-10, 0.5, 1 - 1e-10] }).map((t) => t.u)).toEqual([
      1e-10, 0.5,
    ]);
    // Far enough apart are two.
    expect(tabSites(plate, { count: 1, at: [0.3, 0.3 + 1e-6] })).toHaveLength(2);
    // A single place is never taken for its own twin.
    expect(tabSites(plate, { count: 1, at: [0.5] })).toHaveLength(1);
  });

  it('is not confused by a point drawn twice, at the end or in between', () => {
    const [a, b, c, d] = plate.points as [Point, Point, Point, Point];
    const closing = { closed: true, points: [a, b, c, d, a] };
    expect(where(closing, { count: 4 })).toEqual(where(plate, { count: 4 }));
    // A square of 400: the corner 100/0 drawn twice lies exactly 100 along – the way goes on
    // up the right side, never along a segment of no length.
    const twice: Contour = {
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    };
    expect(where(twice, { count: 1, at: [0.25, 0.125] })).toEqual([
      [0.125, 50, 0, 1, 0],
      [0.25, 100, 0, 0, 1],
    ]);
  });

  it('follows a circle by its polygon: four tabs a quarter turn apart, from the first point', () => {
    const round = circle(0, 0, 20);
    const sites = tabSites(round, { count: 4 });
    // The polygon starts at 0° and runs counter-clockwise: 45°, 135°, 225°, 315° – to a chord's width.
    expect(sites).toHaveLength(4);
    sites.forEach((site, k) => {
      const angle = ((45 + 90 * k) * Math.PI) / 180;
      expect(site.point.x).toBeCloseTo(10 * Math.cos(angle), 1);
      expect(site.point.y).toBeCloseTo(10 * Math.sin(angle), 1);
      // The line runs counter-clockwise: across the radius, a quarter turn ahead of it.
      expect(site.tangent.x).toBeCloseTo(-Math.sin(angle), 1);
      expect(site.tangent.y).toBeCloseTo(Math.cos(angle), 1);
    });
  });

  it('turns a point into the nearest place on the line', () => {
    const near = (p: Point) => {
      const n = nearestOnContour(plate, p)!;
      return [n.u, n.point.x, n.point.y, n.distance].map(r9);
    };
    // 30 along the lower side, 5 below it.
    expect(near({ x: 30, y: -5 })).toEqual([0.1, 30, 0, 5]);
    // Inside the part, nearer to the right side (10 away) than to the upper (25).
    expect(near({ x: 90, y: 25 })).toEqual([r9(125 / 300), 100, 25, 10]);
    // Beside the start corner: the start itself (a tie goes to the first side).
    expect(near({ x: -3, y: -4 })).toEqual([0, 0, 0, 5]);
    // On the last side, 3 above the start: 297 along.
    expect(near({ x: -5, y: 3 })).toEqual([r9(297 / 300), 0, 3, 5]);
    // A point drawn twice at the end does not matter.
    const [a, b, c, d] = plate.points as [Point, Point, Point, Point];
    const closing = nearestOnContour({ closed: true, points: [a, b, c, d, a] }, { x: 30, y: -5 })!;
    expect(r9(closing.u)).toBe(0.1);
    expect(closing.point).toEqual({ x: 30, y: 0 });
    // And the place it names is the place a tab put there stands at.
    const n = nearestOnContour(plate, { x: 62, y: 70 })!;
    const there = tabSites(plate, { count: 0, at: [n.u] })[0]!.point;
    expect(r9(there.x)).toBe(62);
    expect(r9(there.y)).toBe(50);
  });

  it('has no place on a line without points, and the point itself on one of no length', () => {
    expect(nearestOnContour({ closed: true, points: [] }, { x: 1, y: 1 })).toBeNull();
    const dot = { x: 5, y: 5 };
    expect(nearestOnContour({ closed: true, points: [dot, dot] }, { x: 8, y: 9 })).toEqual({
      u: 0,
      point: dot,
      distance: 5,
    });
  });

  it('draws the stretch a tab covers, round corners and across the start', () => {
    const square = rectangle(0, 0, 100, 100);
    // A straight stretch: 10 mm of the lower side around 37.5.
    expect(contourSpan(plate, 0.125, 10)).toEqual([
      { x: 32.5, y: 0 },
      { x: 42.5, y: 0 },
    ]);
    // Across the corner 100/0, 100 along: 10 mm to either side, the corner in between.
    expect(contourSpan(square, 0.25, 20)).toEqual([
      { x: 90, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 10 },
    ]);
    // Across the start of the line.
    expect(contourSpan(square, 0, 20)).toEqual([
      { x: 0, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    // Wider than the whole line it is the whole line, once round.
    expect(contourSpan(square, 0, 1000)).toEqual([
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    // No width, no stretch: both ends at the place.
    expect(contourSpan(plate, 0.125, -4)).toEqual([
      { x: 37.5, y: 0 },
      { x: 37.5, y: 0 },
    ]);
    // Open or of no length: nothing.
    expect(contourSpan({ ...plate, closed: false }, 0.5, 10)).toEqual([]);
    expect(contourSpan({ closed: true, points: [{ x: 1, y: 1 }] }, 0.5, 10)).toEqual([]);
  });

  it('cuts where it is told: only the places named lift the cutter', () => {
    // 30 along the lower side and 180 along the whole line: 70 along the upper side, from the right.
    const tabs = { count: 4, width: 8, height: 2, at: [0.1, 0.6] };
    const { moves } = toolpaths([plate], [{ contour: 0, kind: 'outside', tabs }], s);
    const high = cutting(moves)
      .filter((m) => Math.abs(m.z! - -4) < 1e-9)
      .map((m) => [Math.round(m.x! * 100) / 100, Math.round(m.y! * 100) / 100])
      .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    // Each tab is 8 mm plus the cutter: 14 mm of path, ending 7 behind the tab's middle – on the
    // lower side towards +x (the cutter is 3 below the line), on the upper one towards −x.
    expect(high).toEqual([
      [37, -3],
      [63, 53],
    ]);
    // The even spread's tab at 37.5 is not there.
    expect(high.some(([x, y]) => x === 44.5 && y === -3)).toBe(false);
    // Four tabs by `count` and by the same places named are one program.
    const spread = { count: 4, width: 8, height: 2 };
    const named = { ...spread, at: tabSites(plate, spread).map((t) => t.u) };
    const code = (t: typeof spread) =>
      toGcode(toolpaths([plate], [{ contour: 0, kind: 'outside', tabs: t }], s).moves, {
        name: 'x',
        rpm: 1000,
        safeZ: 5,
      });
    expect(code(named)).toBe(code(spread));
    // Named but empty: a program without any tab.
    const none = toolpaths(
      [plate],
      [{ contour: 0, kind: 'outside', tabs: { ...tabs, at: [] } }],
      s,
    );
    const bare = toolpaths([plate], [{ contour: 0, kind: 'outside' }], s);
    expect(none.moves).toEqual(bare.moves);
  });

  describe('of a hole whose cut falls into two loops', () => {
    // Two lobes of 40 × 40 joined by a neck 4 wide: the cutter, 6 across, goes round each lobe
    // separately (3 inside the line) and cannot enter the neck. 352 mm round, from the lower left.
    const dumbbell: Contour = {
      closed: true,
      points: [
        [0, 0],
        [40, 0],
        [40, 18],
        [60, 18],
        [60, 0],
        [100, 0],
        [100, 40],
        [60, 40],
        [60, 22],
        [40, 22],
        [40, 40],
        [0, 40],
      ].map(([x, y]) => ({ x: x!, y: y! })),
    };
    const one = { ...s, depth: 6, stepdown: 6 };
    /** The stretches cut at the tabs' height (−4): from x, y to x, y, in mm to 0.01 */
    const stretches = (tabs: { count: number; at?: number[] }) => {
      const { moves, problems } = toolpaths(
        [dumbbell],
        [{ contour: 0, kind: 'inside', tabs: { width: 8, height: 2, ...tabs } }],
        one,
      );
      expect(problems).toEqual([]);
      const out: number[][] = [];
      let from: number[] = [];
      let x = 0;
      let y = 0;
      let z = 0;
      for (const m of moves) {
        const was = z;
        x = m.x ?? x;
        y = m.y ?? y;
        z = m.z ?? z;
        if (z === -4 && was !== -4) from = [x, y];
        else if (was === -4 && z !== -4)
          out.push([...from, x, y].map((v) => Math.round(v * 100) / 100));
      }
      return out;
    };

    it('stand on the lobe they were put on, and only there', () => {
      // 88 mm along is 8 up the wall of the neck (60, 8), 264 mm is 10 up the lobe's side at (40, 32).
      const told = stretches({ count: 0, at: [0.25, 0.75] });
      // Left lobe: 7 either side of 37, 32 – up 5 to the corner, 2 along the top, and 7 down.
      expect(told.filter(([x]) => x! < 40)).toEqual([[35, 37, 37, 25]]);
      // Right lobe: 7 either side of 63, 8 – 5 down to the corner of 63, 3 and on 2 along the bottom
      // (the walk begins at that corner: the stretch is in two pieces) – nothing more.
      expect(told.filter(([x]) => x! > 60)).toEqual([
        [63, 3, 63, 15],
        [65, 3, 63, 3],
      ]);
      // The same two places spread by count (88 and 264 mm along): every loop keeps every place, each
      // at its nearest – as it always did. The left lobe also has a tab at 37, 8 (nearest to 60, 8:
      // 7 up the side, 5 down it to the corner and 2 along the bottom), the right one at 63, 32
      // (nearest to 40, 32: 7 down the side, 5 up it to the corner and 2 along the top).
      const spread = stretches({ count: 2 });
      expect(spread.filter(([x]) => x! < 40)).toEqual([
        [37, 3, 35, 3],
        [35, 37, 37, 25],
        [37, 15, 37, 3],
      ]);
      expect(spread.filter(([x]) => x! > 60)).toEqual([
        [63, 3, 63, 15],
        [63, 25, 65, 37],
        [65, 3, 63, 3],
      ]);
    });

    it('are not lost: a lobe none of them is nearest to takes the nearest one', () => {
      // One tab at 0, 17.6 on the left: the right lobe is cut free as well – with a tab of its own,
      // as before, on its side towards the neck.
      const told = stretches({ count: 0, at: [0.95] });
      expect(told.filter(([x]) => x! < 40)).toEqual([[3, 10.6, 3, 24.6]]);
      expect(told.filter(([x]) => x! > 60)).toHaveLength(1);
      // Two on the left (the second 4.8 below the top: 0, 35.2), none nearest to the right lobe: it
      // takes one all the same – the one nearer to it, as with the single place – and the left lobe
      // keeps both: 7 either side of 3, 17.6, and from 3, 28.2 up to the corner and 5.2 along the top.
      const both = stretches({ count: 0, at: [0.9, 0.95] });
      expect(both.filter(([x]) => x! < 40)).toEqual([
        [3, 10.6, 3, 24.6],
        [3, 28.2, 8.2, 37],
      ]);
      expect(both.filter(([x]) => x! > 60)).toEqual(told.filter(([x]) => x! > 60));
      // The same place by count is the same program, for one place there is nothing to divide.
      expect(stretches({ count: 1 })).toEqual(stretches({ count: 0, at: [0.5] }));
      expect(stretches({ count: 1 })).toHaveLength(2);
      // The same place named twice is one place.
      expect(stretches({ count: 0, at: [0.5, 0.5] })).toEqual(stretches({ count: 1 }));
    });
  });

  it('keeps tabs off an open line and off a contour of no length', () => {
    const open = { closed: false, points: [...plate.points] };
    const tabs = { count: 4, width: 8, height: 2 };
    const a = toolpaths([open], [{ contour: 0, kind: 'on', tabs }], s);
    const b = toolpaths([open], [{ contour: 0, kind: 'on' }], s);
    expect(a.moves).toEqual(b.moves);
  });
});

describe('relief of inside corners', () => {
  const slotHole = rectangle(0, 0, 40, 20);
  const d = 3 / Math.SQRT2;

  it('runs into every corner of a cut-out and back, at full depth', () => {
    const { moves } = toolpaths([slotHole], [{ contour: 0, kind: 'inside', relief: 'dogbone' }], s);
    const cut = cutting(moves);
    for (const [x, y] of [
      [d, d],
      [40 - d, d],
      [40 - d, 20 - d],
      [d, 20 - d],
    ] as const) {
      const visits = cut.filter((m) => at(m, x, y));
      // Once on each of the two passes (stepdown 3 of 6).
      expect(visits.length).toBe(2);
      const i = moves.indexOf(visits.at(-1)!);
      // Out of the corner the same way: back to where the path turns, 3 mm from both walls.
      expect(at(moves[i + 1]!, x < 20 ? 3 : 37, y < 10 ? 3 : 17)).toBe(true);
      expect(at(moves[i - 1]!, x < 20 ? 3 : 37, y < 10 ? 3 : 17)).toBe(true);
    }
    // The detours are cut at the depth of their pass; the deepest is the full depth.
    const depthAt = moves.filter((m) => at(m, d, d)).map((m) => moves[moves.indexOf(m) - 1]!.z);
    expect(depthAt).toEqual([-3, -6]);
    // Nowhere else does the cutter come closer to a wall than its radius.
    const others = cut.filter((m) => Math.min(m.x!, 40 - m.x!, m.y!, 20 - m.y!) < 3 - 1e-3);
    expect(others).toHaveLength(8);
    // Without relief the path is the plain rectangle 3 mm inside.
    const plain = toolpaths([slotHole], [{ contour: 0, kind: 'inside' }], s);
    expect(cutting(plain.moves).every((m) => m.x! >= 3 - 1e-3 && m.y! >= 3 - 1e-3)).toBe(true);
  });

  it('keeps the tabs when corners are relieved', () => {
    const tabs = { count: 2, width: 6, height: 2 };
    const { moves } = toolpaths(
      [slotHole],
      [{ contour: 0, kind: 'inside', relief: 'tbone', tabs }],
      s,
    );
    // T-bones along the long edges: the cutter stands over the short walls at y = 3 and 17.
    for (const [x, y] of [
      [0, 3],
      [40, 3],
      [40, 17],
      [0, 17],
    ] as const) {
      expect(cutting(moves).some((m) => at(m, x, y) || at(m, x, y))).toBe(true);
    }
    // Two tabs (in the middle of the long sides): lifted to 2 mm above the bottom twice.
    const lifts = moves.filter((m) => m.x === undefined && m.feed === 300 && m.z === -4);
    expect(lifts).toHaveLength(2);
    const high = cutting(moves).filter((m) => Math.abs(m.z! - -4) < 1e-9);
    expect(high.map((m) => Math.round(m.y!)).sort()).toEqual([17, 3]);
  });

  it('frees the notch of an outline cut outside, and the corners of a pocket', () => {
    const l: Contour = {
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 20, y: 20 },
        { x: 20, y: 40 },
        { x: 0, y: 40 },
      ],
    };
    const outside = toolpaths([l], [{ contour: 0, kind: 'outside', relief: 'dogbone' }], s);
    expect(cutting(outside.moves).filter((m) => at(m, 20 + d, 20 + d))).toHaveLength(2);
    // The five outer corners need nothing: the cutter goes round them.
    expect(cutting(outside.moves).filter((m) => at(m, d, d))).toHaveLength(0);

    const pocket = toolpaths([slotHole], [{ contour: 0, kind: 'pocket', relief: 'dogbone' }], s);
    const cut = cutting(pocket.moves);
    expect(cut.filter((m) => at(m, d, d))).toHaveLength(2);
    expect(cut.filter((m) => at(m, 40 - d, 20 - d))).toHaveLength(2);
    // Only the ring along the wall goes into the corners: four corners, two passes.
    expect(cut.filter((m) => Math.min(m.x!, 40 - m.x!, m.y!, 20 - m.y!) < 3 - 1e-3)).toHaveLength(
      8,
    );
  });

  it('skips a corner the cutter never comes near', () => {
    // A keyhole: the narrow neck (4 mm) is closed to a 6 mm cutter, its corners stay as they are.
    const keyhole: Contour = {
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
        { x: 17, y: 30 },
        { x: 17, y: 40 },
        { x: 13, y: 40 },
        { x: 13, y: 30 },
        { x: 0, y: 30 },
      ],
    };
    const { moves, problems } = toolpaths(
      [keyhole],
      [{ contour: 0, kind: 'inside', relief: 'dogbone' }],
      s,
    );
    expect(problems).toEqual([]);
    const cut = cutting(moves);
    expect(cut.some((m) => at(m, d, d))).toBe(true);
    expect(cut.some((m) => at(m, 30 - d, 30 - d))).toBe(true);
    // Nothing reaches up into the neck.
    expect(cut.every((m) => m.y! <= 30 - d + 1e-3)).toBe(true);
  });
});

describe('finishing allowance', () => {
  const rough = { ...s, allowance: 0.5 };

  it('roughs an outline with the allowance and finishes it in one pass at full depth', () => {
    const part = rectangle(0, 0, 100, 50);
    const { moves } = toolpaths([part], [{ contour: 0, kind: 'outside' }], rough);
    const cut = cutting(moves);
    const left = (x: number) => cut.filter((m) => Math.abs(m.x! - x) < 1e-3);
    // Roughing 3.5 mm beside the part on both passes, finishing at 3 mm on the last depth only.
    expect([...new Set(left(-3.5).map((m) => m.z))]).toEqual([-3, -6]);
    expect([...new Set(left(-3).map((m) => m.z))]).toEqual([-6]);
    expect(Math.min(...cut.map((m) => m.x!))).toBeCloseTo(-3.5);
    // Roughing comes first.
    expect(cut.indexOf(left(-3.5)[0]!)).toBeLessThan(cut.indexOf(left(-3)[0]!));
    // Same direction for both: climb, counter-clockwise outside.
    const turn = (x: number) => {
      const i = cut.indexOf(left(x)[0]!);
      return Math.sign(signedArea(cut.slice(i, i + 30).map((m) => ({ x: m.x!, y: m.y! }))));
    };
    expect(turn(-3.5)).toBe(1);
    expect(turn(-3)).toBe(1);
  });

  it('roughs a cut-out towards the inside and keeps the tabs in the same places', () => {
    const hole = rectangle(0, 0, 100, 50);
    const tabs = { count: 4, width: 8, height: 2 };
    const { moves } = toolpaths([hole], [{ contour: 0, kind: 'inside', tabs }], rough);
    const cut = cutting(moves);
    expect(Math.min(...cut.map((m) => m.x!))).toBeCloseTo(3);
    // The stretches over the tabs: four while roughing, the same four while finishing.
    const high = cut.filter((m) => Math.abs(m.z! - -4) < 1e-9);
    expect(high).toHaveLength(8);
    const ends = high.map((m) => [Math.round(m.x!), Math.round(m.y!)]);
    // Clockwise inside: over the tab at 37.5 on the lower edge the cutter leaves at 37.5 − 7.
    expect(ends).toContainEqual([31, 4]);
    expect(ends).toContainEqual([31, 3]);
    expect(ends).toContainEqual([4, 45]);
    expect(ends).toContainEqual([3, 45]);
  });

  it('finishes in all passes when there is no room to rough', () => {
    // 8 mm wide: the 6 mm cutter fits, with 1.5 mm allowance on both sides it does not.
    const narrow = rectangle(0, 0, 40, 8);
    const { moves, problems } = toolpaths([narrow], [{ contour: 0, kind: 'inside' }], {
      ...s,
      allowance: 1.5,
    });
    expect(problems).toEqual([]);
    const cut = cutting(moves);
    expect([...new Set(cut.map((m) => m.y))].sort()).toEqual([3, 5]);
    expect([...new Set(cut.map((m) => m.z))]).toEqual([-3, -6]);
    const pocket = toolpaths([narrow], [{ contour: 0, kind: 'pocket' }], { ...s, allowance: 1.5 });
    expect([...new Set(cutting(pocket.moves).map((m) => m.z))]).toEqual([-3, -6]);
  });

  it('clears a pocket up to the allowance and finishes its wall, corners included', () => {
    const pocket = rectangle(0, 0, 60, 40);
    const { moves } = toolpaths(
      [pocket],
      [{ contour: 0, kind: 'pocket', relief: 'dogbone' }],
      rough,
    );
    const cut = cutting(moves);
    const wall = cut.filter((m) => Math.abs(m.x! - 3) < 1e-3 && m.z !== undefined);
    expect([...new Set(wall.map((m) => m.z))]).toEqual([-6]);
    const before = cut.filter((m) => Math.abs(m.x! - 3.5) < 1e-3);
    expect([...new Set(before.map((m) => m.z))]).toEqual([-3, -6]);
    expect(cut.indexOf(before.at(-1)!)).toBeLessThan(cut.indexOf(wall[0]!));
    // The corner relief belongs to the finishing pass: once, at full depth.
    const d = 3 / Math.SQRT2;
    expect(cut.filter((m) => at(m, d, d))).toHaveLength(1);
    // A negative allowance counts as none.
    const none = toolpaths([pocket], [{ contour: 0, kind: 'pocket' }], { ...s, allowance: -1 });
    expect(cutting(none.moves)).toEqual(
      cutting(toolpaths([pocket], [{ contour: 0, kind: 'pocket' }], s).moves),
    );
  });
});

describe('engraving text', () => {
  it('follows the strokes at the engraving depth, lifting between them', () => {
    const text = textContours('Li', { height: 10, x: 10, y: 10 });
    const ops: Operation[] = text.contours.map((_, i) => ({ contour: i, kind: 'on', depth: 1 }));
    const { moves, problems } = toolpaths(text.contours, ops, s);
    expect(problems).toEqual([]);
    // L, the stem of the i, its dot: three plunges to 1 mm, nothing deeper.
    expect(moves.filter((m) => m.feed === 300).map((m) => m.z)).toEqual([-1, -1, -1]);
    expect(lowest(moves)).toBe(-1);
    // The L is entered at its foot, the end nearer to the work zero, and left at its top;
    // nearest from there is the dot of the i, then its stem.
    expect(starts(moves)).toEqual([
      [15, 10],
      [17, 19.8],
      [17, 17],
    ]);
    const code = toGcode(moves, { name: 'text', rpm: 18000, safeZ: 5 });
    expect(code).toContain('G1 Z-1 F300\nX10 F1200\nY20\n');
  });
});

describe('G-code', () => {
  it('writes a complete program without repeated words', () => {
    const { moves } = toolpaths([circle(0, 0, 20)], [{ contour: 0, kind: 'drill' }], s);
    const ccwCode = toGcode(
      toolpaths([circle(0, 0, 20)], [{ contour: 0, kind: 'drill' }], { ...s, climb: false }).moves,
      { name: 'x', rpm: 1, safeZ: 5 },
    );
    expect(ccwCode).toContain('G3 X7');
    const code = toGcode(
      [
        ...moves,
        { x: 1, y: 1, feed: 500 },
        { x: 2, feed: 500 },
        { feed: 500 },
        { z: -0.0001, feed: null },
      ],
      { name: 'Platte (Test)', rpm: 18000, safeZ: 5 },
    );
    const lines = code.split('\n');
    expect(lines.slice(0, 4)).toEqual([
      '(LowRider Control CAM: Platte Test)',
      'G21 G90 G17 G94',
      'G0 Z5',
      'M3 S18000',
    ]);
    expect(lines.slice(-4)).toEqual(['G0 Z5', 'M5', 'M30', '']);
    expect(code).toMatch(/G2 X7 Y0 Z-\d/);
    expect(code).toContain('I-7 J0');
    expect(code).toContain('G1 X1 Y1 F500');
    expect(code).toContain('\nX2\n');
    expect(code).toContain('G0 Z0\n');
  });
});
