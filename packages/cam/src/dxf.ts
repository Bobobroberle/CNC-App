import { arcPoints, distance, type Contour, type Point } from './geometry';

export interface DxfDrawing {
  contours: Contour[];
  /** Entity types that were skipped, with their count (TEXT, INSERT, HATCH, …) */
  skipped: Record<string, number>;
  /** Scale applied from $INSUNITS to millimetres */
  unitScale: number;
}

export interface DxfOptions {
  /** Largest deviation of a polyline from an arc or spline, mm */
  tolerance?: number;
  /** Ends closer than this are joined into one contour, mm */
  joinTolerance?: number;
}

/** $INSUNITS → millimetres; unknown or unitless drawings count as millimetres. */
const UNITS: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

type Pair = [code: number, value: string];

function pairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (!Number.isInteger(code)) throw new Error(`DXF: invalid group code in line ${i + 1}`);
    out.push([code, lines[i + 1]!.trim()]);
  }
  return out;
}

/** One entity: its type and its group codes in order (codes repeat in polylines). */
interface Entity {
  type: string;
  codes: Pair[];
}

function entities(all: Pair[]): { list: Entity[]; insunits: number } {
  const list: Entity[] = [];
  let insunits = 0;
  let section = '';
  let current: Entity | null = null;
  for (let i = 0; i < all.length; i++) {
    const [code, value] = all[i]!;
    if (code === 0 && value === 'SECTION') {
      section = all[i + 1]?.[1] ?? '';
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      if (current) list.push(current);
      current = null;
      section = '';
      continue;
    }
    if (section === 'HEADER' && code === 9 && value === '$INSUNITS') {
      insunits = Number(all[i + 1]?.[1] ?? 0);
      continue;
    }
    if (section !== 'ENTITIES') continue;
    if (code === 0) {
      if (current) list.push(current);
      current = { type: value, codes: [] };
    } else {
      current?.codes.push([code, value]);
    }
  }
  return { list, insunits };
}

const num = (e: Entity, code: number, fallback = 0) => {
  const hit = e.codes.find(([c]) => c === code);
  return hit ? Number(hit[1]) : fallback;
};
const layerOf = (e: Entity) => e.codes.find(([c]) => c === 8)?.[1];
const deg = (d: number) => (d * Math.PI) / 180;

/** Points of a bulged polyline segment from a to b (bulge = tan(sweep / 4)). */
function bulgeSegment(a: Point, b: Point, bulge: number, tolerance: number): Point[] {
  if (Math.abs(bulge) < 1e-9) return [b];
  const sweep = 4 * Math.atan(bulge);
  const chord = distance(a, b);
  const r = chord / (2 * Math.sin(Math.abs(sweep) / 2));
  // Centre: from the chord midpoint along the normal.
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // Negative beyond a half circle: the centre then lies on the other side.
  const h = r * Math.cos(Math.abs(sweep) / 2);
  const nx = -(b.y - a.y) / chord;
  const ny = (b.x - a.x) / chord;
  const side = Math.sign(bulge);
  const cx = mx + side * nx * h;
  const cy = my + side * ny * h;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  return arcPoints(cx, cy, r, a0, sweep, tolerance).slice(1);
}

function polyline(vertices: { p: Point; bulge: number }[], closed: boolean, tol: number): Point[] {
  if (vertices.length === 0) return [];
  const out: Point[] = [vertices[0]!.p];
  const n = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < n; i++) {
    const v = vertices[i]!;
    const next = vertices[(i + 1) % vertices.length]!;
    out.push(...bulgeSegment(v.p, next.p, v.bulge, tol));
  }
  // A closed polyline came back to its start: drop the repeated point.
  if (closed && out.length > 1) out.pop();
  return out;
}

function lwVertices(e: Entity): { p: Point; bulge: number }[] {
  const out: { p: Point; bulge: number }[] = [];
  for (const [code, value] of e.codes) {
    if (code === 10) out.push({ p: { x: Number(value), y: 0 }, bulge: 0 });
    else if (code === 20 && out.length > 0) out[out.length - 1]!.p.y = Number(value);
    else if (code === 42 && out.length > 0) out[out.length - 1]!.bulge = Number(value);
  }
  return out;
}

/** de Boor for a (rational) B-spline at parameter u. */
function deBoor(
  u: number,
  degree: number,
  knots: number[],
  ctrl: Point[],
  weights: number[],
): Point {
  let k = degree;
  while (k < ctrl.length - 1 && u >= knots[k + 1]!) k++;
  const d = Array.from({ length: degree + 1 }, (_, j) => {
    const p = ctrl[j + k - degree]!;
    const w = weights[j + k - degree] ?? 1;
    return { x: p.x * w, y: p.y * w, w };
  });
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = j + k - degree;
      // Never zero: k is the knot span that contains u.
      const alpha = (u - knots[i]!) / (knots[i + degree - r + 1]! - knots[i]!);
      const a = d[j - 1]!;
      const b = d[j]!;
      d[j] = {
        x: (1 - alpha) * a.x + alpha * b.x,
        y: (1 - alpha) * a.y + alpha * b.y,
        w: (1 - alpha) * a.w + alpha * b.w,
      };
    }
  }
  const p = d[degree]!;
  return { x: p.x / p.w, y: p.y / p.w };
}

function spline(e: Entity, tol: number): { points: Point[]; closed: boolean } {
  const degree = num(e, 71, 3);
  const closed = (num(e, 70) & 1) === 1;
  const knots: number[] = [];
  const weights: number[] = [];
  const ctrl: Point[] = [];
  const fit: Point[] = [];
  for (const [code, value] of e.codes) {
    if (code === 40) knots.push(Number(value));
    else if (code === 41) weights.push(Number(value));
    else if (code === 10) ctrl.push({ x: Number(value), y: 0 });
    else if (code === 20) ctrl[ctrl.length - 1]!.y = Number(value);
    else if (code === 11) fit.push({ x: Number(value), y: 0 });
    else if (code === 21) fit[fit.length - 1]!.y = Number(value);
  }
  if (ctrl.length <= degree || knots.length !== ctrl.length + degree + 1) {
    // No usable control net: fall back to the fit points as a polyline.
    return { points: fit, closed };
  }
  const u0 = knots[degree]!;
  const u1 = knots[ctrl.length]!;
  let length = 0;
  for (let i = 1; i < ctrl.length; i++) length += distance(ctrl[i - 1]!, ctrl[i]!);
  // Dense enough for the tolerance on curves of a few millimetres radius.
  const n = Math.min(4000, Math.max(16, Math.ceil(length / Math.sqrt(8 * tol * 2))));
  const points: Point[] = [];
  for (let k = 0; k <= n; k++) {
    points.push(deBoor(u0 + ((u1 - u0) * k) / n, degree, knots, ctrl, weights));
  }
  if (closed && points.length > 1 && distance(points[0]!, points[points.length - 1]!) < 1e-6) {
    points.pop();
  }
  return { points, closed };
}

function ellipse(e: Entity, tol: number): { points: Point[]; closed: boolean } {
  const cx = num(e, 10);
  const cy = num(e, 20);
  const mx = num(e, 11);
  const my = num(e, 21);
  const ratio = num(e, 40, 1);
  const t0 = num(e, 41, 0);
  const t1 = num(e, 42, 2 * Math.PI);
  const a = Math.hypot(mx, my);
  const rot = Math.atan2(my, mx);
  let sweep = t1 - t0;
  if (sweep <= 0) sweep += 2 * Math.PI;
  const closed = Math.abs(sweep - 2 * Math.PI) < 1e-6;
  const step = a > tol ? 2 * Math.acos(1 - tol / a) : Math.PI / 2;
  const n = Math.max(8, Math.ceil(sweep / step));
  const points: Point[] = [];
  for (let k = 0; k <= (closed ? n - 1 : n); k++) {
    const t = t0 + (sweep * k) / n;
    const x = a * Math.cos(t);
    const y = a * ratio * Math.sin(t);
    points.push({
      x: cx + x * Math.cos(rot) - y * Math.sin(rot),
      y: cy + x * Math.sin(rot) + y * Math.cos(rot),
    });
  }
  return { points, closed };
}

/** Open pieces whose ends meet become one contour; a chain back to its start is closed. */
export function joinPieces(pieces: Contour[], tolerance: number): Contour[] {
  const open = pieces.filter((p) => !p.closed && p.points.length > 1);
  const done = pieces.filter((p) => p.closed || p.points.length <= 1);
  const used = new Array<boolean>(open.length).fill(false);
  for (let i = 0; i < open.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain = [...open[i]!.points];
    let grown = true;
    while (grown) {
      grown = false;
      for (let j = 0; j < open.length; j++) {
        if (used[j]) continue;
        const pts = open[j]!.points;
        const head = chain[0]!;
        const tail = chain[chain.length - 1]!;
        if (distance(tail, pts[0]!) <= tolerance) chain.push(...pts.slice(1));
        else if (distance(tail, pts[pts.length - 1]!) <= tolerance)
          chain.push(...[...pts].reverse().slice(1));
        else if (distance(head, pts[pts.length - 1]!) <= tolerance)
          chain.unshift(...pts.slice(0, -1));
        else if (distance(head, pts[0]!) <= tolerance)
          chain.unshift(...[...pts].reverse().slice(0, -1));
        else continue;
        used[j] = true;
        grown = true;
      }
    }
    const closed = chain.length > 2 && distance(chain[0]!, chain[chain.length - 1]!) <= tolerance;
    if (closed) chain.pop();
    done.push({ points: chain, closed, layer: open[i]!.layer });
  }
  return done;
}

/**
 * Reads the 2D geometry of an ASCII DXF (as exported by Fusion, Inkscape,
 * LibreCAD, QCAD …) in millimetres: lines and arcs joined into contours,
 * circles, polylines with bulges, splines and ellipses.
 */
export function readDxf(text: string, options: DxfOptions = {}): DxfDrawing {
  const tol = options.tolerance ?? 0.01;
  const { list, insunits } = entities(pairs(text));
  const unitScale = UNITS[insunits] ?? 1;
  const pieces: Contour[] = [];
  const skipped: Record<string, number> = {};
  for (const e of list) {
    // Mirrored object coordinate system (extrusion 0,0,−1): x flips.
    const fx = num(e, 230, 1) < 0 ? -1 : 1;
    const layer = layerOf(e);
    switch (e.type) {
      case 'LINE':
        pieces.push({
          points: [
            { x: num(e, 10), y: num(e, 20) },
            { x: num(e, 11), y: num(e, 21) },
          ],
          closed: false,
          layer,
        });
        break;
      case 'CIRCLE': {
        const cx = fx * num(e, 10);
        const cy = num(e, 20);
        const r = num(e, 40);
        const points = arcPoints(cx, cy, r, 0, 2 * Math.PI, tol);
        points.pop();
        pieces.push({ points, closed: true, circle: { cx, cy, r }, layer });
        break;
      }
      case 'ARC': {
        const r = num(e, 40);
        let a0 = deg(num(e, 50));
        let a1 = deg(num(e, 51));
        if (fx < 0) [a0, a1] = [Math.PI - a1, Math.PI - a0];
        let sweep = a1 - a0;
        while (sweep <= 0) sweep += 2 * Math.PI;
        pieces.push({
          points: arcPoints(fx * num(e, 10), num(e, 20), r, a0, sweep, tol),
          closed: false,
          layer,
        });
        break;
      }
      case 'LWPOLYLINE': {
        const closed = (num(e, 70) & 1) === 1;
        const vertices = lwVertices(e).map((v) => ({
          p: { x: fx * v.p.x, y: v.p.y },
          bulge: fx * v.bulge,
        }));
        pieces.push({ points: polyline(vertices, closed, tol), closed, layer });
        break;
      }
      case 'POLYLINE':
      case 'VERTEX':
      case 'SEQEND':
        break;
      case 'SPLINE':
        pieces.push({ ...spline(e, tol), layer });
        break;
      case 'ELLIPSE':
        pieces.push({ ...ellipse(e, tol), layer });
        break;
      default:
        skipped[e.type] = (skipped[e.type] ?? 0) + 1;
    }
  }
  pieces.push(...oldPolylines(list, tol));
  const scaled = pieces.map((c) => scale(c, unitScale));
  return {
    contours: joinPieces(scaled, options.joinTolerance ?? 0.02).filter((c) => c.points.length > 1),
    skipped,
    unitScale,
  };
}

/** POLYLINE … VERTEX … SEQEND (older DXF and some exporters). */
function oldPolylines(list: Entity[], tol: number): Contour[] {
  const out: Contour[] = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i]!.type !== 'POLYLINE') continue;
    const head = list[i]!;
    const closed = (num(head, 70) & 1) === 1;
    const vertices: { p: Point; bulge: number }[] = [];
    for (i++; i < list.length && list[i]!.type === 'VERTEX'; i++) {
      const v = list[i]!;
      vertices.push({ p: { x: num(v, 10), y: num(v, 20) }, bulge: num(v, 42) });
    }
    out.push({ points: polyline(vertices, closed, tol), closed, layer: layerOf(head) });
  }
  return out;
}

function scale(c: Contour, k: number): Contour {
  if (k === 1) return c;
  return {
    ...c,
    points: c.points.map((p) => ({ x: p.x * k, y: p.y * k })),
    circle: c.circle && { cx: c.circle.cx * k, cy: c.circle.cy * k, r: c.circle.r * k },
  };
}
