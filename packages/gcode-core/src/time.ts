import { arcChordCount, pointAt } from './geometry';
import { AXES, type AxisKey, type ProgramEvent, type Segment, type Vec4 } from './types';

export interface AxisLimits {
  /** mm/min (deg/min for A) */
  maxRate: number;
  /** mm/s² (deg/s² for A) */
  acceleration: number;
}

export interface Kinematics {
  axes: Record<AxisKey, AxisLimits>;
  /** FluidNC `junction_deviation_mm` */
  junctionDeviation: number;
  /** FluidNC `arc_tolerance_mm` */
  arcTolerance: number;
  /** Seconds added per M6 tool change (manual change takes time) */
  toolChangeSeconds?: number;
  /** Seconds added per M0/M1 pause */
  pauseSeconds?: number;
  /** Seconds added per spindle start/stop (FluidNC `spinup_ms`/`spindown_ms`) */
  spindleSeconds?: number;
}

/**
 * One planner block: a straight piece of motion with a trapezoidal velocity
 * profile. Arcs are split into chords like the firmware does.
 */
export interface Block {
  segmentIndex: number;
  /** Segment parameter range covered by this block */
  t0: number;
  t1: number;
  length: number;
  /** Entry, peak and exit speed in units/s */
  vEntry: number;
  vPeak: number;
  vExit: number;
  acceleration: number;
  startTime: number;
  duration: number;
}

export interface Timeline {
  /** Seconds */
  total: number;
  blocks: Block[];
  /** Start time of each segment (seconds) */
  segmentStart: Float64Array;
  /** Index of the first block of each segment (blocks.length if it has none) */
  segmentFirstBlock: Int32Array;
}

export interface MotionState {
  time: number;
  segmentIndex: number;
  /** Parameter within the segment, 0…1 */
  t: number;
  position: Vec4;
  /** Current speed in units/min */
  speed: number;
}

const EPS = 1e-9;
const MIN_JUNCTION_COS = -0.999999;
const MAX_JUNCTION_COS = 0.999999;

interface Draft {
  segmentIndex: number;
  t0: number;
  t1: number;
  length: number;
  unit: Vec4;
  vNominal: number;
  acceleration: number;
  /** Max entry speed² from junction geometry */
  maxEntry2: number;
  /** Planner must stop before this block (dwell, pause, program start) */
  stopBefore: boolean;
  /** Pause inserted before this block (seconds) */
  delay: number;
}

function limitByAxes(unit: Vec4, perAxis: (axis: AxisKey) => number): number {
  let limit = Infinity;
  for (const axis of AXES) {
    const component = Math.abs(unit[axis]);
    if (component > EPS) limit = Math.min(limit, perAxis(axis) / component);
  }
  return limit;
}

function stopSeconds(event: ProgramEvent, kinematics: Kinematics): number {
  switch (event.kind) {
    case 'dwell':
      return event.seconds!;
    case 'toolChange':
      return kinematics.toolChangeSeconds ?? 0;
    case 'pause':
      return kinematics.pauseSeconds ?? 0;
    case 'spindle':
      return kinematics.spindleSeconds ?? 0;
    default:
      return 0;
  }
}

/**
 * Estimates the run time of a program with the firmware's planner model:
 * per-axis rate and acceleration limits, junction deviation cornering and
 * trapezoidal speed profiles with look-ahead over the whole program.
 */
export function estimateTime(
  segments: readonly Segment[],
  events: readonly ProgramEvent[],
  kinematics: Kinematics,
): Timeline {
  const drafts: Draft[] = [];
  const segmentFirstBlock = new Int32Array(segments.length);
  let eventIndex = 0;
  let pendingStop = true;
  let pendingDelay = 0;

  for (const segment of segments) {
    while (eventIndex < events.length && events[eventIndex]!.segmentIndex <= segment.index) {
      // The firmware syncs the planner on every M/T event, so motion stops.
      pendingStop = true;
      pendingDelay += stopSeconds(events[eventIndex++]!, kinematics);
    }
    segmentFirstBlock[segment.index] = drafts.length;
    const pieces = segment.arc
      ? arcChordCount(segment.arc.radius, segment.arc.sweep, kinematics.arcTolerance)
      : 1;
    // 4D length of the whole segment; feed applies to all axes including A.
    let prev = segment.from;
    let totalLength = 0;
    const chords: { t0: number; t1: number; d: Vec4; length: number }[] = [];
    for (let i = 1; i <= pieces; i++) {
      const t1 = i / pieces;
      const next = pieces === 1 ? segment.to : pointAt(segment, t1);
      const d = { x: next.x - prev.x, y: next.y - prev.y, z: next.z - prev.z, a: next.a - prev.a };
      const length = Math.hypot(d.x, d.y, d.z, d.a);
      chords.push({ t0: (i - 1) / pieces, t1, d, length });
      totalLength += length;
      prev = next;
    }
    for (const chord of chords) {
      if (chord.length < EPS) continue;
      const unit = {
        x: chord.d.x / chord.length,
        y: chord.d.y / chord.length,
        z: chord.d.z / chord.length,
        a: chord.d.a / chord.length,
      };
      const rateLimit = limitByAxes(unit, (axis) => kinematics.axes[axis].maxRate) / 60;
      let vNominal: number;
      if (segment.motion === 'rapid') vNominal = rateLimit;
      else if (segment.feedMode === 'inverseTime') vNominal = (segment.feed * totalLength) / 60;
      else vNominal = segment.feed / 60;
      vNominal = Math.min(vNominal, rateLimit);
      const acceleration = limitByAxes(unit, (axis) => kinematics.axes[axis].acceleration);
      drafts.push({
        segmentIndex: segment.index,
        t0: chord.t0,
        t1: chord.t1,
        length: chord.length,
        unit,
        vNominal,
        acceleration,
        maxEntry2: 0,
        stopBefore: pendingStop,
        delay: pendingDelay,
      });
      pendingStop = false;
      pendingDelay = 0;
    }
  }
  let trailingDelay = pendingDelay;
  while (eventIndex < events.length)
    trailingDelay += stopSeconds(events[eventIndex++]!, kinematics);

  // Junction speed limits (Grbl/FluidNC junction deviation model).
  for (let i = 0; i < drafts.length; i++) {
    const block = drafts[i]!;
    const prev = drafts[i - 1];
    if (!prev || block.stopBefore) {
      block.maxEntry2 = 0;
      continue;
    }
    const cos = -AXES.reduce((sum, axis) => sum + prev.unit[axis] * block.unit[axis], 0);
    let v2: number;
    if (cos > MAX_JUNCTION_COS) {
      v2 = 0; // full reversal
    } else if (cos < MIN_JUNCTION_COS) {
      v2 = Infinity; // straight on
    } else {
      const junction = {
        x: block.unit.x - prev.unit.x,
        y: block.unit.y - prev.unit.y,
        z: block.unit.z - prev.unit.z,
        a: block.unit.a - prev.unit.a,
      };
      const norm = Math.hypot(junction.x, junction.y, junction.z, junction.a);
      for (const axis of AXES) junction[axis] /= norm;
      const accel = limitByAxes(junction, (axis) => kinematics.axes[axis].acceleration);
      const sinHalf = Math.sqrt(0.5 * (1 - cos));
      v2 = (accel * kinematics.junctionDeviation * sinHalf) / (1 - sinHalf);
    }
    block.maxEntry2 = Math.min(v2, block.vNominal ** 2, prev.vNominal ** 2);
  }

  // Backward pass: every block must be able to decelerate to the next entry.
  const entry2 = new Float64Array(drafts.length + 1);
  entry2[drafts.length] = 0;
  for (let i = drafts.length - 1; i >= 0; i--) {
    const b = drafts[i]!;
    entry2[i] = Math.min(b.maxEntry2, entry2[i + 1]! + 2 * b.acceleration * b.length);
  }
  // Forward pass: and accelerate from the previous entry.
  for (let i = 1; i < drafts.length; i++) {
    const p = drafts[i - 1]!;
    entry2[i] = Math.min(entry2[i]!, entry2[i - 1]! + 2 * p.acceleration * p.length);
  }

  const blocks: Block[] = [];
  let time = 0;
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i]!;
    time += d.delay;
    const vEntry = Math.sqrt(entry2[i]!);
    const vExit = Math.sqrt(entry2[i + 1]!);
    const a = d.acceleration;
    const vPeak = Math.sqrt(
      Math.min(d.vNominal ** 2, (2 * a * d.length + entry2[i]! + entry2[i + 1]!) / 2),
    );
    const accelDist = (vPeak * vPeak - vEntry * vEntry) / (2 * a);
    const decelDist = (vPeak * vPeak - vExit * vExit) / (2 * a);
    const cruise = Math.max(0, d.length - accelDist - decelDist);
    const duration = (vPeak - vEntry) / a + cruise / vPeak + (vPeak - vExit) / a;
    blocks.push({
      segmentIndex: d.segmentIndex,
      t0: d.t0,
      t1: d.t1,
      length: d.length,
      vEntry,
      vPeak,
      vExit,
      acceleration: a,
      startTime: time,
      duration,
    });
    time += duration;
  }

  const segmentStart = new Float64Array(segments.length);
  for (let s = segments.length - 1, next = time; s >= 0; s--) {
    const first = segmentFirstBlock[s]!;
    const block = blocks[first];
    if (block && block.segmentIndex === s) next = block.startTime;
    else segmentFirstBlock[s] = blocks.length;
    segmentStart[s] = next;
  }
  return { total: time + trailingDelay, blocks, segmentStart, segmentFirstBlock };
}

/** Distance travelled and speed at time `tau` into a block. */
function profileAt(block: Block, tau: number): { distance: number; speed: number } {
  const a = block.acceleration;
  const tAccel = (block.vPeak - block.vEntry) / a;
  const tDecel = (block.vPeak - block.vExit) / a;
  const dAccel = (block.vEntry + block.vPeak) * 0.5 * tAccel;
  const tCruise = block.duration - tAccel - tDecel;
  if (tau <= tAccel) {
    return { distance: block.vEntry * tau + 0.5 * a * tau * tau, speed: block.vEntry + a * tau };
  }
  if (tau <= tAccel + tCruise) {
    return { distance: dAccel + block.vPeak * (tau - tAccel), speed: block.vPeak };
  }
  const td = Math.min(tau, block.duration) - tAccel - tCruise;
  return {
    distance: Math.min(
      block.length,
      dAccel + block.vPeak * tCruise + block.vPeak * td - 0.5 * a * td * td,
    ),
    speed: Math.max(block.vExit, block.vPeak - a * td),
  };
}

/** Machine state at a time on the timeline (for simulation playback). */
export function stateAtTime(
  timeline: Timeline,
  segments: readonly Segment[],
  time: number,
): MotionState | null {
  const { blocks } = timeline;
  if (blocks.length === 0) return null;
  const t = Math.min(Math.max(0, time), timeline.total);
  // Binary search for the last block that starts at or before t.
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (blocks[mid]!.startTime <= t) lo = mid;
    else hi = mid - 1;
  }
  const block = blocks[lo]!;
  const segment = segments[block.segmentIndex]!;
  const tau = t - block.startTime;
  if (tau < 0) {
    return {
      time: t,
      segmentIndex: segment.index,
      t: block.t0,
      position: pointAt(segment, block.t0),
      speed: 0,
    };
  }
  if (tau >= block.duration) {
    return {
      time: t,
      segmentIndex: segment.index,
      t: block.t1,
      position: pointAt(segment, block.t1),
      speed: 0,
    };
  }
  const { distance, speed } = profileAt(block, tau);
  const param = block.t0 + (block.t1 - block.t0) * (distance / block.length);
  return {
    time: t,
    segmentIndex: segment.index,
    t: param,
    position: pointAt(segment, param),
    speed: speed * 60,
  };
}

/** Time at which the machine reaches parameter `t` of a segment. */
export function timeAtSegment(timeline: Timeline, segmentIndex: number, t = 0): number {
  const first = timeline.segmentFirstBlock[segmentIndex];
  if (first === undefined) return timeline.total;
  const start = timeline.segmentStart[segmentIndex]!;
  if (t <= 0) return start;
  const { blocks } = timeline;
  for (let i = first; i < blocks.length && blocks[i]!.segmentIndex === segmentIndex; i++) {
    const b = blocks[i]!;
    if (t > b.t1) continue;
    const target = ((t - b.t0) / (b.t1 - b.t0)) * b.length;
    // Invert the profile by bisection; blocks are short so this is cheap.
    let lo = 0;
    let hi = b.duration;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (profileAt(b, mid).distance < target) lo = mid;
      else hi = mid;
    }
    return b.startTime + hi;
  }
  const next = timeline.segmentStart[segmentIndex + 1];
  return next ?? timeline.total;
}
