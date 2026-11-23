import { analyzeProgram } from '@lowrider/gcode-core';
import { describe, expect, it } from 'vitest';
import { controllerIssues } from '../src/lib/jobChecks';
import { LOWRIDER_V4_PROFILE } from '../src/lib/profile';

const fluidnc = LOWRIDER_V4_PROFILE.controller;

describe('controllerIssues', () => {
  it('flags a mid-job tool change and M1 on a plain FluidNC', () => {
    const a = analyzeProgram('T1 M6\nG0 X1\nM1\nT2 M6\nG0 X2\nT2 M6\nM30');
    expect(controllerIssues(a, fluidnc)).toEqual([
      { severity: 'warning', kind: 'optionalStop', lineIndex: 2 },
      { severity: 'error', kind: 'toolChange', lineIndex: 3, tool: 2 },
    ]);
  });

  it('accepts the first tool and handled tool changes', () => {
    const a = analyzeProgram('T1 M6\nG0 X1\nT2 M6\nG0 X2');
    expect(controllerIssues(a, { ...fluidnc, toolChangeHandled: true })).toEqual([]);
    expect(controllerIssues(analyzeProgram('G0 X1\nT3 M6'), fluidnc)).toEqual([]);
  });
});
