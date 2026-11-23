import {
  checkCollisions,
  isEmptyBounds,
  type Bounds,
  type Box,
  type Collision,
  type Fixture,
  type Segment,
} from '@lowrider/gcode-core';
import type { Tool } from '@lowrider/workshop';

/** Stock around the job when none was entered: cut area plus a margin, top at Z0. */
export function defaultStock(bounds: Bounds, margin = 5): Box | null {
  if (isEmptyBounds(bounds)) return null;
  return {
    min: { x: bounds.min.x - margin, y: bounds.min.y - margin, z: Math.min(bounds.min.z, -1) },
    max: { x: bounds.max.x + margin, y: bounds.max.y + margin, z: 0 },
  };
}

/** Stock from its size with the work zero at the front left top corner. */
export function stockFromSize(x: number, y: number, z: number): Box {
  return { min: { x: 0, y: 0, z: -z }, max: { x, y, z: 0 } };
}

/**
 * LowRider gantry: the lowest part of the Z carriage/gantry above the tool
 * tip is roughly the stickout plus the collet nut and the Z plate. 60 mm is
 * a conservative default until measured.
 */
export const GANTRY_CLEARANCE = 60;
export const GANTRY_DEPTH = 120;

/** How far the tool tip must stay above a clamp's top before the job is flagged, mm */
export const CLAMP_MARGIN = 2;

export function jobCollisions(
  segments: readonly Segment[],
  stock: Box,
  fixtures: readonly Fixture[],
  tool: Pick<Tool, 'diameter' | 'stickout' | 'holderDiameter'>,
): Collision[] {
  return checkCollisions(segments, {
    stock,
    fixtures,
    toolDiameter: tool.diameter,
    stickout: tool.stickout,
    holderDiameter: tool.holderDiameter,
    gantry: { clearance: tool.stickout + GANTRY_CLEARANCE, depth: GANTRY_DEPTH },
  });
}

/** How far the program's feeds exceed the suggestion (1 = equal), or null without feeds. */
export function feedRatio(feedRange: { max: number } | null, suggestedFeed: number): number | null {
  if (!feedRange || suggestedFeed <= 0) return null;
  return feedRange.max / suggestedFeed;
}

/**
 * The library tool for a T number of the job: the operator's choice, else
 * the tool with that number; for files without T words (Estlcam) the first
 * flat cutter with the diameter named in the CAM header.
 */
export function toolForJob<T extends Pick<Tool, 'id' | 'number' | 'diameter' | 'kind'>>(
  tools: readonly T[],
  toolMap: Readonly<Record<number, string>>,
  n: number,
  headerDiameter?: number | null,
): T | undefined {
  const chosen = tools.find((x) => x.id === toolMap[n]);
  if (chosen) return chosen;
  if (n === 0 && headerDiameter) {
    const same = tools.filter((x) => Math.abs(x.diameter - headerDiameter) < 0.01);
    const named = same.find((x) => x.kind === 'flat') ?? same[0];
    if (named) return named;
  }
  return tools.find((x) => x.number === n) ?? tools[0];
}
