// Rasterises icon.svg (beside this file) into the PNGs the home screen wants
// (apps/control/public/, shipped next to index.html) and the launch pictures
// for the iPad Air. Uses the Chromium that Playwright installs for the e2e
// tests; the results are checked in, so a normal build does not need it:
//
//   pnpm icons
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = fileURLToPath(new URL('.', import.meta.url));
const svg = readFileSync(`${here}icon.svg`, 'utf8');
const out = `${here}../public`;
const background = '#161616';

/** Square icons: file name → edge length in px */
const ICONS = {
  'apple-touch-icon.png': 180, // iPhone, and the name Safari asks for by itself
  'apple-touch-icon-167.png': 167, // iPad Pro
  'apple-touch-icon-152.png': 152, // iPad, iPad Air
  'icon-192.png': 192, // manifest
  'icon-512.png': 512, // manifest
};

/** Launch pictures (shown while the app starts from the home screen): device px */
const SPLASH = {
  'splash-1640x2360.png': [1640, 2360], // iPad Air 11" upright
  'splash-2360x1640.png': [2360, 1640], // iPad Air 11" lying down
  'splash-2048x2732.png': [2048, 2732], // iPad Air 13" upright
  'splash-2732x2048.png': [2732, 2048], // iPad Air 13" lying down
};

const page = (width, height, icon) => `<!doctype html>
<style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; background: ${background}; }
  body { display: flex; align-items: center; justify-content: center; }
  svg { width: ${icon}px; height: ${icon}px; display: block; border-radius: ${icon === width ? 0 : icon * 0.22}px; }
</style>${svg}`;

const browser = await chromium.launch();
const shot = async (name, width, height, icon) => {
  const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await tab.setContent(page(width, height, icon));
  writeFileSync(`${out}/${name}`, await tab.screenshot({ type: 'png' }));
  await tab.close();
  console.log(`${name} (${width}×${height})`);
};
for (const [name, size] of Object.entries(ICONS)) await shot(name, size, size, size);
for (const [name, [width, height]] of Object.entries(SPLASH)) {
  await shot(name, width, height, Math.round(Math.min(width, height) * 0.22));
}
await browser.close();
