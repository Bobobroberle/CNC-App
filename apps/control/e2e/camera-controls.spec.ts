import { expect, test, type Page } from '@playwright/test';
import { goTo, installFakeCameraPi, seedCamera } from './helpers';

// The camera's picture settings from the app (Einstellungen → Kamera → Belichtung und Bild): exposure and gain are set through
// the companion instead of by SSH. The companion here is the real code of the companion over a camera that keeps its values
// (`installFakeCameraPi`): what the camera refuses is refused here for the same reason, and what it reports is what is shown.

const card = (page: Page) => page.getByTestId('camera-controls');
const control = (page: Page, name: string) => card(page).getByTestId(`camera-control-${name}`);
/** The number field of a setting, by the name the operator reads over it */
const field = (page: Page, name: string) => card(page).getByRole('textbox', { name, exact: true });

/** The picture this device shows, chosen where the operator chooses it. */
async function chooseSource(page: Page, name: 'Gerätekamera' | 'Companion-Stream') {
  await goTo(page, 'Einstellungen', 'Kamera');
  const button = page.getByRole('group', { name: 'Bildquelle' }).getByRole('button', { name });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

async function openSettings(page: Page) {
  await page.goto('/');
  await goTo(page, 'Einstellungen', 'Kamera');
  await expect(card(page)).toBeVisible();
}

/** Opens the panel of the scan under Einrichten → Kamera, in the mode that has the exposure field. */
async function openScanPanel(page: Page) {
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  const section = page
    .locator('.section[data-fold]')
    .filter({ has: page.getByRole('heading', { name: 'Fläche scannen', exact: true }) });
  if ((await section.getAttribute('data-open')) === null) {
    await section.locator('[data-fold-trigger]').first().click();
  }
  const panel = page.getByTestId('photo-map-panel');
  await expect(panel).toBeVisible();
  await panel
    .getByRole('group', { name: 'Art des Scans' })
    .getByRole('button', { name: 'In Fahrt (schnell)' })
    .click();
  return panel;
}

test('the exposure: to manual, the time in milliseconds, and what the camera reports comes back', async ({
  page,
}) => {
  const pi = await installFakeCameraPi(page);
  await openSettings(page);
  const mode = control(page, 'auto_exposure').getByRole('combobox');
  const time = field(page, 'Belichtungszeit (ms)');
  // the camera starts on automatic: the time does nothing, and the card says so
  await expect(mode).toHaveValue('3');
  await expect(time).toBeDisabled();
  await expect(
    control(page, 'exposure_time_absolute').getByTestId('control-inactive'),
  ).toContainText('solange der Belichtungsmodus nicht „Manuell“ ist');
  await expect(control(page, 'exposure_time_absolute')).toContainText('Bereich 0,1 bis 500 ms');
  // a setting the app may not change is not there
  await expect(control(page, 'hue')).toHaveCount(0);
  expect(await card(page).getByRole('combobox').count()).toBeGreaterThan(0);

  await mode.selectOption({ label: 'Manuell' });
  await expect(time).toBeEnabled();
  await expect(mode).toHaveValue('1');
  await expect(time).toHaveValue('15,7');

  // typed with a comma, taken when Enter is pressed – in the camera's unit of 100 µs
  await time.fill('12,3');
  await time.press('Enter');
  await expect.poll(() => pi.camera.get('exposure_time_absolute').value).toBe(123);
  await expect(time).toHaveValue('12,3');
  // the switch first, then the time: one write each, and the camera was set in that order
  expect(pi.puts).toEqual([{ auto_exposure: 1 }, { exposure_time_absolute: 123 }]);
  const sets = pi.camera.calls.filter((c) => c[2] === '--set-ctrl').map((c) => c[3]);
  expect(sets).toEqual(['auto_exposure=1', 'exposure_time_absolute=123']);
  // the mark of the result goes by itself after a while; a refusal would stay in the row's note
  await expect(control(page, 'exposure_time_absolute').getByTestId('control-note')).toHaveCount(0);

  // the buttons: one millisecond a step
  await card(page).getByRole('button', { name: 'Belichtungszeit +' }).click();
  await expect.poll(() => pi.camera.get('exposure_time_absolute').value).toBe(133);
  await expect(time).toHaveValue('13,3');
});

test('what the camera makes of a value is what is shown – and a number outside its range is not sent', async ({
  page,
}) => {
  // a camera that only keeps the exposure in steps of a millisecond
  const pi = await installFakeCameraPi(page, {
    round: (name, v) => (name === 'exposure_time_absolute' ? v - (v % 10) : v),
  });
  await openSettings(page);
  await control(page, 'auto_exposure').getByRole('combobox').selectOption({ label: 'Manuell' });
  const time = field(page, 'Belichtungszeit (ms)');
  await expect(time).toBeEnabled();
  await time.fill('12,34');
  await time.press('Enter');
  await expect(time).toHaveValue('12');
  await expect(control(page, 'exposure_time_absolute').getByTestId('control-note')).toContainText(
    'Die Kamera hat 12 ms daraus gemacht.',
  );
  expect(pi.puts.at(-1)).toEqual({ exposure_time_absolute: 123 });

  const writes = pi.puts.length;
  await time.fill('600');
  await time.press('Enter');
  await expect(control(page, 'exposure_time_absolute').getByTestId('control-note')).toContainText(
    'Außerhalb dessen, was die Kamera annimmt (0,1 bis 500 ms) – nicht gesetzt.',
  );
  await expect(time).toHaveValue('12');
  await time.fill('zwölf');
  await time.press('Enter');
  await expect(control(page, 'exposure_time_absolute').getByTestId('control-note')).toContainText(
    'Das ist keine Zahl',
  );
  expect(pi.puts).toHaveLength(writes);
});

test('a value the camera refuses is said in German – and the card follows the camera', async ({
  page,
}) => {
  const pi = await installFakeCameraPi(page);
  await openSettings(page);
  await control(page, 'auto_exposure').getByRole('combobox').selectOption({ label: 'Manuell' });
  const time = field(page, 'Belichtungszeit (ms)');
  await expect(time).toBeEnabled();
  // another device put the camera back on automatic a moment ago: this card does not know yet
  pi.camera.get('auto_exposure').value = 3;
  await time.fill('5');
  await time.press('Enter');
  const note = control(page, 'exposure_time_absolute').getByTestId('control-note');
  await expect(note).toContainText(
    'Die Kamera hat sie gerade abgeschaltet (Automatik an) – nicht gesetzt.',
  );
  // nothing reached the camera, and the display is what the camera reports now
  expect(pi.camera.calls.filter((c) => c[2] === '--set-ctrl').map((c) => c[3])).toEqual([
    'auto_exposure=1',
  ]);
  await expect(time).toBeDisabled();
  await expect(time).toHaveValue('15,7');
  await expect(control(page, 'auto_exposure').getByRole('combobox')).toHaveValue('3');
});

test('a switch and a choice: the white balance by hand, the focus', async ({ page }) => {
  const pi = await installFakeCameraPi(page);
  await openSettings(page);
  const temperature = field(page, 'Farbtemperatur');
  await expect(temperature).toBeDisabled();
  await control(page, 'white_balance_automatic').getByRole('checkbox').click();
  await expect(temperature).toBeEnabled();
  await expect.poll(() => pi.camera.get('white_balance_automatic').value).toBe(0);
  // four digits stand in the field as typed back – not grouped, or leaving the field would change the number
  await expect(temperature).toHaveValue('4600');
  const writes = pi.puts.length;
  await temperature.focus();
  await temperature.blur();
  await expect(control(page, 'white_balance_temperature').getByTestId('control-note')).toHaveCount(
    0,
  );
  await expect(temperature).toHaveValue('4600');
  expect(pi.puts).toHaveLength(writes);
  await temperature.fill('5200');
  await temperature.press('Enter');
  await expect.poll(() => pi.camera.get('white_balance_temperature').value).toBe(5200);
  await expect(temperature).toHaveValue('5200');
  await expect(control(page, 'white_balance_temperature').getByTestId('control-note')).toHaveCount(
    0,
  );
  // the camera takes a focus only on a grid of five
  await control(page, 'focus_automatic_continuous').getByRole('checkbox').click();
  const focus = field(page, 'Fokus');
  await expect(focus).toBeEnabled();
  await focus.fill('47');
  await focus.press('Enter');
  await expect(focus).toHaveValue('45');
  await expect.poll(() => pi.camera.get('focus_absolute').value).toBe(45);
});

test('every control is a target for a finger', async ({ page }) => {
  await installFakeCameraPi(page);
  await openSettings(page);
  await control(page, 'auto_exposure').getByRole('combobox').selectOption({ label: 'Manuell' });
  await expect(field(page, 'Belichtungszeit (ms)')).toBeEnabled();
  const targets = [
    card(page).getByRole('button', { name: 'Neu lesen' }),
    field(page, 'Belichtungszeit (ms)'),
    card(page).getByRole('button', { name: 'Belichtungszeit +' }),
    card(page).getByRole('button', { name: 'Belichtungszeit −' }),
    control(page, 'auto_exposure').getByRole('combobox'),
    control(page, 'exposure_dynamic_framerate').locator('label'),
  ];
  for (const target of targets) {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThanOrEqual(48);
  }
});

test('why the camera cannot be read is said in words, with the one command – and "Neu lesen" tries again', async ({
  page,
}) => {
  const pi = await installFakeCameraPi(page);
  pi.failRead = { error: 'no-permission' };
  await openSettings(page);
  const alert = page.getByTestId('camera-controls-error');
  await expect(alert).toHaveAttribute('data-error', 'no-permission');
  await expect(alert).toContainText('sudo usermod -aG video');
  await expect(card(page).getByTestId('camera-group-exposure')).toHaveCount(0);
  pi.failRead = null;
  await card(page).getByRole('button', { name: 'Neu lesen' }).click();
  await expect(alert).toHaveCount(0);
  await expect(card(page).getByTestId('camera-group-exposure')).toBeVisible();
  pi.failRead = { error: 'no-v4l2' };
  await card(page).getByRole('button', { name: 'Neu lesen' }).click();
  await expect(alert).toContainText('apt-get install v4l-utils');
});

test('without a companion there is no card, and no way to take anything over', async ({ page }) => {
  await seedCamera(page, 0);
  await page.goto('/');
  await goTo(page, 'Einstellungen', 'Kamera');
  await expect(page.getByTestId('camera-setup')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await chooseSource(page, 'Gerätekamera');
  const panel = await openScanPanel(page);
  await expect(panel.getByLabel('Belichtung (ms)')).toBeVisible();
  await expect(panel.getByTestId('exposure-take')).toHaveCount(0);
});

test('the quick search leads to the card', async ({ page }) => {
  await installFakeCameraPi(page);
  await page.goto('/');
  await goTo(page, 'Einstellungen', 'Kamera');
  await expect(card(page)).toBeVisible();
  await goTo(page, 'Start');
  await page.keyboard.press('Control+k');
  await page.getByTestId('find-input').fill('belichtung');
  const top = page.getByTestId('find-list').getByRole('option').first();
  await expect(top).toContainText('Belichtung und Bild');
  await expect(top).toContainText('Kamera');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('find')).toBeHidden();
  await expect(page.locator('[data-find~="camera-controls"]')).toHaveClass(/found/);
  await expect(page.locator('[data-find~="camera-controls"]')).toBeInViewport();
});

test('the scan panel takes the exposure from the camera – on the tap, only a fixed one, only the companion’s camera', async ({
  page,
}) => {
  await seedCamera(page, 0);
  const pi = await installFakeCameraPi(page);
  await page.goto('/');
  // this device shows its own camera first
  await goTo(page, 'Einstellungen', 'Kamera');
  await expect(card(page)).toBeVisible();
  await chooseSource(page, 'Gerätekamera');
  const panel0 = await openScanPanel(page);
  const field = panel0.getByLabel('Belichtung (ms)');
  const take = panel0.getByTestId('exposure-take');
  const line = panel0.getByTestId('exposure-take-line');
  await expect(field).toHaveValue('0');
  await expect(take).toBeVisible();
  expect((await take.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  // the picture is not the companion's camera: the hint, nothing read, nothing filled
  const readsBefore = pi.gets;
  await take.click();
  await expect(line).toHaveAttribute('data-kind', 'not-pi');
  await expect(line).toContainText('Das Bild kommt nicht aus dem Stream des Companion');
  await expect(field).toHaveValue('0');
  expect(pi.gets).toBe(readsBefore);

  // the companion's stream is this device's picture
  await chooseSource(page, 'Companion-Stream');
  const panel = await openScanPanel(page);

  // the camera is on automatic: a hint – nothing is filled
  await panel.getByTestId('exposure-take').click();
  await expect(line).toHaveAttribute('data-kind', 'auto');
  await expect(line).toContainText('Die Kamera belichtet automatisch');
  await expect(field).toHaveValue('0');

  // manual, 12.3 ms at the camera: the tap reads it now and fills the field – with the line that says so
  pi.camera.get('auto_exposure').value = 1;
  pi.camera.get('exposure_time_absolute').value = 123;
  const before = pi.gets;
  await panel.getByTestId('exposure-take').click();
  expect(pi.gets).toBe(before + 1);
  await expect(field).toHaveValue('12.3');
  await expect(line).toHaveAttribute('data-kind', 'ms');
  await expect(line).toContainText('Jetzt aus der Kamera gelesen und eingetragen: 12,3 ms.');
  // the blur it means at this speed is told as with a typed value
  await expect(panel.getByTestId('blur-line')).toBeVisible();
  const kept = await page.evaluate(() => localStorage.getItem('lowrider-control.scan'));
  expect(JSON.parse(kept!)).toMatchObject({ mode: 'strips', exposureMs: 12.3 });

  // what the camera does later is not taken by itself – only on the next tap
  pi.camera.get('exposure_time_absolute').value = 50;
  await expect(field).toHaveValue('12.3');
  await panel.getByTestId('exposure-take').click();
  await expect(field).toHaveValue('5');
  expect(pi.gets).toBe(before + 2);

  // a camera that cannot be read: the reason, nothing changed
  pi.failRead = { error: 'timeout' };
  await panel.getByTestId('exposure-take').click();
  await expect(line).toHaveAttribute('data-kind', 'failed');
  await expect(line).toContainText('Die Kamera hat nicht rechtzeitig geantwortet.');
  await expect(field).toHaveValue('5');
});
