import { CircleCheckIcon, LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import {
  checkDraft,
  LIMIT_AXES,
  LIMIT_KINDS,
  LIMIT_RANGE,
  smallStepUp,
  toDraft,
  type LimitAxis,
  type LimitDraft,
  type LimitKind,
} from '../lib/limits';
import { useLimits, canKeepLimits } from '../store/limits';
import { useMachine } from '../store/machine';
import { useWorkshop } from '../store/workshop';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AckMark, useAck } from './Ack';
import { HoldButton } from './HoldButton';

const item = (kind: LimitKind) => t(`limits.items.${kind}`);
const name = (axis: LimitAxis, kind: LimitKind) =>
  t('limits.field', { axis: axis.toUpperCase(), item: item(kind) });

/**
 * "Grenzen der Steuerung" (Einstellungen → Maschine): FluidNC's top speed and
 * acceleration per axis – apart from the app's own jog speed. Read from the
 * machine; written only at rest, as a hold, read back and shown; kept in
 * config.yaml only where that can be done without touching anything else
 * (through the companion), else said to hold until the next restart.
 */
export function MachineLimitsCard() {
  const { current, phase, result, error, read, write } = useLimits();
  const connected = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.status?.state === 'Idle');
  const url = useMachine((s) => s.url);
  const advertised = useWorkshop((s) => s.companionHealth?.fluidnc?.url);
  const keepable = canKeepLimits(url, advertised);
  const [draft, setDraft] = useState<LimitDraft | null>(null);
  const [keep, setKeep] = useState(true);
  const readAck = useAck();
  useEffect(() => {
    if (current) setDraft(toDraft(current));
  }, [current]);

  const check = useMemo(
    () => (current && draft ? checkDraft(current, draft) : null),
    [current, draft],
  );
  const problemOf = (axis: LimitAxis, kind: LimitKind) =>
    check?.problems.find((p) => p.axis === axis && p.kind === kind);
  const reason = !current
    ? t('limits.reason.notRead')
    : check && check.problems.length > 0
      ? t('limits.reason.problems')
      : check && check.changes.length === 0
        ? t('limits.reason.noChange')
        : null;

  return (
    <Card className="gap-3 p-4" data-testid="machine-limits" data-find="machine-limits">
      <CardTitle render={<h2 />}>{t('limits.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('limits.intro')}</p>
      {phase === 'reading' ? (
        <Alert variant="info" aria-busy="true">
          <LoaderCircleIcon
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <AlertDescription className="text-foreground">{t('limits.reading')}</AlertDescription>
        </Alert>
      ) : null}
      {!current && phase !== 'reading' ? (
        <p className="text-muted-foreground text-sm">{t('limits.notRead')}</p>
      ) : null}
      {current && draft ? (
        <div className="limits-grid" role="group" aria-label={t('limits.title')}>
          <span aria-hidden="true" />
          <span className="text-muted-foreground text-sm">{t('limits.maxRate')}</span>
          <span className="text-muted-foreground text-sm">{t('limits.acceleration')}</span>
          {LIMIT_AXES.map((axis) => [
            <span key={`${axis}-name`} className="axis-name">
              {axis.toUpperCase()}
            </span>,
            ...LIMIT_KINDS.map((kind) => {
              const changed = check?.changes.some((c) => c.axis === axis && c.kind === kind);
              const problem = problemOf(axis, kind);
              return (
                <div key={`${axis}-${kind}`} className="flex flex-col gap-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${name(axis, kind)} (${t(kind === 'maxRate' ? 'units.mmPerMin' : 'units.mmPerS2')})`}
                    aria-invalid={problem ? true : undefined}
                    value={draft[axis][kind]}
                    onChange={(e) =>
                      setDraft({ ...draft, [axis]: { ...draft[axis], [kind]: e.target.value } })
                    }
                  />
                  {changed ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t('limits.before', { value: formatNumber(current[axis][kind]) })}
                    </span>
                  ) : null}
                </div>
              );
            }),
          ])}
        </div>
      ) : null}
      {check && check.problems.length > 0 ? (
        <Alert variant="warning" data-testid="limits-problems">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription className="text-foreground">
            {check.problems.map((p) => (
              <span key={`${p.axis}-${p.kind}`}>
                {t(`limits.problem.${p.problem}`, {
                  axis: p.axis.toUpperCase(),
                  item: item(p.kind),
                  min: formatNumber(LIMIT_RANGE[p.kind].min),
                  max: formatNumber(LIMIT_RANGE[p.kind].max),
                })}
              </span>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
      {check && check.raised.length > 0 ? (
        <Alert variant="warning" data-testid="limits-raised">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription className="text-foreground">
            <span>{t('limits.raised')}</span>
            {check.bigSteps.map((c) => (
              <strong key={c.path}>
                {t('limits.bigStep', {
                  axis: c.axis.toUpperCase(),
                  item: item(c.kind),
                  percent: Math.round((c.to / c.from - 1) * 100),
                  next: `${formatNumber(c.from)} → ${formatNumber(smallStepUp(c.from))}`,
                })}
              </strong>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
      {current ? (
        keepable ? (
          <>
            <Label className="min-h-target gap-3 font-normal">
              <Checkbox checked={keep} onCheckedChange={(on) => setKeep(on)} />
              <span>{t('limits.keep')}</span>
            </Label>
            <p className="text-muted-foreground text-sm">
              {t('limits.keepHint', { backup: 'config.yaml.bak' })}
            </p>
          </>
        ) : (
          <Alert variant="default" data-testid="limits-runtime-only">
            <AlertDescription>{t('limits.keepNotPossible')}</AlertDescription>
          </Alert>
        )
      ) : null}
      {phase === 'writing' ? (
        <Alert variant="info" aria-busy="true" data-testid="limits-writing">
          <LoaderCircleIcon
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <AlertDescription className="text-foreground">{t('limits.writing')}</AlertDescription>
        </Alert>
      ) : null}
      <HoldButton
        disabled={!connected || !idle || reason !== null || phase !== 'idle'}
        reason={connected && idle ? reason : null}
        onConfirm={() => (check ? write(check.changes, keep && keepable) : false)}
      >
        {t('limits.write')}
      </HoldButton>
      {error ? (
        <Alert variant="warning" role="alert" data-testid="limits-error">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription className="text-foreground">{t(error)}</AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <Alert
          variant={result.saved === 'saved' ? 'success' : 'warning'}
          data-testid="limits-result"
          data-saved={result.saved}
        >
          {result.saved === 'saved' ? (
            <CircleCheckIcon aria-hidden="true" />
          ) : (
            <TriangleAlertIcon aria-hidden="true" />
          )}
          <AlertTitle>{t('limits.resultTitle')}</AlertTitle>
          <AlertDescription className="text-foreground">
            {result.values.map(({ change: c, read: value }) => (
              <span key={c.path} className="tabular-nums">
                {value === null
                  ? t('limits.resultMissing', { axis: c.axis.toUpperCase(), item: item(c.kind) })
                  : t('limits.resultLine', {
                      axis: c.axis.toUpperCase(),
                      item: item(c.kind),
                      from: formatNumber(c.from),
                      to: formatNumber(c.to),
                      read: formatNumber(value),
                    })}
              </span>
            ))}
            <span>
              {t(`limits.saved.${result.saved}`, {
                file: result.backup?.replace(/\.bak$/, '') ?? 'config.yaml',
                backup: result.backup ?? '',
              })}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        variant="outline"
        reason="machine"
        disabled={!connected || phase !== 'idle'}
        onClick={() => void readAck.run(read)}
      >
        {t('limits.read')}
        <AckMark state={readAck.state} />
      </Button>
      <p className="text-muted-foreground text-sm">{t('limits.restart')}</p>
    </Card>
  );
}
