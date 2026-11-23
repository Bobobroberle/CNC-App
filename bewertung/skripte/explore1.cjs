const { open, buttons, OUT } = require('./lib.cjs');
(async () => {
  const { b, p } = await open('#simulator');
  await p.screenshot({ path: OUT + '/10-frisch-simulator.png' });
  console.log(await p.evaluate(() => document.body.innerText.slice(0, 1200)));
  console.log((await buttons(p)).join('\n'));
  console.log(p.errors);
  await b.close();
})();
