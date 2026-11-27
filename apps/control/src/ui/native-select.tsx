import { Field as FieldPrimitive } from '@base-ui/react/field';
import { ChevronDownIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from './utils';

/*
 * A native <select> in the look of the coss ui Input. Our own, not from the
 * registry: on the iPad the system's own picker is the better list (large
 * rows, no popup to position over the on-screen keyboard).
 *
 * The control fades only where the <select> itself is disabled: an <option> that is closed is `:disabled` too, and
 * the registry's `has-disabled` would fade the whole field (64 %) – below the contrast DESIGN.md §7 asks of a
 * control – for every list that has one closed choice (the cutter of a part).
 */
export function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<'select'>): React.ReactElement {
  return (
    <span
      className={cn(
        'relative inline-flex w-full min-w-0 rounded-lg border border-input bg-background not-dark:bg-clip-padding text-base ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] has-focus-visible:border-ring has-[select:disabled]:opacity-64 has-focus-visible:ring-[3px] dark:bg-input/32',
        className,
      )}
      data-slot="select-control"
    >
      <FieldPrimitive.Control
        render={
          <select className="h-target w-full min-w-0 cursor-pointer appearance-none truncate rounded-[inherit] bg-transparent ps-[calc(--spacing(3)-1px)] pe-9 text-foreground outline-none *:bg-popover *:text-popover-foreground" />
        }
        data-slot="select"
        {...(props as React.ComponentProps<'input'>)}
      >
        {children}
      </FieldPrimitive.Control>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute end-2.5 top-1/2 size-4.5 -translate-y-1/2 opacity-72"
      />
    </span>
  );
}
