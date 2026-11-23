import type { ReadinessId, ReadinessItem, ReadinessLevel } from './readiness';

/**
 * The five steps of the main flow (DESIGN.md §3.2) and what each of them
 * shows as its state: ✓ done · ⚠ warning · ✕ blocked · ○ open. The states
 * are read from the one readiness list (`lib/readiness.ts`) – a step owns
 * the points that are dealt with on it – so the stepper, the start screen
 * and the start itself never disagree.
 */
export const STEP_IDS = ['job', 'setup', 'run'] as const;
export type StepId = (typeof STEP_IDS)[number];
export type StepState = 'done' | 'warn' | 'block' | 'open';

/** The step on which an open point of the readiness list is dealt with. */
export const STEP_OF: Record<ReadinessId, StepId> = {
  errors: 'job',
  controller: 'job',
  series: 'job',
  connection: 'setup',
  homed: 'setup',
  zero: 'setup',
  jig: 'setup',
  flip: 'setup',
  sections: 'setup',
  travel: 'run',
  collisions: 'run',
  clamp: 'run',
  profile: 'run',
  depth: 'run',
  limits: 'run',
  tools: 'run',
  busy: 'run',
};

export interface StepInput {
  /** A program is loaded */
  program: boolean;
  /** The readiness list of the loaded program; empty without one */
  items: readonly Pick<ReadinessItem, 'id' | 'level'>[];
  /** Tools the program asks for, and how many of them the tool list does not know */
  tools: { used: number; unknown: number };
  /** A job runs right now */
  running: boolean;
  /** The loaded program was cut to its end in this session */
  finished: boolean;
}

const worst = (levels: readonly ReadinessLevel[]): StepState =>
  levels.includes('block') ? 'block' : levels.includes('warn') ? 'warn' : 'done';

/** The state of every step. Without a program everything is open. */
export function stepStates(input: StepInput): Record<StepId, StepState> {
  const { program, items, tools, running, finished } = input;
  if (!program) return { job: 'open', setup: 'open', run: 'open' };
  const of = (step: StepId, skip?: ReadinessId) =>
    worst(items.filter((i) => STEP_OF[i.id] === step && i.id !== skip).map((i) => i.level));
  // Fräsen starts only when nothing blocks – whatever the point, wherever it is dealt with – and it
  // holds the check and the job's tools: their warnings show here; with nothing to say it is open
  // (cutting is still to come). A job that runs or is finished is its own state.
  const blocked = items.some((i) => i.level === 'block' && i.id !== 'busy');
  const check = of('run', 'busy');
  const run: StepState = finished
    ? 'done'
    : running
      ? 'open'
      : blocked
        ? 'block'
        : check === 'warn' || tools.unknown > 0
          ? 'warn'
          : 'open';
  return { job: of('job'), setup: of('setup'), run };
}

/** The first step that is not done: where the work goes on. */
export function openStep(states: Record<StepId, StepState>): StepId {
  return STEP_IDS.find((id) => states[id] !== 'done') ?? 'run';
}

/** The step after this one; null after the last. */
export function nextStep(step: StepId): StepId | null {
  return STEP_IDS[STEP_IDS.indexOf(step) + 1] ?? null;
}

/** How many points of the list keep the start locked, and how many are worth a look, per step. */
export function openPoints(
  items: readonly Pick<ReadinessItem, 'id' | 'level'>[],
  step: StepId,
): { block: number; warn: number } {
  const own = items.filter((i) => STEP_OF[i.id] === step);
  return {
    block: own.filter((i) => i.level === 'block').length,
    warn: own.filter((i) => i.level === 'warn').length,
  };
}
