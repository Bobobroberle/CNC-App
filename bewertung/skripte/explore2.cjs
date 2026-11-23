const { open, buttons, OUT } = require('./lib.cjs');
(async () => {
  const { b, p } = await open('#simulator');
  await p.getByRole('button', { name: 'Neuer Job' }).first().click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/11-neuer-job.png' });
  console.log(await p.evaluate(() => document.body.innerText.slice(0, 1800)));
  console.log((await buttons(p)).join('\n'));
  await b.close();
})();
