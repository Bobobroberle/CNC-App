import { alarmName } from '@lowrider/fluidnc-client';
import { t, tDynamic } from '../i18n';
import { useMachine } from '../store/machine';
import { HoldButton } from './HoldButton';

export function AlarmBanner() {
  const alarm = useMachine((s) => s.alarm);
  const inAlarm = useMachine((s) => s.status?.state === 'Alarm');
  const command = useMachine((s) => s.command);
  if (alarm === null && !inAlarm) return null;
  const name = alarm === null ? 'Unknown' : alarmName(alarm);
  return (
    <div className="alarm" role="alert">
      <div className="alarm-text">
        <strong>{alarm === null ? t('state.Alarm') : t('alarm.title', { code: alarm })}</strong>
        <p>{tDynamic(`alarm.${name}.text`, 'alarm.Unknown.text')}</p>
        <p className="alarm-action">{tDynamic(`alarm.${name}.action`, 'alarm.Unknown.action')}</p>
      </div>
      <HoldButton variant="danger" onConfirm={() => command('$X')}>
        {t('alarm.unlock')}
      </HoldButton>
    </div>
  );
}
