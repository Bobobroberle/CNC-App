import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionError } from '../src/lib/companion';
import { same, type Doc } from '../src/lib/stateSync';
import {
  startStateSync,
  syncOnce,
  type Deps,
  type Meta,
  type Slice,
  type StateClient,
} from '../src/store/stateSync';

/** A Pi that counts revisions like the companion does, and can be made to fail or to be written to meanwhile. */
class FakePi implements StateClient {
  docs = new Map<string, { rev: number; data: Doc }>();
  calls: string[] = [];
  down: 'offline' | 404 | null = null;
  /** Runs before a write is looked at: another device writing just then */
  beforePut: (() => void) | null = null;
  seed(key: string, data: Doc, rev = 1) {
    this.docs.set(key, { rev, data });
  }
  async state() {
    this.calls.push('state');
    if (this.down === 404) throw new CompanionError(404, null);
    if (this.down) throw new Error('network');
    return {
      keys: Object.fromEntries([...this.docs].map(([k, v]) => [k, { rev: v.rev, data: v.data }])),
    };
  }
  async putState(key: string, baseRev: number, data: object) {
    this.calls.push(`put:${key}@${baseRev}`);
    this.beforePut?.();
    const current = this.docs.get(key);
    const rev = current?.rev ?? 0;
    if (baseRev !== rev) return { ok: false as const, rev, data: current?.data };
    this.docs.set(key, { rev: rev + 1, data: structuredClone(data) as Doc });
    return { ok: true as const, rev: rev + 1 };
  }
  rev = (key: string) => this.docs.get(key)?.rev ?? 0;
  data = (key: string) => this.docs.get(key)?.data;
}

const DEFAULTS: Doc = { camera: 'default', places: 'default', macros: 'default' };

function rig(initial: Doc = DEFAULTS) {
  const pi = new FakePi();
  let app: Doc = { ...initial };
  const applied: Doc[] = [];
  const listeners = new Set<() => void>();
  const slice: Slice = {
    key: 'settings',
    read: () => structuredClone(app),
    defaults: () => ({ ...DEFAULTS }),
    accepts: (doc) => !('bad' in doc),
    apply: (doc) => {
      app = structuredClone(doc);
      applied.push(app);
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const metaMap = new Map<string, Meta>();
  const said: [string, string][] = [];
  const metaWrites: string[] = [];
  const state = { client: pi as StateClient | null, safe: true, simulator: false };
  const deps: Deps = {
    client: () => state.client,
    slices: [slice],
    meta: {
      get: (k) => metaMap.get(k),
      set: (k, m) => {
        metaWrites.push(k);
        metaMap.set(k, structuredClone(m));
      },
    },
    safeToApply: () => state.safe,
    simulator: () => state.simulator,
    say: (kind, text) => void said.push([kind, text]),
    name: (_s, k) => k,
  };
  return {
    pi,
    deps,
    state,
    applied,
    said,
    metaMap,
    metaWrites,
    app: () => app,
    edit: (patch: Doc) => {
      app = { ...app, ...patch };
      listeners.forEach((l) => l());
    },
  };
}

describe('the exchange with the Pi, one round', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => {
    r = rig();
  });

  it('does nothing without a companion, and nothing while a simulator is the machine', async () => {
    r.state.client = null;
    expect(await syncOnce(r.deps)).toBe('off');
    r.state.client = r.pi;
    r.state.simulator = true;
    expect(await syncOnce(r.deps)).toBe('paused');
    expect(r.pi.calls).toEqual([]);
  });

  it('says an older companion (404) and an unreachable one apart, and changes nothing', async () => {
    r.pi.down = 404;
    expect(await syncOnce(r.deps)).toBe('unsupported');
    r.pi.down = 'offline';
    expect(await syncOnce(r.deps)).toBe('offline');
    expect(r.metaMap.size).toBe(0);
    expect(r.applied).toEqual([]);
  });

  it('puts its own state on a Pi that has none – and then leaves it alone', async () => {
    r.edit({ camera: 'calibrated' });
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.pi.data('settings')).toEqual({
      camera: 'calibrated',
      places: 'default',
      macros: 'default',
    });
    expect(r.pi.rev('settings')).toBe(1);
    expect(r.metaMap.get('settings')).toMatchObject({ rev: 1 });
    r.pi.calls.length = 0;
    r.metaWrites.length = 0;
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.pi.calls).toEqual(['state']);
    // a round in which nothing changed does not even rewrite the note of what it knows
    expect(r.metaWrites).toEqual([]);
  });

  it('first contact with a Pi that has a state and a device that still has the defaults: the Pi’s state is taken', async () => {
    r.pi.seed('settings', { camera: 'calibrated at the Pi', places: 'P', macros: 'default' });
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.app()).toEqual({ camera: 'calibrated at the Pi', places: 'P', macros: 'default' });
    expect(r.pi.calls).toEqual(['state']);
    expect(r.said).toEqual([]);
  });

  it('first contact where the Pi has defaults but this device was calibrated: this device’s values go to the Pi', async () => {
    r.pi.seed('settings', { ...DEFAULTS });
    r.edit({ camera: 'my calibration' });
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.pi.data('settings')).toMatchObject({ camera: 'my calibration' });
    expect(r.applied).toEqual([]);
  });

  it('first contact where both differ: the Pi wins for that key, this device’s other changes are kept, and it is said', async () => {
    r.pi.seed('settings', { camera: 'at the Pi', places: 'default', macros: 'default' });
    r.edit({ camera: 'mine', places: 'mine too' });
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.app()).toEqual({ camera: 'at the Pi', places: 'mine too', macros: 'default' });
    expect(r.pi.data('settings')).toEqual({
      camera: 'at the Pi',
      places: 'mine too',
      macros: 'default',
    });
    expect(r.said).toHaveLength(1);
    expect(r.said[0]![1]).toContain('camera');
  });

  it('sends a change from the revision it knows, and takes a change of another device', async () => {
    await syncOnce(r.deps);
    r.edit({ places: 'P1' });
    r.pi.calls.length = 0;
    await syncOnce(r.deps);
    expect(r.pi.calls).toEqual(['state', 'put:settings@1']);
    expect(r.pi.rev('settings')).toBe(2);
    // another device changes the macros
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), macros: 'from the iPad' }, 3);
    await syncOnce(r.deps);
    expect(r.app()).toMatchObject({ places: 'P1', macros: 'from the iPad' });
    expect(r.metaMap.get('settings')).toMatchObject({ rev: 3 });
  });

  it('merges a change of this device and another one of the Pi in the same round', async () => {
    await syncOnce(r.deps);
    r.edit({ camera: 'mine' });
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'theirs' }, 2);
    await syncOnce(r.deps);
    const expected = { camera: 'mine', places: 'theirs', macros: 'default' };
    expect(r.app()).toEqual(expected);
    expect(r.pi.data('settings')).toEqual(expected);
    expect(r.said).toEqual([]);
  });

  it('writes again from the new revision when another device wrote in between – and loses nothing of either', async () => {
    await syncOnce(r.deps);
    r.edit({ camera: 'mine' });
    let once = true;
    r.pi.beforePut = () => {
      if (!once) return;
      once = false;
      r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'iPad was quicker' }, 2);
    };
    r.pi.calls.length = 0;
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.pi.calls).toEqual(['state', 'put:settings@1', 'put:settings@2']);
    const expected = { camera: 'mine', places: 'iPad was quicker', macros: 'default' };
    expect(r.pi.data('settings')).toEqual(expected);
    expect(r.app()).toEqual(expected);
  });

  it('gives up after a few lost races and leaves the rest for the next round', async () => {
    await syncOnce(r.deps);
    r.edit({ camera: 'mine' });
    let rev = 1;
    r.pi.beforePut = () =>
      r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), n: rev }, ++rev);
    expect(await syncOnce(r.deps)).toBe('deferred');
    expect(r.metaMap.get('settings')).toMatchObject({ rev: 1 });
  });

  it('names a key both devices changed (this device’s value stays)', async () => {
    await syncOnce(r.deps);
    r.edit({ camera: 'mine' });
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), camera: 'theirs' }, 2);
    await syncOnce(r.deps);
    expect(r.app().camera).toBe('mine');
    expect(r.pi.data('settings')).toMatchObject({ camera: 'mine' });
    expect(r.said).toHaveLength(1);
    expect(r.said[0]![1]).toContain('camera');
  });

  it('puts its state back on a Pi that lost its own (a new card)', async () => {
    r.edit({ camera: 'calibrated' });
    await syncOnce(r.deps);
    r.pi.docs.clear();
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.pi.data('settings')).toMatchObject({ camera: 'calibrated' });
    expect(r.pi.rev('settings')).toBe(1);
  });

  describe('while the machine moves or a job runs', () => {
    it('takes nothing from the Pi: it waits, and takes it when the machine stands', async () => {
      await syncOnce(r.deps);
      r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'moved at the Pi' }, 2);
      r.state.safe = false;
      expect(await syncOnce(r.deps)).toBe('deferred');
      expect(r.app().places).toBe('default');
      expect(r.metaMap.get('settings')).toMatchObject({ rev: 1 });
      r.state.safe = true;
      expect(await syncOnce(r.deps)).toBe('ok');
      expect(r.app().places).toBe('moved at the Pi');
    });

    it('still sends what this device changed, when the Pi has not moved on', async () => {
      await syncOnce(r.deps);
      r.edit({ camera: 'recalibrated' });
      r.state.safe = false;
      expect(await syncOnce(r.deps)).toBe('ok');
      expect(r.pi.data('settings')).toMatchObject({ camera: 'recalibrated' });
      expect(r.applied).toEqual([]);
    });

    it('sends nothing that would need the Pi’s values first', async () => {
      await syncOnce(r.deps);
      r.edit({ camera: 'recalibrated' });
      r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'moved at the Pi' }, 2);
      r.state.safe = false;
      r.pi.calls.length = 0;
      expect(await syncOnce(r.deps)).toBe('deferred');
      expect(r.pi.calls).toEqual(['state']);
      r.state.safe = true;
      await syncOnce(r.deps);
      expect(r.app()).toMatchObject({ camera: 'recalibrated', places: 'moved at the Pi' });
    });

    it('sends nothing on a first contact that would need the Pi’s values first', async () => {
      r.pi.seed('settings', { camera: 'at the Pi', places: 'default', macros: 'default' });
      r.edit({ macros: 'mine' });
      r.state.safe = false;
      expect(await syncOnce(r.deps)).toBe('deferred');
      expect(r.pi.calls).toEqual(['state']);
      expect(r.metaMap.size).toBe(0);
      r.state.safe = true;
      expect(await syncOnce(r.deps)).toBe('ok');
      expect(r.app()).toEqual({ camera: 'at the Pi', places: 'default', macros: 'mine' });
      expect(r.pi.data('settings')).toEqual(r.app());
    });

    it('does not take the first state of a Pi before the machine stands', async () => {
      r.pi.seed('settings', { camera: 'at the Pi', places: 'default', macros: 'default' });
      r.state.safe = false;
      expect(await syncOnce(r.deps)).toBe('deferred');
      expect(r.app().camera).toBe('default');
      expect(r.metaMap.size).toBe(0);
    });
  });

  describe('what the Pi sends is not taken blindly', () => {
    it('refuses a document that cannot be this app’s: nothing is taken, nothing overwritten, it is said', async () => {
      r.pi.seed('settings', { camera: 'x', bad: true });
      r.edit({ places: 'mine' });
      expect(await syncOnce(r.deps)).toBe('refused');
      expect(r.app()).toEqual({ camera: 'default', places: 'mine', macros: 'default' });
      expect(r.pi.data('settings')).toEqual({ camera: 'x', bad: true });
      expect(r.pi.calls).toEqual(['state']);
      expect(r.said).toHaveLength(1);
      expect(r.metaMap.size).toBe(0);
    });

    it('sends nothing that cannot be a state of this app, not even its own', async () => {
      await syncOnce(r.deps);
      r.edit({ bad: 1 });
      r.pi.calls.length = 0;
      expect(await syncOnce(r.deps)).toBe('refused');
      expect(r.pi.calls).toEqual(['state']);
      expect(r.pi.data('settings')).not.toHaveProperty('bad');
    });

    it('refuses a document that is no document', async () => {
      r.pi.seed('settings', [1, 2] as unknown as Doc);
      expect(await syncOnce(r.deps)).toBe('refused');
      expect(r.applied).toEqual([]);
    });

    it('refuses what the merge would make of it, before it is written', async () => {
      await syncOnce(r.deps);
      r.edit({ camera: 'mine' });
      // the other device’s write hands over a document that is no state of this app
      r.pi.beforePut = () => r.pi.seed('settings', { camera: 'x', bad: 1 }, 2);
      expect(await syncOnce(r.deps)).toBe('refused');
      expect(r.pi.data('settings')).toEqual({ camera: 'x', bad: 1 });
    });
  });
});

describe('the running exchange', () => {
  beforeEach(() => vi.useFakeTimers());

  it('sends a change soon, not at every keystroke', async () => {
    const r = rig();
    const stop = startStateSync(60_000, r.deps);
    await vi.advanceTimersByTimeAsync(2000);
    r.pi.calls.length = 0;
    r.edit({ camera: 'a' });
    r.edit({ camera: 'ab' });
    r.edit({ camera: 'abc' });
    await vi.advanceTimersByTimeAsync(500);
    expect(r.pi.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(r.pi.calls).toEqual(['state', 'put:settings@1']);
    expect(r.pi.data('settings')).toMatchObject({ camera: 'abc' });
    stop();
  });

  it('asks the Pi again and again, and takes what changed there', async () => {
    const r = rig();
    const stop = startStateSync(10_000, r.deps);
    await vi.advanceTimersByTimeAsync(2000);
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'from the iPad' }, 2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.app().places).toBe('from the iPad');
    stop();
    r.pi.calls.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.pi.calls).toEqual([]);
  });

  it('does not send what it has just taken itself (an apply is no change of this device)', async () => {
    const r = rig();
    const stop = startStateSync(10_000, r.deps);
    await vi.advanceTimersByTimeAsync(2000);
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'from the iPad' }, 2);
    await vi.advanceTimersByTimeAsync(10_000);
    r.pi.calls.length = 0;
    // an apply notifies the listeners like an edit does
    r.edit({});
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.pi.calls).toEqual([]);
    expect(same(r.pi.data('settings'), r.app())).toBe(true);
    stop();
  });
});
