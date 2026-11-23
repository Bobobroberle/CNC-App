import { ellipsePoints, quadraticPoints } from './curves';
import type { Contour, Point } from './geometry';
import { applyToPoint, compose, rotation, scaling, translation, type Matrix } from './transform';

/**
 * A single-line font for engraving: every letter is a few strokes the tool
 * centre follows, built from straight lines and arcs like the lettering on
 * technical drawings. It covers German (ÄÖÜäöüß), digits, the usual
 * punctuation and – through combining marks – the accents of neighbouring
 * languages. The glyphs are our own data: nothing is loaded at runtime.
 *
 * Glyph units: capital letters are 10 high, small letters 7, descenders
 * reach −3; x runs from 0 to the glyph's width. A glyph is written as
 *   M x y            start a stroke
 *   L x y            line
 *   O cx cy rx ry a0 a1   start a stroke with an arc of an ellipse (degrees, a1 > a0 = counter-clockwise)
 *   E cx cy rx ry a0 a1   continue the stroke with such an arc
 *   Q x1 y1 x y      quadratic curve
 */
interface Glyph {
  /** Width in glyph units, without the room to the next letter */
  w: number;
  d: string;
}

const CAP = 10;
const SMALL = 7;
/** Room between two letters, glyph units */
const GAP = 2;

const S = 'O3 7.4 2.8 2.6 30 270 E3 2.4 3 2.4 90 -150';
const BOWL = '2.5 3.5 2.5 3.5';

const GLYPHS: Record<string, Glyph> = {
  ' ': { w: 3, d: '' },
  A: { w: 7, d: 'M0 0 L3.5 10 L7 0 M1.05 3 L5.95 3' },
  B: {
    w: 6,
    d: 'M0 0 L0 10 L3.3 10 E3.3 7.6 2.3 2.4 90 -90 L0 5.2 M3.3 5.2 E3.3 2.6 2.7 2.6 90 -90 L0 0',
  },
  C: { w: 6.2, d: 'O3.5 5 3.5 5 45 315' },
  D: { w: 6.5, d: 'M0 0 L0 10 L2.5 10 E2.5 5 4 5 90 -90 L0 0' },
  E: { w: 5.5, d: 'M5.5 0 L0 0 L0 10 L5.5 10 M0 5.2 L4.5 5.2' },
  F: { w: 5.5, d: 'M0 0 L0 10 L5.5 10 M0 5.2 L4.5 5.2' },
  G: { w: 7, d: 'O3.5 5 3.5 5 45 360 L4 5' },
  H: { w: 6.5, d: 'M0 0 L0 10 M6.5 0 L6.5 10 M0 5.2 L6.5 5.2' },
  I: { w: 0, d: 'M0 0 L0 10' },
  J: { w: 4.5, d: 'M4.5 10 L4.5 2.5 E2.25 2.5 2.25 2.5 0 -180' },
  K: { w: 6.5, d: 'M0 0 L0 10 M6.3 10 L0 3.8 M2.3 6.06 L6.5 0' },
  L: { w: 5, d: 'M0 10 L0 0 L5 0' },
  M: { w: 8, d: 'M0 0 L0 10 L4 2.5 L8 10 L8 0' },
  N: { w: 6.5, d: 'M0 0 L0 10 L6.5 0 L6.5 10' },
  O: { w: 7, d: 'O3.5 5 3.5 5 90 450' },
  P: { w: 6, d: 'M0 0 L0 10 L3.3 10 E3.3 7.4 2.7 2.6 90 -90 L0 4.8' },
  Q: { w: 7.2, d: 'O3.5 5 3.5 5 90 450 M4.3 2.3 L7.2 -0.6' },
  R: { w: 6.2, d: 'M0 0 L0 10 L3.3 10 E3.3 7.4 2.7 2.6 90 -90 L0 4.8 M3.2 4.8 L6.2 0' },
  S: { w: 6, d: S },
  T: { w: 6.5, d: 'M0 10 L6.5 10 M3.25 10 L3.25 0' },
  U: { w: 6.5, d: 'M0 10 L0 3.25 E3.25 3.25 3.25 3.25 180 360 L6.5 10' },
  V: { w: 7, d: 'M0 10 L3.5 0 L7 10' },
  W: { w: 9.5, d: 'M0 10 L2.4 0 L4.75 8 L7.1 0 L9.5 10' },
  X: { w: 6.5, d: 'M0 0 L6.5 10 M0 10 L6.5 0' },
  Y: { w: 7, d: 'M0 10 L3.5 4.8 L7 10 M3.5 4.8 L3.5 0' },
  Z: { w: 6.5, d: 'M0 10 L6.5 10 L0 0 L6.5 0' },
  a: { w: 5, d: `O${BOWL} 0 360 M5 7 L5 0` },
  b: { w: 5, d: `M0 10 L0 0 O${BOWL} 180 540` },
  c: { w: 4.2, d: `O${BOWL} 50 310` },
  d: { w: 5, d: `O${BOWL} 0 360 M5 10 L5 0` },
  e: { w: 5, d: `M0 3.5 L5 3.5 E${BOWL} 0 310` },
  f: { w: 3.6, d: 'O2.4 8.6 1.4 1.4 30 180 L1 0 M0 7 L3 7' },
  g: { w: 5, d: `O${BOWL} 0 360 M5 7 L5 -0.6 E2.6 -0.6 2.4 2.4 0 -150` },
  h: { w: 5, d: 'M0 10 L0 0 M0 4.5 E2.5 4.5 2.5 2.5 180 0 L5 0' },
  i: { w: 0, d: 'M0 7 L0 0 M0 9 L0 9.8' },
  // Without their dots, for the accents that take the dot's place.
  ı: { w: 0, d: 'M0 7 L0 0' },
  j: { w: 1.5, d: 'M1.5 7 L1.5 -1.2 E0 -1.2 1.5 1.8 0 -100 M1.5 9 L1.5 9.8' },
  ȷ: { w: 1.5, d: 'M1.5 7 L1.5 -1.2 E0 -1.2 1.5 1.8 0 -100' },
  k: { w: 4.5, d: 'M0 10 L0 0 M4.3 7 L0 2.6 M1.6 4.24 L4.5 0' },
  l: { w: 1.2, d: 'M0 10 L0 1.2 E1.2 1.2 1.2 1.2 180 270' },
  m: { w: 8, d: 'M0 7 L0 0 M0 4.8 E2 4.8 2 2.2 180 0 L4 0 M4 4.8 E6 4.8 2 2.2 180 0 L8 0' },
  n: { w: 5, d: 'M0 7 L0 0 M0 4.5 E2.5 4.5 2.5 2.5 180 0 L5 0' },
  o: { w: 5, d: `O${BOWL} 90 450` },
  p: { w: 5, d: `M0 7 L0 -3 O${BOWL} 180 540` },
  q: { w: 5, d: `O${BOWL} 0 360 M5 7 L5 -3` },
  r: { w: 4.1, d: 'M0 7 L0 0 M0 4.5 E2.5 4.5 2.5 2.5 180 50' },
  s: { w: 4.4, d: 'O2.2 5.2 2.1 1.8 30 270 E2.2 1.7 2.2 1.7 90 -150' },
  t: { w: 3.2, d: 'M1 10 L1 1.4 E2.4 1.4 1.4 1.4 180 300 M0 7 L3 7' },
  u: { w: 5, d: 'M0 7 L0 2.5 E2.5 2.5 2.5 2.5 180 360 M5 7 L5 0' },
  v: { w: 5, d: 'M0 7 L2.5 0 L5 7' },
  w: { w: 7.5, d: 'M0 7 L1.9 0 L3.75 5.5 L5.6 0 L7.5 7' },
  x: { w: 5, d: 'M0 0 L5 7 M0 7 L5 0' },
  y: { w: 5, d: 'M0 7 L2.5 0 M5 7 L1.43 -3' },
  z: { w: 4.8, d: 'M0 7 L4.8 7 L0 0 L4.8 0' },
  ß: { w: 5.5, d: 'M0 0 L0 7.6 E2.3 7.6 2.3 2.4 180 -50 L2.6 5.2 E2.6 2.6 2.9 2.6 90 -115' },
  '0': { w: 6, d: 'O3 5 3 5 90 450' },
  '1': { w: 3, d: 'M0 7.6 L3 10 L3 0' },
  '2': { w: 6, d: 'O3 7.2 2.9 2.8 160 -40 L0 0 L6 0' },
  '3': { w: 6, d: 'O2.9 7.5 2.7 2.5 150 -90 E2.9 2.5 3.1 2.5 90 -150' },
  '4': { w: 6.5, d: 'M4.8 0 L4.8 10 L0 3 L6.5 3' },
  '5': { w: 6, d: 'M5.6 10 L0.8 10 L0.5 5.1 E2.9 3.1 3.1 3.1 140 -150' },
  '6': { w: 6, d: 'O3.5 4.4 3.5 5.6 55 180 L0 3.1 E3 3.1 3 3.1 180 540' },
  '7': { w: 6, d: 'M0 10 L6 10 L2 0' },
  '8': { w: 6, d: 'O3 7.5 2.6 2.5 -90 270 E3 2.5 3 2.5 90 -270' },
  '9': { w: 6, d: 'O2.5 5.6 3.5 5.6 235 360 L6 6.9 E3 6.9 3 3.1 0 360' },
  '.': { w: 0, d: 'M0 0 L0 0.8' },
  ',': { w: 0.6, d: 'M0.6 0.8 L0.6 0 L0 -1.5' },
  ':': { w: 0, d: 'M0 0 L0 0.8 M0 5 L0 5.8' },
  '·': { w: 0, d: 'M0 4 L0 4.8' },
  ';': { w: 0.6, d: 'M0.6 0.8 L0.6 0 L0 -1.5 M0.6 5 L0.6 5.8' },
  '!': { w: 0, d: 'M0 10 L0 2.8 M0 0 L0 0.8' },
  '?': { w: 5, d: 'O2.5 7.5 2.5 2.5 160 -45 L2.5 4.2 L2.5 2.8 M2.5 0 L2.5 0.8' },
  '-': { w: 4, d: 'M0 4 L4 4' },
  '–': { w: 6, d: 'M0 4 L6 4' },
  _: { w: 6, d: 'M0 -1 L6 -1' },
  '+': { w: 6, d: 'M0 4.5 L6 4.5 M3 1.5 L3 7.5' },
  '=': { w: 6, d: 'M0 3.2 L6 3.2 M0 5.8 L6 5.8' },
  '*': { w: 3.46, d: 'M1.73 5 L1.73 9 M0 6 L3.46 8 M0 8 L3.46 6' },
  '×': { w: 5, d: 'M0 2 L5 7 M0 7 L5 2' },
  '/': { w: 4.5, d: 'M0 0 L4.5 10' },
  '\\': { w: 4.5, d: 'M0 10 L4.5 0' },
  '(': { w: 1.5, d: 'O4 4.5 4 7.5 130 230' },
  ')': { w: 1.5, d: 'O-2.5 4.5 4 7.5 50 -50' },
  '[': { w: 2, d: 'M2 11 L0 11 L0 -1.5 L2 -1.5' },
  ']': { w: 2, d: 'M0 11 L2 11 L2 -1.5 L0 -1.5' },
  "'": { w: 0, d: 'M0 10 L0 7.5' },
  '"': { w: 1.8, d: 'M0 10 L0 7.5 M1.8 10 L1.8 7.5' },
  '„': { w: 1.8, d: 'M0 0.8 L0 -1.7 M1.8 0.8 L1.8 -1.7' },
  '#': { w: 7, d: 'M1.5 0 L2.5 10 M4.5 0 L5.5 10 M0 3.3 L6.6 3.3 M0.4 6.7 L7 6.7' },
  '%': { w: 6.5, d: 'M0 0 L6.5 10 O1.5 8.2 1.5 1.8 0 360 O5 1.8 1.5 1.8 0 360' },
  '&': {
    w: 6.5,
    d: 'M6.5 0 L1.5 6.4 E2.9 7.8 1.8 2.2 215 -40 L0.5 3.6 E2.8 2.6 2.8 2.6 160 380 L6.5 4.6',
  },
  '@': {
    w: 7.4,
    d: 'O4 4 1.6 1.8 0 360 M5.6 5.8 L5.6 3.1 E6.5 3.1 0.9 0.9 180 360 E3.7 4.2 3.7 4.6 0 310',
  },
  '°': { w: 2.4, d: 'O1.2 8.8 1.2 1.2 0 360' },
  '€': { w: 6.7, d: 'O4.2 5 3.5 5 45 315 M0 6 L4.4 6 M0 4 L4.4 4' },
  $: { w: 6, d: `${S} M3 11 L3 -1` },
  '<': { w: 5, d: 'M5 8 L0 4.5 L5 1' },
  '>': { w: 5, d: 'M0 8 L5 4.5 L0 1' },
  '|': { w: 0, d: 'M0 11 L0 -1.5' },
  '~': { w: 6, d: 'M0 4 Q1.5 6 3 4.5 Q4.5 3 6 5' },
  '^': { w: 4, d: 'M0 7.5 L2 10 L4 7.5' },
  Ø: { w: 7, d: 'O3.5 5 3.5 5 90 450 M0.3 -0.6 L6.7 10.6' },
  ø: { w: 5, d: `O${BOWL} 90 450 M0.3 -0.5 L4.7 7.5` },
};

/**
 * Combining marks, drawn for a small letter with x = 0 in its middle; over
 * a tall letter they are lifted. `below` marks hang under the baseline.
 */
const MARKS: Record<string, { d: string; below?: boolean }> = {
  '̈': { d: 'M-1.3 8.8 L-1.3 9.6 M1.3 8.8 L1.3 9.6' },
  '́': { d: 'M-0.8 8.4 L0.8 9.9' },
  '̀': { d: 'M-0.8 9.9 L0.8 8.4' },
  '̂': { d: 'M-1.5 8.4 L0 9.9 L1.5 8.4' },
  '̌': { d: 'M-1.5 9.9 L0 8.4 L1.5 9.9' },
  '̃': { d: 'M-1.8 8.7 Q-0.9 10.1 0 9.1 Q0.9 8.1 1.8 9.5' },
  '̊': { d: 'O0 9.3 0.9 0.9 0 360' },
  '̧': { d: 'M0.2 0 L-0.6 -2', below: true },
};

/** Other ways to write a character the font has. */
const ALIASES: Record<string, string> = {
  '\t': ' ',
  ' ': ' ',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '‚': ',',
  '—': '–',
  '−': '-',
  '…': '...',
  ẞ: 'SS',
};

type Stroke = Point[];

/** The strokes of a glyph description, in glyph units. */
function strokes(d: string, tolerance: number): Stroke[] {
  const out: Stroke[] = [];
  let stroke: Stroke = [];
  const deg = Math.PI / 180;
  for (const [, command, rest] of d.matchAll(/([MLOEQ])([^MLOEQ]*)/g)) {
    const n = rest!.trim().split(/\s+/).map(Number);
    const at = stroke[stroke.length - 1]!;
    if (command === 'M' || command === 'O') {
      stroke = [];
      out.push(stroke);
    }
    if (command === 'M' || command === 'L') {
      stroke.push({ x: n[0]!, y: n[1]! });
    } else if (command === 'Q') {
      stroke.push(
        ...quadraticPoints(at, { x: n[0]!, y: n[1]! }, { x: n[2]!, y: n[3]! }, tolerance),
      );
    } else {
      const points = ellipsePoints(
        {
          cx: n[0]!,
          cy: n[1]!,
          rx: n[2]!,
          ry: n[3]!,
          rotation: 0,
          a0: n[4]! * deg,
          sweep: (n[5]! - n[4]!) * deg,
        },
        tolerance,
      );
      // An arc that starts where the stroke stands does not repeat that point.
      const joined = command === 'E' && Math.hypot(points[0]!.x - at.x, points[0]!.y - at.y) < 1e-9;
      stroke.push(...(joined ? points.slice(1) : points));
    }
  }
  return out;
}

/** Every character the font can engrave (accented letters are built from these and the marks). */
export const FONT_CHARACTERS: readonly string[] = Object.keys(GLYPHS);

export type TextAlign = 'left' | 'center' | 'right';

export interface TextOptions {
  /** Height of the capital letters, mm */
  height: number;
  /** Extra room between letters as a fraction of the height; 0 is the font's own, negative is tighter */
  spacing?: number;
  /** From baseline to baseline, as a multiple of the height (default 1.6) */
  lineSpacing?: number;
  /** Which end of every line lies on the anchor (default left) */
  align?: TextAlign;
  /**
   * What the anchor's height means: the baseline of the first line
   * (default), or the middle of the whole block between the top of the
   * first line's capitals and the last baseline.
   */
  vertical?: 'baseline' | 'middle';
  /** The anchor, mm (default 0, 0) */
  x?: number;
  y?: number;
  /** The text turned around its anchor, degrees counter-clockwise */
  angle?: number;
  /** Largest deviation of the polylines from the true curves, mm (default 0.01) */
  tolerance?: number;
}

export interface TextLayout {
  /** The strokes, in reading order: open polylines, and closed ones for the round letters */
  contours: Contour[];
  /** Characters the font has no glyph for; each leaves a gap */
  missing: string[];
  /** Width of the widest line and height of the block (capitals of the first line to the last baseline), mm */
  width: number;
  height: number;
}

interface Placed {
  d: string;
  /** Where the glyph's origin goes, glyph units from the start of the line */
  x: number;
  y: number;
}

/** The glyphs of one line and its width in glyph units (without the room after the last letter). */
function layoutLine(
  line: string,
  gap: number,
  missing: Set<string>,
): { placed: Placed[]; width: number } {
  const placed: Placed[] = [];
  let x = 0;
  let base: { glyph: Glyph; x: number; tall: boolean } | null = null;
  const chars = [...line.normalize('NFD')].flatMap((ch) => [...(ALIASES[ch] ?? ch)]);
  chars.forEach((ch, i) => {
    const mark = MARKS[ch];
    if (mark) {
      if (!base) return;
      // Over a capital or a letter with an ascender the mark sits higher.
      const lift = mark.below || !base.tall ? 0 : CAP - SMALL;
      placed.push({ d: mark.d, x: base.x + base.glyph.w / 2, y: lift });
      return;
    }
    // A mark above takes the place of the dot of i and j.
    const next = MARKS[chars[i + 1] ?? ''];
    const key = next && !next.below ? ({ i: 'ı', j: 'ȷ' }[ch] ?? ch) : ch;
    const glyph = GLYPHS[key];
    if (!glyph) {
      missing.add(ch);
      base = null;
      x += GLYPHS[' ']!.w + gap;
      return;
    }
    placed.push({ d: glyph.d, x, y: 0 });
    base = { glyph, x, tall: /[A-ZØbdfhklt0-9]/.test(key) };
    x += glyph.w + gap;
  });
  return { placed, width: Math.max(0, x - gap) };
}

/**
 * Text as strokes for engraving: the tool centre follows them. `height` is
 * the height of the capital letters; the anchor (x, y) lies on the baseline
 * of the first line at its left end, middle or right end (`align`), further
 * lines follow below, and `angle` turns the whole text around the anchor.
 */
export function textContours(text: string, options: TextOptions): TextLayout {
  const scale = options.height / CAP;
  const gap = GAP + (options.spacing ?? 0) * CAP;
  const pitch = (options.lineSpacing ?? 1.6) * CAP;
  const align = options.align ?? 'left';
  const tolerance = (options.tolerance ?? 0.01) / scale;
  const missing = new Set<string>();
  const lines = text.split(/\r?\n/).map((line) => layoutLine(line, gap, missing));
  const block = CAP + (lines.length - 1) * pitch;
  const top = options.vertical === 'middle' ? block / 2 - CAP : 0;
  const pose: Matrix = compose(
    compose(translation(options.x ?? 0, options.y ?? 0), rotation(options.angle ?? 0)),
    scaling(scale),
  );
  const contours: Contour[] = [];
  lines.forEach((line, row) => {
    const left = align === 'left' ? 0 : align === 'center' ? -line.width / 2 : -line.width;
    for (const g of line.placed) {
      for (const stroke of strokes(g.d, tolerance)) {
        const points = stroke.map((p) =>
          applyToPoint(pose, { x: left + g.x + p.x, y: top - row * pitch + g.y + p.y }),
        );
        const first = stroke[0]!;
        const last = stroke[stroke.length - 1]!;
        const closed = stroke.length > 3 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-9;
        if (closed) points.pop();
        contours.push({ points, closed });
      }
    }
  });
  return {
    contours,
    missing: [...missing],
    width: Math.max(...lines.map((l) => l.width)) * scale,
    height: block * scale,
  };
}
