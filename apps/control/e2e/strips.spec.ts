import { unzipSync, strFromU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { goTo, openDemo } from './helpers';

// Scanning in strips on the simulated machine of the demo: the camera runs along a line without stopping, its
// pictures come late by a time the app is not told, and the map must show the table where a scan with a stop
// for every picture shows it – the dots of the precision plate are the rulers.

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

/** A box of camera-centre positions with the plate's lower rows in it: two strips along X. */
const AREA: Area = { minX: 100, minY: 100, maxX: 340, maxY: 200 };

interface Stats {
  mode: 'strips' | 'stops';
  strips: number;
  offered: number;
  placed: number;
  refilled: number;
  lag: number;
  seconds: number;
  gaveUp: boolean;
  clock: 'pi' | 'browser';
  clockReason: 'relay' | 'device' | 'stream' | 'window' | null;
  clockLost: string | null;
  stamp: { domain: 'mono' | 'wall'; source: string } | null;
  timingNoiseMs: number | null;
}

/** A simulated Pi between the controller and the page (`PiClockSetup` in `sim/index.ts`) */
interface PiSetup {
  offsetMs: number;
  linkMs: number;
  linkJitterMs: number;
  stampNoiseMs: number;
  frameStampNoiseMs: number;
  stampLagMs?: number;
  stamps?: boolean;
  frameClockOffsetMs?: number;
  frameDomain?: 'mono' | 'wall';
}

type Handle = {
  lowriderMap: {
    stats(): Stats | null;
    picture(): {
      gray: Uint8Array;
      valid: Uint8Array;
      width: number;
      height: number;
      left: number;
      top: number;
      pxPerMm: number;
    } | null;
    store(): {
      clear(): void;
      scanArea(area: Area, options?: { precise?: boolean }): Promise<boolean>;
      cancelScan(): void;
      setMode(mode: 'strips' | 'stops'): void;
      setTempo(tempo: 'gentle' | 'normal' | 'fast'): void;
      setExposure(ms: number): void;
      mode: 'strips' | 'stops';
      scan: unknown;
    };
    trace(): {
      setRecording(on: boolean): void;
      save(): Promise<boolean>;
      scans: number;
      pending: number;
    };
    stamp(): { mono: number; wall: number } | null;
  };
  lowriderPiClock?: PiSetup;
  lowriderCameraLag: { ms: number; jitterMs: number; blurPx: number };
  lowriderSimulator: { state: string };
};

const scan = (page: Page, area: Area, precise: boolean) =>
  page.evaluate(
    ([a, p]) =>
      (window as unknown as Handle).lowriderMap
        .store()
        .scanArea(a as Area, { precise: p as boolean }),
    [area, precise] as const,
  );

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
          // well inside the scanned box: the rim of a picture is not trusted
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
          // a dot of Ø 3 mm: a few thousand units of darkness – less is a dot that is not there
          if (sw > 4000) out.push({ id: `${i},${j}`, x: sx / sw, y: sy / sw });
        }
      }
      return out;
    },
    [PLATE, area] as const,
  );
}

/** The simulated Pi's clocks run two hours ahead of the page's: any mixing of the two fails loudly, not by a few ms */
const HUGE_OFFSET_MS = 7_200_000;

/** Sets up the simulated Pi (null: none – the simulator as it always was) */
const setPi = (page: Page, setup: PiSetup | null) =>
  page.evaluate((s) => {
    (window as unknown as Handle).lowriderPiClock = s ?? undefined;
  }, setup);

/** The relay's stamps arrive with the reports once a Pi is set up (the next poll, within 200 ms) */
const stampsArrive = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => (window as unknown as Handle).lowriderMap.stamp() !== null))
    .toBe(true);

/** How far the dots of a scan lie from where the reference scan (a stop for every picture) has them, mm */
function against(reference: { id: string; x: number; y: number }[], found: typeof reference) {
  const byId = new Map(reference.map((d) => [d.id, d]));
  const both = found.filter((d) => byId.has(d.id));
  const errors = both.map((d) => Math.hypot(d.x - byId.get(d.id)!.x, d.y - byId.get(d.id)!.y));
  return {
    share: both.length / reference.length,
    max: errors.length ? Math.max(...errors) : Infinity,
    mean: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : Infinity,
  };
}

const stats = (page: Page) =>
  page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!);

/** A camera that shows the table 0.3 s late, give or take 40 ms – unseen by the app */
const lateCamera = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Handle;
    w.lowriderCameraLag.ms = 300;
    w.lowriderCameraLag.jitterMs = 40;
  });

test('a strip scan with a camera that is late puts the plate where a scan with stops does', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDemo(page);
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    // by stops is what a scan does unless this device chose otherwise
    (window as unknown as Handle).lowriderMap.store().setMode('strips');
  });

  // The reference: a stop for every picture
  expect(await scan(page, AREA, true)).toBe(true);
  const reference = await dots(page, AREA);
  const stops = await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats());
  expect(stops).toMatchObject({ mode: 'stops' });
  expect(reference.length).toBeGreaterThan(30);

  // The same area in strips, with a camera that shows the table 0.3 s late, give or take 40 ms – unseen by the app
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    (window as unknown as Handle).lowriderCameraLag.ms = 300;
    (window as unknown as Handle).lowriderCameraLag.jitterMs = 40;
  });
  expect(await scan(page, AREA, false)).toBe(true);
  const strips = await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!);
  const found = await dots(page, AREA);

  expect(strips.mode).toBe('strips');
  expect(strips.gaveUp).toBe(false);
  // two strips along X, run there and back
  expect(strips.strips).toBe(2);
  // most of what was taken on the run could be put where it was taken; what was left out was taken again, with a stop
  expect(strips.offered).toBeGreaterThan(10);
  expect(strips.placed).toBeGreaterThanOrEqual(strips.offered * 0.75);
  expect(strips.refilled).toBeLessThanOrEqual(3);
  // the app has found out for itself that the pictures are late
  expect(strips.lag).toBeGreaterThan(0.1);
  expect(strips.lag).toBeLessThan(0.5);

  // every dot the reference sees, the strip scan sees where the reference has it – both strips, so both directions
  const byId = new Map(reference.map((d) => [d.id, d]));
  const both = found.filter((d) => byId.has(d.id));
  expect(both.length).toBeGreaterThanOrEqual(reference.length * 0.9);
  const errors = both.map((d) => Math.hypot(d.x - byId.get(d.id)!.x, d.y - byId.get(d.id)!.y));
  expect(Math.max(...errors)).toBeLessThan(0.5);
  expect(errors.reduce((a, b) => a + b, 0) / errors.length).toBeLessThan(0.2);
  // rows from the strip that ran one way and from the one that ran the other
  const lower = both.filter((d) => d.y < 150);
  const upper = both.filter((d) => d.y >= 150);
  expect(lower.length).toBeGreaterThan(5);
  expect(upper.length).toBeGreaterThan(5);
});

test("a strip scan on the Pi's clock – two hours ahead of the page's – puts the plate where a scan with stops does", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDemo(page);
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    (window as unknown as Handle).lowriderMap.store().setMode('strips');
  });
  expect(await scan(page, AREA, true)).toBe(true);
  const reference = await dots(page, AREA);
  expect(reference.length).toBeGreaterThan(30);

  // the camera is late in the page by 0.3 s and the link is slow and uneven – none of it is in the Pi's stamps
  await lateCamera(page);
  await setPi(page, {
    offsetMs: HUGE_OFFSET_MS,
    linkMs: 40,
    linkJitterMs: 60,
    stampNoiseMs: 4,
    frameStampNoiseMs: 2,
  });
  await stampsArrive(page);
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().clear());
  expect(await scan(page, AREA, false)).toBe(true);
  const run = await stats(page);
  const found = await dots(page, AREA);

  // the Pi's clock was chosen once for the scan: the stamps of the pictures are the grab time, in the clock of the reports
  expect(run).toMatchObject({
    mode: 'strips',
    clock: 'pi',
    clockReason: null,
    clockLost: null,
    gaveUp: false,
    strips: 2,
    stamp: { domain: 'mono', source: 'x-ustreamer-grab-time' },
  });
  expect(run.offered).toBeGreaterThan(10);
  expect(run.placed).toBeGreaterThanOrEqual(run.offered * 0.75);
  expect(run.refilled).toBeLessThanOrEqual(3);
  // what is left between the two stamps is tens of milliseconds, not the 0.3 s the page sees the camera late by
  expect(Math.abs(run.lag)).toBeLessThan(0.1);

  const quality = against(reference, found);
  expect(quality.share).toBeGreaterThanOrEqual(0.9);
  expect(quality.max).toBeLessThan(0.5);
  expect(quality.mean).toBeLessThan(0.2);
  // both strips, so both directions
  expect(found.filter((d) => d.y < 150).length).toBeGreaterThan(5);
  expect(found.filter((d) => d.y >= 150).length).toBeGreaterThan(5);
});

test("with a jittery link and a jittery camera the run on the Pi's clock puts its pictures tighter than the run on the browser's", async ({
  page,
}, testInfo) => {
  test.setTimeout(500_000);
  await openDemo(page);
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    (window as unknown as Handle).lowriderMap.store().setMode('strips');
  });
  expect(await scan(page, AREA, true)).toBe(true);
  const reference = await dots(page, AREA);
  expect(reference.length).toBeGreaterThan(30);

  // A bad day: the camera is late by 0.3 s ± 40 ms in the page, and the link from the Pi to the page 60–180 ms, uneven
  await lateCamera(page);
  const link: PiSetup = {
    offsetMs: HUGE_OFFSET_MS,
    linkMs: 60,
    linkJitterMs: 120,
    stampNoiseMs: 4,
    frameStampNoiseMs: 2,
  };
  const clear = () =>
    page.evaluate(() => (window as unknown as Handle).lowriderMap.store().clear());

  // On the browser's clock: the link is as bad, the Pi stamps nothing (an older companion)
  await setPi(page, { ...link, stamps: false });
  await page.waitForTimeout(600);
  await clear();
  expect(await scan(page, AREA, false)).toBe(true);
  const browser = await stats(page);
  const browserQuality = against(reference, await dots(page, AREA));

  // On the Pi's clock: the same link, the same camera, with the stamps. (A run on the browser's clock that was given up on this
  // table makes the next scan go by stops until "In Fahrt" is chosen again – as the operator would.)
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().setMode('strips'));
  await setPi(page, link);
  await stampsArrive(page);
  await clear();
  expect(await scan(page, AREA, false)).toBe(true);
  const pi = await stats(page);
  const piQuality = against(reference, await dots(page, AREA));

  expect(browser).toMatchObject({ mode: 'strips', clock: 'browser', clockReason: 'relay' });
  expect(pi).toMatchObject({ mode: 'strips', clock: 'pi', clockReason: null, gaveUp: false });

  // the numbers, for docs/scan.md and for whoever tunes the margin
  const line = (name: string, st: Stats, q: ReturnType<typeof against>) =>
    `${name}: clock scatter ${st.timingNoiseMs?.toFixed(1)} ms, placed ${st.placed}/${st.offered}, refilled ${st.refilled}, ` +
    `lag ${(st.lag * 1000).toFixed(0)} ms, dots ${(q.share * 100).toFixed(0)} % found, error mean ${q.mean.toFixed(3)} mm, worst ${q.max.toFixed(3)} mm, ${st.seconds.toFixed(0)} s`;
  const report = [line('browser clock', browser, browserQuality), line('Pi clock', pi, piQuality)];
  for (const text of report) console.log(text);
  testInfo.annotations.push({ type: 'jitter comparison', description: report.join(' | ') });

  expect(browser.timingNoiseMs).not.toBeNull();
  expect(pi.timingNoiseMs).not.toBeNull();
  // the clock itself is measurably tighter: the pictures land nearer the line the reports say
  expect(pi.timingNoiseMs!).toBeLessThan(browser.timingNoiseMs! * 0.4);
  // and the map made on it is as good as a scan with stops
  expect(piQuality.share).toBeGreaterThanOrEqual(0.9);
  expect(piQuality.max).toBeLessThan(0.5);
  expect(piQuality.mean).toBeLessThan(0.2);
  expect(pi.placed).toBeGreaterThanOrEqual(pi.offered * 0.75);
});

test("on a link so uneven that the browser's clock loses pictures at speed, the Pi's clock does not", async ({
  page,
}, testInfo) => {
  test.setTimeout(500_000);
  await openDemo(page);
  await page.evaluate(() => {
    const store = (window as unknown as Handle).lowriderMap.store();
    store.clear();
    store.setMode('strips');
    store.setTempo('fast');
  });
  expect(await scan(page, AREA, true)).toBe(true);
  const reference = await dots(page, AREA);
  expect(reference.length).toBeGreaterThan(30);

  // A very bad link: 100–500 ms from the Pi to the page, at 56 mm/s that is up to 22 mm of difference between two reports'
  // delays – more than the search of the solver allows for the clock's error
  await lateCamera(page);
  const link: PiSetup = {
    offsetMs: HUGE_OFFSET_MS,
    linkMs: 100,
    linkJitterMs: 400,
    stampNoiseMs: 4,
    frameStampNoiseMs: 2,
  };
  const clear = () =>
    page.evaluate(() => (window as unknown as Handle).lowriderMap.store().clear());
  await setPi(page, { ...link, stamps: false });
  await page.waitForTimeout(600);
  await clear();
  expect(await scan(page, AREA, false)).toBe(true);
  const browser = await stats(page);
  const browserQuality = against(reference, await dots(page, AREA));

  // a run on the browser's clock that was given up makes the next scan go by stops until "In Fahrt" is chosen again
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().setMode('strips'));
  await setPi(page, link);
  await stampsArrive(page);
  await clear();
  expect(await scan(page, AREA, false)).toBe(true);
  const pi = await stats(page);
  const piQuality = against(reference, await dots(page, AREA));

  const line = (name: string, st: Stats, q: ReturnType<typeof against>) =>
    `${name}: gave up ${st.gaveUp}, clock scatter ${st.timingNoiseMs?.toFixed(1)} ms, placed ${st.placed}/${st.offered}, refilled ${st.refilled}, ` +
    `lag ${(st.lag * 1000).toFixed(0)} ms, dots ${(q.share * 100).toFixed(0)} % found, error mean ${q.mean.toFixed(3)} mm, worst ${q.max.toFixed(3)} mm, ${st.seconds.toFixed(0)} s`;
  const report = [line('browser clock', browser, browserQuality), line('Pi clock', pi, piQuality)];
  for (const text of report) console.log(`very bad link, fast: ${text}`);
  testInfo.annotations.push({ type: 'bad link comparison', description: report.join(' | ') });

  expect(browser).toMatchObject({ clock: 'browser', clockReason: 'relay' });
  expect(pi).toMatchObject({ clock: 'pi', gaveUp: false });
  // the Pi's clock is not touched by the link: the run is placed and the map is as good as a scan with stops
  expect(pi.placed).toBeGreaterThanOrEqual(pi.offered * 0.75);
  expect(pi.refilled).toBeLessThanOrEqual(3);
  expect(piQuality.share).toBeGreaterThanOrEqual(0.9);
  expect(piQuality.max).toBeLessThan(0.5);
});

test("a slow run on the Pi's clock – the exposure holds it to about 5 mm/s, a picture every 3.6 s – is not taken for a clock that went away", async ({
  page,
}) => {
  test.setTimeout(500_000);
  await openDemo(page);
  await page.evaluate(() => {
    const store = (window as unknown as Handle).lowriderMap.store();
    store.clear();
    store.setMode('strips');
    // 55 ms of exposure: 0.3 mm of blur at 5.45 mm/s – where the pictures of a run lie 3.6 s apart, more than the 3 s window
    // the stamps of the pictures and of the reports may differ by
    store.setExposure(55);
  });
  await setPi(page, {
    offsetMs: HUGE_OFFSET_MS,
    linkMs: 40,
    linkJitterMs: 60,
    stampNoiseMs: 4,
    frameStampNoiseMs: 2,
  });
  await stampsArrive(page);
  expect(await scan(page, AREA, false)).toBe(true);
  const run = await stats(page);
  // both strips were run on the Pi's clock: the check between them found a clock that holds
  expect(run).toMatchObject({
    mode: 'strips',
    clock: 'pi',
    clockLost: null,
    gaveUp: false,
    strips: 2,
  });
  expect(run.offered).toBeGreaterThan(8);
  expect(run.placed).toBeGreaterThanOrEqual(run.offered * 0.75);
  expect(run.refilled).toBeLessThanOrEqual(3);
});

test("pictures stamped in another clock than the reports: the scan keeps to the browser's clock, says why, and still places the plate", async ({
  page,
}) => {
  test.setTimeout(400_000);
  await openDemo(page);
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    (window as unknown as Handle).lowriderMap.store().setMode('strips');
  });
  expect(await scan(page, AREA, true)).toBe(true);
  const reference = await dots(page, AREA);

  await lateCamera(page);
  // a driver that stamps its buffers with a clock an hour away from the reports'
  await setPi(page, {
    offsetMs: HUGE_OFFSET_MS,
    linkMs: 40,
    linkJitterMs: 60,
    stampNoiseMs: 4,
    frameStampNoiseMs: 2,
    frameClockOffsetMs: 3_600_000,
  });
  await stampsArrive(page);
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().clear());
  expect(await scan(page, AREA, false)).toBe(true);
  const run = await stats(page);
  // never a mixture: the whole scan went by the browser's clock, and the browser's path is what it always was
  expect(run).toMatchObject({
    mode: 'strips',
    clock: 'browser',
    clockReason: 'window',
    stamp: null,
    gaveUp: false,
  });
  expect(run.lag).toBeGreaterThan(0.1);
  expect(run.placed).toBeGreaterThanOrEqual(run.offered * 0.75);
  const quality = against(reference, await dots(page, AREA));
  expect(quality.share).toBeGreaterThanOrEqual(0.9);
  expect(quality.max).toBeLessThan(0.5);

  // the panel says which clock the last scan used, and why not the Pi's
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  const section = page
    .locator('.section[data-fold]')
    .filter({ has: page.getByRole('heading', { name: 'Fläche scannen', exact: true }) });
  if ((await section.getAttribute('data-open')) === null) {
    await section.locator('[data-fold-trigger]').first().click();
  }
  const panel = page.getByTestId('photo-map-panel');
  await expect(panel.getByTestId('scan-clock')).toHaveAttribute('data-clock', 'browser');
  await expect(panel.getByTestId('scan-clock-line')).toContainText('Browser');
  await expect(panel.getByTestId('scan-clock-why')).toHaveAttribute('data-reason', 'window');
  await expect(panel.getByTestId('scan-clock-why')).toContainText('anderen Uhr');
});

test('the exposure caps the speed of a run, is kept on this device, and the panel says how blurred a picture is', async ({
  page,
}) => {
  await openDemo(page);
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  const section = page
    .locator('.section[data-fold]')
    .filter({ has: page.getByRole('heading', { name: 'Fläche scannen', exact: true }) });
  if ((await section.getAttribute('data-open')) === null) {
    await section.locator('[data-fold-trigger]').first().click();
  }
  const panel = page.getByTestId('photo-map-panel');
  await panel
    .getByRole('group', { name: 'Art des Scans' })
    .getByRole('button', { name: 'In Fahrt (schnell)' })
    .click();
  const field = panel.getByLabel('Belichtung (ms)');
  // unknown (0): no cap, no figure
  await expect(field).toHaveValue('0');
  await expect(panel.getByTestId('blur-line')).toHaveCount(0);
  await expect(panel.getByTestId('speed-capped')).toHaveCount(0);

  // 20 ms: at most 15 mm/s keeps the blur at 0.3 mm – below the 40 mm/s "Normal" asks for here
  await field.fill('20');
  await expect(panel.getByTestId('speed-capped')).toContainText('15 mm/s');
  await expect(panel.getByTestId('blur-line')).toContainText('0,30 mm');
  // kept with the mode and the tempo, on this device
  const kept = await page.evaluate(() => localStorage.getItem('lowrider-control.scan'));
  expect(JSON.parse(kept!)).toMatchObject({ mode: 'strips', exposureMs: 20 });
  // a longer exposure runs slower than a run is worth: the panel says stops are faster
  await field.fill('100');
  await expect(panel.getByTestId('speed-capped')).toContainText('langsamer als 5 mm/s');
  // a short one does not hold a run back: the figure shows, the cap does not
  await field.fill('2');
  await expect(panel.getByTestId('speed-capped')).toHaveCount(0);
  await expect(panel.getByTestId('blur-line')).toBeVisible();
  // nonsense is no exposure
  await field.fill('-5');
  await field.blur();
  await expect(field).toHaveValue('0');
});

test('ending a strip scan: "Scan abbrechen" stops the run cleanly, PAUSE ends it with its reason', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    (window as unknown as Handle).lowriderMap.store().setMode('strips');
  });

  // Cancelled: the jog is ended by a jog cancel, the machine stands, nothing is left half done
  const cancelled = page.evaluate(() =>
    (window as unknown as Handle).lowriderMap
      .store()
      .scanArea({ minX: 100, minY: 100, maxX: 340, maxY: 200 }),
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Handle).lowriderSimulator.state), {
      timeout: 60_000,
    })
    .toBe('Jog');
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().cancelScan());
  expect(await cancelled).toBe(false);
  await expect(page.getByTestId('machine-state')).toContainText('Bereit', { timeout: 15_000 });
  expect(
    await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().scan),
  ).toBeNull();

  // Held by the operator's PAUSE: the scan says the controller was held, and does not send anything more
  const held = page.evaluate(() =>
    (window as unknown as Handle).lowriderMap
      .store()
      .scanArea({ minX: 100, minY: 100, maxX: 340, maxY: 200 }),
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Handle).lowriderSimulator.state), {
      timeout: 60_000,
    })
    .toBe('Jog');
  await page.getByTestId('pause').click();
  expect(await held).toBe(false);
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText('Die Steuerung wurde angehalten');
});

test('the panel offers both ways with their times side by side, and keeps the choice', async ({
  page,
}) => {
  await openDemo(page);
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  const section = page
    .locator('.section[data-fold]')
    .filter({ has: page.getByRole('heading', { name: 'Fläche scannen', exact: true }) });
  if ((await section.getAttribute('data-open')) === null) {
    await section.locator('[data-fold-trigger]').first().click();
  }
  const panel = page.getByTestId('photo-map-panel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('X von (mm)').fill('0');
  await panel.getByLabel('X bis (mm)').fill('600');
  await panel.getByLabel('Y von (mm)').fill('0');
  await panel.getByLabel('Y bis (mm)').fill('200');

  const minutesOf = async (id: string) =>
    Number(/etwa (\d+) min/.exec(await page.getByTestId(id).innerText())![1]);
  // By stops unless chosen otherwise: the pictures and minutes, nothing else
  await expect(page.getByTestId('scan-estimate')).toContainText('Bilder, etwa');
  await expect(page.getByTestId('scan-estimate-compare')).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Tempo der Fahrt' })).toHaveCount(0);
  // On the move: strips and minutes, and what it would take with stops
  await panel
    .getByRole('group', { name: 'Art des Scans' })
    .getByRole('button', { name: 'In Fahrt (schnell)' })
    .click();
  await expect(page.getByTestId('scan-estimate')).toContainText('Streifen, etwa');
  await expect(page.getByTestId('scan-estimate-compare')).toContainText('Mit Halt wären es');
  expect(await minutesOf('scan-estimate')).toBeLessThanOrEqual(
    await minutesOf('scan-estimate-compare'),
  );
  const normal = await minutesOf('scan-estimate');
  const tempo = panel.getByRole('group', { name: 'Tempo der Fahrt' });
  await tempo.getByRole('button', { name: 'Schnell' }).click();
  expect(await minutesOf('scan-estimate')).toBeLessThanOrEqual(normal);
  await tempo.getByRole('button', { name: 'Sanft' }).click();
  expect(await minutesOf('scan-estimate')).toBeGreaterThanOrEqual(normal);

  // With stops: the pictures and minutes as before, no second line, no tempo
  await panel
    .getByRole('group', { name: 'Art des Scans' })
    .getByRole('button', { name: 'Mit Halt (genau)' })
    .click();
  await expect(page.getByTestId('scan-estimate')).toContainText('Bilder, etwa');
  await expect(page.getByTestId('scan-estimate-compare')).toHaveCount(0);
  await expect(tempo).toHaveCount(0);
  // kept on this device
  expect(await page.evaluate(() => localStorage.getItem('lowrider-control.scan'))).toContain(
    '"stops"',
  );
});

test('a table with nothing to fit the pictures by: the run is given up at once, the area is scanned by stops, and not tried again until asked', async ({
  page,
}) => {
  test.setTimeout(400_000);
  await openDemo(page);
  const area = { minX: 900, minY: 600, maxX: 1200, maxY: 650 };
  await page.evaluate(() => {
    const w = window as unknown as Handle;
    w.lowriderMap.store().clear();
    w.lowriderMap.store().setMode('strips');
    w.lowriderCameraLag.ms = 300;
    w.lowriderCameraLag.jitterMs = 40;
    // out of focus: the fine texture of the board is gone, there is nothing to fit the pictures by
    w.lowriderCameraLag.blurPx = 14;
  });
  expect(await scan(page, area, false)).toBe(true);
  const first = await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!);
  expect(first.mode).toBe('strips');
  expect(first.gaveUp).toBe(true);
  // the probe cost seconds, not the whole run: well under what the same area costs in strips that fail
  expect(first.seconds).toBeLessThan(150);
  // and the area is covered all the same: the rest was scanned by stops
  const covered = await page.evaluate((a) => {
    const pic = (window as unknown as Handle).lowriderMap.picture();
    if (!pic) return 0;
    let n = 0;
    let ok = 0;
    for (let y = a.minY; y < a.maxY; y += 2) {
      for (let x = a.minX; x < a.maxX; x += 2) {
        const u = Math.floor((x - pic.left) * pic.pxPerMm);
        const v = Math.floor((pic.top - y) * pic.pxPerMm);
        n++;
        if (u >= 0 && v >= 0 && u < pic.width && v < pic.height && pic.valid[v * pic.width + u])
          ok++;
      }
    }
    return ok / n;
  }, area);
  expect(covered).toBeGreaterThan(0.97);

  // Not tried again: the next scan goes by stops from the start
  expect(await scan(page, area, false)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!.mode)).toBe(
    'stops',
  );
  // until the choice is made again
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().setMode('strips'));
  expect(await scan(page, area, false)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!.mode)).toBe(
    'strips',
  );
});

test('a recording of a stops scan and a strip scan with a late camera: one file with what the camera and the machine did', async ({
  page,
}, testInfo) => {
  test.setTimeout(400_000);
  await openDemo(page);
  await page.evaluate(() => {
    const w = window as unknown as Handle;
    w.lowriderMap.store().clear();
    w.lowriderMap.store().setMode('strips');
    w.lowriderMap.trace().setRecording(true);
    w.lowriderCameraLag.ms = 300;
    w.lowriderCameraLag.jitterMs = 40;
  });
  // by stops first: the pictures at rest are the ground truth of the strip scan that follows
  expect(await scan(page, AREA, true)).toBe(true);
  expect(await scan(page, AREA, false)).toBe(true);
  // the pictures are encoded in the background; saving waits for them
  const downloading = page.waitForEvent('download');
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.trace().save());
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^lowrider-scan-\d{8}-\d{6}\.zip$/);
  const out = process.env.TRACE_OUT ?? testInfo.outputPath('scan.zip');
  await download.saveAs(out);

  const zip = unzipSync(new Uint8Array(readFileSync(out)));
  const trace = JSON.parse(strFromU8(zip['trace.json']!)) as {
    format: string;
    scans: { n: number; mode: string }[];
    reports: { t: number; state: string }[];
    stamps: { t: number }[];
    frames: { file: string; kind: string; codec: string }[];
    events: { kind: string; frames?: { file: string }[]; anchors?: { file: string }[] }[];
    meta: Record<string, unknown>;
    dropped: number;
  };
  expect(trace.format).toBe('lowrider-scan-trace');
  expect(trace.scans.map((s) => s.mode)).toEqual(['stops', 'strips']);
  // the machine's reports, with the Jog of the runs in them, and a stamp for every new picture of the camera
  expect(trace.reports.length).toBeGreaterThan(40);
  expect(trace.reports.some((r) => r.state === 'Jog')).toBe(true);
  expect(trace.stamps.length).toBeGreaterThan(40);
  // the kinds of picture: at rest (stops and anchors), taken on the run, the dense series
  const count = (kind: string) => trace.frames.filter((f) => f.kind === kind).length;
  expect(count('rest')).toBeGreaterThan(5);
  expect(count('anchor')).toBeGreaterThanOrEqual(4);
  expect(count('run')).toBeGreaterThan(8);
  expect(count('dense')).toBeGreaterThan(40);
  expect(trace.frames.every((f) => f.codec === 'jpeg' && zip[f.file] !== undefined)).toBe(true);
  // what the solver was given and answered, pointing at pictures that are in the file
  const solved = trace.events.filter((e) => e.kind === 'solved');
  expect(solved.length).toBeGreaterThanOrEqual(1);
  for (const e of solved) {
    for (const f of [...e.anchors!, ...e.frames!]) expect(zip[f.file]).toBeDefined();
  }
  for (const kind of ['jog-send', 'jog-ok', 'jog-end', 'scan-start', 'scan-end']) {
    expect(
      trace.events.some((e) => e.kind === kind),
      kind,
    ).toBe(true);
  }
  // what the scans were made with – and no address of the Pi or of the controller
  expect(trace.meta).toMatchObject({ camera: { pxPerMm: 10 }, lagKnown: expect.any(Boolean) });
  const { userAgent, ...setup } = trace.meta;
  expect(typeof userAgent).toBe('string');
  expect(JSON.stringify(setup)).not.toMatch(/\d+\.\d+\.\d+\.\d+|http|ws:/);
  expect(trace.dropped).toBe(0);
});

test("a recording of a scan on the Pi's clock: both clocks of every report and picture in one file", async ({
  page,
}, testInfo) => {
  test.setTimeout(400_000);
  await openDemo(page);
  await page.evaluate(() => {
    const w = window as unknown as Handle;
    w.lowriderMap.store().clear();
    w.lowriderMap.store().setMode('strips');
    w.lowriderMap.trace().setRecording(true);
  });
  await lateCamera(page);
  await setPi(page, {
    offsetMs: HUGE_OFFSET_MS,
    linkMs: 60,
    linkJitterMs: 120,
    stampNoiseMs: 4,
    frameStampNoiseMs: 2,
  });
  await stampsArrive(page);
  // by stops first: the pictures at rest are the ground truth of the strip scan that follows
  expect(await scan(page, AREA, true)).toBe(true);
  expect(await scan(page, AREA, false)).toBe(true);
  expect((await stats(page)).clock).toBe('pi');
  const downloading = page.waitForEvent('download');
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.trace().save());
  const download = await downloading;
  const out = process.env.TRACE_OUT_PI ?? testInfo.outputPath('scan-pi.zip');
  await download.saveAs(out);

  const zip = unzipSync(new Uint8Array(readFileSync(out)));
  interface Stamp {
    domain: 'mono' | 'wall';
    t: number;
    source: string;
  }
  const trace = JSON.parse(strFromU8(zip['trace.json']!)) as {
    version: number;
    scans: { n: number; mode: string; options: { clock?: string } }[];
    reports: { t: number; state: string; stamp?: { mono: number; wall: number } }[];
    pictures: { t: number; scan: number; stamp: Stamp }[];
    frames: { file: string; kind: string; codec: string; stamp?: Stamp }[];
    events: {
      kind: string;
      clock?: string;
      frames?: { file: string; arrival?: number; stamp?: Stamp }[];
    }[];
    meta: Record<string, unknown>;
    dropped: number;
  };
  expect(trace.version).toBe(1);
  // which clock the scans ran on: the stops scan used none, the strip scan the Pi's
  expect(trace.meta.clock).toBe('pi');
  expect(trace.scans.map((x) => x.options.clock)).toEqual([undefined, 'pi']);
  expect(trace.events.filter((e) => e.kind === 'clock')).toMatchObject([
    { clock: 'pi', domain: 'mono', source: 'x-ustreamer-grab-time', reason: null },
  ]);
  // both clocks of every report: when the page got it, and the Pi's stamp – hours apart, as the simulated Pi's clock is
  const stamped = trace.reports.filter((r) => r.stamp);
  expect(stamped.length).toBeGreaterThan(40);
  // the link keeps the order, and so do the stamps: never a report older than the one before it
  stamped
    .slice(1)
    .forEach((r, i) => expect(r.stamp!.mono).toBeGreaterThan(stamped[i]!.stamp!.mono));
  for (const r of stamped.slice(0, 20)) {
    expect(r.stamp!.mono - r.t).toBeGreaterThan(HUGE_OFFSET_MS - 1000);
    expect(r.stamp!.wall).toBeGreaterThan(1.7e12);
  }
  // every picture the stream kept in a run: when the page got it and the stamp the Pi gave it
  expect(trace.pictures.length).toBeGreaterThan(10);
  for (const p of trace.pictures) {
    expect(p.stamp.domain).toBe('mono');
    expect(p.stamp.t * 1000 - p.t).toBeGreaterThan(HUGE_OFFSET_MS - 1000);
  }
  // the pictures of the run carry their stamp, and are in the file
  const run = trace.frames.filter((f) => f.kind === 'run');
  expect(run.length).toBeGreaterThan(8);
  expect(run.every((f) => f.stamp && f.codec === 'jpeg' && zip[f.file] !== undefined)).toBe(true);
  // what the solver was given and answered: on the Pi's clock, each picture with the stamp and when the page got it
  const solved = trace.events.filter((e) => e.kind === 'solved');
  expect(solved.length).toBeGreaterThanOrEqual(1);
  for (const e of solved) {
    expect(e.clock).toBe('pi');
    for (const f of e.frames!) {
      expect(zip[f.file]).toBeDefined();
      expect(f.stamp?.source).toBe('x-ustreamer-grab-time');
      expect(typeof f.arrival).toBe('number');
    }
  }
  // no address of the Pi or of the controller
  const { userAgent, ...setup } = trace.meta;
  expect(typeof userAgent).toBe('string');
  expect(JSON.stringify(setup)).not.toMatch(/\d+\.\d+\.\d+\.\d+|http|ws:/);
  expect(trace.dropped).toBe(0);
});
