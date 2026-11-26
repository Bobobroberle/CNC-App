import { rectangle } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jobNames, useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { jobUnderWay } from '../src/store/underway';
import { useUi } from '../src/store/ui';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const text = () => useJob.getState().lines.join('\n');
const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });

/**
 * Hiding a part changes the program, so it goes through the drawing's own update like every other change: a
 * job under way keeps its program on the table, and the drawing says it is ahead of it – and is not, once
 * the part is shown again and the drawing makes the program that lies there.
 */
describe('hiding a part under a job that is under way', () => {
  beforeEach(() => {
    cam().close();
    cam().setPlacing(null);
    useJob.getState().unload();
    useFlip.getState().setPlan(null);
    useRun.getState().reset();
    useMachine.setState({ fileJob: null, connection: 'connected', lostInJob: null, status: null });
    cam().setSettings({ toolId: 't2', depth: 6, stepdown: 6, rampAngle: 90, allowance: 0 });
    openCam();
    cam().add([rectangle(0, 0, 10, 10)]);
    cam().add([rectangle(100, 0, 30, 30)]);
  });
  afterEach(() => {
    useMachine.setState({ fileJob: null, lostInJob: null, connection: 'disconnected' });
    useRun.getState().reset();
    cam().close();
    useJob.getState().unload();
    useUi.getState().go('job');
  });

  it('changes the drawing and leaves the program that runs where it is', () => {
    const lying = text();
    const name = useJob.getState().fileName;
    expect(name).toBe(jobNames(cam().project!.name).single);
    const second = items()[1]!.id;
    running();
    expect(jobUnderWay()).toBe(true);
    expect(cam().ahead).toBe(false);

    cam().setHidden(second, true);
    expect(items()[1]!.hidden).toBe(true);
    expect(cam().ahead).toBe(true);
    expect(useJob.getState().fileName).toBe(name);
    expect(text()).toBe(lying);

    // shown again, the drawing makes the program that is on the table: it is not ahead of it any more
    cam().setHidden(second, false);
    expect(cam().ahead).toBe(false);
    expect(text()).toBe(lying);

    // every part hidden: still nothing is taken off the stage under a running job
    cam().setHidden(items()[0]!.id, true);
    cam().setHidden(second, true);
    expect(cam().ahead).toBe(true);
    expect(useJob.getState().fileName).toBe(name);
    expect(text()).toBe(lying);
  });

  it('is on the table once the operator takes the drawing there – without the part that was hidden', () => {
    const second = items()[1]!.id;
    const all = text();
    running();
    cam().setHidden(second, true);
    expect(text()).toBe(all);
    useMachine.setState({ fileJob: null });
    expect(cam().remake({ take: true })).toBe(true);
    expect(text()).not.toBe(all);
    expect(
      [...text().matchAll(/X(-?\d+(?:\.\d+)?)/g)].some(
        (m) => Number(m[1]) > 100 && Number(m[1]) < 130,
      ),
    ).toBe(false);
    expect(cam().ahead).toBe(false);
    cam().showAll();
    expect(text()).toBe(all);
  });
});
