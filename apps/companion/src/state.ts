/**
 * The state of the app that belongs to the machine, not to a screen: settings, calibration, places,
 * macros … kept on the companion so that every device finds the same. A document is one key, with
 * a revision the companion counts (never the Pi's clock, which may be wrong): a write names the
 * revision it was made from and is refused with the current state when another device wrote in
 * between – the app then merges and writes again, so nobody's change is lost.
 */

/** The documents the companion keeps, and nothing else. */
export const STATE_KEYS = [
  'settings',
  'clamps',
  'toolReference',
  'macros',
  'learning',
  'profile',
] as const;
export type StateKey = (typeof STATE_KEYS)[number];

/** A document larger than this is no state of a machine. */
export const MAX_STATE_BYTES = 512 * 1024;

/** What a request for one may carry in all (the rest of the API takes uploads: this route must not). */
export const STATE_BODY_LIMIT = 1024 * 1024;

export interface StateDocument {
  rev: number;
  data: unknown;
}

export const isStateKey = (key: string): key is StateKey =>
  (STATE_KEYS as readonly string[]).includes(key);

/** What a write may carry: the revision it was made from and the document (an object or a list). */
export function readWrite(
  body: unknown,
): { baseRev: number; data: object } | 'invalid' | 'too-large' {
  if (typeof body !== 'object' || body === null) return 'invalid';
  const { baseRev, data } = body as { baseRev?: unknown; data?: unknown };
  if (!Number.isSafeInteger(baseRev) || (baseRev as number) < 0) return 'invalid';
  if (typeof data !== 'object' || data === null) return 'invalid';
  if (JSON.stringify(data).length > MAX_STATE_BYTES) return 'too-large';
  return { baseRev: baseRev as number, data };
}
