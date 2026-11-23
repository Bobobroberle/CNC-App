import { describe, expect, it } from 'vitest';
import { DEMO_SCAN_AREA, demoHref, demoJobContours, placeOn } from '../src/lib/demo';
import { isFullDemo, memoryStorage } from '../src/lib/persist';
import { SIM_BOARD, SIM_PLATE } from '../src/sim';
import { Simulator, SURFACE_Z } from '../src/sim/simulator';

describe('full demo', () => {
  it('is on for the demo page and the #demo address only', () => {
    expect(isFullDemo('full', '')).toBe(true);
    expect(isFullDemo(undefined, '#demo')).toBe(true);
    expect(isFullDemo(true, '#simulator')).toBe(false);
    expect(isFullDemo(undefined, '')).toBe(false);
    // In the test run there is neither flag nor address.
    expect(isFullDemo()).toBe(false);
  });

  it('keeps what it writes in memory only', () => {
    const s = memoryStorage();
    expect(s.getItem('a')).toBeNull();
    s.setItem('a', '1');
    expect(s.getItem('a')).toBe('1');
    expect(memoryStorage().getItem('a')).toBeNull();
  });

  it('switches the address to the demo and back', () => {
    expect(demoHref(true, 'http://pi:8080/')).toBe('http://pi:8080/#demo');
    expect(demoHref(true, 'file:///C:/x/app.html#simulator')).toBe('file:///C:/x/app.html#demo');
    expect(demoHref(false, 'http://pi:8080/#demo')).toBe('http://pi:8080/');
  });

  it('places points on a turned part', () => {
    const p = placeOn({ x: 10, y: 20, angle: 90 }, { x: 5, y: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(25);
    expect(placeOn({ x: 1, y: 2, angle: 0 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
  });

  it('lays the example job inside the board, clear of holes 2 and 3', () => {
    const hole1 = SIM_BOARD.holes[0]!;
    const points = demoJobContours().flatMap((c) => c.points);
    for (const p of points) {
      // Job coordinates are relative to hole 1, in board orientation.
      const bx = p.x + hole1.x;
      const by = p.y + hole1.y;
      expect(bx).toBeGreaterThan(5);
      expect(bx).toBeLessThan(SIM_BOARD.width - 5);
      expect(by).toBeGreaterThan(5);
      expect(by).toBeLessThan(SIM_BOARD.height - 5);
    }
    for (const h of SIM_BOARD.holes.slice(1)) {
      const inside = points.some(
        (p) => Math.abs(p.x + hole1.x - h.x) < 15 && Math.abs(p.y + hole1.y - h.y) < 15,
      );
      expect(inside).toBe(false);
    }
  });

  it('scans an area that holds the plate and the board', () => {
    const plateEnd = (SIM_PLATE.n - 1) * SIM_PLATE.pitch;
    const corners = [
      placeOn(SIM_PLATE, { x: 0, y: 0 }),
      placeOn(SIM_PLATE, { x: plateEnd, y: plateEnd }),
      placeOn(SIM_BOARD, { x: 0, y: 0 }),
      placeOn(SIM_BOARD, { x: SIM_BOARD.width, y: SIM_BOARD.height }),
    ];
    for (const c of corners) {
      expect(c.x).toBeGreaterThan(DEMO_SCAN_AREA.minX - 40);
      expect(c.x).toBeLessThan(DEMO_SCAN_AREA.maxX + 40);
      expect(c.y).toBeGreaterThan(DEMO_SCAN_AREA.minY - 30);
      expect(c.y).toBeLessThan(DEMO_SCAN_AREA.maxY + 30);
    }
  });
});

describe('simulator for the demo', () => {
  it('finds the commanded position for a physical point', () => {
    const sim = new Simulator();
    const target = { x: 600, y: 250 };
    const z = SURFACE_Z + 30;
    const cmd = sim.commandedFor(target, z);
    const phys = sim.physical({ ...cmd, z });
    expect(phys.x).toBeCloseTo(target.x, 6);
    expect(phys.y).toBeCloseTo(target.y, 6);
  });
});
