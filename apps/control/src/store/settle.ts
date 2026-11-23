import type { MachineStatus } from '@lowrider/fluidnc-client';
import { useMachine } from './machine';

/** A reported position counts as the target within this, mm (reports have three decimals) */
const ON_TARGET = 0.02;

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Waits for a status report that arrives after this call and says the
 * machine stands still – with `at`, on that machine position. The report in
 * the store may be older than the move that has just ended (reports come
 * every 200 ms): whatever reads the position or takes a picture right after
 * a move starts from this one instead. Null when no such report comes in time.
 */
export function settled(
  at: { x?: number; y?: number; z?: number } = {},
  timeoutMs = 5000,
): Promise<MachineStatus | null> {
  const onTarget = (s: MachineStatus) =>
    (['x', 'y', 'z'] as const).every((axis, i) => {
      const want = at[axis];
      return want === undefined || Math.abs((s.mpos[i] ?? 0) - want) < ON_TARGET;
    });
  return new Promise((resolve) => {
    const done = (status: MachineStatus | null) => {
      clearTimeout(timer);
      off();
      resolve(status);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const off = useMachine.subscribe((s, prev) => {
      // Only a report that came in since: a new object in the store.
      if (!s.status || s.status === prev.status) return;
      if (s.status.state === 'Idle' && onTarget(s.status)) done(s.status);
    });
  });
}
