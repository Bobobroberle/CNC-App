import type { CompanionClient, CompanionError } from './companion';

/**
 * The update of the Pi from the app, as far as it is no screen and no store: what a machine state means for
 * it, what a refusal of the Pi is called, what a device is called, and the wait for the Pi to come back.
 */

/** Machine states in which the Pi must stay up (motion through the relay, job watch) – also for the update. */
export const BUSY_STATES: ReadonlySet<string> = new Set(['Run', 'Hold', 'Jog', 'Home']);

/**
 * What kind of device this is, from what the browser says about itself. Proper names (iPad …) come back as they are;
 * the others are the dictionary's (`access.device.<kind>`) – the caller turns them into a name the operator may change.
 */
export type DeviceKind =
  | 'iPad'
  | 'iPhone'
  | 'Mac'
  | 'Chromebook'
  | 'androidPhone'
  | 'androidTablet'
  | 'windows'
  | 'linux'
  | 'other';

export function deviceKind(userAgent: string, maxTouchPoints = 0): DeviceKind {
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone|iPod/i.test(userAgent)) return 'iPhone';
  // An iPad that says it is a Mac: a Mac with a touch screen is none
  if (/Macintosh/i.test(userAgent)) return maxTouchPoints > 1 ? 'iPad' : 'Mac';
  if (/Android/i.test(userAgent))
    return /Mobile/i.test(userAgent) ? 'androidPhone' : 'androidTablet';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/CrOS/i.test(userAgent)) return 'Chromebook';
  if (/Linux/i.test(userAgent)) return 'linux';
  return 'other';
}

/** The time of a build (seconds since 1970) as the operator reads it. */
export function formatBuild(build: number, locale: string): string {
  return new Date(build * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/** How a refusal of the Pi is named in the dictionary (`update.errors.<code>`), by its error code. */
export const UPDATE_ERROR_CODES = [
  'unauthorized',
  'not-enabled',
  'bad-zip',
  'bad-release',
  'checksum-mismatch',
  'no-staged',
  'not-newer',
  'needs-setup',
  'busy',
  'backup-failed',
  'check-failed',
  'no-previous',
  'failed',
  'expected-zip',
  'too-large',
  'network',
  'other',
] as const;
export type UpdateErrorCode = (typeof UPDATE_ERROR_CODES)[number];

/** The error code of something that went wrong: the Pi's own, or `network`/`other` where it said nothing. */
export function updateErrorCode(error: unknown): { code: UpdateErrorCode; detail: string | null } {
  const e = error as Partial<CompanionError> | null;
  if (e && typeof e.status === 'number') {
    if (e.status === 401) return { code: 'unauthorized', detail: null };
    if (e.status === 413) return { code: 'too-large', detail: null };
    if (e.status === 415) return { code: 'expected-zip', detail: null };
    const code = (UPDATE_ERROR_CODES as readonly string[]).includes(e.code ?? '')
      ? (e.code as UpdateErrorCode)
      : 'other';
    return { code, detail: e.detail ?? null };
  }
  // fetch itself failed: the Pi is not there, the connection broke, the upload timed out
  return { code: 'network', detail: null };
}

export type RestartOutcome =
  /** The Pi is back and runs the build that was asked for */
  | { result: 'done'; build: number }
  /** It answered all the time, with another build, and never went away: the step did not reach it */
  | { result: 'unchanged'; build: number | null }
  /** It is back, but with another build: the new version did not start and the guard took it away */
  | { result: 'rolled-back'; build: number | null }
  /** It did not answer again in time */
  | { result: 'no-answer' };

export interface RestartOptions {
  pollMs?: number;
  timeoutMs?: number;
  /** A health check that takes longer than this counts as no answer */
  healthTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Waits for the Pi to restart after an update (or a way back): the process must have gone away – it keeps
 * answering for a moment after the reply, with the old build – and then it must answer with `expect`. A Pi that
 * answers with another build after it was away was put back by its guard (the new version never confirmed itself).
 */
export async function waitForRestart(
  client: Pick<CompanionClient, 'health'>,
  expect: number,
  options: RestartOptions = {},
): Promise<RestartOutcome> {
  const { pollMs = 1000, timeoutMs = 240_000, healthTimeoutMs = 2000, sleep = realSleep } = options;
  let wentAway = false;
  let answered: { build: number | null } | null = null;
  for (let waited = 0; waited < timeoutMs; ) {
    await sleep(pollMs);
    waited += pollMs;
    let build: number | null = null;
    const began = Date.now();
    try {
      build = (await client.health(healthTimeoutMs)).build ?? null;
    } catch {
      // A look that ran into its own time limit took that long: the wait is time, not a count of looks
      waited += Date.now() - began;
      wentAway = true;
      continue;
    }
    answered = { build };
    if (!wentAway) continue;
    if (build === expect) return { result: 'done', build };
    // Back, but not with the build that was asked for: the new version never started – its guard took it away
    // (a version that crashes at the start never answers: what answers now is the old one)
    return { result: 'rolled-back', build };
  }
  // Never away and answering: the request that should have restarted it did not get there
  if (!wentAway && answered) return { result: 'unchanged', build: answered.build };
  return { result: 'no-answer' };
}

/** What a refused login says: a wrong code, a wait (too many tries), or that the Pi is not there. */
export function loginError(error: unknown): {
  key: 'wrong-code' | 'locked' | 'network' | 'other';
  seconds: number;
} {
  const e = error as Partial<CompanionError> | null;
  if (e && typeof e.status === 'number') {
    if (e.status === 401) return { key: 'wrong-code', seconds: 0 };
    if (e.status === 429) return { key: 'locked', seconds: Math.max(1, e.retryAfter ?? 60) };
    return { key: 'other', seconds: 0 };
  }
  return { key: 'network', seconds: 0 };
}
