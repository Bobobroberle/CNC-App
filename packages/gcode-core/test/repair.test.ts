import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODAL_STATE,
  interpret,
  modalPreamble,
  removeToolLengthTable,
  splitAtToolChanges,
} from '../src';

const real = readFileSync(
  join(import.meta.dirname, 'golden', 'fusion360-1003-adaptiv-kontur-parallel.nc'),
  'utf8',
);

describe('removeToolLengthTable', () => {
  it('drops G43 and H but keeps the move, N number and comments', () => {
    const r = removeToolLengthTable('G0 X1\nN5 G0 G43 Z4. H1 (approach) ;x\nG43 H2\n');
    expect(r.text).toBe('G0 X1\nN5 G0 Z4 (approach) ;x\n\n');
    expect(r.changedLines).toEqual([1, 2]);
    expect(removeToolLengthTable('G43.1 Z1').text).toBe('G43.1 Z1');
    expect(removeToolLengthTable('G0 G43 Z1 H1 (c)\nM5').text).toBe('G0 Z1 (c)\nM5');
    expect(removeToolLengthTable('G43 H1 (only comment)').text).toBe('(only comment)');
  });

  it('makes the real Fusion post acceptable to FluidNC', () => {
    const r = removeToolLengthTable(real);
    expect(r.changedLines).toHaveLength(2);
    expect(interpret(r.text).diagnostics).toEqual([]);
  });
});

describe('modalPreamble', () => {
  it('restores units, distance modes, plane, feed mode and WCS', () => {
    expect(modalPreamble(DEFAULT_MODAL_STATE)).toBe('G21 G90 G91.1 G17 G94 G54');
    expect(
      modalPreamble({
        ...DEFAULT_MODAL_STATE,
        units: 'inch',
        distance: 'incremental',
        arcDistance: 'absolute',
        plane: 'ZX',
        feedMode: 'inverseTime',
        wcs: 1,
      }),
    ).toBe('G20 G91 G90.1 G18 G93 G55');
    expect(modalPreamble({ ...DEFAULT_MODAL_STATE, plane: 'YZ' })).toContain('G19');
  });
});

describe('splitAtToolChanges', () => {
  it('keeps a single-tool job whole', () => {
    const parts = splitAtToolChanges('T1 M6\nG0 X1\nT1 M6\nG1 X2 F100');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ number: 1, tool: 1, firstLine: 0, endLine: 4 });
    expect(parts[0]!.text).toBe('T1 M6\nG0 X1\nT1 M6\nG1 X2 F100');
    expect(splitAtToolChanges('G0 X1')[0]!.tool).toBeUndefined();
    // a repeated M6 with the mounted tool does not split again
    expect(splitAtToolChanges('T1 M6\nG0 X1\nT2 M6\nG0 X2\nT2 M6\nG0 X3')).toHaveLength(2);
  });

  it('splits at a mid-job tool change and restores the modal state', () => {
    const job = 'G20 G91\nT1 M6\nG0 X1\nM5\nT2 M6\nG0 X1\n';
    const parts = splitAtToolChanges(job);
    expect(parts.map((p) => [p.number, p.tool, p.firstLine, p.endLine])).toEqual([
      [1, 1, 0, 4],
      [2, 2, 4, 6],
    ]);
    expect(parts[0]!.text).toBe('G20 G91\nT1 M6\nG0 X1\nM5\n');
    expect(parts[1]!.text).toBe(
      '(LowRider Control: part 2 of 2, T2)\nG20 G91 G91.1 G17 G94 G54\nT2 M6\nG0 X1\n',
    );
  });

  it('splits the real job into the T1 and T2 parts with identical motion', () => {
    const repaired = removeToolLengthTable(real).text;
    const parts = splitAtToolChanges(repaired);
    expect(parts.map((p) => p.tool)).toEqual([1, 2]);
    const whole = interpret(repaired).segments.length;
    const sum = parts.reduce((n, p) => n + interpret(p.text).segments.length, 0);
    expect(sum).toBe(whole);
    // The second part ends exactly where the full program ends.
    const last = interpret(parts[1]!.text).finalPosition;
    expect(last).toEqual(interpret(repaired).finalPosition);
  });
});
