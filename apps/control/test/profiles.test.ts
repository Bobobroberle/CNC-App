import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSharedProfile,
  DEFAULT_MATERIALS,
  DEFAULT_TOOLS,
  parseSharedProfile,
} from '@lowrider/workshop';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MACROS } from '../src/lib/macros';
import { LOWRIDER_V4_PROFILE, parseSettings } from '../src/lib/profile';

const file = join(import.meta.dirname, '../../../profiles/lowrider-v4.json');

/** The bundled community profile, generated from the app's defaults. */
function expected() {
  const p = LOWRIDER_V4_PROFILE;
  return createSharedProfile(
    {
      name: p.name,
      author: 'LowRider Control',
      description:
        'V1E LowRider v4 mit Jackpot 2 (FluidNC), Werte der V1E-Standard-config.yaml. Verfahrweg nach dem Aufbau prüfen!',
      machine: {
        travel: p.travel,
        softLimits: p.softLimits,
        jogFeed: p.jogFeed,
        kinematics: p.kinematics,
        controller: p.controller,
        probe: p.probe,
      },
      tools: DEFAULT_TOOLS,
      materials: DEFAULT_MATERIALS,
      macros: DEFAULT_MACROS,
    },
    new Date('2026-10-24T00:00:00Z'),
  );
}

describe('bundled LowRider v4 profile', () => {
  it('matches the defaults (UPDATE_PROFILE=1 regenerates it)', () => {
    const want = JSON.stringify(expected(), null, 2) + '\n';
    if (process.env.UPDATE_PROFILE || !existsSync(file)) writeFileSync(file, want);
    expect(readFileSync(file, 'utf8')).toBe(want);
  });

  it('is a valid shared profile', () => {
    const r = parseSharedProfile(readFileSync(file, 'utf8'), parseSettings);
    expect('profile' in r && r.profile.machine.travel.x.max).toBe(1223);
    expect('profile' in r && r.profile.tools.length).toBe(3);
  });
});
