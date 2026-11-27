// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../src/i18n';
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
