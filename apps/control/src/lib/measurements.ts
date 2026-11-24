/**
 * The log of what was measured at the machine: every calibration, every measurement of the camera and of
 * the machine, every correction that was written to the controller – one entry each, with the time and the
 * numbers, kept in the browser and on the Pi. Pure: `store/measurements.ts` keeps and exchanges them.
 */

export const MEASUREMENT_KINDS = [
  'camera-scale',
  'camera-offset',
  'machine-grid',
  'machine-backlash',
  'machine-tilt',
  'ruler-check',
  'correction',
  'tool-reference',
] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

export type MeasurementValue = number | string | boolean | null;

export interface Measurement {
  /** Unique: the time and the kind, with a counter where two came in one millisecond */
  id: string;
  /** When it was measured, ISO 8601 */
  at: string;
  kind: MeasurementKind;
  /** What was measured: names and numbers (the German names are the app's, by kind) */
  values: Record<string, MeasurementValue>;
}

/** Most entries a device keeps; the Pi keeps them all. */
export const MEASUREMENT_LIMIT = 500;
/** Most values in one entry, and the longest text in one – what a measurement says is short. */
const MAX_VALUES = 40;
const MAX_TEXT = 400;

/** What `toISOString` makes: the time the app writes – a log sorts by it, so no other spelling of a time is one. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const isKind = (v: unknown): v is MeasurementKind =>
  typeof v === 'string' && (MEASUREMENT_KINDS as readonly string[]).includes(v);

/** An entry from outside (the Pi is not trusted): well-formed, or null. */
export function validMeasurement(value: unknown): Measurement | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, at, kind, values } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id === '' || id.length > 120) return null;
  if (typeof at !== 'string' || !ISO_TIME.test(at) || Number.isNaN(Date.parse(at))) return null;
  if (!isKind(kind)) return null;
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return null;
  const entries = Object.entries(values);
  if (entries.length > MAX_VALUES) return null;
  const clean: Record<string, MeasurementValue> = {};
  for (const [name, v] of entries) {
    if (name.length > 60) return null;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return null;
    } else if (typeof v === 'string') {
      if (v.length > MAX_TEXT) return null;
    } else if (typeof v !== 'boolean' && v !== null) return null;
    clean[name] = v as MeasurementValue;
  }
  return { id, at, kind, values: clean };
}

/** A new entry: the time and kind make its id; `taken` are the ids that exist, for the rare second one in a millisecond. */
export function newMeasurement(
  kind: MeasurementKind,
  values: Record<string, MeasurementValue>,
  taken: ReadonlySet<string>,
  now: Date = new Date(),
): Measurement {
  const at = now.toISOString();
  let id = `${at}-${kind}`;
  for (let n = 2; taken.has(id); n++) id = `${at}-${kind}-${n}`;
  return { id, at, kind, values };
}

/** Both lists as one, by id, oldest first, the latest `MEASUREMENT_LIMIT`. */
export function mergeMeasurements(
  a: readonly Measurement[],
  b: readonly Measurement[],
): Measurement[] {
  const byId = new Map<string, Measurement>();
  for (const m of [...a, ...b]) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()]
    .sort((x, y) => (x.at === y.at ? (x.id < y.id ? -1 : 1) : x.at < y.at ? -1 : 1))
    .slice(-MEASUREMENT_LIMIT);
}
