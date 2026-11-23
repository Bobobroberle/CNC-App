import { validateMaterial, type Material } from './materials';
import { validateTool, type Tool } from './tools';

/**
 * Community profile: a machine description with tools, materials and macros
 * as one JSON file, so LowRider owners can start from a tested setup.
 */
export const PROFILE_FORMAT = 'lowrider-control/profile';
export const PROFILE_VERSION = 1;

export interface SharedMacro {
  name: string;
  gcode: string;
}

export interface SharedProfile<M = unknown> {
  format: typeof PROFILE_FORMAT;
  version: typeof PROFILE_VERSION;
  name: string;
  author?: string;
  description?: string;
  createdAt: string;
  /** Machine settings; checked by the app's own profile validation */
  machine: M;
  tools: Tool[];
  materials: Material[];
  macros: SharedMacro[];
}

export type ShareError =
  | 'invalid-json'
  | 'wrong-format'
  | 'newer-version'
  | 'missing-name'
  | 'invalid-machine'
  | 'invalid-tool'
  | 'invalid-material'
  | 'invalid-macro';

export function createSharedProfile<M>(
  parts: Pick<SharedProfile<M>, 'name' | 'machine' | 'tools' | 'materials' | 'macros'> &
    Partial<Pick<SharedProfile<M>, 'author' | 'description'>>,
  now = new Date(),
): SharedProfile<M> {
  return {
    format: PROFILE_FORMAT,
    version: PROFILE_VERSION,
    createdAt: now.toISOString(),
    ...parts,
  };
}

/**
 * Reads a shared profile. `validateMachine` checks the machine part and may
 * return a normalised copy, or null if it is unusable.
 */
export function parseSharedProfile<M>(
  text: string,
  validateMachine: (value: unknown) => M | null,
): { profile: SharedProfile<M> } | { error: ShareError } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'invalid-json' };
  }
  if (typeof data !== 'object' || data === null) return { error: 'wrong-format' };
  const p = data as Partial<SharedProfile>;
  if (p.format !== PROFILE_FORMAT) return { error: 'wrong-format' };
  if (typeof p.version !== 'number' || p.version > PROFILE_VERSION)
    return { error: 'newer-version' };
  if (typeof p.name !== 'string' || p.name.trim() === '') return { error: 'missing-name' };
  const machine = validateMachine(p.machine);
  if (machine === null) return { error: 'invalid-machine' };
  const tools = Array.isArray(p.tools) ? p.tools.map(validateTool) : [null];
  if (tools.some((t) => t === null)) return { error: 'invalid-tool' };
  const materials = Array.isArray(p.materials) ? p.materials.map(validateMaterial) : [null];
  if (materials.some((m) => m === null)) return { error: 'invalid-material' };
  const macros = Array.isArray(p.macros) ? p.macros : [null];
  const macroOk = (m: unknown) =>
    typeof m === 'object' &&
    m !== null &&
    typeof (m as SharedMacro).name === 'string' &&
    typeof (m as SharedMacro).gcode === 'string';
  if (!macros.every(macroOk)) return { error: 'invalid-macro' };
  return {
    profile: {
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      name: p.name,
      ...(typeof p.author === 'string' ? { author: p.author } : {}),
      ...(typeof p.description === 'string' ? { description: p.description } : {}),
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
      machine,
      tools: tools as Tool[],
      materials: materials as Material[],
      macros: macros as SharedMacro[],
    },
  };
}

/** Merges imported entries into a library: same id replaces, new ids are added. */
export function mergeById<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map(current.map((t) => [t.id, t]));
  for (const t of incoming) byId.set(t.id, t);
  return [...byId.values()];
}
