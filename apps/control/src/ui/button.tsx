import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from './utils';

/*
 * coss ui Button. Changed for this app: every size is at least 48 px high
 * (touch first – the dense desktop sizes are gone), a long German label may
 * wrap instead of running out of its card, and `pressed` marks a button that
 * is switched on. The variants follow DESIGN.md: `default` is the one primary
 * action (blue), `outline` the secondary one, `success` a confirmed/go state,
 * `destructive` is NOT-HALT's red and belongs to faults and alarms only. No
 * shadows: a pressed button changes its surface at once (≤ 100 ms).
 */
export const buttonVariants = cva(
  "relative inline-flex min-w-target shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border py-1 text-center font-medium text-base leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'min-h-target px-[calc(--spacing(4)-1px)]',
        icon: 'size-target',
        lg: 'min-h-14 px-[calc(--spacing(5)-1px)]',
        sm: 'min-h-target gap-1.5 px-[calc(--spacing(2.5)-1px)] text-sm',
        xl: 'min-h-16 px-[calc(--spacing(5)-1px)] text-lg',
      },
      variant: {
        default:
          'border-primary bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 data-pressed:bg-primary/80',
        destructive:
          'border-(--estop) bg-(--estop) text-white hover:bg-(--estop-pressed) active:bg-(--estop-pressed) data-pressed:bg-(--estop-pressed)',
        'destructive-outline':
          'border-destructive/64 bg-popover text-destructive-foreground hover:bg-destructive/8 active:bg-destructive/16 data-pressed:bg-destructive/16',
        ghost:
          'border-transparent text-foreground hover:bg-accent active:bg-accent data-pressed:bg-accent',
        link: 'border-transparent text-foreground underline-offset-4 hover:underline data-pressed:underline',
        outline:
          'border-input bg-popover text-foreground hover:bg-accent active:bg-accent data-pressed:border-primary data-pressed:bg-primary/16',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-accent active:bg-accent data-pressed:bg-accent',
        success:
          'border-success bg-success text-on-solid hover:bg-success/90 active:bg-success/80 data-pressed:bg-success/80',
      },
    },
  },
);

export interface ButtonProps extends useRender.ComponentProps<'button'> {
  variant?: VariantProps<typeof buttonVariants>['variant'];
  size?: VariantProps<typeof buttonVariants>['size'];
  /** Switched on: sets `aria-pressed` and the pressed look */
  pressed?: boolean;
  /**
   * Why the button is disabled (DESIGN.md §6.2): shown on a tap by the app's
   * `ReasonLayer` and read out as the button's description. Ignored while enabled.
   * Two general ones need no text of their own: `machine` – whatever the
   * machine's state has against it right now (not connected, alarm, busy) –
   * and `missing` – a precondition the card itself names.
   */
  reason?: 'machine' | 'missing' | (string & {}) | null;
}

export function Button({
  className,
  variant,
  size,
  render,
  pressed,
  reason,
  ...props
}: ButtonProps): React.ReactElement {
  const why = props.disabled && reason ? reason : undefined;
  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    'data-reason': why,
    // The two general reasons are put into words by the layer, at the tap.
    'aria-description': why === 'machine' || why === 'missing' ? undefined : why,
    'aria-pressed': pressed,
    'data-pressed': pressed ? '' : undefined,
    'data-slot': 'button',
    type: render ? undefined : ('button' as const),
  };

  return useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>(defaultProps, props),
    render,
  });
}
