import { analyzeProgram, HeightField } from '@lowrider/gcode-core';
import { describe, expect, it } from 'vitest';
import {
  alignToZero,
  KIND_AIR,
  KIND_CUT,
  KIND_RAPID,
  pathBuffers,
  pathColors,
  rasterizeTop,
  trianglesBounds,
} from '../src/render/scene3d';

describe('3D path buffers', () => {
  const job = analyzeProgram(
    'G21 G90\nG0 X0 Y0 Z5\nG1 Z-2 F300\nG1 X10 F1200\nG2 X20 Y0 I5 J0\nG53 G0 Z0\nG0 Z5\n',
  );

  it('splits the job into coloured line pieces', () => {
    const b = pathBuffers(job.segments, 0, 0.5);
    expect(b.segmentStart.length).toBe(job.segments.length + 1);
    expect(b.positions.length).toBe(b.kinds.length * 6);
    expect(b.kinds[0]).toBe(KIND_RAPID);
    expect([...b.kinds]).toContain(KIND_CUT);
    // The plunge from Z5 to −2 starts above the stock but ends in it.
    expect(b.kinds[b.segmentStart[1]!]).toBe(KIND_CUT);
    const above = pathBuffers(job.segments, -10, 0.5);
    expect([...above.kinds]).toContain(KIND_AIR);
    expect([...above.kinds]).not.toContain(KIND_CUT);
  });

  it('colours done pieces', () => {
    const b = pathBuffers(job.segments, 0, 0.5);
    const palette = {
      rapid: [0, 0, 1],
      air: [0, 1, 1],
      cut: [1, 0, 0],
      done: [0, 1, 0],
    } as const;
    const none = pathColors(b, 0, palette as never);
    expect([...none.slice(0, 3)]).toEqual([0, 0, 1]);
    const all = pathColors(b, 999, palette as never);
    expect([...all.slice(0, 3)]).toEqual([0, 1, 0]);
    expect([...all.slice(-3)]).toEqual([0, 1, 0]);
  });
});

describe('STL stock', () => {
  // One square of 10 × 10 mm at Z 5 (two triangles) and a degenerate one.
  const square = new Float32Array([
    0, 0, 5, 10, 0, 5, 10, 10, 5, 0, 0, 5, 10, 10, 5, 0, 10, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  ]);

  it('rasterizes the top surface into a height field', () => {
    const field = new HeightField({ minX: -5, minY: 0, maxX: 15, maxY: 10 }, 1, 10);
    expect(rasterizeTop(field, square, -3)).toBe(100);
    expect(field.heightAt(5, 5)).toBeCloseTo(5);
    expect(field.heightAt(-3, 5)).toBe(-3);
  });

  it('aligns the model to the work zero', () => {
    expect(trianglesBounds(alignToZero(square))).toEqual({
      min: { x: 0, y: 0, z: -4 },
      max: { x: 10, y: 10, z: 0 },
    });
  });
});
