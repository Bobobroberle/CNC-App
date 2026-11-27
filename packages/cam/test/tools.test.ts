import { describe, expect, it } from 'vitest';
import {
  circle,
  defaultOperations,
  rectangle,
  toGcode,
  toolpaths,
  type Contour,
  type CutSettings,
  type Move,
  type Operation,
  type ToolSettings,
} from '../src';
import { twoToolSign } from './toolsFixture';

/**
 * Programs with several tools: every measure of an operation from its own cutter, one order for all the cutters
 * together (the rank and what lies inside a contour keep ruling), the tool changes as blocks, and the program text
 * with its header and its changes. A one-tool program is not looked at here: the goldens and every older test
 * hold that it did not change.
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
/** T1, an end mill of 6 mm, and T2, a V-bit taken as a cutter of 3 mm that engraves 0.8 mm deep */
const mill: ToolSettings = { number: 1, name: 'End mill 6', cut: cut() };
const vbit: ToolSettings = {
  number: 2,
  name: 'V-bit',
  rpm: 12000,
  cut: cut({ toolDiameter: 3, depth: 0.8, feed: 600, plungeFeed: 150 }),
};
const two = [mill, vbit];

const line = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  closed: false,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ],
});
const square = (x: number, y: number, size: number) => rectangle(x, y, size, size);
const order = (r: { cuts: { op: number }[] }) => r.cuts.map((c) => c.op);

/** The moves of one operation in a program */
const movesOf = (
  r: { moves: Move[]; cuts: { op: number; start: number; end: number }[] },
  op: number,
) => {
  const span = r.cuts.find((c) => c.op === op)!;
  return r.moves.slice(span.start, span.end);
};
/** The extent of the cutting moves (those with a feed that go somewhere in the plane), rounded to a micrometre */
const extent = (moves: Move[]) => {
  const xs = moves.filter((m) => m.feed !== null && m.x !== undefined).map((m) => m.x!);
  const ys = moves.filter((m) => m.feed !== null && m.y !== undefined).map((m) => m.y!);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    minX: r(Math.min(...xs)),
    maxX: r(Math.max(...xs)),
    minY: r(Math.min(...ys)),
    maxY: r(Math.max(...ys)),
  };
};

describe('every operation cuts with its own cutter', () => {
  it('offsets an outline and a cut-out by the radius of the cutter that cuts it', () => {
    // 20 mm squares: outside by the radius (3 and 1.5), inside by the radius from the other side
    const contours = [
      square(0, 0, 20),
      square(100, 0, 20),
      square(0, 100, 20),
      square(100, 100, 20),
    ];
    const ops: Operation[] = [
      { contour: 0, kind: 'outside', tool: 0 },
      { contour: 1, kind: 'outside', tool: 1 },
      { contour: 2, kind: 'inside', tool: 0 },
      { contour: 3, kind: 'inside', tool: 1 },
    ];
    const r = toolpaths(contours, ops, two);
    expect(r.problems).toEqual([]);
    expect(extent(movesOf(r, 0))).toEqual({ minX: -3, maxX: 23, minY: -3, maxY: 23 });
    expect(extent(movesOf(r, 1))).toEqual({ minX: 98.5, maxX: 121.5, minY: -1.5, maxY: 21.5 });
    expect(extent(movesOf(r, 2))).toEqual({ minX: 3, maxX: 17, minY: 103, maxY: 117 });
    expect(extent(movesOf(r, 3))).toEqual({ minX: 101.5, maxX: 118.5, minY: 101.5, maxY: 118.5 });
  });

  it('says "tool too large" for the cutter that does not fit and cuts the one that does', () => {
    // A 5 mm square: the 3 mm cutter has 2 × 2 mm left, the 6 mm cutter none
    const contours = [square(0, 0, 5), square(50, 0, 5)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'inside', tool: 0 },
        { contour: 1, kind: 'inside', tool: 1 },
      ],
      two,
    );
    expect(r.problems).toEqual([{ contour: 0, code: 'tool-too-large' }]);
    expect(extent(movesOf(r, 1))).toEqual({ minX: 51.5, maxX: 53.5, minY: 1.5, maxY: 3.5 });
    expect(movesOf(r, 0)).toEqual([]);
  });

  it('spaces the rings of a pocket by the stepover of its own cutter', () => {
    // A pocket of 30 × 30. 6 mm, half a diameter apart: rings 3, 6, 9, 12 from the wall (the next one is
    // nothing). 3 mm: 1.5 apart, rings 1.5 … 13.5 (nine of them)
    const contours = [square(0, 0, 30), square(100, 0, 30)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'pocket', tool: 0 },
        { contour: 1, kind: 'pocket', tool: 1 },
      ],
      two,
    );
    expect(r.problems).toEqual([]);
    const insets = (op: number, x0: number) =>
      [
        ...new Set(
          movesOf(r, op)
            .filter((m) => m.feed !== null && m.x !== undefined)
            .map((m) => Math.round((m.x! - x0) * 1000) / 1000),
        ),
      ]
        .filter((x) => x <= 15)
        .sort((a, b) => a - b);
    expect(insets(0, 0)).toEqual([3, 6, 9, 12]);
    expect(insets(1, 100)).toEqual([1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5]);
  });

  it('bores the helix of a pocket by the cutter that enters it', () => {
    // The hole is 1.5 cutters wide (at least the cutter + 0.5, at most twice it): 9 mm for the 6 mm cutter, its
    // path a circle of 1.5 mm radius; 4.5 mm for the 3 mm cutter, 0.75 mm radius
    const contours = [square(0, 0, 30), square(100, 0, 30)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'pocket', entry: 'helix', tool: 0 },
        { contour: 1, kind: 'pocket', entry: 'helix', tool: 1 },
      ],
      two,
    );
    expect(r.problems).toEqual([]);
    const radii = (op: number) => [
      ...new Set(
        movesOf(r, op)
          .filter((m) => m.arc)
          .map((m) => -m.arc!.i),
      ),
    ];
    expect(radii(0)).toEqual([1.5]);
    expect(radii(1)).toEqual([0.75]);
  });

  it('lifts the cutter over a tab as wide as the tab plus its own diameter', () => {
    // Two tabs of 4 mm on each plate (on the long sides, away from the corners): the cutter lifts over 4 + 6 = 10
    // mm of its loop with the 6 mm cutter and over 4 + 3 = 7 mm with the 3 mm one
    const tabs = { count: 2, width: 4, height: 1 };
    const contours = [rectangle(0, 0, 100, 40), rectangle(0, 100, 100, 40)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'outside', tabs, tool: 0 },
        { contour: 1, kind: 'outside', tabs, tool: 1 },
      ],
      [mill, { ...vbit, cut: cut({ toolDiameter: 3 }) }],
    );
    expect(r.problems).toEqual([]);
    /** The way the cutter goes along at the top of the tabs (5 mm above the bottom: 6 deep, 1 high) */
    const lifted = (op: number) => {
      let x = 0;
      let y = 0;
      let z = 5;
      let sum = 0;
      for (const m of movesOf(r, op)) {
        const nx = m.x ?? x;
        const ny = m.y ?? y;
        const nz = m.z ?? z;
        if (m.feed !== null && z === -5 && nz === -5) sum += Math.hypot(nx - x, ny - y);
        x = nx;
        y = ny;
        z = nz;
      }
      return Math.round(sum * 1000) / 1000;
    };
    expect(lifted(0)).toBe(20);
    expect(lifted(1)).toBe(14);
  });

  it('drills a hole the cutter fits and bores one it does not, each by its own radius', () => {
    // Two holes of 8 mm. The 8 mm cutter drills straight down; the 6 mm cutter bores it on a helix whose
    // path has a radius of 4 − 3 = 1 mm
    const eight: ToolSettings = { number: 3, name: 'Drill 8', cut: cut({ toolDiameter: 8 }) };
    const contours = [circle(10, 10, 8), circle(50, 10, 8)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'drill', tool: 1 },
        { contour: 1, kind: 'drill', tool: 0 },
      ],
      [mill, eight],
    );
    expect(r.problems).toEqual([]);
    expect(movesOf(r, 0).some((m) => m.arc)).toBe(false);
    expect(movesOf(r, 0).filter((m) => m.x !== undefined)).toEqual([{ x: 10, y: 10, feed: null }]);
    expect(movesOf(r, 1).some((m) => m.arc)).toBe(true);
    expect(
      new Set(
        movesOf(r, 1)
          .filter((m) => m.arc)
          .map((m) => -m.arc!.i),
      ),
    ).toEqual(new Set([1]));
  });

  it('takes the feeds and the depth of the cutter, and an operation that names its own depth keeps it', () => {
    // Engraved lines. The V-bit cuts 0.8 deep in one pass at 150 down and 600 along; the end mill 6 deep in two
    // passes (stepdown 3) at 300 and 1200; the operation that says 0.4 gets 0.4 from the V-bit
    const contours = [line(0, 0, 20, 0), line(0, 10, 20, 10), line(0, 20, 20, 20)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'on', tool: 1 },
        { contour: 1, kind: 'on', tool: 1, depth: 0.4 },
        { contour: 2, kind: 'on', tool: 0 },
      ],
      two,
    );
    const depthOf = (op: number) => Math.min(...movesOf(r, op).map((m) => m.z ?? 0));
    const feedsOf = (op: number) =>
      movesOf(r, op).flatMap((m) => (m.feed === null ? [] : [m.feed]));
    expect(depthOf(0)).toBe(-0.8);
    expect(depthOf(1)).toBe(-0.4);
    expect(depthOf(2)).toBe(-6);
    expect(feedsOf(0)).toEqual([150, 600]);
    expect(feedsOf(1)).toEqual([150, 600]);
    expect(feedsOf(2)).toEqual([300, 1200, 300, 1200]);
  });

  it('plans a diameter for each contour', () => {
    // The part and three holes of 6 mm, each hole with the cutter that is to cut it: 6 mm drills it (a hole up to
    // 1.2 times the cutter), 3 mm would have to bore it (a cut-out), and a diameter that is missing drills nothing
    const part = square(0, 0, 100);
    const holes = [circle(10, 10, 6), circle(30, 10, 6), circle(50, 10, 6)];
    const tabs = { count: 2, width: 3, height: 1 };
    const kinds = (diameter: number | number[]) =>
      defaultOperations([part, ...holes], diameter, tabs).map((o) => o.kind);
    expect(kinds([6, 6, 3, 0])).toEqual(['outside', 'drill', 'inside', 'inside']);
    expect(kinds([6, 6])).toEqual(['outside', 'drill', 'inside', 'inside']);
    expect(kinds([0, 7.2, 4.9, 6])).toEqual(['outside', 'drill', 'inside', 'drill']);
    // One number for all, as ever
    expect(kinds(6)).toEqual(['outside', 'drill', 'drill', 'drill']);
    expect(kinds(3)).toEqual(['outside', 'inside', 'inside', 'inside']);
  });
});

describe('what the tools do to the order of the cuts', () => {
  it('engraves with the V-bit between the holes and the cut-outs: T1, T2, T1 – three blocks', () => {
    const contours = [
      rectangle(0, 0, 60, 40),
      circle(8, 8, 6),
      square(36, 24, 8),
      line(10, 20, 30, 20),
    ];
    const ops: Operation[] = [
      { contour: 0, kind: 'outside', tool: 0 },
      { contour: 1, kind: 'drill', tool: 0 },
      { contour: 2, kind: 'inside', tool: 0 },
      { contour: 3, kind: 'on', tool: 1 },
    ];
    const r = toolpaths(contours, ops, two);
    expect(r.problems).toEqual([]);
    // hole (rank 0), engraving (2), cut-out (3), outline (4)
    expect(order(r)).toEqual([1, 3, 2, 0]);
    expect(r.blocks!.map((b) => [b.number, b.tool, b.operations])).toEqual([
      [1, 0, 1],
      [2, 1, 1],
      [1, 0, 2],
    ]);
  });

  it('keeps what lies inside a contour first, whatever the tools: the part is freed last', () => {
    // The mounted cutter (T1, after the drill) would rather go on with the square beside the part, then the part
    // – but the part waits for the insert in it, and that one is T2's: it is cut before the part
    const contours = [
      rectangle(0, 0, 60, 40), // the part (T1), waits for the insert
      square(10, 10, 20), // the insert (T2), inside the part
      square(100, 0, 30), // a square beside it (T1), free all the time
      circle(200, 0, 6), // a hole (T1), the first thing cut: T1 is mounted
    ];
    const ops: Operation[] = [
      { contour: 0, kind: 'outside', tool: 0 },
      { contour: 1, kind: 'outside', tool: 1 },
      { contour: 2, kind: 'outside', tool: 0 },
      { contour: 3, kind: 'drill', tool: 0 },
    ];
    const r = toolpaths(contours, ops, two);
    // hole, the square beside (T1 is mounted), the insert (a change), the part (a change back)
    expect(order(r)).toEqual([3, 2, 1, 0]);
    expect(r.blocks!.map((b) => [b.number, b.operations])).toEqual([
      [1, 2],
      [2, 1],
      [1, 1],
    ]);
    // The same drawing with one cutter keeps the same ranks: the part is last
    expect(
      order(
        toolpaths(
          contours,
          ops.map((o) => ({ ...o, tool: undefined })),
          mill.cut,
        ),
      ),
    ).toEqual([3, 2, 1, 0]);
  });

  it('goes on with the cutter that is mounted where the nearest operation is another one’s', () => {
    // Four squares in a row, alternately T1 and T2, nearest from the left: without a preference 1, 2, 1, 2 –
    // three changes. With it: T1 cuts the first, then the other T1 square (the T2 one beside it is nearer), then
    // T2 has both: one change
    const contours = [square(0, 0, 20), square(40, 0, 20), square(80, 0, 20), square(200, 0, 20)];
    const alternate = (first: number): Operation[] =>
      contours.map((_, i) => ({ contour: i, kind: 'outside', tool: (first + i) % 2 }));
    const r = toolpaths(contours, alternate(0), two);
    expect(order(r)).toEqual([0, 2, 1, 3]);
    expect(r.blocks!.map((b) => [b.number, b.operations])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    // …and the very same drawing with one cutter is cut left to right
    expect(
      order(
        toolpaths(
          contours,
          alternate(0).map((o) => ({ ...o, tool: 0 })),
          mill.cut,
        ),
      ),
    ).toEqual([0, 1, 2, 3]);
    // The one that starts is the nearest, whichever cutter it has
    expect(order(toolpaths(contours, alternate(1), two))).toEqual([0, 2, 1, 3]);
    expect(toolpaths(contours, alternate(1), two).blocks!.map((b) => b.number)).toEqual([2, 1]);
  });

  it('puts the cutter that is mounted before the operator’s numbers, and says nothing of it', () => {
    // After the hole T1 is mounted. Engravings 1 (T1), 2 (T2) and 3 (T1): the numbers would give 1, 2, 3 and
    // two changes; T1 finishes what it has first (1, 3) and T2 follows – one change, no problem said
    const contours = [
      circle(0, 0, 6),
      line(0, 10, 10, 10),
      line(0, 20, 10, 20),
      line(0, 30, 10, 30),
    ];
    const ops: Operation[] = [
      { contour: 0, kind: 'drill', tool: 0 },
      { contour: 1, kind: 'on', tool: 0, seq: 1 },
      { contour: 2, kind: 'on', tool: 1, seq: 2 },
      { contour: 3, kind: 'on', tool: 0, seq: 3 },
    ];
    const r = toolpaths(contours, ops, two);
    expect(order(r)).toEqual([0, 1, 3, 2]);
    expect(r.problems).toEqual([]);
    expect(r.blocks!.map((b) => b.number)).toEqual([1, 2]);
    // One cutter: the numbers rule, as ever
    expect(
      order(
        toolpaths(
          contours,
          ops.map((o) => ({ ...o, tool: 0 })),
          mill.cut,
        ),
      ),
    ).toEqual([0, 1, 2, 3]);
    // With nothing mounted yet the numbers decide who starts
    const first = toolpaths(
      contours.slice(1),
      [
        { contour: 0, kind: 'on', tool: 0, seq: 2 },
        { contour: 1, kind: 'on', tool: 1, seq: 1 },
        { contour: 2, kind: 'on', tool: 0, seq: 3 },
      ],
      two,
    );
    expect(order(first)).toEqual([1, 0, 2]);
  });

  it('does not make a block of an operation that cuts nothing', () => {
    // The only T2 operation does not fit (2 mm square, 3 mm cutter): T2 is never mounted. The program is T1's, as
    // if T2 were not there, and an operation that cuts nothing does not make T2 the mounted cutter either
    const contours = [square(0, 0, 20), square(50, 0, 2), square(100, 0, 20)];
    const ops: Operation[] = [
      { contour: 0, kind: 'outside', tool: 0 },
      { contour: 1, kind: 'inside', tool: 1 },
      { contour: 2, kind: 'outside', tool: 0 },
    ];
    const r = toolpaths(contours, ops, two);
    expect(r.problems).toEqual([{ contour: 1, code: 'tool-too-large' }]);
    expect(r.blocks).toEqual([
      {
        tool: 0,
        number: 1,
        name: 'End mill 6',
        diameter: 6,
        rpm: undefined,
        start: 0,
        end: r.moves.length,
        operations: 2,
      },
    ]);
    const alone = toolpaths(
      contours,
      ops.map((o) => ({ ...o, tool: undefined })),
      mill.cut,
    );
    expect(r.moves).toEqual(alone.moves);
    // …and the text is the one of a program of one cutter, byte for byte
    const text = toGcode(r.moves, { name: 'x', rpm: 18000, safeZ: 5, blocks: r.blocks });
    expect(text).toBe(toGcode(alone.moves, { name: 'x', rpm: 18000, safeZ: 5 }));
    expect(text).not.toContain('M6');
  });

  it('is the program of the one cutter that cuts, wherever it stands in the list', () => {
    const contours = [square(0, 0, 20), line(40, 0, 60, 0)];
    const ops: Operation[] = [
      { contour: 0, kind: 'outside', tool: 1 },
      { contour: 1, kind: 'on', tool: 1 },
    ];
    const r = toolpaths(contours, ops, two);
    const alone = toolpaths(
      contours,
      ops.map((o) => ({ ...o, tool: undefined })),
      vbit.cut,
    );
    expect(r.moves).toEqual(alone.moves);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks![0]).toMatchObject({
      tool: 1,
      number: 2,
      operations: 2,
      start: 0,
      end: r.moves.length,
    });
    expect(toGcode(r.moves, { name: 'x', rpm: 12000, safeZ: 5, blocks: r.blocks })).toBe(
      toGcode(alone.moves, { name: 'x', rpm: 12000, safeZ: 5 }),
    );
  });

  it('shortens the way without more tool changes, whatever it does to the order', () => {
    // Holes in a row; T1 and T2 alternate in the order the list gives. A shorter way is only taken if the
    // tool is changed no more often than on the nearest one
    const contours = [0, 30, 10, 40, 20, 50].map((x) => circle(x, 0, 6));
    const ops: Operation[] = contours.map((_, i) => ({ contour: i, kind: 'drill', tool: i % 2 }));
    const tools = [mill, { ...mill, number: 2, cut: cut() }];
    const nearest = toolpaths(contours, ops, tools);
    const short = toolpaths(contours, ops, tools, undefined, { route: 'short' });
    expect(short.blocks!.length).toBeLessThanOrEqual(nearest.blocks!.length);
    expect(nearest.blocks!.length).toBe(2);
    expect(order(short).slice().sort()).toEqual(order(nearest).slice().sort());
  });
});

describe('the tools of a call', () => {
  it('know the same cutter by its number: one block, each operation its own feeds', () => {
    // Two entries with the number 1 and one diameter: a cutter that is mounted once. The first cuts at 1200, the
    // second at 400
    const slow: ToolSettings = { number: 1, name: 'End mill 6 slow', cut: cut({ feed: 400 }) };
    const contours = [square(0, 0, 20), square(100, 0, 20)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'outside', tool: 0 },
        { contour: 1, kind: 'outside', tool: 1 },
      ],
      [mill, slow],
    );
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks![0]).toMatchObject({ tool: 0, number: 1, operations: 2 });
    const feeds = (op: number) =>
      new Set(movesOf(r, op).flatMap((m) => (m.feed && m.feed > 300 ? [m.feed] : [])));
    expect(feeds(0)).toEqual(new Set([1200]));
    expect(feeds(1)).toEqual(new Set([400]));
  });

  it('take the first cutter for an operation that names none', () => {
    const contours = [square(0, 0, 20), line(40, 0, 60, 0)];
    const r = toolpaths(
      contours,
      [
        { contour: 0, kind: 'outside' },
        { contour: 1, kind: 'on', tool: 1 },
      ],
      two,
    );
    // The engraving first (a lower rank), with the V-bit; the outline with the end mill, 3 mm beside the square
    expect(extent(movesOf(r, 0))).toEqual({ minX: -3, maxX: 23, minY: -3, maxY: 23 });
    expect(r.blocks!.map((b) => [b.tool, b.number])).toEqual([
      [1, 2],
      [0, 1],
    ]);
  });

  it('refuse what cannot be a program with a RangeError', () => {
    const contours = [square(0, 0, 20)];
    const op: Operation = { contour: 0, kind: 'outside' };
    expect(() => toolpaths(contours, [op], [])).toThrow(RangeError);
    for (const number of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => toolpaths(contours, [op], [{ ...mill, number }])).toThrow(
        /not a whole number from 1/,
      );
    }
    // One number, two diameters
    expect(() =>
      toolpaths(contours, [op], [mill, { ...mill, cut: cut({ toolDiameter: 3 }) }]),
    ).toThrow(/diameters 6 and 3/);
    // A cutter that is not in the list
    for (const tool of [2, -1, 0.5, NaN]) {
      expect(() => toolpaths(contours, [{ ...op, tool }], two)).toThrow(/names tool/);
    }
    // One CutSettings is a list of one
    expect(() => toolpaths(contours, [{ ...op, tool: 1 }], cut())).toThrow(RangeError);
    expect(toolpaths(contours, [{ ...op, tool: 0 }], cut()).blocks).toBeUndefined();
  });

  it('give no blocks for one CutSettings, none for a drawing with nothing to cut, one per run otherwise', () => {
    const contours = [square(0, 0, 20)];
    expect(toolpaths(contours, [{ contour: 0, kind: 'outside' }], cut()).blocks).toBeUndefined();
    expect(toolpaths(contours, [{ contour: 0, kind: 'none' }], two).blocks).toEqual([]);
    expect(toolpaths([], [], two).blocks).toEqual([]);
  });

  it('say where each block lies, which tool it is and what it holds', () => {
    const contours = [
      rectangle(0, 0, 60, 40),
      circle(8, 8, 6),
      square(36, 24, 8),
      line(10, 20, 30, 20),
    ];
    const ops: Operation[] = [
      { contour: 0, kind: 'outside', tool: 0 },
      { contour: 1, kind: 'drill', tool: 0 },
      { contour: 2, kind: 'inside', tool: 0 },
      { contour: 3, kind: 'on', tool: 1 },
    ];
    const r = toolpaths(contours, ops, two);
    const blocks = r.blocks!;
    // The drill is the first cut; the engraving the second; the cut-out and the outline are one block
    const [drill, engraving, rest] = [1, 3, 2].map((op) => r.cuts.find((c) => c.op === op)!);
    expect(blocks[0]).toEqual({
      tool: 0,
      number: 1,
      name: 'End mill 6',
      diameter: 6,
      rpm: undefined,
      start: 0,
      end: drill!.end,
      operations: 1,
    });
    expect(blocks[1]).toEqual({
      tool: 1,
      number: 2,
      name: 'V-bit',
      diameter: 3,
      rpm: 12000,
      start: engraving!.start,
      end: engraving!.end,
      operations: 1,
    });
    expect(blocks[2]!.start).toBe(rest!.start);
    expect(blocks[2]!.end).toBe(r.moves.length);
    // They follow each other without a gap, and add up to the cuts
    expect(blocks.map((b) => b.start)).toEqual([0, blocks[0]!.end, blocks[1]!.end]);
    expect(blocks.reduce((sum, b) => sum + b.operations, 0)).toBe(r.cuts.length);
  });
});

describe('the program text of several tools', () => {
  // Five moves a block: lift, to the place, down, along, up
  const block = (x: number, depth: number): Move[] => [
    { z: 5, feed: null },
    { x, y: 5, feed: null },
    { z: -depth, feed: 300 },
    { x: x + 10, feed: 1200 },
    { z: 5, feed: null },
  ];
  const moves = [...block(10, 1), ...block(20, 1)];
  const blocks = [
    { number: 1, name: 'Mill', diameter: 6, start: 0, end: 5 },
    { number: 2, name: 'V-bit', diameter: 3, rpm: 12000, start: 5, end: 10 },
  ];

  it('names the cutters, mounts the first before it moves and changes with a lift, M5, T M6 and S M3', () => {
    expect(toGcode(moves, { name: 'two', rpm: 18000, safeZ: 5, blocks })).toBe(
      [
        '(LowRider Control CAM: two)',
        '(T1 D=6 Mill)',
        '(T2 D=3 V-bit)',
        'G21 G90 G17 G94',
        'T1 M6',
        '(tool T1 Mill)',
        'G0 Z5',
        'S18000 M3',
        'G0 Z5',
        'X10 Y5',
        'G1 Z-1 F300',
        'X20 F1200',
        'G0 Z5',
        // the change: up, off, the new cutter on one line, on at its own speed
        'G0 Z5',
        'M5',
        'T2 M6',
        'S12000 M3',
        '(tool T2 V-bit)',
        // the first move of the block says it all: the mode, and the axes it moves
        'G0 Z5',
        'X20 Y5',
        'G1 Z-1 F300',
        'X30 F1200',
        'G0 Z5',
        'G0 Z5',
        'M5',
        'M30',
        '',
      ].join('\n'),
    );
  });

  it('forgets what it wrote at every change, so that a block run alone says every word it needs', () => {
    // The second block begins with the very move the first ended with (G1, Y5, Z-1, F300 all as before). Written
    // from the memory it would be a bare "X20": a block split off and run alone would not know its mode or its feed
    const same: Move[] = [
      { x: 10, y: 5, z: 5, feed: null },
      { x: 20, y: 5, z: -1, feed: 300 },
      { x: 30, y: 5, z: -1, feed: 300 },
      { x: 30, y: 5, z: -1, feed: 300 },
      { x: 20, y: 5, z: -1, feed: 300 },
      { x: 30, y: 5, z: -1, feed: 300 },
    ];
    const blocks = [
      { number: 1, diameter: 6, start: 0, end: 4 },
      { number: 2, diameter: 6, start: 4, end: 6 },
    ];
    expect(toGcode(same, { name: 'm', rpm: 1000, safeZ: 5, blocks })).toBe(
      [
        '(LowRider Control CAM: m)',
        '(T1 D=6)',
        '(T2 D=6)',
        'G21 G90 G17 G94',
        'T1 M6',
        '(tool T1)',
        'G0 Z5',
        'S1000 M3',
        'G0 X10 Y5 Z5',
        'G1 X20 Z-1 F300',
        'X30',
        // (the move that repeats the one before is left out, as always)
        'G0 Z5',
        'M5',
        'T2 M6',
        'S1000 M3',
        '(tool T2)',
        'G1 X20 Y5 Z-1 F300',
        'X30',
        'G0 Z5',
        'M5',
        'M30',
        '',
      ].join('\n'),
    );
  });

  it('lifts to the last height, never below the safe height, and names a cutter without a name by its number', () => {
    const high: Move[] = [
      { z: 12, feed: null },
      { x: 5, y: 5, feed: null },
      { z: 12, feed: null },
      { z: 5, feed: null },
    ];
    const text = toGcode(high, {
      name: 'h',
      rpm: 1000,
      safeZ: 5,
      blocks: [
        { number: 3, diameter: 2.5, start: 0, end: 3 },
        { number: 4, diameter: 2.5, start: 3, end: 4 },
      ],
    });
    expect(text).toContain('(T3 D=2.5)\n(T4 D=2.5)\n');
    // The change comes after a move that ended at Z12: the lift does not go down to 5 ...
    expect(text).toContain('G0 Z12\nM5\nT4 M6\nS1000 M3\n(tool T4)\n');
    // ... and after one that ended below the safe height it goes up to it
    const low = toGcode(
      [
        { z: 2, feed: null },
        { z: 2, feed: null },
      ],
      {
        name: 'l',
        rpm: 1000,
        safeZ: 5,
        blocks: [
          { number: 3, diameter: 2.5, start: 0, end: 1 },
          { number: 4, diameter: 2.5, start: 1, end: 2 },
        ],
      },
    );
    expect(low).toContain('G0 Z2\nG0 Z5\nM5\nT4 M6\n');
  });

  it('lists a cutter once however often it comes back, and cleans its name for a comment', () => {
    const three = [
      { number: 1, name: 'Mill (6 mm; HM)\nlong', diameter: 6, start: 0, end: 2 },
      { number: 2, name: '  ', diameter: 3, start: 2, end: 4 },
      { number: 1, name: 'Mill', diameter: 6, start: 4, end: 6 },
    ];
    const m: Move[] = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i + 1, feed: null }));
    const text = toGcode(m, { name: 'a(b)', rpm: 1000, safeZ: 5, blocks: three });
    const lines = text.split('\n');
    expect(lines.slice(0, 4)).toEqual([
      '(LowRider Control CAM: ab)',
      '(T1 D=6 Mill 6 mm HM long)',
      '(T2 D=3)',
      'G21 G90 G17 G94',
    ]);
    expect(lines.filter((l) => l.startsWith('(T')).length).toBe(2);
    expect(lines.filter((l) => /^T\d M6$/.test(l))).toEqual(['T1 M6', 'T2 M6', 'T1 M6']);
    expect(lines).toContain('(tool T1 Mill)');
  });

  it('refuses blocks that do not lie end to end over the moves, before it writes a word', () => {
    // Three moves. The tool is changed at `moves[start]` of a later block, so a list that does not fit the moves
    // would change the cutter inside a cut, or leave out a cutter that the header lists
    const m: Move[] = [
      { x: 1, feed: null },
      { x: 2, feed: null },
      { x: 3, feed: null },
    ];
    const at = (...bounds: [number, number][]) =>
      bounds.map(([start, end], i) => ({ number: i + 1, diameter: 6, start, end }));
    const text = (b: ReturnType<typeof at>) =>
      toGcode(m, { name: 'n', rpm: 1000, safeZ: 5, blocks: b });
    // The fitting ones are written, the first change between the moves it names
    expect(text(at([0, 1], [1, 3])).split('\n')).toEqual([
      '(LowRider Control CAM: n)',
      '(T1 D=6)',
      '(T2 D=6)',
      'G21 G90 G17 G94',
      'T1 M6',
      '(tool T1)',
      'G0 Z5',
      'S1000 M3',
      'G0 X1',
      'G0 Z5',
      'M5',
      'T2 M6',
      'S1000 M3',
      '(tool T2)',
      'G0 X2',
      'X3',
      'G0 Z5',
      'M5',
      'M30',
      '',
    ]);
    const refused: [string, ReturnType<typeof at>][] = [
      ['the first block starts late', at([1, 2], [2, 3])],
      ['a gap between two blocks', at([0, 1], [2, 3])],
      ['two blocks that overlap', at([0, 2], [1, 3])],
      ['an empty block in the middle', at([0, 1], [1, 1], [1, 3])],
      ['a block that ends where it starts, at the end', at([0, 2], [2, 2])],
      ['a block that ends before it starts', at([0, 2], [2, 1], [1, 3])],
      ['a block that stops short of the last move', at([0, 1], [1, 2])],
      ['a block that goes past the last move', at([0, 1], [1, 4])],
      ['a block boundary between two moves', at([0, 1.5], [1.5, 3])],
      ['a boundary that is no number', at([0, NaN], [NaN, 3])],
      ['a boundary that is infinite', at([0, 1], [1, Infinity])],
    ];
    for (const [what, blocks] of refused) {
      expect(() => text(blocks), what).toThrow(RangeError);
    }
    expect(() => text(at([1, 2], [2, 3]))).toThrow(
      'toGcode: the tool blocks (1-2, 2-3) do not lie end to end over the 3 moves',
    );
    // No moves at all: two blocks have nothing to lie over
    expect(() =>
      toGcode([], { name: 'n', rpm: 1000, safeZ: 5, blocks: at([0, 0], [0, 0]) }),
    ).toThrow(RangeError);
  });

  it('refuses the moves of one call with the blocks of another – a hole drilled in front, a cut left off', () => {
    const sign = twoToolSign();
    const { result } = sign;
    const options = { name: 's', rpm: 18000, safeZ: 5 };
    // What the app does for the holes of a two-sided part: they are made by a call of their own and put in front
    const hole = toolpaths(
      [circle(10, 60, 3)],
      [{ contour: 0, kind: 'drill' }],
      sign.tools[0]!.cut,
    );
    expect(hole.moves.length).toBeGreaterThan(0);
    expect(() =>
      toGcode([...hole.moves, ...result.moves], { ...options, blocks: result.blocks }),
    ).toThrow(RangeError);
    // ... and the other way: the end of the program taken off (the header would list a cutter that is never mounted)
    expect(() => toGcode(result.moves.slice(0, 5), { ...options, blocks: result.blocks })).toThrow(
      RangeError,
    );
    // The whole call is written, with every change where its block begins
    expect(toGcode(result.moves, { ...options, blocks: result.blocks })).toContain('T2 M6');
    // The holes belong to the first block: that block widened over them and the others shifted behind them. The
    // program then changes the cutter exactly where it did, and everything after the first change is the same text
    const n = hole.moves.length;
    const [first, ...later] = result.blocks!;
    const drilledFirst = [
      { ...first!, end: first!.end + n },
      ...later.map((b) => ({ ...b, start: b.start + n, end: b.end + n })),
    ];
    const withHole = toGcode([...hole.moves, ...result.moves], {
      ...options,
      blocks: drilledFirst,
    });
    const without = toGcode(result.moves, { ...options, blocks: result.blocks });
    const afterChange = (text: string) => text.split('T2 M6\n')[1];
    expect(afterChange(withHole)).toBeDefined();
    expect(afterChange(withHole)).toBe(afterChange(without));
    expect(withHole.split('T2 M6').length).toBe(2);
  });

  it('is the program it always was for no blocks or one', () => {
    const plain = toGcode(moves, { name: 'p', rpm: 18000, safeZ: 5 });
    expect(plain.split('\n').slice(0, 5)).toEqual([
      '(LowRider Control CAM: p)',
      'G21 G90 G17 G94',
      'G0 Z5',
      'M3 S18000',
      'G0 Z5',
    ]);
    expect(toGcode(moves, { name: 'p', rpm: 18000, safeZ: 5, blocks: [] })).toBe(plain);
    expect(toGcode(moves, { name: 'p', rpm: 18000, safeZ: 5, blocks: [blocks[1]!] })).toBe(plain);
  });
});
