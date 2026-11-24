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

/**
 * What happens to a contour, after Estlcam's choices. `on` engraves: the
 * tool centre follows the line itself (text, V-bit lines, marking).
 */
export type OperationKind = 'outside' | 'inside' | 'on' | 'pocket' | 'drill' | 'none';

export interface Tabs {
  count: number;
  /** Width on the part, mm */
  width: number;
  /** Height above the bottom of the cut, mm */
  height: number;
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

export interface Problem {
  contour: number;
  code: 'tool-too-large' | 'open-contour' | 'hole-too-small';
}

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

/** A closed loop by its length: the way along it to each vertex, points on it, the place nearest to a point. */
function measure(loop: readonly Point[]) {
  const n = loop.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1]! + distance(loop[i - 1]!, loop[i % n]!));
  const pointAt = (sm: number): Point => {
    let i = 0;
    while (i < n - 1 && cum[i + 1]! <= sm) i++;
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    // Never a zero-length segment: the search above steps over them.
    const t = (sm - cum[i]!) / (cum[i + 1]! - cum[i]!);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const nearest = (p: Point): number => {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < n; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % n]!;
      const length = cum[i + 1]! - cum[i]!;
      if (length === 0) continue;
      const along = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length;
      const t = Math.max(0, Math.min(length, along));
      const q = { x: a.x + ((b.x - a.x) * t) / length, y: a.y + ((b.y - a.y) * t) / length };
      if (distance(p, q) < bestDistance) {
        bestDistance = distance(p, q);
        best = cum[i]! + t;
      }
    }
    return best;
  };
  return { cum, length: cum[n]!, pointAt, nearest };
}

/**
 * Where the tabs of a contour stand: evenly along the drawn line, counted
 * from its first point. Every loop cut for the contour (roughing, finishing)
 * lifts at the same places of the part.
 */
export function tabPoints(contour: readonly Point[], count: number): Point[] {
  const m = measure(contour);
  return Array.from({ length: count }, (_, k) => m.pointAt(((k + 0.5) * m.length) / count));
}

interface LoopExtras {
  tabs?: Tabs;
  /** Where the tabs stand on the drawn contour; each is carried to the nearest place of the loop */
  tabAt?: readonly Point[];
  /** Detours into corners (relief), by the loop vertex they leave from */
  spurs?: ReadonlyMap<Point, Point>;
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
  for (let lap = 0; (lap - 1) * P <= end; lap++) {
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

/** A round hole: pecked with a matching drill or cutter, otherwise bored in a helix. */
function hole(
  c: { cx: number; cy: number; r: number },
  depth: number,
  s: CutSettings,
  moves: Move[],
): Point {
  const tool = s.toolDiameter / 2;
  moves.push({ z: s.safeZ, feed: null });
  if (c.r - tool < 0.1) {
    moves.push({ x: c.cx, y: c.cy, feed: null }, { z: 1, feed: null });
    for (const z of passDepths(depth, s.stepdown)) {
      moves.push({ z, feed: s.plungeFeed }, { z: 1, feed: null });
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

export interface Toolpath {
  moves: Move[];
  problems: Problem[];
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

/**
 * The toolpaths of a drawing in a sensible order: holes first, then
 * pockets, engravings, cut-outs and the outlines that free the parts last –
 * and whatever lies inside a contour before that contour is cut free. Among
 * equals the nearest is next, so the tool travels little in between. The
 * tool starts from the work zero, or from `from` (where an earlier toolpath
 * left it).
 */
export function toolpaths(
  contours: readonly Contour[],
  operations: readonly Operation[],
  s: CutSettings,
  from: Point = { x: 0, y: 0 },
): Toolpath {
  const moves: Move[] = [];
  const problems: Problem[] = [];
  const r = s.toolDiameter / 2;
  const allowance = Math.max(0, s.allowance ?? 0);
  const shapes = contours.map(shapeOf);
  let at: Point = from;

  const cut = (op: Operation) => {
    const c = contours[op.contour]!;
    const depth = op.depth ?? s.depth;
    const depths = passDepths(depth, s.stepdown);
    const finish = [-depth];
    const tabs = op.tabs && op.tabs.count > 0 ? op.tabs : undefined;
    const tabAt = tabs && c.closed ? tabPoints(c.points, tabs.count) : [];
    // This contour's own direction, else the job's
    const climb = op.climb ?? s.climb;
    if (op.kind === 'on') {
      at = c.closed
        ? loopWalk(startNear([...c.points], at), depths, s, moves, { tabs, tabAt })
        : openWalk(c.points, depths, s, moves, at);
    } else if (!c.closed) {
      problems.push({ contour: op.contour, code: 'open-contour' });
    } else if (op.kind === 'drill') {
      if (!c.circle || c.circle.r < r - 0.1) {
        problems.push({ contour: op.contour, code: 'hole-too-small' });
        return;
      }
      at = hole(c.circle, depth, { ...s, climb }, moves);
    } else if (op.kind === 'outside' || op.kind === 'inside') {
      const sign = op.kind === 'outside' ? 1 : -1;
      const outline = ccw(c.points);
      const final = offsetPolygons([outline], sign * r);
      if (final.length === 0) {
        problems.push({ contour: op.contour, code: 'tool-too-large' });
        return;
      }
      const corners = op.relief ? reliefCorners(outline, op.kind, r, op.relief) : [];
      // Material left of the cutter for climb: outside counter-clockwise, inside clockwise.
      const turned = (g: Point[]) => ((op.kind === 'outside') === climb ? ccw(g) : cw(g));
      const rough = allowance > 0 ? offsetPolygons([outline], sign * (r + allowance)) : [];
      for (const g of rough) {
        at = loopWalk(startNear(turned(g), at), depths, s, moves, { tabs, tabAt });
      }
      for (const g of final) {
        const loop = startNear(turned(g), at);
        // After roughing, one pass at full depth takes off the allowance.
        at = loopWalk(loop, rough.length > 0 ? finish : depths, s, moves, {
          tabs,
          tabAt,
          spurs: spursOn(loop, corners),
        });
      }
    } else {
      const islands = shapes
        .filter((o, j) => j !== op.contour && o.contour.closed && isInside(o, shapes[op.contour]!))
        .map((o) => o.contour.points);
      const wall = offsetPolygons(region(c.points, islands), -r);
      if (wall.length === 0) {
        problems.push({ contour: op.contour, code: 'tool-too-large' });
        return;
      }
      const levels = pocketRings(c.points, islands, s, allowance);
      const corners = op.relief ? reliefCorners(c.points, 'inside', r, op.relief) : [];
      // Climb runs against Clipper's orientation.
      const turned = (ring: Point[]) => (climb ? [...ring].reverse() : ring);
      // Innermost rings first, out to the wall.
      const rings = [...levels].reverse().flat();
      // Without an allowance the outermost ring is the wall itself.
      const roughing = allowance > 0 ? rings : rings.slice(0, rings.length - levels[0]!.length);
      for (const ring of roughing) {
        at = loopWalk(startNear(turned(ring), at), depths, s, moves);
      }
      for (const ring of wall) {
        const loop = startNear(turned(ring), at);
        at = loopWalk(loop, allowance > 0 && roughing.length > 0 ? finish : depths, s, moves, {
          spurs: spursOn(loop, corners),
        });
      }
    }
  };

  const todo = operations.filter(
    (o) => o.kind !== 'none' && (contours[o.contour]?.points.length ?? 0) > 0,
  );
  // A contour that is cut free waits for everything that lies inside it.
  const waits = todo.map((a, i) => {
    const outer = shapes[a.contour]!;
    if (!outer.contour.closed || (a.kind !== 'inside' && a.kind !== 'outside')) return [];
    return todo.flatMap((b, j) => (j !== i && isInside(shapes[b.contour]!, outer) ? [j] : []));
  });
  const open = new Set(todo.keys());
  while (open.size > 0) {
    let pick = -1;
    let best: [rank: number, travel: number] = [Infinity, Infinity];
    for (const i of open) {
      if (waits[i]!.some((j) => open.has(j))) continue;
      const rank = RANK[todo[i]!.kind];
      const travel = travelTo(shapes[todo[i]!.contour]!, at);
      if (rank < best[0] || (rank === best[0] && travel < best[1])) {
        pick = i;
        best = [rank, travel];
      }
    }
    open.delete(pick);
    cut(todo[pick]!);
  }
  return { moves, problems };
}
