import { ensureModalPreamble, removeToolLengthTable } from '@lowrider/gcode-core';
import { useMemo } from 'react';
import { t } from '../i18n';
import { blockers } from '../lib/readiness';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useReadiness } from '../store/readiness';
import { useRecent } from '../store/recent';
import { companion } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Icon } from './Icon';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { useBetweenParts } from '../store/runView';

/**
 * Streaming the loaded job from the iPad: the app sends it line by line and
 * holds at every tool change; single block sends one line per tap. Needs a
 * steady connection for the whole job, so the SD card is the default.
 */
export function RunCard() {
  const analysis = useJob((s) => s.analysis);
  const fileName = useJob((s) => s.fileName);
  const lines = useJob((s) => s.lines);
  const connected = useMachine((s) => s.connection === 'connected');
  const idle = useMachine((s) => s.status?.state === 'Idle');
  const singleStep = useMachine((s) => s.singleStep);
  const busy = useMachine((s) => s.fileJob !== null || s.stream?.result === 'running');
  const { streamJob, addLog, setSingleStep } = useMachine.getState();
  const readiness = useReadiness();
  // Between two parts the next one starts in the tool change card (its lock, its confirmation)
  const between = useBetweenParts();

  const text = useMemo(
    () => ensureModalPreamble(removeToolLengthTable(lines.join('\n')).text).text,
    [lines],
  );

  if (!analysis || !fileName) return null;
  const toolChanges = analysis.events.filter((e) => e.kind === 'toolChange').length;
  const blocked = readiness ? blockers(readiness.items).length > 0 : true;
  const ready = connected && idle && !busy;
  const c = companion();

  return (
    <Card className="gap-3 p-4" data-testid="run-card" data-find="stream">
      <CardTitle render={<h2 />}>{t('runPanel.stream')}</CardTitle>
      {toolChanges > 0 ? (
        <Alert variant="warning">{t('run.toolChanges', { count: toolChanges })}</Alert>
      ) : null}
      <div className="start-row">
        <HoldButton
          variant="go"
          duration={1000}
          disabled={!ready || blocked || between}
          reason={between ? t('run5.waitingInPanel') : undefined}
          onConfirm={() => {
            useRecent.getState().rememberZero();
            streamJob(fileName, text);
          }}
        >
          <span className="with-icon">
            <Icon name="play" /> {t('run.stream')}
          </span>
        </HoldButton>
        <Button
          variant="outline"
          className="flex-col gap-0.5 px-2"
          pressed={singleStep}
          onClick={() => setSingleStep(!singleStep)}
        >
          <Icon name="step" /> {t('run.singleStep')}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {singleStep ? t('run.singleStepHint') : t('run.streamHint')}
      </p>
      {c ? (
        <Button
          variant="outline"
          onClick={() =>
            void c
              .saveJob(fileName, text)
              .then(() => addLog('info', t('run.savedCompanion', { name: fileName })))
              .catch(() => addLog('error', t('companion.offline'), 'companion.offline'))
          }
        >
          {t('run.saveCompanion')}
        </Button>
      ) : null}
    </Card>
  );
}
