const { open, OUT } = require('./lib.cjs');
(async () => {
  const { b, p } = await open('#simulator');
  await p.getByRole('button', { name: 'Neuer Job' }).first().click();
  await p.getByRole('button', { name: /Zeichnen/ }).first().click();
  await p.getByRole('button', { name: /^Rechteck/ }).first().click();
  await p.getByRole('button', { name: /Einrichten/ }).first().click();
  await p.waitForTimeout(600);
  for (let i = 1; i <= 3; i++) {
    await p.mouse.click(830, 600);
    await p.waitForTimeout(600);
    const has = await p.getByRole('button', { name: /Fräser hierhin/ }).count();
    console.log('Tap', i, 'chip count', has);
    await p.screenshot({ path: OUT + `/B-tap-${i}.png` });
  }
  await b.close();
})();
