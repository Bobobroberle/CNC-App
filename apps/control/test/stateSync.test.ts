import { describe, expect, it } from 'vitest';
import {
  canonical,
  insane,
  LOCAL_CAMERA,
  LOCAL_SETTINGS,
  merge3,
  same,
  syncedSettings,
  withSynced,
} from '../src/lib/stateSync';
import { DEFAULT_SETTINGS, validateSettings, type WorkshopSettings } from '../src/store/workshop';

const settings = (patch: Partial<WorkshopSettings> = {}): WorkshopSettings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe('equal documents', () => {
  it('are equal whoever built them, in whatever order', () => {
    expect(canonical({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      canonical({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }),
    );
    expect(same({ a: 1 }, { a: 1 })).toBe(true);
    expect(same({ a: 1 }, { a: 2 })).toBe(false);
    // a list keeps its order
    expect(same([1, 2], [2, 1])).toBe(false);
    expect(same(undefined, null)).toBe(false);
  });
});

describe('the three-way merge by key', () => {
  const base = { camera: 'A', places: 'P', macros: 'M' };

  it('takes from each side what only it changed', () => {
    const local = { ...base, camera: 'A2' };
    const remote = { ...base, places: 'P2' };
    expect(merge3(base, local, remote, 'local')).toEqual({
      merged: { camera: 'A2', places: 'P2', macros: 'M' },
      replaced: [],
    });
  });

  it('takes what both changed to the same value', () => {
    const both = { ...base, camera: 'A2' };
    expect(merge3(base, both, both, 'remote')).toEqual({ merged: both, replaced: [] });
  });

  it('names a key both changed differently, and gives it to the winner', () => {
    const local = { ...base, camera: 'mine' };
    const remote = { ...base, camera: 'theirs', places: 'P2' };
    expect(merge3(base, local, remote, 'local')).toEqual({
      merged: { camera: 'mine', places: 'P2', macros: 'M' },
      replaced: ['camera'],
    });
    expect(merge3(base, local, remote, 'remote')).toEqual({
      merged: { camera: 'theirs', places: 'P2', macros: 'M' },
      replaced: ['camera'],
    });
  });

  it('knows keys that came or went on one side', () => {
    // a key that is new on the Pi comes in; one the Pi dropped is dropped unless this device changed it
    expect(merge3({ a: 1 }, { a: 1 }, { a: 1, b: 2 }, 'local').merged).toEqual({ a: 1, b: 2 });
    expect(merge3({ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 1 }, 'local').merged).toEqual({ a: 1 });
    expect(merge3({ a: 1, b: 2 }, { a: 1, b: 3 }, { a: 1 }, 'local')).toEqual({
      merged: { a: 1, b: 3 },
      replaced: ['b'],
    });
    expect(merge3({}, {}, {}, 'local')).toEqual({ merged: {}, replaced: [] });
  });
});

describe('what stays on the device', () => {
  const camera = {
    ...DEFAULT_SETTINGS.camera,
    offsetX: 12.5,
    streamUrl: 'http://pi:8081/stream',
    source: 'stream' as const,
  };

  it('is not in the synced settings: the address of the Pi, this browser, this screen, this picture source', () => {
    const synced = syncedSettings(
      settings({ companionUrl: 'http://pi:8080', notifyBrowser: true, keepAwake: false, camera }),
    );
    for (const key of LOCAL_SETTINGS) expect(synced, key).not.toHaveProperty(key);
    for (const key of LOCAL_CAMERA) expect(synced.camera, key).not.toHaveProperty(key);
    // … and everything that belongs to the machine is
    expect(synced.camera).toMatchObject({
      offsetX: 12.5,
      pxPerMm: DEFAULT_SETTINGS.camera.pxPerMm,
    });
    expect(synced).toHaveProperty('waypoints');
    expect(synced).toHaveProperty('toolChangePosition');
    expect(synced).toHaveProperty('calibration');
  });

  it('is kept when the settings of the Pi are laid over this device', () => {
    const local = settings({
      companionUrl: 'http://here:8080',
      notifyBrowser: true,
      keepAwake: false,
      camera,
    });
    const theirs = syncedSettings(
      settings({
        companionUrl: 'http://there',
        notifyBrowser: false,
        keepAwake: true,
        camera: { ...DEFAULT_SETTINGS.camera, offsetX: 99, source: 'device', streamUrl: 'other' },
      }),
    );
    const mixed = withSynced(local, theirs) as unknown as WorkshopSettings;
    expect(mixed.companionUrl).toBe('http://here:8080');
    expect(mixed.notifyBrowser).toBe(true);
    expect(mixed.keepAwake).toBe(false);
    expect(mixed.camera).toMatchObject({
      offsetX: 99,
      streamUrl: camera.streamUrl,
      source: 'stream',
    });
    // a document without a camera is no reason to lose this device's picture source
    const bare = withSynced(local, {}) as unknown as WorkshopSettings;
    expect(bare.camera.source).toBe('stream');
  });
});

describe('what the Pi sends is not trusted', () => {
  const sane = (patch: Partial<WorkshopSettings> = {}) =>
    insane(validateSettings({ ...DEFAULT_SETTINGS, ...patch })!);

  it('lets what a machine can have pass', () => {
    expect(sane()).toBeNull();
    expect(
      sane({
        toolChangePosition: { x: 10, y: 20 },
        parkPosition: { x: 0, y: 0 },
        safeMachineZ: -2,
        toolSetter: { x: 5, y: 6, safeZ: -3 },
      }),
    ).toBeNull();
  });

  it('names what cannot be a place, a height, a sensor, a spindle or a camera', () => {
    const n = Number.NaN;
    expect(sane({ toolChangePosition: { x: n, y: 1 } })).toBe('toolChangePosition');
    expect(sane({ toolChangePosition: { x: 1, y: '2' as unknown as number } })).toBe(
      'toolChangePosition',
    );
    expect(sane({ toolChangePosition: 'here' as never })).toBe('toolChangePosition');
    expect(sane({ parkPosition: { x: Infinity, y: 1 } })).toBe('parkPosition');
    expect(sane({ safeMachineZ: n })).toBe('safeMachineZ');
    expect(sane({ safeMachineZ: '3' as never })).toBe('safeMachineZ');
    expect(sane({ toolSetter: { x: 1, y: 2 } as never })).toBe('toolSetter');
    expect(sane({ toolSetter: 'sensor' as never })).toBe('toolSetter');
    expect(sane({ spindle: { rpmMin: 1, rpmMax: 2, maxFeed: 0 } })).toBe('spindle');
    expect(sane({ spindle: { rpmMin: n, rpmMax: 2, maxFeed: 5 } })).toBe('spindle');
    expect(sane({ camera: { ...DEFAULT_SETTINGS.camera, pxPerMm: 0 } })).toBe('camera');
    expect(sane({ camera: { ...DEFAULT_SETTINGS.camera, offsetX: n } })).toBe('camera');
    expect(sane({ camera: { ...DEFAULT_SETTINGS.camera, rotation: '1' as never } })).toBe('camera');
    expect(sane({ camera: { ...DEFAULT_SETTINGS.camera, focusHeight: n } })).toBe('camera');
    expect(sane({ camera: { ...DEFAULT_SETTINGS.camera, focusHeight: 12 } })).toBeNull();
  });

  it('looks at the saved places too (a place from the Pi becomes a G53 target)', () => {
    const bad = [{ id: 'w', name: 'A', x: 1, y: 2 }];
    expect(sane({ waypoints: bad })).toBeNull();
    // validateSettings drops the malformed ones; a list that got past it is refused all the same
    expect(
      insane({ ...DEFAULT_SETTINGS, waypoints: [{ id: 'w', name: 'A', x: Number.NaN, y: 1 }] }),
    ).toBe('waypoints');
    expect(insane({ ...DEFAULT_SETTINGS, waypoints: 'x' as never })).toBe('waypoints');
  });
});
