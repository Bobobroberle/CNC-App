import { expect, test, type Page } from '@playwright/test';
import { connect, goTo, installFakeFluidNC, openApp, openJog, pressAndHold, sent } from './helpers';

// Connecting (stage 14): the way through the companion is the one obvious way, a failure
// says which device was missing, and the app comes back by itself only while no job runs.

/** A companion that relays FluidNC at 192.168.0.200:81 answers on the app's own origin. */
async function companion(page: Page) {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        ok: true,
        version: '1.4.0',
        fluidnc: { url: 'ws://192.168.0.200:81', connected: false, clients: 0, lastFailure: null },
        sensors: 'none',
        camera: null,
      },
    }),
  );
}

/** How the next sockets behave (see `installFakeFluidNC`). */
const script = (page: Page, steps: string[]) =>
  page.evaluate((s) => {
    (window as unknown as { __script: string[] }).__script = s;
  }, steps);

const sockets = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sockets?: number }).__sockets ?? 0);

test('through the Pi: one button connects, a Jackpot out of the WLAN is named, and it comes back by itself', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await companion(page);
  await page.goto('/');
  await goTo(page, 'Einstellungen', 'Verbindung');
  const card = page.getByTestId('connection-card');
  await expect(card.getByTestId('link-route')).toContainText('Jackpot (192.168.0.200:81)');
  // One way: the typed address, the simulator and the demo are folded away.
  await expect(card.getByLabel('IP-Adresse des Jackpot')).toBeHidden();
  await expect(card.getByRole('button', { name: 'Simulator starten' })).toBeHidden();

  await script(page, ['relay-down', 'relay-down']);
  await card.getByRole('button', { name: 'Über den Pi verbinden' }).click();
  const state = card.getByTestId('link-status');
  await expect(state).toHaveAttribute('data-failure', 'relay');
  await expect(state).toContainText('Pi erreicht den Jackpot nicht (192.168.0.200:81)');
  await expect(state).toContainText('FluidNC wählt sich nur beim Einschalten ins WLAN ein');
  await expect(state.getByTestId('link-retry')).toContainText(/Neuer Versuch in \d+ s/);
  await expect(page.getByTestId('connection-state')).toHaveAttribute('data-state', 'retrying');
  // The socket that opened and closed at once is no "Verbunden".
  await expect(page.getByTestId('machine-state')).toContainText('Nicht verbunden');
  await page.getByTestId('messages-flag').click();
  const centre = page.getByTestId('message-centre');
  const warning = centre.getByTestId('message').filter({ hasText: 'Pi erreicht den Jackpot' });
  await expect(warning).toHaveCount(1);
  await expect(warning).toContainText('Raspberry Pi läuft');
  await expect(centre.getByTestId('message').filter({ hasText: 'Verbunden mit' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Two failed tries (2 s, then 4 s), then the Jackpot is back: connected without a tap.
  await expect(page.getByRole('button', { name: 'Trennen' })).toBeVisible({ timeout: 15_000 });
  expect(await sockets(page)).toBe(3);
  await expect(page.getByTestId('machine-state')).toContainText('Bereit');
  await expect(page.getByTestId('toasts')).toContainText(
    'Verbunden mit dem Jackpot (192.168.0.200:81)',
  );
});

test('a Pi out of reach is told apart; "Jetzt versuchen" and "Aufhören" – remembered', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await companion(page);
  await page.goto('/');
  await goTo(page, 'Einstellungen', 'Verbindung');
  const card = page.getByTestId('connection-card');
  await script(page, ['refuse', 'refuse', 'refuse', 'refuse']);
  await card.getByRole('button', { name: 'Über den Pi verbinden' }).click();
  const state = card.getByTestId('link-status');
  await expect(state).toHaveAttribute('data-failure', 'pi');
  await expect(state).toContainText('Pi nicht erreichbar');
  await card.getByRole('button', { name: 'Jetzt versuchen' }).click();
  await expect.poll(() => sockets(page)).toBe(2);
  await card.getByRole('button', { name: 'Aufhören' }).click();
  await expect(state).toHaveAttribute('data-phase', 'failed');
  await expect(state).toContainText('versucht es nicht mehr von selbst');
  await expect(card.getByRole('checkbox', { name: /Von selbst neu verbinden/ })).not.toBeChecked();
  await page.waitForTimeout(5000);
  expect(await sockets(page)).toBe(2);
  // Remembered across a reload.
  await page.reload();
  await goTo(page, 'Einstellungen', 'Verbindung');
  await expect(
    page.getByTestId('connection-card').getByRole('checkbox', { name: /Von selbst neu verbinden/ }),
  ).not.toBeChecked();
});

test('direct: a Jackpot that does not answer is named with its address', async ({ page }) => {
  await installFakeFluidNC(page);
  await page.goto('/');
  await goTo(page, 'Einstellungen', 'Verbindung');
  await script(page, ['refuse']);
  await page.getByLabel('IP-Adresse des Jackpot').fill('192.168.0.200');
  await page.getByRole('button', { name: 'Verbinden', exact: true }).click();
  const state = page.getByTestId('link-status');
  await expect(state).toContainText('Jackpot nicht erreichbar (192.168.0.200:81)');
  await expect(state).toHaveAttribute('data-phase', 'waiting');
});

type PageHooks = {
  __status: string;
  __socket: { onmessage(e: { data: string }): void };
  __sd: unknown[];
};

test('a device that only watches: the start is locked, nothing is sent or uploaded, PAUSE still holds', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles({
    name: 'schild.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from('G90 G21\nG0 Z5\nG1 X10 F300\nM30'),
  });
  await expect(page.getByTestId('job-loaded')).toContainText('schild.nc');
  await connect(page);
  // The relay tells a second device its role as a text frame.
  await page.evaluate(() => {
    const w = window as unknown as PageHooks;
    w.__status = '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
    w.__socket.onmessage({ data: 'ROLE:viewer' });
  });
  await goTo(page, 'Fräsen');
  await expect(page.getByTestId('primary-action').locator('button.hold')).toBeDisabled();
  // A jog holds nothing out of the machine either.
  await openJog(page);
  await page.getByRole('button', { name: 'Dauer' }).click();
  const button = page.getByRole('button', { name: /^X\+/ });
  await pressAndHold(page, button, 600).catch(() => undefined);
  expect((await sent(page)).filter((l) => l.startsWith('$J') || l.startsWith('$SD/Run'))).toEqual(
    [],
  );
  expect(await page.evaluate(() => (window as unknown as PageHooks).__sd)).toEqual([]);
  // PAUSE still goes, whoever controls.
  await page.evaluate(() => {
    (window as unknown as PageHooks).__status = '<Run|MPos:610.000,1210.000,-12.000|FS:900,18000>';
  });
  await page.getByTestId('pause').click();
  await expect.poll(() => sent(page)).toContain('!');
});
