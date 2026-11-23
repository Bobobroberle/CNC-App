// Misst die Reiterzeile in mehreren Fenstergrößen (nach dem Umbau auf sechs Reiter).
const { chromium } = require('playwright');
const OUT = '/home/user/CNC-App/bewertung/screenshots';
const SIZES = [[1280, 800], [1241, 800], [1180, 820], [1138, 820], [1101, 800], [1024, 768], [820, 1180], [800, 600]];
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto('http://localhost:4180/#simulator');
    await p.waitForTimeout(1500);
    const m = await p.evaluate(() => {
      const row = document.querySelector('.navrow');
      const r = row.getBoundingClientRect();
      const inRow = (sel) => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return { left: Math.round(q.left), right: Math.round(q.right), top: Math.round(q.top), w: Math.round(q.width) }; };
      return {
        row: { w: Math.round(r.width), scrollW: row.scrollWidth },
        tabs: [...document.querySelectorAll('[data-slot=stepper-step]')].map((e) => ({ id: e.getAttribute('data-testid'), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), label: getComputedStyle(e.querySelector('[data-slot=stepper-label]')).display })),
        find: inRow('.find-button'), menu: inRow('[data-testid=menu-button]'), vw: innerWidth,
      };
    });
    const over = m.menu && m.menu.right > m.vw ? 'MENÜ ÜBERSTEHT' : (m.row.scrollW > m.row.w + 1 ? 'ZEILE LÄUFT ÜBER' : 'passt');
    console.log(`${w}x${h}: ${over} | row ${m.row.w}/${m.row.scrollW} | tabs ${m.tabs.map((t) => `${t.id.replace('step-', '')}:${t.w}${t.label === 'none' ? 'i' : ''}`).join(' ')} | menu right ${m.menu && m.menu.right}`);
    await p.screenshot({ path: `${OUT}/Reiter-${w}x${h}.png`, clip: { x: 0, y: 0, width: w, height: 140 } });
    await ctx.close();
  }
  await b.close();
})();
