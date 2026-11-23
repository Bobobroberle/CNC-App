import { t, type MessageKey } from '../i18n';
import { Badge } from '../ui/badge';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/** The second level inside a step or an area (DESIGN.md §3.4: two levels at most). */
export function SubNav<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  /** `badge`: a count of open points next to the label */
  options: { id: T; label: MessageKey; badge?: number }[];
  onChange: (id: T) => void;
  label: MessageKey;
}) {
  return (
    <div className="subnav">
      <SegmentedControl className="w-full flex-wrap" role="group" aria-label={t(label)}>
        {options.map((o) => (
          <SegmentedControlItem
            key={o.id}
            className="flex-auto basis-20 px-1 text-[15px]"
            pressed={value === o.id}
            onClick={() => onChange(o.id)}
          >
            {t(o.label)}
            {o.badge !== undefined ? <Badge variant="warning">{o.badge}</Badge> : null}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}
