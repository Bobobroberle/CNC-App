import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { Button } from '../ui/button';
import { Deviation } from './Depth';

/** Overrides go from 50 to 150 % (DESIGN.md §5); FluidNC itself would take 10–200 %. */
export const OVERRIDE_RANGE = { min: 50, max: 150 } as const;
export const clampOverride = (percent: number) =>
  Math.round(Math.min(OVERRIDE_RANGE.max, Math.max(OVERRIDE_RANGE.min, percent)));

/**
 * One override: the value the machine reports, a slider with − and + beside
 * it (§8: a slider never stands alone) and the way back to 100 %. The slider
 * sends when it is let go, not on the way: every step is a byte to the machine.
 */
export function Override({
  label,
  value,
  onChange,
  testId,
  disabled,
}: {
  label: string;
  /** What the machine reports, % */
  value: number;
  onChange: (percent: number) => void;
  testId: string;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => setDrag(null), [value]);
  const shown = drag ?? value;
  const commit = () => {
    if (drag !== null && drag !== value) onChange(drag);
    else setDrag(null);
  };
  const step = (by: number) => onChange(clampOverride(value + by));
  return (
    <div className="override" data-testid={testId} role="group" aria-label={label}>
      <div className="override-head">
        <span className="override-label">{label}</span>
        <output className="override-value tabular-nums" data-testid={`${testId}-value`}>
          {shown} %
        </output>
        {value !== 100 ? <Deviation recommended="100 %" /> : null}
      </div>
      <div className="override-row">
        <Button
          reason="missing"
          variant="outline"
          aria-label={t('overrides.less', { label })}
          disabled={disabled || value <= OVERRIDE_RANGE.min}
          onClick={() => step(-10)}
        >
          −10
        </Button>
        <input
          type="range"
          className="scrubber"
          min={OVERRIDE_RANGE.min}
          max={OVERRIDE_RANGE.max}
          step={1}
          value={shown}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <Button
          reason="missing"
          variant="outline"
          aria-label={t('overrides.more', { label })}
          disabled={disabled || value >= OVERRIDE_RANGE.max}
          onClick={() => step(10)}
        >
          +10
        </Button>
        <Button
          reason="missing"
          variant="outline"
          aria-label={t('overrides.reset', { label })}
          disabled={disabled || value === 100}
          onClick={() => onChange(100)}
        >
          100 %
        </Button>
      </div>
    </div>
  );
}
