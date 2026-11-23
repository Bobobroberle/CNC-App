import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from './utils';

/*
 * Message / toast (DESIGN.md §6.3, §10): a short message that lies over the
 * page for a moment. The level decides colour and sign; the text says what
 * it is. A toast never takes a tap away from what lies under it
 * (`pointer-events: none`) – what has to be confirmed is no toast.
 */
export type ToastLevel = 'info' | 'warning' | 'fault';

const LOOK: Record<ToastLevel, string> = {
  info: 'border-input',
  warning: 'border-warning',
  fault: 'border-destructive',
};

const SIGN: Record<ToastLevel, React.ReactElement> = {
  info: <InfoIcon aria-hidden="true" className="text-info-foreground" />,
  warning: <TriangleAlertIcon aria-hidden="true" className="text-warning-foreground" />,
  fault: <CircleAlertIcon aria-hidden="true" className="text-destructive-foreground" />,
};

export function ToastRegion({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('pointer-events-none flex flex-col items-start gap-2', className)}
      data-slot="toast-region"
      {...props}
    />
  );
}

export function Toast({
  level,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { level: ToastLevel }): React.ReactElement {
  return (
    <div
      className={cn(
        'flex max-w-full items-start gap-2 rounded-lg border bg-popover px-3 py-2 text-popover-foreground text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0',
        LOOK[level],
        className,
      )}
      data-slot="toast"
      data-level={level}
      {...props}
    >
      {SIGN[level]}
      <span className="min-w-0">{children}</span>
    </div>
  );
}
