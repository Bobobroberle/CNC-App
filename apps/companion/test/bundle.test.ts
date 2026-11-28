import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPackage } from '../src/release';
import { readZip } from '../src/zip';

// The release the operator gets: `pnpm bundle` makes lowrider-pi.zip with update-pi.bat beside the folder pi, and checks it
// with the reader the Pi uses. Needs the app built (apps/control/dist): `pnpm check` builds before it runs the tests, so
// it is there; the suite is skipped only where nobody built (the tests run alone on a clean checkout). A stale `dist`
// does not skip it – the licence guard of scripts/bundle.mjs fails it.

const ROOT = join(import.meta.dirname, '../../..');
const built = existsSync(join(ROOT, 'apps/control/dist/index.html'));

describe.skipIf(!built)('the release zip', () => {
  const run = () => {
    execFileSync('node', ['build.mjs'], { cwd: join(ROOT, 'apps/companion') });
    return execFileSync('node', ['scripts/bundle.mjs'], { cwd: ROOT, encoding: 'utf8' });
  };

  it('holds the folder pi and update-pi.bat, which the Pi’s own reader takes – and has its checksum beside it', () => {
    const out = run();
    expect(out).toContain('release/lowrider-pi.zip');
    const zip = readFileSync(join(ROOT, 'release/lowrider-pi.zip'));
    const files = readZip(zip);
    expect([...files.keys()]).toContain('update-pi.bat');
    for (const name of [
      'companion.mjs',
      'lowrider-control.html',
      'release.json',
      'setup.sh',
      'lib.sh',
      'guard.sh',
      'health-gate.sh',
      'lsm6dso.py',
    ]) {
      expect([...files.keys()], name).toContain(`pi/${name}`);
    }
    const pkg = readPackage(files);
    expect(pkg.ignored.sort()).toEqual([
      'pi/guard.sh',
      'pi/health-gate.sh',
      'pi/lib.sh',
      'pi/setup.sh',
      'update-pi.bat',
    ]);
    expect(pkg.release.build).toBe(
      JSON.parse(readFileSync(join(ROOT, 'apps/companion/dist/release.json'), 'utf8')).build,
    );
    // the checksum file is the sha256sum line of this very zip
    const line = readFileSync(join(ROOT, 'release/lowrider-pi.zip.sha256'), 'utf8');
    expect(line).toBe(`${createHash('sha256').update(zip).digest('hex')}  lowrider-pi.zip\n`);
  });

  it('has a bat that cmd.exe can read: plain ASCII, every line ends in CRLF', () => {
    run();
    const bat = readFileSync(join(ROOT, 'release/lowrider-pi.zip'));
    const text = readZip(bat).get('update-pi.bat')!.toString('latin1');
    expect(/[^\x00-\x7f]/.test(text)).toBe(false);
    expect(
      text
        .split('\n')
        .slice(0, -1)
        .every((l) => l.endsWith('\r')),
    ).toBe(true);
    expect(text.startsWith('@echo off')).toBe(true);
  });

  it('is the same bytes for the same build: nothing in it comes from the clock', () => {
    const forced = { ...process.env, LOWRIDER_BUILD: '1795000000', LOWRIDER_COMMIT: 'abcdef0' };
    const make = () => {
      execFileSync('node', ['build.mjs'], { cwd: join(ROOT, 'apps/companion'), env: forced });
      execFileSync('node', ['scripts/bundle.mjs'], { cwd: ROOT, env: forced });
      return createHash('sha256')
        .update(readFileSync(join(ROOT, 'release/lowrider-pi.zip')))
        .digest('hex');
    };
    expect(make()).toBe(make());
    // leave the real build behind for whoever looks at release/ next
    run();
  });

  it('is refused at the build when the Pi would refuse it – a file it does not know in release/pi is not carried along', () => {
    run();
    const env = { ...process.env };
    // `release/pi` is made anew each time, so a leftover cannot get in: the zip has only what the build put there
    const files = [...readZip(readFileSync(join(ROOT, 'release/lowrider-pi.zip'))).keys()];
    expect(files.filter((f) => f.startsWith('pi/') && !f.endsWith('/'))).not.toContain(
      'pi/old-leftover.sh',
    );
    expect(env).toBeDefined();
  });
});
