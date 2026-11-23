import type { ComponentType } from 'react';
import { t, type MessageKey } from '../i18n';
import type { Point } from '../lib/camera';
import { moveZone, resizeZone, zoneAt, zoneHandles } from '../lib/clamps';
import { nearestPoint } from '../lib/measure';
import { addZone, updateZone } from '../store/clamps';
import { useMachine } from '../store/machine';
import { cameraCalibrated } from '../store/photomap';
import { useStageTools, type StagePoint } from '../store/tools';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { ClampPanel } from './ClampTool';
import { HoldButton } from './HoldButton';
import type { IconName } from './Icon';
import { distanceLabel, MeasurePanel } from './MeasureTool';
import { ClearButton, PointLine } from './toolParts';
import { ZeroPanel } from './ZeroTool';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

/** Something on the picture that follows the finger: a tapped point, a clamp. */
export interface StageGrab {
  /** The finger is over this machine point now */
  move(point: Point): void;
}

/**
 * A tap tool of the stage. A tap on the table view or on the camera picture
 * arrives as a machine XY point; the tool decides which points it keeps and
 * what it offers for them. To add a tool, add an entry to `STAGE_TOOLS`.
 */
export interface StageTool {
  id: string;
  label: MessageKey;
  icon: IconName;
  /** One line shown while nothing is tapped yet */
  hint: MessageKey;
  /** Takes a tap and the points kept so far; returns the points to keep */
  onTap(point: StagePoint, kept: readonly StagePoint[], low: boolean): StagePoint[];
  /** Draw a line through the kept points (an edge, a distance) */
  line?: boolean;
  /** What stands at that line (a distance) */
  lineLabel?(points: readonly StagePoint[]): string | null;
  /** What the tool offers for its points; without it the tool only marks them */
  Panel?: ComponentType<{ points: readonly StagePoint[] }>;
  /** The panel is there before the first tap too (it holds the tool's choices) */
  always?: boolean;
  /**
   * What a tap on the live picture snaps to right now: the centre of a hole,
   * the workpiece's corner or its edge – if the picture shows one at the tap.
   */
  snap?(): 'hole' | 'corner' | 'edge';
  /**
   * What a finger coming down at `point` takes hold of, if anything;
   * `tolerance` is the finger's radius in mm at the view's zoom.
   */
  grab?(point: Point, tolerance: number): StageGrab | null;
}

const lastOnly = (point: StagePoint): StagePoint[] => [point];
const lastTwo = (point: StagePoint, kept: readonly StagePoint[]): StagePoint[] => [
  ...kept.slice(-1),
  point,
];

/** A tapped point can be taken and moved to refine it. */
function grabPoint(point: Point, tolerance: number): StageGrab | null {
  const { points } = useStageTools.getState();
  const index = nearestPoint(points, point, tolerance);
  const from = points[index];
  if (!from) return null;
  return {
    // The point keeps its distance from the finger: it does not jump under it.
    move: (to) =>
      useStageTools
        .getState()
        .movePoint(index, { x: from.x + to.x - point.x, y: from.y + to.y - point.y }),
  };
}

/** A clamp zone is moved by its body and resized by a corner or its rim. */
function grabZone(point: Point, tolerance: number): StageGrab | null {
  const tools = useStageTools.getState();
  const { fixtures } = useWorkshop.getState().setup;
  const hit = zoneAt(fixtures, point, tolerance, tools.zone);
  if (!hit) return null;
  tools.selectZone(hit.index);
  const from = fixtures[hit.index]!;
  const handle = zoneHandles(from).find((h) => h.part === hit.part);
  return {
    move(to) {
      const dx = to.x - point.x;
      const dy = to.y - point.y;
      updateZone(
        hit.index,
        handle
          ? resizeZone(from, hit.part, { x: handle.x + dx, y: handle.y + dy })
          : moveZone(from, dx, dy),
      );
    },
  };
}

/** Drive the camera or the cutter to the tapped point. */
function GotoPanel({ points }: { points: readonly StagePoint[] }) {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const homed = useMachine((s) => s.homed);
  const lift = useUi((s) => s.liftBeforeMove);
  const setLift = useUi((s) => s.setLiftBeforeMove);
  const camera = useWorkshop((s) => s.settings.camera);
  const point = points[points.length - 1];
  if (!point) return null;
  const { moveTo } = useMachine.getState();
  const { clear } = useStageTools.getState();
  // The camera can only be sent somewhere once its offset from the cutter is known.
  const withCamera = cameraCalibrated(camera);
  return (
    <>
      <div className="tool-head">
        <PointLine point={point} />
        <Label className="min-h-target gap-3 font-normal">
          <Checkbox
            checked={lift && homed}
            disabled={!homed}
            onCheckedChange={(checked) => setLift(checked)}
          />
          <span>{homed ? t('goto.lift') : t('goto.liftNeedsHoming')}</span>
        </Label>
        <ClearButton />
      </div>
      <div className="tool-actions">
        {withCamera ? (
          <HoldButton
            variant="accent"
            disabled={!idle}
            onConfirm={() =>
              void moveTo({ x: point.x - camera.offsetX, y: point.y - camera.offsetY }, lift).then(
                clear,
              )
            }
          >
            {t('goto.camera')}
          </HoldButton>
        ) : null}
        <HoldButton
          variant={withCamera ? undefined : 'accent'}
          disabled={!idle}
          onConfirm={() => void moveTo(point, lift).then(clear)}
        >
          {t('goto.tool')}
        </HoldButton>
      </div>
    </>
  );
}

export const STAGE_TOOLS: readonly StageTool[] = [
  {
    id: 'goto',
    label: 'stageTools.goto',
    icon: 'goto',
    hint: 'stageTools.hints.goto',
    onTap: lastOnly,
    Panel: GotoPanel,
  },
  {
    // The work zero in two steps: the corner, then – for a board lying askew – an edge.
    id: 'zero',
    label: 'stageTools.zero',
    icon: 'zero',
    hint: 'stageTools.hints.zero',
    onTap: (point, kept) =>
      useStageTools.getState().zeroStep === 'corner' ? lastOnly(point) : lastTwo(point, kept),
    line: true,
    Panel: ZeroPanel,
    always: true,
    snap: () => (useStageTools.getState().zeroStep === 'corner' ? 'corner' : 'edge'),
    grab: grabPoint,
  },
  {
    // Two taps give a distance; a third measures on from the last point.
    id: 'measure',
    label: 'stageTools.measure',
    icon: 'measure',
    hint: 'stageTools.hints.measure',
    onTap: lastTwo,
    line: true,
    lineLabel: distanceLabel,
    Panel: MeasurePanel,
    snap: () => 'hole',
    grab: grabPoint,
  },
  {
    // A tap puts a clamp or a screw on the table; the zones themselves are `setup.fixtures`.
    id: 'clamp',
    label: 'stageTools.clamp.label',
    icon: 'clamp',
    hint: 'stageTools.hints.clamp',
    onTap(point, _kept, low) {
      addZone(useStageTools.getState().clampKind, point, low);
      return [];
    },
    Panel: ClampPanel,
    always: true,
    grab: grabZone,
  },
];

/** The active tool. */
export function activeTool(id: string = useStageTools.getState().active): StageTool {
  return STAGE_TOOLS.find((tool) => tool.id === id) ?? STAGE_TOOLS[0]!;
}

/**
 * A tap on the stage, as machine XY, goes to the active tool. `low` says the
 * tap was in the lower half of the stage, where the result would cover it.
 * Returns how to take the tap back (it may turn out to start a double tap).
 */
export function tapStage(point: StagePoint, low = false): () => void {
  const before = useStageTools.getState();
  const { fixtures } = useWorkshop.getState().setup;
  before.setPoints(activeTool(before.active).onTap(point, before.points, low), low);
  return () => {
    useStageTools.setState({
      points: before.points,
      tappedLow: before.tappedLow,
      zone: before.zone,
    });
    if (useWorkshop.getState().setup.fixtures !== fixtures) {
      useWorkshop.getState().setSetup({ fixtures });
    }
  };
}

/** A finger came down on the stage at a machine point: what the active tool lets it take. */
export function grabStage(point: Point, tolerance: number): StageGrab | null {
  return activeTool().grab?.(point, tolerance) ?? null;
}
