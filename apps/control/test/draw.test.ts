import { describe, expect, it } from 'vitest';
import { fitViewport, gridStep, screenToWorld, worldToScreen } from '../src/render/draw';

const job = { minU: 0, maxU: 300, minV: 0, maxV: 180 };

describe('fitViewport', () => {
  it('shows the whole extent, below the legend', () => {
    const vp = fitViewport(job, 520, 320, 1);
    const [left, bottom] = worldToScreen(vp, job.minU, job.minV);
    const [right, top] = worldToScreen(vp, job.maxU, job.maxV);
    expect(left).toBeGreaterThanOrEqual(31.9);
    expect(right).toBeLessThanOrEqual(520 - 31.9);
    expect(top).toBeGreaterThanOrEqual(63.9);
    expect(bottom).toBeLessThanOrEqual(320 - 31.9);
  });

  it('keeps the extent clear of the inset in the top right corner', () => {
    const corner = { width: 156, height: 124 };
    for (const [width, height] of [
      [520, 320],
      [790, 520],
      [300, 600],
    ] as const) {
      const vp = fitViewport(job, width, height, 1, corner);
      const [right, top] = worldToScreen(vp, job.maxU, job.maxV);
      // Either left of the inset or below it.
      const clear = right <= width - corner.width + 0.1 || top >= corner.height - 0.1;
      expect(clear, `${width}×${height}`).toBe(true);
      // And never smaller than without the inset would be needed for one of the two ways.
      expect(vp.scale).toBeGreaterThan(0.3);
    }
  });

  it('lets the inset cover a corner rather than shrink the picture to a stamp', () => {
    const corner = { width: 156, height: 124 };
    // A short, narrow stage (Split View): going beside or below the inset would cost most of the size.
    const small = fitViewport(job, 330, 230, 1, corner);
    const plain = fitViewport(job, 330, 230, 1);
    expect(small.scale).toBe(plain.scale);
    // With room, the picture still keeps clear.
    const roomy = fitViewport(job, 700, 420, 1, corner);
    expect(roomy.scale).toBeLessThan(fitViewport(job, 700, 420, 1).scale);
  });

  it('falls back to a 100 mm square around the zero without an extent', () => {
    const vp = fitViewport(null, 400, 400, 2);
    const [u, v] = screenToWorld(vp, 200, 216);
    expect(u).toBeCloseTo(50, 5);
    expect(v).toBeCloseTo(50, 5);
    expect(vp.dpr).toBe(2);
  });
});

describe('gridStep', () => {
  it('is the smallest power of ten at least 16 px apart', () => {
    expect(gridStep(2)).toBe(10);
    expect(gridStep(1.6)).toBe(10);
    expect(gridStep(0.5)).toBe(100);
    expect(gridStep(40)).toBe(1);
  });
});
