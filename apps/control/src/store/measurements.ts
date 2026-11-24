import { create } from 'zustand';
import type { CompanionClient } from '../lib/companion';
import {
  mergeMeasurements,
  newMeasurement,
  validMeasurement,
  type Measurement,
  type MeasurementKind,
  type MeasurementValue,
} from '../lib/measurements';
import { browserStorage, listOf, loadJson, saveJson } from '../lib/persist';
import { simulatorActive } from './simulated';
import { companion } from './workshop';

const KEY = 'lowrider-control.measurements';

interface MeasurementStore {
  /** Oldest first */
  list: Measurement[];
  /** Writes one down: here and – while a companion answers – on the Pi */
  record(kind: MeasurementKind, values: Record<string, MeasurementValue>): Measurement | null;
  /** Takes entries that came from the Pi (not sent back) */
  adopt(entries: readonly Measurement[]): void;
}

export const useMeasurements = create<MeasurementStore>((set, get) => ({
  list: loadJson(browserStorage, KEY, listOf(validMeasurement), []),
  record(kind, values) {
    // A simulated machine measures nothing of the real one: no entry, here or on the Pi
    if (simulatorActive()) return null;
    const entry = newMeasurement(kind, values, new Set(get().list.map((m) => m.id)));
    const list = mergeMeasurements(get().list, [entry]);
    set({ list });
    saveJson(browserStorage, KEY, list);
    // Fire and forget: what the Pi missed is sent with the next exchange
    void companion()
      ?.put('measurements', entry)
      .catch(() => {});
    return entry;
  },
  adopt(entries) {
    const list = mergeMeasurements(get().list, entries);
    set({ list });
    saveJson(browserStorage, KEY, list);
  },
}));

/** What the entries of the Pi and of this device lack of each other goes the other way. Returns whether it came through. */
export async function syncMeasurements(
  client: Pick<CompanionClient, 'list' | 'putAll'>,
): Promise<boolean> {
  try {
    const remote = (await client.list<unknown>('measurements'))
      .map(validMeasurement)
      .filter((m): m is Measurement => m !== null);
    const have = new Set(remote.map((m) => m.id));
    const lacking = useMeasurements.getState().list.filter((m) => !have.has(m.id));
    useMeasurements.getState().adopt(remote);
    if (lacking.length > 0) await client.putAll('measurements', lacking);
    return true;
  } catch {
    return false;
  }
}
