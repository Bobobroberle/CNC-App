import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  checkDraft,
  effectiveFeed,
  limitPath,
  limitsFromConfig,
  settingNumber,
  settingValue,
  smallStepUp,
  toDraft,
  type Limits,
} from '../src/lib/limits';
import { readMachineConfig } from '@lowrider/fluidnc-client';
import { simulator } from '../src/sim';
import { useJob } from '../src/store/job';
import { canKeepLimits, useLimits } from '../src/store/limits';
import { useMachine } from '../src/store/machine';

const STOCK: Limits = {
  x: { maxRate: 9000, acceleration: 200 },
  y: { maxRate: 9000, acceleration: 200 },
  z: { maxRate: 1200, acceleration: 80 },
};

describe('FluidNC limits (pure)', () => {
  it('reads them from a config and makes a draft of them', () => {
    const config = readMachineConfig(
      'axes:\n  x:\n    max_rate_mm_per_min: 9000\n  y:\n    acceleration_mm_per_sec2: 150\n  z:\n    max_rate_mm_per_min: 1200',
    );
    // FluidNC's defaults where a key is missing (Axis.h): 1000 mm/min, 25 mm/s².
    expect(limitsFromConfig(config)).toEqual({
      x: { maxRate: 9000, acceleration: 25 },
      y: { maxRate: 1000, acceleration: 150 },
      z: { maxRate: 1200, acceleration: 25 },
    });
    expect(
      limitsFromConfig(readMachineConfig('axes:\n  x:\n    max_rate_mm_per_min: 1')),
    ).toBeNull();
    expect(toDraft(STOCK).z).toEqual({ maxRate: '1200', acceleration: '80' });
    expect(limitPath('z', 'acceleration')).toBe('axes/z/acceleration_mm_per_sec2');
  });

  it('says what a draft changes, refuses what lies outside, and warns about raises', () => {
    const draft = toDraft(STOCK);
    expect(checkDraft(STOCK, draft)).toEqual({
      changes: [],
      problems: [],
      raised: [],
      bigSteps: [],
    });
    draft.z.maxRate = '4000';
    draft.x.acceleration = '180';
    draft.y.maxRate = 'abc';
    const check = checkDraft(STOCK, draft);
    expect(check.changes.map((c) => [c.path, c.from, c.to])).toEqual([
      ['axes/x/acceleration_mm_per_sec2', 200, 180],
      ['axes/z/max_rate_mm_per_min', 1200, 4000],
    ]);
    expect(check.problems).toEqual([{ axis: 'y', kind: 'maxRate', problem: 'invalid' }]);
    expect(check.raised.map((c) => c.path)).toEqual(['axes/z/max_rate_mm_per_min']);
    expect(check.bigSteps.map((c) => c.path)).toEqual(['axes/z/max_rate_mm_per_min']);
    // +20 % exactly is a small step; out of range is refused with its side.
    const small = checkDraft(STOCK, {
      ...toDraft(STOCK),
      z: { maxRate: '1440', acceleration: '5' },
    });
    expect(small.bigSteps).toEqual([]);
    expect(small.raised.map((c) => c.to)).toEqual([1440]);
    expect(small.problems).toEqual([{ axis: 'z', kind: 'acceleration', problem: 'low' }]);
    const high = checkDraft(STOCK, {
      ...toDraft(STOCK),
      x: { maxRate: '25000', acceleration: '' },
    });
    expect(high.problems.map((p) => p.problem)).toEqual(['high', 'invalid']);
    expect(smallStepUp(1200)).toBe(1440);
    expect(smallStepUp(83)).toBe(100);
  });

  it('reads FluidNC’s answer and writes numbers the way it takes them', () => {
    const lines = ['$/axes/z/max_rate_mm_per_min=1500.000', 'ok'];
    expect(settingValue(lines, 'axes/z/max_rate_mm_per_min')).toBe(1500);
    expect(settingValue(lines, 'axes/x/max_rate_mm_per_min')).toBeNull();
    expect(
      settingValue(['$/axes/z/max_rate_mm_per_min=abc'], 'axes/z/max_rate_mm_per_min'),
    ).toBeNull();
    expect(settingNumber(1440)).toBe('1440');
    expect(settingNumber(12.34567)).toBe('12.346');
    expect(effectiveFeed(4000, 1200)).toBe(1200);
    expect(effectiveFeed(600, 1200)).toBe(600);
  });

  it('keeps a change only where config.yaml can be read byte for byte', () => {
    expect(canKeepLimits('simulator', undefined)).toBe(true);
    expect(canKeepLimits('192.168.0.200', undefined)).toBe(false);
    expect(canKeepLimits('ws://pi:8080/fluidnc', 'ws://192.168.0.200:81')).toBe(true);
    expect(canKeepLimits('192.168.0.200', 'ws://192.168.0.200:81')).toBe(true);
    expect(canKeepLimits('192.168.0.201', 'ws://192.168.0.200:81')).toBe(false);
  });
});

describe('writing the limits to the (simulated) controller', () => {
  beforeAll(async () => {
    useMachine.getState().setUrl('simulator');
    await useMachine.getState().connect();
    // Its greeting has come (a greeting ends whatever was asked before it).
    await vi.waitFor(() => expect(useMachine.getState().firmware).not.toBeNull(), {
      timeout: 3000,
    });
    await vi.waitFor(() => expect(useMachine.getState().status?.state).toBe('Idle'));
  });
  afterAll(() => useMachine.getState().disconnect());

  it('reads, writes at runtime, reads back, and keeps it in config.yaml with a backup', async () => {
    expect(await useLimits.getState().read()).toBe(true);
    expect(useLimits.getState().current?.z).toEqual({ maxRate: 1200, acceleration: 80 });
    const original = simulator().localFiles.get('config.yaml')!;
    const check = checkDraft(STOCK, {
      ...toDraft(STOCK),
      z: { maxRate: '1440', acceleration: '80' },
    });
    expect(await useLimits.getState().write(check.changes, true)).toBe(true);
    const { result, current } = useLimits.getState();
    expect(result).toMatchObject({ saved: 'saved', backup: 'config.yaml.bak' });
    expect(result!.values).toEqual([expect.objectContaining({ read: 1440, ok: true })]);
    expect(current!.z.maxRate).toBe(1440);
    // The profile follows (job times, the jog cap shown under the jog speed).
    expect(useJob.getState().profile.kinematics.axes.z.maxRate).toBe(1440);
    // The flash: the old file beside it, the new one with the one line changed – comment and blank lines kept.
    expect(simulator().localFiles.get('config.yaml.bak')).toBe(original);
    const edited = simulator().localFiles.get('config.yaml')!;
    expect(edited.startsWith('# V1E LowRider v4')).toBe(true);
    const differ = original
      .split('\n')
      .flatMap((l, i) => (l === edited.split('\n')[i] ? [] : [edited.split('\n')[i]]));
    expect(differ).toEqual(['    max_rate_mm_per_min: 1440']);
    expect(useMachine.getState().log.at(-1)).toMatchObject({ key: 'limits.written' });
  });

  it('holds until the restart when not kept, and refuses at the wrong time or a refused value', async () => {
    const back = checkDraft(useLimits.getState().current!, {
      ...toDraft(useLimits.getState().current!),
      z: { maxRate: '1200', acceleration: '80' },
    });
    expect(await useLimits.getState().write(back.changes, false)).toBe(true);
    expect(useLimits.getState().result?.saved).toBe('runtime');
    expect(await useLimits.getState().write([], false)).toBe(false);
    // Not at rest: nothing is sent.
    const status = useMachine.getState().status!;
    useMachine.setState({ status: { ...status, state: 'Alarm' } });
    expect(await useLimits.getState().write(back.changes, false)).toBe(false);
    expect(useLimits.getState().error).toBe('limits.notIdle');
    useMachine.setState({ status });
    // FluidNC refuses a value (the simulator like its validator): said, nothing claimed.
    const bad = [{ ...back.changes[0]!, to: -5 }];
    expect(await useLimits.getState().write(bad, false)).toBe(false);
    expect(useLimits.getState().error).toBe('limits.refused');
    expect(useLimits.getState().current!.z.maxRate).toBe(1200);
  });
});
