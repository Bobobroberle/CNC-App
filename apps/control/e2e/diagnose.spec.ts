import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { connect, goTo, installFakeFluidNC, openApp } from './helpers';

const sent = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __sent: string[] }).__sent.slice());

type Page = import('@playwright/test').Page;

/** The fake machine answers every `$SD/List` with `error:<code>`; the app is open, connected, and has asked. */
async function start(page: Page, code: number) {
  await installFakeFluidNC(page);
  await page.addInitScript((sdError) => {
    const w = window as unknown as Record<string, unknown>;
    w.__sdError = sdError;
    // A device that is logged in at the Pi: its token must never stand in a report
    localStorage.setItem(
      'lowrider-control.piLogin',
      JSON.stringify({
        base: 'http://192.168.0.198:8080',
        token: 'tok-e2e-geheim-123456',
        name: 'Tablet',
      }),
    );
  }, code);
  await openApp(page);
  await connect(page);
  // The SD card card of the Job (no program loaded) lists the card as soon as it shows and the machine is there
  await goTo(page, 'Job');
  await expect.poll(() => sent(page)).toContain('$SD/List');
}

test.describe('the SD card failing, and the diagnostic report', () => {
  test.beforeEach(async ({ page }) => {
    // The card cannot be mounted: FluidNC answers `$SD/List` with error:60
    await start(page, 60);
  });

  test('is told as the card – not as a bad line – with its cause, effect and next step', async ({
    page,
  }) => {
    await goTo(page, 'Service & Diagnose', 'Meldungen');
    const history = page.getByTestId('message-history');
    const card = history
      .getByTestId('message')
      .filter({ hasText: 'SD-Karte der Steuerung: Zugriff fehlgeschlagen' });
    await expect(card).toHaveCount(1);
    // one event, one warning: the one that says it is the card – not also "SD-Karte konnte nicht gelesen werden"
    await expect(
      history.getByTestId('message').filter({ hasText: 'konnte nicht gelesen werden' }),
    ).toHaveCount(0);
    await expect(card).toContainText('error:60');
    await expect(card).toContainText('nicht einbinden');
    await expect(card).toContainText('Jobs von der SD-Karte starten nicht');
    await expect(card).toContainText('FAT32');
    // not the text for a bad program line
    await expect(card).not.toContainText('Eingabe oder Programmzeile prüfen');
  });

  test('is saved as one text file: the messages with what surrounded them, the log, no credentials – and nothing goes to the machine', async ({
    page,
  }) => {
    // What the controller echoes into the log: a login of this device and a Wi-Fi password of several words
    await page.evaluate(() => {
      const socket = (window as unknown as { __socket: { emit(line: string): void } }).__socket;
      socket.emit('Anmeldung mit tok-e2e-geheim-123456');
      socket.emit('$Sta/Password=Wlan Passwort 77 mit Leerzeichen');
    });
    await goTo(page, 'Service & Diagnose', 'Meldungen');
    const before = await sent(page);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Diagnosebericht speichern' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^lowrider-diagnose-\d{8}-\d{6}\.txt$/);
    const text = readFileSync(await download.path(), 'utf8');

    expect(text).toContain('Diagnosebericht (Format 1)');
    expect(text).toContain('== Meldungen dieser Sitzung');
    expect(text).toContain('SD-Karte der Steuerung: Zugriff fehlgeschlagen  (error:60)');
    // what was sent and what came back, in the log and with the message
    expect(text).toContain('> $SD/List');
    expect(text).toContain('< error:60');
    expect(text).toContain('Davor im Protokoll');
    // the connection and the machine
    expect(text).toContain('192.168.178.40');
    expect(text).toContain('Zustand: Idle');
    // no credentials – and they were really there: both lines stand in the log, as what is left of them
    expect(text).toContain('< Anmeldung mit [entfernt]');
    expect(text).toContain('< $Sta/Password=[entfernt]');
    expect(text).not.toContain('tok-e2e-geheim-123456');
    expect(text).not.toContain('Wlan Passwort');
    expect(text).not.toContain('Leerzeichen');

    // the card says it saved, and the machine was asked nothing for it
    await expect(page.getByTestId('diagnostic-report-done')).toContainText(
      download.suggestedFilename(),
    );
    expect(await sent(page)).toEqual(before);
  });
});

test('a file error that names no card keeps the warning that the list failed, beside its own', async ({
  page,
}) => {
  // error:65 happens to one file: it does not say the list of the card failed – the second warning does
  await start(page, 65);
  await goTo(page, 'Service & Diagnose', 'Meldungen');
  const history = page.getByTestId('message-history');
  await expect(
    history.getByTestId('message').filter({ hasText: 'Dateizugriff der Steuerung fehlgeschlagen' }),
  ).toHaveCount(1);
  await expect(
    history.getByTestId('message').filter({ hasText: 'SD-Karte konnte nicht gelesen werden' }),
  ).toHaveCount(1);
});
