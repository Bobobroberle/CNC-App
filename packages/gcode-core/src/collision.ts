import { segmentPoints } from './geometry';
import type { Segment, Vec4 } from './types';

export interface Box {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface Fixture extends Box {
  name: string;
  /** A round footprint (a screw head): the circle inscribed in the box */
  round?: boolean;
}

export interface CollisionSetup {
  /** Raw stock in work coordinates */
  stock: Box;
  /** Clamps and other fixtures in work coordinates */
  fixtures: readonly Fixture[];
  toolDiameter: number;
  /** Tool length below the holder/collet nut, mm */
  stickout: number;
  holderDiameter: number;
  /**
   * Gantry: height of its lowest part above the tool tip, and its extent in Y
   * around the tool. The LowRider gantry spans the full X width.
   */
  gantry?: { clearance: number; depth: number };
}

export type CollisionKind = 'holder-stock' | 'tool-fixture' | 'holder-fixture' | 'gantry';

export interface Collision {
  kind: CollisionKind;
  /** Fixture name, or "stock" */
  object: string;
  segmentIndex: number;
  lineIndex: number;
  point: Vec4;
}

const EPS = 1e-6;

/** Centre and radius of a round fixture's footprint. */
function circleOf(box: Box): { x: number; y: number; r: number } {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    r: Math.min(box.max.x - box.min.x, box.max.y - box.min.y) / 2,
  };
}

function overlapsXY(box: Box & { round?: boolean }, x: number, y: number, radius: number): boolean {
  if (box.round) {
    const c = circleOf(box);
    return (x - c.x) ** 2 + (y - c.y) ** 2 < (c.r + radius) ** 2 - EPS;
  }
  const dx = Math.max(box.min.x - x, 0, x - box.max.x);
  const dy = Math.max(box.min.y - y, 0, y - box.max.y);
  if (dx === 0 && dy === 0) return true;
  return dx * dx + dy * dy < radius * radius - EPS;
}

/**
 * Checks every move against the stock and the fixtures: the holder must not
 * dip into the stock, tool and holder must stay out of the clamps, and the
 * gantry must pass above everything. Reports the first hit per kind and object.
 */
export function checkCollisions(
  segments: readonly Segment[],
  setup: CollisionSetup,
  tolerance = 0.5,
): Collision[] {
  const found = new Map<string, Collision>();
  const hit = (kind: CollisionKind, object: string, s: Segment, point: Vec4) => {
    const key = `${kind}|${object}`;
    if (!found.has(key)) {
      found.set(key, { kind, object, segmentIndex: s.index, lineIndex: s.lineIndex, point });
    }
  };
  const toolR = setup.toolDiameter / 2;
  const holderR = setup.holderDiameter / 2;
  const objects: { name: string; box: Box }[] = [
    { name: 'stock', box: setup.stock },
    ...setup.fixtures.map((f) => ({ name: f.name, box: f })),
  ];

  for (const s of segments) {
    if (s.machineCoordinates) continue;
    for (const p of segmentPoints(s, tolerance)) {
      const holderZ = p.z + setup.stickout;
      if (holderZ < setup.stock.max.z - EPS && overlapsXY(setup.stock, p.x, p.y, holderR)) {
        hit('holder-stock', 'stock', s, p);
      }
      for (const f of setup.fixtures) {
        if (p.z < f.max.z - EPS && overlapsXY(f, p.x, p.y, toolR))
          hit('tool-fixture', f.name, s, p);
        if (holderZ < f.max.z - EPS && overlapsXY(f, p.x, p.y, holderR)) {
          hit('holder-fixture', f.name, s, p);
        }
      }
      if (setup.gantry) {
        const bottom = p.z + setup.gantry.clearance;
        const half = setup.gantry.depth / 2;
        for (const o of objects) {
          const inY = o.box.min.y <= p.y + half && o.box.max.y >= p.y - half;
          if (inY && o.box.max.z > bottom + EPS) hit('gantry', o.name, s, p);
        }
      }
    }
  }
  return [...found.values()];
}

/**
 * What a move does to a clamp: `cut` – a feed move runs into it, `rapid` – a
 * rapid runs into it, `low` – it passes above, but closer than the margin.
 */
export type ClampHitKind = 'cut' | 'rapid' | 'low';

export interface ClampHit {
  /** Index of the fixture in the list that was checked */
  fixture: number;
  name: string;
  /** The worst that happens at this clamp */
  kind: ClampHitKind;
  /** Every move that comes too close, as segment indexes in program order */
  segments: number[];
  /** Source line of the first move of the worst kind */
  lineIndex: number;
  /** Lowest tool tip over the clamp minus its top, mm; negative = the tool runs into it */
  clearance: number;
}

export interface ClampCheckOptions {
  toolDiameter: number;
  /** How far the tool tip must stay above a clamp's top, mm */
  margin?: number;
  /** Chord tolerance for arcs, mm */
  tolerance?: number;
}

type Span = [number, number];

/** Part of the line a→b (as parameters 0…1) inside an axis-aligned rectangle. */
function clipRect(
  a: Vec4,
  b: Vec4,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Span | null {
  let t0 = 0;
  let t1 = 1;
  const axes = [
    [b.x - a.x, minX - a.x, maxX - a.x],
    [b.y - a.y, minY - a.y, maxY - a.y],
  ] as const;
  for (const [d, lo, hi] of axes) {
    if (Math.abs(d) < EPS) {
      // Parallel to this pair of edges: inside for the whole move or never.
      if (lo > 0 || hi < 0) return null;
      continue;
    }
    t0 = Math.max(t0, Math.min(lo / d, hi / d));
    t1 = Math.min(t1, Math.max(lo / d, hi / d));
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** Part of the line a→b (as parameters 0…1) inside a circle. */
function clipCircle(a: Vec4, b: Vec4, cx: number, cy: number, radius: number): Span | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - cx;
  const fy = a.y - cy;
  const inside = fx * fx + fy * fy <= radius * radius;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return inside ? [0, 1] : null;
  const half = fx * dx + fy * dy;
  const disc = half * half - len2 * (fx * fx + fy * fy - radius * radius);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t0 = Math.max(0, (-half - root) / len2);
  const t1 = Math.min(1, (-half + root) / len2);
  return t0 <= t1 ? [t0, t1] : null;
}

/**
 * Lowest tool tip on the straight piece a→b while the tool (radius `reach`)
 * is over the fixture's footprint; Infinity when it never is. The footprint
 * grown by the tool radius is two rectangles and four corner circles – or
 * one larger circle for a round fixture.
 */
function lowestOver(f: Fixture, a: Vec4, b: Vec4, reach: number): number {
  const spans: (Span | null)[] = [];
  if (f.round) {
    const c = circleOf(f);
    spans.push(clipCircle(a, b, c.x, c.y, c.r + reach));
  } else {
    spans.push(
      clipRect(a, b, f.min.x - reach, f.min.y, f.max.x + reach, f.max.y),
      clipRect(a, b, f.min.x, f.min.y - reach, f.max.x, f.max.y + reach),
    );
    for (const x of [f.min.x, f.max.x]) {
      for (const y of [f.min.y, f.max.y]) spans.push(clipCircle(a, b, x, y, reach));
    }
  }
  let lowest = Infinity;
  for (const span of spans) {
    // Z changes evenly along the piece, so its lowest point is at an end of the span.
    for (const t of span ?? []) lowest = Math.min(lowest, a.z + (b.z - a.z) * t);
  }
  return lowest;
}

const CLAMP_RANK: Record<ClampHitKind, number> = { low: 1, rapid: 2, cut: 3 };

/**
 * Checks every move against the clamps on the table, along its whole length
 * and with the tool's radius: does a cut or a rapid run into a clamp, or
 * pass over it with less than `margin` to spare? One entry per clamp that is
 * in the way, with every offending move.
 */
export function checkClamps(
  segments: readonly Segment[],
  fixtures: readonly Fixture[],
  options: ClampCheckOptions,
): ClampHit[] {
  const { margin = 2, tolerance = 0.05 } = options;
  const reach = Math.max(0, options.toolDiameter / 2 - EPS);
  const hits: ClampHit[] = [];
  fixtures.forEach((f, fixture) => {
    let hit: ClampHit | null = null;
    for (const s of segments) {
      if (s.machineCoordinates) continue;
      // A straight move that stays high enough, or beside the clamp altogether,
      // needs no closer look (most moves of a job: this keeps dragging a clamp fluid).
      if (
        !s.arc &&
        (Math.min(s.from.z, s.to.z) >= f.max.z + margin - EPS ||
          Math.max(s.from.x, s.to.x) < f.min.x - reach ||
          Math.min(s.from.x, s.to.x) > f.max.x + reach ||
          Math.max(s.from.y, s.to.y) < f.min.y - reach ||
          Math.min(s.from.y, s.to.y) > f.max.y + reach)
      ) {
        continue;
      }
      const points = segmentPoints(s, tolerance);
      let lowest = Infinity;
      for (let i = 1; i < points.length; i++) {
        lowest = Math.min(lowest, lowestOver(f, points[i - 1]!, points[i]!, reach));
      }
      const clearance = lowest - f.max.z;
      if (clearance >= margin - EPS) continue;
      const kind: ClampHitKind = clearance >= -EPS ? 'low' : s.motion === 'rapid' ? 'rapid' : 'cut';
      hit ??= { fixture, name: f.name, kind, segments: [], lineIndex: s.lineIndex, clearance };
      hit.segments.push(s.index);
      hit.clearance = Math.min(hit.clearance, clearance);
      if (CLAMP_RANK[kind] > CLAMP_RANK[hit.kind]) {
        hit.kind = kind;
        hit.lineIndex = s.lineIndex;
      }
    }
    if (hit) hits.push(hit);
  });
  return hits;
}
