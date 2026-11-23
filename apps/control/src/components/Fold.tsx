import { ChevronDownIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { registerFold } from '../lib/reveal';
import { Card } from '../ui/card';
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '../ui/collapsible';
import { cn } from '../ui/utils';

/**
 * A part that is folded away until it is needed. `card`: a card of its own
 * with its heading as the way in; `more`: a quiet line inside a card.
 * The folded content stays in the page (hidden), so the quick search finds
 * what lies in it and unfolds it (`registerFold`).
 */
export function Fold({
  title,
  children,
  variant = 'more',
  open: openProp,
  onOpenChange,
  className,
  bodyClassName,
  testId,
  find,
  id,
  hidden,
}: {
  title: ReactNode;
  children: ReactNode;
  variant?: 'card' | 'more';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  bodyClassName?: string;
  testId?: string;
  /** What the quick search calls this part (`data-find`) */
  find?: string;
  id?: string;
  hidden?: boolean;
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const openNow = useRef(open);
  openNow.current = open;
  const change = useRef(onOpenChange);
  change.current = onOpenChange;
  const set = (next: boolean) => {
    setOwn(next);
    change.current?.(next);
  };
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    return registerFold(el, () => {
      const folded = !openNow.current;
      if (folded) set(true);
      return folded;
    });
  }, []);

  const trigger = (
    <CollapsibleTrigger
      data-fold-trigger=""
      className={cn(
        'flex min-h-target w-full cursor-pointer items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring [&[data-panel-open]>svg]:rotate-180',
        variant === 'card'
          ? 'font-heading font-semibold text-base'
          : 'text-muted-foreground text-sm',
      )}
    >
      {title}
      <ChevronDownIcon
        aria-hidden="true"
        className="size-5 shrink-0 opacity-72 transition-transform duration-200 motion-reduce:transition-none"
      />
    </CollapsibleTrigger>
  );

  return (
    <Collapsible
      ref={root}
      open={open}
      onOpenChange={set}
      render={variant === 'card' ? <Card /> : <div />}
      className={cn(variant === 'card' ? 'px-4 py-1' : 'flex flex-col', className)}
      data-fold={variant}
      data-testid={testId}
      data-find={find}
      id={id}
      hidden={hidden}
    >
      {variant === 'card' ? <h2>{trigger}</h2> : trigger}
      {/* Unfolds at once, like the <details> it replaces: a control inside can be tapped
          right away and never moves under the finger. */}
      <CollapsiblePanel keepMounted className="transition-none">
        <div className={cn('flex flex-col gap-3 pt-1 pb-3', bodyClassName)}>{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
