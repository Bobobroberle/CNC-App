import { create } from 'zustand';
import { t } from '../i18n';
import type { Point } from '../lib/camera';
import { formatNumber } from '../lib/format';
import { COVERED, FlatField, Mosaic, type Frame, type MosaicChunk } from '../lib/mosaic';
import {
  boundsOf,
  CHUNK_PX,
  CROP,
  chunkKey,
  chunkRect,
  chunksFor,
  cropRect,
  frameCorners,
  imageTransform,
  MAP_PX_PER_MM,
  planScan,
  unionRect,
  visibleSize,
  type Rect,
} from '../lib/photomap';
import {
  estimateStops,
  estimateStrips,
  lagFromCorrections,
  moveSeconds,
  planStrips,
  PositionTrack,
  solveStripSteps,
  stripPoint,
  type Strip,
} from '../lib/strips';
import {
  cameraElement,
  crosshairPoint,
  FOCUS_TOLERANCE,
  focusError,
  pictureSize,
  type CameraPicture,
} from './camera';
import { useJob } from './job';
import { useMachine } from './machine';
import { settled, wait } from './settle';
import {
  traceBegin,
  traceDense,
  traceEnd,
  traceFrame,
  traceGap,
  traceNote,
  traceStamp,
  useScanTrace,
} from './scanTrace';
import { useWorkshop, type CameraSettings } from './workshop';

/** Why no picture can go onto the map right now (null = it can) */
export type MapBlocker = 'noCamera' | 'uncalibrated' | 'offHeight';

export interface ScanProgress {
  done: number;
  total: number;
  startedAt: number;
  /** What is counted: pictures taken one after the other, or strips run through */
  unit: 'pictures' | 'strips';
}

/** How an area is scanned: by running along strips without stopping, or picture by picture with a stop each */
export type ScanMode = 'strips' | 'stops';
/** How fast the strips are run: slow is sharp, fast is quick */
export type ScanTempo = 'gentle' | 'normal' | 'fast';

export interface ScanOptions {
  /** Whatever the setting says: stop for every picture – where the position of each must be as exact as it can be */
  precise?: boolean;
}

interface PhotoMapStore {
  /** Pictures laid down since the map was cleared */
  tiles: number;
  /** Bumps whenever the map changes, for redraws */
  version: number;
  /** Machine box covered by pictures */
  extent: Rect | null;
  scan: ScanProgress | null;
  /** How an area is scanned and how fast (this device's choice, kept) */
  mode: ScanMode;
  tempo: ScanTempo;
  /** A scan in strips was given up on this table: the next goes by stops until the choice is made again */
  stripsBad: boolean;
  setMode(mode: ScanMode): void;
  setTempo(tempo: ScanTempo): void;
  /** Lays the current picture onto the map; false without a usable picture */
  addTile(): boolean;
  /** Lays a given picture onto the map as if taken with the spindle at `spindle` (machine XY) */
  addPicture(el: CameraPicture, spindle: Point): boolean;
  clear(): void;
  /** Scans a machine box (crosshair positions) at camera height */
  scanArea(area: Rect, options?: ScanOptions): Promise<boolean>;
  cancelScan(): void;
}

/** Most map chunks kept (1 MB each); the least recently drawn go first */
export const MAX_CHUNKS = 48;
/** An MJPEG picture lags behind the machine by about this much, ms */
const FRAME_LAG_MS = 250;

interface Chunk {
  canvas: HTMLCanvasElement;
  cx: number;
  cy: number;
  used: number;
}

const chunks = new Map<string, Chunk>();
/** The map's pixels: frames blended, not cut and pasted. The chunk canvases above only show it. */
const mosaic = new Mosaic();
/** The camera's vignette, learned from its frames – a property of the lens, not of one map */
const flat = new FlatField();
let useCounter = 0;
let lastTileAt: Point | null = null;
let cancelled = false;

/** The map canvases, for drawing. */
export function mapChunks(): Iterable<Chunk> {
  return chunks.values();
}

function chunk(cx: number, cy: number): Chunk | null {
  const key = chunkKey(cx, cy);
  let c = chunks.get(key);
  if (!c) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = CHUNK_PX;
    canvas.height = CHUNK_PX;
    c = { canvas, cx, cy, used: 0 };
    chunks.set(key, c);
  }
  c.used = ++useCounter;
  return c;
}

function evict() {
  // the pixels first, the canvases that show them go with them
  for (const key of mosaic.evict(MAX_CHUNKS)) chunks.delete(key);
  while (chunks.size > MAX_CHUNKS) {
    let oldest: [string, Chunk] | null = null;
    for (const entry of chunks) if (!oldest || entry[1].used < oldest[1].used) oldest = entry;
    chunks.delete(oldest![0]);
  }
}

/** Widest frame the map is built from, px: the map has 4 px/mm, a camera frame usually many more. */
const FRAME_PX_MAX = 640;
/** Share of a frame that counts for the extent of the map: the weights fade out before the very edge */
const EXTENT_CROP = CROP;

let scratch: HTMLCanvasElement | null = null;

/** The camera's picture as pixels (shrunk to `FRAME_PX_MAX`) and the shrink factor, or null where it cannot be read. */
function readFrame(el: CameraPicture): { frame: Frame; k: number } | null {
  if (typeof document === 'undefined') return null;
  const { width, height } = pictureSize(el);
  if (!width || !height) return null;
  const k = Math.min(1, FRAME_PX_MAX / width);
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  scratch ??= document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  try {
    ctx.drawImage(el, 0, 0, w, h);
    return {
      frame: { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h },
      k: w / width,
    };
  } catch {
    // a stream from another origin that does not allow reading it: the picture can be drawn, not read
    return null;
  }
}

/** Shows the pixels of a chunk on its canvas. */
function show(c: MosaicChunk) {
  const view = chunk(c.cx, c.cy);
  const ctx = view?.canvas.getContext('2d');
  if (!view || !ctx) return;
  ctx.putImageData(new ImageData(c.rgba, CHUNK_PX, CHUNK_PX), 0, 0);
}

function spindle(): Point | null {
  const s = useMachine.getState().status;
  return s ? { x: s.mpos[0] ?? 0, y: s.mpos[1] ?? 0 } : null;
}

/** Most pixels of the map read as one picture (16 MB of grey values and as much again while reading) */
const MAX_PICTURE = 16e6;

/** The photo map as one grey picture, with where its pixels lie on the table. */
export interface MapPicture {
  gray: Uint8Array;
  /** 1 where a picture lies, 0 where the map is empty */
  valid: Uint8Array;
  width: number;
  height: number;
  /** Machine X of its left edge and Y of its top edge */
  left: number;
  top: number;
  pxPerMm: number;
}

/**
 * Everything the map shows as one grey picture (for finding things on it),
 * at the map's own resolution – or at half of it, if the map is very large.
 * Null without pictures.
 */
export function mapPicture(): MapPicture | null {
  const extent = usePhotoMap.getState().extent;
  if (!extent || chunks.size === 0 || typeof document === 'undefined') return null;
  // On the map's pixel raster, so no pixel is resampled.
  const left = Math.floor(extent.minX * MAP_PX_PER_MM) / MAP_PX_PER_MM;
  const top = Math.ceil(extent.maxY * MAP_PX_PER_MM) / MAP_PX_PER_MM;
  const w = extent.maxX - left;
  const h = top - extent.minY;
  let k = MAP_PX_PER_MM;
  while (w * h * k * k > MAX_PICTURE && k > 0.5) k /= 2;
  const width = Math.ceil(w * k);
  const height = Math.ceil(h * k);
  if (width < 1 || height < 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const side = (CHUNK_PX * k) / MAP_PX_PER_MM;
  for (const c of chunks.values()) {
    const r = chunkRect(c.cx, c.cy);
    ctx.drawImage(c.canvas, (r.minX - left) * k, (top - r.maxY) * k, side, side);
  }
  const data = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  const valid = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8;
    // The rim of a picture lying askew is half transparent: not a pixel to trust.
    valid[j] = data[i + 3] === 255 ? 1 : 0;
  }
  return { gray, valid, width, height, left, top, pxPerMm: k };
}

/**
 * Scale measured and camera height known. Setting the height alone leaves the
 * default scale, and pictures would land in the wrong place on the map.
 */
export function cameraCalibrated(c: Pick<CameraSettings, 'scaleCalibrated' | 'focusHeight'>) {
  return c.scaleCalibrated && c.focusHeight !== null;
}

/** Why the current picture cannot go onto the map, or null. */
export function mapBlocker(): MapBlocker | null {
  const el = cameraElement();
  if (!el || !pictureSize(el).width) return 'noCamera';
  if (!cameraCalibrated(useWorkshop.getState().settings.camera)) return 'uncalibrated';
  const off = focusError();
  if (off === null || Math.abs(off) > FOCUS_TOLERANCE) return 'offHeight';
  return null;
}

/** Picture element with a size, or null. */
function picture(): { el: CameraPicture; width: number; height: number } | null {
  const el = cameraElement();
  if (!el) return null;
  const { width, height } = pictureSize(el);
  return width && height ? { el, width, height } : null;
}

/** Usable frame size in mm, or null without a picture. */
export function visibleFrame(): { width: number; height: number } | null {
  const p = picture();
  return p ? visibleSize(useWorkshop.getState().settings.camera, p) : null;
}

/** Scan raster for a machine box with the current camera, or null without a picture. */
export function scanPoints(area: Rect): Point[] | null {
  const v = visibleFrame();
  return v ? planScan(area, v) : null;
}

/** Waits until the camera shows a frame taken after now (video), or the stream lag (MJPEG). */
export function freshFrame(el: CameraPicture): Promise<void> {
  const video = el as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };
  if (typeof HTMLVideoElement !== 'undefined' && el instanceof HTMLVideoElement) {
    if (video.requestVideoFrameCallback) {
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, 1000);
        video.requestVideoFrameCallback!(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
  return wait(FRAME_LAG_MS);
}

// ---------- laying a picture ----------

/** A camera picture read as pixels, shrunk by `k` */
type Read = { frame: Frame; k: number };

/** Lays a read picture onto the map as taken with the spindle at `sp` (machine XY). */
function lay(read: Read, sp: Point) {
  const cal = useWorkshop.getState().settings.camera;
  const { frame, k } = read;
  // Blended into the map: the weights of a frame fade out towards its edges, its brightness is matched to
  // what lies there already and the vignette of the lens is taken out.
  const m = imageTransform({ ...cal, pxPerMm: cal.pxPerMm * k }, sp, frame, {
    k: MAP_PX_PER_MM,
    left: 0,
    top: 0,
  });
  flat.add(frame);
  const map = flat.gainMap();
  const gain = mosaic.matchGain(frame, m, map);
  for (const c of mosaic.paste(frame, m, { gain, flat: map })) show(c);
  const box = boundsOf(
    frameCorners(cal, sp, { width: frame.width / k, height: frame.height / k }, EXTENT_CROP),
  );
  evict();
  usePhotoMap.setState((s) => ({
    tiles: s.tiles + 1,
    version: s.version + 1,
    extent: unionRect(s.extent, box),
  }));
}

// ---------- scanning ----------

const SCAN_KEY = 'lowrider-control.scan';
const DEFAULT_SCAN: { mode: ScanMode; tempo: ScanTempo } = { mode: 'stops', tempo: 'normal' };

function loadScan(): { mode: ScanMode; tempo: ScanTempo } {
  try {
    const v = JSON.parse(localStorage.getItem(SCAN_KEY) ?? 'null') as Partial<
      Record<'mode' | 'tempo', unknown>
    > | null;
    return {
      mode: v?.mode === 'stops' || v?.mode === 'strips' ? v.mode : DEFAULT_SCAN.mode,
      tempo:
        v?.tempo === 'gentle' || v?.tempo === 'normal' || v?.tempo === 'fast'
          ? v.tempo
          : DEFAULT_SCAN.tempo,
    };
  } catch {
    return DEFAULT_SCAN;
  }
}

function saveScan(mode: ScanMode, tempo: ScanTempo) {
  try {
    localStorage.setItem(SCAN_KEY, JSON.stringify({ mode, tempo }));
  } catch {
    // a browser that keeps nothing: the choice holds until the page closes
  }
}

/** mm/s a strip is run at: a share of the jog feed, never above what the axes can do */
export function stripSpeed(tempo: ScanTempo): number {
  const { profile } = useJob.getState();
  const share = tempo === 'gentle' ? 0.4 : tempo === 'fast' ? 1.4 : 0.8;
  const axes = profile.kinematics.axes;
  const cap = (Math.min(axes.x.maxRate, axes.y.maxRate) / 60) * 0.9;
  return Math.max(5, Math.min((profile.jogFeed.xy / 60) * share, cap));
}

/** mm/s² the machine accelerates at along X and Y, the lower of the two */
export function machineAccel(): number {
  const axes = useJob.getState().profile.kinematics.axes;
  return Math.max(1, Math.min(axes.x.acceleration, axes.y.acceleration));
}

/** Seconds a picture at rest costs: the settle time, the picture's lag and the report that says "stopped" */
function restSeconds(): number {
  return (useWorkshop.getState().settings.calibration.settleMs + FRAME_LAG_MS + 200) / 1000;
}

/** Feed of a scan by stops and of the hops between strips, mm/min */
function stopFeed(): number {
  return Math.min(2000, useJob.getState().profile.jogFeed.xy);
}

export interface ScanEstimate {
  /** Pictures, strips and the seconds each way takes; strips are null where the area is too short for them */
  stops: { count: number; seconds: number } | null;
  strips: { count: number; seconds: number } | null;
}

/** What a scan of a machine box takes by stops and in strips, by the same rules – so the two can be compared. */
export function scanEstimate(area: Rect, tempo: ScanTempo): ScanEstimate {
  const visible = visibleFrame();
  if (!visible) return { stops: null, strips: null };
  const start = crosshairPoint();
  const accel = machineAccel();
  const points = planScan(area, visible);
  const strips = planStrips(area, visible);
  const hop = stopFeed() / 60;
  return {
    stops: {
      count: points.length,
      seconds: estimateStops(points, start, { speed: hop, accel, restSeconds: restSeconds() }),
    },
    strips: strips
      ? {
          count: strips.length,
          seconds:
            estimateStrips(strips, start, {
              speed: stripSpeed(tempo),
              hopSpeed: hop,
              accel,
              restSeconds: restSeconds(),
            }) +
            // until the lag is known a short slow run comes first: its two pictures at rest, the run, the way back
            (lagKnown || usePhotoMap.getState().stripsBad
              ? 0
              : 2 * restSeconds() +
                moveSeconds(
                  Math.min(110, Math.abs(strips[0]!.to - strips[0]!.from)),
                  PROBE_SPEED,
                  accel,
                ) +
                moveSeconds(Math.min(110, Math.abs(strips[0]!.to - strips[0]!.from)), hop, accel)),
        }
      : null,
  };
}

/** Waits for the next status report, or null after `ms`. */
function nextStatus(ms: number) {
  return new Promise<NonNullable<ReturnType<typeof useMachine.getState>['status']> | null>(
    (resolve) => {
      let off = () => {};
      const timer = setTimeout(() => {
        off();
        resolve(null);
      }, ms);
      off = useMachine.subscribe((s, prev) => {
        if (!s.status || s.status === prev.status) return;
        clearTimeout(timer);
        off();
        resolve(s.status);
      });
    },
  );
}

/** Lets the screen and the buttons have their turn. */
const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Whether the picture has changed since the last look – a handful of pixels summed, cheap enough at every frame
 * of the screen. A camera's picture has noise: a new frame is a different sum even where nothing moves.
 */
class FrameWatch {
  private last = NaN;
  private readonly canvas: HTMLCanvasElement | null;

  constructor(private readonly el: CameraPicture) {
    this.canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    if (this.canvas) {
      this.canvas.width = 24;
      this.canvas.height = 18;
    }
  }

  changed(): boolean {
    const ctx = this.canvas?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    try {
      ctx.drawImage(this.el, 0, 0, 24, 18);
      const d = ctx.getImageData(0, 0, 24, 18).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4)
        sum += (d[i]! * 3 + d[i + 1]! * 5 + d[i + 2]! * 7) * (((i >> 2) % 7) + 1);
      const changed = sum !== this.last;
      this.last = sum;
      return changed;
    } catch {
      return false;
    }
  }
}

/** What the last scan did, for the tests and for finding out why a scan was slow or left gaps. */
export interface ScanStats {
  mode: ScanMode;
  strips: number;
  /** Pictures taken on the run, and how many of them could be put where they were taken */
  offered: number;
  placed: number;
  /** Pictures taken with a stop afterwards, for what the run left out */
  refilled: number;
  /** The lag of the pictures behind the reports, s, as learned */
  lag: number;
  seconds: number;
  /** The run was given up for what the pictures showed (too little to fit them by), the rest scanned by stops */
  gaveUp: boolean;
  /** Per strip: pictures taken, reached by the chain from the start and by the one from the end, placed */
  detail: {
    offered: number;
    forward: number;
    backward: number;
    placed: number;
    disagreement: number;
  }[];
}

let lastScan: ScanStats | null = null;
export const scanStats = () => lastScan;
(globalThis as { lowriderMap?: unknown }).lowriderMap = {
  stats: () => lastScan,
  picture: () => mapPicture(),
  store: () => usePhotoMap.getState(),
  trace: () => useScanTrace.getState(),
};

/** Pictures taken during a strip, every this share of the trusted length along it */
const STRIP_SPACING = 0.3;
const MAX_STRIP_PICTURES = 150;
/** Lag of a picture behind the status reports, s – learned from every strip (the first guess is MJPEG's) */
let stripLag = 0.3;
/**
 * Whether the lag has been measured on this camera. Until it has, the clock may be off by seconds × speed – on a table
 * that repeats itself (the precision plate, a grid of inserts) a search that wide finds the next dot as readily as the
 * right one – so the first strip of a scan runs slowly, where the clock's error is small, and measures it.
 */
let lagKnown = false;
/** mm/s of the strip that measures the lag: at this speed 0.3 s is 4 mm – less than half a dot of the plate */
const PROBE_SPEED = 12;

interface StripResult {
  placed: number;
  offered: number;
  forward: number;
  backward: number;
  disagreement: number;
}

type StripEnd = 'done' | 'cancelled' | 'lost' | 'held' | 'failed' | 'gaveUp';

/** Waits for a jog to end: at its target, ended by whoever pressed what, or never started. */
async function awaitJog(axis: 'x' | 'y', target: number, limitMs: number): Promise<StripEnd> {
  const index = axis === 'x' ? 0 : 1;
  const sent = performance.now();
  let moving = false;
  for (;;) {
    if (cancelled) {
      useMachine.getState().jogCancel();
      await settled({}, 4000);
      return 'cancelled';
    }
    const s = await nextStatus(1000);
    if (useMachine.getState().connection !== 'connected') return 'lost';
    if (!s) {
      if (performance.now() - sent > limitMs) return 'failed';
      continue;
    }
    if (s.state === 'Jog') {
      moving = true;
      if (performance.now() - sent > limitMs) {
        useMachine.getState().jogCancel();
        return 'failed';
      }
      continue;
    }
    if (s.state === 'Idle') {
      if (Math.abs((s.mpos[index] ?? 0) - target) < 0.5) return 'done';
      // Idle away from the target: ended by someone else – or the report is older than the jog
      if (moving || performance.now() - sent > 1500) return 'failed';
      continue;
    }
    return 'held';
  }
}

interface Rest {
  read: Read;
  spindle: Point;
  /** Where it is in the recording, if one is made */
  trace: string | null;
}

/** A picture at rest: after the settle time and the picture's lag, with where the machine reports itself. */
async function restPicture(): Promise<Rest | null> {
  await wait(useWorkshop.getState().settings.calibration.settleMs);
  const pic = picture();
  if (!pic) return null;
  await freshFrame(pic.el);
  const sp = spindle();
  const read = readFrame(pic.el);
  return sp && read
    ? { read, spindle: sp, trace: traceFrame('anchor', read, { spindle: sp }) }
    : null;
}

/** Puts the pictures of a strip where they were taken, and lays them down. */
async function solveAndLay(
  strip: Strip,
  a: Rest,
  b: Rest,
  taken: { read: Read; t: number; trace: string | null }[],
  track: PositionTrack,
  speed: number,
) {
  const cal = useWorkshop.getState().settings.camera;
  const alongOf = (r: Rest) =>
    strip.axis === 'x' ? r.spindle.x + cal.offsetX : r.spindle.y + cal.offsetY;
  const across = strip.axis === 'x' ? a.spindle.y + cal.offsetY : a.spindle.x + cal.offsetX;
  const frames = taken.flatMap((c) => {
    const fit = track.fit(c.t - stripLag);
    return fit
      ? [{ frame: c.read.frame, k: c.read.k, predicted: fit.position, speed: fit.speed }]
      : [];
  });
  const kept = taken.filter((c) => track.fit(c.t - stripLag));
  const steps = solveStripSteps(
    { frame: a.read.frame, k: a.read.k, along: alongOf(a) },
    { frame: b.read.frame, k: b.read.k, along: alongOf(b) },
    frames,
    {
      cal,
      axis: strip.axis,
      across,
      speed,
      flat: flat.gainMap(),
      // the first picture may be off by what the clock is off by: wide while the lag is a guess, narrow once measured
      firstSearchMm: 2 + (lagKnown ? 0.1 : 0.25) * speed,
    },
  );
  for (;;) {
    const next = steps.next();
    if (next.done) {
      const sol = next.value;
      traceNote('solved', {
        axis: strip.axis,
        across,
        speed,
        lag: stripLag,
        lagKnown,
        anchors: [
          { file: a.trace, along: alongOf(a) },
          { file: b.trace, along: alongOf(b) },
        ],
        frames: frames.map((f, i) => ({
          file: kept[i]!.trace,
          t: kept[i]!.t,
          predicted: f.predicted,
          speed: f.speed,
        })),
        along: sol.along,
        forward: sol.forward,
        backward: sol.backward,
        disagreement: sol.disagreement,
      });
      const at = (along: number): Point => {
        const c = stripPoint({ ...strip, across }, along);
        return { x: c.x - cal.offsetX, y: c.y - cal.offsetY };
      };
      const samples: { predicted: number; actual: number; speed: number }[] = [];
      // one picture at a time, the screen and the buttons (PAUSE, NOT-HALT) get their turn between them
      for (const [i, v] of sol.along.entries()) {
        if (v === null) continue;
        lay(kept[i]!.read, at(v));
        samples.push({ predicted: frames[i]!.predicted, actual: v, speed: frames[i]!.speed });
        await turn();
        if (cancelled) break;
      }
      lay(b.read, b.spindle);
      const lag = lagFromCorrections(stripLag, samples);
      if (lag !== null) {
        // the first measurement replaces the guess; later ones follow it
        stripLag = lagKnown ? 0.5 * stripLag + 0.5 * lag : lag;
        lagKnown = true;
      }
      return {
        placed: sol.placed,
        offered: frames.length,
        forward: sol.forward.filter((v) => v !== null).length,
        backward: sol.backward.filter((v) => v !== null).length,
        disagreement: sol.disagreement,
      };
    }
    await turn();
    if (cancelled)
      return { placed: 0, offered: frames.length, forward: 0, backward: 0, disagreement: 0 };
  }
}

/** What a recording of a scan is told about the camera and the machine (never an address or a login). */
function traceMeta(visible: { width: number; height: number }): Record<string, unknown> {
  const { settings } = useWorkshop.getState();
  const cal = settings.camera;
  const pic = picture();
  const { profile } = useJob.getState();
  const tempo = usePhotoMap.getState().tempo;
  return {
    app: 'LowRider Control',
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    camera: {
      offsetX: cal.offsetX,
      offsetY: cal.offsetY,
      pxPerMm: cal.pxPerMm,
      rotation: cal.rotation,
      focusHeight: cal.focusHeight,
      scaleCalibrated: cal.scaleCalibrated,
    },
    picture: pic ? { width: pic.width, height: pic.height } : null,
    frameMaxPx: FRAME_PX_MAX,
    visibleMm: visible,
    settleMs: settings.calibration.settleMs,
    jogFeedMmMin: profile.jogFeed.xy,
    accelMmS2: machineAccel(),
    tempo,
    stripSpeedMmS: stripSpeed(tempo),
    stripLagS: stripLag,
    lagKnown,
    viaCompanion: useMachine.getState().link.via !== null,
    probeSpeedMmS: PROBE_SPEED,
    densePx: [320, 240],
  };
}

/** Where the map has nothing inside a machine box (crosshair positions), on a grid of about 3 mm. */
function holesIn(area: Rect): Point[] {
  const out: Point[] = [];
  for (let y = area.minY + 0.2; y < area.maxY; y += 3) {
    for (let x = area.minX + 0.2; x < area.maxX; x += 3) {
      const p = mosaic.at(x * MAP_PX_PER_MM, -y * MAP_PX_PER_MM);
      if (!p || p.sum < COVERED) out.push({ x, y });
    }
  }
  return out;
}

/** A run whose pictures mostly could not be put anywhere: the table shows too little to fit them by */
const poor = (r: StripResult) => !keepGoing && r.offered >= 6 && r.placed < 0.5 * r.offered;
/** While a scan is recorded the run is not given up: the pictures of a table that fits badly are what is wanted */
let keepGoing = false;

/**
 * One strip: hop to its start, a picture at rest there, the run (a jog – it can be ended cleanly), a picture at
 * rest at its end. The pictures of the run are put where they were taken only once both pictures at rest are in
 * (`solveAndLay`, handed back as `work`: it goes on while the machine hops to the next strip).
 */
async function runStrip(
  strip: Strip,
  speed: number,
  hopFeed: number,
  visible: { width: number; height: number },
  previous: Promise<StripResult> | null,
): Promise<{ end: StripEnd; work: Promise<StripResult> | null; prior: StripResult | null }> {
  const { moveMachine, jogMachine } = useMachine.getState();
  const cal = useWorkshop.getState().settings.camera;
  const first = stripPoint(strip, strip.from);
  const home = { x: first.x - cal.offsetX, y: first.y - cal.offsetY };
  if (!(await moveMachine(home, hopFeed)) || (await settled(home)) === null) {
    return { end: cancelled ? 'cancelled' : 'failed', work: null, prior: null };
  }
  if (cancelled) return { end: 'cancelled', work: null, prior: null };
  const a = await restPicture();
  if (!a) return { end: 'failed', work: null, prior: null };
  lay(a.read, a.spindle);
  // the map is one thing: the strip before is laid down before this one runs
  // the map is one thing: the strip before is laid down before this one runs – and its result says whether to go on
  const prior = (await previous) ?? null;
  if (cancelled) return { end: 'cancelled', work: null, prior };
  // The segment before could not be fitted: the table shows too little to fit pictures by – no run, no more time lost
  if (prior && poor(prior)) return { end: 'gaveUp', work: null, prior };
  const pic = picture();
  if (!pic) return { end: 'failed', work: null, prior };

  const index = strip.axis === 'x' ? 0 : 1;
  const offset = strip.axis === 'x' ? cal.offsetX : cal.offsetY;
  const along = (mpos: readonly number[]) => (mpos[index] ?? 0) + offset;
  const startAlong = along([a.spindle.x, a.spindle.y]);
  const every = (STRIP_SPACING * (strip.axis === 'x' ? visible.width : visible.height)) / speed;
  const watch = new FrameWatch(pic.el);
  const track = new PositionTrack();
  const taken: { read: Read; t: number; trace: string | null }[] = [];
  const off = useMachine.subscribe((s, prev) => {
    if (s.status && s.status !== prev.status)
      track.add(performance.now() / 1000, along(s.status.mpos));
  });
  let running = true;
  let lastAt = -Infinity;
  let lastFrameAt = performance.now();
  const sample = () => {
    if (!running) return;
    const status = useMachine.getState().status;
    const t = performance.now() / 1000;
    // looked at on every frame of the screen: a picture is stamped when it is first seen
    const fresh = watch.changed();
    traceGap(performance.now() - lastFrameAt);
    lastFrameAt = performance.now();
    if (fresh && status?.state === 'Jog') {
      traceStamp();
      traceDense(pic.el);
    }
    if (
      fresh &&
      status?.state === 'Jog' &&
      taken.length < MAX_STRIP_PICTURES &&
      t - lastAt >= every &&
      Math.abs(along(status.mpos) - startAlong) >= 3
    ) {
      const read = readFrame(pic.el);
      if (read) {
        taken.push({ read, t, trace: traceFrame('run', read) });
        lastAt = t;
      }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  const target = strip.to - offset;
  let end: StripEnd = 'failed';
  try {
    traceNote('jog-send', {
      axis: strip.axis,
      across: strip.across,
      from: strip.from,
      to: strip.to,
      target,
      feed: speed * 60,
    });
    if (await jogMachine(strip.axis, target, speed * 60)) {
      traceNote('jog-ok');
      const limit = (Math.abs(strip.to - strip.from) / speed + 15) * 1000;
      end = await awaitJog(strip.axis, target, limit);
      traceNote('jog-end', { end });
    }
  } finally {
    running = false;
    off();
  }
  if (end !== 'done') return { end, work: null, prior };
  const b = await restPicture();
  if (!b) return { end: 'failed', work: null, prior };
  return { end: 'done', work: solveAndLay(strip, a, b, taken, track, speed), prior };
}

export const usePhotoMap = create<PhotoMapStore>((set, get) => ({
  tiles: 0,
  version: 0,
  extent: null,
  scan: null,
  ...loadScan(),
  stripsBad: false,

  setMode(mode) {
    set({ mode, stripsBad: false });
    saveScan(mode, get().tempo);
  },

  setTempo(tempo) {
    set({ tempo });
    saveScan(get().mode, tempo);
  },

  addTile() {
    const p = picture();
    const sp = spindle();
    if (!p || !sp) return false;
    const ok = get().addPicture(p.el, sp);
    if (ok) lastTileAt = crosshairPoint();
    return ok;
  },

  addPicture(el, sp) {
    const { width, height } = pictureSize(el);
    if (!width || !height) return false;
    const p = { el, width, height };
    const cal = useWorkshop.getState().settings.camera;
    const box = boundsOf(frameCorners(cal, sp, p, EXTENT_CROP));
    const read = readFrame(el);
    if (read) {
      traceFrame('rest', read, { spindle: sp });
      lay(read, sp);
      return true;
    }
    // Not readable: the old way, the middle of the frame cut out and drawn.
    const q = cropRect(p);
    for (const { cx, cy } of chunksFor(box)) {
      const c = chunk(cx, cy);
      const ctx = c?.canvas.getContext('2d');
      if (!c || !ctx) continue;
      const r = chunkRect(cx, cy);
      ctx.setTransform(
        ...imageTransform(cal, sp, p, { k: MAP_PX_PER_MM, left: r.minX, top: r.maxY }),
      );
      ctx.drawImage(p.el, q.u, q.v, q.w, q.h, q.u, q.v, q.w, q.h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    evict();
    set((s) => ({ tiles: s.tiles + 1, version: s.version + 1, extent: unionRect(s.extent, box) }));
    return true;
  },

  clear() {
    chunks.clear();
    mosaic.clear();
    // An emptied map stays empty until the camera moves on, instead of refilling on the spot.
    lastTileAt = crosshairPoint();
    set((s) => ({ tiles: 0, version: s.version + 1, extent: null }));
  },

  async scanArea(area, options = {}) {
    const { addLog, moveMachine, connection } = useMachine.getState();
    if (get().scan) return false;
    if (connection !== 'connected') {
      addLog('error', t('photomap.notConnected'), 'photomap.notConnected');
      return false;
    }
    const blocker = mapBlocker();
    if (blocker === 'noCamera' || blocker === 'uncalibrated') {
      addLog('error', t(`photomap.${blocker}`));
      return false;
    }
    const points = scanPoints(area);
    const visible = visibleFrame();
    const status = useMachine.getState().status;
    if (!points || !visible || !status) return false;
    const { settings } = useWorkshop.getState();
    const cal = settings.camera;
    const { profile } = useJob.getState();
    const feed = stopFeed();
    const settle = settings.calibration.settleMs;
    // Strips where asked for, where the area is long enough for them, and where the pictures can be read
    // (a stream that does not allow it can be drawn but not measured: then by stops).
    let strips = !options.precise && get().mode === 'strips' ? planStrips(area, visible) : null;
    const pic = picture();
    if (strips && !(pic && readFrame(pic.el))) {
      addLog('info', t('photomap.stripsNeedPixels'));
      strips = null;
    }
    keepGoing = useScanTrace.getState().recording;
    if (strips && get().stripsBad && !keepGoing) {
      addLog('info', t('photomap.stripsSkipped'));
      strips = null;
    }
    cancelled = false;
    const startedAt = Date.now();
    const tiles0 = get().tiles;
    traceBegin(() => traceMeta(visible), area, strips ? 'strips' : 'stops', {
      precise: !!options.precise,
      tempo: get().tempo,
      strips: strips ?? null,
    });
    set({
      scan: {
        done: 0,
        total: strips ? strips.length : points.length,
        startedAt,
        unit: strips ? 'strips' : 'pictures',
      },
    });
    let ok = true;
    let end: StripEnd = 'done';
    const stats: ScanStats = {
      mode: strips ? 'strips' : 'stops',
      strips: strips?.length ?? 0,
      offered: 0,
      placed: 0,
      refilled: 0,
      lag: stripLag,
      seconds: 0,
      gaveUp: false,
      detail: [],
    };
    // One picture at a stop – the way an area is scanned picture by picture, and what fills the gaps of strips.
    const stopAt = async (p: Point) => {
      // The picture is laid down where the status report says the machine stands:
      // wait for the report of this position, not the one from before the move.
      const at = { x: p.x - cal.offsetX, y: p.y - cal.offsetY };
      if (!((await moveMachine(at, feed)) && (await settled(at)) !== null)) return false;
      if (cancelled) return true;
      await wait(settle);
      const now = picture();
      if (now) await freshFrame(now.el);
      get().addTile();
      return true;
    };
    try {
      // Camera height first: only there does the scale fit.
      if (blocker === 'offHeight') {
        const z = cal.focusHeight! + (status.wco[2] ?? 0);
        ok = (await moveMachine({ z }, profile.jogFeed.z)) && (await settled({ z })) !== null;
      }
      if (strips && ok && !lagKnown) {
        // A short slow run first: it measures the lag of the pictures and shows whether this table has anything to
        // fit them by – if not, the whole scan goes by stops and has cost seconds, not minutes.
        const first = strips[0]!;
        const reach = Math.min(110, Math.abs(first.to - first.from));
        const probe: Strip = {
          ...first,
          to: first.from + Math.sign(first.to - first.from) * reach,
        };
        const r = await runStrip(
          probe,
          Math.min(stripSpeed(get().tempo), PROBE_SPEED),
          feed,
          visible,
          null,
        );
        if (r.end !== 'done') {
          ok = false;
          end = r.end;
        } else if (r.work) {
          const res = await r.work;
          stats.offered += res.offered;
          stats.placed += res.placed;
          stats.detail.push(res);
          if (!cancelled && (!lagKnown || poor(res) || res.placed < 4)) {
            set({ stripsBad: true });
            stats.gaveUp = true;
            strips = null;
            addLog('info', t('photomap.stripsGiveUp'));
          }
        }
      }
      if (strips && ok) {
        const speed = stripSpeed(get().tempo);
        let work: Promise<StripResult> | null = null;
        const works: Promise<StripResult>[] = [];
        for (const [i, strip] of strips.entries()) {
          if (cancelled) break;
          const r = await runStrip(strip, speed, feed, visible, work);
          work = r.work;
          if (r.work) works.push(r.work);
          if (r.end === 'gaveUp') {
            // What is left of the area goes by stops (the gaps are filled below); the next scan does not try
            // strips again until it is asked to.
            set({ stripsBad: true });
            stats.gaveUp = true;
            addLog('info', t('photomap.stripsGiveUp'));
            break;
          }
          if (r.end !== 'done') {
            ok = false;
            end = r.end;
            break;
          }
          set({ scan: { done: i + 1, total: strips.length, startedAt, unit: 'strips' } });
        }
        await work;
        for (const w of await Promise.all(works)) {
          stats.offered += w.offered;
          stats.placed += w.placed;
          stats.detail.push(w);
        }
        stats.lag = stripLag;
        // What the strips left out – a picture with no clear match, a strip cut short – is taken by stops.
        // (An area the map cannot hold – more chunks than it keeps – shows holes where old chunks were let go.)
        if (ok && !cancelled && chunksFor(area).length <= MAX_CHUNKS) {
          const holes = holesIn(area);
          const refill = planScan(area, visible).filter((p) =>
            holes.some(
              (h) =>
                Math.abs(h.x - p.x) <= visible.width / 2 &&
                Math.abs(h.y - p.y) <= visible.height / 2,
            ),
          );
          if (refill.length > 0) {
            addLog('info', t('photomap.stripsRefill', { count: refill.length }));
            stats.refilled = refill.length;
            const refillStart = Date.now();
            set({
              scan: { done: 0, total: refill.length, startedAt: refillStart, unit: 'pictures' },
            });
            for (const [i, p] of refill.entries()) {
              if (!ok || cancelled) break;
              ok = await stopAt(p);
              set({
                scan: {
                  done: i + 1,
                  total: refill.length,
                  startedAt: refillStart,
                  unit: 'pictures',
                },
              });
            }
          }
        }
      } else {
        for (const [i, p] of points.entries()) {
          if (!ok || cancelled) break;
          ok = await stopAt(p);
          if (!ok || cancelled) break;
          set({ scan: { done: i + 1, total: points.length, startedAt, unit: 'pictures' } });
        }
      }
    } finally {
      const count = get().tiles - tiles0;
      stats.seconds = (Date.now() - startedAt) / 1000;
      lastScan = stats;
      traceEnd({ ok, end, cancelled, count, stats });
      set({ scan: null });
      if (cancelled || end === 'cancelled') addLog('info', t('photomap.scanCancelled', { count }));
      else if (end === 'held') addLog('error', t('photomap.scanHeld'), 'photomap.scanHeld');
      else if (end === 'lost') addLog('error', t('photomap.scanLost'), 'photomap.scanLost');
      else if (!ok) addLog('error', t('photomap.scanFailed'), 'photomap.scanFailed');
      else addLog('info', t('photomap.scanDone', { count }));
    }
    return ok && !cancelled;
  },

  cancelScan() {
    cancelled = true;
  },
}));

/** Minutes, for the UI. */
export function minutes(seconds: number): string {
  return formatNumber(Math.max(1, Math.ceil(seconds / 60)), 0);
}

/**
 * Lays pictures onto the map on its own: whenever the machine rests at camera
 * height with a calibrated camera and has moved a third of a picture since
 * the last one. A recalibrated camera clears the map, whose pictures no
 * longer fit.
 */
export function startPhotoMap(): () => void {
  let idleSince: number | null = null;
  const timer = setInterval(() => {
    const { status, connection } = useMachine.getState();
    if (connection !== 'connected' || status?.state !== 'Idle') {
      idleSince = null;
      return;
    }
    idleSince ??= Date.now();
    const store = usePhotoMap.getState();
    if (store.scan || mapBlocker() !== null) return;
    const settle = useWorkshop.getState().settings.calibration.settleMs;
    if (Date.now() - idleSince < settle + FRAME_LAG_MS) return;
    const here = crosshairPoint();
    const frame = visibleFrame();
    if (!here || !frame) return;
    if (lastTileAt) {
      const moved = Math.hypot(here.x - lastTileAt.x, here.y - lastTileAt.y);
      if (moved < Math.min(frame.width, frame.height) / 3) return;
    }
    store.addTile();
  }, 250);
  let cal = useWorkshop.getState().settings.camera;
  const off = useWorkshop.subscribe((s) => {
    const next = s.settings.camera;
    if (next === cal) return;
    const changed =
      next.pxPerMm !== cal.pxPerMm ||
      next.scaleCalibrated !== cal.scaleCalibrated ||
      next.rotation !== cal.rotation ||
      next.offsetX !== cal.offsetX ||
      next.offsetY !== cal.offsetY ||
      next.focusHeight !== cal.focusHeight;
    // another camera or another stream: its picture is late by another time
    if (next.streamUrl !== cal.streamUrl || next.source !== cal.source) lagKnown = false;
    cal = next;
    // another scale, height or turn: the frames look different, what was learned of the lens goes
    if (changed) flat.reset();
    if (changed && usePhotoMap.getState().tiles > 0) {
      usePhotoMap.getState().clear();
      useMachine.getState().addLog('info', t('photomap.calibrationChanged'));
    }
  });
  return () => {
    clearInterval(timer);
    off();
  };
}
