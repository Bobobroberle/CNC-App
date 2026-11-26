/**
 * Scanning in strips: the camera runs along a line without stopping and takes a picture about every 8 mm, and
 * the pictures are put where they were taken. Where they were taken is *not* known from the clock – the machine
 * reports its position every 200 ms, the camera's picture comes some tenths of a second late and by an unknown
 * time – so the clock gives only a first guess (`PositionTrack`) and the pictures themselves say the rest:
 * each is registered against the one before it (`solveStrip`), from the picture taken at rest at the start of
 * the strip and again from the one taken at rest at its end. What the two directions agree on is placed; what
 * they do not agree on, or what has no clear match, is left out. Pure geometry and arrays.
 */
import type { CameraCalibration, Point } from './camera';
import {
  frameWindow,
  highPassFrame,
  trustedBox,
  type Affine,
  type Frame,
  type GainMap,
} from './mosaic';
import { centres, imageTransform, MAP_PX_PER_MM, OVERLAP, type Rect, type Size } from './photomap';
import { registerShift } from './register';

export type Axis = 'x' | 'y';

/** A line the camera runs along: the crosshair goes from `from` to `to` on `axis` at `across` on the other one. */
export interface Strip {
  axis: Axis;
  across: number;
  from: number;
  to: number;
}

/**
 * Least correlation at which two pictures are taken to show the same place. A link with less may well be the right
 * one – but its shift is noisy (a faint texture, blur), and a wrong place on the map costs more than a picture taken
 * again at rest.
 */
export const LINK_MIN_SCORE = 0.8;

/** Most a scale error of the camera or the machine may be for a strip to be trusted: 0.5 % (a calibrated one has well under 0.3 %) */
export const MAX_SCALE_ERROR = 0.005;

/** Share of a picture's trusted middle that must lie on the other for two pictures to be compared */
export const LINK_MIN_OVERLAP = 0.35;

/**
 * Longest run between two pictures at rest, mm. A longer strip is run in segments that follow one another, each with
 * its own anchors: what a scale error of the camera or the machine adds up to along a strip, the memory of the pictures
 * waiting to be placed and the share of a strip that one failed link can cost all grow with its length.
 */
export const MAX_STRIP_MM = 400;

/** A strip is worth it where the area is at least this many frame-lengths along its long side */
export const MIN_STRIP_FRAMES = 2.2;

/**
 * Strips for a machine box (crosshair positions): along the longer side, side by side as `planScan` puts its rows
 * (the same overlap, so every point of the area lies in the trusted middle of some picture), alternately there and
 * back. Null where the area is too short for strips to gain anything – then it is scanned by stops.
 */
export function planStrips(area: Rect, visible: Size, overlap = OVERLAP): Strip[] | null {
  const spanX = area.maxX - area.minX;
  const spanY = area.maxY - area.minY;
  const axis: Axis = spanX >= spanY ? 'x' : 'y';
  const along = axis === 'x' ? visible.width : visible.height;
  const side = axis === 'x' ? visible.height : visible.width;
  const lo = axis === 'x' ? area.minX : area.minY;
  const hi = axis === 'x' ? area.maxX : area.maxY;
  if (hi - lo < along * MIN_STRIP_FRAMES) return null;
  const rows = centres(
    axis === 'x' ? area.minY : area.minX,
    axis === 'x' ? area.maxY : area.maxX,
    side,
    side * (1 - overlap),
  );
  const from = lo + along / 2;
  const to = hi - along / 2;
  // one row is run in segments of at most MAX_STRIP_MM, all the same way; the next row comes back
  const parts = Math.max(1, Math.ceil((to - from) / MAX_STRIP_MM));
  const cuts = Array.from({ length: parts + 1 }, (_, i) => from + ((to - from) * i) / parts);
  return rows.flatMap((across, row) =>
    row % 2 === 0
      ? cuts.slice(0, -1).map((a, i) => ({ axis, across, from: a, to: cuts[i + 1]! }))
      : cuts
          .slice(1)
          .map((a, i) => ({ axis, across, from: a, to: cuts[i]! }))
          .reverse(),
  );
}

/** The crosshair position at `along` on a strip. */
export function stripPoint(strip: Strip, along: number): Point {
  return strip.axis === 'x' ? { x: along, y: strip.across } : { x: strip.across, y: along };
}

// ---------- how long it takes ----------

/** Seconds to travel `distance` mm from rest to rest at `speed` mm/s with `accel` mm/s². */
export function moveSeconds(distance: number, speed: number, accel: number): number {
  const d = Math.abs(distance);
  if (d <= 0) return 0;
  const v = Math.max(1, speed);
  const a = Math.max(1, accel);
  return d >= (v * v) / a ? d / v + v / a : 2 * Math.sqrt(d / a);
}

export interface TimeOptions {
  /** mm/s of the run (strips) or the hop (stops) */
  speed: number;
  /** mm/s² */
  accel: number;
  /** Seconds one picture at rest costs: the settle time, the picture's lag, the report that says "stopped" */
  restSeconds: number;
  /** mm/s of the hop from strip to strip (strips only) */
  hopSpeed?: number;
}

/** Seconds a scan by stops takes: every point is a hop and a picture at rest. */
export function estimateStops(
  points: readonly Point[],
  start: Point | null,
  o: TimeOptions,
): number {
  let at = start ?? points[0] ?? null;
  let s = 0;
  for (const p of points) {
    if (at) s += moveSeconds(Math.hypot(p.x - at.x, p.y - at.y), o.speed, o.accel);
    s += o.restSeconds;
    at = p;
  }
  return s;
}

/** Seconds a scan in strips takes: a hop, a picture at rest, the run, a picture at rest – per strip. */
export function estimateStrips(
  strips: readonly Strip[],
  start: Point | null,
  o: TimeOptions,
): number {
  let at = start;
  let s = 0;
  for (const strip of strips) {
    const first = stripPoint(strip, strip.from);
    if (at)
      s += moveSeconds(Math.hypot(first.x - at.x, first.y - at.y), o.hopSpeed ?? o.speed, o.accel);
    s += o.restSeconds * 2 + moveSeconds(strip.to - strip.from, o.speed, o.accel);
    at = stripPoint(strip, strip.to);
  }
  return s;
}

// ---------- the clock's guess ----------

/**
 * What the status reports say about where the machine was: reports (time in s, position in mm) in the order they
 * came, and the position at any time from a straight line through the few reports nearest to it – the jitter of
 * single reports (the network, 200 ms apart) averages out instead of moving the guess.
 */
export class PositionTrack {
  private readonly ts: number[] = [];
  private readonly ps: number[] = [];

  get length() {
    return this.ts.length;
  }

  add(t: number, p: number) {
    if (!Number.isFinite(t) || !Number.isFinite(p)) return;
    if (this.ts.length && t <= this.ts[this.ts.length - 1]!) return;
    this.ts.push(t);
    this.ps.push(p);
  }

  /** Line through the `k` reports nearest to `t`: position and slope (mm/s) at `t`, or null with fewer than two. */
  fit(t: number, k = 4): { position: number; speed: number } | null {
    const n = this.ts.length;
    if (n < 2) return null;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ts[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    const take = Math.min(k, n);
    let from = Math.max(0, Math.min(n - take, lo - Math.floor(take / 2)));
    // slide the window while the report just outside it is nearer than the farthest one inside
    while (from > 0 && Math.abs(this.ts[from - 1]! - t) < Math.abs(this.ts[from + take - 1]! - t))
      from--;
    while (from + take < n && Math.abs(this.ts[from + take]! - t) < Math.abs(this.ts[from]! - t))
      from++;
    let mt = 0;
    let mp = 0;
    for (let i = from; i < from + take; i++) {
      mt += this.ts[i]!;
      mp += this.ps[i]!;
    }
    mt /= take;
    mp /= take;
    let num = 0;
    let den = 0;
    for (let i = from; i < from + take; i++) {
      num += (this.ts[i]! - mt) * (this.ps[i]! - mp);
      den += (this.ts[i]! - mt) ** 2;
    }
    const speed = den > 0 ? num / den : 0;
    return { position: mp + speed * (t - mt), speed };
  }

  at(t: number): number | null {
    return this.fit(t)?.position ?? null;
  }
}

/**
 * The lag (s) the pictures really have, from what registration found: a picture taken at `actual` that the clock
 * put at `predicted` with the lag `lag` while the camera moved at `speed` (mm/s, signed) shows `lag` was off by
 * (actual − predicted) / speed. The median of several, or null with too few moving fast enough.
 */
export function lagFromCorrections(
  lag: number,
  samples: readonly { predicted: number; actual: number; speed: number }[],
): number | null {
  const lags = samples
    .filter((s) => Math.abs(s.speed) >= 5)
    .map((s) => lag - (s.actual - s.predicted) / s.speed)
    .sort((a, b) => a - b);
  if (lags.length < 4) return null;
  const mid = lags.length >> 1;
  const median = lags.length % 2 ? lags[mid]! : (lags[mid - 1]! + lags[mid]!) / 2;
  return Math.min(1.5, Math.max(0, median));
}

// ---------- where the pictures were taken ----------

/** A picture taken at rest, where the strip begins or ends: its place is known. */
export interface Anchor {
  frame: Frame;
  /** The factor by which the frame was shrunk from the camera's picture */
  k: number;
  /** Crosshair position along the strip */
  along: number;
}

/** A picture taken on the run, with where the clock puts it. */
export interface StripFrame {
  frame: Frame;
  k: number;
  predicted: number;
}

export interface SolveOptions {
  cal: CameraCalibration;
  axis: Axis;
  across: number;
  /** mm/s of the run – sets how far the clock may be off */
  speed: number;
  /** Camera vignette to take out of the pictures before they are compared */
  flat?: GainMap | null;
  /** How far the first picture may be from where the clock puts it, mm */
  firstSearchMm?: number;
  /** How far any later one may be from where the previous one says, mm */
  searchMm?: number;
  /** The windows are compared every n-th map pixel – speed */
  step?: number;
  /** Where the chain from the start and the one from the end may differ at most where both reach a picture, mm */
  disagreeMm?: number;
}

export interface StripSolution {
  /** Where each picture was taken (crosshair along the strip), or null where it is left out */
  along: (number | null)[];
  /** The chains from the start and from the end, each alone */
  forward: (number | null)[];
  backward: (number | null)[];
  /** Pictures placed */
  placed: number;
  /** The greatest difference between the two chains, mm */
  disagreement: number;
}

interface Placed {
  frame: Frame;
  k: number;
  along: number;
}

/** The map pose of a frame: the crosshair at `along` on the strip. */
function pose(o: SolveOptions, f: Placed): Affine {
  const crosshair = stripPoint({ axis: o.axis, across: o.across, from: 0, to: 0 }, f.along);
  const spindle = { x: crosshair.x - o.cal.offsetX, y: crosshair.y - o.cal.offsetY };
  return imageTransform({ ...o.cal, pxPerMm: o.cal.pxPerMm * f.k }, spindle, f.frame, {
    k: MAP_PX_PER_MM,
    left: 0,
    top: 0,
  });
}

/** How far `cur` (put at its guess) must move along the strip to match `ref`, mm; null without a clear match. */
function link(o: SolveOptions, ref: Placed, cur: Placed, searchMm: number): number | null {
  const step = o.step ?? 2;
  const mRef = pose(o, ref);
  const mCur = pose(o, cur);
  const a = trustedBox(cur.frame, mCur);
  const b = trustedBox(ref.frame, mRef);
  // the window holds both pictures and the room to move one against the other: what really overlaps may lie
  // outside where the clock puts the overlap
  const room = Math.ceil(searchMm * MAP_PX_PER_MM) + 4;
  const alongX = o.axis === 'x';
  const x0 = Math.min(a.x0, b.x0) - (alongX ? room : 4);
  const y0 = Math.min(a.y0, b.y0) - (alongX ? 4 : room);
  const x1 = Math.max(a.x0 + a.width, b.x0 + b.width) + (alongX ? room : 4);
  const y1 = Math.max(a.y0 + a.height, b.y0 + b.height) + (alongX ? 4 : room);
  // pictures that cannot meet within the search are not compared
  const gapX = Math.max(b.x0 - (a.x0 + a.width), a.x0 - (b.x0 + b.width), 0);
  const gapY = Math.max(b.y0 - (a.y0 + a.height), a.y0 - (b.y0 + b.height), 0);
  if (gapX > (alongX ? room - 4 : 0) || gapY > (alongX ? 0 : room - 4)) return null;
  const box = { x0, y0, width: x1 - x0, height: y1 - y0 };
  const wRef = frameWindow(ref.frame, mRef, box, step, 1, o.flat ?? null);
  const wCur = frameWindow(cur.frame, mCur, box, step, 1, o.flat ?? null);
  const along = Math.max(1, Math.ceil((searchMm * MAP_PX_PER_MM) / step));
  const across = Math.max(1, Math.ceil((0.5 * MAP_PX_PER_MM) / step));
  // Pictures that the clock puts apart are not compared: two that hardly meet agree on any repeating texture,
  // wherever the shift that makes them meet is. The share of the smaller picture's trusted middle that must lie on
  // the other, at the guess and at the shift found.
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const ox = Math.min(a.x0 + a.width, b.x0 + b.width) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y0 + a.height, b.y0 + b.height) - Math.max(a.y0, b.y0);
  const smaller = Math.min(areaA, areaB);
  if (ox <= 0 || oy <= 0 || (ox * oy) / smaller < LINK_MIN_OVERLAP) return null;
  const reg = registerShift(wRef, wCur, alongX ? along : across, alongX ? across : along, {
    stride: 1,
    minScore: LINK_MIN_SCORE,
    minOverlap: (LINK_MIN_OVERLAP * smaller) / (step * step),
  });
  if (!reg) return null;
  // map pixels: x to the right is machine +X, y down is machine −Y
  return alongX ? (reg.dx * step) / MAP_PX_PER_MM : (-reg.dy * step) / MAP_PX_PER_MM;
}

/**
 * One chain: from `anchor` through the frames in the order given, each placed against the last one that was.
 * A generator: it yields after every comparison, so whoever drives it can let the screen and the buttons
 * (PAUSE, NOT-HALT) have their turn in between.
 */
function* chain(
  o: SolveOptions,
  anchor: Anchor,
  order: readonly number[],
  frames: readonly StripFrame[],
): Generator<void, (number | null)[]> {
  const out: (number | null)[] = new Array<number | null>(frames.length).fill(null);
  let ref: Placed = { frame: anchor.frame, k: anchor.k, along: anchor.along };
  let refPredicted = anchor.along;
  let first = true;
  const wide = o.firstSearchMm ?? 2 + 0.25 * Math.abs(o.speed);
  const near = o.searchMm ?? 2 + 0.06 * Math.abs(o.speed);
  for (const i of order) {
    const f = frames[i]!;
    const guess = ref.along + (f.predicted - refPredicted);
    const shift = link(o, ref, { frame: f.frame, k: f.k, along: guess }, first ? wide : near);
    yield;
    if (shift === null) continue;
    out[i] = guess + shift;
    ref = { frame: f.frame, k: f.k, along: guess + shift };
    refPredicted = f.predicted;
    first = false;
  }
  return out;
}

/**
 * Where each picture of a strip was taken. The clock's guess (`predicted`) is good to some millimetres; each
 * picture is registered against the one before it, in both directions – from the start anchor and from the end
 * anchor – and the two are blended by the distance along the strip, so the start is as exact as the picture at
 * rest there and so is the end. A picture the two chains disagree on by more than `disagreeMm` is left out; one that only
 * one chain reaches is placed by that chain (every link from its anchor was clear), one that neither reaches is left out.
 * A generator (see `chain`); `solveStrip` runs it through.
 */
export function* solveStripSteps(
  startAnchor: Anchor,
  endAnchor: Anchor,
  pictures: readonly StripFrame[],
  o: SolveOptions,
): Generator<void, StripSolution> {
  // texture only, once per picture: slow changes of brightness are no part of what a shift is measured on
  const flatten = <T extends { frame: Frame; k: number }>(f: T): T => ({
    ...f,
    frame: highPassFrame(f.frame, Math.max(2, Math.round(3 * o.cal.pxPerMm * f.k))),
  });
  const start = flatten(startAnchor);
  yield;
  const end = flatten(endAnchor);
  yield;
  const frames: StripFrame[] = [];
  for (const picture of pictures) {
    frames.push(flatten(picture));
    yield;
  }
  const order = frames.map((_, i) => i).sort((a, b) => frames[a]!.predicted - frames[b]!.predicted);
  const forward = start.along <= end.along ? order : [...order].reverse();
  const forwardChain = yield* chain(o, start, forward, frames);
  const backwardChain = yield* chain(o, end, [...forward].reverse(), frames);
  const disagree = o.disagreeMm ?? 0.5;
  const span = end.along - start.along;
  // A scale error of the camera or the machine makes the two chains drift apart *alike* all along the strip – by
  // (error × length), the same for every picture – and the blend below takes it out exactly. What a picture is
  // judged on is therefore how far it is from that common offset; the offset itself must stay what a calibrated
  // camera can have (MAX_SCALE_ERROR), or the calibration is wrong and nothing on this strip is to be trusted.
  const offsets = frames.flatMap((_, i) =>
    forwardChain[i] !== null && backwardChain[i] !== null
      ? [forwardChain[i]! - backwardChain[i]!]
      : [],
  );
  const sorted = [...offsets].sort((x, y) => x - y);
  const common = sorted.length ? sorted[sorted.length >> 1]! : 0;
  const scaleOk = Math.abs(common) <= MAX_SCALE_ERROR * Math.abs(span);
  let worst = 0;
  const along = frames.map((f, i) => {
    const a = forwardChain[i]!;
    const b = backwardChain[i]!;
    if (a === null && b === null) return null;
    // reached by one chain only: every link from its anchor on was clear, which is as good as the chain is
    if (a === null || b === null) return a ?? b;
    if (!scaleOk) return null;
    worst = Math.max(worst, Math.abs(a - b - common));
    if (Math.abs(a - b - common) > disagree) return null;
    const lambda = span === 0 ? 0.5 : Math.min(1, Math.max(0, (f.predicted - start.along) / span));
    return a * (1 - lambda) + b * lambda;
  });
  return {
    along,
    forward: forwardChain,
    backward: backwardChain,
    placed: along.filter((v) => v !== null).length,
    disagreement: worst,
  };
}

/** `solveStripSteps` run through at once. */
export function solveStrip(
  start: Anchor,
  end: Anchor,
  pictures: readonly StripFrame[],
  o: SolveOptions,
): StripSolution {
  const steps = solveStripSteps(start, end, pictures, o);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}
