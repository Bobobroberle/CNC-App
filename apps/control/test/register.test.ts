import { describe, expect, it } from 'vitest';
import { registerShift, type GrayWindow } from '../src/lib/register';

/** A window made of a function of the pixel (x, y). */
function window(width: number, height: number, f: (x: number, y: number) => number): GrayWindow {
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) gray[y * width + x] = f(x, y);
  return { gray, valid: new Uint8Array(width * height).fill(1), width, height };
}

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A texture known between pixels: smooth noise of several scales, no repetition. */
function texture(x: number, y: number): number {
  const level = (scale: number, seed: number) => {
    const fx = x / scale + seed * 17.3;
    const fy = y / scale + seed * 9.1;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ax = (fx - ix) ** 2 * (3 - 2 * (fx - ix));
    const ay = (fy - iy) ** 2 * (3 - 2 * (fy - iy));
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a * (1 - ax) * (1 - ay) + b * ax * (1 - ay) + c * (1 - ax) * ay + d * ax * ay;
  };
  return 128 + 60 * level(9, 1) + 40 * level(4, 2) + 20 * level(2, 3);
}

describe('the shift of one window against another', () => {
  // cur(x, y) = ref(x + sx, y + sy): cur has to be moved by (sx, sy) to lie on ref
  const make = (sx: number, sy: number) => ({
    ref: window(160, 120, texture),
    cur: window(160, 120, (x, y) => texture(x + sx, y + sy)),
  });

  it('is found to a fraction of a pixel, in x and y, either way', () => {
    for (const [sx, sy] of [
      [0, 0],
      [3.4, -1.2],
      [-5.7, 2.3],
      [9, 0],
      [-9.5, -3],
    ] as const) {
      const { ref, cur } = make(sx, sy);
      const r = registerShift(ref, cur, 12, 5)!;
      expect(r, `${sx},${sy}`).not.toBeNull();
      expect(Math.abs(r.dx - sx), `${sx},${sy}`).toBeLessThan(0.25);
      expect(Math.abs(r.dy - sy), `${sx},${sy}`).toBeLessThan(0.25);
      expect(r.score).toBeGreaterThan(0.95);
      expect(r.margin).toBeGreaterThan(0.05);
      expect(r.overlap).toBeGreaterThan(1000);
    }
  });

  it('is found through a different brightness and a slow shade: the correlation does not care', () => {
    const ref = window(160, 120, texture);
    const cur = window(160, 120, (x, y) => 0.8 * texture(x + 4, y) + 20 + 0.15 * x);
    const r = registerShift(ref, cur, 12, 5)!;
    expect(Math.abs(r.dx - 4)).toBeLessThan(0.3);
  });

  it('is refused where there is nothing to see: a flat window, or two that have nothing in common', () => {
    const flat = window(160, 120, () => 130);
    expect(registerShift(flat, flat, 12, 5)).toBeNull();
    const noiseA = window(160, 120, (x, y) => 100 + 50 * hash(x, y));
    const noiseB = window(160, 120, (x, y) => 100 + 50 * hash(x + 500, y + 700));
    expect(registerShift(noiseA, noiseB, 12, 5)).toBeNull();
  });

  it('is refused where the shift is beyond the search – a peak at its edge may be only the nearest of the true one', () => {
    const { ref, cur } = make(14, 0);
    expect(registerShift(ref, cur, 12, 5)).toBeNull();
    const vertical = make(0, 7);
    expect(registerShift(vertical.ref, vertical.cur, 12, 5)).toBeNull();
  });

  it('is refused where the texture repeats within the search: the true shift and its neighbours are not told apart', () => {
    // stripes along x that vary a little along y too: a texture with no variation along y has no y to find
    const stripes = (x: number, y = 0) =>
      128 + 70 * Math.sin((x / 6) * 2 * Math.PI) + 25 * Math.sin(y / 3.1);
    const ref = window(160, 120, (x, y) => stripes(x, y));
    const cur = window(160, 120, (x, y) => stripes(x + 1, y));
    expect(registerShift(ref, cur, 14, 4)).toBeNull();
    // narrow enough to hold one period only: then it is found
    expect(Math.abs(registerShift(ref, cur, 2, 4)!.dx - 1)).toBeLessThan(0.3);
  });

  it('counts a shift that leaves little overlap as another answer, though it cannot win', () => {
    // a repeating texture; the true shift moves the windows' valid parts almost apart, a false one by a period brings them together
    const w = 120;
    const h = 60;
    const stripes = (x: number) => 128 + 70 * Math.sin((x / 8) * 2 * Math.PI);
    const ref = window(w, h, (x) => stripes(x));
    ref.valid.fill(0);
    const cur = window(w, h, (x) => stripes(x - 8 - 2));
    cur.valid.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 50; x++) ref.valid[y * w + x] = 1;
      for (let x = 70; x < w; x++) cur.valid[y * w + x] = 1;
    }
    // cur(x) = stripes(x - 10) = ref(x - 10) → shift −10 ≡ −2 (mod 8): both alike; only the weak one is in sight of the strict
    const r = registerShift(ref, cur, 24, 2, { minOverlap: 400, weak: 0.1 });
    expect(r).toBeNull();
  });

  it('is refused for windows of different sizes, or with too little left to compare', () => {
    expect(registerShift(window(100, 80, texture), window(90, 80, texture), 5, 5)).toBeNull();
    const small = window(20, 20, texture);
    expect(registerShift(small, small, 5, 5)).toBeNull();
    const ref = window(160, 120, texture);
    const cur = window(160, 120, texture);
    cur.valid.fill(0);
    expect(registerShift(ref, cur, 12, 5)).toBeNull();
  });
});
