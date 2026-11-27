import { expect, test, type Page } from '@playwright/test';
import {
  drawThreePlates,
  onStage,
  openApp,
  rested,
  restingTable,
  tableGeometry,
  tableSpot,
} from './helpers';

/**
 * Picking on the table with a computer: Shift or Ctrl (Cmd) + tap takes a part into the selection or out of it
 * without the switch "Mehrfachauswahl", and "Rahmen aufziehen" draws a frame that takes what it touches on release.
 * Three plates by hand (x from, y from, x to, y to):
 *   A: 0 0 40 20      B: 100 40 130 70      C: 60 100 110 110
 * The table shows the box of what is selected in `data-drawing-selected`, and the frame in `data-drawing-marquee`.
 */

const A = [0, 0, 40, 20];
const B = [100, 40, 130, 70];
const C = [60, 100, 110, 110];
const AB = [0, 0, 130, 70];
const AC = [0, 0, 110, 110];
const BC = [60, 40, 130, 110];
const ALL = [0, 0, 130, 110];

const selectedBox = async (page: Page) => {
  const text = await page.getByTestId('table-view').getAttribute('data-drawing-selected');
  return (text ?? '').split(',').map(Number);
};
const frameBox = async (page: Page) =>
  (await page.getByTestId('table-view').getAttribute('data-drawing-marquee')) ?? '';

async function setup(page: Page) {
  await openApp(page);
  const cam = await drawThreePlates(page);
  const arrange = cam.getByTestId('cam-arrange');
  await restingTable(page);
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await expect(page.getByTestId('table-view')).not.toHaveAttribute('data-drawing-selected');
  const spot = async (x: number, y: number) => {
    const at = await tableSpot(page, { x, y });
    expect(await onStage(page, at), `${x},${y} is on the stage`).toBe(true);
    return at;
  };
  /** A click as a hand makes it: not a double tap (which fits the view), with keys held as given */
  const click = async (x: number, y: number, keys: string[] = []) => {
    const at = await spot(x, y);
    await page.waitForTimeout(400);
    for (const key of keys) await page.keyboard.down(key);
    await page.mouse.click(at.x, at.y);
    for (const key of keys.reverse()) await page.keyboard.up(key);
  };
  return { cam, arrange, spot, click };
}

test('Shift or Ctrl and a tap take a part in or out of the selection – the switch stays off', async ({
  page,
}) => {
  const { cam, arrange, click } = await setup(page);
  const multi = arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' });

  // Without a key a tap picks one part alone, as ever
  await click(20, 10);
  await expect.poll(() => selectedBox(page)).toEqual(A);
  // Shift: on its line, and inside a plate, both take it in
  await click(100, 55, ['Shift']);
  await expect.poll(() => selectedBox(page)).toEqual(AB);
  await click(85, 105, ['Shift']);
  await expect.poll(() => selectedBox(page)).toEqual(ALL);
  await expect(arrange.getByTestId('cam-selected')).toContainText('3 Teile');
  // Ctrl lets go of one that is in – on the line as well as inside it
  await click(20, 0, ['Control']);
  await expect.poll(() => selectedBox(page)).toEqual(BC);
  await click(115, 55, ['Control']);
  await expect.poll(() => selectedBox(page)).toEqual(C);
  // Cmd is Ctrl
  await click(20, 0, ['Meta']);
  await expect.poll(() => selectedBox(page)).toEqual(AC);
  // A tap beside everything with a key held keeps the selection – without one it lets go
  await click(110, 20, ['Shift']);
  await page.waitForTimeout(300);
  expect(await selectedBox(page)).toEqual(AC);
  // The switch was never touched
  await expect(multi).not.toBeChecked();
  await expect(arrange.getByTestId('cam-multi-hint')).toHaveCount(0);
  await click(110, 20);
  await expect(page.getByTestId('table-view')).not.toHaveAttribute('data-drawing-selected');
  // The list agrees with the table
  await click(20, 10);
  await click(100, 55, ['Shift']);
  for (const [n, on] of [
    [1, true],
    [2, true],
    [3, false],
  ] as const) {
    await expect(cam.getByRole('checkbox', { name: `Kontur ${n} zur Auswahl` })).toBeChecked({
      checked: on,
    });
  }
});

test('Shift and a drag on a part of the selection carries the whole selection, as "Mehrfachauswahl" does', async ({
  page,
}) => {
  const { arrange, spot, click } = await setup(page);
  await click(20, 10);
  await click(100, 55, ['Shift']);
  await expect.poll(() => selectedBox(page)).toEqual(AB);
  // Shift down on B's line, a drag: both plates move together, their distance stays
  const grab = await spot(100, 55);
  await page.keyboard.down('Shift');
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 50, grab.y - 40, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const moved = await rested(page, () => selectedBox(page));
  expect(moved[0]!).toBeGreaterThan(5);
  expect(moved[2]! - moved[0]!).toBeCloseTo(130, 1);
  expect(moved[3]! - moved[1]!).toBeCloseTo(70, 1);
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  await expect(arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' })).not.toBeChecked();
  // one step back brings them both back
  await page.getByTestId('cam-card').getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(() => selectedBox(page)).toEqual(AB);
});

test('the wheel with Ctrl held still zooms the view and picks nothing', async ({ page }) => {
  const { spot } = await setup(page);
  const fitted = await restingTable(page);
  const over = await spot(60, 60);
  await page.mouse.move(over.x, over.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect
    .poll(async () => (await tableGeometry(page)).scale)
    .toBeGreaterThan(fitted.scale * 1.1);
  await expect(page.getByTestId('table-view')).not.toHaveAttribute('data-drawing-selected');
});

test('the key sheet lists the taps with a key held', async ({ page }) => {
  await setup(page);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('?');
  const sheet = page.locator('.keys-sheet');
  await expect(sheet).toContainText('Teil in die Auswahl nehmen oder herausnehmen');
  await expect(sheet).toContainText('Rahmen aufziehen: zur Auswahl hinzufügen');
  // Alt while a part is dragged: no snapping for that drag
  await expect(sheet).toContainText('Teil ziehen ohne Einrasten');
});

/** The frame "Rahmen aufziehen" draws, from one work point to another, with the mouse held down meanwhile */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  keys: string[] = [],
  release = true,
) {
  for (const key of keys) await page.keyboard.down(key);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  if (!release) return;
  await page.mouse.up();
  for (const key of keys.reverse()) await page.keyboard.up(key);
}

test('"Rahmen aufziehen": a frame across the table takes what it touches on release – nothing moves', async ({
  page,
}) => {
  const { cam, arrange, spot, click } = await setup(page);
  const table = page.getByTestId('table-view');
  const frame = arrange.getByRole('checkbox', { name: 'Rahmen aufziehen' });
  const target = (await frame.locator('xpath=ancestor::label').boundingBox())!;
  expect(target.height).toBeGreaterThanOrEqual(47.5);
  await frame.check();
  await expect(arrange.getByTestId('cam-marquee-hint')).toBeVisible();
  const view = await restingTable(page);

  // From beside the plates, over A and the corner of B: while the button is down the frame is drawn and nothing
  // is selected; on release A and B are
  const from = await spot(-8, -8);
  const to = await spot(104, 44);
  await drag(page, from, to, [], false);
  await expect.poll(() => frameBox(page)).not.toBe('');
  const drawn = (await frameBox(page)).split(',').map(Number);
  expect(drawn[0]!).toBeCloseTo(-8, 0);
  expect(drawn[2]!).toBeGreaterThan(95);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  await page.mouse.up();
  await expect.poll(() => selectedBox(page)).toEqual(AB);
  await expect(table).not.toHaveAttribute('data-drawing-marquee');
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  // The view and the plates stayed where they were
  expect(await tableGeometry(page)).toEqual(view);

  // A frame replaces the selection …
  await drag(page, await spot(55, 95), await spot(115, 115));
  await expect.poll(() => selectedBox(page)).toEqual(C);
  // … or, with Shift held as it is started, is added to it
  await drag(page, await spot(-8, -8), await spot(10, 10), ['Shift']);
  await expect.poll(() => selectedBox(page)).toEqual(AC);
  // The frame can be drawn from any corner: from the right edge to the left
  await drag(page, await spot(135, 75), await spot(95, 35));
  await expect.poll(() => selectedBox(page)).toEqual(B);
  // A frame that touches nothing lets go of the selection – drawn with a key held it changes nothing
  await drag(page, await spot(70, 60), await spot(80, 70), ['Control']);
  await page.waitForTimeout(200);
  expect(await selectedBox(page)).toEqual(B);
  await drag(page, await spot(70, 60), await spot(80, 70));
  await expect(table).not.toHaveAttribute('data-drawing-selected');

  // "Mehrfachauswahl" on: the frame adds like a key held
  await arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' }).check();
  await drag(page, await spot(-8, -8), await spot(10, 10));
  await drag(page, await spot(135, 75), await spot(95, 35));
  await expect.poll(() => selectedBox(page)).toEqual(AB);
  await arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' }).uncheck();

  // A drag that starts on a part's line draws a frame as well: the part is not moved by it
  await click(110, 20);
  const line = await spot(20, 0);
  await drag(page, line, await spot(60, 40));
  await expect.poll(() => selectedBox(page)).toEqual(A);
  await page.waitForTimeout(300);
  expect(await selectedBox(page)).toEqual(A);
  // every plate is where it was drawn
  // (the name of the part that is selected lets go of it: start with another)
  for (const [n, box] of [
    [2, B],
    [3, C],
    [1, A],
  ] as const) {
    await cam.getByRole('button', { name: new RegExp(`^${n}\\. `) }).click();
    await expect.poll(() => selectedBox(page)).toEqual(box);
  }

  // A tap is a tap: it picks the part under it and a tap beside lets go of the selection
  await click(20, 10);
  await expect.poll(() => selectedBox(page)).toEqual(A);
  await click(110, 20);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
});

test('"Rahmen aufziehen" takes no hidden part and no registration hole – and ends with the switch', async ({
  page,
}) => {
  const { cam, arrange, spot } = await setup(page);
  await arrange.getByRole('checkbox', { name: 'Rahmen aufziehen' }).check();
  // plate B hidden: the frame over all of it takes the other two
  await cam.getByRole('button', { name: 'Teil 2 ausblenden' }).click();
  await restingTable(page);
  await drag(page, await spot(-8, -8), await spot(135, 115));
  await expect.poll(() => selectedBox(page)).toEqual(AC);
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  // two registration holes beside the parts are not taken either
  await cam.getByRole('checkbox', { name: 'Von beiden Seiten fräsen' }).check();
  await restingTable(page);
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await drag(page, await spot(-8, -8), await spot(135, 115));
  await expect.poll(() => selectedBox(page)).toEqual(AC);
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  // Off again, a drag is what it was: the view pans (nothing is selected by it)
  await arrange.getByRole('checkbox', { name: 'Rahmen aufziehen' }).uncheck();
  await expect(arrange.getByTestId('cam-marquee-hint')).toHaveCount(0);
  const view = await restingTable(page);
  const start = await spot(70, 60);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 20, { steps: 8 });
  await expect(page.getByTestId('table-view')).not.toHaveAttribute('data-drawing-marquee');
  await page.mouse.up();
  await expect.poll(async () => (await tableGeometry(page)).originX).not.toBe(view.originX);
});

test('"Rahmen aufziehen" left on with nothing drawn does not stop the view from panning', async ({
  page,
}) => {
  const { cam, arrange, spot } = await setup(page);
  await arrange.getByRole('checkbox', { name: 'Rahmen aufziehen' }).check();
  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await expect(cam.getByTestId('cam-contours')).toHaveCount(0);
  // the switch is not on the screen any more – a drag must not draw a frame that nothing can turn off
  await expect(page.getByRole('checkbox', { name: 'Rahmen aufziehen' })).toHaveCount(0);
  const view = await restingTable(page);
  const start = await spot(40, 40);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 30, { steps: 8 });
  await expect(page.getByTestId('table-view')).not.toHaveAttribute('data-drawing-marquee');
  await page.mouse.up();
  await expect.poll(async () => (await tableGeometry(page)).originX).not.toBe(view.originX);
});
