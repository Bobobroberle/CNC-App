import { errorName } from '@lowrider/fluidnc-client';
import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t, tDynamic } from '../i18n';
import { useMachine } from '../store/machine';
import { cn } from '../ui/utils';

/**
 * Result feedback (DESIGN.md §6.2) for actions whose effect does not show by
 * itself: in progress · done · not possible. A small mark on the control
 * that did it – an icon of its own shape and a word for assistive technology,
 * never colour alone – which goes again after a while. No toast for it.
 */
export type AckState = 'idle' | 'busy' | 'ok' | 'failed';

/** How long "done" / "not possible" stay on the control */
export const ACK_MS = 2500;

export function useAck(holdMs = ACK_MS) {
  const [state, setState] = useState<AckState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  /** Runs the action; `false` from it (or a throw) means "not possible". */
  const run = async (action: () => unknown) => {
    if (timer.current) clearTimeout(timer.current);
    setState('busy');
    let ok: boolean;
    try {
      ok = (await action()) !== false;
    } catch {
      ok = false;
    }
    setState(ok ? 'ok' : 'failed');
    timer.current = setTimeout(() => setState('idle'), holdMs);
    return ok;
  };
  return { state, run };
}

/** The mark itself; put it inside the button, after the label. */
export function AckMark({ state, className }: { state: AckState; className?: string }) {
  if (state === 'idle') return null;
  const Icon = state === 'busy' ? LoaderCircleIcon : state === 'ok' ? CircleCheckIcon : CircleXIcon;
  return (
    <span className={cn('ack-mark', className)} data-ack={state} role="status">
      <Icon
        aria-hidden="true"
        className={state === 'busy' ? 'animate-spin motion-reduce:animate-none' : undefined}
      />
      <span className="sr-only">{t(`ack.${state}`)}</span>
    </span>
  );
}

/**
 * What the controller said to the last command the app sent (jog steps,
 * unlocking, a line typed in the console, macros …): sent – ok – error with
 * FluidNC's code and its meaning. One quiet line, read out politely.
 */
export function CommandAck({ className }: { className?: string }) {
  const last = useMachine((s) => s.lastCommand);
  // The line keeps its place from the start, so nothing below it moves when the first answer comes.
  if (!last)
    return (
      <p className={cn('command-ack', className)} data-testid="command-ack" data-state="none">
        <span>{t('ack.none')}</span>
      </p>
    );
  const Icon =
    last.state === 'sent' ? LoaderCircleIcon : last.state === 'ok' ? CircleCheckIcon : CircleXIcon;
  const text =
    last.state === 'sent'
      ? t('ack.sent')
      : last.state === 'ok'
        ? t('ack.answerOk')
        : last.code === null
          ? t('ack.answerNone')
          : t('ack.answerError', {
              code: last.code,
              text: tDynamic(`error.${errorName(last.code)}`, 'error.Unknown'),
            });
  return (
    <p
      className={cn('command-ack', className)}
      data-testid="command-ack"
      data-state={last.state}
      aria-live="polite"
    >
      <Icon
        aria-hidden="true"
        className={last.state === 'sent' ? 'animate-spin motion-reduce:animate-none' : undefined}
      />
      <span title={`${text} ${last.line}`}>
        {text} <code className="font-mono">{last.line}</code>
      </span>
    </p>
  );
}
