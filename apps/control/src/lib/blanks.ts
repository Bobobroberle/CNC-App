import type { Point } from './camera';
import { otsu } from './markers';

/**
 * Finds blanks on a picture of the table – light pieces on the darker
 * spoilboard or the other way round – for engraving a series: each as one
 * closed, compact region with a clear border, with its centre, its size and
 * how it is turned. Deliberately strict, like the hole and corner finders:
 * a region that is cut off by the picture, that is not one compact shape
 * (two blanks touching) or that barely stands out is not a blank, and the
 * answer says why, so the operator can do something about it.
 *
 * Coordinates are picture pixels, x to the right and y down; pixel `i`
 * covers [i, i + 1), so the middle of the first pixel is 0.5. Angles are
 * given as the picture shows them with y up: counter-clockwise positive.
 */

export type BlankKind = 'rect' | 'square' | 'round' | 'other';

export interface BlankShape {
  kind: BlankKind;
  /** Centre, px */
  x: number;
  y: number;
  /** Long and short side, px; for a round blank its diameter, twice */
  length: number;
  width: number;
  /**
   * Direction of the long side, degrees counter-clockwise as seen (y up), in
   * (−90, 90]; of a side of a square in (−45, 45]. Null when the shape gives
   * no direction: a round blank, or one that is neither long nor square.
   */
  angle: number | null;
  /** Outline for drawing and for checking what fits: corners of a rectangle, else a polygon; px */
  outline: Point[];
  /** Difference between the blank's tone and the table's around it, grey levels */
  contrast: number;
}

/**
 * Why a region is not taken for a blank: it is cut off by the edge of the
 * picture (`border`), it is not one compact shape – two blanks touching, or
 * a shape with a notch (`touching`) – or its border is not clear (`faint`).
 */
export type RejectReason = 'border' | 'touching' | 'faint';

export interface RejectedRegion {
  reason: RejectReason;
  /** Middle of the region, px */
  x: number;
  y: number;
  /** Outline around all of it (its convex hull), px */
  outline: Point[];
}

export interface BlankSearch {
  blanks: BlankShape[];
  rejected: RejectedRegion[];
  /** The picture does not show two clear tones at all: nothing to find */
  flat: boolean;
}

export interface BlankOptions {
  /** 1 where the picture has a pixel, 0 where it has none (a photo map has gaps) */
  valid?: Uint8Array;
  /** Shortest side of a blank, px; smaller things are chips and specks (default 24) */
  minSide?: number;
  /** Least difference between the two tones, grey levels (default 30) */
  minContrast?: number;
}

/** The table's tone beside a blank is read this far from its border, px: clear of the soft rim */
const OUT = 4;
/** A blank fills at least this share of the convex shape around it */
const SOLIDITY = 0.9;
/** A rectangle fills at least this share of its box (rounded corners take a little away) */
const RECT_FILL = 0.9;
/** Sides closer than this in length make a square */
const SQUARE = 1.05;
/** A shape that is neither rectangle nor circle has a direction from this aspect on */
const LONG = 1.2;

interface Region {
  area: number;
  sx: number;
  sy: number;
  /** Sum of the grey values */
  tone: number;
  /** Cut off by the edge of the picture or by a gap in it */
  cut: boolean;
  /** Pixels of the region that touch the table tone */
  rim: number[];
  /** Enclosed pixels of the other tone (a hole, an earlier engraving) */
  holes: number;
  hx: number;
  hy: number;
}

/** Degrees folded into (−period/2, period/2]. */
function fold(deg: number, period: number): number {
  let a = deg % period;
  if (a > period / 2) a -= period;
  if (a <= -period / 2) a += period;
  return a;
}

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Convex hull (Andrew's monotone chain); the points come back in one sense of rotation. */
export function convexHull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) {
      lower.pop();
    }
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) {
      upper.pop();
    }
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function polygonArea(p: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]!;
    a += p[i]!.x * q.y - q.x * p[i]!.y;
  }
  return a / 2;
}

/** How deep a point lies inside a convex polygon: its distance to the nearest side, negative outside. */
function depthIn(hull: readonly Point[], sense: number, x: number, y: number, enough: number) {
  let depth = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const d = (sense * ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x))) / length;
    if (d < depth) depth = d;
    if (depth < enough) break;
  }
  return depth;
}

interface Box {
  /** Middle */
  x: number;
  y: number;
  /** Unit direction of the long side */
  ux: number;
  uy: number;
  /** Half of the long and of the short side */
  a: number;
  b: number;
}

/** The smallest rectangle around a convex polygon: one of its sides lies along a side of the polygon. */
export function smallestBox(hull: readonly Point[]): Box {
  let best: Box | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i]!;
    const q = hull[(i + 1) % hull.length]!;
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (length === 0) continue;
    const ux = (q.x - p.x) / length;
    const uy = (q.y - p.y) / length;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const h of hull) {
      const u = h.x * ux + h.y * uy;
      const v = -h.x * uy + h.y * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area >= bestArea) continue;
    bestArea = area;
    const cu = (minU + maxU) / 2;
    const cv = (minV + maxV) / 2;
    const centre = { x: cu * ux - cv * uy, y: cu * uy + cv * ux };
    const along = maxU - minU >= maxV - minV;
    best = {
      ...centre,
      ux: along ? ux : -uy,
      uy: along ? uy : ux,
      a: Math.max(maxU - minU, maxV - minV) / 2,
      b: Math.min(maxU - minU, maxV - minV) / 2,
    };
  }
  return best ?? { x: hull[0]?.x ?? 0, y: hull[0]?.y ?? 0, ux: 1, uy: 0, a: 0, b: 0 };
}

/** A straight line fitted through points: a point on it and its unit direction. */
function fitLine(points: readonly Point[]) {
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let sum = 0;
  for (const p of points) sum += ((p.x - mx) * dy - (p.y - my) * dx) ** 2;
  return { x: mx, y: my, dx, dy, rms: Math.sqrt(sum / points.length), count: points.length };
}

/** A circle fitted through points (least squares on x² + y² + Dx + Ey + F = 0). */
function fitCircle(points: readonly Point[]) {
  // Around the mean, so the sums stay small and the equations well behaved.
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;
  let suu = 0;
  let suv = 0;
  let svv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const p of points) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    suv += u * v;
    svv += v * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const p = (suuu + suvv) / 2;
  const q = (svvv + svuu) / 2;
  const cu = (p * svv - q * suv) / det;
  const cv = (q * suu - p * suv) / det;
  const r = Math.sqrt(cu * cu + cv * cv + (suu + svv) / points.length);
  const x = mx + cu;
  const y = my + cv;
  let sum = 0;
  for (const pt of points) sum += (Math.hypot(pt.x - x, pt.y - y) - r) ** 2;
  return { x, y, r, rms: Math.sqrt(sum / points.length) };
}

/** Where two lines meet; null when they run alongside each other. */
function meet(
  a: { x: number; y: number; dx: number; dy: number },
  b: { x: number; y: number; dx: number; dy: number },
): Point | null {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
  return { x: a.x + a.dx * t, y: a.y + a.dy * t };
}

/**
 * Mean of each pixel and its eight neighbours: the noise of a camera picture
 * and the fibres of the table must not fray the borders. Only pixels that
 * have a picture count, so the edge of the map does not darken what lies at it.
 */
function smooth(gray: Uint8Array, width: number, height: number, valid?: Uint8Array) {
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (valid && !valid[i]) continue;
      let sum = 0;
      let count = 0;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const j = ny * width + nx;
          if (valid && !valid[j]) continue;
          sum += gray[j]!;
          count++;
        }
      }
      out[i] = Math.round(sum / count);
    }
  }
  return out;
}

/** At most `most` points of a polygon, evenly picked. */
function thin(points: readonly Point[], most = 48): Point[] {
  if (points.length <= most) return [...points];
  return Array.from({ length: most }, (_, k) => points[Math.floor((k * points.length) / most)]!);
}

/**
 * The blanks on a grey picture, and the regions that look like one but are
 * refused, each with the reason.
 */
export function findBlanks(
  picture: Uint8Array,
  width: number,
  height: number,
  options: BlankOptions = {},
): BlankSearch {
  const { valid } = options;
  const gray = smooth(picture, width, height, valid);
  const minSide = options.minSide ?? 24;
  const minContrast = options.minContrast ?? 30;
  const n = width * height;
  const nothing = (flat: boolean): BlankSearch => ({ blanks: [], rejected: [], flat });

  // Two tones: the table and what lies on it.
  const shown = valid ? gray.filter((_, i) => valid[i] === 1) : gray;
  if (shown.length === 0) return nothing(true);
  const threshold = otsu(shown);
  let darkSum = 0;
  let darkCount = 0;
  let lightSum = 0;
  let lightCount = 0;
  for (const v of shown) {
    if (v > threshold) {
      lightSum += v;
      lightCount++;
    } else {
      darkSum += v;
      darkCount++;
    }
  }
  if (!darkCount || !lightCount || lightSum / lightCount - darkSum / darkCount < minContrast) {
    return nothing(true);
  }

  // The table is the tone the picture ends in; the blanks are the other one.
  const has = (i: number) => !valid || valid[i] === 1;
  let lightEdge = 0;
  let darkEdge = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!has(i)) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !has(i - 1) ||
        !has(i + 1) ||
        !has(i - width) ||
        !has(i + width);
      if (!edge) continue;
      if (gray[i]! > threshold) lightEdge++;
      else darkEdge++;
    }
  }
  const light = darkEdge >= lightEdge;
  const tableTone = light ? darkSum / darkCount : lightSum / lightCount;

  /** 1: the blanks' tone, 0: the table's, 2: no picture */
  const tone = new Uint8Array(n);
  for (let i = 0; i < n; i++) tone[i] = !has(i) ? 2 : gray[i]! > threshold === light ? 1 : 0;

  // Regions of the blanks' tone (pixels joined by their sides).
  /** Region number + 1 for the blanks' tone, −(number + 1) for patches of the table's tone */
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const regions: Region[] = [];
  for (let start = 0; start < n; start++) {
    if (tone[start] !== 1 || label[start] !== 0) continue;
    const r: Region = {
      area: 0,
      sx: 0,
      sy: 0,
      tone: 0,
      cut: false,
      rim: [],
      holes: 0,
      hx: 0,
      hy: 0,
    };
    regions.push(r);
    const id = regions.length;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    while (top > 0) {
      const i = stack[--top]!;
      const x = i % width;
      const y = (i - x) / width;
      r.area++;
      r.sx += x;
      r.sy += y;
      r.tone += gray[i]!;
      let onRim = false;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          r.cut = true;
          onRim = true;
          continue;
        }
        const j = ny * width + nx;
        if (tone[j] === 1) {
          if (label[j] === 0) {
            label[j] = id;
            stack[top++] = j;
          }
        } else {
          onRim = true;
          if (tone[j] === 2) r.cut = true;
        }
      }
      if (onRim) r.rim.push(i);
    }
  }

  // Patches of the table's tone (joined by sides and corners): one that reaches
  // the edge of the picture is the table itself, any other lies inside a region.
  const open: boolean[] = [];
  for (let start = 0; start < n; start++) {
    if (tone[start] !== 0 || label[start] !== 0) continue;
    const id = open.length;
    let reaches = false;
    let owner = 0;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let top = 0;
    stack[top++] = start;
    label[start] = -(id + 1);
    while (top > 0) {
      const i = stack[--top]!;
      const x = i % width;
      const y = (i - x) / width;
      area++;
      sx += x;
      sy += y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            reaches = true;
            continue;
          }
          const j = ny * width + nx;
          if (tone[j] === 2) reaches = true;
          else if (tone[j] === 1) owner ||= label[j]!;
          else if (label[j] === 0) {
            label[j] = -(id + 1);
            stack[top++] = j;
          }
        }
      }
    }
    open.push(reaches);
    const r = reaches ? undefined : regions[owner - 1];
    if (r) {
      r.holes += area;
      r.hx += sx;
      r.hy += sy;
    }
  }

  /** Grey value at a place between the pixels; NaN off the picture. */
  const at = (x: number, y: number): number => {
    const fx = x - 0.5;
    const fy = y - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) return NaN;
    const i = y0 * width + x0;
    if (valid && !(valid[i] && valid[i + 1] && valid[i + width] && valid[i + width + 1])) {
      return NaN;
    }
    const tx = fx - x0;
    const ty = fy - y0;
    return (
      (gray[i]! * (1 - tx) + gray[i + 1]! * tx) * (1 - ty) +
      (gray[i + width]! * (1 - tx) + gray[i + width + 1]! * tx) * ty
    );
  };
  /**
   * Where the picture goes from the blank's tone to the table's along a
   * line from `from` (inside) to `to`: at the level halfway between the two,
   * between the pixels. Null when it does not, or does not start inside.
   */
  const border = (
    x: number,
    y: number,
    dx: number,
    dy: number,
    from: number,
    to: number,
    level: number,
  ): Point | null => {
    const sign = light ? 1 : -1;
    const step = 0.5;
    let before = at(x + dx * from, y + dy * from);
    if (!((before - level) * sign > 0)) return null;
    for (let s = from + step; s <= to + 1e-9; s += step) {
      const v = at(x + dx * s, y + dy * s);
      if (Number.isNaN(v)) return null;
      if ((v - level) * sign <= 0) {
        const t = s - step + (step * (before - level)) / (before - v);
        return { x: x + dx * t, y: y + dy * t };
      }
      before = v;
    }
    return null;
  };

  const blanks: BlankShape[] = [];
  const rejected: RejectedRegion[] = [];
  for (const r of regions) {
    const filled = r.area + r.holes;
    // Chips, specks, the grain of the table.
    if (filled < 0.5 * minSide * minSide) continue;
    const corners: Point[] = [];
    for (const i of r.rim) {
      const x = i % width;
      const y = (i - x) / width;
      corners.push({ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 });
    }
    const hull = convexHull(corners);
    const box = smallestBox(hull);
    if (2 * box.b < minSide) continue;
    const refuse = (reason: RejectReason) =>
      rejected.push({ reason, x: box.x, y: box.y, outline: thin(hull) });
    if (r.cut) {
      refuse('border');
      continue;
    }

    // One compact shape: it fills the convex shape around it, and the table
    // does not reach deep into it (the gap between two blanks that touch).
    const hullArea = polygonArea(hull);
    const sense = Math.sign(hullArea);
    const deep = Math.max(3, 0.2 * box.b);
    const gap = r.rim.some((i) => {
      const x = i % width;
      const y = (i - x) / width;
      if (depthIn(hull, sense, x + 0.5, y + 0.5, deep) < deep) return false;
      // Deep inside and beside the table itself – not beside a hole of its own.
      return [i - 1, i + 1, i - width, i + width].some(
        (j) => tone[j] === 0 && open[-label[j]! - 1],
      );
    });
    if (filled / Math.abs(hullArea) < SOLIDITY || gap) {
      refuse('touching');
      continue;
    }

    // A clear border: the tone just outside against the tone inside.
    const inside = r.tone / r.area;
    let outSum = 0;
    let outCount = 0;
    for (const i of r.rim) {
      const x = i % width;
      const y = (i - x) / width;
      for (let k = 0; k < 4; k++) {
        const dx = k === 0 ? -1 : k === 1 ? 1 : 0;
        const dy = k === 2 ? -1 : k === 3 ? 1 : 0;
        if (tone[i + dx + dy * width] !== 0) continue;
        const ox = x + OUT * dx;
        const oy = y + OUT * dy;
        if (ox < 0 || oy < 0 || ox >= width || oy >= height) continue;
        const j = oy * width + ox;
        if (tone[j] !== 0) continue;
        outSum += gray[j]!;
        outCount++;
      }
    }
    const outside = outCount > 0 ? outSum / outCount : tableTone;
    const contrast = Math.abs(inside - outside);
    if (contrast < minContrast) {
      refuse('faint');
      continue;
    }
    const level = (inside + outside) / 2;
    const centroid = { x: (r.sx + r.hx) / filled + 0.5, y: (r.sy + r.hy) / filled + 0.5 };

    // Round: the border lies on a circle all the way round.
    const r0 = Math.sqrt(filled / Math.PI);
    const reach = Math.max(4, 0.2 * r0);
    const ring: Point[] = [];
    for (let k = 0; k < 72; k++) {
      const a = (k * Math.PI) / 36;
      const p = border(
        centroid.x,
        centroid.y,
        Math.cos(a),
        Math.sin(a),
        r0 - reach,
        r0 + reach,
        level,
      );
      if (p) ring.push(p);
    }
    const circle = ring.length === 72 ? fitCircle(ring) : null;
    if (circle && circle.rms <= Math.max(0.4, 0.012 * circle.r)) {
      blanks.push({
        kind: 'round',
        x: circle.x,
        y: circle.y,
        length: 2 * circle.r,
        width: 2 * circle.r,
        angle: null,
        outline: ring,
        contrast,
      });
      continue;
    }

    // A rectangle: four straight borders, opposite ones alongside each other, at right angles.
    const rect = fitRectangle(box, border, level);
    if (rect && filled / (rect.length * rect.width) >= RECT_FILL) {
      const square = rect.length / rect.width < SQUARE;
      blanks.push({
        kind: square ? 'square' : 'rect',
        x: rect.x,
        y: rect.y,
        length: rect.length,
        width: rect.width,
        angle: fold(rect.angle, square ? 90 : 180),
        outline: rect.corners,
        contrast,
      });
      continue;
    }

    // Any other compact shape: its middle, the box around it, and a direction if it is long.
    blanks.push({
      kind: 'other',
      x: centroid.x,
      y: centroid.y,
      length: 2 * box.a,
      width: 2 * box.b,
      angle:
        box.a / box.b >= LONG ? fold((-Math.atan2(box.uy, box.ux) * 180) / Math.PI, 180) : null,
      outline: thin(hull),
      contrast,
    });
  }
  return { blanks, rejected, flat: false };
}

/** Degrees between two directions of lines (0…90). */
function between(a: { dx: number; dy: number }, b: { dx: number; dy: number }): number {
  const dot = Math.min(1, Math.abs(a.dx * b.dx + a.dy * b.dy));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * The rectangle whose four borders the picture shows near a box: each side
 * is found between the pixels along its middle part (corners may be
 * rounded) and fitted with a line. Null when a side is not a clear straight
 * border or the four do not make a rectangle.
 */
function fitRectangle(
  box: Box,
  border: (
    x: number,
    y: number,
    dx: number,
    dy: number,
    from: number,
    to: number,
    level: number,
  ) => Point | null,
  level: number,
) {
  const { ux, uy } = box;
  const vx = -uy;
  const vy = ux;
  const reach = Math.max(4, 0.12 * box.b);
  /** A side: where its middle is, the way it runs, its half length, the way out of the blank */
  const sides = [
    { mx: box.x + vx * box.b, my: box.y + vy * box.b, dx: ux, dy: uy, half: box.a, nx: vx, ny: vy },
    {
      mx: box.x - vx * box.b,
      my: box.y - vy * box.b,
      dx: ux,
      dy: uy,
      half: box.a,
      nx: -vx,
      ny: -vy,
    },
    { mx: box.x + ux * box.a, my: box.y + uy * box.a, dx: vx, dy: vy, half: box.b, nx: ux, ny: uy },
    {
      mx: box.x - ux * box.a,
      my: box.y - uy * box.a,
      dx: vx,
      dy: vy,
      half: box.b,
      nx: -ux,
      ny: -uy,
    },
  ];
  const lines = sides.map((s) => {
    const count = Math.min(160, Math.max(8, Math.round(1.2 * s.half)));
    const found: Point[] = [];
    for (let k = 0; k < count; k++) {
      const t = (-0.6 + (1.2 * (k + 0.5)) / count) * s.half;
      const p = border(s.mx + s.dx * t, s.my + s.dy * t, s.nx, s.ny, -reach, reach, level);
      if (p) found.push(p);
    }
    if (found.length < 0.8 * count) return null;
    const line = fitLine(found);
    return line.rms <= 0.6 ? line : null;
  });
  const [l1, l2, s1, s2] = lines;
  if (!l1 || !l2 || !s1 || !s2) return null;
  if (between(l1, l2) > 1.5 || between(s1, s2) > 2.5) return null;
  if (Math.abs(90 - between(l1, s1)) > 2 || Math.abs(90 - between(l2, s2)) > 2) return null;
  const corners = [meet(l1, s1), meet(l1, s2), meet(l2, s2), meet(l2, s1)];
  if (corners.some((c) => c === null)) return null;
  const c = corners as Point[];
  // The long sides give the direction, the short ones (a quarter turn on) help by their length.
  let ax = 0;
  let ay = 0;
  for (const [line, quarter] of [
    [l1, false],
    [l2, false],
    [s1, true],
    [s2, true],
  ] as const) {
    let dx = quarter ? line.dy : line.dx;
    let dy = quarter ? -line.dx : line.dy;
    if (dx * ux + dy * uy < 0) {
      dx = -dx;
      dy = -dy;
    }
    ax += dx * line.count;
    ay += dy * line.count;
  }
  const norm = Math.hypot(ax, ay);
  const dx = ax / norm;
  const dy = ay / norm;
  return {
    x: (c[0]!.x + c[1]!.x + c[2]!.x + c[3]!.x) / 4,
    y: (c[0]!.y + c[1]!.y + c[2]!.y + c[3]!.y) / 4,
    length: Math.abs((s1.x - s2.x) * dx + (s1.y - s2.y) * dy),
    width: Math.abs(-(l1.x - l2.x) * dy + (l1.y - l2.y) * dx),
    // As the picture shows it with y up: counter-clockwise.
    angle: (-Math.atan2(dy, dx) * 180) / Math.PI,
    corners: c,
  };
}
