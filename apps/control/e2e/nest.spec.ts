import { expect, test, type Locator, type Page } from '@playwright/test';
import { drawShape, goTo, inReach, moreOptions, openApp, rested } from './helpers';

/**
 * "Verschachteln": the selected parts packed onto the entered stock by their boxes – the boxes of the parts are read
 * from the table (`data-drawing-selected` is the box of what is selected). Three plates by hand:
 *   A: 80 × 50 at (300, 200)    B: 80 × 50 at (420, 250)    C: 60 × 40 at (350, 350)
 * The stock is entered in the Job room, as the operator does it.
 */

const table = (page: Page) => page.getByTestId('table-view');
const selectedBox = async (page: Page) =>
  ((await table(page).getAttribute('data-drawing-selected')) ?? '').split(',').map(Number);

/** Enters the stock (from the work zero) in the Job room and comes back to the drawing. */
async function enterStock(page: Page, x: number, y: number) {
  await goTo(page, 'Job');
  await moreOptions(page, 'workpiece');
  const material = page.getByTestId('setup-material');
  await material.getByLabel('Länge X (mm)').fill(String(x));
  await material.getByLabel('Breite Y (mm)').fill(String(y));
  await material.getByLabel('Dicke Z (mm)').fill('18');
  await material.getByRole('button', { name: /^Maße übernehmen/ }).click();
  await page.getByTestId('step-cam').click();
}

async function threePlates(page: Page) {
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const plate = (w: string, h: string, x: string, y: string) =>
    drawShape(page, 'Rechteck', {
      'Breite (mm)': w,
      'Höhe (mm)': h,
      'X links (mm)': x,
      'Y unten (mm)': y,
    });
  await plate('80', '50', '300', '200');
  await plate('80', '50', '420', '250');
  await plate('60', '40', '350', '350');
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(3);
  return cam;
}

/** The box of the part in row `n`, taken by selecting it alone (the drawing is not changed by looking) */
async function part(page: Page, n: number) {
  await page
    .getByTestId('cam-card')
    .getByRole('button', { name: new RegExp(`^${n}\\. `) })
    .click();
  return rested(page, () => selectedBox(page));
}
const parts = async (page: Page) => [await part(page, 1), await part(page, 2), await part(page, 3)];

/** The least room between two boxes along an axis (negative where they overlap) */
const apart = (a: number[], b: number[]) =>
  Math.max(b[0]! - a[2]!, a[0]! - b[2]!, b[1]! - a[3]!, a[1]! - b[3]!);

const nestButton = (cam: Locator) => cam.getByTestId('cam-nest');
const result = (cam: Locator) => cam.getByTestId('cam-nest-result');

test('packs three plates onto the stock with the room between them, says so in the card, and one undo gives them back', async ({
  page,
}) => {
  await openApp(page);
  const cam = await threePlates(page);
  await enterStock(page, 200, 120);
  const undo = cam.getByRole('button', { name: 'Rückgängig', exact: true });
  const before = await parts(page);
  expect(before).toEqual([
    [300, 200, 380, 250],
    [420, 250, 500, 300],
    [350, 350, 410, 390],
  ]);

  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Alles auswählen' }).click();
  const align = cam.getByTestId('cam-align');
  await expect(align).toBeVisible();
  // the words say what it is: the boxes, nothing interlocks
  await expect(align.getByTestId('cam-nest-hint')).toContainText('Rahmen der Teile');
  await expect(align.getByTestId('cam-nest-hint')).toContainText('nicht ineinander');
  // the gap meant when none is typed: the cutter and 2 mm, shown as the field's placeholder
  const gap = align.getByLabel('Abstand der Teile (mm)', { exact: true });
  await expect(gap).toHaveValue('');
  const room = Number(await gap.getAttribute('placeholder'));
  expect(room).toBeGreaterThan(2);
  // 80 + gap + 80 across and 50 + gap + 40 up must fit: the stock is 200 × 120
  expect(room).toBeLessThanOrEqual(30);

  const button = nestButton(cam);
  await expect(button).toBeEnabled();
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(47.5);
  await button.click();
  const line = result(cam);
  await expect(line).toContainText('3 Teile verschachtelt.');
  // (80 · 50 · 2 + 60 · 40) of 200 · 120 = 43 %
  await expect(line).toContainText('Die Rahmen belegen 43 % des Rohteils.');
  await expect(line.getByTestId('cam-nest-unplaced')).toHaveCount(0);
  // the result stands below the button: the button did not move under the finger
  expect(Math.abs((await button.boundingBox())!.y - box.y)).toBeLessThan(1.5);

  // the parts: all inside the stock (0…200 × 0…120) and at least the gap apart
  const after = await parts(page);
  for (const [i, p] of after.entries()) {
    expect(p[0], `part ${i + 1} left`).toBeGreaterThanOrEqual(-1e-6);
    expect(p[1], `part ${i + 1} bottom`).toBeGreaterThanOrEqual(-1e-6);
    expect(p[2], `part ${i + 1} right`).toBeLessThanOrEqual(200 + 1e-6);
    expect(p[3], `part ${i + 1} top`).toBeLessThanOrEqual(120 + 1e-6);
    // none was changed in size
    expect(p[2]! - p[0]!).toBeCloseTo(before[i]![2]! - before[i]![0]!, 6);
    expect(p[3]! - p[1]!).toBeCloseTo(before[i]![3]! - before[i]![1]!, 6);
  }
  expect(apart(after[0]!, after[1]!), 'A and B').toBeGreaterThanOrEqual(room - 1e-6);
  expect(apart(after[0]!, after[2]!), 'A and C').toBeGreaterThanOrEqual(room - 1e-6);
  expect(apart(after[1]!, after[2]!), 'B and C').toBeGreaterThanOrEqual(room - 1e-6);
  // packed to a corner: the left-most box is at the stock's edge, the lowest too
  expect(Math.min(...after.map((p) => p[0]!))).toBeCloseTo(0, 6);
  expect(Math.min(...after.map((p) => p[1]!))).toBeCloseTo(0, 6);

  // "Rückgängig" is the ordinary undo, and one step: every part where it was
  await cam.getByRole('button', { name: 'Alles auswählen', exact: true }).first().click();
  await expect(line).toContainText('3 Teile verschachtelt.');
  await undo.click();
  expect(await parts(page)).toEqual(before);
});

test('names the parts that do not fit and leaves them where they are – and the parts are not touched where nothing moves', async ({
  page,
}) => {
  await openApp(page);
  const cam = await threePlates(page);
  // 100 × 60: only the first plate (80 × 50) fits
  await enterStock(page, 100, 60);
  const before = await parts(page);
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Alles auswählen' }).click();
  await nestButton(cam).click();
  const line = result(cam);
  await expect(line).toContainText('1 Teil verschachtelt.');
  await expect(line.getByTestId('cam-nest-unplaced')).toHaveText(
    '2 Teile passen nicht auf das Rohteil und bleiben, wo sie waren: Rechteck 80 × 50 mm, Rechteck 60 × 40 mm.',
  );
  const after = await parts(page);
  expect(after[0]).toEqual([0, 0, 80, 50]);
  // the two without a place stand where they stood
  expect(after[1]).toEqual(before[1]);
  expect(after[2]).toEqual(before[2]);

  // the same again moves nothing: the answer says so, the parts stay, and no step is added to the undo – one
  // "Rückgängig" gives the three plates back as they were drawn
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Alles auswählen' }).click();
  await nestButton(cam).click();
  await expect(result(cam)).toContainText('Die Teile liegen schon so – nichts verschoben.');
  await expect(result(cam).getByTestId('cam-nest-unplaced')).toContainText('2 Teile passen nicht');
  expect(await parts(page)).toEqual(after);
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Alles auswählen' }).click();
  await cam.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  expect(await parts(page)).toEqual(before);
});

test('turns a part by 90° only where that is asked for, and the box after the turn is the one on the stock', async ({
  page,
}) => {
  await openApp(page);
  const cam = await threePlates(page);
  // 60 wide and 100 high: a plate of 80 × 50 fits only turned (50 × 80)
  await enterStock(page, 60, 100);
  await cam.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 1 zur Auswahl' }).click();
  await expect(cam.getByTestId('cam-selected')).toContainText('Rechteck 80 × 50 mm');
  // one part alone has nothing to align and nothing to pack: the first two plates, the same size, so the panel shows
  await cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' }).click();
  const rotate = cam.getByRole('checkbox', { name: 'Drehen erlaubt (nur 90°)' });
  await expect(rotate).not.toBeChecked();
  // each box is a full target
  expect(
    (await rotate.locator('xpath=ancestor::label').boundingBox())!.height,
  ).toBeGreaterThanOrEqual(47.5);
  await nestButton(cam).click();
  await expect(result(cam).getByTestId('cam-nest-unplaced')).toContainText('2 Teile passen nicht');
  await rotate.click();
  await expect(rotate).toBeChecked();
  await nestButton(cam).click();
  // one is turned and fits (50 × 80 in 60 × 100), the other has no room beside or above it
  await expect(result(cam)).toContainText('1 Teil verschachtelt.');
  await expect(result(cam).getByTestId('cam-nest-unplaced')).toContainText('1 Teil passt nicht');
  expect(await part(page, 1)).toEqual([0, 0, 50, 80]);
});

test('warns, naming the part, when a packed part lands on one that is not selected and stays – and again on the next tap', async ({
  page,
}) => {
  await openApp(page);
  const cam = await threePlates(page);
  // a fourth plate (60 × 40) lies on the stock across the corner where the first packed part will go – not wholly
  // inside its box, so it is no rider – and it is not selected: it stays
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '60',
    'Höhe (mm)': '40',
    'X links (mm)': '50',
    'Y unten (mm)': '30',
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(4);
  await enterStock(page, 200, 120);
  await cam.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 1 zur Auswahl' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' }).click();
  await nestButton(cam).click();
  const line = result(cam);
  await expect(line).toContainText('2 Teile verschachtelt.');
  const warning = line.getByTestId('cam-nest-overlapped');
  const words =
    'Achtung: 1 Teil, das liegen bleibt, überlappt ein verschachteltes Teil – beide würden ineinander gefräst: Rechteck 60 × 40 mm. Eines von beiden verschieben oder ausblenden.';
  await expect(warning).toHaveText(words);
  // what the words say is what the table shows: the first plate is at the corner of the stock, across the one that stayed
  const first = await part(page, 1);
  const stayed = await part(page, 4);
  expect(first).toEqual([0, 0, 80, 50]);
  expect(stayed).toEqual([50, 30, 110, 70]);
  expect(apart(first, stayed)).toBeLessThan(0);
  // the natural reaction to the warning is to tap "Verschachteln" again: nothing moves – and the warning stays, the
  // overlap being the drawing's, not the tap's (the plate that stays is no rider: it does not lie inside a packed box)
  await cam.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 1 zur Auswahl' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' }).click();
  await nestButton(cam).click();
  await expect(line).toContainText('Die Teile liegen schon so – nichts verschoben.');
  await expect(line.getByTestId('cam-nest-overlapped')).toHaveText(words);
  await expect(line).not.toContainText('Mitgenommen');
  expect(await part(page, 4)).toEqual([50, 30, 110, 70]);
});

test('is closed with its reason where no stock is entered – and says what to do', async ({
  page,
}) => {
  await openApp(page);
  const cam = await threePlates(page);
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Alles auswählen' }).click();
  const button = nestButton(cam);
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('data-reason', /Rohteil eingeben/);
  // nothing was packed
  expect(await parts(page)).toEqual([
    [300, 200, 380, 250],
    [420, 250, 500, 300],
    [350, 350, 410, 390],
  ]);
});

test('carries the hole of a plate with it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  // a plate 100 × 60 at (300, 200) with a hole of 10 in it at (320, 230), and a second plate – each its own thing
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '100',
    'Höhe (mm)': '60',
    'X links (mm)': '300',
    'Y unten (mm)': '200',
  });
  await drawShape(page, 'Kreis', {
    'Durchmesser (mm)': '10',
    'X Mitte (mm)': '320',
    'Y Mitte (mm)': '230',
  });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '50',
    'Höhe (mm)': '50',
    'X links (mm)': '500',
    'Y unten (mm)': '100',
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(3);
  await enterStock(page, 200, 100);
  // the plates are selected – the hole is not
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Auswahl aufheben' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 1 zur Auswahl' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 3 zur Auswahl' }).click();
  await nestButton(cam).click();
  await expect(result(cam)).toContainText('2 Teile verschachtelt.');
  await expect(result(cam)).toContainText('Mitgenommen, weil sie im Rahmen eines Teils liegen: 1.');
  // the plate is at the corner of the stock, the hole 20 and 30 from its corner – where it was in the plate
  expect(await part(page, 1)).toEqual([0, 0, 100, 60]);
  expect(await part(page, 2)).toEqual([15, 25, 25, 35]);
  // the second plate does not lie on the first
  const second = await part(page, 3);
  expect(second[0]).toBeGreaterThanOrEqual(100);
});

test('on the machine screen (800 × 600): in the sheet at its largest the button and its answer are in reach', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openApp(page);
  const cam = await threePlates(page);
  await enterStock(page, 200, 120);
  await page.locator('[data-slot="sheet-larger"]').click();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  await cam.getByRole('button', { name: 'Alles auswählen', exact: true }).first().click();
  const button = nestButton(cam);
  await button.scrollIntoViewIfNeeded();
  const container = page.locator('.panel-body');
  const reach = await inReach(page, button, container);
  expect(reach.inside).toBe(true);
  expect(reach.reached).toBe(true);
  expect(reach.box.height).toBeGreaterThanOrEqual(47.5);
  await button.click();
  await expect(result(cam)).toContainText('3 Teile verschachtelt.');
  // the sheet is not asked to move: it is still at its largest, and the answer can be scrolled to
  await result(cam).scrollIntoViewIfNeeded();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  await expect(result(cam)).toBeInViewport();
});

test('the quick search leads to the button, and does not press it', async ({ page }) => {
  await openApp(page);
  const cam = await threePlates(page);
  await enterStock(page, 200, 120);
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Alles auswählen' }).click();
  await page.keyboard.press('Control+k');
  await page.getByTestId('find-input').fill('verschachteln');
  const top = page.getByTestId('find-list').getByRole('option').first();
  await expect(top).toContainText('Verschachteln');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-find~="cam-nest"]')).toHaveClass(/found/);
  // the words of other names
  for (const word of ['nesting', 'zuschnitt', 'rohteil füllen']) {
    await page.keyboard.press('Control+k');
    await page.getByTestId('find-input').fill(word);
    await expect(page.getByTestId('find-list').getByRole('option').first()).toContainText(
      'Verschachteln',
    );
    await page.keyboard.press('Escape');
  }
  // nothing was packed by the search
  await expect(result(cam)).toHaveCount(0);
  expect(await part(page, 1)).toEqual([300, 200, 380, 250]);
});
