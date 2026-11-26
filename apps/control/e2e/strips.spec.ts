import { expect, test, type Page } from '@playwright/test';
import { goTo, openDemo } from './helpers';

// Scanning in strips on the simulated machine of the demo: the camera runs along a line without stopping, its
// pictures come late by a time the app is not told, and the map must show the table where a scan with a stop
// for every picture shows it – the dots of the precision plate are the rulers.

test.beforeEach(({}, info) => {
  test.skip(info.project.name === 'ipad', 'the touch project adds nothing here');
});

interface Area {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The plate the simulator draws: 19 × 19 dots, 10 mm apart, lying 0.6° askew at (120, 120). */
const PLATE = { x: 120, y: 120, angle: 0.6, n: 19, pitch: 10 };

/** A box of camera-centre positions with the plate's lower rows in it: two strips along X. */
const AREA: Area = { minX: 100, minY: 100, maxX: 340, maxY: 200 };

interface Stats {
  mode: 'strips' | 'stops';
  strips: number;
  offered: number;
  placed: number;
  refilled: number;
  lag: number;
  seconds: number;
  gaveUp: boolean;
}

type Handle = {
  lowriderMap: {
    stats(): Stats | null;
    picture(): {
      gray: Uint8Array;
      valid: Uint8Array;
      width: number;
      height: number;
      left: number;
      top: number;
      pxPerMm: number;
    } | null;
    store(): {
      clear(): void;
      scanArea(area: Area, options?: { precise?: boolean }): Promise<boolean>;
      cancelScan(): void;
      setMode(mode: 'strips' | 'stops'): void;
      mode: 'strips' | 'stops';
      scan: unknown;
    };
  };
  lowriderCameraLag: { ms: number; jitterMs: number; blurPx: number };
  lowriderSimulator: { state: string };
};

const scan = (page: Page, area: Area, precise: boolean) =>
  page.evaluate(
    ([a, p]) =>
      (window as unknown as Handle).lowriderMap
        .store()
        .scanArea(a as Area, { precise: p as boolean }),
    [area, precise] as const,
  );

/** Where the map shows each dot of the plate inside `area`: the centre of the dark pixels around it, machine mm. */
async function dots(page: Page, area: Area) {
  return page.evaluate(
    ([plate, box]) => {
      const pic = (window as unknown as Handle).lowriderMap.picture();
      if (!pic) return [];
      const a = (plate.angle * Math.PI) / 180;
      const out: { id: string; x: number; y: number }[] = [];
      for (let i = 0; i < plate.n; i++) {
        for (let j = 0; j < plate.n; j++) {
          const px = i * plate.pitch;
          const py = j * plate.pitch;
          const x = plate.x + Math.cos(a) * px - Math.sin(a) * py;
          const y = plate.y + Math.sin(a) * px + Math.cos(a) * py;
          // well inside the scanned box: the rim of a picture is not trusted
          if (x < box.minX + 8 || x > box.maxX - 8 || y < box.minY + 8 || y > box.maxY - 8)
            continue;
          let sw = 0;
          let sx = 0;
          let sy = 0;
          const r = 4;
          for (
            let v = Math.floor((pic.top - y - r) * pic.pxPerMm);
            v <= Math.ceil((pic.top - y + r) * pic.pxPerMm);
            v++
          ) {
            for (
              let u = Math.floor((x - r - pic.left) * pic.pxPerMm);
              u <= Math.ceil((x + r - pic.left) * pic.pxPerMm);
              u++
            ) {
              if (u < 0 || v < 0 || u >= pic.width || v >= pic.height) continue;
              const k = v * pic.width + u;
              if (!pic.valid[k]) continue;
              const w = Math.max(0, 110 - pic.gray[k]!);
              sw += w;
              sx += w * (pic.left + (u + 0.5) / pic.pxPerMm);
              sy += w * (pic.top - (v + 0.5) / pic.pxPerMm);
            }
          }
          // a dot of Ø 3 mm: a few thousand units of darkness – less is a dot that is not there
          if (sw > 4000) out.push({ id: `${i},${j}`, x: sx / sw, y: sy / sw });
        }
      }
      return out;
    },
    [PLATE, area] as const,
  );
}

test('a strip scan with a camera that is late puts the plate where a scan with stops does', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openDemo(page);
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    // by stops is what a scan does unless this device chose otherwise
    (window as unknown as Handle).lowriderMap.store().setMode('strips');
  });

  // The reference: a stop for every picture
  expect(await scan(page, AREA, true)).toBe(true);
  const reference = await dots(page, AREA);
  const stops = await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats());
  expect(stops).toMatchObject({ mode: 'stops' });
  expect(reference.length).toBeGreaterThan(30);

  // The same area in strips, with a camera that shows the table 0.3 s late, give or take 40 ms – unseen by the app
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    (window as unknown as Handle).lowriderCameraLag.ms = 300;
    (window as unknown as Handle).lowriderCameraLag.jitterMs = 40;
  });
  expect(await scan(page, AREA, false)).toBe(true);
  const strips = await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!);
  const found = await dots(page, AREA);

  expect(strips.mode).toBe('strips');
  expect(strips.gaveUp).toBe(false);
  // two strips along X, run there and back
  expect(strips.strips).toBe(2);
  // most of what was taken on the run could be put where it was taken; what was left out was taken again, with a stop
  expect(strips.offered).toBeGreaterThan(10);
  expect(strips.placed).toBeGreaterThanOrEqual(strips.offered * 0.75);
  expect(strips.refilled).toBeLessThanOrEqual(3);
  // the app has found out for itself that the pictures are late
  expect(strips.lag).toBeGreaterThan(0.1);
  expect(strips.lag).toBeLessThan(0.5);

  // every dot the reference sees, the strip scan sees where the reference has it – both strips, so both directions
  const byId = new Map(reference.map((d) => [d.id, d]));
  const both = found.filter((d) => byId.has(d.id));
  expect(both.length).toBeGreaterThanOrEqual(reference.length * 0.9);
  const errors = both.map((d) => Math.hypot(d.x - byId.get(d.id)!.x, d.y - byId.get(d.id)!.y));
  expect(Math.max(...errors)).toBeLessThan(0.5);
  expect(errors.reduce((a, b) => a + b, 0) / errors.length).toBeLessThan(0.2);
  // rows from the strip that ran one way and from the one that ran the other
  const lower = both.filter((d) => d.y < 150);
  const upper = both.filter((d) => d.y >= 150);
  expect(lower.length).toBeGreaterThan(5);
  expect(upper.length).toBeGreaterThan(5);
});

test('ending a strip scan: "Scan abbrechen" stops the run cleanly, PAUSE ends it with its reason', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await page.evaluate(() => {
    (window as unknown as Handle).lowriderMap.store().clear();
    (window as unknown as Handle).lowriderMap.store().setMode('strips');
  });

  // Cancelled: the jog is ended by a jog cancel, the machine stands, nothing is left half done
  const cancelled = page.evaluate(() =>
    (window as unknown as Handle).lowriderMap
      .store()
      .scanArea({ minX: 100, minY: 100, maxX: 340, maxY: 200 }),
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Handle).lowriderSimulator.state), {
      timeout: 60_000,
    })
    .toBe('Jog');
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().cancelScan());
  expect(await cancelled).toBe(false);
  await expect(page.getByTestId('machine-state')).toContainText('Bereit', { timeout: 15_000 });
  expect(
    await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().scan),
  ).toBeNull();

  // Held by the operator's PAUSE: the scan says the controller was held, and does not send anything more
  const held = page.evaluate(() =>
    (window as unknown as Handle).lowriderMap
      .store()
      .scanArea({ minX: 100, minY: 100, maxX: 340, maxY: 200 }),
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Handle).lowriderSimulator.state), {
      timeout: 60_000,
    })
    .toBe('Jog');
  await page.getByTestId('pause').click();
  expect(await held).toBe(false);
  await goTo(page, 'Service & Diagnose', 'Diagnose');
  await expect(page.getByTestId('log')).toContainText('Die Steuerung wurde angehalten');
});

test('the panel offers both ways with their times side by side, and keeps the choice', async ({
  page,
}) => {
  await openDemo(page);
  await goTo(page, 'Einrichten');
  await page
    .getByRole('group', { name: 'Bereich' })
    .getByRole('button', { name: 'Kamera' })
    .click();
  const section = page
    .locator('.section[data-fold]')
    .filter({ has: page.getByRole('heading', { name: 'Fläche scannen', exact: true }) });
  if ((await section.getAttribute('data-open')) === null) {
    await section.locator('[data-fold-trigger]').first().click();
  }
  const panel = page.getByTestId('photo-map-panel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('X von (mm)').fill('0');
  await panel.getByLabel('X bis (mm)').fill('600');
  await panel.getByLabel('Y von (mm)').fill('0');
  await panel.getByLabel('Y bis (mm)').fill('200');

  const minutesOf = async (id: string) =>
    Number(/etwa (\d+) min/.exec(await page.getByTestId(id).innerText())![1]);
  // By stops unless chosen otherwise: the pictures and minutes, nothing else
  await expect(page.getByTestId('scan-estimate')).toContainText('Bilder, etwa');
  await expect(page.getByTestId('scan-estimate-compare')).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Tempo der Fahrt' })).toHaveCount(0);
  // On the move: strips and minutes, and what it would take with stops
  await panel
    .getByRole('group', { name: 'Art des Scans' })
    .getByRole('button', { name: 'In Fahrt (schnell)' })
    .click();
  await expect(page.getByTestId('scan-estimate')).toContainText('Streifen, etwa');
  await expect(page.getByTestId('scan-estimate-compare')).toContainText('Mit Halt wären es');
  expect(await minutesOf('scan-estimate')).toBeLessThanOrEqual(
    await minutesOf('scan-estimate-compare'),
  );
  const normal = await minutesOf('scan-estimate');
  const tempo = panel.getByRole('group', { name: 'Tempo der Fahrt' });
  await tempo.getByRole('button', { name: 'Schnell' }).click();
  expect(await minutesOf('scan-estimate')).toBeLessThanOrEqual(normal);
  await tempo.getByRole('button', { name: 'Sanft' }).click();
  expect(await minutesOf('scan-estimate')).toBeGreaterThanOrEqual(normal);

  // With stops: the pictures and minutes as before, no second line, no tempo
  await panel
    .getByRole('group', { name: 'Art des Scans' })
    .getByRole('button', { name: 'Mit Halt (genau)' })
    .click();
  await expect(page.getByTestId('scan-estimate')).toContainText('Bilder, etwa');
  await expect(page.getByTestId('scan-estimate-compare')).toHaveCount(0);
  await expect(tempo).toHaveCount(0);
  // kept on this device
  expect(await page.evaluate(() => localStorage.getItem('lowrider-control.scan'))).toContain(
    '"stops"',
  );
});

test('a table with nothing to fit the pictures by: the run is given up at once, the area is scanned by stops, and not tried again until asked', async ({
  page,
}) => {
  test.setTimeout(400_000);
  await openDemo(page);
  const area = { minX: 900, minY: 600, maxX: 1200, maxY: 650 };
  await page.evaluate(() => {
    const w = window as unknown as Handle;
    w.lowriderMap.store().clear();
    w.lowriderMap.store().setMode('strips');
    w.lowriderCameraLag.ms = 300;
    w.lowriderCameraLag.jitterMs = 40;
    // out of focus: the fine texture of the board is gone, there is nothing to fit the pictures by
    w.lowriderCameraLag.blurPx = 14;
  });
  expect(await scan(page, area, false)).toBe(true);
  const first = await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!);
  expect(first.mode).toBe('strips');
  expect(first.gaveUp).toBe(true);
  // the probe cost seconds, not the whole run: well under what the same area costs in strips that fail
  expect(first.seconds).toBeLessThan(150);
  // and the area is covered all the same: the rest was scanned by stops
  const covered = await page.evaluate((a) => {
    const pic = (window as unknown as Handle).lowriderMap.picture();
    if (!pic) return 0;
    let n = 0;
    let ok = 0;
    for (let y = a.minY; y < a.maxY; y += 2) {
      for (let x = a.minX; x < a.maxX; x += 2) {
        const u = Math.floor((x - pic.left) * pic.pxPerMm);
        const v = Math.floor((pic.top - y) * pic.pxPerMm);
        n++;
        if (u >= 0 && v >= 0 && u < pic.width && v < pic.height && pic.valid[v * pic.width + u])
          ok++;
      }
    }
    return ok / n;
  }, area);
  expect(covered).toBeGreaterThan(0.97);

  // Not tried again: the next scan goes by stops from the start
  expect(await scan(page, area, false)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!.mode)).toBe(
    'stops',
  );
  // until the choice is made again
  await page.evaluate(() => (window as unknown as Handle).lowriderMap.store().setMode('strips'));
  expect(await scan(page, area, false)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Handle).lowriderMap.stats()!.mode)).toBe(
    'strips',
  );
});
