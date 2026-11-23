import { interpret, MM_PER_INCH } from './interpreter';
import { parseProgram, splitLines } from './parser';
import { modalPreamble } from './repair';
import { formatNumber } from './transform';
import type { Diagnostic } from './types';

export interface ResumeOptions {
  /** Machine Z to lift to before moving over the start point (G53) */
  safeMachineZ: number;
  /** Feed for the plunge to the start depth, mm/min; default: the program's feed there */
  plungeFeed?: number;
}

export interface ResumeResult {
  text: string;
  /** 0-based line the program continues with */
  startLine: number;
  warnings: Diagnostic[];
}

/**
 * Builds a program that continues a job at `lineIndex` after an abort: the
 * modal state of that line is restored, the spindle switched on as it was,
 * the tool lifted to a safe machine height, moved over the start point and
 * lowered to the start depth before the original lines continue.
 */
export function resumeFrom(text: string, lineIndex: number, options: ResumeOptions): ResumeResult {
  const raw = splitLines(text);
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= raw.length) {
    throw new RangeError(`Line ${lineIndex + 1} is outside the program`);
  }
  const parsed = parseProgram(text);
  const result = interpret(parsed, { recordLines: true });
  const info = result.lines[lineIndex]!;
  const state = info.stateBefore;
  const start = info.workBefore;
  const uf = state.units === 'inch' ? MM_PER_INCH : 1;
  const n = (mm: number) => formatNumber(mm / uf, state.units);
  const warnings: Diagnostic[] = [];
  const warn = (message: string) =>
    warnings.push({ severity: 'warning', code: 'unknown-position', lineIndex, message });

  const before = parsed.slice(0, lineIndex);
  const usesOffsets = before.some((l) =>
    l.words.some((w) => w.letter === 'G' && [920, 100].includes(Math.round(w.value * 10))),
  );
  if (usesOffsets) warn('G92/G10 before the resume line: offsets are not restored');
  if (state.feedMode === 'inverseTime') warn('Inverse time feed (G93): plunge uses G94');

  const feed = state.feedMode === 'inverseTime' ? 0 : state.feed;
  const plunge = options.plungeFeed ?? (feed > 0 ? feed : 100);
  const lines = [
    `(LowRider Control: resume at line ${lineIndex + 1})`,
    modalPreamble({ ...state, distance: 'absolute', feedMode: 'unitsPerMinute' }),
  ];
  if (state.tool > 0) lines.push(`T${state.tool}`);
  if (state.spindle !== 'off') {
    lines.push(`S${state.spindleSpeed} ${state.spindle === 'cw' ? 'M3' : 'M4'}`);
  }
  if (state.flood) lines.push('M8');
  if (state.mist) lines.push('M7');
  lines.push(
    `G53 G0 Z${formatNumber(options.safeMachineZ)}`,
    `G0 X${n(start.x)} Y${n(start.y)}`,
    `G1 Z${n(start.z)} F${n(plunge)}`,
  );
  // Restore what the original program had active at that line.
  const restore: string[] = [];
  if (state.distance === 'incremental') restore.push('G91');
  if (state.feedMode === 'inverseTime') restore.push('G93');
  else if (feed > 0) restore.push(`F${n(feed)}`);
  if (restore.length > 0) lines.push(restore.join(' '));
  lines.push(...raw.slice(lineIndex));
  return {
    text: lines.join('\n') + (/\r?\n$/.test(text) ? '\n' : ''),
    startLine: lineIndex,
    warnings,
  };
}
