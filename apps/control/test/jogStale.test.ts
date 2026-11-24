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

  const realCommand = useMachine.getState().command;
  const sent = vi.fn(async (_line: string) => true);
  beforeEach(async () => {
    sent.mockReset();
    sent.mockImplementation(async () => true);
    useMachine.getState().jogCancel();
    // a cancelled jog leaves the last report older than the stop: let a fresh one come in first
    await new Promise((resolve) => setTimeout(resolve, 400));
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
    // a report that still says the axis moves is no rest: nothing goes out yet
    useMachine.setState({ status: reportOf('Jog', 106) as never });
    // (microtasks only: a real timer would give the simulator's own status poll time to come in)
    await Promise.resolve();
    await Promise.resolve();
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

  it('is dropped when the jog is cancelled while it waits – "Jog stoppen" is the last word', async () => {
    useMachine.setState({ status: reportOf('Jog', 100) as never });
    useMachine.getState().jog('X', 1);
    useMachine.getState().jogCancel();
    useMachine.setState({ status: reportOf('Idle', 112) as never });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).not.toHaveBeenCalled();
  });

  it('is dropped by NOT-HALT, PAUSE and stopping the job – at once, not when the reset arrives', async () => {
    const stops: Array<[string, () => unknown]> = [
      ['not-halt', () => useMachine.getState().emergencyStop()],
      ['pause', () => useMachine.getState().feedHold()],
      ['stop job', () => void useMachine.getState().stopJob()],
    ];
    for (const [name, stop] of stops) {
      sent.mockClear();
      useMachine.setState({ homed: true, status: reportOf('Jog', 100) as never });
      useMachine.getState().jog('X', 1);
      stop();
      // an Idle report comes in before anything else: the step is still not wanted
      useMachine.setState({ status: reportOf('Idle', 112) as never });
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(sent, name).not.toHaveBeenCalled();
      // let the simulator come to rest again before the next one
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, 10_000);

  it('counts from no report that is older than a stop – a step tapped at once waits for a fresh one', async () => {
    const stops: Array<[string, () => unknown]> = [
      ['not-halt', () => useMachine.getState().emergencyStop()],
      ['pause', () => useMachine.getState().feedHold()],
      ['stop job', () => void useMachine.getState().stopJob()],
    ];
    for (const [name, stop] of stops) {
      sent.mockClear();
      useMachine.setState({ homed: true, status: reportOf('Idle', 100) as never });
      stop();
      // no await in between: no real report has come in since the stop
      useMachine.setState({ status: reportOf('Idle', 100) as never });
      useMachine.getState().jog('X', 1);
      expect(sent, name).not.toHaveBeenCalled();
      // dropped again, and the simulator comes to rest before the next one
      useMachine.getState().jogCancel();
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }, 10_000);

  it('counts from no report that is older than a move the app sent itself', async () => {
    useMachine.setState({ homed: true, status: reportOf('Idle', 100) as never });
    // a move of the machine through its own function (the real command goes to the simulator)
    const moved = useMachine.getState().moveMachine({ x: 120 }, 6000);
    useMachine.setState({ status: reportOf('Idle', 100) as never });
    useMachine.getState().jog('X', 1);
    expect(sent).not.toHaveBeenCalled();
    await moved;
    useMachine.getState().jogCancel();
    await new Promise((resolve) => setTimeout(resolve, 400));
  }, 10_000);

  it('is dropped when another move goes out while it waits', async () => {
    useMachine.setState({ status: reportOf('Jog', 100) as never });
    useMachine.getState().jog('X', 1);
    // a new continuous jog forgets what was asked before it
    useMachine.getState().jogStart('Y', 1);
    sent.mockClear();
    useMachine.setState({ status: reportOf('Idle', 112) as never });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).not.toHaveBeenCalled();
  });

  it('does not trust an Idle report that is older than the move just sent', async () => {
    for (const first of ['start', 'cancel'] as const) {
      sent.mockClear();
      useMachine.setState({ homed: true, status: reportOf('Idle', 100) as never });
      // a continuous jog goes out – or the stop of one: the Idle in the store is from before
      if (first === 'start') useMachine.getState().jogStart('X', 1);
      else useMachine.getState().jogCancel();
      sent.mockClear();
      useMachine.getState().jog('X', 1);
      expect(sent, first).not.toHaveBeenCalled();
      useMachine.setState({ status: reportOf('Idle', 140) as never });
      await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
      expect(targetOf(sent.mock.calls[0]![0])).toBeCloseTo(141, 3);
      useMachine.getState().jogCancel();
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  });

  it('adds up taps that waited together: the second goes on from the first', async () => {
    useMachine.setState({ status: reportOf('Jog', 100) as never });
    useMachine.getState().jog('X', 1);
    useMachine.getState().jog('X', 1);
    useMachine.setState({ status: reportOf('Idle', 112) as never });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2));
    expect(targetOf(sent.mock.calls[0]![0])).toBeCloseTo(113, 3);
    expect(targetOf(sent.mock.calls[1]![0])).toBeCloseTo(114, 3);
  });

  it('says so when the machine does not come to rest in time – never a silent tap', async () => {
    // a real, slow move on the simulator: the controller reports Jog for the whole wait
    useMachine.setState({ command: realCommand });
    void realCommand('$J=G91 G21 X200 F30');
    await vi.waitFor(() => expect(useMachine.getState().status?.state).toBe('Jog'));
    useMachine.setState({ homed: true, command: sent as never });
    const before = useMachine.getState().log.length;
    useMachine.getState().jog('X', 1);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(sent).not.toHaveBeenCalled();
    const lines = useMachine.getState().log.slice(before);
    expect(lines.some((l) => l.key === 'drive.notAtRest')).toBe(true);
    // let the simulator's axis stand again for whatever runs next
    useMachine.getState().jogCancel();
    await vi.waitFor(() => expect(useMachine.getState().status?.state).toBe('Idle'));
  }, 8000);

  it('is dropped when the link goes – no false "does not come to rest" afterwards', async () => {
    useMachine.setState({ homed: true, status: reportOf('Jog', 100) as never });
    const before = useMachine.getState().log.length;
    useMachine.getState().jog('X', 1);
    useMachine.getState().disconnect();
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(sent).not.toHaveBeenCalled();
    const lines = useMachine.getState().log.slice(before);
    expect(lines.some((l) => l.key === 'drive.notAtRest')).toBe(false);
  }, 6000);
});
