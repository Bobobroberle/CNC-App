// Zeigt die Aktionsleiste je Bereich und Fenstergröße: Screenshot des unteren Rands und was als Primäraktion dasteht.
const { open, OUT } = require('./lib.cjs');
const FILE = '/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc';
const SIZES = [[1280, 800], [800, 600], [820, 1180]];
(async () => {
  for (const [w, h] of SIZES) {
    const { b, p } = await open('#simulator', { width: w, height: h });
    const rows = [];
    const snap = async (name) => {
      const primary = await p.evaluate(() => {
        const e = document.querySelector('[data-testid=primary-action]');
        return e ? e.innerText.replace(/\s+/g, ' ').trim() || '(Knopf ohne Text)' : '— keine —';
      });
      rows.push(`${name}: ${primary}`);
      const bar = await p.locator('.actionbar').boundingBox();
      await p.screenshot({ path: `${OUT}/Aktionsleiste-${w}x${h}-${name}.png`, clip: { x: 0, y: Math.max(0, bar.y - 8), width: w, height: Math.min(h - Math.max(0, bar.y - 8), bar.height + 16) } });
    };
    const tab = (id) => p.locator(`[data-testid=step-${id}]`).click();
    await tab('job');
    await snap('Job-leer');
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'G-Code öffnen' }).first().click()]);
    await fc.setFiles(FILE);
    await p.waitForTimeout(800);
    await snap('Job-geladen');
    await tab('cam'); await p.waitForTimeout(400); await snap('CAM');
    await tab('setup'); await p.waitForTimeout(400); await snap('Einrichten');
    await tab('run'); await p.waitForTimeout(400); await snap('Fraesen');
    await p.getByRole('button', { name: 'Prüfen', exact: true }).first().click().catch(() => {});
    await p.waitForTimeout(400); await snap('Pruefen');
    await tab('service'); await p.waitForTimeout(300); await snap('Service');
    console.log(`${w}x${h}\n  ` + rows.join('\n  '));
    await b.close();
  }
})();
