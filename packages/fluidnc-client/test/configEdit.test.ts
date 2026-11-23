import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigEditError, readMachineConfig, sameConfigText, setConfigValues } from '../src';

const fixture = readFileSync(
  join(import.meta.dirname, 'fixtures', 'jackpot2-lowrider.yaml'),
  'utf8',
);

const LIMITS = [
  { path: 'axes/z/max_rate_mm_per_min', value: '1500' },
  { path: 'axes/x/acceleration_mm_per_sec2', value: '240' },
];

describe('changing single values of config.yaml', () => {
  it('changes only the touched lines of the stock LowRider config (golden file)', async () => {
    const edited = setConfigValues(fixture, LIMITS);
    await expect(edited).toMatchFileSnapshot('golden/jackpot2-lowrider-limits.yaml');
    const before = fixture.split('\n');
    const after = edited.split('\n');
    expect(after).toHaveLength(before.length);
    const differ = before.flatMap((l, i) => (l === after[i] ? [] : [[l, after[i]]]));
    expect(differ).toEqual([
      ['    acceleration_mm_per_sec2: 200.000', '    acceleration_mm_per_sec2: 240'],
      ['    max_rate_mm_per_min: 1200.000', '    max_rate_mm_per_min: 1500'],
    ]);
    // FluidNC reads it as meant.
    const config = readMachineConfig(edited);
    expect(config.axes.z!.maxRate).toBe(1500);
    expect(config.axes.x!.acceleration).toBe(240);
    expect(config.axes.y!.acceleration).toBe(200);
  });

  it('keeps comments, quotes, CRLF line endings and leaves commented-out sections alone', () => {
    const text = [
      'axes:\r',
      '  x:\r',
      "    max_rate_mm_per_min: '9000'   # fast\r",
      '    acceleration_mm_per_sec2: 200 #a\r',
      '#  z:\r',
      '#    max_rate_mm_per_min: 5000\r',
      '  z:\r',
      '    max_rate_mm_per_min: 1200',
    ].join('\n');
    const out = setConfigValues(text, [
      { path: 'axes/x/max_rate_mm_per_min', value: '8000' },
      { path: 'AXES/X/acceleration_mm_per_sec2', value: '150' },
      { path: 'axes/z/max_rate_mm_per_min', value: '1400' },
    ]);
    expect(out).toBe(
      [
        'axes:\r',
        '  x:\r',
        "    max_rate_mm_per_min: '8000'   # fast\r",
        '    acceleration_mm_per_sec2: 150 #a\r',
        '#  z:\r',
        '#    max_rate_mm_per_min: 5000\r',
        '  z:\r',
        '    max_rate_mm_per_min: 1400',
      ].join('\n'),
    );
    expect(setConfigValues(text, [])).toBe(text);
  });

  it('adds a key a section leaves to the default, in the section’s indent', () => {
    const text = 'axes:\n  z:\n      steps_per_mm: 200\n  y:\n    max_travel_mm: 10\nname: x';
    expect(
      setConfigValues(text, [
        { path: 'axes/z/max_rate_mm_per_min', value: '1500' },
        { path: 'axes/y/acceleration_mm_per_sec2', value: '90' },
        { path: 'axes/z/acceleration_mm_per_sec2', value: '80' },
      ]),
    ).toBe(
      'axes:\n  z:\n      max_rate_mm_per_min: 1500\n      acceleration_mm_per_sec2: 80\n      steps_per_mm: 200\n  y:\n    acceleration_mm_per_sec2: 90\n    max_travel_mm: 10\nname: x',
    );
    // An empty section at the end of a file without a final newline.
    expect(setConfigValues('a: 1\r\nempty:', [{ path: 'empty/k', value: '2' }])).toBe(
      'a: 1\r\nempty:\r\n  k: 2\r\n',
    );
    expect(setConfigValues('empty:', [{ path: 'empty/k', value: '2' }])).toBe('empty:\n  k: 2\n');
    // A section line with a comment is still a section.
    expect(setConfigValues('z: # the Z axis\n  a: 1\n', [{ path: 'z/a', value: '2' }])).toBe(
      'z: # the Z axis\n  a: 2\n',
    );
  });

  it('refuses what it cannot write, and changes nothing then', () => {
    const problem = (path: string) => {
      try {
        setConfigValues(fixture, [{ path, value: '1' }]);
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigEditError);
        return [(e as ConfigEditError).problem, (e as ConfigEditError).path];
      }
      return null;
    };
    expect(problem('axes/q/max_rate_mm_per_min')).toEqual([
      'missing',
      'axes/q/max_rate_mm_per_min',
    ]);
    expect(problem('top_level_key')).toEqual(['missing', 'top_level_key']);
    expect(problem('axes/x')).toEqual(['section', 'axes/x']);
    expect(problem('axes/x/../y')).toEqual(['invalid', 'axes/x/../y']);
  });

  it('compares a file as FluidNC shows it back', () => {
    expect(sameConfigText('a: 1\r\n\r\nb: 2  \n', 'a: 1\nb: 2')).toBe(true);
    expect(sameConfigText('a: 1\nb: 2', 'a: 1\nb: 3')).toBe(false);
    expect(sameConfigText('a: 1', 'a: 1\nb: 2')).toBe(false);
  });
});
