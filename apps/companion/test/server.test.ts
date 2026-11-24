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
import { MAX_MEASUREMENTS } from '../src/measurements';
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

describe('state API', () => {
  const put = (a: FastifyInstance, key: string, payload: unknown) =>
    a.inject({ method: 'PUT', url: `/api/state/${key}`, payload: payload as object });

  it('keeps one document per key and counts its revision itself', async () => {
    const a = await setup();
    expect((await a.inject('/api/state')).json()).toEqual({ keys: {} });
    // the first write is made from nothing: revision 0
    const first = await put(a, 'settings', { baseRev: 0, data: { camera: { offsetX: 12.5 } } });
    expect(first.json()).toEqual({ ok: true, rev: 1 });
    expect((await a.inject('/api/state')).json()).toEqual({
      keys: { settings: { rev: 1, data: { camera: { offsetX: 12.5 } } } },
    });
    // the next one names the revision it read
    expect(
      (await put(a, 'settings', { baseRev: 1, data: { camera: { offsetX: 13 } } })).json(),
    ).toEqual({
      ok: true,
      rev: 2,
    });
    // lists are documents as well (the macros)
    expect((await put(a, 'macros', { baseRev: 0, data: [{ name: 'Z hoch' }] })).json().rev).toBe(1);
    const all = (await a.inject('/api/state')).json().keys;
    expect(Object.keys(all).sort()).toEqual(['macros', 'settings']);
  });

  it('refuses a write that was made from an old revision, and hands over the current one', async () => {
    const a = await setup();
    await put(a, 'settings', { baseRev: 0, data: { v: 'pc' } });
    // another device wrote meanwhile
    await put(a, 'settings', { baseRev: 1, data: { v: 'ipad' } });
    const late = await put(a, 'settings', { baseRev: 1, data: { v: 'pc, late' } });
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({ error: 'conflict', rev: 2, data: { v: 'ipad' } });
    // nothing was changed by the refused write
    expect((await a.inject('/api/state')).json().keys.settings).toEqual({
      rev: 2,
      data: { v: 'ipad' },
    });
    // writing again from nothing over an existing document is refused too (a device that never read it)
    const fresh = await put(a, 'settings', { baseRev: 0, data: { v: 'new device' } });
    expect(fresh.statusCode).toBe(409);
    expect(fresh.json().rev).toBe(2);
    // and a revision from the future is no revision
    expect((await put(a, 'settings', { baseRev: 7, data: {} })).statusCode).toBe(409);
  });

  it('knows its keys, and only well-formed, bounded documents', async () => {
    const a = await setup();
    expect((await put(a, 'whatever', { baseRev: 0, data: {} })).statusCode).toBe(404);
    const text = await a.inject({
      method: 'PUT',
      url: '/api/state/settings',
      headers: { 'content-type': 'application/json' },
      payload: '"text"',
    });
    expect(text.statusCode).toBe(400);
    expect((await put(a, 'settings', { baseRev: 0 })).statusCode).toBe(400);
    expect((await put(a, 'settings', { baseRev: 0, data: null })).statusCode).toBe(400);
    expect((await put(a, 'settings', { baseRev: 0, data: 'x' })).statusCode).toBe(400);
    for (const baseRev of [-1, 1.5, '0', null, Number.MAX_SAFE_INTEGER + 2]) {
      expect((await put(a, 'settings', { baseRev, data: {} })).statusCode, String(baseRev)).toBe(
        400,
      );
    }
    // large is no state of a machine: refused, and nothing stored
    const big = await put(a, 'settings', { baseRev: 0, data: { text: 'x'.repeat(600 * 1024) } });
    expect(big.statusCode).toBe(413);
    expect((await a.inject('/api/state')).json()).toEqual({ keys: {} });
    // the edge: just under the bound is fine
    const ok = await put(a, 'settings', { baseRev: 0, data: { text: 'x'.repeat(500 * 1024) } });
    expect(ok.statusCode).toBe(200);
  });

  it('is in the health report, so that an app can tell an older companion', async () => {
    const a = await setup();
    expect((await a.inject('/api/health')).json().state).toBe(true);
  });

  it('keeps the log of measurements as a library of its own', async () => {
    const a = await setup();
    const record = {
      id: '2026-11-24T10:00:00.000Z-camera-scale',
      at: '2026-11-24T10:00:00.000Z',
      kind: 'camera-scale',
      values: { pxPerMm: 17.5, ok: true, note: 'x', none: null },
    };
    expect(
      (
        await a.inject({
          method: 'PUT',
          url: `/api/library/measurements/${record.id}`,
          payload: record,
        })
      ).json(),
    ).toEqual({ ok: true });
    expect((await a.inject('/api/library/measurements')).json()).toEqual([record]);
    expect(
      (await a.inject({ method: 'PUT', url: '/api/library/measurements/other', payload: record }))
        .statusCode,
    ).toBe(400);
  });

  it('keeps only entries that are what the app writes: a few names with numbers, texts or flags', async () => {
    const a = await setup();
    const good = {
      id: 'm1',
      at: '2026-11-24T10:00:00.000Z',
      kind: 'machine-grid',
      values: { x: 1 },
    };
    const put = (payload: unknown) =>
      a.inject({
        method: 'PUT',
        url: `/api/library/measurements/${(payload as { id: string }).id}`,
        payload: payload as object,
      });
    expect((await put(good)).statusCode).toBe(200);
    // an extra field is dropped, not stored
    await put({ ...good, id: 'm2', evil: 'x'.repeat(1000) });
    expect((await a.inject('/api/library/measurements/m2')).json()).toEqual({ ...good, id: 'm2' });
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`v${i}`, i]));
    for (const bad of [
      { ...good, id: 'b1', kind: 'Not A Kind' },
      { ...good, id: 'b2', kind: 5 },
      { ...good, id: 'b3', at: 'yesterday' },
      { ...good, id: 'b4', at: 5 },
      { ...good, id: 'b5', values: [1] },
      { ...good, id: 'b6', values: null },
      { ...good, id: 'b7', values: many },
      { ...good, id: 'b8', values: { ['n'.repeat(61)]: 1 } },
      { ...good, id: 'b9', values: { x: 'x'.repeat(401) } },
      { ...good, id: 'b10', values: { x: { deep: 1 } } },
      { ...good, id: 'b11', values: { x: [1] } },
      [good],
    ]) {
      expect((await put(bad)).statusCode, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
    // an id that is too long or none is refused by the import as well
    for (const id of ['x'.repeat(121), '']) {
      const res = await a.inject({
        method: 'POST',
        url: '/api/library/measurements',
        payload: [{ ...good, id }],
      });
      expect(res.statusCode, `id of ${id.length}`).toBe(400);
    }
    // a number that is none (JSON can say 1e999; the parser makes Infinity of it)
    const infinite = await a.inject({
      method: 'PUT',
      url: '/api/library/measurements/b12',
      headers: { 'content-type': 'application/json' },
      payload:
        '{"id":"b12","at":"2026-11-24T10:00:00.000Z","kind":"machine-grid","values":{"x":1e999}}',
    });
    expect(infinite.statusCode).toBe(400);
  });

  it('keeps the latest entries of the log and lets the oldest go beyond its cap', async () => {
    const a = await setup();
    const entry = (n: number) => ({
      id: `m${String(n).padStart(5, '0')}`,
      at: new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString(),
      kind: 'machine-grid',
      values: { n },
    });
    // newest first, in one import: the cap goes by time, not by the order they came in
    const batch = Array.from({ length: MAX_MEASUREMENTS + 3 }, (_, i) =>
      entry(MAX_MEASUREMENTS + 2 - i),
    );
    const res = await a.inject({
      method: 'POST',
      url: '/api/library/measurements',
      payload: batch,
    });
    expect(res.statusCode).toBe(200);
    const kept = (await a.inject('/api/library/measurements')).json() as { id: string }[];
    expect(kept).toHaveLength(MAX_MEASUREMENTS);
    expect(kept.map((e) => e.id)).not.toContain('m00000');
    expect(kept.map((e) => e.id)).not.toContain('m00002');
    expect(kept.map((e) => e.id)).toContain('m00003');
    expect(kept.map((e) => e.id)).toContain(`m${MAX_MEASUREMENTS + 2}`.replace('m', 'm0'));
    // one more by a single write takes the oldest of those left
    await a.inject({
      method: 'PUT',
      url: `/api/library/measurements/${entry(9000).id}`,
      payload: entry(9000),
    });
    const after = (await a.inject('/api/library/measurements')).json() as { id: string }[];
    expect(after).toHaveLength(MAX_MEASUREMENTS);
    expect(after.map((e) => e.id)).not.toContain('m00003');
    // the other libraries have no cap
    expect(
      (await a.inject({ method: 'PUT', url: '/api/library/history/h1', payload: { id: 'h1' } }))
        .statusCode,
    ).toBe(200);
  });
});

describe('state API limits', () => {
  it('refuses a request body beyond a megabyte before it is read into a document – the rest of the API takes uploads', async () => {
    const a = await setup();
    const big = await a.inject({
      method: 'PUT',
      url: '/api/state/settings',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ baseRev: 0, data: { text: 'x'.repeat(1100 * 1024) } }),
    });
    expect(big.statusCode).toBe(413);
    // refused by the server before the body is parsed – not by the document check afterwards
    expect(big.json().code).toBe('FST_ERR_CTP_BODY_TOO_LARGE');
    expect((await a.inject('/api/state')).json()).toEqual({ keys: {} });
    // other routes still take their large bodies
    const upload = await a.inject({
      method: 'PUT',
      url: '/api/jobs/big.nc',
      headers: { 'content-type': 'text/plain' },
      payload: 'G0 X1\n'.repeat(400_000),
    });
    expect(upload.statusCode).toBe(200);
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

describe('the daily backup in the health report', () => {
  it('says nothing without one, and what the last run did when there is one', async () => {
    const without = await setup();
    expect((await without.inject('/api/health')).json()).toMatchObject({ backup: null });
    const status = { last: 'lowrider-2026-05-10.db', count: 3, error: null };
    const a = await setup({ backup: () => status });
    expect((await a.inject('/api/health')).json()).toMatchObject({ backup: status });
    // switched off or not yet run: null
    const off = await setup({ backup: () => null });
    expect((await off.inject('/api/health')).json()).toMatchObject({ backup: null });
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
