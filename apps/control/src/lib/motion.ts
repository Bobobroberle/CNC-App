import { jogXY, type ParserState } from '@lowrider/fluidnc-client';
import { frameProgram, type Bounds } from '@lowrider/gcode-core';

const f = (n: number) => String(Number(n.toFixed(3)));

/**
 * Lifting the tool clear of the work: to a machine height once homed (MPos
 * is trustworthy), otherwise relative by `lift` mm and back to absolute.
 */
export function safeLift(homed: boolean, safeMachineZ: number, lift = 20): string[] {
  return homed ? [`G53 G0 Z${f(safeMachineZ)}`] : [`G91 G0 Z${f(lift)}`, 'G90'];
}

/** The tool number a tool change line asks for: its T word or the last T before it. */
export function toolAtLine(lines: readonly string[], index: number): number | null {
  for (let i = Math.min(index, lines.length - 1); i >= 0; i--) {
    const code = lines[i]!.replace(/\([^)]*\)|;.*$/g, '');
    const m = /T\s*(\d+)/i.exec(code);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Turns the spindle back on as it was before a tool change, if it was running. */
export function spindleRestore(state: ParserState | null): string | null {
  if (!state || state.spindle === 'off' || state.speed <= 0) return null;
  return `S${f(state.speed)} ${state.spindle === 'cw' ? 'M3' : 'M4'}`;
}

export interface FrameSettings {
  homed: boolean;
  safeMachineZ: number;
  feed: number;
}

/**
 * Lines to trace the job outline. Without homing the height is a work Z
 * 5 mm above the highest point of the job instead of a machine height.
 */
export function frameLines(bounds: Bounds, s: FrameSettings): string[] {
  const lines = frameProgram({
    minX: bounds.min.x,
    minY: bounds.min.y,
    maxX: bounds.max.x,
    maxY: bounds.max.y,
    safeMachineZ: s.safeMachineZ,
    feed: s.feed,
  });
  if (s.homed) return lines;
  const clearance = Math.max(bounds.max.z, 0) + 5;
  return lines.map((l) => (l.startsWith('G53 G0 Z') ? `G90 G0 Z${f(clearance)}` : l));
}

/**
 * How far one hold may jog before the machine knows its limits (not homed, or no soft limits):
 * if the link breaks, FluidNC runs the whole move out – X/Y about 4 s at 3000 mm/min, Z
 * about 2.5 s at 1200 mm/min. A hold again goes on.
 */
export const UNHOMED_JOG_MM = { xy: 200, z: 50 } as const;

/**
 * One axis of a continuous jog: to the end of the travel once homed, else a relative move of at
 * most `unhomedMax` mm (and never more than the travel).
 */
export function continuousJogTarget(
  position: number,
  direction: 1 | -1,
  range: { min: number; max: number },
  limited: boolean,
  unhomedMax: number = UNHOMED_JOG_MM.xy,
): { mode: 'machine' | 'relative'; value: number } | null {
  if (!limited) {
    return { mode: 'relative', value: direction * Math.min(range.max - range.min, unhomedMax) };
  }
  const target = direction > 0 ? range.max : range.min;
  return Math.abs(target - position) < 0.001 ? null : { mode: 'machine', value: target };
}

export interface MoveSettings {
  homed: boolean;
  softLimits: boolean;
  travel: { x: { min: number; max: number }; y: { min: number; max: number } };
  /** Lift to `safeMachineZ` first (only possible once homed) */
  lift: boolean;
  safeMachineZ: number;
  feedXY: number;
  feedZ: number;
}

/**
 * Jogs that bring the spindle to a machine XY point ("drive here"): lift
 * first if asked, then one XY jog. Homed: absolute and clamped to the
 * travel; not homed: relative from the current position, no lift. Jogs, not
 * G0, so FluidNC's limits apply and a jog cancel stops them at once.
 */
export function moveToCommands(
  target: { x: number; y: number },
  current: { x: number; y: number },
  s: MoveSettings,
): { lines: string[]; limited: boolean } | null {
  if (!s.homed) {
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    if (Math.hypot(dx, dy) < 0.001) return null;
    return { lines: [jogXY('relative', dx, dy, s.feedXY)], limited: false };
  }
  const clamp = (v: number, r: { min: number; max: number }) =>
    s.softLimits ? Math.min(r.max, Math.max(r.min, v)) : v;
  const x = clamp(target.x, s.travel.x);
  const y = clamp(target.y, s.travel.y);
  const limited = Math.abs(x - target.x) > 0.001 || Math.abs(y - target.y) > 0.001;
  const lines = s.lift ? [`$J=G53 G90 G21 Z${f(s.safeMachineZ)} F${Math.round(s.feedZ)}`] : [];
  if (Math.hypot(x - current.x, y - current.y) >= 0.001)
    lines.push(jogXY('machine', x, y, s.feedXY));
  return lines.length > 0 ? { lines, limited } : null;
}

/** Deflection (0…1) below which the joystick does not move the machine. */
export const STICK_DEAD_ZONE = 0.15;

/**
 * One step of the joystick: `vx`/`vy` in −1…1, the step covers `seconds` of
 * motion at a feed that grows with the square of the deflection (fine near
 * the centre). Clamped to the travel once homed.
 */
export function stickStep(
  vx: number,
  vy: number,
  seconds: number,
  current: { x: number; y: number },
  s: Pick<MoveSettings, 'homed' | 'softLimits' | 'travel' | 'feedXY'>,
): { line: string; to: { x: number; y: number } } | null {
  const magnitude = Math.min(1, Math.hypot(vx, vy));
  if (magnitude < STICK_DEAD_ZONE) return null;
  const feed = Math.max(10, s.feedXY * magnitude * magnitude);
  const distance = (feed / 60) * seconds;
  const dx = (vx / Math.hypot(vx, vy)) * distance;
  const dy = (vy / Math.hypot(vx, vy)) * distance;
  if (!s.homed || !s.softLimits) {
    return { line: jogXY('relative', dx, dy, feed), to: { x: current.x + dx, y: current.y + dy } };
  }
  const x = Math.min(s.travel.x.max, Math.max(s.travel.x.min, current.x + dx));
  const y = Math.min(s.travel.y.max, Math.max(s.travel.y.min, current.y + dy));
  if (Math.hypot(x - current.x, y - current.y) < 0.001) return null;
  return { line: jogXY('machine', x, y, feed), to: { x, y } };
}
