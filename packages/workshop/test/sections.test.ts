import { describe, expect, it } from 'vitest';
import {
  fromJig,
  locatePart,
  marksOnPart,
  markZone,
  slideAccuracy,
  type PartPose,
  type SlideFit,
  type TagReading,
} from '../src';

/** Two marks as measured before the slide, the part's zero at (100, 50), lying square. */
const BEFORE: PartPose = { x: 100, y: 50, angle: 0 };
const READINGS: TagReading[] = [
  { id: 7, x: 900, y: 150, angle: 10, size: 40 },
  { id: 8, x: 1150, y: 330, angle: -80, size: 40 },
];
const MARKS = marksOnPart(BEFORE, READINGS);

/** The marks as the camera reads them with the part lying at `pose`. */
const seenAt = (pose: PartPose, marks = MARKS): TagReading[] =>
  marks.map((m) => ({ id: m.id, size: m.size, ...fromJig(pose, m), angle: m.angle + pose.angle }));

const fit = (r: ReturnType<typeof locatePart>): SlideFit => {
  if ('problem' in r) throw new Error(JSON.stringify(r));
  return r;
};

describe('marksOnPart', () => {
  it('keeps the marks in the coordinates of the part', () => {
    expect(MARKS).toEqual([
      { id: 7, size: 40, x: 800, y: 100, angle: 10 },
      { id: 8, size: 40, x: 1050, y: 280, angle: -80 },
    ]);
    // The part turned a quarter: 30 to the left of its zero and 200 behind it on the table
    // is 200 along the part and 30 across.
    const quarter = marksOnPart({ x: 100, y: 50, angle: 90 }, [
      { id: 3, x: 70, y: 250, angle: 100, size: 30 },
    ]);
    expect(quarter).toEqual([{ id: 3, size: 30, x: 200, y: 30, angle: 10 }]);
    // Two at most.
    expect(marksOnPart(BEFORE, [...READINGS, { ...READINGS[0]!, id: 9 }])).toHaveLength(2);
  });
});

describe('markZone', () => {
  it('is what the camera reaches before and after the slide', () => {
    // The camera's middle reaches 38 … 1258. Slid 730 towards −X and up to 30 off, a mark
    // must lie at 38 + 730 + 30 or more now; 30 keep its paper in the picture at both ends.
    expect(markZone({ min: 38, max: 1258 }, 730, 30, 30)).toEqual({ min: 828, max: 1228 });
    expect(markZone({ min: 38, max: 1258 }, 1200, 30, 30)).toBeNull();
  });
});

describe('locatePart', () => {
  it('finds a part slid straight: the zero goes with it', () => {
    const r = fit(locatePart(BEFORE, MARKS, seenAt({ x: -500, y: 50, angle: 0 }), false));
    expect(r.pose.x).toBeCloseTo(-500, 9);
    expect(r.pose.y).toBeCloseTo(50, 9);
    expect(r.pose.angle).toBeCloseTo(0, 9);
    expect(r.shift.x).toBeCloseTo(-600, 9);
    expect(r.shift.y).toBeCloseTo(0, 9);
    expect(r.rotation).toBeCloseTo(0, 9);
    expect(r.distanceError).toBeCloseTo(0, 9);
  });

  it('finds a part slid a little off and turned, in either direction and along either axis', () => {
    for (const pose of [
      { x: -480, y: 62, angle: 0.5 },
      { x: 715, y: 41, angle: -0.8 },
      { x: 96, y: -570, angle: 0.35 },
      { x: 108, y: 655, angle: -179.6 },
    ]) {
      const r = fit(locatePart(BEFORE, MARKS, seenAt(pose), false));
      expect(r.pose.x).toBeCloseTo(pose.x, 6);
      expect(r.pose.y).toBeCloseTo(pose.y, 6);
      expect(r.pose.angle).toBeCloseTo(pose.angle, 6);
      expect(r.rotation).toBeCloseTo(pose.angle, 6);
    }
    // By hand for the first: the far end of the part, (1700, 200) in its own coordinates,
    // lies at −480 + 1700 cos 0.5° − 200 sin 0.5°, 62 + 1700 sin 0.5° + 200 cos 0.5°.
    const r = fit(locatePart(BEFORE, MARKS, seenAt({ x: -480, y: 62, angle: 0.5 }), false));
    const far = fromJig(r.pose, { x: 1700, y: 200 });
    expect(far.x).toBeCloseTo(1218.19, 2);
    expect(far.y).toBeCloseTo(276.8275, 3);
    // The middle of the marks, (925, 190) on the part, was at (1025, 240) and is now at
    // −480 + 925 cos − 190 sin, 62 + 925 sin + 190 cos = (443.3067, 260.0648).
    expect(r.shift.x).toBeCloseTo(443.3067 - 1025, 3);
    expect(r.shift.y).toBeCloseTo(260.0648 - 240, 3);
  });

  it('counts from how the part lay before, also when that was turned', () => {
    const before = { x: 300, y: 80, angle: 2 };
    const marks = marksOnPart(before, seenAt(before));
    expect(marks[0]!.x).toBeCloseTo(800, 3);
    const r = fit(locatePart(before, marks, seenAt({ x: -310, y: 60, angle: 2.4 }), false));
    expect(r.pose.x).toBeCloseTo(-310, 3);
    expect(r.pose.angle).toBeCloseTo(2.4, 6);
    expect(r.rotation).toBeCloseTo(0.4, 6);
  });

  it('shares out a small difference in the distance of the marks, and refuses a large one', () => {
    const seen = seenAt({ x: -500, y: 50, angle: 0 });
    // The second mark read 0.4 mm farther along the line through both.
    const d = Math.hypot(250, 180);
    const along = (mm: number) => ({ x: (250 / d) * mm, y: (180 / d) * mm });
    const far = (mm: number) => [
      seen[0]!,
      { ...seen[1]!, x: seen[1]!.x + along(mm).x, y: seen[1]!.y + along(mm).y },
    ];
    const r = fit(locatePart(BEFORE, MARKS, far(0.4), false));
    expect(r.distanceError).toBeCloseTo(0.4, 6);
    expect(r.pose.x).toBeCloseTo(-500 + along(0.2).x, 6);
    expect(r.pose.y).toBeCloseTo(50 + along(0.2).y, 6);
    expect(r.pose.angle).toBeCloseTo(0, 6);
    const off = locatePart(BEFORE, MARKS, far(-0.6), false);
    expect(off).toMatchObject({ problem: 'distance' });
    expect((off as { mm: number }).mm).toBeCloseTo(-0.6, 6);
  });

  it('refuses a mark that was not read, or that sits differently on the part', () => {
    const seen = seenAt({ x: -500, y: 50, angle: 0 });
    expect(locatePart(BEFORE, MARKS, [seen[0]!], false)).toEqual({ problem: 'missing', tag: 8 });
    expect(locatePart(BEFORE, [], seen, false)).toEqual({ problem: 'missing' });
    const restuck = [seen[0]!, { ...seen[1]!, angle: seen[1]!.angle + 5 }];
    expect(locatePart(BEFORE, MARKS, restuck, false)).toEqual({ problem: 'turned', tag: 8 });
  });

  it('needs a fence with one mark, and then takes the place from the mark alone', () => {
    const one = MARKS.slice(0, 1);
    const seen: TagReading[] = [{ id: 7, x: 212, y: 148.5, angle: 10.2, size: 40 }];
    expect(locatePart(BEFORE, one, seen, false)).toEqual({ problem: 'one-mark' });
    // The mark sticks at (800, 100) on the part: its zero is at 212 − 800, 148.5 − 100.
    const r = fit(locatePart(BEFORE, one, seen, true));
    expect(r.pose).toEqual({ x: -588, y: 48.5, angle: 0 });
    expect(r.shift).toEqual({ x: -688, y: -1.5 });
    expect(r.rotation).toBe(0);
    expect(r.distanceError).toBe(0);
    // A mark that looks 5° turned: not the part on the fence, or the mark stuck on anew.
    expect(locatePart(BEFORE, one, [{ ...seen[0]!, angle: 15 }], true)).toEqual({
      problem: 'turned',
      tag: 7,
    });
  });

  it('keeps the direction of a part on a fence and checks it with two marks', () => {
    // Read 0.1° turned: within what the marks can tell; the direction stays.
    const r = fit(locatePart(BEFORE, MARKS, seenAt({ x: -500, y: 50, angle: 0.1 }), true));
    expect(r.pose.angle).toBe(0);
    expect(r.rotation).toBe(0);
    // The place comes from the middle of the marks, (925, 190) on the part.
    const middle = fromJig({ x: -500, y: 50, angle: 0.1 }, { x: 925, y: 190 });
    expect(r.pose.x).toBeCloseTo(middle.x - 925, 9);
    expect(r.pose.y).toBeCloseTo(middle.y - 190, 9);
    // Half a degree: the part does not lie against the fence.
    const askew = locatePart(BEFORE, MARKS, seenAt({ x: -500, y: 50, angle: 0.5 }), true);
    expect(askew).toMatchObject({ problem: 'fence' });
    expect((askew as { degrees: number }).degrees).toBeCloseTo(0.5, 6);
    // Two marks 40 mm apart cannot tell half a degree (2 · atan(0.2 / 40) = 0.57°).
    const close = marksOnPart(BEFORE, [READINGS[0]!, { ...READINGS[0]!, id: 9, x: 940 }]);
    const near = locatePart(BEFORE, close, seenAt({ x: -500, y: 50, angle: 0.5 }, close), true);
    expect('problem' in near).toBe(false);
  });
});

describe('slideAccuracy', () => {
  it('grows with the reach over the distance of the marks', () => {
    // Marks 250 mm apart, the far end 950 mm away: 0.1 + 950 · 0.2 / 250.
    const marks = [
      { x: 800, y: 100, size: 40 },
      { x: 1050, y: 100, size: 40 },
    ];
    expect(slideAccuracy(marks, 950, false)).toEqual({ baseline: 250, error: 0.86 });
    // On a fence the direction is the fence's: a tenth, wherever.
    expect(slideAccuracy(marks, 950, true)).toEqual({ baseline: 250, error: 0.1 });
    expect(slideAccuracy(marks.slice(0, 1), 950, true)).toEqual({ baseline: 0, error: 0.1 });
    // One mark without a fence, or none: no direction at all.
    expect(slideAccuracy(marks.slice(0, 1), 950, false)).toEqual({ baseline: 0, error: Infinity });
    expect(slideAccuracy([], 950, false)).toEqual({ baseline: 0, error: Infinity });
  });
});
