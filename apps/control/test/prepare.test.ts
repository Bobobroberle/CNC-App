import { LOWRIDER_V4_KINEMATICS } from '@lowrider/gcode-core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { macroLines, parseMacros, loadMacros, saveMacros, DEFAULT_MACROS } from '../src/lib/macros';
import { prepareJob } from '../src/lib/prepare';
import { probeZCommands, zeroCommand } from '../src/lib/probe';

const real = readFileSync(
  new URL(
    '../../../packages/gcode-core/test/golden/fusion360-1003-adaptiv-kontur-parallel.nc',
    import.meta.url,
  ),
  'utf8',
);

describe('prepareJob', () => {
  it('repairs and splits the real Fusion job into error-free parts', () => {
    const job = prepareJob(real, '1003 Schale.nc', LOWRIDER_V4_KINEMATICS);
    expect(job.repairedLines).toHaveLength(2);
    expect(job.parts.map((p) => [p.fileName, p.tool, p.errors])).toEqual([
      ['1003_Schale_1of2_T1.nc', 1, 0],
      ['1003_Schale_2of2_T2.nc', 2, 0],
    ]);
    expect(job.parts[0]!.seconds).toBeGreaterThan(60);
    expect(job.parts[1]!.lineCount).toBeGreaterThan(1000);
  });

  it('keeps a simple job as one file', () => {
    const job = prepareJob('G0 X1\nG1 X2 F100\n', 'a.gcode', LOWRIDER_V4_KINEMATICS);
    expect(job.repairedLines).toEqual([]);
    expect(job.parts.map((p) => p.fileName)).toEqual(['a.nc']);
    const noTool = prepareJob('G0 X1\nT2 M6\nG0 X2', 'b.nc', LOWRIDER_V4_KINEMATICS);
    expect(noTool.parts).toHaveLength(1);
  });

  it('names parts without a tool', () => {
    const job = prepareJob('T1 M6\nG0 X1\nT2 M6\nG0 X2', 'c.nc', LOWRIDER_V4_KINEMATICS);
    expect(job.parts.map((p) => p.fileName)).toEqual(['c_1of2_T1.nc', 'c_2of2_T2.nc']);
  });
});

describe('probe and zero commands', () => {
  it('probes in absolute coordinates and sets Z to the plate thickness', () => {
    expect(
      probeZCommands(5, { plateThickness: 0.5, maxTravel: 40, feed: 100, retract: 10 }),
    ).toEqual({
      probe: 'G90 G38.2 Z-35 F100',
      setZero: 'G10 L20 P0 Z0.5',
      retract: 'G90 G0 Z10.5',
    });
    expect(zeroCommand('XY')).toBe('G10 L20 P0 X0 Y0');
  });
});

describe('macros', () => {
  it('splits lines and validates stored macros', () => {
    expect(macroLines({ name: 'a', gcode: ' G0 X1 \n\n; note\r\nG0 Y1' })).toEqual([
      'G0 X1',
      'G0 Y1',
    ]);
    expect(parseMacros([{ name: 'a', gcode: 'G0' }])).toEqual([{ name: 'a', gcode: 'G0' }]);
    expect(parseMacros([{ name: ' ', gcode: 'G0' }])).toBeNull();
    expect(parseMacros('x')).toBeNull();
    expect(parseMacros([null])).toBeNull();
  });

  it('round-trips through storage with defaults', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    expect(loadMacros(storage)).toBe(DEFAULT_MACROS);
    saveMacros(storage, [{ name: 'Park', gcode: 'G53 G0 Z0' }]);
    expect(loadMacros(storage)).toEqual([{ name: 'Park', gcode: 'G53 G0 Z0' }]);
    data.set('lowrider-control.macros', '{bad');
    expect(loadMacros(storage)).toBe(DEFAULT_MACROS);
    expect(() =>
      saveMacros(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        [],
      ),
    ).not.toThrow();
  });
});

describe('travelViolations', () => {
  it('uses the work offset for every coordinate system', async () => {
    const { travelViolations } = await import('../src/lib/workspace');
    const { LOWRIDER_V4_PROFILE } = await import('../src/lib/profile');
    const job = 'G0 X10 Y10\nG55 G0 X-20\nG0 Z10';
    expect(travelViolations(job, LOWRIDER_V4_PROFILE, [100, 100, -50], [50, 50, 0])).toEqual([]);
    const v = travelViolations(job, LOWRIDER_V4_PROFILE, [5, 100, 0, 0], [50, 50, 0]);
    expect(v.map((x) => `${x.axis}${x.side}`)).toEqual(['xmin', 'zmax']);
  });
});
