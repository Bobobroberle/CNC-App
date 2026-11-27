import { companionBase, type CameraControl } from './companion';

/**
 * The camera's picture settings (Einstellungen → Kamera → Belichtung und Bild): what the companion reports from
 * the camera, shown as it is. Pure – the unit of the exposure, the order of the settings, what a typed number
 * means for a control, and when a value read from the camera may go into the scan panel.
 */

/** The exposure time: the one control shown in milliseconds – the V4L2 unit of it is 100 µs (value 10 = 1 ms). */
export const EXPOSURE_TIME = ['exposure_time_absolute', 'exposure_absolute'] as const;
/** Auto exposure: a menu whose entry 1 is "manual" (V4L2_EXPOSURE_MANUAL; 3 is aperture priority = automatic). */
export const EXPOSURE_AUTO = ['auto_exposure', 'exposure_auto'] as const;
export const EXPOSURE_MANUAL = 1;
/** Raw exposure units in one millisecond */
export const EXPOSURE_PER_MS = 10;

const has = (names: readonly string[], name: string) => names.includes(name);
export const isExposureTime = (name: string) => has(EXPOSURE_TIME, name);
export const isExposureAuto = (name: string) => has(EXPOSURE_AUTO, name);

/** What the exposure control's number means in milliseconds. */
export const rawToMs = (raw: number) => raw / EXPOSURE_PER_MS;

export type ControlGroup = 'exposure' | 'picture' | 'whiteBalance' | 'focus';

/** The order of the settings, in groups: only these are shown (the companion lets only these through). */
export const GROUPS: readonly { id: ControlGroup; names: readonly string[] }[] = [
  {
    id: 'exposure',
    names: [
      'auto_exposure',
      'exposure_auto',
      'exposure_time_absolute',
      'exposure_absolute',
      'exposure_dynamic_framerate',
      'exposure_auto_priority',
      'gain',
    ],
  },
  {
    id: 'picture',
    names: [
      'brightness',
      'contrast',
      'saturation',
      'sharpness',
      'backlight_compensation',
      'power_line_frequency',
    ],
  },
  {
    id: 'whiteBalance',
    names: [
      'white_balance_automatic',
      'white_balance_temperature_auto',
      'white_balance_temperature',
    ],
  },
  {
    id: 'focus',
    names: ['focus_automatic_continuous', 'focus_auto', 'focus_absolute'],
  },
];

/** The settings the camera reports, in groups and in the order of the groups; empty groups are left out. */
export function grouped(
  controls: readonly CameraControl[],
): { group: ControlGroup; controls: CameraControl[] }[] {
  return GROUPS.map(({ id, names }) => ({
    group: id,
    controls: names.flatMap((name) => controls.filter((c) => c.name === name)),
  })).filter((g) => g.controls.length > 0);
}

/** Where a setting is shown and typed: the exposure time in ms, everything else as the camera counts it. */
export const unitOf = (control: CameraControl): 'ms' | null =>
  control.type === 'int' && isExposureTime(control.name) ? 'ms' : null;

/** The number as shown in the field. */
export const shownValue = (control: CameraControl, raw: number): number =>
  unitOf(control) === 'ms' ? rawToMs(raw) : raw;

/**
 * What a ± button moves by, in the camera's own units: one step of the camera – but never so small that it takes
 * a hundred taps across the range (the white balance runs over thousands of kelvin in steps of 1), and for the
 * exposure time one millisecond.
 */
export function buttonStep(control: CameraControl): number {
  const { min, max, step } = control;
  const wanted = isExposureTime(control.name)
    ? EXPOSURE_PER_MS
    : 10 ** Math.floor(Math.log10(Math.max(1, (max - min) / 50)));
  return Math.max(step, Math.ceil(wanted / step) * step);
}

/** The value a ± button leads to, kept on the grid and in range – or null where there is no further step. */
export function steppedValue(control: CameraControl, direction: 1 | -1): number | null {
  const by = buttonStep(control);
  // From the value on the grid of the camera, rounded to the grid of the buttons
  const next = control.value + direction * by;
  const target = Math.min(control.max, Math.max(control.min, next));
  const onGrid = control.min + Math.round((target - control.min) / control.step) * control.step;
  const bounded = onGrid > control.max ? onGrid - control.step : onGrid;
  return bounded === control.value ? null : bounded;
}

/**
 * What a number typed into the field means for the camera: the whole number it counts in, on the grid of the camera
 * (the exposure time typed in ms is rounded to the camera's unit), or the reason it cannot be: outside the range
 * is never made to fit.
 */
export function rawOfTyped(
  control: CameraControl,
  typed: number,
): { raw: number } | { error: 'not-a-number' | 'range' } {
  if (!Number.isFinite(typed)) return { error: 'not-a-number' };
  const counted = unitOf(control) === 'ms' ? typed * EXPOSURE_PER_MS : typed;
  const onGrid = control.min + Math.round((counted - control.min) / control.step) * control.step;
  if (onGrid < control.min || onGrid > control.max) return { error: 'range' };
  return { raw: Math.round(onGrid) };
}

/** What a read of the camera allows the scan panel to take over: a value, or why not. */
export type Takeover = { kind: 'ms'; ms: number } | { kind: 'auto' } | { kind: 'unavailable' };

/**
 * The exposure time to put into the scan panel – only from a read of the camera made just now, and only where it
 * is a fixed one: a camera on automatic has no exposure time to take (it changes with the light), and a camera
 * that reports none has nothing to take. Never from what was merely typed.
 */
export function takeover(controls: readonly CameraControl[]): Takeover {
  const time = controls.find((c) => isExposureTime(c.name) && c.type === 'int');
  if (!time) return { kind: 'unavailable' };
  const auto = controls.find((c) => isExposureAuto(c.name));
  if (auto && auto.value !== EXPOSURE_MANUAL) return { kind: 'auto' };
  if (time.inactive || time.readOnly) return { kind: 'unavailable' };
  return { kind: 'ms', ms: rawToMs(time.value) };
}

/**
 * Whether the picture this device shows is the companion's own camera: the stream is chosen and comes from the
 * companion's host (`CAMERA_URL` is a port there). The tablet's own camera, the simulator's and a stream from
 * another device are not the camera the companion sets.
 */
export function streamIsPis(streamUrl: string, companionUrl: string): boolean {
  const base = companionBase(companionUrl);
  if (!base || streamUrl.trim() === '') return false;
  try {
    return new URL(streamUrl).hostname === new URL(base).hostname;
  } catch {
    return false;
  }
}

/** The codes of a failed read or write that the app has a sentence for; `old` and `unreachable` are of this side. */
export type CameraFailure = string;

/** The code a failed call to the companion stands for. */
export function failureOf(error: unknown): CameraFailure {
  const status = (error as { status?: unknown } | null)?.status;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof status !== 'number') return 'unreachable';
  // The route is not there: a companion from before this feature
  if (status === 404 || status === 405) return 'old';
  return typeof code === 'string' && /^[a-z][a-z0-9-]*$/.test(code) ? code : 'failed';
}
