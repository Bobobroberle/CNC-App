import type { MachineStatus } from '@lowrider/fluidnc-client';
import { describe, expect, it } from 'vitest';
import { useMachine } from '../src/store/machine';
import { settled } from '../src/store/settle';

const report = (state: MachineStatus['state'], x: number, y: number, z = 0) =>
  ({ state, mpos: [x, y, z], wpos: [x, y, z], wco: [0, 0, 0] }) as unknown as MachineStatus;

describe('waiting for the machine to stand still', () => {
  it('takes the first report that comes in after the call, not the one in the store', async () => {
    // In the store: Idle at the old place, from before the move.
    useMachine.setState({ status: report('Idle', 10, 10) });
    const waiting = settled();
    let done = false;
    void waiting.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    // Still moving, then standing.
    useMachine.setState({ status: report('Run', 15, 10) });
    await Promise.resolve();
    expect(done).toBe(false);
    useMachine.setState({ status: report('Idle', 20, 10) });
    expect((await waiting)?.mpos[0]).toBe(20);
  });

  it('waits for the report of the place the machine was sent to', async () => {
    useMachine.setState({ status: report('Idle', 10, 10) });
    const waiting = settled({ x: 30, y: 40 });
    // A report from before the move: Idle, but not there.
    useMachine.setState({ status: report('Idle', 10, 10) });
    useMachine.setState({ status: report('Idle', 30.004, 39.99) });
    const status = await waiting;
    expect(status?.mpos.slice(0, 2)).toEqual([30.004, 39.99]);
    // Only the axes that were asked for count.
    const z = settled({ z: -50 });
    useMachine.setState({ status: report('Idle', 1, 2, -50) });
    expect((await z)?.mpos[2]).toBe(-50);
  });

  it('gives up when the machine never gets there', async () => {
    useMachine.setState({ status: report('Idle', 10, 10) });
    const waiting = settled({ x: 30 }, 30);
    useMachine.setState({ status: report('Idle', 12, 10) });
    expect(await waiting).toBeNull();
  });
});
