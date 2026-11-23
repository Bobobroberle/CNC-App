import { describe, expect, it } from 'vitest';
import { interpret, parseProgram, planeAxes, type Diagnostic } from '../src';

const codes = (diagnostics: Diagnostic[]) => diagnostics.map((d) => d.code);
const run = (text: string, options = {}) => interpret(text, options);

describe('linear motion', () => {
  it('produces rapid and feed segments with modal motion and feed', () => {
    const r = run('G0 X10 Y5\nG1 Z-2 F300\nX20\nG0 Z5');
    expect(r.diagnostics).toEqual([]);
    expect(r.segments.map((s) => s.motion)).toEqual(['rapid', 'linear', 'linear', 'rapid']);
    expect(r.segments[2]).toMatchObject({
      lineIndex: 2,
      from: { x: 10, y: 5, z: -2, a: 0 },
      to: { x: 20, y: 5, z: -2, a: 0 },
      feed: 300,
      length: 10,
    });
    expect(r.segments[0]?.feed).toBe(0);
    expect(r.finalPosition).toEqual({ x: 20, y: 5, z: 5, a: 0 });
  });

  it('keeps the N word on segments', () => {
    const r = run('N7 G0 X1\nG0 X2');
    expect(r.segments[0]?.lineNumber).toBe(7);
    expect(r.segments[1]?.lineNumber).toBeUndefined();
  });

  it('handles incremental distance mode', () => {
    const r = run('G91 G0 X5 Y5\nX5\nG90 X0');
    expect(r.segments.map((s) => s.to.x)).toEqual([5, 10, 0]);
    expect(r.segments[1]?.to.y).toBe(5);
  });

  it('converts inches to millimetres including the feed', () => {
    const r = run('G20 G1 X1 F10\nG21 X10');
    expect(r.segments[0]?.to.x).toBeCloseTo(25.4);
    expect(r.segments[0]?.feed).toBeCloseTo(254);
    expect(r.segments[1]?.to.x).toBe(10);
    expect(r.finalState.units).toBe('mm');
  });

  it('supports the rotary axis A without unit conversion', () => {
    const r = run('G20 G1 A90 F100');
    expect(r.segments[0]?.to.a).toBe(90);
    expect(r.segments[0]?.length).toBe(0);
  });

  it('ignores system commands and empty lines', () => {
    const r = run('$H\n\n%\nG0 X1');
    expect(r.segments).toHaveLength(1);
    expect(r.diagnostics).toEqual([]);
  });

  it('accepts already parsed lines', () => {
    expect(interpret(parseProgram('G0 X1')).segments).toHaveLength(1);
  });

  it('sets only the motion mode without axis words', () => {
    const r = run('G1 F100\nX5');
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]?.motion).toBe('linear');
  });
});

describe('coordinate systems', () => {
  const wcsOffsets = [
    { x: 100, y: 200, z: -50, a: 0 },
    { x: 300, y: 0, z: 0, a: 10 },
  ];

  it('places work coordinates into the machine frame', () => {
    const r = run('G0 X0 Y0\nG55 X0 A0', { wcsOffsets });
    expect(r.segments[0]?.to).toEqual({ x: 100, y: 200, z: 0, a: 0 });
    expect(r.segments[1]?.to).toEqual({ x: 300, y: 200, z: 0, a: 10 });
    expect(r.finalState.wcs).toBe(1);
  });

  it('moves in machine coordinates with G53 regardless of G91', () => {
    const r = run('G91\nG53 G0 Z-5\nG53 X10', { wcsOffsets });
    expect(r.segments[0]).toMatchObject({ machineCoordinates: true, to: { z: -5 } });
    expect(r.segments[1]?.to.x).toBe(10);
  });

  it('rejects G53 with arcs', () => {
    expect(codes(run('G53 G2 X1 I1 F100').diagnostics)).toEqual(['invalid-value']);
  });

  it('applies and clears G92 offsets', () => {
    const r = run('G0 X10\nG92 X0\nG0 X5\nG92.1\nG0 X5');
    expect(r.segments.map((s) => s.to.x)).toEqual([10, 15, 5]);
  });

  it('sets work offsets with G10 L2 and L20', () => {
    const r = run(
      'G10 L2 P2 X50\nG55 G0 X0\nG0 X20\nG10 L20 P0 X0\nG0 X5\nG10 L20 P1 Z1\nG54 G0 Z0',
    );
    expect(r.diagnostics).toEqual([]);
    expect(r.segments.map((s) => s.to.x)).toEqual([50, 70, 75, 75]);
    // L20 on G54 at machine Z 0: work Z 1 => offset -1, so work Z0 = machine -1
    expect(r.segments[3]?.to.z).toBe(-1);
  });

  it('validates G10 words', () => {
    expect(codes(run('G10 L3 P1 X0').diagnostics)).toEqual(['invalid-value']);
    expect(codes(run('G10 L2 X0').diagnostics)).toEqual(['invalid-value']);
    expect(codes(run('G10 L2 P7 X0').diagnostics)).toEqual(['invalid-value']);
  });

  it('accepts G10 and G92 without axis words', () => {
    const r = run('G10 L2 P1\nG92\nG0 X1', { recordLines: true });
    expect(r.diagnostics).toEqual([]);
    expect(r.lines.map((l) => l.axisUse)).toEqual(['none', 'none', 'motion']);
  });

  it('accounts for the tool length offset in G92', () => {
    const r = run('G43.1 Z5\nG0 Z0\nG92 Z10\nG0 Z0');
    expect(r.segments.map((s) => s.to.z)).toEqual([5, -5]);
  });

  it('applies dynamic tool length offsets', () => {
    const r = run('G43.1 Z10\nG0 Z0\nG49\nG0 Z0');
    expect(r.segments.map((s) => s.to.z)).toEqual([10, 0]);
    expect(codes(run('G43.1').diagnostics)).toEqual(['missing-axis-words']);
  });

  it('records work positions per line on request', () => {
    const r = run('G0 X1\nG92 X0\nG0 X2', { recordLines: true, wcsOffsets });
    expect(r.lines).toHaveLength(3);
    expect(r.lines[0]).toMatchObject({
      workBefore: { x: -100 },
      workAfter: { x: 1 },
      axisUse: 'motion',
    });
    expect(r.lines[1]).toMatchObject({ workAfter: { x: 0 }, axisUse: 'offset' });
    expect(r.lines[2]?.workAfter.x).toBe(2);
    expect(run('G0 X1').lines).toEqual([]);
  });
});

describe('arcs', () => {
  it('interprets G2/G3 with incremental IJ', () => {
    const r = run('G0 X10 Y0\nG3 X0 Y10 I-10 J0 F500\nG2 X10 Y0 I0 J-10');
    expect(r.diagnostics).toEqual([]);
    const [, ccw, cw] = r.segments;
    expect(ccw?.arc).toMatchObject({ plane: 'XY', center: [0, 0], radius: 10 });
    expect(ccw?.arc?.sweep).toBeCloseTo(Math.PI / 2);
    expect(ccw?.length).toBeCloseTo((Math.PI / 2) * 10);
    expect(cw?.arc?.sweep).toBeCloseTo(-Math.PI / 2);
  });

  it('interprets full circles', () => {
    const r = run('G0 X10\nG2 X10 Y0 I-10 F100\nG3 X10 I-10');
    expect(r.segments[1]?.arc?.sweep).toBeCloseTo(-2 * Math.PI);
    expect(r.segments[2]?.arc?.sweep).toBeCloseTo(2 * Math.PI);
  });

  it('interprets the R form for short and long arcs', () => {
    const short = run('G2 X10 Y10 R10 F100').segments[0]?.arc;
    expect(short?.center[0]).toBeCloseTo(10);
    expect(short?.center[1]).toBeCloseTo(0);
    expect(short?.sweep).toBeCloseTo(-Math.PI / 2);
    const long = run('G2 X10 Y10 R-10 F100').segments[0]?.arc;
    expect(long?.center[0]).toBeCloseTo(0);
    expect(long?.center[1]).toBeCloseTo(10);
    expect(long?.sweep).toBeCloseTo((-3 * Math.PI) / 2);
    const ccw = run('G3 X10 Y10 R10 F100').segments[0]?.arc;
    expect(ccw?.center[0]).toBeCloseTo(0);
    expect(ccw?.center[1]).toBeCloseTo(10);
    // half circle with a tiny rounding error in R is accepted
    const half = run('G2 X20 R9.9999999999 F100').segments[0]?.arc;
    expect(half?.radius).toBeCloseTo(10);
  });

  it('rejects invalid R arcs', () => {
    expect(codes(run('G2 X20 R5 F100').diagnostics)).toEqual(['arc-radius-too-small']);
    expect(codes(run('G2 X0 Y0 R5 F100').diagnostics)).toEqual(['arc-full-circle-radius']);
  });

  it('checks the end point radius like the firmware', () => {
    expect(codes(run('G0 X10\nG3 X0 Y10.004 I-10 F100').diagnostics)).toEqual([]);
    expect(codes(run('G0 X10\nG3 X0 Y10.2 I-10 F100').diagnostics)).toEqual([
      'arc-radius-mismatch',
    ]);
    expect(codes(run('G0 X1000\nG3 X0 Y1000.6 I-1000 F100').diagnostics)).toEqual([
      'arc-radius-mismatch',
    ]);
  });

  it('supports helical arcs and rotary motion along an arc', () => {
    const s = run('G0 X10\nG3 X-10 Y0 Z-3 A45 I-10 F100').segments[1]!;
    expect(s.to).toMatchObject({ z: -3, a: 45 });
    expect(s.length).toBeCloseTo(Math.hypot(Math.PI * 10, 3));
  });

  it('supports the ZX and YZ planes', () => {
    const zx = run('G18 G0 X10\nG2 X0 Z10 I-10 F100').segments[1]!;
    expect(zx.arc?.plane).toBe('ZX');
    expect(zx.arc?.center).toEqual([0, 0]);
    const yz = run('G19 G0 Y10\nG3 Y0 Z10 J-10 F100').segments[1]!;
    expect(yz.arc?.plane).toBe('YZ');
    expect(planeAxes('YZ')).toMatchObject({ axis0: 'y', axis1: 'z', linear: 'x' });
  });

  it('supports absolute arc centres with G90.1', () => {
    const r = run('G0 X10 Y0\nG90.1 G3 X0 Y10 I0 J0 F100\nG91.1', {
      wcsOffsets: [{ x: 5, y: 5, z: 0, a: 0 }],
    });
    expect(r.segments[1]?.arc?.center).toEqual([5, 5]);
    expect(r.finalState.arcDistance).toBe('incremental');
  });

  it('treats a missing absolute centre word as zero', () => {
    const r = run('G0 X10 Y0\nG90.1 G3 X-10 Y0 I0 F100');
    expect(r.segments[1]?.arc?.center).toEqual([0, 0]);
    expect(run('G0 X0 Y-10\nG90.1 G3 X0 Y10 J0 F100').segments[1]?.arc?.center).toEqual([0, 0]);
  });

  it('rejects arcs without plane axes or offsets', () => {
    expect(codes(run('G2 F100').diagnostics)).toEqual(['missing-axis-words']);
    expect(codes(run('G2 Z-1 I5 F100').diagnostics)).toEqual(['missing-axis-words']);
    expect(codes(run('G2 X10 F100').diagnostics)).toEqual(['arc-missing-offsets']);
    expect(codes(run('G2 X10 I5 K1 F100').diagnostics)).toEqual(['arc-offset-in-wrong-plane']);
  });

  it('interprets arcs with one offset word missing', () => {
    expect(run('G0 X10\nG3 X-10 J0 F100').diagnostics).toEqual([
      expect.objectContaining({ code: 'arc-radius-mismatch' }),
    ]);
    expect(run('G0 Y-10\nG3 Y10 J10 F100').segments[1]?.arc?.radius).toBe(10);
  });
});

describe('feed, spindle, tools and events', () => {
  it('requires a feed rate for feed moves', () => {
    expect(codes(run('G1 X10').diagnostics)).toEqual(['missing-feed-rate']);
    expect(codes(run('G1 X10 F-1').diagnostics)).toEqual(['invalid-value']);
  });

  it('requires F on every move in inverse time mode', () => {
    const r = run('G1 F500\nG93 G1 X10 F2\nX20');
    expect(codes(r.diagnostics)).toEqual(['missing-feed-rate']);
    expect(r.segments[0]).toMatchObject({ feedMode: 'inverseTime', feed: 2 });
    const back = run('G93 G1 X1 F2\nG94 G1 X2 F100');
    expect(back.segments[1]).toMatchObject({ feedMode: 'unitsPerMinute', feed: 100 });
    // feed is forgotten when switching to G93 and F0 is invalid
    expect(codes(run('G1 F100\nG93 G1 X1 F0').diagnostics)).toEqual(['missing-feed-rate']);
  });

  it('tracks spindle, coolant and tool state', () => {
    const r = run('T2 M6\nS18000 M3 M8 M7\nG1 X1 F100\nM9\nM4\nM5');
    expect(r.segments[0]).toMatchObject({ spindle: 'cw', spindleSpeed: 18000, tool: 2 });
    expect(r.events.map((e) => e.kind)).toEqual(['toolChange', 'spindle', 'spindle', 'spindle']);
    expect(r.events[0]).toMatchObject({ tool: 2, segmentIndex: 0 });
    expect(r.events.map((e) => e.spindle)).toEqual([undefined, 'cw', 'ccw', 'off']);
    expect(r.finalState).toMatchObject({ mist: false, flood: false });
    expect(run('M7 M8').finalState).toMatchObject({ mist: true, flood: true });
    expect(codes(run('S-1').diagnostics)).toEqual(['invalid-value']);
  });

  it('records dwells, pauses and program end', () => {
    const r = run('G4 P1.5\nM0\nM1\nG91 G55 G93 M3\nM30');
    expect(r.events).toEqual([
      { kind: 'dwell', lineIndex: 0, segmentIndex: 0, seconds: 1.5 },
      { kind: 'pause', lineIndex: 1, segmentIndex: 0, optional: false },
      { kind: 'pause', lineIndex: 2, segmentIndex: 0, optional: true },
      { kind: 'spindle', lineIndex: 3, segmentIndex: 0, spindle: 'cw' },
      { kind: 'end', lineIndex: 4, segmentIndex: 0 },
    ]);
    expect(r.finalState).toMatchObject({
      distance: 'absolute',
      wcs: 0,
      feedMode: 'unitsPerMinute',
      spindle: 'off',
      motion: 'G1',
    });
    expect(run('M2').events[0]?.kind).toBe('end');
    expect(codes(run('G4').diagnostics)).toEqual(['invalid-value']);
    expect(codes(run('G4 P-1').diagnostics)).toEqual(['invalid-value']);
  });

  it('accepts digital and analog output M codes and plane/path codes', () => {
    const r = run('M62 P1\nM63 P1\nG17 G40 G49 G61 G80 G94 G21 G90');
    expect(r.diagnostics).toEqual([]);
    expect(run('G19\nG18').finalState.plane).toBe('ZX');
  });
});

describe('positions unknown to the preview', () => {
  it('warns on G28/G30 and probing, without moving', () => {
    const r = run('G28\nG30 Z5\nG38.2 Z-10 F50\nG0 X1');
    expect(codes(r.diagnostics)).toEqual([
      'unknown-position',
      'unknown-position',
      'unknown-position',
    ]);
    expect(r.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    expect(r.segments).toHaveLength(1);
    expect(r.finalState.motion).toBe('G0');
  });

  it('accepts probe mode without axis words', () => {
    expect(run('G38.3').diagnostics).toEqual([]);
  });
});

describe('errors', () => {
  it('skips lines with parse errors', () => {
    const r = run('G0 X1 (open\nG0 X2', { recordLines: true });
    expect(codes(r.diagnostics)).toEqual(['unclosed-comment']);
    expect(r.segments).toHaveLength(1);
    expect(r.lines[0]?.skipped).toBe(true);
  });

  it('rejects A words when the machine has no rotary axis', () => {
    const r = run('G0 X1\nG1 A90 F100', { rotaryAxis: false });
    expect(codes(r.diagnostics)).toEqual(['unsupported-axis']);
    expect(r.segments).toHaveLength(1);
  });

  it('rejects G43 tool table offsets like FluidNC does', () => {
    const r = run('G0 X1\nG0 G43 Z4. H1\nG0 Z2.5');
    expect(codes(r.diagnostics)).toEqual(['tool-length-table']);
    expect(r.segments.map((s) => s.to.z)).toEqual([0, 2.5]);
  });

  it('rejects unsupported words, axes and codes', () => {
    expect(codes(run('G0 B10').diagnostics)).toEqual(['unsupported-axis']);
    expect(codes(run('G0 Q1').diagnostics)).toEqual(['unsupported-word']);
    expect(codes(run('G0 X1 X2').diagnostics)).toEqual(['duplicate-word']);
    expect(codes(run('G81 X1').diagnostics)).toEqual(['unsupported-gcode']);
    expect(codes(run('M98').diagnostics)).toEqual(['unsupported-mcode']);
    expect(codes(run('G0 G1 X1').diagnostics)).toEqual(['modal-group-conflict']);
    expect(codes(run('M3 M5').diagnostics)).toEqual(['modal-group-conflict']);
    expect(codes(run('G80 X1').diagnostics)).toEqual(['axis-words-without-motion']);
  });

  it('includes line indices and severities', () => {
    const d = run('G0 X1\nG1 X2').diagnostics[0]!;
    expect(d).toMatchObject({ severity: 'error', lineIndex: 1 });
    expect(d.message).toMatch(/feed/);
  });
});
