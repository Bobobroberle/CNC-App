import { detectChatter } from '@lowrider/workshop';

/**
 * Sensor data from the machine: spindle load (VFD over RS485, read by a
 * small script and pushed here) and accelerometer samples for chatter
 * detection. The companion analyses and fans out to all browsers.
 */
export interface SensorSample {
  /** Spindle load, percent */
  load?: number;
  /** Spindle speed actually measured, rpm */
  rpm?: number;
  /** Accelerometer block (one axis or magnitude) */
  accel?: number[];
  /** Sample rate of `accel`, Hz */
  sampleRate?: number;
}

export interface SensorState {
  at: number;
  load: number | null;
  rpm: number | null;
  chatter: boolean;
  chatterFrequency: number;
  vibration: number;
  source: string;
}

export function validateSample(value: unknown): SensorSample | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as SensorSample;
  const num = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v));
  if (!num(s.load) || !num(s.rpm) || !num(s.sampleRate)) return null;
  if (s.accel !== undefined) {
    if (
      !Array.isArray(s.accel) ||
      s.accel.length > 65536 ||
      !s.accel.every((v) => typeof v === 'number')
    ) {
      return null;
    }
    if (!(s.sampleRate! > 0)) return null;
  }
  return s;
}

export class SensorHub {
  private state: SensorState;
  private readonly listeners = new Set<(s: SensorState) => void>();

  constructor(source = 'push') {
    this.state = {
      at: 0,
      load: null,
      rpm: null,
      chatter: false,
      chatterFrequency: 0,
      vibration: 0,
      source,
    };
  }

  get current(): SensorState {
    return this.state;
  }

  push(sample: SensorSample, now = Date.now()): SensorState {
    const next: SensorState = { ...this.state, at: now };
    if (sample.load !== undefined) next.load = Math.max(0, Math.min(200, sample.load));
    if (sample.rpm !== undefined) next.rpm = sample.rpm;
    if (sample.accel && sample.accel.length >= 64) {
      const r = detectChatter(sample.accel, sample.sampleRate!, next.rpm ? { rpm: next.rpm } : {});
      next.chatter = r.chatter;
      next.chatterFrequency = r.frequency;
      next.vibration = Number(r.rms.toFixed(4));
    }
    this.state = next;
    for (const l of this.listeners) l(next);
    return next;
  }

  subscribe(listener: (s: SensorState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Simulated sensors for trying the UI without hardware: a load that wanders
 * around 55 % and every ~20 s a few seconds of chatter at 870 Hz.
 */
export function simulatedSample(t: number, random: () => number = Math.random): SensorSample {
  const rate = 2000;
  const rpm = 18000;
  const chatter = t % 20 > 16;
  const accel = Array.from({ length: 256 }, (_, i) => {
    const s = t + i / rate;
    const tooth = 0.3 * Math.sin(2 * Math.PI * (rpm / 60) * 2 * s);
    const ch = chatter ? 1.2 * Math.sin(2 * Math.PI * 870 * s) : 0;
    return tooth + ch + 0.05 * (random() - 0.5);
  });
  return {
    load: 55 + 12 * Math.sin(t / 7) + 4 * (random() - 0.5) + (chatter ? 15 : 0),
    rpm,
    accel,
    sampleRate: rate,
  };
}
