import type { Bounds } from '@lowrider/cam';

/**
 * What the table view shows right now, in work coordinates – asked by the
 * drawing workspace, so a new shape appears where the eye is. The table
 * view provides it while it is on the stage.
 */
let reader: (() => Bounds | null) | null = null;

/** The table view says how to read its box; returns the function that takes it back. */
export function provideTableBox(read: () => Bounds | null): () => void {
  reader = read;
  return () => {
    if (reader === read) reader = null;
  };
}

/** The work box in view, or null without a table view. */
export const tableBox = (): Bounds | null => reader?.() ?? null;

/**
 * Where a new thing of the drawing goes so that it is seen: `wanted` (the
 * middle of what it goes on) when that is in view or nothing is known of
 * the view, else the middle of the view on whole millimetres.
 */
export function inViewSpot(
  view: Bounds | null,
  wanted: { x: number; y: number },
): { x: number; y: number } {
  if (!view) return wanted;
  const inside =
    wanted.x >= view.minX &&
    wanted.x <= view.maxX &&
    wanted.y >= view.minY &&
    wanted.y <= view.maxY;
  if (inside) return wanted;
  return {
    x: Math.round((view.minX + view.maxX) / 2),
    y: Math.round((view.minY + view.maxY) / 2),
  };
}
