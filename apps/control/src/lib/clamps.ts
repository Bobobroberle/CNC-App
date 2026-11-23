import type { Fixture } from '@lowrider/gcode-core';
import type { Point } from './camera';

/**
 * Clamps and screws marked on the table. A clamp is a thing on the table:
 * its X/Y are machine coordinates, so it stays where it is when the work
 * zero moves. Its height counts from the work Z zero (the surface the job is
 * set to), which is what a rule beside the workpiece measures. The checks
 * and the pictures want work coordinates; `fixturesInWork` shifts them.
 */

/** What a tap puts down: a clamp (a box) or a screw head (a circle) */
export type ClampKind = 'clamp' | 'screw';

/** Size of a new zone, mm: footprint and height above the work surface */
export const CLAMP_DEFAULTS: Record<ClampKind, { width: number; depth: number; height: number }> = {
  clamp: { width: 60, depth: 40, height: 30 },
  screw: { width: 12, depth: 12, height: 5 },
};

/** Smallest side of a zone, mm */
export const MIN_ZONE = 4;

/** Fixtures reach down through the table: only their top matters */
const BOTTOM = -1000;

/**
 * Which coordinates the X/Y of the stored fixtures count in. `work` only for
 * fixtures typed in before they were pinned to the table (older versions
 * stored them relative to the work zero).
 */
export type FixtureFrame = 'machine' | 'work';

const shifted = (f: Fixture, dx: number, dy: number): Fixture => ({
  ...f,
  min: { ...f.min, x: f.min.x + dx, y: f.min.y + dy },
  max: { ...f.max, x: f.max.x + dx, y: f.max.y + dy },
});

/**
 * The fixtures in work coordinates, for the checks and the pictures. Pinned
 * fixtures need the work offset (machine = work + offset); without it – not
 * connected – nobody can say where they lie relative to the job.
 */
export function fixturesInWork(
  fixtures: readonly Fixture[],
  frame: FixtureFrame,
  wco: readonly number[] | null | undefined,
): Fixture[] {
  if (frame === 'work') return [...fixtures];
  if (!wco) return [];
  const [ox = 0, oy = 0] = wco;
  return fixtures.map((f) => shifted(f, -ox, -oy));
}

/** Pins fixtures that were stored relative to the work zero to the table where they lie now. */
export function pinFixtures(fixtures: readonly Fixture[], wco: readonly number[]): Fixture[] {
  const [ox = 0, oy = 0] = wco;
  return fixtures.map((f) => shifted(f, ox, oy));
}

/** The first free number for a new zone: names end in it ("Zwinge 2"). */
export function nextNumber(fixtures: readonly Fixture[]): number {
  const used = new Set(fixtures.map((f) => Number(/(\d+)\s*$/.exec(f.name)?.[1] ?? NaN)));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/** A new zone of the default size around the tapped point. */
export function newZone(kind: ClampKind, centre: Point, name: string): Fixture {
  const { width, depth, height } = CLAMP_DEFAULTS[kind];
  return {
    name,
    ...(kind === 'screw' ? { round: true } : {}),
    min: { x: centre.x - width / 2, y: centre.y - depth / 2, z: BOTTOM },
    max: { x: centre.x + width / 2, y: centre.y + depth / 2, z: height },
  };
}

/** A fixture from typed numbers: X/Y ranges and the height of its top. */
export function boxZone(
  name: string,
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  height: number,
  round = false,
): Fixture {
  return {
    name,
    ...(round ? { round: true } : {}),
    min: { x: x1, y: y1, z: BOTTOM },
    max: { x: x2, y: y2, z: height },
  };
}

export const zoneCentre = (f: Fixture): Point => ({
  x: (f.min.x + f.max.x) / 2,
  y: (f.min.y + f.max.y) / 2,
});

/** Radius of a round zone: the circle inscribed in its box. */
export const zoneRadius = (f: Fixture): number =>
  Math.min(f.max.x - f.min.x, f.max.y - f.min.y) / 2;

/** Where a zone is taken: its body to move it, a corner or the rim to resize it */
export type ZonePart = 'body' | 'sw' | 'se' | 'nw' | 'ne' | 'rim';

/** The resize handles of a zone: four corners of a box, one point on a circle's rim. */
export function zoneHandles(f: Fixture): { part: ZonePart; x: number; y: number }[] {
  if (f.round) {
    const c = zoneCentre(f);
    return [{ part: 'rim', x: c.x + zoneRadius(f), y: c.y }];
  }
  return [
    { part: 'sw', x: f.min.x, y: f.min.y },
    { part: 'se', x: f.max.x, y: f.min.y },
    { part: 'nw', x: f.min.x, y: f.max.y },
    { part: 'ne', x: f.max.x, y: f.max.y },
  ];
}

/** Distance of a point from a zone's footprint; 0 inside. */
export function zoneDistance(f: Fixture, p: Point): number {
  if (f.round) {
    const c = zoneCentre(f);
    return Math.max(0, Math.hypot(p.x - c.x, p.y - c.y) - zoneRadius(f));
  }
  const dx = Math.max(f.min.x - p.x, 0, p.x - f.max.x);
  const dy = Math.max(f.min.y - p.y, 0, p.y - f.max.y);
  return Math.hypot(dx, dy);
}

/**
 * What a finger at `p` takes hold of. `tolerance` is the finger's radius in
 * mm at the current zoom: a zone smaller than the finger is still hit, and
 * the handles of the selected zone win over its body – but only where the
 * finger is nearer to the handle than to the zone's middle, so a small zone
 * can still be moved.
 */
export function zoneAt(
  fixtures: readonly Fixture[],
  p: Point,
  tolerance: number,
  selected: number | null = null,
): { index: number; part: ZonePart } | null {
  const chosen = selected === null ? undefined : fixtures[selected];
  if (chosen && selected !== null) {
    const c = zoneCentre(chosen);
    const toCentre = Math.hypot(p.x - c.x, p.y - c.y);
    let best: { part: ZonePart; d: number } | null = null;
    for (const h of zoneHandles(chosen)) {
      const d = Math.hypot(p.x - h.x, p.y - h.y);
      if (d <= tolerance && d < toCentre && (!best || d < best.d)) best = { part: h.part, d };
    }
    if (best) return { index: selected, part: best.part };
  }
  // The zone drawn last lies on top.
  for (let index = fixtures.length - 1; index >= 0; index--) {
    const f = fixtures[index]!;
    const half = Math.min(f.max.x - f.min.x, f.max.y - f.min.y) / 2;
    if (zoneDistance(f, p) <= Math.max(0, tolerance - half)) return { index, part: 'body' };
  }
  return null;
}

export function moveZone(f: Fixture, dx: number, dy: number): Fixture {
  return shifted(f, dx, dy);
}

/**
 * A zone with the taken corner (or rim) at `p`; the opposite corner (or the
 * centre) stays where it is. Never smaller than `MIN_ZONE`.
 */
export function resizeZone(f: Fixture, part: ZonePart, p: Point): Fixture {
  if (part === 'body') return f;
  if (part === 'rim') {
    const c = zoneCentre(f);
    const r = Math.max(MIN_ZONE / 2, Math.hypot(p.x - c.x, p.y - c.y));
    return {
      ...f,
      min: { ...f.min, x: c.x - r, y: c.y - r },
      max: { ...f.max, x: c.x + r, y: c.y + r },
    };
  }
  const west = part === 'sw' || part === 'nw';
  const south = part === 'sw' || part === 'se';
  return {
    ...f,
    min: {
      ...f.min,
      x: west ? Math.min(p.x, f.max.x - MIN_ZONE) : f.min.x,
      y: south ? Math.min(p.y, f.max.y - MIN_ZONE) : f.min.y,
    },
    max: {
      ...f.max,
      x: west ? f.max.x : Math.max(p.x, f.min.x + MIN_ZONE),
      y: south ? f.max.y : Math.max(p.y, f.min.y + MIN_ZONE),
    },
  };
}

/** A zone with a new height of its top above the work surface. */
export function withHeight(f: Fixture, height: number): Fixture {
  return { ...f, max: { ...f.max, z: height } };
}
