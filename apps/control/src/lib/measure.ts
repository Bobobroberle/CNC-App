import { edgeAngle, type Point } from './camera';
import type { Marker } from './markers';

/**
 * Measuring by tapping: the distance between two points on the table, and
 * snapping a tap on the live picture to the round feature (a hole) under it.
 */

export interface Measurement {
  /** Straight distance, mm */
  distance: number;
  /** Along X and Y from the first to the second point, mm */
  dx: number;
  dy: number;
  /** Angle of the line against the X axis, degrees in (−90, 90] */
  angle: number;
}

export function measure(a: Point, b: Point): Measurement {
  return {
    distance: Math.hypot(b.x - a.x, b.y - a.y),
    dx: b.x - a.x,
    dy: b.y - a.y,
    angle: edgeAngle(a, b),
  };
}

/** Index of the point nearest to `p` within `tolerance`, or −1. */
export function nearestPoint(points: readonly Point[], p: Point, tolerance: number): number {
  let best = -1;
  let bestDistance = tolerance;
  points.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of a picture within `half` pixels around a tap, in whole pixels. */
export function cropAround(
  tap: Point,
  size: { width: number; height: number },
  half: number,
): Crop | null {
  const x0 = Math.max(0, Math.floor(tap.x - half));
  const y0 = Math.max(0, Math.floor(tap.y - half));
  const x1 = Math.min(size.width, Math.ceil(tap.x + half));
  const y1 = Math.min(size.height, Math.ceil(tap.y + half));
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Whether a tap means the round feature found near it: the tap lies on the
 * feature or within `reach` pixels of its rim. Everything farther away is a
 * free point – a tap beside a hole measures beside the hole.
 */
export function snapsTo(tap: Point, marker: Marker | null, reach: number): marker is Marker {
  if (!marker) return false;
  return Math.hypot(marker.x - tap.x, marker.y - tap.y) <= marker.diameter / 2 + reach;
}
