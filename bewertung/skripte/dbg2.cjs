const { open, OUT } = require('./lib.cjs');
(async () => {
  const { b, p } = await open('#simulator');
  await p.getByRole('button', { name: 'Neuer Job' }).first().click();
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'G-Code öffnen' }).first().click()]);
  await fc.setFiles('/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc');
  await p.getByRole('button', { name: /Einrichten/ }).first().click();
  await p.waitForTimeout(500);
  const z = p.getByRole('button', { name: /Nullpunkt hier setzen/ }).first();
  console.log('outer', await z.evaluate((e) => e.outerHTML.slice(0, 500)));
  await z.click(); // a tap shows the reason
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/A-nullpunkt-tap.png' });
  console.log(await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').match(/.{0,200}(Nullpunkt hier setzen).{0,300}/g)));
  await b.close();
})();
