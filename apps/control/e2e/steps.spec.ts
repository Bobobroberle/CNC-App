import { expect, test, type Page } from '@playwright/test';
import {
  connect,
  drawShape,
  goTo,
  hold,
  installFakeFluidNC,
  moreOptions,
  openApp,
  sent,
  stageMode,
} from './helpers';

// The five steps of the flow as DESIGN.md §5 asks for them: what each one must
// keep safe (the start, its confirmations, the overrides, a lost connection)
// and what each one offers.

const JOB = [
  '(Schild)',
  'G90 G21',
  '(Kontur)',
  'T1 M6',
  'S18000 M3',
  'G0 Z5',
  'G0 X10 Y10',
  'G1 Z-2 F300',
  'G1 X60 F900',
  'G1 Y40',
  'G0 Z5',
  '(Bohrung)',
  'G0 X30 Y20',
  'G1 Z-3 F200',
  'G0 Z5',
  'M5',
  'M30',
].join('\n');

const SET_ZERO = '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
const NO_ZERO = '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';

const status = (page: Page, text: string) =>
  page.evaluate((s) => {
    (window as unknown as { __status: string }).__status = s;
  }, text);

async function loadJob(page: Page, name = 'schild.nc', text = JOB) {
  await page.getByTestId('file-input').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.getByTestId('job-loaded')).toContainText(name);
}

/** A machine that is connected, with a job loaded and a zero set (or not). */
async function ready(page: Page, zero = SET_ZERO) {
  await installFakeFluidNC(page);
  await openApp(page);
  await status(page, zero);
  await loadJob(page);
  await connect(page);
}

const started = async (page: Page) =>
  (await sent(page)).filter((line) => line.startsWith('$SD/Run=')).length;

const startButton = (page: Page) => page.getByTestId('primary-action').locator('button');

test('⑤ the start is the one action bottom right, a hold – never a stray tap', async ({ page }) => {
  await ready(page);
  await goTo(page, 'Fräsen');
  await expect(page.getByTestId('run-ready')).toBeVisible();
  const start = startButton(page);
  await expect(start).toContainText('Fräsen starten');
  // It sits at the right end of the action bar.
  const [bar, box] = [
    (await page.locator('.actionbar').boundingBox())!,
    (await page.getByTestId('primary-action').boundingBox())!,
  ];
  expect(box.x + box.width).toBeGreaterThan(bar.x + bar.width - 24);

  // A tap, a double tap and a hold let go too early start nothing.
  await start.click();
  await start.dblclick();
  await start.hover();
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(900);
  expect(await started(page)).toBe(0);
  // Neither does a hold that slides off the button.
  await start.hover();
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.move(200, 200);
  await page.waitForTimeout(1200);
  await page.mouse.up();
  expect(await started(page)).toBe(0);
  // There is no key for it either.
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('F5').catch(() => undefined);

  // The full hold starts it: onto the card, checked, run from there.
  await hold(page, /Fräsen starten/, 1300);
  await expect.poll(() => sent(page)).toContain('$SD/Run=/schild.nc');
  expect(await started(page)).toBe(1);
});

test('⑤ the start is blocked while something blocks, and says what', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await loadJob(page);
  // Not connected: no start at all – the way leads to what is missing.
  await goTo(page, 'Fräsen');
  await expect(page.getByTestId('run-blocked')).toContainText('Keine Verbindung zur Maschine');
  await expect(page.getByTestId('primary-action')).toHaveText('Prüfen');
  await expect(page.getByTestId('step-run')).toContainText('blockiert');
  await expect(page.locator('.actionbar .hold')).toHaveCount(0);

  // Connected but not idle (an alarm): the hold is there, locked, and a tap says why.
  await status(page, '<Alarm|MPos:0.000,0.000,0.000|FS:0,0|WCO:5.000,5.000,-5.000>');
  await connect(page);
  await goTo(page, 'Fräsen');
  await expect(page.getByTestId('primary-action')).toHaveText('Prüfen');
  await expect(page.getByTestId('run-blocked')).toContainText('nicht bereit');
  expect(await started(page)).toBe(0);

  // A program with an error in it stays locked too.
  await status(page, SET_ZERO);
  await goTo(page, 'Job');
  await loadJob(page, 'kaputt.nc', 'G90 G21\nG1 X10 F100\nG2 X20 Y0\n');
  await goTo(page, 'Fräsen');
  await expect(page.getByTestId('run-blocked')).toContainText('Fehler im G-Code');
  await expect(page.locator('.actionbar .hold')).toHaveCount(0);
});

test('⑤ a start without a zero is confirmed first – once per job (§6.4)', async ({ page }) => {
  // Without an offset the work zero is the machine's own: a job that stays inside the travel.
  await installFakeFluidNC(page);
  await openApp(page);
  await status(page, NO_ZERO);
  await loadJob(page, 'schild.nc', JOB.replaceAll('Z5', 'Z2').replaceAll('X10 Y10', 'X610 Y1210'));
  await connect(page);
  await goTo(page, 'Fräsen');
  await hold(page, /Fräsen starten/, 1300);
  // The hold asks instead of starting.
  const confirm = page.getByTestId('start-confirm');
  await expect(confirm).toContainText('Kein Nullpunkt gesetzt');
  expect(await started(page)).toBe(0);
  // PAUSE and NOT-HALT stay above the question.
  await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PAUSE' })).toBeVisible();
  // Back: nothing started. A tap on "Trotzdem starten" starts nothing either – it is a hold.
  await confirm.getByRole('button', { name: 'Zurück, nicht starten' }).click();
  await expect(confirm).toHaveCount(0);
  await hold(page, /Fräsen starten/, 1300);
  await page
    .getByTestId('start-confirm')
    .getByRole('button', { name: /Trotzdem starten/ })
    .click();
  await page.waitForTimeout(300);
  expect(await started(page)).toBe(0);
  await hold(page, /Trotzdem starten/, 1300);
  await expect.poll(() => started(page)).toBe(1);
  await expect(page.getByTestId('start-confirm')).toHaveCount(0);

  // The job ends; the same job once more is not asked about again.
  await page.evaluate(() => {
    (window as unknown as { __socket: { emit(l: string): void } }).__socket.emit('ok');
  });
  await expect(page.getByTestId('run-summary')).toContainText('Job fertig');
  await expect(page.getByTestId('primary-action')).toHaveText('Nächstes Teil: gleicher Job');
  // "Nächstes Teil" starts nothing by itself: it brings the start back.
  await page.getByTestId('primary-action').click();
  await page.waitForTimeout(300);
  expect(await started(page)).toBe(1);
  await hold(page, /Fräsen starten/, 1300);
  await expect.poll(() => started(page)).toBe(2);
});

test('⑤ a tool marked as a probe locks the spindle start, visibly, every time (§6.4)', async ({
  page,
}) => {
  await ready(page);
  // Mark the job's tool as a probe in the tool list.
  await goTo(page, 'Werkzeuge');
  const row = page.getByTestId('tool-row').first();
  await row.getByRole('combobox').selectOption({ index: 0 });
  await goTo(page, 'Werkzeugliste');
  await page.getByTestId('tool-library').getByRole('button', { name: 'Ändern' }).first().click();
  await page.getByTestId('tool-probe').getByRole('checkbox').check();
  await page.getByTestId('tool-library').getByRole('button', { name: 'Speichern' }).click();

  await goTo(page, 'Werkzeuge');
  await expect(row.locator('[data-issue="probe"]')).toContainText('Spindelstart gesperrt');
  await expect(row.getByTestId('tool-state')).toHaveText('prüfen');
  await goTo(page, 'Fräsen');
  await expect(page.getByTestId('probe-lock')).toContainText('Spindelstart gesperrt');

  for (const run of [1, 2]) {
    await hold(page, /Fräsen starten/, 1300);
    await expect(page.getByTestId('start-confirm')).toContainText('Messtaster als Werkzeug');
    expect(await started(page)).toBe(run - 1);
    await hold(page, /Trotzdem starten/, 1300);
    await expect.poll(() => started(page)).toBe(run);
    await page.evaluate(() => {
      (window as unknown as { __socket: { emit(l: string): void } }).__socket.emit('ok');
    });
    await expect(page.getByTestId('run-summary')).toBeVisible();
    await page.getByTestId('primary-action').click();
  }
});

test('⑤ while it runs: figures from two metres, overrides 50–150 %, pause, abort with a question', async ({
  page,
}) => {
  // Many steps under the 3D picture: about 18 s alone on the tablet project (software GL at its
  // pixel ratio), and past the default 30 s when the other worker runs a simulator job.
  test.setTimeout(90_000);
  await ready(page);
  await goTo(page, 'Fräsen');
  await hold(page, /Fräsen starten/, 1300);
  await expect.poll(() => started(page)).toBe(1);
  await status(
    page,
    '<Run|MPos:610.000,1210.000,-62.000|FS:900,18000|Ov:100,100,100|SD:42.0,/sd/schild.nc>',
  );
  const running = page.getByTestId('running-job');
  await expect(page.getByTestId('run-percent')).toHaveText('42 %');
  // 48–72 px (DESIGN.md §7).
  const size = (testId: string) =>
    page.getByTestId(testId).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await size('run-percent')).toBeGreaterThanOrEqual(48);
  expect(await size('run-percent')).toBeLessThanOrEqual(72);
  expect(await size('run-remaining')).toBeGreaterThanOrEqual(48);
  await expect(page.getByTestId('run-operation')).toBeVisible();

  // Feed: +10 and −10 are one realtime byte each, "100 %" is the reset.
  const feed = page.getByTestId('override-feed');
  await feed.getByRole('button', { name: 'Vorschub 10 % mehr' }).click();
  await expect.poll(() => sent(page)).toContain('0x91');
  await status(
    page,
    '<Run|MPos:610.000,1210.000,-62.000|FS:900,18000|Ov:110,100,100|SD:43.0,/sd/schild.nc>',
  );
  await expect(page.getByTestId('override-feed-value')).toHaveText('110 %');
  await feed.getByRole('button', { name: 'Vorschub zurück auf 100 %' }).click();
  await expect.poll(() => sent(page)).toContain('0x90');
  // Spindle likewise.
  const spindle = page.getByTestId('override-spindle');
  await spindle.getByRole('button', { name: 'Spindel 10 % weniger' }).click();
  await expect.poll(() => sent(page)).toContain('0x9b');
  // At the ends of the range the buttons stop: never below 50 %, never above 150 %.
  await status(
    page,
    '<Run|MPos:610.000,1210.000,-62.000|FS:900,18000|Ov:150,100,50|SD:44.0,/sd/schild.nc>',
  );
  await expect(feed.getByRole('button', { name: 'Vorschub 10 % mehr' })).toBeDisabled();
  await expect(spindle.getByRole('button', { name: 'Spindel 10 % weniger' })).toBeDisabled();
  await expect(feed.getByRole('slider')).toHaveAttribute('max', '150');
  await expect(feed.getByRole('slider')).toHaveAttribute('min', '50');
  // A value just below the top goes to the top, not past it.
  await status(
    page,
    '<Run|MPos:610.000,1210.000,-62.000|FS:900,18000|Ov:145,100,100|SD:45.0,/sd/schild.nc>',
  );
  await expect(page.getByTestId('override-feed-value')).toHaveText('145 %');
  const before = (await sent(page)).length;
  await feed.getByRole('button', { name: 'Vorschub 10 % mehr' }).click();
  await page.waitForTimeout(200);
  expect((await sent(page)).slice(before)).toEqual(['0x93', '0x93', '0x93', '0x93', '0x93']);

  // The action bar pauses with one tap; going on is a hold.
  await page.getByTestId('primary-action').click();
  await expect.poll(() => sent(page)).toContain('!');
  await status(
    page,
    '<Hold:0|MPos:610.000,1210.000,-62.000|FS:0,0|Ov:100,100,100|SD:45.0,/sd/schild.nc>',
  );
  await expect(page.getByTestId('run-held')).toBeVisible();
  await startButton(page).click();
  await page.waitForTimeout(300);
  expect(await sent(page)).not.toContain('~');
  await hold(page, /Fräsen fortsetzen/, 800);
  await expect.poll(() => sent(page)).toContain('~');

  // Abort asks first; "weiterlaufen lassen" stops nothing.
  await page.getByTestId('abort-action').click();
  const dialog = page.getByTestId('abort-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Job weiterlaufen lassen' }).click();
  expect(await sent(page)).not.toContain('\u0018');
  await page.getByTestId('abort-action').click();
  await dialog.getByRole('button', { name: 'Job abbrechen' }).click();
  await expect.poll(() => sent(page)).toContain('\u0018');
  await expect(running).toBeVisible();
});

test('⑤ a connection lost during a job is a critical message – and nothing reconnects by itself', async ({
  page,
}) => {
  await ready(page);
  await goTo(page, 'Fräsen');
  await hold(page, /Fräsen starten/, 1300);
  await expect.poll(() => started(page)).toBe(1);
  await status(page, '<Run|MPos:610.000,1210.000,-62.000|FS:900,18000|SD:42.0,/sd/schild.nc>');
  await expect(page.getByTestId('running-job')).toBeVisible();
  // Count the sockets the app opens from now on.
  await page.evaluate(() => {
    const w = window as unknown as { WebSocket: new (url: string) => unknown; __opened: number };
    const Fake = w.WebSocket;
    w.__opened = 0;
    w.WebSocket = class extends (Fake as new (url: string) => object) {
      constructor(url: string) {
        super(url);
        w.__opened += 1;
      }
    } as never;
    (window as unknown as { __socket: { close(): void } }).__socket.close();
  });
  const critical = page.getByTestId('critical');
  await expect(critical).toContainText('Verbindung während des Jobs verloren');
  await expect(critical).toContainText('schild.nc');
  await expect(critical).toContainText('fräst von ihrer SD-Karte weiter');
  await expect(critical).toContainText('Not-Aus an der Maschine');
  // It covers the work area; the status bar with NOT-HALT stays above it.
  const [box, main] = [
    (await critical.boundingBox())!,
    (await page.locator('.main').boundingBox())!,
  ];
  expect(box.width).toBeGreaterThan(main.width * 0.9);
  await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeVisible();
  await expect(page.getByTestId('machine-state')).toContainText('Nicht verbunden');
  // It stays until it is acknowledged, and the app does not reconnect meanwhile.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await expect(critical).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __opened: number }).__opened)).toBe(0);
  await critical.getByRole('button', { name: 'Quittieren und zur Verbindung' }).click();
  await expect(critical).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verbinden', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __opened: number }).__opened)).toBe(0);
});

test('① job cards: several files at once, recently used with the zero, the empty state', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  // Empty: a place to drop files, one sentence, and the one action bottom right.
  await expect(page.getByTestId('drop-zone')).toContainText('G-Code-Dateien hierher ziehen');
  await expect(page.getByTestId('primary-action')).toHaveText('G-Code öffnen');
  await expect(page.getByTestId('file-input')).toHaveAttribute('multiple', '');

  // Two files at once: the first is loaded, both are remembered.
  await page.getByTestId('file-input').setInputFiles([
    { name: 'schild.nc', mimeType: 'text/plain', buffer: Buffer.from(JOB) },
    {
      name: 'leiste.nc',
      mimeType: 'text/plain',
      buffer: Buffer.from('G90 G21\nG0 Z5\nG1 Z-1 F200\nG1 X200 F800\nG0 Z5\n'),
    },
  ]);
  const loaded = page.getByTestId('job-loaded');
  await expect(loaded).toContainText('schild.nc');
  await expect(loaded).toContainText('50 × 30 mm, 3,0 mm tief');
  await expect(loaded.getByTestId('job-preview').locator('path')).toHaveAttribute('d', /^M/);
  const recent = page.getByTestId('recent-jobs');
  await expect(recent).toContainText('leiste.nc');
  await expect(recent).toContainText('Noch nicht gefräst');
  await expect(page.getByTestId('primary-action')).toHaveText('Weiter: Einrichten');
  // The workpiece is set here: material and size.
  await expect(page.getByTestId('setup-material')).toContainText('Woraus wird gefräst?');

  // Cut it once: its card remembers the zero it was cut with.
  await status(page, SET_ZERO);
  await connect(page);
  await goTo(page, 'Fräsen');
  await hold(page, /Fräsen starten/, 1300);
  await expect.poll(() => started(page)).toBe(1);
  await page.evaluate(() => {
    (window as unknown as { __socket: { emit(l: string): void } }).__socket.emit('ok');
  });
  await goTo(page, 'Job');
  await recent.getByRole('button', { name: /leiste\.nc/ }).click();
  await expect(loaded).toContainText('leiste.nc');
  await expect(recent).toContainText('schild.nc');
  await expect(recent).toContainText('Nullpunkt zuletzt: G54 X 600.0 · Y 1200.0');
  // … and step ③ has it in the job's zero history, back with a hold (X/Y only).
  await recent.getByRole('button', { name: /schild\.nc/ }).click();
  await goTo(page, 'Einrichten', 'Nullpunkt');
  const history = page.getByTestId('zero-history');
  await expect(history).toContainText('G54 · X 600.00 · Y 1200.00');
  await hold(page, /X\/Y wiederherstellen/);
  await expect.poll(() => sent(page)).toContain('G10 L2 P0 X600 Y1200');
});

test('② the tools of the job: state, an alternative with one tap, length in the row', async ({
  page,
}) => {
  await ready(page);
  await goTo(page, 'Werkzeuge');
  const row = page.getByTestId('tool-row').first();
  await expect(row).toContainText('T1');
  await expect(row).toContainText('fräst 3,0 mm tief');
  await expect(row.locator('svg.tool-kind')).toBeVisible();
  // No sensor set up: "Länge messen" is locked and says why on a tap.
  const measure = row.getByRole('button', { name: 'Länge messen' });
  await expect(measure).toBeDisabled();
  await row.locator('[data-slot="reason"]').first().click();
  await expect(row.getByRole('tooltip').first()).toContainText('Kein Werkzeuglängensensor');

  // A tool that is not the list's own shows ⚠ and what would do, one tap away.
  if ((await row.getAttribute('data-state')) !== 'ok') {
    await row.getByTestId('tool-alternatives').getByRole('button').first().click();
  }
  await expect(row).toHaveAttribute('data-state', 'ok');
  await expect(row.getByTestId('tool-state')).toHaveText('passt');
  // (The tools are part of the check on Fräsen now: their state shows in the row, and in the
  // readiness list there – not as a step of their own.)
});

test('③ a tap only shows the target; the probing tiles measure, then take over or discard', async ({
  page,
}) => {
  await ready(page);
  await goTo(page, 'Einrichten', 'Nullpunkt');
  const flow = page.getByTestId('zero-flow');
  await expect(page.getByTestId('zero-now')).toContainText('Nullpunkt G54: X 600.00');
  // Step 1: tapping the picture shows a target and moves nothing.
  const before = (await sent(page)).length;
  await flow.getByRole('button', { name: 'Ziel antippen' }).click();
  const box = (await page.getByTestId('stage-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await expect(page.getByTestId('zero-target')).toBeVisible();
  await page.waitForTimeout(300);
  const moved = (await sent(page)).slice(before).filter((l) => /G0|G1|\$J/.test(l));
  expect(moved).toEqual([]);
  // The target can be corrected by numbers.
  await flow.getByLabel('Ziel X (mm)').fill('12,5');
  await flow.getByLabel('Ziel Y (mm)').fill('7');
  // Step 2: the hold drives there.
  await hold(page, /Fräser hinfahren/);
  // (not homed: a relative move from where the cutter stands, 600/1200)
  await expect.poll(() => sent(page)).toContain('$J=G91 G21 X12.5 Y7 F3000');
  // Step 4: the zero is set where the cutter stands, with a hold.
  await hold(page, /Nullpunkt hier setzen/);
  await expect.poll(() => sent(page)).toContain('G10 L2 P0 X600 Y1200');
  await expect(page.getByTestId('zero-set-done')).toBeVisible();

  // Probing: tiles with a sketch each; an edge is measured, then taken over or discarded.
  await goTo(page, 'Einrichten', 'Antasten');
  const tiles = page.getByTestId('probe-tiles');
  await expect(tiles.locator('.probe-tile')).toHaveCount(6);
  await expect(tiles.locator('.probe-tile svg').first()).toBeVisible();
  await tiles.getByRole('button', { name: /^Kante/ }).click();
  const wizard = page.getByTestId('probe-wizard');
  await wizard.getByRole('button', { name: 'Ohne Platte' }).click();
  const g10 = async () => (await sent(page)).filter((l) => l.startsWith('G10')).length;
  const zeros = await g10();
  await hold(page, /Tastzyklus starten/);
  const result = page.getByTestId('probe-result');
  await expect(result.getByTestId('probe-deviation')).toContainText('gegenüber bisher');
  // Measured only: the zero is still as it was.
  expect(await g10()).toBe(zeros);
  await result.getByRole('button', { name: 'Messung verwerfen' }).click();
  await expect(result.getByTestId('probe-outcome')).toContainText('Verworfen');
  expect(await g10()).toBe(zeros);
  await hold(page, /Tastzyklus starten/);
  await result.getByRole('button', { name: 'Nullpunkt übernehmen' }).click();
  await expect(result.getByTestId('probe-outcome')).toContainText('Nullpunkt übernommen');
  expect(await g10()).toBe(zeros + 1);
});

test('④ checking: 3D with the timeline and its operation marks, the checklist of the guide', async ({
  page,
}) => {
  await ready(page);
  await goTo(page, 'Prüfen');
  // The 3D simulation is the main area of this step.
  await expect(
    page.getByRole('group', { name: 'Ansicht der Bühne' }).getByRole('button', { name: '3D' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const timeline = page.getByTestId('timeline');
  await expect(timeline.getByRole('slider', { name: 'Simulation' })).toBeVisible();
  // The program names two operations: two marks, two buttons that jump there.
  await expect(timeline.locator('.timeline-mark')).toHaveCount(2);
  const operations = timeline.getByTestId('timeline-operation');
  await expect(operations).toHaveText(['1 · Kontur · T1', '2 · Bohrung · T1']);
  await expect(page.getByTestId('sim-time')).toContainText('0:00 /');
  await operations.nth(1).click();
  await expect(page.getByTestId('sim-time')).not.toContainText('0:00 /');
  await expect(operations.nth(1)).toHaveAttribute('aria-pressed', 'true');

  // The checklist: travel, depth, tools, zero, speed and feed – each with its sign.
  const list = page.getByTestId('assistant-checks');
  await expect(list.locator('[data-check="travel"]')).toContainText('Liegt im Verfahrweg');
  await expect(list.locator('[data-check="depth"]')).toContainText('Z-Tiefe plausibel');
  await expect(list.locator('[data-check="tools"]')).toContainText('Werkzeuge');
  await expect(list.locator('[data-check="zero"]')).toContainText('Nullpunkt gesetzt');
  await expect(list.locator('[data-check="limits"]')).toContainText('innerhalb der Grenzen');
  await expect(list.locator('[data-check="travel"] svg')).toBeVisible();
  // A stock thinner than the cut is noticed.
  await goTo(page, 'Job');
  const material = page.getByTestId('setup-material');
  await moreOptions(page, 'workpiece');
  await material.getByLabel('Länge X (mm)').fill('100');
  await material.getByLabel('Breite Y (mm)').fill('100');
  await material.getByLabel('Dicke Z (mm)').fill('1');
  await material.getByRole('button', { name: /^Maße übernehmen/ }).click();
  await goTo(page, 'Prüfen');
  await expect(list.locator('[data-check="depth"]')).toContainText('in die Opferplatte');
  // The check offers no start (between parts the cutting view names the tool to change): it leads on.
  await expect(page.getByTestId('primary-action')).toHaveText('Weiter: Fräsen');
  // A warning leads to the check, where it is listed – not to the cutting view that says "bereit".
  await goTo(page, 'Einrichten');
  await page.getByTestId('primary-action').click();
  await expect(page.getByTestId('assistant-checks')).toBeVisible();
});

test('depth per area: "Mehr Optionen" unfolds, and the app remembers it', async ({ page }) => {
  await ready(page);
  // By the buttons of the areas themselves: `goTo` would unfold the deeper levels.
  const step = (id: string) => page.getByTestId(`step-${id}`).click();
  // The check is a view of Fräsen: Fräsen opens on the cutting, the check is one tap further.
  const check = async () => {
    await step('run');
    await page
      .getByRole('group', { name: /^Bereich in Fräsen/ })
      .getByRole('button', { name: /^Prüfen/ })
      .click();
  };
  await check();
  await expect(page.getByTestId('workspace-check')).toBeHidden();
  await moreOptions(page, 'check');
  await expect(page.getByTestId('workspace-check')).toBeVisible();
  // "Alle Parameter" is one level further.
  await expect(page.locator('#job-diagnostics')).toBeHidden();
  await moreOptions(page, 'check', true);
  await expect(page.locator('#job-diagnostics')).toBeVisible();
  // Another area is still simple; coming back, this one is as it was left.
  await step('run');
  await expect(page.getByTestId('run-card')).toBeHidden();
  await check();
  await expect(page.getByTestId('workspace-check')).toBeVisible();
  await page.reload();
  await page.getByTestId('step-job').click();
  await loadJob(page);
  await check();
  await expect(page.getByTestId('workspace-check')).toBeVisible();
  await expect(page.locator('#job-diagnostics')).toBeVisible();
});

test('the CAM tab opens the drawing workspace, and a loaded program survives going in and out', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  // A fresh app has no drawing: the tab opens one (it must not bounce back to the Job).
  await page.getByTestId('step-cam').click();
  await expect(page.getByTestId('step-cam')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('cam-draw')).toBeVisible();
  await page.getByTestId('step-job').click();
  await loadJob(page);
  await page.getByTestId('step-cam').click();
  await expect(page.getByTestId('cam-draw')).toBeVisible();
  await page.getByTestId('step-job').click();
  await expect(page.getByTestId('job-loaded')).toContainText('schild.nc');
});

test('the CAM tab always opens on the table, also after a look at 3D inside it', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.getByTestId('step-cam').click();
  await expect(stageMode(page, 'Tisch')).toHaveAttribute('aria-pressed', 'true');
  await stageMode(page, '3D').click();
  await expect(stageMode(page, '3D')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('step-setup').click();
  await page.getByTestId('step-cam').click();
  await expect(stageMode(page, 'Tisch')).toHaveAttribute('aria-pressed', 'true');
});

test('a drawing is worked on while a job runs: the program that runs stays, the hint says why', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await ready(page);
  await goTo(page, 'Fräsen');
  await hold(page, /Fräsen starten/, 1300);
  await expect.poll(() => started(page)).toBe(1);
  await status(
    page,
    '<Run|MPos:610.000,1210.000,-62.000|FS:900,18000|Ov:100,100,100|SD:42.0,/sd/schild.nc>',
  );
  await expect(page.getByTestId('running-job')).toBeVisible();
  // The drawing can be worked on …
  await page.getByTestId('step-cam').click();
  await expect(page.getByTestId('cam-draw')).toBeVisible();
  await drawShape(page, 'Rechteck');
  await drawShape(page, 'Kreis');
  // … the hint says what lies on the table and why the drawing does not go there …
  const hint = page.getByTestId('cam-other-job');
  await expect(hint).toContainText('Job läuft');
  await expect(hint).toContainText('schild.nc');
  // … neither the hint's button nor the hand-over can put it there while the job runs.
  await expect(page.getByTestId('cam-show-drawing')).toBeDisabled();
  await page.getByTestId('cam-show-drawing').click({ force: true });
  await expect(page.getByTestId('cam-hand-over')).toBeDisabled();
  // The program on the table is the one that runs.
  await page.getByTestId('step-job').click();
  await expect(page.getByTestId('job-loaded')).toContainText('schild.nc');
  await page.getByTestId('step-cam').click();
  // After the job the tap puts the drawing there.
  await page.evaluate(() => {
    (window as unknown as { __socket: { emit(l: string): void } }).__socket.emit('ok');
  });
  await status(page, SET_ZERO);
  await expect(page.getByTestId('cam-show-drawing')).toBeEnabled();
  await page.getByTestId('cam-show-drawing').click();
  await expect(page.getByTestId('cam-other-job')).toHaveCount(0);
  await page.getByTestId('step-job').click();
  await expect(page.getByTestId('job-loaded')).toContainText('zeichnung.nc');
});
