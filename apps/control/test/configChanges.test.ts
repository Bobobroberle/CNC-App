import { readMachineConfig } from '@lowrider/fluidnc-client';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configChanges, draftFromConfig } from '../src/lib/configChanges';

const stock = readMachineConfig(
  readFileSync(new URL('../../../machine/config.yaml', import.meta.url), 'utf8'),
);

describe('config changes', () => {
  it('starts from the controller values without changes', () => {
    const d = draftFromConfig(stock);
    expect(d).toEqual({
      softLimits: false,
      maxTravel: { x: 1220, y: 2440, z: 300 },
      useLineNumbers: false,
      mustHome: false,
    });
    expect(configChanges(stock, d)).toEqual([]);
  });

  it('lists the recommended changes as runtime settings', () => {
    const d = draftFromConfig(stock);
    const changes = configChanges(stock, {
      ...d,
      softLimits: true,
      maxTravel: { ...d.maxTravel, z: 95 },
      useLineNumbers: true,
      mustHome: true,
    });
    expect(changes).toEqual([
      { path: 'axes/x/soft_limits', value: 'true' },
      { path: 'axes/y/soft_limits', value: 'true' },
      { path: 'axes/z/soft_limits', value: 'true' },
      { path: 'axes/z/max_travel_mm', value: '95' },
      { path: 'use_line_numbers', value: 'true' },
      { path: 'start/must_home', value: 'true' },
    ]);
  });

  it('rejects invalid travel and skips missing axes', () => {
    const d = draftFromConfig(stock);
    expect(configChanges(stock, { ...d, maxTravel: { ...d.maxTravel, z: 0 } })).toBeNull();
    const noZ = readMachineConfig('axes:\n  x:\n    max_travel_mm: 100\n');
    expect(draftFromConfig(noZ).maxTravel).toEqual({ x: 100, y: 0, z: 0 });
    expect(configChanges(noZ, { ...draftFromConfig(noZ), softLimits: true })).toEqual([
      { path: 'axes/x/soft_limits', value: 'true' },
    ]);
  });
});
