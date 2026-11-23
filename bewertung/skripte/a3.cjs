const { open, OUT } = require('./lib.cjs');
(async () => {
  const { b, p } = await open('#simulator');
  await p.getByRole('button', { name: 'Neuer Job' }).first().click();
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'G-Code öffnen' }).first().click()]);
  await fc.setFiles('/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc');
  await p.waitForTimeout(800);
  for (const n of [/Einrichten/, /Prüfen/, /Fräsen/]) {
    const el = p.getByRole('button', { name: n }).first();
    console.log(n, 'disabled=', await el.isDisabled(), 'aria-disabled=', await el.getAttribute('aria-disabled'), 'title=', await el.getAttribute('title'));
  }
  await p.getByRole('button', { name: /Fräsen/ }).first().click({ force: true });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/A-frasen-gesperrt.png' });
  console.log(await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 2500)));
  await b.close();
})();
