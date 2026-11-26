import type { AxisErrors } from '@lowrider/workshop';
import { useEffect, useState } from 'react';
import { t, type MessageKey } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { PLACE } from '../lib/stateSync';
import { squaringStory } from '../lib/squaring';
import { proposeCorrections, useCalibration, type Correction } from '../store/calibration';
import { useMachine } from '../store/machine';
import { useWorkshop, type CalibrationSettings } from '../store/workshop';
import { GantrySketch } from './AccuracySketch';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const num = (text: string) => parseNumber(text);

export /** Signed number with a real minus sign. */
const signed = (value: number, decimals: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${formatNumber(Math.abs(value), decimals)}`;

/** A number field that saves valid input at once – and follows the value when something else changes it. */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = Infinity,
  integer = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  /** Entries must be above this */
  min?: number;
  /** Beyond this the entry is not taken (what the Pi would refuse of it as well) */
  max?: number;
  /** Whole numbers only (a count) */
  integer?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  // A value that was set from elsewhere (the measuring field follows the plate) shows; what is being typed stays
  useEffect(() => {
    setText((now) => (num(now) === value ? now : value === null ? '' : String(value)));
  }, [value]);
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = num(e.target.value);
          if (
            e.target.value.trim() !== '' &&
            Number.isFinite(v) &&
            v > min &&
            v <= max &&
            (!integer || Number.isInteger(v))
          )
            onChange(v);
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
  blocked = false,
  onApplied,
}: {
  first: AxisErrors;
  turned: AxisErrors | null;
  /** The reference is trustworthy for scale and angle without turning it */
  precise: boolean;
  /** The corrections must not be written now (what they are based on is out of date) */
  blocked?: boolean;
  /** After the corrections were written (and which); the measurement no longer fits the machine */
  onApplied: (corrections: Correction[]) => void;
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
  // In words, from the one place that decides the direction: what stands askew and what the correction does about it
  const story = squaringStory(proposal.squareness, proposal.shift);
  return (
    <>
      <h3 className="font-medium text-muted-foreground text-sm">{t('calibration.correct')}</h3>
      <GantrySketch motor1Side={s.motor1Side ?? null} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t('calibration.gantryWidth')}
          max={PLACE}
          value={s.gantryWidth}
          onChange={(gantryWidth) => save({ gantryWidth })}
        />
      </div>
      <p className="text-muted-foreground text-sm" data-testid="gantry-help">
        {t('accuracy.gantry.help')}
      </p>
      <p className="text-muted-foreground text-sm">{t('accuracy.gantry.motorHelp')}</p>
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
      {story.kind === 'lean' ? (
        <div className="flex flex-col gap-2" data-testid="squaring-story" data-ahead={story.ahead}>
          <p className="text-sm">
            {story.leanMm !== undefined
              ? t('accuracy.story.lean', {
                  side: t(`accuracy.story.side.${story.ahead!}` as MessageKey),
                  mm: formatNumber(story.leanMm, 2),
                  width: formatNumber(s.gantryWidth ?? 0, 0),
                  per: formatNumber(Math.abs(story.perMetre ?? 0), 2),
                })
              : t('accuracy.story.leanNoWidth', {
                  side: t(`accuracy.story.side.${story.ahead!}` as MessageKey),
                  per: formatNumber(Math.abs(story.perMetre ?? 0), 2),
                })}
          </p>
          {story.move ? (
            <p className="text-sm">
              {t(
                story.move.towards === 'front'
                  ? 'accuracy.story.moveFront'
                  : 'accuracy.story.moveBack',
                {
                  mm: formatNumber(story.move.mm, 2),
                },
              )}
            </p>
          ) : null}
        </div>
      ) : null}
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
      {blocked ? (
        <Alert variant="warning" data-testid="correction-blocked">
          {t('accuracy.blocked')}
        </Alert>
      ) : null}
      <HoldButton
        variant="accent"
        disabled={!idle || busy || blocked || proposal.corrections.length === 0}
        onConfirm={() => {
          const written = proposal.corrections;
          void cal.apply(written).then((ok) => ok && onApplied(written));
        }}
      >
        {t('calibration.apply')}
      </HoldButton>
    </>
  );
}
