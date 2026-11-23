import { isEmptyBounds } from '@lowrider/gcode-core';
import { CheckIcon, LockIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatDuration, formatNumber } from '../lib/format';
import { operationAt, operationsOf } from '../lib/operations';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useJobProgress } from '../store/progress';
import { useRecorder } from '../store/recorder';
import { useRun } from '../store/run';
import { useStart, type Start } from '../store/start';
import { useTrack } from '../store/track';
import { useUi } from '../store/ui';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Depth } from './Depth';
import { HoldButton } from './HoldButton';
import { Icon } from './Icon';
import { Notice } from './Notice';
import { Override } from './Override';
import { ResumeCard } from './ResumeCard';
import { RunCard } from './RunCard';
import { SdCard } from './SdCard';
import { SensorPanel } from './SensorPanel';
import { Sparkline } from './Sparkline';
import { ToolChangePanel } from './ToolChangeCard';

const RAPID_LEVELS = [25, 50, 100] as const;

/** The operations of the loaded program and the one a line belongs to. */
function useOperation(lineIndex: number | null) {
  const lines = useJob((s) => s.lines);
  const analysis = useJob((s) => s.analysis);
  const operations = useMemo(
    () => (analysis ? operationsOf(lines, analysis.segments) : []),
    [lines, analysis],
  );
  return { operations, current: operationAt(operations, lineIndex) };
}

/** The parts of a job with several tools: which are done, which is next. */
function Parts({ start }: { start: Start }) {
  if (start.parts.length < 2) return null;
  return (
    <ol className="parts-steps" data-testid="run-parts">
      {start.parts.map((p, i) => (
        <li
          key={p.fileName}
          className={i < start.index ? 'done' : i === start.index ? 'current' : ''}
        >
          <span>
            {t('files.part', { n: p.number })}
            {p.tool !== undefined ? ` · T${p.tool}` : ''}
          </span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatDuration(p.seconds)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Before the start: is everything there? The start itself is the hold at the
 * bottom right of the action bar – this card says what will start and what
 * still stands in the way.
 */
function RunReady({ start }: { start: Start }) {
  const analysis = useJob((s) => s.analysis)!;
  const fileName = useJob((s) => s.fileName);
  const go = useUi((s) => s.go);
  const connected = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.status?.state === 'Idle');
  const busy = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const { frame } = useMachine.getState();
  const [framing, setFraming] = useState(false);
  const total = analysis.timeline?.total ?? 0;
  return (
    <Card className="gap-3 p-4" data-testid="run-panel" data-find="run-panel">
      <CardTitle render={<h2 />}>{t('runPanel.title')}</CardTitle>
      <dl className="run-facts">
        <div>
          <dt>{t('dash.program')}</dt>
          <dd className="run-name">{fileName}</dd>
        </div>
        <div>
          <dt>{t('dash.estimate')}</dt>
          <dd className="run-figure tabular-nums" data-testid="run-estimate">
            {formatDuration(total)}
          </dd>
        </div>
      </dl>
      <Parts start={start} />
      {start.blocked > 0 ? (
        <Notice
          tone="danger"
          testId="run-blocked"
          action={
            <Button variant="outline" size="sm" onClick={() => go('run', 'check')}>
              {t('ready.toCheck')}
            </Button>
          }
        >
          {t('ready.blocked', { count: start.blocked })}: {start.reason}
        </Notice>
      ) : start.reason !== null ? (
        <Notice testId="run-wait">{start.reason}</Notice>
      ) : (
        <p className="run-ready" data-testid="run-ready">
          <CheckIcon aria-hidden="true" className="size-5 text-success-foreground" />
          {t('runPanel.readyHint')}
        </p>
      )}
      {start.probeLock ? (
        <Alert variant="warning" data-testid="probe-lock">
          <LockIcon aria-hidden="true" />
          {t('runPanel.probeLock')}
        </Alert>
      ) : null}
      {start.repairedLines > 0 ? (
        <Alert variant="warning">{t('files.repaired', { count: start.repairedLines })}</Alert>
      ) : null}
      {start.addedPreamble ? <Alert variant="warning">{t('runPanel.preamble')}</Alert> : null}
      {start.manualSpindle ? (
        <Alert variant="warning" data-testid="manual-spindle">
          {t('runPanel.manualSpindle')}
        </Alert>
      ) : null}
      <HoldButton
        disabled={!connected || !idle || busy || framing || isEmptyBounds(analysis.cutBounds)}
        onConfirm={() => {
          setFraming(true);
          void frame(analysis.cutBounds).finally(() => setFraming(false));
        }}
      >
        <span className="with-icon">
          <Icon name="frame" /> {t('run.frame')}
        </span>
      </HoldButton>
      <p className="text-muted-foreground text-sm">{t('runPanel.hint')}</p>
    </Card>
  );
}

/**
 * While the job runs: readable from two metres (DESIGN.md §5) – how far, how
 * long still, what is being cut – then the overrides. Pause is in the status
 * bar and the action bar; going on and aborting are deliberate steps here.
 */
function RunLive() {
  const progress = useJobProgress();
  const status = useMachine((s) => s.status);
  const fileJob = useMachine((s) => s.fileJob);
  const stream = useMachine((s) => (s.stream?.result === 'running' ? s.stream : null));
  const stepAt = useMachine((s) => s.stream?.stepAt ?? null);
  const streamLines = useMachine((s) => s.stream?.lines);
  const trend = useRecorder((s) => s.trend);
  const lineIndex = useTrack((s) => s.lineIndex);
  const lines = useJob((s) => s.lines);
  const { current, operations } = useOperation(lineIndex);
  const {
    stepNext,
    setSingleStep,
    stopJob,
    setFeedOverride,
    setSpindleOverride,
    setRapidOverride,
  } = useMachine.getState();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!progress || !status) return null;
  const started = fileJob?.startedAt ?? stream?.startedAt ?? null;
  const operation = current
    ? [
        current.operation.name,
        current.operation.tool > 0 ? `T${current.operation.tool}` : '',
        operations.length > 1
          ? t('run5.operationOf', { n: current.n, total: operations.length })
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  return (
    <Card
      className="gap-3 p-4 run-live"
      data-testid="running-job"
      data-find="run-panel"
      data-holding={progress.holding}
    >
      <CardTitle render={<h2 />}>{t('files.running', { name: progress.name })}</CardTitle>
      <div className="run-big" aria-live="off">
        <div>
          <span className="run-big-label">{t('files.progress')}</span>
          <strong className="run-percent tabular-nums" data-testid="run-percent">
            {progress.percent !== undefined ? `${formatNumber(progress.percent, 0)} %` : '—'}
          </strong>
        </div>
        <div>
          <span className="run-big-label">{t('run5.remaining')}</span>
          <strong className="run-remaining tabular-nums" data-testid="run-remaining">
            {progress.remaining !== null ? formatDuration(progress.remaining) : '—'}
          </strong>
        </div>
      </div>
      <Progress value={Math.min(100, progress.percent ?? 0)} aria-label={t('files.progress')} />
      <p className="run-operation" data-testid="run-operation">
        <span className="run-big-label">{t('run5.operation')}</span>
        <strong>{operation || t('run5.noOperation')}</strong>
        <code className="run-line">
          {lineIndex === null ? '' : `${lineIndex + 1}: ${lines[lineIndex] ?? ''}`}
        </code>
      </p>
      {progress.holding ? (
        <Alert variant="warning" data-testid="run-held">
          {t('run5.held')}
        </Alert>
      ) : null}
      {stepAt !== null ? (
        <Alert
          variant="warning"
          className="justify-items-start gap-y-2 step-panel"
          data-testid="single-step"
        >
          <p>
            {t('run.stepAt', { line: stepAt + 1 })} <code>{streamLines?.[stepAt]}</code>
          </p>
          <div className="flex gap-3">
            <Button variant="success" className="flex-1" onClick={stepNext}>
              <Icon name="step" /> {t('run.nextBlock')}
            </Button>
            <Button variant="outline" onClick={() => setSingleStep(false)}>
              {t('run.stepOff')}
            </Button>
          </div>
        </Alert>
      ) : null}
      <h3 className="font-medium text-muted-foreground text-sm" data-find="overrides">
        {t('overrides.title')}
      </h3>
      <Override
        label={t('overrides.feed')}
        value={status.overrides.feed}
        onChange={setFeedOverride}
        testId="override-feed"
      />
      <Override
        label={t('overrides.spindle')}
        value={status.overrides.spindle}
        onChange={setSpindleOverride}
        testId="override-spindle"
      />
      {/* Spindle load and chatter, where the companion's sensors report them. */}
      <SensorPanel />
      <Depth
        area="run-live"
        more={
          <>
            <h3 className="font-medium text-muted-foreground text-sm">
              {t('overrides.rapid')} {status.overrides.rapid} %
            </h3>
            <SegmentedControl role="group" aria-label={t('overrides.rapid')}>
              {RAPID_LEVELS.map((level) => (
                <SegmentedControlItem
                  key={level}
                  pressed={status.overrides.rapid === level}
                  onClick={() => setRapidOverride(level)}
                >
                  {level} %
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            <dl className="facts">
              {started !== null ? (
                <>
                  <dt>{t('files.elapsed')}</dt>
                  <dd>{formatDuration((now - started) / 1000)}</dd>
                </>
              ) : null}
              {stream ? (
                <>
                  <dt>{t('stream.lines')}</dt>
                  <dd className="tabular-nums">
                    {formatNumber(stream.progress.acknowledged)} /{' '}
                    {formatNumber(stream.progress.total)}
                  </dd>
                </>
              ) : null}
            </dl>
            <Sparkline points={trend} label={t('history.deviationTrend')} warn={0.5} />
          </>
        }
      />
    </Card>
  );
}

/** At the end: what was cut, how long it took – and the way to the next piece of the same job. */
function RunDone() {
  const summary = useRun((s) => s.summary);
  const pieces = useRun((s) => s.pieces);
  if (!summary) return null;
  return (
    <Card className="gap-3 p-4 run-done" data-testid="run-summary" data-find="run-panel">
      <CardTitle render={<h2 />}>
        <CheckIcon aria-hidden="true" className="size-6 text-success-foreground" />
        {t('run5.doneTitle')}
      </CardTitle>
      <dl className="run-facts">
        <div>
          <dt>{t('dash.program')}</dt>
          <dd className="run-name">{summary.name}</dd>
        </div>
        <div>
          <dt>{t('files.elapsed')}</dt>
          <dd className="run-figure tabular-nums">{formatDuration(summary.seconds)}</dd>
        </div>
        {summary.parts > 1 ? (
          <div>
            <dt>{t('run5.parts')}</dt>
            <dd>{summary.parts}</dd>
          </div>
        ) : null}
        {summary.maxDeviation !== null ? (
          <div>
            <dt>{t('status.deviationMax')}</dt>
            <dd className="tabular-nums">{formatCoordinate(summary.maxDeviation, 2)} mm</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('run5.pieces')}</dt>
          <dd className="tabular-nums">{pieces}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-sm">{t('run5.nextHint')}</p>
    </Card>
  );
}

/**
 * ⑤ Fräsen – is it going well? Before the start what will run and what
 * stands in the way, while it runs the figures and the overrides, at the end
 * the summary. The job goes onto the SD card and starts there (the default);
 * streaming, files already on the card and taking a job up again are the
 * deeper levels of this panel.
 */
export function RunScreen() {
  const start = useStart();
  const run = useRun();
  const active = useMachine(
    (s) =>
      s.fileJob !== null ||
      s.stream?.result === 'running' ||
      s.status?.state === 'Run' ||
      s.status?.state === 'Hold',
  );
  const key = start?.key ?? null;
  // A different job starts with its first part again.
  useEffect(() => {
    if (run.jobKey !== null && key !== null && run.jobKey !== key && run.phase !== 'running')
      run.reset();
  }, [key, run]);

  let main = null;
  if (active) main = <RunLive />;
  else if (start && start.phase === 'between') {
    main = (
      <ToolChangePanel
        tool={start.part.tool}
        continueLabel={start.label}
        onContinue={() => run.startPart(start.index)}
        abortLabel={t('runPanel.abortParts')}
        onAbort={run.reset}
        lengthOffset={!/G49/i.test(start.part.text)}
      />
    );
  } else if (start && start.phase === 'done' && run.summary) main = <RunDone />;
  else if (start) main = <RunReady start={start} />;

  return (
    <>
      {main}
      {!active ? (
        <Depth
          area="run"
          more={
            <>
              {start ? <RunCard /> : null}
              <SdCard />
            </>
          }
          all={start ? <ResumeCard /> : undefined}
        />
      ) : null}
    </>
  );
}
