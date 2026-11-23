import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';

// A step jog counts its target from the position the store has. Right after a continuous jog is let
// go that position is older than the move (the axis is still running out): counted from it, the step
// would send the axis back by the run-out. The step waits for the report that shows the machine at rest.
describe('a step jog straight after a continuous one', () => {
  beforeAll(async () => {
    useMachine.getState().setUrl('simulator');
    await useMachine.getState().connect();
    await vi.waitFor(() => expect(useMachine.getState().status?.state).toBe('Idle'));
    // the simulator's greeting comes after the connection is up – and a greeting is a reset to the
    // store (the jog targets are forgotten): let it be over before the test counts on them
    await vi.waitFor(() =>
      expect(useMachine.getState().log.some((l) => l.text.startsWith('[OPT'))).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
  afterAll(() => useMachine.getState().disconnect());

  const sent = vi.fn(async (_line: string) => true);
  beforeEach(() => {
    sent.mockReset();
    sent.mockImplementation(async () => true);
    useMachine.getState().jogCancel();
    useJob.setState({ profile: { ...useJob.getState().profile, softLimits: true } });
    useMachine.setState({ homed: true, command: sent as never });
  });

  const reportOf = (state: string, x: number) => ({
    ...useMachine.getState().status!,
    state,
    mpos: [x, 50, 0] as never,
  });
  const targetOf = (line: string) => Number(/X(-?[\d.]+)/.exec(line)![1]);

  it('counts from the position at once where the machine rests', () => {
    useMachine.setState({ status: reportOf('Idle', 100) as never });
    useMachine.getState().jog('X', 1);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(targetOf(sent.mock.calls[0]![0])).toBeCloseTo(101, 3);
  });

  it('waits for the machine to come to rest when the position may be stale', async () => {
    // the last report says "Jog" at X 100 – the axis has run on since
    useMachine.setState({ status: reportOf('Jog', 100) as never });
    useMachine.getState().jog('X', 1);
    expect(sent).not.toHaveBeenCalled();
    // the next report is the machine at rest, where it really is
    useMachine.setState({ status: reportOf('Idle', 112) as never });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    expect(targetOf(sent.mock.calls[0]![0])).toBeCloseTo(113, 3);
    // a second tap goes on from the target of the first, not from the report
    useMachine.setState({ homed: true, status: reportOf('Jog', 112.5) as never });
    useMachine.getState().jog('X', 1);
    expect(sent).toHaveBeenCalledTimes(2);
    expect(targetOf(sent.mock.calls[1]![0])).toBeCloseTo(114, 3);
  });
});
