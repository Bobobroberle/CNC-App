import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { quickReason } from '../lib/jog';
import { newId } from '../lib/persist';
import { addWaypoint, MAX_WAYPOINTS, removeWaypoint } from '../lib/spots';
import { goToWaypoint } from '../store/jog';
import { useMachine } from '../store/machine';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Reason } from '../ui/tooltip';
import { HoldButton } from './HoldButton';

/**
 * Places the operator remembers by name (the clamp's stop, the spot where the sacrificial board is
 * changed): machine X/Y, stored from where the machine stands, driven to by a hold that lifts first.
 */
export function WaypointsCard() {
  const points = useWorkshop((s) => s.settings.waypoints);
  const connected = useMachine((s) => s.connection === 'connected');
  const state = useMachine((s) => s.status?.state);
  const homed = useMachine((s) => s.homed);
  const mpos = useMachine((s) => s.status?.mpos);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<'name' | 'full' | null>(null);
  // The same chain of reasons as the quick actions: no link, a machine that moves, not homed
  const go = quickReason('change', {
    connected,
    state,
    homed,
    zeroSet: true,
    park: true,
    change: true,
  });
  // Before homing the machine's coordinates are not the table's: a place stored then is a wrong place after
  const saveReason = !mpos ? t('jog.reason.offline') : !homed ? t('jog.reason.notHomed') : null;
  const store = () => {
    if (!mpos) return;
    const at = { x: mpos[0] ?? 0, y: mpos[1] ?? 0 };
    const next = addWaypoint(points, name, at, newId('wp'));
    if (typeof next === 'string') {
      setProblem(next);
      return;
    }
    useWorkshop.getState().setSettings({ waypoints: next });
    useMachine.getState().addLog(
      'info',
      t('jog.waypoints.saved', {
        name: name.trim(),
        x: formatNumber(at.x, 1),
        y: formatNumber(at.y, 1),
      }),
    );
    setName('');
    setProblem(null);
  };
  return (
    <Card className="gap-3 p-4" data-testid="waypoints-card" data-find="waypoints">
      <CardTitle render={<h2 />}>{t('jog.waypoints.title')}</CardTitle>
      {points.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('jog.waypoints.empty')}</p>
      ) : (
        <ul className="parts" data-testid="waypoints-list">
          {points.map((w) => (
            <li key={w.id} className="part">
              <div className="min-w-0">
                <strong>{w.name}</strong>
                <div className="text-muted-foreground text-sm tabular-nums">
                  {t('jog.waypoints.at', { x: formatNumber(w.x, 1), y: formatNumber(w.y, 1) })}
                </div>
              </div>
              <div className="flex gap-2">
                <Reason reason={go ? t(go) : null}>
                  <HoldButton disabled={go !== null} onConfirm={() => void goToWaypoint(w.id)}>
                    {t('jog.waypoints.go', { name: w.name })}
                  </HoldButton>
                </Reason>
                <Button
                  variant="outline"
                  aria-label={t('jog.waypoints.remove', { name: w.name })}
                  onClick={() =>
                    useWorkshop.getState().setSettings({ waypoints: removeWaypoint(points, w.id) })
                  }
                >
                  ×
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Field>
        <FieldLabel>{t('jog.waypoints.name')}</FieldLabel>
        <Input
          type="text"
          value={name}
          maxLength={40}
          onChange={(e) => {
            setName(e.target.value);
            setProblem(null);
          }}
        />
      </Field>
      {problem === 'name' ? (
        <p className="text-sm text-warning-foreground">{t('jog.waypoints.needName')}</p>
      ) : null}
      {problem === 'full' ? (
        <p className="text-sm text-warning-foreground">
          {t('jog.waypoints.full', { max: MAX_WAYPOINTS })}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">{t('jog.waypoints.hint')}</p>
      <Reason reason={saveReason}>
        <Button
          reason="missing"
          variant="outline"
          className="w-full"
          disabled={saveReason !== null}
          onClick={store}
        >
          {t('jog.waypoints.set')}
        </Button>
      </Reason>
    </Card>
  );
}
