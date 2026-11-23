import type * as React from 'react';
import { cn } from './utils';

/*
 * Status badge (DESIGN.md §6.1, §10): a state as colour, icon and word
 * together – never colour alone. `tone` is the meaning; the icon is given by
 * the caller, the word is the content.
 */
export type StatusTone = 'neutral' | 'muted' | 'run' | 'hold' | 'probe' | 'alarm' | 'done';

const TONE: Record<StatusTone, string> = {
  neutral: 'border-input bg-popover text-foreground',
  muted: 'border-border bg-card text-muted-foreground',
  run: 'border-primary bg-primary/16 text-info-foreground',
  hold: 'border-warning bg-warning/16 text-warning-foreground',
  probe: 'border-probe bg-probe/16 text-probe-foreground',
  // An alarm is the one solid red beside NOT-HALT: it shows at once and is never eased in.
  alarm: 'border-destructive bg-destructive/16 text-destructive-foreground transition-none',
  done: 'border-success bg-success/16 text-success-foreground',
};

export function StatusBadge({
  tone,
  icon,
  size = 'default',
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & {
  tone: StatusTone;
  icon?: React.ReactNode;
  size?: 'default' | 'lg';
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 shrink-0 items-center gap-2 rounded-lg border font-semibold [&_svg]:shrink-0',
        size === 'lg'
          ? 'min-h-14 px-4 text-2xl [&_svg]:size-7'
          : 'min-h-target px-3 text-base [&_svg]:size-5',
        TONE[tone],
        className,
      )}
      data-slot="status-badge"
      data-tone={tone}
      {...props}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
