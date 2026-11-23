import { describe, expect, it } from 'vitest';
import { blendViewport, screenToWorld } from '../src/render/draw';
import {
  SPRINGS,
  Spring,
  VelocityTracker,
  project,
  rubberband,
  springStep,
} from '../src/lib/spring';

/** Runs a spring on a fake 60 Hz clock. */
function clock() {
  let queued: ((now: number) => void) | null = null;
  let now = 0;
  return {
    schedule: (cb: (now: number) => void) => {
      queued = cb;
      return 1;
    },
    cancel: () => {
      queued = null;
    },
    run(frames: number) {
      for (let i = 0; i < frames && queued; i++) {
        const cb = queued;
        queued = null;
        cb(now);
        now += 1000 / 60;
      }
    },
    get idle() {
      return queued === null;
    },
  };
}

describe('spring', () => {
  it('settles critically damped without overshoot', () => {
    let [x, v] = [0, 0];
    let max = 0;
    for (let i = 0; i < 600; i++) {
      [x, v] = springStep(x, v, 100, SPRINGS.default, 0.004);
      max = Math.max(max, x);
    }
    expect(x).toBeCloseTo(100, 1);
    expect(max).toBeLessThanOrEqual(100.001);
  });

  it('overshoots when under-damped', () => {
    let [x, v] = [0, 0];
    let max = 0;
    for (let i = 0; i < 600; i++) {
      [x, v] = springStep(x, v, 100, SPRINGS.momentum, 0.004);
      max = Math.max(max, x);
    }
    expect(max).toBeGreaterThan(100.5);
  });

  it('retargets from the current value and velocity, and stops when settled', () => {
    const c = clock();
    const seen: number[] = [];
    const s = new Spring(
      0,
      (v) => seen.push(v),
      c.schedule,
      c.cancel,
      () => false,
    );
    s.to(100);
    c.run(6);
    const mid = s.value;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    s.to(0); // interrupted: continues from mid, no jump
    c.run(1);
    expect(Math.abs(s.value - mid)).toBeLessThan(20);
    c.run(200);
    expect(c.idle).toBe(true);
    expect(s.running).toBe(false);
    expect(seen.at(-1)).toBe(0);
  });

  it('jumps instead of moving when less motion is asked for', () => {
    const c = clock();
    const seen: number[] = [];
    const s = new Spring(
      0,
      (v) => seen.push(v),
      c.schedule,
      c.cancel,
      () => true,
    );
    s.to(50, { velocity: 400, config: SPRINGS.snappy });
    expect(seen).toEqual([50]);
    expect(c.idle).toBe(true);
  });
});

describe('gesture helpers', () => {
  it('projects a flick like scroll deceleration', () => {
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(-1000, 0.99)).toBeCloseTo(-99, 0);
  });

  it('resists progressively past a boundary', () => {
    expect(rubberband(0, 60)).toBe(0);
    expect(rubberband(30, 60)).toBeLessThan(30);
    expect(rubberband(300, 60)).toBeLessThan(60 * 1);
    expect(rubberband(-30, 60)).toBe(-rubberband(30, 60));
  });

  it('measures the release velocity over the last 100 ms', () => {
    const v = new VelocityTracker();
    expect(v.velocity(0)).toEqual({ x: 0, y: 0 });
    v.add(0, 0, 0);
    v.add(100, 0, 200); // the old sample drops out except for the last two
    v.add(110, 5, 210);
    expect(v.velocity(215).x).toBeCloseTo(1000, 0);
    expect(v.velocity(400)).toEqual({ x: 0, y: 0 }); // rested before lifting
    v.reset();
    v.add(1, 1, 5);
    v.add(1, 1, 5);
    expect(v.velocity(5)).toEqual({ x: 0, y: 0 });
  });
});

describe('fit glide', () => {
  it('moves the centre straight and zooms evenly', () => {
    const a = { width: 200, height: 100, dpr: 1, scale: 1, originX: 100, originY: 50 };
    const b = { width: 200, height: 100, dpr: 1, scale: 4, originX: -300, originY: 450 };
    expect(blendViewport(a, b, 0)).toEqual(a);
    const end = blendViewport(a, b, 1);
    expect(end.originX).toBeCloseTo(b.originX);
    expect(end.originY).toBeCloseTo(b.originY);
    const mid = blendViewport(a, b, 0.5);
    expect(mid.scale).toBeCloseTo(2);
    const [u, v] = screenToWorld(mid, 100, 50);
    expect(u).toBeCloseTo(50);
    expect(v).toBeCloseTo(50);
  });
});
