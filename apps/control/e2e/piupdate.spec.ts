import { expect, test, type Page, type Route } from '@playwright/test';
import { goTo, hold, openApp } from './helpers';

// The login at the Pi and the update from the app, against a companion that is faked at the app's own address:
// the Pi code once per device, the zip chosen and checked, a hold to put it in place, the wait for the restart –
// and what is said when the Pi refuses, when it goes back by itself, and when it has no login yet.

const CODE = 'ABCD-EFGH-JKLM';
const TOKEN = 'token-of-this-device';

interface Fake {
  /** The build the Pi runs now */
  build: number;
  /** What the health check answers while it restarts: builds, `down` for no answer, one per look */
  restart: (number | 'down')[] | null;
  looks: number;
  auth: boolean;
  update: boolean;
  hasPrevious: boolean;
  last: Record<string, unknown> | null;
  /** The next apply is refused with this */
  refuse: { status: number; body: Record<string, unknown> } | null;
  /** The checksum that is accepted at the upload (anything else: refused as wrong) */
  goodSha: string | null;
  devices: { id: string; name: string; createdAt: number; lastSeen: number }[];
  code: string;
  calls: string[];
  uploaded: number;
  /** How many status answers still say the new version is on trial (it confirms itself after half a minute) */
  trial: number;
}

async function fakePi(page: Page, over: Partial<Fake> = {}): Promise<Fake> {
  const pi: Fake = {
    build: 1_795_000_000,
    restart: null,
    looks: 0,
    auth: true,
    update: true,
    hasPrevious: true,
    last: null,
    refuse: null,
    goodSha: null,
    devices: [{ id: 'd1', name: 'Altes Tablet', createdAt: 1, lastSeen: 2 }],
    code: CODE,
    calls: [],
    uploaded: 0,
    trial: 0,
    ...over,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    const path = pathname.replace(/^\/api/, '');
    const authed = request.headers().authorization === `Bearer ${TOKEN}`;
    pi.calls.push(`${request.method()} ${path}`);

    if (path === '/health') {
      if (pi.restart) {
        const step = pi.restart[Math.min(pi.looks++, pi.restart.length - 1)]!;
        if (step === 'down') return route.abort('connectionrefused');
        if (pi.looks >= pi.restart.length) pi.restart = null;
        return json(route, health(pi, step));
      }
      return json(route, health(pi, pi.build));
    }
    if (path === '/state') return json(route, { keys: {} });
    if (path.startsWith('/state/')) return json(route, { ok: true, rev: 1 });
    if (path.startsWith('/library/')) return json(route, []);

    if (path === '/auth/login') {
      const body = request.postDataJSON() as { code: string; name: string };
      if (body.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === CODE.replaceAll('-', '')) {
        pi.devices.push({ id: 'd2', name: body.name, createdAt: 3, lastSeen: 3 });
        return json(route, { token: TOKEN, device: { id: 'd2', name: body.name } });
      }
      if (body.code === 'LOCKED') {
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '42' },
          json: { error: 'locked', retryAfter: 42 },
        });
      }
      return json(route, { error: 'wrong-code' }, 401);
    }
    // everything below needs the login
    if (!authed) return json(route, { error: 'unauthorized' }, 401);
    if (path === '/auth/me') return json(route, { device: { id: 'd2', name: 'Windows-PC' } });
    if (path === '/auth/devices') {
      return json(route, { devices: pi.devices.map((d) => ({ ...d, current: d.id === 'd2' })) });
    }
    if (path.startsWith('/auth/devices/')) {
      pi.devices = pi.devices.filter((d) => d.id !== path.split('/').pop());
      return json(route, { ok: true });
    }
    if (path === '/auth/logout') return json(route, { ok: true });
    if (path === '/auth/code' && request.method() === 'GET') return json(route, { code: pi.code });
    if (path === '/auth/code') {
      pi.code = 'WXYZ-2345-6789';
      return json(route, { code: pi.code, revoked: 0 });
    }
    if (path === '/system/shutdown') return json(route, { ok: true });

    if (path === '/update' && request.method() === 'GET') {
      return json(route, {
        enabled: true,
        running: { name: 'b1', version: '0.1.0', build: pi.build, commit: 'abcdef012' },
        previous: pi.hasPrevious
          ? { name: 'b0', version: '0.1.0', build: pi.build - 86_400, commit: '0123456ab' }
          : null,
        setupLevel: 2,
        last: pi.trial > 0 ? { result: 'pending', name: 'b2', at: Date.now() } : pi.last,
        trial: trialNow(pi),
        staged: null,
        busy: null,
      });
    }
    if (path === '/update/upload') {
      pi.uploaded = (request.postDataBuffer() ?? Buffer.alloc(0)).length;
      const given = searchParams.get('sha256');
      if (given && given !== pi.goodSha) {
        return json(route, { error: 'checksum-mismatch', detail: 'f'.repeat(64) }, 400);
      }
      return json(route, {
        id: 'staged-1',
        release: { version: '0.1.0', build: pi.build + 3600, commit: 'fedcba987', setupLevel: 2 },
        sha256: 'a'.repeat(64),
        files: 5,
        at: Date.now(),
        newer: true,
      });
    }
    if (path === '/update/apply') {
      if (pi.refuse) return json(route, pi.refuse.body, pi.refuse.status);
      pi.restart = [pi.build, 'down', 'down', pi.build + 3600];
      pi.looks = 0;
      pi.build += 3600;
      pi.trial = 2;
      return json(route, { ok: true, restarting: true, name: 'b2', release: { build: pi.build } });
    }
    if (path === '/update/rollback') {
      const was = pi.build;
      pi.restart = [was, 'down', pi.build - 86_400];
      pi.looks = 0;
      pi.build -= 86_400;
      return json(route, { ok: true, restarting: true, name: 'b0' });
    }
    if (path === '/update/staged') return json(route, { ok: true });
    return json(route, { error: 'not-found' }, 404);
  });
  return pi;
}

/** Whether the new version is on trial in this answer; the answer that ends it writes the note "ok", as the Pi does. */
function trialNow(pi: Fake): boolean {
  if (pi.trial <= 0) return false;
  pi.trial--;
  if (pi.trial === 0) pi.last = { result: 'ok', name: 'b2', at: Date.now() };
  return true;
}

const health = (pi: Fake, build: number) => ({
  ok: true,
  version: '0.1.0',
  build,
  commit: 'abcdef012',
  auth: pi.auth,
  update: pi.update,
  shutdown: true,
  fluidnc: null,
  sensors: 'none',
  camera: null,
  state: true,
});

/** This device is logged in at the Pi already (the address is the app's own: what the app detects). */
async function loggedIn(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem(
      'lowrider-control.piLogin',
      JSON.stringify({ base: location.origin, token, name: 'Windows-PC' }),
    );
  }, TOKEN);
}

const connection = async (page: Page) => {
  await openApp(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
};

test('a device logs in with the Pi code, sees the devices and the code, and logs out again', async ({
  page,
}) => {
  const pi = await fakePi(page);
  await connection(page);
  const card = page.getByTestId('pi-access');
  await expect(card).toContainText('Anmeldung am Pi');
  // a wrong code, and a wait after too many tries
  await card.getByTestId('access-code').fill('ZZZZ-ZZZZ-ZZZZ');
  await card.getByTestId('access-login').click();
  await expect(card.getByTestId('access-error')).toContainText('Der Code stimmt nicht.');
  await card.getByTestId('access-code').fill('LOCKED');
  await card.getByTestId('access-login').click();
  await expect(card.getByTestId('access-error')).toContainText('42 s');
  // the right one, written as a person types it
  await card.getByTestId('access-code').fill('abcd efgh jklm');
  await card.getByTestId('access-login').click();
  await expect(card.getByTestId('access-in')).toContainText('Angemeldet als');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lowrider-control.piLogin') ?? 'null'),
  );
  expect(stored).toMatchObject({ token: TOKEN });
  expect(stored.base).toMatch(/^http/);
  // the token never goes into the settings (they are synced to the Pi and to every device)
  const settings = await page.evaluate(
    () => localStorage.getItem('lowrider-control.settings') ?? '',
  );
  expect(settings).not.toContain(TOKEN);
  await expect(card.getByTestId('access-devices')).toContainText('Altes Tablet');
  await expect(card.getByTestId('access-devices')).toContainText('dieses Gerät');
  // the code, for another device
  await card.getByTestId('access-show').click();
  await expect(card.getByTestId('access-shown')).toContainText(CODE);
  await card.getByTestId('access-show').click();
  await expect(card.getByTestId('access-shown')).toHaveCount(0);
  // a new code (a hold)
  await hold(page, /Neuen Pi-Code erzeugen/);
  await expect(card.getByTestId('access-renewed')).toContainText('WXYZ-2345-6789');
  expect(pi.code).toBe('WXYZ-2345-6789');
  // the other device goes
  await card.getByRole('button', { name: 'Altes Tablet entfernen' }).click();
  await expect(card.getByTestId('access-devices')).not.toContainText('Altes Tablet');
  await card.getByTestId('access-logout').click();
  await expect(card.getByTestId('access-code')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lowrider-control.piLogin'))).toBe('null');
  expect(pi.calls).toContain('POST /auth/logout');
});

test('a login that the Pi does not know any more ends, and is said', async ({ page }) => {
  await loggedIn(page);
  await fakePi(page, { auth: true });
  // the Pi forgot the token: every call is refused
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'unauthorized' } }),
  );
  await connection(page);
  await expect(page.getByTestId('access-expired')).toBeVisible();
  await expect(page.getByTestId('access-code')).toBeVisible();
});

test('a companion that has no login yet is said, with the way to get one', async ({ page }) => {
  await fakePi(page, { auth: false, update: false });
  await connection(page);
  await expect(page.getByTestId('access-old')).toContainText('update-pi.bat');
  await expect(page.getByTestId('access-code')).toHaveCount(0);
  await expect(page.getByTestId('update-not-enabled')).toContainText('update-pi.bat');
});

test('the update asks for the login first', async ({ page }) => {
  await fakePi(page);
  await connection(page);
  await expect(page.getByTestId('update-need-login')).toBeVisible();
  await expect(page.getByTestId('update-choose')).toHaveCount(0);
});

test('an update: the file is checked by the Pi, put in place with a hold, the restart is waited for', async ({
  page,
}) => {
  await loggedIn(page);
  const pi = await fakePi(page, { goodSha: 'a'.repeat(64) });
  await connection(page);
  const card = page.getByTestId('pi-update');
  await expect(card.getByTestId('update-status')).toContainText('Läuft: Version 0.1.0');
  await expect(card.getByTestId('update-status')).toContainText('Davor:');
  // the zip is chosen: it goes to the Pi, which says what it is
  await card.getByTestId('update-file').setInputFiles({
    name: 'lowrider-pi.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('not really a zip, the Pi is faked'),
  });
  const staged = card.getByTestId('update-staged');
  await expect(staged).toContainText('Gefunden: Version 0.1.0');
  await expect(staged).toContainText('fedcba987');
  await expect(staged).toContainText('Neuer als die laufende Version.');
  await expect(card.getByTestId('update-sha')).toContainText('a'.repeat(64));
  await expect(staged).toContainText('Ohne Prüfsumme');
  // what is typed now was not compared: the field is closed while the file waits, so the line cannot be made to lie
  await expect(card.getByTestId('update-checksum')).toBeDisabled();
  expect(pi.uploaded).toBeGreaterThan(0);
  // in place (a hold) – the Pi restarts, the card waits and then says the build it runs
  await hold(page, /Auf dem Pi einspielen/);
  await expect(card.getByTestId('update-done')).toContainText('Fertig: der Pi läuft mit Stand', {
    timeout: 30_000,
  });
  await expect(card.getByTestId('update-reload')).toBeVisible();
  expect(pi.calls).toContain('POST /update/apply');
  // the new version answers long before it has confirmed itself: the card keeps looking until its trial is over
  await expect(card.getByTestId('update-status')).not.toContainText('bestätigt sich noch', {
    timeout: 30_000,
  });
  await expect(card.getByTestId('update-last')).not.toContainText('läuft noch an');
  // the status line shows the new build, and the way back is offered
  await expect(card.getByTestId('update-rollback')).toBeVisible();
});

test('a file with a checksum that is wrong is refused at the upload, and says what the Pi computed', async ({
  page,
}) => {
  await loggedIn(page);
  await fakePi(page, { goodSha: 'a'.repeat(64) });
  await connection(page);
  const card = page.getByTestId('pi-update');
  await card.getByTestId('update-checksum').fill('0'.repeat(64));
  await card
    .getByTestId('update-file')
    .setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') });
  await expect(card.getByTestId('update-error')).toContainText('Prüfsumme stimmt nicht');
  await expect(card.getByTestId('update-error')).toContainText('f'.repeat(64));
  await expect(card.getByTestId('update-staged')).toHaveCount(0);
  // the right one is taken, and said to be right
  await card.getByTestId('update-checksum').fill('a'.repeat(64));
  await card
    .getByTestId('update-file')
    .setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') });
  await expect(card.getByTestId('update-staged')).toContainText('Die Prüfsumme stimmt.');
});

test('a refusal of the Pi is said in words: a machine on it, a version that does not start', async ({
  page,
}) => {
  await loggedIn(page);
  const pi = await fakePi(page);
  await connection(page);
  const card = page.getByTestId('pi-update');
  await card
    .getByTestId('update-file')
    .setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') });
  await expect(card.getByTestId('update-staged')).toBeVisible();
  pi.refuse = { status: 500, body: { error: 'check-failed', detail: 'SyntaxError: nope' } };
  await hold(page, /Auf dem Pi einspielen/);
  await expect(card.getByTestId('update-error')).toContainText('startet nicht');
  await expect(card.getByTestId('update-error')).toContainText('SyntaxError: nope');
  // the Pi still has the file: the hold stays, and a second try needs no new upload
  await expect(card.getByTestId('update-staged')).toBeVisible();
  pi.refuse = null;
  await hold(page, /Auf dem Pi einspielen/);
  await expect(card.getByTestId('update-done')).toBeVisible({ timeout: 30_000 });
  expect(pi.uploaded).toBeGreaterThan(0);
});

test('a version that answers once and is taken back before it has confirmed itself is not called done', async ({
  page,
}) => {
  await loggedIn(page);
  const pi = await fakePi(page);
  await connection(page);
  const card = page.getByTestId('pi-update');
  await card
    .getByTestId('update-file')
    .setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') });
  await expect(card.getByTestId('update-staged')).toBeVisible();
  await hold(page, /Auf dem Pi einspielen/);
  // it answers with the new build – and is still on trial: not done yet, and nothing to reload
  await expect(card.getByTestId('update-settling')).toContainText('bestätigt sich noch', {
    timeout: 30_000,
  });
  await expect(card.getByTestId('update-done')).toHaveCount(0);
  // the guard takes it away
  pi.build -= 3600;
  await expect(card.getByTestId('update-error')).toContainText(
    'von selbst zur alten Version zurückgekehrt',
    { timeout: 30_000 },
  );
  await expect(card.getByTestId('update-done')).toHaveCount(0);
});

test('a reply that is lost does not hide an update that went through', async ({ page }) => {
  await loggedIn(page);
  const pi = await fakePi(page);
  await connection(page);
  const card = page.getByTestId('pi-update');
  await card
    .getByTestId('update-file')
    .setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') });
  await expect(card.getByTestId('update-staged')).toBeVisible();
  // the Pi swaps and restarts, but the answer never arrives
  const was = pi.build;
  await page.route('**/api/update/apply', (route) => {
    pi.restart = [was, 'down', 'down', was + 3600];
    pi.looks = 0;
    pi.build = was + 3600;
    pi.trial = 2;
    return route.abort('connectionreset');
  });
  await hold(page, /Auf dem Pi einspielen/);
  await expect(card.getByTestId('update-done')).toContainText('Fertig', { timeout: 30_000 });
});

test('a login the Pi takes back while the card is open ends everywhere on this device', async ({
  page,
}) => {
  await loggedIn(page);
  await fakePi(page);
  await connection(page);
  await expect(page.getByTestId('access-in')).toBeVisible();
  // another device removed this one: the next call is refused
  await page.route('**/api/auth/code', (route) =>
    route.fulfill({ status: 401, json: { error: 'unauthorized' } }),
  );
  await page.getByTestId('access-show').click();
  await expect(page.getByTestId('access-code')).toBeVisible();
  await expect(page.getByTestId('access-expired')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lowrider-control.piLogin'))).toBe('null');
  await expect(page.getByTestId('update-need-login')).toBeVisible();
});

test('a new version that does not start: the Pi goes back by itself, and the card says nothing is broken', async ({
  page,
}) => {
  await loggedIn(page);
  const pi = await fakePi(page);
  await connection(page);
  const card = page.getByTestId('pi-update');
  await card
    .getByTestId('update-file')
    .setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') });
  await expect(card.getByTestId('update-staged')).toBeVisible();
  // the Pi answers the apply, goes away, and comes back with the OLD build
  const old = pi.build;
  await page.route('**/api/update/apply', (route) => {
    pi.restart = [old, 'down', 'down', old];
    pi.looks = 0;
    return route.fulfill({
      json: { ok: true, restarting: true, name: 'b2', release: { build: old + 3600 } },
    });
  });
  await hold(page, /Auf dem Pi einspielen/);
  await expect(card.getByTestId('update-error')).toContainText(
    'von selbst zur alten Version zurückgekehrt',
    { timeout: 30_000 },
  );
});

test('back to the previous version by hand (a hold)', async ({ page }) => {
  await loggedIn(page);
  const pi = await fakePi(page);
  await connection(page);
  const card = page.getByTestId('pi-update');
  await expect(card.getByTestId('update-rollback')).toBeVisible();
  const was = pi.build;
  await hold(page, /Zur vorherigen Version zurück/);
  await expect(card.getByTestId('update-done')).toContainText('Fertig', { timeout: 30_000 });
  expect(pi.build).toBe(was - 86_400);
  expect(pi.calls).toContain('POST /update/rollback');
});

test('what the Pi says about its last update is shown', async ({ page }) => {
  await loggedIn(page);
  await fakePi(page, {
    last: { result: 'rolled-back', name: 'b0', from: 'b1', at: 1_795_000_000_000 },
    hasPrevious: false,
  });
  await connection(page);
  await expect(page.getByTestId('update-last')).toContainText('nicht angelaufen');
  await expect(page.getByTestId('update-rollback')).toHaveCount(0);
});

test('powering the Pi down needs the login: without it the hold is off and says why – and nothing is closed first', async ({
  page,
}) => {
  const pi = await fakePi(page);
  await connection(page);
  const panel = page.getByTestId('pi-shutdown');
  await expect(panel).toContainText('erst anmelden');
  const button = panel.getByRole('button', { name: /Pi herunterfahren/ });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('data-reason', /erst anmelden/);
  expect(pi.calls).not.toContain('POST /system/shutdown');
});

test('powering the Pi down goes through with the login', async ({ page }) => {
  await loggedIn(page);
  const pi = await fakePi(page);
  await connection(page);
  await hold(page, /Pi herunterfahren/);
  await expect.poll(() => pi.calls.includes('POST /system/shutdown')).toBe(true);
});
