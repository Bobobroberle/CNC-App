import type { JogAxis } from '@lowrider/fluidnc-client';
import { create } from 'zustand';
import { holdStart } from '../lib/holds';
import { canJog, fineStep, type JogStep } from '../lib/jog';
import { useMachine } from './machine';
import { useUi } from './ui';
import { useWorkshop } from './workshop';

/**
 * The one action layer of jogging (DESIGN.md §8): the buttons of the panel,
 * the keyboard, the mouse wheel, a gamepad, the on-screen handwheel and the
 * joystick all move the machine through these few actions – none of them
 * talks to the machine by itself. What they share lives here: the step
 * width, the axis moved last, the rule that a jog is only sent while the
 * machine takes one, and that whatever is held registers in `lib/holds.ts`
 * and lets go like every hold.
 */
interface JogStore {
  /** The step width of the panel; every input uses it */
  step: JogStep;
  setStep(step: JogStep): void;
  /** The axis moved last: the one the mouse wheel jogs fine */
  lastAxis: JogAxis | null;
}

export const useJog = create<JogStore>((set) => ({
  step: 10,
  setStep: (step) => set({ step }),
  lastAxis: null,
}));

const ready = (): boolean => {
  const { connection, status } = useMachine.getState();
  return connection === 'connected' && canJog(status?.state);
};

/** One step along an axis: the chosen width, or `distance` mm. Continuous counts as 1 mm. */
export function jogStep(axis: JogAxis, direction: 1 | -1, distance?: number): boolean {
  if (!ready()) return false;
  const { step } = useJog.getState();
  const width = distance ?? (step === 'continuous' ? 1 : step);
  useJog.setState({ lastAxis: axis });
  useMachine.getState().jog(axis, direction * width);
  return true;
}

/**
 * Moves along an axis until it is let go. Returns the function that lets go
 * (it stops the machine; calling it twice does nothing) – or null when the
 * machine takes no jog. Registered as a hold: it also lets go when the app
 * is left.
 */
export function jogHold(axis: JogAxis, direction: 1 | -1, speed = 1): (() => void) | null {
  if (!ready()) return null;
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    end();
    useMachine.getState().jogCancel();
  };
  const end = holdStart(release);
  useJog.setState({ lastAxis: axis });
  useMachine.getState().jogStart(axis, direction, speed);
  return release;
}

/** Stops whatever jog is running. Always allowed. */
export function jogStop(): void {
  useMachine.getState().jogCancel();
}

/** Notches of the mouse wheel: fine steps along the axis moved last. */
export function jogFine(notches: number): boolean {
  const { lastAxis, step } = useJog.getState();
  if (lastAxis === null || notches === 0 || !ready()) return false;
  useMachine.getState().jog(lastAxis, notches * fineStep(step));
  return true;
}

/** The rotary axis: one step in degrees (the step width's number; continuous: 1°). */
export function jogRotary(direction: 1 | -1): boolean {
  if (!ready()) return false;
  const { step } = useJog.getState();
  useMachine.getState().jogRotary(direction * (step === 'continuous' ? 1 : step));
  return true;
}

/** The joystick: a direction and speed in X/Y while it is pulled; `jogStickStop` when it is let go. */
export function jogStick(vx: number, vy: number): void {
  if (!ready()) return;
  useMachine.getState().stick(vx, vy);
}

export function jogStickStop(): void {
  useMachine.getState().stickStop();
}

/** Quick action: X/Y to the work zero. Z only lifts first (where that is switched on) – it never goes down. */
export function goToZero(): Promise<boolean> {
  const { status, moveTo } = useMachine.getState();
  if (!status) return Promise.resolve(false);
  return moveTo({ x: status.wco[0] ?? 0, y: status.wco[1] ?? 0 }, useUi.getState().liftBeforeMove);
}

/** Quick action: up to the safe height, then to the stored park position. */
export function goToPark(): Promise<boolean> {
  const { parkPosition } = useWorkshop.getState().settings;
  if (!parkPosition || !useMachine.getState().homed) return Promise.resolve(false);
  return useMachine.getState().moveTo(parkPosition, true);
}

/** Quick action: up to the safe height, then to where tools are changed (stored in the settings). */
export function goToChange(): Promise<boolean> {
  const { toolChangePosition } = useWorkshop.getState().settings;
  if (!toolChangePosition || !useMachine.getState().homed) return Promise.resolve(false);
  return useMachine.getState().moveTo(toolChangePosition, true);
}

/** Up to the safe height, then to a place the operator remembered by name. */
export function goToWaypoint(id: string): Promise<boolean> {
  const point = useWorkshop.getState().settings.waypoints.find((w) => w.id === id);
  if (!point || !useMachine.getState().homed) return Promise.resolve(false);
  return useMachine.getState().moveTo({ x: point.x, y: point.y }, true);
}
