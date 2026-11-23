import { useJob } from './job';
import { useMachine } from './machine';
import { useTrack } from './track';

export interface JobProgress {
  name: string;
  /** 0…100, or undefined while unknown */
  percent: number | undefined;
  /** Seconds left after the estimate, or null while not tracking live */
  remaining: number | null;
  holding: boolean;
}

/** The running job at a glance, from the stream, the SD report and the live tracking. */
export function useJobProgress(): JobProgress | null {
  const fileJob = useMachine((s) => s.fileJob);
  const stream = useMachine((s) => (s.stream?.result === 'running' ? s.stream : null));
  const state = useMachine((s) => s.status?.state);
  const sd = useMachine((s) => s.status?.sd);
  const timeline = useJob((s) => s.analysis?.timeline);
  const mode = useTrack((s) => s.mode);
  const index = useTrack((s) => s.index);
  const active = fileJob !== null || stream !== null || state === 'Run' || state === 'Hold';
  if (!active) return null;
  const percent = stream
    ? (100 * stream.progress.acknowledged) / Math.max(1, stream.progress.total)
    : sd?.percent;
  const remaining =
    mode === 'live' && timeline
      ? Math.max(0, timeline.total - (timeline.segmentStart[index] ?? timeline.total))
      : null;
  return {
    name: fileJob?.name ?? stream?.name ?? sd?.file ?? '—',
    percent,
    remaining,
    holding: state === 'Hold',
  };
}
