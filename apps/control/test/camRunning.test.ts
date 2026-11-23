import type { Sketch } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jobNames, ownsTable, useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { openCam } from '../src/store/camPlace';
import { useRun } from '../src/store/run';
import { useSeries } from '../src/store/series';
import { jobUnderWay } from '../src/store/underway';
import { useUi } from '../src/store/ui';

const RECT: Sketch = { type: 'rect', w: 100, h: 60, r: 0 };
const HOLE: Sketch = { type: 'circle', d: 20 };
const cam = () => useCam.getState();
const loaded = () => useJob.getState().fileName;
const own = () => jobNames(cam().project!.name);
const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
const stopped = () => useMachine.setState({ fileJob: null });
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm" viewBox="0 0 80 40">
  <rect x="0" y="0" width="80" height="40"/><circle cx="40" cy="20" r="3"/>
</svg>`;

/**
 * "Zeichnen während etwas gefräst wird": the drawing can always be worked on, but the program
 * that runs – or waits for its next part – is never replaced or taken off the table by it, and a
 * program that is not the drawing's own is replaced only by the operator's tap.
 */
describe('the drawing never changes the program under a running job', () => {
  beforeEach(() => {
    cam().close();
    useJob.getState().unload();
    useFlip.getState().setPlan(null);
    useRun.getState().reset();
    stopped();
    useMachine.setState({ connection: 'connected', lostInJob: null, status: null });
    cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
    openCam();
  });
  afterEach(() => {
    useMachine.setState({ lostInJob: null, connection: 'disconnected' });
    stopped();
    useRun.getState().reset();
    cam().close();
    useJob.getState().unload();
    useUi.getState().go('job');
  });

  it('puts the drawing on the table where nothing lies there, and keeps its job up to date', () => {
    cam().addSketch(RECT);
    expect(loaded()).toBe(own().single);
    const before = useJob.getState().lines.join('\n');
    cam().addSketch(HOLE);
    expect(loaded()).toBe(own().single);
    expect(useJob.getState().lines.join('\n')).not.toBe(before);
    expect(cam().ahead).toBe(false);
  });

  it('leaves another program alone: only the tap on "Zeichnung zeigen" replaces it', () => {
    useJob.getState().load('part.nc', 'G0 X1\n');
    cam().addSketch(RECT);
    cam().addSketch(HOLE);
    expect(loaded()).toBe('part.nc');
    expect(useJob.getState().lines).toEqual(['G0 X1']);
    expect(cam().remake({ take: true })).toBe(true);
    expect(loaded()).toBe(own().single);
  });

  it('keeps the aligned back of a two-sided part when the front is edited', () => {
    cam().addSketch(RECT);
    useJob.getState().load(own().back, 'G0 X2\n');
    cam().addSketch(HOLE);
    expect(loaded()).toBe(own().back);
    expect(useJob.getState().lines).toEqual(['G0 X2']);
  });

  it('never replaces a program that is running, wherever it comes from', () => {
    useJob.getState().load('part.nc', 'G0 X1\n');
    running();
    expect(jobUnderWay()).toBe(true);
    cam().addSketch(RECT);
    expect(loaded()).toBe('part.nc');
    // not even the operator's tap
    expect(cam().remake({ take: true })).toBe(false);
    expect(loaded()).toBe('part.nc');
    expect(useJob.getState().lines).toEqual(['G0 X1']);
  });

  it("keeps the drawing's own running program on the table while the drawing changes", () => {
    cam().addSketch(RECT);
    const name = loaded();
    const text = useJob.getState().lines.join('\n');
    running();
    // a part added, moved, removed, the whole drawing cleared: none of it reaches the table
    cam().addSketch(HOLE);
    expect(cam().ahead).toBe(true);
    expect(loaded()).toBe(name);
    expect(useJob.getState().lines.join('\n')).toBe(text);
    cam().clear();
    expect(loaded()).toBe(name);
    expect(useJob.getState().lines.join('\n')).toBe(text);
    expect(useJob.getState().analysis).not.toBeNull();
  });

  it('removing the last part under a running job does not unload it', () => {
    cam().addSketch(RECT);
    const id = cam().project!.items[0]!.id;
    running();
    cam().removeItem(id);
    expect(loaded()).toBe(own().single);
    expect(useJob.getState().analysis).not.toBeNull();
    expect(cam().ahead).toBe(true);
  });

  it('counts a multi-tool job that waits between its parts as running', () => {
    cam().addSketch(RECT);
    const key = `${loaded()}:${useJob.getState().lines.length}`;
    useRun.setState({ phase: 'between', jobKey: key });
    expect(jobUnderWay()).toBe(true);
    cam().addSketch(HOLE);
    expect(cam().ahead).toBe(true);
    expect(useJob.getState().lines.length).toBe(Number(key.split(':')[1]));
    // a job that is no longer the loaded one waits for nothing
    useRun.setState({ jobKey: 'other.nc:3' });
    expect(jobUnderWay()).toBe(false);
    useRun.setState({ phase: 'uploading', jobKey: key });
    expect(jobUnderWay()).toBe(true);
    useRun.setState({ phase: 'idle' });
    expect(jobUnderWay()).toBe(false);
  });

  it('a stream that runs counts, one that ended does not', () => {
    useMachine.setState({ stream: { result: 'running' } as never });
    expect(jobUnderWay()).toBe(true);
    useMachine.setState({ stream: { result: 'done' } as never });
    expect(jobUnderWay()).toBe(false);
    useMachine.setState({ stream: null });
  });

  it('says it is ahead until the drawing is on the table again – by the tap, not by itself', () => {
    cam().addSketch(RECT);
    running();
    cam().addSketch(HOLE);
    expect(cam().ahead).toBe(true);
    stopped();
    // the finished job's program is still what is loaded: nothing replaced it behind the operator's back
    expect(loaded()).toBe(own().single);
    expect(cam().ahead).toBe(true);
    expect(cam().remake({ take: true })).toBe(true);
    expect(cam().ahead).toBe(false);
  });

  it('puts the drawing on the table by itself when the job ends and nothing lies there', () => {
    // the page was reloaded under a job: the machine runs, the app has no program
    running();
    cam().addSketch(RECT);
    expect(loaded()).toBeNull();
    expect(cam().ahead).toBe(true);
    stopped();
    expect(loaded()).toBe(own().single);
    expect(cam().ahead).toBe(false);
  });

  it('does not put the drawing over another program when the job ends', () => {
    useJob.getState().load('part.nc', 'G0 X1\n');
    running();
    cam().addSketch(RECT);
    expect(cam().ahead).toBe(false);
    stopped();
    expect(loaded()).toBe('part.nc');
  });

  it('keeps following the drawing when the first import gives it a new name', () => {
    cam().addSketch(RECT);
    expect(loaded()).toBe('zeichnung.nc');
    cam().importFile('schild.svg', SVG);
    expect(cam().project!.name).toBe('schild');
    // the program that lay there was the drawing's own: it follows the drawing, under its new name
    expect(loaded()).toBe('schild.nc');
    expect(ownsTable('schild.nc')).toBe(true);
    expect(cam().ahead).toBe(false);
    expect(useJob.getState().lines.join('\n')).toContain('G1');
    // and it is taken off the table again when nothing is left to cut
    cam().clear();
    expect(loaded()).toBeNull();
  });

  it('leaves no orphan on the table when the drawing is cleared after a rename', () => {
    cam().addSketch(RECT);
    cam().importFile('schild.svg', SVG);
    cam().clear();
    expect(loaded()).toBeNull();
    expect(useJob.getState().analysis).toBeNull();
  });

  it('knows its own program only while it lies there', () => {
    cam().addSketch(RECT);
    const name = own().single;
    expect(ownsTable(name)).toBe(true);
    expect(ownsTable('part.nc')).toBe(false);
    cam().close();
    expect(ownsTable(name)).toBe(false);
  });

  it('does not say the drawing changed when the program would be the same', () => {
    cam().addSketch(RECT);
    running();
    expect(cam().remake()).toBe(false);
    expect(cam().ahead).toBe(false);
    cam().addSketch(HOLE);
    expect(cam().ahead).toBe(true);
    stopped();
    expect(cam().remake({ take: true })).toBe(true);
    expect(cam().ahead).toBe(false);
  });

  it('holds the guard while a job is lost with the link, until the operator has seen it', () => {
    cam().addSketch(RECT);
    const text = useJob.getState().lines.join('\n');
    running();
    // the connection drops under the job: the store learns first, then the job's promise ends
    useMachine.setState({
      connection: 'disconnected',
      lostInJob: { name: 'x.nc', sd: true, at: 0 },
    });
    stopped();
    expect(jobUnderWay()).toBe(true);
    cam().addSketch(HOLE);
    expect(useJob.getState().lines.join('\n')).toBe(text);
    expect(cam().ahead).toBe(true);
    useMachine.getState().acknowledgeLost();
    expect(jobUnderWay()).toBe(false);
  });

  it('puts nothing on the table by itself when the job ended with the link lost', () => {
    running();
    cam().addSketch(RECT);
    expect(loaded()).toBeNull();
    useMachine.setState({
      connection: 'disconnected',
      lostInJob: { name: 'x.nc', sd: true, at: 0 },
    });
    stopped();
    useMachine.getState().acknowledgeLost();
    expect(loaded()).toBeNull();
    expect(cam().ahead).toBe(true);
  });

  it('the series closes over its own program only', () => {
    cam().addSketch(RECT);
    useSeries.setState({
      open: true,
      made: { fileName: 'serie-3.nc', zero: { x: 0, y: 0 }, count: 3 },
    });
    useJob.getState().load('serie-3.nc', 'G0 X3\n');
    useSeries.getState().close();
    expect(loaded()).toBe(own().single);
    // another program opened since stays where it is
    useSeries.setState({
      open: true,
      made: { fileName: 'serie-3.nc', zero: { x: 0, y: 0 }, count: 3 },
    });
    useJob.getState().load('part.nc', 'G0 X1\n');
    useSeries.getState().close();
    expect(loaded()).toBe('part.nc');
  });
});
