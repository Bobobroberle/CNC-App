import { resumeFrom } from '@lowrider/gcode-core';
import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { downloadText } from '../lib/download';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useTrack } from '../store/track';
import { safeMachineZ, useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Fold } from './Fold';

/** Continue an aborted job at line N with the modal state of that line restored. */
export function ResumeCard() {
  const fileName = useJob((s) => s.fileName);
  const lines = useJob((s) => s.lines);
  const zMax = useJob((s) => s.profile.travel.z.max);
  const settings = useWorkshop((s) => s.settings);
  const trackedLine = useTrack((s) => s.lineIndex);
  const lastStreamed = useMachine((s) => s.stream?.progress.lastAcknowledgedSource ?? null);
  const ready = useMachine(
    (s) =>
      s.connection === 'connected' &&
      s.status?.state === 'Idle' &&
      s.fileJob === null &&
      s.stream?.result !== 'running',
  );
  const homed = useMachine((s) => s.homed);
  const { streamJob } = useMachine.getState();
  const suggestion = (lastStreamed ?? trackedLine ?? 0) + 1;
  const [lineText, setLineText] = useState('');
  const line = Number(lineText || suggestion);

  const result = useMemo(() => {
    if (!fileName || !Number.isInteger(line) || line < 1 || line > lines.length) return null;
    try {
      return resumeFrom(lines.join('\n'), line - 1, {
        safeMachineZ: safeMachineZ(settings, zMax),
      });
    } catch {
      return null;
    }
  }, [fileName, lines, line, settings, zMax]);

  if (!fileName) return null;
  const preview = result?.text.split('\n').slice(0, 12) ?? [];
  const name = `${fileName.replace(/\.[^.]*$/, '')}_ab${line}.nc`;

  return (
    <Fold variant="card" title={t('resume.title')} testId="resume-card" find="resume">
      <p className="text-muted-foreground text-sm">{t('resume.hint')}</p>
      <Field>
        <FieldLabel>{t('resume.line', { max: lines.length })}</FieldLabel>
        <Input
          type="text"
          inputMode="numeric"
          placeholder={String(suggestion)}
          value={lineText}
          onChange={(e) => setLineText(e.target.value.replace(/\D/g, ''))}
        />
      </Field>
      {result === null ? <Alert variant="warning">{t('resume.invalid')}</Alert> : null}
      {result?.warnings.map((w, i) => (
        <Alert key={i} variant="warning">
          {t('resume.warning', { text: w.message })}
        </Alert>
      ))}
      {!homed ? <Alert variant="warning">{t('resume.needsHoming')}</Alert> : null}
      {result ? <pre className="config-text">{preview.join('\n')}</pre> : null}
      <div className="flex gap-3">
        <Button
          reason="missing"
          variant="outline"
          className="flex-1"
          disabled={!result}
          onClick={() => result && downloadText(name, result.text)}
        >
          {t('files.download')}
        </Button>
      </div>
      <HoldButton
        variant="accent"
        duration={1000}
        disabled={!result || !ready || !homed}
        onConfirm={() => result && streamJob(name, result.text)}
      >
        {t('resume.start', { line })}
      </HoldButton>
    </Fold>
  );
}
