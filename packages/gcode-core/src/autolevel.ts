import { pointAt } from './geometry';
import { interpret, MM_PER_INCH } from './interpreter';
import { parseProgram, splitLines } from './parser';
import { formatNumber } from './transform';
import type { Diagnostic, Segment } from './types';

export interface ProbeGrid {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Points per direction, at least 2 */
  cols: number;
  rows: number;
}

/** Grid points in serpentine order (short travel between probes). */
export function probeGridPoints(
  grid: ProbeGrid,
): { x: number; y: number; col: number; row: number }[] {
  if (grid.cols < 2 || grid.rows < 2)
    throw new RangeError('A probe grid needs at least 2×2 points');
  const points = [];
  for (let row = 0; row < grid.rows; row++) {
    const y = grid.minY + ((grid.maxY - grid.minY) * row) / (grid.rows - 1);
    for (let k = 0; k < grid.cols; k++) {
      const col = row % 2 === 0 ? k : grid.cols - 1 - k;
      const x = grid.minX + ((grid.maxX - grid.minX) * col) / (grid.cols - 1);
      points.push({ x, y, col, row });
    }
  }
  return points;
}

/** Surface heights measured on a grid; bilinear in between, clamped outside. */
export class HeightMap {
  constructor(
    readonly grid: ProbeGrid,
    /** Z per point, row-major (index = row * cols + col) */
    readonly z: readonly number[],
  ) {
    if (z.length !== grid.cols * grid.rows)
      throw new RangeError('Height map size does not match grid');
  }

  at(x: number, y: number): number {
    const { grid } = this;
    const fx = ((x - grid.minX) / (grid.maxX - grid.minX)) * (grid.cols - 1);
    const fy = ((y - grid.minY) / (grid.maxY - grid.minY)) * (grid.rows - 1);
    const cx = Math.min(grid.cols - 1, Math.max(0, fx));
    const cy = Math.min(grid.rows - 1, Math.max(0, fy));
    const c0 = Math.min(grid.cols - 2, Math.floor(cx));
    const r0 = Math.min(grid.rows - 2, Math.floor(cy));
    const tx = cx - c0;
    const ty = cy - r0;
    const v = (c: number, r: number) => this.z[r * grid.cols + c]!;
    const top = v(c0, r0) * (1 - tx) + v(c0 + 1, r0) * tx;
    const bottom = v(c0, r0 + 1) * (1 - tx) + v(c0 + 1, r0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /** Spread between the lowest and the highest point, mm */
  range(): number {
    return Math.max(...this.z) - Math.min(...this.z);
  }
}

export interface AutolevelResult {
  text: string;
  warnings: Diagnostic[];
}

/**
 * Follows a warped surface: every move in work coordinates is split into
 * pieces of at most `maxSegment` mm (arcs into chords) and each end point is
 * raised by the measured height there. Motion is written in absolute G90;
 * lines without motion stay as they are.
 */
export function applyHeightMap(text: string, map: HeightMap, maxSegment = 2): AutolevelResult {
  const parsed = parseProgram(text);
  const raw = splitLines(text);
  const result = interpret(parsed, { recordLines: true });
  const warnings: Diagnostic[] = [];
  const bySource = new Map<number, Segment[]>();
  for (const s of result.segments) {
    const list = bySource.get(s.lineIndex) ?? [];
    list.push(s);
    bySource.set(s.lineIndex, list);
  }
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const segments = bySource.get(i);
    const info = result.lines[i]!;
    if (info.axisUse === 'offset' || info.axisUse === 'ignored') {
      warnings.push({
        severity: 'warning',
        code: 'transform-unsupported',
        lineIndex: i,
        message: 'Offsets and stored positions are not levelled',
      });
    }
    if (!segments || segments[0]!.machineCoordinates) {
      out.push(raw[i]!);
      continue;
    }
    const segment = segments[0]!;
    if (segment.feedMode === 'inverseTime') {
      warnings.push({
        severity: 'warning',
        code: 'transform-unsupported',
        lineIndex: i,
        message: 'Inverse time moves are not levelled',
      });
      out.push(raw[i]!);
      continue;
    }
    const line = parsed[i]!;
    const gCodes = line.words.filter((w) => w.letter === 'G').map((w) => Math.round(w.value * 10));
    const units =
      gCodes.includes(200) || (info.stateBefore.units === 'inch' && !gCodes.includes(210))
        ? 'inch'
        : 'mm';
    const uf = units === 'inch' ? MM_PER_INCH : 1;
    const n = (mm: number) => formatNumber(mm / uf, units);
    // Motion and distance modes are rewritten; every other word stays (G54, G21, M3, S…).
    const replaced = new Set([0, 10, 20, 30, 900, 910, 901, 911]);
    const keep = line.words
      .filter((w) =>
        w.letter === 'G'
          ? !replaced.has(Math.round(w.value * 10))
          : !'XYZIJKRFA'.includes(w.letter),
      )
      .map((w) => `${w.letter}${w.value}`);
    const comments = line.comments.map((c) => (c.style === 'paren' ? `(${c.text})` : `;${c.text}`));
    const rapid = segment.motion === 'rapid';
    const pieces = rapid
      ? 1
      : Math.max(1, Math.ceil(segment.length / maxSegment), segment.arc ? 8 : 1);
    for (let k = 1; k <= pieces; k++) {
      const p = pointAt(segment, k / pieces);
      const words = [
        `G90 ${rapid ? 'G0' : 'G1'}`,
        `X${n(p.x)}`,
        `Y${n(p.y)}`,
        `Z${n(p.z + map.at(p.x, p.y))}`,
      ];
      if (segment.from.a !== segment.to.a) words.push(`A${formatNumber(p.a)}`);
      if (k === 1 && !rapid) words.push(`F${n(segment.feed)}`);
      if (k === 1) words.push(...keep, ...comments);
      out.push(words.join(' '));
    }
  }
  return { text: out.join('\n') + (/\r?\n$/.test(text) ? '\n' : ''), warnings };
}
