import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readPackage, parseRelease, ReleaseError, type Package, type ReleaseInfo } from './release';
import { readZip, ZipError } from './zip';

/**
 * Updating the companion from the app. The new version comes as the zip of `release/pi`; it is checked, put
 * in a directory of its own beside the running one, tried (`companion.mjs --check` starts it in a mode that
 * binds nothing and opens no database), and only then does `current` – a symbolic link – move to it. The
 * companion restarts (systemd brings it back); until the new version has run for a while, `trial` is there
 * and `guard.sh` counts its starts and goes back to `previous` if it never confirms itself. See
 * `scripts/pi/lib.sh` and `guard.sh` for the shell side of the same layout.
 *
 * It needs the layout `setup.sh` makes (`releases/`, `current`) and a login: this class only does the work,
 * the server decides who may ask.
 */

export type UpdateErrorCode =
  | 'not-enabled'
  | 'bad-zip'
  | 'bad-release'
  | 'checksum-mismatch'
  | 'no-staged'
  | 'not-newer'
  | 'needs-setup'
  | 'busy'
  | 'backup-failed'
  | 'check-failed'
  | 'no-previous'
  | 'failed';

export class UpdateError extends Error {
  constructor(
    readonly code: UpdateErrorCode,
    readonly detail: string = '',
  ) {
    super(`${code}${detail ? `: ${detail}` : ''}`);
  }
}

export interface Running {
  /** The release directory the companion runs from (null: not from a release directory) */
  name: string | null;
  version: string;
  build: number;
  commit: string;
}

export interface UpdaterOptions {
  /** `~/lowrider` – where `releases/`, `current`, `previous`, `trial` and `setup-level` are */
  dir: string;
  running: Running;
  /** Starts the companion of a release directory in check mode: it must load, build its server and answer */
  check(releaseDir: string): Promise<{ ok: boolean; output: string; build?: number }>;
  /** A copy of the database made now (not today's, which may be hours old): false with a reason when it cannot */
  backup(): Promise<{ ok: boolean; reason?: string }>;
  /** Why an update must not happen now (a browser is on the machine through the relay, a recording runs), or null */
  busy(): string | null;
  /** Ends the process so that systemd starts the new version */
  restart(): void;
  now?: () => number;
  /** How long an uploaded package waits to be applied */
  stagedMs?: number;
}

export interface Staged {
  id: string;
  release: ReleaseInfo;
  sha256: string;
  files: number;
  at: number;
  /** Not newer than what runs (it may still be applied with `allowOlder`) */
  newer: boolean;
}

export interface LastUpdate {
  result: 'pending' | 'ok' | 'rolled-back' | 'rolled-back-by-hand';
  name?: string;
  from?: string;
  at: number;
  detail?: string;
}

export interface UpdateStatus {
  enabled: boolean;
  running: Running;
  /** What a release.json of the previous version says (null: there is none) */
  previous: { name: string; version: string; build: number; commit: string } | null;
  /** The level `setup.sh` wrote, null where it has not */
  setupLevel: number | null;
  last: LastUpdate | null;
  /** A new version waits for its confirmation (it has not run long enough yet) */
  trial: boolean;
  staged: Staged | null;
  busy: string | null;
}

const NAME = /^[A-Za-z0-9._-]{1,80}$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** `20261124150801` */
function stamp(at: number): string {
  const d = new Date(at);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export class Updater {
  private staged: { info: Staged; pkg: Package } | null = null;
  private working = false;
  private readonly now: () => number;

  constructor(private readonly options: UpdaterOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Ends the process so that systemd starts what `current` points at now. */
  restart(): void {
    this.options.restart();
  }

  private path(...parts: string[]) {
    return join(this.options.dir, ...parts);
  }

  /** The name of the release a link (`current`, `previous`) points at, if it is of the alphabet of a name. */
  private async linkName(link: string): Promise<string | null> {
    try {
      const target = await readlink(this.path(link));
      const name = target.split('/').filter(Boolean).at(-1) ?? '';
      return NAME.test(name) ? name : null;
    } catch {
      return null;
    }
  }

  /** Whether the layout of `setup.sh` is there: `current` is a link to a release directory. */
  async enabled(): Promise<boolean> {
    // A companion that does not run from a release directory could not confirm a new version: it would be taken
    // back at the third start without any word of why
    if (!this.options.running.name) return false;
    const name = await this.linkName('current');
    if (!name) return false;
    return stat(this.path('releases', name)).then(
      (s) => s.isDirectory(),
      () => false,
    );
  }

  private async setupLevel(): Promise<number | null> {
    try {
      const n = Number((await readFile(this.path('setup-level'), 'utf8')).trim());
      return Number.isSafeInteger(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  private async releaseOf(name: string): Promise<ReleaseInfo | null> {
    try {
      return parseRelease(await readFile(this.path('releases', name, 'release.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  async last(): Promise<LastUpdate | null> {
    try {
      const raw = JSON.parse(await readFile(this.path('update-last.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      const results = ['pending', 'ok', 'rolled-back', 'rolled-back-by-hand'];
      if (typeof raw.result !== 'string' || !results.includes(raw.result)) return null;
      if (typeof raw.at !== 'number' || !Number.isFinite(raw.at)) return null;
      const text = (v: unknown) => (typeof v === 'string' && NAME.test(v) ? v : undefined);
      return {
        result: raw.result as LastUpdate['result'],
        name: text(raw.name),
        from: text(raw.from),
        at: raw.at,
        detail: typeof raw.detail === 'string' ? raw.detail.slice(0, 200) : undefined,
      };
    } catch {
      return null;
    }
  }

  private async writeLast(last: LastUpdate): Promise<void> {
    await this.writeAtomic(this.path('update-last.json'), `${JSON.stringify(last)}\n`);
  }

  /** A file written whole and on the disk before it takes its name: a power cut leaves the old one or the new one. */
  private async writeAtomic(file: string, data: string | Uint8Array, mode = 0o644): Promise<void> {
    await this.writeSynced(`${file}.tmp`, data, mode);
    await rename(`${file}.tmp`, file);
    await this.syncDir(dirname(file));
  }

  /** The bytes on the disk, not only in the cache: a zero-length program after a power cut would leave nothing to go back with. */
  private async writeSynced(file: string, data: string | Uint8Array, mode: number): Promise<void> {
    const handle = await open(file, 'w', mode);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(file, mode);
  }

  /** The names in a directory on the disk (best effort: not every file system lets a directory be synced). */
  private async syncDir(dir: string): Promise<void> {
    try {
      const handle = await open(dir, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch {
      // nothing more can be done about it
    }
  }

  async status(): Promise<UpdateStatus> {
    const enabled = await this.enabled();
    const [currentName, previousName] = [
      await this.linkName('current'),
      await this.linkName('previous'),
    ];
    // After the guard has taken a version back, both links name the same release: that is no way back
    const previous =
      previousName && previousName !== currentName ? await this.releaseOf(previousName) : null;
    return {
      enabled,
      running: this.options.running,
      previous: previousName && previous ? { name: previousName, ...pick(previous) } : null,
      setupLevel: await this.setupLevel(),
      last: await this.last(),
      trial: await access(this.path('trial'), constants.F_OK).then(
        () => true,
        () => false,
      ),
      staged: this.fresh()?.info ?? null,
      busy: this.options.busy(),
    };
  }

  private fresh() {
    const ms = this.options.stagedMs ?? 30 * 60_000;
    if (this.staged && this.now() - this.staged.info.at > ms) this.staged = null;
    return this.staged;
  }

  discard(): void {
    this.staged = null;
  }

  /**
   * Takes in an uploaded zip: its checksum (the one given must match), its files and its release.json are
   * checked, and it waits to be applied. Nothing is written to the disk.
   */
  async stage(zip: Uint8Array, expectedSha256?: string): Promise<Staged> {
    if (!(await this.enabled())) throw new UpdateError('not-enabled');
    const sha256 = createHash('sha256').update(zip).digest('hex');
    if (expectedSha256 !== undefined) {
      // What the operator pastes: the number alone, in capitals, with colons – or the whole line of `sha256sum`
      // (`<hash>  lowrider-pi.zip`): the first run of 64 hex digits is the hash
      // A hash of its own – not a run of hex letters that happens to touch a label ("SHA-256: …", "Prüfsumme: …").
      // Grouped digits ("ab:cd:…", "ab cd …") are put together first, where no whole hash is there.
      const raw = expectedSha256.toLowerCase();
      const HASH = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/;
      const wanted = HASH.exec(raw)?.[0] ?? HASH.exec(raw.replace(/[\s:-]/g, ''))?.[0] ?? '';
      if (wanted !== sha256) throw new UpdateError('checksum-mismatch', sha256);
    }
    let pkg: Package;
    try {
      pkg = readPackage(readZip(zip));
    } catch (error) {
      if (error instanceof ZipError) throw new UpdateError('bad-zip', error.message);
      if (error instanceof ReleaseError) throw new UpdateError('bad-release', error.message);
      throw error;
    }
    const info: Staged = {
      id: randomBytes(9).toString('base64url'),
      release: pkg.release,
      sha256,
      files: pkg.files.size,
      at: this.now(),
      newer: pkg.release.build > this.options.running.build,
    };
    this.staged = { info, pkg };
    return info;
  }

  /**
   * Puts the staged version in place and has the companion restart. Refuses what could harm: a busy machine,
   * a version that is not newer (unless asked), one that needs more of the setup than the Pi has, a database
   * that could not be copied, a version that does not even start in check mode.
   */
  async apply(id: string, allowOlder = false): Promise<{ name: string; release: ReleaseInfo }> {
    if (this.working) throw new UpdateError('busy', 'an update is under way');
    this.working = true;
    try {
      const staged = this.fresh();
      if (!staged || staged.info.id !== id) throw new UpdateError('no-staged');
      if (!(await this.enabled())) throw new UpdateError('not-enabled');
      const { release } = staged.pkg;
      const level = await this.setupLevel();
      if (level === null || release.setupLevel > level) {
        throw new UpdateError('needs-setup', `${release.setupLevel} > ${level ?? 'none'}`);
      }
      if (!allowOlder && !staged.info.newer) throw new UpdateError('not-newer');
      const why = this.options.busy();
      if (why) throw new UpdateError('busy', why);

      // The database first: a version that goes wrong must find the data as it was
      const backup = await this.options.backup();
      if (!backup.ok) throw new UpdateError('backup-failed', backup.reason ?? '');

      const name = `b${release.build}-${stamp(this.now())}`;
      const tmp = this.path('releases', `.incoming-${randomBytes(4).toString('hex')}`);
      try {
        await this.write(staged.pkg, tmp);
        const checked = await this.options.check(tmp);
        if (!checked.ok) throw new UpdateError('check-failed', checked.output.slice(-600));
        // The program must be the build its release.json names: a mixed-up package starts as another version
        if (checked.build !== release.build) {
          throw new UpdateError(
            'check-failed',
            `the program is build ${checked.build}, release.json says ${release.build}`,
          );
        }
        await rename(tmp, this.path('releases', name));
        await this.syncDir(this.path('releases'));
      } catch (error) {
        await rm(tmp, { recursive: true, force: true });
        throw error;
      }

      // Re-read just before the swap: a busy machine can have appeared while the check ran
      const again = this.options.busy();
      if (again) {
        await rm(this.path('releases', name), { recursive: true, force: true });
        throw new UpdateError('busy', again);
      }
      const old = await this.linkName('current');
      // What `previous` becomes: the version that runs – or, where that never confirmed itself, the one before it
      // (a version that may be bad is no way back)
      const back = await this.wayBack(old);
      // The trial first (what a swap that is cut short leaves is a trial about a version that does not run: dropped)
      await this.writeTrial(name, back);
      if (back) await this.point('previous', back);
      await this.point('current', name);
      // From here the new version is the one that starts: nothing below may turn this into a failure (the restart
      // must follow), and the note of the update is only a note
      this.staged = null;
      await this.writeLast({
        result: 'pending',
        name,
        from: old ?? undefined,
        at: this.now(),
      }).catch(() => undefined);
      return { name, release };
    } catch (error) {
      if (error instanceof UpdateError) throw error;
      throw new UpdateError('failed', error instanceof Error ? error.message : String(error));
    } finally {
      this.working = false;
    }
  }

  /** The files of a package into a new release directory, at their fixed names. */
  private async write(pkg: Package, dir: string): Promise<void> {
    await mkdir(join(dir, 'app'), { recursive: true });
    for (const [name, data] of pkg.files) {
      await this.writeSynced(join(dir, name), data, name === 'lsm6dso.py' ? 0o755 : 0o644);
    }
    // The sensor script is no business of every release: where the package has none, the running one's stays
    if (!pkg.files.has('lsm6dso.py')) {
      const current = await this.linkName('current');
      if (current) {
        const old = await readFile(this.path('releases', current, 'lsm6dso.py')).catch(() => null);
        if (old) await this.writeSynced(join(dir, 'lsm6dso.py'), old, 0o755);
      }
    }
    for (const sub of ['app', '.']) await this.syncDir(join(dir, sub));
  }

  /** The release to go back to when `current` is replaced: `current` itself, unless it is still on trial. */
  private async wayBack(current: string | null): Promise<string | null> {
    if (!current) return null;
    const trial = await readFile(this.path('trial'), 'utf8').catch(() => '');
    if (/^new=(\S+)$/m.exec(trial)?.[1] !== current) return current;
    const before = /^previous=([A-Za-z0-9._-]{1,80})$/m.exec(trial)?.[1];
    if (!before) return current;
    const there = await stat(this.path('releases', before)).then(
      (s) => s.isDirectory(),
      () => false,
    );
    return there ? before : current;
  }

  private async writeTrial(name: string, previous: string | null): Promise<void> {
    const file = this.path('trial');
    const lines = [`new=${name}`, `previous=${previous ?? ''}`, 'attempts=0'];
    await this.writeAtomic(file, `${lines.join('\n')}\n`);
  }

  /** `<link>` → `releases/<name>`, atomically (a temporary link, renamed over the old one). The names come from `linkName` (the alphabet) or are made here. */
  private async point(link: string, name: string): Promise<void> {
    const tmp = this.path(`${link}.tmp`);
    await rm(tmp, { force: true });
    await symlink(`releases/${name}`, tmp);
    await rename(tmp, this.path(link));
    await this.syncDir(this.options.dir);
  }

  /**
   * By hand: `current` and `previous` change places (the one that ran before runs again; a second call goes forward
   * again). No trial: that version has run before. (Rolled back while it was still on trial, a version that never
   * confirmed itself runs without the guard when it is brought forward again: update-pi.bat is the way out of that.)
   */
  async rollback(): Promise<{ name: string }> {
    if (this.working) throw new UpdateError('busy', 'an update is under way');
    this.working = true;
    try {
      if (!(await this.enabled())) throw new UpdateError('not-enabled');
      const why = this.options.busy();
      if (why) throw new UpdateError('busy', why);
      const [current, previous] = [await this.linkName('current'), await this.linkName('previous')];
      if (!previous || !current || previous === current) throw new UpdateError('no-previous');
      const ok = await stat(this.path('releases', previous)).then(
        (s) => s.isDirectory(),
        () => false,
      );
      if (!ok) throw new UpdateError('no-previous');
      await rm(this.path('trial'), { force: true });
      // `current` first: a power cut between the two leaves the version that was asked for running
      await this.point('current', previous);
      await this.point('previous', current);
      // Only a note, and the links have moved: the restart must follow
      await this.writeLast({
        result: 'rolled-back-by-hand',
        name: previous,
        from: current,
        at: this.now(),
      }).catch(() => undefined);
      return { name: previous };
    } catch (error) {
      if (error instanceof UpdateError) throw error;
      throw new UpdateError('failed', error instanceof Error ? error.message : String(error));
    } finally {
      this.working = false;
    }
  }

  /**
   * Called by the running companion some time after its start (when it has proved to be up): a new version
   * that waits for its confirmation takes the trial away, says "ok", and old releases go.
   */
  async confirm(): Promise<void> {
    const own = this.options.running.name;
    if (!own) return;
    // An update under way writes the trial and the links, and its half-made directory is nobody's to clear: wait
    // for it (a refused one leaves this version's trial where it was – which is still ours to confirm)
    for (let waited = 0; this.working && waited < 20_000; waited++) await sleep(50);
    if (this.working) return;
    this.working = true;
    try {
      await this.confirmed(own);
    } finally {
      this.working = false;
    }
  }

  private async confirmed(own: string): Promise<void> {
    let trial = '';
    try {
      trial = await readFile(this.path('trial'), 'utf8');
    } catch {
      // no trial: nothing waits
    }
    const named = /^new=([A-Za-z0-9._-]{1,80})$/m.exec(trial)?.[1];
    if (named === own) {
      const last = await this.last();
      // The note is only a note: a disk that will not take it must not keep the version from being confirmed
      await this.writeLast({
        result: 'ok',
        name: own,
        from: last?.from,
        at: this.now(),
      }).catch(() => undefined);
      // The trial goes last: it is the one sign that the version is confirmed
      await rm(this.path('trial'), { force: true });
      await this.prune();
    }
  }

  /** Releases other than `current`, `previous` and the newest remaining one go; only directories of a release name. */
  async prune(): Promise<void> {
    const keep = new Set([await this.linkName('current'), await this.linkName('previous')]);
    const dir = this.path('releases');
    const entries = await readdir(dir).catch(() => [] as string[]);
    const others: { name: string; at: number }[] = [];
    for (const name of entries) {
      if (name.startsWith('.incoming-')) {
        await rm(join(dir, name), { recursive: true, force: true });
        continue;
      }
      if (!NAME.test(name) || keep.has(name)) continue;
      const s = await stat(join(dir, name)).catch(() => null);
      if (s?.isDirectory()) others.push({ name, at: s.mtimeMs });
    }
    others.sort((a, b) => b.at - a.at);
    for (const old of others.slice(1))
      await rm(join(dir, old.name), { recursive: true, force: true });
  }
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const pick = (r: ReleaseInfo) => ({ version: r.version, build: r.build, commit: r.commit });
