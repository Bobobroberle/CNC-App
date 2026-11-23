import { useJob } from './job';
import { useMachine } from './machine';
import { useRun } from './run';

/** What the answer is made of: one place to read it from, for the function and for the hook. */
export interface UnderwayInput {
  /** A part is running from the SD card */
  fileJob: boolean;
  /** A stream is running */
  streaming: boolean;
  /** The link was lost under a job and the operator has not seen the message yet */
  lost: boolean;
  /** The link is up */
  connected: boolean;
  /** What FluidNC itself reports ('Run', 'Hold:0', 'Idle' …) */
  state: string | undefined;
  /** The run's phase, and whether it is the job that is loaded now */
  phase: string;
  ownJob: boolean;
}

/**
 * Is a job under way? `'job'` – one the app knows of: a part runs from the SD card or is streamed
 * or being uploaded, or a job of several tools stands between two of its parts and waits for the
 * next tool change, or the link was lost under it (the controller may well cut on from its SD
 * card). `'motion'` – only the controller says so: it reports Run or Hold with no job of the app's
 * behind it (a page reloaded under a job, a link made again by hand while it still cuts – or just
 * one of the app's own moves). Otherwise `null`.
 */
export function underwayOf(i: UnderwayInput): 'job' | 'motion' | null {
  if (i.fileJob || i.streaming || i.lost) return 'job';
  if ((i.phase === 'uploading' || i.phase === 'running' || i.phase === 'between') && i.ownJob) {
    return 'job';
  }
  // A report that is not there any more (no link) says nothing.
  if (i.connected && (i.state === 'Run' || i.state?.startsWith('Hold') === true)) return 'motion';
  return null;
}

const jobKeyOf = (fileName: string | null, lines: number) =>
  fileName === null ? null : `${fileName}:${lines}`;

/** The answer from the stores as they are now. */
export function underway(): 'job' | 'motion' | null {
  const machine = useMachine.getState();
  const { phase, jobKey } = useRun.getState();
  const job = useJob.getState();
  const key = jobKeyOf(job.fileName, job.lines.length);
  return underwayOf({
    fileJob: machine.fileJob !== null,
    streaming: machine.stream?.result === 'running',
    lost: machine.lostInJob !== null,
    connected: machine.connection === 'connected',
    state: machine.status?.state,
    phase,
    ownJob: key !== null && jobKey === key,
  });
}

/**
 * Nothing may put another program on the table or take the loaded one off it while a job is under
 * way. One answer for everything that loads a program of its own (the drawing, the series flow).
 */
export function jobUnderWay(): boolean {
  return underway() !== null;
}

/** The same for a component: it follows the machine, the run and the loaded program. */
export function useJobUnderWay(): boolean {
  const fileJob = useMachine((s) => s.fileJob !== null);
  const streaming = useMachine((s) => s.stream?.result === 'running');
  const lost = useMachine((s) => s.lostInJob !== null);
  const connected = useMachine((s) => s.connection === 'connected');
  const state = useMachine((s) => s.status?.state);
  const phase = useRun((s) => s.phase);
  const jobKey = useRun((s) => s.jobKey);
  const key = useJob((s) => jobKeyOf(s.fileName, s.lines.length));
  return (
    underwayOf({
      fileJob,
      streaming,
      lost,
      connected,
      state,
      phase,
      ownJob: key !== null && jobKey === key,
    }) !== null
  );
}

type Ended = 'job' | 'motion';
const listeners = new Set<(ended: Ended) => void>();
let was: 'job' | 'motion' | null = null;
let sawJob = false;

/**
 * Calls back when what was under way has ended: `'job'` when a job of the app's was part of it
 * (its program stays until the operator has seen it), `'motion'` when it was only a move of the
 * app's own or a run it only learned of from the controller – whatever waited for the machine to
 * be quiet can go on then.
 */
export function onUnderwayEnded(listener: (ended: Ended) => void): void {
  listeners.add(listener);
}

function follow(): void {
  const now = underway();
  const ended = was !== null && now === null ? (sawJob ? 'job' : 'motion') : null;
  if (ended !== null) sawJob = false;
  if (now === 'job') sawJob = true;
  was = now;
  if (ended !== null) for (const listener of listeners) listener(ended);
}
useMachine.subscribe(follow);
useRun.subscribe(follow);
useJob.subscribe(follow);
