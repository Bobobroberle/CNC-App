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

const isObject = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);

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
export function merge3(
  base: Doc,
  local: Doc,
  remote: Doc,
  winner: 'local' | 'remote',
  /**
   * The keys that a document of this kind always has (settings, places …). A key the remote copy lacks is
   * then no deletion but a copy that is older than the key (an older app wrote it): it counts as unchanged.
   * Without: every key is data (what was learned per tool), and a missing one was removed.
   */
  fixed?: readonly string[],
): Merged {
  const merged: Doc = {};
  const replaced: string[] = [];
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const theirs = fixed?.includes(key) && !Object.hasOwn(remote, key) ? base[key] : remote[key];
    const localChanged = !same(local[key], base[key]);
    const remoteChanged = !same(theirs, base[key]);
    let value: unknown;
    if (!localChanged) value = theirs;
    else if (!remoteChanged) value = local[key];
    else if (same(local[key], theirs)) value = local[key];
    else if (fixed && isObject(local[key]) && isObject(theirs) && isObject(base[key] ?? {})) {
      // Both changed the same part (the camera, say): what each changed in it is kept, and only a value both
      // changed to different things is decided by the winner – one device's calibration is not lost to the
      // other's switch
      const inner = merge3((base[key] ?? {}) as Doc, local[key] as Doc, theirs, winner);
      value = inner.merged;
      if (inner.replaced.length > 0) replaced.push(key);
    } else {
      value = winner === 'local' ? local[key] : theirs;
      replaced.push(key);
    }
    if (value !== undefined) merged[key] = value;
  }
  return { merged, replaced };
}

/** The part of a document that is under `keys` (all of it where there are none), and the rest. */
export function split(doc: Doc, keys: readonly string[] | undefined): { own: Doc; extra: Doc } {
  if (!keys) return { own: doc, extra: {} };
  const own: Doc = {};
  const extra: Doc = {};
  for (const [k, v] of Object.entries(doc)) (keys.includes(k) ? own : extra)[k] = v;
  return { own, extra };
}

/** Settings of this device, not of the machine: where the Pi is, this browser's notifications, the screen, the language. */
export const LOCAL_SETTINGS = [
  'companionUrl',
  'notifyBrowser',
  'keepAwake',
  // what this person sees: one at the PC may read English while the tablet at the machine stays German (a change
  // of the language restarts the whole screen – not something to happen under the finger of another)
  'language',
  'expertMode',
] as const;
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
const within = (v: unknown, min: number, max: number): v is number =>
  finite(v) && v >= min && v <= max;

/**
 * Machine places are millimetres on a table of a few metres: anything beyond this is no place of one.
 * (The cards that take these numbers hold them to the same ranges – what a device could not have entered
 * itself must not keep it from the Pi either.)
 */
export const PLACE = 10_000;
/** The longest wait after a move before a measuring picture counts, ms. */
export const SETTLE_MAX_MS = 60_000;
/** The thickest plate or wall of the corner plate, mm. */
export const PLATE_MAX = 1000;
/** The fastest feed the spindle card accepts, mm/min. */
export const FEED_MAX = 100_000;

/** Whether `z` can be the safe height: in the upper half of the Z travel (where it is known), never at its bottom. */
export function safeHeightAllowed(z: number, travelZ?: { min: number; max: number }): boolean {
  const low = travelZ ? travelZ.min + (travelZ.max - travelZ.min) / 2 : -PLACE;
  const high = travelZ ? travelZ.max : PLACE;
  return within(z, low, high);
}
const spot = (v: unknown) =>
  v === null || (isObject(v) && within(v.x, -PLACE, PLACE) && within(v.y, -PLACE, PLACE));

/**
 * Whether `value` has the kind of thing `template` has, down through the objects: a number where there is a
 * number, an object where there is one … A part the document lacks is no mistake here (an older app wrote
 * it); a part of the wrong kind is. A template of `null` is an optional value: null, a number, a text or an
 * object.
 */
export function shaped(value: unknown, template: unknown): boolean {
  if (template === null)
    return value === null || finite(value) || typeof value === 'string' || isObject(value);
  if (Array.isArray(template)) return Array.isArray(value);
  if (isObject(template)) {
    if (!isObject(value)) return false;
    return Object.entries(value).every(
      ([k, v]) => !Object.hasOwn(template, k) || shaped(v, template[k]),
    );
  }
  if (typeof template === 'number') return finite(value);
  return typeof value === typeof template;
}

/**
 * What the Pi sends is not trusted: it has no login, and a place from it becomes a G53 target. Names the
 * first thing that cannot be a setting of a machine (null: all well). Looks at what moves the machine, the
 * picture and the measuring runs, in the ranges the settings cards themselves allow; the shapes of the rest
 * are made by `validateSettings`. `travelZ` is the Z travel of the machine as this device knows it.
 */
export function insane(s: WorkshopSettings, travelZ?: { min: number; max: number }): string | null {
  if (!spot(s.toolChangePosition)) return 'toolChangePosition';
  if (!spot(s.parkPosition)) return 'parkPosition';
  if (
    !Array.isArray(s.waypoints) ||
    !s.waypoints.every((w) => within(w.x, -PLACE, PLACE) && within(w.y, -PLACE, PLACE))
  ) {
    return 'waypoints';
  }
  if (s.safeMachineZ !== null) {
    // The height the machine lifts to before it travels
    if (!safeHeightAllowed(s.safeMachineZ as number, travelZ)) return 'safeMachineZ';
  }
  const t = s.toolSetter;
  if (
    t !== null &&
    !(within(t?.x, -PLACE, PLACE) && within(t?.y, -PLACE, PLACE) && within(t?.safeZ, -PLACE, PLACE))
  ) {
    return 'toolSetter';
  }
  // The same as the spindle card allows
  const p = s.spindle;
  if (!(finite(p?.rpmMin) && finite(p?.rpmMax) && finite(p?.maxFeed))) return 'spindle';
  if (!(p.rpmMin > 0 && p.rpmMax >= p.rpmMin && p.maxFeed > 0 && p.maxFeed <= FEED_MAX)) {
    return 'spindle';
  }
  const c = s.camera;
  if (
    !(within(c?.offsetX, -PLACE, PLACE) && within(c?.offsetY, -PLACE, PLACE)) ||
    !within(c.rotation, -360, 360) ||
    !(finite(c.pxPerMm) && c.pxPerMm > 0 && c.pxPerMm <= 10_000) ||
    (c.focusHeight !== null && !within(c.focusHeight, -PLACE, PLACE))
  ) {
    return 'camera';
  }
  // The runs that move the machine by themselves: a grid of dots (2–5 per axis) over a plate
  const k = s.calibration;
  if (
    !(finite(k?.spanX) && k.spanX > 0 && k.spanX <= PLACE) ||
    !(finite(k.spanY) && k.spanY > 0 && k.spanY <= PLACE) ||
    !(Number.isInteger(k.points) && k.points >= 2 && k.points <= 5) ||
    !within(k.settleMs, 0, SETTLE_MAX_MS) ||
    !(finite(k.zRise) && k.zRise > 0 && k.zRise <= 1000) ||
    (k.gantryWidth !== null &&
      !(finite(k.gantryWidth) && k.gantryWidth > 0 && k.gantryWidth <= PLACE)) ||
    !(k.motor1Side === null || k.motor1Side === 'xMin' || k.motor1Side === 'xMax')
  ) {
    return 'calibration';
  }
  // The corner plate: its height and wall are lengths, not below nothing
  const plate = s.cornerPlate;
  if (!(within(plate?.top, 0, PLATE_MAX) && within(plate.wall, 0, PLATE_MAX))) return 'cornerPlate';
  const r = s.recording;
  if (!(finite(r?.intervalSeconds) && r.intervalSeconds > 0 && r.intervalSeconds <= 86_400)) {
    return 'recording';
  }
  if (s.language !== 'de' && s.language !== 'en') return 'language';
  return null;
}
