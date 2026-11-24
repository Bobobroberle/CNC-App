import { circle, toGcode, toolpaths } from '@lowrider/cam';
import { rectangleCheck, type RectangleCheck, type RectangleMeasure } from '@lowrider/workshop';
import { create } from 'zustand';
import { t, type MessageKey } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useMeasurements } from '../store/measurements';
import { useUi } from '../store/ui';
import { CorrectionPanel, signed } from './CorrectionPanel';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';

type Field = keyof RectangleMeasure;
const FIELDS: Field[] = ['bottom', 'top', 'left', 'right', 'diagonalAC', 'diagonalBD'];

interface AccuracyStore {
  size: { x: string; y: string };
  depth: string;
  measured: Record<Field, string>;
  result: RectangleCheck | null;
  applied: boolean;
  set(patch: Partial<Omit<AccuracyStore, 'set'>>): void;
}

/** Kept while the section is closed: measuring takes a while. */
const useAccuracy = create<AccuracyStore>((set) => ({
  size: { x: '500', y: '400' },
  depth: '0.5',
  measured: { bottom: '', top: '', left: '', right: '', diagonalAC: '', diagonalBD: '' },
  result: null,
  applied: false,
  set: (patch) => set(patch),
}));

const num = (text: string) => parseNumber(text);
/** Gantry lean over one metre of Y, mm */
const perMetre = (deg: number) => Math.tan((deg * Math.PI) / 180) * 1000;

/** Four shallow marks at A (0,0), B (X,0), C (X,Y), D (0,Y), like Estlcam's accuracy check. */
export function accuracyPattern(x: number, y: number, depth: number, tool: number): string {
  const corners = [
    [0, 0],
    [x, 0],
    [x, y],
    [0, y],
  ] as const;
  const { moves } = toolpaths(
    corners.map(([cx, cy]) => circle(cx, cy, tool)),
    corners.map((_, i) => ({ contour: i, kind: 'drill' as const })),
    {
      toolDiameter: tool,
      depth,
      stepdown: depth,
      stepover: 0.4,
      feed: 1000,
      plungeFeed: 250,
      rampAngle: 90,
      safeZ: 5,
      climb: true,
    },
  );
  return toGcode(moves, { name: `genauigkeit ${x} x ${y}`, rpm: 18000, safeZ: 5 });
}

/** Where the marks sit and which distances to measure. */
function Sketch() {
  return (
    <svg className="accuracy-sketch" viewBox="0 0 240 170" aria-hidden="true">
      <rect x="30" y="20" width="180" height="120" className="sketch-side" />
      <line x1="30" y1="140" x2="210" y2="20" className="sketch-diag" />
      <line x1="210" y1="140" x2="30" y2="20" className="sketch-diag" />
      {(
        [
          ['A', 30, 140, 14, 160],
          ['B', 210, 140, 216, 160],
          ['C', 210, 20, 216, 14],
          ['D', 30, 20, 14, 14],
        ] as const
      ).map(([label, x, y, tx, ty]) => (
        <g key={label}>
          <circle cx={x} cy={y} r="6" className="sketch-mark" />
          <text x={tx} y={ty} className="sketch-label">
            {label}
          </text>
        </g>
      ))}
      <text x="120" y="160" className="sketch-axis">
        X
      </text>
      <text x="4" y="84" className="sketch-axis">
        Y
      </text>
    </svg>
  );
}

/**
 * Scale and squareness measured from outside: the machine cuts four marks,
 * a steel rule or tape measures sides and diagonals, the app turns that into
 * steps/mm and gantry squaring. (Measuring the marks with the machine's own
 * camera would only repeat its errors.)
 */
export function AccuracyCheck() {
  const a = useAccuracy();
  const toolDiameter = useJob((s) => s.toolDiameter);
  const go = useUi((s) => s.go);
  const addLog = useMachine((s) => s.addLog);
  const nominal = { x: num(a.size.x), y: num(a.size.y) };
  const ready = FIELDS.every((f) => num(a.measured[f]) > 0);
  const r = a.result;

  const cut = () => {
    const depth = num(a.depth);
    if (!(nominal.x > 0 && nominal.y > 0 && depth > 0)) return;
    const name = `genauigkeit_${nominal.x}x${nominal.y}.nc`;
    // A job under way keeps its program: nothing was loaded, so nothing is said to be.
    if (!useJob.getState().load(name, accuracyPattern(nominal.x, nominal.y, depth, toolDiameter))) {
      return;
    }
    addLog('info', t('accuracy.loaded', { name }));
    go('run', 'check');
  };

  return (
    <Card className="gap-3 p-4" data-testid="accuracy-check" data-find="accuracy">
      <CardTitle render={<h2 />}>{t('accuracy.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('accuracy.intro')}</p>

      <h3 className="font-medium text-muted-foreground text-sm">{t('accuracy.step1')}</h3>
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y'] as const).map((k) => (
          <Field key={k}>
            <FieldLabel>{t(`accuracy.size.${k}`)}</FieldLabel>
            <Input
              type="text"
              inputMode="decimal"
              value={a.size[k]}
              onChange={(e) => a.set({ size: { ...a.size, [k]: e.target.value }, result: null })}
            />
          </Field>
        ))}
        <Field>
          <FieldLabel>{t('accuracy.depth')}</FieldLabel>
          <Input
            type="text"
            inputMode="decimal"
            value={a.depth}
            onChange={(e) => a.set({ depth: e.target.value })}
          />
        </Field>
      </div>
      <p className="text-muted-foreground text-sm">{t('accuracy.cutHint')}</p>
      <Button variant="outline" onClick={cut}>
        {t('accuracy.cut')}
      </Button>

      <h3 className="font-medium text-muted-foreground text-sm">{t('accuracy.step2')}</h3>
      <Sketch />
      <p className="text-muted-foreground text-sm">{t('accuracy.measureHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <Field key={f}>
            <FieldLabel>{t(`accuracy.fields.${f}` as MessageKey)}</FieldLabel>
            <Input
              type="text"
              inputMode="decimal"
              value={a.measured[f]}
              onChange={(e) =>
                a.set({ measured: { ...a.measured, [f]: e.target.value }, result: null })
              }
            />
          </Field>
        ))}
      </div>
      <Button
        variant="outline"
        reason="machine"
        disabled={!ready}
        onClick={() => {
          const values = Object.fromEntries(FIELDS.map((f) => [f, num(a.measured[f])]));
          const result = rectangleCheck(nominal, values as unknown as RectangleMeasure);
          a.set({ result, applied: false });
          if (!result) addLog('error', t('accuracy.implausible'), 'accuracy.implausible');
          else {
            useMeasurements.getState().record('ruler-check', {
              sizeX: nominal.x,
              sizeY: nominal.y,
              ...(values as Record<string, number>),
              scaleX: result.scaleX,
              scaleY: result.scaleY,
              squareness: result.squareness,
              trapezoid: result.trapezoid,
              closure: result.rms,
            });
          }
        }}
      >
        {t('accuracy.evaluate')}
      </Button>

      {r ? (
        <>
          <h3 className="font-medium text-muted-foreground text-sm">{t('accuracy.result')}</h3>
          <dl className="facts" data-testid="accuracy-result">
            <dt>{t('calibration.scaleX')}</dt>
            <dd className="tabular-nums">
              {t('calibration.scaleValue', {
                percent: signed((r.scaleX - 1) * 100, 3),
                mm: signed((r.scaleX - 1) * 1000, 2),
              })}
            </dd>
            <dt>{t('calibration.scaleY')}</dt>
            <dd className="tabular-nums">
              {t('calibration.scaleValue', {
                percent: signed((r.scaleY - 1) * 100, 3),
                mm: signed((r.scaleY - 1) * 1000, 2),
              })}
            </dd>
            <dt>{t('calibration.angle')}</dt>
            <dd className="tabular-nums">
              {t('calibration.angleValue', {
                angle: formatNumber(90 - r.squareness, 3),
                mm: signed(perMetre(r.squareness), 2),
              })}
            </dd>
            <dt>{t('accuracy.fit')}</dt>
            <dd className="tabular-nums">
              {t('accuracy.fitValue', { mm: formatNumber(r.rms, 2) })}
            </dd>
          </dl>
          {r.trapezoid > 0.5 ? (
            <Alert variant="warning">
              {t('accuracy.trapezoid', { mm: formatNumber(r.trapezoid, 1) })}
            </Alert>
          ) : null}
          {r.rms > 0.5 ? <Alert variant="warning">{t('accuracy.badFit')}</Alert> : null}
          <CorrectionPanel
            first={r}
            turned={null}
            precise
            onApplied={() => a.set({ result: null, applied: true })}
          />
        </>
      ) : null}
      {a.applied ? <Alert variant="success">{t('accuracy.afterApply')}</Alert> : null}
    </Card>
  );
}
