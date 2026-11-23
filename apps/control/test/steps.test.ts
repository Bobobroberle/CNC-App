import { describe, expect, it } from 'vitest';
import { badgeKind, nextAction, type NextInput } from '../src/lib/next';
import { pressKey, separatorOf, unitOf } from '../src/lib/numpad';
import type { ReadinessId, ReadinessLevel } from '../src/lib/readiness';
import {
  nextStep,
  openPoints,
  openStep,
  STEP_IDS,
  STEP_OF,
  stepStates,
  type StepInput,
} from '../src/lib/steps';

const item = (id: ReadinessId, level: ReadinessLevel) => ({ id, level });
const READY: StepInput = {
  program: true,
  items: [item('connection', 'ok'), item('homed', 'ok'), item('errors', 'ok'), item('zero', 'ok')],
  tools: { used: 1, unknown: 0 },
  running: false,
  finished: false,
};

describe('the states of the three areas', () => {
  it('leaves everything open without a program', () => {
    expect(stepStates({ ...READY, program: false })).toEqual({
      job: 'open',
      setup: 'open',
      run: 'open',
    });
  });

  it('is done up to the start when nothing is open', () => {
    const states = stepStates(READY);
    expect(states).toEqual({
      job: 'done',
      setup: 'done',
      run: 'open',
    });
    expect(openStep(states)).toBe('run');
  });

  it('shows an open point on the step that deals with it', () => {
    const states = stepStates({
      ...READY,
      items: [
        item('connection', 'block'),
        item('errors', 'ok'),
        item('zero', 'warn'),
        item('travel', 'block'),
        item('clamp', 'warn'),
      ],
    });
    expect(states.job).toBe('done');
    // A block outweighs a warning on the same step.
    expect(states.setup).toBe('block');
    // Fräsen holds the check: what blocks there, blocks the start.
    expect(states.run).toBe('block');
    expect(openStep(states)).toBe('setup');
  });

  it('shows Fräsen blocked when a point of another area locks the start, whatever warns there', () => {
    const states = stepStates({
      ...READY,
      items: [item('zero', 'block'), item('clamp', 'warn')],
    });
    expect(states).toMatchObject({ setup: 'block', run: 'block' });
  });

  it('warns without blocking the start', () => {
    const states = stepStates({
      ...READY,
      items: [item('homed', 'warn'), item('profile', 'warn')],
    });
    // The check's warnings show on Fräsen, which holds it; they do not lock the start.
    expect(states).toMatchObject({ setup: 'warn', run: 'warn' });
  });

  it('marks a tool the list does not know', () => {
    expect(stepStates({ ...READY, tools: { used: 2, unknown: 1 } }).run).toBe('warn');
    expect(openStep(stepStates({ ...READY, tools: { used: 2, unknown: 1 } }))).toBe('run');
  });

  it('does not count the running job itself as a block, and knows a finished one', () => {
    const busy = [...READY.items, item('busy', 'block')];
    expect(stepStates({ ...READY, items: busy, running: true }).run).toBe('open');
    expect(stepStates({ ...READY, finished: true }).run).toBe('done');
    expect(openStep(stepStates({ ...READY, finished: true }))).toBe('run');
  });

  it('gives every point of the readiness list its step', () => {
    for (const step of Object.values(STEP_OF)) expect(STEP_IDS).toContain(step);
    expect(STEP_OF.zero).toBe('setup');
    expect(STEP_OF.travel).toBe('run');
    expect(
      openPoints(
        [item('zero', 'warn'), item('connection', 'block'), item('travel', 'block')],
        'setup',
      ),
    ).toEqual({ block: 1, warn: 1 });
  });

  it('knows the order of the steps', () => {
    expect(STEP_IDS.map(nextStep)).toEqual(['setup', 'run', null]);
  });
});

const IDLE: NextInput = {
  connection: 'connected',
  alarm: false,
  homed: true,
  running: false,
  holding: false,
  toolChange: false,
  interrupted: null,
  program: null,
  open: 'job',
};

describe('the one recommendation of the start screen', () => {
  it('puts the way out of an alarm first', () => {
    expect(nextAction({ ...IDLE, alarm: true, homed: false, program: 'a.nc' }).kind).toBe('alarm');
  });

  it('asks for the connection before anything else can be done', () => {
    expect(nextAction({ ...IDLE, connection: 'disconnected', alarm: true }).kind).toBe('connect');
    expect(nextAction({ ...IDLE, connection: 'connecting' }).kind).toBe('connecting');
  });

  it('leads to the running job, the paused job and a waiting tool change', () => {
    expect(nextAction({ ...IDLE, running: true, program: 'a.nc' })).toEqual({
      kind: 'running',
      step: 'run',
      name: 'a.nc',
    });
    expect(nextAction({ ...IDLE, running: true, holding: true }).kind).toBe('paused');
    expect(nextAction({ ...IDLE, running: true, toolChange: true }).kind).toBe('toolChange');
  });

  it('offers to take up an interrupted job, before homing and before the next step', () => {
    expect(
      nextAction({ ...IDLE, homed: false, interrupted: { name: 'schild.nc', percent: 62 } }),
    ).toEqual({ kind: 'resume', step: 'run', name: 'schild.nc', percent: 62 });
  });

  it('asks for homing on a machine that does not know where it is', () => {
    expect(nextAction({ ...IDLE, homed: false, program: 'a.nc' }).kind).toBe('home');
  });

  it('goes on at the open step of the loaded job, else begins a new one', () => {
    expect(nextAction({ ...IDLE, program: 'a.nc', open: 'setup' })).toEqual({
      kind: 'continue',
      step: 'setup',
      name: 'a.nc',
    });
    expect(nextAction(IDLE)).toEqual({ kind: 'newJob', step: 'job' });
  });
});

describe('the badge of the machine state', () => {
  it('reads the state as DESIGN.md §6.1 names it', () => {
    expect(badgeKind('disconnected', undefined)).toBe('offline');
    expect(badgeKind('connecting', undefined)).toBe('connecting');
    expect(badgeKind('connected', undefined)).toBe('connecting');
    expect(badgeKind('connected', 'Idle')).toBe('ready');
    expect(badgeKind('connected', 'Run')).toBe('run');
    expect(badgeKind('connected', 'Jog')).toBe('run');
    expect(badgeKind('connected', 'Home')).toBe('run');
    expect(badgeKind('connected', 'Hold')).toBe('hold');
    expect(badgeKind('connected', 'Hold:1')).toBe('hold');
    expect(badgeKind('connected', 'Alarm')).toBe('alarm');
    expect(badgeKind('connected', 'Door')).toBe('alarm');
    expect(badgeKind('connected', 'Run', true)).toBe('probe');
    // An alarm outweighs a probing routine that ran into it.
    expect(badgeKind('connected', 'Alarm', true)).toBe('alarm');
    expect(badgeKind('connected', 'Check')).toBe('ready');
  });
});

describe('the number pad', () => {
  const de = { separator: ',' as const };
  it('writes digits at the end and deletes from the end', () => {
    expect(pressKey('', '1', de)).toBe('1');
    expect(pressKey('12', '5', de)).toBe('125');
    expect(pressKey('125', 'back', de)).toBe('12');
    expect(pressKey('', 'back', de)).toBe('');
    expect(pressKey('12,5', 'clear', de)).toBe('');
  });

  it('writes one decimal sign, in the language of the app, never as the first sign', () => {
    expect(pressKey('12', 'separator', de)).toBe('12,');
    expect(pressKey('12,', 'separator', de)).toBe('12,');
    expect(pressKey('1.5', 'separator', de)).toBe('1.5');
    expect(pressKey('', 'separator', de)).toBe('0,');
    expect(pressKey('-', 'separator', de)).toBe('-0,');
    expect(pressKey('3', 'separator', { separator: '.' })).toBe('3.');
    expect(pressKey('3', 'separator', { separator: ',', whole: true })).toBe('3');
  });

  it('changes the sign at the front, wherever the text ends', () => {
    expect(pressKey('12,5', 'sign', de)).toBe('-12,5');
    expect(pressKey('-12,5', 'sign', de)).toBe('12,5');
    expect(pressKey('−3', 'sign', de)).toBe('3');
    expect(pressKey('', 'sign', de)).toBe('-');
  });

  it('reads the unit from the label of the field', () => {
    expect(unitOf('Sichere Höhe (mm)')).toBe('mm');
    expect(unitOf('Vorschub (mm/min)')).toBe('mm/min');
    expect(unitOf('Drehzahl, U/min')).toBe('U/min');
    expect(unitOf('Winkel (°)')).toBe('°');
    expect(unitOf('Überlappung %')).toBe('%');
    expect(unitOf('Anzahl')).toBeNull();
    // "mm" inside a word is no unit.
    expect(unitOf('Kommentar')).toBeNull();
  });

  it('knows the decimal sign of a language', () => {
    expect(separatorOf('de-DE')).toBe(',');
    expect(separatorOf('en-US')).toBe('.');
  });
});
