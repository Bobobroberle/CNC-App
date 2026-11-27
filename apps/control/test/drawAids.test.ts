import { IDENTITY } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  drawOverlay,
  drawTable,
  type Colors,
  type GapMark,
  type MeasureMark,
  type Scene,
  type Viewport,
} from '../src/render/draw';

/** 2 px per mm, the origin of the table at the lower left of a 200 × 200 view */
const vp: Viewport = { width: 200, height: 200, dpr: 1, scale: 2, originX: 0, originY: 200 };
const colors: Colors = {
  bg: 'BG',
  grid: 'GRID',
  gridMajor: 'MAJOR',
  axis: 'MUTED',
  rapid: 'RAPID',
  air: 'AIR',
  danger: 'CUT',
  done: 'DONE',
  current: 'CURRENT',
  tool: 'TOOL',
  live: 'SELECT',
  text: 'TEXT',
};

class FakePath {
  moveTo() {}
  lineTo() {}
  arc() {}
  closePath() {}
}

/** A canvas that writes down what it is told, and measures every text 40 px wide */
function recorder() {
  const log: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === 'measureText') return () => ({ width: 40 });
        return (...args: unknown[]) => log.push(`${String(name)}(${args.join(',')})`);
      },
      set: (_, name, value) => {
        log.push(`${String(name)}=${value}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

const paths = {
  project: () => [0, 0] as [number, number],
  rapid: new FakePath(),
  depth: [],
  chunks: [],
  chunkSize: 256,
  extent: null,
};
const overlay = (own: Partial<Scene>) =>
  ({
    paths,
    segments: [],
    done: 0,
    current: null,
    showRapids: true,
    surfaceZ: 0,
    tool: null,
    live: null,
    toolDiameter: 6,
    workspace: null,
    ...own,
  }) as unknown as Scene;

describe('what the table draws while a part is dragged and while measuring', () => {
  const saved = (globalThis as { Path2D?: unknown }).Path2D;
  beforeEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = FakePath;
  });
  afterEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = saved;
  });

  it('draws the guides of a snap as thin dashed lines in the selection colour, along x or y', () => {
    const { ctx, log } = recorder();
    drawTable(
      ctx,
      vp,
      {
        workspace: null,
        drawingGuides: [
          { axis: 'x', at: 60, from: 30, to: 110 },
          { axis: 'y', at: 40, from: 65, to: 130 },
        ],
      },
      colors,
      false,
    );
    const at = log.findIndex((l) => l === 'moveTo(60,30)');
    expect(at).toBeGreaterThan(0);
    expect(log[at + 1]).toBe('lineTo(60,110)');
    expect(log).toContain('moveTo(65,40)');
    expect(log).toContain('lineTo(130,40)');
    // dashed, in the selection colour – never the colour of the cut or of a fault – and the dash reset after
    const before = log.slice(0, at);
    expect(before.filter((l) => l.startsWith('strokeStyle=')).pop()).toBe('strokeStyle=SELECT');
    expect(before.filter((l) => l.startsWith('setLineDash(')).pop()).toMatch(
      /^setLineDash\([\d.]+,[\d.]+\)$/,
    );
    expect(
      log
        .slice(at)
        .filter((l) => l.startsWith('setLineDash('))
        .shift(),
    ).toBe('setLineDash()');
    // thin: 1.25 px in world units
    expect(before.filter((l) => l.startsWith('lineWidth=')).pop()).toBe('lineWidth=0.625');
  });

  it('draws nothing of the guides where there are none', () => {
    const { ctx, log } = recorder();
    drawTable(ctx, vp, { workspace: null, drawingGuides: [] }, colors, false);
    expect(log.some((l) => l.startsWith('moveTo('))).toBe(false);
  });

  const gap = (over: Partial<GapMark>): GapMark => ({
    side: 'right',
    from: { x: 60, y: 50 },
    to: { x: 80, y: 50 },
    text: '20 mm',
    equal: false,
    ...over,
  });

  it('draws a gap as a dimension line with a tick at each end and its number above it', () => {
    const { ctx, log } = recorder();
    drawOverlay(ctx, vp, overlay({ drawingGaps: [gap({})] }), colors);
    // in screen px: x = 2·mm, y = 200 − 2·mm → from (120, 100) to (160, 100), ticks 6 px up and down
    expect(log).toContain('moveTo(120,100)');
    expect(log).toContain('lineTo(160,100)');
    expect(log).toContain('moveTo(120,94)');
    expect(log).toContain('lineTo(120,106)');
    expect(log).toContain('moveTo(160,94)');
    expect(log).toContain('lineTo(160,106)');
    // the number, in the mono face, in the plain text colour; above the middle of the line (x 140), clear of it
    const text = log.find((l) => l.startsWith('fillText(20 mm'))!;
    expect(text).toBeDefined();
    const [, x, y] = /fillText\(20 mm,([\d.]+),([\d.]+)\)/.exec(text)!.map(Number);
    expect(x!).toBeCloseTo(140 - 40 / 2 - 6 + 6, 5);
    expect(y!).toBeLessThan(100 - 10);
    expect(log.filter((l) => l.startsWith('font=')).pop()).toContain('JetBrains Mono');
    expect(log.filter((l) => l.startsWith('fillStyle=')).pop()).toBe('fillStyle=TOOL');
    expect(
      log.filter(
        (l) => l.startsWith('strokeStyle=') && !['strokeStyle=BG', 'strokeStyle=DONE'].includes(l),
      ),
    ).toEqual(['strokeStyle=TOOL']);
  });

  it('draws the numbers over the handles of the part – a gap of 0 stands where a handle does – and leaves the line cap as it found it', () => {
    const { ctx, log } = recorder();
    drawOverlay(
      ctx,
      vp,
      overlay({
        drawingSelected: {
          outline: new FakePath() as unknown as Path2D,
          box: { minU: 10, maxU: 30, minV: 10, maxV: 30 },
          frame: { m: IDENTITY, box: { minX: 10, minY: 10, maxX: 30, maxY: 30 }, own: true },
          handles: true,
        },
        drawingGaps: [gap({ text: '0 mm' })],
      }),
      colors,
    );
    const lastHandle = log.map((l) => l.startsWith('rect(')).lastIndexOf(true);
    const number = log.findIndex((l) => l.startsWith('fillText(0 mm'));
    expect(lastHandle).toBeGreaterThan(0);
    expect(number).toBeGreaterThan(lastHandle);
    // the cap the next frame's dashes start from
    expect(log.filter((l) => l.startsWith('lineCap=')).pop()).toBe('lineCap=round');
  });

  it('draws two equal gaps with their lines in the selection colour and the equals sign in their words', () => {
    const { ctx, log } = recorder();
    drawOverlay(
      ctx,
      vp,
      overlay({
        drawingGaps: [
          gap({
            side: 'left',
            from: { x: 40, y: 50 },
            to: { x: 20, y: 50 },
            text: '= 20 mm',
            equal: true,
          }),
          gap({ text: '= 20 mm', equal: true }),
        ],
      }),
      colors,
    );
    expect(log.filter((l) => l.startsWith('fillText(= 20 mm'))).toHaveLength(2);
    const strokes = log.filter(
      (l) => l.startsWith('strokeStyle=') && !['strokeStyle=BG', 'strokeStyle=DONE'].includes(l),
    );
    expect(strokes).toEqual(['strokeStyle=SELECT', 'strokeStyle=SELECT']);
    // the words themselves stay in the plain text colour
    expect(log.filter((l) => l.startsWith('fillStyle=')).pop()).toBe('fillStyle=TOOL');
  });

  it('puts the number of a gap that runs up to the right of its line, and keeps every number in the picture', () => {
    const { ctx, log } = recorder();
    drawOverlay(
      ctx,
      vp,
      overlay({
        drawingGaps: [
          gap({ side: 'up', from: { x: 50, y: 60 }, to: { x: 50, y: 75 }, text: '15 mm' }),
          // at the very edge of the picture: the number is pulled in
          gap({ side: 'right', from: { x: 98, y: 1 }, to: { x: 100, y: 1 }, text: '2 mm' }),
        ],
      }),
      colors,
    );
    const first = /fillText\(15 mm,([\d.]+),([\d.]+)\)/.exec(
      log.find((l) => l.startsWith('fillText(15'))!,
    )!;
    // the line is at x = 100: the number starts to the right of it
    expect(Number(first[1])).toBeGreaterThan(100);
    const edge = /fillText\(2 mm,([\d.]+),([\d.]+)\)/.exec(
      log.find((l) => l.startsWith('fillText(2 '))!,
    )!;
    expect(Number(edge[1])).toBeGreaterThanOrEqual(4);
    expect(Number(edge[1])).toBeLessThanOrEqual(200 - 4);
    expect(Number(edge[2])).toBeLessThanOrEqual(200 - 4);
  });

  const measured = (over: Partial<MeasureMark> = {}): MeasureMark => ({
    a: { x: 10, y: 10 },
    b: { x: 40, y: 50 },
    names: ['A', 'B'],
    label: '50,00 mm',
    detail: 'ΔX +30,00 · ΔY +40,00 · 53,1°',
    ...over,
  });

  it('draws the measurement: the line from A to B, a dot and a name at each, the numbers beside the line', () => {
    const { ctx, log } = recorder();
    drawOverlay(ctx, vp, overlay({ drawingMeasure: measured() }), colors);
    // A (20, 180) to B (80, 100) on screen
    expect(log).toContain('moveTo(20,180)');
    expect(log).toContain('lineTo(80,100)');
    expect(log.filter((l) => l.startsWith('arc(20,180,6'))).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('arc(80,100,6'))).toHaveLength(1);
    for (const text of ['A', 'B', '50,00 mm', 'ΔX +30,00 · ΔY +40,00 · 53,1°']) {
      expect(
        log.some((l) => l.startsWith(`fillText(${text},`)),
        text,
      ).toBe(true);
    }
    // the dots are in the selection colour, the line and the words are plain – nothing is red
    expect(
      log.filter((l) => l.startsWith('fillStyle=')).filter((l) => l !== 'fillStyle=BG'),
    ).toContain('fillStyle=SELECT');
    expect(log.join('\n')).not.toMatch(/CUT|DANGER|red/i);
  });

  it('puts a name beyond its dot, on the way out of the line – the numbers in the middle stay clear of the names', () => {
    const { ctx, log } = recorder();
    // A short flat line: A (60, 100) → B (80, 100) on screen
    drawOverlay(
      ctx,
      vp,
      overlay({ drawingMeasure: measured({ a: { x: 30, y: 50 }, b: { x: 40, y: 50 } }) }),
      colors,
    );
    const at = (name: string) => {
      const line = log.find((l) => l.startsWith(`fillText(${name},`))!;
      return line.slice(`fillText(${name},`.length, -1).split(',').map(Number) as [number, number];
    };
    // 20 px beyond each dot along the line: a box (the text 40 px wide and 12 of room) is centred there, and
    // its text starts 6 px inside it – A at 60 − 20 − 26 + 6, B at 80 + 20 − 26 + 6
    expect(at('A')[0]).toBeCloseTo(20, 9);
    expect(at('B')[0]).toBeCloseTo(80, 9);
    // …so the two names stand outside the dots (60 and 80), the numbers at the middle (70) between them
    expect(at('A')[0] + 40).toBeLessThanOrEqual(60 + 6);
    expect(at('B')[0]).toBeGreaterThanOrEqual(80);
  });

  it('draws A alone as a dot and a name – no line, no numbers', () => {
    const { ctx, log } = recorder();
    drawOverlay(
      ctx,
      vp,
      overlay({ drawingMeasure: measured({ b: null, label: '', detail: '' }) }),
      colors,
    );
    expect(log.filter((l) => l.startsWith('arc('))).toHaveLength(1);
    expect(log.some((l) => l.startsWith('lineTo('))).toBe(false);
    expect(log.some((l) => l.startsWith('fillText(A,'))).toBe(true);
    expect(log.some((l) => l.startsWith('fillText(B,'))).toBe(false);
  });

  it('puts the numbers of a steep line to its right and those of a flat one above it', () => {
    const where = (m: MeasureMark) => {
      const { ctx, log } = recorder();
      drawOverlay(ctx, vp, overlay({ drawingMeasure: m }), colors);
      const find = (text: string) => {
        const line = log.find((l) => l.startsWith(`fillText(${text},`))!;
        return line.slice(`fillText(${text},`.length, -1).split(',').map(Number) as [
          number,
          number,
        ];
      };
      return find('50,00 mm');
    };
    // flat: A (20, 150) → B (180, 150) – the numbers above the middle (100, 150)
    const [fx, fy] = where(measured({ a: { x: 10, y: 25 }, b: { x: 90, y: 25 } }));
    expect(fy).toBeLessThan(150);
    expect(fx).toBeGreaterThan(40);
    expect(fx).toBeLessThan(120);
    // steep: A (100, 20) → B (100, 180) – the numbers to the right of x = 100
    const [sx] = where(measured({ a: { x: 50, y: 90 }, b: { x: 50, y: 10 } }));
    expect(sx).toBeGreaterThan(100);
  });
});
