import { toolLengthOffsetCommand, toolLengthRoutine } from '@lowrider/workshop';
import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Card, CardTitle } from '../ui/card';
import { Reason } from '../ui/tooltip';

/** The streamed job holds at M6: spindle off, tool up, change, measure, continue. */
export function ToolChangeCard() {
  const change = useMachine((s) => s.stream?.toolChange ?? null);
  const { continueAfterToolChange, stopJob } = useMachine.getState();
  if (!change) return null;
  return (
    <ToolChangePanel
      tool={change.tool}
      line={change.line}
      continueLabel={t('toolChange.continue')}
      onContinue={continueAfterToolChange}
      abortLabel={t('toolChange.abort')}
      onAbort={() => void stopJob()}
      lengthOffset
    />
  );
}

/**
 * The tool change itself, for a streamed job held at M6 and between the
 * SD parts of a multi-tool job: shows the next tool, measures it (tool
 * length sensor or touch plate) and continues on a hold.
 */
export function ToolChangePanel({
  tool: toolNumber,
  line,
  continueLabel,
  onContinue,
  abortLabel,
  onAbort,
  lengthOffset,
  continueReason = null,
}: {
  tool: number | null | undefined;
  line?: number;
  continueLabel: string;
  onContinue: () => Promise<unknown>;
  abortLabel: string;
  onAbort: () => void;
  /** The tool length sensor applies G43.1; off where the program would cancel it (G49) */
  lengthOffset: boolean;
  /** Why going on is locked (the start lock of the readiness list), or null */
  continueReason?: string | null;
}) {
  const idle = useMachine((s) => s.status?.state === 'Idle');
  const { runProbeRoutine, probeZ, command, addLog } = useMachine.getState();
  const tools = useWorkshop((s) => s.tools);
  const setter = useWorkshop((s) => s.settings.toolSetter);
  const reference = useWorkshop((s) => s.toolReferenceZ);
  const probe = useJob((s) => s.profile.probe);
  const [measured, setMeasured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tool = tools.find((x) => x.number === toolNumber);

  const measureSetter = async () => {
    if (!setter || reference === null) return;
    setBusy(true);
    const r = await runProbeRoutine(
      toolLengthRoutine(
        {
          feed: probe.feed,
          maxTravel: probe.maxTravel,
          retract: 2,
          toolDiameter: tool?.diameter ?? 6,
        },
        setter,
      ),
    );
    if (r?.z !== undefined) {
      const cmd = toolLengthOffsetCommand(reference, r.z);
      if (await command(cmd)) {
        setMeasured(cmd);
        addLog('info', t('probeWizard.tloApplied', { cmd }));
      }
    }
    setBusy(false);
  };

  return (
    <Card
      className="gap-3 p-4 toolchange"
      role="alertdialog"
      aria-label={t('toolChange.title')}
      data-testid="tool-change"
    >
      <CardTitle render={<h2 />}>{t('toolChange.title')}</CardTitle>
      <div className="flex gap-3">
        {tool?.image ? <img className="thumb large" src={tool.image} alt="" /> : null}
        <div>
          <p className="font-semibold text-3xl">T{toolNumber ?? '?'}</p>
          <p>
            {tool
              ? `${tool.name} · Ø ${formatNumber(tool.diameter, 1)} mm`
              : t('toolChange.unknownTool')}
          </p>
          {line !== undefined ? (
            <p className="text-muted-foreground text-sm">
              {t('toolChange.line', { line: line + 1 })}
            </p>
          ) : null}
        </div>
      </div>
      <ol className="steps">
        <li>{t('toolChange.step1')}</li>
        <li>{t('toolChange.step2')}</li>
        <li>{t('toolChange.step3')}</li>
      </ol>
      {setter && reference !== null && lengthOffset ? (
        <HoldButton disabled={!idle || busy} onConfirm={() => void measureSetter()}>
          {t('toolChange.measureSetter')}
        </HoldButton>
      ) : null}
      <HoldButton
        disabled={!idle || busy}
        onConfirm={() => {
          setBusy(true);
          void probeZ().then((ok) => {
            setBusy(false);
            if (ok) setMeasured('Z');
          });
        }}
      >
        {t('toolChange.probePlate')}
      </HoldButton>
      <p className="text-muted-foreground text-sm">{t('toolChange.plateHint')}</p>
      {measured ? <Alert variant="success">{t('toolChange.measured')}</Alert> : null}
      <Reason reason={continueReason} className="block w-full">
        <HoldButton
          variant="accent"
          disabled={!idle || busy || continueReason !== null}
          onConfirm={() => void onContinue().then(() => setMeasured(null))}
        >
          {continueLabel}
        </HoldButton>
      </Reason>
      <HoldButton variant="danger" onConfirm={onAbort}>
        {abortLabel}
      </HoldButton>
    </Card>
  );
}
