import type { CameraCalibration } from '../src/lib/camera';
import type { Frame } from '../src/lib/mosaic';
import { applyTransform, imageTransform } from '../src/lib/photomap';

/**
 * A made-up table for the tests of the photo map: a texture with features of several sizes (wood-like), known at
 * every machine point, and a camera that photographs it with a vignette and a brightness of its own.
 */
function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const ax = smooth(fx - ix);
  const ay = smooth(fy - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a * (1 - ax) * (1 - ay) + b * ax * (1 - ay) + c * (1 - ax) * ay + d * ax * ay;
}

/** The table at machine point (x, y) mm: RGB. */
export function world(x: number, y: number): [number, number, number] {
  const n =
    0.45 * valueNoise(x, y, 14, 1) + 0.35 * valueNoise(x, y, 5, 2) + 0.2 * valueNoise(x, y, 2, 3);
  const lum = 70 + 140 * n;
  return [lum + 18, lum * 0.86 + 8, lum * 0.66];
}

export function lum([r, g, b]: [number, number, number]): number {
  return (r * 77 + g * 150 + b * 29) / 256;
}

export interface Shot {
  /** Darkening towards the corners: 0 none, 0.4 strong */
  vignette?: number;
  /** Brightness of this picture */
  exposure?: number;
}

export function renderFrame(
  cal: CameraCalibration,
  spindle: { x: number; y: number },
  size: { width: number; height: number },
  shot: Shot = {},
  table: (x: number, y: number) => [number, number, number] = world,
): Frame {
  const { width: w, height: h } = size;
  const data = new Uint8ClampedArray(w * h * 4);
  const m = imageTransform(cal, spindle, size, { k: 1, left: 0, top: 0 });
  const v = shot.vignette ?? 0;
  const e = shot.exposure ?? 1;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = applyTransform(m, { x: i + 0.5, y: j + 0.5 });
      // image transform with k = 1 and top = 0 gives (x, −y)
      const [r, g, b] = table(p.x, -p.y);
      const dx = i + 0.5 - w / 2;
      const dy = j + 0.5 - h / 2;
      const dark = 1 - v * ((dx * dx + dy * dy) / ((w * w + h * h) / 4));
      const k = dark * e;
      const o = (j * w + i) * 4;
      data[o] = r * k;
      data[o + 1] = g * k;
      data[o + 2] = b * k;
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}
