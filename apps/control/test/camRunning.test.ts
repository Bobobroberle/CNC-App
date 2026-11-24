import { circle, rectangle, type Sketch } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { jobNames, ownsTable, useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { openCam } from '../src/store/camPlace';
import { useRun } from '../src/store/run';
import { useSeries } from '../src/store/series';
import { jobUnderWay, underwayOf, type UnderwayInput } from '../src/store/underway';
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

  it('a change of the back alone under a running job still leaves the drawing ahead', () => {
    cam().add([rectangle(0, 0, 200, 80), circle(60, 40, 30)]);
    cam().setTwoSided({ thickness: 12 });
    const pocket = cam().project!.items[1]!;
    cam().setItem(pocket.id, { kind: 'pocket', depth: 3, side: 'back' });
    expect(loaded()).toBe(own().front);
    const back = useFlip.getState().plan!.back.text;
    running();
    // the front stays the same, only the back is made deeper
    cam().setItem(pocket.id, { depth: 4 });
    expect(cam().ahead).toBe(true);
    expect(useFlip.getState().plan!.back.text).toBe(back);
    stopped();
  });

  it('the series with nothing left to engrave gives back its own program only', () => {
    cam().addSketch(RECT);
    const made = { fileName: 'serie-3.nc', zero: { x: 0, y: 0 }, count: 3 };
    useMachine.setState({ status: { wco: [0, 0, 0] } as never });
    useSeries.setState({ open: true, made, blanks: [] });
    // another program opened since stays where it is …
    useJob.getState().load('part.nc', 'G0 X1\n');
    expect(useSeries.getState().make()).toBe(false);
    expect(useSeries.getState().made).toBeNull();
    expect(loaded()).toBe('part.nc');
    // … while the series' own program gives way to the drawing's
    useSeries.setState({ made });
    useJob.getState().load('serie-3.nc', 'G0 X3\n');
    expect(useSeries.getState().make()).toBe(false);
    expect(loaded()).toBe(own().single);
    useSeries.setState({ open: false, made: null });
    useMachine.setState({ status: null });
  });

  it("still knows the drawing's own program while a plan of a two-sided job lingers", () => {
    cam().add([rectangle(0, 0, 200, 80), circle(60, 40, 30)]);
    cam().setTwoSided({ thickness: 12 });
    const pocket = cam().project!.items[1]!;
    cam().setItem(pocket.id, { kind: 'pocket', depth: 3, side: 'back' });
    useFlip.setState({
      phase: 'back',
      cut: { zero: { x: 100, y: 50 }, pose: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } },
    });
    // the only back item goes to the front: the drawing's single program is on the table, the
    // plan of the cut front stays (the front is cut) – and it is still the drawing's own
    cam().setItem(pocket.id, { side: 'front' });
    expect(useFlip.getState().plan).not.toBeNull();
    expect(loaded()).toBe(own().single);
    expect(ownsTable(loaded())).toBe(true);
  });

  it("keeps a finished job's program through every further change, until the tap", () => {
    cam().addSketch(RECT);
    const text = useJob.getState().lines.join('\n');
    running();
    cam().addSketch(HOLE);
    useRun.setState({ phase: 'done' });
    stopped();
    expect(cam().ahead).toBe(true);
    // worked on after the end: still the finished program, still its summary
    cam().addSketch({ type: 'circle', d: 8 });
    expect(loaded()).toBe(own().single);
    expect(useJob.getState().lines.join('\n')).toBe(text);
    expect(useRun.getState().phase).toBe('done');
    expect(cam().ahead).toBe(true);
    // the tap puts the drawing there, and then it is a program to start
    expect(cam().remake({ take: true })).toBe(true);
    expect(useJob.getState().lines.join('\n')).not.toBe(text);
    expect(cam().ahead).toBe(false);
    // from here on the drawing follows again without a tap
    const again = useJob.getState().lines.join('\n');
    cam().addSketch({ type: 'circle', d: 6 });
    expect(useJob.getState().lines.join('\n')).not.toBe(again);
  });

  it('is not ahead any more when the drawing is brought back to the finished program', () => {
    cam().addSketch(RECT);
    const id = () => cam().project!.items.at(-1)!.id;
    running();
    cam().addSketch(HOLE);
    expect(cam().ahead).toBe(true);
    stopped();
    cam().undo();
    // the drawing is what lies on the table again: nothing to put there, nothing left behind
    expect(cam().ahead).toBe(false);
    expect(id()).toBeDefined();
  });

  const SD = (percent = 42) => ({ percent, file: '/sd/schild.nc' });
  const report = (state: string, sd?: { percent: number; file: string }) =>
    useMachine.setState({ status: { state, ...(sd ? { sd } : {}) } as never });

  it('holds the guard for a job only the controller reports: a reload, a link made again', () => {
    cam().addSketch(RECT);
    const text = useJob.getState().lines.join('\n');
    // the page was reloaded under a job: no job of the app's, but the report names the SD file
    report('Run', SD());
    expect(jobUnderWay()).toBe(true);
    cam().addSketch(HOLE);
    expect(useJob.getState().lines.join('\n')).toBe(text);
    expect(cam().ahead).toBe(true);
    // held or parked at the door, the file stays in the report: still a job
    report('Hold:0', SD());
    expect(jobUnderWay()).toBe(true);
    report('Door:1', SD());
    expect(jobUnderWay()).toBe(true);
    // a report without a link says nothing
    useMachine.setState({ connection: 'disconnected' });
    expect(jobUnderWay()).toBe(false);
    useMachine.setState({ connection: 'connected', status: null });
  });

  it('is no job when the app only moves the machine itself: the drawing goes on the table', () => {
    cam().addSketch(RECT);
    const text = useJob.getState().lines.join('\n');
    // probing, driving to the zero, measuring: the controller reports Run – with no SD file
    report('Run');
    expect(jobUnderWay()).toBe(false);
    cam().addSketch(HOLE);
    expect(useJob.getState().lines.join('\n')).not.toBe(text);
    expect(cam().ahead).toBe(false);
    report('Hold:0');
    expect(jobUnderWay()).toBe(false);
    useMachine.setState({ status: null });
  });

  it("keeps a finished job's program when the machine moves afterwards", () => {
    cam().addSketch(RECT);
    const text = useJob.getState().lines.join('\n');
    running();
    cam().addSketch(HOLE);
    useRun.setState({ phase: 'done' });
    stopped();
    expect(cam().ahead).toBe(true);
    // a measuring move, a macro, the way to the park position: nothing to do with the finished job
    report('Run');
    report('Idle');
    expect(useJob.getState().lines.join('\n')).toBe(text);
    expect(useRun.getState().phase).toBe('done');
    expect(cam().ahead).toBe(true);
    useMachine.setState({ status: null });
  });

  it('keeps the guard after a lost link is acknowledged and made again under a running file – and after it ends', () => {
    cam().addSketch(RECT);
    const text = useJob.getState().lines.join('\n');
    running();
    cam().addSketch(HOLE);
    useMachine.setState({
      connection: 'disconnected',
      lostInJob: { name: 'x.nc', sd: true, at: 0 },
    });
    stopped();
    useMachine.getState().acknowledgeLost();
    expect(jobUnderWay()).toBe(false);
    // connected by hand: the controller still cuts from its card
    useMachine.setState({ connection: 'connected' });
    report('Run', SD());
    expect(jobUnderWay()).toBe(true);
    cam().addSketch({ type: 'circle', d: 8 });
    expect(useJob.getState().lines.join('\n')).toBe(text);
    expect(cam().ahead).toBe(true);
    // the run ends: the program of that job stays until the tap
    report('Idle');
    expect(jobUnderWay()).toBe(false);
    expect(useJob.getState().lines.join('\n')).toBe(text);
    expect(cam().ahead).toBe(true);
    cam().addSketch({ type: 'circle', d: 6 });
    expect(useJob.getState().lines.join('\n')).toBe(text);
    useMachine.setState({ status: null });
  });

  it("does not take a finished job's program off the table when the drawing is emptied – the tap does", () => {
    cam().addSketch(RECT);
    const name = loaded();
    running();
    cam().addSketch(HOLE);
    useRun.setState({ phase: 'done' });
    stopped();
    cam().clear();
    expect(loaded()).toBe(name);
    expect(useRun.getState().phase).toBe('done');
    expect(cam().ahead).toBe(true);
    // the tap on an empty drawing: nothing to put there, and the finished program goes
    expect(cam().remake({ take: true })).toBe(false);
    expect(loaded()).toBeNull();
    expect(cam().ahead).toBe(false);
  });

  it('a drawing whose parts give no moves: an edit keeps the finished program, the tap takes it off', () => {
    cam().addSketch(RECT);
    const name = loaded();
    running();
    cam().addSketch(HOLE);
    useRun.setState({ phase: 'done' });
    stopped();
    expect(cam().ahead).toBe(true);
    // only a 2 mm circle is left, cut on the inside with the 6 mm tool: a part, but nothing to cut
    for (const item of [...cam().project!.items]) cam().removeItem(item.id);
    cam().addSketch({ type: 'circle', d: 2 });
    cam().setItem(cam().project!.items[0]!.id, { kind: 'inside' });
    expect(cam().project!.items).toHaveLength(1);
    expect(cam().remake()).toBe(false);
    expect(loaded()).toBe(name);
    expect(cam().ahead).toBe(true);
    // the tap: the program that is not the drawing's any more goes
    expect(cam().remake({ take: true })).toBe(false);
    expect(loaded()).toBeNull();
    expect(cam().ahead).toBe(false);
  });

  it('series: the same program again stays where it is – a finished series keeps its summary', () => {
    cam().addSketch(RECT);
    useMachine.setState({ status: { wco: [0, 0, 0] } as never });
    const blank = {
      id: 0,
      kind: 'rect' as const,
      x: 300,
      y: 300,
      length: 150,
      width: 100,
      angle: 0,
      outline: [
        { x: 225, y: 250 },
        { x: 375, y: 250 },
        { x: 375, y: 350 },
        { x: 225, y: 350 },
      ],
      measured: true,
    };
    useSeries.setState({ open: true, blanks: [blank] });
    expect(useSeries.getState().make()).toBe(true);
    const name = loaded();
    const lines = useJob.getState().lines;
    useRun.setState({ phase: 'done' });
    // asked again with nothing changed: no new program, so the summary of the finished one stays
    expect(useSeries.getState().make()).toBe(true);
    expect(loaded()).toBe(name);
    expect(useJob.getState().lines).toBe(lines);
    expect(useRun.getState().phase).toBe('done');
    useSeries.setState({ open: false, made: null, blanks: [] });
    useMachine.setState({ status: null });
  });
});

describe('who says a job is under way', () => {
  const none: UnderwayInput = {
    fileJob: false,
    streaming: false,
    lost: false,
    connected: true,
    state: 'Idle',
    sdFile: false,
    phase: 'idle',
    ownJob: false,
  };
  it('counts what the app knows of, and what the controller reports with an SD file', () => {
    expect(underwayOf(none)).toBe(false);
    expect(underwayOf({ ...none, fileJob: true })).toBe(true);
    expect(underwayOf({ ...none, streaming: true })).toBe(true);
    expect(underwayOf({ ...none, lost: true, connected: false })).toBe(true);
    for (const phase of ['uploading', 'running', 'between']) {
      expect(underwayOf({ ...none, phase, ownJob: true }), phase).toBe(true);
      // a job that is no longer the loaded program waits for nothing
      expect(underwayOf({ ...none, phase }), phase).toBe(false);
    }
    for (const state of ['Run', 'Hold:0', 'Hold:1', 'Door:0', 'Door:1']) {
      expect(underwayOf({ ...none, state, sdFile: true }), state).toBe(true);
      // a move of the app's own has the same states, but no SD file
      expect(underwayOf({ ...none, state }), state).toBe(false);
    }
    // an SD file in the report of a machine at rest, jogging, homing or in alarm is no job
    for (const state of ['Idle', 'Jog', 'Home', 'Alarm', 'Check', undefined]) {
      expect(underwayOf({ ...none, state, sdFile: true }), String(state)).toBe(false);
    }
    // no link, no report
    expect(underwayOf({ ...none, state: 'Run', sdFile: true, connected: false })).toBe(false);
  });
});
