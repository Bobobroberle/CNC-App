import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { drawShape, openApp, rested, restingTable } from './helpers';

/**
 * The further basic shapes ("Weitere Grundformen": ellipse, star, gear, spiral) and the radius of each corner of a
 * rectangle: put on the table with one tap each, changed by the fields of the selection, cut as the other shapes are,
 * kept by a project file and found by the quick search. The table says what it shows in `data-drawing-selected` (the box
 * of the selection: left, bottom, right, top).
 */

const table = (page: Page) => page.getByTestId('table-view');
const selectedBox = async (page: Page) =>
  ((await table(page).getAttribute('data-drawing-selected')) ?? '').split(',').map(Number);
/** How wide and how high what is selected is */
const size = async (page: Page) => {
  const b = await rested(page, () => selectedBox(page));
  return [b[2]! - b[0]!, b[3]! - b[1]!];
};
/** The table says its numbers with one decimal: a size from two of them is right to 0.1 */
const near = (got: number[], want: number[], tolerance = 0.11) =>
  want.forEach((v, i) =>
    expect(Math.abs(got[i]! - v), `[${i}] of ${got}`).toBeLessThanOrEqual(tolerance),
  );

async function drawing(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  await restingTable(page);
  return page.getByTestId('cam-card');
}

/** The program of the drawing as the workspace saves it. */
async function program(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-card').getByRole('button', { name: 'Als .nc speichern' }).click();
  return readFileSync(await (await download).path(), 'utf8');
}

/** The project file the workspace saves. */
async function saved(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-project-save').click();
  return readFileSync(await (await download).path(), 'utf8');
}

/** Opens a fold of the card of the selection by its heading, if it is closed. */
async function unfold(fold: Locator, title: string) {
  const head = fold.getByRole('button', { name: title, exact: true });
  if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
}

test('four more shapes are folded away in the add card – one tap puts each on the table, selected', async ({
  page,
}) => {
  const cam = await drawing(page);
  const add = cam.getByTestId('cam-add');
  const more = cam.getByTestId('cam-shapes-more');
  // closed at first: the row of tiles has the five it had
  await expect(
    more.getByRole('button', { name: 'Weitere Grundformen', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  for (const name of ['Ellipse', 'Stern', 'Zahnrad', 'Spirale']) {
    await expect(add.getByRole('button', { name, exact: true })).toBeHidden();
  }
  await unfold(more, 'Weitere Grundformen');
  // every tile is a full target for a finger
  for (const name of ['Ellipse', 'Stern', 'Zahnrad', 'Spirale']) {
    const box = (await add.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.width, name).toBeGreaterThanOrEqual(47.5);
    expect(box.height, name).toBeGreaterThanOrEqual(47.5);
  }

  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  // Hand-checked at the size a tap puts them: ellipse 40 × 25 radii – 80 × 50; star of 5 tips on 30 and 12 – it
  // reaches 30·sin 72° = 28.53 to each side, 30 up and 30·cos 36° = 24.27 down; gear of 16 teeth on 30 – 60 × 60;
  // spiral of 4 turns from 2 to 30 – from x −26.52 to 30 and y −28.27 to 24.77
  await add.getByRole('button', { name: 'Ellipse', exact: true }).click();
  await expect(rows).toHaveCount(1);
  near(await size(page), [80, 50]);
  await add.getByRole('button', { name: 'Stern', exact: true }).click();
  await expect(rows).toHaveCount(2);
  near(await size(page), [57.06, 54.27]);
  await add.getByRole('button', { name: 'Zahnrad', exact: true }).click();
  await expect(rows).toHaveCount(3);
  near(await size(page), [60, 60]);
  await add.getByRole('button', { name: 'Spirale', exact: true }).click();
  await expect(rows).toHaveCount(4);
  near(await size(page), [56.52, 53.04]);

  // cut as the other shapes are: outside (with tabs) for the three closed ones, the spiral as a line
  const kind = (n: number) => cam.getByLabel(`Bearbeitung Kontur ${n}`, { exact: true });
  for (const n of [1, 2, 3]) await expect(kind(n)).toHaveValue('outside');
  await expect(kind(4)).toHaveValue('on');
  await expect(cam.getByRole('button', { name: 'Stege von Teil 4 einstellen' })).toHaveCount(0);
  await expect(cam.getByRole('button', { name: 'Stege von Teil 1 einstellen' })).toBeVisible();

  // and named in the list by what they are
  await expect(rows.nth(0)).toContainText('Ellipse 80 × 50 mm');
  await expect(rows.nth(1)).toContainText('Stern mit 5 Spitzen, Ø 60 mm');
  await expect(rows.nth(2)).toContainText('Zahnrad mit 16 Zähnen, Ø 60 mm');
  await expect(rows.nth(3)).toContainText('Spirale, 4 Windungen');

  // the fold is remembered: closed again, it stays so; a reload finds it as it was left
  await more.getByRole('button', { name: 'Weitere Grundformen', exact: true }).click();
  await expect(add.getByRole('button', { name: 'Stern', exact: true })).toBeHidden();
});

test('the numbers of a shape change it at once, one step of undo each – and a number beyond its range is drawn as the range holds it', async ({
  page,
}) => {
  const cam = await drawing(page);
  const selection = cam.getByTestId('cam-arrange');
  const undo = cam.getByRole('button', { name: 'Rückgängig', exact: true });

  await drawShape(page, 'Ellipse', { 'Radius X (mm)': '50' });
  near(await size(page), [100, 50]);
  await selection.getByLabel('Radius Y (mm)', { exact: true }).fill('20');
  near(await size(page), [100, 40]);
  await undo.click();
  near(await size(page), [100, 50]);

  await drawShape(page, 'Stern', {
    Spitzen: '8',
    'Außenradius (mm)': '40',
    'Innenradius (mm)': '16',
  });
  // 8 tips on 40: it reaches 40 up and down and 40 to each side – tips at 0°, 45°, 90°…
  near(await size(page), [80, 80]);
  await expect(cam.getByTestId('cam-contours')).toContainText('Stern mit 8 Spitzen, Ø 80 mm');
  // 99 tips: the star has the most there are, 32 – and the field says so
  await selection.getByLabel('Spitzen', { exact: true }).fill('99');
  await expect(selection.getByLabel('Spitzen', { exact: true })).toHaveValue('32');
  await expect(cam.getByTestId('cam-contours')).toContainText('Stern mit 32 Spitzen');
  // an inner radius beyond the outer one is the outer one
  await selection.getByLabel('Innenradius (mm)', { exact: true }).fill('70');
  await expect(selection.getByLabel('Innenradius (mm)', { exact: true })).toHaveValue('40');

  await drawShape(page, 'Zahnrad', { Zähne: '24', 'Fußradius (mm)': '26' });
  near(await size(page), [60, 60]);
  await expect(cam.getByTestId('cam-contours')).toContainText('Zahnrad mit 24 Zähnen');
  // fewer teeth than a gear can have are not taken
  await selection.getByLabel('Zähne', { exact: true }).fill('4');
  await expect(cam.getByTestId('cam-contours')).toContainText('Zahnrad mit 24 Zähnen');

  await drawShape(page, 'Spirale', {
    Windungen: '2,5',
    'Startradius (mm)': '0',
    'Endradius (mm)': '20',
  });
  await expect(cam.getByTestId('cam-contours')).toContainText('Spirale, 2,5 Windungen');
  // an open line: the program engraves it (1 mm deep), no tab, nothing the program calls a problem
  await expect(cam.getByTestId('cam-problems')).toHaveCount(0);
  expect(await program(page)).toContain('Z-1');
});

test('the radius of each corner of a rectangle: four numbers under "Ecken einzeln", the one for all says "verschieden"', async ({
  page,
}) => {
  const cam = await drawing(page);
  const selection = cam.getByTestId('cam-arrange');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '100', 'Höhe (mm)': '60' });
  const sharp = (await program(page)).split('\n').length;
  const all = selection.getByLabel('Eckenradius (mm)', { exact: true });
  await expect(all).toHaveValue('0');
  const fold = selection.getByTestId('cam-radii');
  // folded away until it is wanted
  await expect(fold.getByRole('button', { name: 'Ecken einzeln', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await unfold(fold, 'Ecken einzeln');
  const corner = (name: string) => fold.getByLabel(name, { exact: true });
  for (const name of [
    'Oben links (mm)',
    'Oben rechts (mm)',
    'Unten links (mm)',
    'Unten rechts (mm)',
  ]) {
    await expect(corner(name)).toHaveValue('0');
  }
  await corner('Oben links (mm)').fill('15');
  await corner('Unten rechts (mm)').fill('5');
  // the rectangle is the whole 100 × 60 still, with two corners rounded: more moves in the program
  near(await size(page), [100, 60]);
  await expect(all).toHaveValue('');
  await expect(all).toHaveAttribute('placeholder', 'verschieden');
  const rounded = (await program(page)).split('\n').length;
  expect(rounded).toBeGreaterThan(sharp);
  // each number was a step of undo of its own: the last one back, the other corner is still round
  await cam.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(corner('Unten rechts (mm)')).toHaveValue('0');
  await expect(corner('Oben links (mm)')).toHaveValue('15');
  // the one for all puts all four where it says
  await all.fill('7');
  for (const name of [
    'Oben links (mm)',
    'Oben rechts (mm)',
    'Unten links (mm)',
    'Unten rechts (mm)',
  ]) {
    await expect(corner(name)).toHaveValue('7');
  }
  // a radius is at most half of the shorter side
  await corner('Unten links (mm)').fill('500');
  await expect(corner('Unten links (mm)')).toHaveValue('30');
});

test('a drawing with the further shapes and a rectangle with its radii is kept by a project file and comes back as it was', async ({
  page,
}) => {
  const cam = await drawing(page);
  const selection = cam.getByTestId('cam-arrange');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '100', 'Höhe (mm)': '60' });
  await unfold(selection.getByTestId('cam-radii'), 'Ecken einzeln');
  await selection
    .getByTestId('cam-radii')
    .getByLabel('Oben rechts (mm)', { exact: true })
    .fill('12');
  await drawShape(page, 'Ellipse', { 'Radius X (mm)': '45', 'Radius Y (mm)': '20' });
  await drawShape(page, 'Stern', { Spitzen: '7' });
  await drawShape(page, 'Zahnrad', { Zähne: '18' });
  await drawShape(page, 'Spirale', { Windungen: '3' });
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  await expect(rows).toHaveCount(5);
  const before = await program(page);
  const text = await saved(page);
  const file = JSON.parse(text) as { items: { sketch: { type: string } }[] };
  expect(file.items.map((i) => i.sketch.type)).toEqual([
    'rect',
    'ellipse',
    'star',
    'gear',
    'spiral',
  ]);
  expect(file.items[0]!.sketch).toMatchObject({ radii: [0, 0, 12, 0] });

  // a fresh session opens it
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const again = page.getByTestId('cam-card');
  await again.getByTestId('cam-project-file').setInputFiles({
    name: 'formen.lowrider.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(again.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(5);
  expect(await program(page)).toBe(before);
  // the measures are the item's own again: the numbers are there, and the radii of the corners with them
  await again.getByRole('button', { name: /^1\. / }).click();
  const fold = again.getByTestId('cam-arrange').getByTestId('cam-radii');
  await unfold(fold, 'Ecken einzeln');
  await expect(fold.getByLabel('Oben rechts (mm)', { exact: true })).toHaveValue('12');
  await expect(fold.getByLabel('Oben links (mm)', { exact: true })).toHaveValue('0');
  await again.getByRole('button', { name: /^3\. / }).click();
  await expect(again.getByTestId('cam-arrange').getByLabel('Spitzen', { exact: true })).toHaveValue(
    '7',
  );
  await again.getByRole('button', { name: /^5\. / }).click();
  await expect(
    again.getByTestId('cam-arrange').getByLabel('Windungen', { exact: true }),
  ).toHaveValue('3');
});

test('a measure beyond the range of a star is drawn as the range holds it – the size stays what a star can be', async ({
  page,
}) => {
  const cam = await drawing(page);
  const selection = cam.getByTestId('cam-arrange');
  await drawShape(page, 'Stern', { 'Außenradius (mm)': '2000', 'Innenradius (mm)': '800' });
  await expect(selection.getByLabel('Außenradius (mm)', { exact: true })).toHaveValue('2000');
  // 9000 is beyond the largest radius (2500): the star is drawn with 2500 and the field says so
  const outer = selection.getByLabel('Außenradius (mm)', { exact: true });
  await outer.fill('9000');
  await expect(outer).toHaveValue('2500');
  await expect(cam.getByTestId('cam-contours')).toContainText('Stern mit 5 Spitzen, Ø 5.000 mm');
  // (the handles and a typed size hold the proportions at the end of the range: measured in the unit tests)
});

test('the quick search finds the shapes, the radii of the corners and nesting – and unfolds what hides them', async ({
  page,
}) => {
  const cam = await drawing(page);
  const palette = page.getByTestId('find');
  const rows = page.getByTestId('find-list').getByRole('option');
  const find = async (query: string, title: string) => {
    await page.keyboard.press('Control+k');
    await page.getByTestId('find-input').fill(query);
    const top = rows.first();
    await expect(top).toContainText(title);
    await page.keyboard.press('Enter');
    await expect(palette).toBeHidden();
  };

  // the tiles are folded away: the search unfolds them and shows the tile
  await expect(cam.getByRole('button', { name: 'Zahnrad', exact: true })).toBeHidden();
  await find('zahnrad', 'Zahnrad');
  const gear = page.locator('[data-find~="shape-gear"]');
  await expect(gear).toBeVisible();
  await expect(gear).toHaveClass(/found/);
  await find('spirale', 'Spirale');
  await expect(page.locator('[data-find~="shape-spiral"]')).toHaveClass(/found/);
  for (const [query, title] of [
    ['ellipse', 'Ellipse'],
    ['oval', 'Ellipse'],
    ['stern', 'Stern'],
  ] as const) {
    await find(query, title);
  }
  // the old names still lead where they led
  await find('langloch', 'Langloch');
  await expect(page.locator('[data-find~="shape-slot"]')).toHaveClass(/found/);

  // with a rectangle selected the radii are there, folded: the search unfolds them
  await drawShape(page, 'Rechteck');
  await expect(
    page.getByTestId('cam-radii').getByLabel('Oben links (mm)', { exact: true }),
  ).toBeHidden();
  await find('eckenradius', 'Ecken einzeln');
  await expect(page.locator('[data-find~="cam-radii"]')).toHaveClass(/found/);
  await expect(
    page.getByTestId('cam-radii').getByLabel('Oben links (mm)', { exact: true }),
  ).toBeVisible();

  // nothing was clicked for the operator: the drawing holds the one rectangle
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(1);
});
