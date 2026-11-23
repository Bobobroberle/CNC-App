import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { estimateScan, type Rect } from '../lib/photomap';
import { crosshairPoint, focusError } from '../store/camera';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { mapBlocker, minutes, scanPoints, usePhotoMap } from '../store/photomap';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Progress } from '../ui/progress';

/** Margin around the job for the default scan area, mm */
const MARGIN = 10;
/** Pause per picture besides the settle time: stream lag and drawing, ms */
const PER_PICTURE_MS = 400;

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
  const { scanArea, cancelScan, clear } = usePhotoMap.getState();
  const connected = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const wco = useMachine((s) => s.status?.wco);
  const settle = useWorkshop((s) => s.settings.calibration.settleMs);
  useWorkshop((s) => s.settings.camera);
  const jogFeed = useJob((s) => s.profile.jogFeed.xy);
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
  const feed = Math.min(2000, jogFeed);
  const estimate = points
    ? estimateScan(points, crosshairPoint(), feed, settle + PER_PICTURE_MS)
    : null;
  const canScan = idle && !scan && points !== null && (blocker === null || blocker === 'offHeight');

  // What is being typed, until it is a number again ("12," or "-" on the way to a value).
  const [typing, setTyping] = useState<Partial<Record<keyof Rect, string>>>({});
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
      {points && estimate !== null && !scan ? (
        <p className="text-muted-foreground text-sm tabular-nums" data-testid="scan-estimate">
          {t('photomap.estimate', { count: points.length, minutes: minutes(estimate) })}
        </p>
      ) : null}
      {!connected ? (
        <p className="text-muted-foreground text-sm">{t('photomap.notConnected')}</p>
      ) : null}
      {scan ? (
        <>
          <p className="tabular-nums" data-testid="scan-progress">
            {t('photomap.scanning', {
              done: scan.done,
              total: scan.total,
              minutes: minutes(
                scan.done > 0
                  ? ((Date.now() - scan.startedAt) / 1000 / scan.done) * (scan.total - scan.done)
                  : (estimate ?? 0),
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
