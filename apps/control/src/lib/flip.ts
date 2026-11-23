import {
  flippedOnTable,
  flippedRegistration,
  type Flip,
  type Matrix,
  type Registration,
} from '@lowrider/cam';
import { twoHoleAlignment, type Vec } from '@lowrider/workshop';

/** How the turned part is found again: the camera finds the holes, or the part sits on pins. */
export type FlipMethod = 'camera' | 'pins';

/**
 * A job machined from both sides, as the drawing made it: two programs, the
 * registration holes the front drills and how the part is turned over.
 */
export interface FlipPlan {
  /** Name of the drawing */
  name: string;
  flip: Flip;
  /** The registration holes where the front program drills them (its work XY) */
  holes: Registration;
  /** Diameter of the holes, and of the pins that fit them, mm */
  holeDiameter: number;
  method: FlipMethod;
  thickness: number;
  front: { fileName: string; text: string };
  back: { fileName: string; text: string };
}

/** The registration holes as the back program has them: mirrored about the flip line. */
export const backHoles = (plan: Pick<FlipPlan, 'flip' | 'holes'>): Registration =>
  flippedRegistration(plan.flip, plan.holes);

/**
 * Where the two holes lie on the table (machine XY) once the part has been
 * turned over on the spot (see `flippedOnTable`).
 */
export const expectedHoles = (
  plan: Pick<FlipPlan, 'flip' | 'holes'>,
  zero: Vec,
  pose: Matrix,
): Registration => flippedOnTable(plan.flip, plan.holes, zero, pose);

/**
 * The work zero and the turn of the back program from the two holes as the
 * camera found them (machine XY, hole 1 and hole 2 as drilled): turning the
 * back program by `rotation` about its zero and putting that zero at
 * `origin` lays it onto the turned part. `distanceError` is how much the
 * found holes are farther apart than the drilled ones.
 */
export function locateBack(plan: Pick<FlipPlan, 'flip' | 'holes'>, found: Registration) {
  return twoHoleAlignment(found, backHoles(plan));
}

/** The side of the two-sided job that a program is, by the name it was made with. */
export function loadedSide(
  plan: Pick<FlipPlan, 'front' | 'back'> | null,
  fileName: string | null,
): 'front' | 'back' | null {
  if (!plan || fileName === null) return null;
  return fileName === plan.front.fileName
    ? 'front'
    : fileName === plan.back.fileName
      ? 'back'
      : null;
}

/** Where a two-sided job stands (see `store/flip.ts`). */
export type FlipPhase = 'front' | 'turn' | 'locate' | 'back' | 'done';

/**
 * What the two-sided job means for starting the loaded program: the front
 * comes `first`; the back waits for the `front`, for the `turn` and (with
 * the camera) for the holes to be found (`locate`) and is then `ready`; a
 * side that has been cut would be `cutAgain`. Null for any other program.
 */
export type FlipReadiness = 'first' | 'front' | 'turn' | 'locate' | 'ready' | 'cutAgain';

export function flipReadiness(
  plan: Pick<FlipPlan, 'front' | 'back'> | null,
  phase: FlipPhase,
  fileName: string | null,
): FlipReadiness | null {
  const side = loadedSide(plan, fileName);
  if (side === 'front') return phase === 'front' ? 'first' : 'cutAgain';
  if (side === 'back') return phase === 'back' ? 'ready' : phase === 'done' ? 'cutAgain' : phase;
  return null;
}
