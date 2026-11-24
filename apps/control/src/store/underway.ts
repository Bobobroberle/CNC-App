import { t } from '../i18n';
import { setProgramLock, useJob } from './job';
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
  /** What FluidNC itself reports ('Run', 'Hold:0', 'Door:1', 'Idle' …) */
  state: string | undefined;
  /** The report names an SD file it is running (`SD:` – kept while held or parked) */
  sdFile: boolean;
  /** The run's phase, and whether it is the job that is loaded now */
  phase: string;
  ownJob: boolean;
}

/**
 * Is a job under way? A part runs from the SD card, or is streamed or being uploaded; a job of
 * several tools stands between two of its parts and waits for the next tool change; the link was
 * lost under it (the controller may well cut on from its SD card); or **the controller itself
 * reports an SD file running** (a page reloaded under a job, a link made again by hand while it
 * still cuts). A move of the app's own – probing, driving to the zero, measuring – is no job: the
 * controller reports `Run` for it too, but without an SD file.
 */
export function underwayOf(i: UnderwayInput): boolean {
  if (i.fileJob || i.streaming || i.lost) return true;
  if ((i.phase === 'uploading' || i.phase === 'running' || i.phase === 'between') && i.ownJob) {
    return true;
  }
  // A report that is not there any more (no link) says nothing.
  const active =
    i.state === 'Run' ||
    i.state?.startsWith('Hold') === true ||
    i.state?.startsWith('Door') === true;
  return i.connected && i.sdFile && active;
}

const jobKeyOf = (fileName: string | null, lines: number) =>
  fileName === null ? null : `${fileName}:${lines}`;

/**
 * Nothing may put another program on the table or take the loaded one off it while a job is under
 * way. One answer for everything that loads a program of its own (the drawing, the series flow).
 */
export function jobUnderWay(): boolean {
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
    sdFile: machine.status?.sd !== undefined,
    phase,
    ownJob: key !== null && jobKey === key,
  });
}

/** The same for a component: it follows the machine, the run and the loaded program. */
export function useJobUnderWay(): boolean {
  const fileJob = useMachine((s) => s.fileJob !== null);
  const streaming = useMachine((s) => s.stream?.result === 'running');
  const lost = useMachine((s) => s.lostInJob !== null);
  const connected = useMachine((s) => s.connection === 'connected');
  const state = useMachine((s) => s.status?.state);
  const sdFile = useMachine((s) => s.status?.sd !== undefined);
  const phase = useRun((s) => s.phase);
  const jobKey = useRun((s) => s.jobKey);
  const key = useJob((s) => jobKeyOf(s.fileName, s.lines.length));
  return underwayOf({
    fileJob,
    streaming,
    lost,
    connected,
    state,
    sdFile,
    phase,
    ownJob: key !== null && jobKey === key,
  });
}

/**
 * True – and the operator is told why – while a job is under way: whoever was about to change the
 * program on the table (or to do something that only makes sense with the new one) stops there.
 * The flows ask this *before* their first step (a zero moved, a plan changed), not only after
 * `load` said no; `load`, `loadDerived` and `unload` ask it themselves as the backstop.
 */
export function programRefused(): boolean {
  if (!jobUnderWay()) return false;
  useMachine.getState().addLog('error', t('job.locked'), 'job.locked');
  return true;
}

// Nothing replaces or takes off the program while a job is under way – whichever way it comes.
setProgramLock(programRefused);
