import { MIN_PECK } from '@lowrider/cam';
import { t } from '../i18n';
import { hasOrder, isCutKind, type CutPlace } from '../lib/camOrder';
import {
  ENTRIES,
  helixRange,
  PATH_LIMITS,
  takesEntry,
  takesPeck,
  type Entry,
} from '../lib/camPath';
import type { CamItem } from '../lib/camItems';
import { formatNumber } from '../lib/format';
import { useCam } from '../store/cam';
import { useItemDiameter } from '../store/camTools';
import { useUi } from '../store/ui';
import { mm, NumberField } from './camParts';
import { Fold } from './Fold';
import { Button } from '../ui/button';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/**
 * How the one part that is selected is cut, where it has a choice: a pocket is entered by ramp (as ever), on a
 * helix or straight down; a hole is drilled in one go or in steps (peck drilling, with or without a retract
 * that breaks the chip). Folded away until it is wanted – nothing here is needed every time – and open again
 * as it was left (`useUi.depth`). What a part does not have a choice in has no panel; every choice is one
 * step of undo and makes the toolpath anew.
 */
export function PathPanel({ item, n }: { item: CamItem; n: number }) {
  const open = useUi((s) => s.depth.camPath === 'more');
  const change = (next: boolean) => useUi.getState().setDepth('camPath', next ? 'more' : 'simple');
  // (the anchors are written out: the search's table is held against them in the sources)
  if (takesEntry(item.kind)) {
    return (
      <Fold
        title={t('cam.path.entryTitle')}
        find="cam-path-entry"
        testId="cam-path"
        open={open}
        onOpenChange={change}
      >
        <Entering item={item} n={n} />
      </Fold>
    );
  }
  if (takesPeck(item.kind)) {
    return (
      <Fold
        title={t('cam.path.peckTitle')}
        find="cam-path-peck"
        testId="cam-path"
        open={open}
        onOpenChange={change}
      >
        <Drilling item={item} />
      </Fold>
    );
  }
  return null;
}

/** How a pocket is entered: the three ways, what each means, and for the helix the width of its hole. */
function Entering({ item, n }: { item: CamItem; n: number }) {
  // The cutter this part is cut with: the helix is held to its range
  const tool = useItemDiameter(item);
  const cam = useCam.getState();
  const entry: Entry = item.entry ?? 'ramp';
  const range = helixRange(tool);
  return (
    <div className="contents">
      <SegmentedControl
        role="group"
        aria-label={t('cam.path.entry', { n })}
        className="w-full *:flex-1"
      >
        {ENTRIES.map((e) => (
          <SegmentedControlItem
            key={e}
            pressed={entry === e}
            data-testid={`cam-entry-${e}`}
            onClick={() => cam.setPath(item.id, { entry: e })}
          >
            {t(`cam.path.entries.${e}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <p className="text-muted-foreground text-sm" data-testid="cam-entry-note">
        {t(`cam.path.${entry}Note`)}
      </p>
      {entry === 'helix' ? (
        <>
          <NumberField
            key={`${item.id}helix`}
            label="cam.path.helixDiameter"
            value={item.helixDiameter}
            min={PATH_LIMITS.helixDiameter.min}
            placeholder={mm(range.usual)}
            onChange={(v) => cam.setPath(item.id, { helixDiameter: v })}
          />
          <p className="text-muted-foreground text-sm" data-testid="cam-helix-note">
            {t('cam.path.helixDiameterNote', {
              usual: mm(range.usual),
              least: mm(range.least),
              most: mm(range.most),
            })}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** How a hole is drilled: in one go, or in steps – with the retract between them, which breaks the chip. */
function Drilling({ item }: { item: CamItem }) {
  const cam = useCam.getState();
  return (
    <div className="contents">
      <div className="grid grid-cols-2 gap-2 items-end">
        <NumberField
          key={`${item.id}peck`}
          label="cam.path.peck"
          value={item.peck}
          min={PATH_LIMITS.peck.min}
          placeholder={t('cam.path.off')}
          onChange={(v) => cam.setPath(item.id, { peck: v })}
        />
        <NumberField
          key={`${item.id}retract`}
          label="cam.path.peckRetract"
          value={item.peckRetract}
          min={PATH_LIMITS.peckRetract.min}
          placeholder={t('cam.path.fullRetract')}
          disabled={item.peck === undefined}
          reason={t('cam.path.peckRetractNeedsPeck')}
          onChange={(v) => cam.setPath(item.id, { peckRetract: v })}
        />
      </div>
      <p className="text-muted-foreground text-sm" data-testid="cam-peck-note">
        {t('cam.path.peckNote', { min: formatNumber(MIN_PECK, 2) })}
      </p>
    </div>
  );
}

/**
 * Where the selected part comes among the parts cut the same way – "Schnitt 2 von 5 (Bohrungen)", read from the
 * program that was made – and the way to move it one place earlier or later, to give it back to the route
 * (Automatisch) or to take every number away. The kinds follow each other as always and what lies inside a
 * contour is cut before it: the hint says so, and a wish that would break it is told as a note below.
 * `single` is the one part that is selected, `group` says a group of several parts is.
 */
export function OrderPanel({
  single,
  group,
  place,
}: {
  single: CamItem | null;
  group: boolean;
  place: CutPlace | undefined;
}) {
  const open = useUi((s) => s.depth.camOrder === 'more');
  const items = useCam((s) => s.project?.items);
  const cam = useCam.getState();
  const numbered = items?.filter((i) => i.seq !== undefined).length ?? 0;
  const mine = single && isCutKind(single.kind) ? single : null;
  // Nothing to say: no part to place and nothing numbered
  if (!mine && !group && !(items && hasOrder(items))) return null;
  return (
    <Fold
      title={t('cam.order.title')}
      find="cam-order"
      testId="cam-order"
      open={open}
      onOpenChange={(next) => useUi.getState().setDepth('camOrder', next ? 'more' : 'simple')}
    >
      <div className="contents">
        {mine ? (
          <>
            <p className="tabular-nums" data-testid="cam-order-place">
              {place
                ? t('cam.order.place', {
                    n: place.n,
                    m: place.of,
                    kind: t(`cam.order.kinds.${place.kind}`),
                  })
                : t('cam.order.none')}
            </p>
            <div className="cam-actions">
              <Button
                variant="outline"
                aria-label={t('cam.order.earlierLabel')}
                disabled={!place || place.n === 1}
                reason={place ? t('cam.order.first') : t('cam.order.none')}
                data-testid="cam-order-earlier"
                onClick={() => cam.moveInOrder(mine.id, -1)}
              >
                {t('cam.order.earlier')}
              </Button>
              <Button
                variant="outline"
                aria-label={t('cam.order.laterLabel')}
                disabled={!place || place.n === place.of}
                reason={place ? t('cam.order.last') : t('cam.order.none')}
                data-testid="cam-order-later"
                onClick={() => cam.moveInOrder(mine.id, 1)}
              >
                {t('cam.order.later')}
              </Button>
              <Button
                variant="outline"
                aria-label={t('cam.order.autoLabel')}
                disabled={mine.seq === undefined}
                reason={t('cam.order.noNumber')}
                data-testid="cam-order-auto"
                onClick={() => cam.clearOrder(mine.id)}
              >
                {t('cam.order.auto')}
              </Button>
            </div>
          </>
        ) : group ? (
          <p className="text-muted-foreground text-sm">{t('cam.order.group')}</p>
        ) : null}
        <p className="text-muted-foreground text-sm">{t('cam.order.hint')}</p>
        {/* Always there while the panel is (closed, with its reason, where no part has a number): the first number
            must not make the card taller and push the list below it away – the order is changed with the finger here */}
        <div className="flex flex-col gap-2">
          <p className="text-sm" data-testid="cam-order-counted">
            {numbered > 0 ? t('cam.order.counted', { n: numbered }) : t('cam.order.countedNone')}
          </p>
          <Button
            variant="outline"
            disabled={numbered === 0}
            reason={t('cam.order.noNumbers')}
            data-testid="cam-order-reset"
            onClick={() => cam.clearOrder()}
          >
            {t('cam.order.reset')}
          </Button>
        </div>
      </div>
    </Fold>
  );
}
