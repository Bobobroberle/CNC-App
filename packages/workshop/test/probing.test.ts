import { describe, expect, it } from 'vitest';
import {
  boreDiameter,
  centerRoutine,
  cornerRoutine,
  edgeRoutine,
  parseProbeReport,
  toolLengthOffsetCommand,
  toolLengthRoutine,
  zeroCommand,
  zRoutine,
  type ProbeRoutine,
  type Results,
} from '../src';

const p = { feed: 100, maxTravel: 40, retract: 10, toolDiameter: 6 };
const lines = (r: ProbeRoutine, res: Results = {}) => r.steps.map((s) => s.gcode(res));

describe('probe routines', () => {
  it('touches off Z on a plate', () => {
    const r = zRoutine(p, 0.5);
    expect(lines(r)).toEqual(['G91 G38.2 Z-40 F100', 'G91 G0 Z10', 'G90']);
    expect(r.finish({ z: -50 })).toEqual({ z: -50.5 });
  });

  it('finds an edge, compensating the tool radius', () => {
    const r = edgeRoutine(p, 'x', 1);
    expect(lines(r)).toEqual(['G91 G38.2 X40 F100', 'G91 G0 X-10', 'G90']);
    expect(r.finish({ x: 100 })).toEqual({ x: 103 });
    expect(edgeRoutine(p, 'y', -1).finish({ y: 50 })).toEqual({ y: 47 });
    // Edge plate with a 5 mm wall between tool and workpiece
    expect(edgeRoutine(p, 'x', 1, 5).finish({ x: 100 })).toEqual({ x: 108 });
  });

  it('probes an outside corner', () => {
    const r = cornerRoutine(p, 'front-left', { plateThickness: 0, inset: 10, depth: 5 });
    const res = { z: -20, x: 95, y: 195 };
    expect(lines(r, res)).toEqual([
      'G91 G38.2 Z-40 F100',
      'G91 G0 Z10',
      'G91 G0 X-23',
      'G91 G0 Z-15',
      'G91 G38.2 X63 F100',
      'G91 G0 X-10',
      'G91 G0 Z15',
      'G90 G53 G0 X108',
      'G91 G0 Y-23',
      'G91 G0 Z-15',
      'G91 G38.2 Y63 F100',
      'G91 G0 Y-10',
      'G91 G0 Z15',
      'G90',
    ]);
    expect(r.finish(res)).toEqual({ x: 98, y: 198, z: -20 });
    const back = cornerRoutine(p, 'back-right', { plateThickness: 1, inset: 10, depth: 5 });
    expect(back.finish(res)).toEqual({ x: 92, y: 192, z: -21 });
  });

  it('probes through an XYZ corner plate', () => {
    // Plate: 5 mm top, 4 mm walls; tool Ø 6 starts 10 mm inside the plate's corner.
    const r = cornerRoutine(p, 'front-left', { plateThickness: 5, wall: 4, inset: 10, depth: 5 });
    const res = { z: -15, x: 91, y: 191 };
    const lines = r.steps.map((s) => s.gcode(res));
    expect(lines[2]).toBe('G91 G0 X-27');
    expect(lines[3]).toBe('G91 G0 Z-20');
    expect(lines[7]).toBe('G90 G53 G0 X108');
    expect(r.finish(res)).toEqual({ x: 98, y: 198, z: -20 });
  });

  it('centres in a bore', () => {
    const r = centerRoutine(p, { x: 100, y: 200, z: -10 });
    const res = { x1: 110, x2: 90, y1: 212, y2: 190 };
    expect(lines(r, res)).toEqual([
      'G91 G38.2 X40 F100',
      'G90 G53 G0 X100',
      'G91 G38.2 X-40 F100',
      'G90 G53 G0 X100',
      'G91 G38.2 Y40 F100',
      'G90 G53 G0 Y200',
      'G91 G38.2 Y-40 F100',
      'G90 G53 G0 Y201',
      'G90',
    ]);
    expect(r.finish(res)).toEqual({ x: 100, y: 201 });
    expect(boreDiameter(res, 6)).toEqual({ x: 26, y: 28 });
  });

  it('measures the tool length on a sensor', () => {
    const r = toolLengthRoutine(p, { x: 5, y: 10, safeZ: -1 });
    expect(lines(r)).toEqual([
      'G90 G53 G0 Z-1',
      'G90 G53 G0 X5 Y10',
      'G91 G38.2 Z-40 F100',
      'G91 G0 Z2',
      'G91 G38.2 Z-3 F25',
      'G90 G53 G0 Z-1',
      'G90',
    ]);
    expect(r.finish({})).toEqual({});
    expect(lines(toolLengthRoutine({ ...p, feed: 20 }, { x: 0, y: 0, safeZ: 0 }))[4]).toBe(
      'G91 G38.2 Z-3 F10',
    );
  });
});

describe('probe helpers', () => {
  it('builds offset and zero commands', () => {
    expect(toolLengthOffsetCommand(-80, -75.5)).toBe('G43.1 Z4.5');
    expect(zeroCommand({ x: 1.23456, z: -3 })).toBe('G10 L2 P0 X1.235 Z-3');
    expect(zeroCommand({})).toBeNull();
  });

  it('parses probe reports', () => {
    expect(parseProbeReport('[PRB:1.000,-2.500,-30.125:1]')).toEqual([1, -2.5, -30.125]);
    expect(parseProbeReport('[PRB:0.000,0.000,0.000:0]')).toBeNull();
    expect(parseProbeReport('ok')).toBeNull();
  });
});
