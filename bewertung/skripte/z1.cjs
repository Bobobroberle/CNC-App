// Zählt sichtbare bedienbare Elemente je Schritt/Bereich (frischer Start + geladener G-Code), 1440x900.
const { open, OUT } = require('./lib.cjs');
const count = (p) => p.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight; };
  const all = [...document.querySelectorAll('button, [role=tab], input, select, textarea, [role=switch], [role=checkbox]')].filter(vis);
  const chrome = [...document.querySelectorAll('header button, .statusbar button, nav button')].filter(vis).length;
  const heads = [...document.querySelectorAll('h2, h3, [data-slot=card-title]')].filter(vis).length;
  return { sichtbar: all.length, ueberschriften: heads };
});
(async () => {
  const { b, p } = await open('#simulator');
  await p.getByRole('button', { name: 'Neuer Job' }).first().click();
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'G-Code öffnen' }).first().click()]);
  await fc.setFiles('/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc');
  await p.waitForTimeout(800);
  const out = {};
  out['Start'] = null;
  for (const [k, re] of [['1 Job', /^Job/], ['2 Werkzeuge', /^Werkzeuge/], ['3 Einrichten', /^Einrichten/], ['4 Prüfen', /^Prüfen/], ['5 Fräsen', /^Fräsen/]]) {
    await p.getByRole('button', { name: re }).first().click();
    await p.waitForTimeout(700);
    out[k] = await count(p);
    await p.screenshot({ path: `${OUT}/Z-${k.replace(/\W+/g, '_')}.png` });
  }
  // Menü
  await p.getByRole('button', { name: 'Menü' }).first().click(); await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/Z-Menue.png' });
  out['Menü offen'] = await count(p);
  console.log(JSON.stringify(out, null, 1));
  console.log(await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 1500)));
  await b.close();
})();
