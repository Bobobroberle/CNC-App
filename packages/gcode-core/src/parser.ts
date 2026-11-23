import type { Diagnostic } from './types';

export interface Word {
  /** Upper-case letter */
  letter: string;
  value: number;
}

export interface Comment {
  text: string;
  style: 'paren' | 'semicolon';
}

export interface ParsedLine {
  /** 0-based index of the line in the source text */
  index: number;
  raw: string;
  /** N word, if present at the start of the line */
  lineNumber?: number;
  /** All words except N, in source order */
  words: Word[];
  comments: Comment[];
  /** FluidNC/Grbl system command such as `$H`, passed through unchanged */
  system?: string;
  diagnostics: Diagnostic[];
}

const WORD = /^([A-Z])([+-]?(?:\d+\.?\d*|\.\d+))/;

export function parseLine(raw: string, index = 0): ParsedLine {
  const line: ParsedLine = {
    index,
    raw,
    words: [],
    comments: [],
    diagnostics: [],
  };
  const error = (code: Diagnostic['code'], message: string) =>
    line.diagnostics.push({ severity: 'error', code, lineIndex: index, message });

  // Strip comments, collect code characters.
  let code = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '(') {
      const end = raw.indexOf(')', i + 1);
      if (end < 0) {
        error('unclosed-comment', 'Comment opened with "(" is never closed');
        line.comments.push({ text: raw.slice(i + 1).trim(), style: 'paren' });
        break;
      }
      line.comments.push({ text: raw.slice(i + 1, end).trim(), style: 'paren' });
      i = end;
    } else if (ch === ';') {
      line.comments.push({ text: raw.slice(i + 1).trim(), style: 'semicolon' });
      break;
    } else {
      code += ch;
    }
  }

  let text = code.trim();
  if (text === '%') return line;
  if (text.startsWith('$')) {
    line.system = text;
    return line;
  }
  text = text.replace(/\s+/g, '').toUpperCase();
  if (/[[#]/.test(text)) {
    error('unsupported-expression', 'Expressions and parameters (# or [ ]) are not supported');
    return line;
  }

  let rest = text;
  let first = true;
  while (rest.length > 0) {
    const m = WORD.exec(rest);
    if (!m) {
      error('unexpected-character', `Unexpected character "${rest[0]}"`);
      break;
    }
    const letter = m[1]!;
    const value = Number(m[2]);
    if (letter === 'N') {
      if (first) line.lineNumber = value;
      else error('misplaced-line-number', 'N word must be the first word of a line');
    } else {
      line.words.push({ letter, value });
    }
    first = false;
    rest = rest.slice(m[0].length);
  }
  return line;
}

export function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  // A trailing newline does not start another line.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function parseProgram(text: string): ParsedLine[] {
  return splitLines(text).map((raw, i) => parseLine(raw, i));
}
