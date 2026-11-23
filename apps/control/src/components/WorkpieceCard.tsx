import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { defaultStock, stockFromSize } from '../lib/setup';
import { useJob } from '../store/job';
import { useWorkshop } from '../store/workshop';
import { Depth, Deviation, Recommended } from './Depth';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const num = (s: string) => parseNumber(s);

/**
 * ① Job, the workpiece: its material and its size. Both are the base of the
 * recommended cutting values (② Werkzeuge) and of the checks (④ Prüfen). The
 * size the job itself needs is the recommendation; a typed one is marked.
 */
export function WorkpieceCard() {
  const analysis = useJob((s) => s.analysis);
  const materials = useWorkshop((s) => s.materials);
  const setup = useWorkshop((s) => s.setup);
  const { setSetup } = useWorkshop.getState();
  const [size, setSize] = useState({ x: '', y: '', z: '' });
  if (!analysis) return null;
  const stock = setup.stock ?? defaultStock(analysis.cutBounds);
  return (
    <Card className="gap-3 p-4" data-testid="setup-material" data-find="setup-material">
      <CardTitle render={<h2 />}>{t('assistant.steps.material')}</CardTitle>

      <p>{t('assistant.materialQuestion')}</p>
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('assistant.steps.material')}
      >
        {materials.map((m) => (
          <SegmentedControlItem
            key={m.id}
            pressed={setup.materialId === m.id}
            onClick={() => setSetup({ materialId: m.id })}
          >
            {m.name}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <h3 className="font-medium text-muted-foreground text-sm" data-find="stock">
        {t('assistant.stock')}
      </h3>
      <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
        {setup.stock ? <Deviation recommended={t('assistant.sizeFromJob')} /> : <Recommended />}
        {setup.stock ? t('assistant.stockEntered') : t('assistant.stockFromJob')}{' '}
        {stock
          ? `X ${formatNumber(stock.max.x - stock.min.x, 1)} × Y ${formatNumber(stock.max.y - stock.min.y, 1)} × Z ${formatNumber(stock.max.z - stock.min.z, 1)} mm`
          : '—'}
      </p>
      {/* The numbers are the finer level: the size the job needs is there without them. */}
      <Depth
        area="workpiece"
        more={
          <>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y', 'z'] as const).map((a) => (
                <Field key={a}>
                  <FieldLabel>{t(`assistant.size.${a}`)}</FieldLabel>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={size[a]}
                    onChange={(e) => setSize({ ...size, [a]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
            {/* One below the other: side by side the long label wraps into four lines on a tablet. */}
            <Button
              reason="missing"
              variant="outline"
              disabled={![size.x, size.y, size.z].every((v) => num(v) > 0)}
              onClick={() =>
                setSetup({ stock: stockFromSize(num(size.x), num(size.y), num(size.z)) })
              }
            >
              {t('assistant.useSize')}
            </Button>
            <Button variant="outline" onClick={() => setSetup({ stock: null })}>
              {t('assistant.sizeFromJob')}
            </Button>
          </>
        }
      />
    </Card>
  );
}
