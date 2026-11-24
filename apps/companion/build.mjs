// Bundles the companion into one file that runs with plain `node` on the Pi, and writes `release.json` beside it:
// what this build is. The build number is the time of the commit it is built from (seconds): a newer build is a
// larger number, however many machines build it. A working tree with changes is a build of its own (the time
// of the build, `+dirty`), so that a test build is never taken for the commit.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';

// Where the bundle goes (the tests build several versions side by side), and – for them only – which build and
// commit to bake in instead of the repository's.
const out = process.env.LOWRIDER_OUT_DIR ?? 'dist';
mkdirSync(out, { recursive: true });

const git = (...args) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// The level of what setup.sh installs: its own constant is the one truth (a test holds version.ts to it too)
const setup = readFileSync('../../scripts/pi/setup.sh', 'utf8');
const setupLevel = Number(/^SETUP_LEVEL=(\d+)/m.exec(setup)?.[1]);
if (!Number.isSafeInteger(setupLevel))
  throw new Error('SETUP_LEVEL not found in scripts/pi/setup.sh');

const commit = git('rev-parse', '--short=9', 'HEAD');
const dirty = git('status', '--porcelain') !== '';
const committed = Number(git('log', '-1', '--format=%ct'));
const known = /^[0-9a-f]{7,12}$/.test(commit) && Number.isSafeInteger(committed) && committed > 0;
const forced = Number(process.env.LOWRIDER_BUILD);
const release = {
  format: 'lowrider-release',
  version: pkg.version,
  build:
    Number.isSafeInteger(forced) && forced > 0
      ? forced
      : known && !dirty
        ? committed
        : Math.max(known ? committed : 0, Math.floor(Date.now() / 1000)),
  commit: process.env.LOWRIDER_COMMIT ?? (known ? `${commit}${dirty ? '+dirty' : ''}` : '0000000'),
  setupLevel,
  // From the build number, not from the clock: the same commit gives the same bytes (and the same checksum)
  builtAt: '',
};
release.builtAt = new Date(release.build * 1000).toISOString();

await build({
  entryPoints: ['src/main.ts'],
  outfile: `${out}/companion.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  external: ['node:sqlite'],
  define: {
    __RELEASE_JSON__: JSON.stringify(
      JSON.stringify({
        version: release.version,
        build: release.build,
        commit: release.commit,
        setupLevel: release.setupLevel,
      }),
    ),
  },
  logLevel: 'warning',
});
// The reader the Pi uses for an upload, as a plain module: `scripts/bundle.mjs` checks its zip with it
await build({
  entryPoints: ['src/packageCheck.ts'],
  outfile: `${out}/package-check.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  logLevel: 'warning',
});
writeFileSync(`${out}/release.json`, `${JSON.stringify(release, null, 2)}\n`);
