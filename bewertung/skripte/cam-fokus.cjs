// Screenshots des CAM-Bereichs (Stufe 2: nur das CAM und die Statusleiste) bei drei Fenstergrößen.
const { open, OUT } = require('./lib.cjs');
const SIZES = [[1280, 800], [800, 600], [820, 1180]];
(async () => {
  for (const [w, h] of SIZES) {
    const { b, p } = await open('#simulator', { width: w, height: h });
    await p.locator('[data-testid=step-cam]').click();
    await p.waitForTimeout(600);
    await p.getByRole('button', { name: /^Rechteck/ }).first().click();
    await p.waitForTimeout(600);
    const gone = await p.evaluate(() => ({
      aktionsleiste: !!document.querySelector('.actionbar'),
      jog: !!document.querySelector('[data-testid=jog-toggle]'),
      werkzeugleiste: !!document.querySelector('[data-testid=tool-strip]'),
      kameraEinblendung: !!document.querySelector('[data-testid=live-inset]'),
      ansichtsumschalter: !!document.querySelector('[aria-label="Ansicht der Bühne"]'),
    }));
    console.log(`${w}x${h}`, JSON.stringify(gone));
    await p.screenshot({ path: `${OUT}/CAM-Fokus-${w}x${h}.png` });
    await b.close();
  }
})();
