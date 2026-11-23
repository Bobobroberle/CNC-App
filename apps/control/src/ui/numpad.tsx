import { DeleteIcon } from 'lucide-react';
import type * as React from 'react';
import type { NumpadKey } from '../lib/numpad';
import { cn } from './utils';

/*
 * Number pad (DESIGN.md §8, §10): digits, ±, the decimal sign, delete and
 * "done", in keys of the app's touch size. It never takes the focus – the
 * field keeps it, so a hardware keyboard types into the same field – and it
 * shows the field's name, its value and its unit.
 */
const ROWS: readonly (readonly NumpadKey[])[] = [
  ['7', '8', '9', 'back'],
  ['4', '5', '6', 'sign'],
  ['1', '2', '3', 'separator'],
];

export function Numpad({
  label,
  value,
  unit,
  separator,
  whole = false,
  labels,
  onKey,
  onDone,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  /** The name of the field that is being filled */
  label: string;
  value: string;
  unit: string | null;
  separator: ',' | '.';
  whole?: boolean;
  labels: { back: string; sign: string; separator: string; clear: string; done: string };
  onKey: (key: NumpadKey) => void;
  onDone: () => void;
}): React.ReactElement {
  const key = (k: NumpadKey, wide = false) => {
    const text =
      k === 'back'
        ? null
        : k === 'sign'
          ? '±'
          : k === 'separator'
            ? separator
            : k === 'clear'
              ? 'C'
              : k;
    const name =
      k === 'back' || k === 'sign' || k === 'separator' || k === 'clear' ? labels[k] : undefined;
    return (
      <button
        key={k}
        type="button"
        tabIndex={-1}
        aria-label={name}
        disabled={k === 'separator' && whole}
        className={cn(
          'flex min-h-14 cursor-pointer items-center justify-center rounded-lg border border-input bg-popover font-semibold text-xl tabular-nums outline-none active:bg-accent disabled:opacity-40 [&_svg]:size-6',
          wide && 'col-span-2',
        )}
        data-slot="numpad-key"
        data-key={k}
        // The field keeps the focus: the press must not move it.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onKey(k)}
      >
        {text ?? <DeleteIcon aria-hidden="true" />}
      </button>
    );
  };
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex w-72 flex-col gap-2 rounded-xl border bg-card p-3', className)}
      data-slot="numpad"
      // The pad never takes the focus from its field – also when the tap that opened it ends
      // on the pad itself (it may come up right under the finger).
      onMouseDown={(e) => e.preventDefault()}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-muted-foreground text-sm" data-slot="numpad-label">
          {label}
        </span>
        <span className="flex items-baseline justify-end gap-1.5">
          <output
            className="min-h-9 truncate font-semibold text-[1.75rem] tabular-nums leading-none"
            data-slot="numpad-value"
          >
            {value === '' ? ' ' : value}
          </output>
          {unit ? <span className="text-muted-foreground text-sm">{unit}</span> : null}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {ROWS.flatMap((row) => row.map((k) => key(k)))}
        {key('clear')}
        {key('0')}
        <button
          type="button"
          tabIndex={-1}
          className="col-span-2 flex min-h-14 cursor-pointer items-center justify-center rounded-lg border border-primary bg-primary px-2 font-semibold text-base text-primary-foreground outline-none active:bg-primary/80"
          data-slot="numpad-done"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onDone}
        >
          {labels.done}
        </button>
      </div>
    </div>
  );
}
