import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyFailure,
  hostOf,
  isRelayUrl,
  mayRetry,
  relayTarget,
  retryDelay,
  secondsUntil,
} from '../src/lib/link';
import { useMachine } from '../src/store/machine';

describe('the way to the machine (pure)', () => {
  it('knows the relay path and the address the operator recognises', () => {
    expect(isRelayUrl('ws://192.168.0.198:8080/fluidnc')).toBe(true);
    expect(isRelayUrl('ws://192.168.0.200:81/')).toBe(false);
    expect(hostOf('ws://192.168.0.200:81/')).toBe('192.168.0.200:81');
    expect(relayTarget('FluidNC unreachable: ws://192.168.0.200:81')).toBe('192.168.0.200:81');
    expect(relayTarget('FluidNC disconnected: ws://jackpot.local:81/')).toBe('jackpot.local:81');
    expect(relayTarget('No FluidNC address configured')).toBeNull();
    expect(relayTarget(undefined)).toBeNull();
  });

  it('tells which device was missing', () => {
    // Straight to FluidNC: whatever happened, FluidNC did not answer there.
    expect(classifyFailure({ kind: 'unreachable' }, false)).toBe('direct');
    expect(classifyFailure({ kind: 'silent' }, false)).toBe('direct');
    // Through the Pi: no socket at all – the Pi is not reached.
    expect(classifyFailure({ kind: 'unreachable' }, true)).toBe('pi');
    // The Pi took it and said FluidNC is not there (1011 and its reason), or nothing answered.
    expect(classifyFailure({ kind: 'closed', code: 1011, reason: '' }, true)).toBe('relay');
    expect(classifyFailure({ kind: 'closed', code: 1000, reason: 'FluidNC x' }, true)).toBe(
      'relay',
    );
    expect(classifyFailure({ kind: 'silent' }, true)).toBe('relay');
    // Closed otherwise (the Pi's server went away): the Pi.
    expect(classifyFailure({ kind: 'closed', code: 1006 }, true)).toBe('pi');
  });

  it('waits longer each time, at most 30 s, and only where it may', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([
      2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
    expect(retryDelay(-1)).toBe(2000);
    const ok = { autoRetry: true, jobRunning: false, lostDuringJob: false, simulator: false };
    expect(mayRetry(ok)).toBe(true);
    expect(mayRetry({ ...ok, autoRetry: false })).toBe(false);
    expect(mayRetry({ ...ok, jobRunning: true })).toBe(false);
    expect(mayRetry({ ...ok, lostDuringJob: true })).toBe(false);
    expect(mayRetry({ ...ok, simulator: true })).toBe(false);
    expect(secondsUntil(10_500, 1000)).toBe(10);
    expect(secondsUntil(1000, 5000)).toBe(0);
  });
});

/** How the next socket behaves: answers, refuses, or the relay closes it saying FluidNC is gone. */
type Script = 'answer' | 'refuse' | 'relay-down' | 'silent';

class ScriptedSocket {
  static scripts: Script[] = [];
  static opened: ScriptedSocket[] = [];
  static last: ScriptedSocket | null = null;
  binaryType = 'blob';
  readyState = 0;
  sent: string[] = [];
  silent = false;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {
    ScriptedSocket.opened.push(this);
    ScriptedSocket.last = this;
    const script = ScriptedSocket.scripts.shift() ?? 'refuse';
    queueMicrotask(() => {
      if (script === 'refuse') {
        this.onerror?.({});
        this.drop(1006, '');
        return;
      }
      this.readyState = 1;
      this.silent = script === 'relay-down' || script === 'silent';
      this.onopen?.({});
      if (script === 'relay-down') this.drop(1011, 'FluidNC unreachable: ws://192.168.0.200:81');
    });
  }
  send(data: string | Uint8Array) {
    const text = typeof data === 'string' ? data : '';
    this.sent.push(text);
    if (text === '?' && this.readyState === 1 && !this.silent)
      this.onmessage?.({ data: '<Idle|MPos:0.000,0.000,0.000|FS:0,0>\n' });
    else if (text.endsWith('\n')) this.onmessage?.({ data: 'ok\n' });
  }
  close() {
    this.drop(1000, '');
  }
  drop(code: number, reason: string) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const sockets = () => ScriptedSocket.opened.length;
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('coming back by itself', () => {
  const original = (globalThis as { WebSocket?: unknown }).WebSocket;
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { WebSocket?: unknown }).WebSocket = ScriptedSocket;
    ScriptedSocket.scripts = [];
    ScriptedSocket.opened = [];
    useMachine.getState().disconnect();
    useMachine.setState({
      autoRetry: true,
      fileJob: null,
      stream: null,
      lostInJob: null,
      log: [],
      link: { ...useMachine.getState().link, lostDuringJob: false },
    });
  });
  afterEach(() => {
    useMachine.getState().disconnect();
    (globalThis as { WebSocket?: unknown }).WebSocket = original;
    vi.useRealTimers();
  });

  it('keeps trying through the Pi outside a job, says once why, and stops when asked', async () => {
    useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
    ScriptedSocket.scripts = ['relay-down', 'relay-down', 'relay-down'];
    await useMachine.getState().connect();
    let { link, connection, log } = useMachine.getState();
    expect(connection).toBe('disconnected');
    expect(link).toMatchObject({
      phase: 'waiting',
      failure: 'relay',
      target: '192.168.0.200:81',
      via: '192.168.0.198:8080',
      attempt: 1,
    });
    // The socket opened and closed at once: no "Verbunden", one warning that names the Jackpot.
    expect(log.filter((l) => l.key === 'machine.connected')).toHaveLength(0);
    expect(log.filter((l) => l.key === 'link.relay').map((l) => l.text)).toEqual([
      'Pi erreicht den Jackpot nicht (192.168.0.200:81)',
    ]);
    expect(link.retryAt! - Date.now()).toBe(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sockets()).toBe(2);
    ({ link, log } = useMachine.getState());
    expect(link.attempt).toBe(2);
    expect(link.retryAt! - Date.now()).toBe(4000);
    // The same failure again is not said again.
    expect(log.filter((l) => l.kind === 'error')).toHaveLength(1);
    // "Jetzt versuchen": at once, the series goes on.
    useMachine.getState().retryNow();
    await flush();
    expect(sockets()).toBe(3);
    expect(useMachine.getState().link.attempt).toBe(3);
    // "Aufhören": nothing more by itself, and it is remembered.
    useMachine.getState().stopRetry();
    expect(useMachine.getState()).toMatchObject({ autoRetry: false, link: { phase: 'failed' } });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets()).toBe(3);
  });

  it('tells a Pi that cannot be reached apart, and connects once FluidNC answers', async () => {
    useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
    ScriptedSocket.scripts = ['refuse', 'answer'];
    await useMachine.getState().connect();
    expect(useMachine.getState().link).toMatchObject({ phase: 'waiting', failure: 'pi' });
    expect(useMachine.getState().log.at(-1)).toMatchObject({
      kind: 'error',
      key: 'link.pi',
      text: 'Pi nicht erreichbar (192.168.0.198:8080)',
    });
    await vi.advanceTimersByTimeAsync(2000);
    const { connection, link, log } = useMachine.getState();
    expect(connection).toBe('connected');
    expect(link.phase).toBe('idle');
    expect(log.filter((l) => l.key === 'machine.connected')).toHaveLength(1);
    // A reconnect only asks: the status, the banner, the modal state, the offsets.
    const lines = ScriptedSocket.last!.sent.map((d) => d.trim()).filter(Boolean);
    expect(new Set(lines)).toEqual(new Set(['?', '$I', '$G', '$#']));
  });

  it('comes back after a drop outside a job – direct to FluidNC', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    ScriptedSocket.scripts = ['answer', 'refuse', 'answer'];
    await useMachine.getState().connect();
    expect(useMachine.getState().connection).toBe('connected');
    ScriptedSocket.last!.drop(1006, '');
    expect(useMachine.getState()).toMatchObject({
      connection: 'disconnected',
      lostInJob: null,
      link: { phase: 'waiting', failure: 'direct', target: '192.168.0.200:81' },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(useMachine.getState().link).toMatchObject({ phase: 'waiting', attempt: 2 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(useMachine.getState().connection).toBe('connected');
  });

  it('never reconnects by itself during a job or after a connection lost during one', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    useMachine.setState({ fileJob: { name: 'schild.nc', startedAt: Date.now() } });
    ScriptedSocket.last!.drop(1006, '');
    expect(useMachine.getState().lostInJob).toMatchObject({ name: 'schild.nc', sd: true });
    expect(useMachine.getState().link).toMatchObject({ phase: 'idle', lostDuringJob: true });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets()).toBe(1);
    // Acknowledged – still nothing by itself; a try by hand that fails waits for the operator.
    useMachine.getState().acknowledgeLost();
    useMachine.setState({ fileJob: null });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets()).toBe(1);
    await useMachine.getState().connect();
    expect(useMachine.getState().link).toMatchObject({ phase: 'failed', lostDuringJob: true });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets()).toBe(2);
    // Connected by hand: the latch is gone, coming back by itself is allowed again.
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    expect(useMachine.getState().link.lostDuringJob).toBe(false);
  });

  it('a streamed job whose connection drops is the critical message, too', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    // FluidNC never answers the lines: the job is still running when the link drops.
    const socket = ScriptedSocket.last!;
    socket.send = (data) => void socket.sent.push(String(data));
    expect(useMachine.getState().streamJob('t.nc', 'G1 X1\nG1 X2')).toBe(true);
    expect(useMachine.getState().stream?.result).toBe('running');
    socket.drop(1006, '');
    expect(useMachine.getState().lostInJob).toMatchObject({ name: 't.nc', sd: false });
    expect(useMachine.getState().stream?.result).toBe('aborted');
  });

  it('"Verbinden abbrechen" ends a try that waits for FluidNC – quietly, without a retry', async () => {
    useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
    ScriptedSocket.scripts = ['silent'];
    const attempt = useMachine.getState().connect();
    await flush();
    expect(useMachine.getState().link.phase).toBe('connecting');
    useMachine.getState().disconnect();
    await attempt;
    expect(useMachine.getState().link.phase).toBe('idle');
    expect(useMachine.getState().log.filter((l) => l.kind === 'error')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets()).toBe(1);
  });

  it('does not try by itself while a job runs, and not after "Trennen"', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
    await useMachine.getState().connect();
    expect(useMachine.getState().link.phase).toBe('failed');
    useMachine.setState({ fileJob: null });
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    useMachine.getState().disconnect();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets()).toBe(2);
    expect(useMachine.getState().link.phase).toBe('idle');
    // Switched off and on again: the choice is the operator's.
    useMachine.getState().setAutoRetry(false);
    expect(useMachine.getState().autoRetry).toBe(false);
    useMachine.getState().setAutoRetry(true);
    expect(useMachine.getState().autoRetry).toBe(true);
  });
});
