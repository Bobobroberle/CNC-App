/**
 * The log of what was measured at the machine (calibrations, measurements, corrections written to the
 * controller): one small entry each, kept on the companion so that every device finds the same. The
 * companion has no login, so what it keeps is checked and bounded: an entry is a few names and numbers.
 */

/** The most entries kept; when more come, the oldest go (a log, not an archive). */
export const MAX_MEASUREMENTS = 5000;

const MAX_VALUES = 40;
const MAX_NAME = 60;
const MAX_TEXT = 400;

/** An entry as the app writes it, or null: id, time, kind and a handful of names with numbers, texts or flags. */
export function validateMeasurement(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { id, at, kind, values } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id === '' || id.length > 120) return null;
  if (typeof at !== 'string' || at.length > 40 || Number.isNaN(Date.parse(at))) return null;
  if (typeof kind !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(kind)) return null;
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return null;
  const entries = Object.entries(values);
  if (entries.length > MAX_VALUES) return null;
  for (const [name, v] of entries) {
    if (name.length > MAX_NAME) return null;
    if (
      typeof v === 'number'
        ? !Number.isFinite(v)
        : typeof v === 'string'
          ? v.length > MAX_TEXT
          : typeof v !== 'boolean' && v !== null
    ) {
      return null;
    }
  }
  return { id, at, kind, values: Object.fromEntries(entries) };
}
