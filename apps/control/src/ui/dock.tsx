import type React from 'react';
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
