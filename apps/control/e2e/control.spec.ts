import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { fileURLToPath } from 'node:url';
import {
  boardToWork,
  cameraSpot,
  closeJog,
  connect,
  drawShape,
  followMoves,
  goTo,
  hold,
  inReach,
  installFakeFluidNC,
  jobView,
  moreOptions,
  numberIn,
  onStage,
  openApp,
  openDemo,
  openJog,
  rested,
  restingTable,
  seedCamera,
  sent,
  stageMode,
  stageTool,
  tableGeometry,
  tableSpot,
  tableWork,
} from './helpers';

const realJob = fileURLToPath(
  new URL(
    '../../../packages/gcode-core/test/golden/fusion360-1003-adaptiv-kontur-parallel.nc',
    import.meta.url,
  ),
);
const stockConfig = fileURLToPath(new URL('../../../machine/config.yaml', import.meta.url));
const estlcamJob = fileURLToPath(
  new URL(
    '../../../packages/gcode-core/test/golden/estlcam-spie-kl-haltestege.nc',
    import.meta.url,
  ),
);
const rotaryJob = fileURLToPath(
  new URL('../../../packages/gcode-core/test/golden/vectric-rotary-wrap-a.nc', import.meta.url),
);

/** ⑤ Fräsen, where streaming is one of the further options (unfolded by `goTo`). */
async function streamPanel(page: Page) {
  await jobView(page, 'Fertigen');
  await expect(page.getByTestId('run-card')).toBeVisible();
}

/**
 * Goes to a part of the settings: a folded section under Einstellungen → Maschine, the
 * camera's own view, or calibrating (which lives under Service & Diagnose).
 */
async function machineSetup(page: Page, section: string) {
  if (section === 'Kalibrieren') {
    await goTo(page, 'Service & Diagnose', 'Kalibrieren');
    return page.getByTestId('service-calibrate');
  }
  if (section === 'Kamera einrichten') {
    await goTo(page, 'Einstellungen', 'Kamera');
    return page.getByTestId('camera-setup');
  }
  await goTo(page, 'Einstellungen', 'Maschine');
  return openSection(page, section);
}

/** Einstellungen → Experte, switching the expert functions on first if needed. */
async function expert(page: Page) {
  await goTo(page, 'Einstellungen');
  const group = page.getByRole('group', { name: /^Bereich/ });
  if ((await group.getByRole('button', { name: 'Experte', exact: true }).count()) === 0) {
    await group.getByRole('button', { name: 'Maschine', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Expertenfunktionen anzeigen' }).check();
  }
  await group.getByRole('button', { name: 'Experte', exact: true }).click();
}

/** Unfolds a folded section (a card with its heading as the way in) in the side panel. */
async function openSection(page: Page, title: string) {
  const section = page
    .locator('.section[data-fold]')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  if ((await section.getAttribute('data-open')) === null) {
    await section.locator('[data-fold-trigger]').first().click();
  }
  return section;
}

/** The names of the five steps, as the row of the steps shows them. */
const stepNames = (page: Page) => page.locator('.nav-stepper [data-slot="stepper-label"]');

test('opens on Start: the state, one recommendation, the five steps, PAUSE and NOT-HALT', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('LowRider Control');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  // textContent, not what is shown: narrow, a step that is not the current one is its number.
  expect(await stepNames(page).allTextContents()).toEqual([
    'Job',
    'CAM',
    'Einrichten',
    'Fräsen',
    'Service',
    'Einstellungen',
  ]);
  await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PAUSE' })).toBeVisible();
  await expect(page.getByTestId('machine-state')).toContainText('Nicht verbunden');
  await expect(page.getByTestId('start-state')).toContainText('Nicht verbunden');
  // Exactly one recommendation, read from the real state, with its one action bottom right.
  const next = page.getByTestId('next-card');
  await expect(next).toContainText('Als Nächstes');
  await expect(next).toContainText('Maschine verbinden');
  const primary = page.getByTestId('primary-action');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveText('Weiter: Verbindung');
  const [bar, button] = [
    (await page.locator('.actionbar').boundingBox())!,
    (await primary.boundingBox())!,
  ];
  expect(button.x + button.width).toBeGreaterThan(bar.x + bar.width - 24);
  await primary.click();
  await expect(page.getByRole('button', { name: 'Verbinden', exact: true })).toBeVisible();

  // A step shows the stage: one picture with exactly three modes; the table is the start.
  await goTo(page, 'Job');
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  const modes = page.getByRole('group', { name: 'Ansicht der Bühne' }).getByRole('button');
  await expect(modes).toHaveText(['Tisch', 'Kamera', '3D']);
  await expect(stageMode(page, 'Tisch')).toHaveAttribute('aria-pressed', 'true');
  // Without a program the one thing to do in ① is to get one.
  await expect(page.getByTestId('primary-action')).toHaveText('G-Code öffnen');
  await expect(page.getByTestId('drop-zone')).toBeVisible();
});

test('the side view is offered where depth matters and leads back to the table', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  // The tools of the table: one row, the same in every room.
  await expect(page.getByTestId('tool-strip').getByRole('group').getByRole('button')).toHaveText([
    'Hinfahren',
    'Nullpunkt',
    'Messen',
    'Spannmittel',
  ]);
  await jobView(page, 'Prüfen');
  const looks = page.getByRole('group', { name: 'Ansicht', exact: true });
  await expect(looks.getByRole('button')).toHaveText(['Draufsicht', 'Seite']);
  await looks.getByRole('button', { name: 'Seite' }).click();
  // Seen from the side a tap has no X/Y: the tool row says so and offers the way back.
  const strip = page.getByTestId('tool-strip');
  await expect(strip).toContainText('Seitenansicht');
  await expect(stageTool(page, 'Hinfahren')).toHaveCount(0);
  await expect(stageMode(page, 'Tisch')).toHaveAttribute('aria-pressed', 'true');
  await strip.getByRole('button', { name: 'Zur Draufsicht' }).click();
  await expect(stageTool(page, 'Hinfahren')).toBeVisible();
  await expect(looks.getByRole('button', { name: 'Draufsicht' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The simulation card names itself once.
  await expect(page.getByRole('heading', { name: 'Simulation', exact: true })).toHaveText(
    'Simulation',
  );
  // Rapids are a way of looking at the job while checking, not a switch on the stage.
  const rapids = page.getByRole('button', { name: 'Eilgänge' });
  await expect(rapids).toHaveAttribute('aria-pressed', 'true');
  await rapids.click();
  await expect(rapids).toHaveAttribute('aria-pressed', 'false');
});

test('every visible control is a large enough touch target', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  const small = () =>
    page.$$eval('button:not([disabled]), input[type="text"], select', (els) =>
      els
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        // Layout size: a just-tapped button may still be easing back from its press.
        .map((el) => ({ text: el.textContent?.trim(), h: (el as HTMLElement).offsetHeight }))
        .filter((b) => b.h < 47.5),
    );
  // Start, every step and every side area, each with every view of its second level.
  const places: [Parameters<typeof goTo>[1], (string | undefined)[]][] = [
    ['Start', [undefined]],
    ['Job', ['Vorbereiten', 'Extras']],
    ['Werkzeuge', [undefined]],
    ['Einrichten', ['Nullpunkte', 'Antasten', 'Kamera', 'Ausrichten']],
    ['Prüfen', [undefined]],
    ['Fräsen', [undefined]],
    ['Werkzeugliste', [undefined]],
    ['Service & Diagnose', ['Diagnose', 'Meldungen', 'Historie', 'Kalibrieren']],
    ['Einstellungen', ['Verbindung', 'Maschine', 'Kamera']],
  ];
  for (const [place, views] of places) {
    for (const view of views) {
      await goTo(page, place, view);
      expect(await small(), `${place} ${view ?? ''}`).toEqual([]);
    }
  }
  // The jog panel and the main menu.
  await openJog(page);
  expect(await small(), 'Jog').toEqual([]);
  await closeJog(page);
  await page.getByTestId('menu-button').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(await small(), 'Menü').toEqual([]);
});

test('loads a job, estimates its time and simulates it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await jobView(page, 'Prüfen');
  const summary = page.getByTestId('job-summary');
  await expect(summary).toContainText('demo.nc');
  await expect(page.getByTestId('job-estimate')).toHaveText('1:18');
  await expect(page.getByText('Ziel hängt von gespeicherter/getasteter Position ab')).toBeVisible();

  await page.getByRole('slider', { name: 'Simulation' }).fill('40');
  await expect(page.getByTestId('sim-time')).toHaveText('0:40 / 1:18');
  await expect(page.locator('.current-line code')).toContainText(/^\d+: G/);

  await page.getByRole('button', { name: '200×' }).click();
  await page.getByRole('button', { name: 'Abspielen', exact: true }).click();
  await expect(page.getByTestId('sim-time')).toHaveText('1:18 / 1:18', { timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Abspielen', exact: true })).toBeVisible();
});

test('flags A-axis moves because the machine has no rotary axis', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles(rotaryJob);
  await jobView(page, 'Prüfen');
  await expect(
    page.getByText('Achse ist an dieser Maschine nicht vorhanden').first(),
  ).toBeVisible();
  await expect(page.getByText(/Fehler – die Steuerung würde diese Zeilen ablehnen/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abwicklung' })).toHaveCount(0);
});

test('checks a real Fusion 360 job for FluidNC pitfalls', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles(realJob);
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('job-summary')).toContainText('41.517');
  const issues = page.getByTestId('job-issues');
  await expect(issues).toContainText('35777');
  await expect(issues).toContainText('Werkzeugwechsel auf T2');
  await expect(issues).toContainText('M1 (optionaler Halt)');
  await expect(page.getByText(/G43 mit H-Wort/).first()).toBeVisible();
});

test('imports the travel from config.yaml, from a file or the machine', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await goTo(page, 'Einstellungen');
  await machineSetup(page, 'Maschinenprofil');
  await page.getByTestId('config-input').setInputFiles(stockConfig);
  await expect(page.getByLabel('X max')).toHaveValue('1223');
  await expect(page.getByLabel('Z min')).toHaveValue('-297');
  await expect(page.getByTestId('controller-config')).toContainText(
    'soft_limits ist in der config.yaml aus',
  );
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText('config.yaml übernommen');

  await connect(page);
  await machineSetup(page, 'Maschinenprofil');
  await page.getByRole('button', { name: 'Von der Maschine lesen ($CD)' }).click();
  await expect(page.getByLabel('X max')).toHaveValue('1003');
  await expect(page.getByLabel('Z min')).toHaveValue('-117');
  await expect(page.getByTestId('controller-config')).toContainText('soft_limits ist an');
});

test('jogging stops at the software end stops once homed', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);

  // Enter the travel: X 0 … 1200
  await machineSetup(page, 'Maschinenprofil');
  await page.getByLabel('X max').fill('1200');
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText('Maschinenprofil gespeichert');

  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:1195.000,100.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  await openJog(page);
  await page.getByRole('button', { name: '10 mm' }).click();

  // Not homed: relative jog, no limit, with a warning.
  await expect(page.getByText(/Nicht referenziert/)).toBeVisible();
  await page.getByRole('button', { name: /^X\+/ }).click();
  await expect.poll(() => sent(page)).toContain('$J=G91 G21 X10 F3000');

  await hold(page, /Referenzfahrt/);
  await expect.poll(() => sent(page)).toContain('$H');
  await expect(page.getByText(/Nicht referenziert/)).toHaveCount(0);

  // Homed: the 10 mm jog is shortened to the limit at 1200.
  await expect(page.getByRole('button', { name: /^X\+/ })).toContainText('noch 5,0 mm');
  await page.getByRole('button', { name: /^X\+/ }).click();
  await expect.poll(() => sent(page)).toContain('$J=G53 G90 G21 X1200 F3000');

  // At the limit the button is disabled.
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:1200.000,100.000,-10.000|FS:0,0>';
  });
  await expect(page.getByRole('button', { name: /^X\+/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^X−/ })).toBeEnabled();
});

test('tracks the live machine, shows the deviation and explains alarms', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await connect(page);
  await expect(page.getByText(/Firmware: Grbl 3\.7/)).toBeVisible();

  // 0.3 mm beside the first contour pass (Y = −3) while running.
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Run|MPos:50.000,-2.700,-2.000,0.000|FS:1200,18000|WCO:0.000,0.000,0.000,0.000>';
  });
  await expect(page.getByTestId('machine-state')).toContainText('Läuft');
  await expect(page.locator('.metric').filter({ hasText: 'Abweichung' })).toContainText('0.30');
  await expect(page.locator('[data-slot="dro-value"]').first()).toContainText('50.00');

  await page.evaluate(() => {
    const w = window as unknown as { __status: string; __socket: { emit(l: string): void } };
    w.__status = '<Alarm|MPos:50.000,-2.700,-2.000,0.000|FS:0,0|Pn:X>';
    w.__socket.emit('ALARM:1');
  });
  const alarm = page.getByRole('alert');
  await expect(alarm).toContainText('Alarm 1');
  await expect(alarm).toContainText('Endschalter');
  // The status report follows the alarm message; with it the page has settled.
  await expect(page.getByTestId('machine-state')).toContainText('Alarm');

  await hold(page, /Entsperren.*Halten/);
  await expect.poll(() => sent(page)).toContain('$X');
});

test('dangerous actions need a hold, the e-stop one tap', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await openJog(page);

  await page
    .getByRole('button', { name: /Referenzfahrt/ })
    .first()
    .click();
  await page.waitForTimeout(300);
  expect(await sent(page)).not.toContain('$H');
  await hold(page, /Referenzfahrt/);
  await expect.poll(() => sent(page)).toContain('$H');

  await page.getByRole('button', { name: 'NOT-HALT' }).click();
  await expect.poll(() => sent(page)).toEqual(expect.arrayContaining(['!', '\u0018']));
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText('Not-Halt gesendet');
});

test('runs a real job from the SD card, one part per tool', async ({ page }) => {
  // A real Fusion 360 job on stage and in 3D: about 20 s alone, more with tests in parallel.
  test.setTimeout(60_000);
  await installFakeFluidNC(page);
  await openApp(page);
  // Zero point in the middle of the table, so the job fits the travel.
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
  });
  await page.getByTestId('file-input').setInputFiles(realJob);
  await connect(page);
  await jobView(page, 'Fertigen');
  const panel = page.getByTestId('run-panel');
  await expect(panel).toContainText('2 Zeile(n) mit „G43 … H“ bereinigt');
  await expect(page.getByTestId('run-parts')).toContainText('Teil 2 · T2');

  // One hold: onto the card, checked there, started there.
  await hold(page, /Teil 1\/2 starten \(T1\)/, 1300);
  const part1 = '$SD/Run=/fusion360-1003-adaptiv-kontur-parallel_1of2_T1.nc';
  await expect.poll(() => sent(page)).toContain(part1);
  expect(await sent(page)).toContain('$SD/List');
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Run|MPos:72.197,-3.644,2.500|FS:400,0|SD:12.5,/sd/fusion360-1003-adaptiv-kontur-parallel_1of2_T1.nc>';
  });
  const running = page.getByTestId('running-job');
  await expect(running).toContainText('13 %');
  await running.getByRole('button', { name: 'Vorschub 10 % mehr' }).click();
  await expect.poll(() => sent(page)).toContain('0x91');
  await moreOptions(page, 'run-live');
  await running.getByRole('button', { name: '50 %', exact: true }).click();
  await expect.poll(() => sent(page)).toContain('0x96');

  // The run bar keeps the job in reach where its own card is not: under the jog panel,
  // on Start and in the side areas.
  await openJog(page);
  await expect(page.getByTestId('run-bar')).toContainText('13 %');
  await goTo(page, 'Einstellungen');
  await expect(page.getByTestId('run-bar')).toContainText('13 %');
  await page.getByTestId('run-bar').getByRole('button', { name: 'Zum Job' }).click();
  await expect(page.getByTestId('step-run')).toHaveAttribute('aria-current', 'step');

  // The check is looked at while part 1 cuts (it is allowed: only a waiting job forces the cutting view).
  const subnav = page.locator('.subnav');
  await subnav.getByRole('button', { name: 'Prüfen', exact: true }).click();
  await expect(page.getByTestId('readiness')).toBeVisible();

  // Part 1 ends: spindle off, tool up, then the guided change to T2.
  await page.evaluate(() => {
    const w = window as unknown as { __status: string; __socket: { emit(l: string): void } };
    w.__status = '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
    w.__socket.emit('ok');
  });
  const change = page.getByTestId('tool-change');
  await expect(change).toContainText('T2');
  await expect.poll(() => sent(page)).toEqual(expect.arrayContaining(['M5', 'G91 G0 Z20']));
  // The job waits: the cutting view comes by itself – the check chosen before is put away, a tap
  // on it changes nothing and stores nothing for later, and the bar offers no way to a list that
  // cannot open.
  await expect(page.getByTestId('readiness')).toHaveCount(0);
  await expect(subnav.getByRole('button', { name: 'Fräsen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await subnav.getByRole('button', { name: 'Prüfen', exact: true }).click();
  await expect(change).toBeVisible();
  await expect(page.getByTestId('readiness')).toHaveCount(0);
  await expect(page.getByTestId('primary-action')).not.toContainText('Prüfen');
  const goOn = change.getByRole('button', { name: /Teil 2\/2 starten/ });
  await expect(goOn).toBeEnabled();

  // "Großbild" puts the panel away – the tool change stays, under the picture.
  await page.getByTestId('stage-wide').click();
  await expect(page.locator('.panel-body')).toHaveCount(0);
  await expect(change).toBeVisible();
  await expect(change).toContainText('T2');
  // The card is taller than the strip under the picture: going on and giving up stay docked at the
  // strip's bottom, in reach without scrolling it (`toBeVisible` cannot see a clipped button).
  const prompt = page.locator('.stage-prompt');
  for (const control of [goOn, change.getByRole('button', { name: 'Restliche Teile abbrechen' })]) {
    const r = await inReach(page, control, prompt);
    expect(r.inside, JSON.stringify(r)).toBe(true);
    expect(r.reached, JSON.stringify(r)).toBe(true);
  }
  await page.getByTestId('stage-wide').click();
  await expect(change).toBeVisible();

  // A start that the readiness list blocks stays locked here as well, with its reason: the zero
  // moved so far that the job leaves the travel.
  const blockedStatus = '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:0.000,0.000,-60.000>';
  await page.evaluate((text) => {
    (window as unknown as { __status: string }).__status = text;
  }, blockedStatus);
  await expect(goOn).toBeDisabled();
  await expect(page.getByTestId('primary-action')).not.toContainText('Prüfen');
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
  });
  await expect(goOn).toBeEnabled();
  await hold(page, /Teil 2\/2 starten \(T2\)/, 1300);
  await expect
    .poll(() => sent(page))
    .toContain('$SD/Run=/fusion360-1003-adaptiv-kontur-parallel_2of2_T2.nc');
  // Part 2 cuts: the figures and the overrides – not the check the tap above asked for.
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Run|MPos:80.000,-3.644,-2.000|FS:400,0|SD:5.0,/sd/fusion360-1003-adaptiv-kontur-parallel_2of2_T2.nc>';
  });
  await expect(page.getByTestId('running-job')).toBeVisible();
  await expect(page.getByTestId('readiness')).toHaveCount(0);

  // Stop: hold first, reset once the hold is complete.
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Hold:0|MPos:80.000,-3.644,-2.000|FS:0,0>';
  });
  // The report has arrived (the cards below change with it, and the panel may settle anew).
  await expect(page.getByTestId('machine-state')).toContainText('Pausiert');
  // Abort asks first (DESIGN.md §6.4); PAUSE and NOT-HALT stay above the question.
  await page.getByTestId('abort-action').click();
  await page.getByTestId('abort-dialog').getByRole('button', { name: 'Job abbrechen' }).click();
  await expect.poll(() => sent(page)).toEqual(expect.arrayContaining(['!', '\u0018']));
});

test('sets zero, touches off Z and runs macros', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);

  await machineSetup(page, 'Makros');
  await page.getByText('Makros bearbeiten').click();
  await page.getByRole('button', { name: 'Makro hinzufügen' }).click();
  await page.getByLabel('Name').last().fill('Park');
  await page.getByLabel('G-Code (ein Befehl pro Zeile)').last().fill('G53 G0 Z0\nG53 G0 X10 Y10');
  await page.getByRole('button', { name: 'Speichern' }).click();

  await openJog(page);
  await hold(page, /Ref\. Z/);
  await expect.poll(() => sent(page)).toContain('$HZ');
  await hold(page, /^Park Halten/);
  await expect
    .poll(() => sent(page))
    .toEqual(expect.arrayContaining(['G53 G0 Z0', 'G53 G0 X10 Y10']));

  await goTo(page, 'Einrichten', 'Nullpunkte');
  await page.getByRole('button', { name: 'XY = 0' }).click();
  await expect.poll(() => sent(page)).toContain('G10 L20 P0 X0 Y0');

  await page.getByRole('button', { name: 'Antasten' }).click();

  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,100.000,-20.000|FS:0,0|WCO:0.000,0.000,-25.000|Pn:P>';
  });
  await expect(page.getByTestId('probe-contact')).toContainText('Kontakt');
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,100.000,-20.000|FS:0,0|WCO:0.000,0.000,-25.000>';
  });
  await expect(page.getByTestId('probe-contact')).toContainText('offen');
  await hold(page, /Antasten starten/);
  await expect
    .poll(() => sent(page))
    .toEqual(expect.arrayContaining(['G90 G38.2 Z-35 F100', 'G10 L20 P0 Z0.5', 'G90 G0 Z10.5']));
  await expect(page.getByText('Platte und Klemme entfernen')).toBeVisible();
});

test('changes config.yaml settings with a backup first', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.evaluate(() => {
    const w = window as unknown as { __config: string };
    w.__config = w.__config.replaceAll('soft_limits: true', 'soft_limits: false');
  });
  await expert(page);
  const editor = page.getByTestId('config-editor');
  await editor.getByRole('button', { name: 'Von der Maschine lesen' }).click();
  await editor.getByRole('checkbox', { name: /^soft_limits/ }).check();
  await editor.getByLabel('max_travel_mm Z').fill('95');
  await expect(page.getByTestId('config-changes')).toContainText('axes/z/max_travel_mm = 95');
  await hold(page, /Sichern und schreiben/);
  await expect
    .poll(() => sent(page))
    .toEqual(
      expect.arrayContaining([
        '$/axes/x/soft_limits=true',
        '$/axes/y/soft_limits=true',
        '$/axes/z/soft_limits=true',
        '$/axes/z/max_travel_mm=95',
        '$CD=config.yaml',
      ]),
    );
  const order = await sent(page);
  const backup = order.findIndex((l) => /^\$CD=config-backup-\d{8}T\d{4}\.yaml$/.test(l));
  expect(backup).toBeGreaterThan(-1);
  expect(backup).toBeLessThan(order.indexOf('$/axes/x/soft_limits=true'));
});

test('the e-stop without a connection points to the hardware e-stop', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'NOT-HALT' }).click();
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText('Hardware-Not-Aus');
});

const toolChangeJob = [
  'G21 G90 G54',
  'T1 M6',
  'S18000 M3',
  'G0 X0 Y0 Z5',
  'G1 Z-1 F300',
  'G1 X10 F1200',
  'G0 Z5',
  'M5',
  'T2 M6',
  'S18000 M3',
  'G0 X20 Y0',
  'G1 Z-1 F300',
  'G1 X30 F1200',
  'G0 Z5',
  'M30',
].join('\n');

async function homeMachine(page: Page) {
  await openJog(page);
  await hold(page, /^Referenzfahrt/);
  await expect.poll(() => sent(page)).toContain('$H');
}

test('streams a job and holds at each tool change', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'wechsel.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from(toolChangeJob),
  });
  await connect(page);
  await homeMachine(page);
  await streamPanel(page);
  await expect(page.getByTestId('run-card')).toContainText('2 Werkzeugwechsel');

  await hold(page, /Rahmen abfahren/);
  await expect
    .poll(() => sent(page))
    .toEqual(expect.arrayContaining(['G53 G0 Z1', 'G0 X0 Y0', 'G1 X30 F3000', 'G1 Y0']));

  await hold(page, /Programm starten/, 1300);
  const change = page.getByTestId('tool-change');
  await expect(change).toContainText('T1');
  await expect(change).toContainText('Schaftfräser 8 mm');
  await expect.poll(() => sent(page)).toEqual(expect.arrayContaining(['G21G90G54', 'M5']));
  expect(await sent(page)).not.toContain('T1M6');

  // "Großbild" puts the panel away – the question the job asks stays, under the picture.
  await page.getByTestId('stage-wide').click();
  await expect(page.locator('.panel-body')).toHaveCount(0);
  await expect(change).toBeVisible();
  await expect(change).toContainText('T1');
  await page.getByTestId('stage-wide').click();
  await expect(change).toBeVisible();

  // The pause is for a machine that moves: at rest the job waits for the field above and it has
  // nothing to hold, on its way to the change position it is there.
  const pause = page.getByTestId('primary-action');
  await expect(pause).toBeDisabled();
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Run|MPos:600.000,1200.000,-10.000|FS:900,0|WCO:600.000,1200.000,-60.000>';
  });
  await expect(pause).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
  });
  await expect(pause).toBeDisabled();

  await hold(page, /Job fortsetzen/);
  await expect(change).toContainText('T2');
  await expect(change).toContainText('Kugelfräser 6 mm');
  const before = await sent(page);
  expect(before).toContain('G1X10F1200');
  expect(before).not.toContain('G0X20Y0');

  await hold(page, /Job fortsetzen/);
  await expect(change).toHaveCount(0);
  await expect.poll(() => sent(page)).toContain('M30');
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText('Job wechsel.nc fertig');
  await goTo(page, 'Service & Diagnose', 'Historie');
  await expect(page.getByTestId('history-card')).toContainText('wechsel.nc');
  await expect(page.getByTestId('history-card')).toContainText('fertig');
});

test('selects coordinate systems and remembers zero points', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await goTo(page, 'Einrichten', 'Nullpunkte');
  const wcs = page.getByTestId('wcs-card');
  await wcs.getByRole('button', { name: 'G55' }).click();
  await expect.poll(() => sent(page)).toContain('G55');
  await expect(wcs).toContainText('Nullpunkt G55 (Maschine): X 100.000');

  const zeros = page.getByTestId('saved-zeros');
  await zeros.getByLabel('Name der Aufspannung').fill('Schraubstock');
  await zeros.getByRole('button', { name: 'Speichern' }).click();
  await expect(zeros).toContainText('Schraubstock');
  await expect(zeros).toContainText('G55');
  await hold(page, /^Übernehmen/);
  await expect.poll(() => sent(page)).toContain('G10 L2 P2 X100 Y200 Z-50');
});

test('probes an outside corner and sets X, Y and Z', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.evaluate(() => {
    (window as unknown as { __prb: string[] }).__prb = [
      '100.000,200.000,-40.000',
      '95.000,200.000,-48.000',
      '108.000,195.000,-48.000',
    ];
  });
  await goTo(page, 'Einrichten', 'Antasten');
  await page.getByTestId('probe-tiles').getByRole('button', { name: /^Ecke/ }).click();
  const wizard = page.getByTestId('probe-wizard');
  await wizard.getByRole('button', { name: 'vorne links' }).click();
  await expect(wizard.getByRole('button', { name: 'Ohne Platte' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await hold(page, /Tastzyklus starten/);
  // The cycle only measures: the result says how far it is from the zero as it was …
  const result = page.getByTestId('probe-result');
  await expect(result.getByTestId('probe-deviation')).toContainText('+99,000 mm gegenüber bisher');
  expect((await sent(page)).some((l) => l.startsWith('G10 L2'))).toBe(false);
  // … and the operator takes it over.
  await result.getByRole('button', { name: 'Nullpunkt übernehmen' }).click();
  await expect(result).toContainText('Nullpunkt übernommen');
  // T1 is the 8 mm cutter, no plate (conductive workpiece): edges at X 95 + 4, Y 195 + 4, Z −40
  await expect.poll(() => sent(page)).toContain('G10 L2 P0 X99 Y199 Z-40');
  expect(await sent(page)).toEqual(expect.arrayContaining(['G91 G38.2 Z-40 F100', 'G90']));
});

test('jogs continuously while held and stops on release', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await homeMachine(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,100.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  // The jog counts from the position the app last read: wait until it has read this one (a status
  // report comes every 200 ms; on a fast machine the whole test is quicker than that).
  await expect(page.getByTestId('position-tile')).toContainText('100.000');
  await page.getByRole('button', { name: 'Dauer' }).click();
  const button = page.getByRole('button', { name: /^X\+/ });
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => sent(page)).toContain('$J=G53 G90 G21 X1223 F3000');
  await page.mouse.up();
  await expect.poll(() => sent(page)).toContain('0x85');

  await page.getByRole('button', { name: '0,01 mm' }).click();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => sent(page)).toContain('$J=G53 G90 G21 Y100.01 F3000');
});

test('resumes an aborted job from a line', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles({
    name: 'wechsel.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from(toolChangeJob),
  });
  await connect(page);
  await homeMachine(page);
  await jobView(page, 'Fertigen');
  const resume = page.getByTestId('resume-card');
  await resume.locator('[data-fold-trigger]').first().click();
  await resume.getByLabel(/Zeile \(1–/).fill('12');
  await expect(resume).toContainText('resume at line 12');
  await hold(page, /Ab Zeile 12 starten/, 1300);
  await expect
    .poll(() => sent(page))
    .toEqual(expect.arrayContaining(['G53G0Z1', 'G0X20Y0', 'G1Z-1F300', 'G1X30F1200']));
});

test('edits the whole config.yaml with a check, a diff and a backup', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  const uploads: string[] = [];
  await page.exposeFunction('__upload', (name: string) => uploads.push(name));
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const files: Record<string, string> = {};
    w.__files = files;
    const realFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/files') && init?.body instanceof FormData) {
        const file = init.body.get('myfile[]') as File;
        const name = file.name.replace(/^\//, '');
        files[name] = await file.text();
        if (name === 'config.yaml') w.__config = files[name];
        (w.__upload as (n: string) => void)(name);
        return new Response(null);
      }
      return realFetch(input, init);
    };
    // $LocalFS/Show of a backup returns what was uploaded.
    const socket = w.__socket as { send(d: string): void; emit(l: string): void };
    const send = socket.send.bind(socket);
    socket.send = (data: string) => {
      const m = /^\$LocalFS\/Show=(config-backup-.*)\n$/.exec(data);
      if (m) {
        for (const l of files[m[1]!]!.split('\n')) socket.emit(l);
        socket.emit('ok');
        return;
      }
      send(data);
    };
  });
  await expert(page);
  const editor = page.getByTestId('config-file-editor');
  await editor.locator('[data-fold-trigger]').first().click();
  await editor.getByRole('button', { name: 'Von der Maschine lesen' }).click();
  const text = editor.getByRole('textbox');
  await expect(text).toHaveValue(/board: Jackpot V2/);
  await text.fill((await text.inputValue()).replace('max_travel_mm: 120', 'max_travel_mm: abc'));
  await expect(page.getByTestId('config-issues')).toContainText('z/max_travel_mm ist keine Zahl');
  await expect(page.getByRole('button', { name: /Sichern und hochladen/ })).toBeDisabled();
  await text.fill((await text.inputValue()).replace('max_travel_mm: abc', 'max_travel_mm: 95'));
  await expect(page.getByTestId('config-diff')).toContainText('+     max_travel_mm: 95');
  await expect(page.getByTestId('config-diff')).toContainText('−     max_travel_mm: 120');
  await hold(page, /Sichern und hochladen/, 1500);
  await expect.poll(() => uploads.length).toBe(2);
  expect(uploads[0]).toMatch(/^config-backup-\d{8}T\d{4}\.yaml$/);
  expect(uploads[1]).toBe('config.yaml');
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText('config.yaml geschrieben');
});

test('explains and changes $ settings', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const socket = w.__socket as { send(d: string): void; emit(l: string): void };
    const send = socket.send.bind(socket);
    socket.send = (data: string) => {
      if (data === '$S\n') {
        for (const l of [
          '$Hostname=fluidnc',
          '$WiFi/Mode=STA>AP',
          '$Sta/SSID=Werkstatt',
          '$Message/Level=Info',
        ])
          socket.emit(l);
        socket.emit('ok');
        return;
      }
      send(data);
    };
  });
  await expert(page);
  const browser = page.getByTestId('settings-browser');
  await browser.locator('[data-fold-trigger]').first().click();
  await browser.getByRole('button', { name: 'Von der Maschine lesen ($S)' }).click();
  await expect(browser).toContainText('Name im Netzwerk');
  await expect(browser).toContainText('Name des Heim-WLANs');
  const level = browser.locator('li', { hasText: '$Message/Level' });
  await level.getByLabel('Wert').fill('Debug');
  await level.getByRole('button', { name: 'Setzen' }).click();
  await expect.poll(() => sent(page)).toContain('$Message/Level=Debug');
  const ssid = browser.locator('li', { hasText: '$Sta/SSID' });
  await ssid.getByLabel('Wert').fill('Neu');
  await expect(ssid).toContainText('kann die WLAN-Verbindung trennen');
  await hold(page, /^Setzen/);
  await expect.poll(() => sent(page)).toContain('$Sta/SSID=Neu');
});

test('suggests cutting values and keeps tool and material libraries', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Werkzeugliste');
  const advisor = page.getByTestId('cutting-advisor');
  await advisor.getByLabel('Material').selectOption({ label: 'MDF' });
  // 8 mm, 2 flutes, MDF: n = 600·1000/(π·8) ≈ 23 873, feed limited to 3000
  await expect(advisor).toContainText('23.873');
  await expect(advisor).toContainText('3.000');
  await expect(advisor).toContainText('Vorschub durch die Maschine begrenzt');

  const tools = page.getByTestId('tool-library');
  await tools.getByRole('button', { name: 'Werkzeug hinzufügen' }).click();
  await tools.getByLabel('Name', { exact: true }).fill('V-Nut 60°');
  await tools.getByRole('button', { name: 'V-Nut', exact: true }).click();
  await expect(tools).toContainText('Bitte Name');
  await tools.getByLabel('Winkel (°, V-Nut/Fase)').fill('60');
  // Own cutting values: a value that is no positive number refuses the tool, a good one is kept
  await tools.getByLabel('Vorschub (mm/min)', { exact: true }).fill('-5');
  await expect(tools).toContainText('Bitte Name');
  await expect(tools.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  await tools.getByLabel('Vorschub (mm/min)', { exact: true }).fill('900');
  await tools.getByLabel('Bahnabstand (Anteil vom Ø, 0–1)').fill('0,4');
  await tools.getByRole('button', { name: 'Speichern' }).click();
  await expect(tools).toContainText('V-Nut 60°');
  await tools
    .getByRole('row', { name: /V-Nut 60°/ })
    .getByRole('button', { name: 'Ändern' })
    .click();
  await expect(tools.getByLabel('Vorschub (mm/min)', { exact: true })).toHaveValue('900');
  await expect(tools.getByLabel('Bahnabstand (Anteil vom Ø, 0–1)')).toHaveValue('0,4');
  await tools.getByRole('button', { name: 'Abbrechen' }).click();
  await page.reload();
  await goTo(page, 'Werkzeugliste');
  await expect(page.getByTestId('tool-library')).toContainText('V-Nut 60°');
});

test('shares the machine profile as a community file', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Einstellungen');
  await machineSetup(page, 'Maschinenprofil');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportieren' }).click();
  const file = await (await download).path();
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.format).toBe('lowrider-control/profile');
  expect(json.tools).toHaveLength(3);

  json.machine.travel.x.max = 999;
  json.tools.push({ ...json.tools[0], id: 't9', number: 9, name: 'Geteilt' });
  await page.getByTestId('profile-input').setInputFiles({
    name: 'p.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.getByLabel('X max')).toHaveValue('999');
  await page.getByRole('button', { name: /Mitgeliefertes Profil laden/ }).click();
  await expect(page.getByLabel('X max')).toHaveValue('1223');
  await goTo(page, 'Werkzeugliste');
  await expect(page.getByTestId('tool-library')).toContainText('Geteilt');
});

test('guides through the workpiece assistant', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'wechsel.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from(toolChangeJob),
  });
  await connect(page);
  await goTo(page, 'Job');
  // ① the workpiece …
  await page
    .getByTestId('setup-material')
    .getByRole('button', { name: 'Hartholz (Buche, Eiche)' })
    .click();
  // … ③ what holds it …
  await goTo(page, 'Einrichten', 'Nullpunkte');
  const fixtures = page.getByTestId('fixtures');
  // Typing a clamp's measures is the exception: folded until asked for.
  await expect(fixtures.getByLabel('Name')).toBeHidden();
  await fixtures.getByText('Maße von Hand').click();
  await fixtures.getByLabel('Name').fill('Zwinge');
  for (const [label, value] of <[string, string][]>[
    ['X von', '-40'],
    ['X bis', '-20'],
    ['Y von', '-10'],
    ['Y bis', '10'],
    ['Oberkante Z', '15'],
  ])
    await fixtures.getByLabel(label).fill(value);
  await fixtures.getByRole('button', { name: 'Spannmittel hinzufügen' }).click();
  await expect(fixtures).toContainText('Zwinge');
  // … ② what cuts it, with the recommended values marked as such.
  await goTo(page, 'Werkzeuge');
  const tool = page.getByTestId('setup-tool');
  await expect(tool).toContainText('T1 im Job');
  await expect(tool).toContainText('Vorschlag:');
  await expect(tool).toContainText('empfohlen');
  await jobView(page, 'Prüfen');
  const checks = page.getByTestId('assistant-checks');
  await expect(checks).toContainText('G-Code ohne Fehler');
  await expect(checks).toContainText('Liegt im Verfahrweg');
  await expect(checks).not.toContainText('Kollision');
  // The start bar leads to the start once nothing blocks it.
  await jobView(page, 'Vorbereiten');
  await goTo(page, 'Fräsen');
  await expect(page.getByTestId('primary-action')).toContainText('Teil 1/2 starten (T1)');
});

test('picks the firmware images from a release zip without littlefs', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Einstellungen');
  await expert(page);
  const files = [
    'wifi/bootloader.bin',
    'wifi/partitions.bin',
    'wifi/firmware.bin',
    'wifi/littlefs.bin',
    'bt/bootloader.bin',
    'bt/partitions.bin',
    'bt/firmware.bin',
    'common/boot_app0.bin',
  ];
  const zip = zipSync(
    Object.fromEntries(files.map((f) => [`fluidnc-v3.9.5-posix/${f}`, strToU8(f.repeat(100))])),
  );
  await page.getByTestId('firmware-input').setInputFiles({
    name: 'fluidnc-v3.9.5-posix.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zip),
  });
  const images = page.getByTestId('firmware-images');
  await expect(images).toContainText('0x1000');
  await expect(images).toContainText('wifi/firmware.bin');
  await expect(images).not.toContainText('littlefs');
  await expect(page.getByTestId('firmware-card')).toContainText('v3.9.5');
  await page.getByRole('button', { name: 'Bluetooth' }).click();
  await expect(images).toContainText('bt/firmware.bin');
});

test('shows the job in 3D with material removal', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const stage = page.getByTestId('stage-3d');
  await expect(stage.getByTestId('stage-3d-canvas')).toBeVisible();
  await expect(page.getByTestId('stage-canvas')).toBeHidden();
  await expect(stage).toHaveAttribute('data-removed', '0');
  await jobView(page, 'Prüfen');
  await page.getByRole('slider', { name: 'Simulation' }).fill('70');
  await expect
    .poll(async () => Number(await stage.getAttribute('data-removed')), { timeout: 30_000 })
    .toBeGreaterThan(1000);
  // No tap tools in 3D; back on the table they are there again.
  await expect(page.getByTestId('tool-strip')).toHaveCount(0);
  await stageMode(page, 'Tisch').click();
  await expect(page.getByTestId('stage-canvas')).toBeVisible();
  await expect(stageTool(page, 'Hinfahren')).toBeVisible();
});

test('the 3D tool follows the simulation while connected, the machine while it runs', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await connect(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:500.000,500.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  // ④ Prüfen brings the 3D picture (the connection's area is a list without one).
  await jobView(page, 'Prüfen');
  const stage = page.getByTestId('stage-3d');
  const slider = page.getByRole('slider', { name: 'Simulation' });
  await slider.fill('20');
  await expect(stage).not.toHaveAttribute('data-tool', '500.0,500.0,-10.0');
  const early = await stage.getAttribute('data-tool');
  await slider.fill('60');
  await expect(stage).not.toHaveAttribute('data-tool', early!);
  await expect(stage).not.toHaveAttribute('data-tool', '500.0,500.0,-10.0');
  // While the machine runs the job, the tool shows where the machine is.
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Run|MPos:50.000,-3.000,-2.000|FS:1200,0|WCO:0.000,0.000,0.000>';
  });
  await expect(stage).toHaveAttribute('data-tool', '50.0,-3.0,-2.0');
});

test('aligns a job by rotation and restores the original', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await goTo(page, 'Einrichten', 'Ausrichten');
  const align = page.getByTestId('align-card');
  await align.locator('[data-fold-trigger]').first().click();
  await align.getByLabel('Drehung (°, gegen Uhrzeigersinn)').fill('90');
  await align.getByRole('button', { name: 'Ausgerichteten Job laden' }).click();
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('job-summary')).toContainText('demo_ausgerichtet.nc');
  // The demo runs from X −3 … 103; turned by 90° about the zero it lies in Y.
  await expect(page.getByTestId('job-summary')).toContainText('Y −3.0 … 103.0');
  await goTo(page, 'Einrichten', 'Ausrichten');
  await align.locator('[data-fold-trigger]').first().click();
  await align.getByRole('button', { name: /Original wiederherstellen/ }).click();
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('job-summary')).toContainText('demo.nc');
});

test('probes a height grid and levels the job', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await page.evaluate(() => {
    const w = window as unknown as { __status: string; __prb: string[] };
    w.__status = '<Idle|MPos:0.000,0.000,-10.000|FS:0,0|WCO:0.000,0.000,-50.000>';
    // 2 × 2 grid in serpentine order; work Z = machine Z + 50
    w.__prb = ['0,0,-50.000', '0,0,-49.500', '0,0,-49.800', '0,0,-50.200'];
  });
  await connect(page);
  await goTo(page, 'Einrichten', 'Ausrichten');
  const card = page.getByTestId('autolevel-card');
  await card.locator('[data-fold-trigger]').first().click();
  await card.getByLabel('Punkte in X').fill('2');
  await card.getByLabel('Punkte in Y').fill('2');
  await hold(page, /Raster tasten/);
  await expect(page.getByTestId('autolevel-map')).toContainText('0.50');
  await expect(card).toContainText('0,700 mm');
  expect(await sent(page)).toEqual(expect.arrayContaining(['G90 G0 Z3', 'G91 G38.2 Z-8 F100']));
  await card.getByRole('button', { name: 'Auf den Job anwenden' }).click();
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('job-summary')).toContainText('demo_autolevel.nc');
});

async function openCamera(page: Page) {
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  await page.getByTestId('camera-card').getByRole('button', { name: 'Kamera einschalten' }).click();
  const overlay = page.getByTestId('camera-overlay');
  await expect(overlay).toBeVisible();
  await expect.poll(() => overlay.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  return overlay;
}

const near = (line: string | undefined, x: number, y: number) => {
  const m = /X([-\d.]+) Y([-\d.]+)/.exec(line ?? '');
  return !!m && Math.abs(Number(m[1]) - x) < 0.3 && Math.abs(Number(m[2]) - y) < 0.3;
};

test('sets the zero by tapping the camera picture or the table', async ({ page }) => {
  await installFakeFluidNC(page);
  await seedCamera(page, -10);
  await openApp(page);
  await connect(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  const overlay = await openCamera(page);
  await stageTool(page, 'Nullpunkt').click();
  const panel = page.getByTestId('tool-panel');
  // The centre of the picture is the spindle (no offset calibrated yet).
  await overlay.click();
  // Old and new offset stand there before anything is set; setting needs a hold.
  await expect(panel).toContainText(/Maschine: X 0,0 → (99,9|100,[01]) · Y 0,0 → (199,9|200,[01])/);
  await expect(panel.getByTestId('loupe')).toBeVisible();
  await panel.getByRole('button', { name: /Nullpunkt X\/Y setzen/ }).click();
  await page.waitForTimeout(200);
  expect((await sent(page)).some((l) => l.startsWith('G10 L2 P0'))).toBe(false);
  await hold(page, /Nullpunkt X\/Y setzen/);
  await expect
    .poll(async () => (await sent(page)).some((l) => l.startsWith('G10 L2 P0')))
    .toBe(true);
  expect(
    near(
      (await sent(page)).find((l) => l.startsWith('G10 L2 P0')),
      100,
      200,
    ),
  ).toBe(true);

  // Zero at the crosshair – the one way of ③: exactly the spindle plus the (zero) offset.
  await goTo(page, 'Einrichten', 'Nullpunkte');
  const flow = page.getByTestId('zero-flow');
  await hold(page, /Nullpunkt hier setzen \(Fadenkreuz\)/);
  await expect.poll(() => sent(page)).toContain('G10 L2 P0 X100 Y200');
  await flow.getByRole('button', { name: '0,01 mm' }).click();
  await flow.getByRole('button', { name: 'X+' }).click();
  await expect.poll(() => sent(page)).toContain('$J=G91 G21 X0.01 F3000');

  // The same tool on the table: still chosen, a tap there gives a point just the same.
  await stageMode(page, 'Tisch').click();
  await expect(stageTool(page, 'Nullpunkt')).toHaveAttribute('aria-pressed', 'true');
  const zeros = async () => (await sent(page)).filter((l) => l.startsWith('G10 L2 P0')).length;
  const before = await zeros();
  // After the zero the tool has moved on to the edge; back to the corner for another one.
  await expect(panel.getByRole('button', { name: /Kante/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.getByRole('button', { name: /Ecke/ }).click();
  const canvas = (await page.getByTestId('stage-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.2);
  await hold(page, /Nullpunkt X\/Y setzen/);
  await expect.poll(zeros).toBe(before + 1);
});

test('drives to a tapped point on the camera picture and on the table', async ({ page }) => {
  await installFakeFluidNC(page);
  await seedCamera(page, 50);
  await openApp(page);
  await connect(page);
  await homeMachine(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:50.000,50.000,-60.000>';
  });
  const overlay = await openCamera(page);
  const picture = (await overlay.boundingBox())!;
  await overlay.click({ position: { x: picture.width * 0.3, y: picture.height * 0.55 } });
  await expect(stageTool(page, 'Hinfahren')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-panel')).toContainText('X ');
  await hold(page, /^Kamera hierhin/);
  await expect.poll(() => sent(page)).toContain('$J=G53 G90 G21 Z1 F600');
  const xy = (await sent(page)).filter((l) => l.startsWith('$J=G53 G90 G21 X'));
  expect(xy.length).toBe(1);

  // The table: the same tool, tap the middle of the stage, then hold "cutter here".
  await stageMode(page, 'Tisch').click();
  const panel = page.getByTestId('tool-panel');
  await expect(panel).not.toHaveClass(/has-result/);
  const stage = page.getByTestId('stage-canvas');
  await stage.click();
  await expect(panel).toHaveClass(/has-result/);
  await panel.getByRole('checkbox', { name: /sichere Höhe/ }).uncheck();
  await hold(page, /^Fräser hierhin/);
  await expect
    .poll(async () => (await sent(page)).filter((l) => l.startsWith('$J=G53 G90 G21 X')).length)
    .toBe(2);
  await expect(panel).not.toHaveClass(/has-result/);
});

test('moves with the joystick and stops on release', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  await openCamera(page);
  // The joystick comes onto the stage when asked for, and goes again.
  const stick = page.getByTestId('jogstick');
  await expect(stick).toHaveCount(0);
  await stageTool(page, 'Joystick').click();
  const box = (await stick.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 4 });
  await expect
    .poll(async () => (await sent(page)).filter((l) => l.startsWith('$J=G91 G21 X')).length)
    .toBeGreaterThan(1);
  // Full deflection right, not homed: 3000 mm/min for 0.1 s = 5 mm per step.
  // (The knob already moves on touch, so the first steps may be smaller.)
  await expect.poll(() => sent(page)).toContain('$J=G91 G21 X5 Y0 F3000');
  await page.mouse.up();
  await expect.poll(() => sent(page)).toContain('0x85');
  // It stays for the table view and lies on nothing else there.
  await stageMode(page, 'Tisch').click();
  await expect(stick).toBeVisible();
  await stageTool(page, 'Joystick').click();
  await expect(stick).toHaveCount(0);
});

test('measures an edge on the camera picture and aligns the job to it', async ({ page }) => {
  await installFakeFluidNC(page);
  await seedCamera(page, -10);
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await connect(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  const overlay = await openCamera(page);
  // The edge is the second step of the zero tool.
  await stageTool(page, 'Nullpunkt').click();
  await page.getByTestId('tool-panel').getByRole('button', { name: /Kante/ }).click();
  // Tap two spots the picture really shows: inset and result panel lie on top of it
  // and their size depends on the fonts (the CI runner's differ).
  const freeSpots = () =>
    overlay.evaluate((canvas) => {
      const r = canvas.getBoundingClientRect();
      const free: { x: number; y: number }[] = [];
      for (let fy = 0.15; fy <= 0.85; fy += 0.05) {
        for (let fx = 0.1; fx <= 0.9; fx += 0.05) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (document.elementFromPoint(x, y) === canvas)
            free.push({ x: x - r.left, y: y - r.top });
        }
      }
      return free;
    });
  const a = (await freeSpots())[0]!;
  await overlay.click({ position: a });
  const result = page.getByTestId('tool-panel');
  await expect(result).toContainText('Zweiten Punkt');
  // The second spot: the free one farthest from the first, once the panel has come to rest.
  await result.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const b = (await freeSpots()).reduce((best, p) =>
    Math.hypot(p.x - a.x, p.y - a.y) > Math.hypot(best.x - a.x, best.y - a.y) ? p : best,
  );
  await overlay.click({ position: b });
  await expect(page.getByTestId('tool-panel')).toContainText('°');
  await page.getByRole('button', { name: 'Job danach ausrichten' }).click();
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('job-summary')).toContainText('demo_ausgerichtet.nc');
});

test('shows spindle load and regulates the feed from companion sensors', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.getByLabel('Adresse des Companion').fill('pi.local');
  await page.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as unknown as { __sensorSocket?: unknown }).__sensorSocket),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Run|MPos:10.000,10.000,-2.000|FS:1000,18000|Ov:100,100,100>';
  });
  const push = (data: object) =>
    page.evaluate((d) => {
      const s = (window as unknown as { __sensorSocket: { onmessage(e: { data: string }): void } })
        .__sensorSocket;
      s.onmessage({ data: JSON.stringify(d) });
    }, data);
  await goTo(page, 'Fräsen');
  await push({
    at: 1,
    load: 92,
    rpm: 18000,
    chatter: true,
    chatterFrequency: 870,
    vibration: 1,
    source: 'simulator',
  });
  const panel = page.getByTestId('sensor-panel');
  await expect(panel).toContainText('Spindellast 92 %');
  await expect(page.getByTestId('chatter')).toContainText('870 Hz');
  await panel.getByRole('checkbox', { name: /Vorschub nach Last regeln/ }).check();
  await page.waitForTimeout(600);
  await push({
    at: 2,
    load: 30,
    rpm: 18000,
    chatter: false,
    chatterFrequency: 0,
    vibration: 0.1,
    source: 'simulator',
  });
  await expect.poll(() => sent(page)).toContain('0x93');
});

test('switches the interface to English and back', async ({ page }) => {
  await openApp(page);
  await machineSetup(page, 'Werkstatt und Benachrichtigungen');
  await page.getByRole('button', { name: 'English' }).click();
  const english = ['Job', 'CAM', 'Set up', 'Cut', 'Service', 'Settings'];
  expect(await stepNames(page).allTextContents()).toEqual(english);
  await expect(page.getByRole('button', { name: 'E-STOP' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PAUSE' })).toBeVisible();
  await page.reload();
  expect(await stepNames(page).allTextContents()).toEqual(english);
  await expect(page.getByTestId('next-card')).toContainText('Up next');
  await page.getByTestId('step-settings').click();
  await page.getByRole('button', { name: 'Machine', exact: true }).click();
  await page
    .locator('.section[data-fold]')
    .filter({ hasText: 'Workshop and notifications' })
    .locator('[data-fold-trigger]')
    .first()
    .click();
  await page.getByRole('button', { name: 'Deutsch' }).click();
  expect(await stepNames(page).allTextContents()).toEqual([
    'Job',
    'CAM',
    'Einrichten',
    'Fräsen',
    'Service',
    'Einstellungen',
  ]);
});

test('Darstellung: a light theme beside the dark one, remembered, and the stage picture follows', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  const html = page.locator('html');
  const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const stageGround = () =>
    page
      .getByTestId('stage-canvas')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--stage-bg').trim());
  /** How light the middle of the table picture is drawn (0…255). */
  const painted = () =>
    page.getByTestId('stage-canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(4, c.height - 4, 1, 1).data;
      return (d[0]! + d[1]! + d[2]!) / 3;
    });
  // Dark is the default.
  await expect(html).toHaveClass(/dark/);
  expect(await ground()).toBe('rgb(15, 17, 21)');
  expect(await stageGround()).toBe('#12151b');
  await expect.poll(painted).toBeLessThan(60);

  await goTo(page, 'Einstellungen', 'Maschine');
  const look = page.getByTestId('appearance');
  await expect(look.getByRole('button', { name: 'Dunkel' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await look.getByRole('button', { name: 'Hell' }).click();
  await expect(html).not.toHaveClass(/dark/);
  expect(await ground()).toBe('rgb(244, 245, 247)');
  // The place stays, and so do PAUSE and NOT-HALT.
  await expect(look.getByRole('button', { name: 'Hell' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'PAUSE' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeVisible();
  // The stage reads its colours anew: the picture is drawn on a light ground.
  await goTo(page, 'Job');
  expect(['#fff', '#ffffff']).toContain(await stageGround());
  await expect.poll(painted).toBeGreaterThan(200);

  // Remembered over a reload – and light from the first picture on.
  await page.reload();
  await expect(html).not.toHaveClass(/dark/);
  expect(await ground()).toBe('rgb(244, 245, 247)');
  await goTo(page, 'Einstellungen', 'Maschine');
  await page.getByTestId('appearance').getByRole('button', { name: 'Dunkel' }).click();
  await expect(html).toHaveClass(/dark/);
  expect(await ground()).toBe('rgb(15, 17, 21)');
});

test('runs a job block by block in single step', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>';
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'schritt.nc',
    mimeType: 'text/plain',
    buffer: Buffer.from('G21 G90\nG0 X1 Y1 Z5\nG0 X2\nM30\n'),
  });
  await connect(page);
  await streamPanel(page);
  await page
    .getByTestId('run-card')
    .getByRole('button', { name: /Einzelschritt/ })
    .click();
  await hold(page, /Programm starten/, 1300);
  const step = page.getByTestId('single-step');
  await expect(step).toContainText('Zeile 1');
  expect(await sent(page)).not.toContain('G21G90');
  // "Großbild" puts the panel away – the block still waits for a tap, under the picture, in reach
  await page.getByTestId('stage-wide').click();
  await expect(page.locator('.panel-body')).toHaveCount(0);
  const next = step.getByRole('button', { name: /Nächster Satz/ });
  const reach = await inReach(page, next, page.locator('.stage-prompt'));
  expect(reach.inside, JSON.stringify(reach)).toBe(true);
  expect(reach.reached, JSON.stringify(reach)).toBe(true);
  await next.click();
  await expect(step).toContainText('Zeile 2');
  expect(await sent(page)).toContain('G21G90');
  await page.getByTestId('stage-wide').click();
  await expect(step).toBeVisible();
  await step.getByRole('button', { name: /Nächster Satz/ }).click();
  await expect(step).toContainText('Zeile 3');
  expect(await sent(page)).not.toContain('G0X2');
  await step.getByRole('button', { name: 'Einzelschritt aus' }).click();
  await expect.poll(() => sent(page)).toEqual(expect.arrayContaining(['G0X2', 'M30']));
});

test('probes a wooden corner through an XYZ corner plate', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.evaluate(() => {
    (window as unknown as { __prb: string[] }).__prb = [
      '100.000,200.000,-40.000',
      '91.000,200.000,-48.000',
      '108.000,191.000,-48.000',
    ];
  });
  await goTo(page, 'Einrichten', 'Antasten');
  await page.getByTestId('probe-tiles').getByRole('button', { name: /^Ecke/ }).click();
  const wizard = page.getByTestId('probe-wizard');
  await wizard.getByRole('button', { name: 'Ecken-Tastplatte' }).click();
  await expect(wizard).toContainText('Maße der Tastplatte');
  await expect(wizard.getByRole('button', { name: /Tastzyklus starten/ })).toBeDisabled();
  await wizard.getByLabel('Plattendicke oben (mm)').fill('5');
  await wizard.getByLabel('Wandstärke seitlich (mm)').fill('4');
  await hold(page, /Tastzyklus starten/);
  await page
    .getByTestId('probe-result')
    .getByRole('button', { name: 'Nullpunkt übernehmen' })
    .click();
  // Tool Ø 8 (T1): edge = contact + 4 (radius) + 4 (wall); top 5 mm → Z −45
  await expect.poll(() => sent(page)).toContain('G10 L2 P0 X99 Y199 Z-45');
});

test('keeps the camera at the height its scale was calibrated for', async ({ page }) => {
  await installFakeFluidNC(page);
  // Scale measured, but the camera height not taken over yet.
  await seedCamera(page, null);
  await openApp(page);
  await connect(page);
  await homeMachine(page);
  const setZ = (machineZ: number) =>
    page.evaluate((z) => {
      (window as unknown as { __status: string }).__status =
        `<Idle|MPos:100.000,200.000,${z.toFixed(3)}|FS:0,0|WCO:0.000,0.000,-60.000>`;
    }, machineZ);
  await setZ(-10);
  await openCamera(page);
  // The camera height is set once, under Maschine → Einrichtung.
  const setup = await machineSetup(page, 'Kamera einrichten');
  await expect(setup.getByTestId('camera-focus')).toContainText('Noch nicht kalibriert');
  // Work Z = machine Z + 60 = 50
  const take = setup.getByRole('button', { name: 'Aktuelle Höhe übernehmen' });
  await take.click();
  await expect(setup.getByTestId('camera-focus')).toContainText('Maßstab gilt bei Z 50.00');
  // The button stays inside its card (it used to overflow at tablet width).
  const cardBox = (await page.getByTestId('camera-setup').boundingBox())!;
  const takeBox = (await take.boundingBox())!;
  expect(takeBox.x + takeBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  await expect(page.getByTestId('focus-warning')).toHaveCount(0);

  // Fahren → Kamera keeps one line of it, with the way back to the setup.
  await goTo(page, 'Einrichten');
  const status = page.getByTestId('camera-status');
  await expect(status).toContainText('Gerätekamera · Kamerahöhe Z 50,0');
  await status.getByRole('button', { name: 'ändern' }).click();
  await expect(setup).toBeVisible();
  await expect(setup.getByTestId('camera-focus')).toBeVisible();

  await setZ(-40);
  const warning = page.getByTestId('focus-warning');
  await expect(warning).toContainText('30,0 mm daneben');
  const button = warning.getByRole('button', { name: 'Auf Kamerahöhe fahren' });
  await expect(button).toBeEnabled();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  await expect.poll(() => sent(page)).toContain('$J=G53 G90 G21 Z-10 F600');
});

test('builds a photo map: no scan uncalibrated, pictures under the table view, drives to a tap', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installFakeFluidNC(page);
  // The scan lays each picture down where the status report says the machine stands.
  await followMoves(page);
  await openApp(page);
  await connect(page);
  await homeMachine(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,-60.000>';
  });
  await openCamera(page);
  // Not calibrated: one thing to do, said once – no scan, no disabled controls.
  const cta = page.getByTestId('camera-setup-cta');
  await expect(cta).toContainText('noch nicht eingerichtet');
  await expect(cta).toContainText('Maßstab');
  await expect(cta).toContainText('Versatz');
  await expect(page.getByTestId('photo-map-panel')).toHaveCount(0);
  await expect(page.getByTestId('hole-panel')).toHaveCount(0);
  await expect(page.getByTestId('camera-card').getByRole('button')).toHaveText([
    'Kamera einrichten',
  ]);
  // The picture cannot give points yet either: the tool row says so instead of offering tools.
  await expect(page.getByTestId('stage-setup-cta')).toContainText('noch nicht eingerichtet');
  await expect(stageTool(page, 'Hinfahren')).toHaveCount(0);

  // The call to action leads to the setup. A camera height alone is not enough there:
  // the default scale would misplace pictures.
  await cta.getByRole('button', { name: 'Kamera einrichten' }).click();
  const setup = page.getByTestId('camera-setup');
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: 'Aktuelle Höhe übernehmen' }).click();
  await goTo(page, 'Einrichten');
  await expect(cta).toBeVisible();
  await stageMode(page, 'Tisch').click();
  await expect(page.getByTestId('table-view')).toHaveAttribute('data-photos', '0');

  // Scale measured (stands in for the tap steps): resting at camera height (work Z 50)
  // lays the picture onto the map.
  await page.evaluate(() => {
    const key = 'lowrider-control.settings';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
    stored.camera = { ...stored.camera, scaleCalibrated: true };
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload();
  await connect(page);
  await homeMachine(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,-60.000>';
  });
  await openCamera(page);
  await expect(cta).toHaveCount(0);
  // Scanning is an occasional thing: folded until opened.
  const panel = page.getByTestId('photo-map-panel');
  await expect(panel).toBeHidden();
  await openSection(page, 'Fläche scannen');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('photo-map-notice')).toHaveCount(0);
  await expect(panel).toContainText('Bilder auf der Karte: 1', { timeout: 5000 });

  // The picture lies under the table view, where a tap gives a target to drive to.
  await stageMode(page, 'Tisch').click();
  await expect(page.getByTestId('table-view')).toHaveAttribute('data-photos', '1');
  const table = page.getByTestId('stage-canvas');
  const tableBox = (await table.boundingBox())!;
  await table.click({ position: { x: tableBox.width * 0.3, y: tableBox.height * 0.4 } });
  await expect(page.getByTestId('tool-panel')).toContainText('X ');
  await hold(page, /^Fräser hierhin/);
  await expect
    .poll(async () => (await sent(page)).filter((l) => l.startsWith('$J=G53 G90 G21 X')).length)
    .toBe(1);

  // Scan a strip along X (no Y axis yet): Y from = Y to.
  await panel.getByLabel('X von (mm)').fill('80');
  await panel.getByLabel('X bis (mm)').fill('220');
  await panel.getByLabel('Y von (mm)').fill('200');
  await panel.getByLabel('Y bis (mm)').fill('200');
  await expect(page.getByTestId('scan-estimate')).toContainText('Bilder, etwa');
  const count = Number(
    /(\d+) Bilder/.exec(await page.getByTestId('scan-estimate').innerText())![1],
  );
  expect(count).toBeGreaterThan(1);
  await hold(page, /Fläche scannen/);
  await expect(page.getByTestId('scan-progress')).toBeVisible();
  await expect(panel).toContainText(`Bilder auf der Karte: ${count + 1}`, { timeout: 30_000 });
  await expect(page.getByTestId('scan-progress')).toHaveCount(0);
  await expect(page.getByTestId('table-view')).toHaveAttribute('data-photos', String(count + 1));
  const moves = (await sent(page)).filter((l) => l.startsWith('G90 G53 G1 X'));
  expect(moves).toHaveLength(count);
  // A strip: every picture at the same Y, X rising.
  expect(moves.every((l) => / Y200 /.test(l))).toBe(true);

  await panel.getByRole('button', { name: 'Karte leeren' }).click();
  await expect(panel).toContainText('Noch keine Bilder');
  await expect(page.getByTestId('table-view')).toHaveAttribute('data-photos', '0');
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText(`Scan fertig: ${count} Bilder`);
});

test('one inset swaps table and camera: the overview on the picture, the picture on the table', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,-60.000>';
  });
  // Without a camera the table has no inset.
  await expect(page.getByTestId('live-inset')).toHaveCount(0);
  await openCamera(page);
  const mini = page.getByRole('button', { name: 'Übersicht – antippen für den Tisch' });
  await expect(mini).toBeVisible();
  await expect(page.getByTestId('live-inset')).toHaveCount(0);
  const box = (await mini.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
  // Something is drawn: the machine table at least.
  await expect
    .poll(() =>
      page.getByTestId('camera-mini').evaluate((b) => {
        const c = b.querySelector('canvas')!;
        const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        return data.some((v, i) => i % 4 === 3 && v > 0);
      }),
    )
    .toBe(true);
  // The overview leads to the table …
  await mini.click();
  await expect(page.getByTestId('table-view')).toBeVisible();
  await expect(page.getByTestId('camera-mini')).toHaveCount(0);
  await expect(stageMode(page, 'Tisch')).toHaveAttribute('aria-pressed', 'true');
  // … where the live picture sits small in the corner and leads back.
  const live = page.getByRole('button', {
    name: 'Kamerabild – antippen für die große Ansicht',
  });
  await expect(live).toBeVisible();
  await expect(live.locator('video')).toBeVisible();
  const liveBox = (await live.boundingBox())!;
  expect(Math.min(liveBox.width, liveBox.height)).toBeGreaterThanOrEqual(48);
  // The inset keeps clear of the tool row and of the hint along the lower edge.
  const strip = (await page.getByTestId('tool-strip').boundingBox())!;
  const hint = (await page.getByTestId('tool-panel').boundingBox())!;
  expect(liveBox.y).toBeGreaterThanOrEqual(strip.y + strip.height);
  expect(liveBox.y + liveBox.height).toBeLessThanOrEqual(hint.y);
  await live.click();
  await expect(page.getByTestId('camera-overlay')).toBeVisible();
  await expect(page.getByTestId('live-inset')).toHaveCount(0);
  await expect(stageMode(page, 'Kamera')).toHaveAttribute('aria-pressed', 'true');
  await expect(mini).toBeVisible();
});

test('finds the companion that serves the app and takes its camera', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        version: '0.1.0',
        fluidnc: null,
        sensors: 'push',
        camera: ':8081/stream',
      }),
    }),
  );
  await openApp(page);
  const setup = await machineSetup(page, 'Kamera einrichten');
  await expect(setup.getByLabel('Stream-Adresse (MJPEG) am Companion')).toHaveValue(
    'http://localhost:8081/stream',
  );
  // The stream is on offer in the setup, and "Kamera einschalten" takes it by itself.
  await expect(setup.getByRole('button', { name: 'Companion-Stream' })).toBeEnabled();
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  await page.getByTestId('camera-card').getByRole('button', { name: 'Kamera einschalten' }).click();
  await machineSetup(page, 'Kamera einrichten');
  await expect(setup.getByRole('button', { name: 'Companion-Stream' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('records the tool camera on the companion: start, stop, watch, delete', async ({ page }) => {
  const started: unknown[] = [];
  let stopped = 0;
  let deleted = '';
  const done = {
    id: 'rec-1',
    jobName: 'schild.nc',
    mode: 'both',
    intervalSeconds: 5,
    safeHeightOnly: false,
    startedAt: Date.now() - 3_600_000,
    endedAt: Date.now() - 1_800_000,
    state: 'done',
    stopReason: 'idle',
    frames: 360,
    video: { name: 'video.mp4', size: 900_000_000 },
    timelapse: { name: 'timelapse.mp4', size: 12_000_000 },
    error: null,
  };
  let active: object | null = null;
  await page.route('**/api/health', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        version: '0.1.0',
        fluidnc: null,
        sensors: 'push',
        recordings: true,
      }),
    }),
  );
  await page.route('**/api/recordings', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        capabilities: { ffmpeg: true, hwEncoder: true, observe: false },
        active,
        recordings: deleted ? [] : active ? [active, done] : [done],
      }),
    }),
  );
  await page.route('**/api/recordings/start', async (route) => {
    started.push(route.request().postDataJSON());
    active = {
      ...done,
      id: 'rec-2',
      state: 'recording',
      endedAt: null,
      startedAt: Date.now(),
      frames: 3,
      video: null,
      timelapse: null,
      stopReason: null,
    };
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(active),
    });
  });
  await page.route('**/api/recordings/stop', async (route) => {
    stopped++;
    const was = active;
    active = null;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(was) });
  });
  await page.route('**/api/recordings/rec-1', async (route) => {
    if (route.request().method() === 'DELETE') deleted = 'rec-1';
    await route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/recordings/rec-1/file**', (route) =>
    route.fulfill({ contentType: 'video/mp4', body: '' }),
  );
  await openApp(page);
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  const panel = page.getByTestId('recording-panel');
  // The recording is folded away until it is wanted.
  await expect(panel).toBeHidden();
  await openSection(page, 'Mitschnitt');
  await expect(
    panel.getByRole('checkbox', { name: 'Bei jedem Job automatisch aufnehmen' }),
  ).not.toBeChecked();
  await panel.getByRole('checkbox', { name: 'Bei jedem Job automatisch aufnehmen' }).check();
  await panel.getByRole('button', { name: 'Beides' }).click();
  await panel.getByLabel('Zeitraffer: Bild alle … Sekunden').fill('10');
  // Safe height needs the machine seen through the companion.
  await expect(panel.getByRole('checkbox', { name: /nur auf Sicherheitshöhe/ })).toBeDisabled();
  await expect(panel).toContainText('über den Companion verbunden');
  await expect(panel).toContainText('1–2 GB pro Stunde');

  await panel.getByRole('button', { name: 'Jetzt aufnehmen' }).click();
  await expect(page.getByTestId('recording-active')).toContainText('Beides, 3 Bilder');
  expect(started).toEqual([
    { mode: 'both', intervalSeconds: 10, jobName: '', safeHeightOnly: false, safeZ: null },
  ]);
  await panel.getByRole('button', { name: 'Aufnahme beenden' }).click();
  await expect(page.getByTestId('recording-active')).toHaveCount(0);
  expect(stopped).toBe(1);

  const item = page.getByTestId('recording-item');
  await expect(item).toContainText('schild.nc');
  await expect(item).toContainText('Job-Ende erkannt');
  await item.getByRole('button', { name: /Zeitraffer ansehen \(12,0 MB\)/ }).click();
  await expect(page.getByTestId('recording-video')).toHaveAttribute(
    'src',
    /\/api\/recordings\/rec-1\/file\?kind=timelapse$/,
  );
  await expect(item.getByRole('link', { name: 'Herunterladen' })).toHaveAttribute(
    'href',
    /kind=timelapse&download=1$/,
  );
  await hold(page, /^Löschen \(halten\)/);
  await expect(panel).toContainText('Noch keine Aufnahmen');
  expect(deleted).toBe('rec-1');
});

test('without a companion the browser timelapse stands in for the recording', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  const panel = page.getByTestId('recording-panel');
  await openSection(page, 'Mitschnitt');
  await expect(page.getByTestId('recording-unavailable')).toContainText('Ohne Companion');
  await expect(
    panel.getByRole('checkbox', { name: 'Zeitraffer im Browser bei jedem Job' }),
  ).toBeVisible();
});

test('shuts the Pi down and says when it is safe to unplug', async ({ page }) => {
  let alive = true;
  let requests = 0;
  await page.clock.install();
  await page.route('**/api/health', (route) =>
    alive
      ? route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            version: '0.1.0',
            fluidnc: null,
            sensors: 'push',
            shutdown: true,
            shutdownError: null,
          }),
        })
      : route.abort('connectionrefused'),
  );
  await page.route('**/api/system/shutdown', (route) => {
    requests++;
    return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await openApp(page);
  await goTo(page, 'Einstellungen');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Verbindung', exact: true })
    .click();
  const panel = page.getByTestId('pi-shutdown');
  await expect(panel).toContainText('Vor dem Ausstecken');
  // A tap is not enough: shutting down needs the hold.
  await panel.getByRole('button', { name: /Pi herunterfahren/ }).click();
  expect(requests).toBe(0);
  await hold(page, /Pi herunterfahren/);
  await expect(panel).toContainText('noch nicht ausstecken');
  expect(requests).toBe(1);
  await expect(panel.getByRole('button', { name: /Pi herunterfahren/ })).toHaveCount(0);
  alive = false;
  await page.clock.runFor(3000);
  await expect(panel).toContainText(/noch \d+ s/);
  await page.clock.runFor(16_000);
  await expect(panel.locator('[data-slot="alert"]')).toContainText('Stecker jetzt ziehen');
  await panel.getByRole('button', { name: 'Pi läuft wieder' }).click();
  await expect(panel.getByRole('button', { name: /Pi herunterfahren/ })).toBeVisible();
});

test('says why the Pi did not shut down', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        version: '0.1.0',
        fluidnc: null,
        sensors: 'push',
        shutdown: true,
      }),
    }),
  );
  await page.route('**/api/system/shutdown', (route) =>
    route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: '{"error":"not-supported"}',
    }),
  );
  await openApp(page);
  await goTo(page, 'Einstellungen');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Verbindung', exact: true })
    .click();
  await hold(page, /Pi herunterfahren/);
  await expect(page.getByTestId('pi-shutdown').getByRole('alert')).toContainText(
    'setup.sh einspielen',
  );
});

test('a hold forgives a slipping finger but not letting go', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await openJog(page);
  const button = page.getByRole('button', { name: /Referenzfahrt/ }).first();
  await expect(button).toBeEnabled();
  const homes = async () => (await sent(page)).filter((l) => l === '$H').length;
  const press = async () => {
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    return box;
  };
  const bar = () => button.evaluate((b) => b.style.getPropertyValue('--hold'));

  // Let go halfway: the bar runs back, nothing is sent.
  await press();
  await page.waitForTimeout(400);
  expect(Number(await bar())).toBeGreaterThan(0.2);
  await page.mouse.up();
  await expect.poll(bar).toBe('0');
  expect(await homes()).toBe(0);

  // Sliding well off the button cancels as well.
  let box = await press();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60, { steps: 3 });
  await page.waitForTimeout(1000);
  await page.mouse.up();
  expect(await homes()).toBe(0);

  // A few pixels past the edge still counts as holding.
  box = await press();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 6, { steps: 2 });
  await page.waitForTimeout(1000);
  await page.mouse.up();
  await expect.poll(homes).toBe(1);
});

test('the joystick knob follows from the first touch and springs home', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await openCamera(page);
  await stageTool(page, 'Joystick').click();
  const stick = page.getByTestId('jogstick');
  const knob = stick.locator('.jogstick-knob');
  const box = (await stick.boundingBox())!;
  const offset = () => knob.evaluate((k) => new DOMMatrix(getComputedStyle(k).transform).m41);
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2);
  await page.mouse.down();
  expect(await offset()).toBeCloseTo(40, 0);
  await expect(stick).toHaveClass(/live/);
  await page.mouse.up();
  await expect(stick).not.toHaveClass(/live/);
  await expect.poll(offset).toBeCloseTo(0, 0);
});

interface Rig {
  /** mm per commanded mm, lean of Y towards +X (degrees), play of X, tilt of Z (mm per mm) */
  kx: number;
  ky: number;
  gamma: number;
  playX: number;
  tiltZ: number;
  /** Spindle position at start */
  start: { x: number; y: number };
  /** Draw the dot plate (dots every 10 mm, lying 0.4° askew at (100, 200)) */
  plate: boolean;
  /** Real offset of the camera from the spindle, mm */
  offset: { x: number; y: number };
  /** Camera offset the app believes at start */
  believedOffset: { x: number; y: number };
}

/**
 * A LowRider with known errors under a camera: X travels 0.2 % too far, Y
 * 0.2 % too short, the Y motion leans 0.1° towards +X, X has 0.06 mm of play
 * and Z leans 0.2 mm per 100 mm towards +X.
 */
const ERRORS_RIG: Rig = {
  kx: 1.002,
  ky: 0.998,
  gamma: 0.1,
  playX: 0.06,
  tiltZ: 0.002,
  start: { x: 99.85, y: 200.6 },
  plate: true,
  offset: { x: 0, y: 0 },
  believedOffset: { x: 0, y: 0 },
};

/**
 * The machine is simulated in the page: G53 G1 moves update MPos, and a
 * canvas stream shows what a camera 20 px/mm over the scene would see. More
 * dots (holes, marks) are added through `window.__dots` (physical XY, radius).
 * `window.__spindle(x, y)` puts the spindle somewhere, like jogging.
 */
async function installCalibrationRig(page: Page, rig: Rig = ERRORS_RIG) {
  await page.addInitScript((rig: Rig) => {
    const w = window as unknown as Record<string, unknown>;
    const g = (rig.gamma * Math.PI) / 180;
    const mpos = { x: rig.start.x, y: rig.start.y, z: -10 };
    let lastX = 1;
    const status = () =>
      `<Idle|MPos:${mpos.x.toFixed(3)},${mpos.y.toFixed(3)},${mpos.z.toFixed(3)}|FS:0,0|WCO:0.000,0.000,0.000>`;
    w.__status = status();
    // Physical spindle position for the commanded machine position.
    const physical = () => ({
      x:
        rig.kx * mpos.x +
        rig.ky * Math.sin(g) * mpos.y -
        (lastX < 0 ? rig.playX : 0) +
        rig.tiltZ * mpos.z,
      y: rig.ky * Math.cos(g) * mpos.y,
    });
    w.__physical = physical;
    w.__spindle = (x: number, y: number) => {
      mpos.x = x;
      mpos.y = y;
      w.__status = status();
    };
    const dots: { x: number; y: number; r: number }[] = [];
    w.__dots = dots;
    if (rig.plate) {
      const r = (0.4 * Math.PI) / 180;
      for (let i = -2; i <= 22; i++) {
        for (let j = -2; j <= 22; j++) {
          dots.push({
            x: 100 + Math.cos(r) * i * 10 - Math.sin(r) * j * 10,
            y: 200 + Math.sin(r) * i * 10 + Math.cos(r) * j * 10,
            r: 1.5,
          });
        }
      }
    }
    const Socket = w.WebSocket as { prototype: { send(data: unknown): void } };
    const send = Socket.prototype.send;
    Socket.prototype.send = function (data: unknown) {
      const m = typeof data === 'string' ? /^G90 G53 G1 (.*) F/.exec(data.trim()) : null;
      if (m) {
        for (const [, axis, value] of m[1]!.matchAll(/([XYZ])(-?[\d.]+)/g)) {
          const key = axis!.toLowerCase() as 'x' | 'y' | 'z';
          const v = Number(value);
          if (key === 'x' && v !== mpos.x) lastX = Math.sign(v - mpos.x);
          mpos[key] = v;
        }
        w.__status = status();
      }
      return send.call(this, data);
    };
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      const p = physical();
      const cam = { x: p.x + rig.offset.x, y: p.y + rig.offset.y };
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#111';
      for (const d of dots) {
        const u = 320 + (d.x - cam.x) * 20;
        const v = 240 - (d.y - cam.y) * 20;
        if (u < -200 || u > 840 || v < -200 || v > 680) continue;
        ctx.beginPath();
        ctx.arc(u, v, d.r * 20, 0, 2 * Math.PI);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
    // A camera calibrated roughly (really 20 px/mm), short settling for the test.
    localStorage.setItem(
      'lowrider-control.settings',
      JSON.stringify({
        camera: {
          offsetX: rig.believedOffset.x,
          offsetY: rig.believedOffset.y,
          pxPerMm: 18,
          rotation: 0,
          streamUrl: '',
          scaleCalibrated: true,
          focusHeight: -10,
        },
        calibration: { spanX: 100, spanY: 100, points: 3, settleMs: 120 },
      }),
    );
    w.__config = [
      'name: LowRider',
      'axes:',
      '  x:',
      '    steps_per_mm: 50.000',
      '  y:',
      '    steps_per_mm: 50.000',
      '    homing:',
      '      positive_direction: false',
      '    motor0:',
      '      pulloff_mm: 4.000',
      '    motor1:',
      '      pulloff_mm: 4.000',
    ].join('\n');
  }, rig);
}

/** A signed number from the result, e.g. "+0,200" → 0.2 */
const reading = (text: string, pattern: RegExp) => {
  const m = pattern.exec(text);
  return m ? Number(m[1]!.replace('−', '-').replace('±', '').replace(',', '.')) : NaN;
};

test('measures scale, squareness, play and Z tilt with the camera and corrects them', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installFakeFluidNC(page);
  await installCalibrationRig(page);
  await openApp(page);
  await connect(page);
  await openCamera(page);
  await goTo(page, 'Einstellungen');
  await machineSetup(page, 'Kalibrieren');
  const wizard = page.getByTestId('calibration');
  await expect(page.getByTestId('calibration-live')).toContainText('Marke erkannt');

  // The move to the plate may still be running on a slow machine: measuring needs Idle.
  await expect(page.getByTestId('machine-state')).toContainText('Bereit', { timeout: 60_000 });
  await hold(page, /Raster messen/);
  const result = page.getByTestId('calibration-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const text = await result.innerText();
  // The simulated stream is compressed video: a few µm of noise, like a real camera.
  const near = (value: number, expected: number, within: number) =>
    expect(Math.abs(value - expected)).toBeLessThan(within);
  near(reading(text, /Maßstab X\s+([+−±][\d,]+) %/), 0.2, 0.015);
  near(reading(text, /Maßstab Y\s+([+−±][\d,]+) %/), -0.2, 0.015);
  near(reading(text, /Winkel X zu Y\s+([\d,]+)°/), 89.9, 0.01);

  await hold(page, /Umkehrspiel messen/);
  await expect(result).toContainText('Umkehrspiel', { timeout: 30_000 });
  expect(reading(await result.innerText(), /Umkehrspiel\s+X ([\d,]+) mm/)).toBeCloseTo(0.06, 1);

  await hold(page, /Z-Schiefe messen/);
  await expect(result).toContainText('Z-Schiefe', { timeout: 30_000 });
  expect(reading(await result.innerText(), /\(([\d,]+) mm auf 100 mm\)/)).toBeCloseTo(0.2, 1);
  await expect(wizard).toContainText('Z steht schief');

  // Corrections: steps/mm from the scale, the Y pull-offs from the angle.
  await wizard.getByLabel('Abstand der Y-Schienen (mm)').fill('1000');
  await wizard.getByRole('button', { name: 'Motor 1 rechts (X+)' }).click();
  const corrections = page.getByTestId('calibration-corrections');
  await expect(corrections).toContainText('axes/x/steps_per_mm');
  await expect(corrections).toContainText('axes/y/motor1/pulloff_mm');
  await hold(page, /Korrektur in config.yaml schreiben/);
  const value = (lines: string[], path: string) =>
    Number(lines.find((l) => l.startsWith(`$/${path}=`))?.split('=')[1]);
  await expect.poll(async () => value(await sent(page), 'axes/x/steps_per_mm')).toBeGreaterThan(0);
  const lines = await sent(page);
  expect(lines.some((l) => /^\$CD=config-backup-/.test(l))).toBe(true);
  near(value(lines, 'axes/x/steps_per_mm'), 50 / 1.002, 0.01);
  near(value(lines, 'axes/y/steps_per_mm'), 50 / 0.998, 0.01);
  const pull = (n: number) => value(lines, `axes/y/motor${n}/pulloff_mm`);
  // 0.1° over 1000 mm: the X+ side (motor 1) comes back 1.75 mm.
  expect(pull(1) - pull(0)).toBeCloseTo(-1.75, 1);
  await expect(wizard).toContainText('Steuerung neu starten');
});

test('finds holes by itself: camera offset, zero on a hole, zero and rotation from two', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // A perfect machine; the camera really sits 40 mm right and 25 mm in front of the spindle.
  const offset = { x: 40, y: -25 };
  await installFakeFluidNC(page);
  await installCalibrationRig(page, {
    kx: 1,
    ky: 1,
    gamma: 0,
    playX: 0,
    tiltZ: 0,
    start: { x: 200, y: 300 },
    plate: false,
    offset,
    believedOffset: { x: 0, y: 0 },
  });
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await connect(page);
  await openCamera(page);
  const card = page.getByTestId('camera-card');
  const spindle = (x: number, y: number) =>
    page.evaluate(
      ([x, y]) =>
        (window as unknown as { __spindle(x: number, y: number): void }).__spindle(x!, y!),
      [x, y],
    );
  const addDot = (x: number, y: number, r: number) =>
    page.evaluate(
      ([x, y, r]) => (window as unknown as { __dots: object[] }).__dots.push({ x, y, r }),
      [x, y, r],
    );

  // 1. Camera offset: the tool makes a 1.2 mm mark where it stands, the camera finds it.
  await machineSetup(page, 'Kamera einrichten');
  const setup = page.getByTestId('camera-setup');
  await setup.getByRole('button', { name: 'Versatz' }).click();
  await setup.getByRole('button', { name: 'Position der Markierung merken' }).click();
  await addDot(200, 300, 0.6);
  await spindle(200 - offset.x + 0.7, 300 - offset.y - 0.4);
  await hold(page, /Markierung automatisch finden/);
  await expect(setup).toContainText('Versatz X 40.00 Y −25.00', { timeout: 30_000 });
  await goTo(page, 'Einrichten');
  await expect(card).toBeVisible();

  // 2. One hole (Ø 8 mm) at (300, 400) becomes the X/Y zero.
  const r = (1.5 * Math.PI) / 180;
  const h1 = { x: 300, y: 400 };
  const h2 = { x: 300 + 150 * Math.cos(r), y: 400 + 150 * Math.sin(r) };
  await addDot(h1.x, h1.y, 4);
  await addDot(h2.x, h2.y, 4);
  await spindle(h1.x - offset.x + 1.2, h1.y - offset.y + 0.8);
  const zeros = async () => (await sent(page)).filter((l) => l.startsWith('G10 L2 P0'));
  await hold(page, /Bohrung zentrieren → Nullpunkt X\/Y/);
  await expect.poll(async () => (await zeros()).length, { timeout: 30_000 }).toBe(1);
  const zero = (line: string) => {
    const m = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(line)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  const first = zero((await zeros())[0]!);
  expect(Math.hypot(first.x - h1.x, first.y - h1.y)).toBeLessThan(0.03);

  // 3. Two holes 150 mm apart in the job; the workpiece lies turned by 1.5°.
  const panel = page.getByTestId('hole-panel');
  await expect(panel).toBeHidden();
  await openSection(page, 'Zwei Bohrungen: Nullpunkt und Drehung');
  await panel.getByLabel('Bohrung 2 im Job X (mm)').fill('150');
  await spindle(h1.x - offset.x - 0.9, h1.y - offset.y + 1.1);
  await hold(page, /Bohrung 1 zentrieren/);
  await expect(panel).toContainText('Gefunden bei X 300', { timeout: 30_000 });
  await spindle(h2.x - offset.x + 0.6, h2.y - offset.y - 1.3);
  await hold(page, /Bohrung 2 zentrieren/);
  const result = page.getByTestId('two-holes-result');
  await expect(result).toBeVisible({ timeout: 30_000 });
  const angle = Number(
    /liegt ([\d,]+)° gedreht/.exec(await result.innerText())![1]!.replace(',', '.'),
  );
  expect(Math.abs(angle - 1.5)).toBeLessThan(0.02);
  await hold(page, /Nullpunkt und Drehung übernehmen/);
  await expect.poll(async () => (await zeros()).length).toBe(2);
  const second = zero((await zeros())[1]!);
  expect(Math.hypot(second.x - h1.x, second.y - h1.y)).toBeLessThan(0.03);
  await expect(page.getByTestId('job-name')).toContainText('_ausgerichtet');
});

test('the built-in simulator: home, camera and calibration find its built-in errors', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openApp(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
  await page.getByRole('button', { name: 'Simulator starten' }).click();
  await expect(page.getByTestId('simulator-badge')).toBeVisible();
  await expect(page.getByTestId('simulator-card')).toContainText('Eingebaute Fehler');

  await openJog(page);
  await hold(page, /Referenzfahrt/);
  await expect(page.getByTestId('machine-state')).toContainText('Bereit', { timeout: 60_000 });

  // Like jogging: camera over the first dot of the plate (camera sits 35/−20 mm off).
  // The console is an expert tool: its area is in the menu once the expert functions are on.
  await expert(page);
  await goTo(page, 'Konsole');
  const consoleInput = page.locator('.console input');
  await consoleInput.fill('G90 G53 G0 X86 Y140.5 Z-60');
  await consoleInput.press('Enter');

  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  await page.getByTestId('camera-card').getByRole('button', { name: 'Kamera einschalten' }).click();

  await goTo(page, 'Einstellungen');
  await machineSetup(page, 'Kalibrieren');
  await page.getByLabel('Beruhigungszeit (ms)').fill('150');
  await expect(page.getByTestId('calibration-live')).toContainText('Marke erkannt', {
    timeout: 30_000,
  });
  // The move to the plate may still be running on a slow machine: measuring needs Idle.
  await expect(page.getByTestId('machine-state')).toContainText('Bereit', { timeout: 60_000 });
  await hold(page, /Raster messen/);
  const result = page.getByTestId('calibration-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const text = await result.innerText();
  const near = (value: number, expected: number, within: number) =>
    expect(Math.abs(value - expected)).toBeLessThan(within);
  near(reading(text, /Maßstab X\s+([+−±][\d,]+) %/), 0.15, 0.01);
  near(reading(text, /Maßstab Y\s+([+−±][\d,]+) %/), -0.15, 0.01);
  near(reading(text, /Winkel X zu Y\s+([\d,]+)°/), 89.92, 0.01);
});

test('draws a part, chooses the cuts and gets a checked job, like Estlcam', async ({ page }) => {
  await openApp(page);
  // The start of the Job room: the program card, nothing of the drawing.
  const cam = page.getByTestId('cam-card');
  await expect(cam).toHaveCount(0);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  // The drawing is a workspace of its own, with the way back on top.
  await expect(cam).toBeVisible();
  await expect(page.getByTestId('setup-material')).toHaveCount(0);
  await cam.getByRole('button', { name: 'Zurück zum Job' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Beispiel laden' })).toBeVisible();
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  // Only the cutting values that matter show; the rest is under "Erweitert".
  await expect(cam.getByLabel('Werkzeug')).toBeVisible();
  await expect(cam.getByLabel('Tiefe (mm)', { exact: true })).toBeVisible();
  await expect(cam.getByLabel('Vorschub (mm/min)', { exact: true })).toBeVisible();
  await expect(cam.getByLabel('Zustellung (mm)', { exact: true })).toBeHidden();
  await cam.getByText('Erweitert', { exact: true }).click();
  await expect(cam.getByLabel('Zustellung (mm)', { exact: true })).toBeVisible();
  // A 100 × 60 plate with a Ø 20 hole in the middle.
  // One tap each: the plate lies with its corner on the work zero, the hole in its middle.
  await drawShape(page, 'Rechteck');
  await drawShape(page, 'Kreis');
  await expect(cam.getByLabel('X Mitte (mm)')).toHaveValue('50');
  await expect(cam.getByLabel('Y Mitte (mm)')).toHaveValue('30');
  const list = page.getByTestId('cam-contours');
  await expect(list).toContainText('Rechteck 100 × 60 mm');
  await expect(list).toContainText('Kreis Ø 20 mm');
  await expect(cam.getByLabel('Bearbeitung Kontur 1')).toHaveValue('outside');
  await expect(cam.getByLabel('Bearbeitung Kontur 2')).toHaveValue('inside');
  await cam.getByLabel('Bearbeitung Kontur 2').selectOption('pocket');
  // While drawing, the steps of the job are out of the way …
  await expect(page.getByRole('group', { name: 'Ablauf' })).toHaveCount(0);
  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();
  // … and with the job made, the Job room is back at its first step.
  await expect(cam).toHaveCount(0);
  await expect(page.getByTestId('setup-material')).toBeVisible();
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('job-summary')).toContainText('zeichnung.nc');
  await expect(page.getByTestId('assistant-checks')).toContainText('G-Code ohne Fehler');

  // Back in the drawing everything is still there; emptied, a DXF starts it anew:
  // an outline with a hole that fits the 8 mm cutter.
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  await expect(page.getByTestId('cam-contours')).toContainText('Kreis Ø 20 mm');
  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await expect(page.getByTestId('cam-contours')).toHaveCount(0);
  await page.getByTestId('cam-file').setInputFiles({
    name: 'schild.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from(
      [
        '0',
        'SECTION',
        '2',
        'ENTITIES',
        '0',
        'LWPOLYLINE',
        '70',
        '1',
        '10',
        '0',
        '20',
        '0',
        '10',
        '120',
        '20',
        '0',
        '10',
        '120',
        '20',
        '80',
        '10',
        '0',
        '20',
        '80',
        '0',
        'CIRCLE',
        '10',
        '20',
        '20',
        '20',
        '40',
        '4',
        '0',
        'ENDSEC',
        '0',
        'EOF',
      ].join('\n'),
    ),
  });
  await expect(cam).toContainText('Zeichnung: schild');
  await expect(cam.getByLabel('Bearbeitung Kontur 2')).toHaveValue('drill');
  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();
  await expect(page.getByTestId('job-dashboard')).toContainText('schild.nc');
});

/** The program of the drawing as the workspace saves it. */
async function drawnProgram(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-card').getByRole('button', { name: 'Als .nc speichern' }).click();
  return readFileSync(await (await download).path(), 'utf8');
}

/** The box of what is selected in the drawing, work mm: left, bottom, right, top. */
const selectedBox = async (page: Page) =>
  ((await page.getByTestId('table-view').getAttribute('data-drawing-selected')) ?? '')
    .split(',')
    .map(Number);

test('engraves a text on a sign: from the words to the program in the Job room', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  // The sign: 200 × 80 mm.
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '200', 'Höhe (mm)': '80' });
  // A text appears at once, its words marked to be typed over – with what German needs.
  await cam.getByTestId('cam-add').getByRole('button', { name: 'Text', exact: true }).click();
  await expect(cam.getByTestId('cam-text')).toBeFocused();
  await expect(cam.getByTestId('cam-text')).toHaveValue('Text');
  await page.keyboard.type('Größe 5');
  await expect(cam.getByLabel('Schrifthöhe (mm)')).toHaveValue('20');
  // It was put in the middle of the sign and is selected, ready to be moved.
  await expect(cam.getByTestId('cam-selected')).toContainText('Text „Größe 5“');
  const box = await selectedBox(page);
  expect(Math.abs((box[0]! + box[2]!) / 2 - 100)).toBeLessThan(1.5);
  expect(Math.abs((box[1]! + box[3]!) / 2 - 40)).toBeLessThan(1.5);
  await page.keyboard.type(' ☺');
  // What the font cannot write is named, not dropped in silence.
  await expect(cam.getByTestId('cam-text-missing')).toContainText('☺');
  const list = page.getByTestId('cam-contours');
  await expect(list).toContainText('2. Text „Größe 5 ☺“');
  // Text is engraved on its line, 1 mm deep unless told otherwise.
  await expect(cam.getByLabel('Bearbeitung Kontur 2')).toHaveValue('on');
  const depth = cam.getByLabel('Tiefe Kontur 2 (mm)');
  await expect(depth).toHaveAttribute('placeholder', '1');
  await depth.fill('0,8');
  await expect(cam.getByTestId('cam-selected')).toContainText('Text „Größe 5 ☺“');

  // The program: the engraving at 0.8 mm comes before the outline is cut free at 6 mm.
  const program = await drawnProgram(page);
  const lines = program.split('\n');
  const engraved = lines.findLastIndex((l) => /Z-0\.8\b/.test(l));
  const cut = lines.findIndex((l) => /Z-[1-6]\b/.test(l));
  expect(engraved).toBeGreaterThan(0);
  expect(engraved).toBeLessThan(cut);
  expect(program).toContain('Z-6');

  // Handed over, it is a job like any other: checked by the Job room's own list.
  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();
  await expect(cam).toHaveCount(0);
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('job-summary')).toContainText('zeichnung.nc');
  await expect(page.getByTestId('assistant-checks')).toContainText('G-Code ohne Fehler');
  await expect(page.getByTestId('job-summary')).toContainText('Z −6.0');
});

test('imports an SVG, says what it left out and frees the corners of a slot', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  // A plate of 120 × 60 mm with a slot, a hole, a curved line – and a text that is not paths.
  await page.getByTestId('cam-file').setInputFiles({
    name: 'halter.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      `<?xml version="1.0"?>
       <svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="60mm" viewBox="0 0 240 120">
         <defs><rect id="unused" width="5" height="5"/></defs>
         <g transform="translate(240 0) scale(-1 1)">
           <path d="M0 0 H240 V120 H0 Z"/>
           <rect x="60" y="40" width="80" height="40"/>
         </g>
         <circle cx="40" cy="60" r="8"/>
         <path d="M20 100 C60 80 100 120 140 100"/>
         <text x="10" y="20">Halter</text>
       </svg>`,
    ),
  });
  await expect(cam).toContainText('Zeichnung: halter');
  await expect(cam.getByTestId('cam-notes')).toContainText('1× Text nicht übernommen');
  const list = page.getByTestId('cam-contours');
  await expect(list.getByRole('listitem')).toHaveCount(4);
  await expect(list).toContainText('Kontur 120 × 60 mm');
  await expect(list).toContainText('Kontur 40 × 20 mm');
  await expect(list).toContainText('Kreis Ø 8 mm');
  // Outline outside, slot inside, the hole drilled with the 8 mm cutter, the open curve engraved.
  await expect(cam.getByLabel('Bearbeitung Kontur 1')).toHaveValue('outside');
  await expect(cam.getByLabel('Bearbeitung Kontur 2')).toHaveValue('inside');
  await expect(cam.getByLabel('Bearbeitung Kontur 3')).toHaveValue('drill');
  await expect(cam.getByLabel('Bearbeitung Kontur 4')).toHaveValue('on');
  // The whole file is selected: millimetres from the viewBox, y upwards.
  expect(await selectedBox(page)).toEqual([0, 0, 120, 60]);

  // Only the slot has corners the cutter cannot reach; freed, the cutter runs into them.
  await expect(cam.getByLabel('Ecken Kontur 1')).toHaveCount(0);
  const before = await drawnProgram(page);
  await cam.getByLabel('Ecken Kontur 2').selectOption('dogbone');
  await expect(cam).toContainText('Der runde Fräser lässt in jeder Innenecke seinen Radius stehen');
  // Mirrored by its group, the slot lies from 50 to 90 mm; the 8 mm cutter stops 4 mm from its corner.
  const corner = `X${(50 + 4 / Math.SQRT2).toFixed(3)} Y${(20 + 4 / Math.SQRT2).toFixed(3)}`;
  expect(before).not.toContain(corner);
  expect(await drawnProgram(page)).toContain(corner);

  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('job-summary')).toContainText('halter.nc');
  await expect(page.getByTestId('assistant-checks')).toContainText('G-Code ohne Fehler');
});

test('saves the drawing as a project file and opens it again – refusing what is no project', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await goTo(page, 'CAM');
  await drawShape(page, 'Rechteck');
  await drawShape(page, 'Kreis');
  const list = page.getByTestId('cam-contours');
  await expect(list).toContainText('Kreis Ø 20 mm');
  const rows = await list.locator('li').count();

  // Saved as a file of its own
  const download = page.waitForEvent('download');
  await page.getByTestId('cam-project-save').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('zeichnung.lowrider.json');
  const saved = await file.path();

  // Emptied, and opened again: the drawing is back, and "Rückgängig" brings the empty one back
  await page.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await expect(list).toHaveCount(0);
  await page.getByTestId('cam-project-file').setInputFiles(saved);
  await expect(page.getByTestId('cam-contours').locator('li')).toHaveCount(rows);
  await expect(page.getByTestId('cam-contours')).toContainText('Kreis Ø 20 mm');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByTestId('cam-contours')).toHaveCount(0);

  // What is no project is refused – with its reason – and changes nothing
  await page.getByTestId('cam-project-file').setInputFiles({
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"lowrider-cam-project","version":1,"name":"x","items":[{}]}'),
  });
  await page.getByTestId('messages-flag').click();
  await expect(page.getByTestId('message-centre')).toContainText('beschädigt oder unvollständig');
  await expect(page.getByTestId('cam-contours')).toHaveCount(0);
});

test('arranges the drawing by numbers: move, turn, mirror, copies in rows and columns', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const arrange = cam.getByTestId('cam-arrange');
  await expect(arrange).toHaveCount(0);
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '40', 'Höhe (mm)': '20' });
  // What was added is selected; its lower left corner stands in the fields.
  await expect(arrange.getByTestId('cam-selected')).toContainText('Rechteck 40 × 20 mm');
  await expect(arrange.getByLabel('X links (mm)')).toHaveValue('0');
  await arrange.getByLabel('X links (mm)').fill('100');
  await arrange.getByLabel('Y unten (mm)').fill('50,5');
  expect(await selectedBox(page)).toEqual([100, 50.5, 140, 70.5]);
  // A quarter turn around its middle: upright now.
  await arrange.getByRole('button', { name: 'Um 90° nach links drehen' }).click();
  expect(await selectedBox(page)).toEqual([110, 40.5, 130, 80.5]);
  await expect(arrange.getByLabel('X links (mm)')).toHaveValue('110');
  // It is still the rectangle it was drawn as, standing at 90° now.
  await expect(cam.getByTestId('cam-contours')).toContainText('Rechteck 40 × 20 mm');
  await expect(arrange.getByLabel('Winkel (°)')).toHaveValue('90');
  await arrange.getByRole('button', { name: 'Links und rechts spiegeln' }).click();
  expect(await selectedBox(page)).toEqual([110, 40.5, 130, 80.5]);
  // A copy beside it, selected in its place.
  await arrange.getByRole('button', { name: 'Duplizieren' }).click();
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(2);
  expect(await selectedBox(page)).toEqual([140, 40.5, 160, 80.5]);
  // Three columns and two rows of it, 5 mm apart.
  await arrange.getByText('Mehrfach anordnen').click();
  await arrange.getByLabel('Spalten').fill('3');
  await arrange.getByLabel('Reihen').fill('2');
  await arrange.getByLabel('Abstand (mm)').fill('5');
  await arrange.getByRole('button', { name: 'Auf 6 Stück vervielfältigen' }).click();
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(7);
  // By an angle: 45° makes the upright 20 × 40 as wide as it is high.
  await arrange.getByLabel('Winkel (°)').fill('45');
  const turned = await selectedBox(page);
  expect(turned[2]! - turned[0]!).toBeCloseTo(60 / Math.SQRT2, 0);
  expect(turned[3]! - turned[1]!).toBeCloseTo(60 / Math.SQRT2, 0);
  // Everything at once goes back to the work zero; a tap on a row selects that part alone.
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await arrange.getByRole('button', { name: 'Alles auswählen' }).click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('7 Teile');
  await arrange.getByLabel('X links (mm)').fill('0');
  await arrange.getByLabel('Y unten (mm)').fill('0');
  expect((await selectedBox(page)).slice(0, 2)).toEqual([0, 0]);
  await cam.getByRole('button', { name: '1. Rechteck 40 × 20 mm' }).click();
  await expect(arrange.getByTestId('cam-selected')).toContainText('Rechteck 40 × 20 mm');
  await arrange.getByRole('button', { name: 'Löschen' }).click();
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(6);
  // Still a job without errors.
  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('assistant-checks')).toContainText('G-Code ohne Fehler');
});

test('the drawing is a drawing tool: one click adds, handles change, keys delete, undo and nudge', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  const list = cam.getByTestId('cam-contours');
  const width = cam.getByTestId('cam-arrange').getByLabel('Breite (mm)', { exact: true });
  // One click: the rectangle lies on the table, selected, its numbers beside it.
  await drawShape(page, 'Rechteck');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  expect(await selectedBox(page)).toEqual([0, 0, 100, 60]);
  await expect(width).toHaveValue('100');
  await restingTable(page);

  // The handle on its right side, pulled to the right: wider, the left side stays.
  const side = await tableSpot(page, { x: 100, y: 30 });
  const pulled = await tableSpot(page, { x: 140, y: 45 });
  expect(await onStage(page, side)).toBe(true);
  await page.mouse.move(side.x, side.y);
  await page.mouse.down();
  await page.mouse.move(pulled.x, pulled.y, { steps: 8 });
  // While it is pulled, its size stands beside it; whole millimetres at this zoom.
  await expect(table).toHaveAttribute('data-drawing-label', /^1\d\d × 60 mm$/);
  const wide = await rested(page, () => selectedBox(page));
  expect(wide.slice(0, 2)).toEqual([0, 0]);
  expect(wide[3]).toBe(60);
  expect(wide[2]!).toBeGreaterThan(134);
  expect(wide[2]!).toBeLessThanOrEqual(140);
  expect(wide[2]! % 1).toBe(0);
  await page.mouse.up();
  await expect(table).not.toHaveAttribute('data-drawing-label');
  await expect(width).toHaveValue(String(wide[2]));
  await expect(list).toContainText(`Rechteck ${wide[2]} × 60 mm`);

  // A typed width changes the picture at once.
  await width.fill('150');
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 150, 60]);
  // In a field the keys belong to the field: nothing is nudged or deleted.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Backspace');
  await expect(width).toHaveValue('15');
  await width.fill('150');
  await expect.poll(() => selectedBox(page)).toEqual([0, 0, 150, 60]);

  // Out of the field, the arrows nudge: 1 mm, with Shift 10 mm, with Alt 0.1 mm.
  await cam.getByTestId('cam-selected').click();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => selectedBox(page)).toEqual([1, 0, 151, 60]);
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => selectedBox(page)).toEqual([1, 10, 151, 70]);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => selectedBox(page)).toEqual([0.9, 10, 150.9, 70]);

  // Entf deletes without asking – undo brings it back, selected as it was.
  const undo = cam.getByRole('button', { name: 'Rückgängig' });
  const redo = cam.getByRole('button', { name: 'Wiederholen' });
  await page.keyboard.press('Delete');
  await expect(list).toHaveCount(0);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  await expect(page.getByText('zeichnung.nc')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect.poll(() => selectedBox(page)).toEqual([0.9, 10, 150.9, 70]);
  await expect(redo).toBeEnabled();
  await page.keyboard.press('Control+Shift+z');
  await expect(list).toHaveCount(0);
  await undo.click();
  await expect(list.getByRole('listitem')).toHaveCount(1);

  // Ctrl+D duplicates, Ctrl+C / Ctrl+V copy within the drawing, Esc lets go.
  await page.keyboard.press('Control+d');
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await undo.click();
  await undo.click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(redo).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  await expect(cam.getByTestId('cam-selected')).toHaveCount(0);

  // A tap on its line selects it again; the dot above it turns it – a quarter to the left.
  await restingTable(page);
  const line = await tableSpot(page, { x: 75.9, y: 10 });
  await page.mouse.click(line.x, line.y);
  await expect(cam.getByTestId('cam-selected')).toContainText('Rechteck 150 × 60 mm');
  const middle = await tableSpot(page, { x: 75.9, y: 40 });
  const top = await tableSpot(page, { x: 75.9, y: 70 });
  await page.mouse.move(top.x, top.y - 30);
  await page.mouse.down();
  // A first small move leaves the spot (as a hand does), then round to the left of its middle.
  await page.mouse.move(top.x - 5, top.y - 30);
  await page.mouse.move(middle.x - 70, middle.y - 60, { steps: 5 });
  await page.mouse.move(middle.x - 120, middle.y, { steps: 5 });
  await expect(table).toHaveAttribute('data-drawing-label', '90°');
  await page.mouse.up();
  await expect(cam.getByTestId('cam-arrange').getByLabel('Winkel (°)')).toHaveValue('90');
  await expect.poll(() => selectedBox(page)).toEqual([45.9, -35, 105.9, 115]);
  // It is still a rectangle of 150 × 60: its own width grows upwards now.
  await width.fill('100');
  await expect.poll(() => selectedBox(page)).toEqual([45.9, -35, 105.9, 65]);

  // A circle is added into the selected plate and keeps its middle when its size is typed.
  await drawShape(page, 'Kreis', { 'Durchmesser (mm)': '30' });
  await expect.poll(() => selectedBox(page)).toEqual([60.9, 0, 90.9, 30]);
  await expect(cam.getByLabel('Bearbeitung Kontur 2')).toHaveValue('inside');

  // None of these keys ever went to the machine.
  expect((await sent(page)).filter((l) => /\$J|G0|G1/.test(l))).toEqual([]);
  await cam.getByRole('button', { name: 'G-Code erzeugen' }).click();
  await jobView(page, 'Prüfen');
  await expect(page.getByTestId('assistant-checks')).toContainText('G-Code ohne Fehler');
});

test('the demo: the aligned program lies on the table until the drawing is put there', async ({
  page,
}) => {
  await openDemo(page);
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  // The demo's sign is drawn by its measures: its plate can be changed like one drawn by hand.
  await cam.getByRole('button', { name: '1. Rechteck 280 × 160 mm' }).click();
  await expect(cam.getByTestId('cam-arrange').getByLabel('Eckenradius (mm)')).toHaveValue('10');
  // The program turned onto the board stays on the table – said in words, with the way out – and
  // the drawing is drawn over it all the same, so it can be worked on with the finger.
  const notice = cam.getByTestId('cam-other-job');
  const frame = '40.00,20.00;320.00,20.00;320.00,180.00;40.00,180.00';
  await expect(notice).toContainText('demo-schild_ausgerichtet.nc');
  await expect(table).toHaveAttribute('data-drawing-frame', frame);
  await notice.getByRole('button', { name: 'Zeichnung auf den Tisch legen' }).click();
  await expect(notice).toHaveCount(0);
  await expect(table).toHaveAttribute('data-drawing-frame', frame);
  // Nothing was changed by that: there is nothing to take back.
  await expect(cam.getByRole('button', { name: 'Rückgängig' })).toBeDisabled();
});

test('takes an Estlcam job from the SD card as it is meant', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles(estlcamJob);
  // No T words: the 6 mm cutter named in the header is picked, not the 8 mm one.
  await expect(page.getByTestId('job-dashboard')).toContainText('Ø 6,0 mm');
  await goTo(page, 'Werkzeuge');
  const tool = page.getByTestId('job-tools');
  await expect(tool).toContainText('Laut Datei (Estlcam 11): Fräser 6mm');
  await expect(tool.getByRole('combobox')).toHaveValue('t3');
  await expect(tool.getByTestId('tool-row')).toHaveAttribute('data-state', 'ok');
  await connect(page);
  await jobView(page, 'Fertigen');
  const panel = page.getByTestId('run-panel');
  await expect(panel).toContainText('„G21 G90“ wird vorangestellt');
  await expect(page.getByTestId('manual-spindle')).toContainText('Fräsmotor von Hand einschalten');
});

test('accuracy check: cut four marks, measure with a rule, correct steps/mm', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await page.evaluate(
    (config) => {
      (window as unknown as { __config: string }).__config = config;
    },
    readFileSync(stockConfig, 'utf8'),
  );
  const section = await machineSetup(page, 'Kalibrieren');
  const check = section.getByTestId('accuracy-check');
  await check.getByRole('button', { name: 'Als Job laden' }).click();
  await expect(page.getByTestId('job-summary')).toContainText('genauigkeit_500x400.nc');
  await expect(page.getByTestId('job-summary')).toContainText('X 0.0 … 500.0');

  // Marks of a machine that runs X 0.2 % long and leans Y by 0.05°, measured exactly.
  const g = (0.05 * Math.PI) / 180;
  const A = { x: 0, y: 0 };
  const B = { x: 501, y: 0 };
  const D = { x: 400 * Math.sin(g), y: 400 * Math.cos(g) };
  const C = { x: B.x + D.x, y: D.y };
  const d = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    Math.hypot(p.x - q.x, p.y - q.y).toFixed(2);
  await connect(page);
  await machineSetup(page, 'Kalibrieren');
  for (const [label, value] of <[string, string][]>[
    ['A → B, vorne (X)', d(A, B)],
    ['D → C, hinten (X)', d(D, C)],
    ['A → D, links (Y)', d(A, D)],
    ['B → C, rechts (Y)', d(B, C)],
    ['Diagonale A → C', d(A, C)],
    ['Diagonale B → D', d(B, D)],
  ])
    await check.getByLabel(label).fill(value);
  await check.getByRole('button', { name: 'Auswerten' }).click();
  const result = page.getByTestId('accuracy-result');
  await expect(result).toContainText('+0,200 %');
  await expect(result).toContainText('89,95');
  await expect(check.getByTestId('calibration-corrections')).toContainText('axes/x/steps_per_mm');
  await expect(check.getByTestId('calibration-corrections')).toContainText('49,9');
});

test('homing single axes counts only for them; soft limits need all three', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await openJog(page);
  await hold(page, /^Ref\. Z/);
  await hold(page, /^Ref\. X/);
  await expect(page.getByText(/Referenziert: XZ – es fehlt Y/)).toBeVisible();
  // A pressed switch lights up before anything moves.
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:0.000,0.000,0.000|FS:0,0|Pn:XP>';
  });
  const inputs = page.getByTestId('inputs');
  await expect(inputs).toContainText('Endschalter Xausgelöst');
  await expect(inputs).toContainText('Endschalter Zfrei');
  await expect(inputs).toContainText('Tastplatteausgelöst');
  // Not all axes homed: jogs stay relative, nothing is clamped yet.
  await page.getByRole('button', { name: '10 mm' }).click();
  await page.getByRole('button', { name: /^X\+/ }).click();
  await expect.poll(() => sent(page)).toContain('$J=G91 G21 X10 F3000');
  await hold(page, /^Ref\. Y/);
  await expect(page.getByText(/Referenziert: XZ/)).toHaveCount(0);
  await expect(page.getByText(/Nicht referenziert/)).toHaveCount(0);
});

test('the demo starts as a set-up machine and keeps the real settings untouched', async ({
  page,
}) => {
  // A real setting from earlier use must survive the demo.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('lowrider-control.url', '192.168.0.200');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/#demo');
  const state = page.getByTestId('machine-state');
  await expect(state).toContainText('Bereit', { timeout: 20_000 });
  await expect(page.getByTestId('simulator-badge')).toHaveText('Demo');
  // It opens on Start: the machine is ready, its job is named, and the one recommendation
  // leads to the first step of that job that is still open.
  await expect(page.getByTestId('start-state')).toContainText('Bereit');
  await expect(page.getByTestId('start-job')).toContainText('demo-schild_ausgerichtet.nc');
  const next = page.getByTestId('next-card');
  await expect(next).toContainText('demo-schild_ausgerichtet.nc');
  await expect(next).toHaveAttribute('data-kind', 'continue');
  await expect(page.getByTestId('primary-action')).toContainText(/^Weiter: /);
  // A job starts at step ①, the table on the stage.
  await goTo(page, 'Job');
  await expect(stageMode(page, 'Tisch')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('setup-material')).toBeVisible();
  await expect(page.getByTestId('cam-card')).toHaveCount(0);

  // The pre-scanned photo map lies under the job: many pictures, and on the canvas
  // the light wood of the board with the toolpath on it – blue: red is for alarms only.
  const table = page.getByTestId('table-view');
  await expect
    .poll(async () => Number(await table.getAttribute('data-photos')))
    .toBeGreaterThan(40);
  const painted = () =>
    page.getByTestId('stage-canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let wood = 0;
      let cut = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
        if (r > 150 && g > 110 && b > 60 && r > b + 30) wood++;
        if (b > 200 && r < 110 && g > 90 && g < 180) cut++;
      }
      return { wood: wood / (d.length / 4), cut };
    });
  await expect.poll(async () => (await painted()).wood).toBeGreaterThan(0.2);
  expect((await painted()).cut).toBeGreaterThan(50);

  // The live picture sits small in the corner; a tap makes it the stage, the overview leads back.
  await page.getByTestId('live-inset').click();
  await expect(page.getByTestId('camera-overlay')).toBeVisible();
  await expect(stageMode(page, 'Kamera')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('camera-mini').click();
  await expect(table).toBeVisible();

  // The camera counts as set up: daily functions, one status line, no call to set it up.
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  await expect(page.getByTestId('camera-setup-cta')).toHaveCount(0);
  await expect(page.getByTestId('camera-status')).toContainText(
    'Simulator-Kamera · Kamerahöhe Z 30,0',
  );
  await goTo(page, 'Einrichten', 'Nullpunkte');
  await expect(
    page.getByRole('button', { name: /Nullpunkt hier setzen \(Fadenkreuz\)/ }),
  ).toBeEnabled();

  // The joystick moves the simulated machine.
  const tile = page.getByTestId('position-tile');
  const before = await tile.textContent();
  await stageTool(page, 'Joystick').click();
  const stick = page.getByTestId('jogstick');
  const box = (await stick.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 4 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect.poll(() => tile.textContent()).not.toBe(before);

  // Nothing of the demo reached the browser storage.
  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(stored).toEqual({ 'lowrider-control.url': '192.168.0.200' });
});

// ---------- finger tools on the table: measuring, clamps, zero under the loupe ----------

const distanceShown = async (page: Page) =>
  numberIn(await page.getByTestId('measure-distance').textContent());

test('measures between two points on the table; points can be dragged, the view still pans', async ({
  page,
}) => {
  await openDemo(page);
  await stageTool(page, 'Messen').click();
  const panel = page.getByTestId('tool-panel');
  await expect(panel).toContainText('Zwei Punkte antippen');

  // The board's two Ø 8 holes are 200 mm apart; the work zero lies on the first.
  const hole1 = await tableSpot(page, boardToWork(20, 20));
  const hole2 = await tableSpot(page, boardToWork(220, 20));
  await page.mouse.click(hole1.x, hole1.y);
  await expect(panel).toContainText('Zweiten Punkt antippen');
  await page.mouse.click(hole2.x, hole2.y);
  await expect.poll(() => distanceShown(page)).toBeGreaterThan(198.5);
  expect(await distanceShown(page)).toBeLessThan(201.5);
  // Along X and Y, the angle of the board, and how far to trust it – in one short line.
  await expect(page.getByTestId('measure-parts')).toContainText(/ΔX 19\d,\d/);
  await expect(page.getByTestId('measure-parts')).toContainText(/Winkel 1,\d°/);
  await expect(panel).toContainText('Auf der Fotokarte etwa 0,2–0,5 mm genau.');

  // Dragging the second point refines it: the point moves, the view does not.
  const view = () => page.getByTestId('table-view').getAttribute('data-view');
  const before = await view();
  await page.mouse.move(hole2.x, hole2.y);
  await page.mouse.down();
  await page.mouse.move(hole2.x - 6, hole2.y, { steps: 3 });
  await page.mouse.move(hole2.x - 46, hole2.y, { steps: 8 });
  await page.mouse.up();
  const g = await tableGeometry(page);
  // The point follows the finger from where it left the tap slop (a few px).
  const moved = (await distanceShown(page)) - 200;
  expect(moved).toBeLessThan(-36 / g.scale);
  expect(moved).toBeGreaterThan(-48 / g.scale);
  expect(await view()).toBe(before);

  // A drag beside the points pans the view and leaves the measurement alone.
  const kept = await distanceShown(page);
  const free = { x: hole1.x + 60, y: hole1.y - 80 };
  expect(await onStage(page, free)).toBe(true);
  await page.mouse.move(free.x, free.y);
  await page.mouse.down();
  await page.mouse.move(free.x + 40, free.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(view).not.toBe(before);
  expect(await distanceShown(page)).toBe(kept);

  // A third tap measures on from the last point (the dragged one: first point plus ΔX, ΔY).
  // The thrown view first comes to rest, so the tap hits the place it is aimed at.
  await expect
    .poll(async () => {
      const seen = await view();
      await page.waitForTimeout(250);
      return seen === (await view());
    })
    .toBe(true);
  const parts = (await page.getByTestId('measure-parts').textContent()) ?? '';
  const first = boardToWork(20, 20);
  const last = {
    x: first.x + numberIn(/ΔX ([−\d,]+)/.exec(parts)![1]!),
    y: first.y + numberIn(/ΔY ([−\d,]+)/.exec(parts)![1]!),
  };
  const third = { x: free.x + 20, y: free.y - 10 };
  expect(await onStage(page, third)).toBe(true);
  const next = await tableWork(page, third);
  await page.mouse.click(third.x, third.y);
  const expected = Math.hypot(next.x - last.x, next.y - last.y);
  await expect.poll(async () => Math.abs((await distanceShown(page)) - expected)).toBeLessThan(3);
  // Discarding starts afresh.
  await page.getByRole('button', { name: 'Punkt verwerfen' }).click();
  await expect(panel).toContainText('Zwei Punkte antippen');
});

test('on the camera picture a tap on a hole snaps to its centre: hole spacing in two taps', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openDemo(page);
  await stageMode(page, 'Kamera').click();
  await expect(page.getByTestId('camera-overlay')).toBeVisible();
  await page.waitForTimeout(500);
  await stageTool(page, 'Messen').click();
  const panel = page.getByTestId('tool-panel');

  // Tap 2.5 mm beside the centre of hole 1 (Ø 8 mm): the point is the hole's centre.
  const beside = await cameraSpot(page, 22, 21.5);
  await page.mouse.click(beside.x, beside.y);
  await expect(page.getByTestId('measure-snap')).toHaveText(/Eingerastet: Loch Ø (7,9|8,0|8,1) mm/);
  await expect(panel).toContainText('Am Fadenkreuz genau, zum Bildrand hin etwa 0,2–0,5 mm.');

  // A free point on the wood, 60 mm right and 30 mm up of the hole's centre.
  const free = await cameraSpot(page, 80, 50);
  expect(await onStage(page, free)).toBe(true);
  await page.mouse.click(free.x, free.y);
  await expect(page.getByTestId('measure-snap')).toHaveText(/Loch Ø 8,\d mm → freier Punkt/);
  // From the centre, not from where the finger was: √(60² + 30²) = 67.1, not 64.5.
  await expect.poll(async () => Math.abs((await distanceShown(page)) - 67.08)).toBeLessThan(0.6);

  // Hole spacing: start again on hole 1, drive 200 mm along X, tap hole 2.
  await page.getByRole('button', { name: 'Punkt verwerfen' }).click();
  await page.mouse.click(beside.x, beside.y);
  await expect(page.getByTestId('measure-snap')).toHaveText(/Eingerastet/);
  await openJog(page);
  const jog = page.getByRole('region', { name: 'Joggen' });
  await jog.getByRole('button', { name: '100 mm', exact: true }).click();
  const tile = page.getByTestId('position-tile');
  const x = async () =>
    numberIn((/X\s*([−\-\d.,]+)/.exec((await tile.textContent()) ?? '') ?? [])[1] ?? '');
  const start = await x();
  for (const target of [100, 200]) {
    await jog.getByRole('button', { name: /^X\+/ }).click();
    await expect.poll(async () => Math.abs((await x()) - start - target)).toBeLessThan(0.01);
  }
  await expect(page.getByTestId('machine-state')).toContainText('Bereit');
  await page.waitForTimeout(300);
  // Hole 2 now lies where hole 1 was, a little higher (the board is turned by 1.5°).
  const hole2 = await cameraSpot(page, 220 - 200 + 1.5, 20 + 1);
  await page.mouse.click(hole2.x, hole2.y);
  await expect(page.getByTestId('measure-snap')).toHaveText(/Loch Ø 8,\d mm → Loch Ø 8,\d mm/);
  // 200 mm on the board; the simulated machine travels 0.15 % too far, so it reads a hair less.
  await expect.poll(async () => Math.abs((await distanceShown(page)) - 199.7)).toBeLessThan(0.5);
});

/** The fixtures of Job → Vorbereiten as texts. */
async function fixtureEntries(page: Page) {
  // The clamps as numbers live in ③ Einrichten; the test goes on working on the table.
  await goTo(page, 'Einrichten', 'Nullpunkte');
  await stageMode(page, 'Tisch').click();
  await restingTable(page);
  await expect(page.getByTestId('fixture-entry').first()).toBeVisible();
  return page.getByTestId('fixture-entry').allTextContents();
}

test('marks a clamp by a tap: warns while it lies in the toolpath, stays put when the zero moves', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openDemo(page);
  const table = page.getByTestId('table-view');
  // The demo has one clamp marked beside the job: nothing to warn about.
  await expect(table).toHaveAttribute('data-zones', '1');
  await expect(table).toHaveAttribute('data-warned', '0');
  await jobView(page, 'Prüfen');
  const checks = page.getByTestId('assistant-checks');
  await expect(checks).not.toContainText('Zwinge');
  // ④ shows the job in 3D with its timeline; clamps are marked on the table.
  await stageMode(page, 'Tisch').click();
  await restingTable(page);

  // Room around the job: zoom the table out a little.
  const canvas = (await page.getByTestId('stage-canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(400);

  // A clamp on the lower edge of the sign plate, where the cutter runs.
  await stageTool(page, 'Spannmittel').click();
  const panel = page.getByTestId('tool-panel');
  await expect(panel).toContainText('Antippen, wo eine Zwinge oder Schraube sitzt');
  const inPath = await tableSpot(page, boardToWork(100, 40));
  expect(await onStage(page, inPath)).toBe(true);
  await page.mouse.click(inPath.x, inPath.y);
  await expect(panel.getByTestId('zone-selected')).toContainText('Zwinge 2');
  await expect(panel.getByTestId('zone-selected')).toContainText('60 × 40 mm');
  await expect(panel.getByTestId('zone-warning')).toHaveText(
    'Zwinge 2 liegt in der Fräsbahn – versetzen oder Job verschieben',
  );
  await expect(table).toHaveAttribute('data-zones', '2');
  expect(Number(await table.getAttribute('data-warned'))).toBeGreaterThan(0);
  // The readiness list names the clamp and leads back to it.
  await expect(checks).toContainText(
    'Zwinge 2 liegt in der Fräsbahn – versetzen oder Job verschieben',
  );
  await expect(page.getByTestId('start-bar')).toContainText('Hinweis');
  await stageTool(page, 'Hinfahren').click();
  await checks.locator('[data-check="clamp"]').getByRole('button', { name: 'Zeigen' }).click();
  await expect(stageTool(page, 'Spannmittel')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByTestId('zone-selected')).toContainText('Zwinge 2');

  // Its height above the workpiece: in steps of 5 mm, or typed.
  await panel.getByRole('button', { name: '5 mm niedriger' }).click();
  await expect(panel.getByLabel('Höhe über dem Werkstück, mm')).toHaveValue('25');
  await panel.getByLabel('Höhe über dem Werkstück, mm').fill('30');

  // Dragged off the workpiece, in front of the board: the warning goes.
  const away = await tableSpot(page, boardToWork(100, -45));
  expect(await onStage(page, away)).toBe(true);
  expect(await onStage(page, inPath)).toBe(true);
  await page.mouse.move(inPath.x, inPath.y);
  await page.mouse.down();
  await page.mouse.move(inPath.x, inPath.y + 12, { steps: 3 });
  await page.mouse.move(away.x, away.y + 12, { steps: 10 });
  await page.mouse.up();
  await expect(panel.getByTestId('zone-warning')).toHaveCount(0);
  await expect(table).toHaveAttribute('data-warned', '0');
  await expect(checks).not.toContainText('Zwinge 2 liegt');

  // Its corner resizes it.
  const g = await tableGeometry(page);
  const corner = await tableSpot(page, {
    x: boardToWork(100, -45).x + 30,
    y: boardToWork(100, -45).y - 20,
  });
  await page.mouse.move(corner.x - 2, corner.y - 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + 6, corner.y - 2, { steps: 3 });
  await page.mouse.move(corner.x + 6 + 20 * g.scale, corner.y - 2, { steps: 6 });
  await page.mouse.up();
  await expect(panel.getByTestId('zone-selected')).toContainText(/(7[6-9]|8[0-6]) × 40 mm/);

  // The same zones stand as numbers under "Maße von Hand" – relative to the work zero.
  const before = await fixtureEntries(page);
  expect(before.length).toBe(2);
  expect(before[1]).toContain('Zwinge 2');
  const xOf = (entry: string) => numberIn(/X ([−\-\d,]+)…/.exec(entry)![1]!);
  const yOf = (entry: string) => numberIn(/Y ([−\-\d,]+)…/.exec(entry)![1]!);

  // Move the work zero by a tap: the clamps stay where they are on the table,
  // so seen from the new zero they are exactly that much further away.
  await stageTool(page, 'Nullpunkt').click();
  const spot = await tableSpot(page, { x: 30, y: 12 });
  expect(await onStage(page, spot)).toBe(true);
  await page.mouse.click(spot.x, spot.y);
  const shift = (await page.getByTestId('zero-shift').textContent()) ?? '';
  const dx = numberIn(/X ([+−\d,]+)/.exec(shift)![1]!.replace('+', ''));
  const dy = numberIn(/Y ([+−\d,]+)/.exec(shift)![1]!.replace('+', ''));
  expect(Math.abs(dx - 30)).toBeLessThan(1.5);
  await hold(page, /Nullpunkt X\/Y setzen/);
  await expect(page.getByTestId('zero-done')).toContainText('Nullpunkt gesetzt');
  const after = await fixtureEntries(page);
  for (const i of [0, 1]) {
    expect(xOf(after[i]!) - xOf(before[i]!)).toBeCloseTo(-dx, 0);
    expect(yOf(after[i]!) - yOf(before[i]!)).toBeCloseTo(-dy, 0);
  }

  // Typed numbers and the picture are one list: a new height from the form, a delete from the list.
  const fixtures = page.getByTestId('fixtures');
  await page.getByTestId('fixture-entry').nth(1).getByRole('button', { name: 'Maße' }).click();
  await expect(fixtures.getByLabel('Name')).toHaveValue('Zwinge 2');
  await fixtures.getByLabel('Oberkante Z').fill('12,5');
  await fixtures.getByRole('button', { name: 'Maße übernehmen' }).click();
  await expect(page.getByTestId('fixture-entry').nth(1)).toContainText('Höhe 12,5 mm');
  await stageTool(page, 'Spannmittel').click();
  await page.getByTestId('fixture-entry').nth(0).getByRole('button', { name: 'Löschen' }).click();
  await expect(table).toHaveAttribute('data-zones', '1');
  await expect(page.getByTestId('fixture-entry')).toHaveCount(1);
});

test('sets the zero on a tapped corner under the loupe, then aligns the job to an edge', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openDemo(page);
  await stageTool(page, 'Nullpunkt').click();
  const panel = page.getByTestId('tool-panel');
  await expect(panel).toContainText('Ecke des Werkstücks antippen');
  // The corner of the board, 20 mm left of and below hole 1 (the zero so far).
  const corner = await tableSpot(page, boardToWork(0, 0));
  await page.mouse.click(corner.x + 4, corner.y - 3);
  const shift = async () => {
    const text = (await page.getByTestId('zero-shift').textContent()) ?? '';
    return {
      x: numberIn(/X ([+−\d,]+)/.exec(text)![1]!.replace('+', '')),
      y: numberIn(/Y ([+−\d,]+)/.exec(text)![1]!.replace('+', '')),
    };
  };
  const tapped = await shift();
  expect(Math.abs(tapped.x + 20)).toBeLessThan(6);
  expect(Math.abs(tapped.y + 20)).toBeLessThan(6);

  // The loupe shows the corner magnified: light board and darker table in one picture.
  const loupe = panel.getByTestId('loupe');
  const tones = () =>
    loupe.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let light = 0;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        const v = (d[i]! * 77 + d[i + 1]! * 150 + d[i + 2]! * 29) >> 8;
        if (v > 195) light++;
        else if (v > 110 && v < 180) dark++;
      }
      return { light: light / (d.length / 4), dark: dark / (d.length / 4) };
    });
  await expect.poll(async () => (await tones()).light).toBeGreaterThan(0.1);
  expect((await tones()).dark).toBeGreaterThan(0.1);

  // Fine steps: 0.1 mm per press, 1 mm after switching the step.
  await panel.getByRole('button', { name: 'Marke nach rechts (X+)' }).click();
  await panel.getByRole('button', { name: 'Marke nach rechts (X+)' }).click();
  await panel.getByRole('button', { name: 'Marke nach hinten (Y+)' }).click();
  expect((await shift()).x).toBeCloseTo(tapped.x + 0.2, 1);
  expect((await shift()).y).toBeCloseTo(tapped.y + 0.1, 1);
  await panel.getByRole('button', { name: /Schritt 0,1 mm/ }).click();
  await panel.getByRole('button', { name: 'Marke nach links (X−)' }).click();
  expect((await shift()).x).toBeCloseTo(tapped.x - 0.8, 1);

  // Dragging inside the loupe moves the picture under the crosshair: 60 px are 5 mm.
  const box = (await loupe.boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const fine = await shift();
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 60, mid.y - 24, { steps: 6 });
  await page.mouse.up();
  expect((await shift()).x).toBeCloseTo(fine.x - 5, 1);
  expect((await shift()).y).toBeCloseTo(fine.y - 2, 1);

  // Nothing is set until the button is held; then the grid's origin is the new zero.
  const tile = page.getByTestId('position-tile');
  const position = await tile.textContent();
  await expect(panel).toContainText(/Maschine: X [\d,]+ → [\d,]+ · Y [\d,]+ → [\d,]+/);
  await hold(page, /Nullpunkt X\/Y setzen/);
  await expect(page.getByTestId('zero-done')).toContainText('Nullpunkt gesetzt');
  await expect.poll(() => tile.textContent()).not.toBe(position);

  // It has moved on by itself: two taps along the lower edge of the board.
  await expect(panel.getByRole('button', { name: /Kante/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('zero-done')).toContainText(
    'zwei Punkte entlang einer geraden Kante',
  );
  // The lower edge of the board, seen from the new zero (the old one was hole 1).
  await expect(page.getByTestId('zero-shift')).toHaveCount(0);
  const final = { x: fine.x - 5, y: fine.y - 2 };
  const edge = (bx: number) => {
    const w = boardToWork(bx, 0);
    return tableSpot(page, { x: w.x - final.x, y: w.y - final.y });
  };
  const a = await edge(40);
  const b = await edge(240);
  expect(await onStage(page, a)).toBe(true);
  await page.mouse.click(a.x, a.y);
  await expect(panel).toContainText('Zweiten Punkt entlang der Kante antippen');
  expect(await onStage(page, b)).toBe(true);
  await page.mouse.click(b.x, b.y);
  const angle = async () => numberIn(await page.getByTestId('edge-angle').textContent());
  await expect.poll(angle).toBeGreaterThan(1.0);
  expect(await angle()).toBeLessThan(2.0);
  // One step from the angle to the aligned job.
  await panel.getByRole('button', { name: 'Job danach ausrichten' }).click();
  await expect(page.getByTestId('zero-done')).toContainText(/Job um 1,\d\d° gedreht/);
  await expect(page.getByText('demo-schild_ausgerichtet.nc').first()).toBeVisible();
});

test('on the camera picture the zero snaps to the corner of the board, the edge taps to its edge', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openDemo(page);
  // Bring the camera to the corner of the board, the corner in the upper part of the
  // picture (clear of the tool's panel): go-to on the table, at camera height.
  const panel = page.getByTestId('tool-panel');
  const tile = page.getByTestId('position-tile');
  const start = await tile.textContent();
  const canvas = (await page.getByTestId('stage-canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(400);
  const over = await tableSpot(page, boardToWork(30, -22));
  expect(await onStage(page, over)).toBe(true);
  await page.mouse.click(over.x, over.y);
  await panel.getByRole('checkbox', { name: /sichere Höhe/ }).uncheck();
  await hold(page, /^Kamera hierhin/);
  await expect.poll(() => tile.textContent()).not.toBe(start);
  await expect(page.getByTestId('machine-state')).toContainText('Bereit');
  await page.waitForTimeout(400);
  await stageMode(page, 'Kamera').click();
  await expect(page.getByTestId('camera-overlay')).toBeVisible();
  await stageTool(page, 'Nullpunkt').click();
  await page.waitForTimeout(500);

  // Where a work point lies in the live picture: the camera looks 35 mm right of and
  // 20 mm in front of the spindle (the simulator's camera), 10 px per mm of 1200 × 900.
  const inPicture = async (work: { x: number; y: number }) => {
    const text = ((await tile.textContent()) ?? '').replace(/−/g, '-');
    const [sx = 0, sy = 0] = [...text.matchAll(/[XY]\s*(-?\d+\.\d+)/g)].map((m) => Number(m[1]));
    const box = (await page.getByTestId('camera-overlay').boundingBox())!;
    return {
      x: box.x + ((600 + (work.x - sx - 35) * 10) / 1200) * box.width,
      y: box.y + ((450 - (work.y - sy + 20) * 10) / 900) * box.height,
    };
  };
  const shift = async () => {
    const text = (await page.getByTestId('zero-shift').textContent()) ?? '';
    return {
      x: numberIn(/X ([+−\d,]+)/.exec(text)![1]!.replace('+', '')),
      y: numberIn(/Y ([+−\d,]+)/.exec(text)![1]!.replace('+', '')),
    };
  };

  // A fingertip 3.5 mm beside the corner: the mark sits on the corner itself.
  const corner = boardToWork(0, 0);
  const near = await inPicture({ x: corner.x + 3, y: corner.y + 2 });
  expect(await onStage(page, near)).toBe(true);
  await page.mouse.click(near.x, near.y);
  await expect(page.getByTestId('zero-snap')).toHaveText('Eingerastet: Ecke im Kamerabild');
  // The zero so far is hole 1, 20 mm in from both edges of the board.
  expect(Math.abs((await shift()).x - corner.x)).toBeLessThan(0.45);
  expect(Math.abs((await shift()).y - corner.y)).toBeLessThan(0.45);
  // A nudge takes it off the corner again: it is a free point then.
  await panel.getByRole('button', { name: 'Marke nach rechts (X+)' }).click();
  await expect(page.getByTestId('zero-snap')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Marke nach links (X−)' }).click();

  // Along the edge, far from the corner, there is no corner to snap to: the tap stays where the finger was.
  const wood = await inPicture({ x: corner.x + 45, y: corner.y + 5 });
  expect(await onStage(page, wood)).toBe(true);
  await page.mouse.click(wood.x, wood.y);
  await expect(page.getByTestId('zero-shift')).toBeVisible();
  await expect(page.getByTestId('zero-snap')).toHaveCount(0);
  await page.mouse.click(near.x, near.y);
  await expect(page.getByTestId('zero-snap')).toHaveText('Eingerastet: Ecke im Kamerabild');
  await hold(page, /Nullpunkt X\/Y setzen/);
  await expect(page.getByTestId('zero-done')).toContainText('Nullpunkt gesetzt');

  // The edge: two taps a little off the lower edge of the board, one on the wood, one on the table.
  const along = (bx: number, by: number) => {
    const w = boardToWork(bx, by);
    return inPicture({ x: w.x - corner.x, y: w.y - corner.y });
  };
  await page.waitForTimeout(300);
  const first = await along(18, 2);
  expect(await onStage(page, first)).toBe(true);
  await page.mouse.click(first.x, first.y);
  await expect(page.getByTestId('zero-snap')).toHaveText('Eingerastet: Kante im Kamerabild');
  const second = await along(58, -2);
  expect(await onStage(page, second)).toBe(true);
  await page.mouse.click(second.x, second.y);
  await expect(page.getByTestId('zero-snap')).toHaveText('Eingerastet: Kante im Kamerabild');
  // The board lies 1.5° askew; the taps alone (4 mm apart across 40 mm) would say −4°.
  await expect(page.getByTestId('edge-angle')).toHaveText(/Kante liegt 1,[3-7]\d° schräg/);
});

test('the panels of the stage tools keep finger-sized targets', async ({ page }) => {
  await openDemo(page);
  const small = () =>
    page.getByTestId('tool-panel').evaluate((panel) =>
      [...panel.querySelectorAll<HTMLElement>('button, input')]
        .map((el) => ({
          text: el.textContent || el.ariaLabel,
          h: el.offsetHeight,
          w: el.offsetWidth,
        }))
        .filter((b) => b.h < 47.5 || b.w < 47.5),
    );
  const spot = await tableSpot(page, boardToWork(100, 40));
  for (const tool of ['Nullpunkt', 'Messen', 'Spannmittel']) {
    await stageTool(page, tool).click();
    expect(await small(), `${tool} before a tap`).toEqual([]);
    // Not a double tap with the tap for the tool before.
    await page.waitForTimeout(400);
    await page.mouse.click(spot.x, spot.y);
    await expect(page.getByTestId('tool-panel')).toHaveClass(/has-result/);
    expect(await small(), `${tool} after a tap`).toEqual([]);
  }
  // The row itself: four tools and the joystick, each a full target, on one line.
  const row = await page
    .getByTestId('tool-strip')
    .getByRole('button')
    .evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).map((r) => ({ y: r.y, h: r.height, w: r.width })),
    );
  expect(row.length).toBe(5);
  expect(row.every((r) => r.h >= 47.5 && r.w >= 47.5)).toBe(true);
  expect(new Set(row.map((r) => Math.round(r.y))).size).toBe(1);
});
