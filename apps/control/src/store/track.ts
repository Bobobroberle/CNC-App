import { stateAtTime, type Vec4 } from '@lowrider/gcode-core';
import { create } from 'zustand';
import { axesToVec4, JobTracker } from '../lib/tracking';
import { useJob } from './job';
import { useMachine } from './machine';

export type TrackMode = 'sim' | 'live';

interface TrackStore {
  mode: TrackMode;
  /** Segment index and parameter of the current position on the job */
  index: number;
  t: number;
  /**
   * Segments before this index are done (green). Live it only grows while
   * the machine runs the job, like in the prototype.
   */
  done: number;
  /** Tool position on the path (simulation) */
  position: Vec4 | null;
  /** Real machine position (work coordinates) while connected */
  live: Vec4 | null;
  deviation: number | null;
  maxDeviation: number;
  /** Source line index (0-based) of the current segment */
  lineIndex: number | null;
  /** Current speed in mm/min (simulation) */
  speed: number | null;
}

export const useTrack = create<TrackStore>(() => ({
  mode: 'sim',
  index: 0,
  t: 0,
  done: 0,
  position: null,
  live: null,
  deviation: null,
  maxDeviation: 0,
  lineIndex: null,
  speed: null,
}));

const LIVE_STATES = new Set(['Run', 'Hold', 'Jog', 'Door']);

/** Drops the live progress; the simulation takes over the stage again. */
export function resetProgress(): void {
  liveProgress = -1;
  useTrack.setState({ done: 0, maxDeviation: 0 });
  update?.();
}

/** -1 = no live progress yet */
let liveProgress = -1;
let update: (() => void) | null = null;

/** Keeps the track store in sync with the job, the simulation clock and the machine. */
export function startTrackingEngine(): () => void {
  let tracker: JobTracker | null = null;
  let trackedAnalysis: unknown = null;
  let lastSimTime = 0;

  update = () => {
    const { analysis, simTime, toolDiameter } = useJob.getState();
    const { status, connection } = useMachine.getState();
    const live = connection === 'connected' && status ? axesToVec4(status.wpos) : null;

    if (analysis !== trackedAnalysis) {
      trackedAnalysis = analysis;
      tracker = analysis ? new JobTracker(analysis.segments) : null;
      liveProgress = -1;
      useTrack.setState({ maxDeviation: 0, done: 0 });
    }
    // Touching the simulation hands the stage back to it.
    if (simTime !== lastSimTime) {
      lastSimTime = simTime;
      liveProgress = -1;
    }
    if (!analysis) {
      useTrack.setState({
        mode: 'sim',
        position: null,
        live,
        lineIndex: null,
        deviation: null,
        speed: null,
      });
      return;
    }

    if (live && status && tracker && (LIVE_STATES.has(status.state) || liveProgress >= 0)) {
      const hit = tracker.locate(live, status.lineNumber);
      if (hit) {
        // Progress only advances while running and when the tool is really on the path.
        const onPath = hit.deviation === null || hit.deviation < Math.max(1, toolDiameter / 2);
        if (status.state === 'Run' && onPath) liveProgress = Math.max(liveProgress, hit.index);
        const prevMax = useTrack.getState().maxDeviation;
        useTrack.setState({
          mode: 'live',
          index: hit.index,
          t: hit.t,
          done: Math.max(0, liveProgress),
          position: null,
          live,
          deviation: hit.deviation,
          maxDeviation: Math.max(prevMax, hit.deviation ?? 0),
          lineIndex: analysis.segments[hit.index]!.lineIndex,
          speed: status.feed,
        });
        return;
      }
    }

    const state = analysis.timeline
      ? stateAtTime(analysis.timeline, analysis.segments, simTime)
      : null;
    useTrack.setState({
      mode: 'sim',
      index: state?.segmentIndex ?? 0,
      t: state?.t ?? 0,
      done: state?.segmentIndex ?? 0,
      position: state?.position ?? null,
      live,
      deviation: null,
      lineIndex: state ? analysis.segments[state.segmentIndex]!.lineIndex : null,
      speed: state?.speed ?? null,
    });
  };

  const offJob = useJob.subscribe(update);
  const offMachine = useMachine.subscribe(update);
  update();
  return () => {
    offJob();
    offMachine();
    update = null;
  };
}
