import type { MessageKey } from '../i18n';

/**
 * What the jog panel and every way of jogging share (DESIGN.md §5, §8): the
 * step widths, when a jog may be sent at all, what a turn of the mouse wheel
 * means and why a quick action cannot be used right now. Pure; the action
 * layer over the machine is `store/jog.ts`.
 */

/** The step widths of the panel, mm (keys 1–4; key 5 is continuous) */
export const JOG_STEPS = [0.01, 0.1, 1, 10] as const;
/** The long step, under "Mehr Optionen" */
export const JOG_STEP_FAR = 100;
export type JogStep = (typeof JOG_STEPS)[number] | typeof JOG_STEP_FAR | 'continuous';

/** The states FluidNC takes a jog in */
const JOG_STATES = new Set(['Idle', 'Jog']);

/** Whether a jog may be sent in this machine state. */
export function canJog(state: string | undefined | null): boolean {
  return state !== undefined && state !== null && JOG_STATES.has(state);
}

/** Decimals a step width is written with */
export function stepDigits(step: number): number {
  return step < 0.1 ? 2 : step < 1 ? 1 : 0;
}

/** The coarsest step the mouse wheel may make, mm: it is the fine jog */
export const WHEEL_FINE_MAX = 0.1;

/** The distance of one notch of the mouse wheel: the chosen step, never coarser than 0.1 mm. */
export function fineStep(step: JogStep): number {
  return step === 'continuous' ? WHEEL_FINE_MAX : Math.min(step, WHEEL_FINE_MAX);
}

/** Wheel travel that counts as one notch, CSS px (a mouse sends about 100 per notch) */
export const WHEEL_NOTCH = 100;
/** The most steps one wheel event may send: a free-spinning wheel does not run away */
export const WHEEL_MAX_STEPS = 3;
/** `WheelEvent.deltaMode`: pixels, lines, pages */
const WHEEL_UNIT = [1, 100 / 3, WHEEL_NOTCH] as const;

/**
 * Turns wheel travel into whole notches. `rest` is what was left of the last
 * events; turning away from the operator (negative delta) counts as plus.
 * A change of direction drops what was left of the other direction.
 */
export function wheelSteps(
  rest: number,
  deltaY: number,
  deltaMode: number,
): { steps: number; rest: number } {
  if (!Number.isFinite(deltaY) || deltaY === 0) return { steps: 0, rest };
  const travel = -deltaY * (WHEEL_UNIT[deltaMode] ?? 1);
  const total = (Math.sign(rest) === -Math.sign(travel) ? 0 : rest) + travel;
  const notches = Math.trunc(total / WHEEL_NOTCH);
  const steps = Math.max(-WHEEL_MAX_STEPS, Math.min(WHEEL_MAX_STEPS, notches)) || 0;
  // What a capped event could not send is dropped, not saved up for later.
  return { steps, rest: notches === steps ? total - notches * WHEEL_NOTCH : 0 };
}

export type QuickAction = 'zero' | 'park' | 'home';

export interface QuickState {
  connected: boolean;
  /** FluidNC's state word, e.g. `Idle` */
  state: string | undefined | null;
  homed: boolean;
  /** A work zero has been set (the offset is not all zero) */
  zeroSet: boolean;
  /** A park position has been stored */
  park: boolean;
}

/** Why a quick action cannot be used right now – or null, when it can. */
export function quickReason(action: QuickAction, s: QuickState): MessageKey | null {
  if (!s.connected) return 'jog.reason.offline';
  // Homing is also the way out of an alarm; the moves need a machine at rest.
  if (action === 'home') {
    return s.state === 'Idle' || s.state === 'Alarm' ? null : 'jog.reason.busy';
  }
  if (s.state !== 'Idle') return 'jog.reason.busy';
  if (action === 'zero') return s.zeroSet ? null : 'jog.reason.noZero';
  if (!s.homed) return 'jog.reason.notHomed';
  return s.park ? null : 'jog.reason.noPark';
}
