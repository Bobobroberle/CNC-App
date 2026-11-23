import { describe, expect, it } from 'vitest';
import { formatNumber, interpret, transformProgram, type Segment, type Transform } from '../src';

const codes = (r: { diagnostics: { code: string }[] }) => r.diagnostics.map((d) => d.code);

/** Applies the transform to a point the way transformProgram should. */
function apply(t: Transform, x: number, y: number) {
  const s = t.scale ?? 1;
  const th = ((t.rotation ?? 0) * Math.PI) / 180;
  const px = t.pivot?.x ?? 0;
  const py = t.pivot?.y ?? 0;
  const dx = (x - px) * s;
  const dy = (y - py) * s;
  return {
    x: px + dx * Math.cos(th) - dy * Math.sin(th) + (t.offset?.x ?? 0),
    y: py + dx * Math.sin(th) + dy * Math.cos(th) + (t.offset?.y ?? 0),
  };
}

function expectSameGeometry(original: Segment[], transformed: Segment[], t: Transform) {
  expect(transformed).toHaveLength(original.length);
  original.forEach((s, i) => {
    const o = transformed[i]!;
    const to = apply(t, s.to.x, s.to.y);
    expect(o.to.x).toBeCloseTo(to.x, 3);
    expect(o.to.y).toBeCloseTo(to.y, 3);
    expect(o.motion).toBe(s.motion);
    if (s.arc) {
      const c = apply(t, s.arc.center[0], s.arc.center[1]);
      expect(o.arc!.center[0]).toBeCloseTo(c.x, 3);
      expect(o.arc!.center[1]).toBeCloseTo(c.y, 3);
      expect(o.arc!.sweep).toBeCloseTo(s.arc.sweep, 4);
      expect(o.arc!.radius).toBeCloseTo(s.arc.radius * (t.scale ?? 1), 3);
    }
  });
}

const JOB = [
  '%',
  '(pocket)',
  'G90 G21 G17',
  'G0 X10 Y0 Z5',
  'G1 Z-1 F300',
  'G3 X0 Y10 I-10 J0',
  'G2 X-10 Y0 R10',
  'G1 X-10 Y-10',
  'G91 G1 X5 Y-5',
  'G90 G0 Z5',
  'M30',
].join('\n');

describe('formatNumber', () => {
  it('trims zeros and avoids negative zero', () => {
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(10)).toBe('10');
    expect(formatNumber(-0.00001)).toBe('0');
    expect(formatNumber(0.123456, 'inch')).toBe('0.12346');
    expect(formatNumber(0.123456)).toBe('0.1235');
  });
});

describe('transformProgram', () => {
  it('leaves a program unchanged by the identity transform', () => {
    const r = transformProgram(`${JOB}\n`, {});
    expect(r.text).toBe(`${JOB}\n`);
    expect(r.diagnostics).toEqual([]);
  });

  it('offsets absolute moves, but not incremental or machine moves', () => {
    const r = transformProgram('G0 X10 Y5\nG91 X1\nG90 G53 G0 X0 Y0\nG1 Z-1 F100', {
      offset: { x: 100, y: 50, z: 2 },
    });
    expect(r.text.split('\n')).toEqual(['G0 X110 Y55', 'G91 X1', 'G90 G53 G0 X0 Y0', 'G1 Z1 F100']);
  });

  it('rotates paths including arcs about a pivot', () => {
    const t: Transform = { rotation: 30, pivot: { x: 5, y: 5 }, offset: { x: 3, y: -2 } };
    const r = transformProgram(JOB, t);
    expect(r.diagnostics).toEqual([]);
    expectSameGeometry(interpret(JOB).segments.slice(1), interpret(r.text).segments.slice(1), t);
  });

  it('scales paths including R arcs, optionally in Z', () => {
    const t: Transform = { scale: 2 };
    const r = transformProgram(JOB, t);
    expectSameGeometry(interpret(JOB).segments, interpret(r.text).segments, t);
    expect(r.text).toContain('G1 Z-1 F300');
    expect(transformProgram('G1 Z-1 F300', { scale: 2, scaleZ: true }).text).toBe('G1 Z-2 F300');
    expect(transformProgram('G91 G1 Z-1 F300', { scale: 2, scaleZ: true }).text).toBe(
      'G91 G1 Z-2 F300',
    );
  });

  it('emits both X and Y when rotating a single-axis move', () => {
    const r = transformProgram('G0 X10 Y0\nG1 X20 F100\nG91 G1 Y5', { rotation: 90 });
    expect(r.text.split('\n')).toEqual(['G0 X0 Y10', 'G1 X0 Y20 F100', 'G91 G1 X-5 Y0']);
    expect(r.diagnostics).toEqual([]);
  });

  it('warns when a rotated move assumes an unknown start position', () => {
    const r = transformProgram('G0 X10', { rotation: 90 });
    expect(r.text).toBe('G0 X0 Y10');
    expect(codes(r)).toEqual(['transform-assumed-position']);
    // a G53 move makes the position known
    expect(codes(transformProgram('G53 G0 X0 Y0\nG0 X10', { rotation: 90 }))).toEqual([]);
  });

  it('works in inch programs with millimetre offsets', () => {
    const r = transformProgram('G20 G0 X1 Y1', { offset: { x: 25.4 } });
    expect(r.text).toBe('G20 G0 X2 Y1');
  });

  it('keeps line numbers and comments', () => {
    const r = transformProgram('N10 G0 X1 (move) ;tail', { offset: { x: 1 } });
    expect(r.text).toBe('N10 G0 X2 (move) ;tail');
  });

  it('transforms absolute arc centres', () => {
    const job = 'G0 X10 Y0\nG90.1 G3 X0 Y10 I0 J0 F100\nG3 X-10 Y0 J0 F100\nG3 X10 Y0 I0';
    const t: Transform = { rotation: 45, offset: { x: 7 } };
    const r = transformProgram(job, t);
    expectSameGeometry(interpret(job).segments.slice(1), interpret(r.text).segments.slice(1), t);
  });

  it('scales and offsets arcs in the ZX and YZ planes when Z scales too', () => {
    const job =
      'G18 G0 X10 Z0\nG2 X0 Z10 I-10 K0 F100\nG90.1 G2 X-10 Z0 I0 K0\nG19 G91.1 G0 Y10 Z0\nG3 Y0 Z10 J-10 R10';
    const r = transformProgram(job, { scale: 2, scaleZ: true, offset: { x: 1, z: 1 } });
    expect(r.diagnostics).toEqual([]);
    const lines = r.text.split('\n');
    expect(lines[1]).toBe('G2 X1 Z21 I-20 K0 F100');
    expect(lines[2]).toBe('G90.1 G2 X-19 Z1 I1 K1');
    expect(lines[4]).toBe('G3 Y0 Z21 J-20 R20');
    expect(interpret(r.text).diagnostics).toEqual([]);
  });

  it('refuses to rotate or XY-scale arcs outside the XY plane', () => {
    const job = 'G18 G0 X10 Y0\nG2 X0 Z10 I-10 F100';
    for (const t of [{ rotation: 10 }, { scale: 2 }]) {
      const r = transformProgram(job, t);
      expect(codes(r)).toEqual(['transform-unsupported']);
      expect(r.text.split('\n')[1]).toBe('G2 X0 Z10 I-10 F100');
    }
  });

  it('reports offsets and stored positions it cannot transform', () => {
    const r = transformProgram('G92 X0\nG28 X0\nG10 L2 P1 X5\n$H\nG1 X1 (open', {
      offset: { x: 1 },
    });
    expect(r.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['transform-unsupported', 'error'],
      ['transform-unsupported', 'warning'],
      ['transform-unsupported', 'error'],
    ]);
    expect(r.text).toBe('G92 X0\nG28 X0\nG10 L2 P1 X5\n$H\nG1 X1 (open');
  });

  it('reads modal codes on the moved line itself', () => {
    const r = transformProgram('G20\nG21 G17 G94 G54 G0 X1 Y1', { offset: { x: 1 } });
    expect(r.text.split('\n')[1]).toBe('G21 G17 G94 G54 G0 X2 Y1');
    const g53 = transformProgram('G53 G0 X0\nG53 G0 Y0\nG0 X5', { rotation: 90 });
    expect(codes(g53)).toEqual([]);
  });

  it('scales incremental moves and arc offsets per given word', () => {
    const r = transformProgram('G91 G1 Y5 F100\nG2 X10 I5\nG2 Y10 J5', { scale: 2 });
    expect(r.text.split('\n')).toEqual(['G91 G1 Y10 F100', 'G2 X20 I10', 'G2 Y20 J10']);
  });

  it('transforms absolute YZ arc centres', () => {
    const r = transformProgram('G19 G90.1 G0 Y10 Z0\nG3 Y0 Z10 J0 K0 F100\nG3 Y-10 Z0 K0', {
      scale: 2,
      scaleZ: true,
      offset: { y: 1 },
    });
    expect(r.text.split('\n').slice(1)).toEqual(['G3 Y1 Z20 J1 K0 F100', 'G3 Y-19 Z0 K0']);
  });

  it('rejects a non-positive scale', () => {
    expect(() => transformProgram('G0 X1', { scale: 0 })).toThrow(RangeError);
  });
});
