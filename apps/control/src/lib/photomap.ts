/**
 * The photo map: camera frames laid down where they were taken. The camera
 * position is known exactly (machine position + calibration), so frames are
 * placed, not stitched. Everything here is pure geometry; the canvases live
 * in the photomap store.
 */
import type { CameraCalibration, Point } from './camera';

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Share of the frame (each side) that is used; the edges are distorted by the lens. */
export const CROP = 0.7;
/** Neighbouring scan frames overlap by this share */
export const OVERLAP = 0.2;

/** Image pixel range of the central crop. */
export function cropRect(size: Size, crop = CROP): { u: number; v: number; w: number; h: number } {
  const w = size.width * crop;
  const h = size.height * crop;
  return { u: (size.width - w) / 2, v: (size.height - h) / 2, w, h };
}

/**
 * Affine transform image pixel → target pixel for `ctx.setTransform(a, b, c, d, e, f)`,
 * where the target maps machine XY to pixels by `k` px/mm with `left`/`top` at
 * pixel 0 (Y up in the machine, down on screen).
 */
export function imageTransform(
  c: CameraCalibration,
  spindle: Point,
  size: Size,
  target: { k: number; left: number; top: number },
): [number, number, number, number, number, number] {
  const r = (c.rotation * Math.PI) / 180;
  const { k, left, top } = target;
  const a = (k * Math.cos(r)) / c.pxPerMm;
  const cc = (k * Math.sin(r)) / c.pxPerMm;
  const b = -cc;
  const d = a;
  const cx = spindle.x + c.offsetX;
  const cy = spindle.y + c.offsetY;
  const e = k * (cx - left) - (a * size.width) / 2 - (cc * size.height) / 2;
  const f = k * (top - cy) - (b * size.width) / 2 - (d * size.height) / 2;
  return [a, b, cc, d, e, f];
}

/** Applies an affine transform to a point. */
export function applyTransform(
  m: readonly [number, number, number, number, number, number],
  p: Point,
): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Machine XY corners of the (cropped) frame, clockwise from the top left of the image. */
export function frameCorners(
  c: CameraCalibration,
  spindle: Point,
  size: Size,
  crop = CROP,
): [Point, Point, Point, Point] {
  // k = 1, left = 0, top = 0 gives (x, −y): flip back.
  const m = imageTransform(c, spindle, size, { k: 1, left: 0, top: 0 });
  const q = cropRect(size, crop);
  const corner = (u: number, v: number) => {
    const p = applyTransform(m, { x: u, y: v });
    return { x: p.x, y: -p.y };
  };
  return [
    corner(q.u, q.v),
    corner(q.u + q.w, q.v),
    corner(q.u + q.w, q.v + q.h),
    corner(q.u, q.v + q.h),
  ];
}

/** Axis-aligned box around points. */
export function boundsOf(points: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Union of two boxes; null counts as empty. */
export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Size in mm (machine X × Y) of the axis-aligned rectangle that fits inside
 * the cropped frame, however the camera is turned.
 */
export function visibleSize(c: CameraCalibration, size: Size, crop = CROP): Size {
  let w = (size.width * crop) / c.pxPerMm;
  let h = (size.height * crop) / c.pxPerMm;
  // Turned by more than 45° the frame lies the other way round.
  let deg = ((((c.rotation + 90) % 180) + 180) % 180) - 90;
  if (Math.abs(deg) > 45) {
    [w, h] = [h, w];
    deg -= Math.sign(deg) * 90;
  }
  const r = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const f = Math.min(w / (w * cos + h * sin), h / (w * sin + h * cos));
  return { width: w * f, height: h * f };
}

/** Evenly spaced centres so that frames of `frame` mm cover `from…to` with at most `step` apart. */
function centres(from: number, to: number, frame: number, step: number): number[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const span = hi - lo;
  if (span <= frame) return [(lo + hi) / 2];
  const first = lo + frame / 2;
  const last = hi - frame / 2;
  const n = Math.ceil((last - first) / step) + 1;
  return Array.from({ length: n }, (_, i) => first + ((last - first) * i) / (n - 1));
}

/**
 * Crosshair positions for scanning `area` (machine XY): a serpentine raster,
 * neighbours overlapping by `overlap`. A zero-height area gives one strip along X.
 */
export function planScan(area: Rect, visible: Size, overlap = OVERLAP): Point[] {
  const stepX = visible.width * (1 - overlap);
  const stepY = visible.height * (1 - overlap);
  const xs = centres(area.minX, area.maxX, visible.width, stepX);
  const ys = centres(area.minY, area.maxY, visible.height, stepY);
  const out: Point[] = [];
  ys.forEach((y, row) => {
    const line = row % 2 === 0 ? xs : [...xs].reverse();
    for (const x of line) out.push({ x, y });
  });
  return out;
}

/** Rough duration of a scan in seconds: travel at `feed` mm/min plus a pause per picture. */
export function estimateScan(
  points: readonly Point[],
  start: Point | null,
  feed: number,
  pauseMs: number,
): number {
  let mm = 0;
  let at = start ?? points[0] ?? null;
  for (const p of points) {
    if (at) mm += Math.hypot(p.x - at.x, p.y - at.y);
    at = p;
  }
  return (mm / Math.max(1, feed)) * 60 + (points.length * pauseMs) / 1000;
}

// ---------- chunks: the map is cut into square canvases ----------

/** Map resolution, px per mm (0.25 mm per pixel) */
export const MAP_PX_PER_MM = 4;
/** Side of one map chunk, px */
export const CHUNK_PX = 512;
/** Side of one map chunk, mm */
export const CHUNK_MM = CHUNK_PX / MAP_PX_PER_MM;

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/** Chunk indices a machine box touches. */
export function chunksFor(r: Rect, chunkMm = CHUNK_MM): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  for (let cx = Math.floor(r.minX / chunkMm); cx <= Math.floor(r.maxX / chunkMm); cx++) {
    for (let cy = Math.floor(r.minY / chunkMm); cy <= Math.floor(r.maxY / chunkMm); cy++) {
      out.push({ cx, cy });
    }
  }
  return out;
}

/** Machine box covered by a chunk. */
export function chunkRect(cx: number, cy: number, chunkMm = CHUNK_MM): Rect {
  return {
    minX: cx * chunkMm,
    minY: cy * chunkMm,
    maxX: (cx + 1) * chunkMm,
    maxY: (cy + 1) * chunkMm,
  };
}

// ---------- view: machine XY ↔ screen ----------

export interface MapView {
  /** Screen px per mm */
  scale: number;
  /** Screen position (CSS px) of machine X 0 / Y 0 */
  originX: number;
  originY: number;
}

export function toScreen(v: MapView, p: Point): Point {
  return { x: v.originX + p.x * v.scale, y: v.originY - p.y * v.scale };
}

export function toMachine(v: MapView, p: Point): Point {
  return { x: (p.x - v.originX) / v.scale, y: (v.originY - p.y) / v.scale };
}

/** Zooms by `factor` keeping the machine point under `at` (screen) in place. */
export function zoomAround(v: MapView, at: Point, factor: number, min = 0.05, max = 50): MapView {
  const m = toMachine(v, at);
  const scale = Math.min(max, Math.max(min, v.scale * factor));
  return { scale, originX: at.x - m.x * scale, originY: at.y + m.y * scale };
}

/** View that shows `r` inside a `size` screen with `margin` px around it. */
export function fitView(r: Rect, size: Size, margin = 24): MapView {
  const w = Math.max(r.maxX - r.minX, 1);
  const h = Math.max(r.maxY - r.minY, 1);
  const scale = Math.max(
    0.05,
    Math.min((size.width - 2 * margin) / w, (size.height - 2 * margin) / h),
  );
  const cx = (r.minX + r.maxX) / 2;
  const cy = (r.minY + r.maxY) / 2;
  return { scale, originX: size.width / 2 - cx * scale, originY: size.height / 2 + cy * scale };
}

/**
 * In-between view for gliding from `a` to `b` (t = 0…1) on a `size` screen:
 * the centre moves straight, the zoom changes evenly.
 */
export function blendView(a: MapView, b: MapView, t: number, size: Size): MapView {
  const centre = { x: size.width / 2, y: size.height / 2 };
  const ca = toMachine(a, centre);
  const cb = toMachine(b, centre);
  const x = ca.x + (cb.x - ca.x) * t;
  const y = ca.y + (cb.y - ca.y) * t;
  const scale = a.scale * (b.scale / a.scale) ** t;
  return { scale, originX: centre.x - x * scale, originY: centre.y + y * scale };
}
