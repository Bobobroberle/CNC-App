import type { Tool } from '@lowrider/workshop';
import { useMemo } from 'react';
import {
  alternatives,
  toolDepths,
  toolIssues,
  toolState,
  type ToolIssue,
  type ToolState,
} from '../lib/jobTools';
import { toolForJob } from '../lib/setup';
import { useJob } from './job';
import { useWorkshop } from './workshop';

/** A tool of the job and what the tool list knows about it. */
export interface JobTool {
  /** T number of the program; 0 for a program without T words */
  number: number;
  /** The tool of the list that stands for it; undefined if the list is empty */
  tool: Tool | undefined;
  /** The list names this tool itself (chosen, same number, or the diameter of the CAM header) */
  known: boolean;
  /** The deepest cut the job makes with it, mm */
  depth: number;
  /** What is not as it should be (`lib/jobTools.ts`), and the state that follows */
  issues: ToolIssue[];
  state: ToolState;
  /** Tools of the list that would do instead, one tap away */
  alternatives: Tool[];
}

/** The tools the loaded program asks for, in its order, against the tool list. */
export function useJobTools(): JobTool[] {
  const analysis = useJob((s) => s.analysis);
  const headerDiameter = useJob((s) => s.header?.tools.find((x) => x.diameter)?.diameter);
  const header = useJob((s) => s.header);
  const tools = useWorkshop((s) => s.tools);
  const toolMap = useWorkshop((s) => s.setup.toolMap);
  return useMemo(() => {
    if (!analysis) return [];
    // In the order the program uses them (the first row is the first tool: the one the pictures draw), not by number
    const numbers = analysis.tools.length > 0 ? analysis.toolOrder : [0];
    const depths = toolDepths(analysis.segments);
    const spindleOn = analysis.events.some((e) => e.kind === 'spindle' && e.spindle !== 'off');
    return numbers.map((number) => {
      // The operator's choice, the tool with that number, or – without T words – the cutter
      // the CAM header names (`toolForJob`).
      const found = toolForJob(tools, toolMap, number, headerDiameter);
      const tool = found ?? tools[0];
      // A program without T words has one tool; its cuts are filed under whatever T was active.
      const depth =
        analysis.tools.length > 0 ? (depths.get(number) ?? 0) : Math.max(0, ...depths.values());
      // One tool: the header's diameter. Several: each tool against what the header names for ITS number – a CAM
      // program with several tools names every one (`(T2 D=3 …)`); a header that names none of them says nothing
      const wanted =
        number === 0 || numbers.length === 1
          ? headerDiameter
          : header?.tools.find((x) => x.number === number && x.diameter)?.diameter;
      const issues = toolIssues({ tool, known: found !== undefined, depth, wanted, spindleOn });
      return {
        number,
        tool,
        known: found !== undefined,
        depth,
        issues,
        state: toolState(issues),
        alternatives: alternatives(tools, tool, depth, wanted),
      };
    });
  }, [analysis, headerDiameter, header, tools, toolMap]);
}
