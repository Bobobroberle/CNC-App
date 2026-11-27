/**
 * Telling from the camera's own pictures that a picture taken now shows the machine where it stands – pure, so every number
 * here is checked by hand (`test/calm.test.ts`).
 *
 * The problem: after a move the machine reports "Idle", but the camera is late by a time nobody tells the app (a lagged pipeline
 * still delivers the picture of the move for a while) and the gantry may still ring. A fixed pause is long enough for the
 * camera the operator had in mind and wasteful for a quick one. What the pictures themselves can say:
 *
 * - **They moved.** The move showed in them (`account().moved`) – a picture that never changed says nothing about whether it
 *   is up to date, so calm without a move before it is no evidence (a table with nothing on it, a camera that stopped).
 * - **They are new.** A picture counts only if it differs from the one before it at all (`newFrames`): a camera's sensor has
 *   noise, so every new frame is a little different and a picture shown again is identical. A stream that stands still – it
 *   stopped, it was late and caught up, the page hid – makes no new frames, so a window of new frames never completes on it.
 *   A camera without noise (the simulator's default) cannot be told from one that stopped: no evidence, and the caller keeps
 *   its fixed pause.
 * - **They are calm** (`calmNow`): the new frames of the last stretch differ from the newest one only by the noise.
 * - **They have been calm for as long as they were before** (`FlushLearner`): the time from the machine reporting rest to the
 *   picture becoming its final one is learned on the first points – while the fixed pause still runs – and kept as a high
 *   quantile plus a frame period.
 *
 * A "look" is a handful of patches of the picture at the camera's own resolution, block-averaged: a shift of a fraction of a
 * pixel changes it, and the noise of single pixels is averaged out. Its distance (`lookDiff`) is the mean absolute difference.
 */

/** A look at one picture: block means of a few patches, grey levels */
export type Look = ArrayLike<number>;

/** A picture seen at `t` (ms, the page's clock) */
export interface Frame {
  t: number;
  look: Look;
}

/** What the machine reported: where, and whether it stands */
export interface Report {
  x: number;
  y: number;
  z: number;
  idle: boolean;
}

/** Grey levels below which two looks are the same (8-bit rounding): the floor of every limit */
export const EPS = 0.05;
/** A change counts above this many times the noise (plus `EPS`) */
export const LIMIT_FACTOR = 1.5;
/** A move shows in the pictures when at least this many of them differ from the last by more than the limit … */
export const MOVED_FRAMES = 3;
/** … and one of them by more than this many limits (a real displacement, not a noisy frame) */
export const MOVED_FACTOR = 8;
/** New frames the noise is measured from, at least (steps between them: one less) */
export const TAIL_MIN = 6;
/**
 * … and at most: the last ones. Twelve frames are eleven steps: a flicker that makes every fifth picture brighter makes five of them
 * large, and the median step – the noise – is still a small one
 */
export const TAIL_MAX = 12;
/** The last stretch that has to be calm, ms – long enough for a gantry that rings at 7 Hz to show it */
export const CALM_SPAN_MS = 150;
/** New frames that stretch has to hold, at least */
export const CALM_MIN = 3;
/** The newest new frame may be this old, ms, at the most (or 2.5 frame periods, if that is more) – else the stream stands still */
export const STALE_MS = 100;
/** The margin the learned wait has beyond the flush, ms (or 3 frame periods, if that is more) */
export const MARGIN_MS = 100;
/** Points whose flush must be known before a wait is learned */
export const LEARN_NEED = 3;
/** Points the learner remembers */
export const LEARN_KEEP = 8;
/** Share of the learned flushes the wait covers */
export const FLUSH_QUANTILE = 0.9;

/** Mean absolute difference of two looks, grey levels (Infinity: not comparable – another size, or empty) */
export function lookDiff(a: Look, b: Look): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

/** The middle of the numbers (the mean of the two middle ones for an even count); NaN for none */
export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The number below which `q` of the values lie, by nearest rank (the smallest value with at least that share at or below it) */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
}

/** The frames that are new: the first, and every one that differs at all from the last kept (a picture shown again is identical) */
export function newFrames(seen: readonly Frame[]): Frame[] {
  const out: Frame[] = [];
  for (const f of seen) {
    const last = out[out.length - 1];
    if (!last || lookDiff(last.look, f.look) > 0) out.push(f);
  }
  return out;
}

/** The median time between frames, ms (0 for fewer than two) */
export function period(frames: readonly Frame[]): number {
  if (frames.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < frames.length; i++) gaps.push(frames[i]!.t - frames[i - 1]!.t);
  return median(gaps);
}

/**
 * The noise of a calm stretch: the median step between consecutive new frames. Null where it cannot be told – fewer than
 * `TAIL_MIN` frames, or the stretch is not calm: the first and the last differ by more than a step does, or one step is far
 * above the others (a picture that was still changing is no measure of noise).
 */
export function noiseOf(frames: readonly Frame[]): number | null {
  if (frames.length < TAIL_MIN) return null;
  const steps: number[] = [];
  for (let i = 1; i < frames.length; i++)
    steps.push(lookDiff(frames[i - 1]!.look, frames[i]!.look));
  const m = median(steps);
  const ends = lookDiff(frames[0]!.look, frames[frames.length - 1]!.look);
  if (!Number.isFinite(m) || ends > LIMIT_FACTOR * m + EPS) return null;
  if (Math.max(...steps) > 3 * m + EPS) return null;
  return m;
}

/** What the noise allows two frames of one picture to differ by */
export const limitOf = (noise: number) => LIMIT_FACTOR * noise + EPS;

/** What the pictures since the move was sent say */
export interface Account {
  /** The move showed in the pictures */
  moved: boolean;
  /** When the picture became its final one (the first frame after the last that differed from the newest), ms; null where none differed */
  final: number | null;
  /** The noise of the last frames, null where they were too few or not calm */
  noise: number | null;
  /** The limit this was judged by (null: none known yet, nothing judged) */
  limit: number | null;
}

/**
 * Reads the new frames since the move was sent. With `learned` – the limit of earlier points – that is the limit; without,
 * the noise of the last frames makes it, and they must be calm (else nothing is judged).
 */
export function account(frames: readonly Frame[], learned: number | null): Account {
  const noise = noiseOf(frames.slice(-TAIL_MAX));
  const limit = learned ?? (noise === null ? null : limitOf(noise));
  const last = frames[frames.length - 1];
  if (limit === null || !last) return { moved: false, final: null, noise, limit };
  let changed = 0;
  let peak = 0;
  let lastDiffering = -1;
  frames.forEach((f, i) => {
    const d = lookDiff(f.look, last.look);
    if (d > limit) {
      changed++;
      lastDiffering = i;
    }
    if (d > peak) peak = d;
  });
  return {
    moved: changed >= MOVED_FRAMES && peak > MOVED_FACTOR * limit,
    final: lastDiffering < 0 ? null : frames[lastDiffering + 1]!.t,
    noise,
    limit,
  };
}

/**
 * Whether the picture is calm at `now`: the newest new frame is not old (the stream is running), the stretch of the last
 * `CALM_SPAN_MS` (or four frame periods, if that is longer) holds `CALM_MIN` new frames, and the picture that stretch began with
 * and every new frame since differ from the newest by no more than `limit`.
 */
export function calmNow(frames: readonly Frame[], now: number, limit: number): boolean {
  const last = frames[frames.length - 1];
  if (!last) return false;
  if (now - last.t > Math.max(STALE_MS, 2.5 * period(frames))) return false;
  // the stretch holds `CALM_MIN` new frames even on a slow camera: at least four of its periods
  const from = now - Math.max(CALM_SPAN_MS, (CALM_MIN + 1) * period(frames));
  // the picture on show when the stretch began: the newest frame at or before it – none, and the stretch is not seen from its start
  let first = -1;
  for (let i = 0; i < frames.length; i++) if (frames[i]!.t <= from) first = i;
  if (first < 0 || frames.length - 1 - first < CALM_MIN) return false;
  return frames.slice(first).every((f) => lookDiff(f.look, last.look) <= limit);
}

/**
 * The machine is calm: the last `count` reports all say Idle, and no axis moved more than `eps` (mm) over them – the meaning of
 * `settled()` in a stretch of reports instead of a single one.
 */
export function positionCalm(reports: readonly Report[], count: number, eps: number): boolean {
  if (count < 1 || reports.length < count) return false;
  const last = reports.slice(-count);
  if (!last.every((r) => r.idle)) return false;
  return (['x', 'y', 'z'] as const).every((axis) => {
    const v = last.map((r) => r[axis]);
    return Math.max(...v) - Math.min(...v) <= eps;
  });
}

/** What one point taught */
export interface Observation {
  /** From the machine reporting rest to the picture becoming its final one, ms (below zero: it was final before) */
  flushMs: number;
  /** The noise of the calm picture, when it could be measured */
  noise: number | null;
  /** The time between new frames, ms */
  period: number;
}

/**
 * What the first points of a scan say about the camera: how long after the machine reports rest the picture still changes,
 * and how noisy it is. The wait for the following points is a high quantile of the flushes plus a margin of a few frames; every
 * later point adds to it, so a camera that gets slower widens it. Forgetting (`lose`) puts the scan back on its fixed pause.
 */
export class FlushLearner {
  private flushes: number[] = [];
  private noises: number[] = [];
  private periods: number[] = [];

  add(o: Observation): void {
    this.flushes.push(o.flushMs);
    if (o.noise !== null) this.noises.push(o.noise);
    if (o.period > 0) this.periods.push(o.period);
    for (const list of [this.flushes, this.noises, this.periods])
      while (list.length > LEARN_KEEP) list.shift();
  }

  /** Enough points are known for a wait to be learned (and noise measured) */
  get known(): boolean {
    return this.flushes.length >= LEARN_NEED && this.noises.length > 0;
  }

  /** The camera has shown noise on some point of this scan (frames that differ only a little, point after point) */
  get noisy(): boolean {
    return this.noises.length > 0;
  }

  /** How many points are remembered */
  get count(): number {
    return this.flushes.length;
  }

  /** The limit of two frames of one picture, from the median noise (null: none measured) */
  get limit(): number | null {
    return this.noises.length ? limitOf(median(this.noises)) : null;
  }

  /** ms after the machine reports rest that the picture has been final for: a high quantile of the flushes plus the margin */
  waitMs(): number {
    const per = this.periods.length ? median(this.periods) : 0;
    return Math.max(0, quantile(this.flushes, FLUSH_QUANTILE)) + Math.max(MARGIN_MS, 3 * per);
  }

  lose(): void {
    this.flushes = [];
    this.noises = [];
    this.periods = [];
  }
}
