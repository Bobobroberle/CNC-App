import { WCS_CODES } from '@lowrider/workshop';
import { t } from '../i18n';
import { formatCoordinate } from '../lib/format';
import { useMachine } from '../store/machine';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/** Coordinate systems G54 … G59: one zero per clamping position. */
export function WcsCard() {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const parser = useMachine((s) => s.parserState);
  const offsets = useMachine((s) => s.offsets);
  const { setWcs, refreshState } = useMachine.getState();
  const active = parser?.wcs ?? null;
  const offset = active ? offsets?.wcs[active as (typeof WCS_CODES)[number]] : undefined;

  return (
    <Card className="gap-3 p-4" data-testid="wcs-card" data-find="wcs">
      <CardTitle render={<h2 />}>{t('wcs.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('wcs.hint')}</p>
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('wcs.title')}
      >
        {WCS_CODES.map((code) => (
          <SegmentedControlItem
            key={code}
            pressed={active === code}
            disabled={!idle}
            onClick={() => void setWcs(code)}
          >
            {code}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {offset ? (
        <p className="tabular-nums">
          {t('wcs.offset', { wcs: active! })}: X {formatCoordinate(offset.x, 3)} · Y{' '}
          {formatCoordinate(offset.y, 3)} · Z {formatCoordinate(offset.z, 3)}
        </p>
      ) : null}
      {offsets?.tlo ? (
        <p className="text-muted-foreground text-sm">
          {t('wcs.tlo', { mm: formatCoordinate(offsets.tlo, 3) })}
        </p>
      ) : null}
      <Button
        reason="machine"
        variant="outline"
        disabled={!idle}
        onClick={() => void refreshState()}
      >
        {t('wcs.refresh')}
      </Button>
    </Card>
  );
}
