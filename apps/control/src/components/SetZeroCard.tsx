import { CheckIcon, CrosshairIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatNumber, parseNumber } from '../lib/format';
import { crosshairPoint, useCamera } from '../store/camera';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { cameraCalibrated } from '../store/photomap';
import { useRecent } from '../store/recent';
import { useStageTools } from '../store/tools';
import { useUi } from '../store/ui';
import { safeMachineZ, useWorkshop } from '../store/workshop';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Reason } from '../ui/tooltip';
import { HoldButton } from './HoldButton';
import { Dock, Result } from '../ui/dock';

const FINE_STEPS = [0.01, 0.1, 1] as const;
type Reference = 'camera' | 'tool';

/** A number as it is typed again */
const typed = (n: number) => String(Number(n.toFixed(2))).replace('.', ',');

/**
 * The one way to the work zero (DESIGN.md §5 ③): tap the place on the picture
 * – that only shows the target –, drive there with a hold, correct finely,
 * then set the zero where the crosshair (or the cutter) stands. A tap never
 * moves the machine; every move here is a hold or a single fine step.
 */
export function SetZeroCard() {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const connected = useMachine((s) => s.connection === 'connected');
  const homed = useMachine((s) => s.homed);
  const wco = useMachine((s) => s.status?.wco.join(',') ?? null);
  const wcs = useMachine((s) => s.parserState?.wcs ?? 'G54');
  // Re-render with the position, so the reference's coordinates follow.
  const mx = useMachine((s) => s.status?.mpos[0]);
  const my = useMachine((s) => s.status?.mpos[1]);
  const mz = useMachine((s) => s.status?.mpos[2]);
  const camera = useWorkshop((s) => s.settings.camera);
  const settings = useWorkshop((s) => s.settings);
  const zMax = useJob((s) => s.profile.travel.z.max);
  const cameraOn = useCamera((s) => s.source !== null);
  const withCamera = cameraOn && cameraCalibrated(camera);
  const active = useStageTools((s) => s.active === 'zero' && s.zeroStep === 'corner');
  const point = useStageTools((s) =>
    s.active === 'zero' && s.zeroStep === 'corner' ? (s.points[s.points.length - 1] ?? null) : null,
  );
  const lift = useUi((s) => s.liftBeforeMove);
  const setLift = useUi((s) => s.setLiftBeforeMove);
  const { jog, moveTo, setZeroAt } = useMachine.getState();

  const [chosen, setChosen] = useState<Reference | null>(null);
  const reference: Reference = withCamera ? (chosen ?? 'camera') : 'tool';
  const [step, setStep] = useState<number>(0.1);
  const [stepText, setStepText] = useState('');
  const [clear, setClear] = useState(false);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<{ x?: string; y?: string }>({});

  const offsets = wco?.split(',').map(Number) ?? null;
  const zeroSet = offsets !== null && offsets.some((v) => v !== 0);
  const at =
    reference === 'camera'
      ? crosshairPoint()
      : mx !== undefined && my !== undefined
        ? { x: mx, y: my }
        : null;
  // §6.4: a move below the safe height is confirmed, never just done.
  const low =
    homed && mz !== undefined && mz < safeMachineZ(settings, zMax) - 0.5 && !(lift && homed);
  const work = (p: { x: number; y: number }) => ({
    x: p.x - (offsets?.[0] ?? 0),
    y: p.y - (offsets?.[1] ?? 0),
  });

  const pick = () => {
    setDone(false);
    const job = useJob.getState();
    if (job.view === '3d') job.setView(withCamera ? 'camera' : 'table');
    useStageTools.getState().select('zero');
  };
  const drive = () => {
    if (!point) return;
    const target =
      reference === 'camera'
        ? { x: point.x - camera.offsetX, y: point.y - camera.offsetY }
        : { x: point.x, y: point.y };
    setClear(false);
    void moveTo(target, lift).then((ok) => ok && useStageTools.getState().clear());
  };
  const moveTarget = (axis: 'x' | 'y', text: string) => {
    setDraft({ ...draft, [axis]: text });
    const value = parseNumber(text);
    if (!point || !Number.isFinite(value)) return;
    const machine = value + (offsets?.[axis === 'x' ? 0 : 1] ?? 0);
    useStageTools.getState().movePoint(useStageTools.getState().points.length - 1, {
      x: axis === 'x' ? machine : point.x,
      y: axis === 'y' ? machine : point.y,
    });
  };
  const set = () => {
    if (!at) return;
    void setZeroAt({ x: at.x, y: at.y }).then((ok) => {
      setDone(ok);
      if (ok) useRecent.getState().rememberZero();
    });
  };
  const driveReason = !connected
    ? t('ready.offline')
    : !idle
      ? t('ready.busy')
      : !point
        ? t('zeroFlow.needTarget')
        : low && !clear
          ? t('zeroFlow.needClear')
          : null;
  const setReason = !connected ? t('ready.offline') : !idle ? t('ready.busy') : null;

  return (
    <Card className="gap-3 p-4" data-testid="zero-flow" data-find="setup-zero">
      <CardTitle render={<h2 />}>{t('zeroFlow.title')}</CardTitle>
      <p className="zero-now tabular-nums" data-testid="zero-now" data-set={zeroSet}>
        {zeroSet ? (
          <CheckIcon aria-hidden="true" className="size-5 text-success-foreground" />
        ) : (
          <TriangleAlertIcon aria-hidden="true" className="size-5 text-warning-foreground" />
        )}
        <span>
          {offsets === null
            ? t('zeroFlow.unknown')
            : zeroSet
              ? t('zeroFlow.now', {
                  wcs,
                  x: formatCoordinate(offsets[0] ?? 0, 2),
                  y: formatCoordinate(offsets[1] ?? 0, 2),
                  z: formatCoordinate(offsets[2] ?? 0, 2),
                })
              : t('zeroFlow.notSet')}
        </span>
      </p>
      <ol className="flow-steps">
        <li>
          <h3>{t('zeroFlow.step1')}</h3>
          <Button variant="outline" pressed={active} onClick={pick}>
            <CrosshairIcon aria-hidden="true" />
            {t('zeroFlow.pick')}
          </Button>
          {point ? (
            <div className="grid grid-cols-2 gap-2" data-testid="zero-target">
              {(['x', 'y'] as const).map((axis) => (
                <Field key={axis}>
                  <FieldLabel>{t(`zeroFlow.target.${axis}`)}</FieldLabel>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={draft[axis] ?? typed(work(point)[axis])}
                    onFocus={() => setDraft({ ...draft, [axis]: typed(work(point)[axis]) })}
                    onBlur={() => setDraft({})}
                    onChange={(e) => moveTarget(axis, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {active ? t('zeroFlow.pickHint') : t('zeroFlow.pickIdle')}
            </p>
          )}
        </li>
        <li>
          <h3>{t('zeroFlow.step2')}</h3>
          {withCamera ? (
            <SegmentedControl role="group" aria-label={t('zeroFlow.reference')}>
              {(['camera', 'tool'] as const).map((r) => (
                <SegmentedControlItem
                  key={r}
                  pressed={reference === r}
                  onClick={() => setChosen(r)}
                >
                  {t(`zeroFlow.references.${r}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          ) : null}
          <Label className="min-h-target gap-3 font-normal">
            <Checkbox
              checked={lift && homed}
              disabled={!homed}
              onCheckedChange={(checked) => setLift(checked)}
            />
            <span>{homed ? t('goto.lift') : t('goto.liftNeedsHoming')}</span>
          </Label>
          {low ? (
            <Alert variant="warning" data-testid="zero-low">
              <p>{t('zeroFlow.low')}</p>
              <Label className="min-h-target gap-3 font-normal">
                <Checkbox checked={clear} onCheckedChange={(checked) => setClear(checked)} />
                <span>{t('zeroFlow.lowConfirm')}</span>
              </Label>
            </Alert>
          ) : null}
          <Reason reason={driveReason} className="block w-full">
            <HoldButton variant="accent" disabled={driveReason !== null} onConfirm={drive}>
              {t(`zeroFlow.drive.${reference}`)}
            </HoldButton>
          </Reason>
        </li>
        <li>
          <h3 data-find="crosshair">{t('zeroFlow.step3')}</h3>
          <div className="flex flex-wrap items-end gap-2">
            <SegmentedControl role="group" aria-label={t('drive.step')}>
              {FINE_STEPS.map((s) => (
                <SegmentedControlItem
                  key={s}
                  pressed={step === s && stepText === ''}
                  onClick={() => {
                    setStep(s);
                    setStepText('');
                  }}
                >
                  {formatNumber(s, s < 0.1 ? 2 : s < 1 ? 1 : 0)} mm
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            <Field className="w-28">
              <FieldLabel>{t('zeroFlow.ownStep')}</FieldLabel>
              <Input
                type="text"
                inputMode="decimal"
                value={stepText}
                onChange={(e) => {
                  setStepText(e.target.value);
                  const mm = parseNumber(e.target.value);
                  // A fine step stays fine: what is typed is taken between 0.01 and 10 mm.
                  if (Number.isFinite(mm) && mm >= 0.01 && mm <= 10) setStep(mm);
                }}
              />
            </Field>
          </div>
          <div className="finepad">
            {(
              [
                ['fp-yp', 'Y', 1, 'Y+'],
                ['fp-xm', 'X', -1, 'X−'],
                ['fp-xp', 'X', 1, 'X+'],
                ['fp-ym', 'Y', -1, 'Y−'],
              ] as const
            ).map(([cls, axis, dir, label]) => (
              <Button
                reason="machine"
                key={label}
                variant="outline"
                className={cls}
                disabled={!idle}
                onClick={() => jog(axis, dir * step)}
              >
                {label}
              </Button>
            ))}
          </div>
          {at ? (
            <p className="tabular-nums text-muted-foreground text-sm" data-testid="zero-at">
              {t(`zeroFlow.at.${reference}`, {
                x: formatCoordinate(work(at).x, 2),
                y: formatCoordinate(work(at).y, 2),
              })}
            </p>
          ) : null}
        </li>
        <li>
          <h3>{t('zeroFlow.step4')}</h3>
          {done ? (
            <Result>
              <Alert variant="success" data-testid="zero-set-done">
                {t('zeroFlow.done')}
              </Alert>
            </Result>
          ) : null}
        </li>
      </ol>
      {/* The main action of the card, docked: the zero is set from wherever the card is in view. */}
      <Dock>
        <Reason reason={setReason} className="block w-full">
          <HoldButton variant="accent" disabled={setReason !== null || !at} onConfirm={set}>
            {t(`zeroFlow.set.${reference}`)}
          </HoldButton>
        </Reason>
      </Dock>
    </Card>
  );
}

/** The zeros the loaded job was cut with before (the last five): back with one hold, X/Y only. */
export function ZeroHistoryCard() {
  const name = useJob((s) => s.original?.fileName ?? s.fileName);
  const zeros = useRecent((s) => s.jobs.find((j) => j.name === name)?.zeros);
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const { setZeroAt } = useMachine.getState();
  if (!name) return null;
  return (
    <Card className="gap-3 p-4" data-testid="zero-history" data-find="zero-history">
      <CardTitle render={<h2 />}>{t('zeroFlow.history')}</CardTitle>
      {!zeros || zeros.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('zeroFlow.historyEmpty')}</p>
      ) : (
        <>
          <ul className="parts">
            {zeros.map((z) => (
              <li key={z.at} className="part">
                <div>
                  <strong className="tabular-nums">
                    {z.wcs} · X {formatCoordinate(z.x, 2)} · Y {formatCoordinate(z.y, 2)}
                  </strong>
                  <div className="text-muted-foreground text-sm tabular-nums">
                    {new Date(z.at).toLocaleString()} · Z {formatCoordinate(z.z, 2)}
                  </div>
                </div>
                <HoldButton disabled={!idle} onConfirm={() => setZeroAt({ x: z.x, y: z.y })}>
                  {t('zeroFlow.restore')}
                </HoldButton>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">{t('zeroFlow.historyHint')}</p>
        </>
      )}
    </Card>
  );
}
