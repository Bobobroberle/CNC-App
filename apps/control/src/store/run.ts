import { create } from 'zustand';
import { t } from '../i18n';
import type { StartWarning } from '../lib/startChecks';
import { safeLift } from '../lib/motion';
import { preparedFor, type PreparedPart } from '../lib/prepare';
import { useJob } from './job';
import { useMachine } from './machine';
import { useRecent } from './recent';
import { useTrack } from './track';
import { safeMachineZ, useWorkshop } from './workshop';

export type RunPhase = 'idle' | 'uploading' | 'running' | 'between' | 'done';

interface RunStore {
  /** The job the parts belong to; a new job starts over */
  jobKey: string | null;
  /** Index of the part to start next (or running) */
  partIndex: number;
  phase: RunPhase;
  /** When the first part of the job was started, ms */
  startedAt: number | null;
  /** What the finished job was: shown as the summary at its end (DESIGN.md §5) */
  summary: RunSummary | null;
  /** How many pieces of this job were cut one after the other in this session */
  pieces: number;
  /** Start warnings (§6.4) the operator confirmed for this job */
  confirmed: StartWarning[];
  confirm(warnings: readonly StartWarning[]): void;
  /** The start asks for these warnings to be confirmed; null: nothing is asked */
  asking: StartWarning[] | null;
  ask(warnings: StartWarning[] | null): void;
  /** "Nächstes Teil gleicher Job": the same job once more, from its first part. Starts nothing. */
  nextPiece(): void;
  /** Content of what this session put on the card, by file name */
  uploaded: Record<string, string>;
  /**
   * Runs one part from FluidNC's SD card, the way the WebUI does it: upload
   * (unless this exact part is already there), check it arrived, start it.
   * The machine then cuts on its own; Wi-Fi or the iPad may drop out.
   */
  startPart(index: number): Promise<void>;
  reset(): void;
}

export interface RunSummary {
  name: string;
  /** From the first start to the end of the last part, tool changes included, s */
  seconds: number;
  parts: number;
  /** The farthest the tool was off the path while it was tracked, mm; null if not tracked */
  maxDeviation: number | null;
}

/** The loaded job prepared for the SD card: tool-table offsets removed, one part per tool. */
export function currentParts(): PreparedPart[] {
  const { fileName, lines, profile } = useJob.getState();
  return fileName ? preparedFor(fileName, lines, profile.kinematics).parts : [];
}

const jobKey = () => {
  const { fileName, lines } = useJob.getState();
  return fileName ? `${fileName}:${lines.length}` : null;
};

export const useRun = create<RunStore>((set, get) => ({
  jobKey: null,
  partIndex: 0,
  phase: 'idle',
  uploaded: {},
  startedAt: null,
  summary: null,
  pieces: 0,
  confirmed: [],
  asking: null,
  confirm: (warnings) => set((s) => ({ confirmed: [...new Set([...s.confirmed, ...warnings])] })),
  ask: (asking) => set({ asking }),
  reset: () =>
    set({
      partIndex: 0,
      phase: 'idle',
      jobKey: jobKey(),
      startedAt: null,
      summary: null,
      pieces: 0,
      confirmed: [],
      asking: null,
    }),
  nextPiece: () => set({ partIndex: 0, phase: 'idle', startedAt: null, summary: null }),

  async startPart(index) {
    const parts = currentParts();
    const part = parts[index];
    const machine = useMachine.getState();
    if (!part || machine.fileJob !== null) return;
    set((s) => ({
      jobKey: jobKey(),
      partIndex: index,
      phase: 'uploading',
      summary: null,
      asking: null,
      startedAt: index === 0 || s.startedAt === null ? Date.now() : s.startedAt,
    }));
    useJob.getState().setPreparedParts(parts);
    // The zero this job is cut with, for its card under "Zuletzt verwendet" and the history in ③.
    if (index === 0) useRecent.getState().rememberZero();

    const onCard = machine.sdFiles?.find((f) => f.name === part.fileName);
    const size = new TextEncoder().encode(part.text).length;
    const fresh = get().uploaded[part.fileName] === part.text && onCard?.size === size;
    if (!fresh) {
      const ok = await machine.uploadToSd(part.fileName, part.text);
      if (!ok) {
        set({ phase: 'idle' });
        return;
      }
      set((s) => ({ uploaded: { ...s.uploaded, [part.fileName]: part.text } }));
    }

    set({ phase: 'running' });
    await useMachine.getState().runSdFile(part.fileName);
    const { lastFileResult, homed, command, addLog } = useMachine.getState();
    if (lastFileResult !== 'done') {
      set({ phase: 'idle' });
      return;
    }
    if (index + 1 >= parts.length) {
      const { maxDeviation } = useTrack.getState();
      set((s) => ({
        phase: 'done',
        partIndex: 0,
        pieces: s.pieces + 1,
        summary: {
          name: useJob.getState().fileName ?? part.fileName,
          seconds: (Date.now() - (s.startedAt ?? Date.now())) / 1000,
          parts: parts.length,
          maxDeviation: maxDeviation > 0 ? maxDeviation : null,
        },
      }));
      return;
    }
    // A part ends right before the tool change: spindle off, tool up,
    // to the change position if there is one, then wait for the operator.
    set({ phase: 'between', partIndex: index + 1 });
    addLog('info', t('runPanel.partDone', { n: part.number, next: parts[index + 1]!.tool ?? '?' }));
    const { settings } = useWorkshop.getState();
    const zMax = useJob.getState().profile.travel.z.max;
    const cmds = ['M5', ...safeLift(homed, safeMachineZ(settings, zMax))];
    if (settings.toolChangePosition && homed) {
      const { x, y } = settings.toolChangePosition;
      cmds.push(`G53 G0 X${x} Y${y}`);
    }
    for (const c of cmds) await command(c);
  },
}));

// A program loaded anew – the same one again, a jig measured again, a flow's next program –
// is something to start, not the summary of the job before it.
useJob.subscribe((job, before) => {
  if (job.lines !== before.lines && useRun.getState().phase === 'done') {
    useRun.getState().nextPiece();
  }
});
