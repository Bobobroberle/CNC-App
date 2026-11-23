import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { axisTravel, parseConfigYaml, readMachineConfig } from '../src';

const stock = readFileSync(join(import.meta.dirname, 'fixtures', 'jackpot2-lowrider.yaml'), 'utf8');

describe('parseConfigYaml', () => {
  it('reads nested maps, scalars and comments', () => {
    const doc = parseConfigYaml(
      [
        'board: "Jackpot" # trailing',
        '# whole line',
        'axes:',
        '  x:',
        '    max_travel_mm: 10',
        '     #odd indent comment',
        '    motor0:',
        '      limit_neg_pin: gpio.25:high',
        '  y:',
        "    soft_limits: 'true'",
        'macros:',
        '  macro0:',
        'not a key',
        '',
      ].join('\r\n'),
    );
    expect(doc).toEqual({
      board: 'Jackpot',
      axes: {
        x: { max_travel_mm: '10', motor0: { limit_neg_pin: 'gpio.25:high' } },
        y: { soft_limits: 'true' },
      },
      macros: { macro0: {} },
    });
  });
});

describe('readMachineConfig', () => {
  it('reads the V1E Jackpot 2 LowRider config', () => {
    const c = readMachineConfig(stock);
    expect(c.board).toBe('Jackpot V2 TMC2226');
    expect(c.name).toBe('LowRider');
    expect(Object.keys(c.axes)).toEqual(['x', 'y', 'z']);
    expect(c.axes.x).toEqual({
      maxRate: 9000,
      acceleration: 200,
      maxTravel: 1220,
      softLimits: false,
      homing: { cycle: 2, positiveDirection: false, mpos: 3 },
      motors: 1,
    });
    expect(c.axes.y?.motors).toBe(2);
    expect(c.axes.z).toMatchObject({ maxRate: 1200, acceleration: 80, maxTravel: 300 });
    expect(c.junctionDeviation).toBe(0.01);
    expect(c.arcTolerance).toBe(0.002);
    expect(c.useLineNumbers).toBe(false);
    expect(c.mustHome).toBe(false);
    expect(c.toolChangeHandled).toBe(false);
    expect(c.spindleControlled).toBe(false);
  });

  it('uses FluidNC defaults for missing values', () => {
    const c = readMachineConfig(
      'axes:\n  x:\n    max_rate_mm_per_min: fast\n    homing:\n      cycle: 1\n  y: 5\njunction_deviation_mm: 0.05\nuse_line_numbers: true\nstart:\n  must_home: maybe\npwm:\n  m6_macro: G53 G0 Z-5 & M0\n',
    );
    expect(c.axes.x).toEqual({
      maxRate: 1000,
      acceleration: 25,
      maxTravel: 1000,
      softLimits: false,
      homing: { cycle: 1, positiveDirection: true, mpos: 0 },
      motors: 0,
    });
    expect(c.axes.y).toBeUndefined();
    expect(readMachineConfig('axes:\n  z:\n    max_travel_mm: 20\n').axes.z?.homing).toBeNull();
    expect(c.board).toBeNull();
    expect(c.junctionDeviation).toBe(0.05);
    expect(c.useLineNumbers).toBe(true);
    expect(c.mustHome).toBe(true);
    expect(c.toolChangeHandled).toBe(true);
    expect(readMachineConfig('relay:\n  atc: manual\n').toolChangeHandled).toBe(true);
    expect(readMachineConfig('PWM:\n  output_pin: gpio.4\n').spindleControlled).toBe(true);
    expect(readMachineConfig('PWM:\n  output_pin: NO_PIN\n').spindleControlled).toBe(false);
    expect(readMachineConfig('Huanyang:\n  uart:\n    txd_pin: gpio.1\n').spindleControlled).toBe(
      true,
    );
    expect(readMachineConfig('Relay:\n  output_pin:\n').spindleControlled).toBe(false);
  });
});

describe('axisTravel', () => {
  it('matches FluidNC limitsMin/MaxPosition', () => {
    const { axes } = readMachineConfig(stock);
    expect(axisTravel(axes.x!)).toEqual({ min: 3, max: 1223 });
    expect(axisTravel(axes.y!)).toEqual({ min: 3, max: 2443 });
    expect(axisTravel(axes.z!)).toEqual({ min: -297, max: 3 });
    expect(
      axisTravel({
        maxRate: 1,
        acceleration: 1,
        maxTravel: 50,
        softLimits: true,
        homing: null,
        motors: 1,
      }),
    ).toEqual({ min: -50, max: 0 });
  });
});
