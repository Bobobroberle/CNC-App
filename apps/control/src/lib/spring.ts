/**
 * Springs for UI motion, after Apple's "Designing Fluid Interfaces": a spring
 * starts from the value on screen and its current velocity, so any motion can
 * be grabbed or redirected at once. Two designer parameters instead of
 * mass/stiffness: damping ratio (1 = no overshoot) and response (seconds,
 * lower = snappier). Only visuals use this; nothing here moves the machine.
 */

export interface SpringConfig {
  /** 1 = critically damped (no overshoot), < 1 bounces */
  damping: number;
  /** Seconds to reach the target, roughly; not a fixed duration */
  response: number;
}

export const SPRINGS = {
  /** Default for anything that moves: calm, no overshoot */
  default: { damping: 1, response: 0.35 },
  /** Knobs returning home, drained progress bars */
  snappy: { damping: 1, response: 0.2 },
  /** Only after a gesture that carried momentum */
  momentum: { damping: 0.8, response: 0.35 },
} satisfies Record<string, SpringConfig>;

/** Scroll-like deceleration per millisecond (UIScrollView "normal"). */
export const DECELERATION = 0.998;

/** One step of a unit-mass spring towards `target` (semi-implicit Euler). */
export function springStep(
  x: number,
  v: number,
  target: number,
  config: SpringConfig,
  dt: number,
): [number, number] {
  const stiffness = ((2 * Math.PI) / config.response) ** 2;
  const friction = (4 * Math.PI * config.damping) / config.response;
  const a = -stiffness * (x - target) - friction * v;
  const nv = v + a * dt;
  return [x + nv * dt, nv];
}

/** Where a flick comes to rest, like scroll deceleration (px/s → px). */
export function project(velocity: number, rate = DECELERATION): number {
  return ((velocity / 1000) * rate) / (1 - rate);
}

/** Soft boundary: the further past the edge, the less the element follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** The operator asked the system for less motion. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type Schedule = (cb: (now: number) => void) => number;
type Cancel = (id: number) => void;

const raf: Schedule = (cb) => requestAnimationFrame(cb);
const caf: Cancel = (id) => cancelAnimationFrame(id);

/**
 * One animated number. `to()` retargets from the current value and velocity
 * (no jump when interrupted), `set()` jumps and stops, e.g. while a finger
 * drags the value 1:1.
 */
export class Spring {
  value: number;
  velocity = 0;
  private target: number;
  private config: SpringConfig = SPRINGS.default;
  private frame: number | null = null;
  private last = 0;

  constructor(
    value: number,
    private readonly onUpdate: (value: number) => void,
    private readonly schedule: Schedule = raf,
    private readonly cancel: Cancel = caf,
    private readonly reduce: () => boolean = reducedMotion,
  ) {
    this.value = value;
    this.target = value;
  }

  get running(): boolean {
    return this.frame !== null;
  }

  to(target: number, options: { config?: SpringConfig; velocity?: number } = {}) {
    this.target = target;
    if (options.config) this.config = options.config;
    if (options.velocity !== undefined) this.velocity = options.velocity;
    if (this.reduce()) {
      this.set(target);
      return;
    }
    if (this.frame === null) {
      this.last = -1;
      this.frame = this.schedule(this.tick);
    }
  }

  set(value: number) {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate(value);
  }

  stop() {
    if (this.frame !== null) this.cancel(this.frame);
    this.frame = null;
  }

  private tick = (now: number) => {
    // The first frame only takes the time; dt is capped after a stall.
    const dt = this.last < 0 ? 0 : Math.min(0.064, (now - this.last) / 1000);
    this.last = now;
    // 4 ms substeps keep stiff springs stable at any frame rate.
    const steps = Math.ceil(dt / 0.004);
    for (let i = 0; i < steps; i++) {
      [this.value, this.velocity] = springStep(
        this.value,
        this.velocity,
        this.target,
        this.config,
        dt / steps,
      );
    }
    const scale = Math.max(1, Math.abs(this.target));
    if (
      Math.abs(this.value - this.target) < 1e-3 * scale &&
      Math.abs(this.velocity) < 1e-2 * scale
    ) {
      this.frame = null;
      this.value = this.target;
      this.velocity = 0;
      this.onUpdate(this.value);
      return;
    }
    this.onUpdate(this.value);
    this.frame = this.schedule(this.tick);
  };
}

/** Recent pointer positions → release velocity in px/s (last 100 ms). */
export class VelocityTracker {
  private samples: { x: number; y: number; t: number }[] = [];

  add(x: number, y: number, t: number) {
    this.samples.push({ x, y, t });
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift();
  }

  reset() {
    this.samples = [];
  }

  velocity(now: number): { x: number; y: number } {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    // A finger that rested before lifting throws nothing.
    if (!first || !last || last === first || now - last.t > 60) return { x: 0, y: 0 };
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt } : { x: 0, y: 0 };
  }
}
