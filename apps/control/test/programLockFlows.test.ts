import { circle, rectangle } from '@lowrider/cam';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alignJobTo } from '../src/components/ZeroTool';
import { loadLongDemo } from '../src/store/demo';
import { useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useHoles } from '../src/store/holes';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
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
const said = (text: string) => useMachine.getState().log.some((l) => l.text === text);

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
    expect(said('')).toBe(false);
  });
});
