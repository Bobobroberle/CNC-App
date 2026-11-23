import {
  applyToPoint,
  circle,
  contourBounds,
  IDENTITY,
  rotation,
  textContours,
  toGcode,
  toolpaths,
  translation,
  type Contour,
} from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import type { BlankShape } from '../src/lib/blanks';
import { imageToMachine } from '../src/lib/camera';
import {
  blankOnTable,
  cutOrder,
  entryCuts,
  fitsPicture,
  foldAngle,
  mapPixel,
  motifAngle,
  motifCentre,
  motifFits,
  motifPlacement,
  parseNames,
  planSeries,
  reachOf,
  seriesFileName,
  textBlockCentre,
  turnStep,
  withText,
  wordsFor,
  type MotifPart,
  type TableBlank,
} from '../src/lib/series';

const line = (x1: number, y1: number, x2: number, y2: number): Contour => ({
  points: [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ],
  closed: false,
});

/** A rectangular blank on the table by its middle, sides and angle. */
function rectBlank(id: number, x: number, y: number, length: number, width: number, angle: number) {
  const a = (angle * Math.PI) / 180;
  const corner = (i: number, j: number) => ({
    x: x + (i * length * Math.cos(a)) / 2 - (j * width * Math.sin(a)) / 2,
    y: y + (i * length * Math.sin(a)) / 2 + (j * width * Math.cos(a)) / 2,
  });
  return {
    id,
    kind: 'rect',
    x,
    y,
    length,
    width,
    angle,
    outline: [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)],
    measured: false,
  } satisfies TableBlank;
}

/** A rectangle as the finder reports it: 280 × 160 px around pixel (200, 120), turned 30° as seen. */
const SHAPE: BlankShape = {
  kind: 'rect',
  x: 200,
  y: 120,
  length: 280,
  width: 160,
  angle: 30,
  outline: [
    { x: 200, y: 120 },
    { x: 300, y: 120 },
  ],
  contrast: 90,
};

describe('from the picture onto the table', () => {
  it('lays a blank of the photo map onto the table: y turns over, the angle stays', () => {
    // The picture starts at machine X 400 / Y 380 and has 4 px per mm:
    // pixel (200, 120) is 50 mm right of and 30 mm below that corner.
    const toTable = mapPixel(400, 380, 4);
    expect(toTable({ x: 200, y: 120 })).toEqual({ x: 450, y: 350 });
    const blank = blankOnTable(SHAPE, toTable);
    expect(blank).toMatchObject({ kind: 'rect', x: 450, y: 350 });
    expect(blank.length).toBeCloseTo(70, 9);
    expect(blank.width).toBeCloseTo(40, 9);
    // Counter-clockwise as seen is counter-clockwise on the table (X right, Y to the back).
    expect(blank.angle).toBeCloseTo(30, 9);
    // 100 px to the right in the picture are 25 mm towards +X.
    expect(blank.outline[1]).toEqual({ x: 475, y: 350 });
  });

  it('lays a blank of the live picture onto the table through the camera calibration', () => {
    // Camera 10 px/mm, turned 2° against the machine, its middle 35 / −20 mm beside the spindle,
    // which stands at 300 / 200. Pixel (700, 350) of 1200 × 900 is 10 mm right of and 10 mm
    // above the middle; turned by 2° that is (9.645, 10.343) on the table.
    const camera = { offsetX: 35, offsetY: -20, pxPerMm: 10, rotation: 2 };
    const size = { width: 1200, height: 900 };
    const toTable = (px: { x: number; y: number }) =>
      imageToMachine(camera, px, size, { x: 300, y: 200 });
    const blank = blankOnTable({ ...SHAPE, x: 700, y: 350 }, toTable);
    expect(blank.x).toBeCloseTo(344.645, 3);
    expect(blank.y).toBeCloseTo(190.343, 3);
    expect(blank.length).toBeCloseTo(28, 6);
    expect(blank.angle).toBeCloseTo(32, 6);
    // A square seen at 44° lies at 46° – which is the same square as −44°.
    const square = blankOnTable({ ...SHAPE, kind: 'square', angle: 44 }, toTable);
    expect(square.angle).toBeCloseTo(-44, 6);
    // A round blank has no direction on the table either.
    expect(blankOnTable({ ...SHAPE, kind: 'round', angle: null }, toTable).angle).toBeNull();
  });

  it('folds angles', () => {
    expect(foldAngle(200, 180)).toBe(20);
    expect(foldAngle(-90, 180)).toBe(90);
    expect(foldAngle(90, 180)).toBe(90);
    expect(foldAngle(46, 90)).toBe(-44);
    expect(foldAngle(-270, 360)).toBe(90);
  });
});

describe('order and turn', () => {
  it('cuts the blank nearest the front left first, then always the nearest', () => {
    const blanks = [
      { x: 300, y: 100, id: 'a' },
      { x: 100, y: 120, id: 'b' },
      { x: 320, y: 110, id: 'c' },
      { x: 90, y: 300, id: 'd' },
    ];
    // From the origin b (156 mm) is nearest; from b, d (180) before a (201); then a, then c.
    expect(cutOrder(blanks).map((b) => b.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(cutOrder(blanks, { x: 330, y: 100 }).map((b) => b.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(cutOrder([])).toEqual([]);
  });

  it('turns a rectangle by half turns, a square and a round blank by quarter turns', () => {
    const rect = { kind: 'rect', angle: 77 } as const;
    expect(turnStep(rect)).toBe(180);
    expect(motifAngle(rect)).toBe(77);
    expect(motifAngle(rect, 1)).toBe(-103);
    expect(motifAngle(rect, 2)).toBe(77);
    const square = { kind: 'square', angle: -12 } as const;
    expect(turnStep(square)).toBe(90);
    expect(motifAngle(square, 1)).toBe(78);
    expect(motifAngle(square, 3)).toBe(-102);
    // No direction: the motif lies along machine X until it is turned.
    const round = { kind: 'round', angle: null } as const;
    expect(turnStep(round)).toBe(90);
    expect(motifAngle(round)).toBe(0);
    expect(motifAngle(round, 1)).toBe(90);
    expect(turnStep({ kind: 'other', angle: null })).toBe(90);
    expect(turnStep({ kind: 'other', angle: 10 })).toBe(180);
  });
});

describe('the motif on a blank', () => {
  const blank = rectBlank(1, 450, 350, 70, 40, 30);

  it('puts the middle of the motif on the middle of the blank and turns it with the blank', () => {
    // A 20 mm line along X from the drawing's zero: its middle is (10, 0).
    const m = motifPlacement(blank, 0, { x: 10, y: 0 });
    // Its ends lie 10 mm from the blank's middle along 30°: ∓(8.660, 5).
    const a = applyToPoint(m, { x: 0, y: 0 });
    const b = applyToPoint(m, { x: 20, y: 0 });
    expect(a.x).toBeCloseTo(441.34, 3);
    expect(a.y).toBeCloseTo(345, 3);
    expect(b.x).toBeCloseTo(458.66, 3);
    expect(b.y).toBeCloseTo(355, 3);
    // What is above the middle in the drawing goes to the upper left: counter-clockwise.
    const up = applyToPoint(m, { x: 10, y: 5 });
    expect(up.x).toBeCloseTo(447.5, 3);
    expect(up.y).toBeCloseTo(354.33, 3);
    // Turned once (half a turn on a rectangle) the ends swap.
    const turned = applyToPoint(motifPlacement(blank, 1, { x: 10, y: 0 }), { x: 0, y: 0 });
    expect(turned.x).toBeCloseTo(458.66, 3);
    expect(turned.y).toBeCloseTo(355, 3);
    // Against a work zero at machine 440 / 140 the same point is (1.340, 205).
    const work = applyToPoint(motifPlacement(blank, 0, { x: 10, y: 0 }, { x: 440, y: 140 }), {
      x: 0,
      y: 0,
    });
    expect(work.x).toBeCloseTo(1.34, 3);
    expect(work.y).toBeCloseTo(205, 3);
  });

  it('finds the middle of what is drawn, circles by their size', () => {
    expect(motifCentre([{ kind: 'on', contours: [line(0, 0, 20, 0), line(4, -6, 4, 2)] }])).toEqual(
      {
        x: 10,
        y: -2,
      },
    );
    const c = circle(50, 20, 10);
    expect(motifCentre([{ kind: 'drill', contours: [{ ...c, points: [] }] }])).toEqual({
      x: 50,
      y: 20,
    });
    expect(motifCentre([])).toBeNull();
  });

  it('says whether the motif stays on the blank, with room to its edge', () => {
    const part = (length: number): MotifPart[] => [
      { kind: 'on', contours: [line(-length / 2, 0, length / 2, 0)] },
    ];
    const at = motifPlacement(blank, 0, { x: 0, y: 0 });
    // 60 mm on a 70 mm blank: 5 mm to each short edge.
    expect(motifFits(part(60), at, blank, 1)).toBe(true);
    // 68 mm: 1 mm to the edge, but half a millimetre of that is the cutter.
    expect(motifFits(part(68), at, blank, 1)).toBe(false);
    expect(motifFits(part(67), at, blank, 1)).toBe(true);
    // 72 mm runs over the edge.
    expect(motifFits(part(72), at, blank, 1)).toBe(false);
    // Across the blank (a quarter turn in the drawing) only 40 mm are there.
    const across: MotifPart[] = [{ kind: 'on', contours: [line(0, -25, 0, 25)] }];
    expect(motifFits(across, at, blank, 1)).toBe(false);
    // What is not cut does not count.
    expect(motifFits([{ kind: 'none', contours: [line(-90, 0, 90, 0)] }], at, blank, 1)).toBe(true);
    // A cut outside a contour takes a whole cutter beyond the line, a pocket nothing.
    expect(reachOf('outside', 3)).toBe(3);
    expect(reachOf('on', 3)).toBe(1.5);
    expect(reachOf('drill', 3)).toBe(1.5);
    expect(reachOf('pocket', 3)).toBe(0);
    expect(reachOf('inside', 3)).toBe(0);
  });

  it('writes the program in work coordinates: the chain from the blank to the G-code', () => {
    // Work zero at machine 440 / 140; the 20 mm line from (0, 0) on the blank at 450 / 350, 30°.
    const motif: MotifPart[] = [{ kind: 'on', depth: 1, contours: [line(0, 0, 20, 0)] }];
    const plan = planSeries([blank], motif, { toolDiameter: 1 });
    const cuts = entryCuts(plan.entries[0]!, { x: 440, y: 140 });
    expect(cuts.operations).toEqual([{ contour: 0, kind: 'on', depth: 1 }]);
    const [a, b] = cuts.contours[0]!.points;
    expect(a!.x).toBeCloseTo(1.34, 3);
    expect(a!.y).toBeCloseTo(205, 3);
    expect(b!.x).toBeCloseTo(18.66, 3);
    expect(b!.y).toBeCloseTo(215, 3);
    const settings = {
      toolDiameter: 1,
      depth: 1,
      stepdown: 1,
      stepover: 0.4,
      feed: 600,
      plungeFeed: 200,
      rampAngle: 90,
      safeZ: 5,
      climb: true,
    };
    const code = toGcode(toolpaths(cuts.contours, cuts.operations, settings).moves, {
      name: 'serie',
      rpm: 10000,
      safeZ: 5,
    });
    // Rapid to the nearer end, down, along the line to the other end.
    expect(code).toContain('X1.34 Y205');
    expect(code).toContain('X18.66 Y215 F600');
  });
});

describe('a name on every blank', () => {
  // "Name" set 10 mm high at the drawing's zero, then moved to (100, 50) and turned by 90°.
  const options = { height: 10 };
  const drawn = textContours('Name', options).contours;
  const placement = rotation(90, { x: 0, y: 0 });
  const moved = {
    ...translation(100, 50),
    a: placement.a,
    b: placement.b,
    c: placement.c,
    d: placement.d,
  };
  // The middle of the block as set: half the width along the baseline, half the capitals up.
  const width = textContours('Name', options).width;
  const text: MotifPart = {
    kind: 'on',
    contours: drawn,
    text: { options, centre: { x: width / 2, y: 5 }, placement: moved },
  };

  it('sets other words where the text of the drawing has its middle', () => {
    const { parts, missing } = withText([text], 'AH');
    expect(missing).toEqual([]);
    const b = contourBounds(parts[0]!.contours)!;
    // The block's middle goes through the placement: turned by 90° and moved to (100, 50):
    // (width / 2, 5) → (100 − 5, 50 + width / 2).
    expect((b.minX + b.maxX) / 2).toBeCloseTo(95, 1);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(50 + width / 2, 0);
    // Capitals 10 mm high, now lying along Y.
    expect(b.maxX - b.minX).toBeCloseTo(10, 1);
    // What the font does not have is named; a motif without a text stays as it is.
    expect(withText([text], 'A☺').missing).toEqual(['☺']);
    const plain: MotifPart[] = [{ kind: 'on', contours: [line(0, 0, 5, 0)] }];
    expect(withText(plain, 'AH').parts).toEqual(plain);
  });

  it('knows the middle of a block of text as it is laid out', () => {
    // One line, 10 mm capitals, 40 mm wide, starting at the anchor: its middle is 20 right, 5 up.
    expect(textBlockCentre('Name', { height: 10 }, 40)).toEqual({ x: 20, y: 5 });
    // Centred on the anchor, or ending there.
    expect(textBlockCentre('Name', { height: 10, align: 'center' }, 40)).toEqual({ x: 0, y: 5 });
    expect(textBlockCentre('Name', { height: 10, align: 'right' }, 40)).toEqual({ x: -20, y: 5 });
    // Two lines 16 mm apart: from 10 above the first baseline to 16 below it, the middle at −3.
    expect(textBlockCentre('Anna\nBen', { height: 10 }, 40)).toEqual({ x: 20, y: -3 });
    expect(textBlockCentre('Anna\nBen', { height: 10, lineSpacing: 2 }, 40).y).toBe(-5);
    // The same middle `textContours` centres on when asked to.
    const middle = textContours('AH', { height: 10, align: 'center', vertical: 'middle' });
    const box = contourBounds(middle.contours)!;
    expect((box.minY + box.maxY) / 2).toBeCloseTo(0, 6);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(0, 1);
  });

  it('reads the list and counts numbers up', () => {
    expect(parseNames(' Anna \n\nBen\r\nClara\n')).toEqual(['Anna', 'Ben', 'Clara']);
    expect(wordsFor({ mode: 'same' }, 3)).toBeUndefined();
    expect(wordsFor({ mode: 'names', names: ['Anna', 'Ben'] }, 1)).toBe('Ben');
    expect(wordsFor({ mode: 'names', names: ['Anna', 'Ben'] }, 2)).toBeNull();
    expect(wordsFor({ mode: 'numbers', start: 7 }, 2)).toBe('9');
  });

  it('numbers the blanks that are cut and gives each its name', () => {
    const blanks = [
      rectBlank(0, 100, 100, 70, 40, 0),
      rectBlank(1, 200, 100, 70, 40, 90),
      rectBlank(2, 300, 100, 70, 40, 0),
      rectBlank(3, 400, 100, 70, 40, 0),
    ];
    const upright: MotifPart = {
      kind: 'on',
      contours: drawn,
      text: { options, centre: { x: width / 2, y: 5 }, placement: IDENTITY },
    };
    const plan = planSeries(blanks, [upright], {
      excluded: new Set([1]),
      text: { mode: 'names', names: ['Al', 'Bo'] },
      toolDiameter: 1,
    });
    expect(plan.entries.map((e) => [e.state, e.n, e.words])).toEqual([
      ['cut', 1, 'Al'],
      ['excluded', null, undefined],
      ['cut', 2, 'Bo'],
      // No name left for the fourth: it stays as it is.
      ['unnamed', 3, undefined],
    ]);
    expect(plan.spare).toBe(0);
    // Each name sits with the middle of its block on the middle of its blank.
    const first = entryCuts(plan.entries[0]!, { x: 0, y: 0 });
    const box = contourBounds(first.contours)!;
    expect((box.minX + box.maxX) / 2).toBeCloseTo(100, 0);
    expect((box.minY + box.maxY) / 2).toBeCloseTo(100, 1);
    // More names than blanks: the rest is counted.
    const many = planSeries(blanks.slice(0, 1), [upright], {
      text: { mode: 'names', names: ['Al', 'Bo', 'Cy'] },
      toolDiameter: 1,
    });
    expect(many.spare).toBe(2);
    // Running numbers from 5; a name too long for its blank is flagged.
    const numbers = planSeries(blanks, [upright], {
      text: { mode: 'numbers', start: 5 },
      turns: { 2: 1 },
      toolDiameter: 1,
    });
    expect(numbers.entries.map((e) => e.words)).toEqual(['5', '6', '7', '8']);
    expect(numbers.entries.every((e) => e.fits)).toBe(true);
    const long = planSeries(blanks, [upright], {
      text: { mode: 'names', names: ['Maximiliane Mustermann', 'Bo', 'Al', 'Cy'] },
      toolDiameter: 1,
    });
    expect(long.entries.map((e) => e.fits)).toEqual([false, true, true, true]);
    // Without a text in the drawing there is nothing to replace: the motif as drawn on all.
    const plain = planSeries(blanks, [{ kind: 'on', contours: [line(0, 0, 20, 0)] }], {
      text: { mode: 'names', names: ['Al'] },
      toolDiameter: 1,
    });
    expect(plain.entries.map((e) => e.state)).toEqual(['cut', 'cut', 'cut', 'cut']);
    expect(plain.spare).toBe(0);
  });
});

describe('small things', () => {
  it('names the file after the series', () => {
    expect(seriesFileName('untersetzer', 12)).toBe('untersetzer_serie_12x.nc');
  });

  it('knows whether a blank fits into one camera picture', () => {
    const picture = { width: 120, height: 90 };
    expect(fitsPicture(rectBlank(0, 500, 300, 70, 40, 0), picture)).toBe(true);
    // Standing upright it is 70 mm high plus the room: still inside 90 mm.
    expect(fitsPicture(rectBlank(0, 500, 300, 70, 40, 90), picture)).toBe(true);
    expect(fitsPicture(rectBlank(0, 500, 300, 86, 40, 90), picture)).toBe(false);
    expect(fitsPicture(rectBlank(0, 500, 300, 150, 40, 0), picture)).toBe(false);
    // The camera turned by 90° sees the upright blank lying.
    expect(fitsPicture(rectBlank(0, 500, 300, 100, 40, 90), picture, 90)).toBe(true);
  });
});
