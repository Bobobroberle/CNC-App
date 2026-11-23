import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { estimateScan, type Rect } from '../lib/photomap';
import { motifAngle, replaceableText, type SeriesEntry } from '../lib/series';
import { isSimulatorAddress, simulator, simulatorBlanksArea } from '../sim';
import { useCam } from '../store/cam';
import { crosshairPoint, useCamera } from '../store/camera';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { cameraCalibrated, minutes, scanPoints, usePhotoMap } from '../store/photomap';
import { seriesMotif, useSeries, useSeriesPlan, type SeriesMode } from '../store/series';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { mm, NumberField } from './camParts';
import { HoldButton } from './HoldButton';
import { Icon } from './Icon';
import { Notice } from './Notice';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Label } from '../ui/label';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Textarea } from '../ui/textarea';
import { Fold } from './Fold';
import { Progress } from '../ui/progress';

const MODES: SeriesMode[] = ['same', 'names', 'numbers'];
/** Pause per picture besides the settle time: stream lag and drawing, ms */
const PER_PICTURE_MS = 400;
/** What measuring one blank takes besides the settle time: two short moves and two pictures, s */
const PER_BLANK_S = 3;

/** "1 Rohling" / "5 Rohlinge" */
const blanksText = (count: number) => (count === 1 ? t('series.one') : t('series.many', { count }));

/** Numbers of blanks as they stand on the picture: "2, 5" */
const numbers = (entries: readonly SeriesEntry[]) => entries.map((e) => e.n ?? '–').join(', ');

const round = (v: number) => Math.round(v);

/**
 * The area to scan when nothing says otherwise, in work coordinates: what
 * the pictures on the table cover; on the simulator's series scene its
 * blanks; else a strip of 300 mm along X from where the camera looks.
 */
function defaultArea(): Rect {
  const { status, url } = useMachine.getState();
  const [ox = 0, oy = 0] = status?.wco ?? [];
  const work = (r: Rect): Rect => ({
    minX: round(r.minX - ox),
    minY: round(r.minY - oy),
    maxX: round(r.maxX - ox),
    maxY: round(r.maxY - oy),
  });
  if (isSimulatorAddress(url) && simulator().scene === 'blanks') return work(simulatorBlanksArea());
  const extent = usePhotoMap.getState().extent;
  if (extent) return work(extent);
  const cross = crosshairPoint() ?? { x: ox, y: oy };
  return work({ minX: cross.x, minY: cross.y, maxX: cross.x + 300, maxY: cross.y });
}

/** What a blank is, in a few words: its size and how it is turned. */
function describe(entry: SeriesEntry): string {
  const { blank } = entry;
  const whole = (v: number) => formatNumber(v, 0);
  const size = { l: whole(blank.length), w: whole(blank.width), d: whole(blank.length) };
  if (blank.kind === 'round') return t('series.row.round', size);
  if (blank.angle === null) return t('series.row.other', size);
  return t(blank.kind === 'square' ? 'series.row.square' : 'series.row.rect', {
    ...size,
    angle: formatNumber(blank.angle, 0),
  });
}

/** Step 1: a picture of the table, and the blanks on it. */
function FindStep() {
  const series = useSeries.getState();
  const searched = useSeries((s) => s.searched);
  const refused = useSeries((s) => s.refused);
  const busy = useSeries((s) => s.busy);
  const tiles = usePhotoMap((s) => s.tiles);
  const scan = usePhotoMap((s) => s.scan);
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const wco = useMachine((s) => s.status?.wco);
  const camera = useWorkshop((s) => s.settings.camera);
  const cameraOn = useCamera((s) => s.source !== null && s.size !== null);
  const settle = useWorkshop((s) => s.settings.calibration.settleMs);
  const jogFeed = useJob((s) => s.profile.jogFeed.xy);
  const [area, setArea] = useState<Rect>(defaultArea);
  const calibrated = cameraCalibrated(camera);

  const [ox = 0, oy = 0] = wco ?? [];
  const machineArea: Rect = {
    minX: area.minX + ox,
    minY: area.minY + oy,
    maxX: area.maxX + ox,
    maxY: area.maxY + oy,
  };
  const points = cameraOn && calibrated ? scanPoints(machineArea) : null;
  const estimate = points
    ? estimateScan(points, crosshairPoint(), Math.min(2000, jogFeed), settle + PER_PICTURE_MS)
    : null;
  const field = (key: keyof Rect, label: Parameters<typeof t>[0]) => (
    <NumberField
      label={label}
      value={area[key]}
      min={-Infinity}
      onChange={(v) => v !== undefined && setArea({ ...area, [key]: v })}
    />
  );

  return (
    <>
      <p className="text-muted-foreground text-sm">{t('series.find.how')}</p>
      {!calibrated ? (
        <Notice
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => useUi.getState().openSetup('camera')}
            >
              {t('series.find.toCamera')}
            </Button>
          }
        >
          {t('series.find.cameraNeeded')}
        </Notice>
      ) : !cameraOn ? (
        <Notice
          action={
            <Button variant="outline" size="sm" onClick={() => useCamera.getState().switchOn()}>
              {t('stage.cameraOn')}
            </Button>
          }
        >
          {t('stage.cameraOff')}
        </Notice>
      ) : null}

      {tiles > 0 ? (
        <>
          <p className="text-muted-foreground text-sm">
            {t('series.find.pictures', { count: tiles })}
          </p>
          <Button reason="machine" disabled={busy !== null} onClick={() => series.find()}>
            {t('series.find.onPicture')}
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t('series.find.noPictures')}</p>
      )}

      {scan ? (
        <>
          <p className="tabular-nums" data-testid="series-scan">
            {t('series.find.scanning', { done: scan.done, total: scan.total })}
          </p>
          <Progress max={scan.total} value={scan.done} />
          <Button variant="outline" onClick={series.cancel}>
            {t('series.find.cancel')}
          </Button>
        </>
      ) : (
        <>
          <HoldButton
            variant={tiles > 0 ? 'default' : 'accent'}
            disabled={!idle || busy !== null || points === null}
            onConfirm={() => void series.scan(machineArea)}
          >
            {t(tiles > 0 ? 'series.find.rescan' : 'series.find.scan')}
          </HoldButton>
          {points && estimate !== null ? (
            <p className="text-muted-foreground text-sm tabular-nums" data-testid="series-estimate">
              {t('series.find.estimate', { count: points.length, minutes: minutes(estimate) })}
            </p>
          ) : null}
          <Fold title={t('series.find.area')}>
            <div className="contents">
              <p className="text-muted-foreground text-sm">{t('series.find.areaHint')}</p>
              <div className="grid grid-cols-2 gap-2">
                {field('minX', 'photomap.fromX')}
                {field('maxX', 'photomap.toX')}
                {field('minY', 'photomap.fromY')}
                {field('maxY', 'photomap.toY')}
              </div>
            </div>
          </Fold>
        </>
      )}

      {searched === 'none' || searched === 'flat' || searched === 'noMap' ? (
        <Alert variant="warning" data-testid="series-none">
          {t(`series.find.${searched}`)}
        </Alert>
      ) : null}
      {refused.length > 0 ? <Refused /> : null}
    </>
  );
}

/** What looked like a blank and was not taken, each reason once, with what to do about it. */
function Refused() {
  const refused = useSeries((s) => s.refused);
  const reasons = [...new Set(refused.map((r) => r.reason))];
  return (
    <div data-testid="series-refused">
      <p className="text-muted-foreground text-sm">{t('series.refused.title')}</p>
      <ul className="diagnostics">
        {reasons.map((reason) => (
          <li key={reason} className="warning">
            {t(`series.refused.${reason}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One blank of the list: its number, what it is, whether it is engraved, and the turn. */
function BlankRow({ entry }: { entry: SeriesEntry }) {
  const series = useSeries.getState();
  const turns = useSeries((s) => s.turns[entry.blank.id] ?? 0);
  const { blank, state } = entry;
  const label = entry.n ?? '–';
  const notes = [
    state === 'excluded' ? t('series.row.out') : null,
    state === 'unnamed' ? t('series.row.unnamed') : null,
    !entry.fits ? t('series.row.misfit') : null,
    blank.measured ? t('series.row.measured') : null,
  ].filter((n) => n !== null);
  return (
    <li
      className={`series-row${state === 'cut' ? '' : ' out'}${entry.fits ? '' : ' misfit'}`}
      data-testid={`series-blank-${blank.id}`}
      data-state={state}
      data-angle={motifAngle(blank, turns).toFixed(1)}
    >
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={state !== 'excluded'}
          aria-label={t('series.row.include', { n: label })}
          onCheckedChange={() => series.toggle(blank.id)}
        />
        <span className="series-n" aria-hidden="true">
          {label}
        </span>
      </Label>
      <span className="series-what">
        {entry.words !== undefined ? <strong>{entry.words}</strong> : null}
        <span className="text-muted-foreground text-sm">{describe(entry)}</span>
        {notes.length > 0 ? <span className="series-note">{notes.join(' · ')}</span> : null}
      </span>
      <Button
        reason="missing"
        variant="outline"
        size="sm"
        disabled={state !== 'cut'}
        aria-label={t('series.row.turnLabel', { n: label })}
        onClick={() => series.turn(blank.id)}
      >
        {t('series.row.turn')}
      </Button>
    </li>
  );
}

/** Step 2: the motif on every blank – which are engraved, what stands on each, how exactly. */
function CheckStep() {
  const series = useSeries.getState();
  const plan = useSeriesPlan();
  const refused = useSeries((s) => s.refused);
  const mode = useSeries((s) => s.mode);
  const names = useSeries((s) => s.names);
  const firstNumber = useSeries((s) => s.firstNumber);
  const busy = useSeries((s) => s.busy);
  const progress = useSeries((s) => s.progress);
  const tooLarge = useSeries((s) => s.tooLarge);
  const unseen = useSeries((s) => s.unseen);
  const project = useCam((s) => s.project);
  const safeZ = useCam((s) => s.settings.safeZ);
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const cameraOn = useCamera((s) => s.source !== null && s.size !== null);
  const running = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const connected = useMachine((s) => s.connection === 'connected' && s.status !== null);
  const settle = useWorkshop((s) => s.settings.calibration.settleMs);
  if (!plan || !project) return null;

  const { entries } = plan;
  const cut = entries.filter((e) => e.state === 'cut');
  const unnamed = entries.filter((e) => e.state === 'unnamed');
  const misfit = cut.filter((e) => !e.fits);
  const missing = [...new Set(cut.flatMap((e) => e.missing))];
  const measured = cut.filter((e) => e.blank.measured).length;
  const placeholder = replaceableText(seriesMotif());
  const words = project.items.find((i) => i.textStyle && i.kind !== 'none')?.text ?? '';
  const quarter = entries.some((e) => e.blank.kind !== 'rect' || e.blank.angle === null);
  const listed = (ids: readonly number[]) =>
    numbers(entries.filter((e) => ids.includes(e.blank.id)));

  return (
    <>
      <div className="flex gap-3 justify-between">
        <p data-testid="series-found">
          <strong>{t('series.found', { blanks: blanksText(entries.length) })}</strong>
        </p>
        <Button
          reason="machine"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={series.again}
        >
          {t('series.find.again')}
        </Button>
      </div>
      {refused.length > 0 ? <Refused /> : null}
      <p className="text-muted-foreground text-sm">{t('series.tapHint')}</p>

      <ul className="series-list" aria-label={t('series.list')} data-testid="series-list">
        {entries.map((entry) => (
          <BlankRow key={entry.blank.id} entry={entry} />
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        {t('series.turnHint')} {quarter ? t('series.turnHintQuarter') : ''}
      </p>

      <h3 className="font-medium text-muted-foreground text-sm">{t('series.what')}</h3>
      {placeholder ? (
        <>
          <SegmentedControl
            className="w-full flex-wrap *:flex-auto"
            role="group"
            aria-label={t('series.what')}
          >
            {MODES.map((m) => (
              <SegmentedControlItem
                key={m}
                pressed={mode === m}
                onClick={() => series.setText({ mode: m })}
              >
                {t(`series.modes.${m}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          {mode === 'names' ? (
            <Field>
              <FieldLabel>{t('series.names')}</FieldLabel>
              <Textarea
                rows={Math.min(12, Math.max(3, entries.length))}
                value={names}
                placeholder={t('series.namesPlaceholder')}
                data-testid="series-names"
                onChange={(e) => series.setText({ names: e.target.value })}
              />
            </Field>
          ) : null}
          {mode === 'numbers' ? (
            <NumberField
              label="series.firstNumber"
              value={firstNumber}
              onChange={(v) => v !== undefined && series.setText({ firstNumber: Math.round(v) })}
            />
          ) : null}
          {mode !== 'same' ? (
            <p className="text-muted-foreground text-sm">
              {t('series.replaces', { text: words.split('\n')[0]! })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t('series.needsText')}</p>
      )}

      {misfit.length + unnamed.length + plan.spare + missing.length > 0 ? (
        <ul className="diagnostics" data-testid="series-notes">
          {misfit.length > 0 ? (
            <li className="warning">{t('series.misfit', { list: numbers(misfit) })}</li>
          ) : null}
          {unnamed.length > 0 ? (
            <li className="warning">
              {t('series.unnamed', { blanks: blanksText(unnamed.length) })}
            </li>
          ) : null}
          {plan.spare > 0 ? (
            <li className="warning">{t('series.spare', { count: plan.spare })}</li>
          ) : null}
          {missing.length > 0 ? (
            <li className="warning">{t('series.missing', { list: missing.join(' ') })}</li>
          ) : null}
        </ul>
      ) : null}

      <h3 className="font-medium text-muted-foreground text-sm">{t('series.accuracy.title')}</h3>
      <p className="text-muted-foreground text-sm" data-testid="series-accuracy">
        {measured > 0
          ? t('series.accuracy.measured', { count: measured, total: cut.length })
          : t('series.accuracy.map')}
      </p>
      {tooLarge.length > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t('series.accuracy.tooLarge', { list: listed(tooLarge) })}
        </p>
      ) : null}
      {unseen.length > 0 ? (
        <Alert variant="warning">{t('series.accuracy.unseen', { list: listed(unseen) })}</Alert>
      ) : null}
      {busy === 'measure' ? (
        <>
          <p className="tabular-nums" data-testid="series-measuring">
            {t('series.accuracy.measuring', {
              done: Math.min((progress?.done ?? 0) + 1, progress?.total ?? 1),
              total: progress?.total ?? 1,
            })}
          </p>
          <Progress max={progress?.total ?? 1} value={progress?.done ?? 0} />
          <Button variant="outline" onClick={series.cancel}>
            {t('series.find.cancel')}
          </Button>
        </>
      ) : (
        <>
          <HoldButton
            disabled={!idle || !cameraOn || busy !== null || cut.length === 0}
            onConfirm={() => void series.measure()}
          >
            {t('series.accuracy.measure')}
          </HoldButton>
          <p className="text-muted-foreground text-sm">
            {cameraOn
              ? t('series.accuracy.measureHint', {
                  seconds: formatNumber(PER_BLANK_S + (2 * settle) / 1000, 0),
                })
              : t('series.accuracy.cameraOff')}
          </p>
        </>
      )}

      <p className="text-muted-foreground text-sm">{t('series.zero', { mm: mm(safeZ) })}</p>
      {!connected ? <Alert variant="warning">{t('series.offline')}</Alert> : null}
      <Button
        reason="machine"
        disabled={cut.length === 0 || busy !== null || running || !connected}
        data-testid="series-make"
        onClick={() => {
          // With the series made, the next step is the job itself.
          if (!series.handOver()) return;
          useMachine
            .getState()
            .addLog(
              'info',
              t('series.made', { name: project.name, blanks: blanksText(cut.length) }),
            );
          useUi.getState().go('job', 'prepare');
        }}
      >
        {cut.length > 0
          ? t('series.make', { blanks: blanksText(cut.length) })
          : t('series.nothing')}
      </Button>
    </>
  );
}

/**
 * A series on scattered blanks, as a short guided flow in the drawing
 * workspace: find the blanks on the table picture, look at the motif on
 * every one of them (leave some out, turn some, give each its name), and
 * hand one program to the Job room. It takes the place of the drawing's
 * cards while it is open.
 */
export function SeriesCard() {
  const project = useCam((s) => s.project);
  const found = useSeries((s) => s.blanks.length > 0);
  const series = useSeries.getState();
  if (!project) return null;
  const steps = [
    { id: 'find', state: found ? 'done' : 'current' },
    { id: 'check', state: found ? 'current' : '' },
    { id: 'cut', state: '' },
  ] as const;
  return (
    <div className="workspace" data-testid="series-card">
      <div className="workspace-head">
        <Button variant="outline" onClick={series.close} data-testid="series-back">
          <span className="with-icon">
            <Icon name="back" size={20} /> {t('series.back')}
          </span>
        </Button>
        <h2>{t('series.title', { name: project.name })}</h2>
      </div>
      <Card className="gap-3 p-4 series-card">
        <ol className="flip-steps" aria-label={t('series.stepsLabel')}>
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={s.state}
              aria-current={s.state === 'current' ? 'step' : undefined}
            >
              <span className="flip-step-n">{i + 1}</span>
              {t(`series.steps.${s.id}`)}
            </li>
          ))}
        </ol>
        {found ? <CheckStep /> : <FindStep />}
      </Card>
    </div>
  );
}
