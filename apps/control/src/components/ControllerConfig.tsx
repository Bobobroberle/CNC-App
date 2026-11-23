import { readMachineConfig } from '@lowrider/fluidnc-client';
import { useRef } from 'react';
import { t } from '../i18n';
import { readJobFile } from '../lib/files';
import { settingsFromConfig } from '../lib/profile';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { AckMark, useAck } from './Ack';

/** Takes travel, speeds and controller behaviour from FluidNC's config.yaml. */
export function ControllerConfig() {
  const profile = useJob((s) => s.profile);
  const setProfileSettings = useJob((s) => s.setProfileSettings);
  const connected = useMachine((s) => s.connection === 'connected');
  const { addLog, readConfig } = useMachine.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const { controller } = profile;

  const ack = useAck();
  const apply = (yaml: string | null) => {
    const settings = yaml === null ? null : settingsFromConfig(readMachineConfig(yaml), profile);
    if (!settings) {
      addLog('error', t('machine.configInvalid'), 'machine.configInvalid');
      return false;
    }
    setProfileSettings(settings);
    addLog('info', t('machine.configImported'));
    return true;
  };

  return (
    <Card className="gap-3 p-4" data-testid="controller-config" data-find="controller-config">
      <CardTitle render={<h2 />}>{t('machine.configTitle')}</CardTitle>
      <p className="text-muted-foreground text-sm">
        {t('machine.configSource', { source: controller.source })}
      </p>
      <Alert variant={controller.softLimits ? 'success' : 'warning'}>
        {t(controller.softLimits ? 'machine.configSoftLimitsOn' : 'machine.configSoftLimitsOff')}
      </Alert>
      {!controller.toolChangeHandled ? (
        <Alert variant="warning">{t('machine.configNoToolChange')}</Alert>
      ) : null}
      {!controller.useLineNumbers ? (
        <p className="text-muted-foreground text-sm">{t('machine.configNoLineNumbers')}</p>
      ) : null}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => fileInput.current?.click()}>
          {t('machine.configImport')}
        </Button>
        <Button
          reason="machine"
          variant="outline"
          className="flex-1"
          disabled={!connected}
          onClick={() => void ack.run(() => readConfig().then(apply))}
        >
          {t('machine.configRead')}
          <AckMark state={ack.state} />
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".yaml,.yml,.txt"
        hidden
        data-testid="config-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void readJobFile(file).then(apply);
          e.target.value = '';
        }}
      />
    </Card>
  );
}
