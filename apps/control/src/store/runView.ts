import { useJob } from './job';
import { useMachine } from './machine';
import { useRun } from './run';
import { useUi } from './ui';

/**
 * The job of the app stands between two of its parts and waits for the tool change – and is still
 * the program that is loaded (another one opened since waits for nothing).
 */
export function useBetweenParts(): boolean {
  const between = useRun((s) => s.phase === 'between');
  const jobKey = useRun((s) => s.jobKey);
  const key = useJob((s) => (s.fileName === null ? null : `${s.fileName}:${s.lines.length}`));
  return between && key !== null && jobKey === key;
}

/**
 * A job waits for the operator: at a tool change or a single step of a stream, or between two
 * parts of a job of several tools. The cutting view then holds the field to go on – and the way to
 * give the job up – and the check is not shown.
 */
export function useRunWaiting(): boolean {
  const streamWaits = useMachine(
    (s) => (s.stream?.toolChange ?? null) !== null || (s.stream?.stepAt ?? null) !== null,
  );
  const between = useBetweenParts();
  return streamWaits || between;
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
