/**
 * Adaptive feed: keeps the spindle load near a target by changing the feed
 * override in small steps. The browser only suggests overrides; FluidNC
 * applies them and its own limits stay in force.
 */
export interface AdaptiveSettings {
  /** Spindle load to hold, percent */
  targetLoad: number;
  /** No change while the load is within ± this many percent of the target */
  deadband: number;
  /** Override change per percent of load error */
  gain: number;
  /** Largest override change per update, percent */
  maxStep: number;
  /** Highest override the controller may set, percent (≤ 200) */
  maxOverride: number;
  /** Lowest override, percent (≥ 10) */
  minOverride: number;
}

export const DEFAULT_ADAPTIVE: AdaptiveSettings = {
  targetLoad: 70,
  deadband: 5,
  gain: 0.5,
  maxStep: 5,
  maxOverride: 120,
  minOverride: 30,
};

/** FluidNC accepts feed overrides from 10 % to 200 %. */
export const OVERRIDE_RANGE = { min: 10, max: 200 } as const;

/** Next feed override for the measured load (both in percent). */
export function nextOverride(current: number, load: number, s: AdaptiveSettings): number {
  const min = Math.max(OVERRIDE_RANGE.min, s.minOverride);
  const max = Math.min(OVERRIDE_RANGE.max, s.maxOverride);
  const error = s.targetLoad - load;
  let next = current;
  if (Math.abs(error) > s.deadband) {
    const step = Math.max(-s.maxStep, Math.min(s.maxStep, error * s.gain));
    next = current + step;
  }
  return Math.round(Math.min(max, Math.max(min, next)));
}

/**
 * The realtime commands that move the feed override from `from` to `to`
 * (FluidNC: ±10 % and ±1 % steps, 100 % reset).
 */
export function overrideSteps(from: number, to: number): ('+10' | '-10' | '+1' | '-1' | 'reset')[] {
  const out: ('+10' | '-10' | '+1' | '-1' | 'reset')[] = [];
  let value = from;
  if (Math.abs(to - 100) < Math.abs(to - from)) {
    out.push('reset');
    value = 100;
  }
  while (to - value >= 10) {
    out.push('+10');
    value += 10;
  }
  while (value - to >= 10) {
    out.push('-10');
    value -= 10;
  }
  while (value < to) {
    out.push('+1');
    value++;
  }
  while (value > to) {
    out.push('-1');
    value--;
  }
  return out;
}
