import { expect, test, type Page } from '@playwright/test';
import {
  closeJog,
  connect,
  goTo,
  installFakeFluidNC,
  openApp,
  openDemo,
  openJog,
  sent,
  stageMode,
  stageTool,
} from './helpers';

// The quick search ("Schnellsuche") and the keys: one field that finds a function by any
// word for it, leads there and shows it – and never does anything at the machine itself.

const palette = (page: Page) => page.getByTestId('find');
const input = (page: Page) => page.getByTestId('find-input');
const rows = (page: Page) => page.getByTestId('find-list').getByRole('option');
// By the markup, not by the role: while a sheet is open, the steps behind it are hidden from
// assistive technology (only PAUSE and NOT-HALT are not), and a role lookup would not see them.
const step = (page: Page, id: string) => page.locator(`[data-testid="step-${id}"]`);

/** Types a query and takes the hit at the top. */
async function find(page: Page, query: string, title: string, place: string) {
  await page.keyboard.press('Control+k');
  await input(page).fill(query);
  const top = rows(page).first();
  await expect(top).toContainText(title);
  await expect(top).toContainText(place);
  await expect(top).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
}

/** The place the search led to: outlined, and on screen. */
async function landed(page: Page, anchor: string) {
  const place = page.locator(`[data-find~="${anchor}"]`);
  await expect(place).toHaveClass(/found/);
  await expect(place).toBeInViewport();
  return place;
}

test('the search opens by its button, by Ctrl+K and by "/", and closes again', async ({ page }) => {
  await openApp(page);
  const button = page.getByTestId('find-button');
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(box.width).toBeGreaterThanOrEqual(48);
  // It lies in the row of the steps, below the status bar: PAUSE and NOT-HALT keep their place.
  const estop = (await page.getByRole('button', { name: 'NOT-HALT' }).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(estop.y + estop.height);
  expect(estop.x + estop.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.getByRole('button', { name: 'PAUSE' })).toBeInViewport({ ratio: 1 });

  await button.click();
  await expect(palette(page)).toBeVisible();
  await expect(palette(page)).toHaveAttribute('role', 'dialog');
  await expect(input(page)).toBeFocused();
  // Nothing typed: the quick access, a handful of big rows.
  await expect(page.getByTestId('find-list')).toContainText('Schnellzugriff');
  expect(await rows(page).count()).toBeGreaterThanOrEqual(5);
  for (const row of await rows(page).all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  // Tab stays inside the sheet.
  await page.keyboard.press('Tab');
  await expect(palette(page).getByRole('button', { name: 'Schließen' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  // The focus is back where it was.
  await expect(button).toBeFocused();

  await page.keyboard.press('Control+k');
  await expect(input(page)).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeHidden();

  await button.blur();
  await page.keyboard.press('/');
  await expect(input(page)).toBeFocused();
  // The key that opened it is not typed into the field; typed there, "/" is a letter.
  await expect(input(page)).toHaveValue('');
  await page.keyboard.type('a/b');
  await expect(input(page)).toHaveValue('a/b');
  await expect(palette(page)).toBeVisible();

  // A tap beside the sheet closes it.
  const sheet = (await palette(page).boundingBox())!;
  await page.mouse.click(sheet.x + sheet.width / 2, page.viewportSize()!.height - 6);
  await expect(palette(page)).toBeHidden();
});

test('a wrong word or a typing mistake finds the function, and choosing it leads there', async ({
  page,
}) => {
  await openDemo(page);

  // "Zwinge" is what he calls it; the tool is called "Spannmittel".
  await find(page, 'zwinge', 'Spannmittel', 'Bühne');
  await landed(page, 'tool-clamp');
  await expect(stageTool(page, 'Spannmittel')).toHaveAttribute('aria-pressed', 'true');

  // English jargon: it lives in the jog panel, which opens over the step that is on.
  await find(page, 'homing', 'Referenzfahrt', 'Jog / Manuell');
  await expect(page.getByTestId('jog-panel')).toBeVisible();
  await expect(step(page, 'job')).toHaveAttribute('aria-current', 'step');
  const homing = await landed(page, 'jog-quick');
  await expect(homing.getByRole('button', { name: /^Referenzfahrt/ })).toBeVisible();

  // A typing mistake.
  await find(page, 'refrenzfahrt', 'Referenzfahrt', 'Jog / Manuell');
  await find(page, 'nulpunkt', 'Nullpunkt', 'Bühne');
  await expect(stageTool(page, 'Nullpunkt')).toHaveAttribute('aria-pressed', 'true');

  // A view of an area; its tab is the current one.
  await find(page, 'kallibrieren', 'Kalibrieren', 'Service & Diagnose · Kalibrieren');
  await expect(step(page, 'service')).toHaveAttribute('aria-current', 'step');
  await expect(step(page, 'service')).toContainText('Service');
  await expect(page.getByTestId('jog-panel')).toHaveCount(0);
  await landed(page, 'accuracy');
  await expect(page.getByTestId('accuracy-check')).toBeVisible();

  // Something deep inside a folded section.
  await find(page, 'englisch', 'Sprache', 'Einstellungen · Maschine');
  await landed(page, 'language');

  // The new places: a step, the theme, the status bar.
  await find(page, 'einrichten', 'Einrichten', 'Navigation');
  await expect(step(page, 'setup')).toHaveAttribute('aria-current', 'step');
  await find(page, 'dark mode', 'Darstellung', 'Einstellungen · Maschine');
  await landed(page, 'appearance');
  await find(page, 'vorschub halten', 'PAUSE', 'Statusleiste');
  await landed(page, 'pause');

  // The drawing workspace.
  await find(page, 'skizze', 'Zeichnen', 'Zeichnen/CAM');
  await expect(page.getByTestId('cam-card')).toBeVisible();
  await landed(page, 'cam-draw');
  // Nothing was drawn by going there.
  await expect(page.getByTestId('cam-add').getByRole('button', { name: 'Rechteck' })).toBeVisible();

  // A part too long for the table: the demo's job fits, so the search leads to the list
  // that offers the sections when one does not.
  await find(page, 'zu lang', 'In Abschnitten fräsen', 'Prüfen');
  await expect(page.getByTestId('cam-card')).toBeHidden();
  await landed(page, 'readiness');

  // What was used comes back as "Zuletzt benutzt".
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('find-list')).toContainText('Zuletzt benutzt');
  await expect(page.locator('[data-command="appearance"]')).toBeVisible();

  // Nothing found: said plainly, with the quick access below.
  await input(page).fill('xyzq');
  await expect(page.getByTestId('find-none')).toContainText('Nichts gefunden für „xyzq“');
  expect(await rows(page).count()).toBeGreaterThanOrEqual(5);

  // Arrow keys walk the list; a tap takes a row.
  await input(page).fill('kamera');
  await expect(rows(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(rows(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(input(page)).toHaveAttribute(
    'aria-activedescendant',
    (await rows(page).nth(1).getAttribute('id'))!,
  );
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(rows(page).last()).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-command="stageCamera"]').click();
  await expect(palette(page)).toBeHidden();
  await expect(stageMode(page, 'Kamera')).toHaveAttribute('aria-pressed', 'true');
});

test('without a program the steps of the job lead to the program card, and say so', async ({
  page,
}) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  await input(page).fill('simulation');
  await expect(rows(page).first()).toContainText('zeigt sich mit einem geladenen Programm');
  await page.keyboard.press('Enter');
  await landed(page, 'program');
  // Expert tools: the switch that shows them.
  await page.keyboard.press('Control+k');
  await input(page).fill('firmware');
  await expect(rows(page).first()).toContainText('nur mit Expertenfunktionen');
  await page.keyboard.press('Enter');
  await landed(page, 'expert-mode');
});

test('the search never sends anything to the machine; NOT-HALT works while it is open', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  await page.waitForTimeout(500);
  const before = await sent(page);

  // Everything that sounds like motion or a start is only gone to.
  for (const query of [
    'referenzfahrt',
    '$H',
    'start',
    'job starten',
    'notaus',
    'nullpunkt setzen',
    'joggen',
    'makro',
    'z antasten',
    'entsperren',
    'pause',
    'spindel',
    'hinfahren',
    'sd karte',
    'wiederaufnahme',
    'autolevel',
    'konsole',
  ]) {
    await page.keyboard.press('Control+k');
    await input(page).fill(query);
    await expect(rows(page).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    // Enter once more, as an impatient hand does: the focus is not on a control of the machine.
    await page.keyboard.press('Enter');
  }
  // The global keys.
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  // (The jog panel is closed: with it open the arrows would jog – by the operator's own key.)
  await closeJog(page);
  for (const key of [
    '1',
    '2',
    '5',
    't',
    'k',
    'd',
    'e',
    'Control+ArrowRight',
    ' ',
    '?',
    'Escape',
    '/',
    'Escape',
    'Escape',
  ]) {
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(300);
  // A card that reads when it is shown (the list of the SD card) does so as when opened by
  // hand; nothing else goes out – no move, no start, no setting.
  const reads = (lines: string[]) => lines.filter((line) => line !== '$SD/List');
  expect(reads(await sent(page))).toEqual(reads(before));

  // The red button stays above the search: one tap, as ever.
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  const estop = page.getByRole('button', { name: 'NOT-HALT' });
  await expect(estop).toBeInViewport();
  const spot = (await estop.boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, {
    x: spot.x + spot.width / 2,
    y: spot.y + spot.height / 2,
  });
  expect(hit).toContain('estop');
  await estop.click();
  await expect.poll(() => sent(page)).toEqual(expect.arrayContaining(['!', '\u0018']));
});

test('keys: views by one key, none for a "next step", not while typing; "?" shows them all', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await page.locator('body').click({ position: { x: 2, y: 2 } });

  // There is no chain of steps and so no key for it: Ctrl+→ goes nowhere, from any place.
  await page.keyboard.press('Control+ArrowRight');
  await expect(step(page, 'job')).not.toHaveAttribute('aria-current', 'step');
  await goTo(page, 'Fräsen');
  await page.keyboard.press('Control+ArrowRight');
  await expect(step(page, 'run')).toHaveAttribute('aria-current', 'step');
  await page.keyboard.press('d');
  await expect(stageMode(page, '3D')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('k');
  await expect(stageMode(page, 'Kamera')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('t');
  await expect(stageMode(page, 'Tisch')).toHaveAttribute('aria-pressed', 'true');
  // "Einpassen" ends "Folgen".
  await page.getByRole('button', { name: 'Folgen' }).click();
  await expect(page.getByRole('button', { name: 'Folgen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Folgen' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  // Typed into a field, the keys are letters – and Space is a space.
  await goTo(page, 'Einrichten', 'Nullpunkte');
  const field = page.getByTestId('saved-zeros').locator('input[type="text"]').first();
  await field.fill('');
  await field.pressSequentially('1 kd?/');
  await expect(field).toHaveValue('1 kd?/');
  await page.keyboard.press('Control+ArrowRight');
  await expect(step(page, 'setup')).toHaveAttribute('aria-current', 'step');
  await expect(stageMode(page, 'Tisch')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Ctrl+K opens the search from a field too.
  await page.keyboard.press('Control+k');
  await expect(input(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(field).toBeFocused();
  await field.blur();

  // The jog panel: 1–5 choose the step width and move nothing.
  await openJog(page);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const width = (name: string) =>
    page.getByRole('group', { name: 'Schrittweite' }).getByRole('button', { name, exact: true });
  const moved = async () => (await sent(page)).filter((l) => l.startsWith('$J=')).length;
  for (const [key, name] of [
    ['1', '0,01 mm'],
    ['2', '0,1 mm'],
    ['3', '1 mm'],
    ['5', 'Dauer'],
    ['4', '10 mm'],
  ] as const) {
    await page.keyboard.press(key);
    await expect(width(name)).toHaveAttribute('aria-pressed', 'true');
  }
  expect(await moved()).toBe(0);

  // The overview, with the machine keys and the keys of the drawing and of jogging in it.
  await page.keyboard.press('?');
  const keys = page.getByTestId('keys');
  await expect(keys).toBeVisible();
  await expect(keys).not.toContainText('Nächster Schritt');
  for (const text of [
    'Allgemein',
    'Maschine',
    'Ansicht',
    'Zeichnen',
    'Fahren',
    'Schnellsuche öffnen',
    'Pause: Vorschub halten',
    'Leertaste',
    'Job abbrechen (mit Rückfrage)',
    'Ansicht Kamera',
    'Auswahl löschen',
    'X und Y fahren',
    'Schrittweite',
  ]) {
    await expect(keys).toContainText(text);
  }
  // While it is open no key acts on the app – and the arrows do not jog.
  const before = await sent(page);
  await page.keyboard.press('1');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+ArrowRight');
  await page.waitForTimeout(200);
  await expect(step(page, 'setup')).toHaveAttribute('aria-current', 'step');
  expect(await sent(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  await expect(width('10 mm')).toHaveAttribute('aria-pressed', 'true');
  // Closed, the arrow jogs as before; with Ctrl it does nothing at all (no next step, no jog).
  await page.keyboard.press('ArrowRight');
  await expect.poll(moved).toBe(1);
  await page.keyboard.press('Control+ArrowRight');
  await page.waitForTimeout(200);
  await expect(step(page, 'setup')).toHaveAttribute('aria-current', 'step');
  expect(await moved()).toBe(1);

  // The overview is also an entry of the search.
  await page.keyboard.press('Control+k');
  await input(page).fill('tastatur');
  await expect(rows(page).first()).toContainText('Tastenkürzel');
  await page.keyboard.press('Enter');
  await expect(keys).toBeVisible();
  await keys.getByRole('button', { name: 'Schließen' }).click();
  await expect(keys).toBeHidden();
});

test('PAUSE: on every screen, one tap holds the feed; Space pauses while something moves; Esc asks before it aborts', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await page.goto('/');
  const pause = page.getByTestId('pause');
  const estop = page.getByRole('button', { name: 'NOT-HALT' });
  const holds = async () => (await sent(page)).filter((l) => l === '!').length;
  const clear = async (button: typeof pause) => {
    await expect(button).toBeInViewport({ ratio: 1 });
    await expect(button).toBeEnabled();
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    // Nothing lies over it.
    const hit = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    });
    expect(hit).toBe(true);
    return box;
  };
  // Start, every step, a side area, the jog panel, the menu and the search: both are there,
  // free, and at least 24 px apart.
  const everywhere = async (where: string) => {
    const [p, e] = [await clear(pause), await clear(estop)];
    expect(e.x - (p.x + p.width), where).toBeGreaterThanOrEqual(24);
  };
  await everywhere('Start');
  await connect(page);
  await everywhere('Einstellungen');
  for (const place of ['Job', 'Werkzeuge', 'Einrichten', 'Prüfen', 'Fräsen'] as const) {
    await goTo(page, place);
    await everywhere(place);
  }
  await openJog(page);
  await everywhere('Jog');
  await page.getByTestId('menu-button').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await everywhere('Menü');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  await everywhere('Schnellsuche');

  // One tap, no question – even with a dialog open.
  expect(await holds()).toBe(0);
  await pause.click();
  await expect.poll(holds).toBe(1);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();

  // At rest Space belongs to what has the focus; nothing is sent.
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  expect(await holds()).toBe(1);
  // Esc at rest asks nothing.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('abort-dialog')).toHaveCount(0);

  // The machine moves: the badge says so, PAUSE stays enabled, Space holds the feed.
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Run|MPos:10.000,0.000,0.000|FS:800,0|WCO:0.000,0.000,0.000>';
  });
  const state = page.getByTestId('machine-state');
  await expect(state).toContainText('Läuft');
  await expect(state).toHaveAttribute('data-kind', 'run');
  // A new state never moves the two buttons: the bar keeps its row and its height.
  const still = async () => {
    const box = (await estop.boundingBox())!;
    return [box.x, box.y, (await page.locator('.statusbar').boundingBox())!.height];
  };
  const calm = await still();
  await expect(pause).toBeEnabled();
  await page.keyboard.press(' ');
  await expect.poll(holds).toBe(2);
  // Also while a button has the focus: Space does not press it, it pauses.
  await page.getByTestId('jog-toggle').focus();
  await page.keyboard.press(' ');
  await expect.poll(holds).toBe(3);
  await expect(page.getByTestId('jog-panel')).toBeVisible();

  // Esc asks; letting the job run sends nothing.
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('Escape');
  const ask = page.getByTestId('abort-dialog');
  await expect(ask).toContainText('Job abbrechen?');
  await everywhere('Rückfrage');
  await ask.getByRole('button', { name: 'Job weiterlaufen lassen' }).click();
  await expect(ask).toHaveCount(0);
  expect(await holds()).toBe(3);
  expect(await sent(page)).not.toContain('\u0018');
  // Confirmed, the job is held and then reset.
  await page.keyboard.press('Escape');
  await ask.getByRole('button', { name: 'Job abbrechen', exact: true }).click();
  await expect.poll(holds).toBe(4);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Hold:0|MPos:10.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  await expect.poll(() => sent(page)).toContain('\u0018');
  await expect(state).toHaveAttribute('data-kind', 'hold');
  await expect(state).toContainText('Pausiert');
  expect(await still()).toEqual(calm);
  // An alarm with its long text, and a position with five digits and a sign: still the same.
  await page.evaluate(() => {
    const w = window as unknown as { __status: string; __socket: { emit(l: string): void } };
    w.__status = '<Alarm|MPos:-12345.678,-12345.678,-123.456|FS:0,0|WCO:0.000,0.000,0.000>';
    w.__socket.emit('ALARM:1');
  });
  await expect(state).toHaveAttribute('data-kind', 'alarm');
  await expect(state).toContainText('Alarm – Endschalter ausgelöst');
  expect(await still()).toEqual(calm);
  await expect(estop).toBeInViewport({ ratio: 1 });
  await expect(pause).toBeInViewport({ ratio: 1 });
});

test('the arranging entries lead to something that is there: the card of the drawing while nothing is', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  // Nothing drawn: the card that picks parts is not there, so the search lands on the card of the drawing
  // (each outline fades before the next search, or an earlier one would stand for the later)
  const faded = (anchor: string) =>
    expect(page.locator(`[data-find~="${anchor}"]`)).not.toHaveClass(/found/);
  await find(page, 'Mehrfachauswahl', 'Mehrfachauswahl', 'Zeichnen/CAM');
  await landed(page, 'cam-draw');
  await faded('cam-draw');
  await find(page, 'Alles auswählen', 'Alles auswählen', 'Zeichnen/CAM');
  await landed(page, 'cam-draw');
  await faded('cam-draw');
  await find(page, 'Gruppieren', 'Gruppieren', 'Zeichnen/CAM');
  await landed(page, 'cam-draw');
  await faded('cam-draw');
  // The switches of dragging and measuring are in the same card: with nothing drawn the search lands on the drawing
  await find(page, 'einrasten', 'Fangen', 'Zeichnen/CAM');
  await landed(page, 'cam-draw');
  await faded('cam-draw');
  await find(page, 'Abstände zeigen', 'Abstände zeigen', 'Zeichnen/CAM');
  await landed(page, 'cam-draw');
  await faded('cam-draw');
  await find(page, 'messen in der zeichnung', 'Messen', 'Zeichnen/CAM');
  await landed(page, 'cam-draw');
  await faded('cam-draw');
  // Parts, nothing picked: "Alles auswählen" is its own button, the others lead to the switch beside it
  const add = page.getByTestId('cam-add');
  await add.getByRole('button', { name: 'Rechteck', exact: true }).click();
  await add.getByRole('button', { name: 'Rechteck', exact: true }).click();
  await page.getByRole('button', { name: 'Auswahl aufheben' }).click();
  await find(page, 'Alles auswählen', 'Alles auswählen', 'Zeichnen/CAM');
  await expect(await landed(page, 'cam-select-all')).toBeVisible();
  await faded('cam-select-all');
  await find(page, 'Auswahl umkehren', 'Auswahl umkehren', 'Zeichnen/CAM');
  await landed(page, 'cam-multi');
  await faded('cam-multi');
  // With parts the three switches are there themselves – the two that are on stand folded in the card, and the
  // search unfolds them – and nothing was switched by going there
  const folded = page.getByRole('button', { name: 'Fangen und Abstände' });
  await expect(folded).toHaveAttribute('aria-expanded', 'false');
  for (const [query, title, anchor, name, testId] of [
    ['einrasten', 'Fangen', 'cam-snap', 'Fangen', 'cam-snap'],
    ['Abstände zeigen', 'Abstände zeigen', 'cam-gaps', 'Abstände zeigen', 'cam-gaps'],
    ['messen in der zeichnung', 'Messen', 'cam-measure', 'Messen', 'cam-measure'],
  ] as const) {
    // (read where it stands, folded or not: a hidden control has no role to ask for)
    const before = await page.getByTestId(testId).getAttribute('aria-checked');
    await find(page, query, title, 'Zeichnen/CAM');
    await landed(page, anchor);
    await faded(anchor);
    await expect(page.getByRole('checkbox', { name, exact: true })).toHaveAttribute(
      'aria-checked',
      before!,
    );
  }
  await expect(folded).toHaveAttribute('aria-expanded', 'true');
  // Everything picked: invert has its button, aligning its panel – nothing was pressed by going there
  await page.getByRole('button', { name: 'Alles auswählen', exact: true }).click();
  await find(page, 'Auswahl umkehren', 'Auswahl umkehren', 'Zeichnen/CAM');
  await landed(page, 'cam-invert');
  await faded('cam-invert');
  await find(page, 'linksbündig', 'Ausrichten und verteilen', 'Zeichnen/CAM');
  await landed(page, 'cam-align');
  await expect(page.getByTestId('cam-selected')).toContainText('2 Teile');
});

test('the toolpath entries lead to something that is there: the cards of the drawing while no part is, the panel of the part when it is', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const faded = (anchor: string) =>
    expect(page.locator(`[data-find~="${anchor}"]`)).not.toHaveClass(/found/);
  // Nothing drawn: no part has a panel, so the way in, the hole, the step and the order lead to the card of the drawing;
  // the drawing's own defaults ("Ecken meiden", "Fahrwege kürzen") are in its card of advanced values, which unfolds
  await find(page, 'ecken meiden', 'Ecken meiden', 'Zeichnen/CAM');
  await landed(page, 'cam-avoid-default');
  await faded('cam-avoid-default');
  await find(page, 'fahrwege kürzen', 'Fahrwege kürzen', 'Zeichnen/CAM');
  await landed(page, 'cam-route');
  await faded('cam-route');
  for (const [query, title] of [
    ['eintauchen', 'Eintauchen'],
    ['helix', 'Lochbreite der Helix (mm)'],
    ['spanbrechen', 'Spanbrechen (mm)'],
    ['schnittfolge', 'Reihenfolge'],
  ] as const) {
    await find(page, query, title, 'Zeichnen/CAM');
    await landed(page, 'cam-draw');
    await faded('cam-draw');
  }
  // A pocket selected alone: its way in, the width of the hole and the order are in its panels – nothing was pressed
  const add = page.getByTestId('cam-add');
  await add.getByRole('button', { name: 'Rechteck', exact: true }).click();
  await page.getByLabel('Bearbeitung Kontur 1', { exact: true }).selectOption({ label: 'Tasche' });
  await find(page, 'eintauchen', 'Eintauchen', 'Zeichnen/CAM');
  await landed(page, 'cam-path-entry');
  await expect(page.getByTestId('cam-entry-ramp')).toHaveAttribute('aria-pressed', 'true');
  await faded('cam-path-entry');
  await find(page, 'schnittfolge', 'Reihenfolge', 'Zeichnen/CAM');
  await landed(page, 'cam-order');
  await faded('cam-order');
  // …and the step of a hole in the panel of the hole
  await page.getByLabel('Bearbeitung Kontur 1', { exact: true }).selectOption({ label: 'Bohren' });
  await find(page, 'spanbrechen', 'Spanbrechen (mm)', 'Zeichnen/CAM');
  await landed(page, 'cam-path-peck');
  // nothing reached the machine or the program by going there
  await expect(page.getByTestId('cam-entry-ramp')).toHaveCount(0);
});

test('in the drawing its own keys go on working beside the global ones', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const add = page.getByTestId('cam-add');
  await add.getByRole('button', { name: 'Rechteck', exact: true }).click();
  const parts = page.getByTestId('cam-contours').locator('li');
  await expect(parts).toHaveCount(1);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  // Ctrl+D duplicates (the drawing), D alone is a global view key: no key means two things.
  await page.keyboard.press('Control+d');
  await expect(parts).toHaveCount(2);
  await page.keyboard.press('d');
  // The drawing workspace has no other views of the stage: the table stays, nothing is duplicated.
  await expect(page.getByTestId('table-view')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Ansicht der Bühne' })).toHaveCount(0);
  await expect(parts).toHaveCount(2);
  await page.keyboard.press('t');
  // While the search is open, the keys of the drawing rest: Entf deletes text, not the part.
  await page.keyboard.press('Control+k');
  await input(page).fill('ab');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await expect(parts).toHaveCount(2);
  // The hint in the card points to the overview where there is a keyboard.
  await expect(add).toContainText('Tastenkürzel: ? drücken');
  await page.keyboard.press('Control+z');
  await expect(parts).toHaveCount(1);
});

test('key caps show only where a keyboard is likely', async ({ page }, info) => {
  await openApp(page);
  const caps = page.getByTestId('find-button').locator('.kbd-hint');
  if (info.project.name === 'desktop') {
    await expect(caps).toBeVisible();
    await expect(caps).toContainText('K');
  } else {
    // A touch screen: no key caps – until a key is pressed.
    await expect(caps).toBeHidden();
    await page.getByTestId('find-button').click();
    await expect(palette(page).locator('.kbd-hint').first()).toBeHidden();
    await input(page).fill('kamera');
    await expect(palette(page).locator('.kbd-hint').first()).toBeHidden();
    await page.getByRole('button', { name: 'Schließen' }).click();
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('2');
    await page.getByTestId('find-button').click();
    await input(page).fill('kamera');
    await expect(palette(page).locator('.kbd-hint').first()).toBeVisible();
  }
});

test('an entry that lives on the table only lands on the table – even where Einrichten opens on the live picture', async ({
  page,
}) => {
  await openDemo(page);
  for (const from of ['Start', 'Einstellungen'] as const) {
    await goTo(page, from);
    await page.getByTestId('find-button').click();
    await input(page).fill('Folgen');
    await page.keyboard.press('Enter');
    await expect(step(page, 'setup')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('button', { name: 'Folgen' })).toBeVisible();
  }
});

test("a view of the stage asked for by name shows once on arrival and is not kept as Einrichten's own", async ({
  page,
}) => {
  await openDemo(page);
  // From the drawing workspace the entry leads out, to the view asked for …
  await step(page, 'cam').click();
  await expect(page.getByTestId('cam-draw')).toBeVisible();
  await page.getByTestId('find-button').click();
  await input(page).fill('3D');
  await page.keyboard.press('Enter');
  await expect(step(page, 'setup')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('stage-3d')).toBeVisible();
  // … and the next visit finds Einrichten as it is: on the live picture, with its tools.
  await goTo(page, 'Job');
  await goTo(page, 'Einrichten');
  await expect(page.getByTestId('tool-strip')).toBeVisible();
  await expect(page.getByTestId('stage-3d')).toHaveCount(0);
});
