import { t } from '../i18n';
import { deviationLevel, formatCoordinate, formatDuration, formatNumber } from '../lib/format';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useJobProgress } from '../store/progress';
import { useSensors } from '../store/sensors';
import { useTrack } from '../store/track';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { Icon } from './Icon';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Card } from '../ui/card';

const AXES = ['X', 'Y', 'Z', 'A'] as const;

/** How much of the possible, as a thin line under the number */
function Bar({ value }: { value: number }) {
  return <Progress aria-hidden="true" value={Math.round(Math.min(1, Math.max(0, value)) * 100)} />;
}

/**
 * The job at a glance, in the action bar of every step: its time or its
 * progress and time left, the line that is being cut and how far off the
 * path the tool is. (Position, feed and spindle are in the status bar.)
 */
export function LiveTiles() {
  const status = useMachine((s) => s.status);
  const wcs = useMachine((s) => s.parserState?.wcs);
  const hasRotary = useJob((s) => s.profile.hasRotary);
  const maxRate = useJob((s) =>
    Math.max(s.profile.kinematics.axes.x.maxRate, s.profile.kinematics.axes.y.maxRate),
  );
  const rpmMax = useWorkshop((s) => s.settings.spindle.rpmMax);
  const { mode, position, live, deviation, maxDeviation, lineIndex, speed } = useTrack();
  // Deviation from the path only means something while a job moves the tool.
  const cutting = status?.state === 'Run' || status?.state.startsWith('Hold') === true;
  const frame = useUi((s) => s.positionFrame);
  const toggleFrame = useUi((s) => s.togglePositionFrame);
  const estimate = useJob((s) => s.analysis?.timeline?.total ?? null);
  const progress = useJobProgress();
  const load = useSensors((s) => (s.connected ? s.load : null));
  const source = live ?? position;
  const values =
    frame === 'machine'
      ? (status?.mpos ?? [])
      : source
        ? [source.x, source.y, source.z, source.a]
        : [];
  const axes = hasRotary ? AXES : AXES.slice(0, 3);
  const showDeviation = mode === 'live' && cutting && deviation !== null;
  const feed = live ? status?.feed : speed;
  const rpm = live ? status?.spindle : null;

  return (
    <section className="live-tiles" aria-label={t('tiles.job')}>
      <Card className="tile metric" data-testid="job-tile">
        <span className="tile-label">
          <Icon name="job" size={18} /> {t('tiles.job')}
        </span>
        <div className="tile-value">
          <span className="metric-value">
            {progress
              ? progress.percent !== undefined
                ? `${formatNumber(progress.percent, 0)} %`
                : '—'
              : estimate !== null
                ? formatDuration(estimate)
                : '—'}
          </span>
          <span className="text-muted-foreground text-sm">
            {progress?.remaining != null
              ? t('runBar.left', { time: formatDuration(progress.remaining) })
              : progress
                ? ''
                : estimate !== null
                  ? t('tiles.estimate')
                  : ''}
          </span>
        </div>
        <span className="text-muted-foreground text-sm tile-extra">
          <span className="tile-line">
            {t('status.line')} {lineIndex === null ? '—' : lineIndex + 1}
            {showDeviation ? ' · ' : ''}
          </span>
          {showDeviation ? (
            <span className="tile-deviation">
              <span className="when-roomy">{t('status.deviation')}</span>
              <span className="when-compact">{t('status.deviationShort')}</span>{' '}
              <span
                className={`deviation-${deviationLevel(deviation) ?? 'none'}`}
                data-testid="deviation"
              >
                {formatCoordinate(deviation, 2)} mm
              </span>
              <span className="when-roomy">
                {' · '}
                {t('status.deviationMax')} {formatCoordinate(maxDeviation, 2)}
              </span>
            </span>
          ) : null}
        </span>
      </Card>
    </section>
  );
}
