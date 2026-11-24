import { rotation } from '@lowrider/cam';
import { transformProgram } from '@lowrider/gcode-core';
import { twoHoleAlignment, type Vec } from '@lowrider/workshop';
import { create } from 'zustand';
import { t } from '../i18n';
import { formatCoordinate, formatNumber } from '../lib/format';
import { useCalibration } from './calibration';
import { useCamera } from './camera';
import { useJob } from './job';
import { useMachine } from './machine';
import { useWorkshop } from './workshop';
import { programRefused } from './underway';

/** Found holes farther off the job's distance than this are refused, mm */
export const HOLE_DISTANCE_LIMIT = 1;

interface HoleStore {
  /** Machine XY of the two holes once found */
  a: Vec | null;
  b: Vec | null;
  /** Where the two holes are in the job (work XY) */
  jobA: Vec;
  jobB: Vec;
  setJobHoles(patch: { jobA?: Vec; jobB?: Vec }): void;
  /** Centres on the hole under the camera and makes it the X/Y zero */
  zeroOnHole(): Promise<boolean>;
  /** Centres on hole 1 or 2 and keeps where it is */
  findHole(which: 'a' | 'b'): Promise<boolean>;
  /** Zero at hole 1 (job position applied) and the job turned to match hole 2 */
  applyTwoHoles(): Promise<boolean>;
  /** Spindle-to-camera offset from the mark the tool made: the camera finds it itself */
  calibrateOffset(): Promise<boolean>;
}

/** Machine XY of the hole under the crosshair, after centring on it. */
async function centredHole(): Promise<Vec | null> {
  const spindle = await useCalibration.getState().centre();
  if (!spindle) return null;
  const c = useWorkshop.getState().settings.camera;
  return { x: spindle.x + c.offsetX, y: spindle.y + c.offsetY };
}

const round = (v: number) => Number(v.toFixed(3));

export const useHoles = create<HoleStore>((set, get) => ({
  a: null,
  b: null,
  jobA: { x: 0, y: 0 },
  jobB: { x: 100, y: 0 },

  setJobHoles: (patch) => set(patch),

  async zeroOnHole() {
    const hole = await centredHole();
    if (!hole) return false;
    return useMachine.getState().setZeroAt({ x: round(hole.x), y: round(hole.y) });
  },

  async findHole(which) {
    const hole = await centredHole();
    if (!hole) return false;
    set(which === 'a' ? { a: hole } : { b: hole });
    useMachine.getState().addLog(
      'info',
      t('camera.holeFound', {
        n: which === 'a' ? 1 : 2,
        x: formatCoordinate(hole.x, 3),
        y: formatCoordinate(hole.y, 3),
      }),
    );
    return true;
  },

  async applyTwoHoles() {
    const { a, b, jobA, jobB } = get();
    if (!a || !b) return false;
    // The zero moves and the program turns together: with a job under way neither happens.
    if (programRefused()) return false;
    const fit = twoHoleAlignment({ a, b }, { a: jobA, b: jobB });
    const { addLog, setZeroAt } = useMachine.getState();
    if (!fit || Math.abs(fit.distanceError) > HOLE_DISTANCE_LIMIT) {
      addLog('error', t('camera.holesMismatch'), 'camera.holesMismatch');
      return false;
    }
    if (!(await setZeroAt({ x: round(fit.origin.x), y: round(fit.origin.y) }))) return false;
    // Turn the job as loaded, so aligning twice does not add up.
    const job = useJob.getState();
    const source =
      job.original ??
      (job.fileName ? { fileName: job.fileName, text: job.lines.join('\n') } : null);
    if (source && Math.abs(fit.rotation) > 0.001) {
      const turned = transformProgram(source.text, {
        rotation: fit.rotation,
        offset: { x: 0, y: 0 },
        pivot: { x: 0, y: 0 },
      });
      const turnedIn = job.loadDerived(
        `${source.fileName.replace(/\.[^.]*$/, '')}_ausgerichtet.nc`,
        turned.text,
        { by: rotation(fit.rotation), from: 'original' },
      );
      // A job began while the zero was being set: nothing is said to be applied
      if (!turnedIn) return false;
    }
    job.setMeasuredAngle(fit.rotation);
    addLog('info', t('camera.holesApplied', { angle: formatNumber(fit.rotation, 3) }));
    return true;
  },

  async calibrateOffset() {
    const marked = useCamera.getState().marked;
    if (!marked) return false;
    const spindle = await useCalibration.getState().centre();
    if (!spindle) return false;
    const { settings, setSettings } = useWorkshop.getState();
    // The crosshair sits on the mark: spindle + offset = where the tool made it.
    const offset = { x: round(marked.x - spindle.x), y: round(marked.y - spindle.y) };
    setSettings({ camera: { ...settings.camera, offsetX: offset.x, offsetY: offset.y } });
    useCamera.setState({ marked: null });
    useMachine.getState().addLog(
      'info',
      t('camera.offsetSet', {
        x: formatCoordinate(offset.x, 3),
        y: formatCoordinate(offset.y, 3),
      }),
    );
    return true;
  },
}));
