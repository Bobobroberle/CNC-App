import { bounds, pathLength, sketchSize, tidySketch, type Contour } from '@lowrider/cam';
import { useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '../i18n';
import { partsOf, type CamItem } from '../lib/camItems';
import { formatNumber, parseNumber } from '../lib/format';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Reason } from '../ui/tooltip';

/** Whole millimetres without decimals, everything else with one. */
export const mm = (v: number) => formatNumber(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);

/** A number as it stands in a field: at most two decimals, with a comma. */
const shown = (v: number) => String(Number(v.toFixed(2))).replace('.', ',');

/**
 * A number field of the drawing workspace: typed with comma or point, taken
 * over as soon as it is a number in range, and showing the value anew when
 * that changes from elsewhere (a finger moved the part, a suggestion came).
 */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  placeholder,
  bare = false,
  disabled = false,
  reason,
}: {
  label: MessageKey | { text: string };
  /** Undefined shows the placeholder: the value is left to a default */
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  placeholder?: string;
  /** Only the input, named by the label for screen readers */
  bare?: boolean;
  /** Cannot be typed into – `reason` says why, on a tap (a disabled field takes none itself) */
  disabled?: boolean;
  reason?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : shown(value));
  const taken = useRef(value);
  useEffect(() => {
    const same =
      value === taken.current ||
      (value !== undefined &&
        taken.current !== undefined &&
        Math.abs(value - taken.current) < 1e-3);
    if (same) return;
    taken.current = value;
    setText(value === undefined ? '' : shown(value));
  }, [value]);
  const name = typeof label === 'string' ? t(label) : label.text;
  const input = (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={bare ? name : undefined}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        // An emptied field goes back to the default, where there is one.
        const v =
          e.target.value.trim() === '' && placeholder !== undefined
            ? undefined
            : parseNumber(e.target.value);
        if (v === undefined || (Number.isFinite(v) && v >= min)) {
          taken.current = v;
          onChange(v);
        }
      }}
    />
  );
  const field =
    disabled && reason ? (
      <Reason reason={reason} className="block w-full">
        {input}
      </Reason>
    ) : (
      input
    );
  if (bare) return field;
  return (
    <Field>
      <FieldLabel>{name}</FieldLabel>
      {field}
    </Field>
  );
}

function describeContour(c: Contour): string {
  if (c.circle) return t('cam.circleLabel', { d: mm(c.circle.r * 2) });
  if (!c.closed) return t('cam.lineLabel', { l: mm(pathLength(c.points, false)) });
  const b = bounds(c.points);
  return t('cam.contourLabel', { w: mm(b.maxX - b.minX), h: mm(b.maxY - b.minY) });
}

/** What an item is called in the list: its text, its shape, or how many of them. */
export function describeItem(item: CamItem): string {
  if (item.registration !== undefined) return t('flip.holeLabel', { n: item.registration });
  if (item.text !== undefined) {
    const line = item.text.split('\n')[0]!;
    return t('cam.textLabel', { text: line.length > 24 ? `${line.slice(0, 23)}…` : line });
  }
  const s = item.sketch;
  if (s?.type === 'rect') return t('cam.rectLabel', { w: mm(s.w), h: mm(s.h) });
  if (s?.type === 'slot') return t('cam.slotLabel', { l: mm(s.l), w: mm(s.w) });
  if (s?.type === 'grid') return t('cam.gridLabel', { nx: s.nx, ny: s.ny, d: mm(s.d) });
  // The curved shapes by what is drawn (a star that was typed 99 tips has 32)
  if (
    s &&
    (s.type === 'ellipse' || s.type === 'star' || s.type === 'gear' || s.type === 'spiral')
  ) {
    const drawn = tidySketch(s);
    const size = sketchSize(drawn)!;
    if (drawn.type === 'ellipse') {
      return t('cam.ellipseLabel', { w: mm(size.w), h: mm(size.h) });
    }
    if (drawn.type === 'star')
      return t('cam.starLabel', { n: drawn.points, d: mm(2 * drawn.outer) });
    if (drawn.type === 'gear')
      return t('cam.gearLabel', { n: drawn.teeth, d: mm(2 * drawn.outer) });
    if (drawn.type === 'spiral') {
      return t('cam.spiralLabel', { n: formatNumber(drawn.turns, 2).replace(/,?0+$/, '') });
    }
  }
  const first = describeContour(item.contours[0]!);
  return item.contours.length > 1
    ? t('cam.manyLabel', { n: item.contours.length, what: first })
    : first;
}

/** What a group is called where it is named among others: the one part it holds, or how many contours it is. */
export function describeGroup(items: readonly CamItem[], group: number): string {
  const parts = partsOf(items).filter((i) => i.group === group);
  return parts.length === 1
    ? describeItem(parts[0]!)
    : t('cam.arrange.groupOf', { m: parts.length });
}
