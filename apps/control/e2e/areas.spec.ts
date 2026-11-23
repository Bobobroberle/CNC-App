import { expect, test, type Page } from '@playwright/test';
import {
  connect,
  goTo,
  hold,
  installFakeFluidNC,
  moreOptions,
  openApp,
  pressAndHold,
  sent,
} from './helpers';

// What lies beside the five steps (DESIGN.md §3.3, §5, §6.3): the jog panel, the bottom
// sheet of the machine's touch screen, Service & Diagnose, the message centre, the phone.

const status = (page: Page, text: string) =>
  page.evaluate((s) => {
    (window as unknown as { __status: string }).__status = s;
  }, text);

const jogs = async (page: Page) => (await sent(page)).filter((line) => line.startsWith('$J='));

const box = async (page: Page, selector: string) =>
  (await page.locator(selector).first().boundingBox())!;

/** Whether nothing lies over a control: a tap at its middle reaches it. */
const reachable = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    });

test.describe('the jog panel', () => {
  test('cross, Z, the step widths of the guide, axis colours – and "Mehr Optionen" for the rest', async ({
    page,
  }) => {
    await installFakeFluidNC(page);
    await openApp(page);
    await connect(page);
    await page.getByTestId('jog-toggle').click();
    const panel = page.getByTestId('jog-panel');
    await expect(panel).toBeVisible();

    const steps = page.getByRole('group', { name: 'Schrittweite' }).getByRole('button');
    await expect(steps).toHaveText(['0,01 mm', '0,1 mm', '1 mm', '10 mm', 'Dauer']);
    for (const name of [/^X\+/, /^X−/, /^Y\+/, /^Y−/, /^Z\+/, /^Z−/]) {
      await expect(panel.getByRole('button', { name })).toBeVisible();
    }
    // No rotary axis in this profile: no A.
    await expect(page.getByTestId('jog-rotary')).toHaveCount(0);

    await expect(panel.getByRole('button', { name: /^X\+/ })).toBeEnabled();
    // The axes wear the colours of the tokens – the same as in the position display.
    const colour = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).color);
    const token = (name: string) =>
      page.evaluate((n) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${n})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }, name);
    for (const axis of ['x', 'y', 'z']) {
      expect(await colour(`.jog-${axis}p .jog-label`)).toBe(await token(`--axis-${axis}`));
    }

    // The quick actions are three holds.
    const quick = page.getByTestId('jog-quick').locator('button.hold');
    await expect(quick).toHaveText([/^Gehe zu Null/, /^Parkposition/, /^Referenzfahrt/]);

    // The long step, the other ways of moving, single axes and the macros: "Mehr Optionen".
    await expect(page.getByRole('button', { name: '100 mm', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Ref\. Z/ })).toBeHidden();
    await moreOptions(page, 'jog');
    await expect(page.getByRole('button', { name: '100 mm', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Handrad', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Ref\. Z/ })).toBeVisible();
    // Folded again, the app remembers it – and the cross is still all there.
    await page.getByTestId('depth-more-jog').locator('[data-fold-trigger]').first().click();
    await expect(page.getByRole('button', { name: '100 mm', exact: true })).toHaveCount(0);
  });

  test('quick actions move only by a hold, and say why when they cannot', async ({ page }) => {
    await installFakeFluidNC(page);
    await openApp(page);
    await status(page, '<Idle|MPos:10.000,20.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>');
    await connect(page);
    await page.getByTestId('jog-toggle').click();
    const zero = page.getByTestId('quick-zero').locator('button');
    const park = page.getByTestId('quick-park').locator('button');

    // No zero yet, not homed, no park position: both say why, on a tap.
    await expect(zero).toBeDisabled();
    await expect(park).toBeDisabled();
    await page.getByTestId('quick-zero').click({ force: true });
    await expect(
      page.getByRole('tooltip').filter({ hasText: 'Noch kein Nullpunkt' }),
    ).toBeVisible();
    await page.getByTestId('quick-park').click({ force: true });
    await expect(
      page.getByRole('tooltip').filter({ hasText: 'Erst die Referenzfahrt' }),
    ).toBeVisible();

    // Homing is a hold; a tap does nothing.
    await page.getByTestId('quick-home').locator('button').click();
    expect(await sent(page)).not.toContain('$H');
    await hold(page, /^Referenzfahrt/);
    await expect.poll(() => sent(page)).toContain('$H');

    // With a zero set: "Gehe zu Null" lifts first, then drives X/Y there. Z never goes down.
    await status(page, '<Idle|MPos:10.000,20.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>');
    await expect(zero).toBeEnabled();
    await zero.click();
    expect(await jogs(page)).toEqual([]);
    await pressAndHold(page, zero);
    await expect.poll(() => jogs(page)).toHaveLength(2);
    const [lift, drive] = await jogs(page);
    expect(lift).toMatch(/^\$J=G53 G90 G21 Z1 F/);
    expect(drive).toMatch(/^\$J=G53 G90 G21 X600 Y1200 F/);

    // The park position is stored where the machine stands, and driven to by its hold.
    await expect(
      page.getByRole('tooltip').filter({ hasText: 'Noch keine Parkposition' }),
    ).toHaveCount(1);
    await moreOptions(page, 'jog');
    const card = page.getByTestId('park-card');
    await expect(card).toContainText('Noch keine Parkposition gemerkt.');
    await card.getByRole('button', { name: 'Aktuelle Position merken' }).click();
    await expect(card).toContainText('X 10,0 · Y 20,0');
    await status(page, '<Idle|MPos:300.000,400.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>');
    await expect(park).toBeEnabled();
    const before = (await jogs(page)).length;
    await pressAndHold(page, park);
    await expect.poll(async () => (await jogs(page)).length).toBe(before + 2);
    const moves = (await jogs(page)).slice(before);
    expect(moves[0]).toMatch(/^\$J=G53 G90 G21 Z1 F/);
    expect(moves[1]).toMatch(/^\$J=G53 G90 G21 X10 Y20 F/);

    // While something runs nothing of this can be held.
    await status(
      page,
      '<Run|MPos:300.000,400.000,-10.000|FS:900,18000|WCO:600.000,1200.000,-60.000>',
    );
    await expect(zero).toBeDisabled();
    await expect(park).toBeDisabled();
    await expect(page.getByRole('button', { name: /^X\+/ })).toBeDisabled();
  });

  test('the mouse wheel jogs fine only while its field is held – the axis moved last', async ({
    page,
    hasTouch,
  }) => {
    test.skip(hasTouch, 'the wheel field shows only where there is a mouse');
    await installFakeFluidNC(page);
    await openApp(page);
    await connect(page);
    await page.getByTestId('jog-toggle').click();
    const field = page.getByTestId('wheel-fine');
    // Nothing has been moved yet: no axis to jog, and the field says so.
    await expect(field).toBeDisabled();
    await expect(
      page.getByRole('tooltip').filter({ hasText: 'Erst eine Achse bewegen' }),
    ).toHaveCount(1);

    await page.getByRole('button', { name: /^Y−/ }).click();
    await expect.poll(() => jogs(page)).toEqual(['$J=G91 G21 Y-10 F3000']);
    await expect(field).toBeEnabled();
    await expect(field).toContainText('Y in 0,1 mm');

    // A wheel that just turns moves nothing – over the field or anywhere else.
    await field.hover();
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);
    expect(await jogs(page)).toHaveLength(1);

    // Held: one fine step per notch, away from the operator is plus.
    await field.hover();
    await page.mouse.down();
    await expect(field).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.wheel(0, -100);
    await expect.poll(() => jogs(page)).toEqual(['$J=G91 G21 Y-10 F3000', '$J=G91 G21 Y0.1 F3000']);
    await page.mouse.wheel(0, 200);
    await expect.poll(async () => (await jogs(page)).at(-1)).toBe('$J=G91 G21 Y-0.2 F3000');

    // Leaving the app lets go, like every hold: the wheel is dead again although the button is down.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(field).toHaveAttribute('aria-pressed', 'false');
    const count = (await jogs(page)).length;
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);
    expect(await jogs(page)).toHaveLength(count);
    await page.mouse.up();

    // Let go: dead as well.
    await page.mouse.down();
    await page.mouse.up();
    await expect(field).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);
    expect(await jogs(page)).toHaveLength(count);
  });
});

test.describe('the bottom sheet of the machine screen (800 × 600)', () => {
  test.use({ viewport: { width: 800, height: 600 } });

  const level = (page: Page) => page.locator('[data-slot="sheet"]').getAttribute('data-level');

  test('starts below the picture, has three rests and never reaches PAUSE, NOT-HALT or the action bar', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Beispiel laden' }).click();
    expect(await level(page)).toBe('half');

    const inFrame = async () => {
      const [panel, bar, nav] = [
        await box(page, '.panel'),
        await box(page, '.actionbar'),
        await box(page, '.statusbar'),
      ];
      expect(panel.y).toBeGreaterThanOrEqual(nav.y + nav.height);
      expect(panel.y + panel.height).toBeLessThanOrEqual(bar.y + 1);
      for (const control of ['[data-testid="pause"]', '.estop', '[data-testid="primary-action"]']) {
        expect(await reachable(page, control), control).toBe(true);
      }
    };

    // Half: the picture is whole above the sheet – nothing lies over it.
    const [stage, panel] = [await box(page, '.stage-wrap'), await box(page, '.panel')];
    expect(stage.y + stage.height).toBeLessThanOrEqual(panel.y);
    expect(stage.height).toBeGreaterThanOrEqual(120);
    expect(await reachable(page, '[data-testid="stage-canvas"]')).toBe(true);
    await inFrame();

    // Larger: the whole work area, still inside the frame.
    await page.locator('[data-slot="sheet-larger"]').click();
    expect(await level(page)).toBe('full');
    await inFrame();
    expect((await box(page, '.panel')).height).toBeGreaterThan(panel.height + 100);
    await expect(page.locator('[data-slot="sheet-larger"]')).toHaveCount(0);

    // Smaller, then folded to its handle: the picture grows and gets its switches back.
    await page.locator('[data-slot="sheet-smaller"]').click();
    expect(await level(page)).toBe('half');
    await page.locator('[data-slot="sheet-smaller"]').click();
    expect(await level(page)).toBe('peek');
    await expect(page.locator('.panel-body')).toBeHidden();
    expect((await box(page, '.stage-wrap')).height).toBeGreaterThan(stage.height + 60);
    await expect(page.getByRole('group', { name: 'Ansicht der Bühne' })).toBeVisible();
    await inFrame();
    // The handle itself unfolds it again.
    await page.locator('[data-slot="sheet-handle"]').click();
    expect(await level(page)).toBe('half');
  });

  test('remembers its rest per place, and a folded one comes back up when one goes there', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Beispiel laden' }).click();
    await page.locator('[data-slot="sheet-larger"]').click();
    expect(await level(page)).toBe('full');
    await goTo(page, 'Werkzeuge');
    expect(await level(page)).toBe('half');
    await page.locator('[data-slot="sheet-smaller"]').click();
    expect(await level(page)).toBe('peek');
    await page.getByTestId('step-job').click();
    expect(await level(page)).toBe('full');
    await page.getByTestId('step-run').click();
    await expect.poll(() => level(page)).toBe('half');
  });

  test('the jog panel says its name once, keeps the picture and does not move under a held button', async ({
    page,
  }) => {
    await installFakeFluidNC(page);
    await openApp(page);
    await page.getByRole('button', { name: 'Beispiel laden' }).click();
    await connect(page);
    await page.getByTestId('jog-toggle').click();
    await expect(page.getByTestId('jog-panel')).toBeVisible();
    await expect(
      page.getByText('Jog / Manuell', { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    // The cross, Z, the step widths and the quick actions are all in reach without scrolling.
    for (const name of [/^X\+/, /^Y−/, /^Z−/, 'Dauer', /^Referenzfahrt/]) {
      await expect(page.getByRole('button', { name }).first()).toBeInViewport({ ratio: 1 });
    }
    const stage = await box(page, '.stage-wrap');
    expect(stage.height).toBeGreaterThanOrEqual(100);
    expect(stage.y + stage.height).toBeLessThanOrEqual((await box(page, '.panel')).y);

    // Held: the sheet stays as it is, whatever asks it to change.
    await page.getByRole('button', { name: 'Dauer' }).click();
    const button = page.getByRole('button', { name: /^X\+/ });
    const at = (await button.boundingBox())!;
    await button.hover();
    await page.mouse.down();
    await expect.poll(async () => (await jogs(page)).length).toBe(1);
    await page.locator('[data-slot="sheet-larger"]').evaluate((el) => (el as HTMLElement).click());
    await page.locator('[data-slot="sheet-handle"]').evaluate((el) => (el as HTMLElement).click());
    expect(await level(page)).toBe('half');
    expect(await button.boundingBox()).toEqual(at);
    await page.mouse.up();
    // Let go: it stopped, and now the sheet follows its buttons again.
    await expect.poll(() => sent(page)).toContain('0x85');
    await page.locator('[data-slot="sheet-larger"]').click();
    expect(await level(page)).toBe('full');
    // Closing the panel from the handle brings the step back.
    await page.getByTestId('jog-close').click();
    await expect(page.getByTestId('jog-panel')).toHaveCount(0);
    await expect(page.getByTestId('step-job')).toBeVisible();
  });
});

/** A line FluidNC says by itself. */
const says = (page: Page, line: string) =>
  page.evaluate((l) => {
    (window as unknown as { __socket: { emit(line: string): void } }).__socket.emit(l);
  }, line);

const flag = (page: Page) => page.getByTestId('messages-flag');
const centre = (page: Page) => page.getByTestId('message-centre');

test.describe('Service & Diagnose', () => {
  test('lists without the picture; calibrating and the camera keep it', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    for (const [area, view, stage] of [
      ['Werkzeugliste', undefined, false],
      ['Service & Diagnose', 'Diagnose', false],
      ['Service & Diagnose', 'Meldungen', false],
      ['Service & Diagnose', 'Historie', false],
      ['Service & Diagnose', 'Kalibrieren', true],
      ['Einstellungen', 'Verbindung', false],
      ['Einstellungen', 'Maschine', false],
      ['Einstellungen', 'Kamera', true],
    ] as const) {
      await goTo(page, area, view);
      await expect(page.getByTestId('stage-canvas'), `${area} ${view}`).toHaveCount(stage ? 1 : 0);
      // One primary action bottom right, status bar and PAUSE in sight – on every one of them.
      await expect(page.getByTestId('primary-action')).toHaveCount(1);
      await expect(page.getByTestId('pause')).toBeInViewport({ ratio: 1 });
    }
    // The jog panel brings the picture back over a list.
    await goTo(page, 'Werkzeugliste');
    await page.getByTestId('jog-toggle').click();
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(page.getByTestId('jog-panel')).toBeVisible();
  });

  test('inputs live, what is known about the connection, and an axis test by holds', async ({
    page,
  }) => {
    await installFakeFluidNC(page);
    await openApp(page);
    await goTo(page, 'Service & Diagnose', 'Diagnose');
    const info = page.getByTestId('connection-info');
    await expect(info).toContainText('Getrennt');
    await expect(info).toContainText('nicht bekannt');
    // Without a connection the test cannot move, and says why.
    const xPlus = page.getByTestId('axis-test-X').getByRole('button', { name: /^X\+ 10 mm/ });
    await expect(xPlus).toBeDisabled();
    await expect(page.getByTestId('axis-test-X').getByRole('tooltip')).toContainText(
      'Nicht verbunden',
    );

    await status(page, '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000|Pn:XP>');
    await connect(page);
    await goTo(page, 'Service & Diagnose', 'Diagnose');
    await expect(info).toContainText('192.168.178.40');
    await expect(info).toContainText('FluidNC v3.7.12');
    await expect(info).toContainText('Idle');
    // Inputs as the controller reports them: X and the probe plate are triggered.
    const inputs = page.getByTestId('inputs').first();
    await expect(inputs.locator('.input-led.on')).toHaveText([
      /Endschalter X.*ausgelöst/,
      /Tastplatte.*ausgelöst/,
    ]);

    // A tap moves nothing; the hold sends one jog of the chosen distance.
    await expect(xPlus).toBeEnabled();
    await xPlus.click();
    expect(await jogs(page)).toEqual([]);
    await pressAndHold(page, xPlus);
    await expect.poll(() => jogs(page)).toEqual(['$J=G91 G21 X10 F3000']);
    const row = page.getByTestId('axis-test-X');
    await expect(row).toContainText('fährt …');
    // The controller reports the move: asked and reported agree.
    await status(page, '<Idle|MPos:110.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>');
    await expect(row).toContainText('Soll +10,00 mm · gemeldet +10,00 mm – passt');

    // Another distance, the other way – and a move that does not arrive is said, not hidden.
    await page
      .getByRole('group', { name: 'Strecke des Achstests' })
      .getByRole('button', { name: '1 mm' })
      .click();
    const zMinus = page.getByTestId('axis-test-Z').getByRole('button', { name: /^Z− 1 mm/ });
    await pressAndHold(page, zMinus);
    await expect.poll(async () => (await jogs(page)).at(-1)).toBe('$J=G91 G21 Z-1 F600');
    await status(page, '<Idle|MPos:110.000,200.000,-10.400|FS:0,0|WCO:0.000,0.000,0.000>');
    await expect(page.getByTestId('axis-test-Z')).toContainText('nicht angekommen', {
      timeout: 25_000,
    });
    await expect(page.getByTestId('axis-test-Z')).toContainText('gemeldet −0,40 mm');
  });

  test('running time comes from the job history only – no invented hours', async ({ page }) => {
    await openApp(page);
    await goTo(page, 'Service & Diagnose', 'Historie');
    const card = page.getByTestId('run-time');
    await expect(card).toContainText('Noch kein Job aufgezeichnet');
    await expect(card).toContainText('zählt keine Betriebsstunden der Spindel');
    await expect(card.locator('.run-time-value')).toHaveCount(0);
  });
});

test.describe('the message centre (§6.3)', () => {
  test('five levels: a toast that goes, a hint that stays, a warning to acknowledge, a fault with its way out', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installFakeFluidNC(page);
    await openApp(page);
    await status(page, '<Idle|MPos:5.000,5.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>');
    await expect(flag(page)).not.toHaveAttribute('data-open');
    await connect(page);

    // Information: a toast, and it goes by itself. It asks for nothing: the flag stays quiet.
    const toasts = page.getByTestId('toasts');
    await expect(toasts.locator('[data-level="info"]')).toContainText('Verbunden');
    await expect(flag(page)).not.toHaveAttribute('data-open');
    await expect(toasts.locator('[data-slot="toast"]')).toHaveCount(0, { timeout: 10_000 });

    // Hint: homed, a jog past the limit is shortened – no toast, it waits in the centre.
    await page.getByTestId('jog-toggle').click();
    await hold(page, /^Referenzfahrt/);
    await expect(toasts).toContainText('Referenzfahrt abgeschlossen');
    await expect(toasts.locator('[data-slot="toast"]')).toHaveCount(0, { timeout: 10_000 });
    await page.getByRole('button', { name: /^X−/ }).click();
    await expect.poll(async () => (await jogs(page)).length).toBe(1);
    await page.waitForTimeout(300);
    await expect(toasts.locator('[data-slot="toast"]')).toHaveCount(0);
    await expect(flag(page)).not.toHaveAttribute('data-open');

    // Warning: the controller rejects a command. A toast, and the flag counts it until acknowledged.
    await says(page, 'error:20');
    await expect(toasts.locator('[data-level="warning"]')).toContainText('Befehl abgelehnt');
    await expect(flag(page)).toHaveAttribute('data-open', '');
    await expect(flag(page)).toHaveAttribute('data-level', 'warning');
    await expect(flag(page)).toContainText('1');
    // It blocks nothing: the machine still jogs.
    await page.getByRole('button', { name: /^X\+/ }).click();
    await expect.poll(async () => (await jogs(page)).length).toBe(2);

    // Fault: an alarm. It cannot be acknowledged away, and what it blocks is blocked.
    await status(page, '<Alarm|MPos:5.000,5.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>');
    await says(page, 'ALARM:1');
    await expect(flag(page)).toHaveAttribute('data-level', 'fault');
    await expect(flag(page)).toContainText('2');
    await expect(page.getByRole('button', { name: /^X\+/ })).toBeDisabled();

    // The centre opens from the flag, below the status bar: PAUSE and NOT-HALT stay free.
    await flag(page).click();
    await expect(centre(page)).toBeVisible();
    const top = (await centre(page).boundingBox())!.y;
    const bar = (await page.locator('.statusbar').boundingBox())!;
    expect(top).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
    expect(await reachable(page, '[data-testid="pause"]')).toBe(true);
    expect(await reachable(page, '.estop')).toBe(true);

    // Every message: level, name, cause, effect, next step – the controller's code small behind it.
    const messages = centre(page).getByTestId('message');
    const fault = messages.filter({ hasText: 'Endschalter ausgelöst' });
    await expect(fault).toHaveAttribute('data-level', 'fault');
    await expect(fault.locator('.message-level')).toHaveText('Störung');
    await expect(fault.locator('.message-code')).toHaveText('ALARM:1');
    await expect(fault.locator('dt')).toHaveText(['Ursache', 'Auswirkung', 'Nächste Maßnahme']);
    await expect(fault).toContainText('Die Steuerung ist gesperrt');
    await expect(fault).toContainText('steht an');
    await expect(fault.getByRole('button', { name: /bestätigen/ })).toHaveCount(0);
    const warning = messages.filter({ hasText: 'Befehl abgelehnt' });
    await expect(warning.locator('.message-level')).toHaveText('Warnung');
    await expect(warning.locator('.message-code')).toHaveText('error:20');
    await expect(warning).toContainText('offen – bitte bestätigen');
    const hint = messages.filter({ hasText: 'gekürzt' });
    await expect(hint.locator('.message-level')).toHaveText('Hinweis');
    await expect(hint).toContainText('Kleinere Schrittweite');
    await expect(
      messages.filter({ hasText: 'Verbunden mit' }).locator('.message-level'),
    ).toHaveText('Information');

    // The filter by level.
    const filter = centre(page).getByRole('group', { name: 'Stufe' });
    await filter.getByRole('button', { name: /^Warnung/ }).click();
    await expect(messages).toHaveCount(1);
    await filter.getByRole('button', { name: /^Kritisch/ }).click();
    await expect(centre(page)).toContainText('Keine Meldungen dieser Stufe.');
    await filter.getByRole('button', { name: /^Alle/ }).click();

    // Acknowledging the warning takes it off the flag; the fault stays.
    await warning.getByRole('button', { name: 'Warnung bestätigen' }).click();
    await expect(warning).toContainText('bestätigt');
    await expect(flag(page)).toContainText('1');
    await expect(flag(page)).toHaveAttribute('data-level', 'fault');

    // The fault's way out is a hold; with the alarm gone it is resolved and the flag is quiet.
    await fault.getByRole('button', { name: /^Entsperren/ }).click();
    expect(await sent(page)).not.toContain('$X');
    await pressAndHold(page, fault.getByRole('button', { name: /^Entsperren/ }));
    await expect.poll(() => sent(page)).toContain('$X');
    await status(page, '<Idle|MPos:5.000,5.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>');
    await expect(fault).toContainText('behoben');
    await expect(flag(page)).not.toHaveAttribute('data-open');

    // One dialog at a time: closing the centre is its one primary action; the history keeps all.
    await centre(page).getByRole('button', { name: 'Zur Historie' }).click();
    await expect(centre(page)).toHaveCount(0);
    const history = page.getByTestId('message-history');
    await expect(history.getByTestId('message')).toHaveCount(5);
    await history
      .getByRole('group', { name: 'Stufe' })
      .getByRole('button', { name: /^Störung/ })
      .click();
    await expect(history.getByTestId('message')).toHaveCount(1);
  });

  test('the critical message has the work area to itself: the centre closes, the flag opens nothing over it', async ({
    page,
  }) => {
    await installFakeFluidNC(page);
    await openApp(page);
    await status(page, '<Idle|MPos:600.000,1200.000,-10.000|FS:0,0|WCO:600.000,1200.000,-60.000>');
    await page.getByRole('button', { name: 'Beispiel laden' }).click();
    await connect(page);
    await goTo(page, 'Fräsen');
    await pressAndHold(page, page.getByTestId('primary-action').locator('button.hold'), 1300);
    await expect
      .poll(async () => (await sent(page)).filter((l) => l.startsWith('$SD/Run=')).length)
      .toBe(1);
    await status(page, '<Run|MPos:610.000,1210.000,-62.000|FS:900,18000|SD:42.0,/sd/job.nc>');
    await expect(page.getByTestId('running-job')).toBeVisible();
    await flag(page).click();
    await expect(centre(page)).toBeVisible();

    await page.evaluate(() =>
      (window as unknown as { __socket: { close(): void } }).__socket.close(),
    );
    const critical = page.getByTestId('critical');
    await expect(critical).toBeVisible();
    await expect(centre(page)).toHaveCount(0);
    await expect(page.locator('[role="dialog"], [role="alertdialog"]')).toHaveCount(1);
    // It does not move: alarms are never animated in this app.
    expect(
      await critical.evaluate((el) =>
        [el, ...el.querySelectorAll('*')].every((node) => {
          const style = getComputedStyle(node);
          return style.animationName === 'none' || style.animationIterationCount !== 'infinite';
        }),
      ),
    ).toBe(true);
    // The flag counts it, but opens nothing over it.
    await expect(flag(page)).toHaveAttribute('data-level', 'critical');
    await flag(page).click({ force: true });
    await expect(centre(page)).toHaveCount(0);
    await expect(critical).toBeVisible();
    // Acknowledged where it shows; then it is history, with its four parts.
    await critical.getByRole('button', { name: 'Meldung quittieren' }).click();
    await expect(critical).toHaveCount(0);
    await expect(flag(page)).not.toHaveAttribute('data-level', 'critical');
    await flag(page).click();
    const message = centre(page).getByTestId('message').filter({ hasText: 'Verbindung während' });
    await expect(message.locator('.message-level')).toHaveText('Kritisch');
    await expect(message).toContainText('bestätigt');
    await expect(message).toContainText('Not-Aus an der Maschine');
  });
});

test.describe('the phone (< 600 px)', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test('watches a running job: state, progress, the picture, PAUSE in one tap, abort with a question, NOT-HALT', async ({
    page,
  }) => {
    await installFakeFluidNC(page);
    await page.addInitScript(() => localStorage.setItem('lowrider-control.url', '192.168.178.40'));
    await page.goto('/');
    const monitor = page.getByTestId('monitor');
    await expect(monitor).toContainText('Es läuft kein Job.');
    await monitor.getByRole('button', { name: 'Verbinden' }).click();
    await expect(page.getByTestId('machine-state')).toContainText('Bereit');
    await status(page, '<Run|MPos:10.000,20.000,-2.000|FS:900,18000|SD:42.0,/sd/schild.nc>');
    await expect(page.getByTestId('machine-state')).toContainText('Läuft');
    await expect(page.getByTestId('monitor-progress')).toHaveText('42 %');
    // The figure is read from across the room: the size of ⑤.
    expect(
      await page
        .getByTestId('monitor-progress')
        .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(48);
    await expect(page.getByTestId('monitor-position')).toContainText('10.0');
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    // Nothing to set up or start from here.
    await expect(page.locator('.navrow, .actionbar, .panel')).toHaveCount(0);
    for (const control of ['[data-testid="pause"]', '.estop']) {
      await expect(page.locator(control)).toBeInViewport({ ratio: 1 });
      expect(await reachable(page, control), control).toBe(true);
    }

    // Pause = one interaction.
    await page.getByTestId('pause').click();
    await expect.poll(() => sent(page)).toContain('!');
    await status(page, '<Hold:0|MPos:10.000,20.000,-2.000|FS:0,18000|SD:42.0,/sd/schild.nc>');
    await expect(page.getByTestId('monitor-paused')).toBeVisible();

    // Nothing sticks out sideways.
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('.app *')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => el.className.toString().slice(0, 40)),
    );
    expect(overflow).toEqual([]);

    // Abort asks first; the question leaves PAUSE and NOT-HALT free.
    await page.getByTestId('monitor-abort').click();
    const dialog = page.getByTestId('abort-dialog');
    await expect(dialog).toBeVisible();
    expect(await sent(page)).not.toContain('0x18');
    expect(await reachable(page, '.estop')).toBe(true);
    await dialog.getByRole('button', { name: 'Job weiterlaufen lassen' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await sent(page)).not.toContain('0x18');

    // A message that waits shows here too and leads to the centre.
    await says(page, 'error:20');
    await page.getByTestId('monitor-message').click();
    await expect(centre(page)).toContainText('Befehl abgelehnt');
  });
});
