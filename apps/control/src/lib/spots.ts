/** A place on the table the operator wants to come back to: machine X/Y, with a name. */
export interface Waypoint {
  id: string;
  name: string;
  x: number;
  y: number;
}

/** More than this is a list nobody reads on a touch screen. */
export const MAX_WAYPOINTS = 12;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** The well-formed waypoints of what was stored (anything else is dropped), at most `MAX_WAYPOINTS`. */
export function validWaypoints(value: unknown): Waypoint[] {
  if (!Array.isArray(value)) return [];
  const out: Waypoint[] = [];
  for (const w of value as Partial<Waypoint>[]) {
    if (
      typeof w === 'object' &&
      w !== null &&
      typeof w.id === 'string' &&
      w.id !== '' &&
      typeof w.name === 'string' &&
      w.name.trim() !== '' &&
      finite(w.x) &&
      finite(w.y) &&
      out.length < MAX_WAYPOINTS
    ) {
      out.push({ id: w.id, name: w.name.trim(), x: w.x, y: w.y });
    }
  }
  return out;
}

/**
 * Remembers a place under a name. The same name again moves that waypoint to the new place (a
 * second "Spannstelle" is the first one found anew); a new name goes to the end of the list.
 * Refused – `'name'` for no name, `'full'` for a full list – changes nothing.
 */
export function addWaypoint(
  list: readonly Waypoint[],
  name: string,
  at: { x: number; y: number },
  id: string,
): Waypoint[] | 'name' | 'full' {
  const trimmed = name.trim();
  if (trimmed === '' || !finite(at.x) || !finite(at.y)) return 'name';
  const same = list.findIndex((w) => w.name.toLowerCase() === trimmed.toLowerCase());
  const place = { x: Number(at.x.toFixed(3)), y: Number(at.y.toFixed(3)) };
  if (same >= 0) return list.map((w, i) => (i === same ? { ...w, name: trimmed, ...place } : w));
  if (list.length >= MAX_WAYPOINTS) return 'full';
  return [...list, { id, name: trimmed, ...place }];
}

export const removeWaypoint = (list: readonly Waypoint[], id: string): Waypoint[] =>
  list.filter((w) => w.id !== id);
