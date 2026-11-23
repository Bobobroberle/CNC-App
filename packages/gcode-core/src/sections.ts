import {
  emptyBounds,
  includeSegment,
  isEmptyBounds,
  pointAt,
  programBounds,
  type Bounds,
} from './geometry';
import { interpret, MM_PER_INCH, type LineResult } from './interpreter';
import { parseProgram, type ParsedLine, type Word } from './parser';
import { formatLine } from './repair';
import { formatNumber } from './transform';
import type { MotionMode, Segment, Vec4 } from './types';

/**
 * Parts longer than the table, cut in sections: the part is cut as far as
 * the machine reaches, slid along one axis, found again and cut further.
 * This module is the pure part of it – where the sections lie along the
 * slide axis and what each of them cuts:
 *
 * - Cuts that touch each other are one feature (a pocket with its finishing
 *   pass, a contour with all its depth passes). A feature that fits the
 *   reach of one section is cut there whole, in the order the program has
 *   it; so a drill hole, a letter or a small pocket is never divided, and
 *   nothing is finished before it was roughed.
 * - A feature too long for one section is divided at the seam: the cut ends
 *   there, the tool is lifted, and the next section enters at the same place
 *   at the same depth, pass by pass. The later section starts `overlap`
 *   before the seam, in the slot that is already cut: a part found a few
 *   tenths off then still leaves no web standing, and the plunge goes into
 *   air. The seam is put where it divides as few cuts as possible and never
 *   through a tab.
 * - Each section is a program of its own. It follows the original move for
 *   move while that stays inside its part; everything else it does itself:
 *   up to the program's own highest Z, across at that height, down at the
 *   program's own slowest plunge feed. It never moves at rapid below that
 *   height unless the original does so at that very place.
 */

export type SectionAxis = 'x' | 'y';

/** A stretch along the slide axis, program coordinates, mm. */
export interface SectionWindow {
  min: number;
  max: number;
}

export interface SectionSeam {
  /** Where cuts too long for one section are divided */
  at: number;
  /** How many cutting moves it divides (every depth pass counts) */
  cuts: number;
}

export interface SectionPlan {
  axis: SectionAxis;
  /** What each section may cut; neighbours overlap */
  windows: SectionWindow[];
  /** How far the part has been slid in all before each section, mm (0 for the first) */
  shifts: number[];
  /** One seam between each two neighbours */
  seams: SectionSeam[];
  /** A later section reaches back over the seam by this, mm */
  overlap: number;
}

/** What a program uses that cannot be divided (stable codes; the UI has the words). */
export type SectionObstacle =
  | 'errors'
  | 'G91'
  | 'G93'
  | 'absolute-arcs'
  | 'G18'
  | 'offsets'
  | 'probe'
  | 'wcs'
  | 'rotary'
  | 'no-z';

/**
 * Why there are no sections: the program uses something that cannot be
 * divided, it cuts nothing, it fits the travel as it lies, its beginning is
 * out of reach, the travel is too short to slide a part along, a seam would
 * have to go through a tab, or the plan does not fit the program (`outside`).
 */
export type SectionProblem =
  | { problem: 'unsupported'; what: SectionObstacle }
  | { problem: 'empty' | 'fits' | 'start-outside' | 'travel' | 'no-seam' | 'outside' };

export interface SectionOptions {
  axis: SectionAxis;
  /** What the tool reaches along the axis as the part lies for the first section */
  reach: SectionWindow;
  /** Stretch that two neighbouring placements must share (for the register marks), mm */
  zone: number;
  /** How exactly the part is slid by hand, ± mm */
  tolerance: number;
  /** A later section reaches back over the seam by this, mm (default 1) */
  overlap?: number;
  /** Cuts closer to each other than this are one feature: the cutter's diameter, mm (default 6) */
  touch?: number;
}

export interface SectionProgram {
  text: string;
  /** Pieces of cut it makes */
  cuts: number;
  /** What it cuts; null when it cuts nothing */
  bounds: Bounds | null;
}

/** The later section reaches back over the seam by this, mm */
export const SEAM_OVERLAP = 1;
const DEFAULT_TOUCH = 6;
/** A seam through a plunge or a ramp counts like this many divided level cuts */
const RAMP_COST = 25;
const EPS = 1e-6;

const code = (w: Word) => (w.letter === 'G' ? Math.round(w.value * 10) : -1);
const isCut = (s: Segment) => s.motion !== 'rapid' && !s.machineCoordinates;
const within = (w: SectionWindow, v: number) => v >= w.min - EPS && v <= w.max + EPS;

const MOTION: Record<number, MotionMode> = { 0: 'G0', 10: 'G1', 20: 'G2', 30: 'G3', 800: 'G80' };

/** The motion word of a line, if it has one. */
function motionWord(words: readonly Word[]): MotionMode | undefined {
  for (const w of words) {
    const mode = MOTION[code(w)];
    if (mode) return mode;
  }
  return undefined;
}

/** Consecutive cuts without a move across the table between them: a plunge, all passes, the lifts over tabs. */
interface Run {
  first: number;
  last: number;
  /** Feature it belongs to */
  group: number;
}

interface Analysis {
  parsed: ParsedLine[];
  lines: LineResult[];
  segments: Segment[];
  /** The move a line makes, by line index */
  byLine: Map<number, Segment>;
  runs: Run[];
  /** Run of each move; −1 for moves between the cuts */
  runOf: number[];
  /** What each feature covers along the axis */
  groups: SectionWindow[];
  /** What all cuts cover along the axis */
  extent: SectionWindow;
  /** The program's highest Z: where a section travels */
  safeZ: number;
  /** The program's slowest plunge, mm/min */
  plunge: number;
  trailingNewline: boolean;
}

/** What a move covers along the axis (arcs with their extremes). */
function span(s: Segment, axis: SectionAxis): SectionWindow {
  const b = emptyBounds();
  includeSegment(b, s);
  return { min: b.min[axis], max: b.max[axis] };
}

/** What stands in the way of dividing the program, if anything. */
function obstacle(
  parsed: readonly ParsedLine[],
  lines: readonly LineResult[],
  byLine: Map<number, Segment>,
): SectionObstacle | null {
  for (const [i, line] of parsed.entries()) {
    const codes = line.words.map(code);
    const info = lines[i]!;
    if (codes.some((c) => c >= 382 && c <= 385)) return 'probe';
    if (codes.some((c) => c >= 550 && c <= 590)) return 'wcs';
    if (codes.includes(930)) return 'G93';
    if (codes.includes(901)) return 'absolute-arcs';
    if (info.axisUse === 'offset') return 'offsets';
    const s = byLine.get(i);
    if (!s) continue;
    const incremental =
      codes.includes(910) || (info.stateBefore.distance === 'incremental' && !codes.includes(900));
    if (incremental) return 'G91';
    if (s.arc && s.arc.plane !== 'XY') return 'G18';
    if (s.from.a !== s.to.a) return 'rotary';
  }
  return null;
}

/**
 * Which runs belong to one feature: those whose paths come closer to each
 * other than `touch`. Points along every cut are sorted into a raster of
 * cells twice that wide; two runs with points in the same or neighbouring
 * cells are joined (a little generous, never too strict).
 */
function groupRuns(segments: readonly Segment[], runs: readonly Run[], touch: number): number[] {
  const cell = 2 * touch;
  const step = touch / 2;
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const owner = new Map<string, number>();
  runs.forEach((run, r) => {
    let last = '';
    for (let i = run.first; i <= run.last; i++) {
      const s = segments[i]!;
      const n = Math.max(1, Math.ceil(s.length / step));
      for (let j = 0; j <= n; j++) {
        const p = pointAt(s, j / n);
        const cx = Math.floor(p.x / cell);
        const cy = Math.floor(p.y / cell);
        const key = `${cx},${cy}`;
        if (key === last) continue;
        last = key;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const other = owner.get(`${cx + dx},${cy + dy}`);
            if (other !== undefined) parent[find(other)] = find(r);
          }
        }
        owner.set(key, r);
      }
    }
  });
  return runs.map((_, r) => find(r));
}

function analyse(text: string, axis: SectionAxis, touch: number): Analysis | SectionProblem {
  const parsed = parseProgram(text);
  const result = interpret(parsed, { recordLines: true });
  if (result.diagnostics.some((d) => d.severity === 'error')) {
    return { problem: 'unsupported', what: 'errors' };
  }
  const { segments } = result;
  const byLine = new Map(segments.map((s) => [s.lineIndex, s]));
  const what = obstacle(parsed, result.lines, byLine);
  if (what) return { problem: 'unsupported', what };

  const has = (s: Segment, letter: string) =>
    parsed[s.lineIndex]!.words.some((w) => w.letter === letter);
  // A lift or a plunge at rapid on the spot (Estlcam lifts over tabs so) does not end a run.
  const onTheSpot = (s: Segment) =>
    s.motion === 'rapid' && !s.machineCoordinates && !has(s, 'X') && !has(s, 'Y');
  const runs: Run[] = [];
  const runOf = segments.map(() => -1);
  let first = -1;
  let last = -1;
  const close = () => {
    if (first < 0) return;
    for (let i = first; i <= last; i++) runOf[i] = runs.length;
    runs.push({ first, last, group: 0 });
    first = -1;
  };
  for (const [i, s] of segments.entries()) {
    if (isCut(s)) {
      // Another cutter is another feature.
      if (first >= 0 && s.tool !== segments[last]!.tool) close();
      if (first < 0) first = i;
      last = i;
    } else if (!onTheSpot(s)) close();
  }
  close();
  if (runs.length === 0) return { problem: 'empty' };

  const cuts = segments.filter(isCut);
  // Where the program itself travels: the highest Z it names.
  const least = (values: number[]) => values.reduce((m, v) => Math.min(m, v), Infinity);
  const safeZ = -least(
    segments.filter((s) => !s.machineCoordinates && has(s, 'Z')).map((s) => -s.to.z),
  );
  if (!(safeZ > least(cuts.map((s) => Math.min(s.from.z, s.to.z))) + EPS)) {
    return { problem: 'unsupported', what: 'no-z' };
  }
  const plunges = cuts.filter((s) => s.to.z < s.from.z - EPS);
  const plunge = least((plunges.length > 0 ? plunges : cuts).map((s) => s.feed));

  const roots = groupRuns(segments, runs, Math.max(1, touch));
  const index = new Map<number, number>();
  const groups: SectionWindow[] = [];
  runs.forEach((run, r) => {
    const root = roots[r]!;
    if (!index.has(root)) {
      index.set(root, groups.length);
      groups.push({ min: Infinity, max: -Infinity });
    }
    run.group = index.get(root)!;
    const g = groups[run.group]!;
    for (let i = run.first; i <= run.last; i++) {
      const w = span(segments[i]!, axis);
      g.min = Math.min(g.min, w.min);
      g.max = Math.max(g.max, w.max);
    }
  });
  return {
    parsed,
    lines: result.lines,
    segments,
    byLine,
    runs,
    runOf,
    groups,
    extent: {
      min: least(groups.map((g) => g.min)),
      max: -least(groups.map((g) => -g.max)),
    },
    safeZ,
    plunge,
    trailingNewline: /\r?\n$/.test(text),
  };
}

/** The section that cuts a feature whole: the first whose reach holds all of it; −1 when none does. */
const wholeIn = (group: SectionWindow, windows: readonly SectionWindow[]) =>
  windows.findIndex((w) => within(w, group.min) && within(w, group.max));

/** Where on a move (0…1, ends excluded) it crosses `at` along the axis. */
function crossings(s: Segment, axis: SectionAxis, at: number): number[] {
  const inside = (t: number) => t > 1e-9 && t < 1 - 1e-9;
  const { arc } = s;
  if (!arc) {
    const a = s.from[axis];
    const b = s.to[axis];
    const t = (at - a) / (b - a);
    return (a - at) * (b - at) < 0 && inside(t) ? [t] : [];
  }
  const k = (at - arc.center[axis === 'x' ? 0 : 1]) / arc.radius;
  // Touching the line is not crossing it.
  if (Math.abs(k) >= 1) return [];
  const angles =
    axis === 'x' ? [Math.acos(k), -Math.acos(k)] : [Math.asin(k), Math.PI - Math.asin(k)];
  const turn = (2 * Math.PI) / Math.abs(arc.sweep);
  return angles
    .map((angle) => {
      const t = (angle - arc.startAngle) / arc.sweep;
      return t - Math.floor(t / turn) * turn;
    })
    .filter(inside)
    .sort((a, b) => a - b);
}

/** A piece of a move, from parameter to parameter. */
type Piece = [number, number];

/**
 * A move of a feature too long for one section, divided at the seams: what
 * each section cuts of it. Section k cuts from `overlap` before its lower
 * seam up to its upper seam; a move on a seam belongs to the lower section.
 */
function divide(s: Segment, plan: SectionPlan): Piece[][] {
  const { axis, seams, overlap } = plan;
  const stops = new Set([0, 1]);
  for (const seam of seams) {
    for (const at of [seam.at, seam.at - overlap]) {
      for (const t of crossings(s, axis, at)) stops.add(t);
    }
  }
  const ts = [...stops].sort((a, b) => a - b);
  const out: Piece[][] = plan.windows.map(() => []);
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!;
    const t1 = ts[i + 1]!;
    const c = pointAt(s, (t0 + t1) / 2)[axis];
    out.forEach((pieces, k) => {
      const lower = k === 0 ? -Infinity : seams[k - 1]!.at - overlap;
      const upper = k === seams.length ? Infinity : seams[k]!.at;
      if (c <= lower || c > upper) return;
      const before = pieces[pieces.length - 1];
      if (before && before[1] === t0) before[1] = t1;
      else pieces.push([t0, t1]);
    });
  }
  return out;
}

/**
 * How a seam may meet each move of a run: a `level` cut can be divided, a
 * plunge or a ramp (`ramp`) better not, a tab – the rise onto it, its top
 * and the way down again – never. A run that goes up and down most of its
 * way (a relief, a contour ramped down all around) has no tabs to tell
 * apart: a seam may divide it anywhere.
 */
function seamKinds(a: Analysis, run: Run): ('level' | 'ramp' | 'tab')[] {
  const moves = a.segments.slice(run.first, run.last + 1);
  const sloped = (s: Segment) => Math.abs(s.to.z - s.from.z) > EPS;
  const length = (list: Segment[]) => list.reduce((sum, s) => sum + s.length, 0);
  if (length(moves.filter(sloped)) > 0.25 * length(moves)) return moves.map(() => 'level');
  const air = moves[0]!.from.z;
  let raised = false;
  return moves.map((s) => {
    const dz = s.to.z - s.from.z;
    if (dz > EPS) {
      raised = true;
      return 'tab';
    }
    if (dz < -EPS) {
      const kind = raised ? 'tab' : 'ramp';
      raised = false;
      return kind;
    }
    return raised && s.to.z < air - EPS ? 'tab' : 'level';
  });
}

/**
 * Where the sections lie: as few as the travel allows, all slid by the same
 * amount (a round number), and each seam where it divides least.
 */
export function planSections(text: string, o: SectionOptions): SectionPlan | SectionProblem {
  const a = analyse(text, o.axis, o.touch ?? DEFAULT_TOUCH);
  if ('problem' in a) return a;
  const overlap = o.overlap ?? SEAM_OVERLAP;
  const { axis, reach, tolerance } = o;
  const travel = reach.max - reach.min;
  if (a.extent.min < reach.min - EPS) return { problem: 'start-outside' };
  if (a.extent.max <= reach.max + EPS) return { problem: 'fits' };
  // The most the part can be slid at once: the marks must be in reach before and after.
  const step = travel - o.zone - tolerance;
  if (step < 10 || o.zone <= tolerance + overlap) return { problem: 'travel' };
  const need = a.extent.max - reach.max + tolerance;
  const slides = Math.ceil(need / step);
  const slide = Math.min(step, Math.ceil(need / slides / 10) * 10);
  const shifts = Array.from({ length: slides + 1 }, (_, k) => k * slide);
  // After a slide the part lies within `tolerance` of where it should: reach is counted short by that.
  const windows = shifts.map((shift, k) =>
    k === 0
      ? { ...reach }
      : { min: reach.min + shift + tolerance, max: reach.max + shift - tolerance },
  );

  // Only features too long for one section meet a seam.
  const long: { s: Segment; kind: 'level' | 'ramp' | 'tab'; span: SectionWindow }[] = [];
  for (const run of a.runs) {
    if (wholeIn(a.groups[run.group]!, windows) >= 0) continue;
    const kinds = seamKinds(a, run);
    for (let i = run.first; i <= run.last; i++) {
      const s = a.segments[i]!;
      long.push({ s, kind: kinds[i - run.first]!, span: span(s, axis) });
    }
  }
  const margin = overlap + 1;
  const cost = (at: number) => {
    let sum = 0;
    for (const m of long) {
      const near = at > m.span.min - margin && at < m.span.max + margin;
      if (m.kind === 'tab' && near) return Infinity;
      if (m.kind === 'ramp') sum += near ? RAMP_COST : 0;
      // A level cut that is divided, or that ends in the stretch both sections cut.
      else if (m.span.min <= at && m.span.max > at - overlap) {
        sum += Math.max(1, crossings(m.s, axis, at).length);
      }
    }
    return sum;
  };
  const seams: SectionSeam[] = [];
  for (let k = 0; k < slides; k++) {
    const lo = windows[k + 1]!.min + overlap;
    const hi = windows[k]!.max;
    // A whole millimetre in the middle first, then outwards: of equally good places the most central.
    const middle = Math.round((lo + hi) / 2);
    let best = { at: middle, cost: cost(middle) };
    for (let d = 1; middle - d >= lo && best.cost > 0; d++) {
      for (const at of [middle - d, middle + d]) {
        // Never beyond what the earlier section reaches (the middle was rounded).
        const c = at <= hi ? cost(at) : Infinity;
        if (c < best.cost) best = { at, cost: c };
      }
    }
    if (best.cost === Infinity) return { problem: 'no-seam' };
    const { at } = best;
    seams.push({
      at,
      cuts: long.reduce((n, m) => n + crossings(m.s, axis, at).length, 0),
    });
  }
  return { axis, windows, shifts, seams, overlap };
}

/** What a section program is doing while it is written. */
interface Out {
  lines: string[];
  /** It stands where the original program stands before the line at hand */
  synced: boolean;
  /** Its height, work Z; null when not known (start, after a G53 or G28 lift) */
  z: number | null;
  motion: MotionMode | null;
  /** Its feed is the plunge feed of an entry, not the program's */
  slow: boolean;
  cuts: number;
}

/**
 * The programs of the sections of a plan. Lines that do not move are in all
 * of them, so every section has the program's modes, spindle and tool
 * changes; of the moves each has its own.
 */
export function splitSections(
  text: string,
  plan: SectionPlan,
  options: { touch?: number; plungeFeed?: number } = {},
): SectionProgram[] | SectionProblem {
  const a = analyse(text, plan.axis, options.touch ?? DEFAULT_TOUCH);
  if ('problem' in a) return a;
  const { axis, windows } = plan;
  const { segments, safeZ } = a;
  const plunge = options.plungeFeed ?? a.plunge;

  // What each section cuts of every cutting move.
  const whole = a.groups.map((g) => wholeIn(g, windows));
  const own = new Map<number, Piece[][]>();
  for (const s of segments) {
    if (!isCut(s)) continue;
    const w = whole[a.runs[a.runOf[s.index]!]!.group]!;
    own.set(s.index, w < 0 ? divide(s, plan) : windows.map((_, k) => (k === w ? [[0, 1]] : [])));
  }
  // The next cutting move from each move on: a move across the table is worth following only for it.
  const nextCut = segments.map(() => -1);
  for (let i = segments.length - 1, next = -1; i >= 0; i--) {
    if (isCut(segments[i]!)) next = i;
    nextCut[i] = next;
  }
  const leadsToCut = (s: Segment, k: number) => {
    const first = own.get(nextCut[s.index]!)?.[k]?.[0];
    return first !== undefined && first[0] === 0;
  };

  const AXIS = axis.toUpperCase();
  const outs: Out[] = windows.map((w, k) => ({
    lines: [
      `(LowRider Control: section ${k + 1} of ${windows.length}, ${AXIS} ${formatNumber(w.min)} to ${formatNumber(w.max)})`,
    ],
    synced: true,
    z: null,
    motion: null,
    slow: false,
    cuts: 0,
  }));
  /** The original program's Z is a work height (not after a G53 or G28 lift) */
  let zKnown = false;

  for (const [i, line] of a.parsed.entries()) {
    const info = a.lines[i]!;
    const s = a.byLine.get(i);
    const explicit = motionWord(line.words);
    const codes = line.words.map(code);
    if (!s) {
      const parks = codes.includes(280) || codes.includes(300);
      for (const o of outs) {
        o.lines.push(line.raw);
        if (explicit) o.motion = explicit;
        if (parks) o.z = null;
      }
      if (parks) zKnown = false;
      continue;
    }

    const inch = codes.includes(200) || (info.stateBefore.units === 'inch' && !codes.includes(210));
    const n = (mm: number) => formatNumber(inch ? mm / MM_PER_INCH : mm, inch ? 'inch' : 'mm');
    const has = (letter: string) => line.words.some((w) => w.letter === letter);
    const mode = explicit ?? info.stateBefore.motion;
    const cutting = isCut(s);
    // The line without its move: modes, feed, spindle and tool stay in every section.
    const others = line.words.filter(
      (w) => !'XYZAIJKR'.includes(w.letter) && !(w.letter === 'G' && code(w) <= 30),
    );
    const rest = (o: Out) => {
      if (others.length > 0) o.lines.push(formatLine(line, others));
    };
    const lift = (o: Out) => {
      if (o.z === safeZ) return;
      o.lines.push(`G0 Z${n(safeZ)}`);
      o.z = safeZ;
      o.motion = 'G0';
    };
    const leave = (o: Out) => {
      if (!o.synced) return;
      lift(o);
      o.synced = false;
    };
    /** Across at the travel height, then down at the plunge feed. */
    const enter = (o: Out, p: Vec4, down: boolean) => {
      lift(o);
      o.lines.push(`G0 X${n(p.x)} Y${n(p.y)}`);
      if (down && p.z < safeZ) {
        o.lines.push(`G1 Z${n(p.z)} F${n(plunge)}`);
        o.z = p.z;
        o.motion = 'G1';
        o.slow = true;
      }
    };
    /** The line as it is, with what the section does not have from the lines before it. */
    const asIs = (o: Out) => {
      const needMotion = explicit === undefined && o.motion !== mode;
      const needFeed = cutting && o.slow && !has('F');
      o.lines.push(
        needMotion || needFeed
          ? formatLine(line, [
              ...(needMotion ? [{ letter: 'G', value: Number(mode.slice(1)) }] : []),
              ...line.words,
              ...(needFeed ? [{ letter: 'F', value: Number(n(s.feed)) }] : []),
            ])
          : line.raw,
      );
      o.motion = mode;
      if (cutting) o.slow = false;
      if (has('Z')) o.z = s.to.z;
    };
    /** A piece of a cutting move, written out in full. */
    const piece = (o: Out, t0: number, t1: number) => {
      const { arc } = s;
      // Never more than half a turn in one: an arc whose ends meet would be read as a full circle.
      if (arc && Math.abs(arc.sweep) * (t1 - t0) > Math.PI) {
        piece(o, t0, (t0 + t1) / 2);
        piece(o, (t0 + t1) / 2, t1);
        return;
      }
      const p = pointAt(s, t0);
      const q = pointAt(s, t1);
      const to = `X${n(q.x)} Y${n(q.y)} Z${n(q.z)}`;
      // A piece of arc too short to tell its ends apart is a straight line.
      if (arc && (n(p.x) !== n(q.x) || n(p.y) !== n(q.y))) {
        o.motion = arc.sweep > 0 ? 'G3' : 'G2';
        o.lines.push(
          `${o.motion} ${to} I${n(arc.center[0] - p.x)} J${n(arc.center[1] - p.y)} F${n(s.feed)}`,
        );
      } else {
        o.motion = 'G1';
        o.lines.push(`G1 ${to} F${n(s.feed)}`);
      }
      o.slow = false;
      o.z = q.z;
    };

    if (s.machineCoordinates) {
      for (const o of outs) {
        asIs(o);
        if (has('Z')) o.z = null;
      }
      if (has('Z')) zKnown = false;
      continue;
    }
    if (has('Z')) zKnown = true;

    if (!cutting) {
      const across = has('X') || has('Y');
      outs.forEach((o, k) => {
        const wanted = !across || (within(windows[k]!, s.to[axis]) && leadsToCut(s, k));
        if (o.synced && wanted) asIs(o);
        else if (across && wanted) {
          // Back to where the original program is: from here on move for move again.
          rest(o);
          enter(o, s.to, zKnown);
          o.synced = true;
        } else {
          leave(o);
          rest(o);
        }
      });
      continue;
    }

    outs.forEach((o, k) => {
      const mine = own.get(s.index)![k]!;
      if (mine.length === 0) {
        leave(o);
        rest(o);
        return;
      }
      o.cuts += mine.length;
      if (mine[0]![0] === 0 && mine[0]![1] === 1) {
        if (!o.synced) enter(o, s.from, true);
        asIs(o);
        o.synced = true;
        return;
      }
      rest(o);
      for (const [t0, t1] of mine) {
        if (!o.synced || t0 > 0) enter(o, pointAt(s, t0), true);
        piece(o, t0, t1);
        o.synced = t1 === 1;
        // The cut ends at the seam: up, before anything else happens.
        if (!o.synced) lift(o);
      }
    });
  }

  const programs: SectionProgram[] = [];
  for (const [k, o] of outs.entries()) {
    const sectionText = o.lines.join('\n') + (a.trailingNewline ? '\n' : '');
    const bounds = programBounds(interpret(sectionText).segments, { includeRapids: false });
    const empty = isEmptyBounds(bounds);
    // Nothing is cut outside the section's reach (to the ten-thousandth the numbers are written with).
    if (
      !empty &&
      (bounds.min[axis] < windows[k]!.min - 1e-3 || bounds.max[axis] > windows[k]!.max + 1e-3)
    ) {
      return { problem: 'outside' };
    }
    programs.push({ text: sectionText, cuts: o.cuts, bounds: empty ? null : bounds });
  }
  return programs;
}
