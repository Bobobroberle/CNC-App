// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraControlsCard } from '../src/components/CameraControlsCard';
import type { CameraControl, CameraControlsAnswer } from '../src/lib/companion';
import { useCameraControls } from '../src/store/cameraControls';
import { useWorkshop } from '../src/store/workshop';

// The card for the camera's picture settings against a scripted companion: what it shows is what the camera reports,
// a number is sent on commit and shows its read-back, and what the camera refuses is said in the operator's words.
// (The whole way through the settings and the scan panel: e2e/camera-controls.spec.ts.)

const BASE = 'http://pi:8080';
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
const camera = (manual = true): CameraControl[] => [
  control({
    name: 'auto_exposure',
    type: 'menu',
    min: 0,
    max: 3,
    default: 3,
    value: manual ? 1 : 3,
    menu: [
      { value: 1, label: 'Manual Mode' },
      { value: 3, label: 'Aperture Priority Mode' },
    ],
  }),
  control({
    name: 'exposure_time_absolute',
    min: 1,
    max: 5000,
    default: 157,
    value: 157,
    inactive: !manual,
  }),
  control({ name: 'exposure_dynamic_framerate', type: 'bool', min: 0, max: 1, value: 1 }),
  control({ name: 'gain', value: 10 }),
  control({ name: 'white_balance_automatic', type: 'bool', min: 0, max: 1, value: 1, default: 1 }),
  control({
    name: 'white_balance_temperature',
    min: 2800,
    max: 6500,
    value: 4600,
    inactive: true,
  }),
];

/** The companion as a script: the list it reports, what a write answers, what was asked. */
let pi: {
  list: CameraControl[];
  puts: Record<string, number>[];
  gets: number;
  /** Null: the camera takes it as asked */
  answer: ((asked: Record<string, number>) => CameraControlsAnswer | Response) | null;
  getFails: Response | null;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input).replace(BASE, '');
  if (path !== '/api/camera/controls') return json({}, 404);
  if (init?.method === 'PUT') {
    const asked = (JSON.parse(String(init.body)) as { controls: Record<string, number> }).controls;
    pi.puts.push(asked);
    if (pi.answer) {
      const answer = pi.answer(asked);
      if (answer instanceof Response) return answer;
      pi.list = answer.controls;
      return json(answer);
    }
    const results: CameraControlsAnswer['results'] = {};
    for (const [name, value] of Object.entries(asked)) {
      pi.list = pi.list.map((c) => (c.name === name ? { ...c, value } : c));
      results[name] = { ok: true, value };
    }
    return json({ controls: pi.list, results });
  }
  pi.gets += 1;
  return pi.getFails ?? json({ controls: pi.list });
});

let clock = 1_800_000_000_000;
beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Each test starts well after the last write of the one before (the store keeps 0.6 s between writes)
  clock += 60_000;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(clock);
  pi = { list: camera(), puts: [], gets: 0, answer: null, getFails: null };
  fake.mockClear();
  vi.stubGlobal('fetch', fake);
  useWorkshop.getState().setSettings({ companionUrl: BASE });
  useWorkshop.setState({
    companionOnline: true,
    companionHealth: { ok: true, version: '0.1.0', cameraControls: true } as never,
  });
  useCameraControls.setState({ controls: null, error: null, loading: false });
});
afterEach(async () => {
  // A write that still waits for its gap must not be left to block the queue of the next test
  await settle(5000);
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const open = async () => {
  render(<CameraControlsCard />);
  await settle();
  await settle();
};

const val = (el: HTMLElement) => (el as HTMLInputElement | HTMLSelectElement).value;
const off = (el: HTMLElement) =>
  (el as HTMLInputElement).disabled || el.hasAttribute('data-disabled');
const textOf = (el: HTMLElement) => el.textContent ?? '';
const checked = (el: HTMLElement) => el.getAttribute('aria-checked') === 'true';
const row = (name: string) => screen.getByTestId(`camera-control-${name}`);
const typeInto = async (input: HTMLElement, text: string) => {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
  await settle();
  await settle();
};

describe('where the card shows', () => {
  it('only where a companion answers that it can set the camera', async () => {
    useWorkshop.setState({ companionHealth: { ok: true, version: '0.1.0' } as never });
    render(<CameraControlsCard />);
    await settle();
    expect(screen.queryByTestId('camera-controls')).toBeNull();
    expect(fake).not.toHaveBeenCalled();
    cleanup();
    useWorkshop.setState({
      companionOnline: false,
      companionHealth: { ok: true, version: '0.1.0', cameraControls: true } as never,
    });
    render(<CameraControlsCard />);
    await settle();
    expect(screen.queryByTestId('camera-controls')).toBeNull();
    expect(fake).not.toHaveBeenCalled();
  });

  it('reads the camera when it opens – and shows the settings in groups, with the exposure in ms', async () => {
    await open();
    expect(pi.gets).toBe(1);
    expect(screen.getByTestId('camera-controls').getAttribute('data-find')).toBe('camera-controls');
    expect(screen.getByRole('heading', { name: 'Belichtung und Bild' })).toBeTruthy();
    for (const group of ['exposure', 'whiteBalance'])
      expect(screen.getByTestId(`camera-group-${group}`)).toBeTruthy();
    const time = within(row('exposure_time_absolute'));
    expect(val(time.getByLabelText('Belichtungszeit (ms)'))).toBe('15,7');
    expect(time.getByText('Bereich 0,1 bis 500 ms')).toBeTruthy();
    // a setting that is no exposure time shows the camera's own number
    expect(val(within(row('gain')).getByLabelText('Verstärkung'))).toBe('10');
    expect(within(row('gain')).getByText('Bereich 0 bis 100')).toBeTruthy();
    // the menu says it in German; the switch is a box
    expect(val(within(row('auto_exposure')).getByRole('combobox'))).toBe('1');
    expect(within(row('auto_exposure')).getByRole('option', { name: 'Manuell' })).toBeTruthy();
    expect(checked(within(row('exposure_dynamic_framerate')).getByRole('checkbox'))).toBe(true);
  });

  it('says why a setting does nothing now, and does not let it be changed', async () => {
    await open();
    const wb = within(row('white_balance_temperature'));
    expect(off(wb.getByLabelText('Farbtemperatur'))).toBe(true);
    expect(off(wb.getByRole('button', { name: 'Farbtemperatur +' }))).toBe(true);
    expect(textOf(wb.getByTestId('control-inactive'))).toContain(
      'Ohne Wirkung, solange der Weißabgleich automatisch ist.',
    );
    cleanup();
    pi.list = camera(false);
    await open();
    expect(textOf(within(row('exposure_time_absolute')).getByTestId('control-inactive'))).toContain(
      'solange der Belichtungsmodus nicht „Manuell“ ist',
    );
    expect(off(within(row('exposure_time_absolute')).getByLabelText('Belichtungszeit (ms)'))).toBe(
      true,
    );
  });
});

describe('setting a number', () => {
  it('sends what was typed, in the camera’s unit, when the field is left – and shows the read-back', async () => {
    await open();
    // typed with a comma, as the operator does; rounded by the camera to 12 ms
    pi.answer = (asked) => ({
      controls: pi.list.map((c) => (c.name in asked ? { ...c, value: 120 } : c)),
      results: { exposure_time_absolute: { ok: true, value: 120 } },
    });
    await typeInto(
      within(row('exposure_time_absolute')).getByLabelText('Belichtungszeit (ms)'),
      '12,3',
    );
    expect(pi.puts).toEqual([{ exposure_time_absolute: 123 }]);
    expect(val(within(row('exposure_time_absolute')).getByLabelText('Belichtungszeit (ms)'))).toBe(
      '12',
    );
    expect(textOf(within(row('exposure_time_absolute')).getByTestId('control-note'))).toContain(
      'Die Kamera hat 12 ms daraus gemacht.',
    );
  });

  it('sends on Enter as well, and nothing when the number did not change', async () => {
    await open();
    const gain = within(row('gain')).getByLabelText('Verstärkung');
    fireEvent.change(gain, { target: { value: '25' } });
    fireEvent.keyDown(gain, { key: 'Enter' });
    // leaving the field right after Enter does not send it a second time
    fireEvent.blur(gain);
    await settle();
    await settle();
    // (a second write would have gone out after the companion's gap)
    await settle(1000);
    expect(pi.puts).toEqual([{ gain: 25 }]);
    expect(val(gain)).toBe('25');
    // the same number again: nothing to send
    await typeInto(gain, '25');
    expect(pi.puts).toHaveLength(1);
  });

  it('refuses a number outside the camera’s range without asking it – never makes it fit', async () => {
    await open();
    const time = within(row('exposure_time_absolute')).getByLabelText('Belichtungszeit (ms)');
    await typeInto(time, '600');
    expect(pi.puts).toEqual([]);
    expect(textOf(within(row('exposure_time_absolute')).getByTestId('control-note'))).toContain(
      'Außerhalb dessen, was die Kamera annimmt (0,1 bis 500 ms) – nicht gesetzt.',
    );
    expect(val(time)).toBe('15,7');
    await typeInto(time, 'abc');
    expect(pi.puts).toEqual([]);
    expect(textOf(within(row('exposure_time_absolute')).getByTestId('control-note'))).toContain(
      'Das ist keine Zahl – nicht gesetzt.',
    );
    await typeInto(time, '');
    expect(pi.puts).toEqual([]);
    expect(val(time)).toBe('15,7');
  });

  it('steps with the buttons: one millisecond for the exposure, one for the gain', async () => {
    await open();
    fireEvent.click(
      within(row('exposure_time_absolute')).getByRole('button', { name: 'Belichtungszeit +' }),
    );
    await settle();
    await settle();
    // the companion keeps half a second between two writes: the second one waits for it
    fireEvent.click(within(row('gain')).getByRole('button', { name: 'Verstärkung −' }));
    await settle();
    expect(pi.puts).toHaveLength(1);
    await settle(700);
    await settle();
    expect(pi.puts).toEqual([{ exposure_time_absolute: 167 }, { gain: 9 }]);
    expect(val(within(row('exposure_time_absolute')).getByLabelText('Belichtungszeit (ms)'))).toBe(
      '16,7',
    );
  });

  it('says what the camera refused, in words – and shows what the camera reports now', async () => {
    await open();
    // another device switched the camera to automatic a moment ago: the time is refused as inactive
    pi.answer = () => ({
      controls: camera(false),
      results: { exposure_time_absolute: { ok: false, error: 'refused:inactive' } },
    });
    await typeInto(
      within(row('exposure_time_absolute')).getByLabelText('Belichtungszeit (ms)'),
      '5',
    );
    expect(pi.puts).toEqual([{ exposure_time_absolute: 50 }]);
    const note = within(row('exposure_time_absolute')).getByTestId('control-note');
    expect(textOf(note)).toContain(
      'Die Kamera hat sie gerade abgeschaltet (Automatik an) – nicht gesetzt.',
    );
    // the display follows the camera: the field is the camera's value again, and now locked
    const field = within(row('exposure_time_absolute')).getByLabelText('Belichtungszeit (ms)');
    expect(val(field)).toBe('15,7');
    expect(off(field)).toBe(true);
  });

  it('says why a whole request failed', async () => {
    await open();
    pi.answer = () => json({ error: 'no-device' }, 503);
    await typeInto(within(row('gain')).getByLabelText('Verstärkung'), '30');
    expect(textOf(within(row('gain')).getByTestId('control-note'))).toContain(
      'Der Companion findet die Kamera nicht.',
    );
    expect(val(within(row('gain')).getByLabelText('Verstärkung'))).toBe('10');
  });
});

describe('choices and switches', () => {
  it('sends the number of the entry chosen, and 0 or 1 for a switch', async () => {
    await open();
    pi.answer = (asked) => ({
      controls: pi.list.map((c) =>
        c.name === 'auto_exposure' && 'auto_exposure' in asked
          ? { ...c, value: 3 }
          : c.name === 'exposure_time_absolute'
            ? { ...c, inactive: true }
            : c,
      ),
      results: { auto_exposure: { ok: true, value: 3 } },
    });
    fireEvent.change(within(row('auto_exposure')).getByRole('combobox'), {
      target: { value: '3' },
    });
    await settle();
    await settle();
    expect(pi.puts).toEqual([{ auto_exposure: 3 }]);
    // the switch of the mode made the time inactive: the card shows it
    expect(off(within(row('exposure_time_absolute')).getByLabelText('Belichtungszeit (ms)'))).toBe(
      true,
    );

    pi.answer = null;
    fireEvent.click(within(row('exposure_dynamic_framerate')).getByRole('checkbox'));
    await settle();
    await settle();
    // the second write waited for the gap the companion keeps between two
    await settle(700);
    expect(pi.puts.at(-1)).toEqual({ exposure_dynamic_framerate: 0 });
    expect(checked(within(row('exposure_dynamic_framerate')).getByRole('checkbox'))).toBe(false);
  });
});

describe('when the camera cannot be read', () => {
  it('says why, in words, and reads again on request', async () => {
    pi.getFails = json({ error: 'no-permission' }, 403);
    await open();
    const alert = screen.getByTestId('camera-controls-error');
    expect(alert.getAttribute('data-error')).toBe('no-permission');
    expect(textOf(alert)).toContain('sudo usermod -aG video');
    expect(screen.queryByTestId('camera-group-exposure')).toBeNull();
    pi.getFails = null;
    fireEvent.click(screen.getByRole('button', { name: /Neu lesen/ }));
    await settle();
    await settle();
    expect(pi.gets).toBe(2);
    expect(screen.queryByTestId('camera-controls-error')).toBeNull();
    expect(screen.getByTestId('camera-group-exposure')).toBeTruthy();
  });

  it('knows a companion from before the feature, and one that does not answer', async () => {
    pi.getFails = json({ message: 'Route not found', error: 'Not Found' }, 404);
    await open();
    expect(screen.getByTestId('camera-controls-error').getAttribute('data-error')).toBe('old');
    cleanup();
    useCameraControls.setState({ controls: null, error: null });
    fake.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    await open();
    expect(screen.getByTestId('camera-controls-error').getAttribute('data-error')).toBe(
      'unreachable',
    );
  });

  it('says when the camera reports nothing the app may change', async () => {
    pi.list = [];
    await open();
    expect(
      screen.getByText('Die Kamera meldet keine Einstellungen, die die App ändern darf.'),
    ).toBeTruthy();
  });
});
