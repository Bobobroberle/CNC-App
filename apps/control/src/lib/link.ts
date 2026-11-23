/**
 * The way to the machine and why it failed (DESIGN.md §6.2, §6.3). Pure:
 * what an address is (straight to FluidNC or through the companion's relay),
 * which device was missing when a connection failed, and when to try again.
 * The store that connects is `store/machine.ts`.
 *
 * Coming back by itself is allowed only while no job runs and never after a
 * connection was lost during a job (CLAUDE.md: the app never reconnects by
 * itself during a job). A reconnect only asks (`?`, `$I`, `$G`, `$#`); it
 * sends nothing that moves the machine or changes its state.
 */

/**
 * Which device was missing:
 * - `pi`: the browser does not reach the companion (Raspberry Pi);
 * - `relay`: the Pi answers but does not reach FluidNC (the Jackpot);
 * - `direct`: FluidNC does not answer at the address typed in.
 */
export type LinkFailure = 'pi' | 'relay' | 'direct';

/** What a failed attempt tells (the library's `ConnectError` or `CloseInfo`). */
export interface FailedAttempt {
  /** `unreachable`: never opened; `closed`: opened and closed; `silent`: opened, nothing answered */
  kind: 'unreachable' | 'closed' | 'silent';
  code?: number;
  reason?: string;
}

/** The companion's relay path: `ws://pi:8080/fluidnc`. */
export function isRelayUrl(url: string): boolean {
  return /^wss?:\/\/[^/]+\/fluidnc\/?$/i.test(url.trim());
}

/** `ws://192.168.0.200:81/` → `192.168.0.200:81` (what the operator recognises). */
export function hostOf(url: string): string {
  return url.replace(/^\w+:\/\//, '').replace(/\/.*$/, '');
}

/** The address the relay tried, from its close reason (`FluidNC unreachable: ws://…`). */
export function relayTarget(reason: string | undefined): string | null {
  const m = /^FluidNC (?:unreachable|disconnected): (\S+)/.exec(reason ?? '');
  return m ? hostOf(m[1]!) : null;
}

/** The relay's close code when FluidNC cannot be reached or goes away. */
export const RELAY_CLOSE_CODE = 1011;

export function classifyFailure(attempt: FailedAttempt, relay: boolean): LinkFailure {
  if (!relay) return 'direct';
  if (attempt.kind === 'unreachable') return 'pi';
  // The Pi took the connection: it answered with FluidNC's absence, or FluidNC stayed silent.
  if (attempt.kind === 'silent') return 'relay';
  if (attempt.code === RELAY_CLOSE_CODE || /^FluidNC/.test(attempt.reason ?? '')) return 'relay';
  return 'pi';
}

/** Waiting times between attempts: 2 s, 4 s, 8 s, 16 s, then every 30 s. */
export const RETRY_FIRST_MS = 2000;
export const RETRY_MAX_MS = 30_000;

export function retryDelay(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** Math.max(0, attempt));
}

/** What decides whether the app may try again by itself. */
export interface RetryContext {
  /** The operator has switched coming back by itself off ("Aufhören") */
  autoRetry: boolean;
  /** A job runs (SD file or stream) */
  jobRunning: boolean;
  /** The connection was lost during a job and the operator has not connected by hand since */
  lostDuringJob: boolean;
  /** The simulator lives in the page and never fails */
  simulator: boolean;
}

export function mayRetry(c: RetryContext): boolean {
  return c.autoRetry && !c.jobRunning && !c.lostDuringJob && !c.simulator;
}

/** Whole seconds until a retry, never below 0, for "neuer Versuch in 10 s". */
export function secondsUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 1000));
}
