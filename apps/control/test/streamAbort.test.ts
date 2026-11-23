import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useMachine } from '../src/store/machine';

// A stream that is stopped while it waits – at a single step or a tool change – no longer waits.
// (A stale wait keeps the check out of Fräsen and the pause disabled until another stream starts.)
describe('a stream that is stopped does not go on waiting', () => {
  beforeAll(async () => {
    useMachine.getState().setUrl('simulator');
    await useMachine.getState().connect();
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
});
