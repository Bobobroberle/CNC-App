import type { Vec } from './calibration';
import {
  foldDegrees,
  fromJig,
  JIG_ANGLE_LIMIT,
  jigAccuracy,
  TAG_CORNER_ERROR,
  toJig,
  type JigPose,
  type JigTag,
  type TagReading,
} from './jigs';

/**
 * Parts longer than the table, found again after they were slid along: the
 * part carries one or two printed tags (register marks) where the camera
 * reaches them before and after the slide. Measured before, they are kept
 * in the part's own coordinates – those of its program; measured after,
 * they say where the part lies now. Everything is in table millimetres
 * with y up and angles counter-clockwise in degrees, as for the jigs.
 */

/**
 * How a part lies on the table: where the zero of its program is (machine
 * XY) and how the program's X axis is turned against the table's.
 */
export type PartPose = JigPose;

/** A register mark in the part's coordinates: where it sticks and which way round. */
export type PartMark = JigTag;

const DEG = 180 / Math.PI;
const kept = (v: number) => Number(v.toFixed(4));

/** The marks as measured on the table, in the coordinates of the part that lies at `pose`. */
export function marksOnPart(pose: PartPose, readings: readonly TagReading[]): PartMark[] {
  return readings.slice(0, 2).map((r) => {
    const p = toJig(pose, r);
    return {
      id: r.id,
      size: r.size,
      x: kept(p.x),
      y: kept(p.y),
      angle: kept(foldDegrees(r.angle - pose.angle)),
    };
  });
}

/**
 * Where the camera may find a mark before and after the part is slid by
 * `slide` in the negative direction of the axis: the stretch of the table
 * (machine coordinate along the axis) that the camera reaches now and that
 * will still be in its reach afterwards, even when the hand is `tolerance`
 * off. `pad` keeps the whole mark in reach at both ends. Null when nothing
 * is left.
 */
export function markZone(
  camera: { min: number; max: number },
  slide: number,
  tolerance: number,
  pad: number,
): { min: number; max: number } | null {
  const min = camera.min + slide + tolerance + pad;
  const max = camera.max - pad;
  return max > min ? { min, max } : null;
}

/** The two marks are this much farther apart or closer than before the slide, at most, mm */
export const SLIDE_DISTANCE_LIMIT = 0.5;
/** A part on a fence may be measured turned by this much and still count as lying against it, degrees */
export const FENCE_SKEW_LIMIT = 0.2;

/**
 * Why a slid part cannot be placed: a mark was not read (`missing`), the two
 * marks are not as far apart as they were (`distance` – a mark has moved,
 * the part is bent, or it is another mark), a mark sits differently on the
 * part than it did (`turned`), there is one mark only and no fence to hold
 * the direction (`one-mark`), or the part is said to lie against the fence
 * but the marks show it turned (`fence`).
 */
export type SlideProblem = 'missing' | 'distance' | 'turned' | 'one-mark' | 'fence';

export interface SlideTrouble {
  problem: SlideProblem;
  /** The mark it is about */
  tag?: number;
  /** For `distance`: measured minus kept distance, mm */
  mm?: number;
  /** For `fence`: how far the marks show the part turned, degrees */
  degrees?: number;
}

export interface SlideFit {
  /** How the part lies now */
  pose: PartPose;
  /** How far the middle of the marks has moved on the table */
  shift: Vec;
  /** How far the part is turned against how it lay before, degrees */
  rotation: number;
  /** Measured minus kept distance of the two marks, mm; 0 with one mark */
  distanceError: number;
}

/**
 * Where a part lies after it was slid along. `marks` are its register marks
 * in the part's coordinates (see `marksOnPart`), `readings` the same marks
 * as measured now, `before` how the part lay.
 *
 * With two marks the direction comes from the line through both and the
 * place from the middle between them. Against a straight `fence` the part
 * cannot turn: the direction stays what it was and only the place is taken
 * from the marks – one mark is enough then, and two check the fence.
 */
export function locatePart(
  before: PartPose,
  marks: readonly PartMark[],
  readings: readonly TagReading[],
  fence: boolean,
): SlideFit | SlideTrouble {
  const seen: TagReading[] = [];
  for (const mark of marks.slice(0, 2)) {
    const reading = readings.find((r) => r.id === mark.id);
    if (!reading) return { problem: 'missing', tag: mark.id };
    seen.push(reading);
  }
  const [m0, m1] = marks;
  if (!m0) return { problem: 'missing' };
  let angle = before.angle;
  let distanceError = 0;
  let onPart: Vec = m0;
  let onTable: Vec = seen[0]!;
  if (m1) {
    const r0 = seen[0]!;
    const r1 = seen[1]!;
    const was = { x: m1.x - m0.x, y: m1.y - m0.y };
    const now = { x: r1.x - r0.x, y: r1.y - r0.y };
    distanceError = Math.hypot(now.x, now.y) - Math.hypot(was.x, was.y);
    if (Math.abs(distanceError) > SLIDE_DISTANCE_LIMIT) {
      return { problem: 'distance', mm: distanceError };
    }
    const measured = foldDegrees((Math.atan2(now.y, now.x) - Math.atan2(was.y, was.x)) * DEG);
    if (fence) {
      const skew = foldDegrees(measured - before.angle);
      const limit = Math.max(FENCE_SKEW_LIMIT, 2 * jigAccuracy([m0, m1], 0).angle);
      if (Math.abs(skew) > limit) return { problem: 'fence', degrees: skew };
    } else {
      angle = measured;
    }
    onPart = { x: (m0.x + m1.x) / 2, y: (m0.y + m1.y) / 2 };
    onTable = { x: (r0.x + r1.x) / 2, y: (r0.y + r1.y) / 2 };
  } else if (!fence) {
    return { problem: 'one-mark' };
  }
  // Each mark still sticks on the part the way it did: its code says which way round.
  for (const [i, mark] of marks.slice(0, seen.length).entries()) {
    if (Math.abs(foldDegrees(seen[i]!.angle - angle - mark.angle)) > JIG_ANGLE_LIMIT) {
      return { problem: 'turned', tag: mark.id };
    }
  }
  const lever = fromJig({ x: 0, y: 0, angle }, onPart);
  const was = fromJig(before, onPart);
  return {
    pose: { x: onTable.x - lever.x, y: onTable.y - lever.y, angle },
    shift: { x: onTable.x - was.x, y: onTable.y - was.y },
    rotation: foldDegrees(angle - before.angle),
    distanceError,
  };
}

/**
 * What to expect of a part found again by its marks, `reach` mm from the
 * middle between them (the far end of the next section). Each mark is good
 * to about a tenth; the direction rests on two such points as far apart as
 * the marks are, so the error grows with the reach over that baseline.
 * Against a fence the direction is held by the fence: what is left is the
 * place of the marks – and how straight the fence is, which nobody measures.
 */
export function slideAccuracy(
  marks: readonly Pick<PartMark, 'x' | 'y' | 'size'>[],
  reach: number,
  fence: boolean,
): { baseline: number; error: number } {
  const [a, b] = marks;
  const baseline = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  if (fence) return { baseline, error: TAG_CORNER_ERROR };
  if (baseline <= 0) return { baseline: 0, error: Infinity };
  return { baseline, error: jigAccuracy(marks.slice(0, 2), reach).error };
}
