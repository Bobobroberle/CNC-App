// Zählt Eingaben. Regel (siehe Bericht): 1 Klick/Tipp = 1; Halten = 1; Dateiauswahl im Systemdialog = 1 (zusätzlich zum Klick, der ihn öffnet); Tastendruck = 1.
const { open, buttons, OUT } = require('./lib.cjs');
const fs = require('fs');
async function run({ name, hash = '#simulator', vp, steps, dump = true, extra }) {
  if (process.env.VP) { const [w, h] = process.env.VP.split('x').map(Number); vp = { width: w, height: h }; name = name + '-' + process.env.VP; }
  const { b, p } = await open(hash, vp, 'lowrider-control.html', extra);
  let n = 0;
  const log = [];
  const shot = async (i, label) => p.screenshot({ path: `${OUT}/${name}-${String(i).padStart(2, '0')}.png` });
  await shot(0, 'start');
  for (const s of steps) {
    if (s.waitIdle) { await p.waitForFunction(() => /^(Bereit|Idle)/.test(document.body.innerText.trim()), null, { timeout: s.timeout ?? 120000 }); await p.waitForTimeout(500); log.push('  (Warten auf Bereit – keine Eingabe)'); continue; }
    n++;
    const t0 = Date.now();
    try {
      if (s.click) await p.getByRole('button', { name: s.click, exact: s.exact ?? false }).first().click({ timeout: 5000 });
      else if (s.clickText) await p.getByText(s.clickText, { exact: false }).first().click({ timeout: 5000 });
      else if (s.file) {
        const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: s.opener }).first().click()]);
        await fc.setFiles(s.file);
        n++; log.push(`  (+1 Dateiauswahl im Systemdialog)`);
      } else if (s.hold) {
        const el = p.getByRole('button', { name: s.hold }).nth(s.nth ?? 0);
        if (await el.isDisabled()) log.push('  (Halte-Feld gesperrt: ' + s.label + ')');
        let bb = await el.boundingBox();
        // Scrollen zählt nur, wenn der Knopf am Mittelpunkt wirklich verdeckt oder außerhalb ist (Treffertest), nicht nach einer Pixelschwelle.
        const hit = () => el.evaluate((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (e === t || e.contains(t) || t.contains(e)); });
        if (!(await hit())) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); bb = await el.boundingBox(); n++; log.push('  (+1 Scrollen, Knopf war nicht erreichbar: ' + s.label + ')'); }
        await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await p.mouse.down();
        await p.waitForTimeout(s.ms ?? 2500);
        await p.mouse.up();
      } else if (s.check) await p.getByRole('checkbox').nth(s.check - 1).check();
      else if (s.tapRel) { const bb = await p.evaluate(() => { let best = null; for (const c of document.querySelectorAll('canvas')) { const r = c.getBoundingClientRect(); if (!best || r.width * r.height > best.w * best.h) best = { x: r.x, y: r.y, w: r.width, h: r.height }; } return best; }); await p.mouse.click(bb.x + bb.w * s.tapRel[0], bb.y + bb.h * s.tapRel[1]); }
      else if (s.tap) await p.mouse.click(s.tap[0], s.tap[1]);
      else if (s.key) await p.keyboard.press(s.key);
      else if (s.eval) await p.evaluate(s.eval);
    } catch (e) {
      log.push(`FEHLER bei Schritt ${n}: ${JSON.stringify(s)} -> ${e.message.split('\n')[0]}`);
      await shot(n, 'fehler');
      break;
    }
    await p.waitForTimeout(s.wait ?? 700);
    await shot(n, '');
    log.push(`${n}. ${s.label ?? JSON.stringify(s).slice(0, 100)}`);
  }
  console.log(log.join('\n'));
  if (dump) {
    console.log('--- Text ---');
    console.log(await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 1800)));
    console.log('--- Buttons ---');
    console.log((await buttons(p)).join(' || '));
  }
  console.log('Seitenfehler:', p.errors);
  await b.close();
}
module.exports = { run };
