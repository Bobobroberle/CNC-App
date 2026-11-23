import { readMachineConfig } from '@lowrider/fluidnc-client';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toWebSocketUrl } from '../src/lib/address';
import { deviationLevel } from '../src/lib/format';
import {
  LOWRIDER_V4_PROFILE,
  loadProfile,
  parseSettings,
  saveProfile,
  settingsFromConfig,
} from '../src/lib/profile';

const valid = {
  travel: { x: { min: 0, max: 1250 }, y: { min: -2500, max: 0 }, z: { min: -95, max: 0 } },
  softLimits: true,
  jogFeed: { xy: 2500, z: 500 },
};

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('lowrider-control.profile', initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('toWebSocketUrl', () => {
  it('turns an IP into the FluidNC WebSocket URL', () => {
    expect(toWebSocketUrl(' 192.168.178.40 ')).toBe('ws://192.168.178.40:81/');
    expect(toWebSocketUrl('jackpot.local:8080')).toBe('ws://jackpot.local:8080/');
    expect(toWebSocketUrl('http://192.168.1.5/index.html')).toBe('ws://192.168.1.5:81/');
    expect(toWebSocketUrl('ws://10.0.0.2:81')).toBe('ws://10.0.0.2:81');
    expect(toWebSocketUrl('')).toBeNull();
  });
});

describe('deviationLevel', () => {
  it('uses the prototype thresholds', () => {
    expect(deviationLevel(null)).toBeNull();
    expect(deviationLevel(0.05)).toBe('ok');
    expect(deviationLevel(0.5)).toBe('warn');
    expect(deviationLevel(1.2)).toBe('bad');
  });
});

describe('machine profile settings', () => {
  it('accepts valid settings and rejects broken ones', () => {
    expect(parseSettings(valid)).toEqual(valid);
    expect(parseSettings(null)).toBeNull();
    expect(parseSettings({ ...valid, travel: undefined })).toBeNull();
    expect(
      parseSettings({ ...valid, travel: { ...valid.travel, x: { min: 5, max: 5 } } }),
    ).toBeNull();
    expect(
      parseSettings({ ...valid, travel: { ...valid.travel, y: { min: Number.NaN, max: 1 } } }),
    ).toBeNull();
    expect(parseSettings({ ...valid, softLimits: 'yes' })).toBeNull();
    expect(parseSettings({ ...valid, jogFeed: { xy: 0, z: 100 } })).toBeNull();
    expect(parseSettings({ ...valid, jogFeed: undefined })).toBeNull();
  });

  it('round-trips through storage and falls back to placeholders', () => {
    const storage = memoryStorage();
    expect(loadProfile(storage)).toBe(LOWRIDER_V4_PROFILE);
    saveProfile(storage, valid);
    const loaded = loadProfile(storage);
    expect(loaded.placeholder).toBe(false);
    expect(loaded.travel.y.min).toBe(-2500);
    expect(loaded.hasRotary).toBe(false);
    expect(loadProfile(memoryStorage('{broken'))).toBe(LOWRIDER_V4_PROFILE);
    expect(loadProfile(undefined)).toBe(LOWRIDER_V4_PROFILE);
    const failing = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveProfile(failing, valid)).not.toThrow();
  });
});

describe('settingsFromConfig', () => {
  const stock = readFileSync(new URL('../../../machine/config.yaml', import.meta.url), 'utf8');

  it('takes travel, speeds and controller behaviour from config.yaml', () => {
    const s = settingsFromConfig(readMachineConfig(stock), LOWRIDER_V4_PROFILE)!;
    expect(s.travel).toEqual({
      x: { min: 3, max: 1223 },
      y: { min: 3, max: 2443 },
      z: { min: -297, max: 3 },
    });
    expect(s.kinematics?.axes.z).toEqual({ maxRate: 1200, acceleration: 80 });
    expect(s.kinematics?.junctionDeviation).toBe(0.01);
    expect(s.controller).toEqual({
      source: 'Jackpot V2 TMC2226, LowRider',
      softLimits: false,
      toolChangeHandled: false,
      useLineNumbers: false,
      mustHome: false,
      spindleControlled: false,
    });
    expect(s.jogFeed).toBe(LOWRIDER_V4_PROFILE.jogFeed);
    // stored and reloaded with the imported values
    expect(parseSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('rejects configs without X, Y and Z and names unnamed configs', () => {
    expect(settingsFromConfig(readMachineConfig('axes:\n  x:\n'), LOWRIDER_V4_PROFILE)).toBeNull();
    const axis = '    soft_limits: true\n';
    const s = settingsFromConfig(
      readMachineConfig(`axes:\n  x:\n${axis}  y:\n${axis}  z:\n${axis}`),
      LOWRIDER_V4_PROFILE,
    )!;
    expect(s.controller).toMatchObject({ source: 'config.yaml', softLimits: true });
  });
});
