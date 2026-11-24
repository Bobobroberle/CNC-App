import { readMachineConfig } from '@lowrider/fluidnc-client';
import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { parseNumber } from '../lib/format';
import { configChanges, draftFromConfig, type Axis3, type ConfigDraft } from '../lib/configChanges';
import { downloadText } from '../lib/download';
import { settingsFromConfig } from '../lib/profile';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useMeasurements } from '../store/measurements';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Fold } from './Fold';

const AXES: Axis3[] = ['x', 'y', 'z'];

/** Changes the important config.yaml items at runtime, with a backup first. */
export function ConfigEditor() {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const connected = useMachine((s) => s.connection === 'connected');
  const { readConfigFile, readConfig, applyConfigChanges, command } = useMachine.getState();
  const profile = useJob((s) => s.profile);
  const setProfileSettings = useJob((s) => s.setProfileSettings);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const config = useMemo(() => (file ? readMachineConfig(file.text) : null), [file]);
  const [draft, setDraft] = useState<ConfigDraft | null>(null);
  const [travelText, setTravelText] = useState<Record<Axis3, string>>({ x: '', y: '', z: '' });
  useEffect(() => {
    if (!config) return;
    const d = draftFromConfig(config);
    setDraft(d);
    setTravelText({ x: String(d.maxTravel.x), y: String(d.maxTravel.y), z: String(d.maxTravel.z) });
  }, [config]);

  const effective = draft && {
    ...draft,
    maxTravel: {
      x: parseNumber(travelText.x),
      y: parseNumber(travelText.y),
      z: parseNumber(travelText.z),
    },
  };
  const changes = config && effective ? configChanges(config, effective) : null;

  const reload = async () => setFile(await readConfigFile());

  const apply = async () => {
    if (!changes || changes.length === 0) return;
    if (!(await applyConfigChanges(changes))) return;
    // The only trace of a change to the controller: what was there, what was written
    useMeasurements.getState().record(
      'correction',
      Object.fromEntries(
        changes.flatMap((c) => [
          [`${c.path}.from`, c.from ?? null],
          [`${c.path}.to`, c.value],
        ]),
      ),
    );
    await reload();
    // The profile follows the controller: travel, speeds, soft limits.
    const dump = await readConfig();
    const settings = dump === null ? null : settingsFromConfig(readMachineConfig(dump), profile);
    if (settings) setProfileSettings(settings);
  };

  return (
    <Card className="gap-3 p-4" data-testid="config-editor" data-find="config-editor">
      <CardTitle render={<h2 />}>{t('config.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('config.intro')}</p>
      <Button reason="machine" variant="outline" disabled={!idle} onClick={() => void reload()}>
        {t('config.load')}
      </Button>
      {!file || !draft ? (
        <p className="text-muted-foreground text-sm">{t('config.notLoaded')}</p>
      ) : (
        <>
          <Button variant="outline" onClick={() => downloadText(file.name, file.text)}>
            {t('config.download')} ({file.name})
          </Button>
          <Alert variant="warning">{t('config.commentsLost')}</Alert>
          <Label className="min-h-target gap-3 font-normal">
            <Checkbox
              checked={draft.softLimits}
              onCheckedChange={(checked) => setDraft({ ...draft, softLimits: checked })}
            />
            <span>{t('config.softLimits')}</span>
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {AXES.map((a) => (
              <Field key={a}>
                <FieldLabel>{t('config.maxTravel', { axis: a.toUpperCase() })}</FieldLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={travelText[a]}
                  onChange={(e) => setTravelText({ ...travelText, [a]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <Label className="min-h-target gap-3 font-normal">
            <Checkbox
              checked={draft.useLineNumbers}
              onCheckedChange={(checked) => setDraft({ ...draft, useLineNumbers: checked })}
            />
            <span>{t('config.lineNumbers')}</span>
          </Label>
          <Label className="min-h-target gap-3 font-normal">
            <Checkbox
              checked={draft.mustHome}
              onCheckedChange={(checked) => setDraft({ ...draft, mustHome: checked })}
            />
            <span>{t('config.mustHome')}</span>
          </Label>
          {changes === null ? (
            <Alert variant="warning">{t('machine.invalid')}</Alert>
          ) : changes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('config.none')}</p>
          ) : (
            <>
              <p>{t('config.changes', { count: changes.length })}</p>
              <ul className="diagnostics" data-testid="config-changes">
                {changes.map((c) => (
                  <li key={c.path}>
                    <code>
                      {c.path} = {c.value}
                    </code>
                  </li>
                ))}
              </ul>
            </>
          )}
          <HoldButton
            variant="accent"
            disabled={!idle || !changes || changes.length === 0}
            onConfirm={() => void apply()}
          >
            {t('config.apply')}
          </HoldButton>
          <Fold title={t('config.view')}>
            <pre className="config-text">{file.text}</pre>
          </Fold>
        </>
      )}
      <HoldButton disabled={!connected} onConfirm={() => void command('$Bye')}>
        {t('config.restart')}
      </HoldButton>
    </Card>
  );
}
