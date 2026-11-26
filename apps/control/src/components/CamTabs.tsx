import { useState } from 'react';
import { t } from '../i18n';
import type { CamItem } from '../lib/camItems';
import { looseContours, TAB_LIMITS, tabsMissing, tabValues } from '../lib/camTabs';
import { useCam } from '../store/cam';
import { mm, NumberField } from './camParts';
import { Deviation } from './Depth';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/**
 * The holding tabs of one part (its "Haltestege" box is on): how they are spread – by count, evenly,
 * or by hand –, their own width, height and count (empty takes the drawing's default, a deviation is
 * marked), and the way to put them on the table with a finger. The tabs themselves are drawn on the
 * table beside the part, in their true width.
 */
export function CamTabs({ item, n }: { item: CamItem; n: number }) {
  const defaults = useCam((s) => s.settings.tabs);
  const placing = useCam((s) => s.placing === item.id);
  const [tooMany, setTooMany] = useState(false);
  const cam = useCam.getState();
  const spec = item.tabSpec;
  const { mode } = tabValues(item, defaults);
  const manual = mode === 'manual';
  // The contours cut free without a tab, of all there are to hold (a grid has one per hole)
  const loose = looseContours(item, defaults);
  const closed = item.contours.filter((c) => c.closed).length;
  const differs = (own: number | undefined, usual: number) => own !== undefined && own !== usual;

  const field = (
    key: 'count' | 'width' | 'height',
    visible: string,
    name: string,
    usual: number,
    min: number,
  ) => (
    <Field>
      <FieldLabel>
        {visible}
        {differs(spec?.[key], usual) ? <Deviation recommended={mm(usual)} /> : null}
      </FieldLabel>
      <NumberField
        bare
        label={{ text: name }}
        value={spec?.[key]}
        min={min}
        placeholder={mm(usual)}
        onChange={(v) => cam.setTabs(item.id, { [key]: v })}
      />
    </Field>
  );

  return (
    <div
      className="cam-tabs"
      role="group"
      aria-label={t('cam.tabPanel', { n })}
      data-testid="cam-tabs"
      data-find="cam-tabs"
      data-mode={mode}
    >
      <SegmentedControl
        role="group"
        aria-label={t('cam.tabMode', { n })}
        className="w-full *:flex-1"
      >
        <SegmentedControlItem
          pressed={!manual}
          data-testid="cam-tabs-auto"
          onClick={() => {
            setTooMany(false);
            cam.spreadTabs(item.id);
          }}
        >
          {t('cam.tabAuto')}
        </SegmentedControlItem>
        <SegmentedControlItem
          pressed={manual}
          data-testid="cam-tabs-manual"
          onClick={() => setTooMany(!cam.manualTabs(item.id))}
        >
          {t('cam.tabManual')}
        </SegmentedControlItem>
      </SegmentedControl>
      <div className="cam-tabs-fields">
        {manual
          ? null
          : field(
              'count',
              t('cam.tabCountField'),
              t('cam.tabCountOf', { n }),
              defaults.count,
              TAB_LIMITS.count.min,
            )}
        {field(
          'width',
          t('cam.tabWidthField'),
          t('cam.tabWidthOf', { n }),
          defaults.width,
          TAB_LIMITS.width.min,
        )}
        {field(
          'height',
          t('cam.tabHeightField'),
          t('cam.tabHeightOf', { n }),
          defaults.height,
          TAB_LIMITS.height.min,
        )}
      </div>
      <p className="text-muted-foreground text-sm">{t('cam.tabNote')}</p>
      <div className="cam-tabs-actions">
        {manual ? (
          <Button
            variant="outline"
            pressed={placing}
            data-testid="cam-tabs-place"
            onClick={() => cam.setPlacing(placing ? null : item.id)}
          >
            {t('cam.tabPlace')}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={!manual}
          reason={t('cam.tabSpreadAuto')}
          data-testid="cam-tabs-spread"
          onClick={() => {
            setTooMany(false);
            cam.spreadTabs(item.id);
          }}
        >
          {t('cam.tabSpread')}
        </Button>
      </div>
      {manual && placing ? (
        <p className="text-muted-foreground text-sm" data-testid="cam-tabs-hint">
          {t('cam.tabPlaceHint', { max: TAB_LIMITS.places })}
        </p>
      ) : null}
      {tooMany ? (
        <Alert variant="warning" data-testid="cam-tabs-toomany">
          {t('cam.tabTooMany', { max: TAB_LIMITS.places })}
        </Alert>
      ) : null}
      {tabsMissing(item, defaults) ? (
        <Alert variant="warning" data-testid="cam-tabs-warning">
          {manual
            ? loose.length === closed
              ? t('cam.tabNone')
              : t('cam.tabSome', { n: loose.length, m: closed })
            : t('cam.tabZero')}
        </Alert>
      ) : null}
    </div>
  );
}
