import { expect, test, type Page } from '@playwright/test';
import { closeJog, connect, goTo, installFakeFluidNC, openApp, openJog, sent } from './helpers';

// The rare functions can be hidden (Einstellungen → Maschine → Funktionen): their cards and
// buttons go, the quick search leads back to the switch – and nothing reaches FluidNC.

const anchor = (page: Page, name: string) => page.locator(`[data-find~="${name}"]`);
const feature = (page: Page, id: 'series' | 'jigs' | 'macros') => page.getByTestId(`feature-${id}`);

async function switches(page: Page) {
  await goTo(page, 'Einstellungen', 'Maschine');
  await expect(page.getByTestId('features-card')).toBeVisible();
}

test('hidden functions: the entry points go, the search leads to the switch, showing brings them back', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  const before = await sent(page);

  // Everything shows to begin with, and the three switches say so
  await switches(page);
  for (const id of ['series', 'jigs', 'macros'] as const) {
    await expect(feature(page, id)).toBeChecked();
  }
  await expect(anchor(page, 'macro-editor')).toHaveCount(1);
  await goTo(page, 'Job');
  await expect(anchor(page, 'jigs')).toHaveCount(1);
  // The jog panel has no button in the drawing workspace: it is looked at from the Job
  await openJog(page);
  await expect(anchor(page, 'macros')).toHaveCount(1);
  await closeJog(page);
  await goTo(page, 'CAM');
  await expect(page.getByTestId('series-entry')).toBeVisible();

  // Hidden: the three go, one by one
  await switches(page);
  await feature(page, 'macros').click();
  await expect(feature(page, 'macros')).not.toBeChecked();
  await expect(anchor(page, 'macro-editor')).toHaveCount(0);
  await feature(page, 'jigs').click();
  await feature(page, 'series').click();
  await goTo(page, 'Job');
  await expect(anchor(page, 'jigs')).toHaveCount(0);
  await openJog(page);
  await expect(page.getByTestId('jog-panel')).toBeVisible();
  await expect(anchor(page, 'macros')).toHaveCount(0);
  await closeJog(page);
  await goTo(page, 'CAM');
  await expect(page.getByTestId('cam-card')).toBeVisible();
  await expect(page.getByTestId('series-entry')).toHaveCount(0);

  // The search still knows the functions and says where they went: to the switch
  await page.keyboard.press('Control+k');
  await page.getByTestId('find-input').fill('serie');
  const top = page.getByTestId('find-list').getByRole('option').first();
  await expect(top).toContainText('ausgeblendet');
  await expect(top).toContainText('Funktionen');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('find')).toBeHidden();
  await expect(anchor(page, 'features')).toHaveClass(/found/);
  await expect(anchor(page, 'features')).toBeInViewport();
  await expect(page.getByTestId('settings-machine')).toBeVisible();

  // Shown again, they are all back
  await feature(page, 'series').click();
  await feature(page, 'jigs').click();
  await feature(page, 'macros').click();
  await expect(anchor(page, 'macro-editor')).toHaveCount(1);
  await goTo(page, 'CAM');
  await expect(page.getByTestId('series-entry')).toBeVisible();
  await goTo(page, 'Job');
  await expect(anchor(page, 'jigs')).toHaveCount(1);

  // Hiding and the search never reached the machine: all that was asked since the connection
  // is the list of the SD card, which the Job card reads by itself whenever it shows
  const asked = (await sent(page)).slice(before.length);
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every((line) => line === '$SD/List')).toBe(true);
});

test('what is hidden stays hidden after a reload: it is a setting', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await switches(page);
  await feature(page, 'series').click();
  await feature(page, 'jigs').click();
  await page.reload();
  await goTo(page, 'CAM');
  await expect(page.getByTestId('cam-card')).toBeVisible();
  await expect(page.getByTestId('series-entry')).toHaveCount(0);
  await goTo(page, 'Job');
  await expect(anchor(page, 'jigs')).toHaveCount(0);
  await switches(page);
  await expect(feature(page, 'series')).not.toBeChecked();
  await expect(feature(page, 'jigs')).not.toBeChecked();
  // The macros were not touched
  await expect(feature(page, 'macros')).toBeChecked();
  await expect(anchor(page, 'macro-editor')).toHaveCount(1);
});
