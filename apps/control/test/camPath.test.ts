import { rectangle, toolpaths, type CutSettings, type OperationKind } from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import {
  clampPath,
  ENTRIES,
  helixRange,
  PATH_LIMITS,
  takesEntry,
  takesPeck,
} from '../src/lib/camPath';

const settings = (tool: number): CutSettings => ({
  toolDiameter: tool,
  depth: 6,
  stepdown: 3,
  stepover: 0.4,
  feed: 1500,
  plungeFeed: 400,
  rampAngle: 5,
  safeZ: 5,
  climb: true,
});

/** The radius of the first helix a pocket program bores: the cutter's path, hole = 2 × radius + tool */
function holeOf(tool: number, asked: number | undefined): number {
  const path = toolpaths(
    [rectangle(0, 0, 80, 60)],
    [{ contour: 0, kind: 'pocket', entry: 'helix', helixDiameter: asked }],
    settings(tool),
  );
  expect(path.problems).toEqual([]);
  const arc = path.moves.find((m) => m.arc);
  return 2 * Math.hypot(arc!.arc!.i, arc!.arc!.j) + tool;
}

describe('how a pocket is entered and a hole is drilled, as numbers', () => {
  it('holds the fields to the outer bounds a project file may hold', () => {
    expect(PATH_LIMITS.helixDiameter.min).toBe(0.5);
    expect(clampPath('helixDiameter', 0.1)).toBe(0.5);
    expect(clampPath('helixDiameter', 9999)).toBe(200);
    expect(clampPath('helixDiameter', 9)).toBe(9);
    expect(clampPath('peck', 0.001)).toBe(0.05);
    expect(clampPath('peck', 99999)).toBe(500);
    expect(clampPath('peckRetract', -4)).toBe(0.05);
    expect(clampPath('peckRetract', 1.5)).toBe(1.5);
  });

  it('knows which kind of cut has the choice', () => {
    const kinds: OperationKind[] = ['outside', 'inside', 'on', 'pocket', 'drill', 'none'];
    expect(kinds.filter(takesEntry)).toEqual(['pocket']);
    expect(kinds.filter(takesPeck)).toEqual(['drill']);
    expect(ENTRIES).toEqual(['ramp', 'helix', 'plunge']);
  });

  it('says the range of the helix hole the way the library cuts it – checked against the arcs of a program', () => {
    for (const tool of [0.2, 1, 3, 6, 8]) {
      const { least, most, usual } = helixRange(tool);
      expect(holeOf(tool, undefined)).toBeCloseTo(usual, 6);
      // too narrow and too wide are held to the range, in between is taken as asked
      expect(holeOf(tool, 0.01)).toBeCloseTo(least, 6);
      expect(holeOf(tool, 1000)).toBeCloseTo(most, 6);
      if (most - least > 0.2) {
        expect(holeOf(tool, (least + most) / 2)).toBeCloseTo((least + most) / 2, 6);
      }
    }
    // by hand: a 6 mm cutter bores 9 mm by default, at least 6.5 and at most 12
    expect(helixRange(6)).toEqual({ least: 6.5, most: 12, usual: 9 });
    // a cutter finer than the clearance has one width only: the least
    expect(helixRange(0.2)).toEqual({ least: 0.7, most: 0.7, usual: 0.7 });
  });
});
