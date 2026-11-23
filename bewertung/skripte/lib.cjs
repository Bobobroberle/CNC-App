// Gemeinsame Helfer für die Zählung. Keine Abkürzung über den Store: nur echte Eingaben (Klick, Halten, Tastatur, Dateiauswahl).
const { chromium } = require('playwright');
const SRC = '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung';
const OUT = '/home/user/CNC-App/bewertung/screenshots';
async function open(hash = '#simulator', vp = { width: 1440, height: 900 }, file = 'lowrider-control.html', extra = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, ...extra });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push('PAGEERROR ' + e.message));
  await p.goto(`file://${SRC}/${file}${hash}`);
  await p.waitForTimeout(2500);
  return { b, ctx, p };
}
async function buttons(p) {
  return p.evaluate(() => [...document.querySelectorAll('button, [role=button], [role=tab], a, input, select, textarea, [role=switch]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; })
    .map((e) => (e.tagName + ':' + ((e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || e.type || '') + '').replace(/\s+/g, ' ').trim().slice(0, 60))));
}
module.exports = { open, buttons, SRC, OUT };
