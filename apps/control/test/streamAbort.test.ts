import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../src/i18n';
import { useMachine } from '../src/store/machine';

// A stream that is stopped while it waits – at a single step or a tool change – no longer waits.
// (A stale wait keeps the check out of Fräsen and the pause disabled until another stream starts.)
describe('a stream that is stopped does not go on waiting', () => {
  beforeAll(async () => {
    useMachine.getState().setUrl('simulator');
    await useMachine.getState().connect();
    await vi.waitFor(() => expect(useMachine.getState().status?.state).toBe('Idle'));
    // the simulator's greeting comes after the connection is up, and a greeting is a reset that
    // aborts a stream running by then: let it be over before a test starts one
    await vi.waitFor(() =>
      expect(useMachine.getState().log.some((l) => l.text.startsWith('[OPT'))).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
  // A stop resets the simulator, and its greeting – a reset to the store – comes a little later: a
  // stream started before it would be aborted by it.
  beforeEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await vi.waitFor(() => expect(useMachine.getState().status?.state).toBe('Idle'));
  });
  afterAll(() => {
    useMachine.getState().setSingleStep(false);
    useMachine.getState().disconnect();
  });

  it('forgets the step it waited at when the stream is aborted', async () => {
    useMachine.getState().setSingleStep(true);
    // the connection asks its few questions first (`$I`, `$G`…): until they are answered it is busy
    await vi.waitFor(() =>
      expect(useMachine.getState().streamJob('step.nc', 'G21\nG0 X1\nG0 X2\nG0 X3\n')).toBe(true),
    );
    await vi.waitFor(() => expect(useMachine.getState().stream?.stepAt).not.toBeNull());
    await useMachine.getState().stopJob();
    await vi.waitFor(() => expect(useMachine.getState().stream?.result).toBe('aborted'));
    expect(useMachine.getState().stream?.stepAt).toBeNull();
    expect(useMachine.getState().stream?.toolChange).toBeNull();
    useMachine.getState().setSingleStep(false);
  });

  const TOOL_CHANGE = 'G21\nG0 X1\nT1 M6\nG0 X2\n';
  /** What was sent after the last reset byte (0x18) since `from`, but the questions (`$G`, `$#`) */
  const sentAfterReset = (from: number) => {
    const out = useMachine
      .getState()
      .log.slice(from)
      .filter((l) => l.kind === 'out')
      .map((l) => l.text);
    return out
      .slice(out.lastIndexOf('0x18') + 1)
      .filter((line) => !line.startsWith('$'))
      .join(' | ');
  };

  it('does not send the tool change moves after a stop that came while it was still asking', async () => {
    const from = useMachine.getState().log.length;
    await vi.waitFor(() =>
      expect(useMachine.getState().streamJob('tc.nc', TOOL_CHANGE)).toBe(true),
    );
    // stop at the very moment the stream is held at the tool change – before the handler has asked
    // the controller for its state, let alone moved anything
    const off = useMachine.subscribe((st) => {
      if (st.stream?.name === 'tc.nc' && st.stream.progress.state === 'held') {
        off();
        void useMachine.getState().stopJob();
      }
    });
    await vi.waitFor(() => expect(useMachine.getState().stream?.result).toBe('aborted'));
    // give a handler that is still asking time to (wrongly) go on
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(useMachine.getState().stream?.toolChange).toBeNull();
    expect(sentAfterReset(from)).toBe('');
  });

  it('sends nothing for a tool change that was stopped at the moment it was set', async () => {
    const from = useMachine.getState().log.length;
    await vi.waitFor(() =>
      expect(useMachine.getState().streamJob('tc.nc', TOOL_CHANGE)).toBe(true),
    );
    // stop the moment the wait is shown: the handler has asked, but not yet moved anything
    const off = useMachine.subscribe((st) => {
      if (st.stream?.name === 'tc.nc' && st.stream.toolChange !== null) {
        off();
        void useMachine.getState().stopJob();
      }
    });
    await vi.waitFor(() => expect(useMachine.getState().stream?.result).toBe('aborted'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(useMachine.getState().stream?.toolChange).toBeNull();
    expect(sentAfterReset(from)).toBe('');
    expect(useMachine.getState().log.some((l) => l.key === 'toolChange.held')).toBe(false);
  });

  it('is not brought back to life by "Job fortsetzen" when NOT-HALT comes while it lifts', async () => {
    const from = useMachine.getState().log.length;
    await vi.waitFor(() =>
      expect(useMachine.getState().streamJob('tc.nc', TOOL_CHANGE)).toBe(true),
    );
    await vi.waitFor(() => expect(useMachine.getState().stream?.toolChange).not.toBeNull());
    // let the handler finish its own moves first
    await new Promise((resolve) => setTimeout(resolve, 400));
    void useMachine.getState().continueAfterToolChange();
    useMachine.getState().emergencyStop();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(useMachine.getState().stream?.result).toBe('aborted');
    expect(useMachine.getState().stream?.toolChange).toBeNull();
    // the rest of the lift is not sent after the reset, and the job is not said to go on
    expect(sentAfterReset(from)).toBe('');
    expect(useMachine.getState().log.some((l) => l.text === t('toolChange.continue'))).toBe(false);
  });

  /** NOT-HALT the moment `line` has gone out to the controller (stopping a job waits for the hold) */
  const stopWhenSent = (line: string, since: number) => {
    const off = useMachine.subscribe((st) => {
      if (st.log.slice(since).some((l) => l.kind === 'out' && l.text === line)) {
        off();
        useMachine.getState().emergencyStop();
      }
    });
  };

  it('goes no further with the tool change moves once the stop came between two of them', async () => {
    const from = useMachine.getState().log.length;
    await vi.waitFor(() =>
      expect(useMachine.getState().streamJob('tc.nc', TOOL_CHANGE)).toBe(true),
    );
    stopWhenSent('M5', from);
    await vi.waitFor(() => expect(useMachine.getState().stream?.result).toBe('aborted'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(sentAfterReset(from)).toBe('');
  });

  it('does not say the job goes on when the stop came with the last move of "Job fortsetzen"', async () => {
    await vi.waitFor(() =>
      expect(useMachine.getState().streamJob('tc.nc', TOOL_CHANGE)).toBe(true),
    );
    await vi.waitFor(() => expect(useMachine.getState().stream?.toolChange).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 400));
    const from = useMachine.getState().log.length;
    stopWhenSent('G90', from);
    void useMachine.getState().continueAfterToolChange();
    await vi.waitFor(() => expect(useMachine.getState().stream?.result).toBe('aborted'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(useMachine.getState().stream?.toolChange).toBeNull();
    expect(useMachine.getState().log.some((l) => l.text === t('toolChange.continue'))).toBe(false);
  });

  it('does not restore the spindle after a stop that came with the last lift move', async () => {
    const withSpindle = 'G21\nM3 S12000\nG0 X1\nT1 M6\nG0 X2\n';
    await vi.waitFor(() =>
      expect(useMachine.getState().streamJob('sp.nc', withSpindle)).toBe(true),
    );
    await vi.waitFor(() => expect(useMachine.getState().stream?.toolChange).not.toBeNull());
    // the spindle was on before the hold: going on would restore it
    expect(useMachine.getState().stream?.toolChange?.spindleBefore).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const from = useMachine.getState().log.length;
    stopWhenSent('G90', from);
    void useMachine.getState().continueAfterToolChange();
    await vi.waitFor(() => expect(useMachine.getState().stream?.result).toBe('aborted'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(sentAfterReset(from)).toBe('');
  });
});
