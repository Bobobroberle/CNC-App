import type { WorkshopSettings } from '../store/workshop';

/**
 * What belongs to the machine and is kept on the Pi – and how two copies of it are brought together.
 * Pure: the engine (`store/stateSync.ts`) does the talking.
 */

export type Doc = Record<string, unknown>;

/** JSON with the keys in order, so that two equal documents are equal strings whoever built them. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Doc).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

export const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

export interface Merged {
  merged: Doc;
  /** Keys where both sides had changed and one value was dropped (the loser's) */
  replaced: string[];
}

/**
 * Three-way merge by key: `base` is what both copies were at the last sync, `local` what this device
 * has now, `remote` what the Pi has now. A key that only one side changed takes that side's value;
 * one that both changed to different values takes the `winner`'s (and is named in `replaced`).
 */
export function merge3(base: Doc, local: Doc, remote: Doc, winner: 'local' | 'remote'): Merged {
  const merged: Doc = {};
  const replaced: string[] = [];
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const localChanged = !same(local[key], base[key]);
    const remoteChanged = !same(remote[key], base[key]);
    let value: unknown;
    if (!localChanged) value = remote[key];
    else if (!remoteChanged) value = local[key];
    else if (same(local[key], remote[key])) value = local[key];
    else {
      value = winner === 'local' ? local[key] : remote[key];
      replaced.push(key);
    }
    if (value !== undefined) merged[key] = value;
  }
  return { merged, replaced };
}

/** Settings of this device, not of the machine: where the Pi is, this browser's notifications, the screen. */
export const LOCAL_SETTINGS = ['companionUrl', 'notifyBrowser', 'keepAwake'] as const;
/** … and of the camera: which picture source this device uses, and the address it found the stream at. */
export const LOCAL_CAMERA = ['source', 'streamUrl'] as const;

const without = <T extends Doc>(o: T, keys: readonly string[]): Doc =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** The part of the settings that is synced: all but what belongs to this device. */
export function syncedSettings(settings: WorkshopSettings): Doc {
  const rest = without(settings as unknown as Doc, LOCAL_SETTINGS);
  return { ...rest, camera: without(settings.camera as unknown as Doc, LOCAL_CAMERA) };
}

/** The synced part laid over what this device keeps for itself. */
export function withSynced(local: WorkshopSettings, synced: Doc): Doc {
  const camera = (synced.camera ?? {}) as Doc;
  return {
    ...(synced as Doc),
    ...Object.fromEntries(LOCAL_SETTINGS.map((k) => [k, local[k]])),
    camera: {
      ...camera,
      ...Object.fromEntries(LOCAL_CAMERA.map((k) => [k, local.camera[k]])),
    },
  };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const spot = (v: unknown) =>
  v === null ||
  (typeof v === 'object' && v !== null && finite((v as Doc).x) && finite((v as Doc).y));

/**
 * What the Pi sends is not trusted: it has no login, and a place from it becomes a G53 target. Names the
 * first thing that cannot be a setting of a machine (null: all well). Looks at what moves the machine or
 * the picture; the shapes of the rest are made by `validateSettings`.
 */
export function insane(s: WorkshopSettings): string | null {
  if (!spot(s.toolChangePosition)) return 'toolChangePosition';
  if (!spot(s.parkPosition)) return 'parkPosition';
  if (!Array.isArray(s.waypoints) || !s.waypoints.every((w) => finite(w.x) && finite(w.y))) {
    return 'waypoints';
  }
  if (s.safeMachineZ !== null && !finite(s.safeMachineZ)) return 'safeMachineZ';
  const t = s.toolSetter;
  if (t !== null && !(finite(t?.x) && finite(t?.y) && finite(t?.safeZ))) return 'toolSetter';
  const p = s.spindle;
  if (!(finite(p?.rpmMin) && finite(p?.rpmMax) && finite(p?.maxFeed) && p.maxFeed > 0)) {
    return 'spindle';
  }
  const c = s.camera;
  if (
    !(finite(c?.offsetX) && finite(c?.offsetY) && finite(c?.rotation) && finite(c?.pxPerMm)) ||
    c.pxPerMm <= 0 ||
    (c.focusHeight !== null && !finite(c.focusHeight))
  ) {
    return 'camera';
  }
  return null;
}
