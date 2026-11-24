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
import { canonical } from '../lib/stateSync';
import { simulatorActive } from './simulated';
import { companion } from './workshop';

const KEY = 'lowrider-control.measurements';

/** Measurements of one kind with the very same numbers within this time are one (a button tapped twice). */
const SAME_MEASUREMENT_MS = 60_000;
/** A Pi that stops answering half-way must not hold a round up for ever. */
const EXCHANGE_TIMEOUT = 10_000;

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
    // The same numbers of the same kind a moment ago are that measurement: a button tapped twice records it once
    const now = Date.now();
    const again = get().list.findLast(
      (m) =>
        m.kind === kind &&
        now - Date.parse(m.at) < SAME_MEASUREMENT_MS &&
        canonical(m.values) === canonical(values),
    );
    if (again) return again;
    const entry = newMeasurement(kind, values, new Set(get().list.map((m) => m.id)));
    const list = mergeMeasurements(get().list, [entry]);
    set({ list });
    saveJson(browserStorage, KEY, list);
    // Fire and forget: what the Pi missed is sent with the next exchange
    void companion()
      ?.put('measurements', entry, EXCHANGE_TIMEOUT)
      .catch(() => {
        exchange.due = true;
      });
    return entry;
  },
  adopt(entries) {
    const list = mergeMeasurements(get().list, entries);
    set({ list });
    saveJson(browserStorage, KEY, list);
  },
}));

/**
 * When the log is exchanged: at the first round, when an entry did not reach the Pi, and every ten minutes
 * – not at every round of the state, which asks the Pi every 30 s (the whole log would be read each time).
 */
const EXCHANGE_EVERY = 10 * 60_000;
const exchange = { due: true, at: 0 };

/** Forgets when the log was last exchanged: the next round does it (tests, a changed Pi). */
export function resetMeasurementExchange(): void {
  exchange.due = true;
  exchange.at = 0;
}

/** The exchange of a round: only when it is due. `skipped`: it was not; `failed`: the Pi did not take part. */
export async function syncMeasurementsDue(
  client: Pick<CompanionClient, 'list' | 'putAll'>,
  now = Date.now(),
): Promise<'done' | 'skipped' | 'failed'> {
  if (!exchange.due && now - exchange.at < EXCHANGE_EVERY) return 'skipped';
  if (!(await syncMeasurements(client))) return 'failed';
  exchange.due = false;
  exchange.at = now;
  return 'done';
}

/**
 * What the entries of the Pi and of this device lack of each other goes the other way. What the Pi lacks is
 * sent first: only when it is there are the Pi's entries taken in, so that nothing of this device is pushed
 * out of its bounded list before the Pi has it. Returns whether it came through.
 */
export async function syncMeasurements(
  client: Pick<CompanionClient, 'list' | 'putAll'>,
): Promise<boolean> {
  try {
    const remote = (await client.list<unknown>('measurements', EXCHANGE_TIMEOUT))
      .map(validMeasurement)
      .filter((m): m is Measurement => m !== null);
    const have = new Set(remote.map((m) => m.id));
    const lacking = useMeasurements.getState().list.filter((m) => !have.has(m.id));
    if (lacking.length > 0) await client.putAll('measurements', lacking, EXCHANGE_TIMEOUT);
    useMeasurements.getState().adopt(remote);
    return true;
  } catch {
    return false;
  }
}
