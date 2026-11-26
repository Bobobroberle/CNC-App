import { useEffect, useState } from 'react';
import { hasKey, t, tDynamic } from '../i18n';
import {
  grouped,
  isExposureAuto,
  isExposureTime,
  rawOfTyped,
  shownValue,
  steppedValue,
  unitOf,
} from '../lib/cameraControls';
import type { CameraControl } from '../lib/companion';
import { formatPlain, parseNumber } from '../lib/format';
import { CameraFailureError, useCameraControls } from '../store/cameraControls';
import { useWorkshop } from '../store/workshop';
import { AckMark, useAck } from './Ack';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { NativeSelect } from '../ui/native-select';

/** The sentence for a failure of the companion or the camera. */
const failureText = (code: string) =>
  tDynamic(`cameraControls.errors.${code}`, 'cameraControls.errors.failed');

/** The camera's own word for a menu entry, or ours where we know the entry. */
function menuLabel(control: CameraControl, value: number, own: string): string {
  const family = isExposureAuto(control.name)
    ? 'exposureAuto'
    : control.name === 'power_line_frequency'
      ? 'powerLine'
      : null;
  const key = `cameraControls.menu.${family}.${value}`;
  return family && hasKey(key) ? tDynamic(key, 'cameraControls.errors.failed') : own;
}

const unitText = (control: CameraControl) => (unitOf(control) === 'ms' ? ' ms' : '');
const numberText = (control: CameraControl, raw: number) =>
  formatPlain(shownValue(control, raw), unitOf(control) === 'ms' ? 1 : 0);

/** Why a setting has no effect now: said of the switch it hangs on. */
function inactiveText(control: CameraControl): string {
  if (isExposureTime(control.name)) return t('cameraControls.inactive.exposure');
  if (control.name === 'white_balance_temperature')
    return t('cameraControls.inactive.whiteBalance');
  if (control.name === 'focus_absolute') return t('cameraControls.inactive.focus');
  return t('cameraControls.inactive.other');
}

/** One setting of the camera, as the camera reports it: a number with ± and the range, a choice, or a switch. */
function ControlRow({ control }: { control: CameraControl }) {
  const ack = useAck();
  const [text, setText] = useState(() => numberText(control, control.value));
  const [note, setNote] = useState<string | null>(null);
  // The value shown is what the camera reports: a read or a write that answers shows it anew
  useEffect(() => setText(numberText(control, control.value)), [control.value]);
  const locked = control.inactive || control.readOnly;
  const label = tDynamic(`cameraControls.names.${control.name}`, 'cameraControls.errors.failed');
  const unit = unitText(control);
  const range = t('cameraControls.range', {
    min: numberText(control, control.min),
    max: numberText(control, control.max),
    unit,
  });

  /** The row shows what the camera reports: after a write, whatever came of it. */
  const resync = () => {
    const now = useCameraControls.getState().controls?.find((c) => c.name === control.name);
    if (now) setText(numberText(now, now.value));
  };

  /** Sends one change; the answer's read-back is what the row shows afterwards. */
  const send = (value: number) =>
    ack.run(async () => {
      setNote(null);
      try {
        const answer = await useCameraControls.getState().apply({ [control.name]: value });
        const result = answer.results[control.name];
        if (!result || !result.ok) {
          const why = result && !result.ok ? result.error.replace(/^refused:/, '') : 'driver';
          setNote(tDynamic(`cameraControls.refused.${why}`, 'cameraControls.refused.driver'));
          return false;
        }
        if (result.value !== value)
          setNote(t('cameraControls.takenAs', { value: numberText(control, result.value), unit }));
        return true;
      } catch (error) {
        setNote(failureText(error instanceof CameraFailureError ? error.failure : 'failed'));
        return false;
      } finally {
        resync();
      }
    });

  /** The typed number, on commit (leaving the field, Enter): sent if it is a number the camera takes. */
  const commit = () => {
    // Enter sends, and leaving the field afterwards commits again: what is on its way is not sent twice
    if (ack.state === 'busy') return;
    const typed = parseNumber(text);
    if (text.trim() === '' || !Number.isFinite(typed)) {
      setNote(t('cameraControls.notANumber'));
      setText(numberText(control, control.value));
      return;
    }
    const target = rawOfTyped(control, typed);
    if ('error' in target) {
      setNote(
        t('cameraControls.outOfRange', {
          min: numberText(control, control.min),
          max: numberText(control, control.max),
          unit,
        }),
      );
      setText(numberText(control, control.value));
      return;
    }
    setText(numberText(control, target.raw));
    if (target.raw !== control.value) void send(target.raw);
  };

  const stepDown = steppedValue(control, -1);
  const stepUp = steppedValue(control, 1);
  const mark = <AckMark state={ack.state} />;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid={`camera-control-${control.name}`}
      data-inactive={control.inactive ? '' : undefined}
    >
      {control.type === 'bool' ? (
        <div className="flex items-center gap-2">
          <Label className="min-h-target gap-3 font-normal">
            <Checkbox
              checked={control.value === 1}
              disabled={locked || ack.state === 'busy'}
              onCheckedChange={(on) => void send(on ? 1 : 0)}
            />
            {label}
          </Label>
          {mark}
        </div>
      ) : control.type === 'menu' ? (
        <Field>
          <div className="flex items-center gap-2">
            <FieldLabel>{label}</FieldLabel>
            {mark}
          </div>
          <NativeSelect
            value={String(control.value)}
            disabled={locked || ack.state === 'busy'}
            onChange={(e) => void send(Number(e.target.value))}
          >
            {(control.menu ?? []).some((e) => e.value === control.value) ? null : (
              <option value={String(control.value)}>{control.value}</option>
            )}
            {(control.menu ?? []).map((e) => (
              <option key={e.value} value={String(e.value)}>
                {menuLabel(control, e.value, e.label)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field>
          <div className="flex items-center gap-2">
            <FieldLabel>{unit ? `${label} (${unit.trim()})` : label}</FieldLabel>
            {mark}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={`${label} −`}
              disabled={locked || ack.state === 'busy' || stepDown === null}
              reason={locked ? inactiveText(control) : 'missing'}
              onClick={() => stepDown !== null && void send(stepDown)}
            >
              −
            </Button>
            <Input
              type="text"
              inputMode="decimal"
              className="tabular-nums"
              value={text}
              disabled={locked || ack.state === 'busy'}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
              }}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={`${label} +`}
              disabled={locked || ack.state === 'busy' || stepUp === null}
              reason={locked ? inactiveText(control) : 'missing'}
              onClick={() => stepUp !== null && void send(stepUp)}
            >
              +
            </Button>
          </div>
          <p className="text-muted-foreground text-sm tabular-nums">{range}</p>
        </Field>
      )}
      {control.inactive ? (
        <p className="text-muted-foreground text-sm" data-testid="control-inactive">
          {inactiveText(control)}
        </p>
      ) : control.readOnly ? (
        <p className="text-muted-foreground text-sm">{t('cameraControls.readOnly')}</p>
      ) : null}
      {note ? (
        <p className="text-sm text-warning-foreground" role="status" data-testid="control-note">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** The card's body: only mounted where a companion answers that it can set the camera. */
function ControlsBody() {
  const controls = useCameraControls((s) => s.controls);
  const error = useCameraControls((s) => s.error);
  const loading = useCameraControls((s) => s.loading);
  const reading = useAck();

  // Read the camera when the card opens: what it shows is what the camera reports now
  useEffect(() => {
    void useCameraControls
      .getState()
      .read()
      .catch(() => undefined);
  }, []);

  const read = () =>
    reading.run(() =>
      useCameraControls
        .getState()
        .read()
        .then(
          () => true,
          () => false,
        ),
    );
  const groups = controls ? grouped(controls) : [];
  const hasExposureTime = groups.some((g) => g.controls.some((c) => isExposureTime(c.name)));

  return (
    <Card className="gap-3 p-4" data-testid="camera-controls" data-find="camera-controls">
      <CardTitle render={<h2 />}>{t('cameraControls.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('cameraControls.hint')}</p>
      <Button variant="outline" disabled={loading} onClick={() => void read()}>
        {t('cameraControls.read')}
        <AckMark state={reading.state} />
      </Button>
      {error ? (
        <Alert
          variant="warning"
          role="alert"
          data-testid="camera-controls-error"
          data-error={error}
        >
          {failureText(error)}
        </Alert>
      ) : null}
      {loading && controls === null ? (
        <p className="text-muted-foreground text-sm">{t('cameraControls.reading')}</p>
      ) : null}
      {controls !== null && groups.length === 0 && !error ? (
        <p className="text-muted-foreground text-sm">{t('cameraControls.empty')}</p>
      ) : null}
      {groups.map((g) => (
        <section
          key={g.group}
          className="flex flex-col gap-3"
          data-testid={`camera-group-${g.group}`}
        >
          <h3 className="font-medium text-muted-foreground text-sm">
            {t(`cameraControls.groups.${g.group}`)}
          </h3>
          {g.controls.map((c) => (
            <ControlRow key={c.name} control={c} />
          ))}
          {g.group === 'exposure' && hasExposureTime ? (
            <p className="text-muted-foreground text-sm">{t('cameraControls.exposureHint')}</p>
          ) : null}
        </section>
      ))}
    </Card>
  );
}

/**
 * Einstellungen → Kamera → Belichtung und Bild: exposure, gain and the rest of the USB camera's picture settings,
 * set through the companion (`v4l2-ctl`) instead of by SSH. Shown only where a companion answers that it can.
 */
export function CameraControlsCard() {
  const available = useWorkshop(
    (s) => s.companionOnline === true && s.companionHealth?.cameraControls === true,
  );
  return available ? <ControlsBody /> : null;
}
