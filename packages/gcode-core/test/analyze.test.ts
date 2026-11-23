import { describe, expect, it } from 'vitest';
import {
  analyzeProgram,
  checkWorkspace,
  interpret,
  isEmptyBounds,
  LOWRIDER_V4_KINEMATICS,
} from '../src';

describe('analyzeProgram', () => {
  it('summarises a program', () => {
    const a = analyzeProgram(
      'T1 M6\nG0 X10 Y10\nG1 Z-2 F300\nG1 X20 F1200\nG93 G1 X30 F5\nG94\nT3 M6\n',
      {
        kinematics: LOWRIDER_V4_KINEMATICS,
      },
    );
    expect(a.lineCount).toBe(7);
    expect(a.segments).toHaveLength(4);
    expect(a.tools).toEqual([1, 3]);
    expect(a.usesRotary).toBe(false);
    expect(a.feedRange).toEqual({ min: 300, max: 1200 });
    expect(a.rapidLength).toBeCloseTo(Math.hypot(10, 10));
    expect(a.feedLength).toBeCloseTo(22);
    expect(a.cutBounds.min).toEqual({ x: 10, y: 10, z: -2, a: 0 });
    expect(a.bounds.min.x).toBe(0);
    expect(a.timeline!.total).toBeGreaterThan(0);
  });

  it('works without kinematics and motion', () => {
    const a = analyzeProgram('G0 A90');
    expect(a.timeline).toBeNull();
    expect(a.feedRange).toBeNull();
    expect(a.usesRotary).toBe(true);
    expect(isEmptyBounds(a.cutBounds)).toBe(true);
  });
});

describe('checkWorkspace', () => {
  const workspace = { min: { x: 0, y: 0, z: -100 }, max: { x: 1200, y: 2400, z: 0 } };

  it('passes a job inside the travel', () => {
    const { segments } = interpret('G0 X10 Y10 Z-5\nG1 X100 F100', {
      wcsOffsets: [{ x: 0, y: 0, z: -50, a: 0 }],
    });
    expect(checkWorkspace(segments, workspace)).toEqual([]);
  });

  it('reports the first crossing segment and the furthest value per limit', () => {
    const { segments } = interpret(
      'G0 X10 Y10\nG0 X-5\nG0 X-20\nG0 Z5\nG0 X1190 Y10\nG3 X1190 Y40 I0 J15 F100',
    );
    const v = checkWorkspace(segments, workspace);
    expect(v).toEqual([
      { axis: 'x', side: 'min', value: -20, limit: 0, segmentIndex: 1, lineIndex: 1 },
      { axis: 'z', side: 'max', value: 5, limit: 0, segmentIndex: 3, lineIndex: 3 },
      expect.objectContaining({ axis: 'x', side: 'max', limit: 1200, segmentIndex: 5 }),
    ]);
    // the arc bulges beyond its end points to x = 1205
    expect(v[2]!.value).toBeCloseTo(1205);
  });
});
