import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeZip } from '../../../scripts/zip.mjs';
import { Auth } from '../src/auth';
import { Store } from '../src/db';
import { buildServer } from '../src/server';
import { Updater } from '../src/updater';

// The login and the update through the routes of the server: who may ask, and what is answered.

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

const release = (build: number) =>
  JSON.stringify({
    format: 'lowrider-release',
    version: '0.1.0',
    build,
    commit: 'abcdef123',
    setupLevel: 2,
  });
const zip = (build: number) =>
  writeZip([
    { name: 'pi/companion.mjs', data: Buffer.from('#!/usr/bin/env node\n') },
    { name: 'pi/lowrider-control.html', data: Buffer.from('<!doctype html>') },
    { name: 'pi/release.json', data: Buffer.from(release(build)) },
  ]);

async function setup(extra: { updater?: boolean; shutdown?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lowrider-access-'));
  mkdirSync(join(dir, 'releases/b100-x/app'), { recursive: true });
  writeFileSync(join(dir, 'releases/b100-x/release.json'), release(100));
  writeFileSync(join(dir, 'releases/b100-x/companion.mjs'), '#!/usr/bin/env node\n');
  symlinkSync('releases/b100-x', join(dir, 'current'));
  writeFileSync(join(dir, 'setup-level'), '2\n');
  const store = new Store();
  const auth = new Auth({ store, codeFile: join(dir, 'pi-code.txt') });
  const state = { busy: null as string | null, restarts: 0, shutdowns: 0 };
  const updater =
    extra.updater === false
      ? undefined
      : new Updater({
          dir,
          running: { name: 'b100-x', version: '0.1.0', build: 100, commit: 'old' },
          check: async (releaseDir) => ({
            ok: true,
            output: '',
            build: JSON.parse(readFileSync(join(releaseDir, 'release.json'), 'utf8')).build,
          }),
          backup: async () => ({ ok: true }),
          busy: () => state.busy,
          restart: () => void state.restarts++,
        });
  app = await buildServer({
    store,
    auth,
    updater,
    restartDelayMs: 0,
    shutdown: extra.shutdown === false ? undefined : () => void state.shutdowns++,
    shutdownDelayMs: 0,
  });
  const login = async (name = 'PC') => {
    const r = await app!.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { code: auth.currentCode(), name },
    });
    return r.json() as { token: string; device: { id: string } };
  };
  return { app: app!, auth, dir, state, login };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('the login', () => {
  it('gives a token for the Pi code, and says what is wrong otherwise – with how long to wait', async () => {
    const { app, auth } = await setup();
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { code: 'AAAA-AAAA-AAAA' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: 'wrong-code' });
    const none = await app.inject({ method: 'POST', url: '/api/auth/login' });
    expect(none.statusCode).toBe(401);
    const right = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { code: auth.currentCode().toLowerCase(), name: 'Roberts iPad' },
    });
    expect(right.statusCode).toBe(200);
    expect(right.json()).toMatchObject({ device: { name: 'Roberts iPad' } });
    expect(right.json().token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // too many failures from one address: it waits
    for (let i = 0; i < 5; i++)
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: { code: 'wrong' } });
    const locked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { code: auth.currentCode() },
    });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error).toBe('locked');
    expect(Number(locked.headers['retry-after'])).toBe(locked.json().retryAfter);
    expect(locked.json().retryAfter).toBeGreaterThan(0);
  });

  it('knows who is asking: me, the devices (with the current one marked), logout, removing one', async () => {
    const { app, login } = await setup();
    expect((await app.inject('/api/auth/me')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/auth/me', headers: bearer('nope') })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { authorization: 'Basic abc' } }))
        .statusCode,
    ).toBe(401);
    const a = await login('A');
    await new Promise((done) => setTimeout(done, 3)); // the list is in the order of the logins: not two in one millisecond
    const b = await login('B');
    expect((await app.inject({ url: '/api/auth/me', headers: bearer(a.token) })).json()).toEqual({
      device: { id: a.device.id, name: 'A' },
    });
    const list = (await app.inject({ url: '/api/auth/devices', headers: bearer(a.token) })).json()
      .devices as { id: string; name: string; current: boolean }[];
    expect(list.map((d) => [d.name, d.current])).toEqual([
      ['A', true],
      ['B', false],
    ]);
    expect((await app.inject('/api/auth/devices')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/auth/devices/${b.device.id}`,
          headers: bearer(a.token),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/auth/devices/${b.device.id}`,
          headers: bearer(a.token),
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: '/api/auth/me', headers: bearer(b.token) })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/auth/devices/${a.device.id}` })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({ method: 'POST', url: '/api/auth/logout', headers: bearer(a.token) })
      ).json(),
    ).toEqual({ ok: true });
    expect((await app.inject({ url: '/api/auth/me', headers: bearer(a.token) })).statusCode).toBe(
      401,
    );
  });

  it('shows the code to a device that is logged in, renews it on request – and can take the others off with it', async () => {
    const { app, auth, login } = await setup();
    const a = await login('A');
    const b = await login('B');
    expect((await app.inject('/api/auth/code')).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/code', payload: {} })).statusCode,
    ).toBe(401);
    const code = auth.currentCode();
    expect((await app.inject({ url: '/api/auth/code', headers: bearer(a.token) })).json()).toEqual({
      code,
    });
    const renewed = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/code',
        headers: bearer(a.token),
        payload: {},
      })
    ).json();
    expect(renewed).toEqual({ code: auth.currentCode(), revoked: 0 });
    expect(renewed.code).not.toBe(code);
    expect((await app.inject({ url: '/api/auth/me', headers: bearer(b.token) })).statusCode).toBe(
      200,
    );
    const all = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/code',
        headers: bearer(a.token),
        payload: { revokeOthers: true },
      })
    ).json();
    expect(all.revoked).toBe(1);
    expect((await app.inject({ url: '/api/auth/me', headers: bearer(b.token) })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ url: '/api/auth/me', headers: bearer(a.token) })).statusCode).toBe(
      200,
    );
    // a body that is no object is no request to take the others off
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/code', headers: bearer(a.token) })).json()
        .revoked,
    ).toBe(0);
  });

  it('answers the preflight of a page from elsewhere without a token, and allows the header the token travels in', async () => {
    const { app } = await setup();
    const pre = await app.inject({
      method: 'OPTIONS',
      url: '/api/update/upload',
      headers: { origin: 'http://x', 'access-control-request-headers': 'authorization' },
    });
    expect(pre.statusCode).toBe(204);
    expect(String(pre.headers['access-control-allow-headers'])).toContain('Authorization');
  });
});

describe('what needs the login', () => {
  it('powering the Pi down: only with a token', async () => {
    const { app, state, login } = await setup();
    expect((await app.inject({ method: 'POST', url: '/api/system/shutdown' })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ method: 'POST', url: '/api/system/shutdown', headers: bearer('nope') }))
        .statusCode,
    ).toBe(401);
    expect(state.shutdowns).toBe(0);
    const { token } = await login();
    expect(
      (
        await app.inject({ method: 'POST', url: '/api/system/shutdown', headers: bearer(token) })
      ).json(),
    ).toEqual({ ok: true });
    await vi.waitFor(() => expect(state.shutdowns).toBe(1));
  });

  it('everything else stays open as before: health, libraries, the state', async () => {
    const { app } = await setup();
    expect((await app.inject('/api/health')).statusCode).toBe(200);
    expect((await app.inject('/api/library/tools')).statusCode).toBe(200);
    expect((await app.inject('/api/state')).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/state/macros',
          payload: { baseRev: 0, data: { list: [] } },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('says in the health check what can be done here', async () => {
    const { app } = await setup();
    const health = (await app.inject('/api/health')).json();
    expect(health).toMatchObject({
      auth: true,
      update: true,
      build: 0,
      commit: 'dev',
      version: '0.1.0',
    });
    const plain = await buildServer({ store: new Store() });
    const old = (await plain.inject('/api/health')).json();
    expect(old).toMatchObject({ auth: false, update: false });
    await plain.close();
  });
});

describe('the update through the routes', () => {
  const upload = (
    app: FastifyInstance,
    token: string,
    body: Buffer,
    query = '',
    type = 'application/zip',
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/update/upload${query}`,
      headers: { ...bearer(token), 'content-type': type },
      payload: body,
    });

  it('needs the login in every route', async () => {
    const { app } = await setup();
    expect((await app.inject('/api/update')).statusCode).toBe(401);
    expect((await upload(app, '', zip(200))).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/api/update/apply', payload: { id: 'x' } }))
        .statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/update/rollback' })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ method: 'DELETE', url: '/api/update/staged' })).statusCode).toBe(
      401,
    );
  });

  it('takes the zip, says what it is, applies it, and has the process restart after the answer', async () => {
    const { app, state, login, dir } = await setup();
    const { token } = await login();
    const status = (await app.inject({ url: '/api/update', headers: bearer(token) })).json();
    expect(status).toMatchObject({ enabled: true, setupLevel: 2, staged: null, busy: null });
    const file = zip(200);
    const staged = await upload(app, token, file);
    expect(staged.statusCode).toBe(200);
    const body = staged.json();
    expect(body).toMatchObject({ release: { build: 200 }, newer: true });
    expect(
      (await app.inject({ url: '/api/update', headers: bearer(token) })).json().staged.id,
    ).toBe(body.id);
    const applied = await app.inject({
      method: 'POST',
      url: '/api/update/apply',
      headers: bearer(token),
      payload: { id: body.id },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toMatchObject({ ok: true, restarting: true, release: { build: 200 } });
    await vi.waitFor(() => expect(state.restarts).toBe(1));
    expect(readFileSync(join(dir, 'trial'), 'utf8')).toContain(`new=${applied.json().name}`);
    // and back by hand
    const back = await app.inject({
      method: 'POST',
      url: '/api/update/rollback',
      headers: bearer(token),
    });
    expect(back.json()).toMatchObject({ ok: true, restarting: true, name: 'b100-x' });
    await vi.waitFor(() => expect(state.restarts).toBe(2));
  });

  it('answers a refusal with a code the app can say, and a status that tells whose doing it is', async () => {
    const { app, state, login } = await setup();
    const { token } = await login();
    const sha = (await upload(app, token, zip(200))).json().sha256 as string;
    const wrong = await upload(app, token, zip(200), '?sha256=0000');
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toEqual({ error: 'checksum-mismatch', detail: sha });
    expect((await upload(app, token, zip(200), `?sha256=${sha}`)).statusCode).toBe(200);
    const junk = await upload(app, token, Buffer.from('not a zip, not even close to one'));
    expect(junk.statusCode).toBe(400);
    expect(junk.json().error).toBe('bad-zip');
    expect((await upload(app, token, Buffer.from('{}'), '', 'application/json')).statusCode).toBe(
      415,
    );
    const staged = (await upload(app, token, zip(200))).json();
    state.busy = 'machine-connected';
    const busy = await app.inject({
      method: 'POST',
      url: '/api/update/apply',
      headers: bearer(token),
      payload: { id: staged.id },
    });
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toEqual({ error: 'busy', detail: 'machine-connected' });
    state.busy = null;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/update/apply',
          headers: bearer(token),
          payload: { id: 'wrong' },
        })
      ).json().error,
    ).toBe('no-staged');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/update/apply',
          headers: bearer(token),
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/api/update/apply', headers: bearer(token) }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({ method: 'POST', url: '/api/update/rollback', headers: bearer(token) })
      ).json().error,
    ).toBe('no-previous');
    expect(
      (
        await app.inject({ method: 'DELETE', url: '/api/update/staged', headers: bearer(token) })
      ).json(),
    ).toEqual({ ok: true });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/update/apply',
          headers: bearer(token),
          payload: { id: staged.id },
        })
      ).json().error,
    ).toBe('no-staged');
    // an older build is applied only when asked for
    const older = (await upload(app, token, zip(50))).json();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/update/apply',
          headers: bearer(token),
          payload: { id: older.id },
        })
      ).json().error,
    ).toBe('not-newer');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/update/apply',
          headers: bearer(token),
          payload: { id: older.id, allowOlder: true },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('refuses an upload beyond its size before it is read, and a Pi that has no update says so', async () => {
    const { app, login } = await setup();
    const { token } = await login();
    const big = await upload(
      app,
      token,
      Buffer.alloc(33 * 1024 * 1024),
      '',
      'application/octet-stream',
    );
    expect(big.statusCode).toBe(413);
    await app.close();
    const none = await setup({ updater: false });
    const { token: t2 } = await none.login();
    for (const [method, url] of [
      ['GET', '/api/update'],
      ['POST', '/api/update/apply'],
      ['POST', '/api/update/rollback'],
    ] as const) {
      const r = await none.app.inject({
        method,
        url,
        headers: bearer(t2),
        payload: method === 'POST' ? { id: 'x' } : undefined,
      });
      expect(r.statusCode, url).toBe(501);
      expect(r.json().error).toBe('not-enabled');
    }
    expect((await upload(none.app, t2, zip(200))).statusCode).toBe(501);
    expect(
      (await none.app.inject({ method: 'DELETE', url: '/api/update/staged', headers: bearer(t2) }))
        .statusCode,
    ).toBe(200);
  });

  it('a Pi that has not the layout refuses the upload', async () => {
    const { app, login, dir } = await setup();
    const { token } = await login();
    const { rmSync } = await import('node:fs');
    rmSync(join(dir, 'current'));
    const r = await upload(app, token, zip(200));
    expect(r.statusCode).toBe(501);
    expect(r.json().error).toBe('not-enabled');
    expect((await app.inject('/api/health')).json().update).toBe(false);
  });
});

describe('a refusal comes before the body', () => {
  it('answers 401 to an upload without a login while the body has not been sent – the Pi takes in nothing first', async () => {
    const { app } = await setup();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };
    const { connect } = await import('node:net');
    const answer = await new Promise<string>((done, fail) => {
      const socket = connect(port, '127.0.0.1');
      let text = '';
      socket.on('data', (d) => {
        text += d.toString();
        if (text.includes('\r\n\r\n')) {
          socket.destroy();
          done(text);
        }
      });
      socket.on('error', fail);
      setTimeout(() => fail(new Error(`no answer while the body is pending: ${text}`)), 3000);
      // the headers of a 30 MB upload, and only a little of it
      socket.write(
        `POST /api/update/upload HTTP/1.1\r\nHost: x\r\nContent-Type: application/zip\r\nContent-Length: ${30 * 1024 * 1024}\r\n\r\n${'x'.repeat(1000)}`,
      );
    });
    expect(answer.split('\r\n')[0]).toContain('401');
  });
});
