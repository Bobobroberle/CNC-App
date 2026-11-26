import { describe, expect, it, vi } from 'vitest';

// Pictures are rendered pixel by pixel here: under the coverage run (instrumented, many files at once) a test takes
// several times what it does alone.
vi.setConfig({ testTimeout: 60_000 });
import type { CameraCalibration } from '../src/lib/camera';
import { COVERED, Mosaic } from '../src/lib/mosaic';
import {
  imageTransform,
  MAP_PX_PER_MM,
  planScan,
  visibleSize,
  type Rect,
} from '../src/lib/photomap';
import {
  estimateStops,
  estimateStrips,
  lagFromCorrections,
  moveSeconds,
  planStrips,
  PositionTrack,
  solveStrip,
  stripPoint,
  type Axis,
  type Strip,
} from '../src/lib/strips';
import { renderFrame, world, type Shot } from './synthetic';

const SIZE = { width: 320, height: 240 };
const CAL: CameraCalibration = { offsetX: 0, offsetY: 0, pxPerMm: 8, rotation: 0 };
const VISIBLE = visibleSize(CAL, SIZE); // 28 × 21 mm

describe('the strips of a scan', () => {
  const area: Rect = { minX: 100, minY: 50, maxX: 500, maxY: 350 };

  it('run along the longer side, side by side as the rows of a scan by stops, there and back', () => {
    const strips = planStrips(area, VISIBLE)!;
    expect(strips.every((s) => s.axis === 'x')).toBe(true);
    const rows = [...new Set(planScan(area, VISIBLE).map((p) => p.y))];
    expect(strips.map((s) => s.across)).toEqual(rows);
    expect(strips[0]).toMatchObject({ from: 100 + VISIBLE.width / 2, to: 500 - VISIBLE.width / 2 });
    expect(strips[1]).toMatchObject({ from: 500 - VISIBLE.width / 2, to: 100 + VISIBLE.width / 2 });
    expect(strips[2]!.from).toBe(strips[0]!.from);
    // the other way round: along Y
    const tall = planStrips({ minX: 0, minY: 0, maxX: 120, maxY: 400 }, VISIBLE)!;
    expect(tall.every((s) => s.axis === 'y')).toBe(true);
    expect(tall[0]).toMatchObject({ from: VISIBLE.height / 2, to: 400 - VISIBLE.height / 2 });
  });

  it('are run in segments of at most 400 mm, each way as one row, so no run is longer than its anchors can vouch for', () => {
    const long: Rect = { minX: 0, minY: 0, maxX: 1500, maxY: 120 };
    const strips = planStrips(long, VISIBLE)!;
    const rows = [...new Set(strips.map((s) => s.across))];
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      const segments = strips.filter((s) => s.across === row);
      expect(segments.length).toBe(Math.ceil((1500 - VISIBLE.width) / 400));
      for (const s of segments) expect(Math.abs(s.to - s.from)).toBeLessThanOrEqual(400 + 1e-9);
      // one after the other: each ends where the next begins, all the same way
      for (let i = 1; i < segments.length; i++)
        expect(segments[i]!.from).toBeCloseTo(segments[i - 1]!.to, 9);
      const dir = Math.sign(segments[0]!.to - segments[0]!.from);
      expect(segments.every((s) => Math.sign(s.to - s.from) === dir)).toBe(true);
      // and the row covers what a single strip would
      expect(Math.min(...segments.flatMap((s) => [s.from, s.to]))).toBeCloseTo(
        VISIBLE.width / 2,
        9,
      );
      expect(Math.max(...segments.flatMap((s) => [s.from, s.to]))).toBeCloseTo(
        1500 - VISIBLE.width / 2,
        9,
      );
    }
    // the rows go there and back
    const first = strips.find((s) => s.across === rows[0])!;
    const second = strips.find((s) => s.across === rows[1])!;
    expect(Math.sign(second.to - second.from)).toBe(-Math.sign(first.to - first.from));
    // in the order they are run: a row, then the next
    expect(strips.map((s) => s.across)).toEqual(
      [...strips.map((s) => s.across)].sort((a, b) => rows.indexOf(a) - rows.indexOf(b)),
    );
  });

  it('are not made for an area only a little longer than a picture', () => {
    expect(planStrips({ minX: 0, minY: 0, maxX: 50, maxY: 200 }, VISIBLE)).not.toBeNull();
    expect(planStrips({ minX: 0, minY: 0, maxX: 50, maxY: 50 }, VISIBLE)).toBeNull();
    expect(planStrips({ minX: 0, minY: 0, maxX: 60, maxY: 40 }, VISIBLE)).toBeNull();
  });

  it('cover every point of the area with the trusted middle of a picture, as long as pictures are 8 mm apart', () => {
    const small: Rect = { minX: 100, minY: 50, maxX: 220, maxY: 110 };
    const mosaic = new Mosaic();
    for (const strip of planStrips(small, VISIBLE)!) {
      const dir = Math.sign(strip.to - strip.from);
      const stops = [strip.to];
      for (let a = strip.from; (a - strip.to) * dir < -1e-9; a += dir * 8) stops.push(a);
      for (const a of stops) {
        const c = stripPoint(strip, a);
        mosaic.paste(
          renderFrame(CAL, c, SIZE),
          imageTransform(CAL, c, SIZE, { k: MAP_PX_PER_MM, left: 0, top: 0 }),
        );
      }
    }
    let holes = 0;
    for (let y = small.minY + 0.13; y < small.maxY; y += 0.5) {
      for (let x = small.minX + 0.13; x < small.maxX; x += 0.5) {
        const p = mosaic.at(x * MAP_PX_PER_MM, -y * MAP_PX_PER_MM);
        // the last picture of a strip stands at its end: the strip's own length is covered, the rest by the anchors
        if (!p || p.sum < COVERED) holes++;
      }
    }
    expect(holes).toBe(0);
  });
});

describe('how long a scan takes', () => {
  it('has a hop of a few millimetres take the time of the acceleration, not of the speed', () => {
    expect(moveSeconds(0, 50, 100)).toBe(0);
    // far enough to reach the speed: distance/speed + speed/accel
    expect(moveSeconds(400, 50, 100)).toBeCloseTo(400 / 50 + 0.5, 9);
    // too short to reach it: accelerate and brake at once
    expect(moveSeconds(10, 50, 100)).toBeCloseTo(2 * Math.sqrt(10 / 100), 9);
    expect(moveSeconds(-400, 50, 100)).toBe(moveSeconds(400, 50, 100));
  });

  it('has strips with the same settle time faster than stops – by the number the app tells', () => {
    const area: Rect = { minX: 100, minY: 50, maxX: 500, maxY: 350 };
    const stops = planScan(area, VISIBLE);
    const strips = planStrips(area, VISIBLE)!;
    const stopsAt = estimateStops(stops, null, { speed: 2000 / 60, accel: 100, restSeconds: 1.1 });
    const stripsAt = estimateStrips(strips, null, {
      speed: 50,
      accel: 100,
      restSeconds: 1.1,
      hopSpeed: 50,
    });
    expect(stripsAt).toBeLessThan(stopsAt);
    // nothing to rave about for an area this small and a pitch this narrow – but clearly faster
    expect(stopsAt / stripsAt).toBeGreaterThan(1.3);
    expect(estimateStops([], null, { speed: 30, accel: 100, restSeconds: 1 })).toBe(0);
  });
});

describe('the position the status reports give', () => {
  it('is a straight line through the reports near a time: the jitter of single reports averages out', () => {
    const track = new PositionTrack();
    for (let i = 0; i <= 30; i++) {
      const t = i * 0.2;
      // 50 mm/s from 100, every report 25 ms early or late
      track.add(t + (i % 2 ? 0.025 : -0.025), 100 + 50 * t);
    }
    for (const t of [0.7, 2.5, 4.1])
      expect(Math.abs(track.at(t)! - (100 + 50 * t))).toBeLessThan(0.6);
    expect(track.fit(3)!.speed).toBeCloseTo(50, -1);
    // beyond the last report: continued along the line
    expect(Math.abs(track.at(6.3)! - (100 + 50 * 6.3))).toBeLessThan(1.5);
    expect(track.length).toBe(31);
  });

  it('knows nothing from fewer than two reports, and ignores a report from the past or one that is no number', () => {
    const track = new PositionTrack();
    expect(track.at(1)).toBeNull();
    track.add(1, 10);
    expect(track.at(1)).toBeNull();
    track.add(0.5, 99);
    track.add(NaN, 5);
    track.add(2, Infinity);
    expect(track.length).toBe(1);
    track.add(2, 20);
    expect(track.at(1.5)).toBeCloseTo(15, 9);
  });
});

describe('the lag of the pictures, from what registration found', () => {
  it('is what would have made the clock right: a picture 5 mm further on at 50 mm/s was taken 0.1 s earlier than the clock thought', () => {
    const samples = Array.from({ length: 6 }, (_, i) => ({
      predicted: 100 + i * 8,
      actual: 105 + i * 8,
      speed: 50,
    }));
    // actual − predicted = +5 mm at +50 mm/s: the picture was taken 0.1 s later than the clock's line says → lag 0.3 − 0.1
    expect(lagFromCorrections(0.3, samples)).toBeCloseTo(0.2, 9);
    // the other way round
    expect(
      lagFromCorrections(
        0.3,
        samples.map((s) => ({ ...s, speed: -50 })),
      ),
    ).toBeCloseTo(0.4, 9);
  });

  it('is not guessed from few pictures or from pictures taken while hardly moving, and stays within what is possible', () => {
    const slow = Array.from({ length: 8 }, () => ({ predicted: 0, actual: 1, speed: 2 }));
    expect(lagFromCorrections(0.3, slow)).toBeNull();
    expect(lagFromCorrections(0.3, [{ predicted: 0, actual: 5, speed: 50 }])).toBeNull();
    const wild = Array.from({ length: 6 }, () => ({ predicted: 0, actual: 400, speed: 50 }));
    expect(lagFromCorrections(0.3, wild)).toBe(0);
    expect(
      lagFromCorrections(
        0.3,
        wild.map((s) => ({ ...s, actual: -400 })),
      ),
    ).toBe(1.5);
    // an even number of samples: the middle of the two in the middle
    const even = [0, 0.05, 0.1, 0.15].map((d) => ({ predicted: 0, actual: 50 * d, speed: 50 }));
    expect(lagFromCorrections(0.3, even)).toBeCloseTo(0.3 - 0.075, 9);
  });
});

// ---------- a strip, run on a made-up table with a clock that is wrong ----------

interface RunOptions {
  axis?: Axis;
  from: number;
  to: number;
  across: number;
  speed: number;
  /** The picture's real lag (s) and the one the clock assumes */
  trueLag?: number;
  assumedLag?: number;
  /** Jitter of the arrival of reports and pictures, s */
  jitter?: number;
  cal?: CameraCalibration;
  /** The camera's real scale against the one the app believes: 1.003 is 0.3 % more pixels per mm */
  scale?: number;
  table?: (x: number, y: number) => [number, number, number];
  shot?: (i: number) => Shot;
}

const ACCEL = 100;
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** Position along the strip at time t: accelerate, cruise, brake into the end. */
function along(o: RunOptions, t: number): number {
  const d = Math.abs(o.to - o.from);
  const dir = Math.sign(o.to - o.from);
  const ramp = (o.speed * o.speed) / (2 * ACCEL);
  const peak = d >= 2 * ramp ? o.speed : Math.sqrt(d * ACCEL);
  const ta = peak / ACCEL;
  const da = (peak * peak) / (2 * ACCEL);
  const cruise = d - 2 * da;
  const tc = cruise / peak;
  let s: number;
  if (t <= 0) s = 0;
  else if (t < ta) s = 0.5 * ACCEL * t * t;
  else if (t < ta + tc) s = da + peak * (t - ta);
  else if (t < 2 * ta + tc) {
    const r = 2 * ta + tc - t;
    s = d - 0.5 * ACCEL * r * r;
  } else s = d;
  return o.from + dir * s;
}

function run(o: RunOptions) {
  const axis = o.axis ?? 'x';
  const cal = o.cal ?? CAL;
  const table = o.table ?? world;
  const trueLag = o.trueLag ?? 0.3;
  const assumedLag = o.assumedLag ?? 0.15;
  const jitter = o.jitter ?? 0.02;
  const d = Math.abs(o.to - o.from);
  const ramp = (o.speed * o.speed) / (2 * ACCEL);
  const total = d >= 2 * ramp ? d / o.speed + o.speed / ACCEL : 2 * Math.sqrt(d / ACCEL);
  const crosshair = (a: number) =>
    stripPoint({ axis, across: o.across, from: 0, to: 0 } as Strip, a);
  const spindle = (a: number) => {
    const c = crosshair(a);
    return { x: c.x - cal.offsetX, y: c.y - cal.offsetY };
  };
  const real = { ...cal, pxPerMm: cal.pxPerMm * (o.scale ?? 1) };
  const shoot = (a: number, i: number) => ({
    frame: renderFrame(real, spindle(a), SIZE, o.shot?.(i) ?? {}, table),
    k: 1,
  });
  // reports: every 200 ms, arriving 50 ms after they were true, a little early or late
  const track = new PositionTrack();
  for (let t = 0; t <= total + 0.4; t += 0.2) {
    const arrive = t + 0.05 + (hash(t * 7) - 0.5) * 2 * jitter;
    track.add(arrive, along(o, t));
  }
  // pictures: 30 a second, one kept about every 8.4 mm, none within 3 mm of the start
  const frames: {
    frame: ReturnType<typeof shoot>['frame'];
    k: number;
    predicted: number;
    truth: number;
    speed: number;
  }[] = [];
  let last = o.from;
  for (let n = 0; n / 30 <= total; n++) {
    const tCapture = n / 30;
    const truth = along(o, tCapture);
    if (Math.abs(truth - last) < 8.4 || Math.abs(truth - o.from) < 3) continue;
    last = truth;
    const arrive = tCapture + trueLag + (hash(n) - 0.5) * 2 * jitter;
    const fit = track.fit(arrive - assumedLag)!;
    frames.push({
      ...shoot(truth, frames.length),
      predicted: fit.position,
      truth,
      speed: fit.speed,
    });
  }
  const start = { ...shoot(o.from, 100), along: o.from };
  const end = { ...shoot(o.to, 101), along: o.to };
  const solution = solveStrip(start, end, frames, {
    cal,
    axis,
    across: o.across,
    speed: o.speed,
  });
  return { frames, solution, track };
}

function errors(r: ReturnType<typeof run>) {
  return r.solution.along.flatMap((a, i) => (a === null ? [] : [Math.abs(a - r.frames[i]!.truth)]));
}

describe('a strip run with a clock that is wrong', () => {
  const shots = (i: number): Shot => ({ vignette: 0.3, exposure: 0.92 + (i % 5) * 0.04 });

  it('is put where the pictures were taken, within a few tenths of a millimetre, though the clock is 5 mm off', () => {
    const r = run({ from: 100, to: 330, across: 80, speed: 50, shot: shots });
    expect(r.frames.length).toBeGreaterThan(15);
    // the clock really was far off
    const clock = r.frames.map((f) => Math.abs(f.predicted - f.truth));
    expect(Math.max(...clock)).toBeGreaterThan(5);
    const e = errors(r);
    expect(r.solution.placed).toBeGreaterThanOrEqual(r.frames.length - 1);
    // each chain on its own reaches (nearly) every picture – one of them failing would hide behind the other
    expect(r.solution.forward.filter((v) => v !== null).length).toBeGreaterThanOrEqual(
      r.frames.length - 1,
    );
    expect(r.solution.backward.filter((v) => v !== null).length).toBeGreaterThanOrEqual(
      r.frames.length - 1,
    );
    expect(Math.max(...e)).toBeLessThan(0.3);
    expect(e.reduce((a, b) => a + b, 0) / e.length).toBeLessThan(0.12);
    // the two chains agree
    expect(r.solution.disagreement).toBeLessThan(0.4);
  });

  it('is the same running the other way, and along Y', () => {
    const back = run({ from: 330, to: 100, across: 80, speed: 50, shot: shots });
    expect(back.solution.placed).toBeGreaterThanOrEqual(back.frames.length - 1);
    expect(Math.max(...errors(back))).toBeLessThan(0.3);
    const up = run({ axis: 'y', from: 60, to: 280, across: 120, speed: 50, shot: shots });
    expect(up.solution.placed).toBeGreaterThanOrEqual(up.frames.length - 1);
    expect(Math.max(...errors(up))).toBeLessThan(0.3);
    const down = run({ axis: 'y', from: 280, to: 60, across: 120, speed: 50, shot: shots });
    expect(Math.max(...errors(down))).toBeLessThan(0.3);
  });

  it('is the same with the camera turned and set off from the spindle', () => {
    const cal: CameraCalibration = { offsetX: 35, offsetY: -20, pxPerMm: 8, rotation: 12 };
    const r = run({ from: 100, to: 300, across: 150, speed: 50, cal, shot: shots });
    expect(r.solution.placed).toBeGreaterThanOrEqual(r.frames.length - 1);
    expect(Math.max(...errors(r))).toBeLessThan(0.3);
  });

  it('is the same slower and faster, and with the pictures arriving late by a different time each', () => {
    for (const speed of [20, 80]) {
      const r = run({ from: 100, to: 330, across: 80, speed, jitter: 0.03, shot: shots });
      expect(r.solution.placed, `speed ${speed}`).toBeGreaterThanOrEqual(r.frames.length - 2);
      expect(Math.max(...errors(r)), `speed ${speed}`).toBeLessThan(0.35);
    }
  });

  it("is put right though the camera's scale is 0.3 % off – the two chains drift apart alike and the blend takes it out", () => {
    for (const scale of [1.003, 0.997]) {
      const r = run({ from: 100, to: 500, across: 80, speed: 50, scale, shot: shots });
      expect(r.solution.placed, `scale ${scale}`).toBeGreaterThanOrEqual(r.frames.length - 2);
      expect(Math.max(...errors(r)), `scale ${scale}`).toBeLessThan(0.5);
    }
  });

  it("is not trusted where the camera's scale is off by more than 0.5 %: nothing that two chains vouch for is placed", () => {
    const r = run({ from: 100, to: 500, across: 80, speed: 50, scale: 1.012, shot: shots });
    expect(r.solution.placed).toBe(0);
  });

  it('is not made of pictures that show a table with nothing on it: they are all left out', () => {
    const r = run({ from: 100, to: 330, across: 80, speed: 50, table: () => [150, 130, 100] });
    expect(r.solution.placed).toBe(0);
  });

  it("is not made of a table that repeats itself within the clock's error: what is placed is right, the rest is left out", () => {
    // stripes every 4 mm along X: a shift of 4, 8, 12 mm looks like none
    const stripes = (x: number): [number, number, number] => {
      const v = 120 + 70 * Math.sin((x / 4) * 2 * Math.PI);
      return [v, v * 0.9, v * 0.7];
    };
    const r = run({ from: 100, to: 330, across: 80, speed: 50, table: (x) => stripes(x) });
    for (const e of errors(r)) expect(e).toBeLessThan(0.3);
  });

  it('learns the lag from its own corrections, so the next strip starts with a better clock', () => {
    const r = run({ from: 100, to: 330, across: 80, speed: 50, shot: shots, jitter: 0.01 });
    const samples = r.frames.flatMap((f, i) => {
      const a = r.solution.along[i];
      return a === null ? [] : [{ predicted: f.predicted, actual: a!, speed: f.speed }];
    });
    // the pictures lag by 0.3 s; the reports by 0.05 s, so the lag to subtract from the arrival is 0.25 s
    expect(lagFromCorrections(0.15, samples)!).toBeCloseTo(0.25, 1);
  });
});
