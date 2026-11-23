import { interpret } from './interpreter';
import { parseProgram, splitLines, type ParsedLine, type Word } from './parser';
import type { ModalState } from './types';

/** Writes a parsed line back with the given words, keeping N number and comments. */
export function formatLine(line: ParsedLine, words: Word[]): string {
  const tokens = words.map((w) => `${w.letter}${w.value}`);
  if (line.lineNumber !== undefined) tokens.unshift(`N${line.lineNumber}`);
  let text = tokens.join(' ');
  for (const c of line.comments) {
    const comment = c.style === 'paren' ? `(${c.text})` : `;${c.text}`;
    text = text === '' ? comment : `${text} ${comment}`;
  }
  return text;
}

const isG43 = (w: Word) => w.letter === 'G' && Math.round(w.value * 10) === 430;

export interface ToolLengthRepair {
  text: string;
  /** 0-based indices of the changed lines */
  changedLines: number[];
}

/**
 * Removes tool-table length offsets (`G43 Hn`), which FluidNC rejects, and
 * keeps the rest of each line: `G0 G43 Z4. H1` becomes `G0 Z4`. Tool length
 * is then handled by touching off Z after each tool change.
 */
export function removeToolLengthTable(text: string): ToolLengthRepair {
  const raw = splitLines(text);
  const changedLines: number[] = [];
  const out = parseProgram(text).map((line, i) => {
    if (!line.words.some(isG43)) return raw[i]!;
    changedLines.push(i);
    return formatLine(
      line,
      line.words.filter((w) => !isG43(w) && w.letter !== 'H'),
    );
  });
  return { text: out.join('\n') + (/\r?\n$/.test(text) ? '\n' : ''), changedLines };
}

export interface JobPart {
  /** 1-based part number */
  number: number;
  /** Tool used in this part (from M6), if known */
  tool: number | undefined;
  /** 0-based source line range [firstLine, endLine) */
  firstLine: number;
  endLine: number;
  text: string;
}

/** G-code that restores the modal state a part starts in. */
export function modalPreamble(state: ModalState): string {
  return [
    state.units === 'inch' ? 'G20' : 'G21',
    state.distance === 'absolute' ? 'G90' : 'G91',
    state.arcDistance === 'absolute' ? 'G90.1' : 'G91.1',
    state.plane === 'XY' ? 'G17' : state.plane === 'ZX' ? 'G18' : 'G19',
    state.feedMode === 'inverseTime' ? 'G93' : 'G94',
    `G${54 + state.wcs}`,
  ].join(' ');
}

/**
 * Splits a job at every tool change after the first move, because FluidNC
 * does not stop at M6. Each later part starts with the modal state at its
 * first line, so it runs the same as in the full program.
 */
export function splitAtToolChanges(text: string): JobPart[] {
  const parsed = parseProgram(text);
  const raw = splitLines(text);
  const result = interpret(parsed, { recordLines: true });
  const starts: { line: number; tool: number | undefined }[] = [{ line: 0, tool: undefined }];
  let mounted: number | undefined;
  for (const e of result.events) {
    if (e.kind !== 'toolChange') continue;
    if (e.segmentIndex > 0 && mounted !== undefined && e.tool !== mounted) {
      starts.push({ line: e.lineIndex, tool: e.tool });
    } else if (starts.length === 1) {
      starts[0]!.tool = e.tool;
    }
    mounted = e.tool;
  }
  const trailingNewline = /\r?\n$/.test(text);
  return starts.map((start, k) => {
    const endLine = starts[k + 1]?.line ?? raw.length;
    const body = raw.slice(start.line, endLine);
    if (k > 0) {
      body.unshift(
        `(LowRider Control: part ${k + 1} of ${starts.length}, T${start.tool})`,
        modalPreamble(result.lines[start.line]!.stateBefore),
      );
    }
    return {
      number: k + 1,
      tool: start.tool,
      firstLine: start.line,
      endLine,
      text: body.join('\n') + (trailingNewline || k < starts.length - 1 ? '\n' : ''),
    };
  });
}
