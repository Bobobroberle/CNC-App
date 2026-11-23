import type { Point } from './camera';
import { otsu } from './markers';

/**
 * Finds the straight edges of a workpiece in a small piece of the camera
 * picture – a light board on a darker table or the other way round – and
 * the corner where two of them meet. Deliberately strict: when the picture
 * does not clearly show two tones with a straight border between them, it
 * finds nothing and the tap stays where the finger put it.
 */

export interface EdgeLine {
  /** A point on the line, px */
  x: number;
  y: number;
  /** Unit direction */
  dx: number;
  dy: number;
  /** Length of the unbroken border on it, px */
  support: number;
}

export interface Edges {
  /** The straight borders found, strongest first (at most two) */
  lines: EdgeLine[];
  /** Where two borders meet at about a right angle, px */
  corner: Point | null;
}

export interface EdgeOptions {
  /** Least difference between the two tones, grey levels */
  minContrast?: number;
  /** Least share of the picture each tone must cover */
  minShare?: number;
  /** Least length of a border, as a share of the shorter picture side */
  minLength?: number;
  /** A corner's edges meet at 90° give or take this, degrees */
  squareTolerance?: number;
}

/** Share of the darkest and of the lightest pixels that is left out when the two tones are told apart */
const CUT = 0.1;

/** Mean of a (2r+1)² neighbourhood: fibres, grain and speckle must not look like borders. */
export function boxBlur(gray: Uint8Array, width: number, height: number, r = 2): Uint8Array {
  const w = width + 1;
  const sums = new Float64Array(w * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x]!;
      sums[(y + 1) * w + x + 1] = sums[y * w + x + 1]! + row;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const sum = sums[y1 * w + x1]! - sums[y0 * w + x1]! - sums[y1 * w + x0]! + sums[y0 * w + x0]!;
      out[y * width + x] = Math.round(sum / ((x1 - x0) * (y1 - y0)));
    }
  }
  return out;
}

/** Same pseudo-random picks on every call: the same picture gives the same answer. */
function picker(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return Math.floor((a / 4294967296) * n);
  };
}

const distanceTo = (l: EdgeLine, x: number, y: number) =>
  Math.abs((x - l.x) * l.dy - (y - l.y) * l.dx);

/** Least-squares line through points (principal axis of their scatter). */
function fitLine(xs: readonly number[], ys: readonly number[]): EdgeLine {
  const n = xs.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const ax = xs[i]! - mx;
    const ay = ys[i]! - my;
    sxx += ax * ax;
    sxy += ax * ay;
    syy += ay * ay;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { x: mx, y: my, dx: Math.cos(angle), dy: Math.sin(angle), support: n };
}

/** How close a border pixel must lie to count for a line, px */
const INLIER = 1.5;
const TRIES = 300;
/** A border may have gaps this long (a fibre, a speck) and still be one border, px */
const GAP = 3;

/**
 * Length of the longest unbroken stretch of border points along a line, px.
 * A real edge is one long stretch; a line that only grazes round things (the
 * dots of the plate, holes) collects short ones.
 */
function stretch(line: EdgeLine, xs: readonly number[], ys: readonly number[]): number {
  const on: number[] = [];
  for (let k = 0; k < xs.length; k++) {
    if (distanceTo(line, xs[k]!, ys[k]!) <= INLIER) {
      on.push((xs[k]! - line.x) * line.dx + (ys[k]! - line.y) * line.dy);
    }
  }
  on.sort((a, b) => a - b);
  let best = 0;
  let start = 0;
  for (let i = 1; i <= on.length; i++) {
    if (i === on.length || on[i]! - on[i - 1]! > GAP) {
      best = Math.max(best, on[i - 1]! - on[start]!);
      start = i;
    }
  }
  return best;
}

/** The line with the longest unbroken border on it, or null when none reaches `least` px. */
function strongestLine(
  xs: readonly number[],
  ys: readonly number[],
  least: number,
  pick: (n: number) => number,
): EdgeLine | null {
  const n = xs.length;
  if (n < least) return null;
  let best: EdgeLine | null = null;
  for (let i = 0; i < TRIES; i++) {
    const a = pick(n);
    const b = pick(n);
    const len = Math.hypot(xs[b]! - xs[a]!, ys[b]! - ys[a]!);
    // Two points close together say little about a direction.
    if (len < least / 2) continue;
    const line = {
      x: xs[a]!,
      y: ys[a]!,
      dx: (xs[b]! - xs[a]!) / len,
      dy: (ys[b]! - ys[a]!) / len,
      support: 0,
    };
    line.support = stretch(line, xs, ys);
    if (!best || line.support > best.support) best = line;
  }
  if (!best || best.support < least) return null;
  // Refine on its own points, twice: the first fit pulls more of them in.
  let line = best;
  for (let round = 0; round < 2; round++) {
    const ix: number[] = [];
    const iy: number[] = [];
    for (let k = 0; k < n; k++) {
      if (distanceTo(line, xs[k]!, ys[k]!) <= INLIER) {
        ix.push(xs[k]!);
        iy.push(ys[k]!);
      }
    }
    line = fitLine(ix, iy);
  }
  line.support = stretch(line, xs, ys);
  return line.support >= least ? line : null;
}

/** Where two lines cross, or null when they run (nearly) parallel. */
export function crossing(a: EdgeLine, b: EdgeLine): Point | null {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
  return { x: a.x + a.dx * t, y: a.y + a.dy * t };
}

/** The point of a line nearest to `p`. */
export function nearestOnLine(line: EdgeLine, p: Point): Point {
  const t = (p.x - line.x) * line.dx + (p.y - line.y) * line.dy;
  return { x: line.x + line.dx * t, y: line.y + line.dy * t };
}

/**
 * The straight borders between the two tones of a grey picture, and their
 * corner. null when the picture has no two clear tones or no straight border.
 */
export function findEdges(
  picture: Uint8Array,
  width: number,
  height: number,
  options: EdgeOptions = {},
): Edges | null {
  const { minContrast = 25, minShare = 0.12, minLength = 0.3, squareTolerance = 20 } = options;
  const gray = boxBlur(picture, width, height);
  // Table and workpiece are the two tones that fill the picture. What is much
  // darker or lighter but small – a hole, a screw, a glint – must not become
  // a tone of its own: the extremes are cut off before the tones are told apart.
  const sorted = Uint8Array.from(gray).sort();
  const lo = sorted[Math.floor(sorted.length * CUT)]!;
  const hi = sorted[Math.floor(sorted.length * (1 - CUT))]!;
  const threshold = otsu(gray.map((v) => Math.min(hi, Math.max(lo, v))));
  let dark = 0;
  let darkSum = 0;
  let lightSum = 0;
  for (const v of gray) {
    if (v <= threshold) {
      dark++;
      darkSum += v;
    } else {
      lightSum += v;
    }
  }
  const light = gray.length - dark;
  if (dark < minShare * gray.length || light < minShare * gray.length) return null;
  if (lightSum / light - darkSum / dark < minContrast) return null;

  // Border points: between two neighbouring pixels of different tone. The rim
  // of the picture is left out – the blur is lopsided there.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      const here = gray[y * width + x]! <= threshold;
      if (here !== gray[y * width + x + 1]! <= threshold) {
        xs.push(x + 1);
        ys.push(y + 0.5);
      }
      if (here !== gray[(y + 1) * width + x]! <= threshold) {
        xs.push(x + 0.5);
        ys.push(y + 1);
      }
    }
  }
  const least = minLength * Math.min(width, height);
  const pick = picker(width * 31 + height);
  const first = strongestLine(xs, ys, least, pick);
  if (!first) return null;
  // The second border: among the points that are clearly not on the first.
  const rx: number[] = [];
  const ry: number[] = [];
  for (let k = 0; k < xs.length; k++) {
    if (distanceTo(first, xs[k]!, ys[k]!) > 3 * INLIER) {
      rx.push(xs[k]!);
      ry.push(ys[k]!);
    }
  }
  const second = strongestLine(rx, ry, least, pick);
  if (!second) return { lines: [first], corner: null };
  const between =
    (Math.acos(Math.min(1, Math.abs(first.dx * second.dx + first.dy * second.dy))) * 180) / Math.PI;
  const corner = Math.abs(between - 90) <= squareTolerance ? crossing(first, second) : null;
  const inside =
    corner !== null && corner.x >= 0 && corner.y >= 0 && corner.x <= width && corner.y <= height;
  return { lines: [first, second], corner: inside ? corner : null };
}

/**
 * What a tap on the picture snaps to. For a corner: the corner, if the tap is
 * within `reach` of it. For an edge: the nearest point of the nearest border
 * within `reach`. null: the tap stays where it is.
 */
export function snapToEdges(
  tap: Point,
  edges: Edges | null,
  want: 'corner' | 'edge',
  reach: number,
): Point | null {
  if (!edges) return null;
  if (want === 'corner') {
    const c = edges.corner;
    return c && Math.hypot(c.x - tap.x, c.y - tap.y) <= reach ? c : null;
  }
  let best: Point | null = null;
  let bestDistance = reach;
  for (const line of edges.lines) {
    const d = distanceTo(line, tap.x, tap.y);
    if (d <= bestDistance) {
      best = nearestOnLine(line, tap);
      bestDistance = d;
    }
  }
  return best;
}
