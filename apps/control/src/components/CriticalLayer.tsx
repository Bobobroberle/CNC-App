import { OctagonAlertIcon } from 'lucide-react';
import { t } from '../i18n';
import { useMachine } from '../store/machine';
import { useUi } from '../store/ui';
import { Button } from '../ui/button';
import { Dialog, DialogPopup, DialogTitle } from '../ui/dialog';

/**
 * The critical message (DESIGN.md §6.3, §6.4): the connection was lost while
 * a job ran. It covers the whole work area until it is acknowledged and says
 * what it is, why, what follows and what to do. Nothing is taken up again by
 * itself: connecting is the operator's step, and no job goes on after it.
 * (It does not pulse: alarms are never animated in this app.)
 */
export function CriticalLayer() {
  const lost = useMachine((s) => s.lostInJob);
  const { acknowledgeLost } = useMachine.getState();
  const go = useUi((s) => s.go);
  return (
    <Dialog open={lost !== null} onOpenChange={() => undefined}>
      <DialogPopup className="critical" data-testid="critical">
        <div className="critical-body" role="alert">
          <OctagonAlertIcon aria-hidden="true" className="critical-icon" />
          <DialogTitle className="critical-title">{t('critical.lost.title')}</DialogTitle>
          <dl className="critical-facts">
            <dt>{t('critical.job')}</dt>
            <dd>{lost?.name}</dd>
            <dt>{t('critical.cause')}</dt>
            <dd>{t('critical.lost.cause')}</dd>
            <dt>{t('critical.effect')}</dt>
            <dd>{t(lost?.sd ? 'critical.lost.effectSd' : 'critical.lost.effectStream')}</dd>
            <dt>{t('critical.action')}</dt>
            <dd>{t('critical.lost.action')}</dd>
            <dt>{t('critical.since')}</dt>
            <dd className="tabular-nums">{lost ? new Date(lost.at).toLocaleTimeString() : ''}</dd>
          </dl>
          <div className="critical-actions">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                acknowledgeLost();
                go('settings', 'connection');
              }}
            >
              {t('critical.toConnection')}
            </Button>
            <Button variant="destructive" size="lg" onClick={acknowledgeLost}>
              {t('critical.acknowledge')}
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
