import { test, expect } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/node_modules/@playwright/test';
import { installFakeFluidNC, connect, goTo } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/e2e/helpers';

const sent = (page: any) => page.evaluate(() => (window as any).__sent as string[]);

test('Leertaste im Eingabefeld waehrend Run: kein Feed-Hold (Befund 2d)', async ({ page }) => {
  await installFakeFluidNC(page);
  await page.goto('/');
  await connect(page);
  await page.evaluate(() => { (window as any).__status = '<Run|MPos:10.000,0.000,0.000|FS:800,0|WCO:0.000,0.000,0.000>'; });
  await expect(page.getByTestId('machine-state')).toContainText('Läuft');
  // Quick-Suche (Strg+K): ein Eingabefeld hat den Fokus
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(200);
  console.log('Fokus liegt auf:', await page.evaluate(() => document.activeElement?.tagName));
  await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  const holdsInField = (await sent(page)).filter((l) => l === '!').length;
  console.log('Feed-Holds nach Leertaste im Suchfeld waehrend Run:', holdsInField);
  expect(holdsInField).toBe(0);
  await page.keyboard.press('Escape');
  // Gegenprobe: Fokus auf dem Body -> Leertaste haelt an
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press(' ');
  await expect.poll(async () => (await sent(page)).filter((l) => l === '!').length).toBe(1);
});

test('PAUSE und NOT-HALT sind in jedem Layout sichtbar und tippbar', async ({ page }, info) => {
  await installFakeFluidNC(page);
  await page.goto('/');
  const pause = page.getByTestId('pause');
  const estop = page.getByRole('button', { name: 'NOT-HALT' });
  await expect(pause).toBeInViewport({ ratio: 1 });
  await expect(estop).toBeInViewport({ ratio: 1 });
  await expect(pause).toBeEnabled();
  await expect(estop).toBeEnabled();
  const hit = async (loc: any) => loc.evaluate((el: Element) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); });
  expect(await hit(pause)).toBe(true);
  expect(await hit(estop)).toBe(true);
  if (info.project.name === 'desktop') {
    await connect(page);
    await pause.click();
    await estop.click();
    await expect.poll(() => sent(page)).toEqual(expect.arrayContaining(['!', '\u0018']));
  } else {
    // Phone: es gibt dort keine Verbindungsseite (kein Menue); nur Sichtbarkeit/Erreichbarkeit pruefen.
    console.log('phone: menu-button vorhanden?', await page.getByTestId('menu-button').count());
  }
  console.log(info.project.name, 'viewport', JSON.stringify(page.viewportSize()), 'pause/estop ok');
});

test('Leertaste nach Bedienung des Vorschub-Schiebereglers (Fokus bleibt im <input type=range>) waehrend Run', async ({ page }) => {
  await installFakeFluidNC(page);
  await page.goto('/');
  await connect(page);
  await goTo(page, 'Fräsen');
  await page.evaluate(() => { (window as any).__status = '<Run|MPos:10.000,0.000,0.000|FS:800,0|WCO:0.000,0.000,0.000>'; });
  await expect(page.getByTestId('machine-state')).toContainText('Läuft');
  const slider = page.locator('[data-testid="override-feed"] input[type=range]').first();
  await expect(slider).toBeVisible();
  await slider.click();
  console.log('Fokus liegt auf:', await page.evaluate(() => `${document.activeElement?.tagName}.${(document.activeElement as HTMLInputElement)?.type}`));
  const before = (await sent(page)).filter((l) => l === '!').length;
  await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  const after = (await sent(page)).filter((l) => l === '!').length;
  console.log('Feed-Holds durch Leertaste bei Fokus im Schieberegler:', after - before);
  expect(after - before).toBe(0);
});
