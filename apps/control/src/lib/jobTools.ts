import type { Segment } from '@lowrider/gcode-core';
import type { Tool } from '@lowrider/workshop';

/**
 * ② Werkzeuge: what the job asks of each of its tools against what the tool
 * list knows – its state and why, and what else from the list would do.
 */
export type ToolIssue =
  /** No tool can stand for it: the tool list is empty */
  | 'none'
  /** The list does not name this tool itself; the one shown is only the nearest guess */
  | 'unknown'
  /** The job cuts deeper with it than its cutting length */
  | 'fluteShort'
  /** Its diameter is not the one the CAM header names */
  | 'diameter'
  /** It is marked as a probe and the program switches the spindle on */
  | 'probe';
export type ToolState = 'ok' | 'warn' | 'block';

/** How much deeper than the cutting length still counts as within it, mm */
const FLUTE_TOLERANCE = 0.05;

/** The deepest cut per tool number, mm below the work zero (0 for a tool that never cuts below it). */
export function toolDepths(
  segments: readonly Pick<Segment, 'tool' | 'motion' | 'to'>[],
): Map<number, number> {
  const depths = new Map<number, number>();
  for (const s of segments) {
    if (s.motion === 'rapid') continue;
    depths.set(s.tool, Math.max(depths.get(s.tool) ?? 0, -s.to.z));
  }
  return depths;
}

export function toolIssues(input: {
  tool: Pick<Tool, 'diameter' | 'fluteLength' | 'probe'> | undefined;
  known: boolean;
  /** Deepest cut with this tool, mm */
  depth: number;
  /** Diameter the CAM header names for it, if any */
  wanted?: number | null;
  spindleOn: boolean;
}): ToolIssue[] {
  const { tool, known, depth, wanted, spindleOn } = input;
  if (!tool) return ['none'];
  const issues: ToolIssue[] = [];
  if (!known) issues.push('unknown');
  if (depth > tool.fluteLength + FLUTE_TOLERANCE) issues.push('fluteShort');
  if (wanted && Math.abs(tool.diameter - wanted) > 0.01) issues.push('diameter');
  if (tool.probe && spindleOn) issues.push('probe');
  return issues;
}

export const toolState = (issues: readonly ToolIssue[]): ToolState =>
  issues.includes('none') ? 'block' : issues.length > 0 ? 'warn' : 'ok';

/**
 * Tools of the list that could take this one's place with one tap: the same
 * diameter (the header's, else the current tool's), long enough for the cut,
 * no probe – at most three, the same kind first.
 */
export function alternatives<
  T extends Pick<Tool, 'id' | 'diameter' | 'fluteLength' | 'probe' | 'kind'>,
>(tools: readonly T[], current: T | undefined, depth: number, wanted?: number | null): T[] {
  const diameter = wanted ?? current?.diameter;
  if (!diameter) return [];
  return tools
    .filter(
      (x) =>
        x.id !== current?.id &&
        !x.probe &&
        Math.abs(x.diameter - diameter) < 0.01 &&
        depth <= x.fluteLength + FLUTE_TOLERANCE,
    )
    .sort((a, b) => Number(b.kind === current?.kind) - Number(a.kind === current?.kind))
    .slice(0, 3);
}
