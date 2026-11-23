// Collects the deliverables after `pnpm build`: the app as one HTML file, the companion bundle
// and release/pi/ – everything the Raspberry Pi needs, with its setup script.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

mkdirSync('release/pi', { recursive: true });
copyFileSync('apps/control/dist/index.html', 'release/lowrider-control.html');
copyFileSync('apps/companion/dist/companion.mjs', 'release/companion.mjs');
copyFileSync('profiles/lowrider-v4.json', 'release/lowrider-v4.json');
copyFileSync('apps/control/dist/index.html', 'release/pi/lowrider-control.html');
copyFileSync('apps/companion/dist/companion.mjs', 'release/pi/companion.mjs');
for (const f of ['setup.sh', 'lsm6dso.py']) copyFileSync(`scripts/pi/${f}`, `release/pi/${f}`);
// What makes the page a home-screen app on the iPad – icons, launch pictures, manifest – are
// files beside index.html (Safari fetches them by address); setup.sh puts them there.
rmSync('release/pi/app', { recursive: true, force: true });
mkdirSync('release/pi/app', { recursive: true });
const extras = readdirSync('apps/control/dist').filter((f) => f !== 'index.html');
for (const f of extras) copyFileSync(`apps/control/dist/${f}`, `release/pi/app/${f}`);
if (!extras.includes('apple-touch-icon.png') || !extras.includes('manifest.webmanifest')) {
  throw new Error('home-screen icon or manifest missing from the build');
}
// The same app as a demo page: starts "as if set up and calibrated" on the simulator and keeps
// nothing (memory storage). The flag must be set before the app script runs.
const app = readFileSync('apps/control/dist/index.html', 'utf8');
const demo = app
  .replace('<head>', "<head><script>window.LOWRIDER_DEMO = 'full';</script>")
  .replace(/<title>[^<]*<\/title>/, '<title>LowRider Control Demo</title>');
if (!demo.includes("LOWRIDER_DEMO = 'full'")) throw new Error('demo flag not placed');
writeFileSync('release/lowrider-demo.html', demo);
console.log(
  `release/: lowrider-control.html, lowrider-demo.html, companion.mjs, lowrider-v4.json, pi/ (app/: ${extras.length} files)`,
);
