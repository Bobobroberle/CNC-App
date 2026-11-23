const { open, OUT } = require('./lib.cjs');
(async () => {
  const { b, p } = await open('#simulator');
  await p.getByRole('button', { name: 'Neuer Job' }).first().click();
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'G-Code öffnen' }).first().click()]);
  await fc.setFiles('/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc');
  await p.getByRole('button', { name: /Einrichten/ }).first().click();
  await p.waitForTimeout(500);
  await p.mouse.click(250, 650);
  await p.waitForTimeout(500);
  console.log(await p.evaluate(() => [...document.querySelectorAll('input[type=checkbox], [role=checkbox], [role=switch]')].map((e) => e.outerHTML.slice(0, 300) + ' || parent: ' + e.parentElement.outerHTML.slice(0, 300))));
  await b.close();
})();
