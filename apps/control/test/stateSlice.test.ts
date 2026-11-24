import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionClient, CompanionError } from '../src/lib/companion';
import { holdCount } from '../src/lib/holds';
import { syncedSettings, same } from '../src/lib/stateSync';
import { useMachine } from '../src/store/machine';
import { safeToApply, SLICES, startStateSync, type Deps } from '../src/store/stateSync';
import '../src/store/underway';
import { DEFAULT_SETTINGS, useWorkshop } from '../src/store/workshop';

const settings = SLICES.find((s) => s.key === 'settings')!;

function memoryKeep(initial: Record<string, Record<string, unknown>> | null = null) {
  let kept = initial;
  return {
    load: () => kept,
    save: (snapshot: Record<string, Record<string, unknown>> | null) => void (kept = snapshot),
  };
}

describe('the settings as a document', () => {
  beforeEach(() => useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } }));

  it('is what a machine has, not what this device keeps for itself', () => {
    useWorkshop.getState().setSettings({
      companionUrl: 'http://pi:8080',
      notifyBrowser: true,
      camera: { ...DEFAULT_SETTINGS.camera, offsetX: 12.5, streamUrl: 'http://pi:8081/stream' },
    });
    const doc = settings.read();
    expect(doc).not.toHaveProperty('companionUrl');
    expect(doc).not.toHaveProperty('notifyBrowser');
    expect((doc.camera as Record<string, unknown>).offsetX).toBe(12.5);
    expect(doc.camera).not.toHaveProperty('streamUrl');
    expect(same(settings.defaults(), syncedSettings(DEFAULT_SETTINGS))).toBe(true);
  });

  it('is taken in as the settings – and leaves this device’s address, browser and picture source alone', () => {
    useWorkshop.getState().setSettings({
      companionUrl: 'http://here:8080',
      notifyBrowser: true,
      camera: {
        ...DEFAULT_SETTINGS.camera,
        source: 'stream',
        streamUrl: 'http://here:8081/stream',
      },
    });
    const theirs = {
      ...settings.read(),
      toolChangePosition: { x: 10, y: 20 },
      waypoints: [{ id: 'w', name: 'Anschlag', x: 1, y: 2 }],
      camera: { ...DEFAULT_SETTINGS.camera, offsetX: 99, source: 'device', streamUrl: 'other' },
      // not a setting of this app: dropped
      evil: 'x',
    };
    expect(settings.accepts(theirs)).toBe(true);
    settings.apply(theirs);
    const now = useWorkshop.getState().settings;
    expect(now.toolChangePosition).toEqual({ x: 10, y: 20 });
    expect(now.waypoints).toHaveLength(1);
    expect(now.camera).toMatchObject({
      offsetX: 99,
      source: 'stream',
      streamUrl: 'http://here:8081/stream',
    });
    expect(now.companionUrl).toBe('http://here:8080');
    expect(now.notifyBrowser).toBe(true);
    expect(now).not.toHaveProperty('evil');
  });

  it('refuses what cannot be a machine’s: a place that is no number, a camera without a scale', () => {
    const doc = settings.read();
    expect(settings.accepts({ ...doc, toolChangePosition: { x: 'a', y: 2 } })).toBe(false);
    expect(settings.accepts({ ...doc, parkPosition: { x: null, y: 2 } })).toBe(false);
    expect(settings.accepts({ ...doc, camera: { ...(doc.camera as object), pxPerMm: 0 } })).toBe(
      false,
    );
    expect(settings.accepts({ ...doc, spindle: { rpmMin: 1, rpmMax: 2, maxFeed: -1 } })).toBe(
      false,
    );
    // and nothing of it was taken
    settings.accepts({ ...doc, safeMachineZ: 'high' });
    expect(useWorkshop.getState().settings.safeMachineZ).toBeNull();
  });

  it('notifies its listeners when the settings change, and only then', () => {
    const heard = vi.fn();
    const stop = settings.subscribe(heard);
    useWorkshop.getState().setSettings({ keepAwake: false });
    expect(heard).toHaveBeenCalledTimes(1);
    useWorkshop.setState({ companionOnline: true });
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    useWorkshop.getState().setSettings({ keepAwake: true });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe('when the Pi’s values may be taken', () => {
  afterEach(() => {
    useMachine.setState({
      connection: 'disconnected',
      status: null,
      fileJob: null,
      stream: null,
      lostInJob: null,
    });
  });

  it('only where nothing moves, nothing is held and no job runs', () => {
    expect(holdCount()).toBe(0);
    // no machine connected
    expect(safeToApply()).toBe(true);
    const connected = { connection: 'connected' as const };
    useMachine.setState({ ...connected, status: null });
    expect(safeToApply()).toBe(true);
    const status = (state: string) =>
      ({ state, mpos: [0, 0, 0], wco: [0, 0, 0], feed: 0, spindle: 0, sd: null }) as never;
    useMachine.setState({ status: status('Idle') });
    expect(safeToApply()).toBe(true);
    for (const state of ['Run', 'Hold', 'Jog', 'Home', 'Alarm', 'Door']) {
      useMachine.setState({ status: status(state) });
      expect(safeToApply(), state).toBe(false);
    }
    // a job from the SD card, at rest in between two reports
    useMachine.setState({ status: status('Idle'), fileJob: { name: 'x.nc', startedAt: 0 } });
    expect(safeToApply()).toBe(false);
  });
});

describe('the simulator and the exchange', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    useMachine.setState({ connection: 'disconnected', url: '' });
  });

  it('puts the settings back as they were when the simulator ends – the Pi’s state is what holds', async () => {
    let app: Record<string, unknown> = { camera: 'real calibration', places: 'P' };
    const applied: Record<string, unknown>[] = [];
    const said: string[] = [];
    const meta = new Map([['settings', { rev: 3, base: { ...app } }]]);
    const deps: Deps = {
      client: () => ({
        state: async () => ({ keys: {} }),
        putState: async () => ({ ok: true, rev: 1 }),
      }),
      slices: [
        {
          key: 'settings',
          read: () => ({ ...app }),
          defaults: () => ({}),
          accepts: () => true,
          apply: (doc) => {
            app = { ...doc };
            applied.push(app);
          },
          subscribe: () => () => {},
        },
      ],
      meta: { get: (k) => meta.get(k), set: (k, m) => void meta.set(k, m) },
      safeToApply: () => true,
      simulator: () => {
        const { connection, url } = useMachine.getState();
        return connection !== 'disconnected' && url === 'simulator';
      },
      say: (_kind, text) => void said.push(text),
      name: (_s, k) => k,
      keep: memoryKeep(),
    };
    const stop = startStateSync(60_000, deps);
    await vi.advanceTimersByTimeAsync(2000);
    // the simulator starts: its camera is calibrated, its places set
    useMachine.setState({ connection: 'connected', url: 'simulator' });
    app = { camera: 'simulated calibration', places: 'sim places' };
    useMachine.setState({ status: null });
    // … and ends
    useMachine.setState({ connection: 'disconnected' });
    expect(app).toEqual({ camera: 'real calibration', places: 'P' });
    expect(applied).toHaveLength(1);
    expect(said).toHaveLength(1);
    stop();
  });

  it('leaves settings alone when nothing was changed in the simulator, or when there is no sync to protect', async () => {
    let app: Record<string, unknown> = { camera: 'real' };
    const applied: unknown[] = [];
    const slice = {
      key: 'settings',
      read: () => ({ ...app }),
      defaults: () => ({}),
      accepts: () => true,
      apply: (doc: Record<string, unknown>) => void applied.push(doc),
      subscribe: () => () => {},
    };
    const base: Deps = {
      client: () => ({
        state: async () => ({ keys: {} }),
        putState: async () => ({ ok: true, rev: 1 }),
      }),
      slices: [slice],
      meta: { get: () => ({ rev: 1, base: { camera: 'real' } }), set: () => {} },
      safeToApply: () => true,
      simulator: () => useMachine.getState().connection !== 'disconnected',
      say: () => {},
      name: (_s, k) => k,
      keep: memoryKeep(),
    };
    // nothing changed
    let stop = startStateSync(60_000, base);
    useMachine.setState({ connection: 'connected', url: 'simulator' });
    useMachine.setState({ connection: 'disconnected' });
    expect(applied).toEqual([]);
    stop();
    // no companion: the simulator may change what it likes in this browser, as before
    stop = startStateSync(60_000, { ...base, client: () => null });
    useMachine.setState({ connection: 'connected', url: 'simulator' });
    app = { camera: 'simulated' };
    useMachine.setState({ connection: 'disconnected' });
    expect(applied).toEqual([]);
    expect(app).toEqual({ camera: 'simulated' });
    stop();
  });
});

describe('the client of the state', () => {
  const answer = (status: number, body: unknown) =>
    vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }));

  it('reads the documents, writes from a revision, and tells a moved-on state from a failure', async () => {
    const snapshot = { keys: { settings: { rev: 2, data: { a: 1 } } } };
    let fetchFn = answer(200, snapshot);
    let c = new CompanionClient('http://pi:8080', fetchFn as unknown as typeof fetch);
    expect(await c.state()).toEqual(snapshot);
    expect(fetchFn.mock.calls[0]![0]).toBe('http://pi:8080/api/state');

    fetchFn = answer(200, { ok: true, rev: 3 });
    c = new CompanionClient('http://pi:8080', fetchFn as unknown as typeof fetch);
    expect(await c.putState('settings', 2, { a: 2 })).toEqual({ ok: true, rev: 3 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://pi:8080/api/state/settings');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ baseRev: 2, data: { a: 2 } });

    fetchFn = answer(409, { error: 'conflict', rev: 5, data: { a: 9 } });
    c = new CompanionClient('http://pi:8080', fetchFn as unknown as typeof fetch);
    expect(await c.putState('settings', 2, {})).toEqual({ ok: false, rev: 5, data: { a: 9 } });

    for (const [status, body] of [
      [413, { error: 'too-large' }],
      [500, null],
      [200, { ok: true }],
    ] as const) {
      c = new CompanionClient('http://pi:8080', answer(status, body) as unknown as typeof fetch);
      await expect(c.putState('settings', 0, {})).rejects.toBeInstanceOf(CompanionError);
    }
    // an older companion does not know the route
    c = new CompanionClient(
      'http://pi:8080',
      answer(404, { message: 'Route not found' }) as unknown as typeof fetch,
    );
    await expect(c.state()).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------------------------
// The other documents

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOWRIDER_V4_PROFILE } from '../src/lib/profile';
import { DEFAULT_MACROS } from '../src/lib/macros';
import { useJob } from '../src/store/job';
import { useMacros } from '../src/store/macros';
import { profileDoc } from '../src/store/stateSlices';

const slice = (key: string) => SLICES.find((s) => s.key === key)!;

describe('the documents of the app and the keys of the companion', () => {
  it('are the same list: a document the companion does not know would be refused for ever', () => {
    const text = readFileSync(join(__dirname, '../../companion/src/state.ts'), 'utf8');
    const block = /STATE_KEYS = \[([\s\S]*?)\] as const/.exec(text)![1]!;
    const keys = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    expect(SLICES.map((s) => s.key).sort()).toEqual(keys);
  });
});

describe('the clamps on the table', () => {
  const fixture = { name: 'Zwinge', min: { x: 10, y: 20, z: 0 }, max: { x: 70, y: 40, z: 30 } };
  beforeEach(() =>
    useWorkshop.getState().setSetup({ materialId: null, fixtures: [], fixtureFrame: 'machine' }),
  );

  it('are the fixtures and where they were measured – and nothing else of the setup', () => {
    useWorkshop
      .getState()
      .setSetup({ materialId: 'mdf', fixtures: [fixture], fixtureFrame: 'machine' });
    expect(slice('clamps').read()).toEqual({ fixtures: [fixture], fixtureFrame: 'machine' });
    expect(slice('clamps').defaults()).toEqual({ fixtures: [], fixtureFrame: 'machine' });
  });

  it('are taken in as they are, and refused when they cannot be boxes', () => {
    const s = slice('clamps');
    const good = {
      fixtures: [fixture, { ...fixture, name: 'Schraube', round: true }],
      fixtureFrame: 'work',
    };
    expect(s.accepts(good)).toBe(true);
    s.apply(good);
    expect(useWorkshop.getState().setup.fixtures).toHaveLength(2);
    expect(useWorkshop.getState().setup.fixtureFrame).toBe('work');
    expect(s.accepts({ fixtures: [], fixtureFrame: 'machine' })).toBe(true);
    for (const bad of [
      { fixtures: 'x', fixtureFrame: 'machine' },
      { fixtures: [fixture], fixtureFrame: 'elsewhere' },
      { fixtures: [{ ...fixture, name: 5 }], fixtureFrame: 'machine' },
      { fixtures: [{ ...fixture, min: { x: Number.NaN, y: 0, z: 0 } }], fixtureFrame: 'machine' },
      { fixtures: [{ ...fixture, max: { x: 1, y: 1 } }], fixtureFrame: 'machine' },
      { fixtures: [{ ...fixture, min: { x: 80, y: 0, z: 0 } }], fixtureFrame: 'machine' },
      { fixtures: [{ ...fixture, round: 'yes' }], fixtureFrame: 'machine' },
      { fixtures: [null], fixtureFrame: 'machine' },
    ]) {
      expect(s.accepts(bad as never), JSON.stringify(bad)).toBe(false);
    }
  });

  it('are noticed when they change – not when the material of the job does', () => {
    const heard = vi.fn();
    const stop = slice('clamps').subscribe(heard);
    useWorkshop.getState().setSetup({ materialId: 'mdf' });
    expect(heard).not.toHaveBeenCalled();
    useWorkshop.getState().setSetup({ fixtures: [fixture] });
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('the reference of the tool lengths', () => {
  it('is a height or nothing', () => {
    const s = slice('toolReference');
    expect(s.read()).toEqual({ z: null });
    expect(s.accepts({ z: -12.5 })).toBe(true);
    expect(s.accepts({ z: null })).toBe(true);
    for (const z of ['1', undefined, Number.NaN, Infinity])
      expect(s.accepts({ z } as never)).toBe(false);
    s.apply({ z: -12.5 });
    expect(useWorkshop.getState().toolReferenceZ).toBe(-12.5);
    expect(s.read()).toEqual({ z: -12.5 });
    s.apply({ z: null });
    expect(useWorkshop.getState().toolReferenceZ).toBeNull();
  });
});

describe('the macros', () => {
  it('are a list of named commands', () => {
    const s = slice('macros');
    useMacros.setState({ macros: DEFAULT_MACROS });
    expect(s.read()).toEqual({ list: DEFAULT_MACROS });
    expect(s.defaults()).toEqual({ list: DEFAULT_MACROS });
    const mine = [{ name: 'Park', gcode: 'G53 G0 Z0\nG53 G0 X10 Y10' }];
    expect(s.accepts({ list: mine })).toBe(true);
    s.apply({ list: mine });
    expect(useMacros.getState().macros).toEqual(mine);
    for (const list of ['x', [{ name: '', gcode: 'G0' }], [{ name: 'A' }], [1]]) {
      expect(s.accepts({ list } as never)).toBe(false);
    }
    useMacros.setState({ macros: DEFAULT_MACROS });
  });
});

describe('what was learned about the cutting', () => {
  it('is a correction and a count per pair of tool and material', () => {
    const s = slice('learning');
    const model = { 't1|mdf': { factor: 1.06, jobs: 2 } };
    expect(s.accepts(model)).toBe(true);
    expect(s.accepts({})).toBe(true);
    s.apply(model);
    expect(useWorkshop.getState().learning).toEqual(model);
    expect(s.read()).toEqual(model);
    for (const bad of [
      { a: { factor: 0, jobs: 1 } },
      { a: { factor: 11, jobs: 1 } },
      { a: { factor: Number.NaN, jobs: 1 } },
      { a: { factor: 1, jobs: -1 } },
      { a: { factor: 1, jobs: 1.5 } },
      { a: 5 },
    ]) {
      expect(s.accepts(bad as never), JSON.stringify(bad)).toBe(false);
    }
    useWorkshop.getState().resetLearning();
  });
});

describe('the values of the machine', () => {
  it('are nothing while they are placeholders, and what the operator entered after', () => {
    const s = slice('profile');
    expect(useJob.getState().profile.placeholder).toBe(true);
    expect(s.read()).toEqual({});
    expect(s.accepts({})).toBe(true);
    // an empty document from the Pi changes nothing
    s.apply({});
    expect(useJob.getState().profile.placeholder).toBe(true);

    const entered = {
      travel: { x: { min: -1220, max: 0 }, y: { min: -2440, max: 0 }, z: { min: -120, max: 0 } },
      softLimits: true,
      jogFeed: { xy: 3000, z: 600 },
    };
    expect(s.accepts(entered)).toBe(true);
    s.apply(entered);
    expect(useJob.getState().profile.placeholder).toBe(false);
    const doc = s.read();
    expect(doc).toMatchObject(entered);
    // what was read is what is accepted and gives the same again: the exchange comes to rest
    expect(s.accepts(doc)).toBe(true);
    s.apply(doc);
    expect(same(s.read(), doc)).toBe(true);
    // not a machine: a travel that ends before it begins, a jog feed of nothing
    expect(s.accepts({ ...entered, travel: { ...entered.travel, x: { min: 5, max: 5 } } })).toBe(
      false,
    );
    expect(s.accepts({ ...entered, jogFeed: { xy: 0, z: 1 } })).toBe(false);
    expect(s.accepts({ travel: 'x' })).toBe(false);
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
    expect(profileDoc(LOWRIDER_V4_PROFILE)).toEqual({});
  });
});

// ---------------------------------------------------------------------------------------------
// What the Pi sends is not trusted (review round 7)

import { parseSettings } from '../src/lib/profile';
import { useCalibration } from '../src/store/calibration';
import { syncOnce } from '../src/store/stateSync';

describe('the settings document against what a Pi may send', () => {
  const doc = () => settings.read() as Record<string, unknown>;
  beforeEach(() => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
  });

  it('refuses a part of the wrong kind – also where the defaults would fill the gap and a calibration be lost', () => {
    const camera = doc().camera as Record<string, unknown>;
    expect(settings.accepts(doc())).toBe(true);
    for (const bad of [
      { camera: null },
      { camera: 'x' },
      { camera: 5 },
      { camera: {} },
      { camera: { offsetX: 1 } },
      { camera: { ...camera, offsetX: 'x' } },
      { cornerPlate: 'x' },
      { hiddenFeatures: 'x' },
    ]) {
      expect(settings.accepts({ ...doc(), ...bad }), JSON.stringify(bad)).toBe(false);
    }
  });

  it('refuses numbers that no card would let the operator enter', () => {
    for (const bad of [
      { calibration: { ...DEFAULT_SETTINGS.calibration, points: 1_000_000 } },
      { calibration: { ...DEFAULT_SETTINGS.calibration, points: 1 } },
      { calibration: { ...DEFAULT_SETTINGS.calibration, spanX: 'x' } },
      { calibration: { ...DEFAULT_SETTINGS.calibration, settleMs: -5 } },
      { calibration: { ...DEFAULT_SETTINGS.calibration, motor1Side: 'left' } },
      { cornerPlate: { use: true, top: -50, wall: 3 } },
      { spindle: { rpmMin: -5, rpmMax: -10, maxFeed: 1000 } },
      { spindle: { rpmMin: 10000, rpmMax: 5000, maxFeed: 1000 } },
      { spindle: { rpmMin: 1, rpmMax: 2, maxFeed: 1e12 } },
      { recording: { ...DEFAULT_SETTINGS.recording, intervalSeconds: 0 } },
      { toolChangePosition: { x: 1e9, y: 0 } },
      { parkPosition: { x: 0, y: -1e9 } },
      { waypoints: [{ id: 'w', name: 'weit', x: 1e9, y: 0 }] },
      { toolSetter: { x: 1e9, y: 0, safeZ: -5 } },
    ]) {
      expect(settings.accepts({ ...doc(), ...bad }), JSON.stringify(bad)).toBe(false);
    }
    // what the cards allow goes through
    expect(
      settings.accepts({
        ...doc(),
        calibration: {
          ...DEFAULT_SETTINGS.calibration,
          points: 5,
          gantryWidth: 1200,
          motor1Side: 'xMin',
        },
        cornerPlate: { use: true, top: 12, wall: 3 },
        spindle: { rpmMin: 8000, rpmMax: 24000, maxFeed: 4000 },
      }),
    ).toBe(true);
  });

  it('keeps the safe height out of the lower half of the Z travel – it is where the machine lifts to', () => {
    // the placeholder travel is Z −297 … 3
    expect(settings.accepts({ ...doc(), safeMachineZ: -290 })).toBe(false);
    expect(settings.accepts({ ...doc(), safeMachineZ: 50 })).toBe(false);
    expect(settings.accepts({ ...doc(), safeMachineZ: -5 })).toBe(true);
    expect(settings.accepts({ ...doc(), safeMachineZ: null })).toBe(true);
  });

  it('takes no key that only the object has in common with the settings (constructor, __proto__ …)', () => {
    const theirs = JSON.parse(
      '{"constructor":{"x":1},"toString":"boom","hasOwnProperty":5,"__proto__":{"y":2}}',
    ) as Record<string, unknown>;
    expect(settings.accepts({ ...doc(), ...theirs })).toBe(true);
    settings.apply({ ...doc(), ...theirs });
    const now = useWorkshop.getState().settings;
    for (const key of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(Object.hasOwn(now, key), key).toBe(false);
    }
    expect(Object.keys(now).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('accepts every document this app writes itself – none of the checks may wedge a device', () => {
    expect(settings.accepts(settings.defaults())).toBe(true);
    useWorkshop.getState().setSettings({
      camera: { ...DEFAULT_SETTINGS.camera, offsetX: 12.3, pxPerMm: 17.5, scaleCalibrated: true },
      toolChangePosition: { x: 10, y: 20 },
      parkPosition: { x: 0, y: 0 },
      safeMachineZ: -2,
      toolSetter: { x: 5, y: 5, safeZ: -10 },
      waypoints: [{ id: 'w', name: 'Anschlag', x: 1, y: 2 }],
    });
    expect(settings.accepts(settings.read())).toBe(true);
  });
});

describe('the settings of a device that has met the Pi, against documents that would reset them', () => {
  const calibrated = () =>
    useWorkshop.getState().setSettings({
      camera: { ...DEFAULT_SETTINGS.camera, offsetX: 12.3, pxPerMm: 17.5, scaleCalibrated: true },
      waypoints: [{ id: 'w', name: 'Anschlag', x: 1, y: 2 }],
    });
  const round = async (remote: unknown, rev = 3, base = settings.read()) => {
    const puts: unknown[] = [];
    const deps: Deps = {
      client: () => ({
        state: async () => ({ keys: { settings: { rev, data: remote as never } } }),
        putState: async (_k, _r, data) => {
          puts.push(data);
          return { ok: true, rev: rev + 1 };
        },
      }),
      slices: [settings],
      meta: {
        get: () => ({ rev: 2, base }),
        set: () => {},
      },
      safeToApply: () => true,
      simulator: () => false,
      say: () => {},
      name: (_s, k) => k,
    };
    const outcome = await syncOnce(deps);
    return { outcome, puts };
  };
  beforeEach(() => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
  });

  it('keeps its calibration when the Pi serves an empty document, and gives the Pi the missing parts back', async () => {
    calibrated();
    const { outcome, puts } = await round({});
    expect(outcome).toBe('ok');
    expect(useWorkshop.getState().settings.camera).toMatchObject({ offsetX: 12.3, pxPerMm: 17.5 });
    expect(useWorkshop.getState().settings.waypoints).toHaveLength(1);
    expect((puts[0] as { camera: unknown }).camera).toMatchObject({ offsetX: 12.3 });
  });

  it('keeps it when the Pi serves a camera that is nothing, or is no document at all – nothing is overwritten', async () => {
    calibrated();
    for (const remote of [
      { ...settings.read(), camera: null },
      { ...settings.read(), camera: {} },
      'x',
      5,
    ]) {
      const { outcome, puts } = await round(remote);
      expect(outcome, JSON.stringify(remote)).toBe('refused');
      expect(puts).toEqual([]);
      expect(useWorkshop.getState().settings.camera).toMatchObject({ offsetX: 12.3 });
    }
  });

  it('carries a setting a newer app wrote along, and does not reset it', async () => {
    calibrated();
    const base = settings.read();
    const remote = { ...base, newerSetting: { x: 1 } };
    // nothing of ours changed, nothing of the Pi's we know: nothing is done for it
    const quiet = await round(remote, 3, base);
    expect(quiet.outcome).toBe('ok');
    expect(quiet.puts).toEqual([]);
    // a change of ours goes out with the key still in it – and the key does not get into the settings
    useWorkshop.getState().setSettings({ safeMachineZ: -2 });
    const sent = await round(remote, 3, base);
    expect(sent.puts).toHaveLength(1);
    expect(sent.puts[0]).toMatchObject({ safeMachineZ: -2, newerSetting: { x: 1 } });
    expect(useWorkshop.getState().settings).not.toHaveProperty('newerSetting');
  });
});

describe('the values of the machine against what a Pi may send', () => {
  const entered = {
    travel: { x: { min: -1220, max: 0 }, y: { min: -2440, max: 0 }, z: { min: -120, max: 0 } },
    softLimits: true,
    jogFeed: { xy: 3000, z: 600 },
  };
  afterEach(() => useJob.setState({ profile: LOWRIDER_V4_PROFILE }));

  it('refuses kinematics and controller that are not what a config import makes – they would break the screens', () => {
    const s = slice('profile');
    const kinematics = LOWRIDER_V4_PROFILE.kinematics;
    for (const bad of [
      { kinematics: {} },
      { kinematics: { ...kinematics, axes: {} } },
      { kinematics: { ...kinematics, axes: { x: kinematics.axes.x } } },
      {
        kinematics: {
          ...kinematics,
          axes: { ...kinematics.axes, y: { maxRate: 0, acceleration: 1 } },
        },
      },
      { kinematics: { ...kinematics, axes: { ...kinematics.axes, q: kinematics.axes.x } } },
      { kinematics: { ...kinematics, junctionDeviation: 'x' } },
      { kinematics: { ...kinematics, arcTolerance: 0 } },
      { kinematics: { ...kinematics, pauseSeconds: -1 } },
      { controller: {} },
      { controller: { ...LOWRIDER_V4_PROFILE.controller, mustHome: 'yes' } },
      { controller: { ...LOWRIDER_V4_PROFILE.controller, source: 5 } },
    ]) {
      expect(s.accepts({ ...entered, ...bad }), JSON.stringify(bad).slice(0, 80)).toBe(false);
    }
    // what a config import and the stock values make is fine – and null means "none"
    expect(s.accepts({ ...entered, kinematics, controller: LOWRIDER_V4_PROFILE.controller })).toBe(
      true,
    );
    expect(s.accepts({ ...entered, kinematics: null, controller: null })).toBe(true);
  });

  it('cannot break the analysis of a loaded program: what is accepted is applied without a throw', () => {
    const s = slice('profile');
    useJob.getState().load('x.nc', 'G0 X1\nG1 X10 F600\n');
    const doc = {
      ...entered,
      kinematics: LOWRIDER_V4_PROFILE.kinematics,
      controller: LOWRIDER_V4_PROFILE.controller,
    };
    expect(s.accepts(doc)).toBe(true);
    expect(() => s.apply(doc)).not.toThrow();
    expect(useJob.getState().profile.kinematics.axes.x.maxRate).toBe(9000);
    expect(useJob.getState().analysis).not.toBeNull();
    useJob.getState().unload();
  });

  it('is put back to the placeholder where there was none (the way back from a simulator session)', () => {
    const s = slice('profile');
    s.apply(entered);
    expect(useJob.getState().profile.placeholder).toBe(false);
    s.restore!({});
    expect(useJob.getState().profile.placeholder).toBe(true);
    expect(s.read()).toEqual({});
    // and what was there is put back as it was
    s.apply(entered);
    s.restore!({ ...entered, jogFeed: { xy: 1000, z: 100 } });
    expect(useJob.getState().profile.jogFeed).toEqual({ xy: 1000, z: 100 });
  });

  it('is not recovered from storage after the reset', async () => {
    const { loadProfile, saveProfile, clearProfile } = await import('../src/lib/profile');
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveProfile(storage, entered);
    expect(loadProfile(storage).placeholder).toBe(false);
    clearProfile(storage);
    expect(loadProfile(storage).placeholder).toBe(true);
  });
});

describe('profile settings parsed from storage or the Pi', () => {
  it('needs kinematics with positive rates in x, y and z, and keeps the rotary axis the controller does not report', () => {
    const base = {
      travel: { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, z: { min: 0, max: 1 } },
      softLimits: true,
      jogFeed: { xy: 1, z: 1 },
    };
    const k = {
      axes: {
        x: { maxRate: 1, acceleration: 1 },
        y: { maxRate: 1, acceleration: 1 },
        z: { maxRate: 1, acceleration: 1 },
      },
      junctionDeviation: 0,
      arcTolerance: 0.1,
    };
    const parsed = parseSettings({ ...base, kinematics: k });
    expect(parsed?.kinematics?.axes.a).toEqual(LOWRIDER_V4_PROFILE.kinematics.axes.a);
    expect(parseSettings({ ...base, kinematics: { ...k, axes: null } })).toBeNull();
    expect(
      parseSettings({ ...base, kinematics: { ...k, axes: { ...k.axes, x: null } } }),
    ).toBeNull();
    expect(parseSettings({ ...base, kinematics: 5 })).toBeNull();
    expect(parseSettings({ ...base, controller: 5 })).toBeNull();
  });
});

describe('the reference, macros and learning against what a Pi may send', () => {
  it('refuses a height of the reference tool that is no place of a machine', () => {
    expect(slice('toolReference').accepts({ z: 1e9 })).toBe(false);
    expect(slice('toolReference').accepts({ z: -42.5 })).toBe(true);
  });

  it('holds the learned correction of the feed to where it is learned', () => {
    const s = slice('learning');
    expect(s.accepts({ 'a|b': { factor: 9.9, jobs: 1 } })).toBe(false);
    expect(s.accepts({ 'a|b': { factor: 0.4, jobs: 1 } })).toBe(false);
    expect(s.accepts({ 'a|b': { factor: 0.5, jobs: 1 } })).toBe(true);
    expect(s.accepts({ 'a|b': { factor: 1.5, jobs: 1 } })).toBe(true);
  });

  it('tells which macros came from the Pi and changed – by name, nothing when nothing did', () => {
    const s = slice('macros');
    const before = { list: [{ name: 'Z hoch', gcode: 'G53 G0 Z-5' }] };
    expect(s.announce!(before, before)).toBeNull();
    const after = {
      list: [
        { name: 'Z hoch', gcode: 'G53 G0 Z-5\nM5' },
        { name: 'Neu', gcode: 'G4 P1' },
        ...before.list.slice(1),
      ],
    };
    expect(s.announce!(before, after)).toEqual({
      key: 'sync.macrosFromPi',
      params: { list: 'Z hoch, Neu' },
    });
    // a macro that was only removed is nothing to look at
    expect(
      s.announce!({ list: [...before.list, { name: 'Alt', gcode: 'M5' }] }, before),
    ).toBeNull();
  });
});

describe('when a measuring run is under way', () => {
  afterEach(() => useCalibration.setState({ task: null }));
  it('takes nothing from the Pi: the run reads the camera settings as it goes', () => {
    expect(safeToApply()).toBe(true);
    useCalibration.setState({ task: 'grid' });
    expect(safeToApply()).toBe(false);
  });
});

describe('the simulator, whatever this device has synced before', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    useMachine.setState({ connection: 'disconnected', url: '' });
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
  });

  const isSimulator = () => {
    const { connection, url } = useMachine.getState();
    return connection !== 'disconnected' && url === 'simulator';
  };
  const simulate = (keep: ReturnType<typeof memoryKeep>, client: Deps['client'] | null) => {
    const deps: Deps = {
      client:
        client ??
        (() => ({
          state: async () => ({ keys: {} }),
          putState: async () => ({ ok: true as const, rev: 1 }),
        })),
      slices: SLICES,
      meta: { get: () => undefined, set: () => {} },
      safeToApply: () => true,
      simulator: isSimulator,
      say: () => {},
      name: (_s, k) => k,
      keep,
    };
    return deps;
  };

  it('is undone also on a device that never synced, and a profile the simulator described goes with it', async () => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    const keep = memoryKeep();
    const stop = startStateSync(60_000, simulate(keep, null));
    await vi.advanceTimersByTimeAsync(10);
    useMachine.setState({ connection: 'connected', url: 'simulator' });
    expect(keep.load()).not.toBeNull();
    // the simulator's camera and its machine
    useWorkshop.getState().setSettings({ camera: { ...DEFAULT_SETTINGS.camera, offsetX: 50 } });
    useJob.getState().setProfileSettings({
      travel: { x: { min: -1, max: 0 }, y: { min: -1, max: 0 }, z: { min: -1, max: 0 } },
      softLimits: true,
      jogFeed: { xy: 1, z: 1 },
    });
    useMachine.setState({ connection: 'disconnected' });
    expect(useWorkshop.getState().settings.camera.offsetX).toBe(0);
    expect(useJob.getState().profile.placeholder).toBe(true);
    expect(keep.load()).toBeNull();
    stop();
  });

  it('is undone after a reload too: what was kept is put back at the start, before the first round', async () => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    const kept = { settings: syncedSettings(DEFAULT_SETTINGS), profile: {} };
    // the page was closed in the simulator: its settings are what this browser stored
    useWorkshop.getState().setSettings({ camera: { ...DEFAULT_SETTINGS.camera, offsetX: 50 } });
    const keep = memoryKeep(kept);
    const stop = startStateSync(60_000, simulate(keep, null));
    expect(useWorkshop.getState().settings.camera.offsetX).toBe(0);
    expect(keep.load()).toBeNull();
    stop();
  });

  it('does not touch a reload that happens while a simulator is the machine', async () => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    useMachine.setState({ connection: 'connected', url: 'simulator' });
    useWorkshop.getState().setSettings({ camera: { ...DEFAULT_SETTINGS.camera, offsetX: 50 } });
    const keep = memoryKeep({ settings: syncedSettings(DEFAULT_SETTINGS) });
    const stop = startStateSync(60_000, simulate(keep, null));
    expect(useWorkshop.getState().settings.camera.offsetX).toBe(50);
    expect(keep.load()).not.toBeNull();
    stop();
  });

  it('keeps nothing where no Pi is configured – the simulator may change what it likes in this browser', async () => {
    const keep = memoryKeep();
    const stop = startStateSync(
      60_000,
      simulate(keep, () => null),
    );
    useMachine.setState({ connection: 'connected', url: 'simulator' });
    expect(keep.load()).toBeNull();
    stop();
  });
});

describe('what this app writes itself is never refused by its own checks', () => {
  // A stricter check that turned away a document of this very app would cut a device off from the Pi.
  it('the stock machine profile, a profile read from a config.yaml, the stock macros, the settings the cards produce', async () => {
    const { readMachineConfig } = await import('@lowrider/fluidnc-client');
    const { settingsFromConfig } = await import('../src/lib/profile');
    const config = readMachineConfig(
      readFileSync(new URL('../../../machine/config.yaml', import.meta.url), 'utf8'),
    );
    const profile = slice('profile');
    expect(profile.accepts(profileDoc({ ...LOWRIDER_V4_PROFILE, placeholder: false }))).toBe(true);
    const imported = settingsFromConfig(config, LOWRIDER_V4_PROFILE)!;
    expect(profile.accepts({ ...imported })).toBe(true);
    // … and what that makes of the profile reads back as an acceptable document
    profile.apply({ ...imported });
    expect(profile.accepts(profile.read())).toBe(true);
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
    expect(slice('macros').accepts({ list: DEFAULT_MACROS })).toBe(true);
    expect(slice('macros').accepts(slice('macros').defaults())).toBe(true);
    for (const key of ['clamps', 'toolReference', 'learning', 'settings', 'profile']) {
      expect(slice(key).accepts(slice(key).defaults()), key).toBe(true);
    }
  });
});
