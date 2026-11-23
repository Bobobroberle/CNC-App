import { describe, expect, it } from 'vitest';
import { clampJogTarget, jogRelative, jogToMachine, jogXY } from '../src';

const range = { min: 0, max: 1200 };

describe('clampJogTarget', () => {
  it('passes moves inside the range', () => {
    expect(clampJogTarget(100, 10, range)).toEqual({ target: 110, limited: false });
    expect(clampJogTarget(100, -10, range)).toEqual({ target: 90, limited: false });
  });

  it('stops at the limit', () => {
    expect(clampJogTarget(1195, 10, range)).toEqual({ target: 1200, limited: true });
    expect(clampJogTarget(4, -10, range)).toEqual({ target: 0, limited: true });
  });

  it('returns null at the limit', () => {
    expect(clampJogTarget(1200, 10, range)).toBeNull();
    expect(clampJogTarget(0.0004, -1, range)).toBeNull();
  });

  it('never moves the other way when already outside', () => {
    expect(clampJogTarget(1210, 10, range)).toBeNull();
    expect(clampJogTarget(-5, -1, range)).toBeNull();
    // moving back into the range is allowed
    expect(clampJogTarget(-5, 10, range)).toEqual({ target: 5, limited: false });
  });
});

describe('jog commands', () => {
  it('formats absolute machine and relative jogs', () => {
    expect(jogToMachine('X', 110.5, 3000)).toBe('$J=G53 G90 G21 X110.5 F3000');
    expect(jogToMachine('Z', -0.0001, 499.6)).toBe('$J=G53 G90 G21 Z0 F500');
    expect(jogRelative('Y', -0.1, 2000)).toBe('$J=G91 G21 Y-0.1 F2000');
  });
});

describe('jogXY', () => {
  it('jogs both axes to a machine position or by a distance', () => {
    expect(jogXY('machine', 100.5, -0.0001, 3000.4)).toBe('$J=G53 G90 G21 X100.5 Y0 F3000');
    expect(jogXY('relative', -1.25, 2, 600)).toBe('$J=G91 G21 X-1.25 Y2 F600');
  });
});
