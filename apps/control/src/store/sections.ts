import { rotation as turnAbout } from '@lowrider/cam';
import { removeToolLengthTable, type SectionProblem } from '@lowrider/gcode-core';
import {
  fromJig,
  locatePart,
  marksOnPart,
  type JobRecord,
  type PartMark,
  type PartPose,
  type TagReading,
} from '@lowrider/workshop';
import { create } from 'zustand';
import { t } from '../i18n';
import type { Point } from '../lib/camera';
import { formatNumber } from '../lib/format';
import { turnedProgram, type JigTrouble } from '../lib/jigs';
import { browserStorage, isFullDemo, loadJson, saveJson } from '../lib/persist';
import type { Rect } from '../lib/photomap';
import { preparedFor } from '../lib/prepare';
import {
  expectedMark,
  farthestPair,
  makeSections,
  markBand,
  MARK_PAD,
  sectionAxis,
  sectionOf,
  sweepStops,
  type Located,
  type SectionsJob,
  type SectionsPhase,
  type SectionsTrouble,
} from '../lib/sections';
import { travelViolations } from '../lib/workspace';
import { isSimulatorAddress, simulator, SURFACE_Z } from '../sim';
import { cameraElement, naturalSize } from './camera';
import { scanDemoMap } from './demoMap';
import { useFlip } from './flip';
import {
  beginMeasuring,
  canMeasure,
  liveTags,
  measureTag,
  measuringCancelled,
  toCameraHeight,
  useJigs,
} from './jigs';
import { useJob } from './job';
import { useMachine } from './machine';
import { freshFrame } from './photomap';
import { onJobEnd } from './recorder';
import { settled, wait } from './settle';
import { useUi } from './ui';
import { useWorkshop } from './workshop';
import { jobUnderWay, programRefused } from './underway';

const KEY = 'lowrider-control.sections';

/**
 * A part longer than the table, against the live machine: the job cut in
 * sections, which of them are cut, the register marks measured before the
 * part is slid along and found again after it. Finding the part sets the
 * X/Y work zero where the part's zero lies now and loads the next section
 * turned as the part is.
 */

/** A mark may lie this far from where it is expected after the slide, mm */
const FIND_NEAR = 150;
/** … and the second this far from where the first says it must be */
const SECOND_NEAR = 60;

/** What the last finding of the part showed. */
export interface SlideResult {
  /** How far the part was really slid, mm */
  moved: number;
  /** How far it was turned by that, degrees */
  rotation: number;
  /** Distance of the two marks now minus before, mm */
  distanceError: number;
}

interface SectionsStore {
  job: SectionsJob | null;
  /** The section at hand: to be cut, or cut and to be followed by the next */
  index: number;
  phase: SectionsPhase;
  /** How the part lay when the section at hand was cut */
  cut: PartPose | null;
  /** How the section at hand is turned on the table, degrees (0 for the first) */
  angle: number;
  /** The zero and program of the section at hand as they were when the part was found */
  located: Located | null;
  /** The register marks as measured before the slide, in the part's coordinates */
  marks: PartMark[];
  /** The part lies against a straight fence: it cannot turn */
  fence: boolean;
  result: SlideResult | null;
  /** The camera is measuring: the marks before the slide, or finding them after it */
  busy: 'marks' | 'find' | null;
  trouble: SectionsTrouble | null;
  /** Why the job on the table cannot be cut in sections (asked for, and refused) */
  refused: SectionProblem | null;
  /** Slides the simulator's operator has made for this job */
  simulated: number;
  /** Cuts the loaded job in sections as the part lies and loads the first */
  begin(): boolean;
  /** Loads the program of the section at hand */
  loadSection(): void;
  /** The section at hand has been cut with the zero as it is */
  cutDone(): boolean;
  setFence(on: boolean): void;
  /** Looks for the marks on the part and measures them at the crosshair */
  measureMarks(): Promise<boolean>;
  /** The part has been slid along and clamped again */
  slid(): void;
  /**
   * Finds the marks where they must lie now (`here`: in the live picture as
   * it is), sets the X/Y zero from them and loads the next section
   */
  find(here?: boolean): Promise<boolean>;
  /** One step back: measure the marks anew, slide again, find the part anew */
  back(): void;
  /** Forgets why a job was refused */
  dismiss(): void;
  /**
   * Ends the flow. While a section of it is the job and not all are cut,
   * the whole job comes back on the table
   */
  cancel(): void;
}

type Stored = Pick<
  SectionsStore,
  'job' | 'index' | 'phase' | 'cut' | 'angle' | 'located' | 'marks' | 'fence'
>;

/** What survives a reload: the sections, which are cut, and how the part was last found. */
function stored(): Stored | null {
  return loadJson<Stored | null>(
    browserStorage,
    KEY,
    (v) => {
      const s = v as Partial<Stored> | null;
      const parts = s?.job?.parts;
      if (!s?.job || !Array.isArray(parts) || parts.length < 2 || !s.job.plan || !s.job.source) {
        return null;
      }
      if (!parts.every((p) => typeof p?.fileName === 'string' && typeof p.text === 'string')) {
        return null;
      }
      const index = Number.isInteger(s.index)
        ? Math.min(parts.length - 1, Math.max(0, s.index!))
        : 0;
      const phases: SectionsPhase[] = ['cut', 'marks', 'slide', 'find', 'done'];
      const phase = phases.includes(s.phase!) ? s.phase! : 'cut';
      // Without how the part lay there is nothing to go on from: the section is to be cut.
      const cut = s.cut && Number.isFinite(s.cut.x) && Number.isFinite(s.cut.angle) ? s.cut : null;
      return {
        job: s.job,
        index,
        phase: cut || phase === 'cut' ? phase : 'cut',
        cut,
        angle: Number.isFinite(s.angle) ? s.angle! : 0,
        located: s.located?.zero && s.located.pose ? s.located : null,
        marks: Array.isArray(s.marks) ? s.marks : [],
        fence: s.fence === true,
      };
    },
    null,
  );
}

/** The loaded job by the name it was made with (a turned copy counts as its section). */
const loadedName = () => {
  const { original, fileName } = useJob.getState();
  return original?.fileName ?? fileName;
};

const running = () => jobUnderWay();

const round = (v: number) => Number(v.toFixed(3));

/** What the middle of the camera's picture reaches, machine XY. */
function cameraReach(): Rect {
  const { travel } = useJob.getState().profile;
  const camera = useWorkshop.getState().settings.camera;
  return {
    minX: travel.x.min + camera.offsetX,
    maxX: travel.x.max + camera.offsetX,
    minY: travel.y.min + camera.offsetY,
    maxY: travel.y.max + camera.offsetY,
  };
}

/** Where the marks may be stuck on right now, machine XY; null when that is not known. */
export function currentBand(): Rect | null {
  const { job, cut } = useSections.getState();
  return job && cut ? markBand(job, cut, cameraReach()) : null;
}

/** The simulator's operator: sticks two tags on the long board, far apart in the band. */
function stickSimulatedTags() {
  const sim = simulator();
  const band = currentBand();
  const { job } = useSections.getState();
  if (!isSimulatorAddress(useMachine.getState().url) || sim.scene !== 'long' || !band || !job) {
    return;
  }
  const along = job.axis === 'x';
  const middle = along ? (band.minY + band.maxY) / 2 : (band.minX + band.maxX) / 2;
  const side = Math.min(35, (along ? band.maxY - band.minY : band.maxX - band.minX) / 2);
  const at = (end: 'min' | 'max', off: number): Point =>
    along
      ? { x: end === 'min' ? band.minX + 15 : band.maxX - 15, y: middle + off }
      : { x: middle + off, y: end === 'min' ? band.minY + 15 : band.maxY - 15 };
  const z = SURFACE_Z;
  sim.stickTags([
    { id: 7, ...sim.physical({ ...at('min', -side), z }), angle: 12 },
    { id: 8, ...sim.physical({ ...at('max', side), z }), angle: -100 },
  ]);
  if (isFullDemo()) scanDemoMap();
}

/** Puts a program of the job on the table: section `index`, turned as the part lies. */
function loadPart(job: SectionsJob, index: number, angle: number): boolean {
  const part = job.parts[index]!;
  if (!useJob.getState().load(part.fileName, part.text)) return false;
  const turned = turnedProgram(part.text, angle);
  if (
    turned !== null &&
    !useJob
      .getState()
      .loadDerived(part.fileName, turned, { by: turnAbout(angle), from: 'original' })
  ) {
    return false;
  }
  useJob.getState().setToolDiameter(job.toolDiameter);
  return true;
}

export const useSections = create<SectionsStore>((set, get) => {
  const save = () => {
    const { job, index, phase, cut, angle, located, marks, fence } = get();
    saveJson(
      browserStorage,
      KEY,
      job ? { job, index, phase, cut, angle, located, marks, fence } : null,
    );
  };
  const fail = (trouble: SectionsTrouble) => {
    set({ trouble });
    const cancelled = trouble.kind === 'tag' && trouble.trouble.kind === 'cancelled';
    useMachine
      .getState()
      .addLog(
        cancelled ? 'info' : 'error',
        t(cancelled ? 'jigs.log.cancelled' : 'sections.log.failed'),
      );
    return false;
  };
  /** While the camera measures for this flow, nothing else may start measuring. */
  const measuring = async (what: 'marks' | 'find', total: number, run: () => Promise<boolean>) => {
    if (get().busy) return false;
    if (!canMeasure()) return fail({ kind: 'tag', trouble: { kind: 'notReady' } });
    beginMeasuring();
    set({ busy: what, trouble: null });
    useJigs.setState({ busy: { jigId: null, done: 0, total } });
    try {
      if (!(await toCameraHeight())) return fail({ kind: 'tag', trouble: { kind: 'machine' } });
      return await run();
    } finally {
      set({ busy: null });
      useJigs.setState({ busy: null });
    }
  };
  const step = (done: number, total: number) =>
    useJigs.setState({ busy: { jigId: null, done, total } });
  /** Drives the camera's middle over a place of the table and waits for a picture taken there. */
  const lookAt = async (p: Point): Promise<ReturnType<typeof liveTags>> => {
    const el = cameraElement();
    const { settings } = useWorkshop.getState();
    const camera = settings.camera;
    const feed = Math.min(3000, useJob.getState().profile.jogFeed.xy);
    const target = { x: p.x - camera.offsetX, y: p.y - camera.offsetY };
    if (!el || !naturalSize()) return null;
    if (!(await useMachine.getState().moveMachine(target, feed))) return null;
    if ((await settled(target)) === null) return null;
    await wait(settings.calibration.settleMs);
    await freshFrame(el);
    return liveTags(false);
  };
  const install = (job: SectionsJob) => {
    set({
      job,
      index: 0,
      phase: 'cut',
      cut: null,
      angle: 0,
      located: null,
      marks: [],
      result: null,
      trouble: null,
      refused: null,
      simulated: 0,
    });
    loadPart(job, 0, 0);
    // Another program: a two-sided job that has not been started ends here.
    useFlip.getState().setPlan(null);
    useUi.getState().leaveCam();
    save();
  };

  const initial = stored();
  return {
    job: initial?.job ?? null,
    index: initial?.index ?? 0,
    phase: initial?.phase ?? 'cut',
    cut: initial?.cut ?? null,
    angle: initial?.angle ?? 0,
    located: initial?.located ?? null,
    marks: initial?.marks ?? [],
    fence: initial?.fence ?? false,
    result: null,
    busy: null,
    trouble: null,
    refused: null,
    simulated: 0,

    begin() {
      const job = useJob.getState();
      const status = useMachine.getState().status;
      if (!job.analysis || job.fileName === null || !status || running()) return false;
      const text = job.lines.join('\n');
      const outside = travelViolations(
        removeToolLengthTable(text).text,
        job.profile,
        status.wco,
        status.mpos,
      );
      const axis = sectionAxis(outside);
      if (!axis) return false;
      const made = makeSections({
        source: { fileName: job.fileName, text, original: job.original, pose: job.pose },
        axis,
        travel: job.profile.travel[axis],
        zero: { x: status.wco[0] ?? 0, y: status.wco[1] ?? 0 },
        toolDiameter: job.toolDiameter,
      });
      if ('problem' in made) {
        set({ refused: made });
        return false;
      }
      install(made);
      useMachine.getState().addLog(
        'info',
        t('sections.log.made', {
          count: made.parts.length,
          slide: formatNumber(made.slide, 0),
        }),
      );
      return true;
    },

    loadSection() {
      const { job, index, angle } = get();
      if (job && !running()) loadPart(job, index, angle);
    },

    cutDone() {
      const { job, index, phase, angle } = get();
      const wco = useMachine.getState().status?.wco;
      if (!job || phase !== 'cut' || !wco) return false;
      const cut = { x: wco[0] ?? 0, y: wco[1] ?? 0, angle };
      const last = index === job.parts.length - 1;
      set({ cut, phase: last ? 'done' : 'marks', marks: [], trouble: null });
      save();
      if (!last) stickSimulatedTags();
      return true;
    },

    setFence(fence) {
      set({ fence, trouble: null });
      save();
    },

    measureMarks() {
      const { job, cut, phase, fence } = get();
      if (!job || !cut || phase !== 'marks') return Promise.resolve(false);
      return measuring('marks', 2, async () => {
        const band = currentBand();
        const camera = useWorkshop.getState().settings.camera;
        const size = naturalSize();
        if (!band || !size) return fail({ kind: 'noMarks' });
        const inBand = (p: Point) =>
          p.x > band.minX - MARK_PAD &&
          p.x < band.maxX + MARK_PAD &&
          p.y > band.minY - MARK_PAD &&
          p.y < band.maxY + MARK_PAD;
        const view = { width: size.width / camera.pxPerMm, height: size.height / camera.pxPerMm };
        // All over the band until two marks are seen: where they are stuck on, nobody has said.
        const found = new Map<number, Point>();
        for (const stop of sweepStops(band, view, job.axis)) {
          if (measuringCancelled()) return fail({ kind: 'tag', trouble: { kind: 'cancelled' } });
          const look = await lookAt(stop);
          if (!look) return fail({ kind: 'tag', trouble: { kind: 'machine' } });
          for (const tag of look.tags) if (inBand(tag)) found.set(tag.id, { x: tag.x, y: tag.y });
          if (found.size >= 2) break;
        }
        const seen = [...found].map(([id, p]) => ({ id, ...p }));
        if (seen.length === 0) return fail({ kind: 'noMarks' });
        if (seen.length === 1 && !fence) return fail({ kind: 'oneMark', tag: seen[0]!.id });
        const readings: TagReading[] = [];
        for (const target of farthestPair(seen).sort((a, b) => a.id - b.id)) {
          const reading = await measureTag(target.id, target, SECOND_NEAR);
          if ('kind' in reading) return fail({ kind: 'tag', trouble: reading });
          readings.push(reading);
          step(readings.length, seen.length);
        }
        const marks = marksOnPart(cut, readings);
        set({ marks, phase: 'slide', result: null });
        // These tags are register marks, not a jig to be taught.
        useJigs.setState((s) => ({
          ignored: [...new Set([...s.ignored, ...marks.map((m) => m.id)])],
        }));
        save();
        useMachine.getState().addLog('info', t('sections.log.marks', { count: marks.length }));
        return true;
      });
    },

    slid() {
      const { job, index, phase, simulated } = get();
      if (!job || phase !== 'slide') return;
      // Once per slide: confirming again (to find the part anew) leaves the board as it lies.
      const sim = simulator();
      if (
        isSimulatorAddress(useMachine.getState().url) &&
        sim.scene === 'long' &&
        simulated <= index
      ) {
        sim.slideLong(job.axis === 'x' ? -job.slide : 0, job.axis === 'y' ? -job.slide : 0);
        set({ simulated: index + 1 });
        if (isFullDemo()) scanDemoMap();
      }
      set({ phase: 'find', trouble: null });
      save();
    },

    find(here = false) {
      const { job, index, cut, marks, phase, fence } = get();
      const first = marks[0];
      if (!job || !cut || !first || phase !== 'find') return Promise.resolve(false);
      return measuring('find', marks.length, async () => {
        const tagFail = (trouble: JigTrouble) => fail({ kind: 'tag', trouble });
        let start = expectedMark(cut, first, job.axis, job.slide);
        let order = marks;
        if (here) {
          // Where the camera stands: whichever of the marks is in the picture leads on.
          const tag = liveTags(true)?.tags.find((x) => marks.some((m) => m.id === x.id));
          if (!tag) return tagFail({ kind: 'notThere', tag: first.id });
          start = tag;
          order = [...marks].sort((a, b) => Number(b.id === tag.id) - Number(a.id === tag.id));
        }
        const lead = order[0]!;
        let reading = await measureTag(lead.id, start, FIND_NEAR);
        if ('kind' in reading && reading.kind === 'notThere' && !here) {
          // Slid farther or less far than asked: a look around, nearest first.
          const camera = useWorkshop.getState().settings.camera;
          const size = naturalSize()!;
          const dx = size.width / camera.pxPerMm / 2;
          const dy = size.height / camera.pxPerMm / 2;
          const around = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ] as const;
          for (const [i, j] of around) {
            if (measuringCancelled()) return tagFail({ kind: 'cancelled' });
            const look = await lookAt({ x: start.x + i * dx, y: start.y + j * dy });
            const tag = look?.tags.find((x) => x.id === lead.id);
            if (!tag) continue;
            reading = await measureTag(lead.id, tag, SECOND_NEAR);
            break;
          }
        }
        if ('kind' in reading) return tagFail(reading);
        const readings: TagReading[] = [reading];
        step(1, marks.length);
        const other = order[1];
        if (other) {
          // As the part lay: the second mark from the first, good enough to drive over it.
          const was = fromJig(
            { x: 0, y: 0, angle: cut.angle },
            {
              x: other.x - lead.x,
              y: other.y - lead.y,
            },
          );
          const second = await measureTag(
            other.id,
            { x: reading.x + was.x, y: reading.y + was.y },
            SECOND_NEAR,
          );
          if ('kind' in second) return tagFail(second);
          readings.push(second);
          step(2, marks.length);
        }
        const place = locatePart(cut, marks, readings, fence);
        if ('problem' in place) return fail({ kind: 'fit', trouble: place });
        if (measuringCancelled()) return tagFail({ kind: 'cancelled' });
        if (running()) return tagFail({ kind: 'notReady' });
        const zero = { x: round(place.pose.x), y: round(place.pose.y) };
        if (!(await useMachine.getState().setZeroAt(zero))) return fail({ kind: 'machine' });
        // A job began while the zero was being set: the next section is not put on the table
        if (!loadPart(job, index + 1, place.pose.angle)) return tagFail({ kind: 'notReady' });
        const result = {
          moved: Math.hypot(place.shift.x, place.shift.y),
          rotation: place.rotation,
          distanceError: place.distanceError,
        };
        set({
          index: index + 1,
          phase: 'cut',
          angle: place.pose.angle,
          located: { zero, pose: useJob.getState().pose },
          result,
          trouble: null,
        });
        save();
        useMachine.getState().addLog(
          'info',
          t('sections.log.found', {
            n: index + 2,
            mm: formatNumber(result.moved, 1),
            angle: formatNumber(result.rotation, 2),
          }),
        );
        return true;
      });
    },

    back() {
      const { job, index, phase, cut } = get();
      if (!job || get().busy || running()) return;
      if (phase === 'slide') set({ phase: 'marks', marks: [], trouble: null });
      else if (phase === 'find') set({ phase: 'slide', trouble: null });
      // The next section is loaded but not cut: the part is found anew for it.
      else if (phase === 'cut' && index > 0 && cut) {
        loadPart(job, index - 1, cut.angle);
        set({ index: index - 1, phase: 'find', angle: cut.angle, located: null, trouble: null });
      }
      save();
    },

    dismiss() {
      set({ refused: null });
    },

    cancel() {
      // Giving up the flow while a job is under way would leave one of its sections on the table
      // with nothing that knows it: the way out is ending the job in Fräsen (and it says so)
      if (programRefused()) return;
      const { job, phase } = get();
      const mine = loadedName() === null || sectionOf(job, loadedName()) >= 0;
      if (job && phase !== 'done' && mine && !running()) {
        const { source } = job;
        const store = useJob.getState();
        if (source.original) {
          store.load(source.original.fileName, source.original.text);
          useJob
            .getState()
            .loadDerived(source.fileName, source.text, { by: source.pose, from: 'original' });
        } else {
          store.load(source.fileName, source.text);
        }
        useJob.getState().setToolDiameter(job.toolDiameter);
      }
      set({
        job: null,
        index: 0,
        phase: 'cut',
        cut: null,
        angle: 0,
        located: null,
        marks: [],
        result: null,
        trouble: null,
        refused: null,
        simulated: 0,
      });
      save();
    },
  };
});

/** A job ran to its end: the section at hand is cut – with several cutters, once the last has run. */
export function sectionsJobEnded(record: Pick<JobRecord, 'result' | 'file'>) {
  const { job, index, phase, cutDone } = useSections.getState();
  if (!job || record.result !== 'done' || phase !== 'cut') return;
  if (sectionOf(job, loadedName()) !== index) return;
  const { fileName, lines, profile } = useJob.getState();
  const parts = preparedFor(fileName ?? '', lines, profile.kinematics).parts;
  if (parts.length > 1 && record.file !== parts[parts.length - 1]!.fileName) return;
  if (!cutDone()) return;
  const last = index === job.parts.length - 1;
  useMachine
    .getState()
    .addLog(
      'info',
      last
        ? t('sections.log.allDone', { name: job.name })
        : t('sections.log.cut', { n: index + 1 }),
    );
}

onJobEnd(sectionsJobEnded);

/**
 * Keeps the sections fitting the part as it lies: while the first section
 * is not cut, a new X/Y zero means the job is divided anew for it (as the
 * travel check would say something else now).
 */
export function startSections(): () => void {
  return useMachine.subscribe((s, prev) => {
    const wco = s.status?.wco;
    if (!wco || wco === prev.status?.wco) return;
    const { job, index, phase, busy } = useSections.getState();
    if (!job || index !== 0 || phase !== 'cut' || busy || running()) return;
    const zero = { x: wco[0] ?? 0, y: wco[1] ?? 0 };
    if (Math.hypot(zero.x - job.zero.x, zero.y - job.zero.y) <= 0.005) return;
    const made = makeSections({
      source: job.source,
      axis: job.axis,
      travel: useJob.getState().profile.travel[job.axis],
      zero,
      toolDiameter: job.toolDiameter,
    });
    const onTable = sectionOf(job, loadedName()) >= 0;
    if ('problem' in made) {
      // It fits now, or cannot be divided as it lies: back to the whole job, with the reason.
      useSections.getState().cancel();
      if (made.problem !== 'fits') useSections.setState({ refused: made });
      useMachine.getState().addLog('info', t('sections.log.undone'));
      return;
    }
    useSections.setState({ job: made });
    saveJson(browserStorage, KEY, {
      ...pick(useSections.getState()),
      job: made,
    });
    if (onTable) useSections.getState().loadSection();
    useMachine
      .getState()
      .addLog(
        'info',
        t('sections.log.made', { count: made.parts.length, slide: formatNumber(made.slide, 0) }),
      );
  });
}

const pick = ({ job, index, phase, cut, angle, located, marks, fence }: SectionsStore): Stored => ({
  job,
  index,
  phase,
  cut,
  angle,
  located,
  marks,
  fence,
});
