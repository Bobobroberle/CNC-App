/**
 * The reference plate of the camera calibration (Service → Kalibrieren): a grid of dark dots on a light
 * ground, 19 × 19 dots with 10 mm between neighbours and Ø 3 mm as drawn in `docs/kalibriertafel.svg`.
 * What the plate is – how many dots, how far apart, how big – decides which measuring grids make sense:
 * the camera locks on the dot nearest the centre of the picture, so a measuring point that lies between
 * two dots can be taken for the neighbour (a mistake of up to half a pitch in the fit).
 *
 * Pure: the card and the store ask, nothing here touches the machine.
 */

/** The plate of `docs/kalibriertafel.svg`: dots per side, mm between neighbours, mm of one dot. */
export const PLATE_DEFAULT = { dots: 19, pitch: 10, dotDiameter: 3 } as const;

/**
 * The ranges the card takes and the Pi's document may hold (`insane` in `lib/stateSync.ts` uses the same
 * ones – what a device could not enter itself must not keep it from the Pi either).
 */
export const PITCH_MAX = 1000;
export const DOTS_MAX = 100;
export const DOT_DIAMETER_MAX = 100;
/** The most measuring points per axis (8 × 8 = 64 stops): beyond this the run takes long for little gain. */
export const POINTS_MAX = 8;

/** A dot seen this much bigger or smaller than the plate's (a share) means the camera scale is off. */
export const DOT_SIZE_TOLERANCE = 0.1;
/**
 * A measuring field counts as a whole number of pitches within this share of a pitch: a plate that shrank
 * a little (a print) and was measured at 178.6 mm instead of 180 is still the plate whose outer dots are 18
 * pitches apart. The camera takes the wrong dot only from half a pitch on; a quarter is the budget *along*
 * the move (a field that is a little off) – *across* it the budget is the tilt of the plate (`stepsClear`).
 */
const STEP_TOLERANCE = 0.25;
/** How far beyond the plate's own size a field may be before it is said (a share of a pitch: a measured plate). */
const PLATE_SLACK = 0.1;

/** The distance of the outer dots of a plate, mm: the default measuring field. */
export const plateSpan = (dots: number, pitch: number): number =>
  Number(((dots - 1) * pitch).toFixed(6));

/**
 * How many pitches a field of `span` mm is, if it is a whole number of them (within a quarter of a pitch –
 * a plate that was measured to 178.6 mm is still the 180 mm plate); null where it lies between two dots.
 */
export function pitchSteps(span: number, pitch: number): number | null {
  if (!(span > 0 && pitch > 0)) return null;
  const steps = span / pitch;
  const whole = Math.round(steps);
  return whole >= 1 && Math.abs(steps - whole) <= STEP_TOLERANCE ? whole : null;
}

/** Whether `n` measuring points per axis put every one of them on a dot (counted in dots, not in mm). */
export function pointsFit(n: number, spanX: number, spanY: number, pitch: number): boolean {
  const x = pitchSteps(spanX, pitch);
  const y = pitchSteps(spanY, pitch);
  return x !== null && y !== null && n >= 2 && x % (n - 1) === 0 && y % (n - 1) === 0;
}

/** The tilt the card asks the operator to keep the plate within (±1° to X, docs/kalibrierung.md). */
const TILT = (1 * Math.PI) / 180;
/** Of half a pitch – where the camera takes the neighbour – this much is given to the tilt: a margin for the rest. */
const TILT_BUDGET = 0.9;

/**
 * Whether the first step of the run still lands nearer the right dot than a neighbouring one at the tilt the
 * card allows: the second point is predicted from one pair, a pure translation along X, so a plate askew by θ
 * is off *across* the step by `step · sin θ`; the camera takes the neighbouring row as soon as that exceeds half
 * a pitch (from about 28 pitches between points at 1° – a plate with a fine pitch, like 2.5 mm over 200 mm).
 * Only X matters: from the first row on the points are predicted from a fit, which knows the tilt.
 */
export function stepsClear(n: number, spanX: number, pitch: number): boolean {
  return n >= 2 && pitch > 0 && (spanX / (n - 1)) * Math.sin(TILT) < (pitch / 2) * TILT_BUDGET;
}

/** The numbers of measuring points per axis that fit the plate, smallest first. */
export function offeredPoints(spanX: number, spanY: number, pitch: number): number[] {
  const out: number[] = [];
  for (let n = 2; n <= POINTS_MAX; n++) {
    if (pointsFit(n, spanX, spanY, pitch) && stepsClear(n, spanX, pitch)) out.push(n);
  }
  return out;
}

export type PlateWarning = 'spanOffPitch' | 'pointsOffPitch' | 'pointsFarApart' | 'spanBeyondPlate';

/**
 * What is wrong with the measuring field and the number of points for this plate – said, never forbidden
 * (a measured plate may be a little off, and the operator knows what lies on the table).
 */
export function plateWarnings(c: {
  spanX: number;
  spanY: number;
  points: number;
  pitch: number;
  dots: number;
}): PlateWarning[] {
  const out: PlateWarning[] = [];
  if (pitchSteps(c.spanX, c.pitch) === null || pitchSteps(c.spanY, c.pitch) === null) {
    out.push('spanOffPitch');
  } else if (!pointsFit(c.points, c.spanX, c.spanY, c.pitch)) {
    // Only where the field itself is on the pitch: otherwise this one is no news
    out.push('pointsOffPitch');
  } else if (!stepsClear(c.points, c.spanX, c.pitch)) {
    // On dots, but so far apart that a plate askew within the card's ±1° gets the next row locked
    out.push('pointsFarApart');
  }
  const plate = plateSpan(c.dots, c.pitch);
  const slack = c.pitch * PLATE_SLACK;
  if (c.spanX > plate + slack || c.spanY > plate + slack) out.push('spanBeyondPlate');
  return out;
}

/** Whether a dot seen at `measured` mm is too far from the plate's `nominal` mm to be that plate at this scale. */
export function dotSizeOff(
  measured: number,
  nominal: number,
  tolerance: number = DOT_SIZE_TOLERANCE,
): boolean {
  return nominal > 0 && Math.abs(measured - nominal) / nominal > tolerance;
}

/** Rounded up to a tenth of a mm – without the dust of a subtraction (0.2 that is 0.2000000000000455) making it 0.3 */
const tenths = (mm: number): number => Math.ceil(mm * 10 - 1e-6) / 10;

export interface TravelBox {
  x: { min: number; max: number };
  y: { min: number; max: number };
}

export interface Shortfall {
  axis: 'x' | 'y';
  /** The end of the travel that is too near: `max` – the run goes towards it – or `min` (the approach from below) */
  side: 'min' | 'max';
  /** How many mm are missing, rounded up to a tenth */
  short: number;
}

/** The room a run is given at both ends of an axis beyond what the field needs, as a share of the larger field. */
export const TRAVEL_SLACK_SHARE = 0.05;

/**
 * Whether a measuring run that starts with the camera over the plate's corner at `pos` (machine mm, the point
 * with the smallest X and Y) stays inside the travel: it drives the field towards +X and +Y and approaches
 * every point from `backoff` mm below. The plate lies a little askew (the points are not where they are
 * planned: at 1° the far corner is off by 1.7 % of the field, towards both ends of the *other* axis too), the
 * dot the camera stands over is not exactly under the crosshair, and a scale error is what the run measures –
 * so both ends of both axes get `slack` mm, or 5 % of the larger field where that is more. Null: it fits;
 * else the axis that falls shortest.
 */
export function travelShortfall(
  pos: { x: number; y: number },
  travel: TravelBox,
  spanX: number,
  spanY: number,
  backoff = 0.3,
  slack = 5,
  share = TRAVEL_SLACK_SHARE,
): Shortfall | null {
  const found: Shortfall[] = [];
  const room = Math.max(slack, share * Math.max(spanX, spanY));
  const check = (axis: 'x' | 'y', at: number, span: number) => {
    const range = travel[axis];
    const over = at + span + room - range.max;
    if (over > 0.001) found.push({ axis, side: 'max', short: tenths(over) });
    const under = range.min - (at - backoff - room);
    if (under > 0.001) found.push({ axis, side: 'min', short: tenths(under) });
  };
  check('x', pos.x, spanX);
  check('y', pos.y, spanY);
  found.sort((a, b) => b.short - a.short);
  return found[0] ?? null;
}
