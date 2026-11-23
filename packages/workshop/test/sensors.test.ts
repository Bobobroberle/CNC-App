import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ADAPTIVE,
  detectChatter,
  fft,
  nextOverride,
  overrideSteps,
  spectrum,
} from '../src';

describe('adaptive feed', () => {
  const s = DEFAULT_ADAPTIVE;

  it('holds inside the deadband', () => {
    expect(nextOverride(100, 72, s)).toBe(100);
  });

  it('steps towards the target load, rate limited', () => {
    expect(nextOverride(100, 60, s)).toBe(105);
    expect(nextOverride(100, 66, { ...s, deadband: 2 })).toBe(102);
    expect(nextOverride(100, 95, s)).toBe(95);
  });

  it('stays within the user and FluidNC limits', () => {
    expect(nextOverride(119, 0, s)).toBe(120);
    expect(nextOverride(31, 100, s)).toBe(30);
    expect(nextOverride(195, 0, { ...s, maxOverride: 300 })).toBe(200);
    expect(nextOverride(12, 100, { ...s, minOverride: 0 })).toBe(10);
  });

  it('translates override changes to realtime steps', () => {
    expect(overrideSteps(100, 123)).toEqual(['+10', '+10', '+1', '+1', '+1']);
    expect(overrideSteps(100, 88)).toEqual(['-10', '-1', '-1']);
    expect(overrideSteps(150, 102)).toEqual(['reset', '+1', '+1']);
    expect(overrideSteps(70, 70)).toEqual([]);
  });
});

describe('spectrum', () => {
  it('transforms an impulse to a flat spectrum', () => {
    const re = new Float64Array([1, 0, 0, 0]);
    const im = new Float64Array(4);
    fft(re, im);
    expect([...re]).toEqual([1, 1, 1, 1]);
    expect(() => fft(new Float64Array(3), new Float64Array(3))).toThrow(RangeError);
    expect(() => fft(new Float64Array(4), new Float64Array(2))).toThrow(RangeError);
  });

  it('finds a sine at its bin', () => {
    const n = 256;
    const samples = Array.from({ length: n + 10 }, (_, i) => Math.sin((2 * Math.PI * 16 * i) / n));
    const spec = spectrum(samples);
    expect(spec.length).toBe(n / 2 + 1);
    let peak = 0;
    spec.forEach((v, i) => {
      if (v > spec[peak]!) peak = i;
    });
    expect(peak).toBe(16);
    expect(() => spectrum([1])).toThrow(RangeError);
  });
});

describe('chatter detection', () => {
  const rate = 1000;
  let seed = 1;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const signal = (hz: number, amp: number, n = 1024) =>
    Array.from(
      { length: n },
      (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate) + 0.1 * noise(),
    );

  it('ignores idle machines and short buffers', () => {
    expect(detectChatter([1, 2, 3], rate).chatter).toBe(false);
    const idle = detectChatter(new Array(256).fill(0.01), rate);
    expect(idle.chatter).toBe(false);
    expect(idle.rms).toBeLessThan(1e-9);
  });

  it('reports a strong peak away from the spindle harmonics', () => {
    const r = detectChatter(signal(187, 1), rate, { rpm: 6000, flutes: 2 });
    expect(r.chatter).toBe(true);
    expect(r.frequency).toBeCloseTo(187, -1);
  });

  it('does not report tooth-pass vibration', () => {
    // 6000 rpm, 2 flutes → 200 Hz tooth pass
    const r = detectChatter(signal(200, 1), rate, { rpm: 6000, flutes: 2 });
    expect(r.chatter).toBe(false);
  });

  it('reports noise as no chatter', () => {
    const r = detectChatter(
      Array.from({ length: 1024 }, () => noise()),
      rate,
      { ratio: 20 },
    );
    expect(r.chatter).toBe(false);
  });
});
