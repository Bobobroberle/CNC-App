import { describe, expect, it } from 'vitest';
import {
  estimateTime,
  interpret,
  LOWRIDER_V4_KINEMATICS,
  stateAtTime,
  timeAtSegment,
  type Kinematics,
} from '../src';

const kin: Kinematics = {
  axes: {
    x: { maxRate: 6000, acceleration: 100 },
    y: { maxRate: 6000, acceleration: 100 },
    z: { maxRate: 600, acceleration: 50 },
    a: { maxRate: 3600, acceleration: 100 },
  },
  junctionDeviation: 0.01,
  arcTolerance: 0.002,
};

const estimate = (text: string, k: Kinematics = kin) => {
  const r = interpret(text);
  return { ...r, timeline: estimateTime(r.segments, r.events, k) };
};

describe('estimateTime', () => {
  it('uses a trapezoidal profile for a single move', () => {
    // 100 mm at 3000 mm/min = 50 mm/s, a = 100 mm/s²: 0.5 s accel, 0.5 s decel, 1.5 s cruise
    const { timeline } = estimate('G1 X100 F3000');
    expect(timeline.total).toBeCloseTo(2.5, 6);
    expect(timeline.blocks[0]).toMatchObject({ vEntry: 0, vPeak: 50, vExit: 0 });
  });

  it('uses a triangular profile for short moves', () => {
    // 1 mm: never reaches nominal speed; t = 2·sqrt(L/a)
    const { timeline } = estimate('G1 X1 F3000');
    expect(timeline.total).toBeCloseTo(2 * Math.sqrt(1 / 100), 6);
  });

  it('limits rapids by the slowest axis component', () => {
    const { timeline } = estimate('G0 Z-10');
    const b = timeline.blocks[0]!;
    expect(b.vPeak).toBeCloseTo(10);
    expect(b.acceleration).toBe(50);
  });

  it('caps the feed at the axis maximum rate', () => {
    const { timeline } = estimate('G1 Z-10 F5000');
    expect(timeline.blocks[0]?.vPeak).toBeCloseTo(10);
  });

  it('keeps speed through collinear junctions and stops at reversals', () => {
    const straight = estimate('G1 X50 F3000\nX100').timeline;
    expect(straight.total).toBeCloseTo(2.5, 6);
    expect(straight.blocks[0]?.vExit).toBeCloseTo(50);
    const reverse = estimate('G1 X50 F3000\nX0').timeline;
    expect(reverse.blocks[0]?.vExit).toBe(0);
    const corner = estimate('G1 X50 F3000\nY50').timeline;
    const v = corner.blocks[0]!.vExit;
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(5);
  });

  it('splits arcs into chords and corners smoothly along them', () => {
    const { timeline } = estimate('G0 X10\nG3 X10 I-10 F600');
    expect(timeline.blocks.length).toBeGreaterThan(50);
    const arcBlocks = timeline.blocks.filter((b) => b.segmentIndex === 1);
    const middle = arcBlocks[Math.floor(arcBlocks.length / 2)]!;
    expect(middle.vEntry).toBeCloseTo(10, 1);
    // ~62.8 mm at 10 mm/s
    const arcTime = timeline.total - timeline.segmentStart[1]!;
    expect(arcTime).toBeGreaterThan(6.28);
    expect(arcTime).toBeLessThan(6.6);
  });

  it('treats feed as a 4D vector rate including A', () => {
    const { timeline } = estimate('G1 A360 F3600', {
      ...kin,
      axes: { ...kin.axes, a: { maxRate: 3600, acceleration: 1e9 } },
    });
    expect(timeline.total).toBeCloseTo(6, 3);
  });

  it('supports inverse time feed', () => {
    // F2 → each move takes 1/2 min regardless of length (ignoring acceleration)
    const fast: Kinematics = {
      ...kin,
      axes: {
        x: { maxRate: 6000, acceleration: 1e9 },
        y: { maxRate: 6000, acceleration: 1e9 },
        z: { maxRate: 6000, acceleration: 1e9 },
        a: { maxRate: 6000, acceleration: 1e9 },
      },
    };
    const { timeline } = estimate('G93 G1 X10 F2\nG1 A90 F4', fast);
    expect(timeline.segmentStart[1]).toBeCloseTo(30, 3);
    expect(timeline.total).toBeCloseTo(45, 3);
  });

  it('adds dwells, pauses, tool and spindle changes and stops at them', () => {
    const k = { ...kin, toolChangeSeconds: 30, pauseSeconds: 5, spindleSeconds: 2 };
    const { timeline } = estimate(
      'G1 X50 F3000\nG4 P1\nG1 X100\nM6 T2\nM0\nM3\nG1 X150\nM30\nM5',
      k,
    );
    expect(timeline.blocks[0]?.vExit).toBe(0);
    const moveTime = 2 * (0.5 + 0.5 + 0.5);
    expect(timeline.total).toBeCloseTo(moveTime * 1.5 + 1 + 30 + 5 + 2 + 2, 6);
    expect(timeline.segmentStart[1]).toBeCloseTo(1.5 + 1, 6);
    // without configured extras only the dwell counts
    expect(estimate('M6 T1\nM0\nM3\nG4 P2').timeline.total).toBe(2);
  });

  it('skips zero-length moves and handles empty programs', () => {
    const { timeline } = estimate('G1 X0 F100\nG1 X10\nG0 X10');
    expect(timeline.blocks).toHaveLength(1);
    expect(timeline.segmentFirstBlock[0]).toBe(1);
    expect(timeline.segmentFirstBlock[2]).toBe(1);
    expect(timeline.segmentStart[0]).toBe(0);
    expect(timeline.segmentStart[2]).toBeCloseTo(timeline.total);
    expect(estimate('').timeline.total).toBe(0);
  });

  it('ships placeholder LowRider kinematics', () => {
    expect(LOWRIDER_V4_KINEMATICS.axes.x.maxRate).toBeGreaterThan(0);
    expect(estimate('G1 X100 F1000', LOWRIDER_V4_KINEMATICS).timeline.total).toBeGreaterThan(6);
  });
});

describe('stateAtTime', () => {
  const r = estimate('G4 P1\nG1 X100 F3000\nG4 P1\nG1 Y10');
  const { timeline, segments } = r;

  it('returns null without motion', () => {
    expect(stateAtTime(estimate('G4 P1').timeline, [], 0)).toBeNull();
  });

  it('follows accel, cruise and decel phases', () => {
    const start = 1;
    expect(stateAtTime(timeline, segments, 0)).toMatchObject({ segmentIndex: 0, t: 0, speed: 0 });
    const accel = stateAtTime(timeline, segments, start + 0.25)!;
    expect(accel.position.x).toBeCloseTo(0.5 * 100 * 0.25 ** 2);
    expect(accel.speed).toBeCloseTo(25 * 60);
    const cruise = stateAtTime(timeline, segments, start + 1.25)!;
    expect(cruise.position.x).toBeCloseTo(12.5 + 50 * 0.75);
    expect(cruise.speed).toBeCloseTo(3000);
    const decel = stateAtTime(timeline, segments, start + 2.25)!;
    expect(decel.position.x).toBeCloseTo(100 - 0.5 * 100 * 0.25 ** 2);
    expect(decel.speed).toBeCloseTo(25 * 60);
  });

  it('holds position during a dwell and clamps the time', () => {
    const dwell = stateAtTime(timeline, segments, 1 + 2.5 + 0.5)!;
    expect(dwell).toMatchObject({ segmentIndex: 0, t: 1, speed: 0 });
    expect(dwell.position.x).toBe(100);
    const end = stateAtTime(timeline, segments, 1e6)!;
    expect(end.position).toEqual({ x: 100, y: 10, z: 0, a: 0 });
    expect(end.time).toBe(timeline.total);
    expect(stateAtTime(timeline, segments, -1)?.time).toBe(0);
  });
});

describe('timeAtSegment', () => {
  const r = estimate('G1 X100 F3000\nG0 X100\nG3 X100 I-10 F600');
  const { timeline, segments } = r;

  it('returns the start time and inverts the profile', () => {
    expect(timeAtSegment(timeline, 0)).toBe(0);
    expect(timeAtSegment(timeline, 0, 0.5)).toBeCloseTo(1.25, 6);
    // the arc continues at corner speed, so the block ends slightly before 2.5 s
    expect(timeAtSegment(timeline, 0, 1)).toBeCloseTo(timeline.blocks[0]!.duration, 6);
    const t = timeAtSegment(timeline, 2, 0.5);
    expect(stateAtTime(timeline, segments, t)?.t).toBeCloseTo(0.5, 4);
  });

  it('handles segments without blocks and out of range indices', () => {
    expect(timeAtSegment(timeline, 1, 0.5)).toBe(timeline.segmentStart[2]);
    expect(timeAtSegment(timeline, 99)).toBe(timeline.total);
    const last = estimate('G1 X10 F100\nG1 X10');
    expect(timeAtSegment(last.timeline, 1, 0.5)).toBe(last.timeline.total);
  });
});
