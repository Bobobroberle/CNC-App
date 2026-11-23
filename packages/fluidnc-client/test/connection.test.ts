import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandError,
  ConnectError,
  FluidNCConnection,
  Realtime,
  ViewOnlyError,
  type ControllerMessage,
  type MachineStatus,
} from '../src';
import { FakeSocket } from './fake-socket';

let socket: FakeSocket;
const createSocket = (url: string) => (socket = new FakeSocket(url));

async function connected(options: { statusIntervalMs?: number; commandTimeoutMs?: number } = {}) {
  const c = new FluidNCConnection({
    url: 'ws://jackpot:81',
    createSocket,
    statusIntervalMs: 0,
    ...options,
  });
  const p = c.connect();
  socket.answer();
  await p;
  socket.sent = [];
  return c;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('connect / disconnect', () => {
  it('opens the socket in binary mode and reports states', async () => {
    const c = new FluidNCConnection({ url: 'ws://jackpot:81', createSocket });
    const states: string[] = [];
    c.on('state', (s) => states.push(s));
    const p = c.connect();
    expect(socket.binaryType).toBe('arraybuffer');
    expect(socket.url).toBe('ws://jackpot:81');
    socket.open();
    // Open is not yet connected: the controller has to answer first.
    expect(c.state).toBe('connecting');
    expect(socket.sent[0]).toBe('?');
    socket.receive('<Idle|MPos:0,0,0>\n');
    await p;
    expect(c.state).toBe('connected');
    await expect(c.connect()).rejects.toThrow(/already/i);
    c.disconnect();
    expect(states).toEqual(['connecting', 'connected', 'disconnected']);
    expect(c.status).toBeNull();
    c.disconnect();
  });

  it('rejects when the socket errors or closes while connecting', async () => {
    const c = new FluidNCConnection({ url: 'ws://x', createSocket });
    const p = c.connect();
    socket.fail();
    await expect(p).rejects.toThrow(/cannot connect/i);
    const c2 = new FluidNCConnection({ url: 'ws://x', createSocket });
    const p2 = c2.connect();
    socket.close();
    await expect(p2).rejects.toMatchObject({ kind: 'unreachable' });
    expect(c2.state).toBe('disconnected');
  });

  it('tells apart a socket that never opens, closes before an answer, or stays silent', async () => {
    const closed: unknown[] = [];
    const c = new FluidNCConnection({ url: 'ws://pi/fluidnc', createSocket, answerTimeoutMs: 500 });
    c.on('closed', (info) => closed.push(info));
    const never = c.connect();
    socket.fail();
    socket.close();
    await expect(never).rejects.toMatchObject({ kind: 'unreachable', url: 'ws://pi/fluidnc' });
    expect(closed).toEqual([{ code: 1006, reason: '', opened: false, answered: false }]);

    const relay = c.connect();
    socket.open();
    socket.fail();
    socket.close(1011, 'FluidNC unreachable: ws://192.168.0.200:81');
    const error = await relay.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectError);
    expect(error).toMatchObject({ kind: 'closed', code: 1011 });
    expect((error as Error).message).toMatch(/closed: FluidNC unreachable/);
    expect(closed[1]).toEqual({
      code: 1011,
      reason: 'FluidNC unreachable: ws://192.168.0.200:81',
      opened: true,
      answered: false,
    });
    const plain = c.connect();
    socket.open();
    socket.close();
    await expect(plain).rejects.toThrow(/closed$/);

    const silent = c.connect();
    socket.open();
    vi.advanceTimersByTime(500);
    await expect(silent).rejects.toMatchObject({ kind: 'silent' });
    expect((await silent.catch((e: Error) => e.message)) as string).toMatch(/no answer/i);
    expect(c.state).toBe('disconnected');
    expect(closed).toHaveLength(3);
  });

  it('ends a pending attempt when the app closes it', async () => {
    const c = new FluidNCConnection({ url: 'ws://x', createSocket });
    const p = c.connect();
    socket.open();
    c.disconnect();
    await expect(p).rejects.toMatchObject({ kind: 'closed', code: 1000, reason: 'Disconnected' });
    expect(c.state).toBe('disconnected');
  });

  it('keeps a connection whose answer came back at once', async () => {
    const c = new FluidNCConnection({
      url: 'ws://x',
      answerTimeoutMs: 100,
      createSocket: (url) => {
        socket = new FakeSocket(url);
        // A controller that answers the first query synchronously.
        socket.send = (d) => {
          socket.sent.push(d);
          if (d === '?') socket.receive('<Idle|MPos:0,0,0>\n');
        };
        return socket;
      },
    });
    const p = c.connect();
    socket.open();
    await p;
    vi.advanceTimersByTime(1000);
    expect(c.state).toBe('connected');
    c.disconnect();
  });

  it('reports a connection that was up and dropped', async () => {
    const c = await connected();
    const closed: unknown[] = [];
    c.on('closed', (info) => closed.push(info));
    socket.close(1011, 'FluidNC disconnected: ws://x');
    expect(closed).toEqual([
      { code: 1011, reason: 'FluidNC disconnected: ws://x', opened: true, answered: true },
    ]);
  });

  it('ignores socket errors after connecting and tears down on close', async () => {
    const c = await connected();
    socket.fail();
    expect(c.state).toBe('connected');
    const cmd = c.command('$I');
    socket.close();
    await expect(cmd).rejects.toBeInstanceOf(CommandError);
    expect(c.state).toBe('disconnected');
  });

  it('uses the global WebSocket by default', async () => {
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;
    (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
    const c = new FluidNCConnection({ url: 'ws://global' });
    void c.connect();
    expect(c.state).toBe('connecting');
    (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
    await expect(new FluidNCConnection({ url: 'ws://none' }).connect()).rejects.toThrow(
      /no websocket/i,
    );
    (globalThis as { WebSocket?: unknown }).WebSocket = original;
  });
});

describe('sending', () => {
  it('sends lines and realtime bytes in the right frame type', async () => {
    const c = await connected();
    const sent: string[] = [];
    c.on('sent', (s) => sent.push(s));
    c.sendLine('$X');
    c.realtime(Realtime.FeedHold);
    c.realtime(Realtime.FeedOverridePlus10);
    c.realtime(Realtime.StatusReport);
    expect(socket.sent).toEqual(['$X\n', '!', new Uint8Array([0x91]), '?']);
    expect(sent).toEqual(['$X', '0x21', '0x91']);
  });

  it('refuses to send while disconnected', () => {
    const c = new FluidNCConnection({ url: 'ws://x', createSocket });
    expect(() => c.sendLine('G0')).toThrow(/not connected/i);
  });

  it('polls the status at the configured interval', async () => {
    const c = await connected({ statusIntervalMs: 200 });
    vi.advanceTimersByTime(1000);
    expect(socket.sent.filter((d) => d === '?')).toHaveLength(5);
    socket.readyState = 2;
    vi.advanceTimersByTime(400);
    expect(socket.sent.filter((d) => d === '?')).toHaveLength(5);
    c.disconnect();
  });

  it('stops everything with an emergency stop', async () => {
    const c = await connected();
    const job = c.stream(['G1 X10 F100']);
    job.start();
    c.emergencyStop();
    expect(socket.sent.slice(-2)).toEqual(['!', String.fromCharCode(0x18)]);
    expect(job.progress.state).toBe('aborted');
  });
});

describe('receiving', () => {
  it('splits frames into lines across chunk boundaries', async () => {
    const c = await connected();
    const lines: string[] = [];
    c.on('line', (l) => lines.push(l));
    socket.receive('[MSG:INFO: a]\r\n<Idle|MPo');
    socket.receive('s:1,2,3>\n\n');
    socket.onmessage?.({ data: new TextEncoder().encode('ok\n') });
    socket.onmessage?.({ data: 42 });
    expect(lines).toEqual(['[MSG:INFO: a]', '<Idle|MPos:1,2,3>', 'ok']);
    expect(c.status?.mpos).toEqual([1, 2, 3]);
  });

  it('separates WebUI meta text frames from controller text', async () => {
    const c = await connected();
    const meta: string[] = [];
    const lines: string[] = [];
    c.on('meta', (m) => meta.push(m));
    c.on('line', (l) => lines.push(l));
    socket.receiveText('CURRENT_ID:0');
    socket.receiveText('PING:5000:5000');
    socket.receiveText('currentID:1');
    socket.receiveText('ok\n');
    expect(meta).toEqual(['CURRENT_ID:0', 'PING:5000:5000', 'currentID:1']);
    expect(lines).toEqual(['ok']);
  });

  it('only looks and stops while the relay says another device controls', async () => {
    const c = await connected();
    const roles: string[] = [];
    c.on('role', (r) => roles.push(r));
    expect(c.viewOnly).toBe(false);
    socket.receiveText('ROLE:viewer');
    expect(c.viewOnly).toBe(true);
    expect(() => c.sendLine('$H')).toThrow(ViewOnlyError);
    await expect(c.command('$I')).rejects.toThrow(/view only/i);
    expect(() => c.realtime(Realtime.CycleStart)).toThrow(ViewOnlyError);
    expect(() => c.realtime(Realtime.JogCancel)).toThrow(ViewOnlyError);
    expect(socket.sent).toEqual([]);
    c.realtime(Realtime.StatusReport);
    c.realtime(Realtime.FeedHold);
    c.realtime(Realtime.SoftReset);
    expect(socket.sent).toEqual(['?', '!', '\x18']);
    // Control passes on to this device; and a lost connection starts over as a controller.
    socket.receiveText('ROLE:controller');
    expect(c.viewOnly).toBe(false);
    c.sendLine('$H');
    expect(socket.sent.at(-1)).toBe('$H\n');
    socket.receiveText('ROLE:viewer');
    c.disconnect();
    expect(c.viewOnly).toBe(false);
    expect(roles).toEqual(['viewer', 'controller', 'viewer']);
    // Anything else after ROLE: is no role.
    socket.receiveText('ROLE:somebody');
  });

  it('emits parsed messages, status and alarms', async () => {
    const c = await connected();
    const messages: ControllerMessage['type'][] = [];
    const statuses: MachineStatus[] = [];
    const alarms: number[] = [];
    c.on('message', (m) => messages.push(m.type));
    c.on('status', (s) => statuses.push(s));
    c.on('alarm', (a) => alarms.push(a));
    socket.receive('<Alarm|MPos:0,0,0>\nALARM:2\n[MSG:ERR: x]\n');
    expect(messages).toEqual(['status', 'alarm', 'message']);
    expect(statuses[0]?.state).toBe('Alarm');
    expect(alarms).toEqual([2]);
  });
});

describe('commands', () => {
  it('resolves with the lines before ok', async () => {
    const c = await connected();
    const p = c.command('$G');
    expect(socket.sentLines).toEqual(['$G']);
    socket.receive('[GC:G0 G54 G17]\nok\n');
    await expect(p).resolves.toEqual(['[GC:G0 G54 G17]']);
  });

  it('answers commands in order and rejects on error', async () => {
    const c = await connected();
    const a = c.command('G0 X1');
    const b = c.command('G1 X2');
    socket.receive('ok\nerror:22\n');
    await expect(a).resolves.toEqual([]);
    await expect(b).rejects.toMatchObject({
      code: 22,
      command: 'G1 X2',
      message: 'G1 X2: error:22',
    });
  });

  it('times out', async () => {
    const c = await connected({ commandTimeoutMs: 100 });
    const p = c.command('$I');
    vi.advanceTimersByTime(101);
    await expect(p).rejects.toMatchObject({ code: -1, message: '$I: timeout' });
    // a late ok is not attributed to anything
    socket.receive('ok\n');
  });

  it('rejects when not connected or reset', async () => {
    const c0 = new FluidNCConnection({ url: 'ws://x', createSocket });
    await expect(c0.command('$I')).rejects.toThrow(/not connected/i);
    const c = await connected();
    const resets: string[] = [];
    c.on('reset', (r) => resets.push(r));
    const p = c.command('$H');
    socket.receive("Grbl 3.7 [FluidNC v3.7.12 (wifi) '$' for help]\n");
    await expect(p).rejects.toThrow(/reset/i);
    expect(resets).toHaveLength(1);
  });
});

describe('file jobs', () => {
  it('runs a file and resolves when FluidNC acknowledges at the end', async () => {
    const c = await connected({ commandTimeoutMs: 100 });
    let done = false;
    const job = c.runFile('/1003_T1.nc').then(() => (done = true));
    expect(socket.sentLines).toEqual(['$SD/Run=/1003_T1.nc']);
    expect(c.jobRunning).toBe(true);
    await expect(c.command('$I')).rejects.toThrow(/file job/);
    await expect(c.runFile('/x.nc')).rejects.toThrow(/busy/);
    expect(() => c.stream(['G0'])).toThrow(/busy/);
    socket.receive('[MSG:INFO: running]\n');
    vi.advanceTimersByTime(60_000); // no timeout for jobs
    socket.receive('ok\n');
    await job;
    expect(done).toBe(true);
    expect(c.jobRunning).toBe(false);
  });

  it('rejects when the job fails or the controller resets', async () => {
    const c = await connected();
    const failing = c.runFile('/bad.nc');
    socket.receive('error:65\n');
    await expect(failing).rejects.toMatchObject({ code: 65 });
    const aborted = c.runFile('/a.nc');
    c.emergencyStop();
    await expect(aborted).rejects.toThrow(/reset/i);
  });

  it('refuses to run without connection', async () => {
    await expect(
      new FluidNCConnection({ url: 'ws://x', createSocket }).runFile('/a'),
    ).rejects.toThrow(/not connected/i);
  });
});

describe('command timeouts', () => {
  it('can wait without timeout, e.g. for probing', async () => {
    const c = await connected({ commandTimeoutMs: 100 });
    const p = c.command('G38.2 Z-40 F100', { timeoutMs: 0 });
    vi.advanceTimersByTime(30_000);
    socket.receive('[PRB:0,0,-12:1]\nok\n');
    await expect(p).resolves.toEqual(['[PRB:0,0,-12:1]']);
    const offline = new FluidNCConnection({ url: 'ws://x', createSocket });
    await expect(offline.command('$I', { timeoutMs: 0 })).rejects.toThrow(/not connected/i);
  });
});

describe('streaming', () => {
  it('routes acknowledgements to the streamer', async () => {
    const c = await connected();
    const job = c.stream(['G0 X1', '(comment)', 'G1 X2 F100']);
    expect(c.activeStream).toBe(job);
    job.start();
    expect(socket.sentLines).toEqual(['G0X1', 'G1X2F100']);
    await expect(c.command('$I')).rejects.toThrow(/streaming/);
    expect(() => c.stream(['G0'])).toThrow(/busy/);
    socket.receive('ok\nok\n');
    expect(job.progress.state).toBe('done');
    socket.receive('ok\n');
  });

  it('aborts the stream on alarm and reset', async () => {
    const c = await connected();
    const job = c.stream(['G0 X1']);
    job.start();
    socket.receive('ALARM:1\n');
    expect(job.progress.state).toBe('aborted');
    const job2 = c.stream(['G0 X1']);
    job2.start();
    socket.receive("Grbl 3.7 [FluidNC v3.7.12 '$' for help]\n");
    expect(job2.progress.state).toBe('aborted');
  });

  it('refuses to stream while a command is pending or disconnected', async () => {
    const c = await connected();
    void c.command('$I').catch(() => undefined);
    expect(() => c.stream(['G0'])).toThrow(/busy/);
    c.disconnect();
    expect(() => new FluidNCConnection({ url: 'ws://x', createSocket }).stream(['G0'])).toThrow(
      /not connected/i,
    );
  });
});
