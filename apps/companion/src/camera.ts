import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';

/**
 * The picture settings of the USB camera (exposure, gain, brightness …), read and set through `v4l2-ctl`: the
 * names, ranges and menus are what the camera reports – never wired in, they differ from camera to camera – and
 * a write is checked against the list just read before anything is sent. Only a short list of picture controls
 * may be set at all (`ALLOWED_CONTROLS`); the device comes from the environment, never from a request; `v4l2-ctl`
 * is run with a fixed argument list and no shell.
 *
 * Where this stops: it changes how the camera makes its picture, nothing of the machine. The routes are open like
 * the relay and the libraries (the login protects only update, power-off and itself): the list, the ranges the
 * camera reports and the bounds below are the limit.
 */

/** The picture controls that may be set. Both spellings of a family are there: kernels before 4.x named them differently. */
export const ALLOWED_CONTROLS: readonly string[] = [
  'auto_exposure',
  'exposure_auto',
  'exposure_time_absolute',
  'exposure_absolute',
  'exposure_dynamic_framerate',
  'exposure_auto_priority',
  'gain',
  'brightness',
  'contrast',
  'saturation',
  'sharpness',
  'white_balance_automatic',
  'white_balance_temperature_auto',
  'white_balance_temperature',
  'focus_automatic_continuous',
  'focus_auto',
  'focus_absolute',
  'backlight_compensation',
  'power_line_frequency',
];

/**
 * The switches that make another control active or inactive (exposure time while auto exposure is off, the white
 * balance temperature while automatic is off, the focus while autofocus is off): set first, then read again.
 */
export const MODE_CONTROLS: readonly string[] = [
  'auto_exposure',
  'exposure_auto',
  'white_balance_automatic',
  'white_balance_temperature_auto',
  'focus_automatic_continuous',
  'focus_auto',
];

/** What can go wrong with a whole request: the app has a German sentence for each. */
export const CAMERA_ERROR_CODES = [
  'no-v4l2',
  'no-device',
  'no-permission',
  'timeout',
  'failed',
  'bad-request',
  'rate-limited',
  'not-supported',
] as const;
export type CameraErrorCode = (typeof CAMERA_ERROR_CODES)[number];

/** Why one control of a request was refused, as `refused:<why>` in its result. */
export const CONTROL_REFUSALS = [
  'not-allowed',
  'unknown',
  'read-only',
  'inactive',
  'range',
  'step',
  'menu',
  'driver',
] as const;
export type ControlRefusal = (typeof CONTROL_REFUSALS)[number];

/** How a refused request is answered (an unknown route is a 404, so no code uses that). */
export const CAMERA_STATUS: Record<CameraErrorCode, number> = {
  'no-v4l2': 501,
  'not-supported': 501,
  'no-device': 503,
  'no-permission': 403,
  timeout: 504,
  failed: 502,
  'bad-request': 400,
  'rate-limited': 429,
};

export class CameraError extends Error {
  constructor(
    readonly code: CameraErrorCode,
    readonly detail?: string,
  ) {
    super(code);
  }
}

export type ControlType = 'int' | 'bool' | 'menu';

export interface MenuEntry {
  value: number;
  label: string;
}

/** A control as the camera reports it. `bool` has the range 0–1, `menu` the values of its entries. */
export interface CameraControl {
  name: string;
  type: ControlType;
  min: number;
  max: number;
  step: number;
  default: number;
  value: number;
  /** The camera does not act on it now (exposure time while auto exposure is on) */
  inactive: boolean;
  readOnly: boolean;
  menu?: MenuEntry[];
}

export type ControlResult =
  | { ok: true; value: number }
  | { ok: false; error: `refused:${ControlRefusal}`; detail?: string };

const CONTROL_LINE = /^\s*([a-z][a-z0-9_]*)\s+0x[0-9a-f]+\s+\(([a-z0-9]+)\)\s*:\s*(.*)$/;
const MENU_LINE = /^\s+(-?\d+):\s*(.*?)\s*$/;

/** One `key=number` of a control line, or null. The keys are the fixed ones below. */
function field(rest: string, key: 'min' | 'max' | 'step' | 'default' | 'value'): number | null {
  const found = new RegExp(`(?:^|\\s)${key}=(-?\\d+)`).exec(rest);
  return found ? Number(found[1]) : null;
}

/**
 * What `v4l2-ctl --list-ctrls-menus` prints, as controls. Section headers, blank lines and controls of other
 * kinds (buttons, bitmasks, 64-bit and array controls) are skipped, and so is a control whose numbers are
 * incomplete: one that cannot be checked cannot be set.
 */
export function parseControls(text: string): CameraControl[] {
  const controls: CameraControl[] = [];
  let menu: CameraControl | null = null;
  for (const line of text.split('\n')) {
    const control = CONTROL_LINE.exec(line);
    if (control) {
      menu = null;
      const [, name, kind, rest] = control as unknown as [string, string, string, string];
      const type: ControlType | null =
        kind === 'int'
          ? 'int'
          : kind === 'bool'
            ? 'bool'
            : kind === 'menu' || kind === 'intmenu'
              ? 'menu'
              : null;
      if (type === null) continue;
      const value = field(rest, 'value');
      const def = field(rest, 'default');
      if (value === null || def === null) continue;
      const flags = (/\bflags=(.*)$/.exec(rest)?.[1] ?? '').split(/[\s,]+/).filter(Boolean);
      let min = field(rest, 'min');
      let max = field(rest, 'max');
      let step = field(rest, 'step');
      if (type === 'bool') {
        // A switch prints no range
        min = min ?? 0;
        max = max ?? 1;
        step = step ?? 1;
      } else if (type === 'menu') {
        // A menu prints no step; its choices are the entries that follow, not the numbers between min and max
        if (min === null || max === null) continue;
        step = step ?? 1;
      } else if (min === null || max === null || step === null) {
        continue;
      }
      if (step < 1 || min > max) continue;
      const next: CameraControl = {
        name: name!,
        type,
        min,
        max,
        step,
        default: def,
        value,
        inactive: flags.includes('inactive'),
        readOnly: flags.includes('read-only'),
        ...(type === 'menu' ? { menu: [] } : {}),
      };
      controls.push(next);
      if (type === 'menu') menu = next;
      continue;
    }
    const entry = menu ? MENU_LINE.exec(line) : null;
    if (menu && entry) menu.menu!.push({ value: Number(entry[1]), label: entry[2]! });
  }
  return controls;
}

/** The controls that may be set: what the app is shown. */
const visible = (controls: readonly CameraControl[]) =>
  controls.filter((c) => ALLOWED_CONTROLS.includes(c.name));

/** Why a value may not be set on the control the camera reports, or null. Never clamps: a value is right or refused. */
export function refusal(
  name: string,
  value: number,
  controls: readonly CameraControl[],
): ControlRefusal | null {
  if (!ALLOWED_CONTROLS.includes(name)) return 'not-allowed';
  const control = controls.find((c) => c.name === name);
  if (!control) return 'unknown';
  if (control.readOnly) return 'read-only';
  if (control.inactive) return 'inactive';
  if (control.type === 'bool') return value === 0 || value === 1 ? null : 'range';
  if (control.type === 'menu') return control.menu?.some((e) => e.value === value) ? null : 'menu';
  if (value < control.min || value > control.max) return 'range';
  return (value - control.min) % control.step === 0 ? null : 'step';
}

/** A request may carry this many controls, and a body of a few KB (the route bounds it before it is read). */
export const MAX_WRITE_CONTROLS = 12;
export const CAMERA_BODY_LIMIT = 4096;
const NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** `{controls: {name: whole number}}` as pairs, or a `bad-request`. */
export function readWrite(body: unknown): [string, number][] {
  const controls =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as { controls?: unknown }).controls
      : undefined;
  if (typeof controls !== 'object' || controls === null || Array.isArray(controls))
    throw new CameraError('bad-request');
  const pairs = Object.entries(controls);
  if (pairs.length === 0 || pairs.length > MAX_WRITE_CONTROLS) throw new CameraError('bad-request');
  for (const [name, value] of pairs) {
    if (!NAME.test(name) || typeof value !== 'number' || !Number.isSafeInteger(value))
      throw new CameraError('bad-request');
  }
  return pairs as [string, number][];
}

/** What a run of `v4l2-ctl` came to. */
export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** The command is not there, or it did not finish in time */
  failure?: 'missing' | 'timeout';
}
export type Run = (args: readonly string[]) => Promise<RunResult>;

/** How long one `v4l2-ctl` may take. */
export const V4L2_TIMEOUT_MS = 3000;

type ExecError = (Error & { code?: unknown; killed?: boolean }) | null;
type ExecFileLike = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; env: Record<string, string> },
  callback: (error: ExecError, stdout: string, stderr: string) => void,
) => unknown;

/**
 * `v4l2-ctl` with the arguments it is given and nothing else: `execFile` (no shell), a fixed environment (the
 * messages are not translated), a time limit and a bound on its output.
 */
export function v4l2Runner(exec: ExecFileLike = execFile as unknown as ExecFileLike): Run {
  return (args) =>
    new Promise((done) =>
      exec(
        'v4l2-ctl',
        [...args],
        {
          timeout: V4L2_TIMEOUT_MS,
          maxBuffer: 256 * 1024,
          env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C' },
        },
        (error, stdout, stderr) => {
          if (!error) return done({ code: 0, stdout, stderr });
          const failure =
            error.code === 'ENOENT' ? 'missing' : error.killed ? 'timeout' : undefined;
          done({
            code: typeof error.code === 'number' ? error.code : -1,
            stdout,
            stderr,
            ...(failure ? { failure } : {}),
          });
        },
      ),
    );
}

/** The device may be opened for reading and writing (v4l2-ctl opens it that way). */
export const deviceAccess = (device: string) => access(device, constants.R_OK | constants.W_OK);

/** A device node under /dev with a plain name – it comes from the environment, but is checked all the same. */
const DEVICE = /^\/dev\/[A-Za-z0-9][A-Za-z0-9_./:-]*$/;
const safeDevice = (device: string) => DEVICE.test(device) && !device.includes('..');

export interface CameraOptions {
  device: string;
  run: Run;
  access?: (device: string) => Promise<void>;
  /** What was applied last (the companion's own small store – the app's synced documents are another thing) */
  load: () => unknown;
  save: (values: Record<string, number>) => void;
  now?: () => number;
  /** At most one write batch within this time (500 ms) */
  minGapMs?: number;
  log?: (message: string) => void;
}

const STORED_MAX = 32;
const detailOf = (text: string) => text.trim().slice(0, 200) || undefined;

export interface ApplyAnswer {
  controls: CameraControl[];
  results: Record<string, ControlResult>;
}

export class CameraControls {
  private readonly device: string;
  private readonly run: Run;
  private readonly checkAccess: (device: string) => Promise<void>;
  private readonly options: CameraOptions;
  private tail: Promise<unknown> = Promise.resolve();
  private lastBatch: number | null = null;

  constructor(options: CameraOptions) {
    this.options = options;
    this.device = options.device;
    this.run = options.run;
    this.checkAccess = options.access ?? deviceAccess;
  }

  /** Counts the jobs that may change the camera: a read that waits in the queue is shared only while none came after it. */
  private writes = 0;
  private listing: { writes: number; promise: Promise<CameraControl[]> } | null = null;

  /** One `v4l2-ctl` call at a time: a write and a read must not interleave, nor the re-apply at start with a request. */
  private enqueue<T>(job: () => Promise<T>, writes = true): Promise<T> {
    if (writes) this.writes += 1;
    const next = this.tail.then(job, job);
    this.tail = next.catch(() => undefined);
    return next;
  }

  /**
   * Whether the camera can be opened. The permission is told from the device itself, never from what a set
   * says: the driver also answers a set of an inactive control with "Permission denied".
   */
  private async open(): Promise<void> {
    if (!safeDevice(this.device)) throw new CameraError('no-device');
    try {
      await this.checkAccess(this.device);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new CameraError(code === 'EACCES' || code === 'EPERM' ? 'no-permission' : 'no-device');
    }
  }

  /** Every control the camera reports (of the kinds that can be checked). */
  private async read(): Promise<CameraControl[]> {
    await this.open();
    const result = await this.run(['-d', this.device, '--list-ctrls-menus']);
    if (result.failure === 'missing') throw new CameraError('no-v4l2');
    if (result.failure === 'timeout') throw new CameraError('timeout');
    if (result.code !== 0) {
      if (/permission denied/i.test(result.stderr)) throw new CameraError('no-permission');
      if (/no such (file|device)|cannot open device/i.test(result.stderr))
        throw new CameraError('no-device');
      throw new CameraError('failed', detailOf(result.stderr));
    }
    return parseControls(result.stdout);
  }

  /**
   * The controls of the camera that may be set, as they are now. Reads that come while one is waiting or running, with no
   * write behind it, share its answer: the route is open, and a page that asks again and again must not queue a
   * `v4l2-ctl` for each.
   */
  list(): Promise<CameraControl[]> {
    if (this.listing && this.listing.writes === this.writes) return this.listing.promise;
    const promise = this.enqueue(async () => visible(await this.read()), false);
    const mine = { writes: this.writes, promise };
    this.listing = mine;
    const done = () => {
      if (this.listing === mine) this.listing = null;
    };
    promise.then(done, done);
    return promise;
  }

  /**
   * Sets what was asked for: each value is checked against the list just read, the switches (auto exposure …) go
   * first and the list is read again after each, then the rest; the answer is the list read once more – what
   * the camera says is the truth – with a result per control.
   */
  async apply(body: unknown): Promise<ApplyAnswer> {
    const wanted = readWrite(body);
    const at = (this.options.now ?? Date.now)();
    const gap = this.options.minGapMs ?? 500;
    if (this.lastBatch !== null && at - this.lastBatch < gap)
      throw new CameraError('rate-limited', String(gap - (at - this.lastBatch)));
    this.lastBatch = at;
    return this.enqueue(() => this.batch(wanted, true));
  }

  private async batch(wanted: [string, number][], keep: boolean): Promise<ApplyAnswer> {
    const results = new Map<string, ControlResult>();
    let current = await this.read();
    let changed = false;
    const first = wanted.filter(([name]) => MODE_CONTROLS.includes(name));
    const rest = wanted.filter(([name]) => !MODE_CONTROLS.includes(name));
    for (const [name, value] of [...first, ...rest]) {
      const why = refusal(name, value, current);
      if (why) {
        results.set(name, { ok: false, error: `refused:${why}` });
        continue;
      }
      const set = await this.run(['-d', this.device, '--set-ctrl', `${name}=${value}`]);
      if (set.failure === 'missing') throw new CameraError('no-v4l2');
      if (set.failure === 'timeout') throw new CameraError('timeout');
      if (set.code !== 0) {
        // Not a permission problem of the device (that was looked at before): the driver did not take it
        const detail = detailOf(set.stderr);
        results.set(name, { ok: false, error: 'refused:driver', ...(detail ? { detail } : {}) });
        continue;
      }
      changed = true;
      results.set(name, { ok: true, value });
      if (MODE_CONTROLS.includes(name)) current = await this.read();
    }
    const final = changed ? await this.read() : current;
    const stored: Record<string, number> = {};
    for (const [name, result] of results) {
      if (!result.ok) continue;
      // What the camera answers is what holds (it may round or limit a value)
      const value = final.find((c) => c.name === name)?.value ?? result.value;
      results.set(name, { ok: true, value });
      stored[name] = value;
    }
    if (keep && Object.keys(stored).length > 0) this.options.save({ ...this.stored(), ...stored });
    return { controls: visible(final), results: Object.fromEntries(results) };
  }

  /** What was applied last, as far as it is still a control and a whole number (the store is read, not trusted). */
  stored(): Record<string, number> {
    const value = this.options.load();
    const kept: Record<string, number> = {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return kept;
    for (const [name, v] of Object.entries(value).slice(0, STORED_MAX)) {
      if (ALLOWED_CONTROLS.includes(name) && typeof v === 'number' && Number.isSafeInteger(v))
        kept[name] = v;
    }
    return kept;
  }

  /**
   * Puts the last applied values back where the camera lost them (a replug, a reboot of the Pi): only controls it
   * still reports and still accepts, and only those that differ. Nothing stored: no call at all.
   */
  restore(): Promise<{ applied: string[]; refused: string[] } | null> {
    const wanted = Object.entries(this.stored());
    if (wanted.length === 0) return Promise.resolve(null);
    return this.enqueue(async () => {
      const current = await this.read();
      const todo = wanted.filter(
        ([name, value]) => current.find((c) => c.name === name)?.value !== value,
      );
      if (todo.length === 0) return { applied: [], refused: [] };
      const { results } = await this.batch(todo, false);
      const named = (ok: boolean) =>
        Object.entries(results)
          .filter(([, r]) => r.ok === ok)
          .map(([name]) => name);
      return { applied: named(true), refused: named(false) };
    });
  }

  /**
   * `restore` at the start of the companion, never awaited: the camera may not be there yet (the USB device comes
   * up while the Pi boots), so a missing device or a timeout is tried again a few times. A failure is logged and
   * ends it – it never stops the start.
   */
  async restoreAtStart(wait: (ms: number) => Promise<void>, delaysMs = [2000, 10_000, 10_000]) {
    const log = this.options.log ?? (() => undefined);
    for (const delay of delaysMs) {
      await wait(delay);
      try {
        const done = await this.restore();
        if (done)
          log(
            `camera: put back ${done.applied.length}, refused ${done.refused.length} of the last values`,
          );
        return;
      } catch (error) {
        const code = error instanceof CameraError ? error.code : 'failed';
        log(`camera: putting back the last values failed (${code})`);
        if (code !== 'no-device' && code !== 'timeout') return;
      }
    }
  }
}
