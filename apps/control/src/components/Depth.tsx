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

/** A dot at a value that differs from the recommendation: seen, not prevented (§2). */
export function Deviation({ recommended }: { recommended: string }) {
  return (
    <span className="deviation-dot" title={t('depth.deviates', { value: recommended })}>
      <span aria-hidden="true" className="deviation-dot-mark" />
      <span className="sr-only">{t('depth.deviates', { value: recommended })}</span>
    </span>
  );
}
