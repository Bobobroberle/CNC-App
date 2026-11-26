import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  drawShape,
  onStage,
  openApp,
  rested,
  restingTable,
  tableGeometry,
  tableSpot,
} from './helpers';

/**
 * Several parts at once ("Mehrfachauswahl"), aligned, spread evenly and grouped – as in a drawing program.
 * Three plates, each its own thing, by hand (x from, y from, x to, y to):
 *   1: 0 0 40 20      2: 100 40 130 70      3: 60 100 110 110
 * together 0 0 130 110. The table shows the box of what is selected in `data-drawing-selected`.
 */

const A = [0, 0, 40, 20];
const B = [100, 40, 130, 70];
const C = [60, 100, 110, 110];

const selectedBox = async (page: Page) =>
  ((await page.getByTestId('table-view').getAttribute('data-drawing-selected')) ?? '')
    .split(',')
    .map(Number);

async function openDrawing(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '40', 'Höhe (mm)': '20' });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '30',
    'Höhe (mm)': '30',
    'X links (mm)': '100',
    'Y unten (mm)': '40',
  });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '50',
    'Höhe (mm)': '10',
    'X links (mm)': '60',
    'Y unten (mm)': '100',
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(3);
  await expect.poll(() => selectedBox(page)).toEqual(C);
  return cam;
}

/** The box of the part in row `n`, taken by selecting it alone (the drawing is not changed by looking) */
async function part(page: Page, n: number) {
  await page
    .getByTestId('cam-card')
    .getByRole('button', { name: new RegExp(`^${n}\\. `) })
    .click();
  // the picture shows the new selection a moment after the tap
  return rested(page, () => selectedBox(page));
}
const parts = async (page: Page) => [await part(page, 1), await part(page, 2), await part(page, 3)];

/** Row checkboxes take parts in and out of the selection */
const tick = (cam: Locator, n: number) =>
  cam.getByRole('checkbox', { name: `Kontur ${n} zur Auswahl` });
const label = (cam: Locator, name: string) => cam.getByRole('button', { name, exact: true });

test('picks parts with the boxes of the list, aligns and spreads them – each button one step', async ({
  page,
}) => {
  const cam = await openDrawing(page);
  const arrange = cam.getByTestId('cam-arrange');
  const undo = label(cam, 'Rückgängig');

  // Nothing selected: the way to everything, and the mode for picking several
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await expect(arrange.getByRole('button', { name: 'Alles auswählen', exact: true })).toBeVisible();
  await expect(arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' })).not.toBeChecked();

  // The box of every row is a target for a finger, and takes its part in or out
  const target = (await cam.getByTestId('cam-pick').first().boundingBox())!;
  expect(target.width).toBeGreaterThanOrEqual(47.5);
  expect(target.height).toBeGreaterThanOrEqual(47.5);
  await tick(cam, 1).click();
  await expect.poll(() => selectedBox(page)).toEqual(A);
  await tick(cam, 2).click();
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 70]);
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  await tick(cam, 3).click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('3 Teile');
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 110]);
  await tick(cam, 2).click();
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 110, 110]);
  await tick(cam, 2).click();
  await expect(tick(cam, 1)).toBeChecked();
  await expect(tick(cam, 2)).toBeChecked();
  await expect(tick(cam, 3)).toBeChecked();

  // Aligning shows with two or more, spreading is there, and works with three
  const align = cam.getByTestId('cam-align');
  await expect(align).toBeVisible();
  for (const control of await align.getByRole('button').all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  }

  // Horizontal middles: all on the middle of the selection (65)
  await label(align, 'Waagerecht mittig ausrichten').click();
  expect(await parts(page)).toEqual([
    [45, 0, 85, 20],
    [50, 40, 80, 70],
    [40, 100, 90, 110],
  ]);
  // ONE step brings the three back – and the selection with them
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await undo.click();
  expect(await parts(page)).toEqual([A, B, C]);

  // Left edges: all on 0; the selection is as it was before the step
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await label(align, 'Linksbündig ausrichten').click();
  expect(await parts(page)).toEqual([
    [0, 0, 40, 20],
    [0, 40, 30, 70],
    [0, 100, 50, 110],
  ]);
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await undo.click();
  expect(await parts(page)).toEqual([A, B, C]);

  // Equal gaps along x: the outer plates stay, the middle one (60…110) goes to 45: 5 mm either side
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await label(align, 'Waagerecht verteilen: gleiche Abstände').click();
  expect(await parts(page)).toEqual([A, B, [45, 100, 95, 110]]);
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await undo.click();
  expect(await parts(page)).toEqual([A, B, C]);

  // Equal middles along x: the middle plate's middle halfway between 20 and 115
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await label(align, 'Waagerecht verteilen: gleiche Mitten').click();
  expect(await parts(page)).toEqual([A, B, [42.5, 100, 92.5, 110]]);
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await undo.click();

  // And along y: the heights 20 + 30 + 10 in 110 leave gaps of 25 – the middle one (plate 2) goes up 5
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await label(align, 'Senkrecht verteilen: gleiche Abstände').click();
  expect(await parts(page)).toEqual([A, [100, 45, 130, 75], C]);
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await undo.click();
  expect(await parts(page)).toEqual([A, B, C]);

  // Two parts: aligned, but nothing to spread – the button says why
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await tick(cam, 1).click();
  await tick(cam, 3).click();
  const spread = label(align, 'Waagerecht verteilen: gleiche Abstände');
  await expect(spread).toBeDisabled();
  await expect(spread).toHaveAttribute(
    'data-reason',
    'Zum Verteilen mindestens drei Teile oder Gruppen auswählen – eine Gruppe zählt als eines.',
  );
  await label(align, 'Oben ausrichten').click();
  expect(await part(page, 1)).toEqual([0, 90, 40, 110]);
  expect(await part(page, 2)).toEqual(B);
  expect(await part(page, 3)).toEqual(C);
});

test('inverts and selects everything, groups and takes apart – a group is one thing to move and align', async ({
  page,
}) => {
  const cam = await openDrawing(page);
  const arrange = cam.getByTestId('cam-arrange');
  const undo = label(cam, 'Rückgängig');
  const all = () => arrange.getByRole('button', { name: 'Alles auswählen', exact: true });

  // The second part alone: nothing to group it with and nothing to take apart – the buttons are not there
  await part(page, 2);
  await expect(label(arrange, 'Gruppieren')).toHaveCount(0);
  await expect(label(arrange, 'Gruppierung aufheben')).toHaveCount(0);
  // Inverted: the other two
  await arrange.getByRole('button', { name: 'Auswahl umkehren', exact: true }).click();
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 110, 110]);
  await expect(tick(cam, 2)).not.toBeChecked();
  await expect(tick(cam, 1)).toBeChecked();
  await all().click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('3 Teile');

  // Group them: one thing – picked, moved and aligned together, so there is nothing to align any more
  await label(arrange, 'Gruppieren').click();
  await expect(cam.getByTestId('cam-align')).toHaveCount(0);
  await expect(label(arrange, 'Gruppieren')).toBeDisabled();
  // the group is what is selected; let go of it, and a tap on a part of it takes all of it
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await part(page, 1);
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 110]);
  for (const n of [1, 2, 3]) await expect(tick(cam, n)).toBeChecked();
  // one thing made of three contours: said so, not as "3 Teile" next to a Gruppieren that needs two
  await expect(arrange.getByTestId('cam-selected')).toContainText('Gruppe aus 3 Konturen');
  await arrange.getByLabel('X links (mm)').fill('50');
  await expect.poll(() => selectedBox(page)).toEqual([50, 0, 180, 110]);
  await undo.click();
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 110]);

  // Taking it apart: three things again, all selected – and aligned as three
  await label(arrange, 'Gruppierung aufheben').click();
  await expect(cam.getByTestId('cam-align')).toBeVisible();
  await expect(arrange.getByTestId('cam-selected')).toContainText('3 Teile');
  await expect(label(arrange, 'Gruppierung aufheben')).toBeDisabled();
  expect(await part(page, 1)).toEqual(A);
  await expect(tick(cam, 2)).not.toBeChecked();
  expect(await part(page, 3)).toEqual(C);

  // One step of undo each: the group is back (and selected, as it was), and then the three things again
  await undo.click();
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 110]);
  await expect(tick(cam, 3)).toBeChecked();
  await undo.click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('3 Teile');
  expect(await part(page, 1)).toEqual(A);
  await expect(tick(cam, 3)).not.toBeChecked();
});

test('"Mehrfachauswahl" on the table: a tap takes a part in or out, a tap beside keeps the set', async ({
  page,
}) => {
  const cam = await openDrawing(page);
  const arrange = cam.getByTestId('cam-arrange');
  const table = page.getByTestId('table-view');
  await restingTable(page);
  const spot = async (x: number, y: number) => {
    const at = await tableSpot(page, { x, y });
    expect(await onStage(page, at)).toBe(true);
    return at;
  };
  const tap = async (x: number, y: number) => {
    const at = await spot(x, y);
    // not a double tap (which fits the view and takes the first tap back): a hand waits a moment
    await page.waitForTimeout(400);
    await page.mouse.click(at.x, at.y);
  };

  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  const multi = arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' });
  await multi.check();
  await expect(arrange.getByTestId('cam-multi-hint')).toBeVisible();

  // Inside the plates a tap takes them in, one after the other
  await tap(20, 10);
  await expect.poll(() => selectedBox(page)).toEqual(A);
  // A part that is the whole selection and small takes the finger inside its frame; lifted on the spot, the
  // tap still lets go of it – and the next takes it in again
  await tap(20, 10);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  await tap(20, 10);
  await expect.poll(() => selectedBox(page)).toEqual(A);
  await tap(115, 55);
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 70]);
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  // A tap beside everything keeps the selection (and the mode)
  await tap(20, 85);
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 70]);
  await expect(multi).toBeChecked();
  // A tap on the first one lets go of it
  await tap(20, 10);
  await expect.poll(() => selectedBox(page)).toEqual(B);
  // On a line it is the same: this one is not in the set, so the tap takes it in; the next lets go of it
  const line = await spot(20, 0);
  await page.mouse.click(line.x, line.y);
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 70]);
  await page.mouse.click(line.x, line.y);
  await expect.poll(() => selectedBox(page)).toEqual(B);

  // A finger that takes one part carries the whole selection: both plates move together, their distance stays
  await tap(20, 10);
  const grab = await spot(100, 55);
  const to = { x: grab.x + 60, y: grab.y - 40 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  const moved = await rested(page, () => selectedBox(page));
  expect(moved[0]!).toBeGreaterThan(5);
  expect(moved[2]! - moved[0]!).toBeCloseTo(130, 1);
  expect(moved[3]! - moved[1]!).toBeCloseTo(70, 1);
  // One step of undo brings both back, still selected
  await label(cam, 'Rückgängig').click();
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 130, 70]);
  // A finger that takes a part that is not in the set takes it in – and carries all of it
  await tap(115, 55);
  await expect.poll(() => selectedBox(page)).toEqual(A);
  const other = await spot(100, 55);
  await page.mouse.move(other.x, other.y);
  await page.mouse.down();
  await page.mouse.move(other.x + 40, other.y, { steps: 6 });
  await page.mouse.up();
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  const carried = await rested(page, () => selectedBox(page));
  expect(carried[2]! - carried[0]!).toBeCloseTo(130, 1);
  await label(cam, 'Rückgängig').click();

  // Without the mode a tap picks one part alone, and a tap beside lets go
  await multi.uncheck();
  await expect(arrange.getByTestId('cam-multi-hint')).toHaveCount(0);
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await tick(cam, 2).click();
  await tick(cam, 3).click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  await expect.poll(() => selectedBox(page)).toEqual([60, 40, 130, 110]);
  const together = [60, 40, 130, 110];
  // a set made by the boxes is kept by a finger on one of its parts, with the mode off too
  const on = await spot(100, 55);
  await page.mouse.click(on.x, on.y);
  await expect.poll(() => selectedBox(page)).toEqual(together);
  // and a tap beside everything lets go
  await tap(20, 85);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
});

test('the steps of arranging go through undo, redo and the keys like any other', async ({
  page,
}) => {
  const cam = await openDrawing(page);
  const arrange = cam.getByTestId('cam-arrange');
  const undo = label(cam, 'Rückgängig');
  const redo = label(cam, 'Wiederholen');
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await label(cam, 'Linksbündig ausrichten').click();
  // Ctrl+A still selects everything, Ctrl+Z and Ctrl+Shift+Z go through the steps
  await page.getByTestId('cam-selected').click();
  await page.keyboard.press('Control+z');
  expect(await part(page, 2)).toEqual(B);
  await expect(redo).toBeEnabled();
  await page.keyboard.press('Control+Shift+z');
  expect(await part(page, 2)).toEqual([0, 40, 30, 70]);
  // the step back brings the selection of that moment with it: the second part alone, where it was
  await undo.click();
  await expect.poll(() => selectedBox(page)).toEqual(B);
  await page.getByTestId('cam-selected').click();
  await page.keyboard.press('Control+a');
  await expect(arrange.getByTestId('cam-selected')).toContainText('3 Teile');
});

test('a double tap fits the view and takes the first tap back – with "Mehrfachauswahl" too', async ({
  page,
}) => {
  const cam = await openDrawing(page);
  const arrange = cam.getByTestId('cam-arrange');
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' }).check();
  await tick(cam, 2).click();
  await expect.poll(() => selectedBox(page)).toEqual(B);
  const fitted = await restingTable(page);
  // Two quick taps inside the first plate: it is not taken into the set, and the view comes closer
  const at = await tableSpot(page, { x: 20, y: 10 });
  expect(await onStage(page, at)).toBe(true);
  await page.mouse.dblclick(at.x, at.y);
  await expect
    .poll(async () => (await tableGeometry(page)).scale)
    .toBeGreaterThan(fitted.scale * 1.2);
  await expect.poll(() => selectedBox(page)).toEqual(B);
  await expect(arrange.getByTestId('cam-selected')).not.toContainText('2 Teile');
});

test('the header counts what the buttons count: the parts, and the contours where a group has several', async ({
  page,
}) => {
  const cam = await openDrawing(page);
  const arrange = cam.getByTestId('cam-arrange');
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await tick(cam, 1).click();
  await tick(cam, 2).click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  await label(arrange, 'Gruppieren').click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('Gruppe aus 2 Konturen');
  // The group and the third plate: two things made of three contours – the hint of the align panel says two too
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile, 3 Konturen');
  await expect(cam.getByTestId('cam-align')).toContainText('(2 Teile)');
  // Taken apart: three things, three contours
  await arrange.getByRole('button', { name: 'Auswahl umkehren', exact: true }).click();
  await expect(arrange.getByTestId('cam-selected')).toHaveCount(0);
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await label(arrange, 'Gruppierung aufheben').click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('3 Teile');
  await expect(arrange.getByTestId('cam-selected')).not.toContainText('Konturen');
});

/**
 * The box of a row is tapped where it is, tap after tap: what the selection makes of the cards above the list
 * (the small card of "nothing selected" becomes the whole one, the align panel comes and goes) must not take
 * the row from under the finger. Measured at the place the row stands on the screen, before and after.
 */
async function rowsStayUnderTheFinger(page: Page, cam: Locator) {
  const arrange = cam.getByTestId('cam-arrange');
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  const box = async (n: number) => {
    const pick = cam.getByTestId('cam-pick').nth(n - 1);
    await pick.scrollIntoViewIfNeeded();
    return (await pick.boundingBox())!;
  };
  const tap = async (n: number, checked: boolean) => {
    const before = await box(n);
    await tick(cam, n).click();
    await expect(tick(cam, n)).toBeChecked({ checked });
    // the selection and what hangs on it are drawn; the scroll that holds the row is made with it
    await page.waitForTimeout(150);
    const after = (await cam
      .getByTestId('cam-pick')
      .nth(n - 1)
      .boundingBox())!;
    expect(
      Math.abs(after.y - before.y),
      `row ${n} ${checked ? 'ticked' : 'unticked'}`,
    ).toBeLessThan(1.5);
  };
  // nothing → one part (the card of the selection appears), → two (the align panel appears), → three
  await tap(1, true);
  await tap(2, true);
  await expect(cam.getByTestId('cam-align')).toBeVisible();
  await tap(3, true);
  // and back: three → two → one (the panel goes) → the tap on the last lets go of everything
  await tap(3, false);
  await tap(2, false);
  await expect(cam.getByTestId('cam-align')).toHaveCount(0);
  await tap(1, false);
  await expect(arrange.getByRole('button', { name: 'Alles auswählen', exact: true })).toBeVisible();
}

test('the box of a row stays where the finger put it while the cards above it grow and shrink', async ({
  page,
}) => {
  const cam = await openDrawing(page);
  await rowsStayUnderTheFinger(page, cam);
});

test('the same on the machine screen (800 × 600), in the sheet at its largest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const cam = await openDrawing(page);
  await page.locator('[data-slot="sheet-larger"]').click();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  await rowsStayUnderTheFinger(page, cam);
});
