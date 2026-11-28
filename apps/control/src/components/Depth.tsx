import type { ReactNode } from 'react';
import { t } from '../i18n';
import { useUi, type Depth as Level } from '../store/ui';
import { Badge } from '../ui/badge';
import { Fold } from './Fold';

/**
 * The depth of a panel (DESIGN.md §2): what is needed every time stands
 * above; "Mehr Optionen" holds the important process parameters, "Alle
 * Parameter" everything else. No user levels: each area unfolds by itself
 * and remembers how far it was unfolded (`useUi.depth`).
 */
export function Depth({
  area,
  more,
  all,
}: {
  /** The area whose depth this is, e.g. `run` */
  area: string;
  more?: ReactNode;
  all?: ReactNode;
}) {
  const level: Level = useUi((s) => s.depth[area] ?? 'simple');
  const { setDepth } = useUi.getState();
  const allFold = all ? (
    <Fold
      title={t('depth.all')}
      open={level === 'all'}
      onOpenChange={(open) => setDepth(area, open ? 'all' : more ? 'more' : 'simple')}
      testId={`depth-all-${area}`}
    >
      {all}
    </Fold>
  ) : null;
  if (!more) return allFold;
  return (
    <Fold
      title={t('depth.more')}
      open={level !== 'simple'}
      onOpenChange={(open) => setDepth(area, open ? 'more' : 'simple')}
      testId={`depth-more-${area}`}
    >
      {more}
      {allFold}
    </Fold>
  );
}

/** Marks a value as the recommended one (§2: pre-filled and said so). */
export function Recommended() {
  return (
    <Badge variant="outline" className="rec-mark">
      {t('depth.recommended')}
    </Badge>
  );
}

/**
 * A dot at a value that differs from the recommendation: seen, not prevented (§2). Where the value it is compared with
 * is not a recommendation but a value of the drawing (a colour's field against the drawing's setting), `from="drawing"`
 * says so – "Weicht von der Zeichnung ab (6 mm)" – and `recommended` is that value, with its unit.
 */
export function Deviation({
  recommended,
  from = 'recommendation',
}: {
  recommended: string;
  from?: 'recommendation' | 'drawing';
}) {
  const text = t(from === 'drawing' ? 'depth.deviatesDrawing' : 'depth.deviates', {
    value: recommended,
  });
  return (
    <span className="deviation-dot" title={text}>
      <span aria-hidden="true" className="deviation-dot-mark" />
      <span className="sr-only">{text}</span>
    </span>
  );
}
