import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  drawShape,
  drawThreePlates,
  inReach,
  onStage,
  openApp,
  rested,
  restingTable,
  tableSpot,
} from './helpers';

/**
 * The holding tabs of a part ("Haltestege"): drawn on the table where they stand, with values of their
 * own, spread evenly or put by hand with a finger – and the program lifts the cutter at exactly those
 * places. The table shows them in `data-drawing-tabs`: per part its sites (contour, fraction of its line,
 * place, width, number in the part's own list).
 */

interface Site {
  c: number;
  u: number;
  x: number;
  y: number;
  w: number;
  index: number;
}
interface Marks {
  item: number;
  selected: boolean;
  sites: Site[];
}

const marks = async (page: Page): Promise<Marks[]> =>
  JSON.parse((await page.getByTestId('table-view').getAttribute('data-drawing-tabs')) ?? '[]');
/** The sites of the (one) part, in the order of its line */
const sites = async (page: Page) => (await marks(page))[0]?.sites ?? [];
const xy = (list: Site[]) => list.map((s) => [s.x, s.y]);

/** The program of the drawing as the workspace saves it. */
async function drawnProgram(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-card').getByRole('button', { name: 'Als .nc speichern' }).click();
  return readFileSync(await (await download).path(), 'utf8');
}

/**
 * Where the cutter is lifted over a tab in a program: from where it goes up to the height of the tabs
 * to where it comes down again. Of a cut 6 deep in one pass with tabs 2 high that is z −4.
 */
function lifts(program: string, z = -4) {
  let x = 0;
  let y = 0;
  let at = 0;
  let from: number[] = [];
  const out: { from: number[]; to: number[] }[] = [];
  for (const line of program.split('\n')) {
    const m = /^(?:G[01]\s+)?((?:[XYZ]-?\d+(?:\.\d+)?\s*)+)(?:F\d+)?$/.exec(line);
    if (!m) continue;
    const was = at;
    for (const word of m[1]!.trim().split(/\s+/)) {
      const v = Number(word.slice(1));
      if (word[0] === 'X') x = v;
      else if (word[0] === 'Y') y = v;
      else at = v;
    }
    if (at === z && was !== z) from = [x, y];
    else if (was === z && at !== z) out.push({ from, to: [x, y] });
  }
  return out;
}

/** One straight cutter path along the lower side lifts around the tab at x: its middle is the tab's */
const liftsAt = (program: string, x: number) =>
  lifts(program).filter(
    (l) =>
      Math.abs(l.from[1]! - l.to[1]!) < 1e-6 &&
      l.from[1]! < 0 &&
      Math.abs((l.from[0]! + l.to[0]!) / 2 - x) < 0.6,
  );

test('shows the tabs on the table, in their width, and takes values of their own per part', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  // A 100 × 60 plate: cut outside, tabs on – the drawing's defaults are four of 6 mm
  await drawShape(page, 'Rechteck');
  await restingTable(page);
  await expect.poll(async () => (await sites(page)).length).toBe(4);
  const [mark] = await marks(page);
  expect(mark!.selected).toBe(true);
  // 320 mm round: at 40, 120, 200 and 280 – the middle of each quarter
  expect(xy(mark!.sites)).toEqual([
    [40, 0],
    [100, 20],
    [60, 60],
    [0, 40],
  ]);
  expect(mark!.sites.map((s) => s.w)).toEqual([6, 6, 6, 6]);
  // The sites of an automatic part have no place in a list of their own
  expect(mark!.sites.map((s) => s.index)).toEqual([-1, -1, -1, -1]);

  // The panel of this part opens on demand – the part is selected and has tabs, and still nothing opened by itself
  const panel = cam.getByTestId('cam-tabs');
  await expect(panel).toHaveCount(0);
  const openIt = cam.getByTestId('cam-tabs-open');
  expect((await openIt.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await openIt.click();
  // The panel of this part: automatic, with the drawing's values shown as what an empty field takes
  await expect(panel).toBeVisible();
  expect((await panel.getByTestId('cam-tabs-close').boundingBox())!.height).toBeGreaterThanOrEqual(
    47.5,
  );
  await expect(panel.getByRole('button', { name: 'Automatisch' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const count = panel.getByRole('textbox', { name: /^Anzahl/ });
  const width = panel.getByRole('textbox', { name: /^Breite/ });
  const height = panel.getByRole('textbox', { name: /^Höhe/ });
  await expect(count).toHaveAttribute('placeholder', '4');
  await expect(width).toHaveAttribute('placeholder', '6');
  await expect(height).toHaveAttribute('placeholder', '2');
  await expect(count).toHaveValue('');
  // Every control is a touch target
  for (const control of [count, width, height, panel.getByRole('button', { name: 'Von Hand' })]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  }

  // Two tabs, 10 mm wide: at a quarter and three quarters of the line
  await count.fill('2');
  await width.fill('10');
  await expect
    .poll(async () => xy(await sites(page)))
    .toEqual([
      [80, 0],
      [20, 60],
    ]);
  expect((await sites(page)).map((s) => s.w)).toEqual([10, 10]);
  // A value that differs from the drawing's says so, beside its label
  await expect(panel.getByText(/Weicht von der Empfehlung ab/).first()).toBeAttached();
  // Beyond what a tab can be, the field comes back with the number it took
  await width.fill('500');
  await expect(width).toHaveValue('100');
  await width.fill('10');
  await expect.poll(async () => (await sites(page))[0]?.w).toBe(10);

  // The program lifts the cutter there – and only there (a single pass and a straight plunge, so the
  // tabs stand at one height)
  await cam.getByText('Erweitert', { exact: true }).click();
  await cam.getByLabel('Zustellung (mm)', { exact: true }).fill('6');
  await cam.getByLabel('Rampe (°, 90 = senkrecht)', { exact: true }).fill('90');
  await expect(table).toHaveAttribute('data-drawing-tabs', /"w":10/);
  const program = await drawnProgram(page);
  expect(lifts(program)).toHaveLength(2);
  expect(liftsAt(program, 80)).toHaveLength(1);
  // …and the width the cutter lifts over is the tab and the cutter: 10 mm and its diameter
  const [lift] = liftsAt(program, 80);
  expect(Math.abs(lift!.to[0]! - lift!.from[0]!)).toBeGreaterThan(10);

  // The defaults under "Erweitert" are named as such; an empty field takes them again
  await expect(cam.getByLabel('Standard-Stegbreite (mm)', { exact: true })).toHaveValue('6');
  await count.fill('');
  await width.fill('');
  await expect.poll(async () => (await sites(page)).length).toBe(4);
  expect((await sites(page)).map((s) => s.w)).toEqual([6, 6, 6, 6]);

  // The box of the part is the switch: off, the tabs and their panel are gone
  await cam.getByRole('checkbox', { name: 'Haltestege' }).first().uncheck();
  await expect(table).not.toHaveAttribute('data-drawing-tabs');
  await expect(panel).toHaveCount(0);
});

test('puts tabs by hand: a tap on the line sets one, a drag moves it along, a tap takes it away', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  await drawShape(page, 'Rechteck');
  const panel = cam.getByTestId('cam-tabs');
  await cam.getByTestId('cam-tabs-open').click();
  await panel.getByRole('textbox', { name: /^Anzahl/ }).fill('2');
  await panel.getByRole('textbox', { name: /^Breite/ }).fill('10');
  await cam.getByText('Erweitert', { exact: true }).click();
  await cam.getByLabel('Zustellung (mm)', { exact: true }).fill('6');
  await cam.getByLabel('Rampe (°, 90 = senkrecht)', { exact: true }).fill('90');
  await restingTable(page);
  await expect
    .poll(async () => xy(await sites(page)))
    .toEqual([
      [80, 0],
      [20, 60],
    ]);

  // By hand: it starts from the even spread – the two tabs stay where they are, now in a list
  await panel.getByRole('button', { name: 'Von Hand' }).click();
  await expect(panel.getByRole('button', { name: 'Von Hand' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.getByRole('textbox', { name: /^Anzahl/ })).toHaveCount(0);
  expect(xy(await sites(page))).toEqual([
    [80, 0],
    [20, 60],
  ]);
  expect((await sites(page)).map((s) => s.index)).toEqual([0, 1]);
  const evenly = panel.getByRole('button', { name: 'Gleichmäßig verteilen' });
  await expect(evenly).toBeEnabled();

  // Without "Stege setzen" a finger on the table does what it did: a tap on the line adds nothing
  const place = panel.getByRole('button', { name: 'Stege setzen' });
  await expect(place).toHaveAttribute('aria-pressed', 'false');
  expect((await place.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  const onLine = await tableSpot(page, { x: 30, y: 0 });
  expect(await onStage(page, onLine)).toBe(true);
  await page.mouse.click(onLine.x, onLine.y);
  await page.waitForTimeout(400);
  expect(await sites(page)).toHaveLength(2);
  // (the part stays selected, its handles are there)
  await expect(table).toHaveAttribute('data-drawing-frame', /.+/);

  // "Stege setzen": the part's handles step aside and the hint says how it goes
  await place.click();
  await expect(place).toHaveAttribute('aria-pressed', 'true');
  await expect(table).toHaveAttribute('data-drawing-placing', '1');
  await expect(table).not.toHaveAttribute('data-drawing-frame');
  await expect(panel.getByTestId('cam-tabs-hint')).toContainText('Auf die Kontur tippen');

  // A tap on the line sets a tab at the nearest place
  await page.mouse.click(onLine.x, onLine.y);
  await expect.poll(async () => (await sites(page)).length).toBe(3);
  const added = (await sites(page)).find((s) => s.index === 2)!;
  expect(added.y).toBeCloseTo(0, 6);
  expect(Math.abs(added.x - 30)).toBeLessThan(1.5);
  // A tap beside the line (inside the plate, far from it) sets none
  await page.waitForTimeout(400);
  const inside = await tableSpot(page, { x: 50, y: 30 });
  expect(await onStage(page, inside)).toBe(true);
  await page.mouse.click(inside.x, inside.y);
  await page.waitForTimeout(400);
  expect(await sites(page)).toHaveLength(3);

  // A drag along the line moves the tab; it stays on the line, and the whole drag is one step
  const from = await tableSpot(page, { x: added.x, y: added.y });
  const to = await tableSpot(page, { x: 55, y: 0 });
  expect(await onStage(page, to)).toBe(true);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y - 20, { steps: 8 });
  // While the finger is down the picture follows it (the toolpath waits)
  await expect
    .poll(async () => (await sites(page)).find((s) => s.index === 2)!.x)
    .toBeGreaterThan(40);
  await page.mouse.up();
  const moved = await rested(page, async () => (await sites(page)).find((s) => s.index === 2)!);
  expect(moved.y).toBeCloseTo(0, 6);
  // The finger went 25 mm; the part of the way it moved while still inside the tap slop does not count
  // (the view's gesture layer starts the drag where the finger left it), so it lands a little short
  expect(moved.x).toBeGreaterThan(45);
  expect(moved.x).toBeLessThanOrEqual(55.5);
  expect(moved.u).toBeCloseTo(moved.x / 320, 3);

  // The program lifts at the places that stand there now
  const program = await drawnProgram(page);
  expect(lifts(program)).toHaveLength(3);
  expect(liftsAt(program, 80)).toHaveLength(1);
  expect(liftsAt(program, moved.x)).toHaveLength(1);

  // One step back: the tab is where it was set
  await cam.getByRole('button', { name: 'Rückgängig' }).click();
  await expect
    .poll(async () => Math.abs((await sites(page)).find((s) => s.index === 2)!.x - added.x))
    .toBeLessThan(0.01);
  await cam.getByRole('button', { name: 'Wiederholen' }).click();
  await expect
    .poll(async () => Math.abs((await sites(page)).find((s) => s.index === 2)!.x - moved.x))
    .toBeLessThan(0.01);

  // A tap on a tab takes it away
  const there = await tableSpot(page, { x: moved.x, y: 0 });
  expect(await onStage(page, there)).toBe(true);
  await page.mouse.click(there.x, there.y);
  await expect.poll(async () => (await sites(page)).length).toBe(2);
  await page.waitForTimeout(400);

  // No tab at all by hand: the warning says the part is not held – and the program has no lift
  for (const s of await sites(page)) {
    const spot = await tableSpot(page, { x: s.x, y: s.y });
    expect(await onStage(page, spot)).toBe(true);
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(400);
  }
  await expect.poll(async () => (await sites(page)).length).toBe(0);
  await expect(panel.getByTestId('cam-tabs-warning')).toContainText(
    'Keine Stege gesetzt – das Teil wird nicht gehalten',
  );
  expect(lifts(await drawnProgram(page))).toHaveLength(0);
  // A tab put again takes the warning away
  await page.mouse.click(onLine.x, onLine.y);
  await expect.poll(async () => (await sites(page)).length).toBe(1);
  await expect(panel.getByTestId('cam-tabs-warning')).toHaveCount(0);

  // "Stege setzen" off again: the handles are back. Back to automatic: the even spread, no list
  await place.click();
  await expect(table).toHaveAttribute('data-drawing-frame', /.+/);
  await expect(table).not.toHaveAttribute('data-drawing-placing');
  await evenly.click();
  await expect(panel.getByRole('button', { name: 'Automatisch' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(async () => (await sites(page)).length).toBe(2);
  expect((await sites(page)).map((s) => s.index)).toEqual([-1, -1]);
  await expect(evenly).toBeDisabled();
});

test('keeps the places of the tabs when the part is moved, and carries them into a copy and a project', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await drawShape(page, 'Rechteck');
  const panel = cam.getByTestId('cam-tabs');
  await cam.getByTestId('cam-tabs-open').click();
  await panel.getByRole('button', { name: 'Von Hand' }).click();
  await expect.poll(async () => (await sites(page)).length).toBe(4);
  const before = await sites(page);
  // Moved by 25 mm to the right: every tab went along
  await cam.getByTestId('cam-arrange').getByLabel('X links (mm)', { exact: true }).fill('25');
  await expect
    .poll(async () => (await sites(page)).map((s) => Math.round(s.x - 25)))
    .toEqual(before.map((s) => Math.round(s.x)));
  // A copy beside it stands with its tabs by hand as well: two parts, eight tabs
  await cam.getByRole('button', { name: /Duplizieren/ }).click();
  await expect.poll(async () => (await marks(page)).length).toBe(2);
  expect((await marks(page)).flatMap((m) => m.sites)).toHaveLength(8);
  expect((await marks(page)).every((m) => m.sites.every((s) => s.index >= 0))).toBe(true);
  // A project file keeps them, and opens the same
  const saving = page.waitForEvent('download');
  await cam.getByTestId('cam-project-save').click();
  const file = JSON.parse(readFileSync(await (await saving).path(), 'utf8'));
  expect(file.items[0].tabSpec.mode).toBe('manual');
  expect(file.items[0].tabSpec.at).toHaveLength(4);
  expect(file.version).toBe(1);
});

test('the panel of the tabs opens on demand only: nothing that selects changes the height of a row', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const arrange = cam.getByTestId('cam-arrange');
  const table = page.getByTestId('table-view');
  // Three plates, each with its tabs on
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
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  await expect(rows).toHaveCount(3);
  const heights = () => rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  const still = await heights();
  const unchanged = async (what: string) => {
    // the picture and the list follow a moment after a tap
    await page.waitForTimeout(200);
    const now = await heights();
    for (const [i, h] of now.entries()) {
      expect(Math.abs(h - still[i]!), `${what}: row ${i + 1}`).toBeLessThan(0.5);
    }
    await expect(cam.getByTestId('cam-tabs')).toHaveCount(0);
  };
  // Every row has the button, a full target, and none has a panel
  await expect(cam.getByTestId('cam-tabs-open')).toHaveCount(3);
  for (const button of await cam.getByTestId('cam-tabs-open').all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  }
  await unchanged('three plates drawn');

  // Drawing a fourth shape adds a row below them: the three rows above keep their height
  await drawShape(page, 'Kreis');
  await expect(rows).toHaveCount(4);
  await page.waitForTimeout(200);
  const four = await heights();
  for (const i of [0, 1, 2])
    expect(Math.abs(four[i]! - still[i]!), `row ${i + 1}`).toBeLessThan(0.5);
  await cam.getByRole('button', { name: 'Kontur 4 entfernen' }).click();
  await expect(rows).toHaveCount(3);
  await unchanged('the fourth shape removed again');

  // Selecting: the boxes of the rows, the names, everything, invert, nothing
  for (const n of [1, 2, 3]) {
    await cam.getByRole('checkbox', { name: `Kontur ${n} zur Auswahl` }).click();
    await unchanged(`box ${n}`);
  }
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await unchanged('select all');
  await arrange.getByRole('button', { name: 'Auswahl umkehren', exact: true }).click();
  await unchanged('invert');
  await cam.getByRole('button', { name: /^2\. / }).click();
  await unchanged('name of row 2');

  // A tap on the table picks a part; with "Mehrfachauswahl" on it takes parts in
  await restingTable(page);
  const tap = async (x: number, y: number) => {
    const at = await tableSpot(page, { x, y });
    expect(await onStage(page, at)).toBe(true);
    await page.waitForTimeout(400);
    await page.mouse.click(at.x, at.y);
  };
  await tap(20, 10);
  await expect(table).toHaveAttribute('data-drawing-selected', '0.0,0.0,40.0,20.0');
  await unchanged('a tap on the table');
  await arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' }).check();
  await unchanged('Mehrfachauswahl on');
  await tap(115, 55);
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  await unchanged('a part taken in with Mehrfachauswahl');
  await arrange.getByRole('checkbox', { name: 'Mehrfachauswahl' }).uncheck();

  // On demand: the button of row 2 opens its panel there – and in no other row; its own button closes it
  const open = cam.getByRole('button', { name: 'Stege von Teil 2 einstellen' });
  await open.click();
  const panel = cam.getByTestId('cam-tabs');
  await expect(panel).toHaveCount(1);
  await expect(rows.nth(1).getByTestId('cam-tabs')).toBeVisible();
  await expect(cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' })).toBeChecked();
  await expect(cam.getByRole('checkbox', { name: 'Kontur 1 zur Auswahl' })).not.toBeChecked();
  const opened = await heights();
  expect(opened[1]!).toBeGreaterThan(still[1]! + 100);
  expect(Math.abs(opened[0]! - still[0]!)).toBeLessThan(0.5);
  expect(Math.abs(opened[2]! - still[2]!)).toBeLessThan(0.5);
  // Ticking another box lets go of "alone": the panel closes, the rows are as they were
  await cam.getByRole('checkbox', { name: 'Kontur 3 zur Auswahl' }).click();
  await unchanged('a second part taken in while a panel was open');
  await open.click();
  await expect(panel).toHaveCount(1);
  await panel.getByRole('button', { name: 'Haltestege von Teil 2 schließen' }).click();
  await unchanged('the panel closed by its own button');
  // The box of the tabs ticked off and on again opens the panel (and selects that part alone)
  const tabsBox = rows.nth(0).getByRole('checkbox', { name: 'Haltestege' });
  await tabsBox.uncheck();
  await tabsBox.check();
  await expect(rows.nth(0).getByTestId('cam-tabs')).toBeVisible();
  await expect(cam.getByRole('checkbox', { name: 'Kontur 1 zur Auswahl' })).toBeChecked();
  await expect(cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' })).not.toBeChecked();
  // "Stege setzen" is in the panel: starting it keeps the panel open
  await panel.getByRole('button', { name: 'Von Hand' }).click();
  await panel.getByRole('button', { name: 'Stege setzen' }).click();
  await expect(table).toHaveAttribute('data-drawing-placing', '1');
  await expect(panel).toHaveCount(1);
  // …and closing the panel ends putting tabs
  await panel.getByRole('button', { name: 'Haltestege von Teil 1 schließen' }).click();
  await expect(table).not.toHaveAttribute('data-drawing-placing');
  await expect(panel).toHaveCount(0);
});

/**
 * A control in the middle of the panel (its own scroll only), measured where it stands – a locator's click would
 * scroll once more by itself after the place was taken.
 */
async function centred(control: Locator) {
  await control.evaluate((el) => {
    const body = el.closest<HTMLElement>('.panel-body')!;
    const at = el.getBoundingClientRect();
    const room = body.getBoundingClientRect();
    body.scrollTop += at.top - room.top - (room.height - at.height) / 2;
  });
  await control.page().waitForTimeout(50);
  return (await control.boundingBox())!;
}

test('"Stege einstellen" and the box of the tabs keep their place under the finger – from nothing selected and from a set', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawThreePlates(page);
  const arrange = cam.getByTestId('cam-arrange');
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  const open = (n: number) => cam.getByRole('button', { name: `Stege von Teil ${n} einstellen` });
  /**
   * Taps the control where it stands (a mouse click at a measured point) and says how far the row it is in – the box
   * of that row, which is always there – moved: the control itself gives way to the panel it opens
   */
  const tapAndMeasure = async (control: Locator, n: number) => {
    const pick = cam.getByTestId('cam-pick').nth(n - 1);
    const at = await centred(control);
    const before = (await pick.boundingBox())!;
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    await page.waitForTimeout(250);
    return Math.abs((await pick.boundingBox())!.y - before.y);
  };

  // nothing selected: the card of the selection appears above the list when row 2 is taken
  expect(await tapAndMeasure(open(2), 2)).toBeLessThan(1.5);
  await expect(cam.getByTestId('cam-tabs')).toHaveCount(1);
  await expect(cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' })).toBeChecked();
  // a set of three: the align panel goes when row 1 alone is asked for
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await expect(cam.getByTestId('cam-align')).toBeVisible();
  expect(await tapAndMeasure(open(1), 1)).toBeLessThan(1.5);
  await expect(cam.getByTestId('cam-align')).toHaveCount(0);
  await expect(cam.getByTestId('cam-tabs')).toHaveCount(1);
  // the box of the tabs of a row that is not selected: off and on again selects the part and opens its panel
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  const box = cam.getByTestId('cam-contours').getByRole('listitem').nth(2).getByRole('checkbox', {
    name: 'Haltestege',
  });
  await box.uncheck();
  const tabsBox = box.locator('xpath=ancestor::label');
  const before = await centred(tabsBox);
  await page.mouse.click(before.x + 20, before.y + before.height / 2);
  await page.waitForTimeout(250);
  await expect(box).toBeChecked();
  expect(Math.abs((await tabsBox.boundingBox())!.y - before.y)).toBeLessThan(1.5);
  await expect(cam.getByRole('checkbox', { name: 'Kontur 3 zur Auswahl' })).toBeChecked();
});

/**
 * The panel opens below its row, where the button that opened it stood – and that button is gone with the tap. A row
 * low in the list must not leave the operator with nothing to see: where the panel's head (its name and the way to
 * close it) would lie below the fold, the panel is brought into view. Measured with `inReach`: inside the box that
 * scrolls, and a touch at its middle reaches it (`toBeVisible` cannot see a control below the fold).
 */
async function panelOpensInReach(page: Page, cam: Locator) {
  const scroller = cam.locator('xpath=ancestor::*[contains(@class,"panel-body")][1]');
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Auswahl aufheben' }).click();
  const panel = cam.getByTestId('cam-tabs');
  const close = cam.getByRole('button', { name: 'Haltestege von Teil 3 schließen' });
  // The control at the very bottom of what the panel shows (the panel's own scroll only – a locator's click would
  // scroll to it once more after the place was taken)
  const low = async (control: Locator) => {
    await control.evaluate((el) => {
      const body = el.closest<HTMLElement>('.panel-body')!;
      body.scrollTop += el.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 8;
    });
    await page.waitForTimeout(50);
    const box = (await control.boundingBox())!;
    const area = (await scroller.boundingBox())!;
    expect(box.y + box.height, 'the control to tap is low in the list').toBeGreaterThan(
      area.y + area.height - 24,
    );
    return { x: box.x + 20, y: box.y + box.height / 2 };
  };
  const reached = async (what: string) => {
    await expect(panel, what).toHaveCount(1);
    // the panel is drawn and the scroll that brings it into view is made with it
    await page.waitForTimeout(250);
    const where = await inReach(page, close, scroller);
    expect(where.inside && where.reached, `${what}: ${JSON.stringify(where)}`).toBe(true);
  };

  // (a) the button of the last row
  const spot = await low(cam.getByRole('button', { name: 'Stege von Teil 3 einstellen' }));
  await page.mouse.click(spot.x, spot.y);
  await reached('the button "Stege einstellen"');
  await close.click();
  await expect(panel).toHaveCount(0);

  // (b) the box of the tabs of the last row, off and on again
  const box = cam.getByTestId('cam-contours').getByRole('listitem').nth(2).getByRole('checkbox', {
    name: 'Haltestege',
  });
  await box.uncheck();
  await expect(panel).toHaveCount(0);
  const tick = await low(box.locator('xpath=ancestor::label'));
  await page.mouse.click(tick.x, tick.y);
  await expect(box).toBeChecked();
  await reached('the box "Haltestege"');
}

test('a panel opened low in the list is brought into view – the button that opened it is gone', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawThreePlates(page);
  await panelOpensInReach(page, cam);
});

test('the same on the machine screen (800 × 600), in the sheet at its largest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openApp(page);
  const cam = await drawThreePlates(page);
  await page.locator('[data-slot="sheet-larger"]').click();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  await panelOpensInReach(page, cam);
});
