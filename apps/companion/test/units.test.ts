import { describe, expect, it, vi } from 'vitest';
import { Store } from '../src/db';
import { DEFAULT_NOTIFY, sendNotification, validateNotifySettings } from '../src/notify';
import { FluidNCRelay, relayCloseReason, type RelayClient, type Upstream } from '../src/relay';
import { SensorHub, simulatedSample, validateSample } from '../src/sensors';

describe('Store', () => {
  it('keeps documents per collection', () => {
    const s = new Store();
    s.put('tools', 't1', { id: 't1', n: 1 }, 10);
    s.put('tools', 't2', { id: 't2' }, 5);
    s.put('tools', 't1', { id: 't1', n: 2 }, 20);
    s.put('materials', 'm', { id: 'm' }, 1);
    expect(s.list('tools').map((d) => d.id)).toEqual(['t2', 't1']);
    expect(s.get('tools', 't1')).toEqual({ id: 't1', data: { id: 't1', n: 2 }, updatedAt: 20 });
    expect(s.get('tools', 'x')).toBeNull();
    expect(s.delete('tools', 't1')).toBe(true);
    expect(s.delete('tools', 't1')).toBe(false);
    s.close();
  });

  it('rolls back failed transactions', () => {
    const s = new Store();
    expect(() =>
      s.transaction(() => {
        s.put('tools', 'a', {});
        throw new Error('x');
      }),
    ).toThrow('x');
    expect(s.list('tools')).toEqual([]);
    s.transaction(() => s.put('tools', 'a', {}));
    expect(s.list('tools').length).toBe(1);
  });

  it('buffers job files and settings', () => {
    const s = new Store();
    s.putJob('a.nc', new TextEncoder().encode('G0 X1'), 1);
    s.putJob('b.nc', new TextEncoder().encode('G1'), 2);
    expect(s.listJobs()).toEqual([
      { name: 'b.nc', size: 2, uploadedAt: 2 },
      { name: 'a.nc', size: 5, uploadedAt: 1 },
    ]);
    expect(new TextDecoder().decode(s.getJob('a.nc')!)).toBe('G0 X1');
    expect(s.getJob('x')).toBeNull();
    expect(s.deleteJob('a.nc')).toBe(true);
    expect(s.deleteJob('a.nc')).toBe(false);
    expect(s.getSetting('k', 5)).toBe(5);
    s.setSetting('k', { a: 1 });
    s.setSetting('k', { a: 2 });
    expect(s.getSetting('k', null)).toEqual({ a: 2 });
  });
});

describe('notifications', () => {
  const ok = vi.fn(async () => new Response('', { status: 200 }));

  it('validates settings', () => {
    expect(validateNotifySettings(DEFAULT_NOTIFY)).toEqual(DEFAULT_NOTIFY);
    expect(
      validateNotifySettings({ kind: 'ntfy', url: 'http://pi:8080/cnc', events: ['alarm'] }),
    ).not.toBeNull();
    for (const bad of [
      null,
      { kind: 'mail', url: '', events: [] },
      { kind: 'off', url: 1, events: [] },
      { kind: 'ntfy', url: 'ftp://x', events: [] },
      { kind: 'off', url: '', events: 'x' },
      { kind: 'off', url: '', events: ['party'] },
    ]) {
      expect(validateNotifySettings(bad)).toBeNull();
    }
  });

  it('respects off and the event filter', async () => {
    const n = { event: 'job-done' as const, title: 'Fertig', message: 'a.nc' };
    expect(await sendNotification(DEFAULT_NOTIFY, n, ok)).toBe(false);
    const s = { kind: 'ntfy' as const, url: 'http://pi/cnc', events: ['alarm' as const] };
    expect(await sendNotification(s, n, ok)).toBe(false);
    expect(ok).not.toHaveBeenCalled();
    expect(await sendNotification(s, { ...n, event: 'test' }, ok)).toBe(true);
  });

  it('posts to ntfy with an encoded title', async () => {
    const f = vi.fn(async () => new Response('', { status: 200 }));
    await sendNotification(
      { kind: 'ntfy', url: 'http://pi/cnc', events: ['alarm'] },
      { event: 'alarm', title: 'Alarm Ö', message: 'Endschalter' },
      f,
    );
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('http://pi/cnc');
    expect(init.body).toBe('Endschalter');
    expect((init.headers as Record<string, string>).Priority).toBe('urgent');
    expect((init.headers as Record<string, string>).Title).toMatch(/^=\?UTF-8\?B\?/);
  });

  it('posts JSON to a webhook and reports failures', async () => {
    const f = vi.fn(async () => new Response('', { status: 200 }));
    const s = { kind: 'webhook' as const, url: 'http://hook', events: ['job-failed' as const] };
    await sendNotification(s, { event: 'job-failed', title: 't', message: 'm' }, f);
    const body = JSON.parse(
      (f.mock.calls[0]! as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body).toMatchObject({ event: 'job-failed', source: 'lowrider-control' });
    const fail = vi.fn(async () => new Response('', { status: 500 }));
    await expect(
      sendNotification(s, { event: 'job-failed', title: 't', message: 'm' }, fail),
    ).rejects.toThrow(/500/);
  });
});

describe('sensors', () => {
  it('validates samples', () => {
    expect(validateSample({ load: 50 })).toEqual({ load: 50 });
    expect(validateSample({ accel: [1, 2], sampleRate: 100 })).not.toBeNull();
    for (const bad of [
      null,
      { load: 'x' },
      { rpm: Number.NaN },
      { sampleRate: Infinity },
      { accel: 'x', sampleRate: 1 },
      { accel: ['a'], sampleRate: 1 },
      { accel: [1] },
      { accel: new Array(70000).fill(0), sampleRate: 1 },
    ]) {
      expect(validateSample(bad)).toBeNull();
    }
  });

  it('tracks load and detects chatter in simulated data', () => {
    const hub = new SensorHub('simulator');
    const seen: boolean[] = [];
    const off = hub.subscribe((s) => seen.push(s.chatter));
    let r = 0.3;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    hub.push(simulatedSample(1, rnd), 1);
    expect(hub.current.load).toBeGreaterThan(30);
    expect(hub.current.chatter).toBe(false);
    hub.push(simulatedSample(18, rnd), 2);
    expect(hub.current.chatter).toBe(true);
    expect(hub.current.chatterFrequency).toBeGreaterThan(800);
    off();
    hub.push({ load: 500 }, 3);
    expect(hub.current).toMatchObject({ load: 200, at: 3, rpm: 18000 });
    expect(seen.length).toBe(2);
    hub.push({
      rpm: 0,
      accel: new Array(128).fill(0).map((_, i) => Math.sin(i)),
      sampleRate: 1000,
    });
    expect(hub.current.rpm).toBe(0);
    expect(simulatedSample(0).accel!.length).toBe(256);
  });
});

class FakeUpstream implements Upstream {
  binaryType = 'blob';
  readyState = 0;
  sent: (string | Uint8Array)[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(d: string | Uint8Array) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
}

describe('FluidNCRelay', () => {
  const client = () => {
    const got: [string | Uint8Array, boolean][] = [];
    const closed: number[] = [];
    const reasons: string[] = [];
    const c: RelayClient = {
      send: (d, o) => got.push([d, o.binary]),
      close: (code, reason) => {
        closed.push(code ?? 0);
        reasons.push(reason ?? '');
      },
    };
    return { c, got, closed, reasons };
  };

  it('opens one upstream, queues until open and fans out', () => {
    const ups: FakeUpstream[] = [];
    const relay = new FluidNCRelay('ws://x:81', () => {
      const u = new FakeUpstream();
      ups.push(u);
      return u;
    });
    const a = client();
    const b = client();
    relay.attach(a.c);
    relay.attach(b.c);
    expect(ups.length).toBe(1);
    expect(ups[0]!.binaryType).toBe('arraybuffer');
    expect(relay.connected).toBe(false);
    relay.fromClient('?');
    relay.fromClient('?');
    // A command sent before FluidNC is there never reaches it later.
    relay.fromClient('$H\n');
    ups[0]!.open();
    expect(relay.connected).toBe(true);
    relay.fromClient(new Uint8Array([0x18]));
    expect(ups[0]!.sent).toEqual(['?', new Uint8Array([0x18])]);
    ups[0]!.onmessage!({ data: 'CURRENT_ID:0' });
    ups[0]!.onmessage!({ data: new Uint8Array([111, 107]).buffer });
    expect(a.got).toEqual([
      ['ROLE:controller', false],
      ['CURRENT_ID:0', false],
      [new Uint8Array([111, 107]), true],
    ]);
    expect(b.got).toEqual([
      ['ROLE:viewer', false],
      ['CURRENT_ID:0', false],
      [new Uint8Array([111, 107]), true],
    ]);
    expect(relay.clientCount).toBe(2);
    relay.detach(a.c);
    expect(ups[0]!.closed).toBe(false);
    relay.detach(b.c);
    expect(ups[0]!.closed).toBe(true);
    expect(b.closed).toEqual([]);
  });

  it('lets only the first browser command; the others may look and stop', () => {
    const up = new FakeUpstream();
    const relay = new FluidNCRelay('ws://x:81', () => up);
    const a = client();
    const b = client();
    const recorder = client();
    relay.attach(recorder.c, { observer: true });
    relay.attach(a.c);
    relay.attach(b.c);
    up.open();
    // The recorder is not told a role and never controls, though it came first.
    expect(recorder.got).toEqual([]);
    expect(a.got).toEqual([['ROLE:controller', false]]);
    expect(b.got).toEqual([['ROLE:viewer', false]]);
    relay.fromClient('$I\n', b.c);
    relay.fromClient('~', b.c);
    relay.fromClient(new Uint8Array([0x85]), b.c);
    relay.fromClient(new Uint8Array([0x18, 0x18]), b.c);
    expect(up.sent).toEqual([]);
    relay.fromClient('?', b.c);
    relay.fromClient('!', b.c);
    relay.fromClient('\x18', b.c);
    relay.fromClient(new Uint8Array([0x18]), b.c);
    relay.fromClient('$I\n', a.c);
    expect(up.sent).toEqual(['?', '!', '\x18', new Uint8Array([0x18]), '$I\n']);
  });

  it('counts the browsers apart from what only listens: a recording is no one who loses a job at a restart', () => {
    const relay = new FluidNCRelay('ws://x:81', () => new FakeUpstream());
    const recorder = client();
    const a = client();
    relay.attach(recorder.c, { observer: true });
    expect([relay.clientCount, relay.browserCount]).toEqual([1, 0]);
    relay.attach(a.c);
    expect([relay.clientCount, relay.browserCount]).toEqual([2, 1]);
    relay.detach(recorder.c);
    expect([relay.clientCount, relay.browserCount]).toEqual([1, 1]);
    relay.detach(a.c);
    expect([relay.clientCount, relay.browserCount]).toEqual([0, 0]);
  });

  it('stops a held jog and passes control on when the controlling browser goes', () => {
    const up = new FakeUpstream();
    const relay = new FluidNCRelay('ws://x:81', () => up);
    const a = client();
    const b = client();
    relay.attach(a.c);
    relay.attach(b.c);
    up.open();
    relay.detach(a.c);
    expect(up.sent).toEqual([new Uint8Array([0x85])]);
    expect(b.got.at(-1)).toEqual(['ROLE:controller', false]);
    relay.fromClient('$H\n', b.c);
    expect(up.sent.at(-1)).toBe('$H\n');
    // A watching browser going changes nothing; the last one going cancels before FluidNC is let go.
    const c = client();
    relay.attach(c.c);
    relay.detach(c.c);
    expect(up.sent).toHaveLength(2);
    relay.detach(b.c);
    expect(up.sent.at(-1)).toEqual(new Uint8Array([0x85]));
    expect(up.closed).toBe(true);
  });

  it('hands control to a browser that speaks after the controlling one fell silent', () => {
    vi.useFakeTimers();
    try {
      const up = new FakeUpstream();
      const relay = new FluidNCRelay('ws://x:81', () => up, 5000, 10_000);
      const a = client();
      const b = client();
      relay.attach(a.c);
      relay.attach(b.c);
      up.open();
      vi.advanceTimersByTime(9000);
      relay.fromClient('?', a.c); // still there
      vi.advanceTimersByTime(9000);
      relay.fromClient('$X\n', b.c); // a was heard 9 s ago: b still only watches
      expect(up.sent).toEqual(['?']);
      vi.advanceTimersByTime(2000);
      relay.fromClient('$X\n', b.c); // a silent for 11 s
      expect(up.sent).toEqual(['?', new Uint8Array([0x85]), '$X\n']);
      expect(a.got.at(-1)).toEqual(['ROLE:viewer', false]);
      expect(b.got.at(-1)).toEqual(['ROLE:controller', false]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes all clients when FluidNC goes away, saying so and where', () => {
    const up = new FakeUpstream();
    const relay = new FluidNCRelay('ws://x:81', () => up);
    const a = client();
    relay.attach(a.c);
    up.open();
    up.onerror!({});
    expect(a.closed).toEqual([1011]);
    expect(a.reasons).toEqual(['FluidNC disconnected: ws://x:81']);
    expect(relay.lastFailure).toMatchObject({ kind: 'disconnected' });
    expect(relay.clientCount).toBe(0);
    expect(relay.connected).toBe(false);
  });

  it('tells the clients when FluidNC cannot be reached – also when it does not even refuse', () => {
    vi.useFakeTimers();
    try {
      const ups: FakeUpstream[] = [];
      const relay = new FluidNCRelay(
        'ws://192.168.0.200:81',
        () => {
          const u = new FakeUpstream();
          ups.push(u);
          return u;
        },
        5000,
      );
      const a = client();
      relay.attach(a.c);
      ups[0]!.close();
      expect(a.closed).toEqual([1011]);
      expect(a.reasons).toEqual(['FluidNC unreachable: ws://192.168.0.200:81']);
      expect(relay.lastFailure).toMatchObject({ kind: 'unreachable' });
      // Nothing answers at all: the browsers are told after the timeout.
      const b = client();
      relay.attach(b.c);
      vi.advanceTimersByTime(4999);
      expect(b.closed).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(b.reasons).toEqual(['FluidNC unreachable: ws://192.168.0.200:81']);
      expect(ups[1]!.closed).toBe(true);
      // It answers again: the failure is forgotten; the last tablet gone, the timer too.
      const c = client();
      relay.attach(c.c);
      ups[2]!.open();
      expect(relay.lastFailure).toBeNull();
      relay.detach(c.c);
      const d = client();
      relay.attach(d.c);
      relay.detach(d.c);
      vi.advanceTimersByTime(10_000);
      expect(d.closed).toEqual([]);
      expect(relayCloseReason('unreachable', `ws://${'x'.repeat(200)}`)).toHaveLength(123);
    } finally {
      vi.useRealTimers();
    }
  });
});
