import type { AnySketch, AnySketchType } from '@lowrider/cam';

/** What a tap on a shape puts on the table: a usual size, changed there afterwards. */
export const START: Record<Exclude<AnySketchType, 'text'>, AnySketch> = {
  rect: { type: 'rect', w: 100, h: 60, r: 0 },
  circle: { type: 'circle', d: 20 },
  slot: { type: 'slot', l: 60, w: 10 },
  grid: { type: 'grid', d: 6, nx: 3, ny: 2, px: 30, py: 30 },
  // "Weitere Grundformen": a closed one is cut outside with tabs like any outline, the spiral is a line (engraved)
  ellipse: { type: 'ellipse', rx: 40, ry: 25 },
  star: { type: 'star', points: 5, outer: 30, inner: 12 },
  gear: { type: 'gear', teeth: 16, outer: 30, root: 24 },
  spiral: { type: 'spiral', turns: 4, start: 2, end: 30 },
};

/** The shapes of the row of tiles; the others are folded away under "Weitere Grundformen" */
export const SHAPES = ['rect', 'circle', 'slot', 'grid'] as const;
export const MORE_SHAPES = ['ellipse', 'star', 'gear', 'spiral'] as const;
