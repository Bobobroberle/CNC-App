import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionClient, CompanionError } from '../src/lib/companion';
import { holdCount } from '../src/lib/holds';
import { syncedSettings, same } from '../src/lib/stateSync';
import { useMachine } from '../src/store/machine';
import { safeToApply, SLICES, startStateSync, type Deps } from '../src/store/stateSync';
import '../src/store/underway';
import { DEFAULT_SETTINGS, useWorkshop } from '../src/store/workshop';

const settings = SLICES.find((s) => s.key === 'settings')!;

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
