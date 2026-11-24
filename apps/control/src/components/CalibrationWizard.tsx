import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { PLACE, SETTLE_MAX_MS } from '../lib/stateSync';
import { proposeCorrections, useCalibration } from '../store/calibration';
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

const POINTS = [2, 3, 4, 5] as const;

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
  const cal = useCalibration();
  const idle = useMachine((m) => m.connection === 'connected' && m.status?.state === 'Idle');
  const connected = useMachine((m) => m.connection === 'connected');
  const homed = useMachine((m) => m.homed);
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
      <div className="grid grid-cols-2 gap-2">
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
        {POINTS.map((n) => (
          <SegmentedControlItem
            key={n}
            pressed={s.points === n}
            onClick={() => save({ points: n })}
          >
            {t('calibration.pointsN', { n })}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>

      <h3 className="font-medium text-muted-foreground text-sm">{t('calibration.measure')}</h3>
      <p className="text-muted-foreground text-sm">{t('calibration.measureHint')}</p>
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
