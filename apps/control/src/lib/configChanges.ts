import type { MachineConfig } from '@lowrider/fluidnc-client';

export type Axis3 = 'x' | 'y' | 'z';
const AXES: Axis3[] = ['x', 'y', 'z'];

/** The config items the app lets the operator change. */
export interface ConfigDraft {
  /** soft_limits on X, Y and Z together */
  softLimits: boolean;
  maxTravel: Record<Axis3, number>;
  useLineNumbers: boolean;
  mustHome: boolean;
}

export function draftFromConfig(c: MachineConfig): ConfigDraft {
  return {
    softLimits: AXES.every((a) => c.axes[a]?.softLimits === true),
    maxTravel: {
      x: c.axes.x?.maxTravel ?? 0,
      y: c.axes.y?.maxTravel ?? 0,
      z: c.axes.z?.maxTravel ?? 0,
    },
    useLineNumbers: c.useLineNumbers,
    mustHome: c.mustHome,
  };
}

export interface ConfigChange {
  /** Runtime setting path, e.g. axes/x/soft_limits */
  path: string;
  value: string;
  /** What the controller had (for the log of measurements) */
  from?: string;
}

/** Only what differs from the controller; invalid travel values are rejected. */
export function configChanges(c: MachineConfig, d: ConfigDraft): ConfigChange[] | null {
  const changes: ConfigChange[] = [];
  for (const a of AXES) {
    const axis = c.axes[a];
    if (!axis) continue;
    const travel = d.maxTravel[a];
    if (!Number.isFinite(travel) || travel <= 0) return null;
    if (axis.softLimits !== d.softLimits) {
      changes.push({
        path: `axes/${a}/soft_limits`,
        value: String(d.softLimits),
        from: String(axis.softLimits),
      });
    }
    if (axis.maxTravel !== travel) {
      changes.push({
        path: `axes/${a}/max_travel_mm`,
        value: String(travel),
        from: String(axis.maxTravel),
      });
    }
  }
  if (c.useLineNumbers !== d.useLineNumbers) {
    changes.push({
      path: 'use_line_numbers',
      value: String(d.useLineNumbers),
      from: String(c.useLineNumbers),
    });
  }
  if (c.mustHome !== d.mustHome) {
    changes.push({ path: 'start/must_home', value: String(d.mustHome), from: String(c.mustHome) });
  }
  return changes;
}
