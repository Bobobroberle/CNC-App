import { readPackage, type Package } from './release';
import { readZip } from './zip';

/**
 * What the Pi will make of a zip, as a function of its own for the release script: `pnpm bundle` reads the zip it has
 * just written through the very reader the Pi uses, so a package the Pi would refuse is found at the build, not at the
 * upload (`build.mjs` bundles this file to `dist/package-check.mjs`).
 */
export function checkPackage(zip: Uint8Array): Package {
  return readPackage(readZip(zip));
}
