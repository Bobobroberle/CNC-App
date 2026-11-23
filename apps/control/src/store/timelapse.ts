import { create } from 'zustand';
import { t } from '../i18n';
import { downloadBlob } from '../lib/download';
import { captureFrame, Timelapse } from '../lib/timelapse';
import { cameraElement } from './camera';
import { useMachine } from './machine';
import { useRecorder } from './recorder';
import { companionRecordsJobs } from './recording';

interface TimelapseStore {
  enabled: boolean;
  /** Seconds between two pictures */
  seconds: number;
  setEnabled(enabled: boolean): void;
  setSeconds(seconds: number): void;
}

export const useTimelapse = create<TimelapseStore>((set) => ({
  enabled: false,
  seconds: 5,
  setEnabled: (enabled) => set({ enabled }),
  setSeconds: (seconds) => set({ seconds: Math.max(1, Math.round(seconds)) }),
}));

/**
 * Records a timelapse during every job while it is switched on, whichever
 * room is open, and offers the video when the job ends.
 */
export function startTimelapseRecorder(): () => void {
  let lapse: Timelapse | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    const done = lapse;
    lapse = null;
    if (done && done.count > 1) {
      void done.render().then((blob) => {
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        if (blob) downloadBlob(`zeitraffer-${stamp}.webm`, blob);
      });
      useMachine.getState().addLog('info', t('camera.timelapseDone', { frames: done.count }));
    }
  };
  const update = () => {
    const { enabled, seconds } = useTimelapse.getState();
    // The companion records instead: no second, browser-bound timelapse.
    const want = enabled && useRecorder.getState().active && !companionRecordsJobs();
    if (!want) {
      stop();
      return;
    }
    if (timer) return;
    lapse = new Timelapse();
    timer = setInterval(() => {
      const el = cameraElement();
      if (el) void captureFrame(el).then((b) => b && lapse?.add(b));
    }, seconds * 1000);
  };
  const offA = useTimelapse.subscribe(update);
  const offB = useRecorder.subscribe(update);
  return () => {
    offA();
    offB();
    stop();
  };
}
