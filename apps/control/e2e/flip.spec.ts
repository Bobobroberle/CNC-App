import { expect, test, type Page } from '@playwright/test';
import { boardToWork, drawShape, goTo, hold, jobView, openDemo, startJob } from './helpers';

// Machining a part from both sides, on the simulated machine of the demo: the
// drawing with its two sides, the front program, turning the board over,
// finding it again (camera or pins) and the back program – checked against
// what the simulated cutter really left in the board.

/** A cut in the simulator's board, in the board's own coordinates (seen from its front). */
interface BoardCut {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  /** Lowest point, machine Z (the board's top is at −80) */
  z: number;
  back: boolean;
  through: boolean;
}

const boardCuts = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { lowriderSimulator: { boardCuts(): BoardCut[] } }
    ).lowriderSimulator.boardCuts(),
  );

const board = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { lowriderSimulator: { board: { angle: number; flipped: boolean } } })
        .lowriderSimulator.board,
  );

/**
 * The ends of a cut in the work coordinates of the demo's front (zero on board hole 1, axes
 * along the machine's): where the drawing has them. A hole has one end.
 */
const ends = (c: BoardCut) => [
  boardToWork(c.x, c.y),
  ...(c.x2 === undefined ? [] : [boardToWork(c.x2, c.y2!)]),
];

/**
 * The demo with time running fast, and in its drawing a part for both sides:
 * a 120 × 60 plate at 60/60 whose outline is cut free from the back, a round
 * pocket Ø 20 at 90/90 in the front and another at 160/100 in the back
 * (drawn, like everything, as seen from the front).
 */
async function drawTwoSided(page: Page) {
  await openDemo(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
  await page.getByTestId('simulator-card').getByRole('button', { name: '50×' }).click();
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '120',
    'Höhe (mm)': '60',
    'X links (mm)': '60',
    'Y unten (mm)': '60',
  });
  await drawShape(page, 'Kreis', { 'X Mitte (mm)': '90', 'Y Mitte (mm)': '90' });
  await drawShape(page, 'Kreis', { 'X Mitte (mm)': '160', 'Y Mitte (mm)': '100' });
  await cam.getByLabel('Bearbeitung Kontur 2').selectOption('pocket');
  await cam.getByLabel('Bearbeitung Kontur 3').selectOption('pocket');
  await cam.getByLabel('Tiefe Kontur 2 (mm)').fill('3');
  await cam.getByLabel('Tiefe Kontur 3 (mm)').fill('3');
  return cam;
}

/** Runs the loaded program from the (simulated) SD card. */
async function cut(page: Page) {
  await startJob(page);
}

test('both sides with the camera: front, turn the part, find its holes, back', async ({ page }) => {
  test.setTimeout(180_000);
  const cam = await drawTwoSided(page);

  // One switch; before it there is nothing about sides anywhere.
  await expect(cam.getByLabel('Seite Kontur 1')).toHaveCount(0);
  await cam.getByRole('checkbox', { name: 'Von beiden Seiten fräsen' }).check();
  const sides = page.getByTestId('cam-sides');
  // How to turn the part: two pictures to choose from, the page of a book first.
  await expect(sides.getByRole('button', { name: /Wie eine Buchseite/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sides.getByRole('button', { name: /Wie eine Buchseite/ })).toContainText(
    'über die kurze Seite',
  );
  await expect(sides.getByRole('button', { name: /Über die Vorderkante/ })).toContainText(
    'über die lange Seite',
  );
  // The demo's camera is set up: it finds the part again; pins are the other way.
  await expect(sides.getByRole('button', { name: 'Mit der Kamera' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('flip-method')).toContainText('gehen durchs Material');
  // Two registration holes beside the plate, as large as the 8 mm cutter drills:
  // 18 mm left and right of it, 156 mm apart.
  await expect(page.getByTestId('flip-holes')).toHaveText('Passlöcher: Ø 8 mm, 156 mm auseinander');

  // Nothing is on the back yet, and the app says what that means.
  const notes = page.getByTestId('cam-flip-notes');
  await expect(notes).toContainText('Noch nichts auf der Rückseite');
  await cam.getByLabel('Seite Kontur 1').selectOption('back');
  await cam.getByLabel('Seite Kontur 3').selectOption('back');
  // The simulator's board is 12 mm thick, and the drawing knows; any other thickness is typed in.
  await expect(notes).toHaveCount(0);
  await expect(cam.getByLabel('Materialdicke (mm)')).toHaveAttribute('placeholder', '12');
  await expect(page.getByTestId('cam-sides')).toContainText('Leer gelassen gelten die 12 mm');
  await cam.getByLabel('Materialdicke (mm)').fill('12');
  await expect(notes).toHaveCount(0);

  // Front and back that cut through together where they overlap are named, with their rows:
  // the plate as a 6 mm pocket from the back under a 7 mm pocket in the front.
  await cam.getByLabel('Bearbeitung Kontur 1').selectOption('pocket');
  await cam.getByLabel('Seite Kontur 2').selectOption('front');
  await cam.getByLabel('Tiefe Kontur 2 (mm)').fill('7');
  await expect(notes).toContainText(
    'Kontur 2 (Vorderseite) und Kontur 1 (Rückseite) überlappen und sind zusammen 1 mm tiefer',
  );
  await cam.getByLabel('Tiefe Kontur 2 (mm)').fill('3');
  await expect(notes).toHaveCount(0);
  // The outline goes through from the back instead, held by tabs.
  await cam.getByLabel('Bearbeitung Kontur 1').selectOption('outside');
  await cam.getByLabel('Tiefe Kontur 1 (mm)').fill('12,5');
  await expect(cam.getByRole('checkbox', { name: 'Haltestege' }).first()).toBeChecked();
  await expect(notes).toHaveCount(0);

  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();
  // The Job room has the front program and the flow to the other side on top.
  await expect(page.getByTestId('job-name')).toContainText('demo-schild_vorderseite.nc');
  const flow = page.getByTestId('flip-card');
  await expect(flow.locator('.flip-steps li')).toHaveText([
    /Vorderseite fräsen/,
    /Teil wenden/,
    /Passlöcher finden/,
    /Rückseite fräsen/,
  ]);
  await expect(flow.locator('.flip-steps li.current')).toHaveText(/Vorderseite fräsen/);
  await jobView(page, 'Prüfen');
  await expect(page.locator('[data-check="flip"]')).toHaveClass(/check-ok/);
  await expect(page.locator('[data-check="flip"]')).toContainText('danach wird gewendet');

  // The front runs from the SD card; when it is through, the flow says: turn the part over.
  await cut(page);
  const turn = page.getByTestId('flip-turn');
  await expect(turn).toBeVisible({ timeout: 90_000 });
  await expect(flow.locator('.flip-steps li.current')).toHaveText(/Teil wenden/);
  await expect(turn).toContainText('Die linke Kante kommt nach rechts, vorn bleibt vorn');
  await expect(turn).toContainText('Spannmittel');
  // The cutter drilled the two holes right through the board and milled the front pocket.
  const front = await boardCuts(page);
  const holes = front.filter((c) => c.through).flatMap(ends);
  expect(holes).toHaveLength(2);
  // 18 mm left and right of the plate, level with its middle.
  holes.sort((p, q) => p.x - q.x);
  expect(Math.hypot(holes[0]!.x - 42, holes[0]!.y - 90)).toBeLessThan(0.5);
  expect(Math.hypot(holes[1]!.x - 198, holes[1]!.y - 90)).toBeLessThan(0.5);
  const milled = front.filter((c) => !c.through).flatMap(ends);
  expect(milled.length).toBeGreaterThan(20);
  expect(milled.every((p) => Math.hypot(p.x - 90, p.y - 90) <= 6.5)).toBe(true);

  await turn.getByRole('button', { name: 'Teil ist gewendet und fest' }).click();
  // The simulated board now lies back up, a little off and turned – as put down by hand.
  expect((await board(page)).flipped).toBe(true);
  const locate = page.getByTestId('flip-locate');
  await expect(locate).toBeVisible();
  await expect(page.getByTestId('job-name')).toContainText('demo-schild_rueckseite.nc');
  // The back cannot be started before the part is found again; the list says what is open.
  await jobView(page, 'Prüfen');
  await expect(page.locator('[data-check="flip"]')).toHaveClass(/check-block/);
  await expect(page.locator('[data-check="flip"]')).toContainText(
    'Die Passlöcher sind noch nicht gefunden',
  );
  await expect(page.getByTestId('start-bar')).toContainText('Start gesperrt');
  await page.locator('[data-check="flip"]').getByRole('button', { name: 'Zum Wenden' }).click();
  // The panel scrolls the flow into view; a hold needs the button to rest.
  await page.waitForTimeout(800);

  // The camera drives to each hole and centres on it.
  await hold(page, /Passloch 1 anfahren und suchen/, 1500);
  await expect(page.getByTestId('flip-hole-1')).toContainText('Gefunden bei', {
    timeout: 60_000,
  });
  await hold(page, /Passloch 2 anfahren und suchen/, 1500);
  const located = page.getByTestId('flip-located');
  await expect(located).toBeVisible({ timeout: 60_000 });
  // Put down by hand, the board came to lie 1.4° off: that is how far the back program is turned.
  await expect(located).toContainText(/Teil gefunden: 1,[34]\d*° gedreht/);
  await expect(page.getByTestId('job-name')).toContainText('rueckseite');
  await expect(flow.locator('.flip-steps li.current')).toHaveText(/Rückseite fräsen/);
  await jobView(page, 'Prüfen');
  await expect(page.locator('[data-check="flip"]')).toHaveClass(/check-ok/);
  await expect(page.locator('[data-check="flip"]')).toContainText('gewendet und wiedergefunden');

  // Bumped the part while clamping? Finding it anew starts at the holes, not at the turn.
  await page.locator('[data-check="flip"]').scrollIntoViewIfNeeded();
  await flow.getByRole('button', { name: 'Teil neu suchen' }).click();
  await expect(locate).toBeVisible();
  await expect(page.getByTestId('flip-hole-1')).toHaveText('Noch nicht gemessen.');
  expect((await board(page)).flipped).toBe(true);
  await page.waitForTimeout(800);
  await hold(page, /Passloch 1 anfahren und suchen/, 1500);
  await expect(page.getByTestId('flip-hole-1')).toContainText('Gefunden bei', {
    timeout: 60_000,
  });
  await hold(page, /Passloch 2 anfahren und suchen/, 1500);
  await expect(located).toContainText(/Teil gefunden: 1,[34]\d*° gedreht/, { timeout: 60_000 });

  // The back runs like any job.
  await cut(page);
  await expect(flow).toContainText('Beide Seiten sind gefräst', { timeout: 120_000 });
  // What the cutter left in the back, in the places of the drawing (the machine's own
  // squareness error shows twice on a turned part: within 1 mm): the pocket drawn at
  // 160/100, at that very place of the board …
  const back = (await boardCuts(page)).filter((c) => c.back).flatMap(ends);
  const pocketBack = back.filter((p) => Math.hypot(p.x - 160, p.y - 100) <= 7);
  expect(pocketBack.length).toBeGreaterThan(20);
  // … and everything else is the outline around the plate, a cutter's radius outside its line.
  const outline = back.filter((p) => Math.hypot(p.x - 160, p.y - 100) > 7);
  expect(outline.length).toBeGreaterThan(20);
  for (const p of outline) {
    const off = Math.hypot(Math.max(60 - p.x, 0, p.x - 180), Math.max(60 - p.y, 0, p.y - 120));
    expect(Math.abs(off - 4)).toBeLessThan(1);
  }
  // Nothing went where a program mirrored the wrong way round would have cut (80/100).
  expect(back.some((p) => Math.hypot(p.x - 80, p.y - 100) <= 12)).toBe(false);

  await flow.getByRole('button', { name: 'Abschließen' }).click();
  await expect(flow).toHaveCount(0);
  // Both programs are in the history, side by side under the drawing's name.
  await goTo(page, 'Service & Diagnose', 'Historie');
  const history = page.getByTestId('history-card');
  await expect(history).toContainText('demo-schild_vorderseite.nc');
  await expect(history).toContainText('demo-schild_rueckseite');
});

test('both sides on pins, over the front edge, the front turned to the board first', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const cam = await drawTwoSided(page);
  await cam.getByRole('checkbox', { name: 'Von beiden Seiten fräsen' }).check();
  await cam.getByLabel('Seite Kontur 1').selectOption('back');
  await cam.getByLabel('Seite Kontur 3').selectOption('back');
  await cam.getByLabel('Tiefe Kontur 1 (mm)').fill('12,5');
  await cam.getByLabel('Materialdicke (mm)').fill('12');
  // Turned over its front edge this time: the holes go in front of and behind the plate.
  const sides = page.getByTestId('cam-sides');
  await sides.getByRole('button', { name: /Über die Vorderkante/ }).click();
  await expect(page.getByTestId('flip-holes')).toHaveText('Passlöcher: Ø 8 mm, 96 mm auseinander');
  // Pins instead of the camera: the holes go on into the spoilboard, and the app says which pins.
  await sides.getByRole('button', { name: 'Mit Passstiften' }).click();
  await expect(page.getByTestId('flip-method')).toContainText(
    'gehen 6 mm in die Opferplatte. Nach dem Wenden steckt das Teil auf zwei Passstiften Ø 8 mm',
  );
  await expect(page.getByTestId('flip-method')).toContainText(
    'so genau, wie die Stifte in die Löcher passen',
  );
  await expect(page.getByTestId('cam-flip-notes')).toHaveCount(0);
  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();

  const flow = page.getByTestId('flip-card');
  // On pins there is nothing to look for: three steps.
  await expect(flow.locator('.flip-steps li')).toHaveText([
    /Vorderseite fräsen/,
    /Teil wenden, auf die Stifte/,
    /Rückseite fräsen/,
  ]);
  await expect(flow).toContainText('zwei Passstifte Ø 8 mm bereitlegen');

  // The board lies 1.5° askew: the front is turned to it, as after measuring its edge.
  await goTo(page, 'Einrichten', 'Ausrichten');
  await page.getByTestId('align-card').locator('[data-fold-trigger]').first().click();
  await page.getByLabel('Drehung (°, gegen Uhrzeigersinn)').fill('1,5');
  await page.getByRole('button', { name: 'Ausgerichteten Job laden' }).click();
  await expect(page.getByTestId('job-name')).toContainText(
    'demo-schild_vorderseite_ausgerichtet.nc',
  );
  // It still is the front of the two-sided job.
  await jobView(page, 'Prüfen');
  await expect(page.locator('[data-check="flip"]')).toContainText('danach wird gewendet');

  await cut(page);
  const turn = page.getByTestId('flip-turn');
  await expect(turn).toBeVisible({ timeout: 90_000 });
  await expect(turn).toContainText('Die vordere Kante kommt nach hinten, links bleibt links');
  await expect(turn).toContainText(
    'Zwei Passstifte Ø 8 mm in die Löcher im Tisch stecken und das Teil mit seinen Passlöchern daraufsetzen',
  );
  // Turned with the board, the drawing's places are the board's own, 20/20 from its corner:
  // the holes 18 mm in front of and behind the plate, 18 mm deep (12 mm of board and 6 mm of
  // spoilboard).
  const holes = (await boardCuts(page)).filter((c) => c.through);
  expect(holes).toHaveLength(2);
  holes.sort((p, q) => p.y - q.y);
  expect(Math.hypot(holes[0]!.x - 140, holes[0]!.y - 62)).toBeLessThan(0.5);
  expect(Math.hypot(holes[1]!.x - 140, holes[1]!.y - 158)).toBeLessThan(0.5);
  expect(holes[0]!.z).toBeCloseTo(-80 - 18, 3);

  await turn.getByRole('button', { name: 'Teil sitzt auf den Stiften und ist fest' }).click();
  // The simulated board sits on its pins, turned over exactly about the line across the
  // holes' middle: its long edge still lies 1.5° askew, the board now back up.
  const lying = await board(page);
  expect(lying.flipped).toBe(true);
  // (The machine's Y leans by 0.08°: the line through the holes does too, and a turned part
  // shows that twice.)
  expect(Math.abs((((lying.angle % 360) + 360) % 360) - 1.5)).toBeLessThan(0.2);
  await expect(page.getByTestId('flip-located')).toContainText(
    'Rückseite geladen, der Nullpunkt ist der der Vorderseite',
  );
  // The back lies as the front did: turned by the same 1.5°.
  await expect(page.getByTestId('job-name')).toContainText(
    'demo-schild_rueckseite_ausgerichtet.nc',
  );
  await jobView(page, 'Prüfen');
  await expect(page.locator('[data-check="flip"]')).toHaveClass(/check-ok/);

  await cut(page);
  await expect(flow).toContainText('Beide Seiten sind gefräst', { timeout: 120_000 });
  // The back pocket drawn at 160/100 sits at 180/120 of the board, the outline around
  // the plate (80…200 × 80…140 there) – on pins as exactly as the machine is square.
  const back = (await boardCuts(page))
    .filter((c) => c.back)
    .flatMap((c) => [{ x: c.x, y: c.y }, ...(c.x2 === undefined ? [] : [{ x: c.x2, y: c.y2! }])]);
  const pocket = back.filter((p) => Math.hypot(p.x - 180, p.y - 120) <= 7);
  expect(pocket.length).toBeGreaterThan(20);
  const outline = back.filter((p) => Math.hypot(p.x - 180, p.y - 120) > 7);
  expect(outline.length).toBeGreaterThan(20);
  for (const p of outline) {
    const off = Math.hypot(Math.max(80 - p.x, 0, p.x - 200), Math.max(80 - p.y, 0, p.y - 140));
    expect(Math.abs(off - 4)).toBeLessThan(1);
  }
});
