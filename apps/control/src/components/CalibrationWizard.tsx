import { useState } from 'react';
import { t } from '../i18n';
import {
  DOT_DIAMETER_MAX,
  DOTS_MAX,
  PITCH_MAX,
  dotSizeOff,
  offeredPoints,
  plateSpan,
  plateWarnings,
} from '../lib/calibrationPlate';
import { formatNumber, formatPlain } from '../lib/format';
import { PLACE, SETTLE_MAX_MS } from '../lib/stateSync';
import { gridShortfall, proposeCorrections, useCalibration } from '../store/calibration';
import { useCamera } from '../store/camera';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useWorkshop, type CalibrationSettings } from '../store/workshop';
import { CorrectionPanel, NumberField, signed } from './CorrectionPanel';
import { HoldButton } from './HoldButton';
import { useLiveMarker } from './useLiveMarker';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/**
 * Measures the machine with the camera and a plate of dots: scale of X and
 * Y, the angle between them, belt play and the tilt of Z, and writes the
 * corrections into config.yaml (with a backup).
 */
export function CalibrationWizard() {
  const s = useWorkshop((w) => w.settings.calibration);
  const { setSettings } = useWorkshop.getState();
  const save = (patch: Partial<CalibrationSettings>) =>
    setSettings({ calibration: { ...useWorkshop.getState().settings.calibration, ...patch } });
  /**
   * The plate's own numbers: the measuring field follows them as long as it is the plate's (a field that was
   * set by hand – a measured plate – stays what it was).
   */
  const savePlate = (
    patch: Partial<Pick<CalibrationSettings, 'dots' | 'pitch' | 'dotDiameter'>>,
  ) => {
    const now = useWorkshop.getState().settings.calibration;
    const next = { ...now, ...patch };
    const was = plateSpan(now.dots, now.pitch);
    const span = plateSpan(next.dots, next.pitch);
    // Only while that is a field the card takes (and the Pi would): 100 dots of 1000 mm are no place of a table
    const follows = span > 0 && span <= PLACE;
    save({
      ...patch,
      spanX: follows && now.spanX === was ? span : now.spanX,
      spanY: follows && now.spanY === was ? span : now.spanY,
    });
  };
  const cal = useCalibration();
  const idle = useMachine((m) => m.connection === 'connected' && m.status?.state === 'Idle');
  const connected = useMachine((m) => m.connection === 'connected');
  const homed = useMachine((m) => m.homed);
  const position = useMachine((m) => m.status?.mpos);
  const travel = useJob((j) => j.profile.travel);
  const softLimits = useJob((j) => j.profile.softLimits);
  const cameraOn = useCamera((c) => c.source !== null && c.size !== null);
  const live = useLiveMarker();
  const [applied, setApplied] = useState(false);
  const proposal = proposeCorrections(cal.first, cal.turned, s, cal.config);
  const busy = cal.task !== null;
  const ready = idle && cameraOn && !busy;
  const perMeter = (scale: number) => (scale - 1) * 1000;
  // Turned, the plate measures both axes again: the mean is the better value.
  const mean = (k: 'scaleX' | 'scaleY') =>
    cal.first ? (cal.turned ? (cal.first[k] + cal.turned[k]) / 2 : cal.first[k]) : 1;
  // The plate: which counts of points put every measuring point on a dot, and what is off about the field
  const offered = offeredPoints(s.spanX, s.spanY, s.pitch);
  const counts = offered.includes(s.points)
    ? offered
    : [...offered, s.points].sort((a, b) => a - b);
  const warnings = plateWarnings(s);
  const sizeOff = live !== null && dotSizeOff(live.diameter, s.dotDiameter);
  // The run starts at the corner with the smallest X and Y and drives the field towards +X and +Y
  const shortfall =
    // (not while a run is under way: then the machine stands wherever the run is, not at its start)
    connected && position && !busy
      ? gridShortfall(
          { x: position[0] ?? 0, y: position[1] ?? 0 },
          homed,
          { softLimits, travel },
          s.spanX,
          s.spanY,
        )
      : null;
  const spacing = (span: number) => formatPlain(span / (s.points - 1), 1);

  return (
    <Card className="gap-3 p-4" data-testid="calibration" data-find="calibration">
      <CardTitle render={<h2 />}>{t('calibration.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('calibration.intro')}</p>

      {!cameraOn ? (
        <Alert variant="warning" className="justify-items-start gap-y-2">
          <p>{t('calibration.cameraOff')}</p>
          <Button variant="outline" onClick={() => useJob.getState().setView('camera')}>
            {t('calibration.showCamera')}
          </Button>
        </Alert>
      ) : (
        <p className="text-muted-foreground text-sm tabular-nums" data-testid="calibration-live">
          {live
            ? t('calibration.seen', {
                d: formatNumber(live.diameter, 1),
                off: formatNumber(live.off, 2),
              })
            : t('calibration.notSeen')}
        </p>
      )}
      {sizeOff && live ? (
        <Alert variant="warning" data-testid="calibration-size">
          {t('calibration.sizeOff', {
            d: formatPlain(live.diameter, 1),
            nominal: formatPlain(s.dotDiameter, 2),
          })}
        </Alert>
      ) : null}
      {connected && !homed ? <Alert variant="warning">{t('calibration.notHomed')}</Alert> : null}

      <h3 className="font-medium text-muted-foreground text-sm">{t('calibration.plate')}</h3>
      <p className="text-muted-foreground text-sm">{t('calibration.plateHint')}</p>
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('calibration.plateKind')}
      >
        {([true, false] as const).map((precise) => (
          <SegmentedControlItem
            key={String(precise)}
            pressed={s.precise === precise}
            onClick={() => save({ precise })}
          >
            {t(precise ? 'calibration.precise' : 'calibration.print')}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {s.precise ? (
        <Alert variant="warning" data-testid="calibration-precise-hint">
          {t('calibration.preciseHint')}
        </Alert>
      ) : (
        <p className="text-muted-foreground text-sm" data-testid="calibration-print-hint">
          {t('calibration.printHint')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t('calibration.pitch')}
          max={PITCH_MAX}
          value={s.pitch}
          onChange={(pitch) => savePlate({ pitch })}
        />
        <NumberField
          label={t('calibration.dots')}
          max={DOTS_MAX}
          min={1}
          integer
          value={s.dots}
          onChange={(dots) => savePlate({ dots })}
        />
        <NumberField
          label={t('calibration.dotDiameter')}
          max={DOT_DIAMETER_MAX}
          value={s.dotDiameter}
          onChange={(dotDiameter) => savePlate({ dotDiameter })}
        />
        <NumberField
          label={t('calibration.spanX')}
          max={PLACE}
          value={s.spanX}
          onChange={(spanX) => save({ spanX })}
        />
        <NumberField
          label={t('calibration.spanY')}
          max={PLACE}
          value={s.spanY}
          onChange={(spanY) => save({ spanY })}
        />
        <NumberField
          label={t('calibration.settle')}
          max={SETTLE_MAX_MS}
          value={s.settleMs}
          onChange={(settleMs) => save({ settleMs })}
        />
      </div>
      <SegmentedControl role="group" aria-label={t('calibration.points')}>
        {counts.map((n) => (
          <SegmentedControlItem
            key={n}
            pressed={s.points === n}
            onClick={() => save({ points: n })}
          >
            {t('calibration.pointsN', { n })}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {warnings.length > 0 ? (
        <Alert variant="warning" className="gap-y-1" data-testid="calibration-plate-warning">
          {warnings.map((w) => (
            <p key={w}>
              {t(`calibration.warn.${w}`, {
                pitch: formatPlain(s.pitch, 2),
                n: s.points,
                sx: spacing(s.spanX),
                sy: spacing(s.spanY),
                k: formatPlain(s.spanX / (s.points - 1) / s.pitch, 0),
                plate: formatPlain(plateSpan(s.dots, s.pitch), 1),
              })}
            </p>
          ))}
        </Alert>
      ) : null}

      <h3 className="font-medium text-muted-foreground text-sm">{t('calibration.measure')}</h3>
      <p className="text-muted-foreground text-sm">
        {t('calibration.measureHint', {
          x: formatPlain(s.spanX, 1),
          y: formatPlain(s.spanY, 1),
        })}
      </p>
      {shortfall ? (
        <Alert variant="warning" data-testid="calibration-room">
          {t('calibration.roomShort', {
            axis: shortfall.axis.toUpperCase(),
            side: t(shortfall.side === 'max' ? 'calibration.sideMax' : 'calibration.sideMin'),
            short: formatPlain(shortfall.short, 1),
          })}
        </Alert>
      ) : null}
      {busy ? (
        <Alert
          variant="warning"
          className="justify-items-start gap-y-2"
          data-testid="calibration-progress"
        >
          <p>
            {cal.progress
              ? t('calibration.progress', { done: cal.progress.done, total: cal.progress.total })
              : t(`calibration.task.${cal.task!}`)}
          </p>
          <Button variant="outline" onClick={cal.cancel}>
            {t('calibration.cancel')}
          </Button>
        </Alert>
      ) : null}
      <div className="flex gap-3">
        <Button
          reason="machine"
          variant="outline"
          className="flex-1"
          disabled={!ready}
          onClick={() => void cal.centre()}
        >
          {t('calibration.centre')}
        </Button>
      </div>
      <HoldButton variant="accent" disabled={!ready} onConfirm={() => void cal.measureGrid(false)}>
        {t(cal.first ? 'calibration.measureAgain' : 'calibration.measureGrid')}
      </HoldButton>
      {cal.first ? (
        <>
          <p className="text-muted-foreground text-sm">{t('calibration.turnHint')}</p>
          <HoldButton disabled={!ready} onConfirm={() => void cal.measureGrid(true)}>
            {t('calibration.measureTurned')}
          </HoldButton>
        </>
      ) : null}
      <HoldButton disabled={!ready} onConfirm={() => void cal.measureBacklash()}>
        {t('calibration.measureBacklash')}
      </HoldButton>
      <HoldButton disabled={!ready} onConfirm={() => void cal.measureTilt()}>
        {t('calibration.measureTilt', { mm: formatNumber(s.zRise) })}
      </HoldButton>

      {cal.first || cal.backlash || cal.tilt ? (
        <>
          <h3 className="font-medium text-muted-foreground text-sm">{t('calibration.result')}</h3>
          <dl className="facts" data-testid="calibration-result">
            {cal.first ? (
              <>
                <dt>{t('calibration.scaleX')}</dt>
                <dd className="tabular-nums">
                  {s.precise
                    ? t('calibration.scaleValue', {
                        percent: signed((mean('scaleX') - 1) * 100, 3),
                        mm: signed(perMeter(mean('scaleX')), 2),
                      })
                    : t('calibration.scaleUntrusted')}
                </dd>
                <dt>{t('calibration.scaleY')}</dt>
                <dd className="tabular-nums">
                  {s.precise
                    ? t('calibration.scaleValue', {
                        percent: signed((mean('scaleY') - 1) * 100, 3),
                        mm: signed(perMeter(mean('scaleY')), 2),
                      })
                    : t('calibration.scaleUntrusted')}
                </dd>
                <dt>{t('calibration.angle')}</dt>
                <dd className="tabular-nums">
                  {proposal.squareness === null
                    ? t('calibration.angleNeedsTurn')
                    : t('calibration.angleValue', {
                        angle: formatNumber(90 - proposal.squareness, 3),
                        mm: signed(Math.tan((proposal.squareness * Math.PI) / 180) * 1000, 2),
                      })}
                </dd>
                <dt>{t('calibration.fit')}</dt>
                <dd className="tabular-nums">
                  {t('calibration.fitValue', {
                    rms: formatNumber(cal.first.rms, 3),
                    max: formatNumber(cal.first.max, 3),
                    angle: formatNumber(cal.first.plateAngle, 2),
                  })}
                </dd>
              </>
            ) : null}
            {cal.backlash ? (
              <>
                <dt>{t('calibration.backlash')}</dt>
                <dd className="tabular-nums">
                  X {formatNumber(cal.backlash.x, 3)} mm · Y {formatNumber(cal.backlash.y, 3)} mm
                </dd>
              </>
            ) : null}
            {cal.tilt ? (
              <>
                <dt>{t('calibration.tilt')}</dt>
                <dd className="tabular-nums">
                  {t('calibration.tiltValue', {
                    x: signed(cal.tilt.x, 3),
                    y: signed(cal.tilt.y, 3),
                    mm: formatNumber(cal.tilt.per100, 2),
                  })}
                </dd>
              </>
            ) : null}
          </dl>
          {cal.tilt && cal.tilt.per100 > 0.1 ? (
            <Alert variant="warning">{t('calibration.tiltHint')}</Alert>
          ) : null}
        </>
      ) : null}

      {cal.first ? (
        <CorrectionPanel
          first={cal.first}
          turned={cal.turned}
          precise={s.precise}
          onApplied={() => setApplied(true)}
        />
      ) : null}
      {applied ? <Alert variant="success">{t('calibration.afterApply')}</Alert> : null}
    </Card>
  );
}
