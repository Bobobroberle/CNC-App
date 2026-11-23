export interface Macro {
  name: string;
  /** One G-code or $ command per line */
  gcode: string;
}

const STORAGE_KEY = 'lowrider-control.macros';

/** Safe starting points: Z up in machine coordinates (homing puts Z max at MPos 3). */
export const DEFAULT_MACROS: Macro[] = [
  { name: 'Z hoch', gcode: 'G53 G0 Z0' },
  { name: 'Zum Nullpunkt XY', gcode: 'G53 G0 Z0\nG90 G0 X0 Y0' },
];

export function macroLines(macro: Macro): string[] {
  return macro.gcode
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith(';'));
}

export function parseMacros(value: unknown): Macro[] | null {
  if (!Array.isArray(value)) return null;
  const macros = value.filter(
    (m): m is Macro =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as Macro).name === 'string' &&
      typeof (m as Macro).gcode === 'string' &&
      (m as Macro).name.trim() !== '',
  );
  return macros.length === value.length ? macros : null;
}

export function loadMacros(storage: Pick<Storage, 'getItem'> | undefined): Macro[] {
  try {
    return parseMacros(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')) ?? DEFAULT_MACROS;
  } catch {
    return DEFAULT_MACROS;
  }
}

export function saveMacros(storage: Pick<Storage, 'setItem'> | undefined, macros: Macro[]) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(macros));
  } catch {
    // storage unavailable; macros apply until reload
  }
}
