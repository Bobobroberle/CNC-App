import { describe, expect, it, vi } from 'vitest';
import type { CompanionHealth } from '../src/lib/companion';
import { runShutdown, useShutdown, type ShutdownState } from '../src/store/shutdown';

const alive = (extra: Partial<CompanionHealth> = {}): CompanionHealth => ({
  ok: true,
  version: '0.1.0',
  fluidnc: null,
  sensors: 'push',
  shutdown: true,
  shutdownError: null,
  ...extra,
});
const gone = () => Promise.reject(new TypeError('Failed to fetch'));
const instant = { sleep: () => Promise.resolve(), settleSeconds: 3 };

const run = async (
  client: Parameters<typeof runShutdown>[0],
  options: Parameters<typeof runShutdown>[2] = instant,
) => {
  const states: ShutdownState[] = [];
  const end = await runShutdown(client, (s) => states.push(s), options);
  return { end, phases: states.map((s) => (s.phase === 'settling' ? s.remaining : s.phase)) };
};

describe('Pi shutdown', () => {
  it('waits until the companion stops answering, then counts down', async () => {
    const health = vi
      .fn()
      .mockResolvedValueOnce(alive())
      .mockImplementationOnce(gone)
      .mockResolvedValueOnce(alive())
      .mockImplementation(gone);
    const shutdown = vi.fn().mockResolvedValue({ ok: true });
    const { end, phases } = await run({ health, shutdown });
    expect(shutdown).toHaveBeenCalledOnce();
    // one miss is not enough: the answer after it resets the count
    expect(health).toHaveBeenCalledTimes(5);
    expect(health).toHaveBeenCalledWith(1500);
    expect(phases).toEqual(['requesting', 'stopping', 3, 2, 1, 'done']);
    expect(end).toEqual({ phase: 'done', failure: null, detail: null, remaining: 0 });
  });

  it('tells an old companion from a request that did not get through', async () => {
    const health = vi.fn();
    expect(
      (await run({ health, shutdown: () => Promise.reject(new Error('HTTP 501')) })).end,
    ).toMatchObject({ phase: 'failed', failure: 'not-supported' });
    expect((await run({ health, shutdown: gone })).end).toMatchObject({
      phase: 'failed',
      failure: 'request',
    });
    // the Pi wants a login for it: that is its own failure, with its own words
    expect(
      (await run({ health, shutdown: () => Promise.reject(new Error('HTTP 401')) })).end,
    ).toMatchObject({ phase: 'failed', failure: 'login' });
    expect(health).not.toHaveBeenCalled();
  });

  it('reports when the Pi refuses or keeps running', async () => {
    const shutdown = () => Promise.resolve({ ok: true });
    const refused = vi
      .fn()
      .mockResolvedValueOnce(alive())
      .mockResolvedValue(alive({ shutdownError: 'sudo: a password is required' }));
    expect((await run({ health: refused, shutdown })).end).toEqual({
      phase: 'failed',
      failure: 'host',
      detail: 'sudo: a password is required',
      remaining: 0,
    });
    const stubborn = vi.fn().mockResolvedValue(alive());
    const { end } = await run(
      { health: stubborn, shutdown },
      { ...instant, pollMs: 1000, timeoutMs: 5000 },
    );
    expect(end).toMatchObject({ phase: 'failed', failure: 'still-running' });
    expect(stubborn).toHaveBeenCalledTimes(5);
  });

  it('waits in real time by default', async () => {
    vi.useFakeTimers();
    try {
      const states: ShutdownState[] = [];
      const done = runShutdown({ health: gone, shutdown: () => Promise.resolve() }, (s) =>
        states.push(s),
      );
      await vi.advanceTimersByTimeAsync(2000);
      expect(states.at(-1)).toMatchObject({ phase: 'settling', remaining: 15 });
      await vi.advanceTimersByTimeAsync(15_000);
      expect((await done).phase).toBe('done');
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs one shutdown at a time from the store', async () => {
    let finish!: (v: unknown) => void;
    const shutdown = vi.fn(() => new Promise((r) => (finish = r)));
    const client = { health: gone, shutdown };
    useShutdown.getState().start(client, instant);
    useShutdown.getState().start(client, instant);
    expect(shutdown).toHaveBeenCalledOnce();
    expect(useShutdown.getState().phase).toBe('requesting');
    finish({ ok: true });
    await vi.waitFor(() => expect(useShutdown.getState().phase).toBe('done'));
    useShutdown.getState().reset();
    expect(useShutdown.getState().phase).toBe('idle');
    useShutdown.getState().start({ health: gone, shutdown: gone }, instant);
    await vi.waitFor(() => expect(useShutdown.getState().phase).toBe('failed'));
    useShutdown.getState().start(client, instant);
    expect(shutdown).toHaveBeenCalledTimes(2);
  });
});
