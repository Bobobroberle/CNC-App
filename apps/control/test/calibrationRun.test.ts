import type { MachineStatus } from '@lowrider/fluidnc-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOWRIDER_V4_PROFILE } from '../src/lib/profile';
import { gridShortfall, useCalibration } from '../src/store/calibration';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { DEFAULT_SETTINGS, useWorkshop } from '../src/store/workshop';

// The machine reports where it stands; no picture is there, so no marker is ever found
const report = vi.hoisted(() => ({ status: null as unknown }));
vi.mock('../src/store/settle', () => ({
  settled: async () => report.status as MachineStatus | null,
  wait: async () => {},
}));

const status = (mpos: number[]) =>
  ({ state: 'Idle', mpos, wpos: mpos, wco: [0, 0, 0] }) as unknown as MachineStatus;
const lastLog = () => useMachine.getState().log.at(-1);

describe('whether the measuring grid fits the travel', () => {
  const profile = LOWRIDER_V4_PROFILE; // X 3 … 1223, Y 3 … 2443
  it('is asked only where the travel is known: homed, with soft limits', () => {
    expect(gridShortfall({ x: 1100, y: 500 }, true, profile, 180, 180)).toEqual({
      axis: 'x',
      side: 'max',
      short: 66, // 1100 + 180 + 9 (5 % of the field as room) − 1223
    });
    // not homed: the zero is not known – nothing is claimed, no pass and no refusal
    expect(gridShortfall({ x: 1100, y: 500 }, false, profile, 180, 180)).toBeNull();
    expect(
      gridShortfall({ x: 1100, y: 500 }, true, { ...profile, softLimits: false }, 180, 180),
    ).toBeNull();
    expect(gridShortfall({ x: 500, y: 500 }, true, profile, 180, 180)).toBeNull();
  });
});

describe('a measuring run that the travel cannot hold', () => {
  const moves = vi.fn(async () => true);
  beforeEach(() => {
    moves.mockClear();
    useCalibration.setState({ task: null, progress: null, first: null, turned: null });
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
    useMachine.setState({
      connection: 'connected',
      homed: true,
      status: null,
      log: [],
      moveMachine: moves,
    });
  });

  it('is refused before the first move, and the log says where it falls short – not "no marker"', async () => {
    report.status = status([1100, 500, -20]);
    expect(await useCalibration.getState().measureGrid(false)).toBe(false);
    expect(moves).not.toHaveBeenCalled();
    const entry = lastLog()!;
    expect(entry.kind).toBe('error');
    expect(entry.key).toBe('calibration.noRoom');
    expect(entry.text).toContain('Messung nicht gestartet');
    expect(entry.text).toContain('X+: 66 mm');
    expect(useCalibration.getState().task).toBeNull();
    expect(useCalibration.getState().first).toBeNull();
  });

  it('says the lower end too: the approach to the first point comes from below', async () => {
    report.status = status([3.1, 500, -20]);
    await useCalibration.getState().measureGrid(false);
    expect(moves).not.toHaveBeenCalled();
    // 3 − (3.1 − 0.3 − 9)
    expect(lastLog()!.text).toContain('X−: 9,2 mm');
  });

  it('does not keep the reason for the next run: where it fits, the log is the old one again', async () => {
    report.status = status([1100, 500, -20]);
    await useCalibration.getState().measureGrid(false);
    report.status = status([500, 500, -20]);
    expect(await useCalibration.getState().measureGrid(false)).toBe(false);
    expect(lastLog()!.key).toBeUndefined();
    expect(lastLog()!.text).toContain('Keine Marke');
  });

  it('is not judged where the machine is not homed: it goes on to look for the dot', async () => {
    useMachine.setState({ homed: false });
    report.status = status([1100, 500, -20]);
    expect(await useCalibration.getState().measureGrid(false)).toBe(false);
    expect(lastLog()!.text).toContain('Keine Marke');
  });

  it('holds every kind of run to the same lock: a second one is not started while one is under way', async () => {
    useCalibration.setState({ task: 'grid' });
    report.status = status([1100, 500, -20]);
    expect(await useCalibration.getState().measureGrid(false)).toBe(false);
    expect(useMachine.getState().log).toEqual([]);
  });
});
