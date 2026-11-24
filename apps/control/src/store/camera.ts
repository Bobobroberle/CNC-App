import { create } from 'zustand';
import { t } from '../i18n';
import { calibrateFromMove, imageToMachine, offsetFromMark, type Point } from '../lib/camera';
import { findEdges, snapToEdges } from '../lib/corner';
import { formatCoordinate, formatNumber } from '../lib/format';
import { findMarker, toGray } from '../lib/markers';
import { cropAround, snapsTo } from '../lib/measure';
import { isSimulatorAddress, simulatorCamera, stopSimulatorCamera } from '../sim';
import { useMachine } from './machine';
import { useMeasurements } from './measurements';
import { useWorkshop } from './workshop';

/** `sim`: the picture of the simulated camera (simulator mode) */
export type CameraSource = 'device' | 'stream' | 'sim';

export type CameraPicture = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

/** Pixel size of a picture element (0 × 0 until it has a frame). */
export function pictureSize(el: CameraPicture): { width: number; height: number } {
  if (el instanceof HTMLVideoElement) return { width: el.videoWidth, height: el.videoHeight };
  if (el instanceof HTMLImageElement) return { width: el.naturalWidth, height: el.naturalHeight };
  return { width: el.width, height: el.height };
}
/**
 * A tap on the picture while the camera is being set up: measures the scale
 * or the offset. Every other tap goes to the stage tools as a machine point.
 */
export type TapMode = 'scale' | 'offset';

export interface CameraTap {
  /** Image pixel (natural size) */
  px: Point;
  /** Spindle machine position when tapped */
  spindle: Point;
}

interface CameraStore {
  source: CameraSource | null;
  deviceId: string;
  devices: MediaDeviceInfo[];
  error: string | null;
  tapMode: TapMode | null;
  taps: CameraTap[];
  /** Spindle position where the tool made the calibration mark */
  marked: Point | null;
  /** Natural size of the picture once it plays */
  size: { width: number; height: number } | null;
  setSource(source: CameraSource | null, deviceId?: string): void;
  setTapMode(mode: TapMode | null): void;
  /** Switches the camera on with the source from the setup (or the best one there is) */
  switchOn(): void;
  /** Handles a setup tap on the picture according to the mode */
  tap(px: Point): void;
  markHere(): void;
}

/**
 * The one picture element of the camera. A WLAN camera (ESP32-CAM) serves
 * a single client, so the element is created once and moved between the
 * stage and a hidden holder instead of opening a second stream.
 */
let element: CameraPicture | null = null;
let mediaStream: MediaStream | null = null;
let holder: HTMLDivElement | null = null;

function park(el: HTMLElement) {
  if (typeof document === 'undefined') return;
  if (!holder) {
    holder = document.createElement('div');
    holder.hidden = true;
    document.body.append(holder);
  }
  holder.append(el);
}

function stop() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  if (element instanceof HTMLImageElement) element.src = '';
  if (element instanceof HTMLCanvasElement) stopSimulatorCamera();
  element?.remove();
  element = null;
}

/** The picture element, for drawing and timelapse frames. */
export function cameraElement(): CameraPicture | null {
  return element;
}

/** Puts the picture into a container (the stage); returns a function that takes it back. */
export function mountCamera(container: HTMLElement): () => void {
  if (!element) return () => undefined;
  const el = element;
  container.prepend(el);
  return () => {
    if (element === el) park(el);
  };
}

export function naturalSize(): { width: number; height: number } | null {
  if (!element) return null;
  const { width, height } = pictureSize(element);
  return width && height ? { width, height } : null;
}

const spindle = (): Point | null => {
  const s = useMachine.getState().status;
  return s ? { x: s.mpos[0] ?? 0, y: s.mpos[1] ?? 0 } : null;
};

export const useCamera = create<CameraStore>((set, get) => ({
  source: null,
  deviceId: '',
  devices: [],
  error: null,
  tapMode: null,
  taps: [],
  marked: null,
  size: null,

  setSource(source, deviceId = get().deviceId) {
    stop();
    set({ source, deviceId, error: null, size: null, taps: [] });
    if (!source || typeof document === 'undefined') return;
    const ready = () => set({ size: naturalSize() });
    if (source === 'sim') {
      const sim = simulatorCamera();
      element = sim;
      park(sim);
      ready();
      return;
    }
    if (source === 'stream') {
      const img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      img.alt = '';
      img.addEventListener('load', ready);
      img.addEventListener('error', () => set({ error: t('camera.streamFailed') }));
      img.src = useWorkshop.getState().settings.camera.streamUrl;
      element = img;
      park(img);
      return;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.addEventListener('loadedmetadata', ready);
    element = video;
    park(video);
    if (!navigator.mediaDevices) {
      set({ error: t('camera.insecure') });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
      })
      .then(async (s) => {
        if (element !== video) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        mediaStream = s;
        video.srcObject = s;
        await video.play().catch(() => undefined);
        const all = await navigator.mediaDevices.enumerateDevices();
        set({ devices: all.filter((d) => d.kind === 'videoinput') });
      })
      .catch((e: Error) => set({ error: e.message || 'getUserMedia' }));
  },

  setTapMode: (tapMode) => set({ tapMode, taps: [] }),
  switchOn: () => get().setSource(preferredSource()),

  markHere() {
    const sp = spindle();
    set({ marked: sp });
    if (sp) useMachine.getState().addLog('info', t('camera.markKept'));
  },

  tap(px) {
    const sp = spindle();
    const size = naturalSize();
    if (!sp || !size) return;
    const { tapMode, taps, marked } = get();
    if (!tapMode) return;
    const keep = tapMode === 'scale' ? taps.slice(-1) : [];
    const next = [...keep, { px, spindle: sp }];
    set({ taps: next });
    const { addLog } = useMachine.getState();
    const { settings, setSettings } = useWorkshop.getState();
    const camera = settings.camera;
    if (tapMode === 'scale' && next.length === 2) {
      const moved = {
        x: next[1]!.spindle.x - next[0]!.spindle.x,
        y: next[1]!.spindle.y - next[0]!.spindle.y,
      };
      const r = calibrateFromMove(next[0]!.px, next[1]!.px, moved);
      if (!r) {
        addLog('error', t('camera.scaleFailed'), 'camera.scaleFailed');
        return;
      }
      const workZ = useMachine.getState().status?.wpos[2];
      setSettings({
        camera: {
          ...camera,
          ...r,
          scaleCalibrated: true,
          focusHeight: workZ === undefined ? null : Number(workZ.toFixed(2)),
        },
      });
      useMeasurements.getState().record('camera-scale', {
        pxPerMm: r.pxPerMm,
        rotation: r.rotation,
        focusHeight: workZ === undefined ? null : Number(workZ.toFixed(2)),
      });
      addLog(
        'info',
        t('camera.scaled', { px: formatNumber(r.pxPerMm, 2), angle: formatNumber(r.rotation, 2) }),
      );
    }
    if (tapMode === 'offset' && marked) {
      const o = offsetFromMark(camera, marked, sp, px, size);
      setSettings({ camera: { ...camera, offsetX: o.x, offsetY: o.y } });
      useMeasurements.getState().record('camera-offset', { offsetX: o.x, offsetY: o.y });
      addLog(
        'info',
        t('camera.offsetSet', { x: formatCoordinate(o.x, 2), y: formatCoordinate(o.y, 2) }),
      );
      set({ marked: null });
    }
  },
}));

/**
 * The picture source "Kamera einschalten" uses: the one chosen in the setup
 * if it is there, else the simulator's camera, the stream, the device.
 */
export function preferredSource(): CameraSource {
  const simulated = isSimulatorAddress(useMachine.getState().url);
  const { source, streamUrl } = useWorkshop.getState().settings.camera;
  if (source === 'sim' && simulated) return 'sim';
  if (source === 'stream' && streamUrl) return 'stream';
  if (source === 'device') return 'device';
  return simulated ? 'sim' : streamUrl ? 'stream' : 'device';
}

/** Machine XY of an image pixel (natural size) right now, or null without picture or position. */
export function pixelToMachine(px: Point): Point | null {
  const sp = spindle();
  const size = naturalSize();
  if (!sp || !size) return null;
  return imageToMachine(useWorkshop.getState().settings.camera, px, size, sp);
}

/** Machine XY of a tap. */
export function tapToMachine(tap: CameraTap): Point | null {
  const size = naturalSize();
  if (!size) return null;
  return imageToMachine(useWorkshop.getState().settings.camera, tap.px, size, tap.spindle);
}

/** Machine XY under the crosshair (image centre) right now. */
export function crosshairPoint(): Point | null {
  const sp = spindle();
  if (!sp) return null;
  const c = useWorkshop.getState().settings.camera;
  return { x: sp.x + c.offsetX, y: sp.y + c.offsetY };
}

/** Height tolerance before the picture's scale is called off, mm */
export const FOCUS_TOLERANCE = 0.5;

/** Distance of the spindle from the calibrated camera height (work Z), or null if unknown. */
export function focusError(): number | null {
  const height = useWorkshop.getState().settings.camera.focusHeight;
  const z = useMachine.getState().status?.wpos[2];
  return height === null || z === undefined ? null : z - height;
}

/** A tap looks for a hole within this distance, mm (holes up to about Ø 28 mm) */
const SNAP_HALF_MM = 20;
/** A tap this close to a hole's rim still means the hole, mm */
const SNAP_REACH_MM = 3;

/** A tap looks for the workpiece's corner or edge in this much of the picture around it, mm */
const EDGE_HALF_MM = 15;
/** A tap this close to the corner means the corner; to an edge, the edge – mm */
const CORNER_REACH_MM = 7;
const EDGE_REACH_MM = 4;

let snapCanvas: HTMLCanvasElement | null = null;

/** The piece of the live picture around a pixel as grey values, or null when it cannot be read. */
function grabCrop(px: Point, halfMm: number) {
  const size = naturalSize();
  if (!element || !size || typeof document === 'undefined') return null;
  const camera = useWorkshop.getState().settings.camera;
  const crop = cropAround(px, size, halfMm * camera.pxPerMm);
  if (!crop) return null;
  snapCanvas ??= document.createElement('canvas');
  snapCanvas.width = crop.width;
  snapCanvas.height = crop.height;
  const ctx = snapCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(element, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const data = ctx.getImageData(0, 0, crop.width, crop.height).data;
    return { crop, gray: toGray(data, crop.width, crop.height), camera };
  } catch {
    // A stream from another origin without CORS cannot be read: no snapping then.
    return null;
  }
}

/**
 * The corner of the workpiece near a tapped pixel of the live picture, or
 * the nearest point on its edge: where a light board ends on a darker table
 * (or the other way round) in a straight line. null when the picture shows
 * no such border near the tap – then the tap itself is the point.
 */
export function edgeAt(px: Point, want: 'corner' | 'edge'): Point | null {
  const grabbed = grabCrop(px, EDGE_HALF_MM);
  if (!grabbed) return null;
  const { crop, gray, camera } = grabbed;
  const reach = (want === 'corner' ? CORNER_REACH_MM : EDGE_REACH_MM) * camera.pxPerMm;
  const found = snapToEdges(
    { x: px.x - crop.x, y: px.y - crop.y },
    findEdges(gray, crop.width, crop.height),
    want,
    reach,
  );
  return found ? { x: crop.x + found.x, y: crop.y + found.y } : null;
}

/**
 * The round dark feature (a hole) under or right beside a tapped pixel of
 * the live picture: its centre as a pixel and its diameter in mm. null when
 * the tap is on nothing round – then the tap itself is the point.
 */
export function holeAt(px: Point): { px: Point; diameter: number } | null {
  const grabbed = grabCrop(px, SNAP_HALF_MM);
  if (!grabbed) return null;
  const { crop, gray, camera } = grabbed;
  const marker = findMarker(gray, crop.width, crop.height, {
    light: camera.lightMarker,
    maxShare: 0.7,
    minDiameter: Math.max(6, camera.pxPerMm),
  });
  const tap = { x: px.x - crop.x, y: px.y - crop.y };
  if (!snapsTo(tap, marker, SNAP_REACH_MM * camera.pxPerMm)) return null;
  return {
    px: { x: crop.x + marker.x, y: crop.y + marker.y },
    diameter: marker.diameter / camera.pxPerMm,
  };
}
