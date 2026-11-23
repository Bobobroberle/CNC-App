import { useMemo, useState } from 'react';
import { t, tDynamic } from '../i18n';
import { checkConfig } from '../lib/configCheck';
import { compactDiff, lineDiff } from '../lib/diff';
import { downloadText } from '../lib/download';
import { useMachine } from '../store/machine';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Fold } from './Fold';

/**
 * The whole config.yaml as text: edit, check, compare with the controller's
 * file, then write it with a backup next to it and restart.
 */
export function ConfigFileEditor() {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const connected = useMachine((s) => s.connection === 'connected');
  const { readConfigFile, uploadConfigFile, command } = useMachine.getState();
  const [original, setOriginal] = useState<{ name: string; text: string } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const issues = useMemo(() => (original ? checkConfig(text) : []), [original, text]);
  const errors = issues.filter((i) => i.severity === 'error');
  const diff = useMemo(
    () => (original ? compactDiff(lineDiff(original.text, text)) : []),
    [original, text],
  );
  const changed = original !== null && original.text !== text;

  const load = async () => {
    const file = await readConfigFile();
    setOriginal(file);
    setText(file?.text ?? '');
  };

  return (
    <Fold
      variant="card"
      title={t('configFile.title')}
      testId="config-file-editor"
      find="config-file"
    >
      <p className="text-muted-foreground text-sm">{t('configFile.intro')}</p>
      <Button reason="machine" variant="outline" disabled={!idle} onClick={() => void load()}>
        {t('config.load')}
      </Button>
      {original ? (
        <>
          <p className="text-muted-foreground text-sm">
            {t('configFile.file', { name: original.name })}{' '}
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadText(original.name, original.text)}
            >
              {t('config.download')}
            </Button>
          </p>
          <Textarea
            className="code"
            spellCheck={false}
            value={text}
            aria-label={t('configFile.title')}
            onChange={(e) => setText(e.target.value)}
          />
          {issues.length === 0 ? (
            <p className="text-success-foreground">{t('configFile.valid')}</p>
          ) : (
            <ul className="diagnostics" data-testid="config-issues">
              {issues.map((i, n) => (
                <li key={n} className={i.severity}>
                  {i.line > 0 ? <span className="tabular-nums">{i.line}</span> : null}{' '}
                  {tDynamic(`configFile.issue.${i.code}`, 'configFile.issue.syntax', {
                    detail: i.detail,
                  })}
                </li>
              ))}
            </ul>
          )}
          {changed ? (
            <>
              <h3 className="font-medium text-muted-foreground text-sm">{t('configFile.diff')}</h3>
              <pre className="diff" data-testid="config-diff">
                {diff.map((d, n) =>
                  d === null ? (
                    <span key={n}>…{'\n'}</span>
                  ) : (
                    <span key={n} className={d.kind === 'same' ? '' : d.kind}>
                      {d.kind === 'add' ? '+ ' : d.kind === 'del' ? '− ' : '  '}
                      {d.text}
                      {'\n'}
                    </span>
                  ),
                )}
              </pre>
            </>
          ) : null}
          <HoldButton
            variant="accent"
            duration={1200}
            disabled={!idle || !changed || errors.length > 0 || busy}
            onConfirm={() => {
              setBusy(true);
              void uploadConfigFile(original.name, text, original.text).then((backup) => {
                setBusy(false);
                if (backup) setOriginal({ name: original.name, text });
              });
            }}
          >
            {t('configFile.upload')}
          </HoldButton>
          {errors.length > 0 ? <Alert variant="error">{t('configFile.blocked')}</Alert> : null}
          <p className="text-muted-foreground text-sm">{t('configFile.restartHint')}</p>
        </>
      ) : null}
      <HoldButton disabled={!connected} onConfirm={() => void command('$Bye')}>
        {t('config.restart')}
      </HoldButton>
    </Fold>
  );
}
