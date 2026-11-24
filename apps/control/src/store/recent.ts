import type { Bounds } from '@lowrider/gcode-core';
import { isEmptyBounds } from '@lowrider/gcode-core';
import { create } from 'zustand';
import { t } from '../i18n';
import { readJobFile } from '../lib/files';
import { browserStorage, loadJson } from '../lib/persist';
import { previewPath } from '../lib/preview';
import { useJob } from './job';
import { useMachine } from './machine';
import { jobUnderWay } from './underway';
import { useUi } from './ui';

/** A zero a job was cut with: the machine position of its work zero. */
export interface UsedZero {
  /** G54 … G59 */
  wcs: string;
  x: number;
  y: number;
  z: number;
  at: number;
}

/** A job that was opened here before (DESIGN.md §5 ①: "Zuletzt verwendet"). */
export interface RecentJob {
  name: string;
  /** The program itself; left out when it is too large to keep */
  text?: string;
  /** Size of what it cuts, mm; null for a program without cutting moves */
  size: { x: number; y: number; z: number } | null;
  /** Estimated running time, s */
  seconds: number;
  /** Its cutting moves from above (`lib/preview.ts`) */
  preview: string;
  usedAt: number;
  /** The zeros it was cut with, newest first (the last `ZERO_HISTORY`) */
  zeros: UsedZero[];
}

export const RECENT_JOBS = 6;
export const ZERO_HISTORY = 5;
/** Programs larger than this are remembered without their text (the page's storage is small) */
export const MAX_KEPT_TEXT = 400_000;
const KEY = 'lowrider-control.recent-jobs';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validZero(value: unknown): UsedZero | null {
  if (typeof value !== 'object' || value === null) return null;
  const z = value as Partial<UsedZero>;
  return typeof z.wcs === 'string' && num(z.x) && num(z.y) && num(z.z) && num(z.at)
    ? { wcs: z.wcs, x: z.x, y: z.y, z: z.z, at: z.at }
    : null;
}

export function validRecent(value: unknown): RecentJob[] | null {
  if (!Array.isArray(value)) return null;
  const out: RecentJob[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const j = entry as Partial<RecentJob>;
    if (typeof j.name !== 'string' || j.name === '' || !num(j.seconds) || !num(j.usedAt)) continue;
    const size =
      j.size && num(j.size.x) && num(j.size.y) && num(j.size.z)
        ? { x: j.size.x, y: j.size.y, z: j.size.z }
        : null;
    out.push({
      name: j.name,
      ...(typeof j.text === 'string' ? { text: j.text } : {}),
      size,
      seconds: j.seconds,
      preview: typeof j.preview === 'string' ? j.preview : '',
      usedAt: j.usedAt,
      zeros: (Array.isArray(j.zeros) ? j.zeros : [])
        .map(validZero)
        .filter((z): z is UsedZero => z !== null)
        .slice(0, ZERO_HISTORY),
    });
  }
  return out.slice(0, RECENT_JOBS);
}

export const sizeOf = (b: Bounds): RecentJob['size'] =>
  isEmptyBounds(b)
    ? null
    : { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: Math.max(0, -b.min.z) };

/** The history with one more zero at its head; the same zero again only moves up. */
export function withZero(zeros: readonly UsedZero[], zero: UsedZero): UsedZero[] {
  const same = (a: UsedZero) =>
    a.wcs === zero.wcs &&
    Math.abs(a.x - zero.x) < 0.01 &&
    Math.abs(a.y - zero.y) < 0.01 &&
    Math.abs(a.z - zero.z) < 0.01;
  return [zero, ...zeros.filter((z) => !same(z))].slice(0, ZERO_HISTORY);
}

interface RecentStore {
  jobs: RecentJob[];
  /** Counts up when something asks for the file dialog (the action bar's "G-Code öffnen") */
  openRequest: number;
  /** Puts the loaded job at the head of the list (as it is in the job store right now) */
  rememberLoaded(): void;
  /** Notes the zero the loaded job is started with */
  rememberZero(): void;
  remove(name: string): void;
}

/** Writes the list; when the storage is full, the programs of the older jobs go first. */
const save = (jobs: RecentJob[]) => {
  for (let keep = jobs.length; keep >= 0; keep--) {
    const list = jobs.map((j, i) => (i < keep ? j : { ...j, text: undefined }));
    try {
      browserStorage?.setItem(KEY, JSON.stringify(list));
      return;
    } catch {
      // full: once more with one program less
    }
  }
};

export const useRecent = create<RecentStore>((set, get) => ({
  jobs: loadJson(browserStorage, KEY, validRecent, []),
  openRequest: 0,
  rememberLoaded() {
    const { fileName, lines, analysis } = useJob.getState();
    if (!fileName || !analysis) return;
    const text = lines.join('\n');
    const before = get().jobs.find((j) => j.name === fileName);
    const job: RecentJob = {
      name: fileName,
      ...(text.length <= MAX_KEPT_TEXT ? { text } : {}),
      size: sizeOf(analysis.cutBounds),
      seconds: analysis.timeline?.total ?? 0,
      preview: previewPath(analysis.segments),
      usedAt: Date.now(),
      zeros: before?.zeros ?? [],
    };
    const jobs = [job, ...get().jobs.filter((j) => j.name !== fileName)].slice(0, RECENT_JOBS);
    set({ jobs });
    save(jobs);
  },
  rememberZero() {
    const { original, fileName } = useJob.getState();
    const name = original?.fileName ?? fileName;
    const { status, parserState } = useMachine.getState();
    if (!name || !status) return;
    const [x = 0, y = 0, z = 0] = status.wco;
    const zero: UsedZero = { wcs: parserState?.wcs ?? 'G54', x, y, z, at: Date.now() };
    const jobs = get().jobs.map((j) =>
      j.name === name ? { ...j, zeros: withZero(j.zeros, zero) } : j,
    );
    set({ jobs });
    save(jobs);
  },
  remove(name) {
    const jobs = get().jobs.filter((j) => j.name !== name);
    set({ jobs });
    save(jobs);
  },
}));

/** Asks the file dialog of step ① to open (it lives with the hidden file input there). */
export function requestOpenFile(): void {
  useRecent.setState((s) => ({ openRequest: s.openRequest + 1 }));
}

/**
 * Opens G-code files: the first one is loaded and shown in step ①, every one
 * of them is remembered under "Zuletzt verwendet" (several files at once:
 * drag & drop, or chosen together).
 */
export async function openJobFiles(files: readonly File[]): Promise<void> {
  const { addLog } = useMachine.getState();
  // A job is under way: the program stays, the files can be opened after it (one message, no
  // stepping to the Job as if something had been opened).
  if (jobUnderWay()) {
    addLog('error', t('job.locked'), 'job.locked');
    return;
  }
  const read: { name: string; text: string }[] = [];
  for (const file of files) {
    try {
      read.push({ name: file.name, text: await readJobFile(file) });
    } catch (error) {
      addLog('error', t('job.loadError', { reason: (error as Error).message }), 'job.loadError');
    }
  }
  if (read.length === 0) return;
  const { load } = useJob.getState();
  // The later ones first, so the first file ends up loaded and at the head of the list.
  for (const job of [...read].reverse()) {
    // A job began while the files were read: this one and the rest are turned away (and said so)
    if (!load(job.name, job.text)) return;
    useRecent.getState().rememberLoaded();
  }
  useUi.getState().go('job');
  if (read.length > 1) {
    addLog('info', t('recent.several', { count: read.length, name: read[0]!.name }));
  }
}

/** Loads a remembered job again; false if its program was too large to keep. */
export function openRecent(name: string): boolean {
  const job = useRecent.getState().jobs.find((j) => j.name === name);
  if (!job?.text) return false;
  if (jobUnderWay()) {
    useMachine.getState().addLog('error', t('job.locked'), 'job.locked');
    return false;
  }
  useJob.getState().load(job.name, job.text);
  useRecent.getState().rememberLoaded();
  useUi.getState().leaveCam();
  return true;
}
