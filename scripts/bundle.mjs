// Collects the deliverables after `pnpm build`: the app as one HTML file, the companion bundle
// and release/pi/ – everything the Raspberry Pi needs, with its setup script.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { writeZip } from './zip.mjs';

// Nothing of an earlier build stays: the zip is made of what lies in release/pi, and the Pi refuses what it does not know
rmSync('release/pi', { recursive: true, force: true });
mkdirSync('release/pi', { recursive: true });
copyFileSync('apps/control/dist/index.html', 'release/lowrider-control.html');
copyFileSync('apps/companion/dist/companion.mjs', 'release/companion.mjs');
copyFileSync('profiles/lowrider-v4.json', 'release/lowrider-v4.json');
copyFileSync('apps/control/dist/index.html', 'release/pi/lowrider-control.html');
copyFileSync('apps/companion/dist/companion.mjs', 'release/pi/companion.mjs');
// setup.sh and what it sources (lib.sh), the guard for updates from the app, the sensor script – and release.json,
// which says what build this is (the update from the app reads it, and so does setup.sh)
for (const f of ['setup.sh', 'lib.sh', 'guard.sh', 'health-gate.sh', 'lsm6dso.py']) {
  copyFileSync(`scripts/pi/${f}`, `release/pi/${f}`);
}
copyFileSync('apps/companion/dist/release.json', 'release/pi/release.json');
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

// The zip of release/pi for the operator: the folder `pi` and, beside it, update-pi.bat (a double click on the PC
// instead of the command line). The same file is what the update from the app takes. Deterministic – the files
// and the build give the same bytes – and with its SHA-256 beside it, which the operator keeps on a second path.
const info = JSON.parse(readFileSync('release/pi/release.json', 'utf8'));
const crlf = (text) => text.replace(/\r?\n/g, '\r\n');
const bat = crlf(readFileSync('scripts/pi/update-pi.bat', 'utf8'));
// cmd.exe reads the file in the PC's own code page: anything but ASCII would show wrongly
if (/[^\x00-\x7f]/.test(bat)) throw new Error('update-pi.bat must be plain ASCII');
const executable = new Set(['setup.sh', 'lib.sh', 'guard.sh', 'health-gate.sh', 'lsm6dso.py']);
const entries = [{ name: 'update-pi.bat', data: Buffer.from(bat), mode: 0o644 }, { name: 'pi/' }];
const walk = (dir, prefix) => {
  for (const name of readdirSync(dir).sort()) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) {
      entries.push({ name: `${prefix}${name}/` });
      walk(path, `${prefix}${name}/`);
    } else {
      entries.push({
        name: `${prefix}${name}`,
        data: readFileSync(path),
        mode: executable.has(name) ? 0o755 : 0o644,
      });
    }
  }
};
walk('release/pi', 'pi/');
const zip = writeZip(entries, { at: new Date(info.build * 1000) });
// The zip is read back with the reader the Pi uses for an upload: a file it would refuse (a new kind of asset, a leftover)
// is found here, not when the operator tries the update
const { checkPackage } = await import('../apps/companion/dist/package-check.mjs');
try {
  const pkg = checkPackage(zip);
  if (pkg.release.build !== info.build)
    throw new Error('release.json of the zip is not the build of the companion');
} catch (error) {
  throw new Error(
    `lowrider-pi.zip would be refused by the Pi: ${error instanceof Error ? error.message : error}`,
  );
}
writeFileSync('release/lowrider-pi.zip', zip);
const sum = createHash('sha256').update(zip).digest('hex');
writeFileSync('release/lowrider-pi.zip.sha256', `${sum}  lowrider-pi.zip\n`);
console.log(
  `release/lowrider-pi.zip (${(zip.length / 1e6).toFixed(1)} MB, build ${info.build}, ${info.commit})`,
);
console.log(`SHA-256: ${sum}`);
