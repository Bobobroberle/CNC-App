/**
 * Zero memory: work offsets of recurring setups (a jig, a clamping position
 * on the table) saved with a name and a photo, and restored with one tap.
 */

export type Wcs = 1 | 2 | 3 | 4 | 5 | 6;
export const WCS_CODES = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'] as const;
export type WcsCode = (typeof WCS_CODES)[number];

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface SavedZero {
  id: string;
  name: string;
  /** Coordinate system it belongs to, 1 = G54 … 6 = G59 */
  wcs: Wcs;
  /** Work offset (machine position of the work zero), mm */
  offset: Point3;
  /** Photo of the setup as data URL */
  photo?: string;
  notes?: string;
  createdAt: number;
}

export const wcsCode = (wcs: Wcs): WcsCode => WCS_CODES[wcs - 1]!;

export function wcsFromCode(code: string): Wcs | null {
  const i = WCS_CODES.indexOf(code.toUpperCase() as WcsCode);
  return i < 0 ? null : ((i + 1) as Wcs);
}

const n = (v: number) => String(Number(v.toFixed(3)));

/** Writes a saved offset back into its coordinate system. */
export function restoreCommand(zero: Pick<SavedZero, 'wcs' | 'offset'>): string {
  const { x, y, z } = zero.offset;
  return `G10 L2 P${zero.wcs} X${n(x)} Y${n(y)} Z${n(z)}`;
}

export interface OffsetTable {
  wcs: Partial<Record<WcsCode, Point3>>;
  g28?: Point3;
  g30?: Point3;
  g92?: Point3;
  /** Dynamic tool length offset (G43.1), mm */
  tlo?: number;
}

/** Parses the reply of `$#`: `[G54:0.000,0.000,0.000]` … `[TLO:0.000]`. */
export function parseOffsets(lines: readonly string[]): OffsetTable {
  const table: OffsetTable = { wcs: {} };
  for (const line of lines) {
    const m = /^\[(G5[4-9]|G28|G30|G92|TLO):([-\d.,]+)\]$/.exec(line.trim());
    if (!m) continue;
    const values = m[2]!.split(',').map((v) => (v === '' ? Number.NaN : Number(v)));
    if (values.some((v) => !Number.isFinite(v))) continue;
    const key = m[1]!;
    if (key === 'TLO') {
      table.tlo = values[0]!;
      continue;
    }
    if (values.length < 3) continue;
    const point = { x: values[0]!, y: values[1]!, z: values[2]! };
    if (key === 'G28') table.g28 = point;
    else if (key === 'G30') table.g30 = point;
    else if (key === 'G92') table.g92 = point;
    else table.wcs[key as WcsCode] = point;
  }
  return table;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateSavedZero(value: unknown): SavedZero | null {
  if (typeof value !== 'object' || value === null) return null;
  const z = value as Partial<SavedZero>;
  if (
    typeof z.id !== 'string' ||
    z.id === '' ||
    typeof z.name !== 'string' ||
    z.name.trim() === ''
  ) {
    return null;
  }
  if (!Number.isInteger(z.wcs) || z.wcs! < 1 || z.wcs! > 6) return null;
  const o = z.offset;
  if (typeof o !== 'object' || o === null || ![o.x, o.y, o.z].every(finite)) return null;
  if (!finite(z.createdAt)) return null;
  if (z.photo !== undefined && typeof z.photo !== 'string') return null;
  return z as SavedZero;
}
