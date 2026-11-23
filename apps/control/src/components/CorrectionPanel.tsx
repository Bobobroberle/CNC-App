import type { AxisErrors } from '@lowrider/workshop';
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { proposeCorrections, useCalibration, type Correction } from '../store/calibration';
import { useMachine } from '../store/machine';
import { useWorkshop, type CalibrationSettings } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const num = (text: string) => parseNumber(text);

export /** Signed number with a real minus sign. */
const signed = (value: number, decimals: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${formatNumber(Math.abs(value), decimals)}`;

/** A number field that saves valid input at once. */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = num(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(v) && v > min) onChange(v);
        }}
      />
    </Field>
  );
}

/**
 * Turns a measured scale and squareness into config.yaml changes: steps/mm
 * of X and Y and the pull-off of the two Y motors (gantry squaring), written
 * with a backup. Used by the camera measurement and the rule check.
 */
export function CorrectionPanel({
  first,
  turned,
  precise,
  onApplied,
}: {
  first: AxisErrors;
  turned: AxisErrors | null;
  /** The reference is trustworthy for scale and angle without turning it */
  precise: boolean;
  /** After the corrections were written; the measurement no longer fits the machine */
  onApplied: () => void;
}) {
  const s = useWorkshop((w) => w.settings.calibration);
  const { setSettings } = useWorkshop.getState();
  const save = (patch: Partial<CalibrationSettings>) =>
    setSettings({ calibration: { ...useWorkshop.getState().settings.calibration, ...patch } });
  const cal = useCalibration();
  const idle = useMachine((m) => m.connection === 'connected' && m.status?.state === 'Idle');
  const connected = useMachine((m) => m.connection === 'connected');
  const busy = cal.task !== null;

  // The values the corrections start from: read once per measurement.
  const { readConfig } = cal;
  useEffect(() => {
    if (connected) void readConfig();
  }, [first, connected, readConfig]);

  const proposal = proposeCorrections(first, turned, { ...s, precise }, cal.config);
  return (
    <>
      <h3 className="font-medium text-muted-foreground text-sm">{t('calibration.correct')}</h3>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t('calibration.gantryWidth')}
          value={s.gantryWidth}
          onChange={(gantryWidth) => save({ gantryWidth })}
        />
      </div>
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('calibration.motor1Side')}
      >
        {(['xMin', 'xMax'] as const).map((side) => (
          <SegmentedControlItem
            key={side}
            pressed={s.motor1Side === side}
            onClick={() => save({ motor1Side: side })}
          >
            {t(`calibration.side.${side}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {proposal.missing.map((m) => (
        <p key={m} className="text-muted-foreground text-sm">
          {t(`calibration.missing.${m}`)}
        </p>
      ))}
      {proposal.corrections.length > 0 ? (
        <table className="table-list" data-testid="calibration-corrections">
          <tbody>
            {proposal.corrections.map((c: Correction) => (
              <tr key={c.path}>
                <td>
                  <code>{c.path}</code>
                </td>
                <td className="num">
                  {formatNumber(c.from, 3)} → {formatNumber(c.to, 3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : proposal.missing.length === 0 ? (
        <Alert variant="success">{t('calibration.nothingToDo')}</Alert>
      ) : null}
      <HoldButton
        variant="accent"
        disabled={!idle || busy || proposal.corrections.length === 0}
        onConfirm={() => void cal.apply(proposal.corrections).then((ok) => ok && onApplied())}
      >
        {t('calibration.apply')}
      </HoldButton>
    </>
  );
}
