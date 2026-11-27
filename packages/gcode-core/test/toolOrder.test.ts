import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProgram, splitAtToolChanges } from '../src';

describe('the order a program uses its tools in', () => {
  it('is the order of first use, where `tools` is sorted by number', () => {
    // T3 cuts first, then T1, then T2 is mounted last and cuts nothing
    const a = analyzeProgram(
      'T3 M6\nG0 X10\nG1 Z-1 F300\nG1 X20\nG0 Z5\nT1 M6\nG0 X0\nG1 X5\nT2 M6\n',
    );
    expect(a.tools).toEqual([1, 2, 3]);
    expect(a.toolOrder).toEqual([3, 1, 2]);
  });

  it('counts a tool change as a use, before the move that follows it', () => {
    // Fusion preselects the next tool (`T2`) and changes to it later: the change names T1, the cut is T2's
    const a = analyzeProgram('T1 M6\nT2\nG1 X10 F100\nT2 M6\nG1 X20\n');
    expect(a.toolOrder).toEqual([1, 2]);
    expect(a.tools).toEqual([1, 2]);
  });

  it('knows a tool that is only mounted, and the one every program starts with', () => {
    // The feed move is made with tool 0 (nothing was called), T2 comes after the last move
    const a = analyzeProgram('G1 X1 F100\nT2 M6\n');
    expect(a.toolOrder).toEqual([0, 2]);
    expect(a.tools).toEqual([0, 2]);
    // Rapids alone use no tool; a change to one still names it
    expect(analyzeProgram('G0 X5\n').toolOrder).toEqual([]);
    expect(analyzeProgram('T4 M6\nG0 X5\n').toolOrder).toEqual([4]);
  });

  it('lists a tool once, however often it comes back', () => {
    const a = analyzeProgram('T2 M6\nG1 X1 F100\nT1 M6\nG1 X2\nT2 M6\nG1 X3\nT1 M6\nG1 X4\n');
    expect(a.toolOrder).toEqual([2, 1]);
  });

  it('holds the same tools as `tools` for every sample program', () => {
    const dir = join(import.meta.dirname, 'golden');
    const files = readdirSync(dir).filter((f) => f.endsWith('.nc'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const a = analyzeProgram(readFileSync(join(dir, file), 'utf8'));
      expect(
        [...a.toolOrder].sort((x, y) => x - y),
        file,
      ).toEqual(a.tools);
    }
  });
});

describe('a program with several tools as the CAM writes it', () => {
  // The form of `toGcode` with blocks: header, the first tool before the first move, a change = lift, M5, T M6, S M3
  const program = [
    '(LowRider Control CAM: demo)',
    '(T1 D=3 V-bit)',
    '(T2 D=6 End mill)',
    'G21 G90 G17 G94',
    'T1 M6',
    '(tool T1 V-bit)',
    'G0 Z5',
    'S18000 M3',
    'G0 Z5',
    'G0 X10 Y10',
    'Z1',
    'G1 Z-1 F300',
    'X20 F1200',
    'G0 Z5',
    'M5',
    'T2 M6',
    'S18000 M3',
    '(tool T2 End mill)',
    'G0 Z5',
    'G0 X0 Y0',
    'Z1',
    'G1 Z-3 F300',
    'X30 F1200',
    'G0 Z5',
    'M5',
    'T1 M6',
    'S18000 M3',
    '(tool T1 V-bit)',
    'G0 Z5',
    'G0 X40 Y0',
    'Z1',
    'G1 Z-1 F300',
    'X50 F1200',
    'G0 Z5',
    'M5',
    'M30',
    '',
  ].join('\n');

  it('is split at every change after the first: three parts, a part to a tool', () => {
    const parts = splitAtToolChanges(program);
    expect(parts.map((p) => p.tool)).toEqual([1, 2, 1]);
    // The first M6 only names the first part; a part from the second one on begins at its M6 line
    expect(parts[1]!.text.split('\n').slice(0, 4)).toEqual([
      '(LowRider Control: part 2 of 3, T2)',
      'G21 G90 G91.1 G17 G94 G54',
      'T2 M6',
      'S18000 M3',
    ]);
    expect(parts[0]!.text.endsWith('G0 Z5\nM5\n')).toBe(true);
    for (const p of parts) {
      const a = analyzeProgram(p.text);
      expect(a.diagnostics, `part ${p.number}`).toEqual([]);
      // Every part switches the spindle on itself, after its own tool change
      expect(a.segments.filter((s) => s.motion !== 'rapid').every((s) => s.spindle === 'cw')).toBe(
        true,
      );
    }
  });
});
