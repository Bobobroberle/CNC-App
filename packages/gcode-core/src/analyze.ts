import { emptyBounds, includeSegment, programBounds, type Bounds } from './geometry';
import { interpret, type InterpreterOptions } from './interpreter';
import { splitLines } from './parser';
import { estimateTime, type Kinematics, type Timeline } from './time';
import type { Diagnostic, ProgramEvent, Segment } from './types';

export interface ProgramAnalysis {
  lineCount: number;
  segments: Segment[];
  events: ProgramEvent[];
  diagnostics: Diagnostic[];
  /** All moves except G53 machine moves */
  bounds: Bounds;
  /** Feed moves only (what touches material) */
  cutBounds: Bounds;
  /**
   * The tools the program uses (feed moves and tool changes), sorted by number. For the order the program
   * uses them in – what "the first tool" means – see `toolOrder`.
   */
  tools: number[];
  /**
   * The same tools in the order of their first use in the program: a feed move with the tool or a tool change
   * to it, whichever comes first. `tools` is sorted by number, so its first entry is the first tool only where the
   * program happens to use them in rising order; ask `toolOrder[0]` for the tool the job starts with.
   */
  toolOrder: number[];
  usesRotary: boolean;
  /** Min/max programmed feed of G94 feed moves (mm/min), null if none */
  feedRange: { min: number; max: number } | null;
  /** Path lengths in mm */
  rapidLength: number;
  feedLength: number;
  timeline: Timeline | null;
}

export interface AnalyzeOptions extends InterpreterOptions {
  /** If given, the run time is estimated with these machine limits. */
  kinematics?: Kinematics;
}

export function analyzeProgram(text: string, options: AnalyzeOptions = {}): ProgramAnalysis {
  const { kinematics, ...interpreterOptions } = options;
  const result = interpret(text, interpreterOptions);
  const { segments, events } = result;

  const tools = new Set<number>();
  /** In the order of first use; a tool change stands before the segment that follows it */
  const toolOrder = new Set<number>();
  let usesRotary = false;
  let rapidLength = 0;
  let feedLength = 0;
  let minFeed = Infinity;
  let maxFeed = -Infinity;
  const changes = events.filter((e) => e.kind === 'toolChange');
  let nextChange = 0;
  for (const s of segments) {
    for (
      ;
      nextChange < changes.length && changes[nextChange]!.segmentIndex <= s.index;
      nextChange++
    ) {
      toolOrder.add(changes[nextChange]!.tool!);
    }
    if (s.from.a !== s.to.a) usesRotary = true;
    if (s.motion === 'rapid') {
      rapidLength += s.length;
    } else {
      feedLength += s.length;
      tools.add(s.tool);
      toolOrder.add(s.tool);
      if (s.feedMode === 'unitsPerMinute') {
        minFeed = Math.min(minFeed, s.feed);
        maxFeed = Math.max(maxFeed, s.feed);
      }
    }
  }
  // The changes after the last segment
  for (; nextChange < changes.length; nextChange++) toolOrder.add(changes[nextChange]!.tool!);
  for (const e of changes) tools.add(e.tool!);

  return {
    lineCount: splitLines(text).length,
    segments,
    events,
    diagnostics: result.diagnostics,
    bounds: programBounds(segments),
    cutBounds: programBounds(segments, { includeRapids: false }),
    tools: [...tools].sort((a, b) => a - b),
    toolOrder: [...toolOrder],
    usesRotary,
    feedRange: minFeed <= maxFeed ? { min: minFeed, max: maxFeed } : null,
    rapidLength,
    feedLength,
    timeline: kinematics ? estimateTime(segments, events, kinematics) : null,
  };
}

/** Travel limits in the machine frame (mm). */
export interface Workspace {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface WorkspaceViolation {
  axis: 'x' | 'y' | 'z';
  side: 'min' | 'max';
  /** Furthest programmed position beyond the limit */
  value: number;
  limit: number;
  /** First segment that crosses the limit */
  segmentIndex: number;
  lineIndex: number;
}

/**
 * Checks a job against the machine's travel. Segments must be in the machine
 * frame, i.e. interpreted with the controller's actual work offsets.
 */
export function checkWorkspace(
  segments: readonly Segment[],
  workspace: Workspace,
): WorkspaceViolation[] {
  const found = new Map<string, WorkspaceViolation>();
  for (const segment of segments) {
    const b = emptyBounds();
    includeSegment(b, segment);
    for (const axis of ['x', 'y', 'z'] as const) {
      for (const side of ['min', 'max'] as const) {
        const value = b[side][axis];
        const limit = workspace[side][axis];
        const beyond = side === 'min' ? value < limit : value > limit;
        if (!beyond) continue;
        const key = axis + side;
        const existing = found.get(key);
        if (!existing) {
          found.set(key, {
            axis,
            side,
            value,
            limit,
            segmentIndex: segment.index,
            lineIndex: segment.lineIndex,
          });
        } else if (side === 'min' ? value < existing.value : value > existing.value) {
          existing.value = value;
        }
      }
    }
  }
  return [...found.values()];
}
