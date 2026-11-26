import { create } from 'zustand';
import { downloadBlob } from '../lib/download';
import type { Frame } from '../lib/mosaic';
import {
  GAP_MS,
  packTrace,
  TraceRecorder,
  traceFileName,
  type TraceFrameKind,
} from '../lib/scanTrace';
import { useMachine } from './machine';
import type { CameraPicture } from './camera';

/**
 * The recording of scans (`lib/scanTrace.ts`): off unless asked for, and then it only *looks* – it hooks into
 * `scanArea` and moves nothing. While the camera runs it copies pixels and stamps and nothing else; the
 * pictures are encoded afterwards, a few at a time, so the page is not made late by what is measured.
 */

const KEY = 'lowrider-control.scanTrace';
/** Width of the dense series taken during a run, px (a texture is still there to register at this size) */
const DENSE_WIDTH = 320;
const DENSE_HEIGHT = 240;
/** Most dense pictures held raw per run: 77 kB each */
const DENSE_MAX = 400;

interface TraceStore {
  /** Whether scans are recorded (this device's choice, kept) */
  recording: boolean;
  setRecording(on: boolean): void;
  /** What has been recorded, for the panel */
  scans: number;
  bytes: number;
  /** Pictures still to be encoded */
  pending: number;
  save(): Promise<boolean>;
  discard(): void;
}

interface Waiting {
  kind: TraceFrameKind;
  name: string;
  t: number;
  scan: number;
  k: number;
  width: number;
  height: number;
  spindle?: { x: number; y: number };
  strip?: number;
  frame?: Frame;
  gray?: Uint8Array;
}

let recorder: TraceRecorder | null = null;
let active = false;
let off: (() => void) | null = null;
const waiting: Waiting[] = [];
let flushing: Promise<void> | null = null;
const counters: Record<string, number> = {};
let denseTaken = 0;

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const useScanTrace = create<TraceStore>((set, get) => ({
  recording: load(),
  scans: 0,
  bytes: 0,
  pending: 0,

  setRecording(on) {
    set({ recording: on });
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // a browser that keeps nothing: the choice holds until the page closes
    }
  },

  async save() {
    await flush();
    if (!recorder || recorder.snapshot().scans.length === 0) return false;
    const zip = packTrace(recorder.snapshot(), recorder.files);
    downloadBlob(
      traceFileName(new Date()),
      new Blob([zip as BlobPart], { type: 'application/zip' }),
    );
    return get().scans > 0;
  },

  discard() {
    recorder = null;
    active = false;
    waiting.length = 0;
    for (const k of Object.keys(counters)) delete counters[k];
    set({ scans: 0, bytes: 0, pending: 0 });
  },
}));

/** Whether a scan is being recorded right now. */
export const tracing = () => active && recorder !== null;

/** Starts a scan in the recording (the first one makes the recording). A no-op unless recording is on. */
export function traceBegin(
  meta: () => Record<string, unknown>,
  area: unknown,
  mode: string,
  options: Record<string, unknown>,
) {
  if (!useScanTrace.getState().recording) return;
  recorder ??= new TraceRecorder(() => performance.now(), meta());
  denseTaken = 0;
  const n = recorder.beginScan(area, mode, options);
  active = true;
  const rec = recorder;
  off?.();
  off = useMachine.subscribe((s, prev) => {
    if (s.status && s.status !== prev.status) rec.report(s.status.state, s.status.mpos);
  });
  rec.note('scan-start', { n });
}

/** Ends the scan; the pictures are encoded in the background. */
export function traceEnd(result: Record<string, unknown>) {
  if (!active || !recorder) return;
  recorder.note('scan-end', result);
  active = false;
  off?.();
  off = null;
  void flush();
}

export function traceNote(kind: string, data: Record<string, unknown> = {}) {
  if (!active) return;
  recorder?.note(kind, data);
  // the dense series is counted per run; a run's pictures are encoded as soon as it has ended (the machine is
  // at rest then), not left to pile up in memory until the scan is over
  if (kind === 'jog-send') denseTaken = 0;
  if (kind === 'jog-end') void flush();
}

export function traceStamp() {
  if (active) recorder?.stamp();
}

export function traceGap(ms: number) {
  if (active && ms > GAP_MS) recorder?.gap(ms);
}

/** The time on the recording's clock, or 0 when nothing is recorded. */
export const traceTime = () => (active && recorder ? recorder.t() : 0);

/** Keeps a picture as it was taken; the name it will have in the file (so events can point at it), or null. */
export function traceFrame(
  kind: Exclude<TraceFrameKind, 'dense'>,
  read: { frame: Frame; k: number },
  extra: { spindle?: { x: number; y: number }; strip?: number; t?: number } = {},
): string | null {
  if (!active || !recorder) return null;
  const name = nameFor(kind);
  waiting.push({
    kind,
    name,
    t: extra.t ?? recorder.t(),
    scan: recorder.scans,
    k: read.k,
    width: read.frame.width,
    height: read.frame.height,
    spindle: extra.spindle,
    strip: extra.strip,
    frame: read.frame,
  });
  syncPending();
  return name;
}

let denseCanvas: HTMLCanvasElement | null = null;

/** A small grey copy of the picture on the screen, for the dense series of a run (copying only). */
export function traceDense(el: CameraPicture) {
  if (!active || !recorder || denseTaken >= DENSE_MAX || typeof document === 'undefined') return;
  denseCanvas ??= document.createElement('canvas');
  denseCanvas.width = DENSE_WIDTH;
  denseCanvas.height = DENSE_HEIGHT;
  const ctx = denseCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  try {
    ctx.drawImage(el, 0, 0, DENSE_WIDTH, DENSE_HEIGHT);
    const rgba = ctx.getImageData(0, 0, DENSE_WIDTH, DENSE_HEIGHT).data;
    const gray = new Uint8Array(DENSE_WIDTH * DENSE_HEIGHT);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
      gray[j] = (rgba[i]! * 77 + rgba[i + 1]! * 150 + rgba[i + 2]! * 29) >> 8;
    }
    denseTaken += 1;
    waiting.push({
      kind: 'dense',
      name: nameFor('dense'),
      t: recorder.t(),
      scan: recorder.scans,
      k: 0,
      width: DENSE_WIDTH,
      height: DENSE_HEIGHT,
      gray,
    });
  } catch {
    // a picture that cannot be read: nothing is recorded of it
  }
}

function nameFor(kind: TraceFrameKind): string {
  counters[kind] = (counters[kind] ?? 0) + 1;
  return `${kind}/${String(counters[kind]).padStart(5, '0')}.jpg`;
}

function syncPending() {
  useScanTrace.setState({ pending: waiting.length });
}

/** Encodes what is waiting, a few pictures at a time. */
function flush(): Promise<void> {
  flushing ??= (async () => {
    try {
      while (waiting.length > 0 && recorder) {
        const w = waiting.shift()!;
        const bytes = await encode(w);
        if (bytes && recorder) {
          recorder.addFrame(
            {
              kind: w.kind,
              t: w.t,
              width: w.width,
              height: w.height,
              k: w.k,
              codec: 'jpeg',
              spindle: w.spindle,
              strip: w.strip,
            },
            bytes,
            w.name,
          );
        }
        useScanTrace.setState({
          pending: waiting.length,
          bytes: recorder?.bytes ?? 0,
          scans: recorder?.scans ?? 0,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      flushing = null;
      useScanTrace.setState({
        bytes: recorder?.bytes ?? 0,
        scans: recorder?.scans ?? 0,
        pending: waiting.length,
      });
    }
  })();
  return flushing;
}

let encodeCanvas: HTMLCanvasElement | null = null;

async function encode(w: Waiting): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  encodeCanvas ??= document.createElement('canvas');
  encodeCanvas.width = w.width;
  encodeCanvas.height = w.height;
  const ctx = encodeCanvas.getContext('2d');
  if (!ctx) return null;
  let rgba: Uint8ClampedArray<ArrayBuffer>;
  if (w.frame) {
    rgba = new Uint8ClampedArray(w.frame.data);
  } else {
    rgba = new Uint8ClampedArray(w.width * w.height * 4);
    for (let i = 0; i < w.gray!.length; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = w.gray![i]!;
      rgba[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(new ImageData(rgba, w.width, w.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    encodeCanvas!.toBlob(resolve, 'image/jpeg', w.kind === 'dense' ? 0.8 : 0.9),
  );
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
