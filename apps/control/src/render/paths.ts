import { segmentPoints, type Segment, type Vec4 } from '@lowrider/gcode-core';
import type { TableProjection } from '../store/job';

export type Projection = (p: Vec4) => [number, number];

export function projection(view: TableProjection, rotaryDiameter: number): Projection {
  switch (view) {
    case 'side':
      return (p) => [p.x, p.z];
    case 'unwrapped': {
      const perDegree = (Math.PI * rotaryDiameter) / 360;
      return (p) => [p.x, p.a * perDegree];
    }
    default:
      return (p) => [p.x, p.y];
  }
}

export interface Extent {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

export interface JobPaths {
  project: Projection;
  rapid: Path2D;
  /** Feed moves grouped by depth; index 0 = above Z0 */
  depth: Path2D[];
  /** Feed moves in fixed-size chunks, for the "done" overlay */
  chunks: Path2D[];
  chunkSize: number;
  extent: Extent | null;
}

export const DEPTH_BUCKETS = 5;
const CHUNK_SIZE = 256;
/** Chord tolerance for drawing arcs, mm */
const DRAW_TOLERANCE = 0.05;

export function traceSegment(
  path: Path2D,
  segment: Segment,
  project: Projection,
  untilT = 1,
): void {
  const points = segmentPoints(segment, DRAW_TOLERANCE);
  const [u0, v0] = project(points[0]!);
  path.moveTo(u0, v0);
  const last = points.length - 1;
  const end = untilT * last;
  for (let i = 1; i <= last; i++) {
    if (i <= end) {
      const [u, v] = project(points[i]!);
      path.lineTo(u, v);
    } else {
      // Partial chord up to untilT.
      const a = points[i - 1]!;
      const b = points[i]!;
      const f = end - (i - 1);
      const [u, v] = project({
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        z: a.z + (b.z - a.z) * f,
        a: a.a + (b.a - a.a) * f,
      });
      path.lineTo(u, v);
      break;
    }
  }
}

/**
 * Builds world-space paths once per job and view; zoom and pan only change the
 * transform. `surfaceZ` is the top of the material: 0 for flat stock, the
 * radius for rotary jobs with Z0 on the rotation axis.
 */
export function buildPaths(
  segments: readonly Segment[],
  project: Projection,
  surfaceZ = 0,
): JobPaths {
  const rapid = new Path2D();
  const depth = Array.from({ length: DEPTH_BUCKETS }, () => new Path2D());
  const chunks: Path2D[] = [];
  let maxDepth = 0;
  for (const s of segments) {
    if (s.motion !== 'rapid') maxDepth = Math.max(maxDepth, surfaceZ - s.from.z, surfaceZ - s.to.z);
  }

  let extent: Extent | null = null;
  const grow = (p: Vec4) => {
    const [u, v] = project(p);
    if (!extent) extent = { minU: u, maxU: u, minV: v, maxV: v };
    else {
      extent.minU = Math.min(extent.minU, u);
      extent.maxU = Math.max(extent.maxU, u);
      extent.minV = Math.min(extent.minV, v);
      extent.maxV = Math.max(extent.maxV, v);
    }
  };

  for (const s of segments) {
    if (s.machineCoordinates) continue;
    const chunkIndex = Math.floor(s.index / CHUNK_SIZE);
    chunks[chunkIndex] ??= new Path2D();
    if (s.motion === 'rapid') {
      traceSegment(rapid, s, project);
      grow(s.from);
      grow(s.to);
      continue;
    }
    const cut = surfaceZ - Math.min(s.from.z, s.to.z);
    const bucket =
      cut <= 0
        ? 0
        : 1 +
          Math.min(DEPTH_BUCKETS - 2, Math.floor((cut / maxDepth) * (DEPTH_BUCKETS - 1) - 1e-9));
    traceSegment(depth[bucket]!, s, project);
    traceSegment(chunks[chunkIndex]!, s, project);
    for (const p of segmentPoints(s, 1)) grow(p);
  }
  for (let i = 0; i < chunks.length; i++) chunks[i] ??= new Path2D();
  return { project, rapid, depth, chunks, chunkSize: CHUNK_SIZE, extent };
}
