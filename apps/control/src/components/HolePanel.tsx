import { twoHoleAlignment, type Vec } from '@lowrider/workshop';
import { useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatNumber, parseNumber } from '../lib/format';
import { useCalibration } from '../store/calibration';
import { useCamera } from '../store/camera';
import { HOLE_DISTANCE_LIMIT, useHoles } from '../store/holes';
import { useMachine } from '../store/machine';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { useLiveMarker } from './useLiveMarker';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert } from '../ui/alert';

const num = (text: string) => parseNumber(text);

/** X/Y of a hole in the job, saved as soon as both numbers are valid. */
function JobHole({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Vec;
  onChange: (v: Vec) => void;
}) {
  const [text, setText] = useState({ x: String(value.x), y: String(value.y) });
  const edit = (patch: Partial<typeof text>) => {
    const next = { ...text, ...patch };
    setText(next);
    const v = { x: num(next.x), y: num(next.y) };
    if (Number.isFinite(v.x) && Number.isFinite(v.y)) onChange(v);
  };
  return (
    <>
      <Field>
        <FieldLabel>{t('camera.holeX', { label })}</FieldLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={text.x}
          onChange={(e) => edit({ x: e.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel>{t('camera.holeY', { label })}</FieldLabel>
        <Input
          type="text"
          inputMode="decimal"
          value={text.y}
          onChange={(e) => edit({ y: e.target.value })}
        />
      </Field>
    </>
  );
}

/** What the hole functions need: an idle machine, a picture and no other camera task running. */
function useHoleReady() {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const cameraOn = useCamera((c) => c.source !== null && c.size !== null);
  const busy = useCalibration((c) => c.task !== null);
  return { idle, cameraOn, busy, ready: idle && cameraOn && !busy };
}

/**
 * A hole in the workpiece as the X/Y zero, found by the camera itself: drive
 * roughly over it, the app centres it.
 */
export function HoleZero() {
  const camera = useWorkshop((s) => s.settings.camera);
  const { setSettings } = useWorkshop.getState();
  const { cameraOn, ready } = useHoleReady();
  const live = useLiveMarker();
  return (
    <>
      <h3 className="font-medium text-muted-foreground text-sm" data-find="hole-zero">
        {t('camera.holesTitle')}
      </h3>
      <p className="text-muted-foreground text-sm">{t('camera.holesHint')}</p>
      {cameraOn ? (
        <p className="text-muted-foreground text-sm tabular-nums" data-testid="hole-live">
          {live
            ? t('camera.holeSeen', {
                d: formatNumber(live.diameter, 1),
                off: formatNumber(live.off, 2),
              })
            : t('camera.holeNotSeen')}
        </p>
      ) : null}
      <HoldButton
        variant="accent"
        disabled={!ready}
        onConfirm={() => void useHoles.getState().zeroOnHole()}
      >
        {t('camera.zeroOnHole')}
      </HoldButton>
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={camera.lightMarker}
          onCheckedChange={(checked) =>
            setSettings({ camera: { ...camera, lightMarker: checked } })
          }
        />
        <span>{t('camera.lightMarker')}</span>
      </Label>
    </>
  );
}

/** Two holes whose place in the job is known: zero on the first, rotation from the second. */
export function TwoHoles() {
  const { idle, busy, ready } = useHoleReady();
  const holes = useHoles();
  const fit =
    holes.a && holes.b
      ? twoHoleAlignment({ a: holes.a, b: holes.b }, { a: holes.jobA, b: holes.jobB })
      : null;
  const fits = fit !== null && Math.abs(fit.distanceError) <= HOLE_DISTANCE_LIMIT;

  return (
    <div className="hole-panel" data-testid="hole-panel">
      <p className="text-muted-foreground text-sm">{t('camera.twoHolesHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        <JobHole label="1" value={holes.jobA} onChange={(jobA) => holes.setJobHoles({ jobA })} />
        <JobHole label="2" value={holes.jobB} onChange={(jobB) => holes.setJobHoles({ jobB })} />
      </div>
      {(['a', 'b'] as const).map((which, i) => (
        <div key={which} className="hole-step">
          <HoldButton disabled={!ready} onConfirm={() => void holes.findHole(which)}>
            {t('camera.findHole', { n: i + 1 })}
          </HoldButton>
          <p className="text-muted-foreground text-sm tabular-nums">
            {holes[which]
              ? t('camera.holeAt', {
                  x: formatCoordinate(holes[which]!.x, 3),
                  y: formatCoordinate(holes[which]!.y, 3),
                })
              : t('camera.holeOpen')}
          </p>
        </div>
      ))}
      {fit ? (
        <Alert variant={fits ? 'success' : 'warning'} data-testid="two-holes-result">
          {t(fits ? 'camera.holesResult' : 'camera.holesOff', {
            angle: formatNumber(fit.rotation, 3),
            error: formatNumber(fit.distanceError, 2),
          })}
        </Alert>
      ) : null}
      <HoldButton
        variant="accent"
        disabled={!idle || busy || !fits}
        onConfirm={() => void holes.applyTwoHoles()}
      >
        {t('camera.applyTwoHoles')}
      </HoldButton>
    </div>
  );
}
