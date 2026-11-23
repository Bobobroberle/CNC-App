import { useState } from 'react';
import { t } from '../i18n';
import { parseNumber } from '../lib/format';
import { useMachine } from '../store/machine';
import { notify } from '../store/notify';
import { useSensors } from '../store/sensors';
import { companion, useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const num = (s: string) => parseNumber(s);

/** Notifications to the phone and the adaptive feed. */
export function NotifySettingsCard() {
  const settings = useWorkshop((s) => s.settings);
  const { setSettings } = useWorkshop.getState();
  const addLog = useMachine((s) => s.addLog);
  const sensors = useSensors((s) => s.connected);
  const [ntfy, setNtfy] = useState('');
  const [target, setTarget] = useState(String(settings.adaptive.targetLoad));
  const [maxOverride, setMaxOverride] = useState(String(settings.adaptive.maxOverride));
  const browserSupported = typeof Notification !== 'undefined';

  return (
    <Card className="gap-3 p-4" data-testid="notify-settings" data-find="notify">
      <CardTitle render={<h2 />}>{t('notify.title')}</CardTitle>
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={settings.notifyBrowser}
          disabled={!browserSupported}
          onCheckedChange={(checked) => {
            const on = checked;
            setSettings({ notifyBrowser: on });
            if (on && Notification.permission === 'default') void Notification.requestPermission();
          }}
        />
        <span>{t('notify.browser')}</span>
      </Label>
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={settings.notifyCompanion}
          disabled={!settings.companionUrl}
          onCheckedChange={(checked) => setSettings({ notifyCompanion: checked })}
        />
        <span>{t('notify.companion')}</span>
      </Label>
      {settings.notifyCompanion ? (
        <>
          <Field>
            <FieldLabel>{t('notify.ntfyUrl')}</FieldLabel>
            <Input
              type="text"
              inputMode="url"
              spellCheck={false}
              placeholder="http://lowrider.local:8090/lowrider"
              value={ntfy}
              onChange={(e) => setNtfy(e.target.value)}
            />
          </Field>
          <Button
            reason="missing"
            variant="outline"
            disabled={!/^https?:\/\//.test(ntfy.trim())}
            onClick={() =>
              void companion()
                ?.setNotifySettings({
                  kind: 'ntfy',
                  url: ntfy.trim(),
                  events: ['job-done', 'job-failed', 'alarm', 'tool-change'],
                })
                .then(() => addLog('info', t('notify.saved')))
                .catch(() => addLog('error', t('companion.offline'), 'companion.offline'))
            }
          >
            {t('notify.saveNtfy')}
          </Button>
        </>
      ) : null}
      <Button
        variant="outline"
        onClick={() => void notify('test', t('notify.testTitle'), t('notify.testText'))}
      >
        {t('notify.test')}
      </Button>

      <h3 className="font-medium text-muted-foreground text-sm" data-find="adaptive">
        {t('sensors.adaptiveTitle')}
      </h3>
      <p className="text-muted-foreground text-sm">
        {sensors ? t('sensors.connected') : t('sensors.notConnected')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel>{t('sensors.target')}</FieldLabel>
          <Input
            type="text"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t('sensors.maxOverride')}</FieldLabel>
          <Input
            type="text"
            inputMode="numeric"
            value={maxOverride}
            onChange={(e) => setMaxOverride(e.target.value)}
          />
        </Field>
      </div>
      <Button
        reason="missing"
        variant="outline"
        disabled={
          !(
            num(target) > 0 &&
            num(target) <= 100 &&
            num(maxOverride) >= 100 &&
            num(maxOverride) <= 200
          )
        }
        onClick={() => {
          setSettings({
            adaptive: {
              ...settings.adaptive,
              targetLoad: num(target),
              maxOverride: num(maxOverride),
            },
          });
          addLog('info', t('workshop.saved'));
        }}
      >
        {t('machine.apply')}
      </Button>
    </Card>
  );
}
