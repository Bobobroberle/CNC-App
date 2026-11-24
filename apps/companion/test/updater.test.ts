import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { writeZip } from '../../../scripts/zip.mjs';
import { UpdateError, Updater, type UpdaterOptions } from '../src/updater';

// The update from the app, tried on real directories laid out as setup.sh lays them out: what a version
// brought in a zip is checked, put beside the running one, tried, and only then does `current` move.

const T0 = Date.UTC(2026, 10, 24, 15, 8, 1);

const releaseJson = (build: number, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'lowrider-release',
    version: '0.1.0',
    build,
    commit: 'abcdef123',
    setupLevel: 2,
    ...over,
  });

/** The files of a package, as `release/pi` has them. */
function files(
  build: number,
  over: Record<string, unknown> = {},
  extra: { name: string; data?: string }[] = [],
) {
  return [
    { name: 'pi/' },
    { name: 'pi/companion.mjs', data: Buffer.from(`#!/usr/bin/env node\n// build ${build}\n`) },
    { name: 'pi/lowrider-control.html', data: Buffer.from(`<!doctype html><!-- ${build} -->`) },
    { name: 'pi/release.json', data: Buffer.from(releaseJson(build, over)) },
    { name: 'pi/setup.sh', data: Buffer.from('#!/bin/bash\nexit 1\n'), mode: 0o755 },
    { name: 'pi/guard.sh', data: Buffer.from('#!/bin/bash\n') },
    { name: 'pi/lib.sh', data: Buffer.from('#!/bin/bash\n') },
    { name: 'pi/app/' },
    { name: 'pi/app/manifest.webmanifest', data: Buffer.from('{}') },
    { name: 'pi/app/icon-192.png', data: Buffer.from('png') },
    ...extra.map((e) => ({ name: e.name, data: Buffer.from(e.data ?? 'x') })),
  ];
}
const zipOf = (
  build: number,
  over: Record<string, unknown> = {},
  extra: { name: string; data?: string }[] = [],
) => writeZip(files(build, over, extra));
const sha = (z: Buffer) => createHash('sha256').update(z).digest('hex');

interface Rig {
  dir: string;
  updater: Updater;
  clock: { at: number };
  calls: { check: string[]; backup: number; restart: number };
  state: {
    busy: string | null;
    backup: { ok: boolean; reason?: string };
    check: (dir: string) => Promise<{ ok: boolean; output: string; build?: number }>;
  };
  release(name: string): string;
}

/** A directory as setup.sh leaves it: one release (build 100), current pointing at it, setup level 2. */
function rig(options: { layout?: boolean; running?: number; level?: number | null } = {}): Rig {
  const dir = mkdtempSync(join(tmpdir(), 'lowrider-updater-'));
  mkdirSync(join(dir, 'releases/b100-20260101000000/app'), { recursive: true });
  const first = join(dir, 'releases/b100-20260101000000');
  writeFileSync(join(first, 'companion.mjs'), '#!/usr/bin/env node\n// build 100\n');
  writeFileSync(join(first, 'app/index.html'), '<!doctype html>100');
  writeFileSync(join(first, 'lsm6dso.py'), '# the sensor of build 100\n', { mode: 0o755 });
  writeFileSync(join(first, 'release.json'), releaseJson(100));
  if (options.layout !== false) symlinkSync('releases/b100-20260101000000', join(dir, 'current'));
  if (options.level !== null) writeFileSync(join(dir, 'setup-level'), `${options.level ?? 2}\n`);
  const clock = { at: T0 };
  const calls = { check: [] as string[], backup: 0, restart: 0 };
  const state: Rig['state'] = {
    busy: null,
    backup: { ok: true },
    check: async () => ({ ok: true, output: '', build: undefined }),
  };
  let wantBuild = 0;
  const opts: UpdaterOptions = {
    dir,
    running: {
      name: 'b100-20260101000000',
      version: '0.1.0',
      build: options.running ?? 100,
      commit: 'old',
    },
    check: async (releaseDir) => {
      calls.check.push(releaseDir);
      const answer = await state.check(releaseDir);
      // the default: the program is the build its release.json names
      if (answer.ok && answer.build === undefined) {
        wantBuild = JSON.parse(readFileSync(join(releaseDir, 'release.json'), 'utf8')).build;
        return { ...answer, build: wantBuild };
      }
      return answer;
    },
    backup: async () => {
      calls.backup++;
      return state.backup;
    },
    busy: () => state.busy,
    restart: () => void calls.restart++,
    now: () => clock.at,
  };
  return {
    dir,
    updater: new Updater(opts),
    clock,
    calls,
    state,
    release: (name) => join(dir, 'releases', name),
  };
}

const refused = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(UpdateError);
    expect((e as UpdateError).code).toBe(code);
    return e as UpdateError;
  }
  throw new Error(`expected ${code}`);
};

const link = (dir: string, name: string) => {
  try {
    return readlinkSync(join(dir, name));
  } catch {
    return null;
  }
};

describe('whether the update can be done here', () => {
  it('only with the layout of setup.sh: current is a link to a release directory', async () => {
    expect(await rig().updater.enabled()).toBe(true);
    expect(await rig({ layout: false }).updater.enabled()).toBe(false);
    const dangling = rig();
    symlinkSync('releases/gone', join(dangling.dir, 'current.x'));
    writeFileSync(join(dangling.dir, 'current.tmp'), '');
    // a link that names no directory
    const r = rig({ layout: false });
    symlinkSync('releases/nothing-here', join(r.dir, 'current'));
    expect(await r.updater.enabled()).toBe(false);
    // a link whose target is not of the alphabet of a name
    const odd = rig({ layout: false });
    symlinkSync('../../etc', join(odd.dir, 'current'));
    expect(await odd.updater.enabled()).toBe(false);
    await refused(rig({ layout: false }).updater.stage(zipOf(200)), 'not-enabled');
  });
});

describe('taking in an uploaded version', () => {
  it('checks the zip and waits: nothing is written to the disk, the build is compared, the checksum is given back', async () => {
    const r = rig();
    const zip = zipOf(200);
    const staged = await r.updater.stage(zip);
    expect(staged).toMatchObject({
      release: { build: 200, version: '0.1.0', commit: 'abcdef123' },
      sha256: sha(zip),
      newer: true,
    });
    expect(staged.files).toBe(5);
    expect(staged.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(readdirSync(join(r.dir, 'releases'))).toEqual(['b100-20260101000000']);
    expect((await r.updater.status()).staged).toEqual(staged);
    // the same build, or an older one, is not newer
    expect((await r.updater.stage(zipOf(100))).newer).toBe(false);
    expect((await r.updater.stage(zipOf(50))).newer).toBe(false);
  });

  it('holds the checksum the operator gives against what arrived – written as it comes from a tool', async () => {
    const r = rig();
    const zip = zipOf(200);
    const right = sha(zip);
    for (const given of [
      right,
      right.toUpperCase(),
      ` ${right} `,
      right.replace(/(..)/g, '$1:').slice(0, -1),
    ]) {
      await r.updater.stage(zip, given);
    }
    // the line of the .sha256 file that `pnpm bundle` writes (the format of sha256sum), pasted whole, and a BSD-style line
    await r.updater.stage(zip, `${right}  lowrider-pi.zip\n`);
    await r.updater.stage(zip, `SHA256 (lowrider-pi.zip) = ${right}`);
    await r.updater.stage(zip, right.toUpperCase().replace(/(..)/g, '$1 ').trim());
    // the line `pnpm bundle` prints, and a label of the operator's own – the hash is found by itself, not glued to the label
    await r.updater.stage(zip, `SHA-256: ${right}`);
    await r.updater.stage(zip, `sha256:${right}`);
    await r.updater.stage(zip, `Prüfsumme: ${right.toUpperCase()}`);
    await r.updater.stage(zip, `  ${right}\n`);
    // grouped digits are put together; a hash with something of its own glued to it is no hash
    await r.updater.stage(zip, right.replace(/(..)/g, '$1:').slice(0, -1));
    await refused(r.updater.stage(zip, `sha256${right}`), 'checksum-mismatch');
    await refused(r.updater.stage(zip, `${right}ab`), 'checksum-mismatch');
    await refused(r.updater.stage(zip, ''), 'checksum-mismatch');
    // a number that merely begins like it is not it
    await refused(r.updater.stage(zip, right.slice(0, 63)), 'checksum-mismatch');
    const wrong = `${right.slice(0, -1)}${right.endsWith('0') ? '1' : '0'}`;
    const error = await refused(r.updater.stage(zip, wrong), 'checksum-mismatch');
    expect(error.detail).toBe(right);
    await refused(r.updater.stage(zip, ''), 'checksum-mismatch');
  });

  it('refuses what is no zip, no release, or has files it does not know', async () => {
    const r = rig();
    await refused(r.updater.stage(Buffer.from('this is not a zip file at all, really')), 'bad-zip');
    await refused(
      r.updater.stage(writeZip([{ name: '../evil.mjs', data: Buffer.from('x') }])),
      'bad-zip',
    );
    await refused(
      r.updater.stage(writeZip([{ name: 'pi/readme.txt', data: Buffer.from('x') }])),
      'bad-release',
    );
    await refused(r.updater.stage(zipOf(200, {}, [{ name: 'pi/evil.sh' }])), 'bad-release');
    await refused(r.updater.stage(zipOf(200, {}, [{ name: 'pi/app/sub/x.png' }])), 'bad-release');
    await refused(r.updater.stage(zipOf(200, { build: 'x' })), 'bad-release');
    await refused(r.updater.stage(zipOf(200, { format: 'other' })), 'bad-release');
    await refused(r.updater.stage(zipOf(200, { setupLevel: 0 })), 'bad-release');
    await refused(r.updater.stage(zipOf(200, { version: 'latest' })), 'bad-release');
    await refused(r.updater.stage(zipOf(200, { commit: 'not-a-commit' })), 'bad-release');
    expect((await r.updater.status()).staged).toBeNull();
  });

  it('lets an upload go after half an hour, and when it is discarded', async () => {
    const r = rig();
    const staged = await r.updater.stage(zipOf(200));
    r.clock.at += 31 * 60_000;
    expect((await r.updater.status()).staged).toBeNull();
    await refused(r.updater.apply(staged.id), 'no-staged');
    const again = await r.updater.stage(zipOf(200));
    r.updater.discard();
    await refused(r.updater.apply(again.id), 'no-staged');
  });
});

describe('putting a version in place', () => {
  it('writes it beside the running one, tries it, writes the trial, and moves the links – then the process restarts on request', async () => {
    const r = rig();
    const staged = await r.updater.stage(
      zipOf(200, {}, [{ name: 'pi/lsm6dso.py', data: '# new sensor\n' }]),
    );
    const done = await r.updater.apply(staged.id);
    expect(done.name).toBe('b200-20261124150801');
    expect(done.release.build).toBe(200);
    const rel = r.release(done.name);
    expect(readdirSync(rel).sort()).toEqual(['app', 'companion.mjs', 'lsm6dso.py', 'release.json']);
    expect(readdirSync(join(rel, 'app')).sort()).toEqual([
      'icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
    expect(readFileSync(join(rel, 'app/index.html'), 'utf8')).toContain('200');
    expect(readFileSync(join(rel, 'lsm6dso.py'), 'utf8')).toBe('# new sensor\n');
    expect(lstatSync(join(rel, 'lsm6dso.py')).mode & 0o111).not.toBe(0);
    expect(lstatSync(join(rel, 'companion.mjs')).mode & 0o777).toBe(0o644);
    // setup.sh, guard.sh, lib.sh of the zip were never put anywhere
    expect(existsSync(join(rel, 'setup.sh'))).toBe(false);
    expect(existsSync(join(r.dir, 'setup.sh'))).toBe(false);
    // the links: relative, current is new, previous is what ran
    expect(link(r.dir, 'current')).toBe('releases/b200-20261124150801');
    expect(link(r.dir, 'previous')).toBe('releases/b100-20260101000000');
    expect(existsSync(join(r.dir, 'current.tmp'))).toBe(false);
    expect(existsSync(join(r.dir, 'previous.tmp'))).toBe(false);
    expect(readFileSync(join(r.dir, 'trial'), 'utf8')).toBe(
      'new=b200-20261124150801\nprevious=b100-20260101000000\nattempts=0\n',
    );
    expect(existsSync(join(r.dir, 'trial.tmp'))).toBe(false);
    expect(JSON.parse(readFileSync(join(r.dir, 'update-last.json'), 'utf8'))).toMatchObject({
      result: 'pending',
      name: done.name,
      from: 'b100-20260101000000',
      at: T0,
    });
    // what was tried was the new version, in a folder that is gone now; the data was copied first
    expect(r.calls.check).toHaveLength(1);
    expect(r.calls.check[0]).toMatch(/releases\/\.incoming-[0-9a-f]{8}$/);
    expect(existsSync(r.calls.check[0]!)).toBe(false);
    expect(r.calls.backup).toBe(1);
    // the upload is spent
    expect((await r.updater.status()).staged).toBeNull();
    expect(r.calls.restart).toBe(0);
    r.updater.restart();
    expect(r.calls.restart).toBe(1);
  });

  it('keeps the running version’s sensor script where the package has none', async () => {
    const r = rig();
    const done = await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    expect(readFileSync(join(r.release(done.name), 'lsm6dso.py'), 'utf8')).toBe(
      '# the sensor of build 100\n',
    );
    expect(lstatSync(join(r.release(done.name), 'lsm6dso.py')).mode & 0o111).not.toBe(0);
  });

  it('puts the package of this very build in place when asked for, and refuses a version that is not newer otherwise', async () => {
    const r = rig();
    const same = await r.updater.stage(zipOf(100));
    await refused(r.updater.apply(same.id), 'not-newer');
    expect(r.calls.backup).toBe(0);
    expect(link(r.dir, 'current')).toBe('releases/b100-20260101000000');
    const done = await r.updater.apply(same.id, true);
    expect(done.name).toBe('b100-20261124150801');
    expect(link(r.dir, 'previous')).toBe('releases/b100-20260101000000');
  });

  it('refuses a version that needs more of the setup than this Pi has – or a Pi that does not say what it has', async () => {
    const r = rig({ level: 2 });
    const high = await r.updater.stage(zipOf(200, { setupLevel: 3 }));
    const e = await refused(r.updater.apply(high.id), 'needs-setup');
    expect(e.detail).toBe('3 > 2');
    const same = await r.updater.stage(zipOf(200, { setupLevel: 2 }));
    await r.updater.apply(same.id);
    const none = rig({ level: null });
    await refused(none.updater.apply((await none.updater.stage(zipOf(200))).id), 'needs-setup');
    const garbage = rig({ level: null });
    writeFileSync(join(garbage.dir, 'setup-level'), 'lots\n');
    await refused(
      garbage.updater.apply((await garbage.updater.stage(zipOf(200))).id),
      'needs-setup',
    );
    // and nothing was written in any of them
    expect(readdirSync(join(r.dir, 'releases')).filter((n) => n.startsWith('b200'))).toHaveLength(
      1,
    );
    expect(readdirSync(join(none.dir, 'releases'))).toEqual(['b100-20260101000000']);
  });

  it('does not touch anything while a browser is on the machine or a recording runs – asked before the copy and again before the swap', async () => {
    const r = rig();
    const staged = await r.updater.stage(zipOf(200));
    r.state.busy = 'machine-connected';
    expect((await refused(r.updater.apply(staged.id), 'busy')).detail).toBe('machine-connected');
    expect(r.calls.backup).toBe(0);
    expect(r.calls.check).toHaveLength(0);
    // one that turns up while the new version is tried: the new directory goes again, the links stay
    r.state.busy = null;
    r.state.check = async (dir) => {
      r.state.busy = 'recording';
      return {
        ok: true,
        output: '',
        build: JSON.parse(readFileSync(join(dir, 'release.json'), 'utf8')).build,
      };
    };
    expect((await refused(r.updater.apply(staged.id), 'busy')).detail).toBe('recording');
    expect(readdirSync(join(r.dir, 'releases'))).toEqual(['b100-20260101000000']);
    expect(link(r.dir, 'current')).toBe('releases/b100-20260101000000');
    expect(existsSync(join(r.dir, 'trial'))).toBe(false);
    expect((await r.updater.status()).busy).toBe('recording');
  });

  it('refuses without a copy of the database – and a version that does not start, or is not the build it names', async () => {
    const r = rig();
    const staged = await r.updater.stage(zipOf(200));
    r.state.backup = { ok: false, reason: 'not enough free space' };
    expect((await refused(r.updater.apply(staged.id), 'backup-failed')).detail).toBe(
      'not enough free space',
    );
    expect(r.calls.check).toHaveLength(0);
    r.state.backup = { ok: false };
    expect((await refused(r.updater.apply(staged.id), 'backup-failed')).detail).toBe('');
    r.state.backup = { ok: true };
    r.state.check = async () => ({
      ok: false,
      output: `${'x'.repeat(2000)}SyntaxError: nope`,
      build: undefined,
    });
    const failed = await refused(r.updater.apply(staged.id), 'check-failed');
    expect(failed.detail.length).toBeLessThanOrEqual(600);
    expect(failed.detail.endsWith('SyntaxError: nope')).toBe(true);
    r.state.check = async () => ({ ok: true, output: '', build: 999 });
    expect((await refused(r.updater.apply(staged.id), 'check-failed')).detail).toContain(
      'build 999',
    );
    // nothing is left of any of it
    expect(readdirSync(join(r.dir, 'releases'))).toEqual(['b100-20260101000000']);
    expect(link(r.dir, 'current')).toBe('releases/b100-20260101000000');
    expect(existsSync(join(r.dir, 'trial'))).toBe(false);
  });

  it('answers what goes wrong inside as a failure, and one update at a time', async () => {
    const r = rig();
    const staged = await r.updater.stage(zipOf(200));
    // a release directory that cannot be made: its parent is a file
    writeFileSync(join(r.dir, 'releases/.blocker'), '');
    const slow = rig();
    const s2 = await slow.updater.stage(zipOf(200));
    let release!: () => void;
    slow.state.check = (dir) =>
      new Promise((done) => {
        release = () =>
          done({
            ok: true,
            output: '',
            build: JSON.parse(readFileSync(join(dir, 'release.json'), 'utf8')).build,
          });
      });
    const first = slow.updater.apply(s2.id);
    await vi.waitFor(() => expect(slow.calls.check).toHaveLength(1));
    await refused(slow.updater.apply(s2.id), 'busy');
    await refused(slow.updater.rollback(), 'busy');
    release();
    await first;
    // a wrong id, an update that is gone
    await refused(r.updater.apply('nope'), 'no-staged');
    expect(staged.id).not.toBe('nope');
    // the layout that vanishes between the upload and the apply
    const vanished = rig();
    const s3 = await vanished.updater.stage(zipOf(200));
    mkdirSync(join(vanished.dir, 'x'));
    rmSync(join(vanished.dir, 'current'));
    await refused(vanished.updater.apply(s3.id), 'not-enabled');
  });
});

describe('going back by hand', () => {
  async function updated(): Promise<Rig> {
    const r = rig();
    await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    return r;
  }

  it('lets current and previous change places, and a second time goes forward again', async () => {
    const r = await updated();
    r.clock.at += 5000;
    const back = await r.updater.rollback();
    expect(back.name).toBe('b100-20260101000000');
    expect(link(r.dir, 'current')).toBe('releases/b100-20260101000000');
    expect(link(r.dir, 'previous')).toBe('releases/b200-20261124150801');
    // no trial: that version has run before; and what the trial of the update said is gone
    expect(existsSync(join(r.dir, 'trial'))).toBe(false);
    expect(JSON.parse(readFileSync(join(r.dir, 'update-last.json'), 'utf8'))).toMatchObject({
      result: 'rolled-back-by-hand',
      name: 'b100-20260101000000',
      from: 'b200-20261124150801',
    });
    expect((await r.updater.rollback()).name).toBe('b200-20261124150801');
    expect(link(r.dir, 'current')).toBe('releases/b200-20261124150801');
  });

  it('is not possible without a previous version, with a previous that is gone – or while a machine is connected', async () => {
    const r = rig();
    await refused(r.updater.rollback(), 'no-previous');
    const gone = await updated();
    rmSync(join(gone.dir, 'releases/b100-20260101000000'), { recursive: true });
    await refused(gone.updater.rollback(), 'no-previous');
    const same = rig();
    symlinkSync('releases/b100-20260101000000', join(same.dir, 'previous'));
    await refused(same.updater.rollback(), 'no-previous');
    const busy = await updated();
    busy.state.busy = 'machine-connected';
    await refused(busy.updater.rollback(), 'busy');
    expect(link(busy.dir, 'current')).toBe('releases/b200-20261124150801');
    await refused(rig({ layout: false }).updater.rollback(), 'not-enabled');
  });
});

describe('the new version confirming itself', () => {
  /** The updated Pi, with a process that runs from the new release directory. */
  async function running() {
    const r = rig();
    const done = await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    const updater = new Updater({
      dir: r.dir,
      running: { name: done.name, version: '0.1.0', build: 200, commit: 'abcdef123' },
      check: async () => ({ ok: true, output: '' }),
      backup: async () => ({ ok: true }),
      busy: () => null,
      restart: () => {},
      now: () => r.clock.at + 31_000,
    });
    return { r, done, updater };
  }

  it('takes the trial away, says "ok", and lets old versions go', async () => {
    const { r, done, updater } = await running();
    // old versions that nobody needs
    for (const old of ['b50-20250101000000', 'b60-20250202000000']) {
      mkdirSync(join(r.dir, 'releases', old));
    }
    utimesSync(
      join(r.dir, 'releases/b50-20250101000000'),
      new Date(2025, 0, 1),
      new Date(2025, 0, 1),
    );
    utimesSync(
      join(r.dir, 'releases/b60-20250202000000'),
      new Date(2025, 1, 2),
      new Date(2025, 1, 2),
    );
    mkdirSync(join(r.dir, 'releases/.incoming-deadbeef'));
    await updater.confirm();
    expect(existsSync(join(r.dir, 'trial'))).toBe(false);
    expect(JSON.parse(readFileSync(join(r.dir, 'update-last.json'), 'utf8'))).toMatchObject({
      result: 'ok',
      name: done.name,
      from: 'b100-20260101000000',
    });
    expect(readdirSync(join(r.dir, 'releases')).sort()).toEqual(
      ['b100-20260101000000', done.name, 'b60-20250202000000'].sort(),
    );
  });

  it('waits for an update under way: its half-made directory is not cleared, and a refused one leaves the trial to be confirmed', async () => {
    const { r, done } = await running();
    let release: () => void = () => {};
    const gate = new Promise<void>((go) => (release = go));
    const updater = new Updater({
      dir: r.dir,
      running: { name: done.name, version: '0.1.0', build: 200, commit: 'abcdef123' },
      // the check of the next update is under way while the 30 s of this version are up
      check: async () => {
        await gate;
        return { ok: false, output: 'refused' };
      },
      backup: async () => ({ ok: true }),
      busy: () => null,
      restart: () => {},
      now: () => r.clock.at + 31_000,
    });
    const staged = await updater.stage(zipOf(300));
    const applying = updater.apply(staged.id);
    const outcome = applying.then(
      () => 'applied',
      (e: UpdateError) => e.code,
    );
    // the apply is in its check: its directory is there
    await vi.waitFor(() =>
      expect(readdirSync(join(r.dir, 'releases')).some((n) => n.startsWith('.incoming-'))).toBe(
        true,
      ),
    );
    const confirming = updater.confirm();
    await new Promise((go) => setTimeout(go, 200));
    expect(readdirSync(join(r.dir, 'releases')).some((n) => n.startsWith('.incoming-'))).toBe(true);
    expect(existsSync(join(r.dir, 'trial'))).toBe(true);
    release();
    expect(await outcome).toBe('check-failed');
    await confirming;
    // the refused update changed nothing: this version is confirmed as it would have been
    expect(existsSync(join(r.dir, 'trial'))).toBe(false);
    expect(JSON.parse(readFileSync(join(r.dir, 'update-last.json'), 'utf8')).result).toBe('ok');
    expect(link(r.dir, 'current')).toBe(`releases/${done.name}`);
  });

  it('confirms although the note of it cannot be written – the trial must not outlive a full disk', async () => {
    const { r, updater } = await running();
    rmSync(join(r.dir, 'update-last.json'));
    mkdirSync(join(r.dir, 'update-last.json'));
    await updater.confirm();
    expect(existsSync(join(r.dir, 'trial'))).toBe(false);
  });

  it('is under way itself while it confirms: an update cannot start in the middle of it', async () => {
    const { r, updater } = await running();
    const staged = await updater.stage(zipOf(300));
    const confirming = updater.confirm();
    await refused(updater.apply(staged.id), 'busy');
    await confirming;
    expect(existsSync(join(r.dir, 'trial'))).toBe(false);
    // and it is free again afterwards: the apply gets as far as the check (which has no build to report here)
    await refused(updater.apply(staged.id), 'check-failed');
  });

  it('does nothing for a version that is not the one on trial, or one that does not know where it runs from', async () => {
    const { r, updater } = await running();
    const other = new Updater({
      dir: r.dir,
      running: { name: 'b100-20260101000000', version: '0.1.0', build: 100, commit: 'old' },
      check: async () => ({ ok: true, output: '' }),
      backup: async () => ({ ok: true }),
      busy: () => null,
      restart: () => {},
    });
    await other.confirm();
    expect(existsSync(join(r.dir, 'trial'))).toBe(true);
    const nowhere = new Updater({
      dir: r.dir,
      running: { name: null, version: '0.1.0', build: 200, commit: 'x' },
      check: async () => ({ ok: true, output: '' }),
      backup: async () => ({ ok: true }),
      busy: () => null,
      restart: () => {},
    });
    await nowhere.confirm();
    expect(existsSync(join(r.dir, 'trial'))).toBe(true);
    // and with no trial at all there is nothing to confirm
    await updater.confirm();
    await updater.confirm();
    expect(JSON.parse(readFileSync(join(r.dir, 'update-last.json'), 'utf8')).result).toBe('ok');
  });
});

async function running2() {
  const r = rig();
  await r.updater.apply((await r.updater.stage(zipOf(200))).id);
  return r;
}

describe('what a half-way outcome must not do', () => {
  it('keeps going when the note of the update cannot be written: the new version is in place, so the restart must follow', async () => {
    const r = rig();
    // a directory where the note's file belongs – writing it fails like a full or read-only disk would
    mkdirSync(join(r.dir, 'update-last.json'));
    const staged = await r.updater.stage(zipOf(200));
    const done = await r.updater.apply(staged.id);
    expect(link(r.dir, 'current')).toBe(`releases/${done.name}`);
    expect(link(r.dir, 'previous')).toBe('releases/b100-20260101000000');
    expect(existsSync(join(r.dir, 'trial'))).toBe(true);
    expect((await r.updater.status()).staged).toBeNull();
  });

  it('offers no way back where previous and current are the same version – what the guard leaves behind', async () => {
    const r = rig();
    await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    // the guard has pointed current back at the old one
    rmSync(join(r.dir, 'current'));
    symlinkSync('releases/b100-20260101000000', join(r.dir, 'current'));
    expect((await r.updater.status()).previous).toBeNull();
    await refused(r.updater.rollback(), 'no-previous');
  });

  it('keeps going when the note of a rollback cannot be written: the links have moved, so the restart must follow', async () => {
    const r = await running2();
    mkdirSync(join(r.dir, 'update-last.json.tmp'));
    const back = await r.updater.rollback();
    expect(back.name).toBe('b100-20260101000000');
    expect(link(r.dir, 'current')).toBe('releases/b100-20260101000000');
    expect(existsSync(join(r.dir, 'trial'))).toBe(false);
  });

  it('is not enabled where the running program is not one of the releases – it could never confirm a new version', async () => {
    const r = rig();
    const nowhere = new Updater({
      dir: r.dir,
      running: { name: null, version: '0.1.0', build: 100, commit: 'x' },
      check: async () => ({ ok: true, output: '' }),
      backup: async () => ({ ok: true }),
      busy: () => null,
      restart: () => {},
    });
    expect(await nowhere.enabled()).toBe(false);
    expect((await nowhere.status()).enabled).toBe(false);
    await refused(nowhere.stage(zipOf(200)), 'not-enabled');
  });

  it('puts what it writes on the disk before it counts on it: files, directories, the trial', async () => {
    const r = rig();
    // `FileHandle` is no export of node:fs/promises: its prototype comes from a handle
    const probe = await open(join(r.dir, 'setup-level'));
    const proto = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
    await probe.close();
    const sync = vi.spyOn(proto, 'sync');
    try {
      await r.updater.apply((await r.updater.stage(zipOf(200))).id);
      // every file of the release (companion, page, release.json, sensor script, two app files), the trial, the note –
      // and the directories they stand in
      expect(sync.mock.calls.length).toBeGreaterThanOrEqual(8 + 3);
    } finally {
      sync.mockRestore();
    }
  });
});

describe('an update while the running version is still on trial', () => {
  it('keeps the version before it as the way back: a version that never confirmed itself is no place to return to', async () => {
    const r = rig();
    const first = await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    // 200 has not confirmed itself (its trial is there) when 300 comes
    const second = await r.updater.apply((await r.updater.stage(zipOf(300))).id);
    expect(link(r.dir, 'current')).toBe(`releases/${second.name}`);
    expect(link(r.dir, 'previous')).toBe('releases/b100-20260101000000');
    expect(readFileSync(join(r.dir, 'trial'), 'utf8')).toBe(
      `new=${second.name}\nprevious=b100-20260101000000\nattempts=0\n`,
    );
    expect(first.name).not.toBe(second.name);
  });

  it('takes the running version as the way back once it has confirmed itself', async () => {
    const r = rig();
    const first = await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    rmSync(join(r.dir, 'trial'));
    const second = await r.updater.apply((await r.updater.stage(zipOf(300))).id);
    expect(link(r.dir, 'previous')).toBe(`releases/${first.name}`);
  });

  it('does not take its way back from a trial that is about another version', async () => {
    const r = rig();
    const first = await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    // a leftover: the trial names a version that does not run
    writeFileSync(
      join(r.dir, 'trial'),
      'new=b9-20250101000000\nprevious=b1-20240101000000\nattempts=1\n',
    );
    mkdirSync(join(r.dir, 'releases/b1-20240101000000'));
    await r.updater.apply((await r.updater.stage(zipOf(300))).id);
    expect(link(r.dir, 'previous')).toBe(`releases/${first.name}`);
  });

  it('falls back to the running version where the one the trial names is gone', async () => {
    const r = rig();
    const first = await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    rmSync(join(r.dir, 'releases/b100-20260101000000'), { recursive: true });
    await r.updater.apply((await r.updater.stage(zipOf(300))).id);
    expect(link(r.dir, 'previous')).toBe(`releases/${first.name}`);
  });
});

describe('what the card shows', () => {
  it('says what runs, what ran before, what the setup is, how the last update ended, and whether one waits', async () => {
    const r = rig();
    const before = await r.updater.status();
    expect(before).toMatchObject({
      enabled: true,
      previous: null,
      setupLevel: 2,
      last: null,
      trial: false,
      staged: null,
      busy: null,
    });
    expect(before.running).toMatchObject({ name: 'b100-20260101000000', build: 100 });
    await r.updater.apply((await r.updater.stage(zipOf(200))).id);
    const after = await r.updater.status();
    expect(after.previous).toEqual({
      name: 'b100-20260101000000',
      version: '0.1.0',
      build: 100,
      commit: 'abcdef123',
    });
    expect(after.trial).toBe(true);
    expect(after.last).toMatchObject({ result: 'pending', name: 'b200-20261124150801' });
  });

  it('reads what the guard wrote about a version it took away – and nothing it does not understand', async () => {
    const r = rig();
    const file = join(r.dir, 'update-last.json');
    writeFileSync(
      file,
      '{"result":"rolled-back","name":"b100-x","from":"b200-y","at":1795000000000,"detail":"b200-y starts without confirming"}',
    );
    expect(await r.updater.last()).toEqual({
      result: 'rolled-back',
      name: 'b100-x',
      from: 'b200-y',
      at: 1795000000000,
      detail: 'b200-y starts without confirming',
    });
    for (const bad of [
      '',
      'garbage',
      '[]',
      '{"result":"fine","at":1}',
      '{"result":"ok","at":"yesterday"}',
      '{"result":"ok"}',
    ]) {
      writeFileSync(file, bad);
      expect(await r.updater.last(), bad).toBeNull();
    }
    // names that are not of the alphabet of a name are dropped, not shown
    writeFileSync(file, '{"result":"ok","name":"../x","from":5,"at":1}');
    expect(await r.updater.last()).toEqual({
      result: 'ok',
      name: undefined,
      from: undefined,
      at: 1,
      detail: undefined,
    });
  });
});

describe('what a package may contain', () => {
  const staged = async (entries: { name: string; data?: Buffer }[]) => {
    const r = rig();
    return r.updater.stage(
      writeZip([
        { name: 'pi/companion.mjs', data: Buffer.from('#!/usr/bin/env node\n') },
        { name: 'pi/lowrider-control.html', data: Buffer.from('<!doctype html>') },
        { name: 'pi/release.json', data: Buffer.from(releaseJson(200)) },
        ...entries,
      ]),
    );
  };

  it('takes the app’s assets by their names, and nothing that is not a picture, a manifest or text', async () => {
    const ok = await staged([
      { name: 'pi/app/icon-512.png', data: Buffer.from('x') },
      { name: 'pi/app/manifest.webmanifest', data: Buffer.from('{}') },
      { name: 'pi/app/favicon.ico', data: Buffer.from('x') },
    ]);
    expect(ok.files).toBe(6);
    for (const bad of [
      'pi/app/evil.js',
      'pi/app/evil.html',
      'pi/app/.hidden',
      'pi/app/index.html',
      'pi/app/-x.png',
      'pi/other/x.png',
    ]) {
      await refused(staged([{ name: bad, data: Buffer.from('x') }]), 'bad-release');
    }
  });

  it('ignores what is not the release: the setup files, files outside pi/ – and never applies them', async () => {
    const r = rig();
    const done = await r.updater.stage(
      writeZip([
        { name: 'update-pi.bat', data: Buffer.from('@echo off') },
        { name: 'pi/companion.mjs', data: Buffer.from('#!/usr/bin/env node\n') },
        { name: 'pi/lowrider-control.html', data: Buffer.from('<!doctype html>') },
        { name: 'pi/release.json', data: Buffer.from(releaseJson(200)) },
        { name: 'pi/setup.sh', data: Buffer.from('x') },
        { name: 'pi/lib.sh', data: Buffer.from('x') },
        { name: 'pi/guard.sh', data: Buffer.from('x') },
      ]),
    );
    expect(done.files).toBe(3);
  });

  it('refuses a program that is none, a page that is none, and a file that is too large', async () => {
    const page = Buffer.from('<!doctype html>');
    const release = Buffer.from(releaseJson(200));
    const make = (companion: Buffer, html: Buffer, extra: { name: string; data: Buffer }[] = []) =>
      rig().updater.stage(
        writeZip([
          { name: 'pi/companion.mjs', data: companion },
          { name: 'pi/lowrider-control.html', data: html },
          { name: 'pi/release.json', data: release },
          ...extra,
        ]),
      );
    await refused(make(Buffer.from('echo hello'), page), 'bad-release');
    await refused(make(Buffer.from('#!/usr/bin/env node\n'), Buffer.from('<html>')), 'bad-release');
    await make(Buffer.from('#!/usr/bin/env node\n'), Buffer.from('\uFEFF  <!DOCTYPE HTML>'));
    await refused(
      make(Buffer.from('#!/usr/bin/env node\n'), page, [
        { name: 'pi/app/big.png', data: Buffer.alloc(3 * 1024 * 1024, 1) },
      ]),
      'bad-release',
    );
    // two files missing
    await refused(
      rig().updater.stage(
        writeZip([{ name: 'pi/companion.mjs', data: Buffer.from('#!/usr/bin/env node\n') }]),
      ),
      'bad-release',
    );
    await refused(
      rig().updater.stage(writeZip([{ name: 'other/x.txt', data: Buffer.from('x') }])),
      'bad-release',
    );
  });
});

describe('checkPackage – what the release script asks the Pi’s own reader', () => {
  it('gives the package of a good zip and refuses one the Pi would refuse', async () => {
    const { checkPackage } = await import('../src/packageCheck');
    expect(checkPackage(zipOf(1234)).release.build).toBe(1234);
    expect(() =>
      checkPackage(writeZip([{ name: 'other/x.txt', data: Buffer.from('x') }])),
    ).toThrow();
  });
});
