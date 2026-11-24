import { DEFAULT_MACROS, parseMacros } from '../lib/macros';
import { parseSettings, type MachineProfile } from '../lib/profile';
import { insane, syncedSettings, withSynced, type Doc } from '../lib/stateSync';
import type { Slice } from './stateSync';
import { useJob } from './job';
import { useMacros } from './macros';
import { DEFAULT_SETTINGS, useWorkshop, validateSettings, validateSetup } from './workshop';

/**
 * The documents the app keeps on the Pi, each as a `Slice`: what is read from the app, whether a
 * document from the Pi can be a state of this app at all (it is not trusted), how it is taken in, and
 * how a change of it is noticed. What belongs to a device alone is not in them.
 */

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDoc = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The settings that a document makes, laid over what this device keeps for itself – or null if it cannot be. */
function settingsFrom(doc: Doc) {
  // Only the keys that are settings of this app; the shapes are made by `validateSettings`
  const known = Object.fromEntries(
    Object.entries(doc).filter(([k]) => k in DEFAULT_SETTINGS),
  ) as Doc;
  const next = validateSettings(withSynced(useWorkshop.getState().settings, known));
  return next && insane(next) === null ? next : null;
}

const settingsSlice: Slice = {
  key: 'settings',
  read: () => syncedSettings(useWorkshop.getState().settings),
  defaults: () => syncedSettings(DEFAULT_SETTINGS),
  accepts: (doc) => settingsFrom(doc) !== null,
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
  read: () => ({ z: useWorkshop.getState().toolReferenceZ }),
  defaults: () => ({ z: null }),
  accepts: (doc) => doc.z === null || finite(doc.z),
  apply: (doc) => useWorkshop.getState().setToolReferenceZ(doc.z as number | null),
  subscribe: (listener) =>
    useWorkshop.subscribe((state, before) => {
      if (state.toolReferenceZ !== before.toolReferenceZ) listener();
    }),
};

const macrosSlice: Slice = {
  key: 'macros',
  read: () => ({ list: useMacros.getState().macros }),
  defaults: () => ({ list: DEFAULT_MACROS }),
  accepts: (doc) => parseMacros(doc.list) !== null,
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
        v.factor > 0 &&
        v.factor < 10 &&
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
  read: () => profileDoc(useJob.getState().profile),
  defaults: () => ({}),
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
