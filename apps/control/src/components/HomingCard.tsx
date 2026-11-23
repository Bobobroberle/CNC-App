import type { JogAxis } from '@lowrider/fluidnc-client';
import { t } from '../i18n';
import { useMachine } from '../store/machine';
import { HoldButton } from './HoldButton';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Reason } from '../ui/tooltip';

const HOME_AXES: JogAxis[] = ['X', 'Y', 'Z'];

/** Input pins FluidNC reports as triggered (Pn:), and how they are called here. */
const INPUTS = [
  ['X', 'drive.inputX'],
  ['Y', 'drive.inputY'],
  ['Z', 'drive.inputZ'],
  ['P', 'drive.inputProbe'],
] as const;

/** The inputs FluidNC reports as triggered, live: end stops and the probe. */
function Inputs() {
  const pins = useMachine((s) => s.status?.pins ?? '');
  return (
    <div className="inputs" data-testid="inputs" aria-label={t('drive.inputsLabel')}>
      <span className="text-muted-foreground text-sm">{t('drive.inputsLabel')}</span>
      {INPUTS.map(([pin, label]) => (
        <span key={pin} className={`input-led${pins.includes(pin) ? ' on' : ''}`}>
          <span className="chip-led" aria-hidden="true" />
          {t(label)}
          <span className="sr-only">
            {pins.includes(pin) ? t('drive.inputOn') : t('drive.inputOff')}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Service: the live state of end stops and inputs, to test a switch by hand. */
export function InputsCard() {
  return (
    <Card className="gap-3 p-4" data-find="inputs">
      <CardTitle render={<h2 />}>{t('drive.inputsLabel')}</CardTitle>
      <Inputs />
      <p className="text-muted-foreground text-sm">{t('drive.inputsHint')}</p>
    </Card>
  );
}

/** Single axes, unlocking and the live state of the end stops and inputs ("Mehr Optionen" of the jog panel). */
export function HomingCard() {
  const online = useMachine((s) => s.connection === 'connected');
  const { homeAxis, command, feedHold, cycleStart } = useMachine.getState();
  const reason = online ? null : t('jog.reason.offline');
  return (
    <Card className="gap-3 p-4" data-find="homing">
      <CardTitle render={<h2 />}>{t('jog.more.homing')}</CardTitle>
      <Inputs />
      <p className="text-muted-foreground text-sm">{t('drive.inputsHint')}</p>
      <Reason reason={reason} className="w-full">
        <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
          {HOME_AXES.map((axis) => (
            <HoldButton key={axis} disabled={!online} onConfirm={() => homeAxis(axis)}>
              {t('drive.homeAxis', { axis })}
            </HoldButton>
          ))}
        </div>
      </Reason>
      <Reason reason={reason} className="w-full">
        <HoldButton disabled={!online} onConfirm={() => command('$X')}>
          {t('drive.unlock')}
        </HoldButton>
      </Reason>
      <Reason reason={reason} className="w-full">
        <div className="flex w-full gap-3">
          <Button
            reason="machine"
            variant="outline"
            className="flex-1"
            disabled={!online}
            onClick={feedHold}
          >
            {t('drive.feedHold')}
          </Button>
          <Button
            reason="machine"
            variant="outline"
            className="flex-1"
            disabled={!online}
            onClick={cycleStart}
          >
            {t('drive.resume')}
          </Button>
        </div>
      </Reason>
    </Card>
  );
}
