const { run } = require('./stepper.cjs');
// Hinweis: die Demo-Datei startet "wie eingerichtet" (referenziert, Job geladen, Nullpunkt gesetzt) – kein Maß für einen echten Start.
const { open, buttons, OUT } = require('./lib.cjs');
(async () => {
  const { b, p } = await open('', { width: 1440, height: 900 }, 'lowrider-demo.html');
  await p.getByRole('button', { name: /Weiter: Fräsen/ }).first().click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '/D-demo-1.png' });
  const el = p.getByRole('button', { name: /Fräsen starten/ }).first();
  await el.scrollIntoViewIfNeeded();
  const bb = await el.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(2500); await p.mouse.up();
  await p.waitForTimeout(2000);
  await p.screenshot({ path: OUT + '/D-demo-2.png' });
  console.log((await p.evaluate(() => document.body.innerText)).slice(0, 80).replace(/\n/g, ' | '));
  await b.close();
})();
