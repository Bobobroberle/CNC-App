import { segmentPoints } from './geometry';
import type { Segment, Vec4 } from './types';

export type ToolKind = 'flat' | 'ball' | 'vbit';

export interface ToolShape {
  kind: ToolKind;
  diameter: number;
  /** Included angle of a V-bit in degrees */
  angle?: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Height above the tip of the tool surface at distance `d` from its axis, or
 * Infinity outside the cutter.
 */
export function toolProfile(tool: ToolShape, d: number): number {
  const r = tool.diameter / 2;
  if (d > r) return Infinity;
  if (tool.kind === 'ball') return r - Math.sqrt(r * r - d * d);
  if (tool.kind === 'vbit') {
    const half = (((tool.angle ?? 90) / 2) * Math.PI) / 180;
    return d / Math.tan(half);
  }
  return 0;
}

/**
 * Stock top as a grid of heights (Z in work coordinates). Moving the tool
 * through it lowers every cell to the tool surface – the classic
 * height-field material removal used for 2.5D simulation.
 */
export class HeightField {
  readonly cols: number;
  readonly rows: number;
  readonly heights: Float32Array;

  constructor(
    readonly area: Rect,
    readonly resolution: number,
    readonly topZ: number,
  ) {
    if (!(resolution > 0) || area.maxX <= area.minX || area.maxY <= area.minY) {
      throw new RangeError('Invalid height field area or resolution');
    }
    this.cols = Math.max(1, Math.ceil((area.maxX - area.minX) / resolution));
    this.rows = Math.max(1, Math.ceil((area.maxY - area.minY) / resolution));
    this.heights = new Float32Array(this.cols * this.rows).fill(topZ);
  }

  /** Grid with at most `maxCells` cells over `area`. */
  static fitting(area: Rect, topZ: number, maxCells: number, minResolution = 0.1): HeightField {
    const w = area.maxX - area.minX;
    const h = area.maxY - area.minY;
    const resolution = Math.max(minResolution, Math.sqrt((w * h) / maxCells));
    return new HeightField(area, resolution, topZ);
  }

  reset(): void {
    this.heights.fill(this.topZ);
  }

  /** Cell centre in work coordinates */
  cellCenter(col: number, row: number): [number, number] {
    return [
      this.area.minX + (col + 0.5) * this.resolution,
      this.area.minY + (row + 0.5) * this.resolution,
    ];
  }

  heightAt(x: number, y: number): number {
    const col = Math.floor((x - this.area.minX) / this.resolution);
    const row = Math.floor((y - this.area.minY) / this.resolution);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return this.topZ;
    return this.heights[row * this.cols + col]!;
  }

  /** Lowers the cells under one tool position. */
  stamp(x: number, y: number, z: number, tool: ToolShape): void {
    if (z >= this.topZ) return;
    const r = tool.diameter / 2;
    const c0 = Math.max(0, Math.floor((x - r - this.area.minX) / this.resolution));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r - this.area.minX) / this.resolution));
    const r0 = Math.max(0, Math.floor((y - r - this.area.minY) / this.resolution));
    const r1 = Math.min(this.rows - 1, Math.floor((y + r - this.area.minY) / this.resolution));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const [cx, cy] = this.cellCenter(col, row);
        const surface = z + toolProfile(tool, Math.hypot(cx - x, cy - y));
        const i = row * this.cols + col;
        if (surface < this.heights[i]!) this.heights[i] = surface;
      }
    }
  }

  /** Sweeps the tool along a straight move, stamping at half-cell steps. */
  sweep(from: Vec4, to: Vec4, tool: ToolShape): void {
    if (from.z >= this.topZ && to.z >= this.topZ) return;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(length / (this.resolution / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.stamp(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        from.z + (to.z - from.z) * t,
        tool,
      );
    }
  }

  /** Cuts segments [from, to) and, if given, the segment `to` up to parameter `t`. */
  cut(segments: readonly Segment[], tool: ToolShape, from = 0, to = segments.length, t = 0): void {
    const cutPart = (s: Segment, until: number) => {
      if (s.machineCoordinates) return;
      const points = segmentPoints(s, this.resolution / 4);
      const last = (points.length - 1) * until;
      for (let i = 1; i < points.length && i - 1 < last; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const f = Math.min(1, last - (i - 1));
        const end = {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          z: a.z + (b.z - a.z) * f,
          a: a.a + (b.a - a.a) * f,
        };
        this.sweep(a, end, tool);
      }
    };
    for (let i = Math.max(0, from); i < Math.min(to, segments.length); i++)
      cutPart(segments[i]!, 1);
    const partial = segments[to];
    if (partial && t > 0) cutPart(partial, t);
  }

  /** Removed material in mm³ */
  removedVolume(): number {
    let sum = 0;
    for (const h of this.heights) sum += this.topZ - h;
    return sum * this.resolution * this.resolution;
  }
}
