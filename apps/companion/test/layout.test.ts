import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The layout of the Pi (releases/, current, previous) and the guard that undoes a bad update: the shell
// scripts that setup.sh and systemd run, tried for real in temporary directories.

const SCRIPTS = join(import.meta.dirname, '../../../scripts/pi');
const LIB = join(SCRIPTS, 'lib.sh');
const GUARD = join(SCRIPTS, 'guard.sh');

const tmp = () => mkdtempSync(join(tmpdir(), 'lowrider-layout-'));

/** Runs shell with the helpers loaded; returns what it printed. */
function sh(script: string, env: Record<string, string> = {}): string {
  // setup.sh runs with `set -euo pipefail`: the helpers are tried under the same rules
  return execFileSync('bash', ['-c', `set -euo pipefail; source "${LIB}"; ${script}`], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
  });
}

/** A folder like `release/pi`: what setup.sh installs from. */
function source(build = 100): string {
  const dir = tmp();
  writeFileSync(join(dir, 'companion.mjs'), `// companion ${build}\n`);
  writeFileSync(join(dir, 'lowrider-control.html'), `<!doctype html><!-- ${build} -->`);
  writeFileSync(join(dir, 'lsm6dso.py'), '# sensor\n');
  writeFileSync(join(dir, 'release.json'), JSON.stringify({ format: 'lowrider-release', build }));
  mkdirSync(join(dir, 'app'));
  writeFileSync(join(dir, 'app/manifest.webmanifest'), '{}');
  writeFileSync(join(dir, 'app/icon-192.png'), 'png');
  return dir;
}

const link = (dir: string, name: string) => {
  try {
    return readlinkSync(join(dir, name));
  } catch {
    return null;
  }
};

describe('installing a version beside the others', () => {
  it('puts it in a directory of its own and points current at it, atomically and relative', () => {
    const dir = tmp();
    const out = sh(`lr_install_release "${source(412)}" "${dir}" && echo "$LR_NEW|$LR_OLD"`);
    const [name, old] = out.trim().split('|');
    expect(name).toMatch(/^b412-\d{14}$/);
    expect(old).toBe('');
    expect(link(dir, 'current')).toBe(`releases/${name}`);
    expect(link(dir, 'previous')).toBeNull();
    const rel = join(dir, 'releases', name!);
    expect(readdirSync(rel).sort()).toEqual(['app', 'companion.mjs', 'lsm6dso.py', 'release.json']);
    expect(readdirSync(join(rel, 'app')).sort()).toEqual([
      'icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
    expect(readFileSync(join(rel, 'app/index.html'), 'utf8')).toContain('412');
    expect(lstatSync(join(rel, 'lsm6dso.py')).mode & 0o111).not.toBe(0);
    // no temporary link is left
    expect(existsSync(join(dir, 'current.tmp'))).toBe(false);
  });

  it('makes what was current the previous one, and the data directory is not touched', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data/lowrider.db'), 'database');
    const first = sh(`lr_install_release "${source(1)}" "${dir}"; echo "$LR_NEW"`).trim();
    // the clock of a Pi has seconds: two installs in one second would collide, so the test waits for the next one
    execFileSync('sleep', ['1.1']);
    const second = sh(`lr_install_release "${source(2)}" "${dir}"; echo "$LR_NEW|$LR_OLD"`).trim();
    const [name, old] = second.split('|');
    expect(old).toBe(first);
    expect(link(dir, 'previous')).toBe(`releases/${first}`);
    expect(link(dir, 'current')).toBe(`releases/${name}`);
    expect(readFileSync(join(dir, 'data/lowrider.db'), 'utf8')).toBe('database');
  });

  it('refuses a folder that is no release, and changes nothing', () => {
    const dir = tmp();
    const empty = tmp();
    const r = spawnSync('bash', ['-c', `source "${LIB}"; lr_install_release "${empty}" "${dir}"`]);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir, 'current'))).toBe(false);
    expect(existsSync(join(dir, 'releases'))).toBe(false);
  });

  it('takes build 0 for a release.json it cannot read (the file is optional in an old folder)', () => {
    const dir = tmp();
    const src = source(5);
    writeFileSync(join(src, 'release.json'), 'not json');
    const name = sh(`lr_install_release "${src}" "${dir}"; echo "$LR_NEW"`).trim();
    expect(name).toMatch(/^b0-/);
  });
});

describe('the older, flat layout', () => {
  /** What an old setup.sh left: files directly in the directory. */
  function flat(): string {
    const dir = tmp();
    writeFileSync(join(dir, 'companion.mjs'), '// old companion\n');
    writeFileSync(join(dir, 'lsm6dso.py'), '# old sensor\n');
    mkdirSync(join(dir, 'app'));
    writeFileSync(join(dir, 'app/index.html'), '<!doctype html>old');
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data/lowrider.db'), 'database');
    return dir;
  }

  it('becomes a release as a copy – the flat files stay until the new version has proved itself', () => {
    const dir = flat();
    const out = sh(
      `lr_migrate_legacy "${dir}" && echo "$LR_LEGACY|$(lr_link_name "${dir}" current)"`,
    );
    const [legacy, name] = out.trim().split('|');
    expect(legacy).toBe('1');
    expect(name).toMatch(/^legacy-\d{14}$/);
    expect(readFileSync(join(dir, 'releases', name!, 'companion.mjs'), 'utf8')).toContain('old');
    expect(readFileSync(join(dir, 'releases', name!, 'app/index.html'), 'utf8')).toContain('old');
    // the old service still runs from the flat files
    expect(existsSync(join(dir, 'companion.mjs'))).toBe(true);
    expect(existsSync(join(dir, 'app/index.html'))).toBe(true);
  });

  it('is the way back after the install of a new version, and the flat files go only on request', () => {
    const dir = flat();
    const out = sh(
      `lr_migrate_legacy "${dir}" && lr_install_release "${source(7)}" "${dir}" && echo "$LR_OLD|$LR_NEW"`,
    );
    const [old, fresh] = out.trim().split('|');
    expect(old).toMatch(/^legacy-/);
    expect(link(dir, 'previous')).toBe(`releases/${old}`);
    expect(link(dir, 'current')).toBe(`releases/${fresh}`);
    expect(existsSync(join(dir, 'companion.mjs'))).toBe(true);
    sh(`lr_remove_flat "${dir}"`);
    expect(existsSync(join(dir, 'companion.mjs'))).toBe(false);
    expect(existsSync(join(dir, 'lsm6dso.py'))).toBe(false);
    expect(existsSync(join(dir, 'app'))).toBe(false);
    // the releases and the data are still there
    expect(existsSync(join(dir, 'releases', old!, 'companion.mjs'))).toBe(true);
    expect(readFileSync(join(dir, 'data/lowrider.db'), 'utf8')).toBe('database');
  });

  it('does nothing where there is no flat layout, or where the new one is already in use', () => {
    const none = tmp();
    expect(sh(`lr_migrate_legacy "${none}"; echo "$LR_LEGACY"`).trim()).toBe('0');
    expect(existsSync(join(none, 'releases'))).toBe(false);
    const done = flat();
    sh(`lr_migrate_legacy "${done}"`);
    const before = readdirSync(join(done, 'releases'));
    expect(sh(`lr_migrate_legacy "${done}"; echo "$LR_LEGACY"`).trim()).toBe('0');
    expect(readdirSync(join(done, 'releases'))).toEqual(before);
    // and removing the flat files is refused while the service could still run from them
    const unmigrated = flat();
    sh(`lr_remove_flat "${unmigrated}"`);
    expect(existsSync(join(unmigrated, 'companion.mjs'))).toBe(true);
  });
});

describe('pointing a link', () => {
  it('only at a release of the alphabet of names – never at a path that merely exists', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'releases/good'), { recursive: true });
    mkdirSync(join(dir, 'x'));
    const point = (name: string) =>
      spawnSync('bash', ['-c', `source "${LIB}"; lr_point "${dir}" current "${name}"`]).status;
    expect(point('good')).toBe(0);
    expect(link(dir, 'current')).toBe('releases/good');
    for (const bad of ['../x', 'a b', '', 'missing']) {
      expect(point(bad), bad).not.toBe(0);
      expect(link(dir, 'current'), bad).toBe('releases/good');
    }
  });
});

describe('going back and tidying up', () => {
  /** A directory with the releases named, current and previous set. */
  function made(names: string[], current: string, previous?: string): string {
    const dir = tmp();
    mkdirSync(join(dir, 'releases'));
    // older ones first: `ls -t` goes by modification time
    names.forEach((n, i) => {
      mkdirSync(join(dir, 'releases', n));
      const t = new Date(Date.now() - (names.length - i) * 60_000);
      execFileSync('touch', ['-d', t.toISOString(), join(dir, 'releases', n)]);
    });
    symlinkSync(`releases/${current}`, join(dir, 'current'));
    if (previous) symlinkSync(`releases/${previous}`, join(dir, 'previous'));
    return dir;
  }

  it('points current back at previous – and refuses where there is none, or it is the same', () => {
    const dir = made(['a', 'b'], 'b', 'a');
    sh(`lr_go_back "${dir}"`);
    expect(link(dir, 'current')).toBe('releases/a');
    const lonely = made(['a'], 'a');
    expect(spawnSync('bash', ['-c', `source "${LIB}"; lr_go_back "${lonely}"`]).status).not.toBe(0);
    const same = made(['a'], 'a', 'a');
    expect(spawnSync('bash', ['-c', `source "${LIB}"; lr_go_back "${same}"`]).status).not.toBe(0);
    expect(link(same, 'current')).toBe('releases/a');
  });

  it('keeps the current, the previous and the newest other release – and nothing it does not know', () => {
    const dir = made(['v1', 'v2', 'v3', 'v4', 'v5'], 'v5', 'v4');
    mkdirSync(join(dir, 'releases', 'not a name!'));
    writeFileSync(join(dir, 'releases', 'afile'), 'x');
    sh(`lr_prune "${dir}"`);
    expect(readdirSync(join(dir, 'releases')).sort()).toEqual([
      'afile',
      'not a name!',
      'v3',
      'v4',
      'v5',
    ]);
    // nothing to tidy: nothing happens (and no directory is needed)
    sh(`lr_prune "${tmp()}"`);
  });
});

describe('the env file', () => {
  it('keeps the lines it does not know, sets its own once, and takes a value out of it', () => {
    const file = join(tmp(), 'lowrider.env');
    writeFileSync(
      file,
      [
        '# LowRider Control – read by the lowrider-* services',
        'PORT=8080',
        'FLUIDNC_URL=ws://192.168.0.7:81',
        'MY_OWN=keep me',
        '# a note of the operator',
        'CAMERA_FPS=15',
        '',
      ].join('\n'),
    );
    const merged = sh(
      `lr_env_merge "${file}" PORT=8080 CAMERA_FPS=30 LOWRIDER_DIR=/home/pi/lowrider`,
    );
    const lines = merged.trim().split('\n');
    expect(lines[0]).toMatch(/^# LowRider Control/);
    expect(lines.filter((l) => l.startsWith('# LowRider Control'))).toHaveLength(1);
    expect(lines).toContain('MY_OWN=keep me');
    expect(lines).toContain('# a note of the operator');
    expect(lines).toContain('FLUIDNC_URL=ws://192.168.0.7:81');
    expect(lines.filter((l) => l.startsWith('CAMERA_FPS='))).toEqual(['CAMERA_FPS=30']);
    expect(lines.filter((l) => l.startsWith('PORT='))).toEqual(['PORT=8080']);
    expect(lines).toContain('LOWRIDER_DIR=/home/pi/lowrider');
    expect(sh(`lr_env_get "${file}" FLUIDNC_URL`).trim()).toBe('ws://192.168.0.7:81');
    expect(sh(`lr_env_get "${file}" NOPE`).trim()).toBe('');
    expect(sh(`lr_env_get "/does/not/exist" FLUIDNC_URL`).trim()).toBe('');
    // a file that is not there yet is just the pairs
    expect(sh(`lr_env_merge "/does/not/exist" A=1 B=two`).trim().split('\n').slice(1)).toEqual([
      'A=1',
      'B=two',
    ]);
  });

  it('keeps a last line that has no newline, and a value with spaces and an equals sign', () => {
    const file = join(tmp(), 'lowrider.env');
    writeFileSync(file, 'KEEP=a=b c');
    const merged = sh(`lr_env_merge "${file}" NEW=1`);
    expect(merged.trim().split('\n')).toContain('KEEP=a=b c');
  });
});

describe('waiting for the companion', () => {
  /** A PATH with a curl that answers after `after` tries, and a sleep that does not wait. */
  function fakeBin(after: number): string {
    const bin = tmp();
    const counter = join(bin, 'count');
    writeFileSync(counter, '0');
    writeFileSync(
      join(bin, 'curl'),
      `#!/usr/bin/env bash\nn=$(<"${counter}"); n=$((n+1)); echo $n >"${counter}"\n[[ $n -ge ${after} ]]\n`,
    );
    writeFileSync(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(join(bin, 'curl'), 0o755);
    chmodSync(join(bin, 'sleep'), 0o755);
    return bin;
  }
  const wait = (bin: string, secs: number) =>
    spawnSync('bash', ['-c', `source "${LIB}"; lr_wait_healthy 8080 ${secs}`], {
      env: { PATH: `${bin}:${process.env.PATH}` },
    }).status;

  it('succeeds as soon as the health check answers, and gives up after the seconds it was given', () => {
    expect(wait(fakeBin(3), 10)).toBe(0);
    expect(wait(fakeBin(50), 10)).not.toBe(0);
  });

  it('shows the Pi code once the companion has written it', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data/pi-code.txt'), 'ABCD-EFGH-JKLM\n');
    expect(sh(`lr_pi_code "${dir}" 1`).trim()).toBe('ABCD-EFGH-JKLM');
    const bin = fakeBin(1);
    const none = spawnSync('bash', ['-c', `source "${LIB}"; lr_pi_code "${tmp()}" 2`], {
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    expect(none.status).not.toBe(0);
  });
});

describe('the guard before every start of the companion', () => {
  /** A directory as the app's update leaves it: new is current, previous is the way back, a trial is written. */
  function trial(attempts: number | null, over: Record<string, string> = {}): string {
    const dir = tmp();
    mkdirSync(join(dir, 'releases/old'), { recursive: true });
    mkdirSync(join(dir, 'releases/new'));
    for (const name of ['old', 'new'])
      writeFileSync(join(dir, 'releases', name, 'companion.mjs'), '// program\n');
    symlinkSync('releases/new', join(dir, 'current'));
    symlinkSync('releases/old', join(dir, 'previous'));
    if (attempts !== null) {
      const t = { new: 'new', previous: 'old', attempts: String(attempts), ...over };
      writeFileSync(
        join(dir, 'trial'),
        Object.entries(t)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n') + '\n',
      );
    }
    return dir;
  }
  const guard = (dir: string | undefined) =>
    spawnSync('bash', [GUARD], {
      env: { PATH: process.env.PATH ?? '', ...(dir ? { LOWRIDER_DIR: dir } : {}) },
    });
  const attempts = (dir: string) =>
    /attempts=(\d+)/.exec(readFileSync(join(dir, 'trial'), 'utf8'))?.[1];

  it('goes back at once when the current version has no program file – a power cut can leave it empty', () => {
    for (const damage of ['empty', 'missing'] as const) {
      const dir = trial(1);
      if (damage === 'empty') writeFileSync(join(dir, 'releases/new/companion.mjs'), '');
      else rmSync(join(dir, 'releases/new/companion.mjs'));
      const r = guard(dir);
      expect(r.status).toBe(0);
      expect(link(dir, 'current')).toBe('releases/old');
      expect(existsSync(join(dir, 'trial'))).toBe(false);
      expect(JSON.parse(readFileSync(join(dir, 'update-last.json'), 'utf8'))).toMatchObject({
        result: 'rolled-back',
        name: 'old',
      });
      expect(r.stderr.toString()).toContain('no program file');
    }
  });

  it('goes back also where the trial is gone too, and where current points at nothing at all', () => {
    const empty = trial(null);
    writeFileSync(join(empty, 'releases/new/companion.mjs'), '');
    const dangling = trial(null);
    rmSync(join(dangling, 'releases/new'), { recursive: true });
    for (const dir of [empty, dangling]) {
      expect(guard(dir).status).toBe(0);
      expect(link(dir, 'current')).toBe('releases/old');
    }
  });

  it('leaves everything alone when the way back is no better: an empty previous, none, or the same version', () => {
    const emptyPrevious = trial(null);
    writeFileSync(join(emptyPrevious, 'releases/new/companion.mjs'), '');
    writeFileSync(join(emptyPrevious, 'releases/old/companion.mjs'), '');
    const none = trial(null);
    writeFileSync(join(none, 'releases/new/companion.mjs'), '');
    rmSync(join(none, 'previous'));
    const same = trial(null);
    writeFileSync(join(same, 'releases/new/companion.mjs'), '');
    rmSync(join(same, 'previous'));
    symlinkSync('releases/new', join(same, 'previous'));
    for (const dir of [emptyPrevious, none, same]) {
      expect(guard(dir).status).toBe(0);
      expect(link(dir, 'current')).toBe('releases/new');
      expect(existsSync(join(dir, 'update-last.json'))).toBe(false);
    }
  });

  it('does nothing when no update waits for its confirmation', () => {
    const dir = trial(null);
    const r = guard(dir);
    expect(r.status).toBe(0);
    expect(link(dir, 'current')).toBe('releases/new');
  });

  it('counts the starts of a new version, and goes back at the third without a confirmation', () => {
    const dir = trial(0);
    expect(guard(dir).status).toBe(0);
    expect(attempts(dir)).toBe('1');
    expect(link(dir, 'current')).toBe('releases/new');
    expect(guard(dir).status).toBe(0);
    expect(attempts(dir)).toBe('2');
    expect(link(dir, 'current')).toBe('releases/new');
    const third = guard(dir);
    expect(third.status).toBe(0);
    expect(link(dir, 'current')).toBe('releases/old');
    expect(existsSync(join(dir, 'trial'))).toBe(false);
    expect(existsSync(join(dir, 'current.tmp'))).toBe(false);
    expect(third.stderr.toString()).toContain('back to old');
    const last = JSON.parse(readFileSync(join(dir, 'update-last.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(last).toMatchObject({ result: 'rolled-back', name: 'old', from: 'new' });
    expect(typeof last.at).toBe('number');
    // and a start after that has nothing to do
    expect(guard(dir).status).toBe(0);
    expect(link(dir, 'current')).toBe('releases/old');
  });

  it('drops a trial that is not about what runs now', () => {
    const dir = trial(1, { new: 'something-else' });
    expect(guard(dir).status).toBe(0);
    expect(existsSync(join(dir, 'trial'))).toBe(false);
    expect(link(dir, 'current')).toBe('releases/new');
    // a trial with no name of a new version is none
    const nameless = trial(1, { new: '' });
    guard(nameless);
    expect(existsSync(join(nameless, 'trial'))).toBe(false);
  });

  it('does not go anywhere it was not told by a name of the alphabet – and still exits 0', () => {
    for (const bad of ['../../etc', 'a b', '$(touch /tmp/pwned)', '', 'x'.repeat(100)]) {
      const dir = trial(2, { previous: bad });
      const r = guard(dir);
      expect(r.status, bad).toBe(0);
      expect(link(dir, 'current'), bad).toBe('releases/new');
    }
    expect(existsSync('/tmp/pwned')).toBe(false);
  });

  it('does not go back to a previous that is a link or is missing, and leaves the trial for the operator', () => {
    const missing = trial(2, { previous: 'gone' });
    expect(guard(missing).status).toBe(0);
    expect(link(missing, 'current')).toBe('releases/new');
    expect(existsSync(join(missing, 'trial'))).toBe(true);
    const viaLink = trial(2);
    symlinkSync('/etc', join(viaLink, 'releases/evil'));
    writeFileSync(join(viaLink, 'trial'), 'new=new\nprevious=evil\nattempts=2\n');
    expect(guard(viaLink).status).toBe(0);
    expect(link(viaLink, 'current')).toBe('releases/new');
  });

  it('exits 0 whatever it is given: no directory, a directory that is not there, a trial that is garbage', () => {
    expect(guard(undefined).status).toBe(0);
    expect(guard('/does/not/exist').status).toBe(0);
    const dir = trial(null);
    writeFileSync(join(dir, 'trial'), '\u0000\u0001 garbage \n===\nattempts=abc\n');
    expect(guard(dir).status).toBe(0);
    // a counter that is no number counts as none: the trial is dropped (it names no new version)
    expect(existsSync(join(dir, 'trial'))).toBe(false);
    const readonly = trial(0);
    chmodSync(readonly, 0o555);
    expect(guard(readonly).status).toBe(0);
    chmodSync(readonly, 0o755);
  });
});

describe('what a half-way setup must not leave behind', () => {
  // `install` and `cp` that fail for one file: a full disk, as far as the script can tell
  const failing = (word: string) =>
    `install() { for a in "$@"; do [[ "$a" == *${word}* ]] && return 1; done; command install "$@"; }; ` +
    `cp() { for a in "$@"; do [[ "$a" == *${word}* ]] && return 1; done; command cp "$@"; }; `;
  // Called the way setup.sh calls it – `f || { …; exit 1; }` – where errexit is off inside the function: only the
  // copies that are checked by hand refuse. (Called plainly, set -e would hide an unchecked one.)
  const run = (script: string) =>
    spawnSync('bash', ['-c', `set -euo pipefail; source "${LIB}"; ${script}`], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    });

  it('refuses a release whose file could not be copied – whichever file it is – and moves no link', () => {
    for (const word of ['release.json', 'icon-192', 'lsm6dso.py']) {
      const dir = tmp();
      sh(`lr_install_release "${source(1)}" "${dir}"`);
      const before = [link(dir, 'current'), link(dir, 'previous')];
      execFileSync('sleep', ['1.1']);
      const r = run(`${failing(word)} lr_install_release "${source(2)}" "${dir}" || exit 3`);
      expect(r.status, word).not.toBe(0);
      expect([link(dir, 'current'), link(dir, 'previous')], word).toEqual(before);
    }
  });

  it('refuses a release whose program file came out empty', () => {
    const dir = tmp();
    const src = source(3);
    writeFileSync(join(src, 'companion.mjs'), '');
    expect(run(`lr_install_release "${src}" "${dir}" || exit 3`).status).not.toBe(0);
    expect(existsSync(join(dir, 'current'))).toBe(false);
  });

  it('keeps the legacy copy whole or not at all', () => {
    for (const word of ['lsm6dso.py', '/app']) {
      const dir = tmp();
      writeFileSync(join(dir, 'companion.mjs'), '// old\n');
      writeFileSync(join(dir, 'lsm6dso.py'), '# old\n');
      mkdirSync(join(dir, 'app'));
      writeFileSync(join(dir, 'app/index.html'), 'old');
      const r = run(`${failing(word)} lr_migrate_legacy "${dir}" || exit 3`);
      expect(r.status, word).not.toBe(0);
      expect(existsSync(join(dir, 'current')), word).toBe(false);
    }
  });

  it('gives the legacy release to the user it is for', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'companion.mjs'), '// old\n');
    const log = join(tmp(), 'chown.log');
    const r = run(
      `chown() { echo "$*" >>"${log}"; }; lr_migrate_legacy "${dir}" someone || exit 3; echo ok`,
    );
    expect(r.stdout.trim()).toBe('ok');
    expect(readFileSync(log, 'utf8')).toMatch(/^-R someone .*releases\/legacy-\d{14}\n$/);
  });

  it('does not fail a setup that worked because something could not be cleared away', () => {
    const dir = tmp();
    for (const n of ['a', 'b', 'c', 'd']) mkdirSync(join(dir, 'releases', n), { recursive: true });
    symlinkSync('releases/a', join(dir, 'current'));
    symlinkSync('releases/b', join(dir, 'previous'));
    // `rm` that never works – another owner's directory, say
    expect(run(`rm() { return 1; }; lr_prune "${dir}"; echo after`).stdout.trim()).toBe('after');
    const flat = tmp();
    writeFileSync(join(flat, 'companion.mjs'), 'x');
    mkdirSync(join(flat, 'app'));
    symlinkSync('releases/a', join(flat, 'current'));
    expect(run(`rm() { return 1; }; lr_remove_flat "${flat}"; echo after`).stdout.trim()).toBe(
      'after',
    );
  });
});

describe('the gate after every start of the companion', () => {
  const GATE = join(SCRIPTS, 'health-gate.sh');
  const run = (env: Record<string, string>) =>
    new Promise<{ code: number; err: string; ms: number }>((done) => {
      const began = Date.now();
      execFile(
        'bash',
        [GATE],
        { env: { PATH: process.env.PATH ?? '', ...env } },
        (error, _out, err) =>
          done({
            code: error ? ((error as { code?: number }).code ?? 1) : 0,
            err,
            ms: Date.now() - began,
          }),
      );
    });
  const withTrial = (on: boolean) => {
    const dir = tmp();
    if (on) writeFileSync(join(dir, 'trial'), 'new=a\nprevious=b\nattempts=1\n');
    return dir;
  };
  const serve = async (answer: boolean) => {
    const server = createServer((_req, res) => {
      res.statusCode = answer ? 200 : 500;
      res.end('{"ok":true}');
    });
    await new Promise<void>((go) => server.listen(0, '127.0.0.1', go));
    return { server, port: String((server.address() as { port: number }).port) };
  };

  it('does nothing without a trial – every normal start – and where it cannot look', async () => {
    // no trial: out at once, though nothing answers on that port
    const none = await run({
      LOWRIDER_DIR: withTrial(false),
      PORT: '1',
      LOWRIDER_GATE_SECONDS: '5',
    });
    expect(none).toMatchObject({ code: 0 });
    expect(none.ms).toBeLessThan(2000);
    expect((await run({ PORT: '1' })).code).toBe(0);
    expect((await run({ LOWRIDER_DIR: '/does/not/exist', PORT: '1' })).code).toBe(0);
  });

  it('lets a version on trial pass as soon as it answers', async () => {
    const { server, port } = await serve(true);
    try {
      const r = await run({
        LOWRIDER_DIR: withTrial(true),
        PORT: port,
        LOWRIDER_GATE_SECONDS: '5',
      });
      expect(r.code).toBe(0);
      expect(r.ms).toBeLessThan(2500);
    } finally {
      server.close();
    }
  });

  it('stops a version on trial that does not answer in time – and one that answers with an error', async () => {
    const quiet = await run({
      LOWRIDER_DIR: withTrial(true),
      PORT: '1',
      LOWRIDER_GATE_SECONDS: '2',
    });
    expect(quiet.code).toBe(1);
    expect(quiet.err).toContain('did not answer');
    const { server, port } = await serve(false);
    try {
      const broken = await run({
        LOWRIDER_DIR: withTrial(true),
        PORT: port,
        LOWRIDER_GATE_SECONDS: '2',
      });
      expect(broken.code).toBe(1);
    } finally {
      server.close();
    }
  });

  it('lets a trial pass that is over meanwhile (confirmed or taken away), and takes no nonsense for the port or the time', async () => {
    const dir = withTrial(true);
    const pending = run({ LOWRIDER_DIR: dir, PORT: '1', LOWRIDER_GATE_SECONDS: '20' });
    await new Promise((go) => setTimeout(go, 700));
    rmSync(join(dir, 'trial'));
    const r = await pending;
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(5000);
    // garbage falls back to the defaults (8080 – nobody answers there in the test; 45 s is too long to wait for here,
    // so the trial is taken away after a moment)
    const odd = withTrial(true);
    const garbage = run({ LOWRIDER_DIR: odd, PORT: 'x; id', LOWRIDER_GATE_SECONDS: 'forever' });
    await new Promise((go) => setTimeout(go, 1500));
    rmSync(join(odd, 'trial'));
    expect((await garbage).code).toBe(0);
  });

  it('keeps a deadline, not a count: a listener that takes the connection and never answers does not stretch it', async () => {
    // accepts and says nothing: each curl runs into its own timeout
    const { createServer: net } = await import('node:net');
    const quiet = net(() => {});
    await new Promise<void>((go) => quiet.listen(0, '127.0.0.1', go));
    const port = String((quiet.address() as { port: number }).port);
    try {
      const r = await run({
        LOWRIDER_DIR: withTrial(true),
        PORT: port,
        LOWRIDER_GATE_SECONDS: '4',
      });
      expect(r.code).toBe(1);
      // 4 s asked for; one round more at the most (a curl of 2 s), not four times as much
      expect(r.ms).toBeLessThan(8000);
    } finally {
      quiet.close();
    }
  }, 20_000);

  it('goes at once when the companion is gone already – systemd names its pid', async () => {
    const dead = spawnSync('bash', ['-c', 'sleep 0 & echo $!; wait'], { encoding: 'utf8' });
    const pid = dead.stdout.trim();
    const r = await run({
      LOWRIDER_DIR: withTrial(true),
      PORT: '1',
      LOWRIDER_GATE_SECONDS: '20',
      MAINPID: pid,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('has ended');
    expect(r.ms).toBeLessThan(5000);
    // a pid that lives does not end it
    const alive = await run({
      LOWRIDER_DIR: withTrial(true),
      PORT: '1',
      LOWRIDER_GATE_SECONDS: '2',
      MAINPID: String(process.pid),
    });
    expect(alive.err).toContain('did not answer');
  });

  it('is part of the unit text: after the start, with room for it', () => {
    const text = readFileSync(join(SCRIPTS, 'setup.sh'), 'utf8');
    expect(text).toContain('ExecStartPost=/usr/bin/bash $DIR/health-gate.sh');
    // room for the gate (30 s) and a stop (20 s) inside the start timeout
    expect(text).toMatch(/TimeoutStartSec=90/);
    expect(text).toContain('TimeoutStopSec=20');
    expect(text).toContain('install -o "$USER_NAME" -m 755 "$HERE/health-gate.sh"');
  });
});

describe('a version on trial', () => {
  const trialFile = (dir: string) => readFileSync(join(dir, 'trial'), 'utf8');

  it('is written by setup the way an update from the app writes it – and the guard acts on it', () => {
    const dir = tmp();
    sh(`lr_install_release "${source(1)}" "${dir}"`);
    execFileSync('sleep', ['1.1']);
    const out = sh(
      `lr_install_release "${source(2)}" "${dir}" && lr_write_trial "${dir}" "$LR_NEW" "$LR_BACK" && echo "$LR_NEW|$LR_BACK"`,
    );
    const [name, back] = out.trim().split('|');
    expect(trialFile(dir)).toBe(`new=${name}\nprevious=${back}\nattempts=0\n`);
    expect(existsSync(join(dir, 'trial.tmp'))).toBe(false);
    // the new version never confirms itself: the third start takes the way back
    for (const n of [1, 2, 3]) {
      spawnSync('bash', [GUARD], { env: { PATH: process.env.PATH ?? '', LOWRIDER_DIR: dir } });
      if (n < 3) expect(link(dir, 'current')).toBe(`releases/${name}`);
    }
    expect(link(dir, 'current')).toBe(`releases/${back}`);
    expect(existsSync(join(dir, 'trial'))).toBe(false);
  });

  it('is no way back itself: a setup run while it is still on trial keeps the version before it as previous', () => {
    const dir = tmp();
    sh(`lr_install_release "${source(1)}" "${dir}"`);
    const good = link(dir, 'current')!.replace('releases/', '');
    execFileSync('sleep', ['1.1']);
    // B is installed and on trial – and never confirms itself (the run was cut, say)
    const b = sh(
      `lr_install_release "${source(2)}" "${dir}" && lr_write_trial "${dir}" "$LR_NEW" "$LR_BACK"; echo "$LR_NEW"`,
    ).trim();
    execFileSync('sleep', ['1.1']);
    // the same zip again
    const out = sh(`lr_install_release "${source(2)}" "${dir}"; echo "$LR_OLD|$LR_BACK"`).trim();
    expect(out).toBe(`${b}|${good}`);
    expect(link(dir, 'previous')).toBe(`releases/${good}`);
  });

  it('takes the version that ran as previous once the trial is over, and does not read a trial it cannot trust', () => {
    const dir = tmp();
    sh(`lr_install_release "${source(1)}" "${dir}"`);
    const first = link(dir, 'current')!.replace('releases/', '');
    execFileSync('sleep', ['1.1']);
    writeFileSync(join(dir, 'trial'), 'new=../../etc\nprevious=../x\n');
    expect(sh(`lr_install_release "${source(2)}" "${dir}"; echo "$LR_BACK"`).trim()).toBe(first);
    expect(sh(`lr_trial_get "${dir}" new`).trim()).toBe('');
    writeFileSync(join(dir, 'trial'), 'new=a\nprevious=b\n');
    expect(sh(`lr_trial_get "${dir}" previous`).trim()).toBe('b');
    expect(sh(`lr_trial_get "${tmp()}" previous`).trim()).toBe('');
  });

  it('refuses names that are no release names', () => {
    const dir = tmp();
    for (const bad of ['../x', 'a b', '']) {
      const r = spawnSync('bash', ['-c', `source "${LIB}"; lr_write_trial "${dir}" "${bad}" ok`]);
      expect(r.status, bad).not.toBe(0);
    }
    expect(existsSync(join(dir, 'trial'))).toBe(false);
  });

  it('is over when the way back is taken by hand: going back drops it', () => {
    const dir = tmp();
    sh(`lr_install_release "${source(1)}" "${dir}"`);
    execFileSync('sleep', ['1.1']);
    sh(
      `lr_install_release "${source(2)}" "${dir}" && lr_write_trial "${dir}" "$LR_NEW" "$LR_BACK" && lr_go_back "${dir}"`,
    );
    expect(existsSync(join(dir, 'trial'))).toBe(false);
  });
});

describe('the env file, read as systemd reads it', () => {
  const get = (content: string, key: string) => {
    const file = join(tmp(), 'env');
    writeFileSync(file, content);
    // only the line end is taken off: a carriage return would show
    return sh(`lr_env_get "${file}" ${key}`).replace(/\n$/, '');
  };

  it('takes the last line of a key, one pair of quotes off, and no carriage return', () => {
    expect(get('PORT=8080\nPORT=9090\n', 'PORT')).toBe('9090');
    expect(get('PORT="9090"\n', 'PORT')).toBe('9090');
    expect(get("FLUIDNC_URL='ws://192.168.1.5:81'\n", 'FLUIDNC_URL')).toBe('ws://192.168.1.5:81');
    expect(get('PORT=9090\r\nHOST=x\r\n', 'PORT')).toBe('9090');
    expect(get('NOPE=1\n', 'PORT')).toBe('');
    // a lone quote is part of the value
    expect(get('X="abc\n', 'X')).toBe('"abc');
  });
});

describe('the address of the Jackpot', () => {
  const url = (typed: string) => {
    const r = spawnSync('bash', ['-c', `source "${LIB}"; lr_fluidnc_url "$1"`, 'x', typed], {
      encoding: 'utf8',
    });
    return r.status === 0 ? r.stdout.trim() : null;
  };

  it('becomes the address of the relay: host and port, FluidNC’s websocket port where none is given', () => {
    expect(url('192.168.178.40')).toBe('ws://192.168.178.40:81');
    expect(url(' 192.168.178.40 ')).toBe('ws://192.168.178.40:81');
    expect(url('jackpot.local')).toBe('ws://jackpot.local:81');
    expect(url('192.168.178.40:82')).toBe('ws://192.168.178.40:82');
    expect(url('ws://192.168.178.40:81')).toBe('ws://192.168.178.40:81');
    expect(url('ws://jackpot.local')).toBe('ws://jackpot.local:81');
    expect(url('ws://jackpot.local:81/')).toBe('ws://jackpot.local:81/');
  });

  it('is refused where it is no address – an empty one above all: ws://:81 would be kept for good', () => {
    for (const bad of [
      'ws://-h:81',
      '--force',
      '',
      '   ',
      'ws://',
      'ws://:81',
      ':81',
      '192.168.178.4O!',
      'a b c',
      'http://x:81',
      'ws://x:y',
      'ws://x:1234567',
      '$(id)',
      'x;y',
    ]) {
      expect(url(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('is asked again by setup.sh, and an answer that never comes ends it before anything is changed', async () => {
    const { execFile } = await import('node:child_process');
    const { homedir, userInfo } = await import('node:os');
    const dir = tmp();
    const here = join(dir, 'pi');
    mkdirSync(here);
    for (const f of ['setup.sh', 'lib.sh', 'guard.sh', 'health-gate.sh']) {
      writeFileSync(join(here, f), readFileSync(join(SCRIPTS, f)));
    }
    for (const f of ['companion.mjs', 'lowrider-control.html', 'lsm6dso.py'])
      writeFileSync(join(here, f), 'x');
    const before = existsSync(join(homedir(), 'lowrider'));
    // the stored address is the broken one an earlier run kept; nobody answers the question (no terminal)
    for (const stored of ['', 'FLUIDNC_URL=ws://:81\n']) {
      const envFile = join(dir, 'lowrider.env');
      writeFileSync(envFile, `PORT=1\n${stored}`);
      const r = await new Promise<{ code: number; err: string }>((done) => {
        const child = execFile(
          'bash',
          [join(here, 'setup.sh')],
          {
            env: {
              PATH: process.env.PATH ?? '',
              USER: userInfo().username,
              LOWRIDER_ENV_FILE: envFile,
            },
          },
          (error, _out, err) =>
            done({ code: error ? ((error as { code?: number }).code ?? 1) : 0, err }),
        );
        child.stdin?.end();
      });
      expect(r.code, stored).toBe(1);
      expect(r.err, stored).toContain('No address of the Jackpot');
      expect(existsSync(join(homedir(), 'lowrider'))).toBe(before);
    }
  });
});

describe('update-pi.bat, read as text (cmd.exe is not here – what can be held, is held)', () => {
  const bat = readFileSync(join(SCRIPTS, 'update-pi.bat'), 'utf8');
  const lines = bat.split('\n');

  it('is plain ASCII and starts quiet', () => {
    expect(/[^\x00-\x7f]/.test(bat)).toBe(false);
    expect(bat.startsWith('@echo off')).toBe(true);
  });

  it('keeps no ")" unescaped inside a parenthesised block – cmd would end the block there', () => {
    let depth = 0;
    for (const [i, line] of lines.entries()) {
      const text = line.trim();
      if (depth > 0 && /^(echo|rem)\b/.test(text)) {
        expect(text.replace(/^echo\(/, 'echo ').replace(/\^\)/g, ''), `line ${i + 1}`).not.toMatch(
          /[()]/,
        );
      }
      if (text.endsWith('(')) depth++;
      else if (text === ')') depth--;
    }
    expect(depth).toBe(0);
  });

  it('does not keep the Jackpot address: the Pi keeps it, and an old value would overwrite what was changed there', () => {
    const write = bat.slice(bat.indexOf('> "%CONFIG%" ('));
    const block = write.slice(0, write.indexOf('\n)') + 2);
    expect(block).not.toContain('JACKPOT');
    expect(bat).not.toContain('set /p JACKPOT');
    // it goes to the Pi in the run in which it was typed, and in no other
    expect(bat).toMatch(/set "JACKPOT="\r?\n/);
    expect(bat).toContain('--fluidnc !JACKPOT!');
  });

  it('writes the settings file only after the copy has worked', () => {
    expect(bat.indexOf('> "%CONFIG%" (')).toBeGreaterThan(bat.indexOf('scp -r'));
    expect(bat.indexOf('> "%CONFIG%" (')).toBeLessThan(bat.indexOf('ssh -t'));
  });

  it('tells a lost ssh connection (exit 255) from a setup that failed', () => {
    expect(bat.indexOf('if errorlevel 255 goto :ssh_failed')).toBeGreaterThan(0);
    expect(bat.indexOf('if errorlevel 255')).toBeLessThan(
      bat.indexOf('if errorlevel 1 goto :setup_failed'),
    );
    expect(bat).toContain(':ssh_failed');
  });

  it('checks a word only by taking the allowed characters away – and does not substitute in an empty variable', () => {
    expect(bat).toContain('do if defined REST set "REST=!REST:%%C=!"');
    expect(bat).not.toMatch(/call :check_word "/);
    expect(bat).not.toMatch(/findstr/);
  });

  it('asks again on every failure that a new input can mend, through choice', () => {
    for (const label of [':bad_input', ':scp_failed', ':ssh_failed']) {
      const at = bat.indexOf(`\n${label}`);
      const next = bat.indexOf('\n:', at + 2);
      expect(bat.slice(at, next), label).toContain('goto :again');
    }
    expect(bat).toMatch(/choice \/c JN/);
  });
});

describe('what became of the new version after the restart (lr_settle)', () => {
  const settle = async (
    answer: () => boolean,
    setup: (dir: string) => void,
    args: { seconds: number; confirm?: number },
    during?: (dir: string) => void,
  ) => {
    const dir = tmp();
    mkdirSync(join(dir, 'releases/old'), { recursive: true });
    mkdirSync(join(dir, 'releases/new'));
    symlinkSync('releases/new', join(dir, 'current'));
    symlinkSync('releases/old', join(dir, 'previous'));
    setup(dir);
    const server = createServer((_req, res) => {
      res.statusCode = answer() ? 200 : 500;
      res.end('{}');
    });
    await new Promise<void>((go) => server.listen(0, '127.0.0.1', go));
    const { port } = server.address() as { port: number };
    const began = Date.now();
    try {
      const pending = new Promise<{ code: number; ms: number }>((done) =>
        execFile(
          'bash',
          [
            '-c',
            `set -uo pipefail; source "${LIB}"; lr_settle "${dir}" ${port} new ${args.seconds} ${args.confirm ?? 50}`,
          ],
          { env: { PATH: process.env.PATH ?? '' } },
          (error) =>
            done({
              code: error ? ((error as { code?: number }).code ?? 1) : 0,
              ms: Date.now() - began,
            }),
        ),
      );
      if (during) {
        await new Promise((go) => setTimeout(go, 1500));
        during(dir);
      }
      return await pending;
    } finally {
      server.close();
    }
  };
  const onTrial = (dir: string) =>
    writeFileSync(join(dir, 'trial'), 'new=new\nprevious=old\nattempts=1\n');

  it('is fine as soon as a version that was not on trial answers', async () => {
    const r = await settle(
      () => true,
      () => {},
      { seconds: 10 },
    );
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(2500);
  });

  it('waits for a version on trial to confirm itself – the trial goes away – and then is fine', async () => {
    const r = await settle(
      () => true,
      onTrial,
      { seconds: 20 },
      (dir) => rmSync(join(dir, 'trial')),
    );
    expect(r.code).toBe(0);
    expect(r.ms).toBeGreaterThan(1400);
    expect(r.ms).toBeLessThan(5000);
  });

  it('says the guard took it away when current is not the new version any more – also after it answered once', async () => {
    const r = await settle(
      () => true,
      onTrial,
      { seconds: 20 },
      (dir) => {
        rmSync(join(dir, 'current'));
        symlinkSync('releases/old', join(dir, 'current'));
      },
    );
    expect(r.code).toBe(1);
    expect(r.ms).toBeLessThan(6000);
  });

  it('is fine where a version on trial answers and the confirmation takes longer than it is willing to wait', async () => {
    const r = await settle(() => true, onTrial, { seconds: 20, confirm: 2 });
    expect(r.code).toBe(0);
    expect(r.ms).toBeGreaterThanOrEqual(2000);
    expect(r.ms).toBeLessThan(6000);
  });

  it('says nothing answered when nothing does – an error answer is none – within the time asked for', async () => {
    const r = await settle(
      () => false,
      () => {},
      { seconds: 3 },
    );
    expect(r.code).toBe(2);
    expect(r.ms).toBeGreaterThanOrEqual(2800);
    expect(r.ms).toBeLessThan(8000);
  });

  it('counts an answer that came late – and one that stopped again – as an answer', async () => {
    let at = 0;
    const r = await settle(
      () => at++ < 1,
      () => {},
      { seconds: 4 },
    );
    expect(r.code).toBe(0);
  });
});

describe('the port', () => {
  const port = (content: string | null) => {
    const file = join(tmp(), 'env');
    if (content !== null) writeFileSync(file, content);
    return sh(`lr_port "${file}"`).trim();
  };
  it('is the number in the env file, and 8080 where there is none or it is no number', () => {
    expect(port('PORT=9090\n')).toBe('9090');
    expect(port('PORT="9090"\n')).toBe('9090');
    expect(port('PORT=abc\n')).toBe('8080');
    expect(port('PORT=80 80\n')).toBe('8080');
    expect(port('PORT=123456\n')).toBe('8080');
    expect(port('')).toBe('8080');
    expect(port(null)).toBe('8080');
  });
});

describe('who is on the machine through the Pi', () => {
  const clients = async (health: () => string | null) => {
    const { createServer } = await import('node:http');
    const { execFile } = await import('node:child_process');
    const server = createServer((_req, res) => {
      const body = health();
      if (body === null) {
        res.statusCode = 500;
        res.end('no');
      } else res.end(body);
    });
    await new Promise<void>((go) => server.listen(0, '127.0.0.1', go));
    const { port } = server.address() as { port: number };
    try {
      return await new Promise<string>((done, fail) =>
        execFile(
          'bash',
          ['-c', `set -euo pipefail; source "${LIB}"; lr_relay_clients ${port}`],
          { env: { PATH: process.env.PATH ?? '' } },
          (error, out) => (error ? fail(error) : done(out.trim())),
        ),
      );
    } finally {
      server.close();
    }
  };

  it('reads the number of browsers from the health check – and 0 where it does not answer', async () => {
    expect(
      await clients(
        () =>
          '{"ok":true,"fluidnc":{"url":"ws://x","connected":true,"clients":2,"lastFailure":null}}',
      ),
    ).toBe('2');
    expect(await clients(() => '{"ok":true,"fluidnc":null}')).toBe('0');
    expect(await clients(() => null)).toBe('0');
  });
});

describe('setup.sh itself', () => {
  const text = readFileSync(join(SCRIPTS, 'setup.sh'), 'utf8');

  it('has no command substitution in a heredoc that the shell expands (a backtick runs as a command – as root, even)', () => {
    const bodies = [...text.matchAll(/<<UNIT\n([\s\S]*?)\nUNIT\n/g)].map((m) => m[1]!);
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const body of bodies) {
      expect(body).not.toContain('`');
      expect(body).not.toContain('$(');
    }
  });

  it('says it before anything is changed when a browser is on the machine through the Pi', async () => {
    const { createServer } = await import('node:http');
    const { execFile } = await import('node:child_process');
    const { homedir, userInfo } = await import('node:os');
    const dir = tmp();
    const here = join(dir, 'pi');
    mkdirSync(here);
    for (const f of ['setup.sh', 'lib.sh', 'guard.sh', 'health-gate.sh']) {
      writeFileSync(join(here, f), readFileSync(join(SCRIPTS, f)));
    }
    for (const f of ['companion.mjs', 'lowrider-control.html', 'lsm6dso.py'])
      writeFileSync(join(here, f), 'x');
    const server = createServer((_req, res) =>
      res.end(
        '{"ok":true,"fluidnc":{"url":"ws://x","connected":true,"clients":1,"lastFailure":null}}',
      ),
    );
    await new Promise<void>((go) => server.listen(0, '127.0.0.1', go));
    const { port } = server.address() as { port: number };
    const envFile = join(dir, 'lowrider.env');
    writeFileSync(envFile, `PORT=${port}\nFLUIDNC_URL=ws://192.168.1.5:81\n`);
    const before = existsSync(join(homedir(), 'lowrider'));
    try {
      const r = await new Promise<{ code: number | null; err: string }>((done) =>
        execFile(
          'bash',
          [join(here, 'setup.sh')],
          {
            env: {
              PATH: process.env.PATH ?? '',
              USER: userInfo().username,
              LOWRIDER_ENV_FILE: envFile,
            },
          },
          (error, _out, err) =>
            done({ code: error ? ((error as { code?: number }).code ?? 1) : 0, err }),
        ),
      );
      expect(r.code).toBe(1);
      expect(r.err).toContain('A browser is connected to the machine through the Pi');
      expect(r.err).toContain('--force');
      // nothing was set up: the packages step never began
      expect(existsSync(join(homedir(), 'lowrider'))).toBe(before);
    } finally {
      server.close();
    }
    expect(text).toContain('--force');
    expect(text.indexOf('lr_relay_clients "$PORT"')).toBeLessThan(
      text.indexOf('echo "== Packages"'),
    );
    expect(text.indexOf('lr_relay_clients "$PORT"')).toBeLessThan(
      text.indexOf('lr_install_release "$HERE"'),
    );
  });
});
