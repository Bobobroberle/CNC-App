// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PiAccessCard } from '../src/components/PiAccessCard';
import { PiUpdateCard } from '../src/components/PiUpdateCard';
import { usePiLogin } from '../src/store/piLogin';
import { useUpdate } from '../src/store/piUpdate';
import '../src/store/underway';
import { useWorkshop } from '../src/store/workshop';

// The update card judged against a Pi that changes: what it says after a step must follow what the Pi says – and a
// success is only said where the Pi has confirmed it. (The whole flow against a faked companion: e2e/piupdate.spec.ts.)

const BASE = 'http://pi:8080';
const status = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  running: { name: 'b2', version: '0.1.0', build: 200, commit: 'abc' },
  previous: { name: 'b1', version: '0.1.0', build: 100, commit: 'def' },
  setupLevel: 2,
  last: null,
  trial: false,
  staged: null,
  busy: null,
  ...over,
});

/** The Pi as a script: what `/api/update` answers now (null: not at all). */
let pi: { status: Record<string, unknown> | null; calls: string[] };
const fake = vi.fn(async (input: RequestInfo | URL) => {
  const path = String(input).replace(BASE, '');
  pi.calls.push(path);
  if (path === '/api/update' && pi.status) return new Response(JSON.stringify(pi.status));
  if (path === '/api/auth/me') return new Response('{"device":{"id":"d","name":"x"}}');
  if (path === '/api/auth/devices') return new Response('{"devices":[]}');
  // no status: the Pi does not answer at all (a refused token is its own case, below)
  throw new TypeError('Failed to fetch');
});

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  pi = { status: status(), calls: [] };
  fake.mockClear();
  vi.stubGlobal('fetch', fake);
  useWorkshop.getState().setSettings({ companionUrl: BASE });
  useWorkshop.setState({
    companionHealth: { ok: true, version: '0.1.0', update: true, auth: true } as never,
  });
  usePiLogin.setState({ login: { base: BASE, token: 'tok', name: 'Tablet' }, expired: null });
  useUpdate.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useUpdate.getState().reset();
  usePiLogin.setState({ login: null, expired: null });
});

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const done = (reached = 200) =>
  act(() => {
    useUpdate.setState({
      phase: 'done',
      kind: 'update',
      reached,
      staged: null,
      error: null,
      verified: false,
    });
  });

describe('the update card after a step', () => {
  it('does not carry an end into the next visit: a finished flow is cleared when the card shows again', async () => {
    useUpdate.setState({ phase: 'done', kind: 'update', reached: 200 });
    pi.status = status({ running: { name: 'b3', version: '0.1.0', build: 300, commit: 'x' } });
    render(<PiUpdateCard />);
    await vi.waitFor(() => expect(useUpdate.getState().phase).toBe('idle'));
    // judged against a Pi that has gone on since, it would have said "went back by itself" – wrongly
    expect(screen.queryByTestId('update-error')).toBeNull();
    expect(screen.queryByTestId('update-done')).toBeNull();
  });

  it('is not done while the new version is on trial – and not after it was taken away', async () => {
    vi.useFakeTimers();
    pi.status = status({ trial: true });
    render(<PiUpdateCard />);
    await flush();
    await done();
    await flush(1);
    expect(screen.getByTestId('update-settling')).toBeTruthy();
    expect(screen.queryByTestId('update-done')).toBeNull();
    // it confirms itself: done
    pi.status = status({ trial: false });
    await flush(4100);
    expect(screen.getByTestId('update-done')).toBeTruthy();
    expect(screen.queryByTestId('update-settling')).toBeNull();
  });

  it('says taken back where the Pi runs another build than the one that answered', async () => {
    vi.useFakeTimers();
    pi.status = status({ trial: true });
    render(<PiUpdateCard />);
    await flush();
    await done();
    await flush(1);
    pi.status = status({
      trial: false,
      running: { name: 'b1', version: '0.1.0', build: 100, commit: 'def' },
    });
    await flush(4100);
    expect(screen.getByTestId('update-error').textContent).toContain('zurückgekehrt');
    expect(screen.queryByTestId('update-done')).toBeNull();
  });

  it('never calls an unconfirmed version done: after three minutes it says so, and looks again when asked', async () => {
    vi.useFakeTimers();
    pi.status = null; // the Pi does not answer the status any more
    render(<PiUpdateCard />);
    await flush();
    await done();
    await flush(4000 * 47);
    expect(screen.getByTestId('update-unconfirmed')).toBeTruthy();
    expect(screen.queryByTestId('update-done')).toBeNull();
    expect(screen.queryByTestId('update-reload')).toBeNull();
    // asked again while it is still on trial: another three minutes of looking, not the same notice again
    pi.status = status({ trial: true });
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-recheck'));
    });
    await flush(10);
    expect(screen.getByTestId('update-settling')).toBeTruthy();
    expect(screen.queryByTestId('update-unconfirmed')).toBeNull();
    // it was only slow: it confirms
    pi.status = status({ trial: false });
    await flush(4100);
    expect(screen.getByTestId('update-done')).toBeTruthy();
    expect(screen.queryByTestId('update-unconfirmed')).toBeNull();
  });

  it('is done at once after a way back by hand – no trial is waited for', async () => {
    vi.useFakeTimers();
    render(<PiUpdateCard />);
    await flush();
    // (what the Pi says is not known yet: a way back by hand is no reason to wait for it)
    pi.status = null;
    act(() =>
      useUpdate.setState({
        phase: 'done',
        kind: 'rollback',
        reached: 100,
        staged: null,
        error: null,
      }),
    );
    await flush(10);
    expect(screen.getByTestId('update-done')).toBeTruthy();
    expect(screen.queryByTestId('update-settling')).toBeNull();
  });

  it('looks again by itself after a step that ended without an answer – when the Pi is back, its state and the way back show', async () => {
    vi.useFakeTimers();
    pi.status = null;
    render(<PiUpdateCard />);
    await flush();
    act(() =>
      useUpdate.setState({
        phase: 'failed',
        kind: 'update',
        error: { code: 'no-answer', detail: null },
        staged: null,
      }),
    );
    await flush(100);
    expect(screen.queryByTestId('update-rollback')).toBeNull();
    pi.status = status();
    await flush(5100);
    expect(screen.getByTestId('update-status')).toBeTruthy();
    expect(screen.getByTestId('update-rollback')).toBeTruthy();
  });

  it('forgets the checksum of the file that is done with', async () => {
    vi.useFakeTimers();
    render(<PiUpdateCard />);
    await flush();
    const field = screen.getByTestId('update-checksum') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'a'.repeat(64) } });
    expect(field.value).toBe('a'.repeat(64));
    await done();
    await flush(10);
    expect((screen.getByTestId('update-checksum') as HTMLInputElement).value).toBe('');
  });
});

describe('the login card when the Pi takes the login back', () => {
  it('says why, wherever the refusal came: the reason is the store’s, not an effect’s', async () => {
    render(<PiAccessCard />);
    await vi.waitFor(() => expect(screen.getByTestId('access-in')).toBeTruthy());
    // a call from another card is refused with 401: the client ends the login and the store says why
    act(() => usePiLogin.getState().expire(BASE));
    expect(screen.getByTestId('access-expired')).toBeTruthy();
    expect(screen.getByTestId('access-code')).toBeTruthy();
    // a new login (or a logout) clears the reason
    act(() => usePiLogin.getState().set({ base: BASE, token: 'new', name: 'Tablet' }));
    expect(screen.queryByTestId('access-expired')).toBeNull();
  });

  it('is told by the client when the Pi refuses the token of a call made from the card', async () => {
    pi.status = null; // /api/auth/me -> fine; the devices call below is refused
    render(<PiAccessCard />);
    await vi.waitFor(() => expect(pi.calls).toContain('/api/auth/me'));
    fake.mockImplementationOnce(
      async () => new Response('{"error":"unauthorized"}', { status: 401 }),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('access-show'));
    });
    await vi.waitFor(() => expect(screen.getByTestId('access-expired')).toBeTruthy());
    expect(usePiLogin.getState().login).toBeNull();
  });
});
