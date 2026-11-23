import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LightbulbIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { t } from '../i18n';
import { getLocale } from '../lib/format';
import {
  countByLevel,
  filterMessages,
  LEVELS,
  needsAttention,
  type Level,
  type LevelFilter,
  type Message,
} from '../lib/messages';
import { useMachine } from '../store/machine';
import { useMessages } from '../store/messages';
import { useUi } from '../store/ui';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '../ui/dialog';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { HoldButton } from './HoldButton';

/** The sign of a level: never colour alone (DESIGN.md §7). */
const SIGN: Record<Level, ReactElement> = {
  critical: <OctagonAlertIcon aria-hidden="true" />,
  fault: <CircleAlertIcon aria-hidden="true" />,
  warning: <TriangleAlertIcon aria-hidden="true" />,
  hint: <LightbulbIcon aria-hidden="true" />,
  info: <InfoIcon aria-hidden="true" />,
};

const FILTERS: readonly LevelFilter[] = ['all', ...LEVELS];

function time(at: number): string {
  const date = new Date(at);
  const today = new Date().toDateString() === date.toDateString();
  return date.toLocaleString(getLocale(), {
    ...(today ? {} : { day: '2-digit', month: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** What a message's state is, in a word. */
function stateOf(m: Message): string | null {
  if (m.level === 'fault') return t(m.resolved ? 'messages.resolved' : 'messages.active');
  if (m.level === 'warning' || m.level === 'critical') {
    return t(m.acknowledged ? 'messages.acknowledged' : 'messages.open');
  }
  return null;
}

/**
 * One message (§6.3): level with its sign and word, the name, then cause,
 * effect and the next thing to do – and the controller's code small behind
 * it. A warning is acknowledged here; a fault that still stands offers its
 * way out.
 */
function MessageItem({ message, onLeave }: { message: Message; onLeave?: () => void }) {
  const open = needsAttention(message);
  const state = stateOf(message);
  return (
    <li
      className="message"
      data-level={message.level}
      data-open={open ? '' : undefined}
      data-testid="message"
    >
      <div className="message-head">
        <span className="message-level">
          {SIGN[message.level]}
          {t(`messages.levels.${message.level}`)}
        </span>
        {state ? <span className="message-state">{state}</span> : null}
        <time className="message-time tabular-nums">{time(message.at)}</time>
      </div>
      <p className="message-title">
        {message.title}
        {message.code ? <code className="message-code">{message.code}</code> : null}
      </p>
      <dl className="message-facts">
        <dt>{t('messages.cause')}</dt>
        <dd>{message.cause}</dd>
        <dt>{t('messages.effect')}</dt>
        <dd>{message.effect}</dd>
        <dt>{t('messages.action')}</dt>
        <dd>{message.action}</dd>
      </dl>
      {message.level === 'warning' && open ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => useMessages.getState().acknowledge(message.id)}
        >
          <CircleCheckIcon aria-hidden="true" />
          {t('messages.acknowledge')}
        </Button>
      ) : null}
      {message.level === 'fault' && open ? (
        <div className="message-way-out">
          <p className="message-blocks">{t('messages.blocks')}</p>
          <div className="flex flex-wrap gap-2">
            <span className="flex-1 basis-40">
              <HoldButton onConfirm={() => useMachine.getState().command('$X')}>
                {t('messages.unlock')}
              </HoldButton>
            </span>
            <Button
              variant="outline"
              className="flex-1 basis-40"
              onClick={() => {
                onLeave?.();
                useUi.getState().setJogOpen(true);
              }}
            >
              {t('messages.toHoming')}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The messages with their filter by level: the content of the centre and the
 * history under Service & Diagnose.
 */
export function MessageList({ onLeave }: { onLeave?: () => void }) {
  const messages = useMessages((s) => s.messages);
  const [filter, setFilter] = useState<LevelFilter>('all');
  const counts = countByLevel(messages);
  const shown = filterMessages(messages, filter);
  const warnings = messages.some((m) => m.level === 'warning' && needsAttention(m));
  return (
    <div className="messages" data-testid="messages">
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('messages.filter')}
      >
        {FILTERS.map((id) => (
          <SegmentedControlItem
            key={id}
            className="px-2 text-[15px]"
            pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {id === 'all' ? t('messages.all') : t(`messages.levels.${id}`)}
            <span className="text-muted-foreground tabular-nums">{counts[id]}</span>
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {warnings ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => useMessages.getState().acknowledgeAll()}
        >
          <CircleCheckIcon aria-hidden="true" />
          {t('messages.acknowledgeAll')}
        </Button>
      ) : null}
      {shown.length === 0 ? (
        <p className="message-empty text-muted-foreground">
          <CircleCheckIcon aria-hidden="true" className="text-success-foreground" />
          {t(messages.length === 0 ? 'messages.empty' : 'messages.emptyFilter')}
        </p>
      ) : (
        <ul className="message-list">
          {shown.map((m) => (
            <MessageItem key={m.id} message={m} onLeave={onLeave} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The message centre (§6.3), opened from the flag in the status bar: a
 * dialog in the layer below the status bar, so PAUSE and NOT-HALT stay above
 * it. One primary action: closing it.
 */
export function MessageCentre() {
  const open = useMessages((s) => s.centre);
  const { closeCentre } = useMessages.getState();
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeCentre())}>
      <DialogPopup className="max-w-2xl" data-testid="message-centre">
        <DialogHeader>
          <DialogTitle>{t('messages.title')}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <MessageList onLeave={closeCentre} />
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              closeCentre();
              useUi.getState().go('service', 'messages');
            }}
          >
            {t('messages.toHistory')}
          </Button>
          <Button onClick={closeCentre}>{t('messages.close')}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
