import type { JogAxis } from '@lowrider/fluidnc-client';
import { CircleCheckIcon, DownloadIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber, formatSigned, getLocale } from '../lib/format';
import { canJog } from '../lib/jog';
import {
  AXIS_TEST_DISTANCES,
  axisTestResult,
  hoursMinutes,
  runTime,
  type AxisTestResult,
} from '../lib/service';
import { exportReport } from '../store/diagnostics';
import { jogStep } from '../store/jog';
import { useMachine } from '../store/machine';
import { useMessages } from '../store/messages';
import { settled } from '../store/settle';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Reason } from '../ui/tooltip';
import { HoldButton } from './HoldButton';
import { MessageList } from './Messages';

const AXES: readonly JogAxis[] = ['X', 'Y', 'Z'];
const INDEX: Record<JogAxis, number> = { X: 0, Y: 1, Z: 2 };

/**
 * Achstest (DESIGN.md §5): each axis a known distance to either side, by a
 * hold. Afterwards the card says what the controller reports it moved. The
 * controller counts its own steps – whether the axis really went that far is
 * what the accuracy check under "Kalibrieren" measures.
 */
export function AxisTestCard() {
  const connected = useMachine((s) => s.connection === 'connected');
  const state = useMachine((s) => s.status?.state);
  const [distance, setDistance] = useState<(typeof AXIS_TEST_DISTANCES)[number]>(10);
  const [results, setResults] = useState<Partial<Record<JogAxis, AxisTestResult | 'running'>>>({});
  const running = Object.values(results).includes('running');
  const reason = !connected
    ? t('jog.reason.offline')
    : !canJog(state) || running
      ? t('jog.reason.busy')
      : null;

  const run = async (axis: JogAxis, direction: 1 | -1) => {
    const before = useMachine.getState().status?.mpos[INDEX[axis]];
    if (before === undefined) return;
    const expected = direction * distance;
    // Through the jog layer: limits apply, and the move stops with every jog stop.
    if (!jogStep(axis, direction, distance)) return;
    setResults((r) => ({ ...r, [axis]: 'running' }));
    // The report in the store may be older than the move: wait for one that says it arrived.
    const target = { [axis.toLowerCase()]: before + expected };
    const arrived = await settled(target, 20_000);
    const after = (arrived ?? useMachine.getState().status)?.mpos[INDEX[axis]] ?? before;
    setResults((r) => ({ ...r, [axis]: axisTestResult(expected, before, after) }));
  };

  return (
    <Card className="gap-3 p-4" data-testid="axis-test" data-find="axis-test">
      <CardTitle render={<h2 />}>{t('service.axis.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('service.axis.hint')}</p>
      <SegmentedControl
        role="group"
        aria-label={t('service.axis.distance')}
        className="w-full *:flex-1"
      >
        {AXIS_TEST_DISTANCES.map((d) => (
          <SegmentedControlItem key={d} pressed={distance === d} onClick={() => setDistance(d)}>
            {formatNumber(d, 0)} mm
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <ul className="axis-test">
        {AXES.map((axis) => {
          const result = results[axis];
          return (
            <li key={axis} data-testid={`axis-test-${axis}`}>
              <span className={`axis-test-name jog-axis-${axis.toLowerCase()}`}>
                <span className="jog-label">{axis}</span>
                <span className="text-muted-foreground text-sm">
                  {t(`service.axis.way.${axis}`)}
                </span>
              </span>
              <Reason reason={reason} className="axis-test-holds">
                {([-1, 1] as const).map((direction) => (
                  <HoldButton
                    key={direction}
                    duration={500}
                    disabled={reason !== null}
                    onConfirm={() => void run(axis, direction)}
                  >
                    {t('service.axis.move', {
                      axis,
                      sign: direction > 0 ? '+' : '−',
                      distance: formatNumber(distance, 0),
                    })}
                  </HoldButton>
                ))}
              </Reason>
              <p
                className="axis-test-result"
                data-ok={result && result !== 'running' ? result.ok : undefined}
              >
                {result === undefined ? (
                  <span className="text-muted-foreground">{t('service.axis.untested')}</span>
                ) : result === 'running' ? (
                  <span className="text-muted-foreground">{t('service.axis.running')}</span>
                ) : (
                  <>
                    {result.ok ? (
                      <CircleCheckIcon aria-hidden="true" className="text-success-foreground" />
                    ) : (
                      <TriangleAlertIcon aria-hidden="true" className="text-warning-foreground" />
                    )}
                    <span className="tabular-nums">
                      {t(result.ok ? 'service.axis.ok' : 'service.axis.short', {
                        expected: formatSigned(result.expected, 2, true),
                        reported: formatSigned(result.reported, 2, true),
                      })}
                    </span>
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-sm">{t('service.axis.honest')}</p>
    </Card>
  );
}

/** What is known about the connection to FluidNC – read from the controller, nothing made up. */
export function ConnectionInfoCard() {
  const connection = useMachine((s) => s.connection);
  const url = useMachine((s) => s.url);
  const firmware = useMachine((s) => s.firmware);
  const state = useMachine((s) => s.status?.state);
  const homed = useMachine((s) => s.homed);
  const homedAxes = useMachine((s) => s.homedAxes);
  const wcs = useMachine((s) => s.parserState?.wcs);
  const alarm = useMachine((s) => s.alarm);
  const rows: [string, string][] = [
    [t('service.connection.state'), t(`bar.connection.${connection}`)],
    [t('service.connection.address'), url.trim() === '' ? t('service.unknown') : url],
    [t('service.connection.firmware'), firmware ?? t('service.unknown')],
    [t('service.connection.machine'), state ?? t('service.unknown')],
    [
      t('service.connection.homed'),
      connection !== 'connected'
        ? t('service.unknown')
        : homed
          ? t('service.connection.homedAll')
          : homedAxes
            ? t('service.connection.homedSome', { axes: homedAxes })
            : t('service.connection.homedNone'),
    ],
    [t('service.connection.wcs'), wcs ?? t('service.unknown')],
    [
      t('service.connection.alarm'),
      alarm === null ? t('service.connection.noAlarm') : `ALARM:${alarm}`,
    ],
  ];
  return (
    <Card className="gap-3 p-4" data-testid="connection-info" data-find="connection-info">
      <CardTitle render={<h2 />}>{t('service.connection.title')}</CardTitle>
      <dl className="facts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/**
 * Running time. FluidNC keeps no hours of the spindle, so nothing of the
 * kind is shown as if it did: what is known is how long the recorded jobs
 * ran, and that is what the card says.
 */
export function RunTimeCard() {
  const history = useWorkshop((s) => s.history);
  const time = runTime(history);
  const { hours, minutes } = hoursMinutes(time?.seconds ?? 0);
  return (
    <Card className="gap-3 p-4" data-testid="run-time" data-find="run-time">
      <CardTitle render={<h2 />}>{t('service.hours.title')}</CardTitle>
      {time ? (
        <>
          <p className="run-time-value tabular-nums">
            {t('service.hours.value', { hours, minutes: String(minutes).padStart(2, '0') })}
          </p>
          <p className="text-sm">
            {t('service.hours.from', {
              jobs: time.jobs,
              since: new Date(time.since).toLocaleDateString(getLocale()),
            })}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">{t('service.hours.none')}</p>
      )}
      <p className="text-muted-foreground text-sm">{t('service.hours.honest')}</p>
    </Card>
  );
}

/** The history of the messages, with its filter by level. */
export function MessageHistoryCard() {
  const settledCount = useMessages(
    (s) => s.messages.filter((m) => m.level !== 'fault' || m.resolved).length,
  );
  // The file the report was last saved as: the browser saves it quietly, the card says it did
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <Card className="gap-3 p-4" data-testid="message-history" data-find="message-history">
      <CardTitle render={<h2 />}>{t('service.messages')}</CardTitle>
      <div className="flex flex-col items-start gap-2" data-testid="diagnostic-report">
        <p className="text-muted-foreground text-sm">{t('messages.report.hint')}</p>
        <Button variant="outline" onClick={() => setSaved(exportReport())}>
          <DownloadIcon aria-hidden="true" />
          {t('messages.report.button')}
        </Button>
        {saved ? (
          <p role="status" className="text-sm" data-testid="diagnostic-report-done">
            <CircleCheckIcon
              aria-hidden="true"
              className="mr-1 inline size-4 text-success-foreground"
            />
            {t('messages.report.done', { name: saved })}
          </p>
        ) : null}
      </div>
      <MessageList />
      {settledCount > 0 ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => useMessages.getState().clearHistory()}
        >
          {t('messages.clear')}
        </Button>
      ) : null}
    </Card>
  );
}
