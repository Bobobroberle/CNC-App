import { expect, test, type Page } from '@playwright/test';
import { openDemo } from './helpers';

// A scan by stops waits for the machine to stand still and for the camera's picture to show it. The wait is adaptive – the
// picture is taken as soon as the position and the picture are calm, on evidence – and these tests hold it to the one thing that
// matters: the picture it takes is never one from before the stop. The simulator's camera is late by a time the app is not told
// (`lowriderCameraLag.ms`), has sensor noise (`noise`: what makes a new picture new), can stop delivering (`frozen`) and can show a
// table with nothing on it (`flat`). Every picture is held, at the moment the app reads it, against where the tool really rests:
// what the canvas shows (`lowriderCameraLag.shown`) against `lowriderSimulator.physical()`. The mosaic blends overlapping frames, so
// the map's dots (checked as well) could hide one stale picture; this cannot.

test.beforeEach(({}, info) => {
  test.skip(info.project.name === 'ipad', 'the touch project adds nothing here');
});

interface Area {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The plate the simulator draws: 19 × 19 dots, 10 mm apart, lying 0.6° askew at (120, 120). */
const PLATE = { x: 120, y: 120, angle: 0.6, n: 19, pitch: 10 };

/** Camera-centre positions with the plate's lower rows in them: eight pictures in two rows */
const AREA: Area = { minX: 100, minY: 100, maxX: 340, maxY: 200 };

/** A picture that shows the tool further than this from where it rests is one from before the stop, mm */
const PRE_STOP_MM = 0.02;

interface Picture {
  /** How far the picture on the canvas shows the tool from where it really is, mm (null: the canvas could not say) */
  err: number | null;
  /** From the machine last seen moving to the picture being read, ms */
  pause: number;
}

interface Stats {
  mode: 'strips' | 'stops';
  seconds: number;
  rest: {
    adaptive: number;
    fixed: number;
    unsure: number;
    extended: number;
    meanMs: number | null;
    learnedAt: number | null;
    points: string[];
  };
}

type Handle = {
  lowriderMap: {
    stats(): Stats | null;
    store(): {
      clear(): void;
      scanArea(area: Area, options?: { precise?: boolean }): Promise<boolean>;
      scan: { done: number; total: number } | null;
    };
    picture(): {
      gray: Uint8Array;
      valid: Uint8Array;
      width: number;
      height: number;
      left: number;
      top: number;
      pxPerMm: number;
    } | null;
    estimate(area: Area): { stops: { count: number; seconds: number } | null } | null;
  };
  lowriderCameraLag: {
    ms: number;
    jitterMs: number;
    blurPx: number;
    noise: number;
    frozen: boolean;
    flat: boolean;
    shown: { x: number; y: number } | null;
  };
  lowriderSimulator: {
    state: string;
    physical(): { x: number; y: number; z: number };
  };
  __pics?: Picture[];
  __busyAt?: number;
};

/** Every picture a scan lays down, held against where the tool rests, from now on */
const watchPictures = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Handle & { __patched?: boolean };
    w.__pics = [];
    if (w.__patched) return;
    w.__patched = true;
    // what the machine last did, to the millisecond (a look every 4 ms)
    w.__busyAt = performance.now();
    setInterval(() => {
      if (w.lowriderSimulator.state !== 'Idle') w.__busyAt = performance.now();
    }, 4);
    const store = w.lowriderMap.store() as unknown as {
      addPicture: (...args: unknown[]) => boolean;
    };
    const original = store.addPicture;
    store.addPicture = (...args: unknown[]) => {
      if (w.lowriderMap.store().scan) {
        const at = w.lowriderSimulator.physical();
        const shown = w.lowriderCameraLag.shown;
        w.__pics!.push({
          err: shown ? Math.hypot(shown.x - at.x, shown.y - at.y) : null,
          pause: performance.now() - w.__busyAt!,
        });
      }
      return original(...args);
    };
  });

const camera = (page: Page, set: Partial<Handle['lowriderCameraLag']>) =>
  page.evaluate((s) => Object.assign((window as unknown as Handle).lowriderCameraLag, s), set);

/** One scan of `area`: what it took, what it did and how each picture sat against the tool */
async function scan(page: Page, area: Area, precise: boolean) {
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().clear());
  await watchPictures(page);
  const ok = await page.evaluate(
    ([a, p]) =>
      (window as unknown as Handle).lowriderMap
        .store()
        .scanArea(a as Area, { precise: p as boolean }),
    [area, precise] as const,
  );
  const stats = await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!);
  const pictures = await page.evaluate(() => (window as unknown as Handle).__pics!);
  return { ok, stats, pictures };
}

/** The worst picture of a scan: how far it shows the tool from where it rests, mm (Infinity: one the canvas could not say) */
const worst = (pictures: Picture[]) =>
  Math.max(0, ...pictures.map((p) => (p.err === null ? Infinity : p.err)));

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const pauseOf = (pictures: Picture[]) => mean(pictures.map((p) => p.pause));

/** Where the map shows each dot of the plate inside `area`: the centre of the dark pixels around it, machine mm. */
async function dots(page: Page, area: Area) {
  return page.evaluate(
    ([plate, box]) => {
      const pic = (window as unknown as Handle).lowriderMap.picture();
      if (!pic) return [];
      const a = (plate.angle * Math.PI) / 180;
      const out: { id: string; x: number; y: number }[] = [];
      for (let i = 0; i < plate.n; i++) {
        for (let j = 0; j < plate.n; j++) {
          const px = i * plate.pitch;
          const py = j * plate.pitch;
          const x = plate.x + Math.cos(a) * px - Math.sin(a) * py;
          const y = plate.y + Math.sin(a) * px + Math.cos(a) * py;
          if (x < box.minX + 8 || x > box.maxX - 8 || y < box.minY + 8 || y > box.maxY - 8)
            continue;
          let sw = 0;
          let sx = 0;
          let sy = 0;
          const r = 4;
          for (
            let v = Math.floor((pic.top - y - r) * pic.pxPerMm);
            v <= Math.ceil((pic.top - y + r) * pic.pxPerMm);
            v++
          ) {
            for (
              let u = Math.floor((x - r - pic.left) * pic.pxPerMm);
              u <= Math.ceil((x + r - pic.left) * pic.pxPerMm);
              u++
            ) {
              if (u < 0 || v < 0 || u >= pic.width || v >= pic.height) continue;
              const k = v * pic.width + u;
              if (!pic.valid[k]) continue;
              const w = Math.max(0, 110 - pic.gray[k]!);
              sw += w;
              sx += w * (pic.left + (u + 0.5) / pic.pxPerMm);
              sy += w * (pic.top - (v + 0.5) / pic.pxPerMm);
            }
          }
          if (sw > 4000) out.push({ id: `${i},${j}`, x: sx / sw, y: sy / sw });
        }
      }
      return out;
    },
    [PLATE, area] as const,
  );
}

/** How far the dots of a scan lie from where the reference scan has them, mm */
function against(reference: { id: string; x: number; y: number }[], found: typeof reference) {
  const byId = new Map(reference.map((d) => [d.id, d]));
  const both = found.filter((d) => byId.has(d.id));
  const errors = both.map((d) => Math.hypot(d.x - byId.get(d.id)!.x, d.y - byId.get(d.id)!.y));
  return {
    share: both.length / reference.length,
    max: errors.length ? Math.max(...errors) : Infinity,
  };
}

const LAGS = [0, 0.15, 0.4, 0.8];

test('with a camera that is late by 0, 0.15, 0.4 and 0.8 s, no picture is one from before the stop – and the pause is shorter where the camera allows', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await openDemo(page);
  await camera(page, { ms: 0, jitterMs: 40, noise: 2 });
  await page.waitForTimeout(500);
  // the reference: a stop for every picture at today's pause, the camera not late
  const reference0 = await scan(page, AREA, true);
  expect(reference0.ok).toBe(true);
  const reference = await dots(page, AREA);
  expect(reference.length).toBeGreaterThan(30);

  const lines: string[] = [];
  for (const lag of LAGS) {
    await camera(page, { ms: lag * 1000, jitterMs: 40, noise: 2 });
    await page.waitForTimeout(1200);
    const fixed = await scan(page, AREA, true);
    const adaptive = await scan(page, AREA, false);
    const found = await dots(page, AREA);
    const line = `lag ${lag} s: fixed pause ${pauseOf(fixed.pictures).toFixed(0)} ms (${fixed.stats.seconds.toFixed(1)} s) · adaptive pause ${pauseOf(adaptive.pictures).toFixed(0)} ms (${adaptive.stats.seconds.toFixed(1)} s), ${adaptive.stats.rest.adaptive} adaptive, ${adaptive.stats.rest.fixed} fixed, ${adaptive.stats.rest.unsure} unsure, ${adaptive.stats.rest.extended} extended, after learning ${adaptive.stats.rest.meanMs?.toFixed(0)} ms · worst picture ${worst(adaptive.pictures).toFixed(3)} mm`;
    lines.push(line);
    console.log(line);

    expect(adaptive.ok).toBe(true);
    expect(adaptive.pictures.length).toBe(fixed.pictures.length);
    // the one thing that matters
    expect(worst(adaptive.pictures), line).toBeLessThan(PRE_STOP_MM);
    // and the map shows the plate where the reference has it
    const held = against(reference, found);
    expect(held.share, line).toBeGreaterThanOrEqual(0.9);
    expect(held.max, line).toBeLessThan(0.15);
    // not slower than the fixed pause – and clearly quicker where the camera is quick. A camera as late as the fixed pause (0.8 s)
    // gains nothing, and a picture that is still changing at it is waited for: that costs a little, and the bound has room for a shared machine
    expect(pauseOf(adaptive.pictures), line).toBeLessThanOrEqual(
      pauseOf(fixed.pictures) * (lag >= 0.8 ? 1.3 : 1.08),
    );
    if (lag <= 0.4) {
      expect(adaptive.stats.rest.adaptive, line).toBeGreaterThanOrEqual(3);
      expect(pauseOf(adaptive.pictures), line).toBeLessThan(pauseOf(fixed.pictures) * 0.85);
    }
  }
  test.info().annotations.push({ type: 'numbers', description: lines.join('\n') });
});

/** Raises the camera's lag when the machine comes to rest once `afterPictures` pictures are in (the first three points learn the camera) */
const lagJumpAtStop = (page: Page, ms: number, afterPictures: number) =>
  page.evaluate(
    ([lagMs, after]) => {
      const w = window as unknown as Handle;
      let moving = false;
      const timer = setInterval(() => {
        if (w.__pics!.length < (after as number)) return;
        if (w.lowriderSimulator.state !== 'Idle') moving = true;
        else if (moving) {
          w.lowriderCameraLag.ms = lagMs as number;
          clearInterval(timer);
        }
      }, 2);
    },
    [ms, afterPictures] as const,
  );

test('a lag that jumps to 1 s the moment the machine stops, after the camera was learned at 0.15 s, produces no picture from before the stop', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDemo(page);
  await camera(page, { ms: 150, jitterMs: 40, noise: 2 });
  await page.waitForTimeout(800);
  await watchPictures(page);
  await lagJumpAtStop(page, 1000, 5);
  const run = await scan(page, AREA, false);
  const line = `jump: ${run.stats.rest.adaptive} adaptive, ${run.stats.rest.fixed} fixed, ${run.stats.rest.unsure} unsure, ${run.stats.rest.extended} extended, worst ${worst(run.pictures).toFixed(3)} mm`;
  console.log(line);
  expect(run.ok).toBe(true);
  // the first points were learned at 0.15 s: the wait is short when the lag jumps
  expect(run.stats.rest.adaptive, line).toBeGreaterThanOrEqual(1);
  expect(worst(run.pictures), line).toBeLessThan(PRE_STOP_MM);
  // the camera is 1 s late from then on: the wait was longer than the fixed pause
  expect(run.stats.rest.extended, line).toBeGreaterThanOrEqual(1);
  await camera(page, { ms: 0 });
});

test('a camera that stops delivering at the very moment the machine stops, on every point after the learning, produces no picture from before the stop', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDemo(page);
  await camera(page, { ms: 150, jitterMs: 40, noise: 2 });
  await page.waitForTimeout(800);
  await watchPictures(page);
  // from the fifth picture on, every stop freezes the picture for 0.4 s
  await page.evaluate(() => {
    const w = window as unknown as Handle;
    let moving = false;
    setInterval(() => {
      if (w.__pics!.length < 4) return;
      if (w.lowriderSimulator.state !== 'Idle') moving = true;
      else if (moving) {
        moving = false;
        w.lowriderCameraLag.frozen = true;
        setTimeout(() => (w.lowriderCameraLag.frozen = false), 400);
      }
    }, 2);
  });
  const run = await scan(page, AREA, false);
  const line = `freeze: ${run.stats.rest.adaptive} adaptive, ${run.stats.rest.fixed} fixed, ${run.stats.rest.unsure} unsure, ${run.stats.rest.extended} extended, worst ${worst(run.pictures).toFixed(3)} mm`;
  console.log(line);
  expect(run.ok).toBe(true);
  expect(worst(run.pictures), line).toBeLessThan(PRE_STOP_MM);
  await camera(page, { ms: 0, frozen: false });
});

test('a table with nothing on it to see, a camera that has stopped and a camera without noise: no evidence, so the fixed pause – no shortcut, no hang', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await openDemo(page);
  const fixed = await scan(page, AREA, true);
  const fixedPause = pauseOf(fixed.pictures);

  // nothing to see: not a picture differs from another but by the noise
  await camera(page, { ms: 0, noise: 2, flat: true });
  await page.waitForTimeout(500);
  const flat = await scan(page, AREA, false);
  console.log(
    `flat: pause ${pauseOf(flat.pictures).toFixed(0)} ms against ${fixedPause.toFixed(0)}, ${flat.stats.rest.adaptive} adaptive`,
  );
  expect(flat.ok).toBe(true);
  expect(flat.stats.rest.adaptive).toBe(0);
  expect(pauseOf(flat.pictures)).toBeGreaterThanOrEqual(fixedPause * 0.95);
  expect(pauseOf(flat.pictures)).toBeLessThanOrEqual(fixedPause * 1.1);

  // a camera that delivers nothing new from the start
  await camera(page, { ms: 0, noise: 2, flat: false, frozen: true });
  const frozen = await scan(page, AREA, false);
  console.log(
    `frozen: pause ${pauseOf(frozen.pictures).toFixed(0)} ms, ${frozen.stats.rest.adaptive} adaptive`,
  );
  expect(frozen.ok).toBe(true);
  expect(frozen.stats.rest.adaptive).toBe(0);
  expect(pauseOf(frozen.pictures)).toBeGreaterThanOrEqual(fixedPause * 0.95);
  expect(pauseOf(frozen.pictures)).toBeLessThanOrEqual(fixedPause * 1.1);

  // the simulator as it always was: a late camera without any noise cannot be told from one that stopped
  await camera(page, { ms: 300, jitterMs: 40, noise: 0, frozen: false });
  await page.waitForTimeout(1200);
  const quiet = await scan(page, AREA, false);
  console.log(
    `no noise: pause ${pauseOf(quiet.pictures).toFixed(0)} ms, ${quiet.stats.rest.adaptive} adaptive`,
  );
  expect(quiet.ok).toBe(true);
  expect(quiet.stats.rest.adaptive).toBe(0);
  expect(quiet.stats.rest.extended).toBe(0);
  expect(pauseOf(quiet.pictures)).toBeGreaterThanOrEqual(fixedPause * 0.95);
  expect(pauseOf(quiet.pictures)).toBeLessThanOrEqual(fixedPause * 1.1);
  expect(worst(quiet.pictures)).toBeLessThan(PRE_STOP_MM);
});

test('the estimate counts the pause the scan applied: the fixed one before a camera is learned, the shorter one after', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDemo(page);
  await camera(page, { ms: 150, jitterMs: 40, noise: 2 });
  await page.waitForTimeout(800);
  const estimate = () =>
    page.evaluate(
      (a) => (window as unknown as Handle).lowriderMap.estimate(a)!.stops!.seconds,
      AREA,
    );
  const before = await estimate();
  const first = await scan(page, AREA, false);
  expect(first.stats.rest.adaptive).toBeGreaterThanOrEqual(3);
  // learned: the same area is promised shorter
  const after = await estimate();
  expect(after).toBeLessThan(before * 0.9);
  // …and the next scan takes what it promised, from where it stands
  const second = await scan(page, AREA, false);
  const line = `estimate before ${before.toFixed(1)} s, after ${after.toFixed(1)} s; scans took ${first.stats.seconds.toFixed(1)} and ${second.stats.seconds.toFixed(1)} s`;
  console.log(line);
  expect(Math.abs(after - second.stats.seconds) / second.stats.seconds, line).toBeLessThan(0.15);
  // a precise scan keeps the pause as it was
  const precise = await scan(page, AREA, true);
  expect(precise.stats.rest.adaptive).toBe(0);
  expect(precise.stats.rest.fixed).toBe(precise.pictures.length);
});

// A measurement, not a check: how long a scan by stops of a whole table takes at today's pause and with the wait for the calm, at
// several lags of the simulated camera. It takes about twenty minutes, so it runs on request: MEASURE_REST=1.
test('measuring: a scan by stops of a table-sized area, fixed pause and adaptive wait, at several lags', async ({
  page,
}) => {
  test.skip(
    !process.env.MEASURE_REST,
    'a measurement of about twenty minutes – run with MEASURE_REST=1',
  );
  test.setTimeout(3_600_000);
  const TABLE: Area = { minX: 0, minY: 0, maxX: 725, maxY: 290 };
  const CORNER: Area = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  await openDemo(page);
  const estimate = () =>
    page.evaluate(
      (a) => (window as unknown as Handle).lowriderMap.estimate(a)!.stops!.seconds,
      TABLE,
    );
  const lines: string[] = [];
  const log = (line: string) => {
    lines.push(line);
    console.log(line);
  };
  // always from the same place: the first hop of a scan is a long one
  const fromCorner = async () => {
    await scan(page, CORNER, true);
  };
  for (const lag of LAGS) {
    await camera(page, { ms: lag * 1000, jitterMs: 40, noise: 2 });
    await page.waitForTimeout(1200);
    if (lag === 0 || lag === 0.8) {
      await fromCorner();
      const before = await estimate();
      const fixed = await scan(page, TABLE, true);
      log(
        `lag ${lag} s, fixed pause: ${fixed.pictures.length} pictures, ${fixed.stats.seconds.toFixed(1)} s, pause ${pauseOf(fixed.pictures).toFixed(0)} ms, worst ${worst(fixed.pictures).toFixed(3)} mm, estimate ${before.toFixed(0)} s`,
      );
    }
    await fromCorner();
    const promised = await estimate();
    const adaptive = await scan(page, TABLE, false);
    const rest = adaptive.stats.rest;
    log(
      `lag ${lag} s, adaptive: ${adaptive.pictures.length} pictures, ${adaptive.stats.seconds.toFixed(1)} s, pause ${pauseOf(adaptive.pictures).toFixed(0)} ms (after learning ${rest.meanMs?.toFixed(0)} ms), ${rest.adaptive} adaptive / ${rest.fixed} fixed / ${rest.unsure} unsure / ${rest.extended} extended, worst ${worst(adaptive.pictures).toFixed(3)} mm, estimate before ${promised.toFixed(0)} s, after ${(await estimate()).toFixed(0)} s`,
    );
    expect(worst(adaptive.pictures)).toBeLessThan(PRE_STOP_MM);
  }
  test.info().annotations.push({ type: 'numbers', description: lines.join('\n') });
});
