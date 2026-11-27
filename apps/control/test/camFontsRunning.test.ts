import type { Sketch } from '@lowrider/cam';
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
const sketch = () => items()[0]!.sketch as Sketch & { type: 'text' };
const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });

/**
 * The face of a text changes the strokes, so it goes through the drawing's own update like every other change: a
 * job under way keeps its program on the table, and the drawing says it is ahead of it – and is not, once the face
 * is the one the program lies in again.
 */
describe('choosing the face of a text under a job that is under way', () => {
  beforeEach(() => {
    cam().close();
    cam().setPlacing(null);
    useJob.getState().unload();
    useFlip.getState().setPlan(null);
    useRun.getState().reset();
    useMachine.setState({ fileJob: null, connection: 'connected', lostInJob: null, status: null });
    cam().setSettings({ toolId: 't2', depth: 6, stepdown: 6, rampAngle: 90, allowance: 0 });
    openCam();
    cam().addText('Fräse', { height: 12, align: 'center' });
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
    running();
    expect(jobUnderWay()).toBe(true);
    expect(cam().ahead).toBe(false);

    cam().setSketch(items()[0]!.id, { ...sketch(), font: 'script' }, 'font');
    expect(sketch().font).toBe('script');
    expect(cam().ahead).toBe(true);
    expect(useJob.getState().fileName).toBe(name);
    expect(text()).toBe(lying);

    // back in the face the program lies in: the drawing is not ahead of it any more
    cam().setSketch(items()[0]!.id, { ...sketch(), font: 'standard' }, 'font');
    expect('font' in sketch()).toBe(false);
    expect(cam().ahead).toBe(false);
    expect(text()).toBe(lying);
  });

  it('is on the table once the operator takes the drawing there', () => {
    const standard = text();
    running();
    cam().setSketch(items()[0]!.id, { ...sketch(), font: 'modern' }, 'font');
    expect(text()).toBe(standard);
    useMachine.setState({ fileJob: null });
    expect(cam().remake({ take: true })).toBe(true);
    expect(text()).not.toBe(standard);
    expect(cam().ahead).toBe(false);
    // and the standard face gives the program of before, byte for byte
    cam().setSketch(items()[0]!.id, { ...sketch(), font: 'standard' }, 'font');
    expect(text()).toBe(standard);
  });

  it('keeps a refused face where it is: nothing is changed under a job either', () => {
    cam().close();
    openCam();
    cam().addText('{}', { height: 12, font: 'simplex' });
    const lying = text();
    running();
    const steps = cam().past.length;
    expect(cam().setSketch(items()[0]!.id, { ...sketch(), font: 'standard' }, 'font')).toEqual([
      '{',
      '}',
    ]);
    expect(sketch().font).toBe('simplex');
    expect(cam().past.length).toBe(steps);
    expect(cam().ahead).toBe(false);
    expect(text()).toBe(lying);
  });
});
