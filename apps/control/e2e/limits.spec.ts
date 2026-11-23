import { expect, test, type Page } from '@playwright/test';
import { goTo, pressAndHold } from './helpers';

// FluidNC's limits in the app (stage 14), on the simulator: read from the machine, apart
// from the app's jog speed, written by a hold, read back, kept in config.yaml with a backup.

async function simulatorMachine(page: Page) {
  await page.goto('/');
  await goTo(page, 'Einstellungen', 'Verbindung');
  await page.getByRole('button', { name: 'Simulator starten' }).click();
  await expect(page.getByTestId('machine-state')).toContainText('Bereit');
  await goTo(page, 'Einstellungen', 'Maschine');
  await page.getByRole('button', { name: 'Maschinenprofil' }).click();
}

const field = (page: Page, name: string) =>
  page.getByTestId('machine-limits').getByLabel(name, { exact: false });

test('the limits of the controller: read, checked, written by a hold, read back and kept', async ({
  page,
}) => {
  await simulatorMachine(page);
  const card = page.getByTestId('machine-limits');
  // Read when asked (opening the card sends nothing): the simulated stock config.
  await expect(card).toContainText('Noch nicht von der Steuerung gelesen.');
  await card.getByRole('button', { name: /^Von der Steuerung lesen/ }).click();
  await expect(field(page, 'Z Höchstgeschwindigkeit')).toHaveValue('1200');
  await expect(field(page, 'X Beschleunigung')).toHaveValue('200');
  const write = card.getByRole('button', { name: /In die Steuerung schreiben/ });
  await expect(write).toBeDisabled();
  await expect(write).toHaveAttribute('aria-description', 'Es ist nichts geändert.');

  // Out of range: refused with the reason.
  await field(page, 'Z Höchstgeschwindigkeit').fill('25000');
  await expect(card.getByTestId('limits-problems')).toContainText(
    'Z Höchstgeschwindigkeit: höchstens 20.000.',
  );
  await expect(write).toBeDisabled();
  // A big raise: allowed, with the warning and the recommended step.
  await field(page, 'Z Höchstgeschwindigkeit').fill('4000');
  const raised = card.getByTestId('limits-raised');
  await expect(raised).toContainText('Schritte verlieren');
  await expect(raised).toContainText('+233 % auf einmal');
  await expect(raised).toContainText('1.200 → 1.440');
  // The small step instead.
  await field(page, 'Z Höchstgeschwindigkeit').fill('1440');
  await expect(raised).not.toContainText('+233 %');
  await expect(card.getByRole('checkbox', { name: /config.yaml speichern/ })).toBeChecked();
  await pressAndHold(page, write);
  const result = card.getByTestId('limits-result');
  await expect(result).toHaveAttribute('data-saved', 'saved');
  await expect(result).toContainText(
    'Z Höchstgeschwindigkeit: 1.200 → 1.440 – FluidNC meldet 1.440',
  );
  await expect(result).toContainText('Sicherung: config.yaml.bak');
  await expect(page.getByTestId('toasts')).toContainText('in der config.yaml gespeichert');
  const [file, backup] = await page.evaluate(() => {
    const sim = (window as unknown as { lowriderSimulator: { localFiles: Map<string, string> } })
      .lowriderSimulator;
    return [sim.localFiles.get('config.yaml')!, sim.localFiles.get('config.yaml.bak')!] as const;
  });
  expect(file).toContain('max_rate_mm_per_min: 1440');
  expect(file.startsWith('# V1E LowRider v4')).toBe(true);
  expect(backup).toContain('max_rate_mm_per_min: 1200.000');
});

test('the app’s jog speed says it is capped by the controller’s limit', async ({ page }) => {
  await simulatorMachine(page);
  await page
    .getByTestId('machine-limits')
    .getByRole('button', { name: /^Von der Steuerung lesen/ })
    .click();
  await expect(field(page, 'Z Höchstgeschwindigkeit')).toHaveValue('1200');
  const editor = page.locator('.profile-editor');
  await editor.locator('[data-find="jog-feed"]').getByLabel('Z (mm/min)').fill('4000');
  await editor.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(page.getByTestId('jog-effective')).toContainText(
    'Z: 4.000 eingestellt, fährt max. 1.200 mm/min',
  );
  // The simulated machine honours its limit as FluidNC's planner does.
  await page.evaluate(() => {
    (
      window as unknown as { lowriderSimulator: { line(l: string): string[] } }
    ).lowriderSimulator.line('$J=G91 G21 Z-20 F4000');
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { lowriderSimulator: { status(): string } }
        ).lowriderSimulator.status(),
      ),
    )
    .toContain('|FS:1200,');
});
