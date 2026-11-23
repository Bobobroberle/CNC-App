import { afterEach, describe, expect, it, vi } from 'vitest';
import { useJob } from '../src/store/job';
import { useRecorder } from '../src/store/recorder';
import {
  companionRecordsJobs,
  jobSafeZ,
  recordingSeconds,
  startRecordingLink,
  useRecording,
} from '../src/store/recording';
import { DEFAULT_SETTINGS, useWorkshop } from '../src/store/workshop';
import type { Recording } from '../src/lib/companion';

const flush = () => new Promise((r) => setTimeout(r, 0));

function companionWith(
  auto: boolean,
  respond: (url: string, init?: RequestInit) => Response = () =>
    new Response(
      JSON.stringify({
        capabilities: { ffmpeg: true, hwEncoder: true, observe: true },
        active: null,
        recordings: [],
      }),
    ),
) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return respond(url, init);
    }),
  );
  useWorkshop.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      companionUrl: 'http://pi:8080',
      recording: { ...DEFAULT_SETTINGS.recording, auto },
    },
    companionHealth: {
      ok: true,
      version: '0.1.0',
      fluidnc: null,
      sensors: 'push',
      recordings: true,
    },
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  useWorkshop.setState({ settings: DEFAULT_SETTINGS, companionHealth: null });
  useRecorder.setState({ active: false });
});

describe('recording on the companion', () => {
  it('starts with every job and stops at its end when switched on', async () => {
    const calls = companionWith(true);
    expect(companionRecordsJobs()).toBe(true);
    const off = startRecordingLink();
    useRecorder.setState({ active: true });
    await flush();
    useRecorder.setState({ active: false });
    await flush();
    off();
    expect(calls.filter((c) => c.startsWith('POST'))).toEqual([
      'POST http://pi:8080/api/recordings/start',
      'POST http://pi:8080/api/recordings/stop',
    ]);
  });

  it('stays out of jobs when switched off', async () => {
    const calls = companionWith(false);
    const off = startRecordingLink();
    useRecorder.setState({ active: true });
    await flush();
    off();
    expect(calls).toEqual([]);
  });

  it('tells why it cannot record', async () => {
    await useRecording.getState().refresh();
    expect(useRecording.getState().unavailable).toBe('no-companion');
    companionWith(true, () => new Response('', { status: 404 }));
    await useRecording.getState().refresh();
    expect(useRecording.getState().unavailable).toBe('outdated');
    companionWith(true, () => {
      throw new TypeError('offline');
    });
    await useRecording.getState().refresh();
    expect(useRecording.getState().unavailable).toBe('no-companion');
    companionWith(
      true,
      () =>
        new Response(
          JSON.stringify({
            capabilities: { ffmpeg: false, hwEncoder: false, observe: false },
            active: null,
            recordings: [],
          }),
        ),
    );
    await useRecording.getState().refresh();
    expect(useRecording.getState().unavailable).toBe('no-ffmpeg');
  });

  it('knows the safe height of the job and how long a recording ran', () => {
    useJob.setState({ analysis: null });
    expect(jobSafeZ()).toBeNull();
    useJob.setState({
      analysis: { bounds: { min: { z: -6 }, max: { z: 5 } } } as never,
    });
    expect(jobSafeZ()).toBe(5);
    const r = { startedAt: 1000, endedAt: 61_000 } as Recording;
    expect(recordingSeconds(r)).toBe(60);
    expect(recordingSeconds({ ...r, endedAt: null }, 31_000)).toBe(30);
    useJob.setState({ analysis: null });
  });
});
