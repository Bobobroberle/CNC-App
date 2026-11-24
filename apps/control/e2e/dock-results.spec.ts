import { expect, test } from '@playwright/test';
import { connect, goTo, hold, inReach, installFakeFluidNC, openApp } from './helpers';

// What a docked action leaves behind lies in its card's flow, below the dock that sticks to the
// panel's bottom: it is brought into view when it shows (`Result`). The scroll must not move
// anything else – `scrollIntoView` also scrolls ancestors that clip.

test('the result of a docked probe is in reach, and nothing of the shell has moved', async ({
  page,
}) => {
  // The machine's own screen, the sheet at its tallest rest: the card is longer than the panel there
  await page.setViewportSize({ width: 800, height: 600 });
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await goTo(page, 'Einrichten', 'Antasten');
  const larger = page.locator('[data-slot="sheet-larger"]');
  if ((await larger.count()) > 0) await larger.click();
  const panel = page.locator('.panel-body');
  await page
    .getByTestId('probe-card')
    .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));

  const shell = async () => ({
    pause: await page.getByRole('button', { name: 'PAUSE' }).boundingBox(),
    estop: await page.getByRole('button', { name: 'NOT-HALT' }).boundingBox(),
    sheet: await page
      .locator('[data-slot="sheet-larger"], [data-slot="sheet-smaller"]')
      .first()
      .boundingBox(),
    bar: await page.getByTestId('jog-toggle').boundingBox(),
  });
  const before = await shell();

  await hold(page, /Antasten starten/);
  const warning = page.getByText('Platte und Klemme entfernen');
  await expect(warning).toBeVisible();
  // the warning is where the thumb is: inside the panel's visible area, and nothing covers it
  // (the dock, which sticks to the bottom, must not lie over it)
  const r = await inReach(page, warning, panel);
  expect(r.inside, JSON.stringify(r)).toBe(true);
  expect(r.reached, JSON.stringify(r)).toBe(true);
  // PAUSE, NOT-HALT, the handle of the sheet and the action bar stayed where they were
  expect(await shell()).toEqual(before);
});
