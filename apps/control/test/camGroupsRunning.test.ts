import { rectangle } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jobNames, useCam } from '../src/store/cam';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { jobUnderWay } from '../src/store/underway';
import { useWorkshop } from '../src/store/workshop';
import { cam, items, program, resetTools, scene } from './camToolsFixtures';

const deepest = (text = program()) =>
  Math.min(...[...text.matchAll(/\bZ(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])));
const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
const stopped = () => useMachine.setState({ fileJob: null });
const own = () => jobNames(useCam.getState().project!.name).single;
let plate = 0;
let text = 0;

/**
 * The colours are one more way the drawing changes. The program of a job that is under way is never replaced by
 * it – a colour given, a value of it edited, a step taken back: the drawing is ahead, and the program on the table
 * stays until the job is over and the operator has put the drawing there.
 */
describe('a colour never changes the program under a job that is under way', () => {
  beforeEach(() => {
    scene();
    useMachine.setState({ connection: 'connected', status: null });
    cam().add([rectangle(0, 0, 40, 30)]);
    cam().addText('Hi', { height: 8 });
    [plate, text] = items().map((i) => i.id) as [number, number];
    cam().select(null);
    cam().setColor('a', [plate]);
    cam().setColorValue('a', { depth: 3 });
  });
  afterEach(() => {
    stopped();
    useRun.getState().reset();
    useMachine.setState({ connection: 'disconnected', lostInJob: null });
    resetTools();
    cam().close();
    useJob.getState().unload();
  });

  it('the premise: the colour’s depth is in the program on the table', () => {
    expect(useJob.getState().fileName).toBe(own());
    expect(deepest()).toBe(-3);
    expect(jobUnderWay()).toBe(false);
    expect(cam().ahead).toBe(false);
  });

  it('a value edited while the job runs: the program stays, the drawing is ahead – and one tap puts it there afterwards', () => {
    const lines = useJob.getState().lines;
    running();
    cam().setColorValue('a', { depth: 4 });
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    expect(deepest()).toBe(-3);
    // not even the operator's tap
    expect(cam().remake({ take: true })).toBe(false);
    expect(useJob.getState().lines).toBe(lines);
    stopped();
    expect(cam().remake({ take: true })).toBe(true);
    expect(deepest()).toBe(-4);
    expect(cam().ahead).toBe(false);
  });

  it('a colour given or taken away while the job runs: the same', () => {
    const lines = useJob.getState().lines;
    running();
    cam().setColor(null, [plate]);
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    expect(cam().project!.colors).toBeUndefined();
    cam().setColor('a', [plate]);
    // (the values went with the last part of the colour: this colour starts without)
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    stopped();
    cam().remake({ take: true });
    expect(deepest()).toBe(-6);
  });

  it('a step taken back while the job runs is a change of the drawing like any other', () => {
    const lines = useJob.getState().lines;
    running();
    cam().undo();
    expect(cam().project!.colors).toBeUndefined();
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    cam().redo();
    // the drawing is what it was when the program was made: nothing to put there – no longer ahead
    expect(cam().project!.colors).toEqual({ a: { depth: 3 } });
    expect(cam().ahead).toBe(false);
    expect(useJob.getState().lines).toBe(lines);
  });

  it('a colour that changes nothing of what is cut leaves the drawing where the program is: not ahead', () => {
    running();
    cam().setColor('b', [text]);
    expect(cam().project!.colors).toEqual({ a: { depth: 3 } });
    expect(cam().ahead).toBe(false);
    expect(items().find((i) => i.id === text)!.color).toBe('b');
  });

  it('the cutter of a colour edited in the tool list while the job runs: the program stays, the drawing is ahead', () => {
    stopped();
    cam().setColor('b', [text]);
    cam().setColorValue('b', { toolId: 'v1' });
    expect(program()).toContain('T4 M6');
    const lines = useJob.getState().lines;
    running();
    useWorkshop
      .getState()
      .saveTool({ ...useWorkshop.getState().tools.find((t) => t.id === 'v1')!, number: 8 });
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    expect(program()).toContain('T4 M6');
    stopped();
    expect(cam().remake({ take: true })).toBe(true);
    expect(program()).toContain('T8 M6');
  });

  it('a program that waits between two of its parts counts as running as well', () => {
    const lines = useJob.getState().lines;
    useRun.setState({ phase: 'between', jobKey: `${useJob.getState().fileName}:${lines.length}` });
    expect(jobUnderWay()).toBe(true);
    cam().setColorValue('a', { depth: 2 });
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
  });
});
