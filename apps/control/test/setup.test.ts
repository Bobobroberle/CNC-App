import { analyzeProgram, emptyBounds } from '@lowrider/gcode-core';
import { DEFAULT_TOOLS } from '@lowrider/workshop';
import { describe, expect, it } from 'vitest';
import { defaultStock, feedRatio, jobCollisions, stockFromSize } from '../src/lib/setup';

describe('job setup', () => {
  const job = analyzeProgram('G21 G90\nG0 X0 Y0 Z5\nG1 Z-3 F300\nG1 X50 F1200\nG1 Y20\nG0 Z5\n');

  it('derives the stock from the job', () => {
    expect(defaultStock(emptyBounds())).toBeNull();
    expect(defaultStock(job.cutBounds)).toEqual({
      min: { x: -5, y: -5, z: -3 },
      max: { x: 55, y: 25, z: 0 },
    });
    const shallow = { ...job.cutBounds, min: { ...job.cutBounds.min, z: -0.2 } };
    expect(defaultStock(shallow)!.min.z).toBe(-1);
    expect(stockFromSize(100, 50, 18)).toEqual({
      min: { x: 0, y: 0, z: -18 },
      max: { x: 100, y: 50, z: 0 },
    });
  });

  it('checks the job against clamps and the gantry', () => {
    const stock = stockFromSize(60, 30, 18);
    const tool = DEFAULT_TOOLS[0]!;
    expect(jobCollisions(job.segments, stock, [], tool)).toEqual([]);
    const clamp = { name: 'Zwinge', min: { x: 45, y: 15, z: 0 }, max: { x: 60, y: 30, z: 30 } };
    const hits = jobCollisions(job.segments, stock, [clamp], tool);
    expect(hits.map((h) => `${h.kind}:${h.object}`)).toContain('tool-fixture:Zwinge');
  });

  it('compares the program feed with the suggestion', () => {
    expect(feedRatio(null, 1000)).toBeNull();
    expect(feedRatio({ max: 1200 }, 0)).toBeNull();
    expect(feedRatio({ max: 1500 }, 1000)).toBe(1.5);
  });
});
