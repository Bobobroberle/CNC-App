import { CheckIcon, CircleIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from './utils';

/*
 * Stepper (DESIGN.md §3.2, §10): the steps of the main flow in their order.
 * Every step can be jumped to; each shows its number, its name and its state
 * as a sign (✓ ⚠ ✕ ○) with a word for screen readers – never colour alone.
 * Narrow: the steps shrink to their numbers, the current one keeps its name.
 */
export type StepperState = 'done' | 'warn' | 'block' | 'open';

const SIGN: Record<StepperState, React.ReactElement> = {
  done: <CheckIcon aria-hidden="true" />,
  warn: <TriangleAlertIcon aria-hidden="true" />,
  block: <XIcon aria-hidden="true" />,
  open: <CircleIcon aria-hidden="true" />,
};

const SIGN_COLOR: Record<StepperState, string> = {
  done: 'text-success-foreground',
  warn: 'text-warning-foreground',
  block: 'text-destructive-foreground',
  open: 'text-muted-foreground',
};

export function Stepper({ className, ...props }: React.ComponentProps<'ol'>): React.ReactElement {
  return (
    <ol
      className={cn('flex min-w-0 items-stretch gap-1', className)}
      data-slot="stepper"
      {...props}
    />
  );
}

export function StepperStep({
  number,
  label,
  state,
  stateLabel,
  current,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'children'> & {
  number: number;
  label: string;
  state: StepperState;
  /** The state in words ("erledigt", "blockiert" …) */
  stateLabel: string;
  current: boolean;
}): React.ReactElement {
  return (
    <li className="flex min-w-0 items-center gap-1" data-slot="stepper-item">
      <button
        type="button"
        aria-current={current ? 'step' : undefined}
        className={cn(
          'group/step relative flex min-h-target min-w-target cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 font-medium text-base text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:bg-accent aria-[current=step]:border-primary aria-[current=step]:bg-primary/16 aria-[current=step]:text-foreground',
          className,
        )}
        data-slot="stepper-step"
        data-state={state}
        {...props}
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-current font-semibold text-sm tabular-nums group-aria-[current=step]/step:border-primary group-aria-[current=step]/step:bg-primary group-aria-[current=step]/step:text-primary-foreground"
        >
          {number}
        </span>
        <span className="stepper-label min-w-0 truncate" data-slot="stepper-label">
          {label}
        </span>
        <span className={cn('shrink-0 [&_svg]:size-4', SIGN_COLOR[state])} data-slot="stepper-sign">
          {SIGN[state]}
        </span>
        <span className="sr-only">{stateLabel}</span>
      </button>
    </li>
  );
}
