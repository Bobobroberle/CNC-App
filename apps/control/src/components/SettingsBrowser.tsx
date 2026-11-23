import { groupSettings, isRiskySetting, type SettingEntry } from '@lowrider/fluidnc-client';
import { useMemo, useState } from 'react';
import { hasKey, t, tDynamic } from '../i18n';
import { useMachine } from '../store/machine';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Fold } from './Fold';

const helpKey = (key: string) => `settingsHelp.${key.replace(/^\//, '').replace(/\//g, '_')}`;

/** The controller's `$` settings with plain-language explanations. */
export function SettingsBrowser() {
  const connected = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.status?.state === 'Idle');
  const { readSettings, command } = useMachine.getState();
  const [entries, setEntries] = useState<SettingEntry[] | null>(null);
  const [filter, setFilter] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = (entries ?? []).filter(
      (e) =>
        f === '' ||
        e.key.toLowerCase().includes(f) ||
        tDynamic(helpKey(e.key), 'settingsHelp.unknown').toLowerCase().includes(f),
    );
    return [...groupSettings(list).entries()];
  }, [entries, filter]);

  const write = async (key: string) => {
    const value = edits[key];
    if (value === undefined) return;
    if (await command(`$${key}=${value}`)) {
      setEntries((list) => list?.map((e) => (e.key === key ? { ...e, value } : e)) ?? null);
      setEdits(({ [key]: _, ...rest }) => rest);
    }
  };

  return (
    <Fold
      variant="card"
      title={t('settingsBrowser.title')}
      testId="settings-browser"
      find="settings-browser"
    >
      <p className="text-muted-foreground text-sm">{t('settingsBrowser.intro')}</p>
      <Button
        reason="machine"
        variant="outline"
        disabled={!connected}
        onClick={() => void readSettings().then(setEntries)}
      >
        {t('settingsBrowser.load')}
      </Button>
      {entries ? (
        <>
          <Field>
            <FieldLabel>{t('settingsBrowser.filter')}</FieldLabel>
            <Input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </Field>
          {groups.map(([group, list]) => (
            <div key={group}>
              <h3 className="font-medium text-muted-foreground text-sm">{group}</h3>
              <ul className="parts">
                {list.map((e) => {
                  const edited = edits[e.key];
                  const risky = isRiskySetting(e.key);
                  return (
                    <li key={e.key} className="part">
                      <div>
                        <code>${e.key}</code>
                        <div className="text-muted-foreground text-sm">
                          {hasKey(helpKey(e.key))
                            ? tDynamic(helpKey(e.key), 'settingsHelp.unknown')
                            : t('settingsHelp.unknown')}
                        </div>
                      </div>
                      <Field>
                        <FieldLabel>{t('settingsBrowser.value')}</FieldLabel>
                        <Input
                          type="text"
                          value={edited ?? e.value}
                          spellCheck={false}
                          onChange={(ev) => setEdits({ ...edits, [e.key]: ev.target.value })}
                        />
                      </Field>
                      {edited !== undefined && edited !== e.value ? (
                        risky ? (
                          <>
                            <Alert variant="warning">{t('settingsBrowser.risky')}</Alert>
                            <HoldButton
                              variant="danger"
                              disabled={!idle}
                              onConfirm={() => void write(e.key)}
                            >
                              {t('settingsBrowser.write')}
                            </HoldButton>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            reason="machine"
                            disabled={!idle}
                            onClick={() => void write(e.key)}
                          >
                            {t('settingsBrowser.write')}
                          </Button>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      ) : null}
    </Fold>
  );
}
