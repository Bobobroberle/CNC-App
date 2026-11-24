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
