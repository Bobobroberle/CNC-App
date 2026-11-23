import { estimateAccuracy, wearTrend } from '@lowrider/workshop';
import { useState } from 'react';
import { t } from '../i18n';
import { downloadText } from '../lib/download';
import { formatCoordinate, formatDuration, formatNumber, getLocale } from '../lib/format';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Sparkline } from './Sparkline';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert } from '../ui/alert';

/** Job history with deviation trend across jobs (belt wear, loose screws) and estimate accuracy. */
export function HistoryCard() {
  const history = useWorkshop((s) => s.history);
  const materials = useWorkshop((s) => s.materials);
  const { clearHistory } = useWorkshop.getState();
  const [open, setOpen] = useState<string | null>(null);
  const wear = wearTrend(history);
  const accuracy = estimateAccuracy(history);
  const measured = history.filter((r) => r.result === 'done' && r.deviation);
  const newestFirst = [...history].reverse();

  return (
    <Card className="gap-3 p-4" data-testid="history-card" data-find="history">
      <CardTitle render={<h2 />}>{t('history.title')}</CardTitle>
      {history.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('history.empty')}</p>
      ) : null}
      {wear ? (
        <Alert variant={wear.warning ? 'warning' : 'success'} data-testid="wear-trend">
          {wear.warning ? t('history.wearWarning') : t('history.wearOk')}{' '}
          {t('history.wearNumbers', {
            baseline: formatCoordinate(wear.baseline, 3),
            latest: formatCoordinate(wear.latest, 3),
            slope: formatCoordinate(wear.slopePer10Jobs, 3),
          })}
        </Alert>
      ) : history.length > 0 ? (
        <p className="text-muted-foreground text-sm">{t('history.wearNeedsJobs')}</p>
      ) : null}
      <Sparkline
        points={measured.map((r, i) => [i, r.deviation!.mean])}
        label={t('history.acrossJobs')}
        xUnit="index"
      />
      {accuracy !== null ? (
        <p className="text-muted-foreground text-sm">
          {t('history.accuracy', { percent: formatNumber(accuracy, 1) })}
        </p>
      ) : null}
      <ul className="parts">
        {newestFirst.slice(0, 50).map((r) => (
          <li key={r.id} className="part">
            <Button
              variant="outline"
              className="history-row"
              aria-expanded={open === r.id}
              onClick={() => setOpen(open === r.id ? null : r.id)}
            >
              <span>
                <strong>{r.file}</strong> · {new Date(r.startedAt).toLocaleString(getLocale())}
              </span>
              <Badge variant={r.result === 'done' ? 'success' : 'error'}>
                {t(`history.results.${r.result}`)}
              </Badge>
            </Button>
            {open === r.id ? (
              <dl className="facts">
                <dt>{t('history.duration')}</dt>
                <dd>
                  {formatDuration(r.duration)} ({t('history.estimate')} {formatDuration(r.estimate)}
                  )
                </dd>
                <dt>{t('job.tools')}</dt>
                <dd>{r.tools.length > 0 ? r.tools.map((n) => `T${n}`).join(', ') : '—'}</dd>
                <dt>{t('history.material')}</dt>
                <dd>{materials.find((m) => m.id === r.materialId)?.name ?? '—'}</dd>
                <dt>{t('history.override')}</dt>
                <dd>{r.feedOverride} %</dd>
                <dt>{t('history.alarms')}</dt>
                <dd>{r.alarms.length > 0 ? r.alarms.join(', ') : '—'}</dd>
                <dt>{t('status.deviation')}</dt>
                <dd>
                  {r.deviation
                    ? t('history.deviationValues', {
                        mean: formatCoordinate(r.deviation.mean, 3),
                        p95: formatCoordinate(r.deviation.p95, 3),
                        max: formatCoordinate(r.deviation.max, 3),
                      })
                    : '—'}
                </dd>
              </dl>
            ) : null}
            {open === r.id ? (
              <Sparkline points={r.trend} label={t('history.deviationTrend')} warn={0.5} />
            ) : null}
          </li>
        ))}
      </ul>
      {history.length > 0 ? (
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => downloadText('lowrider-historie.json', JSON.stringify(history, null, 2))}
          >
            {t('history.export')}
          </Button>
          <HoldButton onConfirm={clearHistory}>{t('history.clear')}</HoldButton>
        </div>
      ) : null}
    </Card>
  );
}
