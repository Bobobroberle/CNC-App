import {
  bounds,
  distance,
  pointInPolygon,
  signedArea,
  type Bounds,
  type Contour,
  type Point,
} from './geometry';
import { offsetPolygons, region } from './offset';
import { reliefCorners, type Relief, type ReliefCorner } from './relief';
import { improve, overridden, rapidLength, type RouteTask } from './route';

export { rapidLength } from './route';

/**
 * What happens to a contour, after Estlcam's choices. `on` engraves: the
 * tool centre follows the line itself (text, V-bit lines, marking).
 */
export type OperationKind = 'outside' | 'inside' | 'on' | 'pocket' | 'drill' | 'none';

export interface Tabs {
  /** How many are spread evenly along a contour (ignored where `at` names the places) */
  count: number;
  /** Width on the part, mm: the material that is left, not the stretch the cutter lifts over */
  width: number;
  /** Height above the bottom of the cut, mm */
  height: number;
  /**
   * Where the tabs stand, by hand: fractions 0 ≤ u < 1 of the drawn contour's length from its
   * first point, in the order of its points – so a place names the same spot of the part whatever
   * is done to the drawing (moved, turned, mirrored, cut from the back). Absent: `count` tabs,
   * evenly spread. An empty list: no tabs at all.
   */
  at?: readonly number[];
  /**
   * Off by default. Keeps the tabs of the even spread off the corners: a tab that would lift the cutter
   * over a corner (the lifted stretch, `width` + the cutter's diameter, would not stay on one straight run)
   * moves along the contour to the nearest place where it does. Only the even spread (`count`) is moved:
   * places given by `at` are the operator's word and stay. A *corner* is a vertex of the drawn line that
   * turns by 20° or more (the start of the line counts like any other vertex); a vertex that turns less is
   * one chord of a curve, and an exact circle (`Contour.circle`) has no corner at all, however coarse its
   * chords. Where no stretch between two corners is long enough for a tab (a small part), nothing moves.
   * The stretch is measured along the cutter's loop, not the drawn line: where the loop has a sharp corner
   * (an inside cut at the corners of the part, an outline at its notches) its straight run ends short of the
   * drawn corner by the cutter's radius × tan(turn / 2), and that much more is kept clear. The finishing
   * allowance is not counted (roughing with an allowance may reach a fraction of a millimetre round such a
   * corner). The places depend on the cutter's diameter and on the kind of cut, so the drawing of the tabs must
   * ask `operationTabSites` – the function the cut itself asks – with the operation the cut uses, or the drawing
   * and the cut disagree. (`tabSites` alone takes both as 0 and `'on'` when they are left out.)
   */
  avoidCorners?: boolean;
}

/** One place where a contour keeps a tab: how far along it (0 ≤ u < 1), the point, the way the line runs there. */
export interface TabSite {
  u: number;
  point: Point;
  /** Unit vector along the contour, in the order of its points */
  tangent: Point;
}

export interface CutSettings {
  toolDiameter: number;
  /** Depth below the surface (Z0), positive, mm */
  depth: number;
  /** Depth per pass, mm */
  stepdown: number;
  /** Pocket and helix stepover as a fraction of the tool diameter */
  stepover: number;
  feed: number;
  plungeFeed: number;
  /** Ramp angle in degrees for entering the material; 90 plunges straight */
  rampAngle: number;
  /** Clearance above the surface for rapid moves, mm */
  safeZ: number;
  /** Climb milling (material left of the cutter with a clockwise spindle) */
  climb: boolean;
  /**
   * Finishing allowance, mm: contours and pocket walls are roughed this far
   * from the line and then finished in one pass at full depth. 0 or absent: none.
   */
  allowance?: number;
}

export interface Operation {
  contour: number;
  kind: OperationKind;
  /** Overrides the job depth for this contour */
  depth?: number;
  tabs?: Tabs;
  /** Frees the inside corners of a contour or pocket so a square part fits */
  relief?: Relief;
  /**
   * Climb (true) or conventional (false) milling for this contour; absent takes the job's
   * `climb`. Cuts that have no direction (a straight plunge, an engraved open line) ignore it.
   */
  climb?: boolean;
  /**
   * How the cutter enters a pocket (other kinds are entered along their line and ignore it). Absent or
   * `'ramp'`: as always, down along the first ring by the job's `rampAngle`.
   * - `'helix'`: on a helix, in every pass, at the start of the first ring (the one that is cut into
   *   uncut material). The helix bores a hole `helixDiameter` wide (the cutter's path is that minus the
   *   cutter's diameter), descends by the job's `rampAngle` (at most one turn per `stepdown`) and ends in
   *   a flat full turn; then the cutter goes to the middle and once round the ring. The hole, with the
   *   finishing allowance, must lie inside the pocket and outside its islands – else the pocket is
   *   entered by ramp and the problem `helix-too-big` says so. A pocket whose clearing falls into
   *   several separate areas gets the helix in the first only; the others are entered by ramp.
   * - `'plunge'`: straight down at the start point of the first ring, at the plunge feed, in every
   *   pass. Risk: the whole width of the cutter goes into uncut material – only for a cutter that cuts
   *   at its centre, and slowly (`plungeFeed`); the job's ramp is not used for that ring.
   */
  entry?: 'ramp' | 'helix' | 'plunge';
  /**
   * The width of the hole a `'helix'` entry bores, mm (not the cutter's path: that is this minus the
   * cutter's diameter). Absent: 1.5 × the cutter. Never below the cutter's diameter + `HELIX_CLEARANCE`
   * and never above twice the cutter (a wider hole would leave a post in the middle); a value that is no
   * number or not above 0 is the same as absent.
   */
  helixDiameter?: number;
  /**
   * Peck drilling, mm: a `drill` of a hole that fits the cutter goes down in steps of this size and
   * comes up between them, the last step ending exactly at the depth. Absent: the straight drill as
   * always. Only holes that fit the cutter are pecked: a circle larger than the cutter is bored in a
   * helix (the milling clears its own chips), and other kinds are not drilled at all – asking for a
   * peck there, or for one below `MIN_PECK` or that is no number, cuts the contour as it would be
   * cut without and says `peck-not-possible`.
   */
  peck?: number;
  /**
   * Only with `peck`, mm. Absent: after every step the cutter comes up to the clearance plane (`safeZ`)
   * and goes down again at rapid to `PECK_REENTRY` above the depth reached – inside its own hole, so
   * never into uncut material. A number: chip breaking – the cutter comes up that far above the depth
   * reached (never above `safeZ`) and goes on at the plunge feed. A value that is no number or not
   * above 0 is a wrong peck (`peck-not-possible`).
   */
  peckRetract?: number;
  /**
   * Where the operator wants this operation among the operations of its rank (holes, pockets, …):
   * those with a number come first, lowest number first (equal numbers: as the route goes), then those
   * without, by route. The rank order never changes, and neither does cutting what lies inside a
   * contour before the contour: where a number would break that, the operation comes later and the
   * problem `order-overridden` says so. A value that is no number is the same as absent.
   */
  seq?: number;
}

/** A move in work coordinates; `feed` null means rapid. */
export interface Move {
  x?: number;
  y?: number;
  z?: number;
  feed: number | null;
  /** Arc: clockwise or not, centre offset from the start */
  arc?: { cw: boolean; i: number; j: number };
}

/**
 * What could not be cut as asked. `tool-too-large`, `open-contour` and `hole-too-small` mean the
 * contour is not cut. The others mean it is cut, but differently: `helix-too-big` (entered by ramp),
 * `peck-not-possible` (without a peck), `order-overridden` (later than wished).
 */
export interface Problem {
  /** The index in the list of contours given to `toolpaths` (not in the list of operations: `CutSpan.op` is that) */
  contour: number;
  code:
    | 'tool-too-large'
    | 'open-contour'
    | 'hole-too-small'
    | 'helix-too-big'
    | 'peck-not-possible'
    | 'order-overridden';
}

/**
 * What a problem means for the contour it names: `'not-cut'` – nothing is cut of it – or `'cut-differently'` – it
 * is cut, but not as asked. One entry for every code, so that a code added to `Problem` cannot be left out
 * (the compiler says so): whoever shows the problems shows the second kind as a warning and the first as a
 * contour that is missing from the program.
 */
export const PROBLEM_EFFECT: Readonly<Record<Problem['code'], 'not-cut' | 'cut-differently'>> = {
  'tool-too-large': 'not-cut',
  'open-contour': 'not-cut',
  'hole-too-small': 'not-cut',
  'helix-too-big': 'cut-differently',
  'peck-not-possible': 'cut-differently',
  'order-overridden': 'cut-differently',
};

const ccw = (p: readonly Point[]) => (signedArea(p) >= 0 ? [...p] : [...p].reverse());
const cw = (p: readonly Point[]) => [...ccw(p)].reverse();

/** Depths of the passes: equal steps no deeper than `stepdown`. */
export function passDepths(depth: number, stepdown: number): number[] {
  const n = Math.max(1, Math.ceil(depth / stepdown - 1e-9));
  return Array.from({ length: n }, (_, k) => (-depth * (k + 1)) / n);
}

/** Rotates a closed loop so it starts at the vertex nearest to `from`. */
function startNear(loop: Point[], from: Point): Point[] {
  let best = 0;
  loop.forEach((p, i) => {
    if (distance(p, from) < distance(loop[best]!, from)) best = i;
  });
  return [...loop.slice(best), ...loop.slice(0, best)];
}

/**
 * A closed loop by its length: the way along it to each vertex, the segment and the point at a way,
 * the place nearest to a point. A point drawn twice makes a segment of no length: every search steps over it.
 */
function measure(loop: readonly Point[]) {
  const n = loop.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1]! + distance(loop[i - 1]!, loop[i % n]!));
  /** The segment (from vertex i to the next) a way along the loop lies on */
  const segmentAt = (sm: number): number => {
    let i = 0;
    while (i < n - 1 && cum[i + 1]! <= sm) i++;
    return i;
  };
  const pointAt = (sm: number): Point => {
    const i = segmentAt(sm);
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    // Never a zero-length segment: the search above steps over them.
    const t = (sm - cum[i]!) / (cum[i + 1]! - cum[i]!);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const closest = (p: Point): { s: number; point: Point; distance: number } => {
    let best = { s: 0, point: loop[0]!, distance: Infinity };
    for (let i = 0; i < n; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % n]!;
      const length = cum[i + 1]! - cum[i]!;
      if (length === 0) continue;
      const along = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length;
      const t = Math.max(0, Math.min(length, along));
      const q = { x: a.x + ((b.x - a.x) * t) / length, y: a.y + ((b.y - a.y) * t) / length };
      const d = distance(p, q);
      if (d < best.distance) best = { s: cum[i]! + t, point: q, distance: d };
    }
    return best;
  };
  const nearest = (p: Point): number => closest(p).s;
  return { cum, length: cum[n]!, segmentAt, pointAt, closest, nearest };
}

/**
 * A fraction of a loop, brought into 0 ≤ u < 1: what lies beyond either end comes round, a hair
 * below 0 is the start (not 1), and −0 is 0.
 */
export function wrapUnit(u: number): number {
  const w = u % 1;
  const r = w < 0 ? w + 1 : w;
  return r >= 1 ? 0 : r + 0;
}

/** Two places closer than this (as a fraction of the contour) are one */
const SAME_PLACE = 1e-9;

/** A vertex that turns by this many degrees or more is a corner; one that turns less is a chord of a curve */
const CORNER_TURN = 20;
const CORNER_COS = Math.cos((CORNER_TURN * Math.PI) / 180);
/** Distances along a contour that differ by less than this are equal (mm): float noise */
const WAY_EPS = 1e-9;

/** A corner of a closed contour: where it lies along the line, how the cutter's loop runs round it and on which side */
interface Corner {
  /** The way along the line (mm, from its first point, 0 ≤ way < length) */
  way: number;
  /**
   * tan(turn / 2): where the cutter has a sharp corner in its loop (the inside of the turn), its straight run
   * ends this many radii short of the drawn corner; where the loop goes round the corner on an arc it ends at
   * the drawn corner's own place
   */
  draw: number;
  /** The line turns towards the part's inside here (a corner of the part); else away from it (a notch) */
  convex: boolean;
}

/** The corners of a closed contour in the order of the line: see `cornerWays` */
function findCorners(contour: Contour): Corner[] {
  if (!contour.closed || contour.circle) return [];
  const pts = contour.points;
  const n = pts.length;
  const m = measure(pts);
  if (m.length === 0) return [];
  const counterClockwise = signedArea(pts) >= 0;
  const corners: Corner[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    // The first of a run of equal points stands for it: the one before it is another point
    const before = (i + n - 1) % n;
    if (distance(pts[before]!, p) === 0) continue;
    let after = (i + 1) % n;
    while (distance(pts[after]!, p) === 0) after = (after + 1) % n;
    const a = pts[before]!;
    const b = pts[after]!;
    const l1 = distance(a, p);
    const l2 = distance(p, b);
    const dot = ((p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y)) / (l1 * l2);
    if (dot > CORNER_COS + 1e-12) continue;
    const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
    const cos = Math.max(-1, Math.min(1, dot));
    corners.push({
      way: m.cum[i]! % m.length,
      // A line that turns back on itself: the loop's corner is infinitely far from the drawn one
      draw: Math.sqrt((1 - cos) / (1 + cos)),
      convex: cross > 0 === counterClockwise,
    });
  }
  return corners.sort((x, y) => x.way - y.way);
}

/**
 * The corners of a closed contour, each as the way along the line (mm, from its first point, 0 ≤ way < length) –
 * the vertices where the line turns by 20° or more, the first vertex among them (it is where the line closes).
 * A point drawn twice is one vertex. A vertex that turns less is a chord of a curve, not a corner, and an exact
 * circle (`Contour.circle`) has none whatever its chords. Open lines and lines of no length have none.
 */
export function cornerWays(contour: Contour): number[] {
  return findCorners(contour).map((c) => c.way);
}

/**
 * The places of an even spread (ways along a closed contour of this `length`, ascending) with those that
 * would lift the cutter over a corner moved to the nearest clear place. A place is clear when no corner is
 * nearer along the line than its `reach`. The tab moves along the line only as far as the clear stretch
 * between two corners, keeps its order among the others and stays `gap` from them (so that two lifted
 * stretches never overlap); where it cannot, or where no stretch between two corners is long enough, it
 * stays. Of two equally near places the one earlier along the line is taken. Returns ways, possibly beyond
 * either end of 0…length: a place moved across the start.
 */
function offCorners(
  ways: readonly number[],
  corners: readonly { way: number; reach: number }[],
  length: number,
  gap: number,
): number[] {
  // The clear stretches between corners; the last one runs over the start of the line
  const runs: [number, number][] = [];
  corners.forEach((c, j) => {
    const last = j + 1 === corners.length;
    const next = corners[last ? 0 : j + 1]!;
    const nextWay = last ? next.way + length : next.way;
    if (nextWay - c.way >= c.reach + next.reach - WAY_EPS) {
      runs.push([c.way + c.reach, Math.max(c.way + c.reach, nextWay - next.reach)]);
    }
  });
  const blocked = (way: number) =>
    corners.some(
      (c) => Math.min(Math.abs(way - c.way), length - Math.abs(way - c.way)) < c.reach - WAY_EPS,
    );
  const out = [...ways];
  const n = ways.length;
  ways.forEach((way, k) => {
    if (!blocked(way)) return;
    // Between its neighbours as they are now, `gap` clear of them
    const low = (k === 0 ? out[n - 1]! - length : out[k - 1]!) + gap;
    const high = (k === n - 1 ? out[0]! + length : out[k + 1]!) - gap;
    let best: number | undefined;
    let away = Infinity;
    for (const [a, b] of runs) {
      for (const lap of [-length, 0, length]) {
        const from = Math.max(a + lap, low);
        const to = Math.min(b + lap, high);
        if (from > to) continue;
        const spot = Math.min(Math.max(way, from), to);
        const d = Math.abs(spot - way);
        if (best === undefined || d < away - WAY_EPS || (d <= away + WAY_EPS && spot < best)) {
          best = spot;
          away = d;
        }
      }
    }
    if (best !== undefined) out[k] = best;
  });
  return out;
}

/**
 * Where the tabs of a closed contour stand, in the order of its points: the places `tabs.at` names
 * (wrapped into 0 ≤ u < 1, sorted, places closer than 1e-9 one), else `count` tabs evenly along the
 * drawn line, counted from its first point – each at the middle of its share. Both the toolpath and
 * the drawing of the tabs ask here, so the two agree about the places. The cutter walks a loop beside
 * the drawn line, so it lifts at the nearest place of that loop; where it cannot follow the line (a
 * slot narrower than the cutter) that is a little away from the drawn place, and a hole that falls into
 * several loops keeps each place on the loop nearest to it (`tabsPerLoop`), a loop with none the one
 * nearest to it. An open contour has none (nothing is cut free there), nor has a contour of no length.
 *
 * With `tabs.avoidCorners` the places of the even spread that would lift the cutter over a corner move
 * along the line to the nearest place that does not (see `Tabs.avoidCorners`, `cornerWays`); the result is
 * then in the order of `u` – a tab moved across the start of the line is the last. That needs the width
 * (`tabs.width`), the cutter's diameter and the kind of cut: **pass the diameter and the `kind` the cut
 * uses** – or, better, ask `operationTabSites`, which does so from the operation and is what `toolpaths`
 * itself calls – or the tabs drawn and the tabs cut are not the same. The kind matters
 * because the cutter's loop has a sharp corner on one side of the line (`'inside'`: at the corners of the
 * part; `'outside'`: at its notches), where the straight run is shorter than the drawn side by the cutter's
 * radius × tan(turn / 2), and goes round on an arc on the other; `'on'` (the default) follows the line itself.
 * Without `avoidCorners` none of the three is looked at.
 */
export function tabSites(
  contour: Contour,
  tabs: Pick<Tabs, 'count' | 'at'> & Partial<Pick<Tabs, 'width' | 'avoidCorners'>>,
  toolDiameter = 0,
  kind: OperationKind = 'on',
): TabSite[] {
  if (!contour.closed) return [];
  const m = measure(contour.points);
  if (m.length === 0) return [];
  // Each place as its way along the drawn line and its fraction of it
  let places: { s: number; u: number }[];
  if (tabs.at) {
    const sorted = tabs.at
      .filter(Number.isFinite)
      .map(wrapUnit)
      .sort((a, b) => a - b);
    const apart = sorted.filter((u, i) => i === 0 || u - sorted[i - 1]! >= SAME_PLACE);
    // The last may lie just before the end of the line, the first just behind its start
    if (apart.length > 1 && apart[0]! + 1 - apart[apart.length - 1]! < SAME_PLACE) apart.pop();
    places = apart.map((u) => ({ s: (u * m.length) % m.length, u }));
  } else {
    places = Array.from({ length: tabs.count }, (_, k) => ({
      s: ((k + 0.5) * m.length) / tabs.count,
      u: (k + 0.5) / tabs.count,
    }));
    const found = tabs.avoidCorners ? findCorners(contour) : [];
    if (found.length > 0) {
      const lifted = (tabs.width ?? 0) + toolDiameter;
      const half = Number.isFinite(lifted) ? Math.max(0, lifted) / 2 : 0;
      const radius = Number.isFinite(toolDiameter) ? Math.max(0, toolDiameter) / 2 : 0;
      // The cutter's loop has a sharp corner where the line turns towards the cutter's side: the inside of a
      // part's corner for an inside cut, a notch for an outline. There its straight run is shorter than the
      // drawn side by `radius · tan(turn / 2)`, and that much more must be clear (0 · ∞ is no number: none)
      const corners = found.map((c) => {
        const sharp = kind === 'outside' ? !c.convex : kind === 'inside' ? c.convex : false;
        return { way: c.way, reach: half + (sharp ? radius * c.draw || 0 : 0) };
      });
      const moved = offCorners(
        places.map((p) => p.s),
        corners,
        m.length,
        2 * half,
      );
      // Only a tab that moved is made anew; the others keep their exact place
      places = places
        .map((p, k) => {
          if (moved[k] === p.s) return p;
          // A way beyond either end comes round
          return {
            s: ((moved[k]! % m.length) + m.length) % m.length,
            u: wrapUnit(moved[k]! / m.length),
          };
        })
        .sort((a, b) => a.u - b.u);
    }
  }
  return places.map(({ s, u }) => {
    const i = m.segmentAt(s);
    const a = contour.points[i]!;
    const b = contour.points[(i + 1) % contour.points.length]!;
    const long = m.cum[i + 1]! - m.cum[i]!;
    return {
      u,
      point: m.pointAt(s),
      tangent: { x: (b.x - a.x) / long, y: (b.y - a.y) / long },
    };
  });
}

/**
 * Where the tabs of ONE operation stand on its contour – the places the cut uses, and so the ones the drawing
 * of the tabs must show: `tabSites` with the operation's own tabs, the cutter's diameter and the kind of cut.
 * `toolpaths` calls this for every contour it cuts, so the drawing and the cut cannot disagree about a place
 * as long as the drawing asks with the operation it would cut with. Empty for an operation without `tabs`,
 * an open contour or a contour of no length.
 *
 * ```ts
 * // A plate of 100 × 50, four tabs of 20 mm kept off the corners, a 6 mm cutter. Counted along the line
 * // from its first corner: cutting inside they stand at 37.5, 116, 187.5 and 266 mm (the cutter's loop
 * // has sharp corners there), cutting outside at 37.5, 113, 187.5 and 263.
 * operationTabSites(plate, { kind: 'inside', tabs }, { toolDiameter: 6 });
 * ```
 */
export function operationTabSites(
  contour: Contour,
  op: Pick<Operation, 'tabs' | 'kind'>,
  s: Pick<CutSettings, 'toolDiameter'>,
): TabSite[] {
  return op.tabs ? tabSites(contour, op.tabs, s.toolDiameter, op.kind) : [];
}

/**
 * Where the tabs of a contour stand when they are spread evenly: the points of `tabSites`.
 * Kept for what only needs the places.
 */
export function tabPoints(contour: readonly Point[], count: number): Point[] {
  return tabSites({ points: [...contour], closed: true }, { count }).map((site) => site.point);
}

/**
 * The place of a closed contour nearest to a point – how a tap or a finger becomes a place for a
 * tab: its fraction of the drawn line (0 ≤ u < 1), the point on the line and how far the given point
 * is from it. Null for a contour without points. A contour of no length is its one point.
 */
export function nearestOnContour(
  contour: Contour,
  p: Point,
): { u: number; point: Point; distance: number } | null {
  const first = contour.points[0];
  if (!first) return null;
  const m = measure(contour.points);
  if (m.length === 0) return { u: 0, point: first, distance: distance(p, first) };
  const near = m.closest(p);
  // The end of the line is its start
  return { u: wrapUnit(near.s / m.length), point: near.point, distance: near.distance };
}

/**
 * The stretch of a closed contour that is `width` mm long with the fraction `u` in its middle, as a
 * polyline following the line round its corners (what a tab of that width covers; a width beyond the
 * whole line is the whole line). Empty for an open contour or one of no length.
 */
export function contourSpan(contour: Contour, u: number, width: number): Point[] {
  if (!contour.closed) return [];
  const m = measure(contour.points);
  if (m.length === 0) return [];
  const w = Math.min(Math.max(0, width), m.length);
  const start = wrapUnit(u) * m.length - w / 2;
  const end = start + w;
  const at = (way: number) => m.pointAt(((way % m.length) + m.length) % m.length);
  const inside: Point[] = [];
  // The vertices that lie strictly between the two ends, on this lap and the ones next to it
  for (const lap of [-1, 0, 1]) {
    contour.points.forEach((p, i) => {
      const way = lap * m.length + m.cum[i]!;
      if (way > start && way < end) inside.push(p);
    });
  }
  return [at(start), ...inside, at(end)];
}

interface LoopExtras {
  tabs?: Tabs;
  /** Where the tabs stand on the drawn contour; each is carried to the nearest place of the loop */
  tabAt?: readonly Point[];
  /** Detours into corners (relief), by the loop vertex they leave from */
  spurs?: ReadonlyMap<Point, Point>;
}

/**
 * Which places of the drawn contour each of the loops of one stage (all the roughing loops, or all the
 * finishing ones) keeps. Normally every loop keeps them all, each at its nearest place. Where a cut-out
 * falls into several loops (a hole with a neck narrower than the cutter) and the places are told one by
 * one (`split`), a place belongs to the loop it lies nearest to – so a tab put on one lobe is cut on
 * that lobe and not also on the other. A loop that no place is nearest to would be cut free without a
 * tab: it takes the one place nearest to it, as it did before.
 */
function tabsPerLoop(
  loops: readonly (readonly Point[])[],
  sites: readonly Point[],
  split: boolean,
): Point[][] {
  if (!split || loops.length < 2) return loops.map(() => [...sites]);
  const near = loops.map((loop) => {
    const m = measure(loop);
    return sites.map((p) => m.closest(p).distance);
  });
  const own = loops.map(() => [] as Point[]);
  sites.forEach((p, k) => {
    let best = 0;
    near.forEach((d, i) => {
      if (d[k]! < near[best]![k]!) best = i;
    });
    own[best]!.push(p);
  });
  return own.map((mine, i) => {
    if (mine.length > 0) return mine;
    let k = 0;
    near[i]!.forEach((d, j) => {
      if (d < near[i]![k]!) k = j;
    });
    return [sites[k]!];
  });
}

/**
 * One closed loop cut in all passes as one continuous walk: each pass
 * ramps down along the loop, goes once round at depth and cuts its ramp
 * again; tabs lift the cutter on the passes below their top, and at a
 * corner with relief the cutter runs into the corner and back.
 */
function loopWalk(
  loop: Point[],
  depths: number[],
  s: CutSettings,
  moves: Move[],
  { tabs, tabAt = [], spurs }: LoopExtras = {},
): Point {
  const n = loop.length;
  const { cum, length: P, pointAt, nearest } = measure(loop);
  const tan = Math.tan((Math.min(89.9, Math.max(0.5, s.rampAngle)) * Math.PI) / 180);
  const passes: { start: number; ramp: number; from: number; to: number }[] = [];
  let start = 0;
  let from = 0;
  for (const z of depths) {
    const ramp = s.rampAngle >= 90 ? 0 : Math.min(P, (from - z) / tan);
    passes.push({ start, ramp, from, to: z });
    start += ramp + P;
    from = z;
  }
  const end = start;
  const bottom = depths[depths.length - 1]!;
  const tabTop = tabs ? bottom + tabs.height : -Infinity;
  const tabHalf = tabs ? (tabs.width + s.toolDiameter) / 2 : 0;
  const tabCentres = tabs ? tabAt.map(nearest) : [];
  // Along the loop the shorter way round: a tab may lie across the start.
  const inTab = (sm: number) =>
    tabCentres.some((c) => Math.min(Math.abs(sm - c), P - Math.abs(sm - c)) < tabHalf);
  const zAt = (sAbs: number) => {
    let p = passes[0]!;
    for (const q of passes) if (sAbs >= q.start) p = q;
    const into = sAbs - p.start;
    const z = into < p.ramp ? p.from + ((p.to - p.from) * into) / p.ramp : p.to;
    return z < tabTop && inTab(((sAbs % P) + P) % P) ? tabTop : z;
  };

  const marks = new Set<number>();
  /** Stops at a vertex with a detour, and where that goes */
  const detours = new Map<number, Point>();
  for (const p of passes) {
    marks.add(p.start);
    marks.add(p.start + p.ramp);
  }
  marks.add(end);
  // From the lap before the start: a tab across the start ends its zone there, `c + tabHalf − P` into
  // the first lap (everything the lap before gives that lies before the start is left out below).
  for (let lap = -1; (lap - 1) * P <= end; lap++) {
    for (const c of cum) marks.add(lap * P + c);
    for (const c of tabCentres) {
      marks.add(lap * P + c - tabHalf);
      marks.add(lap * P + c + tabHalf);
    }
    for (let i = 0; i < n; i++) {
      const reach = spurs?.get(loop[i]!);
      if (reach) detours.set(lap * P + cum[i]!, reach);
    }
  }
  const stops = [...marks].filter((m) => m >= 0 && m <= end).sort((a, b) => a - b);

  const first = loop[0]!;
  moves.push({ z: s.safeZ, feed: null }, { x: first.x, y: first.y, feed: null });
  moves.push({ z: 1, feed: null }, { z: zAt(0), feed: s.plungeFeed });
  const eps = 1e-6;
  for (const m of stops) {
    if (m === 0) continue;
    const p = pointAt(((m % P) + P) % P);
    const zIn = zAt(m - eps);
    moves.push({ x: p.x, y: p.y, z: zIn, feed: s.feed });
    const reach = detours.get(m);
    if (reach) {
      moves.push({ x: reach.x, y: reach.y, feed: s.feed }, { x: p.x, y: p.y, feed: s.feed });
    }
    const zOut = m < end ? zAt(m + eps) : zIn;
    if (Math.abs(zOut - zIn) > eps) moves.push({ z: zOut, feed: s.plungeFeed });
  }
  moves.push({ z: s.safeZ, feed: null });
  return pointAt(end % P);
}

/** An open contour engraved along the line, back and forth pass by pass, from its nearer end. */
function openWalk(
  points: Point[],
  depths: number[],
  s: CutSettings,
  moves: Move[],
  from: Point,
): Point {
  const last = points[points.length - 1]!;
  let path = distance(from, last) < distance(from, points[0]!) ? [...points].reverse() : points;
  moves.push({ z: s.safeZ, feed: null }, { x: path[0]!.x, y: path[0]!.y, feed: null });
  moves.push({ z: 1, feed: null });
  for (const z of depths) {
    moves.push({ z, feed: s.plungeFeed });
    for (const p of path.slice(1)) moves.push({ x: p.x, y: p.y, feed: s.feed });
    path = [...path].reverse();
  }
  moves.push({ z: s.safeZ, feed: null });
  return path[0]!;
}

/** The widest a hole may be beyond the cutter to be drilled straight; wider ones are bored in a helix (mm) */
const DRILL_SLACK = 0.1;
/** Whether a hole is wider than the cutter can drill: it is bored in a helix */
const bored = (c: { r: number }, tool: number) => c.r - tool >= DRILL_SLACK;

/** The smallest peck step there is, mm: below it a hole would be thousands of steps */
export const MIN_PECK = 0.05;
/** After a full retract between pecks the cutter goes down at rapid to this far above the depth reached, mm: inside its own hole */
export const PECK_REENTRY = 0.5;

/** A peck drill's steps: the size of a step and, for chip breaking, how far the cutter comes up between them */
interface Peck {
  step: number;
  retract?: number;
}

/**
 * Down a hole in steps of `step` (the last ends exactly at the depth: every depth is `k · step`, not a sum).
 * Between two steps the cutter comes up – to the clearance plane and back at rapid to `PECK_REENTRY` above the
 * depth reached, or, for chip breaking, `retract` above it – and goes on at the plunge feed. A rapid move
 * ends only above the bottom of the hole the cutter has made at this spot, in air.
 */
function peckDown(depth: number, s: CutSettings, moves: Move[], { step, retract }: Peck) {
  const steps = Math.max(1, Math.ceil(depth / step - 1e-9));
  for (let k = 1; k <= steps; k++) {
    const z = k < steps ? -k * step : -depth;
    moves.push({ z, feed: s.plungeFeed });
    if (k === steps) break;
    if (retract === undefined) {
      moves.push(
        { z: s.safeZ, feed: null },
        { z: Math.min(z + PECK_REENTRY, s.safeZ), feed: null },
      );
    } else {
      moves.push({ z: Math.min(z + retract, s.safeZ), feed: null });
    }
  }
}

/** A round hole: drilled in steps with a matching drill or cutter (pecked if asked), otherwise bored in a helix. */
function hole(
  c: { cx: number; cy: number; r: number },
  depth: number,
  s: CutSettings,
  moves: Move[],
  peck?: Peck,
): Point {
  const tool = s.toolDiameter / 2;
  moves.push({ z: s.safeZ, feed: null });
  if (!bored(c, tool)) {
    moves.push({ x: c.cx, y: c.cy, feed: null }, { z: 1, feed: null });
    if (peck) {
      peckDown(depth, s, moves, peck);
    } else {
      for (const z of passDepths(depth, s.stepdown)) {
        moves.push({ z, feed: s.plungeFeed }, { z: 1, feed: null });
      }
    }
    moves.push({ z: s.safeZ, feed: null });
    return { x: c.cx, y: c.cy };
  }
  // Helix on the radius that leaves the hole at its size; climb = clockwise.
  const r = c.r - tool;
  const pitch = Math.min(s.stepdown, 2 * Math.PI * r * Math.tan((s.rampAngle * Math.PI) / 180));
  const turns = Math.max(1, Math.ceil(depth / Math.max(0.05, pitch) - 1e-9));
  moves.push(
    { x: c.cx + r, y: c.cy, feed: null },
    { z: 1, feed: null },
    { z: 0, feed: s.plungeFeed },
  );
  const arc = { cw: s.climb, i: -r, j: 0 };
  for (let k = 1; k <= turns; k++) {
    moves.push({ x: c.cx + r, y: c.cy, z: (-depth * k) / turns, feed: s.feed, arc });
  }
  // One full circle at the bottom for a round wall.
  moves.push({ x: c.cx + r, y: c.cy, z: -depth, feed: s.feed, arc });
  const end = { x: c.cx + r - Math.min(r, 0.5), y: c.cy };
  moves.push({ ...end, feed: s.feed }, { z: s.safeZ, feed: null });
  return end;
}

/** A helix entry bores a hole at least this much wider than the cutter, mm: the cutter's path is then a circle of at least half of it */
export const HELIX_CLEARANCE = 0.5;
/** The hole of a helix entry keeps this much further from the pocket's walls than the finishing allowance needs, mm: Clipper rounds to a micrometre and an arc to 0.01 mm */
const HELIX_MARGIN = 0.05;

/**
 * The width of the hole a helix entry bores: the asked one, else 1.5 × the cutter – but at least the cutter +
 * `HELIX_CLEARANCE` and at most twice the cutter: with the cutter's path a circle no wider than the cutter's
 * radius the pass clears the whole hole, a wider one would leave a post in the middle that the next pass
 * (a deeper cut than the step down) would have to take. (A cutter finer than the clearance gets the least.)
 */
function helixHole(asked: number | undefined, tool: number): number {
  const wanted = Number.isFinite(asked) && asked! > 0 ? asked! : 1.5 * tool;
  const least = tool + HELIX_CLEARANCE;
  return Math.min(Math.max(wanted, least), Math.max(2 * tool, least));
}

/** Whether a point lies in an area of polygons (an outer outline with holes: the parity of the outlines it is in) */
const inArea = (p: Point, area: readonly Point[][]) =>
  area.filter((polygon) => pointInPolygon(p, polygon)).length % 2 === 1;

/**
 * A ring walked once in every pass, entered on a helix at its first vertex `centre` (the ring starts there):
 * for each pass the cutter goes down on a helix that bores a hole `width` wide around `centre`, one full
 * turn at the bottom, to the middle and once round the ring at that depth. The helix descends by the job's
 * ramp angle, at most `stepdown` a turn, as the bored holes do. Every move after the first helix is in
 * what the cutter has cleared already: the hole is at most twice the cutter wide (`helixHole`), so the
 * pass clears all of it, and the way back out to the helix's start at the next pass runs through the floor
 * of the pass above.
 */
function helixWalk(
  ring: readonly Point[],
  depths: number[],
  s: CutSettings,
  moves: Move[],
  width: number,
  climb: boolean,
): Point {
  const centre = ring[0]!;
  const rho = (width - s.toolDiameter) / 2;
  const start = { x: centre.x + rho, y: centre.y };
  const arc = { cw: climb, i: -rho, j: 0 };
  const tan = Math.tan((Math.min(89.9, Math.max(0.5, s.rampAngle)) * Math.PI) / 180);
  const pitch = Math.max(0.05, Math.min(s.stepdown, 2 * Math.PI * rho * tan));
  moves.push(
    { z: s.safeZ, feed: null },
    { x: start.x, y: start.y, feed: null },
    { z: 1, feed: null },
    { z: 0, feed: s.plungeFeed },
  );
  let from = 0;
  depths.forEach((z, k) => {
    if (k > 0) moves.push({ x: start.x, y: start.y, feed: s.feed });
    const turns = Math.max(1, Math.ceil((from - z) / pitch - 1e-9));
    for (let t = 1; t <= turns; t++) {
      const zt = from + ((z - from) * t) / turns;
      moves.push({ x: start.x, y: start.y, z: zt, feed: s.feed, arc });
    }
    moves.push({ x: start.x, y: start.y, z, feed: s.feed, arc });
    moves.push({ x: centre.x, y: centre.y, feed: s.feed });
    for (const p of ring.slice(1)) moves.push({ x: p.x, y: p.y, feed: s.feed });
    moves.push({ x: centre.x, y: centre.y, feed: s.feed });
    from = z;
  });
  moves.push({ z: s.safeZ, feed: null });
  return centre;
}

/**
 * Rings of a pocket from the wall inwards; empty when the tool does not
 * fit. `allowance` keeps the outermost ring that far from the wall.
 */
export function pocketRings(
  outer: Point[],
  islands: Point[][],
  s: CutSettings,
  allowance = 0,
): Point[][][] {
  const r = s.toolDiameter / 2;
  const levels: Point[][][] = [];
  let ring = offsetPolygons(region(outer, islands), -(r + allowance));
  while (ring.length > 0 && levels.length < 10_000) {
    levels.push(ring);
    ring = offsetPolygons(ring, -Math.max(0.05, s.stepover * s.toolDiameter));
  }
  return levels;
}

function centroid(points: readonly Point[]): Point {
  const sum = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** What deciding "inside" needs of a contour, worked out once: drawings have thousands of them. */
interface Shape {
  contour: Contour;
  area: number;
  /** Its middle: where it is taken to lie */
  centre: Point;
  box: Bounds;
}

function shapeOf(contour: Contour): Shape {
  return {
    contour,
    area: Math.abs(signedArea(contour.points)),
    centre: contour.circle
      ? { x: contour.circle.cx, y: contour.circle.cy }
      : centroid(contour.points),
    box: bounds(contour.points),
  };
}

/** A smaller contour whose centre lies in a closed outline: an island of a pocket, something inside a part. */
function isInside(inner: Shape, outer: Shape): boolean {
  const p = inner.centre;
  const b = outer.box;
  if (inner.area >= outer.area || p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) {
    return false;
  }
  return pointInPolygon(p, outer.contour.points);
}

/** Where the moves of one operation lie in a program: `moves[start]` up to, not including, `moves[end]`. */
export interface CutSpan {
  /** The index in the list of operations given to `toolpaths` */
  op: number;
  start: number;
  end: number;
}

export interface Toolpath {
  moves: Move[];
  problems: Problem[];
  /**
   * The operations in the order they were cut – those that are not cut at all (`none`, no points) are
   * missing, those that could not be cut have an empty span – and where each one's moves lie.
   */
  cuts: CutSpan[];
}

export interface ToolpathOptions {
  /**
   * The order of operations of one rank (holes, pockets, …). `'nearest'` (absent): the nearest is next, as
   * always. `'short'`: that route made shorter – the operations of a rank are reordered (2-opt on the way
   * through them) wherever the rules for the order allow, and the result is used only if the program's
   * rapid travel (`rapidLength`) is really shorter than the nearest route's; else it is the nearest route.
   * Never longer, never more or other cuts than `'nearest'`: only the order, and so where each cut begins.
   */
  route?: 'nearest' | 'short';
}

/** What comes first when several things could: holes, pockets, engraving, cut-outs, outlines. */
const RANK: Record<OperationKind, number> = {
  drill: 0,
  pocket: 1,
  on: 2,
  inside: 3,
  outside: 4,
  none: 5,
};

/**
 * How far the tool is from a contour, for choosing the nearest next: to the
 * nearer end of an open line, to the box around a closed one (cheap, and
 * near enough – a loop is entered at its vertex nearest to the tool anyway).
 */
function travelTo(shape: Shape, from: Point): number {
  const { points, closed } = shape.contour;
  if (!closed) {
    return Math.min(distance(points[0]!, from), distance(points[points.length - 1]!, from));
  }
  const b = shape.box;
  return Math.hypot(
    Math.max(b.minX - from.x, 0, from.x - b.maxX),
    Math.max(b.minY - from.y, 0, from.y - b.maxY),
  );
}

/** The loop vertices where the cutter leaves for a corner, with where it goes. */
function spursOn(loop: readonly Point[], corners: readonly ReliefCorner[]): Map<Point, Point> {
  const spurs = new Map<Point, Point>();
  for (const c of corners) {
    // The offset keeps such a corner sharp, a few micrometres from where it belongs.
    const vertex = loop.find((p) => distance(p, c.turn) < 0.02);
    if (vertex) spurs.set(vertex, c.reach);
  }
  return spurs;
}

/** What a cut along a line needs of it whatever the tool did before (it depends on the contour and the settings only) */
interface SideGeometry {
  outline: Point[];
  /** The loops of the finished cut, and of the roughing that leaves the allowance */
  final: Point[][];
  rough: Point[][];
  corners: ReliefCorner[];
}

/** The same for a pocket: the islands, the wall's loops, the rings from the wall inwards */
interface PocketGeometry {
  islands: Point[][];
  wall: Point[][];
  levels: Point[][][];
  corners: ReliefCorner[];
}

/**
 * The toolpaths of a drawing in a sensible order: holes first, then
 * pockets, engravings, cut-outs and the outlines that free the parts last –
 * and whatever lies inside a contour before that contour is cut free. Among
 * equals the nearest is next, so the tool travels little in between (or, with
 * `options.route: 'short'`, a shorter route – see `ToolpathOptions`), except
 * that operations with a `seq` come first within their rank, lowest number
 * first (see `Operation.seq`). The tool starts from the work zero, or from
 * `from` (where an earlier toolpath left it). `cuts` says in which order the
 * operations were cut and where their moves lie.
 */
export function toolpaths(
  contours: readonly Contour[],
  operations: readonly Operation[],
  s: CutSettings,
  from: Point = { x: 0, y: 0 },
  options: ToolpathOptions = {},
): Toolpath {
  const r = s.toolDiameter / 2;
  const allowance = Math.max(0, s.allowance ?? 0);
  const shapes = contours.map(shapeOf);

  // What does not depend on where the tool comes from is worked out once per operation, however many orders are tried
  const sides = new Map<number, SideGeometry | null>();
  const pockets = new Map<number, PocketGeometry | null>();
  const zones = new Map<number, Point[][]>();
  const once = <T>(store: Map<number, T>, index: number, make: () => T): T => {
    if (!store.has(index)) store.set(index, make());
    return store.get(index) as T;
  };

  const todo = operations.flatMap((op, index) =>
    op.kind !== 'none' && (contours[op.contour]?.points.length ?? 0) > 0 ? [{ op, index }] : [],
  );
  // A contour that is cut free waits for everything that lies inside it.
  const waits = todo.map((a, i) => {
    const outer = shapes[a.op.contour]!;
    if (!outer.contour.closed || (a.op.kind !== 'inside' && a.op.kind !== 'outside')) return [];
    return todo.flatMap((b, j) => (j !== i && isInside(shapes[b.op.contour]!, outer) ? [j] : []));
  });
  const seqs = todo.map(({ op }) => (Number.isFinite(op.seq) ? op.seq : undefined));
  const task: RouteTask = {
    rank: todo.map(({ op }) => RANK[op.kind]),
    seq: seqs,
    waits,
    anchor: todo.map(({ op }) => shapes[op.contour]!.centre),
  };

  /** The whole program, the operations picked by the rules (the nearest next) or in the order given */
  const run = (given?: readonly number[]) => {
    const moves: Move[] = [];
    const problems: Problem[] = [];
    const cuts: CutSpan[] = [];
    const order: number[] = [];
    let at: Point = from;

    const cut = (op: Operation, index: number) => {
      const c = contours[op.contour]!;
      const depth = op.depth ?? s.depth;
      const depths = passDepths(depth, s.stepdown);
      const finish = [-depth];
      // The same places the drawing shows (`operationTabSites`); none on an open contour or without any
      const sites = operationTabSites(c, op, s);
      const tabs = sites.length > 0 ? op.tabs : undefined;
      const tabAt = sites.map((site) => site.point);
      // This contour's own direction, else the job's
      const climb = op.climb ?? s.climb;
      // A peck is for drilling only; elsewhere it is said and the contour is cut without
      if (op.peck !== undefined && op.kind !== 'drill') {
        problems.push({ contour: op.contour, code: 'peck-not-possible' });
      }
      if (op.kind === 'on') {
        at = c.closed
          ? loopWalk(startNear([...c.points], at), depths, s, moves, { tabs, tabAt })
          : openWalk(c.points, depths, s, moves, at);
      } else if (!c.closed) {
        problems.push({ contour: op.contour, code: 'open-contour' });
      } else if (op.kind === 'drill') {
        if (!c.circle || c.circle.r < r - DRILL_SLACK) {
          problems.push({ contour: op.contour, code: 'hole-too-small' });
          return;
        }
        let peck: Peck | undefined;
        if (op.peck !== undefined) {
          const { peckRetract: retract } = op;
          const asked =
            op.peck >= MIN_PECK &&
            Number.isFinite(op.peck) &&
            (retract === undefined || (Number.isFinite(retract) && retract > 0));
          if (asked && !bored(c.circle, r)) peck = { step: op.peck, retract };
          else problems.push({ contour: op.contour, code: 'peck-not-possible' });
        }
        at = hole(c.circle, depth, { ...s, climb }, moves, peck);
      } else if (op.kind === 'outside' || op.kind === 'inside') {
        const kind = op.kind;
        const sign = kind === 'outside' ? 1 : -1;
        const geometry = once(sides, index, (): SideGeometry | null => {
          const outline = ccw(c.points);
          const final = offsetPolygons([outline], sign * r);
          if (final.length === 0) return null;
          return {
            outline,
            final,
            rough: allowance > 0 ? offsetPolygons([outline], sign * (r + allowance)) : [],
            corners: op.relief ? reliefCorners(outline, kind, r, op.relief) : [],
          };
        });
        if (!geometry) {
          problems.push({ contour: op.contour, code: 'tool-too-large' });
          return;
        }
        const { final, rough, corners } = geometry;
        // Material left of the cutter for climb: outside counter-clockwise, inside clockwise.
        const turned = (g: Point[]) => ((op.kind === 'outside') === climb ? ccw(g) : cw(g));
        // Told one by one, the places go to the loops they lie nearest to
        const split = op.tabs?.at !== undefined && tabAt.length > 1;
        const roughAt = tabsPerLoop(rough, tabAt, split);
        rough.forEach((g, k) => {
          at = loopWalk(startNear(turned(g), at), depths, s, moves, { tabs, tabAt: roughAt[k] });
        });
        const finalAt = tabsPerLoop(final, tabAt, split);
        final.forEach((g, k) => {
          const loop = startNear(turned(g), at);
          // After roughing, one pass at full depth takes off the allowance.
          at = loopWalk(loop, rough.length > 0 ? finish : depths, s, moves, {
            tabs,
            tabAt: finalAt[k],
            spurs: spursOn(loop, corners),
          });
        });
      } else {
        const geometry = once(pockets, index, (): PocketGeometry | null => {
          const islands = shapes
            .filter(
              (o, j) => j !== op.contour && o.contour.closed && isInside(o, shapes[op.contour]!),
            )
            .map((o) => o.contour.points);
          const wall = offsetPolygons(region(c.points, islands), -r);
          if (wall.length === 0) return null;
          return {
            islands,
            wall,
            levels: pocketRings(c.points, islands, s, allowance),
            corners: op.relief ? reliefCorners(c.points, 'inside', r, op.relief) : [],
          };
        });
        if (!geometry) {
          problems.push({ contour: op.contour, code: 'tool-too-large' });
          return;
        }
        const { islands, wall, levels, corners } = geometry;
        // Climb runs against Clipper's orientation.
        const turned = (ring: Point[]) => (climb ? [...ring].reverse() : ring);
        // Innermost rings first, out to the wall.
        const rings = [...levels].reverse().flat();
        // Without an allowance the outermost ring is the wall itself.
        const roughing = allowance > 0 ? rings : rings.slice(0, rings.length - levels[0]!.length);
        // The first ring walked is the one that goes into uncut material: how the cutter enters is for it
        const entry = op.entry === 'helix' || op.entry === 'plunge' ? op.entry : 'ramp';
        let entered = false;
        if (entry === 'helix') {
          const width = helixHole(op.helixDiameter, s.toolDiameter);
          // Where the hole, with the allowance, lies inside the pocket and clear of the islands. Without
          // a ring inside the wall's there is no place for it: the first ring would be the wall itself
          const zone = once(zones, index, () =>
            offsetPolygons(region(c.points, islands), -(allowance + width / 2 + HELIX_MARGIN)),
          );
          const ring = roughing[0] && turned(roughing[0]);
          const vertices = ring ? ring.filter((p) => inArea(p, zone)) : [];
          if (ring && vertices.length > 0) {
            // The vertex nearest to the tool; the ring goes on from there
            const near = vertices.reduce((a, b) => (distance(b, at) < distance(a, at) ? b : a));
            at = helixWalk(startNear(ring, near), depths, s, moves, width, climb);
            entered = true;
          } else {
            problems.push({ contour: op.contour, code: 'helix-too-big' });
          }
        }
        roughing.forEach((ring, k) => {
          if (entered && k === 0) return;
          const plunge = entry === 'plunge' && k === 0;
          at = loopWalk(
            startNear(turned(ring), at),
            depths,
            plunge ? { ...s, rampAngle: 90 } : s,
            moves,
          );
        });
        wall.forEach((ring, k) => {
          const loop = startNear(turned(ring), at);
          const settings =
            entry === 'plunge' && roughing.length === 0 && k === 0 ? { ...s, rampAngle: 90 } : s;
          at = loopWalk(
            loop,
            allowance > 0 && roughing.length > 0 ? finish : depths,
            settings,
            moves,
            {
              spurs: spursOn(loop, corners),
            },
          );
        });
      }
    };

    const open = new Set(todo.keys());
    for (let k = 0; open.size > 0; k++) {
      let pick = given ? given[k]! : -1;
      if (!given) {
        let best: [rank: number, wish: number, travel: number] = [Infinity, Infinity, Infinity];
        for (const i of open) {
          if (waits[i]!.some((j) => open.has(j))) continue;
          const rank = task.rank[i]!;
          // The operator's numbers first, then the nearest
          const wish = seqs[i] ?? Infinity;
          const travel = travelTo(shapes[todo[i]!.op.contour]!, at);
          if (
            rank < best[0] ||
            (rank === best[0] && (wish < best[1] || (wish === best[1] && travel < best[2])))
          ) {
            pick = i;
            best = [rank, wish, travel];
          }
        }
      }
      open.delete(pick);
      order.push(pick);
      const start = moves.length;
      cut(todo[pick]!.op, todo[pick]!.index);
      cuts.push({ op: todo[pick]!.index, start, end: moves.length });
    }
    if (seqs.some((q) => q !== undefined)) {
      for (const i of overridden(order, task)) {
        problems.push({ contour: todo[i]!.op.contour, code: 'order-overridden' });
      }
    }
    return { path: { moves, problems, cuts }, order };
  };

  const nearest = run();
  if (options.route !== 'short') return nearest.path;
  const shorter = improve(nearest.order, from, task);
  if (shorter.every((v, i) => v === nearest.order[i])) return nearest.path;
  const other = run(shorter);
  // The estimate is by anchor points; the program itself decides
  return rapidLength(other.path.moves, from) < rapidLength(nearest.path.moves, from) - 1e-9
    ? other.path
    : nearest.path;
}
