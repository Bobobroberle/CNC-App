import { create } from 'zustand';
import { releaseAllHolds } from '../lib/holds';
import { keysFree, machineKey, typingInto } from '../lib/shortcuts';
import { useMachine } from './machine';

/**
 * The two keys that reach the machine (DESIGN.md §6.4, §8) – kept apart from
 * the quick search, which never does: Space holds the feed (one press, no
 * question), Esc asks whether the running job is to be aborted. There is no
 * key for NOT-HALT, for a start or for homing.
 */
interface KeysStore {
  /** The question "Job abbrechen?" stands */
  abortAsked: boolean;
}

export const useKeys = create<KeysStore>(() => ({ abortAsked: false }));

const moving = () => {
  const { status, fileJob, stream } = useMachine.getState();
  const state = status?.state;
  return (
    fileJob !== null ||
    stream?.result === 'running' ||
    state === 'Run' ||
    state === 'Jog' ||
    state === 'Home'
  );
};

const jobRuns = () => {
  const { status, fileJob, stream } = useMachine.getState();
  return (
    fileJob !== null ||
    stream?.result === 'running' ||
    status?.state === 'Run' ||
    status?.state.startsWith('Hold') === true
  );
};

/** Listens for the machine keys. Returns the function that stops listening. */
export function startKeys(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const down = (e: KeyboardEvent) => {
    const key = machineKey(e);
    if (!key || typingInto(e.target)) return;
    if (key === 'pause') {
      // While something moves, Space is the pause – whatever has the focus, dialog or not.
      // At rest it keeps its meaning for the control that has the focus.
      if (!moving()) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      releaseAllHolds();
      useMachine.getState().feedHold();
      return;
    }
    // Esc: only for a running job, and only where no dialog has the keys.
    if (e.repeat || !jobRuns() || !keysFree(e.target, document)) return;
    e.preventDefault();
    e.stopPropagation();
    useKeys.setState({ abortAsked: true });
  };
  window.addEventListener('keydown', down, true);
  return () => window.removeEventListener('keydown', down, true);
}
