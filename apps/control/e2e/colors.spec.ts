import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { drawShape, goTo, inReach, openApp, seedTools, tableSpot } from './helpers';

/**
 * Colour groups ("Farbgruppen"): four colours A–D, a part has at most one, and a colour holds the depth, the
 * direction, the cutter and the tab defaults its parts share – a part's own value goes over it. The choice is in
 * the card of the selection, what a colour sets in a folded card below the list, the colour on the table is the
 * letter and a line in the colour. Read from the program the workspace saves and from the page's own geometry.
 */

/** The program of the drawing as the workspace saves it. */
async function drawnProgram(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-card').getByRole('button', { name: 'Als .nc speichern' }).click();
  return readFileSync(await (await download).path(), 'utf8');
}

/** Every Z a program goes to */
const zs = (text: string) => [...text.matchAll(/\bZ(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
/** The lines of a program that change the cutter */
const changes = (text: string) => text.split('\n').filter((l) => /^T\d+ M6$/.test(l));

/** Two plates (60 × 40 and 30 × 30, side by side), the first selected last drawn: the second */
async function drawTwoPlates(page: Page) {
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '60', 'Höhe (mm)': '40' });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '30',
    'Höhe (mm)': '30',
    'X links (mm)': '100',
    'Y unten (mm)': '0',
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(2);
  return cam;
}

/** A plate and a circle on it engraved along its line */
async function drawPlateAndCircle(page: Page) {
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '60', 'Höhe (mm)': '40' });
  await drawShape(page, 'Kreis', { 'X Mitte (mm)': '30', 'Y Mitte (mm)': '20' });
  await cam.getByLabel('Bearbeitung Kontur 2').selectOption('on');
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(2);
  return cam;
}

/** The choice of the colour in the card of the selection */
const choice = (cam: Locator) =>
  cam.getByTestId('cam-arrange').getByRole('combobox', { name: 'Farbe', exact: true });
/** The row of the nth part: its name takes it alone into the selection (a tap on the one selected lets go of it) */
async function pick(cam: Locator, n: number) {
  const name = cam
    .getByTestId('cam-contours')
    .getByRole('button', { name: new RegExp(`^${n}\\. `) });
  if ((await name.getAttribute('aria-pressed')) !== 'true') await name.click();
  await expect(name).toHaveAttribute('aria-pressed', 'true');
}
const rows = (cam: Locator) => cam.getByTestId('cam-contours').getByRole('listitem');
const heights = (cam: Locator) =>
  rows(cam).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
const tops = (cam: Locator) =>
  rows(cam).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));

/** Unfolds the card "Farbgruppen" (it is folded until it is opened once) */
async function openColors(cam: Locator) {
  const fold = cam.getByTestId('cam-colors');
  const trigger = fold.getByRole('button', { name: 'Farbgruppen', exact: true });
  if ((await trigger.getAttribute('aria-expanded')) === 'false') await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return fold;
}
const colourField = (cam: Locator, name: string) =>
  cam.getByTestId('cam-colors').getByRole('textbox', { name, exact: true });

test('a colour gives its parts one depth, a part with a depth of its own keeps it – and a colour that sets nothing changes nothing', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawTwoPlates(page);
  const plain = await drawnProgram(page);
  expect(Math.min(...zs(plain))).toBe(-6);

  // Both parts get colour A: it sets nothing yet, so the program is the one of before – byte for byte
  await cam.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await choice(cam).selectOption('a');
  await expect(page.getByTestId('cam-color-pill')).toHaveCount(2);
  expect(await drawnProgram(page)).toBe(plain);

  // A depth for the colour: every part of it is cut to it
  await openColors(cam);
  await colourField(cam, 'Tiefe (mm) von Farbe A').fill('3');
  const three = await drawnProgram(page);
  expect(three).not.toBe(plain);
  expect(Math.min(...zs(three))).toBe(-3);
  expect(zs(three)).not.toContain(-6);
  // the rows show it as what they are cut to where they have no depth of their own
  await expect(cam.getByLabel('Tiefe Kontur 1 (mm)')).toHaveAttribute('placeholder', '3');
  await expect(cam.getByLabel('Tiefe Kontur 2 (mm)')).toHaveAttribute('placeholder', '3');

  // A part with a depth of its own keeps it: the second part 4 mm, the first still the colour's 3
  await cam.getByLabel('Tiefe Kontur 2 (mm)').fill('4');
  const own = zs(await drawnProgram(page));
  expect(own).toContain(-3);
  expect(own).toContain(-4);
  expect(Math.min(...own)).toBe(-4);
  expect(own).not.toContain(-6);

  // Taking its own away brings the colour's back; giving the colour up brings the drawing's
  await cam.getByLabel('Tiefe Kontur 2 (mm)').fill('');
  expect(Math.min(...zs(await drawnProgram(page)))).toBe(-3);
  await cam.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await choice(cam).selectOption('');
  await expect(page.getByTestId('cam-color-pill')).toHaveCount(0);
  expect(await drawnProgram(page)).toBe(plain);
});

test('a colour with another cutter makes two blocks with a tool change; back to the drawing’s cutter it is one – as before', async ({
  page,
}) => {
  await seedTools(page);
  await openApp(page);
  const cam = await drawPlateAndCircle(page);
  const plain = await drawnProgram(page);
  expect(changes(plain)).toEqual([]);

  // The circle (part 2, engraved) gets colour B, and the colour the V-bit
  await pick(cam, 2);
  await choice(cam).selectOption('b');
  await openColors(cam);
  const tool = cam
    .getByTestId('cam-colors')
    .getByRole('combobox', { name: 'Werkzeug von Farbe B', exact: true });
  await expect(tool.locator('option').first()).toHaveText(
    'Wie die Zeichnung (T1 Schaftfräser 8 mm (Ø 8,0))',
  );
  await tool.selectOption('v1');
  await expect(page.getByTestId('cam-tools-summary')).toContainText(
    '2 Werkzeuge in einem Programm: T4 V-Fräser 60° · T1 Schaftfräser 8 mm.',
  );
  const two = await drawnProgram(page);
  // the engraving first (the V-bit), the outline that frees the part last (the drawing's cutter) – two blocks
  expect(changes(two)).toEqual(['T4 M6', 'T1 M6']);
  expect(two).toContain('(T4 D=3 V-Fräser 60°)');
  expect(two).toContain('S12000 M3');
  // the row of the part names what it is cut with: the colour's cutter
  await expect(
    cam
      .getByRole('combobox', { name: 'Werkzeug von Teil 2', exact: true })
      .locator('option')
      .first(),
  ).toHaveText('Wie Farbe B (T4 V-Fräser 60°, Ø 3,0)');

  // A part that names its own cutter keeps it: the drawing's cutter for the circle makes one block again
  await cam.getByRole('combobox', { name: 'Werkzeug von Teil 2', exact: true }).selectOption('t1');
  expect(changes(await drawnProgram(page))).toEqual([]);
  await cam.getByRole('combobox', { name: 'Werkzeug von Teil 2', exact: true }).selectOption('');
  expect(changes(await drawnProgram(page))).toEqual(['T4 M6', 'T1 M6']);

  // The colour back to "wie die Zeichnung": the program of before, byte for byte
  await tool.selectOption('');
  await expect(page.getByTestId('cam-tools-summary')).toHaveCount(0);
  expect(await drawnProgram(page)).toBe(plain);
});

test('the card lists the colours in use below the list – closed until opened once – and a colour changes no row', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawTwoPlates(page);
  const fold = cam.getByTestId('cam-colors');
  const trigger = fold.getByRole('button', { name: 'Farbgruppen', exact: true });

  // Below the list, folded, no colour in use: it says how to give one
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const list = (await cam.getByTestId('cam-contours').boundingBox())!;
  const at = (await trigger.boundingBox())!;
  expect(at.y).toBeGreaterThanOrEqual(list.y + list.height - 0.5);
  expect(at.height).toBeGreaterThanOrEqual(47.5);
  await openColors(cam);
  await expect(fold).toContainText('Noch keine Farbe vergeben');
  await expect(page.getByTestId('cam-color-a')).toHaveCount(0);

  // Giving a part a colour changes no row: not a height, not a place – the mark is a fixed size beside the name
  await pick(cam, 1);
  const before = { heights: await heights(cam), tops: await tops(cam) };
  await choice(cam).selectOption('a');
  const pill = page.getByTestId('cam-color-pill');
  await expect(pill).toHaveCount(1);
  await expect(pill).toHaveAttribute('aria-label', 'Farbe A, Orange');
  await expect(pill).toHaveText('A');
  const mark = (await pill.boundingBox())!;
  expect(mark.width).toBeLessThan(40);
  expect(mark.height).toBeLessThan(40);
  await page.waitForTimeout(150);
  for (const [i, h] of (await heights(cam)).entries()) {
    expect(Math.abs(h - before.heights[i]!), `row ${i + 1}`).toBeLessThan(0.5);
  }
  for (const [i, top] of (await tops(cam)).entries()) {
    expect(Math.abs(top - before.tops[i]!), `row ${i + 1}`).toBeLessThan(0.5);
  }
  // only the colour in use is listed
  await expect(page.getByTestId('cam-color-a')).toBeVisible();
  await expect(page.getByTestId('cam-color-b')).toHaveCount(0);
  await expect(page.getByTestId('cam-color-a-count')).toHaveText('Teile: 1');

  // A second colour for the other part – and a colour in use by several parts counts them – hidden ones too
  await pick(cam, 2);
  await choice(cam).selectOption('b');
  await expect(page.getByTestId('cam-color-b')).toBeVisible();
  await cam.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await expect(choice(cam)).toHaveValue('mixed');
  await choice(cam).selectOption('c');
  await expect(page.getByTestId('cam-color-c-count')).toHaveText('Teile: 2');
  await expect(page.getByTestId('cam-color-a')).toHaveCount(0);
  await cam.getByRole('button', { name: 'Teil 2 ausblenden' }).click();
  await expect(page.getByTestId('cam-color-c-count')).toHaveText(
    'Teile: 2 · davon ausgeblendet: 1',
  );
  // a hidden part keeps its colour (the letter stays in its row)
  await expect(pill).toHaveCount(2);

  // Every control of the card is a full target; the number pad comes by `inputMode` as everywhere
  const card = page.getByTestId('cam-color-c');
  for (const control of [
    card.getByRole('textbox', { name: 'Tiefe (mm) von Farbe C', exact: true }),
    card.getByRole('textbox', { name: 'Gravurtiefe (mm) von Farbe C', exact: true }),
    card.getByRole('combobox', { name: 'Laufrichtung von Farbe C', exact: true }),
    card.getByRole('combobox', { name: 'Werkzeug von Farbe C', exact: true }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(47.5);
    expect(box.width).toBeGreaterThanOrEqual(47.5);
  }
  await expect(
    card.getByRole('textbox', { name: 'Tiefe (mm) von Farbe C', exact: true }),
  ).toHaveAttribute('inputmode', 'decimal');
  // …and the tab defaults under "Mehr Optionen"
  await card.getByTestId('depth-more-camColorC').locator('[data-fold-trigger]').first().click();
  for (const name of [
    'Anzahl Stege von Farbe C',
    'Stegbreite (mm) von Farbe C',
    'Steghöhe (mm) von Farbe C',
  ]) {
    const field = card.getByRole('textbox', { name });
    await expect(field).toHaveAttribute('inputmode', 'decimal');
    expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  }
  // The choice itself is a full target too
  const select = (await choice(cam).boundingBox())!;
  expect(select.height).toBeGreaterThanOrEqual(47.5);

  // Folded again and opened on the next visit as it was left
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('the tab defaults of a colour reach the parts: the places on the table and in the program, the panel of a part shows them', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawTwoPlates(page);
  await pick(cam, 1);
  const tabs = async () =>
    (await page.getByTestId('table-view').getAttribute('data-drawing-tabs')) ?? '[]';
  const count = async () =>
    (JSON.parse(await tabs()) as { item: number; sites: unknown[] }[])[0]?.sites.length ?? 0;
  await expect.poll(count).toBe(4);
  await choice(cam).selectOption('a');
  await openColors(cam);
  await page
    .getByTestId('cam-color-a')
    .getByTestId('depth-more-camColorA')
    .locator('[data-fold-trigger]')
    .first()
    .click();
  await colourField(cam, 'Anzahl Stege von Farbe A').fill('2');
  await expect.poll(count).toBe(2);
  // the panel of the part: the colour's count is what it follows (the placeholder), its own value goes over it
  await cam.getByTestId('cam-tabs-open').first().click();
  const panel = cam.getByTestId('cam-tabs');
  await expect(panel.getByRole('textbox', { name: 'Anzahl', exact: true })).toHaveAttribute(
    'placeholder',
    '2',
  );
  await panel.getByRole('textbox', { name: 'Anzahl', exact: true }).fill('3');
  await expect.poll(count).toBe(3);
});

test('the colour on the table: the letter at the part and a line in the colour – the selection over it, the others as ever', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawTwoPlates(page);
  const table = page.getByTestId('table-view');
  await pick(cam, 1);
  await choice(cam).selectOption('a');
  // the parts of the colour are told to the table; the selected one carries no letter (its handles sit there)
  await page.getByRole('button', { name: 'Auswahl aufheben' }).click();
  const colors = async () =>
    JSON.parse((await table.getAttribute('data-drawing-colors')) ?? 'null') as
      | { color: string; parts: number[] }[]
      | null;
  await expect.poll(colors).toEqual([{ color: 'a', parts: [expect.any(Number)] }]);

  // The line of the part in the plate's colour: orange (the dark theme's A), along the lower edge (away from the
  // tab in the middle of it) – read from the picture itself. The plate lies at 0…60 × 0…40, the other at 100…130.
  const orange = { r: 251, g: 146, b: 60 };
  const found = async (x: number, y: number, rgb: { r: number; g: number; b: number }) => {
    const spot = await tableSpot(page, { x, y });
    return page.getByTestId('stage-canvas').evaluate(
      (c: HTMLCanvasElement, args) => {
        const r = c.getBoundingClientRect();
        const k = c.width / r.width;
        const px = Math.round((args.spot.x - r.left) * k);
        const py = Math.round((args.spot.y - r.top) * k);
        const w = 11;
        const d = c.getContext('2d')!.getImageData(px - 5, py - 5, w, w).data;
        let hits = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (
            Math.abs(d[i]! - args.rgb.r) < 24 &&
            Math.abs(d[i + 1]! - args.rgb.g) < 24 &&
            Math.abs(d[i + 2]! - args.rgb.b) < 24
          ) {
            hits += 1;
          }
        }
        return hits;
      },
      { spot, rgb },
    );
  };
  await expect.poll(() => found(45, 0, orange)).toBeGreaterThan(0);
  // …and the other plate, with no colour, has none of it along its edge
  expect(await found(107, 0, orange)).toBe(0);
  // The colour a part gets is its letter's: give the second part B and the letters are two
  await pick(cam, 2);
  await choice(cam).selectOption('b');
  await page.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await expect.poll(async () => (await colors())?.map((c) => c.color)).toEqual(['a', 'b']);
  const lime = { r: 163, g: 230, b: 53 };
  await expect.poll(() => found(107, 0, lime)).toBeGreaterThan(0);
  expect(await found(45, 0, lime)).toBe(0);
  // A hidden part is grey and dashed again – its colour is not drawn (the letter stays in the list)
  await cam.getByRole('button', { name: 'Teil 1 ausblenden' }).click();
  await expect.poll(() => found(45, 0, orange)).toBe(0);
  await expect(page.getByTestId('cam-color-pill')).toHaveCount(2);
  // Colours exist only in the drawing: the look of the 3D picture and of the run is the one it was
  await goTo(page, 'Fräsen');
  await expect(page.getByTestId('table-view')).toHaveCount(0);
});

test('undo brings the colour and what it set back – step by step – and redo takes them forward again', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawTwoPlates(page);
  const plain = await drawnProgram(page);
  await pick(cam, 1);
  await choice(cam).selectOption('a');
  await openColors(cam);
  await colourField(cam, 'Tiefe (mm) von Farbe A').fill('3');
  const three = await drawnProgram(page);
  // (the colour's part is cut to 3 mm; the other plate has no colour and goes on to the drawing's 6)
  expect(zs(three)).toContain(-3);
  expect(three).not.toBe(plain);
  // a number being typed is one step: back at once to the colour without a value
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(colourField(cam, 'Tiefe (mm) von Farbe A')).toHaveValue('');
  expect(await drawnProgram(page)).toBe(plain);
  await expect(page.getByTestId('cam-color-pill')).toHaveCount(1);
  // …the step of the colour itself
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByTestId('cam-color-pill')).toHaveCount(0);
  await expect(page.getByTestId('cam-color-a')).toHaveCount(0);
  // forward again: the colour, then its depth
  await page.getByRole('button', { name: 'Wiederholen' }).click();
  await page.getByRole('button', { name: 'Wiederholen' }).click();
  await expect(page.getByTestId('cam-color-pill')).toHaveCount(1);
  await expect(colourField(cam, 'Tiefe (mm) von Farbe A')).toHaveValue('3');
  expect(await drawnProgram(page)).toBe(three);
});

test('a project file keeps the colours: saved, emptied, opened again – the same program', async ({
  page,
}) => {
  await seedTools(page);
  await openApp(page);
  const cam = await drawPlateAndCircle(page);
  await pick(cam, 1);
  await choice(cam).selectOption('a');
  await openColors(cam);
  await colourField(cam, 'Tiefe (mm) von Farbe A').fill('3');
  await pick(cam, 2);
  await choice(cam).selectOption('b');
  await cam
    .getByTestId('cam-colors')
    .getByRole('combobox', { name: 'Werkzeug von Farbe B', exact: true })
    .selectOption('v1');
  const made = await drawnProgram(page);
  expect(changes(made)).toEqual(['T4 M6', 'T1 M6']);

  const download = page.waitForEvent('download');
  await page.getByTestId('cam-project-save').click();
  const file = await download;
  const saved = await file.path();
  const text = JSON.parse(readFileSync(saved, 'utf8'));
  // colours are in use: version 2, the table and the diameter of the cutter they name
  expect(text.version).toBe(2);
  expect(text.colors).toEqual({ a: { depth: 3 }, b: { toolId: 'v1' } });
  expect(text.toolDiameters).toEqual({ v1: 3 });
  expect(text.items.map((i: { color?: string }) => i.color)).toEqual(['a', 'b']);

  await page.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await expect(rows(cam)).toHaveCount(0);
  await page.getByTestId('cam-project-file').setInputFiles(saved);
  await expect(rows(cam)).toHaveCount(2);
  await expect(page.getByTestId('cam-color-pill')).toHaveCount(2);
  await openColors(cam);
  await expect(colourField(cam, 'Tiefe (mm) von Farbe A')).toHaveValue('3');
  expect(await drawnProgram(page)).toBe(made);
  // "Rückgängig" brings the empty drawing back – with no colours
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(rows(cam)).toHaveCount(0);
  await expect(page.getByTestId('cam-colors')).toHaveCount(0);
});

test('a drawing without a colour is saved as the file it always was: version 1, no colours', async ({
  page,
}) => {
  await openApp(page);
  await drawTwoPlates(page);
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-project-save').click();
  const text = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
  expect(text.version).toBe(1);
  expect(text).not.toHaveProperty('colors');
  expect(text.items.some((i: object) => 'color' in i)).toBe(false);
});

test('the machine screen (800 × 600): the choice and the card are in reach in the sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openApp(page);
  const cam = await drawTwoPlates(page);
  await page.locator('[data-slot="sheet-larger"]').click();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  const scroller = cam.locator('xpath=ancestor::*[contains(@class,"panel-body")][1]');
  await pick(cam, 1);
  const select = choice(cam);
  await select.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  let where = await inReach(page, select, scroller);
  expect(where.inside && where.reached, JSON.stringify(where)).toBe(true);
  expect(where.box.height).toBeGreaterThanOrEqual(47.5);
  // A colour changes no row in the sheet either: every row keeps its height and its place
  const before = { heights: await heights(cam), tops: await tops(cam) };
  await select.selectOption('a');
  await expect(page.getByTestId('cam-color-pill')).toHaveCount(1);
  await page.waitForTimeout(150);
  for (const [i, h] of (await heights(cam)).entries()) {
    expect(Math.abs(h - before.heights[i]!), `row ${i + 1} height`).toBeLessThan(0.5);
  }
  for (const [i, top] of (await tops(cam)).entries()) {
    expect(Math.abs(top - before.tops[i]!), `row ${i + 1} top`).toBeLessThan(0.5);
  }
  await openColors(cam);
  const card = page.getByTestId('cam-color-a');
  for (const control of [
    card.getByRole('textbox', { name: 'Tiefe (mm) von Farbe A', exact: true }),
    card.getByRole('combobox', { name: 'Laufrichtung von Farbe A', exact: true }),
    card.getByRole('combobox', { name: 'Werkzeug von Farbe A', exact: true }),
  ]) {
    await control.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    where = await inReach(page, control, scroller);
    expect(where.inside && where.reached, JSON.stringify(where)).toBe(true);
    expect(where.box.height).toBeGreaterThanOrEqual(47.5);
  }
  // Typed in the sheet: the depth reaches the program
  await colourField(cam, 'Tiefe (mm) von Farbe A').fill('2,5');
  expect(zs(await drawnProgram(page))).toContain(-2.5);
});

test('the pill of a colour in the light theme: the letter in the text colour on the card’s fill, framed in the colour of the theme', async ({
  page,
}) => {
  await openApp(page);
  await goTo(page, 'Einstellungen', 'Maschine');
  await page.getByTestId('appearance').getByRole('button', { name: 'Hell' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '60', 'Höhe (mm)': '40' });
  await choice(cam).selectOption('a');
  const pill = page.getByTestId('cam-color-pill');
  await expect(pill).toBeVisible();
  const look = await pill.evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.color, background: style.backgroundColor, border: style.borderTopColor };
  });
  // the letter is the text colour, on the card's fill, framed in the light theme's A (#c2410c)
  expect(look.border).toBe('rgb(194, 65, 12)');
  expect(look.color).not.toBe(look.border);
  expect(look.background).not.toBe('rgba(0, 0, 0, 0)');
});
