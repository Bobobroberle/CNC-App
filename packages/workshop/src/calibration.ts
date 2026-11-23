/**
 * Machine geometry from a camera and a reference plate. The camera is only a
 * null detector: the machine is driven until a plate marker sits in the image
 * centre, and the commanded machine positions are the measurement. A fit of
 * those positions against the plate's nominal grid gives the scale of X and
 * Y and the angle between them.
 *
 * Model: a commanded move c ends at the physical position P = E·c with
 *   E = [[kx, ky·sin γ], [0, ky·cos γ]]
 * kx, ky = mm actually travelled per commanded mm, γ = how far the Y motion
 * leans towards +X (the axes enclose 90° − γ). The plate lies at an unknown
 * angle: P = R·p + t. Fitting c = A·p + b gives A = E⁻¹·R, and
 * (A·Aᵀ)⁻¹ = Eᵀ·E, which no longer depends on the plate's angle.
 */

export interface Vec {
  x: number;
  y: number;
}

/** One measured marker: where it is on the plate and where the machine centred on it. */
export interface MarkerPair {
  nominal: Vec;
  machine: Vec;
}

/** c = [[a, b], [c, d]]·p + [tx, ty] */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface AxisErrors {
  /** mm travelled per commanded mm */
  scaleX: number;
  scaleY: number;
  /** Lean of the Y motion towards +X, degrees; the axes enclose 90° − this */
  squareness: number;
  /** Angle of the plate against the machine X axis, degrees (placement only) */
  plateAngle: number;
  /** How well the grid fits, mm */
  rms: number;
  max: number;
  points: number;
}

const DEG = 180 / Math.PI;

export function applyAffine(f: Affine, p: Vec): Vec {
  return { x: f.a * p.x + f.b * p.y + f.tx, y: f.c * p.x + f.d * p.y + f.ty };
}

/**
 * The grid to measure, in the order the machine visits it: rows along X,
 * back and forth (short moves, the plate's angle is known after two points).
 */
export function planGrid(spanX: number, spanY: number, nx: number, ny: number): Vec[] {
  const out: Vec[] = [];
  for (let j = 0; j < ny; j++) {
    for (let k = 0; k < nx; k++) {
      const i = j % 2 === 0 ? k : nx - 1 - k;
      out.push({ x: nx > 1 ? (spanX * i) / (nx - 1) : 0, y: ny > 1 ? (spanY * j) / (ny - 1) : 0 });
    }
  }
  return out;
}

/** Least-squares affine fit; null without three points that are not on one line. */
export function fitAffine(pairs: readonly MarkerPair[]): Affine | null {
  const n = pairs.length;
  if (n < 3) return null;
  const mean = (f: (q: MarkerPair) => number) => pairs.reduce((s, q) => s + f(q), 0) / n;
  const px = mean((q) => q.nominal.x);
  const py = mean((q) => q.nominal.y);
  const cx = mean((q) => q.machine.x);
  const cy = mean((q) => q.machine.y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let ux = 0;
  let uy = 0;
  let vx = 0;
  let vy = 0;
  for (const q of pairs) {
    const x = q.nominal.x - px;
    const y = q.nominal.y - py;
    const u = q.machine.x - cx;
    const v = q.machine.y - cy;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    ux += u * x;
    uy += u * y;
    vx += v * x;
    vy += v * y;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9 * Math.max(1, sxx * syy)) return null;
  const a = (ux * syy - uy * sxy) / det;
  const b = (uy * sxx - ux * sxy) / det;
  const c = (vx * syy - vy * sxy) / det;
  const d = (vy * sxx - vx * sxy) / det;
  return { a, b, c, d, tx: cx - a * px - b * py, ty: cy - c * px - d * py };
}

/**
 * Where to look for the next marker from what is measured so far: one point
 * gives the shift, two the plate's angle, three or more the full fit.
 */
export function predictMarker(pairs: readonly MarkerPair[], nominal: Vec): Vec | null {
  const f = fitAffine(pairs);
  if (f) return applyAffine(f, nominal);
  const [p, q] = pairs;
  if (!p) return null;
  if (!q) {
    return { x: p.machine.x + nominal.x - p.nominal.x, y: p.machine.y + nominal.y - p.nominal.y };
  }
  // Similarity (rotation + scale) through two points.
  const n = { x: q.nominal.x - p.nominal.x, y: q.nominal.y - p.nominal.y };
  const m = { x: q.machine.x - p.machine.x, y: q.machine.y - p.machine.y };
  const nn = n.x * n.x + n.y * n.y;
  const cos = (m.x * n.x + m.y * n.y) / nn;
  const sin = (m.y * n.x - m.x * n.y) / nn;
  const dx = nominal.x - p.nominal.x;
  const dy = nominal.y - p.nominal.y;
  return { x: p.machine.x + cos * dx - sin * dy, y: p.machine.y + sin * dx + cos * dy };
}

/** Scale and squareness of the machine from a fit. */
export function axisErrors(pairs: readonly MarkerPair[]): AxisErrors | null {
  const f = fitAffine(pairs);
  if (!f) return null;
  // G = (A·Aᵀ)⁻¹ = Eᵀ·E
  const m11 = f.a * f.a + f.b * f.b;
  const m12 = f.a * f.c + f.b * f.d;
  const m22 = f.c * f.c + f.d * f.d;
  const det = m11 * m22 - m12 * m12;
  const g11 = m22 / det;
  const g12 = -m12 / det;
  const g22 = m11 / det;
  const scaleX = Math.sqrt(g11);
  const scaleY = Math.sqrt(g22);
  const squareness = Math.asin(g12 / (scaleX * scaleY)) * DEG;
  // E·A = R: the plate's angle is the angle of E·(first column of A).
  const s = squareness / DEG;
  const ex = scaleX * f.a + scaleY * Math.sin(s) * f.c;
  const ey = scaleY * Math.cos(s) * f.c;
  const res = pairs.map((q) => {
    const p = applyAffine(f, q.nominal);
    return Math.hypot(p.x - q.machine.x, p.y - q.machine.y);
  });
  return {
    scaleX,
    scaleY,
    squareness,
    plateAngle: Math.atan2(ey, ex) * DEG,
    rms: Math.sqrt(res.reduce((sum, r) => sum + r * r, 0) / res.length),
    max: Math.max(...res),
    points: pairs.length,
  };
}

/**
 * Reversal: the same plate measured again after turning it by 90°. The
 * plate's own squareness error changes sign, the machine's does not, so the
 * mean is the machine and half the difference is the plate (lean of the
 * plate's Y lines towards its +X, degrees).
 */
export function combineReversal(
  first: AxisErrors,
  turned: AxisErrors,
): { squareness: number; plateSquareness: number } {
  return {
    squareness: (first.squareness + turned.squareness) / 2,
    plateSquareness: (turned.squareness - first.squareness) / 2,
  };
}

/** New steps/mm for an axis that travels `scale` mm per commanded mm. */
export function correctedSteps(steps: number, scale: number): number {
  return Number((steps / scale).toFixed(3));
}

export interface SquaringInput {
  /** Current pull-off of the two Y motors, mm */
  pulloff0: number;
  pulloff1: number;
  /** Distance between the two Y rails (where the motors push), mm */
  gantryWidth: number;
  /** Measured lean of Y towards +X, degrees */
  squareness: number;
  /** Side of the gantry Y motor 1 sits on */
  motor1Side: 'xMin' | 'xMax';
  /** Y homes towards + (pull-off moves −Y) */
  homingPositive: boolean;
  /** Pull-off never below this, so the switch is cleared */
  minimum?: number;
}

/**
 * Squaring the gantry with the per-motor pull-off of the dual Y axis. With
 * γ > 0 the X+ end of the gantry runs ahead in +Y by W·tan γ; after homing it
 * has to sit that much further back. A larger pull-off leaves a motor further
 * from its switch, i.e. further +Y when homing towards −Y.
 */
export function squaringPulloff(i: SquaringInput): {
  pulloff0: number;
  pulloff1: number;
  /** How far the X+ end moves in +Y, mm */
  shift: number;
} {
  const shift = -i.gantryWidth * Math.tan(i.squareness / DEG);
  // Change of (pull-off on the X+ side − pull-off on the X− side)
  const delta = i.homingPositive ? -shift : shift;
  const signed = i.motor1Side === 'xMax' ? delta : -delta;
  let p0 = i.pulloff0 - signed / 2;
  let p1 = i.pulloff1 + signed / 2;
  const low = Math.min(p0, p1) - (i.minimum ?? 1);
  if (low < 0) {
    p0 -= low;
    p1 -= low;
  }
  return {
    pulloff0: Number(p0.toFixed(3)),
    pulloff1: Number(p1.toFixed(3)),
    shift,
  };
}

/**
 * Tilt of the Z axis: the marker centred at two heights. The camera travels
 * along Z, so a sideways drift of the centred position is the tilt.
 */
export function zTilt(low: Vec, high: Vec, rise: number): { x: number; y: number; per100: number } {
  const dx = low.x - high.x;
  const dy = low.y - high.y;
  return {
    x: Math.atan2(dx, rise) * DEG,
    y: Math.atan2(dy, rise) * DEG,
    per100: (Math.hypot(dx, dy) / rise) * 100,
  };
}

/**
 * Zero and rotation of a workpiece from two holes: where they were found
 * (machine XY) and where they are in the job (work XY). Rotating the job by
 * `rotation` about the work origin and setting the origin to `origin` puts
 * both job holes onto the found ones. `distanceError` = found minus job
 * distance between the holes: large means a wrong hole or a wrong value.
 */
export function twoHoleAlignment(
  found: { a: Vec; b: Vec },
  job: { a: Vec; b: Vec },
): { rotation: number; origin: Vec; distanceError: number } | null {
  const fx = found.b.x - found.a.x;
  const fy = found.b.y - found.a.y;
  const jx = job.b.x - job.a.x;
  const jy = job.b.y - job.a.y;
  if (Math.hypot(jx, jy) < 1 || Math.hypot(fx, fy) < 1) return null;
  const r = Math.atan2(fy, fx) - Math.atan2(jy, jx);
  const rotation = ((((r * DEG + 180) % 360) + 360) % 360) - 180;
  const c = Math.cos(rotation / DEG);
  const s = Math.sin(rotation / DEG);
  return {
    rotation,
    origin: {
      x: found.a.x - (c * job.a.x - s * job.a.y),
      y: found.a.y - (s * job.a.x + c * job.a.y),
    },
    distanceError: Math.hypot(fx, fy) - Math.hypot(jx, jy),
  };
}

/** Distances between four marks cut at the corners of a rectangle, measured with a rule. */
export interface RectangleMeasure {
  /** A→B along X at the front, D→C along X at the back */
  bottom: number;
  top: number;
  /** A→D along Y on the left, B→C along Y on the right */
  left: number;
  right: number;
  /** A→C and B→D */
  diagonalAC: number;
  diagonalBD: number;
}

export interface RectangleCheck extends AxisErrors {
  /** How far front/back or left/right differ, mm (the shape is no parallelogram) */
  trapezoid: number;
}

/**
 * Scale and squareness from a test cut measured from outside: the machine
 * cuts marks A (0,0), B (X,0), C (X,Y), D (0,Y), a rule measures the sides
 * and diagonals. The marks carry the machine's errors, the rule does not.
 * With Y leaning towards +X by γ: AC² − BD² = 4·a·b·sin γ.
 */
export function rectangleCheck(nominal: Vec, m: RectangleMeasure): RectangleCheck | null {
  const values = [m.bottom, m.top, m.left, m.right, m.diagonalAC, m.diagonalBD];
  if (!values.every((v) => Number.isFinite(v) && v > 0) || nominal.x <= 0 || nominal.y <= 0) {
    return null;
  }
  const a = (m.bottom + m.top) / 2;
  const b = (m.left + m.right) / 2;
  const sin = (m.diagonalAC ** 2 - m.diagonalBD ** 2) / (4 * a * b);
  // More than ~6° is a mismeasured or mislabelled value, not a machine.
  if (Math.abs(sin) > 0.1) return null;
  // In a parallelogram the diagonals and sides fit: AC² + BD² = 2·(a² + b²).
  const closure = Math.abs(
    Math.sqrt((m.diagonalAC ** 2 + m.diagonalBD ** 2) / 2) - Math.sqrt(a * a + b * b),
  );
  return {
    scaleX: a / nominal.x,
    scaleY: b / nominal.y,
    squareness: Math.asin(sin) * DEG,
    plateAngle: 0,
    rms: closure,
    max: closure,
    points: 4,
    trapezoid: Math.max(Math.abs(m.top - m.bottom), Math.abs(m.right - m.left)),
  };
}
