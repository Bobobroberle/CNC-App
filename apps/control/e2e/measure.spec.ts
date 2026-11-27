import { expect, test, type Page } from '@playwright/test';
import {
  drawShape,
  drawThreePlates,
  onStage,
  openApp,
  restingTable,
  tableSpot,
  tableWork,
} from './helpers';

/**
 * "Messen" in the drawing workspace: a mode of the screen – a tap sets the point A, the next B, a third starts
 * again; the points snap to corners, edge middles and circle centres and can be dragged; nothing is selected,
 * changed or remembered. Three plates by hand (x from, y from, x to, y to):
 *   A: 0 0 40 20      B: 100 40 130 70      C: 60 100 110 110
 * The table says what it measures in `data-drawing-measure` (JSON), the card in `cam-measure-result`.
 */

const table = (page: Page) => page.getByTestId('table-view');
interface Measure {
  a: { x: number; y: number };
  b: { x: number; y: number } | null;
  distance?: number;
  dx?: number;
  dy?: number;
  angle?: number;
}
const measured = async (page: Page): Promise<Measure | null> => {
  const text = await table(page).getAttribute('data-drawing-measure');
  return text === null ? null : (JSON.parse(text) as Measure);
};
const selected = (page: Page) => table(page).getAttribute('data-drawing-selected');

async function setup(page: Page, circle = false) {
  await openApp(page);
  const cam = await drawThreePlates(page);
  if (circle) {
    // A round hole in the free middle of the table: its centre is at 30 60
    await drawShape(page, 'Kreis', {
      'Durchmesser (mm)': '10',
      'X Mitte (mm)': '30',
      'Y Mitte (mm)': '60',
    });
  }
  const arrange = cam.getByTestId('cam-arrange');
  await restingTable(page);
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await expect(table(page)).not.toHaveAttribute('data-drawing-selected');
  const g = await restingTable(page);
  const mode = arrange.getByRole('checkbox', { name: 'Messen', exact: true });
  /** A tap as a hand makes it – not a double tap, which would fit the view – with keys held as given */
  const tap = async (x: number, y: number, keys: string[] = []) => {
    const at = await tableSpot(page, { x, y });
    expect(await onStage(page, at), `${x},${y} is on the stage`).toBe(true);
    await page.waitForTimeout(400);
    for (const key of keys) await page.keyboard.down(key);
    await page.mouse.click(at.x, at.y);
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  };
  return { cam, arrange, g, mode, tap };
}

const close = (value: number | undefined, want: number, digits = 1) =>
  expect(value, `${value} ≈ ${want}`).toBeCloseTo(want, digits);

test('taps set A and B on corners, read distance, ΔX, ΔY and angle – a third tap starts again; nothing is selected', async ({
  page,
}) => {
  const { cam, arrange, mode, tap } = await setup(page);
  const result = arrange.getByTestId('cam-measure-result');
  await expect(mode).not.toBeChecked();
  await expect(result).toHaveCount(0);
  // Off: no attribute
  expect(await measured(page)).toBeNull();

  await mode.check();
  await expect(arrange.getByTestId('cam-measure-hint')).toBeVisible();
  // A: a tap near the corner 0 0 of the first plate – on its line, where a tap would select it – snaps to it
  await tap(1, 1);
  await expect.poll(() => measured(page)).toMatchObject({ a: { x: 0, y: 0 }, b: null });
  await expect(result).toContainText('Punkt A steht');
  // B: near the corner 130 70 of the second
  await tap(131, 71);
  await expect.poll(async () => (await measured(page))?.b).toEqual({ x: 130, y: 70 });
  const m = (await measured(page))!;
  expect(m.a).toEqual({ x: 0, y: 0 });
  close(m.distance, Math.hypot(130, 70), 3);
  expect([m.dx, m.dy]).toEqual([130, 70]);
  // Counter-clockwise from the X axis, y up: atan2(70, 130)
  close(m.angle, (Math.atan2(70, 130) * 180) / Math.PI, 3);
  // The card says the same, in the app's format
  await expect(arrange.getByTestId('cam-measure-distance')).toHaveText('147,65 mm');
  await expect(arrange.getByTestId('cam-measure-dx')).toHaveText('+130,00 mm');
  await expect(arrange.getByTestId('cam-measure-dy')).toHaveText('+70,00 mm');
  await expect(arrange.getByTestId('cam-measure-angle')).toHaveText('28,3°');
  // A tap measures and selects nothing; the drawing is as it was
  expect(await selected(page)).toBeNull();

  // A third tap starts again – far from every feature the point stays where it was put
  await tap(30, 60);
  const again = (await measured(page))!;
  expect(again.b).toBeNull();
  close(again.a.x, 30, 0);
  close(again.a.y, 60, 0);
  expect(Math.abs(again.a.x - 30) + Math.abs(again.a.y - 60)).toBeGreaterThan(0);
  await expect(result).toContainText('Punkt A steht');

  // "Messung löschen": the points go, the mode stays; a 48 px target
  const clear = result.getByRole('button', { name: 'Messung löschen' });
  expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await clear.click();
  expect(await measured(page)).toBeNull();
  await expect(mode).toBeChecked();
  await expect(arrange.getByTestId('cam-measure-hint')).toBeVisible();
  // Switched off, the points go with the mode
  await tap(1, 1);
  await expect.poll(() => measured(page)).not.toBeNull();
  await mode.uncheck();
  expect(await measured(page)).toBeNull();
  await expect(result).toHaveCount(0);
  // The row of the list still has its three parts
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(3);
});

test('snaps to edge middles and circle centres – and to nothing where nothing is clear', async ({
  page,
}) => {
  const { tap } = await setup(page, true);
  await page
    .getByTestId('cam-arrange')
    .getByRole('checkbox', { name: 'Messen', exact: true })
    .check();
  // The middle of the first plate's top edge (20 20): a tap beside it
  await tap(21, 21);
  await expect.poll(async () => (await measured(page))?.a).toEqual({ x: 20, y: 20 });
  // The centre of the hole (30 60), though the tap is beside it
  await tap(31, 61);
  await expect.poll(async () => (await measured(page))?.b).toEqual({ x: 30, y: 60 });
  const m = (await measured(page))!;
  expect([m.dx, m.dy]).toEqual([10, 40]);
  close(m.distance, Math.hypot(10, 40), 3);
  // Nothing clear: 14 mm from the hole's edge and from every corner – the point is where the finger put it
  await tap(80, 85);
  const free = (await measured(page))!.a;
  expect(Math.abs(free.x - 80)).toBeLessThan(0.6);
  expect(Math.abs(free.y - 85)).toBeLessThan(0.6);
  expect(Number.isInteger(free.x) && Number.isInteger(free.y)).toBe(false);
});

test('a point is taken by its handle and follows the finger, snapping – Alt leaves it free', async ({
  page,
}) => {
  const { arrange, g, mode, tap } = await setup(page, true);
  await mode.check();
  await tap(31, 61); // A on the hole's centre
  await tap(80, 85); // B on a free spot
  await expect.poll(async () => (await measured(page))?.b).not.toBeNull();
  const b0 = (await measured(page))!.b!;
  const result = arrange.getByTestId('cam-measure-result');

  /** Takes the handle at a work point, carries it to another and lets go */
  const drag = async (
    from: { x: number; y: number },
    to: { x: number; y: number },
    keys: string[] = [],
  ) => {
    const start = await tableSpot(page, from);
    const end = await tableSpot(page, to);
    await page.mouse.move(start.x, start.y);
    for (const key of keys) await page.keyboard.down(key);
    await page.mouse.down();
    await page.mouse.move(start.x + 6, start.y);
    await page.mouse.move(end.x + 6, end.y, { steps: 6 });
    await page.mouse.up();
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  };

  // B to a spot beside the corner 100 40 of the second plate: it snaps there. (The finger's offset is the first
  // step – 6 px along x – so the handle lands the same distance behind the finger.)
  await drag(b0, { x: 101, y: 41 });
  await expect.poll(async () => (await measured(page))?.b).toEqual({ x: 100, y: 40 });
  const m = (await measured(page))!;
  expect(m.a).toEqual({ x: 30, y: 60 });
  expect([m.dx, m.dy]).toEqual([70, -20]);
  close(m.angle, (Math.atan2(-20, 70) * 180) / Math.PI, 3);
  await expect(arrange.getByTestId('cam-measure-dy')).toHaveText('−20,00 mm');
  // The view did not move and nothing was selected by it
  expect(await selected(page)).toBeNull();
  expect(Math.abs((await restingTable(page)).scale - g.scale)).toBeLessThan(1e-9);

  // With Alt held the same drag leaves the point where it came to: 1 mm beside the corner, not on it
  await drag({ x: 100, y: 40 }, { x: 101, y: 41 }, ['Alt']);
  await expect.poll(async () => (await measured(page))?.b?.x).toBeGreaterThan(100.3);
  const free = (await measured(page))!.b!;
  expect(free.x).toBeLessThan(101.8);
  expect(free.y).toBeGreaterThan(40.3);
  await expect(result).toContainText('Abstand');
});

test('a tap close to A is B – a line shorter than a finger is measured by tapping, and both stay when a point is tapped again', async ({
  page,
}) => {
  const { arrange, mode, tap } = await setup(page);
  await mode.check();
  // A on the lower left corner of the third plate; B 4 mm to the right and 2 up – inside the finger's reach of A,
  // outside the reach of a snap (12 px: 3.5 mm here) of A and of the middle of the plate's left edge (60 105)
  await tap(61, 101);
  await expect.poll(async () => (await measured(page))?.a).toEqual({ x: 60, y: 100 });
  await tap(64, 102);
  await expect.poll(async () => (await measured(page))?.b).not.toBeNull();
  const m = (await measured(page))!;
  expect(m.a).toEqual({ x: 60, y: 100 });
  close(m.b!.x, 64, 0);
  close(m.b!.y, 102, 0);
  close(m.distance, Math.hypot(m.b!.x - 60, m.b!.y - 100), 3);
  await expect(arrange.getByTestId('cam-measure-distance')).toContainText('mm');
  // With both there, a tap on one of them leaves things as they are (it is no way to a third point)
  const again = await tableSpot(page, { x: m.b!.x, y: m.b!.y });
  await page.waitForTimeout(400);
  await page.mouse.click(again.x, again.y);
  await page.waitForTimeout(300);
  expect(await measured(page)).toEqual(m);
});

test('a double click is a double tap – never two points: the first tap is taken back and the view answers', async ({
  page,
}) => {
  const { arrange, mode, tap } = await setup(page);
  await mode.check();
  await tap(1, 1);
  await tap(131, 71);
  await expect.poll(async () => (await measured(page))?.b).toEqual({ x: 130, y: 70 });
  const pair = (await measured(page))!;
  const fitted = await restingTable(page);

  /** Two clicks in a row on a work point, as a hand makes a double tap (after the pause of an earlier one) */
  const double = async (x: number, y: number) => {
    const at = await tableSpot(page, { x, y });
    expect(await onStage(page, at), `${x},${y} is on the stage`).toBe(true);
    await page.waitForTimeout(400);
    await page.mouse.dblclick(at.x, at.y);
  };

  // On B itself, where a finger takes the point: nothing is moved or set, the view comes closer to the spot
  await double(130, 70);
  await expect
    .poll(async () => (await restingTable(page)).scale / fitted.scale)
    .toBeCloseTo(2.5, 1);
  expect(await measured(page)).toEqual(pair);

  // On a free spot of the zoomed view (the first tap would have started A anew, and B gone): back to the whole
  // table, and the pair is as it was
  const zoomed = await restingTable(page);
  const free = await tableWork(page, {
    x: zoomed.box.x + zoomed.box.width / 2,
    y: zoomed.box.y + zoomed.box.height / 2 + 60,
  });
  await double(free.x, free.y);
  await expect.poll(async () => (await restingTable(page)).scale / fitted.scale).toBeCloseTo(1, 2);
  expect(await measured(page)).toEqual(pair);

  // With A alone and a double tap beside it – inside a finger's reach, where one tap would be B: A alone stays
  await arrange.getByRole('button', { name: 'Messung löschen' }).click();
  await tap(61, 101);
  await expect.poll(async () => (await measured(page))?.a).toEqual({ x: 60, y: 100 });
  await double(64, 102);
  await expect
    .poll(async () => (await restingTable(page)).scale / fitted.scale)
    .toBeCloseTo(2.5, 1);
  expect(await measured(page)).toMatchObject({ a: { x: 60, y: 100 }, b: null });

  // Two taps with a pause between are two points, as ever (the view is zoomed now: a plain tap leaves it alone)
  const spot = await tableSpot(page, { x: 64, y: 102 });
  await page.waitForTimeout(400);
  await page.mouse.click(spot.x, spot.y);
  await expect.poll(async () => (await measured(page))?.b).not.toBeNull();
});

test('a double tap whose first tap was a finger on a point – and whose second lands beyond the reach of every point – is a double tap too', async ({
  page,
}) => {
  const { mode, tap } = await setup(page);
  await mode.check();
  await tap(61, 101);
  await expect.poll(async () => (await measured(page))?.a).toEqual({ x: 60, y: 100 });
  const whole = await restingTable(page);
  const on = await tableSpot(page, { x: 60, y: 100 });
  const beside = { x: on.x + 30, y: on.y };
  expect(await onStage(page, beside), 'the second tap is on the stage').toBe(true);
  await page.waitForTimeout(400);
  // The first is a finger on A (it would be B), the second 30 px away: past the finger's reach (24 px) of A and B,
  // inside the slop of a double tap (36 px). The first is taken back, the view answers
  await page.mouse.click(on.x, on.y);
  await page.mouse.click(beside.x, beside.y);
  await expect
    .poll(async () => Math.abs((await restingTable(page)).scale / whole.scale - 1))
    .toBeGreaterThan(0.01);
  expect(await measured(page)).toMatchObject({ a: { x: 60, y: 100 }, b: null });
});

test('the modes that give a tap another meaning end it – and it ends them', async ({ page }) => {
  const { arrange, mode, tap } = await setup(page);
  const multi = arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' });
  const band = arrange.getByRole('checkbox', { name: 'Rahmen aufziehen' });
  await mode.check();
  await tap(1, 1);
  await expect.poll(() => measured(page)).not.toBeNull();
  // Each of the two ends measuring, and takes its points away
  await multi.check();
  await expect(mode).not.toBeChecked();
  expect(await measured(page)).toBeNull();
  await multi.uncheck();
  await mode.check();
  await expect(multi).not.toBeChecked();
  await band.check();
  await expect(mode).not.toBeChecked();
  await mode.check();
  await expect(band).not.toBeChecked();
  // Measuring does not stop the view from panning: a drag beside the points moves it
  const before = (await restingTable(page)).originX;
  const from = await tableSpot(page, { x: 30, y: 60 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await tableGeometry(page)).originX).toBeGreaterThan(before + 20);
  // …and a plate's line is no handle: nothing was moved, nothing selected
  expect(await selected(page)).toBeNull();
});

async function tableGeometry(page: Page) {
  const text = (await table(page).getAttribute('data-view')) ?? '';
  const [scale = 0, originX = 0, originY = 0] = text.split(',').map(Number);
  return { scale, originX, originY };
}
