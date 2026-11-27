import { rectangle } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemsBounds } from '../src/lib/camItems';
import { jobNames, useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { useUi } from '../src/store/ui';
import { jobUnderWay } from '../src/store/underway';
import { useWorkshop } from '../src/store/workshop';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const text = () => useJob.getState().lines.join('\n');
const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
const lefts = () => items().map((i) => itemsBounds([i])!.minX);

/**
 * Packing is part of the drawing: it goes through the drawing's own update, like every way of arranging, so a job
 * under way keeps its program on the table, and the drawing says it is ahead of it – where its program would differ.
 */
describe('packing under a job that is under way', () => {
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
    useWorkshop.getState().setSetup({
      stock: { min: { x: 0, y: 0, z: -18 }, max: { x: 130, y: 70, z: 0 } },
      fixtures: [],
      fixtureFrame: 'machine',
    });
    cam().selectAll();
  });
  afterEach(() => {
    useMachine.setState({ fileJob: null, lostInJob: null, connection: 'disconnected' });
    useRun.getState().reset();
    cam().close();
    useJob.getState().unload();
    useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
    useUi.getState().go('job');
  });

  it('changes the drawing and leaves the program that runs where it is', () => {
    const lying = text();
    const name = useJob.getState().fileName;
    expect(name).toBe(jobNames(cam().project!.name).single);
    running();
    expect(jobUnderWay()).toBe(true);
    expect(cam().ahead).toBe(false);

    const report = cam().nest({ gap: 10 })!;
    // the drawing is packed: the plate at 160 went to the stock (130 wide) – none of them lies at 160 any more
    expect(report.unplaced).toEqual([]);
    expect(Math.max(...lefts())).toBeLessThan(130);
    expect(cam().ahead).toBe(true);
    expect(useJob.getState().fileName).toBe(name);
    expect(text()).toBe(lying);

    // undone as far as the beginning: the drawing is the program again
    cam().undo();
    expect(lefts()).toEqual([0, 80, 160]);
    expect(text()).toBe(lying);
    expect(useJob.getState().fileName).toBe(name);
  });

  it('is on the table once the operator takes the drawing there – packed', () => {
    const lying = text();
    // the third plate stands at 160: the cutter goes round it at 157
    expect(lying).toContain('X157');
    running();
    cam().nest({ gap: 10 });
    expect(text()).toBe(lying);
    useMachine.setState({ fileJob: null });
    expect(cam().remake({ take: true })).toBe(true);
    expect(cam().ahead).toBe(false);
    expect(text()).not.toBe(lying);
    expect(text()).not.toContain('X157');
  });

  it('keeps the drawing not ahead when nothing moves – and the answer is there all the same', () => {
    cam().nest({ gap: 10 });
    const packed = text();
    running();
    const was = cam().past.length;
    // packed already: nothing moves, nothing is remembered, nothing is ahead
    const again = cam().nest({ gap: 10 })!;
    expect(again.moved).toBe(0);
    expect(cam().past.length).toBe(was);
    expect(cam().ahead).toBe(false);
    expect(text()).toBe(packed);
  });

  it('puts a packed drawing that was ahead on the table by itself where nothing lay there', () => {
    // nothing on the table, a job under way from the SD card: the drawing waits for the end
    useJob.getState().unload();
    running();
    cam().nest({ gap: 10 });
    expect(useJob.getState().fileName).toBeNull();
    expect(cam().ahead).toBe(true);
    useMachine.setState({ fileJob: null });
    expect(jobUnderWay()).toBe(false);
    expect(useJob.getState().fileName).toBe(jobNames(cam().project!.name).single);
    expect(cam().ahead).toBe(false);
  });
});
