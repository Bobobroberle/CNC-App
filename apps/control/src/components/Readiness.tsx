import { CheckIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { t, tDynamic } from '../i18n';
import { reveal } from '../lib/reveal';
import type { ReadinessItem } from '../lib/readiness';
import { useJigs } from '../store/jigs';
import { showTable, useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { otherCollisions, useReadiness } from '../store/readiness';
import { useSections } from '../store/sections';
import { useStageTools } from '../store/tools';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { useCanMeasure } from './JigCard';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';

/** Shows a card of the page, unfolding what it lies in (it may be under "Mehr Optionen"). */
const show = (anchor: string) => reveal([anchor]);
/** Scrolls to a flow's card at the top of the step (never folded). */
const showCard = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** Shows a clamp on the table, selected, with the tool that moves it. */
function showClamp(index: number | undefined) {
  showTable();
  useStageTools.getState().select('clamp');
  useStageTools.getState().selectZone(index ?? null);
}

/**
 * The job of a jig that has to be measured (again): one hold does it when the
 * camera has seen the jig; else the card at the top says how to get there.
 */
function JigAction() {
  const jigId = useJigs((s) => s.loaded?.jigId);
  const onTable = useJigs((s) => {
    const jig = useWorkshop.getState().jigs.find((j) => j.id === s.loaded?.jigId);
    return jig?.tags.some((tag) => s.seen.some((x) => x.id === tag.id)) ?? false;
  });
  const ready = useCanMeasure();
  if (!jigId) return null;
  return onTable ? (
    <HoldButton disabled={!ready} onConfirm={() => void useJigs.getState().measure(jigId)}>
      {t('ready.toJig')}
    </HoldButton>
  ) : (
    <Button variant="outline" size="sm" onClick={() => showCard('jig-card')}>
      {t('ready.show')}
    </Button>
  );
}

/** The fix for an open item, right next to it. */
function ItemAction({ item }: { item: ReadinessItem }) {
  const go = useUi((s) => s.go);
  const online = useMachine((s) => s.connection === 'connected');
  if (item.level === 'ok') return null;
  switch (item.id) {
    case 'connection':
      return (
        <Button variant="outline" size="sm" onClick={() => go('settings', 'connection')}>
          {t('ready.toConnect')}
        </Button>
      );
    case 'homed':
      return (
        <HoldButton disabled={!online} onConfirm={() => useMachine.getState().home()}>
          {t('ready.toHome')}
        </HoldButton>
      );
    case 'errors':
    case 'controller':
      return (
        <Button variant="outline" size="sm" onClick={() => show('diagnostics')}>
          {t('ready.show')}
        </Button>
      );
    case 'travel':
      // A part longer than the table: the way out is right here.
      return item.key === 'outsideLong' ? (
        <Button
          size="sm"
          onClick={() => {
            useSections.getState().begin();
            requestAnimationFrame(() => show('sections'));
          }}
        >
          {t('ready.toSections')}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => show('workspace-check')}>
          {t('ready.show')}
        </Button>
      );
    case 'sections':
      return (
        <Button variant="outline" size="sm" onClick={() => show('sections')}>
          {t('ready.toSectionsFlow')}
        </Button>
      );
    case 'zero':
      return (
        <Button variant="outline" size="sm" onClick={() => go('setup', 'zero')}>
          {t('ready.toZero')}
        </Button>
      );
    case 'collisions':
      return (
        <Button variant="outline" size="sm" onClick={() => go('setup', 'zero')}>
          {t('ready.toSetup')}
        </Button>
      );
    case 'clamp':
      return (
        <Button variant="outline" size="sm" onClick={() => showClamp(item.ref)}>
          {t('ready.show')}
        </Button>
      );
    case 'flip':
      return (
        <Button variant="outline" size="sm" onClick={() => showCard('flip-card')}>
          {t('ready.toFlip')}
        </Button>
      );
    case 'series':
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            go('job', 'prepare');
            useUi.getState().setDrawing(true);
          }}
        >
          {t('ready.toSeries')}
        </Button>
      );
    case 'jig':
      return <JigAction />;
    case 'depth':
      return (
        <Button variant="outline" size="sm" onClick={() => go('job', 'prepare')}>
          {t('ready.toStock')}
        </Button>
      );
    case 'tools':
    case 'limits':
      return (
        <Button variant="outline" size="sm" onClick={() => show('job-tools')}>
          {t('ready.toTools')}
        </Button>
      );
    case 'profile':
      return (
        <Button variant="outline" size="sm" onClick={() => go('settings', 'machine')}>
          {t('ready.toProfile')}
        </Button>
      );
    default:
      return null;
  }
}

const LEVEL_ICON = { ok: CheckIcon, warn: TriangleAlertIcon, block: XIcon } as const;

function LevelIcon({ level }: { level: ReadinessItem['level'] }) {
  const Sign = LEVEL_ICON[level];
  return (
    <span
      className={`check-sign check-sign-${level}`}
      role="img"
      aria-label={t(`ready.levels.${level}`)}
    >
      <Sign aria-hidden="true" className="size-5" />
    </span>
  );
}

/** Everything that decides the start, green, yellow or red, each with its fix. */
export function ReadinessCard() {
  const readiness = useReadiness();
  if (!readiness) return null;
  const { items, collisions, clamps } = readiness;
  return (
    <Card className="gap-3 p-4" data-testid="readiness" data-find="readiness">
      <CardTitle render={<h2 />}>{t('ready.title')}</CardTitle>
      <ul className="checklist" data-testid="assistant-checks">
        {items.map((item) => (
          <li
            key={`${item.id}-${item.ref ?? ''}`}
            className={`check-${item.level}`}
            data-check={item.id}
          >
            {/* Never by colour alone (DESIGN.md §7): each state has its own sign. */}
            <LevelIcon level={item.level} />
            <span className="check-text">
              {tDynamic(`ready.${item.key}`, 'ready.offline', item.params)}
              {item.id === 'collisions' ? (
                <span className="text-muted-foreground text-sm">
                  {' '}
                  {otherCollisions(collisions, clamps)
                    .slice(0, 3)
                    .map(
                      (c) =>
                        `${t(`collision.${c.kind}`)} (${c.object === 'stock' ? t('collision.stock') : c.object}, ${t('status.line')} ${c.lineIndex + 1})`,
                    )
                    .join('; ')}
                </span>
              ) : null}
            </span>
            <ItemAction item={item} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
