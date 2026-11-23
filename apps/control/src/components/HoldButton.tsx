import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n';
import { holdStart, withinHold } from '../lib/holds';
import { machineReason } from '../lib/reason';
import { Spring, SPRINGS } from '../lib/spring';
import { useMachine } from '../store/machine';
import { AckMark, useAck } from './Ack';
import { buttonVariants } from '../ui/button';
import { cn } from '../ui/utils';

interface Props {
  /**
   * What the hold does. A promise is waited for and its result shown on the
   * button (DESIGN.md §6.2): `false` = not possible, anything else = done.
   */
  onConfirm: () => unknown;
  children: ReactNode;
  /** ms the button has to be held */
  duration?: number;
  disabled?: boolean;
  variant?: 'default' | 'accent' | 'danger' | 'go';
  /**
   * Why it is disabled (DESIGN.md §6.2), shown on a tap. Without one the
   * button says what the machine's state has against it – every hold acts
   * on the machine – or that a precondition in its card is missing.
   */
  reason?: string | null;
}

/**
 * The coss button each kind of hold looks like; the handling stays this component's own.
 * `danger` is an action that cannot be taken back (stop the job, delete): it is neutral and
 * safe by the hold itself – red belongs to faults and alarms only (DESIGN.md §7), so only
 * inside the alarm banner does it wear red (`styles/stage.css`).
 */
const LOOK = {
  default: 'outline',
  accent: 'default',
  danger: 'outline',
  go: 'success',
} as const;

/**
 * Dangerous actions need a second gesture: press and hold until the bar is full.
 * Letting go drains the bar visibly; a new press always starts from empty, so
 * the full hold time is needed every time. The hold also ends when the finger
 * slides off, when a second finger lands anywhere, when the system takes the
 * touch (`pointercancel`) and when the app goes to the background.
 */
export function HoldButton({
  onConfirm,
  children,
  duration = 800,
  disabled,
  variant = 'default',
  reason,
}: Props) {
  const machine = useMachine((s) => machineReason(s.connection, s.status?.state, s.viewer));
  const ack = useAck();
  const why = disabled ? (reason ?? t(machine ?? 'reason.missing')) : undefined;
  const button = useRef<HTMLButtonElement>(null);
  const frame = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  // The bar is drawn through a CSS variable: no React render per frame.
  const bar = useRef<Spring | null>(null);
  bar.current ??= new Spring(0, (p) => button.current?.style.setProperty('--hold', String(p)));

  /** Ends the watch for a second finger and the registration as a hold */
  const unwatch = useRef<(() => void) | null>(null);

  const stopTimer = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    startedAt.current = null;
    unwatch.current?.();
    unwatch.current = null;
  };

  /** Let go early: the bar runs back so the abort is visible. */
  const cancel = () => {
    if (startedAt.current === null) return;
    stopTimer();
    bar.current!.to(0, { config: SPRINGS.snappy });
  };

  // The action became unavailable mid-hold (e.g. the machine left Idle): no confirm.
  useEffect(() => {
    if (disabled) cancel();
  });

  useEffect(
    () => () => {
      stopTimer();
      bar.current?.stop();
    },
    [],
  );

  const begin = (pointerId?: number) => {
    if (disabled || startedAt.current !== null) return;
    bar.current!.set(0);
    button.current?.classList.remove('confirmed');
    startedAt.current = performance.now();
    // Any other finger that lands while holding ends the hold: two hands on
    // the screen is not a deliberate confirmation.
    const other = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) cancel();
    };
    window.addEventListener('pointerdown', other, true);
    const end = holdStart(cancel);
    unwatch.current = () => {
      window.removeEventListener('pointerdown', other, true);
      end();
    };
    const tick = (now: number) => {
      if (startedAt.current === null) return;
      const p = Math.min(1, (now - startedAt.current) / duration);
      bar.current!.set(p);
      if (p >= 1) {
        stopTimer();
        // Command and flash on the same frame; what it led to shows on the button.
        const result = confirmRef.current();
        if (result instanceof Promise) void ack.run(() => result);
        const b = button.current;
        if (b) {
          b.classList.remove('confirmed');
          void b.offsetWidth; // restart the flash
          b.classList.add('confirmed');
        }
        bar.current!.to(0, { config: SPRINGS.default });
      } else {
        frame.current = requestAnimationFrame(tick);
      }
    };
    frame.current = requestAnimationFrame(tick);
  };

  return (
    <button
      ref={button}
      type="button"
      className={cn(
        buttonVariants({ variant: LOOK[variant], size: 'xl' }),
        'hold',
        `hold-${variant}`,
      )}
      disabled={disabled}
      data-reason={why}
      aria-description={why}
      onPointerDown={(e) => {
        if (disabled) return;
        // Keep receiving moves when the finger slips over the edge.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        begin(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (startedAt.current === null) return;
        if (!withinHold(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={cancel}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onAnimationEnd={(e) => e.currentTarget.classList.remove('confirmed')}
    >
      <span className="hold-fill" aria-hidden />
      <span className="hold-label">
        {children}
        <AckMark state={ack.state} />
      </span>
      <span className="hold-hint">{t('hold.holdToConfirm')}</span>
    </button>
  );
}
