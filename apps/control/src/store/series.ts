import { toGcode, toolpaths, type CutSettings, type Move } from '@lowrider/cam';
import { useMemo } from 'react';
import { create } from 'zustand';
import { t } from '../i18n';
import { findBlanks, type RejectReason } from '../lib/blanks';
import { imageToMachine, type Point } from '../lib/camera';
import { partsOf } from '../lib/camItems';
import type { Rect } from '../lib/photomap';
import {
  blankOnTable,
  cutOrder,
  entryCuts,
  fitsPicture,
  foldAngle,
  mapPixel,
  parseNames,
  planSeries,
  seriesFileName,
  turnStep,
  type MotifPart,
  type SeriesPlan,
  type SeriesText,
  type TableBlank,
} from '../lib/series';
import { grabFrame } from './calibration';
import { camToolDiameter, itemOperation, useCam } from './cam';
import { cameraElement, naturalSize } from './camera';
import { useFlip } from './flip';
import { showTable, useJob } from './job';
import { useMachine } from './machine';
import { cameraCalibrated, freshFrame, mapPicture, usePhotoMap } from './photomap';
import { settled, wait } from './settle';
import { jobUnderWay, onUnderwayEnded } from './underway';
import { useWorkshop } from './workshop';

/** Smallest side of a blank, mm: what is smaller is a chip or a speck */
export const MIN_BLANK = 10;
/** The camera counts as standing over a blank's middle within this, mm */
const OVER = 0.15;
/** A blank measured in the live picture lies at most this far from where the map had it, mm */
const SAME_BLANK = 5;

/** A place on the table that looks like a blank but is not taken for one, machine XY. */
export interface RefusedBlank {
  reason: RejectReason;
  x: number;
  y: number;
  outline: Point[];
}

/** What stands on every blank */
export type SeriesMode = SeriesText['mode'];

interface SeriesStore {
  /** The flow is open in the drawing workspace */
  open: boolean;
  /** The blanks found, in the order they are cut; their `id` is their place in it */
  blanks: TableBlank[];
  refused: RefusedBlank[];
  /**
   * How the last search ended: blanks found, none, a picture without two
   * clear tones, or no pictures on the table. Null before the first search.
   */
  searched: 'found' | 'none' | 'flat' | 'noMap' | null;
  /** Blanks left out by a tap (ids) */
  excluded: number[];
  /** Taps on "turn" per blank (id → count) */
  turns: Record<number, number>;
  mode: SeriesMode;
  /** The typed list of names, one line per blank */
  names: string;
  /** The first of the running numbers */
  firstNumber: number;
  /** The machine is busy for the series: scanning the table or measuring the blanks */
  busy: 'scan' | 'measure' | null;
  progress: { done: number; total: number } | null;
  /** Blanks the camera could not measure: larger than its picture (ids) */
  tooLarge: number[];
  /** Blanks the camera did not find where the map has them (ids) */
  unseen: number[];
  /** The series program that is loaded as the job, and the work zero it is written against */
  made: { fileName: string; zero: Point; count: number } | null;
  /** Opens the flow (from the drawing workspace) */
  begin(): void;
  /** Back to the drawing: its own job is on the table again */
  close(): void;
  /** Looks for blanks on the table picture as it is */
  find(): boolean;
  /** Forgets the blanks: back to finding them */
  again(): void;
  /** Scans a machine box anew (the old pictures go) and looks for blanks on it */
  scan(area: Rect): Promise<boolean>;
  /** Drives the camera over every blank that is cut and measures it in the live picture */
  measure(): Promise<boolean>;
  /** Ends a scan or a measuring round */
  cancel(): void;
  /** Leaves a blank out, or takes it in again */
  toggle(id: number): void;
  /** Turns the motif on a blank: by half a turn, a quarter turn on square and round ones */
  turn(id: number): void;
  setText(patch: { mode?: SeriesMode; names?: string; firstNumber?: number }): void;
  /** Makes the program for the blanks as they are chosen and loads it as the job */
  make(): boolean;
  /** The series is handed to the Job room: the flow closes, the program stays */
  handOver(): boolean;
}

/** The motif: what the drawing cuts, with how each part is cut. */
export function seriesMotif(): MotifPart[] {
  const { project, settings } = useCam.getState();
  if (!project) return [];
  return partsOf(project.items)
    .filter((item) => item.kind !== 'none')
    .map((item) => ({
      contours: item.contours,
      ...itemOperation(item, settings),
      ...(item.textStyle ? { text: { ...item.textStyle, placement: item.placement } } : {}),
    }));
}

const textOf = (s: Pick<SeriesStore, 'mode' | 'names' | 'firstNumber'>): SeriesText =>
  s.mode === 'names'
    ? { mode: 'names', names: parseNames(s.names) }
    : s.mode === 'numbers'
      ? { mode: 'numbers', start: s.firstNumber }
      : { mode: 'same' };

/** The series as it would be cut now; null without blanks. */
export function currentPlan(): SeriesPlan | null {
  const s = useSeries.getState();
  if (s.blanks.length === 0) return null;
  return planSeries(s.blanks, seriesMotif(), {
    excluded: new Set(s.excluded),
    turns: s.turns,
    text: textOf(s),
    toolDiameter: camToolDiameter(useCam.getState().settings),
  });
}

/** The plan of the series, kept up with the blanks, the choices and the drawing. */
export function useSeriesPlan(): SeriesPlan | null {
  const blanks = useSeries((s) => s.blanks);
  const excluded = useSeries((s) => s.excluded);
  const turns = useSeries((s) => s.turns);
  const mode = useSeries((s) => s.mode);
  const names = useSeries((s) => s.names);
  const firstNumber = useSeries((s) => s.firstNumber);
  const project = useCam((s) => s.project);
  const settings = useCam((s) => s.settings);
  const tools = useWorkshop((s) => s.tools);
  // Read from the stores as they are; the list says what makes the plan a new one.
  return useMemo(
    () => currentPlan(),
    [blanks, excluded, turns, mode, names, firstNumber, project, settings, tools],
  );
}

/** Whether the job on the table is the series program. */
export function useSeriesLoaded(): boolean {
  const made = useSeries((s) => s.made?.fileName);
  const fileName = useJob((s) => s.fileName);
  return made !== undefined && made === fileName;
}

let cancelled = false;

/** The blank in the live picture nearest to where one is expected (machine XY), or null. */
function seeBlank(spindle: Point, expected: Point): Omit<TableBlank, 'id' | 'measured'> | null {
  const frame = grabFrame();
  if (!frame) return null;
  const camera = useWorkshop.getState().settings.camera;
  const found = findBlanks(frame.gray, frame.width, frame.height, {
    minSide: MIN_BLANK * camera.pxPerMm,
  });
  const onTable = found.blanks.map((b) =>
    blankOnTable(b, (px) => imageToMachine(camera, px, frame, spindle)),
  );
  let best: (typeof onTable)[number] | null = null;
  for (const b of onTable) {
    const d = Math.hypot(b.x - expected.x, b.y - expected.y);
    if (d < SAME_BLANK && (!best || d < Math.hypot(best.x - expected.x, best.y - expected.y))) {
      best = b;
    }
  }
  return best;
}

/** The same blank as the map found: about as large, and turned about as much. */
function sameBlank(a: Pick<TableBlank, 'length' | 'width' | 'angle'>, b: typeof a): boolean {
  const alike = (p: number, q: number) => Math.abs(p - q) <= 0.1 * Math.max(p, q) + 1;
  if (!alike(a.length, b.length) || !alike(a.width, b.width)) return false;
  if (a.angle === null || b.angle === null) return true;
  // Squares may be reported by either of their sides.
  return Math.abs(foldAngle(a.angle - b.angle, 90)) < 5;
}

export const useSeries = create<SeriesStore>((set, get) => ({
  open: false,
  blanks: [],
  refused: [],
  searched: null,
  excluded: [],
  turns: {},
  mode: 'same',
  names: '',
  firstNumber: 1,
  busy: null,
  progress: null,
  tooLarge: [],
  unseen: [],
  made: null,

  begin() {
    set({ open: true });
    showTable();
    if (get().blanks.length > 0) get().make();
  },

  close() {
    // Over the series' own program only: another program opened since stays where it is.
    const had = get().made?.fileName === useJob.getState().fileName;
    set({ open: false, made: null });
    // The drawing's own job is on the table again – in place of the series' program, if that lay there.
    useCam.getState().remake({ take: had });
  },

  find() {
    const picture = mapPicture();
    const { addLog } = useMachine.getState();
    if (!picture) {
      set({ blanks: [], refused: [], searched: 'noMap', excluded: [], turns: {} });
      get().make();
      return false;
    }
    const found = findBlanks(picture.gray, picture.width, picture.height, {
      valid: picture.valid,
      minSide: MIN_BLANK * picture.pxPerMm,
    });
    const toTable = mapPixel(picture.left, picture.top, picture.pxPerMm);
    const blanks = cutOrder(found.blanks.map((b) => blankOnTable(b, toTable))).map(
      (b, id): TableBlank => ({ ...b, id, measured: false }),
    );
    set({
      blanks,
      refused: found.rejected.map((r) => ({
        reason: r.reason,
        ...toTable(r),
        outline: r.outline.map(toTable),
      })),
      searched: found.flat ? 'flat' : blanks.length > 0 ? 'found' : 'none',
      excluded: [],
      turns: {},
      tooLarge: [],
      unseen: [],
    });
    addLog('info', t('series.log.found', { count: blanks.length, refused: found.rejected.length }));
    get().make();
    return blanks.length > 0;
  },

  again() {
    set({
      blanks: [],
      refused: [],
      searched: null,
      excluded: [],
      turns: {},
      tooLarge: [],
      unseen: [],
    });
    get().make();
  },

  async scan(area) {
    if (get().busy) return false;
    cancelled = false;
    set({ busy: 'scan' });
    try {
      // A fresh picture of the table: what lay there before is gone.
      usePhotoMap.getState().clear();
      if (!(await usePhotoMap.getState().scanArea(area))) return false;
    } finally {
      set({ busy: null });
    }
    return get().find();
  },

  async measure() {
    const plan = currentPlan();
    const el = cameraElement();
    const size = naturalSize();
    const { settings } = useWorkshop.getState();
    const camera = settings.camera;
    const machine = useMachine.getState();
    if (get().busy || !plan || !el || !size || !machine.status) return false;
    if (!cameraCalibrated(camera)) return false;
    const { jogFeed } = useJob.getState().profile;
    const feed = Math.min(3000, jogFeed.xy);
    const picture = { width: size.width / camera.pxPerMm, height: size.height / camera.pxPerMm };
    const targets = plan.entries.filter((e) => e.state === 'cut').map((e) => e.blank);
    cancelled = false;
    set({
      busy: 'measure',
      progress: { done: 0, total: targets.length },
      tooLarge: [],
      unseen: [],
    });
    let ok = true;
    let measured = 0;
    try {
      // Camera height first: only there does its scale fit.
      const z = camera.focusHeight! + (machine.status.wco[2] ?? 0);
      if (Math.abs((machine.status.mpos[2] ?? 0) - z) > 0.05) {
        ok = (await machine.moveMachine({ z }, jogFeed.z)) && (await settled({ z })) !== null;
      }
      for (const [i, blank] of targets.entries()) {
        if (!ok || cancelled) break;
        if (!fitsPicture(blank, picture, camera.rotation)) {
          set((s) => ({ tooLarge: [...s.tooLarge, blank.id] }));
        } else {
          // Over where the map has it, then once more over where the camera sees it: in
          // the middle of the picture the lens and the scale matter least.
          let at: Point = { x: blank.x, y: blank.y };
          let seen: ReturnType<typeof seeBlank> = null;
          for (let round = 0; round < 2 && ok; round++) {
            const spindle = { x: at.x - camera.offsetX, y: at.y - camera.offsetY };
            const there =
              (await machine.moveMachine(spindle, feed)) && (await settled(spindle)) !== null;
            if (!there) {
              ok = false;
              break;
            }
            await wait(settings.calibration.settleMs);
            await freshFrame(el);
            const now = seeBlank(spindle, at);
            if (!now) break;
            seen = now;
            if (Math.hypot(now.x - at.x, now.y - at.y) < OVER) break;
            at = { x: now.x, y: now.y };
          }
          if (!ok) break;
          const found = seen;
          if (found && sameBlank(found, blank)) {
            measured++;
            set((s) => ({
              blanks: s.blanks.map((b) =>
                b.id === blank.id ? { ...found, id: b.id, measured: true } : b,
              ),
            }));
          } else {
            set((s) => ({ unseen: [...s.unseen, blank.id] }));
          }
        }
        set({ progress: { done: i + 1, total: targets.length } });
      }
    } finally {
      set({ busy: null, progress: null });
      const { addLog } = useMachine.getState();
      if (cancelled) addLog('info', t('series.log.measureCancelled'));
      else if (!ok) addLog('error', t('series.log.measureFailed'), 'series.log.measureFailed');
      else addLog('info', t('series.log.measured', { count: measured, total: targets.length }));
    }
    get().make();
    return ok && !cancelled;
  },

  cancel() {
    cancelled = true;
    if (get().busy === 'scan') usePhotoMap.getState().cancelScan();
  },

  toggle(id) {
    set((s) => ({
      excluded: s.excluded.includes(id) ? s.excluded.filter((x) => x !== id) : [...s.excluded, id],
    }));
    get().make();
  },

  turn(id) {
    const blank = get().blanks.find((b) => b.id === id);
    if (!blank) return;
    const steps = 360 / turnStep(blank);
    set((s) => ({ turns: { ...s.turns, [id]: ((s.turns[id] ?? 0) + 1) % steps } }));
    get().make();
  },

  setText(patch) {
    set(patch);
    get().make();
  },

  make() {
    const plan = currentPlan();
    const { project, settings } = useCam.getState();
    const wco = useMachine.getState().status?.wco;
    const todo = plan?.entries.filter((e) => e.state === 'cut') ?? [];
    // Never another program under a job that is under way.
    if (jobUnderWay()) return false;
    if (!project || !wco) return false;
    if (todo.length === 0) {
      // Nothing to engrave (any more): the drawing's own job is on the table again.
      if (get().made) {
        const there = get().made?.fileName === useJob.getState().fileName;
        set({ made: null });
        useCam.getState().remake({ take: there });
      }
      return false;
    }
    // The blanks lie on the table (machine XY); the program counts from the work zero as it is now.
    const zero = { x: wco[0] ?? 0, y: wco[1] ?? 0 };
    const tool = camToolDiameter(settings);
    const cut: CutSettings = { ...settings, toolDiameter: tool };
    const moves: Move[] = [];
    let at: Point = { x: 0, y: 0 };
    for (const entry of todo) {
      const { contours, operations } = entryCuts(entry, zero);
      // Each blank is finished before the next; the tool goes on from where it left the last.
      for (const m of toolpaths(contours, operations, cut, at).moves) {
        moves.push(m);
        at = { x: m.x ?? at.x, y: m.y ?? at.y };
      }
    }
    if (moves.length === 0) return false;
    const fileName = seriesFileName(project.name, todo.length);
    const code = toGcode(moves, {
      name: t('series.programName', { name: project.name, count: todo.length }),
      rpm: settings.rpm,
      safeZ: settings.safeZ,
    });
    const job = useJob.getState();
    // The same program again (a tap taken back): the job on the table stays as it is.
    if (job.fileName !== fileName || job.lines.join('\n') !== code) job.load(fileName, code);
    useFlip.getState().setPlan(null);
    useJob.getState().setToolDiameter(tool);
    set({ made: { fileName, zero, count: todo.length } });
    return true;
  },

  handOver() {
    if (!get().make()) return false;
    set({ open: false });
    return true;
  },
}));

// A move of the app's own, or a run it only learned of, has ended: what the blanks, the choices or
// the zero asked for while the machine moved is made now. (Not for a job that ended – its program
// stays until the operator has seen it.)
onUnderwayEnded((ended) => {
  if (ended === 'motion' && useSeries.getState().open) useSeries.getState().make();
});

/** The series program no longer fits the work zero it was written against. */
export function seriesOffZero(): boolean {
  const { made } = useSeries.getState();
  const wco = useMachine.getState().status?.wco;
  if (!made || !wco || useJob.getState().fileName !== made.fileName) return false;
  return Math.hypot((wco[0] ?? 0) - made.zero.x, (wco[1] ?? 0) - made.zero.y) > 0.005;
}

/**
 * The blanks lie on the table, not at the work zero: when the X/Y zero is
 * set anew while the series program is the job, the program is written
 * anew for the same blanks, so it still lands on them.
 */
export function startSeries(): () => void {
  return useMachine.subscribe((s, prev) => {
    if (s.status?.wco === prev.status?.wco || !seriesOffZero()) return;
    if (s.fileJob !== null || s.stream?.result === 'running') return;
    if (useSeries.getState().make()) s.addLog('info', t('series.log.zeroMoved'));
  });
}
