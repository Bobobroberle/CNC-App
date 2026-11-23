import { cubicPoints, ellipsePoints, quadraticPoints, svgArc } from './curves';
import { joinPieces } from './dxf';
import { arcPoints, bounds, type Contour, type Point } from './geometry';
import {
  applyToPoint,
  compose,
  IDENTITY,
  largestScale,
  rotation,
  scaling,
  translation,
  uniformScale,
  type Matrix,
} from './transform';

/**
 * What the SVG reader left out or had to assume:
 * `svg-text` – text that is not converted to paths; `svg-image` – embedded
 * pictures; `svg-use` – references to other elements (clones, symbols);
 * `svg-element` – other elements it does not know; `svg-path` – path data
 * with an error, read up to it; `svg-transform` – a transform it could not
 * read; `svg-units` – no size in real units, read at 96 px per inch.
 */
export type SvgNoteCode =
  | 'svg-text'
  | 'svg-image'
  | 'svg-use'
  | 'svg-element'
  | 'svg-path'
  | 'svg-transform'
  | 'svg-units';

export interface SvgNote {
  code: SvgNoteCode;
  count: number;
}

export interface SvgDrawing {
  /** Millimetres, y upwards: the lower left corner of the page is 0, 0 */
  contours: Contour[];
  notes: SvgNote[];
  /** Millimetres per unit of the drawing */
  unitScale: number;
}

export interface SvgOptions {
  /** Largest deviation of a polyline from a curve, mm */
  tolerance?: number;
  /** Ends closer than this are joined into one contour, mm */
  joinTolerance?: number;
}

/** Millimetres per CSS unit; a bare number counts as px (96 per inch). */
const UNITS: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  px: 25.4 / 96,
  '': 25.4 / 96,
};

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

interface Tag {
  name: string;
  attributes: Record<string, string>;
  kind: 'open' | 'close' | 'empty';
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** The tags of an XML text in order; comments, declarations and character data are left out. */
function tags(text: string): Tag[] {
  const out: Tag[] = [];
  const pattern =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (const m of text.matchAll(pattern)) {
    if (m[1]) {
      out.push({ name: m[1], attributes: {}, kind: 'close' });
    } else if (m[2]) {
      const attributes: Record<string, string> = {};
      for (const a of m[3]!.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attributes[a[1]!] = (a[2] ?? a[3]!).replace(
          /&(lt|gt|amp|quot|apos);/g,
          (_, name: string) => ENTITIES[name]!,
        );
      }
      out.push({ name: m[2], attributes, kind: m[4] ? 'empty' : 'open' });
    }
  }
  return out;
}

/** A length with its unit in millimetres; null for percentages and anything unreadable. */
function length(text: string | undefined): { mm: number; real: boolean } | null {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(text ?? '');
  const unit = m?.[2]!.toLowerCase();
  if (!m || UNITS[unit!] === undefined) return null;
  return { mm: Number(m[1]) * UNITS[unit!]!, real: unit !== '' && unit !== 'px' };
}

/** The numbers in a list like "1,2 3-4". */
function numbers(text: string): number[] {
  return (text.match(new RegExp(NUMBER.source, 'g')) ?? []).map(Number);
}

/** A transform attribute as one matrix; null when it cannot be read. */
function transformOf(text: string): Matrix | null {
  let m = IDENTITY;
  let rest = text.trim();
  while (rest.length > 0) {
    const hit = /^(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)[\s,]*/.exec(rest);
    if (!hit) return null;
    rest = rest.slice(hit[0].length);
    const n = numbers(hit[2]!);
    const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);
    let step: Matrix | null = null;
    if (hit[1] === 'matrix' && n.length === 6) {
      step = { a: n[0]!, b: n[1]!, c: n[2]!, d: n[3]!, e: n[4]!, f: n[5]! };
    } else if (hit[1] === 'translate' && (n.length === 1 || n.length === 2)) {
      step = translation(n[0]!, n[1] ?? 0);
    } else if (hit[1] === 'scale' && (n.length === 1 || n.length === 2)) {
      step = scaling(n[0]!, n[1] ?? n[0]!);
    } else if (hit[1] === 'rotate' && (n.length === 1 || n.length === 3)) {
      step = rotation(n[0]!, { x: n[1] ?? 0, y: n[2] ?? 0 });
    } else if (hit[1] === 'skewX' && n.length === 1) {
      step = { ...IDENTITY, c: tan(n[0]!) };
    } else if (hit[1] === 'skewY' && n.length === 1) {
      step = { ...IDENTITY, b: tan(n[0]!) };
    }
    if (!step) return null;
    m = compose(m, step);
  }
  return m;
}

interface PathCommand {
  command: string;
  args: number[];
}

const ARGUMENTS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };

/** The commands of path data; `complete` is false when it stops at an error. */
export function pathCommands(d: string): { commands: PathCommand[]; complete: boolean } {
  const commands: PathCommand[] = [];
  let i = 0;
  let command = '';
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++;
  };
  const number = (): number | null => {
    skip();
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(d);
    if (!m) return null;
    i = NUMBER.lastIndex;
    return Number(m[0]);
  };
  // The two flags of an arc are single digits and may stand without a separator.
  const flag = (): number | null => {
    skip();
    const ch = d[i];
    if (ch !== '0' && ch !== '1') return null;
    i++;
    return Number(ch);
  };
  for (;;) {
    skip();
    if (i >= d.length) return { commands, complete: true };
    const ch = d[i]!;
    if (/[a-z]/i.test(ch)) {
      i++;
      command = ch;
      if (ch === 'Z' || ch === 'z') {
        commands.push({ command, args: [] });
        command = '';
        continue;
      }
      if (ARGUMENTS[ch.toUpperCase()] === undefined) return { commands, complete: false };
    } else if (command === '') {
      return { commands, complete: false };
    }
    const upper = command.toUpperCase();
    const args: number[] = [];
    for (let k = 0; k < ARGUMENTS[upper]!; k++) {
      const v = upper === 'A' && (k === 3 || k === 4) ? flag() : number();
      if (v === null) return { commands, complete: false };
      args.push(v);
    }
    commands.push({ command, args });
    // Further coordinate pairs after a move are lines.
    if (command === 'M') command = 'L';
    if (command === 'm') command = 'l';
  }
}

type Control = { kind: 'C' | 'Q'; p: Point } | null;

/**
 * Collects the outlines of shapes: takes points and curves in the drawing's
 * units, maps them to millimetres and cuts curves there, so the tolerance
 * holds on the table.
 */
class Pen {
  readonly pieces: Contour[] = [];
  private points: Point[] = [];
  /** In the drawing's units: where the pen stands and where the subpath began */
  private at: Point = { x: 0, y: 0 };
  private start: Point = { x: 0, y: 0 };

  constructor(
    private readonly m: Matrix,
    private readonly tolerance: number,
  ) {}

  private map(p: Point): Point {
    return applyToPoint(this.m, p);
  }

  private last(): Point {
    // After a close (or at the very start) drawing goes on from where the pen stands.
    if (this.points.length === 0) this.points.push(this.map(this.at));
    return this.points[this.points.length - 1]!;
  }

  private finish(closed: boolean) {
    const points = this.points;
    this.points = [];
    if (closed && points.length > 1) {
      const a = points[0]!;
      const b = points[points.length - 1]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) points.pop();
    }
    if (points.length > 1) this.pieces.push({ points, closed: closed && points.length > 2 });
  }

  moveTo(p: Point) {
    this.finish(false);
    this.at = p;
    this.start = p;
  }

  lineTo(p: Point) {
    this.last();
    this.points.push(this.map(p));
    this.at = p;
  }

  quadTo(c: Point, p: Point) {
    this.points.push(...quadraticPoints(this.last(), this.map(c), this.map(p), this.tolerance));
    this.at = p;
  }

  cubicTo(c1: Point, c2: Point, p: Point) {
    this.points.push(
      ...cubicPoints(this.last(), this.map(c1), this.map(c2), this.map(p), this.tolerance),
    );
    this.at = p;
  }

  arcTo(rx: number, ry: number, degrees: number, large: boolean, sweep: boolean, p: Point) {
    const arc = svgArc(this.at, rx, ry, degrees, large, sweep, p);
    if (!arc) {
      // SVG: a radius of zero is a straight line, the same end point is nothing.
      if (p.x !== this.at.x || p.y !== this.at.y) this.lineTo(p);
      return;
    }
    this.last();
    const points = ellipsePoints(arc, this.tolerance, largestScale(this.m));
    this.points.push(...points.slice(1, -1).map((q) => this.map(q)), this.map(p));
    this.at = p;
  }

  close() {
    this.finish(true);
    this.at = this.start;
  }

  end() {
    this.finish(false);
  }

  /** Path data, absolute and relative. */
  path(commands: readonly PathCommand[]) {
    // The control point the smooth commands mirror, if the last command set one.
    let control: Control = null;
    for (const { command, args: a } of commands) {
      const upper = command.toUpperCase();
      const relative = command !== upper;
      const at = this.at;
      const point = (x: number, y: number): Point =>
        relative ? { x: at.x + x, y: at.y + y } : { x, y };
      const mirrored = (kind: 'C' | 'Q'): Point =>
        control?.kind === kind ? { x: 2 * at.x - control.p.x, y: 2 * at.y - control.p.y } : at;
      let next: Control = null;
      if (upper === 'M') this.moveTo(point(a[0]!, a[1]!));
      else if (upper === 'L') this.lineTo(point(a[0]!, a[1]!));
      else if (upper === 'H') this.lineTo({ x: relative ? at.x + a[0]! : a[0]!, y: at.y });
      else if (upper === 'V') this.lineTo({ x: at.x, y: relative ? at.y + a[0]! : a[0]! });
      else if (upper === 'C' || upper === 'S') {
        const c1 = upper === 'C' ? point(a[0]!, a[1]!) : mirrored('C');
        const rest = upper === 'C' ? a.slice(2) : a;
        const c2 = point(rest[0]!, rest[1]!);
        this.cubicTo(c1, c2, point(rest[2]!, rest[3]!));
        next = { kind: 'C', p: c2 };
      } else if (upper === 'Q' || upper === 'T') {
        const c = upper === 'Q' ? point(a[0]!, a[1]!) : mirrored('Q');
        const rest = upper === 'Q' ? a.slice(2) : a;
        this.quadTo(c, point(rest[0]!, rest[1]!));
        next = { kind: 'Q', p: c };
      } else if (upper === 'A') {
        this.arcTo(a[0]!, a[1]!, a[2]!, a[3] === 1, a[4] === 1, point(a[5]!, a[6]!));
      } else this.close();
      control = next;
    }
    this.end();
  }

  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.moveTo({ x: cx + rx, y: cy });
    this.arcTo(rx, ry, 0, false, true, { x: cx - rx, y: cy });
    this.arcTo(rx, ry, 0, false, true, { x: cx + rx, y: cy });
    this.close();
  }

  polyline(points: readonly number[], closed: boolean) {
    for (let i = 0; i + 1 < points.length; i += 2) {
      const p = { x: points[i]!, y: points[i + 1]! };
      if (i === 0) this.moveTo(p);
      else this.lineTo(p);
    }
    if (closed) this.close();
    else this.end();
  }
}

/** Containers whose children are drawn like their own. */
const GROUPS = new Set(['svg', 'g', 'a', 'switch']);
/** Elements that draw nothing themselves; their content is not part of the picture. */
const SILENT = new Set([
  'defs',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'symbol',
  'metadata',
  'style',
  'script',
  'title',
  'desc',
  'linearGradient',
  'radialGradient',
  'filter',
  'animate',
  'animateTransform',
  'animateMotion',
  'set',
  'view',
]);
const NOTED: Record<string, SvgNoteCode> = { text: 'svg-text', image: 'svg-image', use: 'svg-use' };

/**
 * Reads the geometry of an SVG (as exported by Inkscape, Illustrator,
 * Affinity, Figma …) in millimetres with y upwards: paths with all their
 * commands, rectangles, circles, ellipses, lines, polylines and polygons,
 * through the transforms of their groups. The size comes from width/height
 * and the viewBox; without real units a unit counts as 1/96 inch.
 */
export function readSvg(text: string, options: SvgOptions = {}): SvgDrawing {
  const tolerance = options.tolerance ?? 0.01;
  const all = tags(text);
  const rootAt = all.findIndex(
    (tag) => tag.kind !== 'close' && tag.name.replace(/^.*:/, '') === 'svg',
  );
  if (rootAt < 0) throw new Error('SVG: no <svg> element');
  const root = all[rootAt]!.attributes;
  const counts = new Map<SvgNoteCode, number>();
  const note = (code: SvgNoteCode) => counts.set(code, (counts.get(code) ?? 0) + 1);

  // Page size and scale: the viewBox mapped onto width × height.
  const box = numbers(root.viewBox ?? '');
  const width = length(root.width);
  const height = length(root.height);
  const viewBox = box.length === 4 && box[2]! > 0 && box[3]! > 0 ? box : null;
  let unitScale = UNITS.px!;
  if (viewBox && (width || height)) {
    unitScale = Math.min(
      width ? width.mm / viewBox[2]! : Infinity,
      height ? height.mm / viewBox[3]! : Infinity,
    );
  }
  if (!(width?.real || height?.real)) note('svg-units');
  // Millimetres with y upwards; the page's lower edge, where it is known, becomes y = 0.
  const pageHeight = viewBox ? viewBox[3]! * unitScale : (height?.mm ?? null);
  const base: Matrix = {
    a: unitScale,
    b: 0,
    c: 0,
    d: -unitScale,
    e: viewBox ? -viewBox[0]! * unitScale : 0,
    f: viewBox ? (viewBox[1]! + viewBox[3]!) * unitScale : (pageHeight ?? 0),
  };

  const pieces: Contour[] = [];
  /** Matrices of the open elements; null for a subtree that is not drawn */
  const stack: (Matrix | null)[] = [];
  for (const tag of all.slice(rootAt)) {
    if (tag.kind === 'close') {
      stack.pop();
      continue;
    }
    const parent = stack.length > 0 ? stack[stack.length - 1]! : base;
    const push = (m: Matrix | null) => {
      if (tag.kind === 'open') stack.push(m);
    };
    const name = tag.name.replace(/^svg:/, '');
    const a = tag.attributes;
    const hidden = a.display === 'none' || /display\s*:\s*none/.test(a.style ?? '');
    // Not drawn: inside something skipped, hidden, or from another vocabulary (Inkscape's own data).
    if (parent === null || hidden || name.includes(':') || SILENT.has(name)) {
      push(null);
      continue;
    }
    if (NOTED[name]) {
      note(NOTED[name]);
      push(null);
      continue;
    }
    let m = parent;
    if (a.transform !== undefined) {
      const own = transformOf(a.transform);
      if (own) m = compose(parent, own);
      else note('svg-transform');
    }
    const n = (key: string) => {
      const v = Number.parseFloat(a[key] ?? '');
      return Number.isFinite(v) ? v : 0;
    };
    if (GROUPS.has(name)) {
      // An inner <svg> is placed by x and y (its own viewBox is not applied).
      push(name === 'svg' && stack.length > 0 ? compose(m, translation(n('x'), n('y'))) : m);
      continue;
    }
    const pen = new Pen(m, tolerance);
    if (name === 'path') {
      const { commands, complete } = pathCommands(a.d ?? '');
      if (!complete) note('svg-path');
      pen.path(commands);
    } else if (name === 'rect') {
      const w = n('width');
      const h = n('height');
      // One corner radius alone counts for both; none is larger than half the side.
      const rx = Math.min(w / 2, a.rx !== undefined ? n('rx') : n('ry'));
      const ry = Math.min(h / 2, a.ry !== undefined ? n('ry') : n('rx'));
      const x = n('x');
      const y = n('y');
      if (w > 0 && h > 0) {
        pen.path(
          rx > 0 && ry > 0
            ? pathCommands(
                `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} ` +
                  `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} ` +
                  `V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`,
              ).commands
            : pathCommands(`M${x} ${y} H${x + w} V${y + h} H${x} Z`).commands,
        );
      }
    } else if (name === 'circle' || name === 'ellipse') {
      const rx = name === 'circle' ? n('r') : n('rx');
      const ry = name === 'circle' ? n('r') : n('ry');
      const k = uniformScale(m);
      if (rx > 0 && ry > 0 && rx === ry && k !== null) {
        // Still round on the table: an exact circle, for drilling and arcs.
        const c = applyToPoint(m, { x: n('cx'), y: n('cy') });
        const points = arcPoints(c.x, c.y, rx * k, 0, 2 * Math.PI, tolerance);
        points.pop();
        pieces.push({ points, closed: true, circle: { cx: c.x, cy: c.y, r: rx * k } });
      } else if (rx > 0 && ry > 0) {
        pen.ellipse(n('cx'), n('cy'), rx, ry);
      }
    } else if (name === 'line') {
      pen.polyline([n('x1'), n('y1'), n('x2'), n('y2')], false);
    } else if (name === 'polyline' || name === 'polygon') {
      pen.polyline(numbers(a.points ?? ''), name === 'polygon');
    } else {
      note('svg-element');
      push(null);
      continue;
    }
    pieces.push(...pen.pieces);
    push(null);
  }

  let contours = joinPieces(pieces, options.joinTolerance ?? 0.02).filter(
    (c) => c.points.length > 1,
  );
  if (pageHeight === null && contours.length > 0) {
    // No page to stand on: the drawing's own lower edge becomes y = 0.
    const lift = -bounds(contours.flatMap((c) => c.points)).minY;
    contours = contours.map((c) => ({
      ...c,
      points: c.points.map((p) => ({ x: p.x, y: p.y + lift })),
      ...(c.circle ? { circle: { ...c.circle, cy: c.circle.cy + lift } } : {}),
    }));
  }
  return {
    contours,
    notes: [...counts].map(([code, count]) => ({ code, count })),
    unitScale,
  };
}
