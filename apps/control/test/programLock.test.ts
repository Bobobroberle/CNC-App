import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { openJobFiles, openRecent, useRecent } from '../src/store/recent';
import { useRun } from '../src/store/run';
import '../src/store/underway';
import { useUi } from '../src/store/ui';

const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
const stopped = () => useMachine.setState({ fileJob: null });
const loaded = () => useJob.getState().fileName;
const messages = () => useMachine.getState().log.filter((l) => l.key === 'job.locked').length;

/**
 * While a job is under way no program is loaded, replaced or taken off the table – by whichever way
 * (a dropped file, the recent list, a flow's derived program, closing it): the job runs on from the
 * SD card, and what the screen shows has to stay what runs.
 */
describe('the program on the table while a job is under way', () => {
  beforeEach(() => {
    stopped();
    useRun.getState().reset();
    useJob.getState().unload();
    useJob.getState().load('part.nc', 'G0 X1\n');
    useUi.getState().go('start');
    useMachine.setState({ log: [] });
  });
  afterEach(() => {
    stopped();
    useRun.getState().reset();
    useJob.getState().unload();
    useRecent.setState({ jobs: [] });
  });

  it('loads, derives and unloads as ever where nothing runs', () => {
    useJob.getState().load('other.nc', 'G0 X2\n');
    expect(loaded()).toBe('other.nc');
    useJob.getState().loadDerived('other_ausgerichtet.nc', 'G0 X3\n');
    expect(loaded()).toBe('other_ausgerichtet.nc');
    useJob.getState().unload();
    expect(loaded()).toBeNull();
    expect(messages()).toBe(0);
  });

  it('refuses every way to change it, says why – and says so to the caller', () => {
    // a turned copy is on the table, the program as loaded behind it: `restoreOriginal` has a target
    const pose = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };
    useJob
      .getState()
      .loadDerived('part_ausgerichtet.nc', 'G0 X3\n', { by: pose, from: 'original' });
    expect(useJob.getState().original?.fileName).toBe('part.nc');
    useMachine.setState({ log: [] });
    running();
    expect(useJob.getState().load('other.nc', 'G0 X2\n')).toBe(false);
    expect(loaded()).toBe('part_ausgerichtet.nc');
    expect(messages()).toBe(1);
    // a derived program changes neither the program nor the pose it keeps
    expect(
      useJob.getState().loadDerived('x.nc', 'G0 X4\n', {
        by: { a: 1, b: 0, c: 0, d: 1, e: 5, f: 0 },
        from: 'original',
      }),
    ).toBe(false);
    expect(loaded()).toBe('part_ausgerichtet.nc');
    expect(useJob.getState().pose).toEqual(pose);
    expect(useJob.getState().original?.fileName).toBe('part.nc');
    expect(useJob.getState().unload()).toBe(false);
    expect(loaded()).toBe('part_ausgerichtet.nc');
    expect(useJob.getState().restoreOriginal()).toBe(false);
    expect(loaded()).toBe('part_ausgerichtet.nc');
    expect(messages()).toBe(4);
    // after the job every one of them works again
    stopped();
    expect(useJob.getState().restoreOriginal()).toBe(true);
    expect(loaded()).toBe('part.nc');
  });

  it('turns a dropped file away with one message and does not step to the Job', async () => {
    running();
    await openJobFiles([new File(['G0 X5\n'], 'a.nc'), new File(['G0 X6\n'], 'b.nc')]);
    expect(loaded()).toBe('part.nc');
    expect(messages()).toBe(1);
    expect(useUi.getState().place).toBe('start');
    expect(useRecent.getState().jobs).toEqual([]);
  });

  it('turns a job of the recent list away; it opens after the job', () => {
    useRecent.setState({
      jobs: [{ name: 'old.nc', text: 'G0 X7\n' } as never],
    });
    running();
    expect(openRecent('old.nc')).toBe(false);
    expect(loaded()).toBe('part.nc');
    expect(messages()).toBe(1);
    stopped();
    expect(openRecent('old.nc')).toBe(true);
    expect(loaded()).toBe('old.nc');
  });

  it('is no obstacle after the job: a file dropped then is opened', async () => {
    running();
    stopped();
    await openJobFiles([new File(['G0 X5\n'], 'a.nc')]);
    expect(loaded()).toBe('a.nc');
    expect(useUi.getState().place).toBe('job');
  });

  it('holds for a job the controller reports, not for a move of the app’s own', () => {
    const report = (sd: boolean) =>
      useMachine.setState({
        connection: 'connected',
        status: { state: 'Run', ...(sd ? { sd: { percent: 3, file: '/sd/x.nc' } } : {}) } as never,
      });
    report(true);
    useJob.getState().load('other.nc', 'G0 X2\n');
    expect(loaded()).toBe('part.nc');
    report(false);
    useJob.getState().load('other.nc', 'G0 X2\n');
    expect(loaded()).toBe('other.nc');
    useMachine.setState({ status: null, connection: 'disconnected' });
  });
});
