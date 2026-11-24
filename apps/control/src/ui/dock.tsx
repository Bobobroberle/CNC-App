import type React from 'react';
import { useEffect, useRef } from 'react';
import { cn } from './utils';

/**
 * The main action of a card, docked to the bottom of the panel it lies in (DESIGN.md §5): it stays
 * where a thumb reaches it while the card scrolls past, instead of lying below the fold of a long
 * card. Sticky, not a copy: the one button stays in its card (a test or a screen reader finds one),
 * and it lets go at the card's own end. Whatever lies between the button and the panel must not
 * clip (`overflow`), or the sticking silently stops – `e2e/dock.spec.ts` measures that it works.
 */
export function Dock({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return <div data-slot="dock" className={cn('dock', className)} {...props} />;
}

/**
 * What a docked action leaves behind (a result, a warning, a way back): it appears in the card's
 * flow, which may lie below where the dock is stuck – so it is brought into view when it shows,
 * above the dock (the panel's `scroll-padding-bottom` keeps it clear of it). A card that is not
 * taller than its panel does not move.
 */
export function Result({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  return <div ref={ref} data-slot="result" className={className} {...props} />;
}
