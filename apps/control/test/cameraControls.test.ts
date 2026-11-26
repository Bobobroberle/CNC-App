import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasKey, t } from '../src/i18n';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import {
  GROUPS,
  buttonStep,
  failureOf,
  grouped,
  rawOfTyped,
  rawToMs,
  shownValue,
  steppedValue,
  streamIsPis,
  takeover,
  unitOf,
} from '../src/lib/cameraControls';
import { CompanionError, type CameraControl } from '../src/lib/companion';
import { parseNumber } from '../src/lib/format';

const control = (over: Partial<CameraControl> & { name: string }): CameraControl => ({
  type: 'int',
  min: 0,
  max: 100,
  step: 1,
  default: 0,
  value: 0,
  inactive: false,
  readOnly: false,
  ...over,
});
const exposure = control({
  name: 'exposure_time_absolute',
  min: 1,
  max: 5000,
  default: 157,
  value: 157,
});
const auto = (value: number, name = 'auto_exposure') =>
  control({
    name,
    type: 'menu',
    min: 0,
    max: 3,
    default: 3,
    value,
    menu: [
      { value: 1, label: 'Manual Mode' },
      { value: 3, label: 'Aperture Priority Mode' },
    ],
  });

describe('the exposure in milliseconds – and only the exposure time', () => {
  it('counts the V4L2 unit of 100 µs: 10 is one millisecond', () => {
    expect(rawToMs(10)).toBe(1);
    expect(rawToMs(157)).toBeCloseTo(15.7, 10);
    expect(rawToMs(1)).toBeCloseTo(0.1, 10);
    expect(shownValue(exposure, 157)).toBeCloseTo(15.7, 10);
    expect(unitOf(exposure)).toBe('ms');
    expect(unitOf({ ...exposure, name: 'exposure_absolute' })).toBe('ms');
  });

  it('shows every other control as the camera counts it, with no conversion', () => {
    for (const name of ['gain', 'brightness', 'focus_absolute', 'white_balance_temperature']) {
      const c = control({ name, value: 250 });
      expect(unitOf(c), name).toBeNull();
      expect(shownValue(c, 250), name).toBe(250);
    }
    // not the exposure time because of a similar name, and no menu or switch either
    expect(unitOf(control({ name: 'exposure_dynamic_framerate', type: 'bool' }))).toBeNull();
    expect(unitOf(auto(1))).toBeNull();
    expect(unitOf(control({ name: 'exposure_time_absolute', type: 'menu' }))).toBeNull();
  });
});

describe('what a typed number means for the camera', () => {
  it('turns milliseconds into the camera’s unit, rounded to it', () => {
    expect(rawOfTyped(exposure, 12.3)).toEqual({ raw: 123 });
    expect(rawOfTyped(exposure, 0.1)).toEqual({ raw: 1 });
    expect(rawOfTyped(exposure, 500)).toEqual({ raw: 5000 });
    expect(rawOfTyped(exposure, 12.34)).toEqual({ raw: 123 });
    expect(rawOfTyped(exposure, 12.36)).toEqual({ raw: 124 });
    // typed with a comma, as the operator does
    expect(rawOfTyped(exposure, parseNumber('12,3'))).toEqual({ raw: 123 });
  });

  it('refuses what lies outside the range – never makes it fit', () => {
    expect(rawOfTyped(exposure, 500.1)).toEqual({ error: 'range' });
    expect(rawOfTyped(exposure, 0)).toEqual({ error: 'range' });
    expect(rawOfTyped(exposure, 0.04)).toEqual({ error: 'range' });
    expect(rawOfTyped(exposure, -3)).toEqual({ error: 'range' });
    expect(rawOfTyped(control({ name: 'gain' }), 100.6)).toEqual({ error: 'range' });
    expect(rawOfTyped(control({ name: 'gain' }), -0.6)).toEqual({ error: 'range' });
    expect(rawOfTyped(exposure, Number.NaN)).toEqual({ error: 'not-a-number' });
    expect(rawOfTyped(exposure, Infinity)).toEqual({ error: 'not-a-number' });
  });

  it('takes a plain number of an ordinary control to its whole number on the grid', () => {
    const gain = control({ name: 'gain' });
    expect(rawOfTyped(gain, 12.4)).toEqual({ raw: 12 });
    expect(rawOfTyped(gain, 100)).toEqual({ raw: 100 });
    const focus = control({ name: 'focus_absolute', min: 0, max: 250, step: 5 });
    expect(rawOfTyped(focus, 12)).toEqual({ raw: 10 });
    expect(rawOfTyped(focus, 13)).toEqual({ raw: 15 });
    // the grid starts at the minimum
    const odd = control({ name: 'brightness', min: -3, max: 12, step: 5 });
    expect(rawOfTyped(odd, 2)).toEqual({ raw: 2 });
    expect(rawOfTyped(odd, 4)).toEqual({ raw: 2 });
  });
});

describe('the buttons beside a number', () => {
  it('step by what is useful across the range, on the camera’s grid', () => {
    expect(buttonStep(exposure)).toBe(10); // one millisecond
    expect(buttonStep(control({ name: 'gain' }))).toBe(1);
    expect(buttonStep(control({ name: 'white_balance_temperature', min: 2800, max: 6500 }))).toBe(
      10,
    );
    expect(buttonStep(control({ name: 'focus_absolute', min: 0, max: 250, step: 5 }))).toBe(5);
    // never smaller than the camera's own step, and on its grid
    expect(buttonStep({ ...exposure, step: 3 })).toBe(12);
  });

  it('lead to the next value, kept in range – and to nothing where there is no further step', () => {
    expect(steppedValue({ ...exposure, value: 157 }, 1)).toBe(167);
    expect(steppedValue({ ...exposure, value: 157 }, -1)).toBe(147);
    // from near the end, to the end
    expect(steppedValue({ ...exposure, value: 4995 }, 1)).toBe(5000);
    expect(steppedValue({ ...exposure, value: 5000 }, 1)).toBeNull();
    expect(steppedValue({ ...exposure, value: 5 }, -1)).toBe(1);
    expect(steppedValue({ ...exposure, value: 1 }, -1)).toBeNull();
    const focus = control({ name: 'focus_absolute', min: 0, max: 252, step: 5, value: 250 });
    // 252 is no point of the grid: the end is 250
    expect(steppedValue(focus, 1)).toBeNull();
    expect(steppedValue({ ...focus, value: 245 }, 1)).toBe(250);
  });
});

describe('the order of the settings', () => {
  it('puts them in groups – and shows only the ones the companion lets through', () => {
    const list = [
      control({ name: 'focus_absolute' }),
      control({ name: 'gain' }),
      control({ name: 'hue' }),
      exposure,
      auto(1),
      control({ name: 'brightness' }),
    ];
    expect(grouped(list).map((g) => [g.group, g.controls.map((c) => c.name)])).toEqual([
      ['exposure', ['auto_exposure', 'exposure_time_absolute', 'gain']],
      ['picture', ['brightness']],
      ['focus', ['focus_absolute']],
    ]);
    expect(grouped([])).toEqual([]);
  });

  it('is the list of the companion: the same names, so nothing it allows is left out here', () => {
    const source = readFileSync(new URL('../../companion/src/camera.ts', import.meta.url), 'utf8');
    const block = /ALLOWED_CONTROLS: readonly string\[\] = \[([\s\S]*?)\];/.exec(source)![1]!;
    const allowed = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect(allowed.length).toBeGreaterThanOrEqual(15);
    expect(GROUPS.flatMap((g) => g.names).sort()).toEqual([...allowed].sort());
    for (const name of allowed) {
      expect(hasKey(`cameraControls.names.${name}`), name).toBe(true);
      expect((en.cameraControls.names as Record<string, string>)[name], name).toBeTruthy();
      expect((de.cameraControls.names as Record<string, string>)[name], name).toBeTruthy();
    }
  });
});

describe('what the scan panel may take over', () => {
  it('takes a fixed exposure time, in milliseconds', () => {
    expect(takeover([auto(1), exposure])).toEqual({ kind: 'ms', ms: 15.7 });
    // the old names of the same controls
    expect(
      takeover([auto(1, 'exposure_auto'), { ...exposure, name: 'exposure_absolute', value: 100 }]),
    ).toEqual({ kind: 'ms', ms: 10 });
    // a camera with no auto control at all: the time that is active is the time
    expect(takeover([exposure])).toEqual({ kind: 'ms', ms: 15.7 });
  });

  it('takes nothing from a camera on automatic – it has no fixed value', () => {
    for (const value of [0, 2, 3]) {
      expect(takeover([auto(value), { ...exposure, inactive: true }]), String(value)).toEqual({
        kind: 'auto',
      });
      // not even when the camera reports the time as active
      expect(takeover([auto(value), exposure]), String(value)).toEqual({ kind: 'auto' });
    }
  });

  it('takes nothing where the camera reports no exposure time, or one that does not act', () => {
    expect(takeover([])).toEqual({ kind: 'unavailable' });
    expect(takeover([auto(1)])).toEqual({ kind: 'unavailable' });
    expect(takeover([control({ name: 'gain' })])).toEqual({ kind: 'unavailable' });
    // manual, but the camera says the time does not act (another switch holds it)
    expect(takeover([auto(1), { ...exposure, inactive: true }])).toEqual({ kind: 'unavailable' });
    expect(takeover([auto(1), { ...exposure, readOnly: true }])).toEqual({ kind: 'unavailable' });
    // a "time" that is no integer control is none
    expect(takeover([auto(1), { ...exposure, type: 'menu' }])).toEqual({ kind: 'unavailable' });
  });
});

describe('whether the picture is the companion’s camera', () => {
  it('is when the stream comes from the companion’s own host', () => {
    expect(streamIsPis('http://pi.local:8081/stream', 'pi.local:8080')).toBe(true);
    expect(streamIsPis('http://192.168.1.5:8081/stream', 'http://192.168.1.5:8080')).toBe(true);
    expect(streamIsPis('http://192.168.1.5/stream', '192.168.1.5')).toBe(true);
  });

  it('is not for another device’s stream, no stream, or no companion', () => {
    expect(streamIsPis('http://esp32-cam.local:81/stream', 'pi.local:8080')).toBe(false);
    expect(streamIsPis('', 'pi.local:8080')).toBe(false);
    expect(streamIsPis('   ', 'pi.local:8080')).toBe(false);
    expect(streamIsPis('http://pi.local:8081/stream', '')).toBe(false);
    expect(streamIsPis('not a url', 'pi.local:8080')).toBe(false);
  });
});

describe('what a failed call stands for', () => {
  it('is the companion’s code, "old" for a companion without the route, "unreachable" for none at all', () => {
    expect(failureOf(new CompanionError(403, 'no-permission'))).toBe('no-permission');
    expect(failureOf(new CompanionError(503, 'no-device'))).toBe('no-device');
    // a code with a digit in it
    expect(failureOf(new CompanionError(501, 'no-v4l2'))).toBe('no-v4l2');
    expect(failureOf(new CompanionError(429, 'rate-limited'))).toBe('rate-limited');
    expect(failureOf(new CompanionError(404, 'Not Found'))).toBe('old');
    expect(failureOf(new CompanionError(405, null))).toBe('old');
    expect(failureOf(new CompanionError(500, null))).toBe('failed');
    expect(failureOf(new CompanionError(415, 'Unsupported Media Type'))).toBe('failed');
    expect(failureOf(new TypeError('Failed to fetch'))).toBe('unreachable');
    expect(failureOf(new DOMException('timeout', 'TimeoutError'))).toBe('unreachable');
    expect(failureOf(null)).toBe('unreachable');
  });
});

describe('a sentence for everything the companion can say', () => {
  const source = readFileSync(new URL('../../companion/src/camera.ts', import.meta.url), 'utf8');
  const list = (name: string) => {
    const block = new RegExp(`${name} = \\[([\\s\\S]*?)\\] as const`).exec(source)![1]!;
    return [...block.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]!);
  };

  it('has a German and an English sentence for every error code, and for the two of this side', () => {
    const codes = list('CAMERA_ERROR_CODES');
    expect(codes).toEqual(
      expect.arrayContaining(['no-v4l2', 'no-device', 'no-permission', 'timeout']),
    );
    for (const code of [...codes, 'old', 'unreachable']) {
      for (const dictionary of [de, en]) {
        const text = (dictionary.cameraControls.errors as Record<string, string>)[code];
        expect(text, code).toBeTruthy();
        expect(text, code).not.toMatch(/^cameraControls\./);
      }
      expect(hasKey(`cameraControls.errors.${code}`), code).toBe(true);
    }
  });

  it('has one for every reason a control is refused', () => {
    const why = list('CONTROL_REFUSALS');
    expect(why).toEqual(expect.arrayContaining(['inactive', 'range', 'menu', 'driver']));
    for (const reason of why) {
      for (const dictionary of [de, en])
        expect(
          (dictionary.cameraControls.refused as Record<string, string>)[reason],
          reason,
        ).toBeTruthy();
    }
    expect(t('cameraControls.refused.inactive')).toMatch(/Automatik/);
  });

  it('tells the one-time command for a camera the companion may not open, and for a missing v4l2-ctl', () => {
    expect(de.cameraControls.errors['no-permission']).toContain('usermod -aG video');
    expect(de.cameraControls.errors['no-permission']).toContain(
      'systemctl restart lowrider-companion',
    );
    expect(de.cameraControls.errors['no-v4l2']).toContain('apt-get install v4l-utils');
  });
});
