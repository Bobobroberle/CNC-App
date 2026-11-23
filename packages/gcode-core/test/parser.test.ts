import { describe, expect, it } from 'vitest';
import { parseLine, parseProgram, splitLines } from '../src';

describe('parseLine', () => {
  it('parses words, line numbers and values', () => {
    const line = parseLine('N10 G1 X10.5 Y-2 Z.5 F1200', 3);
    expect(line.index).toBe(3);
    expect(line.lineNumber).toBe(10);
    expect(line.words).toEqual([
      { letter: 'G', value: 1 },
      { letter: 'X', value: 10.5 },
      { letter: 'Y', value: -2 },
      { letter: 'Z', value: 0.5 },
      { letter: 'F', value: 1200 },
    ]);
    expect(line.diagnostics).toEqual([]);
  });

  it('accepts lower case, spaces inside words and leading plus signs', () => {
    const line = parseLine('g 1 x 1 0 y+3.');
    expect(line.words).toEqual([
      { letter: 'G', value: 1 },
      { letter: 'X', value: 10 },
      { letter: 'Y', value: 3 },
    ]);
  });

  it('collects parenthesis and semicolon comments', () => {
    const line = parseLine('G0 (rapid) X1 ( second ) ; rest of line (ignored)');
    expect(line.words.map((w) => w.letter)).toEqual(['G', 'X']);
    expect(line.comments).toEqual([
      { text: 'rapid', style: 'paren' },
      { text: 'second', style: 'paren' },
      { text: 'rest of line (ignored)', style: 'semicolon' },
    ]);
  });

  it('reports an unclosed comment', () => {
    const line = parseLine('G0 X1 (oops');
    expect(line.diagnostics[0]?.code).toBe('unclosed-comment');
    expect(line.comments).toEqual([{ text: 'oops', style: 'paren' }]);
    expect(line.words).toHaveLength(2);
  });

  it('treats % and empty lines as empty', () => {
    expect(parseLine('%').words).toEqual([]);
    expect(parseLine('   ').words).toEqual([]);
    expect(parseLine('').diagnostics).toEqual([]);
  });

  it('passes system commands through', () => {
    const line = parseLine('$H');
    expect(line.system).toBe('$H');
    expect(line.words).toEqual([]);
  });

  it('rejects expressions and parameters', () => {
    expect(parseLine('G1 X[1+2]').diagnostics[0]?.code).toBe('unsupported-expression');
    expect(parseLine('#1=5').diagnostics[0]?.code).toBe('unsupported-expression');
  });

  it('reports unexpected characters and keeps the words before them', () => {
    const line = parseLine('G1 X1 Y');
    expect(line.diagnostics[0]?.code).toBe('unexpected-character');
    expect(line.words).toHaveLength(2);
    expect(parseLine('/G1 X1').diagnostics[0]?.code).toBe('unexpected-character');
  });

  it('rejects N words that are not first', () => {
    expect(parseLine('G1 N5 X1').diagnostics[0]?.code).toBe('misplaced-line-number');
  });
});

describe('parseProgram', () => {
  it('splits on LF and CRLF and ignores a trailing newline', () => {
    expect(splitLines('a\r\nb\nc\n')).toEqual(['a', 'b', 'c']);
    expect(splitLines('')).toEqual(['']);
    const lines = parseProgram('G0 X1\r\nG1 Y2 F100\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]?.index).toBe(1);
    expect(lines[0]?.raw).toBe('G0 X1');
  });
});
