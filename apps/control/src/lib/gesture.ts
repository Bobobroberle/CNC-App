/**
 * The one gesture layer of the stage views: one finger pans, two fingers
 * pinch and pan at once, a double tap asks for a fit, a short tap gives a
 * point. Momentum and soft limits after Apple's fluid interfaces: the view
 * keeps the finger's speed, gives way past its limits and can be grabbed in
 * mid-flight. Everything here moves a view only – never the machine.
 *
 * No DOM in this file: `components/usePanZoom.ts` feeds it pointer events.
 */
import {
  DECELERATION,
  project,
  reducedMotion,
  rubberband,
  Spring,
  SPRINGS,
  springStep,
  VelocityTracker,
} from './spring';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Screen position of a content point: `content * scale + (x, y)`. */
export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface Range {
  min: number;
  max: number;
}

/** How far a view may go; past it the view gives way softly and comes back. */
export interface Limits {
  minScale: number;
  maxScale: number;
  /** Where the content's origin may lie on screen at this scale */
  origin(scale: number): { x: Range; y: Range };
}

/** A tap moves less than this (CSS px): a finger rolls, a mouse does not */
export const TAP_SLOP = { touch: 10, pen: 6, mouse: 4 } as const;
/** …and is shorter than this */
export const TAP_MS = 500;
/** Two taps this close in time and place are a double tap */
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_SLOP = 36;
/** A release slower than this (px/s) throws nothing */
export const MIN_FLICK = 200;
/** After a pinch the last finger must travel this far alone before its lift coasts */
const PAN_AFTER_PINCH = 24;
/** How far past a scale limit the view gives (natural log of the factor) */
const SCALE_GIVE = 0.5;

export type PointerKind = keyof typeof TAP_SLOP;

/**
 * The keys held while a finger or the mouse goes down or lifts, on a computer: Shift, and Ctrl or Cmd (`ctrl`
 * is either), and Alt (Option on a Mac). Only passed on when one of them is held – a host that is given none
 * behaves as it always did – and `alt` is only there when it is held, so what was told before Alt came into it
 * reads the same.
 */
export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt?: boolean;
}

/**
 * Whether Shift or Ctrl is held: the computer's way to what a touch screen has a switch for, adding to what
 * is selected without "Mehrfachauswahl". (The mouse wheel's Ctrl – a trackpad pinch – is no part of this, and
 * neither is Alt, which turns snapping off.)
 */
export const additive = (modifiers?: Modifiers): boolean =>
  modifiers !== undefined && (modifiers.shift || modifiers.ctrl);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A range that is turned inside out (content smaller than the view) holds its middle. */
function ordered(r: Range): Range {
  if (r.min <= r.max) return r;
  const mid = (r.min + r.max) / 2;
  return { min: mid, max: mid };
}

/** Zoom by `factor`; the content under `centre` stays under it. */
export function zoomAround(t: Transform, centre: Point, factor: number): Transform {
  return {
    scale: t.scale * factor,
    x: centre.x - (centre.x - t.x) * factor,
    y: centre.y - (centre.y - t.y) * factor,
  };
}

/**
 * Two fingers moved from `a0, b0` to `a1, b1`: the content under their
 * centre stays under it (pan) while their distance sets the zoom.
 */
export function pinchTransform(
  t: Transform,
  a0: Point,
  b0: Point,
  a1: Point,
  b1: Point,
): Transform {
  const from = middle(a0, b0);
  const to = middle(a1, b1);
  const before = distance(a0, b0);
  const factor = before > 0 ? distance(a1, b1) / before : 1;
  return {
    scale: t.scale * factor,
    x: to.x - (from.x - t.x) * factor,
    y: to.y - (from.y - t.y) * factor,
  };
}

/** The nearest transform within the limits; the zoom is corrected around `anchor`. */
export function clampTransform(t: Transform, limits: Limits | null, anchor: Point): Transform {
  if (!limits) return t;
  const scale = clamp(t.scale, limits.minScale, limits.maxScale);
  const z = zoomAround(t, anchor, scale / t.scale);
  const range = limits.origin(scale);
  const rx = ordered(range.x);
  const ry = ordered(range.y);
  return { scale, x: clamp(z.x, rx.min, rx.max), y: clamp(z.y, ry.min, ry.max) };
}

/** Inverse of `rubberband`: the overshoot that is shown as `shown`. */
export function unrubberband(shown: number, dimension: number, constant = 0.55): number {
  const y = clamp(shown, -0.999 * dimension, 0.999 * dimension);
  return (y * dimension) / (constant * (dimension - Math.abs(y)));
}

function softAxis(value: number, r: Range, dimension: number, give: typeof rubberband): number {
  if (value < r.min) return r.min + give(value - r.min, dimension);
  if (value > r.max) return r.max + give(value - r.max, dimension);
  return value;
}

function softScale(scale: number, limits: Limits, give: typeof rubberband): number {
  if (scale > limits.maxScale) {
    return limits.maxScale * Math.exp(give(Math.log(scale / limits.maxScale), SCALE_GIVE));
  }
  if (scale < limits.minScale) {
    return limits.minScale * Math.exp(give(Math.log(scale / limits.minScale), SCALE_GIVE));
  }
  return scale;
}

/**
 * What is shown for where the fingers ask the view to be (`raw`): inside the
 * limits the same, past them less and less. `anchor` is where the fingers are.
 */
export function soften(
  raw: Transform,
  limits: Limits | null,
  size: Size,
  anchor: Point,
): Transform {
  if (!limits) return raw;
  const scale = softScale(raw.scale, limits, rubberband);
  const z = zoomAround(raw, anchor, scale / raw.scale);
  const range = limits.origin(scale);
  return {
    scale,
    x: softAxis(z.x, ordered(range.x), size.width, rubberband),
    y: softAxis(z.y, ordered(range.y), size.height, rubberband),
  };
}

/** Inverse of `soften`: taking hold of a view that is past its limits must not move it. */
export function unsoften(
  shown: Transform,
  limits: Limits | null,
  size: Size,
  anchor: Point,
): Transform {
  if (!limits) return shown;
  const range = limits.origin(shown.scale);
  const hard = {
    scale: shown.scale,
    x: softAxis(shown.x, ordered(range.x), size.width, unrubberband),
    y: softAxis(shown.y, ordered(range.y), size.height, unrubberband),
  };
  const scale = softScale(shown.scale, limits, unrubberband);
  return zoomAround(hard, anchor, scale / shown.scale);
}

/**
 * In-between view for gliding from `a` to `b` (p = 0…1): the content in the
 * middle of the view moves in a straight line and the zoom changes evenly.
 */
export function blendTransform(a: Transform, b: Transform, p: number, size: Size): Transform {
  const cx = size.width / 2;
  const cy = size.height / 2;
  const ax = (cx - a.x) / a.scale;
  const ay = (cy - a.y) / a.scale;
  const bx = (cx - b.x) / b.scale;
  const by = (cy - b.y) / b.scale;
  const scale = a.scale * (b.scale / a.scale) ** p;
  return {
    scale,
    x: cx - (ax + (bx - ax) * p) * scale,
    y: cy - (ay + (by - ay) * p) * scale,
  };
}

/** Whether two transforms show the same picture, give or take a pixel. */
export function sameView(a: Transform, b: Transform, tolerance = 2): boolean {
  return (
    Math.abs(a.scale / b.scale - 1) < 0.01 &&
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance
  );
}

/** A view after the fingers let go: coasting, or coming back from past a limit. */
export interface Motion {
  t: Transform;
  /** px/s */
  vx: number;
  vy: number;
  /** Speed of the natural log of the scale, 1/s */
  vs: number;
  /** The zoom comes back around this point */
  anchor: Point;
}

function stepAxis(value: number, v: number, r: Range, h: number): [number, number, boolean] {
  if (value < r.min || value > r.max) {
    // Past the edge: a spring takes over with the speed the view arrived with.
    const target = value < r.min ? r.min : r.max;
    const [nx, nv] = springStep(value, v, target, SPRINGS.default, h);
    if (Math.abs(nx - target) < 0.3 && Math.abs(nv) < 5) return [target, 0, false];
    return [nx, nv, true];
  }
  const nv = v * DECELERATION ** (h * 1000);
  if (Math.abs(nv) < 8) return [value, 0, false];
  return [value + nv * h, nv, true];
}

/**
 * Advances a released view by `dtMs`: it coasts like a scroll view inside
 * the limits and springs back from beyond them. Returns false once it rests.
 */
export function stepMotion(m: Motion, limits: Limits | null, dtMs: number): boolean {
  const steps = Math.max(1, Math.ceil(dtMs / 4));
  const h = dtMs / steps / 1000;
  let moving = false;
  for (let i = 0; i < steps; i++) {
    moving = false;
    let range = { x: { min: -Infinity, max: Infinity }, y: { min: -Infinity, max: Infinity } };
    if (limits) {
      const target = clamp(m.t.scale, limits.minScale, limits.maxScale);
      if (target !== m.t.scale || m.vs !== 0) {
        const [ls, vs] = springStep(
          Math.log(m.t.scale),
          m.vs,
          Math.log(target),
          SPRINGS.default,
          h,
        );
        const rests = Math.abs(ls - Math.log(target)) < 1e-3 && Math.abs(vs) < 1e-2;
        const scale = rests ? target : Math.exp(ls);
        m.t = zoomAround(m.t, m.anchor, scale / m.t.scale);
        m.vs = rests ? 0 : vs;
        moving ||= !rests;
      }
      const origin = limits.origin(m.t.scale);
      range = { x: ordered(origin.x), y: ordered(origin.y) };
    }
    let more: boolean;
    [m.t.x, m.vx, more] = stepAxis(m.t.x, m.vx, range.x, h);
    moving ||= more;
    [m.t.y, m.vy, more] = stepAxis(m.t.y, m.vy, range.y, h);
    moving ||= more;
    if (!moving) break;
  }
  return moving;
}

/** What a view gives the gesture layer. Coordinates are CSS px inside the view. */
export interface PanZoomHost {
  /** The transform on screen right now; null while the view is not ready */
  read(): Transform | null;
  write(t: Transform): void;
  limits(): Limits | null;
  size(): Size;
  /**
   * A short tap. May return how to take it back if it turns out to start a double tap. `modifiers` is there
   * only when Shift or Ctrl was held as the finger lifted.
   */
  tap?(p: Point, kind: PointerKind, modifiers?: Modifiers): void | (() => void);
  doubleTap?(p: Point): void;
  /** The user took the view: `pan` with one finger, `zoom` with two or the wheel */
  grabbed?(how: 'pan' | 'zoom'): void;
}

type Schedule = (cb: (now: number) => void) => number;
type Cancel = (id: number) => void;

interface Finger {
  /** Last position */
  p: Point;
  /** Where and when it came down */
  start: Point;
  at: number;
  kind: PointerKind;
}

/**
 * Turns pointers into pan, pinch, tap and double tap for one view. Any new
 * touch stops whatever the view was doing and takes it where it is.
 */
export class PanZoom {
  private fingers = new Map<number, Finger>();
  /** Where the fingers ask the view to be; shown softened */
  private raw: Transform | null = null;
  private anchor: Point = { x: 0, y: 0 };
  private tracker = new VelocityTracker();
  /** The first finger left its tap slop */
  private moved = false;
  /** More than one finger was down during this gesture */
  private pinched = false;
  /** Distance the last finger travelled alone after a pinch */
  private alone = 0;
  private lastTap: { p: Point; at: number; undo: (() => void) | void } | null = null;
  private frame: number | null = null;
  private glide: Spring | null = null;

  constructor(
    private readonly host: PanZoomHost,
    private readonly schedule: Schedule = (cb) => requestAnimationFrame(cb),
    private readonly unschedule: Cancel = (id) => cancelAnimationFrame(id),
    private readonly reduce: () => boolean = reducedMotion,
  ) {}

  /** Fingers on the view right now */
  get touching(): number {
    return this.fingers.size;
  }

  /** Coasting, springing back or gliding */
  get animating(): boolean {
    return this.frame !== null || (this.glide?.running ?? false);
  }

  /** Stops every motion where it is. */
  stop(): void {
    if (this.frame !== null) this.unschedule(this.frame);
    this.frame = null;
    this.glide?.stop();
  }

  /** Lets go of everything, e.g. when the view goes away. */
  reset(): void {
    this.stop();
    this.fingers.clear();
    this.raw = null;
    this.lastTap = null;
  }

  down(id: number, p: Point, time: number, kind: PointerKind = 'touch'): void {
    this.stop();
    this.fingers.set(id, { p, start: p, at: time, kind });
    if (this.fingers.size === 1) {
      this.moved = false;
      this.pinched = false;
      this.alone = 0;
    } else {
      this.pinched = true;
    }
    this.tracker.reset();
    this.rebase();
  }

  move(id: number, p: Point, time: number): void {
    const finger = this.fingers.get(id);
    if (!finger || !this.raw) return;
    const [first, second] = [...this.fingers.values()];
    if (this.fingers.size === 1) {
      if (!this.moved) {
        if (distance(p, finger.start) <= TAP_SLOP[finger.kind]) return;
        // The pan starts where the finger left the slop, so the view does not jump.
        this.moved = true;
        finger.p = p;
        this.tracker.add(p.x, p.y, time);
        this.host.grabbed?.('pan');
        return;
      }
      this.alone += distance(p, finger.p);
      this.raw = {
        ...this.raw,
        x: this.raw.x + p.x - finger.p.x,
        y: this.raw.y + p.y - finger.p.y,
      };
      this.anchor = p;
      this.tracker.add(p.x, p.y, time);
    } else if (finger === first || finger === second) {
      // A third finger rests; the first two steer.
      const other = finger === first ? second! : first!;
      this.raw = pinchTransform(this.raw, finger.p, other.p, p, other.p);
      this.anchor = middle(p, other.p);
      if (!this.moved) this.host.grabbed?.('zoom');
      this.moved = true;
    }
    finger.p = p;
    this.show();
  }

  up(id: number, p: Point, time: number, modifiers?: Modifiers): void {
    const finger = this.fingers.get(id);
    if (!finger) return;
    this.fingers.delete(id);
    if (this.fingers.size > 0) {
      // From pinch to pan: the finger that stays carries on without a jump.
      this.tracker.reset();
      this.alone = 0;
      this.rebase();
      return;
    }
    if (!this.moved && !this.pinched && time - finger.at < TAP_MS) {
      this.tapped(p, time, finger.kind, modifiers);
      this.release({ x: 0, y: 0 });
      return;
    }
    const coasts = !this.pinched || this.alone > PAN_AFTER_PINCH;
    this.release(coasts ? this.tracker.velocity(time) : { x: 0, y: 0 });
  }

  /** The system took the pointer (a system gesture, a palm): never a tap, never a throw. */
  cancel(id: number): void {
    if (!this.fingers.delete(id)) return;
    this.tracker.reset();
    if (this.fingers.size > 0) this.rebase();
    else this.release({ x: 0, y: 0 });
  }

  /** Mouse wheel or trackpad pinch: zoom around the pointer, straight to the limits. */
  wheel(p: Point, factor: number): void {
    const t = this.host.read();
    if (!t) return;
    this.stop();
    this.host.grabbed?.('zoom');
    this.host.write(clampTransform(zoomAround(t, p, factor), this.host.limits(), p));
  }

  /** Glides to `target`; a touch on the way takes the view where it is. */
  glideTo(target: Transform): void {
    const from = this.host.read();
    this.stop();
    if (!from || this.reduce()) {
      this.host.write(target);
      return;
    }
    const size = this.host.size();
    this.glide = new Spring(
      0,
      (p) => this.host.write(blendTransform(from, target, p, size)),
      this.schedule,
      this.unschedule,
      this.reduce,
    );
    this.glide.to(1, { config: SPRINGS.default });
  }

  private tapped(p: Point, time: number, kind: PointerKind, modifiers?: Modifiers): void {
    const last = this.lastTap;
    if (last && time - last.at < DOUBLE_TAP_MS && distance(p, last.p) < DOUBLE_TAP_SLOP) {
      // The first tap was the start of a double tap, not a point for a tool.
      this.lastTap = null;
      if (this.host.doubleTap) {
        if (typeof last.undo === 'function') last.undo();
        this.host.doubleTap(p);
        return;
      }
    }
    // (a third argument only where there is something to say: a host written without it is called as ever)
    const undo = modifiers ? this.host.tap?.(p, kind, modifiers) : this.host.tap?.(p, kind);
    this.lastTap = { p, at: time, undo };
  }

  /** `raw` for what is on screen, with the fingers that are down now. */
  private rebase(): void {
    const shown = this.host.read();
    if (!shown) {
      this.raw = null;
      return;
    }
    const [first, second] = [...this.fingers.values()];
    if (first) this.anchor = second ? middle(first.p, second.p) : first.p;
    this.raw = unsoften(shown, this.host.limits(), this.host.size(), this.anchor);
  }

  private show(): void {
    if (!this.raw) return;
    this.host.write(soften(this.raw, this.host.limits(), this.host.size(), this.anchor));
  }

  private release(velocity: Point): void {
    const t = this.host.read();
    this.raw = null;
    if (!t) return;
    const limits = this.host.limits();
    const rest = clampTransform(t, limits, this.anchor);
    const resting =
      rest.scale === t.scale && Math.abs(rest.x - t.x) < 0.01 && Math.abs(rest.y - t.y) < 0.01;
    if (this.reduce()) {
      if (!resting) this.host.write(rest);
      return;
    }
    const thrown = Math.hypot(velocity.x, velocity.y) >= MIN_FLICK;
    const motion: Motion = {
      t: { ...t },
      vx: thrown ? velocity.x : 0,
      vy: thrown ? velocity.y : 0,
      vs: 0,
      anchor: this.anchor,
    };
    let last = -1;
    const tick = (now: number) => {
      const dt = last < 0 ? 0 : Math.min(64, now - last);
      last = now;
      const moving = dt === 0 || stepMotion(motion, this.host.limits(), dt);
      if (dt > 0) this.host.write({ ...motion.t });
      this.frame = moving ? this.schedule(tick) : null;
    };
    // Nothing to do for a view that rests inside its limits.
    if (!thrown && resting) return;
    this.frame = this.schedule(tick);
  }
}

/** A finger moves this far before a swipe takes a direction (CSS px) */
export const SWIPE_SLOP = 10;

/**
 * Which way a drag on a scrolling panel is going, once it has left the slop:
 * clearly sideways is a swipe, anything else belongs to the scrolling.
 */
export function swipeAxis(dx: number, dy: number): 'horizontal' | 'vertical' | null {
  if (Math.hypot(dx, dy) < SWIPE_SLOP) return null;
  return Math.abs(dx) > 1.5 * Math.abs(dy) ? 'horizontal' : 'vertical';
}

/**
 * Where a sideways swipe lands: +1 the next page (finger went left), −1 the
 * previous one, 0 back where it was. Decided by where the flick would come
 * to rest, not by where the finger lifted.
 */
export function swipeStep(dx: number, velocityX: number, width: number): -1 | 0 | 1 {
  const rest = dx + project(velocityX);
  const needed = Math.min(160, width * 0.3);
  if (Math.abs(rest) < needed) return 0;
  // A flick back against the drag cancels it.
  if (Math.sign(rest) !== Math.sign(dx)) return 0;
  return rest < 0 ? 1 : -1;
}
