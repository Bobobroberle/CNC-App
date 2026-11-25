import { describe, expect, it } from 'vitest';
import {
  DOT_SIZE_TOLERANCE,
  PLATE_DEFAULT,
  dotSizeOff,
  offeredPoints,
  pitchSteps,
  plateSpan,
  plateWarnings,
  pointsFit,
  stepsClear,
  travelShortfall,
} from '../src/lib/calibrationPlate';

describe('the plate of docs/kalibriertafel.svg', () => {
  it('is 19 × 19 dots, 10 mm apart, Ø 3 mm – and its field is the distance of the outer dots', () => {
    expect(PLATE_DEFAULT).toEqual({ dots: 19, pitch: 10, dotDiameter: 3 });
    expect(plateSpan(19, 10)).toBe(180);
    expect(plateSpan(25, 12.5)).toBe(300);
    // no floating point dust in the field the card shows
    expect(plateSpan(4, 0.1)).toBe(0.3);
  });
});

describe('a field counted in pitches', () => {
  it('is a whole number of them, within a quarter of a pitch (a print that shrank is still the plate)', () => {
    expect(pitchSteps(180, 10)).toBe(18);
    expect(pitchSteps(180.3, 10)).toBe(18); // a plate that was measured
    expect(pitchSteps(179.2, 10)).toBe(18);
    expect(pitchSteps(178.6, 10)).toBe(18); // 0.8 % shrunk: the outer dots, entered as measured
    expect(pitchSteps(182.4, 10)).toBe(18);
    expect(pitchSteps(182.6, 10)).toBeNull(); // more than a quarter
    expect(pitchSteps(177.4, 10)).toBeNull();
    expect(pitchSteps(185, 10)).toBeNull(); // between two dots
    expect(pitchSteps(175, 10)).toBeNull();
    expect(pitchSteps(3, 10)).toBeNull(); // nearer to nothing than to one pitch
    expect(pitchSteps(10, 10)).toBe(1);
  });

  it('is nothing for a field or a pitch that is no length', () => {
    expect(pitchSteps(0, 10)).toBeNull();
    expect(pitchSteps(-10, 10)).toBeNull();
    expect(pitchSteps(100, 0)).toBeNull();
    expect(pitchSteps(Number.NaN, 10)).toBeNull();
    expect(pitchSteps(100, Number.NaN)).toBeNull();
  });
});

describe('the numbers of points that put every point on a dot', () => {
  it('for 180 mm of 10 mm: 2, 3, 4 and 7 – not 5 (45 mm) and not 6 (36 mm)', () => {
    expect(offeredPoints(180, 180, 10)).toEqual([2, 3, 4, 7]);
    expect(pointsFit(5, 180, 180, 10)).toBe(false);
    expect(pointsFit(7, 180, 180, 10)).toBe(true);
  });

  it('is counted in dots, not in mm: a measured plate of 180.3 or 178.6 mm offers the same', () => {
    expect(offeredPoints(180.3, 180.3, 10)).toEqual([2, 3, 4, 7]);
    expect(offeredPoints(178.6, 178.6, 10)).toEqual([2, 3, 4, 7]);
    expect(plateWarnings({ spanX: 178.6, spanY: 178.6, points: 3, pitch: 10, dots: 19 })).toEqual(
      [],
    );
  });

  it('must hold for both axes', () => {
    // 120 mm is 12 pitches, 180 mm is 18: n − 1 has to divide both (1, 2, 3 and 6)
    expect(offeredPoints(120, 180, 10)).toEqual([2, 3, 4, 7]);
    // 100 mm is 10 pitches, 180 mm is 18: n − 1 ∈ {1, 2}
    expect(offeredPoints(100, 180, 10)).toEqual([2, 3]);
    expect(pointsFit(4, 100, 180, 10)).toBe(false); // 10 / 3 is no whole number of pitches
  });

  it('is nothing where the field lies between dots – the card then keeps what is stored and warns', () => {
    expect(offeredPoints(185, 185, 10)).toEqual([]);
    expect(offeredPoints(180, 180, 0)).toEqual([]);
  });

  it('never offers one point, nor more than eight per axis', () => {
    expect(pointsFit(1, 180, 180, 10)).toBe(false);
    expect(pointsFit(0, 180, 180, 10)).toBe(false);
    expect(offeredPoints(1000, 1000, 10)).not.toContain(9);
    expect(Math.max(...offeredPoints(1000, 1000, 10))).toBeLessThanOrEqual(8);
  });
});

describe('the tilt of the plate and the first step of the run', () => {
  it('lands nearer the right dot than a neighbour only below about 25 pitches between points at 1°', () => {
    // the second point is predicted by a pure translation: a plate askew by θ is off across the step by step·sin θ
    expect(stepsClear(2, 180, 10)).toBe(true); // 18 pitches
    expect(stepsClear(2, 250, 10)).toBe(true); // 25 pitches: 0.44 pitch off
    expect(stepsClear(2, 260, 10)).toBe(false); // 26: over the budget (0.9 of half a pitch)
    expect(stepsClear(2, 286, 10)).toBe(false); // 28.6 pitches: half a pitch off – the camera takes the neighbour
    // the same in mm, whatever the pitch: 2.5 mm over 200 mm is 80 pitches between two points
    expect(stepsClear(2, 200, 2.5)).toBe(false);
    expect(stepsClear(3, 200, 2.5)).toBe(false); // 40
    expect(stepsClear(5, 200, 2.5)).toBe(true); // 20
    expect(stepsClear(6, 200, 2.5)).toBe(true); // 16
  });

  it('is nothing for a count that is none, or a plate that has no pitch', () => {
    expect(stepsClear(1, 180, 10)).toBe(false);
    expect(stepsClear(0, 180, 10)).toBe(false);
    expect(stepsClear(2, 180, 0)).toBe(false);
    expect(stepsClear(2, 180, -1)).toBe(false);
  });

  it('takes the counts away that a fine plate would have jump to the next row – and says it for a stored one', () => {
    // the ~200 mm glass plate: 81 dots, 2.5 mm
    expect(offeredPoints(200, 200, 2.5)).toEqual([5, 6]);
    const glass = { spanX: 200, spanY: 200, pitch: 2.5, dots: 81 };
    expect(plateWarnings({ ...glass, points: 3 })).toEqual(['pointsFarApart']);
    expect(plateWarnings({ ...glass, points: 5 })).toEqual([]);
    // 300 mm of 10 mm: 30 pitches – 2 × 2 is too far apart, 3 × 3 (15 pitches) is not
    expect(offeredPoints(300, 300, 10)).toEqual([3, 4, 6, 7]);
    // a field that lies between dots is said first – and then not also the distance of the points (no news)
    expect(plateWarnings({ spanX: 198.7, spanY: 198.7, pitch: 2.5, dots: 81, points: 3 })).toEqual([
      'spanOffPitch',
    ]);
    // only X counts: from the first row on the points are predicted from a fit that knows the tilt
    expect(stepsClear(3, 20, 2.5)).toBe(true);
    expect(offeredPoints(20, 200, 2.5)).toEqual([2, 3, 5]);
  });
});

describe('what is said about the field and the points', () => {
  const plate = { spanX: 180, spanY: 180, points: 3, pitch: 10, dots: 19 };

  it('nothing for the default plate with a count from the list', () => {
    expect(plateWarnings(plate)).toEqual([]);
    expect(plateWarnings({ ...plate, points: 7 })).toEqual([]);
  });

  it('says a field between dots – and then not also the points (no news)', () => {
    expect(plateWarnings({ ...plate, spanX: 175 })).toEqual(['spanOffPitch']);
    expect(plateWarnings({ ...plate, spanY: 175, points: 5 })).toEqual(['spanOffPitch']);
  });

  it('says points that do not lie on dots, with the field itself on the pitch', () => {
    expect(plateWarnings({ ...plate, points: 5 })).toEqual(['pointsOffPitch']);
  });

  it('says a field larger than the plate, with a margin of a tenth of a pitch', () => {
    expect(plateWarnings({ ...plate, spanX: 190, points: 2 })).toEqual(['spanBeyondPlate']);
    expect(plateWarnings({ ...plate, spanX: 180.9, points: 2 })).toEqual([]);
    expect(plateWarnings({ ...plate, spanX: 195, points: 2 })).toEqual([
      'spanOffPitch',
      'spanBeyondPlate',
    ]);
  });

  it('never forbids: a smaller plate or a hand-made field still gives a list, not an exception', () => {
    expect(plateWarnings({ spanX: 50, spanY: 50, points: 2, pitch: 10, dots: 5 })).toEqual([
      'spanBeyondPlate',
    ]);
    // 5 pitches with 3 points: the points are off the dots too – both are said, in this order
    expect(plateWarnings({ spanX: 50, spanY: 50, points: 3, pitch: 10, dots: 5 })).toEqual([
      'pointsOffPitch',
      'spanBeyondPlate',
    ]);
  });
});

describe('the size of a dot against the plate', () => {
  it('is off beyond ten percent either way', () => {
    expect(DOT_SIZE_TOLERANCE).toBe(0.1);
    expect(dotSizeOff(3, 3)).toBe(false);
    expect(dotSizeOff(3.29, 3)).toBe(false);
    expect(dotSizeOff(3.31, 3)).toBe(true);
    expect(dotSizeOff(2.71, 3)).toBe(false);
    expect(dotSizeOff(2.69, 3)).toBe(true);
    // the e2e rig: believes 18 px/mm, is 20 → a dot looks 11 % too big
    expect(dotSizeOff(3 * (20 / 18), 3)).toBe(true);
    expect(dotSizeOff(3.2, 3.2)).toBe(false);
    expect(dotSizeOff(3, 3.2)).toBe(false);
  });

  it('is never off against a plate that has no size', () => {
    expect(dotSizeOff(3, 0)).toBe(false);
    expect(dotSizeOff(3, -1)).toBe(false);
  });

  it('takes a tolerance of its own', () => {
    expect(dotSizeOff(3.2, 3, 0.05)).toBe(true);
    expect(dotSizeOff(3.2, 3, 0.5)).toBe(false);
  });
});

describe('the travel of a run from the corner dot', () => {
  const travel = { x: { min: -1220, max: 0 }, y: { min: -2440, max: 0 } };

  it('fits where the field and the room lie below the upper end – 5 % of the field, 9 mm for 180', () => {
    expect(travelShortfall({ x: -500, y: -500 }, travel, 180, 180)).toBeNull();
    // exactly at the edge: field + 9 mm
    expect(travelShortfall({ x: -189, y: -500 }, travel, 180, 180)).toBeNull();
    expect(travelShortfall({ x: -188.9, y: -500 }, travel, 180, 180)).toEqual({
      axis: 'x',
      side: 'max',
      short: 0.1,
    });
  });

  it('names the axis that falls shortest, rounded up to a tenth', () => {
    expect(travelShortfall({ x: -100, y: -500 }, travel, 180, 180)).toEqual({
      axis: 'x',
      side: 'max',
      short: 89,
    });
    expect(travelShortfall({ x: -500, y: -184.95 }, travel, 180, 180)).toEqual({
      axis: 'y',
      side: 'max',
      short: 4.1,
    });
    // both: the larger one is said
    expect(travelShortfall({ x: -170, y: -90 }, travel, 180, 180)).toMatchObject({
      axis: 'y',
      short: 99,
    });
  });

  it('gives the lower end the same room: a plate that lies askew has points below the first dot', () => {
    // 1° askew, 180 mm: the top left dot lies 3.1 mm below the start; the first dot is not under the crosshair
    expect(travelShortfall({ x: -1210.7, y: -500 }, travel, 180, 180)).toBeNull();
    expect(travelShortfall({ x: -1210.8, y: -500 }, travel, 180, 180)).toEqual({
      axis: 'x',
      side: 'min',
      short: 0.1,
    });
    // the first point is reached from 0.3 mm under it – and from further under with a longer approach
    expect(travelShortfall({ x: -1219.9, y: -500 }, travel, 5, 5)).toEqual({
      axis: 'x',
      side: 'min',
      short: 5.2,
    });
    expect(travelShortfall({ x: -1214.5, y: -500 }, travel, 5, 5, 1)).toMatchObject({
      axis: 'x',
      side: 'min',
    });
    // the room of the other axis counts: a long field in Y tilts the points of X
    expect(travelShortfall({ x: -1214.7, y: -500 }, travel, 5, 400)).toMatchObject({ side: 'min' });
  });

  it('grows with the larger field, and has the least room a small field is given', () => {
    // 400 mm: 20 mm of room, not 5
    expect(travelShortfall({ x: -420, y: -500 }, travel, 400, 400)).toBeNull();
    expect(travelShortfall({ x: -419, y: -500 }, travel, 400, 400)).toMatchObject({ short: 1 });
    // 20 mm: the 5 mm are the least
    expect(travelShortfall({ x: -25, y: -500 }, travel, 20, 20)).toBeNull();
    expect(travelShortfall({ x: -24, y: -500 }, travel, 20, 20)).toMatchObject({ short: 1 });
    // a room of one's own
    expect(travelShortfall({ x: -179, y: -500 }, travel, 180, 180, 0.3, 0, 0)).toEqual({
      axis: 'x',
      side: 'max',
      short: 1,
    });
    expect(travelShortfall({ x: -180, y: -500 }, travel, 180, 180, 0.3, 0, 0)).toBeNull();
  });
});
