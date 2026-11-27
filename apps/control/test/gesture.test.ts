import { describe, expect, it, vi } from 'vitest';
import {
  additive,
  blendTransform,
  clampTransform,
  DOUBLE_TAP_MS,
  PanZoom,
  pinchTransform,
  sameView,
  soften,
  stepMotion,
  swipeAxis,
  swipeStep,
  TAP_MS,
  unrubberband,
  unsoften,
  zoomAround,
  type Limits,
  type Modifiers,
  type Motion,
  type PanZoomHost,
  type Point,
  type Transform,
} from '../src/lib/gesture';
import { rubberband } from '../src/lib/spring';

const size = { width: 400, height: 300 };

/** Content of 400 × 300 units; at scale 1 it fills the view exactly. */
const limits: Limits = {
  minScale: 1,
  maxScale: 8,
  origin: (scale) => ({
    x: { min: size.width - 400 * scale, max: 0 },
    y: { min: size.height - 300 * scale, max: 0 },
  }),
};

/** Content point under a screen point. */
const contentAt = (t: Transform, p: Point): Point => ({
  x: (p.x - t.x) / t.scale,
  y: (p.y - t.y) / t.scale,
});

/** A view with a fake frame clock. */
function view(options: { limits?: Limits | null; reduce?: boolean; doubleTap?: boolean } = {}) {
  let t: Transform = { scale: 1, x: 0, y: 0 };
  let queued: ((now: number) => void) | null = null;
  let now = 0;
  const taps: Point[] = [];
  /** The arguments of every call of the host's tap, as it was given them */
  const tapCalls: unknown[][] = [];
  const undone: Point[] = [];
  const doubles: Point[] = [];
  const grabs: string[] = [];
  const host: PanZoomHost = {
    read: () => t,
    write: (next) => {
      t = next;
    },
    limits: () => (options.limits === undefined ? limits : options.limits),
    size: () => size,
    tap: (...args: unknown[]) => {
      const p = args[0] as Point;
      tapCalls.push(args);
      taps.push(p);
      return () => undone.push(p);
    },
    grabbed: (how) => grabs.push(how),
  };
  if (options.doubleTap !== false) host.doubleTap = (p) => doubles.push(p);
  const pz = new PanZoom(
    host,
    (cb) => {
      queued = cb;
      return 1;
    },
    () => {
      queued = null;
    },
    () => options.reduce ?? false,
  );
  return {
    pz,
    taps,
    tapCalls,
    undone,
    doubles,
    grabs,
    get t() {
      return t;
    },
    set t(next: Transform) {
      t = next;
    },
    /** Runs up to `frames` animation frames at 60 Hz; returns how many ran. */
    run(frames = 600) {
      let ran = 0;
      while (ran < frames && queued) {
        const cb = queued;
        queued = null;
        cb(now);
        now += 1000 / 60;
        ran++;
      }
      return ran;
    },
    get idle() {
      return queued === null;
    },
  };
}

describe('pinch maths', () => {
  it('zooms around a centre: the content under it stays put', () => {
    const t = { scale: 2, x: -30, y: 12 };
    const centre = { x: 150, y: 90 };
    const z = zoomAround(t, centre, 1.7);
    expect(z.scale).toBeCloseTo(3.4);
    expect(contentAt(z, centre).x).toBeCloseTo(contentAt(t, centre).x);
    expect(contentAt(z, centre).y).toBeCloseTo(contentAt(t, centre).y);
  });

  it('pans and zooms at once: what was between the fingers stays between them', () => {
    const t = { scale: 1.5, x: 20, y: -40 };
    const [a0, b0] = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ];
    const [a1, b1] = [
      { x: 80, y: 160 },
      { x: 280, y: 160 },
    ];
    const p = pinchTransform(t, a0, b0, a1, b1);
    expect(p.scale).toBeCloseTo(3);
    const before = contentAt(t, { x: 150, y: 100 });
    const after = contentAt(p, { x: 180, y: 160 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    // Two fingers on one spot cannot zoom.
    expect(pinchTransform(t, a0, a0, a1, b1).scale).toBe(t.scale);
  });

  it('clamps scale and position to the limits', () => {
    const anchor = { x: 200, y: 150 };
    expect(clampTransform({ scale: 0.5, x: 100, y: 75 }, limits, anchor)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    const far = clampTransform({ scale: 20, x: 500, y: -9000 }, limits, anchor);
    expect(far.scale).toBe(8);
    expect(far.x).toBe(0);
    expect(far.y).toBe(300 - 300 * 8);
    const free = { scale: 3, x: 1e6, y: -1e6 };
    expect(clampTransform(free, null, anchor)).toBe(free);
  });

  it('holds content smaller than the view in the middle', () => {
    const small: Limits = {
      minScale: 0.1,
      maxScale: 10,
      origin: (scale) => ({
        x: { min: 400 - 400 * scale, max: 0 },
        y: { min: 300 - 300 * scale, max: 0 },
      }),
    };
    const c = clampTransform({ scale: 0.5, x: 0, y: 0 }, small, { x: 0, y: 0 });
    expect(c).toEqual({ scale: 0.5, x: 100, y: 75 });
  });
});

describe('soft limits', () => {
  it('rubber-bands past the limits and inverts exactly', () => {
    for (const over of [-250, -3, 0, 4, 90, 700]) {
      expect(unrubberband(rubberband(over, 300), 300)).toBeCloseTo(over, 6);
    }
    const anchor = { x: 120, y: 200 };
    for (const raw of [
      { scale: 1, x: 60, y: 0 },
      { scale: 2, x: -500, y: 40 },
      { scale: 12, x: -100, y: -100 },
      { scale: 0.6, x: 30, y: 30 },
      { scale: 3, x: -200, y: -100 },
    ]) {
      const shown = soften(raw, limits, size, anchor);
      const back = unsoften(shown, limits, size, anchor);
      expect(back.scale).toBeCloseTo(raw.scale, 6);
      expect(back.x).toBeCloseTo(raw.x, 4);
      expect(back.y).toBeCloseTo(raw.y, 4);
    }
    // Inside the limits nothing changes; without limits nothing ever does.
    const inside = { scale: 3, x: -200, y: -100 };
    expect(soften(inside, limits, size, anchor)).toEqual(inside);
    expect(soften({ scale: 99, x: 5, y: 5 }, null, size, anchor)).toEqual({
      scale: 99,
      x: 5,
      y: 5,
    });
    expect(unsoften(inside, null, size, anchor)).toBe(inside);
  });

  it('follows less and less past an edge, never further than the view is wide', () => {
    const anchor = { x: 0, y: 0 };
    const a = soften({ scale: 1, x: 50, y: 0 }, limits, size, anchor).x;
    const b = soften({ scale: 1, x: 500, y: 0 }, limits, size, anchor).x;
    const c = soften({ scale: 1, x: 5000, y: 0 }, limits, size, anchor).x;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(50);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeLessThan(size.width);
    // Zoomed past the closest zoom: more than the limit, far less than asked for.
    const z = soften({ scale: 80, x: 0, y: 0 }, limits, size, anchor).scale;
    expect(z).toBeGreaterThan(8);
    expect(z).toBeLessThan(8 * Math.exp(0.5));
  });
});

describe('view blending', () => {
  it('moves the middle in a straight line and zooms evenly', () => {
    const a = { scale: 1, x: 0, y: 0 };
    const b = { scale: 4, x: -600, y: -450 };
    expect(blendTransform(a, b, 0, size)).toEqual(a);
    const end = blendTransform(a, b, 1, size);
    expect(end.scale).toBeCloseTo(4);
    expect(end.x).toBeCloseTo(-600);
    expect(end.y).toBeCloseTo(-450);
    const half = blendTransform(a, b, 0.5, size);
    expect(half.scale).toBeCloseTo(2);
    const mid = contentAt(half, { x: 200, y: 150 });
    expect(mid.x).toBeCloseTo((200 + 200) / 2);
    expect(mid.y).toBeCloseTo((150 + 150) / 2);
    expect(sameView(a, { scale: 1.005, x: 1, y: -1 })).toBe(true);
    expect(sameView(a, { scale: 1.2, x: 0, y: 0 })).toBe(false);
    expect(sameView(a, { scale: 1, x: 9, y: 0 })).toBe(false);
  });
});

describe('momentum', () => {
  it('coasts like a scroll view and comes to rest', () => {
    const m: Motion = {
      t: { scale: 4, x: -600, y: -450 },
      vx: 900,
      vy: 0,
      vs: 0,
      anchor: { x: 0, y: 0 },
    };
    let frames = 0;
    while (stepMotion(m, limits, 1000 / 60) && frames < 2000) frames++;
    expect(frames).toBeGreaterThan(20);
    expect(frames).toBeLessThan(2000);
    // 900 px/s comes to rest after about 450 px (project(900)), well inside the limits.
    expect(m.t.x).toBeGreaterThan(-600 + 350);
    expect(m.t.x).toBeLessThan(-600 + 460);
    expect(m.vx).toBe(0);
    expect(m.t.y).toBe(-450);
  });

  it('runs past an edge, turns and settles exactly on it', () => {
    const m: Motion = {
      t: { scale: 2, x: -20, y: -100 },
      vx: 2500,
      vy: 0,
      vs: 0,
      anchor: { x: 0, y: 0 },
    };
    let peak = -Infinity;
    let frames = 0;
    while (stepMotion(m, limits, 1000 / 60) && frames < 2000) {
      peak = Math.max(peak, m.t.x);
      frames++;
    }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThan(size.width);
    expect(m.t.x).toBe(0);
    expect(frames).toBeLessThan(200);
  });

  it('springs an over-zoomed view back around the anchor', () => {
    const anchor = { x: 200, y: 150 };
    const start = { scale: 11, x: 200 - 200 * 11, y: 150 - 150 * 11 };
    const m: Motion = { t: { ...start }, vx: 0, vy: 0, vs: 0, anchor };
    const under = contentAt(start, anchor);
    let frames = 0;
    while (stepMotion(m, limits, 1000 / 60) && frames < 2000) frames++;
    expect(m.t.scale).toBe(8);
    expect(contentAt(m.t, anchor).x).toBeCloseTo(under.x, 3);
    expect(contentAt(m.t, anchor).y).toBeCloseTo(under.y, 3);
    // Zoomed out too far: back to the whole picture.
    const out: Motion = { t: { scale: 0.7, x: 60, y: 45 }, vx: 0, vy: 0, vs: 0, anchor };
    while (stepMotion(out, limits, 1000 / 60) && frames < 4000) frames++;
    expect(out.t).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('only decays without limits and rests at once without speed', () => {
    const m: Motion = {
      t: { scale: 1, x: 0, y: 0 },
      vx: 0,
      vy: -600,
      vs: 0,
      anchor: { x: 0, y: 0 },
    };
    expect(stepMotion(m, null, 16)).toBe(true);
    expect(m.t.y).toBeLessThan(0);
    const still: Motion = {
      t: { scale: 1, x: 0, y: 0 },
      vx: 0,
      vy: 0,
      vs: 0,
      anchor: { x: 0, y: 0 },
    };
    expect(stepMotion(still, limits, 16)).toBe(false);
  });
});

describe('tap or drag', () => {
  it('a short touch that stays in place is a tap, with the point it lifted at', () => {
    const v = view();
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.move(1, { x: 104, y: 97 }, 40);
    v.pz.up(1, { x: 104, y: 97 }, 120);
    expect(v.taps).toEqual([{ x: 104, y: 97 }]);
    expect(v.t).toEqual({ scale: 1, x: 0, y: 0 });
    expect(v.grabs).toEqual([]);
  });

  it('a finger rolls further than a mouse may move', () => {
    const touch = view();
    touch.pz.down(1, { x: 100, y: 100 }, 0, 'touch');
    touch.pz.move(1, { x: 108, y: 100 }, 30);
    touch.pz.up(1, { x: 108, y: 100 }, 60);
    expect(touch.taps).toHaveLength(1);
    const mouse = view();
    mouse.pz.down(1, { x: 100, y: 100 }, 0, 'mouse');
    mouse.pz.move(1, { x: 108, y: 100 }, 30);
    mouse.pz.up(1, { x: 108, y: 100 }, 60);
    expect(mouse.taps).toHaveLength(0);
  });

  it('a long press is not a tap', () => {
    const v = view();
    v.pz.down(1, { x: 50, y: 50 }, 0);
    v.pz.up(1, { x: 50, y: 50 }, TAP_MS + 1);
    expect(v.taps).toEqual([]);
  });

  it('a pan never ends in a tap – not even when the finger comes back to where it started', () => {
    const v = view();
    v.t = { scale: 4, x: -600, y: -450 };
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.move(1, { x: 140, y: 100 }, 20);
    v.pz.move(1, { x: 180, y: 100 }, 40);
    v.pz.move(1, { x: 100, y: 100 }, 200);
    v.pz.up(1, { x: 100, y: 100 }, 400);
    expect(v.taps).toEqual([]);
    expect(v.grabs).toEqual(['pan']);
  });

  it('the pan starts where the finger left the slop: no jump', () => {
    const v = view();
    v.t = { scale: 4, x: -600, y: -450 };
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.move(1, { x: 108, y: 100 }, 10);
    expect(v.t.x).toBe(-600);
    v.pz.move(1, { x: 115, y: 100 }, 20);
    expect(v.t.x).toBe(-600);
    v.pz.move(1, { x: 135, y: 105 }, 30);
    expect(v.t.x).toBe(-580);
    expect(v.t.y).toBe(-445);
  });

  it('a pinch never ends in a tap, whichever finger lifts last', () => {
    const v = view();
    v.pz.down(1, { x: 100, y: 150 }, 0);
    v.pz.down(2, { x: 300, y: 150 }, 10);
    v.pz.up(2, { x: 300, y: 150 }, 60);
    v.pz.up(1, { x: 100, y: 150 }, 80);
    expect(v.taps).toEqual([]);
    expect(v.doubles).toEqual([]);
  });

  it('a touch the system takes away is neither a tap nor a throw', () => {
    const v = view();
    v.t = { scale: 4, x: -600, y: -450 };
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.cancel(1);
    expect(v.taps).toEqual([]);
    v.pz.down(2, { x: 100, y: 100 }, 100);
    v.pz.move(2, { x: 150, y: 100 }, 110);
    v.pz.move(2, { x: 220, y: 100 }, 120);
    v.pz.cancel(2);
    expect(v.idle).toBe(true);
    expect(v.pz.touching).toBe(0);
    // Unknown pointers are ignored.
    v.pz.cancel(9);
    v.pz.up(9, { x: 0, y: 0 }, 0);
    v.pz.move(9, { x: 0, y: 0 }, 0);
  });
});

describe('Shift and Ctrl on a tap', () => {
  const keys = (shift: boolean, ctrl: boolean): Modifiers => ({ shift, ctrl });

  it('are handed to the host with the tap – only where one is held', () => {
    const v = view();
    v.pz.down(1, { x: 100, y: 100 }, 0, 'mouse');
    v.pz.up(1, { x: 100, y: 100 }, 80, keys(true, false));
    expect(v.tapCalls).toEqual([[{ x: 100, y: 100 }, 'mouse', { shift: true, ctrl: false }]]);
    // a tap with no key held is called exactly as it always was: two arguments, nothing more
    const plain = view();
    plain.pz.down(1, { x: 100, y: 100 }, 0, 'touch');
    plain.pz.up(1, { x: 100, y: 100 }, 80);
    expect(plain.tapCalls).toEqual([[{ x: 100, y: 100 }, 'touch']]);
    expect(plain.tapCalls[0]).toHaveLength(2);
  });

  it('change nothing else: a pan still pans and a pinch still pinches', () => {
    const v = view();
    v.pz.down(1, { x: 100, y: 100 }, 0, 'mouse');
    v.pz.move(1, { x: 160, y: 130 }, 30);
    v.pz.move(1, { x: 200, y: 140 }, 60);
    v.pz.up(1, { x: 200, y: 140 }, 90, keys(true, true));
    expect(v.taps).toEqual([]);
    expect(v.grabs).toEqual(['pan']);
  });

  it('say that either key counts – and neither does not', () => {
    expect(additive(undefined)).toBe(false);
    expect(additive(keys(false, false))).toBe(false);
    expect(additive(keys(true, false))).toBe(true);
    expect(additive(keys(false, true))).toBe(true);
    expect(additive(keys(true, true))).toBe(true);
  });
});

describe('double tap', () => {
  it('asks for the fit and takes the first tap back', () => {
    const v = view();
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.up(1, { x: 100, y: 100 }, 60);
    expect(v.taps).toHaveLength(1);
    v.pz.down(2, { x: 108, y: 96 }, 160);
    v.pz.up(2, { x: 108, y: 96 }, 220);
    expect(v.doubles).toEqual([{ x: 108, y: 96 }]);
    expect(v.undone).toEqual([{ x: 100, y: 100 }]);
    expect(v.taps).toHaveLength(1);
    // The third tap starts over.
    v.pz.down(3, { x: 108, y: 96 }, 300);
    v.pz.up(3, { x: 108, y: 96 }, 340);
    expect(v.taps).toHaveLength(2);
    expect(v.doubles).toHaveLength(1);
  });

  it('two taps far apart in time or place are two taps', () => {
    const v = view();
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.up(1, { x: 100, y: 100 }, 50);
    v.pz.down(2, { x: 100, y: 100 }, 50 + DOUBLE_TAP_MS + 10);
    v.pz.up(2, { x: 100, y: 100 }, 100 + DOUBLE_TAP_MS + 10);
    v.pz.down(3, { x: 200, y: 100 }, 500 + DOUBLE_TAP_MS);
    v.pz.up(3, { x: 200, y: 100 }, 540 + DOUBLE_TAP_MS);
    expect(v.taps).toHaveLength(3);
    expect(v.doubles).toEqual([]);
    expect(v.undone).toEqual([]);
  });

  it('where a view has no double tap, both taps count', () => {
    const v = view({ doubleTap: false });
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.up(1, { x: 100, y: 100 }, 50);
    v.pz.down(2, { x: 100, y: 100 }, 120);
    v.pz.up(2, { x: 100, y: 100 }, 170);
    expect(v.taps).toHaveLength(2);
    expect(v.undone).toEqual([]);
  });
});

describe('pan, pinch and letting go', () => {
  it('pinches around the fingers and pans with them at the same time', () => {
    const v = view();
    v.t = { scale: 2, x: -200, y: -150 };
    v.pz.down(1, { x: 150, y: 150 }, 0);
    v.pz.down(2, { x: 250, y: 150 }, 5);
    const under = contentAt(v.t, { x: 200, y: 150 });
    v.pz.move(1, { x: 120, y: 170 }, 20);
    v.pz.move(2, { x: 320, y: 170 }, 20);
    expect(v.t.scale).toBeCloseTo(4);
    const now = contentAt(v.t, { x: 220, y: 170 });
    expect(now.x).toBeCloseTo(under.x);
    expect(now.y).toBeCloseTo(under.y);
    expect(v.grabs).toEqual(['zoom']);
    // A third finger changes nothing.
    v.pz.down(3, { x: 10, y: 10 }, 30);
    const before = { ...v.t };
    v.pz.move(3, { x: 90, y: 90 }, 40);
    expect(v.t.scale).toBeCloseTo(before.scale);
    expect(v.pz.touching).toBe(3);
  });

  it('hands the view from a pinch to the finger that stays, without a jump', () => {
    const v = view();
    v.t = { scale: 2, x: -200, y: -150 };
    v.pz.down(1, { x: 150, y: 150 }, 0);
    v.pz.down(2, { x: 250, y: 150 }, 5);
    v.pz.move(2, { x: 350, y: 150 }, 20);
    const at = { ...v.t };
    v.pz.up(1, { x: 150, y: 150 }, 30);
    expect(v.t).toEqual(at);
    v.pz.move(2, { x: 360, y: 158 }, 40);
    expect(v.t.scale).toBeCloseTo(at.scale);
    expect(v.t.x).toBeCloseTo(at.x + 10);
    expect(v.t.y).toBeCloseTo(at.y + 8);
    // Lifting right after a pinch does not throw the view.
    v.pz.up(2, { x: 360, y: 158 }, 45);
    expect(v.idle).toBe(true);
  });

  it('a flick keeps going and can be caught in mid-flight', () => {
    const v = view();
    v.t = { scale: 4, x: -600, y: -450 };
    v.pz.down(1, { x: 300, y: 150 }, 0);
    for (let i = 1; i <= 6; i++) v.pz.move(1, { x: 300 - i * 20, y: 150 }, i * 10);
    const lifted = v.t.x;
    v.pz.up(1, { x: 180, y: 150 }, 62);
    expect(v.idle).toBe(false);
    v.run(10);
    expect(v.t.x).toBeLessThan(lifted - 20);
    expect(v.pz.animating).toBe(true);
    // A finger lands: the view stops where it is and follows the finger from there.
    const caught = v.t.x;
    v.pz.down(2, { x: 200, y: 150 }, 300);
    expect(v.idle).toBe(true);
    expect(v.t.x).toBe(caught);
    v.pz.move(2, { x: 215, y: 150 }, 310);
    v.pz.move(2, { x: 235, y: 150 }, 320);
    expect(v.t.x).toBeCloseTo(caught + 20);
    v.pz.up(2, { x: 235, y: 150 }, 600);
    // Rested before lifting: nothing is thrown.
    expect(v.idle).toBe(true);
    expect(v.taps).toEqual([]);
  });

  it('gives way past the edge under the finger and springs back when let go', () => {
    const v = view();
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.move(1, { x: 120, y: 100 }, 10);
    v.pz.move(1, { x: 320, y: 100 }, 400);
    expect(v.t.x).toBeGreaterThan(20);
    expect(v.t.x).toBeLessThan(200);
    v.pz.up(1, { x: 320, y: 100 }, 800);
    expect(v.idle).toBe(false);
    v.run();
    expect(v.idle).toBe(true);
    expect(v.t).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('taking hold of a view that is past its limits does not move it', () => {
    const v = view();
    v.t = { scale: 1, x: 80, y: 0 };
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.move(1, { x: 100, y: 120 }, 10);
    v.pz.move(1, { x: 100, y: 121 }, 20);
    expect(v.t.x).toBeCloseTo(80, 3);
  });

  it('with reduced motion nothing coasts or springs: the view is simply in bounds', () => {
    const v = view({ reduce: true });
    v.pz.down(1, { x: 100, y: 100 }, 0);
    v.pz.move(1, { x: 120, y: 100 }, 10);
    v.pz.move(1, { x: 220, y: 100 }, 20);
    v.pz.up(1, { x: 220, y: 100 }, 25);
    expect(v.idle).toBe(true);
    expect(v.t).toEqual({ scale: 1, x: 0, y: 0 });
    v.pz.glideTo({ scale: 2, x: -200, y: -150 });
    expect(v.idle).toBe(true);
    expect(v.t).toEqual({ scale: 2, x: -200, y: -150 });
  });

  it('the wheel zooms around the pointer and stops at the limits', () => {
    const v = view();
    const p = { x: 300, y: 200 };
    const under = contentAt(v.t, p);
    v.pz.wheel(p, 1.2);
    expect(v.t.scale).toBeCloseTo(1.2);
    expect(contentAt(v.t, p).x).toBeCloseTo(under.x);
    for (let i = 0; i < 40; i++) v.pz.wheel(p, 1.2);
    expect(v.t.scale).toBe(8);
    for (let i = 0; i < 80; i++) v.pz.wheel(p, 1 / 1.2);
    expect(v.t).toEqual({ scale: 1, x: 0, y: 0 });
    expect(v.grabs[0]).toBe('zoom');
  });

  it('glides to a target and lets a touch take over on the way', () => {
    const v = view();
    v.pz.glideTo({ scale: 4, x: -600, y: -450 });
    v.run(8);
    expect(v.t.scale).toBeGreaterThan(1);
    expect(v.t.scale).toBeLessThan(4);
    const at = { ...v.t };
    v.pz.down(1, { x: 200, y: 150 }, 0);
    v.run(20);
    expect(v.t).toEqual(at);
    v.pz.up(1, { x: 200, y: 150 }, 700);
    v.pz.glideTo({ scale: 4, x: -600, y: -450 });
    v.run();
    expect(v.t.scale).toBeCloseTo(4);
    expect(v.t.x).toBeCloseTo(-600);
  });

  it('does nothing while the view is not ready, and forgets everything on reset', () => {
    let ready = false;
    const write = vi.fn();
    const pz = new PanZoom(
      {
        read: () => (ready ? { scale: 1, x: 0, y: 0 } : null),
        write,
        limits: () => null,
        size: () => size,
      },
      () => 1,
      () => undefined,
      () => false,
    );
    pz.down(1, { x: 0, y: 0 }, 0);
    pz.move(1, { x: 50, y: 0 }, 10);
    pz.wheel({ x: 0, y: 0 }, 2);
    pz.up(1, { x: 50, y: 0 }, 20);
    pz.glideTo({ scale: 2, x: 0, y: 0 });
    expect(write).toHaveBeenCalledTimes(1);
    ready = true;
    pz.down(2, { x: 0, y: 0 }, 100);
    pz.reset();
    expect(pz.touching).toBe(0);
    expect(pz.animating).toBe(false);
  });
});

describe('swipe between the views of a room', () => {
  it('takes a direction only after the slop, and only when clearly sideways', () => {
    expect(swipeAxis(4, 3)).toBeNull();
    expect(swipeAxis(30, 8)).toBe('horizontal');
    expect(swipeAxis(-30, 8)).toBe('horizontal');
    expect(swipeAxis(12, 12)).toBe('vertical');
    expect(swipeAxis(2, 40)).toBe('vertical');
  });

  it('lands where the flick would come to rest', () => {
    // Dragged far enough: next view to the left of the finger, previous to the right.
    expect(swipeStep(-200, 0, 400)).toBe(1);
    expect(swipeStep(200, 0, 400)).toBe(-1);
    // A short, quick flick is enough; a short, slow drag is not.
    expect(swipeStep(-40, -900, 400)).toBe(1);
    expect(swipeStep(-40, -50, 400)).toBe(0);
    // Flicked back against the drag: stay.
    expect(swipeStep(-100, 900, 400)).toBe(0);
  });
});
