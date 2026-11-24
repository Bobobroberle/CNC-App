import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { waitingOf } from '../src/store/runView';
import { useUi } from '../src/store/ui';

/**
 * While a job waits for the operator the stored view of Fräsen is the cutting view, whoever asks for
 * the check (a tap, the quick search, a link inside a card): when the job goes on, the operator finds
 * its figures and overrides, not a list chosen before.
 */
describe('the view of Fräsen while a job waits', () => {
  const between = () => {
    const { fileName, lines } = useJob.getState();
    useRun.setState({ phase: 'between', jobKey: `${fileName}:${lines.length}` });
  };
  beforeEach(() => {
    useJob.getState().load('part.nc', 'G0 X1\n');
    useRun.getState().reset();
    useUi.getState().go('run', 'cut');
  });
  afterEach(() => {
    useRun.getState().reset();
    useJob.getState().unload();
    useMachine.setState({ stream: null });
    useUi.getState().go('job');
  });

  it('says what waits: a stream at a tool change or a step, a loaded job between two parts', () => {
    const none = { streamWaits: false, phase: 'idle', ownJob: false };
    expect(waitingOf(none)).toBe(false);
    expect(waitingOf({ ...none, streamWaits: true })).toBe(true);
    expect(waitingOf({ ...none, phase: 'between', ownJob: true })).toBe(true);
    // another program loaded since waits for nothing
    expect(waitingOf({ ...none, phase: 'between' })).toBe(false);
    expect(waitingOf({ ...none, phase: 'running', ownJob: true })).toBe(false);
  });

  it('lets a choice of the check stand when nothing waits', () => {
    useUi.getState().setView('run', 'check');
    expect(useUi.getState().views.run).toBe('check');
  });

  it('keeps the cutting view stored when the check is asked for during a wait', () => {
    between();
    useUi.getState().setView('run', 'check');
    expect(useUi.getState().views.run).toBe('cut');
    // the search and the links inside the cards go through go()
    useUi.getState().go('run', 'check');
    expect(useUi.getState().views.run).toBe('cut');
  });

  it('puts the check that was chosen before away when a wait begins', () => {
    useUi.getState().setView('run', 'check');
    between();
    expect(useUi.getState().views.run).toBe('cut');
    // and it stays away when the job goes on
    useRun.setState({ phase: 'running' });
    expect(useUi.getState().views.run).toBe('cut');
  });

  it('does not hold for a stream that is over, whatever it still shows as its wait', () => {
    for (const result of ['aborted', 'failed', 'done']) {
      useUi.getState().setView('run', 'check');
      useMachine.setState({
        stream: { result, toolChange: { tool: 1, line: 3 }, stepAt: 2 } as never,
      });
      expect(useUi.getState().views.run, result).toBe('check');
    }
    useMachine.setState({ stream: null });
  });

  it('holds for a stream that waits at a tool change, too', () => {
    useUi.getState().setView('run', 'check');
    useMachine.setState({
      stream: { result: 'running', toolChange: { tool: 1, line: 3 } } as never,
    });
    expect(useUi.getState().views.run).toBe('cut');
    useUi.getState().setView('run', 'check');
    expect(useUi.getState().views.run).toBe('cut');
  });
});
