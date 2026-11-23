import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';

// The guards of the machine store, against the simulated controller: where a move or a jog is
// refused or sent as a long relative move.
describe('the machine store guards a move and a jog', () => {
  beforeAll(async () => {
    useMachine.getState().setUrl('simulator');
    await useMachine.getState().connect();
    await vi.waitFor(() => expect(useMachine.getState().status?.state).toBe('Idle'));
  });
  afterAll(() => useMachine.getState().disconnect());

  const profile = (softLimits: boolean) =>
    useJob.setState({ profile: { ...useJob.getState().profile, softLimits } });

  beforeEach(() => useMachine.setState({ log: [] }));

  it('refuses a machine move past either end of the travel once homed', async () => {
    profile(true);
    useMachine.setState({ homed: true });
    const { x } = useJob.getState().profile.travel;
    expect(await useMachine.getState().moveMachine({ x: x.max + 1 }, 1000)).toBe(false);
    expect(await useMachine.getState().moveMachine({ x: x.min - 1 }, 1000)).toBe(false);
    expect(useMachine.getState().log.filter((l) => l.key === 'calibration.outside')).toHaveLength(
      2,
    );
  });

  it('jogs as a relative move unless the machine is homed and has soft limits', () => {
    const command = vi.fn((_line: string) => Promise.resolve(true));
    const sent = (homed: boolean, soft: boolean) => {
      profile(soft);
      useMachine.setState({ homed, command });
      command.mockClear();
      useMachine.getState().jog('X', 5);
      return command.mock.calls.map(([line]) => String(line));
    };
    for (const [homed, soft] of [
      [false, true],
      [true, false],
      [false, false],
    ] as const) {
      expect(sent(homed, soft)).toEqual([expect.stringContaining('$J=G91')]);
    }
    expect(sent(true, true)).toEqual([expect.stringContaining('$J=G53')]);
  });
});
