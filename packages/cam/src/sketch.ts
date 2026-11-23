import { textContours, type TextAlign, type TextOptions } from './font';
import type { Bounds, Contour } from './geometry';
import { circle, rectangle, slot } from './shapes';

/**
 * A drawn thing by its own measures. As long as an item of the drawing
 * keeps these, its contours can be made anew at any time: a rectangle is
 * made wider, a text gets other words. Where it lies is not part of it.
 */
export type Sketch =
  | { type: 'rect'; w: number; h: number; r: number }
  | { type: 'circle'; d: number }
  /** A long hole: `l` from end to end, `w` across */
  | { type: 'slot'; l: number; w: number }
  /** Holes of diameter `d` in `nx` columns and `ny` rows, `px`/`py` from centre to centre */
  | { type: 'grid'; d: number; nx: number; ny: number; px: number; py: number }
  | {
      type: 'text';
      text: string;
      /** Height of the capital letters, mm */
      height: number;
      /** Extra room between letters and from line to line, as `TextOptions` has them */
      spacing: number;
      lineSpacing: number;
      align: TextAlign;
    };

export type SketchType = Sketch['type'];

/** Nothing drawn is smaller than this, mm: it can still be seen and taken hold of. */
export const SKETCH_MIN = 0.5;
/** Most holes of a grid along one side */
const GRID_MAX = 50;

const atLeast = (v: number, min = SKETCH_MIN) => (Number.isFinite(v) ? Math.max(min, v) : min);
const count = (n: number) => Math.min(GRID_MAX, Math.round(atLeast(n, 1)));

/** The sketch with measures that can be drawn: nothing too small, a radius that fits, whole counts. */
export function tidySketch(s: Sketch): Sketch {
  switch (s.type) {
    case 'rect': {
      const w = atLeast(s.w);
      const h = atLeast(s.h);
      return { type: 'rect', w, h, r: Math.min(atLeast(s.r, 0), w / 2, h / 2) };
    }
    case 'circle':
      return { type: 'circle', d: atLeast(s.d) };
    case 'slot': {
      const l = atLeast(s.l);
      // Wider than long it would be a circle.
      return { type: 'slot', l, w: Math.min(atLeast(s.w), l) };
    }
    case 'grid': {
      const d = atLeast(s.d);
      return {
        type: 'grid',
        d,
        nx: count(s.nx),
        ny: count(s.ny),
        px: atLeast(s.px),
        py: atLeast(s.py),
      };
    }
    case 'text':
      return {
        ...s,
        height: atLeast(s.height),
        spacing: Number.isFinite(s.spacing) ? s.spacing : 0,
        lineSpacing: atLeast(s.lineSpacing, 0.1),
      };
  }
}

/** How a text sketch is set: its anchor is the origin, on the first baseline. */
export const sketchTextOptions = (s: Sketch & { type: 'text' }): TextOptions => ({
  height: s.height,
  spacing: s.spacing,
  lineSpacing: s.lineSpacing,
  align: s.align,
});

/**
 * The contours of a sketch around its own origin: the middle of a shape,
 * the anchor of a text (on the first baseline, at the end `align` names).
 * `missing` lists characters the font does not have.
 */
export function sketchContours(sketch: Sketch): { contours: Contour[]; missing: string[] } {
  const s = tidySketch(sketch);
  switch (s.type) {
    case 'rect':
      return { contours: [rectangle(-s.w / 2, -s.h / 2, s.w, s.h, s.r)], missing: [] };
    case 'circle':
      return { contours: [circle(0, 0, s.d)], missing: [] };
    case 'slot':
      return { contours: [slot(0, 0, s.l, s.w)], missing: [] };
    case 'grid': {
      const contours: Contour[] = [];
      for (let j = 0; j < s.ny; j++) {
        for (let i = 0; i < s.nx; i++) {
          contours.push(circle((i - (s.nx - 1) / 2) * s.px, (j - (s.ny - 1) / 2) * s.py, s.d));
        }
      }
      return { contours, missing: [] };
    }
    case 'text': {
      const layout = textContours(s.text, sketchTextOptions(s));
      return { contours: layout.contours, missing: layout.missing };
    }
  }
}

/**
 * How wide and high a shape is along its own axes, mm. A text has no such
 * measure of its own: its strokes say how large it is.
 */
export function sketchSize(sketch: Sketch): { w: number; h: number } | null {
  const s = tidySketch(sketch);
  switch (s.type) {
    case 'rect':
      return { w: s.w, h: s.h };
    case 'circle':
      return { w: s.d, h: s.d };
    case 'slot':
      return { w: s.l, h: s.w };
    case 'grid':
      return { w: (s.nx - 1) * s.px + s.d, h: (s.ny - 1) * s.py + s.d };
    case 'text':
      return null;
  }
}

/** The box of a shape around its own middle; null for a text. */
export function sketchBox(sketch: Sketch): Bounds | null {
  const size = sketchSize(sketch);
  return size && { minX: -size.w / 2, minY: -size.h / 2, maxX: size.w / 2, maxY: size.h / 2 };
}

/** Whether a sketch keeps its proportions when a handle changes its size. */
export const sketchKeepsProportions = (s: Sketch): boolean =>
  s.type === 'circle' || s.type === 'text';

/**
 * The sketch made `kx` times as wide and `ky` times as high (along its own
 * axes). A circle and a text only know one size and take `kx`; a hole grid
 * keeps its holes and their number and changes the distance between them.
 */
export function scaleSketch(s: Sketch, kx: number, ky: number): Sketch {
  switch (s.type) {
    case 'rect':
      return tidySketch({ ...s, w: s.w * kx, h: s.h * ky });
    case 'circle':
      return tidySketch({ ...s, d: s.d * kx });
    case 'slot':
      return tidySketch({ ...s, l: s.l * kx, w: s.w * ky });
    case 'grid': {
      // From rim to rim: (n − 1) · pitch + d. A single row or column has no pitch to change.
      const pitch = (n: number, p: number, k: number) =>
        n > 1 ? Math.max(s.d, (((n - 1) * p + s.d) * k - s.d) / (n - 1)) : p;
      return tidySketch({ ...s, px: pitch(s.nx, s.px, kx), py: pitch(s.ny, s.py, ky) });
    }
    case 'text':
      return tidySketch({ ...s, height: s.height * kx });
  }
}

/**
 * The sketch magnified `k` times as a whole – every measure of it, as a
 * magnifying glass would: what a file's contours do when they are scaled.
 */
export function magnifySketch(s: Sketch, k: number): Sketch {
  switch (s.type) {
    case 'rect':
      return tidySketch({ ...s, w: s.w * k, h: s.h * k, r: s.r * k });
    case 'circle':
      return tidySketch({ ...s, d: s.d * k });
    case 'slot':
      return tidySketch({ ...s, l: s.l * k, w: s.w * k });
    case 'grid':
      return tidySketch({ ...s, d: s.d * k, px: s.px * k, py: s.py * k });
    case 'text':
      return tidySketch({ ...s, height: s.height * k });
  }
}
