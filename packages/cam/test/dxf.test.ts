import { describe, expect, it } from 'vitest';
import { bounds, readDxf, signedArea } from '../src';

/** A DXF file from entities given as [code, value] pairs. */
function dxf(entities: (string | number)[][][], header: (string | number)[][] = []): string {
  const lines: (string | number)[] = [];
  const pair = (c: string | number, v: string | number) => lines.push(c, v);
  if (header.length) {
    pair(0, 'SECTION');
    pair(2, 'HEADER');
    for (const [c, v] of header) pair(c!, v!);
    pair(0, 'ENDSEC');
  }
  pair(0, 'SECTION');
  pair(2, 'ENTITIES');
  for (const e of entities) for (const [c, v] of e) pair(c!, v!);
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return lines.join('\n');
}

const line = (x1: number, y1: number, x2: number, y2: number) => [
  [0, 'LINE'],
  [8, 'Kontur'],
  [10, x1],
  [20, y1],
  [11, x2],
  [21, y2],
];

describe('DXF', () => {
  it('joins loose lines into a closed contour, in any direction', () => {
    const d = readDxf(
      dxf([line(0, 0, 100, 0), line(100, 50, 100, 0), line(100, 50, 0, 50), line(0, 0, 0, 50)]),
    );
    expect(d.contours).toHaveLength(1);
    const c = d.contours[0]!;
    expect(c.closed).toBe(true);
    expect(c.layer).toBe('Kontur');
    expect(c.points).toHaveLength(4);
    expect(Math.abs(signedArea(c.points))).toBeCloseTo(5000);
  });

  it('grows a chain at its head as well and leaves open lines open', () => {
    const d = readDxf(dxf([line(10, 0, 20, 0), line(0, 0, 10, 0), line(-10, 0, 0, 0)]));
    expect(d.contours).toHaveLength(1);
    expect(d.contours[0]!.closed).toBe(false);
    expect(bounds(d.contours[0]!.points)).toEqual({ minX: -10, minY: 0, maxX: 20, maxY: 0 });
    const reversed = readDxf(dxf([line(10, 0, 20, 0), line(0, 0, 10, 0), line(0, 0, -10, 0)]));
    expect(reversed.contours[0]!.points).toHaveLength(4);
  });

  it('reads circles and arcs, mirrored ones too', () => {
    const d = readDxf(
      dxf([
        [
          [0, 'CIRCLE'],
          [10, 50],
          [20, 25],
          [40, 5],
        ],
        [
          [0, 'CIRCLE'],
          [10, 10],
          [20, 0],
          [40, 2],
          [230, -1],
        ],
        [
          [0, 'ARC'],
          [10, 0],
          [20, 0],
          [40, 10],
          [50, 0],
          [51, 90],
        ],
        [
          [0, 'ARC'],
          [10, 0],
          [20, 0],
          [40, 10],
          [50, 270],
          [51, 0],
          [230, -1],
        ],
      ]),
    );
    const circles = d.contours.filter((c) => c.circle);
    expect(circles.map((c) => c.circle)).toEqual([
      { cx: 50, cy: 25, r: 5 },
      { cx: -10, cy: 0, r: 2 },
    ]);
    const arcs = d.contours.filter((c) => !c.circle);
    // Quarter arc from (10,0) to (0,10); mirrored 270…0 lies at x ≤ 0.
    const quarter = arcs.find((c) => c.points[0]!.x > 9)!;
    expect(quarter.points.at(-1)!.x).toBeCloseTo(0);
    expect(quarter.points.at(-1)!.y).toBeCloseTo(10);
    const mirrored = arcs.find((c) => c !== quarter)!;
    expect(Math.max(...mirrored.points.map((p) => p.x))).toBeLessThan(1e-9);
  });

  it('reads polylines with bulges, closed and open, light and old style', () => {
    const d = readDxf(
      dxf([
        [
          [0, 'LWPOLYLINE'],
          [90, 2],
          [70, 1],
          [10, 0],
          [20, 0],
          [42, 1],
          [10, 20],
          [20, 0],
          [42, 1],
        ],
        [
          [0, 'LWPOLYLINE'],
          [70, 0],
          [10, 0],
          [20, 30],
          [10, 10],
          [20, 30],
          [230, -1],
        ],
        [
          [0, 'POLYLINE'],
          [8, 'Alt'],
          [70, 1],
        ],
        [
          [0, 'VERTEX'],
          [10, 0],
          [20, 50],
        ],
        [
          [0, 'VERTEX'],
          [10, 10],
          [20, 50],
          [42, -0.5],
        ],
        [
          [0, 'VERTEX'],
          [10, 10],
          [20, 60],
        ],
        [[0, 'SEQEND']],
      ]),
    );
    // Two half circles: a full circle of diameter 20.
    const round = d.contours.find((c) => c.closed && c.layer === undefined)!;
    expect(Math.abs(signedArea(round.points))).toBeCloseTo(Math.PI * 100, 0);
    const open = d.contours.find((c) => !c.closed)!;
    expect(open.points).toEqual([
      { x: -0, y: 30 },
      { x: -10, y: 30 },
    ]);
    const old = d.contours.find((c) => c.layer === 'Alt')!;
    expect(old.closed).toBe(true);
    expect(old.points.length).toBeGreaterThan(3);
  });

  it('reads splines from the control net or, without one, from the fit points', () => {
    const quadratic = [
      [0, 'SPLINE'],
      [70, 0],
      [71, 2],
      ...[0, 0, 0, 1, 1, 1].map((k) => [40, k]),
      [10, 0],
      [20, 0],
      [10, 10],
      [20, 10],
      [10, 20],
      [20, 0],
      [41, 1],
      [41, 1],
      [41, 1],
    ];
    const fitOnly = [
      [0, 'SPLINE'],
      [70, 1],
      [71, 3],
      [11, 0],
      [21, 40],
      [11, 5],
      [21, 45],
      [11, 10],
      [21, 40],
    ];
    const d = readDxf(dxf([quadratic, fitOnly]));
    const curve = d.contours.find((c) => !c.closed)!;
    expect(curve.points[0]).toEqual({ x: 0, y: 0 });
    expect(curve.points.at(-1)!.x).toBeCloseTo(20);
    // The middle of a quadratic Bézier: half way up to the control point.
    const mid = curve.points[Math.floor(curve.points.length / 2)]!;
    expect(mid.y).toBeGreaterThan(4);
    expect(mid.y).toBeLessThan(5.5);
    const fit = d.contours.find((c) => c.closed)!;
    expect(fit.points).toHaveLength(3);
  });

  it('drops the repeated end of a closed spline', () => {
    const closedNet = [
      [0, 'SPLINE'],
      [70, 1],
      [71, 1],
      ...[0, 0, 1, 2, 3, 3].map((k) => [40, k]),
      ...[
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
      ].flatMap(([x, y]) => [
        [10, x!],
        [20, y!],
      ]),
    ];
    const c = readDxf(dxf([closedNet])).contours[0]!;
    expect(c.closed).toBe(true);
    expect(c.points[0]).not.toEqual(c.points.at(-1));
  });

  it('reads full and partial ellipses', () => {
    const full = [
      [0, 'ELLIPSE'],
      [10, 0],
      [20, 0],
      [11, 20],
      [21, 0],
      [40, 0.5],
    ];
    const half = [
      [0, 'ELLIPSE'],
      [10, 0],
      [20, 0],
      [11, 0],
      [21, 10],
      [40, 0.5],
      [41, 0],
      [42, Math.PI],
    ];
    const wrapped = [
      [0, 'ELLIPSE'],
      [10, 100],
      [20, 0],
      [11, 10],
      [21, 0],
      [41, 1],
      [42, 0.5],
    ];
    const d = readDxf(dxf([full, half, wrapped]));
    const e = d.contours.find((c) => c.closed)!;
    expect(Math.abs(signedArea(e.points))).toBeCloseTo(Math.PI * 20 * 10, -1);
    const open = d.contours.filter((c) => !c.closed);
    expect(open).toHaveLength(2);
    expect(open[0]!.points[0]!.y).toBeCloseTo(10);
    expect(open[0]!.points.at(-1)!.y).toBeCloseTo(-10);
  });

  it('scales by $INSUNITS and reports what it skipped', () => {
    const d = readDxf(
      dxf(
        [line(0, 0, 1, 0), [[0, 'TEXT']], [[0, 'TEXT']], [[0, 'INSERT']]],
        [
          [9, '$INSUNITS'],
          [70, 1],
        ],
      ),
    );
    expect(d.unitScale).toBe(25.4);
    expect(d.contours[0]!.points[1]!.x).toBeCloseTo(25.4);
    expect(d.skipped).toEqual({ TEXT: 2, INSERT: 1 });
    const cm = readDxf(
      dxf(
        [
          [
            [0, 'CIRCLE'],
            [10, 1],
            [20, 1],
            [40, 1],
          ],
        ],
        [
          [9, '$INSUNITS'],
          [70, 5],
        ],
      ),
    );
    expect(cm.contours[0]!.circle).toEqual({ cx: 10, cy: 10, r: 10 });
    expect(readDxf(dxf([line(0, 0, 1, 0)], [[9, '$ACADVER']])).unitScale).toBe(1);
  });

  it('ends bulged segments exactly at the next vertex, beyond a half circle too', () => {
    for (const bulge of [0.5, 2, -2, -0.3]) {
      const c = readDxf(
        dxf([
          [
            [0, 'LWPOLYLINE'],
            [70, 0],
            [10, 0],
            [20, 0],
            [42, bulge],
            [10, 10],
            [20, 0],
          ],
        ]),
      ).contours[0]!;
      const end = c.points.at(-1)!;
      expect(end.x).toBeCloseTo(10, 6);
      expect(end.y).toBeCloseTo(0, 6);
      // Positive bulge turns counter-clockwise: the arc bulges to the right of a→b (below).
      const lowest = Math.min(...c.points.map((p) => p.y));
      const highest = Math.max(...c.points.map((p) => p.y));
      if (bulge > 0) expect(-lowest).toBeGreaterThan(highest);
      else expect(highest).toBeGreaterThan(-lowest);
    }
  });

  it('copes with empty polylines, repeated knots, tiny ellipses and cut-off files', () => {
    const d = readDxf(
      dxf([
        [
          [0, 'POLYLINE'],
          [70, 0],
        ],
        [[0, 'SEQEND']],
        [
          [0, 'SPLINE'],
          [70, 0],
          [71, 2],
          ...[0, 0, 0, 1, 1, 1, 2, 2, 2].map((k) => [40, k]),
          ...[
            [0, 0],
            [5, 5],
            [10, 0],
            [12, 0],
            [15, 5],
            [20, 0],
          ].flatMap(([x, y]) => [
            [10, x!],
            [20, y!],
          ]),
        ],
        [
          [0, 'ELLIPSE'],
          [10, 50],
          [20, 50],
          [11, 0.004],
          [21, 0],
          [40, 1],
        ],
      ]),
    );
    expect(d.contours).toHaveLength(2);
    const curve = d.contours.find((c) => !c.closed)!;
    expect(curve.points.at(-1)!.x).toBeCloseTo(20);
    expect(readDxf('0\nSECTION').contours).toEqual([]);
    expect(readDxf('0\nSECTION\n2\nHEADER\n9\n$INSUNITS').unitScale).toBe(1);
  });

  it('refuses files that are not DXF', () => {
    expect(() => readDxf('hello\nworld\n')).toThrow(/group code/);
    expect(readDxf('').contours).toEqual([]);
  });
});
