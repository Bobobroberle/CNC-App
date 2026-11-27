import { expect, type Locator, type Page, type Route } from '@playwright/test';
import {
  CAMERA_STATUS,
  CameraControls,
  CameraError,
  type CameraErrorCode,
} from '../../companion/src/camera';
import { fakeCamera } from '../../companion/test/cameraRig';

// Helpers shared by the e2e specs: a scripted FluidNC, the way to the stage's controls.

/** Replaces window.WebSocket with a scripted FluidNC that answers every line with ok. */
export async function installFakeFluidNC(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__sent = [] as string[];
    w.__status = '<Idle|MPos:0.000,0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000,0.000>';
    w.__config = [
      'board: Jackpot V2 TMC2226',
      'name: LowRider',
      'axes:',
      '  x:',
      '    max_rate_mm_per_min: 8000',
      '    max_travel_mm: 1000',
      '    soft_limits: true',
      '    homing:',
      '      positive_direction: false',
      '      mpos_mm: 3',
      '  y:',
      '    max_travel_mm: 2000',
      '    soft_limits: true',
      '    homing:',
      '      positive_direction: false',
      '      mpos_mm: 3',
      '  z:',
      '    max_travel_mm: 120',
      '    soft_limits: true',
      '    homing:',
      '      positive_direction: true',
      '      mpos_mm: 3',
    ].join('\n');
    w.__sd = [] as { name: string; size: number }[];
    // Uploads go over HTTP (no-cors); put them on the fake SD card.
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/upload') && init?.body instanceof FormData) {
        const file = init.body.get('myfile[]') as File;
        (w.__sd as { name: string; size: number }[]).push({
          name: file.name.replace(/^\//, ''),
          size: file.size,
        });
        return new Response(null);
      }
      return realFetch(input, init);
    };
    class FakeFluidNC {
      readyState = 0;
      binaryType = 'blob';
      onopen: ((e: unknown) => void) | null = null;
      onclose: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onmessage: ((e: { data: unknown }) => void) | null = null;
      constructor(readonly url: string) {
        if (url.includes('/api/sensors/stream')) {
          w.__sensorSocket = this;
          setTimeout(() => {
            this.readyState = 1;
            this.onopen?.({});
          }, 20);
          return;
        }
        w.__socket = this;
        w.__sockets = ((w.__sockets as number | undefined) ?? 0) + 1;
        // `__script`: how the next sockets behave – 'refuse' (nothing there) or
        // 'relay-down' (the companion takes it, then says FluidNC is not there).
        const script = (w.__script as string[] | undefined)?.shift();
        setTimeout(() => {
          if (script === 'refuse') {
            this.onerror?.({});
            this.close(1006, '');
            return;
          }
          this.readyState = 1;
          this.onopen?.({});
          if (script === 'relay-down') {
            this.close(1011, 'FluidNC unreachable: ws://192.168.0.200:81');
            return;
          }
          this.emit("Grbl 3.7 [FluidNC v3.7.12 (wifi) '$' for help]");
        }, 20);
      }
      send(data: string | Uint8Array) {
        if (this.readyState !== 1) return;
        const text = typeof data === 'string' ? data : `0x${data[0]!.toString(16)}`;
        if (text === '?') {
          this.emit(w.__status as string);
          return;
        }
        const line = text.trim();
        (w.__sent as string[]).push(line);
        if (line === '$H') this.emit('[MSG:Homed:ZXY]');
        if (/^\$H[XYZ]$/.test(line)) this.emit(`[MSG:Homed:${line[2]}]`);
        if (line === '$CD' || line.startsWith('$LocalFS/Show=')) {
          for (const l of (w.__config as string).split('\n')) this.emit(l);
        }
        if (line === '$Config/Filename') this.emit('$Config/Filename=config.yaml');
        if (line === '$SD/List') {
          // `__sdError`: the card cannot be mounted (FluidNC says error:60)
          if (w.__sdError) {
            this.emit(`error:${w.__sdError}`);
            return;
          } else {
            for (const f of w.__sd as { name: string; size: number }[]) {
              this.emit(`[FILE: ${f.name}|SIZE:${f.size}]`);
            }
          }
        }
        if (line.includes('G38.2')) {
          const prb = (w.__prb as string[] | undefined)?.shift() ?? '10.000,20.000,-12.000';
          this.emit(`[PRB:${prb}:1]`);
        }
        if (line === '$G') this.emit(`[GC:G0 ${w.__wcs ?? 'G54'} G17 G21 G90 G94 M5 M9 T1 F0 S0]`);
        if (/^G5[4-9]$/.test(line)) w.__wcs = line;
        if (line === '$#') {
          for (const l of [
            '[G54:0.000,0.000,0.000]',
            '[G55:100.000,200.000,-50.000]',
            '[G56:0.000,0.000,0.000]',
            '[G57:0.000,0.000,0.000]',
            '[G58:0.000,0.000,0.000]',
            '[G59:0.000,0.000,0.000]',
            '[G28:0.000,0.000,0.000]',
            '[G30:0.000,0.000,0.000]',
            '[G92:0.000,0.000,0.000]',
            '[TLO:0.000]',
          ])
            this.emit(l);
        }
        // FluidNC acknowledges $SD/Run only when the job ends (Job.cpp).
        if (line.startsWith('$SD/Run=')) return;
        // `__refuse`: lines starting with a key get FluidNC's `error:<code>` instead of ok.
        const refuse = Object.entries(
          (w.__refuse as Record<string, number> | undefined) ?? {},
        ).find(([prefix]) => line.startsWith(prefix));
        if (refuse && typeof data === 'string') {
          this.emit(`error:${refuse[1]}`);
          return;
        }
        if (typeof data === 'string' && data.endsWith('\n')) this.emit('ok');
      }
      emit(line: string) {
        this.onmessage?.({ data: new TextEncoder().encode(`${line}\n`).buffer });
      }
      close(code?: number, reason?: string) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.(code === undefined ? {} : { code, reason });
      }
    }
    w.WebSocket = FakeFluidNC;
  });
}

/**
 * Lets the scripted FluidNC stand where it was sent: measuring moves (G53 G1)
 * change the MPos of its status reports, as a machine would. Call after
 * `installFakeFluidNC`. Whatever waits for the machine to arrive (the scan of
 * the photo map, the centring) needs that.
 */
export async function followMoves(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __status: string; WebSocket: unknown };
    const Socket = w.WebSocket as { prototype: { send(data: unknown): void } };
    const send = Socket.prototype.send;
    Socket.prototype.send = function (data: unknown) {
      const m = typeof data === 'string' ? /^G90 G53 G1 (.*) F/.exec(data.trim()) : null;
      if (m) {
        w.__status = w.__status.replace(/MPos:([^|>]+)/, (_all, list: string) => {
          const pos = list.split(',').map(Number);
          for (const [, axis, value] of m[1]!.matchAll(/([XYZ])(-?[\d.]+)/g)) {
            pos['XYZ'.indexOf(axis!)] = Number(value);
          }
          return `MPos:${pos.map((v) => v.toFixed(3)).join(',')}`;
        });
      }
      return send.call(this, data);
    };
  });
}

// ---------- the way through the app: Start, the five steps, the side areas, the jog panel ----------

// Werkzeuge and Prüfen are no places of their own: they are the view "Prüfen" of Fräsen.
const STEP_IDS = {
  Job: 'job',
  Werkzeuge: 'run',
  Einrichten: 'setup',
  Prüfen: 'run',
  Fräsen: 'run',
  // Service and Einstellungen are tabs of their own; only the tool list and the console are in the menu.
  'Service & Diagnose': 'service',
  Einstellungen: 'settings',
  CAM: 'cam',
} as const;
export type StepName = keyof typeof STEP_IDS;
export type AreaName = 'Werkzeugliste' | 'Service & Diagnose' | 'Einstellungen' | 'Konsole';

/**
 * Goes where an operator goes: a step by its button in the row of the steps,
 * Start by its button, a side area through the main menu – and, where the
 * place has a second level, to that view of it.
 */
export async function goTo(page: Page, place: 'Start' | StepName | AreaName, view?: string) {
  if (place === 'Start') {
    await page.locator('.nav-start').click();
  } else if (place in STEP_IDS) {
    await page.getByTestId(`step-${STEP_IDS[place as StepName]}`).click();
  } else {
    await page.getByTestId('menu-button').click();
    await page
      .getByTestId('menu')
      .getByRole('button', { name: new RegExp(`^${place}`) })
      .click();
    await expect(page.getByTestId('menu')).toHaveCount(0);
  }
  if (place === 'Werkzeuge' || place === 'Prüfen') view = 'Prüfen';
  if (view) {
    await page
      .getByRole('group', { name: /^Bereich/ })
      .getByRole('button', { name: new RegExp(`^${view}`) })
      .click();
  }
  // The deeper levels of the steps' panels (DESIGN.md §2) are unfolded for the tests that
  // work with what lies in them; `e2e/steps.spec.ts` checks the folding itself.
  if (place === 'Prüfen') await moreOptions(page, 'check', true);
  if (place === 'Fräsen') await moreOptions(page, 'run', true);
  if (place === 'Einrichten' && view?.startsWith('Nullpunkt')) {
    await moreOptions(page, 'setup-zero', true);
  }
}

/** The old names of the job's sequence, where they live now. */
export async function jobView(page: Page, name: 'Vorbereiten' | 'Prüfen' | 'Fertigen' | 'Extras') {
  if (name === 'Prüfen') await goTo(page, 'Prüfen');
  else if (name === 'Fertigen') await goTo(page, 'Fräsen');
  else await goTo(page, 'Job', name);
}

/**
 * Unfolds the deeper level of a panel (DESIGN.md §2): "Mehr Optionen", or –
 * with `all` – "Alle Parameter" inside it. The app remembers it per area.
 */
export async function moreOptions(page: Page, area: string, all = false) {
  for (const level of all ? ['more', 'all'] : ['more']) {
    const fold = page.getByTestId(`depth-${level}-${area}`);
    if ((await fold.count()) === 0) continue;
    if ((await fold.getAttribute('data-open')) === null) {
      await fold.locator('[data-fold-trigger]').first().click();
    }
  }
}

/** Opens the app and goes to step ① Job: where a job begins. */
export async function openApp(page: Page) {
  await page.goto('/');
  await goTo(page, 'Job');
}

/** Opens the jog panel (it lies over the context panel of any place); no-op when it is open. */
export async function openJog(page: Page) {
  const toggle = page.getByTestId('jog-toggle');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(page.getByTestId('jog-panel')).toBeVisible();
  // Single axes, unlocking, the other ways of moving and the macros are "Mehr Optionen".
  await moreOptions(page, 'jog');
}

export async function closeJog(page: Page) {
  const toggle = page.getByTestId('jog-toggle');
  if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
}

export async function connect(page: Page) {
  await goTo(page, 'Einstellungen', 'Verbindung');
  await page.getByLabel('IP-Adresse des Jackpot').fill('192.168.178.40');
  await page.getByRole('button', { name: 'Verbinden' }).click();
  await expect(page.getByRole('button', { name: 'Trennen' })).toBeVisible();
}

/** The mode switch of the stage: Tisch, Kamera, 3D. */
export const stageMode = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Ansicht der Bühne' }).getByRole('button', { name, exact: true });

/** A tap tool in the row under the mode switch. */
export const stageTool = (page: Page, name: string) =>
  page.getByTestId('tool-strip').getByRole('button', { name, exact: true });

/**
 * A camera that has been set up: scale measured, camera height known. The
 * tap tools and the daily camera functions need that. `focusHeight` is the
 * work Z the machine stands at in the test (null = height not set yet).
 */
export async function seedCamera(page: Page, focusHeight: number | null) {
  await page.addInitScript((height) => {
    const key = 'lowrider-control.settings';
    if (localStorage.getItem(key)) return;
    localStorage.setItem(
      key,
      JSON.stringify({ camera: { scaleCalibrated: true, focusHeight: height } }),
    );
  }, focusHeight);
}

export const sent = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sent: string[] }).__sent);

/**
 * Presses a button and keeps it down the way an operator does: at least `ms`,
 * and – for a hold button – until its bar is full. A fixed time is not
 * enough: the bar fills by frames, and on a busy machine (the simulator
 * running fast, a scene being rebuilt) the frame that completes an 800 ms
 * hold can come later than a pointer let go after 1000 ms. The app then
 * rightly does nothing – letting go early cancels – and the test would go on
 * as if the hold had been confirmed.
 */
export async function pressAndHold(page: Page, button: Locator, ms = 1000) {
  // Holding a still disabled button (no status report yet) does nothing.
  await expect(button).toBeEnabled();
  // The pointer goes to where the button is once the layout has come to rest
  // (hover waits for that): a banner that has just appeared may still be moving.
  await button.hover();
  const full = button.evaluate(
    (el, limit) =>
      new Promise<boolean>((resolve) => {
        // A jog button moves while it is held; there is no bar to wait for.
        if (!el.classList.contains('hold')) return resolve(false);
        const observer = new MutationObserver(() => {
          if (!el.classList.contains('confirmed')) return;
          observer.disconnect();
          resolve(true);
        });
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, limit);
      }),
    ms + 5000,
  );
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await full;
  await page.mouse.up();
}

export async function hold(page: Page, name: RegExp, ms = 1000) {
  // What is held is a hold button (or a jog button) – not a heading of the same name that
  // unfolds a section.
  const button = page.getByRole('button', { name }).and(page.locator('.hold, .jog')).first();
  await pressAndHold(page, button, ms);
}

/**
 * Starts the loaded job the way the operator does: ⑤ Fräsen, the hold at the
 * bottom right – and, where the start asks first (DESIGN.md §6.4: no zero, a
 * low tool, a probe), the second hold inside the question.
 */
export async function startJob(page: Page, ms = 1800) {
  await goTo(page, 'Fräsen');
  await pressAndHold(page, page.getByTestId('primary-action').locator('button.hold'), ms);
  const confirm = page.getByTestId('start-confirm');
  const going = page.getByTestId('running-job').or(page.getByTestId('run-summary'));
  await expect(confirm.or(going).first()).toBeVisible({ timeout: 15_000 });
  if (await confirm.isVisible()) await pressAndHold(page, confirm.locator('button.hold'), ms);
}

// ---------- the demo: the simulated machine with its board on the table ----------

/** Starts the full demo and waits until the machine is ready and the photo map lies on the table. */
export async function openDemo(page: Page) {
  await page.goto('/#demo');
  await expect(page.getByTestId('machine-state')).toContainText('Bereit', { timeout: 20_000 });
  // The demo opens on the start screen; a job begins at step ①, with the table beside it.
  await goTo(page, 'Job');
  await expect
    .poll(async () => Number(await page.getByTestId('table-view').getAttribute('data-photos')))
    .toBeGreaterThan(40);
  await page.waitForTimeout(300);
}

/** Angle of the simulator's board on the table, degrees (`SIM_BOARD.angle`). */
const BOARD_ANGLE = 1.5;
/** Hole 1 of the board, where the demo puts the work zero (board coordinates, mm). */
const BOARD_ZERO = { x: 20, y: 20 };
/** Where the demo's camera looks, board coordinates (`DEMO_CAMERA_SPOT`). */
const CAMERA_SPOT = { x: 72, y: 58 };

const turned = (dx: number, dy: number) => {
  const a = (BOARD_ANGLE * Math.PI) / 180;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
};

/** A point of the simulator's board (mm from its corner) in the demo's work coordinates. */
export const boardToWork = (bx: number, by: number) => turned(bx - BOARD_ZERO.x, by - BOARD_ZERO.y);

/** How the table view shows work coordinates right now. */
export async function tableGeometry(page: Page) {
  const text = (await page.getByTestId('table-view').getAttribute('data-view')) ?? '';
  const [scale = 0, originX = 0, originY = 0] = text.split(',').map(Number);
  const box = (await page.getByTestId('stage-canvas').boundingBox())!;
  return { scale, originX, originY, box };
}

/**
 * A value read from the page once it rests: two looks a moment apart show
 * the same (a slow runner draws the last step of a drag late).
 */
export async function rested<T>(page: Page, read: () => Promise<T>): Promise<T> {
  let value = await read();
  await expect
    .poll(
      async () => {
        const before = JSON.stringify(value);
        await page.waitForTimeout(150);
        value = await read();
        return JSON.stringify(value) === before;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return value;
}

/** The table view once it rests: a new job fits it anew, a glide takes a moment. */
export async function restingTable(page: Page) {
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await tableGeometry(page));
      // Not laid out yet is a scale of exactly 0 – not 0.6, a table zoomed out.
      const same = now === last && !now.startsWith('{"scale":0,');
      last = now;
      return same;
    })
    .toBe(true);
  return tableGeometry(page);
}

/** Where a work point lies on the page (the table view, seen from above). */
export async function tableSpot(page: Page, work: { x: number; y: number }) {
  const g = await tableGeometry(page);
  return {
    x: g.box.x + g.originX + work.x * g.scale,
    y: g.box.y + g.originY - work.y * g.scale,
  };
}

/** The work point under a place on the page. */
export async function tableWork(page: Page, spot: { x: number; y: number }) {
  const g = await tableGeometry(page);
  return {
    x: (spot.x - g.box.x - g.originX) / g.scale,
    y: (g.box.y + g.originY - spot.y) / g.scale,
  };
}

/** Where a point of the board lies on the page in the demo's live picture (1200 × 900, 10 px/mm). */
export async function cameraSpot(page: Page, bx: number, by: number) {
  const box = (await page.getByTestId('camera-overlay').boundingBox())!;
  const d = turned(bx - CAMERA_SPOT.x, by - CAMERA_SPOT.y);
  return {
    x: box.x + ((600 + d.x * 10) / 1200) * box.width,
    y: box.y + ((450 - d.y * 10) / 900) * box.height,
  };
}

/**
 * Draws a shape in the open drawing workspace: one tap puts it on the
 * table, selected; its measures and place are then typed into the fields
 * of the selection (in the order given – a size first, then where it lies).
 */
export async function drawShape(
  page: Page,
  shape:
    | 'Rechteck'
    | 'Kreis'
    | 'Langloch'
    | 'Lochraster'
    | 'Ellipse'
    | 'Stern'
    | 'Zahnrad'
    | 'Spirale',
  fields: Record<string, string> = {},
) {
  const cam = page.getByTestId('cam-card');
  // "Weitere Grundformen" are folded away in the add card until the fold is opened (once; then it stays)
  if (['Ellipse', 'Stern', 'Zahnrad', 'Spirale'].includes(shape)) {
    const more = cam.getByTestId('cam-shapes-more').getByRole('button', {
      name: 'Weitere Grundformen',
      exact: true,
    });
    if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  }
  await cam.getByTestId('cam-add').getByRole('button', { name: shape, exact: true }).click();
  const selection = cam.getByTestId('cam-arrange');
  for (const [label, value] of Object.entries(fields)) {
    await selection.getByLabel(label, { exact: true }).fill(value);
  }
}

/**
 * Three plates in the drawing workspace, each its own thing, by hand (x from, y from, x to, y to):
 *   1: 0 0 40 20      2: 100 40 130 70      3: 60 100 110 110
 * together 0 0 130 110. Returns the workspace.
 */
export async function drawThreePlates(page: Page) {
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '40', 'Höhe (mm)': '20' });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '30',
    'Höhe (mm)': '30',
    'X links (mm)': '100',
    'Y unten (mm)': '40',
  });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '50',
    'Höhe (mm)': '10',
    'X links (mm)': '60',
    'Y unten (mm)': '100',
  });
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(3);
  return cam;
}

/** Whether the stage view itself (not a panel or an inset lying on it) is under a place on the page. */
export const onStage = (page: Page, spot: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el instanceof HTMLCanvasElement && el.closest('.table-view, .camera-stage') !== null;
  }, spot);

/** The first number in a text as it is shown in German ("−4,7" → −4.7). */
export const numberIn = (text: string | null) =>
  Number((/[−-]?\d+(?:,\d+)?/.exec(text ?? '')?.[0] ?? 'NaN').replace('−', '-').replace(',', '.'));

/**
 * Measures that a control is in reach: it lies inside the visible area of the container that
 * scrolls (a panel, the stage's prompt) and a touch at its middle reaches it – `toBeVisible`
 * cannot see a control that is clipped by a scroll box or covered by another.
 */
export async function inReach(page: Page, control: Locator, container: Locator) {
  const area = (await container.boundingBox())!;
  const box = (await control.boundingBox())!;
  const reached = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  return {
    inside: box.y >= area.y - 0.5 && box.y + box.height <= area.y + area.height + 0.5,
    reached,
    box,
    area,
  };
}

/**
 * A companion that answers on the app's own origin and can set the camera: the camera's routes run the companion's own
 * code (`CameraControls`: the parser, the whitelist, the ranges, the order, the answer) against a camera behind a
 * `v4l2-ctl` that keeps its values and prints them as the real one does (`apps/companion/test/cameraRig.ts`) – so a
 * value the camera would refuse is refused here for the same reason, and a switch of the mode makes the exposure time
 * inactive. The rest of the Pi answers as an empty one (the state and the libraries – a device that syncs must find them).
 */
export interface FakeCameraPi {
  /** The camera behind it: its values (`get(name).value`) can be changed "by another device"; `calls` is what v4l2-ctl was asked */
  camera: ReturnType<typeof fakeCamera>;
  /** What the app asked to write, and how often it read */
  puts: Record<string, number>[];
  gets: number;
  /** While set, a read of the camera fails like this */
  failRead: { error: CameraErrorCode } | null;
}

export async function installFakeCameraPi(
  page: Page,
  options: Parameters<typeof fakeCamera>[0] = {},
): Promise<FakeCameraPi> {
  const camera = fakeCamera(options);
  const stored: { value: unknown } = { value: null };
  const controls = new CameraControls({
    device: '/dev/video0',
    run: camera.run,
    access: async () => undefined,
    load: () => stored.value,
    save: (values) => {
      stored.value = values;
    },
  });
  const pi: FakeCameraPi = { camera, puts: [], gets: 0, failRead: null };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
  const failed = (route: Route, error: unknown) => {
    if (!(error instanceof CameraError)) throw error;
    return json(route, { error: error.code }, CAMERA_STATUS[error.code]);
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, '');
    if (path === '/health')
      return json(route, {
        ok: true,
        version: '1.6.0',
        fluidnc: null,
        sensors: 'none',
        // the companion's own host, port 8081: the stream the app adopts as its camera
        camera: ':8081/stream',
        state: true,
        cameraControls: true,
      });
    if (path === '/camera/controls') {
      if (request.method() === 'PUT') {
        pi.puts.push((request.postDataJSON() as { controls: Record<string, number> }).controls);
        try {
          return json(route, await controls.apply(request.postDataJSON()));
        } catch (error) {
          return failed(route, error);
        }
      }
      pi.gets += 1;
      if (pi.failRead) return failed(route, new CameraError(pi.failRead.error));
      try {
        return json(route, { controls: await controls.list() });
      } catch (error) {
        return failed(route, error);
      }
    }
    if (path === '/state') return json(route, { keys: {} });
    if (path.startsWith('/state/')) return json(route, { ok: true, rev: 1 });
    if (path.startsWith('/library/')) return json(route, []);
    return json(route, { error: 'not-found' }, 404);
  });
  return pi;
}
