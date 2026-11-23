import { useEffect, useState } from 'react';
import { t, tDynamic } from '../i18n';
import { withHeight, zoneRadius, type ClampKind } from '../lib/clamps';
import { formatNumber, parseNumber } from '../lib/format';
import { removeZone, updateZone, useClampHits } from '../store/clamps';
import { useStageTools } from '../store/tools';
import { useWorkshop } from '../store/workshop';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const KINDS: ClampKind[] = ['clamp', 'screw'];
/** One press on − or + changes the height by this much, mm */
const HEIGHT_STEP = 5;

const HIT_KEYS = { cut: 'clampCut', rapid: 'clampRapid', low: 'clampLow' } as const;

/** Height of the selected zone: typed, or in steps of 5 mm. */
function HeightField({ index, height }: { index: number; height: number }) {
  const [text, setText] = useState(formatNumber(height, 0));
  // Another zone, or a change from the numeric editor: show its height.
  useEffect(() => setText(String(Number(height.toFixed(1))).replace('.', ',')), [index, height]);
  const set = (mm: number) => {
    const f = useWorkshop.getState().setup.fixtures[index];
    if (f && Number.isFinite(mm) && mm > 0) updateZone(index, withHeight(f, mm));
  };
  return (
    <div className="zone-height">
      <Button
        reason="missing"
        variant="outline"
        aria-label={t('stageTools.clamp.lower')}
        disabled={height <= HEIGHT_STEP}
        onClick={() => set(height - HEIGHT_STEP)}
      >
        −
      </Button>
      <Input
        type="text"
        inputMode="decimal"
        aria-label={t('stageTools.clamp.height')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          set(parseNumber(e.target.value));
        }}
      />
      <Button
        variant="outline"
        aria-label={t('stageTools.clamp.higher')}
        onClick={() => set(height + HEIGHT_STEP)}
      >
        +
      </Button>
    </div>
  );
}

/**
 * Marks what holds the workpiece: the next tap puts down a clamp or a screw,
 * the selected one gets its height and can be removed. Moving and resizing
 * happen on the picture itself.
 */
export function ClampPanel() {
  const kind = useStageTools((s) => s.clampKind);
  const zone = useStageTools((s) => s.zone);
  const fixtures = useWorkshop((s) => s.setup.fixtures);
  const hits = useClampHits();
  const f = zone === null ? undefined : fixtures[zone];
  const hit = hits.find((h) => h.fixture === zone);
  return (
    <>
      <div className="tool-head">
        <SegmentedControl role="group" aria-label={t('stageTools.clamp.kind')}>
          {KINDS.map((k) => (
            <SegmentedControlItem
              key={k}
              pressed={kind === k}
              onClick={() => useStageTools.getState().setClampKind(k)}
            >
              {t(`fixtures.kinds.${k}`)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        {f ? (
          <Button
            variant="outline"
            size="sm"
            className="tool-clear"
            aria-label={t('stageTools.clamp.deselect')}
            title={t('stageTools.clamp.deselect')}
            onClick={() => useStageTools.getState().selectZone(null)}
          >
            ×
          </Button>
        ) : null}
      </div>
      {f && zone !== null ? (
        <>
          <p className="tabular-nums" data-testid="zone-selected">
            <strong>{f.name}</strong>{' '}
            <span className="text-muted-foreground text-sm">
              {f.round
                ? t('stageTools.clamp.sizeRound', { d: formatNumber(2 * zoneRadius(f), 0) })
                : t('stageTools.clamp.sizeBox', {
                    x: formatNumber(f.max.x - f.min.x, 0),
                    y: formatNumber(f.max.y - f.min.y, 0),
                  })}
            </span>
          </p>
          <p className="text-muted-foreground text-sm tool-small">{t('stageTools.clamp.height')}</p>
          <div className="zone-row">
            <HeightField index={zone} height={f.max.z} />
            <Button variant="outline" onClick={() => removeZone(zone)}>
              {t('zeros.remove')}
            </Button>
          </div>
          {hit ? (
            <Alert variant="warning" data-testid="zone-warning">
              {tDynamic(`ready.${HIT_KEYS[hit.kind]}`, 'ready.clampCut', {
                name: f.name,
                mm: formatNumber(Math.max(0, hit.clearance), 1),
              })}
            </Alert>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground text-sm tool-hint">{t('stageTools.hints.clamp')}</p>
      )}
    </>
  );
}
