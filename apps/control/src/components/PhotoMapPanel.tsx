import { useState } from 'react';
import { t, tDynamic } from '../i18n';
import { clockChoiceText, clockLostText, stampSourceText } from '../lib/clockText';
import { streamIsPis, type Takeover } from '../lib/cameraControls';
import { formatNumber, parseNumber } from '../lib/format';
import type { Rect } from '../lib/photomap';
import { MIN_LAG_SPEED, blurAtSpeed, maxSpeedForBlur } from '../lib/strips';
import { crosshairPoint, focusError, useCamera } from '../store/camera';
import { CameraFailureError, useCameraControls } from '../store/cameraControls';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import {
  mapBlocker,
  minutes,
  scanEstimate,
  scanPoints,
  stripSpeed,
  tempoSpeed,
  usePhotoMap,
  type ScanMode,
  type ScanTempo,
} from '../store/photomap';
import { useScanTrace } from '../store/scanTrace';
import { useWorkshop } from '../store/workshop';
import { AckMark, useAck } from './Ack';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/** Margin around the job for the default scan area, mm */
const MARGIN = 10;
const MODES: ScanMode[] = ['strips', 'stops'];
const TEMPOS: ScanTempo[] = ['gentle', 'normal', 'fast'];

/** The job's cut area plus a margin, in work coordinates; null without a job. */
function jobArea(): Rect | null {
  const b = useJob.getState().analysis?.cutBounds;
  if (!b || b.min.x > b.max.x) return null;
  return {
    minX: b.min.x - MARGIN,
    minY: b.min.y - MARGIN,
    maxX: b.max.x + MARGIN,
    maxY: b.max.y + MARGIN,
  };
}

/** Something sensible without a job: 100 mm along X around the crosshair. */
function defaultArea(): Rect {
  const job = jobArea();
  if (job) return job;
  const cross = crosshairPoint();
  const wco = useMachine.getState().status?.wco ?? [0, 0];
  const x = cross ? cross.x - (wco[0] ?? 0) : 0;
  const y = cross ? cross.y - (wco[1] ?? 0) : 0;
  return { minX: x - 50, minY: y, maxX: x + 50, maxY: y };
}

const round = (v: number) => Math.round(v * 10) / 10;

/** The photo map under Fahren → Kamera: how many pictures lie on the table, clear, scan an area. */
export function PhotoMapPanel() {
  const tiles = usePhotoMap((s) => s.tiles);
  const scan = usePhotoMap((s) => s.scan);
  const mode = usePhotoMap((s) => s.mode);
  const tempo = usePhotoMap((s) => s.tempo);
  const stripsBad = usePhotoMap((s) => s.stripsBad);
  const exposureMs = usePhotoMap((s) => s.exposureMs);
  const lastClock = usePhotoMap((s) => s.lastClock);
  // what the last scan by stops applied as its pause: the estimate counts it
  usePhotoMap((s) => s.restMs);
  const trace = useScanTrace();
  const { scanArea, cancelScan, clear, setMode, setTempo, setExposure } = usePhotoMap.getState();
  const connected = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const wco = useMachine((s) => s.status?.wco);
  useWorkshop((s) => s.settings.calibration.settleMs);
  useWorkshop((s) => s.settings.camera);
  useJob((s) => s.profile.jogFeed.xy);
  useJob((s) => s.analysis);
  useMachine((s) => s.status?.wpos[2]);
  const [area, setArea] = useState<Rect>(() => {
    const a = defaultArea();
    return { minX: round(a.minX), minY: round(a.minY), maxX: round(a.maxX), maxY: round(a.maxY) };
  });
  const blocker = mapBlocker();

  const machineArea: Rect | null = wco
    ? {
        minX: area.minX + (wco[0] ?? 0),
        minY: area.minY + (wco[1] ?? 0),
        maxX: area.maxX + (wco[0] ?? 0),
        maxY: area.maxY + (wco[1] ?? 0),
      }
    : null;
  const points = machineArea ? scanPoints(machineArea) : null;
  // Both ways by the same rules, so the one can be compared with the other
  const estimate = machineArea ? scanEstimate(machineArea, tempo) : null;
  // The speed of a run: where the exposure holds it below what the lag can be measured at, the scan goes by stops
  // (`scanArea`, the same test) – and then the by-stops estimate is the headline, not strips that will not be run.
  const speed = stripSpeed(tempo);
  const onTheMove =
    mode === 'strips' && !stripsBad && speed >= MIN_LAG_SPEED && estimate?.strips != null;
  const canScan = idle && !scan && points !== null && (blocker === null || blocker === 'offHeight');

  // What is being typed, until it is a number again ("12," or "-" on the way to a value).
  const [typing, setTyping] = useState<Partial<Record<keyof Rect, string>>>({});
  const [typingExposure, setTypingExposure] = useState<string | null>(null);
  // Taking the exposure over from the camera: only where the companion can read it, only on this tap
  const piCamera = useWorkshop(
    (s) => s.companionOnline === true && s.companionHealth?.cameraControls === true,
  );
  const companionUrl = useWorkshop((s) => s.settings.companionUrl);
  const streamUrl = useWorkshop((s) => s.settings.camera.streamUrl);
  const source = useCamera((s) => s.source);
  const taking = useAck();
  const [taken, setTaken] = useState<{
    kind: Takeover['kind'] | 'not-pi' | 'failed';
    text: string;
  } | null>(null);
  const takeFromCamera = () =>
    taking.run(async () => {
      setTaken(null);
      // The companion sets the camera it streams: any other picture has an exposure it does not know
      if (source !== 'stream' || !streamIsPis(streamUrl, companionUrl)) {
        setTaken({ kind: 'not-pi', text: t('photomap.takeOver.notPi') });
        return false;
      }
      try {
        const result = await useCameraControls.getState().takeOver();
        if (result.kind === 'ms') {
          setExposure(result.ms);
          setTypingExposure(null);
          const now = usePhotoMap.getState().exposureMs;
          setTaken({
            kind: 'ms',
            text: t('photomap.takeOver.done', { ms: formatNumber(now, now % 1 === 0 ? 0 : 1) }),
          });
          return true;
        }
        setTaken({ kind: result.kind, text: t(`photomap.takeOver.${result.kind}`) });
        return false;
      } catch (error) {
        const why = tDynamic(
          `cameraControls.errors.${error instanceof CameraFailureError ? error.failure : 'failed'}`,
          'cameraControls.errors.failed',
        );
        setTaken({ kind: 'failed', text: t('photomap.takeOver.failed', { why }) });
        return false;
      }
    });
  // The exposure holds the run back where the blur it allows is below what the tempo asks for
  const capped = exposureMs > 0 && maxSpeedForBlur(exposureMs) < tempoSpeed(tempo);
  const field = (key: keyof Rect, label: Parameters<typeof t>[0]) => (
    <Field>
      <FieldLabel>{t(label)}</FieldLabel>
      <Input
        type="text"
        inputMode="decimal"
        value={typing[key] ?? String(area[key])}
        onChange={(e) => {
          const text = e.target.value;
          setTyping({ ...typing, [key]: text });
          const v = parseNumber(text);
          if (text.trim() !== '' && Number.isFinite(v)) setArea({ ...area, [key]: v });
        }}
        onBlur={() => setTyping({})}
      />
    </Field>
  );

  return (
    <div className="photo-map-panel" data-testid="photo-map-panel">
      <p className="text-muted-foreground text-sm">{t('photomap.hint')}</p>
      <div className="flex gap-3 justify-between">
        <p className="tabular-nums">
          {tiles > 0 ? t('photomap.tiles', { count: tiles }) : t('photomap.empty')}
        </p>
        <Button reason="missing" variant="outline" disabled={tiles === 0} onClick={clear}>
          {t('photomap.clear')}
        </Button>
      </div>
      {blocker ? (
        <Alert variant="warning" data-testid="photo-map-notice">
          {blocker === 'offHeight'
            ? t('photomap.offHeight', { mm: formatNumber(focusError() ?? 0, 1) })
            : t(`photomap.${blocker}`)}
        </Alert>
      ) : null}

      <p className="text-muted-foreground text-sm">{t('photomap.scanHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {field('minX', 'photomap.fromX')}
        {field('maxX', 'photomap.toX')}
        {field('minY', 'photomap.fromY')}
        {field('maxY', 'photomap.toY')}
      </div>
      <Button
        reason="missing"
        variant="outline"
        disabled={jobArea() === null}
        onClick={() => {
          const a = jobArea();
          if (a)
            setArea({
              minX: round(a.minX),
              minY: round(a.minY),
              maxX: round(a.maxX),
              maxY: round(a.maxY),
            });
        }}
      >
        {t('photomap.areaFromJob')}
      </Button>
      <Field>
        <FieldLabel>{t('photomap.mode')}</FieldLabel>
        <SegmentedControl role="group" aria-label={t('photomap.mode')}>
          {MODES.map((m) => (
            <SegmentedControlItem key={m} pressed={mode === m} onClick={() => setMode(m)}>
              {t(`photomap.modes.${m}`)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <p className="text-muted-foreground text-sm">{t('photomap.modeHint')}</p>
      </Field>
      {mode === 'strips' && stripsBad ? (
        <Alert variant="warning" data-testid="strips-bad">
          {t('photomap.stripsSkipped')}
        </Alert>
      ) : null}
      {mode === 'strips' ? (
        <Field>
          <FieldLabel>{t('photomap.tempo')}</FieldLabel>
          <SegmentedControl role="group" aria-label={t('photomap.tempo')}>
            {TEMPOS.map((v) => (
              <SegmentedControlItem key={v} pressed={tempo === v} onClick={() => setTempo(v)}>
                {t(`photomap.tempos.${v}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <p className="text-muted-foreground text-sm">{t('photomap.tempoHint')}</p>
        </Field>
      ) : null}
      {mode === 'strips' ? (
        <Field>
          <FieldLabel>{t('photomap.exposure')}</FieldLabel>
          <Input
            type="text"
            inputMode="decimal"
            data-testid="exposure-field"
            value={typingExposure ?? String(exposureMs)}
            onChange={(e) => {
              const text = e.target.value;
              setTypingExposure(text);
              const v = parseNumber(text);
              if (text.trim() !== '' && Number.isFinite(v)) setExposure(v);
            }}
            onBlur={() => setTypingExposure(null)}
          />
          <p className="text-muted-foreground text-sm">{t('photomap.exposureHint')}</p>
          {piCamera ? (
            <>
              <Button
                variant="outline"
                data-testid="exposure-take"
                disabled={taking.state === 'busy'}
                onClick={() => void takeFromCamera()}
              >
                {t('photomap.takeOver.button')}
                <AckMark state={taking.state} />
              </Button>
              <p className="text-muted-foreground text-sm">{t('photomap.takeOver.hint')}</p>
              {taken ? (
                <p
                  className="text-sm"
                  role="status"
                  data-testid="exposure-take-line"
                  data-kind={taken.kind}
                >
                  {taken.text}
                </p>
              ) : null}
            </>
          ) : null}
          {exposureMs > 0 ? (
            <p className="text-sm tabular-nums" data-testid="blur-line">
              {t('photomap.blur', { mm: formatNumber(blurAtSpeed(exposureMs, speed), 2) })}
            </p>
          ) : null}
          {capped ? (
            <p className="text-muted-foreground text-sm tabular-nums" data-testid="speed-capped">
              {speed < MIN_LAG_SPEED
                ? t('photomap.tooSlow', { speed: formatNumber(MIN_LAG_SPEED, 0) })
                : t('photomap.capped', { speed: formatNumber(speed, 0) })}
            </p>
          ) : null}
        </Field>
      ) : null}
      {estimate && !scan ? (
        <div className="text-muted-foreground text-sm tabular-nums">
          {onTheMove && estimate.strips ? (
            <>
              <p data-testid="scan-estimate">
                {t('photomap.estimateStrips', {
                  count: estimate.strips.count,
                  minutes: minutes(estimate.strips.seconds),
                })}
              </p>
              {estimate.stops ? (
                <p data-testid="scan-estimate-compare">
                  {t('photomap.estimateCompare', {
                    count: estimate.stops.count,
                    minutes: minutes(estimate.stops.seconds),
                  })}
                </p>
              ) : null}
            </>
          ) : estimate.stops ? (
            <p data-testid="scan-estimate">
              {t('photomap.estimate', {
                count: estimate.stops.count,
                minutes: minutes(estimate.stops.seconds),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      {lastClock && !scan ? (
        <div
          className="text-muted-foreground text-sm"
          data-testid="scan-clock"
          data-clock={lastClock.clock}
        >
          <p className="text-foreground font-medium">{t('photomap.clock.title')}</p>
          <p data-testid="scan-clock-line">
            {lastClock.clock === 'pi' && lastClock.stamp ? (
              <>
                {t('photomap.clock.pi', {
                  domain: t(`photomap.clock.domains.${lastClock.stamp.domain}`),
                  source: stampSourceText(lastClock.stamp.source),
                })}{' '}
                <span className="font-mono" data-testid="scan-clock-header">
                  {lastClock.stamp.source}
                </span>
              </>
            ) : (
              t('photomap.clock.browser')
            )}
          </p>
          {lastClock.clockReason ? (
            <p data-testid="scan-clock-why" data-reason={lastClock.clockReason}>
              {t('photomap.clock.why', {
                why: clockChoiceText(lastClock.clockReason, lastClock.clockDetail),
              })}
              {lastClock.clockDetail ? (
                <>
                  {' '}
                  <span className="font-mono" data-testid="scan-clock-code">
                    {t('photomap.clock.code', { code: lastClock.clockDetail })}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
          {lastClock.clockLost ? (
            <p data-testid="scan-clock-lost" data-reason={lastClock.clockLost}>
              {t('photomap.clock.lost', { why: clockLostText(lastClock.clockLost) })}
            </p>
          ) : null}
          {lastClock.timingNoiseMs !== null ? (
            <p className="tabular-nums" data-testid="scan-clock-noise">
              {t('photomap.clock.noise', { ms: formatNumber(lastClock.timingNoiseMs, 0) })}
            </p>
          ) : null}
        </div>
      ) : null}
      {!connected ? (
        <p className="text-muted-foreground text-sm">{t('photomap.notConnected')}</p>
      ) : null}
      <Field>
        <Label className="min-h-target gap-3 font-normal">
          <Checkbox
            checked={trace.recording}
            data-testid="trace-toggle"
            disabled={scan !== null}
            onCheckedChange={(on) => trace.setRecording(!!on)}
          />
          {t('photomap.trace.label')}
        </Label>
        <p className="text-muted-foreground text-sm">{t('photomap.trace.hint')}</p>
        {trace.scans > 0 ? (
          <div className="flex flex-col gap-2" data-testid="trace-info">
            <p className="text-sm tabular-nums">
              {trace.pending > 0
                ? t('photomap.trace.packing', { count: trace.pending })
                : t('photomap.trace.have', {
                    count: trace.scans,
                    mb: formatNumber(trace.bytes / 1e6, 1),
                  })}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={scan !== null || trace.pending > 0}
                reason="missing"
                onClick={() => void trace.save()}
              >
                {t('photomap.trace.save')}
              </Button>
              <Button
                variant="outline"
                disabled={scan !== null}
                reason="missing"
                onClick={trace.discard}
              >
                {t('photomap.trace.discard')}
              </Button>
            </div>
          </div>
        ) : null}
      </Field>
      {scan ? (
        <>
          <p className="tabular-nums" data-testid="scan-progress">
            {t(scan.unit === 'strips' ? 'photomap.scanningStrips' : 'photomap.scanning', {
              done: scan.done,
              total: scan.total,
              minutes: minutes(
                scan.done > 0
                  ? ((Date.now() - scan.startedAt) / 1000 / scan.done) * (scan.total - scan.done)
                  : ((scan.unit === 'strips'
                      ? estimate?.strips?.seconds
                      : estimate?.stops?.seconds) ?? 0),
              ),
            })}
          </p>
          <Progress max={scan.total} value={scan.done} />
          <Button variant="outline" onClick={cancelScan}>
            {t('photomap.cancel')}
          </Button>
        </>
      ) : (
        <HoldButton
          variant="accent"
          disabled={!canScan}
          onConfirm={() => machineArea && void scanArea(machineArea)}
        >
          {t('photomap.scan')}
        </HoldButton>
      )}
    </div>
  );
}
