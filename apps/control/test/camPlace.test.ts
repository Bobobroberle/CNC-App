import { afterEach, describe, expect, it } from 'vitest';
import { openCam } from '../src/store/camPlace';
import { useCam } from '../src/store/cam';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useUi } from '../src/store/ui';

describe('the CAM is a place of its own', () => {
  afterEach(() => {
    useCam.getState().close();
    useJob.getState().unload();
    useMachine.setState({ fileJob: null });
    useUi.getState().go('job');
  });

  it('opens an empty drawing and shows the table from above', () => {
    useJob.getState().setProjection('side' as never);
    openCam();
    expect(useUi.getState().place).toBe('cam');
    expect(useCam.getState().project).not.toBeNull();
    expect(useJob.getState().projection).toBe('top');
  });

  it('keeps a loaded program loaded – going in and out of the CAM never unloads it', () => {
    useJob.getState().load('part.nc', 'G0 X1\n');
    openCam();
    expect(useJob.getState().fileName).toBe('part.nc');
    useUi.getState().leaveCam();
    expect(useUi.getState().place).toBe('job');
    expect(useJob.getState().fileName).toBe('part.nc');
  });

  it('keeps a running job running', () => {
    useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
    openCam();
    useUi.getState().leaveCam();
    expect(useMachine.getState().fileJob).toEqual({ name: 'x.nc', startedAt: 0 });
  });

  it('is left for the Job only where it shows – a program loaded on Fräsen stays on Fräsen', () => {
    useUi.getState().go('run');
    useUi.getState().leaveCam();
    expect(useUi.getState().place).toBe('run');
  });
});
