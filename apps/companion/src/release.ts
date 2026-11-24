/**
 * What an update from the app is allowed to bring: the files of `release/pi` as they come in the zip,
 * checked, and mapped onto fixed destination names inside a release directory. A name from the archive
 * is never a path: it is matched against a whitelist, and what is not on it is refused (or, for the
 * setup files, ignored – an update from the app never replaces `setup.sh` or the guard).
 */

export interface ReleaseInfo {
  format: 'lowrider-release';
  /** The label, `1.5.0` */
  version: string;
  /** Monotonic: the time of the commit it was built from, seconds – a newer build is a larger number */
  build: number;
  commit: string;
  /** What the Pi's setup must be at least (`setup.sh` writes its own level into `setup-level`) */
  setupLevel: number;
  builtAt?: string;
}

export type ReleaseErrorCode =
  | 'no-release'
  | 'bad-release'
  | 'unexpected-file'
  | 'bad-file'
  | 'too-large';

export class ReleaseError extends Error {
  constructor(
    readonly code: ReleaseErrorCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}

/** The files of the release by their name inside the release directory. */
export interface Package {
  release: ReleaseInfo;
  files: Map<string, Buffer>;
  /** Files of the archive that were left alone (the setup files, anything outside `pi/`) */
  ignored: string[];
}

const MB = 1024 * 1024;
/** The files of `release/pi` that are setup, not release: they are never applied by an update. */
const SETUP_FILES = new Set(['setup.sh', 'lib.sh', 'guard.sh', 'health-gate.sh']);
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|webmanifest|ico|svg|jpg|json|txt)$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `release.json`, strictly: what it says decides whether the update is taken. */
export function parseRelease(text: string): ReleaseInfo {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ReleaseError('bad-release', 'release.json is no JSON');
  }
  if (!isObject(raw) || raw.format !== 'lowrider-release') {
    throw new ReleaseError('bad-release', 'release.json is no release');
  }
  const { version, build, commit, setupLevel, builtAt } = raw;
  if (
    typeof version !== 'string' ||
    !/^\d{1,4}\.\d{1,4}\.\d{1,4}([-+][A-Za-z0-9.-]{1,30})?$/.test(version)
  ) {
    throw new ReleaseError('bad-release', 'version');
  }
  if (!Number.isSafeInteger(build) || (build as number) < 1 || (build as number) > 1e11) {
    throw new ReleaseError('bad-release', 'build');
  }
  if (typeof commit !== 'string' || !/^[0-9a-f]{7,12}(\+dirty)?$/.test(commit)) {
    throw new ReleaseError('bad-release', 'commit');
  }
  if (
    !Number.isSafeInteger(setupLevel) ||
    (setupLevel as number) < 1 ||
    (setupLevel as number) > 99
  ) {
    throw new ReleaseError('bad-release', 'setupLevel');
  }
  if (builtAt !== undefined && (typeof builtAt !== 'string' || builtAt.length > 40)) {
    throw new ReleaseError('bad-release', 'builtAt');
  }
  return {
    format: 'lowrider-release',
    version,
    build: build as number,
    commit,
    setupLevel: setupLevel as number,
    ...(builtAt === undefined ? {} : { builtAt }),
  };
}

/** The files of the archive (as read by `readZip`) as a package, or why not. */
export function readPackage(archive: Map<string, Buffer>): Package {
  const files = new Map<string, Buffer>();
  const ignored: string[] = [];
  for (const [name, data] of archive) {
    if (!name.startsWith('pi/')) {
      ignored.push(name);
      continue;
    }
    const rest = name.slice(3);
    if (SETUP_FILES.has(rest)) {
      ignored.push(name);
    } else if (rest === 'companion.mjs' || rest === 'release.json' || rest === 'lsm6dso.py') {
      files.set(rest, data);
    } else if (rest === 'lowrider-control.html') {
      files.set('app/index.html', data);
    } else if (
      /^app\/[^/]+$/.test(rest) &&
      ASSET_NAME.test(rest.slice(4)) &&
      rest !== 'app/index.html'
    ) {
      files.set(rest, data);
    } else {
      throw new ReleaseError('unexpected-file', name);
    }
  }
  for (const needed of ['release.json', 'companion.mjs', 'app/index.html']) {
    if (!files.has(needed)) throw new ReleaseError('no-release', needed);
  }
  const companion = files.get('companion.mjs')!;
  if (companion.length > 16 * MB) throw new ReleaseError('too-large', 'companion.mjs');
  if (!companion.subarray(0, 40).toString('latin1').startsWith('#!/usr/bin/env node')) {
    throw new ReleaseError('bad-file', 'companion.mjs is no program of the companion');
  }
  const page = files.get('app/index.html')!;
  if (page.length > 16 * MB) throw new ReleaseError('too-large', 'lowrider-control.html');
  if (!/^(﻿)?\s*<!doctype html/i.test(page.subarray(0, 64).toString('utf8'))) {
    throw new ReleaseError('bad-file', 'lowrider-control.html is no page');
  }
  for (const [name, data] of files) {
    if (name.startsWith('app/') && name !== 'app/index.html' && data.length > 2 * MB) {
      throw new ReleaseError('too-large', name);
    }
  }
  return { release: parseRelease(files.get('release.json')!.toString('utf8')), files, ignored };
}
