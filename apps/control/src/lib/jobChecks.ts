import type { ProgramAnalysis } from '@lowrider/gcode-core';
import type { ControllerInfo } from './profile';

export interface JobIssue {
  severity: 'error' | 'warning';
  /** i18n key below job.issue */
  kind: 'toolChange' | 'optionalStop';
  /** 0-based source line */
  lineIndex: number;
  tool?: number;
}

/**
 * Things that are valid G-code but behave dangerously on this controller.
 * FluidNC (GCode.cpp) ignores M1 and only waits for the planner at M6 unless
 * an ATC or m6_macro is configured – a mid-job tool change then runs on with
 * the old tool.
 */
export function controllerIssues(
  analysis: ProgramAnalysis,
  controller: ControllerInfo,
): JobIssue[] {
  const issues: JobIssue[] = [];
  let mounted: number | undefined;
  for (const e of analysis.events) {
    if (e.kind === 'pause' && e.optional) {
      issues.push({ severity: 'warning', kind: 'optionalStop', lineIndex: e.lineIndex });
    }
    if (e.kind !== 'toolChange') continue;
    // A change before the first move is the tool the operator mounted for the job.
    const midJob = e.segmentIndex > 0 && mounted !== undefined && e.tool !== mounted;
    if (midJob && !controller.toolChangeHandled) {
      issues.push({ severity: 'error', kind: 'toolChange', lineIndex: e.lineIndex, tool: e.tool! });
    }
    mounted = e.tool;
  }
  return issues;
}
