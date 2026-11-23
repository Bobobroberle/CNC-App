/**
 * FluidNC's own limits per axis – the top speed (`max_rate_mm_per_min`) and
 * the acceleration (`acceleration_mm_per_sec2`). FluidNC caps every move to
 * them, the app's jog feed included. Pure: the plausible ranges, what a draft
 * changes, which raises deserve a warning, what a read-back says.
 */
import type { MachineConfig } from '@lowrider/fluidnc-client';
import { parseNumber } from './format';

export const LIMIT_AXES = ['x', 'y', 'z'] as const;
export type LimitAxis = (typeof LIMIT_AXES)[number];
export const LIMIT_KINDS = ['maxRate', 'acceleration'] as const;
export type LimitKind = (typeof LIMIT_KINDS)[number];

export type AxisLimits = Record<LimitKind, number>;
export type Limits = Record<LimitAxis, AxisLimits>;
export type LimitDraft = Record<LimitAxis, Record<LimitKind, string>>;

/** The config item of each kind (FluidNC Machine/Axis.cpp) */
export const LIMIT_ITEM: Record<LimitKind, string> = {
  maxRate: 'max_rate_mm_per_min',
  acceleration: 'acceleration_mm_per_sec2',
};

export const limitPath = (axis: LimitAxis, kind: LimitKind) => `axes/${axis}/${LIMIT_ITEM[kind]}`;

/**
 * What the app lets through, much narrower than FluidNC's own bounds
 * (0.001–250000 mm/min, 0.001–100000 mm/s²): a LowRider with its belts and
 * lead screw. The stock config has 9000 / 200 for X and Y, 1200 / 80 for Z.
 */
export const LIMIT_RANGE: Record<LimitKind, { min: number; max: number }> = {
  maxRate: { min: 60, max: 20_000 },
  acceleration: { min: 10, max: 2000 },
};

/** More than this at once is a big step (DESIGN.md §6.4: raise in small steps, then test). */
export const SMALL_STEP = 0.2;

export function limitsFromConfig(config: MachineConfig): Limits | null {
  const { x, y, z } = config.axes;
  if (!x || !y || !z) return null;
  const of = (a: typeof x) => ({ maxRate: a.maxRate, acceleration: a.acceleration });
  return { x: of(x), y: of(y), z: of(z) };
}

export function toDraft(limits: Limits): LimitDraft {
  const axis = (a: AxisLimits) => ({
    maxRate: String(a.maxRate),
    acceleration: String(a.acceleration),
  });
  return { x: axis(limits.x), y: axis(limits.y), z: axis(limits.z) };
}

export interface LimitChange {
  axis: LimitAxis;
  kind: LimitKind;
  from: number;
  to: number;
  path: string;
}

export type LimitProblem = 'invalid' | 'low' | 'high';

export interface DraftCheck {
  changes: LimitChange[];
  problems: { axis: LimitAxis; kind: LimitKind; problem: LimitProblem }[];
  /** Raised values: lost steps are possible */
  raised: LimitChange[];
  /** Raised by more than SMALL_STEP at once */
  bigSteps: LimitChange[];
}

/** What a draft would change, and what is wrong with it. Unchanged fields are no change. */
export function checkDraft(current: Limits, draft: LimitDraft): DraftCheck {
  const check: DraftCheck = { changes: [], problems: [], raised: [], bigSteps: [] };
  for (const axis of LIMIT_AXES) {
    for (const kind of LIMIT_KINDS) {
      const text = draft[axis][kind].trim();
      const to = text === '' ? Number.NaN : parseNumber(text);
      const from = current[axis][kind];
      if (!Number.isFinite(to)) {
        check.problems.push({ axis, kind, problem: 'invalid' });
        continue;
      }
      const range = LIMIT_RANGE[kind];
      if (to < range.min || to > range.max) {
        check.problems.push({ axis, kind, problem: to < range.min ? 'low' : 'high' });
        continue;
      }
      if (Math.abs(to - from) < 1e-6) continue;
      const change = { axis, kind, from, to, path: limitPath(axis, kind) };
      check.changes.push(change);
      if (to > from) check.raised.push(change);
      if (to > from * (1 + SMALL_STEP) + 1e-9) check.bigSteps.push(change);
    }
  }
  return check;
}

/** The next small step up from a value (+20 %, rounded to tens). */
export function smallStepUp(value: number): number {
  return Math.round((value * (1 + SMALL_STEP)) / 10) * 10;
}

/** The value of a config item in FluidNC's answer (`$/axes/z/max_rate_mm_per_min=1200.000`). */
export function settingValue(lines: readonly string[], path: string): number | null {
  const prefix = `$/${path}=`.toLowerCase();
  const line = lines.find((l) => l.trim().toLowerCase().startsWith(prefix));
  if (!line) return null;
  const n = Number(line.trim().slice(prefix.length));
  return Number.isFinite(n) ? n : null;
}

/** A number as FluidNC wants it in a setting: no grouping, at most three decimals. */
export function settingNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** The jog speed that really happens: the app's jog feed, capped by FluidNC's limit. */
export function effectiveFeed(jogFeed: number, maxRate: number): number {
  return Math.min(jogFeed, maxRate);
}
