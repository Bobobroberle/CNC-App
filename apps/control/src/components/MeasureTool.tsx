import { t } from '../i18n';
import { formatNumber, formatSigned } from '../lib/format';
import { measure } from '../lib/measure';
import { useJob } from '../store/job';
import type { StagePoint } from '../store/tools';
import { ClearButton } from './toolParts';

/** The distance as it stands on the picture and in the result. */
export function distanceLabel(points: readonly StagePoint[]): string | null {
  const [a, b] = points;
  return a && b ? `${formatNumber(measure(a, b).distance, 1)} mm` : null;
}

/** "Loch Ø 8,0 mm" for a point that snapped to a hole. */
const holeText = (p: StagePoint) =>
  p.hole === undefined ? null : t('stageTools.hole', { mm: formatNumber(p.hole, 1) });

/**
 * Two tapped points: distance, the parts along X and Y and the angle against
 * X. Points that snapped to a hole say so with its diameter, and one line
 * says how far the number can be trusted.
 */
export function MeasurePanel({ points }: { points: readonly StagePoint[] }) {
  const onCamera = useJob((s) => s.view === 'camera');
  const [a, b] = points;
  if (!a) return null;
  const m = b ? measure(a, b) : null;
  const holes = [holeText(a), b ? holeText(b) : null];
  return (
    <>
      <div className="tool-head">
        {m ? (
          <p className="font-semibold text-3xl tabular-nums" data-testid="measure-distance">
            {formatNumber(m.distance, 1)} mm
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{t('stageTools.measureSecond')}</p>
        )}
        <ClearButton />
      </div>
      {m ? (
        <p className="tabular-nums measure-parts" data-testid="measure-parts">
          <span>ΔX {formatSigned(m.dx)}</span>
          <span>ΔY {formatSigned(m.dy)}</span>
          <span>{t('stageTools.measureAngle', { angle: formatSigned(m.angle) })}</span>
        </p>
      ) : null}
      {holes.some((h) => h !== null) ? (
        <p className="tabular-nums" data-testid="measure-snap">
          {m
            ? t('stageTools.measureBetween', {
                a: holes[0] ?? t('stageTools.freePoint'),
                b: holes[1] ?? t('stageTools.freePoint'),
              })
            : t('stageTools.snapped', { what: holes[0]! })}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm tool-small">
        {t(onCamera ? 'stageTools.accuracyCamera' : 'stageTools.accuracyTable')}
      </p>
    </>
  );
}
