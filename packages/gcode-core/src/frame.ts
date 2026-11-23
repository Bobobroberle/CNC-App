import { formatNumber } from './transform';

export interface FrameOptions {
  /** Work XY rectangle to trace (usually the job's cut bounds) */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Machine Z for the whole trace (G53), above stock and clamps */
  safeMachineZ: number;
  /** Feed in mm/min; slow enough to watch */
  feed: number;
}

/**
 * Traces the job's outline at a safe height so the operator sees where the
 * job will be cut before starting it. Returns to the first corner.
 */
export function frameProgram(o: FrameOptions): string[] {
  const f = formatNumber;
  return [
    '(LowRider Control: frame)',
    'G21 G90 G94',
    `G53 G0 Z${f(o.safeMachineZ)}`,
    `G0 X${f(o.minX)} Y${f(o.minY)}`,
    `G1 X${f(o.maxX)} F${f(o.feed)}`,
    `G1 Y${f(o.maxY)}`,
    `G1 X${f(o.minX)}`,
    `G1 Y${f(o.minY)}`,
  ];
}
