import { nextAction, type Next } from '../lib/next';
import { openStep, stepStates, type StepId, type StepState } from '../lib/steps';
import { useJob } from './job';
import { useJobTools } from './jobTools';
import { useMachine } from './machine';
import { useReadiness } from './readiness';
import { useRun } from './run';
import { useBetweenParts } from './runView';
import { useTrack } from './track';
import { useWorkshop } from './workshop';

export interface Steps {
  states: Record<StepId, StepState>;
  /** The first step that is not done */
  open: StepId;
}

/** The states of the five steps for the loaded job against the live machine. */
export function useSteps(): Steps {
  const readiness = useReadiness();
  const program = useJob((s) => s.analysis !== null);
  const tools = useJobTools();
  const running = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const finished = useRun((s) => s.phase === 'done');
  const states = stepStates({
    program,
    items: readiness?.items ?? [],
    tools: { used: tools.length, unknown: tools.filter((x) => x.state !== 'ok').length },
    running,
    finished,
  });
  return { states, open: openStep(states) };
}

/** A job that was interrupted and can be taken up again, from what the machine and the tracking know. */
export function useInterrupted(): { name: string; percent: number } | null {
  const stream = useMachine((s) => s.stream);
  const lastFileResult = useMachine((s) => s.lastFileResult);
  const busy = useMachine((s) => s.fileJob !== null);
  const fileName = useJob((s) => s.fileName);
  const lines = useJob((s) => s.lines.length);
  const line = useTrack((s) => s.lineIndex);
  if (busy || stream?.result === 'running') return null;
  if (stream && (stream.result === 'aborted' || stream.result === 'failed')) {
    const percent = (100 * stream.progress.acknowledged) / Math.max(1, stream.progress.total);
    return percent > 0 && percent < 100 ? { name: stream.name, percent } : null;
  }
  if (lastFileResult === 'aborted' && fileName && line !== null && line > 0 && lines > 0) {
    return { name: fileName, percent: (100 * line) / lines };
  }
  return null;
}

/** The one recommendation of the start screen, from the real state. */
export function useNext(): Next {
  const connection = useMachine((s) => s.connection);
  const state = useMachine((s) => s.status?.state);
  const homed = useMachine((s) => s.homed);
  const running = useMachine(
    (s) =>
      s.fileJob !== null ||
      s.stream?.result === 'running' ||
      s.status?.state === 'Run' ||
      s.status?.state.startsWith('Hold') === true,
  );
  const toolChange = useMachine((s) => (s.stream?.toolChange ?? null) !== null);
  // Only the job that is still loaded waits between its parts (the start asks the same).
  const between = useBetweenParts();
  const program = useJob((s) => s.fileName);
  const interrupted = useInterrupted();
  const { open } = useSteps();
  return nextAction({
    connection,
    alarm: state === 'Alarm' || state === 'Door',
    homed,
    running,
    holding: state?.startsWith('Hold') === true,
    toolChange: toolChange || between,
    interrupted,
    program,
    open,
  });
}

export { useJobTools, type JobTool } from './jobTools';
