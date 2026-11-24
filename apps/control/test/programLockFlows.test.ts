import { circle, IDENTITY, rectangle } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alignJobTo } from '../src/components/ZeroTool';
import { loadLongDemo } from '../src/store/demo';
import { useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { makeSections } from '../src/lib/sections';
import { useHoles } from '../src/store/holes';
import { useJob } from '../src/store/job';
import { useJigs } from '../src/store/jigs';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { useSections } from '../src/store/sections';
import { useUi } from '../src/store/ui';
import { useWorkshop } from '../src/store/workshop';
import '../src/store/underway';

/**
 * The central lock refuses a program on the table while a job is under way. The flows that load one
 * as part of something bigger (a zero moved, a plan changed, "applied" said) must not do the rest
 * either: each stops before its first step, says so once, and leaves everything as it is.
 */
const running = () => useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
const stopped = () => useMachine.setState({ fileJob: null });
const loaded = () => useJob.getState().fileName;
const refusals = () => useMachine.getState().log.filter((l) => l.key === 'job.locked').length;

describe('flows that load a program stop before their first step while a job is under way', () => {
  const setZeroAt = vi.fn(async (_to: unknown) => true);
  const realSetZeroAt = useMachine.getState().setZeroAt;
  beforeEach(() => {
    stopped();
    useRun.getState().reset();
    useCam.getState().close();
    useFlip.getState().setPlan(null);
    useJob.getState().unload();
    useJob.getState().load('part.nc', 'G21\nG0 X1\n');
    useJob.setState({ measuredAngle: null });
    useUi.getState().go('start');
    setZeroAt.mockClear();
    setZeroAt.mockImplementation(async () => true);
    useMachine.setState({
      connection: 'connected',
      log: [],
      setZeroAt: setZeroAt as never,
      status: { state: 'Idle', wco: [0, 0, 0], mpos: [0, 0, 0] } as never,
    });
  });
  afterEach(() => {
    stopped();
    useRun.getState().reset();
    useFlip.getState().setPlan(null);
    useJob.getState().unload();
    useMachine.setState({ connection: 'disconnected', status: null, setZeroAt: realSetZeroAt });
  });

  it('the two-hole alignment neither moves the zero nor turns the program', async () => {
    useHoles.setState({
      a: { x: 10, y: 5 },
      b: { x: 110, y: 5 },
      jobA: { x: 0, y: 0 },
      jobB: { x: 100, y: 0 },
    });
    running();
    expect(await useHoles.getState().applyTwoHoles()).toBe(false);
    expect(setZeroAt).not.toHaveBeenCalled();
    expect(loaded()).toBe('part.nc');
    expect(useJob.getState().measuredAngle).toBeNull();
    expect(refusals()).toBe(1);
    // and where nothing runs it works as ever
    stopped();
    expect(await useHoles.getState().applyTwoHoles()).toBe(true);
    expect(setZeroAt).toHaveBeenCalledTimes(1);
  });

  it('turning to a measured edge says no and does not claim to have turned', () => {
    running();
    expect(alignJobTo(3)).toBe(false);
    expect(loaded()).toBe('part.nc');
    expect(useJob.getState().measuredAngle).toBeNull();
    stopped();
    expect(alignJobTo(3)).toBe(true);
    expect(useJob.getState().measuredAngle).toBe(3);
  });

  describe('the two-sided job', () => {
    const cut = { zero: { x: 100, y: 50 }, pose: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } };
    const camera = useWorkshop.getState().settings.camera;
    afterEach(() => {
      const { settings, setSettings } = useWorkshop.getState();
      setSettings({ camera: { ...settings.camera, ...camera } });
    });
    beforeEach(() => {
      // the drawing makes its plan where no foreign program lies on the table
      useJob.getState().unload();
      openCam();
      const cam = useCam.getState();
      cam.setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
      cam.add([rectangle(0, 0, 200, 80), circle(60, 40, 30)]);
      cam.setTwoSided({ thickness: 12 });
      const pocket = useCam.getState().project!.items[1]!;
      cam.setItem(pocket.id, { kind: 'pocket', depth: 3, side: 'back' });
      useFlip.setState({ phase: 'turn', cut });
      useJob.getState().unload();
      useJob.getState().load('part.nc', 'G21\nG0 X1\n');
      useMachine.setState({ log: [] });
    });

    it('turning the board puts neither the back on the table nor the phase on "back"', async () => {
      running();
      expect(await useFlip.getState().turned()).toBe(false);
      expect(loaded()).toBe('part.nc');
      expect(useFlip.getState().phase).toBe('turn');
      expect(refusals()).toBe(1);
      stopped();
      expect(await useFlip.getState().turned()).toBe(true);
      expect(loaded()).toContain('rueckseite');
    });

    it('finding the part anew keeps the phase', () => {
      // with the camera set up the part is found again by it
      const { settings, setSettings } = useWorkshop.getState();
      setSettings({ camera: { ...settings.camera, scaleCalibrated: true, focusHeight: 30 } });
      useJob.getState().unload();
      expect(useCam.getState().remake()).toBe(true);
      expect(useFlip.getState().plan!.method).toBe('camera');
      useJob.getState().unload();
      useJob.getState().load('part.nc', 'G21\nG0 X1\n');
      useMachine.setState({ log: [] });
      useFlip.setState({ phase: 'back', cut });
      running();
      useFlip.getState().relocate();
      expect(loaded()).toBe('part.nc');
      expect(useFlip.getState().phase).toBe('back');
      expect(refusals()).toBe(1);
    });
  });

  it('the long example neither moves the zero nor loads', async () => {
    running();
    expect(await loadLongDemo()).toBe(false);
    expect(setZeroAt).not.toHaveBeenCalled();
    expect(loaded()).toBe('part.nc');
    expect(refusals()).toBe(1);
  });

  it('a profile change while a job runs gives the loaded program its new estimate – quietly', () => {
    const before = useJob.getState().analysis;
    running();
    const { profile } = useJob.getState();
    useJob.getState().setProfileSettings({
      travel: profile.travel,
      softLimits: profile.softLimits,
      jogFeed: profile.jogFeed,
      kinematics: {
        ...profile.kinematics,
        axes: {
          ...profile.kinematics.axes,
          x: { ...profile.kinematics.axes.x!, maxRate: 600 },
        },
      },
    });
    expect(useJob.getState().analysis).not.toBe(before);
    expect(loaded()).toBe('part.nc');
    expect(refusals()).toBe(0);
    // the estimate is the one for the new rate (X now at 600 mm/min), not the one for the old
    expect(useJob.getState().analysis!.timeline!.total).toBeGreaterThan(before!.timeline!.total);
  });

  describe('the flows of the sections and the jigs', () => {
    const LONG = [
      'G21 G90',
      'G0 Z5',
      'M3 S18000',
      'G0 X100 Y100',
      'G1 Z-3 F300',
      'G0 Z5',
      'G0 X1900 Y100',
      'G1 Z-3 F300',
      'G0 Z5',
      'G0 X0 Y40',
      'G1 Z-2 F300',
      'G1 X2000 F1200',
      'G1 Y160',
      'G1 X0',
      'G1 Y40',
      'G0 Z5',
      'M5',
      'M30',
    ].join('\n');
    const job = makeSections({
      source: { fileName: 'regal.nc', text: LONG, original: null, pose: IDENTITY },
      axis: 'x',
      travel: { min: 3, max: 1223 },
      zero: { x: 100, y: 50 },
      toolDiameter: 3,
    });
    if ('problem' in job) throw new Error('no sections');

    beforeEach(() => {
      useSections.setState({ job, index: 0, phase: 'cut', cut: null, angle: 0 });
      useMachine.setState({ log: [] });
    });
    afterEach(() => {
      useSections.setState({ job: null, index: 0, phase: 'cut', cut: null });
    });

    it('giving up the flow while a job is under way changes nothing and says why', () => {
      running();
      useSections.getState().cancel();
      expect(useSections.getState().job).not.toBeNull();
      expect(refusals()).toBe(1);
      stopped();
      useSections.getState().cancel();
      expect(useSections.getState().job).toBeNull();
    });

    it('putting the section on the table again is refused as long as the job is under way', () => {
      useJob.getState().unload();
      useJob.getState().load('other.nc', 'G0 X1\n');
      useMachine.setState({ log: [] });
      // the lost link: no file job, no stream – but the operator has not seen it yet
      useMachine.setState({ lostInJob: { name: 'x.nc', sd: true, at: 0 } });
      useSections.getState().loadSection();
      expect(loaded()).toBe('other.nc');
      useMachine.setState({ lostInJob: null });
      useSections.getState().loadSection();
      expect(loaded()).toContain('abschnitt');
    });
  });

  it('a jig job is not loaded while a job is under way', () => {
    const jig = {
      id: 'j1',
      name: 'Rahmen',
      tags: [],
      job: { fileName: 'jig.nc', text: 'G21\nG0 X5\n', toolDiameter: 3 },
      reach: 0,
      clamps: [],
      createdAt: 0,
    };
    useWorkshop.setState((s) => ({ jigs: [...s.jigs, jig as never] }));
    running();
    expect(useJigs.getState().loadJob('j1')).toBe(false);
    expect(loaded()).toBe('part.nc');
    stopped();
    expect(useJigs.getState().loadJob('j1')).toBe(true);
    expect(loaded()).toBe('jig.nc');
    useWorkshop.setState((s) => ({ jigs: s.jigs.filter((j) => j.id !== 'j1') }));
  });
});
