import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { cn } from './utils';

/* coss ui Badge, in its touch sizes only. */
export const badgeVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm border border-transparent font-medium outline-none [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-5.5 min-w-5.5 px-[calc(--spacing(1.5)-1px)] text-sm',
        lg: 'h-6.5 min-w-6.5 px-[calc(--spacing(2)-1px)] text-base',
        sm: 'h-5 min-w-5 rounded-[.25rem] px-[calc(--spacing(1)-1px)] text-xs',
      },
      variant: {
        default: 'bg-primary text-primary-foreground',
        destructive: 'bg-destructive text-white',
        error: 'bg-destructive/8 text-destructive-foreground dark:bg-destructive/16',
        info: 'bg-info/8 text-info-foreground dark:bg-info/16',
        outline: 'border-input bg-background text-foreground dark:bg-input/32',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-success/8 text-success-foreground dark:bg-success/16',
        warning: 'bg-warning/8 text-warning-foreground dark:bg-warning/16',
      },
    },
  },
);

export interface BadgeProps extends useRender.ComponentProps<'span'> {
  variant?: VariantProps<typeof badgeVariants>['variant'];
  size?: VariantProps<typeof badgeVariants>['size'];
}

export function Badge({
  className,
  variant,
  size,
  render,
  ...props
}: BadgeProps): React.ReactElement {
  const defaultProps = {
    className: cn(badgeVariants({ className, size, variant })),
    'data-slot': 'badge',
  };

  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(defaultProps, props),
    render,
  });
}
