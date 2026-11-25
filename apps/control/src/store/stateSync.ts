import { create } from 'zustand';
import { hasKey, t, type MessageKey } from '../i18n';
import { CompanionError, type StatePut, type StateSnapshot } from '../lib/companion';
import { holdCount } from '../lib/holds';
import { browserStorage, isFullDemo, loadJson, saveJson } from '../lib/persist';
import { merge3, same, split, type Doc } from '../lib/stateSync';
import { useCalibration } from './calibration';
import { useMachine } from './machine';
import { jobUnderWay } from './underway';
import { syncMeasurementsDue } from './measurements';
import { simulatorActive } from './simulated';
import { SLICES } from './stateSlices';
import { companion, useWorkshop } from './workshop';

/**
 * The state of the machine on the Pi: settings, calibration, places … kept in the browser as before
 * and – while a companion answers – in one document per key on the Pi, so that every device finds the
 * same. Each key is merged three ways (what both had at the last sync · what this device has now ·
 * what the Pi has now): what only one side changed goes to the other, what both changed is decided
 * by the rule of the case. The Pi counts a revision and refuses a write made from an old one.
 */

/** One document: how it is read from the app, put into it, and watched for changes. */
export interface Slice {
  key: string;
  /** The synced part of what the app has now */
  read(): Doc;
  /** What a fresh app has: the base of a device that never synced */
  defaults(): Doc;
  /** Whether a document can be a state of this app at all (what the Pi sends is not trusted) */
  accepts(doc: Doc): boolean;
  /** Takes a document that `accepts` into the app */
  apply(doc: Doc): void;
  /**
   * The top-level keys a document of this kind always has. Of a Pi document only these are looked at; any
   * other key (a newer app wrote it) is carried along untouched, and a key the Pi's copy lacks counts as
   * unchanged. Without: every key is data.
   */
  keys?: readonly string[];
  /**
   * A document of an older app as this app reads it (pure, and the same again for what it already made): the
   * base and the Pi's copy go through it *before* they are merged with this device's state – which has been
   * read through the same rule when it was loaded. Without it a change that only this app's reading made (a
   * switch that is off for a state from before a setting existed) would count as this device's edit and
   * override what another device set on the Pi meanwhile.
   */
  upgrade?(doc: Doc): Doc;
  /** How the state from before a simulator session is put back (default: `apply`) */
  restore?(doc: Doc): void;
  /** What the operator is told when a document of the Pi changed this device (null: nothing to tell) */
  announce?(before: Doc, after: Doc): { key: MessageKey; params: Record<string, string> } | null;
  subscribe(listener: () => void): () => void;
}

export interface Meta {
  rev: number;
  base: Doc;
}
export interface MetaStore {
  get(key: string): Meta | undefined;
  set(key: string, meta: Meta): void;
}

export interface StateClient {
  state(): Promise<StateSnapshot>;
  putState(key: string, baseRev: number, data: object): Promise<StatePut>;
}

export type SyncOutcome =
  | 'off'
  | 'paused'
  | 'unsupported'
  | 'offline'
  | 'ok'
  | 'deferred'
  | 'refused'
  /** The Pi answered, but with an error – or a document could not be taken in */
  | 'failed';

export interface Deps {
  client(): StateClient | null;
  slices: readonly Slice[];
  meta: MetaStore;
  /** The Pi's values may be taken only while nothing is moving and nothing is held */
  safeToApply(): boolean;
  /** A simulated machine is no machine: nothing is exchanged while it runs */
  simulator(): boolean;
  say(kind: 'info' | 'error', text: string, key: string): void;
  /** What else is exchanged while the Pi answers (the log of measurements) */
  afterRound?(): Promise<boolean | void>;
  /** The name of a key of a document, as the operator knows it */
  name(slice: string, key: string): string;
  /** What this device had when a simulator session began (kept beyond a reload: the session ends with the page) */
  keep?: {
    load(): Record<string, Doc> | null;
    save(snapshot: Record<string, Doc> | null): void;
  };
}

const isDoc = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The most revisions a write is tried again from (another device writing just then): then it waits for the next round. */
const TRIES = 4;

/** Refusals that were already said (a document that stays refused is said once, not every round). */
const refusals = new WeakMap<Deps, Set<string>>();

/**
 * One round: for every document, bring this device and the Pi together. Writes only what changed, only from
 * the revision that was read; takes the Pi's values only where it is safe (never under a job or a hold).
 */
export async function syncOnce(deps: Deps): Promise<SyncOutcome> {
  const client = deps.client();
  if (!client) return 'off';
  if (deps.simulator()) return 'paused';
  let snapshot: StateSnapshot;
  try {
    snapshot = await client.state();
  } catch (error) {
    return error instanceof CompanionError && error.status === 404 ? 'unsupported' : 'offline';
  }
  let outcome: SyncOutcome = 'ok';
  for (const slice of deps.slices) {
    const result = await syncSlice(deps, client, slice, snapshot.keys[slice.key]);
    if (result === 'offline') return 'offline';
    // What matters most is said: a document nobody can use before one that merely waits
    if (WORSE.indexOf(result) < WORSE.indexOf(outcome)) outcome = result;
  }
  return outcome;
}

/** A Pi document with the keys it lacks filled in at the defaults of the app (for comparing, never for writing). */
function completed(slice: Slice, doc: Doc): Doc {
  if (!slice.keys) return doc;
  const defaults = slice.defaults();
  const missing = slice.keys.filter((k) => !Object.hasOwn(doc, k) && defaults[k] !== undefined);
  return { ...Object.fromEntries(missing.map((k) => [k, defaults[k]])), ...doc };
}

/** From the worst to the best what a round can end with, among the documents that were looked at. */
const WORSE: readonly SyncOutcome[] = ['refused', 'failed', 'deferred', 'ok'];

async function syncSlice(
  deps: Deps,
  client: StateClient,
  slice: Slice,
  first: { rev: number; data: unknown } | undefined,
): Promise<SyncOutcome> {
  let remote = first;
  const refuse = (rev: number | undefined): SyncOutcome => {
    // Said once for a document as it stands on the Pi, not at every round
    const seen = refusals.get(deps) ?? new Set<string>();
    refusals.set(deps, seen);
    const mark = `${slice.key}@${rev ?? 'local'}`;
    if (!seen.has(mark)) {
      seen.add(mark);
      deps.say('error', t('sync.refused', { field: slice.key }), 'sync.refused');
    }
    return 'refused';
  };
  const acceptable = (r: { data: unknown }) => isDoc(r.data) && slice.accepts(r.data);
  if (remote !== undefined && !acceptable(remote)) return refuse(remote.rev);
  const known = deps.meta.get(slice.key);
  const up = (doc: Doc): Doc => slice.upgrade?.(doc) ?? doc;
  // Never synced here: the base is a fresh app's, and where both sides differ the Pi wins (it is the machine's)
  const stored = known?.base ?? slice.defaults();
  const base = up(stored);
  const local = slice.read();
  // What the Pi has is compared by what it says, not by its revision: a Pi restored from a backup counts
  // revisions again, and the same number may stand for another state
  if (
    known &&
    remote &&
    same(split(remote.data as Doc, slice.keys).own, stored) &&
    same(local, stored)
  ) {
    return 'ok';
  }
  // Nothing set here, nothing on the Pi: there is nothing to say yet (the defaults are not a state)
  if (!known && remote === undefined && same(local, stored)) return 'ok';
  try {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      let merged: Doc;
      let extra: Doc = {};
      let replaced: string[] = [];
      if (remote === undefined) merged = local;
      else {
        const theirs = split(remote.data as Doc, slice.keys);
        extra = theirs.extra;
        ({ merged, replaced } = merge3(
          base,
          local,
          up(theirs.own),
          known ? 'local' : 'remote',
          slice.keys,
        ));
      }
      const baseRev = remote?.rev ?? 0;
      // Nothing that cannot be a state of this app goes out, or in
      if (!slice.accepts({ ...extra, ...merged })) return refuse(remote?.rev);
      const needsApply = !same(merged, local);
      // The Pi's values wait for the machine to stand. (If nothing of the Pi's is needed, what this device
      // changed may go out meanwhile.)
      if (needsApply && !deps.safeToApply()) return 'deferred';
      // The document as the Pi gets it: this app's keys, and the ones it does not know as they were
      const written = { ...extra, ...merged };
      let rev = baseRev;
      // A document that lacks keys this device has at their defaults needs no write for them: the Pi's copy is
      // the same state, only shorter (an older app wrote it). A key that is not at its defaults is written.
      if (remote === undefined || !same(written, completed(slice, remote.data as Doc))) {
        const put = await client.putState(slice.key, baseRev, written);
        if (!put.ok) {
          // Another device wrote meanwhile: merge again from what it wrote
          remote = { rev: put.rev, data: put.data };
          if (!acceptable(remote)) return refuse(put.rev);
          continue;
        }
        rev = put.rev;
      }
      if (needsApply) {
        // The operator may have changed something while the Pi was written: that must not be overwritten by
        // a state computed before. The Pi has what it needs; the next round merges from it.
        if (!same(slice.read(), local)) return 'deferred';
        if (!deps.safeToApply()) return 'deferred';
        try {
          slice.apply(merged);
        } catch {
          // Whatever went wrong half-way: this device goes back to what it had, and nothing is recorded as synced
          try {
            slice.apply(local);
          } catch {
            // nothing more to do
          }
          deps.say('error', t('sync.applyFailed', { field: slice.key }), 'sync.applyFailed');
          return 'failed';
        }
      }
      deps.meta.set(slice.key, { rev, base: merged });
      const note = needsApply ? slice.announce?.(local, merged) : null;
      if (note) deps.say('info', t(note.key, note.params), note.key);
      if (needsApply && known && remote !== undefined && remote.rev < known.rev) {
        // The Pi's revision went back: it was restored from a backup, or its card replaced
        const list = [
          ...new Set(
            Object.keys(merged)
              .filter((k) => !same(merged[k], local[k]))
              .map((k) => deps.name(slice.key, k)),
          ),
        ].join(', ');
        deps.say('info', t('sync.rewound', { list }), 'sync.rewound');
      }
      if (replaced.length > 0) {
        const list = [...new Set(replaced.map((k) => deps.name(slice.key, k)))].join(', ');
        deps.say(
          'error',
          t(known ? 'sync.replacedOther' : 'sync.replacedLocal', { list }),
          known ? 'sync.replacedOther' : 'sync.replacedLocal',
        );
      }
      return 'ok';
    }
    return 'deferred';
  } catch (error) {
    // The Pi answering with an error is no Pi that does not answer
    return error instanceof CompanionError ? 'failed' : 'offline';
  }
}

/**
 * The way out of a document the Pi holds and this app cannot use: it is replaced by this device's state.
 * Only where the Pi's document is refused (a better one is never replaced) and this device's own is fine.
 */
export async function overwritePi(deps: Deps): Promise<string[]> {
  const client = deps.client();
  if (!client || deps.simulator()) return [];
  const snapshot = await client.state();
  const done: string[] = [];
  for (const slice of deps.slices) {
    const remote = snapshot.keys[slice.key];
    if (remote === undefined || (isDoc(remote.data) && slice.accepts(remote.data))) continue;
    const local = slice.read();
    if (!slice.accepts(local)) continue;
    const put = await client.putState(slice.key, remote.rev, local);
    if (!put.ok) continue;
    deps.meta.set(slice.key, { rev: put.rev, base: local });
    done.push(slice.key);
  }
  if (done.length > 0) {
    deps.say('info', t('sync.overwritten', { list: done.join(', ') }), 'sync.overwritten');
  }
  return done;
}

// ---------------------------------------------------------------------------------------------
// The documents of the app

export { SLICES } from './stateSlices';

// ---------------------------------------------------------------------------------------------
// The engine

export type SyncState =
  | 'off'
  | 'failed'
  | 'syncing'
  | 'ok'
  | 'offline'
  | 'unsupported'
  | 'paused'
  | 'deferred'
  | 'refused';

interface SyncStore {
  state: SyncState;
  /** When the last round that came through ended */
  lastOkAt: number | null;
}

export const useStateSync = create<SyncStore>(() => ({ state: 'off', lastOkAt: null }));

const META_KEY = 'lowrider-control.sync';

type Storage_ = Parameters<typeof loadJson>[0] & Parameters<typeof saveJson>[0];

/**
 * What this device knows of each document (the revision and what both had), kept in the browser and – per
 * window – in memory too: a window works from what it knows itself, so two windows of one browser each
 * follow the Pi instead of passing the same note back and forth, and a browser that cannot store anything
 * still remembers until the page is closed.
 */
export function createMetaStore(storage: Storage_): MetaStore {
  const all = () =>
    loadJson<Record<string, Meta>>(
      storage,
      META_KEY,
      (v) => (isDoc(v) ? (v as Record<string, Meta>) : null),
      {},
    );
  const memory = new Map<string, Meta | undefined>();
  return {
    get(key) {
      if (!memory.has(key)) {
        const m = all()[key];
        memory.set(key, m && Number.isSafeInteger(m.rev) && isDoc(m.base) ? m : undefined);
      }
      return memory.get(key);
    },
    set(key, meta) {
      memory.set(key, meta);
      saveJson(storage, META_KEY, { ...all(), [key]: meta });
    },
  };
}

const metaStore = createMetaStore(browserStorage);

const SIMULATOR_KEY = 'lowrider-control.sync.simulator';

/** The state from before a simulator session, kept beyond a reload (the session ends with the page). */
export function createKeep(storage: Storage_): NonNullable<Deps['keep']> {
  return {
    load: () =>
      loadJson<Record<string, Doc> | null>(
        storage,
        SIMULATOR_KEY,
        (v) => (isDoc(v) ? (v as Record<string, Doc>) : null),
        null,
      ),
    save: (snapshot) => saveJson(storage, SIMULATOR_KEY, snapshot),
  };
}

/** What the operator calls the part of a document that changed: the setting, or the document as a whole. */
export const nameOf = (slice: string, key: string) => {
  // The settings are named by what changed in them; the other documents as a whole (their keys are inner names)
  if (slice !== 'settings') {
    const whole = `sync.slices.${slice}`;
    return hasKey(whole) ? t(whole as MessageKey) : slice;
  }
  const text = `sync.keys.${key}`;
  return hasKey(text) ? t(text as MessageKey) : key;
};

/** The Pi's values are taken only while the machine stands: no job, no hold, nothing moving. */
export function safeToApply(): boolean {
  // A measuring run (the grid, the tilt …) moves the machine by itself and reads the camera settings as it goes
  if (jobUnderWay() || holdCount() > 0 || useCalibration.getState().task !== null) return false;
  const { connection, status } = useMachine.getState();
  return connection !== 'connected' || status === null || status.state === 'Idle';
}

const realDeps = (): Deps => ({
  client: () => companion(),
  slices: SLICES,
  meta: metaStore,
  safeToApply,
  simulator: simulatorActive,
  afterRound: async () => {
    const c = companion();
    return c ? (await syncMeasurementsDue(c)) !== 'failed' : true;
  },
  say: (kind, text, key) => useMachine.getState().addLog(kind, text, key),
  name: nameOf,
  keep: createKeep(browserStorage),
});

/** The repair from the card: see `overwritePi`. */
export async function overwritePiNow(deps: Deps = realDeps()): Promise<boolean> {
  try {
    const done = await overwritePi(deps);
    await syncNow(deps);
    return done.length > 0;
  } catch {
    return false;
  }
}

let running: Promise<SyncState> | null = null;
let again = false;

/** One round now (or right after the one that runs); resolves with how it ended when it is through. */
export function syncNow(deps: Deps = realDeps()): Promise<SyncState> {
  if (isFullDemo()) return Promise.resolve('off');
  if (running) {
    again = true;
    return running;
  }
  useStateSync.setState((s) => (s.state === 'ok' || s.state === 'off' ? { state: 'syncing' } : s));
  running = syncOnce(deps)
    .then(async (outcome): Promise<SyncState> => {
      // The Pi answered: the log of measurements goes with the state – and a log that did not come through is no 'ok'
      let state: SyncState = outcome;
      if (
        outcome !== 'off' &&
        outcome !== 'paused' &&
        outcome !== 'unsupported' &&
        outcome !== 'offline'
      ) {
        const logOk = await deps.afterRound?.();
        if (outcome === 'ok' && logOk === false) state = 'failed';
      }
      useStateSync.setState(state === 'ok' ? { state: 'ok', lastOkAt: Date.now() } : { state });
      return state;
    })
    .catch((): SyncState => {
      useStateSync.setState({ state: 'offline' });
      return 'offline';
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void syncNow(deps);
      }
    });
  return running;
}

/** Starts the exchange: when the app starts, when something changes, when the page comes back, every 30 s. */
export function startStateSync(every = 30_000, deps: Deps = realDeps()): () => void {
  if (isFullDemo()) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(deps), ms);
  };
  const stops = deps.slices.map((slice) =>
    slice.subscribe(() => {
      const known = deps.meta.get(slice.key);
      // Nothing to send when it is what both had at the last sync (also what an apply just made)
      if (!known || !same(slice.read(), known.base)) soon(800);
    }),
  );
  const interval = setInterval(() => void syncNow(deps), every);
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') soon(300);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  // The companion answers (it may boot after the app): talk to it at once
  const stopOnline = useWorkshop.subscribe((state, before) => {
    if (state.companionOnline === true && before.companionOnline !== true) soon(300);
  });
  // A simulator session changes settings that are no machine's (its camera, its places, its profile): when
  // it ends they are what they were before – what the Pi has (and this device had) stays what holds. The
  // state from before is kept beyond a reload: closing the page ends the session too.
  const putBack = (kept: Record<string, Doc>) => {
    let changed = false;
    for (const slice of deps.slices) {
      const doc = kept[slice.key];
      if (doc === undefined || same(slice.read(), doc) || !slice.accepts(doc)) continue;
      try {
        (slice.restore ?? slice.apply)(doc);
        changed = true;
      } catch {
        // a state that cannot be put back stays as it is
      }
    }
    if (changed) deps.say('info', t('sync.simulatorEnded'), 'sync.simulatorEnded');
  };
  const pending = deps.keep?.load();
  if (pending && !deps.simulator()) {
    deps.keep?.save(null);
    putBack(pending);
  }
  let simulated = deps.simulator();
  const stopSim = useMachine.subscribe(() => {
    const now = deps.simulator();
    if (now === simulated) return;
    simulated = now;
    if (now) {
      // Only where there is a Pi whose state this could reach (without one, the simulator's settings stay as before)
      if (deps.client()) {
        deps.keep?.save(Object.fromEntries(deps.slices.map((s) => [s.key, s.read()])));
      }
      return;
    }
    const kept = deps.keep?.load();
    if (kept) {
      deps.keep?.save(null);
      putBack(kept);
    }
    soon(300);
  });
  soon(1500);
  return () => {
    if (timer) clearTimeout(timer);
    stopSim();
    clearInterval(interval);
    stops.forEach((stop) => stop());
    stopOnline();
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisible);
  };
}
