import { closestPoint, nearestSegment, type Segment, type Vec4 } from '@lowrider/gcode-core';

export interface TrackResult {
  /** Segment the tool is on */
  index: number;
  /** Parameter within the segment, 0…1 */
  t: number;
  /** XY distance tool ↔ programmed path in mm; null on rapids */
  deviation: number | null;
  source: 'line' | 'geometry';
}

/** Search a window around the last hit first; most reports move only a little. */
const WINDOW_BEHIND = 20;
const WINDOW_AHEAD = 400;
/** Beyond this distance the window result is distrusted and the whole job searched. */
const RESEARCH_DISTANCE = 2;

export function axesToVec4(values: readonly number[]): Vec4 {
  return { x: values[0] ?? 0, y: values[1] ?? 0, z: values[2] ?? 0, a: values[3] ?? 0 };
}

/**
 * Finds where on the job the machine is: via the `Ln:` line number when the
 * controller reports one, otherwise geometrically via the nearest segment.
 */
export class JobTracker {
  private readonly byLineNumber = new Map<number, number[]>();
  private last = 0;

  constructor(private readonly segments: readonly Segment[]) {
    for (const s of segments) {
      if (s.lineNumber === undefined) continue;
      const list = this.byLineNumber.get(s.lineNumber) ?? [];
      list.push(s.index);
      this.byLineNumber.set(s.lineNumber, list);
    }
  }

  reset(): void {
    this.last = 0;
  }

  locate(position: Vec4, lineNumber?: number): TrackResult | null {
    if (this.segments.length === 0) return null;
    const candidates = lineNumber === undefined ? undefined : this.byLineNumber.get(lineNumber);
    let index: number;
    let t: number;
    let distance: number;
    let source: TrackResult['source'];
    if (candidates) {
      let best = { index: candidates[0]!, t: 0, distance: Infinity };
      for (const i of candidates) {
        const c = closestPoint(this.segments[i]!, position);
        // Prefer going forward on ties (e.g. repeated N numbers).
        if (c.distance < best.distance || (c.distance === best.distance && i >= this.last)) {
          best = { index: i, t: c.t, distance: c.distance };
        }
      }
      ({ index, t, distance } = best);
      source = 'line';
    } else {
      let hit = nearestSegment(this.segments, position, {
        from: this.last - WINDOW_BEHIND,
        to: this.last + WINDOW_AHEAD,
      })!;
      if (hit.distance > RESEARCH_DISTANCE) {
        const global = nearestSegment(this.segments, position)!;
        if (global.distance < hit.distance) hit = global;
      }
      ({ index, t, distance } = hit);
      source = 'geometry';
    }
    this.last = index;
    const deviation = this.segments[index]!.motion === 'rapid' ? null : distance;
    return { index, t, deviation, source };
  }
}
