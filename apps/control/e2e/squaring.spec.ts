import { expect, test, type Page } from '@playwright/test';
import { goTo, hold, openDemo, openJog } from './helpers';

// The accuracy check on the simulated machine of the demo: four marks, six distances, the correction written to
// config.yaml, the machine homed again, the same pattern measured again. The simulator's gantry answers to the two
// pull-offs (`SIM_GANTRY`: rails 1400 mm apart, motor 1 on the right, Y homes towards −Y), so a correction acts after the
// next homing – and a wrong side makes it worse.

test.beforeEach(({}, info) => {
  test.skip(info.project.name === 'ipad', 'the touch project adds nothing here');
});

/** The six distances a rule gives between the four marks as the simulated machine really cuts them, 2 decimals. */
async function ruler(page: Page, x = 500, y = 400) {
  return page.evaluate(
    ([sx, sy]) => {
      const sim = (
        window as unknown as {
          lowriderSimulator: {
            physical(p: { x: number; y: number; z: number }): { x: number; y: number };
            wcs: Record<string, { x: number; y: number; z: number }>;
          };
        }
      ).lowriderSimulator;
      const zero = sim.wcs.G54!;
      const at = (dx: number, dy: number) =>
        sim.physical({ x: zero.x + dx, y: zero.y + dy, z: zero.z });
      const A = at(0, 0);
      const B = at(sx!, 0);
      const C = at(sx!, sy!);
      const D = at(0, sy!);
      const d = (p: { x: number; y: number }, q: { x: number; y: number }) =>
        Math.hypot(p.x - q.x, p.y - q.y).toFixed(2);
      return {
        'A → B, vorne (X)': d(A, B),
        'D → C, hinten (X)': d(D, C),
        'A → D, links (Y)': d(A, D),
        'B → C, rechts (Y)': d(B, C),
        'Diagonale A → C': d(A, C),
        'Diagonale B → D': d(B, D),
      };
    },
    [x, y],
  );
}

async function openCheck(page: Page) {
  await goTo(page, 'Service & Diagnose', 'Kalibrieren');
  const check = page.getByTestId('accuracy-check');
  await check.scrollIntoViewIfNeeded();
  return check;
}

async function fill(check: ReturnType<Page['getByTestId']>, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) await check.getByLabel(label).fill(value);
}

const step = (check: ReturnType<Page['getByTestId']>, key: string) =>
  check.getByTestId('accuracy-steps').locator(`[data-step="${key}"]`);

/** Homes the simulated machine, as the operator does after restarting the controller. */
async function rehome(page: Page) {
  await openJog(page);
  await hold(page, /^Referenzfahrt/);
  await expect(page.getByTestId('machine-state')).toContainText('Bereit', { timeout: 60_000 });
}

test('the drawings tie each field to its line and name the sides, the steps tick only from what is seen', async ({
  page,
}) => {
  await openDemo(page);
  const check = await openCheck(page);
  const sketch = check.getByTestId('accuracy-sketch');
  await expect(sketch).toBeVisible();
  // six lines, each with a number, drawn in six different styles
  await expect(sketch.locator('[data-line]')).toHaveCount(6);
  await expect(sketch.locator('.sketch-badge')).toHaveCount(6);
  const dashes = await sketch
    .locator('[data-line]')
    .evaluateAll((lines) => lines.map((l) => l.getAttribute('stroke-dasharray') ?? 'solid'));
  expect(new Set(dashes).size).toBeGreaterThanOrEqual(4);
  // the sides are named, with the front where the operator stands
  await expect(sketch).toContainText('vorne (Bediener)');
  await expect(sketch).toContainText('X−');
  await expect(sketch).toContainText('X+');
  await expect(check.getByTestId('accuracy-selfcheck')).toContainText('+X von A nach B');

  // the field that has the focus lights its line in the drawing; every field has its own small drawing beside it
  await expect(check.locator('.line-glyph')).toHaveCount(6);
  const field = check.getByLabel('Diagonale B → D');
  await field.focus();
  await expect(sketch).toHaveAttribute('data-active', 'diagonalBD');
  await expect(sketch.locator('[data-line="diagonalBD"]')).toHaveClass(/sketch-line-on/);
  await expect(check.locator('.line-glyph[data-glyph="diagonalBD"]')).toBeVisible();
  await check.getByLabel('A → B, vorne (X)').focus();
  await expect(sketch).toHaveAttribute('data-active', 'bottom');
  await check.getByLabel('Tiefe (mm)').focus();
  await expect(sketch).toHaveAttribute('data-active', '');

  // the steps: the first one is at hand, nothing is ticked that has not happened
  await expect(step(check, 'cut')).toHaveAttribute('data-state', 'current');
  await expect(step(check, 'measure')).toHaveAttribute('data-state', 'todo');
  await check.getByRole('button', { name: 'Als Job laden' }).click();
  await goTo(page, 'Service & Diagnose', 'Kalibrieren');
  await expect(step(check, 'cut')).toHaveAttribute('data-state', 'done');
  await expect(step(check, 'measure')).toHaveAttribute('data-state', 'current');
  await fill(check, await ruler(page));
  await expect(step(check, 'measure')).toHaveAttribute('data-state', 'done');
  await expect(step(check, 'evaluate')).toHaveAttribute('data-state', 'current');
  await expect(step(check, 'restart')).toHaveAttribute('data-state', 'todo');
});

test('a correction on the simulated gantry: said in words, written, homed again, measured again – before and after side by side', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openDemo(page);
  const check = await openCheck(page);
  await fill(check, await ruler(page));
  await check.getByRole('button', { name: 'Auswerten' }).click();
  await expect(page.getByTestId('accuracy-result')).toBeVisible();

  // the rail distance and the side of motor 1 are asked with a drawing of the machine
  const gantry = check.getByTestId('gantry-sketch');
  await expect(gantry).toBeVisible();
  await expect(gantry).toContainText('Abstand der Y-Schienen');
  await expect(check.getByTestId('gantry-help')).toContainText(
    'Mitte Schiene links bis Mitte Schiene rechts',
  );
  await check.getByLabel('Abstand der Y-Schienen (mm)').fill('1400');
  await check.getByRole('button', { name: 'Motor 1 rechts (X+)' }).click();
  await expect(gantry).toHaveAttribute('data-motor1', 'xMax');

  // in words: which side stands further back, by how much, and what the correction does about it
  const story = check.getByTestId('squaring-story');
  await expect(story).toContainText('Seite rechts (X+) steht um');
  await expect(story).toContainText('weiter hinten (+Y)');
  await expect(story).toContainText(/1,9\d mm/);
  await expect(story).toContainText('nach vorne (−Y) gegenüber X−');
  await expect(check.getByTestId('calibration-corrections')).toContainText(
    'axes/y/motor0/pulloff_mm',
  );
  await expect(check.getByTestId('calibration-corrections')).toContainText(
    'axes/y/motor1/pulloff_mm',
  );

  // written: the first measurement is kept as "before", the fields are empty – it cannot be corrected a second time
  await hold(page, /Korrektur in config\.yaml schreiben/);
  await expect(step(check, 'write')).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(step(check, 'restart')).toHaveAttribute('data-state', 'current');
  await expect(check.getByTestId('accuracy-after-write')).toContainText(
    'Steuerung neu starten und referenzieren',
  );
  await expect(check.getByLabel('A → B, vorne (X)')).toHaveValue('');
  await expect(check.getByTestId('accuracy-result')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lowrider-control.accuracy'))).toContain(
    '"before"',
  );

  // a pattern measured before the machine was homed again still shows the old error: it is not corrected a second time
  await fill(check, await ruler(page));
  await check.getByRole('button', { name: 'Auswerten' }).click();
  await expect(check.getByTestId('correction-blocked')).toBeVisible();
  await expect(
    check.getByRole('button', { name: /Korrektur in config\.yaml schreiben/ }),
  ).toBeDisabled();
  await expect(check.getByTestId('accuracy-verdict')).toHaveAttribute('data-verdict', 'unchanged');

  // homed again: the step ticks, the measurement is of use now
  await rehome(page);
  await openCheck(page);
  await expect(step(check, 'restart')).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(check.getByTestId('accuracy-after-write')).toContainText('neu referenziert');
  await fill(check, await ruler(page));
  await check.getByRole('button', { name: 'Auswerten' }).click();

  // before and after side by side, and the verdict: square within what the rule can show
  const compare = check.getByTestId('accuracy-compare');
  await expect(compare).toContainText('Vorher');
  await expect(compare).toContainText('Nachher');
  await expect(check.getByTestId('accuracy-verdict')).toHaveAttribute('data-verdict', 'good');
  await expect(check.getByTestId('squaring-story')).toHaveCount(0);
  await expect(step(check, 'evaluate2')).toHaveAttribute('data-state', 'done');
});

test('the side of motor 1 given wrong makes the error twice as large – and the check says so', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openDemo(page);
  const check = await openCheck(page);
  await fill(check, await ruler(page));
  await check.getByRole('button', { name: 'Auswerten' }).click();
  await check.getByLabel('Abstand der Y-Schienen (mm)').fill('1400');
  // the simulated motor 1 is on the right; here it is told to be on the left
  await check.getByRole('button', { name: 'Motor 1 links (X−)' }).click();
  await hold(page, /Korrektur in config\.yaml schreiben/);
  await expect(step(check, 'write')).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await rehome(page);
  await openCheck(page);
  await expect(step(check, 'restart')).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await fill(check, await ruler(page));
  await check.getByRole('button', { name: 'Auswerten' }).click();
  const verdict = check.getByTestId('accuracy-verdict');
  await expect(verdict).toHaveAttribute('data-verdict', 'doubled');
  await expect(verdict).toContainText('Y-Motor 1 sitzt auf der anderen Seite');
  // and the correction is offered again, now the other way round, on the numbers of the control measurement
  await check.getByRole('button', { name: 'Motor 1 rechts (X+)' }).click();
  await expect(check.getByTestId('squaring-story')).toContainText('nach vorne (−Y) gegenüber X−');
});

test("on the machine's own screen the field and its small drawing are in view together while typing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await openDemo(page);
  const check = await openCheck(page);
  for (const line of ['bottom', 'diagonalAC', 'diagonalBD'] as const) {
    const label = {
      bottom: 'A → B, vorne (X)',
      diagonalAC: 'Diagonale A → C',
      diagonalBD: 'Diagonale B → D',
    }[line];
    const field = check.getByLabel(label);
    await field.scrollIntoViewIfNeeded();
    await field.focus();
    await expect(field).toBeInViewport({ ratio: 1 });
    await expect(check.locator(`.line-glyph[data-glyph="${line}"]`)).toBeInViewport({ ratio: 1 });
  }
});
