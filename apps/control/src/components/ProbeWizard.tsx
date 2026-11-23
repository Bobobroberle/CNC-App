import {
  boreDiameter,
  centerRoutine,
  cornerRoutine,
  edgeRoutine,
  toolLengthOffsetCommand,
  toolLengthRoutine,
  type Corner,
  type ProbeRoutine,
  type Results,
} from '@lowrider/workshop';
import { useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatSigned, parseNumber } from '../lib/format';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

export type ProbeKind = 'corner' | 'edge' | 'center' | 'toolLength';
type Kind = ProbeKind;
type Axis = 'x' | 'y' | 'z';
const AXES: Axis[] = ['x', 'y', 'z'];
const CORNERS: Corner[] = ['back-left', 'back-right', 'front-left', 'front-right'];
type Edge = 'x+' | 'x-' | 'y+' | 'y-';
const EDGES: Edge[] = ['x+', 'x-', 'y+', 'y-'];

const num = (text: string) => parseNumber(text);

/**
 * Guided probe cycles: corner, edge, bore centre and tool length sensor – the
 * one chosen on the tiles of ③ Einrichten. A cycle only measures: the result
 * stands there with how far it is from the zero as it was, and the operator
 * takes it over or discards it (DESIGN.md §5 ③).
 */
export function ProbeWizard({ kind }: { kind: ProbeKind }) {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const status = useMachine((s) => s.status);
  const tool = useMachine((s) => s.parserState?.tool ?? 0);
  const { runProbeRoutine, setZeroAt, command, addLog } = useMachine.getState();
  const probe = useJob((s) => s.profile.probe);
  const jobTool = useJob((s) => s.toolDiameter);
  const tools = useWorkshop((s) => s.tools);
  const settings = useWorkshop((s) => s.settings);
  const reference = useWorkshop((s) => s.toolReferenceZ);
  const { setSettings, setToolReferenceZ } = useWorkshop.getState();
  const libraryTool = tools.find((x) => x.number === tool);

  const [corner, setCorner] = useState<Corner>('front-left');
  const [edge, setEdge] = useState<Edge>('x+');
  const [diameter, setDiameter] = useState(String(libraryTool?.diameter ?? jobTool));
  const [inset, setInset] = useState('10');
  const [depth, setDepth] = useState('5');
  const [setterText, setSetterText] = useState({
    x: String(settings.toolSetter?.x ?? ''),
    y: String(settings.toolSetter?.y ?? ''),
    safeZ: String(settings.toolSetter?.safeZ ?? ''),
  });
  const plate = settings.cornerPlate;
  const [plateText, setPlateText] = useState({ top: String(plate.top), wall: String(plate.wall) });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    kind: Kind;
    r: Results;
    /** Machine coordinates of the measured zero, per axis that was measured */
    zero: Partial<Record<Axis, number>>;
    /** The work offset as it was when the cycle ended */
    before: number[];
    state: 'measured' | 'applied' | 'discarded';
  } | null>(null);
  // Another cycle starts without the result of the last one.
  const [shownFor, setShownFor] = useState(kind);
  if (shownFor !== kind) {
    setShownFor(kind);
    setResult(null);
  }

  const params = {
    feed: probe.feed,
    maxTravel: probe.maxTravel,
    retract: Math.min(probe.retract, 5),
    toolDiameter: num(diameter),
  };
  const setter = settings.toolSetter;
  const usesPlate = (kind === 'corner' || kind === 'edge') && plate.use;
  const plateMissing = usesPlate && !(plate.wall > 0);
  const valid = params.toolDiameter > 0 && num(inset) >= 0 && num(depth) > 0 && !plateMissing;
  const savePlate = (patch: Partial<typeof plateText>) => {
    const next = { ...plateText, ...patch };
    setPlateText(next);
    const top = num(next.top);
    const wall = num(next.wall);
    if (top >= 0 && wall >= 0) setSettings({ cornerPlate: { ...plate, top, wall } });
  };

  const routine = (): ProbeRoutine | null => {
    if (kind === 'corner') {
      return cornerRoutine(params, corner, {
        plateThickness: plate.use ? plate.top : 0,
        wall: plate.use ? plate.wall : 0,
        inset: num(inset),
        depth: num(depth),
      });
    }
    if (kind === 'edge') {
      return edgeRoutine(
        params,
        edge[0] as 'x' | 'y',
        edge[1] === '+' ? 1 : -1,
        plate.use ? plate.wall : 0,
      );
    }
    if (kind === 'center') {
      if (!status) return null;
      const [x = 0, y = 0, z = 0] = status.mpos;
      return centerRoutine(params, { x, y, z });
    }
    return setter ? toolLengthRoutine(params, setter) : null;
  };

  const run = async () => {
    const r = routine();
    if (!r) return;
    setBusy(true);
    setResult(null);
    const results = await runProbeRoutine(r);
    setBusy(false);
    if (!results) return;
    setResult({
      kind,
      r: results,
      zero: kind === 'toolLength' ? {} : r.finish(results),
      before: useMachine.getState().status?.wco ?? [0, 0, 0],
      state: 'measured',
    });
  };
  const apply = async () => {
    if (!result) return;
    if (await setZeroAt(result.zero)) setResult({ ...result, state: 'applied' });
  };

  const saveSetter = () => {
    const x = num(setterText.x);
    const y = num(setterText.y);
    const safeZ = num(setterText.safeZ);
    if (![x, y, safeZ].every(Number.isFinite)) return;
    setSettings({ toolSetter: { x, y, safeZ } });
    addLog('info', t('probeWizard.setterSaved'));
  };

  return (
    <Card className="gap-3 p-4" data-testid="probe-wizard" data-find="probe-wizard">
      <CardTitle render={<h2 />}>{t(`probeWizard.${kind}`)}</CardTitle>
      <Alert variant="warning">{t(`probeWizard.${kind}Hint`)}</Alert>

      {kind === 'corner' ? (
        <SegmentedControl
          className="w-full flex-wrap *:flex-auto"
          role="group"
          aria-label={t('probeWizard.whichCorner')}
        >
          {CORNERS.map((c) => (
            <SegmentedControlItem key={c} pressed={corner === c} onClick={() => setCorner(c)}>
              {t(`probeWizard.corners.${c}`)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      ) : null}
      {kind === 'edge' ? (
        <SegmentedControl
          className="w-full flex-wrap *:flex-auto"
          role="group"
          aria-label={t('probeWizard.direction')}
        >
          {EDGES.map((e) => (
            <SegmentedControlItem key={e} pressed={edge === e} onClick={() => setEdge(e)}>
              {t(`probeWizard.edges.${e}`)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      ) : null}

      {kind === 'corner' || kind === 'edge' ? (
        <>
          <SegmentedControl
            className="w-full flex-wrap *:flex-auto"
            role="group"
            aria-label={t('probeWizard.plate')}
          >
            {([true, false] as const).map((use) => (
              <SegmentedControlItem
                key={String(use)}
                pressed={plate.use === use}
                onClick={() => setSettings({ cornerPlate: { ...plate, use } })}
              >
                {t(use ? 'probeWizard.withPlate' : 'probeWizard.withoutPlate')}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          {plate.use ? (
            <div className="grid grid-cols-2 gap-2">
              {kind === 'corner' ? (
                <Field>
                  <FieldLabel>{t('probeWizard.plateTop')}</FieldLabel>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={plateText.top}
                    onChange={(e) => savePlate({ top: e.target.value })}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel>{t('probeWizard.plateWall')}</FieldLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={plateText.wall}
                  onChange={(e) => savePlate({ wall: e.target.value })}
                />
              </Field>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t('probeWizard.withoutPlateHint')}</p>
          )}
          {plateMissing ? <Alert variant="warning">{t('probeWizard.plateMissing')}</Alert> : null}
        </>
      ) : null}

      {kind !== 'toolLength' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel>{t('probeWizard.toolDiameter')}</FieldLabel>
            <Input
              type="text"
              inputMode="decimal"
              value={diameter}
              onChange={(e) => setDiameter(e.target.value)}
            />
          </Field>
          {kind === 'corner' ? (
            <>
              <Field>
                <FieldLabel>{t('probeWizard.inset')}</FieldLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={inset}
                  onChange={(e) => setInset(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{t('probeWizard.depth')}</FieldLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                />
              </Field>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(['x', 'y', 'safeZ'] as const).map((k) => (
              <Field key={k}>
                <FieldLabel>{t(`probeWizard.setter.${k}`)}</FieldLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={setterText[k]}
                  onChange={(e) => setSetterText({ ...setterText, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={saveSetter}>
              {t('probeWizard.saveSetter')}
            </Button>
            <Button
              reason="machine"
              variant="outline"
              className="flex-1"
              disabled={!status}
              onClick={() =>
                setSetterText({
                  ...setterText,
                  x: String(status?.mpos[0] ?? ''),
                  y: String(status?.mpos[1] ?? ''),
                })
              }
            >
              {t('probeWizard.setterHere')}
            </Button>
          </div>
          {!setter ? (
            <p className="text-muted-foreground text-sm">{t('probeWizard.noSetter')}</p>
          ) : null}
          {reference !== null ? (
            <p className="text-muted-foreground text-sm">
              {t('probeWizard.reference', { z: formatCoordinate(reference, 3) })}
            </p>
          ) : null}
        </>
      )}

      <HoldButton
        variant="accent"
        disabled={!idle || busy || !valid || (kind === 'toolLength' && !setter)}
        onConfirm={() => void run()}
      >
        {busy ? t('probeWizard.running') : t('probeWizard.start')}
      </HoldButton>

      {result ? (
        <Alert variant="success" className="justify-items-start gap-y-2" data-testid="probe-result">
          {result.kind === 'center' ? (
            <p>
              {t('probeWizard.bore', {
                x: formatCoordinate(boreDiameter(result.r, params.toolDiameter).x, 2),
                y: formatCoordinate(boreDiameter(result.r, params.toolDiameter).y, 2),
              })}
            </p>
          ) : null}
          {result.kind === 'toolLength' ? (
            <>
              <p>{t('probeWizard.measured', { z: formatCoordinate(result.r.z!, 3) })}</p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setToolReferenceZ(result.r.z!);
                    addLog('info', t('probeWizard.referenceSaved'));
                  }}
                >
                  {t('probeWizard.asReference')}
                </Button>
                <Button
                  reason="missing"
                  className="flex-1"
                  disabled={reference === null}
                  onClick={() => {
                    const cmd = toolLengthOffsetCommand(reference!, result.r.z!);
                    void command(cmd).then(
                      (ok) => ok && addLog('info', t('probeWizard.tloApplied', { cmd })),
                    );
                  }}
                >
                  {t('probeWizard.applyTlo')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <dl className="facts" data-testid="probe-deviation">
                {AXES.filter((axis) => result.zero[axis] !== undefined).map((axis) => (
                  <div key={axis} className="contents">
                    <dt>{t('probeWizard.zeroAxis', { axis: axis.toUpperCase() })}</dt>
                    <dd>
                      {formatCoordinate(result.zero[axis]!, 3)} mm ·{' '}
                      {t('probeWizard.deviation', {
                        mm: formatSigned(
                          result.zero[axis]! - (result.before[AXES.indexOf(axis)] ?? 0),
                          3,
                          true,
                        ),
                      })}
                    </dd>
                  </div>
                ))}
              </dl>
              {result.state === 'measured' ? (
                <div className="flex w-full gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setResult({ ...result, state: 'discarded' })}
                  >
                    {t('probeWizard.discard')}
                  </Button>
                  <Button
                    reason="machine"
                    className="flex-1"
                    disabled={!idle}
                    onClick={() => void apply()}
                  >
                    {t('probeWizard.apply')}
                  </Button>
                </div>
              ) : (
                <p data-testid="probe-outcome">
                  {t(
                    result.state === 'applied'
                      ? 'probeWizard.zeroApplied'
                      : 'probeWizard.discarded',
                  )}
                </p>
              )}
            </>
          )}
        </Alert>
      ) : null}
    </Card>
  );
}
