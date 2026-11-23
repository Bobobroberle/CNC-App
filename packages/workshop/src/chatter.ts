/**
 * Chatter detection from accelerometer samples: chatter shows up as a sharp
 * peak in the spectrum away from the spindle and tooth-pass frequencies.
 */

/** In-place radix-2 FFT; `re` and `im` must have a power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0)
    throw new RangeError('FFT length must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
}

/** Magnitude spectrum (bins 0…n/2) of the largest power-of-two prefix, mean removed, Hann window. */
export function spectrum(samples: readonly number[]): Float64Array {
  if (samples.length < 2) throw new RangeError('A spectrum needs at least 2 samples');
  let n = 1;
  while (n * 2 <= samples.length) n *= 2;
  const mean = samples.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = (samples[i]! - mean) * w;
  }
  fft(re, im);
  const out = new Float64Array(n / 2 + 1);
  for (let i = 0; i <= n / 2; i++) out[i] = Math.hypot(re[i]!, im[i]!);
  return out;
}

export interface ChatterOptions {
  /** Spindle speed, to ignore spindle and tooth-pass harmonics */
  rpm?: number;
  flutes?: number;
  /** Peak/median ratio from which a peak counts as chatter */
  ratio?: number;
  /** Below this RMS (in sample units) the machine is idle and nothing is reported */
  minRms?: number;
}

export interface ChatterResult {
  chatter: boolean;
  /** Frequency of the strongest non-harmonic peak, Hz */
  frequency: number;
  /** Its height relative to the median of the spectrum */
  ratio: number;
  rms: number;
}

/** Looks for a dominant vibration peak that is not a multiple of the spindle frequency. */
export function detectChatter(
  samples: readonly number[],
  sampleRate: number,
  options: ChatterOptions = {},
): ChatterResult {
  const threshold = options.ratio ?? 8;
  const minRms = options.minRms ?? 0.05;
  const none = (rms: number): ChatterResult => ({ chatter: false, frequency: 0, ratio: 0, rms });
  if (samples.length < 64) return none(0);
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const rms = Math.sqrt(samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length);
  if (rms < minRms) return none(rms);
  const spec = spectrum(samples);
  const n = (spec.length - 1) * 2;
  const binHz = sampleRate / n;
  const spindleHz = options.rpm ? options.rpm / 60 : 0;
  const isHarmonic = (hz: number) => {
    if (spindleHz <= 0) return false;
    const k = Math.round(hz / spindleHz);
    return k >= 1 && Math.abs(hz - k * spindleHz) <= Math.max(2 * binHz, hz * 0.02);
  };
  const sorted = [...spec.slice(1)].sort((a, b) => a - b);
  const median = Math.max(sorted[Math.floor(sorted.length / 2)]!, 1e-12);
  let best = 0;
  let bestBin = 0;
  for (let i = 2; i < spec.length; i++) {
    if (spec[i]! > best && !isHarmonic(i * binHz)) {
      best = spec[i]!;
      bestBin = i;
    }
  }
  const ratio = best / median;
  return {
    chatter: ratio >= threshold,
    frequency: Number((bestBin * binHz).toFixed(1)),
    ratio: Number(ratio.toFixed(2)),
    rms,
  };
}
