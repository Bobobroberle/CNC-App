import * as ClipperLib from 'clipper-lib';
import { signedArea, type Point } from './geometry';

/** Clipper works in integers: micrometres. */
const SCALE = 1000;

const toPath = (points: readonly Point[]): ClipperLib.Path =>
  points.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
const fromPath = (path: ClipperLib.Path): Point[] =>
  path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE }));

/**
 * Offsets closed polygons (outer counter-clockwise, holes clockwise) by
 * `delta` mm: positive grows, negative shrinks. Corners stay round, as a
 * round cutter leaves them. Polygons that vanish are dropped.
 */
export function offsetPolygons(
  polygons: readonly Point[][],
  delta: number,
  tolerance = 0.01,
): Point[][] {
  const co = new ClipperLib.ClipperOffset(2, tolerance * SCALE);
  co.AddPaths(
    polygons.map(toPath),
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon,
  );
  const out: ClipperLib.Paths = [];
  co.Execute(out, delta * SCALE);
  return out.map(fromPath).filter((p) => p.length >= 3);
}

/** Outer outline counter-clockwise, holes clockwise: what the offset expects. */
export function region(outer: readonly Point[], holes: readonly Point[][]): Point[][] {
  const ccw = (p: readonly Point[]) => (signedArea(p) >= 0 ? [...p] : [...p].reverse());
  const cw = (p: readonly Point[]) => (signedArea(p) < 0 ? [...p] : [...p].reverse());
  return [ccw(outer), ...holes.map(cw)];
}

/** The band a round cutter of radius `r` clears along an open line. */
export function strokeLine(points: readonly Point[], r: number, tolerance = 0.01): Point[][] {
  const co = new ClipperLib.ClipperOffset(2, tolerance * SCALE);
  co.AddPath(toPath(points), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
  const out: ClipperLib.Paths = [];
  co.Execute(out, r * SCALE);
  return out.map(fromPath);
}

function clip(
  type: ClipperLib.ClipType,
  subject: readonly Point[][],
  other: readonly Point[][],
): Point[][] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject.map(toPath), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(other.map(toPath), ClipperLib.PolyType.ptClip, true);
  const out: ClipperLib.Paths = [];
  const fill = ClipperLib.PolyFillType.pftNonZero;
  c.Execute(type, out, fill, fill);
  return out.map(fromPath);
}

/** What two areas have in common (polygons as `region` gives them). */
export const intersectPolygons = (a: readonly Point[][], b: readonly Point[][]): Point[][] =>
  clip(ClipperLib.ClipType.ctIntersection, a, b);

/** The first area without the second. */
export const subtractPolygons = (a: readonly Point[][], b: readonly Point[][]): Point[][] =>
  clip(ClipperLib.ClipType.ctDifference, a, b);

/** Several areas as one. */
export const unitePolygons = (a: readonly Point[][]): Point[][] =>
  clip(ClipperLib.ClipType.ctUnion, a, []);

/** Area of polygons with their holes (outer counter-clockwise, holes clockwise), mm². */
export const polygonsArea = (polygons: readonly Point[][]): number =>
  Math.abs(polygons.reduce((sum, p) => sum + signedArea(p), 0));
