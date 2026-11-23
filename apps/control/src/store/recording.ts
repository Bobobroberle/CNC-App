import { create } from 'zustand';
import { t } from '../i18n';
import { CompanionError, type Recording, type RecordingList } from '../lib/companion';
import { useJob } from './job';
import { useMachine } from './machine';
import { useRecorder } from './recorder';
import { companion, useWorkshop } from './workshop';

export type { RecordingSettings } from './workshop';

/**
 * no-companion: none configured or not reachable; outdated: it has no recording
 * routes; no-ffmpeg: ffmpeg is missing on the Pi.
 */
export type RecordingUnavailable = 'no-companion' | 'outdated' | 'no-ffmpeg';

interface RecordingStore {
  list: RecordingList | null;
  unavailable: RecordingUnavailable | null;
  busy: boolean;
  refresh(): Promise<void>;
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

/** Work Z the job retracts to: the highest point it moves at, or null. */
export function jobSafeZ(): number | null {
  const b = useJob.getState().analysis?.bounds;
  return b && b.min.z <= b.max.z ? b.max.z : null;
}

function jobName(): string {
  const { stream, fileJob } = useMachine.getState();
  return stream?.name ?? fileJob?.name ?? useJob.getState().fileName ?? '';
}

const ERRORS: Record<string, Parameters<typeof t>[0]> = {
  'no-ffmpeg': 'recording.errors.noFfmpeg',
  'disk-full': 'recording.errors.diskFull',
  'already-recording': 'recording.errors.already',
};

export const useRecording = create<RecordingStore>((set, get) => ({
  list: null,
  unavailable: null,
  busy: false,

  async refresh() {
    const c = companion();
    if (!c) {
      set({ list: null, unavailable: 'no-companion' });
      return;
    }
    try {
      const list = await c.recordings();
      set({ list, unavailable: list.capabilities.ffmpeg ? null : 'no-ffmpeg' });
    } catch (e) {
      set({
        list: null,
        unavailable:
          e instanceof CompanionError && (e.status === 404 || e.status === 501)
            ? 'outdated'
            : 'no-companion',
      });
    }
  },

  async start() {
    const c = companion();
    if (!c || get().busy) return false;
    const s = useWorkshop.getState().settings.recording;
    const { addLog } = useMachine.getState();
    set({ busy: true });
    try {
      const safeZ = jobSafeZ();
      await c.startRecording({
        mode: s.mode,
        intervalSeconds: s.intervalSeconds,
        jobName: jobName(),
        safeHeightOnly: s.safeHeightOnly && s.mode !== 'video' && safeZ !== null,
        safeZ,
      });
      addLog('info', t('recording.started'));
      return true;
    } catch (e) {
      const code = e instanceof CompanionError ? e.code : null;
      addLog(
        'error',
        t('recording.startFailed', {
          reason: code && ERRORS[code] ? t(ERRORS[code]) : (e as Error).message,
        }),
        'recording.startFailed',
      );
      return false;
    } finally {
      set({ busy: false });
      await get().refresh();
    }
  },

  async stop() {
    const c = companion();
    if (!c) return false;
    try {
      await c.stopRecording();
      useMachine.getState().addLog('info', t('recording.stopped'));
      return true;
    } catch {
      // Already stopped by the companion (job end seen through the relay).
      return false;
    } finally {
      await get().refresh();
    }
  },

  async remove(id) {
    const c = companion();
    if (!c) return false;
    try {
      await c.removeRecording(id);
      return true;
    } catch {
      return false;
    } finally {
      await get().refresh();
    }
  },
}));

/** The companion records with every job: the browser timelapse stays off then. */
export function companionRecordsJobs(): boolean {
  const { settings, companionHealth } = useWorkshop.getState();
  return settings.recording.auto && companionHealth?.recordings === true;
}

/** Starts the companion's recording with every job and stops it at the end. */
export function startRecordingLink(): () => void {
  return useRecorder.subscribe((s, prev) => {
    if (s.active === prev.active || !companionRecordsJobs()) return;
    const store = useRecording.getState();
    if (s.active) void store.start();
    else void store.stop();
  });
}

/** Seconds a recording has run (or ran). */
export function recordingSeconds(r: Recording, now = Date.now()): number {
  return Math.max(0, ((r.endedAt ?? now) - r.startedAt) / 1000);
}
