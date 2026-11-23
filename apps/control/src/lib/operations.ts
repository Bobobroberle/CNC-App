import type { Segment } from '@lowrider/gcode-core';

/**
 * The operations of a program, as far as the program itself names them: a
 * comment that stands on a line of its own right before cutting moves (the
 * way Fusion and others announce "2D Contour1"), and every change of tool.
 * Nothing is guessed: a program without such comments – or with a single
 * one, its title – has only its tools.
 */
export interface Operation {
  /** What the program calls it; empty for a bare tool change */
  name: string;
  /** Tool that cuts it (T number; 0 without one) */
  tool: number;
  /** First segment and source line of the operation */
  segment: number;
  lineIndex: number;
}

/** More named operations than this are no operations (comments at every move): tools only. */
const MAX_NAMED = 40;

const commentOnly = (line: string): string | null => {
  const text = line.trim();
  const paren = /^\(([^)]*)\)$/.exec(text);
  if (paren) return paren[1]!.trim();
  if (text.startsWith(';')) return text.slice(1).trim();
  return null;
};

export function operationsOf(
  lines: readonly string[],
  segments: readonly Pick<Segment, 'lineIndex' | 'tool' | 'motion'>[],
): Operation[] {
  const named: Operation[] = [];
  const byTool: Operation[] = [];
  let line = 0;
  let pending: string | null = null;
  let tool: number | null = null;
  segments.forEach((seg, index) => {
    // Comments between the last move and this one: the last of them names what follows.
    for (; line < seg.lineIndex && line < lines.length; line++) {
      const comment = commentOnly(lines[line]!);
      if (comment !== null && comment !== '') pending = comment;
    }
    line = Math.max(line, seg.lineIndex + 1);
    const changed = tool !== seg.tool;
    if (changed) {
      byTool.push({ name: '', tool: seg.tool, segment: index, lineIndex: seg.lineIndex });
      tool = seg.tool;
    }
    if (pending !== null) {
      named.push({ name: pending, tool: seg.tool, segment: index, lineIndex: seg.lineIndex });
      pending = null;
    } else if (changed && named.length > 0) {
      named.push({ name: '', tool: seg.tool, segment: index, lineIndex: seg.lineIndex });
    }
  });
  // One name alone is the program's title, not an operation; a name at every move is neither.
  return named.length > 1 && named.length <= MAX_NAMED ? named : byTool;
}

/** The operation a source line belongs to; null before the first. */
export function operationAt(
  operations: readonly Operation[],
  lineIndex: number | null,
): { operation: Operation; n: number } | null {
  if (lineIndex === null) return null;
  let found = -1;
  for (let i = 0; i < operations.length; i++) {
    if (operations[i]!.lineIndex <= lineIndex) found = i;
    else break;
  }
  return found < 0 ? null : { operation: operations[found]!, n: found + 1 };
}
