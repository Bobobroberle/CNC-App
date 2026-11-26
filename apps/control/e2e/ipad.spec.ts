import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import {
  boardToWork,
  closeJog,
  connect,
  drawShape,
  drawThreePlates,
  goTo,
  installFakeFluidNC,
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
} from './helpers';

/**
 * Touch on the iPad Air: real multi-touch through the DevTools protocol
 * (the `ipad` project in playwright.config.ts). Gestures move the view only;
 * whatever is held to move the machine lets go when the touch is lost.
 */

interface Finger {
  id: number;
  x: number;
  y: number;
}

/** Fingers on the screen, sent as real touch events. */
class Touch {
  private down = new Map<number, Finger>();
  private constructor(private readonly cdp: CDPSession) {}

  static async on(page: Page): Promise<Touch> {
    return new Touch(await page.context().newCDPSession(page));
  }

  private send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel') {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchCancel'
          ? []
          : [...this.down.values()].map((f) => ({
              id: f.id,
              x: f.x,
              y: f.y,
              radiusX: 8,
              radiusY: 8,
            })),
    });
  }

  async start(...fingers: Finger[]) {
    for (const f of fingers) this.down.set(f.id, f);
    await this.send('touchStart');
  }

  /** Moves fingers to new places in a few steps, like a hand does. */
  async move(to: Finger[], steps = 6) {
    const from = to.map((f) => this.down.get(f.id)!);
    for (let i = 1; i <= steps; i++) {
      to.forEach((f, k) => {
        const a = from[k]!;
        this.down.set(f.id, {
          id: f.id,
          x: a.x + ((f.x - a.x) * i) / steps,
          y: a.y + ((f.y - a.y) * i) / steps,
        });
      });
      await this.send('touchMove');
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }

  async end(...ids: number[]) {
    for (const id of ids.length ? ids : [...this.down.keys()]) this.down.delete(id);
    await this.send('touchEnd');
  }

  /** The system takes the touches away (a system gesture, a palm). */
  async cancel() {
    this.down.clear();
    await this.send('touchCancel');
  }

  async tap(x: number, y: number, id = 1) {
    await this.start({ id, x, y });
    await this.end(id);
  }
}

const centre = async (locator: Locator) => {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

/** Scale and origin of the table view, as the painter last drew it. */
const tableView = async (page: Page) => {
  const text = (await page.getByTestId('table-view').getAttribute('data-view')) ?? '';
  const [scale = 0, originX = 0, originY = 0] = text.split(',').map(Number);
  return { scale, originX, originY };
};

const count = async (page: Page, line: string) =>
  (await sent(page)).filter((l) => l === line).length;

test('pinch zooms the table around the fingers, a double tap fits it again', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  const canvas = page.getByTestId('stage-canvas');
  const { x, y, box } = await centre(canvas);
  await expect.poll(async () => (await tableView(page)).scale).toBeGreaterThan(0);
  const fitted = await tableView(page);
  // What lies under the middle between the fingers must still lie there afterwards.
  const under = (v: typeof fitted, sx: number) => (sx - box.x - v.originX) / v.scale;
  const before = under(fitted, x);

  const touch = await Touch.on(page);
  await touch.start({ id: 1, x: x - 40, y }, { id: 2, x: x + 40, y });
  await touch.move([
    { id: 1, x: x - 100, y },
    { id: 2, x: x + 100, y },
  ]);
  const zoomed = await tableView(page);
  expect(zoomed.scale / fitted.scale).toBeGreaterThan(2.3);
  expect(zoomed.scale / fitted.scale).toBeLessThan(2.7);
  expect(under(zoomed, x)).toBeCloseTo(before, 0);

  // Two fingers also carry the picture along while they zoom.
  await touch.move([
    { id: 1, x: x - 40, y: y + 30 },
    { id: 2, x: x + 160, y: y + 30 },
  ]);
  const carried = await tableView(page);
  expect(under(carried, x + 60)).toBeCloseTo(before, 0);
  expect(carried.originY - zoomed.originY).toBeCloseTo(30, 0);
  await touch.end();

  // Double tap: back to the whole job – and from there, closer to the spot.
  await touch.tap(x, y);
  await touch.tap(x, y);
  await expect.poll(async () => (await tableView(page)).scale).toBeCloseTo(fitted.scale, 2);
  await page.waitForTimeout(400);
  await touch.tap(x - 60, y);
  await touch.tap(x - 60, y);
  await expect.poll(async () => (await tableView(page)).scale / fitted.scale).toBeCloseTo(2.5, 1);
});

test('a pan or a pinch never gives the tap tool a point, a tap does', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  // The connection's area is a list without the picture: back to the step.
  await goTo(page, 'Job');
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  await expect(stageTool(page, 'Hinfahren')).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByTestId('tool-panel');
  await expect(panel).toContainText('Stelle antippen');
  const { x, y } = await centre(page.getByTestId('stage-canvas'));
  const touch = await Touch.on(page);
  const start = await tableView(page);

  // One finger drags the view, quickly and slowly, and ends where it started.
  await touch.start({ id: 1, x, y });
  await touch.move([{ id: 1, x: x + 90, y: y + 20 }]);
  await touch.end();
  await touch.start({ id: 1, x, y });
  await touch.move([{ id: 1, x: x + 60, y }], 3);
  await touch.move([{ id: 1, x, y }], 3);
  await touch.end();
  expect((await tableView(page)).originX).not.toBeCloseTo(start.originX, 0);
  // Two fingers zoom; they lift one after the other.
  await touch.start({ id: 1, x: x - 30, y }, { id: 2, x: x + 30, y });
  await touch.move([
    { id: 1, x: x - 70, y },
    { id: 2, x: x + 70, y },
  ]);
  await touch.end(2);
  await touch.end(1);
  // The system takes a touch away in mid-tap.
  await touch.start({ id: 1, x, y });
  await touch.cancel();
  await page.waitForTimeout(700);
  await expect(panel).toContainText('Stelle antippen');
  await expect(panel).not.toHaveClass(/has-result/);

  // A plain tap gives the point.
  await touch.tap(x - 50, y + 10);
  await expect(panel).toHaveClass(/has-result/);
  await expect(panel).toContainText('X ');
  // Nothing of all that moved the machine.
  expect((await sent(page)).filter((l) => l.startsWith('$J=') || l.startsWith('G0'))).toEqual([]);
});

test('a hold lets go when the finger slides off, a second finger lands or the app is left', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await openJog(page);
  const button = page.getByRole('button', { name: /^Referenzfahrt/ }).first();
  await expect(button).toBeEnabled();
  await button.scrollIntoViewIfNeeded();
  const { x, y, box } = await centre(button);
  const touch = await Touch.on(page);
  const filled = () =>
    button.evaluate((b) => Number(getComputedStyle(b).getPropertyValue('--hold')));

  // The finger slides off the button sideways and stays down.
  await touch.start({ id: 1, x, y });
  await expect.poll(filled).toBeGreaterThan(0.1);
  await touch.move([{ id: 1, x: box.x - 60, y }]);
  await page.waitForTimeout(1100);
  await touch.end();
  expect(await count(page, '$H')).toBe(0);

  // A second finger lands somewhere else.
  const stage = await centre(page.getByTestId('stage-canvas'));
  await touch.start({ id: 1, x, y });
  await expect.poll(filled).toBeGreaterThan(0.1);
  await touch.start({ id: 2, x: stage.x, y: stage.y });
  await page.waitForTimeout(1100);
  await touch.end();
  expect(await count(page, '$H')).toBe(0);

  // The system takes the touch (pointercancel).
  await touch.start({ id: 1, x, y });
  await expect.poll(filled).toBeGreaterThan(0.1);
  await touch.cancel();
  await page.waitForTimeout(1100);
  expect(await count(page, '$H')).toBe(0);

  // The app goes to the background while the finger is down.
  await touch.start({ id: 1, x, y });
  await expect.poll(filled).toBeGreaterThan(0.1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1100);
  await touch.end();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await count(page, '$H')).toBe(0);

  // Held to the end, it confirms – once.
  await touch.start({ id: 1, x, y });
  await expect.poll(() => count(page, '$H')).toBe(1);
  await touch.end();
});

test('continuous jog and the joystick stop when the touch is lost', async ({ page }) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  await openJog(page);
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,100.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  await page.getByRole('button', { name: 'Dauer' }).click();
  const button = page.getByRole('button', { name: /^X\+/ });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeEnabled();
  const { x, y, box } = await centre(button);
  const touch = await Touch.on(page);
  const jogs = async () => (await sent(page)).filter((l) => l.startsWith('$J=')).length;
  const stops = () => count(page, '0x85');

  // The system takes the touch away.
  await touch.start({ id: 1, x, y });
  await expect.poll(jogs).toBe(1);
  expect(await stops()).toBe(0);
  await touch.cancel();
  await expect.poll(stops).toBe(1);

  // The finger slides off the button.
  await touch.start({ id: 1, x, y });
  await expect.poll(jogs).toBe(2);
  await touch.move([{ id: 1, x: box.x + box.width + 50, y }]);
  await expect.poll(stops).toBe(2);
  await touch.end();
  expect(await stops()).toBe(2);

  // The app goes to the background.
  await touch.start({ id: 1, x, y });
  await expect.poll(jogs).toBe(3);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(stops).toBe(3);
  await touch.end();
  expect(await stops()).toBe(3);

  // The joystick: pulled to the right, then the touch is cancelled.
  await page.getByRole('button', { name: 'Joystick', exact: true }).last().click();
  const stick = page.getByTestId('jogstick').last();
  await stick.scrollIntoViewIfNeeded();
  const s = await centre(stick);
  await touch.start({ id: 1, x: s.x, y: s.y });
  await touch.move([{ id: 1, x: s.x + 50, y: s.y }]);
  await expect.poll(jogs).toBeGreaterThan(3);
  await touch.cancel();
  await expect.poll(stops).toBe(4);
  const after = await jogs();
  await page.waitForTimeout(400);
  expect(await jogs()).toBe(after);
});

test('NOT-HALT answers the touch itself, also while another finger holds the stage', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  // The connection's area is a list without the picture: back to the step.
  await goTo(page, 'Job');
  const stage = await centre(page.getByTestId('stage-canvas'));
  const estop = await centre(page.getByRole('button', { name: 'NOT-HALT' }));
  const touch = await Touch.on(page);
  await touch.start({ id: 1, x: stage.x, y: stage.y });
  await touch.move([{ id: 1, x: stage.x + 40, y: stage.y }]);
  // Finger down, not lifted yet: the stop is already sent.
  await touch.start({ id: 2, x: estop.x, y: estop.y });
  await expect.poll(() => count(page, '\u0018')).toBe(1);
  await touch.end();
});

test('pinch zooms the camera picture and a tap still hits the same spot', async ({ page }) => {
  await installFakeFluidNC(page);
  await seedCamera(page, -10);
  await openApp(page);
  await connect(page);
  // The connection's area is a list without the picture: back to the step.
  await goTo(page, 'Job');
  await page.evaluate(() => {
    (window as unknown as { __status: string }).__status =
      '<Idle|MPos:100.000,200.000,-10.000|FS:0,0|WCO:0.000,0.000,0.000>';
  });
  await stageMode(page, 'Kamera').click();
  await page
    .getByTestId('camera-stage')
    .getByRole('button', { name: 'Kamera einschalten' })
    .click();
  const overlay = page.getByTestId('camera-overlay');
  await expect(overlay).toBeVisible();
  await expect.poll(() => overlay.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const stage = page.getByTestId('camera-stage');
  const panel = page.getByTestId('tool-panel');
  const box = (await overlay.boundingBox())!;
  // A spot left and above the middle of the picture, clear of the hint along the lower edge.
  const spot = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.3 };
  const point = async () => {
    const text = (await panel.locator('.tool-point').textContent()) ?? '';
    return text
      .replace(/−/g, '-')
      .match(/-?\d+\.\d/g)!
      .map(Number);
  };
  const touch = await Touch.on(page);

  await touch.tap(spot.x, spot.y);
  await expect(panel).toHaveClass(/has-result/);
  const whole = await point();
  await page.getByRole('button', { name: 'Punkt verwerfen' }).click();
  await expect(panel).not.toHaveClass(/has-result/);

  // Double tap: closer, around the spot – and no point for the tool from it.
  await page.waitForTimeout(400);
  await touch.tap(spot.x, spot.y);
  await touch.tap(spot.x, spot.y);
  await expect(stage).toHaveAttribute('data-zoom', '2.5');
  await expect(panel).not.toHaveClass(/has-result/);
  // The same place on the screen is still the same place on the table.
  await page.waitForTimeout(400);
  await touch.tap(spot.x, spot.y);
  await expect(panel).toHaveClass(/has-result/);
  const zoomed = await point();
  expect(Math.abs(zoomed[0]! - whole[0]!)).toBeLessThan(0.3);
  expect(Math.abs(zoomed[1]! - whole[1]!)).toBeLessThan(0.3);
  // Zoomed in, a step on the screen is a smaller step on the table.
  await touch.tap(spot.x + 50, spot.y);
  await expect.poll(async () => (await point())[0]! - zoomed[0]!).not.toBe(0);
  const stepZoomed = Math.abs((await point())[0]! - zoomed[0]!);

  // Two fingers zoom further; the button brings the whole picture back.
  await touch.start(
    { id: 1, x: spot.x - 30, y: spot.y + 60 },
    { id: 2, x: spot.x + 30, y: spot.y + 60 },
  );
  await touch.move([
    { id: 1, x: spot.x - 60, y: spot.y + 60 },
    { id: 2, x: spot.x + 60, y: spot.y + 60 },
  ]);
  await touch.end();
  await expect.poll(async () => Number(await stage.getAttribute('data-zoom'))).toBeGreaterThan(4);
  await page.getByTestId('camera-zoom-reset').click();
  await expect(stage).toHaveAttribute('data-zoom', '1');
  await page.waitForTimeout(400);
  await touch.tap(spot.x, spot.y);
  await touch.tap(spot.x + 50, spot.y);
  await expect
    .poll(async () => Math.abs((await point())[0]! - whole[0]!))
    .toBeGreaterThan(stepZoomed * 2);
});

// ---------- finger tools: things on the picture follow the finger, the view keeps its gestures ----------

test('a finger on a measured point moves the point; beside it the view pans, two fingers zoom', async ({
  page,
}) => {
  await openDemo(page);
  await stageTool(page, 'Messen').click();
  const touch = await Touch.on(page);
  const hole1 = await tableSpot(page, boardToWork(20, 20));
  const hole2 = await tableSpot(page, boardToWork(220, 20));
  await touch.tap(hole1.x, hole1.y);
  await page.waitForTimeout(400);
  await touch.tap(hole2.x, hole2.y);
  const distance = async () => numberIn(await page.getByTestId('measure-distance').textContent());
  await expect.poll(async () => Math.abs((await distance()) - 200)).toBeLessThan(1.5);
  const whole = await distance();
  const view = await tableGeometry(page);

  // The finger takes the second point 50 px to the left; the table stays where it is.
  await touch.start({ id: 1, x: hole2.x + 6, y: hole2.y - 5 });
  await touch.move([{ id: 1, x: hole2.x - 44, y: hole2.y - 5 }], 10);
  await touch.end();
  const dragged = (await distance()) - whole;
  expect(dragged).toBeLessThan(-28 / view.scale);
  expect(dragged).toBeGreaterThan(-52 / view.scale);
  expect(await tableGeometry(page)).toEqual(view);

  // Beside the points one finger pans, two fingers zoom – the measurement stays.
  const kept = await distance();
  const free = { x: hole1.x + 80, y: hole1.y - 110 };
  expect(await onStage(page, free)).toBe(true);
  await touch.start({ id: 1, x: free.x, y: free.y });
  await touch.move([{ id: 1, x: free.x + 30, y: free.y + 8 }], 6);
  await touch.move([{ id: 1, x: free.x + 30.5, y: free.y + 8 }], 2);
  await touch.end();
  await page.waitForTimeout(500);
  const panned = await tableGeometry(page);
  expect(panned.originX - view.originX).toBeGreaterThan(20);
  await touch.start(
    { id: 1, x: free.x - 30, y: free.y - 40 },
    { id: 2, x: free.x + 30, y: free.y - 40 },
  );
  await touch.move([
    { id: 1, x: free.x - 60, y: free.y - 40 },
    { id: 2, x: free.x + 60, y: free.y - 40 },
  ]);
  await touch.end();
  await page.waitForTimeout(500);
  expect((await tableGeometry(page)).scale / panned.scale).toBeGreaterThan(1.7);
  expect(await distance()).toBe(kept);
});

test('a clamp follows the finger and its corner resizes it; a lost touch leaves it where it is', async ({
  page,
}) => {
  await openDemo(page);
  await stageTool(page, 'Spannmittel').click();
  const table = page.getByTestId('table-view');
  const panel = page.getByTestId('tool-panel');
  const touch = await Touch.on(page);
  const zone = async () =>
    ((await table.getAttribute('data-zone')) ?? '').split(',').map(Number) as number[];

  // A tap on the cutter's way along the lower edge of the sign plate.
  const at = boardToWork(100, 40);
  const spot = await tableSpot(page, at);
  expect(await onStage(page, spot)).toBe(true);
  await touch.tap(spot.x, spot.y);
  await expect(panel.getByTestId('zone-warning')).toContainText('Zwinge 2 liegt in der Fräsbahn');
  const placed = await zone();
  expect(placed[2]! - placed[0]!).toBeCloseTo(60, 0);
  expect((placed[0]! + placed[2]!) / 2).toBeCloseTo(at.x, 0);
  const view = await tableGeometry(page);

  // The finger carries it 70 px up, into the plate; a second finger on the way changes nothing.
  await touch.start({ id: 1, x: spot.x, y: spot.y });
  await touch.move([{ id: 1, x: spot.x, y: spot.y - 40 }], 8);
  await touch.start({ id: 2, x: spot.x + 150, y: spot.y - 150 });
  await touch.move([
    { id: 1, x: spot.x, y: spot.y - 70 },
    { id: 2, x: spot.x + 190, y: spot.y - 150 },
  ]);
  await touch.end();
  const carried = await zone();
  const up = carried[1]! - placed[1]!;
  expect(up).toBeGreaterThan(50 / view.scale);
  expect(up).toBeLessThan(72 / view.scale);
  expect(carried[0]!).toBeCloseTo(placed[0]!, 0);
  expect(await tableGeometry(page)).toEqual(view);
  await expect(table).toHaveAttribute('data-zones', '2');

  // The system takes the touch in mid-drag: the clamp stays where it was let go of.
  const centre = await tableSpot(page, {
    x: (carried[0]! + carried[2]!) / 2,
    y: (carried[1]! + carried[3]!) / 2,
  });
  await touch.start({ id: 1, x: centre.x, y: centre.y });
  await touch.move([{ id: 1, x: centre.x + 40, y: centre.y }], 8);
  // Read once the last step of the move is on the picture: the clamp has followed the finger
  // and two looks a moment apart show it in the same place (a slow runner draws late).
  let mid: number[] = [];
  await expect
    .poll(
      async () => {
        const before = await zone();
        await page.waitForTimeout(250);
        mid = await zone();
        return mid.join() === before.join() && mid[0]! - carried[0]! > 20 / view.scale;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await touch.cancel();
  await page.waitForTimeout(200);
  expect(await zone()).toEqual(mid);
  expect(mid[0]! - carried[0]!).toBeGreaterThan(20 / view.scale);

  // Its upper right corner under the finger: the corner follows, the opposite one stays.
  const corner = await tableSpot(page, { x: mid[2]!, y: mid[3]! });
  await touch.start({ id: 1, x: corner.x + 3, y: corner.y - 3 });
  await touch.move([{ id: 1, x: corner.x + 43, y: corner.y - 33 }], 10);
  await touch.end();
  const sized = await zone();
  expect(sized[0]!).toBeCloseTo(mid[0]!, 0);
  expect(sized[1]!).toBeCloseTo(mid[1]!, 0);
  expect(sized[2]! - mid[2]!).toBeGreaterThan(20 / view.scale);
  expect(sized[3]! - mid[3]!).toBeGreaterThan(12 / view.scale);
  await expect(panel.getByTestId('zone-selected')).not.toContainText('60 × 40 mm');

  // A tap beside it puts down the next one; "Löschen" removes the selected one.
  await panel.getByRole('button', { name: 'Schraube' }).click();
  const beside = await tableSpot(page, boardToWork(45, 12));
  expect(await onStage(page, beside)).toBe(true);
  await touch.tap(beside.x, beside.y);
  await expect(panel.getByTestId('zone-selected')).toContainText('Schraube 3');
  await expect(panel.getByTestId('zone-selected')).toContainText('Ø 12 mm');
  await expect(table).toHaveAttribute('data-zones', '3');
  await panel.getByRole('button', { name: 'Löschen' }).click();
  await expect(table).toHaveAttribute('data-zones', '2');
});

test('the zero by fingertip: tap, place it under the loupe with the finger, hold to set', async ({
  page,
}) => {
  await openDemo(page);
  await stageTool(page, 'Nullpunkt').click();
  const panel = page.getByTestId('tool-panel');
  const touch = await Touch.on(page);
  const corner = await tableSpot(page, boardToWork(0, 0));
  expect(await onStage(page, { x: corner.x + 5, y: corner.y - 4 })).toBe(true);
  await touch.tap(corner.x + 5, corner.y - 4);
  const shift = async () => {
    const text = (await page.getByTestId('zero-shift').textContent()) ?? '';
    return {
      x: numberIn(/X ([+−\d,]+)/.exec(text)![1]!.replace('+', '')),
      y: numberIn(/Y ([+−\d,]+)/.exec(text)![1]!.replace('+', '')),
    };
  };
  const tapped = await shift();
  expect(Math.abs(tapped.x + 20)).toBeLessThan(8);

  // A finger in the loupe: 48 px to the left are 4 mm to the right for the mark.
  const loupe = await centre(panel.getByTestId('loupe'));
  await touch.start({ id: 1, x: loupe.x, y: loupe.y });
  await touch.move([{ id: 1, x: loupe.x - 48, y: loupe.y + 24 }], 8);
  await touch.end();
  expect((await shift()).x).toBeCloseTo(tapped.x + 4, 1);
  expect((await shift()).y).toBeCloseTo(tapped.y + 2, 1);
  // The fine step by a tap.
  const left = await centre(panel.getByRole('button', { name: 'Marke nach links (X−)' }));
  await touch.tap(left.x, left.y);
  expect((await shift()).x).toBeCloseTo(tapped.x + 3.9, 1);

  // A tap on the button sets nothing; holding it does, and the tool goes on to the edge.
  const button = await centre(panel.getByRole('button', { name: /Nullpunkt X\/Y setzen/ }));
  const tile = page.getByTestId('position-tile');
  const before = await tile.textContent();
  await touch.tap(button.x, button.y);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('zero-done')).toHaveCount(0);
  expect(await tile.textContent()).toBe(before);
  await touch.start({ id: 1, x: button.x, y: button.y });
  await expect(page.getByTestId('zero-done')).toContainText('Nullpunkt gesetzt');
  await touch.end();
  await expect.poll(() => tile.textContent()).not.toBe(before);
  await expect(panel.getByRole('button', { name: /Kante/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a part of the drawing follows the finger; a tap beside it lets go, the view stays', async ({
  page,
}) => {
  // No machine needed: arranging a drawing works at the kitchen table too.
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  const touch = await Touch.on(page);
  const box = async () =>
    ((await table.getAttribute('data-drawing-selected')) ?? '').split(',').map(Number);
  await drawShape(page, 'Rechteck');
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '30',
    'Höhe (mm)': '20',
    'X links (mm)': '20',
    'Y unten (mm)': '15',
  });
  // The small plate inside the large one is selected, as the thing added last.
  expect(await box()).toEqual([20, 15, 50, 35]);
  await page.waitForTimeout(400);

  // A tap beside both lets go of it. The spot is whichever side of the job is free.
  const free = async (...spots: { x: number; y: number }[]) => {
    for (const work of spots) {
      const spot = await tableSpot(page, work);
      if (await onStage(page, spot)) return spot;
    }
    throw new Error('no free spot beside the drawing');
  };
  const outside = await free({ x: 50, y: -12 }, { x: 50, y: 72 }, { x: -12, y: 30 });
  await touch.tap(outside.x, outside.y);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  await expect(cam.getByTestId('cam-selected')).toHaveCount(0);

  // A finger on the small plate's edge takes it; the plate goes with the finger, the view rests.
  const view = await tableGeometry(page);
  const edge = await tableSpot(page, { x: 35, y: 35 });
  expect(await onStage(page, edge)).toBe(true);
  await touch.start({ id: 1, x: edge.x, y: edge.y });
  await expect(cam.getByTestId('cam-selected')).toContainText('Rechteck 30 × 20 mm');
  await touch.move([{ id: 1, x: edge.x + 80, y: edge.y - 50 }], 10);
  const carried = await rested(page, box);
  // The finger went 80 px right and 50 px up, less the few pixels a touch may wobble;
  // the plate's corner lands on whole millimetres.
  expect(carried[0]! - 20).toBeGreaterThan(60 / view.scale - 0.5);
  expect(carried[0]! - 20).toBeLessThan(82 / view.scale + 0.5);
  expect(carried[1]! - 15).toBeGreaterThan(32 / view.scale - 0.5);
  expect(carried[1]! - 15).toBeLessThan(52 / view.scale + 0.5);
  expect(carried[0]! % 1).toBe(0);
  expect(carried[1]! % 1).toBe(0);
  expect(carried[2]! - carried[0]!).toBeCloseTo(30, 1);
  expect(await tableGeometry(page)).toEqual(view);
  await touch.end();
  // Let go, it stays where it was put – on the picture and in the numbers – and the job is made anew.
  await page.waitForTimeout(400);
  expect(await box()).toEqual(carried);
  expect(await tableGeometry(page)).toEqual(view);
  await expect(cam.getByTestId('cam-arrange').getByLabel('X links (mm)')).toHaveValue(
    String(carried[0]),
  );

  // Inside the large plate, away from every line, one finger pans and two zoom the view as ever.
  const left = await tableSpot(page, { x: 15, y: 52 });
  const right = await tableSpot(page, { x: 85, y: 52 });
  await touch.start({ id: 1, x: left.x, y: left.y }, { id: 2, x: right.x, y: right.y });
  await touch.move([
    { id: 1, x: left.x - 60, y: left.y },
    { id: 2, x: right.x + 60, y: right.y },
  ]);
  await touch.end();
  await page.waitForTimeout(400);
  const zoomed = await tableGeometry(page);
  expect(zoomed.scale).toBeGreaterThan(view.scale * 1.2);
  expect(await box()).toEqual(carried);

  // A tap there means the large plate: the smallest shape around the finger.
  const inside = await tableSpot(page, { x: 12, y: 50 });
  expect(await onStage(page, inside)).toBe(true);
  await touch.tap(inside.x, inside.y);
  await expect(cam.getByTestId('cam-selected')).toContainText('Rechteck 100 × 60 mm');
  // A touch the system takes away leaves the part where the finger had brought it.
  // Its outline, wherever the zoomed view shows a piece of it.
  // Away from its corners and the middles of its sides: those are its handles now.
  const rim = await free({ x: 25, y: 60 }, { x: 0, y: 15 }, { x: 25, y: 0 }, { x: 100, y: 15 });
  await touch.start({ id: 1, x: rim.x, y: rim.y });
  await touch.move([{ id: 1, x: rim.x, y: rim.y + 40 }], 8);
  const mid = await rested(page, box);
  await touch.cancel();
  await expect.poll(box).toEqual(mid);
  expect(await rested(page, box)).toEqual(mid);
  expect(mid[1]!).toBeLessThan(-20 / zoomed.scale + 0.5);
});

test('the handles of a drawn shape follow the finger; delete and undo are buttons', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  const touch = await Touch.on(page);
  const box = async () =>
    ((await table.getAttribute('data-drawing-selected')) ?? '').split(',').map(Number);
  // One tap on the shape: it lies on the table, selected.
  await cam.getByTestId('cam-add').getByRole('button', { name: 'Rechteck' }).tap();
  await expect.poll(box).toEqual([0, 0, 100, 60]);
  const view = await restingTable(page);

  // The handle on its upper right corner under the finger: wider and higher, the lower left stays.
  const corner = await tableSpot(page, { x: 100, y: 60 });
  const to = await tableSpot(page, { x: 130, y: 80 });
  expect(await onStage(page, corner)).toBe(true);
  // A finger is not exact: 10 px beside the handle still takes it.
  await touch.start({ id: 1, x: corner.x + 10, y: corner.y - 8 });
  await touch.move([{ id: 1, x: to.x + 10, y: to.y - 8 }], 10);
  await expect(table).toHaveAttribute('data-drawing-label', /^1\d\d × \d\d mm$/);
  const pulled = await rested(page, box);
  expect(pulled.slice(0, 2)).toEqual([0, 0]);
  expect(pulled[2]!).toBeGreaterThan(122);
  expect(pulled[2]!).toBeLessThanOrEqual(130);
  expect(pulled[3]!).toBeGreaterThan(72);
  expect(pulled[3]!).toBeLessThanOrEqual(80);
  // The view rests while a handle is held.
  expect(await tableGeometry(page)).toEqual(view);
  await touch.end();
  await expect(table).not.toHaveAttribute('data-drawing-label');
  await expect.poll(box).toEqual(pulled);
  await expect(
    cam.getByTestId('cam-arrange').getByLabel('Breite (mm)', { exact: true }),
  ).toHaveValue(String(pulled[2]));
  await expect(cam.getByTestId('cam-selected')).toContainText(
    `Rechteck ${pulled[2]} × ${pulled[3]} mm`,
  );

  // A touch the system takes away leaves the shape as the finger had made it; it no longer follows.
  await restingTable(page);
  const side = await tableSpot(page, { x: pulled[2]!, y: pulled[3]! / 2 });
  await touch.start({ id: 1, x: side.x, y: side.y });
  await touch.move([{ id: 1, x: side.x - 40, y: side.y }], 8);
  const mid = await rested(page, box);
  expect(mid[2]!).toBeLessThan(pulled[2]!);
  await touch.cancel();
  await expect(table).not.toHaveAttribute('data-drawing-label');
  expect(await rested(page, box)).toEqual(mid);

  // A second finger lets go of the handle as well: the first one moving on changes nothing.
  await restingTable(page);
  const again = await tableSpot(page, { x: mid[2]!, y: mid[3]! / 2 });
  await touch.start({ id: 1, x: again.x, y: again.y });
  await touch.move([{ id: 1, x: again.x + 30, y: again.y }], 6);
  const held = await rested(page, box);
  expect(held[2]!).toBeGreaterThan(mid[2]!);
  const beside = await tableSpot(page, { x: 20, y: 20 });
  await touch.start({ id: 2, x: beside.x, y: beside.y });
  await expect(table).not.toHaveAttribute('data-drawing-label');
  await touch.move([{ id: 1, x: again.x + 80, y: again.y }], 6);
  await touch.end();
  expect(await rested(page, box)).toEqual(held);

  // Delete and undo are buttons a finger can hit – no key needed, nothing to confirm.
  const remove = cam.getByTestId('cam-arrange').getByRole('button', { name: 'Löschen' });
  const undo = cam.getByRole('button', { name: 'Rückgängig' });
  for (const button of [remove, undo, cam.getByRole('button', { name: 'Wiederholen' })]) {
    const size = (await button.boundingBox())!;
    expect(size.height).toBeGreaterThanOrEqual(47.5);
    expect(size.width).toBeGreaterThanOrEqual(47.5);
  }
  await remove.tap();
  await expect(cam.getByTestId('cam-contours')).toHaveCount(0);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  await undo.tap();
  await expect(cam.getByTestId('cam-contours').getByRole('listitem')).toHaveCount(1);
  await expect.poll(box).toEqual(held);
  // Back another step: the size before the second finger's pull.
  await undo.tap();
  await expect.poll(box).toEqual(mid);
});

test('a registration hole follows the finger and snaps in line with the other one', async ({
  page,
}) => {
  // A part for both sides at the kitchen table: no machine needed to place its holes.
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  const touch = await Touch.on(page);
  const box = async () =>
    ((await table.getAttribute('data-drawing-selected')) ?? '').split(',').map(Number);
  // A 100 × 60 plate; with both sides switched on, two holes Ø 8 appear 18 mm beside it.
  await drawShape(page, 'Rechteck');
  await cam.getByRole('checkbox', { name: 'Von beiden Seiten fräsen' }).check();
  await expect(page.getByTestId('flip-holes')).toHaveText('Passlöcher: Ø 8 mm, 136 mm auseinander');
  // The switch and the two ways of turning are finger-sized.
  for (const target of [
    cam.locator('label', { hasText: 'Von beiden Seiten fräsen' }),
    cam.getByRole('button', { name: /Wie eine Buchseite/ }),
    cam.getByRole('button', { name: /Über die Vorderkante/ }),
  ]) {
    const size = (await target.boundingBox())!;
    expect(size.height).toBeGreaterThanOrEqual(47.5);
  }
  await page.waitForTimeout(400);

  // A finger on the left hole takes it alone – the plate stays, the view rests.
  const view = await tableGeometry(page);
  const hole = await tableSpot(page, { x: -18, y: 30 });
  expect(await onStage(page, hole)).toBe(true);
  await touch.start({ id: 1, x: hole.x, y: hole.y });
  await expect(cam.getByTestId('cam-selected')).toContainText('Passloch 1');
  expect(await box()).toEqual([-22, 26, -14, 34]);
  // Carried 12 mm to the right and a little up: not quite level with the other hole any more.
  await touch.move([{ id: 1, x: hole.x + 12 * view.scale, y: hole.y - 5 * view.scale }], 10);
  const carried = await box();
  // (less the few pixels a touch may wobble before it counts as a move)
  expect(carried[0]!).toBeGreaterThan(-22 + 5);
  expect(carried[1]!).toBeGreaterThan(26 + 1);
  expect(await tableGeometry(page)).toEqual(view);
  await touch.end();
  // Let go, it snaps level with hole 2 – the turned part fits – and stays where it was put.
  await page.waitForTimeout(400);
  const put = await box();
  expect([put[1], put[3]]).toEqual([26, 34]);
  expect(put[0]).toBe(carried[0]);
  await expect(cam.getByTestId('cam-arrange')).toContainText(
    'rastet waagrecht oder senkrecht zum anderen ein',
  );
  // A hole is only moved: nothing to turn, mirror or copy.
  await expect(cam.getByRole('button', { name: 'Duplizieren' })).toBeHidden();
  await expect(page.getByTestId('flip-holes')).toHaveText(
    `Passlöcher: Ø 8 mm, ${Math.round(118 - (put[0]! + 4))} mm auseinander`,
  );

  // "Neu vorschlagen" puts both back beside the plate.
  await cam.getByRole('button', { name: 'Neu vorschlagen' }).click();
  expect(await box()).toEqual([-22, 26, -14, 34]);
  await expect(cam.getByRole('button', { name: 'Neu vorschlagen' })).toHaveCount(0);
});

test('a sideways swipe on the panel changes the view of the step, not on the stage', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  const steps = page.getByRole('group', { name: /^Bereich/ });
  const active = () => steps.locator('button[aria-pressed="true"]');
  await expect(active()).toHaveText(/^Vorbereiten/);
  const panel = (await page.locator('.panel-body').boundingBox())!;
  const x = panel.x + panel.width / 2;
  const y = panel.y + panel.height * 0.6;
  const touch = await Touch.on(page);

  await touch.start({ id: 1, x: x + 80, y });
  await touch.move([{ id: 1, x: x - 120, y: y + 6 }]);
  await touch.end();
  await expect(active()).toHaveText(/^Extras/);
  // And back.
  await page.waitForTimeout(300);
  await touch.start({ id: 1, x: x - 80, y });
  await touch.move([{ id: 1, x: x + 120, y: y - 6 }]);
  await touch.end();
  await expect(active()).toHaveText(/^Vorbereiten/);
  // A short nudge is not a swipe; neither is a drag on the stage.
  await page.waitForTimeout(300);
  await touch.start({ id: 1, x, y });
  await touch.move([{ id: 1, x: x - 30, y }], 12);
  await page.waitForTimeout(150);
  await touch.end();
  const stage = await centre(page.getByTestId('stage-canvas'));
  await touch.start({ id: 1, x: stage.x + 100, y: stage.y });
  await touch.move([{ id: 1, x: stage.x - 100, y: stage.y }]);
  await touch.end();
  await page.waitForTimeout(300);
  await expect(active()).toHaveText(/^Vorbereiten/);
  // The step stays where it is: steps change in their row only.
  await expect(page.getByTestId('step-job')).toHaveAttribute('aria-current', 'step');
});

test('Großbild gives the stage the whole width; a room brings the panel back', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Beispiel laden' }).click();
  const canvas = page.getByTestId('stage-canvas');
  const narrow = (await canvas.boundingBox())!;
  await page.getByTestId('stage-wide').click();
  await expect(page.locator('.panel')).toBeHidden();
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBeGreaterThan(narrow.width + 350);
  // With the width, mode switch and tools share one row where the labels fit (that depends on
  // the font): the picture gains height then, and never loses any.
  expect((await canvas.boundingBox())!.height).toBeGreaterThan(narrow.height - 4);
  await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeInViewport();
  await goTo(page, 'Einrichten');
  await expect(page.locator('.panel')).toBeVisible();
  await expect(page.getByTestId('stage-wide')).toHaveAttribute('aria-pressed', 'false');
});

test('the on-screen keyboard leaves NOT-HALT and the focused field on screen', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
  const field = page.getByLabel('IP-Adresse des Jackpot');
  await field.focus();
  // The emulation has no keyboard: shrink the visible part of the page like iPadOS does.
  const keyboard = (height: number | null) =>
    page.evaluate((h) => {
      const vv = window.visualViewport!;
      if (h === null) {
        delete (vv as unknown as Record<string, unknown>).height;
      } else {
        Object.defineProperty(vv, 'height', { get: () => h, configurable: true });
      }
      vv.dispatchEvent(new Event('resize'));
    }, height);
  await keyboard(400);
  await expect(page.locator('html')).toHaveClass(/keyboard/);
  const app = (await page.locator('.app').boundingBox())!;
  expect(app.height).toBe(400);
  const estop = (await page.getByRole('button', { name: 'NOT-HALT' }).boundingBox())!;
  expect(estop.y).toBeGreaterThanOrEqual(0);
  expect(estop.y + estop.height).toBeLessThanOrEqual(400);
  await expect
    .poll(async () => {
      const box = (await field.boundingBox())!;
      return box.y >= estop.y + estop.height && box.y + box.height <= 400;
    })
    .toBe(true);
  // Typed text is at least 16 px, so Safari does not zoom into the field.
  const sizes = await page.$$eval('input[type="text"], select, textarea', (els) =>
    els.map((el) => parseFloat(getComputedStyle(el).fontSize)),
  );
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
  await keyboard(null);
  await expect(page.locator('html')).not.toHaveClass(/keyboard/);
  expect((await page.locator('.app').boundingBox())!.height).toBe(820);
});

test('without https a silent video keeps the screen on, and the app says so', async ({ page }) => {
  // The Pi serves plain http: there the Screen Wake Lock API does not exist.
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as Record<string, unknown>).wakeLock;
  });
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  const line = page.getByTestId('screen-awake');
  // Any touch after connecting starts the video.
  await page.getByRole('button', { name: 'Verbindung', exact: true }).click();
  await expect(line).toHaveAttribute('data-state', 'video');
  await expect(line).toContainText('stilles Video');
  await page.getByRole('button', { name: 'Trennen' }).click();
  await expect(line).toHaveCount(0);
});

test("a number field under a finger gets the app's own number pad; a keyboard still types into it", async ({
  page,
}) => {
  await openApp(page);
  await goTo(page, 'Service & Diagnose', 'Kalibrieren');
  const field = page.getByTestId('accuracy-check').getByLabel('Tiefe (mm)');
  const pad = page.locator('[data-slot="numpad"]');
  const key = (name: string) => pad.locator(`[data-key="${name}"]`);
  await expect(pad).toHaveCount(0);

  await field.tap();
  await expect(pad).toBeVisible();
  // It says which field it fills, in which unit, and keeps the system keyboard down.
  await expect(pad.locator('[data-slot="numpad-label"]')).toHaveText('Tiefe (mm)');
  await expect(pad).toContainText('mm');
  await expect(field).toHaveAttribute('inputmode', 'none');
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
  // Keys of the app's touch size; PAUSE and NOT-HALT stay free.
  for (const k of await pad.getByRole('button').all()) {
    expect((await k.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  const box = (await pad.boundingBox())!;
  for (const button of [
    page.getByTestId('pause'),
    page.getByRole('button', { name: 'NOT-HALT' }),
  ]) {
    const b = (await button.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(box.y);
  }

  await key('clear').tap();
  await expect(field).toHaveValue('');
  for (const k of ['1', '2', 'separator', '5']) await key(k).tap();
  await expect(field).toHaveValue('12,5');
  await expect(pad.locator('[data-slot="numpad-value"]')).toHaveText('12,5');
  // One decimal sign only; ± at the front; delete from the end.
  await key('separator').tap();
  await key('sign').tap();
  await expect(field).toHaveValue('-12,5');
  await key('back').tap();
  await expect(field).toHaveValue('-12,');
  // The field kept the focus: a hardware keyboard types into the same field.
  await expect(field).toBeFocused();
  await page.keyboard.type('75');
  await expect(field).toHaveValue('-12,75');
  await expect(pad.locator('[data-slot="numpad-value"]')).toHaveText('-12,75');
  await key('sign').tap();
  await pad.locator('[data-slot="numpad-done"]').tap();
  await expect(pad).toHaveCount(0);
  await expect(field).toHaveAttribute('inputmode', 'decimal');
  await expect(field).toHaveValue('12,75');

  // With a mouse nothing changes: the field is typed into as ever.
  const spot = (await field.boundingBox())!;
  await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2);
  await expect(field).toBeFocused();
  await expect(pad).toHaveCount(0);
});

test.describe('Safari on the iPad, not yet on the home screen', () => {
  test('shows the way to the home screen once, until dismissed', async ({ page }) => {
    await page.addInitScript(() => {
      // Safari on an iPad: has `standalone`, reports five touch points.
      Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    });
    await openApp(page);
    const hint = page.getByTestId('install-hint');
    await expect(hint).toContainText('Zum Home-Bildschirm');
    await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeInViewport();
    await hint.getByRole('button', { name: 'Ausblenden' }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await expect(hint).toHaveCount(0);
  });

  test('says nothing when started from the home screen', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    });
    await openApp(page);
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
    await expect(page.locator('html')).toHaveClass(/standalone/);
  });
});

test.describe('upright', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('the picture on top, the context panel as a sheet below it, the action bar at the bottom edge', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Beispiel laden' }).click();
    const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
    const [stage, panel, bar] = [
      await box('.stage-wrap'),
      await box('.panel'),
      await box('.actionbar'),
    ];
    expect(stage.y + stage.height).toBeLessThanOrEqual(panel.y);
    expect(panel.y + panel.height).toBeLessThanOrEqual(bar.y);
    // The action bar: across the width, at the bottom, the jog button at the left. The Job with a
    // program loaded has no primary action to put at the right.
    expect(bar.y + bar.height).toBeGreaterThan(1180 - 24);
    expect(bar.y + bar.height).toBeLessThanOrEqual(1180);
    expect(bar.width).toBeGreaterThan(700);
    const jog = await box('[data-testid="jog-toggle"]');
    expect(jog.x).toBeLessThan(bar.x + 24);
    await expect(page.getByTestId('primary-action')).toHaveCount(0);
    // The steps: five targets of at least 48 px, each a number, the current one with its name.
    const steps = await page
      .locator('[data-slot="stepper-step"]')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(steps).toHaveLength(6);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(48);
    await expect(page.getByTestId('step-job')).toContainText('Job');
    // PAUSE and NOT-HALT are on screen and nothing lies over them.
    for (const button of [
      page.getByRole('button', { name: 'NOT-HALT' }),
      page.getByTestId('pause'),
    ]) {
      await expect(button).toBeInViewport({ ratio: 1 });
      const hit = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      });
      expect(hit).toBe(true);
    }
    // The picture is worth looking at.
    const canvas = await box('[data-testid="stage-canvas"]');
    expect(canvas.height).toBeGreaterThan(300);
    // The sheet folds to its handle – by a button, not only by a gesture – and the picture grows.
    await page.locator('[data-slot="sheet-handle"]').tap();
    await expect(page.locator('.panel-body')).toBeHidden();
    await expect
      .poll(async () => (await box('[data-testid="stage-canvas"]')).height)
      .toBeGreaterThan(canvas.height + 200);
    // Going somewhere brings it back; the side areas still work from here.
    await goTo(page, 'Einstellungen');
    await expect(page.locator('.panel-body')).toBeVisible();
    await expect(page.getByRole('group', { name: /^Bereich/ })).toBeVisible();
  });

  test('a narrow window (Split View) keeps everything on screen', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 820 });
    await openApp(page);
    await page.getByRole('button', { name: 'Beispiel laden' }).click();
    await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('pause')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('machine-state')).toBeInViewport({ ratio: 1 });
    for (const id of ['job', 'cam', 'setup', 'run', 'service', 'settings']) {
      await expect(page.getByTestId(`step-${id}`)).toBeInViewport({ ratio: 1 });
    }
    await expect(page.getByTestId('menu-button')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('jog-toggle')).toBeInViewport({ ratio: 1 });
    // Nothing sticks out sideways.
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('.app *')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => el.className.toString().slice(0, 40)),
    );
    expect(overflow).toEqual([]);
  });

  test('the drawing workspace: the table only, the sheet down to the bottom edge, no action bar', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByTestId('step-cam').click();
    await expect(page.getByTestId('cam-draw')).toBeVisible();
    await expect(page.locator('.actionbar')).toHaveCount(0);
    for (const gone of ['jog-toggle', 'tool-strip', 'live-inset']) {
      await expect(page.getByTestId(gone), gone).toHaveCount(0);
    }
    await expect(page.getByRole('group', { name: 'Ansicht der Bühne' })).toHaveCount(0);
    const [stage, panel] = [
      (await page.locator('.stage-wrap').boundingBox())!,
      (await page.locator('.panel').boundingBox())!,
    ];
    // The picture above, the sheet below it – and the sheet reaches the bottom edge: no band is left
    // where the action bar was.
    expect(stage.y + stage.height).toBeLessThanOrEqual(panel.y);
    const padding = await page.evaluate(
      () => parseFloat(getComputedStyle(document.querySelector('.app')!).paddingBottom) || 0,
    );
    expect(1180 - (panel.y + panel.height)).toBeLessThanOrEqual(padding + 1);
    await expect(page.getByTestId('pause')).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeInViewport({ ratio: 1 });
    // The first shape a finger can draw is there: the table is the picture.
    await page
      .getByTestId('cam-add')
      .getByRole('button', { name: 'Rechteck', exact: true })
      .click();
    await expect(page.getByTestId('table-view')).toHaveAttribute('data-drawing-frame', /.+/);
  });

  test('a phone only watches: state, progress, the picture, PAUSE, abort – and NOT-HALT', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('monitor')).toBeVisible();
    await expect(page.getByTestId('machine-state')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('pause')).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'NOT-HALT' })).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('stage-canvas')).toBeVisible();
    // Nothing to set up or start from here.
    await expect(page.locator('.navrow')).toHaveCount(0);
    await expect(page.locator('.actionbar')).toHaveCount(0);
    await expect(page.locator('.panel')).toHaveCount(0);
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('.app *')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map((el) => el.className.toString().slice(0, 40)),
    );
    expect(overflow).toEqual([]);
  });
});

test('a series: a finger on a blank leaves it out or takes it in, a finger that moves pans the view, the turn is a button', async ({
  page,
}) => {
  test.setTimeout(60_000);
  // The demo with the blanks of the series scene on the table.
  await openDemo(page);
  await goTo(page, 'Einstellungen', 'Verbindung');
  await page
    .getByTestId('simulator-card')
    .getByRole('button', { name: 'Rohlinge für eine Serie' })
    .click();
  await goTo(page, 'Job');
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  await cam.getByRole('button', { name: 'Zeichnung leeren' }).click();
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '30', 'Höhe (mm)': '12' });
  await cam.getByLabel('Bearbeitung Kontur 1').selectOption('on');
  await page.getByRole('button', { name: 'Serie: auf Rohlinge verteilen' }).click();
  await page.getByRole('button', { name: 'Auf dem Tisch-Bild suchen' }).click();
  await expect(page.getByTestId('series-found')).toHaveText('6 Rohlinge gefunden');

  const table = page.getByTestId('table-view');
  const blank = async (id: number) => {
    const entry = ((await table.getAttribute('data-blanks')) ?? '')
      .split(';')
      .map((e) => e.split(':'))
      .find((e) => Number(e[0]) === id)!;
    const [x, y] = entry[2]!.split(',').map(Number);
    return { state: entry[1]!, x: x!, y: y! };
  };
  const touch = await Touch.on(page);
  const row = page.getByTestId('series-blank-1');
  await page.waitForTimeout(400);

  // A tap on the second tag leaves it out: dashed on the picture, said in the list.
  const spot = await tableSpot(page, await blank(1));
  expect(await onStage(page, spot)).toBe(true);
  await touch.tap(spot.x, spot.y);
  await expect(row).toHaveAttribute('data-state', 'excluded');
  expect((await blank(1)).state).toBe('out');
  await expect(row.getByRole('checkbox')).not.toBeChecked();
  // The picture did not move under the finger: the same place is the same blank.
  expect(await tableSpot(page, await blank(1))).toEqual(spot);
  // Another tap (not a double tap) takes it in again.
  await page.waitForTimeout(500);
  await touch.tap(spot.x, spot.y);
  await expect(row).toHaveAttribute('data-state', 'cut');
  expect((await blank(1)).state).toBe('cut');

  // A finger that comes down on a blank and moves pans the view; the blank stays as it is.
  const view = await tableGeometry(page);
  await page.waitForTimeout(500);
  await touch.start({ id: 1, x: spot.x, y: spot.y });
  await touch.move([{ id: 1, x: spot.x + 70, y: spot.y - 30 }], 8);
  await touch.end();
  await page.waitForTimeout(600);
  const panned = await tableGeometry(page);
  expect(panned.originX - view.originX).toBeGreaterThan(40);
  expect(panned.scale).toBeCloseTo(view.scale, 6);
  await expect(row).toHaveAttribute('data-state', 'cut');

  // Turning the motif is a button in the blank's row, large enough for a finger.
  const turn = row.getByRole('button', { name: 'Motiv auf Rohling 2 drehen' });
  const at = await centre(turn);
  expect(at.box.height).toBeGreaterThanOrEqual(48);
  expect(at.box.width).toBeGreaterThanOrEqual(48);
  const before = Number(await row.getAttribute('data-angle'));
  await touch.tap(at.x, at.y);
  await expect
    .poll(async () => Math.abs(Number(await row.getAttribute('data-angle')) - before))
    .toBeCloseTo(180, 0);
  // And leaving a blank out works from the list as well as on the picture.
  const tick = await centre(row.getByRole('checkbox'));
  await touch.tap(tick.x, tick.y);
  await expect(row).toHaveAttribute('data-state', 'excluded');
});

test('the quick search by touch: big rows, above the keyboard, NOT-HALT still one tap', async ({
  page,
}) => {
  await installFakeFluidNC(page);
  await openApp(page);
  await connect(page);
  const button = page.getByTestId('find-button');
  const estop = page.getByRole('button', { name: 'NOT-HALT' });
  // Reachable in the row of the tabs, a full target.
  const target = (await button.boundingBox())!;
  expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(48);
  // In the row of the tabs, below NOT-HALT: never beside it in the same row, never over it.
  const bar = (await estop.boundingBox())!;
  expect(target.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  await button.tap();
  const sheet = page.getByTestId('find');
  const field = page.getByTestId('find-input');
  await expect(field).toBeFocused();
  // Typed text is at least 16 px, so Safari does not zoom into the field.
  expect(
    await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  const rows = page.getByTestId('find-list').getByRole('option');
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  // No keyboard, no key caps.
  await expect(sheet.locator('.kbd-hint').first()).toBeHidden();
  await expect(sheet.getByRole('button', { name: 'Schließen' })).toBeVisible();

  // The on-screen keyboard comes up (the emulation has none: shrink the visible part).
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { get: () => 400, configurable: true });
    vv.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('html')).toHaveClass(/keyboard/);
  await field.fill('zwinge');
  // The sheet and its hits stay in what the keyboard leaves, under the top bar.
  await expect
    .poll(async () => {
      const box = (await sheet.boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(400);
  const top = (await rows.first().boundingBox())!;
  const stop = (await estop.boundingBox())!;
  expect(top.y).toBeGreaterThanOrEqual(stop.y + stop.height);
  expect(top.y + top.height).toBeLessThanOrEqual(400);
  await expect(rows.first()).toContainText('Spannmittel');

  // NOT-HALT is not covered: the touch itself stops, with the search open.
  const touch = await Touch.on(page);
  const at = await centre(estop);
  await touch.start({ id: 1, x: at.x, y: at.y });
  await expect.poll(() => count(page, '\u0018')).toBe(1);
  await touch.end();
  await expect(sheet).toBeVisible();

  await page.evaluate(() => {
    const vv = window.visualViewport!;
    delete (vv as unknown as Record<string, unknown>).height;
    vv.dispatchEvent(new Event('resize'));
  });
  // A tap on the row leads there; nothing else was sent on the way.
  const before = await sent(page);
  await rows.first().tap();
  await expect(sheet).toBeHidden();
  await expect(stageTool(page, 'Spannmittel')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-find="tool-clamp"]')).toHaveClass(/found/);
  expect(await sent(page)).toEqual(before);

  // A tap beside the sheet closes it.
  await button.tap();
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, 800);
  await expect(sheet).toBeHidden();
});

test.describe('upright, the quick search', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('the button stays in the row of the steps, below NOT-HALT; the sheet has the width', async ({
    page,
  }) => {
    await openApp(page);
    const button = page.getByTestId('find-button');
    const estop = (await page.getByRole('button', { name: 'NOT-HALT' }).boundingBox())!;
    const target = (await button.boundingBox())!;
    expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(48);
    expect(target.y).toBeGreaterThanOrEqual(estop.y + estop.height);
    expect(target.x + target.width).toBeLessThanOrEqual(820);
    expect(estop.x + estop.width).toBeLessThanOrEqual(820);
    await button.tap();
    const sheet = (await page.getByTestId('find').boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(0);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(820);
    expect(sheet.y).toBeGreaterThanOrEqual(estop.y + estop.height);
    await page.getByTestId('find-input').fill('wenden');
    await page.getByTestId('find-list').getByRole('option').first().tap();
    await expect(page.locator('[data-find="cam-sides"]')).toHaveClass(/found/);
    await expect(page.locator('[data-find="cam-sides"]')).toBeInViewport();
  });
});

test('tabs by hand with a finger: a tap sets one, a drag moves it along the line, a tap takes it away', async ({
  page,
}) => {
  // No machine needed: the tabs belong to the drawing.
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  const touch = await Touch.on(page);
  await drawShape(page, 'Rechteck');
  const panel = cam.getByTestId('cam-tabs');
  // The panel opens on demand: one more tap
  await cam.getByTestId('cam-tabs-open').tap();
  await panel.getByRole('button', { name: 'Von Hand' }).tap();
  await panel.getByRole('button', { name: 'Stege setzen' }).tap();
  await expect(table).toHaveAttribute('data-drawing-placing', '1');
  await restingTable(page);
  type Site = { x: number; y: number; index: number };
  const sites = async (): Promise<Site[]> =>
    JSON.parse((await table.getAttribute('data-drawing-tabs')) ?? '[]')[0]?.sites ?? [];
  await expect.poll(async () => (await sites()).length).toBe(4);

  // A tap on the lower side: a tab at the nearest place (the first tap is no double tap)
  const line = await tableSpot(page, { x: 15, y: 0 });
  expect(await onStage(page, line)).toBe(true);
  await touch.tap(line.x, line.y);
  await expect.poll(async () => (await sites()).length).toBe(5);
  const added = (await sites()).find((s) => s.index === 4)!;
  expect(added.y).toBeCloseTo(0, 6);
  expect(Math.abs(added.x - 15)).toBeLessThan(2);
  await page.waitForTimeout(400);

  // A finger on it takes it – the view stays – and carries it along the line, off the line a little
  const from = await tableSpot(page, added);
  const to = await tableSpot(page, { x: 28, y: 0 });
  expect(await onStage(page, to)).toBe(true);
  const view = await tableGeometry(page);
  await touch.start({ id: 1, x: from.x, y: from.y });
  await touch.move([{ id: 1, x: to.x, y: to.y - 12 }], 10);
  await touch.end();
  const moved = await rested(page, async () => (await sites()).find((s) => s.index === 4)!);
  expect(moved.y).toBeCloseTo(0, 6);
  // The finger went 13 mm along the line; what it moved inside the tap slop (10 px) does not count –
  // the gesture layer starts a drag where the finger left the slop – so it lands a little short
  expect(moved.x).toBeGreaterThan(added.x + 5);
  expect(moved.x).toBeLessThanOrEqual(29);
  expect(await tableGeometry(page)).toEqual(view);
  await page.waitForTimeout(400);

  // A second finger lets go of it where it is; nothing is changed or taken away
  const again = await tableSpot(page, moved);
  await touch.start({ id: 1, x: again.x, y: again.y });
  await touch.start({ id: 2, x: again.x + 120, y: again.y - 60 });
  await touch.end(1, 2);
  expect(await sites()).toHaveLength(5);
  await page.waitForTimeout(400);

  // A tap on the tab takes it away
  await touch.tap(again.x, again.y);
  await expect.poll(async () => (await sites()).length).toBe(4);
});

test('several parts by finger: the Mehrfachauswahl switch, a tap takes a part in, a tap beside keeps the set, aligning is a button', async ({
  page,
}) => {
  // No machine needed: arranging a drawing works at the kitchen table too.
  await openApp(page);
  await page.getByRole('button', { name: 'Zeichnen / DXF' }).click();
  const cam = page.getByTestId('cam-card');
  const table = page.getByTestId('table-view');
  const touch = await Touch.on(page);
  const box = async () =>
    ((await table.getAttribute('data-drawing-selected')) ?? '').split(',').map(Number);
  // Two plates: 0 0 40 20 and 100 40 130 70
  await drawShape(page, 'Rechteck', { 'Breite (mm)': '40', 'Höhe (mm)': '20' });
  await drawShape(page, 'Rechteck', {
    'Breite (mm)': '30',
    'Höhe (mm)': '30',
    'X links (mm)': '100',
    'Y unten (mm)': '40',
  });
  await restingTable(page);
  await page.waitForTimeout(400);
  const spot = async (x: number, y: number) => {
    const at = await tableSpot(page, { x, y });
    expect(await onStage(page, at)).toBe(true);
    return at;
  };

  // The switch is a full target; a tap on it turns the mode on
  const word = cam.getByText('Mehrfachauswahl', { exact: true });
  const row = (await word.locator('xpath=ancestor::label').boundingBox())!;
  expect(row.height).toBeGreaterThanOrEqual(47.5);
  await word.tap();
  await expect(cam.getByRole('checkbox', { name: 'Mehrfachauswahl' })).toBeChecked();

  // The second plate is selected; a tap inside the first takes it in, a tap beside both keeps both
  expect(await box()).toEqual([100, 40, 130, 70]);
  const first = await spot(20, 10);
  await touch.tap(first.x, first.y);
  await expect.poll(box).toEqual([0, 0, 130, 70]);
  await expect(cam.getByTestId('cam-selected')).toContainText('2 Teile');
  await page.waitForTimeout(400);
  const beside = await spot(20, 50);
  await touch.tap(beside.x, beside.y);
  await page.waitForTimeout(300);
  expect(await box()).toEqual([0, 0, 130, 70]);

  // Aligning is a button, large enough for a finger: the two plates on one left edge – one step
  const left = cam.getByRole('button', { name: 'Linksbündig ausrichten' });
  expect((await left.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await left.tap();
  await expect.poll(box).toEqual([0, 0, 40, 70]);
  await cam.getByRole('button', { name: 'Rückgängig' }).tap();
  await expect.poll(box).toEqual([0, 0, 130, 70]);

  // Off again: a tap beside everything lets go of the selection, as ever
  await word.tap();
  await expect(cam.getByRole('checkbox', { name: 'Mehrfachauswahl' })).not.toBeChecked();
  await page.waitForTimeout(400);
  await touch.tap(beside.x, beside.y);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
});

test('"Rahmen aufziehen" by finger: one finger draws the frame and takes what it touches on release; a second finger or a lost touch takes nothing', async ({
  page,
}) => {
  // No machine needed: arranging a drawing works at the kitchen table too.
  await openApp(page);
  const cam = await drawThreePlates(page);
  const arrange = cam.getByTestId('cam-arrange');
  const table = page.getByTestId('table-view');
  const touch = await Touch.on(page);
  // Three plates: A 0 0 40 20 · B 100 40 130 70 · C 60 100 110 110
  const box = async () =>
    ((await table.getAttribute('data-drawing-selected')) ?? '').split(',').map(Number);
  const frame = async () => (await table.getAttribute('data-drawing-marquee')) ?? '';
  const spot = async (x: number, y: number) => {
    const at = await tableSpot(page, { x, y });
    expect(await onStage(page, at), `${x},${y} is on the stage`).toBe(true);
    return at;
  };
  const view = await restingTable(page);
  await arrange.getByRole('button', { name: 'Auswahl aufheben' }).tap();
  await expect(table).not.toHaveAttribute('data-drawing-selected');

  // The switch is a full target; a tap on it turns the mode on
  const word = cam.getByText('Rahmen aufziehen', { exact: true });
  expect(
    (await word.locator('xpath=ancestor::label').boundingBox())!.height,
  ).toBeGreaterThanOrEqual(47.5);
  await word.tap();
  await expect(cam.getByRole('checkbox', { name: 'Rahmen aufziehen' })).toBeChecked();

  // One finger from beside plate A over it and the corner of B: the frame is there while the finger is down,
  // nothing is selected until it lifts – the view does not move meanwhile
  const from = await spot(-8, -8);
  const to = await spot(104, 44);
  await touch.start({ id: 1, x: from.x, y: from.y });
  await touch.move([{ id: 1, x: to.x, y: to.y }], 10);
  await expect.poll(frame).not.toBe('');
  const drawn = (await frame()).split(',').map(Number);
  expect(drawn[0]!).toBeCloseTo(-8, 0);
  // (the corner is under the finger itself, not a slop behind it)
  expect(Math.abs(drawn[2]! - 104)).toBeLessThan(1.5);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  expect(await tableGeometry(page)).toEqual(view);
  await touch.end();
  await expect.poll(box).toEqual([0, 0, 130, 70]);
  await expect(table).not.toHaveAttribute('data-drawing-marquee');
  await expect(cam.getByTestId('cam-selected')).toContainText('2 Teile');
  expect(await tableGeometry(page)).toEqual(view);

  // A second finger that lands after the frame was started lets go of it: nothing is taken, nothing changes
  await page.waitForTimeout(400);
  const c1 = await spot(55, 95);
  const c2 = await spot(115, 115);
  await touch.start({ id: 1, x: c1.x, y: c1.y });
  await touch.move([{ id: 1, x: c2.x, y: c2.y }], 8);
  await expect.poll(frame).not.toBe('');
  await touch.start({ id: 2, x: c1.x + 300, y: c1.y + 40 });
  await expect(table).not.toHaveAttribute('data-drawing-marquee');
  await touch.end(1, 2);
  await page.waitForTimeout(300);
  expect(await box()).toEqual([0, 0, 130, 70]);
  expect(await tableGeometry(page)).toEqual(view);

  // A touch the system takes away is no release: nothing is taken either
  await page.waitForTimeout(400);
  await touch.start({ id: 1, x: c1.x, y: c1.y });
  await touch.move([{ id: 1, x: c2.x, y: c2.y }], 8);
  await expect.poll(frame).not.toBe('');
  await touch.cancel();
  await expect(table).not.toHaveAttribute('data-drawing-marquee');
  await page.waitForTimeout(300);
  expect(await box()).toEqual([0, 0, 130, 70]);

  // Two fingers that come down together are for the view, as ever: they zoom it, and no frame is drawn
  await page.waitForTimeout(400);
  const left = await spot(30, 60);
  const right = await spot(100, 60);
  await touch.start({ id: 1, x: left.x, y: left.y });
  await touch.start({ id: 2, x: right.x, y: right.y });
  await touch.move([
    { id: 1, x: left.x - 60, y: left.y },
    { id: 2, x: right.x + 60, y: right.y },
  ]);
  expect(await frame()).toBe('');
  await touch.end();
  await page.waitForTimeout(400);
  expect((await tableGeometry(page)).scale).toBeGreaterThan(view.scale * 1.2);
  expect(await box()).toEqual([0, 0, 130, 70]);

  // A tap is a tap: a tap beside everything lets go of the selection, and the next takes the part under it (alone –
  // the mode takes no part of Mehrfachauswahl)
  const now = await restingTable(page);
  expect(now.scale).toBeGreaterThan(0);
  const beside = await spot(110, 20);
  await touch.tap(beside.x, beside.y);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  await page.waitForTimeout(400);
  const onA = await spot(20, 10);
  await touch.tap(onA.x, onA.y);
  await expect.poll(box).toEqual([0, 0, 40, 20]);
});

test('the eye of a part is a full target, and a hidden part is out of reach of a finger on the table', async ({
  page,
}) => {
  await openApp(page);
  const cam = await drawThreePlates(page);
  const table = page.getByTestId('table-view');
  const touch = await Touch.on(page);
  await restingTable(page);
  await cam.getByRole('button', { name: 'Teil 2 ausblenden' }).tap();
  await expect(table).toHaveAttribute('data-drawing-hidden', '100.0,40.0,130.0,70.0');
  await cam.getByTestId('cam-arrange').getByRole('button', { name: 'Auswahl aufheben' }).tap();
  await page.waitForTimeout(400);
  // a finger on the hidden plate's line and a tap inside it pick nothing
  const line = await tableSpot(page, { x: 100, y: 55 });
  const inside = await tableSpot(page, { x: 115, y: 55 });
  expect(await onStage(page, line)).toBe(true);
  expect(await onStage(page, inside)).toBe(true);
  await touch.start({ id: 1, x: line.x, y: line.y });
  await touch.end();
  await page.waitForTimeout(400);
  await touch.tap(inside.x, inside.y);
  await page.waitForTimeout(300);
  await expect(table).not.toHaveAttribute('data-drawing-selected');
  // shown again: the same tap picks it
  await cam.getByRole('button', { name: 'Teil 2 einblenden' }).tap();
  await expect(table).not.toHaveAttribute('data-drawing-hidden');
  await page.waitForTimeout(400);
  await touch.tap(inside.x, inside.y);
  await expect
    .poll(async () => table.getAttribute('data-drawing-selected'))
    .toBe('100.0,40.0,130.0,70.0');
});
