import { distance, signedArea, type Point } from './geometry';

/**
 * Relief for inside corners: a round cutter leaves its radius standing in
 * every corner it cuts from the inside, so a square part does not fit. A
 * `dogbone` runs the cutter diagonally into the corner until it reaches it;
 * a `tbone` runs it along the longer edge instead, so that edge stays
 * straight and the notch goes into the shorter one.
 */
export type Relief = 'dogbone' | 'tbone';

export interface ReliefCorner {
  /** The corner of the drawn contour */
  corner: Point;
  /** Where the tool centre turns without relief: both edges are its radius away */
  turn: Point;
  /** The tool centre that reaches the corner */
  reach: Point;
}

/** Corners turning less than this are part of a curve, not corners, degrees */
const MIN_TURN = 30;
/** Corners turning more than this are slits no cutter gets into, degrees */
const MAX_TURN = 170;

/**
 * The corners of a closed contour that a cutter of `radius` cannot reach
 * when it works `inside` the contour (a hole, a pocket) or `outside` it
 * (the notches of a part's outline), each with the detour that frees it.
 */
export function reliefCorners(
  contour: readonly Point[],
  side: 'inside' | 'outside',
  radius: number,
  kind: Relief,
): ReliefCorner[] {
  // A point drawn twice is one corner.
  const points = (signedArea(contour) >= 0 ? [...contour] : [...contour].reverse()).filter(
    (p, i, all) => distance(p, all[(i + all.length - 1) % all.length]!) > 0,
  );
  const n = points.length;
  const out: ReliefCorner[] = [];
  for (let i = 0; i < n; i++) {
    const v = points[i]!;
    const before = points[(i + n - 1) % n]!;
    const after = points[(i + 1) % n]!;
    const l1 = distance(before, v);
    const l2 = distance(v, after);
    // Along the two edges, away from the corner.
    const u1 = { x: (before.x - v.x) / l1, y: (before.y - v.y) / l1 };
    const u2 = { x: (after.x - v.x) / l2, y: (after.y - v.y) / l2 };
    // Counter-clockwise outline: a left turn is a corner seen from inside, a right turn one seen from outside.
    const cross = -u1.x * u2.y + u1.y * u2.x;
    const turn = Math.atan2(Math.abs(cross), -(u1.x * u2.x + u1.y * u2.y));
    const degrees = (turn * 180) / Math.PI;
    if (degrees < MIN_TURN || degrees > MAX_TURN || cross > 0 !== (side === 'inside')) continue;
    // The bisector points into the corner's opening, where the cutter is.
    const bl = Math.hypot(u1.x + u2.x, u1.y + u2.y);
    const b = { x: (u1.x + u2.x) / bl, y: (u1.y + u2.y) / bl };
    const reachOut = radius / Math.sin((Math.PI - turn) / 2);
    // T-bone: tangent to the longer edge at the corner (of two equal ones, the one that follows).
    const [long, short] = l1 > l2 + 1e-9 ? [u1, u2] : [u2, u1];
    const along = short.x * long.x + short.y * long.y;
    const nl = Math.hypot(short.x - along * long.x, short.y - along * long.y);
    const normal = { x: (short.x - along * long.x) / nl, y: (short.y - along * long.y) / nl };
    const towards = kind === 'dogbone' ? b : normal;
    out.push({
      corner: v,
      turn: { x: v.x + b.x * reachOut, y: v.y + b.y * reachOut },
      reach: { x: v.x + towards.x * radius, y: v.y + towards.y * radius },
    });
  }
  return out;
}
