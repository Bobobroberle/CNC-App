import { rectangle } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jobNames, useCam } from '../src/store/cam';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { jobUnderWay } from '../src/store/underway';
import { useWorkshop } from '../src/store/workshop';
import { cam, changes, items, program, resetTools, scene, SMALL, VBIT } from './camToolsFixtures';

let text = 0;
const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
const stopped = () => useMachine.setState({ fileJob: null });
const own = () => jobNames(useCam.getState().project!.name).single;

/**
 * The program of a job that is under way is never replaced by the drawing – and an edit of the tool list is one of the
 * ways the drawing changes: the cutters it names, their numbers, diameters, values. What the drawing then is ahead of is
 * the program on the table, which stays.
 */
describe('the drawing’s cutters never change the program under a job that is under way', () => {
  beforeEach(() => {
    scene();
    useMachine.setState({ connection: 'connected', status: null });
    cam().add([rectangle(0, 0, 40, 30)]);
    cam().addText('Hi', { height: 8 });
    text = items()[1]!.id;
    cam().setItem(text, { toolId: 'v1' });
  });
  afterEach(() => {
    stopped();
    useRun.getState().reset();
    useMachine.setState({ connection: 'disconnected', lostInJob: null });
    resetTools();
    cam().close();
    useJob.getState().unload();
  });

  it('the premise: the drawing is on the table as one program with two tools', () => {
    expect(useJob.getState().fileName).toBe(own());
    expect(changes()).toEqual(['T4 M6', 'T3 M6']);
    expect(jobUnderWay()).toBe(false);
  });

  it('an edit of a cutter in use: the program stays, the drawing is ahead – and one tap puts the new one there afterwards', () => {
    const lines = useJob.getState().lines;
    running();
    expect(() =>
      useWorkshop.getState().saveTool({ ...VBIT, diameter: 4, number: 8 }),
    ).not.toThrow();
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    expect(program()).toContain('T4 M6');
    // not even the operator's tap
    expect(cam().remake({ take: true })).toBe(false);
    expect(useJob.getState().lines).toBe(lines);
    stopped();
    expect(cam().remake({ take: true })).toBe(true);
    expect(changes()).toEqual(['T8 M6', 'T3 M6']);
    expect(cam().ahead).toBe(false);
  });

  it('a tool list that no program can be made from: nothing is thrown, the program that runs stays, the notes say why', () => {
    const lines = useJob.getState().lines;
    running();
    expect(() => useWorkshop.getState().saveTool({ ...SMALL, number: 4 })).not.toThrow();
    expect(cam().toolNotes.map((n) => n.code)).toEqual(['clash']);
    expect(useJob.getState().lines).toBe(lines);
    expect(useJob.getState().fileName).toBe(own());
    expect(cam().ahead).toBe(true);
    // … and nothing is made while it stands, whoever asks
    expect(cam().remake({ take: true })).toBe(false);
    expect(useJob.getState().lines).toBe(lines);
    stopped();
    // the job is over: the program of the job stays (its summary is still wanted) until the tap – the tool list is fixed
    // meanwhile (the drawing is made anew by the edit; nothing replaces the program of a job that has ended while the
    // drawing was ahead of it)
    useWorkshop.getState().saveTool({ ...SMALL, number: 5 });
    expect(cam().toolNotes).toEqual([]);
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().remake({ take: true })).toBe(true);
    expect(changes()).toEqual(['T4 M6', 'T3 M6']);
  });

  it('a cutter chosen for a part while the job runs: the part is drawn with it, the program is the one that runs', () => {
    cam().setItem(text, { toolId: undefined });
    const lines = useJob.getState().lines;
    expect(changes()).toEqual([]);
    running();
    cam().setItem(text, { toolId: 'f2' });
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
    expect(items().find((i) => i.id === text)!.toolId).toBe('f2');
    // the drawing's cutters are the new ones – what the table draws asks the plan, not the program
    stopped();
    cam().remake({ take: true });
    expect(changes()).toEqual(['T5 M6', 'T3 M6']);
  });

  it('a program that waits between two of its parts (a tool change) counts as running as well', () => {
    const lines = useJob.getState().lines;
    useRun.setState({ phase: 'between', jobKey: `${useJob.getState().fileName}:${lines.length}` });
    expect(jobUnderWay()).toBe(true);
    useWorkshop.getState().saveTool({ ...VBIT, cutting: { ...VBIT.cutting, feed: 900 } });
    expect(useJob.getState().lines).toBe(lines);
    expect(cam().ahead).toBe(true);
  });
});
