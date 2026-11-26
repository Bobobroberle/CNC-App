import { create } from 'zustand';
import { t } from '../i18n';
import type { Point } from '../lib/camera';
import { formatNumber } from '../lib/format';
import {
  releaseDrawable,
  domainFits,
  type Drawable,
  type FrameSource,
  type FrameStamp,
  type SourceFrame,
  type StampDomain,
} from '../lib/frameStamp';
import { isRelayUrl } from '../lib/link';
import { companionBase } from '../lib/companion';
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
  BROWSER_CLOCK,
  clockBlocker,
  clockFromStream,
  clockKey,
  clockLost,
  pickStripFrames,
  pooledNoise,
  reportSeconds,
  type ClockFacts,
  type ClockReason,
  type PiClock,
  type ScanClock,
} from '../lib/scanClock';
import {
  estimateStops,
  estimateStrips,
  LAG_LIMITS,
  lagFromCorrections,
  maxSpeedForBlur,
  MIN_LAG_SPEED,
  moveSeconds,
  PI_LAG_LIMITS,
  planStrips,
  PositionTrack,
  solveStripSteps,
  stripPoint,
  timingNoiseMs,
  type Strip,
} from '../lib/strips';
import { isSimulatorAddress, simulatedPi, simulatorFrameSource } from '../sim';
import {
  cameraElement,
  crosshairPoint,
  FOCUS_TOLERANCE,
  focusError,
  pictureSize,
  useCamera,
  type CameraPicture,
} from './camera';
import { useJob } from './job';
import { useMachine } from './machine';
import { settled, wait } from './settle';
import {
  traceBegin,
  traceClock,
  traceDense,
  traceEnd,
  traceFrame,
  traceGap,
  traceNote,
  tracePicture,
  traceStamp,
  traceTimeOf,
  tracing,
  useScanTrace,
} from './scanTrace';
import { MIN_FRAME_SPACING_S, openStampedStream, type StampedStream } from './stampedFrames';
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

/** What the panel says of the clock the last scan in strips ran on */
export type ClockSummary = Pick<
  ScanStats,
  'clock' | 'clockReason' | 'clockDetail' | 'clockLost' | 'stamp' | 'timingNoiseMs'
>;

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
  /**
   * How long the camera exposes a picture, ms – this device's figure, 0 where it is not known. From it the speed of a run
   * is capped so that a picture is not blurred by more than a third of a millimetre (`maxSpeedForBlur`).
   */
  exposureMs: number;
  /** What the last scan in strips ran its clock on and why (null: none yet) – for the panel */
  lastClock: ClockSummary | null;
  setMode(mode: ScanMode): void;
  setTempo(tempo: ScanTempo): void;
  setExposure(ms: number): void;
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

/** What pixels can be read from: the camera's own element, or a decoded picture of its stamped stream */
type Readable = CameraPicture | Drawable;

function sizeOf(el: Readable): { width: number; height: number } {
  return el instanceof HTMLVideoElement || el instanceof HTMLImageElement
    ? pictureSize(el)
    : { width: el.width, height: el.height };
}

/** The camera's picture as pixels (shrunk to `FRAME_PX_MAX`) and the shrink factor, or null where it cannot be read. */
function readFrame(el: Readable): { frame: Frame; k: number } | null {
  if (typeof document === 'undefined') return null;
  const { width, height } = sizeOf(el);
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
/** The longest exposure the field takes, ms (a camera that exposes longer than this is no camera for a run) */
export const MAX_EXPOSURE_MS = 1000;
interface ScanChoice {
  mode: ScanMode;
  tempo: ScanTempo;
  exposureMs: number;
}
const DEFAULT_SCAN: ScanChoice = { mode: 'stops', tempo: 'normal', exposureMs: 0 };

/** An exposure from outside (storage, a field): a number of ms from 0 (unknown) to the longest, else 0 */
function exposureOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(MAX_EXPOSURE_MS, value)
    : 0;
}

function loadScan(): ScanChoice {
  try {
    const v = JSON.parse(localStorage.getItem(SCAN_KEY) ?? 'null') as Partial<
      Record<keyof ScanChoice, unknown>
    > | null;
    return {
      mode: v?.mode === 'stops' || v?.mode === 'strips' ? v.mode : DEFAULT_SCAN.mode,
      tempo:
        v?.tempo === 'gentle' || v?.tempo === 'normal' || v?.tempo === 'fast'
          ? v.tempo
          : DEFAULT_SCAN.tempo,
      exposureMs: exposureOf(v?.exposureMs),
    };
  } catch {
    return DEFAULT_SCAN;
  }
}

function saveScan(choice: ScanChoice) {
  try {
    localStorage.setItem(SCAN_KEY, JSON.stringify(choice));
  } catch {
    // a browser that keeps nothing: the choice holds until the page closes
  }
}

/** mm/s the tempo asks for: a share of the jog feed, never above what the axes can do (and never below 5) */
export function tempoSpeed(tempo: ScanTempo): number {
  const { profile } = useJob.getState();
  const share = tempo === 'gentle' ? 0.4 : tempo === 'fast' ? 1.4 : 0.8;
  const axes = profile.kinematics.axes;
  const cap = (Math.min(axes.x.maxRate, axes.y.maxRate) / 60) * 0.9;
  return Math.max(5, Math.min((profile.jogFeed.xy / 60) * share, cap));
}

/**
 * mm/s a strip is run at: what the tempo asks for – and, where the camera's exposure is known, never above what keeps a
 * picture from being blurred by more than a third of a millimetre. That cap is the one thing that may take it below 5 mm/s
 * (which a run is not worth, see `scanArea`).
 */
export function stripSpeed(tempo: ScanTempo): number {
  return Math.max(
    1,
    Math.min(tempoSpeed(tempo), maxSpeedForBlur(usePhotoMap.getState().exposureMs)),
  );
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
  /**
   * The clock the pictures of the runs were put on the time line with: the Pi's (reports and pictures stamped there) or the
   * browser's (both stamped when this page saw them – what a scan with stops and every scan before this one used, and so
   * the value of a scan that used no clock at all)
   */
  clock: 'pi' | 'browser';
  /** Why the browser's where a Pi is part of the connection (`relay`: reports unstamped, `device`: the camera is no stream, `stream`: it cannot be read, `window`: its stamps are in another clock) */
  clockReason: ClockReason | null;
  /** More of a stream's failure: its code (never an address) */
  clockDetail: string | null;
  /** The Pi's clock went away during the scan (the stream ended, its stamps left the window): the runs stopped there, the rest was scanned by stops */
  clockLost: ClockReason | null;
  /** On the Pi's clock: which clock the pictures are stamped in and the header the stamp is read from */
  stamp: { domain: StampDomain; source: string } | null;
  /** How much the clock scattered over the runs, ms (what is left after the lag, a constant, is taken out) – null where the runs did not say */
  timingNoiseMs: number | null;
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
  /** The relay's stamp of the newest report (null: it came without one) – for the tests of the Pi's clock */
  stamp: () => useMachine.getState().statusStamp,
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
/** What the lag is guessed to be before it is measured, s: the browser's (the MJPEG picture is late) and the Pi's (reports and pictures are both stamped there) */
const FIRST_LAG = { browser: 0.3, pi: 0 } as const;
/**
 * The clock the lag above is of (`clockKey`). A lag in the browser's clock is no lag in the Pi's – and the other way round –
 * so what was learned is dropped when a scan runs on another clock, and the first strip measures it again.
 */
let lagClock = 'browser';
/** mm/s of the strip that measures the lag: at this speed 0.3 s is 4 mm – less than half a dot of the plate */
const PROBE_SPEED = 12;
/** The share of the usual spacing between pictures the Pi's clock keeps while the lag is not known (the probe run) */
const PROBE_SPACING = 0.5;
/** While a run is on the Pi's clock the status is asked for this often, ms – on top of the regular poll (200 ms): more reports to fit the line through */
const STRIP_POLL_MS = 100;
/** Longest the first stamped picture of the camera may be waited for in the simulator, ms (a real stream has its own limits) */
const SIM_FIRST_PICTURE_MS = 1000;

/** The clock of a scan decides what the lag is: another clock than the last one means the lag is not known */
function useClockLag(clock: ScanClock) {
  const key = clockKey(clock);
  if (key === lagClock) return;
  lagClock = key;
  lagKnown = false;
  stripLag = FIRST_LAG[clock.kind];
}

interface StripResult {
  placed: number;
  offered: number;
  forward: number;
  backward: number;
  disagreement: number;
  /** How much the clock scattered over this run, ms, and from how many pictures (null: too few said) */
  noise: { ms: number; count: number } | null;
}

/** `clockLost`: the Pi's clock is gone (the stream ended, its stamps left the window) – nothing was moved for this strip */
type StripEnd = 'done' | 'cancelled' | 'lost' | 'held' | 'failed' | 'gaveUp' | 'clockLost';

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

/** A picture of a run, read and ready for the solver */
interface Taken {
  read: Read;
  /** When it was taken, s, on the clock of the run's reports: the page's (when it was first seen) or the Pi's (its stamp) */
  t: number;
  /** Where it is in the recording, if one is made */
  trace: string | null;
  /** On the Pi's clock: when the page got it (ms, `performance.now()`) and the stamp it carries */
  arrival?: number;
  stamp?: FrameStamp;
}

/** Puts the pictures of a strip where they were taken, and lays them down. */
async function solveAndLay(
  strip: Strip,
  a: Rest,
  b: Rest,
  taken: Taken[],
  track: PositionTrack,
  speed: number,
  clock: ScanClock,
): Promise<StripResult> {
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
        clock: clock.kind,
        anchors: [
          { file: a.trace, along: alongOf(a) },
          { file: b.trace, along: alongOf(b) },
        ],
        frames: frames.map((f, i) => ({
          file: kept[i]!.trace,
          t: kept[i]!.t,
          // on the Pi's clock: when the page got the picture (ms on the recording's clock) and its stamp – both clocks of one picture
          ...(kept[i]!.stamp
            ? { arrival: traceTimeOf(kept[i]!.arrival!), stamp: kept[i]!.stamp }
            : {}),
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
      // the scatter is of the lag the run was predicted with: taken before the lag learns from this very run
      const noise = timingNoiseMs(stripLag, samples);
      const lag = lagFromCorrections(
        stripLag,
        samples,
        clock.kind === 'pi' ? PI_LAG_LIMITS : LAG_LIMITS,
      );
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
        noise,
      };
    }
    await turn();
    if (cancelled)
      return {
        placed: 0,
        offered: frames.length,
        forward: 0,
        backward: 0,
        disagreement: 0,
        noise: null,
      };
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

// ---------- which clock ----------

/** What is known of the Pi right now, for the choice of the clock */
function clockFacts(): ClockFacts {
  const machine = useMachine.getState();
  if (isSimulatorAddress(machine.url)) {
    // the simulator has a Pi only where the tests set one up (`window.lowriderPiClock`)
    const piThere = simulatedPi();
    return { piConfigured: piThere, reportStamp: machine.statusStamp, streamAvailable: piThere };
  }
  const { companionUrl, camera } = useWorkshop.getState().settings;
  return {
    // the Pi is part of the connection where the controller is reached through it, or where one is set up at all
    piConfigured: isRelayUrl(machine.url) || companionBase(companionUrl) !== null,
    reportStamp: machine.statusStamp,
    streamAvailable: useCamera.getState().source === 'stream' && camera.streamUrl.trim() !== '',
  };
}

/** Waits for the first picture of a source, or until it fails, the scan is cancelled or `ms` have passed */
async function firstPicture(source: FrameSource, ms: number) {
  const until = performance.now() + ms;
  while (source.ok && source.frames().length === 0 && !cancelled && performance.now() < until)
    await wait(20);
}

/**
 * The stamped stream of the scan that is being opened – only while the camera server has not answered. A camera that
 * serves one client leaves the opening waiting for seconds, so `cancelScan` closes this one: the opening ends at once
 * instead of the scan waiting to look at its Cancel.
 */
let opening: StampedStream | null = null;

/** Whether pixels can be made of the newest picture the stream kept – asked once, before the scan commits to the Pi's clock */
async function picturesDecode(source: FrameSource): Promise<boolean> {
  const newest = source.frames().at(-1);
  const drawable = newest ? await source.decode(newest) : null;
  const read = drawable ? readFrame(drawable) : null;
  releaseDrawable(drawable);
  return read !== null;
}

/**
 * Chooses the clock of a scan, once, and opens what the Pi's clock needs: the stream of stamped pictures (the simulated
 * Pi's, in the simulator), which then stays open for the whole scan. All or nothing: the Pi's clock only where the reports
 * carry the relay's stamp, the pictures carry the Pi's, and the two are in one clock (`clockFromStream`); anything else is
 * the browser's clock with the reason, and the stream is closed again.
 */
async function chooseScanClock(): Promise<{ clock: ScanClock; source: FrameSource | null }> {
  const blocked = clockBlocker(clockFacts());
  if (blocked) return { clock: blocked, source: null };
  const simulated = isSimulatorAddress(useMachine.getState().url);
  let source: FrameSource | null;
  if (simulated) {
    source = simulatorFrameSource();
    if (source) await firstPicture(source, SIM_FIRST_PICTURE_MS);
  } else {
    try {
      source = await openStampedStream(useWorkshop.getState().settings.camera.streamUrl, {
        onCreate: (stream) => (opening = stream),
      });
    } finally {
      opening = null;
    }
  }
  if (!source) return { clock: { kind: 'browser', reason: 'stream' }, source: null };
  const facts = {
    ok: source.ok,
    reason: source.reason,
    frame: source.frames().at(-1)?.stamp ?? null,
    reportStamp: useMachine.getState().statusStamp,
  };
  let clock = clockFromStream(facts);
  // The stamps fit – but a run needs pixels of these pictures, or it would offer the solver none and the table would be
  // blamed (`stripsBad`) for what the browser cannot do: one picture is made into pixels now, before anything moves.
  if (clock.kind === 'pi')
    clock = clockFromStream({ ...facts, decodable: await picturesDecode(source) });
  if (clock.kind !== 'pi') {
    source.close();
    return { clock, source: null };
  }
  return { clock, source };
}

// ---------- what a run collects ----------

/** What a run needs to know about the strip it takes pictures on */
interface RunPlan {
  /** Where along the strip a machine position is (the crosshair, mm) */
  along: (mpos: readonly number[]) => number;
  /** Where the run began, along the strip */
  startAlong: number;
  /** Seconds between two pictures the run takes */
  every: number;
}

/**
 * The reports and the pictures of one run. The browser's collector is the code the app always had (moved, not changed);
 * the Pi's takes the stamps the Pi put on both.
 */
interface Collector {
  /** What the reports say about where the machine was, on the clock the pictures are told by */
  track: PositionTrack;
  /** The jog is over: nothing more is collected */
  stop(): void;
  /** The machine rests at the end of the run: the pictures it took, ready for the solver (called once, at that moment) */
  harvest(): Promise<Taken[]>;
}

/**
 * On the page's clock: a report is stamped when it arrives here and a picture when the screen first shows it –
 * looked at on every frame of the screen, a few pixels summed.
 */
function browserCollector(el: CameraPicture, plan: RunPlan): Collector {
  const watch = new FrameWatch(el);
  const track = new PositionTrack();
  const taken: Taken[] = [];
  const off = useMachine.subscribe((s, prev) => {
    if (s.status && s.status !== prev.status)
      track.add(performance.now() / 1000, plan.along(s.status.mpos));
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
      traceDense(el);
    }
    if (
      fresh &&
      status?.state === 'Jog' &&
      taken.length < MAX_STRIP_PICTURES &&
      t - lastAt >= plan.every &&
      Math.abs(plan.along(status.mpos) - plan.startAlong) >= 3
    ) {
      const read = readFrame(el);
      if (read) {
        taken.push({ read, t, trace: traceFrame('run', read) });
        lastAt = t;
      }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  return {
    track,
    stop() {
      running = false;
      off();
    },
    harvest: () => Promise.resolve(taken),
  };
}

/** What a scan on the Pi's clock holds on to: the clock and the stream of stamped pictures that stays open for the scan */
interface PiTiming {
  clock: PiClock;
  source: FrameSource;
}

/** Why the Pi's clock is gone, or null while it holds (`clockLost` in `lib/scanClock.ts`) – asked before a strip moves anything. */
function clockGone(timing: PiTiming): ClockReason | null {
  const newest = timing.source.frames().at(-1);
  return clockLost({
    streamOk: timing.source.ok,
    reportStamp: useMachine.getState().statusStamp,
    newest: newest ? { stamp: newest.stamp, arrival: newest.arrival } : null,
    nowMs: performance.now(),
  });
}

/**
 * Pixels of the pictures a run took, one at a time with the screen and the buttons (PAUSE, NOT-HALT) given their turn
 * in between – the stream only copied bytes while the camera ran.
 */
async function decodeStamped(
  source: FrameSource,
  chosen: readonly SourceFrame[],
): Promise<Taken[]> {
  const out: Taken[] = [];
  for (const f of chosen) {
    if (cancelled) break;
    const drawable = await source.decode(f);
    const read = drawable ? readFrame(drawable) : null;
    releaseDrawable(drawable);
    if (read) {
      out.push({
        read,
        t: f.stamp.t,
        arrival: f.arrival,
        stamp: f.stamp,
        // `t` of a recorded picture is when the page got it; the stamp beside it is the Pi's
        trace: traceFrame('run', read, { t: traceTimeOf(f.arrival), stamp: f.stamp }),
      });
    }
    await turn();
  }
  return out;
}

/**
 * On the Pi's clock: the reports are put on the line with the stamp the relay gave them, the pictures are the stamped
 * stream's – **no sampling of the screen**, so the page's own late and uneven view of the camera is not in it. While the
 * run goes the status is asked for faster (`STRIP_POLL_MS`); the stream keeps bytes and stamps only, and what the run took is
 * chosen from them and decoded afterwards. A report that came without a stamp is left out, never mixed in.
 */
function stampedCollector(timing: PiTiming, el: CameraPicture, plan: RunPlan): Collector {
  const { source, clock } = timing;
  const track = new PositionTrack();
  // the pictures this run asks for, and a clean ring: what an earlier strip left there is not this run's
  source.clear();
  // The first run of a scan measures the lag from its pictures, and it is short and slow (a picture every 30 % of the view is
  // three of them in 110 mm at 12 mm/s, and the lag wants four): the stream keeps twice as many while the lag is not known.
  source.setMinSpacing(Math.max(MIN_FRAME_SPACING_S, plan.every * (lagKnown ? 1 : PROBE_SPACING)));
  const evictedBefore = source.evicted;
  let jogFrom = Infinity;
  let jogTo = -Infinity;
  const off = useMachine.subscribe((s, prev) => {
    if (!s.status || s.status === prev.status || !s.statusStamp) return;
    const t = reportSeconds(s.statusStamp, clock.domain);
    track.add(t, plan.along(s.status.mpos));
    if (s.status.state === 'Jog') {
      jogFrom = Math.min(jogFrom, t);
      jogTo = Math.max(jogTo, t);
    }
  });
  const stopPolling = useMachine.getState().pollStatus(STRIP_POLL_MS);
  // only a recording looks at the screen's picture: the dense series and the page's stalls (a view of how late it is)
  let running = tracing();
  let lastFrameAt = performance.now();
  const watch = running ? new FrameWatch(el) : null;
  const sample = () => {
    if (!running) return;
    const fresh = watch!.changed();
    traceGap(performance.now() - lastFrameAt);
    lastFrameAt = performance.now();
    if (fresh && useMachine.getState().status?.state === 'Jog') {
      traceStamp();
      traceDense(el);
    }
    requestAnimationFrame(sample);
  };
  if (running) requestAnimationFrame(sample);
  return {
    track,
    stop() {
      running = false;
      off();
      stopPolling();
      // The run is over: the stream keeps its pictures close again, so that the newest is a fresh one when the clock is checked
      // before the next strip (a slow run's spacing is seconds – and a stale newest picture looks like a clock that left)
      source.setMinSpacing(MIN_FRAME_SPACING_S);
    },
    harvest() {
      // chosen now, before the next strip clears the ring; decoded after, while the machine hops on
      const all = source.frames();
      for (const f of all) tracePicture(f.arrival, f.stamp);
      const chosen = pickStripFrames(all, {
        track,
        lag: stripLag,
        startAlong: plan.startAlong,
        jogFrom,
        jogTo,
        max: MAX_STRIP_PICTURES,
      });
      traceNote('stamped-pictures', {
        kept: all.length,
        chosen: chosen.length,
        evicted: source.evicted - evictedBefore,
      });
      return decodeStamped(source, chosen);
    },
  };
}

/**
 * One strip: hop to its start, a picture at rest there, the run (a jog – it can be ended cleanly), a picture at
 * rest at its end. The pictures of the run are put where they were taken only once both pictures at rest are in
 * (`solveAndLay`, handed back as `work`: it goes on while the machine hops to the next strip).
 * `timing` is the Pi's clock where the scan runs on it, null for the browser's.
 */
async function runStrip(
  strip: Strip,
  speed: number,
  hopFeed: number,
  visible: { width: number; height: number },
  previous: Promise<StripResult> | null,
  timing: PiTiming | null = null,
): Promise<{
  end: StripEnd;
  work: Promise<StripResult> | null;
  prior: StripResult | null;
  /** Why the clock was lost, with `end` `clockLost` */
  lost?: ClockReason;
}> {
  const { moveMachine, jogMachine } = useMachine.getState();
  const cal = useWorkshop.getState().settings.camera;
  // the hop is the first thing a strip sends: a scan cancelled before it sends nothing
  if (cancelled) return { end: 'cancelled', work: null, prior: null };
  if (timing) {
    // the clock is checked before anything moves: a strip that cannot be told apart is not run
    const lost = clockGone(timing);
    if (lost) return { end: 'clockLost', work: null, prior: null, lost };
  }
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
  const plan: RunPlan = { along, startAlong, every };
  const collector = timing
    ? stampedCollector(timing, pic.el, plan)
    : browserCollector(pic.el, plan);
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
    collector.stop();
  }
  if (end !== 'done') return { end, work: null, prior };
  const b = await restPicture();
  if (!b) return { end: 'failed', work: null, prior };
  const clock = timing?.clock ?? BROWSER_CLOCK;
  return {
    end: 'done',
    work: collector
      .harvest()
      .then((taken) => solveAndLay(strip, a, b, taken, collector.track, speed, clock)),
    prior,
  };
}

export const usePhotoMap = create<PhotoMapStore>((set, get) => ({
  tiles: 0,
  version: 0,
  extent: null,
  scan: null,
  ...loadScan(),
  stripsBad: false,
  lastClock: null,

  setMode(mode) {
    set({ mode, stripsBad: false });
    const { tempo, exposureMs } = get();
    saveScan({ mode, tempo, exposureMs });
  },

  setTempo(tempo) {
    set({ tempo });
    const { mode, exposureMs } = get();
    saveScan({ mode, tempo, exposureMs });
  },

  setExposure(ms) {
    const exposureMs = exposureOf(ms);
    set({ exposureMs });
    const { mode, tempo } = get();
    saveScan({ mode, tempo, exposureMs });
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
    // a run the exposure holds below what the lag can be measured at is slower than stops are
    if (strips && stripSpeed(get().tempo) < MIN_LAG_SPEED) {
      addLog('info', t('photomap.stripsTooSlow', { speed: formatNumber(MIN_LAG_SPEED, 0) }));
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
      clock: 'browser',
      clockReason: null,
      clockDetail: null,
      clockLost: null,
      stamp: null,
      timingNoiseMs: null,
      detail: [],
    };
    // the scatter of each run that said, put together at the end; the Pi's stamped pictures stay open for the scan
    const noises: { ms: number; count: number }[] = [];
    let timing: PiTiming | null = null;
    // whether a clock was chosen for this scan (a scan cancelled while that was going on used none)
    let clockChosen = false;
    // The Pi's clock went away: said once, and the scan goes on by stops – never blamed on the table (`stripsBad`)
    const clockWentAway = (why: ClockReason) => {
      stats.clockLost = why;
      addLog('info', t('photomap.clockLost', { why: t(`photomap.clockWhy.${why}`) }));
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
      if (strips && ok && !cancelled) {
        // The clock is chosen once for the scan, all or nothing (`chooseScanClock`): reports and pictures both on the
        // Pi's, or both on the browser's – and what was learned of the lag belongs to the clock it was learned on.
        const chosen = await chooseScanClock();
        if (cancelled) {
          // Cancelled while the stream was opening: nothing was sent, no clock was used – and a stream that was closed
          // for that is no reason to tell the operator about
          chosen.source?.close();
        } else {
          clockChosen = true;
          useClockLag(chosen.clock);
          stats.clock = chosen.clock.kind;
          if (chosen.clock.kind === 'pi') {
            timing = { clock: chosen.clock, source: chosen.source! };
            stats.stamp = { domain: chosen.clock.domain, source: chosen.clock.source };
          } else if (chosen.clock.reason) {
            stats.clockReason = chosen.clock.reason;
            stats.clockDetail = chosen.clock.detail ?? null;
            // said once: a Pi is there and its clock was not used – and why
            addLog(
              'info',
              t('photomap.clockFallback', { why: t(`photomap.clockWhy.${chosen.clock.reason}`) }),
            );
          }
          traceClock(chosen.clock.kind);
          traceNote('clock', {
            clock: chosen.clock.kind,
            domain: chosen.clock.kind === 'pi' ? chosen.clock.domain : null,
            source: chosen.clock.kind === 'pi' ? chosen.clock.source : null,
            reason: chosen.clock.kind === 'browser' ? chosen.clock.reason : null,
            detail: chosen.clock.kind === 'browser' ? (chosen.clock.detail ?? null) : null,
          });
        }
      }
      if (strips && ok && !cancelled && !lagKnown) {
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
          timing,
        );
        if (r.end === 'clockLost') {
          // the Pi's clock went away before the first run: the whole area goes by stops, and strips are not given up on
          clockWentAway(r.lost ?? 'stream');
          strips = null;
        } else if (r.end !== 'done') {
          ok = false;
          end = r.end;
        } else if (r.work) {
          const res = await r.work;
          stats.offered += res.offered;
          stats.placed += res.placed;
          stats.detail.push(res);
          if (res.noise) noises.push(res.noise);
          if (!cancelled && (!lagKnown || poor(res) || res.placed < 4)) {
            // Too few pictures to fit: the table may give too little – or the Pi's clock left during the run (the stream
            // dropped, the reports lost their stamp) and the pictures that were kept say nothing of the table.
            const gone = timing ? clockGone(timing) : null;
            if (gone) {
              clockWentAway(gone);
            } else {
              set({ stripsBad: true });
              stats.gaveUp = true;
              addLog('info', t('photomap.stripsGiveUp'));
            }
            strips = null;
          }
        }
      }
      if (strips && ok) {
        const speed = stripSpeed(get().tempo);
        let work: Promise<StripResult> | null = null;
        const works: Promise<StripResult>[] = [];
        for (const [i, strip] of strips.entries()) {
          if (cancelled) break;
          const r = await runStrip(strip, speed, feed, visible, work, timing);
          work = r.work;
          if (r.work) works.push(r.work);
          if (r.end === 'clockLost') {
            // Never a mixture: the runs stop, what is left of the area goes by stops (the gaps are filled below) –
            // and strips are not blamed: the next scan may well have its clock
            clockWentAway(r.lost ?? 'stream');
            break;
          }
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
          if (w.noise) noises.push(w.noise);
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
      // the stamped pictures were kept open for this scan only
      timing?.source.close();
      const count = get().tiles - tiles0;
      stats.seconds = (Date.now() - startedAt) / 1000;
      stats.lag = stripLag;
      stats.timingNoiseMs = pooledNoise(noises);
      lastScan = stats;
      traceEnd({ ok, end, cancelled, count, stats });
      set({
        scan: null,
        // the panel says which clock a scan that used one ran on – a scan with stops used none
        ...(stats.mode === 'strips' && clockChosen
          ? {
              lastClock: {
                clock: stats.clock,
                clockReason: stats.clockReason,
                clockDetail: stats.clockDetail,
                clockLost: stats.clockLost,
                stamp: stats.stamp,
                timingNoiseMs: stats.timingNoiseMs,
              },
            }
          : {}),
      });
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
    // a scan that is still waiting for the camera server's answer stops waiting
    opening?.close();
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
