import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { FastifyInstance } from 'fastify';
import { FluidNCConnection, type RelayStamp } from '../../../packages/fluidnc-client/src';
import { Store } from '../src/db';
import {
  FluidNCRelay,
  stampFrame,
  systemClock,
  type Clock,
  type RelayClient,
  type Upstream,
} from '../src/relay';
import { buildServer } from '../src/server';

// The relay stamps what FluidNC says with the Pi's clock – for a client that asks (`?stamp=1`), and
// for no other: an older app would glue an unknown text frame onto the next line and lose the report.
// The frame lists a plain client sees are pinned in units.test.ts, server.test.ts and viewers.test.ts.

/** A clock that reads mono 1000.5, 1001.5 … and wall 2 001 000, 2 001 001 …: every reading is told apart. */
function countingClock() {
  let n = 0;
  const clock: Clock = () => {
    const reading = { mono: 1000.5 + n, wall: 2_001_000 + n };
    n += 1;
    return reading;
  };
  return { clock, readings: () => n };
}

class FakeUpstream implements Upstream {
  binaryType = 'blob';
  readyState = 0;
  sent: (string | Uint8Array)[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(d: string | Uint8Array) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  say(text: string) {
    this.onmessage?.({ data: new TextEncoder().encode(text).buffer });
  }
}

type Frame = [string | Uint8Array, boolean];

function client(stamp?: boolean) {
  const got: Frame[] = [];
  const c: RelayClient = {
    ...(stamp === undefined ? {} : { stamp }),
    send: (d, o) => got.push([d, o.binary]),
    close: () => undefined,
  };
  return { c, got };
}

const text = (s: string) => new TextEncoder().encode(s);

describe('the stamp frame', () => {
  it('is the monotonic ms with three decimals and the wall ms, whole', () => {
    expect(stampFrame({ mono: 5, wall: 7 })).toBe('STAMP:5.000:7');
    expect(stampFrame({ mono: 123456.7894, wall: 1700000000123 })).toBe(
      'STAMP:123456.789:1700000000123',
    );
    expect(stampFrame({ mono: 0.0005, wall: 10.6 })).toBe('STAMP:0.001:11');
  });

  it('is read from the real clock: hrtime for the monotonic ms, Date.now for the wall', () => {
    const before = Number(process.hrtime.bigint()) / 1e6;
    const wallBefore = Date.now();
    const r = systemClock();
    const after = Number(process.hrtime.bigint()) / 1e6;
    expect(r.mono).toBeGreaterThanOrEqual(before - 0.001);
    expect(r.mono).toBeLessThanOrEqual(after + 0.001);
    // three decimals at most (µs), never a float's noise
    expect(Math.round(r.mono * 1000) / 1000).toBe(r.mono);
    expect(r.wall).toBeGreaterThanOrEqual(wallBefore);
    expect(r.wall).toBeLessThanOrEqual(Date.now());
    // two different clocks: the monotonic one does not count from 1970
    expect(r.wall - r.mono).toBeGreaterThan(1_000_000_000);
    expect(systemClock().mono).toBeGreaterThanOrEqual(r.mono);
  });
});

describe('FluidNCRelay stamps', () => {
  const rig = () => {
    const up = new FakeUpstream();
    const { clock, readings } = countingClock();
    const relay = new FluidNCRelay('ws://x:81', () => up, 5000, 10_000, clock);
    return { up, relay, readings };
  };

  it('puts a stamp right before every message for a client that asked – a plain client sees what it always saw', () => {
    const { up, relay, readings } = rig();
    const stamped = client(true);
    const plain = client();
    const refusing = client(false);
    relay.attach(stamped.c);
    relay.attach(plain.c);
    relay.attach(refusing.c);
    up.open();
    up.onmessage!({ data: 'CURRENT_ID:0' });
    up.say('<Idle|MPos:0,0,0>\n');
    up.onmessage!({ data: new Uint8Array([111, 107]).buffer });
    // the order a stamped client reads: ROLE (the relay's own, no stamp), then stamp + message each
    expect(stamped.got).toEqual([
      ['ROLE:controller', false],
      ['STAMP:1000.500:2001000', false],
      ['CURRENT_ID:0', false],
      ['STAMP:1001.500:2001001', false],
      [text('<Idle|MPos:0,0,0>\n'), true],
      ['STAMP:1002.500:2001002', false],
      [new Uint8Array([111, 107]), true],
    ]);
    // the others got the frames of a relay without stamps, byte for byte
    const unstamped: Frame[] = [
      ['CURRENT_ID:0', false],
      [text('<Idle|MPos:0,0,0>\n'), true],
      [new Uint8Array([111, 107]), true],
    ];
    expect(plain.got).toEqual([['ROLE:viewer', false], ...unstamped]);
    expect(refusing.got).toEqual([['ROLE:viewer', false], ...unstamped]);
    // one reading per message, not one per client
    expect(readings()).toBe(3);
  });

  it('shares one reading among the clients that asked, in the same order for each', () => {
    const { up, relay, readings } = rig();
    const a = client(true);
    const b = client(true);
    relay.attach(a.c);
    relay.attach(b.c);
    up.open();
    up.say('ok\n');
    expect(a.got.slice(1)).toEqual([
      ['STAMP:1000.500:2001000', false],
      [text('ok\n'), true],
    ]);
    expect(b.got.slice(1)).toEqual(a.got.slice(1));
    expect(readings()).toBe(1);
  });

  it('reads no clock where nobody asked', () => {
    const { up, relay, readings } = rig();
    const plain = client();
    relay.attach(plain.c);
    relay.attach(client().c, { observer: true });
    up.open();
    up.say('ok\n');
    up.say('ok\n');
    expect(readings()).toBe(0);
    expect(plain.got).toEqual([
      ['ROLE:controller', false],
      [text('ok\n'), true],
      [text('ok\n'), true],
    ]);
  });

  it('does not stamp what a browser sends upstream, and the stamp is not held back by the queue', () => {
    const { up, relay } = rig();
    const a = client(true);
    relay.attach(a.c);
    relay.fromClient('?', a.c);
    up.open();
    expect(up.sent).toEqual(['?']);
    up.say('<Idle|MPos:1,0,0>\n');
    expect(a.got.map(([d]) => (typeof d === 'string' ? d : 'bin'))).toEqual([
      'ROLE:controller',
      'STAMP:1000.500:2001000',
      'bin',
    ]);
  });

  it('defaults to the real clock', () => {
    const up = new FakeUpstream();
    const relay = new FluidNCRelay('ws://x:81', () => up);
    const a = client(true);
    relay.attach(a.c);
    up.open();
    up.say('ok\n');
    const frame = a.got[1]![0] as string;
    expect(frame).toMatch(/^STAMP:\d+\.\d{3}:\d+$/);
    expect(relay.clock).toBe(systemClock);
  });
});

describe('a new connection over a stamped relay', () => {
  /** The library on one side, the relay on the other, as on the Pi: the socket opens before the relay attaches. */
  function link(stamp: boolean) {
    const up = new FakeUpstream();
    const { clock } = countingClock();
    const relay = new FluidNCRelay('ws://x:81', () => up, 5000, 10_000, clock);
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
          close: () => relay.detach(rc),
        };
        const rc: RelayClient = {
          stamp,
          send: (data) =>
            (sock.onmessage as (e: { data: unknown }) => void)({
              data:
                data instanceof Uint8Array
                  ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
                  : data,
            }),
          close: () => undefined,
        };
        queueMicrotask(() => {
          sock.readyState = 1;
          (sock.onopen as (e: unknown) => void)({});
          relay.attach(rc);
          up.open();
        });
        return sock as never;
      },
    });
    return { c, up };
  }

  it('reads the Pi’s stamp of each report – and a stamped one of a line split across messages', async () => {
    const { c, up } = link(true);
    const got: { x: number; stamp: RelayStamp | null }[] = [];
    c.on('status', (s, stamp) => got.push({ x: s.mpos[0]!, stamp }));
    const p = c.connect();
    await vi.waitFor(() => expect(up.readyState).toBe(1));
    up.say('<Idle|MPos:1,0,0>\n');
    await p;
    up.say('<Run|MPos:2,');
    up.say('0,0>\n');
    up.onmessage!({ data: 'PING:5000:5000' });
    up.say('<Run|MPos:3,0,0>\n');
    expect(got).toEqual([
      { x: 1, stamp: { mono: 1000.5, wall: 2_001_000 } },
      // began in the message stamped 1001.5 (the second half came with 1002.5)
      { x: 2, stamp: { mono: 1001.5, wall: 2_001_001 } },
      // the stamp 1003.5 went with PING; this report is the message after it
      { x: 3, stamp: { mono: 1004.5, wall: 2_001_004 } },
    ]);
    c.disconnect();
  });

  it('a plain client gets no stamp', async () => {
    const { c, up } = link(false);
    const got: (RelayStamp | null)[] = [];
    c.on('status', (_s, stamp) => got.push(stamp));
    const p = c.connect();
    await vi.waitFor(() => expect(up.readyState).toBe(1));
    up.say('<Idle|MPos:1,0,0>\n');
    await p;
    up.say('<Run|MPos:2,0,0>\n');
    expect(got).toEqual([null, null]);
    c.disconnect();
  });
});

describe('the relay route and the health report', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  /** A FluidNC that says a line when a browser has attached, and the companion in front of it. */
  async function rig(clock?: Clock) {
    const fluidnc = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => fluidnc.once('listening', r));
    const fport = (fluidnc.address() as { port: number }).port;
    fluidnc.on('connection', (s) => {
      s.send('CURRENT_ID:0');
      s.on('message', () => s.send(Buffer.from('ok\r\n')));
    });
    app = await buildServer({
      store: new Store(),
      fluidncUrl: `ws://127.0.0.1:${fport}`,
      ...(clock ? { clock } : {}),
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as { port: number }).port;
    return { fluidnc, port };
  }

  /** What a browser that connects with this query reads: it says `$I` once FluidNC has greeted it, and stops after `frames` frames. */
  async function read(port: number, query: string, frames: number) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/fluidnc${query}`);
    const got: string[] = [];
    await new Promise<void>((resolve) => {
      ws.on('message', (d, binary) => {
        got.push(`${binary ? 'bin' : 'txt'}:${String(d).replace(/\r?\n$/, '')}`);
        if (got[got.length - 1] === 'txt:CURRENT_ID:0') ws.send('$I\n');
        if (got.length === frames) resolve();
      });
    });
    ws.close();
    // the next browser must not find this one still there: it would only watch
    await vi.waitFor(async () =>
      expect((await app!.inject('/api/health')).json().fluidnc.clients).toBe(0),
    );
    return got;
  }

  it('sends stamp frames only for `stamp=1` – every other query is a plain client', async () => {
    const { fluidnc, port } = await rig(countingClock().clock);
    expect(await read(port, '?stamp=1', 5)).toEqual([
      'txt:ROLE:controller',
      'txt:STAMP:1000.500:2001000',
      'txt:CURRENT_ID:0',
      'txt:STAMP:1001.500:2001001',
      'bin:ok',
    ]);
    // the frames a client without the parameter reads
    const plain = ['txt:ROLE:controller', 'txt:CURRENT_ID:0', 'bin:ok'];
    for (const query of ['', '?stamp=0', '?stamp=true', '?stamp=', '?x=1', '?stamp=1&stamp=1']) {
      expect(await read(port, query, 3), `query "${query}"`).toEqual(plain);
    }
    // an unknown parameter next to it changes nothing
    // (the health polls in `read` use the same counting clock, so only the form of the stamp is known here)
    expect(await read(port, '?x=1&stamp=1', 3)).toEqual([
      'txt:ROLE:controller',
      expect.stringMatching(/^txt:STAMP:\d+\.500:\d+$/),
      'txt:CURRENT_ID:0',
    ]);
    fluidnc.close();
  });

  it('says in the health report that it stamps, and what its clock reads now', async () => {
    const { clock } = countingClock();
    app = await buildServer({ store: new Store(), clock });
    const first = (await app.inject('/api/health')).json();
    const second = (await app.inject('/api/health')).json();
    expect(first).toMatchObject({ stamps: true, clock: { mono: 1000.5, wall: 2001000 } });
    // a snapshot at the moment of each request
    expect(second.clock).toEqual({ mono: 1001.5, wall: 2001001 });
  });

  it('takes the clock of an injected relay for the health report, and the real one by default', async () => {
    const { clock } = countingClock();
    const up = new FakeUpstream();
    app = await buildServer({
      store: new Store(),
      relay: new FluidNCRelay('ws://x:81', () => up, 5000, 10_000, clock),
    });
    expect((await app.inject('/api/health')).json().clock).toEqual({
      mono: 1000.5,
      wall: 2001000,
    });
    await app.close();
    app = await buildServer({ store: new Store() });
    const health = (await app.inject('/api/health')).json();
    expect(health.stamps).toBe(true);
    expect(health.clock.mono).toBeGreaterThan(0);
    expect(Math.abs(health.clock.wall - Date.now())).toBeLessThan(2000);
  });
});
