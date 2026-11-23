import { create } from 'zustand';
import { t } from '../i18n';
import type { Point } from '../lib/camera';
import { formatNumber } from '../lib/format';
import {
  boundsOf,
  CHUNK_PX,
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
import { useWorkshop, type CameraSettings } from './workshop';

/** Why no picture can go onto the map right now (null = it can) */
export type MapBlocker = 'noCamera' | 'uncalibrated' | 'offHeight';

export interface ScanProgress {
  done: number;
  total: number;
  startedAt: number;
}

interface PhotoMapStore {
  /** Pictures laid down since the map was cleared */
  tiles: number;
  /** Bumps whenever the map changes, for redraws */
  version: number;
  /** Machine box covered by pictures */
  extent: Rect | null;
  scan: ScanProgress | null;
  /** Lays the current picture onto the map; false without a usable picture */
  addTile(): boolean;
  /** Lays a given picture onto the map as if taken with the spindle at `spindle` (machine XY) */
  addPicture(el: CameraPicture, spindle: Point): boolean;
  clear(): void;
  /** Scans a machine box (crosshair positions) at camera height */
  scanArea(area: Rect): Promise<boolean>;
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
  while (chunks.size > MAX_CHUNKS) {
    let oldest: [string, Chunk] | null = null;
    for (const entry of chunks) if (!oldest || entry[1].used < oldest[1].used) oldest = entry;
    chunks.delete(oldest![0]);
  }
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

export const usePhotoMap = create<PhotoMapStore>((set, get) => ({
  tiles: 0,
  version: 0,
  extent: null,
  scan: null,

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
    const box = boundsOf(frameCorners(cal, sp, p));
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
    // An emptied map stays empty until the camera moves on, instead of refilling on the spot.
    lastTileAt = crosshairPoint();
    set((s) => ({ tiles: 0, version: s.version + 1, extent: null }));
  },

  async scanArea(area) {
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
    const status = useMachine.getState().status;
    if (!points || !status) return false;
    const { settings } = useWorkshop.getState();
    const cal = settings.camera;
    const { profile } = useJob.getState();
    const feed = Math.min(2000, profile.jogFeed.xy);
    const settle = settings.calibration.settleMs;
    cancelled = false;
    set({ scan: { done: 0, total: points.length, startedAt: Date.now() } });
    let ok = true;
    try {
      // Camera height first: only there does the scale fit.
      if (blocker === 'offHeight') {
        const z = cal.focusHeight! + (status.wco[2] ?? 0);
        ok = (await moveMachine({ z }, profile.jogFeed.z)) && (await settled({ z })) !== null;
      }
      for (const [i, p] of points.entries()) {
        if (!ok || cancelled) break;
        // The picture is laid down where the status report says the machine stands:
        // wait for the report of this position, not the one from before the move.
        const at = { x: p.x - cal.offsetX, y: p.y - cal.offsetY };
        ok = (await moveMachine(at, feed)) && (await settled(at)) !== null;
        if (!ok || cancelled) break;
        await wait(settle);
        const pic = picture();
        if (pic) await freshFrame(pic.el);
        get().addTile();
        set({ scan: { done: i + 1, total: points.length, startedAt: get().scan!.startedAt } });
      }
    } finally {
      const done = get().scan?.done ?? 0;
      set({ scan: null });
      if (cancelled) addLog('info', t('photomap.scanCancelled', { count: done }));
      else if (!ok) addLog('error', t('photomap.scanFailed'), 'photomap.scanFailed');
      else addLog('info', t('photomap.scanDone', { count: done }));
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
    cal = next;
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
