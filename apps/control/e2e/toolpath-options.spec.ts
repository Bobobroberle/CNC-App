import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { drawShape, drawThreePlates, inReach, openApp, restingTable } from './helpers';

/**
 * The toolpath options of the drawing, set with the real controls and read from the program the workspace saves:
 * tabs kept off the corners ("Ecken meiden"), the way a pocket is entered (ramp, helix, straight), peck drilling,
 * the shorter route and the order of the cuts by hand – and a project file that an older app wrote, which is cut
 * exactly as before. What is not cut as asked is a note ("Gefräst, aber anders als gewünscht"), never a fault.
 */

const fixture = (name: string) =>
  readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8');

/** The program of the drawing as the workspace saves it. */
async function program(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-card').getByRole('button', { name: 'Als .nc speichern' }).click();
  return readFileSync(await (await download).path(), 'utf8');
}

/** The sites of tabs the table draws: per part its places (the same data the tests of the tabs read). */
const marks = async (page: Page): Promise<{ sites: { x: number; y: number }[] }[]> =>
  JSON.parse((await page.getByTestId('table-view').getAttribute('data-drawing-tabs')) ?? '[]');

/** Where the cutter is lifted over a tab: from where it goes up to the height of the tabs to where it comes down. */
function lifts(text: string, z = -4) {
  let x = 0;
  let y = 0;
  let at = 0;
  let from: number[] = [];
  const out: number[][] = [];
  for (const line of text.split('\n')) {
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
    else if (was === z && at !== z && (x !== from[0] || y !== from[1])) out.push([...from, x, y]);
  }
  return out;
}

/** The length of the rapid moves (G0) of a program, the first from the work zero: what "Fahrwege kürzen" is for. */
function rapidTravel(text: string) {
  let x = 0;
  let y = 0;
  let rapid = false;
  let sum = 0;
  for (const line of text.split('\n')) {
    const m = /^(G0|G1|G2|G3)?\s*((?:[XYZIJ]-?\d+(?:\.\d+)?\s*)+)(?:F\d+)?$/.exec(line.trim());
    if (!m) continue;
    if (m[1]) rapid = m[1] === 'G0';
    let nx = x;
    let ny = y;
    for (const word of m[2]!.trim().split(/\s+/)) {
      if (word[0] === 'X') nx = Number(word.slice(1));
      else if (word[0] === 'Y') ny = Number(word.slice(1));
    }
    if (rapid) sum += Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
  }
  return sum;
}

/** The places where the cutter reaches the bottom of a hole (z −6), as "x,y", in the order of the program. */
function bottoms(text: string) {
  let x = 0;
  let y = 0;
  let z = 0;
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^(?:G[01]\s+)?((?:[XYZ]-?\d+(?:\.\d+)?\s*)+)(?:F\d+)?$/.exec(line.trim());
    if (!m) continue;
    const was = z;
    for (const word of m[1]!.trim().split(/\s+/)) {
      const v = Number(word.slice(1));
      if (word[0] === 'X') x = v;
      else if (word[0] === 'Y') y = v;
      else z = v;
    }
    if (z === -6 && was !== -6) out.push(`${x},${y}`);
  }
  return out;
}

/** Opens the drawing workspace. */
async function drawing(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  return page.getByTestId('cam-card');
}

/** The flat 6 mm cutter of the workshop's list (the first of the list is a flat 8 mm one): the numbers below are its. */
const flat6 = (cam: Locator) => cam.locator('[data-find="cam-tool"] select').selectOption('t3');

const setKind = (cam: Locator, n: number, kind: string) =>
  cam.getByLabel(`Bearbeitung Kontur ${n}`, { exact: true }).selectOption({ label: kind });

/** Opens a fold of the card of the selection by its heading, if it is closed. */
async function unfold(fold: Locator, title: string) {
  const head = fold.getByRole('button', { name: title, exact: true });
  if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
}

test('tabs off the corners: the marks on the table are the places the program lifts at – on and off, and by hand nothing moves', async ({
  page,
}) => {
  const cam = await drawing(page);
  // A 100 × 60 plate cut outside with three tabs of 6 mm: the middle one would stand on the corner (100, 60)
  await drawShape(page, 'Rechteck');
  await flat6(cam);
  // one pass: the cutter is up at the height of the tabs (z −4) only where it goes over a tab
  await unfold(cam.getByTestId('cam-advanced'), 'Erweitert');
  await cam.getByRole('textbox', { name: 'Zustellung (mm)' }).fill('6');
  await restingTable(page);
  await cam.getByRole('button', { name: 'Stege von Teil 1 einstellen' }).click();
  const panel = cam.getByTestId('cam-tabs');
  await panel.getByRole('textbox', { name: /^Anzahl/ }).fill('3');
  const avoid = panel.getByRole('checkbox', { name: 'Stege von Teil 1: Ecken meiden' });
  // the drawing's default for a new drawing: on
  await expect(avoid).toBeChecked();
  await expect.poll(async () => (await marks(page))[0]?.sites.length).toBe(3);
  const on = (await marks(page))[0]!.sites;
  expect(on.some((s) => Math.abs(s.x - 100) < 1e-6 && Math.abs(s.y - 60) < 1e-6)).toBe(false);
  // the tab that would stand on the corner stands on the straight side beside it, 6 mm below the corner
  expect(on.map((s) => [s.x, s.y]).filter(([x]) => x === 100)).toEqual([[100, 54]]);
  const lifted = lifts(await program(page));
  // …and the program lifts the cutter there: along the side, up to where the cutter's arc round the corner begins
  expect(lifted).toContainEqual([103, 48, 103, 60]);
  expect(lifted.filter((l) => l[0] === 103 && l[3]! > 60.5)).toHaveLength(0);
  // (a tab on a straight side is lifted over along it: 12 mm, the tab's 6 and the cutter's 6)
  expect(lifted).toContainEqual([expect.closeTo(47.333, 2), -3, expect.closeTo(59.333, 2), -3]);

  // Off for this part: the tab is back on the corner, and the cutter is lifted over it round the corner
  await avoid.uncheck();
  await expect(avoid).not.toBeChecked();
  await expect
    .poll(async () => (await marks(page))[0]!.sites.some((s) => s.x === 100 && s.y === 60))
    .toBe(true);
  const off = lifts(await program(page));
  expect(off.filter((l) => l[0] === 103 && l[3]! > 60.5)).toHaveLength(1);
  expect(off).not.toContainEqual([103, 48, 103, 60]);
  // the part's own choice is marked, and the box is 48 px high
  expect(
    (await avoid.locator('xpath=ancestor::label').boundingBox())!.height,
  ).toBeGreaterThanOrEqual(47.5);
  await expect(panel.getByTestId('cam-tabs-avoid')).toContainText(
    'Weicht von der Empfehlung ab (an)',
  );
  await avoid.check();
  await expect.poll(async () => lifts(await program(page))).toEqual(lifted);

  // By hand the places stay where they are put: the box is closed (it is there in both modes, so nothing below it
  // moves between them) and a tab on the corner is not moved
  await panel.getByRole('button', { name: 'Von Hand' }).click();
  await expect(avoid).toBeDisabled();
  await expect(panel.getByTestId('cam-tabs-avoid')).toContainText('Von Hand gesetzte Stege');
  const before = await program(page);
  // the places by hand were seeded from the very places the cut lifts at: the program lifts where it did
  expect(lifts(before)).toEqual(lifted);
  await panel.getByRole('button', { name: 'Automatisch', exact: true }).click();
  await panel.getByRole('button', { name: 'Von Hand' }).click();
  expect(await program(page)).toBe(before);
});

test('the default of the drawing, under "Erweitert": tabs off the corners and a shorter route are on for a new drawing', async ({
  page,
}) => {
  const cam = await drawing(page);
  await drawShape(page, 'Rechteck');
  const fold = cam.getByTestId('cam-advanced');
  await unfold(fold, 'Erweitert');
  const corners = fold.getByTestId('cam-avoid-default');
  const route = fold.getByTestId('cam-route');
  await expect(corners).toBeChecked();
  await expect(route).toBeChecked();
  // 48 px targets
  for (const box of [corners, route]) {
    expect(
      (await box.locator('xpath=ancestor::label').boundingBox())!.height,
    ).toBeGreaterThanOrEqual(47.5);
  }
  // the default of the drawing is what a part without a choice of its own does
  await cam.getByRole('button', { name: 'Stege von Teil 1 einstellen' }).click();
  await corners.uncheck();
  await expect(
    cam.getByTestId('cam-tabs').getByRole('checkbox', { name: 'Stege von Teil 1: Ecken meiden' }),
  ).not.toBeChecked();
});

test('how a pocket is entered: ramp as ever, a helix, straight down – and a helix that does not fit is a note, not a fault', async ({
  page,
}) => {
  const cam = await drawing(page);
  const arrange = cam.getByTestId('cam-arrange');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '60', 'Höhe (mm)': '40' });
  await flat6(cam);
  await setKind(cam, 1, 'Tasche');
  const fold = arrange.getByTestId('cam-path');
  await unfold(fold, 'Eintauchen');
  const ramp = await program(page);
  expect(ramp).not.toMatch(/^G[23]\b/m);
  await expect(fold.getByTestId('cam-entry-ramp')).toHaveAttribute('aria-pressed', 'true');
  // every way is a target of 48 px
  for (const entry of ['ramp', 'helix', 'plunge']) {
    expect(
      (await fold.getByTestId(`cam-entry-${entry}`).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(47.5);
  }

  // Helix: arcs in the program, a hint of what it asks of the pocket, the width of the hole with its range
  await fold.getByTestId('cam-entry-helix').click();
  await expect(fold.getByTestId('cam-entry-note')).toContainText('Helix');
  const helix = await program(page);
  expect(helix).toMatch(/^G[23] /m);
  expect(helix).not.toBe(ramp);
  const width = fold.getByLabel('Lochbreite der Helix (mm)', { exact: true });
  await expect(width).toHaveAttribute('placeholder', '9');
  await expect(fold.getByTestId('cam-helix-note')).toContainText('1,5 × Fräser');
  await width.fill('7');
  const narrow = await program(page);
  expect(narrow).toMatch(/^G[23] /m);
  expect(narrow).not.toBe(helix);
  await width.fill('');
  expect(await program(page)).toBe(helix);

  // Straight down: no helix, no arcs, a hint of the risk
  await fold.getByTestId('cam-entry-plunge').click();
  await expect(fold.getByTestId('cam-entry-note')).toContainText('ganzen Breite');
  const plunge = await program(page);
  expect(plunge).not.toMatch(/^G[23]\b/m);
  expect(plunge).not.toBe(ramp);
  // back to the ramp: the very program of before
  await fold.getByTestId('cam-entry-ramp').click();
  expect(await program(page)).toBe(ramp);

  // A pocket too small for the helix is cut – entered by ramp – and says so as a note below, not as "not cut"
  await fold.getByTestId('cam-entry-helix').click();
  await arrange.getByLabel('Breite (mm)', { exact: true }).fill('10');
  await arrange.getByLabel('Höhe (mm)', { exact: true }).fill('10');
  const differences = cam.getByTestId('cam-differences');
  await expect(differences).toBeVisible();
  await expect(differences).toContainText('Gefräst, aber anders als gewünscht');
  const note = differences.getByTestId('cam-difference');
  await expect(note).toHaveCount(1);
  await expect(note).toHaveAttribute('data-code', 'helix-too-big');
  await expect(note).toContainText('Helix passt nicht in die Tasche');
  await expect(cam.getByTestId('cam-problems')).toHaveCount(0);
  // the note is not the colour of a fault: the edge is the warning's, never the destructive red
  const edges = await note.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.borderLeft = '3px solid var(--warning)';
    document.body.append(probe);
    const warning = getComputedStyle(probe).borderLeftColor;
    probe.style.borderLeft = '3px solid var(--destructive)';
    const destructive = getComputedStyle(probe).borderLeftColor;
    probe.remove();
    return { own: getComputedStyle(el).borderLeftColor, warning, destructive };
  });
  expect(edges.own).toBe(edges.warning);
  expect(edges.own).not.toBe(edges.destructive);
  // and the pocket is there: the program is the ramp's
  expect(await program(page)).toMatch(/G1/);
});

test('peck drilling: one go until there is a step, then in steps – and a hole larger than the cutter says so as a note', async ({
  page,
}) => {
  const cam = await drawing(page);
  const arrange = cam.getByTestId('cam-arrange');
  await drawShape(page, 'Kreis', { 'Durchmesser (mm)': '6' });
  await flat6(cam);
  await setKind(cam, 1, 'Bohren');
  const fold = arrange.getByTestId('cam-path');
  await unfold(fold, 'Bohren in Stufen');
  const straight = await program(page);
  const plunges = (text: string) => text.split('\n').filter((l) => /^(G1 )?Z-\d/.test(l)).length;
  const peck = fold.getByLabel('Spanbrechen (mm)', { exact: true });
  const retract = fold.getByLabel('Rückzug (mm)', { exact: true });
  // the retract is closed without a step, with its reason
  await expect(retract).toBeDisabled();
  await peck.fill('2');
  await expect(retract).toBeEnabled();
  const pecked = await program(page);
  expect(pecked).not.toBe(straight);
  // 6 mm deep in steps of 2: three steps, the last ending exactly at the depth
  expect(plunges(pecked)).toBeGreaterThan(plunges(straight));
  expect(pecked).toContain('Z-6');
  expect(pecked).toContain('Z-2');
  expect(pecked).toContain('Z-4');
  // chip breaking: only that far up between the steps
  await retract.fill('1');
  const breaking = await program(page);
  expect(breaking).not.toBe(pecked);
  // the fields are targets of 48 px
  for (const field of [peck, retract]) {
    expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  }
  await peck.fill('');
  expect(await program(page)).toBe(straight);

  // A hole larger than the cutter is bored, not pecked: cut, and said as a note
  await peck.fill('2');
  await arrange.getByLabel('Durchmesser (mm)', { exact: true }).fill('20');
  const differences = cam.getByTestId('cam-differences');
  await expect(differences).toBeVisible();
  await expect(differences.getByTestId('cam-difference')).toHaveAttribute(
    'data-code',
    'peck-not-possible',
  );
  await expect(differences).toContainText('Bohren in Stufen geht hier nicht');
  await expect(cam.getByTestId('cam-problems')).toHaveCount(0);
});

/** Six holes whose nearest-first order is far from the shortest one, drawn by hand (centres in work coordinates). */
const HOLES = [
  [130, 50],
  [120, 130],
  [140, 70],
  [180, 120],
  [20, 130],
  [50, 30],
];

async function drawHoles(page: Page) {
  const cam = await drawing(page);
  let first = true;
  for (const [x, y] of HOLES) {
    await drawShape(page, 'Kreis', {
      'Durchmesser (mm)': '6',
      'X Mitte (mm)': String(x),
      'Y Mitte (mm)': String(y),
    });
    if (first) await flat6(cam);
    first = false;
  }
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  await expect(rows).toHaveCount(HOLES.length);
  for (let n = 1; n <= HOLES.length; n++) await setKind(cam, n, 'Bohren');
  return cam;
}

test('"Fahrwege kürzen": on for a new drawing, never more travel than without – and a drawing without it is as it was', async ({
  page,
}) => {
  const cam = await drawHoles(page);
  const fold = cam.getByTestId('cam-advanced');
  await unfold(fold, 'Erweitert');
  const route = fold.getByTestId('cam-route');
  await expect(route).toBeChecked();
  await expect(fold).toContainText('nie länger als ohne');
  const short = await program(page);
  await route.uncheck();
  const nearest = await program(page);
  expect(nearest).not.toBe(short);
  // only the order changes: the same cuts, the program is not longer in rapid travel
  expect(bottoms(short).sort()).toEqual(bottoms(nearest).sort());
  expect(bottoms(short)).toHaveLength(HOLES.length);
  expect(rapidTravel(short)).toBeLessThan(rapidTravel(nearest));
  await route.check();
  expect(await program(page)).toBe(short);
});

test('the order of the cuts by hand: where a part comes, earlier and later, automatic, reset – and no row changes its height', async ({
  page,
}) => {
  const cam = await drawHoles(page);
  const arrange = cam.getByTestId('cam-arrange');
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  const heights = () => rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  const still = await heights();
  const unchanged = async (what: string) => {
    await page.waitForTimeout(200);
    const now = await heights();
    for (const [i, h] of now.entries()) {
      expect(Math.abs(h - still[i]!), `${what}: row ${i + 1}`).toBeLessThan(0.5);
    }
  };
  // Nothing selected: nothing to say of the order
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await expect(cam.getByTestId('cam-order')).toHaveCount(0);
  await expect(cam.getByTestId('cam-order-badge')).toHaveCount(0);

  // One part selected: "Schnitt n von 6 (Bohrungen)", read from the program that was made
  await cam.getByRole('button', { name: /^3\. / }).click();
  const fold = arrange.getByTestId('cam-order');
  await unfold(fold, 'Reihenfolge');
  const place = fold.getByTestId('cam-order-place');
  await expect(place).toContainText(/Schnitt \d von 6 \(Bohrungen\)/);
  const was = Number(/Schnitt (\d)/.exec((await place.textContent())!)![1]);
  // the hint says what never changes
  await expect(fold).toContainText('immer erst die Bohrungen');
  // every way is a target of 48 px
  for (const id of ['earlier', 'later', 'auto']) {
    expect(
      (await fold.getByTestId(`cam-order-${id}`).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(47.5);
  }
  await expect(fold.getByTestId('cam-order-auto')).toBeDisabled();
  const automatic = await program(page);

  // Later: one place down, the whole rank is numbered and shows its numbers beside the names – no row grows or shrinks
  const later = fold.getByTestId('cam-order-later');
  await later.click();
  await expect(place).toContainText(`Schnitt ${was + 1} von 6`);
  await expect(cam.getByTestId('cam-order-badge')).toHaveCount(6);
  await unchanged('one place later: the numbers appear');
  const moved = await program(page);
  expect(moved).not.toBe(automatic);
  // the program holds the same cuts in another order
  expect(bottoms(moved).sort()).toEqual(bottoms(automatic).sort());
  await fold.getByTestId('cam-order-earlier').click();
  await expect(place).toContainText(`Schnitt ${was} von 6`);
  await unchanged('and back one place');
  // Automatic: this part has no number any more (the others keep theirs)
  await fold.getByTestId('cam-order-auto').click();
  await expect(cam.getByTestId('cam-order-badge')).toHaveCount(5);
  await unchanged('one part automatic');
  // a gap in the numbers is no wish for a later place: the five read as they are cut – 1 … 5, and no "Wunsch"
  await expect(cam.getByTestId('cam-order-badge').filter({ hasText: 'Wunsch' })).toHaveCount(0);
  const read = (await cam.getByTestId('cam-order-badge').allTextContents()).map((x) =>
    Number(/^Nr\. (\d+)/.exec(x)![1]),
  );
  expect(read.sort()).toEqual([1, 2, 3, 4, 5]);
  // Reset: every number away
  await fold.getByTestId('cam-order-reset').click();
  await expect(cam.getByTestId('cam-order-badge')).toHaveCount(0);
  await unchanged('every number gone');
  expect(await program(page)).toBe(automatic);
  // undo brings the numbers back in one step each
  await cam.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(cam.getByTestId('cam-order-badge')).toHaveCount(5);
  await unchanged('undo');
});

/**
 * A wish the library cannot keep, in the rows of the list: the badge says where the part is cut and what was asked for, it
 * fits the head of its row beside the eye (the name gives way), and no row changes its height.
 */
async function overriddenWish(page: Page, cam: Locator) {
  // an outer plate and one inside it, both cut round: whatever is wished, the inner one is cut first
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '100',
    'Höhe (mm)': '100',
    'X links (mm)': '0',
    'Y unten (mm)': '0',
  });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '20',
    'Höhe (mm)': '20',
    'X links (mm)': '30',
    'Y unten (mm)': '30',
  });
  await setKind(cam, 1, 'Außen');
  await setKind(cam, 2, 'Außen');
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  const heights = () => rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  await cam.getByRole('button', { name: /^1\. / }).click();
  const fold = cam.getByTestId('cam-arrange').getByTestId('cam-order');
  await unfold(fold, 'Reihenfolge');
  await expect(fold.getByTestId('cam-order-place')).toContainText(
    'Schnitt 2 von 2 (Außenkonturen)',
  );
  const still = await heights();
  const lying = await program(page);
  await fold.getByTestId('cam-order-earlier').click();
  // the badge says where each is cut and what was asked for – the outer plate asked for the first place and is cut second
  const badges = cam.getByTestId('cam-order-badge');
  await expect(badges).toHaveCount(2);
  await expect(badges.nth(0)).toContainText('Nr. 2 (Wunsch 1)');
  await expect(badges.nth(1)).toContainText('Nr. 1 (Wunsch 2)');
  await expect(badges.nth(0)).toHaveAttribute(
    'title',
    'Wird als Nr. 2 gefräst; gewünscht war der Platz 1.',
  );
  // the program is the one of before, and the card says why in a note, not a fault
  expect(await program(page)).toBe(lying);
  await expect(cam.getByTestId('cam-difference')).toHaveAttribute('data-code', 'order-overridden');
  await page.waitForTimeout(200);
  for (const [i, h] of (await heights()).entries()) {
    expect(Math.abs(h - still[i]!), `row ${i + 1}`).toBeLessThan(0.5);
  }
  // the longer badge fits its row: it stands between the name and the eye, inside the head, and the name keeps room
  for (let n = 0; n < 2; n++) {
    const row = rows.nth(n);
    const head = (await row.locator('.cam-head').boundingBox())!;
    const badge = (await badges.nth(n).boundingBox())!;
    const eye = (await row.getByTestId('cam-eye').boundingBox())!;
    const name = (await row.locator('.cam-name').boundingBox())!;
    expect(badge.x, `badge ${n + 1}`).toBeGreaterThanOrEqual(head.x - 0.5);
    expect(badge.x + badge.width, `badge ${n + 1} before the eye`).toBeLessThanOrEqual(eye.x + 0.5);
    expect(eye.x + eye.width, `eye ${n + 1}`).toBeLessThanOrEqual(head.x + head.width + 0.5);
    expect(name.width, `name ${n + 1}`).toBeGreaterThan(40);
  }
  // the same tap again writes the numbers that are there: nothing – so one "Rückgängig" takes the first tap back
  await fold.getByTestId('cam-order-earlier').click();
  await fold.getByTestId('cam-order-earlier').click();
  await cam.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(badges).toHaveCount(0);
}

test('a wish the library cannot keep reads as it is cut – "Nr. 2 (Wunsch 1)" – a second tap is no step, and no row changes its height', async ({
  page,
}) => {
  await overriddenWish(page, await drawing(page));
});

test('a wish the library cannot keep, on the machine screen (800 × 600), in the sheet at its largest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const cam = await drawing(page);
  await page.locator('[data-slot="sheet-larger"]').click();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  await overriddenWish(page, cam);
});

test('an older project file is cut exactly as it was: the program is the one the older app made, byte for byte', async ({
  page,
}) => {
  const cam = await drawing(page);
  // The session starts with the new defaults: tabs off the corners, a shorter route
  await drawShape(page, 'Rechteck');
  await unfold(cam.getByTestId('cam-advanced'), 'Erweitert');
  await expect(cam.getByTestId('cam-route')).toBeChecked();
  await expect(cam.getByTestId('cam-avoid-default')).toBeChecked();
  // A file that has neither key
  const file = JSON.parse(fixture('oldSingle.lowrider.json'));
  expect(file.settings).not.toHaveProperty('routeShort');
  await cam.getByTestId('cam-project-file').setInputFiles({
    name: 'alt.lowrider.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fixture('oldSingle.lowrider.json')),
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).not.toHaveCount(1);
  expect((await program(page)).trimEnd()).toBe(fixture('oldSingle.nc').trimEnd());
  // what the file does not say is off, not what the session had
  await unfold(cam.getByTestId('cam-advanced'), 'Erweitert');
  await expect(cam.getByTestId('cam-route')).not.toBeChecked();
  await expect(cam.getByTestId('cam-avoid-default')).not.toBeChecked();
});

/**
 * A control in the middle of the panel (its own scroll only), measured where it stands – a locator's click would scroll
 * once more by itself after the place was taken.
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

/** Where a row stands on the screen: the box that takes it into the selection is always there. */
const rowTop = async (cam: Locator, n: number) =>
  (await cam
    .getByTestId('cam-pick')
    .nth(n - 1)
    .boundingBox())!.y;

/**
 * What the new options do to the card above the list and to the panel of a part's tabs must not take a control from
 * under the finger: measured with a mouse click at a point worked out before it – a locator's click would scroll to the
 * control again after the place was taken. Chromium's scroll anchoring is off: the page must hold the row itself.
 */
async function optionsStayUnderTheFinger(page: Page, cam: Locator, container: Locator) {
  const rows = cam.getByTestId('cam-contours').getByRole('listitem');
  const stays = async (what: string, control: Locator, before: number, n: number) => {
    await page.waitForTimeout(250);
    expect(Math.abs((await rowTop(cam, n)) - before), `${what}: row ${n}`).toBeLessThan(1.5);
    void control;
  };
  // Row 3 selected alone; its kind is changed in the row: the panel of a pocket, of a hole, then none comes and goes
  // in the card above the list – the row stays where it is
  await cam.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await cam.getByRole('button', { name: /^3\. / }).click();
  const kind = cam.getByLabel('Bearbeitung Kontur 3', { exact: true });
  await kind.scrollIntoViewIfNeeded();
  for (const label of ['Tasche', 'Bohren', 'Außen']) {
    const before = await rowTop(cam, 3);
    await kind.selectOption({ label });
    await stays(`kind ${label}`, kind, before, 3);
    await expect(cam.getByTestId('cam-path')).toHaveCount(label === 'Außen' ? 0 : 1);
  }

  // The panel of row 1's tabs: the box of the corners and its hint are there in both modes, as tall in one as in the
  // other (the way between automatic and by hand must not add or take a block of its own below the fields)
  await cam.getByRole('button', { name: 'Stege von Teil 1 einstellen' }).click();
  const panel = cam.getByTestId('cam-tabs');
  await expect(panel).toBeVisible();
  const avoid = panel.getByTestId('cam-tabs-avoid');
  const close = panel.getByTestId('cam-tabs-close');
  const box = async (control: Locator) => (await control.boundingBox())!;
  const closeAt = (await box(close)).y;
  const height = (await box(avoid)).height;
  const tap = async (control: Locator) => {
    const at = await centred(control);
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    await page.waitForTimeout(250);
  };
  await tap(panel.getByTestId('cam-tabs-manual'));
  await expect(panel).toHaveAttribute('data-mode', 'manual');
  expect((await box(avoid)).height, 'by hand: the box of the corners and its hint').toBe(height);
  await expect(avoid.getByRole('checkbox')).toBeDisabled();
  await tap(panel.getByTestId('cam-tabs-spread'));
  await expect(panel).toHaveAttribute('data-mode', 'auto');
  expect((await box(avoid)).height, 'automatic again: the same block').toBe(height);
  await expect(avoid.getByRole('checkbox')).toBeEnabled();
  // the box and its hint are a full target, ticking it changes the program and not a height of the panel
  expect((await box(avoid.locator('label'))).height).toBeGreaterThanOrEqual(47.5);
  const room = (await box(panel)).height;
  await tap(avoid.getByRole('checkbox'));
  await expect(avoid.getByRole('checkbox')).not.toBeChecked();
  expect((await box(panel)).height, 'the box ticked: the panel').toBe(room);
  expect(closeAt).toBeGreaterThan(0);
  await close.click();
  await expect(panel).toHaveCount(0);

  // The order: the first number makes no card taller and no row different; every control of the panel is in reach
  for (const n of [1, 2, 3])
    await cam
      .getByLabel(`Bearbeitung Kontur ${n}`, { exact: true })
      .selectOption({ label: 'Tasche' });
  await cam.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await cam.getByRole('button', { name: /^2\. / }).click();
  const fold = cam.getByTestId('cam-arrange').getByTestId('cam-order');
  await unfold(fold, 'Reihenfolge');
  await expect(fold.getByTestId('cam-order-place')).toContainText('Schnitt 2 von 3 (Taschen)');
  const heights = () => rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  const rowsBefore = await heights();
  const tops = [await rowTop(cam, 1), await rowTop(cam, 2), await rowTop(cam, 3)];
  const later = fold.getByTestId('cam-order-later');
  // (the way back to "no number" is closed while no part has one: its wrapper takes the tap and says why)
  for (const control of [later, fold.getByTestId('cam-order-earlier')]) {
    await centred(control);
    const reach = await inReach(page, control, container);
    expect(reach.reached, 'a touch at its middle reaches it').toBe(true);
    expect(reach.box.height).toBeGreaterThanOrEqual(47.5);
  }
  const before = await rowTop(cam, 1);
  await tap(later);
  await expect(cam.getByTestId('cam-order-badge')).toHaveCount(3);
  // the card above the list is as tall as it was – rows 1–3 stand where they stood, none changed its height
  expect(Math.abs((await rowTop(cam, 1)) - before), 'the first number: row 1').toBeLessThan(1.5);
  const now = await heights();
  for (const [i, h] of now.entries())
    expect(Math.abs(h - rowsBefore[i]!), `row ${i + 1}`).toBeLessThan(0.5);
  expect(tops).toHaveLength(3);
}

test('the options move nothing under the finger: kind, the tabs panel, the first number of the order', async ({
  page,
}) => {
  await openApp(page);
  await page.addStyleTag({ content: '.panel-body { overflow-anchor: none; }' });
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 1100 });
  const cam = await drawThreePlates(page);
  await optionsStayUnderTheFinger(page, cam, page.locator('.panel-body'));
});

test('the same on the machine screen (800 × 600), in the sheet at its largest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openApp(page);
  await page.addStyleTag({ content: '.panel-body { overflow-anchor: none; }' });
  const cam = await drawThreePlates(page);
  await page.locator('[data-slot="sheet-larger"]').click();
  await expect(page.locator('[data-slot="sheet"]')).toHaveAttribute('data-level', 'full');
  await optionsStayUnderTheFinger(page, cam, page.locator('.panel-body'));
});
