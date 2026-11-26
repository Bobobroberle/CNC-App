/**
 * What a measured squareness means for the operator, in words that cannot be read the wrong way, and what the control
 * measurement after a correction says. Pure; the direction comes from the one place that decides it
 * (`squaringPulloff` in the workshop library and `proposeCorrections` over it): this only tells what that decision does.
 *
 * Frame of reference (the same as the test pattern's labels): the origin is at the front left, X to the right, Y to the
 * back; the gantry spans X, its two ends are X− (left) and X+ (right), the Y rails run left and right of the table.
 */

export type GantrySide = 'xMin' | 'xMax';

export interface SquaringStory {
  /** unknown: no trustworthy angle yet · square: within what a correction can change · lean: the gantry stands askew */
  kind: 'unknown' | 'square' | 'lean';
  /** The end of the gantry that runs ahead towards the back (+Y) – only where it leans */
  ahead?: GantrySide;
  /** How far over a metre of Y the axes are off square, mm */
  perMetre?: number;
  /** How far one end runs ahead of the other over the rail distance, mm – only with the rail distance known */
  leanMm?: number;
  /** What the correction does: the X+ end moves relative to X−, towards the front (−Y) or the back (+Y) */
  move?: { mm: number; towards: 'front' | 'back' };
}

/** Over one metre of Y: how far the axes are off square, mm (signed, + = the X+ end ahead). */
export const perMetre = (degrees: number): number => Math.tan((degrees * Math.PI) / 180) * 1000;

/**
 * `angle` is the measured lean in degrees (+ = the X+ end of the gantry runs ahead towards +Y), `shift` how far the
 * X+ end must move in +Y to put that right (null without the rail distance), `noise` the least that is worth a
 * correction, mm.
 */
export function squaringStory(
  angle: number | null,
  shift: number | null,
  noise = 0.05,
): SquaringStory {
  if (angle === null || !Number.isFinite(angle)) return { kind: 'unknown' };
  const per = perMetre(angle);
  if (shift === null) {
    return { kind: 'lean', ahead: angle > 0 ? 'xMax' : 'xMin', perMetre: per };
  }
  if (Math.abs(shift) <= noise) return { kind: 'square', perMetre: per, leanMm: Math.abs(shift) };
  return {
    kind: 'lean',
    ahead: angle > 0 ? 'xMax' : 'xMin',
    perMetre: per,
    leanMm: Math.abs(shift),
    move: { mm: Math.abs(shift), towards: shift < 0 ? 'front' : 'back' },
  };
}

export type Verdict = 'good' | 'better' | 'unchanged' | 'doubled' | 'overshot';

/** What a ruler can tell apart: over a metre of Y, mm. */
export const RULER_NOISE_PER_METRE = 0.3;

/**
 * The control measurement against the first: both leans in degrees, signed the same way.
 * good – within what the ruler can show · better – clearly smaller · unchanged – about as before: the correction did not
 * act (not restarted or not homed?) · doubled – about twice as large *on the same side*: the correction went the wrong
 * way, the side of motor 1 is the other one · overshot – on the other side and not small: too much was corrected (the
 * rail distance too large?).
 */
export function compareSquaring(
  before: number,
  after: number,
  noisePerMetre = RULER_NOISE_PER_METRE,
): Verdict {
  const was = Math.abs(perMetre(before));
  const is = Math.abs(perMetre(after));
  if (is <= noisePerMetre) return 'good';
  const sameSide = before * after > 0;
  if (!sameSide) return is <= 0.5 * was ? 'better' : 'overshot';
  const ratio = is / Math.max(was, 1e-9);
  if (ratio < 0.7) return 'better';
  if (ratio >= 1.4) return 'doubled';
  return 'unchanged';
}
