/**
 * Where does a camera frame lie against what is already known of the table? Two grey windows on the same raster –
 * the one the new frame would fill if it had been taken exactly where it was predicted, and the one of the
 * reference – are compared at every small shift; the shift where they agree best is the prediction's error.
 *
 * **Strict**: no clear peak, too little overlap, too little texture or a peak at the edge of the search all give
 * `null` – a frame is then left out, never guessed. Pure arrays; nothing here knows the machine.
 */

/** A window of grey values on a raster; `valid` marks the pixels that have something. */
export interface GrayWindow {
  gray: Float32Array;
  valid: Uint8Array;
  width: number;
  height: number;
}

export interface Registration {
  /** How far the new window must be moved to match the reference, px (x to the right, y down), sub-pixel */
  dx: number;
  dy: number;
  /** Normalised correlation at the peak, 0…1 */
  score: number;
  /** How far the peak stands above the best other one (outside its neighbourhood) */
  margin: number;
  /** Pixels compared at the peak */
  overlap: number;
}

export interface RegisterOptions {
  /** Least correlation at the peak */
  minScore?: number;
  /** Least distance of the peak above the next best one */
  minMargin?: number;
  /** Least number of pixels compared */
  minOverlap?: number;
  /** Least standard deviation of grey values in the overlap (both windows), grey levels */
  minStd?: number;
  /** Every n-th pixel is compared – speed */
  stride?: number;
  /** Peaks nearer than this (px) to the best one are its own slope, not another answer */
  exclude?: number;
  /**
   * Shifts that leave this share of `minOverlap` still count as *other answers* (they may not win, but they can
   * stop the best from standing clear): the true shift of a repeating texture may leave less overlap than a false one
   */
  weak?: number;
}

export const REGISTER_DEFAULTS = {
  minScore: 0.6,
  minMargin: 0.05,
  minOverlap: 1200,
  minStd: 3,
  stride: 2,
  exclude: 4,
  weak: 0.4,
} as const;

interface Cell {
  score: number;
  n: number;
}

/**
 * Shift of `cur` against `ref` within ±`searchX` × ±`searchY` whole pixels, refined to a fraction of a pixel;
 * null where there is no clear answer.
 */
export function registerShift(
  ref: GrayWindow,
  cur: GrayWindow,
  searchX: number,
  searchY: number,
  options: RegisterOptions = {},
): Registration | null {
  const { minScore, minMargin, minOverlap, minStd, stride, exclude, weak } = {
    ...REGISTER_DEFAULTS,
    ...options,
  };
  if (ref.width !== cur.width || ref.height !== cur.height) return null;
  const w = ref.width;
  const h = ref.height;
  const nx = 2 * searchX + 1;
  const ny = 2 * searchY + 1;
  const grid: Cell[] = new Array<Cell>(nx * ny);
  let best = -2;
  let bi = -1;
  for (let sy = -searchY; sy <= searchY; sy++) {
    for (let sx = -searchX; sx <= searchX; sx++) {
      // cur moved by (sx, sy): its pixel (x, y) lands on the reference's (x + sx, y + sy)
      let n = 0;
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      const y0 = Math.max(0, -sy);
      const y1 = Math.min(h, h - sy);
      const x0 = Math.max(0, -sx);
      const x1 = Math.min(w, w - sx);
      for (let y = y0; y < y1; y += stride) {
        const rowA = y * w;
        const rowB = (y + sy) * w + sx;
        for (let x = x0; x < x1; x += stride) {
          if (!cur.valid[rowA + x] || !ref.valid[rowB + x]) continue;
          const a = cur.gray[rowA + x]!;
          const b = ref.gray[rowB + x]!;
          n++;
          sa += a;
          sb += b;
          saa += a * a;
          sbb += b * b;
          sab += a * b;
        }
      }
      let score = -1;
      if (n >= (weak * minOverlap) / (stride * stride)) {
        const va = saa - (sa * sa) / n;
        const vb = sbb - (sb * sb) / n;
        // texture: the standard deviation of both windows over the overlap
        const floor = minStd * minStd * n;
        if (va > floor && vb > floor) score = (sab - (sa * sb) / n) / Math.sqrt(va * vb);
      }
      const i = (sy + searchY) * nx + (sx + searchX);
      grid[i] = { score, n };
      // only a shift that leaves enough overlap can win; a weaker one still counts as another answer
      if (score > best && n >= minOverlap / (stride * stride)) {
        best = score;
        bi = i;
      }
    }
  }
  if (bi < 0 || best < minScore) return null;
  const px = (bi % nx) - searchX;
  const py = Math.floor(bi / nx) - searchY;
  // a peak at the edge of the search: the true shift may lie beyond it
  if (Math.abs(px) === searchX || Math.abs(py) === searchY) return null;
  // the best other peak: outside the neighbourhood of this one
  let second = -2;
  for (let sy = -searchY; sy <= searchY; sy++) {
    for (let sx = -searchX; sx <= searchX; sx++) {
      if (Math.abs(sx - px) <= exclude && Math.abs(sy - py) <= exclude) continue;
      second = Math.max(second, grid[(sy + searchY) * nx + (sx + searchX)]!.score);
    }
  }
  const margin = best - Math.max(second, -1);
  if (margin < minMargin) return null;
  // sub-pixel: a parabola through the peak and its neighbours, along each axis
  const at = (sx: number, sy: number) => grid[(sy + searchY) * nx + (sx + searchX)]!.score;
  const refine = (a: number, b: number, c: number) => {
    const d = a - 2 * b + c;
    return d >= 0 || a < -1 || c < -1 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d));
  };
  return {
    dx: px + refine(at(px - 1, py), best, at(px + 1, py)),
    dy: py + refine(at(px, py - 1), best, at(px, py + 1)),
    score: best,
    margin,
    overlap: grid[bi]!.n * stride * stride,
  };
}
