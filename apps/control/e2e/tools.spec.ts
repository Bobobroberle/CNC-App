import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  boardToWork,
  drawShape,
  goTo,
  hold,
  inReach,
  jobView,
  openApp,
  openDemo,
  seedTools,
} from './helpers';

/**
 * Several tools in one program, from the drawing: each part of the list has a field for its cutter ("Werkzeug von
 * Teil n"); where parts name more than one cutter the program is one program with a tool change between them (T and
 * M6, the cutters in its header) – and with one cutter it is the program it always was. Read from the program the
 * workspace saves, and – on the simulated machine – from what each cutter really left in the board.
 */

/** The program of the drawing as the workspace saves it. */
async function drawnProgram(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-card').getByRole('button', { name: 'Als .nc speichern' }).click();
  return readFileSync(await (await download).path(), 'utf8');
}

/** The lines of a program that change the cutter */
const changes = (text: string) => text.split('\n').filter((l) => /^T\d+ M6$/.test(l));

/** The cutter field of a part */
const field = (cam: Locator, n: number) =>
  cam.getByRole('combobox', { name: `Werkzeug von Teil ${n}` });

/** A plate (60 × 40, the outline) and a circle on it engraved along its line: the two parts every case starts from */
async function drawPlateAndCircle(page: Page) {
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '60', 'Höhe (mm)': '40' });
  await drawShape(page, 'Kreis', { 'X Mitte (mm)': '30', 'Y Mitte (mm)': '20' });
  await cam.getByLabel('Bearbeitung Kontur 2').selectOption('on');
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(2);
  return cam;
}

test('a part gets a V-bit: the program has two blocks with their tool changes; back to the drawing’s tool it has one – as before', async ({
  page,
}) => {
  await seedTools(page);
  await openApp(page);
  const cam = await drawPlateAndCircle(page);
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  const heights = () => rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));

  // The field is in the row of every part that is cut, a full target, "wie die Zeichnung" first and chosen
  for (const n of [1, 2]) {
    const select = field(cam, n);
    await expect(select).toBeVisible();
    const box = (await select.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(47.5);
    expect(box.width).toBeGreaterThanOrEqual(47.5);
    await expect(select).toHaveValue('');
    await expect(select.locator('option').first()).toHaveText(
      'Wie die Zeichnung (T1 Schaftfräser 8 mm, Ø 8,0)',
    );
  }
  // A V-bit is for engraving and drilling: for the outline it is listed, closed, with the reason in its label
  const vOfOutline = field(cam, 1).locator('option[value="v1"]');
  await expect(vOfOutline).toBeDisabled();
  await expect(vOfOutline).toContainText('nur Gravur und Bohren');
  await expect(field(cam, 2).locator('option[value="v1"]')).toBeEnabled();
  // A closed choice must not fade the field: it is drawn at full strength like any control (DESIGN.md §7: 4.5:1) –
  // a closed <option> is `:disabled` too, and the registry's `has-disabled` took the whole select down to 64 %
  for (const n of [1, 2]) {
    const fade = await field(cam, n).evaluate(
      (el) => getComputedStyle(el.closest('[data-slot="select-control"]')!).opacity,
    );
    expect(fade, `part ${n}`).toBe('1');
  }

  // One cutter: the program as it always was – no T word, no header of tools, no summary
  const plain = await drawnProgram(page);
  expect(changes(plain)).toEqual([]);
  expect(plain).not.toMatch(/^\(T\d/m);
  await expect(page.getByTestId('cam-tools-summary')).toHaveCount(0);

  // The V-bit for the engraved circle: the finger's place and the rows stay as they were
  const still = await heights();
  const before = (await field(cam, 2).boundingBox())!;
  await field(cam, 2).selectOption('v1');
  await expect(page.getByTestId('cam-tools-summary')).toBeVisible();
  await page.waitForTimeout(200);
  const after = (await field(cam, 2).boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThan(1.5);
  for (const [i, h] of (await heights()).entries())
    expect(Math.abs(h - still[i]!)).toBeLessThan(0.5);

  // Two blocks: the engraving first (the V-bit), the outline that frees the part last (the drawing's 8 mm cutter)
  const two = await drawnProgram(page);
  expect(changes(two)).toEqual(['T4 M6', 'T1 M6']);
  expect(two).toContain('(T4 D=3 V-Fräser 60°)');
  expect(two).toContain('(T1 D=8 Schaftfräser 8 mm)');
  expect(two).toContain('S12000 M3');
  expect(two).toMatch(/F600$/m);
  const summary = page.getByTestId('cam-tools-summary');
  await expect(summary).toContainText(
    '2 Werkzeuge in einem Programm: T4 V-Fräser 60° · T1 Schaftfräser 8 mm.',
  );
  await expect(summary).toContainText('Länge neu messen');
  // the V-bit has values of its own: no word of values; the Job room's card of the program says the tools
  await expect(page.getByTestId('cam-tools-values')).toHaveCount(0);

  // Back to the drawing's tool: one block, byte for byte the program of before
  await field(cam, 2).selectOption('');
  await expect(page.getByTestId('cam-tools-summary')).toHaveCount(0);
  expect(await drawnProgram(page)).toBe(plain);
});

test('a tool list a program cannot be made from: the card says why, no program – and it is there again once fixed', async ({
  page,
}) => {
  await seedTools(page);
  await openApp(page);
  const cam = await drawPlateAndCircle(page);
  await field(cam, 2).selectOption('v1');
  await expect(page.getByTestId('cam-tools-summary')).toBeVisible();
  // The tool list of the menu: the V-bit's number is given to a second tool (the library does not forbid it)
  await goTo(page, 'Werkzeugliste');
  const library = page.getByTestId('tool-library');
  await library
    .locator('tr', { hasText: 'Schaftfräser 6 mm' })
    .getByRole('button', { name: 'Ändern' })
    .click();
  await library.getByLabel('T-Nummer', { exact: true }).fill('4');
  await library.getByRole('button', { name: 'Speichern', exact: true }).click();
  await goTo(page, 'CAM');
  const notes = page.getByTestId('cam-tool-notes');
  await expect(notes).toContainText('Die Nummer T4 haben „V-Fräser 60°“ und „Schaftfräser 6 mm“');
  await expect(notes).toContainText('Es wird kein Programm gemacht');
  await expect(cam.getByTestId('cam-hand-over')).toBeDisabled();
  await expect(cam.getByRole('button', { name: 'Als .nc speichern' })).toBeDisabled();
  // Fixed in the list: the program is made anew by itself – the same one
  await goTo(page, 'Werkzeugliste');
  await library
    .locator('tr', { hasText: 'Schaftfräser 6 mm' })
    .getByRole('button', { name: 'Ändern' })
    .click();
  await library.getByLabel('T-Nummer', { exact: true }).fill('3');
  await library.getByRole('button', { name: 'Speichern', exact: true }).click();
  await goTo(page, 'CAM');
  await expect(page.getByTestId('cam-tool-notes')).toHaveCount(0);
  await expect(cam.getByTestId('cam-hand-over')).toBeEnabled();
  expect(changes(await drawnProgram(page))).toEqual(['T4 M6', 'T1 M6']);
});

test('the machine screen (800 × 600): the field and the summary are in reach in the sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await seedTools(page);
  await openApp(page);
  const cam = await drawPlateAndCircle(page);
  await page.locator('[data-slot="sheet-larger"]').click();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  const scroller = cam.locator('xpath=ancestor::*[contains(@class,"panel-body")][1]');
  const select = field(cam, 2);
  await select.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const where = await inReach(page, select, scroller);
  expect(where.inside && where.reached, JSON.stringify(where)).toBe(true);
  expect(where.box.height).toBeGreaterThanOrEqual(47.5);
  await select.selectOption('v1');
  const summary = page.getByTestId('cam-tools-summary');
  await summary.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const said = await inReach(page, summary, scroller);
  expect(said.inside, JSON.stringify(said)).toBe(true);
});

interface BoardCut {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r: number;
  z: number;
}
const boardCuts = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { lowriderSimulator: { boardCuts(): BoardCut[] } }
    ).lowriderSimulator.boardCuts(),
  );

test('on the simulated machine the two cutters cut as wide as they are: the engraving 3 mm, the outline 8 mm – the second part asks first', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openDemo(page);
  // The demo keeps its own libraries in memory: the V-bit is added in the tool list, with values of its own
  await goTo(page, 'Werkzeugliste');
  const library = page.getByTestId('tool-library');
  await library.getByRole('button', { name: 'Werkzeug hinzufügen' }).click();
  await library
    .getByRole('group', { name: 'Art' })
    .getByRole('button', { name: 'V-Nut', exact: true })
    .click();
  for (const [label, value] of Object.entries({
    'T-Nummer': '4',
    Name: 'V-Fräser 60°',
    'Durchmesser (mm)': '3',
    'Winkel (°, V-Nut/Fase)': '60',
    'Schneidenlänge (mm)': '10',
    'Drehzahl (U/min)': '12000',
    'Vorschub (mm/min)': '600',
    'Eintauchvorschub (mm/min)': '200',
    'Zustellung (mm)': '0,5',
  })) {
    await library.getByLabel(label, { exact: true }).fill(value);
  }
  await library.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(library.locator('tr', { hasText: 'V-Fräser 60°' })).toBeVisible();
  await goTo(page, 'Einstellungen', 'Verbindung');
  await page.getByTestId('simulator-card').getByRole('button', { name: '50×' }).click();
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  // A 120 × 60 plate at 60/60, cut out 3 mm deep, with a circle Ø 20 on it at 90/90 engraved with the V-bit
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '120',
    'Höhe (mm)': '60',
    'X links (mm)': '60',
    'Y unten (mm)': '60',
  });
  await drawShape(page, 'Kreis', { 'X Mitte (mm)': '90', 'Y Mitte (mm)': '90' });
  await cam.getByLabel('Bearbeitung Kontur 2').selectOption('on');
  await cam.getByLabel('Tiefe Kontur 1 (mm)').fill('3');
  // (the tool the app made has an id of its own: the field is told by what it says)
  await field(cam, 2).selectOption({ label: 'T4 V-Fräser 60° (Ø 3,0)' });
  // The demo's own program lies on the table: the drawing goes there on the tap (and not before)
  await cam.getByTestId('cam-show-drawing').click();
  const program = await drawnProgram(page);
  expect(changes(program)).toEqual(['T4 M6', 'T1 M6']);

  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();
  await expect(page.getByTestId('job-name')).toContainText('demo-schild.nc');
  // The job card names the cutters, the first one (the V-bit) first
  await jobView(page, 'Fertigen');
  await expect(page.getByTestId('run-parts')).toContainText('Teil 2 · T1');

  // Part 1: the engraving with the V-bit
  // (the first part follows no change: nothing is asked; at 50× it is done before a poll could see it run)
  await hold(page, /Teil 1\/2 starten \(T4\)/, 1300);
  await expect(page.getByTestId('start-confirm')).toHaveCount(0);
  const change = page.getByTestId('tool-change');
  await expect(change).toContainText('T1', { timeout: 90_000 });
  // Part 2 asks before it starts: is the length of the new cutter measured? (the second hold is the answer)
  await goTo(page, 'Fräsen');
  const goOn = change.getByRole('button', { name: /Teil 2\/2 starten/ });
  await expect(goOn).toBeEnabled();
  await hold(page, /Teil 2\/2 starten \(T1\)/, 1300);
  const asking = page.getByTestId('start-confirm');
  await expect(asking).toContainText('Werkzeug gewechselt – Länge neu gemessen?');
  await hold(page, /Trotzdem starten/, 1300);
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 120_000 });

  // What was cut: along the circle (10 mm round 90/90) the 3 mm cutter's width, elsewhere – the outline – the 8 mm one's
  const cuts = await boardCuts(page);
  const near = (c: BoardCut) =>
    [boardToWork(c.x, c.y), ...(c.x2 === undefined ? [] : [boardToWork(c.x2, c.y2!)])].every(
      (p) => Math.abs(Math.hypot(p.x - 90, p.y - 90) - 10) < 0.6,
    );
  const engraved = cuts.filter(near);
  const outline = cuts.filter((c) => !near(c));
  expect(engraved.length).toBeGreaterThan(8);
  expect(outline.length).toBeGreaterThan(8);
  expect(new Set(engraved.map((c) => c.r))).toEqual(new Set([1.5]));
  expect(new Set(outline.map((c) => c.r))).toEqual(new Set([4]));
});
