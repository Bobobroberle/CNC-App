import { create } from 'zustand';
import type { Point } from '../lib/camera';
import type { ClampKind } from '../lib/clamps';

/** A point tapped for a stage tool, machine XY. */
export interface StagePoint extends Point {
  /** The tap snapped to the centre of a round feature (a hole) of this diameter, mm */
  hole?: number;
  /** The tap snapped to the workpiece's corner or edge found in the live picture */
  snapped?: 'corner' | 'edge';
}

/** The zero tool goes in two steps: the corner of the workpiece, then one of its edges */
export type ZeroStep = 'corner' | 'edge';

/**
 * The tap tool of the stage and the points tapped for it. Points are machine
 * XY: the table view gets them from its view transform, the camera view from
 * the picture's calibration, so a tool works the same in both. The tools
 * themselves are listed in `components/StageTools.tsx`.
 */
interface StageToolStore {
  /** Id of the active tool */
  active: string;
  /** Points the active tool keeps, oldest first */
  points: StagePoint[];
  /** The last tap was in the lower half of the stage: the result goes to the top, off the point */
  tappedLow: boolean;
  /** Step of the zero tool */
  zeroStep: ZeroStep;
  /** What the next tap of the clamp tool puts down */
  clampKind: ClampKind;
  /** The clamp zone that is selected (index in `setup.fixtures`), or null */
  zone: number | null;
  /** Chooses a tool; its points start empty */
  select(id: string): void;
  setPoints(points: StagePoint[], tappedLow?: boolean): void;
  /** Moves one point (dragged or nudged); it is a free point from then on */
  movePoint(index: number, to: Point): void;
  clear(): void;
  setZeroStep(step: ZeroStep): void;
  setClampKind(kind: ClampKind): void;
  selectZone(zone: number | null, tappedLow?: boolean): void;
}

export const useStageTools = create<StageToolStore>((set) => ({
  active: 'goto',
  points: [],
  tappedLow: false,
  zeroStep: 'corner',
  clampKind: 'clamp',
  zone: null,
  select: (active) => set({ active, points: [], zone: null, zeroStep: 'corner' }),
  setPoints: (points, tappedLow = false) => set({ points, tappedLow }),
  movePoint: (index, to) =>
    set((s) => ({
      points: s.points.map((p, i) => (i === index ? { x: to.x, y: to.y } : p)),
    })),
  clear: () => set({ points: [] }),
  setZeroStep: (zeroStep) => set({ zeroStep, points: [] }),
  setClampKind: (clampKind) => set({ clampKind }),
  selectZone: (zone, tappedLow) => set((s) => ({ zone, tappedLow: tappedLow ?? s.tappedLow })),
}));
