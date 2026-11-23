import type { FlipReadiness } from './flip';
import { formatNumber } from './format';
import type { JigState } from './jigs';
import type { SectionsState } from './sections';

/**
 * What stands between the loaded job and the start, as one list: the
 * checklist shows it, the start bar counts it and the start button obeys it.
 * `block` keeps the start locked, `warn` is worth a look but may be right
 * (a job without homing, a zero at the machine origin).
 */
export type ReadinessLevel = 'ok' | 'warn' | 'block';
export type ReadinessId =
  | 'connection'
  | 'busy'
  | 'homed'
  | 'errors'
  | 'controller'
  | 'travel'
  | 'zero'
  | 'flip'
  | 'sections'
  | 'series'
  | 'jig'
  | 'collisions'
  | 'clamp'
  | 'profile'
  | 'depth'
  | 'tools'
  | 'limits';

export interface ReadinessItem {
  id: ReadinessId;
  level: ReadinessLevel;
  /** Message key below `ready.` and its parameters */
  key: string;
  params?: Record<string, string | number>;
  /** For `clamp`: index of the clamp among the fixtures, so the list can show it */
  ref?: number;
}

/** A clamp the job runs into (`cut`, `rapid`) or passes with too little room (`low`). */
export interface ClampNote {
  fixture: number;
  name: string;
  kind: 'cut' | 'rapid' | 'low';
  /** Lowest tool tip over the clamp minus its top, mm */
  clearance: number;
}

const CLAMP_KEYS = { cut: 'clampCut', rapid: 'clampRapid', low: 'clampLow' } as const;

/** A two-sided job: what stands between its loaded side and the start. */
const FLIP: Record<FlipReadiness, { level: ReadinessLevel; key: string }> = {
  first: { level: 'ok', key: 'flipFirst' },
  front: { level: 'block', key: 'flipFront' },
  turn: { level: 'block', key: 'flipTurn' },
  locate: { level: 'block', key: 'flipLocate' },
  ready: { level: 'ok', key: 'flipReady' },
  cutAgain: { level: 'warn', key: 'flipCutAgain' },
};

/** The job of a jig: measured and as it was, or what has happened since. */
const JIG: Record<JigState, { level: ReadinessLevel; key: string }> = {
  ok: { level: 'ok', key: 'jigOk' },
  unmeasured: { level: 'block', key: 'jigUnmeasured' },
  moved: { level: 'block', key: 'jigMoved' },
  zeroMoved: { level: 'block', key: 'jigZeroMoved' },
  turned: { level: 'block', key: 'jigTurned' },
};

/** A section of a part longer than the table: what stands between it and the start. */
const SECTIONS: Record<SectionsState, { level: ReadinessLevel; key: string }> = {
  ready: { level: 'ok', key: 'sectionsReady' },
  cutAgain: { level: 'warn', key: 'sectionsCutAgain' },
  earlier: { level: 'block', key: 'sectionsEarlier' },
  past: { level: 'block', key: 'sectionsPast' },
  slid: { level: 'block', key: 'sectionsSlid' },
  moved: { level: 'block', key: 'sectionsMoved' },
};

export interface ReadinessInput {
  connected: boolean;
  /** A job runs or the machine is not idle */
  busy: boolean;
  homed: boolean;
  /** Diagnostics with severity error */
  errors: number;
  /** FluidNC pitfalls such as a tool change without a halt (the app handles them) */
  controllerErrors: number;
  /** Moves outside the travel from here; null while unknown (offline) */
  outside: number | null;
  /**
   * The job leaves the travel along this axis only: the part is longer than
   * the table, and cutting it in sections is the way out
   */
  long?: 'x' | 'y' | null;
  /** Work offset is all zero (zero probably not set); null while unknown */
  zeroAtOrigin: boolean | null;
  collisions: number;
  /** Clamps in the way of the job, each named with what to do about it */
  clamps: readonly ClampNote[];
  /** Travel in the machine profile is still the placeholder */
  placeholderProfile: boolean;
  /** The loaded program is a side of a two-sided job: where that job stands for it */
  flip?: FlipReadiness | null;
  /**
   * The loaded program is a section of a part longer than the table: which
   * one (`n` of `total`), which one is at hand (`at`) and where the flow
   * stands for it
   */
  sections?: { state: SectionsState; n: number; total: number; at: number } | null;
  /**
   * The loaded program is a series on blanks found by the camera: how many,
   * whether the X/Y zero has moved away from under it since it was made, and
   * whether the program itself was turned or shifted afterwards (aligned)
   */
  series?: { count: number; moved: boolean; turned?: boolean } | null;
  /**
   * The loaded program is the job of a jig with printed tags: its name, and
   * whether the jig was measured in this session and all is still as it was
   */
  jig?: { name: string; state: JigState } | null;
  /**
   * How deep the job cuts below its zero and how thick the stock is, mm:
   * deeper than the stock means into the spoilboard
   */
  depth?: { cut: number; stock: number } | null;
  /** The job's tools against the tool list: how many, and how many of them are not in order */
  tools?: { used: number; open: number } | null;
  /**
   * The fastest feed and spindle speeds the program asks for against what
   * the machine and its spindle can do; a speed is null where unknown
   */
  limits?: {
    feed: number | null;
    feedMax: number;
    rpm: { min: number; max: number } | null;
    rpmMin: number;
    rpmMax: number;
  } | null;
}

/** How far through the stock still counts as "just through", mm */
export const THROUGH_TOLERANCE = 1;

export function jobReadiness(r: ReadinessInput): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  items.push(
    r.connected
      ? { id: 'connection', level: 'ok', key: 'connected' }
      : { id: 'connection', level: 'block', key: 'offline' },
  );
  if (r.connected && r.busy) items.push({ id: 'busy', level: 'block', key: 'busy' });
  if (r.connected) {
    items.push(
      r.homed
        ? { id: 'homed', level: 'ok', key: 'homed' }
        : { id: 'homed', level: 'warn', key: 'notHomed' },
    );
  }
  items.push(
    r.errors > 0
      ? { id: 'errors', level: 'block', key: 'errors', params: { count: r.errors } }
      : { id: 'errors', level: 'ok', key: 'noErrors' },
  );
  if (r.controllerErrors > 0) {
    items.push({
      id: 'controller',
      // The app holds at tool changes itself; only worth knowing.
      level: 'warn',
      key: 'controller',
      params: { count: r.controllerErrors },
    });
  }
  if (r.outside !== null) {
    items.push(
      r.outside > 0
        ? r.long
          ? {
              id: 'travel',
              level: 'block',
              // Too long for the table is no dead end: it says the way out.
              key: 'outsideLong',
              params: { count: r.outside, axis: r.long.toUpperCase() },
            }
          : { id: 'travel', level: 'block', key: 'outside', params: { count: r.outside } }
        : { id: 'travel', level: 'ok', key: 'inside' },
    );
  }
  if (r.zeroAtOrigin !== null) {
    items.push(
      r.zeroAtOrigin
        ? { id: 'zero', level: 'warn', key: 'zeroMissing' }
        : { id: 'zero', level: 'ok', key: 'zeroSet' },
    );
  }
  // The back of a two-sided job only after its front, the turn and finding the part again.
  if (r.flip) items.push({ id: 'flip', ...FLIP[r.flip] });
  // A section only after those before it, and after the part was slid along and found again.
  if (r.sections) {
    const { state, n, total, at } = r.sections;
    items.push({ id: 'sections', ...SECTIONS[state], params: { n, total, at } });
  }
  // A series lies where its blanks are: with the zero moved it would miss every one of them.
  if (r.series) {
    items.push(
      r.series.turned
        ? { id: 'series', level: 'block', key: 'seriesTurned' }
        : r.series.moved
          ? { id: 'series', level: 'block', key: 'seriesMoved' }
          : { id: 'series', level: 'ok', key: 'seriesOk', params: { count: r.series.count } },
    );
  }
  // The job of a jig lies where the camera found the jig: its zero comes from the tags.
  if (r.jig) items.push({ id: 'jig', ...JIG[r.jig.state], params: { name: r.jig.name } });
  if (r.collisions > 0) {
    items.push({
      id: 'collisions',
      level: 'warn',
      key: 'collisions',
      params: { count: r.collisions },
    });
  }
  for (const c of r.clamps) {
    items.push({
      id: 'clamp',
      level: 'warn',
      key: CLAMP_KEYS[c.kind],
      params: { name: c.name, mm: formatNumber(Math.max(0, c.clearance), 1) },
      ref: c.fixture,
    });
  }
  if (r.placeholderProfile) items.push({ id: 'profile', level: 'warn', key: 'placeholder' });
  // The checks of step ④ (DESIGN.md §5): is the depth plausible, are the tools in order,
  // do feed and speed stay within what the machine can do.
  if (r.depth) {
    const { cut, stock } = r.depth;
    const params = { mm: formatNumber(cut, 1), stock: formatNumber(stock, 1) };
    items.push(
      cut > stock + THROUGH_TOLERANCE
        ? {
            id: 'depth',
            level: 'warn',
            key: 'depthThrough',
            params: { ...params, over: formatNumber(cut - stock, 1) },
          }
        : cut <= 0
          ? { id: 'depth', level: 'ok', key: 'depthAbove' }
          : { id: 'depth', level: 'ok', key: 'depthOk', params },
    );
  }
  if (r.tools && r.tools.used > 0) {
    items.push(
      r.tools.open > 0
        ? { id: 'tools', level: 'warn', key: 'toolsOpen', params: { count: r.tools.open } }
        : { id: 'tools', level: 'ok', key: 'toolsOk', params: { count: r.tools.used } },
    );
  }
  if (r.limits) {
    const { feed, feedMax, rpm, rpmMin, rpmMax } = r.limits;
    if (feed !== null && feed > feedMax) {
      items.push({
        id: 'limits',
        level: 'warn',
        key: 'feedOver',
        params: { feed: formatNumber(feed), max: formatNumber(feedMax) },
      });
    } else if (rpm !== null && rpm.max > rpmMax) {
      items.push({
        id: 'limits',
        level: 'warn',
        key: 'rpmOver',
        params: { rpm: formatNumber(rpm.max), max: formatNumber(rpmMax) },
      });
    } else if (rpm !== null && rpm.min < rpmMin) {
      items.push({
        id: 'limits',
        level: 'warn',
        key: 'rpmUnder',
        params: { rpm: formatNumber(rpm.min), min: formatNumber(rpmMin) },
      });
    } else if (feed !== null || rpm !== null) {
      items.push({ id: 'limits', level: 'ok', key: 'limitsOk' });
    }
  }
  return items;
}

export const blockers = (items: readonly ReadinessItem[]) =>
  items.filter((i) => i.level === 'block');
export const warnings = (items: readonly ReadinessItem[]) =>
  items.filter((i) => i.level === 'warn');
