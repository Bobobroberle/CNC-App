import { rotation } from '@lowrider/cam';
import { transformProgram } from '@lowrider/gcode-core';
import { useState } from 'react';
import { t } from '../i18n';
import { skewAngle, type Point } from '../lib/camera';
import { formatNumber, formatSigned } from '../lib/format';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useStageTools, type StagePoint, type ZeroStep } from '../store/tools';
import { HoldButton } from './HoldButton';
import { Loupe, NudgePad } from './Loupe';
import { ClearButton } from './toolParts';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const STEPS: ZeroStep[] = ['corner', 'edge'];

/**
 * Turns the job to a measured edge. Always from the job as it was loaded, so
 * measuring the same edge twice does not turn it twice.
 */
export function alignJobTo(angle: number): boolean {
  const { fileName, lines, original, loadDerived, setMeasuredAngle } = useJob.getState();
  if (!fileName) return false;
  const source = original ?? { fileName, text: lines.join('\n') };
  const r = transformProgram(source.text, { rotation: angle, pivot: { x: 0, y: 0 } });
  // `loadDerived` keeps the job as loaded to go back to – and says no while a job is under way.
  const turned = loadDerived(`${source.fileName.replace(/\.[^.]*$/, '')}_ausgerichtet.nc`, r.text, {
    by: rotation(angle),
    from: 'original',
  });
  if (!turned) return false;
  setMeasuredAngle(angle);
  useMachine.getState().addLog('info', t('camera.aligned', { angle: formatNumber(angle, 2) }));
  return true;
}

/** What the tool just did, said once in its panel */
type Done = { kind: 'zero' } | { kind: 'aligned' | 'kept'; angle: number } | null;

function DoneLine({ done }: { done: Done }) {
  if (!done) return null;
  return (
    <Alert variant="success" data-testid="zero-done">
      {done.kind === 'zero'
        ? t('stageTools.zeroDone')
        : t(done.kind === 'aligned' ? 'camera.aligned' : 'camera.angleKept', {
            angle: formatNumber(done.angle, 2),
          })}
    </Alert>
  );
}

/** Says when the live picture put the point on the workpiece's corner or edge. */
function SnapLine({ point }: { point: StagePoint }) {
  if (!point.snapped) return null;
  return (
    <p className="tool-small" data-testid="zero-snap">
      {t('stageTools.snapped', { what: t(`stageTools.snaps.${point.snapped}`) })}
    </p>
  );
}

/** Step 1: the work zero on a tapped corner, placed finely under the loupe. */
function CornerStep({
  points,
  onDone,
}: {
  points: readonly StagePoint[];
  onDone: (done: Done) => void;
}) {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const wcoX = useMachine((s) => s.status?.wco[0] ?? 0);
  const wcoY = useMachine((s) => s.status?.wco[1] ?? 0);
  const point = points[points.length - 1];
  if (!point)
    return <p className="text-muted-foreground text-sm tool-hint">{t('stageTools.hints.zero')}</p>;
  const move = (to: Point) => useStageTools.getState().movePoint(points.length - 1, to);
  const set = () =>
    void useMachine
      .getState()
      .setZeroAt({ x: point.x, y: point.y })
      .then((ok) => {
        if (!ok) return;
        // On to the edge: a board rarely lies square to the machine.
        useStageTools.getState().setZeroStep('edge');
        onDone({ kind: 'zero' });
      });
  return (
    <>
      <div className="tool-fine">
        <Loupe point={point} onMove={move} />
        <div className="tool-side">
          <NudgePad point={point} onMove={move} corner={<ClearButton />} />
          <HoldButton variant="accent" disabled={!idle} onConfirm={set}>
            {t('stageTools.setZero')}
          </HoldButton>
        </div>
      </div>
      <div className="tool-facts">
        <SnapLine point={point} />
        {/* What setting the zero changes: how far it moves, from where to where. */}
        <p className="tabular-nums" data-testid="zero-shift">
          {t('stageTools.zeroShift', {
            dx: formatSigned(point.x - wcoX, 1, true),
            dy: formatSigned(point.y - wcoY, 1, true),
          })}
        </p>
        <p className="text-muted-foreground text-sm tabular-nums tool-small">
          {t('stageTools.zeroFromTo', {
            x0: formatSigned(wcoX),
            y0: formatSigned(wcoY),
            x1: formatSigned(point.x),
            y1: formatSigned(point.y),
          })}
        </p>
      </div>
    </>
  );
}

/** Step 2: two points along an edge give its angle; the job is turned to it. */
function EdgeStep({
  points,
  onDone,
}: {
  points: readonly StagePoint[];
  onDone: (done: Done) => void;
}) {
  const hasJob = useJob((s) => s.fileName !== null);
  const [a, b] = points;
  if (!a)
    return <p className="text-muted-foreground text-sm tool-hint">{t('stageTools.hints.edge')}</p>;
  const last = points.length - 1;
  const move = (to: Point) => useStageTools.getState().movePoint(last, to);
  const angle = b ? skewAngle(a, b) : 0;
  const finish = (done: Done) => {
    useStageTools.getState().clear();
    onDone(done);
  };
  const keep = () => {
    useJob.getState().setMeasuredAngle(angle);
    useMachine.getState().addLog('info', t('camera.angleKept', { angle: formatNumber(angle, 2) }));
    finish({ kind: 'kept', angle });
  };
  return (
    <>
      <div className="tool-fine">
        <Loupe point={points[last]!} onMove={move} />
        <div className="tool-side">
          <NudgePad point={points[last]!} onMove={move} corner={<ClearButton />} />
          {/* One step from the angle to the aligned job; without a job the angle is kept for it. */}
          {b && hasJob ? (
            <Button onClick={() => alignJobTo(angle) && finish({ kind: 'aligned', angle })}>
              {t('camera.alignJob')}
            </Button>
          ) : null}
          {b && !hasJob ? (
            <Button variant="outline" onClick={keep}>
              {t('camera.useAngle')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="tool-facts">
        <SnapLine point={points[last]!} />
        {b ? (
          <p className="tabular-nums" data-testid="edge-angle">
            {t('stageTools.edgeAngle', { angle: formatSigned(angle, 2) })}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{t('stageTools.secondPoint')}</p>
        )}
      </div>
    </>
  );
}

/**
 * The work zero by fingertip, in the order it is done at the machine: tap
 * the corner of the workpiece, place it under the loupe, hold to set – then,
 * if the board lies askew, two taps along an edge turn the job to it.
 */
export function ZeroPanel({ points }: { points: readonly StagePoint[] }) {
  const step = useStageTools((s) => s.zeroStep);
  const [done, setDone] = useState<Done>(null);
  return (
    <>
      {/* The steps are chosen before a point is tapped; with one, the room belongs to placing it. */}
      {points.length === 0 ? (
        <div className="tool-head">
          <SegmentedControl
            className="tool-steps"
            role="group"
            aria-label={t('stageTools.zeroSteps.label')}
          >
            {STEPS.map((s, i) => (
              <SegmentedControlItem
                key={s}
                pressed={step === s}
                onClick={() => {
                  setDone(null);
                  useStageTools.getState().setZeroStep(s);
                }}
              >
                {i + 1} · {t(`stageTools.zeroSteps.${s}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
      ) : null}
      {/* What it just did stands in place of the hint, with what comes next. */}
      {points.length === 0 && done ? (
        <DoneLine done={done} />
      ) : step === 'corner' ? (
        <CornerStep points={points} onDone={setDone} />
      ) : (
        <EdgeStep points={points} onDone={setDone} />
      )}
    </>
  );
}
