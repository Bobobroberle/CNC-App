import { expect, test, type Page } from '@playwright/test';
import { connect, goTo, installFakeFluidNC, moreOptions, openApp, pressAndHold } from './helpers';

// Feedback on every button (DESIGN.md §6.2, stage 14): a visible pressed state on every
// control in both themes, and a result where the effect does not show by itself.

/**
 * Every visible, enabled control on the page whose look does not change when it is
 * pressed. The press is put on as the app does it (`data-press`, lib/press.ts) – no
 * event is sent, so nothing is clicked. NOT-HALT and PAUSE have their own pressed look.
 */
function unpressable(page: Page) {
  return page.evaluate(() => {
    const look = (el: Element) => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.backgroundImage, s.borderColor, s.color, s.outlineStyle].join(
        '|',
      );
    };
    const all = [
      ...document.querySelectorAll<HTMLElement>(
        'button, [role="button"], [role="tab"], [role="checkbox"], a[href]',
      ),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        !el.matches(':disabled, [aria-disabled="true"], .estop, .pause') &&
        getComputedStyle(el).visibility !== 'hidden'
      );
    });
    const flat: string[] = [];
    for (const el of all) {
      const before = look(el);
      el.setAttribute('data-press', '');
      const after = look(el);
      el.removeAttribute('data-press');
      if (before === after)
        flat.push(el.textContent?.trim().slice(0, 40) || el.outerHTML.slice(0, 80));
    }
    return { count: all.length, flat };
  });
}

async function checkScreens(page: Page) {
  const checked: number[] = [];
  const check = async () => {
    const { count, flat } = await unpressable(page);
    expect(flat).toEqual([]);
    checked.push(count);
  };
  await goTo(page, 'Start');
  await check();
  await goTo(page, 'Job');
  await check();
  await goTo(page, 'Fräsen');
  await check();
  await page.getByTestId('jog-toggle').click();
  await check();
  await page.getByTestId('jog-toggle').click();
  await goTo(page, 'Einstellungen', 'Maschine');
  await page.getByRole('button', { name: 'Maschinenprofil' }).click();
  await check();
  await goTo(page, 'Einstellungen', 'Verbindung');
  await check();
  // Many controls were looked at, not a handful.
  expect(checked.reduce((a, b) => a + b, 0)).toBeGreaterThan(80);
}

test('every control shows a press – dark theme', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await checkScreens(page);
});

test('every control shows a press – light theme', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('lowrider-control.theme', JSON.stringify('light')),
  );
  await installFakeFluidNC(page);
  await openApp(page);
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await connect(page);
  await checkScreens(page);
});

test('the press shows at pointerdown, before anything else, and goes at pointerup', async ({
  page,
}) => {
  await openApp(page);
  const step = page.getByTestId('step-tools');
  const box = (await step.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const hover = await step.evaluate((el) => getComputedStyle(el).backgroundImage);
  await page.mouse.down();
  await expect(step).toHaveAttribute('data-press', '');
  // It differs from the hover surface, too.
  expect(await step.evaluate((el) => getComputedStyle(el).backgroundImage)).not.toBe(hover);
  // Slid off and let go: no click, no press left behind.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 200);
  await page.mouse.up();
  await expect(step).not.toHaveAttribute('data-press', '');
});

test('commands to the machine are acknowledged: ok, and the controller’s error with its meaning', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.getByTestId('jog-toggle').click();
  const panel = page.getByTestId('jog-panel');
  await panel.getByRole('button', { name: /^X\+/ }).click();
  const ack = panel.getByTestId('command-ack');
  await expect(ack).toHaveAttribute('data-state', 'ok');
  await expect(ack).toContainText('Steuerung meldet ok:');
  await expect(ack).toContainText('$J=');
  // FluidNC refuses the next jog: said with its code and meaning, on the spot.
  await page.evaluate(() => {
    (window as unknown as { __refuse: Record<string, number> }).__refuse = { '$J=': 15 };
  });
  await panel.getByRole('button', { name: /^X\+/ }).click();
  await expect(ack).toHaveAttribute('data-state', 'error');
  await expect(ack).toContainText('error:15');
  // Unlocking by a hold: the hold itself shows what came of it.
  await page.evaluate(() => {
    (window as unknown as { __refuse: Record<string, number> }).__refuse = {};
  });
  await moreOptions(page, 'jog');
  const unlock = panel.getByRole('button', { name: /^Entsperren/ });
  await pressAndHold(page, unlock);
  await expect(unlock.locator('[data-ack="ok"]')).toBeVisible();
  await expect(ack).toContainText('$X');
});

test('actions without a visible effect say they are done – or not possible', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Einstellungen', 'Maschine');
  await page.getByRole('button', { name: 'Maschinenprofil' }).click();
  const apply = page.locator('.profile-editor').getByRole('button', { name: /^Übernehmen/ });
  await apply.click();
  await expect(apply.locator('[data-ack="ok"]')).toBeVisible();
  await expect(apply.locator('[data-ack="ok"]')).toHaveCount(0, { timeout: 5000 });
  // A value it cannot take: not possible, with the reason beside it.
  await page.locator('.profile-editor').getByLabel('X max').fill('abc');
  await apply.click();
  await expect(apply.locator('[data-ack="failed"]')).toBeVisible();
  await expect(page.locator('.profile-editor')).toContainText('Ungültige Werte');
});
