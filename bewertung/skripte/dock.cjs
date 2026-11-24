// Stufe 3: die angedockte Hauptaktion. Screenshots des Bedienfelds bei 1280×800 und 800×600 (Blatt „ganz“),
// Einrichten → Nullpunkt, ganz nach oben gerollt: „Nullpunkt hier setzen“ steht trotzdem unten im Bild.
const { open, OUT } = require('./lib.cjs');
const SIZES = [[1280, 800], [800, 600]];
(async () => {
  for (const [w, h] of SIZES) {
    const { b, p } = await open('#simulator', { width: w, height: h });
    await p.locator('[data-testid=step-setup]').click();
    await p.waitForTimeout(500);
    const larger = p.locator('[data-slot="sheet-larger"]');
    if ((await larger.count()) > 0) await larger.click();
    await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('.panel-body').scrollTo({ top: 0, behavior: 'instant' }));
    await p.waitForTimeout(300);
    const set = p.getByRole('button', { name: /^Nullpunkt hier setzen/ }).first();
    const box = await set.boundingBox();
    const panel = await p.locator('.panel-body').boundingBox();
    console.log(`${w}x${h}: Knopf y=${Math.round(box.y)}..${Math.round(box.y + box.height)}, Bedienfeld y=${Math.round(panel.y)}..${Math.round(panel.y + panel.height)}`);
    await p.screenshot({ path: `${OUT}/Dock-${w}x${h}-Nullpunkt.png` });
    await b.close();
  }
})();
