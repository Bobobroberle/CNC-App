import { DeviationRecorder, type JobRecord, type JobResult } from '@lowrider/workshop';
import { create } from 'zustand';
import { useJob } from './job';
import { useMachine } from './machine';
import { useTrack } from './track';
import { useWorkshop } from './workshop';

/** Live view of the running job's deviation trend (Ist/Soll over time). */
interface RecorderStore {
  active: boolean;
  trend: [number, number][];
  /** Last finished job, for the summary after the end */
  last: JobRecord | null;
}

export const useRecorder = create<RecorderStore>(() => ({ active: false, trend: [], last: null }));

type JobEndListener = (record: JobRecord) => void;
const endListeners = new Set<JobEndListener>();

/** Called with every finished job (notifications, learning). */
export function onJobEnd(listener: JobEndListener): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

interface Running {
  name: string;
  startedAt: number;
  recorder: DeviationRecorder;
  overrideSum: number;
  overrideCount: number;
  alarms: number[];
  chatter: boolean;
  loadSum: number;
  loadCount: number;
}

let running: Running | null = null;

/** Sensor observations reported by the sensor store while a job runs. */
export function observeSensors(load: number | null, chatter: boolean): void {
  if (!running) return;
  if (load !== null) {
    running.loadSum += load;
    running.loadCount++;
  }
  if (chatter) running.chatter = true;
}

/**
 * Watches the machine for jobs (streamed or from the SD card) and records
 * each one into the history: duration, result, alarms, feed override and
 * the Ist/Soll deviation over time.
 */
export function startRecorder(): () => void {
  let lastPush = 0;
  const begin = (name: string) => {
    running = {
      name,
      startedAt: Date.now(),
      recorder: new DeviationRecorder(),
      overrideSum: 0,
      overrideCount: 0,
      alarms: [],
      chatter: false,
      loadSum: 0,
      loadCount: 0,
    };
    useRecorder.setState({ active: true, trend: [] });
  };
  const end = (result: JobResult) => {
    const r = running;
    if (!r) return;
    running = null;
    const { analysis } = useJob.getState();
    const now = Date.now();
    const record: JobRecord = {
      id: `job-${r.startedAt.toString(36)}`,
      file: r.name,
      startedAt: r.startedAt,
      endedAt: now,
      duration: (now - r.startedAt) / 1000,
      estimate: analysis?.timeline?.total ?? 0,
      tools: analysis?.tools ?? [],
      ...(useWorkshop.getState().setup.materialId
        ? { materialId: useWorkshop.getState().setup.materialId! }
        : {}),
      result: r.alarms.length > 0 ? 'alarm' : result,
      alarms: r.alarms,
      feedOverride: r.overrideCount > 0 ? Math.round(r.overrideSum / r.overrideCount) : 100,
      deviation: r.recorder.stats(),
      trend: r.recorder.trend(),
    };
    useWorkshop.getState().addRecord(record, {
      chatter: r.chatter,
      ...(r.loadCount > 0 ? { load: r.loadSum / r.loadCount } : {}),
    });
    useRecorder.setState({ active: false, trend: record.trend, last: record });
    for (const l of endListeners) l(record);
  };

  const offMachine = useMachine.subscribe((s, prev) => {
    // Start: a stream starts, or an SD job starts.
    if (s.stream && s.stream !== prev.stream && s.stream.result === 'running' && !running) {
      begin(s.stream.name);
    }
    if (s.fileJob && !prev.fileJob && !running) begin(s.fileJob.name);
    if (running && s.alarm !== null && prev.alarm === null) running.alarms.push(s.alarm);
    // End of a stream.
    if (running && s.stream && prev.stream?.result === 'running' && s.stream.result !== 'running') {
      end(s.stream.result === 'done' ? 'done' : 'aborted');
    }
    // End of an SD job: FluidNC acknowledges $SD/Run, or the job was reset.
    if (running && !s.fileJob && prev.fileJob)
      end(s.lastFileResult === 'done' ? 'done' : 'aborted');
    if (running && s.connection !== 'connected') end('aborted');
    if (running && s.status && s.status !== prev.status && s.status.state === 'Run') {
      running.overrideSum += s.status.overrides.feed;
      running.overrideCount++;
    }
  });
  const offTrack = useTrack.subscribe((tr) => {
    if (!running || tr.mode !== 'live' || tr.deviation === null) return;
    const seconds = (Date.now() - running.startedAt) / 1000;
    running.recorder.add(seconds, tr.deviation);
    if (Date.now() - lastPush > 1000) {
      lastPush = Date.now();
      useRecorder.setState({ trend: running.recorder.trend() });
    }
  });
  return () => {
    offMachine();
    offTrack();
  };
}
