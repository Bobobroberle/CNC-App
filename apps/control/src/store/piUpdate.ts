import { create } from 'zustand';
import type { CompanionClient, StagedUpdate, UpdateStatus } from '../lib/companion';
import {
  updateErrorCode,
  waitForRestart,
  type RestartOptions,
  type RestartOutcome,
  type UpdateErrorCode,
} from '../lib/piUpdate';

/**
 * Updating the Pi from the app: upload the zip, look at what it is, put it in place (a hold), wait for the Pi to
 * come back, and say how it went – or go back to the version before. The Pi decides (login, checksum, a machine
 * that is not busy, a version that starts); this only asks and waits.
 *
 *   idle → uploading → staged → applying → restarting → done
 *   any step can end in failed; a wait that ends with the old version back is `failed` with `rolled-back`
 */
export type UpdatePhase =
  | 'idle'
  | 'uploading'
  | 'staged'
  | 'applying'
  | 'restarting'
  | 'done'
  | 'failed';

export interface UpdateFlow {
  phase: UpdatePhase;
  /** A zip that was uploaded and checked, waiting to be put in place */
  staged: StagedUpdate | null;
  /** Why the last step failed: the Pi's own code (or `network`), and what more it said */
  error: {
    code: UpdateErrorCode | 'rolled-back' | 'no-answer' | 'not-applied';
    detail: string | null;
    retryAfter?: number | null;
  } | null;
  /** What was done (`update`, `rollback`) and the build the Pi runs now, once it is back */
  kind: 'update' | 'rollback' | null;
  reached: number | null;
  /** Whether the Pi compared the file with a checksum when it was uploaded – what was sent then, not what is typed now */
  verified: boolean;
}

const IDLE: UpdateFlow = {
  phase: 'idle',
  staged: null,
  error: null,
  kind: null,
  reached: null,
  verified: false,
};

type Api = Pick<
  CompanionClient,
  'uploadUpdate' | 'applyUpdate' | 'rollbackUpdate' | 'discardUpdate' | 'health'
>;

/** The Pi refuses while a browser is on the machine through it: ours may still be leaving. */
const BUSY_TRIES = 4;

/** Refusals that leave the package where it is on the Pi: the operator can try again without choosing the file anew. */
const PACKAGE_KEPT: ReadonlySet<UpdateErrorCode> = new Set([
  'busy',
  'not-newer',
  'needs-setup',
  'backup-failed',
  'check-failed',
]);

/** How long to look for a Pi that may have restarted after a reply that never came (it restarts a moment after it answers). */
const MAYBE_MS = 60_000;

export interface FlowOptions extends RestartOptions {
  /** Waits between the tries of an update that the Pi refused as busy (our own connection was just closed) */
  busyWaitMs?: number;
}

export async function runUpload(
  api: Api,
  file: Blob,
  sha256: string | undefined,
  update: (state: UpdateFlow) => void,
): Promise<UpdateFlow> {
  const set = (patch: Partial<UpdateFlow>) => {
    const state = { ...IDLE, ...patch };
    update(state);
    return state;
  };
  set({ phase: 'uploading' });
  const sum = sha256?.trim() || undefined;
  try {
    return set({
      phase: 'staged',
      staged: await api.uploadUpdate(file, sum),
      verified: sum !== undefined,
    });
  } catch (error) {
    return set({ phase: 'failed', error: updateErrorCode(error) });
  }
}

/** Puts the staged version in place and waits for the Pi to run it. */
export async function runApply(
  api: Api,
  staged: StagedUpdate,
  allowOlder: boolean,
  update: (state: UpdateFlow) => void,
  options: FlowOptions = {},
  verified = false,
): Promise<UpdateFlow> {
  const base = { staged, kind: 'update' as const, verified };
  const set = (patch: Partial<UpdateFlow>) => {
    const state = { ...IDLE, ...base, ...patch };
    update(state);
    return state;
  };
  set({ phase: 'applying' });
  for (let attempt = 1; ; attempt++) {
    try {
      await api.applyUpdate(staged.id, allowOlder);
      break;
    } catch (error) {
      const failure = updateErrorCode(error);
      // Our own connection to the machine was closed a moment ago; the Pi may not have noticed yet
      if (
        failure.code === 'busy' &&
        failure.detail === 'machine-connected' &&
        attempt < BUSY_TRIES
      ) {
        await (options.sleep ?? ((ms) => new Promise<void>((done) => setTimeout(done, ms))))(
          options.busyWaitMs ?? 1500,
        );
        continue;
      }
      // The reply was lost, not the request, perhaps: the Pi may have swapped and be restarting. Look for it.
      if (failure.code === 'network') {
        return waited(api, staged.release.build, 'update', base, update, {
          timeoutMs: MAYBE_MS,
          ...options,
        });
      }
      // The package is still on the Pi after most refusals: stay at the hold, with the reason beside it
      return set(
        PACKAGE_KEPT.has(failure.code)
          ? { phase: 'staged', error: failure }
          : { phase: 'failed', error: failure },
      );
    }
  }
  return waited(api, staged.release.build, 'update', base, update, options);
}

/** Goes back to the version before and waits for the Pi to run it. */
export async function runRollback(
  api: Api,
  status: UpdateStatus,
  update: (state: UpdateFlow) => void,
  options: FlowOptions = {},
): Promise<UpdateFlow> {
  const set = (patch: Partial<UpdateFlow>) => {
    const state = { ...IDLE, kind: 'rollback' as const, ...patch };
    update(state);
    return state;
  };
  if (!status.previous)
    return set({ phase: 'failed', error: { code: 'no-previous', detail: null } });
  set({ phase: 'applying' });
  for (let attempt = 1; ; attempt++) {
    try {
      await api.rollbackUpdate();
      break;
    } catch (error) {
      const failure = updateErrorCode(error);
      if (
        failure.code === 'busy' &&
        failure.detail === 'machine-connected' &&
        attempt < BUSY_TRIES
      ) {
        await (options.sleep ?? ((ms) => new Promise<void>((done) => setTimeout(done, ms))))(
          options.busyWaitMs ?? 1500,
        );
        continue;
      }
      if (failure.code === 'network') {
        return waited(
          api,
          status.previous.build,
          'rollback',
          { staged: null, kind: 'rollback' },
          update,
          { timeoutMs: MAYBE_MS, ...options },
        );
      }
      return set({ phase: 'failed', error: failure });
    }
  }
  return waited(
    api,
    status.previous.build,
    'rollback',
    { staged: null, kind: 'rollback' },
    update,
    options,
  );
}

async function waited(
  api: Api,
  expect: number,
  kind: 'update' | 'rollback',
  base: Partial<UpdateFlow>,
  update: (state: UpdateFlow) => void,
  options: FlowOptions,
): Promise<UpdateFlow> {
  const set = (patch: Partial<UpdateFlow>) => {
    const state = { ...IDLE, ...base, kind, ...patch };
    update(state);
    return state;
  };
  set({ phase: 'restarting' });
  const outcome: RestartOutcome = await waitForRestart(api, expect, options);
  if (outcome.result === 'done') return set({ phase: 'done', reached: outcome.build });
  if (outcome.result === 'rolled-back') {
    return set({
      phase: 'failed',
      reached: outcome.build,
      error: { code: 'rolled-back', detail: null },
    });
  }
  // It answered all the time and never restarted: the step did not get to it
  if (outcome.result === 'unchanged') {
    return set({ phase: 'failed', error: { code: 'not-applied', detail: null } });
  }
  return set({ phase: 'failed', error: { code: 'no-answer', detail: null } });
}

interface UpdateStore extends UpdateFlow {
  upload(api: Api, file: Blob, sha256?: string): Promise<void>;
  apply(api: Api, allowOlder: boolean, options?: FlowOptions): Promise<void>;
  rollback(api: Api, status: UpdateStatus, options?: FlowOptions): Promise<void>;
  discard(api: Pick<CompanionClient, 'discardUpdate'>): Promise<void>;
  reset(): void;
}

export const useUpdate = create<UpdateStore>((set, get) => ({
  ...IDLE,
  async upload(api, file, sha256) {
    if (get().phase === 'uploading' || get().phase === 'applying' || get().phase === 'restarting')
      return;
    await runUpload(api, file, sha256, set);
  },
  async apply(api, allowOlder, options) {
    const { staged, phase } = get();
    if (!staged || phase !== 'staged') return;
    await runApply(api, staged, allowOlder, set, options, get().verified);
  },
  async rollback(api, status, options) {
    const { phase } = get();
    if (phase === 'applying' || phase === 'restarting' || phase === 'uploading') return;
    await runRollback(api, status, set, options);
  },
  async discard(api) {
    set(IDLE);
    await api.discardUpdate().catch(() => {});
  },
  reset() {
    set(IDLE);
  },
}));
