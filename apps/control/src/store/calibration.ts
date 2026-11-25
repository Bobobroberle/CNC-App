import { parseConfigYaml, type YamlMap } from '@lowrider/fluidnc-client';
import {
  axisErrors,
  combineReversal,
  correctedSteps,
  planGrid,
  predictMarker,
  squaringPulloff,
  zTilt,
  type AxisErrors,
  type MarkerPair,
  type Vec,
} from '@lowrider/workshop';
import { create } from 'zustand';
import { t } from '../i18n';
import { pixelToMm } from '../lib/camera';
import { formatPlain } from '../lib/format';
import { travelShortfall, type Shortfall } from '../lib/calibrationPlate';
import { findMarker, toGray, type Marker } from '../lib/markers';
import { cameraElement, pictureSize } from './camera';
import { useJob } from './job';
import { useMachine } from './machine';
import { useMeasurements } from './measurements';
import { settled, wait } from './settle';
import { useWorkshop, type CalibrationSettings } from './workshop';

/** What a centring run needs from the outside world (camera and machine). */
export interface CentreIO {
  /** Marker centre in image pixels relative to the image centre, or null */
  marker(): Promise<Vec | null>;
  /** Pixels → machine mm at a given scale (camera rotation applied) */
  toMm(px: Vec, pxPerMm: number): Vec;
  move(target: Vec): Promise<boolean>;
  /** Scale the camera was calibrated to, px/mm */
  pxPerMm: number;
  cancelled(): boolean;
}

/** Centred closer than this, mm */
export const CENTRE_TOLERANCE = 0.02;
/** Every final approach comes from the same side, from this far, mm */
const BACKOFF = 0.3;

/**
 * Drives the machine until the marker sits in the image centre and returns
 * the machine XY of the marker. Every move ends with an approach in
 * `direction` (+1: from below on X and Y) so belt backlash is the same at
 * every point. The camera's scale is refined from what each move shows, so
 * a rough camera calibration still converges.
 */
export async function centreLoop(
  io: CentreIO,
  start: Vec,
  direction: 1 | -1 = 1,
  maxSteps = 8,
): Promise<Vec | null> {
  let pos = start;
  let scale = io.pxPerMm;
  let last: { px: Vec; moved: Vec } | null = null;
  for (let step = 0; step < maxSteps; step++) {
    if (io.cancelled()) return null;
    const px = await io.marker();
    if (!px) return null;
    if (last) {
      const shown = Math.hypot(px.x - last.px.x, px.y - last.px.y);
      const moved = Math.hypot(last.moved.x, last.moved.y);
      if (moved > 0.1) {
        scale = Math.min(io.pxPerMm * 3, Math.max(io.pxPerMm / 3, shown / moved));
      }
    }
    const d = io.toMm(px, scale);
    if (Math.hypot(d.x, d.y) < CENTRE_TOLERANCE) return { x: pos.x + d.x, y: pos.y + d.y };
    const target = { x: pos.x + d.x, y: pos.y + d.y };
    const pre = { x: target.x - direction * BACKOFF, y: target.y - direction * BACKOFF };
    if (!(await io.move(pre)) || !(await io.move(target))) return null;
    last = { px, moved: d };
    pos = target;
  }
  return null;
}

export interface CalibrationConfig {
  stepsX: number;
  stepsY: number;
  pulloff0: number;
  pulloff1: number;
  homingPositive: boolean;
}

/** The values the corrections change, from config.yaml. */
export function calibrationConfig(text: string): CalibrationConfig | null {
  const doc = parseConfigYaml(text);
  const map = (v: unknown): YamlMap => (typeof v === 'object' && v !== null ? (v as YamlMap) : {});
  const axes = map(doc.axes);
  const x = map(axes.x);
  const y = map(axes.y);
  const num = (v: unknown) => (typeof v === 'string' ? Number(v) : NaN);
  const c = {
    stepsX: num(x.steps_per_mm),
    stepsY: num(y.steps_per_mm),
    pulloff0: num(map(y.motor0).pulloff_mm),
    pulloff1: num(map(y.motor1).pulloff_mm),
    homingPositive: map(y.homing).positive_direction === 'true',
  };
  return [c.stepsX, c.stepsY, c.pulloff0, c.pulloff1].every(Number.isFinite) ? c : null;
}

export interface Correction {
  path: string;
  from: number;
  to: number;
}

/** Below these the machine counts as right: scale 0.03 %, gantry 0.05 mm. */
const SCALE_NOISE = 0.0003;
const SQUARE_NOISE = 0.05;

export interface Proposal {
  corrections: Correction[];
  /** Machine squareness used, degrees; null = not trustworthy yet */
  squareness: number | null;
  /** How far the X+ end of the gantry moves, mm */
  shift: number | null;
  /** Why something is not proposed */
  missing: ('turnPlate' | 'gantry' | 'config')[];
}

export function proposeCorrections(
  first: AxisErrors | null,
  turned: AxisErrors | null,
  settings: CalibrationSettings,
  config: CalibrationConfig | null,
): Proposal {
  const out: Proposal = { corrections: [], squareness: null, shift: null, missing: [] };
  if (!first) return out;
  if (!config) out.missing.push('config');
  // A print may be skewed itself: only the mean of both orientations is the machine.
  out.squareness = turned
    ? combineReversal(first, turned).squareness
    : settings.precise
      ? first.squareness
      : null;
  if (out.squareness === null) out.missing.push('turnPlate');
  if (!config) return out;
  if (settings.precise) {
    // Turned, the plate's X lies along machine Y: both runs measure both axes.
    const scaleX = turned ? (first.scaleX + turned.scaleX) / 2 : first.scaleX;
    const scaleY = turned ? (first.scaleY + turned.scaleY) / 2 : first.scaleY;
    if (Math.abs(scaleX - 1) > SCALE_NOISE) {
      out.corrections.push({
        path: 'axes/x/steps_per_mm',
        from: config.stepsX,
        to: correctedSteps(config.stepsX, scaleX),
      });
    }
    if (Math.abs(scaleY - 1) > SCALE_NOISE) {
      out.corrections.push({
        path: 'axes/y/steps_per_mm',
        from: config.stepsY,
        to: correctedSteps(config.stepsY, scaleY),
      });
    }
  }
  if (out.squareness !== null) {
    if (!settings.gantryWidth || !settings.motor1Side) {
      out.missing.push('gantry');
    } else {
      const r = squaringPulloff({
        pulloff0: config.pulloff0,
        pulloff1: config.pulloff1,
        gantryWidth: settings.gantryWidth,
        squareness: out.squareness,
        motor1Side: settings.motor1Side,
        homingPositive: config.homingPositive,
      });
      out.shift = r.shift;
      if (Math.abs(r.shift) > SQUARE_NOISE) {
        if (r.pulloff0 !== config.pulloff0) {
          out.corrections.push({
            path: 'axes/y/motor0/pulloff_mm',
            from: config.pulloff0,
            to: r.pulloff0,
          });
        }
        if (r.pulloff1 !== config.pulloff1) {
          out.corrections.push({
            path: 'axes/y/motor1/pulloff_mm',
            from: config.pulloff1,
            to: r.pulloff1,
          });
        }
      }
    }
  }
  return out;
}

// ---------- camera and machine ----------

let canvas: HTMLCanvasElement | null = null;

/** The current camera picture as grey values, or null without a picture. */
export function grabFrame(): { gray: Uint8Array; width: number; height: number } | null {
  const el = cameraElement();
  if (!el || typeof document === 'undefined') return null;
  const { width, height } = pictureSize(el);
  if (!width || !height) return null;
  canvas ??= document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(el, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return { gray: toGray(data, width, height), width, height };
}

/** Marker in the picture right now: pixel offset from the centre and its size. */
export function detectMarker(): { px: Vec; marker: Marker; mm: Vec; diameter: number } | null {
  const frame = grabFrame();
  if (!frame) return null;
  const camera = useWorkshop.getState().settings.camera;
  const marker = findMarker(frame.gray, frame.width, frame.height, { light: camera.lightMarker });
  if (!marker) return null;
  const px = { x: marker.x - frame.width / 2, y: marker.y - frame.height / 2 };
  return {
    px,
    marker,
    mm: pixelToMm(camera, px.x, px.y),
    diameter: marker.diameter / camera.pxPerMm,
  };
}

export type CalibrationTask = 'centre' | 'grid' | 'backlash' | 'tilt';

interface CalibrationStore {
  task: CalibrationTask | null;
  progress: { done: number; total: number } | null;
  first: AxisErrors | null;
  turned: AxisErrors | null;
  backlash: Vec | null;
  tilt: { x: number; y: number; per100: number } | null;
  config: CalibrationConfig | null;
  /**
   * Centres the camera on the marker or hole under it; returns the spindle
   * position at which the crosshair sits on it (add the camera offset for
   * the marker's own machine XY).
   */
  centre(): Promise<Vec | null>;
  /** Measure the grid; `turned` = second run with the plate turned by 90° */
  measureGrid(turned: boolean): Promise<boolean>;
  measureBacklash(): Promise<boolean>;
  measureTilt(): Promise<boolean>;
  readConfig(): Promise<boolean>;
  apply(corrections: Correction[]): Promise<boolean>;
  cancel(): void;
  reset(): void;
}

let cancelled = false;
/** Why the running task was refused before it moved (the log says this instead of "no marker") */
let refusal: { text: string; key: string } | null = null;

/**
 * Whether the measuring grid fits the travel from the corner dot the camera stands over: null if it does
 * (or cannot be told – a machine that is not homed has no known zero, so nothing is claimed), else what
 * falls short. Pure, so the card and the run say the same.
 */
export function gridShortfall(
  start: Vec,
  homed: boolean,
  profile: {
    softLimits: boolean;
    travel: { x: { min: number; max: number }; y: { min: number; max: number } };
  },
  spanX: number,
  spanY: number,
): Shortfall | null {
  if (!homed || !profile.softLimits) return null;
  return travelShortfall(start, profile.travel, spanX, spanY, BACKOFF);
}

function settings(): CalibrationSettings {
  return useWorkshop.getState().settings.calibration;
}

/**
 * Where the machine stands, from a status report that came in after now: the
 * one in the store may be from before the move that brought it here.
 */
async function here(): Promise<Vec | null> {
  const s = await settled();
  return s ? { x: s.mpos[0] ?? 0, y: s.mpos[1] ?? 0 } : null;
}

function machineIO(): CentreIO {
  const camera = useWorkshop.getState().settings.camera;
  const feed = Math.min(2000, useJob.getState().profile.jogFeed.xy);
  return {
    pxPerMm: camera.pxPerMm,
    async marker() {
      // Let the machine settle and the stream catch up, then read the picture.
      await wait(settings().settleMs);
      return detectMarker()?.px ?? null;
    },
    toMm: (px, pxPerMm) => pixelToMm({ ...camera, pxPerMm }, px.x, px.y),
    move: (target) => useMachine.getState().moveMachine(target, feed),
    cancelled: () => cancelled,
  };
}

export const useCalibration = create<CalibrationStore>((set, get) => {
  /** Runs one task; only one at a time, and the log says how it ended. */
  async function run<T>(task: CalibrationTask, body: () => Promise<T | null>): Promise<T | null> {
    if (get().task) return null;
    cancelled = false;
    set({ task, progress: null });
    try {
      const result = await body();
      if (result === null) {
        const { addLog } = useMachine.getState();
        if (cancelled) addLog('error', t('calibration.cancelled'));
        else if (refusal) addLog('error', refusal.text, refusal.key);
        else addLog('error', t('calibration.noMarker'));
      }
      return result;
    } finally {
      refusal = null;
      set({ task: null, progress: null });
    }
  }

  const centreHere = async (direction: 1 | -1 = 1) => {
    const start = await here();
    return start ? centreLoop(machineIO(), start, direction) : null;
  };

  return {
    task: null,
    progress: null,
    first: null,
    turned: null,
    backlash: null,
    tilt: null,
    config: null,

    centre: () => run('centre', () => centreHere()),

    async measureGrid(turned) {
      const errors = await run('grid', async () => {
        const s = settings();
        const grid = planGrid(s.spanX, s.spanY, s.points, s.points);
        const io = machineIO();
        const pairs: MarkerPair[] = [];
        // The run drives the field towards +X and +Y from the corner the camera stands over: ask the travel
        // before the first move, not after it ended somewhere against a limit.
        const start = await here();
        if (!start) return null;
        const { homed } = useMachine.getState();
        const short = gridShortfall(start, homed, useJob.getState().profile, s.spanX, s.spanY);
        if (short) {
          refusal = {
            key: 'calibration.noRoom',
            text: t('calibration.noRoom', {
              axis: short.axis.toUpperCase(),
              side: t(short.side === 'max' ? 'calibration.sideMax' : 'calibration.sideMin'),
              short: formatPlain(short.short, 1),
            }),
          };
          return null;
        }
        set({ progress: { done: 0, total: grid.length } });
        for (const nominal of grid) {
          let found: Vec | null;
          if (pairs.length === 0) {
            found = await centreLoop(io, start);
          } else {
            const guess = predictMarker(pairs, nominal)!;
            const pre = { x: guess.x - BACKOFF, y: guess.y - BACKOFF };
            if (!(await io.move(pre)) || !(await io.move(guess))) return null;
            found = await centreLoop(io, guess);
          }
          if (!found) return null;
          pairs.push({ nominal, machine: found });
          set({ progress: { done: pairs.length, total: grid.length } });
        }
        // Back to the first marker: the operator finds the machine where it started.
        await io.move(pairs[0]!.machine);
        return axisErrors(pairs);
      });
      if (!errors) return false;
      set(turned ? { turned: errors } : { first: errors, turned: null });
      useMeasurements.getState().record('machine-grid', {
        scaleX: errors.scaleX,
        scaleY: errors.scaleY,
        squareness: errors.squareness,
        plateAngle: errors.plateAngle,
        rms: errors.rms,
        max: errors.max,
        points: errors.points,
        turned: Boolean(turned),
      });
      useMachine.getState().addLog('info', t('calibration.measured', { points: errors.points }));
      return true;
    },

    async measureBacklash() {
      const result = await run('backlash', async () => {
        const io = machineIO();
        const start = await here();
        if (!start) return null;
        // Centre once from below, once from above; the difference is the play.
        if (!(await io.move({ x: start.x - 0.5, y: start.y - 0.5 }))) return null;
        const low = await centreHere(1);
        if (!low) return null;
        if (!(await io.move({ x: low.x + 0.5, y: low.y + 0.5 }))) return null;
        const high = await centreHere(-1);
        if (!high) return null;
        await io.move({ x: low.x - BACKOFF, y: low.y - BACKOFF });
        await io.move(low);
        return { x: Math.abs(high.x - low.x), y: Math.abs(high.y - low.y) };
      });
      if (!result) return false;
      set({ backlash: result });
      useMeasurements.getState().record('machine-backlash', { x: result.x, y: result.y });
      return true;
    },

    async measureTilt() {
      const result = await run('tilt', async () => {
        const status = useMachine.getState().status;
        if (!status) return null;
        const z = status.mpos[2] ?? 0;
        const rise = settings().zRise;
        const feedZ = useJob.getState().profile.jogFeed.z;
        const low = await centreHere();
        if (!low) return null;
        // Only upwards from where the operator stood: nothing can be hit.
        if (!(await useMachine.getState().moveMachine({ z: z + rise }, feedZ))) return null;
        const high = await centreHere();
        await useMachine.getState().moveMachine({ z }, feedZ);
        if (!high) return null;
        return zTilt(low, high, rise);
      });
      if (!result) return false;
      set({ tilt: result });
      useMeasurements.getState().record('machine-tilt', {
        x: result.x,
        y: result.y,
        per100: result.per100,
      });
      return true;
    },

    async readConfig() {
      const file = await useMachine.getState().readConfigFile();
      const config = file ? calibrationConfig(file.text) : null;
      set({ config });
      return config !== null;
    },

    async apply(corrections) {
      const ok = await useMachine
        .getState()
        .applyConfigChanges(corrections.map((c) => ({ path: c.path, value: String(c.to) })));
      if (ok) {
        // The only trace of a change to the controller: what was there, what was written
        useMeasurements.getState().record(
          'correction',
          Object.fromEntries(
            corrections.flatMap((c) => [
              [`${c.path}.from`, c.from],
              [`${c.path}.to`, c.to],
            ]),
          ),
        );
        useMachine.getState().addLog('info', t('calibration.applied'));
        // The old measurement no longer describes the machine.
        set({ first: null, turned: null, config: null });
      }
      return ok;
    },

    cancel() {
      cancelled = true;
    },

    reset() {
      set({ first: null, turned: null, backlash: null, tilt: null });
    },
  };
});
