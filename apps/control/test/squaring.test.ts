import { rectangleCheck, squaringPulloff, type RectangleMeasure } from '@lowrider/workshop';
import { describe, expect, it } from 'vitest';
import {
  compareSquaring,
  perMetre,
  RULER_NOISE_PER_METRE,
  squaringStory,
  type GantrySide,
} from '../src/lib/squaring';

const DEG = Math.PI / 180;

/**
 * The six distances a ruler gives on four marks A (0,0) B (a,0) C (a,b) D (0,b) as a gantry makes them whose X+ end
 * runs ahead towards +Y by the angle `gamma`: the X axis turned, the Y axis straight.
 */
function measured(a: number, b: number, gamma: number): RectangleMeasure {
  const g = gamma * DEG;
  const A = [0, 0];
  const B = [a * Math.cos(g), a * Math.sin(g)];
  const D = [0, b];
  const C = [B[0]! + D[0]!, B[1]! + D[1]!];
  const d = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!);
  return {
    bottom: d(A, B),
    top: d(D, C),
    left: d(A, D),
    right: d(B, C),
    diagonalAC: d(A, C),
    diagonalBD: d(B, D),
  };
}

/** Where an end of the gantry stands in Y after homing, relative to its switch: the pull-off leaves it further +Y when homing towards −Y. */
const endY = (pulloff: number, homingPositive: boolean) => (homingPositive ? -pulloff : pulloff);

describe('what a measured lean means', () => {
  it('says nothing of an angle that is not trustworthy', () => {
    expect(squaringStory(null, null)).toEqual({ kind: 'unknown' });
    expect(squaringStory(Number.NaN, 1)).toEqual({ kind: 'unknown' });
  });

  it('tells the side that runs ahead and the lean over a metre, even without the rail distance', () => {
    const s = squaringStory(0.1, null);
    expect(s).toMatchObject({ kind: 'lean', ahead: 'xMax' });
    expect(s.perMetre).toBeCloseTo(1.745, 2);
    expect(s.move).toBeUndefined();
    expect(squaringStory(-0.1, null)).toMatchObject({ kind: 'lean', ahead: 'xMin' });
  });

  it('is square where the correction would be smaller than the least worth making', () => {
    expect(squaringStory(0.001, 0.02)).toMatchObject({ kind: 'square' });
    expect(squaringStory(0.1, -0.05)).toMatchObject({ kind: 'square' });
  });

  it('moves the X+ end to the front when it runs ahead, to the back when it hangs behind', () => {
    expect(squaringStory(0.1, -2.4)).toMatchObject({
      kind: 'lean',
      ahead: 'xMax',
      leanMm: 2.4,
      move: { mm: 2.4, towards: 'front' },
    });
    expect(squaringStory(-0.1, 2.4)).toMatchObject({
      ahead: 'xMin',
      move: { mm: 2.4, towards: 'back' },
    });
  });
});

describe('the words against the geometry: a gantry racked by a known amount, measured, corrected', () => {
  const width = 1400;
  for (const homingPositive of [false, true]) {
    for (const motor1Side of ['xMin', 'xMax'] as GantrySide[]) {
      for (const gamma of [0.12, -0.12]) {
        it(`X+ end ${gamma > 0 ? 'ahead' : 'behind'}, motor 1 at ${motor1Side}, homing ${homingPositive ? '+Y' : '−Y'}`, () => {
          const m = measured(500, 400, gamma);
          const check = rectangleCheck({ x: 500, y: 400 }, m)!;
          // the ruler finds the lean, with the sign the story is told in
          expect(check.squareness).toBeCloseTo(gamma, 3);
          const fix = squaringPulloff({
            pulloff0: 4,
            pulloff1: 4,
            gantryWidth: width,
            squareness: check.squareness,
            motor1Side,
            homingPositive,
          });
          const story = squaringStory(check.squareness, fix.shift);
          expect(story.ahead).toBe(gamma > 0 ? 'xMax' : 'xMin');
          expect(story.leanMm).toBeCloseTo(width * Math.tan(Math.abs(gamma) * DEG), 2);
          // what the written pull-offs do to the gantry after the next homing: the X+ end against the X− end
          const plus = motor1Side === 'xMax' ? fix.pulloff1 : fix.pulloff0;
          const minus = motor1Side === 'xMax' ? fix.pulloff0 : fix.pulloff1;
          const before = endY(4, homingPositive) - endY(4, homingPositive);
          const moved = endY(plus, homingPositive) - endY(minus, homingPositive) - before;
          // …is the move the story announces: towards the front is −Y
          expect(Math.sign(moved)).toBe(story.move!.towards === 'front' ? -1 : 1);
          expect(Math.abs(moved)).toBeCloseTo(story.move!.mm, 2);
          // and it cancels the lean: the X+ end was ahead (+Y) by the lean, it moves back by as much
          const leanBefore = width * Math.tan(gamma * DEG);
          expect(leanBefore + moved).toBeCloseTo(0, 2);
        });
      }
    }
  }
});

describe('the control measurement against the first', () => {
  it('is good where the ruler cannot see a lean any more, whatever the first one was', () => {
    expect(compareSquaring(0.12, 0.001)).toBe('good');
    expect(compareSquaring(0.12, -0.001)).toBe('good');
    expect(perMetre(0.001)).toBeLessThan(RULER_NOISE_PER_METRE);
  });

  it('is better where the error has shrunk clearly, on either side', () => {
    expect(compareSquaring(0.12, 0.04)).toBe('better');
    expect(compareSquaring(0.12, -0.04)).toBe('better');
  });

  it('says the correction did not act where it is about as large as before', () => {
    expect(compareSquaring(0.12, 0.11)).toBe('unchanged');
    expect(compareSquaring(0.12, 0.13)).toBe('unchanged');
  });

  it('says the side of motor 1 is the other one where it is about twice as large on the same side', () => {
    expect(compareSquaring(0.12, 0.24)).toBe('doubled');
    expect(compareSquaring(-0.12, -0.23)).toBe('doubled');
  });

  it('says too much was corrected where it is large on the other side', () => {
    expect(compareSquaring(0.12, -0.12)).toBe('overshot');
    expect(compareSquaring(0.12, -0.3)).toBe('overshot');
  });

  it('follows the geometry: a correction with the motor sides swapped doubles the error', () => {
    const width = 1400;
    const gamma = 0.1;
    const m = measured(500, 400, gamma);
    const check = rectangleCheck({ x: 500, y: 400 }, m)!;
    // the operator says motor 1 is at xMax; in truth it is at xMin
    const fix = squaringPulloff({
      pulloff0: 4,
      pulloff1: 4,
      gantryWidth: width,
      squareness: check.squareness,
      motor1Side: 'xMax',
      homingPositive: false,
    });
    const truePlus = fix.pulloff0; // motor 0 is really on the X+ side
    const trueMinus = fix.pulloff1;
    const moved = endY(truePlus, false) - endY(trueMinus, false);
    const lean = width * Math.tan(gamma * DEG) + moved;
    const after = Math.atan(lean / width) / DEG;
    expect(compareSquaring(check.squareness, after)).toBe('doubled');
  });
});
