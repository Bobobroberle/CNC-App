import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from './utils';

/** The three rests of the sheet: its handle only, a share below the picture, the whole work area */
export type SheetLevel = 'peek' | 'half' | 'full';
export const SHEET_LEVELS: readonly SheetLevel[] = ['peek', 'half', 'full'];

/** One rest further up or down; the same rest at either end. */
export function sheetStep(level: SheetLevel, by: 1 | -1): SheetLevel {
  const index = SHEET_LEVELS.indexOf(level) + by;
  return SHEET_LEVELS[Math.max(0, Math.min(SHEET_LEVELS.length - 1, index))]!;
}

/*
 * Bottom sheet (DESIGN.md §4): on the machine's touch screen (600–1023 px)
 * the context panel lies as a sheet along the bottom edge. The picture has
 * the right of way, so the sheet has three rests: folded to its handle
 * (`peek`), a share below the picture (`half`, where it starts) and the whole
 * work area (`full`). Labelled buttons in the handle move between them – a
 * gesture is never the only way (§8), and here there is none at all: the
 * sheet never moves under a finger that drags something inside it. The sheet
 * is a part of the page, not a dialog: the picture above stays in use,
 * NOT-HALT, PAUSE and the action bar stay free.
 */
export function Sheet({
  level,
  onLevelChange,
  title,
  labels,
  actions,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'section'>, 'title'> & {
  level: SheetLevel;
  onLevelChange: (level: SheetLevel) => void;
  title: React.ReactNode;
  labels: { open: string; close: string; smaller: string; larger: string };
  /** What else stands in the handle's row (e.g. closing what lies in the sheet) */
  actions?: React.ReactNode;
}): React.ReactElement {
  const open = level !== 'peek';
  const step =
    'flex min-h-target shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-muted-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent [&_svg]:size-5';
  return (
    <section
      className={cn('flex min-h-0 flex-col rounded-t-xl border border-b-0 bg-card', className)}
      data-slot="sheet"
      data-open={open ? '' : undefined}
      data-level={level}
      {...props}
    >
      <div className="flex shrink-0 items-center gap-1 pr-1" data-slot="sheet-head">
        <button
          type="button"
          className="flex min-h-target min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-tl-xl px-4 text-left font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent"
          aria-expanded={open}
          data-slot="sheet-handle"
          onClick={() => onLevelChange(open ? 'peek' : 'half')}
        >
          <span className="min-w-0 truncate">{title}</span>
          <span className="sr-only">{open ? labels.close : labels.open}</span>
        </button>
        {actions}
        {level !== 'peek' ? (
          <button
            type="button"
            className={step}
            data-slot="sheet-smaller"
            onClick={() => onLevelChange(sheetStep(level, -1))}
          >
            <ChevronDownIcon aria-hidden="true" />
            {level === 'half' ? labels.close : labels.smaller}
          </button>
        ) : null}
        {level !== 'full' ? (
          <button
            type="button"
            className={step}
            data-slot="sheet-larger"
            onClick={() => onLevelChange(sheetStep(level, 1))}
          >
            <ChevronUpIcon aria-hidden="true" />
            {level === 'peek' ? labels.open : labels.larger}
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1" data-slot="sheet-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
