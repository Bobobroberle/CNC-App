import { isEmptyBounds, type Bounds } from '@lowrider/gcode-core';
import { t, tDynamic, type MessageKey } from '../i18n';
import { formatCoordinate, formatDuration, formatNumber } from '../lib/format';
import { controllerIssues } from '../lib/jobChecks';
import { SIM_SPEEDS, useJob, type TableProjection } from '../store/job';
import { resetProgress, useTrack } from '../store/track';
import { useUi } from '../store/ui';
import { Timeline } from './Timeline';
import { Alert } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const PROJECTIONS: { id: TableProjection; label: MessageKey }[] = [
  { id: 'top', label: 'job.viewTop' },
  { id: 'side', label: 'job.viewSide' },
  { id: 'unwrapped', label: 'job.viewUnwrapped' },
];

function range(b: Bounds) {
  if (isEmptyBounds(b)) return '—';
  const r = (min: number, max: number) =>
    `${formatCoordinate(min, 1)} … ${formatCoordinate(max, 1)}`;
  return `X ${r(b.min.x, b.max.x)} · Y ${r(b.min.y, b.max.y)} · Z ${r(b.min.z, b.max.z)}`;
}

function Stepper({
  label,
  value,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <Button variant="outline" aria-label={`${label} −`} onClick={() => onChange(value - step)}>
        −
      </Button>
      <output>
        {formatNumber(value, value % 1 === 0 ? 0 : 1)} {unit}
      </output>
      <Button variant="outline" aria-label={`${label} +`} onClick={() => onChange(value + step)}>
        +
      </Button>
    </div>
  );
}

/**
 * How the simulation plays and looks (the timeline itself lies under the
 * picture, `Timeline.tsx`), and what the program is: time, range, feeds, tool.
 */
export function SimulationCards() {
  const job = useJob();
  const { analysis, lines, speed, toolDiameter, rotaryDiameter } = job;
  const lineIndex = useTrack((s) => s.lineIndex);
  const mode = useTrack((s) => s.mode);
  const done = useTrack((s) => s.done);
  const projection = useJob((s) => s.projection);
  const showRapids = useJob((s) => s.showRapids);
  const place = useUi((s) => s.place);
  if (!analysis) return null;
  // Under the 3D picture of ④ lies the timeline itself; anywhere else it is here.
  const timelineOnStage = place === 'check' && job.view === '3d';
  const total = analysis.timeline?.total ?? 0;
  return (
    <>
      <Card className="gap-3 p-4" data-testid="simulation-options">
        <CardTitle render={<h2 />}>
          {t('job.simulation')}
          {mode === 'live' ? <Badge variant="outline">{t('job.trackingLive')}</Badge> : null}
        </CardTitle>
        {!timelineOnStage ? <Timeline inPanel /> : null}
        <SegmentedControl role="group" aria-label={t('job.speed')}>
          {SIM_SPEEDS.map((s) => (
            <SegmentedControlItem key={s} pressed={speed === s} onClick={() => job.setSpeed(s)}>
              {s}×
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        {/* How to look at the toolpath while checking: from above, from the side for the depths. */}
        <div className="flex gap-3 flex-wrap">
          <SegmentedControl role="group" aria-label={t('job.view')}>
            {PROJECTIONS.filter((p) => p.id !== 'unwrapped' || analysis.usesRotary).map((p) => (
              <SegmentedControlItem
                key={p.id}
                pressed={projection === p.id}
                onClick={() => job.setProjection(p.id)}
              >
                {t(p.label)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <Button
            variant="outline"
            className="chip"
            pressed={showRapids}
            onClick={() => job.setShowRapids(!showRapids)}
          >
            <span className="chip-led" aria-hidden="true" />
            {t('job.rapids')}
          </Button>
        </div>
        {mode === 'live' ? (
          <div className="flex gap-3 justify-between">
            <span className="tabular-nums" data-testid="progress">
              {t('job.progress')}{' '}
              {formatNumber((100 * done) / Math.max(1, analysis.segments.length))} %
            </span>
            <Button variant="outline" onClick={resetProgress}>
              {t('job.resetProgress')}
            </Button>
          </div>
        ) : null}
        <p className="current-line">
          <span className="text-muted-foreground text-sm">{t('job.currentLine')}</span>{' '}
          {lineIndex === null ? (
            '—'
          ) : (
            <code>
              {lineIndex + 1}: {lines[lineIndex]}
            </code>
          )}
        </p>
      </Card>
      <Card className="gap-3 p-4" data-testid="job-summary" data-find="job-summary">
        <CardTitle render={<h2 />}>{job.fileName}</CardTitle>
        <dl className="facts">
          <dt>{t('job.estimate')}</dt>
          <dd className="font-semibold text-3xl" data-testid="job-estimate">
            {formatDuration(total)}
          </dd>
          <dt>{t('job.lines')}</dt>
          <dd>{formatNumber(analysis.lineCount)}</dd>
          <dt>{t('job.segments')}</dt>
          <dd>{formatNumber(analysis.segments.length)}</dd>
          <dt>{t('job.tools')}</dt>
          <dd>{analysis.tools.length > 0 ? analysis.tools.map((n) => `T${n}`).join(', ') : '—'}</dd>
          <dt>{t('job.range')}</dt>
          <dd>{range(analysis.cutBounds)}</dd>
          <dt>{t('job.feeds')}</dt>
          <dd>
            {analysis.feedRange
              ? `${formatNumber(analysis.feedRange.min)} … ${formatNumber(analysis.feedRange.max)} ${t('units.mmPerMin')}`
              : '—'}
          </dd>
          <dt>{t('job.distance')}</dt>
          <dd>
            {formatNumber(analysis.feedLength / 1000, 2)} m /{' '}
            {formatNumber(analysis.rapidLength / 1000, 2)} m
          </dd>
          {analysis.usesRotary ? (
            <>
              <dt>{t('job.rotary')}</dt>
              <dd>✓</dd>
            </>
          ) : null}
        </dl>
        <Stepper
          label={t('job.toolDiameter')}
          value={toolDiameter}
          step={0.5}
          unit="mm"
          onChange={job.setToolDiameter}
        />
        {analysis.usesRotary ? (
          <Stepper
            label={t('job.rotaryDiameter')}
            value={rotaryDiameter}
            step={5}
            unit="mm"
            onChange={job.setRotaryDiameter}
          />
        ) : null}
      </Card>
    </>
  );
}

/** What the reader found in the program: errors, warnings and what the controller would trip over. */
export function DiagnosticsCard() {
  const analysis = useJob((s) => s.analysis);
  const controller = useJob((s) => s.profile.controller);
  if (!analysis) return null;
  const errors = analysis.diagnostics.filter((d) => d.severity === 'error');
  const issues = controllerIssues(analysis, controller);
  const dangerous = issues.filter((i) => i.severity === 'error');
  return (
    <>
      <Card className="gap-3 p-4" id="job-diagnostics" data-find="diagnostics">
        <CardTitle render={<h2 />}>{t('job.diagnostics')}</CardTitle>
        {dangerous.length > 0 ? (
          <Alert variant="error">{t('job.issuesFound', { count: dangerous.length })}</Alert>
        ) : null}
        {issues.length > 0 ? (
          <ul className="diagnostics" data-testid="job-issues">
            {issues.map((issue, n) => (
              <li key={n} className={issue.severity}>
                <span className="tabular-nums">{issue.lineIndex + 1}</span>{' '}
                {issue.kind === 'toolChange'
                  ? t('job.issueToolChange', { tool: issue.tool ?? '' })
                  : t('job.issueOptionalStop')}
              </li>
            ))}
          </ul>
        ) : null}
        {analysis.diagnostics.length === 0 && issues.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('job.noDiagnostics')}</p>
        ) : (
          <>
            {errors.length > 0 ? (
              <Alert variant="error">{t('job.errorsFound', { count: errors.length })}</Alert>
            ) : null}
            <ul className="diagnostics">
              {analysis.diagnostics.slice(0, 100).map((d, i) => (
                <li key={i} className={d.severity}>
                  <span className="tabular-nums">{d.lineIndex + 1}</span>{' '}
                  {tDynamic(`diagnostic.${d.code}`, 'diagnostic.invalid-value')}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
