import { CircleAlertIcon, CirclePauseIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatDuration, formatNumber } from '../lib/format';
import { needsAttention } from '../lib/messages';
import { operationAt, operationsOf } from '../lib/operations';
import { useCamera } from '../store/camera';
import { useJob } from '../store/job';
import { useKeys } from '../store/keys';
import { useMachine } from '../store/machine';
import { useMessages } from '../store/messages';
import { useJobProgress } from '../store/progress';
import { useTrack } from '../store/track';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Reason } from '../ui/tooltip';
import { AlarmBanner } from './AlarmBanner';
import { Stage } from './Stage';

const AXES = ['x', 'y', 'z'] as const;

/** The operation the running job is in – only what the program itself names. */
function useCurrentOperation(): string | null {
  const lines = useJob((s) => s.lines);
  const analysis = useJob((s) => s.analysis);
  const lineIndex = useTrack((s) => (s.mode === 'live' ? s.lineIndex : null));
  const operations = useMemo(
    () => (analysis ? operationsOf(lines, analysis.segments) : []),
    [lines, analysis],
  );
  return operationAt(operations, lineIndex)?.operation.name ?? null;
}

/**
 * The phone (DESIGN.md §4, < 600 px): watching only. The state (status bar),
 * the job's progress, the picture – the live one where a camera runs –, pause
 * (status bar), abort with its question, NOT-HALT (status bar) and the
 * message that waits. Nothing is set up or started from here.
 */
export function Monitor() {
  const progress = useJobProgress();
  const fileName = useJob((s) => s.fileName);
  const connection = useMachine((s) => s.connection);
  const url = useMachine((s) => s.url);
  const status = useMachine((s) => s.status);
  const operation = useCurrentOperation();
  const waiting = useMessages((s) => s.messages).filter(needsAttention);
  const message = waiting.at(-1);
  const cameraOn = useCamera((s) => s.source !== null);
  // What is watched is the machine itself: the live picture, where there is one.
  const running = progress !== null;
  useEffect(() => {
    if (cameraOn) useJob.getState().setView('camera');
  }, [cameraOn, running]);
  const { connect } = useMachine.getState();
  const percent = progress?.percent;
  return (
    <main className="monitor" data-testid="monitor">
      <Card className="monitor-job gap-3 p-4">
        <CardTitle render={<h2 />}>
          {progress ? t('files.running', { name: progress.name }) : (fileName ?? t('start.noJob'))}
        </CardTitle>
        {progress ? (
          <>
            <div className="monitor-figures">
              <p className="monitor-percent tabular-nums" data-testid="monitor-progress">
                {percent !== undefined ? formatNumber(percent, 0) : '—'}
                <small> %</small>
              </p>
              <div className="monitor-side">
                {progress.holding ? (
                  <p className="monitor-state" data-testid="monitor-paused">
                    <CirclePauseIcon aria-hidden="true" className="text-warning-foreground" />
                    {t('monitor.paused')}
                  </p>
                ) : null}
                {progress.remaining !== null ? (
                  <p className="monitor-remaining tabular-nums">
                    {t('runBar.left', { time: formatDuration(progress.remaining) })}
                  </p>
                ) : null}
                {operation ? <p className="text-muted-foreground text-sm">{operation}</p> : null}
              </div>
            </div>
            <Progress value={Math.min(100, percent ?? 0)} aria-label={t('files.progress')} />
            <Button
              variant="outline"
              size="lg"
              data-testid="monitor-abort"
              onClick={() => useKeys.setState({ abortAsked: true })}
            >
              <XIcon aria-hidden="true" />
              {t('monitor.abort')}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">{t('monitor.idle')}</p>
        )}
        {status ? (
          <dl className="monitor-position tabular-nums" data-testid="monitor-position">
            {AXES.map((axis, i) => (
              <div key={axis} className={`jog-axis-${axis}`}>
                <dt className="jog-label">{axis.toUpperCase()}</dt>
                <dd>{formatCoordinate((status.mpos[i] ?? 0) - (status.wco[i] ?? 0), 1)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {connection === 'disconnected' ? (
          <Reason reason={url.trim() === '' ? t('monitor.noAddress') : null} className="w-full">
            <Button
              reason="missing"
              variant="outline"
              className="w-full"
              disabled={url.trim() === ''}
              onClick={() => void connect()}
            >
              {t('machine.connect')}
            </Button>
          </Reason>
        ) : null}
      </Card>
      {message ? (
        <button
          type="button"
          className="monitor-message"
          data-level={message.level}
          data-testid="monitor-message"
          onClick={() => useMessages.getState().openCentre()}
        >
          {message.level === 'warning' ? (
            <TriangleAlertIcon aria-hidden="true" />
          ) : (
            <CircleAlertIcon aria-hidden="true" />
          )}
          <span>
            <strong>{t(`messages.levels.${message.level}`)}:</strong> {message.title}
            {waiting.length > 1 ? ` (+${waiting.length - 1})` : ''}
          </span>
        </button>
      ) : null}
      <div className="stage-wrap">
        <Stage />
        <AlarmBanner />
      </div>
      <p className="text-muted-foreground text-sm">{t('monitor.hint')}</p>
    </main>
  );
}
