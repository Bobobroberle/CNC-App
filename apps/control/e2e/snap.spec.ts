import { expect, test, type Page } from '@playwright/test';
import {
  drawShape,
  drawThreePlates,
  goTo,
  moreOptions,
  onStage,
  openApp,
  rested,
  restingTable,
  tableSpot,
} from './helpers';

/**
 * Snapping to the lines of the other parts and of the stock while a part is dragged, and the gaps to the
 * neighbours – on the table of the drawing workspace. Three plates by hand (x from, y from, x to, y to):
 *   A: 0 0 40 20      B: 100 40 130 70      C: 60 100 110 110
 * The table says what it shows in `data-drawing-snap` (the guides, only while something snapped) and
 * `data-drawing-gaps` (only while a part is held), and the box of the selection in `data-drawing-selected`.
 *
 * A drag here starts beyond the tap slop along x alone, so the part follows the finger from there with no lag in
 * y – a finger that goes on `dx` px moves the part by exactly that much. It takes a part on its bottom line, 10 mm
 * from the corner: clear of the handles of a part that is selected (a corner and the middle of the side).
 */

const SNAP_PX = 8;
const table = (page: Page) => page.getByTestId('table-view');
const selectedBox = async (page: Page) =>
  ((await table(page).getAttribute('data-drawing-selected')) ?? '').split(',').map(Number);
const json = async (page: Page, name: string) => {
  const text = await table(page).getAttribute(name);
  return text === null ? null : (JSON.parse(text) as unknown);
};
const guides = (page: Page) => json(page, 'data-drawing-snap');
const gapTexts = async (page: Page) =>
  ((await json(page, 'data-drawing-gaps')) as { side: string; text: string }[] | null)?.map((g) => [
    g.side,
    g.text,
  ]) ?? null;
const gaps = async (page: Page) =>
  (
    (await json(page, 'data-drawing-gaps')) as
      | { side: string; gap: number; equal: boolean }[]
      | null
  )?.map((g) => [g.side, g.gap, g.equal]) ?? null;

async function setup(page: Page) {
  await openApp(page);
  const cam = await drawThreePlates(page);
  await restingTable(page);
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Auswahl aufheben' }).click();
  await expect(table(page)).not.toHaveAttribute('data-drawing-selected');
  const g = await restingTable(page);
  // The threshold in mm at this zoom; the grid is 1 mm here (below 12 px/mm), so a line that is 0.8 of the
  // threshold away is further from the grid's nearest whole mm than from the line itself
  expect(g.scale).toBeLessThan(10);
  const threshold = SNAP_PX / g.scale;
  const off = Math.min(0.8 * threshold, 1.4);
  expect(off).toBeGreaterThan(0.6);
  return { cam, g, threshold, off };
}

/** Takes a part at a point of its line and carries it by (dx, dy) px: `to` moves on, `up` lets go */
async function carry(page: Page, work: { x: number; y: number }, keys: string[] = []) {
  const from = await tableSpot(page, work);
  expect(await onStage(page, from), 'the grip is on the stage').toBe(true);
  await page.mouse.move(from.x, from.y);
  for (const key of keys) await page.keyboard.down(key);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y);
  return {
    to: (dx: number, dy: number) => page.mouse.move(from.x + 6 + dx, from.y + dy, { steps: 4 }),
    up: async () => {
      await page.mouse.up();
      for (const key of [...keys].reverse()) await page.keyboard.up(key);
    },
  };
}

const near = (box: number[], want: number[], digits = 1) => {
  expect(box).toHaveLength(4);
  box.forEach((v, i) => expect(v, `box[${i}] of ${box}`).toBeCloseTo(want[i]!, digits));
};

test('a dragged part snaps to the line of another one – the guide and the gaps show only while it is held', async ({
  page,
}) => {
  const { cam, g, off } = await setup(page);
  const undo = cam.getByRole('button', { name: 'Rückgängig', exact: true });
  const carrying = await carry(page, { x: 10, y: 0 });
  // A's left edge 60 + off: C's left edge (60) is nearer than the grid's whole mm
  await carrying.to((60 + off) * g.scale, -30 * g.scale);
  await expect.poll(() => guides(page)).not.toBeNull();
  near(await rested(page, () => selectedBox(page)), [60, 30, 100, 50]);
  // The guide runs from A (y 30…50) to C (y 100…110) along x = 60
  expect(await guides(page)).toEqual([{ axis: 'x', at: 60, from: 30, to: 110 }]);
  // The room to the neighbours across from it: B on the right touches (its left edge is 100), C 50 above
  expect(await gaps(page)).toEqual([
    ['right', 0, false],
    ['up', 50, false],
  ]);
  // On, out of reach of every line: nobody snaps, the grid keeps its whole mm, the guide is gone
  await carrying.to(75.4 * g.scale, -30 * g.scale);
  await expect.poll(() => guides(page)).toBeNull();
  near(await rested(page, () => selectedBox(page)), [75, 30, 115, 50]);
  // …and back on the line
  await carrying.to((60 + off) * g.scale, -30 * g.scale);
  await expect.poll(() => guides(page)).not.toBeNull();
  await carrying.up();
  // Let go: the guide and the gaps are gone, the part stays on the line
  await expect.poll(() => guides(page)).toBeNull();
  expect(await gaps(page)).toBeNull();
  near(await rested(page, () => selectedBox(page)), [60, 30, 100, 50]);
  // The whole drag is one step of undo
  await undo.click();
  near(await rested(page, () => selectedBox(page)), [0, 0, 40, 20]);
});

test('snaps a middle line too, and the two axes each to another part', async ({ page }) => {
  const { g, off } = await setup(page);
  const carrying = await carry(page, { x: 10, y: 0 });
  // x: A's middle (its left edge + 20) off from C's middle (85); y: A's bottom off from B's bottom (40)
  await carrying.to((65 - off) * g.scale, -(40 - off) * g.scale);
  await expect.poll(() => guides(page)).not.toBeNull();
  near(await rested(page, () => selectedBox(page)), [65, 40, 105, 60]);
  const found = (await guides(page)) as { axis: string; at: number; from: number; to: number }[];
  expect(found.sort((p, q) => p.axis.localeCompare(q.axis))).toEqual([
    // x = 85 from A's foot (40) up to C's top (110); y = 40 from A's left (65) across to B's right (130)
    { axis: 'x', at: 85, from: 40, to: 110 },
    { axis: 'y', at: 40, from: 65, to: 130 },
  ]);
  await carrying.up();
});

test('Alt turns snapping off for a drag – held when it starts or while it goes on – the gaps stay', async ({
  page,
}) => {
  const { cam, g, off } = await setup(page);
  const undo = cam.getByRole('button', { name: 'Rückgängig', exact: true });
  // Alt down first: the grid alone and no guide, though the gaps show
  const alt = await carry(page, { x: 10, y: 0 }, ['Alt']);
  await alt.to((60 + off) * g.scale, -30 * g.scale);
  await expect.poll(() => gaps(page)).not.toBeNull();
  expect(await guides(page)).toBeNull();
  // The grid's whole mm: 60 + off rounds away from the line
  expect((await rested(page, () => selectedBox(page)))[0]).toBe(Math.round(60 + off));
  await alt.up();
  await undo.click();
  near(await rested(page, () => selectedBox(page)), [0, 0, 40, 20]);

  // Without Alt the same drag snaps – Alt pressed on the way takes it away at once, let go brings it back
  const on = await carry(page, { x: 10, y: 0 });
  await on.to((60 + off) * g.scale, -30 * g.scale);
  await expect.poll(() => guides(page)).not.toBeNull();
  await page.keyboard.down('Alt');
  await on.to((60 + off) * g.scale + 1, -30 * g.scale);
  await expect.poll(() => guides(page)).toBeNull();
  expect(await gaps(page)).not.toBeNull();
  await page.keyboard.up('Alt');
  await on.to((60 + off) * g.scale, -30 * g.scale);
  await expect.poll(() => guides(page)).not.toBeNull();
  await on.up();
  near(await rested(page, () => selectedBox(page)), [60, 30, 100, 50]);
});

test('"Fangen" and "Abstände zeigen" are switches of the card – on, remembered, and no step of undo', async ({
  page,
}) => {
  const { cam, g, off } = await setup(page);
  const arrange = cam.getByTestId('cam-arrange');
  const snap = arrange.getByRole('checkbox', { name: 'Fangen', exact: true });
  const spaces = arrange.getByRole('checkbox', { name: 'Abstände zeigen', exact: true });
  // Folded away at first – both are on, nothing is needed from them – under one line that is a full target
  const fold = arrange.getByRole('button', { name: 'Fangen und Abstände' });
  expect((await fold.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await expect(snap).toBeHidden();
  await expect(spaces).toBeHidden();
  await fold.click();
  await expect(snap).toBeChecked();
  await expect(spaces).toBeChecked();
  // Each is a 48 px target
  for (const box of [snap, spaces]) {
    const row = box.locator('xpath=ancestor::label');
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  }
  const undo = cam.getByRole('button', { name: 'Rückgängig', exact: true });

  await snap.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('lowrider-control.dragAids'))).toBe(
    JSON.stringify({ snap: false, gaps: true }),
  );
  const drag = await carry(page, { x: 10, y: 0 });
  await drag.to((60 + off) * g.scale, -30 * g.scale);
  await expect.poll(() => gaps(page)).not.toBeNull();
  expect(await guides(page)).toBeNull();
  expect((await rested(page, () => selectedBox(page)))[0]).toBe(Math.round(60 + off));
  await drag.up();
  // The switches are no step of the drawing: the one step of undo is the drag
  await undo.click();
  near(await rested(page, () => selectedBox(page)), [0, 0, 40, 20]);

  // The gaps off, snapping on: the guide shows, the numbers do not
  await snap.check();
  await spaces.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('lowrider-control.dragAids'))).toBe(
    JSON.stringify({ snap: true, gaps: false }),
  );
  const again = await carry(page, { x: 10, y: 0 });
  await again.to((60 + off) * g.scale, -30 * g.scale);
  await expect.poll(() => guides(page)).not.toBeNull();
  expect(await gaps(page)).toBeNull();
  await again.up();
  await spaces.check();
});

test('snaps to the stock where one is entered, and to nothing of it where none is', async ({
  page,
}) => {
  const { cam, off } = await setup(page);
  // No stock: A's left edge −off from the stock's would-be edge goes to the grid's whole mm
  const g = await restingTable(page);
  const free = await carry(page, { x: 10, y: 0 });
  await free.to(-off * g.scale, -60 * g.scale);
  await expect.poll(() => selectedBox(page).then((b) => b[1])).toBeCloseTo(60, 0);
  expect((await rested(page, () => selectedBox(page)))[0]).toBe(Math.round(-off));
  expect(await guides(page)).toBeNull();
  await free.up();
  await cam.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  near(await rested(page, () => selectedBox(page)), [0, 0, 40, 20]);

  // The stock is entered in the Job room
  await goTo(page, 'Job');
  await moreOptions(page, 'workpiece');
  const material = page.getByTestId('setup-material');
  await material.getByLabel('Länge X (mm)').fill('150');
  await material.getByLabel('Breite Y (mm)').fill('120');
  await material.getByLabel('Dicke Z (mm)').fill('18');
  await material.getByRole('button', { name: /^Maße übernehmen/ }).click();
  await page.getByTestId('step-cam').click();
  const geometry = await restingTable(page);
  const bound = await carry(page, { x: 10, y: 0 });
  await bound.to(-off * geometry.scale, -60 * geometry.scale);
  await expect.poll(() => guides(page)).not.toBeNull();
  near(await rested(page, () => selectedBox(page)), [0, 60, 40, 80]);
  // The guide runs along the stock's left edge, from its foot (0) to A's top… and up to the stock's top (120)
  expect(await guides(page)).toEqual([{ axis: 'x', at: 0, from: 0, to: 120 }]);
  await bound.up();
});

test("names two equal gaps on opposite sides, with the number in the app's format", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  // L: 0 0 20.5 20 · R: 99.5 0 119.5 20 · M: 60 0 80 20 between them – at x 50 both gaps are 29.5
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '20,5', 'Höhe (mm)': '20' });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '20',
    'Höhe (mm)': '20',
    'X links (mm)': '99,5',
    'Y unten (mm)': '0',
  });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '20',
    'Höhe (mm)': '20',
    'X links (mm)': '60',
    'Y unten (mm)': '0',
  });
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Auswahl aufheben' }).click();
  const g = await restingTable(page);
  const carrying = await carry(page, { x: 70, y: 0 });
  await carrying.to(-10 * g.scale, 0);
  await expect
    .poll(() => gaps(page))
    .toEqual([
      ['left', 29.5, true],
      ['right', 29.5, true],
    ]);
  // Both carry the equals sign – the state is in the words as well as in the colour
  expect(await gapTexts(page)).toEqual([
    ['left', '= 29,5 mm'],
    ['right', '= 29,5 mm'],
  ]);
  // Two mm on: 31.5 and 27.5 – no longer equal, plain numbers
  await carrying.to(-8 * g.scale, 0);
  await expect
    .poll(() => gaps(page))
    .toEqual([
      ['left', 31.5, false],
      ['right', 27.5, false],
    ]);
  expect(await gapTexts(page)).toEqual([
    ['left', '31,5 mm'],
    ['right', '27,5 mm'],
  ]);
  await carrying.up();
  expect(await gaps(page)).toBeNull();
});
