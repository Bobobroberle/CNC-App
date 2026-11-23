import { describe, expect, it } from 'vitest';
import {
  chipLoad,
  DEFAULT_MATERIALS,
  DEFAULT_TOOLS,
  learn,
  learnedFactor,
  learningKey,
  suggestCutting,
  toolByNumber,
  toolShape,
  validateMaterial,
  validateTool,
  type Material,
  type Tool,
} from '../src';

const t1 = DEFAULT_TOOLS[0]!;
const mdf = DEFAULT_MATERIALS.find((m) => m.id === 'mdf')!;
const spindle = { rpmMin: 10000, rpmMax: 30000, maxFeed: 5000 };

describe('tools', () => {
  it('accepts the defaults', () => {
    for (const t of DEFAULT_TOOLS) expect(validateTool(t)).toBe(t);
  });

  it('rejects broken tools', () => {
    const bad: unknown[] = [
      null,
      'x',
      { ...t1, id: '' },
      { ...t1, id: 3 },
      { ...t1, name: ' ' },
      { ...t1, name: 1 },
      { ...t1, number: -1 },
      { ...t1, number: 1.5 },
      { ...t1, kind: 'saw' },
      { ...t1, diameter: 0 },
      { ...t1, stickout: Number.NaN },
      { ...t1, flutes: 0 },
      { ...t1, flutes: 1.5 },
      { ...t1, kind: 'vbit' },
      { ...t1, kind: 'chamfer', angle: -1 },
      { ...t1, holder: 5 },
    ];
    for (const b of bad) expect(validateTool(b)).toBeNull();
    expect(validateTool({ ...t1, kind: 'vbit', angle: 60 })).not.toBeNull();
  });

  it('maps tool kinds to simulation shapes', () => {
    expect(toolShape(t1)).toEqual({ kind: 'flat', diameter: 8 });
    expect(toolShape(DEFAULT_TOOLS[1]!)).toEqual({ kind: 'ball', diameter: 6 });
    expect(toolShape({ ...t1, kind: 'vbit', angle: 60 })).toEqual({
      kind: 'vbit',
      diameter: 8,
      angle: 60,
    });
    expect(toolShape({ ...t1, kind: 'chamfer', angle: 90 }).kind).toBe('vbit');
    expect(toolShape({ ...t1, kind: 'drill' }).kind).toBe('flat');
  });

  it('finds tools by T number', () => {
    expect(toolByNumber(DEFAULT_TOOLS, 2)?.id).toBe('t2');
    expect(toolByNumber(DEFAULT_TOOLS, 9)).toBeUndefined();
    expect(toolByNumber(DEFAULT_TOOLS, undefined)).toBeUndefined();
  });
});

describe('materials', () => {
  it('accepts the defaults', () => {
    for (const m of DEFAULT_MATERIALS) expect(validateMaterial(m)).toBe(m);
  });

  it('rejects broken materials', () => {
    const bad: unknown[] = [
      null,
      7,
      { ...mdf, id: '' },
      { ...mdf, name: '' },
      { ...mdf, group: 'stone' },
      { ...mdf, vc: 0 },
      { ...mdf, fz6: 'a' },
      { ...mdf, depthFactor: 1.5 },
      { ...mdf, plungeFactor: 0 },
    ];
    for (const b of bad) expect(validateMaterial(b)).toBeNull();
  });
});

describe('cutting values', () => {
  it('scales the chip load with the diameter within limits', () => {
    expect(chipLoad(mdf, 6)).toBeCloseTo(0.08);
    expect(chipLoad(mdf, 1)).toBeCloseTo(0.08 * 0.3);
    expect(chipLoad(mdf, 20)).toBeCloseTo(0.16);
  });

  it('computes speed and feed from vc and fz', () => {
    const s = suggestCutting(t1, mdf, spindle);
    // n = 600·1000/(π·8) ≈ 23873, f = 0.1067·2·n ≈ 5093 → machine limit
    expect(s.rpm).toBe(23873);
    expect(s.feed).toBe(5000);
    expect(s.limits).toEqual(['feed-machine']);
    expect(s.plunge).toBe(1500);
    expect(s.depthPerPass).toBe(4);
    expect(s.stepover).toBe(3.2);
    expect(s.learnedFactor).toBe(1);
  });

  it('clamps the spindle speed and reports it', () => {
    const alu = DEFAULT_MATERIALS.find((m) => m.id === 'aluminium')!;
    const slow = suggestCutting(t1, alu, spindle);
    expect(slow.rpm).toBe(10000);
    expect(slow.limits).toContain('rpm-high');
    const tiny: Tool = { ...t1, diameter: 2 };
    const fast = suggestCutting(tiny, mdf, spindle, 0.8);
    expect(fast.rpm).toBe(30000);
    expect(fast.limits).toEqual(['rpm-low']);
    expect(fast.learnedFactor).toBe(0.8);
  });

  it('uses at most two flutes for V-bits', () => {
    const v: Tool = { ...t1, kind: 'vbit', angle: 90, flutes: 4, diameter: 6 };
    const s = suggestCutting(v, mdf, { ...spindle, maxFeed: 1e6 });
    expect(s.chipLoad).toBeCloseTo(0.08, 3);
    expect(s.feed).toBe(Math.round(0.08 * 2 * s.rpm));
  });
});

describe('learning', () => {
  const base = { toolId: 't1', materialId: 'mdf', completed: true, chatter: false };

  it('follows the override the operator settled on', () => {
    let model = learn({}, { ...base, feedOverride: 120 });
    expect(model[learningKey('t1', 'mdf')]).toEqual({ factor: 1.06, jobs: 1 });
    model = learn(model, { ...base, feedOverride: 100, load: 30 });
    expect(learnedFactor(model, 't1', 'mdf')).toBeGreaterThan(1.06);
    expect(learnedFactor(model, 't2', 'mdf')).toBe(1);
  });

  it('pulls the factor down after chatter or an abort', () => {
    expect(
      learnedFactor(learn({}, { ...base, feedOverride: 130, chatter: true }), 't1', 'mdf'),
    ).toBe(0.97);
    expect(
      learnedFactor(learn({}, { ...base, feedOverride: 100, completed: false }), 't1', 'mdf'),
    ).toBe(0.97);
    expect(learnedFactor(learn({}, { ...base, feedOverride: 100, load: 80 }), 't1', 'mdf')).toBe(1);
  });

  it('stays within 0.5–1.5', () => {
    let model = {};
    for (let i = 0; i < 40; i++) model = learn(model, { ...base, feedOverride: 200 });
    expect(learnedFactor(model, 't1', 'mdf')).toBe(1.5);
    for (let i = 0; i < 60; i++) model = learn(model, { ...base, feedOverride: 10 });
    expect(learnedFactor(model, 't1', 'mdf')).toBe(0.5);
  });

  it('keeps unknown materials untouched', () => {
    const m: Material = { ...mdf, id: 'x' };
    expect(validateMaterial(m)).toEqual(m);
  });
});
