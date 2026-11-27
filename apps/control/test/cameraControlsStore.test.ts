// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraControl } from '../src/lib/companion';
import { CameraFailureError, WRITE_GAP_MS, useCameraControls } from '../src/store/cameraControls';
import { useWorkshop } from '../src/store/workshop';

// The store between the card and the companion: writes one after the other with the gap the companion keeps, a
// write that came too fast is tried once more, an answer that is older than the last request does not replace a
// newer one, and what the scan panel takes over is read at that moment – never what was read before.

const BASE = 'http://pi:8080';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const control = (value: number, over: Partial<CameraControl> = {}): CameraControl => ({
  name: 'exposure_time_absolute',
  type: 'int',
  min: 1,
  max: 5000,
  step: 1,
  default: 157,
  value,
  inactive: false,
  readOnly: false,
  ...over,
});
const manual: CameraControl = {
  name: 'auto_exposure',
  type: 'menu',
  min: 0,
  max: 3,
  step: 1,
  default: 3,
  value: 1,
  inactive: false,
  readOnly: false,
  menu: [
    { value: 1, label: 'Manual Mode' },
    { value: 3, label: 'Aperture Priority Mode' },
  ],
};

const calls: { method: string; at: number; body?: unknown }[] = [];
let respond: (call: { method: string; body?: unknown }) => Promise<Response> | Response;
const fake = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
  const call = {
    method: init?.method ?? 'GET',
    at: Date.now(),
    ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
  };
  calls.push(call);
  return respond(call);
});

let clock = 1_900_000_000_000;
beforeEach(() => {
  clock += 60_000;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(clock);
  calls.length = 0;
  fake.mockClear();
  vi.stubGlobal('fetch', fake);
  useWorkshop.getState().setSettings({ companionUrl: BASE });
  useCameraControls.setState({ controls: null, error: null, loading: false });
  respond = () => json({ controls: [manual, control(157)] });
});
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(5000);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const answer = (value: number) =>
  json({
    controls: [manual, control(value)],
    results: { exposure_time_absolute: { ok: true, value } },
  });

describe('writing', () => {
  it('waits for the gap the companion keeps between two writes – one after the other', async () => {
    respond = (call) =>
      answer(
        (call.body as { controls: { exposure_time_absolute: number } }).controls
          .exposure_time_absolute,
      );
    const first = useCameraControls.getState().apply({ exposure_time_absolute: 100 });
    const second = useCameraControls.getState().apply({ exposure_time_absolute: 200 });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => c.body)).toEqual([{ controls: { exposure_time_absolute: 100 } }]);
    await first;
    await vi.advanceTimersByTimeAsync(WRITE_GAP_MS + 10);
    await second;
    expect(calls.map((c) => c.body)).toEqual([
      { controls: { exposure_time_absolute: 100 } },
      { controls: { exposure_time_absolute: 200 } },
    ]);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(WRITE_GAP_MS);
    // what the camera answered last is what is shown
    expect(useCameraControls.getState().controls![1]!.value).toBe(200);
  });

  it('tries once more when the companion says it came too fast, and gives up the second time', async () => {
    let n = 0;
    respond = () => (++n === 1 ? json({ error: 'rate-limited' }, 429) : answer(100));
    const done = useCameraControls.getState().apply({ exposure_time_absolute: 100 });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await done).results.exposure_time_absolute).toEqual({ ok: true, value: 100 });
    expect(n).toBe(2);

    await vi.advanceTimersByTimeAsync(5000);
    n = 0;
    respond = () => {
      n += 1;
      return json({ error: 'rate-limited' }, 429);
    };
    const failing = useCameraControls.getState().apply({ exposure_time_absolute: 100 });
    const assertion = expect(failing).rejects.toMatchObject({ failure: 'rate-limited' });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
    expect(n).toBe(2);
  });

  it('throws the failure’s code – and a failed write does not block the next', async () => {
    respond = () => json({ error: 'no-device' }, 503);
    const failing = useCameraControls.getState().apply({ gain: 1 });
    const assertion = expect(failing).rejects.toBeInstanceOf(CameraFailureError);
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
    await vi.advanceTimersByTimeAsync(WRITE_GAP_MS + 10);
    respond = () => answer(120);
    const next = useCameraControls.getState().apply({ exposure_time_absolute: 120 });
    await vi.advanceTimersByTimeAsync(10);
    await expect(next).resolves.toMatchObject({
      results: { exposure_time_absolute: { ok: true } },
    });
  });

  it('says "unreachable" where there is no companion address', async () => {
    useWorkshop.getState().setSettings({ companionUrl: '' });
    await expect(useCameraControls.getState().apply({ gain: 1 })).rejects.toMatchObject({
      failure: 'unreachable',
    });
    await expect(useCameraControls.getState().read()).rejects.toMatchObject({
      failure: 'unreachable',
    });
    expect(fake).not.toHaveBeenCalled();
  });
});

describe('reading', () => {
  it('shows what the camera reports, and why a read failed', async () => {
    await useCameraControls.getState().read();
    expect(useCameraControls.getState()).toMatchObject({ error: null, loading: false });
    expect(useCameraControls.getState().controls).toHaveLength(2);
    respond = () => json({ error: 'timeout' }, 504);
    await expect(useCameraControls.getState().read()).rejects.toMatchObject({ failure: 'timeout' });
    // the list that was read stays; the reason is said
    expect(useCameraControls.getState()).toMatchObject({ error: 'timeout', loading: false });
    expect(useCameraControls.getState().controls).toHaveLength(2);
  });

  it('does not let a read that is older than a write replace what the write answered', async () => {
    let release!: (r: Response) => void;
    respond = (call) =>
      call.method === 'GET' ? new Promise<Response>((done) => (release = done)) : answer(300);
    const slowRead = useCameraControls.getState().read();
    await vi.advanceTimersByTimeAsync(0);
    const write = useCameraControls.getState().apply({ exposure_time_absolute: 300 });
    await vi.advanceTimersByTimeAsync(10);
    await write;
    expect(useCameraControls.getState().controls![1]!.value).toBe(300);
    // the read answers late, with what was true before the write
    release(json({ controls: [manual, control(157)] }));
    await slowRead;
    expect(useCameraControls.getState().controls![1]!.value).toBe(300);
    expect(useCameraControls.getState().loading).toBe(true);
  });
});

describe('what the scan panel takes over', () => {
  it('is read from the camera at that moment, every time', async () => {
    expect(await useCameraControls.getState().takeOver()).toEqual({ kind: 'ms', ms: 15.7 });
    respond = () => json({ controls: [manual, control(100)] });
    expect(await useCameraControls.getState().takeOver()).toEqual({ kind: 'ms', ms: 10 });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET']);
    // automatic: nothing to take
    respond = () => json({ controls: [{ ...manual, value: 3 }, control(100, { inactive: true })] });
    expect(await useCameraControls.getState().takeOver()).toEqual({ kind: 'auto' });
  });

  it('says why where the camera cannot be read – and takes nothing from what was read before', async () => {
    await useCameraControls.getState().read();
    respond = () => json({ error: 'no-device' }, 503);
    await expect(useCameraControls.getState().takeOver()).rejects.toMatchObject({
      failure: 'no-device',
    });
  });
});
