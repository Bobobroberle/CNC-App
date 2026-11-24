import { expect, test, type Page } from '@playwright/test';
import { goTo, hold, openApp, openJog } from './helpers';

// The settings and measurements of the machine live on the Pi, so that every device finds the same:
// a device takes the Pi's calibration, a change goes to the Pi from the revision it read, an older
// companion is said – and what belongs to this device alone never leaves it.

interface Stored {
  rev: number;
  data: Record<string, unknown>;
}

/** A companion at the app's own origin that keeps the state documents like the real one does. */
async function fakePi(
  page: Page,
  docs: Record<string, Stored> = {},
  older = false,
  log: Record<string, unknown>[] = [],
) {
  const puts: { key: string; baseRev: number; data: Record<string, unknown> }[] = [];
  // The log of measurements is a library of the companion: one entry each
  await page.route('**/api/library/measurements', async (route) => {
    const request = route.request();
    if (request.method() === 'POST')
      log.push(...(request.postDataJSON() as Record<string, unknown>[]));
    return route.fulfill({ json: request.method() === 'POST' ? { ok: true } : log });
  });
  await page.route('**/api/library/measurements/*', (route) => {
    log.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        ok: true,
        version: '1.5.0',
        fluidnc: null,
        sensors: 'none',
        camera: null,
        state: !older,
      },
    }),
  );
  await page.route('**/api/state', (route) =>
    older
      ? route.fulfill({ status: 404, json: { message: 'Route GET:/api/state not found' } })
      : route.fulfill({ json: { keys: docs } }),
  );
  await page.route('**/api/state/*', async (route) => {
    const request = route.request();
    const key = new URL(request.url()).pathname.split('/').pop()!;
    const body = request.postDataJSON() as { baseRev: number; data: Record<string, unknown> };
    const current = docs[key];
    const rev = current?.rev ?? 0;
    if (body.baseRev !== rev) {
      return route.fulfill({ status: 409, json: { error: 'conflict', rev, data: current?.data } });
    }
    docs[key] = { rev: rev + 1, data: body.data };
    puts.push({ key, baseRev: body.baseRev, data: body.data });
    return route.fulfill({ json: { ok: true, rev: rev + 1 } });
  });
  return { docs, puts, log };
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('lowrider-control.settings') ?? 'null'));

const CAMERA = {
  offsetX: 12.34,
  offsetY: -5.6,
  pxPerMm: 21.5,
  rotation: 0.4,
  focusHeight: 80,
  scaleCalibrated: true,
  lightMarker: false,
};

test('a device that is new takes the Pi’s calibration – and keeps what belongs to it alone', async ({
  page,
}) => {
  const pi = await fakePi(page, {
    settings: {
      rev: 4,
      data: {
        camera: CAMERA,
        parkPosition: { x: 100, y: 50 },
        waypoints: [{ id: 'w1', name: 'Anschlag', x: 10, y: 20 }],
      },
    },
  });
  await openApp(page);
  await expect
    .poll(async () => (await stored(page))?.camera?.offsetX, { timeout: 10_000 })
    .toBe(12.34);
  const settings = await stored(page);
  expect(settings.camera).toMatchObject({ pxPerMm: 21.5, scaleCalibrated: true, focusHeight: 80 });
  expect(settings.parkPosition).toEqual({ x: 100, y: 50 });
  expect(settings.waypoints).toHaveLength(1);
  // this device found the Pi at its own address: that stays this device's
  expect(settings.companionUrl).toMatch(/^http/);
  // nothing needed to be sent: the Pi had it all
  expect(pi.puts).toEqual([]);
  // the card says it
  await goTo(page, 'Einstellungen', 'Verbindung');
  await expect(page.getByTestId('sync-state')).toContainText('Auf dem Pi gesichert');
});

test('a calibration made at this device goes to a Pi that has none – without what belongs to this device', async ({
  page,
}) => {
  await page.addInitScript((camera) => {
    localStorage.setItem(
      'lowrider-control.settings',
      JSON.stringify({
        camera: { ...camera, streamUrl: 'http://elsewhere:8081/stream', source: 'stream' },
      }),
    );
  }, CAMERA);
  const pi = await fakePi(page);
  await openApp(page);
  await expect.poll(() => pi.puts.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const doc = pi.docs.settings!.data as Record<string, Record<string, unknown>>;
  expect(doc.camera).toMatchObject({ offsetX: 12.34, pxPerMm: 21.5 });
  // the picture source and the address of the stream, the address of the Pi, the browser: this device's
  expect(doc.camera).not.toHaveProperty('streamUrl');
  expect(doc.camera).not.toHaveProperty('source');
  for (const key of ['companionUrl', 'notifyBrowser', 'keepAwake'])
    expect(doc).not.toHaveProperty(key);
  expect(pi.puts[0]!.baseRev).toBe(0);
});

test('a change at this device goes to the Pi from the revision it read', async ({ page }) => {
  const pi = await fakePi(page, { settings: { rev: 7, data: { camera: CAMERA } } });
  await openApp(page);
  await expect
    .poll(async () => (await stored(page))?.camera?.offsetX, { timeout: 10_000 })
    .toBe(12.34);
  await goTo(page, 'Einstellungen', 'Maschine');
  await page.getByTestId('feature-macros').click();
  await expect.poll(() => pi.puts.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const put = pi.puts.at(-1)!;
  expect(put.baseRev).toBe(7);
  expect(put.data.hiddenFeatures).toEqual(['macros']);
  // the calibration of the Pi came along unchanged
  expect(put.data.camera).toMatchObject({ offsetX: 12.34 });
  expect(pi.docs.settings!.rev).toBe(8);
});

test('an older companion is said, and the rest goes on', async ({ page }) => {
  await fakePi(page, {}, true);
  await openApp(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
  await expect(page.getByTestId('sync-state')).toContainText('kennt diesen Speicher noch nicht', {
    timeout: 10_000,
  });
  // it is still a companion that answers: not reported as gone
  await expect(page.getByTestId('companion-card')).toContainText('1.5.0');
  await expect(page.getByTestId('companion-card')).not.toContainText('nicht erreichbar');
});

test('the macros of the Pi are the macros of this device', async ({ page }) => {
  await fakePi(page, {
    macros: { rev: 2, data: { list: [{ name: 'Pi-Makro', gcode: 'G53 G0 Z0' }] } },
  });
  await openApp(page);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lowrider-control.macros')), {
      timeout: 10_000,
    })
    .toContain('Pi-Makro');
  await openJog(page);
  await expect(page.locator('[data-find="macros"]')).toContainText('Pi-Makro');
});

test('what was measured is written down, on the Pi too – and what the Pi has is listed here', async ({
  page,
}) => {
  const pi = await fakePi(page, {}, false, [
    {
      id: '2026-11-20T09:00:00.000Z-camera-offset',
      at: '2026-11-20T09:00:00.000Z',
      kind: 'camera-offset',
      values: { offsetX: 12.345, offsetY: -6.5 },
    },
  ]);
  await openApp(page);
  await goTo(page, 'Service & Diagnose', 'Kalibrieren');
  const log = page.getByTestId('measurement-log');
  // what the Pi had comes in
  await expect(log).toContainText('Kamera: Versatz', { timeout: 10_000 });
  await expect(log).toContainText('Versatz X 12,345');
  // a measurement made here: the sides and diagonals of the test rectangle, evaluated
  const check = page.getByTestId('accuracy-check');
  const values: Record<string, string> = {
    'A → B, vorne (X)': '500.2',
    'D → C, hinten (X)': '500.2',
    'A → D, links (Y)': '400.1',
    'B → C, rechts (Y)': '400.1',
    'Diagonale A → C': '640.5',
    'Diagonale B → D': '640.5',
  };
  for (const [label, value] of Object.entries(values)) await check.getByLabel(label).fill(value);
  await check.getByRole('button', { name: 'Auswerten' }).click();
  await expect(log).toContainText('Genauigkeits-Check mit Lineal');
  await expect(log).toContainText('500 × 400 mm');
  // … and it went to the Pi
  await expect
    .poll(() => pi.log.filter((m) => m.kind === 'ruler-check').length, { timeout: 10_000 })
    .toBe(1);
  const sent = pi.log.find((m) => m.kind === 'ruler-check') as { values: Record<string, number> };
  expect(sent.values).toMatchObject({ sizeX: 500, sizeY: 400, bottom: 500.2, diagonalAC: 640.5 });
  // it stays after a reload (kept here as well)
  await page.reload();
  await goTo(page, 'Service & Diagnose', 'Kalibrieren');
  await expect(page.getByTestId('measurement-log')).toContainText('Genauigkeits-Check mit Lineal');
});

test('a document on the Pi that this app cannot use is said once, blocks nothing else – and this device can replace it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'lowrider-control.settings',
      JSON.stringify({ parkPosition: { x: 5, y: 6 } }),
    );
  });
  // the Pi holds a camera that is nothing; the macros are fine
  const pi = await fakePi(page, {
    settings: { rev: 3, data: { camera: null } },
    macros: { rev: 2, data: { list: [{ name: 'Z hoch', gcode: 'G53 G0 Z-5' }] } },
  });
  await openApp(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
  const state = page.getByTestId('sync-state');
  await expect(state).toContainText('nicht zu dieser App passen', { timeout: 10_000 });
  // nothing was overwritten, and the macros of the Pi were still taken in
  expect(pi.puts.filter((p) => p.key === 'settings')).toEqual([]);
  expect(pi.docs.settings!.data).toEqual({ camera: null });
  // the way out: a hold replaces the Pi's document with this device's state
  await hold(page, /Stand dieses Geräts auf den Pi schreiben/);
  await expect.poll(() => pi.docs.settings!.rev, { timeout: 10_000 }).toBe(4);
  expect(pi.docs.settings!.data).toMatchObject({
    parkPosition: { x: 5, y: 6 },
    camera: { pxPerMm: 10 },
  });
  await expect(state).toContainText('Auf dem Pi gesichert', { timeout: 10_000 });
});
