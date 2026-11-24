/**
 * What build this is. `build.mjs` bakes it into the bundle (`__RELEASE_JSON__`: the same values it writes to
 * `release.json` beside it); without that – tests, `tsx` – it is a development build with build 0.
 */
declare const __RELEASE_JSON__: string | undefined;

/** The level of what `setup.sh` installs (its own `SETUP_LEVEL`; a test holds the two together). */
export const SETUP_LEVEL = 2;

export interface Build {
  version: string;
  /** The time of the commit it was built from, in seconds: a newer build is a larger number */
  build: number;
  commit: string;
  setupLevel: number;
}

export const BUILD: Build =
  typeof __RELEASE_JSON__ === 'string'
    ? (JSON.parse(__RELEASE_JSON__) as Build)
    : { version: '0.1.0', build: 0, commit: 'dev', setupLevel: SETUP_LEVEL };
