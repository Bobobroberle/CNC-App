import { XIcon } from 'lucide-react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { useMachine } from '../store/machine';
import { useUi } from '../store/ui';
import { useJobUnderWay } from '../store/underway';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Reason } from '../ui/tooltip';
import { CommandAck } from './Ack';
import { Depth } from './Depth';
import { HomingCard } from './HomingCard';
import { JogCard } from './JogCard';
import { MacroButtons } from './MacroButtons';
import { WaypointsCard } from './WaypointsCard';

/** What a stored place says on its card, translated: the park place and the tool change place look alike. */
interface SpotTexts {
  title: string;
  none: string;
  at: (x: string, y: string) => string;
  set: string;
  clear: string;
  hint: string;
  saved: (x: string, y: string) => string;
}

/** A place of the machine stored in the settings (machine X/Y): store it from where the machine stands, forget it. */
function SpotCard({
  field,
  testId,
  find,
  texts,
  lockedUnderJob,
}: {
  field: 'parkPosition' | 'toolChangePosition';
  testId: string;
  find: string;
  texts: SpotTexts;
  /** Why the place cannot be changed while a job is under way (the job drives to it); absent: it can */
  lockedUnderJob?: string;
}) {
  const spot = useWorkshop((s) => s.settings[field]);
  const homed = useMachine((s) => s.homed);
  const mpos = useMachine((s) => s.status?.mpos);
  const underway = useJobUnderWay();
  const locked = lockedUnderJob !== undefined && underway ? lockedUnderJob : null;
  const reason =
    locked ?? (!mpos ? t('jog.reason.offline') : !homed ? t('jog.reason.notHomed') : null);
  const store = () => {
    if (!mpos) return;
    const position = { x: Number((mpos[0] ?? 0).toFixed(3)), y: Number((mpos[1] ?? 0).toFixed(3)) };
    useWorkshop.getState().setSettings({ [field]: position });
    useMachine
      .getState()
      .addLog('info', texts.saved(formatNumber(position.x, 1), formatNumber(position.y, 1)));
  };
  return (
    <Card className="gap-3 p-4" data-testid={testId} data-find={find}>
      <CardTitle render={<h2 />}>{texts.title}</CardTitle>
      <p className="tabular-nums">
        {spot ? texts.at(formatNumber(spot.x, 1), formatNumber(spot.y, 1)) : texts.none}
      </p>
      <p className="text-muted-foreground text-sm">{texts.hint}</p>
      <div className="flex flex-wrap gap-2">
        <Reason reason={reason} className="flex-1">
          <Button
            reason="missing"
            variant="outline"
            className="w-full"
            disabled={reason !== null}
            onClick={store}
          >
            {texts.set}
          </Button>
        </Reason>
        {spot ? (
          <Reason reason={locked} className="flex-1">
            <Button
              variant="outline"
              className="w-full"
              reason="missing"
              disabled={locked !== null}
              onClick={() => useWorkshop.getState().setSettings({ [field]: null })}
            >
              {texts.clear}
            </Button>
          </Reason>
        ) : null}
      </div>
    </Card>
  );
}

/** Where the machine is parked: stored here, driven to by the quick action (a hold). */
function ParkCard() {
  return (
    <SpotCard
      field="parkPosition"
      testId="park-card"
      find="park"
      texts={{
        title: t('jog.park.title'),
        none: t('jog.park.none'),
        at: (x, y) => t('jog.park.at', { x, y }),
        set: t('jog.park.set'),
        clear: t('jog.park.clear'),
        hint: t('jog.park.hint'),
        saved: (x, y) => t('jog.park.saved', { x, y }),
      }}
    />
  );
}

/** Where tools are changed: the same place the settings hold, stored from where the machine stands. */
function ChangeSpotCard() {
  return (
    <SpotCard
      field="toolChangePosition"
      testId="change-card"
      find="change-spot"
      lockedUnderJob={t('jog.change.locked')}
      texts={{
        title: t('jog.change.title'),
        none: t('jog.change.none'),
        at: (x, y) => t('jog.change.at', { x, y }),
        set: t('jog.change.set'),
        clear: t('jog.change.clear'),
        hint: t('jog.change.hint'),
        saved: (x, y) => t('jog.change.saved', { x, y }),
      }}
    />
  );
}

/**
 * Jog / Manuell (DESIGN.md §3.3, §5): moving the axes by hand and the quick
 * actions – a panel that opens over the context panel from every screen and
 * closes again, leaving the screen behind it as it was. What is needed every
 * time stands open (cross, Z, step width, quick actions); the other ways of
 * moving, single axes, unlocking and the macros are "Mehr Optionen".
 */
export function JogPanel() {
  const close = () => useUi.getState().setJogOpen(false);
  return (
    <div className="flex flex-col gap-3" data-testid="jog-panel">
      <div className="panel-head">
        <h2 className="text-lg">{t('nav.jogTitle')}</h2>
        <Button variant="outline" onClick={close}>
          <XIcon aria-hidden="true" />
          {t('nav.jogClose')}
        </Button>
      </div>
      <JogCard />
      <CommandAck />
      <Depth
        area="jog"
        more={
          <>
            <ParkCard />
            <ChangeSpotCard />
            <WaypointsCard />
            <HomingCard />
            <MacroButtons />
          </>
        }
      />
    </div>
  );
}
