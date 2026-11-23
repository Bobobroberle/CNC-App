import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { downloadText } from '../lib/download';
import { formatDuration, formatNumber } from '../lib/format';
import { prepareJob } from '../lib/prepare';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';

type UploadState = 'idle' | 'busy' | 'ok' | 'failed';

/** Repairs the loaded job for FluidNC, splits it per tool and puts it on the SD card. */
export function PrepareCard() {
  const fileName = useJob((s) => s.fileName);
  const lines = useJob((s) => s.lines);
  const kinematics = useJob((s) => s.profile.kinematics);
  const setPreparedParts = useJob((s) => s.setPreparedParts);
  const connected = useMachine((s) => s.connection === 'connected');
  const busyMachine = useMachine((s) => s.fileJob !== null);
  const uploadToSd = useMachine((s) => s.uploadToSd);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});

  const prepared = useMemo(
    () => (fileName ? prepareJob(lines.join('\n'), fileName, kinematics) : null),
    [fileName, lines, kinematics],
  );
  useEffect(() => {
    if (prepared) setPreparedParts(prepared.parts);
    setUploads({});
  }, [prepared, setPreparedParts]);

  if (!prepared) return null;
  const { parts, repairedLines } = prepared;
  const unchanged = repairedLines.length === 0 && parts.length === 1;

  return (
    <Card className="gap-3 p-4" data-testid="prepare-card" data-find="upload">
      <CardTitle render={<h2 />}>{t('files.title')}</CardTitle>
      {repairedLines.length > 0 ? (
        <Alert variant="warning">{t('files.repaired', { count: repairedLines.length })}</Alert>
      ) : null}
      {parts.length > 1 ? (
        <Alert variant="warning">{t('files.split', { count: parts.length })}</Alert>
      ) : null}
      {unchanged ? <p className="text-success-foreground">{t('files.ready')}</p> : null}
      <ul className="parts">
        {parts.map((part) => {
          const state = uploads[part.fileName] ?? 'idle';
          return (
            <li key={part.fileName} className="part">
              <div>
                <strong>
                  {t('files.part', { n: part.number })}
                  {part.tool !== undefined ? ` · ${t('files.tool', { tool: part.tool })}` : ''}
                </strong>
                <div className="text-muted-foreground text-sm">
                  <code>{part.fileName}</code> ·{' '}
                  {t('files.partInfo', {
                    lines: formatNumber(part.lineCount),
                    time: formatDuration(part.seconds),
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => downloadText(part.fileName, part.text)}
                >
                  {t('files.download')}
                </Button>
                <Button
                  reason="machine"
                  className="flex-1"
                  disabled={!connected || busyMachine || state === 'busy' || part.errors > 0}
                  onClick={() => {
                    setUploads((u) => ({ ...u, [part.fileName]: 'busy' }));
                    void uploadToSd(part.fileName, part.text).then((ok) =>
                      setUploads((u) => ({ ...u, [part.fileName]: ok ? 'ok' : 'failed' })),
                    );
                  }}
                >
                  {state === 'busy' ? t('files.uploading') : t('files.upload')}
                  {state === 'ok' ? ' ✓' : state === 'failed' ? ' ✗' : ''}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
