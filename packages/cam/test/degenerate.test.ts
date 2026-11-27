import { describe, expect, it } from 'vitest';
import { toolpaths, type Contour, type CutSettings } from '../src';

const s: CutSettings = {
  toolDiameter: 6,
  depth: 2,
  stepdown: 1,
  stepover: 0.4,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 10,
  safeZ: 5,
  climb: true,
};

describe('a closed contour without any length', () => {
  // A closed contour whose points all lie on one spot used to make the walk round it loop for ever (a
  // perimeter of 0 never reaches the end of the passes): a page opening such a file froze
  it.each([
    ['one point', [{ x: 1, y: 1 }]],
    [
      'all points on one spot',
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
    ],
  ])('is engraved as a dot, not walked: %s', (_name, points) => {
    const contour: Contour = { closed: true, points };
    const { moves, problems } = toolpaths([contour], [{ contour: 0, kind: 'on' }], s);
    expect(problems).toEqual([]);
    // up to the clearance plane, to the spot, down to 1 above the surface, then a plunge per pass and out
    expect(moves[0]).toEqual({ z: 5, feed: null });
    expect(moves[1]).toEqual({ x: 1, y: 1, feed: null });
    expect(moves.filter((m) => m.feed === 300).map((m) => m.z)).toEqual([-1, -2]);
    expect(moves[moves.length - 1]).toEqual({ z: 5, feed: null });
  });

  it('leaves a closed contour that has a length as it was: a loop', () => {
    const square: Contour = {
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };
    const { moves } = toolpaths([square], [{ contour: 0, kind: 'on' }], s);
    // The loop goes round: it visits all four corners
    for (const c of square.points) {
      expect(moves.some((m) => m.x === c.x && m.y === c.y)).toBe(true);
    }
  });
});
