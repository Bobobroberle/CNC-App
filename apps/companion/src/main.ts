import { execFile, spawn } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Auth } from './auth';
import { CameraControls, v4l2Runner } from './camera';
import {
  runBackup,
  runUpdateBackup,
  snapshotInChild,
  type BackupFs,
  type BackupStatus,
} from './backup';
import { Store } from './db';
import { Recorder } from './recorder';
import { FluidNCRelay } from './relay';
import { SensorHub, simulatedSample } from './sensors';
import { buildServer } from './server';
import { Updater } from './updater';
import { BUILD } from './version';

// `node companion.mjs --check` is what an update runs on a new version before it is put in place. It loads
// everything (a program that does not parse, or needs a newer Node, fails here), builds the server on a
// database in memory, asks it for its health and prints what it is – and binds no port, opens no file of
// the Pi, writes nothing outside a temporary folder. It must stay the first thing this file does.
if (process.argv.includes('--check')) {
  const folder = mkdtempSync(join(tmpdir(), 'lowrider-check-'));
  try {
    const store = new Store();
    const app = await buildServer({
      store,
      auth: new Auth({ store, codeFile: join(folder, 'pi-code.txt') }),
    });
    const health = (await app.inject('/api/health')).json() as { ok?: boolean; auth?: boolean };
    await app.close();
    store.close();
    if (health.ok !== true || health.auth !== true)
      throw new Error('the health check does not answer');
    rmSync(folder, { recursive: true, force: true });
    console.log(JSON.stringify({ ok: true, ...BUILD }));
    process.exit(0);
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  }
}

/**
 * Start: `node companion.mjs`. Settings via environment:
 *   PORT (8080), HOST (0.0.0.0), LOWRIDER_DB (./data/lowrider.db),
 *   LOWRIDER_APP (directory of the built app), FLUIDNC_URL (ws://fluidnc.local:81),
 *   CAMERA_URL (camera stream for the app; `:8081/stream` = port on this host),
 *   SENSOR_SIMULATOR=1 for simulated spindle load and vibration,
 *   LOWRIDER_SHUTDOWN=0 to disable "Pi herunterfahren" (POST /api/system/shutdown runs
 *   `sudo -n /usr/bin/systemctl poweroff`; scripts/pi/setup.sh installs the sudoers rule),
 *   LOWRIDER_RECORDINGS=0 to disable recording the camera during jobs (needs ffmpeg),
 *   RECORD_STREAM / RECORD_SNAPSHOT (ustreamer on this host: http://127.0.0.1:8081/stream
 *   and /snapshot). Recordings go to `recordings/` next to the database,
 *   LOWRIDER_DIR (`~/lowrider`: releases/, current, previous – what setup.sh makes) with LOWRIDER_UPDATE=1
 *   to allow the update from the app (LOWRIDER_CONFIRM_MS: how long a new version must run before the trial ends, 30000), LOWRIDER_CODE_FILE (the Pi code, `pi-code.txt` next to the database),
 *   CAMERA_DEVICE (`/dev/video0`) and LOWRIDER_CAMERA_CONTROLS=0 to switch off the camera's picture settings from the app
 *   (`/api/camera/controls`, needs `v4l2-ctl`; what was set last is kept in the database and put back at the start),
 *   LOWRIDER_BACKUP=0 to switch the daily backup of the database off, LOWRIDER_BACKUP_DIR
 *   (`backups/` next to the database – put it on a second medium, a USB stick: on the same card it
 *   guards against a damaged database, not against the card dying), LOWRIDER_BACKUP_KEEP (7).
 */
const env = process.env;
const dbPath = resolve(env.LOWRIDER_DB ?? 'data/lowrider.db');
mkdirSync(dirname(dbPath), { recursive: true });
const store = new Store(dbPath);
const sensors = new SensorHub(env.SENSOR_SIMULATOR === '1' ? 'simulator' : 'push');
const recorder =
  env.LOWRIDER_RECORDINGS === '0'
    ? undefined
    : new Recorder({
        dir: join(dirname(dbPath), 'recordings'),
        streamUrl: env.RECORD_STREAM ?? 'http://127.0.0.1:8081/stream',
        snapshotUrl: env.RECORD_SNAPSHOT ?? 'http://127.0.0.1:8081/snapshot',
        fetch,
        run: (cmd, args) =>
          new Promise((done) =>
            execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
              done({
                code: error ? (typeof error.code === 'number' ? error.code : -1) : 0,
                stdout,
                stderr,
              }),
            ),
          ),
        spawn: (cmd, args) => {
          const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
          let tail = '';
          child.stderr.on('data', (d: Buffer) => (tail = (tail + d.toString()).slice(-2000)));
          const exits: ((code: number | null) => void)[] = [];
          let exited = false;
          const finish = (code: number | null) => {
            if (exited) return;
            exited = true;
            if (code) app.log.warn({ code, stderr: tail }, 'ffmpeg exited');
            for (const cb of exits) cb(code);
          };
          child.on('exit', finish);
          child.on('error', () => finish(-1));
          return { kill: (signal) => child.kill(signal), onExit: (cb) => exits.push(cb) };
        },
        fs: {
          mkdir: async (path) => void (await mkdir(path, { recursive: true })),
          writeFile: (path, data) => writeFile(path, data),
          readFile: (path) => readFile(path, 'utf8'),
          readdir: (path) => readdir(path),
          rm: (path) => rm(path, { recursive: true, force: true }),
          size: (path) =>
            stat(path).then(
              (s) => s.size,
              () => null,
            ),
          freeBytes: async (path) => {
            const s = await statfs(path);
            return s.bavail * s.bsize;
          },
        },
        now: () => Date.now(),
        every: (ms, fn) => {
          const timer = setInterval(fn, ms);
          return () => clearInterval(timer);
        },
        wait: (ms) => new Promise((done) => setTimeout(done, ms)),
      });
void recorder?.recover();
// The daily backup of the database: when it starts, and a look every few hours (the Pi may run for weeks).
let backup: BackupStatus | null = null;
const backupDir = resolve(env.LOWRIDER_BACKUP_DIR ?? join(dirname(dbPath), 'backups'));
const dbSize = async () =>
  (await stat(dbPath)).size + ((await stat(`${dbPath}-wal`).catch(() => null))?.size ?? 0);
const backupFs: BackupFs = {
  // A folder that was asked for (`LOWRIDER_BACKUP_DIR`) lies on a second medium: with the medium
  // missing, making its whole path would put the copies on the card the database lies on – so
  // only the last folder is made, and a missing medium is a failure that the card says.
  mkdir: async (path) => {
    const asked = env.LOWRIDER_BACKUP_DIR !== undefined;
    await mkdir(path, { recursive: !asked }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
  },
  freeBytes: async (path) => {
    const s = await statfs(path);
    return s.bavail * s.bsize;
  },
  list: (path) => readdir(path).catch(() => []),
  rename,
  remove: (path) => rm(path, { force: true }),
};
const backupNow = async () => {
  backup = await runBackup({
    dir: backupDir,
    keep: Math.max(1, Number(env.LOWRIDER_BACKUP_KEEP ?? 7) || 7),
    now: Date.now(),
    dbSize,
    fs: backupFs,
    snapshot: (path) => snapshotInChild(dbPath, path),
  });
  if (backup.error) console.error(`backup failed: ${backup.error}`);
};
if (env.LOWRIDER_BACKUP !== '0') {
  void backupNow();
  setInterval(() => void backupNow(), 6 * 3_600_000).unref();
}
// The relay is held here as well: the update must not happen while a browser is on the machine through it.
const relay = env.FLUIDNC_URL ? new FluidNCRelay(env.FLUIDNC_URL) : undefined;
const auth = new Auth({
  store,
  codeFile: resolve(env.LOWRIDER_CODE_FILE ?? join(dirname(dbPath), 'pi-code.txt')),
});
// Update from the app: only with the layout setup.sh makes (this file lies in <LOWRIDER_DIR>/releases/<name>/)
const realpath = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
// The real path: `import.meta.url` is one, and a folder that is a link (moved to another disk, say) must still be found
const root = env.LOWRIDER_DIR ? realpath(resolve(env.LOWRIDER_DIR)) : null;
const here = dirname(fileURLToPath(import.meta.url));
const updater =
  root && env.LOWRIDER_UPDATE === '1'
    ? new Updater({
        dir: root,
        running: {
          name: dirname(here) === join(root, 'releases') ? basename(here) : null,
          version: BUILD.version,
          build: BUILD.build,
          commit: BUILD.commit,
        },
        check: (releaseDir) =>
          new Promise((done) =>
            execFile(
              process.execPath,
              [join(releaseDir, 'companion.mjs'), '--check'],
              // Nothing of the Pi's environment, and a folder of its own: a version that ignored `--check` and
              // started for real would find no database, no port 8080 free for it – and print nothing
              {
                cwd: releaseDir,
                timeout: 20_000,
                env: { PATH: env.PATH ?? '', PORT: '0' },
                maxBuffer: 1 << 20,
              },
              (error, stdout, stderr) => {
                const line = stdout.trim().split('\n').at(-1) ?? '';
                try {
                  const answer = JSON.parse(line) as { ok?: boolean; build?: number };
                  done({
                    ok: !error && answer.ok === true,
                    output: stderr || stdout,
                    build: answer.build,
                  });
                } catch {
                  done({ ok: false, output: stderr || stdout || (error?.message ?? 'no answer') });
                }
              },
            ),
          ),
        backup: async () => {
          const done = await runUpdateBackup({
            dir: backupDir,
            now: Date.now(),
            fs: backupFs,
            dbSize,
            snapshot: (path) => snapshotInChild(dbPath, path),
          });
          return done.ok ? { ok: true } : { ok: false, reason: done.reason };
        },
        busy: () =>
          relay && relay.browserCount > 0
            ? 'machine-connected'
            : recorder?.current
              ? 'recording'
              : null,
        // The links have moved: this process must go, so that systemd starts what `current` points at. A close that
        // hangs (a socket that does not let go) must not leave the old version running under the new links.
        restart: () => {
          setTimeout(() => process.exit(0), 8000).unref();
          void close();
        },
      })
    : undefined;
// The camera's picture settings: v4l2-ctl on the camera's device (the one ustreamer streams). Not at `--check`, which
// builds its server without it, and it touches nothing before a request or the re-apply after the start.
const camera =
  env.LOWRIDER_CAMERA_CONTROLS === '0'
    ? undefined
    : new CameraControls({
        device: env.CAMERA_DEVICE ?? '/dev/video0',
        run: v4l2Runner(),
        load: () => store.getSetting<unknown>('cameraControls', null),
        save: (values) => store.setSetting('cameraControls', values),
        log: (message) => app.log.info(message),
      });
const app = await buildServer({
  store,
  relay,
  auth,
  updater,
  camera,
  backup: () => (env.LOWRIDER_BACKUP === '0' ? null : backup),
  sensors,
  staticDir: env.LOWRIDER_APP ? resolve(env.LOWRIDER_APP) : undefined,
  fluidncUrl: env.FLUIDNC_URL,
  cameraUrl: env.CAMERA_URL,
  logger: true,
  recorder,
  shutdown:
    env.LOWRIDER_SHUTDOWN === '0'
      ? undefined
      : () =>
          new Promise<void>((done, fail) => {
            app.log.warn('shutdown requested from the app');
            execFile('sudo', ['-n', '/usr/bin/systemctl', 'poweroff'], (error, _out, stderr) => {
              if (!error) return done();
              app.log.error(error, 'shutdown failed');
              fail(new Error(stderr.trim() || error.message));
            });
          }),
});
if (env.SENSOR_SIMULATOR === '1') {
  const start = Date.now();
  setInterval(() => sensors.push(simulatedSample((Date.now() - start) / 1000)), 250);
}
const close = async () => {
  // Ends the video file cleanly; a timelapse is encoded at the next start (recover).
  if (recorder?.current) await recorder.stop('interrupted').catch(() => {});
  await app.close();
  store.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
await app.listen({ port: Number(env.PORT ?? 8080), host: env.HOST ?? '0.0.0.0' });
// The camera may have lost its settings (replug, reboot of the Pi): put the last ones back – never awaited, never blocking
// the start (a version on trial has 30 s to answer).
void camera?.restoreAtStart((ms) => new Promise((done) => setTimeout(done, ms).unref()));
// A version that came with an update proves itself by running: after half a minute up, the trial is over
// (until then `guard.sh` counts its starts and goes back to the previous version if it keeps failing).
setTimeout(
  () => void updater?.confirm().catch(() => {}),
  Number(env.LOWRIDER_CONFIRM_MS ?? 30_000) || 30_000,
).unref();
