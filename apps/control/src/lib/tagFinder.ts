import { decodeTag, TAG_MODULES, TAG_SIZES, tagPose, type TagReading } from '@lowrider/workshop';
import type { Point } from './camera';

/**
 * Finds printed tags (the square codes of `@lowrider/workshop` – "Marker" to
 * the operator) in a picture of the table: the dark square, its four corners
 * to a fraction of a pixel, the 25 cells, and from them which tag it is and
 * which way round it lies. Strict like the other finders: a square of the
 * wrong size, a blurred, faint or cut-off one, one lying askew to the camera
 * or one whose cells are no code of ours is not a tag – and the answer says
 * why, so the operator can do something about it. Dark things that do not
 * even look like a tag (no dark border with white around it) are passed
 * over without a word.
 *
 * Coordinates are picture pixels, x to the right and y down; pixel `i`
 * covers [i, i + 1), so the middle of the first pixel is 0.5.
 */

export interface FoundTag {
  /** The number printed beside it */
  id: number;
  /** Its corners as printed – top left, top right, bottom right, bottom left – px */
  corners: [Point, Point, Point, Point];
  /** Its middle, px */
  x: number;
  y: number;
  /** Side of the dark square as printed, mm: the print size it matches */
  size: number;
  /** Side as measured with the picture's scale, mm */
  measured: number;
  /** Cells read differently from its code: 0, or 1 (forgiven) */
  errors: number;
  /** Difference between its paper and its ink, grey levels */
  contrast: number;
}

/**
 * Why something that looks like a tag is not taken for one: it is cut off
 * by the edge of the picture (`cut`), out of focus (`blurred`), its ink
 * barely darker than its paper (`faint`), not flat or not seen from straight
 * above (`tilted`), of a size that is none of the print sizes (`size`), or
 * its cells are no code of ours (`unreadable`: dirt, a covered corner,
 * someone else's code).
 */
export type TagReject = 'cut' | 'blurred' | 'faint' | 'tilted' | 'size' | 'unreadable';

export interface RejectedTag {
  reason: TagReject;
  /** Its middle, px */
  x: number;
  y: number;
  /** Its outline, px */
  outline: Point[];
  /** For `size`: the side as measured, mm */
  measured?: number;
}

export interface TagSearch {
  tags: FoundTag[];
  rejected: RejectedTag[];
}

export interface TagOptions {
  /** Scale of the picture: the size of a tag is checked against it */
  pxPerMm: number;
  /** 1 where the picture has a pixel, 0 where it has none (a photo map has gaps) */
  valid?: Uint8Array;
  /** Print sizes that are looked for, mm (default: all of `TAG_SIZES`) */
  sizes?: readonly number[];
  /** Least difference between paper and ink, grey levels (default 70) */
  minContrast?: number;
}

/** The search for dark squares runs at about this scale, px per mm: fast, and blind to grain */
const COARSE = 2;
/** A pixel counts as dark against the mean of this much of the picture around it, mm */
const WINDOW_MM = 40;
/** A tag is this much larger or smaller than a print size, at most */
export const TAG_SIZE_TOLERANCE = 0.12;
/** Sides and diagonals of a tag seen from straight above differ by this share, at most */
const SQUARE_TOLERANCE = 0.04;
/** An edge of the dark square is blurred over more than this share of a module: cells run into each other */
const BLUR_LIMIT = 0.35;

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull (Andrew's monotone chain), counter-clockwise in a y-up sense. */
function hullOf(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/** Area of a polygon; positive when it runs clockwise as seen (y down). */
function signedArea(polygon: readonly Point[]): number {
  let twice = 0;
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    twice += p.x * q.y - q.x * p.y;
  });
  return twice / 2;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The four corners of a convex shape that is (about) a square, clockwise as
 * seen: the two ends of its longest diagonal and the points farthest from
 * that diagonal on either side. Null when it has no four corners.
 */
function quadOf(hull: readonly Point[]): [Point, Point, Point, Point] | null {
  if (hull.length < 4) return null;
  const mid = {
    x: hull.reduce((s, p) => s + p.x, 0) / hull.length,
    y: hull.reduce((s, p) => s + p.y, 0) / hull.length,
  };
  const farthest = (from: Point) =>
    hull.reduce((best, p) => (distance(p, from) > distance(best, from) ? p : best), hull[0]!);
  const a = farthest(mid);
  const c = farthest(a);
  let b = a;
  let d = a;
  let most = 0;
  let least = 0;
  for (const p of hull) {
    const side = cross(a, c, p);
    if (side > most) {
      most = side;
      b = p;
    }
    if (side < least) {
      least = side;
      d = p;
    }
  }
  if (b === a || d === a) return null;
  const quad: [Point, Point, Point, Point] = [a, b, c, d];
  return signedArea(quad) > 0 ? quad : [a, d, c, b];
}

/** Grey value at a point of the picture, between the pixels' middles; NaN outside it or on a gap. */
function sampler(gray: Uint8Array, width: number, height: number, valid?: Uint8Array) {
  return (x: number, y: number): number => {
    const fx = x - 0.5;
    const fy = y - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) return Number.NaN;
    const i = y0 * width + x0;
    if (valid && !(valid[i] && valid[i + 1] && valid[i + width] && valid[i + width + 1])) {
      return Number.NaN;
    }
    const tx = fx - x0;
    const ty = fy - y0;
    const top = gray[i]! * (1 - tx) + gray[i + 1]! * tx;
    const bottom = gray[i + width]! * (1 - tx) + gray[i + width + 1]! * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

interface Line {
  /** A point on the line and its direction (unit) */
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** How far the points it was fitted to lie off it, px (root mean square) */
  rms: number;
}

/** The straight line through points, by least squares on the distances to it. */
function fitLine(points: readonly Point[]): Line {
  const n = points.length;
  const x = points.reduce((s, p) => s + p.x, 0) / n;
  const y = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - x) ** 2;
    sxy += (p.x - x) * (p.y - y);
    syy += (p.y - y) ** 2;
  }
  const angle = Math.atan2(2 * sxy, sxx - syy) / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // What is left across the line.
  const across = sxx * dy * dy - 2 * sxy * dx * dy + syy * dx * dx;
  return { x, y, dx, dy, rms: Math.sqrt(Math.max(0, across) / n) };
}

const offLine = (l: Line, p: Point) => Math.abs((p.x - l.x) * l.dy - (p.y - l.y) * l.dx);

function meet(a: Line, b: Line): Point | null {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
  return { x: a.x + a.dx * t, y: a.y + a.dy * t };
}

interface Refined {
  corners: [Point, Point, Point, Point];
  /** Width of the step from ink to paper at the square's edge, px */
  blur: number;
  /** How far the edge points lie off straight lines, px */
  rms: number;
}

/** Points measured along each side */
const EDGE_POINTS = 20;

/**
 * The corners of a dark square to a fraction of a pixel: along each side the
 * place where the picture passes the middle between ink and paper is
 * measured at many points, a straight line laid through them, and the lines
 * are cut with each other. `reach` is how far from the guessed side the
 * step is looked for. Null when a side shows no clear step, `outside` when
 * a side runs out of the picture.
 */
function refine(
  at: (x: number, y: number) => number,
  quad: readonly [Point, Point, Point, Point],
  reach: number,
): Refined | 'outside' | null {
  const lines: Line[] = [];
  const widths: number[] = [];
  const step = 0.5;
  const count = Math.max(4, Math.round(reach / step));
  for (let side = 0; side < 4; side++) {
    const a = quad[side]!;
    const b = quad[(side + 1) % 4]!;
    const length = distance(a, b);
    const dx = (b.x - a.x) / length;
    const dy = (b.y - a.y) / length;
    // Outwards: the quad runs clockwise as seen.
    const nx = dy;
    const ny = -dx;
    const points: Point[] = [];
    let outside = 0;
    for (let k = 0; k < EDGE_POINTS; k++) {
      const along = (0.12 + (0.76 * k) / (EDGE_POINTS - 1)) * length;
      const bx = a.x + dx * along;
      const by = a.y + dy * along;
      const profile: number[] = [];
      for (let j = -count; j <= count; j++)
        profile.push(at(bx + nx * j * step, by + ny * j * step));
      if (profile.some(Number.isNaN)) {
        outside++;
        continue;
      }
      const ends = Math.max(1, Math.round(count * 0.4));
      const mean = (list: number[]) => list.reduce((s, v) => s + v, 0) / list.length;
      const ink = mean(profile.slice(0, ends));
      const paper = mean(profile.slice(-ends));
      if (paper - ink < 20) continue;
      const level = (share: number) => ink + (paper - ink) * share;
      // Where the profile passes the middle, nearest to the guessed side.
      let best: number | null = null;
      for (let j = 0; j < profile.length - 1; j++) {
        const p = profile[j]!;
        const q = profile[j + 1]!;
        if (p <= level(0.5) && q > level(0.5)) {
          const s = j + (level(0.5) - p) / (q - p);
          if (best === null || Math.abs(s - count) < Math.abs(best - count)) best = s;
        }
      }
      if (best === null) continue;
      // How wide the step is: from a fifth of the way up to four fifths.
      let low = Math.floor(best);
      while (low > 0 && profile[low]! > level(0.2)) low--;
      let high = Math.ceil(best);
      while (high < profile.length - 1 && profile[high]! < level(0.8)) high++;
      widths.push(((high - low) * step) / 0.6);
      // The place of the step: as much paper as the profile shows around it, counted back
      // from the paper side. Unlike the crossing itself this does not depend on where the
      // pixels' borders fall.
      const margin = Math.max(3, 2 * (high - low));
      const from = Math.max(0, low - margin);
      const to = Math.min(profile.length - 1, high + margin);
      let share = 0;
      for (let j = from; j <= to; j++) share += (profile[j]! - ink) / (paper - ink);
      const s = (to + 0.5 - share - count) * step;
      points.push({ x: bx + nx * s, y: by + ny * s });
    }
    // A side that runs out of the picture: the square is not all there.
    if (outside > EDGE_POINTS * 0.4) return 'outside';
    if (points.length < EDGE_POINTS * 0.6) return null;
    let line = fitLine(points);
    // Once more without the points that lie clearly off (a speck on the edge).
    const kept = points.filter((p) => offLine(line, p) <= Math.max(0.5, 2 * line.rms));
    if (kept.length >= EDGE_POINTS * 0.5) line = fitLine(kept);
    lines.push(line);
  }
  const corners: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const corner = meet(lines[(i + 3) % 4]!, lines[i]!);
    if (!corner) return null;
    corners.push(corner);
  }
  widths.sort((p, q) => p - q);
  return {
    corners: corners as [Point, Point, Point, Point],
    blur: widths[Math.floor(widths.length / 2)]!,
    rms: Math.max(...lines.map((l) => l.rms)),
  };
}

/**
 * The map from the unit square onto four corners (a plane seen at a small
 * angle keeps straight lines straight): (0, 0) goes to the first corner,
 * (1, 0) to the second, (1, 1) to the third, (0, 1) to the fourth.
 */
export function squareMap(corners: readonly [Point, Point, Point, Point]) {
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  return (u: number, v: number): Point => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w };
  };
}

/** Finds the tags in a grey picture. */
export function findTags(
  gray: Uint8Array,
  width: number,
  height: number,
  options: TagOptions,
): TagSearch {
  const out: TagSearch = { tags: [], rejected: [] };
  const sizes = options.sizes ?? TAG_SIZES;
  const minContrast = options.minContrast ?? 70;
  const { valid, pxPerMm } = options;
  if (sizes.length === 0 || !(pxPerMm > 0)) return out;
  const smallest = Math.min(...sizes);
  const largest = Math.max(...sizes);

  // ---- a small picture: every k × k pixels as one ----
  const k = Math.max(1, Math.floor(pxPerMm / COARSE));
  const cw = Math.floor(width / k);
  const ch = Math.floor(height / k);
  if (cw < 4 || ch < 4) return out;
  const scale = pxPerMm / k;
  const small = new Float32Array(cw * ch);
  const whole = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let sum = 0;
      let ok = 1;
      for (let v = 0; v < k; v++) {
        const row = (y * k + v) * width + x * k;
        for (let u = 0; u < k; u++) {
          sum += gray[row + u]!;
          if (valid && !valid[row + u]) ok = 0;
        }
      }
      small[y * cw + x] = sum / (k * k);
      whole[y * cw + x] = ok;
    }
  }

  // ---- dark against what lies around: sums over any box in four look-ups ----
  const stride = cw + 1;
  const sums = new Float64Array(stride * (ch + 1));
  const counts = new Uint32Array(stride * (ch + 1));
  for (let y = 0; y < ch; y++) {
    let rowSum = 0;
    let rowCount = 0;
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (whole[i]) {
        rowSum += small[i]!;
        rowCount++;
      }
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1]! + rowSum;
      counts[(y + 1) * stride + x + 1] = counts[y * stride + x + 1]! + rowCount;
    }
  }
  const half = Math.max(3, Math.round((WINDOW_MM * scale) / 2));
  const dark = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(ch, y + half + 1);
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (!whole[i]) continue;
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(cw, x + half + 1);
      const box = (table: Float64Array | Uint32Array) =>
        table[y1 * stride + x1]! -
        table[y0 * stride + x1]! -
        table[y1 * stride + x0]! +
        table[y0 * stride + x0]!;
      const mean = box(sums) / box(counts);
      if (small[i]! < mean * 0.88 - 4) dark[i] = 1;
    }
  }

  // ---- dark regions, one after the other ----
  const at = sampler(gray, width, height, valid);
  const seen = new Uint8Array(cw * ch);
  const queue = new Int32Array(cw * ch);
  // A square turned by 45° fills a box 1.41 times its side.
  const minBox = smallest * (1 - TAG_SIZE_TOLERANCE) * scale - 2;
  const maxBox = largest * (1 + TAG_SIZE_TOLERANCE) * scale * Math.SQRT2 + 2;
  for (let start = 0; start < dark.length; start++) {
    if (!dark[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let minX = cw;
    let maxX = 0;
    let minY = ch;
    let maxY = 0;
    let cut = false;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % cw;
      const y = (i - x) / cw;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) cut = true;
      const around = [
        x > 0 ? i - 1 : -1,
        x < cw - 1 ? i + 1 : -1,
        y > 0 ? i - cw : -1,
        y < ch - 1 ? i + cw : -1,
      ];
      for (const n of around) {
        if (n < 0) continue;
        if (!whole[n]) cut = true;
        if (!dark[n] || seen[n]) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    const area = tail;
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    if (Math.max(boxW, boxH) > maxBox) continue;
    if (cut ? Math.min(boxW, boxH) < minBox * 0.3 : Math.min(boxW, boxH) < minBox) continue;

    // The shape around it: the outer ends of every row, as pixel corners.
    const lefts = new Int32Array(boxH).fill(cw);
    const rights = new Int32Array(boxH).fill(-1);
    for (let j = 0; j < tail; j++) {
      const i = queue[j]!;
      const x = i % cw;
      const row = (i - x) / cw - minY;
      if (x < lefts[row]!) lefts[row] = x;
      if (x > rights[row]!) rights[row] = x;
    }
    const rim: Point[] = [];
    for (let row = 0; row < boxH; row++) {
      if (rights[row]! < 0) continue;
      const y = minY + row;
      rim.push(
        { x: lefts[row]!, y },
        { x: lefts[row]!, y: y + 1 },
        { x: rights[row]! + 1, y },
        { x: rights[row]! + 1, y: y + 1 },
      );
    }
    const hull = hullOf(rim);
    const hullArea = Math.abs(signedArea(hull));
    const full = (p: Point): Point => ({ x: p.x * k, y: p.y * k });
    const middle = full({ x: (minX + maxX + 1) / 2, y: (minY + maxY + 1) / 2 });
    // A tag is a dark frame with cells in it: between two fifths and nearly all of its shape is ink.
    const inked = area / hullArea;
    if (inked < 0.4) continue;

    if (cut) {
      // Cut off by the edge. Worth a word only if what is left is clearly a piece of a tag:
      // one whole side of the dark frame with paper beyond it and cells behind it.
      const piece = quadOf(hull);
      if (!piece || inked > 0.95) continue;
      const tone = (p: Point): number => {
        const x = Math.floor(p.x);
        const y = Math.floor(p.y);
        return x < 0 || y < 0 || x >= cw || y >= ch || !whole[y * cw + x]
          ? Number.NaN
          : small[y * cw + x]!;
      };
      const isPiece = piece.some((a, i) => {
        const b = piece[(i + 1) % 4]!;
        const length = distance(a, b);
        if (length < minBox || length > maxBox / Math.SQRT2) return false;
        const m = length / TAG_MODULES;
        const ex = (b.x - a.x) / length;
        const ey = (b.y - a.y) / length;
        // Into the square: the quad runs clockwise as seen.
        const spot = (along: number, into: number): Point => ({
          x: a.x + ex * along * m - ey * into * m,
          y: a.y + ey * along * m + ex * into * m,
        });
        const frame: number[] = [];
        const beyond: number[] = [];
        const inner: number[] = [];
        for (let j = 0; j < TAG_MODULES; j++) {
          frame.push(tone(spot(j + 0.5, 0.5)));
          beyond.push(tone(spot(j + 0.5, -0.5)));
          for (let row = 1; row < TAG_MODULES - 1 && j > 0 && j < TAG_MODULES - 1; row++) {
            const v = tone(spot(j + 0.5, row + 0.5));
            if (!Number.isNaN(v)) inner.push(v);
          }
        }
        if ([...frame, ...beyond].some(Number.isNaN)) return false;
        if (Math.min(...beyond) - Math.max(...frame) < 30) return false;
        const mid = (Math.max(...frame) + Math.min(...beyond)) / 2;
        return (
          inner.filter((v) => v < mid).length >= 2 && inner.filter((v) => v >= mid).length >= 2
        );
      });
      if (isPiece) out.rejected.push({ reason: 'cut', ...middle, outline: hull.map(full) });
      continue;
    }
    if (Math.abs(boxW - boxH) > 0.15 * Math.max(boxW, boxH) + 2) continue;
    const quad = quadOf(hull);
    if (!quad) continue;
    const quadArea = signedArea(quad);
    if (quadArea < 0.88 * hullArea) continue;
    const coarseSides = quad.map((p, i) => distance(p, quad[(i + 1) % 4]!));
    if (Math.max(...coarseSides) > 1.3 * Math.min(...coarseSides)) continue;

    // ---- on the picture itself: corners, cells, code ----
    const guess = quad.map(full) as [Point, Point, Point, Point];
    const module = (Math.sqrt(quadArea) * k) / TAG_MODULES;
    /** The tones of a square with these corners: its frame, its cells, the paper around. */
    const read = (corners: readonly [Point, Point, Point, Point]) => {
      const map = squareMap(corners);
      const cell = 1 / TAG_MODULES;
      /** Mean grey of the middle of a module (row, column) */
      const moduleTone = (row: number, column: number): number => {
        let sum = 0;
        for (const dv of [-0.22, 0, 0.22]) {
          for (const du of [-0.22, 0, 0.22]) {
            const p = map((column + 0.5 + du) * cell, (row + 0.5 + dv) * cell);
            sum += at(p.x, p.y);
          }
        }
        return sum / 9;
      };
      // The cells are read row by row from the first corner: bit `row · 5 + column`.
      const border: number[] = [];
      const paper: number[] = [];
      const cells: number[] = [];
      const last = TAG_MODULES - 1;
      for (let row = 0; row < TAG_MODULES; row++) {
        for (let column = 0; column < TAG_MODULES; column++) {
          const edge = row === 0 || column === 0 || row === last || column === last;
          (edge ? border : cells).push(moduleTone(row, column));
        }
      }
      // Half a module out from the dark square, all round.
      for (let j = 0; j < TAG_MODULES; j++) {
        for (const [row, column] of [
          [-1, j],
          [TAG_MODULES, j],
          [j, -1],
          [j, TAG_MODULES],
        ] as const) {
          const p = map((column + 0.5) * cell, (row + 0.5) * cell);
          paper.push(at(p.x, p.y));
        }
      }
      return { map, border, paper, cells };
    };
    const mean = (list: number[]) => list.reduce((s, v) => s + v, 0) / list.length;
    /** A dark frame all round with dark and light cells in it: what a tag looks like inside. */
    const framed = (border: number[], cells: number[], mid: number) =>
      border.every((v) => v < mid) &&
      cells.filter((v) => v < mid).length >= 6 &&
      cells.filter((v) => v >= mid).length >= 6;

    // Twice: the second time from the corners of the first, in a narrower band.
    const rough = refine(at, guess, Math.min(0.85 * module, Math.max(0.4 * module, 2 * k + 2)));
    const fine =
      rough === null || rough === 'outside'
        ? rough
        : refine(at, rough.corners, Math.min(0.85 * module, Math.max(0.3 * module, 3)));
    if (fine === null) continue;
    if (fine === 'outside') {
      // Its paper runs out of the picture. Worth a word if the rest looks like a tag.
      const { border, cells } = read(guess);
      const inside = [...border, ...cells];
      if (inside.some(Number.isNaN)) continue;
      const mid = (mean(border) + Math.max(...cells)) / 2;
      if (Math.max(...cells) - mean(border) >= 25 && framed(border, cells, mid)) {
        out.rejected.push({ reason: 'cut', ...middle, outline: guess });
      }
      continue;
    }
    const { corners } = fine;
    const { map, border, paper, cells } = read(corners);
    const outline = [...corners];
    // Its paper runs out of the picture, or into a gap of the map: not all of it is there.
    if ([...border, ...cells].some(Number.isNaN)) continue;
    if (paper.some(Number.isNaN)) {
      const mid = (mean(border) + Math.max(...cells)) / 2;
      if (framed(border, cells, mid)) out.rejected.push({ reason: 'cut', ...middle, outline });
      continue;
    }
    const ink = mean(border);
    const white = mean(paper);
    const contrast = white - ink;
    const mid = (ink + white) / 2;
    // A dark frame with cells in it, and paper around that: else it is no tag at all.
    if (contrast < 25 || !framed(border, cells, mid)) continue;
    if (paper.filter((v) => v > mid).length < paper.length - 2) continue;

    const centre = map(0.5, 0.5);
    const reject = (reason: TagReject, measured?: number) =>
      out.rejected.push({
        reason,
        ...centre,
        outline,
        ...(measured === undefined ? {} : { measured }),
      });
    const sides = corners.map((p, i) => distance(p, corners[(i + 1) % 4]!));
    const side = mean(sides);
    const fineModule = side / TAG_MODULES;
    if (fine.blur > Math.max(3, BLUR_LIMIT * fineModule)) {
      reject('blurred');
      continue;
    }
    if (contrast < minContrast) {
      reject('faint');
      continue;
    }
    const diagonals = [distance(corners[0], corners[2]), distance(corners[1], corners[3])];
    const uneven =
      (Math.max(...sides) - Math.min(...sides)) / side > SQUARE_TOLERANCE ||
      Math.abs(diagonals[0]! - diagonals[1]!) / (side * Math.SQRT2) > SQUARE_TOLERANCE;
    if (uneven || fine.rms > Math.max(0.75, 0.06 * fineModule)) {
      reject('tilted');
      continue;
    }
    const measured = side / pxPerMm;
    const size = sizes.reduce((best, s) =>
      Math.abs(Math.log(measured / s)) < Math.abs(Math.log(measured / best)) ? s : best,
    );
    if (Math.abs(measured / size - 1) > TAG_SIZE_TOLERANCE) {
      reject('size', measured);
      continue;
    }
    let bits = 0;
    let unsure = 0;
    cells.forEach((v, i) => {
      if (v < mid) bits |= 1 << i;
      if (Math.abs(v - mid) < 0.18 * contrast) unsure++;
    });
    const code = unsure > 2 ? null : decodeTag(bits);
    if (!code) {
      reject('unreadable');
      continue;
    }
    out.tags.push({
      id: code.id,
      corners: [0, 1, 2, 3].map((i) => corners[(i + code.turns) % 4]!) as FoundTag['corners'],
      ...centre,
      size,
      measured,
      errors: code.errors,
      contrast,
    });
  }
  return out;
}

/** A tag on the table, with its corners and how its size compares with the print. */
export interface TableTag extends TagReading {
  /** Its corners as printed, table XY */
  corners: Point[];
  /** Side as measured on the table over the side as printed */
  scale: number;
}

/**
 * A tag found in a picture, on the table. `toTable` says where a picture
 * pixel lies (table XY, y up) – for the photo map `mapPixel`, for the live
 * picture the camera calibration. The corners are carried over one by one,
 * so the picture's y running down is taken care of right there.
 */
export function tagOnTable(tag: FoundTag, toTable: (pixel: Point) => Point): TableTag {
  const corners = tag.corners.map(toTable) as [Point, Point, Point, Point];
  const pose = tagPose(corners);
  return {
    id: tag.id,
    x: pose.x,
    y: pose.y,
    angle: pose.angle,
    size: tag.size,
    corners,
    scale: pose.size / tag.size,
  };
}
