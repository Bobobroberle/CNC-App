import { mkdtempSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Child, RecorderDeps } from '../src/recorder';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/** A child process that runs until killed, or dies at once with `dies`. */
export class FakeChild implements Child {
  killed: string[] = [];
  private exits: ((code: number | null) => void)[] = [];
  constructor(dies: number | null = null) {
    if (dies !== null) queueMicrotask(() => this.exit(dies));
  }
  kill(signal: 'SIGINT' | 'SIGKILL') {
    this.killed.push(signal);
    if (signal === 'SIGINT') this.exit(255);
  }
  onExit(cb: (code: number | null) => void) {
    this.exits.push(cb);
  }
  exit(code: number | null) {
    for (const cb of this.exits) cb(code);
    this.exits = [];
  }
}

export interface Rig {
  deps: RecorderDeps;
  dir: string;
  advance(ms: number): Promise<void>;
  runs: string[][];
  spawns: string[][];
  children: FakeChild[];
  free: { bytes: number };
  /** Exit codes of the next encodes (default 0) */
  encodeCodes: number[];
  /** What each spawn does: null = runs, a number = dies with it */
  spawnDies: (number | null)[];
  fetchOk: { ok: boolean; throws?: boolean };
}

export function rig(options: { ffmpeg?: boolean; hw?: boolean } = {}): Rig {
  const dir = join(mkdtempSync(join(tmpdir(), 'rec-')), 'recordings');
  let now = 1_700_000_000_000;
  const timers = new Set<{ ms: number; next: number; fn: () => void }>();
  const r: Rig = {
    dir,
    runs: [],
    spawns: [],
    children: [],
    free: { bytes: 50e9 },
    encodeCodes: [],
    spawnDies: [],
    fetchOk: { ok: true },
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        let due: { ms: number; next: number; fn: () => void } | null = null;
        for (const t of timers) if (t.next <= end && (!due || t.next < due.next)) due = t;
        if (!due) break;
        now = due.next;
        due.next += due.ms;
        due.fn();
        // Let the async work of the handler finish.
        for (let i = 0; i < 20; i++) await new Promise((res) => setImmediate(res));
      }
      now = end;
    },
    deps: null as unknown as RecorderDeps,
  };
  r.deps = {
    dir,
    snapshotUrl: 'http://cam/snapshot',
    streamUrl: 'http://cam/stream',
    fetch: (async () => {
      if (r.fetchOk.throws) throw new Error('down');
      return new Response(r.fetchOk.ok ? JPEG : null, { status: r.fetchOk.ok ? 200 : 503 });
    }) as typeof fetch,
    run: async (cmd, args) => {
      r.runs.push([cmd, ...args]);
      if (args.includes('-encoders')) {
        if (options.ffmpeg === false) throw new Error('ENOENT');
        return {
          code: 0,
          stdout:
            options.hw === false ? ' V..... libx264' : ' V..... libx264\n V..... h264_v4l2m2m',
          stderr: '',
        };
      }
      const code = r.encodeCodes.shift() ?? 0;
      if (code === 0) await writeFile(args[args.length - 1]!, 'mp4');
      return { code, stdout: '', stderr: code ? 'encoder broke' : '' };
    },
    spawn: (cmd, args) => {
      r.spawns.push([cmd, ...args]);
      const dies = r.spawnDies.shift() ?? null;
      const child = new FakeChild(dies);
      if (dies === null) void writeFile(args[args.length - 1]!, 'video-bytes');
      r.children.push(child);
      return child;
    },
    fs: {
      mkdir: async (p) => void (await mkdir(p, { recursive: true })),
      writeFile: (p, d) => writeFile(p, d),
      readFile: (p) => readFile(p, 'utf8'),
      readdir: (p) => readdir(p),
      rm: (p) => rm(p, { recursive: true, force: true }),
      size: (p) =>
        stat(p).then(
          (s) => s.size,
          () => null,
        ),
      freeBytes: async () => r.free.bytes,
    },
    now: () => now,
    every: (ms, fn) => {
      const t = { ms, next: now + ms, fn };
      timers.add(t);
      return () => timers.delete(t);
    },
    wait: (ms) => new Promise((res) => setTimeout(res, ms / 1000)),
  };
  return r;
}
