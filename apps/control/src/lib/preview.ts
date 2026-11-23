import type { Segment } from '@lowrider/gcode-core';

/**
 * The small picture of a job on its card: its cutting moves seen from above,
 * as one SVG path in a box of `PREVIEW_BOX` units (y up on the table, down
 * in the picture). Thinned out, so that a long program stays a short string.
 */
export const PREVIEW_BOX = 100;
const MARGIN = 4;
/** How many points a preview keeps at most */
const MAX_POINTS = 400;

type Seg = Pick<Segment, 'motion' | 'from' | 'to'>;

export function previewPath(segments: readonly Seg[]): string {
  const cuts = segments.filter(
    (s) => s.motion !== 'rapid' && (s.from.x !== s.to.x || s.from.y !== s.to.y),
  );
  if (cuts.length === 0) return '';
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of cuts) {
    for (const p of [s.from, s.to]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const size = Math.max(maxX - minX, maxY - minY, 1e-6);
  const k = (PREVIEW_BOX - 2 * MARGIN) / size;
  // Centred in the box, whatever its proportions.
  const ox = (PREVIEW_BOX - (maxX - minX) * k) / 2;
  const oy = (PREVIEW_BOX - (maxY - minY) * k) / 2;
  const px = (x: number) => Math.round((ox + (x - minX) * k) * 10) / 10;
  const py = (y: number) => Math.round((PREVIEW_BOX - oy - (y - minY) * k) * 10) / 10;
  const every = Math.max(1, Math.ceil(cuts.length / MAX_POINTS));
  let d = '';
  let last: { x: number; y: number } | null = null;
  cuts.forEach((s, i) => {
    const joined = last !== null && last.x === s.from.x && last.y === s.from.y;
    // A new stroke always starts where it starts; inside a stroke points are thinned out.
    if (!joined) d += `M${px(s.from.x)} ${py(s.from.y)}`;
    const next = cuts[i + 1];
    const ends = !next || next.from.x !== s.to.x || next.from.y !== s.to.y;
    if (!joined || ends || i % every === 0) d += `L${px(s.to.x)} ${py(s.to.y)}`;
    last = s.to;
  });
  return d;
}
