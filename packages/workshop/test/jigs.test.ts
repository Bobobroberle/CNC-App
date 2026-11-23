import { transformProgram } from '@lowrider/gcode-core';
import { describe, expect, it } from 'vitest';
import {
  clampOnTable,
  clampToJig,
  expectTags,
  foldDegrees,
  fromJig,
  jigAccuracy,
  jigFrame,
  jigPivot,
  jigReach,
  locateJig,
  tagPose,
  teachJig,
  toJig,
  validateJig,
  type Jig,
  type JigPlace,
  type TagReading,
  type Vec,
} from '../src';

const tag = (id: number, x: number, y: number, angle: number, size = 40): TagReading => ({
  id,
  x,
  y,
  angle,
  size,
});

const placed = (r: ReturnType<typeof locateJig>): JigPlace => {
  if ('problem' in r) throw new Error(r.problem);
  return r;
};

const near = (p: Vec, x: number, y: number, digits = 3) => {
  expect(p.x).toBeCloseTo(x, digits);
  expect(p.y).toBeCloseTo(y, digits);
};

describe('angles and frames', () => {
  it('folds degrees into (−180, 180]', () => {
    expect(foldDegrees(190)).toBe(-170);
    expect(foldDegrees(-190)).toBe(170);
    expect(foldDegrees(180)).toBe(180);
    expect(foldDegrees(-180)).toBe(180);
    expect(foldDegrees(725)).toBe(5);
  });

  it('goes from the table into a jig and back', () => {
    // A jig at (100, 50) turned by 90°: its x axis points up the table.
    const pose = { x: 100, y: 50, angle: 90 };
    near(toJig(pose, { x: 100, y: 80 }), 30, 0, 9);
    near(toJig(pose, { x: 90, y: 50 }), 0, 10, 9);
    near(fromJig(pose, { x: 30, y: 10 }), 90, 80, 9);
  });

  it('spans a frame from one tag or from two', () => {
    expect(jigFrame([])).toBeNull();
    expect(jigFrame([tag(1, 10, 20, 35)])).toEqual({ x: 10, y: 20, angle: 35 });
    // Two tags: the x axis points from the first to the second, whatever way they are stuck on.
    const two = jigFrame([tag(1, 10, 20, 35), tag(2, 10, 220, -80)])!;
    expect(two.x).toBe(10);
    expect(two.angle).toBeCloseTo(90, 9);
    expect(jigFrame([tag(1, 10, 20, 0), tag(2, 10.5, 20, 0)])).toBeNull();
  });
});

describe('teaching a jig and finding it again', () => {
  it('keeps the zero relative to one tag and follows it by a quarter and a half turn', () => {
    // Tag upright at (100, 50), work zero 30 right of it and 20 behind.
    const taught = teachJig([tag(5, 100, 50, 0)], { x: 130, y: 70 })!;
    expect(taught).toEqual({
      tags: [{ id: 5, size: 40, x: 0, y: 0, angle: 0 }],
      zero: { x: 30, y: 20 },
      turn: 0,
    });
    // The jig a quarter turn further, the tag now at (300, 200): what was 30 to the right of
    // the tag is 30 behind it, what was 20 behind is 20 to the left.
    const quarter = placed(locateJig(taught, [tag(5, 300, 200, 90)]));
    near(quarter.zero, 280, 230, 9);
    expect(quarter.rotation).toBeCloseTo(90, 9);
    expect(quarter.pose).toEqual({ x: 300, y: 200, angle: 90 });
    expect(quarter.distanceError).toBe(0);
    // Half a turn: 30 to the left and 20 in front.
    const half = placed(locateJig(taught, [tag(5, 300, 200, 180)]));
    near(half.zero, 270, 180, 9);
    expect(half.rotation).toBeCloseTo(180, 9);
    // Just shifted: the program is not turned at all.
    const shifted = placed(locateJig(taught, [tag(5, 40, 10, 0)]));
    near(shifted.zero, 70, 30, 9);
    expect(shifted.rotation).toBe(0);
  });

  it('counts the turn from how the jig lay when it was taught', () => {
    // Taught with the tag at 30°: in the tag's frame the zero is at (35.981, 2.321) and
    // the program's X axis points to −30°.
    const taught = teachJig([tag(5, 100, 50, 30)], { x: 130, y: 70 })!;
    near(taught.zero, 35.9808, 2.3205, 4);
    expect(taught.turn).toBe(-30);
    // Found at 120°: a quarter turn further than taught. The zero lies where (30, 20)
    // turned by a quarter does: (−20, 30) from the tag.
    const found = placed(locateJig(taught, [tag(5, 0, 0, 120)]));
    near(found.zero, -20, 30, 3);
    expect(found.rotation).toBeCloseTo(90, 9);
    // Found as taught: nothing changes.
    const same = placed(locateJig(taught, [tag(5, 100, 50, 30)]));
    near(same.zero, 130, 70, 3);
    expect(same.rotation).toBeCloseTo(0, 9);
  });

  it('takes the direction from two tags far apart', () => {
    // Tags 200 mm apart along X, the second stuck on a quarter turn round; zero 50 right
    // of the first and 20 behind.
    const taught = teachJig([tag(1, 100, 100, 0), tag(2, 300, 100, 90)], { x: 150, y: 120 })!;
    expect(taught.tags).toEqual([
      { id: 1, size: 40, x: 0, y: 0, angle: 0 },
      { id: 2, size: 40, x: 200, y: 0, angle: 90 },
    ]);
    expect(taught.zero).toEqual({ x: 50, y: 20 });
    // The jig turned by a quarter: first tag at (500, 100), the second 200 behind it.
    const found = placed(locateJig(taught, [tag(2, 500, 300, 180), tag(1, 500, 100, 90)]));
    expect(found.pose.angle).toBeCloseTo(90, 9);
    near(found.pose, 500, 100, 9);
    near(found.zero, 480, 150, 9);
    expect(found.rotation).toBeCloseTo(90, 9);
    // The tags' own angles are a few degrees off (a small tag reads its angle badly): the
    // line through both decides.
    const rough = placed(locateJig(taught, [tag(1, 500, 100, 91.5), tag(2, 500, 300, 178.8)]));
    expect(rough.rotation).toBeCloseTo(90, 9);
    // Measured 0.6 mm farther apart than taught: the difference is shared between both ends.
    const stretched = placed(locateJig(taught, [tag(1, 500, 100, 90), tag(2, 500, 300.6, 180)]));
    expect(stretched.distanceError).toBeCloseTo(0.6, 9);
    near(stretched.pose, 500, 100.3, 9);
    near(stretched.zero, 480, 150.3, 9);
  });

  it('refuses what does not fit the jig as taught', () => {
    const taught = teachJig([tag(1, 100, 100, 0), tag(2, 300, 100, 90)], { x: 150, y: 120 })!;
    expect(locateJig(taught, [tag(1, 500, 100, 90)])).toEqual({ problem: 'missing', tag: 2 });
    expect(locateJig(taught, [])).toEqual({ problem: 'missing', tag: 1 });
    expect(locateJig({ ...taught, tags: [] }, [])).toEqual({ problem: 'missing' });
    // 1.5 mm closer than taught: a tag has moved, or this is another jig.
    expect(locateJig(taught, [tag(1, 500, 100, 90), tag(2, 500, 298.5, 180)])).toEqual({
      problem: 'distance',
    });
    // The second tag sits on the jig 10° differently than it did.
    expect(locateJig(taught, [tag(1, 500, 100, 90), tag(2, 500, 300, 190)])).toEqual({
      problem: 'turned',
      tag: 2,
    });
    expect(locateJig(taught, [tag(1, 500, 100, 80), tag(2, 500, 300, 180)])).toEqual({
      problem: 'turned',
      tag: 1,
    });
    expect(teachJig([], { x: 0, y: 0 })).toBeNull();
  });

  it('says where the other tag should be, judged from one', () => {
    const taught = teachJig([tag(1, 100, 100, 0), tag(2, 300, 100, 90)], { x: 150, y: 120 })!;
    const fromFirst = expectTags(taught, tag(1, 500, 100, 90))!;
    expect(fromFirst.map((t) => t.id)).toEqual([1, 2]);
    near(fromFirst[1]!, 500, 300, 9);
    const fromSecond = expectTags(taught, tag(2, 500, 300, 180))!;
    near(fromSecond[0]!, 500, 100, 9);
    near(fromSecond[1]!, 500, 300, 9);
    expect(expectTags(taught, tag(9, 0, 0, 0))).toBeNull();
  });

  it('lands the program on the jig: corners → pose → relation → zero and turn → coordinates', () => {
    // A 40 mm tag upright with its middle at (100, 50) – corners as printed: top left first,
    // y up. The job is a cut from (10, 0) to (10, 5) from a zero at (130, 70): on the table
    // from (140, 70) to (140, 75), that is 40 right / 20 behind the tag and 5 further back.
    const square = (cx: number, cy: number, deg: number): [Vec, Vec, Vec, Vec] => {
      const c = Math.cos((deg * Math.PI) / 180);
      const s = Math.sin((deg * Math.PI) / 180);
      const at = (x: number, y: number) => ({ x: cx + c * x - s * y, y: cy + s * x + c * y });
      return [at(-20, 20), at(20, 20), at(20, -20), at(-20, -20)];
    };
    const program = 'G0 X10 Y0\nG1 X10 Y5 F300';
    const taught = teachJig([{ id: 3, ...tagPose(square(100, 50, 0)), size: 40 }], {
      x: 130,
      y: 70,
    })!;
    const cut = (cx: number, cy: number, deg: number) => {
      const found = placed(
        locateJig(taught, [{ id: 3, ...tagPose(square(cx, cy, deg)), size: 40 }]),
      );
      const text = transformProgram(program, {
        rotation: found.rotation,
        offset: { x: 0, y: 0 },
        pivot: { x: 0, y: 0 },
      }).text;
      // Where the two points of the program end up on the table.
      return text.split('\n').map((line) => {
        const x = Number(/X(-?[\d.]+)/.exec(line)![1]);
        const y = Number(/Y(-?[\d.]+)/.exec(line)![1]);
        return { x: found.zero.x + x, y: found.zero.y + y };
      });
    };
    // The jig turned by a quarter about its tag, the tag now at (300, 200): right of the
    // tag has become behind it, behind has become left.
    const quarter = cut(300, 200, 90);
    near(quarter[0]!, 280, 240);
    near(quarter[1]!, 275, 240);
    // Half a turn: 40 left and 20 in front of the tag, the cut runs towards the front.
    const half = cut(300, 200, 180);
    near(half[0]!, 260, 180);
    near(half[1]!, 260, 175);
    // Shifted and turned by 3°: (40, 20) and (40, 25) turned by 3° from the tag.
    const little = cut(250, 120, 3);
    near(little[0]!, 250 + 38.8985, 120 + 22.066);
    near(little[1]!, 250 + 38.6368, 120 + 27.0591);
  });
});

describe('what to expect of a jig', () => {
  it('names the angle as the weak part of one small tag', () => {
    // One 40 mm tag: 0.2 mm across 40 mm is 0.29°; 300 mm away that is 1.5 mm, plus 0.1.
    const one = jigAccuracy([{ x: 0, y: 0, size: 40 }], 300);
    expect(one.baseline).toBe(40);
    expect(one.angle).toBeCloseTo(0.2865, 4);
    expect(one.error).toBeCloseTo(1.6, 9);
    // Two tags 200 mm apart: 0.057°, and 0.2 mm at 100 mm.
    const two = jigAccuracy(
      [
        { x: 0, y: 0, size: 40 },
        { x: 200, y: 0, size: 40 },
      ],
      100,
    );
    expect(two.baseline).toBe(200);
    expect(two.angle).toBeCloseTo(0.0573, 4);
    expect(two.error).toBeCloseTo(0.2, 9);
    expect(jigAccuracy([{ x: 0, y: 0, size: 20 }], -5).error).toBe(0.1);
    expect(jigAccuracy([], 100)).toEqual({ baseline: 0, angle: 90, error: Infinity });
  });

  it('measures the reach of a job from the tag, or from the middle between two', () => {
    expect(jigPivot([])).toEqual({ x: 0, y: 0 });
    expect(jigPivot([{ x: 4, y: 6 }])).toEqual({ x: 4, y: 6 });
    expect(
      jigPivot([
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ]),
    ).toEqual({ x: 100, y: 0 });
    const corners = [
      { x: 50, y: 20 },
      { x: 250, y: 120 },
    ];
    expect(jigReach([{ x: 0, y: 0 }], corners)).toBeCloseTo(Math.hypot(250, 120), 9);
    expect(
      jigReach(
        [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
        corners,
      ),
    ).toBeCloseTo(Math.hypot(150, 120), 9);
    expect(jigReach([{ x: 0, y: 0 }], [])).toBe(0);
  });
});

describe('the clamps of a jig', () => {
  const zone = {
    name: 'Zwinge 1',
    min: { x: 150, y: 60, z: -1000 },
    max: { x: 210, y: 100, z: 30 },
  };

  it('keeps a clamp where it sits on the jig', () => {
    // 60 × 40 with its middle 80 right of the tag and 30 behind.
    const clamp = clampToJig({ x: 100, y: 50, angle: 0 }, zone);
    expect(clamp).toEqual({
      name: 'Zwinge 1',
      x: 80,
      y: 30,
      width: 60,
      depth: 40,
      turn: 0,
      bottom: -1000,
      top: 30,
    });
    expect(clampOnTable({ x: 100, y: 50, angle: 0 }, clamp)).toEqual(zone);
    // The jig turned by a quarter, at (300, 200): the middle is 30 left and 80 behind,
    // and the clamp now is 40 wide and 60 deep.
    expect(clampOnTable({ x: 300, y: 200, angle: 90 }, clamp)).toEqual({
      name: 'Zwinge 1',
      min: { x: 250, y: 250, z: -1000 },
      max: { x: 290, y: 310, z: 30 },
    });
  });

  it('takes the box around a clamp that lies askew, and leaves a round one round', () => {
    const clamp = clampToJig({ x: 100, y: 50, angle: 0 }, zone);
    // At 45° the box around a 60 × 40 rectangle is 70.71 on both sides.
    const askew = clampOnTable({ x: 100, y: 50, angle: 45 }, clamp);
    expect(askew.max.x - askew.min.x).toBeCloseTo(70.7107, 3);
    expect(askew.max.y - askew.min.y).toBeCloseTo(70.7107, 3);
    // Taught on a jig lying at 30°: at 30° again it is the same box.
    const taughtAskew = clampToJig({ x: 100, y: 50, angle: 30 }, zone);
    expect(taughtAskew.turn).toBe(-30);
    expect(clampOnTable({ x: 100, y: 50, angle: 30 }, taughtAskew)).toEqual(zone);
    const screw = clampToJig(
      { x: 0, y: 0, angle: 0 },
      {
        name: 'Schraube 1',
        round: true,
        min: { x: 4, y: 4, z: -1000 },
        max: { x: 16, y: 16, z: 5 },
      },
    );
    expect(screw.round).toBe(true);
    expect(clampOnTable({ x: 0, y: 0, angle: 45 }, screw)).toEqual({
      name: 'Schraube 1',
      round: true,
      min: { x: -6, y: 8.1421, z: -1000 },
      max: { x: 6, y: 20.1421, z: 5 },
    });
  });
});

describe('a stored jig', () => {
  const jig: Jig = {
    id: 'jig-1',
    name: 'Untersetzer-Rahmen',
    tags: [
      { id: 1, size: 40, x: 0, y: 0, angle: 0 },
      { id: 2, size: 40, x: 200, y: 0, angle: 90 },
    ],
    zero: { x: 50, y: 20 },
    turn: 0,
    job: { fileName: 'untersetzer.nc', text: 'G0 X0 Y0', toolDiameter: 3 },
    reach: 120,
    clamps: [
      { name: 'Zwinge 1', x: 80, y: 30, width: 60, depth: 40, turn: 0, bottom: -1000, top: 30 },
    ],
    createdAt: 1,
  };

  it('is taken as it is', () => {
    expect(validateJig(jig)).toBe(jig);
    const single = { ...jig, tags: [jig.tags[0]!], clamps: [] };
    expect(validateJig(single)).toBe(single);
  });

  it('is refused when something is missing or wrong', () => {
    const bad: unknown[] = [
      null,
      'jig',
      { ...jig, id: '' },
      { ...jig, name: ' ' },
      { ...jig, name: 4 },
      { ...jig, tags: [] },
      { ...jig, tags: 'two' },
      { ...jig, tags: [jig.tags[0], jig.tags[1], jig.tags[1]] },
      { ...jig, tags: [jig.tags[0], jig.tags[0]] },
      { ...jig, tags: [{ ...jig.tags[0], id: 49 }] },
      { ...jig, tags: [{ ...jig.tags[0], size: 37 }] },
      { ...jig, tags: [{ ...jig.tags[0], angle: Number.NaN }] },
      { ...jig, tags: [{ ...jig.tags[0], x: '0' }] },
      { ...jig, tags: [null] },
      { ...jig, zero: { x: 1 } },
      { ...jig, turn: null },
      { ...jig, reach: undefined },
      { ...jig, createdAt: 'now' },
      { ...jig, job: null },
      { ...jig, job: { ...jig.job, fileName: '' } },
      { ...jig, job: { ...jig.job, text: 3 } },
      { ...jig, job: { ...jig.job, toolDiameter: 0 } },
      { ...jig, job: { ...jig.job, toolDiameter: '3' } },
      { ...jig, clamps: undefined },
      { ...jig, clamps: [{ ...jig.clamps[0], width: 0 }] },
      { ...jig, clamps: [{ ...jig.clamps[0], depth: -1 }] },
      { ...jig, clamps: [{ ...jig.clamps[0], top: 'high' }] },
      { ...jig, clamps: [{ ...jig.clamps[0], name: 5 }] },
      { ...jig, clamps: [{ name: 'x' }] },
    ];
    for (const value of bad) expect(validateJig(value), JSON.stringify(value)).toBeNull();
  });
});
