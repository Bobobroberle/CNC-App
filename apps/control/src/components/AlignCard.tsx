import { compose, rotation as turnAbout, translation } from '@lowrider/cam';
import { transformProgram } from '@lowrider/gcode-core';
import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatNumber, parseNumber } from '../lib/format';
import { useJob } from '../store/job';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Fold } from './Fold';

const num = (s: string) => (s.trim() === '' ? 0 : parseNumber(s));

/**
 * Turns and shifts the job to match a workpiece that lies askew – in the
 * G-code, because FluidNC has no G68.
 */
export function AlignCard() {
  const analysis = useJob((s) => s.analysis);
  const fileName = useJob((s) => s.fileName);
  const lines = useJob((s) => s.lines);
  const original = useJob((s) => s.original);
  const measured = useJob((s) => s.measuredAngle);
  const { loadDerived, restoreOriginal } = useJob.getState();
  const [rotation, setRotation] = useState('');
  const [dx, setDx] = useState('');
  const [dy, setDy] = useState('');
  const [pivot, setPivot] = useState<'zero' | 'center'>('zero');

  const transform = useMemo(() => {
    if (!analysis) return null;
    const b = analysis.cutBounds;
    const center = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
    return {
      rotation: num(rotation),
      offset: { x: num(dx), y: num(dy) },
      pivot: pivot === 'zero' ? { x: 0, y: 0 } : center,
    };
  }, [analysis, rotation, dx, dy, pivot]);

  const preview = useMemo(() => {
    if (
      !transform ||
      !fileName ||
      [transform.rotation, transform.offset.x, transform.offset.y].some((v) => !Number.isFinite(v))
    ) {
      return null;
    }
    try {
      return transformProgram(lines.join('\n'), transform);
    } catch {
      return null;
    }
  }, [transform, lines, fileName]);

  if (!analysis || !fileName) return null;
  const unchanged =
    transform !== null &&
    transform.rotation === 0 &&
    transform.offset.x === 0 &&
    transform.offset.y === 0;

  return (
    <Fold variant="card" title={t('align.title')} testId="align-card" find="align">
      <p className="text-muted-foreground text-sm">{t('align.hint')}</p>
      {measured !== null ? (
        <Button variant="outline" onClick={() => setRotation(String(Number(measured.toFixed(3))))}>
          {t('align.useMeasured', { angle: formatNumber(measured, 2) })}
        </Button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel>{t('align.rotation')}</FieldLabel>
          <Input
            type="text"
            inputMode="decimal"
            value={rotation}
            onChange={(e) => setRotation(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t('align.dx')}</FieldLabel>
          <Input
            type="text"
            inputMode="decimal"
            value={dx}
            onChange={(e) => setDx(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t('align.dy')}</FieldLabel>
          <Input
            type="text"
            inputMode="decimal"
            value={dy}
            onChange={(e) => setDy(e.target.value)}
          />
        </Field>
      </div>
      <SegmentedControl role="group" aria-label={t('align.pivot')}>
        {(['zero', 'center'] as const).map((p) => (
          <SegmentedControlItem key={p} pressed={pivot === p} onClick={() => setPivot(p)}>
            {t(`align.pivots.${p}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {preview ? (
        <p className="text-muted-foreground text-sm">
          {t('align.diagnostics', { count: preview.diagnostics.length })}
        </p>
      ) : null}
      <Button
        reason="missing"
        disabled={!preview || unchanged}
        onClick={() =>
          preview &&
          loadDerived(`${fileName.replace(/\.[^.]*$/, '')}_ausgerichtet.nc`, preview.text, {
            // Turned about the pivot, then shifted – counted from the program as it stands.
            by: compose(
              translation(transform!.offset.x, transform!.offset.y),
              turnAbout(transform!.rotation, transform!.pivot),
            ),
            from: 'current',
          })
        }
      >
        {t('align.apply')}
      </Button>
      {original ? (
        <Button variant="outline" onClick={restoreOriginal}>
          {t('align.restore', { name: original.fileName })}
        </Button>
      ) : null}
      {transform && !unchanged ? (
        <p className="text-muted-foreground text-sm tabular-nums">
          {t('align.summary', {
            angle: formatNumber(transform.rotation, 2),
            x: formatCoordinate(transform.offset.x, 2),
            y: formatCoordinate(transform.offset.y, 2),
          })}
        </p>
      ) : null}
    </Fold>
  );
}
