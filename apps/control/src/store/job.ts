import { compose, IDENTITY, type Matrix } from '@lowrider/cam';
import {
  analyzeProgram,
  camInfo,
  splitLines,
  type CamInfo,
  type ProgramAnalysis,
} from '@lowrider/gcode-core';
import { create } from 'zustand';
import { browserStorage } from '../lib/persist';
import type { PreparedPart } from '../lib/prepare';
import {
  loadProfile,
  saveProfile,
  type MachineProfile,
  type ProfileSettings,
} from '../lib/profile';

const storage = browserStorage;

/** What the stage shows: the table from above, the live camera picture or the 3D check */
export type ViewMode = 'table' | 'camera' | '3d';

/**
 * How the table view looks at the job. `top` is the table itself (photo map,
 * taps); `side` (X/Z) and `unwrapped` (rotary) only show the toolpath.
 */
export type TableProjection = 'top' | 'side' | 'unwrapped';

export const SIM_SPEEDS = [1, 10, 50, 200] as const;

/** Top of the material: Z0 for flat stock, the cylinder surface for rotary jobs (Z0 on the axis). */
export function surfaceZ(analysis: ProgramAnalysis | null, rotaryDiameter: number): number {
  return analysis?.usesRotary ? rotaryDiameter / 2 : 0;
}

interface JobStore {
  profile: MachineProfile;
  fileName: string | null;
  lines: string[];
  analysis: ProgramAnalysis | null;
  /** What the CAM program wrote about itself (generator, tool names) */
  header: CamInfo | null;
  /** Tool diameter for the tool circle, mm */
  toolDiameter: number;
  /** Diameter used to unwrap rotary jobs, mm */
  rotaryDiameter: number;
  view: ViewMode;
  projection: TableProjection;
  /** Rapid moves are drawn on the table view */
  showRapids: boolean;
  /** Simulation time, seconds */
  simTime: number;
  playing: boolean;
  speed: number;
  /** Increments to ask the stage to fit the job into view */
  fitRequest: number;
  /** Puts a program on the table; false when a job under way keeps the one that is there (see `setProgramLock`) */
  load(fileName: string, text: string): boolean;
  /** Takes the job off the stage: nothing is loaded, as at the start (false: a job under way keeps it) */
  unload(): boolean;
  setToolDiameter(mm: number): void;
  setRotaryDiameter(mm: number): void;
  setView(view: ViewMode): void;
  /** Looks at the job from above, the side or unwrapped – on the table view */
  setProjection(projection: TableProjection): void;
  setShowRapids(show: boolean): void;
  setSimTime(seconds: number): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;
  requestFit(): void;
  /** Parts prepared for the SD card, by file name, to check and track them when started */
  preparedParts: PreparedPart[];
  setPreparedParts(parts: PreparedPart[]): void;
  /** The job as loaded, while a transformed copy (aligned, levelled) is active */
  original: { fileName: string; text: string } | null;
  /**
   * How the active program lies against the job as loaded: turned and
   * shifted on the table by this (work XY). Two-sided jobs need it to know
   * where the front really was cut.
   */
  pose: Matrix;
  /**
   * Loads a transformed version of the current job, keeping the original to
   * go back. `turn` says how it was turned or shifted, counted from the job
   * as loaded or from the program that was active; without it the program
   * lies where the active one did (levelled, repaired).
   */
  loadDerived(
    fileName: string,
    text: string,
    turn?: { by: Matrix; from: 'original' | 'current' },
  ): boolean;
  restoreOriginal(): boolean;
  /** Edge angle measured with the camera, degrees; offered for the alignment */
  measuredAngle: number | null;
  setMeasuredAngle(angle: number | null): void;
  /** Stock model from an STL file (work coordinates); not stored */
  stockModel: { name: string; triangles: Float32Array } | null;
  setStockModel(model: { name: string; triangles: Float32Array } | null): void;
  /** Stores the operator's machine values; re-analyses the loaded job. */
  setProfileSettings(settings: ProfileSettings): void;
}

let programLock: (() => boolean) | null = null;

/**
 * The lock on the program on the table: `lock` says whether a job is under way and – when it is –
 * tells the operator why nothing was done. Set by `store/underway.ts` (which reads the machine and
 * the run, and so cannot be imported here). While locked, no program is loaded, replaced or taken
 * off: every way to one – dropping a file, the recent list, the example, the flows' derived
 * programs – goes through `load`, `loadDerived` and `unload`.
 */
export function setProgramLock(lock: (() => boolean) | null): void {
  programLock = lock;
}
const locked = () => programLock?.() === true;

export const useJob = create<JobStore>((set, get) => ({
  profile: loadProfile(storage),
  fileName: null,
  lines: [],
  analysis: null,
  header: null,
  toolDiameter: 6,
  rotaryDiameter: 60,
  view: 'table',
  projection: 'top',
  showRapids: true,
  simTime: 0,
  playing: false,
  speed: 10,
  fitRequest: 0,
  preparedParts: [],
  stockModel: null,
  setStockModel: (stockModel) => set({ stockModel }),
  original: null,
  pose: IDENTITY,
  measuredAngle: null,
  setMeasuredAngle: (measuredAngle) => set({ measuredAngle }),
  loadDerived(fileName, text, turn) {
    if (locked()) return false;
    const { original, fileName: current, lines, pose: before } = get();
    const keep =
      original ?? (current !== null ? { fileName: current, text: lines.join('\n') } : null);
    const pose = !turn ? before : turn.from === 'original' ? turn.by : compose(turn.by, before);
    get().load(fileName, text);
    set({ original: keep, pose });
    return true;
  },
  restoreOriginal() {
    const { original } = get();
    if (!original) return false;
    return get().load(original.fileName, original.text);
  },

  unload() {
    if (locked()) return false;
    set((s) => ({
      fileName: null,
      lines: [],
      analysis: null,
      header: null,
      original: null,
      pose: IDENTITY,
      simTime: 0,
      playing: false,
      projection: s.projection === 'unwrapped' ? 'top' : s.projection,
    }));
    return true;
  },

  setPreparedParts(parts) {
    // Keep parts of earlier jobs that are still on the card.
    set((s) => ({
      preparedParts: [
        ...s.preparedParts.filter((p) => !parts.some((n) => n.fileName === p.fileName)),
        ...parts,
      ],
    }));
  },

  load(fileName, text) {
    if (locked()) return false;
    const { profile } = get();
    const analysis = analyzeProgram(text, {
      kinematics: profile.kinematics,
      rotaryAxis: profile.hasRotary,
    });
    const header = camInfo(text);
    // Without T words, the tool named in the CAM header sets the tool circle.
    const named = analysis.tools.every((n) => n === 0)
      ? header.tools.find((t) => t.diameter)
      : undefined;
    set((s) => ({
      fileName,
      lines: splitLines(text),
      analysis,
      header,
      ...(named?.diameter ? { toolDiameter: named.diameter } : {}),
      original: null,
      pose: IDENTITY,
      simTime: 0,
      playing: false,
      projection: analysis.usesRotary
        ? 'unwrapped'
        : s.projection === 'unwrapped'
          ? 'top'
          : s.projection,
      fitRequest: s.fitRequest + 1,
    }));
    return true;
  },
  setToolDiameter: (mm) => set({ toolDiameter: Math.min(100, Math.max(0.1, mm)) }),
  setRotaryDiameter: (mm) => set({ rotaryDiameter: Math.min(1000, Math.max(1, mm)) }),
  setView: (view) => set((s) => ({ view, fitRequest: s.fitRequest + 1 })),
  setProjection: (projection) =>
    set((s) => ({ view: 'table', projection, fitRequest: s.fitRequest + 1 })),
  setShowRapids: (showRapids) => set({ showRapids }),
  setSimTime: (seconds) => {
    const total = get().analysis?.timeline?.total ?? 0;
    set({ simTime: Math.min(total, Math.max(0, seconds)) });
  },
  setPlaying: (playing) => {
    const { analysis, simTime } = get();
    const total = analysis?.timeline?.total ?? 0;
    // Restart from the beginning when playing at the end.
    set({ playing: playing && total > 0, simTime: playing && simTime >= total ? 0 : simTime });
  },
  setSpeed: (speed) => set({ speed }),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
  setProfileSettings(settings) {
    saveProfile(storage, settings);
    set((s) => ({ profile: { ...s.profile, ...settings, placeholder: false } }));
    // New speeds and accelerations change the time estimate.
    const { fileName, lines } = get();
    if (fileName !== null) {
      // Not another program, only another estimate for the same one: it does not go through the
      // lock (a machine value changed while a job runs must neither fail nor leave a stale time).
      const { profile } = get();
      const analysis = analyzeProgram(lines.join('\n'), {
        kinematics: profile.kinematics,
        rotaryAxis: profile.hasRotary,
      });
      set((s) => ({
        analysis,
        projection: analysis.usesRotary
          ? 'unwrapped'
          : s.projection === 'unwrapped'
            ? 'top'
            : s.projection,
      }));
    }
  },
}));

/** Brings the table from above onto the stage – and leaves the view alone if it is there already. */
export function showTable(): void {
  const { view, projection, setProjection } = useJob.getState();
  if (view !== 'table' || projection !== 'top') setProjection('top');
}
