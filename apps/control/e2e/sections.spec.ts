import { expect, test, type Page } from '@playwright/test';
import {
  connect,
  goTo,
  hold,
  installFakeFluidNC,
  jobView,
  numberIn,
  openApp,
  openDemo,
  stageMode,
  startJob,
} from './helpers';

// Parts longer than the table, on the simulated machine of the demo with its long board:
// 2.6 m of pine on a machine that travels 1.22 m in X. The example job – the side of a
// shelf, 2.48 m – is cut in three sections; in between the simulator's operator sticks two
// markers on the board and slides it along, a little off and slightly turned each time.
// Checked against what the simulated cutter really left on the board.

/** A cut on the long board, in the board's own coordinates (from its front left corner). */
interface Cut {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  /** Lowest point, machine Z (the surface is at −80) */
  z: number;
}

interface Sim {
  long: { x: number; y: number; angle: number };
  longTags: { id: number; x: number; y: number }[];
  longCuts(): { board: Cut[]; stray: Cut[] };
}

const longCuts = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { lowriderSimulator: Sim }).lowriderSimulator.longCuts(),
  );

const board = (page: Page) =>
  page.evaluate(() => {
    const sim = (window as unknown as { lowriderSimulator: Sim }).lowriderSimulator;
    return { place: { ...sim.long }, tags: sim.longTags.map((t) => ({ ...t })) };
  });

const rad = (deg: number) => (deg * Math.PI) / 180;
/** What the simulated machine does wrong (`SIM_ERRORS`), and how the long board lies (`SIM_LONG`). */
const MACHINE = { kx: 1.0015, ky: 0.9985, gamma: 0.08, angle: 0.3 };
/** The job's zero on the board (`DEMO_LONG.zero`). */
const ZERO = { x: 30, y: 40 };

/**
 * Where a point of the job lies on the board (the board's own coordinates). The job is turned
 * with the board; the simulated machine travels 0.15 % too far in X and too short in Y and
 * its Y leans a little – so the shelf side comes out 3.7 mm longer than drawn, all of a
 * piece. That is the machine's error (the calibration finds it), not the sections'.
 */
function onBoard(x: number, y: number) {
  const a = rad(MACHINE.angle);
  const g = rad(MACHINE.gamma);
  const cx = Math.cos(a) * x - Math.sin(a) * y;
  const cy = Math.sin(a) * x + Math.cos(a) * y;
  const px = MACHINE.kx * cx + MACHINE.ky * Math.sin(g) * cy;
  const py = MACHINE.ky * Math.cos(g) * cy;
  return {
    x: ZERO.x + Math.cos(a) * px + Math.sin(a) * py,
    y: ZERO.y - Math.sin(a) * px + Math.cos(a) * py,
  };
}

/** The job's X of a place on the board, near enough to look up a line there. */
const jobX = (boardX: number) => (boardX - ZERO.x) / MACHINE.kx;

/** The name of the program on the table, as the action bar of every step shows it. */
const fileName = (page: Page) => page.getByTestId('job-name');

/** Runs the loaded program from the (simulated) SD card to its end. */
async function cut(page: Page) {
  await startJob(page);
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 180_000 });
}

/** The demo with the long board on the table, the example on it and time running fast. */
async function openLongScene(page: Page) {
  await openDemo(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
  const card = page.getByTestId('simulator-card');
  // The first impression of the demo is the board; the long one is a switch away.
  await expect(card.getByRole('button', { name: 'Brett und Kalibriertafel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await card.getByRole('button', { name: 'Langes Brett' }).click();
  await expect(card).toContainText('Ein Brett von 2,6 m');
  await hold(page, /^Beispiel „Regalseite“ laden/);
  await goTo(page, 'Job');
  await expect(fileName(page)).toHaveText('regalseite_ausgerichtet.nc');
  await goTo(page, 'Einstellungen');
  await card.getByRole('button', { name: '50×' }).click();
}

/** The state of the flow as the table picture has it: "2/3:cut" (④ and ⑤ show 3D by themselves). */
async function tableState(page: Page) {
  const table = stageMode(page, 'Tisch');
  if ((await table.getAttribute('aria-pressed')) !== 'true') await table.click();
  return page.getByTestId('table-view').getAttribute('data-sections');
}

/** From a section that has just been cut to the next one, loaded: marks, slide, find. */
async function slideOn(page: Page, from: number) {
  await goTo(page, 'Job');
  const flow = page.getByTestId('sections-card');
  await expect(flow).toHaveAttribute('data-phase', 'marks', { timeout: 20_000 });
  await expect(flow.getByTestId('sections-marks')).toContainText(
    `Abschnitt ${from} ist gefräst. Bevor das Teil weitergeschoben wird, braucht es Passmarken:`,
  );
  // The simulator's operator has stuck two markers into the band.
  expect((await board(page)).tags.map((t) => t.id)).toEqual([7, 8]);
  await hold(page, /^Passmarken einmessen/);
  await expect(flow).toHaveAttribute('data-phase', 'slide', { timeout: 180_000 });
  return flow;
}

test('a part longer than the table: offered in the readiness list, cut in three sections that meet at the seams', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await openLongScene(page);

  // The job is 2.48 m long, the machine travels 1.22 m: the readiness list does not only
  // block, it says the way out.
  await jobView(page, 'Prüfen');
  const ready = page.getByTestId('readiness');
  const travel = ready.locator('[data-check="travel"]');
  await expect(travel).toHaveClass(/check-block/);
  await expect(travel.locator('.check-text')).toContainText(
    'Teil ist länger als der Tisch: Der Job verlässt den Verfahrweg in X',
  );
  await expect(page.getByTestId('sections-card')).toHaveCount(0);
  await travel.getByRole('button', { name: 'In Abschnitten fräsen' }).click();

  // Three sections, slid twice by 690 mm; the first is loaded and fits the travel.
  const flow = page.getByTestId('sections-card');
  await expect(flow.getByRole('heading')).toHaveText('In Abschnitten: regalseite');
  await expect(flow.getByTestId('sections-intro')).toContainText(
    'Es wird in 3 Abschnitten gefräst und dazwischen 2-mal um etwa 690 mm weitergeschoben (in Richtung −X, auf dem Tisch-Bild nach links)',
  );
  await expect(flow.getByTestId('sections-intro')).toContainText('die Passmarken');
  await expect(flow.locator('.flip-steps li')).toHaveText([
    '1Abschnitt 1',
    '2Schieben',
    '3Abschnitt 2',
    '4Schieben',
    '5Abschnitt 3',
  ]);
  await expect(flow.locator('.flip-steps li.current')).toHaveText('1Abschnitt 1');
  // The outline is the only thing too long for one section: its two long sides end at the seam.
  await expect(flow.getByTestId('sections-seam')).toContainText(
    'Naht bei X 884 mm (Strichpunktlinie auf dem Tisch-Bild): Dort enden 2 Schnitte',
  );
  await expect(fileName(page)).toHaveText('regalseite_abschnitt_1von3.nc');
  expect(await tableState(page)).toBe('1/3:cut');
  await expect(travel).toHaveClass(/check-ok/);
  await expect(ready.locator('[data-check="sections"]')).toHaveClass(/check-ok/);
  await expect(ready.locator('[data-check="sections"] .check-text')).toHaveText(
    'Abschnitt 1 von 3 eines Teils, das länger ist als der Tisch',
  );
  await expect(ready.locator('.check-block')).toHaveCount(0);

  // ---- Section 1 ----
  await cut(page);
  const first = (await longCuts(page)).board.length;
  expect(first).toBeGreaterThan(100);

  // ---- Slide 1 ----
  await slideOn(page, 1);
  await expect(flow.getByTestId('sections-measured')).toContainText('Marker 7 und 8 eingemessen');
  // Two markers some 400 mm apart, the next section reaching about 900 mm from them.
  const said = numberIn(
    /etwa ± (\S+) mm zu erwarten/.exec(
      await flow.getByTestId('sections-accuracy').innerText(),
    )?.[1] ?? null,
  );
  expect(said).toBeGreaterThan(0.2);
  expect(said).toBeLessThan(0.8);
  await expect(flow.getByTestId('sections-slide')).toContainText(
    'Teil etwa 690 mm nach links schieben (Richtung −X). Auf ein paar Zentimeter genau reicht',
  );
  expect(await tableState(page)).toBe('1/3:slide');
  const before = await board(page);
  await flow.getByRole('button', { name: 'Teil ist weitergeschoben und fest' }).click();
  await expect(flow).toHaveAttribute('data-phase', 'find');
  // The simulator's operator has slid the board: 14 mm short of 690, and turned by 0.35°.
  const after = await board(page);
  expect(after.place.angle - before.place.angle).toBeCloseTo(0.35, 6);
  // The section that is cut cannot be started again where the part no longer lies.
  await jobView(page, 'Prüfen');
  await expect(ready.locator('[data-check="sections"]')).toHaveClass(/check-block/);
  await expect(ready.locator('[data-check="sections"] .check-text')).toHaveText(
    'Abschnitt 1 ist gefräst und das Teil wird weitergeschoben – erst die Passmarken finden',
  );
  await expect(page.getByTestId('start-bar')).toContainText('Start gesperrt');

  await hold(page, /^Passmarken finden/);
  await expect(flow).toHaveAttribute('data-section', '2', { timeout: 180_000 });
  await expect(flow).toHaveAttribute('data-phase', 'cut');
  const found = await flow.getByTestId('sections-found').innerText();
  expect(Math.abs(numberIn(/: (\S+) mm geschoben/.exec(found)?.[1] ?? null) - 676)).toBeLessThan(
    1.5,
  );
  expect(Math.abs(numberIn(/, (\S+)° gedreht/.exec(found)?.[1] ?? null) - 0.35)).toBeLessThan(0.1);
  expect(numberIn(/passt auf (\S+) mm/.exec(found)?.[1] ?? null)).toBeLessThan(0.3);
  await expect(fileName(page)).toHaveText('regalseite_abschnitt_2von3.nc');
  expect(await tableState(page)).toBe('2/3:cut');
  await expect(ready.locator('[data-check="sections"]')).toHaveClass(/check-ok/);
  await expect(ready.locator('[data-check="travel"]')).toHaveClass(/check-ok/);
  await expect(ready.locator('.check-block')).toHaveCount(0);

  // ---- Section 2, slide 2, section 3 ----
  await cut(page);
  const second = (await longCuts(page)).board.length;
  await slideOn(page, 2);
  await flow.getByRole('button', { name: 'Teil ist weitergeschoben und fest' }).click();
  await hold(page, /^Passmarken finden/);
  await expect(flow).toHaveAttribute('data-section', '3', { timeout: 180_000 });
  await expect(fileName(page)).toHaveText('regalseite_abschnitt_3von3.nc');
  await cut(page);
  await goTo(page, 'Job');
  await expect(flow.getByTestId('sections-done')).toHaveText('Alle 3 Abschnitte sind gefräst.');

  // ---- What was really cut, in the board's own coordinates ----
  const { board: cuts, stray } = await longCuts(page);
  // Nothing beside the board.
  expect(stray).toEqual([]);
  const section = (i: number) => (i < first ? 1 : i < second ? 2 : 3);
  const all = cuts.map((c, i) => ({ ...c, section: section(i) }));

  // The 50 holes for the shelf pins (4 mm deep): each drilled once, where it belongs.
  const holes = all.filter((c) => c.x2 === undefined && c.z < -83.5);
  expect(holes).toHaveLength(50);
  let worstHole = 0;
  for (const y of [50, 170]) {
    for (let k = 0; k < 25; k++) {
      const pin = onBoard(100 + 96 * k, y);
      const near = holes.filter((h) => Math.hypot(h.x - pin.x, h.y - pin.y) < 3);
      expect(near, `hole ${k + 1} of the row at Y ${y}`).toHaveLength(1);
      const off = Math.hypot(near[0]!.x - pin.x, near[0]!.y - pin.y);
      // The first section's as exactly as the machine repeats (0.05 mm of play in X), the
      // later ones as well as the markers were measured.
      expect(off).toBeLessThan(near[0]!.section === 1 ? 0.15 : 0.5);
      worstHole = Math.max(worstHole, off);
    }
  }
  // Holes right and left of a seam are different sections' and still in one row.
  expect(new Set(holes.map((h) => h.section)).size).toBe(3);

  // The long sides of the outline (Y 0 and 220 of the job): cut in three pieces each.
  let worstSeam = 0;
  let worstEdge = 0;
  for (const side of [0, 220]) {
    /** How far a point of the board lies beside the side as drawn. */
    const beside = (x: number, y: number) => y - onBoard(jobX(x), side).y;
    const pieces = all.filter(
      (c) =>
        c.x2 !== undefined &&
        Math.abs(c.x2 - c.x) > 5 &&
        Math.abs(beside(c.x, c.y)) < 3 &&
        Math.abs(beside(c.x2, c.y2!)) < 3,
    );
    expect(pieces.map((p) => p.section).sort()).toEqual([1, 2, 3]);
    // Nowhere along the side does a cut lie beside the line: no section was cut askew.
    for (const p of pieces) {
      worstEdge = Math.max(worstEdge, Math.abs(beside(p.x, p.y)), Math.abs(beside(p.x2!, p.y2!)));
    }
    expect(worstEdge).toBeLessThan(0.5);
    // Without a gap from corner to corner (the corners are rounded: 12 mm in from each end).
    const spans = pieces
      .map((p) => [Math.min(p.x, p.x2!), Math.max(p.x, p.x2!)] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(spans[0]![0]).toBeLessThan(onBoard(12.5, side).x);
    expect(spans[2]![1]).toBeGreaterThan(onBoard(2467.5, side).x);
    for (const [k, seam] of [884, 1559].entries()) {
      // The earlier section ends at the seam, the later one starts 1 mm before it, in the
      // slot that is cut: they overlap by that millimetre, and no more.
      // The seam is a place along the machine's X; the job lies 0.3° askew to that, so on
      // the far side it meets the outline 1.2 mm further along the job.
      const a = rad(MACHINE.angle);
      const at = onBoard((seam + Math.sin(a) * side) / Math.cos(a), side).x;
      const [, end] = spans[k]!;
      const [start] = spans[k + 1]!;
      expect(Math.abs(end - at)).toBeLessThan(0.3);
      expect(end - start).toBeGreaterThan(0.5);
      expect(end - start).toBeLessThan(1.5);
      // Sideways the two cuts meet: where they overlap they lie on one line.
      const height = (s: number) => {
        const p = pieces.find((x) => x.section === s)!;
        const t = (at - 0.5 - p.x) / (p.x2! - p.x);
        return p.y + (p.y2! - p.y) * t;
      };
      const step = Math.abs(height(k + 1) - height(k + 2));
      expect(step).toBeLessThan(0.15);
      worstSeam = Math.max(worstSeam, step);
    }
  }

  // The grip slot at the first seam (X 884 ± 60 of the job) was cut whole by the first
  // section, the one at the second seam whole by the second: small things are not divided.
  for (const [k, x] of [884, 1559].entries()) {
    const middle = onBoard(x, 110);
    const grip = all.filter(
      (c) =>
        c.x2 !== undefined &&
        Math.abs(c.x - middle.x) < 62 &&
        Math.abs(c.y - middle.y) < 17 &&
        Math.abs(c.y2! - middle.y) < 17,
    );
    expect(grip.length).toBeGreaterThan(10);
    expect(new Set(grip.map((c) => c.section))).toEqual(new Set([k + 1]));
  }
  // For the record: what the simulator measured (in the report of the run).
  test.info().annotations.push({
    type: 'measured',
    description:
      `step at the seams ${worstSeam.toFixed(3)} mm, long sides off the line by at most ` +
      `${worstEdge.toFixed(3)} mm, pin holes by at most ${worstHole.toFixed(3)} mm`,
  });
});

/** A slot 1.8 m long with a hole near each end: longer than the 1 m the scripted machine travels in X. */
const LONG_PROGRAM = [
  'G21 G90',
  'G0 Z5',
  'M3 S18000',
  'G0 X100 Y100',
  'G1 Z-3 F300',
  'G0 Z5',
  'G0 X1700 Y100',
  'G1 Z-3 F300',
  'G0 Z5',
  'G0 X10 Y40',
  'G1 Z-2 F300',
  'G1 X1800 F1200',
  'G0 Z5',
  'M5',
  'M30',
].join('\n');

test('the sections survive a reload, and a part that lies wrong is refused with the reason', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  // The machine stands inside its travel, the work zero at X 50 / Y 50, Z 0 well below the top.
  const standing = (wcoX: number) =>
    `<Idle|MPos:100.000,100.000,-50.000,0.000|FS:0,0|WCO:${wcoX.toFixed(3)},50.000,-100.000,0.000>`;
  await page.addInitScript((status) => {
    (window as unknown as { __status: string }).__status = status;
  }, standing(50));
  await openApp(page);
  await connect(page);
  await goTo(page, 'Job');
  await page.getByTestId('file-input').setInputFiles({
    name: 'leiste.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from(LONG_PROGRAM),
  });
  await jobView(page, 'Prüfen');
  const ready = page.getByTestId('readiness');
  const travel = ready.locator('[data-check="travel"]');
  await expect(travel.locator('.check-text')).toContainText('Teil ist länger als der Tisch');
  await travel.getByRole('button', { name: 'In Abschnitten fräsen' }).click();
  const flow = page.getByTestId('sections-card');
  // The machine profile's travel in X is 3 … 1223: 1800 mm from X 50 take one slide of 660 mm.
  await expect(flow.getByTestId('sections-intro')).toContainText(
    'Es wird in 2 Abschnitten gefräst und dazwischen 1-mal um etwa 660 mm weitergeschoben',
  );
  await expect(fileName(page)).toHaveText('leiste_abschnitt_1von2.nc');
  await expect(travel).toHaveClass(/check-ok/);

  // The zero set 100 mm further right before anything is cut: the job is divided anew for it.
  await page.evaluate((status) => {
    (window as unknown as { __status: string }).__status = status;
  }, standing(150));
  await expect(flow.getByTestId('sections-intro')).toContainText('1-mal um etwa 760 mm');
  await expect(fileName(page)).toHaveText('leiste_abschnitt_1von2.nc');
  await expect(travel).toHaveClass(/check-ok/);

  // Ticked off by hand (it was cut before the app was closed): on to the marks.
  await flow.locator('[data-fold-trigger]').first().click();
  await flow.getByRole('button', { name: 'Weiter zum Schieben' }).click();
  await expect(flow).toHaveAttribute('data-phase', 'marks');
  // One marker is enough for a part on a fence.
  await expect(flow.getByTestId('sections-marks')).toContainText(
    'Zwei gedruckte Marker aufs Teil kleben',
  );
  await flow.getByRole('checkbox', { name: 'Das Teil liegt an einem geraden Anschlag' }).check();
  await expect(flow.getByTestId('sections-marks')).toContainText(
    'Einen gedruckten Marker (besser zwei) aufs Teil kleben',
  );

  // Reloaded: the flow is where it was – section 1 cut, the marks to be measured.
  await page.reload();
  await goTo(page, 'Job');
  await expect(flow).toHaveAttribute('data-phase', 'marks');
  await expect(flow.getByRole('heading')).toHaveText('In Abschnitten: leiste');
  await expect(
    flow.getByRole('checkbox', { name: 'Das Teil liegt an einem geraden Anschlag' }),
  ).toBeChecked();
  await expect(flow.locator('.flip-steps li.current')).toHaveText('2Schieben');

  // Ended (held: the rest of the part would have to be found by hand): the whole job is back.
  await connect(page);
  await goTo(page, 'Job');
  await hold(page, /^Abschnitte abbrechen/);
  await expect(flow).toHaveCount(0);
  await expect(fileName(page)).toHaveText('leiste.nc');

  // The zero where the beginning of the job would lie outside the travel: no sections, and why.
  await page.evaluate((status) => {
    (window as unknown as { __status: string }).__status = status;
  }, standing(-50));
  await jobView(page, 'Prüfen');
  await expect(travel.locator('.check-text')).toContainText('Teil ist länger als der Tisch');
  await travel.getByRole('button', { name: 'In Abschnitten fräsen' }).click();
  await expect(page.getByTestId('sections-refused')).toHaveText(
    'Der Anfang des Jobs liegt außerhalb des Verfahrwegs. Teil und Nullpunkt so legen, dass der Anfang erreichbar ist – das Ende darf überstehen.',
  );
  await page.getByTestId('sections-card').getByRole('button', { name: 'Schließen' }).click();
  await expect(page.getByTestId('sections-card')).toHaveCount(0);
  await expect(fileName(page)).toHaveText('leiste.nc');
});
