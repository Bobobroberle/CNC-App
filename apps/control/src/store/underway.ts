import { useJob } from './job';
import { useMachine } from './machine';
import { useRun } from './run';

/**
 * Is a job under way? Then nothing may put another program on the table or take the loaded one
 * off it: a part runs from the SD card or is streamed or being uploaded, or a job of several
 * tools stands between two of its parts and waits for the next tool change. One answer for
 * everything that loads a program of its own (the drawing, the series flow).
 */
export function jobUnderWay(): boolean {
  const machine = useMachine.getState();
  if (machine.fileJob !== null || machine.stream?.result === 'running') return true;
  // A job the link was lost under still counts until the operator has seen the message: the
  // controller may well cut on from its SD card.
  if (machine.lostInJob !== null) return true;
  const { phase, jobKey } = useRun.getState();
  if (phase !== 'uploading' && phase !== 'running' && phase !== 'between') return false;
  // The run's own job; another program loaded since leaves nothing waiting.
  const { fileName, lines } = useJob.getState();
  return fileName !== null && jobKey === `${fileName}:${lines.length}`;
}

/** The same for a component: it follows the machine, the run and the loaded program. */
export function useJobUnderWay(): boolean {
  const onMachine = useMachine(
    (s) => s.fileJob !== null || s.stream?.result === 'running' || s.lostInJob !== null,
  );
  const phase = useRun((s) => s.phase);
  const jobKey = useRun((s) => s.jobKey);
  const key = useJob((s) => (s.fileName === null ? null : `${s.fileName}:${s.lines.length}`));
  if (onMachine) return true;
  return (
    (phase === 'uploading' || phase === 'running' || phase === 'between') &&
    key !== null &&
    jobKey === key
  );
}
