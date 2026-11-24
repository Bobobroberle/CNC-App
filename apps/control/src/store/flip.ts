import { applyToPoint, IDENTITY, poseOf, registrationLayout, type Matrix } from '@lowrider/cam';
import { transformProgram } from '@lowrider/gcode-core';
import type { JobRecord, Vec } from '@lowrider/workshop';
import { create } from 'zustand';
import { t } from '../i18n';
import {
  backHoles,
  expectedHoles,
  loadedSide,
  locateBack,
  type FlipPhase,
  type FlipPlan,
} from '../lib/flip';
import { browserStorage, isFullDemo, loadJson, saveJson } from '../lib/persist';
import { isSimulatorAddress, simulator, SURFACE_Z } from '../sim';
import { scanDemoMap } from './demoMap';
import { HOLE_DISTANCE_LIMIT, useHoles } from './holes';
import { useJob } from './job';
import { useMachine } from './machine';
import { onJobEnd } from './recorder';
import { settled } from './settle';
import { useWorkshop } from './workshop';
import { programRefused } from './underway';

const KEY = 'lowrider-control.flip';

/**
 * Where a two-sided job stands: the front is to be cut, the part is to be
 * turned over, its holes are to be found (camera), the back is to be cut,
 * both sides are done.
 */
export type { FlipPhase } from '../lib/flip';

/** How the front lay when it was cut: where its work zero was and how its program was turned. */
export interface FrontCut {
  /** Machine XY of the work zero */
  zero: Vec;
  /** The program on the table against the program as made (aligned to an edge) */
  pose: Matrix;
}

interface FlipStore {
  plan: FlipPlan | null;
  phase: FlipPhase;
  cut: FrontCut | null;
  /** The holes as the camera found them after the turn, machine XY */
  found: { a: Vec | null; b: Vec | null };
  /** How the turned part lies, once found: its turn and how well the hole distance fits */
  fit: { rotation: number; distanceError: number } | null;
  /** The hole the camera is looking for right now */
  seeking: 'a' | 'b' | null;
  /**
   * Why the last search led nowhere: the machine could not drive there,
   * nothing round was in the picture, or the two holes found do not fit.
   */
  trouble: 'no-move' | 'no-hole' | 'mismatch' | null;
  /** The simulator's board has been turned over for this job (it has no operator to do it) */
  simulated: boolean;
  /**
   * The two-sided job as the drawing made it, or null for a one-sided one.
   * A front that is already cut stays cut as long as its program is the same.
   */
  setPlan(plan: FlipPlan | null): void;
  /** Loads the front program as the job */
  loadFront(): void;
  /** The front has been cut with the zero and the program as they are now */
  frontCut(): boolean;
  /**
   * The part has been turned over: loads the back program where the part is
   * expected. On pins that is where it is (the zero goes back to the
   * front's); with the camera the holes are looked for next.
   */
  turned(): Promise<boolean>;
  /**
   * Finds a registration hole with the camera: drives over where it should
   * be (`drive`) or looks where the camera stands. With both found the back
   * program is laid onto the part.
   */
  seek(which: 'a' | 'b', drive: boolean): Promise<boolean>;
  /** Back to turning the part over */
  again(): void;
  /** Back to finding the holes: the part was moved, or a wrong hole was taken */
  relocate(): void;
  /** The back has been cut too */
  finish(): void;
  /** Ends the two-sided job */
  cancel(): void;
}

interface Stored {
  plan: FlipPlan;
  phase: FlipPhase;
  cut: FrontCut | null;
}

/** What survives a reload: the two programs and whether the front is cut. The part is found anew. */
function stored(): Stored | null {
  return loadJson<Stored | null>(
    browserStorage,
    KEY,
    (v) => {
      const s = v as Partial<Stored> | null;
      const text = (p?: { fileName?: unknown; text?: unknown }) =>
        typeof p?.fileName === 'string' && typeof p.text === 'string';
      if (!s?.plan || !text(s.plan.front) || !text(s.plan.back) || !s.plan.holes || !s.plan.flip) {
        return null;
      }
      const cut = s.cut?.zero && s.cut.pose ? s.cut : null;
      return { plan: s.plan, phase: s.phase === 'done' ? 'done' : cut ? 'turn' : 'front', cut };
    },
    null,
  );
}

/** The loaded job by the name it was made with (an aligned copy counts as its original). */
const loadedName = () => {
  const { original, fileName } = useJob.getState();
  return original?.fileName ?? fileName;
};

const NOT_FOUND = { a: null, b: null };

/** The simulator's operator: turns the board as the plan says, on pins or by hand. */
function turnSimulatedBoard(plan: FlipPlan, cut: FrontCut) {
  const sim = simulator();
  const onTable = (p: Vec) => {
    const q = applyToPoint(cut.pose, p);
    return sim.physical({ x: cut.zero.x + q.x, y: cut.zero.y + q.y, z: SURFACE_Z });
  };
  const layout = registrationLayout(plan.flip.axis, plan.holes);
  // Holes that lie askew: the flip line as drawn, turned with the front.
  const drawn = ((poseOf(cut.pose).rotation + (plan.flip.axis === 'x' ? 90 : 0)) * Math.PI) / 180;
  sim.flipBoard(
    onTable(plan.holes.a),
    onTable(plan.holes.b),
    layout === 'askew' ? drawn : layout,
    plan.method === 'pins',
  );
  // The demo's map showed the front: laid anew, as a scan after turning would.
  if (isFullDemo()) scanDemoMap();
}

export const useFlip = create<FlipStore>((set, get) => {
  const save = () => {
    const { plan, phase, cut } = get();
    saveJson(browserStorage, KEY, plan ? { plan, phase, cut } : null);
  };
  /** The back program as the job, lying as the front did: the part turned over on the spot. */
  const loadBack = (plan: FlipPlan, cut: FrontCut) => {
    const job = useJob.getState();
    job.load(plan.back.fileName, plan.back.text);
    const pose = poseOf(cut.pose);
    if (Math.abs(pose.rotation) > 1e-6 || Math.hypot(pose.offset.x, pose.offset.y) > 1e-6) {
      const lying = transformProgram(plan.back.text, { ...pose, pivot: { x: 0, y: 0 } });
      job.loadDerived(plan.back.fileName.replace(/\.nc$/, '_ausgerichtet.nc'), lying.text, {
        by: cut.pose,
        from: 'original',
      });
    }
  };
  /** Both holes found: zero and turn of the back program, through the two-hole alignment. */
  const align = async (plan: FlipPlan, found: { a: Vec; b: Vec }) => {
    const fit = locateBack(plan, found);
    if (!fit || Math.abs(fit.distanceError) > HOLE_DISTANCE_LIMIT) {
      set({ trouble: 'mismatch', fit: fit && { ...fit } });
      useMachine.getState().addLog('error', t('camera.holesMismatch'), 'camera.holesMismatch');
      return false;
    }
    // Zero and program belong together: with a job under way neither is touched.
    if (programRefused()) return false;
    const back = backHoles(plan);
    useHoles.setState({ a: found.a, b: found.b, jobA: back.a, jobB: back.b });
    // From the program as made: the alignment turns it about its zero.
    if (!useJob.getState().load(plan.back.fileName, plan.back.text)) return false;
    if (!(await useHoles.getState().applyTwoHoles())) return false;
    set({ phase: 'back', fit: { rotation: fit.rotation, distanceError: fit.distanceError } });
    save();
    return true;
  };

  const initial = stored();
  return {
    plan: initial?.plan ?? null,
    phase: initial?.phase ?? 'front',
    cut: initial?.cut ?? null,
    found: NOT_FOUND,
    fit: null,
    seeking: null,
    trouble: null,
    simulated: false,

    setPlan(next) {
      const { plan, phase } = get();
      if (!next) {
        // A one-sided drawing ends a two-sided job only while nothing of it is cut.
        if (plan && phase === 'front') get().cancel();
        return;
      }
      const sameFront =
        plan !== null &&
        plan.front.text === next.front.text &&
        plan.method === next.method &&
        plan.flip.axis === next.flip.axis &&
        plan.flip.at === next.flip.at;
      if (sameFront && phase !== 'front') {
        // The front is cut and stays: a changed back is laid onto the part anew.
        const sameBack = plan.back.text === next.back.text;
        set({
          plan: next,
          ...(sameBack ? {} : { phase: 'turn', found: NOT_FOUND, fit: null, trouble: null }),
        });
      } else {
        set({
          plan: next,
          phase: 'front',
          cut: null,
          found: NOT_FOUND,
          fit: null,
          trouble: null,
          simulated: false,
        });
      }
      save();
    },

    loadFront() {
      const { plan } = get();
      if (plan) useJob.getState().load(plan.front.fileName, plan.front.text);
    },

    frontCut() {
      const { plan } = get();
      const wco = useMachine.getState().status?.wco;
      if (!plan || !wco) return false;
      const front = loadedSide(plan, loadedName()) === 'front';
      set({
        phase: 'turn',
        cut: {
          zero: { x: wco[0] ?? 0, y: wco[1] ?? 0 },
          pose: front ? useJob.getState().pose : IDENTITY,
        },
        found: NOT_FOUND,
        fit: null,
        trouble: null,
        simulated: false,
      });
      save();
      return true;
    },

    async turned() {
      const { plan, cut } = get();
      const machine = useMachine.getState();
      if (!plan || !cut || !machine.status) return false;
      // The back goes on the table before the turn counts: not while a job is under way.
      if (programRefused()) return false;
      // Once per job: confirming the turn again (to find the part anew) leaves the board as it lies.
      if (isSimulatorAddress(machine.url) && !get().simulated) {
        turnSimulatedBoard(plan, cut);
        set({ simulated: true });
      }
      loadBack(plan, cut);
      if (plan.method === 'pins') {
        // The pins stand where the front drilled them: the zero must be the front's.
        const [x = 0, y = 0] = machine.status.wco;
        const moved = Math.hypot(x - cut.zero.x, y - cut.zero.y) > 0.005;
        if (moved && !(await machine.setZeroAt({ x: cut.zero.x, y: cut.zero.y }))) return false;
        set({ phase: 'back', fit: null, trouble: null });
      } else {
        set({ phase: 'locate', found: NOT_FOUND, fit: null, trouble: null });
      }
      save();
      return true;
    },

    async seek(which, drive) {
      const { plan, cut } = get();
      const machine = useMachine.getState();
      if (!plan || !cut || get().seeking || !machine.status) return false;
      set({ seeking: which, trouble: null });
      try {
        if (drive) {
          const camera = useWorkshop.getState().settings.camera;
          const { jogFeed } = useJob.getState().profile;
          const target = expectedHoles(plan, cut.zero, cut.pose)[which];
          // Camera height first: only there does its scale fit.
          const z = (camera.focusHeight ?? 0) + (machine.status.wco[2] ?? 0);
          const atHeight = Math.abs((machine.status.mpos[2] ?? 0) - z) < 0.05;
          const over = { x: target.x - camera.offsetX, y: target.y - camera.offsetY };
          const there =
            (atHeight || (await machine.moveMachine({ z }, jogFeed.z))) &&
            (await machine.moveMachine(over, jogFeed.xy)) &&
            (await settled(over)) !== null;
          if (!there) {
            set({ trouble: 'no-move' });
            return false;
          }
        }
        if (!(await useHoles.getState().findHole(which))) {
          set({ trouble: 'no-hole' });
          return false;
        }
        const found = { ...get().found, [which]: useHoles.getState()[which] };
        set({ found });
        return found.a && found.b ? await align(plan, { a: found.a, b: found.b }) : true;
      } finally {
        set({ seeking: null });
      }
    },

    again() {
      const { plan, cut } = get();
      if (!plan || !cut) return;
      set({ phase: 'turn', found: NOT_FOUND, fit: null, trouble: null });
      save();
    },

    relocate() {
      const { plan, cut } = get();
      if (!plan || !cut || plan.method !== 'camera' || programRefused()) return;
      loadBack(plan, cut);
      set({ phase: 'locate', found: NOT_FOUND, fit: null, trouble: null });
      save();
    },

    finish() {
      set({ phase: 'done' });
      save();
    },

    cancel() {
      set({
        plan: null,
        phase: 'front',
        cut: null,
        found: NOT_FOUND,
        fit: null,
        trouble: null,
        simulated: false,
      });
      save();
    },
  };
});

/** A job ran to its end: the front of a two-sided job leads on to turning the part, its back ends it. */
export function flipJobEnded(record: Pick<JobRecord, 'result'>) {
  const { plan, phase, frontCut } = useFlip.getState();
  if (!plan || record.result !== 'done') return;
  const side = loadedSide(plan, loadedName());
  if (side === 'front' && phase === 'front') {
    if (frontCut()) useMachine.getState().addLog('info', t('flip.frontDone'));
  } else if (side === 'back' && phase === 'back') {
    useFlip.getState().finish();
    useMachine.getState().addLog('info', t('flip.bothDone', { name: plan.name }));
  }
}

onJobEnd(flipJobEnded);
