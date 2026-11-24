import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeZip } from '../../../scripts/zip.mjs';

// The nearest thing to a Pi that can be had here: a directory laid out by the real setup helpers, the real bundle
// of the companion, the real guard script – and a loop that plays systemd (guard first, then the program, and a
// restart whenever it ends). An update is made through the real routes; a version that cannot start, and one that
// starts and dies at once, are put in place the same way.

const COMPANION = join(import.meta.dirname, '..');
const SCRIPTS = join(import.meta.dirname, '../../../scripts/pi');
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The folder `release/pi` would be, with a bundle of the companion of the given build. */
function version(build: number, patch = ''): string {
  const out = mkdtempSync(join(tmpdir(), 'lowrider-bundle-'));
  execFileSync('node', ['build.mjs'], {
    cwd: COMPANION,
    env: {
      ...process.env,
      LOWRIDER_OUT_DIR: out,
      LOWRIDER_BUILD: String(build),
      LOWRIDER_COMMIT: 'abcdef0',
    },
  });
  const code = readFileSync(join(out, 'companion.mjs'), 'utf8');
  // The patch runs before anything else of the program (after the shebang line)
  const patched = patch ? code.replace('\n', `\n${patch}\n`) : code;
  writeFileSync(join(out, 'companion.mjs'), patched);
  writeFileSync(join(out, 'lowrider-control.html'), `<!doctype html><title>build ${build}</title>`);
  writeFileSync(join(out, 'lsm6dso.py'), '# sensor\n');
  return out;
}

const zipOf = (src: string) =>
  writeZip(
    ['companion.mjs', 'lowrider-control.html', 'release.json', 'lsm6dso.py'].map((name) => ({
      name: `pi/${name}`,
      data: readFileSync(join(src, name)),
    })),
  );

function freePort(): Promise<number> {
  return new Promise((done) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => done(port));
    });
  });
}

/** What systemd does with the unit setup.sh writes: ExecStartPre=guard.sh, ExecStart=node current/companion.mjs, Restart=always. */
class Pi {
  starts = 0;
  output = '';
  private child: ChildProcess | null = null;
  private stopped = false;
  private loop: Promise<void> | null = null;

  constructor(
    readonly dir: string,
    readonly port: number,
  ) {}

  private env() {
    return {
      PATH: process.env.PATH ?? '',
      LOWRIDER_DIR: this.dir,
      LOWRIDER_UPDATE: '1',
      LOWRIDER_APP: join(this.dir, 'current/app'),
      LOWRIDER_DB: join(this.dir, 'data/lowrider.db'),
      LOWRIDER_BACKUP: '0',
      LOWRIDER_RECORDINGS: '0',
      LOWRIDER_SHUTDOWN: '0',
      LOWRIDER_CONFIRM_MS: '700',
      HOST: '127.0.0.1',
      PORT: String(this.port),
    };
  }

  start(): void {
    this.loop = (async () => {
      while (!this.stopped) {
        spawnSync('bash', [join(this.dir, 'guard.sh')], { env: this.env() });
        if (this.stopped) break;
        this.starts++;
        const child = spawn(process.execPath, [join(this.dir, 'current/companion.mjs')], {
          cwd: this.dir,
          env: this.env(),
        });
        this.child = child;
        // ExecStartPost: while a version is on trial, one that does not answer is stopped (systemd then restarts it)
        const gate = spawn('bash', [join(this.dir, 'health-gate.sh')], {
          env: { ...this.env(), LOWRIDER_GATE_SECONDS: '3' },
        });
        gate.on('exit', (code) => {
          if (code !== 0) child.kill('SIGKILL');
        });
        const take = (d: Buffer) => (this.output = (this.output + d.toString()).slice(-20_000));
        child.stdout.on('data', take);
        child.stderr.on('data', take);
        await new Promise((done) => child.on('exit', done));
        await sleep(100); // RestartSec
      }
    })();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.child?.kill('SIGKILL');
    await this.loop;
  }

  url = (path: string) => `http://127.0.0.1:${this.port}${path}`;

  async health(): Promise<{ build: number; ok: boolean } | null> {
    try {
      const r = await fetch(this.url('/api/health'), { signal: AbortSignal.timeout(1000) });
      return r.ok ? ((await r.json()) as { build: number; ok: boolean }) : null;
    } catch {
      return null;
    }
  }

  /** Waits until the health check answers with what `until` accepts. */
  async until(until: (h: { build: number }) => boolean, ms = 20_000): Promise<{ build: number }> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const h = await this.health();
      if (h && until(h)) return h;
      await sleep(100);
    }
    throw new Error(`no answer in time (starts: ${this.starts})\n${this.output}`);
  }

  async login(): Promise<string> {
    const code = readFileSync(join(this.dir, 'data/pi-code.txt'), 'utf8').trim();
    const r = await fetch(this.url('/api/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name: 'test' }),
    });
    return ((await r.json()) as { token: string }).token;
  }

  async post(path: string, token: string, body?: unknown, type = 'application/json') {
    const r = await fetch(this.url(path), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': type },
      body: body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body ?? {}),
    });
    return { status: r.status, json: (await r.json()) as Record<string, any> };
  }
}

let running: Pi | null = null;
afterEach(async () => {
  await running?.stop();
  running = null;
});

/** A Pi with version `first` installed the way setup.sh does it, and the service running. */
async function boot(first: string): Promise<Pi> {
  const dir = mkdtempSync(join(tmpdir(), 'lowrider-pi-'));
  mkdirSync(join(dir, 'data'));
  execFileSync('bash', [
    '-c',
    `set -euo pipefail; source "${SCRIPTS}/lib.sh"; lr_install_release "${first}" "${dir}"`,
  ]);
  copyFileSync(join(SCRIPTS, 'guard.sh'), join(dir, 'guard.sh'));
  copyFileSync(join(SCRIPTS, 'health-gate.sh'), join(dir, 'health-gate.sh'));
  writeFileSync(join(dir, 'setup-level'), '2\n');
  running = new Pi(dir, await freePort());
  running.start();
  return running;
}

const current = (pi: Pi) => readlinkSync(join(pi.dir, 'current'));
const last = (pi: Pi) =>
  JSON.parse(readFileSync(join(pi.dir, 'update-last.json'), 'utf8')) as Record<string, any>;

describe('a Pi that updates itself', () => {
  it('takes a new version from an upload, restarts into it, confirms it – and goes back by hand when asked', async () => {
    const pi = await boot(version(1000));
    await pi.until((h) => h.build === 1000);
    const token = await pi.login();
    expect(
      (await pi.post('/api/update/upload', token, zipOf(version(2000)), 'application/zip')).status,
    ).toBe(200);
    const status = await (
      await fetch(pi.url('/api/update'), { headers: { authorization: `Bearer ${token}` } })
    ).json();
    expect(status).toMatchObject({
      enabled: true,
      running: { build: 1000 },
      staged: { release: { build: 2000 } },
    });
    const applied = await pi.post('/api/update/apply', token, { id: status.staged.id });
    expect(applied.status).toBe(200);
    // the process ends, systemd (here: the loop) starts what `current` points at now
    await pi.until((h) => h.build === 2000);
    expect(current(pi)).toBe(`releases/${applied.json.name}`);
    expect(pi.starts).toBe(2);
    // the trial counted the start, and the new version confirmed itself after its time
    await vi_waitFor(() => !existsSync(join(pi.dir, 'trial')));
    expect(last(pi)).toMatchObject({ result: 'ok', name: applied.json.name });
    // the old tokens still work: the devices are in the database, which an update does not touch
    const rolled = await pi.post('/api/update/rollback', token);
    expect(rolled, JSON.stringify(rolled)).toMatchObject({ status: 200 });
    await pi.until((h) => h.build === 1000);
    expect(readlinkSync(join(pi.dir, 'previous'))).toBe(`releases/${applied.json.name}`);
    expect(last(pi)).toMatchObject({ result: 'rolled-back-by-hand' });
    // and forward again
    expect((await pi.post('/api/update/rollback', token)).status).toBe(200);
    await pi.until((h) => h.build === 2000);
  }, 90_000);

  it('refuses a version that does not even start in the check, and keeps running as it was', async () => {
    const pi = await boot(version(1000));
    await pi.until((h) => h.build === 1000);
    const token = await pi.login();
    const bad = version(2000, "throw new Error('boom: this version cannot start');");
    const staged = await pi.post('/api/update/upload', token, zipOf(bad), 'application/zip');
    expect(staged.status).toBe(200);
    const refused = await pi.post('/api/update/apply', token, { id: staged.json.id });
    expect(refused.status).toBe(500);
    expect(refused.json.error).toBe('check-failed');
    expect(String(refused.json.detail)).toContain('boom');
    expect(current(pi)).toMatch(/b1000/);
    expect(existsSync(join(pi.dir, 'trial'))).toBe(false);
    expect(pi.starts).toBe(1);
    expect((await pi.health())?.build).toBe(1000);
  }, 90_000);

  it('goes back by itself from a version that passes the check but dies at every start', async () => {
    const pi = await boot(version(1000));
    await pi.until((h) => h.build === 1000);
    const token = await pi.login();
    // a version that is fine in check mode and ends at once when it really starts
    const dies = version(2000, "if (!process.argv.includes('--check')) process.exit(3);");
    const staged = await pi.post('/api/update/upload', token, zipOf(dies), 'application/zip');
    const applied = await pi.post('/api/update/apply', token, { id: staged.json.id });
    expect(applied.status).toBe(200);
    // the guard counts two starts that do not confirm, and at the third points current back at the old version
    // (the old process still answers until it ends: wait for the guard's work, then for the old version to be back)
    await vi_waitFor(() => /b1000/.test(current(pi)), 30_000);
    await pi.until((h) => h.build === 1000, 30_000);
    expect(pi.starts).toBe(4); // the old one, the new one twice (it died), the old one again
    expect(existsSync(join(pi.dir, 'trial'))).toBe(false);
    expect(last(pi)).toMatchObject({ result: 'rolled-back', from: applied.json.name });
    // the data and the devices were never touched
    const me = await fetch(pi.url('/api/auth/me'), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
  }, 90_000);

  it('goes back by itself from a version that starts and then never answers – the gate stops it, the guard counts the starts', async () => {
    const pi = await boot(version(1000));
    await pi.until((h) => h.build === 1000);
    const token = await pi.login();
    // fine in check mode; when it really starts it hangs for good: no port, no answer, and it does not end by itself
    const hangs = version(
      2000,
      "if (!process.argv.includes('--check')) { setInterval(() => {}, 1000); await new Promise(() => {}); }",
    );
    const staged = await pi.post('/api/update/upload', token, zipOf(hangs), 'application/zip');
    const applied = await pi.post('/api/update/apply', token, { id: staged.json.id });
    expect(applied.status).toBe(200);
    await vi_waitFor(() => /b1000/.test(current(pi)), 60_000);
    await pi.until((h) => h.build === 1000, 30_000);
    // the old one, the new one twice (stopped by the gate each time), the old one again
    expect(pi.starts).toBe(4);
    expect(existsSync(join(pi.dir, 'trial'))).toBe(false);
    expect(last(pi)).toMatchObject({ result: 'rolled-back', from: applied.json.name });
  }, 120_000);

  it('does not stop a version that is not on trial, however long it takes – the gate has no say without a trial', async () => {
    const pi = await boot(version(1000));
    await pi.until((h) => h.build === 1000);
    expect(pi.starts).toBe(1);
    expect(existsSync(join(pi.dir, 'trial'))).toBe(false);
  }, 60_000);
});

async function vi_waitFor(condition: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (condition()) return;
    await sleep(100);
  }
  throw new Error('condition not met in time');
}
