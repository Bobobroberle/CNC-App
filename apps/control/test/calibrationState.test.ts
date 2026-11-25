import { beforeEach, describe, expect, it } from 'vitest';
import { PLATE_DEFAULT } from '../src/lib/calibrationPlate';
import { LOWRIDER_V4_PROFILE } from '../src/lib/profile';
import { insane } from '../src/lib/stateSync';
import { useJob } from '../src/store/job';
import { SLICES, syncOnce, type Deps, type Meta } from '../src/store/stateSync';
import '../src/store/underway';
import {
  DEFAULT_SETTINGS,
  normalizeCalibration,
  useWorkshop,
  validateSettings,
} from '../src/store/workshop';

const settings = SLICES.find((s) => s.key === 'settings')!;
const d = DEFAULT_SETTINGS.calibration;

/** What an app from before the plate was known kept: no pitch, no dots, no dot diameter – and `precise` on. */
const { pitch: _p, dots: _d, dotDiameter: _dd, ...before } = d;
const oldCalibration = { ...before, precise: true, points: 5, spanX: 100, spanY: 100 };

describe('the plate of the calibration in the settings', () => {
  it('is the printed plate of docs/kalibriertafel.svg by default – and its field is the outer dots', () => {
    expect(d).toMatchObject({ ...PLATE_DEFAULT, spanX: 180, spanY: 180, points: 3 });
    // a printed plate is trusted for its angle only
    expect(d.precise).toBe(false);
    expect(insane(DEFAULT_SETTINGS)).toBeNull();
  });

  it('is filled in for a state from before it – which also loses "precise", once', () => {
    const state = normalizeCalibration(oldCalibration);
    expect(state).toMatchObject({ ...PLATE_DEFAULT, precise: false, points: 5, spanX: 100 });
    // what the operator switches on afterwards stays (the state has the plate now)
    expect(normalizeCalibration({ ...state, precise: true }).precise).toBe(true);
    expect(normalizeCalibration({ ...state, precise: false }).precise).toBe(false);
    // a state that was written with the plate keeps what it says – 3.2 mm dots, 12.5 mm pitch
    expect(
      normalizeCalibration({ ...d, precise: true, pitch: 12.5, dots: 25, dotDiameter: 3.2 }),
    ).toMatchObject({ precise: true, pitch: 12.5, dots: 25, dotDiameter: 3.2 });
  });

  it('is the default where there was no calibration, or it is no object', () => {
    for (const nothing of [undefined, null, 'x', 5, [], [1, 2]]) {
      expect(normalizeCalibration(nothing), JSON.stringify(nothing)).toEqual(d);
    }
    expect(validateSettings({})?.calibration).toEqual(d);
  });

  it('puts back, in this device’s own storage, what is out of range or no number', () => {
    const garbage = normalizeCalibration({
      ...d,
      pitch: -3,
      dots: 1.5,
      dotDiameter: 'x',
      spanX: 0,
      spanY: Number.NaN,
      points: 1000,
    });
    expect(garbage).toMatchObject({ ...PLATE_DEFAULT, spanX: 180, spanY: 180, points: 3 });
    // a lone `precise` that is no switch is the default
    expect(normalizeCalibration({ ...d, precise: 'yes' }).precise).toBe(false);
    // the limits themselves are fine
    expect(normalizeCalibration({ ...d, points: 8, dots: 100, pitch: 1000 })).toMatchObject({
      points: 8,
      dots: 100,
      pitch: 1000,
    });
    expect(normalizeCalibration({ ...d, points: 9 }).points).toBe(3);
    expect(normalizeCalibration({ ...d, dots: 1 }).dots).toBe(19);
  });

  it('is not healed for a document from the Pi: only what it lacks is filled, the rest is for insane() to refuse', () => {
    const filled = normalizeCalibration(oldCalibration, false);
    expect(filled).toMatchObject({ ...PLATE_DEFAULT, precise: false, points: 5 });
    const bad = normalizeCalibration({ ...d, pitch: -3, points: 1000 }, false);
    expect(bad).toMatchObject({ pitch: -3, points: 1000 });
    expect(insane({ ...DEFAULT_SETTINGS, calibration: bad })).toBe('calibration');
  });

  it('is held by insane() to the ranges the card takes – and not to a rule across fields', () => {
    const sane = (patch: Partial<typeof d>) =>
      insane({ ...DEFAULT_SETTINGS, calibration: { ...d, ...patch } });
    expect(sane({ pitch: 1000, dots: 100, dotDiameter: 100, points: 8 })).toBeNull();
    // a field that is no multiple of the pitch is a warning on the card, never a refusal
    expect(sane({ spanX: 185, points: 5 })).toBeNull();
    expect(sane({ spanX: 500 })).toBeNull();
    for (const bad of [
      { pitch: 0 },
      { pitch: 1001 },
      { pitch: Number.NaN },
      { dots: 1 },
      { dots: 101 },
      { dots: 3.5 },
      { dotDiameter: 0 },
      { dotDiameter: 101 },
      { dotDiameter: -1 },
      { points: 9 },
    ]) {
      expect(sane(bad), JSON.stringify(bad)).toBe('calibration');
    }
  });
});

describe('a Pi document from before the plate', () => {
  const oldDoc = () => ({ ...settings.read(), calibration: oldCalibration });
  const round = async (remote: unknown, rev: number, base: Record<string, unknown>) => {
    const puts: Record<string, unknown>[] = [];
    const deps: Deps = {
      client: () => ({
        state: async () => ({ keys: { settings: { rev, data: remote as never } } }),
        putState: async (_k, _r, data) => {
          puts.push(data as Record<string, unknown>);
          return { ok: true, rev: rev + 1 };
        },
      }),
      slices: [settings],
      meta: { get: () => ({ rev: rev - 1, base }), set: () => {} },
      safeToApply: () => true,
      simulator: () => false,
      say: () => {},
      name: (_s, k) => k,
    };
    const outcome = await syncOnce(deps);
    return { outcome, puts };
  };
  beforeEach(() => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
  });

  it('is accepted, and taken as the defaults of the plate with "precise" off', () => {
    expect(settings.accepts(oldDoc())).toBe(true);
    settings.apply(oldDoc());
    expect(useWorkshop.getState().settings.calibration).toMatchObject({
      ...PLATE_DEFAULT,
      precise: false,
      points: 5,
      spanX: 100,
      spanY: 100,
    });
  });

  it('is written back once by a device that loaded the same old state, and then left quiet', async () => {
    // this device read its own old storage: the same one the Pi has
    useWorkshop.setState({
      settings: validateSettings({ ...DEFAULT_SETTINGS, calibration: oldCalibration })!,
    });
    expect(useWorkshop.getState().settings.calibration.precise).toBe(false);
    const old = oldDoc();
    const first = await round(old, 3, old);
    expect(first.outcome).toBe('ok');
    expect(first.puts).toHaveLength(1);
    expect(first.puts[0]!.calibration).toMatchObject({
      ...PLATE_DEFAULT,
      precise: false,
      points: 5,
    });
    // the Pi now holds it: nothing more to say, in this round and the next
    const written = first.puts[0]!;
    for (const rev of [4, 5]) {
      const next = await round(written, rev, written);
      expect(next.outcome).toBe('ok');
      expect(next.puts).toEqual([]);
    }
    // and the operator's own switch afterwards is one write, not a flip back
    useWorkshop.getState().setSettings({
      calibration: { ...useWorkshop.getState().settings.calibration, precise: true },
    });
    const on = await round(written, 6, written);
    expect(on.puts).toHaveLength(1);
    expect((on.puts[0]!.calibration as { precise: boolean }).precise).toBe(true);
    const after = await round(on.puts[0]!, 7, on.puts[0]!);
    expect(after.puts).toEqual([]);
    expect(useWorkshop.getState().settings.calibration.precise).toBe(true);
  });

  it('refuses a document whose plate numbers are out of range – and does not heal them into the defaults', async () => {
    const bad = { ...settings.read(), calibration: { ...d, pitch: -1 } };
    expect(settings.accepts(bad)).toBe(false);
    const outcome = await round(bad, 3, settings.read());
    expect(outcome.outcome).toBe('refused');
    expect(outcome.puts).toEqual([]);
    expect(useWorkshop.getState().settings.calibration.pitch).toBe(10);
  });
});

describe('devices that come to the new version at different times', () => {
  type Doc = Record<string, unknown>;
  const plated = {
    ...d,
    precise: true,
    pitch: 12.5,
    dots: 25,
    dotDiameter: 3.2,
    spanX: 300,
    spanY: 300,
  };
  /** A Pi that keeps what it is given, a note of what this device knew, and this device's own state */
  function world(pi: Doc | null, rev: number, kept: Meta | undefined) {
    const server = { rev, data: pi };
    const notes = new Map<string, Meta>();
    if (kept) notes.set('settings', kept);
    const puts: Doc[] = [];
    const deps: Deps = {
      client: () => ({
        state: async () => ({
          keys: server.data
            ? { settings: { rev: server.rev, data: server.data as never } }
            : ({} as Record<string, never>),
        }),
        putState: async (_k, _baseRev, data) => {
          puts.push(data as Doc);
          server.rev += 1;
          server.data = data as Doc;
          return { ok: true, rev: server.rev };
        },
      }),
      slices: [settings],
      meta: { get: (k) => notes.get(k), set: (k, m) => void notes.set(k, m) },
      safeToApply: () => true,
      simulator: () => false,
      say: () => {},
      name: (_s, k) => k,
    };
    return { server, notes, puts, round: () => syncOnce(deps) };
  }
  beforeEach(() => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
  });

  it('does not take back what the operator switched on at the Pi meanwhile: the flip is no edit of this device', async () => {
    // this device was away: its note and its storage are from before the plate (precise on there, flipped on load)
    const oldDoc: Doc = { ...settings.read(), calibration: oldCalibration };
    useWorkshop.setState({
      settings: validateSettings({ ...DEFAULT_SETTINGS, calibration: oldCalibration })!,
    });
    expect(useWorkshop.getState().settings.calibration.precise).toBe(false);
    // another device updated first, flipped, and the operator switched "Präzisionsplatte" on again for a measured plate
    const onPi: Doc = {
      ...settings.read(),
      calibration: { ...oldCalibration, pitch: 10, dots: 19, dotDiameter: 3, precise: true },
    };
    const w = world(onPi, 5, { rev: 3, base: oldDoc });
    expect(await w.round()).toBe('ok');
    // nothing of this device's is sent over it, and the Pi's choice is what this device has now
    expect(w.puts).toEqual([]);
    expect((w.server.data!.calibration as { precise: boolean }).precise).toBe(true);
    expect(useWorkshop.getState().settings.calibration.precise).toBe(true);
    // and the next rounds are quiet
    expect(await w.round()).toBe('ok');
    expect(w.puts).toEqual([]);
  });

  it('keeps a plate of its own when it first meets a Pi document from before the plate', async () => {
    useWorkshop.setState({
      settings: { ...DEFAULT_SETTINGS, calibration: { ...d, ...plated } },
    });
    const w = world({ ...settings.read(), calibration: oldCalibration }, 4, undefined);
    expect(await w.round()).toBe('ok');
    expect(useWorkshop.getState().settings.calibration).toMatchObject({
      pitch: 12.5,
      dots: 25,
      dotDiameter: 3.2,
      precise: true,
    });
    // the Pi has it now, and is quiet afterwards
    expect(w.server.data!.calibration).toMatchObject({ pitch: 12.5, dots: 25, dotDiameter: 3.2 });
    const puts = w.puts.length;
    expect(await w.round()).toBe('ok');
    expect(w.puts.length).toBe(puts);
  });

  it('writes the flip of an old state once, and then settles – also from a note that is from the old version', async () => {
    useWorkshop.setState({
      settings: validateSettings({ ...DEFAULT_SETTINGS, calibration: oldCalibration })!,
    });
    const oldDoc: Doc = { ...settings.read(), calibration: oldCalibration };
    const w = world(oldDoc, 3, { rev: 3, base: oldDoc });
    expect(await w.round()).toBe('ok');
    expect(w.puts).toHaveLength(1);
    expect(w.puts[0]!.calibration).toMatchObject({ ...PLATE_DEFAULT, precise: false, points: 5 });
    for (let i = 0; i < 3; i++) expect(await w.round()).toBe('ok');
    expect(w.puts).toHaveLength(1);
  });
});
