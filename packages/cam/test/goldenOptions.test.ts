import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  circle,
  rapidLength,
  rectangle,
  toGcode,
  toolpaths,
  type CutSettings,
  type Operation,
} from '../src';

/**
 * A whole program with the options of the toolpath library switched on – peck drilling (full retract and chip
 * breaking), a pocket entered on a helix, tabs kept off the corners, the shorter route and one operation put
 * first by hand – kept as a file, like the sign in `golden.test.ts`: a change shows up as a diff of G-code
 * that can be read before it is accepted with `pnpm --filter @lowrider/cam test -u`. (The sign itself is
 * without any of them and must not change.)
 */
const settings: CutSettings = {
  toolDiameter: 3,
  depth: 6,
  stepdown: 2,
  stepover: 0.4,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 10,
  safeZ: 5,
  climb: true,
  allowance: 0.3,
};

describe('golden program with the options', () => {
  it('a plate: pecked holes, a pocket on a helix, tabs off the corners, the short route', async () => {
    const shapes = [
      rectangle(0, 0, 120, 70, 0),
      circle(10, 60, 3),
      circle(110, 60, 3),
      circle(110, 10, 3),
      rectangle(25, 20, 50, 30),
      rectangle(90, 25, 20, 20),
    ];
    const operations: Operation[] = [
      {
        contour: 0,
        kind: 'outside',
        tabs: { count: 3, width: 6, height: 1.5, avoidCorners: true },
      },
      { contour: 1, kind: 'drill', peck: 2 },
      { contour: 2, kind: 'drill', peck: 2, peckRetract: 0.5 },
      { contour: 3, kind: 'drill', seq: 1 },
      { contour: 4, kind: 'pocket', entry: 'helix' },
      { contour: 5, kind: 'inside', relief: 'dogbone' },
    ];
    const plain = toolpaths(shapes, operations, settings);
    const short = toolpaths(shapes, operations, settings, undefined, { route: 'short' });
    expect(short.problems).toEqual([]);
    expect(rapidLength(short.moves)).toBeLessThanOrEqual(rapidLength(plain.moves) + 1e-9);
    const code = toGcode(short.moves, { name: 'platte', rpm: 18000, safeZ: 5 });
    await expect(code).toMatchFileSnapshot(join(import.meta.dirname, 'golden', 'optionen.nc'));
  });
});
