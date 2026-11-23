import type { Matrix } from '@lowrider/cam';
import {
  planSections,
  removeToolLengthTable,
  splitSections,
  type SectionAxis,
  type SectionPlan,
  type SectionProblem,
  type WorkspaceViolation,
} from '@lowrider/gcode-core';
import {
  fromJig,
  jigReach,
  markZone,
  tagPaper,
  type PartMark,
  type PartPose,
  type SlideTrouble,
} from '@lowrider/workshop';
import type { Point } from './camera';
import type { JigTrouble } from './jigs';
import type { Rect } from './photomap';

/**
 * Parts longer than the table, between the job and the machine: the job cut
 * in sections as the part lies (`makeSections`), what the readiness list
 * says about a section's program, and where the camera looks for the
 * register marks before and after the part is slid along. The dividing
 * itself is `@lowrider/gcode-core`'s `sections.ts`, finding the part again
 * `@lowrider/workshop`'s.
 */

/** The part is slid by hand to within this of what the app asks for, ± mm */
export const SLIDE_TOLERANCE = 30;
/** Room around the middle of a mark so that all of its paper is in the picture, mm */
export const MARK_PAD = tagPaper(40) / 2 + 5;
/** From this expected error at the far end on, a fence is recommended, mm */
export const SECTION_ERROR_WARN = 0.5;

/**
 * The stretch two neighbouring placements share, for the marks: about a
 * third of the travel – wide enough for two marks well apart on a narrow
 * part, not so wide that it costs a section.
 */
export const sharedZone = (travel: number) => Math.min(350, Math.max(150, 0.3 * travel));

/** The job as it was before it was cut in sections, to go back to. */
export interface SourceJob {
  fileName: string;
  text: string;
  /** What it was made from, when it was an aligned or levelled copy */
  original: { fileName: string; text: string } | null;
  pose: Matrix;
}

export interface SectionPart {
  fileName: string;
  text: string;
  /** Pieces of cut in it; 0: nothing to cut in this section */
  cuts: number;
  /** What it cuts, program XY */
  box: Rect | null;
}

/** A job cut in sections, as the flow keeps it. */
export interface SectionsJob {
  /** Name of the job, without the ending */
  name: string;
  axis: SectionAxis;
  plan: SectionPlan;
  parts: SectionPart[];
  /** How far the part is slid each time, mm */
  slide: number;
  /** The X/Y work zero it was planned for, machine XY */
  zero: Point;
  toolDiameter: number;
  source: SourceJob;
}

/**
 * The axis along which a job is too long for the table: all its moves
 * outside the travel are outside along X, or all along Y. Null when it is
 * too high or too low as well, or too large both ways.
 */
export function sectionAxis(
  violations: readonly Pick<WorkspaceViolation, 'axis'>[],
): SectionAxis | null {
  const axes = new Set(violations.map((v) => v.axis));
  const [axis] = axes;
  return axes.size === 1 && axis !== 'z' && axis !== undefined ? axis : null;
}

/** `regal.nc`, section 2 of 3 → `regal_abschnitt_2von3.nc` */
export const sectionFileName = (name: string, index: number, total: number) =>
  `${name}_abschnitt_${index + 1}von${total}.nc`;

export interface SectionsInput {
  source: SourceJob;
  axis: SectionAxis;
  /** Travel of the machine along the axis, machine coordinates */
  travel: { min: number; max: number };
  /** The X/Y work zero, machine XY */
  zero: Point;
  toolDiameter: number;
}

/**
 * Cuts the job in sections for the part as it lies: the first section is
 * what the machine reaches from the work zero as it is; every further one
 * after a slide.
 */
export function makeSections(input: SectionsInput): SectionsJob | SectionProblem {
  const { source, axis, travel, zero, toolDiameter } = input;
  // As the job is prepared for the SD card: without the tool table's lengths.
  const text = removeToolLengthTable(source.text).text;
  const touch = Math.max(1, toolDiameter);
  const plan = planSections(text, {
    axis,
    reach: { min: travel.min - zero[axis], max: travel.max - zero[axis] },
    zone: sharedZone(travel.max - travel.min),
    tolerance: SLIDE_TOLERANCE,
    touch,
  });
  if ('problem' in plan) return plan;
  const programs = splitSections(text, plan, { touch });
  if ('problem' in programs) return programs;
  const name = (source.original?.fileName ?? source.fileName).replace(/\.[^.]*$/, '');
  return {
    name,
    axis,
    plan,
    parts: programs.map((p, i) => ({
      fileName: sectionFileName(name, i, programs.length),
      text: p.text,
      cuts: p.cuts,
      box: p.bounds && {
        minX: p.bounds.min.x,
        minY: p.bounds.min.y,
        maxX: p.bounds.max.x,
        maxY: p.bounds.max.y,
      },
    })),
    slide: plan.shifts[1]!,
    zero: { x: zero.x, y: zero.y },
    toolDiameter,
    source,
  };
}

/** The section a program is, by the name it was made with; −1 for any other program. */
export const sectionOf = (job: Pick<SectionsJob, 'parts'> | null, fileName: string | null) =>
  job ? job.parts.findIndex((p) => p.fileName === fileName) : -1;

/**
 * Where the flow stands: section `index` is to be cut; it is cut and the
 * marks are to be measured; they are measured and the part is to be slid;
 * it is slid and has to be found; all sections are cut.
 */
export type SectionsPhase = 'cut' | 'marks' | 'slide' | 'find' | 'done';

/** A part found again: the X/Y zero that was set for it and how its program was turned. */
export interface Located {
  zero: Point;
  /** How the section's program lies against the section as it was divided */
  pose: Matrix;
}

/**
 * What the flow means for starting the loaded program: the section at hand
 * is `ready`; one that has been cut would be `cutAgain`; a later one waits
 * for those before it (`earlier`); one before the section at hand, or the
 * one just cut once the part is slid, would be cut in the wrong place
 * (`past`, `slid`); and a section whose zero or program was changed after
 * the part was found no longer lies on the part (`moved`).
 */
export type SectionsState = 'ready' | 'cutAgain' | 'earlier' | 'past' | 'slid' | 'moved';

export function sectionsState(
  flow: {
    job: Pick<SectionsJob, 'parts'> | null;
    index: number;
    phase: SectionsPhase;
    located: Located | null;
  },
  fileName: string | null,
  wco: readonly number[] | null,
  /** How the loaded program lies against the job as loaded */
  pose: Matrix,
): { state: SectionsState; n: number; total: number; at: number } | null {
  const loaded = sectionOf(flow.job, fileName);
  if (!flow.job || loaded < 0) return null;
  const { index, phase, located } = flow;
  const state = ((): SectionsState => {
    if (loaded > index) return 'earlier';
    if (loaded < index) return 'past';
    if (phase === 'done' || phase === 'marks') return 'cutAgain';
    if (phase === 'slide' || phase === 'find') return 'slid';
    if (index === 0) return 'ready';
    const sameZero =
      located !== null &&
      (wco === null ||
        Math.hypot((wco[0] ?? 0) - located.zero.x, (wco[1] ?? 0) - located.zero.y) <= 0.005);
    const samePose = (Object.keys(pose) as (keyof Matrix)[]).every(
      (k) => Math.abs(pose[k] - (located?.pose[k] ?? NaN)) < 1e-9,
    );
    return sameZero && samePose ? 'ready' : 'moved';
  })();
  return { state, n: loaded + 1, total: flow.job.parts.length, at: index + 1 };
}

/** Where a mark should lie on the table once the part is slid by `slide` towards the low end of the axis. */
export function expectedMark(cut: PartPose, mark: Point, axis: SectionAxis, slide: number): Point {
  const p = fromJig(cut, mark);
  return axis === 'x' ? { x: p.x - slide, y: p.y } : { x: p.x, y: p.y - slide };
}

/** The four corners of a box. */
const corners = (b: Rect): Point[] => [
  { x: b.minX, y: b.minY },
  { x: b.maxX, y: b.minY },
  { x: b.maxX, y: b.maxY },
  { x: b.minX, y: b.maxY },
];

/** Everything the job cuts, program XY; null when it cuts nothing. */
export function jobBox(job: Pick<SectionsJob, 'parts'>): Rect | null {
  const boxes = job.parts.flatMap((p) => (p.box ? [p.box] : []));
  if (boxes.length === 0) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/**
 * How far the next section reaches from the middle of the marks: the lever
 * of what the marks cannot tell exactly, the direction.
 */
export function nextReach(
  job: Pick<SectionsJob, 'parts'>,
  index: number,
  marks: readonly PartMark[],
): number {
  const box = job.parts[index + 1]?.box;
  return box ? jigReach(marks, corners(box)) : 0;
}

/**
 * Where the register marks may be stuck on, on the table as the part lies
 * (machine XY): along the axis what the camera reaches now and after the
 * slide, across it the width of the job – shrunk so that a mark there lies
 * on the part with all its paper.
 */
export function markBand(
  job: Pick<SectionsJob, 'axis' | 'parts' | 'slide'>,
  cut: PartPose,
  /** What the middle of the camera's picture reaches, machine XY */
  camera: Rect,
): Rect | null {
  const box = jobBox(job);
  const x = job.axis === 'x';
  const zone = markZone(
    x ? { min: camera.minX, max: camera.maxX } : { min: camera.minY, max: camera.maxY },
    job.slide,
    SLIDE_TOLERANCE,
    MARK_PAD,
  );
  if (!box || !zone) return null;
  const onTable = corners(box).map((p) => fromJig(cut, p));
  const across = onTable.map((p) => (x ? p.y : p.x));
  const lo = Math.max(Math.min(...across), x ? camera.minY : camera.minX);
  const hi = Math.min(Math.max(...across), x ? camera.maxY : camera.maxX);
  // A narrow part: the marks go on its middle line.
  const inset = Math.min(MARK_PAD, Math.max(0, (hi - lo) / 2));
  if (hi < lo) return null;
  return x
    ? { minX: zone.min, maxX: zone.max, minY: lo + inset, maxY: hi - inset }
    : { minX: lo + inset, maxX: hi - inset, minY: zone.min, maxY: zone.max };
}

/** Places for the camera's middle so that every point of [min, max] is within `half` of one. */
function stops(min: number, max: number, half: number): number[] {
  const n = Math.max(1, Math.ceil((max - min) / (2 * half)));
  const step = (max - min) / n;
  return Array.from({ length: n }, (_, i) => min + step * (i + 0.5));
}

/**
 * Where the camera stops to look for marks in a band: from every place of
 * the band a mark is wholly in the picture of one stop. To and fro along
 * the slide axis, so the way is short. `view` is what one picture shows, mm.
 */
export function sweepStops(
  band: Rect,
  view: { width: number; height: number },
  axis: SectionAxis,
): Point[] {
  const halfX = Math.max(5, view.width / 2 - MARK_PAD);
  const halfY = Math.max(5, view.height / 2 - MARK_PAD);
  const xs = stops(band.minX, band.maxX, halfX);
  const ys = stops(band.minY, band.maxY, halfY);
  const rows = axis === 'x' ? ys : xs;
  const columns = axis === 'x' ? xs : ys;
  return rows.flatMap((row, i) =>
    (i % 2 ? [...columns].reverse() : columns).map((column) =>
      axis === 'x' ? { x: column, y: row } : { x: row, y: column },
    ),
  );
}

/** The two of `points` that lie farthest apart (one, when there is only one). */
export function farthestPair<T extends Point>(points: readonly T[]): T[] {
  let best: T[] = points.slice(0, 1);
  let far = -1;
  for (const [i, a] of points.entries()) {
    for (const b of points.slice(i + 1)) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > far) {
        far = d;
        best = [a, b];
      }
    }
  }
  return best;
}

/** Why measuring or finding the marks did not work. */
export type SectionsTrouble =
  /** Looked all over the band: no mark there */
  | { kind: 'noMarks' }
  /** One mark only, and no fence to hold the direction */
  | { kind: 'oneMark'; tag: number }
  /** A move failed, the camera is not ready, a mark is not where it should be … (as for jigs) */
  | { kind: 'tag'; trouble: JigTrouble }
  /** The marks as found do not fit the marks as measured before the slide */
  | { kind: 'fit'; trouble: SlideTrouble }
  /** The zero could not be set */
  | { kind: 'machine' };
