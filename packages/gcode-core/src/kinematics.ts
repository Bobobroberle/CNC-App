import type { Kinematics } from './time';

/**
 * V1E LowRider v4 on a Jackpot 2 board, from the V1E stock config.yaml
 * (machine/config.yaml): axes.*.max_rate_mm_per_min / acceleration_mm_per_sec2
 * and the FluidNC defaults junction_deviation_mm 0.01, arc_tolerance_mm 0.002.
 * The machine has no rotary axis; the A values only keep the type complete.
 */
export const LOWRIDER_V4_KINEMATICS: Kinematics = {
  axes: {
    x: { maxRate: 9000, acceleration: 200 },
    y: { maxRate: 9000, acceleration: 200 },
    z: { maxRate: 1200, acceleration: 80 },
    a: { maxRate: 3600, acceleration: 300 },
  },
  junctionDeviation: 0.01,
  arcTolerance: 0.002,
  toolChangeSeconds: 60,
  pauseSeconds: 0,
  spindleSeconds: 0,
};
