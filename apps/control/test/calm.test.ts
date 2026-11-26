import { describe, expect, it } from 'vitest';
import {
  account,
  calmNow,
  FlushLearner,
  limitOf,
  lookDiff,
  median,
  newFrames,
  noiseOf,
  period,
  positionCalm,
  quantile,
  type Frame,
  type Report,
} from '../src/lib/calm';

/** A frame whose look is one value four times – a picture of one grey level */
const grey = (t: number, v: number): Frame => ({ t, look: [v, v, v, v] });
/** Frames every 25 ms from `t0` with the given grey levels */
const run = (t0: number, values: number[]): Frame[] => values.map((v, i) => grey(t0 + 25 * i, v));

describe('distance of two looks', () => {
  it('is the mean absolute difference', () => {
    expect(lookDiff([0, 0, 0, 0], [1, 2, 3, 6])).toBe(3);
    expect(lookDiff([5, 5], [5, 5])).toBe(0);
    expect(lookDiff([1, 4], [3, 1])).toBe(2.5);
  });
  it('says Infinity for looks that cannot be compared', () => {
    expect(lookDiff([1, 2], [1, 2, 3])).toBe(Infinity);
    expect(lookDiff([], [])).toBe(Infinity);
  });
});

describe('middle and quantile', () => {
  it('takes the middle of the numbers', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNaN();
  });
  it('takes the quantile by nearest rank', () => {
    const v = [50, 10, 40, 20, 30];
    expect(quantile(v, 0.9)).toBe(50);
    expect(quantile(v, 0.5)).toBe(30);
    expect(quantile(v, 0.2)).toBe(10);
    expect(quantile(v, 0)).toBe(10);
    expect(quantile(v, 1)).toBe(50);
    expect(quantile([], 0.9)).toBeNaN();
  });
});

describe('the frames that are new', () => {
  it('keeps the first and every one that differs from the last kept – a picture shown again is not new', () => {
    const seen = [grey(0, 1), grey(10, 1), grey(20, 2), grey(30, 2), grey(40, 2), grey(50, 1)];
    expect(newFrames(seen).map((f) => f.t)).toEqual([0, 20, 50]);
    expect(newFrames([])).toEqual([]);
  });
  it('knows the time between them', () => {
    expect(period([grey(0, 0), grey(33, 1), grey(66, 0), grey(100, 1)])).toBe(33);
    expect(period([grey(0, 0)])).toBe(0);
  });
});

describe('the noise of a calm stretch', () => {
  it('is the median step between its frames', () => {
    // 0 1 0 1 0 1: every step 1, the ends differ by 1
    expect(noiseOf(run(0, [0, 1, 0, 1, 0, 1]))).toBe(1);
    expect(limitOf(1)).toBe(1.55);
    expect(limitOf(0)).toBe(0.05);
  });
  it('is not told from fewer than six frames', () => {
    expect(noiseOf(run(0, [0, 1, 0, 1, 0]))).toBeNull();
  });
  it('is not told from a stretch that is still changing: the ends are far apart', () => {
    // a ramp: steps of 1, ends 5 apart – more than a step plus half
    expect(noiseOf(run(0, [0, 1, 2, 3, 4, 5]))).toBeNull();
    // one late jump
    expect(noiseOf(run(0, [0, 0.2, 0, 0.2, 0, 5]))).toBeNull();
  });
  it('is not told where one step towers over the others, even if the ends agree', () => {
    // steps .2, 5.8, 5.8, .2, .2: median .2, ends .2 – but a jump there and back is no noise
    expect(noiseOf(run(0, [0, 0.2, 6, 0.2, 0, 0.2]))).toBeNull();
  });
});

describe('what the pictures since the move say', () => {
  // a move that slows down (100 → 20), then a calm stretch with a noise of 0.4
  const moving = run(0, [100, 80, 60, 40, 20]);
  const calm = run(125, [0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4]);

  it('sees the move, when the picture became its final one and the noise', () => {
    const a = account([...moving, ...calm], null);
    expect(a.noise).toBe(0.4);
    expect(a.limit).toBeCloseTo(0.65, 12);
    expect(a.moved).toBe(true);
    // the last frame that differed from the newest (0.4) is the one at t = 100; the next is the final picture
    expect(a.final).toBe(125);
  });
  it('judges by a limit it is given, whatever the tail says', () => {
    const a = account([...moving, ...calm], 1);
    expect(a.limit).toBe(1);
    expect(a.moved).toBe(true);
    expect(a.final).toBe(125);
    // a limit above the move: nothing differs enough
    const b = account([...moving, ...calm], 200);
    expect(b.moved).toBe(false);
    expect(b.final).toBeNull();
  });
  it('sees no move in a picture that only had noise', () => {
    const a = account(calm, null);
    expect(a.noise).toBe(0.4);
    expect(a.moved).toBe(false);
    expect(a.final).toBeNull();
  });
  it('judges nothing where the last frames are too few or still changing and no limit is given', () => {
    expect(account(moving, null)).toEqual({ moved: false, final: null, noise: null, limit: null });
    expect(account([], null)).toEqual({ moved: false, final: null, noise: null, limit: null });
    expect(account([], 1)).toEqual({ moved: false, final: null, noise: null, limit: 1 });
  });
  it('needs three pictures that differ and one far from the rest to call it a move', () => {
    // two frames differ by a lot: not enough of them
    expect(account([...run(0, [50, 40]), ...calm], null).moved).toBe(false);
    // three frames differ, but only by little more than the limit
    expect(account([...run(0, [2, 2.5, 3]), ...calm], null).moved).toBe(false);
  });
});

describe('whether the picture is calm now', () => {
  // new frames every 25 ms with a noise of 0.4, up to t = 300
  const frames = run(0, [0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4, 0]);
  it('is calm when the stretch of the last 150 ms differs only by the noise', () => {
    expect(calmNow(frames, 310, 0.65)).toBe(true);
  });
  it('is not where the newest frame is old: the stream stands still', () => {
    expect(calmNow(frames, 450, 0.65)).toBe(false);
    // a slow camera (a frame every 100 ms) is given 2.5 of its periods, and a stretch of four of them
    const slow = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => grey(100 * i, i % 2 ? 0.4 : 0));
    expect(calmNow(slow, 740, 0.65)).toBe(true);
    expect(calmNow(slow, 940, 0.65)).toBe(false);
  });
  it('is not where the newest frame is more than 100 ms old, even on a fast camera that still has frames enough in the stretch', () => {
    // a frame every 10 ms up to t = 900, noise 0.4: 100 ms after the last one the stream is still running, a little later it is not
    const fast = Array.from({ length: 91 }, (_, i) => grey(10 * i, i % 2 ? 0.4 : 0));
    expect(calmNow(fast, 1000, 0.65)).toBe(true);
    expect(calmNow(fast, 1001, 0.65)).toBe(false);
  });
  it('is not where a change lies inside the stretch – or at the picture it began with', () => {
    const jumped = [
      ...run(0, [0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4]),
      ...run(200, [50, 50.4, 50, 50.4, 50]),
    ];
    // the last 150 ms (160…310) began with the picture of t = 150 (0) and ends in 50
    expect(calmNow(jumped, 310, 0.65)).toBe(false);
    // 150 ms after the jump the whole stretch lies after it
    const later = [...jumped, ...run(325, [50.4, 50, 50.4, 50, 50.4, 50, 50.4])];
    expect(calmNow(later, 500, 0.65)).toBe(true);
  });
  it('is not where the stretch has too few new frames or is not seen from its beginning', () => {
    expect(calmNow([grey(100, 0), grey(280, 0.4), grey(300, 0)], 310, 0.65)).toBe(false);
    expect(calmNow(run(200, [0, 0.4, 0, 0.4, 0]), 310, 0.65)).toBe(false);
    expect(calmNow([], 310, 0.65)).toBe(false);
  });
});

describe('whether the machine is calm', () => {
  const r = (idle: boolean, x: number, y = 20, z = 0): Report => ({ x, y, z, idle });
  it('wants the last reports all Idle and still', () => {
    const reports = [r(false, 9), r(true, 10), r(true, 10.01)];
    expect(positionCalm(reports, 2, 0.02)).toBe(true);
    // the third counts the report that said Run
    expect(positionCalm(reports, 3, 0.02)).toBe(false);
    expect(positionCalm([r(true, 10), r(true, 10.03)], 2, 0.02)).toBe(false);
    expect(positionCalm([r(true, 10), r(true, 10, 20.021)], 2, 0.02)).toBe(false);
    expect(positionCalm([r(true, 10), r(true, 10, 20, -0.5)], 2, 0.02)).toBe(false);
  });
  it('needs the reports it is asked for', () => {
    expect(positionCalm([r(true, 10)], 2, 0.02)).toBe(false);
    expect(positionCalm([r(true, 10)], 0, 0.02)).toBe(false);
    expect(positionCalm([], 1, 0.02)).toBe(false);
  });
});

describe('what the first points teach', () => {
  const obs = (flushMs: number, noise: number | null = 0.4, period = 33) => ({
    flushMs,
    noise,
    period,
  });
  it('knows nothing before three points and a noise', () => {
    const l = new FlushLearner();
    expect(l.known).toBe(false);
    l.add(obs(300));
    l.add(obs(100));
    expect(l.known).toBe(false);
    expect(l.count).toBe(2);
    l.add(obs(200, null));
    expect(l.known).toBe(true);
    expect(l.noisy).toBe(true);
    const none = new FlushLearner();
    for (const f of [1, 2, 3]) none.add(obs(f, null));
    expect(none.known).toBe(false);
    expect(none.noisy).toBe(false);
    expect(none.limit).toBeNull();
  });
  it('waits for a high quantile of the flushes plus the margin', () => {
    const l = new FlushLearner();
    for (const f of [300, 100, 200]) l.add(obs(f, 0.4));
    // nearest rank of 0.9 in 100, 200, 300 is 300; the margin is 100 ms (three periods of 33 are less)
    expect(l.waitMs()).toBe(400);
    expect(l.limit).toBeCloseTo(0.65, 12);
    // a slow camera: three periods of 50 are more than the margin
    const slow = new FlushLearner();
    for (const f of [300, 100, 200]) slow.add(obs(f, 0.4, 50));
    expect(slow.waitMs()).toBe(450);
  });
  it('never waits for less than the margin: a picture that was final before the machine reported rest', () => {
    const l = new FlushLearner();
    for (const f of [-200, -100, -50]) l.add(obs(f));
    expect(l.waitMs()).toBe(100);
  });
  it('follows the last eight points and forgets on request', () => {
    const l = new FlushLearner();
    l.add(obs(1000));
    for (let i = 0; i < 8; i++) l.add(obs(0));
    expect(l.count).toBe(8);
    expect(l.waitMs()).toBe(100);
    l.lose();
    expect(l.known).toBe(false);
    expect(l.count).toBe(0);
    expect(l.limit).toBeNull();
  });
});
