import { interpret } from '@lowrider/gcode-core';
import { describe, expect, it } from 'vitest';
import { axesToVec4, JobTracker } from '../src/lib/tracking';

const p = (x: number, y: number, z = 0) => ({ x, y, z, a: 0 });

describe('axesToVec4', () => {
  it('maps report arrays and fills missing axes', () => {
    expect(axesToVec4([1, 2, 3, 4])).toEqual({ x: 1, y: 2, z: 3, a: 4 });
    expect(axesToVec4([1])).toEqual({ x: 1, y: 0, z: 0, a: 0 });
  });
});

describe('JobTracker', () => {
  it('returns null for an empty job', () => {
    expect(new JobTracker([]).locate(p(0, 0))).toBeNull();
  });

  it('uses the reported line number and picks the closest of its segments', () => {
    const { segments } = interpret('N10 G0 X0 Y0\nN20 G1 X10 F100\nN30 G1 Y10\nN30 G1 X0');
    const tracker = new JobTracker(segments);
    const hit = tracker.locate(p(5, 10.3), 30)!;
    expect(hit).toMatchObject({ index: 3, source: 'line' });
    expect(hit.deviation).toBeCloseTo(0.3);
    expect(hit.t).toBeCloseTo(0.5);
  });

  it('prefers moving forward on equally close candidates', () => {
    const { segments } = interpret('N5 G1 X10 F100\nN5 G1 X0\nN5 G1 X10');
    const tracker = new JobTracker(segments);
    expect(tracker.locate(p(5, 0), 5)!.index).toBe(2);
  });

  it('falls back to geometry without or with an unknown line number', () => {
    const { segments } = interpret('G0 X0 Y0\nG1 X10 F100\nG1 Y10');
    const tracker = new JobTracker(segments);
    expect(tracker.locate(p(10.2, 5))).toMatchObject({ index: 2, source: 'geometry' });
    expect(tracker.locate(p(4, 0.1), 999)).toMatchObject({ index: 1, source: 'geometry' });
  });

  it('reports no deviation on rapids', () => {
    const { segments } = interpret('G0 X50\nG1 Y10 F100');
    expect(new JobTracker(segments).locate(p(20, 1))).toMatchObject({ index: 0, deviation: null });
  });

  it('searches the whole job when the window result is far off', () => {
    const lines = ['G1 X1 F100'];
    for (let i = 0; i < 600; i++) lines.push(`G1 Y${i % 2 === 0 ? 1 : 0}`);
    lines.push('G1 X500 Y500');
    const { segments } = interpret(lines.join('\n'));
    const tracker = new JobTracker(segments);
    expect(tracker.locate(p(500, 499))!.index).toBe(segments.length - 1);
    tracker.reset();
    expect(tracker.locate(p(0.5, 0))!.index).toBe(0);
  });
});
