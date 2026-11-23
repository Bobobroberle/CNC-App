import { t } from '../i18n';
import { useMachine } from '../store/machine';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';

const ZERO = ['X', 'Y', 'Z', 'XY', 'XYZ'] as const;

/** Work zero at the current position, like the Ø buttons of the WebUI. */
export function ZeroCard() {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const { zero } = useMachine.getState();

  return (
    <Card className="gap-3 p-4" data-find="zero">
      <CardTitle render={<h2 />}>{t('drive.zero')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('drive.zeroHint')}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
        {ZERO.map((axes) => (
          <Button
            reason="machine"
            key={axes}
            variant="outline"
            disabled={!idle}
            onClick={() => void zero(axes)}
          >
            {axes} = 0
          </Button>
        ))}
      </div>
    </Card>
  );
}
