import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  drawTable,
  LETTER_MIN_PX,
  readColors,
  type Colors,
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
  groups: { a: 'GA', b: 'GB', c: 'GC', d: 'GD' },
};

/** A path that is told by its name in the log of the canvas */
class Named {
  constructor(public name: string) {}
  toString() {
    return this.name;
  }
}
const path = (name: string) => new Named(name) as unknown as Path2D;

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

const draw = (own: Partial<Scene>) => {
  const { ctx, log } = recorder();
  drawTable(ctx, vp, { workspace: null, ...own }, colors, false);
  return log;
};
/** What was set last before the nth stroke of a path */
const before = (log: string[], at: number, prefix: string) =>
  log
    .slice(0, at)
    .filter((l) => l.startsWith(prefix))
    .pop();
const strokes = (log: string[], name: string) =>
  log.flatMap((l, i) => (l === `stroke(${name})` ? [i] : []));

describe('the colour groups on the table', () => {
  const saved = (globalThis as { Path2D?: unknown }).Path2D;
  beforeEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = Named;
  });
  afterEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = saved;
  });

  it('draws the parts of a colour as a path of their own: 2 px in the colour on a rim of the ground, the plain ones stay 1 px in the text colour', () => {
    const log = draw({
      drawing: path('plain'),
      drawingColored: [{ color: 'a', front: path('front-a'), back: null }],
    });
    const [plain] = strokes(log, 'plain');
    expect(before(log, plain!, 'strokeStyle=')).toBe('strokeStyle=TOOL');
    // 1 px at 2 px per mm is half a millimetre
    expect(before(log, plain!, 'lineWidth=')).toBe('lineWidth=0.5');
    const [rim, line] = strokes(log, 'front-a');
    expect(line).toBeGreaterThan(rim!);
    // the rim in the ground's colour, wider; then the colour, 2 px
    expect(before(log, rim!, 'strokeStyle=')).toBe('strokeStyle=BG');
    expect(before(log, rim!, 'lineWidth=')).toBe('lineWidth=2.5');
    expect(before(log, line!, 'strokeStyle=')).toBe('strokeStyle=GA');
    expect(before(log, line!, 'lineWidth=')).toBe('lineWidth=1');
    // solid: the dash of whatever came before is put away
    expect(before(log, rim!, 'setLineDash(')).toBe('setLineDash()');
  });

  it('gives each colour its own path and its own colour – and draws none for a colour without parts', () => {
    const log = draw({
      drawingColored: [
        { color: 'b', front: path('front-b'), back: null },
        { color: 'd', front: path('front-d'), back: null },
        { color: 'c', front: null, back: null },
      ],
    });
    for (const [name, colour] of [
      ['front-b', 'GB'],
      ['front-d', 'GD'],
    ] as const) {
      const [rim, line] = strokes(log, name);
      expect(rim, name).toBeDefined();
      expect(before(log, line!, 'strokeStyle='), name).toBe(`strokeStyle=${colour}`);
    }
    expect(log.some((l) => l === 'strokeStyle=GC')).toBe(false);
  });

  it('draws the selection after the colour, over it – the violet is the selection’s, never a group’s', () => {
    const log = draw({
      drawingColored: [{ color: 'a', front: path('front-a'), back: null }],
      drawingSelected: {
        outline: path('selected'),
        box: { minU: 0, maxU: 10, minV: 0, maxV: 10 },
        frame: {
          m: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          box: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
          own: true,
        },
        handles: false,
      },
    });
    const colour = strokes(log, 'front-a').at(-1)!;
    const [selected] = strokes(log, 'selected');
    expect(selected).toBeGreaterThan(colour);
    expect(before(log, selected!, 'strokeStyle=')).toBe('strokeStyle=SELECT');
  });

  it('keeps the back of a coloured part dashed – in its colour, on a dashed rim', () => {
    const log = draw({
      drawingColored: [{ color: 'c', front: null, back: path('back-c') }],
    });
    const [rim, line] = strokes(log, 'back-c');
    expect(rim).toBeDefined();
    expect(before(log, rim!, 'setLineDash(')).toBe('setLineDash(2.5,2)');
    expect(before(log, line!, 'strokeStyle=')).toBe('strokeStyle=GC');
    expect(before(log, line!, 'setLineDash(')).toBe('setLineDash(2.5,2)');
    // and the dash is put away after it
    expect(log.slice(line!).find((l) => l.startsWith('setLineDash('))).toBe('setLineDash()');
    // the plain back is as ever: the text colour, 1 px, dashed
    const plain = draw({ drawingBack: path('plain-back') });
    const [stroke] = strokes(plain, 'plain-back');
    expect(before(plain, stroke!, 'strokeStyle=')).toBe('strokeStyle=TOOL');
    expect(before(plain, stroke!, 'setLineDash(')).toBe('setLineDash(2.5,2)');
  });

  it('leaves a hidden part grey and dashed – no colour of a group comes near it', () => {
    const log = draw({
      drawingHidden: path('hidden'),
      drawingColored: [{ color: 'a', front: path('front-a'), back: null }],
    });
    const [hidden] = strokes(log, 'hidden');
    expect(before(log, hidden!, 'strokeStyle=')).toBe('strokeStyle=MUTED');
    expect(before(log, hidden!, 'setLineDash(')).toBe('setLineDash(1,2)');
    // (the table draws the coloured parts that are cut: a hidden part is not in `drawingColored`)
    expect(draw({ drawingHidden: path('hidden') }).some((l) => /strokeStyle=G[A-D]/.test(l))).toBe(
      false,
    );
  });

  it('with no colour in use draws exactly what it drew before: not a call more', () => {
    const plain = { drawing: path('plain'), drawingHidden: path('hidden') };
    expect(draw({ ...plain, drawingColored: [], drawingLetters: [] })).toEqual(draw(plain));
  });
});

describe('the letter of a colour, set at its part', () => {
  const saved = (globalThis as { Path2D?: unknown }).Path2D;
  beforeEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = Named;
  });
  afterEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = saved;
  });
  const letter = (box: { minU: number; maxU: number; minV: number; maxV: number }, color = 'a') =>
    draw({ drawingLetters: [{ color: color as 'a', box }] });

  it('is the capital letter in the text colour on a wash of the ground, at the upper left of the part’s box', () => {
    // a 50 × 40 mm box with its lower left at (10, 10): on the screen its upper left corner is (20, 100)
    const log = letter({ minU: 10, maxU: 60, minV: 10, maxV: 50 });
    const at = log.findIndex((l) => l.startsWith('fillText(A,'));
    expect(at).toBeGreaterThan(0);
    expect(before(log, at, 'fillStyle=')).toBe('fillStyle=TOOL');
    // the wash under it is the ground's
    const wash = log.findIndex((l) => l.startsWith('fillRect('));
    expect(wash).toBeGreaterThan(-1);
    expect(before(log, wash, 'fillStyle=')).toBe('fillStyle=BG');
    // its middle 14 px in from that corner (34, 114): a label of 40 px of text and 6 px at either side, 22 px high –
    // the text sits 6 px in from the left edge of it
    expect(log[wash]).toBe('fillRect(8,103,52,22)');
    expect(log[at]).toBe('fillText(A,14,114.5)');
  });

  it('names each colour by its own letter', () => {
    for (const color of ['a', 'b', 'c', 'd']) {
      const log = letter({ minU: 10, maxU: 60, minV: 10, maxV: 50 }, color);
      expect(log.some((l) => l.startsWith(`fillText(${color.toUpperCase()},`))).toBe(true);
    }
  });

  it('is left out of a box that would be hidden by it: under 20 px on the screen in either direction', () => {
    expect(LETTER_MIN_PX).toBe(20);
    const shown = (w: number, h: number) =>
      letter({ minU: 10, maxU: 10 + w, minV: 10, maxV: 10 + h }).some((l) =>
        l.startsWith('fillText('),
      );
    // 10 mm are 20 px at this scale
    expect(shown(10, 10)).toBe(true);
    expect(shown(9.9, 40)).toBe(false);
    expect(shown(40, 9.9)).toBe(false);
    expect(shown(5, 5)).toBe(false);
    expect(shown(40, 40)).toBe(true);
  });

  it('stays inside the picture where the part reaches out of it', () => {
    const log = letter({ minU: -100, maxU: 40, minV: -100, maxV: 40 });
    const wash = log.find((l) => l.startsWith('fillRect('))!;
    const [x, y] = wash.slice('fillRect('.length, -1).split(',').map(Number);
    expect(x).toBeGreaterThanOrEqual(4);
    expect(y).toBeGreaterThanOrEqual(4);
  });
});

describe('the colours of the groups are read from the tokens of the theme', () => {
  const saved = (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
  afterEach(() => {
    (globalThis as { getComputedStyle?: unknown }).getComputedStyle = saved;
  });

  it('asks for --stage-group-a to -d, plain colours the canvas can parse', () => {
    const asked: string[] = [];
    (globalThis as { getComputedStyle?: unknown }).getComputedStyle = () => ({
      getPropertyValue: (name: string) => {
        asked.push(name);
        return ` value-of${name} `;
      },
    });
    const read = readColors({} as Element);
    expect(read.groups).toEqual({
      a: 'value-of--stage-group-a',
      b: 'value-of--stage-group-b',
      c: 'value-of--stage-group-c',
      d: 'value-of--stage-group-d',
    });
    expect(asked).toEqual(
      expect.arrayContaining([
        '--stage-group-a',
        '--stage-group-b',
        '--stage-group-c',
        '--stage-group-d',
      ]),
    );
    // the colours that mean something are still the ones they were
    expect(read.live).toBe('value-of--stage-select');
    expect(read.tool).toBe('value-of--stage-text');
  });
});
