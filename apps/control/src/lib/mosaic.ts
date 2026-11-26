/**
 * The photo map as pixels: camera frames laid onto a raster of the table, **blended** instead of cut and
 * pasted. Every frame counts the more the nearer a pixel lies to its middle (the edges are dark and
 * bent by the lens), pixels where several frames meet are the weighted mean – so the borders of the
 * frames vanish – and a frame's brightness is matched to what already lies there, with the vignette of
 * the camera taken out. Pure: arrays in, arrays out; the canvases that show it live in the store.
 */
import { CHUNK_PX, CROP, MAP_PX_PER_MM, chunkKey, type Rect } from './photomap';
import type { GrayWindow } from './register';

/** An affine map `[a, b, c, d, e, f]`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = readonly [number, number, number, number, number, number];

/** A camera frame: straight RGBA, row by row. */
export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Grey values to use in place of the colours' (what `highPassFrame` makes), one per pixel */
  gray?: Float32Array;
}

/** Inverse of an affine map, or null where it has none. */
export function invert(m: Affine): Affine | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Width of the fade at each side of a frame, as a share of the frame: what lies outside the trusted middle `CROP` */
export const RAMP = (1 - CROP) / 2;

/**
 * How much a pixel of a `width` × `height` frame counts: 1 over the trusted middle (`CROP` of each side – what the
 * scan plans its overlap with), falling smoothly to 0 over the rim outside it, where the lens bends and darkens the
 * picture. Neighbouring frames fade into one another over their rims and the overlap; and every point of the
 * scanned area lies in the middle of some frame, so it counts fully.
 */
export function edgeWeight(u: number, v: number, width: number, height: number): number {
  const tx = Math.min(u, width - u) / width / RAMP;
  const ty = Math.min(v, height - v) / height / RAMP;
  return smooth(tx) * smooth(ty);
}

/** Weights are raised to this power: the nearer to the trusted middle, the more it decides – content stays sharp. */
export const WEIGHT_POWER = 2;
/** Summed (powered) weight, stored as `S · SCALE` in 16 bits */
const SCALE = 4096;
const S_MAX = 60000 / SCALE;
/**
 * Summed (powered) weight at which a pixel is fully covered (alpha 255); less fades out – the rim of the scanned
 * area. Half a frame's trusted weight: the whole trusted middle of any frame passes, its rim fades.
 */
export const COVERED = 0.5;
/**
 * How much earlier pictures weigh against a newer one at most: a picture of the same place taken later takes over
 * within a few frames (a clamp moved, a part taken away) instead of being averaged with all that came before.
 */
export const MEMORY = 2;

/** One square piece of the map. */
export interface MosaicChunk {
  cx: number;
  cy: number;
  /** Straight RGBA; alpha says how well covered a pixel is */
  rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Summed powered weights × SCALE */
  sum: Uint16Array;
  /** Last use, for eviction */
  used: number;
}

/** A gain over the frame (camera vignette), on a coarse grid; multiplies the colours. */
export interface GainMap {
  width: number;
  height: number;
  gain: Float32Array;
}

/** Bilinear read of a gain map at frame pixel (u, v). */
export function gainAt(map: GainMap, u: number, v: number, w: number, h: number): number {
  const x = Math.min(map.width - 1, Math.max(0, (u / w) * map.width - 0.5));
  const y = Math.min(map.height - 1, Math.max(0, (v / h) * map.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(map.width - 1, x0 + 1);
  const y1 = Math.min(map.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const g = map.gain;
  const top = g[y0 * map.width + x0]! * (1 - fx) + g[y0 * map.width + x1]! * fx;
  const bottom = g[y1 * map.width + x0]! * (1 - fx) + g[y1 * map.width + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

export interface PasteOptions {
  /** Brightness factor for the whole frame (1 = as taken) */
  gain?: number;
  /** The camera's vignette to take out */
  flat?: GainMap | null;
  /** The exponent of the weights (sharper the higher) */
  power?: number;
}

/** Global map pixel of the top-left corner of a chunk (Y down: machine Y up). */
export function chunkOrigin(cx: number, cy: number): { x: number; y: number } {
  return { x: cx * CHUNK_PX, y: -(cy + 1) * CHUNK_PX };
}

/** Chunk indices a global-pixel box touches. */
function chunksOf(minX: number, minY: number, maxX: number, maxY: number) {
  const out: { cx: number; cy: number }[] = [];
  const cx0 = Math.floor(minX / CHUNK_PX);
  const cx1 = Math.floor(maxX / CHUNK_PX);
  // global y runs down: chunk row cy covers [−(cy+1)·CHUNK_PX, −cy·CHUNK_PX)
  const cy0 = Math.floor(-maxY / CHUNK_PX);
  const cy1 = Math.floor(-minY / CHUNK_PX);
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) out.push({ cx, cy });
  return out;
}

export class Mosaic {
  readonly chunks = new Map<string, MosaicChunk>();
  private counter = 0;

  /** The chunk, made empty on first use. */
  chunk(cx: number, cy: number, create = true): MosaicChunk | null {
    const key = chunkKey(cx, cy);
    let c = this.chunks.get(key);
    if (!c) {
      if (!create) return null;
      c = {
        cx,
        cy,
        rgba: new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4),
        sum: new Uint16Array(CHUNK_PX * CHUNK_PX),
        used: 0,
      };
      this.chunks.set(key, c);
    }
    c.used = ++this.counter;
    return c;
  }

  clear() {
    this.chunks.clear();
  }

  /** Drops the chunks used least recently until `max` are left. */
  evict(max: number): string[] {
    const gone: string[] = [];
    while (this.chunks.size > max) {
      let oldest: [string, MosaicChunk] | null = null;
      for (const entry of this.chunks)
        if (!oldest || entry[1].used < oldest[1].used) oldest = entry;
      this.chunks.delete(oldest![0]);
      gone.push(oldest![0]);
    }
    return gone;
  }

  /** Summed weight and colour at a global map pixel, or null where nothing lies. */
  at(gx: number, gy: number): { r: number; g: number; b: number; sum: number } | null {
    // the pixel first: a point just above a chunk's top row belongs to the chunk above, whatever the fraction
    const px = Math.floor(gx);
    const py = Math.floor(gy);
    const cx = Math.floor(px / CHUNK_PX);
    const cy = Math.floor(-(py + 1) / CHUNK_PX);
    const c = this.chunks.get(chunkKey(cx, cy));
    if (!c) return null;
    const o = chunkOrigin(cx, cy);
    const i = (py - o.y) * CHUNK_PX + (px - o.x);
    if (!c.sum[i]) return null;
    return {
      r: c.rgba[i * 4]!,
      g: c.rgba[i * 4 + 1]!,
      b: c.rgba[i * 4 + 2]!,
      sum: c.sum[i]! / SCALE,
    };
  }

  /**
   * Lays a frame onto the map. `m` maps frame pixels to global map pixels (`imageTransform` with the map's raster).
   * Returns the chunks it touched (to redraw), or none where the frame cannot be placed.
   */
  paste(frame: Frame, m: Affine, options: PasteOptions = {}): MosaicChunk[] {
    const inv = invert(m);
    if (!inv) return [];
    const { width: w, height: h, data } = frame;
    const power = options.power ?? WEIGHT_POWER;
    const gain = options.gain ?? 1;
    const flat = options.flat ?? null;
    const corners = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ].map(([u, v]) => ({ x: m[0] * u! + m[2] * v! + m[4], y: m[1] * u! + m[3] * v! + m[5] }));
    const minX = Math.floor(Math.min(...corners.map((p) => p.x)));
    const maxX = Math.ceil(Math.max(...corners.map((p) => p.x)));
    const minY = Math.floor(Math.min(...corners.map((p) => p.y)));
    const maxY = Math.ceil(Math.max(...corners.map((p) => p.y)));
    const touched: MosaicChunk[] = [];
    for (const { cx, cy } of chunksOf(minX, minY, maxX, maxY)) {
      const c = this.chunk(cx, cy)!;
      const o = chunkOrigin(cx, cy);
      const x0 = Math.max(minX, o.x);
      const x1 = Math.min(maxX, o.x + CHUNK_PX - 1);
      const y0 = Math.max(minY, o.y);
      const y1 = Math.min(maxY, o.y + CHUNK_PX - 1);
      let any = false;
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const u = inv[0] * (gx + 0.5) + inv[2] * (gy + 0.5) + inv[4];
          const v = inv[1] * (gx + 0.5) + inv[3] * (gy + 0.5) + inv[5];
          if (u < 0.5 || v < 0.5 || u > w - 0.5 || v > h - 0.5) continue;
          const wt = edgeWeight(u, v, w, h) ** power;
          if (wt < 1e-4) continue;
          // bilinear colour
          const fu = u - 0.5;
          const fv = v - 0.5;
          const iu = Math.floor(fu);
          const iv = Math.floor(fv);
          const au = fu - iu;
          const av = fv - iv;
          const iu1 = Math.min(iu + 1, w - 1);
          const iv1 = Math.min(iv + 1, h - 1);
          const p00 = (iv * w + iu) * 4;
          const p10 = (iv * w + iu1) * 4;
          const p01 = (iv1 * w + iu) * 4;
          const p11 = (iv1 * w + iu1) * 4;
          const k = gain * (flat ? gainAt(flat, u, v, w, h) : 1);
          const i = (gy - o.y) * CHUNK_PX + (gx - o.x);
          const s0 = c.sum[i]! / SCALE;
          const s1 = Math.min(S_MAX, s0 + wt);
          const share = wt / (Math.min(s0, MEMORY) + wt);
          for (let ch = 0; ch < 3; ch++) {
            const top = data[p00 + ch]! * (1 - au) + data[p10 + ch]! * au;
            const bottom = data[p01 + ch]! * (1 - au) + data[p11 + ch]! * au;
            const colour = (top * (1 - av) + bottom * av) * k;
            const old = c.rgba[i * 4 + ch]!;
            c.rgba[i * 4 + ch] = s0 === 0 ? colour : old + (colour - old) * share;
          }
          c.sum[i] = Math.round(s1 * SCALE);
          c.rgba[i * 4 + 3] = Math.min(255, Math.round((s1 / COVERED) * 255));
          any = true;
        }
      }
      if (any) touched.push(c);
    }
    return touched;
  }

  /**
   * How bright a frame is against what already lies on the map where they overlap: the factor that makes it match,
   * 1 where they hardly meet. Taken from a sparse grid of the frame.
   */
  matchGain(frame: Frame, m: Affine, flat: GainMap | null = null, limit = 0.2): number {
    const { width: w, height: h, data } = frame;
    let onMap = 0;
    let onFrame = 0;
    let n = 0;
    const step = Math.max(2, Math.round(Math.min(w, h) / 60));
    for (let v = step / 2; v < h; v += step) {
      for (let u = step / 2; u < w; u += step) {
        if (edgeWeight(u, v, w, h) < 0.9) continue;
        const gx = m[0] * u + m[2] * v + m[4];
        const gy = m[1] * u + m[3] * v + m[5];
        const there = this.at(gx, gy);
        // Only where the map is well covered by what lies there
        if (!there || there.sum < COVERED) continue;
        const i = (Math.floor(v) * w + Math.floor(u)) * 4;
        const k = flat ? gainAt(flat, u, v, w, h) : 1;
        const lumFrame = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) / 256;
        const lumMap = (there.r * 77 + there.g * 150 + there.b * 29) / 256;
        onFrame += lumFrame * k;
        onMap += lumMap;
        n++;
      }
    }
    if (n < 40 || onFrame < 1) return 1;
    return Math.min(1 + limit, Math.max(1 - limit, onMap / onFrame));
  }

  /** The map's box in global pixels, or null when empty. */
  box(): Rect | null {
    let r: Rect | null = null;
    for (const c of this.chunks.values()) {
      const o = chunkOrigin(c.cx, c.cy);
      const box = { minX: o.x, minY: o.y, maxX: o.x + CHUNK_PX, maxY: o.y + CHUNK_PX };
      r = r
        ? {
            minX: Math.min(r.minX, box.minX),
            minY: Math.min(r.minY, box.minY),
            maxX: Math.max(r.maxX, box.maxX),
            maxY: Math.max(r.maxY, box.maxY),
          }
        : box;
    }
    return r;
  }
}

/** Global map pixel of a machine point (the map's raster: `MAP_PX_PER_MM`, Y down). */
export function toMapPixel(
  p: { x: number; y: number },
  k = MAP_PX_PER_MM,
): { x: number; y: number } {
  return { x: p.x * k, y: -p.y * k };
}

/** A box of the map raster, px: the top-left pixel and the size */
export interface PixelBox {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/**
 * The grey values a frame lays over a box of the map raster, sampled every `step` pixels, where it counts fully
 * (its trusted middle) – the window a registration compares. `gain` and `flat` are as in `paste`.
 */
export function frameWindow(
  frame: Frame,
  m: Affine,
  box: PixelBox,
  step = 1,
  gain = 1,
  flat: GainMap | null = null,
): GrayWindow {
  const width = Math.max(1, Math.ceil(box.width / step));
  const height = Math.max(1, Math.ceil(box.height / step));
  const gray = new Float32Array(width * height);
  const valid = new Uint8Array(width * height);
  const inv = invert(m);
  if (!inv) return { gray, valid, width, height };
  const { width: w, height: h, data } = frame;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const gx = box.x0 + (i + 0.5) * step;
      const gy = box.y0 + (j + 0.5) * step;
      const u = inv[0] * gx + inv[2] * gy + inv[4];
      const v = inv[1] * gx + inv[3] * gy + inv[5];
      if (u < 0.5 || v < 0.5 || u > w - 0.5 || v > h - 0.5) continue;
      if (edgeWeight(u, v, w, h) < 0.95) continue;
      const fu = u - 0.5;
      const fv = v - 0.5;
      const iu = Math.floor(fu);
      const iv = Math.floor(fv);
      const au = fu - iu;
      const av = fv - iv;
      const iu1 = Math.min(iu + 1, w - 1);
      const iv1 = Math.min(iv + 1, h - 1);
      const lumAt = (x: number, y: number) => {
        if (frame.gray) return frame.gray[y * w + x]!;
        const o = (y * w + x) * 4;
        return (data[o]! * 77 + data[o + 1]! * 150 + data[o + 2]! * 29) / 256;
      };
      const top = lumAt(iu, iv) * (1 - au) + lumAt(iu1, iv) * au;
      const bottom = lumAt(iu, iv1) * (1 - au) + lumAt(iu1, iv1) * au;
      gray[j * width + i] =
        (top * (1 - av) + bottom * av) * gain * (flat ? gainAt(flat, u, v, w, h) : 1);
      valid[j * width + i] = 1;
    }
  }
  return { gray, valid, width, height };
}

/**
 * The frame with its slow changes taken out: every pixel's grey value minus the mean over the `radius` pixels
 * around it. A vignette, a brightness that differs from frame to frame and the shade of a board are all slow – what
 * is left is the texture, which two frames of one place share and on which a shift between them is measured.
 * Made of the whole frame, so it does not depend on which part of it a comparison happens to use.
 */
export function highPassFrame(frame: Frame, radius: number): Frame {
  const { width: w, height: h, data } = frame;
  const stride = w + 1;
  const sum = new Float64Array(stride * (h + 1));
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const l = (data[o]! * 77 + data[o + 1]! * 150 + data[o + 2]! * 29) / 256;
      lum[y * w + x] = l;
      row += l;
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1]! + row;
    }
  }
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const n = (x1 - x0) * (y1 - y0);
      const s =
        sum[y1 * stride + x1]! -
        sum[y0 * stride + x1]! -
        sum[y1 * stride + x0]! +
        sum[y0 * stride + x0]!;
      gray[y * w + x] = lum[y * w + x]! - s / n;
    }
  }
  return { data, width: w, height: h, gray };
}

/** The box of the map raster that a frame's trusted middle covers. */
export function trustedBox(frame: Frame, m: Affine): PixelBox {
  const { width: w, height: h } = frame;
  const corners = [
    [w * RAMP, h * RAMP],
    [w * (1 - RAMP), h * RAMP],
    [w * (1 - RAMP), h * (1 - RAMP)],
    [w * RAMP, h * (1 - RAMP)],
  ].map(([u, v]) => ({ x: m[0] * u! + m[2] * v! + m[4], y: m[1] * u! + m[3] * v! + m[5] }));
  const x0 = Math.floor(Math.min(...corners.map((p) => p.x)));
  const y0 = Math.floor(Math.min(...corners.map((p) => p.y)));
  return {
    x0,
    y0,
    width: Math.ceil(Math.max(...corners.map((p) => p.x))) - x0,
    height: Math.ceil(Math.max(...corners.map((p) => p.y))) - y0,
  };
}

// ---------- the camera's vignette ----------

/** Grid the frames are read on */
const FLAT_W = 32;
const FLAT_H = 24;
/** Rings of the radial profile */
const RINGS = 24;
/** Frames needed before the estimate counts fully */
export const FLAT_FRAMES = 24;
/** The most the vignette is taken out: more is the scene, not the lens */
const MAX_FLAT_GAIN = 1.6;

/**
 * Learns the vignette of the camera – the corners are darker than the middle – from the frames themselves. A lens
 * darkens by the distance from the middle of the picture, so only that is learned: the mean brightness of every
 * ring around the middle, relative to the frame's own mean, over many frames of different places on the table,
 * made to fall from the middle outwards and never to rise. What is the table averages out; and an edge of the
 * board, bright at one side of every frame and dark at the other, cancels in a ring – it cannot become a gradient
 * across the picture, as a gain per cell would have made of it.
 */
export class FlatField {
  private readonly ring = new Float64Array(RINGS);
  private readonly count_ = new Float64Array(RINGS);
  private frames = 0;
  private shape = { w: 4, h: 3 };
  private cached: GainMap | null = null;

  get count() {
    return this.frames;
  }

  reset() {
    this.ring.fill(0);
    this.count_.fill(0);
    this.frames = 0;
    this.cached = null;
  }

  add(frame: Frame) {
    const { width: w, height: h, data } = frame;
    this.shape = { w, h };
    const cell = new Float64Array(FLAT_W * FLAT_H);
    const n = new Uint32Array(FLAT_W * FLAT_H);
    const step = Math.max(1, Math.round(Math.min(w, h) / 120));
    let total = 0;
    let all = 0;
    for (let y = 0; y < h; y += step) {
      const row = Math.min(FLAT_H - 1, Math.floor((y / h) * FLAT_H));
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const lum = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) / 256;
        const j = row * FLAT_W + Math.min(FLAT_W - 1, Math.floor((x / w) * FLAT_W));
        cell[j]! += lum;
        n[j]!++;
        total += lum;
        all++;
      }
    }
    const mean = total / Math.max(1, all);
    if (mean < 8) return;
    for (let j = 0; j < cell.length; j++) {
      if (!n[j]) continue;
      const k = ringOf(j % FLAT_W, Math.floor(j / FLAT_W), w, h);
      this.ring[k]! += cell[j]! / n[j]! / mean;
      this.count_[k]!++;
    }
    this.frames++;
    this.cached = null;
  }

  /** The gain that takes the vignette out, or null while too few frames are known. */
  gainMap(): GainMap | null {
    if (this.frames < 6) return null;
    if (this.cached) return this.cached;
    const profile = Float64Array.from(this.ring, (s, k) =>
      this.count_[k] ? s / this.count_[k]! : NaN,
    );
    // rings with nothing in them (the far corner of a narrow picture) take their neighbour's
    for (let k = 1; k < RINGS; k++) if (Number.isNaN(profile[k]!)) profile[k] = profile[k - 1]!;
    if (Number.isNaN(profile[0]!)) return null;
    // from the middle outwards the light only falls: a ring brighter than the one inside it is the scene
    for (let k = 1; k < RINGS; k++) profile[k] = Math.min(profile[k]!, profile[k - 1]!);
    const trust = Math.min(1, this.frames / FLAT_FRAMES);
    const gain = new Float32Array(FLAT_W * FLAT_H);
    for (let y = 0; y < FLAT_H; y++) {
      for (let x = 0; x < FLAT_W; x++) {
        const g = Math.min(
          MAX_FLAT_GAIN,
          Math.max(
            1,
            profile[0]! / Math.max(0.05, profile[ringOf(x, y, this.shape.w, this.shape.h)]!),
          ),
        );
        gain[y * FLAT_W + x] = 1 + (g - 1) * trust;
      }
    }
    this.cached = { width: FLAT_W, height: FLAT_H, gain };
    return this.cached;
  }
}

/** The ring (0 = middle, `RINGS` − 1 = corner) of a cell of the grid, by its distance from the middle in pixels. */
function ringOf(cx: number, cy: number, w: number, h: number): number {
  const dx = ((cx + 0.5) / FLAT_W - 0.5) * w;
  const dy = ((cy + 0.5) / FLAT_H - 0.5) * h;
  const r = Math.hypot(dx, dy) / (Math.hypot(w, h) / 2);
  return Math.min(RINGS - 1, Math.floor(r * RINGS));
}
