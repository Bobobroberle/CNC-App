import { execFile, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Store } from './db';
import { Recorder } from './recorder';
import { SensorHub, simulatedSample } from './sensors';
import { buildServer } from './server';

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
 *   and /snapshot). Recordings go to `recordings/` next to the database.
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
const app = await buildServer({
  store,
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
