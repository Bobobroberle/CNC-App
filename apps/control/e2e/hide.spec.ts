import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { drawThreePlates, onStage, openApp, restingTable, tableSpot } from './helpers';

/**
 * The eye of a part ("Teile ausblenden"): a hidden part is not cut, is drawn faint and dashed on the table, cannot
 * be picked by a finger there, and is left out of "Alles auswählen" – but it stays in the list, set apart, where it can
 * be ticked and shown again. Three plates by hand (x from, y from, x to, y to):
 *   1: 0 0 40 20      2: 100 40 130 70      3: 60 100 110 110
 * The table tells where the hidden ones lie in `data-drawing-hidden`, the selection in `data-drawing-selected`.
 */

const B = '100.0,40.0,130.0,70.0';

const selectedBox = async (page: Page) =>
  (await page.getByTestId('table-view').getAttribute('data-drawing-selected')) ?? '';

/** The program of the drawing as the workspace saves it. */
async function drawnProgram(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-card').getByRole('button', { name: 'Als .nc speichern' }).click();
  return readFileSync(await (await download).path(), 'utf8');
}

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

/** Every X a program goes to */
const xs = (text: string) => [...text.matchAll(/X(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));

test('hides a part with its eye: not cut, faint on the table, out of reach of a tap, still in the list', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawThreePlates(page);
  const table = page.getByTestId('table-view');
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  const heights = () => rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  await restingTable(page);
  const all = await drawnProgram(page);
  // plate 2 reaches to x = 130: the cutter goes beyond it
  expect(Math.max(...xs(all))).toBeGreaterThan(130);
  const still = await heights();
  await expect(table).not.toHaveAttribute('data-drawing-hidden');

  // Every row has an eye, a full target
  await expect(cam.getByTestId('cam-eye')).toHaveCount(3);
  for (const eye of await cam.getByTestId('cam-eye').all()) {
    const box = (await eye.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(47.5);
    expect(box.height).toBeGreaterThanOrEqual(47.5);
  }

  // The eye of row 2: the finger stays where it was (nothing above it changes), the row keeps its height
  const eye = cam.getByTestId('cam-eye').nth(1);
  const before = await centred(eye);
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
  await expect(table).toHaveAttribute('data-drawing-hidden', B);
  await page.waitForTimeout(200);
  const after = (await eye.boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThan(1.5);
  const now = await heights();
  for (const [i, h] of now.entries()) expect(Math.abs(h - still[i]!)).toBeLessThan(0.5);
  // set apart, with a word for it (the state is not the look of the row alone) and an eye that says what it does now
  await expect(rows.nth(1)).toHaveClass(/hidden-part/);
  await expect(rows.nth(1)).toContainText('ausgeblendet');
  await expect(cam.getByRole('button', { name: 'Teil 2 einblenden' })).toBeVisible();

  // A hidden part has no tabs on the table: its "Stege einstellen" is closed, with the reason – and keeps its place
  const tabs = cam.getByRole('button', { name: 'Stege von Teil 2 einstellen' });
  await expect(tabs).toBeDisabled();
  await expect(tabs).toHaveAttribute(
    'data-reason',
    'Ein ausgeblendetes Teil hat keine Stege auf dem Tisch – erst einblenden.',
  );
  expect((await tabs.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);

  // Not cut: the cutter does not go to plate 2 any more – plate 3 (to x = 110, and the cutter's radius) is the
  // furthest right now
  const hiddenProgram = await drawnProgram(page);
  expect(hiddenProgram).not.toBe(all);
  expect(Math.max(...xs(hiddenProgram))).toBeLessThan(120);

  // Out of reach of a finger on the table: a tap on its line or inside it picks nothing
  await restingTable(page);
  const tap = async (x: number, y: number) => {
    const at = await tableSpot(page, { x, y });
    expect(await onStage(page, at)).toBe(true);
    await page.waitForTimeout(400);
    await page.mouse.click(at.x, at.y);
  };
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Auswahl aufheben' }).click();
  await tap(100, 55);
  await tap(115, 55);
  await page.waitForTimeout(300);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  // …while a part that is in sight is picked as ever
  await tap(20, 10);
  await expect.poll(() => selectedBox(page)).toBe('0.0,0.0,40.0,20.0');

  // In the list it can be ticked, and then it is selected (and shown on the table as a selected part)
  await cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' }).click();
  await expect.poll(() => selectedBox(page)).toBe('0.0,0.0,130.0,70.0');

  // "Alles auswählen" leaves it out; "Auswahl umkehren" does not bring it in
  const arrange = cam.getByTestId('cam-arrange');
  await arrange.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await expect.poll(() => selectedBox(page)).toBe('0.0,0.0,110.0,110.0');
  await expect(arrange.getByTestId('cam-selected')).toContainText('2 Teile');
  await page.getByTestId('cam-selected').click();
  await page.keyboard.press('Control+a');
  await expect.poll(() => selectedBox(page)).toBe('0.0,0.0,110.0,110.0');
  await cam.getByRole('button', { name: /^1\. / }).click();
  await expect.poll(() => selectedBox(page)).toBe('0.0,0.0,40.0,20.0');
  await arrange.getByRole('button', { name: 'Auswahl umkehren', exact: true }).click();
  // (not into the hidden plate 2: only plate 3 is left in sight)
  await expect.poll(() => selectedBox(page)).toBe('60.0,100.0,110.0,110.0');

  // Shown again: the program is the first one, byte for byte, and the table draws it as any part
  await cam.getByRole('button', { name: 'Teil 2 einblenden' }).click();
  await expect(table).not.toHaveAttribute('data-drawing-hidden');
  expect(await drawnProgram(page)).toBe(all);
  await expect(rows.nth(1)).not.toHaveClass(/hidden-part/);
  const back = await heights();
  for (const [i, h] of back.entries()) expect(Math.abs(h - still[i]!)).toBeLessThan(0.5);
});

test('"Alle einblenden" stands below the list while a part is hidden; with every part hidden there is nothing to cut', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawThreePlates(page);
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  const note = cam.getByTestId('cam-hidden');
  await expect(note).toHaveCount(0);
  const all = await drawnProgram(page);

  await cam.getByTestId('cam-eye').nth(0).click();
  await expect(note).toBeVisible();
  // below the last row, never above the list: what the eye just tapped must not move away from the finger
  const list = (await cam.getByTestId('cam-contours').boundingBox())!;
  const noteBox = (await note.boundingBox())!;
  expect(noteBox.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
  const showAll = note.getByRole('button', { name: 'Alle einblenden' });
  expect((await showAll.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);

  // every part hidden: the job leaves the stage like an empty drawing's, the panel says so, hand-over is closed
  await cam.getByTestId('cam-eye').nth(1).click();
  await cam.getByTestId('cam-eye').nth(2).click();
  await expect(note).toContainText('Alle Teile sind ausgeblendet');
  await expect(cam.getByTestId('cam-hand-over')).toBeDisabled();
  await expect(cam.getByTestId('cam-hand-over')).toHaveAttribute(
    'data-reason',
    'Alle Teile sind ausgeblendet – es gibt nichts zu fräsen.',
  );
  await expect(rows).toHaveCount(3);
  await cam
    .getByTestId('cam-arrange')
    .getByRole('button', { name: 'Alles auswählen', exact: true })
    .click();
  await expect(page.getByTestId('table-view')).not.toHaveAttribute('data-drawing-selected');

  // one tap shows them all; one step of undo hides them again, a second brings the first one back
  await showAll.click();
  await expect(note).toHaveCount(0);
  expect(await drawnProgram(page)).toBe(all);
  await cam.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(note).toContainText('Alle Teile sind ausgeblendet');
});

test('a hidden part is in the project file, and comes back hidden', async ({ page }) => {
  await openApp(page);
  const cam = await drawThreePlates(page);
  const table = page.getByTestId('table-view');
  await cam.getByTestId('cam-eye').nth(1).click();
  await expect(table).toHaveAttribute('data-drawing-hidden', B);
  const hiddenProgram = await drawnProgram(page);

  const saving = page.waitForEvent('download');
  await cam.getByTestId('cam-project-save').click();
  const text = readFileSync(await (await saving).path(), 'utf8');
  const file = JSON.parse(text);
  expect(file.version).toBe(1);
  expect(file.items.map((i: { hidden?: boolean }) => i.hidden)).toEqual([
    undefined,
    true,
    undefined,
  ]);

  // an empty drawing, then the file: the part is hidden as it was, and the drawing makes the same program
  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await expect(cam.getByTestId('cam-contours')).toHaveCount(0);
  await page.getByTestId('cam-project-file').setInputFiles({
    name: 'platten.lowrider.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(3);
  await expect(cam.getByRole('button', { name: 'Teil 2 einblenden' })).toBeVisible();
  await expect(table).toHaveAttribute('data-drawing-hidden', B);
  expect(await drawnProgram(page)).toBe(hiddenProgram);
});

test('the eye stays under the finger: hiding a part of a selected set takes the align panel away, showing it brings it back', async ({
  page,
}) => {
  await openApp(page);
  // The iPad's Safari has no scroll anchoring and Chrome's holds what it likes: the page must hold the row itself
  await page.addStyleTag({ content: '.panel-body { overflow-anchor: none; }' });
  const cam = await drawThreePlates(page);
  const arrange = cam.getByTestId('cam-arrange');
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  // Rows 1 and 2 ticked: two parts, the align panel (about ten targets) stands above the list
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 1 zur Auswahl' }).click();
  await cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' }).click();
  await expect(cam.getByTestId('cam-align')).toBeVisible();

  // The eye of row 2 at a place measured once; the same place is tapped twice, without looking again
  const eye = cam.getByTestId('cam-eye').nth(1);
  const at = await centred(eye);
  const spot = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
  const heights = () => rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  const still = await heights();

  // Hidden, one part is left in sight: aligning has nothing to do any more and its panel goes – the eye stays
  await page.mouse.click(spot.x, spot.y);
  await expect(rows.nth(1)).toHaveClass(/hidden-part/);
  await expect(cam.getByTestId('cam-align')).toHaveCount(0);
  await page.waitForTimeout(200);
  expect(Math.abs((await eye.boundingBox())!.y - at.y), 'the eye after hiding').toBeLessThan(1.5);

  // Shown again by a second tap at the same place: the panel returns above the list and still the eye is there
  await page.mouse.click(spot.x, spot.y);
  await expect(rows.nth(1)).not.toHaveClass(/hidden-part/);
  await expect(cam.getByTestId('cam-align')).toBeVisible();
  await page.waitForTimeout(200);
  expect(Math.abs((await eye.boundingBox())!.y - at.y), 'the eye after showing').toBeLessThan(1.5);
  const back = await heights();
  for (const [i, h] of back.entries()) expect(Math.abs(h - still[i]!)).toBeLessThan(0.5);
});

test('a hidden row is set apart without lowering the contrast of anything in it', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawThreePlates(page);
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  await cam.getByTestId('cam-eye').nth(1).click();
  await expect(rows.nth(1)).toHaveClass(/hidden-part/);
  // Nothing in the row is faded (text needs 7:1, a control 4.5:1 – half-transparent text does neither): the name, the
  // word for the state, the fields and the enabled buttons draw at full strength – measured as the product of the
  // opacities from the row down to the thing itself (what a control's own design fades, an icon or a disabled one,
  // is not looked at), in a row that is not selected and in a selected one
  const fading = () =>
    rows.nth(1).evaluate((row) => {
      const faded: string[] = [];
      const things = row.querySelectorAll<HTMLElement>(
        '.cam-name, .cam-state, select, input:not([type="checkbox"]), button:not([disabled]), .cam-options, .cam-depth',
      );
      for (const el of things) {
        let seen = 1;
        for (let up: HTMLElement | null = el; up; up = up.parentElement) {
          seen *= Number(getComputedStyle(up).opacity);
          if (up === row) break;
        }
        if (seen < 0.999)
          faded.push(`${el.tagName}.${el.className.toString().slice(0, 30)}: ${seen}`);
      }
      return faded;
    });
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Auswahl aufheben' }).click();
  expect(await fading()).toEqual([]);
  await cam.getByRole('checkbox', { name: 'Kontur 2 zur Auswahl' }).click();
  await expect(rows.nth(1)).toHaveClass(/selected/);
  expect(await fading()).toEqual([]);
  // …and it still reads as another kind of row: the word, and a dashed outline like the part's on the table
  await expect(rows.nth(1)).toContainText('ausgeblendet');
  expect(await rows.nth(1).evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  expect(await rows.nth(0).evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
});
