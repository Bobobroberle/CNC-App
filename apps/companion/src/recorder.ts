/**
 * Records the tool camera during a job on the companion, so the recording
 * does not depend on a tablet staying awake: a timelapse (one snapshot every
 * N seconds, made into an MP4 at the end), a video (ffmpeg reads the MJPEG
 * stream and writes fragmented MP4, which stays playable after a power loss)
 * or both. Every outside effect is injected for tests.
 */
import { join } from 'node:path';

export type RecordingMode = 'timelapse' | 'video' | 'both';
export type RecordingState = 'recording' | 'encoding' | 'done' | 'failed';
export type StopReason = 'app' | 'idle' | 'max-duration' | 'disk' | 'interrupted' | 'error';

export interface RecordingFile {
  name: string;
  size: number;
}

export interface RecordingMeta {
  id: string;
  jobName: string;
  mode: RecordingMode;
  intervalSeconds: number;
  safeHeightOnly: boolean;
  /** Work Z at or above which a safe-height picture is taken */
  safeZ: number | null;
  startedAt: number;
  endedAt: number | null;
  state: RecordingState;
  stopReason: StopReason | null;
  frames: number;
  video: RecordingFile | null;
  timelapse: RecordingFile | null;
  error: string | null;
}

export interface StartRequest {
  mode: RecordingMode;
  intervalSeconds: number;
  jobName: string;
  safeHeightOnly: boolean;
  safeZ: number | null;
}

export interface Capabilities {
  ffmpeg: boolean;
  /** Raspberry Pi hardware H.264 encoder available */
  hwEncoder: boolean;
  /** The companion sees FluidNC status reports (relay): auto stop and safe height */
  observe: boolean;
}

/** A running ffmpeg. */
export interface Child {
  kill(signal: 'SIGINT' | 'SIGKILL'): void;
  onExit(cb: (code: number | null) => void): void;
}

export interface FileSystem {
  mkdir(path: string): Promise<void>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  readFile(path: string): Promise<string>;
  readdir(path: string): Promise<string[]>;
  rm(path: string): Promise<void>;
  size(path: string): Promise<number | null>;
  freeBytes(path: string): Promise<number>;
}

/** FluidNC status reports as seen through the relay. */
export interface Observer {
  readonly connected: boolean;
  /** Receives every text message from FluidNC; returns an unsubscribe function */
  listen(onText: (text: string) => void): () => void;
  send(text: string): void;
}

export interface RecorderDeps {
  /** Root directory of all recordings */
  dir: string;
  snapshotUrl: string;
  streamUrl: string;
  fetch: typeof fetch;
  /** Runs a command to its end */
  run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
  /** Starts a long-running command */
  spawn(cmd: string, args: string[]): Child;
  fs: FileSystem;
  now(): number;
  every(ms: number, fn: () => void): () => void;
  wait(ms: number): Promise<void>;
  /** Refuse to start / stop below this much free space, bytes */
  minFreeBytes?: number;
  maxDurationMs?: number;
  /** Video frame rate, fps */
  videoFps?: number;
}

export class RecorderError extends Error {
  constructor(
    readonly code: 'no-ffmpeg' | 'already-recording' | 'disk-full' | 'not-recording',
    message = code,
  ) {
    super(message);
  }
}

export const MIN_FREE_BYTES = 1e9;
export const MAX_DURATION_MS = 8 * 3600 * 1000;
/** Machine back to Idle this long after it ran: the job is over */
export const IDLE_STOP_MS = 10_000;
const DISK_CHECK_MS = 30_000;
const STATUS_POLL_MS = 1000;
/** A hardware encoder that fails does so within this time */
const ENCODER_PROBE_MS = 4000;
const TIMELAPSE_FPS = 12;

export interface StatusReport {
  state: string;
  /** Work Z if known */
  workZ: number | null;
}

/**
 * Parses FluidNC status reports out of a text message. `wco` keeps the last
 * work offset between calls (FluidNC sends WCO only every few reports).
 */
export function parseStatus(text: string, wco: { z: number | null }): StatusReport[] {
  const out: StatusReport[] = [];
  for (const m of text.matchAll(/<([^>|]+)((?:\|[^>]*)?)>/g)) {
    const state = m[1]!.split(':')[0]!;
    const fields = new Map<string, string>();
    for (const part of m[2]!.split('|').slice(1)) {
      const i = part.indexOf(':');
      if (i > 0) fields.set(part.slice(0, i), part.slice(i + 1));
    }
    const z = (key: string) => {
      const v = fields.get(key)?.split(',')[2];
      const n = v === undefined ? NaN : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const w = z('WCO');
    if (w !== null) wco.z = w;
    const wpos = z('WPos');
    const mpos = z('MPos');
    const workZ = wpos ?? (mpos !== null && wco.z !== null ? mpos - wco.z : null);
    out.push({ state, workZ });
  }
  return out;
}

export function validateStart(body: unknown): StartRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.mode !== 'timelapse' && b.mode !== 'video' && b.mode !== 'both') return null;
  const interval = b.intervalSeconds ?? 5;
  if (typeof interval !== 'number' || !(interval >= 1 && interval <= 600)) return null;
  const jobName = typeof b.jobName === 'string' ? b.jobName.slice(0, 200) : '';
  const safeZ = typeof b.safeZ === 'number' && Number.isFinite(b.safeZ) ? b.safeZ : null;
  return {
    mode: b.mode,
    intervalSeconds: Math.round(interval),
    jobName,
    safeHeightOnly: b.safeHeightOnly === true && safeZ !== null,
    safeZ,
  };
}

const VIDEO_FILE = 'video.mp4';
const TIMELAPSE_FILE = 'timelapse.mp4';
const FRAMES = 'frames';
const META = 'meta.json';

interface Active {
  meta: RecordingMeta;
  stops: (() => void)[];
  video: Child | null;
  videoExit: Promise<number | null> | null;
  lastShot: number;
  status: StatusReport | null;
  ranAt: number | null;
  idleSince: number | null;
  stopping: boolean;
}

export class Recorder {
  private caps: Capabilities | null = null;
  private active: Active | null = null;
  private observer: Observer | null = null;
  private encoding: Promise<void> | null = null;

  constructor(private readonly deps: RecorderDeps) {}

  setObserver(observer: Observer | null): void {
    this.observer = observer;
  }

  /** What this companion can do (ffmpeg probed once). */
  async capabilities(): Promise<Capabilities> {
    if (!this.caps) {
      const r = await this.deps
        .run('ffmpeg', ['-hide_banner', '-encoders'])
        .catch(() => ({ code: -1, stdout: '', stderr: '' }));
      const ffmpeg = r.code === 0;
      this.caps = {
        ffmpeg,
        hwEncoder: ffmpeg && r.stdout.includes('h264_v4l2m2m'),
        observe: false,
      };
    }
    return { ...this.caps, observe: this.observer !== null };
  }

  get current(): RecordingMeta | null {
    return this.active ? { ...this.active.meta } : null;
  }

  /** Waits for a pending timelapse encode (tests, shutdown). */
  async settled(): Promise<void> {
    await this.encoding;
  }

  async list(): Promise<RecordingMeta[]> {
    const { fs, dir } = this.deps;
    await fs.mkdir(dir);
    const out: RecordingMeta[] = [];
    for (const id of await fs.readdir(dir)) {
      const meta = await this.readMeta(id);
      if (meta) out.push(meta);
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Path of a finished file, or null. */
  async file(
    id: string,
    kind: 'video' | 'timelapse',
  ): Promise<{ path: string; size: number } | null> {
    const meta = await this.readMeta(id);
    const f = meta?.[kind];
    if (!meta || !f) return null;
    const path = join(this.deps.dir, id, f.name);
    const size = await this.deps.fs.size(path);
    return size === null ? null : { path, size };
  }

  async remove(id: string): Promise<'ok' | 'active' | 'not-found'> {
    if (this.active?.meta.id === id) return 'active';
    if (!(await this.readMeta(id))) return 'not-found';
    await this.deps.fs.rm(join(this.deps.dir, id));
    return 'ok';
  }

  /**
   * Finishes recordings that never ended (power loss, crash): the video file
   * is kept as it is, timelapse pictures are counted and encoded now.
   */
  async recover(): Promise<void> {
    const { fs, dir } = this.deps;
    const pending: RecordingMeta[] = [];
    for (const meta of await this.list()) {
      if (meta.state !== 'recording' && meta.state !== 'encoding') continue;
      meta.stopReason ??= 'interrupted';
      meta.endedAt ??= meta.startedAt;
      if (meta.mode !== 'timelapse') {
        meta.video = { name: VIDEO_FILE, size: (await fs.size(this.path(meta, VIDEO_FILE))) ?? 0 };
      }
      if (meta.mode !== 'video') {
        const frames = await fs.readdir(join(dir, meta.id, FRAMES)).catch(() => []);
        meta.frames = frames.filter((f) => f.endsWith('.jpg')).length;
        meta.state = 'encoding';
        pending.push(meta);
      } else {
        meta.state = 'done';
      }
      await this.writeMeta(meta);
    }
    this.encoding = (async () => {
      for (const meta of pending) await this.encodeTimelapse(meta).catch(() => {});
    })();
  }

  async start(req: StartRequest): Promise<RecordingMeta> {
    const { deps } = this;
    if (this.active) throw new RecorderError('already-recording');
    const caps = await this.capabilities();
    if (!caps.ffmpeg) throw new RecorderError('no-ffmpeg');
    await deps.fs.mkdir(deps.dir);
    if ((await deps.fs.freeBytes(deps.dir)) < (deps.minFreeBytes ?? MIN_FREE_BYTES)) {
      throw new RecorderError('disk-full');
    }
    const now = deps.now();
    const id = `rec-${now.toString(36)}`;
    const meta: RecordingMeta = {
      id,
      jobName: req.jobName,
      mode: req.mode,
      intervalSeconds: req.intervalSeconds,
      safeHeightOnly: req.safeHeightOnly && caps.observe,
      safeZ: req.safeZ,
      startedAt: now,
      endedAt: null,
      state: 'recording',
      stopReason: null,
      frames: 0,
      video: null,
      timelapse: null,
      error: null,
    };
    await deps.fs.mkdir(join(deps.dir, id));
    if (req.mode !== 'video') await deps.fs.mkdir(join(deps.dir, id, FRAMES));
    const active: Active = {
      meta,
      stops: [],
      video: null,
      videoExit: null,
      lastShot: -Infinity,
      status: null,
      ranAt: null,
      idleSince: null,
      stopping: false,
    };
    this.active = active;
    await this.writeMeta(meta);
    if (req.mode !== 'timelapse') {
      await this.startVideo(active, caps);
      // Video only and no ffmpeg running: nothing would be recorded.
      if (!active.video && req.mode === 'video') return this.stop('error');
    }
    if (req.mode !== 'video') active.stops.push(deps.every(1000, () => void this.tick(active)));
    active.stops.push(deps.every(DISK_CHECK_MS, () => void this.checkDisk(active)));
    active.stops.push(
      deps.every(STATUS_POLL_MS, () => {
        if (deps.now() - meta.startedAt >= (deps.maxDurationMs ?? MAX_DURATION_MS)) {
          void this.stop('max-duration').catch(() => {});
        } else if (this.observer?.connected) {
          this.observer.send('?');
        }
      }),
    );
    if (this.observer) {
      const wco = { z: null as number | null };
      active.stops.push(
        this.observer.listen((text) => {
          for (const s of parseStatus(text, wco)) this.onStatus(active, s);
        }),
      );
    }
    return { ...meta };
  }

  /** Ends the recording; the timelapse is encoded afterwards (state `encoding`). */
  async stop(reason: StopReason = 'app'): Promise<RecordingMeta> {
    const active = this.active;
    if (!active || active.stopping) throw new RecorderError('not-recording');
    active.stopping = true;
    for (const s of active.stops) s();
    const { meta } = active;
    meta.endedAt = this.deps.now();
    meta.stopReason = reason;
    if (active.video) {
      active.video.kill('SIGINT');
      const exited = await Promise.race([
        active.videoExit!.then(() => true),
        this.deps.wait(10_000).then(() => false),
      ]);
      if (!exited) active.video.kill('SIGKILL');
      meta.video = {
        name: VIDEO_FILE,
        size: (await this.deps.fs.size(this.path(meta, VIDEO_FILE))) ?? 0,
      };
    }
    this.active = null;
    if (meta.mode !== 'video') {
      meta.state = 'encoding';
      await this.writeMeta(meta);
      // An encode that fails is recorded in its meta; never an unhandled rejection.
      this.encoding = this.encodeTimelapse(meta).catch(() => {});
    } else {
      meta.state = meta.error ? 'failed' : 'done';
      await this.writeMeta(meta);
    }
    return { ...meta };
  }

  private onStatus(active: Active, s: StatusReport) {
    active.status = s;
    const now = this.deps.now();
    if (s.state === 'Run' || s.state === 'Jog' || s.state === 'Hold') {
      active.ranAt ??= now;
      active.idleSince = null;
    } else if ((s.state === 'Idle' || s.state === 'Alarm') && active.ranAt !== null) {
      active.idleSince ??= now;
      if (now - active.idleSince >= IDLE_STOP_MS && !active.stopping) {
        void this.stop('idle').catch(() => {});
      }
    }
  }

  private async tick(active: Active) {
    const { meta } = active;
    const now = this.deps.now();
    if (active.stopping || now - active.lastShot < meta.intervalSeconds * 1000 - 50) return;
    if (meta.safeHeightOnly) {
      const z = active.status?.workZ;
      if (z === null || z === undefined || meta.safeZ === null || z < meta.safeZ - 0.5) return;
    }
    active.lastShot = now;
    try {
      const res = await this.deps.fetch(this.deps.snapshotUrl);
      if (!res.ok) return;
      const data = new Uint8Array(await res.arrayBuffer());
      if (active.stopping) return;
      const name = `${String(meta.frames + 1).padStart(6, '0')}.jpg`;
      meta.frames++;
      await this.deps.fs.writeFile(join(this.deps.dir, meta.id, FRAMES, name), data);
    } catch {
      // Camera unplugged for a moment: try again at the next interval.
    }
  }

  private async checkDisk(active: Active) {
    if (active.stopping) return;
    const free = await this.deps.fs.freeBytes(this.deps.dir);
    if (free < (this.deps.minFreeBytes ?? MIN_FREE_BYTES)) await this.stop('disk').catch(() => {});
  }

  private videoArgs(encoder: string, id: string): string[] {
    const fps = this.deps.videoFps ?? 15;
    const codec =
      encoder === 'libx264'
        ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26']
        : ['-c:v', 'h264_v4l2m2m', '-b:v', '4M'];
    return [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      this.deps.streamUrl,
      '-an',
      // An MJPEG stream has no timestamps (ffmpeg assumes 25 fps): stamp each frame with
      // the real time it arrived, then make an even frame rate of it.
      '-vf',
      `setpts=(RTCTIME-RTCSTART)/(TB*1000000),fps=${fps},format=yuv420p`,
      ...codec,
      '-g',
      String(fps * 2),
      '-f',
      'mp4',
      '-movflags',
      '+frag_keyframe+empty_moov+default_base_moof',
      '-y',
      join(this.deps.dir, id, VIDEO_FILE),
    ];
  }

  /** Starts ffmpeg; a hardware encoder that dies at once falls back to libx264. */
  private async startVideo(active: Active, caps: Capabilities) {
    const encoders = caps.hwEncoder ? ['h264_v4l2m2m', 'libx264'] : ['libx264'];
    for (const encoder of encoders) {
      const child = this.deps.spawn('ffmpeg', this.videoArgs(encoder, active.meta.id));
      const exit = new Promise<number | null>((resolve) => child.onExit(resolve));
      active.video = child;
      active.videoExit = exit;
      const early = await Promise.race([
        exit.then((code) => ({ code })),
        this.deps.wait(ENCODER_PROBE_MS).then(() => null),
      ]);
      if (!early) {
        active.meta.error = null;
        return;
      }
      active.video = null;
      active.videoExit = null;
      active.meta.error = `ffmpeg (${encoder}) exited with ${early.code}`;
    }
  }

  private async encodeTimelapse(meta: RecordingMeta) {
    const frames = join(this.deps.dir, meta.id, FRAMES);
    try {
      if (meta.frames === 0) {
        meta.state = meta.video ? 'done' : 'failed';
        meta.error ??= meta.video ? null : 'no-frames';
        await this.deps.fs.rm(frames);
        return;
      }
      const caps = await this.capabilities();
      const codec = caps.hwEncoder
        ? ['-c:v', 'h264_v4l2m2m', '-b:v', '6M']
        : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'];
      const out = this.path(meta, TIMELAPSE_FILE);
      let r = await this.deps.run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-framerate',
        String(TIMELAPSE_FPS),
        '-i',
        join(frames, '%06d.jpg'),
        '-vf',
        'format=yuv420p',
        ...codec,
        '-movflags',
        '+faststart',
        '-y',
        out,
      ]);
      if (r.code !== 0 && caps.hwEncoder) {
        r = await this.deps.run('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-framerate',
          String(TIMELAPSE_FPS),
          '-i',
          join(frames, '%06d.jpg'),
          '-vf',
          'format=yuv420p',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-movflags',
          '+faststart',
          '-y',
          out,
        ]);
      }
      if (r.code !== 0) {
        meta.state = 'failed';
        meta.error = r.stderr.trim().slice(0, 500) || `ffmpeg exited with ${r.code}`;
        return;
      }
      meta.timelapse = { name: TIMELAPSE_FILE, size: (await this.deps.fs.size(out)) ?? 0 };
      meta.state = 'done';
      await this.deps.fs.rm(frames);
    } finally {
      await this.writeMeta(meta);
    }
  }

  private path(meta: RecordingMeta, name: string): string {
    return join(this.deps.dir, meta.id, name);
  }

  private async readMeta(id: string): Promise<RecordingMeta | null> {
    if (!/^rec-[a-z0-9]+$/.test(id)) return null;
    if (this.active?.meta.id === id) return { ...this.active.meta };
    try {
      return JSON.parse(
        await this.deps.fs.readFile(join(this.deps.dir, id, META)),
      ) as RecordingMeta;
    } catch {
      return null;
    }
  }

  private writeMeta(meta: RecordingMeta): Promise<void> {
    return this.deps.fs.writeFile(this.path(meta, META), JSON.stringify(meta, null, 2));
  }
}
