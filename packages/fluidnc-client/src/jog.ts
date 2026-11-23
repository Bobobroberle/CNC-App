export type JogAxis = 'X' | 'Y' | 'Z';

/** Allowed travel of one axis in machine coordinates (mm). */
export interface AxisRange {
  min: number;
  max: number;
}

export interface JogTarget {
  /** Machine coordinate to jog to */
  target: number;
  /** True if the requested distance was shortened at the limit */
  limited: boolean;
}

/** Smallest move worth sending, mm */
const MIN_MOVE = 0.001;

const fmt = (v: number) => {
  const text = v.toFixed(3).replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
};

/**
 * Software end stop for jogging: the target `base + distance` is clamped to
 * the axis range. Never moves against the requested direction, even when the
 * machine already stands outside the range. Returns null if no move is left.
 */
export function clampJogTarget(base: number, distance: number, range: AxisRange): JogTarget | null {
  const wanted = base + distance;
  const target =
    distance > 0
      ? Math.max(base, Math.min(wanted, range.max))
      : Math.min(base, Math.max(wanted, range.min));
  if (Math.abs(target - base) < MIN_MOVE) return null;
  return { target, limited: Math.abs(target - wanted) >= MIN_MOVE };
}

/** Jog to an absolute machine coordinate (used with software end stops). */
export function jogToMachine(axis: JogAxis, target: number, feed: number): string {
  return `$J=G53 G90 G21 ${axis}${fmt(target)} F${Math.round(feed)}`;
}

/** Relative jog without limits (machine not homed). */
export function jogRelative(axis: JogAxis, distance: number, feed: number): string {
  return `$J=G91 G21 ${axis}${fmt(distance)} F${Math.round(feed)}`;
}

/** Jog X and Y together: to a machine position (homed) or by a distance. */
export function jogXY(mode: 'machine' | 'relative', x: number, y: number, feed: number): string {
  const words = `X${fmt(x)} Y${fmt(y)} F${Math.round(feed)}`;
  return mode === 'machine' ? `$J=G53 G90 G21 ${words}` : `$J=G91 G21 ${words}`;
}
