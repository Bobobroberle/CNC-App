import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanionClient, resolveCameraUrl } from '../src/lib/companion';
import {
  DEFAULT_SETTINGS,
  adoptCompanion,
  detectCompanion,
  useWorkshop,
} from '../src/store/workshop';

const health = (extra: object = {}) =>
  new Response(
    JSON.stringify({ ok: true, version: '0.1.0', fluidnc: null, sensors: 'push', ...extra }),
  );

describe('companion camera address', () => {
  it('resolves ports and paths against the companion host', () => {
    expect(resolveCameraUrl('http://192.168.178.50:8080', ':8081/stream')).toBe(
      'http://192.168.178.50:8081/stream',
    );
    expect(resolveCameraUrl('http://pi.local:8080', '/camera')).toBe('http://pi.local:8080/camera');
    expect(resolveCameraUrl('http://pi.local:8080', 'http://cam.local/s')).toBe(
      'http://cam.local/s',
    );
  });
});

describe('companion detection', () => {
  beforeEach(() => {
    useWorkshop.setState({ settings: DEFAULT_SETTINGS, companionOnline: null });
  });

  it('finds the companion that serves the app and takes its camera', async () => {
    const fetchFn = vi.fn(async () => health({ camera: ':8081/stream' }));
    expect(await detectCompanion('http://192.168.178.50:8080', fetchFn)).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('http://192.168.178.50:8080/api/health', undefined);
    const { settings, companionOnline } = useWorkshop.getState();
    expect(settings.companionUrl).toBe('http://192.168.178.50:8080');
    expect(settings.camera.streamUrl).toBe('http://192.168.178.50:8081/stream');
    expect(companionOnline).toBe(true);
  });

  it('leaves a configured companion and other servers alone', async () => {
    const fetchFn = vi.fn(async () => new Response('<!doctype html>'));
    expect(await detectCompanion('file://', fetchFn)).toBe(false);
    expect(await detectCompanion('http://localhost:4173', fetchFn)).toBe(false);
    const notOurs = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    expect(await detectCompanion('http://localhost:4173', notOurs)).toBe(false);
    expect(useWorkshop.getState().settings.companionUrl).toBe('');

    useWorkshop.getState().setSettings({ companionUrl: 'pi.local' });
    expect(await detectCompanion('http://192.168.178.50:8080', fetchFn)).toBe(false);
  });

  it('asks a configured companion at start so its features show', async () => {
    useWorkshop.getState().setSettings({ companionUrl: 'pi.local:8080' });
    const fetchFn = vi.fn(async () => health({ shutdown: true }));
    expect(await detectCompanion('file://', fetchFn)).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('http://pi.local:8080/api/health', undefined);
    expect(useWorkshop.getState().companionHealth?.shutdown).toBe(true);
    expect(useWorkshop.getState().companionOnline).toBe(true);
    const notOurs = vi.fn(async () => new Response(JSON.stringify({ ok: false })));
    expect(await detectCompanion('file://', notOurs)).toBe(false);
  });

  it('keeps a camera stream that is already set', () => {
    const { camera } = useWorkshop.getState().settings;
    useWorkshop.getState().setSettings({
      companionUrl: 'pi.local',
      camera: { ...camera, streamUrl: 'http://cam.local/s' },
    });
    adoptCompanion({
      ok: true,
      version: '1',
      fluidnc: null,
      sensors: 'push',
      camera: ':8081/stream',
    });
    expect(useWorkshop.getState().settings.camera.streamUrl).toBe('http://cam.local/s');
    useWorkshop.getState().setSettings({ camera: { ...camera, streamUrl: '' } });
    adoptCompanion({
      ok: true,
      version: '1',
      fluidnc: null,
      sensors: 'push',
      camera: ':8081/stream',
    });
    expect(useWorkshop.getState().settings.camera.streamUrl).toBe('http://pi.local:8081/stream');
  });
});

describe('companion power-off', () => {
  it('posts the shutdown and polls the health check with a time limit', async () => {
    const fetchFn = vi.fn(async () => health());
    const c = new CompanionClient('http://lowrider:8080', fetchFn as unknown as typeof fetch);
    await c.shutdown();
    expect(fetchFn).toHaveBeenLastCalledWith('http://lowrider:8080/api/system/shutdown', {
      method: 'POST',
    });
    await c.health(1500);
    const init = (fetchFn.mock.calls.at(-1) as unknown[])[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('recordings on the companion', () => {
  it('starts, stops, lists and removes recordings, and passes error codes on', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.endsWith('/start')) {
        return new Response(JSON.stringify({ error: 'disk-full' }), { status: 507 });
      }
      if (url.endsWith('/stop')) return new Response('nope', { status: 500 });
      return new Response(JSON.stringify({ ok: true }));
    });
    const c = new CompanionClient('http://pi:8080', fetchFn as unknown as typeof fetch);
    await c.recordings();
    await expect(
      c.startRecording({
        mode: 'timelapse',
        intervalSeconds: 5,
        jobName: 'a.nc',
        safeHeightOnly: false,
        safeZ: null,
      }),
    ).rejects.toMatchObject({ status: 507, code: 'disk-full', message: 'HTTP 507' });
    await expect(c.stopRecording()).rejects.toMatchObject({ status: 500, code: null });
    await c.removeRecording('rec-1');
    expect(calls.map(([u, i]) => `${i?.method ?? 'GET'} ${u}`)).toEqual([
      'GET http://pi:8080/api/recordings',
      'POST http://pi:8080/api/recordings/start',
      'POST http://pi:8080/api/recordings/stop',
      'DELETE http://pi:8080/api/recordings/rec-1',
    ]);
    expect(c.recordingUrl('rec-1', 'video')).toBe(
      'http://pi:8080/api/recordings/rec-1/file?kind=video',
    );
    expect(c.recordingUrl('rec-1', 'timelapse', true)).toBe(
      'http://pi:8080/api/recordings/rec-1/file?kind=timelapse&download=1',
    );
  });
});
