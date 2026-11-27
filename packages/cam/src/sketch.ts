import { textContours, type TextAlign, type TextOptions } from './font';
import { contourBounds, type Bounds, type Contour } from './geometry';
import { circle, ellipse, gear, rectangle, slot, spiral, star, type Radii } from './shapes';

/**
 * A drawn thing by its own measures. As long as an item of the drawing
 * keeps these, its contours can be made anew at any time: a rectangle is
 * made wider, a text gets other words. Where it lies is not part of it.
 */
export type Sketch =
  /**
   * A rectangle with one corner radius `r` – or, where `radii` is there, a radius for each corner (`Radii`:
   * lower left, lower right, upper right, upper left), which then replaces `r`. `tidySketch` keeps `r` as the
   * largest of them, and drops `radii` again where the four are equal – so a plain rectangle never carries it.
   */
  | { type: 'rect'; w: number; h: number; r: number; radii?: Radii }
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

/**
 * The curved and toothed shapes, each by its own measures and around its own origin (what is a corner of
 * the part and what is a chord of a curve is said at `ellipse`, `star`, `gear` and `spiral` in `shapes.ts`).
 * Kept apart from `Sketch` so that code that handles exactly the older types keeps compiling; every function
 * here takes the wider `AnySketch` and gives back the narrower type for a narrower argument.
 */
export type ShapeSketch =
  /** Radii along x and y; a curve, never corners */
  | { type: 'ellipse'; rx: number; ry: number }
  /** `points` tips on the circle `outer`, as many notches on the circle `inner` (the first tip points up) */
  | { type: 'star'; points: number; outer: number; inner: number }
  /** A toothed wheel (trapezoid teeth, not an involute) of `teeth` teeth between the circles `root` and `outer` */
  | { type: 'gear'; teeth: number; outer: number; root: number }
  /** An open Archimedean spiral of `turns` turns from the radius `start` to the radius `end`: an engraving line */
  | { type: 'spiral'; turns: number; start: number; end: number };

/** Everything the drawing can make from its own measures */
export type AnySketch = Sketch | ShapeSketch;

export type SketchType = Sketch['type'];
export type AnySketchType = AnySketch['type'];

/** Nothing drawn is smaller than this, mm: it can still be seen and taken hold of. */
export const SKETCH_MIN = 0.5;
/** Nothing drawn is larger than this, mm – a part of the table is at most about half of it. */
export const SKETCH_MAX = 5000;

/**
 * The ranges a drawn thing's measures keep, for the fields of the interface and for a file that is read.
 * `tidySketch` brings a measure into its range (a count is also made whole); `validateSketch` refuses
 * a length or radius outside it. A number that is none (NaN, ±Infinity) becomes the smallest value.
 */
export const SKETCH_LIMITS = {
  /** Widths, lengths, diameters, pitches and the height of a text, mm */
  length: { min: SKETCH_MIN, max: SKETCH_MAX },
  /** Radii of an ellipse, star, gear and spiral, mm: half a length (a spiral's may be 0 at one end) */
  radius: { min: SKETCH_MIN / 2, max: SKETCH_MAX / 2 },
  /** Holes of a grid along one side */
  gridCount: { min: 1, max: 50 },
  starPoints: { min: 3, max: 32 },
  gearTeeth: { min: 6, max: 80 },
  /** Turns of a spiral, quarter turns and more */
  spiralTurns: { min: 0.25, max: 50 },
  /**
   * No shape made within these limits has more vertices than this (the largest is a spiral of 50 turns out to
   * the largest radius, about 56 000 – the tests build it)
   */
  vertices: 65_000,
} as const;

/** The smallest and largest of a measure, as `SKETCH_LIMITS` has them */
type Range = { readonly min: number; readonly max: number };

const atLeast = (v: number, min = SKETCH_MIN) => (Number.isFinite(v) ? Math.max(min, v) : min);
const count = (n: number) =>
  Math.min(SKETCH_LIMITS.gridCount.max, Math.round(atLeast(n, SKETCH_LIMITS.gridCount.min)));
/** A radius of a curved shape: in its range */
const radius = (v: number) =>
  Math.min(SKETCH_LIMITS.radius.max, atLeast(v, SKETCH_LIMITS.radius.min));
/** A measure in its range, whole where it counts something */
const within = (v: number, range: Range) => Math.min(range.max, atLeast(v, range.min));
const whole = (v: number, range: Range) => Math.round(within(v, range));

/**
 * The sketch with measures that can be drawn: nothing too small, a radius that fits, whole counts.
 * The curved shapes also stay within `SKETCH_LIMITS`; a star's inner and a gear's root radius are never
 * larger than the outer one (equal, they are a polygon on one circle); a spiral has a radius of at least
 * `SKETCH_LIMITS.radius.min` at one end. A rectangle's four radii are each held to half of the shorter
 * side, and four equal ones are the single `r`.
 */
export function tidySketch(s: Sketch): Sketch;
export function tidySketch(s: ShapeSketch): ShapeSketch;
export function tidySketch(s: AnySketch): AnySketch;
export function tidySketch(s: AnySketch): AnySketch {
  switch (s.type) {
    case 'rect': {
      const w = atLeast(s.w);
      const h = atLeast(s.h);
      if (!s.radii) return { type: 'rect', w, h, r: Math.min(atLeast(s.r, 0), w / 2, h / 2) };
      const radii = s.radii.map((v) => Math.min(atLeast(v, 0), w / 2, h / 2)) as unknown as Radii;
      return radii.every((v) => v === radii[0])
        ? { type: 'rect', w, h, r: radii[0] }
        : { type: 'rect', w, h, r: Math.max(...radii), radii };
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
    case 'ellipse':
      return { type: 'ellipse', rx: radius(s.rx), ry: radius(s.ry) };
    case 'star': {
      const outer = radius(s.outer);
      return {
        type: 'star',
        points: whole(s.points, SKETCH_LIMITS.starPoints),
        outer,
        inner: Math.min(outer, radius(s.inner)),
      };
    }
    case 'gear': {
      const outer = radius(s.outer);
      return {
        type: 'gear',
        teeth: whole(s.teeth, SKETCH_LIMITS.gearTeeth),
        outer,
        root: Math.min(outer, radius(s.root)),
      };
    }
    case 'spiral': {
      const start = Math.min(SKETCH_LIMITS.radius.max, atLeast(s.start, 0));
      const end = Math.min(SKETCH_LIMITS.radius.max, atLeast(s.end, 0));
      return {
        type: 'spiral',
        turns: within(s.turns, SKETCH_LIMITS.spiralTurns),
        start,
        // both ends at nothing would be a point
        end: start < SKETCH_LIMITS.radius.min ? Math.max(end, SKETCH_LIMITS.radius.min) : end,
      };
    }
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
 * The contours of a sketch around its own origin: the middle of a shape (of a star, a gear and a spiral
 * the middle of its circles), the anchor of a text (on the first baseline, at the end `align` names).
 * `missing` lists characters the font does not have. A circle, a grid hole and an ellipse of two equal
 * radii are the only contours that carry the `circle` of an exact circle; the spiral is the one open contour.
 */
export function sketchContours(sketch: AnySketch): { contours: Contour[]; missing: string[] } {
  const s = tidySketch(sketch);
  switch (s.type) {
    case 'rect':
      return {
        contours: [rectangle(-s.w / 2, -s.h / 2, s.w, s.h, s.radii ?? s.r)],
        missing: [],
      };
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
    case 'ellipse':
      return { contours: [ellipse(0, 0, s.rx, s.ry)], missing: [] };
    case 'star':
      return { contours: [star(0, 0, s.points, s.outer, s.inner)], missing: [] };
    case 'gear':
      return { contours: [gear(0, 0, s.teeth, s.outer, s.root)], missing: [] };
    case 'spiral':
      return { contours: [spiral(0, 0, s.turns, s.start, s.end)], missing: [] };
  }
}

/**
 * How wide and high a shape is along its own axes, mm. A text has no such
 * measure of its own: its strokes say how large it is.
 */
export function sketchSize(sketch: AnySketch): { w: number; h: number } | null {
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
    case 'ellipse':
      return { w: 2 * s.rx, h: 2 * s.ry };
    case 'star':
    case 'gear':
    case 'spiral': {
      const box = sketchBox(s)!;
      return { w: box.maxX - box.minX, h: box.maxY - box.minY };
    }
  }
}

/**
 * The box of a shape in its own coordinates; null for a text. It is centred on the origin for a rectangle,
 * circle, slot, grid and ellipse – and NOT for the rest: the origin of a star or a gear is the middle of its
 * circles, a spiral's is its centre, so their boxes are the true bounds of the made contours (a five-pointed
 * star reaches further up than down). A frame built on it must not assume the origin lies in the middle.
 */
export function sketchBox(sketch: AnySketch): Bounds | null {
  const s = tidySketch(sketch);
  switch (s.type) {
    case 'star':
    case 'gear':
    case 'spiral':
      return contourBounds(sketchContours(s).contours);
    default: {
      const size = sketchSize(s);
      return size && { minX: -size.w / 2, minY: -size.h / 2, maxX: size.w / 2, maxY: size.h / 2 };
    }
  }
}

/**
 * Whether a sketch keeps its proportions when a handle changes its size: a circle, a text, a star, a gear
 * and a spiral have one size only (a star squeezed along one axis would be no star), an ellipse two.
 */
export const sketchKeepsProportions = (s: AnySketch): boolean =>
  s.type === 'circle' ||
  s.type === 'text' ||
  s.type === 'star' ||
  s.type === 'gear' ||
  s.type === 'spiral';

/**
 * The sketch made `kx` times as wide and `ky` times as high (along its own
 * axes). A circle and a text only know one size and take `kx`, so do a star, a gear and a spiral (all their
 * radii are made `kx` times as large, the number of tips, teeth and turns stays); an ellipse takes
 * its radii from `kx` and `ky`; a hole grid keeps its holes and their number and changes the distance
 * between them.
 */
export function scaleSketch(s: Sketch, kx: number, ky: number): Sketch;
export function scaleSketch(s: ShapeSketch, kx: number, ky: number): ShapeSketch;
export function scaleSketch(s: AnySketch, kx: number, ky: number): AnySketch;
export function scaleSketch(s: AnySketch, kx: number, ky: number): AnySketch {
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
    case 'ellipse':
      return tidySketch({ ...s, rx: s.rx * kx, ry: s.ry * ky });
    case 'star':
    case 'gear':
    case 'spiral':
      return magnifySketch(s, kx);
  }
}

/**
 * The sketch magnified `k` times as a whole – every measure of it, as a
 * magnifying glass would: what a file's contours do when they are scaled.
 */
export function magnifySketch(s: Sketch, k: number): Sketch;
export function magnifySketch(s: ShapeSketch, k: number): ShapeSketch;
export function magnifySketch(s: AnySketch, k: number): AnySketch;
export function magnifySketch(s: AnySketch, k: number): AnySketch {
  switch (s.type) {
    case 'rect':
      return tidySketch({
        ...s,
        w: s.w * k,
        h: s.h * k,
        r: s.r * k,
        radii: s.radii?.map((v) => v * k) as unknown as Radii | undefined,
      });
    case 'circle':
      return tidySketch({ ...s, d: s.d * k });
    case 'slot':
      return tidySketch({ ...s, l: s.l * k, w: s.w * k });
    case 'grid':
      return tidySketch({ ...s, d: s.d * k, px: s.px * k, py: s.py * k });
    case 'text':
      return tidySketch({ ...s, height: s.height * k });
    case 'ellipse':
      return tidySketch({ ...s, rx: s.rx * k, ry: s.ry * k });
    case 'star':
      return tidySketch({ ...s, outer: s.outer * k, inner: s.inner * k });
    case 'gear':
      return tidySketch({ ...s, outer: s.outer * k, root: s.root * k });
    case 'spiral':
      return tidySketch({ ...s, start: s.start * k, end: s.end * k });
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** A number above 0 and at most `max` */
const upTo = (v: unknown, max: number): v is number => num(v) && v > 0 && v <= max;
const isRadii = (v: unknown): v is Radii => Array.isArray(v) && v.length === 4 && v.every(num);

/**
 * A sketch read from something that may not be one – a project file: the sketch brought into its ranges
 * (`tidySketch`), or null where it cannot be trusted and the item should keep the contours it has.
 * Accepted is a sketch of a known type whose measures are numbers that are finite (a text: a string and one
 * of the three alignments); a length is above 0 and at most `SKETCH_MAX`, a radius above 0 and at most
 * `SKETCH_LIMITS.radius.max` (a spiral's may be 0, not below), a count above 0; a rectangle's `r` is any
 * number and its `radii` four numbers. A count or radius that is too large or too small for its shape is not
 * refused but brought in by `tidySketch` (a star of 99 tips has 32), as the app has always done with a
 * grid; a length or radius above the limits is refused – nobody draws it, and it would make a very
 * large polygon. What the object holds besides the measures is dropped.
 */
export function validateSketch(value: unknown): AnySketch | null {
  if (!isObject(value)) return null;
  const v = value;
  const length = (x: unknown): x is number => upTo(x, SKETCH_MAX);
  const reach = (x: unknown): x is number => upTo(x, SKETCH_LIMITS.radius.max);
  const positive = (x: unknown): x is number => num(x) && x > 0;
  switch (v.type) {
    case 'rect':
      return length(v.w) && length(v.h) && num(v.r) && (v.radii === undefined || isRadii(v.radii))
        ? tidySketch({ type: 'rect', w: v.w, h: v.h, r: v.r, radii: v.radii })
        : null;
    case 'circle':
      return length(v.d) ? tidySketch({ type: 'circle', d: v.d }) : null;
    case 'slot':
      return length(v.l) && length(v.w) ? tidySketch({ type: 'slot', l: v.l, w: v.w }) : null;
    case 'grid':
      return length(v.d) && positive(v.nx) && positive(v.ny) && length(v.px) && length(v.py)
        ? tidySketch({ type: 'grid', d: v.d, nx: v.nx, ny: v.ny, px: v.px, py: v.py })
        : null;
    case 'text':
      return typeof v.text === 'string' &&
        length(v.height) &&
        num(v.spacing) &&
        num(v.lineSpacing) &&
        (v.align === 'left' || v.align === 'center' || v.align === 'right')
        ? tidySketch({
            type: 'text',
            text: v.text,
            height: v.height,
            spacing: v.spacing,
            lineSpacing: v.lineSpacing,
            align: v.align,
          })
        : null;
    case 'ellipse':
      return reach(v.rx) && reach(v.ry)
        ? tidySketch({ type: 'ellipse', rx: v.rx, ry: v.ry })
        : null;
    case 'star':
      return positive(v.points) && reach(v.outer) && reach(v.inner)
        ? tidySketch({ type: 'star', points: v.points, outer: v.outer, inner: v.inner })
        : null;
    case 'gear':
      return positive(v.teeth) && reach(v.outer) && reach(v.root)
        ? tidySketch({ type: 'gear', teeth: v.teeth, outer: v.outer, root: v.root })
        : null;
    case 'spiral':
      return positive(v.turns) && spiralEnd(v.start) && spiralEnd(v.end)
        ? tidySketch({ type: 'spiral', turns: v.turns, start: v.start, end: v.end })
        : null;
    default:
      return null;
  }
}

/** A radius of a spiral's end: 0 up to the largest radius */
const spiralEnd = (x: unknown): x is number => num(x) && x >= 0 && x <= SKETCH_LIMITS.radius.max;
