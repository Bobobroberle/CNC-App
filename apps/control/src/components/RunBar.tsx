import { t } from '../i18n';
import { formatDuration, formatNumber } from '../lib/format';
import { useMachine } from '../store/machine';
import { useJobProgress } from '../store/progress';
import { isStep, useUi } from '../store/ui';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';

/**
 * A running job stays in reach from the start screen, the side areas and the jog panel: progress, time left,
 * pause or resume, and the way back to the full job view.
 */
export function RunBar({ here = false }: { here?: boolean } = {}) {
  const progress = useJobProgress();
  const place = useUi((s) => s.place);
  const jogOpen = useUi((s) => s.jogOpen);
  const go = useUi((s) => s.go);
  const checking = useUi((s) => s.views.run === 'check');
  const { feedHold, cycleStart } = useMachine.getState();
  // The shell shows it on Start, in the side areas and over the jog panel; a step shows its
  // own (`here`) – all but Fräsen's cutting view, which is the job's full view.
  const onStep = isStep(place) && !jogOpen;
  const full = place === 'run' && !checking;
  if (!progress || (here ? !onStep || full : onStep)) return null;
  return (
    <div className="run-bar" data-testid="run-bar">
      <div className="run-bar-info">
        <strong>{progress.name}</strong>
        <span className="text-muted-foreground text-sm tabular-nums">
          {progress.percent !== undefined ? `${formatNumber(progress.percent, 0)} %` : '—'}
          {progress.remaining !== null
            ? ` · ${t('runBar.left', { time: formatDuration(progress.remaining) })}`
            : ''}
        </span>
        <Progress aria-hidden="true" value={Math.min(100, progress.percent ?? 0)} />
      </div>
      {progress.holding ? (
        <Button onClick={cycleStart}>{t('files.resume')}</Button>
      ) : (
        <Button variant="outline" onClick={feedHold}>
          {t('files.pause')}
        </Button>
      )}
      <Button variant="outline" onClick={() => go('run')}>
        {t('runBar.open')}
      </Button>
    </div>
  );
}
