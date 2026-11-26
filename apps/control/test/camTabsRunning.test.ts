import { type Sketch } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jobNames, useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { jobUnderWay } from '../src/store/underway';
import { useUi } from '../src/store/ui';

const RECT: Sketch = { type: 'rect', w: 100, h: 60, r: 0 };
const cam = () => useCam.getState();
const first = () => cam().project!.items[0]!;
const text = () => useJob.getState().lines.join('\n');
const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });

/**
 * The tabs are part of the drawing: every way of changing them goes through the drawing's own update,
 * so a job under way keeps its program on the table, and the drawing says it is ahead of it.
 */
describe('the tabs under a job that is under way', () => {
  beforeEach(() => {
    cam().close();
    cam().setPlacing(null);
    useJob.getState().unload();
    useFlip.getState().setPlan(null);
    useRun.getState().reset();
    useMachine.setState({ fileJob: null, connection: 'connected', lostInJob: null, status: null });
    cam().setSettings({ toolId: 't2', depth: 6, stepdown: 6, rampAngle: 90, allowance: 0 });
    cam().setSettings({ tabs: { count: 4, width: 6, height: 2 } });
    openCam();
    cam().addSketch(RECT);
  });
  afterEach(() => {
    useMachine.setState({ fileJob: null, lostInJob: null, connection: 'disconnected' });
    useRun.getState().reset();
    cam().close();
    useJob.getState().unload();
    useUi.getState().go('job');
  });

  it('change the drawing and leave the program that runs where it is', () => {
    const id = first().id;
    const lying = text();
    const name = useJob.getState().fileName;
    expect(name).toBe(jobNames(cam().project!.name).single);
    running();
    expect(jobUnderWay()).toBe(true);
    expect(cam().ahead).toBe(false);

    // A value that makes the same program is no change of it: the drawing is not ahead
    cam().setTabs(id, { width: 6 });
    expect(first().tabSpec).toEqual({ mode: 'auto', width: 6 });
    expect(cam().ahead).toBe(false);

    cam().setTabs(id, { count: 2, width: 12, height: 3 });
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 2, width: 12, height: 3 });
    expect(cam().ahead).toBe(true);
    expect(text()).toBe(lying);

    // By hand, a tab put, moved, taken away, spread again: each is the drawing's, none reaches the table
    expect(cam().manualTabs(id)).toBe(true);
    expect(first().tabSpec!.mode).toBe('manual');
    expect(cam().addTab(id, 0, 0.7)).toBe(true);
    cam().moveTab(id, 0, 0.3);
    const drag = cam().dragTab(id, 1)!;
    drag.move(0.45);
    drag.end();
    expect(first().tabSpec!.at).toContainEqual({ c: 0, u: 0.45 });
    cam().removeTab(id, 0);
    cam().spreadTabs(id);
    expect(first().tabSpec).toEqual({ mode: 'auto', count: 2, width: 12, height: 3 });
    expect(useJob.getState().fileName).toBe(name);
    expect(text()).toBe(lying);
    expect(cam().ahead).toBe(true);
  });

  it('is on the table once the operator takes the drawing there – with the tabs where they were put', () => {
    const id = first().id;
    running();
    cam().manualTabs(id);
    cam().moveTab(id, 0, 0.1);
    expect(text()).not.toContain('X26');
    useMachine.setState({ fileJob: null });
    expect(cam().remake({ take: true })).toBe(true);
    // 32 along the lower side: the cutter is up from 26 to 38, 3 mm below the line
    expect(text()).toContain('X26');
    expect(text()).toContain('X38');
    expect(cam().ahead).toBe(false);
  });
});
