import { expect, test, type Locator, type Page } from '@playwright/test';
import { connect, goTo, installFakeFluidNC, openApp, pressAndHold, sent } from './helpers';

// The usability goal of DESIGN.md §11, measured: a known job from Start to
// "Fräsen starten" in at most 8 interactions, and pause in one.

const JOB = [
  '(Schild)',
  'G90 G21',
  'T1 M6',
  'S18000 M3',
  'G0 Z5',
  'G0 X10 Y10',
  'G1 Z-2 F300',
  'G1 X60 F900',
  'G1 Y40',
  'G0 Z5',
  'M5',
  'M30',
].join('\n');

const status = (page: Page, text: string) =>
  page.evaluate((s) => {
    (window as unknown as { __status: string }).__status = s;
  }, text);

const started = async (page: Page) =>
  (await sent(page)).filter((line) => line.startsWith('$SD/Run=')).length;

test('a known job from Start to "Fräsen starten" takes at most 8 interactions; pause takes one', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installFakeFluidNC(page);
  await openApp(page);

  // Before: the job has been cut once at this machine – that is what makes it a known job.
  await page.getByTestId('file-input').setInputFiles({
    name: 'schild.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from(JOB),
  });
  await expect(page.getByTestId('job-loaded')).toContainText('schild.nc');
  await status(page, '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>');
  await connect(page);
  await goTo(page, 'Fräsen');
  await pressAndHold(page, page.getByTestId('primary-action').locator('button.hold'), 1300);
  await expect.poll(() => started(page)).toBe(1);
  await page.evaluate(() => {
    (window as unknown as { __socket: { emit(l: string): void } }).__socket.emit('ok');
  });
  // Since then something else was cut, somewhere else on the table.
  await goTo(page, 'Job');
  await page.getByTestId('file-input').setInputFiles({
    name: 'leiste.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from('G90 G21\nG0 Z5\nG1 Z-1 F200\nG1 X200 F800\nG0 Z5\n'),
  });
  await expect(page.getByTestId('job-loaded')).toContainText('leiste.nc');
  await status(page, '<Idle|MPos:100.000,300.000,-10.000|FS:0,0|WCO:100.000,300.000,-60.000>');
  await goTo(page, 'Start');
  await expect(page.getByTestId('start-quick')).toBeVisible();

  // From here every tap and every hold of the operator counts.
  let interactions = 0;
  const tap = async (target: Locator) => {
    interactions += 1;
    await target.click();
  };
  const holdDown = async (target: Locator) => {
    interactions += 1;
    await pressAndHold(page, target, 1300);
  };

  // 1 · Start → the jobs used last.
  await tap(page.getByTestId('start-quick').getByRole('button', { name: 'Zuletzt verwendet' }));
  // 2 · The job's card loads it again.
  await tap(page.getByTestId('recent-jobs').getByRole('button', { name: /schild\.nc/ }));
  await expect(page.getByTestId('job-loaded')).toContainText('schild.nc');
  // 3 · ③ Einrichten, 4 · the zero it was cut with comes back with a hold.
  await tap(page.getByTestId('step-setup'));
  await expect(page.getByTestId('zero-history')).toContainText('X 600.00 · Y 1200.00');
  await holdDown(
    page.getByRole('button', { name: /X\/Y wiederherstellen/ }).and(page.locator('.hold')),
  );
  await expect.poll(() => sent(page)).toContain('G10 L2 P0 X600 Y1200');
  await status(page, '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>');
  // 5 · ⑤ Fräsen, 6 · the start – a hold, and nothing asks again.
  await tap(page.getByTestId('step-run'));
  await holdDown(page.getByTestId('primary-action').locator('button.hold'));
  await expect.poll(() => started(page)).toBe(2);
  await expect(page.getByTestId('start-confirm')).toHaveCount(0);

  test.info().annotations.push({ type: 'interactions', description: String(interactions) });
  console.log(`known job, Start → "Fräsen starten": ${interactions} interactions`);
  expect(interactions).toBeLessThanOrEqual(8);
  expect(interactions).toBe(6);

  // Pause: one tap, from wherever one is.
  await status(page, '<Run|MPos:610.000,1210.000,-62.000|FS:900,18000|SD:12.0,/sd/schild.nc>');
  await expect(page.getByTestId('machine-state')).toContainText('Läuft');
  let pause = 0;
  pause += 1;
  await page.getByTestId('pause').click();
  await expect.poll(() => sent(page)).toContain('!');
  console.log(`pause: ${pause} interaction`);
  expect(pause).toBe(1);
});
