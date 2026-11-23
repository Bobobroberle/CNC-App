import { describe, expect, it } from 'vitest';
import { FluidNCConnection, ViewOnlyError } from '../../../packages/fluidnc-client/src';
import { FluidNCRelay } from '../src/relay';

// Two browsers on one relay, the way a PC and an iPad would be: only the first may command. A
// second one asking `$I` used to get an `ok` that the first took for the end of its SD job.
const tick = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms));

class Upstream {
  binaryType = 'blob';
  readyState = 0;
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }
  send(d: string | Uint8Array) {
    const text = typeof d === 'string' ? d : `0x${[...d].map((b) => b.toString(16)).join('')}`;
    this.sent.push(text);
    if (text === '?') this.reply('<Run|MPos:1.000,2.000,3.000|FS:1000,0>\n');
    // `$SD/Run` is answered only when the job ends; everything else at once.
    else if (text.endsWith('\n') && !text.startsWith('$SD/Run')) this.reply('ok\n');
  }
  reply(s: string) {
    this.onmessage?.({ data: new TextEncoder().encode(s).buffer });
  }
  close() {
    this.readyState = 3;
  }
}

function browsers() {
  const up = new Upstream();
  const relay = new FluidNCRelay('ws://fluidnc:81', () => up as never);
  const connect = () => {
    const c = new FluidNCConnection({
      url: 'ws://pi/fluidnc',
      statusIntervalMs: 0,
      createSocket: () => {
        const sock: Record<string, unknown> = {
          binaryType: 'blob',
          readyState: 0,
          onopen: null,
          onclose: null,
          onerror: null,
          onmessage: null,
          send: (d: string | Uint8Array) => relay.fromClient(d, rc),
          close: () => {
            sock.readyState = 3;
            relay.detach(rc);
            (sock.onclose as (e: unknown) => void)?.({ code: 1000, reason: '' });
          },
        };
        const rc = {
          send: (data: string | Uint8Array) =>
            (sock.onmessage as (e: { data: unknown }) => void)?.({
              data:
                data instanceof Uint8Array
                  ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
                  : data,
            }),
          close: () => undefined,
        };
        // As on the server: the socket is open (the app listens) before the relay takes it.
        queueMicrotask(() => {
          sock.readyState = 1;
          (sock.onopen as (e: unknown) => void)?.({});
          relay.attach(rc);
        });
        return sock as never;
      },
    });
    return c;
  };
  return { up, relay, connect };
}

describe('two browsers on the relay', () => {
  it('a second browser cannot end the first one’s SD job – it can only look and stop', async () => {
    const { up, connect } = browsers();
    const a = connect();
    const b = connect();
    await a.connect();
    await b.connect();
    await tick();
    expect(a.viewOnly).toBe(false);
    expect(b.viewOnly).toBe(true);
    let aDone = false;
    void a.runFile('/schild.nc').then(
      () => (aDone = true),
      () => undefined, // ended by the disconnect at the end of the test
    );
    await tick();
    expect(up.sent.some((l) => l.startsWith('$SD/Run'))).toBe(true);
    // The iPad opens the app and asks the controller things: nothing is sent, nothing is answered.
    await expect(b.command('$I')).rejects.toBeInstanceOf(ViewOnlyError);
    await tick();
    expect(aDone).toBe(false);
    expect(up.sent.filter((l) => l === '$I\n')).toEqual([]);
    // It may still stop the machine.
    b.realtime(0x21);
    expect(up.sent).toContain('!');
    a.disconnect();
    b.disconnect();
  });
});
