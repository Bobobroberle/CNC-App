import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { DEFAULT_TOOLS } from '@lowrider/workshop';
import type { FastifyInstance } from 'fastify';
import { Store } from '../src/db';
import { Recorder } from '../src/recorder';
import { FluidNCRelay, type Upstream } from '../src/relay';
import { SensorHub } from '../src/sensors';
import { buildServer, parseRange } from '../src/server';
import { rig } from './recorderRig';

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

const setup = async (extra: Partial<Parameters<typeof buildServer>[0]> = {}) => {
  app = await buildServer({ store: new Store(), ...extra });
  return app;
};

describe('library API', () => {
  it('stores, lists, imports and deletes validated documents', async () => {
    const a = await setup();
    const t1 = DEFAULT_TOOLS[0]!;
    expect(
      (await a.inject({ method: 'PUT', url: '/api/library/tools/t1', payload: t1 })).json(),
    ).toEqual({
      ok: true,
    });
    expect((await a.inject('/api/library/tools/t1')).json()).toEqual(t1);
    expect((await a.inject('/api/library/tools')).json()).toEqual([t1]);
    expect((await a.inject('/api/library/tools/zz')).statusCode).toBe(404);
    expect(
      (await a.inject({ method: 'PUT', url: '/api/library/tools/t9', payload: t1 })).statusCode,
    ).toBe(400);
    expect(
      (await a.inject({ method: 'PUT', url: '/api/library/tools/t1', payload: { id: 't1' } }))
        .statusCode,
    ).toBe(400);
    const imported = await a.inject({
      method: 'POST',
      url: '/api/library/tools',
      payload: DEFAULT_TOOLS,
    });
    expect(imported.json()).toEqual({ ok: true, count: DEFAULT_TOOLS.length });
    expect(
      (await a.inject({ method: 'POST', url: '/api/library/tools', payload: [t1, {}] })).json(),
    ).toEqual({ error: 'invalid-document', index: 1 });
    expect(
      (await a.inject({ method: 'POST', url: '/api/library/tools', payload: {} })).statusCode,
    ).toBe(400);
    expect((await a.inject({ method: 'DELETE', url: '/api/library/tools/t1' })).statusCode).toBe(
      200,
    );
    expect((await a.inject({ method: 'DELETE', url: '/api/library/tools/t1' })).statusCode).toBe(
      404,
    );
    expect(
      (
        await a.inject({
          method: 'PUT',
          url: '/api/library/history/j1',
          payload: { id: 'j1', x: 1 },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('keeps jigs with their tags, and only whole ones', async () => {
    const a = await setup();
    const jig = {
      id: 'jig-1',
      name: 'Untersetzer-Rahmen',
      tags: [{ id: 3, size: 40, x: 0, y: 0, angle: 0 }],
      zero: { x: 30, y: 20 },
      turn: 0,
      job: { fileName: 'untersetzer.nc', text: 'G0 X0 Y0', toolDiameter: 3 },
      reach: 80,
      clamps: [],
      createdAt: 1,
    };
    const put = (payload: unknown) =>
      a.inject({ method: 'PUT', url: '/api/library/jigs/jig-1', payload: payload as object });
    expect((await put(jig)).statusCode).toBe(200);
    expect((await a.inject('/api/library/jigs')).json()).toEqual([jig]);
    // A tag that is none of ours, or a jig without its job, is not stored.
    expect((await put({ ...jig, tags: [{ ...jig.tags[0], id: 99 }] })).statusCode).toBe(400);
    expect((await put({ ...jig, job: undefined })).statusCode).toBe(400);
  });

  it('rejects unknown collections', async () => {
    const a = await setup();
    for (const [method, url] of [
      ['GET', '/api/library/cats'],
      ['GET', '/api/library/cats/1'],
      ['PUT', '/api/library/cats/1'],
      ['POST', '/api/library/cats'],
      ['DELETE', '/api/library/cats/1'],
    ] as const) {
      expect(
        (
          await a.inject({
            method,
            url,
            payload: method === 'GET' || method === 'DELETE' ? undefined : {},
          })
        ).statusCode,
      ).toBe(404);
    }
  });

  it('answers CORS preflight', async () => {
    const a = await setup();
    const r = await a.inject({ method: 'OPTIONS', url: '/api/library/tools' });
    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('job buffer', () => {
  it('keeps G-code files', async () => {
    const a = await setup();
    const put = await a.inject({
      method: 'PUT',
      url: '/api/jobs/1002.nc',
      payload: 'G0 X1\n',
      headers: { 'content-type': 'text/plain' },
    });
    expect(put.json()).toEqual({ ok: true, size: 6 });
    expect((await a.inject('/api/jobs')).json()).toMatchObject([{ name: '1002.nc', size: 6 }]);
    expect((await a.inject('/api/jobs/1002.nc')).body).toBe('G0 X1\n');
    expect((await a.inject('/api/jobs/nope.nc')).statusCode).toBe(404);
    expect(
      (
        await a.inject({
          method: 'PUT',
          url: '/api/jobs/..%2Fetc',
          payload: 'x',
          headers: { 'content-type': 'text/plain' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await a.inject({ method: 'PUT', url: '/api/jobs/a.nc', payload: { a: 1 } })).statusCode,
    ).toBe(415);
    expect((await a.inject({ method: 'DELETE', url: '/api/jobs/1002.nc' })).statusCode).toBe(200);
    expect((await a.inject({ method: 'DELETE', url: '/api/jobs/1002.nc' })).statusCode).toBe(404);
  });
});

describe('notifications API', () => {
  it('stores settings and sends', async () => {
    const f = vi.fn(async () => new Response('', { status: 200 }));
    const a = await setup({ fetch: f });
    expect((await a.inject('/api/notify')).json()).toMatchObject({ kind: 'off' });
    expect(
      (await a.inject({ method: 'PUT', url: '/api/notify', payload: { kind: 'x' } })).statusCode,
    ).toBe(400);
    const settings = { kind: 'ntfy', url: 'http://pi/cnc', events: ['job-done'] };
    expect(
      (await a.inject({ method: 'PUT', url: '/api/notify', payload: settings })).statusCode,
    ).toBe(200);
    const sent = await a.inject({
      method: 'POST',
      url: '/api/notify',
      payload: { event: 'job-done', title: 'Fertig', message: '1002.nc' },
    });
    expect(sent.json()).toEqual({ sent: true });
    expect(f).toHaveBeenCalledOnce();
    expect(
      (
        await a.inject({
          method: 'POST',
          url: '/api/notify',
          payload: { event: 'x', title: '', message: '' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: '/api/notify',
          payload: { event: 'alarm', title: 1, message: '' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await a.inject({
          method: 'POST',
          url: '/api/notify',
          payload: { event: 'alarm', title: '', message: 1 },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('reports a failing notification target', async () => {
    const a = await setup({ fetch: async () => new Response('', { status: 503 }) });
    await a.inject({
      method: 'PUT',
      url: '/api/notify',
      payload: { kind: 'webhook', url: 'http://hook', events: ['alarm'] },
    });
    const r = await a.inject({
      method: 'POST',
      url: '/api/notify',
      payload: { event: 'alarm', title: 'Alarm', message: '1' },
    });
    expect(r.statusCode).toBe(502);
  });
});

describe('sensors API', () => {
  it('accepts samples and streams updates', async () => {
    const sensors = new SensorHub();
    const a = await setup({ sensors });
    expect(
      (await a.inject({ method: 'POST', url: '/api/sensors', payload: { load: 'x' } })).statusCode,
    ).toBe(400);
    expect(
      (await a.inject({ method: 'POST', url: '/api/sensors', payload: { load: 42 } })).json(),
    ).toMatchObject({
      load: 42,
    });
    expect((await a.inject('/api/sensors')).json()).toMatchObject({ load: 42, source: 'push' });
    await a.listen({ port: 0, host: '127.0.0.1' });
    const port = (a.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/sensors/stream`);
    const messages: { load: number }[] = [];
    await new Promise<void>((resolve) => {
      ws.on('message', (d) => {
        messages.push(JSON.parse(String(d)));
        if (messages.length === 1) sensors.push({ load: 60 });
        if (messages.length === 2) resolve();
      });
    });
    expect(messages.map((m) => m.load)).toEqual([42, 60]);
    ws.close();
  });
});

describe('FluidNC relay', () => {
  it('passes traffic both ways', async () => {
    const fluidnc = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => fluidnc.once('listening', r));
    const fport = (fluidnc.address() as { port: number }).port;
    const received: [string, boolean][] = [];
    fluidnc.on('connection', (s) => {
      s.send('CURRENT_ID:0');
      s.on('message', (d, binary) => {
        received.push([binary ? `bin:${[...(d as Buffer)].join(',')}` : String(d), binary]);
        if (!binary) s.send(Buffer.from('ok\r\n'));
      });
    });
    const a = await setup({ fluidncUrl: `ws://127.0.0.1:${fport}` });
    await a.listen({ port: 0, host: '127.0.0.1' });
    const port = (a.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/fluidnc`);
    const got: string[] = [];
    await new Promise<void>((resolve) => {
      ws.on('message', (d, binary) => {
        got.push(`${binary ? 'bin' : 'txt'}:${String(d)}`);
        if (got.length === 2) {
          ws.send('$I\n');
          ws.send(Buffer.from([0x85]));
        }
        if (got.length === 3) resolve();
      });
    });
    expect(got).toEqual(['txt:ROLE:controller', 'txt:CURRENT_ID:0', 'bin:ok\r\n']);
    const health = (await a.inject('/api/health')).json();
    expect(health.fluidnc).toMatchObject({ connected: true, clients: 1 });
    await vi.waitFor(() =>
      expect(received).toEqual([
        ['$I\n', false],
        ['bin:133', true],
      ]),
    );
    const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
    for (const c of fluidnc.clients) c.close();
    expect(await closed).toBe(1011);
    fluidnc.close();
  });

  it('reads a file from FluidNC’s flash byte for byte, for the app', async () => {
    const asked: string[] = [];
    const yaml = 'axes:\r\n\r\n  z:\r\n    max_rate_mm_per_min: 1200 # stock\r\n';
    const a = await setup({
      fluidncUrl: 'ws://192.168.0.200:81',
      fetch: (async (url: string) => {
        asked.push(url);
        if (url.endsWith('/missing.yaml')) return new Response('', { status: 404 });
        if (url.endsWith('/broken.yaml')) return new Response('', { status: 500 });
        if (url.endsWith('/gone.yaml')) throw new Error('EHOSTUNREACH');
        return new Response(yaml);
      }) as typeof fetch,
    });
    const ok = await a.inject('/api/fluidnc/files/config.yaml');
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe(yaml);
    expect(asked).toEqual(['http://192.168.0.200/config.yaml']);
    expect((await a.inject('/api/fluidnc/files/missing.yaml')).statusCode).toBe(404);
    expect((await a.inject('/api/fluidnc/files/broken.yaml')).statusCode).toBe(502);
    expect((await a.inject('/api/fluidnc/files/gone.yaml')).json()).toEqual({
      error: 'unreachable',
    });
    expect((await a.inject('/api/fluidnc/files/..%2Fetc')).statusCode).toBe(400);
    const none = await setup();
    expect((await none.inject('/api/fluidnc/files/config.yaml')).statusCode).toBe(404);
  });

  it('refuses the relay without a FluidNC address', async () => {
    const a = await setup();
    expect((await a.inject('/api/health')).json()).toMatchObject({
      ok: true,
      fluidnc: null,
      camera: null,
    });
    await a.listen({ port: 0, host: '127.0.0.1' });
    const port = (a.server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/fluidnc`);
    expect(await new Promise((r) => ws.on('close', (code) => r(code)))).toBe(1011);
  });
});

describe('camera', () => {
  it('advertises the camera stream for the app', async () => {
    const a = await setup({ cameraUrl: ':8081/stream' });
    expect((await a.inject('/api/health')).json()).toMatchObject({ camera: ':8081/stream' });
  });
});

describe('host shutdown', () => {
  it('answers 501 when the host cannot be powered down', async () => {
    const a = await setup();
    expect((await a.inject('/api/health')).json()).toMatchObject({ shutdown: false });
    const res = await a.inject({ method: 'POST', url: '/api/system/shutdown' });
    expect(res.statusCode).toBe(501);
    expect(res.json()).toEqual({ error: 'not-supported' });
  });

  it('acknowledges first and powers down shortly after', async () => {
    vi.useFakeTimers();
    try {
      const shutdown = vi.fn();
      const a = await setup({ shutdown });
      expect((await a.inject('/api/health')).json()).toMatchObject({
        shutdown: true,
        shutdownError: null,
      });
      const res = await a.inject({ method: 'POST', url: '/api/system/shutdown' });
      expect(res.json()).toEqual({ ok: true });
      expect(shutdown).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);
      expect(shutdown).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a failed power-down in the health check', async () => {
    const a = await setup({
      shutdownDelayMs: 0,
      shutdown: () => Promise.reject(new Error('sudo: a password is required')),
    });
    await a.inject({ method: 'POST', url: '/api/system/shutdown' });
    await vi.waitFor(async () =>
      expect((await a.inject('/api/health')).json()).toMatchObject({
        shutdownError: 'sudo: a password is required',
      }),
    );
    const b = await buildServer({
      store: new Store(),
      shutdownDelayMs: 0,
      shutdown: () => {
        throw 'boom';
      },
    });
    await b.inject({ method: 'POST', url: '/api/system/shutdown' });
    await vi.waitFor(async () =>
      expect((await b.inject('/api/health')).json()).toMatchObject({ shutdownError: 'boom' }),
    );
    await b.close();
  });
});

describe('static app', () => {
  it('serves the built app', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lrc-'));
    writeFileSync(join(dir, 'index.html'), '<title>LowRider</title>');
    const a = await setup({ staticDir: dir });
    expect((await a.inject('/')).body).toContain('LowRider');
  });

  it('serves what the home-screen app needs beside the page: manifest and icon', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lrc-'));
    writeFileSync(join(dir, 'index.html'), '<title>LowRider</title>');
    writeFileSync(join(dir, 'manifest.webmanifest'), '{"display":"standalone"}');
    writeFileSync(join(dir, 'apple-touch-icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const a = await setup({ staticDir: dir });
    const manifest = await a.inject('/manifest.webmanifest');
    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers['content-type']).toContain('application/manifest+json');
    expect(manifest.json()).toEqual({ display: 'standalone' });
    const icon = await a.inject('/apple-touch-icon.png');
    expect(icon.statusCode).toBe(200);
    expect(icon.headers['content-type']).toBe('image/png');
  });
});

describe('recordings API', () => {
  it('answers 501 without a recorder', async () => {
    const a = await setup();
    expect((await a.inject('/api/health')).json()).toMatchObject({ recordings: false });
    for (const [method, url] of [
      ['GET', '/api/recordings'],
      ['POST', '/api/recordings/start'],
      ['POST', '/api/recordings/stop'],
      ['GET', '/api/recordings/rec-1/file'],
      ['DELETE', '/api/recordings/rec-1'],
    ] as const) {
      expect((await a.inject({ method, url })).statusCode, url).toBe(501);
    }
  });

  it('starts, lists, serves with ranges and deletes recordings', async () => {
    const r = rig();
    const recorder = new Recorder(r.deps);
    const a = await setup({ recorder });
    expect((await a.inject('/api/health')).json()).toMatchObject({ recordings: true });
    const start = (payload: unknown) =>
      a.inject({ method: 'POST', url: '/api/recordings/start', payload: payload as object });
    expect((await start({ mode: 'gif' })).statusCode).toBe(400);
    const started = await start({ mode: 'video', jobName: 'a.nc' });
    expect(started.statusCode).toBe(201);
    const id = started.json().id as string;
    expect((await start({ mode: 'video' })).json()).toEqual({ error: 'already-recording' });
    const listed = (await a.inject('/api/recordings')).json();
    expect(listed).toMatchObject({
      capabilities: { ffmpeg: true, hwEncoder: true, observe: false },
      active: { id, state: 'recording' },
    });
    expect((await a.inject({ method: 'DELETE', url: `/api/recordings/${id}` })).statusCode).toBe(
      409,
    );
    const stopped = await a.inject({ method: 'POST', url: '/api/recordings/stop' });
    expect(stopped.json()).toMatchObject({ id, state: 'done', video: { size: 11 } });
    expect((await a.inject({ method: 'POST', url: '/api/recordings/stop' })).statusCode).toBe(404);

    const file = `/api/recordings/${id}/file?kind=video`;
    const full = await a.inject(file);
    expect(full.statusCode).toBe(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.headers['content-type']).toBe('video/mp4');
    expect(full.body).toBe('video-bytes');
    const part = await a.inject({ url: file, headers: { range: 'bytes=0-4' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 0-4/11');
    expect(part.body).toBe('video');
    const tail = await a.inject({ url: `${file}&download=1`, headers: { range: 'bytes=-5' } });
    expect(tail.body).toBe('bytes');
    expect(tail.headers['content-disposition']).toContain(`${id}-video.mp4`);
    expect((await a.inject({ url: file, headers: { range: 'bytes=50-' } })).statusCode).toBe(416);
    expect((await a.inject(`/api/recordings/${id}/file`)).statusCode).toBe(404);
    expect((await a.inject({ method: 'DELETE', url: `/api/recordings/${id}` })).json()).toEqual({
      ok: true,
    });
    expect((await a.inject({ method: 'DELETE', url: `/api/recordings/${id}` })).statusCode).toBe(
      404,
    );
  });

  it('says why a recording cannot start', async () => {
    const noFfmpeg = await setup({ recorder: new Recorder(rig({ ffmpeg: false }).deps) });
    expect((await noFfmpeg.inject('/api/health')).json()).toMatchObject({ recordings: false });
    expect(
      (
        await noFfmpeg.inject({
          method: 'POST',
          url: '/api/recordings/start',
          payload: { mode: 'video' },
        })
      ).statusCode,
    ).toBe(501);
    await noFfmpeg.close();
    const full = rig();
    full.free.bytes = 0;
    app = await buildServer({ store: new Store(), recorder: new Recorder(full.deps) });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/recordings/start',
          payload: { mode: 'video' },
        })
      ).json(),
    ).toEqual({ error: 'disk-full' });
  });

  it('watches the machine through the relay, also with every tablet gone', async () => {
    const ups: FakeUpstream[] = [];
    const relay = new FluidNCRelay('ws://x:81', () => {
      const u = new FakeUpstream();
      ups.push(u);
      return u;
    });
    const r = rig();
    const recorder = new Recorder(r.deps);
    const a = await setup({ recorder, relay });
    expect((await a.inject('/api/recordings')).json().capabilities.observe).toBe(true);
    await a.inject({
      method: 'POST',
      url: '/api/recordings/start',
      payload: { mode: 'timelapse' },
    });
    expect(relay.clientCount).toBe(1);
    ups[0]!.open();
    await r.advance(1000);
    expect(ups[0]!.sent).toContain('?');
    ups[0]!.onmessage!({ data: '<Run|MPos:0,0,0>' });
    ups[0]!.onmessage!({ data: new TextEncoder().encode('<Idle|MPos:0,0,0>').buffer });
    await r.advance(11_000);
    ups[0]!.onmessage!({ data: '<Idle|MPos:0,0,0>' });
    await r.advance(1000);
    expect(recorder.current).toBeNull();
    expect(relay.clientCount).toBe(0);
    await recorder.settled();
  });

  it('keeps trying to see FluidNC after it went away during a recording', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const ups: FakeUpstream[] = [];
      const relay = new FluidNCRelay('ws://x:81', () => {
        const u = new FakeUpstream();
        ups.push(u);
        return u;
      });
      const r = rig();
      const recorder = new Recorder(r.deps);
      const a = await setup({ recorder, relay });
      await a.inject({
        method: 'POST',
        url: '/api/recordings/start',
        payload: { mode: 'timelapse' },
      });
      ups[0]!.open();
      ups[0]!.close();
      expect(relay.clientCount).toBe(0);
      vi.advanceTimersByTime(5000);
      expect(relay.clientCount).toBe(1);
      expect(ups).toHaveLength(2);
      // Stopped before the next retry: no new attempt.
      ups[1]!.close();
      await a.inject({ method: 'POST', url: '/api/recordings/stop' });
      vi.advanceTimersByTime(5000);
      expect(ups).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('range header', () => {
  it('parses single ranges', () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange('bytes=-', 10)).toBeNull();
    expect(parseRange('bytes=2-', 10)).toEqual([2, 9]);
    expect(parseRange('bytes=2-100', 10)).toEqual([2, 9]);
    expect(parseRange('bytes=-3', 10)).toEqual([7, 9]);
    expect(parseRange('bytes=-30', 10)).toEqual([0, 9]);
    expect(parseRange('bytes=5-2', 10)).toBeNull();
    expect(parseRange('bytes=0-1,4-5', 10)).toBeNull();
  });
});

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
}
