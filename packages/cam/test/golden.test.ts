import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  circle,
  defaultOperations,
  rectangle,
  textContours,
  toGcode,
  toolpaths,
  type CutSettings,
  type Operation,
} from '../src';

/**
 * Whole programs, kept as files: any change to the toolpaths shows up as a
 * diff of G-code that can be read (and simulated) before it is accepted with
 * `pnpm --filter @lowrider/cam test -u`.
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

describe('golden programs', () => {
  it('a sign: engraved text, two holes, a slot with dogbones, the outline with tabs', async () => {
    const text = textContours('Fräse\nNr. 1', { height: 12, x: 60, y: 42, align: 'center' });
    const shapes = [
      rectangle(0, 0, 120, 70, 8),
      circle(10, 60, 3),
      circle(110, 60, 3),
      rectangle(45, 6, 30, 6),
    ];
    const tabs = { count: 4, width: 6, height: 1.5 };
    const operations: Operation[] = [
      ...defaultOperations(shapes, settings.toolDiameter, tabs).map((o) =>
        o.contour === 3 ? { ...o, relief: 'dogbone' as const } : o,
      ),
      ...text.contours.map((_, i) => ({
        contour: shapes.length + i,
        kind: 'on' as const,
        depth: 0.8,
      })),
    ];
    expect(operations.slice(0, 4).map((o) => o.kind)).toEqual([
      'outside',
      'drill',
      'drill',
      'inside',
    ]);
    const { moves, problems } = toolpaths([...shapes, ...text.contours], operations, settings);
    expect(problems).toEqual([]);
    const code = toGcode(moves, { name: 'schild', rpm: 18000, safeZ: 5 });
    await expect(code).toMatchFileSnapshot(join(import.meta.dirname, 'golden', 'schild.nc'));
  });
});
