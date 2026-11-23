import { rotation as turnAbout } from '@lowrider/cam';
import {
  expectTags,
  jigFrame,
  locateJig,
  tagPaper,
  teachJig,
  type Jig,
  type TagReading,
} from '@lowrider/workshop';
import { create } from 'zustand';
import { t } from '../i18n';
import { imageToMachine, machineToImage, type Point } from '../lib/camera';
import { formatNumber } from '../lib/format';
import {
  clampsToJig,
  hasMoved,
  jigFileName,
  jigsWithTag,
  jobReach,
  turnedProgram,
  withJigClamps,
  withSightings,
  type JigFixture,
  type JigTrouble,
  type PlacedJig,
  type Sighting,
} from '../lib/jigs';
import { newId } from '../lib/persist';
import { mapPixel } from '../lib/series';
import { toGray } from '../lib/markers';
import { findTags, tagOnTable, type RejectedTag, type TableTag } from '../lib/tagFinder';
import { grabFrame, useCalibration } from './calibration';
import { cameraElement, naturalSize } from './camera';
import { useFlip } from './flip';
import { useJob } from './job';
import { useMachine } from './machine';
import { cameraCalibrated, freshFrame, mapPicture, usePhotoMap } from './photomap';
import { useSeries } from './series';
import { settled, wait } from './settle';
import { useUi } from './ui';
import { useWorkshop } from './workshop';

/**
 * Jigs with printed tags, against the live machine: which tags the camera
 * has seen (live picture and table picture), teaching a jig from the setup
 * as it stands, and measuring a known jig – drive the camera over its tags,
 * read them at the crosshair, set the X/Y work zero and load its job turned
 * to it. The stored jigs themselves live with the other libraries
 * (`useWorkshop().jigs`).
 */

/** The camera counts as standing over a tag's middle within this, mm */
const OVER = 0.15;
/** A tag measured after a move lies at most this far from where it was expected, mm */
const NEAR = 25;

/** Something in the live picture that looks like a tag but is not taken for one. */
export interface RefusedTag {
  reason: RejectedTag['reason'];
  /** Side as measured, mm (for a wrong size) */
  mm?: number;
  /** Outline, table XY */
  outline: Point[];
}

/** Teaching a jig: which tags belong to it, and what was measured of them. */
export interface TeachState {
  /** Numbers of the tags that belong to the jig (one or two) */
  picked: number[];
  /** The tags as measured at the crosshair; null before */
  readings: TagReading[] | null;
}

interface JigStore {
  /** Tags the camera has seen on the table, one entry per number */
  seen: Sighting[];
  /** What the live picture shows that is nearly a tag, with the reason */
  refused: RefusedTag[];
  /** The machine is measuring tags: for a jig, or for teaching one */
  busy: { jigId: string | null; done: number; total: number } | null;
  /** Why the last measuring did not work, and for which jig (null: while teaching) */
  trouble: (JigTrouble & { jigId: string | null }) | null;
  /** The jig whose job is on the table, and that program as it was loaded */
  loaded: { jigId: string; text: string } | null;
  /** That jig as it was measured in this session; null when it was not */
  placed: PlacedJig | null;
  teach: TeachState | null;
  /** Unknown tags the operator does not want to be asked about (their numbers) */
  ignored: number[];
  /** Looks for tags on the picture of the table (the photo map) */
  lookAtMap(): number;
  /** Looks for tags in the live picture as it is */
  lookLive(): void;
  /** Loads the job of a jig as it was taught, without measuring – the readiness list then asks for it */
  loadJob(jigId: string): boolean;
  /** Drives the camera over the tags of a jig, sets the X/Y zero from them and loads its job */
  measure(jigId: string): Promise<boolean>;
  /** Ends a measuring round */
  cancel(): void;
  beginTeach(): void;
  cancelTeach(): void;
  /** Takes a tag into the jig that is being taught, or out of it */
  pick(id: number): void;
  /** Drives the camera over the picked tags and measures them at the crosshair */
  teachMeasure(): Promise<boolean>;
  /** Keeps the setup as it stands as a jig with this name */
  teachSave(name: string): Jig | null;
  /** No more questions about the unknown tags that are on the table now */
  ignoreUnknown(): void;
}

let cancelled = false;

const round = (v: number) => Number(v.toFixed(3));

function spindle(): Point | null {
  const s = useMachine.getState().status;
  return s ? { x: s.mpos[0] ?? 0, y: s.mpos[1] ?? 0 } : null;
}

/** A job is running: no looking around, no measuring. */
const running = () => {
  const m = useMachine.getState();
  return m.fileJob !== null || m.stream?.result === 'running';
};

/** The machine is connected and stands still. */
const idle = () => {
  const m = useMachine.getState();
  return m.connection === 'connected' && m.status?.state === 'Idle' && !running();
};

/** Watching for tags reads the live picture at about this scale, px per mm: like the table picture */
const WATCH_PX_PER_MM = 4;
let small: HTMLCanvasElement | null = null;

/**
 * The live picture as grey values, made smaller by `shrink` (≤ 1). Watching
 * for tags twice a second must not hold up a finger on the screen: a quarter
 * of the pixels is read in a fraction of the time.
 */
function grabSmall(shrink: number): { gray: Uint8Array; width: number; height: number } | null {
  const el = cameraElement();
  const full = naturalSize();
  if (!el || !full || typeof document === 'undefined') return null;
  const width = Math.max(1, Math.round(full.width * shrink));
  const height = Math.max(1, Math.round(full.height * shrink));
  small ??= document.createElement('canvas');
  small.width = width;
  small.height = height;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(el, 0, 0, width, height);
  return { gray: toGray(ctx.getImageData(0, 0, width, height).data, width, height), width, height };
}

/**
 * The tags in the live picture right now, on the table; null without a
 * usable picture. `exact` reads every pixel (for measuring at the
 * crosshair); without it a smaller picture is read (for watching).
 */
export function liveTags(exact: boolean): {
  tags: TableTag[];
  refused: RefusedTag[];
  off(p: Point): number;
  covers(p: Point): boolean;
} | null {
  const camera = useWorkshop.getState().settings.camera;
  const at = spindle();
  const size = naturalSize();
  if (!at || !size || !cameraCalibrated(camera)) return null;
  const shrink = exact ? 1 : Math.min(1, WATCH_PX_PER_MM / camera.pxPerMm);
  let frame: ReturnType<typeof grabFrame>;
  try {
    frame = exact ? grabFrame() : grabSmall(shrink);
  } catch {
    // A stream from another origin without CORS cannot be read.
    return null;
  }
  if (!frame) return null;
  // A pixel of the picture as read is a pixel of the camera's own picture, made smaller.
  const toTable = (px: Point) =>
    imageToMachine(camera, { x: px.x / shrink, y: px.y / shrink }, size, at);
  const found = findTags(frame.gray, frame.width, frame.height, {
    pxPerMm: camera.pxPerMm * shrink,
  });
  return {
    tags: found.tags.map((tag) => tagOnTable(tag, toTable)),
    refused: found.rejected.map((r) => ({
      reason: r.reason,
      ...(r.measured === undefined ? {} : { mm: r.measured }),
      outline: r.outline.map(toTable),
    })),
    /** How far a point of the table lies from the crosshair, mm */
    off: (p: Point) => Math.hypot(p.x - at.x - camera.offsetX, p.y - at.y - camera.offsetY),
    // All of a tag is in view when its paper, turned as it lies, ends inside the picture.
    covers(p: Point & { size?: number; angle?: number }) {
      const px = machineToImage(camera, p, size, at);
      const a = (((p.angle ?? 45) - camera.rotation) * Math.PI) / 180;
      const half =
        ((tagPaper(p.size ?? 40) / 2) * (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))) + 1) *
        camera.pxPerMm;
      return px.x > half && px.y > half && px.x < size.width - half && px.y < size.height - half;
    },
  };
}

const sighting = (tag: TableTag, from: Sighting['from'], off = 0): Sighting => ({
  off,
  id: tag.id,
  x: tag.x,
  y: tag.y,
  angle: tag.angle,
  size: tag.size,
  scale: tag.scale,
  from,
  map: usePhotoMap.getState().version,
});

/**
 * Drives the camera over a place where a tag is expected, reads it in the
 * middle of the live picture – where the lens and the scale matter least –
 * and goes over it once more if it was off. The tag as measured, or why not.
 * `near` is how far from the expected place it may lie.
 */
export async function measureTag(
  id: number,
  expected: Point,
  near = NEAR,
): Promise<TagReading | JigTrouble> {
  const el = cameraElement();
  const { settings } = useWorkshop.getState();
  const camera = settings.camera;
  const machine = useMachine.getState();
  if (!el || !naturalSize()) return { kind: 'notReady' };
  const feed = Math.min(3000, useJob.getState().profile.jogFeed.xy);
  let at = expected;
  let read: TableTag | null = null;
  for (let round = 0; round < 3; round++) {
    if (cancelled) return { kind: 'cancelled' };
    const target = { x: at.x - camera.offsetX, y: at.y - camera.offsetY };
    if (!(await machine.moveMachine(target, feed)) || (await settled(target)) === null) {
      return { kind: 'machine' };
    }
    await wait(settings.calibration.settleMs);
    await freshFrame(el);
    const look = liveTags(true);
    if (!look) return { kind: 'notReady' };
    const here = look.tags
      .filter((tag) => tag.id === id && Math.hypot(tag.x - at.x, tag.y - at.y) < near)
      .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
    if (!here) {
      // Not there: say what lies there instead, if anything does.
      const off = (r: RefusedTag) => {
        const x = r.outline.reduce((sum, p) => sum + p.x, 0) / r.outline.length;
        const y = r.outline.reduce((sum, p) => sum + p.y, 0) / r.outline.length;
        return Math.hypot(x - at.x, y - at.y);
      };
      const refused = look.refused
        .filter((r) => r.outline.length > 0 && off(r) < near)
        .sort((a, b) => off(a) - off(b))[0];
      return refused
        ? { kind: 'refused', tag: id, reason: refused.reason, mm: refused.mm }
        : { kind: 'notThere', tag: id };
    }
    read = here;
    if (Math.hypot(here.x - at.x, here.y - at.y) < OVER) break;
    at = { x: here.x, y: here.y };
  }
  return { id, x: read!.x, y: read!.y, angle: read!.angle, size: read!.size };
}

/**
 * Another flow measures tags with the camera (a long part's register marks):
 * a round of its own, ended like a jig's by `useJigs().cancel()`.
 */
export function beginMeasuring(): void {
  cancelled = false;
}

/** Whether the round of measuring at hand has been called off. */
export const measuringCancelled = () => cancelled;

/** Camera height first: only there does the picture's scale fit. */
export async function toCameraHeight(): Promise<boolean> {
  const machine = useMachine.getState();
  const camera = useWorkshop.getState().settings.camera;
  if (!machine.status || camera.focusHeight === null) return false;
  const z = camera.focusHeight + (machine.status.wco[2] ?? 0);
  if (Math.abs((machine.status.mpos[2] ?? 0) - z) <= 0.05) return true;
  const { jogFeed } = useJob.getState().profile;
  return (await machine.moveMachine({ z }, jogFeed.z)) && (await settled({ z })) !== null;
}

/** Whether measuring can start: the machine stands still and the camera gives a calibrated picture. */
export function canMeasure(): boolean {
  const camera = useWorkshop.getState().settings.camera;
  return (
    idle() &&
    cameraElement() !== null &&
    naturalSize() !== null &&
    cameraCalibrated(camera) &&
    useJigs.getState().busy === null &&
    useCalibration.getState().task === null
  );
}

/** The program that is on the table, by what it was loaded from. */
const jobSource = () => {
  const job = useJob.getState();
  return job.original?.text ?? job.lines.join('\n');
};

export const useJigs = create<JigStore>((set, get) => ({
  seen: [],
  refused: [],
  busy: null,
  trouble: null,
  loaded: null,
  placed: null,
  teach: null,
  ignored: [],

  lookAtMap() {
    const picture = mapPicture();
    const map = usePhotoMap.getState().version;
    if (!picture) {
      set((s) => ({ seen: withSightings(s.seen, [], { from: 'map', map }) }));
      return 0;
    }
    const found = findTags(picture.gray, picture.width, picture.height, {
      pxPerMm: picture.pxPerMm,
      valid: picture.valid,
    });
    const toTable = mapPixel(picture.left, picture.top, picture.pxPerMm);
    const fresh = found.tags.map((tag) => sighting(tagOnTable(tag, toTable), 'map'));
    set((s) => {
      const seen = withSightings(s.seen, fresh, { from: 'map', map });
      return {
        seen,
        // A new look at the table: what went wrong before may be right now.
        trouble: fresh.length > 0 && !s.busy ? null : s.trouble,
        placed: s.placed && hasMoved(s.placed.tags, seen) ? { ...s.placed, moved: true } : s.placed,
      };
    });
    return fresh.length;
  },

  lookLive() {
    const look = liveTags(false);
    if (!look) return;
    const fresh = look.tags.map((tag) => sighting(tag, 'live', look.off(tag)));
    set((s) => {
      const seen = withSightings(s.seen, fresh, { from: 'live', covers: look.covers });
      // Nothing new: the same lists stay, so nothing is drawn anew.
      const same =
        seen.length === s.seen.length &&
        seen.every((a, i) => {
          const b = s.seen[i]!;
          return a.id === b.id && a.from === b.from && Math.hypot(a.x - b.x, a.y - b.y) < 0.05;
        });
      const moved = s.placed !== null && !s.placed.moved && hasMoved(s.placed.tags, fresh);
      const sameRefused =
        look.refused.length === s.refused.length &&
        look.refused.every((r, i) => r.reason === s.refused[i]!.reason);
      if (same && !moved && sameRefused) return s;
      // A tag that was not known before: what went wrong before may be right now.
      const appeared = seen.some((a) => !s.seen.some((b) => b.id === a.id));
      return {
        trouble: appeared && !s.busy ? null : s.trouble,
        seen: same ? s.seen : seen,
        refused: sameRefused ? s.refused : look.refused,
        placed: moved ? { ...s.placed!, moved: true } : s.placed,
      };
    });
  },

  loadJob(jigId) {
    const jig = useWorkshop.getState().jigs.find((j) => j.id === jigId);
    if (!jig || running()) return false;
    loadJigJob(jig, 0);
    set({ loaded: { jigId, text: jobSource() }, placed: null, trouble: null });
    return true;
  },

  async measure(jigId) {
    const jig = useWorkshop.getState().jigs.find((j) => j.id === jigId);
    if (!jig || get().busy) return false;
    const fail = (trouble: JigTrouble) => {
      set({ trouble: { ...trouble, jigId } });
      const { addLog } = useMachine.getState();
      if (trouble.kind === 'cancelled') addLog('info', t('jigs.log.cancelled'));
      else addLog('error', t('jigs.log.failed', { name: jig.name }), 'jigs.log.failed');
      return false;
    };
    if (!canMeasure()) return fail({ kind: 'notReady' });
    const known = (id: number) => get().seen.find((s) => s.id === id);
    if (!jig.tags.some((tag) => known(tag.id))) return fail({ kind: 'unseen' });
    cancelled = false;
    set({ busy: { jigId, done: 0, total: jig.tags.length }, trouble: null });
    try {
      if (!(await toCameraHeight())) return fail({ kind: 'machine' });
      // The tags that have been seen first; the others are found from them.
      const order = [...jig.tags].sort((a, b) => Number(!known(a.id)) - Number(!known(b.id)));
      const readings: TagReading[] = [];
      for (const tag of order) {
        const first = readings[0];
        const guess =
          known(tag.id) ??
          (first ? expectTags(jig, first)?.find((e) => e.id === tag.id) : null) ??
          null;
        if (!guess) return fail({ kind: 'unseen', tag: tag.id });
        const reading = await measureTag(tag.id, guess);
        if ('kind' in reading) {
          // It is not where it was seen: that sighting is worth nothing any more.
          if (reading.kind === 'notThere') {
            set((s) => ({ seen: s.seen.filter((x) => x.id !== tag.id) }));
          }
          return fail(reading);
        }
        readings.push(reading);
        set({ busy: { jigId, done: readings.length, total: jig.tags.length } });
      }
      const place = locateJig(jig, readings);
      if ('problem' in place) {
        return fail(
          place.problem === 'distance'
            ? { kind: 'distance' }
            : place.problem === 'turned'
              ? { kind: 'turned', tag: place.tag }
              : { kind: 'unseen', tag: place.tag },
        );
      }
      if (cancelled) return fail({ kind: 'cancelled' });
      if (running()) return fail({ kind: 'notReady' });
      const zero = { x: round(place.zero.x), y: round(place.zero.y) };
      if (!(await useMachine.getState().setZeroAt(zero))) return fail({ kind: 'machine' });
      loadJigJob(jig, place.rotation);
      // Its clamps lie where the jig lies now.
      if (jig.clamps.length > 0) {
        const { setup, setSetup } = useWorkshop.getState();
        if (setup.fixtureFrame === 'machine') {
          setSetup({ fixtures: withJigClamps(setup.fixtures, jig, place.pose) });
        }
      }
      set((s) => ({
        loaded: { jigId, text: jobSource() },
        placed: {
          jigId,
          zero,
          pose: useJob.getState().pose,
          rotation: place.rotation,
          tags: readings,
          z: useMachine.getState().status?.wco[2] ?? 0,
          moved: false,
        },
        // What was measured at the crosshair is the best that is known of these tags.
        seen: withSightings(
          s.seen,
          readings.map((r) => ({
            ...r,
            from: 'live' as const,
            off: 0,
            scale: 1,
            map: usePhotoMap.getState().version,
          })),
          { from: 'live', covers: () => false },
        ),
      }));
      useMachine.getState().addLog(
        'info',
        t('jigs.log.placed', {
          name: jig.name,
          angle: formatNumber(place.rotation, 2),
        }),
      );
      return true;
    } finally {
      set({ busy: null });
    }
  },

  cancel() {
    cancelled = true;
  },

  beginTeach() {
    const { jigs } = useWorkshop.getState();
    const seen = get().seen;
    // Tags that belong to no jig yet come first; else the ones that are there.
    const free = seen.filter((s) => jigsWithTag(jigs, s.id).length === 0);
    const picked = (free.length > 0 ? free : seen).slice(0, 2).map((s) => s.id);
    set({ teach: { picked, readings: null }, trouble: null });
  },

  cancelTeach() {
    set({ teach: null, trouble: null });
  },

  pick(id) {
    set((s) => {
      if (!s.teach) return s;
      const has = s.teach.picked.includes(id);
      // Two at most: a third one takes the place of the first.
      const picked = has
        ? s.teach.picked.filter((x) => x !== id)
        : [...s.teach.picked, id].slice(-2);
      return { teach: { picked, readings: null } };
    });
  },

  async teachMeasure() {
    const teach = get().teach;
    if (!teach || get().busy) return false;
    const fail = (trouble: JigTrouble) => {
      set({ trouble: { ...trouble, jigId: null } });
      return false;
    };
    if (!canMeasure()) return fail({ kind: 'notReady' });
    const targets = teach.picked
      .map((id) => get().seen.find((s) => s.id === id))
      .filter((s) => s !== undefined);
    if (targets.length === 0 || targets.length !== teach.picked.length) {
      return fail({ kind: 'unseen' });
    }
    cancelled = false;
    set({ busy: { jigId: null, done: 0, total: targets.length }, trouble: null });
    try {
      if (!(await toCameraHeight())) return fail({ kind: 'machine' });
      const readings: TagReading[] = [];
      for (const target of targets) {
        const reading = await measureTag(target.id, target);
        if ('kind' in reading) return fail(reading);
        readings.push(reading);
        set({ busy: { jigId: null, done: readings.length, total: targets.length } });
      }
      if (!jigFrame(readings)) return fail({ kind: 'distance' });
      set((s) => (s.teach ? { teach: { ...s.teach, readings } } : s));
      return true;
    } finally {
      set({ busy: null });
    }
  },

  teachSave(name) {
    const readings = get().teach?.readings;
    const job = useJob.getState();
    const wco = useMachine.getState().status?.wco;
    const frame = readings ? jigFrame(readings) : null;
    if (!readings || !frame || !wco || job.fileName === null || !job.analysis) return null;
    if (name.trim() === '') return null;
    const zero = { x: wco[0] ?? 0, y: wco[1] ?? 0 };
    const kept = teachJig(readings, zero);
    if (!kept) return null;
    const { setup, setSetup, saveJig } = useWorkshop.getState();
    const fixtures: JigFixture[] = setup.fixtureFrame === 'machine' ? setup.fixtures : [];
    const jig: Jig = {
      id: newId('jig'),
      name: name.trim(),
      ...kept,
      job: {
        fileName: job.fileName,
        text: job.lines.join('\n'),
        toolDiameter: job.toolDiameter,
      },
      reach: round(jobReach(kept.tags, frame, zero, job.analysis.cutBounds)),
      clamps: clampsToJig(frame, fixtures),
      createdAt: Date.now(),
    };
    saveJig(jig);
    // The clamps on the table are this jig's from now on: measured anew, they go with it.
    if (fixtures.length > 0) setSetup({ fixtures: fixtures.map((f) => ({ ...f, jig: jig.id })) });
    set({
      teach: null,
      trouble: null,
      loaded: { jigId: jig.id, text: jobSource() },
      placed: {
        jigId: jig.id,
        zero,
        pose: job.pose,
        rotation: 0,
        tags: readings,
        // Taught with the Z zero set: nothing left to do about the height.
        z: Number.NaN,
        moved: false,
      },
    });
    useMachine.getState().addLog('info', t('jigs.log.taught', { name: jig.name }));
    return jig;
  },

  ignoreUnknown() {
    const { jigs } = useWorkshop.getState();
    set((s) => ({
      ignored: s.seen.filter((x) => jigsWithTag(jigs, x.id).length === 0).map((x) => x.id),
    }));
  },
}));

/** Puts the job of a jig on the table, turned by `rotation` about its zero. */
function loadJigJob(jig: Jig, rotation: number) {
  const job = useJob.getState();
  job.load(jig.job.fileName, jig.job.text);
  const turned = turnedProgram(jig.job.text, rotation);
  if (turned !== null) {
    useJob.getState().loadDerived(jigFileName(jig.job.fileName), turned, {
      by: turnAbout(rotation),
      from: 'original',
    });
  }
  useJob.getState().setToolDiameter(jig.job.toolDiameter);
  // Another program: a two-sided job that has not been started ends here.
  useFlip.getState().setPlan(null);
  useUi.getState().setDrawing(false);
}

/** Tiles laid onto the table picture in one go from which it is worth a search (a scan, the demo's map) */
const MANY_TILES = 4;

/**
 * Keeps looking for tags: in the live picture whenever the machine stands
 * still with the camera on, and on the table picture after a scan (single
 * pictures laid down while driving about were seen live already). Forgets
 * which jig the job belongs to when another program is loaded.
 */
export function startJigs(): () => void {
  const get = useJigs.getState;
  let last: Point | null = null;
  const timer = setInterval(() => {
    const at = spindle();
    const still = at !== null && last !== null && at.x === last.x && at.y === last.y;
    last = at;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!still || !idle() || get().busy || !cameraElement() || !naturalSize()) return;
    if (useCalibration.getState().task || usePhotoMap.getState().scan) return;
    if (useSeries.getState().busy) return;
    get().lookLive();
  }, 700);

  let pending = 0;
  let scanned = false;
  let quiet: ReturnType<typeof setTimeout> | null = null;
  const offMap = usePhotoMap.subscribe((s, prev) => {
    if (prev.scan && !s.scan) scanned = true;
    if (s.version === prev.version) return;
    pending++;
    if (quiet) clearTimeout(quiet);
    quiet = setTimeout(() => {
      quiet = null;
      const search = scanned || pending >= MANY_TILES || usePhotoMap.getState().tiles === 0;
      pending = 0;
      scanned = false;
      if (search && !usePhotoMap.getState().scan && !running()) get().lookAtMap();
    }, 800);
  });

  const offJob = useJob.subscribe((s, prev) => {
    if (s.lines === prev.lines && s.original === prev.original) return;
    const { loaded } = get();
    if (loaded && (s.original?.text ?? s.lines.join('\n')) !== loaded.text) {
      useJigs.setState({ loaded: null, placed: null });
    }
  });

  return () => {
    clearInterval(timer);
    if (quiet) clearTimeout(quiet);
    offMap();
    offJob();
  };
}
