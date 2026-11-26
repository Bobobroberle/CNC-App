/**
 * A recording of a scan for finding out what the camera really does: the pictures as they were taken, every
 * status report and every new picture with the time it arrived on the screen, when the jog went out and ended,
 * the pictures at rest, and what the app made of it all. Everything is raw – before the gain and the vignette –
 * so the same numbers can be worked through again, with other thresholds, away from the machine.
 *
 * One zip: `trace.json` (this file's `TraceFile`) and the pictures beside it. Pure: bytes in, bytes out; the
 * pictures are encoded (and decoded) elsewhere, the zip is `fflate`'s.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export const TRACE_FORMAT = 'lowrider-scan-trace';
export const TRACE_VERSION = 1;
/** What a recording may weigh; past it no more pictures are kept (the numbers are small and always kept) */
export const TRACE_MAX_BYTES = 40e6;
/** A picture on the screen later than this after the one before it is a stall of the page, worth knowing about */
export const GAP_MS = 30;

export type TraceFrameKind = 'rest' | 'anchor' | 'run' | 'dense';

/** The stamp the Pi put on a camera picture: its clock, the time in seconds in it, and the header it was read from */
export interface TraceStamp {
  domain: 'mono' | 'wall';
  t: number;
  source: string;
}

export interface TraceFrame {
  /** Name of the file in the zip */
  file: string;
  kind: TraceFrameKind;
  /** ms since the recording began: when the picture was taken from the screen (a run picture: first seen) */
  t: number;
  /** Which scan of the recording */
  scan: number;
  width: number;
  height: number;
  /** The factor by which the camera's picture was shrunk to this (1 = as it came) */
  k: number;
  /** 'jpeg', or 'rgba' for raw pixels (the tests – a JPEG cannot be decoded here) */
  codec: 'jpeg' | 'rgba';
  /** Where the machine reported itself (a picture at rest) */
  spindle?: { x: number; y: number };
  /** Which strip of the scan */
  strip?: number;
  /** The Pi's stamp of a picture of a run taken from the camera's own stream (its `t` is then when the page got it) */
  stamp?: TraceStamp;
}

export interface TraceEvent {
  t: number;
  scan: number;
  kind: string;
  [key: string]: unknown;
}

export interface TraceReport {
  t: number;
  state: string;
  mpos: [number, number, number];
  /** The Pi's clock when its relay received this report (ms) – there only where the relay stamps; older files have none */
  stamp?: { mono: number; wall: number };
}

export interface TraceFile {
  format: typeof TRACE_FORMAT;
  version: typeof TRACE_VERSION;
  /** When it began, ISO */
  createdAt: string;
  /** What the scans were made with: calibration, picture size, speed … (never an address or a login) */
  meta: Record<string, unknown>;
  scans: { n: number; t: number; area: unknown; mode: string; options: Record<string, unknown> }[];
  events: TraceEvent[];
  reports: TraceReport[];
  /** Every new picture the page saw while the camera ran (ms), also where no picture was kept */
  stamps: { t: number; scan: number }[];
  /** Pictures of the screen that came later than `GAP_MS` after the one before: [t, ms] */
  gaps: [number, number][];
  /**
   * Every picture kept from the camera server's own stream during a run: when the page got it (`t`, ms) and the Pi's
   * stamp. Both clocks of one picture, so that the lag and the scatter of each can be worked out. Absent in older files.
   */
  pictures?: { t: number; scan: number; stamp: TraceStamp }[];
  frames: TraceFrame[];
  /** Pictures left out for the size */
  dropped: number;
}

/** The clock of a recording: ms since it began. */
export class TraceRecorder {
  private readonly started: number;
  private scan = 0;
  private size = 0;
  private readonly file: TraceFile;
  readonly files = new Map<string, Uint8Array>();

  constructor(
    private readonly now: () => number,
    meta: Record<string, unknown>,
    private readonly cap = TRACE_MAX_BYTES,
    createdAt = new Date().toISOString(),
  ) {
    this.started = now();
    this.file = {
      format: TRACE_FORMAT,
      version: TRACE_VERSION,
      createdAt,
      meta,
      scans: [],
      events: [],
      reports: [],
      stamps: [],
      gaps: [],
      pictures: [],
      frames: [],
      dropped: 0,
    };
  }

  /** ms since the recording began */
  t(): number {
    return this.now() - this.started;
  }

  /** The recording's time of a moment on the page's clock (`performance.now()`, ms) */
  at(pageMs: number): number {
    return pageMs - this.started;
  }

  /**
   * Which clock the scans of the recording ran on (`meta.clock`): the first scan's, or `mixed` where a later one ran on
   * another – each scan names its own in its options as well.
   */
  setClock(kind: string) {
    const known = this.file.meta.clock;
    this.file.meta.clock = known === undefined || known === kind ? kind : 'mixed';
    const scan = this.file.scans[this.file.scans.length - 1];
    if (scan) scan.options = { ...scan.options, clock: kind };
  }

  get scans(): number {
    return this.scan;
  }

  get bytes(): number {
    return this.size;
  }

  beginScan(area: unknown, mode: string, options: Record<string, unknown> = {}): number {
    this.scan += 1;
    this.file.scans.push({ n: this.scan, t: this.t(), area, mode, options });
    return this.scan;
  }

  note(kind: string, data: Record<string, unknown> = {}) {
    this.file.events.push({ ...data, t: this.t(), scan: this.scan, kind });
  }

  report(state: string, mpos: readonly number[], stamp?: { mono: number; wall: number } | null) {
    this.file.reports.push({
      t: this.t(),
      state,
      mpos: [mpos[0] ?? 0, mpos[1] ?? 0, mpos[2] ?? 0],
      ...(stamp ? { stamp: { mono: stamp.mono, wall: stamp.wall } } : {}),
    });
  }

  /** A picture of the camera server's stream with the stamp the Pi gave it, and when the page (`pageMs`) got it. */
  picture(pageMs: number, stamp: TraceStamp) {
    this.file.pictures ??= [];
    this.file.pictures.push({ t: this.at(pageMs), scan: this.scan, stamp: { ...stamp } });
  }

  stamp() {
    this.file.stamps.push({ t: this.t(), scan: this.scan });
  }

  gap(ms: number) {
    this.file.gaps.push([this.t(), Math.round(ms)]);
  }

  /** Keeps a picture; false (and counted) where the recording is full. */
  addFrame(info: Omit<TraceFrame, 'file' | 'scan'>, bytes: Uint8Array, name?: string): boolean {
    if (this.size + bytes.length > this.cap) {
      this.file.dropped += 1;
      return false;
    }
    const n = this.file.frames.filter((f) => f.kind === info.kind).length + 1;
    const file =
      name ??
      `${info.kind}/${String(n).padStart(5, '0')}.${info.codec === 'jpeg' ? 'jpg' : 'rgba'}`;
    this.file.frames.push({ ...info, file, scan: this.scan });
    this.files.set(file, bytes);
    this.size += bytes.length;
    return true;
  }

  /** The file as it stands. */
  snapshot(): TraceFile {
    return this.file;
  }
}

/** The zip: `trace.json` and the pictures, stored as they are (a JPEG does not shrink). */
export function packTrace(file: TraceFile, files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = { 'trace.json': strToU8(JSON.stringify(file)) };
  for (const [name, bytes] of files) entries[name] = bytes;
  return zipSync(entries, { level: 0 });
}

/** What `packTrace` made, or null for anything else. */
export function unpackTrace(
  bytes: Uint8Array,
): { file: TraceFile; files: Map<string, Uint8Array> } | null {
  try {
    const entries = unzipSync(bytes);
    const json = entries['trace.json'];
    if (!json) return null;
    const file = JSON.parse(strFromU8(json)) as TraceFile;
    if (file.format !== TRACE_FORMAT || file.version !== TRACE_VERSION) return null;
    const files = new Map<string, Uint8Array>();
    for (const [name, data] of Object.entries(entries))
      if (name !== 'trace.json') files.set(name, data);
    return { file, files };
  } catch {
    return null;
  }
}

/** `lowrider-scan-20261126-143015.zip` – the day and time on the device, as the diagnostic report's. */
export function traceFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `lowrider-scan-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.zip`;
}
