import { expect, test, type Page } from '@playwright/test';
import {
  drawShape,
  goTo,
  hold,
  jobView,
  numberIn,
  onStage,
  openDemo,
  tableSpot,
  startJob,
} from './helpers';

// A series on scattered blanks, on the simulated machine of the demo with its series
// scene: three tags, a round and a square coaster, a long sign – and two tags of which
// one lies on the other. Found on the table picture, the motif laid on each, one
// program – checked against what the simulated cutter really left on every blank.

/** A cut on a blank, in the blank's own coordinates: from its middle, x along its long side. */
interface Cut {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  /** Lowest point, machine Z (the surface is at −80) */
  z: number;
}

const blankCuts = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        lowriderSimulator: { blankCuts(): { blanks: { id: string; cuts: Cut[] }[]; stray: Cut[] } };
      }
    ).lowriderSimulator.blankCuts(),
  );

/** The box around the grooves on a blank (not the single plunges). */
function box(cuts: Cut[]) {
  const grooves = cuts.filter((c) => c.x2 !== undefined);
  const xs = grooves.flatMap((c) => [c.x, c.x2!]);
  const ys = grooves.flatMap((c) => [c.y, c.y2!]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** The blanks as the table view draws them: id, state and middle (work XY). */
async function drawnBlanks(page: Page) {
  const text = (await page.getByTestId('table-view').getAttribute('data-blanks')) ?? '';
  return text
    .split(';')
    .filter(Boolean)
    .map((entry) => {
      const [id, state, at] = entry.split(':');
      const [x, y] = at!.split(',').map(Number);
      return { id: Number(id), state: state!, x: x!, y: y! };
    });
}

/**
 * The name of the program on the table: the action bar of every step shows it – except the drawing
 * workspace, where the series card says it itself while the flow is open.
 */
const fileName = (page: Page) =>
  page.getByTestId('series-program').or(page.getByTestId('job-name'));

/** The demo with the blanks on the table, time running fast, and an empty drawing. */
async function openSeriesScene(page: Page) {
  await openDemo(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
  const sim = page.getByTestId('simulator-card');
  // The first impression of the demo is the board; the blanks are a switch away.
  await expect(sim.getByRole('button', { name: 'Brett und Kalibriertafel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await sim.getByRole('button', { name: 'Rohlinge für eine Serie' }).click();
  await expect(sim).toContainText('zwei Anhänger liegen aufeinander');
  await sim.getByRole('button', { name: '50×' }).click();
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  return cam;
}

/** Runs the loaded program from the (simulated) SD card to its end. */
async function cut(page: Page) {
  await startJob(page);
  await expect(page.getByTestId('run-summary')).toBeVisible({ timeout: 120_000 });
}

test('a series from the table picture: blanks found, one refused, one left out, one turned, all cut where they lie', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const cam = await openSeriesScene(page);

  // Without a motif there is nothing to spread.
  const entry = page.getByTestId('series-entry');
  await expect(entry.getByRole('button', { name: 'Serie: auf Rohlinge verteilen' })).toBeDisabled();
  await expect(entry).toContainText('Zuerst das Motiv zeichnen');

  // The motif: a 40 × 16 frame, engraved, with a hole 10 mm right of its middle – so the
  // cuts tell which way round it lies.
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '40',
    'Höhe (mm)': '16',
    'X links (mm)': '0',
    'Y unten (mm)': '0',
  });
  await drawShape(page, 'Kreis', {
    'Durchmesser (mm)': '8',
    'X Mitte (mm)': '30',
    'Y Mitte (mm)': '8',
  });
  await cam.getByLabel('Bearbeitung Kontur 1').selectOption('on');
  await cam.getByLabel('Bearbeitung Kontur 2').selectOption('drill');

  // One entry, then a short sequence: find the blanks, check the motif, cut.
  await entry.getByRole('button', { name: 'Serie: auf Rohlinge verteilen' }).click();
  const series = page.getByTestId('series-card');
  await expect(series.locator('.flip-steps li.current')).toHaveText(/Rohlinge finden/);
  await expect(series).toContainText('festgeklebt');
  // The demo has a picture of the table already.
  await series.getByRole('button', { name: 'Auf dem Tisch-Bild suchen' }).click();
  await expect(series.locator('.flip-steps li.current')).toHaveText(/Motiv prüfen/);
  await expect(page.getByTestId('series-found')).toHaveText('6 Rohlinge gefunden');

  // The two tags lying on each other are not taken, and the app says what to do.
  await expect(page.getByTestId('series-refused')).toContainText(
    'Rohlinge berühren sich (oder die Form hat eine Einbuchtung) – etwas auseinanderlegen.',
  );
  const drawn = await drawnBlanks(page);
  expect(drawn.filter((b) => b.state === 'refused')).toHaveLength(1);
  expect(drawn.filter((b) => b.state === 'cut')).toHaveLength(6);

  // Each as it lies: in the order of cutting (nearest next), with size and turn. The
  // simulator's blanks are 70 × 40 at 20°, −35° and 78°, a 55 mm square at 12°, a
  // Ø 60 disc and a 150 × 40 sign at −4°.
  const rows = page.getByTestId('series-list').locator('li');
  await expect(rows).toHaveCount(6);
  const said = await rows.allInnerTexts();
  const angle = (text: string) => numberIn(/, (\S+)° gedreht/.exec(text)?.[1] ?? null);
  const size = (text: string) => /(\d+) × (\d+) mm/.exec(text)!.slice(1).map(Number);
  [20, -35, 78].forEach((want, i) => {
    expect(Math.abs(angle(said[i]!) - want), said[i]).toBeLessThanOrEqual(1);
    const [l, w] = size(said[i]!);
    expect(Math.abs(l! - 70)).toBeLessThanOrEqual(1);
    expect(Math.abs(w! - 40)).toBeLessThanOrEqual(1);
  });
  expect(said[3]).toContain('quadratisch');
  expect(Math.abs(angle(said[3]!) - 12)).toBeLessThanOrEqual(1);
  expect(said[4]).toMatch(/rund, Ø (59|60) mm/);
  expect(Math.abs(size(said[5]!)[0]! - 150)).toBeLessThanOrEqual(1);
  expect(Math.abs(angle(said[5]!) - -4)).toBeLessThanOrEqual(1);
  // The motif fits on all of them, and the app says how exact the table picture is.
  await expect(page.getByTestId('series-notes')).toHaveCount(0);
  await expect(page.getByTestId('series-accuracy')).toContainText('0,2–0,5 mm');
  await expect(series).toContainText('Kein Nullpunkt je Rohling');
  await expect(series).toContainText('Nur Z0 muss auf der Oberfläche eines Rohlings stehen');
  // The program is on the table already, named as a series.
  await expect(fileName(page)).toContainText('demo-schild_serie_6x.nc');

  // A tap on the square coaster (the fourth) leaves it out: the ones after it move up.
  const square = drawn.find((b) => b.id === 3)!;
  const spot = await tableSpot(page, square);
  expect(await onStage(page, spot)).toBe(true);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.getByTestId('series-blank-3')).toHaveAttribute('data-state', 'excluded');
  await expect(page.getByTestId('series-blank-3')).toContainText('ausgelassen');
  await expect(page.getByTestId('series-blank-4').locator('.series-n')).toHaveText('4');
  await expect(fileName(page)).toContainText('demo-schild_serie_5x.nc');
  expect((await drawnBlanks(page)).find((b) => b.id === 3)!.state).toBe('out');
  // The view stayed where it was: the next tap hits what it shows.
  expect(await tableSpot(page, square)).toEqual(spot);

  // The motif on the first tag turned round: a rectangle looks the same both ways.
  const motifAngle = async (id: number) =>
    Number(await page.getByTestId(`series-blank-${id}`).getAttribute('data-angle'));
  expect(Math.abs((await motifAngle(0)) - 20)).toBeLessThan(0.5);
  await series.getByRole('button', { name: 'Motiv auf Rohling 1 drehen' }).click();
  await expect.poll(async () => Math.abs((await motifAngle(0)) + 160)).toBeLessThan(0.5);
  // The round coaster shows no direction: straight at first, a quarter turn per tap.
  await expect(page.getByTestId('series-blank-4')).toHaveAttribute('data-angle', '0.0');
  await series.getByRole('button', { name: 'Motiv auf Rohling 4 drehen' }).click();
  await expect(page.getByTestId('series-blank-4')).toHaveAttribute('data-angle', '90.0');

  // One program for the Job room; the readiness list knows it is a series.
  await page.getByTestId('series-make').click();
  await expect(series).toHaveCount(0);
  await expect(fileName(page)).toContainText('demo-schild_serie_5x.nc');
  await jobView(page, 'Prüfen');
  const ready = page.getByTestId('readiness');
  await expect(ready.locator('[data-check="series"]')).toHaveText(
    'Serie liegt auf 5 Rohling(en), wie die Kamera sie gefunden hat',
  );
  await expect(ready.locator('.check-block')).toHaveCount(0);
  // The clamp marked on the table is checked against this program like against any other.
  await expect(ready.locator('[data-check="clamp"]')).toHaveCount(0);

  await cut(page);
  const { blanks, stray } = await blankCuts(page);
  const on = (id: string) => blanks.find((b) => b.id === id)!.cuts;
  // Nothing beside the blanks, nothing on the one left out, nothing on the two refused.
  expect(stray).toEqual([]);
  expect(on('square')).toEqual([]);
  expect(on('pair-1')).toEqual([]);
  expect(on('pair-2')).toEqual([]);
  // On every other blank the frame lies in the middle, along the blank: 40 mm along its
  // long side, 16 across – as exact as the table picture (0.5 mm). A motif turned the
  // wrong way would show as a box much larger than that.
  for (const id of ['tag-1', 'tag-2', 'tag-3', 'sign', 'round']) {
    const b = box(on(id));
    const quarter = id === 'round';
    const [along, across] = quarter ? [8, 20] : [20, 8];
    expect(Math.abs(b.minX + along), id).toBeLessThan(0.5);
    expect(Math.abs(b.maxX - along), id).toBeLessThan(0.5);
    expect(Math.abs(b.minY + across), id).toBeLessThan(0.5);
    expect(Math.abs(b.maxY - across), id).toBeLessThan(0.5);
    // The hole (6 mm deep; the frame is 1 mm) says which way round: 10 mm from the middle
    // towards the right end – on the turned tag towards the left, on the round coaster
    // (a quarter turn) upwards.
    const holes = on(id).filter((c) => c.x2 === undefined && c.z < -84);
    expect(holes, id).toHaveLength(1);
    const want = id === 'tag-1' ? { x: -10, y: 0 } : quarter ? { x: 0, y: 10 } : { x: 10, y: 0 };
    expect(Math.hypot(holes[0]!.x - want.x, holes[0]!.y - want.y), id).toBeLessThan(0.5);
  }

  // The history names the series with the number of its blanks.
  await goTo(page, 'Service & Diagnose', 'Historie');
  await expect(page.getByTestId('history-card')).toContainText('demo-schild_serie_5x.nc');
});

test('a series with a name on every blank: scanned anew, measured with the camera, and still on the blanks after the zero moved', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const cam = await openSeriesScene(page);
  // The motif: a text – it gives the names their size and their place.
  await cam.getByRole('button', { name: 'Text', exact: true }).click();
  await cam.getByTestId('cam-text').fill('Name');
  await cam.getByLabel('Schrifthöhe (mm)').fill('8');
  await page.getByRole('button', { name: 'Serie: auf Rohlinge verteilen' }).click();
  const series = page.getByTestId('series-card');

  // A fresh scan of a part of the table: the two tags in front, the square and the round
  // coaster. The third tag and the long sign are cut off by the edge of the pictures.
  await series.getByText('Bereich ändern').click();
  await series.getByLabel('X von (mm)').fill('-35');
  await series.getByLabel('X bis (mm)').fill('215');
  await series.getByLabel('Y von (mm)').fill('-17');
  await series.getByLabel('Y bis (mm)').fill('190');
  await expect(page.getByTestId('series-estimate')).toContainText('16 Bilder');
  await hold(page, /Tisch neu scannen/);
  await expect(page.getByTestId('series-scan')).toBeVisible();
  await expect(page.getByTestId('series-found')).toHaveText('4 Rohlinge gefunden', {
    timeout: 120_000,
  });
  await expect(page.getByTestId('series-refused')).toContainText(
    'Liegt am Rand des Tisch-Bilds – größeren Bereich scannen.',
  );

  // A running number on each, from any start; it takes the place of the drawing's text.
  await series.getByRole('button', { name: 'Laufende Nummer' }).click();
  await series.getByLabel('Erste Nummer').fill('7');
  await expect(page.getByTestId('series-blank-0').locator('strong')).toHaveText('7');
  await expect(page.getByTestId('series-blank-3').locator('strong')).toHaveText('10');

  // Names from a list, one line per blank in the order of the numbers; the fourth has none.
  await series.getByRole('button', { name: 'Ein Name je Rohling' }).click();
  await series.getByTestId('series-names').fill('Anna\nBen\nClara');
  await expect(series).toContainText('Ersetzt den Text „Name“ der Zeichnung');
  await expect(page.getByTestId('series-blank-0')).toContainText('Anna');
  await expect(page.getByTestId('series-blank-1')).toContainText('Ben');
  await expect(page.getByTestId('series-blank-2')).toContainText('Clara');
  await expect(page.getByTestId('series-blank-3')).toHaveAttribute('data-state', 'unnamed');
  await expect(page.getByTestId('series-notes')).toContainText(
    'Kein Name mehr für 1 Rohling – ohne Gravur.',
  );
  await expect(fileName(page)).toContainText('demo-schild_serie_3x.nc');
  // A name too long for its blank is named, not cut over the edge without a word.
  await series.getByTestId('series-names').fill('Anna\nBenedikt-Maximilian\nClara');
  await expect(page.getByTestId('series-notes')).toContainText(
    'Das Motiv ragt über den Rand (oder kommt ihm näher als 1 mm): Rohling 2.',
  );
  await expect(page.getByTestId('series-blank-1')).toContainText('Motiv ragt über den Rand');
  await series.getByTestId('series-names').fill('Anna\nBen\nClara');
  await expect(page.getByTestId('series-notes')).not.toContainText('ragt über den Rand');

  // The better way: the camera drives over every blank that is engraved and measures it
  // in the middle of the live picture.
  await hold(page, /Mit der Kamera nachmessen/);
  await expect(page.getByTestId('series-measuring')).toBeVisible();
  await expect(page.getByTestId('series-measuring')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId('series-accuracy')).toHaveText(
    '3 von 3 nachgemessen: auf etwa 0,1 mm.',
  );
  await expect(page.getByTestId('series-blank-0')).toContainText('nachgemessen');
  await page.getByTestId('series-make').click();

  // The X/Y zero set somewhere else afterwards: the blanks stay where they are, so the
  // program is written anew for them.
  const before = await fileName(page).textContent();
  await goTo(page, 'Einrichten', 'Nullpunkte');
  await page.getByRole('button', { name: 'XY = 0', exact: true }).click();
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText(
    'Nullpunkt neu gesetzt: Serie neu berechnet, sie liegt weiter auf den Rohlingen.',
  );
  await jobView(page, 'Prüfen');
  expect(await fileName(page).textContent()).toBe(before);
  await expect(page.getByTestId('readiness').locator('.check-block')).toHaveCount(0);

  await cut(page);
  const { blanks, stray } = await blankCuts(page);
  const on = (id: string) => blanks.find((b) => b.id === id)!.cuts;
  expect(stray).toEqual([]);
  expect(on('round')).toEqual([]);
  expect(on('tag-3')).toEqual([]);
  expect(on('sign')).toEqual([]);
  // Each name lies in the middle of its blank and along it: 8 mm high letters make a box
  // 8 mm high – turned wrongly it would be far higher. Measured with the camera, the
  // middle is right to a few tenths (the width of the letters' side bearings left and right).
  const widths: number[] = [];
  for (const id of ['tag-1', 'tag-2', 'square']) {
    const b = box(on(id));
    expect(Math.abs(b.maxY - b.minY - 8), id).toBeLessThan(0.4);
    expect(Math.abs((b.minY + b.maxY) / 2), id).toBeLessThan(0.3);
    expect(Math.abs((b.minX + b.maxX) / 2), id).toBeLessThan(1);
    widths.push(b.maxX - b.minX);
  }
  // Anna, Ben and Clara are not equally long: each blank got its own name.
  expect(widths[1]!).toBeLessThan(widths[0]! - 3);
  expect(widths[2]!).toBeGreaterThan(widths[1]! + 3);
});

test('"Rahmen aufziehen" left on does not take the taps of the series flow – it has no switch there', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const cam = await openSeriesScene(page);
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '40',
    'Höhe (mm)': '16',
    'X links (mm)': '0',
    'Y unten (mm)': '0',
  });
  await cam.getByRole('checkbox', { name: 'Rahmen aufziehen' }).check();
  await cam
    .getByTestId('series-entry')
    .getByRole('button', { name: 'Serie: auf Rohlinge verteilen' })
    .click();
  const series = page.getByTestId('series-card');
  await series.getByRole('button', { name: 'Auf dem Tisch-Bild suchen' }).click();
  await expect(page.getByTestId('series-found')).toHaveText('6 Rohlinge gefunden');
  // the switch is gone with the cards, and a tap on a blank leaves it out as ever
  await expect(page.getByRole('checkbox', { name: 'Rahmen aufziehen' })).toHaveCount(0);
  const square = (await drawnBlanks(page)).find((b) => b.id === 3)!;
  const spot = await tableSpot(page, square);
  expect(await onStage(page, spot)).toBe(true);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.getByTestId('series-blank-3')).toHaveAttribute('data-state', 'excluded');
  // and a drag is no frame: the view pans
  const view = await page.getByTestId('table-view').getAttribute('data-view');
  const canvas = (await page.getByTestId('stage-canvas').boundingBox())!;
  const from = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.8 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 90, from.y + 30, { steps: 8 });
  await expect(page.getByTestId('table-view')).not.toHaveAttribute('data-drawing-marquee');
  await page.mouse.up();
  await expect.poll(() => page.getByTestId('table-view').getAttribute('data-view')).not.toBe(view);
});
