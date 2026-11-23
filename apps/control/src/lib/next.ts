import type { StepId } from './steps';

/**
 * The one recommendation of the start screen (DESIGN.md §3.1/§5): what to do
 * next, read from the machine's real state. Exactly one comes out, the most
 * urgent first: a fault before everything, then what is needed before any
 * work can go on, then the work itself.
 */
export type NextKind =
  | 'alarm'
  | 'connect'
  | 'connecting'
  | 'toolChange'
  | 'running'
  | 'paused'
  | 'resume'
  | 'home'
  | 'continue'
  | 'newJob';

export interface NextInput {
  connection: 'disconnected' | 'connecting' | 'connected';
  /** The machine is in alarm (or its door is open) */
  alarm: boolean;
  homed: boolean;
  /** A job runs; `holding`: it is paused */
  running: boolean;
  holding: boolean;
  /** A tool change waits for the operator */
  toolChange: boolean;
  /** A job that was interrupted and can be taken up again: its name and how far it got */
  interrupted: { name: string; percent: number } | null;
  /** The loaded program, if any */
  program: string | null;
  /** The first step of the flow that is not done */
  open: StepId;
}

export interface Next {
  kind: NextKind;
  /** The step the action leads to, where it is a step */
  step?: StepId;
  /** Name of the job it is about */
  name?: string;
  percent?: number;
}

export function nextAction(s: NextInput): Next {
  if (s.connection === 'connected' && s.alarm) return { kind: 'alarm' };
  if (s.connection === 'disconnected') return { kind: 'connect' };
  if (s.connection === 'connecting') return { kind: 'connecting' };
  if (s.toolChange) return { kind: 'toolChange', step: 'run', name: s.program ?? undefined };
  if (s.running) {
    return { kind: s.holding ? 'paused' : 'running', step: 'run', name: s.program ?? undefined };
  }
  if (s.interrupted) {
    return {
      kind: 'resume',
      step: 'run',
      name: s.interrupted.name,
      percent: s.interrupted.percent,
    };
  }
  if (!s.homed) return { kind: 'home' };
  if (s.program !== null) return { kind: 'continue', step: s.open, name: s.program };
  return { kind: 'newJob', step: 'job' };
}

/** How the status bar's badge shows the machine (§6.1): the kind decides colour and icon. */
export type BadgeKind = 'offline' | 'connecting' | 'ready' | 'run' | 'hold' | 'probe' | 'alarm';

export function badgeKind(
  connection: 'disconnected' | 'connecting' | 'connected',
  state: string | undefined,
  probing = false,
): BadgeKind {
  if (connection === 'disconnected') return 'offline';
  if (connection === 'connecting' || state === undefined) return 'connecting';
  if (state === 'Alarm' || state === 'Door') return 'alarm';
  if (probing) return 'probe';
  if (state.startsWith('Hold')) return 'hold';
  if (state === 'Run' || state === 'Jog' || state === 'Home') return 'run';
  return 'ready';
}
