const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await p.goto('file:///tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/lowrider-demo.html');
  await p.waitForTimeout(2500);
  await p.screenshot({ path: '/home/user/CNC-App/bewertung/screenshots/00-start.png' });
  console.log(logs.join('\n'));
  console.log(await p.evaluate(() => document.body.innerText.slice(0, 1500)));
  await b.close();
})();
