import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdCount, releaseAllHolds } from '../src/lib/holds';
import {
  canJog,
  fineStep,
  JOG_STEP_FAR,
  JOG_STEPS,
  quickReason,
  stepDigits,
  WHEEL_MAX_STEPS,
  wheelSteps,
  type QuickState,
} from '../src/lib/jog';
import { JOG_STEP_KEYS } from '../src/lib/shortcuts';
import {
  goToChange,
  goToPark,
  goToWaypoint,
  goToZero,
  jogFine,
  jogHold,
  jogRotary,
  jogStep,
  jogStick,
  jogStop,
  useJog,
} from '../src/store/jog';
import { useMachine } from '../src/store/machine';
import { useUi } from '../src/store/ui';
import { DEFAULT_SETTINGS, useWorkshop } from '../src/store/workshop';

describe('the step widths', () => {
  it('are the four of the guide, with continuous on key 5 and the long step apart', () => {
    expect([...JOG_STEPS]).toEqual([0.01, 0.1, 1, 10]);
    expect(Object.values(JOG_STEP_KEYS)).toEqual([...JOG_STEPS, 'continuous']);
    expect(JOG_STEP_FAR).toBe(100);
    expect(JOG_STEPS.map(stepDigits)).toEqual([2, 1, 0, 0]);
  });

  it('takes a jog only while the machine rests or jogs', () => {
    expect(canJog('Idle')).toBe(true);
    expect(canJog('Jog')).toBe(true);
    for (const state of ['Run', 'Hold:0', 'Alarm', 'Home', 'Door:1', undefined, null]) {
      expect(canJog(state), String(state)).toBe(false);
    }
  });
});

describe('the mouse wheel', () => {
  it('never jogs coarser than 0.1 mm, whatever the step width', () => {
    expect(fineStep(0.01)).toBe(0.01);
    expect(fineStep(0.1)).toBe(0.1);
    expect(fineStep(1)).toBe(0.1);
    expect(fineStep(10)).toBe(0.1);
    expect(fineStep(100)).toBe(0.1);
    expect(fineStep('continuous')).toBe(0.1);
  });

  it('counts one step per notch; away from the operator is plus', () => {
    expect(wheelSteps(0, -100, 0)).toEqual({ steps: 1, rest: 0 });
    expect(wheelSteps(0, 100, 0)).toEqual({ steps: -1, rest: 0 });
    // Lines (Firefox) and pages.
    expect(wheelSteps(0, -3, 1).steps).toBe(1);
    expect(wheelSteps(0, 1, 2).steps).toBe(-1);
  });

  it('adds up small travel (a touch pad) and keeps what is left', () => {
    let rest = 0;
    let steps = 0;
    for (let i = 0; i < 10; i += 1) {
      const turned = wheelSteps(rest, -25, 0);
      rest = turned.rest;
      steps += turned.steps;
    }
    expect(steps).toBe(2);
    expect(rest).toBe(50);
  });

  it('drops what was left when the direction changes', () => {
    expect(wheelSteps(80, 40, 0)).toEqual({ steps: 0, rest: -40 });
    expect(wheelSteps(-80, -40, 0)).toEqual({ steps: 0, rest: 40 });
  });

  it('caps a free-spinning wheel and does not save the rest up', () => {
    expect(wheelSteps(0, -5000, 0)).toEqual({ steps: WHEEL_MAX_STEPS, rest: 0 });
    expect(wheelSteps(0, 5000, 0)).toEqual({ steps: -WHEEL_MAX_STEPS, rest: 0 });
  });

  it('ignores nothing and nonsense', () => {
    expect(wheelSteps(30, 0, 0)).toEqual({ steps: 0, rest: 30 });
    expect(wheelSteps(30, Number.NaN, 0)).toEqual({ steps: 0, rest: 30 });
    expect(wheelSteps(0, -100, 7)).toEqual({ steps: 1, rest: 0 });
  });
});

describe('why a quick action cannot be used', () => {
  const ok: QuickState = {
    connected: true,
    state: 'Idle',
    homed: true,
    zeroSet: true,
    park: true,
    change: true,
  };

  it('says nothing when it can', () => {
    for (const action of ['zero', 'park', 'change', 'home'] as const) {
      expect(quickReason(action, ok)).toBeNull();
    }
  });

  it('needs a connection first', () => {
    for (const action of ['zero', 'park', 'change', 'home'] as const) {
      expect(quickReason(action, { ...ok, connected: false })).toBe('jog.reason.offline');
    }
  });

  it('moves only a machine at rest; homing is also the way out of an alarm', () => {
    expect(quickReason('zero', { ...ok, state: 'Run' })).toBe('jog.reason.busy');
    expect(quickReason('park', { ...ok, state: 'Jog' })).toBe('jog.reason.busy');
    expect(quickReason('home', { ...ok, state: 'Run' })).toBe('jog.reason.busy');
    expect(quickReason('home', { ...ok, state: 'Alarm', homed: false })).toBeNull();
    expect(quickReason('zero', { ...ok, state: 'Alarm' })).toBe('jog.reason.busy');
  });

  it('needs a zero for the zero, homing and a stored place for parking', () => {
    expect(quickReason('zero', { ...ok, zeroSet: false })).toBe('jog.reason.noZero');
    expect(quickReason('zero', { ...ok, homed: false, park: false })).toBeNull();
    expect(quickReason('park', { ...ok, homed: false })).toBe('jog.reason.notHomed');
    expect(quickReason('park', { ...ok, park: false })).toBe('jog.reason.noPark');
    // the tool change place is its own: a stored park place does not stand in for it
    expect(quickReason('change', { ...ok, homed: false })).toBe('jog.reason.notHomed');
    expect(quickReason('change', { ...ok, change: false })).toBe('jog.reason.noChange');
    expect(quickReason('change', { ...ok, park: false })).toBeNull();
    expect(quickReason('park', { ...ok, change: false })).toBeNull();
    expect(quickReason('change', { ...ok, state: 'Run' })).toBe('jog.reason.busy');
  });
});

describe('the one action layer of jogging', () => {
  const machine = {
    jog: vi.fn(),
    jogStart: vi.fn(),
    jogCancel: vi.fn(),
    jogRotary: vi.fn(),
    stick: vi.fn(),
    stickStop: vi.fn(),
    moveTo: vi.fn(async () => true),
  };
  const status = (state: string, wco = [0, 0, 0]) => ({ state, mpos: [10, 20, -5], wco }) as never;
  const original = useMachine.getState();

  beforeEach(() => {
    for (const fn of Object.values(machine)) fn.mockClear();
    useMachine.setState({ ...machine, connection: 'connected', status: status('Idle') } as never);
    useJog.setState({ step: 10, lastAxis: null });
  });
  afterEach(() => {
    releaseAllHolds();
    useMachine.setState(original, true);
  });

  it('steps by the chosen width and remembers the axis', () => {
    expect(jogStep('X', 1)).toBe(true);
    expect(machine.jog).toHaveBeenLastCalledWith('X', 10);
    useJog.getState().setStep(0.1);
    jogStep('Z', -1);
    expect(machine.jog).toHaveBeenLastCalledWith('Z', -0.1);
    expect(useJog.getState().lastAxis).toBe('Z');
    // The handwheel brings its own distance; continuous counts as 1 mm for a single step.
    jogStep('Y', 1, 0.01);
    expect(machine.jog).toHaveBeenLastCalledWith('Y', 0.01);
    useJog.getState().setStep('continuous');
    jogStep('Y', -1);
    expect(machine.jog).toHaveBeenLastCalledWith('Y', -1);
  });

  it('sends nothing while the machine takes no jog', () => {
    for (const state of ['Run', 'Hold:0', 'Alarm']) {
      useMachine.setState({ status: status(state) });
      expect(jogStep('X', 1)).toBe(false);
      expect(jogHold('X', 1)).toBeNull();
      expect(jogFine(1)).toBe(false);
      expect(jogRotary(1)).toBe(false);
      jogStick(1, 0);
    }
    useMachine.setState({ status: status('Idle'), connection: 'disconnected' });
    expect(jogStep('X', 1)).toBe(false);
    for (const fn of [machine.jog, machine.jogStart, machine.jogRotary, machine.stick]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(useJog.getState().lastAxis).toBeNull();
  });

  it('holds a continuous jog as a hold: letting go stops, once', () => {
    const release = jogHold('Y', -1, 0.4)!;
    expect(machine.jogStart).toHaveBeenCalledWith('Y', -1, 0.4);
    expect(holdCount()).toBe(1);
    expect(useJog.getState().lastAxis).toBe('Y');
    release();
    release();
    expect(machine.jogCancel).toHaveBeenCalledTimes(1);
    expect(holdCount()).toBe(0);
  });

  it('lets go of a continuous jog when the app is left', () => {
    jogHold('X', 1);
    releaseAllHolds();
    expect(machine.jogCancel).toHaveBeenCalledTimes(1);
    expect(holdCount()).toBe(0);
  });

  it('jogs fine with the wheel: only the axis moved last, never coarser than 0.1 mm', () => {
    expect(jogFine(2)).toBe(false);
    expect(machine.jog).not.toHaveBeenCalled();
    jogStep('Z', 1);
    machine.jog.mockClear();
    expect(jogFine(-2)).toBe(true);
    expect(machine.jog).toHaveBeenCalledWith('Z', -0.2);
    expect(jogFine(0)).toBe(false);
    useJog.getState().setStep(0.01);
    jogFine(3);
    expect(machine.jog).toHaveBeenLastCalledWith('Z', 0.03);
  });

  it('turns the rotary axis by the step in degrees', () => {
    jogRotary(-1);
    expect(machine.jogRotary).toHaveBeenLastCalledWith(-10);
    useJog.getState().setStep('continuous');
    jogRotary(1);
    expect(machine.jogRotary).toHaveBeenLastCalledWith(1);
  });

  it('passes the joystick on and always lets it stop', () => {
    jogStick(0.5, -0.5);
    expect(machine.stick).toHaveBeenCalledWith(0.5, -0.5);
    jogStop();
    expect(machine.jogCancel).toHaveBeenCalledTimes(1);
  });

  it('goes to the work zero in X/Y only, lifting first where that is switched on', async () => {
    useMachine.setState({ status: status('Idle', [100, 200, -40]) });
    useUi.getState().setLiftBeforeMove(true);
    await goToZero();
    expect(machine.moveTo).toHaveBeenLastCalledWith({ x: 100, y: 200 }, true);
    useUi.getState().setLiftBeforeMove(false);
    await goToZero();
    expect(machine.moveTo).toHaveBeenLastCalledWith({ x: 100, y: 200 }, false);
    useUi.getState().setLiftBeforeMove(true);
    useMachine.setState({ status: null });
    expect(await goToZero()).toBe(false);
  });

  it('parks only a homed machine with a stored place, always lifting first', async () => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS, parkPosition: null } });
    useMachine.setState({ homed: true });
    expect(await goToPark()).toBe(false);
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS, parkPosition: { x: 5, y: 900 } } });
    useMachine.setState({ homed: false });
    expect(await goToPark()).toBe(false);
    expect(machine.moveTo).not.toHaveBeenCalled();
    useMachine.setState({ homed: true });
    expect(await goToPark()).toBe(true);
    expect(machine.moveTo).toHaveBeenCalledWith({ x: 5, y: 900 }, true);
  });

  it('goes to the tool change place only when homed and one is stored – always lifting first', async () => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS, toolChangePosition: null } });
    useMachine.setState({ homed: true });
    expect(await goToChange()).toBe(false);
    useWorkshop.setState({
      settings: { ...DEFAULT_SETTINGS, toolChangePosition: { x: 10, y: 20 } },
    });
    useMachine.setState({ homed: false });
    expect(await goToChange()).toBe(false);
    expect(machine.moveTo).not.toHaveBeenCalled();
    useMachine.setState({ homed: true });
    expect(await goToChange()).toBe(true);
    expect(machine.moveTo).toHaveBeenCalledWith({ x: 10, y: 20 }, true);
  });

  it('goes to a saved place by its id, lifting first, when homed', async () => {
    useWorkshop.setState({
      settings: { ...DEFAULT_SETTINGS, waypoints: [{ id: 'w1', name: 'Anschlag', x: 40, y: 800 }] },
    });
    useMachine.setState({ homed: true });
    expect(await goToWaypoint('missing')).toBe(false);
    useMachine.setState({ homed: false });
    expect(await goToWaypoint('w1')).toBe(false);
    expect(machine.moveTo).not.toHaveBeenCalled();
    useMachine.setState({ homed: true });
    expect(await goToWaypoint('w1')).toBe(true);
    expect(machine.moveTo).toHaveBeenCalledWith({ x: 40, y: 800 }, true);
  });
});
