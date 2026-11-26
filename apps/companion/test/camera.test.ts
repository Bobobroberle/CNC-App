import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ALLOWED_CONTROLS,
  CAMERA_ERROR_CODES,
  CONTROL_REFUSALS,
  CameraControls,
  CameraError,
  MAX_WRITE_CONTROLS,
  MODE_CONTROLS,
  V4L2_TIMEOUT_MS,
  deviceAccess,
  parseControls,
  readWrite,
  refusal,
  v4l2Runner,
  type CameraControl,
  type CameraOptions,
  type Run,
  type RunResult,
} from '../src/camera';
import { Store } from '../src/db';
import { buildServer } from '../src/server';
import { fakeCamera } from './cameraRig';

/**
 * What `v4l2-ctl -d /dev/video0 --list-ctrls-menus` prints for a USB webcam of the UVC class, in the format of
 * v4l-utils 1.22 (Raspberry Pi OS Bookworm). Written down from that format – `v4l2-ctl` is not installed where
 * these tests were made, so it is NOT a capture from a camera. The camera of the machine will differ in names and
 * ranges, which is why nothing of it is wired into the code.
 */
export const UVC_SAMPLE = `User Controls

                     brightness 0x00980900 (int)    : min=-64 max=64 step=1 default=0 value=0
                       contrast 0x00980901 (int)    : min=0 max=64 step=1 default=32 value=32
                     saturation 0x00980902 (int)    : min=0 max=128 step=1 default=64 value=64
                            hue 0x00980903 (int)    : min=-40 max=40 step=1 default=0 value=0
        white_balance_automatic 0x0098090c (bool)   : default=1 value=1
                          gamma 0x00980910 (int)    : min=72 max=500 step=1 default=100 value=100
                           gain 0x00980913 (int)    : min=0 max=100 step=1 default=0 value=0
           power_line_frequency 0x00980918 (menu)   : min=0 max=2 default=1 value=1 (50 Hz)
				0: Disabled
				1: 50 Hz
				2: 60 Hz
      white_balance_temperature 0x0098091a (int)    : min=2800 max=6500 step=1 default=4600 value=4600 flags=inactive
                      sharpness 0x0098091b (int)    : min=0 max=6 step=1 default=3 value=3
         backlight_compensation 0x0098091c (int)    : min=0 max=2 step=1 default=1 value=1

Camera Controls

                  auto_exposure 0x009a0901 (menu)   : min=0 max=3 default=3 value=3 (Aperture Priority Mode)
				1: Manual Mode
				3: Aperture Priority Mode
         exposure_time_absolute 0x009a0902 (int)    : min=1 max=5000 step=1 default=157 value=157 flags=inactive
     exposure_dynamic_framerate 0x009a0903 (bool)   : default=0 value=1
                   pan_absolute 0x009a0908 (int)    : min=-36000 max=36000 step=3600 default=0 value=0
                  tilt_absolute 0x009a0909 (int)    : min=-36000 max=36000 step=3600 default=0 value=0
                 focus_absolute 0x009a090a (int)    : min=0 max=250 step=5 default=0 value=0 flags=inactive
     focus_automatic_continuous 0x009a090c (bool)   : default=1 value=1
                  zoom_absolute 0x009a090d (int)    : min=100 max=500 step=1 default=100 value=100
`;

describe('reading what the camera reports', () => {
  const byName = (list: CameraControl[], name: string) => list.find((c) => c.name === name)!;
  const sample = parseControls(UVC_SAMPLE);

  it('reads ints, switches and menus with their numbers, flags and entries', () => {
    expect(byName(sample, 'brightness')).toEqual({
      name: 'brightness',
      type: 'int',
      min: -64,
      max: 64,
      step: 1,
      default: 0,
      value: 0,
      inactive: false,
      readOnly: false,
    });
    // a switch prints no range: 0–1
    expect(byName(sample, 'white_balance_automatic')).toMatchObject({
      type: 'bool',
      min: 0,
      max: 1,
      step: 1,
      default: 1,
      value: 1,
    });
    // a menu prints no step; its choices are the entries – sparse, not min…max
    const auto = byName(sample, 'auto_exposure');
    expect(auto).toMatchObject({ type: 'menu', min: 0, max: 3, value: 3 });
    expect(auto.menu).toEqual([
      { value: 1, label: 'Manual Mode' },
      { value: 3, label: 'Aperture Priority Mode' },
    ]);
    expect(byName(sample, 'power_line_frequency').menu).toEqual([
      { value: 0, label: 'Disabled' },
      { value: 1, label: '50 Hz' },
      { value: 2, label: '60 Hz' },
    ]);
    expect(byName(sample, 'exposure_time_absolute')).toMatchObject({
      type: 'int',
      min: 1,
      max: 5000,
      default: 157,
      value: 157,
      inactive: true,
    });
    expect(byName(sample, 'focus_absolute').step).toBe(5);
    expect(sample.map((c) => c.name)).toHaveLength(19);
  });

  it('skips headers, other kinds of control and controls it could not check', () => {
    const text = [
      'Camera Controls',
      '   restart 0x009a0905 (button) : flags=write-only, execute-on-write',
      '   big 0x009a0906 (int64) : value=5 default=0',
      '   mask 0x009a0907 (bitmask) : max=0x0000000f default=0x00000000 value=0x00000003',
      '   no_value 0x009a0908 (int) : min=0 max=10 step=1 default=0',
      '   no_range 0x009a0909 (int) : default=0 value=3',
      '   zero_step 0x009a090a (int) : min=0 max=10 step=0 default=0 value=3',
      '   backwards 0x009a090b (int) : min=10 max=0 step=1 default=0 value=3',
      '   menu_no_range 0x009a090c (menu) : default=0 value=1',
      '   ok_one 0x009a090d (int) : min=0 max=10 step=1 default=0 value=3',
      'not a control line at all',
      '',
    ].join('\n');
    expect(parseControls(text).map((c) => c.name)).toEqual(['ok_one']);
  });

  it('reads a list of flags, a read-only control and an integer menu', () => {
    const text = [
      '   gain 0x00980913 (int) : min=0 max=100 step=1 default=0 value=7 flags=inactive, volatile',
      '   level 0x00980914 (int) : min=0 max=9 step=1 default=0 value=1 flags=read-only',
      '   rate 0x00980915 (intmenu) : min=0 max=1 default=0 value=1 (2000000)',
      '\t\t0: 1000000 (0xf4240)',
      '\t\t1: 2000000 (0x1e8480)',
    ].join('\n');
    const [gain, level, rate] = parseControls(text);
    expect(gain).toMatchObject({ value: 7, inactive: true, readOnly: false });
    expect(level).toMatchObject({ inactive: false, readOnly: true });
    expect(rate).toMatchObject({ type: 'menu' });
    expect(rate!.menu).toEqual([
      { value: 0, label: '1000000 (0xf4240)' },
      { value: 1, label: '2000000 (0x1e8480)' },
    ]);
  });

  it('lets an entry line belong only to the menu above it', () => {
    const text = [
      '   gain 0x00980913 (int) : min=0 max=100 step=1 default=0 value=7',
      '\t\t0: not a menu entry',
      '   mode 0x00980914 (menu) : min=0 max=1 default=0 value=1 (b)',
      '\t\t0: a',
      '\t\t1: b',
    ].join('\n');
    const list = parseControls(text);
    expect(list[0]!.menu).toBeUndefined();
    expect(list[1]!.menu).toHaveLength(2);
  });
});

describe('what may be set', () => {
  const list = parseControls(UVC_SAMPLE);
  // exposure manual, so that the exposure time is active
  const manual = list.map((c) =>
    c.name === 'auto_exposure'
      ? { ...c, value: 1 }
      : c.name === 'exposure_time_absolute'
        ? { ...c, inactive: false }
        : c,
  );

  it('refuses a name that is not on the list, however the camera calls it', () => {
    // the camera reports "hue", "gamma", "pan_absolute" – none of them may be set from the app
    for (const name of ['hue', 'gamma', 'pan_absolute', 'zoom_absolute', 'nope'])
      expect(refusal(name, 0, manual), name).toBe('not-allowed');
    expect(ALLOWED_CONTROLS).not.toContain('hue');
    expect(ALLOWED_CONTROLS).not.toContain('zoom_absolute');
  });

  it('refuses a listed name the camera does not report', () => {
    expect(refusal('exposure_absolute', 100, manual)).toBe('unknown');
  });

  it('holds an integer to the range and to the grid of the step – and a switch and a menu to their values', () => {
    expect(refusal('gain', 0, manual)).toBeNull();
    expect(refusal('gain', 100, manual)).toBeNull();
    expect(refusal('gain', 101, manual)).toBe('range');
    expect(refusal('gain', -1, manual)).toBe('range');
    expect(refusal('brightness', -64, manual)).toBeNull();
    expect(refusal('brightness', -65, manual)).toBe('range');
    // a step of 5 from the minimum (0): 10 is on the grid, 12 is not – refused, never rounded
    expect(
      refusal(
        'focus_absolute',
        10,
        manual.map((c) => ({ ...c, inactive: false })),
      ),
    ).toBeNull();
    expect(
      refusal(
        'focus_absolute',
        12,
        manual.map((c) => ({ ...c, inactive: false })),
      ),
    ).toBe('step');
    expect(refusal('exposure_dynamic_framerate', 0, manual)).toBeNull();
    expect(refusal('exposure_dynamic_framerate', 1, manual)).toBeNull();
    expect(refusal('exposure_dynamic_framerate', 2, manual)).toBe('range');
    // the menu has 1 and 3: 2 lies between min and max and is refused
    expect(refusal('auto_exposure', 1, manual)).toBeNull();
    expect(refusal('auto_exposure', 3, manual)).toBeNull();
    expect(refusal('auto_exposure', 2, manual)).toBe('menu');
    expect(refusal('auto_exposure', 0, manual)).toBe('menu');
    const empty: CameraControl[] = [
      { ...manual.find((c) => c.name === 'auto_exposure')!, menu: undefined },
    ];
    expect(refusal('auto_exposure', 1, empty)).toBe('menu');
  });

  it('refuses an inactive control and a read-only one', () => {
    expect(refusal('exposure_time_absolute', 100, list)).toBe('inactive');
    expect(refusal('exposure_time_absolute', 100, manual)).toBeNull();
    const ro = manual.map((c) => (c.name === 'gain' ? { ...c, readOnly: true } : c));
    expect(refusal('gain', 1, ro)).toBe('read-only');
  });

  it('reads a request: whole numbers under plain names, a few of them', () => {
    expect(readWrite({ controls: { gain: 10, brightness: -3 } })).toEqual([
      ['gain', 10],
      ['brightness', -3],
    ]);
    const bad = (body: unknown) => {
      try {
        readWrite(body);
      } catch (error) {
        return (error as CameraError).code;
      }
      return 'accepted';
    };
    for (const body of [
      null,
      undefined,
      'gain=1',
      [],
      {},
      { controls: null },
      { controls: [] },
      { controls: {} },
      { controls: { gain: '1' } },
      { controls: { gain: 1.5 } },
      { controls: { gain: Number.NaN } },
      { controls: { gain: 2 ** 60 } },
      { controls: { gain: true } },
      { controls: { 'gain; rm -rf /': 1 } },
      { controls: { 'gain=1,brightness': 1 } },
      { controls: { '--set-ctrl': 1 } },
      { controls: { Gain: 1 } },
      { controls: { ['g'.repeat(65)]: 1 } },
      { controls: JSON.parse('{"__proto__": 1}') },
      {
        controls: Object.fromEntries(
          Array.from({ length: MAX_WRITE_CONTROLS + 1 }, (_, i) => [`c${i}`, 1]),
        ),
      },
    ])
      expect(bad(body), JSON.stringify(body)).toBe('bad-request');
  });

  it('has the same switches as families of controls, and a code for every way a request can end', () => {
    for (const name of MODE_CONTROLS) expect(ALLOWED_CONTROLS).toContain(name);
    expect(CAMERA_ERROR_CODES).toContain('no-permission');
    expect(CONTROL_REFUSALS).toContain('inactive');
  });
});

describe('the command that runs', () => {
  it('is v4l2-ctl with the arguments it is given, no shell, a time limit and a fixed environment', async () => {
    const seen: unknown[][] = [];
    const run = v4l2Runner((file, args, options, callback) => {
      seen.push([file, args, options]);
      callback(null, 'out', 'err');
    });
    const args = ['-d', '/dev/video0', '--list-ctrls-menus'] as const;
    expect(await run(args)).toEqual({ code: 0, stdout: 'out', stderr: 'err' });
    expect(seen).toHaveLength(1);
    const [file, given, options] = seen[0] as [string, string[], Record<string, unknown>];
    expect(file).toBe('v4l2-ctl');
    expect(given).toEqual(['-d', '/dev/video0', '--list-ctrls-menus']);
    // a copy, not the caller's array
    expect(given).not.toBe(args);
    expect(options.timeout).toBe(V4L2_TIMEOUT_MS);
    expect(V4L2_TIMEOUT_MS).toBe(3000);
    expect(options.maxBuffer).toBeLessThanOrEqual(1024 * 1024);
    expect(options.env).toMatchObject({ LC_ALL: 'C' });
    expect(Object.keys(options).sort()).toEqual(['env', 'maxBuffer', 'timeout']);
    expect(options).not.toHaveProperty('shell');
  });

  it('tells a missing command, a time-out and an exit code apart', async () => {
    const failing = (error: Record<string, unknown>) =>
      v4l2Runner((_f, _a, _o, callback) =>
        callback(Object.assign(new Error('x'), error), '', 'stderr text'),
      );
    expect(await failing({ code: 'ENOENT' })(['-d', 'x'])).toMatchObject({
      code: -1,
      failure: 'missing',
    });
    expect(await failing({ killed: true, code: null })(['-d', 'x'])).toMatchObject({
      failure: 'timeout',
    });
    const exit = await failing({ code: 1 })(['-d', 'x']);
    expect(exit).toEqual({ code: 1, stdout: '', stderr: 'stderr text' });
    expect(await failing({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })(['-d', 'x'])).toMatchObject(
      {
        code: -1,
      },
    );
  });

  it('wants the device to be open for reading and writing', async () => {
    await expect(deviceAccess('/dev/null')).resolves.toBeUndefined();
    await expect(deviceAccess('/dev/definitely-not-there-0')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------

const DEVICE = '/dev/video0';
const LIST = ['-d', DEVICE, '--list-ctrls-menus'];
const set = (assignment: string) => ['-d', DEVICE, '--set-ctrl', assignment];

function rig(extra: Partial<CameraOptions> = {}, camera: Parameters<typeof fakeCamera>[0] = {}) {
  const cam = fakeCamera(camera);
  const saved: Record<string, number>[] = [];
  let stored: unknown = null;
  let time = 1_000_000;
  const controls = new CameraControls({
    device: DEVICE,
    run: cam.run,
    access: async () => undefined,
    load: () => stored,
    save: (values) => {
      stored = values;
      saved.push(values);
    },
    now: () => time,
    ...extra,
  });
  return {
    ...cam,
    controls,
    saved,
    advance: (ms: number) => (time += ms),
    store: (value: unknown) => (stored = value),
    peek: () => stored,
  };
}

describe('the controls of the camera', () => {
  it('lists what the camera reports of the settings that may be set – one list call, argument by argument', async () => {
    const r = rig();
    const list = await r.controls.list();
    expect(r.calls).toEqual([LIST]);
    // "hue" is reported, but it is not for the app
    expect(list.map((c) => c.name)).toEqual([
      'brightness',
      'contrast',
      'gain',
      'white_balance_automatic',
      'white_balance_temperature',
      'power_line_frequency',
      'auto_exposure',
      'exposure_time_absolute',
      'exposure_dynamic_framerate',
      'focus_automatic_continuous',
      'focus_absolute',
    ]);
    expect(list.find((c) => c.name === 'exposure_time_absolute')).toMatchObject({
      inactive: true,
      min: 1,
      max: 5000,
    });
  });

  it('sets the exposure by first switching to manual, reading again, and only then the time', async () => {
    const r = rig();
    // the time comes first in the request: the order of the request does not matter
    const answer = await r.controls.apply({
      controls: { exposure_time_absolute: 120, auto_exposure: 1 },
    });
    expect(r.calls).toEqual([
      LIST,
      set('auto_exposure=1'),
      LIST,
      set('exposure_time_absolute=120'),
      LIST,
    ]);
    expect(answer.results).toEqual({
      auto_exposure: { ok: true, value: 1 },
      exposure_time_absolute: { ok: true, value: 120 },
    });
    // the answer is the list read last
    const time = answer.controls.find((c) => c.name === 'exposure_time_absolute')!;
    expect(time).toMatchObject({ value: 120, inactive: false });
    expect(answer.controls.find((c) => c.name === 'auto_exposure')!.value).toBe(1);
  });

  it('puts every switch first: exposure, white balance and focus', async () => {
    const r = rig();
    await r.controls.apply({
      controls: {
        focus_absolute: 40,
        white_balance_temperature: 5000,
        gain: 12,
        focus_automatic_continuous: 0,
        white_balance_automatic: 0,
      },
    });
    const sets = r.calls.filter((c) => c[2] === '--set-ctrl').map((c) => c[3]);
    expect(sets).toEqual([
      'focus_automatic_continuous=0',
      'white_balance_automatic=0',
      'focus_absolute=40',
      'white_balance_temperature=5000',
      'gain=12',
    ]);
  });

  it('refuses the exposure time while auto exposure is on, and says so – without sending it', async () => {
    const r = rig();
    const answer = await r.controls.apply({ controls: { exposure_time_absolute: 120 } });
    expect(answer.results).toEqual({
      exposure_time_absolute: { ok: false, error: 'refused:inactive' },
    });
    // nothing was sent: only the list was read
    expect(r.calls).toEqual([LIST]);
    expect(r.saved).toEqual([]);
    // and when the same request switches to automatic, the time is inactive by then
    r.advance(1000);
    const again = await r.controls.apply({
      controls: { auto_exposure: 3, exposure_time_absolute: 150 },
    });
    expect(again.results.exposure_time_absolute).toEqual({
      ok: false,
      error: 'refused:inactive',
    });
    expect(again.results.auto_exposure).toEqual({ ok: true, value: 3 });
  });

  it('refuses what is out of range, off the grid, outside the menu, not allowed or not reported – and sets the rest', async () => {
    const r = rig();
    const answer = await r.controls.apply({
      controls: {
        gain: 101,
        focus_automatic_continuous: 2,
        auto_exposure: 2,
        brightness: 5,
        hue: 3,
        sharpness: 4,
      },
    });
    expect(answer.results).toEqual({
      gain: { ok: false, error: 'refused:range' },
      focus_automatic_continuous: { ok: false, error: 'refused:range' },
      auto_exposure: { ok: false, error: 'refused:menu' },
      brightness: { ok: true, value: 5 },
      hue: { ok: false, error: 'refused:not-allowed' },
      sharpness: { ok: false, error: 'refused:unknown' },
    });
    // only the one valid value reached the camera
    expect(r.calls.filter((c) => c[2] === '--set-ctrl')).toEqual([set('brightness=5')]);
    expect(r.get('hue').value).toBe(0);
    r.advance(1000);
    const grid = await r.controls.apply({
      controls: { focus_automatic_continuous: 0, focus_absolute: 12 },
    });
    expect(grid.results.focus_absolute).toEqual({ ok: false, error: 'refused:step' });
  });

  it('never clamps: a value is taken as it is or refused', async () => {
    const r = rig();
    await r.controls.apply({ controls: { gain: 100 } });
    expect(r.get('gain').value).toBe(100);
    await r.controls.apply({ controls: { gain: 1000 } }).catch(() => undefined);
    r.advance(1000);
    await r.controls.apply({ controls: { gain: 1000 } });
    expect(r.get('gain').value).toBe(100);
  });

  it('tells what the camera made of a value: the read-back is the truth, and the truth is what is kept', async () => {
    // a camera that rounds the exposure time down to a multiple of ten
    const r = rig(
      {},
      { round: (name, v) => (name === 'exposure_time_absolute' ? v - (v % 10) : v) },
    );
    const answer = await r.controls.apply({
      controls: { auto_exposure: 1, exposure_time_absolute: 123 },
    });
    expect(answer.results.exposure_time_absolute).toEqual({ ok: true, value: 120 });
    expect(answer.controls.find((c) => c.name === 'exposure_time_absolute')!.value).toBe(120);
    expect(r.peek()).toEqual({ auto_exposure: 1, exposure_time_absolute: 120 });
  });

  it('is not told "no permission" by a driver that refuses a set: that is the control, not the device', async () => {
    const r = rig({}, { driverRefuses: ['gain'] });
    const answer = await r.controls.apply({ controls: { gain: 5, brightness: 2 } });
    expect(answer.results.gain).toEqual({
      ok: false,
      error: 'refused:driver',
      detail: 'VIDIOC_S_EXT_CTRLS: failed: Permission denied',
    });
    expect(answer.results.brightness).toEqual({ ok: true, value: 2 });
    // what did not go in is not kept
    expect(r.peek()).toEqual({ brightness: 2 });
  });

  it('puts every call through one queue: a read and a write never interleave', async () => {
    const r = rig();
    let open = 0;
    let most = 0;
    const run: Run = async (args) => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((done) => setTimeout(done, 2));
      const result = await r.run(args);
      open -= 1;
      return result;
    };
    const controls = new CameraControls({
      device: DEVICE,
      run,
      access: async () => undefined,
      load: () => null,
      save: () => undefined,
    });
    await Promise.all([
      controls.list(),
      controls.apply({ controls: { brightness: 3 } }),
      controls.list(),
    ]);
    expect(most).toBe(1);
    expect(r.get('brightness').value).toBe(3);
  });

  it('lets reads that wait together share one call – but not across a write', async () => {
    const r = rig();
    const lists = () => r.calls.filter((c) => c[2] === '--list-ctrls-menus').length;
    const [a, b, c] = await Promise.all([r.controls.list(), r.controls.list(), r.controls.list()]);
    expect(lists()).toBe(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    // a read after the answer is a new one
    await r.controls.list();
    expect(lists()).toBe(2);
    // a write queued between two reads: the second read must see it, so it does not share the first
    r.advance(1000);
    const before = r.controls.list();
    const write = r.controls.apply({ controls: { brightness: 9 } });
    const after = r.controls.list();
    const [x, , y] = await Promise.all([before, write, after]);
    expect(x.find((k) => k.name === 'brightness')!.value).toBe(0);
    expect(y.find((k) => k.name === 'brightness')!.value).toBe(9);
    // and a failure is every sharer's failure, then the next read tries again
    const failing = new CameraControls({
      ...rigOptions(),
      run: async () => ({ code: 1, stdout: '', stderr: 'oops' }),
    });
    const pair = await Promise.allSettled([failing.list(), failing.list()]);
    expect(pair.map((p) => p.status)).toEqual(['rejected', 'rejected']);
  });

  it('lets one write batch through per 500 ms, and says how long to wait', async () => {
    const r = rig();
    await r.controls.apply({ controls: { brightness: 1 } });
    r.advance(499);
    await expect(r.controls.apply({ controls: { brightness: 2 } })).rejects.toMatchObject({
      code: 'rate-limited',
      detail: '1',
    });
    // a refused batch moved nothing, and does not move the window
    expect(r.get('brightness').value).toBe(1);
    r.advance(1);
    await r.controls.apply({ controls: { brightness: 2 } });
    expect(r.get('brightness').value).toBe(2);
    // a list is no batch; a body that is wrong does not count
    r.advance(10);
    await r.controls.list();
    await expect(r.controls.apply({ controls: { brightness: 'x' } })).rejects.toMatchObject({
      code: 'bad-request',
    });
    r.advance(500);
    await r.controls.apply({ controls: { brightness: 3 } });
  });
});

describe('when the camera cannot be reached', () => {
  const code = (promise: Promise<unknown>) =>
    promise.then(
      () => 'no error',
      (error: CameraError) => error.code,
    );

  it('says that v4l2-ctl is not there', async () => {
    const run: Run = async () => ({ code: -1, stdout: '', stderr: '', failure: 'missing' });
    const controls = new CameraControls({ ...rigOptions(), run });
    expect(await code(controls.list())).toBe('no-v4l2');
    expect(await code(controls.apply({ controls: { gain: 1 } }))).toBe('no-v4l2');
  });

  it('says that the device is not there – and never asks v4l2-ctl then', async () => {
    const calls: unknown[] = [];
    const run: Run = async (args) => {
      calls.push(args);
      return { code: 0, stdout: '', stderr: '' };
    };
    const missing = Object.assign(new Error('x'), { code: 'ENOENT' });
    const controls = new CameraControls({
      ...rigOptions(),
      run,
      access: async () => Promise.reject(missing),
    });
    expect(await code(controls.list())).toBe('no-device');
    expect(calls).toEqual([]);
  });

  it('says that the companion may not open the device – from the device itself', async () => {
    const denied = Object.assign(new Error('x'), { code: 'EACCES' });
    const controls = new CameraControls({
      ...rigOptions(),
      access: async () => Promise.reject(denied),
    });
    expect(await code(controls.list())).toBe('no-permission');
    const other = Object.assign(new Error('x'), { code: 'EPERM' });
    expect(
      await code(
        new CameraControls({ ...rigOptions(), access: async () => Promise.reject(other) }).list(),
      ),
    ).toBe('no-permission');
  });

  it('knows a device that is a plain node under /dev – and nothing else', async () => {
    for (const device of [
      '/dev/video0; ls',
      '/dev/../etc/passwd',
      'video0',
      '--help',
      '/dev/',
      '',
    ]) {
      const calls: unknown[] = [];
      const controls = new CameraControls({
        ...rigOptions(),
        device,
        run: async (args) => {
          calls.push(args);
          return { code: 0, stdout: '', stderr: '' };
        },
      });
      expect(await code(controls.list()), device).toBe('no-device');
      expect(calls, device).toEqual([]);
    }
    const ok = fakeCamera();
    for (const device of ['/dev/video0', '/dev/v4l/by-id/usb-Cam_Name-video-index0']) {
      const controls = new CameraControls({ ...rigOptions(), device, run: ok.run });
      await expect(controls.list(), device).resolves.toHaveLength(11);
      expect(ok.calls.at(-1)![1], device).toBe(device);
    }
  });

  it('tells a time-out, a device that went away and any other failure of the list', async () => {
    const answering =
      (result: Partial<RunResult>): Run =>
      async () => ({
        code: 1,
        stdout: '',
        stderr: '',
        ...result,
      });
    const check = (result: Partial<RunResult>) =>
      new CameraControls({ ...rigOptions(), run: answering(result) }).list().then(
        () => 'no error',
        (error: CameraError) => `${error.code}${error.detail ? `:${error.detail}` : ''}`,
      );
    expect(await check({ code: -1, failure: 'timeout' })).toBe('timeout');
    expect(await check({ stderr: 'Cannot open device /dev/video0, exiting.' })).toBe('no-device');
    expect(await check({ stderr: 'VIDIOC_QUERYCAP: failed: No such device' })).toBe('no-device');
    expect(await check({ stderr: 'Failed to open /dev/video0: Permission denied' })).toBe(
      'no-permission',
    );
    expect(await check({ stderr: 'something else\n' })).toBe('failed:something else');
    expect(await check({ stderr: '' })).toBe('failed');
    expect(await check({ stderr: 'x'.repeat(500) })).toBe(`failed:${'x'.repeat(200)}`);
  });

  it('ends a batch when v4l2-ctl goes missing or hangs half-way', async () => {
    const cam = fakeCamera();
    for (const failure of ['missing', 'timeout'] as const) {
      const controls = new CameraControls({
        ...rigOptions(),
        run: async (args) =>
          args[2] === '--set-ctrl' ? { code: -1, stdout: '', stderr: '', failure } : cam.run(args),
      });
      expect(await code(controls.apply({ controls: { gain: 3 } }))).toBe(
        failure === 'missing' ? 'no-v4l2' : 'timeout',
      );
    }
  });
});

describe('what the companion keeps and puts back', () => {
  it('keeps what was applied, value by value, merged with what was kept', async () => {
    const r = rig();
    await r.controls.apply({ controls: { auto_exposure: 1, exposure_time_absolute: 80 } });
    r.advance(1000);
    await r.controls.apply({ controls: { gain: 9 } });
    expect(r.saved).toEqual([
      { auto_exposure: 1, exposure_time_absolute: 80 },
      { auto_exposure: 1, exposure_time_absolute: 80, gain: 9 },
    ]);
    r.advance(1000);
    await r.controls.apply({ controls: { exposure_time_absolute: 90 } });
    expect(r.peek()).toEqual({ auto_exposure: 1, exposure_time_absolute: 90, gain: 9 });
  });

  it('reads the store as untrusted: only listed names with whole numbers, a few', () => {
    const r = rig();
    expect(r.controls.stored()).toEqual({});
    r.store([1, 2]);
    expect(r.controls.stored()).toEqual({});
    r.store('gain=1');
    expect(r.controls.stored()).toEqual({});
    r.store({ gain: 5, hue: 1, brightness: 1.5, contrast: '3', 'a b': 2, auto_exposure: 1 });
    expect(r.controls.stored()).toEqual({ gain: 5, auto_exposure: 1 });
    r.store(
      Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [i < 19 ? ALLOWED_CONTROLS[i]! : `x${i}`, i]),
      ),
    );
    expect(Object.keys(r.controls.stored()).length).toBeLessThanOrEqual(19);
  });

  it('puts the last values back where the camera lost them – switches first, only what differs – and keeps nothing new', async () => {
    const r = rig();
    r.store({ exposure_time_absolute: 80, auto_exposure: 1, gain: 0, brightness: 7 });
    const done = await r.controls.restore();
    // gain is 0 already: not sent again
    expect(r.calls.filter((c) => c[2] === '--set-ctrl')).toEqual([
      set('auto_exposure=1'),
      set('exposure_time_absolute=80'),
      set('brightness=7'),
    ]);
    expect(done).toEqual({
      applied: ['auto_exposure', 'exposure_time_absolute', 'brightness'],
      refused: [],
    });
    expect(r.saved).toEqual([]);
  });

  it('makes no call at all when nothing was kept, or when the camera has it all', async () => {
    const r = rig();
    expect(await r.controls.restore()).toBeNull();
    expect(r.calls).toEqual([]);
    r.store({ gain: 0, brightness: 0 });
    expect(await r.controls.restore()).toEqual({ applied: [], refused: [] });
    expect(r.calls).toEqual([LIST]);
  });

  it('leaves out what the camera no longer reports or accepts', async () => {
    const r = rig();
    // the exposure time is inactive while the camera is on automatic – and what is stored says automatic
    r.store({ auto_exposure: 3, exposure_time_absolute: 80, sharpness: 4, brightness: 99 });
    const done = await r.controls.restore();
    expect(done).toEqual({
      applied: [],
      refused: ['exposure_time_absolute', 'sharpness', 'brightness'],
    });
    expect(r.calls.filter((c) => c[2] === '--set-ctrl')).toEqual([]);
  });

  it('tries again while the device is not there yet, and stops when trying is of no use', async () => {
    const waits: number[] = [];
    const wait = async (ms: number) => void waits.push(ms);
    const log: string[] = [];
    let present = 0;
    const cam = fakeCamera();
    const controls = new CameraControls({
      ...rigOptions(),
      run: cam.run,
      // the camera shows up at the third look
      access: async () => {
        if (++present < 3) throw Object.assign(new Error('x'), { code: 'ENOENT' });
      },
      load: () => ({ brightness: 4 }),
      log: (message) => log.push(message),
    });
    await controls.restoreAtStart(wait);
    expect(waits).toEqual([2000, 10_000, 10_000]);
    expect(cam.get('brightness').value).toBe(4);
    expect(log).toEqual([
      'camera: putting back the last values failed (no-device)',
      'camera: putting back the last values failed (no-device)',
      'camera: put back 1, refused 0 of the last values',
    ]);

    // no permission does not come by waiting: one try
    const denied = new CameraControls({
      ...rigOptions(),
      access: async () => Promise.reject(Object.assign(new Error('x'), { code: 'EACCES' })),
      load: () => ({ brightness: 4 }),
      log: (message) => log.push(message),
    });
    waits.length = 0;
    await denied.restoreAtStart(wait);
    expect(waits).toEqual([2000]);
    expect(log.at(-1)).toBe('camera: putting back the last values failed (no-permission)');

    // nothing kept: waits once, and says nothing
    const none = new CameraControls({ ...rigOptions(), load: () => null, log: (m) => log.push(m) });
    const before = log.length;
    await none.restoreAtStart(wait, [1]);
    expect(log.length).toBe(before);

    // a failure that is no CameraError is no reason to stop the start
    const odd = new CameraControls({
      ...rigOptions(),
      load: () => {
        throw new Error('database is closed');
      },
      log: (message) => log.push(message),
    });
    await odd.restoreAtStart(wait, [1]);
    expect(log.at(-1)).toBe('camera: putting back the last values failed (failed)');

    // given up after the last try
    const never = new CameraControls({
      ...rigOptions(),
      access: async () => Promise.reject(Object.assign(new Error('x'), { code: 'ENOENT' })),
      load: () => ({ brightness: 4 }),
    });
    waits.length = 0;
    await never.restoreAtStart(wait, [1, 2]);
    expect(waits).toEqual([1, 2]);
  });
});

/** The parts of the options a test does not care about. */
function rigOptions(): CameraOptions {
  return {
    device: DEVICE,
    run: fakeCamera().run,
    access: async () => undefined,
    load: () => null,
    save: () => undefined,
  };
}

describe('the routes', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  async function serve(r: ReturnType<typeof rig> | null, store = new Store()) {
    app = await buildServer({ store, ...(r ? { camera: r.controls } : {}) });
    return { app, store };
  }

  it('says in the health answer whether the camera can be set', async () => {
    const { app: a } = await serve(rig());
    expect(
      ((await a.inject('/api/health')).json() as { cameraControls: boolean }).cameraControls,
    ).toBe(true);
    await a.close();
    const { app: b } = await serve(null);
    expect(
      ((await b.inject('/api/health')).json() as { cameraControls: boolean }).cameraControls,
    ).toBe(false);
  });

  it('answers 501 where there is no camera to set', async () => {
    const { app: a } = await serve(null);
    const get = await a.inject('/api/camera/controls');
    expect(get.statusCode).toBe(501);
    expect(get.json()).toEqual({ error: 'not-supported' });
    const put = await a.inject({
      method: 'PUT',
      url: '/api/camera/controls',
      payload: { controls: { gain: 1 } },
    });
    expect(put.statusCode).toBe(501);
    expect(put.json()).toEqual({ error: 'not-supported' });
  });

  it('lists, sets and keeps – without a login, like the libraries', async () => {
    const store = new Store();
    const r = rig({
      load: () => store.getSetting<unknown>('cameraControls', null),
      save: (values) => store.setSetting('cameraControls', values),
    });
    const { app: a } = await serve(r, store);
    const list = await a.inject('/api/camera/controls');
    expect(list.statusCode).toBe(200);
    const { controls } = list.json() as { controls: CameraControl[] };
    expect(controls.map((c) => c.name)).toContain('exposure_time_absolute');
    const put = await a.inject({
      method: 'PUT',
      url: '/api/camera/controls',
      payload: { controls: { auto_exposure: 1, exposure_time_absolute: 100 } },
    });
    expect(put.statusCode).toBe(200);
    const body = put.json() as {
      controls: CameraControl[];
      results: Record<string, { ok: boolean; value: number }>;
    };
    expect(body.results).toEqual({
      auto_exposure: { ok: true, value: 1 },
      exposure_time_absolute: { ok: true, value: 100 },
    });
    expect(body.controls.find((c) => c.name === 'exposure_time_absolute')).toMatchObject({
      value: 100,
      inactive: false,
    });
    // kept in the companion's own table of settings – not one of the synced documents
    expect(store.getSetting('cameraControls', null)).toEqual({
      auto_exposure: 1,
      exposure_time_absolute: 100,
    });
    expect((await a.inject('/api/state')).json()).toEqual({ keys: {} });
  });

  it('answers a refused control with 200 and the reason – the batch ran', async () => {
    const { app: a } = await serve(rig());
    const put = await a.inject({
      method: 'PUT',
      url: '/api/camera/controls',
      payload: { controls: { exposure_time_absolute: 100 } },
    });
    expect(put.statusCode).toBe(200);
    expect((put.json() as { results: unknown }).results).toEqual({
      exposure_time_absolute: { ok: false, error: 'refused:inactive' },
    });
  });

  it('gives each way a request can end its status and its code', async () => {
    const answer = async (
      options: Partial<CameraOptions>,
      request: { method: 'GET' | 'PUT'; payload?: object } = { method: 'GET' },
    ) => {
      const r = rig(options);
      const { app: a } = await serve(r);
      const res = await a.inject({ url: '/api/camera/controls', ...request });
      await a.close();
      return { status: res.statusCode, body: res.json() as Record<string, unknown>, res };
    };
    const missing: Run = async () => ({ code: -1, stdout: '', stderr: '', failure: 'missing' });
    const slow: Run = async () => ({ code: -1, stdout: '', stderr: '', failure: 'timeout' });
    const broken: Run = async () => ({ code: 1, stdout: '', stderr: 'oops' });
    expect(await answer({ run: missing })).toMatchObject({
      status: 501,
      body: { error: 'no-v4l2' },
    });
    expect(await answer({ run: slow })).toMatchObject({ status: 504, body: { error: 'timeout' } });
    expect(await answer({ run: broken })).toMatchObject({
      status: 502,
      body: { error: 'failed', detail: 'oops' },
    });
    expect(
      await answer({
        access: async () => Promise.reject(Object.assign(new Error('x'), { code: 'ENOENT' })),
      }),
    ).toMatchObject({ status: 503, body: { error: 'no-device' } });
    expect(
      await answer({
        access: async () => Promise.reject(Object.assign(new Error('x'), { code: 'EACCES' })),
      }),
    ).toMatchObject({ status: 403, body: { error: 'no-permission' } });
    expect(await answer({}, { method: 'PUT', payload: { controls: {} } })).toMatchObject({
      status: 400,
      body: { error: 'bad-request' },
    });
    // a body that says no kind of content is none the route takes
    expect(
      await answer({}, { method: 'PUT', payload: 'gain=1' as unknown as object }),
    ).toMatchObject({
      status: 415,
    });
    // a time-out in the middle of a batch is the batch's
    expect(
      await answer({ run: slow }, { method: 'PUT', payload: { controls: { gain: 1 } } }),
    ).toMatchObject({ status: 504, body: { error: 'timeout' } });
  });

  it('refuses a second batch within 500 ms with 429 and Retry-After', async () => {
    const r = rig();
    const { app: a } = await serve(r);
    const put = (value: number) =>
      a.inject({
        method: 'PUT',
        url: '/api/camera/controls',
        payload: { controls: { brightness: value } },
      });
    expect((await put(1)).statusCode).toBe(200);
    const second = await put(2);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBe('1');
    expect(second.json()).toEqual({ error: 'rate-limited', detail: expect.any(String) });
    expect(r.get('brightness').value).toBe(1);
  });

  it('bounds the body before it is read, and has no other kind of body', async () => {
    const r = rig();
    const { app: a } = await serve(r);
    const big = await a.inject({
      method: 'PUT',
      url: '/api/camera/controls',
      payload: { controls: { gain: 1 }, padding: 'x'.repeat(5000) },
    });
    expect(big.statusCode).toBe(413);
    const text = await a.inject({
      method: 'PUT',
      url: '/api/camera/controls',
      headers: { 'content-type': 'text/plain' },
      payload: 'gain=1',
    });
    expect(text.statusCode).toBe(400);
    expect(text.json()).toMatchObject({ error: 'bad-request' });
    expect(r.calls).toEqual([]);
  });

  it('never lets what the request says reach an argument but name=value of a control that was checked', async () => {
    const r = rig();
    const { app: a } = await serve(r);
    for (const controls of [
      { 'gain; reboot': 1 },
      { '$(reboot)': 1 },
      { gain: '1; reboot' },
      { 'gain=5,brightness': 1 },
    ]) {
      const res = await a.inject({
        method: 'PUT',
        url: '/api/camera/controls',
        payload: { controls },
      });
      expect(res.statusCode).toBe(400);
    }
    expect(r.calls).toEqual([]);
    await a.inject({
      method: 'PUT',
      url: '/api/camera/controls',
      payload: { controls: { gain: 7 } },
    });
    for (const call of r.calls) {
      expect(call.slice(0, 2)).toEqual(['-d', DEVICE]);
      expect([LIST[2], '--set-ctrl']).toContain(call[2]);
    }
    expect(r.calls.filter((c) => c[2] === '--set-ctrl')).toEqual([set('gain=7')]);
  });
});
