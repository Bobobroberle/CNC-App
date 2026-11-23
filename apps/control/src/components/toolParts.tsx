import { t } from '../i18n';
import type { Point } from '../lib/camera';
import { formatCoordinate } from '../lib/format';
import { useMachine } from '../store/machine';
import { useStageTools } from '../store/tools';
import { Button } from '../ui/button';

/** A machine point in work coordinates, as the grid and the position tile show it. */
export function PointLine({ point }: { point: Point }) {
  const wcoX = useMachine((s) => s.status?.wco[0] ?? 0);
  const wcoY = useMachine((s) => s.status?.wco[1] ?? 0);
  return (
    <p className="tabular-nums tool-point" title={t('status.work')}>
      <span>X {formatCoordinate(point.x - wcoX, 1)}</span>
      <span>Y {formatCoordinate(point.y - wcoY, 1)}</span>
    </p>
  );
}

/** Discards what was tapped for the active tool. */
export function ClearButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="tool-clear"
      aria-label={t('stageTools.clear')}
      title={t('stageTools.clear')}
      onClick={() => useStageTools.getState().clear()}
    >
      ×
    </Button>
  );
}
