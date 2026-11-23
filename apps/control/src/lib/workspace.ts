import {
  checkWorkspace,
  interpret,
  type Vec4,
  type WorkspaceViolation,
} from '@lowrider/gcode-core';
import type { MachineProfile } from './profile';

/**
 * Checks a program against the machine travel with the controller's current
 * work offset. WCO already contains the active work offset plus G92 and tool
 * length offset, so it applies to every coordinate system the job uses.
 */
export function travelViolations(
  text: string,
  profile: Pick<MachineProfile, 'travel' | 'hasRotary'>,
  wco: readonly number[],
  /** Current machine position: where the first move starts */
  mpos: readonly number[],
): WorkspaceViolation[] {
  const vec = (v: readonly number[]): Vec4 => ({
    x: v[0] ?? 0,
    y: v[1] ?? 0,
    z: v[2] ?? 0,
    a: v[3] ?? 0,
  });
  const offset = vec(wco);
  const { segments } = interpret(text, {
    initialPosition: vec(mpos),
    wcsOffsets: Array.from({ length: 6 }, () => offset),
    rotaryAxis: profile.hasRotary,
  });
  const { travel } = profile;
  return checkWorkspace(segments, {
    min: { x: travel.x.min, y: travel.y.min, z: travel.z.min },
    max: { x: travel.x.max, y: travel.y.max, z: travel.z.max },
  });
}
