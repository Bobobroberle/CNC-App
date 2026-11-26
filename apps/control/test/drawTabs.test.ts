import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drawTable, type Colors, type Scene, type TabBar, type Viewport } from '../src/render/draw';

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

/** Paths that remember how they were drawn, and a canvas that writes down what it is told. */
class FakePath {
  ops: string[] = [];
  moveTo(x: number, y: number) {
    this.ops.push(`M${x},${y}`);
  }
  lineTo(x: number, y: number) {
    this.ops.push(`L${x},${y}`);
  }
  toString() {
    return this.ops.join(' ');
  }
}
function recorder() {
  const log: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]) =>
          log.push(`${String(name)}(${args.join(',')})`),
      set: (_, name, value) => {
        log.push(`${String(name)}=${value}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

/** What the table draws besides what is under test: nothing */
const scene = (own: Partial<Scene>): Pick<Scene, 'workspace'> & Partial<Scene> => ({
  workspace: null,
  ...own,
});

const bar = (x: number, selected: boolean): TabBar => ({
  span: [
    { x: x - 4, y: 10 },
    { x: x + 4, y: 10 },
  ],
  ends: [
    { x: 0, y: 1 },
    { x: 0, y: 1 },
  ],
  at: { x, y: 10 },
  selected,
});

describe('the tabs on the table', () => {
  const saved = (globalThis as { Path2D?: unknown }).Path2D;
  beforeEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = FakePath;
  });
  afterEach(() => {
    (globalThis as { Path2D?: unknown }).Path2D = saved;
  });

  it('are bars of their width with a tick across at each end – the muted ones first, the selected on top', () => {
    const { ctx, log } = recorder();
    drawTable(ctx, vp, scene({ drawingTabs: [bar(40, true), bar(80, false)] }), colors, false);
    // Muted first (rim, then the line), the selected one after it
    const styles = log.filter((l) => l.startsWith('strokeStyle=')).map((l) => l.split('=')[1]);
    expect(styles).toEqual(['BG', 'MUTED', 'BG', 'SELECT']);
    const strokes = log.filter((l) => l.startsWith('stroke(')).map((l) => l.slice(7, -1));
    // The bar of the muted tab, its ticks (7 px each way at scale 2: 3.5 mm), the bar again, the ticks again
    expect(strokes.slice(0, 4)).toEqual([
      'M76,10 L84,10',
      'M76,6.5 L76,13.5 M84,6.5 L84,13.5',
      'M76,10 L84,10',
      'M76,6.5 L76,13.5 M84,6.5 L84,13.5',
    ]);
    // The selected one is bolder: 9 px of rim, 6 px of line – the line 3 mm wide at this scale
    expect(log).toContain('lineWidth=4.5');
    expect(log).toContain('lineWidth=3');
    expect(log).toContain('lineWidth=3.5');
    expect(log).toContain('lineWidth=2');
    // No grip while tabs are not being put
    expect(log.some((l) => l.startsWith('arc('))).toBe(false);
  });

  it('carry a grip on the selected thing’s tabs while they are put by hand', () => {
    const { ctx, log } = recorder();
    drawTable(
      ctx,
      vp,
      scene({ drawingTabs: [bar(40, true), bar(60, true), bar(80, false)], drawingTabsGrip: true }),
      colors,
      false,
    );
    const grips = log.filter((l) => l.startsWith('arc('));
    // A dot of 7 px (3.5 mm) in the middle of each selected tab, none on the muted one
    expect(grips).toEqual([`arc(40,10,3.5,0,${Math.PI * 2})`, `arc(60,10,3.5,0,${Math.PI * 2})`]);
  });

  it('are not drawn where there are none', () => {
    const { ctx, log } = recorder();
    drawTable(ctx, vp, scene({ drawingTabs: [], drawingTabsGrip: true }), colors, false);
    expect(log.some((l) => l.startsWith('stroke(') || l.startsWith('arc('))).toBe(false);
    const again = recorder();
    drawTable(again.ctx, vp, scene({}), colors, false);
    expect(again.log.some((l) => l.startsWith('stroke('))).toBe(false);
  });
});
