import { readMachineConfig, setConfigValues, settingCommand } from '@lowrider/fluidnc-client';
import { create } from 'zustand';
import { t, type MessageKey } from '../i18n';
import { isRelayUrl, hostOf } from '../lib/link';
import { toWebSocketUrl } from '../lib/address';
import {
  limitsFromConfig,
  settingNumber,
  settingValue,
  type LimitChange,
  type Limits,
} from '../lib/limits';
import { isSimulatorAddress } from '../sim';
import { useJob } from './job';
import { useMachine } from './machine';
import { useMeasurements } from './measurements';
import { useWorkshop } from './workshop';

/**
 * FluidNC's limits per axis, read from the running controller and written to
 * it (Einstellungen → Maschine → "Grenzen der Steuerung").
 *
 * Writing (all verified against FluidNC v3.9.1's sources):
 * 1. `$/axes/<a>/max_rate_mm_per_min=<v>` changes the running value; FluidNC
 *    validates it (ProcessSettings.cpp → RuntimeSetting) and its planner uses
 *    it for every following move (NutsBolts.cpp `limit_rate_by_axis_maximum`).
 * 2. Each value is read back (`$/axes/<a>/max_rate_mm_per_min`).
 * 3. Kept beyond a restart only where config.yaml can be read byte for byte
 *    (through the companion, which fetches FluidNC's `/<file>`): the old file
 *    goes to `<file>.bak`, the new one with only the touched keys changed goes
 *    in its place – both over FluidNC's HTTP upload (`/files`), each read back
 *    and compared. Otherwise the change holds until the next restart, and the
 *    card says so.
 */

export type SaveResult = 'saved' | 'runtime' | 'notPossible' | 'failed';

export interface LimitsResult {
  at: number;
  values: { change: LimitChange; read: number | null; ok: boolean }[];
  saved: SaveResult;
  backup: string | null;
}

interface LimitsStore {
  current: Limits | null;
  phase: 'idle' | 'reading' | 'writing';
  result: LimitsResult | null;
  /** Why the last write did not happen or went wrong (a message key) */
  error: MessageKey | null;
  read(): Promise<boolean>;
  write(changes: readonly LimitChange[], persist: boolean): Promise<boolean>;
}

/**
 * Whether config.yaml can be read byte for byte, so that a change can be kept:
 * through the companion that relays to this very FluidNC, or the simulator.
 */
export function canKeepLimits(
  url = useMachine.getState().url,
  advertised = useWorkshop.getState().companionHealth?.fluidnc?.url,
): boolean {
  if (isSimulatorAddress(url)) return true;
  const ws = toWebSocketUrl(url) ?? '';
  if (!advertised) return false;
  return isRelayUrl(ws) || hostOf(advertised) === hostOf(ws);
}

/**
 * Running config ($CD) → the limits, and the profile's speeds (job time, the
 * jog cap). Only the speeds: the travel the operator set stays as it is.
 */
async function readRunning(): Promise<Limits | null> {
  const yaml = await useMachine.getState().readConfig();
  if (yaml === null) return null;
  const limits = limitsFromConfig(readMachineConfig(yaml));
  if (!limits) return null;
  const { profile, setProfileSettings } = useJob.getState();
  const kinematics = {
    ...profile.kinematics,
    axes: { ...profile.kinematics.axes, ...limits },
  };
  if (profile.placeholder) {
    // Nothing of the operator's is stored yet: shown, not saved as a profile.
    useJob.setState({ profile: { ...profile, kinematics } });
  } else {
    const { travel, softLimits, jogFeed, controller, probe } = profile;
    setProfileSettings({ travel, softLimits, jogFeed, controller, probe, kinematics });
  }
  return limits;
}

export const useLimits = create<LimitsStore>((set, get) => ({
  current: null,
  phase: 'idle',
  result: null,
  error: null,

  async read() {
    if (get().phase !== 'idle') return false;
    set({ phase: 'reading', error: null });
    const limits = await readRunning();
    set({ phase: 'idle', ...(limits ? { current: limits } : { error: 'limits.readFailed' }) });
    return limits !== null;
  },

  async write(changes, persist) {
    const machine = useMachine.getState();
    if (get().phase !== 'idle' || changes.length === 0) return false;
    // Only at rest: never while something moves, never in an alarm.
    if (machine.connection !== 'connected' || machine.status?.state !== 'Idle') {
      set({ error: 'limits.notIdle' });
      return false;
    }
    set({ phase: 'writing', error: null, result: null });
    const fail = (error: MessageKey, params?: Record<string, string>) => {
      machine.addLog('error', t(error, params), error);
      set({ phase: 'idle', error });
      return false;
    };
    for (const c of changes) {
      if (!(await machine.command(settingCommand(c.path, settingNumber(c.to))))) {
        // Whatever went through before stays; reading it back shows the truth.
        await readRunning().then((limits) => limits && set({ current: limits }));
        return fail('limits.refused', { item: c.path });
      }
    }
    const values: LimitsResult['values'] = [];
    for (const c of changes) {
      const read = settingValue((await machine.query(`$/${c.path}`)) ?? [], c.path);
      values.push({ change: c, read, ok: read !== null && Math.abs(read - c.to) < 0.01 });
    }
    const current = await readRunning();
    let saved: SaveResult = 'runtime';
    let backup: string | null = null;
    if (persist && values.every((v) => v.ok)) {
      const name =
        (await machine.query('$Config/Filename'))
          ?.find((l) => l.startsWith('$Config/Filename='))
          ?.split('=')[1]
          ?.trim() || 'config.yaml';
      const original = await machine.readFlashFile(name);
      if (original === null) saved = 'notPossible';
      else {
        const edited = setConfigValues(
          original,
          changes.map((c) => ({ path: c.path, value: settingNumber(c.to) })),
        );
        backup = await machine.uploadConfigFile(name, edited, original, `${name}.bak`);
        saved = backup ? 'saved' : 'failed';
      }
    }
    set({
      phase: 'idle',
      ...(current ? { current } : {}),
      result: { at: Date.now(), values, saved, backup },
    });
    if (!values.every((v) => v.ok)) return fail('limits.unconfirmed');
    // What the controller now runs with – and, where saved, keeps: what was there, what was written
    useMeasurements.getState().record(
      'correction',
      Object.fromEntries(
        changes.flatMap((c) => [
          [`${c.path}.from`, c.from],
          [`${c.path}.to`, c.to],
        ]),
      ),
    );
    machine.addLog(
      'info',
      t(saved === 'saved' ? 'limits.writtenSaved' : 'limits.writtenRuntime'),
      'limits.written',
    );
    return true;
  },
}));
