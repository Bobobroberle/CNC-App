import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { goTo, inReach, openApp } from './helpers';

/**
 * The faces of a text ("Schriftart") and the licences that travel with them. A text is set in one of four
 * single-line faces – Standard (the app's own), Einfach, Schreibschrift, Modern – chosen in the block "Schrift" at the
 * top of the card of the selection; the table is the preview and the program is what is cut. The notices and licence
 * texts of the three faces that are not the app's own are readable in the app, offline, under Einstellungen →
 * Maschine → Schriften und Lizenzen.
 */

const FACES = ['Standard', 'Einfach', 'Schreibschrift', 'Modern'] as const;
const VALUES = {
  Standard: 'standard',
  Einfach: 'simplex',
  Schreibschrift: 'script',
  Modern: 'modern',
} as const;
const root = fileURLToPath(new URL('../../..', import.meta.url));
const licenceFile = (name: string) => readFileSync(join(root, 'licenses', name), 'utf8');

async function drawing(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  return page.getByTestId('cam-card');
}

const addText = (cam: Locator) =>
  cam.getByTestId('cam-add').getByRole('button', { name: 'Text', exact: true }).click();

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

const selectOf = (cam: Locator) => cam.getByLabel('Schriftart', { exact: true });
const wordsOf = (cam: Locator) => cam.getByTestId('cam-text');
const heightOf = (cam: Locator) => cam.getByLabel('Schrifthöhe (mm)', { exact: true });

/** The boxes of the rows of the list: how high each one is */
async function rowHeights(cam: Locator) {
  const rows = await cam.getByTestId('cam-contours').getByRole('listitem').all();
  return Promise.all(rows.map(async (row) => (await row.boundingBox())!.height));
}

/**
 * Where the three fields of the block stand in the panel that scrolls – in its own content, so that the browser
 * scrolling a focused field into view does not count as a field that moved
 */
async function fieldTops(cam: Locator) {
  const tops: number[] = [];
  for (const field of [wordsOf(cam), selectOf(cam), heightOf(cam)]) {
    tops.push(
      await field.evaluate((el) => {
        const body = el.closest<HTMLElement>('.panel-body')!;
        return el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      }),
    );
  }
  return tops;
}

test('picks the face with one select: the program is another one for each face, and the standard face gives it back byte for byte', async ({
  page,
}) => {
  const cam = await drawing(page);
  await addText(cam);
  const select = selectOf(cam);
  // names only, in the order of the faces – the table is the preview
  await expect(select.locator('option')).toHaveText([...FACES]);
  await expect(select).toHaveValue('standard');
  const standard = await program(page);
  expect(standard).toContain('G21');
  const seen = new Set([standard]);
  for (const face of FACES.slice(1)) {
    await select.selectOption({ label: face });
    await expect(select).toHaveValue(VALUES[face]);
    const made = await program(page);
    expect(seen.has(made), `${face} writes the word its own way`).toBe(false);
    seen.add(made);
  }
  await select.selectOption({ label: 'Standard' });
  expect(await program(page)).toBe(standard);
  // the words and the height were not touched by any of it
  await expect(wordsOf(cam)).toHaveValue('Text');
  await expect(heightOf(cam)).toHaveValue('20');
});

test('a face is one step of undo – the program, the select and the table come back', async ({
  page,
}) => {
  const cam = await drawing(page);
  await addText(cam);
  const standard = await program(page);
  await selectOf(cam).selectOption({ label: 'Schreibschrift' });
  const script = await program(page);
  expect(script).not.toBe(standard);
  await cam.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(selectOf(cam)).toHaveValue('standard');
  expect(await program(page)).toBe(standard);
  await cam.getByRole('button', { name: 'Wiederholen' }).click();
  await expect(selectOf(cam)).toHaveValue('script');
  expect(await program(page)).toBe(script);
});

test('the block "Schrift" is the first thing of the card of a selected text – above the switches – and every control is a full target', async ({
  page,
}) => {
  const cam = await drawing(page);
  await addText(cam);
  const block = cam.getByTestId('cam-text-block');
  await expect(block).toBeVisible();
  const blockTop = (await block.boundingBox())!.y;
  for (const later of [
    cam.getByTestId('cam-multi'),
    cam.getByTestId('cam-marquee'),
    cam.getByRole('button', { name: 'Alles auswählen' }),
    cam.getByRole('button', { name: 'Duplizieren' }),
  ]) {
    expect((await later.boundingBox())!.y, 'comes after the block').toBeGreaterThan(blockTop);
  }
  // the words, the face and the height are in it; the room between letters and lines is folded away in it
  await expect(block.getByTestId('cam-text')).toHaveCount(1);
  await expect(block.getByLabel('Schriftart', { exact: true })).toHaveCount(1);
  await expect(block.getByLabel('Schrifthöhe (mm)', { exact: true })).toHaveCount(1);
  await expect(block.getByTestId('cam-text-more')).toHaveCount(1);
  const more = cam.getByTestId('cam-text-more').getByRole('button', {
    name: 'Schrift: Ausrichtung und Abstände',
  });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  // 48 px for a finger: the select, the field of the words, the height and the fold's head
  for (const [name, control] of [
    ['the face', selectOf(cam)],
    ['the words', wordsOf(cam)],
    ['the height', heightOf(cam)],
    ['the fold', more],
  ] as const) {
    const box = (await control.boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(47.5);
    expect(box.width, name).toBeGreaterThanOrEqual(47.5);
  }
  // the spacing and the lines are there to be opened
  await more.click();
  await expect(cam.getByLabel('Buchstabenabstand (± %)')).toBeVisible();
  await expect(cam.getByLabel('Zeilenabstand (%)')).toBeVisible();
});

test('nothing moves under the finger: no row of the list changes its height, and the fields of the block stay where they are when the note comes and goes', async ({
  page,
}) => {
  const cam = await drawing(page);
  // a plate, a text and a hole: three rows
  await cam.getByTestId('cam-add').getByRole('button', { name: 'Rechteck', exact: true }).click();
  await addText(cam);
  await cam.getByTestId('cam-add').getByRole('button', { name: 'Kreis', exact: true }).click();
  await cam.getByTestId('cam-contours').getByRole('button', { name: /Text/ }).first().click();
  await expect(wordsOf(cam)).toBeVisible();
  const heights = await rowHeights(cam);
  expect(heights).toHaveLength(3);
  const tops = await fieldTops(cam);

  const same = async (what: string) => {
    expect(await rowHeights(cam), `${what}: the rows`).toEqual(heights);
    expect(await fieldTops(cam), `${what}: the fields`).toEqual(tops);
  };
  for (const face of FACES.slice(1)) {
    await selectOf(cam).selectOption({ label: face });
    await same(`face ${face}`);
  }
  // typing what a face lacks: the note comes below the fields
  await wordsOf(cam).fill('Hallo ☺');
  await expect(cam.getByTestId('cam-text-missing')).toBeVisible();
  await same('the note comes (a missing character)');
  await wordsOf(cam).fill('Hallo');
  await expect(cam.getByTestId('cam-text-missing')).toHaveCount(0);
  await same('the note goes');
  // a face that cannot write the words, and the way out
  await selectOf(cam).selectOption({ label: 'Standard' });
  await wordsOf(cam).fill('{}');
  await expect(cam.getByTestId('cam-text-missing')).toBeVisible();
  await same('the note of a text with nothing to cut');
  await selectOf(cam).selectOption({ label: 'Einfach' });
  await expect(cam.getByTestId('cam-text-missing')).toHaveCount(0);
  await same('the way out');
});

test('says what the typed words lack in the chosen face – also for a text of nothing but missing characters – and shows the way out', async ({
  page,
}) => {
  const cam = await drawing(page);
  await addText(cam);
  const engraved = await program(page);
  const note = cam.getByTestId('cam-text-missing');
  const list = cam.getByTestId('cam-contours');

  // nothing but a character no face has: the note says nothing would be cut, what stays, and that no face has it
  await wordsOf(cam).fill('☺');
  await expect(note).toContainText('☺');
  await expect(note).toContainText('nichts zu fräsen');
  await expect(note).toContainText(
    'Gefräst wird weiter der bisherige Text in der Schrift „Standard“',
  );
  await expect(note).toContainText('Keine der Schriften hat sie alle.');
  // it does not engrave nothing in silence: the text that was there is still what is cut
  await expect(list).toContainText('Text „Text“');
  expect(await program(page)).toBe(engraved);

  // something that is cut and something that is not: the strokes are there, the gap is named
  await wordsOf(cam).fill('A☺');
  await expect(note).toContainText('Diese Zeichen gibt es in der Schrift „Standard“ nicht');
  await expect(note).toContainText('☺');
  await expect(list).toContainText('Text „A☺“');

  // `{ }` are in the Hershey faces and in Relief, not in the standard face – and the note says which
  await wordsOf(cam).fill('{}');
  await expect(note).toContainText('Einfach, Schreibschrift, Modern');
  const before = await program(page);
  await selectOf(cam).selectOption({ label: 'Einfach' });
  await expect(note).toHaveCount(0);
  await expect(list).toContainText('Text „{}“');
  const braces = await program(page);
  expect(braces).not.toBe(before);
  // back to the standard face: cannot be done – the select shows the pick, the note says why, nothing is cut anew
  await selectOf(cam).selectOption({ label: 'Standard' });
  await expect(selectOf(cam)).toHaveValue('standard');
  await expect(note).toContainText(
    'Gefräst wird weiter der bisherige Text in der Schrift „Einfach“',
  );
  expect(await program(page)).toBe(braces);
  await selectOf(cam).selectOption({ label: 'Modern' });
  await expect(note).toHaveCount(0);
});

test('keeps the face in a project file: saved, the drawing emptied, opened – the same program', async ({
  page,
}) => {
  const cam = await drawing(page);
  await addText(cam);
  await wordsOf(cam).fill('Größe 5');
  await selectOf(cam).selectOption({ label: 'Schreibschrift' });
  const script = await program(page);
  const text = await saved(page);
  const file = JSON.parse(text);
  expect(file.version).toBe(1);
  expect(file.items[0].sketch.font).toBe('script');
  expect(file.items[0].textStyle.options.font).toBe('script');
  // the standard face is written as no key
  await selectOf(cam).selectOption({ label: 'Standard' });
  expect(await saved(page)).not.toContain('"font"');

  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await expect(cam.getByTestId('cam-contours')).toHaveCount(0);
  await page.getByTestId('cam-project-file').setInputFiles({
    name: 'schild.lowrider.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(1);
  expect(await program(page)).toBe(script);
  // the text is selectable again with its face in the select
  await cam.getByTestId('cam-contours').getByRole('button', { name: /Text/ }).first().click();
  await expect(selectOf(cam)).toHaveValue('script');
  await expect(wordsOf(cam)).toHaveValue('Größe 5');

  // a face this app does not know: the file opens, the text keeps its strokes and is cut as before
  const unknown = JSON.parse(text);
  unknown.items[0].sketch.font = 'serif';
  unknown.items[0].textStyle.options.font = 'serif';
  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await page.getByTestId('cam-project-file').setInputFiles({
    name: 'neuer.lowrider.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(unknown)),
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(1);
  expect(await program(page)).toBe(script);
});

test("shows the notice and the licence text of every face that is not the app's own – readable offline, in the app", async ({
  page,
}) => {
  await openApp(page);
  await goTo(page, 'Einstellungen', 'Maschine');
  const card = page.getByTestId('licences-card');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Schriften und Lizenzen' })).toBeVisible();
  // every face but the standard one: its name, its source, the author's notice
  await expect(page.getByTestId('licence-face-standard')).toHaveCount(0);
  for (const [id, name, source, notice] of [
    ['simplex', 'Einfach', 'Hershey Sans 1-stroke', 'Dr. A. V. Hershey'],
    ['script', 'Schreibschrift', 'Hershey Script 1-stroke', 'James Hurt'],
    ['modern', 'Modern', 'Relief SingleLine', 'Relief SingleLine Project Authors'],
  ] as const) {
    const face = page.getByTestId(`licence-face-${id}`);
    await expect(face).toBeVisible();
    await expect(face.getByRole('heading')).toContainText(name);
    await expect(face).toContainText(source);
    await expect(page.getByTestId(`licence-notice-${id}`)).toContainText(notice);
  }
  await expect(page.getByTestId('licence-notice-modern')).toContainText('SIL Open Font License');

  // the licence texts: folded away, a full target to open, and the file's text – whole
  for (const [id, file, title] of [
    ['hershey', 'Hershey-Fonts-notice.txt', 'Lizenztext: Hershey Fonts'],
    ['ofl', 'Relief-SingleLine-OFL.txt', 'Lizenztext: SIL Open Font License 1.1'],
  ] as const) {
    const fold = page.getByTestId(`licence-text-${id}`);
    const head = fold.getByRole('button', { name: title });
    expect((await head.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await head.click();
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    const text = page.getByTestId(`licence-pre-${id}`);
    await expect(text).toBeVisible();
    expect(await text.evaluate((el) => el.textContent)).toBe(licenceFile(file));
  }
  await expect(page.getByTestId('licence-pre-ofl')).toContainText(
    'SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007',
  );
  await expect(page.getByTestId('licence-pre-hershey')).toContainText('USE RESTRICTION');
});

test('the single HTML file of the build holds the licence texts – they travel with the data', async () => {
  const built = readFileSync(fileURLToPath(new URL('../dist/index.html', import.meta.url)), 'utf8');
  for (const name of ['Hershey-Fonts-notice.txt', 'Relief-SingleLine-OFL.txt']) {
    // the texts sit in the script as strings: every whole line of plain text that needs no escaping is there as it is
    const lines = licenceFile(name)
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) => line.length >= 30 && /^[\x20-\x7e]+$/.test(line) && !/["'`\\<>$]/.test(line),
      );
    expect(lines.length, name).toBeGreaterThanOrEqual(5);
    for (const line of lines) expect(built.includes(line), `${name}: ${line}`).toBe(true);
  }
  // the notices of the library (the acknowledgement and the copyright line) are in it too
  expect(built).toContain('originally created by Dr. A. V. Hershey');
  expect(built).toContain('Copyright 2022 The Relief SingleLine Project Authors');
});

test('the quick search leads to the face of a text and to the licences', async ({ page }) => {
  const cam = await drawing(page);
  const find = async (query: string, title: string, place: string) => {
    await page.keyboard.press('Control+k');
    await page.getByTestId('find-input').fill(query);
    const top = page.getByTestId('find-list').getByRole('option').first();
    await expect(top).toContainText(title);
    await expect(top).toContainText(place);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('find')).toBeHidden();
  };
  const landed = async (anchor: string) => {
    const spot = page.locator(`[data-find~="${anchor}"]`);
    await expect(spot).toHaveClass(/found/);
    await expect(spot).toBeInViewport();
    return spot;
  };
  const faded = (anchor: string) =>
    expect(page.locator(`[data-find~="${anchor}"]`)).not.toHaveClass(/found/);
  // nothing drawn: the card of the drawing (it has the tile "Text"); nothing was added by going there
  await find('schriftart', 'Schriftart', 'Zeichnen/CAM');
  await landed('cam-draw');
  await faded('cam-draw');
  await expect(cam.getByTestId('cam-contours')).toHaveCount(0);
  // a text selected: the select itself
  await addText(cam);
  await find('schreibschrift', 'Schriftart', 'Zeichnen/CAM');
  const spot = await landed('text-font');
  await expect(spot.getByLabel('Schriftart', { exact: true })).toHaveValue('standard');
  await faded('text-font');
  // the licences: in the settings, in the machine's part
  await find('lizenz', 'Schriften und Lizenzen', 'Einstellungen · Maschine');
  await landed('licences');
  await expect(page.getByTestId('licences-card')).toBeVisible();
});

/** A control is in reach: inside the scroll box of the panel and reached by a touch at its middle – no scroll first. */
async function reach(page: Page, cam: Locator, name: string, control: Locator) {
  const scroller = cam.locator('xpath=ancestor::*[contains(@class,"panel-body")][1]');
  const at = await inReach(page, control, scroller);
  expect(at.inside && at.reached, `${name}: ${JSON.stringify(at)}`).toBe(true);
}

/** What a text that was just added needs, and what the note needs when it comes: all in reach, nothing scrolled by hand. */
async function wholeBlockInReach(page: Page, cam: Locator) {
  await addText(cam);
  // the words took the keyboard, and the face and the height lie right below them – none of them behind the fold
  await expect(wordsOf(cam)).toBeFocused();
  await reach(page, cam, 'the words', wordsOf(cam));
  await reach(page, cam, 'the face', selectOf(cam));
  await reach(page, cam, 'the height', heightOf(cam));
  // a character no face has: the note comes below the fields and is brought into view where the panel ends before it
  await wordsOf(cam).fill('Hallo ☺');
  const note = cam.getByTestId('cam-text-missing');
  await expect(note).toBeVisible();
  await reach(page, cam, 'the note', note);
  await reach(page, cam, 'the words, after the note came', wordsOf(cam));
  // a text of nothing but missing characters: the other note, in the same place
  await wordsOf(cam).fill('☺');
  await expect(note).toHaveAttribute('data-nothing', '');
  await reach(page, cam, 'the note of a text with nothing to cut', note);
}

test('a text that was just added shows the face and the height in reach without a scroll – and the note when it comes', async ({
  page,
}) => {
  const cam = await drawing(page);
  await wholeBlockInReach(page, cam);
});

test('on the machine screen (800 × 600) the block and its note are in reach in the sheet at its largest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const cam = await drawing(page);
  await page.locator('[data-slot="sheet-larger"]').click();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  await wholeBlockInReach(page, cam);
  // the face can be picked in the sheet, and the program follows
  await wordsOf(cam).fill('Hallo');
  const standard = await program(page);
  await selectOf(cam).selectOption({ label: 'Modern' });
  expect(await program(page)).not.toBe(standard);
});

test('a text taken up by its row stays where the finger put it – even one that has a note – and the panel does not scroll', async ({
  page,
}) => {
  const cam = await drawing(page);
  await addText(cam);
  await wordsOf(cam).fill('A☺');
  await expect(cam.getByTestId('cam-text-missing')).toBeVisible();
  // a plate takes the selection away from the text, and the text is tapped by its row
  await cam.getByTestId('cam-add').getByRole('button', { name: 'Rechteck', exact: true }).click();
  await expect(wordsOf(cam)).toHaveCount(0);
  const name = cam.getByTestId('cam-contours').getByRole('button', { name: /Text/ }).first();
  await name.scrollIntoViewIfNeeded();
  const before = (await name.boundingBox())!;
  // a mouse click at the point measured before the tap: a locator would scroll to the box again
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
  await expect(wordsOf(cam)).toHaveValue('A☺');
  await expect(cam.getByTestId('cam-text-missing')).toBeVisible();
  await page.waitForTimeout(150);
  const after = (await name.boundingBox())!;
  expect(after.y, 'the row is where the finger put it').toBeCloseTo(before.y, 0);
});
