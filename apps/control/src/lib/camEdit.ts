import {
  applyToPoint,
  IDENTITY,
  invert,
  sketchBox,
  SKETCH_MIN,
  type Bounds,
  type Matrix,
  type Point,
} from '@lowrider/cam';
import { contoursBox, itemsBounds, type CamItem } from './camItems';

/**
 * The box the handles of a selection sit on: a box in the selection's own
 * coordinates and the map from there to the work coordinates. A turned
 * rectangle keeps its handles on its own corners.
 */
export interface Frame {
  m: Matrix;
  box: Bounds;
  /**
   * The selection's own box (everything in it lies the same way) – not just
   * the upright box around things that lie each their own way
   */
  own: boolean;
}

const KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const sameMap = (p: Matrix, q: Matrix) => KEYS.every((k) => Math.abs(p[k] - q[k]) < 1e-9);

/**
 * The frame of what is selected: its own box where everything lies the same
 * way (one shape, the contours of one file), else the upright box around it.
 */
export function selectionFrame(items: readonly CamItem[]): Frame | null {
  const first = items[0];
  if (!first) return null;
  const m = first.placement;
  if (invert(m) && items.every((i) => sameMap(i.placement, m))) {
    const drawn = items.length === 1 && first.sketch ? sketchBox(first.sketch) : null;
    const box = drawn ?? contoursBox(items.flatMap((i) => i.source));
    if (box) return { m, box, own: true };
  }
  const box = itemsBounds(items);
  return box && { m: IDENTITY, box, own: false };
}

/** A point of the frame by its share of the width and height (0…1), work mm. */
export function framePoint(frame: Pick<Frame, 'm' | 'box'>, fx: number, fy: number): Point {
  const { box, m } = frame;
  return applyToPoint(m, {
    x: box.minX + fx * (box.maxX - box.minX),
    y: box.minY + fy * (box.maxY - box.minY),
  });
}

/** The four corners of the frame, work mm: lower left, lower right, upper right, upper left. */
export const frameCorners = (frame: Frame): Point[] => [
  framePoint(frame, 0, 0),
  framePoint(frame, 1, 0),
  framePoint(frame, 1, 1),
  framePoint(frame, 0, 1),
];

/** Width and height of the frame along its own axes, work mm. */
export function frameSize(frame: Frame): { w: number; h: number } {
  const { box, m } = frame;
  return {
    w: (box.maxX - box.minX) * Math.hypot(m.a, m.b),
    h: (box.maxY - box.minY) * Math.hypot(m.c, m.d),
  };
}

/** How far the frame is turned, degrees counter-clockwise, −180 < angle ≤ 180. */
export function frameAngle(frame: Frame): number {
  const deg = (Math.atan2(frame.m.b, frame.m.a) * 180) / Math.PI;
  const round = Math.round(deg * 100) / 100;
  return round <= -180 ? round + 360 : round + 0;
}

export type SizeHandle = 'sw' | 's' | 'se' | 'e' | 'ne' | 'n' | 'nw' | 'w';
export type HandleId = SizeHandle | 'turn';

/** Where each size handle sits: its share of the width and height. */
const AT: Record<SizeHandle, readonly [number, number]> = {
  sw: [0, 0],
  s: [0.5, 0],
  se: [1, 0],
  e: [1, 0.5],
  ne: [1, 1],
  n: [0.5, 1],
  nw: [0, 1],
  w: [0, 0.5],
};
const SIZE_HANDLES = Object.keys(AT) as SizeHandle[];

/** The turn handle stands this far beyond the upper side, CSS px */
export const TURN_PX = 30;
/** A side shorter than this on the screen has no handle in its middle, CSS px */
export const SIDE_PX = 56;
/** A finger takes a handle within this distance, CSS px (a 48 px target) */
export const HANDLE_PX = 24;

export interface Handle {
  id: HandleId;
  at: Point;
}

/**
 * The handles of a frame at a zoom of `scale` px per mm: the corners, the
 * middles of the sides that are long enough to hold one, and – unless
 * `turn` is false – the turn handle beyond the upper side.
 */
export function frameHandles(frame: Frame, scale: number, turn = true): Handle[] {
  const { w, h } = frameSize(frame);
  const out: Handle[] = SIZE_HANDLES.filter((id) => {
    const [fx, fy] = AT[id];
    if (fx === 0.5) return w * scale >= SIDE_PX;
    if (fy === 0.5) return h * scale >= SIDE_PX;
    return true;
  }).map((id) => ({ id, at: framePoint(frame, ...AT[id]) }));
  if (turn) {
    const top = framePoint(frame, 0.5, 1);
    const centre = framePoint(frame, 0.5, 0.5);
    let dx = top.x - centre.x;
    let dy = top.y - centre.y;
    if (Math.hypot(dx, dy) < 1e-9) {
      // A flat frame (a line): straight up as the frame sees it.
      dx = frame.m.c;
      dy = frame.m.d;
    }
    const k = TURN_PX / scale / Math.hypot(dx, dy);
    out.push({ id: 'turn', at: { x: top.x + dx * k, y: top.y + dy * k } });
  }
  return out;
}

/** The point in the frame's own coordinates. */
function local(frame: Frame, p: Point): Point {
  // A frame always has a map that can be undone (`selectionFrame`).
  return applyToPoint(invert(frame.m)!, p);
}

/** Whether a work point lies in the frame, grown by `grow` mm on every side. */
export function insideFrame(frame: Frame, p: Point, grow = 0): boolean {
  const q = local(frame, p);
  const gx = grow / Math.hypot(frame.m.a, frame.m.b);
  const gy = grow / Math.hypot(frame.m.c, frame.m.d);
  const { box } = frame;
  return (
    q.x >= box.minX - gx && q.x <= box.maxX + gx && q.y >= box.minY - gy && q.y <= box.maxY + gy
  );
}

/**
 * The handle a finger at `p` takes, or null. From outside the frame a
 * handle is a full touch target; inside a small frame it gives way, so the
 * middle of the thing is always left for moving it.
 */
export function handleAt(
  frame: Frame,
  p: Point,
  scale: number,
  turn = true,
  reach = HANDLE_PX,
): HandleId | null {
  const { w, h } = frameSize(frame);
  const inner = Math.max(8, Math.min(reach, (Math.min(w, h) * scale) / 4));
  const limit = insideFrame(frame, p) ? inner : reach;
  let best: HandleId | null = null;
  let bestDistance = limit;
  for (const handle of frameHandles(frame, scale, turn)) {
    const d = Math.hypot(handle.at.x - p.x, handle.at.y - p.y) * scale;
    if (d <= bestDistance) {
      best = handle.id;
      bestDistance = d;
    }
  }
  return best;
}

const RESIZE_CURSORS = ['ew-resize', 'nesw-resize', 'ns-resize', 'nwse-resize'] as const;

/**
 * The mouse pointer over a handle: the double arrow along the way the
 * handle pulls, as the frame is turned; a hand for the turn handle.
 */
export function handleCursor(frame: Frame, id: HandleId): string {
  if (id === 'turn') return 'grab';
  const [hx, hy] = AT[id];
  const { m } = frame;
  // The way out of the frame at this handle, through the frame's turn (and mirror).
  const dx = Math.sign(hx - 0.5);
  const dy = Math.sign(hy - 0.5);
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  const x = (m.a / sx) * dx + (m.c / sy) * dy;
  const y = (m.b / sx) * dx + (m.d / sy) * dy;
  const eighth = Math.round((Math.atan2(y, x) * 4) / Math.PI);
  return RESIZE_CURSORS[((eighth % 4) + 4) % 4]!;
}

/** What a pulled size handle asks for. */
export interface Resize {
  /** Factors for the width and height along the frame's own axes */
  kx: number;
  ky: number;
  /** The point that stays where it is, as its share of the width and height */
  fx: number;
  fy: number;
}

/**
 * A size handle pulled to the work point `p`: the side or corner across
 * from it stays. `uniform` keeps the proportions (a circle, a text, a
 * file); `step` rounds the new measure to that many mm, and nothing gets
 * smaller than the smallest thing that can be drawn.
 */
export function resizeTo(
  frame: Frame,
  id: SizeHandle,
  p: Point,
  uniform: boolean,
  step = 0,
): Resize {
  const [hx, hy] = AT[id];
  const q = local(frame, p);
  const { box } = frame;
  const size = frameSize(frame);
  const factor = (h: number, at: number, min: number, max: number, old: number) => {
    // The middle of a side does not change the measure along it; a flat frame has none.
    if (h === 0.5 || old < 1e-9) return null;
    const pulled = ((h === 1 ? at - min : max - at) / (max - min)) * old;
    const snapped = step > 0 ? Math.round(pulled / step) * step : pulled;
    return Math.max(SKETCH_MIN, snapped) / old;
  };
  const kx = factor(hx, q.x, box.minX, box.maxX, size.w);
  const ky = factor(hy, q.y, box.minY, box.maxY, size.h);
  const fx = 1 - hx;
  const fy = 1 - hy;
  if (uniform) {
    const k = Math.max(kx ?? 0, ky ?? 0) || 1;
    return { kx: k, ky: k, fx, fy };
  }
  return { kx: kx ?? 1, ky: ky ?? 1, fx, fy };
}

/** A turn snaps to these steps when it comes this close, degrees */
const SNAP_STEP = 15;
const SNAP_WITHIN = 3;

/**
 * The turn handle pulled from `from` to `to` around the frame's middle: by
 * how many degrees (counter-clockwise) the selection turns. The frame ends
 * on a whole degree, and on a step of 15° when it comes close to one.
 */
export function turnTo(frame: Frame, from: Point, to: Point): number {
  const c = framePoint(frame, 0.5, 0.5);
  const angle = (p: Point) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
  const now = frameAngle(frame);
  let target = Math.round(now + angle(to) - angle(from));
  const near = Math.round(target / SNAP_STEP) * SNAP_STEP;
  if (Math.abs(target - near) <= SNAP_WITHIN) target = near;
  return target - now;
}
