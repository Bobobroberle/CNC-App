import { create } from 'zustand';
import type { CompanionClient } from '../lib/companion';

/**
 * Powering the companion's host (the Pi) down from the app, with feedback:
 * the app asks, then polls the health check until the companion stops
 * answering, then waits until the Pi has finished writing to its SD card.
 *
 *   requesting → stopping (still answering) → settling (countdown) → done
 *   any step can end in failed
 */
export type ShutdownPhase = 'idle' | 'requesting' | 'stopping' | 'settling' | 'done' | 'failed';

/**
 * not-supported: the companion has no power-off (old version or LOWRIDER_SHUTDOWN=0);
 * request: the request did not get through; host: the Pi refused (sudoers rule missing);
 * still-running: the companion was still answering when the wait ran out.
 */
export type ShutdownFailure = 'not-supported' | 'request' | 'host' | 'still-running';

export interface ShutdownState {
  phase: ShutdownPhase;
  failure: ShutdownFailure | null;
  /** Message from the Pi for `host` */
  detail: string | null;
  /** Seconds left while settling */
  remaining: number;
}

export interface ShutdownOptions {
  /** Poll interval of the health check */
  pollMs?: number;
  /** Health checks that time out after this are counted as missed */
  healthTimeoutMs?: number;
  /** Missed health checks in a row that count as "companion stopped" */
  misses?: number;
  /** Seconds after the companion stopped until the Pi is safe to unplug */
  settleSeconds?: number;
  /** Give up when the companion still answers after this */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const IDLE: ShutdownState = { phase: 'idle', failure: null, detail: null, remaining: 0 };

/**
 * Systemd stops the companion early in the power-off; the Pi then unmounts and
 * halts within a few seconds (the green LED flashes, then stays off).
 */
export const SETTLE_SECONDS = 15;

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runShutdown(
  client: Pick<CompanionClient, 'health' | 'shutdown'>,
  update: (state: ShutdownState) => void,
  options: ShutdownOptions = {},
): Promise<ShutdownState> {
  const {
    pollMs = 1000,
    healthTimeoutMs = 1500,
    misses: needed = 2,
    settleSeconds = SETTLE_SECONDS,
    timeoutMs = 60_000,
    sleep = realSleep,
  } = options;
  const set = (patch: Partial<ShutdownState>) => {
    const state = { ...IDLE, ...patch };
    update(state);
    return state;
  };

  set({ phase: 'requesting' });
  try {
    await client.shutdown();
  } catch (e) {
    return set({
      phase: 'failed',
      failure: (e as Error).message === 'HTTP 501' ? 'not-supported' : 'request',
    });
  }

  set({ phase: 'stopping' });
  let missed = 0;
  for (let waited = 0; missed < needed; ) {
    if (waited >= timeoutMs) return set({ phase: 'failed', failure: 'still-running' });
    await sleep(pollMs);
    waited += pollMs;
    try {
      const health = await client.health(healthTimeoutMs);
      missed = 0;
      if (health.shutdownError)
        return set({ phase: 'failed', failure: 'host', detail: health.shutdownError });
    } catch {
      missed++;
    }
  }

  for (let remaining = settleSeconds; remaining > 0; remaining--) {
    set({ phase: 'settling', remaining });
    await sleep(1000);
  }
  return set({ phase: 'done' });
}

interface ShutdownStore extends ShutdownState {
  start(client: Pick<CompanionClient, 'health' | 'shutdown'>, options?: ShutdownOptions): void;
  reset(): void;
}

export const useShutdown = create<ShutdownStore>((set, get) => ({
  ...IDLE,
  start(client, options) {
    const { phase } = get();
    if (phase !== 'idle' && phase !== 'failed') return;
    void runShutdown(client, set, options);
  },
  reset() {
    set(IDLE);
  },
}));
