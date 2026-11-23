import { planeAxes } from './interpreter';
import { AXES, type Segment, type Vec4 } from './types';

export interface Bounds {
  min: Vec4;
  max: Vec4;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Point on a segment at parameter t ∈ [0, 1]. */
export function pointAt(segment: Segment, t: number): Vec4 {
  const { from, to, arc } = segment;
  const p: Vec4 = {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    z: lerp(from.z, to.z, t),
    a: lerp(from.a, to.a, t),
  };
  if (arc && t > 0 && t < 1) {
    const axes = planeAxes(arc.plane);
    const angle = arc.startAngle + arc.sweep * t;
    p[axes.axis0] = arc.center[0] + arc.radius * Math.cos(angle);
    p[axes.axis1] = arc.center[1] + arc.radius * Math.sin(angle);
  }
  return p;
}

/**
 * Number of chords needed so an arc deviates at most `tolerance` from the
 * true circle (same formula as Grbl/FluidNC).
 */
export function arcChordCount(radius: number, sweep: number, tolerance: number): number {
  if (radius <= tolerance) return 1;
  const count = Math.floor(
    Math.abs(0.5 * sweep * radius) / Math.sqrt(tolerance * (2 * radius - tolerance)),
  );
  return Math.max(1, count);
}

/** Polyline through a segment: two points for lines, chords for arcs. */
export function segmentPoints(segment: Segment, tolerance = 0.01): Vec4[] {
  if (!segment.arc) return [segment.from, segment.to];
  const n = arcChordCount(segment.arc.radius, segment.arc.sweep, tolerance);
  const points: Vec4[] = [];
  for (let i = 0; i <= n; i++) points.push(pointAt(segment, i / n));
  return points;
}

export function emptyBounds(): Bounds {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity, a: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity, a: -Infinity },
  };
}

export function isEmptyBounds(bounds: Bounds): boolean {
  return bounds.min.x > bounds.max.x;
}

function include(bounds: Bounds, p: Vec4) {
  for (const axis of AXES) {
    if (p[axis] < bounds.min[axis]) bounds.min[axis] = p[axis];
    if (p[axis] > bounds.max[axis]) bounds.max[axis] = p[axis];
  }
}

/** Adds the exact extent of a segment (including arc extremes) to `bounds`. */
export function includeSegment(bounds: Bounds, segment: Segment) {
  include(bounds, segment.from);
  include(bounds, segment.to);
  const { arc } = segment;
  if (!arc) return;
  // Extremes lie at multiples of 90° within the sweep.
  const quarter = Math.PI / 2;
  const lo = Math.min(arc.startAngle, arc.startAngle + arc.sweep);
  const hi = Math.max(arc.startAngle, arc.startAngle + arc.sweep);
  for (let k = Math.ceil(lo / quarter); k * quarter <= hi; k++) {
    include(bounds, pointAt(segment, (k * quarter - arc.startAngle) / arc.sweep));
  }
}

export interface BoundsOptions {
  includeRapids?: boolean;
  /** Ignore G53 machine-coordinate moves (default true) */
  excludeMachineMoves?: boolean;
}

export function programBounds(segments: readonly Segment[], options: BoundsOptions = {}): Bounds {
  const { includeRapids = true, excludeMachineMoves = true } = options;
  const bounds = emptyBounds();
  for (const segment of segments) {
    if (!includeRapids && segment.motion === 'rapid') continue;
    if (excludeMachineMoves && segment.machineCoordinates) continue;
    includeSegment(bounds, segment);
  }
  return bounds;
}

export interface ClosestPoint {
  /** Parameter along the segment, 0…1 */
  t: number;
  point: Vec4;
  distance: number;
}

export type DistanceMode = 'xy' | 'xyz';

function distance(a: Vec4, b: Vec4, mode: DistanceMode) {
  return mode === 'xy'
    ? Math.hypot(a.x - b.x, a.y - b.y)
    : Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function closestOnLine(segment: Segment, p: Vec4, mode: DistanceMode): ClosestPoint {
  const { from, to } = segment;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = mode === 'xyz' ? to.z - from.z : 0;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 0) {
    t =
      ((p.x - from.x) * dx + (p.y - from.y) * dy + (mode === 'xyz' ? (p.z - from.z) * dz : 0)) /
      len2;
    t = Math.min(1, Math.max(0, t));
  }
  const point = pointAt(segment, t);
  return { t, point, distance: distance(point, p, mode) };
}

function closestOnPolyline(segment: Segment, p: Vec4, mode: DistanceMode): ClosestPoint {
  const points = segmentPoints(segment, 0.005);
  const n = points.length - 1;
  let best: ClosestPoint = { t: 0, point: points[0]!, distance: Infinity };
  for (let i = 0; i < n; i++) {
    const chord = { ...segment, arc: undefined, from: points[i]!, to: points[i + 1]! };
    const c = closestOnLine(chord, p, mode);
    if (c.distance < best.distance)
      best = { t: (i + c.t) / n, point: c.point, distance: c.distance };
  }
  return best;
}

/** Closest point on a segment to `p`, measured in XY or XYZ. */
export function closestPoint(segment: Segment, p: Vec4, mode: DistanceMode = 'xy'): ClosestPoint {
  const { arc } = segment;
  if (!arc) return closestOnLine(segment, p, mode);
  if (arc.plane !== 'XY' || mode !== 'xy') return closestOnPolyline(segment, p, mode);
  // Analytic projection onto the circle in XY.
  const angle = Math.atan2(p.y - arc.center[1], p.x - arc.center[0]);
  let rel = (angle - arc.startAngle) / arc.sweep;
  const turn = (2 * Math.PI) / Math.abs(arc.sweep);
  // Bring rel into the sweep if any 2π shift does.
  rel -= Math.floor(rel / turn) * turn;
  const candidates = [0, 1];
  if (rel <= 1) candidates.push(rel);
  let best: ClosestPoint = { t: 0, point: segment.from, distance: Infinity };
  for (const t of candidates) {
    const point = pointAt(segment, t);
    const d = distance(point, p, mode);
    if (d < best.distance) best = { t, point, distance: d };
  }
  return best;
}

export interface NearestSegment extends ClosestPoint {
  index: number;
}

export interface NearestOptions {
  mode?: DistanceMode;
  /** Search only segments in [from, to) */
  from?: number;
  to?: number;
  includeRapids?: boolean;
}

/** Nearest segment to `p`; used as geometric fallback when `Ln:` is not reported. */
export function nearestSegment(
  segments: readonly Segment[],
  p: Vec4,
  options: NearestOptions = {},
): NearestSegment | null {
  const { mode = 'xy', includeRapids = true } = options;
  const start = Math.max(0, options.from ?? 0);
  const end = Math.min(segments.length, options.to ?? segments.length);
  let best: NearestSegment | null = null;
  for (let i = start; i < end; i++) {
    const segment = segments[i]!;
    if (!includeRapids && segment.motion === 'rapid') continue;
    const c = closestPoint(segment, p, mode);
    if (best === null || c.distance < best.distance) best = { ...c, index: i };
  }
  return best;
}
