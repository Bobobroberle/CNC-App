import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRelease } from '../src/release';
import { BUILD, SETUP_LEVEL } from '../src/version';

const ROOT = join(import.meta.dirname, '../../..');

describe('what this build is', () => {
  it('has a development build where nothing was baked in (tests, running from source)', () => {
    expect(BUILD).toEqual({ version: '0.1.0', build: 0, commit: 'dev', setupLevel: SETUP_LEVEL });
  });

  it('knows the setup level of setup.sh – the one truth is the script, the program and the build hold to it', () => {
    const script = readFileSync(join(ROOT, 'scripts/pi/setup.sh'), 'utf8');
    expect(Number(/^SETUP_LEVEL=(\d+)/m.exec(script)?.[1])).toBe(SETUP_LEVEL);
    // the build script reads the same line
    expect(readFileSync(join(import.meta.dirname, '../build.mjs'), 'utf8')).toContain(
      'SETUP_LEVEL=(\\d+)',
    );
  });

  it('writes a release.json that its own reader takes (the update reads what the build wrote)', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const out = mkdtempSync(join(tmpdir(), 'lowrider-release-'));
    execFileSync('node', ['build.mjs'], {
      cwd: join(import.meta.dirname, '..'),
      env: { ...process.env, LOWRIDER_OUT_DIR: out },
    });
    const release = parseRelease(readFileSync(join(out, 'release.json'), 'utf8'));
    expect(release.setupLevel).toBe(SETUP_LEVEL);
    expect(release.build).toBeGreaterThan(1.7e9);
    // and the bundle has the same numbers baked in
    const code = readFileSync(join(out, 'companion.mjs'), 'utf8');
    expect(code).toContain(`"build":${release.build}`);
    expect(code.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('writes the same release.json twice for the same build – the time in it is the time of the build, not of the clock', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const make = () => {
      const out = mkdtempSync(join(tmpdir(), 'lowrider-release-'));
      execFileSync('node', ['build.mjs'], {
        cwd: join(import.meta.dirname, '..'),
        env: {
          ...process.env,
          LOWRIDER_OUT_DIR: out,
          LOWRIDER_BUILD: '1795000000',
          LOWRIDER_COMMIT: 'abcdef0',
        },
      });
      return {
        json: readFileSync(join(out, 'release.json'), 'utf8'),
        code: readFileSync(join(out, 'companion.mjs'), 'utf8'),
      };
    };
    const [a, b] = [make(), make()];
    expect(a.json).toBe(b.json);
    expect(a.code).toBe(b.code);
    expect(JSON.parse(a.json).builtAt).toBe(new Date(1_795_000_000_000).toISOString());
  });

  it('is built from the commit: a forced number and commit win, a bad one is ignored', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const make = (env: Record<string, string>) => {
      const out = mkdtempSync(join(tmpdir(), 'lowrider-release-'));
      execFileSync('node', ['build.mjs'], {
        cwd: join(import.meta.dirname, '..'),
        env: { ...process.env, ...env, LOWRIDER_OUT_DIR: out },
      });
      return parseRelease(readFileSync(join(out, 'release.json'), 'utf8'));
    };
    expect(make({ LOWRIDER_BUILD: '1234', LOWRIDER_COMMIT: 'abcdef0' })).toMatchObject({
      build: 1234,
      commit: 'abcdef0',
    });
    expect(make({ LOWRIDER_BUILD: 'soon' }).build).toBeGreaterThan(1.7e9);
  });
});
