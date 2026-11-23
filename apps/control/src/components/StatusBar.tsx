import { alarmName } from '@lowrider/fluidnc-client';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  FlagIcon,
  LoaderIcon,
  PauseIcon,
  PlayIcon,
  PlugIcon,
  RefreshCwIcon,
  RadarIcon,
  UnplugIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { t, tDynamic } from '../i18n';
import { formatCoordinate, formatNumber } from '../lib/format';
import { badgeKind, type BadgeKind } from '../lib/next';
import { isFullDemo } from '../lib/persist';
import { isSimulatorAddress } from '../sim';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { needsAttention, openLevel as levelOpen } from '../lib/messages';
import { useMessages } from '../store/messages';
import { useSensors } from '../store/sensors';
import { useTrack } from '../store/track';
import { useUi } from '../store/ui';
import { Badge } from '../ui/badge';
import { Dro, DroValue, type DroAxis } from '../ui/dro';
import { StatusBadge, type StatusTone } from '../ui/status-badge';
import { EStopButton } from './EStopButton';
import { PauseButton } from './PauseButton';

export const BADGE_TONE: Record<BadgeKind, StatusTone> = {
  offline: 'muted',
  connecting: 'muted',
  ready: 'neutral',
  run: 'run',
  hold: 'hold',
  probe: 'probe',
  alarm: 'alarm',
};

export const BADGE_SIGN: Record<BadgeKind, ReactElement> = {
  offline: <UnplugIcon aria-hidden="true" />,
  connecting: <LoaderIcon aria-hidden="true" />,
  ready: <CircleCheckIcon aria-hidden="true" />,
  run: <PlayIcon aria-hidden="true" />,
  hold: <PauseIcon aria-hidden="true" />,
  probe: <RadarIcon aria-hidden="true" />,
  alarm: <CircleAlertIcon aria-hidden="true" />,
};

const AXES: readonly DroAxis[] = ['X', 'Y', 'Z', 'A'];

/** The machine's state as the badge says it (§6.1): the word, and for an alarm what it is. */
export function useMachineBadge(): { kind: BadgeKind; text: string; code: string | null } {
  const connection = useMachine((s) => s.connection);
  const state = useMachine((s) => s.status?.state);
  const alarm = useMachine((s) => s.alarm);
  const probing = useMachine((s) => s.probing);
  const kind = badgeKind(connection, state, probing);
  if (kind !== 'alarm') return { kind, text: t(`state.kinds.${kind}`), code: null };
  const name =
    state === 'Door'
      ? t('state.Door')
      : tDynamic(
          `alarm.${alarm === null ? 'Unknown' : alarmName(alarm)}.short`,
          'alarm.Unknown.short',
        );
  return {
    kind,
    text: t('state.alarmText', { text: name }),
    code: alarm === null ? null : `ALARM:${alarm}`,
  };
}

/**
 * The status bar (DESIGN.md §4), the same on every screen: the machine's
 * state as a badge, the position, spindle and feed, the connection, the flag
 * of the messages – and, top right, PAUSE and NOT-HALT, kept apart.
 */
export function StatusBar() {
  const badge = useMachineBadge();
  const connection = useMachine((s) => s.connection);
  // Waiting for the next try of its own: said, so "Getrennt" does not read as given up.
  const retrying = useMachine((s) => s.link.phase === 'waiting');
  const shownLink = connection === 'disconnected' && retrying ? 'retrying' : connection;
  const status = useMachine((s) => s.status);
  const wcs = useMachine((s) => s.parserState?.wcs);
  const simulator = useMachine((s) => s.connection !== 'disconnected' && isSimulatorAddress(s.url));
  const hasRotary = useJob((s) => s.profile.hasRotary);
  const frame = useUi((s) => s.positionFrame);
  const toggleFrame = useUi((s) => s.togglePositionFrame);
  const go = useUi((s) => s.go);
  const { position, live, speed } = useTrack();
  const load = useSensors((s) => (s.connected ? s.load : null));
  const open = useMessages((s) => s.messages.filter(needsAttention).length);
  const openLevel = useMessages((s) => levelOpen(s.messages));
  const source = live ?? position;
  const values =
    frame === 'machine'
      ? (status?.mpos ?? [])
      : source
        ? [source.x, source.y, source.z, source.a]
        : [];
  const axes = hasRotary ? AXES : AXES.slice(0, 3);
  const feed = live ? status?.feed : speed;
  const rpm = live ? (status?.spindle ?? 0) : 0;

  return (
    <header className="statusbar" aria-label={t('bar.label')}>
      <StatusBadge
        tone={BADGE_TONE[badge.kind]}
        icon={BADGE_SIGN[badge.kind]}
        className={`state state-${badge.kind}`}
        data-testid="machine-state"
        data-kind={badge.kind}
      >
        {badge.text}
        {badge.code ? <small className="state-code"> {badge.code}</small> : null}
      </StatusBadge>
      {simulator ? (
        <Badge variant="outline" className="sim-badge" data-testid="simulator-badge">
          {isFullDemo() ? t('demo.badge') : t('sim.badge')}
        </Badge>
      ) : null}
      <button
        type="button"
        className="bar-dro"
        onClick={toggleFrame}
        aria-label={t('tiles.toggleFrame')}
        data-testid="position-tile"
        data-find="tiles"
        data-axes={axes.length}
      >
        <span className="bar-label">
          {frame === 'machine' ? t('tiles.positionMachine') : t('tiles.position')}
          {wcs && frame === 'work' ? ` ${wcs}` : ''} · mm
        </span>
        <Dro aria-label={t('drive.position')} className="readout">
          {axes.map((axis, i) => (
            <DroValue
              key={axis}
              axis={axis}
              value={formatCoordinate(values[i], 3)}
              unit={axis === 'A' ? '°' : undefined}
            />
          ))}
        </Dro>
      </button>
      <dl className="bar-metrics">
        <div>
          <dt>{t('bar.spindle')}</dt>
          <dd>
            {load !== null ? (
              <>
                {formatNumber(load)} <small>% {t('tiles.load')}</small>
              </>
            ) : (
              <>
                {status ? formatNumber(rpm) : '—'} <small>{t('units.rpm')}</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('bar.feed')}</dt>
          <dd>
            {feed === undefined || feed === null ? '—' : formatNumber(feed)}{' '}
            <small>{t('units.mmPerMin')}</small>
          </dd>
        </div>
      </dl>
      <span className="bar-connection" data-state={shownLink} data-testid="connection-state">
        {shownLink === 'connected' ? (
          <PlugIcon aria-hidden="true" />
        ) : shownLink === 'connecting' ? (
          <CircleDashedIcon aria-hidden="true" />
        ) : shownLink === 'retrying' ? (
          <RefreshCwIcon aria-hidden="true" />
        ) : (
          <UnplugIcon aria-hidden="true" />
        )}
        <span>{t(`bar.connection.${shownLink}`)}</span>
      </span>
      <span className="bar-space" />
      <button
        type="button"
        className="bar-flag"
        data-testid="messages-flag"
        data-find="messages"
        data-open={open > 0 ? '' : undefined}
        data-level={openLevel ?? undefined}
        aria-label={open > 0 ? t('bar.messagesOpen', { count: open }) : t('bar.messagesNone')}
        aria-haspopup="dialog"
        onClick={() => useMessages.getState().openCentre()}
      >
        <FlagIcon aria-hidden="true" />
        <span className="bar-flag-label">{t('bar.messages')}</span>
        {open > 0 ? <span className="bar-flag-count">{open}</span> : null}
      </button>
      <PauseButton />
      <EStopButton />
    </header>
  );
}
