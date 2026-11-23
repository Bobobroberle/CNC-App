import { analyzeProgram } from '@lowrider/gcode-core';
import { describe, expect, it } from 'vitest';
import { alternatives, toolDepths, toolIssues, toolState } from '../src/lib/jobTools';
import { jobReadiness, type ReadinessInput } from '../src/lib/readiness';
import { STEP_OF, stepStates } from '../src/lib/steps';

const tool = (id: string, diameter: number, fluteLength = 20, extra: object = {}) => ({
  id,
  diameter,
  fluteLength,
  kind: 'flat' as const,
  ...extra,
});

describe('the tools of a job against the tool list', () => {
  it('knows how deep each tool cuts', () => {
    const { segments } = analyzeProgram(
      'G90 G21\nT1 M6\nG0 Z5\nG1 Z-4 F100\nG1 X5\nG0 Z5\nT2 M6\nG1 Z-9.5\nG0 Z-20\nG0 Z5\n',
    );
    const depths = toolDepths(segments);
    expect(depths.get(1)).toBe(4);
    // A rapid below the zero is no cut.
    expect(depths.get(2)).toBe(9.5);
    expect(toolDepths(analyzeProgram('T3 M6\nG1 Z2 F100\n').segments).get(3)).toBe(0);
  });

  it('is in order when the list names it and it is long enough', () => {
    const issues = toolIssues({ tool: tool('a', 6), known: true, depth: 12, spindleOn: true });
    expect(issues).toEqual([]);
    expect(toolState(issues)).toBe('ok');
  });

  it('says what is not in order', () => {
    expect(toolIssues({ tool: undefined, known: false, depth: 1, spindleOn: true })).toEqual([
      'none',
    ]);
    expect(toolState(['none'])).toBe('block');
    const all = toolIssues({
      tool: tool('a', 8, 10, { probe: true }),
      known: false,
      depth: 12,
      wanted: 6,
      spindleOn: true,
    });
    expect(all).toEqual(['unknown', 'fluteShort', 'diameter', 'probe']);
    expect(toolState(all)).toBe('warn');
    // A probe is no issue for a program that never switches the spindle on.
    expect(
      toolIssues({
        tool: tool('a', 6, 20, { probe: true }),
        known: true,
        depth: 1,
        spindleOn: false,
      }),
    ).toEqual([]);
    // Just as deep as the flute is long is fine.
    expect(
      toolIssues({ tool: tool('a', 6, 12), known: true, depth: 12.04, spindleOn: true }),
    ).toEqual([]);
  });

  it('offers what else would do: same diameter, long enough, no probe, same kind first', () => {
    const list = [
      tool('current', 8),
      tool('ball', 6, 20, { kind: 'ball' as const }),
      tool('short', 6, 5),
      tool('probe', 6, 20, { probe: true }),
      tool('flat', 6),
      tool('other', 3),
    ];
    expect(alternatives(list, list[0], 10, 6).map((x) => x.id)).toEqual(['flat', 'ball']);
    // Without a diameter from the CAM header: the current tool's.
    expect(alternatives(list, list[4], 10).map((x) => x.id)).toEqual(['ball']);
    expect(alternatives(list, undefined, 10)).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) => tool(`t${i}`, 6));
    expect(alternatives(many, undefined, 1, 6)).toHaveLength(3);
  });
});

describe('the checks of step ④ in the readiness list', () => {
  const BASE: ReadinessInput = {
    connected: true,
    busy: false,
    homed: true,
    errors: 0,
    controllerErrors: 0,
    outside: 0,
    zeroAtOrigin: false,
    collisions: 0,
    clamps: [],
    placeholderProfile: false,
  };
  const of = (input: Partial<ReadinessInput>, id: string) =>
    jobReadiness({ ...BASE, ...input }).find((i) => i.id === id);

  it('finds the depth plausible, above the zero, or through the stock', () => {
    expect(of({ depth: { cut: 6, stock: 6 } }, 'depth')).toMatchObject({
      level: 'ok',
      key: 'depthOk',
    });
    expect(of({ depth: { cut: 6.8, stock: 6 } }, 'depth')?.level).toBe('ok');
    expect(of({ depth: { cut: 9, stock: 6 } }, 'depth')).toMatchObject({
      level: 'warn',
      key: 'depthThrough',
      params: { over: '3,0' },
    });
    expect(of({ depth: { cut: 0, stock: 6 } }, 'depth')).toMatchObject({
      level: 'ok',
      key: 'depthAbove',
    });
    expect(of({}, 'depth')).toBeUndefined();
  });

  it('counts the tools that are not in order', () => {
    expect(of({ tools: { used: 2, open: 0 } }, 'tools')).toMatchObject({ level: 'ok' });
    expect(of({ tools: { used: 2, open: 1 } }, 'tools')).toMatchObject({
      level: 'warn',
      key: 'toolsOpen',
      params: { count: 1 },
    });
    expect(of({ tools: { used: 0, open: 0 } }, 'tools')).toBeUndefined();
  });

  it('holds feed and speed against what the machine can do', () => {
    const limits = {
      feed: 3000,
      feedMax: 8000,
      rpm: { min: 12000, max: 18000 },
      rpmMin: 10000,
      rpmMax: 30000,
    };
    expect(of({ limits }, 'limits')).toMatchObject({ level: 'ok', key: 'limitsOk' });
    expect(of({ limits: { ...limits, feed: 9000 } }, 'limits')).toMatchObject({
      level: 'warn',
      key: 'feedOver',
    });
    expect(of({ limits: { ...limits, rpm: { min: 12000, max: 40000 } } }, 'limits')?.key).toBe(
      'rpmOver',
    );
    expect(of({ limits: { ...limits, rpm: { min: 5000, max: 18000 } } }, 'limits')?.key).toBe(
      'rpmUnder',
    );
    // Nothing known, nothing said.
    expect(of({ limits: { ...limits, feed: null, rpm: null } }, 'limits')).toBeUndefined();
    expect(of({ limits: { ...limits, rpm: null } }, 'limits')?.key).toBe('limitsOk');
  });

  it('belongs to the step it is dealt with on, and never blocks the start', () => {
    expect(STEP_OF.depth).toBe('run');
    expect(STEP_OF.limits).toBe('run');
    expect(STEP_OF.tools).toBe('run');
    const items = jobReadiness({
      ...BASE,
      depth: { cut: 9, stock: 6 },
      tools: { used: 1, open: 1 },
    });
    const states = stepStates({
      program: true,
      items,
      tools: { used: 1, unknown: 1 },
      running: false,
      finished: false,
    });
    // The job's tools are part of the check on Fräsen: a tool the list does not know warns there.
    expect(states.run).toBe('warn');
  });
});
