import { useMemo } from 'react';
import { t, tDynamic } from '../i18n';
import { preparedFor, type PreparedPart } from '../lib/prepare';
import { blockers } from '../lib/readiness';
import { pendingWarnings, startWarnings, type StartWarning } from '../lib/startChecks';
import { useJob } from './job';
import { useMachine } from './machine';
import { useReadiness } from './readiness';
import { useRun, type RunPhase } from './run';
import { useJobTools } from './steps';
import { safeMachineZ, useWorkshop } from './workshop';

/**
 * Everything the start of the loaded job hangs on, in one place: the action
 * bar's hold, the panel of step ⑤ and the confirmation all read this, so
 * they cannot disagree about what starts, whether it may and what has to be
 * confirmed first.
 */
export interface Start {
  /** The job the start belongs to (`useRun.jobKey`) */
  key: string;
  parts: PreparedPart[];
  /** The part that starts next (or runs) */
  index: number;
  part: PreparedPart;
  phase: RunPhase;
  /** What the hold says: "Fräsen starten" or the part with its tool */
  label: string;
  /** Why the start cannot be held right now; null when it can */
  reason: string | null;
  /** Points of the readiness list that keep it locked */
  blocked: number;
  /** §6.4: what the operator has to confirm before this start */
  warnings: StartWarning[];
  pending: StartWarning[];
  /** A tool of the job is marked as a probe and the program switches the spindle on */
  probeLock: boolean;
  repairedLines: number;
  addedPreamble: boolean;
  /** The program switches a spindle the controller does not have */
  manualSpindle: boolean;
}

export function useStart(): Start | null {
  const fileName = useJob((s) => s.fileName);
  const lines = useJob((s) => s.lines);
  const kinematics = useJob((s) => s.profile.kinematics);
  const spindleControlled = useJob((s) => s.profile.controller.spindleControlled);
  const zMax = useJob((s) => s.profile.travel.z.max);
  const analysis = useJob((s) => s.analysis);
  const connected = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.status?.state === 'Idle');
  const viewer = useMachine((s) => s.viewer);
  const busy = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const homed = useMachine((s) => s.homed);
  const low = useMachine((s) => {
    const z = s.status?.mpos[2];
    return z === undefined ? null : Math.round(z * 10) / 10;
  });
  const zeroAtOrigin = useMachine((s) => s.status?.wco.every((v) => v === 0) ?? false);
  const settings = useWorkshop((s) => s.settings);
  const readiness = useReadiness();
  const jobKey = useRun((s) => s.jobKey);
  const partIndex = useRun((s) => s.partIndex);
  const runPhase = useRun((s) => s.phase);
  const confirmed = useRun((s) => s.confirmed);
  const tools = useJobTools();

  const prepared = useMemo(
    () => (fileName ? preparedFor(fileName, lines, kinematics) : null),
    [fileName, lines, kinematics],
  );
  const first = useMemo(() => {
    const seg = analysis?.segments.find((s) => s.length > 0);
    return seg
      ? {
          xy: Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y),
          machine: seg.machineCoordinates,
        }
      : null;
  }, [analysis]);

  if (!fileName || !analysis || !prepared) return null;
  const { parts, repairedLines, addedPreamble } = prepared;
  const key = `${fileName}:${lines.length}`;
  const sameJob = jobKey === key;
  const index = sameJob ? Math.min(partIndex, parts.length - 1) : 0;
  const phase = sameJob ? runPhase : 'idle';
  const part = parts[index]!;
  const spindleOn = analysis.events.some((e) => e.kind === 'spindle' && e.spindle !== 'off');
  const probeLock = spindleOn && tools.some((x) => x.known && x.tool?.probe === true);
  const blocking = readiness ? blockers(readiness.items) : [];
  const warnings = startWarnings({
    zeroAtOrigin: connected && zeroAtOrigin,
    machineZ: low,
    safeMachineZ: safeMachineZ(settings, zMax),
    homed,
    firstMove: first,
    spindleOn,
    probeTool: probeLock,
    // The part before this one was cut with another tool (the job is split at every change): not measured
    // since is the one thing the app cannot know – the card of the change offers it, nothing forces it
    toolChanged: index > 0 && parts[index - 1]!.tool !== part.tool,
  });
  let reason: string | null = null;
  if (!connected) reason = t('ready.offline');
  else if (viewer) reason = t('reason.viewer');
  else if (phase === 'uploading') reason = t('runPanel.uploading');
  else if (busy) reason = t('ready.busy');
  else if (blocking.length > 0) {
    const b = blocking[0]!;
    reason = tDynamic(`ready.${b.key}`, 'ready.offline', b.params);
  } else if (!idle) reason = t('ready.busy');
  return {
    key,
    parts,
    index,
    part,
    phase,
    label:
      parts.length > 1
        ? t('runPanel.startPart', { n: part.number, total: parts.length, tool: part.tool ?? '?' })
        : t('runPanel.start'),
    reason,
    blocked: blocking.length,
    warnings,
    pending: pendingWarnings(warnings, sameJob ? confirmed : []),
    probeLock,
    repairedLines: repairedLines.length,
    addedPreamble,
    manualSpindle: spindleOn && !spindleControlled,
  };
}

/**
 * The start itself, after the hold: with something left to confirm it asks
 * (nothing starts), else the part goes to the SD card and runs.
 */
export function requestStart(start: Start): void {
  if (start.reason !== null) return;
  if (start.pending.length > 0) {
    useRun.getState().ask(start.pending);
    return;
  }
  void useRun.getState().startPart(start.index);
}

/** The hold inside the confirmation: the warnings are confirmed, the part starts. */
export function confirmAndStart(start: Start): void {
  if (start.reason !== null) return;
  const run = useRun.getState();
  // What was confirmed belongs to this job, not to the one before it.
  if (run.jobKey !== start.key) run.reset();
  run.confirm(start.pending);
  run.ask(null);
  void run.startPart(start.index);
}
