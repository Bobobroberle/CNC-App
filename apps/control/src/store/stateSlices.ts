import { DEFAULT_MACROS, parseMacros } from '../lib/macros';
import { parseSettings, type MachineProfile } from '../lib/profile';
import { insane, shaped, syncedSettings, withSynced, type Doc } from '../lib/stateSync';
import type { Slice } from './stateSync';
import { useJob } from './job';
import { useMacros } from './macros';
import {
  DEFAULT_SETTINGS,
  normalizeCalibration,
  useWorkshop,
  validateSettings,
  validateSetup,
} from './workshop';

/**
 * The documents the app keeps on the Pi, each as a `Slice`: what is read from the app, whether a
 * document from the Pi can be a state of this app at all (it is not trusted), how it is taken in, and
 * how a change of it is noticed. What belongs to a device alone is not in them.
 */

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDoc = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The keys of the settings document: all the settings, but what belongs to a device alone. */
const SETTINGS_KEYS = Object.keys(syncedSettings(DEFAULT_SETTINGS));

/** What makes a calibration one: without these, a camera is no camera of this machine. */
const CAMERA_CORE = ['offsetX', 'offsetY', 'rotation', 'pxPerMm'] as const;

/** The settings that a document makes, laid over what this device keeps for itself – or null if it cannot be. */
function settingsFrom(doc: Doc) {
  // Only the keys that are settings of this app (own ones – `constructor` is no setting)
  const known = Object.fromEntries(
    Object.entries(doc).filter(
      ([k]) => Object.hasOwn(DEFAULT_SETTINGS, k) && SETTINGS_KEYS.includes(k),
    ),
  ) as Doc;
  // A part of the wrong kind (a camera that is null, a number where a switch is) is no setting of this app
  if (!shaped(known, syncedSettings(DEFAULT_SETTINGS))) return null;
  // A camera without its numbers would be filled with the defaults – and a calibration thrown away
  const camera = known.camera as Doc | undefined;
  if (camera !== undefined && !CAMERA_CORE.every((k) => finite(camera[k]))) return null;
  // Not healed: a calibration value the Pi has out of range is refused below, not replaced by a default
  const next = validateSettings(withSynced(useWorkshop.getState().settings, known), false);
  return next && insane(next, useJob.getState().profile.travel.z) === null ? next : null;
}

const settingsSlice: Slice = {
  key: 'settings',
  keys: SETTINGS_KEYS,
  read: () => syncedSettings(useWorkshop.getState().settings),
  defaults: () => syncedSettings(DEFAULT_SETTINGS),
  accepts: (doc) => settingsFrom(doc) !== null,
  // A calibration from before the plate was known reads as this app reads its own storage (precise off, the
  // plate's defaults) – the base and the Pi's copy first, so that this is no edit of this device's
  upgrade: (doc) =>
    isDoc(doc.calibration)
      ? { ...doc, calibration: normalizeCalibration(doc.calibration, false) }
      : doc,
  apply(doc) {
    const next = settingsFrom(doc);
    if (next) useWorkshop.getState().adoptSettings(next);
  },
  subscribe: (listener) =>
    useWorkshop.subscribe((state, before) => {
      if (state.settings !== before.settings) listener();
    }),
};

/** The clamps on the table: where they are belongs to the machine (the rest of the setup is the job's). */
const clampsSlice: Slice = {
  key: 'clamps',
  keys: ['fixtures', 'fixtureFrame'],
  read: () => {
    const { fixtures, fixtureFrame } = useWorkshop.getState().setup;
    return { fixtures, fixtureFrame };
  },
  defaults: () => ({ fixtures: [], fixtureFrame: 'machine' }),
  accepts: (doc) => {
    if (
      !Array.isArray(doc.fixtures) ||
      !(doc.fixtureFrame === 'machine' || doc.fixtureFrame === 'work')
    ) {
      return false;
    }
    // A clamp is a box with a name (and perhaps a round footprint): all its corners are numbers, min below max
    const point = (v: unknown) => isDoc(v) && finite(v.x) && finite(v.y) && finite(v.z);
    return doc.fixtures.every((f) => {
      if (!isDoc(f) || typeof f.name !== 'string' || !point(f.min) || !point(f.max)) return false;
      const min = f.min as { x: number; y: number; z: number };
      const max = f.max as { x: number; y: number; z: number };
      return (
        min.x <= max.x &&
        min.y <= max.y &&
        min.z <= max.z &&
        (f.round === undefined || typeof f.round === 'boolean')
      );
    });
  },
  apply(doc) {
    const setup = validateSetup({ fixtures: doc.fixtures, fixtureFrame: doc.fixtureFrame });
    if (setup)
      useWorkshop
        .getState()
        .setSetup({ fixtures: setup.fixtures, fixtureFrame: setup.fixtureFrame });
  },
  subscribe: (listener) =>
    useWorkshop.subscribe((state, before) => {
      if (
        state.setup.fixtures !== before.setup.fixtures ||
        state.setup.fixtureFrame !== before.setup.fixtureFrame
      ) {
        listener();
      }
    }),
};

/** Z of the reference tool, from which the tool lengths are counted. */
const toolReferenceSlice: Slice = {
  key: 'toolReference',
  keys: ['z'],
  read: () => ({ z: useWorkshop.getState().toolReferenceZ }),
  defaults: () => ({ z: null }),
  // Machine Z where the reference tool touched: a length of the machine
  accepts: (doc) => doc.z === null || (finite(doc.z) && Math.abs(doc.z) <= 10_000),
  apply: (doc) => useWorkshop.getState().setToolReferenceZ(doc.z as number | null),
  subscribe: (listener) =>
    useWorkshop.subscribe((state, before) => {
      if (state.toolReferenceZ !== before.toolReferenceZ) listener();
    }),
};

const macrosSlice: Slice = {
  key: 'macros',
  keys: ['list'],
  read: () => ({ list: useMacros.getState().macros }),
  defaults: () => ({ list: DEFAULT_MACROS }),
  accepts: (doc) => parseMacros(doc.list) !== null,
  // Text that runs on the machine behind a name: what came from the Pi is said, so it is looked at first
  announce(before, after) {
    const now = parseMacros(after.list) ?? [];
    const had = parseMacros(before.list) ?? [];
    const changed = now.filter((m) => !had.some((h) => h.name === m.name && h.gcode === m.gcode));
    return changed.length === 0
      ? null
      : { key: 'sync.macrosFromPi', params: { list: changed.map((m) => m.name).join(', ') } };
  },
  apply(doc) {
    const list = parseMacros(doc.list);
    if (list) useMacros.getState().setMacros(list);
  },
  subscribe: (listener) =>
    useMacros.subscribe((state, before) => {
      if (state.macros !== before.macros) listener();
    }),
};

/** What was learned about each tool and material: the correction of the feed per pair. */
const learningSlice: Slice = {
  key: 'learning',
  read: () => ({ ...useWorkshop.getState().learning }),
  defaults: () => ({}),
  accepts: (doc) =>
    Object.values(doc).every(
      (v) =>
        isDoc(v) &&
        finite(v.factor) &&
        // The correction of the feed is held between 0.5 and 1.5 where it is learned (packages/workshop cutting.ts)
        v.factor >= 0.5 &&
        v.factor <= 1.5 &&
        Number.isInteger(v.jobs) &&
        (v.jobs as number) >= 0,
    ),
  apply: (doc) => useWorkshop.getState().adoptLearning(doc as never),
  subscribe: (listener) =>
    useWorkshop.subscribe((state, before) => {
      if (state.learning !== before.learning) listener();
    }),
};

/** The values of the machine the operator entered or read from the controller (travel, speeds, probe). */
export function profileDoc(profile: MachineProfile): Doc {
  if (profile.placeholder) return {};
  const { travel, softLimits, jogFeed, kinematics, controller, probe } = profile;
  return { travel, softLimits, jogFeed, kinematics, controller, probe };
}

const profileSlice: Slice = {
  key: 'profile',
  keys: ['travel', 'softLimits', 'jogFeed', 'kinematics', 'controller', 'probe'],
  read: () => profileDoc(useJob.getState().profile),
  defaults: () => ({}),
  // A session at the simulator may have described a machine that is none: where there was none, there is none again
  restore(doc) {
    if (Object.keys(doc).length === 0) useJob.getState().resetProfile();
    else this.apply(doc);
  },
  // An empty document is a Pi that has none of it; otherwise it must be what a profile of a machine is
  accepts: (doc) => Object.keys(doc).length === 0 || parseSettings(doc) !== null,
  apply(doc) {
    const settings = Object.keys(doc).length === 0 ? null : parseSettings(doc);
    if (settings) useJob.getState().setProfileSettings(settings);
  },
  subscribe: (listener) =>
    useJob.subscribe((state, before) => {
      if (state.profile !== before.profile) listener();
    }),
};

export const SLICES: readonly Slice[] = [
  settingsSlice,
  clampsSlice,
  toolReferenceSlice,
  macrosSlice,
  learningSlice,
  profileSlice,
];
