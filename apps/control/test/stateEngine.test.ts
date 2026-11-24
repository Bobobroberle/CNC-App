import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionError } from '../src/lib/companion';
import { same, type Doc } from '../src/lib/stateSync';
import {
  createKeep,
  createMetaStore,
  nameOf,
  overwritePi,
  startStateSync,
  syncNow,
  syncOnce,
  useStateSync,
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

function rig(initial: Doc = DEFAULTS, keys?: readonly string[]) {
  const pi = new FakePi();
  let app: Doc = { ...initial };
  const applied: Doc[] = [];
  const listeners = new Set<() => void>();
  const slice: Slice = {
    key: 'settings',
    keys,
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
    slice,
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

/** A device and a Pi that have both met before, with nothing set: revision 1, the defaults. */
async function first(r: ReturnType<typeof rig>) {
  r.pi.seed('settings', { ...DEFAULTS });
  await syncOnce(r.deps);
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

  it('writes nothing for a state that is still the defaults, on a Pi that has none', async () => {
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.pi.calls).toEqual(['state']);
    expect(r.metaMap.size).toBe(0);
    // the first thing set here is the first thing said
    r.edit({ camera: 'calibrated' });
    await syncOnce(r.deps);
    expect(r.pi.calls).toEqual(['state', 'state', 'put:settings@0']);
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
    await first(r);
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
    await first(r);
    r.edit({ camera: 'mine' });
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'theirs' }, 2);
    await syncOnce(r.deps);
    const expected = { camera: 'mine', places: 'theirs', macros: 'default' };
    expect(r.app()).toEqual(expected);
    expect(r.pi.data('settings')).toEqual(expected);
    expect(r.said).toEqual([]);
  });

  it('writes again from the new revision when another device wrote in between – and loses nothing of either', async () => {
    await first(r);
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
    await first(r);
    r.edit({ camera: 'mine' });
    let rev = 1;
    r.pi.beforePut = () =>
      r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), n: rev }, ++rev);
    expect(await syncOnce(r.deps)).toBe('deferred');
    expect(r.metaMap.get('settings')).toMatchObject({ rev: 1 });
  });

  it('names a key both devices changed (this device’s value stays)', async () => {
    await first(r);
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
      await first(r);
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
      await first(r);
      r.edit({ camera: 'recalibrated' });
      r.state.safe = false;
      expect(await syncOnce(r.deps)).toBe('ok');
      expect(r.pi.data('settings')).toMatchObject({ camera: 'recalibrated' });
      expect(r.applied).toEqual([]);
    });

    it('sends nothing that would need the Pi’s values first', async () => {
      await first(r);
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
      await first(r);
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
    r.pi.seed('settings', { ...DEFAULTS });
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

describe('the round as the operator sees it', () => {
  it('says how it went, and takes the log of measurements along only when the Pi answered', async () => {
    const r = rig();
    const log = vi.fn(async () => {});
    r.deps.afterRound = log;
    await syncNow(r.deps);
    expect(useStateSync.getState().state).toBe('ok');
    expect(useStateSync.getState().lastOkAt).not.toBeNull();
    expect(log).toHaveBeenCalledTimes(1);

    r.pi.down = 'offline';
    await syncNow(r.deps);
    expect(useStateSync.getState().state).toBe('offline');
    r.pi.down = 404;
    await syncNow(r.deps);
    expect(useStateSync.getState().state).toBe('unsupported');
    r.pi.down = null;
    r.state.simulator = true;
    await syncNow(r.deps);
    expect(useStateSync.getState().state).toBe('paused');
    r.state.simulator = false;
    r.state.client = null;
    await syncNow(r.deps);
    expect(useStateSync.getState().state).toBe('off');
    expect(log).toHaveBeenCalledTimes(1);

    // the Pi answered, but its newer values wait for the machine to stand: the log still goes
    r.state.client = r.pi;
    await syncNow(r.deps);
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'moved at the Pi' }, 9);
    r.state.safe = false;
    await syncNow(r.deps);
    expect(useStateSync.getState().state).toBe('deferred');
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('does not run two rounds at once: a request meanwhile makes one more after it', async () => {
    const r = rig();
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => (release = resolve));
    const state = r.pi.state.bind(r.pi);
    r.pi.state = async () => {
      await slow;
      return state();
    };
    const first = syncNow(r.deps);
    const second = syncNow(r.deps);
    release();
    await Promise.all([first, second]);
    await vi.waitFor(() => expect(r.pi.calls.filter((c) => c === 'state').length).toBe(2));
  });
});

const FIXED = ['camera', 'places', 'macros'] as const;

describe('a document that has keys this app does not know, or lacks some it knows', () => {
  it('carries what it does not know along – untouched, and without applying or writing for it', async () => {
    const r = rig(DEFAULTS, FIXED);
    await first(r);
    // a newer app wrote a key of its own
    r.pi.seed('settings', { ...DEFAULTS, future: { x: 1 } }, 2);
    r.pi.calls.length = 0;
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.pi.calls).toEqual(['state', 'state']);
    expect(r.applied).toEqual([]);
    expect(r.metaMap.get('settings')!.base).not.toHaveProperty('future');
    // a change of this device goes out with the key still there
    r.edit({ places: 'P' });
    await syncOnce(r.deps);
    expect(r.pi.data('settings')).toEqual({ ...DEFAULTS, places: 'P', future: { x: 1 } });
    // and a change of the Pi's own keys is taken without losing it either
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), macros: 'M' }, 9);
    await syncOnce(r.deps);
    expect(r.app()).toEqual({ camera: 'default', places: 'P', macros: 'M' });
    expect(r.pi.data('settings')).toHaveProperty('future');
    // nothing goes back and forth: a further round does nothing
    r.pi.calls.length = 0;
    await syncOnce(r.deps);
    expect(r.pi.calls).toEqual(['state']);
  });

  it('treats a key the Pi’s copy lacks as unchanged, not as removed – and puts it back', async () => {
    const r = rig(DEFAULTS, FIXED);
    r.edit({ camera: 'calibrated' });
    await syncOnce(r.deps);
    r.pi.seed('settings', { places: 'default', macros: 'default' }, 5);
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.app().camera).toBe('calibrated');
    expect(r.applied).toEqual([]);
    expect(r.pi.data('settings')).toMatchObject({ camera: 'calibrated' });
    // a document with nothing in it does the same
    r.pi.seed('settings', {}, 9);
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.app().camera).toBe('calibrated');
    expect(r.pi.data('settings')).toMatchObject({ camera: 'calibrated' });
  });

  it('does not write a shorter document just to add keys at their defaults – and writes one that is not at them', async () => {
    const r = rig(DEFAULTS, FIXED);
    // a Pi that has only some of the keys (an older app wrote it); this device has the rest at the defaults
    r.pi.seed('settings', { camera: 'at the Pi' }, 4);
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.app()).toEqual({ camera: 'at the Pi', places: 'default', macros: 'default' });
    expect(r.pi.calls).toEqual(['state']);
    expect(r.pi.rev('settings')).toBe(4);
    // …but a key this device has set is written at once
    r.edit({ places: 'mine' });
    await syncOnce(r.deps);
    expect(r.pi.data('settings')).toMatchObject({ camera: 'at the Pi', places: 'mine' });
  });

  it('still lets a document of free keys lose one – a reset reaches every device and is not brought back', async () => {
    const r = rig({ a: 1, b: 2 } as Doc);
    r.pi.seed('settings', { a: 1, b: 2 });
    await syncOnce(r.deps);
    expect(r.metaMap.get('settings')).toBeDefined();
    r.pi.seed('settings', {}, 2);
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.app()).toEqual({});
    r.pi.calls.length = 0;
    await syncOnce(r.deps);
    expect(r.pi.calls).toEqual(['state']);
    expect(r.pi.data('settings')).toEqual({});
  });
});

describe('a Pi whose revision went back', () => {
  it('is followed by what it says, not by its number – and it is said', async () => {
    const r = rig(DEFAULTS, FIXED);
    await first(r);
    r.pi.seed('settings', { ...DEFAULTS, places: 'P5' }, 5);
    await syncOnce(r.deps);
    expect(r.app().places).toBe('P5');
    // restored from a backup: an older state, an older number
    r.pi.seed('settings', { ...DEFAULTS, places: 'P2' }, 2);
    expect(await syncOnce(r.deps)).toBe('ok');
    expect(r.app().places).toBe('P2');
    expect(r.said.some(([kind, text]) => kind === 'info' && text.includes('places'))).toBe(true);
    // the same number for another state
    r.pi.seed('settings', { ...DEFAULTS, places: 'P2 again' }, 2);
    await syncOnce(r.deps);
    expect(r.app().places).toBe('P2 again');
    // and a change of this device then goes out from the number the Pi has
    r.edit({ camera: 'mine' });
    r.pi.calls.length = 0;
    await syncOnce(r.deps);
    expect(r.pi.calls).toEqual(['state', 'put:settings@2']);
  });
});

describe('a change of the operator while the Pi is written', () => {
  it('is not overwritten by what was computed before – the next round merges it', async () => {
    const r = rig(DEFAULTS, FIXED);
    await first(r);
    r.edit({ camera: 'mine' });
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), places: 'theirs' }, 2);
    r.pi.beforePut = () => {
      r.pi.beforePut = null;
      r.edit({ macros: 'typed meanwhile' });
    };
    expect(await syncOnce(r.deps)).toBe('deferred');
    expect(r.app().macros).toBe('typed meanwhile');
    expect(r.metaMap.get('settings')).toMatchObject({ rev: 1 });
    expect(await syncOnce(r.deps)).toBe('ok');
    const expected = { camera: 'mine', places: 'theirs', macros: 'typed meanwhile' };
    expect(r.app()).toEqual(expected);
    expect(r.pi.data('settings')).toEqual(expected);
  });
});

describe('what goes wrong', () => {
  it('a document that cannot be taken in leaves this device as it was, says so, and records nothing', async () => {
    const r = rig(DEFAULTS, FIXED);
    await first(r);
    r.pi.seed('settings', { ...DEFAULTS, places: 'theirs' }, 2);
    const apply = r.slice.apply;
    let calls = 0;
    r.slice.apply = (doc) => {
      calls++;
      if (calls === 1) throw new Error('half-way');
      apply(doc);
    };
    expect(await syncOnce(r.deps)).toBe('failed');
    expect(r.app().places).toBe('default');
    expect(r.metaMap.get('settings')).toMatchObject({ rev: 1 });
    expect(r.said.map(([k]) => k)).toEqual(['error']);
  });

  it('a Pi that answers with an error is no Pi that does not answer – the other documents still go', async () => {
    const r = rig(DEFAULTS, FIXED);
    const other = rig({ z: 0 }, ['z']);
    const slices: Slice[] = [r.slice, { ...other.slice, key: 'toolReference' }];
    r.deps.slices = slices;
    await first(r);
    r.edit({ camera: 'mine' });
    const put = r.pi.putState.bind(r.pi);
    r.pi.putState = async (key, rev, data) => {
      if (key === 'settings') throw new CompanionError(507, 'full');
      return put(key, rev, data);
    };
    expect(await syncOnce(r.deps)).toBe('failed');
    r.pi.putState = async () => {
      throw new Error('network');
    };
    expect(await syncOnce(r.deps)).toBe('offline');
  });

  it('says a refused document once, not at every round – and again when the Pi holds another one', async () => {
    const r = rig(DEFAULTS, FIXED);
    r.pi.seed('settings', { camera: 'x', bad: true }, 3);
    for (let i = 0; i < 3; i++) await syncOnce(r.deps);
    expect(r.said).toHaveLength(1);
    r.pi.seed('settings', { camera: 'y', bad: true }, 4);
    await syncOnce(r.deps);
    expect(r.said).toHaveLength(2);
  });

  it('does not keep the log of measurements waiting behind a document it refuses', async () => {
    const r = rig(DEFAULTS, FIXED);
    r.pi.seed('settings', { camera: 'x', bad: true }, 3);
    const log = vi.fn(async () => {});
    r.deps.afterRound = log;
    await syncNow(r.deps);
    expect(useStateSync.getState().state).toBe('refused');
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('the way out of a document nobody can use', () => {
  it('replaces it with this device’s state – only it, and only where this device’s own is fine', async () => {
    const r = rig(DEFAULTS, FIXED);
    await first(r);
    r.edit({ camera: 'mine' });
    r.pi.seed('settings', { camera: 'x', bad: true }, 4);
    expect(await syncOnce(r.deps)).toBe('refused');
    expect(await overwritePi(r.deps)).toEqual(['settings']);
    expect(r.pi.data('settings')).toEqual({ ...DEFAULTS, camera: 'mine' });
    // and the device knows it: what it wrote is what both have now
    expect(r.metaMap.get('settings')).toEqual({
      rev: 5,
      base: { ...DEFAULTS, camera: 'mine' },
    });
    expect(r.pi.rev('settings')).toBe(5);
    expect(await syncOnce(r.deps)).toBe('ok');
    // a document that is fine is left alone
    r.pi.seed('settings', { ...DEFAULTS, camera: 'fine' }, 6);
    expect(await overwritePi(r.deps)).toEqual([]);
    expect(r.pi.data('settings')).toMatchObject({ camera: 'fine' });
  });

  it('does not write what this device could not have either, nor while a simulator runs, nor without a Pi', async () => {
    const r = rig(DEFAULTS, FIXED);
    r.pi.seed('settings', { camera: 'x', bad: true }, 4);
    r.edit({ bad: 1 });
    expect(await overwritePi(r.deps)).toEqual([]);
    r.state.simulator = true;
    expect(await overwritePi(r.deps)).toEqual([]);
    r.state.simulator = false;
    r.state.client = null;
    expect(await overwritePi(r.deps)).toEqual([]);
    expect(r.pi.data('settings')).toEqual({ camera: 'x', bad: true });
  });

  it('leaves a document alone that another device has replaced in the meantime', async () => {
    const r = rig(DEFAULTS, FIXED);
    r.pi.seed('settings', { camera: 'x', bad: true }, 4);
    r.pi.beforePut = () => r.pi.seed('settings', { ...DEFAULTS, camera: 'fixed by another' }, 5);
    expect(await overwritePi(r.deps)).toEqual([]);
    expect(r.pi.data('settings')).toMatchObject({ camera: 'fixed by another' });
  });
});

describe('what this window knows of the Pi', () => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      values,
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => void values.set(k, v),
    };
  };

  it('is kept per window and in the browser: a second window starts from it and then goes its own way', () => {
    const shared = storage();
    const a = createMetaStore(shared);
    const b = createMetaStore(shared);
    expect(a.get('settings')).toBeUndefined();
    a.set('settings', { rev: 3, base: { x: 1 } });
    // b looks for the first time: it finds what a wrote
    expect(b.get('settings')).toEqual({ rev: 3, base: { x: 1 } });
    // from then on each is its own: what a learns later is not b's note
    a.set('settings', { rev: 4, base: { x: 2 } });
    expect(b.get('settings')).toEqual({ rev: 3, base: { x: 1 } });
    // a window that starts now finds the latest
    expect(createMetaStore(shared).get('settings')).toEqual({ rev: 4, base: { x: 2 } });
  });

  it('is remembered by the window where the browser stores nothing', () => {
    const none = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    const meta = createMetaStore(none);
    meta.set('settings', { rev: 1, base: { a: 1 } });
    expect(meta.get('settings')).toEqual({ rev: 1, base: { a: 1 } });
  });

  it('does not believe a note that is none', () => {
    const bad = storage();
    bad.values.set(
      'lowrider-control.sync',
      JSON.stringify({ a: { rev: 1.5, base: {} }, b: { rev: 1, base: 3 } }),
    );
    const meta = createMetaStore(bad);
    expect(meta.get('a')).toBeUndefined();
    expect(meta.get('b')).toBeUndefined();
    bad.values.set('lowrider-control.sync', '[1]');
    expect(createMetaStore(bad).get('a')).toBeUndefined();
  });

  it('keeps the state from before a simulator session, and gives it back once', () => {
    const keep = createKeep(storage());
    expect(keep.load()).toBeNull();
    keep.save({ settings: { camera: 'real' } });
    expect(keep.load()).toEqual({ settings: { camera: 'real' } });
    keep.save(null);
    expect(keep.load()).toBeNull();
  });
});

describe('how a round ends when its documents end differently', () => {
  const twoDocuments = () => {
    const r = rig(DEFAULTS, FIXED);
    const other = rig({ z: 0 } as Doc, ['z']);
    r.deps.slices = [r.slice, { ...other.slice, key: 'toolReference' }];
    return r;
  };

  it('says the worst of them: a document nobody can use before one that merely waits', async () => {
    const r = twoDocuments();
    r.pi.seed('settings', { ...DEFAULTS, places: 'moved' }, 2);
    await first(r);
    r.pi.seed('settings', { ...DEFAULTS, places: 'moved at the Pi' }, 3);
    r.pi.seed('toolReference', { z: 1, bad: true }, 1);
    r.state.safe = false;
    expect(await syncOnce(r.deps)).toBe('refused');
    r.pi.seed('toolReference', { z: 0 }, 2);
    expect(await syncOnce(r.deps)).toBe('deferred');
  });

  it('is no "ok" while the log of measurements did not come through – and ok when it did, or was not due', async () => {
    const r = rig();
    r.deps.afterRound = async () => false;
    expect(await syncNow(r.deps)).toBe('failed');
    expect(useStateSync.getState().state).toBe('failed');
    r.deps.afterRound = async () => true;
    expect(await syncNow(r.deps)).toBe('ok');
    r.deps.afterRound = async () => {};
    expect(await syncNow(r.deps)).toBe('ok');
    r.state.client = null;
    expect(await syncNow(r.deps)).toBe('off');
  });
});

describe('what a changed document is called when it is said', () => {
  it('the setting by its name, the other documents as a whole – never by an inner key like "list" or "z"', () => {
    expect(nameOf('settings', 'camera')).toBe('Kamera');
    expect(nameOf('settings', 'unheard-of')).toBe('unheard-of');
    expect(nameOf('macros', 'list')).toBe('Makros');
    expect(nameOf('toolReference', 'z')).toBe('Referenzwerkzeug');
    expect(nameOf('clamps', 'fixtures')).toBe('Spannmittel');
    expect(nameOf('profile', 'travel')).toBe('Maschinenwerte');
    expect(nameOf('learning', 'a|b')).toBe('Lernwerte');
    expect(nameOf('other', 'x')).toBe('other');
  });

  it('is said once however many keys of the document changed', async () => {
    const r = rig({ a: 1, b: 2 } as Doc);
    r.edit({ a: 5, b: 5 });
    r.deps.name = (slice, key) => nameOf(slice, key);
    r.slice.key = 'macros';
    r.pi.seed('macros', { a: 9, b: 9 });
    await syncOnce(r.deps);
    expect(r.said).toHaveLength(1);
    expect(r.said[0]![1].match(/Makros/g)).toHaveLength(1);
  });
});

describe('what a document of the Pi changed is announced where the slice asks for it', () => {
  it('tells what came in – and nothing when the device only sent its own change', async () => {
    const r = rig(DEFAULTS, FIXED);
    r.slice.announce = (before, after) => ({
      key: 'sync.macrosFromPi',
      params: { list: `${String(before.macros)}→${String(after.macros)}` },
    });
    await first(r);
    r.edit({ camera: 'mine' });
    await syncOnce(r.deps);
    expect(r.said).toEqual([]);
    r.pi.seed('settings', { ...(r.pi.data('settings') as Doc), macros: 'from the iPad' }, 5);
    await syncOnce(r.deps);
    expect(r.said).toHaveLength(1);
    expect(r.said[0]![0]).toBe('info');
    expect(r.said[0]![1]).toContain('default→from the iPad');
  });
});
