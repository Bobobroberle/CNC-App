/**
 * Small pure parts of Service & Diagnose (DESIGN.md §5): what an axis test
 * says and what the job history knows about running time.
 */

/** A reported move counts as the asked one within this, mm (status reports have three decimals) */
export const AXIS_TEST_TOLERANCE = 0.02;
/** The distances an axis test may move, mm */
export const AXIS_TEST_DISTANCES = [1, 10, 50] as const;

export interface AxisTestResult {
  /** The move that was asked for, mm (signed) */
  expected: number;
  /** What the controller reports it moved, mm (signed) */
  reported: number;
  ok: boolean;
}

/** Compares the position the controller reported before and after a test move. */
export function axisTestResult(expected: number, before: number, after: number): AxisTestResult {
  const reported = Number((after - before).toFixed(3));
  return { expected, reported, ok: Math.abs(reported - expected) <= AXIS_TEST_TOLERANCE };
}

export interface RunTime {
  /** Seconds the recorded jobs ran, in total */
  seconds: number;
  /** Number of recorded jobs */
  jobs: number;
  /** Start of the oldest recorded job, ms since the epoch */
  since: number;
}

/**
 * What the job history says about running time: the sum of the recorded
 * jobs. It is not a counter of the spindle – the controller has none – but
 * the router runs while a job runs. Null without a recorded job.
 */
export function runTime(
  history: readonly { duration: number; startedAt: number }[],
): RunTime | null {
  const counted = history.filter((r) => Number.isFinite(r.duration) && r.duration > 0);
  if (counted.length === 0) return null;
  return {
    seconds: counted.reduce((sum, r) => sum + r.duration, 0),
    jobs: counted.length,
    since: Math.min(...counted.map((r) => r.startedAt)),
  };
}

/** Hours and minutes of a running time: `12 h 05 min`. */
export function hoursMinutes(seconds: number): { hours: number; minutes: number } {
  const total = Math.round(seconds / 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
