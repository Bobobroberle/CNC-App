// Prüft die App-Seite des Zuschauer-Modus (B2): ist "Fräsen starten" gesperrt, was passiert beim Jog, geht PAUSE?
// Start: <repo>/apps/control/node_modules/.bin/playwright test -c <dieses Verzeichnis>/viewer.config.ts
import { test, expect } from '/home/user/CNC-App/apps/control/node_modules/@playwright/test';
import { installFakeFluidNC, openApp, connect, goTo, pressAndHold } from '/home/user/CNC-App/apps/control/e2e/helpers';

const sent = (page: any) => page.evaluate(() => (window as any).__sent as string[]);
const JOB = ['G90 G21', 'S18000 M3', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-2 F300', 'G1 X60 F900', 'G0 Z5', 'M5', 'M30'].join('\n');

test('als Zuschauer: Start, Jog und PAUSE', async ({ page }) => {
  test.setTimeout(90_000);
  await installFakeFluidNC(page);
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles({ name: 'schild.nc', mimeType: 'text/plain', buffer: Buffer.from(JOB) });
  await expect(page.getByTestId('job-loaded')).toContainText('schild.nc');
  await page.evaluate(() => {
    (window as any).__status = '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
  });
  await connect(page);
  await page.evaluate(() => {
    (window as any).__socket.onmessage({ data: 'ROLE:viewer' }); // Textrahmen, wie ihn das Relais sendet
  });
  await page.waitForTimeout(500);
  await goTo(page, 'Fräsen');
  const start = page.getByTestId('primary-action').locator('button.hold');
  console.log('START: Knopf vorhanden:', await start.count(), '| disabled:', await start.first().isDisabled().catch(() => 'n/a'));
  await pressAndHold(page, start, 1300).catch((e) => console.log('START: Halten nicht möglich:', String(e).split('\n')[0]));
  await page.waitForTimeout(800);
  const afterStart = await sent(page);
  const sd = await page.evaluate(() => (window as any).__sd);
  console.log('START: gesendet =', JSON.stringify(afterStart.filter((l: string) => l !== '?')), '| hochgeladen (SD) =', JSON.stringify(sd));
  // PAUSE
  await page.evaluate(() => { (window as any).__status = '<Run|MPos:610.000,1210.000,-12.000|FS:900,18000>'; });
  await page.waitForTimeout(400);
  await page.getByTestId('pause').click();
  await page.waitForTimeout(300);
  console.log('PAUSE: ! gesendet =', (await sent(page)).includes('!'));
  console.log('Meldungen/Toasts:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role=status], [data-testid*=toast]')].map((e) => (e as HTMLElement).innerText).filter(Boolean))));
  const body = await page.evaluate(() => document.body.innerText);
  console.log('Seite sagt "Nur Ansicht"?', /Nur Ansicht/.test(body), '| "Halt nicht gesendet"?', /Halt nicht gesendet/.test(body));
});
