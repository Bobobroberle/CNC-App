import type * as React from 'react';
import { cn } from './utils';

/*
 * DRO display (DESIGN.md §7, §10): the axes with their colours, numbers in
 * tabular figures with fixed decimals, right-aligned, unit beside – a value
 * that changes never moves the layout.
 */
export type DroAxis = 'X' | 'Y' | 'Z' | 'A';

const AXIS_COLOR: Record<DroAxis, string> = {
  X: 'text-axis-x',
  Y: 'text-axis-y',
  Z: 'text-axis-z',
  A: 'text-axis-a',
};

export function Dro({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'lg' }): React.ReactElement {
  return (
    <div
      className={cn('flex items-baseline gap-x-4 gap-y-1', className)}
      data-slot="dro"
      data-size={size}
      {...props}
    />
  );
}

export function DroValue({
  axis,
  value,
  unit,
  size = 'default',
  className,
}: {
  axis: DroAxis;
  /** Already formatted with its fixed decimals */
  value: string;
  /** Left out where the group names the unit once for all its axes */
  unit?: string;
  size?: 'default' | 'lg';
  className?: string;
}): React.ReactElement {
  return (
    <span
      className={cn('inline-flex items-baseline gap-1.5 whitespace-nowrap', className)}
      data-slot="dro-value"
      data-axis={axis}
    >
      <span className={cn('font-bold', size === 'lg' ? 'text-xl' : 'text-sm', AXIS_COLOR[axis])}>
        {axis}
      </span>
      <span
        className={cn(
          'inline-block text-right font-semibold tabular-nums leading-none',
          size === 'lg' ? 'min-w-[7ch] text-[2rem]' : 'min-w-[7.5ch] text-[1.75rem]',
        )}
        data-slot="dro-number"
      >
        {value}
      </span>
      {unit ? <span className="text-muted-foreground text-xs">{unit}</span> : null}
    </span>
  );
}
