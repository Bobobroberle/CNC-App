import { useEffect, useMemo } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { travelViolations } from '../lib/workspace';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

/** Files on the SD card; starting one loads its prepared part for live tracking. */
export function SdCard() {
  const connected = useMachine((s) => s.connection === 'connected');
  const files = useMachine((s) => s.sdFiles);
  const fileJob = useMachine((s) => s.fileJob);
  const homed = useMachine((s) => s.homed);
  const idle = useMachine((s) => s.status?.state === 'Idle');
  const wcoKey = useMachine((s) => s.status?.wco.join(',') ?? null);
  const mposKey = useMachine((s) => s.status?.mpos.map((v) => Math.round(v)).join(',') ?? null);
  const { refreshSdFiles, runSdFile } = useMachine.getState();
  const preparedParts = useJob((s) => s.preparedParts);
  const profile = useJob((s) => s.profile);
  const load = useJob((s) => s.load);

  useEffect(() => {
    if (connected) void refreshSdFiles();
  }, [connected, refreshSdFiles]);

  // Parts that must not start: errors left, or the travel would be left from here.
  const blockedNames = useMemo(() => {
    const blocked = new Set<string>();
    if (wcoKey === null || mposKey === null) return blocked;
    const numbers = (key: string) => key.split(',').map(Number);
    for (const part of preparedParts) {
      const outside =
        travelViolations(part.text, profile, numbers(wcoKey), numbers(mposKey)).length > 0;
      if (part.errors > 0 || outside) blocked.add(part.fileName);
    }
    return blocked;
  }, [preparedParts, profile, wcoKey, mposKey]);

  if (!connected) return null;

  return (
    <Card className="gap-3 p-4" data-testid="sd-card" data-find="sd-card">
      <div className="flex gap-3 justify-between">
        <h2>{t('files.sd')}</h2>
        <Button
          reason="machine"
          variant="outline"
          disabled={fileJob !== null}
          onClick={() => void refreshSdFiles()}
        >
          {t('files.refresh')}
        </Button>
      </div>
      {!homed ? <Alert variant="warning">{t('files.notHomed')}</Alert> : null}
      {files !== null && files.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('files.empty')}</p>
      ) : null}
      <ul className="parts">
        {(files ?? []).map((file) => {
          const part = preparedParts.find((p) => p.fileName === file.name);
          const blocked = blockedNames.has(file.name);
          return (
            <li key={file.name} className="part">
              <div>
                <code>{file.name}</code>
                <div className="text-muted-foreground text-sm">
                  {formatNumber(file.size / 1024, 0)} KB
                  {part === undefined ? ` · ${t('files.unchecked')}` : ''}
                </div>
                {blocked ? <Alert variant="error">{t('files.blocked')}</Alert> : null}
              </div>
              <HoldButton
                variant="accent"
                disabled={!idle || fileJob !== null || blocked}
                onConfirm={() => {
                  if (part) load(part.fileName, part.text);
                  void runSdFile(file.name);
                }}
              >
                {t('files.start')}
              </HoldButton>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
