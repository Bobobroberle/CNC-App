import { axisTravel, type MachineConfig } from '@lowrider/fluidnc-client';
import { LOWRIDER_V4_KINEMATICS, type Kinematics } from '@lowrider/gcode-core';

export type Axis3 = 'x' | 'y' | 'z';
export type Travel = Record<Axis3, { min: number; max: number }>;

/** What the controller itself does, as far as the job checks need it. */
export interface ControllerInfo {
  /** Description of where the values came from, e.g. board and name */
  source: string;
  /** soft_limits is on for every axis */
  softLimits: boolean;
  /** M6 runs an ATC or m6_macro; otherwise FluidNC does not stop at M6 */
  toolChangeHandled: boolean;
  /** use_line_numbers: status reports carry Ln: */
  useLineNumbers: boolean;
  mustHome: boolean;
  /** A spindle section exists; otherwise M3/M5 switch nothing and the router is switched by hand */
  spindleControlled: boolean;
}

/**
 * Physical description of the machine. The travel is the software end stop:
 * jogging stops at it and jobs are checked against it.
 */
export interface MachineProfile {
  name: string;
  /** Values are placeholders until the operator enters the real ones */
  placeholder: boolean;
  /** Travel in the machine frame (MPos after homing), mm */
  travel: Travel;
  /** Clamp jog moves to the travel (needs a homed machine) */
  softLimits: boolean;
  /** Jog feed, mm/min */
  jogFeed: { xy: number; z: number };
  kinematics: Kinematics;
  controller: ControllerInfo;
  hasRotary: boolean;
  /** Z touch-off with a plate */
  probe: ProbeSettings;
}

export interface ProbeSettings {
  /** Thickness of the touch plate, mm */
  plateThickness: number;
  /** How far down to search, mm */
  maxTravel: number;
  /** Probing feed, mm/min */
  feed: number;
  /** Lift above the plate after touching, mm */
  retract: number;
}

/**
 * Values of the V1E stock config for the Jackpot 2 LowRider (machine/config.yaml).
 * The travel follows FluidNC's soft-limit formula; it is a placeholder until
 * checked at the machine: 1220 × 2440 is the stock 4 × 8 ft value and Z 300 mm
 * is far more than the real Z travel.
 */
export const LOWRIDER_V4_PROFILE: MachineProfile = {
  name: 'V1E LowRider v4 (Jackpot 2)',
  placeholder: true,
  travel: { x: { min: 3, max: 1223 }, y: { min: 3, max: 2443 }, z: { min: -297, max: 3 } },
  softLimits: true,
  jogFeed: { xy: 3000, z: 600 },
  kinematics: LOWRIDER_V4_KINEMATICS,
  controller: {
    source: 'V1E-Standard-config.yaml (Jackpot V2 TMC2226, LowRider)',
    softLimits: false,
    toolChangeHandled: false,
    useLineNumbers: false,
    mustHome: false,
    spindleControlled: false,
  },
  hasRotary: false,
  // Values of the WebUI probe tab on this machine; plate thickness must be measured.
  probe: { plateThickness: 0.5, maxTravel: 40, feed: 100, retract: 10 },
};

/** The part of the profile the operator edits or imports and the browser remembers. */
export type ProfileSettings = Pick<MachineProfile, 'travel' | 'softLimits' | 'jogFeed'> &
  Partial<Pick<MachineProfile, 'kinematics' | 'controller' | 'probe'>>;

/** Probe values must be positive numbers (plate thickness may be 0). */
export function parseProbe(value: unknown): ProbeSettings | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Partial<ProbeSettings>;
  const ok = (n: unknown, min: number) => isNumber(n) && n >= min;
  if (!ok(p.plateThickness, 0) || !ok(p.maxTravel, 0.1) || !ok(p.feed, 1) || !ok(p.retract, 0)) {
    return null;
  }
  return {
    plateThickness: p.plateThickness!,
    maxTravel: p.maxTravel!,
    feed: p.feed!,
    retract: p.retract!,
  };
}

const STORAGE_KEY = 'lowrider-control.profile';

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const positive = (v: unknown): v is number => isNumber(v) && v > 0;

/** Rates and accelerations of the axes (x, y, z at least) and the planner's two numbers. */
export function parseKinematics(value: unknown): Kinematics | null {
  if (typeof value !== 'object' || value === null) return null;
  const k = value as Partial<Kinematics>;
  const axes = k.axes as Record<string, unknown> | undefined;
  if (typeof axes !== 'object' || axes === null) return null;
  for (const [name, limits] of Object.entries(axes)) {
    const a = limits as Partial<{ maxRate: unknown; acceleration: unknown }> | null;
    if (!['x', 'y', 'z', 'a'].includes(name)) return null;
    if (typeof a !== 'object' || a === null || !positive(a.maxRate) || !positive(a.acceleration)) {
      return null;
    }
  }
  if (!axes.x || !axes.y || !axes.z) return null;
  if (!isNumber(k.junctionDeviation) || k.junctionDeviation < 0) return null;
  if (!positive(k.arcTolerance)) return null;
  for (const seconds of [k.toolChangeSeconds, k.pauseSeconds, k.spindleSeconds]) {
    if (seconds !== undefined && !(isNumber(seconds) && seconds >= 0)) return null;
  }
  // The planner reads every axis; the rotary one the controller does not report keeps the stock values
  return {
    ...k,
    axes: { ...LOWRIDER_V4_KINEMATICS.axes, ...(axes as Kinematics['axes']) },
  } as Kinematics;
}

/** What the controller does on its own, as a config import reads it. */
export function parseController(value: unknown): ControllerInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Partial<ControllerInfo>;
  const flags = [
    c.softLimits,
    c.toolChangeHandled,
    c.useLineNumbers,
    c.mustHome,
    c.spindleControlled,
  ];
  if (typeof c.source !== 'string' || !flags.every((f) => typeof f === 'boolean')) return null;
  return c as ControllerInfo;
}

/** Validates stored or entered settings; returns null if anything is off. */
export function parseSettings(value: unknown): ProfileSettings | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<ProfileSettings>;
  const travel = v.travel;
  if (!travel) return null;
  for (const axis of ['x', 'y', 'z'] as const) {
    const r = travel[axis];
    if (!r || !isNumber(r.min) || !isNumber(r.max) || r.min >= r.max) return null;
  }
  if (typeof v.softLimits !== 'boolean') return null;
  if (!v.jogFeed || !isNumber(v.jogFeed.xy) || !isNumber(v.jogFeed.z)) return null;
  if (v.jogFeed.xy <= 0 || v.jogFeed.z <= 0) return null;
  const settings: ProfileSettings = { travel, softLimits: v.softLimits, jogFeed: v.jogFeed };
  // What a config import made: these values drive the time estimate and the checks, so they must be what one is
  if (v.kinematics !== undefined && v.kinematics !== null) {
    const kinematics = parseKinematics(v.kinematics);
    if (!kinematics) return null;
    settings.kinematics = kinematics;
  }
  if (v.controller !== undefined && v.controller !== null) {
    const controller = parseController(v.controller);
    if (!controller) return null;
    settings.controller = controller;
  }
  const probe = parseProbe(v.probe);
  if (probe) settings.probe = probe;
  return settings;
}

export function loadProfile(storage: Pick<Storage, 'getItem'> | undefined): MachineProfile {
  try {
    const settings = parseSettings(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null'));
    if (settings) return { ...LOWRIDER_V4_PROFILE, ...settings, placeholder: false };
  } catch {
    // unreadable storage → defaults
  }
  return LOWRIDER_V4_PROFILE;
}

/** Forgets the stored values: the next start has the placeholder profile again. */
export function clearProfile(storage: Pick<Storage, 'setItem'> | undefined) {
  try {
    storage?.setItem(STORAGE_KEY, 'null');
  } catch {
    // storage may be unavailable (private mode)
  }
}

export function saveProfile(
  storage: Pick<Storage, 'setItem'> | undefined,
  settings: ProfileSettings,
) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage may be unavailable (private mode); the profile still applies until reload
  }
}

/**
 * Profile values from a FluidNC config: travel (FluidNC soft-limit range),
 * speeds and accelerations, and what the controller does on its own. The
 * operator's jog feed and soft-limit switch stay as they are.
 */
export function settingsFromConfig(
  config: MachineConfig,
  current: MachineProfile,
): ProfileSettings | null {
  const { x, y, z } = config.axes;
  if (!x || !y || !z) return null;
  const axis = (a: typeof x) => ({ maxRate: a.maxRate, acceleration: a.acceleration });
  return {
    travel: { x: axisTravel(x), y: axisTravel(y), z: axisTravel(z) },
    softLimits: current.softLimits,
    jogFeed: current.jogFeed,
    kinematics: {
      ...current.kinematics,
      axes: { ...current.kinematics.axes, x: axis(x), y: axis(y), z: axis(z) },
      junctionDeviation: config.junctionDeviation,
      arcTolerance: config.arcTolerance,
    },
    controller: {
      source: [config.board, config.name].filter(Boolean).join(', ') || 'config.yaml',
      softLimits: x.softLimits && y.softLimits && z.softLimits,
      toolChangeHandled: config.toolChangeHandled,
      useLineNumbers: config.useLineNumbers,
      mustHome: config.mustHome,
      spindleControlled: config.spindleControlled,
    },
  };
}
