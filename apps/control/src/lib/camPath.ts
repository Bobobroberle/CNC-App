import { HELIX_CLEARANCE, MIN_PECK, type OperationKind } from '@lowrider/cam';

/**
 * How a pocket is entered and a hole is drilled, per part – what a typed value and a project file may
 * hold. The library holds the helix hole to the cutter (`tool + HELIX_CLEARANCE … 2 × tool`) and a peck
 * to the depth of the cut; neither the cutter nor the depth of a part is known to a file that is read,
 * and both can change after it is opened, so these are the outer bounds – a value inside them but not
 * inside the library's is taken in as the nearest the library has (the hint under the field says so).
 */
export const PATH_LIMITS = {
  /** The width of the hole a helix entry bores, mm */
  helixDiameter: { min: HELIX_CLEARANCE, max: 200 },
  /** The size of a peck step, mm – the deepest cut a drawing may hold at most (`MAX_DEPTH` of the project file) */
  peck: { min: MIN_PECK, max: 500 },
  /** How far the cutter comes up between two steps of chip breaking, mm */
  peckRetract: { min: MIN_PECK, max: 500 },
} as const;

export type PathValue = keyof typeof PATH_LIMITS;

/** A typed value brought into its range. */
export function clampPath(key: PathValue, value: number): number {
  const { min, max } = PATH_LIMITS[key];
  return Math.min(max, Math.max(min, value));
}

/** The ways to enter a pocket, in the order of the choice: the ramp is what a pocket always did. */
export const ENTRIES = ['ramp', 'helix', 'plunge'] as const;
export type Entry = (typeof ENTRIES)[number];

/** Only a pocket is entered in a way of its own choice (the other cuts are entered along their line). */
export const takesEntry = (kind: OperationKind) => kind === 'pocket';
/** Only a hole is drilled in steps. */
export const takesPeck = (kind: OperationKind) => kind === 'drill';

/**
 * The width of the hole a helix entry bores for a cutter: the default (1.5 × the cutter) and the least and
 * most the library allows (`tool + HELIX_CLEARANCE` … `2 × tool`, a cutter finer than the clearance gets the
 * least). The same numbers as the library's, which does not export them – `test/camPath.test.ts` holds this
 * to the arcs of a program. For the hint under the field: the library holds any value to this range.
 */
export function helixRange(tool: number): { least: number; most: number; usual: number } {
  const least = tool + HELIX_CLEARANCE;
  const most = Math.max(2 * tool, least);
  return { least, most, usual: Math.min(Math.max(1.5 * tool, least), most) };
}
