import { describe, expect, it } from 'vitest';
import {
  formatCoordinate,
  formatDuration,
  formatNumber,
  formatField,
  formatPlain,
  formatSigned,
  parseNumber,
} from '../src/lib/format';
import { MAX_JOB_BYTES, readJobFile } from '../src/lib/files';

describe('format', () => {
  it('formats coordinates with a real minus sign', () => {
    expect(formatCoordinate(-1.234)).toBe('−1.23');
    expect(formatCoordinate(-0.001)).toBe('0.00');
    expect(formatCoordinate(12, 3)).toBe('12.000');
    expect(formatCoordinate(undefined)).toBe('—');
    expect(formatCoordinate(Number.NaN)).toBe('—');
  });

  it('formats a number as it was typed: no zero decimals, at most as many as asked', () => {
    expect(formatPlain(180)).toBe('180');
    expect(formatPlain(180.0)).toBe('180');
    expect(formatPlain(12.5)).toBe('12,5');
    expect(formatPlain(3.2)).toBe('3,2');
    expect(formatPlain(3.333)).toBe('3,33');
    // in a field, a number of four digits is not grouped: parseNumber would read "4.600" as 4.6
    expect(formatField(4600)).toBe('4600');
    expect(formatField(12345.5)).toBe('12345,5');
    expect(formatField(15.7, 1)).toBe('15,7');
    expect(formatField(3.333)).toBe('3,33');
    expect(parseNumber(formatField(4600))).toBe(4600);
    expect(parseNumber(formatPlain(4600))).toBe(4.6);
    expect(formatPlain(3.333, 1)).toBe('3,3');
    expect(formatPlain(0)).toBe('0');
    expect(formatPlain(1000)).toBe('1.000');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(80.4)).toBe('1:20');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
  });

  it('formats numbers in German', () => {
    expect(formatNumber(1200)).toBe('1.200');
    expect(formatNumber(1.5, 2)).toBe('1,50');
  });
});

describe('readJobFile', () => {
  it('reads text and rejects huge files', async () => {
    await expect(readJobFile(new Blob(['G0 X1']))).resolves.toBe('G0 X1');
    const huge = { size: MAX_JOB_BYTES + 1, text: async () => '' } as Blob;
    await expect(readJobFile(huge)).rejects.toThrow(/MB/);
  });
});

describe('typed numbers', () => {
  it('takes the German decimal comma as well as the point', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber(' 0,05 ')).toBe(0.05);
    expect(parseNumber(',5')).toBe(0.5);
    expect(parseNumber('18')).toBe(18);
    expect(parseNumber('+3,2')).toBe(3.2);
  });

  it('takes a hyphen or the typographic minus of the readouts', () => {
    expect(parseNumber('-1,5')).toBe(-1.5);
    expect(parseNumber('−1,5')).toBe(-1.5);
    expect(parseNumber('–2')).toBe(-2);
    // What the position tile shows can be typed back in.
    expect(parseNumber(formatCoordinate(-12.345, 3))).toBe(-12.345);
  });

  it('reads thousands separators: with comma and point the last one is the decimal sign', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber("12'000")).toBe(12000);
    expect(parseNumber('1.234.567,8')).toBe(1234567.8);
  });

  it('is 0 for an empty field and NaN for anything that is not a number', () => {
    expect(parseNumber('')).toBe(0);
    expect(parseNumber('   ')).toBe(0);
    for (const text of ['abc', '1,2,3', '12mm', '-', ',', '1..2']) {
      expect(parseNumber(text), text).toBeNaN();
    }
  });
});

describe('formatSigned', () => {
  it('writes results with a decimal comma, a real minus and a plus when asked', () => {
    expect(formatSigned(11.84)).toBe('11,8');
    expect(formatSigned(-0.66)).toBe('−0,7');
    expect(formatSigned(11.84, 1, true)).toBe('+11,8');
    expect(formatSigned(-0.66, 2, true)).toBe('−0,66');
    // What rounds to zero has no sign.
    expect(formatSigned(-0.04)).toBe('0,0');
    expect(formatSigned(0.04, 1, true)).toBe('0,0');
    // And it can be typed back in.
    expect(parseNumber(formatSigned(-1234.5))).toBe(-1234.5);
  });
});
