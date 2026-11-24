import { create } from 'zustand';
import { hasKey, t, type MessageKey } from '../i18n';
import { CompanionError, type StatePut, type StateSnapshot } from '../lib/companion';
import { holdCount } from '../lib/holds';
import { browserStorage, isFullDemo, loadJson, saveJson } from '../lib/persist';
import { insane, merge3, same, syncedSettings, withSynced, type Doc } from '../lib/stateSync';
import { isSimulatorAddress } from '../sim';
import { useMachine } from './machine';
import { jobUnderWay } from './underway';
import { companion, DEFAULT_SETTINGS, useWorkshop, validateSettings } from './workshop';

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
  | 'refused';

export interface Deps {
  client(): StateClient | null;
  slices: readonly Slice[];
  meta: MetaStore;
  /** The Pi's values may be taken only while nothing is moving and nothing is held */
  safeToApply(): boolean;
  /** A simulated machine is no machine: nothing is exchanged while it runs */
  simulator(): boolean;
  say(kind: 'info' | 'error', text: string, key: string): void;
  /** The name of a key of a document, as the operator knows it */
  name(slice: string, key: string): string;
}

const isDoc = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The most revisions a write is tried again from (another device writing just then): then it waits for the next round. */
const TRIES = 4;

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
    if (result !== 'ok' && outcome === 'ok') outcome = result;
  }
  return outcome;
}

async function syncSlice(
  deps: Deps,
  client: StateClient,
  slice: Slice,
  first: { rev: number; data: unknown } | undefined,
): Promise<SyncOutcome> {
  let remote = first;
  const refuse = (): SyncOutcome => {
    deps.say('error', t('sync.refused', { field: slice.key }), 'sync.refused');
    return 'refused';
  };
  if (remote !== undefined && !(isDoc(remote.data) && slice.accepts(remote.data))) return refuse();
  const known = deps.meta.get(slice.key);
  // Never synced here: the base is a fresh app's, and where both sides differ the Pi wins (it is the machine's)
  const base = known?.base ?? slice.defaults();
  const local = slice.read();
  if (known && remote && remote.rev === known.rev && same(local, base)) return 'ok';
  try {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      let merged: Doc;
      let replaced: string[] = [];
      if (remote === undefined) merged = local;
      else {
        ({ merged, replaced } = merge3(
          base,
          local,
          remote.data as Doc,
          known ? 'local' : 'remote',
        ));
      }
      const baseRev = remote?.rev ?? 0;
      // Nothing that cannot be a state of this app goes out, or in
      if (!slice.accepts(merged)) return refuse();
      const needsApply = !same(merged, local);
      if (needsApply && !deps.safeToApply()) {
        // Only what this device changed itself may go out meanwhile – and only if the Pi has not moved on
        if (remote !== undefined && known && remote.rev !== known.rev) return 'deferred';
        if (remote !== undefined && !known) return 'deferred';
      }
      let rev = baseRev;
      if (remote === undefined || !same(merged, remote.data)) {
        const put = await client.putState(slice.key, baseRev, merged);
        if (!put.ok) {
          // Another device wrote meanwhile: merge again from what it wrote
          remote = { rev: put.rev, data: put.data };
          if (!(isDoc(put.data) && slice.accepts(put.data))) return refuse();
          continue;
        }
        rev = put.rev;
      }
      if (needsApply) {
        if (!deps.safeToApply()) return 'deferred';
        slice.apply(merged);
      }
      deps.meta.set(slice.key, { rev, base: merged });
      if (replaced.length > 0) {
        const list = replaced.map((k) => deps.name(slice.key, k)).join(', ');
        deps.say(
          'error',
          t(known ? 'sync.replacedOther' : 'sync.replacedLocal', { list }),
          known ? 'sync.replacedOther' : 'sync.replacedLocal',
        );
      }
      return 'ok';
    }
    return 'deferred';
  } catch {
    return 'offline';
  }
}

// ---------------------------------------------------------------------------------------------
// The documents of the app

/** The settings that a document makes, laid over what this device keeps for itself – or null if it cannot be. */
function settingsFrom(doc: Doc) {
  // Only the keys that are settings of this app; the shapes are made by `validateSettings`
  const known = Object.fromEntries(
    Object.entries(doc).filter(([k]) => k in DEFAULT_SETTINGS),
  ) as Doc;
  const next = validateSettings(withSynced(useWorkshop.getState().settings, known));
  return next && insane(next) === null ? next : null;
}

const settingsSlice: Slice = {
  key: 'settings',
  read: () => syncedSettings(useWorkshop.getState().settings),
  defaults: () => syncedSettings(DEFAULT_SETTINGS),
  accepts: (doc) => settingsFrom(doc) !== null,
  apply(doc) {
    const next = settingsFrom(doc);
    if (next) useWorkshop.getState().adoptSettings(next);
  },
  subscribe: (listener) =>
    useWorkshop.subscribe((state, before) => {
      if (state.settings !== before.settings) listener();
    }),
};

export const SLICES: readonly Slice[] = [settingsSlice];

// ---------------------------------------------------------------------------------------------
// The engine

export type SyncState =
  | 'off'
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

const metaStore: MetaStore = {
  get(key) {
    const all = loadJson<Record<string, Meta>>(
      browserStorage,
      META_KEY,
      (v) => (isDoc(v) ? (v as Record<string, Meta>) : null),
      {},
    );
    const m = all[key];
    return m && Number.isSafeInteger(m.rev) && isDoc(m.base) ? m : undefined;
  },
  set(key, meta) {
    const all = loadJson<Record<string, Meta>>(
      browserStorage,
      META_KEY,
      (v) => (isDoc(v) ? (v as Record<string, Meta>) : null),
      {},
    );
    saveJson(browserStorage, META_KEY, { ...all, [key]: meta });
  },
};

const nameOf = (_slice: string, key: string) => {
  const text = `sync.keys.${key}`;
  return hasKey(text) ? t(text as MessageKey) : key;
};

/** The Pi's values are taken only while the machine stands: no job, no hold, nothing moving. */
export function safeToApply(): boolean {
  if (jobUnderWay() || holdCount() > 0) return false;
  const { connection, status } = useMachine.getState();
  return connection !== 'connected' || status === null || status.state === 'Idle';
}

const realDeps = (): Deps => ({
  client: () => companion(),
  slices: SLICES,
  meta: metaStore,
  safeToApply,
  simulator: () => {
    const { connection, url } = useMachine.getState();
    return connection !== 'disconnected' && isSimulatorAddress(url);
  },
  say: (kind, text, key) => useMachine.getState().addLog(kind, text, key),
  name: nameOf,
});

let running: Promise<void> | null = null;
let again = false;

/** One round now (or right after the one that runs); resolves when it is through. */
export function syncNow(deps: Deps = realDeps()): Promise<void> {
  if (isFullDemo()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  useStateSync.setState((s) => (s.state === 'ok' || s.state === 'off' ? { state: 'syncing' } : s));
  running = syncOnce(deps)
    .then((outcome) => {
      useStateSync.setState(
        outcome === 'ok'
          ? { state: 'ok', lastOkAt: Date.now() }
          : { state: outcome === 'off' ? 'off' : outcome },
      );
    })
    .catch(() => useStateSync.setState({ state: 'offline' }))
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
  // A simulator session changes settings that are no machine's (its camera, its places): when it ends
  // they are what they were before – what the Pi has (and this device had) stays what holds
  let before: Doc[] | null = null;
  let simulated = deps.simulator();
  const stopSim = useMachine.subscribe(() => {
    const now = deps.simulator();
    if (now === simulated) return;
    simulated = now;
    if (now) {
      before =
        deps.client() && deps.slices.some((s) => deps.meta.get(s.key))
          ? deps.slices.map((s) => s.read())
          : null;
      return;
    }
    if (before) {
      const kept = before;
      before = null;
      let changed = false;
      deps.slices.forEach((slice, i) => {
        if (!same(slice.read(), kept[i]) && slice.accepts(kept[i]!)) {
          slice.apply(kept[i]!);
          changed = true;
        }
      });
      if (changed) deps.say('info', t('sync.simulatorEnded'), 'sync.simulatorEnded');
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
