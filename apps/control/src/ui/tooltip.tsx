import * as React from 'react';
import { cn } from './utils';

/*
 * Tap hint (DESIGN.md §6.2, §8): a control that cannot be used says why.
 * No information lives in hover alone, so the reason opens on a tap, on
 * hover and on focus, and it is in the page for screen readers all the time.
 * A disabled button takes no pointer events: the wrapper takes them.
 */
export function Reason({
  reason,
  children,
  className,
}: {
  /** Why the control inside cannot be used; null/empty: nothing to say, the wrapper is inert */
  reason: string | null | undefined;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(timer);
  }, [open]);
  if (!reason) return <span className={cn('contents', className)}>{children}</span>;
  return (
    <span
      className={cn('relative inline-flex', className)}
      data-slot="reason"
      aria-describedby={id}
      onClick={() => setOpen(true)}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute right-0 bottom-[calc(100%+0.5rem)] z-50 w-max max-w-72 rounded-lg border border-input bg-popover px-3 py-2 text-left text-popover-foreground text-sm',
          open ? 'visible' : 'sr-only',
        )}
        data-slot="reason-text"
      >
        {reason}
      </span>
    </span>
  );
}
