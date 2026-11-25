import { describe, expect, it } from 'vitest';
import {
  canonical,
  insane,
  LOCAL_CAMERA,
  LOCAL_SETTINGS,
  merge3,
  same,
  shaped,
  split,
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

  it('takes a missing sub-key of a part both changed as unchanged, not as removed – an older copy lacks it', () => {
    const part = { plate: { a: 1, pitch: 10 } };
    const local = { plate: { a: 1, pitch: 12.5 } };
    const remote = { plate: { a: 5 } }; // an older app: no pitch yet, a changed
    expect(merge3(part, local, remote, 'remote', ['plate'])).toEqual({
      merged: { plate: { a: 5, pitch: 12.5 } },
      replaced: [],
    });
    // without the list of fixed keys every key is data and a missing one was removed
    expect(merge3(part, local, remote, 'remote').merged).toEqual({ plate: { a: 5 } });
    // a key that both really changed is still decided by the winner
    expect(merge3(part, { plate: { a: 2, pitch: 12.5 } }, remote, 'remote', ['plate'])).toEqual({
      merged: { plate: { a: 5, pitch: 12.5 } },
      replaced: ['plate'],
    });
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
    insane(validateSettings({ ...DEFAULT_SETTINGS, ...patch }, false)!);

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

describe('the merge of a document that always has the same keys', () => {
  const keys = ['a', 'b'];
  it('counts a key the remote copy lacks as unchanged, not as removed', () => {
    const base = { a: 1, b: 2 };
    // an older app wrote a copy without b: this device's b stays, nothing is "replaced"
    expect(merge3(base, { a: 1, b: 5 }, { a: 1 }, 'local', keys)).toEqual({
      merged: { a: 1, b: 5 },
      replaced: [],
    });
    expect(merge3(base, { a: 1, b: 2 }, {}, 'remote', keys).merged).toEqual({ a: 1, b: 2 });
    // …and the remote's change of the other key still comes in
    expect(merge3(base, { a: 1, b: 2 }, { a: 7 }, 'remote', keys).merged).toEqual({ a: 7, b: 2 });
  });

  it('lets a document of free keys lose one', () => {
    expect(merge3({ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 1 }, 'remote').merged).toEqual({ a: 1 });
    // a key that is not under `keys` is data as well
    expect(merge3({ a: 1, c: 3 }, { a: 1, c: 3 }, { a: 1 }, 'remote', keys).merged).toEqual({
      a: 1,
    });
  });
});

describe('the merge of what both devices changed in the same part', () => {
  const keys = ['camera', 'places'];
  it('keeps what each changed inside it: the calibration of one is not lost to a switch of the other', () => {
    const base = { camera: { pxPerMm: 10, lightMarker: false, offsetX: 0 }, places: 'P' };
    const pc = { ...base, camera: { ...base.camera, pxPerMm: 12.3 } };
    const ipad = { ...base, camera: { ...base.camera, lightMarker: true } };
    const { merged, replaced } = merge3(base, ipad, pc, 'local', keys);
    expect(merged.camera).toEqual({ pxPerMm: 12.3, lightMarker: true, offsetX: 0 });
    expect(replaced).toEqual([]);
  });

  it('still names a value that both changed to different things, and the winner’s stays', () => {
    const base = { camera: { pxPerMm: 10, offsetX: 0 }, places: 'P' };
    const a = { ...base, camera: { pxPerMm: 11, offsetX: 5 } };
    const b = { ...base, camera: { pxPerMm: 12, offsetX: 0 } };
    const local = merge3(base, a, b, 'local', keys);
    expect(local.merged.camera).toEqual({ pxPerMm: 11, offsetX: 5 });
    expect(local.replaced).toEqual(['camera']);
    expect(merge3(base, a, b, 'remote', keys).merged.camera).toEqual({ pxPerMm: 12, offsetX: 5 });
  });

  it('goes only one level deep, and not at all for a document of free keys (a learned pair is one value)', () => {
    const base = { 'a|b': { factor: 1, jobs: 1 } };
    const mine = { 'a|b': { factor: 1.2, jobs: 2 } };
    const theirs = { 'a|b': { factor: 0.8, jobs: 3 } };
    expect(merge3(base, mine, theirs, 'local').merged).toEqual(mine);
    // a list is one value too
    expect(
      merge3({ places: [1] }, { places: [1, 2] }, { places: [1, 3] }, 'local', ['places']).merged,
    ).toEqual({
      places: [1, 2],
    });
  });
});

describe('what stays on the device, the language too', () => {
  it('is this person’s: a language or the expert functions of the PC do not turn the tablet at the machine around', () => {
    expect(LOCAL_SETTINGS).toContain('language');
    expect(LOCAL_SETTINGS).toContain('expertMode');
    const synced = syncedSettings(settings({ language: 'en', expertMode: true }));
    expect(synced).not.toHaveProperty('language');
    expect(synced).not.toHaveProperty('expertMode');
    const mixed = withSynced(settings({ language: 'en', expertMode: true }), synced);
    expect(mixed).toMatchObject({ language: 'en', expertMode: true });
  });
});

describe('the part of a document that is this app’s', () => {
  it('is what is under the keys – the rest is carried along', () => {
    expect(split({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toEqual({
      own: { a: 1, b: 2 },
      extra: { c: 3 },
    });
    expect(split({ a: 1 }, undefined)).toEqual({ own: { a: 1 }, extra: {} });
    expect(split({}, ['a'])).toEqual({ own: {}, extra: {} });
  });
});

describe('whether a value is the kind of thing that stands in its place', () => {
  const template = { n: 1, s: 'x', b: true, list: [], o: { k: 1, deep: { f: 0 } }, opt: null };
  it('looks at the kind, down through the objects, and lets a missing part be', () => {
    expect(shaped({}, template)).toBe(true);
    expect(shaped({ n: 5, s: 'y', b: false, list: [1], o: { k: 2 } }, template)).toBe(true);
    for (const bad of [
      { n: '5' },
      { n: Number.NaN },
      { s: 5 },
      { b: 'yes' },
      { list: 'x' },
      { o: null },
      { o: [] },
      { o: { k: 'x' } },
      { o: { deep: { f: 'x' } } },
      { opt: true },
      { opt: [] },
    ]) {
      expect(shaped(bad, template), JSON.stringify(bad)).toBe(false);
    }
    // an optional value: nothing, a number, a text, an object
    for (const ok of [null, 3, 'text', { x: 1 }]) expect(shaped({ opt: ok }, template)).toBe(true);
    // a key the template does not know is not looked at here
    expect(shaped({ other: { x: 1 } }, template)).toBe(true);
    expect(shaped(5, template)).toBe(false);
  });
});

describe('what the settings cards allow, and the Z travel', () => {
  const sane = (patch: Partial<WorkshopSettings>, travelZ?: { min: number; max: number }) =>
    insane(validateSettings({ ...DEFAULT_SETTINGS, ...patch }, false)!, travelZ);

  it('keeps the safe height in the upper half of the travel, where it is known', () => {
    const z = { min: -120, max: 0 };
    expect(sane({ safeMachineZ: -5 }, z)).toBeNull();
    expect(sane({ safeMachineZ: -60 }, z)).toBeNull();
    expect(sane({ safeMachineZ: -61 }, z)).toBe('safeMachineZ');
    expect(sane({ safeMachineZ: 1 }, z)).toBe('safeMachineZ');
    // without a travel only the absurd goes
    expect(sane({ safeMachineZ: -290 })).toBeNull();
    expect(sane({ safeMachineZ: -1e6 })).toBe('safeMachineZ');
  });

  it('holds the measuring runs to what the calibration card offers', () => {
    const c = DEFAULT_SETTINGS.calibration;
    expect(sane({ calibration: { ...c, points: 2 } })).toBeNull();
    expect(sane({ calibration: { ...c, points: 5 } })).toBeNull();
    expect(sane({ calibration: { ...c, points: 8 } })).toBeNull();
    for (const bad of [
      { points: 9 },
      { points: 1 },
      { points: 2.5 },
      { spanX: 0 },
      { spanY: -1 },
      { settleMs: 70_000 },
      { zRise: 0 },
      { gantryWidth: 0 },
      { motor1Side: 'up' as never },
    ]) {
      expect(sane({ calibration: { ...c, ...bad } }), JSON.stringify(bad)).toBe('calibration');
    }
    expect(sane({ calibration: { ...c, gantryWidth: 1200, motor1Side: 'xMax' } })).toBeNull();
  });

  it('holds the plate, the recording and the language to their cards', () => {
    expect(sane({ cornerPlate: { use: true, top: -1, wall: 2 } })).toBe('cornerPlate');
    expect(sane({ cornerPlate: { use: true, top: 1, wall: 2000 } })).toBe('cornerPlate');
    expect(sane({ recording: { ...DEFAULT_SETTINGS.recording, intervalSeconds: 0 } })).toBe(
      'recording',
    );
    expect(sane({ language: 'fr' as never })).toBe('language');
    expect(sane({ spindle: { rpmMin: 5, rpmMax: 4, maxFeed: 10 } })).toBe('spindle');
    expect(sane({ spindle: { rpmMin: 0, rpmMax: 4, maxFeed: 10 } })).toBe('spindle');
  });
});
