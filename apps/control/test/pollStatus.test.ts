import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useMachine } from '../src/store/machine';

// The strip scan on the Pi's clock wants more reports while the camera runs: the status is asked for faster, only for the run.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How many reports come in `ms` */
async function reportsIn(ms: number): Promise<number> {
  let n = 0;
  const off = useMachine.subscribe((s, prev) => {
    if (s.status && s.status !== prev.status) n++;
  });
  await wait(ms);
  off();
  return n;
}

describe('asking for the status faster', () => {
  it('does nothing, and throws nothing, while there is no connection', async () => {
    expect(useMachine.getState().connection).toBe('disconnected');
    const stop = useMachine.getState().pollStatus(10);
    await wait(60);
    stop();
  });

  describe('on a connection', () => {
    beforeAll(async () => {
      useMachine.getState().setUrl('simulator');
      await useMachine.getState().connect();
      await new Promise<void>((resolve) => {
        const check = () => (useMachine.getState().status ? resolve() : setTimeout(check, 20));
        check();
      });
    });
    afterAll(() => useMachine.getState().disconnect());

    it('brings more reports than the regular poll (5 a second) until it is stopped, and then no more', async () => {
      const regular = await reportsIn(600);
      // the regular poll: every 200 ms
      expect(regular).toBeGreaterThanOrEqual(2);
      expect(regular).toBeLessThanOrEqual(4);
      const stop = useMachine.getState().pollStatus(25);
      const fast = await reportsIn(600);
      expect(fast).toBeGreaterThanOrEqual(12);
      stop();
      // let the last answers in, then count again
      await wait(100);
      const after = await reportsIn(600);
      expect(after).toBeLessThanOrEqual(4);
      // stopping twice is no harm
      stop();
    });
  });
});
