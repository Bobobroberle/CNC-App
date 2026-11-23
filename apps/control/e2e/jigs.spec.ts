import { expect, test, type Page } from '@playwright/test';
import {
  goTo,
  hold,
  jobView,
  numberIn,
  onStage,
  openApp,
  openDemo,
  stageTool,
  tableSpot,
  startJob,
} from './helpers';

// Jigs with printed markers, on the simulated machine of the demo with its jig scene: a
// dark frame that holds a coaster and carries two 40 mm markers (no. 1 and 2, the second
// stuck on a quarter turn round). The jig lies somewhere else every time it is put down.
// Recognised, measured, its job loaded with zero and rotation – checked against what the
// simulated cutter really left on the coaster.

/** A cut on the coaster, in the coaster's own coordinates: from its middle, x along the frame. */
interface Cut {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  /** Lowest point, machine Z (the surface is at −80) */
  z: number;
}

interface Sim {
  jig: { x: number; y: number; angle: number };
  mpos: { x: number; y: number; z: number };
  busy: boolean;
  wcs: Record<string, { x: number; y: number; z: number }>;
  jigCuts(): { blank: Cut[]; plate: Cut[]; stray: Cut[] };
  moveJig(to?: { x: number; y: number; angle: number }): void;
  fromJig(p: { x: number; y: number }): { x: number; y: number };
  commandedFor(p: { x: number; y: number }, z: number): { x: number; y: number };
}

const sim = (page: Page) =>
  page.evaluateHandle(() => (window as unknown as { lowriderSimulator: Sim }).lowriderSimulator);

const jigCuts = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { lowriderSimulator: Sim }).lowriderSimulator.jigCuts(),
  );

const jigAngle = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { lowriderSimulator: Sim }).lowriderSimulator.jig.angle,
  );

/** The box around grooves (not the single plunges). */
function box(cuts: Cut[]) {
  const grooves = cuts.filter((c) => c.x2 !== undefined);
  const xs = grooves.flatMap((c) => [c.x, c.x2!]);
  const ys = grooves.flatMap((c) => [c.y, c.y2!]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** The name of the program on the table, as the action bar of every step shows it. */
const fileName = (page: Page) => page.getByTestId('job-name');

const simCard = async (page: Page) => {
  await goTo(page, 'Einstellungen', 'Verbindung');
  return page.getByTestId('simulator-card');
};

/** The markers the table view shows, by number. */
async function tableTags(page: Page) {
  const text = (await page.getByTestId('table-view').getAttribute('data-tags')) ?? '';
  return text
    .split(';')
    .filter(Boolean)
    .map((entry) => Number(entry.split(':')[0]));
}

/** The demo with the jig on the table and time running fast. */
async function openJigScene(page: Page) {
  await openDemo(page);
  const card = await simCard(page);
  // The first impression of the demo is the board; the jig is a switch away.
  await expect(card.getByRole('button', { name: 'Brett und Kalibriertafel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('jig-card')).toHaveCount(0);
  await card.getByRole('button', { name: 'Vorrichtung mit Markern' }).click();
  await expect(card).toContainText('zwei Markern (Nr. 1 und 2, 40 mm)');
  await card.getByRole('button', { name: '50×' }).click();
  // The table picture is laid anew, and both markers are found on it (the connection's
  // area is a list without the picture: the table shows on the steps).
  await goTo(page, 'Job');
  await expect.poll(() => tableTags(page), { timeout: 15_000 }).toEqual([1, 2]);
}

/** Puts the jig down somewhere else, as between two jobs. */
async function moveJig(page: Page) {
  const card = await simCard(page);
  await card.getByRole('button', { name: 'Vorrichtung woanders hinlegen' }).click();
}

/** One hold: the camera measures the markers, the zero is set, the job loaded. */
async function measure(page: Page) {
  await goTo(page, 'Job');
  const card = page.getByTestId('jig-card');
  await hold(page, /^Einmessen und Job laden/);
  await expect(card.getByTestId('jig-placed')).toBeVisible({ timeout: 90_000 });
  return card;
}

/** Runs the loaded program from the (simulated) SD card to its end. */
async function cut(page: Page) {
  await startJob(page);
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 120_000 });
}

test('a jig taught before is recognised wherever it lies: one hold measures it, sets the zero and loads its job', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openJigScene(page);

  // The Job room says by itself what lies on the table, with one thing to do.
  await goTo(page, 'Job');
  const card = page.getByTestId('jig-card');
  const offer = card.getByTestId('jig-offer');
  await expect(offer).toHaveCount(1);
  await expect(offer.getByRole('heading')).toHaveText('Vorrichtung „Untersetzer-Rahmen“ erkannt');
  await expect(offer).toContainText('Die Kamera fährt über beide Marker');
  await expect(offer).toContainText('Die Höhe kennt ein Marker nicht');

  // Its job can be loaded from the list without measuring – then the start stays locked
  // until the jig has been measured where it lies.
  await jobView(page, 'Extras');
  const jigs = page.getByTestId('jigs-card');
  await jigs.locator('[data-fold-trigger]').first().click();
  await jigs.getByRole('button', { name: 'Job laden' }).click();
  await expect(fileName(page)).toHaveText('untersetzer.nc');
  await jobView(page, 'Prüfen');
  const unmeasured = page.getByTestId('readiness').locator('[data-check="jig"]');
  await expect(unmeasured).toHaveClass(/check-block/);
  await expect(unmeasured.locator('.check-text')).toHaveText(
    'Vorrichtung „Untersetzer-Rahmen“ ist in dieser Sitzung noch nicht eingemessen',
  );
  await expect(offer.getByRole('heading')).toHaveText(
    'Vorrichtung „Untersetzer-Rahmen“ ist noch nicht eingemessen',
  );

  // Measured at the crosshair: the job is loaded turned like the jig (3°), the X/Y zero set.
  await measure(page);
  const placed = card.getByTestId('jig-placed');
  await expect(placed.getByRole('heading')).toHaveText(
    'Vorrichtung „Untersetzer-Rahmen“ eingemessen',
  );
  expect(
    Math.abs(numberIn(/um (\S+)° mitgedreht/.exec(await placed.innerText())?.[1] ?? null) - 3),
  ).toBeLessThan(0.2);
  // Two markers 184 mm apart: a few tenths at the far corner of the coaster.
  await expect(page.getByTestId('jig-accuracy')).toContainText('etwa ± 0,2 mm');
  await expect(placed).toContainText('Als Nächstes: Z-Nullpunkt auf dem Werkstück setzen.');
  await expect(fileName(page)).toHaveText('untersetzer_vorrichtung.nc');
  await expect(card.getByTestId('jig-offer')).toHaveCount(0);

  // The readiness list carries it, and nothing blocks.
  await jobView(page, 'Prüfen');
  const ready = page.getByTestId('readiness');
  await expect(ready.locator('[data-check="jig"] .check-text')).toHaveText(
    'Vorrichtung „Untersetzer-Rahmen“ erkannt – Nullpunkt aus Marker',
  );
  await expect(ready.locator('[data-check="jig"]')).toHaveClass(/check-ok/);
  await expect(ready.locator('.check-block')).toHaveCount(0);

  // The zero set somewhere else by hand: the job no longer lies on the jig – blocked,
  // with the way back right there.
  await goTo(page, 'Einrichten', 'Nullpunkte');
  await page.getByRole('button', { name: 'XY = 0', exact: true }).click();
  await jobView(page, 'Prüfen');
  await expect(ready.locator('[data-check="jig"] .check-text')).toHaveText(
    'Der Nullpunkt wurde nach dem Einmessen der Vorrichtung „Untersetzer-Rahmen“ verschoben – neu einmessen',
  );
  await expect(ready.locator('[data-check="jig"]')).toHaveClass(/check-block/);
  await expect(page.getByTestId('start-bar')).toContainText('Start gesperrt');
  await hold(page, /^Einmessen Halten/);
  await expect(ready.locator('[data-check="jig"]')).toHaveClass(/check-ok/, { timeout: 90_000 });

  await cut(page);
  // The frame of the job (76 mm, engraved 1 mm deep) lies in the middle of the coaster and
  // along it; the small hole (2 mm deep) in the corner says which way round: 26 mm right
  // of the middle and 26 behind it. Nothing was cut beside the coaster.
  const first = await jigCuts(page);
  expect(first.stray).toEqual([]);
  expect(first.plate).toEqual([]);
  const b = box(first.blank);
  for (const edge of [b.minX + 38, b.maxX - 38, b.minY + 38, b.maxY - 38]) {
    expect(Math.abs(edge)).toBeLessThan(0.4);
  }
  const holes = first.blank.filter((c) => c.x2 === undefined && c.z < -81.5);
  expect(holes).toHaveLength(1);
  expect(Math.hypot(holes[0]!.x - 26, holes[0]!.y - 26)).toBeLessThan(0.4);

  // The jig taken off and put down again, a quarter turn round and somewhere else (the
  // simulator's third place: 92°). The table picture shows it there; the job on the table
  // no longer fits and says so.
  await moveJig(page);
  await moveJig(page);
  expect(await jigAngle(page)).toBe(92);
  await jobView(page, 'Prüfen');
  await expect(ready.locator('[data-check="jig"] .check-text')).toHaveText(
    'Vorrichtung „Untersetzer-Rahmen“ liegt woanders als beim Einmessen – neu einmessen',
    { timeout: 15_000 },
  );
  await expect(card.getByTestId('jig-offer').getByRole('heading')).toHaveText(
    'Vorrichtung „Untersetzer-Rahmen“ liegt woanders als beim Einmessen',
  );
  await measure(page);
  expect(
    Math.abs(
      numberIn(
        /um (\S+)° mitgedreht/.exec(await card.getByTestId('jig-placed').innerText())?.[1] ?? null,
      ) - 92,
    ),
  ).toBeLessThan(0.2);
  await cut(page);
  // Cut again on the same coaster: the second frame lies on the first, the second hole in
  // the first. A job turned the wrong way, or about the wrong point, would show as a hole
  // in another corner and a frame beside the first.
  const second = await jigCuts(page);
  expect(second.stray).toEqual([]);
  expect(second.plate).toEqual([]);
  const again = box(second.blank);
  for (const edge of [again.minX + 38, again.maxX - 38, again.minY + 38, again.maxY - 38]) {
    expect(Math.abs(edge)).toBeLessThan(0.5);
  }
  const allHoles = second.blank.filter((c) => c.x2 === undefined && c.z < -81.5);
  expect(allHoles.length).toBeGreaterThanOrEqual(1);
  for (const h of allHoles) expect(Math.hypot(h.x - 26, h.y - 26)).toBeLessThan(0.5);
});

test('a marker that is no longer where the table picture shows it: the app says so and does not guess', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openJigScene(page);
  // The jig is taken away and put down elsewhere without a new picture of the table: the
  // live picture no longer shows marker 1, the table picture still shows marker 2.
  await (await sim(page)).evaluate((s) => s.moveJig({ x: 700, y: 330, angle: 10 }));
  await goTo(page, 'Job');
  const card = page.getByTestId('jig-card');
  await expect.poll(() => tableTags(page), { timeout: 15_000 }).toEqual([2]);
  await expect(card.getByTestId('jig-offer')).toHaveCount(1);
  const before = await (await sim(page)).evaluate((s) => ({ ...s.wcs.G54! }));

  await hold(page, /^Einmessen und Job laden/);
  await expect(page.getByTestId('jig-trouble')).toHaveText(
    'Marker 2 ist nicht dort, wo er zuletzt gesehen wurde. Mit der Kamera über den Marker fahren oder den Tisch neu scannen.',
    { timeout: 60_000 },
  );
  // Nothing was set or loaded, and the stale sighting is gone: no offer without a marker.
  expect(await (await sim(page)).evaluate((s) => ({ ...s.wcs.G54! }))).toEqual(before);
  await expect(fileName(page)).toHaveText('demo-schild_ausgerichtet.nc');
  await expect(card.getByTestId('jig-offer')).toHaveCount(0);
  await expect.poll(() => tableTags(page)).toEqual([]);

  // A new picture of the table: the jig is found where it lies now.
  await moveJig(page);
  await goTo(page, 'Job');
  await expect(card.getByTestId('jig-offer')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId('jig-trouble')).toHaveCount(0);
});

test('teaching a jig: set up once, markers measured, named – then moved, recognised and cut in the same place', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openJigScene(page);

  // The jig the demo knows is deleted: its markers are unknown now, and the app offers
  // to teach them.
  await jobView(page, 'Extras');
  const jigs = page.getByTestId('jigs-card');
  await jigs.locator('[data-fold-trigger]').first().click();
  await expect(jigs.getByTestId('jig-row')).toContainText('Untersetzer-Rahmen');
  await expect(jigs.getByTestId('jig-row')).toContainText(
    'Marker 1 und 2 (40 mm), 184 mm auseinander',
  );
  await expect(jigs.getByTestId('jig-row')).toContainText('liegt auf dem Tisch');
  await hold(page, /^Löschen/);
  await expect(jigs.getByTestId('jig-row')).toHaveCount(0);
  await expect(jigs).toContainText('Noch keine Vorrichtung angelernt.');
  const card = page.getByTestId('jig-card');
  await expect(card.getByTestId('jig-unknown')).toContainText(
    'Marker 1 und 2 gesehen – sie gehören noch zu keiner Vorrichtung.',
  );

  // Set up as always. The job: a 40 × 16 frame around the zero, 1 mm deep, and a hole
  // 10 mm right of the zero – so the cuts tell which way round it lies.
  const program = [
    'G21 G90',
    'G0 Z5',
    'M3 S18000',
    'G0 X-20 Y-8',
    'G1 Z-1 F300',
    'G1 X20 Y-8 F1200',
    'G1 X20 Y8',
    'G1 X-20 Y8',
    'G1 X-20 Y-8',
    'G0 Z5',
    'G0 X10 Y0',
    'G1 Z-6 F300',
    'G0 Z5',
    'M5',
    'M30',
  ].join('\n');
  await page.getByTestId('file-input').setInputFiles({
    name: 'rahmen.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from(program),
  });
  await expect(fileName(page)).toHaveText('rahmen.nc');
  // The zero: the cutter driven to the middle of the coaster by a tap on the table.
  const middle = await (
    await sim(page)
  ).evaluate((s) => {
    const at = s.commandedFor(s.fromJig({ x: 110, y: 75 }), -50);
    return { x: at.x - s.wcs.G54!.x, y: at.y - s.wcs.G54!.y, mx: at.x, my: at.y };
  });
  await stageTool(page, 'Hinfahren').click();
  const spot = await tableSpot(page, middle);
  expect(await onStage(page, spot)).toBe(true);
  await page.mouse.click(spot.x, spot.y);
  await hold(page, /^Fräser hierhin/);
  // The zero is set only once the cutter has arrived and stands still.
  await expect
    .poll(
      async () =>
        (await sim(page)).evaluate(
          (s, to) => (s.busy ? 999 : Math.hypot(s.mpos.x - to.mx, s.mpos.y - to.my)),
          middle,
        ),
      { timeout: 30_000 },
    )
    .toBeLessThan(3);
  await expect(page.getByTestId('machine-state')).toContainText('Bereit');
  await page.waitForTimeout(500);
  await goTo(page, 'Einrichten', 'Nullpunkte');
  await page.getByRole('button', { name: 'XY = 0', exact: true }).click();

  // Teaching: three short steps. Everything is set up, both markers are in the list.
  await goTo(page, 'Job');
  await card.getByRole('button', { name: 'Vorrichtung anlernen' }).click();
  const teach = page.getByTestId('jig-teach');
  await expect(teach).toBeVisible();
  await expect(teach.locator('.flip-steps li.current')).toHaveText(/Marker einmessen/);
  await expect(teach).toContainText('Job „rahmen.nc“ ist geladen');
  await expect(teach).toContainText('X/Y-Nullpunkt ist gesetzt');
  await expect(teach).toContainText('Die Kamera sieht Marker 1 und 2');
  await expect(page.getByTestId('jig-forecast')).toContainText(
    'Zwei Marker weit auseinander geben auch den Winkel genau.',
  );
  // With one marker alone the app says what that costs.
  await teach.getByRole('button', { name: 'Marker 2', exact: true }).click();
  await expect(teach).toContainText('Die Kamera sieht Marker 1');
  await expect(page.getByTestId('jig-forecast')).toContainText(
    /etwa ± 0,[67] mm zu rechnen\. Ein einzelner kleiner Marker gibt den Winkel nur grob\./,
  );
  await teach.getByRole('button', { name: 'Marker 2', exact: true }).click();

  await hold(page, /^Marker einmessen/);
  await expect(page.getByTestId('jig-teach-measured')).toContainText(
    /Marker 1 und 2 eingemessen, 18[34],\d mm auseinander\./,
    { timeout: 90_000 },
  );
  await expect(teach.locator('.flip-steps li.current')).toHaveText(/Benennen/);
  await expect(teach).toContainText('Dazu 1 markierte(s) Spannmittel');
  await expect(teach.getByRole('button', { name: 'Vorrichtung speichern' })).toBeDisabled();
  await page.getByTestId('jig-name').fill('Rahmen klein');
  await teach.getByRole('button', { name: 'Vorrichtung speichern' }).click();
  await expect(teach).toHaveCount(0);
  await expect(jigs.getByTestId('jig-row')).toContainText('Rahmen klein');
  await expect(jigs.getByTestId('jig-row')).toContainText('rahmen.nc');

  // Renamed in the list.
  await jigs.getByRole('button', { name: 'Umbenennen' }).click();
  await jigs.getByLabel('Name der Vorrichtung').fill('Untersetzer klein');
  await jigs.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(jigs.getByTestId('jig-row').locator('strong')).toHaveText('Untersetzer klein');

  // As taught, the job counts as measured: nothing blocks, and it is cut once – that is
  // the place on the coaster every later cut has to hit.
  await jobView(page, 'Prüfen');
  const ready = page.getByTestId('readiness');
  await expect(ready.locator('[data-check="jig"] .check-text')).toHaveText(
    'Vorrichtung „Untersetzer klein“ erkannt – Nullpunkt aus Marker',
  );
  await expect(ready.locator('.check-block')).toHaveCount(0);
  await cut(page);
  const taught = await jigCuts(page);
  expect(taught.stray).toEqual([]);
  const want = box(taught.blank);
  // The frame lies about where the tap put it: around the middle of the coaster.
  expect(Math.abs((want.minX + want.maxX) / 2)).toBeLessThan(3);
  expect(Math.abs((want.minY + want.maxY) / 2)).toBeLessThan(3);
  expect(want.maxX - want.minX).toBeGreaterThan(39);
  const wantHole = taught.blank.find((c) => c.x2 === undefined && c.z < -85)!;

  // The jig put down somewhere else (−5.5°, then 92°): recognised by its markers, measured,
  // and the job lands where it did – checked against the first cut on the same coaster.
  for (const angle of [-5.5, 92]) {
    await moveJig(page);
    expect(await jigAngle(page)).toBe(angle);
    await goTo(page, 'Job');
    await expect(card.getByTestId('jig-offer').getByRole('heading')).toHaveText(
      'Vorrichtung „Untersetzer klein“ liegt woanders als beim Einmessen',
      { timeout: 15_000 },
    );
    await measure(page);
    // Taught at 3°: the job is turned by the difference.
    const said = await card.getByTestId('jig-placed').innerText();
    expect(
      Math.abs(numberIn(/um (\S+)° mitgedreht/.exec(said)?.[1] ?? null) - (angle - 3)),
    ).toBeLessThan(0.2);
    await expect(fileName(page)).toHaveText('rahmen_vorrichtung.nc');
    await jobView(page, 'Prüfen');
    await expect(ready.locator('[data-check="jig"]')).toHaveClass(/check-ok/);
    await expect(ready.locator('.check-block')).toHaveCount(0);
    await cut(page);
    const now = await jigCuts(page);
    expect(now.stray, `at ${angle}°`).toEqual([]);
    expect(now.plate, `at ${angle}°`).toEqual([]);
    const got = box(now.blank);
    // Every groove of every cut so far lies in the box of the first: the frames coincide.
    for (const key of ['minX', 'maxX', 'minY', 'maxY'] as const) {
      expect(Math.abs(got[key] - want[key]), `${key} at ${angle}°`).toBeLessThan(0.5);
    }
    const holes = now.blank.filter((c) => c.x2 === undefined && c.z < -85);
    for (const h of holes) {
      expect(Math.hypot(h.x - wantHole.x, h.y - wantHole.y), `hole at ${angle}°`).toBeLessThan(0.5);
    }
  }
});

test('the page markers are printed from: exact millimetres, a line to check the scale, number and name', async ({
  page,
}) => {
  await openApp(page);
  await goTo(page, 'Job');
  // Without a job the card stands under the SD card.
  const jigs = page.getByTestId('jigs-card');
  await jigs.locator('[data-fold-trigger]').first().click();
  await expect(jigs).toContainText('ein gedrucktes Kennzeichen, das die Kamera lesen kann');
  await jigs.getByRole('button', { name: 'Marker drucken' }).click();
  const sheet = page.getByTestId('tag-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Diese Linie muss 50 mm lang sein.');
  // Two markers of 40 mm by default, numbers 1 and 2.
  await expect(sheet.locator('.tag-figure')).toHaveCount(2);
  await expect(page.getByTestId('tag-1').locator('img')).toHaveAttribute('alt', 'Marker 1 · 40 mm');

  // On screen a CSS millimetre is 96/25.4 px: the line is 50 mm, the paper of a 40 mm
  // marker 51.43 mm (one white module around the dark square).
  const mm = 96 / 25.4;
  const ruler = (await page.getByTestId('tag-ruler').boundingBox())!;
  expect(Math.abs(ruler.width / mm - 52)).toBeLessThan(0.3);
  const tag = (await page.getByTestId('tag-1').locator('img').boundingBox())!;
  expect(Math.abs(tag.width / mm - 51.43)).toBeLessThan(0.3);

  // Another size, more of them, another first number, a name beside each.
  await sheet.getByRole('button', { name: '60 mm' }).click();
  await sheet.getByRole('button', { name: '4', exact: true }).click();
  await sheet.getByRole('button', { name: 'Ab Nummer +' }).click();
  await sheet.getByLabel('Name (wird dazugedruckt)').fill('Brettchen-Anschlag');
  await expect(sheet.locator('.tag-figure')).toHaveCount(4);
  await expect(page.getByTestId('tag-2').locator('img')).toHaveAttribute(
    'alt',
    'Marker 2 · 60 mm, Brettchen-Anschlag',
  );
  const large = (await page.getByTestId('tag-5').locator('img').boundingBox())!;
  expect(Math.abs(large.width / mm - 77.14)).toBeLessThan(0.3);

  // On paper only the sheet is there: the app and the controls are not printed.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();
  await expect(sheet.getByRole('button', { name: 'Drucken' })).toBeHidden();
  await expect(page.getByTestId('tag-page')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  // Each marker can be saved as an SVG for a label printer, in millimetres.
  const download = page.waitForEvent('download');
  await page.getByTestId('tag-2').getByRole('button', { name: 'Als SVG speichern' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('marker-2-60mm.svg');
  await sheet.getByRole('button', { name: 'Schließen' }).click();
  await expect(sheet).toHaveCount(0);
});
