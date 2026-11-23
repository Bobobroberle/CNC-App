import { segmentPoints, type HeightField, type Segment } from '@lowrider/gcode-core';

/** Kind of a path piece for colouring: rapid, feed above the stock, feed in the material. */
export const KIND_RAPID = 0;
export const KIND_AIR = 1;
export const KIND_CUT = 2;

export interface PathBuffers {
  /** Line pieces as pairs of points (x, y, z) */
  positions: Float32Array;
  /** Kind per line piece */
  kinds: Uint8Array;
  /** First line piece of each segment; length = segments + 1 */
  segmentStart: Uint32Array;
}

/** Toolpath as GPU line pieces, arcs as chords. Machine-coordinate moves are left out. */
export function pathBuffers(
  segments: readonly Segment[],
  surfaceZ: number,
  tolerance = 0.05,
): PathBuffers {
  const points: number[] = [];
  const kinds: number[] = [];
  const segmentStart = new Uint32Array(segments.length + 1);
  segments.forEach((s, i) => {
    segmentStart[i] = kinds.length;
    if (s.machineCoordinates) return;
    const pts = segmentPoints(s, tolerance);
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      points.push(a.x, a.y, a.z, b.x, b.y, b.z);
      kinds.push(
        s.motion === 'rapid'
          ? KIND_RAPID
          : Math.min(a.z, b.z) < surfaceZ - 1e-6
            ? KIND_CUT
            : KIND_AIR,
      );
    }
  });
  segmentStart[segments.length] = kinds.length;
  return { positions: new Float32Array(points), kinds: new Uint8Array(kinds), segmentStart };
}

export type Rgb = [number, number, number];

export interface PathPalette {
  rapid: Rgb;
  air: Rgb;
  cut: Rgb;
  done: Rgb;
}

/** Vertex colours: done pieces (segments before `done`) green, the rest by kind. */
export function pathColors(b: PathBuffers, done: number, palette: PathPalette): Float32Array {
  const colors = new Float32Array(b.kinds.length * 6);
  const doneUntil = b.segmentStart[Math.min(done, b.segmentStart.length - 1)]!;
  for (let i = 0; i < b.kinds.length; i++) {
    const c =
      i < doneUntil
        ? palette.done
        : b.kinds[i] === KIND_RAPID
          ? palette.rapid
          : b.kinds[i] === KIND_CUT
            ? palette.cut
            : palette.air;
    colors.set(c, i * 6);
    colors.set(c, i * 6 + 3);
  }
  return colors;
}

/**
 * Raises a height field to the top surface of a triangle mesh (STL stock):
 * every cell centre inside a triangle's XY projection takes the highest Z
 * found there; cells outside the model get `emptyZ`.
 */
export function rasterizeTop(
  field: HeightField,
  triangles: ArrayLike<number>,
  emptyZ: number,
): number {
  const { cols, rows, resolution, area } = field;
  const heights = field.heights;
  heights.fill(-Infinity);
  let covered = 0;
  for (let t = 0; t + 8 < triangles.length; t += 9) {
    const ax = triangles[t]!;
    const ay = triangles[t + 1]!;
    const az = triangles[t + 2]!;
    const bx = triangles[t + 3]!;
    const by = triangles[t + 4]!;
    const bz = triangles[t + 5]!;
    const cx = triangles[t + 6]!;
    const cy = triangles[t + 7]!;
    const cz = triangles[t + 8]!;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - area.minX) / resolution - 0.5));
    const c1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx, cx) - area.minX) / resolution - 0.5));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - area.minY) / resolution - 0.5));
    const r1 = Math.min(rows - 1, Math.ceil((Math.max(ay, by, cy) - area.minY) / resolution - 0.5));
    for (let r = r0; r <= r1; r++) {
      const py = area.minY + (r + 0.5) * resolution;
      for (let c = c0; c <= c1; c++) {
        const px = area.minX + (c + 0.5) * resolution;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const z = l1 * az + l2 * bz + l3 * cz;
        const i = r * cols + c;
        if (z > heights[i]!) heights[i] = z;
      }
    }
  }
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] === -Infinity) heights[i] = emptyZ;
    else covered++;
  }
  return covered;
}

/** Bounding box of a triangle soup. */
export function trianglesBounds(triangles: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < triangles.length; i++) {
    const axis = i % 3;
    const v = triangles[i]!;
    if (v < min[axis]!) min[axis] = v;
    if (v > max[axis]!) max[axis] = v;
  }
  return {
    min: { x: min[0]!, y: min[1]!, z: min[2]! },
    max: { x: max[0]!, y: max[1]!, z: max[2]! },
  };
}

/** Moves a model so its front left top corner is the work zero (the usual CAM setup). */
export function alignToZero(triangles: Float32Array): Float32Array {
  const b = trianglesBounds(triangles);
  const out = new Float32Array(triangles.length);
  for (let i = 0; i < triangles.length; i += 3) {
    out[i] = triangles[i]! - b.min.x;
    out[i + 1] = triangles[i + 1]! - b.min.y;
    out[i + 2] = triangles[i + 2]! - b.max.z;
  }
  return out;
}
