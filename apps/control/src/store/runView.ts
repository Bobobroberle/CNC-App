import { useJob } from './job';
import { useMachine } from './machine';
import { useRun } from './run';
import { useUi } from './ui';

/** What the answer is made of: one place to read it from, for the function and for the hook. */
export interface WaitingInput {
  /** A stream waits at a tool change or a single step */
  streamWaits: boolean;
  /** The run stands between two parts */
  phase: string;
  /** The run's job is the program that is loaded now (another one opened since waits for nothing) */
  ownJob: boolean;
}

/**
 * A job waits for the operator: at a tool change or a single step of a stream, or between two
 * parts of a job of several tools. The cutting view then holds the field to go on – and the way to
 * give the job up – and the check is not shown.
 */
export function waitingOf(i: WaitingInput): boolean {
  return i.streamWaits || (i.phase === 'between' && i.ownJob);
}

const jobKeyOf = (fileName: string | null, lines: number) =>
  fileName === null ? null : `${fileName}:${lines}`;

/** A stream that runs waits at a tool change or a single step; one that is over waits for nothing. */
function streamWaitsOf(
  stream: { result: string; toolChange: unknown; stepAt: number | null } | null,
): boolean {
  return (
    stream?.result === 'running' && (stream.toolChange !== null || (stream.stepAt ?? null) !== null)
  );
}

function waitingNow(): boolean {
  const { stream } = useMachine.getState();
  const { phase, jobKey } = useRun.getState();
  const job = useJob.getState();
  const key = jobKeyOf(job.fileName, job.lines.length);
  return waitingOf({
    streamWaits: streamWaitsOf(stream),
    phase,
    ownJob: key !== null && jobKey === key,
  });
}

/** The job of the app stands between two of its parts and waits for the tool change. */
export function useBetweenParts(): boolean {
  const phase = useRun((s) => s.phase);
  const jobKey = useRun((s) => s.jobKey);
  const key = useJob((s) => jobKeyOf(s.fileName, s.lines.length));
  return waitingOf({ streamWaits: false, phase, ownJob: key !== null && jobKey === key });
}

/** A job waits for the operator (see `waitingOf`). */
export function useRunWaiting(): boolean {
  const streamWaits = useMachine((s) => streamWaitsOf(s.stream));
  const phase = useRun((s) => s.phase);
  const jobKey = useRun((s) => s.jobKey);
  const key = useJob((s) => jobKeyOf(s.fileName, s.lines.length));
  return waitingOf({ streamWaits, phase, ownJob: key !== null && jobKey === key });
}

/**
 * The view of Fräsen as it is on screen: the chosen one, except while a job waits (the cutting
 * view). Everything that depends on it – the panel, the action bar, the picture's timeline – asks
 * here, never the stored choice.
 */
export function useRunView(): 'cut' | 'check' {
  const waiting = useRunWaiting();
  const chosen = useUi((s) => s.views.run);
  return waiting ? 'cut' : chosen === 'check' ? 'check' : 'cut';
}

/**
 * While a job waits the stored view of Fräsen is the cutting view, whoever asks for the check (a tap,
 * the quick search, a link inside a card): when the job goes on, the operator finds its figures and
 * overrides, not a list they chose before. One write when a wait begins and one for every choice
 * made during it – not a guard at every caller.
 */
function holdCut(): void {
  if (!waitingNow() || useUi.getState().views.run === 'cut') return;
  useUi.setState((s) => ({ views: { ...s.views, run: 'cut' } }));
}
useUi.subscribe(holdCut);
useMachine.subscribe(holdCut);
useRun.subscribe(holdCut);
useJob.subscribe(holdCut);
