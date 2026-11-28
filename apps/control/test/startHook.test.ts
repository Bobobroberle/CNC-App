// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../src/i18n';
import { sectionFileName } from '../src/lib/sections';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { requestStart, useStart } from '../src/store/start';

// The readiness list is its own subject (readiness.test.ts): here nothing in it blocks, so the
// reasons that are the hook's own – no link, a viewer, an upload, a job running, a machine that is
// not at rest – are what is tested. (A mutation of the "not at rest" line used to survive: the other
// reasons stood in for it in every test that reached the machine's state.)
vi.mock('../src/store/readiness', () => ({
  useReadiness: () => ({ items: [], collisions: [], clamps: [] }),
}));

// The earlier tests put a stub in the store's place; the ones below run the real thing.
const realStartPart = useRun.getState().startPart;

const PROGRAM = 'G21 G90\nG0 Z5\nM3 S10000\nG0 X10 Y10\nG1 Z-1 F300\nG1 X20\nG0 Z5\nM5\nM30\n';

describe('why the start cannot be held (store/start.ts)', () => {
  beforeEach(() => {
    useRun.getState().reset();
    useJob.getState().unload();
    useJob.getState().load('part.nc', PROGRAM);
    useMachine.setState({
      connection: 'connected',
      viewer: false,
      fileJob: null,
      stream: null,
      homed: true,
      status: { state: 'Idle', mpos: [0, 0, 5], wco: [10, 10, 0] } as never,
    });
  });
  afterEach(() => {
    useMachine.setState({ connection: 'disconnected', status: null, viewer: false });
    useJob.getState().unload();
  });

  const reason = () => renderHook(() => useStart()).result.current?.reason;

  it('has no reason when everything is in order – the start can be held', () => {
    expect(reason()).toBeNull();
  });

  it('says there is no link before anything else', () => {
    useMachine.setState({ connection: 'disconnected' });
    expect(reason()).toBe(t('ready.offline'));
  });

  it('says a device that only watches cannot start', () => {
    useMachine.setState({ viewer: true });
    expect(reason()).toBe(t('reason.viewer'));
  });

  it('says a job is running', () => {
    useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
    expect(reason()).toBe(t('ready.busy'));
  });

  it('says the machine is not at rest – with nothing else against the start (the mutation that survived)', () => {
    for (const state of ['Run', 'Hold:0', 'Jog', 'Home', 'Door:0', 'Check']) {
      useMachine.setState({
        status: { state, mpos: [0, 0, 5], wco: [10, 10, 0] } as never,
      });
      expect(reason(), state).toBe(t('ready.busy'));
    }
  });

  it('says a part is being uploaded', () => {
    useRun.setState({ phase: 'uploading', jobKey: `part.nc:${useJob.getState().lines.length}` });
    expect(reason()).toBe(t('runPanel.uploading'));
  });

  it('has no start at all without a program', () => {
    useJob.getState().unload();
    expect(renderHook(() => useStart()).result.current).toBeNull();
  });

  describe('the start between two parts – the same question as the bar asks', () => {
    const between = () =>
      useRun.setState({
        phase: 'between',
        jobKey: `part.nc:${useJob.getState().lines.length}`,
        partIndex: 0,
        confirmed: [],
        asking: null,
      });

    it('asks first when something is left to confirm: nothing starts', () => {
      const startPart = vi.fn(async () => {});
      useRun.setState({ startPart } as never);
      between();
      // a zero that has never been set is confirmed before a start (DESIGN.md §6.4)
      useMachine.setState({ status: { state: 'Idle', mpos: [0, 0, 5], wco: [0, 0, 0] } as never });
      const start = renderHook(() => useStart()).result.current!;
      expect(start.phase).toBe('between');
      expect(start.pending).toEqual(['zero']);
      requestStart(start);
      expect(startPart).not.toHaveBeenCalled();
      expect(useRun.getState().asking).toEqual(['zero']);
    });

    it('starts the part at once when everything was confirmed before', () => {
      const startPart = vi.fn(async () => {});
      useRun.setState({ startPart } as never);
      between();
      useRun.setState({ confirmed: ['zero'] });
      useMachine.setState({ status: { state: 'Idle', mpos: [0, 0, 5], wco: [0, 0, 0] } as never });
      const start = renderHook(() => useStart()).result.current!;
      expect(start.pending).toEqual([]);
      requestStart(start);
      expect(startPart).toHaveBeenCalledWith(start.index);
      expect(useRun.getState().asking).toBeNull();
    });

    describe('after a tool change', () => {
      const TWO_TOOLS =
        'G21 G90\nT1 M6\nG0 Z5\nS10000 M3\nG0 X10 Y10\nG1 Z-1 F300\nG1 X20\nG0 Z5\nM5\nT2 M6\nS10000 M3\nG0 X30 Y10\nG1 Z-1 F300\nG1 X40\nG0 Z5\nM5\nM30\n';
      const loadTwo = (partIndex: number, confirmed: string[] = []) => {
        useJob.getState().unload();
        useJob.getState().load('two.nc', TWO_TOOLS);
        useRun.setState({
          phase: 'between',
          jobKey: `two.nc:${useJob.getState().lines.length}`,
          partIndex,
          confirmed: confirmed as never,
          asking: null,
        });
      };

      it('the first part asks nothing of the kind; the part after a change asks – every time, even when confirmed before', () => {
        loadTwo(0);
        const first = renderHook(() => useStart()).result.current!;
        expect(first.parts.map((p) => p.tool)).toEqual([1, 2]);
        expect(first.warnings).toEqual([]);
        loadTwo(1);
        const second = renderHook(() => useStart()).result.current!;
        expect(second.warnings).toEqual(['toolChange']);
        expect(second.pending).toEqual(['toolChange']);
        loadTwo(1, ['toolChange']);
        expect(renderHook(() => useStart()).result.current!.pending).toEqual(['toolChange']);
      });

      it('the hold asks instead of starting: nothing goes to the machine until the second hold', () => {
        const startPart = vi.fn(async () => {});
        useRun.setState({ startPart } as never);
        loadTwo(1);
        requestStart(renderHook(() => useStart()).result.current!);
        expect(startPart).not.toHaveBeenCalled();
        expect(useRun.getState().asking).toEqual(['toolChange']);
      });
    });

    it('does nothing at all while something blocks the start', () => {
      const startPart = vi.fn(async () => {});
      useRun.setState({ startPart } as never);
      between();
      useMachine.setState({ connection: 'disconnected' });
      const start = renderHook(() => useStart()).result.current!;
      expect(start.reason).not.toBeNull();
      requestStart(start);
      expect(startPart).not.toHaveBeenCalled();
      expect(useRun.getState().asking).toBeNull();
    });
  });
});

// The spindle still holds the tool the LAST part ran with: the first part of the next piece
// ("Nächstes Teil: gleicher Job") and the first part after "Job abbrechen" need the same question
// as a part after a change in the middle of a job.
describe('the tool the spindle holds after the last part started (useRun.lastTool)', () => {
  const TWO_TOOLS =
    'G21 G90\nT1 M6\nG0 Z5\nS10000 M3\nG0 X10 Y10\nG1 Z-1 F300\nG1 X20\nG0 Z5\nM5\nT2 M6\nS10000 M3\nG0 X30 Y10\nG1 Z-1 F300\nG1 X40\nG0 Z5\nM5\nM30\n';
  const keyOf = (name: string) => `${name}:${useJob.getState().lines.length}`;
  const load = (name: string, text: string) => {
    useJob.getState().unload();
    useJob.getState().load(name, text);
  };
  const start = () => renderHook(() => useStart()).result.current!;
  const originals = {
    uploadToSd: useMachine.getState().uploadToSd,
    runSdFile: useMachine.getState().runSdFile,
    command: useMachine.getState().command,
  };

  beforeEach(() => {
    useRun.setState({ startPart: realStartPart, lastTool: null } as never);
    useRun.getState().reset();
    useMachine.setState({
      connection: 'connected',
      viewer: false,
      fileJob: null,
      stream: null,
      homed: true,
      status: { state: 'Idle', mpos: [0, 0, 5], wco: [10, 10, 0] } as never,
      // a machine that takes every part and cuts it to its end
      uploadToSd: async () => true,
      runSdFile: async () => {
        useMachine.setState({ lastFileResult: 'done' });
      },
      command: (async () => {}) as never,
    });
  });
  afterEach(() => {
    useMachine.setState({ connection: 'disconnected', status: null, viewer: false, ...originals });
    useJob.getState().unload();
  });

  const cutBothParts = async () => {
    await useRun.getState().startPart(0);
    await useRun.getState().startPart(1);
  };

  it('is remembered when a part starts to run – with the job it belongs to', async () => {
    load('two.nc', TWO_TOOLS);
    expect(useRun.getState().lastTool).toBeNull();
    await useRun.getState().startPart(0);
    expect(useRun.getState().lastTool).toEqual({ key: keyOf('two.nc'), tool: 1 });
    await useRun.getState().startPart(1);
    expect(useRun.getState().lastTool).toEqual({ key: keyOf('two.nc'), tool: 2 });
  });

  it('asks about the tool change at the first part of the next piece – T2 is in the spindle, T1 comes first', async () => {
    load('two.nc', TWO_TOOLS);
    await cutBothParts();
    expect(useRun.getState().phase).toBe('done');
    useRun.getState().nextPiece();
    const next = start();
    expect(next.index).toBe(0);
    expect(next.part.tool).toBe(1);
    expect(next.warnings).toEqual(['toolChange']);
    expect(next.pending).toEqual(['toolChange']);
    // asked every time, even once it was confirmed for this job
    useRun.setState({ confirmed: ['toolChange'] });
    expect(start().pending).toEqual(['toolChange']);
    // and the hold asks instead of starting
    const startPart = vi.fn(async () => {});
    useRun.setState({ startPart } as never);
    requestStart(start());
    expect(startPart).not.toHaveBeenCalled();
    expect(useRun.getState().asking).toEqual(['toolChange']);
  });

  it('asks nothing for a job with one tool, however often it is cut', async () => {
    load('one.nc', PROGRAM);
    await useRun.getState().startPart(0);
    expect(useRun.getState().phase).toBe('done');
    useRun.getState().nextPiece();
    expect(start().warnings).toEqual([]);
    expect(start().pending).toEqual([]);
    // a program that names no tool at all is no change either
    expect(useRun.getState().lastTool).toEqual({ key: keyOf('one.nc'), tool: undefined });
  });

  it('asks nothing at the very first start of a job: nothing was started before', () => {
    load('two.nc', TWO_TOOLS);
    expect(useRun.getState().lastTool).toBeNull();
    expect(start().index).toBe(0);
    expect(start().warnings).toEqual([]);
  });

  it('never compares with the tool of another job', async () => {
    load('two.nc', TWO_TOOLS);
    await cutBothParts();
    // a different program lies on the table: it starts with T1, the last tool run was T2 – of the other job
    load('other.nc', TWO_TOOLS.replace('G1 X40', 'G1 X41'));
    useRun.getState().reset();
    const other = start();
    expect(other.index).toBe(0);
    expect(other.part.tool).toBe(1);
    expect(other.warnings).toEqual([]);
  });

  it('is kept by "Job abbrechen" between two parts: the next first part asks', async () => {
    load('two.nc', TWO_TOOLS);
    await useRun.getState().startPart(0);
    expect(useRun.getState().phase).toBe('between');
    useRun.getState().reset();
    expect(useRun.getState().lastTool).toEqual({ key: keyOf('two.nc'), tool: 1 });
    // T1 is in the spindle and part 0 is T1: nothing to ask
    expect(start().warnings).toEqual([]);
    // the second part was started, then the operator abandoned the job
    await useRun.getState().startPart(1);
    useRun.getState().reset();
    expect(useRun.getState().lastTool).toEqual({ key: keyOf('two.nc'), tool: 2 });
    expect(start().index).toBe(0);
    expect(start().warnings).toEqual(['toolChange']);
  });

  it('LIMIT, pinned: the next section of a long job is a program of its own – its first part asks nothing, though the last tool of the section before is in the spindle', async () => {
    // store/sections.ts puts every section on the table under its own file name (`sectionFileName`), so it is another job
    // to `useRun.lastTool`, which compares only within one job. Each section keeps its T and M6 lines (camToolsFlip).
    const first = sectionFileName('long', 0, 2);
    const second = sectionFileName('long', 1, 2);
    expect(second).not.toBe(first);
    load(first, TWO_TOOLS);
    await cutBothParts();
    expect(useRun.getState().lastTool).toEqual({ key: keyOf(first), tool: 2 });
    load(second, TWO_TOOLS);
    useRun.getState().reset();
    const next = start();
    expect(next.index).toBe(0);
    expect(next.part.tool).toBe(1);
    expect(next.warnings).toEqual([]);
  });

  it('does not change the rule inside a job: the part after a change still asks', () => {
    load('two.nc', TWO_TOOLS);
    useRun.setState({ phase: 'between', jobKey: keyOf('two.nc'), partIndex: 1 });
    expect(start().warnings).toEqual(['toolChange']);
  });
});
