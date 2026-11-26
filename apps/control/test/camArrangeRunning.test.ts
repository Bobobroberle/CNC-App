import { rectangle } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemsBounds } from '../src/lib/camItems';
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
const left = (i: number) => itemsBounds([items()[i]!])!.minX;

/**
 * Arranging is part of the drawing: every way of it goes through the drawing's own update, so a job
 * under way keeps its program on the table, and the drawing says it is ahead of it – where its program
 * would differ. Grouping changes nothing at the machine: the drawing is not ahead of anything then.
 */
describe('arranging under a job that is under way', () => {
  let a = 0;
  let b = 0;
  let c = 0;
  beforeEach(() => {
    cam().close();
    useJob.getState().unload();
    useFlip.getState().setPlan(null);
    useRun.getState().reset();
    useMachine.setState({ fileJob: null, connection: 'connected', lostInJob: null, status: null });
    cam().setSettings({ toolId: 't2', depth: 6, stepdown: 6, rampAngle: 90, allowance: 0 });
    openCam();
    cam().add([rectangle(0, 0, 40, 30)]);
    cam().add([rectangle(80, 10, 40, 30)]);
    cam().add([rectangle(160, 20, 40, 30)]);
    [a, b, c] = items().map((i) => i.group) as [number, number, number];
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

    cam().select([a, b, c]);
    cam().align('bottom');
    expect([left(0), left(1), left(2)]).toEqual([0, 80, 160]);
    expect(items().map((i) => itemsBounds([i])!.minY)).toEqual([0, 0, 0]);
    expect(cam().ahead).toBe(true);
    expect(useJob.getState().fileName).toBe(name);
    expect(text()).toBe(lying);

    cam().align('left');
    expect([left(0), left(1), left(2)]).toEqual([0, 0, 0]);
    expect(text()).toBe(lying);
    cam().distribute('v', 'gaps');
    cam().undo();
    cam().undo();
    expect(text()).toBe(lying);
    expect(useJob.getState().fileName).toBe(name);
    // undone as far as the beginning: the drawing is the program again
    expect(items().map((i) => itemsBounds([i])!.minY)).toEqual([0, 10, 20]);
  });

  it('is on the table once the operator takes the drawing there – arranged', () => {
    const lying = text();
    // the third plate stands at 160: the cutter goes round it at 157, 3 mm beside the line
    expect(lying).toContain('X157');
    running();
    cam().select([a, b, c]);
    cam().align('left');
    expect(text()).toBe(lying);
    useMachine.setState({ fileJob: null });
    expect(cam().remake({ take: true })).toBe(true);
    expect(cam().ahead).toBe(false);
    expect(text()).not.toBe(lying);
    expect(text()).not.toContain('X157');
  });

  it('keeps the drawing not ahead when grouping, taking apart and picking change nothing at the machine', () => {
    const lying = text();
    running();
    cam().select([a, b]);
    cam().group();
    expect(cam().ahead).toBe(false);
    expect(text()).toBe(lying);
    cam().ungroup();
    expect(cam().ahead).toBe(false);
    cam().selectAll();
    cam().invertSelection();
    cam().toggleSelect(c);
    cam().setMulti(true);
    expect(cam().ahead).toBe(false);
    expect(text()).toBe(lying);
    // an alignment makes the program differ, so the drawing is ahead then (the groups are new ones now)
    cam().select([items()[0]!.group, items()[1]!.group]);
    cam().align('left');
    expect(cam().ahead).toBe(true);
  });

  it('puts an arranged drawing that was ahead on the table by itself where nothing lay there', () => {
    // nothing on the table, a job under way from the SD card: the drawing waits for the end
    useJob.getState().unload();
    running();
    cam().select([a, b, c]);
    cam().align('left');
    expect(useJob.getState().fileName).toBeNull();
    expect(cam().ahead).toBe(true);
    useMachine.setState({ fileJob: null });
    expect(jobUnderWay()).toBe(false);
    expect(useJob.getState().fileName).toBe(jobNames(cam().project!.name).single);
    expect(cam().ahead).toBe(false);
  });
});
