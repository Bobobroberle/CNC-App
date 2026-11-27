import { describe, expect, it } from 'vitest';
import {
  circle,
  MIN_PECK,
  PECK_REENTRY,
  rectangle,
  toolpaths,
  type CutSettings,
  type Move,
  type Operation,
} from '../src';
import { rapidsEndInAir, seeded } from './support';

/** Peck drilling. A 6 mm cutter, clearance plane at 5, the surface at 0; every number worked out by hand. */
const s: CutSettings = {
  toolDiameter: 6,
  depth: 6,
  stepdown: 3,
  stepover: 0.4,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 10,
  safeZ: 5,
  climb: true,
};
const hole = circle(10, 10, 6);
const drill = (op: Partial<Operation>, settings: CutSettings = s, contour = hole) =>
  toolpaths([contour], [{ contour: 0, kind: 'drill', ...op }], settings);
/** What happens in the hole itself, after the approach (to the clearance plane, to the spot, to 1 above the surface) */
const inside = (moves: Move[]) => moves.slice(3, -1);
const plunge = (z: number): Move => ({ z, feed: 300 });
const rapid = (z: number): Move => ({ z, feed: null });

describe('peck drilling', () => {
  it('goes down in steps of the peck, the last exactly to the depth, and comes out to the clearance plane', () => {
    const { moves, problems } = drill({ peck: 2 });
    expect(problems).toEqual([]);
    // The approach is the plain drill's: up to 5, to the spot, down to 1 above the surface
    expect(moves.slice(0, 3)).toEqual([rapid(5), { x: 10, y: 10, feed: null }, rapid(1)]);
    // 2, 4, 6: after each but the last, up to 5 and at rapid down to 0.5 above the depth reached
    expect(PECK_REENTRY).toBe(0.5);
    expect(inside(moves)).toEqual([
      plunge(-2),
      rapid(5),
      rapid(-1.5),
      plunge(-4),
      rapid(5),
      rapid(-3.5),
      plunge(-6),
    ]);
    expect(moves.at(-1)).toEqual(rapid(5));
    // 4 does not divide 6: the second step is the rest
    expect(inside(drill({ peck: 4 }).moves)).toEqual([
      plunge(-4),
      rapid(5),
      rapid(-3.5),
      plunge(-6),
    ]);
    // A peck of the depth, or more, is one step
    expect(inside(drill({ peck: 6 }).moves)).toEqual([plunge(-6)]);
    expect(inside(drill({ peck: 40 }).moves)).toEqual([plunge(-6)]);
    // Each depth is k times the peck, not a sum: 0.3 deep in steps of 0.1
    const fine = inside(drill({ peck: 0.1, depth: 0.3 }).moves).filter((m) => m.feed === 300);
    expect(fine.map((m) => m.z)).toEqual([-0.1, -0.2, -0.3]);
    // The depth of the operation is used, not the job's
    expect(inside(drill({ peck: 3, depth: 3 }).moves)).toEqual([plunge(-3)]);
  });

  it('breaks chips with a short retract: up a little and on at the plunge feed, never above the clearance plane', () => {
    expect(inside(drill({ peck: 2, peckRetract: 1 }).moves)).toEqual([
      plunge(-2),
      rapid(-1),
      plunge(-4),
      rapid(-3),
      plunge(-6),
    ]);
    // More than the peck: still up that far above the depth reached (−4 + 3 = −1)
    expect(inside(drill({ peck: 2, peckRetract: 3 }).moves)).toEqual([
      plunge(-2),
      rapid(1),
      plunge(-4),
      rapid(-1),
      plunge(-6),
    ]);
    // Far more than there is room for: the clearance plane
    expect(inside(drill({ peck: 2, peckRetract: 100 }).moves)).toEqual([
      plunge(-2),
      rapid(5),
      plunge(-4),
      rapid(5),
      plunge(-6),
    ]);
    // A low clearance plane: 0.2 is above −2 + 0.5, the way down ends at −1.5
    expect(inside(drill({ peck: 2 }, { ...s, safeZ: 0.2 }).moves)).toEqual([
      plunge(-2),
      rapid(0.2),
      rapid(-1.5),
      plunge(-4),
      rapid(0.2),
      rapid(-3.5),
      plunge(-6),
    ]);
    // One that is below −0.2 + 0.5: the way down ends at the clearance plane, never above it
    expect(inside(drill({ peck: 0.2, depth: 0.4 }, { ...s, safeZ: 0.1 }).moves)).toEqual([
      plunge(-0.2),
      rapid(0.1),
      rapid(0.1),
      plunge(-0.4),
    ]);
  });

  it('asks nothing of a bored hole, another kind or a wrong number: the contour is cut as without, and it is said', () => {
    const bored = circle(50, 10, 20);
    const without = (op: Partial<Operation>, c = bored) =>
      JSON.stringify(drill({ ...op, peck: undefined, peckRetract: undefined }, s, c).moves);
    // A circle wider than the cutter is bored in a helix: no peck
    const wide = drill({ peck: 2 }, s, bored);
    expect(wide.problems).toEqual([{ contour: 0, code: 'peck-not-possible' }]);
    expect(JSON.stringify(wide.moves)).toBe(without({}));
    // The widest that is still drilled straight: 0.2 wider than the cutter
    expect(drill({ peck: 2 }, s, circle(0, 0, 6.19)).problems).toEqual([]);
    expect(drill({ peck: 2 }, s, circle(0, 0, 6.2)).problems).toEqual([
      { contour: 0, code: 'peck-not-possible' },
    ]);
    // Not a number, not above 0 and below the least step
    for (const peck of [0, -1, Number.NaN, Infinity, MIN_PECK / 2]) {
      const wrong = drill({ peck });
      expect(wrong.problems).toEqual([{ contour: 0, code: 'peck-not-possible' }]);
      expect(JSON.stringify(wrong.moves)).toBe(without({}, hole));
    }
    for (const peckRetract of [0, -1, Number.NaN, Infinity]) {
      const wrong = drill({ peck: 2, peckRetract });
      expect(wrong.problems).toEqual([{ contour: 0, code: 'peck-not-possible' }]);
      expect(JSON.stringify(wrong.moves)).toBe(without({}, hole));
    }
    // The least step is a step
    expect(drill({ peck: MIN_PECK, depth: 1 }).problems).toEqual([]);
    // A retract without a peck means nothing and says nothing
    const loose = drill({ peckRetract: 2 });
    expect(loose.problems).toEqual([]);
    expect(JSON.stringify(loose.moves)).toBe(without({}, hole));
    // Other kinds are cut as they are and the peck is said
    const part = rectangle(0, 0, 60, 40);
    for (const kind of ['outside', 'inside', 'pocket', 'on'] as const) {
      const asked = toolpaths([part], [{ contour: 0, kind, peck: 2 }], s);
      expect(asked.problems).toEqual([{ contour: 0, code: 'peck-not-possible' }]);
      expect(JSON.stringify(asked.moves)).toBe(
        JSON.stringify(toolpaths([part], [{ contour: 0, kind }], s).moves),
      );
    }
    // What cannot be drilled at all says that and no more
    expect(drill({ peck: 2 }, s, circle(0, 0, 4)).problems).toEqual([
      { contour: 0, code: 'hole-too-small' },
    ]);
    const open = { closed: false, points: [...rectangle(0, 0, 4, 4).points] };
    expect(drill({ peck: 2 }, s, open).problems).toEqual([{ contour: 0, code: 'open-contour' }]);
  });

  it('is the same program as without where no peck is asked for', () => {
    expect(JSON.stringify(drill({ peck: undefined }).moves)).toBe(JSON.stringify(drill({}).moves));
    // The straight drill still goes down by the job's step down and comes back to 1 above the surface each time
    expect(inside(drill({}).moves)).toEqual([plunge(-3), rapid(1), plunge(-6), rapid(1)]);
  });

  it('never ends a rapid in material: replayed over every kind of hole, depth, peck, retract and clearance plane', () => {
    const rand = seeded(7);
    let programs = 0;
    for (const safeZ of [5, 2, 0.3]) {
      for (const depth of [0.3, 3, 6, 10.7]) {
        for (const peck of [undefined, 0.05, 0.7, 2, 2.5, 6, 25]) {
          for (const peckRetract of [undefined, 0.5, 1, 100]) {
            const contours = [
              circle(10, 10, 6),
              circle(30, 10, 6.1),
              circle(rand() * 50, 30, 20),
              circle(10, 50, 6),
            ];
            const operations: Operation[] = contours.map((_, contour) => ({
              contour,
              kind: 'drill',
              depth: contour === 3 ? depth / 2 : depth,
              peck,
              peckRetract,
            }));
            const { moves } = toolpaths(contours, operations, { ...s, safeZ });
            expect(rapidsEndInAir(moves, { x: 0, y: 0, z: safeZ })).toEqual([]);
            // Nothing goes deeper than the deepest hole, and the program ends at the clearance plane
            expect(Math.min(...moves.map((m) => m.z ?? 0))).toBeCloseTo(-depth, 9);
            expect(moves.at(-1)).toEqual({ z: safeZ, feed: null });
            programs++;
          }
        }
      }
    }
    expect(programs).toBe(3 * 4 * 7 * 4);
  });

  it('is watched by an oracle that can fail: a rapid down into the uncut part of a hole', () => {
    const bad: Move[] = [
      { z: 5, feed: null },
      { x: 10, y: 10, feed: null },
      { z: 1, feed: null },
      { z: -2, feed: 300 },
      { z: -4, feed: null },
    ];
    expect(rapidsEndInAir(bad)).toEqual(['move 4: rapid to z -4, the hole is cut to -2 only']);
    // Sideways below the surface (and ending below what was cut: the oracle names both)
    expect(rapidsEndInAir([{ x: 5, feed: null }], { x: 0, y: 0, z: -1 })).toEqual([
      'move 0: sideways rapid below the surface',
      'move 0: rapid to z -1, the hole is cut to 0 only',
    ]);
  });
});
