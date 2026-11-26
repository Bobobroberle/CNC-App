import { circle, toGcode, toolpaths } from '@lowrider/cam';
import { rectangleCheck, type RectangleCheck, type RectangleMeasure } from '@lowrider/workshop';
import { create } from 'zustand';
import { t, type MessageKey } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { compareSquaring, perMetre, type Verdict } from '../lib/squaring';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useMeasurements } from '../store/measurements';
import { useUi } from '../store/ui';
import { LINES, LineGlyph, MeasureSketch, type MeasureLine } from './AccuracySketch';
import { CorrectionPanel, signed } from './CorrectionPanel';
import type { Correction } from '../store/calibration';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';

type Field = keyof RectangleMeasure;
const FIELDS: Field[] = ['bottom', 'top', 'left', 'right', 'diagonalAC', 'diagonalBD'];

/** What the first measurement was and what was written for it – kept until the control measurement has been judged. */
interface Before {
  scaleX: number;
  scaleY: number;
  /** Lean of the axes, degrees (+ = the X+ end of the gantry ahead towards +Y) */
  squareness: number;
  sizeX: number;
  sizeY: number;
  at: string;
  corrections: { path: string; from: number; to: number }[];
}

interface AccuracyStore {
  size: { x: string; y: string };
  depth: string;
  measured: Record<Field, string>;
  result: RectangleCheck | null;
  /** The line whose field has the focus: the drawing shows it thick */
  focus: Field | null;
  /** Set once the pattern was loaded as a job (and again after a correction – it has to be cut anew) */
  cutLoaded: boolean;
  before: Before | null;
  /** After the correction: a homing was seen to run (or the link to drop), and the machine was homed again after it */
  sawUnhomed: boolean;
  homedAgain: boolean;
  set(patch: Partial<Omit<AccuracyStore, 'set'>>): void;
}

const KEY = 'lowrider-control.accuracy';
const EMPTY: Record<Field, string> = {
  bottom: '',
  top: '',
  left: '',
  right: '',
  diagonalAC: '',
  diagonalBD: '',
};

/** Between the correction and its control lie a restart, a homing and a whole job: the first measurement must outlast a reload. */
function loadKept(): Pick<AccuracyStore, 'before' | 'sawUnhomed' | 'homedAgain'> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AccuracyStore> | null;
    const b = v?.before;
    if (
      b &&
      Number.isFinite(b.scaleX) &&
      Number.isFinite(b.scaleY) &&
      Number.isFinite(b.squareness) &&
      Array.isArray(b.corrections)
    ) {
      return { before: b, sawUnhomed: !!v?.sawUnhomed, homedAgain: !!v?.homedAgain };
    }
  } catch {
    // nothing kept, or not readable: the check starts from the beginning
  }
  return { before: null, sawUnhomed: false, homedAgain: false };
}

/** Kept while the section is closed: measuring takes a while. */
const useAccuracy = create<AccuracyStore>((set) => ({
  size: { x: '500', y: '400' },
  depth: '0.5',
  measured: { ...EMPTY },
  result: null,
  focus: null,
  cutLoaded: false,
  ...loadKept(),
  set: (patch) => set(patch),
}));

useAccuracy.subscribe((a) => {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ before: a.before, sawUnhomed: a.sawUnhomed, homedAgain: a.homedAgain }),
    );
  } catch {
    // a browser that keeps nothing: the first measurement holds until the page closes
  }
});

const num = (text: string) => parseNumber(text);

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

type StepState = 'done' | 'current' | 'todo';

/** The steps in the order they are done, each done only by what can be seen: no step is ticked on a hunch. */
function steps(a: AccuracyStore, ready: boolean): { key: string; state: StepState }[] {
  const afterWrite = a.before !== null;
  const flags = [
    ['cut', afterWrite || a.cutLoaded],
    ['measure', afterWrite || ready],
    ['evaluate', afterWrite || a.result !== null],
    ['write', afterWrite],
    ['restart', a.homedAgain],
    ['cut2', afterWrite && a.cutLoaded],
    ['measure2', afterWrite && ready],
    ['evaluate2', afterWrite && a.result !== null],
  ] as const;
  const firstOpen = flags.findIndex(([, done]) => !done);
  return flags.map(([key, done], i) => ({
    key,
    state: done ? 'done' : i === firstOpen ? 'current' : 'todo',
  }));
}

/**
 * Whether the machine was restarted and homed after the correction: a pattern cut before that still shows the old error,
 * and a second correction on it would act twice. A homing run (or the link dropping) is seen, then a homed machine.
 * Watched here, not in the card: homing is done from the jog panel, which lays itself over the card.
 */
function watchHoming() {
  const m = useMachine.getState();
  const a = useAccuracy.getState();
  if (!a.before || a.homedAgain) return;
  if (m.status?.state === 'Home' || m.connection !== 'connected' || !m.homed) {
    if (!a.sawUnhomed) a.set({ sawUnhomed: true });
  } else if (a.sawUnhomed) {
    a.set({ homedAgain: true });
  }
}
useMachine.subscribe(watchHoming);
useAccuracy.subscribe(watchHoming);

/** What the control measurement says – in words, with what to do about it. */
const VERDICT_VARIANT: Record<Verdict, 'success' | 'warning'> = {
  good: 'success',
  better: 'success',
  unchanged: 'warning',
  doubled: 'warning',
  overshot: 'warning',
};

/**
 * Scale and squareness measured from outside: the machine cuts four marks,
 * a steel rule or tape measures sides and diagonals, the app turns that into
 * steps/mm and gantry squaring. (Measuring the marks with the machine's own
 * camera would only repeat its errors.) After the correction the same pattern
 * is cut and measured again, and the two are put side by side.
 */
export function AccuracyCheck() {
  const a = useAccuracy();
  const toolDiameter = useJob((s) => s.toolDiameter);
  const go = useUi((s) => s.go);
  const addLog = useMachine((s) => s.addLog);
  const nominal = { x: num(a.size.x), y: num(a.size.y) };
  const ready = FIELDS.every((f) => num(a.measured[f]) > 0);
  const r = a.result;
  const { before, homedAgain } = a;

  const cut = () => {
    const depth = num(a.depth);
    if (!(nominal.x > 0 && nominal.y > 0 && depth > 0)) return;
    const name = `genauigkeit_${nominal.x}x${nominal.y}.nc`;
    // A job under way keeps its program: nothing was loaded, so nothing is said to be.
    if (!useJob.getState().load(name, accuracyPattern(nominal.x, nominal.y, depth, toolDiameter))) {
      return;
    }
    a.set({ cutLoaded: true });
    addLog('info', t('accuracy.loaded', { name }));
    go('run', 'check');
  };

  const stepList = steps(a, ready);
  const verdict: Verdict | null =
    before && r ? compareSquaring(before.squareness, r.squareness) : null;
  // The control measurement is of no use before the machine was homed again: it would show the old error
  const waiting = before !== null && !homedAgain;

  return (
    <Card className="gap-3 p-4" data-testid="accuracy-check" data-find="accuracy">
      <CardTitle render={<h2 />}>{t('accuracy.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('accuracy.intro')}</p>

      <h3 className="font-medium text-muted-foreground text-sm">{t('accuracy.steps.title')}</h3>
      <ol className="accuracy-steps" data-testid="accuracy-steps">
        {stepList.map(({ key, state: st }, i) => (
          <li key={key} data-step={key} data-state={st}>
            <span className="step-mark" aria-hidden="true">
              {st === 'done' ? '✓' : i + 1}
            </span>
            <span>
              {t(`accuracy.steps.${key}` as MessageKey)}
              {st === 'current' ? (
                <strong className="step-now"> – {t('accuracy.steps.now')}</strong>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {before ? (
        <Alert variant={homedAgain ? 'default' : 'warning'} data-testid="accuracy-after-write">
          {homedAgain ? t('accuracy.nowControl') : t('accuracy.blocked')}
        </Alert>
      ) : null}

      <h3 className="font-medium text-muted-foreground text-sm">
        {before ? t('accuracy.step1Again') : t('accuracy.step1')}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y'] as const).map((k) => (
          <Field key={k}>
            <FieldLabel>{t(`accuracy.size.${k}`)}</FieldLabel>
            <Input
              type="text"
              inputMode="decimal"
              value={a.size[k]}
              disabled={before !== null}
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

      <h3 className="font-medium text-muted-foreground text-sm">
        {before ? t('accuracy.step2Again') : t('accuracy.step2')}
      </h3>
      <MeasureSketch active={a.focus as MeasureLine | null} />
      <p className="text-muted-foreground text-sm" data-testid="accuracy-selfcheck">
        {t('accuracy.sketch.selfCheck')}
      </p>
      <p className="text-muted-foreground text-sm">{t('accuracy.measureHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <Field key={f}>
            <FieldLabel>{t(`accuracy.fields.${f}` as MessageKey)}</FieldLabel>
            {/* the number and the small drawing stand in the row of the field: where the field is in view, so are they */}
            <div className="flex items-center gap-2">
              <span className="field-number" aria-hidden="true">
                {LINES.indexOf(f) + 1}
              </span>
              <LineGlyph line={f} />
              <Input
                type="text"
                inputMode="decimal"
                value={a.measured[f]}
                onFocus={() => a.set({ focus: f })}
                onBlur={() => a.set({ focus: null })}
                onChange={(e) =>
                  a.set({ measured: { ...a.measured, [f]: e.target.value }, result: null })
                }
              />
            </div>
          </Field>
        ))}
      </div>
      {waiting ? (
        <Alert variant="warning" data-testid="accuracy-wait">
          {t('accuracy.blocked')}
        </Alert>
      ) : null}
      <Button
        variant="outline"
        reason="machine"
        disabled={!ready}
        onClick={() => {
          const values = Object.fromEntries(FIELDS.map((f) => [f, num(a.measured[f])]));
          const result = rectangleCheck(nominal, values as unknown as RectangleMeasure);
          a.set({ result });
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
          {before ? (
            <>
              <h3 className="font-medium text-muted-foreground text-sm">
                {t('accuracy.compare.title')}
              </h3>
              <table className="table-list" data-testid="accuracy-compare">
                <thead>
                  <tr>
                    <th />
                    <th className="num">{t('accuracy.compare.before')}</th>
                    <th className="num">{t('accuracy.compare.after')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t('calibration.scaleX')}</td>
                    <td className="num">{signed((before.scaleX - 1) * 100, 3)} %</td>
                    <td className="num">{signed((r.scaleX - 1) * 100, 3)} %</td>
                  </tr>
                  <tr>
                    <td>{t('calibration.scaleY')}</td>
                    <td className="num">{signed((before.scaleY - 1) * 100, 3)} %</td>
                    <td className="num">{signed((r.scaleY - 1) * 100, 3)} %</td>
                  </tr>
                  <tr>
                    <td>{t('accuracy.compare.lean')}</td>
                    <td className="num">{signed(perMetre(before.squareness), 2)}</td>
                    <td className="num">{signed(perMetre(r.squareness), 2)}</td>
                  </tr>
                </tbody>
              </table>
              {verdict ? (
                <Alert
                  variant={VERDICT_VARIANT[verdict]}
                  data-testid="accuracy-verdict"
                  data-verdict={verdict}
                >
                  {t(`accuracy.verdict.${verdict}` as MessageKey)}
                </Alert>
              ) : null}
            </>
          ) : null}
          {verdict !== 'good' ? (
            <CorrectionPanel
              first={r}
              turned={null}
              precise
              blocked={waiting}
              onApplied={(corrections: Correction[]) =>
                // The measurement no longer describes the machine – and must not be evaluated again: that would
                // correct the corrected values a second time. It is kept as "before"; the fields start empty.
                a.set({
                  result: null,
                  measured: { ...EMPTY },
                  cutLoaded: false,
                  sawUnhomed: false,
                  homedAgain: false,
                  before: {
                    scaleX: r.scaleX,
                    scaleY: r.scaleY,
                    squareness: r.squareness,
                    sizeX: nominal.x,
                    sizeY: nominal.y,
                    at: new Date().toISOString(),
                    corrections: corrections.map((c) => ({ path: c.path, from: c.from, to: c.to })),
                  },
                })
              }
            />
          ) : null}
        </>
      ) : null}
      {before ? (
        <Button
          variant="outline"
          data-testid="accuracy-restart"
          onClick={() =>
            a.set({
              before: null,
              result: null,
              measured: { ...EMPTY },
              cutLoaded: false,
              sawUnhomed: false,
              homedAgain: false,
            })
          }
        >
          {t('accuracy.discardBefore')}
        </Button>
      ) : null}
    </Card>
  );
}
