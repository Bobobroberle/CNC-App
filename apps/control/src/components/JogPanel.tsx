import { XIcon } from 'lucide-react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { useMachine } from '../store/machine';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Reason } from '../ui/tooltip';
import { CommandAck } from './Ack';
import { Depth } from './Depth';
import { HomingCard } from './HomingCard';
import { JogCard } from './JogCard';
import { MacroButtons } from './MacroButtons';

/** Where the machine is parked: stored here, driven to by the quick action (a hold). */
function ParkCard() {
  const park = useWorkshop((s) => s.settings.parkPosition);
  const homed = useMachine((s) => s.homed);
  const mpos = useMachine((s) => s.status?.mpos);
  const reason = !mpos ? t('jog.reason.offline') : !homed ? t('jog.reason.notHomed') : null;
  const store = () => {
    if (!mpos) return;
    const position = { x: Number((mpos[0] ?? 0).toFixed(3)), y: Number((mpos[1] ?? 0).toFixed(3)) };
    useWorkshop.getState().setSettings({ parkPosition: position });
    useMachine
      .getState()
      .addLog(
        'info',
        t('jog.park.saved', { x: formatNumber(position.x, 1), y: formatNumber(position.y, 1) }),
      );
  };
  return (
    <Card className="gap-3 p-4" data-testid="park-card" data-find="park">
      <CardTitle render={<h2 />}>{t('jog.park.title')}</CardTitle>
      <p className="tabular-nums">
        {park
          ? t('jog.park.at', { x: formatNumber(park.x, 1), y: formatNumber(park.y, 1) })
          : t('jog.park.none')}
      </p>
      <p className="text-muted-foreground text-sm">{t('jog.park.hint')}</p>
      <div className="flex flex-wrap gap-2">
        <Reason reason={reason} className="flex-1">
          <Button
            reason="missing"
            variant="outline"
            className="w-full"
            disabled={reason !== null}
            onClick={store}
          >
            {t('jog.park.set')}
          </Button>
        </Reason>
        {park ? (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => useWorkshop.getState().setSettings({ parkPosition: null })}
          >
            {t('jog.park.clear')}
          </Button>
        ) : null}
      </div>
    </Card>
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
            <HomingCard />
            <MacroButtons />
          </>
        }
      />
    </div>
  );
}
